/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { assert, dispose } from "@bentley/bentleyjs-core";
import { Angle, Point2d, Point3d, Range3d, Vector2d, Vector3d } from "@bentley/geometry-core";
import { Npc, QParams2d, QParams3d, QPoint2dList, QPoint3dList, RenderMode, RenderTexture } from "@bentley/imodeljs-common";
import { SkyBox } from "../../DisplayStyleState";
import { FlashMode } from "../../FlashSettings";
import { TesselatedPolyline } from "../primitives/VertexTable";
import { RenderMemory } from "../RenderMemory";
import { AttributeMap } from "./AttributeMap";
import { ColorInfo } from "./ColorInfo";
import { WebGLDisposable } from "./Disposable";
import { DrawParams, ShaderProgramParams } from "./DrawCommand";
import { LineCode } from "./LineCode";
import { fromSumOf, FrustumUniformType } from "./FrustumUniforms";
import { GL } from "./GL";
import { BufferHandle, BufferParameters, BuffersContainer, QBufferHandle2d, QBufferHandle3d } from "./AttributeBuffers";
import { InstancedGeometry } from "./InstancedGeometry";
import { MaterialInfo } from "./Material";
import { EdgeGeometry, MeshGeometry, SilhouetteEdgeGeometry, SurfaceGeometry } from "./Mesh";
import { PointCloudGeometry } from "./PointCloud";
import { CompositeFlags, RenderOrder, RenderPass } from "./RenderFlags";
import { System } from "./System";
import { Target } from "./Target";
import { computeCompositeTechniqueId, TechniqueId } from "./TechniqueId";
import { RealityMeshGeometry } from "./RealityMesh";
import { TextureHandle } from "./Texture";
import { VertexLUT } from "./VertexLUT";
import { PlanarGridGeometry } from "./PlanarGrid";

const scratchVec3a = new Vector3d();
const scratchVec3b = new Vector3d();
const scratchVec3c = new Vector3d();
const scratchPoint3a = new Point3d();
const scratchPoint3b = new Point3d();
const scratchPoint3c = new Point3d();
const scratchPoint3d = new Point3d();

/** Represents a geometric primitive ready to be submitted to the GPU for rendering.
 * @internal
 */
export abstract class CachedGeometry implements WebGLDisposable, RenderMemory.Consumer {
  protected _range?: Range3d;
  /**
   * Functions for obtaining a subclass of CachedGeometry.
   * IMPORTANT: Do NOT use code like `const surface = cachedGeom as SurfaceGeometry`.
   * Instanced geometry holds a reference to the shared geometry rendered for each instance - such casts will fail,
   * while the casting `functions` will forward to the shared geometry.
   */
  public get asLUT(): LUTGeometry | undefined { return undefined; }
  public get asSurface(): SurfaceGeometry | undefined { return undefined; }
  public get asMesh(): MeshGeometry | undefined { return undefined; }
  public get asEdge(): EdgeGeometry | undefined { return undefined; }
  public get asRealityMesh(): RealityMeshGeometry | undefined { return undefined; }
  public get asSilhouette(): SilhouetteEdgeGeometry | undefined { return undefined; }
  public get asInstanced(): InstancedGeometry | undefined { return undefined; }
  public get isInstanced() { return undefined !== this.asInstanced; }
  public get asPointCloud(): PointCloudGeometry | undefined { return undefined; }
  public get asPlanarGrid(): PlanarGridGeometry | undefined { return undefined; }
  public get alwaysRenderTranslucent(): boolean { return false; }
  public get allowColorOverride(): boolean { return true; }

  // Returns true if white portions of this geometry should render as black on white background
  protected abstract _wantWoWReversal(_target: Target): boolean;
  // Returns the edge/line weight used to render this geometry
  protected _getLineWeight(_params: ShaderProgramParams): number { return 0; }
  // Returns the edge/line pattern used to render this geometry
  protected _getLineCode(_params: ShaderProgramParams): number { return LineCode.solid; }

  public abstract get isDisposed(): boolean;
  // Returns the Id of the Technique used to render this geometry
  public abstract get techniqueId(): TechniqueId;
  // Returns the pass in which to render this geometry. RenderPass.None indicates it should not be rendered.
  public abstract getRenderPass(target: Target): RenderPass;
  // Returns the 'order' of this geometry, which determines how z-fighting is resolved.
  public abstract get renderOrder(): RenderOrder;
  // Returns true if this is a lit surface
  public get isLitSurface(): boolean { return false; }
  // Returns true if this is an unlit surface with baked-in lighting (e.g. 3mx, scalable mesh reality models)
  public get hasBakedLighting(): boolean { return false; }
  // Returns true if this primitive contains auxillary animation data.
  public get hasAnimation(): boolean { return false; }

  /** Returns the origin of this geometry's quantization parameters. */
  public abstract get qOrigin(): Float32Array;
  /** Returns the scale of this geometry's quantization parameters. */
  public abstract get qScale(): Float32Array;
  // Draws this geometry
  public abstract draw(): void;

  public abstract dispose(): void;

  // Intended to be overridden by specific subclasses
  public get materialInfo(): MaterialInfo | undefined { return undefined; }
  public get hasMaterialAtlas(): boolean {
    const mat = this.materialInfo;
    return undefined !== mat && mat.isAtlas;
  }

  public get polylineBuffers(): PolylineBuffers | undefined { return undefined; }
  public get hasFeatures(): boolean { return false; }
  public get viewIndependentOrigin(): Point3d | undefined { return undefined; }
  public get isViewIndependent(): boolean { return undefined !== this.viewIndependentOrigin; }

  public get supportsThematicDisplay() { return false; }

