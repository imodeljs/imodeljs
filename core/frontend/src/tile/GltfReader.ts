/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, ByteStream, Id64String, JsonUtils, utf8ToString } from "@bentley/bentleyjs-core";
import { Angle, IndexedPolyface, Matrix3d, Point2d, Point3d, Polyface, Range2d, Range3d, Transform, Vector3d } from "@bentley/geometry-core";
import {
  BatchType, ColorDef, ElementAlignedBox3d, FeatureTable, FillFlags, GltfBufferData, GltfBufferView, GltfDataType, GltfHeader, GltfMeshMode,
  ImageSource, ImageSourceFormat, LinePixels, MeshEdge, MeshEdges, MeshPolyline, MeshPolylineList, OctEncodedNormal, PackedFeatureTable, QParams2d, QParams3d, QPoint2dList, QPoint3dList,
  Quantization,
  RenderTexture, TextureMapping, TileReadStatus,
} from "@bentley/imodeljs-common";
import { getImageSourceFormatForMimeType, imageElementFromImageSource } from "../ImageUtil";
import { IModelConnection } from "../IModelConnection";
import { GraphicBranch } from "../render/GraphicBranch";
import { InstancedGraphicParams } from "../render/InstancedGraphicParams";
import { DisplayParams } from "../render/primitives/DisplayParams";
import { Mesh, MeshGraphicArgs } from "../render/primitives/mesh/MeshPrimitives";
import { RealityMeshPrimitive } from "../render/primitives/mesh/RealityMeshPrimitive";
import { RenderGraphic } from "../render/RenderGraphic";
import { RenderSystem } from "../render/RenderSystem";
import { RealityTileGeometry, TileContent } from "./internal";

// eslint-disable-next-line prefer-const
let forceLUT = false;
/* eslint-disable no-restricted-syntax */

/* -----------------------------------
 * To restore the use of web workers to decode jpeg, locate and uncomment the three sections by searching for "webworker".
  import { WorkerOperation, WebWorkerManager } from "../WebWorkerManager";
  ------------------------------------ */

/** The result of [[GltfReader.read]].
 * @internal
 */
export interface GltfReaderResult extends TileContent {
  readStatus: TileReadStatus;
}

/** Data required for creating a [[GltfReader]] capable of deserializing [glTF](https://www.khronos.org/gltf/).
 * @internal
 */
export class GltfReaderProps {
  private constructor(public readonly buffer: ByteStream,
    public readonly binaryData: Uint8Array,
    public readonly accessors: any,
    public readonly bufferViews: any,
    public readonly scene: any,
    public readonly nodes: any,
    public readonly meshes: any,
    public readonly materials: any,
    public readonly extensions: any,
    public readonly samplers: any,
    public readonly techniques: any,
    public readonly yAxisUp: boolean) { }

  /** Attempt to construct a new GltfReaderProps from the binary data beginning at the supplied stream's current read position. */
  public static create(buffer: ByteStream, yAxisUp: boolean = false): GltfReaderProps | undefined {
    const header = new GltfHeader(buffer);
    if (!header.isValid)
      return undefined;

    const binaryData = new Uint8Array(buffer.arrayBuffer, header.binaryPosition);
    buffer.curPos = header.scenePosition;
    const sceneStrData = buffer.nextBytes(header.sceneStrLength);
    const sceneStr = utf8ToString(sceneStrData);
    if (undefined === sceneStr)
      return undefined;

    try {
      const sceneValue = JSON.parse(sceneStr);
      const nodes = JsonUtils.asObject(sceneValue.nodes);
      const meshes = JsonUtils.asObject(sceneValue.meshes);
      const materialValues = JsonUtils.asObject(sceneValue.materials);
      const accessors = JsonUtils.asObject(sceneValue.accessors);
      const bufferViews = JsonUtils.asObject(sceneValue.bufferViews);
      const extensions = JsonUtils.asObject(sceneValue.extensions);
      const samplers = JsonUtils.asObject(sceneValue.samplers);
      const techniques = JsonUtils.asObject(sceneValue.techniques);

      if (undefined === meshes)
        return undefined;

      return new GltfReaderProps(buffer, binaryData, accessors, bufferViews, sceneValue, nodes, meshes, materialValues, extensions, samplers, techniques, yAxisUp);
    } catch (e) {
      return undefined;
    }
  }
}

/** The GltfMeshData contains the raw GLTF mesh data. If the data is suitable to create a [[RealityMesh]] directly, basically in the quantized format produced by
  * ContextCapture, then a RealityMesh is created directly from this data.  Otherwise, the mesh primitive is populated from the raw data and a MeshPrimitive
  * is generated.   The MeshPrimitve path is much less efficient but should be rarely used.
  *
  * @internal
  */
export class GltfMeshData {
  public primitive: Mesh;       // Populated with vertex and indices only if the mesh cannot be represented as [[RealityMesh]]
  public pointQParams?: QParams3d;
  public points?: Uint16Array;
  public pointRange?: Range3d;
  public normals?: Uint16Array;
  public uvQParams?: QParams2d;
  public uvs?: Uint16Array;
  public uvRange?: Range2d;
  public indices?: Uint16Array | Uint32Array;

  public constructor(props: Mesh) {
    this.primitive = props;
  }
}

/** A function that returns true if deserialization of the data supplied by the reader should abort.
 * @internal
 */
export type ShouldAbortReadGltf = (reader: GltfReader) => boolean;

