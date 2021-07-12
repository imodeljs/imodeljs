/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, ByteStream, Id64String, JsonUtils } from "@bentley/bentleyjs-core";
import { Point3d, Range2d, Range3d, Transform } from "@bentley/geometry-core";
import {
  BatchType, ColorDef, ElementAlignedBox3d, FeatureTableHeader, FillFlags, Gradient, ImageSource, ImdlHeader, LinePixels,
  PackedFeatureTable, PolylineTypeFlags, QParams2d, QParams3d, readTileContentDescription, RenderMaterial, RenderTexture, TextureMapping,
  TileReadError, TileReadStatus,
} from "@bentley/imodeljs-common";
import { IModelApp } from "../IModelApp";
import { IModelConnection } from "../IModelConnection";
import { GraphicBranch } from "../render/GraphicBranch";
import { InstancedGraphicParams } from "../render/InstancedGraphicParams";
import { AuxChannelTable, AuxChannelTableProps } from "../render/primitives/AuxChannelTable";
import { DisplayParams } from "../render/primitives/DisplayParams";
import { Mesh } from "../render/primitives/mesh/MeshPrimitives";
import {
  createSurfaceMaterial, EdgeParams, isValidSurfaceType, MeshParams, PointStringParams, PolylineParams, SegmentEdgeParams, SilhouetteParams,
  SurfaceMaterial, SurfaceParams, SurfaceType, TesselatedPolyline, VertexIndices, VertexTable,
} from "../render/primitives/VertexTable";
import { RenderGraphic } from "../render/RenderGraphic";
import { RenderSystem } from "../render/RenderSystem";
import { BatchOptions } from "../render/GraphicBuilder";
import { GltfReader, GltfReaderProps, IModelTileContent, ShouldAbortReadGltf } from "./internal";

/* eslint-disable no-restricted-syntax */

/** @internal */
export interface ImdlReaderResult extends IModelTileContent {
  readStatus: TileReadStatus;
}

/** Convert the byte array returned by [[TileAdmin.requestElementGraphics]] into a [[RenderGraphic]].
 * @param bytes The binary graphics data obtained from `requestElementGraphics`.
 * @param iModel The iModel with which the graphics are associated.
 * @param modelId The Id of the [[GeometricModelState]] with which the graphics are associated. Can be an invalid Id.
 * @param is3d True if the graphics are 3d.
 * @param options Options customizing how [Feature]($common)s within the graphic can be resymbolized.
 * @public
 */
export async function readElementGraphics(bytes: Uint8Array, iModel: IModelConnection, modelId: Id64String, is3d: boolean, options?: BatchOptions): Promise<RenderGraphic | undefined> {
  const stream = new ByteStream(bytes.buffer);
  const reader = ImdlReader.create(stream, iModel, modelId, is3d, IModelApp.renderSystem, undefined, undefined, undefined, undefined, options);
  if (!reader)
    return undefined;

  const result = await reader.read();
  return result.graphic;
}

/** Deserializes tile content in iMdl format. These tiles contain element geometry encoded into a format optimized for the imodeljs webgl renderer.
 * @internal
 */
export class ImdlReader extends GltfReader {
  private readonly _sizeMultiplier?: number;
  private readonly _loadEdges: boolean;
  private readonly _options: BatchOptions;

  /** Attempt to initialize an ImdlReader to deserialize iModel tile data beginning at the stream's current position. */
  public static create(stream: ByteStream, iModel: IModelConnection, modelId: Id64String, is3d: boolean, system: RenderSystem,
    type: BatchType = BatchType.Primary, loadEdges: boolean = true, isCanceled?: ShouldAbortReadGltf, sizeMultiplier?: number,
    options?: BatchOptions): ImdlReader | undefined {
    const header = new ImdlHeader(stream);
    if (!header.isValid || !header.isReadableVersion)
      return undefined;

    // The feature table follows the iMdl header
    if (!this.skipFeatureTable(stream))
      return undefined;

    // A glTF header follows the feature table
    const props = GltfReaderProps.create(stream, false);
    return undefined !== props ? new ImdlReader(props, iModel, modelId, is3d, system, type, loadEdges, isCanceled, sizeMultiplier, options) : undefined;
  }

