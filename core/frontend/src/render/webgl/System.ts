/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { assert, BentleyStatus, Dictionary, dispose, Id64, Id64String } from "@bentley/bentleyjs-core";
import { ClipVector, Point3d, Transform } from "@bentley/geometry-core";
import {
  ColorDef, ElementAlignedBox3d, Frustum, Gradient, ImageBuffer, ImageSource, ImageSourceFormat, IModelError, PackedFeatureTable, RenderMaterial, RenderTexture,
} from "@bentley/imodeljs-common";
import { Capabilities, DepthType, WebGLContext } from "@bentley/webgl-compatibility";
import { SkyBox } from "../../DisplayStyleState";
import { imageElementFromImageSource } from "../../ImageUtil";
import { IModelApp } from "../../IModelApp";
import { IModelConnection } from "../../IModelConnection";
import { MapTileTreeReference, TileTreeReference } from "../../tile/internal";
import { ViewRect } from "../../ViewRect";
import { GraphicBranch, GraphicBranchOptions } from "../GraphicBranch";
import { BatchOptions, GraphicBuilder, GraphicBuilderOptions } from "../GraphicBuilder";
import { InstancedGraphicParams } from "../InstancedGraphicParams";
import { PrimitiveBuilder } from "../primitives/geometry/GeometryListBuilder";
import { RealityMeshPrimitive } from "../primitives/mesh/RealityMeshPrimitive";
import { TerrainMeshPrimitive } from "../primitives/mesh/TerrainMeshPrimitive";
import { PointCloudArgs } from "../primitives/PointCloudPrimitive";
import { MeshParams, PointStringParams, PolylineParams } from "../primitives/VertexTable";
import { RenderClipVolume } from "../RenderClipVolume";
import { RenderGraphic, RenderGraphicOwner } from "../RenderGraphic";
import { RenderMemory } from "../RenderMemory";
import {
  DebugShaderFile, GLTimerResultCallback, PlanarGridProps, RenderDiagnostics, RenderSystem, RenderSystemDebugControl, TerrainTexture,
} from "../RenderSystem";
import { RenderTarget } from "../RenderTarget";
import { ScreenSpaceEffectBuilder, ScreenSpaceEffectBuilderParams } from "../ScreenSpaceEffectBuilder";
import { BackgroundMapDrape } from "./BackgroundMapDrape";
import { CachedGeometry, SkyBoxQuadsGeometry, SkySphereViewportQuadGeometry } from "./CachedGeometry";
import { ClipVolume } from "./ClipVolume";
import { Debug } from "./Diagnostics";
import { WebGLDisposable } from "./Disposable";
import { DepthBuffer, FrameBufferStack } from "./FrameBuffer";
import { GL } from "./GL";
import { GLTimer } from "./GLTimer";
import { Batch, Branch, Graphic, GraphicOwner, GraphicsArray } from "./Graphic";
import { Layer, LayerContainer } from "./Layer";
import { LineCode } from "./LineCode";
import { Material } from "./Material";
import { MeshGraphic } from "./Mesh";
import { PointCloudGeometry } from "./PointCloud";
import { PointStringGeometry } from "./PointString";
import { PolylineGeometry } from "./Polyline";
import { Primitive, SkyCubePrimitive, SkySpherePrimitive } from "./Primitive";
import { RenderBuffer, RenderBufferMultiSample } from "./RenderBuffer";
import { TextureUnit } from "./RenderFlags";
import { RenderState } from "./RenderState";
import { createScreenSpaceEffectBuilder, ScreenSpaceEffects } from "./ScreenSpaceEffect";
import { OffScreenTarget, OnScreenTarget } from "./Target";
import { Techniques } from "./Technique";
import { RealityMeshGeometry } from "./RealityMesh";
import { ExternalTextureLoader, Texture, TextureHandle } from "./Texture";
import { UniformHandle } from "./UniformHandle";
import { PlanarGridGeometry } from "./PlanarGrid";

/* eslint-disable no-restricted-syntax */

/** @internal */
export const enum ContextState {
  Uninitialized,
  Success,
  Error,
}

/** Describes WebGL extension methods.
 * @internal
 */
abstract class WebGLExtensions {
  private _system: System;
  public constructor(system: System) {
    this._system = system;
  }
  public get system() { return this._system; }
  public abstract setDrawBuffers(attachments: GLenum[]): void;
  public abstract vertexAttribDivisor(index: number, divisor: number): void;
  public abstract drawArraysInst(type: GL.PrimitiveType, first: number, count: number, numInstances: number): void;
  public abstract invalidateFrameBuffer(_attachments: number[]): void;
}

/** Describes WebGL1 extension methods.
 * @internal
 */
class WebGL1Extensions extends WebGLExtensions {
  private readonly _drawBuffersExtension?: WEBGL_draw_buffers;
  private readonly _instancingExtension?: ANGLE_instanced_arrays;

  public constructor(system: System, drawBuffersExt: WEBGL_draw_buffers | undefined, instancingExt: ANGLE_instanced_arrays | undefined) {
    super(system);
    this._drawBuffersExtension = drawBuffersExt;
    this._instancingExtension = instancingExt;
  }

