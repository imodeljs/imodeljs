/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { assert, dispose } from "@bentley/bentleyjs-core";
import { Point3d } from "@bentley/geometry-core";
import { FeatureIndexType, FillFlags, LinePixels, RenderMode, ViewFlags } from "@bentley/imodeljs-common";
import { InstancedGraphicParams } from "../InstancedGraphicParams";
import { MeshParams, SegmentEdgeParams, SilhouetteParams, SurfaceType, TesselatedPolyline, VertexIndices } from "../primitives/VertexTable";
import { RenderMemory } from "../RenderMemory";
import { AttributeMap } from "./AttributeMap";
import { CachedGeometry, LUTGeometry, PolylineBuffers } from "./CachedGeometry";
import { ColorInfo } from "./ColorInfo";
import { WebGLDisposable } from "./Disposable";
import { ShaderProgramParams } from "./DrawCommand";
import { LineCode } from "./LineCode";
import { FloatRgba } from "./FloatRGBA";
import { GL } from "./GL";
import { Graphic } from "./Graphic";
import { BufferHandle, BufferParameters, BuffersContainer } from "./AttributeBuffers";
import { InstanceBuffers } from "./InstancedGeometry";
import { createMaterialInfo, MaterialInfo } from "./Material";
import { Primitive } from "./Primitive";
import { RenderCommands } from "./RenderCommands";
import { RenderOrder, RenderPass, SurfaceBitIndex } from "./RenderFlags";
import { System } from "./System";
import { Target } from "./Target";
import { TechniqueId } from "./TechniqueId";
import { Texture } from "./Texture";
import { VertexLUT } from "./VertexLUT";

/** @internal */
export class MeshData implements WebGLDisposable {
  public readonly edgeWidth: number;
  public readonly hasFeatures: boolean;
  public readonly uniformFeatureId?: number; // Used strictly by BatchPrimitiveCommand.computeIsFlashed for flashing volume classification primitives.
  public readonly texture?: Texture;
  public readonly materialInfo?: MaterialInfo;
  public readonly type: SurfaceType;
  public readonly fillFlags: FillFlags;
  public readonly edgeLineCode: number; // Must call LineCode.valueFromLinePixels(val: LinePixels) and set the output to edgeLineCode
  public readonly isPlanar: boolean;
  public readonly hasBakedLighting: boolean;
  public readonly hasFixedNormals: boolean;   // Fixed normals will not be flipped to face front (Terrain skirts).
  public readonly lut: VertexLUT;
  public readonly viewIndependentOrigin?: Point3d;
  private readonly _textureAlwaysDisplayed: boolean;

  private constructor(lut: VertexLUT, params: MeshParams, viOrigin: Point3d | undefined) {
    this.lut = lut;
    this.viewIndependentOrigin = viOrigin;

    this.hasFeatures = FeatureIndexType.Empty !== params.vertices.featureIndexType;
    if (FeatureIndexType.Uniform === params.vertices.featureIndexType)
      this.uniformFeatureId = params.vertices.uniformFeatureID;

    if (undefined !== params.surface.textureMapping) {
      this.texture = params.surface.textureMapping.texture as Texture;
      this._textureAlwaysDisplayed = params.surface.textureMapping.alwaysDisplayed;
    } else {
      this.texture = undefined;
      this._textureAlwaysDisplayed = false;
    }

    this.materialInfo = createMaterialInfo(params.surface.material);

    this.type = params.surface.type;
    this.fillFlags = params.surface.fillFlags;
    this.isPlanar = params.isPlanar;
    this.hasBakedLighting = params.surface.hasBakedLighting;
    this.hasFixedNormals = params.surface.hasFixedNormals;
    const edges = params.edges;
    this.edgeWidth = undefined !== edges ? edges.weight : 1;
    this.edgeLineCode = LineCode.valueFromLinePixels(undefined !== edges ? edges.linePixels : LinePixels.Solid);
  }

  public static create(params: MeshParams, viOrigin: Point3d | undefined): MeshData | undefined {
    const lut = VertexLUT.createFromVertexTable(params.vertices, params.auxChannels);
    return undefined !== lut ? new MeshData(lut, params, viOrigin) : undefined;
  }

  public get isDisposed(): boolean { return undefined === this.texture && this.lut.isDisposed; }