  public get isEdge(): boolean {
    switch (this.renderOrder) {
      case RenderOrder.Edge:
      case RenderOrder.Silhouette:
      case RenderOrder.PlanarEdge:
      case RenderOrder.PlanarSilhouette:
        return true;
      default:
        return false;
    }
  }
  public wantWoWReversal(params: ShaderProgramParams): boolean {
    return params.target.currentViewFlags.whiteOnWhiteReversal && this._wantWoWReversal(params.target);
  }
  public getLineCode(params: ShaderProgramParams): number {
    return params.target.currentViewFlags.styles ? this._getLineCode(params) : LineCode.solid;
  }
  public getLineWeight(params: ShaderProgramParams): number {
    if (!params.target.currentViewFlags.weights) {
      return 1.0;
    }

    const minWeight = 1;
    let weight = this._getLineWeight(params);
    weight = Math.max(weight, minWeight);
    weight = Math.min(weight, 31.0);
    return weight;
  }

  public getFlashMode(params: DrawParams): FlashMode {
    // By default only surfaces rendered with lighting get brightened. Overridden for reality meshes since they have lighting baked-in.
    // NB: If the reality model is classified, the classifiers are drawn without lighting, therefore we mix the hilite color.
    if (this.hasBakedLighting)
      return FlashMode.Hilite;

    const vf = params.target.currentViewFlags;
    if (!this.isLitSurface || RenderMode.SmoothShade !== vf.renderMode)
      return FlashMode.Hilite;

    return vf.lighting ? params.target.plan.flashSettings.litMode : FlashMode.Hilite;
  }

  public wantMixMonochromeColor(_target: Target): boolean { return false; }
  public wantMonochrome(_target: Target): boolean { return true; }

  public abstract collectStatistics(stats: RenderMemory.Statistics): void;

  public computeRange(output?: Range3d): Range3d {
    if (undefined === this._range) {
      const lowX = this.qOrigin[0];
      const lowY = this.qOrigin[1];
      const lowZ = this.qOrigin[2];

      const hiX = 0xffff * this.qScale[0] + lowX;
      const hiY = 0xffff * this.qScale[1] + lowY;
      const hiZ = 0xffff * this.qScale[2] + lowZ;

      this._range = Range3d.createXYZXYZ(lowX, lowY, lowZ, hiX, hiY, hiZ);
    }

    return this._range.clone(output);
  }
}

/** Geometry which is drawn using indices into a look-up texture of vertex data, via gl.drawArrays()
 * @internal
 */
export abstract class LUTGeometry extends CachedGeometry {
  private readonly _viewIndependentOrigin?: Point3d;

  public abstract get lutBuffers(): BuffersContainer;

  // The texture containing the vertex data.
  public abstract get lut(): VertexLUT;
  public get asLUT() { return this; }
  public get viewIndependentOrigin() { return this._viewIndependentOrigin; }

  protected abstract _draw(_numInstances: number, _instanceBuffersContainer?: BuffersContainer): void;
  public draw(): void { this._draw(0); }
  public drawInstanced(numInstances: number, instanceBuffersContainer: BuffersContainer): void { this._draw(numInstances, instanceBuffersContainer); }

  // Override this if your color varies based on the target
  public getColor(_target: Target): ColorInfo { return this.lut.colorInfo; }

  public get qOrigin(): Float32Array { return this.lut.qOrigin; }
  public get qScale(): Float32Array { return this.lut.qScale; }
  public get hasAnimation() { return this.lut.hasAnimation; }

  protected constructor(viewIndependentOrigin?: Point3d) {
    super();
    this._viewIndependentOrigin = viewIndependentOrigin;
  }
}

/** Parameters used to construct an IndexedGeometry
 * @internal
 */
export class IndexedGeometryParams implements WebGLDisposable {
  public readonly buffers: BuffersContainer;
  public readonly positions: QBufferHandle3d;
  public readonly indices: BufferHandle;
  public readonly numIndices: number;

  protected constructor(positions: QBufferHandle3d, indices: BufferHandle, numIndices: number) {
    this.buffers = BuffersContainer.create();
    const attrPos = AttributeMap.findAttribute("a_pos", undefined, false);
    assert(attrPos !== undefined);
    this.buffers.addBuffer(positions, [BufferParameters.create(attrPos.location, 3, GL.DataType.UnsignedShort, false, 0, 0, false)]);
    this.buffers.addBuffer(indices, []);
    this.positions = positions;
    this.indices = indices;
    this.numIndices = numIndices;
  }

  public static create(positions: Uint16Array, qParams: QParams3d, indices: Uint32Array) {
    const posBuf = QBufferHandle3d.create(qParams, positions);
    const indBuf = BufferHandle.createBuffer(GL.Buffer.Target.ElementArrayBuffer, indices);
    if (undefined === posBuf || undefined === indBuf)
      return undefined;

    return new IndexedGeometryParams(posBuf, indBuf, indices.length);
  }
  public static createFromList(positions: QPoint3dList, indices: Uint32Array) {
    return IndexedGeometryParams.create(positions.toTypedArray(), positions.params, indices);
  }

  public get isDisposed(): boolean {
    return this.buffers.isDisposed
      && this.positions.isDisposed
      && this.indices.isDisposed;
  }

  public dispose() {
    dispose(this.buffers);
    dispose(this.positions);
    dispose(this.indices);
  }
}

/** A geometric primitive which is rendered using gl.drawElements() with one or more vertex buffers indexed by an index buffer.
 * @internal
 */
export abstract class IndexedGeometry extends CachedGeometry {
  protected readonly _params: IndexedGeometryParams;
  protected _wantWoWReversal(_target: Target): boolean { return false; }
  protected constructor(params: IndexedGeometryParams) {
    super();
    this._params = params;
  }

  public get isDisposed(): boolean { return this._params.isDisposed; }

  public dispose() {
    dispose(this._params);
  }

