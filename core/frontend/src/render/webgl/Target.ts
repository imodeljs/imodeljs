/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { assert, dispose, Id64, Id64String, IDisposable } from "@bentley/bentleyjs-core";
import { Point2d, Point3d, Range3d, Transform, XAndY, XYZ } from "@bentley/geometry-core";
import {
  AmbientOcclusion, AnalysisStyle, Frustum, ImageBuffer, ImageBufferFormat, Npc, RenderMode, RenderTexture, SpatialClassifier, ThematicDisplayMode, ViewFlags,
} from "@bentley/imodeljs-common";
import { canvasToImageBuffer, canvasToResizedCanvasWithBars, imageBufferToCanvas } from "../../ImageUtil";
import { HiliteSet } from "../../SelectionSet";
import { SceneContext } from "../../ViewContext";
import { Viewport } from "../../Viewport";
import { ViewRect } from "../../ViewRect";
import { IModelConnection } from "../../IModelConnection";
import { CanvasDecoration } from "../CanvasDecoration";
import { Decorations } from "../Decorations";
import { FeatureSymbology } from "../FeatureSymbology";
import { AnimationBranchStates } from "../GraphicBranch";
import { Pixel } from "../Pixel";
import { GraphicList } from "../RenderGraphic";
import { RenderMemory } from "../RenderMemory";
import { createEmptyRenderPlan, RenderPlan } from "../RenderPlan";
import { PlanarClassifierMap, RenderPlanarClassifier } from "../RenderPlanarClassifier";
import { RenderTextureDrape, TextureDrapeMap } from "../RenderSystem";
import { PrimitiveVisibility, RenderTarget, RenderTargetDebugControl } from "../RenderTarget";
import { ScreenSpaceEffectContext } from "../ScreenSpaceEffectBuilder";
import { Scene } from "../Scene";
import { QueryTileFeaturesOptions, QueryVisibleFeaturesCallback } from "../VisibleFeature";
import { BranchState } from "./BranchState";
import { CachedGeometry, SingleTexturedViewportQuadGeometry } from "./CachedGeometry";
import { ColorInfo } from "./ColorInfo";
import { WebGLDisposable } from "./Disposable";
import { DrawParams, ShaderProgramParams } from "./DrawCommand";
import { FrameBuffer } from "./FrameBuffer";
import { GL } from "./GL";
import { Batch, Branch, WorldDecorations } from "./Graphic";
import { IModelFrameLifecycle } from "./IModelFrameLifecycle";
import { PerformanceMetrics } from "./PerformanceMetrics";
import { PlanarClassifier } from "./PlanarClassifier";
import { Primitive } from "./Primitive";
import { RenderCommands } from "./RenderCommands";
import { RenderPass } from "./RenderFlags";
import { RenderState } from "./RenderState";
import { SceneCompositor } from "./SceneCompositor";
import { freeDrawParams } from "./ScratchDrawParams";
import { ShaderProgramExecutor } from "./ShaderProgram";
import { SolarShadowMap } from "./SolarShadowMap";
import { desync, SyncTarget } from "./Sync";
import { System } from "./System";
import { TargetUniforms } from "./TargetUniforms";
import { Techniques } from "./Technique";
import { TechniqueId } from "./TechniqueId";
import { TextureHandle } from "./Texture";
import { TextureDrape } from "./TextureDrape";
import { EdgeSettings } from "./EdgeSettings";
import { TargetGraphics } from "./TargetGraphics";
import { VisibleTileFeatures } from "./VisibleTileFeatures";
import { FrameStatsCollector } from "../FrameStats";

function swapImageByte(image: ImageBuffer, i0: number, i1: number) {
  const tmp = image.data[i0];
  image.data[i0] = image.data[i1];
  image.data[i1] = tmp;
}

/** @internal */
export interface Hilites {
  readonly elements: Id64.Uint32Set;
  readonly subcategories: Id64.Uint32Set;
  readonly models: Id64.Uint32Set;
  readonly isEmpty: boolean;
}

class EmptyHiliteSet {
  public readonly elements: Id64.Uint32Set;
  public readonly subcategories: Id64.Uint32Set;
  public readonly models: Id64.Uint32Set;
  public readonly isEmpty = true;

  public constructor() {
    this.elements = this.subcategories = this.models = new Id64.Uint32Set();
  }
}

/** @internal */
export abstract class Target extends RenderTarget implements RenderTargetDebugControl, WebGLDisposable {
  public readonly graphics = new TargetGraphics();
  private _planarClassifiers?: PlanarClassifierMap;
  private _textureDrapes?: TextureDrapeMap;
  private _worldDecorations?: WorldDecorations;
  private _hilites: Hilites = new EmptyHiliteSet();
  private _hiliteSyncTarget: SyncTarget = { syncKey: Number.MIN_SAFE_INTEGER };
  private _flashed: Id64.Uint32Pair = { lower: 0, upper: 0 };
  private _flashedId = Id64.invalid;
  private _flashIntensity: number = 0;
  private _renderCommands: RenderCommands;
  private _overlayRenderState: RenderState;
  protected _compositor: SceneCompositor;
  private _fbo?: FrameBuffer;
  private _dcAssigned = false;
  public performanceMetrics?: PerformanceMetrics;
  public readonly decorationsState = BranchState.createForDecorations(); // Used when rendering view background and view/world overlays.
  public readonly uniforms = new TargetUniforms(this);
  public readonly renderRect = new ViewRect();
  public analysisStyle?: AnalysisStyle;
  public analysisTexture?: RenderTexture;
  public ambientOcclusionSettings = AmbientOcclusion.Settings.defaults;
  private _wantAmbientOcclusion = false;
  private _batches: Batch[] = [];
  public plan = createEmptyRenderPlan();
  private _animationBranches?: AnimationBranchStates;
  private _isReadPixelsInProgress = false;
  private _readPixelsSelector = Pixel.Selector.None;
  private _drawNonLocatable = true;
  private _currentlyDrawingClassifier?: PlanarClassifier;
  private _analysisFraction: number = 0;
  private _antialiasSamples = 1;
  // This exists strictly to be forwarded to ScreenSpaceEffects. Do not use it for anything else.
  private _viewport?: Viewport;
  private _screenSpaceEffects: string[] = [];
  public isFadeOutActive = false;
  public activeVolumeClassifierTexture?: WebGLTexture;
  public activeVolumeClassifierProps?: SpatialClassifier;
  public activeVolumeClassifierModelId?: Id64String;

  // RenderTargetDebugControl
  public vcSupportIntersectingVolumes: boolean = false;
  public drawForReadPixels = false;
  public drawingBackgroundForReadPixels = false;
  public primitiveVisibility = PrimitiveVisibility.All;
  public displayDrapeFrustum = false;
  public displayRealityTilePreload = false;
  public displayRealityTileRanges = false;
  public logRealityTiles = false;

  public freezeRealityTiles = false;
  public get shadowFrustum(): Frustum | undefined {
    const map = this.solarShadowMap;
    return map.isEnabled && map.isReady ? map.frustum : undefined;
  }

