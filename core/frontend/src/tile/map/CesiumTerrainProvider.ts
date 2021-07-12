/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tiles
 */
import { assert, BeDuration, BeTimePoint, ByteStream, ClientRequestContext, Id64String, JsonUtils, utf8ToString } from "@bentley/bentleyjs-core";
import { Point2d, Point3d, Range1d, Vector3d } from "@bentley/geometry-core";
import { nextPoint3d64FromByteStream, OctEncodedNormal, QParams3d, QPoint2d } from "@bentley/imodeljs-common";
import { request, RequestOptions, Response } from "@bentley/itwin-client";
import { ApproximateTerrainHeights } from "../../ApproximateTerrainHeights";
import { IModelApp } from "../../IModelApp";
import { IModelConnection } from "../../IModelConnection";
import { TerrainMeshPrimitive } from "../../render/primitives/mesh/TerrainMeshPrimitive";
import { GeographicTilingScheme, MapCartoRectangle, MapTilingScheme, TerrainMeshProvider, TileAvailability } from "../internal";
import { Tile } from "../Tile";
import { MapTile, MapTileProjection } from "./MapTile";
import { QuadId } from "./QuadId";

/** @internal */
enum QuantizedMeshExtensionIds {
  OctEncodedNormals = 1,
  WaterMask = 2,
  Metadata = 4,
}

/** @internal */
const bentleyCesiumIonRequestKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZWIxNzk1OC0wNmVjLTQ1NDItOTBlYS1lOTViMDljNzQyNWUiLCJpZCI6MTQwLCJzY29wZXMiOlsiYXNsIiwiYXNyIiwiYXN3IiwiZ2MiXSwiaWF0IjoxNTYyMDA0NTYwfQ.VyMP5TPl--eX2bCQjIY7ijfPCd-J0sSPnEFj_mfPC3k";

/** Return the URL for a Cesium ION asset from its asset ID and request Key.
 * @public
 */
export function getCesiumAssetUrl(osmAssetId: number, requestKey: string) {
  return `$CesiumIonAsset=${osmAssetId}:${requestKey}`;
}
/** @internal */
export function getCesiumOSMBuildingsUrl() {
  const osmBuildingAssetId = 96188;
  return getCesiumAssetUrl(osmBuildingAssetId, bentleyCesiumIonRequestKey);
}

/** @internal */
export async function getCesiumAccessTokenAndEndpointUrl(assetId = 1, requestKey?: string): Promise<{ token?: string, url?: string }> {
  const requestContext = new ClientRequestContext("");
  const _requestKey = requestKey ? requestKey : bentleyCesiumIonRequestKey;
  const _requestTemplate = `https://api.cesium.com/v1/assets/${assetId}/endpoint?access_token={CesiumRequestToken}`;
  const apiUrl: string = _requestTemplate.replace("{CesiumRequestToken}", _requestKey);
  const apiRequestOptions: RequestOptions = { method: "GET", responseType: "json" };

  try {
    const apiResponse: Response = await request(requestContext, apiUrl, apiRequestOptions);
    if (undefined === apiResponse || undefined === apiResponse.body || undefined === apiResponse.body.url) {
      assert(false);
      return {};
    }
    return { token: apiResponse.body.accessToken, url: apiResponse.body.url };
  } catch (error) {
    assert(false);
    return {};
  }
}