/* -----------------------------------
   This is part of the webworker option.

  // input is Uint8Array, the result is an ImageBitMap.
  class ImageDecodeWorkerOperation extends WorkerOperation {
    constructor(imageBytes: ArrayBuffer, imageMimeType: string) {
      super("imageBytesToImageBitmap", [imageBytes, imageMimeType], [imageBytes]);
    }
  }
-------------------------------------- */

/** Deserializes [glTF](https://www.khronos.org/gltf/).
 * @internal
 */
export abstract class GltfReader {
  protected readonly _buffer: ByteStream;
  protected readonly _scene: any;
  protected readonly _accessors: any;
  protected readonly _bufferViews: any;
  protected readonly _meshes: any;
  protected readonly _nodes: any;
  protected readonly _batchData: any;
  protected readonly _materialValues: any;
  protected readonly _textures: any;
  protected readonly _renderMaterials: any;  // Materials that may be deserialized and created directly
  protected readonly _namedTextures: any;    // Textures that may be deserialized and created directly
  protected readonly _images: any;
  protected readonly _samplers: any;
  protected readonly _techniques: any;
  protected readonly _extensions: any;
  protected readonly _binaryData: Uint8Array;
  protected readonly _iModel: IModelConnection;
  protected readonly _is3d: boolean;
  protected readonly _modelId: Id64String;
  protected readonly _system: RenderSystem;
  protected readonly _returnToCenter: number[] | undefined;
  protected readonly _yAxisUp: boolean;
  protected readonly _type: BatchType;
  private readonly _canceled?: ShouldAbortReadGltf;

  /* -----------------------------------
  private static _webWorkerManager: WebWorkerManager;

  private static get webWorkerManager() {
    if (!GltfReader._webWorkerManager) {
      GltfReader._webWorkerManager = new WebWorkerManager("v" + BUILD_SEMVER + "/frontend-webworker.js", 4);
    }
    return GltfReader._webWorkerManager;
  }
  ------------------------------------- */

  /** Asynchronously deserialize the tile data and return the result. */
  public abstract read(): Promise<GltfReaderResult>;

  protected get _isCanceled(): boolean { return undefined !== this._canceled && this._canceled(this); }
  protected get _isVolumeClassifier(): boolean { return BatchType.VolumeClassifier === this._type; }

  private _getNodes(): any[] {
    const nodes = [];

    const childNodes = new Set<string>();
    for (const key of Object.keys(this._nodes)) {
      const node = this._nodes[key];
      if (node.children)
        for (const child of node.children)
          childNodes.add(child.toString());
    }

    for (const nodeKey of Object.keys(this._nodes))
      if (!childNodes.has(nodeKey))
        nodes.push(this._nodes[nodeKey]);

    return nodes;
  }

  public readGltfAndCreateGeometry(transformToRoot?: Transform, needNormals = false, needParams = false): RealityTileGeometry {
    const tileTransform = this.getTileTransform(transformToRoot);
    const polyfaces =  new Array<Polyface>();
    for (const node of this._getNodes())
      this.readNodeAndCreatePolyfaces(polyfaces, node, tileTransform, needNormals, needParams);

    return { polyfaces };
  }

  private getTileTransform(transformToRoot?: Transform, pseudoRtcBias?: Vector3d) {
    let transform;

    if (undefined !== this._returnToCenter || undefined !== pseudoRtcBias || this._yAxisUp || undefined !== transformToRoot) {
      if (undefined !== this._returnToCenter)
        transform = Transform.createTranslationXYZ(this._returnToCenter[0], this._returnToCenter[1], this._returnToCenter[2]);
      else if (undefined !== pseudoRtcBias)
        transform = Transform.createTranslationXYZ(pseudoRtcBias.x, pseudoRtcBias.y, pseudoRtcBias.z);
      else
        transform = Transform.createIdentity();

      if (this._yAxisUp)
        transform = transform.multiplyTransformMatrix3d(Matrix3d.createRotationAroundVector(Vector3d.create(1.0, 0.0, 0.0), Angle.createRadians(Angle.piOver2Radians)) as Matrix3d);
      if (undefined !== transformToRoot)
        transform = transformToRoot.multiplyTransformTransform(transform);

    }
    return transform;
  }

  protected readGltfAndCreateGraphics(isLeaf: boolean, featureTable: FeatureTable, contentRange: ElementAlignedBox3d, transformToRoot?: Transform, pseudoRtcBias?: Vector3d, instances?: InstancedGraphicParams): GltfReaderResult {
    if (this._isCanceled)
      return { readStatus: TileReadStatus.Canceled, isLeaf };

    if (this._returnToCenter !== undefined || this._nodes[0]?.matrix !== undefined || (pseudoRtcBias !== undefined && pseudoRtcBias.magnitude() < 1.0E5))
      pseudoRtcBias = undefined;

    const renderGraphicList: RenderGraphic[] = [];
    let readStatus: TileReadStatus = TileReadStatus.InvalidTileData;
    for (const node of this._getNodes())
      if (TileReadStatus.Success !== (readStatus = this.readNodeAndCreateGraphics(renderGraphicList, node, featureTable, undefined, instances, pseudoRtcBias)))
        return { readStatus, isLeaf };

    if (0 === renderGraphicList.length)
      return { readStatus: TileReadStatus.InvalidTileData, isLeaf };

    let renderGraphic: RenderGraphic | undefined;
    if (1 === renderGraphicList.length)
      renderGraphic = renderGraphicList[0];
    else
      renderGraphic = this._system.createGraphicList(renderGraphicList);

    const transform = this.getTileTransform(transformToRoot, pseudoRtcBias);
    let range = contentRange;
    if (transform)
      range = transform.inverse()!.multiplyRange(range);

    renderGraphic = this._system.createBatch(renderGraphic, PackedFeatureTable.pack(featureTable), range);
    if (transform) {
      const branch = new GraphicBranch(true);
      branch.add(renderGraphic);
      renderGraphic = this._system.createBranch(branch, transform);
    }

    return {
      readStatus,
      isLeaf,
      contentRange,
      graphic: renderGraphic,
    };
  }