  public setDrawBuffers(attachments: GLenum[]): void {
    // NB: The WEBGL_draw_buffers member is not exported directly because that type name is not available in some contexts (e.g. test-imodel-service).
    if (undefined !== this._drawBuffersExtension)
      this._drawBuffersExtension.drawBuffersWEBGL(attachments);
  }

  public vertexAttribDivisor(index: number, divisor: number): void {
    assert(undefined !== this._instancingExtension);
    this._instancingExtension.vertexAttribDivisorANGLE(index, divisor);
  }

  public drawArraysInst(type: GL.PrimitiveType, first: number, count: number, numInstances: number): void {
    if (undefined !== this._instancingExtension) {
      this._instancingExtension.drawArraysInstancedANGLE(type, first, count, numInstances);
    }
  }

  public invalidateFrameBuffer(_attachments: number[]): void { } // does not exist in WebGL1
}

/** Describes WebGL2 extension methods.
 * @internal
 */
class WebGL2Extensions extends WebGLExtensions {
  private _context: WebGL2RenderingContext;
  public constructor(system: System) {
    super(system);
    this._context = system.context as WebGL2RenderingContext;
  }

  public setDrawBuffers(attachments: GLenum[]): void {
    this._context.drawBuffers(attachments);
  }

  public vertexAttribDivisor(index: number, divisor: number): void {
    this._context.vertexAttribDivisor(index, divisor);
  }

  public drawArraysInst(type: GL.PrimitiveType, first: number, count: number, numInstances: number): void { this._context.drawArraysInstanced(type, first, count, numInstances); }

  public invalidateFrameBuffer(attachments: number[]): void {
    this._context.invalidateFramebuffer(this._context.FRAMEBUFFER, attachments);
  }
}

/** Id map holds key value pairs for both materials and textures, useful for caching such objects.
 * @internal
 */
export class IdMap implements WebGLDisposable {
  /** Mapping of materials by their key values. */
  public readonly materials = new Map<string, RenderMaterial>();
  /** Mapping of textures by their key values. */
  public readonly textures = new Map<string, RenderTexture>();
  /** Mapping of textures using gradient symbology. */
  public readonly gradients = new Dictionary<Gradient.Symb, RenderTexture>(Gradient.Symb.compareSymb);
  /** Pending promises to create a texture from an ImageSource. This prevents us from decoding the same ImageSource multiple times */
  public readonly texturesFromImageSources = new Map<string, Promise<RenderTexture | undefined>>();

  public get isDisposed(): boolean {
    return 0 === this.textures.size && 0 === this.gradients.size;
  }

  public dispose() {
    const textureArr = Array.from(this.textures.values());
    const gradientArr = this.gradients.extractArrays().values;

    for (const texture of textureArr)
      dispose(texture);

    for (const gradient of gradientArr)
      dispose(gradient);

    this.textures.clear();
    this.gradients.clear();
    this.materials.clear();
  }

  /** Add a material to this IdMap, given that it has a valid key. */
  public addMaterial(material: RenderMaterial) {
    if (material.key)
      this.materials.set(material.key, material);
  }

  /** Add a texture to this IdMap, given that it has a valid key. */
  public addTexture(texture: RenderTexture) {
    if (texture.key)
      this.textures.set(texture.key, texture);
  }

  /** Add a texture to this IdMap using gradient symbology. */
  public addGradient(gradientSymb: Gradient.Symb, texture: RenderTexture) {
    this.gradients.set(gradientSymb, texture);
  }

  /** Find a cached material using its key. If not found, returns undefined. */
  public findMaterial(key: string): RenderMaterial | undefined {
    return this.materials.get(key);
  }

  /** Find a cached gradient using the gradient symbology. If not found, returns undefined. */
  public findGradient(symb: Gradient.Symb): RenderTexture | undefined {
    return this.gradients.get(symb);
  }

  /** Find or create a new material given material parameters. This will cache the material if its key is valid. */
  public getMaterial(params: RenderMaterial.Params): RenderMaterial {
    if (!params.key || !Id64.isValidId64(params.key))   // Only cache persistent materials.
      return new Material(params);

    let material = this.materials.get(params.key);
    if (!material) {
      material = new Material(params);
      this.materials.set(params.key, material);
    }
    return material;
  }

  private createTexture(params: RenderTexture.Params, handle?: TextureHandle): Texture | undefined {
    if (undefined === handle)
      return undefined;

    const texture = new Texture(params, handle);
    this.addTexture(texture);
    return texture;
  }

  /** Attempt to create and return a new texture from an ImageBuffer. This will cache the texture if its key is valid */
  private createTextureFromImageBuffer(img: ImageBuffer, params: RenderTexture.Params): RenderTexture | undefined {
    return this.createTexture(params, TextureHandle.createForImageBuffer(img, params.type));
  }

  private createTextureFromImage(image: HTMLImageElement, hasAlpha: boolean, params: RenderTexture.Params): RenderTexture | undefined {
    return this.createTexture(params, TextureHandle.createForImage(image, hasAlpha, params.type));
  }