  public draw(): void {
    this._params.buffers.bind();
    System.instance.context.drawElements(GL.PrimitiveType.Triangles, this._params.numIndices, GL.DataType.UnsignedInt, 0);
    this._params.buffers.unbind();
  }

  public get qOrigin() { return this._params.positions.origin; }
  public get qScale() { return this._params.positions.scale; }
}

/** a cube of quads in normalized device coordinates for skybox rendering techniques
 * @internal
 */
class SkyBoxQuads {
  public readonly vertices: Uint16Array;
  public readonly vertexParams: QParams3d;

  public constructor() {
    const skyBoxSz = 1.0;

    const qVerts = new QPoint3dList(QParams3d.fromNormalizedRange());

    // NB: After applying the rotation matrix in the shader, Back becomes (Bottom), etc.
    // See the notes in the parens below.

    // ###TODO: Make this indexed.  Currently not indexed because of previous six-sided texture system.

    // Back (Bottom after rotation)
    qVerts.add(new Point3d(-skyBoxSz, skyBoxSz, skyBoxSz));   // back upper left - 0
    qVerts.add(new Point3d(skyBoxSz, skyBoxSz, skyBoxSz));    // back upper right - 1
    qVerts.add(new Point3d(-skyBoxSz, -skyBoxSz, skyBoxSz));  // back lower left - 2
    qVerts.add(new Point3d(skyBoxSz, skyBoxSz, skyBoxSz));    // back upper right - 1
    qVerts.add(new Point3d(skyBoxSz, -skyBoxSz, skyBoxSz));   // back lower right - 3
    qVerts.add(new Point3d(-skyBoxSz, -skyBoxSz, skyBoxSz));  // back lower left - 2

    // Front (Top after rotation)
    qVerts.add(new Point3d(-skyBoxSz, skyBoxSz, -skyBoxSz));  // front upper left - 4
    qVerts.add(new Point3d(skyBoxSz, skyBoxSz, -skyBoxSz));   // front upper right - 5
    qVerts.add(new Point3d(-skyBoxSz, -skyBoxSz, -skyBoxSz)); // front lower left - 6
    qVerts.add(new Point3d(skyBoxSz, skyBoxSz, -skyBoxSz));   // front upper right - 5
    qVerts.add(new Point3d(skyBoxSz, -skyBoxSz, -skyBoxSz));  // front lower right - 7
    qVerts.add(new Point3d(-skyBoxSz, -skyBoxSz, -skyBoxSz)); // front lower left - 6

    // Top (Front after rotation)
    qVerts.add(new Point3d(-skyBoxSz, skyBoxSz, -skyBoxSz));  // front upper left - 4
    qVerts.add(new Point3d(skyBoxSz, skyBoxSz, -skyBoxSz));   // front upper right - 5
    qVerts.add(new Point3d(skyBoxSz, skyBoxSz, skyBoxSz));    // back upper right - 1
    qVerts.add(new Point3d(-skyBoxSz, skyBoxSz, -skyBoxSz));  // front upper left - 4
    qVerts.add(new Point3d(-skyBoxSz, skyBoxSz, skyBoxSz));   // back upper left - 0
    qVerts.add(new Point3d(skyBoxSz, skyBoxSz, skyBoxSz));    // back upper right - 1

    // Bottom (Back after rotation)
    qVerts.add(new Point3d(-skyBoxSz, -skyBoxSz, skyBoxSz));  // back lower left - 2
    qVerts.add(new Point3d(skyBoxSz, -skyBoxSz, skyBoxSz));   // back lower right - 3
    qVerts.add(new Point3d(-skyBoxSz, -skyBoxSz, -skyBoxSz)); // front lower left - 6
    qVerts.add(new Point3d(skyBoxSz, -skyBoxSz, skyBoxSz));   // back lower right - 3
    qVerts.add(new Point3d(skyBoxSz, -skyBoxSz, -skyBoxSz));  // front lower right - 7
    qVerts.add(new Point3d(-skyBoxSz, -skyBoxSz, -skyBoxSz)); // front lower left - 6

    // Left (Right after rotation)
    qVerts.add(new Point3d(-skyBoxSz, skyBoxSz, skyBoxSz));   // back upper left - 0
    qVerts.add(new Point3d(-skyBoxSz, skyBoxSz, -skyBoxSz));  // front upper left - 4
    qVerts.add(new Point3d(-skyBoxSz, -skyBoxSz, skyBoxSz));  // back lower left - 2
    qVerts.add(new Point3d(-skyBoxSz, skyBoxSz, -skyBoxSz));  // front upper left - 4
    qVerts.add(new Point3d(-skyBoxSz, -skyBoxSz, -skyBoxSz)); // front lower left - 6
    qVerts.add(new Point3d(-skyBoxSz, -skyBoxSz, skyBoxSz));  // back lower left - 2

    // Right (Left after rotation)
    qVerts.add(new Point3d(skyBoxSz, skyBoxSz, skyBoxSz));    // back upper right - 1
    qVerts.add(new Point3d(skyBoxSz, skyBoxSz, -skyBoxSz));   // front upper right - 5
    qVerts.add(new Point3d(skyBoxSz, -skyBoxSz, skyBoxSz));   // back lower right - 3
    qVerts.add(new Point3d(skyBoxSz, skyBoxSz, -skyBoxSz));   // front upper right - 5
    qVerts.add(new Point3d(skyBoxSz, -skyBoxSz, -skyBoxSz));  // front lower right - 7
    qVerts.add(new Point3d(skyBoxSz, -skyBoxSz, skyBoxSz));   // back lower right - 3

    this.vertices = qVerts.toTypedArray();
    this.vertexParams = qVerts.params;
  }

  public createParams() {
    return SkyBoxGeometryParams.create(this.vertices, this.vertexParams);
  }
}

/** Parameters used to construct an SkyBox
 * @internal
 */