/** @internal */
export async function getCesiumTerrainProvider(iModel: IModelConnection, modelId: Id64String, wantSkirts: boolean, wantNormals: boolean, exaggeration: number): Promise<TerrainMeshProvider | undefined> {
  const requestContext = new ClientRequestContext("");
  let layers;

  const accessTokenAndEndpointUrl = await getCesiumAccessTokenAndEndpointUrl();
  if (!accessTokenAndEndpointUrl.token || !accessTokenAndEndpointUrl.url)
    return undefined;

  try {
    const layerRequestOptions: RequestOptions = { method: "GET", responseType: "json", headers: { authorization: `Bearer ${accessTokenAndEndpointUrl.token}` } };
    const layerUrl = `${accessTokenAndEndpointUrl.url}layer.json`;
    const layerResponse = await request(requestContext, layerUrl, layerRequestOptions);
    if (undefined === layerResponse) {
      assert(false);
      return undefined;
    }
    layers = layerResponse.body;

  } catch (error) {
    assert(false);
    return undefined;
  }
  if (undefined === layers.tiles || undefined === layers.version) {
    assert(false);
    return undefined;
  }
  const tilingScheme = new GeographicTilingScheme();
  let tileAvailability;
  if (undefined !== layers.available) {
    const availableTiles = layers.available;
    tileAvailability = new TileAvailability(tilingScheme, availableTiles.length);
    for (let level = 0; level < layers.available.length; level++) {
      const rangesAtLevel = availableTiles[level];
      for (const range of rangesAtLevel) {
        tileAvailability.addAvailableTileRange(level, range.startX, range.startY, range.endX, range.endY);
      }
    }
  }

  let tileUrlTemplate = accessTokenAndEndpointUrl.url + layers.tiles[0].replace("{version}", layers.version);
  if (wantNormals)
    tileUrlTemplate = tileUrlTemplate.replace("?", "?extensions=octvertexnormals-watermask-metadata&");

  const maxDepth = JsonUtils.asInt(layers.maxzoom, 19);

  // TBD -- When we have  an API extract the heights for the project from the terrain tiles - for use temporary Bing elevation.
  return new CesiumTerrainProvider(iModel, modelId, accessTokenAndEndpointUrl.token, tileUrlTemplate, maxDepth, wantSkirts, tilingScheme, tileAvailability, layers.metadataAvailability, exaggeration);
}
function zigZagDecode(value: number) {
  return (value >> 1) ^ (-(value & 1));
}
/**
 * Decodes delta and ZigZag encoded vertices. This modifies the buffers in place.
 *
 * @see {@link https://github.com/AnalyticalGraphicsInc/quantized-mesh|quantized-mesh-1.0 terrain format}
 */
function zigZagDeltaDecode(uBuffer: Uint16Array, vBuffer: Uint16Array, heightBuffer: Uint16Array) {
  const count = uBuffer.length;
  let u = 0;
  let v = 0;
  let height = 0;

  for (let i = 0; i < count; ++i) {
    u += zigZagDecode(uBuffer[i]);
    v += zigZagDecode(vBuffer[i]);

    uBuffer[i] = u;
    vBuffer[i] = v;

    height += zigZagDecode(heightBuffer[i]);
    heightBuffer[i] = height;
  }
}

function getIndexArray(vertexCount: number, streamBuffer: ByteStream, indexCount: number): Uint16Array | Uint32Array {
  const indicesAre32Bit = vertexCount > 64 * 1024;
  const indexArray = (indicesAre32Bit) ? new Uint32Array(streamBuffer.arrayBuffer, streamBuffer.curPos, indexCount) : new Uint16Array(streamBuffer.arrayBuffer, streamBuffer.curPos, indexCount);
  streamBuffer.advance(indexCount * (indicesAre32Bit ? Uint32Array.BYTES_PER_ELEMENT : Uint16Array.BYTES_PER_ELEMENT));
  return indexArray;
}

/** @internal */
class CesiumTerrainProvider extends TerrainMeshProvider {
  private static _scratchQPoint2d = QPoint2d.fromScalars(0, 0);
  private static _scratchPoint2d = Point2d.createZero();
  private static _scratchPoint = Point3d.createZero();
  private static _scratchNormal = Vector3d.createZero();
  private static _scratchHeightRange = Range1d.createNull();
  private static _tokenTimeoutInterval = BeDuration.fromSeconds(60 * 30);      // Request a new access token every 30 minutes...
  private _tokenTimeOut: BeTimePoint;

  public override forceTileLoad(tile: Tile): boolean {
    // Force loading of the metadata availability tiles as these are required for determining the availability of descendants.
    return undefined !== this._metaDataAvailableLevel && tile.depth === 1 + this._metaDataAvailableLevel && !(tile as MapTile).everLoaded;
  }

  constructor(iModel: IModelConnection, modelId: Id64String, private _accessToken: string, private _tileUrlTemplate: string,
    private _maxDepth: number, private readonly _wantSkirts: boolean, private _tilingScheme: MapTilingScheme, private _tileAvailability: TileAvailability | undefined, private _metaDataAvailableLevel: number | undefined, private _exaggeration: number) {
    super(iModel, modelId);
    this._tokenTimeOut = BeTimePoint.now().plus(CesiumTerrainProvider._tokenTimeoutInterval);
  }

  public override getLogo(): HTMLTableRowElement {
    return IModelApp.makeLogoCard({ iconSrc: "images/cesium-ion.svg", heading: "Cesium Ion", notice: IModelApp.i18n.translate("iModelJs:BackgroundMap.CesiumWorldTerrainAttribution") });
  }