  private graphicFromMeshData(gltfMesh: GltfMeshData, meshGraphicArgs: MeshGraphicArgs, instances?: InstancedGraphicParams) {
    if (!gltfMesh.points || !gltfMesh.pointRange) {
      assert(false);
      return;
    }
    const realityMeshPrimitive = (forceLUT || instances)  ? undefined : RealityMeshPrimitive.createFromGltfMesh(gltfMesh);
    if (realityMeshPrimitive) {
      const realityMesh = this._system.createRealityMesh(realityMeshPrimitive);
      if (realityMesh)
        return realityMesh;
    }
    const mesh = gltfMesh.primitive;
    const pointCount = gltfMesh.points.length / 3;
    mesh.points.fromTypedArray(gltfMesh.pointRange, gltfMesh.points);
    if (mesh.triangles && gltfMesh.indices)
      mesh.triangles.addFromTypedArray(gltfMesh.indices);

    if (gltfMesh.uvs && gltfMesh.uvRange && gltfMesh.uvQParams) {
      /** This is ugly and inefficient... unnecessary if Mesh stored uvs as QPoint2dList */
      for (let i = 0, j = 0; i < pointCount; i++)
        mesh.uvParams.push(gltfMesh.uvQParams.unquantize(gltfMesh.uvs[j++], gltfMesh.uvs[j++]));
    }
    if (gltfMesh.normals)
      for (const normal of gltfMesh.normals)
        mesh.normals.push(new OctEncodedNormal(normal));

    return mesh.getGraphics(meshGraphicArgs, this._system, instances);
  }

  private getNodeTransform(node: any, parentTransform: Transform | undefined): Transform | undefined {
    let thisTransform = parentTransform;
    if (Array.isArray(node.matrix)) {
      const jTrans = node.matrix;
      const nodeTransform = Transform.createOriginAndMatrix(Point3d.create(jTrans[12], jTrans[13], jTrans[14]), Matrix3d.createRowValues(jTrans[0], jTrans[4], jTrans[8], jTrans[1], jTrans[5], jTrans[9], jTrans[2], jTrans[6], jTrans[10]));
      thisTransform = thisTransform ? thisTransform.multiplyTransformTransform(nodeTransform) : nodeTransform;
    }
    return thisTransform;
  }

  private readMeshPrimitives(node: any, featureTable?: FeatureTable, thisBias?: Vector3d): GltfMeshData[] {
    const meshes = new Array<GltfMeshData>();
    const meshKey = node.meshes ? node.meshes : node.mesh;
    if (undefined !== meshKey) {
      const nodeMesh = this._meshes[meshKey];
      if (nodeMesh) {
        for (const primitive of nodeMesh.primitives) {
          const geometry = this.readMeshPrimitive(primitive, featureTable, thisBias);
          if (undefined !== geometry)
            meshes.push(geometry);
        }
      }
    }
    return meshes;
  }
  private polyfaceFromGltfMesh(mesh: GltfMeshData, transform: Transform | undefined , needNormals: boolean, needParams: boolean): Polyface | undefined {
    if (!mesh.pointQParams || !mesh.points || !mesh.indices) {
      return undefined;
    }
    const { points, pointQParams, normals, uvs, uvQParams, indices } = mesh;

    const includeNormals = needNormals && undefined !== normals;
    const includeParams = needParams && undefined !== uvQParams && undefined !== uvs;

    const polyface = IndexedPolyface.create(includeNormals, includeParams);
    for (let i = 0; i < points.length; ) {
      const point = pointQParams.unquantize(points[i++], points[i++], points[i++]);
      if (transform)
        transform.multiplyPoint3d(point, point);

      polyface.addPoint(point);
    }

    if (includeNormals && normals)
      for (let i = 0; i < normals.length; )
        polyface.addNormal(OctEncodedNormal.decodeValue(normals[i++]));

    if (includeParams && uvs && uvQParams)
      for (let i = 0; i < uvs.length; )
        polyface.addParam(uvQParams.unquantize(uvs[i++], uvs[i++]));

    let j = 0;
    indices.forEach((index: number) => {
      polyface.addPointIndex(index);
      if (includeNormals)
        polyface.addNormalIndex(index);
      if (includeParams)
        polyface.addParamIndex(index);
      if (0 === (++j % 3))
        polyface.terminateFacet();
    });
    return polyface;

  }

  private readNodeAndCreatePolyfaces(polyfaces: Polyface[], node: any, parentTransform: Transform | undefined, needNormals: boolean, needParams: boolean) {
    const thisTransform = this.getNodeTransform(node, parentTransform);
    const meshes = this.readMeshPrimitives(node);

    for (const mesh of meshes) {
      const polyface = this.polyfaceFromGltfMesh (mesh, thisTransform, needNormals, needParams);
      if (polyface)
        polyfaces.push(polyface);
    }

    if (node.children) {
      for (const child of node.children)
        this.readNodeAndCreatePolyfaces(polyfaces, this._nodes[child], thisTransform, needNormals, needParams);
    }
  }