  public dispose() {
    dispose(this.lut);
    if (this._ownsTexture)
      this.texture!.dispose();
  }

  public get isGlyph() { return undefined !== this.texture && this.texture.isGlyph; }
  public get isTextureAlwaysDisplayed() { return this.isGlyph || this._textureAlwaysDisplayed; }

  // Returns true if no one else owns this texture. Implies that the texture should be disposed when this object is disposed, and the texture's memory should be tracked as belonging to this object.
  private get _ownsTexture(): boolean {
    return undefined !== this.texture && undefined === this.texture.key && !this.texture.isOwned;
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    stats.addVertexTable(this.lut.bytesUsed);
    if (this._ownsTexture)
      stats.addTexture(this.texture!.bytesUsed);
  }
}

/** @internal */
export class MeshGraphic extends Graphic {
  public readonly meshData: MeshData;
  private readonly _primitives: Primitive[] = [];
  private readonly _instances?: InstanceBuffers;

  public static create(params: MeshParams, instancesOrVIOrigin?: InstancedGraphicParams | Point3d): MeshGraphic | undefined {
    const viOrigin = instancesOrVIOrigin instanceof Point3d ? instancesOrVIOrigin : undefined;
    const instances = undefined === viOrigin ? instancesOrVIOrigin as InstancedGraphicParams : undefined;
    const buffers = undefined !== instances ? InstanceBuffers.create(instances, true) : undefined;
    if (undefined === buffers && undefined !== instances)
      return undefined;

    const data = MeshData.create(params, viOrigin);
    return undefined !== data ? new MeshGraphic(data, params, buffers) : undefined;
  }

  private addPrimitive(createGeom: () => CachedGeometry | undefined, instances?: InstanceBuffers) {
    const primitive = Primitive.createShared(createGeom, instances);
    if (undefined !== primitive)
      this._primitives.push(primitive);
  }

  private constructor(data: MeshData, params: MeshParams, instances?: InstanceBuffers) {
    super();
    this.meshData = data;
    this._instances = instances;

    this.addPrimitive(() => SurfaceGeometry.create(this.meshData, params.surface.indices), instances);

    // Classifiers are surfaces only...no edges.
    if (this.surfaceType === SurfaceType.VolumeClassifier || undefined === params.edges)
      return;

    const edges = params.edges;
    if (undefined !== edges.silhouettes)
      this.addPrimitive(() => SilhouetteEdgeGeometry.createSilhouettes(this.meshData, edges.silhouettes!), instances);

    if (undefined !== edges.segments)
      this.addPrimitive(() => EdgeGeometry.create(this.meshData, edges.segments!), instances);

    if (undefined !== edges.polylines)
      this.addPrimitive(() => PolylineEdgeGeometry.create(this.meshData, edges.polylines!), instances);
  }

  public get isDisposed(): boolean { return this.meshData.isDisposed && 0 === this._primitives.length; }
  public get isPickable() { return false; }

  public dispose() {
    dispose(this.meshData);
    for (const primitive of this._primitives)
      dispose(primitive);

    this._primitives.length = 0;
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    this.meshData.collectStatistics(stats);
    this._primitives.forEach((prim) => prim.collectStatistics(stats));

    // Only count the shared instance buffers once...
    if (undefined !== this._instances)
      this._instances.collectStatistics(stats);
  }

  public addCommands(cmds: RenderCommands): void { this._primitives.forEach((prim) => prim.addCommands(cmds)); }
  public override addHiliteCommands(cmds: RenderCommands, pass: RenderPass): void { this._primitives.forEach((prim) => prim.addHiliteCommands(cmds, pass)); }

  public get surfaceType(): SurfaceType { return this.meshData.type; }
}

/** Defines one aspect of the geometry of a mesh (surface or edges)
 * @internal
 */
export abstract class MeshGeometry extends LUTGeometry {
  public readonly mesh: MeshData;
  protected readonly _numIndices: number;

  public override get asMesh() { return this; }
  protected override _getLineWeight(params: ShaderProgramParams): number { return this.computeEdgeWeight(params); }