  /** Attempt to deserialize the tile data */
  public async read(): Promise<ImdlReaderResult> {
    let content;
    try {
      content = readTileContentDescription(this._buffer, this._sizeMultiplier, !this._is3d, IModelApp.tileAdmin, this._isVolumeClassifier);
    } catch (e) {
      if (e instanceof TileReadError)
        return { isLeaf: true, readStatus: e.errorNumber };
      else
        throw e;
    }

    const featureTable = this.readFeatureTable(content.featureTableStartPos);
    if (undefined === featureTable)
      return { readStatus: TileReadStatus.InvalidFeatureTable, isLeaf: true };

    // Textures must be loaded asynchronously first...
    await this.loadNamedTextures();
    if (this._isCanceled)
      return { readStatus: TileReadStatus.Canceled, isLeaf: true };

    return this.finishRead(content.isLeaf, featureTable, content.contentRange, content.emptySubRangeMask, content.sizeMultiplier);
  }

  /** @internal */
  protected override extractReturnToCenter(_extensions: any): number[] | undefined { return undefined; }

  /** @internal */
  protected override createDisplayParams(json: any): DisplayParams | undefined {
    const type = JsonUtils.asInt(json.type, DisplayParams.Type.Mesh);
    const lineColor = ColorDef.create(JsonUtils.asInt(json.lineColor));
    const fillColor = ColorDef.create(JsonUtils.asInt(json.fillColor));
    const width = JsonUtils.asInt(json.lineWidth);
    const linePixels = JsonUtils.asInt(json.linePixels, LinePixels.Solid);
    const fillFlags = JsonUtils.asInt(json.fillFlags, FillFlags.None);
    const ignoreLighting = JsonUtils.asBool(json.ignoreLighting);

    // Material will always contain its own texture if it has one
    const materialKey = json.materialId;
    const material = undefined !== materialKey ? this.materialFromJson(materialKey) : undefined;

    // We will only attempt to include the texture if material is undefined
    let textureMapping;
    if (!material) {
      const textureJson = json.texture;
      textureMapping = undefined !== textureJson ? this.textureMappingFromJson(textureJson) : undefined;

      if (undefined === textureMapping) {
        // Look for a gradient. If defined, create a texture mapping. No reason to pass the Gradient.Symb to the DisplayParams once we have the texture.
        const gradientProps = json.gradient as Gradient.SymbProps;
        const gradient = undefined !== gradientProps ? Gradient.Symb.fromJSON(gradientProps) : undefined;
        if (undefined !== gradient) {
          const texture = this._system.getGradientTexture(gradient, this._iModel);
          if (undefined !== texture) {
            // ###TODO: would be better if DisplayParams created the TextureMapping - but that requires an IModelConnection and a RenderSystem...
            textureMapping = new TextureMapping(texture, new TextureMapping.Params({ textureMat2x3: new TextureMapping.Trans2x3(0, 1, 0, 1, 0, 0) }));
          }
        }
      }
    }

    return new DisplayParams(type, lineColor, fillColor, width, linePixels, fillFlags, material, undefined, ignoreLighting, textureMapping);
  }

  /** @internal */
  protected colorDefFromMaterialJson(json: any): ColorDef | undefined {
    return undefined !== json ? ColorDef.from(json[0] * 255 + 0.5, json[1] * 255 + 0.5, json[2] * 255 + 0.5) : undefined;
  }