  public override get debugControl(): RenderTargetDebugControl { return this; }

  public get viewRect(): ViewRect {
    return this.renderRect;
  }

  protected constructor(rect?: ViewRect) {
    super();
    this._renderCommands = this.uniforms.branch.createRenderCommands(this.uniforms.batch.state);
    this._overlayRenderState = new RenderState();
    this._overlayRenderState.flags.depthMask = false;
    this._overlayRenderState.flags.blend = true;
    this._overlayRenderState.blend.setBlendFunc(GL.BlendFactor.One, GL.BlendFactor.OneMinusSrcAlpha);
    this._compositor = SceneCompositor.create(this);  // compositor is created but not yet initialized... we are still undisposed
    this.renderRect = rect ? rect : new ViewRect();  // if the rect is undefined, expect that it will be updated dynamically in an OnScreenTarget
    if (undefined !== System.instance.antialiasSamples)
      this._antialiasSamples = System.instance.antialiasSamples;
    else
      this._antialiasSamples = (undefined !== System.instance.options.antialiasSamples ? System.instance.options.antialiasSamples : 1);
  }

  public get compositor() { return this._compositor; }
  public get isReadPixelsInProgress(): boolean { return this._isReadPixelsInProgress; }
  public get readPixelsSelector(): Pixel.Selector { return this._readPixelsSelector; }
  public get drawNonLocatable(): boolean { return this._drawNonLocatable; }

  public get techniques(): Techniques { return this.renderSystem.techniques; }

  public get hilites(): Hilites { return this._hilites; }
  public get hiliteSyncTarget(): SyncTarget { return this._hiliteSyncTarget; }

  public get flashed(): Id64.Uint32Pair | undefined { return Id64.isValid(this._flashedId) ? this._flashed : undefined; }
  public get flashedId(): Id64String { return this._flashedId; }
  public get flashIntensity(): number { return this._flashIntensity; }

  public get analysisFraction(): number { return this._analysisFraction; }
  public set analysisFraction(fraction: number) { this._analysisFraction = fraction; }

  public override get animationBranches(): AnimationBranchStates | undefined {
    return this._animationBranches;
  }
  public override set animationBranches(branches: AnimationBranchStates | undefined) {
    this.disposeAnimationBranches();
    this._animationBranches = branches;
  }

  private disposeAnimationBranches(): void {
    this._animationBranches = undefined;
  }

  public override get antialiasSamples(): number { return this._antialiasSamples; }
  public override set antialiasSamples(numSamples: number) { this._antialiasSamples = numSamples; }

  public get solarShadowMap(): SolarShadowMap { return this.compositor.solarShadowMap; }
  public get isDrawingShadowMap(): boolean { return this.solarShadowMap.isEnabled && this.solarShadowMap.isDrawing; }
  public override getPlanarClassifier(id: Id64String): RenderPlanarClassifier | undefined {
    return undefined !== this._planarClassifiers ? this._planarClassifiers.get(id) : undefined;
  }
  public override createPlanarClassifier(properties?: SpatialClassifier): PlanarClassifier {
    return PlanarClassifier.create(properties, this);
  }
  public override getTextureDrape(id: Id64String): RenderTextureDrape | undefined {
    return undefined !== this._textureDrapes ? this._textureDrapes.get(id) : undefined;
  }

  public getWorldDecorations(decs: GraphicList): Branch {
    if (undefined === this._worldDecorations) {
      // Don't allow flags like monochrome etc to affect world decorations. Allow lighting in 3d only.
      const vf = new ViewFlags();
      vf.renderMode = RenderMode.SmoothShade;
      vf.clipVolume = false;
      vf.whiteOnWhiteReversal = false;

      vf.lighting = !this.is2d;
      vf.shadows = false; // don't want shadows applied to these

      this._worldDecorations = new WorldDecorations(vf);
    }

    this._worldDecorations.init(decs);
    return this._worldDecorations;
  }

  public get currentBranch(): BranchState { return this.uniforms.branch.top; }
  public get currentViewFlags(): ViewFlags { return this.currentBranch.viewFlags; }
  public get currentTransform(): Transform { return this.currentBranch.transform; }
  public get currentTransparencyThreshold(): number { return this.currentEdgeSettings.transparencyThreshold; }
  public get currentEdgeSettings(): EdgeSettings { return this.currentBranch.edgeSettings; }
  public get currentFeatureSymbologyOverrides(): FeatureSymbology.Overrides { return this.currentBranch.symbologyOverrides; }
  public get currentPlanarClassifier(): PlanarClassifier | undefined { return this.currentBranch.planarClassifier; }
  public get currentlyDrawingClassifier(): PlanarClassifier | undefined { return this._currentlyDrawingClassifier; }
  public get currentTextureDrape(): TextureDrape | undefined {
    const drape = this.currentBranch.textureDrape;
    return undefined !== drape && drape.isReady ? drape : undefined;
  }
  public get currentPlanarClassifierOrDrape(): PlanarClassifier | TextureDrape | undefined {
    const drape = this.currentTextureDrape;
    return undefined === drape ? this.currentPlanarClassifier : drape;
  }

  public modelToView(modelPt: XYZ, result?: Point3d): Point3d {
    return this.uniforms.branch.modelViewMatrix.multiplyPoint3dQuietNormalize(modelPt, result);
  }

  public get is2d(): boolean { return this.uniforms.frustum.is2d; }
  public get is3d(): boolean { return !this.is2d; }

  private _isDisposed = false;
  public get isDisposed(): boolean {
    return this.graphics.isDisposed
      && undefined === this._fbo
      && undefined === this._worldDecorations
      && undefined === this._planarClassifiers
      && undefined === this._textureDrapes
      && this._renderCommands.isEmpty
      && 0 === this._batches.length
      && this.uniforms.thematic.isDisposed
      && this._isDisposed;
  }

  protected allocateFbo(): FrameBuffer | undefined {
    if (this._fbo)
      return this._fbo;

    const rect = this.viewRect;
    const color = TextureHandle.createForAttachment(rect.width, rect.height, GL.Texture.Format.Rgba, GL.Texture.DataType.UnsignedByte);
    if (undefined === color)
      return undefined;

    this._fbo = FrameBuffer.create([color]);
    if (undefined === this._fbo) {
      color.dispose();
      return undefined;
    }

    return this._fbo;
  }

  protected disposeFbo(): void {
    if (!this._fbo)
      return;

    const tx = this._fbo.getColor(0);
    this._fbo = dispose(this._fbo);
    this._dcAssigned = false;

    // We allocated our framebuffer's color attachment, so must dispose of it too.
    assert(undefined !== tx);
    dispose(tx);
  }

  public override dispose() {
    this.reset();
    this.disposeFbo();
    dispose(this._compositor);
    this._viewport = undefined;

    this._isDisposed = true;
  }

  public pushBranch(branch: Branch): void {
    this.uniforms.branch.pushBranch(branch);
  }
  public pushState(state: BranchState) {
    this.uniforms.branch.pushState(state);
  }
  public popBranch(): void {
    this.uniforms.branch.pop();
  }