  // Convenience accessors...
  public get edgeWidth() { return this.mesh.edgeWidth; }
  public get edgeLineCode() { return this.mesh.edgeLineCode; }
  public override get hasFeatures() { return this.mesh.hasFeatures; }
  public get surfaceType() { return this.mesh.type; }
  public get fillFlags() { return this.mesh.fillFlags; }
  public get isPlanar() { return this.mesh.isPlanar; }
  public get colorInfo(): ColorInfo { return this.mesh.lut.colorInfo; }
  public get uniformColor(): FloatRgba | undefined { return this.colorInfo.isUniform ? this.colorInfo.uniform : undefined; }
  public get texture() { return this.mesh.texture; }
  public override get hasBakedLighting() { return this.mesh.hasBakedLighting; }
  public get hasFixedNormals() { return this.mesh.hasFixedNormals; }
  public get lut() { return this.mesh.lut; }
  public get hasScalarAnimation() { return this.mesh.lut.hasScalarAnimation; }

  protected constructor(mesh: MeshData, numIndices: number) {
    super(mesh.viewIndependentOrigin);
    this._numIndices = numIndices;
    this.mesh = mesh;
  }

  protected computeEdgeWeight(params: ShaderProgramParams): number {
    return params.target.computeEdgeWeight(params.renderPass, this.edgeWidth);
  }
  protected computeEdgeLineCode(params: ShaderProgramParams): number {
    return params.target.computeEdgeLineCode(params.renderPass, this.edgeLineCode);
  }
  protected computeEdgeColor(target: Target): ColorInfo {
    return target.computeEdgeColor(this.colorInfo);
  }
  protected computeEdgePass(target: Target): RenderPass {
    if (target.isDrawingShadowMap)
      return RenderPass.None;

    const vf = target.currentViewFlags;
    if (RenderMode.SmoothShade === vf.renderMode && !vf.visibleEdges) {
      return RenderPass.None;
    }

    // Only want translucent edges in wireframe mode.
    const isTranslucent = RenderMode.Wireframe === vf.renderMode && vf.transparency && this.colorInfo.hasTranslucency;
    return isTranslucent ? RenderPass.Translucent : RenderPass.OpaqueLinear;
  }
}

/** @internal */
export class EdgeGeometry extends MeshGeometry {
  public readonly buffers: BuffersContainer;
  protected readonly _indices: BufferHandle;
  protected readonly _endPointAndQuadIndices: BufferHandle;

  public get lutBuffers() { return this.buffers; }
  public override get asSurface() { return undefined; }
  public override get asEdge() { return this; }
  public override get asSilhouette(): SilhouetteEdgeGeometry | undefined { return undefined; }

  public static create(mesh: MeshData, edges: SegmentEdgeParams): EdgeGeometry | undefined {
    const indexBuffer = BufferHandle.createArrayBuffer(edges.indices.data);
    const endPointBuffer = BufferHandle.createArrayBuffer(edges.endPointAndQuadIndices);
    return undefined !== indexBuffer && undefined !== endPointBuffer ? new EdgeGeometry(indexBuffer, endPointBuffer, edges.indices.length, mesh) : undefined;
  }

  public get isDisposed(): boolean {
    return this.buffers.isDisposed
      && this._indices.isDisposed
      && this._endPointAndQuadIndices.isDisposed;
  }

  public dispose() {
    dispose(this.buffers);
    dispose(this._indices);
    dispose(this._endPointAndQuadIndices);
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    stats.addVisibleEdges(this._indices.bytesUsed + this._endPointAndQuadIndices.bytesUsed);
  }

  protected _draw(numInstances: number, instanceBuffersContainer?: BuffersContainer): void {
    const bufs = instanceBuffersContainer !== undefined ? instanceBuffersContainer : this.buffers;

    bufs.bind();
    System.instance.drawArrays(GL.PrimitiveType.Triangles, 0, this._numIndices, numInstances);
    bufs.unbind();
  }

  protected _wantWoWReversal(_target: Target): boolean { return true; }
  protected override _getLineCode(params: ShaderProgramParams): number { return this.computeEdgeLineCode(params); }
  public get techniqueId(): TechniqueId { return TechniqueId.Edge; }
  public getRenderPass(target: Target): RenderPass { return this.computeEdgePass(target); }
  public get renderOrder(): RenderOrder { return this.isPlanar ? RenderOrder.PlanarEdge : RenderOrder.Edge; }
  public override getColor(target: Target): ColorInfo { return this.computeEdgeColor(target); }
  public get endPointAndQuadIndices(): BufferHandle { return this._endPointAndQuadIndices; }
  public override wantMonochrome(target: Target): boolean {
    return target.currentViewFlags.renderMode === RenderMode.Wireframe;
  }