  private createTextureFromCubeImages(posX: HTMLImageElement, negX: HTMLImageElement, posY: HTMLImageElement, negY: HTMLImageElement, posZ: HTMLImageElement, negZ: HTMLImageElement, params: RenderTexture.Params) {
    return this.createTexture(params, TextureHandle.createForCubeImages(posX, negX, posY, negY, posZ, negZ));
  }

  private createTextureFromElement(id: Id64String, imodel: IModelConnection, params: RenderTexture.Params, format: ImageSourceFormat): RenderTexture | undefined {
    return this.createTexture(params, TextureHandle.createForElement(id, imodel, params.type, format));
  }

  public findTexture(key?: string): RenderTexture | undefined { return undefined !== key ? this.textures.get(key) : undefined; }

  /** Find or attempt to create a new texture using an ImageBuffer. If a new texture was created, it will be cached provided its key is valid. */
  public getTexture(img: ImageBuffer, params: RenderTexture.Params): RenderTexture | undefined {
    const tex = this.findTexture(params.key);
    return undefined !== tex ? tex : this.createTextureFromImageBuffer(img, params);
  }

  public getTextureFromElement(id: Id64String, imodel: IModelConnection, params: RenderTexture.Params, format: ImageSourceFormat): RenderTexture | undefined {
    const tex = this.findTexture(params.key);
    return undefined !== tex ? tex : this.createTextureFromElement(id, imodel, params, format);
  }

  public getTextureFromImage(image: HTMLImageElement, hasAlpha: boolean, params: RenderTexture.Params): RenderTexture | undefined {
    const tex = this.findTexture(params.key);
    return undefined !== tex ? tex : this.createTextureFromImage(image, hasAlpha, params);
  }

  public async getTextureFromImageSource(source: ImageSource, params: RenderTexture.Params): Promise<RenderTexture | undefined> {
    // Do we already have this texture?
    const texture = this.findTexture(params.key);
    if (texture)
      return Promise.resolve(texture);

    // Are we already in the process of creating this texture?
    let promise = params.key ? this.texturesFromImageSources.get(params.key) : undefined;
    if (promise)
      return promise;

    promise = this.createTextureFromImageSource(source, params);
    if (params.key) {
      // Ensure subsequent requests for this texture that arrive before we finish creating it receive the same promise,
      // instead of redundantly decoding the same image.
      this.texturesFromImageSources.set(params.key, promise);
    }

    return promise;
  }

  public async createTextureFromImageSource(source: ImageSource, params: RenderTexture.Params): Promise<RenderTexture | undefined> {
    try {
      const image = await imageElementFromImageSource(source);
      return IModelApp.hasRenderSystem ? this.getTextureFromImage(image, ImageSourceFormat.Png === source.format, params) : undefined;
    } catch (_) {
      // Caller is uninterested in the details of the exception.
      return undefined;
    } finally {
      if (params.key) {
        // The promise has resolved or rejected - remove from pending set.
        this.texturesFromImageSources.delete(params.key);
      }
    }
  }

  public getTextureFromCubeImages(posX: HTMLImageElement, negX: HTMLImageElement, posY: HTMLImageElement, negY: HTMLImageElement, posZ: HTMLImageElement, negZ: HTMLImageElement, params: RenderTexture.Params): RenderTexture | undefined {
    return this.createTextureFromCubeImages(posX, negX, posY, negY, posZ, negZ, params);
  }

  /** Find or attempt to create a new texture using gradient symbology. If a new texture was created, it will be cached using the gradient. */
  public getGradient(grad: Gradient.Symb): RenderTexture | undefined {
    const existingGrad = this.gradients.get(grad);
    if (existingGrad)
      return existingGrad;

    const image: ImageBuffer = grad.getImage(0x100, 0x100);

    const textureHandle = TextureHandle.createForImageBuffer(image, RenderTexture.Type.Normal);
    if (!textureHandle)
      return undefined;

    const params = new Texture.Params(undefined, Texture.Type.Normal, true); // gradient textures are unnamed, but owned by this IdMap.
    const texture = new Texture(params, textureHandle);
    this.addGradient(grad, texture);
    return texture;
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    for (const texture of this.textures.values())
      if (texture instanceof Texture)
        stats.addTexture(texture.bytesUsed);

    for (const gradient of this.gradients)
      if (gradient instanceof Texture)
        stats.addTexture(gradient.bytesUsed);
  }
}

export type TextureBinding = WebGLTexture | undefined;

const enum VertexAttribState {
  Disabled = 0,
  Enabled = 1 << 0,
  Instanced = 1 << 2,
  InstancedEnabled = Instanced | Enabled,
}

function createPrimitive(createGeom: (viOrigin: Point3d | undefined) => CachedGeometry | undefined, instancesOrVIOrigin: InstancedGraphicParams | Point3d | undefined): RenderGraphic | undefined {
  const viOrigin = instancesOrVIOrigin instanceof Point3d ? instancesOrVIOrigin : undefined;
  const instances = undefined === viOrigin ? instancesOrVIOrigin as InstancedGraphicParams : undefined;
  return Primitive.create(() => createGeom(viOrigin), instances);
}