  private readNodeAndCreateGraphics(renderGraphicList: RenderGraphic[], node: any, featureTable: FeatureTable, parentTransform: Transform | undefined, instances?: InstancedGraphicParams, pseudoRtcBias?: Vector3d): TileReadStatus {
    if (undefined === node)
      return TileReadStatus.InvalidTileData;

    const thisTransform = this.getNodeTransform(node, parentTransform);

    let thisBias;
    /**
     * This is a workaround for tiles generated by
     * context capture which have a large offset from the tileset origin that exceeds the
     * capacity of 32 bit integers. It is essentially an ad hoc RTC applied at read time only if the tile is far from the
     * origin and there is no RTC supplied either with the B3DM of the GLTF.
     * as the vertices are supplied in a quantized format, applying the RTC bias to
     * quantization origin will make these tiles work correctly.
     */
    if (undefined !== pseudoRtcBias) {
      thisBias = (undefined === thisTransform) ? pseudoRtcBias : thisTransform.matrix.multiplyInverse(pseudoRtcBias);
    }
    const meshes = this.readMeshPrimitives(node, featureTable, thisBias);

    let renderGraphic: RenderGraphic | undefined;
    if (0 !== meshes.length) {
      const meshGraphicArgs = new MeshGraphicArgs();
      if (1 === meshes.length) {
        renderGraphic = this.graphicFromMeshData(meshes[0], meshGraphicArgs, instances);
      } else {
        const thisList: RenderGraphic[] = [];        for (const mesh of meshes) {
          renderGraphic = this.graphicFromMeshData(mesh, meshGraphicArgs, instances);
          if (undefined !== renderGraphic)
            thisList.push(renderGraphic);
        }
        if (0 !== thisList.length)
          renderGraphic = this._system.createGraphicList(thisList);
      }
      if (renderGraphic) {
        if (thisTransform && !thisTransform.isIdentity) {
          const branch = new GraphicBranch(true);
          branch.add(renderGraphic);
          renderGraphic = this._system.createBranch(branch, thisTransform);
        }
        renderGraphicList.push(renderGraphic);
      }
    }
    if (node.children) {
      for (const child of node.children)
        this.readNodeAndCreateGraphics(renderGraphicList, this._nodes[child], featureTable, thisTransform, instances);
    }
    return TileReadStatus.Success;
  }

  public getBufferView(json: any, accessorName: string): GltfBufferView | undefined {
    try {
      const accessorValue = JsonUtils.asString(json[accessorName]);
      const accessor = 0 < accessorValue.length ? JsonUtils.asObject(this._accessors[accessorValue]) : undefined;
      const bufferViewAccessorValue = undefined !== accessor ? JsonUtils.asString(accessor.bufferView) : "";
      const bufferView = 0 < bufferViewAccessorValue.length ? JsonUtils.asObject(this._bufferViews[bufferViewAccessorValue]) : undefined;

      if (undefined === accessor)
        return undefined;

      const type = accessor.componentType as GltfDataType;
      let dataSize = 0;
      switch (type) {
        case GltfDataType.UnsignedByte:
          dataSize = 1;
          break;
        case GltfDataType.UnsignedShort:
          dataSize = 2;
          break;
        case GltfDataType.UInt32:
        case GltfDataType.Float:
          dataSize = 4;
          break;
        default:
          return undefined;
      }
      let componentCount = 1;
      switch (accessor.type) {
        case "VEC3":
          componentCount = 3;
          break;
        case "VEC2":
          componentCount = 2;
          break;
      }

      const byteStride = bufferView.byteStride ? bufferView.byteStride : componentCount * dataSize;
      const offset = ((bufferView && bufferView.byteOffset) ? bufferView.byteOffset : 0) + (accessor.byteOffset ? accessor.byteOffset : 0);
      const length = byteStride * accessor.count;
      // If the data is misaligned (Scalable mesh tile publisher) use slice to copy -- else use subarray.
      // assert(0 === offset % dataSize);
      const bytes = (0 === (this._binaryData.byteOffset + offset) % dataSize) ? this._binaryData.subarray(offset, offset + length) : this._binaryData.slice(offset, offset + length);
      return new GltfBufferView(bytes, accessor.count as number, type, accessor, byteStride / dataSize);
    } catch (e) {
      return undefined;
    }
  }

  public readBufferData32(json: any, accessorName: string): GltfBufferData | undefined { return this.readBufferData(json, accessorName, GltfDataType.UInt32); }
  public readBufferData16(json: any, accessorName: string): GltfBufferData | undefined { return this.readBufferData(json, accessorName, GltfDataType.UnsignedShort); }
  public readBufferData8(json: any, accessorName: string): GltfBufferData | undefined { return this.readBufferData(json, accessorName, GltfDataType.UnsignedByte); }
  public readBufferDataFloat(json: any, accessorName: string): GltfBufferData | undefined { return this.readBufferData(json, accessorName, GltfDataType.Float); }