  protected constructor(indices: BufferHandle, endPointAndQuadsIndices: BufferHandle, numIndices: number, mesh: MeshData) {
    super(mesh, numIndices);
    this.buffers = BuffersContainer.create();
    const attrPos = AttributeMap.findAttribute("a_pos", TechniqueId.Edge, false);
    const attrEndPointAndQuadIndices = AttributeMap.findAttribute("a_endPointAndQuadIndices", TechniqueId.Edge, false);
    assert(attrPos !== undefined);
    assert(attrEndPointAndQuadIndices !== undefined);
    this.buffers.addBuffer(indices, [BufferParameters.create(attrPos.location, 3, GL.DataType.UnsignedByte, false, 0, 0, false)]);
    this.buffers.addBuffer(endPointAndQuadsIndices, [BufferParameters.create(attrEndPointAndQuadIndices.location, 4, GL.DataType.UnsignedByte, false, 0, 0, false)]);
    this._indices = indices;
    this._endPointAndQuadIndices = endPointAndQuadsIndices;
  }
}

/** @internal */
export class SilhouetteEdgeGeometry extends EdgeGeometry {
  private readonly _normalPairs: BufferHandle;

  public override get asSilhouette() { return this; }

  public static createSilhouettes(mesh: MeshData, params: SilhouetteParams): SilhouetteEdgeGeometry | undefined {
    const indexBuffer = BufferHandle.createArrayBuffer(params.indices.data);
    const endPointBuffer = BufferHandle.createArrayBuffer(params.endPointAndQuadIndices);
    const normalsBuffer = BufferHandle.createArrayBuffer(params.normalPairs);
    return undefined !== indexBuffer && undefined !== endPointBuffer && undefined !== normalsBuffer ? new SilhouetteEdgeGeometry(indexBuffer, endPointBuffer, normalsBuffer, params.indices.length, mesh) : undefined;
  }

  public override get isDisposed(): boolean { return super.isDisposed && this._normalPairs.isDisposed; }

  public override dispose() {
    super.dispose();
    dispose(this._normalPairs);
  }

  public override collectStatistics(stats: RenderMemory.Statistics): void {
    stats.addSilhouetteEdges(this._indices.bytesUsed + this._endPointAndQuadIndices.bytesUsed + this._normalPairs.bytesUsed);
  }

  public override get techniqueId(): TechniqueId { return TechniqueId.SilhouetteEdge; }
  public override get renderOrder(): RenderOrder { return this.isPlanar ? RenderOrder.PlanarSilhouette : RenderOrder.Silhouette; }
  public get normalPairs(): BufferHandle { return this._normalPairs; }

  private constructor(indices: BufferHandle, endPointAndQuadsIndices: BufferHandle, normalPairs: BufferHandle, numIndices: number, mesh: MeshData) {
    super(indices, endPointAndQuadsIndices, numIndices, mesh);
    const attrNormals = AttributeMap.findAttribute("a_normals", TechniqueId.SilhouetteEdge, false);
    assert(attrNormals !== undefined);
    this.buffers.addBuffer(normalPairs, [BufferParameters.create(attrNormals.location, 4, GL.DataType.UnsignedByte, false, 0, 0, false)]);
    this._normalPairs = normalPairs;
  }
}

/** @internal */
export class PolylineEdgeGeometry extends MeshGeometry {
  private _buffers: PolylineBuffers;

  public get lutBuffers() { return this._buffers.buffers; }

  public static create(mesh: MeshData, polyline: TesselatedPolyline): PolylineEdgeGeometry | undefined {
    const buffers = PolylineBuffers.create(polyline);
    return undefined !== buffers ? new PolylineEdgeGeometry(polyline.indices.length, buffers, mesh) : undefined;
  }

  public get isDisposed(): boolean { return this._buffers.isDisposed; }

  public dispose() {
    dispose(this._buffers);
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    this._buffers.collectStatistics(stats, RenderMemory.BufferType.PolylineEdges);
  }