  public pushViewClip(): void {
    this.uniforms.branch.pushViewClip();
  }

  public popViewClip(): void {
    this.uniforms.branch.popViewClip();
  }

  /** @internal */
  public isRangeOutsideActiveVolume(range: Range3d): boolean {
    return this.uniforms.branch.clipStack.isRangeClipped(range, this.currentTransform);
  }

  private readonly _scratchRange = new Range3d();

  /** @internal */
  public isGeometryOutsideActiveVolume(geom: CachedGeometry): boolean {
    if (!this.uniforms.branch.clipStack.hasClip || this.uniforms.branch.clipStack.hasOutsideColor)
      return false;

    const range = geom.computeRange(this._scratchRange);
    return this.isRangeOutsideActiveVolume(range);
  }

  public pushBatch(batch: Batch) {
    this.uniforms.batch.setCurrentBatch(batch);
  }
  public popBatch() {
    this.uniforms.batch.setCurrentBatch(undefined);
  }

  public addBatch(batch: Batch) {
    assert(this._batches.indexOf(batch) < 0);
    this._batches.push(batch);
  }

  public onBatchDisposed(batch: Batch) {
    const index = this._batches.indexOf(batch);
    assert(index > -1);
    this._batches.splice(index, 1);
  }

  public get wantAmbientOcclusion(): boolean {
    return this._wantAmbientOcclusion;
  }

  public get wantThematicDisplay(): boolean {
    return this.currentViewFlags.thematicDisplay && this.is3d && undefined !== this.uniforms.thematic.thematicDisplay;
  }

  public get wantThematicSensors(): boolean {
    const thematic = this.plan.thematic;
    return this.wantThematicDisplay && undefined !== thematic && ThematicDisplayMode.InverseDistanceWeightedSensors === thematic.displayMode && thematic.sensorSettings.sensors.length > 0;
  }

  public override updateSolarShadows(context: SceneContext | undefined): void {
    this.compositor.updateSolarShadows(context);
  }

  // ---- Implementation of RenderTarget interface ---- //

  public get renderSystem(): System { return System.instance; }

  public get planFraction() { return this.uniforms.frustum.planFraction; }
  public get planFrustum() { return this.uniforms.frustum.planFrustum; }

  public changeDecorations(decs: Decorations): void {
    this.graphics.decorations = decs;
  }

  public changeScene(scene: Scene) {
    this.graphics.changeScene(scene);

    this.changeTextureDrapes(scene.textureDrapes);
    this.changePlanarClassifiers(scene.planarClassifiers);

    this.changeDrapesOrClassifiers<RenderPlanarClassifier>(this._planarClassifiers, scene.planarClassifiers);
    this._planarClassifiers = scene.planarClassifiers;

    this.activeVolumeClassifierProps = scene.volumeClassifier?.classifier;
    this.activeVolumeClassifierModelId = scene.volumeClassifier?.modelId;
  }

  public override onBeforeRender(viewport: Viewport, setSceneNeedRedraw: (redraw: boolean) => void) {
    this._viewport = viewport;
    IModelFrameLifecycle.onBeforeRender.raiseEvent({
      renderSystem: this.renderSystem,
      viewport,
      setSceneNeedRedraw,
    });
  }

  private changeDrapesOrClassifiers<T extends IDisposable>(oldMap: Map<Id64String, T> | undefined, newMap: Map<Id64String, T> | undefined): void {
    if (undefined === newMap) {
      if (undefined !== oldMap)
        for (const value of oldMap.values())
          value.dispose();

      return;
    }

    if (undefined !== oldMap) {
      for (const entry of oldMap)
        if (newMap.get(entry[0]) !== entry[1])
          entry[1].dispose();
    }
  }
  public changeTextureDrapes(textureDrapes: TextureDrapeMap | undefined) {
    this.changeDrapesOrClassifiers<RenderTextureDrape>(this._textureDrapes, textureDrapes);
    this._textureDrapes = textureDrapes;
  }
  public changePlanarClassifiers(planarClassifiers?: PlanarClassifierMap) {
    this.changeDrapesOrClassifiers<RenderPlanarClassifier>(this._planarClassifiers, planarClassifiers);
    this._planarClassifiers = planarClassifiers;

  }

  public changeDynamics(dynamics?: GraphicList) {
    this.graphics.dynamics = dynamics;
  }
  public override overrideFeatureSymbology(ovr: FeatureSymbology.Overrides): void {
    this.uniforms.branch.overrideFeatureSymbology(ovr);
  }
  public override setHiliteSet(hilite: HiliteSet): void {
    this._hilites = hilite;
    desync(this._hiliteSyncTarget);
  }
  public override setFlashed(id: Id64String, intensity: number) {
    if (id !== this._flashedId) {
      this._flashedId = id;
      this._flashed = Id64.getUint32Pair(id);
    }

    this._flashIntensity = intensity;
  }

  public changeFrustum(newFrustum: Frustum, newFraction: number, is3d: boolean): void {
    this.uniforms.frustum.changeFrustum(newFrustum, newFraction, is3d);
  }

  private readonly _scratchViewFlags = new ViewFlags();
  public changeRenderPlan(plan: RenderPlan): void {
    this.plan = plan;

    if (this._dcAssigned && plan.is3d !== this.is3d) {
      // changed the dimensionality of the Target. World decorations no longer valid.
      // (lighting is enabled or disabled based on 2d vs 3d).
      this._worldDecorations = dispose(this._worldDecorations);

      // Turn off shadows if switching from 3d to 2d
      if (!plan.is3d)
        this.updateSolarShadows(undefined);
    }

    if (plan.is3d !== this.decorationsState.is3d)
      this.decorationsState.changeRenderPlan(this.decorationsState.viewFlags, plan.is3d, undefined);

    if (!this.assignDC())
      return;

    this.isFadeOutActive = plan.isFadeOutActive;
    this.analysisStyle = plan.analysisStyle;
    this.analysisTexture = plan.analysisTexture;

    this.uniforms.branch.updateViewClip(plan.clip, plan.clipStyle);

    const vf = ViewFlags.createFrom(plan.viewFlags, this._scratchViewFlags);
    if (!plan.is3d)
      vf.renderMode = RenderMode.Wireframe;

    if (RenderMode.SmoothShade === vf.renderMode && plan.is3d && undefined !== plan.ao && vf.ambientOcclusion) {
      this._wantAmbientOcclusion = true;
      this.ambientOcclusionSettings = plan.ao;
    } else {
      this._wantAmbientOcclusion = vf.ambientOcclusion = false;
    }

    this.uniforms.branch.changeRenderPlan(vf, plan.is3d, plan.hline);

    this.changeFrustum(plan.frustum, plan.fraction, plan.is3d);

    this.uniforms.thematic.update(this);

    // NB: This must be done after changeFrustum() as some of the uniforms depend on the frustum.
    this.uniforms.updateRenderPlan(plan);
  }