export class SkyBoxGeometryParams implements WebGLDisposable {
  public readonly buffers: BuffersContainer;
  public readonly positions: QBufferHandle3d;

  protected constructor(positions: QBufferHandle3d) {
    this.buffers = BuffersContainer.create();
    const attrPos = AttributeMap.findAttribute("a_pos", undefined, false);
    assert(attrPos !== undefined);
    this.buffers.addBuffer(positions, [BufferParameters.create(attrPos.location, 3, GL.DataType.UnsignedShort, false, 0, 0, false)]);
    this.positions = positions;
  }

  public static create(positions: Uint16Array, qparams: QParams3d) {
    const posBuf = QBufferHandle3d.create(qparams, positions);
    if (undefined === posBuf)
      return undefined;

    return new SkyBoxGeometryParams(posBuf);
  }

  public get isDisposed(): boolean { return this.buffers.isDisposed && this.positions.isDisposed; }

  public dispose() {
    dispose(this.buffers);
    dispose(this.positions);
  }
}

/** @internal */
namespace SkyBoxQuads { // eslint-disable-line no-redeclare
  let skyBoxQuads: SkyBoxQuads | undefined;

  export function getInstance(): SkyBoxQuads {
    if (undefined === skyBoxQuads)
      skyBoxQuads = new SkyBoxQuads();

    return skyBoxQuads;
  }
}

/** Geometry used for view-space rendering techniques.
 * @internal
 */
export class SkyBoxQuadsGeometry extends CachedGeometry {
  protected _techniqueId: TechniqueId;
  public readonly cube: RenderTexture;
  protected readonly _params: SkyBoxGeometryParams;

  protected constructor(ndxGeomParams: SkyBoxGeometryParams, texture: RenderTexture) {
    super();
    this.cube = texture;
    this._techniqueId = TechniqueId.SkyBox;
    this._params = ndxGeomParams;
  }

  public static create(texture: RenderTexture): SkyBoxQuadsGeometry | undefined {
    const sbxGeomParams = SkyBoxQuads.getInstance().createParams();
    return undefined !== sbxGeomParams ? new SkyBoxQuadsGeometry(sbxGeomParams, texture) : undefined;
  }

  public collectStatistics(_stats: RenderMemory.Statistics): void {
    // Not interested in tracking this.
  }

  public get techniqueId(): TechniqueId { return this._techniqueId; }
  public getRenderPass(_target: Target) { return RenderPass.SkyBox; }
  public get renderOrder() { return RenderOrder.UnlitSurface; }

  public draw(): void {
    System.instance.context.drawArrays(GL.PrimitiveType.Triangles, 0, 36);
  }

  public get qOrigin() { return this._params.positions.origin; }
  public get qScale() { return this._params.positions.scale; }

  public get isDisposed(): boolean { return this._params.isDisposed; }

  public dispose() {
    dispose(this._params);
  }

  protected _wantWoWReversal(_target: Target): boolean { return false; }
}

/** A quad with its corners mapped to the dimensions as the viewport, used for special rendering techniques.
 * @internal
 */
class ViewportQuad {
  public readonly vertices: Uint16Array;
  public readonly vertexParams: QParams3d;
  public readonly indices = new Uint32Array(6);

  public constructor() {
    const pt = new Point3d(-1, -1, 0);
    const vertices = new QPoint3dList(QParams3d.fromNormalizedRange());
    vertices.add(pt);
    pt.x = 1;
    vertices.add(pt);
    pt.y = 1;
    vertices.add(pt);
    pt.x = -1;
    vertices.add(pt);

    this.vertices = vertices.toTypedArray();
    this.vertexParams = vertices.params;

    this.indices[0] = 0;
    this.indices[1] = 1;
    this.indices[2] = 2;
    this.indices[3] = 0;
    this.indices[4] = 2;
    this.indices[5] = 3;
  }

  public createParams() {
    return IndexedGeometryParams.create(this.vertices, this.vertexParams, this.indices);
  }
}

/** @internal */
namespace ViewportQuad { // eslint-disable-line no-redeclare
  let viewportQuad: ViewportQuad | undefined;

  export function getInstance(): ViewportQuad {
    if (undefined === viewportQuad)
      viewportQuad = new ViewportQuad();

    return viewportQuad;
  }
}

/** Geometry used for view-space rendering techniques.
 * @internal
 */
export class ViewportQuadGeometry extends IndexedGeometry {
  protected _techniqueId: TechniqueId;

  protected constructor(params: IndexedGeometryParams, techniqueId: TechniqueId) {
    super(params);
    this._techniqueId = techniqueId;
  }
  public static create(techniqueId: TechniqueId) {
    const params = ViewportQuad.getInstance().createParams();
    return undefined !== params ? new this(params, techniqueId) : undefined;
  }

  public get techniqueId(): TechniqueId { return this._techniqueId; }
  public getRenderPass(_target: Target) { return RenderPass.OpaqueGeneral; }
  public get renderOrder() { return RenderOrder.UnlitSurface; }

  public collectStatistics(_stats: RenderMemory.Statistics): void {
    // NB: These don't really count...
  }
}

/** Geometry used for view-space rendering techniques which involve sampling one or more textures.
 * @internal
 */
export class TexturedViewportQuadGeometry extends ViewportQuadGeometry {
  protected readonly _textures: WebGLTexture[];

  protected constructor(params: IndexedGeometryParams, techniqueId: TechniqueId, textures: WebGLTexture[]) {
    super(params, techniqueId);
    this._textures = textures;

    // TypeScript compiler will happily accept TextureHandle (or any other type) in place of WebGLTexture.
    // There is no such 'type' as WebGLTexture at run-time.
    assert(this._textures.every((tx) => !(tx instanceof TextureHandle)));
  }