  protected _wantWoWReversal(_target: Target): boolean { return true; }
  protected override _getLineWeight(params: ShaderProgramParams): number { return this.computeEdgeWeight(params); }
  protected override _getLineCode(params: ShaderProgramParams): number { return this.computeEdgeLineCode(params); }
  public override getColor(target: Target): ColorInfo { return this.computeEdgeColor(target); }
  public get techniqueId(): TechniqueId { return TechniqueId.Polyline; }
  public getRenderPass(target: Target): RenderPass { return this.computeEdgePass(target); }
  public get renderOrder(): RenderOrder { return this.isPlanar ? RenderOrder.PlanarEdge : RenderOrder.Edge; }
  public override get polylineBuffers(): PolylineBuffers { return this._buffers; }

  public override wantMonochrome(target: Target): boolean {
    return target.currentViewFlags.renderMode === RenderMode.Wireframe;
  }

  protected _draw(numInstances: number, instanceBuffersContainer?: BuffersContainer): void {
    const gl = System.instance;
    const bufs = instanceBuffersContainer !== undefined ? instanceBuffersContainer : this._buffers.buffers;

    bufs.bind();
    gl.drawArrays(GL.PrimitiveType.Triangles, 0, this._numIndices, numInstances);
    bufs.unbind();
  }

  private constructor(numIndices: number, buffers: PolylineBuffers, mesh: MeshData) {
    super(mesh, numIndices);
    this._buffers = buffers;
  }
}

/** @internal */
export function wantMaterials(vf: ViewFlags): boolean {
  return vf.materials && RenderMode.SmoothShade === vf.renderMode;
}

function wantLighting(vf: ViewFlags) {
  return RenderMode.SmoothShade === vf.renderMode && vf.lighting;
}

/** @internal */
export class SurfaceGeometry extends MeshGeometry {
  private readonly _buffers: BuffersContainer;
  private readonly _indices: BufferHandle;

  public get lutBuffers() { return this._buffers; }

  public static create(mesh: MeshData, indices: VertexIndices): SurfaceGeometry | undefined {
    const indexBuffer = BufferHandle.createArrayBuffer(indices.data);
    return undefined !== indexBuffer ? new SurfaceGeometry(indexBuffer, indices.length, mesh) : undefined;
  }

  public get isDisposed(): boolean {
    return this._buffers.isDisposed
      && this._indices.isDisposed;
  }

  public dispose() {
    dispose(this._buffers);
    dispose(this._indices);
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    stats.addSurface(this._indices.bytesUsed);
  }

  public get isLit() { return SurfaceType.Lit === this.surfaceType || SurfaceType.TexturedLit === this.surfaceType; }
  public get isTexturedType() { return SurfaceType.Textured === this.surfaceType || SurfaceType.TexturedLit === this.surfaceType; }
  public get hasTexture() { return this.isTexturedType && undefined !== this.texture; }
  public get isGlyph() { return this.mesh.isGlyph; }
  public override get alwaysRenderTranslucent() { return this.isGlyph; }
  public get isTileSection() { return undefined !== this.texture && this.texture.isTileSection; }
  public get isClassifier() { return SurfaceType.VolumeClassifier === this.surfaceType; }
  public override get supportsThematicDisplay() {
    return !this.isGlyph;
  }

  public override get allowColorOverride() {
    // Text background color should not be overridden by feature symbology overrides - otherwise it becomes unreadable...
    // We don't actually know if we have text.
    // We do know that text background color uses blanking fill. So do ImageGraphics, so they're also going to forbid overriding their color.
    return FillFlags.Blanking !== (this.fillFlags & FillFlags.Blanking);
  }

  public override get asSurface() { return this; }
  public override get asEdge() { return undefined; }
  public override get asSilhouette() { return undefined; }

  protected _draw(numInstances: number, instanceBuffersContainer?: BuffersContainer): void {
    const system = System.instance;

    // If we can't write depth in the fragment shader, use polygonOffset to force blanking regions to draw behind.
    const offset = RenderOrder.BlankingRegion === this.renderOrder && !system.supportsLogZBuffer;
    if (offset) {
      system.context.enable(GL.POLYGON_OFFSET_FILL);
      system.context.polygonOffset(1.0, 1.0);
    }

    const bufs = instanceBuffersContainer !== undefined ? instanceBuffersContainer : this._buffers;
    bufs.bind();
    const primType = system.drawSurfacesAsWiremesh ? GL.PrimitiveType.Lines : GL.PrimitiveType.Triangles;
    system.drawArrays(primType, 0, this._numIndices, numInstances);
    bufs.unbind();

    if (offset)
      system.context.disable(GL.POLYGON_OFFSET_FILL);
  }