  public drawFrame(sceneMilSecElapsed?: number): void {
    assert(this.renderSystem.frameBufferStack.isEmpty);
    if (!this.assignDC())
      return;

    this.paintScene(sceneMilSecElapsed);
    this.drawOverlayDecorations();
    assert(this.renderSystem.frameBufferStack.isEmpty);
  }

  protected drawOverlayDecorations(): void { }

  /*
   * Invoked via Viewport.changeView() when the owning Viewport is changed to look at a different view.
   * Invoked via dispose() when the target is being destroyed.
   * The primary difference is that in the former case we retain the SceneCompositor.
   */
  public override reset(): void {
    this.graphics.dispose();
    this._worldDecorations = dispose(this._worldDecorations);
    dispose(this.uniforms.thematic);

    this.changePlanarClassifiers(undefined);
    this.changeTextureDrapes(undefined);

    this._renderCommands.clear();

    // Clear FeatureOverrides for this Target.
    // This may not be strictly necessary as the Target may still be viewing some of these batches, but better to clean up and recreate
    // than to leave unused in memory.
    for (const batch of this._batches)
      batch.onTargetDisposed(this);

    this._batches = [];
    this.disposeAnimationBranches();

    freeDrawParams();
    ShaderProgramExecutor.freeParams();
    Primitive.freeParams();
  }

  public get wantInvertBlackBackground(): boolean { return false; }

  public computeEdgeWeight(pass: RenderPass, baseWeight: number): number {
    return this.currentEdgeSettings.getWeight(pass, this.currentViewFlags) ?? baseWeight;
  }
  public computeEdgeLineCode(pass: RenderPass, baseCode: number): number {
    return this.currentEdgeSettings.getLineCode(pass, this.currentViewFlags) ?? baseCode;
  }
  public computeEdgeColor(baseColor: ColorInfo): ColorInfo {
    const color = this.currentEdgeSettings.getColor(this.currentViewFlags);
    return undefined !== color ? ColorInfo.createUniform(color) : baseColor;
  }

  public beginPerfMetricFrame(sceneMilSecElapsed?: number, readPixels = false) {
    if (!readPixels || (this.performanceMetrics && !this.performanceMetrics.gatherCurPerformanceMetrics)) { // only capture readPixel data if in disp-perf-test-app
      if (this.renderSystem.isGLTimerSupported)
        this.renderSystem.glTimer.beginFrame();
      if (this.performanceMetrics)
        this.performanceMetrics.beginFrame(sceneMilSecElapsed);
    }
  }

  public endPerfMetricFrame(readPixels = false) {
    if (!readPixels || (this.performanceMetrics && !this.performanceMetrics.gatherCurPerformanceMetrics)) { // only capture readPixel data if in disp-perf-test-app
      if (this.renderSystem.isGLTimerSupported)
        this.renderSystem.glTimer.endFrame();

      if (undefined === this.performanceMetrics)
        return;

      this.performanceMetrics.endOperation(); // End the 'CPU Total Time' operation
      this.performanceMetrics.completeFrameTimings(this._fbo!);
    }
  }

  public beginPerfMetricRecord(operation: string, readPixels = false): void {
    if (!readPixels || (this.performanceMetrics && !this.performanceMetrics.gatherCurPerformanceMetrics)) { // only capture readPixel data if in disp-perf-test-app
      if (this.renderSystem.isGLTimerSupported)
        this.renderSystem.glTimer.beginOperation(operation);
      if (this.performanceMetrics)
        this.performanceMetrics.beginOperation(operation);
    }
  }

  public endPerfMetricRecord(readPixels = false): void {
    if (!readPixels || (this.performanceMetrics && !this.performanceMetrics.gatherCurPerformanceMetrics)) { // only capture readPixel data if in disp-perf-test-app
      if (this.renderSystem.isGLTimerSupported)
        this.renderSystem.glTimer.endOperation();
      if (this.performanceMetrics)
        this.performanceMetrics.endOperation();
    }
  }

  private _frameStatsCollector = new FrameStatsCollector();

  public get frameStatsCollector(): FrameStatsCollector { return this._frameStatsCollector; }

  public override assignFrameStatsCollector(collector: FrameStatsCollector) { this._frameStatsCollector = collector; }

  private paintScene(sceneMilSecElapsed?: number): void {
    if (!this._dcAssigned)
      return;

    this._frameStatsCollector.beginTime("totalFrameTime");
    this.beginPerfMetricFrame(sceneMilSecElapsed, this.drawForReadPixels);
    this.beginPerfMetricRecord("Begin Paint", this.drawForReadPixels);
    assert(undefined !== this._fbo);
    this._beginPaint(this._fbo);
    this.endPerfMetricRecord(this.drawForReadPixels);

    const gl = this.renderSystem.context;
    const rect = this.viewRect;
    gl.viewport(0, 0, rect.width, rect.height);

    // Set this to true to visualize the output of readPixels()...useful for debugging pick.
    if (this.drawForReadPixels) {
      this.beginReadPixels(Pixel.Selector.Feature);
      this.compositor.drawForReadPixels(this._renderCommands, this.graphics.overlays, this.graphics.decorations?.worldOverlay);
      this.endReadPixels();
    } else {
      // After the Target is first created or any time its dimensions change, SceneCompositor.preDraw() must update
      // the compositor's textures, framebuffers, etc. This *must* occur before any drawing occurs.
      // SceneCompositor.draw() checks this, but solar shadow maps, planar classifiers, and texture drapes try to draw
      // before then. So do it now.
      this.compositor.preDraw();

      this._frameStatsCollector.beginTime("classifiersTime");
      this.beginPerfMetricRecord("Planar Classifiers");
      this.drawPlanarClassifiers();
      this.endPerfMetricRecord();
      this._frameStatsCollector.endTime("classifiersTime");

      this._frameStatsCollector.beginTime("shadowsTime");
      this.beginPerfMetricRecord("Shadow Maps");
      this.drawSolarShadowMap();
      this.endPerfMetricRecord();
      this._frameStatsCollector.endTime("shadowsTime");

      this.beginPerfMetricRecord("Texture Drapes");
      this.drawTextureDrapes();
      this.endPerfMetricRecord();

      this.beginPerfMetricRecord("Init Commands");
      this._renderCommands.initForRender(this.graphics);
      this.endPerfMetricRecord();

      this.compositor.draw(this._renderCommands); // scene compositor gets disposed and then re-initialized... target remains undisposed

      this._frameStatsCollector.beginTime("overlaysTime");
      this.beginPerfMetricRecord("Overlay Draws");

      this.beginPerfMetricRecord("World Overlays");
      this.drawPass(RenderPass.WorldOverlay);
      this.endPerfMetricRecord();

      this.beginPerfMetricRecord("View Overlays");
      this.drawPass(RenderPass.ViewOverlay);
      this.endPerfMetricRecord();

      this.endPerfMetricRecord(); // End "Overlay Draws"
      this._frameStatsCollector.endTime("overlaysTime");
    }

    // Apply screen-space effects. Note we do not reset this._isReadPixelsInProgress until *after* doing so, as screen-space effects only apply
    // during readPixels() if the effect shifts pixels from their original locations.
    this._frameStatsCollector.beginTime("screenspaceEffectsTime");
    this.beginPerfMetricRecord("Screenspace Effects", this.drawForReadPixels);
    this.renderSystem.screenSpaceEffects.apply(this);
    this.endPerfMetricRecord(this.drawForReadPixels);
    this._frameStatsCollector.endTime("screenspaceEffectsTime");

    // Reset the batch IDs in all batches drawn for this call.
    this.uniforms.batch.resetBatchState();

    this.beginPerfMetricRecord("End Paint", this.drawForReadPixels);
    this._endPaint();
    this.endPerfMetricRecord(this.drawForReadPixels);

    this.endPerfMetricFrame(this.drawForReadPixels);
    this._frameStatsCollector.endTime("totalFrameTime");
  }