  public static createTexturedViewportQuadGeometry(techniqueId: TechniqueId, textures: WebGLTexture[]): TexturedViewportQuadGeometry | undefined {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined === params)
      return undefined;

    return new this(params, techniqueId, textures);
  }
}

/** Geometry used for rendering default gradient-style or single texture spherical skybox.
 * @internal
 */
export class SkySphereViewportQuadGeometry extends ViewportQuadGeometry {
  public worldPos: Float32Array; // LeftBottom, RightBottom, RightTop, LeftTop worl pos of frustum at mid depth.
  public readonly typeAndExponents: Float32Array; // [0] -1.0 for 2-color gradient, 1.0 for 4-color gradient, 0.0 for texture; [1] sky exponent (4-color only) [2] ground exponent (4-color only)
  public readonly zOffset: number;
  public readonly rotation: number;
  public readonly zenithColor: Float32Array;
  public readonly skyColor: Float32Array;
  public readonly groundColor: Float32Array;
  public readonly nadirColor: Float32Array;
  public readonly skyTexture?: RenderTexture;
  protected readonly _worldPosBuff: BufferHandle;
  private _isWorldPosSet: boolean = false;

  public initWorldPos(target: Target): void {
    if (this._isWorldPosSet)
      return;

    this._isWorldPosSet = true;
    this._setPointsFromFrustum(target);
    this._worldPosBuff.bindData(this.worldPos, GL.Buffer.Usage.StreamDraw);
    const attrWorldPos = AttributeMap.findAttribute("a_worldPos", TechniqueId.SkySphereGradient, false);
    assert(attrWorldPos !== undefined);
    this._params.buffers.addBuffer(this._worldPosBuff, [BufferParameters.create(attrWorldPos.location, 3, GL.DataType.Float, false, 0, 0, false)]);
  }

  private _setPointsFromFrustum(target: Target) {
    const frustum = target.planFrustum;
    const wp = this.worldPos;

    const lb = frustum.getCorner(Npc.LeftBottomRear).interpolate(0.5, frustum.getCorner(Npc.LeftBottomFront), scratchPoint3a);
    const rb = frustum.getCorner(Npc.RightBottomRear).interpolate(0.5, frustum.getCorner(Npc.RightBottomFront), scratchPoint3b);
    const rt = frustum.getCorner(Npc.RightTopRear).interpolate(0.5, frustum.getCorner(Npc.RightTopFront), scratchPoint3c);
    if (!target.plan.backgroundMapOn || !target.plan.isGlobeMode3D) {
      wp[0] = lb.x;
      wp[1] = lb.y;
      wp[2] = lb.z;
      wp[3] = rb.x;
      wp[4] = rb.y;
      wp[5] = rb.z;
      wp[6] = rt.x;
      wp[7] = rt.y;
      wp[8] = rt.z;
      const lt = frustum.getCorner(Npc.LeftTopRear).interpolate(0.5, frustum.getCorner(Npc.LeftTopFront), scratchPoint3d);
      wp[9] = lt.x;
      wp[10] = lt.y;
      wp[11] = lt.z;
    } else {
      // Need to fake a different frustum to orient the 4 corners properly.
      // First find true frustum center & size.
      const fCenter = lb.interpolate(0.5, rt, scratchPoint3d);
      const upScreen = Vector3d.createStartEnd(rb, rt, scratchVec3a);
      let rightScreen = Vector3d.createStartEnd(lb, rb, scratchVec3b);
      const halfWidth = upScreen.magnitude() * 0.5;
      const halfHeight = rightScreen.magnitude() * 0.5;
      // Find the projection of the globe up onto the frustum plane.
      upScreen.normalizeInPlace();
      rightScreen.normalizeInPlace();
      const projUp = target.plan.upVector.dotProduct(upScreen);
      const projRt = target.plan.upVector.dotProduct(rightScreen);
      // Find camera position (create one for ortho).
      let camPos: Point3d;
      if (FrustumUniformType.Perspective === target.uniforms.frustum.type) {
        const farLowerLeft = frustum.getCorner(Npc.LeftBottomRear);
        const nearLowerLeft = frustum.getCorner(Npc.LeftBottomFront);
        const scale = 1.0 / (1.0 - target.planFraction);
        const zVec = Vector3d.createStartEnd(farLowerLeft, nearLowerLeft, scratchVec3c);
        camPos = fromSumOf(farLowerLeft, zVec, scale, scratchPoint3a);
      } else {
        const delta = Vector3d.createStartEnd(frustum.getCorner(Npc.LeftBottomRear), frustum.getCorner(Npc.LeftBottomFront), scratchVec3c);
        const pseudoCameraHalfAngle = 22.5;
        const diagonal = frustum.getCorner(Npc.LeftBottomRear).distance(frustum.getCorner(Npc.RightTopRear));
        const focalLength = diagonal / (2 * Math.atan(pseudoCameraHalfAngle * Angle.radiansPerDegree));
        let zScale = focalLength / delta.magnitude();
        if (zScale < 1.000001)
          zScale = 1.000001; // prevent worldEye front being on or inside the frustum front plane
        camPos = Point3d.createAdd3Scaled(frustum.getCorner(Npc.LeftBottomRear), .5, frustum.getCorner(Npc.RightTopRear), .5, delta, zScale, scratchPoint3a);
      }
      // Compute the distance from the camera to the frustum center.
      const camDist = camPos.distance(fCenter);
      // Now use a fixed camera direction and compute a new frustum center.
      const camDir = Vector3d.create(0.0, 1.0, 0.0, scratchVec3c);
      fCenter.setFromPoint3d(camPos);
      fCenter.addScaledInPlace(camDir, camDist);
      // Create an up vector that mimics the projection of the globl up onto the real frustum.
      upScreen.set(projRt, 0.0, projUp);
      upScreen.normalizeInPlace();
      // Compute a new right vector and then compute the 4 points for the sky.
      rightScreen = upScreen.crossProduct(camDir, scratchVec3b);
      upScreen.scaleInPlace(halfHeight);
      rightScreen.scaleInPlace(halfWidth);
      wp[0] = fCenter.x - rightScreen.x - upScreen.x; // left bottom
      wp[1] = fCenter.y - rightScreen.y - upScreen.y;
      wp[2] = fCenter.z - rightScreen.z - upScreen.z;
      wp[3] = fCenter.x + rightScreen.x - upScreen.x; // right bottom
      wp[4] = fCenter.y + rightScreen.y - upScreen.y;
      wp[5] = fCenter.z + rightScreen.z - upScreen.z;
      wp[6] = fCenter.x + rightScreen.x + upScreen.x; // right top
      wp[7] = fCenter.y + rightScreen.y + upScreen.y;
      wp[8] = fCenter.z + rightScreen.z + upScreen.z;
      wp[9] = fCenter.x - rightScreen.x + upScreen.x; // left top
      wp[10] = fCenter.y - rightScreen.y + upScreen.y;
      wp[11] = fCenter.z - rightScreen.z + upScreen.z;
    }
  }