  public override wantMixMonochromeColor(target: Target): boolean {
    // Text relies on white-on-white reversal.
    return !this.isGlyph && (this.isLitSurface || this.wantTextures(target, this.hasTexture));
  }

  public get techniqueId(): TechniqueId { return TechniqueId.Surface; }
  public override get isLitSurface() { return this.isLit; }
  public override get hasBakedLighting() { return this.mesh.hasBakedLighting; }
  public override get hasFixedNormals() { return this.mesh.hasFixedNormals; }
  public get renderOrder(): RenderOrder {
    if (FillFlags.Behind === (this.fillFlags & FillFlags.Behind))
      return RenderOrder.BlankingRegion;

    let order = this.isLit ? RenderOrder.LitSurface : RenderOrder.UnlitSurface;
    if (this.isPlanar)
      order = order | RenderOrder.PlanarBit;

    return order;
  }

  public override getColor(target: Target) {
    if (FillFlags.Background === (this.fillFlags & FillFlags.Background))
      return target.uniforms.style.backgroundColorInfo;
    else
      return this.colorInfo;
  }

  public getRenderPass(target: Target): RenderPass {
    // Classifiers have a dedicated pass
    if (this.isClassifier)
      return RenderPass.Classification;

    const opaquePass = this.isPlanar ? RenderPass.OpaquePlanar : RenderPass.OpaqueGeneral;

    // When reading pixels, glyphs are always opaque. Otherwise always transparent (for anti-aliasing).
    if (this.isGlyph)
      return target.isReadPixelsInProgress ? opaquePass : RenderPass.Translucent;

    const vf = target.currentViewFlags;

    // When rendering thematic isolines, we need translucency because they have anti-aliasing.
    if (target.wantThematicDisplay && this.supportsThematicDisplay && target.uniforms.thematic.wantIsoLines)
      return RenderPass.Translucent;

    // In wireframe, unless fill is explicitly enabled for planar region, surface does not draw
    if (RenderMode.Wireframe === vf.renderMode && !this.mesh.isTextureAlwaysDisplayed) {
      const fillFlags = this.fillFlags;
      const showFill = FillFlags.Always === (fillFlags & FillFlags.Always) || (vf.fill && FillFlags.ByView === (fillFlags & FillFlags.ByView));
      if (!showFill)
        return RenderPass.None;
    }

    // If transparency disabled by render mode or view flag, always draw opaque.
    if (!vf.transparency || RenderMode.SolidFill === vf.renderMode || RenderMode.HiddenLine === vf.renderMode)
      return opaquePass;

    // We have 3 sources of alpha: the material, the texture, and the color.
    // Base alpha comes from the material if it overrides it; otherwise from the color.
    // The texture's alpha is multiplied by the base alpha.
    // So we must draw in the translucent pass if the texture has transparency OR the base alpha is less than 1.
    let hasAlpha = false;
    const mat = wantMaterials(vf) ? this.mesh.materialInfo : undefined;
    if (undefined !== mat && mat.overridesAlpha)
      hasAlpha = mat.hasTranslucency;
    else
      hasAlpha = this.getColor(target).hasTranslucency;

    if (!hasAlpha) {
      const tex = this.wantTextures(target, true) ? this.texture : undefined;
      hasAlpha = undefined !== tex && tex.hasTranslucency;
    }

    return hasAlpha ? RenderPass.Translucent : opaquePass;
  }

  protected _wantWoWReversal(target: Target): boolean {
    const fillFlags = this.fillFlags;
    if (FillFlags.None !== (fillFlags & FillFlags.Background))
      return false; // fill color explicitly from background

    if (FillFlags.None !== (fillFlags & FillFlags.Always))
      return true; // fill displayed even in wireframe

    const vf = target.currentViewFlags;
    if (RenderMode.Wireframe === vf.renderMode || vf.visibleEdges)
      return false; // never invert surfaces when edges are displayed

    if (this.isLit && wantLighting(vf))
      return false;

    // Don't invert white pixels of textures...
    return !this.wantTextures(target, this.hasTexture);
  }

  public override get materialInfo(): MaterialInfo | undefined { return this.mesh.materialInfo; }