  private drawPass(pass: RenderPass): void {
    this.renderSystem.applyRenderState(this.getRenderState(pass));
    this.techniques.execute(this, this._renderCommands.getCommands(pass), pass);
  }

  private getRenderState(pass: RenderPass): RenderState {
    // the other passes are handled by SceneCompositor
    assert(RenderPass.ViewOverlay === pass || RenderPass.WorldOverlay === pass);
    return this._overlayRenderState;
  }

  private assignDC(): boolean {
    if (this._dcAssigned)
      return true;

    if (!this._assignDC())
      return false;

    const rect = this.viewRect;
    if (rect.width < 1 || rect.height < 1)
      return false;

    this.uniforms.viewRect.update(rect.width, rect.height);
    this._dcAssigned = true;

    return true;
  }

  public readPixels(rect: ViewRect, selector: Pixel.Selector, receiver: Pixel.Receiver, excludeNonLocatable: boolean): void {
    if (!this.assignDC())
      return;

    // if (this.performanceMetrics && !this.performanceMetrics.gatherCurPerformanceMetrics)
    this.beginPerfMetricFrame(undefined, true);

    rect = this.cssViewRectToDeviceViewRect(rect);

    const gl = this.renderSystem.context;
    const viewRect = this.viewRect;
    gl.viewport(0, 0, viewRect.width, viewRect.height);

    // We can't reuse the previous frame's data for a variety of reasons, chief among them that some types of geometry (surfaces, translucent stuff) don't write
    // to the pick buffers and others we don't want - such as non-pickable decorations - do.
    // Render to an offscreen buffer so that we don't destroy the current color buffer.
    const texture = TextureHandle.createForAttachment(rect.width, rect.height, GL.Texture.Format.Rgba, GL.Texture.DataType.UnsignedByte);
    if (undefined === texture) {
      receiver(undefined);
      return;
    }

    let result: Pixel.Buffer | undefined;
    const fbo = FrameBuffer.create([texture]);
    if (undefined !== fbo) {
      this.renderSystem.frameBufferStack.execute(fbo, true, false, () => {
        this._drawNonLocatable = !excludeNonLocatable;
        result = this.readPixelsFromFbo(rect, selector);
        this._drawNonLocatable = true;
      });

      dispose(fbo);
    }

    dispose(texture);

    receiver(result);

    // Reset the batch IDs in all batches drawn for this call.
    this.uniforms.batch.resetBatchState();
  }

  private beginReadPixels(selector: Pixel.Selector, cullingFrustum?: Frustum): void {
    this.beginPerfMetricRecord("Init Commands", true);

    this._isReadPixelsInProgress = true;
    this._readPixelsSelector = selector;

    // Temporarily turn off lighting to speed things up.
    // ###TODO: Disable textures *unless* they contain transparency. If we turn them off unconditionally then readPixels() will locate fully-transparent pixels, which we don't want.
    const vf = this.currentViewFlags.clone(this._scratchViewFlags);
    vf.transparency = vf.lighting = vf.shadows = vf.acsTriad = vf.grid = vf.monochrome = vf.materials = vf.ambientOcclusion = false;
    if (!this.uniforms.thematic.wantIsoLines)
      vf.thematicDisplay = false;

    vf.noGeometryMap = true;
    const top = this.currentBranch;
    const state = new BranchState({
      viewFlags: vf,
      symbologyOverrides: top.symbologyOverrides,
      is3d: top.is3d,
      edgeSettings: top.edgeSettings,
      transform: Transform.createIdentity(),
      clipVolume: top.clipVolume,
    });

    this.pushState(state);

    // Repopulate the command list, omitting non-pickable decorations and putting transparent stuff into the opaque passes.
    if (cullingFrustum)
      this._renderCommands.setCheckRange(cullingFrustum);

    this._renderCommands.initForReadPixels(this.graphics);
    this._renderCommands.clearCheckRange();
    this.endPerfMetricRecord(true);
  }

  private endReadPixels(preserveBatchState = false): void {
    // Pop the BranchState pushed by beginReadPixels.
    this.uniforms.branch.pop();
    if (!preserveBatchState)
      this.uniforms.batch.resetBatchState();

    this._isReadPixelsInProgress = false;
  }