/** @internal */
export class System extends RenderSystem implements RenderSystemDebugControl, RenderMemory.Consumer, WebGLDisposable {
  public readonly canvas: HTMLCanvasElement;
  public readonly currentRenderState = new RenderState();
  public readonly context: WebGLContext;
  public readonly frameBufferStack = new FrameBufferStack();  // frame buffers are not owned by the system
  public readonly capabilities: Capabilities;
  public readonly resourceCache: Map<IModelConnection, IdMap>;
  public readonly glTimer: GLTimer;
  private readonly _extensions: WebGLExtensions;
  private readonly _textureBindings: TextureBinding[] = [];
  private _removeEventListener?: () => void;

  // NB: Increase the size of these arrays when the maximum number of attributes used by any one shader increases.
  private readonly _curVertexAttribStates: VertexAttribState[] = [
    VertexAttribState.Disabled, VertexAttribState.Disabled, VertexAttribState.Disabled, VertexAttribState.Disabled,
    VertexAttribState.Disabled, VertexAttribState.Disabled, VertexAttribState.Disabled, VertexAttribState.Disabled,
    VertexAttribState.Disabled, VertexAttribState.Disabled, VertexAttribState.Disabled, VertexAttribState.Disabled,
  ];
  private readonly _nextVertexAttribStates: VertexAttribState[] = [
    VertexAttribState.Disabled, VertexAttribState.Disabled, VertexAttribState.Disabled, VertexAttribState.Disabled,
    VertexAttribState.Disabled, VertexAttribState.Disabled, VertexAttribState.Disabled, VertexAttribState.Disabled,
    VertexAttribState.Disabled, VertexAttribState.Disabled, VertexAttribState.Disabled, VertexAttribState.Disabled,
  ];

  // The following are initialized immediately after the System is constructed.
  private _lineCodeTexture?: TextureHandle;
  private _noiseTexture?: TextureHandle;
  private _techniques?: Techniques;
  private _screenSpaceEffects?: ScreenSpaceEffects;
  public readonly debugShaderFiles: DebugShaderFile[] = [];

  public static get instance() { return IModelApp.renderSystem as System; }

  public get isValid(): boolean { return this.canvas !== undefined; }
  public get lineCodeTexture() { return this._lineCodeTexture; }
  public get noiseTexture() { return this._noiseTexture; }

  public get techniques() {
    assert(undefined !== this._techniques);
    return this._techniques;
  }

  public get screenSpaceEffects() {
    assert(undefined !== this._screenSpaceEffects);
    return this._screenSpaceEffects;
  }

  public override get maxTextureSize(): number { return this.capabilities.maxTextureSize; }
  public override get supportsInstancing(): boolean { return this.capabilities.supportsInstancing; }
  public override get supportsNonuniformScaledInstancing(): boolean { return this.capabilities.isWebGL2; }
  public get isWebGL2(): boolean { return this.capabilities.isWebGL2; }
  public override get isMobile(): boolean { return this.capabilities.isMobile; }

  public setDrawBuffers(attachments: GLenum[]): void { this._extensions.setDrawBuffers(attachments); }

  public doIdleWork(): boolean {
    return this.techniques.idleCompileNextShader();
  }

  /** Return a Promise which when resolved indicates that all pending external textures have finished loading from the backend. */
  public override async waitForAllExternalTextures(): Promise<void> {
    const extTexLoader = ExternalTextureLoader.instance;
    if (extTexLoader.numActiveRequests < 1 && extTexLoader.numPendingRequests < 1)
      return Promise.resolve();
    const promise = new Promise<void>((resolve: any) => {
      extTexLoader.onTexturesLoaded.addOnce(() => {
        resolve();
      });
    });
    return promise;
  }

  /** Attempt to create a WebGLRenderingContext, returning undefined if unsuccessful. */
  public static createContext(canvas: HTMLCanvasElement, useWebGL2: boolean, inputContextAttributes?: WebGLContextAttributes): WebGLContext | undefined {
    let contextAttributes: WebGLContextAttributes = { powerPreference: "high-performance" };
    if (undefined !== inputContextAttributes) {
      // NOTE: Order matters with spread operator - if caller wants to override powerPreference, he should be able to.
      contextAttributes = { ...contextAttributes, ...inputContextAttributes };
    }

    // If requested, first try obtaining a WebGL2 context.
    let context = null;
    if (useWebGL2)
      context = canvas.getContext("webgl2", contextAttributes);

    // Fall back to WebGL1 if necessary.
    if (null === context)
      context = canvas.getContext("webgl", contextAttributes);

    return context ?? undefined;
  }