  /** @internal */
  protected materialFromJson(key: string): RenderMaterial | undefined {
    if (this._renderMaterials === undefined || this._renderMaterials[key] === undefined)
      return undefined;

    let material = this._system.findMaterial(key, this._iModel);
    if (!material) {
      const materialJson = this._renderMaterials[key];

      const materialParams = new RenderMaterial.Params(key);
      materialParams.diffuseColor = this.colorDefFromMaterialJson(materialJson.diffuseColor);
      if (materialJson.diffuse !== undefined)
        materialParams.diffuse = JsonUtils.asDouble(materialJson.diffuse);
      materialParams.specularColor = this.colorDefFromMaterialJson(materialJson.specularColor);
      if (materialJson.specular !== undefined)
        materialParams.specular = JsonUtils.asDouble(materialJson.specular);
      materialParams.reflectColor = this.colorDefFromMaterialJson(materialJson.reflectColor);
      if (materialJson.reflect !== undefined)
        materialParams.reflect = JsonUtils.asDouble(materialJson.reflect);

      if (materialJson.specularExponent !== undefined)
        materialParams.specularExponent = materialJson.specularExponent;

      if (undefined !== materialJson.transparency)
        materialParams.alpha = 1.0 - materialJson.transparency;

      materialParams.refract = JsonUtils.asDouble(materialJson.refract);
      materialParams.shadows = JsonUtils.asBool(materialJson.shadows);
      materialParams.ambient = JsonUtils.asDouble(materialJson.ambient);

      if (undefined !== materialJson.textureMapping)
        materialParams.textureMapping = this.textureMappingFromJson(materialJson.textureMapping.texture);

      material = this._system.createMaterial(materialParams, this._iModel);
    }

    return material;
  }

  private textureMappingFromJson(json: any): TextureMapping | undefined {
    if (undefined === json)
      return undefined;

    const name = JsonUtils.asString(json.name);
    const namedTex = 0 !== name.length ? this._namedTextures[name] : undefined;
    const texture = undefined !== namedTex ? namedTex.renderTexture as RenderTexture : undefined;
    if (undefined === texture) {
      assert(false, "bad texture mapping json");
      return undefined;
    }

    const paramsJson = json.params;
    const tf = paramsJson.transform;
    const paramProps: TextureMapping.ParamProps = {
      textureMat2x3: new TextureMapping.Trans2x3(tf[0][0], tf[0][1], tf[0][2], tf[1][0], tf[1][1], tf[1][2]),
      textureWeight: JsonUtils.asDouble(paramsJson.weight, 1.0),
      mapMode: JsonUtils.asInt(paramsJson.mode),
      worldMapping: JsonUtils.asBool(paramsJson.worldMapping),
    };

    return new TextureMapping(texture, new TextureMapping.Params(paramProps));
  }

  private async loadNamedTextures(): Promise<void> {
    if (undefined === this._namedTextures)
      return;

    const promises = new Array<Promise<void>>();
    for (const name of Object.keys(this._namedTextures))
      promises.push(this.loadNamedTexture(name));

    if (promises.length > 0)
      await Promise.all(promises);
  }

  private async loadNamedTexture(name: string): Promise<void> {
    if (this._isCanceled)
      return;

    const namedTex = this._namedTextures[name];
    assert(undefined !== namedTex); // we got here by iterating the keys of this.namedTextures...
    if (undefined === namedTex)
      return;

    const texture = this._system.findTexture(name, this._iModel);
    if (undefined !== texture) {
      namedTex.renderTexture = texture;
      return;
    }

    namedTex.renderTexture = await this.readNamedTexture(namedTex, name);
  }