  private readonly _scratchTmpFrustum = new Frustum();
  private readonly _scratchRectFrustum = new Frustum();
  private readPixelsFromFbo(rect: ViewRect, selector: Pixel.Selector): Pixel.Buffer | undefined {
    // Create a culling frustum based on the input rect. We can't do this if a screen-space effect is going to move pixels around.
    let rectFrust;
    if (!this.renderSystem.screenSpaceEffects.shouldApply(this)) {
      const viewRect = this.viewRect;
      const leftScale = (rect.left - viewRect.left) / (viewRect.right - viewRect.left);
      const rightScale = (viewRect.right - rect.right) / (viewRect.right - viewRect.left);
      const topScale = (rect.top - viewRect.top) / (viewRect.bottom - viewRect.top);
      const bottomScale = (viewRect.bottom - rect.bottom) / (viewRect.bottom - viewRect.top);

      const tmpFrust = this._scratchTmpFrustum;
      const planFrust = this.planFrustum;
      interpolateFrustumPoint(tmpFrust, planFrust, Npc._000, leftScale, Npc._100);
      interpolateFrustumPoint(tmpFrust, planFrust, Npc._100, rightScale, Npc._000);
      interpolateFrustumPoint(tmpFrust, planFrust, Npc._010, leftScale, Npc._110);
      interpolateFrustumPoint(tmpFrust, planFrust, Npc._110, rightScale, Npc._010);
      interpolateFrustumPoint(tmpFrust, planFrust, Npc._001, leftScale, Npc._101);
      interpolateFrustumPoint(tmpFrust, planFrust, Npc._101, rightScale, Npc._001);
      interpolateFrustumPoint(tmpFrust, planFrust, Npc._011, leftScale, Npc._111);
      interpolateFrustumPoint(tmpFrust, planFrust, Npc._111, rightScale, Npc._011);

      rectFrust = this._scratchRectFrustum;
      interpolateFrustumPoint(rectFrust, tmpFrust, Npc._000, bottomScale, Npc._010);
      interpolateFrustumPoint(rectFrust, tmpFrust, Npc._100, bottomScale, Npc._110);
      interpolateFrustumPoint(rectFrust, tmpFrust, Npc._010, topScale, Npc._000);
      interpolateFrustumPoint(rectFrust, tmpFrust, Npc._110, topScale, Npc._100);
      interpolateFrustumPoint(rectFrust, tmpFrust, Npc._001, bottomScale, Npc._011);
      interpolateFrustumPoint(rectFrust, tmpFrust, Npc._101, bottomScale, Npc._111);
      interpolateFrustumPoint(rectFrust, tmpFrust, Npc._011, topScale, Npc._001);
      interpolateFrustumPoint(rectFrust, tmpFrust, Npc._111, topScale, Npc._101);
    }

    this.beginReadPixels(selector, rectFrust);

    // Draw the scene
    this.compositor.drawForReadPixels(this._renderCommands, this.graphics.overlays, this.graphics.decorations?.worldOverlay);

    if (this.performanceMetrics && !this.performanceMetrics.gatherCurPerformanceMetrics) { // Only collect readPixels data if in disp-perf-test-app
      this.performanceMetrics.endOperation(); // End the 'CPU Total Time' operation
      if (this.performanceMetrics.gatherGlFinish && !this.renderSystem.isGLTimerSupported) {
        // Ensure all previously queued webgl commands are finished by reading back one pixel since gl.Finish didn't work
        this.performanceMetrics.beginOperation("Finish GPU Queue");
        const gl = this.renderSystem.context;
        const bytes = new Uint8Array(4);
        this.renderSystem.frameBufferStack.execute(this._fbo!, true, false, () => {
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        });
        this.performanceMetrics.endOperation();
      }
    }

    // Apply any screen-space effects that shift pixels from their original locations.
    this.beginPerfMetricRecord("Screenspace Effects", true);
    this.renderSystem.screenSpaceEffects.apply(this);
    this.endPerfMetricRecord(true); // End "Screenspace Effects"

    this.endReadPixels(true);

    this.beginPerfMetricRecord("Read Pixels", true);
    const result = this.compositor.readPixels(rect, selector);
    this.endPerfMetricRecord(true);

    if (this.performanceMetrics && !this.performanceMetrics.gatherCurPerformanceMetrics) { // Only collect readPixels data if in disp-perf-test-app
      if (this.renderSystem.isGLTimerSupported)
        this.renderSystem.glTimer.endFrame();
      if (this.performanceMetrics)
        this.performanceMetrics.endFrame();
    }

    return result;
  }

  public override queryVisibleTileFeatures(options: QueryTileFeaturesOptions, iModel: IModelConnection, callback: QueryVisibleFeaturesCallback): void {
    this.beginReadPixels(Pixel.Selector.Feature);
    callback(new VisibleTileFeatures(this._renderCommands, options, this, iModel));
    this.endReadPixels();
  }

  protected readImagePixels(out: Uint8Array, x: number, y: number, w: number, h: number): boolean {
    assert(this._fbo !== undefined);
    if (this._fbo === undefined)
      return false;

    const context = this.renderSystem.context;
    let didSucceed = true;
    this.renderSystem.frameBufferStack.execute(this._fbo, true, false, () => {
      try {
        context.readPixels(x, y, w, h, context.RGBA, context.UNSIGNED_BYTE, out);
      } catch (e) {
        didSucceed = false;
      }
    });

    return didSucceed;
  }

  /** Returns a new size scaled up to a maximum size while maintaining proper aspect ratio.  The new size will be
   * curSize adjusted so that it fits fully within maxSize in one dimension, maintaining its original aspect ratio.
   */
  private static _applyAspectRatioCorrection(curSize: Point2d, maxSize: Point2d): Point2d {
    const widthRatio = maxSize.x / curSize.x;
    const heightRatio = maxSize.y / curSize.y;
    const bestRatio = Math.min(widthRatio, heightRatio);
    return new Point2d(curSize.x * bestRatio, curSize.y * bestRatio);
  }

  /** wantRectIn is in CSS pixels. Output ImageBuffer will be in device pixels.
   * If wantRect.right or wantRect.bottom is -1, that means "read the entire image".
   */
  public override readImage(wantRectIn: ViewRect, targetSizeIn: Point2d, flipVertically: boolean): ImageBuffer | undefined {
    if (!this.assignDC())
      return undefined;

    // Determine capture rect and validate
    const actualViewRect = this.renderRect; // already has device pixel ratio applied
    const wantRect = (wantRectIn.right === -1 || wantRectIn.bottom === -1) ? actualViewRect : this.cssViewRectToDeviceViewRect(wantRectIn);
    const lowerRight = Point2d.create(wantRect.right - 1, wantRect.bottom - 1);
    if (!actualViewRect.containsPoint(Point2d.create(wantRect.left, wantRect.top)) || !actualViewRect.containsPoint(lowerRight))
      return undefined;

    // Read pixels. Note ViewRect thinks (0,0) = top-left. gl.readPixels expects (0,0) = bottom-left.
    const bytesPerPixel = 4;
    const imageData = new Uint8Array(bytesPerPixel * wantRect.width * wantRect.height);
    const isValidImageData = this.readImagePixels(imageData, wantRect.left, wantRect.top, wantRect.width, wantRect.height);
    if (!isValidImageData)
      return undefined;

    let image = ImageBuffer.create(imageData, ImageBufferFormat.Rgba, wantRect.width);
    if (!image)
      return undefined;

    const targetSize = targetSizeIn.clone();
    if (targetSize.x === 0 || targetSize.y === 0) { // Indicates image should have same dimensions as rect (no scaling)
      targetSize.x = wantRect.width;
      targetSize.y = wantRect.height;
    }

    if (targetSize.x === wantRect.width && targetSize.y === wantRect.height) {
      // No need to scale image.
      // Some callers want background pixels to be treated as fully-transparent
      // They indicate this by supplying a background color with full transparency
      // Any other pixels are treated as fully-opaque as alpha has already been blended
      // ###TODO: This introduces a defect in that we are not preserving alpha of translucent pixels, and therefore the returned image cannot be blended
      const preserveBGAlpha = 0.0 === this.uniforms.style.backgroundAlpha;

      // Optimization for view attachments: if image consists entirely of background pixels, return an undefined
      let isEmptyImage = true;
      for (let i = 3; i < image.data.length; i += 4) {
        const a = image.data[i];
        if (!preserveBGAlpha || 0 < a) {
          image.data[i] = 0xff;
          isEmptyImage = false;
        }
      }
      if (isEmptyImage)
        return undefined;
    } else {
      const canvas = imageBufferToCanvas(image, false); // retrieve a canvas of the image we read, throwing away alpha channel.
      if (undefined === canvas)
        return undefined;

      const adjustedTargetSize = Target._applyAspectRatioCorrection(new Point2d(wantRect.width, wantRect.height), targetSize);
      const resizedCanvas = canvasToResizedCanvasWithBars(canvas, adjustedTargetSize, new Point2d(targetSize.x - adjustedTargetSize.x, targetSize.y - adjustedTargetSize.y), this.uniforms.style.backgroundHexString);

      const resizedImage = canvasToImageBuffer(resizedCanvas);
      if (undefined !== resizedImage)
        image = resizedImage;
    }

    if (flipVertically) {
      const halfHeight = Math.floor(image.height / 2);
      const numBytesPerRow = image.width * 4;
      for (let loY = 0; loY < halfHeight; loY++) {
        for (let x = 0; x < image.width; x++) {
          const hiY = (image.height - 1) - loY;
          const loIdx = loY * numBytesPerRow + x * 4;
          const hiIdx = hiY * numBytesPerRow + x * 4;

          swapImageByte(image, loIdx, hiIdx);
          swapImageByte(image, loIdx + 1, hiIdx + 1);
          swapImageByte(image, loIdx + 2, hiIdx + 2);
          swapImageByte(image, loIdx + 3, hiIdx + 3);
        }
      }
    }

    return image;
  }