  public useTexture(params: ShaderProgramParams): boolean {
    return this.wantTextures(params.target, this.hasTexture);
  }

  public computeSurfaceFlags(params: ShaderProgramParams, flags: Int32Array): void {
    const target = params.target;
    const vf = target.currentViewFlags;

    const useMaterial = wantMaterials(vf);
    flags[SurfaceBitIndex.IgnoreMaterial] = useMaterial ? 0 : 1;
    flags[SurfaceBitIndex.HasMaterialAtlas] = useMaterial && this.hasMaterialAtlas ? 1 : 0;

    flags[SurfaceBitIndex.ApplyLighting] = 0;
    flags[SurfaceBitIndex.NoFaceFront] = 0;
    flags[SurfaceBitIndex.HasColorAndNormal] = 0;
    if (this.isLit) {
      flags[SurfaceBitIndex.HasNormals] = 1;
      if (wantLighting(vf)) {
        flags[SurfaceBitIndex.ApplyLighting] = 1;
        if (this.hasFixedNormals)
          flags[SurfaceBitIndex.NoFaceFront] = 1;
      }

      // Textured meshes store normal in place of color index.
      // Untextured lit meshes store normal where textured meshes would store UV coords.
      // Tell shader where to find normal.
      if (!this.isTexturedType) {
        flags[SurfaceBitIndex.HasColorAndNormal] = 1;
      }
    } else {
      flags[SurfaceBitIndex.HasNormals] = 0;
    }

    flags[SurfaceBitIndex.HasTexture] = this.useTexture(params) ? 1 : 0;

    // The transparency threshold controls how transparent a surface must be to allow light to pass through; more opaque surfaces cast shadows.
    flags[SurfaceBitIndex.TransparencyThreshold] = params.target.isDrawingShadowMap ? 1 : 0;
    flags[SurfaceBitIndex.BackgroundFill] = 0;
    switch (params.renderPass) {
      // NB: We need this for opaque pass due to SolidFill (must compute transparency, discard below threshold, render opaque at or above threshold)
      case RenderPass.OpaqueLinear:
      case RenderPass.OpaquePlanar:
      case RenderPass.OpaqueGeneral:
      case RenderPass.Translucent:
      case RenderPass.WorldOverlay:
      case RenderPass.OpaqueLayers:
      case RenderPass.TranslucentLayers:
      case RenderPass.OverlayLayers: {
        const mode = vf.renderMode;
        if (!this.isGlyph && (RenderMode.HiddenLine === mode || RenderMode.SolidFill === mode)) {
          flags[SurfaceBitIndex.TransparencyThreshold] = 1;
          if (RenderMode.HiddenLine === mode && FillFlags.Always !== (this.fillFlags & FillFlags.Always)) {
            // fill flags test for text - doesn't render with bg fill in hidden line mode.
            flags[SurfaceBitIndex.BackgroundFill] = 1;
          }
          break;
        }
      }
    }
  }

  private constructor(indices: BufferHandle, numIndices: number, mesh: MeshData) {
    super(mesh, numIndices);
    this._buffers = BuffersContainer.create();
    const attrPos = AttributeMap.findAttribute("a_pos", TechniqueId.Surface, false);
    assert(undefined !== attrPos);
    this._buffers.addBuffer(indices, [BufferParameters.create(attrPos.location, 3, GL.DataType.UnsignedByte, false, 0, 0, false)]);
    this._indices = indices;
  }

  private wantTextures(target: Target, surfaceTextureExists: boolean): boolean {
    if (this.hasScalarAnimation && undefined !== target.analysisTexture)
      return true;

    if (!surfaceTextureExists)
      return false;

    if (this.mesh.isTextureAlwaysDisplayed)
      return true;

    if (this.supportsThematicDisplay && target.wantThematicDisplay)
      return false;

    const fill = this.fillFlags;
    const flags = target.currentViewFlags;

    // ###TODO need to distinguish between gradient fill and actual textures...
    switch (flags.renderMode) {
      case RenderMode.SmoothShade:
        return flags.textures;
      case RenderMode.Wireframe:
        return FillFlags.Always === (fill & FillFlags.Always) || (flags.fill && FillFlags.ByView === (fill & FillFlags.ByView));
      default:
        return FillFlags.Always === (fill & FillFlags.Always);
    }
  }
}