  private async readNamedTexture(namedTex: any, name: string): Promise<RenderTexture | undefined> {
    // Reasons a texture could be embedded in the tile content instead of requested separately from the backend:
    // - external textures are disabled
    // - the texture name is not a valid Id64 string
    // - the texture is below a certain backend-hardcoded size threshold
    // The bufferViewJson being defined signifies any of the above conditions. In that case, the image content
    // has been embedded in the tile contents. Otherwise, we will attempt to request the image content separately
    // from the backend.

    let textureType = RenderTexture.Type.Normal;
    const isGlyph = JsonUtils.asBool(namedTex.isGlyph);
    const isTileSection = !isGlyph && JsonUtils.asBool(namedTex.isTileSection);
    if (isGlyph)
      textureType = RenderTexture.Type.Glyph;
    else if (isTileSection)
      textureType = RenderTexture.Type.TileSection;

    // We produce unique tile sections for very large (> 8 megapixel) textures, and unique glyph atlases for raster text.
    // Neither should be cached.
    const cacheable = !isGlyph && !isTileSection;
    const params = new RenderTexture.Params(cacheable ? name : undefined, textureType);

    const bufferViewId = JsonUtils.asString(namedTex.bufferView);
    const bufferViewJson = 0 !== bufferViewId.length ? this._bufferViews[bufferViewId] : undefined;

    if (undefined !== bufferViewJson) { // presence of bufferViewJson signifies we should read the texture from the tile content
      const byteOffset = JsonUtils.asInt(bufferViewJson.byteOffset);
      const byteLength = JsonUtils.asInt(bufferViewJson.byteLength);
      if (0 === byteLength)
        return undefined;

      const texBytes = this._binaryData.subarray(byteOffset, byteOffset + byteLength);
      const format = namedTex.format;
      const imageSource = new ImageSource(texBytes, format);
      return this._system.createTextureFromImageSource(imageSource, this._iModel, params);
    }

    // bufferViewJson was undefined, so attempt to request the texture directly from the backend
    return this._system.createTextureFromElement(name, this._iModel, params, namedTex.format);
  }