  protected constructor(props: GltfReaderProps, iModel: IModelConnection, modelId: Id64String, is3d: boolean, system: RenderSystem, type: BatchType = BatchType.Primary, isCanceled?: ShouldAbortReadGltf) {
    this._buffer = props.buffer;
    this._scene = props.scene;
    this._binaryData = props.binaryData;
    this._accessors = props.accessors;
    this._bufferViews = props.bufferViews;
    this._meshes = props.meshes;
    this._nodes = props.nodes;
    this._materialValues = props.materials;
    this._samplers = props.samplers;
    this._techniques = props.techniques;
    this._extensions = props.extensions;
    this._yAxisUp = props.yAxisUp;
    this._returnToCenter = this.extractReturnToCenter(props.extensions);
    this._textures = props.scene.textures;
    this._images = props.scene.images;

    this._renderMaterials = props.scene.renderMaterials;
    this._namedTextures = props.scene.namedTextures;

    this._iModel = iModel;
    this._modelId = modelId;
    this._is3d = is3d;
    this._system = system;
    this._type = type;
    this._canceled = isCanceled;
  }

  protected readBufferData(json: any, accessorName: string, type: GltfDataType): GltfBufferData | undefined {
    const view = this.getBufferView(json, accessorName);
    return undefined !== view ? view.toBufferData(type) : undefined;
  }

  protected readFeatureIndices(_json: any): number[] | undefined { return undefined; }

  private colorFromJson(values: number[]): ColorDef { return ColorDef.from(values[0] * 255, values[1] * 255, values[2] * 255, (1.0 - values[3]) * 255); }

  private colorFromMaterial(materialJson: any): ColorDef {
    if (materialJson) {
      if (materialJson.values && Array.isArray(materialJson.values.color))
        return this.colorFromJson(materialJson.values.color);
      else if (materialJson.pbrMetallicRoughness && Array.isArray(materialJson.pbrMetallicRoughness.baseColorFactor))
        return this.colorFromJson(materialJson.pbrMetallicRoughness.baseColorFactor);
      else if (materialJson.extensions && materialJson.extensions.KHR_techniques_webgl && materialJson.extensions.KHR_techniques_webgl.values && materialJson.extensions.KHR_techniques_webgl.values.u_color)
        return this.colorFromJson(materialJson.extensions.KHR_techniques_webgl.values.u_color);
    }

    return ColorDef.white;
  }

  private extractTextureId(materialJson: any): string | undefined {
    if (typeof materialJson !== "object")
      return undefined;

    const extractId = (value: any) => {
      switch (typeof value) {
        case "string":
          return value;
        case "number":
          return value.toString();
        default:
          return undefined;
      }
    };

    // Bimium's shader value...almost certainly obsolete at this point.
    let id = extractId(materialJson.values?.tex);
    if (undefined !== id)
      return id;

    // KHR_techniques_webgl extension
    const techniques = this._extensions?.KHR_techniques_webgl?.techniques;
    const ext = Array.isArray(techniques) ? materialJson.extensions?.KHR_techniques_webgl : undefined;
    if (undefined !== ext && typeof ext.values === "object") {
      const uniforms = typeof ext.technique === "number" ? techniques[ext.technique].uniforms : undefined;
      if (typeof uniforms === "object") {
        for (const uniformName of Object.keys(uniforms)) {
          const uniform = uniforms[uniformName];
          if (typeof uniform === "object" && uniform.type === GltfDataType.Sampler2d)
            return extractId(ext.values[uniformName]?.index);
        }
      }
    }

    id = extractId(materialJson.diffuseTexture?.index);
    id = id ?? extractId(materialJson.emissiveTexture?.index);
    return id ?? extractId(materialJson.pbrMetallicRoughness?.baseColorTexture?.index);
  }

  protected createDisplayParams(materialJson: any, hasBakedLighting: boolean): DisplayParams | undefined {
    const textureId = this.extractTextureId(materialJson);
    const textureMapping = undefined !== textureId ? this.findTextureMapping(textureId) : undefined;
    const color = this.colorFromMaterial(materialJson);
    return new DisplayParams(DisplayParams.Type.Mesh, color, color, 1, LinePixels.Solid, FillFlags.Always, undefined, undefined, hasBakedLighting, textureMapping);
  }
  protected extractReturnToCenter(extensions: any): number[] | undefined {
    if (extensions === undefined) { return undefined; }
    const cesiumRtc = JsonUtils.asObject(extensions.CESIUM_RTC);
    if (cesiumRtc === undefined) return undefined;
    const rtc = JsonUtils.asArray(cesiumRtc.center);
    return (rtc[0] === 0.0 && rtc[1] === 0.0 && rtc[2] === 0.0) ? undefined : rtc;
  }