  protected constructor(params: IndexedGeometryParams, skybox: SkyBox.CreateParams, techniqueId: TechniqueId) {
    super(params, techniqueId);

    this.worldPos = new Float32Array(4 * 3);
    this._worldPosBuff = new BufferHandle(GL.Buffer.Target.ArrayBuffer);
    this.typeAndExponents = new Float32Array(3);
    this.zenithColor = new Float32Array(3);
    this.skyColor = new Float32Array(3);
    this.groundColor = new Float32Array(3);
    this.nadirColor = new Float32Array(3);
    this.zOffset = skybox.zOffset;

    const sphere = skybox.sphere;
    this.rotation = undefined !== sphere ? sphere.rotation : 0.0;

    if (undefined !== sphere) {
      this.skyTexture = sphere.texture;
      this.typeAndExponents[0] = 0.0;
      this.typeAndExponents[1] = 1.0;
      this.typeAndExponents[2] = 1.0;
      this.zenithColor[0] = 0.0;
      this.zenithColor[1] = 0.0;
      this.zenithColor[2] = 0.0;
      this.nadirColor[0] = 0.0;
      this.nadirColor[1] = 0.0;
      this.nadirColor[2] = 0.0;
      this.skyColor[0] = 0.0;
      this.skyColor[1] = 0.0;
      this.skyColor[2] = 0.0;
      this.groundColor[0] = 0.0;
      this.groundColor[1] = 0.0;
      this.groundColor[2] = 0.0;
    } else {
      const gradient = skybox.gradient!;

      this.zenithColor[0] = gradient.zenithColor.colors.r / 255.0;
      this.zenithColor[1] = gradient.zenithColor.colors.g / 255.0;
      this.zenithColor[2] = gradient.zenithColor.colors.b / 255.0;
      this.nadirColor[0] = gradient.nadirColor.colors.r / 255.0;
      this.nadirColor[1] = gradient.nadirColor.colors.g / 255.0;
      this.nadirColor[2] = gradient.nadirColor.colors.b / 255.0;

      if (gradient.twoColor) {
        this.typeAndExponents[0] = -1.0;
        this.typeAndExponents[1] = 4.0;
        this.typeAndExponents[2] = 4.0;
        this.skyColor[0] = 0.0;
        this.skyColor[1] = 0.0;
        this.skyColor[2] = 0.0;
        this.groundColor[0] = 0.0;
        this.groundColor[1] = 0.0;
        this.groundColor[2] = 0.0;
      } else {
        this.typeAndExponents[0] = 1.0;
        this.typeAndExponents[1] = gradient.skyExponent;
        this.typeAndExponents[2] = gradient.groundExponent;
        this.skyColor[0] = gradient.skyColor.colors.r / 255.0;
        this.skyColor[1] = gradient.skyColor.colors.g / 255.0;
        this.skyColor[2] = gradient.skyColor.colors.b / 255.0;
        this.groundColor[0] = gradient.groundColor.colors.r / 255.0;
        this.groundColor[1] = gradient.groundColor.colors.g / 255.0;
        this.groundColor[2] = gradient.groundColor.colors.b / 255.0;
      }
    }
  }

  public static createGeometry(skybox: SkyBox.CreateParams) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined === params)
      return undefined;

    const technique = undefined !== skybox.sphere ? TechniqueId.SkySphereTexture : TechniqueId.SkySphereGradient;
    return new SkySphereViewportQuadGeometry(params, skybox, technique);
  }

  public get isDisposed(): boolean { return super.isDisposed && this._worldPosBuff.isDisposed; }

  public dispose() {
    super.dispose();
    dispose(this._worldPosBuff);
  }
}

/** Geometry used when rendering ambient occlusion information to an output texture
 * @internal
 */
export class AmbientOcclusionGeometry extends TexturedViewportQuadGeometry {
  public static createGeometry(depthAndOrder: WebGLTexture) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined === params) {
      return undefined;
    }

    // Will derive positions and normals from depthAndOrder.
    return new AmbientOcclusionGeometry(params, [depthAndOrder]);
  }

  public get depthAndOrder() { return this._textures[0]; }
  public get noise() { return System.instance.noiseTexture!.getHandle()!; }

  private constructor(params: IndexedGeometryParams, textures: WebGLTexture[]) {
    super(params, TechniqueId.AmbientOcclusion, textures);
  }
}

/** @internal */
export class BlurGeometry extends TexturedViewportQuadGeometry {
  public readonly blurDir: Vector2d;