  public get maxDepth(): number { return this._maxDepth; }
  public get tilingScheme(): MapTilingScheme { return this._tilingScheme; }

  public isTileAvailable(quadId: QuadId) {
    if (quadId.level > this.maxDepth)
      return false;

    return this._tileAvailability ? this._tileAvailability.isTileAvailable(quadId.level - 1, quadId.column, quadId.row) : true;
  }

  public override async getMesh(tile: MapTile, data: Uint8Array): Promise<TerrainMeshPrimitive | undefined> {
    if (BeTimePoint.now().milliseconds > this._tokenTimeOut.milliseconds) {
      const accessTokenAndEndpointUrl = await getCesiumAccessTokenAndEndpointUrl();
      if (!accessTokenAndEndpointUrl.token) {
        assert(false);
        return undefined;
      }

      this._accessToken = accessTokenAndEndpointUrl.token;
      this._tokenTimeOut = BeTimePoint.now().plus(CesiumTerrainProvider._tokenTimeoutInterval);
    }

    assert(data instanceof Uint8Array);
    assert(tile instanceof MapTile);
    const blob = data;
    const streamBuffer = new ByteStream(blob.buffer);
    const center = nextPoint3d64FromByteStream(streamBuffer);
    const quadId = QuadId.createFromContentId(tile.contentId);
    const skirtHeight = this.getLevelMaximumGeometricError(quadId.level) * 10.0;
    const minHeight = this._exaggeration * streamBuffer.nextFloat32;
    const maxHeight = this._exaggeration * streamBuffer.nextFloat32;
    const boundCenter = nextPoint3d64FromByteStream(streamBuffer);
    const boundRadius = streamBuffer.nextFloat64;
    const horizonOcclusion = nextPoint3d64FromByteStream(streamBuffer);
    const terrainTile = tile;

    terrainTile.adjustHeights(minHeight, maxHeight);

    if (undefined === center || undefined === boundCenter || undefined === boundRadius || undefined === horizonOcclusion) { }
    const pointCount = streamBuffer.nextUint32;
    const encodedVertexBuffer = new Uint16Array(blob.buffer, streamBuffer.curPos, pointCount * 3);
    streamBuffer.advance(pointCount * 6);

    const uBuffer = encodedVertexBuffer.subarray(0, pointCount);
    const vBuffer = encodedVertexBuffer.subarray(pointCount, 2 * pointCount);
    const heightBuffer = encodedVertexBuffer.subarray(pointCount * 2, 3 * pointCount);

    zigZagDeltaDecode(uBuffer, vBuffer, heightBuffer);

    let bytesPerIndex = Uint16Array.BYTES_PER_ELEMENT;
    const triangleElements = 3;

    if (pointCount > 64 * 1024) {
      // More than 64k vertices, so indices are 32-bit.
      bytesPerIndex = Uint32Array.BYTES_PER_ELEMENT;
    }

    // skip over any additional padding that was added for 2/4 byte alignment
    if (streamBuffer.curPos % bytesPerIndex !== 0)
      streamBuffer.advance(bytesPerIndex - (streamBuffer.curPos % bytesPerIndex));

    const triangleCount = streamBuffer.nextUint32;
    const indexCount = triangleCount * triangleElements;

    const indices = getIndexArray(pointCount, streamBuffer, indexCount);
    // High water mark decoding based on decompressIndices_ in webgl-loader's loader.js.
    // https://code.google.com/p/webgl-loader/source/browse/trunk/samples/loader.js?r=99#55
    // Copyright 2012 Google Inc., Apache 2.0 license.
    let highest = 0;
    const length = indices.length;
    for (let i = 0; i < length; ++i) {
      const code = indices[i];
      indices[i] = highest - code;
      if (code === 0) {
        ++highest;
      }
    }

    CesiumTerrainProvider._scratchHeightRange.low = minHeight - skirtHeight;
    CesiumTerrainProvider._scratchHeightRange.high = maxHeight;
    const projection = terrainTile.getProjection(CesiumTerrainProvider._scratchHeightRange);
    const pointQParams = QParams3d.fromRange(projection.localRange);

    const uvScale = 1.0 / 32767.0;
    const heightScale = uvScale * (maxHeight - minHeight);

    const westCount = streamBuffer.nextUint32;
    const westIndices = getIndexArray(pointCount, streamBuffer, westCount);

    const southCount = streamBuffer.nextUint32;
    const southIndices = getIndexArray(pointCount, streamBuffer, southCount);

    const eastCount = streamBuffer.nextUint32;
    const eastIndices = getIndexArray(pointCount, streamBuffer, eastCount);

    const northCount = streamBuffer.nextUint32;
    const northIndices = getIndexArray(pointCount, streamBuffer, northCount);

    // Extensions...
    let encodedNormalsBuffer;
    while (streamBuffer.curPos < streamBuffer.length) {
      const extensionId = streamBuffer.nextUint8;
      const extensionLength = streamBuffer.nextUint32;
      switch (extensionId) {
        case QuantizedMeshExtensionIds.OctEncodedNormals:
          assert(pointCount * 2 === extensionLength);
          encodedNormalsBuffer = new Uint8Array(streamBuffer.arrayBuffer, streamBuffer.curPos, extensionLength);
          streamBuffer.advance(extensionLength);
          break;

        case QuantizedMeshExtensionIds.Metadata:
          const stringLength = streamBuffer.nextUint32;
          if (stringLength > 0) {
            const strData = streamBuffer.nextBytes(stringLength);
            const str = utf8ToString(strData);
            if (undefined !== str) {
              const metaData = JSON.parse(str);
              if (undefined !== metaData.available && undefined !== this._tileAvailability) {
                const availableTiles = metaData.available;
                for (let offset = 0; offset < availableTiles.length; ++offset) {
                  const availableLevel = tile.depth + offset;     // Our depth is includes root (1 + cesium Depth)
                  const rangesAtLevel = availableTiles[offset];

                  for (const range of rangesAtLevel)
                    this._tileAvailability.addAvailableTileRange(availableLevel, range.startX, range.startY, range.endX, range.endY);
                }
              }
            }
          }

          break;
        default:
          streamBuffer.advance(extensionLength);
          break;
      }

    }

    const mesh = TerrainMeshPrimitive.create({ pointQParams, pointCount, indexCount, wantSkirts: this._wantSkirts, westCount, eastCount, southCount, northCount, wantNormals: undefined !== encodedNormalsBuffer });
    for (let i = 0; i < indexCount;)
      this.addTriangle(mesh, indices[i++], indices[i++], indices[i++]);

    const worldToEcef = tile.iModel.getEcefTransform().matrix;
    for (let i = 0; i < pointCount; i++) {
      const u = uBuffer[i];
      const v = vBuffer[i];
      projection.getPoint(uvScale * u, uvScale * v, minHeight + heightBuffer[i] * heightScale, CesiumTerrainProvider._scratchPoint);
      CesiumTerrainProvider._scratchQPoint2d.setFromScalars(u * 2, v * 2);
      if (encodedNormalsBuffer) {
        const normalIndex = i * 2;
        OctEncodedNormal.decodeValue(encodedNormalsBuffer[normalIndex + 1] << 8 | encodedNormalsBuffer[normalIndex], CesiumTerrainProvider._scratchNormal);
        worldToEcef.multiplyTransposeVector(CesiumTerrainProvider._scratchNormal, CesiumTerrainProvider._scratchNormal);
        mesh.addVertex(CesiumTerrainProvider._scratchPoint, CesiumTerrainProvider._scratchQPoint2d, OctEncodedNormal.encode(CesiumTerrainProvider._scratchNormal));
      } else {
        mesh.addVertex(CesiumTerrainProvider._scratchPoint, CesiumTerrainProvider._scratchQPoint2d);
      }
    }

    if (this._wantSkirts) {
      westIndices.sort((a, b) => vBuffer[a] - vBuffer[b]);
      eastIndices.sort((a, b) => vBuffer[a] - vBuffer[b]);
      northIndices.sort((a, b) => uBuffer[a] - uBuffer[b]);
      southIndices.sort((a, b) => uBuffer[a] - uBuffer[b]);
      const wantNormals = (encodedNormalsBuffer !== undefined);
      this.generateSkirts(mesh, westIndices, projection, -skirtHeight, heightBuffer, minHeight, heightScale, wantNormals);
      this.generateSkirts(mesh, eastIndices, projection, -skirtHeight, heightBuffer, minHeight, heightScale, wantNormals);
      this.generateSkirts(mesh, southIndices, projection, -skirtHeight, heightBuffer, minHeight, heightScale, wantNormals);
      this.generateSkirts(mesh, northIndices, projection, -skirtHeight, heightBuffer, minHeight, heightScale, wantNormals);
    }
    assert(mesh.isCompleted);
    return mesh;
  }