  public copyImageToCanvas(): HTMLCanvasElement {
    const image = this.readImage(new ViewRect(0, 0, -1, -1), Point2d.createZero(), true);
    const canvas = undefined !== image ? imageBufferToCanvas(image, false) : undefined;
    const retCanvas = undefined !== canvas ? canvas : document.createElement("canvas");
    const pixelRatio = this.devicePixelRatio;
    retCanvas.getContext("2d")!.scale(pixelRatio, pixelRatio);
    return retCanvas;
  }

  public drawPlanarClassifiers() {
    if (this._planarClassifiers) {
      this._planarClassifiers.forEach((classifier) => {
        this._currentlyDrawingClassifier = classifier as PlanarClassifier;
        this._currentlyDrawingClassifier.draw(this);
        this._currentlyDrawingClassifier = undefined;
      });
    }
  }
  public drawSolarShadowMap() {
    if (this.solarShadowMap.isEnabled)
      this.solarShadowMap.draw(this);
  }
  public drawTextureDrapes() {
    if (this._textureDrapes)
      this._textureDrapes.forEach((drape) => (drape as TextureDrape).draw(this));
  }

  public get screenSpaceEffects(): Iterable<string> {
    return this._screenSpaceEffects;
  }

  public set screenSpaceEffects(effects: Iterable<string>) {
    this._screenSpaceEffects = [...effects];
  }

  public get screenSpaceEffectContext(): ScreenSpaceEffectContext {
    assert(undefined !== this._viewport);
    return { viewport: this._viewport };
  }

  protected abstract _assignDC(): boolean;
  protected abstract _beginPaint(fbo: FrameBuffer): void;
  protected abstract _endPaint(): void;

  public override collectStatistics(stats: RenderMemory.Statistics): void {
    this._compositor.collectStatistics(stats);
    const thematicBytes = this.uniforms.thematic.bytesUsed;
    if (0 < thematicBytes)
      stats.addThematicTexture(thematicBytes);

    const clipBytes = this.uniforms.branch.clipStack.bytesUsed;
    if (clipBytes)
      stats.addClipVolume(clipBytes);
  }

  protected cssViewRectToDeviceViewRect(rect: ViewRect): ViewRect {
    // NB: ViewRect constructor *floors* inputs.
    const ratio = this.devicePixelRatio;
    return new ViewRect(
      Math.floor(rect.left * ratio),
      Math.floor(rect.top * ratio),
      Math.floor(rect.right * ratio),
      Math.floor(rect.bottom * ratio));
  }
}

class CanvasState {
  public readonly canvas: HTMLCanvasElement;
  private _width = 0;
  private _height = 0;
  public needsClear = false;
  private _isWebGLCanvas: boolean;

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this._isWebGLCanvas = this.canvas === System.instance.canvas;
  }

  // Returns true if the rect actually changed.
  public updateDimensions(pixelRatio: number): boolean {
    const w = Math.floor(this.canvas.clientWidth * pixelRatio);
    const h = Math.floor(this.canvas.clientHeight * pixelRatio);
    if (w === this._width && h === this._height)
      return false;

    // Must ensure internal bitmap grid dimensions of on-screen canvas match its own on-screen appearance.
    this.canvas.width = this._width = w;
    this.canvas.height = this._height = h;

    if (!this._isWebGLCanvas) {
      const ctx = this.canvas.getContext("2d")!;
      ctx.scale(pixelRatio, pixelRatio); // apply the pixelRatio as a scale on the 2d context for drawing of decorations, etc.
      ctx.save();
    }

    return true;
  }

  public get width() { return this._width; }
  public get height() { return this._height; }
}

/** A Target that renders to a canvas on the screen
 * @internal
 */
export class OnScreenTarget extends Target {
  private readonly _2dCanvas: CanvasState;
  private readonly _webglCanvas: CanvasState;
  private _usingWebGLCanvas = false;
  private _blitGeom?: SingleTexturedViewportQuadGeometry;
  private _scratchProgParams?: ShaderProgramParams;
  private _scratchDrawParams?: DrawParams;
  private _devicePixelRatioOverride?: number;

  private get _curCanvas() { return this._usingWebGLCanvas ? this._webglCanvas : this._2dCanvas; }

  public constructor(canvas: HTMLCanvasElement) {
    super();
    this._2dCanvas = new CanvasState(canvas);
    this._webglCanvas = new CanvasState(this.renderSystem.canvas);
  }

  public override get isDisposed(): boolean {
    return undefined === this._blitGeom
      && undefined === this._scratchProgParams
      && undefined === this._scratchDrawParams
      && super.isDisposed;
  }

  public override dispose() {
    this._blitGeom = dispose(this._blitGeom);
    this._scratchProgParams = undefined;
    this._scratchDrawParams = undefined;
    super.dispose();
  }

  public override collectStatistics(stats: RenderMemory.Statistics): void {
    super.collectStatistics(stats);
    if (undefined !== this._blitGeom)
      this._blitGeom.collectStatistics(stats);
  }

  public get devicePixelRatioOverride(): number | undefined { return this._devicePixelRatioOverride; }
  public set devicePixelRatioOverride(ovr: number | undefined) { this._devicePixelRatioOverride = ovr; }
  public override get devicePixelRatio(): number {
    if (undefined !== this.devicePixelRatioOverride)
      return this.devicePixelRatioOverride;

    if (false === this.renderSystem.options.dpiAwareViewports)
      return 1.0;

    if (undefined !== this.renderSystem.options.devicePixelRatioOverride)
      return this.renderSystem.options.devicePixelRatioOverride;

    return window.devicePixelRatio || 1.0;
  }

  public setViewRect(_rect: ViewRect, _temporary: boolean): void {
    assert(false);
  }