  protected readMeshPrimitive(primitive: any, featureTable?: FeatureTable, pseudoRtcBias?: Vector3d): GltfMeshData | undefined {
    const materialName = JsonUtils.asString(primitive.material);
    const hasBakedLighting = undefined === primitive.attributes.NORMAL;
    const materialValue = 0 < materialName.length ? JsonUtils.asObject(this._materialValues[materialName]) : undefined;
    const displayParams = this.createDisplayParams(materialValue, hasBakedLighting);
    if (undefined === displayParams)
      return undefined;

    let primitiveType: number = -1;
    const meshMode = JsonUtils.asInt(primitive.mode, GltfMeshMode.Triangles);
    switch (meshMode) {
      case GltfMeshMode.Lines:
        primitiveType = Mesh.PrimitiveType.Polyline;
        break;

      case GltfMeshMode.Points:
        primitiveType = Mesh.PrimitiveType.Point;
        break;

      case GltfMeshMode.Triangles:
        primitiveType = Mesh.PrimitiveType.Mesh;
        break;

      default:
        assert(false);
        return undefined;
    }
    const isPlanar = JsonUtils.asBool(primitive.isPlanar);

    const isVolumeClassifier = this._isVolumeClassifier;
    const meshPrimitive = Mesh.create({
      displayParams,
      features: undefined !== featureTable ? new Mesh.Features(featureTable) : undefined,
      type: primitiveType,
      range: Range3d.createNull(),
      is2d: !this._is3d,
      isPlanar,
      hasBakedLighting,
      isVolumeClassifier,
    });
    const mesh = new GltfMeshData(meshPrimitive);

    // We don't have real colormap - just load material color.  This will be used if non-Bentley
    // tile or fit the color table is uniform. For a non-Bentley, non-Uniform, we'll set the
    // uv parameters to pick the colors out of the color map texture.
    meshPrimitive.colorMap.insert(displayParams.fillColor.tbgr);   // White...

    const colorIndices = this.readBufferData16(primitive.attributes, "_COLORINDEX");
    if (undefined !== colorIndices) {
      let texStep;
      if (materialValue.values !== undefined && Array.isArray(materialValue.values.texStep))
        texStep = materialValue.values.texStep;
      else if (materialValue.extensions && materialValue.extensions.KHR_techniques_webgl && materialValue.extensions.KHR_techniques_webgl.values && Array.isArray(materialValue.extensions.KHR_techniques_webgl.values.u_texStep))
        texStep = materialValue.extensions.KHR_techniques_webgl.values.u_texStep;

      if (texStep) {
        const uvParams = [];
        for (let i = 0; i < colorIndices.count; i++)
          uvParams.push(new Point2d(texStep[1] + texStep[0] * colorIndices.buffer[i], .5));

        const paramList = QPoint2dList.fromPoints(uvParams);
        mesh.uvs = paramList.toTypedArray();
        mesh.uvQParams = paramList.params;
      }
    }

    if (primitive.extensions?.KHR_draco_mesh_compression) {
      return undefined; // Defer Draco decompression until web workers implementation.
      /*
      const dracoExtension = primitive.extensions.KHR_draco_mesh_compression;
      const bufferView = this._bufferViews[dracoExtension.bufferView];
      if (undefined === bufferView) return undefined;
      const bufferData = this._binaryData.subarray(bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength);

      return DracoDecoder.readDracoMesh(mesh, primitive, bufferData, dracoExtension.attributes); */
    }

    this.readBatchTable(mesh.primitive, primitive);

    if (!this.readVertices(mesh, primitive, pseudoRtcBias))
      return undefined;

    switch (primitiveType) {
      case Mesh.PrimitiveType.Mesh: {
        if (!this.readMeshIndices(mesh, primitive))
          return undefined;

        if (!displayParams.ignoreLighting && !this.readNormals(mesh, primitive.attributes, "NORMAL"))
          return undefined;

        if (!mesh.uvs)
          this.readUVParams(mesh, primitive.attributes, "TEXCOORD_0");
        break;
      }

      case Mesh.PrimitiveType.Polyline:
      case Mesh.PrimitiveType.Point: {
        if (undefined !== mesh.primitive.polylines && !this.readPolylines(mesh.primitive.polylines, primitive, "indices", Mesh.PrimitiveType.Point === primitiveType))
          return undefined;
        break;
      }
      default: {
        assert(false, "unhandled primitive type");
        return undefined;
      }
    }
    if (displayParams.textureMapping && !mesh.uvs)
      return undefined;

    if (primitive.extensions?.CESIUM_primitive_outline) {
      const data = this.readBufferData32(primitive.extensions.CESIUM_primitive_outline, "indices");
      if (data !== undefined) {
        assert(0 === data.count % 2);
        mesh.primitive.edges = new MeshEdges();
        for (let i = 0; i < data.count;)
          mesh.primitive.edges.visible.push(new MeshEdge(data.buffer[i++], data.buffer[i++]));
      }
    }

    return mesh;
  }