  public static create(optionsIn?: RenderSystem.Options): System {
    const options: RenderSystem.Options = undefined !== optionsIn ? optionsIn : {};
    const canvas = document.createElement("canvas");
    if (null === canvas)
      throw new IModelError(BentleyStatus.ERROR, "Failed to obtain HTMLCanvasElement");

    const useWebGL2 = (undefined === options.useWebGL2 ? true : options.useWebGL2);
    const context = this.createContext(canvas, useWebGL2, optionsIn?.contextAttributes);
    if (undefined === context) {
      throw new IModelError(BentleyStatus.ERROR, "Failed to obtain WebGL context");
    }

    const capabilities = Capabilities.create(context, options.disabledExtensions);
    if (undefined === capabilities)
      throw new IModelError(BentleyStatus.ERROR, "Failed to initialize rendering capabilities");

    // set actual gl state to match desired state defaults
    context.depthFunc(GL.DepthFunc.Default);  // LessOrEqual

    if (!capabilities.supportsShadowMaps)
      options.displaySolarShadows = false;
    if (!capabilities.supportsFragDepth)
      options.logarithmicDepthBuffer = false;
    if (!capabilities.supportsTextureFilterAnisotropic) {
      options.filterMapTextures = false;
      options.filterMapDrapeTextures = false;
    }
    return new this(canvas, context, capabilities, options);
  }

  public get isDisposed(): boolean {
    return undefined === this._techniques
      && undefined === this._lineCodeTexture
      && undefined === this._noiseTexture
      && undefined === this._screenSpaceEffects;
  }

  // Note: FrameBuffers inside of the FrameBufferStack are not owned by the System, and are only used as a central storage device
  public dispose() {
    this._techniques = dispose(this._techniques);
    this._screenSpaceEffects = dispose(this._screenSpaceEffects);
    this._lineCodeTexture = dispose(this._lineCodeTexture);
    this._noiseTexture = dispose(this._noiseTexture);

    // We must attempt to dispose of each idmap in the resourceCache (if idmap is already disposed, has no effect)
    this.resourceCache.forEach((idMap: IdMap) => {
      dispose(idMap);
    });

    this.resourceCache.clear();
    if (undefined !== this._removeEventListener) {
      this._removeEventListener();
      this._removeEventListener = undefined;
    }
  }

  public override onInitialized(): void {
    this._techniques = Techniques.create(this.context);

    const noiseDim = 4;
    const noiseArr = new Uint8Array([152, 235, 94, 173, 219, 215, 115, 176, 73, 205, 43, 201, 10, 81, 205, 198]);
    this._noiseTexture = TextureHandle.createForData(noiseDim, noiseDim, noiseArr, false, GL.Texture.WrapMode.Repeat, GL.Texture.Format.Luminance);
    assert(undefined !== this._noiseTexture, "System.noiseTexture not created.");

    this._lineCodeTexture = TextureHandle.createForData(LineCode.size, LineCode.count, new Uint8Array(LineCode.lineCodeData), false, GL.Texture.WrapMode.Repeat, GL.Texture.Format.Luminance);
    assert(undefined !== this._lineCodeTexture, "System.lineCodeTexture not created.");

    this._screenSpaceEffects = new ScreenSpaceEffects();
  }

  public createTarget(canvas: HTMLCanvasElement): RenderTarget {
    return new OnScreenTarget(canvas);
  }

  public createOffscreenTarget(rect: ViewRect): RenderTarget {
    return new OffScreenTarget(rect);
  }

  public createGraphic(options: GraphicBuilderOptions): GraphicBuilder {
    return new PrimitiveBuilder(this, options);
  }