  private addTriangle(mesh: TerrainMeshPrimitive, i0: number, i1: number, i2: number) {
    mesh.addTriangle(i0, i1, i2);
  }

  private generateSkirts(mesh: TerrainMeshPrimitive, indices: Uint16Array | Uint32Array, projection: MapTileProjection, skirtOffset: number, heightBuffer: Uint16Array, minHeight: number, heightScale: number, wantNormals: boolean) {
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      const paramIndex = index * 2;
      const height = minHeight + heightBuffer[index] * heightScale;
      CesiumTerrainProvider._scratchQPoint2d.setFromScalars(mesh.uvs[paramIndex], mesh.uvs[paramIndex + 1]);
      const uv = mesh.uvQParams.unquantize(CesiumTerrainProvider._scratchQPoint2d.x, CesiumTerrainProvider._scratchQPoint2d.y, CesiumTerrainProvider._scratchPoint2d);
      if (wantNormals && mesh.normals) {
        mesh.addVertex(projection.getPoint(uv.x, uv.y, height + skirtOffset), CesiumTerrainProvider._scratchQPoint2d, mesh.normals[index]);
      } else {
        mesh.addVertex(projection.getPoint(uv.x, uv.y, height + skirtOffset), CesiumTerrainProvider._scratchQPoint2d);
      }

      if (i) {
        this.addTriangle(mesh, index, indices[i - 1], mesh.nextPointIndex - 2);
        this.addTriangle(mesh, index, mesh.nextPointIndex - 2, mesh.nextPointIndex - 1);
      }
    }
  }
  public override get requestOptions(): RequestOptions {
    return { method: "GET", responseType: "arraybuffer", headers: { authorization: `Bearer ${this._accessToken}` }, accept: "application/vnd.quantized-mesh;" /* extensions=octvertexnormals, */ + "application/octet-stream;q=0.9,*/*;q=0.01" };
  }

  public override constructUrl(row: number, column: number, zoomLevel: number): string {
    return this._tileUrlTemplate.replace("{z}", (zoomLevel - 1).toString()).replace("{x}", column.toString()).replace("{y}", row.toString());
  }

  public getChildHeightRange(quadId: QuadId, rectangle: MapCartoRectangle, parent: MapTile): Range1d | undefined {
    return (quadId.level <= ApproximateTerrainHeights.maxLevel) ? ApproximateTerrainHeights.instance.getMinimumMaximumHeights(rectangle) : (parent).heightRange;
  }
  /**
   * Specifies the quality of terrain created from heightmaps.  A value of 1.0 will
   * ensure that adjacent heightmap vertices are separated by no more than
   * screen pixels and will probably go very slowly.
   * A value of 0.5 will cut the estimated level zero geometric error in half, allowing twice the
   * screen pixels between adjacent heightmap vertices and thus rendering more quickly.
   * @type {Number}
   */
  public readonly heightmapTerrainQuality = 0.25;

  /**
   * Determines an appropriate geometric error estimate when the geometry comes from a heightmap.
   *
   * @param {Ellipsoid} ellipsoid The ellipsoid to which the terrain is attached.
   * @param {Number} tileImageWidth The width, in pixels, of the heightmap associated with a single tile.
   * @param {Number} numberOfTilesAtLevelZero The number of tiles in the horizontal direction at tile level zero.
   * @returns {Number} An estimated geometric error.
   */
  public getEstimatedLevelZeroGeometricErrorForAHeightmap(ellipsoidMaximumRadius = 6378137, tileImageWidth = 65, numberOfTilesAtLevelZero = 2) {
    return ellipsoidMaximumRadius * 2 * Math.PI * this.heightmapTerrainQuality / (tileImageWidth * numberOfTilesAtLevelZero);
  }

  public getLevelMaximumGeometricError(level: number) {
    return this.getEstimatedLevelZeroGeometricErrorForAHeightmap() / (1 << level);
  }

  public getHeightRange(parentRange: Range1d, quadId: QuadId): Range1d {
    const heightRange = quadId.level <= 6 ? ApproximateTerrainHeights.instance.getTileHeightRange(quadId) : undefined;

    return undefined === heightRange ? parentRange : heightRange;
  }
}