  /** @internal */
  protected readFeatureTable(startPos: number): PackedFeatureTable | undefined {
    this._buffer.curPos = startPos;
    const header = FeatureTableHeader.readFrom(this._buffer);
    if (undefined === header || 0 !== header.length % 4)
      return undefined;

    // NB: We make a copy of the sub-array because we don't want to pin the entire data array in memory.
    const numUint32s = (header.length - FeatureTableHeader.sizeInBytes) / 4;
    const packedFeatureArray = new Uint32Array(this._buffer.nextUint32s(numUint32s));
    if (this._buffer.isPastTheEnd)
      return undefined;

    let animNodesArray: Uint8Array | Uint16Array | Uint32Array | undefined;
    const animationNodes = JsonUtils.asObject(this._scene.animationNodes);
    if (undefined !== animationNodes) {
      const bytesPerId = JsonUtils.asInt(animationNodes.bytesPerId);
      const bufferViewId = JsonUtils.asString(animationNodes.bufferView);
      const bufferViewJson = this._bufferViews[bufferViewId];
      if (undefined !== bufferViewJson) {
        const byteOffset = JsonUtils.asInt(bufferViewJson.byteOffset);
        const byteLength = JsonUtils.asInt(bufferViewJson.byteLength);
        const bytes = this._binaryData.subarray(byteOffset, byteOffset + byteLength);
        switch (bytesPerId) {
          case 1:
            animNodesArray = new Uint8Array(bytes);
            break;
          case 2:
            // NB: A *copy* of the subarray.
            animNodesArray = Uint16Array.from(new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2));
            break;
          case 4:
            // NB: A *copy* of the subarray.
            animNodesArray = Uint32Array.from(new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4));
            break;
        }
      }
    }

    this._buffer.curPos = startPos + header.length;

    return new PackedFeatureTable(packedFeatureArray, this._modelId, header.count, header.maxFeatures, this._type, animNodesArray);
  }

  private constructor(props: GltfReaderProps, iModel: IModelConnection, modelId: Id64String, is3d: boolean, system: RenderSystem,
    type: BatchType, loadEdges: boolean, isCanceled?: ShouldAbortReadGltf, sizeMultiplier?: number, options?: BatchOptions) {
    super(props, iModel, modelId, is3d, system, type, isCanceled);
    this._sizeMultiplier = sizeMultiplier;
    this._loadEdges = loadEdges;
    this._options = options ?? {};
  }

  private static skipFeatureTable(stream: ByteStream): boolean {
    const startPos = stream.curPos;
    const header = FeatureTableHeader.readFrom(stream);
    if (undefined !== header)
      stream.curPos = startPos + header.length;

    return undefined !== header;
  }

  private readMeshGraphic(primitive: any): RenderGraphic | undefined {
    const materialName = JsonUtils.asString(primitive.material);
    const materialValue = 0 < materialName.length ? JsonUtils.asObject(this._materialValues[materialName]) : undefined;
    const displayParams = undefined !== materialValue ? this.createDisplayParams(materialValue) : undefined;
    if (undefined === displayParams)
      return undefined;

    const vertices = this.readVertexTable(primitive);
    if (undefined === vertices) {
      assert(false, "bad vertex table in tile data.");
      return undefined;
    }

    const isPlanar = !this._is3d || JsonUtils.asBool(primitive.isPlanar);
    const primitiveType = JsonUtils.asInt(primitive.type, Mesh.PrimitiveType.Mesh);
    const instances = this.readInstances(primitive);
    switch (primitiveType) {
      case Mesh.PrimitiveType.Mesh:
        return this.createMeshGraphic(primitive, displayParams, vertices, isPlanar, this.readAuxChannelTable(primitive), instances);
      case Mesh.PrimitiveType.Polyline:
        return this.createPolylineGraphic(primitive, displayParams, vertices, isPlanar, instances);
      case Mesh.PrimitiveType.Point:
        return this.createPointStringGraphic(primitive, displayParams, vertices, instances);
    }

    assert(false, "unhandled primitive type");
    return undefined;
  }

  private findBuffer(bufferViewId: string): Uint8Array | undefined {
    if (typeof bufferViewId !== "string" || 0 === bufferViewId.length)
      return undefined;

    const bufferViewJson = this._bufferViews[bufferViewId];
    if (undefined === bufferViewJson)
      return undefined;

    const byteOffset = JsonUtils.asInt(bufferViewJson.byteOffset);
    const byteLength = JsonUtils.asInt(bufferViewJson.byteLength);
    if (0 === byteLength)
      return undefined;

    return this._binaryData.subarray(byteOffset, byteOffset + byteLength);
  }

  private readVertexTable(primitive: any): VertexTable | undefined {
    const json = primitive.vertices;
    if (undefined === json)
      return undefined;

    const bytes = this.findBuffer(JsonUtils.asString(json.bufferView));
    if (undefined === bytes)
      return undefined;

    const uniformFeatureID = undefined !== json.featureID ? JsonUtils.asInt(json.featureID) : undefined;

    const rangeMin = JsonUtils.asArray(json.params.decodedMin);
    const rangeMax = JsonUtils.asArray(json.params.decodedMax);
    if (undefined === rangeMin || undefined === rangeMax)
      return undefined;

    const qparams = QParams3d.fromRange(Range3d.create(Point3d.create(rangeMin[0], rangeMin[1], rangeMin[2]), Point3d.create(rangeMax[0], rangeMax[1], rangeMax[2])));

    const uniformColor = undefined !== json.uniformColor ? ColorDef.fromJSON(json.uniformColor) : undefined;
    let uvParams: QParams2d | undefined;
    if (undefined !== primitive.surface && undefined !== primitive.surface.uvParams) {
      const uvMin = JsonUtils.asArray(primitive.surface.uvParams.decodedMin);
      const uvMax = JsonUtils.asArray(primitive.surface.uvParams.decodedMax);
      if (undefined === uvMin || undefined === uvMax)
        return undefined;

      const uvRange = new Range2d(uvMin[0], uvMin[1], uvMax[0], uvMax[1]);
      uvParams = QParams2d.fromRange(uvRange);
    }

    return new VertexTable({
      data: bytes,
      qparams,
      width: json.width,
      height: json.height,
      hasTranslucency: json.hasTranslucency,
      uniformColor,
      featureIndexType: json.featureIndexType,
      uniformFeatureID,
      numVertices: json.count,
      numRgbaPerVertex: json.numRgbaPerVertex,
      uvParams,
    });
  }

  private readAuxChannelTable(primitive: any): AuxChannelTable | undefined {
    const json = primitive.auxChannels;
    if (undefined === json)
      return undefined;

    const bytes = this.findBuffer(JsonUtils.asString(json.bufferView));
    if (undefined === bytes)
      return undefined;

    const props: AuxChannelTableProps = {
      data: bytes,
      width: json.width,
      height: json.height,
      count: json.count,
      numBytesPerVertex: json.numBytesPerVertex,
      displacements: json.displacements,
      normals: json.normals,
      params: json.params,
    };

    return AuxChannelTable.fromJSON(props);
  }

  private readInstances(primitive: any): Point3d | InstancedGraphicParams | undefined {
    const viJson = primitive.viewIndependentOrigin;
    if (undefined !== viJson)
      return Point3d.fromJSON(viJson);

    const json = primitive.instances;
    if (undefined === json)
      return undefined;

    const count = JsonUtils.asInt(json.count, 0);
    if (count <= 0)
      return undefined;

    const centerComponents = JsonUtils.asArray(json.transformCenter);
    if (undefined === centerComponents || 3 !== centerComponents.length)
      return undefined;

    const transformCenter = Point3d.create(centerComponents[0], centerComponents[1], centerComponents[2]);

    const featureIds = this.findBuffer(JsonUtils.asString(json.featureIds));
    if (undefined === featureIds)
      return undefined;

    const transformBytes = this.findBuffer(JsonUtils.asString(json.transforms));
    if (undefined === transformBytes)
      return undefined;

    // 1 transform = 3 rows of 4 floats = 12 floats per instance
    const numFloats = transformBytes.byteLength / 4;
    assert(Math.floor(numFloats) === numFloats);
    assert(0 === numFloats % 12);

    const transforms = new Float32Array(transformBytes.buffer, transformBytes.byteOffset, numFloats);

    let symbologyOverrides: Uint8Array | undefined;
    if (undefined !== json.symbologyOverrides)
      symbologyOverrides = this.findBuffer(JsonUtils.asString(json.symbologyOverrides));

    return { count, transforms, transformCenter, featureIds, symbologyOverrides };
  }

  private readVertexIndices(json: any): VertexIndices | undefined {
    const bytes = this.findBuffer(json as string);
    return undefined !== bytes ? new VertexIndices(bytes) : undefined;
  }

  private createPointStringGraphic(primitive: any, displayParams: DisplayParams, vertices: VertexTable, instances: Point3d | InstancedGraphicParams | undefined): RenderGraphic | undefined {
    const indices = this.readVertexIndices(primitive.indices);
    if (undefined === indices)
      return undefined;

    const params = new PointStringParams(vertices, indices, displayParams.width);
    return this._system.createPointString(params, instances);
  }

  private readTesselatedPolyline(json: any): TesselatedPolyline | undefined {
    const indices = this.readVertexIndices(json.indices);
    const prevIndices = this.readVertexIndices(json.prevIndices);
    const nextIndicesAndParams = this.findBuffer(json.nextIndicesAndParams);

    if (undefined === indices || undefined === prevIndices || undefined === nextIndicesAndParams)
      return undefined;

    return {
      indices,
      prevIndices,
      nextIndicesAndParams,
    };
  }

  private createPolylineGraphic(primitive: any, displayParams: DisplayParams, vertices: VertexTable, isPlanar: boolean, instances: Point3d | InstancedGraphicParams | undefined): RenderGraphic | undefined {
    const polyline = this.readTesselatedPolyline(primitive);
    if (undefined === polyline)
      return undefined;

    let flags = PolylineTypeFlags.Normal;
    if (DisplayParams.RegionEdgeType.Outline === displayParams.regionEdgeType)
      flags = (undefined === displayParams.gradient || displayParams.gradient.isOutlined) ? PolylineTypeFlags.Edge : PolylineTypeFlags.Outline;

    const params = new PolylineParams(vertices, polyline, displayParams.width, displayParams.linePixels, isPlanar, flags);
    return this._system.createPolyline(params, instances);
  }

  private readSurface(mesh: any, displayParams: DisplayParams): SurfaceParams | undefined {
    const surf = mesh.surface;
    if (undefined === surf)
      return undefined;

    const indices = this.readVertexIndices(surf.indices);
    if (undefined === indices)
      return undefined;

    const type = JsonUtils.asInt(surf.type, -1);
    if (!isValidSurfaceType(type))
      return undefined;

    const texture = undefined !== displayParams.textureMapping ? displayParams.textureMapping.texture : undefined;
    let material: SurfaceMaterial | undefined;
    const atlas = mesh.vertices.materialAtlas;
    const numColors = mesh.vertices.numColors;
    if (undefined !== atlas && undefined !== numColors) {
      material = {
        isAtlas: true,
        hasTranslucency: JsonUtils.asBool(atlas.hasTranslucency),
        overridesAlpha: JsonUtils.asBool(atlas.overridesAlpha, false),
        vertexTableOffset: JsonUtils.asInt(numColors),
        numMaterials: JsonUtils.asInt(atlas.numMaterials),
      };
    } else {
      material = createSurfaceMaterial(displayParams.material);
    }

    const textureMapping = undefined !== texture ? { texture, alwaysDisplayed: JsonUtils.asBool(surf.alwaysDisplayTexture) } : undefined;
    return {
      type,
      indices,
      fillFlags: displayParams.fillFlags,
      hasBakedLighting: false,
      hasFixedNormals: false,
      material,
      textureMapping,
    };
  }

  private readSegmentEdges(json: any): SegmentEdgeParams | undefined {
    const indices = this.readVertexIndices(json.indices);
    const endPointAndQuadIndices = this.findBuffer(json.endPointAndQuadIndices);
    return undefined !== indices && undefined !== endPointAndQuadIndices ? { indices, endPointAndQuadIndices } : undefined;
  }

  private readSilhouettes(json: any): SilhouetteParams | undefined {
    const segments = this.readSegmentEdges(json);
    const normalPairs = this.findBuffer(json.normalPairs);
    return undefined !== segments && undefined !== normalPairs ? { normalPairs, indices: segments.indices, endPointAndQuadIndices: segments.endPointAndQuadIndices } : undefined;
  }

  private readEdges(json: any, displayParams: DisplayParams): { succeeded: boolean, params?: EdgeParams } {
    let segments: SegmentEdgeParams | undefined;
    let silhouettes: SilhouetteParams | undefined;
    let polylines: TesselatedPolyline | undefined;

    let succeeded = false;
    if (undefined !== json.segments && undefined === (segments = this.readSegmentEdges(json.segments)))
      return { succeeded };

    if (undefined !== json.silhouettes && undefined === (silhouettes = this.readSilhouettes(json.silhouettes)))
      return { succeeded };

    if (undefined !== json.polylines && undefined === (polylines = this.readTesselatedPolyline(json.polylines)))
      return { succeeded };

    succeeded = true;
    let params: EdgeParams | undefined;
    if (undefined !== segments || undefined !== silhouettes || undefined !== polylines) {
      params = {
        segments,
        silhouettes,
        polylines,
        weight: displayParams.width,
        linePixels: displayParams.linePixels,
      };
    }

    return { succeeded, params };
  }

  private createMeshGraphic(primitive: any, displayParams: DisplayParams, vertices: VertexTable, isPlanar: boolean, auxChannels: AuxChannelTable | undefined, instances: Point3d | InstancedGraphicParams | undefined): RenderGraphic | undefined {
    const surface = this.readSurface(primitive, displayParams);
    if (undefined === surface)
      return undefined;

    // ###TODO: Tile generator shouldn't bother producing edges for classification meshes in the first place...
    let edgeParams: EdgeParams | undefined;
    if (this._loadEdges && undefined !== primitive.edges && SurfaceType.VolumeClassifier !== surface.type) {
      const edgeResult = this.readEdges(primitive.edges, displayParams);
      if (!edgeResult.succeeded)
        return undefined;
      else
        edgeParams = edgeResult.params;
    }

    const params = new MeshParams(vertices, surface, edgeParams, isPlanar, auxChannels);
    return this._system.createMesh(params, instances);
  }

  private finishRead(isLeaf: boolean, featureTable: PackedFeatureTable, contentRange: ElementAlignedBox3d, emptySubRangeMask: number, sizeMultiplier?: number): ImdlReaderResult {
    const graphics: RenderGraphic[] = [];

    if (undefined === this._nodes.Node_Root) {
      // Unstructured -- prior to animation support....
      for (const meshKey of Object.keys(this._meshes)) {
        const meshValue = this._meshes[meshKey];
        const primitives = JsonUtils.asArray(meshValue.primitives);
        if (undefined === primitives)
          continue;
        for (const primitive of primitives) {
          const graphic = this.readMeshGraphic(primitive);
          if (undefined !== graphic)
            graphics.push(graphic);
        }
      }
    } else {
      for (const nodeKey of Object.keys(this._nodes)) {
        const meshValue = this._meshes[this._nodes[nodeKey]];
        const primitives = JsonUtils.asArray(meshValue?.primitives);
        if (undefined === primitives)
          continue;

        const layerId = meshValue.layer as string | undefined;

        if ("Node_Root" === nodeKey) {
          for (const primitive of primitives) {
            const graphic = this.readMeshGraphic(primitive);
            if (undefined !== graphic)
              graphics.push(graphic);
          }
        } else if (undefined === layerId) {
          const branch = new GraphicBranch(true);
          branch.animationId = `${this._modelId}_${nodeKey}`;
          for (const primitive of primitives) {
            const graphic = this.readMeshGraphic(primitive);
            if (undefined !== graphic)
              branch.add(graphic);
          }

          if (!branch.isEmpty)
            graphics.push(this._system.createBranch(branch, Transform.createIdentity()));
        } else {
          const layerGraphics: RenderGraphic[] = [];
          for (const primitive of primitives) {
            const graphic = this.readMeshGraphic(primitive);
            if (undefined !== graphic)
              layerGraphics.push(graphic);
          }

          if (layerGraphics.length > 0) {
            const layerGraphic = 1 === layerGraphics.length ? layerGraphics[0] : this._system.createGraphicList(layerGraphics);
            graphics.push(this._system.createGraphicLayer(layerGraphic, layerId));
          }
        }
      }
    }

    let tileGraphic: RenderGraphic | undefined;
    switch (graphics.length) {
      case 0:
        break;
      case 1:
        tileGraphic = graphics[0];
        break;
      default:
        tileGraphic = this._system.createGraphicList(graphics);
        break;
    }

    if (undefined !== tileGraphic)
      tileGraphic = this._system.createBatch(tileGraphic, featureTable, contentRange, this._options);

    return {
      readStatus: TileReadStatus.Success,
      isLeaf,
      sizeMultiplier,
      contentRange: contentRange.isNull ? undefined : contentRange,
      graphic: tileGraphic,
      emptySubRangeMask,
    };
  }
}