  public static createGeometry(texToBlur: WebGLTexture, depthAndOrder: WebGLTexture, blurDir: Vector2d) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined === params) {
      return undefined;
    }
    return new BlurGeometry(params, [texToBlur, depthAndOrder], blurDir);
  }

  public get textureToBlur() { return this._textures[0]; }
  public get depthAndOrder() { return this._textures[1]; }

  private constructor(params: IndexedGeometryParams, textures: WebGLTexture[], blurDir: Vector2d) {
    super(params, TechniqueId.Blur, textures);
    this.blurDir = blurDir;
  }
}

/** @internal */
export class EVSMGeometry extends TexturedViewportQuadGeometry {
  public readonly stepSize = new Float32Array(2);

  public static createGeometry(depthBuffer: WebGLTexture, width: number, height: number) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined === params)
      return undefined;

    return new EVSMGeometry(params, [depthBuffer], width, height);
  }

  public get depthTexture() { return this._textures[0]; }

  private constructor(params: IndexedGeometryParams, textures: WebGLTexture[], width: number, height: number) {
    super(params, TechniqueId.EVSMFromDepth, textures);
    this.stepSize[0] = 1.0 / width;
    this.stepSize[1] = 1.0 / height;
  }
}

/** Geometry used during the 'composite' pass to apply transparency and/or hilite effects.
 * @internal
 */
export class CompositeGeometry extends TexturedViewportQuadGeometry {
  public static createGeometry(opaque: WebGLTexture, accum: WebGLTexture, reveal: WebGLTexture, hilite: WebGLTexture) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined === params)
      return undefined;

    const textures = [opaque, accum, reveal, hilite];
    return new CompositeGeometry(params, textures);
  }

  public get opaque() { return this._textures[0]; }
  public get accum() { return this._textures[1]; }
  public get reveal() { return this._textures[2]; }
  public get hilite() { return this._textures[3]; }
  public get occlusion(): WebGLTexture | undefined {
    return this._textures.length > 4 ? this._textures[4] : undefined;
  }
  public set occlusion(occlusion: WebGLTexture | undefined) {
    assert((undefined === occlusion) === (undefined !== this.occlusion));
    if (undefined !== occlusion)
      this._textures[4] = occlusion;
    else
      this._textures.length = 4;
  }

  // Invoked each frame to determine the appropriate Technique to use.
  public update(flags: CompositeFlags): void { this._techniqueId = this.determineTechnique(flags); }

  private determineTechnique(flags: CompositeFlags): TechniqueId {
    return computeCompositeTechniqueId(flags);
  }

  private constructor(params: IndexedGeometryParams, textures: WebGLTexture[]) {
    super(params, TechniqueId.CompositeHilite, textures);
    assert(4 <= this._textures.length);
  }
}

/** Geometry used to ping-pong the pick buffer data in between opaque passes.
 * @internal
 */
export class CopyPickBufferGeometry extends TexturedViewportQuadGeometry {
  public static createGeometry(featureId: WebGLTexture, depthAndOrder: WebGLTexture) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined !== params) {
      return new CopyPickBufferGeometry(params, [featureId, depthAndOrder]);
    } else {
      return undefined;
    }
  }

  public get featureId() { return this._textures[0]; }
  public get depthAndOrder() { return this._textures[1]; }

  private constructor(params: IndexedGeometryParams, textures: WebGLTexture[]) {
    super(params, TechniqueId.CopyPickBuffers, textures);
  }
}
export class CombineTexturesGeometry extends TexturedViewportQuadGeometry {
  public static createGeometry(texture0: WebGLTexture, texture1: WebGLTexture) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined !== params) {
      return new CombineTexturesGeometry(params, [texture0, texture1]);
    } else {
      return undefined;
    }
  }

  public get texture0() { return this._textures[0]; }
  public get texture1() { return this._textures[1]; }

  private constructor(params: IndexedGeometryParams, textures: WebGLTexture[]) {
    super(params, TechniqueId.CombineTextures, textures);
  }
}

export class Combine3TexturesGeometry extends TexturedViewportQuadGeometry {
  public static createGeometry(texture0: WebGLTexture, texture1: WebGLTexture, texture2: WebGLTexture) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined !== params) {
      return new Combine3TexturesGeometry(params, [texture0, texture1, texture2]);
    } else {
      return undefined;
    }
  }

  public get texture0() { return this._textures[0]; }
  public get texture1() { return this._textures[1]; }
  public get texture2() { return this._textures[2]; }

  private constructor(params: IndexedGeometryParams, textures: WebGLTexture[]) {
    super(params, TechniqueId.Combine3Textures, textures);
  }
}

/** @internal */
export class SingleTexturedViewportQuadGeometry extends TexturedViewportQuadGeometry {
  public static createGeometry(texture: WebGLTexture, techId: TechniqueId) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined === params) {
      return undefined;
    }

    return new SingleTexturedViewportQuadGeometry(params, texture, techId);
  }

  public get texture(): WebGLTexture { return this._textures[0]; }
  public set texture(texture: WebGLTexture) { this._textures[0] = texture; }

  protected constructor(params: IndexedGeometryParams, texture: WebGLTexture, techId: TechniqueId) {
    super(params, techId, [texture]);
  }
}

/** @internal */
export enum BoundaryType {
  Outside = 0,
  Inside = 1,
  Selected = 2,
}

/** @internal */
export class VolumeClassifierGeometry extends SingleTexturedViewportQuadGeometry {
  public boundaryType: BoundaryType = BoundaryType.Inside;

  public static createVCGeometry(texture: WebGLTexture) {
    const params = ViewportQuad.getInstance().createParams();
    if (undefined === params)
      return undefined;
    return new VolumeClassifierGeometry(params, texture);
  }

  private constructor(params: IndexedGeometryParams, texture: WebGLTexture) {
    super(params, texture, TechniqueId.VolClassSetBlend);
  }
}

/** A geometric primitive which renders gl points using gl.drawArrays() with one vertex buffer.
 * @internal
 */