  protected _assignDC(): boolean {
    this.disposeFbo();
    const fbo = this.allocateFbo();
    if (!fbo)
      return false;

    const tx = fbo.getColor(0);
    assert(undefined !== tx.getHandle());
    this._blitGeom = SingleTexturedViewportQuadGeometry.createGeometry(tx.getHandle()!, TechniqueId.CopyColorNoAlpha);
    if (undefined === this._blitGeom)
      this.disposeFbo();

    return undefined !== this._blitGeom;
  }

  public updateViewRect(): boolean {
    const pixelRatio = this.devicePixelRatio;
    const changed2d = this._2dCanvas.updateDimensions(pixelRatio);
    const changedWebGL = this._webglCanvas.updateDimensions(pixelRatio);
    this.renderRect.init(0, 0, this._curCanvas.width, this._curCanvas.height);
    return this._usingWebGLCanvas ? changedWebGL : changed2d;
  }

  protected _beginPaint(fbo: FrameBuffer): void {
    // Render to our framebuffer
    const system = this.renderSystem;
    system.frameBufferStack.push(fbo, true, false);

    const viewRect = this.viewRect;

    // Ensure off-screen canvas is sufficiently large for on-screen canvas.
    // Using a portion of a larger canvas lets us avoid thrashing canvas resizes with multiple viewports.
    if (system.canvas.width < viewRect.width)
      system.canvas.width = viewRect.width;
    if (system.canvas.height < viewRect.height)
      system.canvas.height = viewRect.height;
    assert(system.context.drawingBufferWidth >= viewRect.width, "offscreen context dimensions don't match onscreen");
    assert(system.context.drawingBufferHeight >= viewRect.height, "offscreen context dimensions don't match onscreen");
  }

  private getDrawParams(target: OnScreenTarget, geom: SingleTexturedViewportQuadGeometry) {
    if (undefined === this._scratchProgParams) {
      this._scratchProgParams = new ShaderProgramParams();
      this._scratchDrawParams = new DrawParams();
    }

    this._scratchProgParams.init(target);
    this._scratchDrawParams!.init(this._scratchProgParams, geom);
    return this._scratchDrawParams!;
  }

  protected _endPaint(): void {
    if (undefined === this._blitGeom)
      return;

    // Blit the final image to the canvas.
    const drawParams = this.getDrawParams(this, this._blitGeom);

    const system = this.renderSystem;
    system.frameBufferStack.pop();
    system.applyRenderState(RenderState.defaults);
    system.techniques.draw(drawParams);

    if (this._usingWebGLCanvas)
      return; // We already drew (using WebGL) the framebuffer contents directly to the on-screen WebGL canvas.

    // Copy off-screen canvas contents to on-screen canvas
    const onscreenContext = this._2dCanvas.canvas.getContext("2d", { alpha: true });
    assert(null !== onscreenContext);
    if (null !== onscreenContext) {
      const w = this.viewRect.width, h = this.viewRect.height;
      const yOffset = system.canvas.height - h; // drawImage has top as Y=0, GL has bottom as Y=0
      onscreenContext.save();
      onscreenContext.setTransform(1, 0, 0, 1, 0, 0); // revert any previous devicePixelRatio scale for drawImage() call below.
      onscreenContext.drawImage(system.canvas, 0, yOffset, w, h, 0, 0, w, h);
      onscreenContext.restore();
    }
  }

  protected override drawOverlayDecorations(): void {
    const ctx = this._2dCanvas.canvas.getContext("2d", { alpha: true })!;
    if (this._usingWebGLCanvas && this._2dCanvas.needsClear) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // revert any previous devicePixelRatio scale for clearRect() call below.
      ctx.clearRect(0, 0, this._2dCanvas.width, this._2dCanvas.height);
      ctx.restore();
      this._2dCanvas.needsClear = false;
    }

    const canvasDecs = this.graphics.canvasDecorations;
    if (canvasDecs) {
      for (const overlay of canvasDecs) {
        ctx.save();
        if (overlay.position)
          ctx.translate(overlay.position.x, overlay.position.y);

        overlay.drawDecoration(ctx);
        this._2dCanvas.needsClear = true;
        ctx.restore();
      }
    }
  }

  public override pickOverlayDecoration(pt: XAndY): CanvasDecoration | undefined {
    const overlays = this.graphics.canvasDecorations;
    if (undefined === overlays)
      return undefined;

    // loop over array backwards, because later entries are drawn on top.
    for (let i = overlays.length - 1; i >= 0; --i) {
      const overlay = overlays[i];
      if (undefined !== overlay.pick && overlay.pick(pt))
        return overlay;
    }
    return undefined;
  }

  public override onResized(): void {
    this.disposeFbo();
  }

  public override setRenderToScreen(toScreen: boolean): HTMLCanvasElement | undefined {
    if (toScreen === this._usingWebGLCanvas)
      return;

    this._usingWebGLCanvas = toScreen;
    return toScreen ? this._webglCanvas.canvas : undefined;
  }

  public override readImageToCanvas(): HTMLCanvasElement {
    return this._usingWebGLCanvas ? this.copyImageToCanvas() : this._2dCanvas.canvas;
  }
}

/** @internal */
export class OffScreenTarget extends Target {
  public constructor(rect: ViewRect) {
    super(rect);
  }

  public override onResized(): void {
    assert(false); // offscreen viewport's dimensions are set once, in constructor.
  }

  public updateViewRect(): boolean { return false; } // offscreen target does not dynamically resize the view rect

  public setViewRect(rect: ViewRect, temporary: boolean): void {
    if (this.renderRect.equals(rect))
      return;

    this.renderRect.setFrom(rect);
    if (temporary) {
      // Temporarily adjust view rect to create scene for a view attachment.
      // Will be reset before attachment is rendered - so don't blow away our framebuffers + textures
      return;
    }

    this.disposeFbo();
    dispose(this._compositor);
  }

  protected _assignDC(): boolean {
    return undefined !== this.allocateFbo();
  }

  protected _beginPaint(fbo: FrameBuffer): void {
    this.renderSystem.frameBufferStack.push(fbo, true, false);
  }

  protected _endPaint(): void {
    this.renderSystem.frameBufferStack.pop();
  }

  public override readImageToCanvas(): HTMLCanvasElement {
    return this.copyImageToCanvas();
  }
}

function interpolatePoint(p0: Point3d, fraction: number, p1: Point3d, out: Point3d): Point3d {
  let x: number;
  let y: number;
  let z: number;
  if (fraction <= 0.5) {
    x = p0.x + fraction * (p1.x - p0.x);
    y = p0.y + fraction * (p1.y - p0.y);
    z = p0.z + fraction * (p1.z - p0.z);
  } else {
    const t = fraction - 1.0;
    x = p1.x + t * (p1.x - p0.x);
    y = p1.y + t * (p1.y - p0.y);
    z = p1.z + t * (p1.z - p0.z);
  }

  return Point3d.create(x, y, z, out);
}

function interpolateFrustumPoint(destFrust: Frustum, srcFrust: Frustum, destPoint: Npc, scale: number, srcPoint: Npc): void {
  interpolatePoint(srcFrust.getCorner(destPoint), scale, srcFrust.getCorner(srcPoint), destFrust.points[destPoint]);
}