  public override createMesh(params: MeshParams, instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined {
    return MeshGraphic.create(params, instances);
  }

  public override createPlanarGrid(frustum: Frustum, grid: PlanarGridProps): RenderGraphic | undefined {
    return PlanarGridGeometry.create(frustum, grid, this);
  }

  public override createRealityMeshFromTerrain(terrainMesh: TerrainMeshPrimitive, transform?: Transform): RealityMeshGeometry | undefined {
    return RealityMeshGeometry.createFromTerrainMesh(terrainMesh, transform);
  }

  public override createRealityMeshGraphic(terrainGeometry: RealityMeshGeometry, featureTable: PackedFeatureTable, tileId: string | undefined, baseColor: ColorDef | undefined, baseTransparent: boolean, textures?: TerrainTexture[]): RenderGraphic | undefined {
    return RealityMeshGeometry.createGraphic(this, terrainGeometry, featureTable, tileId, baseColor, baseTransparent, textures);
  }
  public override createRealityMesh(realityMesh: RealityMeshPrimitive): RenderGraphic | undefined {
    const geom = RealityMeshGeometry.createFromRealityMesh(realityMesh);
    return geom ? Primitive.create(() => geom) : undefined;
  }

  public override createPolyline(params: PolylineParams, instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined {
    return createPrimitive((viOrigin) => PolylineGeometry.create(params, viOrigin), instances);
  }

  public override createPointString(params: PointStringParams, instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined {
    return createPrimitive((viOrigin) => PointStringGeometry.create(params, viOrigin), instances);
  }

  public override createPointCloud(args: PointCloudArgs): RenderGraphic | undefined {
    return Primitive.create(() => new PointCloudGeometry(args));
  }

  public createGraphicList(primitives: RenderGraphic[]): RenderGraphic {
    return new GraphicsArray(primitives);
  }

  public createGraphicBranch(branch: GraphicBranch, transform: Transform, options?: GraphicBranchOptions): RenderGraphic {
    return new Branch(branch, transform, undefined, options);
  }

  public createBatch(graphic: RenderGraphic, features: PackedFeatureTable, range: ElementAlignedBox3d, options?: BatchOptions): RenderGraphic {
    return new Batch(graphic, features, range, options);
  }

  public override createGraphicOwner(owned: RenderGraphic): RenderGraphicOwner {
    return new GraphicOwner(owned as Graphic);
  }

  public override createGraphicLayer(graphic: RenderGraphic, layerId: string) {
    return new Layer(graphic as Graphic, layerId);
  }

  public override createGraphicLayerContainer(graphic: RenderGraphic, drawAsOverlay: boolean, transparency: number, elevation: number) {
    return new LayerContainer(graphic as Graphic, drawAsOverlay, transparency, elevation);
  }

  public override createSkyBox(params: SkyBox.CreateParams): RenderGraphic | undefined {
    if (undefined !== params.cube) {
      return SkyCubePrimitive.create(() => SkyBoxQuadsGeometry.create(params.cube!));
    } else {
      assert(undefined !== params.sphere || undefined !== params.gradient);
      return SkySpherePrimitive.create(() => SkySphereViewportQuadGeometry.createGeometry(params));
    }
  }

  public override createScreenSpaceEffectBuilder(params: ScreenSpaceEffectBuilderParams): ScreenSpaceEffectBuilder {
    return createScreenSpaceEffectBuilder(params);
  }

  public applyRenderState(newState: RenderState) {
    newState.apply(this.currentRenderState);
    this.currentRenderState.copyFrom(newState);
  }

  public createDepthBuffer(width: number, height: number, numSamples: number = 1): DepthBuffer | undefined {
    // Note: The buffer/texture created here have ownership passed to the caller (system will not dispose of these)
    switch (this.capabilities.maxDepthType) {
      case DepthType.RenderBufferUnsignedShort16: {
        return RenderBuffer.create(width, height);
      }
      case DepthType.TextureUnsignedInt32: {
        return TextureHandle.createForAttachment(width, height, GL.Texture.Format.DepthComponent, GL.Texture.DataType.UnsignedInt);
      }
      case DepthType.TextureUnsignedInt24Stencil8: {
        if (this.capabilities.isWebGL2) {
          if (numSamples > 1) {
            return RenderBufferMultiSample.create(width, height, WebGL2RenderingContext.DEPTH24_STENCIL8, numSamples);
          } else {
            const context2 = this.context as WebGL2RenderingContext;
            return TextureHandle.createForAttachment(width, height, GL.Texture.Format.DepthStencil, context2.UNSIGNED_INT_24_8);
          }
        } else {
          const dtExt: WEBGL_depth_texture | undefined = this.capabilities.queryExtensionObject<WEBGL_depth_texture>("WEBGL_depth_texture");
          return TextureHandle.createForAttachment(width, height, GL.Texture.Format.DepthStencil, dtExt!.UNSIGNED_INT_24_8_WEBGL);
        }
      }
      default: {
        assert(false);
        return undefined;
      }
    }
  }

  /** Returns the corresponding IdMap for an IModelConnection. Creates a new one if it doesn't exist. */
  public createIModelMap(imodel: IModelConnection): IdMap {
    let idMap = this.resourceCache.get(imodel);
    if (!idMap) {
      idMap = new IdMap();
      this.resourceCache.set(imodel, idMap);
    }
    return idMap;
  }

  /** Removes an IModelConnection-IdMap pairing from the system's resource cache. */
  private removeIModelMap(imodel: IModelConnection) {
    const idMap = this.resourceCache.get(imodel);
    if (idMap === undefined)
      return;
    dispose(idMap);
    this.resourceCache.delete(imodel);
  }

  /** Attempt to create a material for the given iModel using a set of material parameters. */
  public override createMaterial(params: RenderMaterial.Params, imodel: IModelConnection): RenderMaterial | undefined {
    const idMap = this.getIdMap(imodel);
    const material = idMap.getMaterial(params);
    return material;
  }

  /** Using its key, search for an existing material of an open iModel. */
  public override findMaterial(key: string, imodel: IModelConnection): RenderMaterial | undefined {
    const idMap = this.resourceCache.get(imodel);
    if (!idMap)
      return undefined;
    return idMap.findMaterial(key);
  }

  /** Attempt to create a texture for the given iModel using an ImageBuffer. */
  public override createTextureFromImageBuffer(image: ImageBuffer, imodel: IModelConnection, params: RenderTexture.Params): RenderTexture | undefined {
    return this.getIdMap(imodel).getTexture(image, params);
  }

  public override async createTextureFromImageSource(source: ImageSource, imodel: IModelConnection | undefined, params: RenderTexture.Params): Promise<RenderTexture | undefined> {
    if (!imodel)
      return super.createTextureFromImageSource(source, imodel, params);

    return this.getIdMap(imodel).getTextureFromImageSource(source, params);
  }

  /** Attempt to create a texture for the given iModel using an HTML image element. */
  public override createTextureFromImage(image: HTMLImageElement, hasAlpha: boolean, imodel: IModelConnection | undefined, params: RenderTexture.Params): RenderTexture | undefined {
    // if imodel is undefined, caller is responsible for disposing texture. It will not be associated with an IModelConnection
    if (undefined === imodel) {
      const textureHandle = TextureHandle.createForImage(image, hasAlpha, params.type);
      return undefined !== textureHandle ? new Texture(params, textureHandle) : undefined;
    }

    return this.getIdMap(imodel).getTextureFromImage(image, hasAlpha, params);
  }

  public override createTextureFromElement(id: Id64String, imodel: IModelConnection, params: RenderTexture.Params, format: ImageSourceFormat): RenderTexture | undefined {
    return this.getIdMap(imodel).getTextureFromElement(id, imodel, params, format);
  }

  /** Attempt to create a texture from a cube of HTML images. */
  public override createTextureFromCubeImages(posX: HTMLImageElement, negX: HTMLImageElement, posY: HTMLImageElement, negY: HTMLImageElement, posZ: HTMLImageElement, negZ: HTMLImageElement, imodel: IModelConnection, params: RenderTexture.Params): RenderTexture | undefined {
    return this.getIdMap(imodel).getTextureFromCubeImages(posX, negX, posY, negY, posZ, negZ, params);
  }

  /** Attempt to create a texture using gradient symbology. */
  public override getGradientTexture(symb: Gradient.Symb, imodel: IModelConnection): RenderTexture | undefined {
    const idMap = this.getIdMap(imodel);
    const texture = idMap.getGradient(symb);
    return texture;
  }

  /** Using its key, search for an existing texture of an open iModel. */
  public override findTexture(key: string, imodel: IModelConnection): RenderTexture | undefined {
    const idMap = this.resourceCache.get(imodel);
    if (!idMap)
      return undefined;
    return idMap.findTexture(key);
  }

  public override createClipVolume(clipVector: ClipVector): RenderClipVolume | undefined {
    return ClipVolume.create(clipVector);
  }
  public override createBackgroundMapDrape(drapedTree: TileTreeReference, mapTree: MapTileTreeReference) {
    return BackgroundMapDrape.create(drapedTree, mapTree);
  }

  protected constructor(canvas: HTMLCanvasElement, context: WebGLContext, capabilities: Capabilities, options: RenderSystem.Options) {
    super(options);
    this.canvas = canvas;
    this.context = context;
    this.capabilities = capabilities;
    this.resourceCache = new Map<IModelConnection, IdMap>();
    this.glTimer = GLTimer.create(this);
    if (capabilities.isWebGL2)
      this._extensions = new WebGL2Extensions(this);
    else {
      const drawBuffersExtension = capabilities.queryExtensionObject<WEBGL_draw_buffers>("WEBGL_draw_buffers");
      const instancingExtension = capabilities.queryExtensionObject<ANGLE_instanced_arrays>("ANGLE_instanced_arrays");
      this._extensions = new WebGL1Extensions(this, drawBuffersExtension, instancingExtension);
    }

    // Make this System a subscriber to the the IModelConnection onClose event
    this._removeEventListener = IModelConnection.onClose.addListener((imodel) => this.removeIModelMap(imodel));

    canvas.addEventListener("webglcontextlost", async () => RenderSystem.contextLossHandler(), false);
  }

  /** Exposed strictly for tests. */
  public getIdMap(imodel: IModelConnection): IdMap {
    const map = this.resourceCache.get(imodel);
    return undefined !== map ? map : this.createIModelMap(imodel);
  }

  private bindTexture(unit: TextureUnit, target: GL.Texture.Target, texture: TextureBinding, makeActive: boolean): void {
    const index = unit - TextureUnit.Zero;
    if (this._textureBindings[index] === texture) {
      if (makeActive)
        this.context.activeTexture(unit);

      return;
    }

    this._textureBindings[index] = texture;
    this.context.activeTexture(unit);
    this.context.bindTexture(target, undefined !== texture ? texture : null);
  }

  /** Bind the specified texture to the specified unit. This may *or may not* make the texture *active* */
  public bindTexture2d(unit: TextureUnit, texture: TextureBinding) { this.bindTexture(unit, GL.Texture.Target.TwoDee, texture, false); }
  /** Bind the specified texture to the specified unit. This may *or may not* make the texture *active* */
  public bindTextureCubeMap(unit: TextureUnit, texture: TextureBinding) { this.bindTexture(unit, GL.Texture.Target.CubeMap, texture, false); }
  /** Bind the specified texture to the specified unit. This *always* makes the texture *active* */
  public activateTexture2d(unit: TextureUnit, texture: TextureBinding) { this.bindTexture(unit, GL.Texture.Target.TwoDee, texture, true); }
  /** Bind the specified texture to the specified unit. This *always* makes the texture *active* */
  public activateTextureCubeMap(unit: TextureUnit, texture: TextureBinding) { this.bindTexture(unit, GL.Texture.Target.CubeMap, texture, true); }

  // Ensure *something* is bound to suppress 'no texture assigned to unit x' warnings.
  public ensureSamplerBound(uniform: UniformHandle, unit: TextureUnit): void {
    this.lineCodeTexture!.bindSampler(uniform, unit);
  }
  public override get maxRealityImageryLayers() { return Math.min(this.capabilities.maxFragTextureUnits, this.capabilities.maxVertTextureUnits) < 16 ? 3 : 6; }

  public disposeTexture(texture: WebGLTexture) {
    System.instance.context.deleteTexture(texture);
    for (let i = 0; i < this._textureBindings.length; i++) {
      if (this._textureBindings[i] === texture) {
        this._textureBindings[i] = undefined;
        break;
      }
    }
  }

  // System keeps track of current enabled state of vertex attribute arrays.
  // This prevents errors caused by leaving a vertex attrib array enabled after disposing of the buffer bound to it;
  // also prevents unnecessarily 'updating' the enabled state of a vertex attrib array when it hasn't actually changed.
  public enableVertexAttribArray(id: number, instanced: boolean): void {
    assert(id < this._nextVertexAttribStates.length, "if you add new vertex attributes you must update array length");
    assert(id < this._curVertexAttribStates.length, "if you add new vertex attributes you must update array length");

    this._nextVertexAttribStates[id] = instanced ? VertexAttribState.InstancedEnabled : VertexAttribState.Enabled;
  }

  public updateVertexAttribArrays(): void {
    const cur = this._curVertexAttribStates;
    const next = this._nextVertexAttribStates;
    const context = this.context;

    for (let i = 0; i < next.length; i++) {
      const oldState = cur[i];
      const newState = next[i];
      if (oldState !== newState) {
        // Update the enabled state if it changed.
        const wasEnabled = 0 !== (VertexAttribState.Enabled & oldState);
        const nowEnabled = 0 !== (VertexAttribState.Enabled & newState);
        if (wasEnabled !== nowEnabled) {
          if (nowEnabled) {
            context.enableVertexAttribArray(i);
          } else {
            context.disableVertexAttribArray(i);
          }
        }

        // Only update the divisor if the attribute is enabled.
        if (nowEnabled) {
          const wasInstanced = 0 !== (VertexAttribState.Instanced & oldState);
          const nowInstanced = 0 !== (VertexAttribState.Instanced & newState);
          if (wasInstanced !== nowInstanced) {
            this.vertexAttribDivisor(i, nowInstanced ? 1 : 0);
          }
        }

        cur[i] = newState;
      }

      // Set the attribute back to disabled, but preserve the divisor.
      next[i] &= ~VertexAttribState.Enabled;
    }
  }

  public vertexAttribDivisor(index: number, divisor: number) { this._extensions.vertexAttribDivisor(index, divisor); }

  public drawArrays(type: GL.PrimitiveType, first: number, count: number, numInstances: number): void {
    if (0 !== numInstances) {
      this._extensions.drawArraysInst(type, first, count, numInstances);
    } else {
      this.context.drawArrays(type, first, count);
    }
  }

  public invalidateFrameBuffer(attachments: number[]): void { this._extensions.invalidateFrameBuffer(attachments); }

  public override enableDiagnostics(enable: RenderDiagnostics): void {
    Debug.printEnabled = RenderDiagnostics.None !== (enable & RenderDiagnostics.DebugOutput);
    Debug.evaluateEnabled = RenderDiagnostics.None !== (enable & RenderDiagnostics.WebGL);
  }

  // RenderSystemDebugControl
  public override get debugControl(): RenderSystemDebugControl { return this; }
  private _drawSurfacesAsWiremesh = false;
  public get drawSurfacesAsWiremesh() { return this._drawSurfacesAsWiremesh; }
  public set drawSurfacesAsWiremesh(asWiremesh: boolean) { this._drawSurfacesAsWiremesh = asWiremesh; }

  private _dpiAwareLOD?: boolean;
  public override get dpiAwareLOD(): boolean { return this._dpiAwareLOD ?? super.dpiAwareLOD; }
  public override set dpiAwareLOD(dpiAware: boolean) { this._dpiAwareLOD = dpiAware; }

  public loseContext(): boolean {
    const ext = this.capabilities.queryExtensionObject<WEBGL_lose_context>("WEBGL_lose_context");
    if (undefined === ext)
      return false;

    ext.loseContext();
    return true;
  }

  public compileAllShaders(): boolean {
    return this.techniques.compileShaders();
  }

  public get isGLTimerSupported(): boolean { return this.glTimer.isSupported; }
  public set resultsCallback(callback: GLTimerResultCallback | undefined) {
    this.glTimer.resultsCallback = callback;
  }

  public override collectStatistics(stats: RenderMemory.Statistics): void {
    if (undefined !== this._lineCodeTexture)
      stats.addTexture(this._lineCodeTexture.bytesUsed);

    if (undefined !== this._noiseTexture)
      stats.addTexture(this._noiseTexture.bytesUsed);

    for (const idMap of this.resourceCache.values())
      idMap.collectStatistics(stats);
  }

  public setMaxAnisotropy(max: number | undefined): void {
    this.capabilities.setMaxAnisotropy(max, this.context);
  }
}