  /**
   *
   * @param positions quantized points
   * @param primitive input json
   * @param pseudoRtcBias a bias applied to each point - this is a workaround for tiles generated by
   * context capture which have a large offset from the tileset origin that exceeds the
   * capacity of 32 bit integers. This is essentially an ad hoc RTC applied at read time.
   */
  private readVertices(mesh: GltfMeshData, primitive: any, pseudoRtcBias?: Vector3d): boolean {
    const view = this.getBufferView(primitive.attributes, "POSITION");
    if (undefined === view)
      return false;

    if (GltfDataType.Float === view.type) {
      const buffer = view.toBufferData(GltfDataType.Float);
      if (undefined === buffer)
        return false;

      const strideSkip = view.stride - 3;
      mesh.pointRange = Range3d.createNull();
      for (let i = 0; i < buffer.buffer.length; i += strideSkip)
        mesh.pointRange.extendXYZ(buffer.buffer[i++], buffer.buffer[i++], buffer.buffer[i++]);

      const positions = new QPoint3dList(QParams3d.fromRange(mesh.pointRange));
      const scratchPoint = new Point3d();
      for (let i = 0, j = 0; i < buffer.count; i++, j += strideSkip) {
        scratchPoint.set(buffer.buffer[j++], buffer.buffer[j++], buffer.buffer[j++]);
        if (undefined !== pseudoRtcBias)
          scratchPoint.subtractInPlace(pseudoRtcBias);

        positions.add(scratchPoint);
      }
      mesh.pointQParams = positions.params;
      mesh.points = positions.toTypedArray();
    } else {
      if (GltfDataType.UnsignedShort !== view.type)
        return false;

      const extensions = JsonUtils.asObject(view.accessor.extensions);
      const quantized = undefined !== extensions ? JsonUtils.asObject(extensions.WEB3D_quantized_attributes) : undefined;
      if (undefined === quantized)
        return false;

      const rangeMin = JsonUtils.asArray(quantized.decodedMin);
      const rangeMax = JsonUtils.asArray(quantized.decodedMax);
      if (undefined === rangeMin || undefined === rangeMax)
        return false;

      const buffer = view.toBufferData(GltfDataType.UnsignedShort);
      if (undefined === buffer || ! (buffer.buffer instanceof Uint16Array))
        return false;

      assert (buffer.buffer instanceof Uint16Array);
      mesh.pointRange = Range3d.createXYZXYZ(rangeMin[0], rangeMin[1], rangeMin[2], rangeMax[0], rangeMax[1], rangeMax[2]);
      if (undefined !== pseudoRtcBias) {
        mesh.pointRange.low.subtractInPlace(pseudoRtcBias);
        mesh.pointRange.high.subtractInPlace(pseudoRtcBias);
      }
      mesh.pointQParams = QParams3d.fromRange( mesh.pointRange);
      if (3 === view.stride) {
        mesh.points = buffer.buffer;
      } else {
        mesh.points = new Uint16Array(3 * view.count);
        for (let i = 0, j = 0; i < view.count; i++) {
          const index = i * view.stride;
          mesh.points[j++] = buffer.buffer[index];
          mesh.points[j++] = buffer.buffer[index + 1];
          mesh.points[j++] = buffer.buffer[index + 2];
        }
      }
    }

    return true;
  }

  protected readIndices(json: any, accessorName: string): number[] | undefined {
    const data = this.readBufferData32(json, accessorName);
    if (undefined === data)
      return undefined;

    const indices = [];
    for (let i = 0; i < data.count; i++)
      indices.push(data.buffer[i]);

    return indices;
  }

  protected readBatchTable(_mesh: Mesh, _json: any) {
  }

  protected readMeshIndices(mesh: GltfMeshData, json: any): boolean {
    const data = this.readBufferData16(json, "indices") || this.readBufferData32(json, "indices");
    if (undefined === data || (!(data.buffer instanceof(Uint16Array)) && ! (data.buffer instanceof(Uint32Array))))
      return false;

    mesh.indices = data.buffer;

    return true;
  }

  protected readNormals(mesh: GltfMeshData, json: any, accessorName: string): boolean {
    const view = this.getBufferView(json, accessorName);
    if (undefined === view)
      return false;

    switch (view.type) {
      case GltfDataType.Float: {
        const data = view.toBufferData(GltfDataType.Float);
        if (undefined === data)
          return false;

        mesh.normals = new Uint16Array(data.count);
        const scratchNormal = new Vector3d();
        const strideSkip = view.stride - 3;
        for (let i = 0, j = 0; i < data.count; i++, j += strideSkip) {
          scratchNormal.set(data.buffer[j++], data.buffer[j++], data.buffer[j++]);
          mesh.normals[i] = OctEncodedNormal.encode(scratchNormal);
        }
        return true;
      }

      case GltfDataType.UnsignedByte: {
        const data = view.toBufferData(GltfDataType.UnsignedByte);
        if (undefined === data)
          return false;

        // ###TODO: we shouldn't have to allocate OctEncodedNormal objects...just use uint16s / numbers...
        mesh.normals = new Uint16Array(data.count);
        for (let i = 0; i < data.count; i++) {
          // ###TODO? not clear why ray writes these as pairs of uint8...
          const index = i * view.stride;
          const normal = data.buffer[index] | (data.buffer[index + 1] << 8);
          mesh.normals[i] = normal;
        }
        return true;
      }
      default:
        return false;
    }
  }

  private readUVParams(mesh: GltfMeshData, json: any, accessorName: string): boolean {
    const view = this.getBufferView(json, accessorName);
    let data: any;

    if (view === undefined)
      return false;

    switch (view.type) {
      case GltfDataType.Float: {
        data = this.readBufferDataFloat(json, accessorName);
        mesh.uvRange = Range2d.createNull();

        for (let i = 0; i < data.count; i++) {
          const index = view.stride * i; // 2 float per param...
          mesh.uvRange.extendXY(data.buffer[index], data.buffer[index + 1]);
        }
        mesh.uvQParams = QParams2d.fromRange(mesh.uvRange);
        mesh.uvs = new Uint16Array(data.count * 2);
        for (let i = 0, j = 0; i < data.count; i++) {
          const index = view.stride * i; // 2 float per param...
          mesh.uvs[j++] = Quantization.quantize(data.buffer[index], mesh.uvQParams.origin.x, mesh.uvQParams.scale.x);
          mesh.uvs[j++] = Quantization.quantize(data.buffer[index + 1], mesh.uvQParams.origin.y, mesh.uvQParams.scale.y);
        }
        return true;
      }

      case GltfDataType.UnsignedShort: {
        const extensions = JsonUtils.asObject(view.accessor.extensions);
        const quantized = undefined !== extensions ? JsonUtils.asObject(extensions.WEB3D_quantized_attributes) : undefined;
        if (undefined === quantized)
          return false;

        const rangeMin = JsonUtils.asArray(quantized.decodedMin);
        const rangeMax = JsonUtils.asArray(quantized.decodedMax);
        if (undefined === rangeMin || undefined === rangeMax)
          return false;

        const qData = view.toBufferData(GltfDataType.UnsignedShort);
        if (undefined === qData || ! (qData.buffer instanceof Uint16Array))
          return false;

        mesh.uvRange = Range2d.createXYXY(rangeMin[0], rangeMin[1], rangeMax[0], rangeMax[1]);
        mesh.uvQParams = QParams2d.fromRange( mesh.uvRange);
        if (2 === view.stride) {
          mesh.uvs = qData.buffer;
        } else {
          mesh.uvs = new Uint16Array(2 * view.count);
          for (let i = 0, j = 0; i < view.count; i++) {
            const index = i * view.stride;
            mesh.uvs[j++] = qData.buffer[index];
            mesh.uvs[j++] = qData.buffer[index + 1];
          }
        }
        return true;
      }
      default:
        assert (false);
        return false;

    }

    return true;
  }