export class ScreenPointsGeometry extends CachedGeometry {
  protected _numPoints: number;
  protected _origin: Float32Array;
  protected _scale: Float32Array;
  protected _positions: QBufferHandle2d;
  public readonly buffers: BuffersContainer;
  public readonly zTexture: WebGLTexture;

  protected constructor(vertices: QPoint2dList, zTexture: WebGLTexture) {
    super();

    this.zTexture = zTexture;

    this._numPoints = vertices.length;

    this._positions = QBufferHandle2d.create(vertices.params, vertices.toTypedArray())!;

    this._origin = new Float32Array(3);
    this._origin[0] = this._positions.params[0];
    this._origin[1] = this._positions.params[1];
    this._origin[2] = 0.0;
    this._scale = new Float32Array(3);
    this._scale[0] = this._positions.params[2];
    this._scale[1] = this._positions.params[3];
    this._scale[2] = this._positions.params[3]; // just copy the scale from y

    this.buffers = BuffersContainer.create();
    const attrPos = AttributeMap.findAttribute("a_pos", TechniqueId.VolClassCopyZ, false);
    assert(attrPos !== undefined);
    this.buffers.addBuffer(this._positions, [BufferParameters.create(attrPos.location, 2, GL.DataType.UnsignedShort, false, 0, 0, false)]);
  }

  public static createGeometry(width: number, height: number, depth: WebGLTexture): ScreenPointsGeometry {
    const pixWidth = 2.0 / width;
    const pixHeight = 2.0 / height;

    const startX = pixWidth * 0.5 - 1.0;
    const startY = pixHeight * 0.5 - 1.0;

    const pt = new Point2d(startX, startY);
    const vertices = new QPoint2dList(QParams2d.fromNormalizedRange());

    for (let y = 0; y < height; ++y) {
      pt.x = startX;
      for (let x = 0; x < width; ++x) {
        vertices.add(pt);
        pt.x += pixWidth;
      }
      pt.y += pixHeight;
    }
    return new ScreenPointsGeometry(vertices, depth);
  }

  public draw(): void {
    this.buffers.bind();
    System.instance.context.drawArrays(GL.PrimitiveType.Points, 0, this._numPoints);
    this.buffers.unbind();
  }

  public get isDisposed(): boolean { return this.buffers.isDisposed && this._positions.isDisposed; }

  public dispose() {
    dispose(this.buffers);
    dispose(this._positions);
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    stats.addBuffer(RenderMemory.BufferType.PointStrings, this._positions.bytesUsed);
  }

  protected _wantWoWReversal(_target: Target): boolean { return false; }
  public get techniqueId(): TechniqueId { return TechniqueId.VolClassCopyZ; }
  public getRenderPass(_target: Target) { return RenderPass.Classification; }
  public get renderOrder() { return RenderOrder.None; }
  public get qOrigin() { return this._origin; }
  public get qScale() { return this._scale; }
}

/** @internal */
export class PolylineBuffers implements WebGLDisposable {
  public buffers: BuffersContainer;
  public indices: BufferHandle;
  public prevIndices: BufferHandle;
  public nextIndicesAndParams: BufferHandle;
  private constructor(indices: BufferHandle, prevIndices: BufferHandle, nextIndicesAndParams: BufferHandle) {
    this.buffers = BuffersContainer.create();

    const attrPos = AttributeMap.findAttribute("a_pos", TechniqueId.Polyline, false);
    const attrPrevIndex = AttributeMap.findAttribute("a_prevIndex", TechniqueId.Polyline, false);
    const attrNextIndex = AttributeMap.findAttribute("a_nextIndex", TechniqueId.Polyline, false);
    const attrParam = AttributeMap.findAttribute("a_param", TechniqueId.Polyline, false);
    assert(attrPos !== undefined);
    assert(attrPrevIndex !== undefined);
    assert(attrNextIndex !== undefined);
    assert(attrParam !== undefined);

    this.buffers.addBuffer(indices, [BufferParameters.create(attrPos.location, 3, GL.DataType.UnsignedByte, false, 0, 0, false)]);
    this.buffers.addBuffer(prevIndices, [BufferParameters.create(attrPrevIndex.location, 3, GL.DataType.UnsignedByte, false, 0, 0, false)]);
    this.buffers.addBuffer(nextIndicesAndParams, [
      BufferParameters.create(attrNextIndex.location, 3, GL.DataType.UnsignedByte, false, 4, 0, false),
      BufferParameters.create(attrParam.location, 1, GL.DataType.UnsignedByte, false, 4, 3, false),
    ]);

    this.indices = indices;
    this.prevIndices = prevIndices;
    this.nextIndicesAndParams = nextIndicesAndParams;
  }

  public static create(polyline: TesselatedPolyline): PolylineBuffers | undefined {
    const indices = BufferHandle.createArrayBuffer(polyline.indices.data);
    const prev = BufferHandle.createArrayBuffer(polyline.prevIndices.data);
    const next = BufferHandle.createArrayBuffer(polyline.nextIndicesAndParams);
    return undefined !== indices && undefined !== prev && undefined !== next ? new PolylineBuffers(indices, prev, next) : undefined;
  }

  public collectStatistics(stats: RenderMemory.Statistics, type: RenderMemory.BufferType): void {
    stats.addBuffer(type, this.indices.bytesUsed + this.prevIndices.bytesUsed + this.nextIndicesAndParams.bytesUsed);
  }

  public get isDisposed(): boolean {
    return this.buffers.isDisposed
      && this.indices.isDisposed
      && this.prevIndices.isDisposed
      && this.nextIndicesAndParams.isDisposed;
  }

  public dispose() {
    dispose(this.buffers);
    dispose(this.indices);
    dispose(this.prevIndices);
    dispose(this.nextIndicesAndParams);
  }
}