  protected readPolylines(polylines: MeshPolylineList, json: any, accessorName: string, disjoint: boolean): boolean {
    const data = this.readBufferData32(json, accessorName);
    if (undefined === data)
      return false;

    const indices = new Array<number>();
    if (disjoint) {
      for (let i = 0; i < data.count;)
        indices.push(data.buffer[i++]);
    } else {
      for (let i = 0; i < data.count;) {
        const index0 = data.buffer[i++];
        const index1 = data.buffer[i++];
        if (0 === indices.length || index0 !== indices[indices.length - 1]) {
          if (indices.length !== 0) {
            polylines.push(new MeshPolyline(indices));
            indices.length = 0;
          }
          indices.push(index0);
        }
        indices.push(index1);
      }
    }
    if (indices.length !== 0)
      polylines.push(new MeshPolyline(indices));

    return true;
  }

  protected async loadTextures(): Promise<void> {
    if (undefined === this._textures)
      return;

    const transparentTextures: Set<string> = new Set<string>();
    for (const name of Object.keys(this._materialValues)) {
      const materialValue = this._materialValues[name];
      let technique;
      if (undefined !== materialValue.values &&
        undefined !== materialValue.values.tex &&
        undefined !== materialValue.technique &&
        undefined !== (technique = this._techniques[materialValue.technique]) &&
        undefined !== technique.states &&
        Array.isArray(technique.states.enable)) {
        for (const enable of technique.states.enable)
          if (enable === 3042)
            transparentTextures.add(materialValue.values.tex);
      }
    }

    const promises = new Array<Promise<void>>();
    for (const name of Object.keys(this._textures))
      promises.push(this.loadTexture(name, transparentTextures.has(name)));

    if (promises.length > 0)
      await Promise.all(promises);
  }

  protected async loadTextureImage(imageJson: any, samplerJson: any, isTransparent: boolean): Promise<RenderTexture | undefined> {
    try {
      const binaryImageJson = (imageJson.extensions && imageJson.extensions.KHR_binary_glTF) ? JsonUtils.asObject(imageJson.extensions.KHR_binary_glTF) : imageJson;
      const bufferView = this._bufferViews[binaryImageJson.bufferView];
      const mimeType = JsonUtils.asString(binaryImageJson.mimeType);
      const format = getImageSourceFormatForMimeType(mimeType);
      if (undefined === format)
        return undefined;

      let textureType = RenderTexture.Type.Normal;
      if (undefined !== samplerJson &&
        (undefined !== samplerJson.wrapS || undefined !== samplerJson.wrapT))
        textureType = RenderTexture.Type.TileSection;
      const textureParams = new RenderTexture.Params(undefined, textureType);
      const offset = bufferView.byteOffset;

      /* -----------------------------------
          const jpegArray = this._binaryData.slice(offset, offset + bufferView.byteLength);
          const jpegArrayBuffer = jpegArray.buffer;
          const workerOp = new ImageDecodeWorkerOperation(jpegArrayBuffer, mimeType);
          try {
            const imageBitmap = await GltfReader.webWorkerManager.queueOperation(workerOp)
            return this._isCanceled ? undefined : this._system.createTextureFromImage(imageBitmap, isTransparent && ImageSourceFormat.Png === format, this._iModel, textureParams))
          } catch (_) {
            return undefined;
          }
        ------------------------------------- */

      const bytes = this._binaryData.subarray(offset, offset + bufferView.byteLength);
      const imageSource = new ImageSource(bytes, format);
      try {
        const image = await imageElementFromImageSource(imageSource);
        return this._isCanceled ? undefined : this._system.createTextureFromImage(image, isTransparent && ImageSourceFormat.Png === format, this._iModel, textureParams);
      } catch (_) {
        return undefined;
      }
    } catch (e) {
      return undefined;
    }
  }

  protected async loadTexture(textureId: string, isTransparent: boolean): Promise<void> {
    const textureJson = JsonUtils.asObject(this._textures[textureId]);
    if (undefined === textureJson)
      return;

    const texture = await this.loadTextureImage(this._images[textureJson.source], undefined === this._samplers ? undefined : this._samplers[textureJson.sampler], isTransparent);
    textureJson.renderTexture = texture;
  }

  protected findTextureMapping(textureId: string): TextureMapping | undefined {
    const textureJson = JsonUtils.asObject(this._textures[textureId]);
    const texture = undefined !== textureJson ? textureJson.renderTexture as RenderTexture : undefined;
    return undefined !== texture ? new TextureMapping(texture, new TextureMapping.Params()) : undefined;
  }
}
