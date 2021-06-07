/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { base64StringToUint8Array, Id64String, IDisposable } from "@bentley/bentleyjs-core";
import { ClipVector, Matrix3d, Point2d, Point3d, Range2d, Range3d, Transform, Vector2d, XAndY } from "@bentley/geometry-core";
import { ColorDef, ElementAlignedBox3d, FeatureIndexType, Frustum, Gradient, ImageBuffer, ImageSource, ImageSourceFormat, isValidImageSourceFormat, PackedFeatureTable, QParams3d, QPoint3dList, RenderMaterial, RenderTexture, TextureProps } from "@bentley/imodeljs-common";
import { WebGLExtensionName } from "@bentley/webgl-compatibility";
import { SkyBox } from "../DisplayStyleState";
import { imageElementFromImageSource } from "../ImageUtil";
import { IModelApp } from "../IModelApp";
import { IModelConnection } from "../IModelConnection";
import { MapTileTreeReference, TileTreeReference } from "../tile/internal";
import { ToolAdmin } from "../tools/ToolAdmin";
import { SceneContext } from "../ViewContext";
import { Viewport } from "../Viewport";
import { ViewRect } from "../ViewRect";
import { GraphicBranch, GraphicBranchOptions } from "./GraphicBranch";
import { BatchOptions, GraphicBuilder, GraphicBuilderOptions, GraphicType } from "./GraphicBuilder";
import { InstancedGraphicParams } from "./InstancedGraphicParams";
import { MeshArgs, PolylineArgs } from "./primitives/mesh/MeshPrimitives";
import { RealityMeshPrimitive } from "./primitives/mesh/RealityMeshPrimitive";
import { TerrainMeshPrimitive } from "./primitives/mesh/TerrainMeshPrimitive";
import { PointCloudArgs } from "./primitives/PointCloudPrimitive";
import { MeshParams, PointStringParams, PolylineParams } from "./primitives/VertexTable";
import { RenderClipVolume } from "./RenderClipVolume";
import { RenderGraphic, RenderGraphicOwner } from "./RenderGraphic";
import { RenderMemory } from "./RenderMemory";
import { RenderTarget } from "./RenderTarget";
import { ScreenSpaceEffectBuilder, ScreenSpaceEffectBuilderParams } from "./ScreenSpaceEffectBuilder";

/* eslint-disable no-restricted-syntax */
// cSpell:ignore deserializing subcat uninstanced wiremesh qorigin trimesh

/** An opaque representation of a texture draped on geometry within a [[Viewport]].
 * @internal
 */
export abstract class RenderTextureDrape implements IDisposable {
  public abstract dispose(): void;

  /** @internal */
  public abstract collectStatistics(stats: RenderMemory.Statistics): void;
  public abstract collectGraphics(context: SceneContext): void;
}

/** @internal */
export type TextureDrapeMap = Map<Id64String, RenderTextureDrape>;

/** Describes a texture loaded from an HTMLImageElement
 * @internal
 */
export interface TextureImage {
  /** The HTMLImageElement containing the texture's image data */
  image: HTMLImageElement | undefined;
  /** The format of the texture's image data */
  format: ImageSourceFormat | undefined;
}

/** @internal */
export enum RenderDiagnostics {
  /** No diagnostics enabled. */
  None = 0,
  /** Debugging output to browser console enabled. */
  DebugOutput = 1 << 1,
  /** Potentially expensive checks of WebGL state enabled. */
  WebGL = 1 << 2,
  /** All diagnostics enabled. */
  All = DebugOutput | WebGL,
}

/** @internal */
export interface GLTimerResult {
  /** Label from GLTimer.beginOperation */
  label: string;
  /** Time elapsed in nanoseconds, inclusive of child result times.
   *  @note no-op queries seem to have 32ns of noise.
   */
  nanoseconds: number;
  /** Child results if GLTimer.beginOperation calls were nested */
  children?: GLTimerResult[];
}

/** @internal */
export type GLTimerResultCallback = (result: GLTimerResult) => void;

/** Default implementation of RenderGraphicOwner. */
class GraphicOwner extends RenderGraphicOwner {
  public constructor(private readonly _graphic: RenderGraphic) { super(); }
  public get graphic(): RenderGraphic { return this._graphic; }
}

/** An interface optionally exposed by a RenderSystem that allows control of various debugging features.
 * @beta
 */
export interface RenderSystemDebugControl {
  /** Destroy this system's webgl context. Returns false if this behavior is not supported. */
  loseContext(): boolean;

  /** Draw surfaces as "pseudo-wiremesh", using GL_LINES instead of GL_TRIANGLES. Useful for visualizing faces of a mesh. Not suitable for real wiremesh display. */
  drawSurfacesAsWiremesh: boolean;

  /** Overrides [[RenderSystem.dpiAwareLOD]].
   * @internal
   */
  dpiAwareLOD: boolean;

  /** Record GPU profiling information for each frame drawn. Check isGLTimerSupported before using.
   * @internal
   */
  resultsCallback?: GLTimerResultCallback;

  /** Returns true if the browser supports GPU profiling queries.
   * @internal
   */
  readonly isGLTimerSupported: boolean;

  /** Attempts to compile all shader programs and returns true if all were successful. May throw exceptions on errors.
   * This is useful for debugging shader compilation on specific platforms - especially those which use neither ANGLE nor SwiftShader (e.g., linux, mac, iOS)
   * because our unit tests which also compile all shaders run in software mode and therefore may not catch some "errors" (especially uniforms that have no effect on
   * program output).
   * @internal
   */
  compileAllShaders(): boolean;

  /** Obtain accumulated debug info collected during shader compilation. See `RenderSystem.Options.debugShaders`.
   * @internal
   */
  debugShaderFiles?: DebugShaderFile[];
}

/** @internal */
export abstract class RenderRealityMeshGeometry implements IDisposable, RenderMemory.Consumer {
  public abstract dispose(): void;
  public abstract collectStatistics(stats: RenderMemory.Statistics): void;
}
/** @internal */
export class TerrainTexture {
  public constructor(public readonly texture: RenderTexture, public featureId: number, public readonly scale: Vector2d, public readonly translate: Vector2d, public readonly targetRectangle: Range2d, public readonly layerIndex: number, public transparency: number, public readonly clipRectangle?: Range2d) {
  }
}

/** @internal */
export class DebugShaderFile {
  public constructor(public readonly filename: string, public readonly src: string, public isVS: boolean, public isGL: boolean, public isUsed: boolean) {
  }
}
/** Transparency settings for planar grid display.
 * @alpha
 */
export class PlanarGridTransparency {
  /** Transparency for the grid plane.   This should generally be fairly high to avoid obscuring other geometry */
  public readonly planeTransparency = .9;
  /** Transparency of the grid lines.  This should be higher than the plane, but less than reference line transparency */
  public readonly lineTransparency = .75;
  /** Transparency of the reference lines.   This should be less than plane or line transparency so that reference lines are more prominent */
  public readonly refTransparency = .5;
}

/** Settings for planar grid display.
 * @alpha
 */
export interface PlanarGridProps {
  /**  The grid origin */
  origin: Point3d;
  /** The grid orientation. The grid X and Y direction are the first and second matrix rows */
  rMatrix: Matrix3d;
  /** The spacing between grid liens in the X and Y direction */
  spacing: XAndY;
  /** Grid lines per reference. If zero no reference lines are displayed. */
  gridsPerRef: number;
  /** Grid color.   [[Use Viewport.getContrastToBackgroundColor]] to get best constrast color based on current background. */
  color: ColorDef;
  /** Transparency settings.  If omitted then the [[PlanarGridTransparency]] defaults are used. */
  transparency?: PlanarGridTransparency;
}

/** A RenderSystem provides access to resources used by the internal WebGL-based rendering system.
 * An application rarely interacts directly with the RenderSystem; instead it interacts with types like [[Viewport]] which
 * coordinate with the RenderSystem on the application's behalf.
 * @see [[IModelApp.renderSystem]].
 * @public
 */
export abstract class RenderSystem implements IDisposable {
  /** Options used to initialize the RenderSystem. These are primarily used for feature-gating.
   * This object is frozen and cannot be modified after the RenderSystem is created.
   * @internal
   */
  public readonly options: RenderSystem.Options;

  /** Antialias samples to use on all subsequently created render targets.
   * Default value: undefined (no antialiasing)
   * @beta
   */
  public antialiasSamples?: number;

  /** Initialize the RenderSystem with the specified options.
   * @note The RenderSystem takes ownership of the supplied Options and freezes it.
   * @internal
   */
  protected constructor(options?: RenderSystem.Options) {
    this.options = undefined !== options ? options : {};
    Object.freeze(this.options);
    if (undefined !== this.options.disabledExtensions)
      Object.freeze(this.options.disabledExtensions);
  }

  /** @internal */
  public abstract get isValid(): boolean;

  /** @internal */
  public abstract dispose(): void;

  /** @internal */
  public get maxTextureSize(): number { return 0; }

  /** @internal */
  public get supportsInstancing(): boolean { return true; }

  /** @internal */
  public get supportsNonuniformScaledInstancing(): boolean { return true; }

  /** @internal */
  public get dpiAwareLOD(): boolean { return true === this.options.dpiAwareLOD; }

  /** @internal */
  public get isMobile(): boolean { return false; }

  /** @internal */
  public abstract createTarget(canvas: HTMLCanvasElement): RenderTarget;
  /** @internal */
  public abstract createOffscreenTarget(rect: ViewRect): RenderTarget;

  /** Perform a small unit of idle work and return true if more idle work remains to be done. This function is invoked on each tick of the javascript event loop as long as no viewports are registered with the ViewManager, until it returns false to indicate all idle work has been completed.
   * @internal
   */
  public abstract doIdleWork(): boolean;

  /** Find a previously-created [RenderMaterial]($common) by its ID.
   * @param _key The unique ID of the material within the context of the IModelConnection. Typically an element ID.
   * @param _imodel The IModelConnection with which the material is associated.
   * @returns A previously-created material matching the specified ID, or undefined if no such material exists.
   */
  public findMaterial(_key: string, _imodel: IModelConnection): RenderMaterial | undefined { return undefined; }

  /** Create a [RenderMaterial]($common) from parameters
   * If the parameters include a non-empty key, and no previously-created material already exists with that key, the newly-created material will be cached on the IModelConnection such
   * that it can later be retrieved by the same key using [[RenderSystem.findMaterial]].
   * @param _params A description of the material's properties.
   * @param _imodel The IModelConnection associated with the material.
   * @returns the newly-created material, or undefined if the material could not be created or if a material with the same key as that specified in the params already exists.
   */
  public createMaterial(_params: RenderMaterial.Params, _imodel: IModelConnection): RenderMaterial | undefined { return undefined; }

  /** Creates a [[GraphicBuilder]] for creating a [[RenderGraphic]].
   * @param placement The local-to-world transform in which the builder's geometry is to be defined.
   * @param type The type of builder to create.
   * @param viewport The viewport in which the resultant [[RenderGraphic]] will be rendered.
   * @param pickableId If the decoration is to be pickable, a unique identifier to associate with the resultant [[RenderGraphic]].
   * @returns A builder for creating a [[RenderGraphic]] of the specified type appropriate for rendering within the specified viewport.
   * @see [[IModelConnection.transientIds]] for obtaining an ID for a pickable decoration.
   * @see [[RenderContext.createGraphicBuilder]].
   * @see [[Decorator]]
   */
  public createGraphicBuilder(placement: Transform, type: GraphicType, viewport: Viewport, pickableId?: Id64String): GraphicBuilder {
    const pickable = undefined !== pickableId ? { id: pickableId } : undefined;
    return this.createGraphic({ type, viewport, placement, pickable });
  }

  /** Obtain a [[GraphicBuilder]] from which to produce a [[RenderGraphic]].
   * @param options Options describing how to create the builder.
   * @returns A builder that produces a [[RenderGraphic]].
   */
  public abstract createGraphic(options: GraphicBuilderOptions): GraphicBuilder;

  /** Obtain an object capable of producing a custom screen-space effect to be applied to the image rendered by a [[Viewport]].
   * @returns undefined if screen-space effects are not supported by this RenderSystem.
   */
  public createScreenSpaceEffectBuilder(_params: ScreenSpaceEffectBuilderParams): ScreenSpaceEffectBuilder | undefined {
    return undefined;
  }

  /** @internal */
  public createTriMesh(args: MeshArgs, instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined {
    const params = MeshParams.create(args);
    return this.createMesh(params, instances);
  }

  /** @internal */
  public createIndexedPolylines(args: PolylineArgs, instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined {
    if (args.flags.isDisjoint) {
      const pointStringParams = PointStringParams.create(args);
      return undefined !== pointStringParams ? this.createPointString(pointStringParams, instances) : undefined;
    } else {
      const polylineParams = PolylineParams.create(args);
      return undefined !== polylineParams ? this.createPolyline(polylineParams, instances) : undefined;
    }
  }

  /** @internal */
  public createMesh(_params: MeshParams, _instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createPolyline(_params: PolylineParams, _instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createRealityMeshFromTerrain(_terrainMesh: TerrainMeshPrimitive, _transform?: Transform): RenderRealityMeshGeometry | undefined { return undefined; }
  /** @internal */
  public createRealityMeshGraphic(_terrainGeometry: RenderRealityMeshGeometry, _featureTable: PackedFeatureTable, _tileId: string | undefined, _baseColor: ColorDef | undefined, _baseTransparent: boolean, _textures?: TerrainTexture[]): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createRealityMesh(_realityMesh: RealityMeshPrimitive): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public get maxRealityImageryLayers() { return 0; }
  /** @internal */
  public createPointString(_params: PointStringParams, _instances?: InstancedGraphicParams | Point3d): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createPointCloud(_args: PointCloudArgs, _imodel: IModelConnection): RenderGraphic | undefined { return undefined; }

  /** Create a clip volume to clip geometry.
   * @note The clip volume takes ownership of the ClipVector, which must not be subsequently mutated.
   * @param _clipVector Defines how the volume clips geometry.
   * @returns A clip volume, or undefined if, e.g., the clip vector does not clip anything.
   */
  public createClipVolume(_clipVector: ClipVector): RenderClipVolume | undefined { return undefined; }

  /** @internal */
  public createPlanarGrid(_frustum: Frustum,_grid: PlanarGridProps): RenderGraphic | undefined { return undefined; }
  /** @internal */
  public createBackgroundMapDrape(_drapedTree: TileTreeReference, _mapTree: MapTileTreeReference): RenderTextureDrape | undefined { return undefined; }
  /** @internal */
  public createTile(tileTexture: RenderTexture, corners: Point3d[], featureIndex?: number): RenderGraphic | undefined {
    const rasterTile = new MeshArgs();

    // corners
    // [0] [1]
    // [2] [3]
    // Quantize the points according to their range
    rasterTile.points = new QPoint3dList(QParams3d.fromRange(Range3d.create(...corners)));
    for (let i = 0; i < 4; ++i)
      rasterTile.points.add(corners[i]);

    // Now remove the translation from the quantized points and put it into a transform instead.
    // This prevents graphical artifacts when quantization origin is large relative to quantization scale.
    // ###TODO: Would be better not to create a branch for every tile.
    const qorigin = rasterTile.points.params.origin;
    const transform = Transform.createTranslationXYZ(qorigin.x, qorigin.y, qorigin.z);
    qorigin.setZero();

    rasterTile.vertIndices = [0, 1, 2, 2, 1, 3];
    rasterTile.textureUv = [
      new Point2d(0.0, 0.0),
      new Point2d(1.0, 0.0),
      new Point2d(0.0, 1.0),
      new Point2d(1.0, 1.0),
    ];

    rasterTile.texture = tileTexture;
    rasterTile.isPlanar = true;

    if (undefined !== featureIndex) {
      rasterTile.features.featureID = featureIndex;
      rasterTile.features.type = FeatureIndexType.Uniform;
    }

    const trimesh = this.createTriMesh(rasterTile);
    if (undefined === trimesh)
      return undefined;

    const branch = new GraphicBranch(true);
    branch.add(trimesh);
    return this.createBranch(branch, transform);
  }

  /** Create a Graphic for a [[SkyBox]] which encompasses the entire scene, rotating with the camera. */
  public createSkyBox(_params: SkyBox.CreateParams): RenderGraphic | undefined { return undefined; }

  /** Create a RenderGraphic consisting of a list of Graphics to be drawn together. */
  public abstract createGraphicList(primitives: RenderGraphic[]): RenderGraphic;

  /** Create a RenderGraphic consisting of a list of Graphics, with optional transform and symbology overrides applied to the list */
  public createBranch(branch: GraphicBranch, transform: Transform): RenderGraphic {
    return this.createGraphicBranch(branch, transform);
  }

  /** Create a graphic from a [[GraphicBranch]]. */
  public abstract createGraphicBranch(branch: GraphicBranch, transform: Transform, options?: GraphicBranchOptions): RenderGraphic;

  /** Create a RenderGraphic consisting of batched [[Feature]]s.
   * @internal
   */
  public abstract createBatch(graphic: RenderGraphic, features: PackedFeatureTable, range: ElementAlignedBox3d, options?: BatchOptions): RenderGraphic;

  /** Create a graphic that assumes ownership of another graphic.
   * @param ownedGraphic The RenderGraphic to be owned.
   * @returns The owning graphic that exposes a `disposeGraphic` method for explicitly disposing of the owned graphic.
   * @see [[RenderGraphicOwner]] for details regarding ownership semantics.
   * @public
   */
  public createGraphicOwner(ownedGraphic: RenderGraphic): RenderGraphicOwner { return new GraphicOwner(ownedGraphic); }

  /** Create a "layer" containing the graphics belonging to it. A layer has a unique identifier and all of its geometry lies in an XY plane.
   * Different layers can be drawn coincident with one another; their draw order can be controlled by a per-layer priority value so that one layer draws
   * on top of another. Layers cannot nest inside other layers. Multiple GraphicLayers can exist with the same ID; they are treated as belonging to the same layer.
   * A GraphicLayer must be contained (perhaps indirectly) inside a GraphicLayerContainer.
   * @see [[createGraphicLayerContainer]]
   * @internal
   */
  public createGraphicLayer(graphic: RenderGraphic, _layerId: string): RenderGraphic { return graphic; }

  /** Create a graphic that can contain [[GraphicLayer]]s.
   * @internal
   */
  public createGraphicLayerContainer(graphic: RenderGraphic, _drawAsOverlay: boolean, _transparency: number, _elevation: number): RenderGraphic { return graphic; }

  /** Find a previously-created [[RenderTexture]] by its ID.
   * @param _key The unique ID of the texture within the context of the IModelConnection. Typically an element ID.
   * @param _imodel The IModelConnection with which the texture is associated.
   * @returns A previously-created texture matching the specified ID, or undefined if no such texture exists.
   */
  public findTexture(_key: string, _imodel: IModelConnection): RenderTexture | undefined { return undefined; }

  /** Find or create a [[RenderTexture]] from a persistent texture element.
   * @param id The ID of the texture element.
   * @param iModel The IModel containing the texture element.
   * @returns A Promise resolving to the created RenderTexture or to undefined if the texture could not be created.
   * @note If the texture is successfully created, it will be cached on the IModelConnection such that it can later be retrieved by its ID using [[RenderSystem.findTexture]].
   * @see [[RenderSystem.loadTextureImage]].
   * @internal
   */
  public async loadTexture(id: Id64String, iModel: IModelConnection): Promise<RenderTexture | undefined> {
    let texture = this.findTexture(id.toString(), iModel);
    if (undefined === texture) {
      const image = await this.loadTextureImage(id, iModel);
      if (undefined !== image) {
        // This will return a pre-existing RenderTexture if somebody else loaded it while we were awaiting the image.
        texture = this.createTextureFromImage(image.image!, ImageSourceFormat.Png === image.format, iModel, new RenderTexture.Params(id.toString()));
      }
    }

    return texture;
  }

  /**
   * Load a texture image given the ID of a texture element.
   * @param id The ID of the texture element.
   * @param iModel The IModel containing the texture element.
   * @returns A Promise resolving to a TextureImage created from the texture element's data, or to undefined if the TextureImage could not be created.
   * @see [[RenderSystem.loadTexture]]
   * @internal
   */
  public async loadTextureImage(id: Id64String, iModel: IModelConnection): Promise<TextureImage | undefined> {
    const elemProps = await iModel.elements.getProps(id);
    if (1 !== elemProps.length)
      return undefined;

    const textureProps = elemProps[0] as TextureProps;
    if (undefined === textureProps.data || "string" !== typeof (textureProps.data) || undefined === textureProps.format || "number" !== typeof (textureProps.format))
      return undefined;

    const format = textureProps.format;
    if (!isValidImageSourceFormat(format))
      return undefined;

    const imageSource = new ImageSource(base64StringToUint8Array(textureProps.data), format);
    const image = await imageElementFromImageSource(imageSource);
    return { image, format };
  }

  /** Obtain a texture created from a gradient.
   * @param _symb The description of the gradient.
   * @param _imodel The IModelConnection with which the texture is associated.
   * @returns A texture created from the gradient image, or undefined if the texture could not be created.
   * @note If a texture matching the specified gradient already exists, it will be returned.
   * Otherwise, the newly-created texture will be cached on the IModelConnection such that a subsequent call to getGradientTexture with an equivalent gradient will
   * return the previously-created texture.
   */
  public getGradientTexture(_symb: Gradient.Symb, _imodel: IModelConnection): RenderTexture | undefined { return undefined; }

  /** Create a new texture from an [[ImageBuffer]]. */
  public createTextureFromImageBuffer(_image: ImageBuffer, _imodel: IModelConnection, _params: RenderTexture.Params): RenderTexture | undefined { return undefined; }

  /** Create a new texture from an HTML image. Typically the image was extracted from a binary representation of a jpeg or png via [[imageElementFromImageSource]] */
  public createTextureFromImage(_image: HTMLImageElement, _hasAlpha: boolean, _imodel: IModelConnection | undefined, _params: RenderTexture.Params): RenderTexture | undefined { return undefined; }

  /** Create a new texture from an [[ImageSource]]. */
  public async createTextureFromImageSource(source: ImageSource, imodel: IModelConnection | undefined, params: RenderTexture.Params): Promise<RenderTexture | undefined> {
    const promise = imageElementFromImageSource(source);
    return promise.then((image: HTMLImageElement) => {
      return IModelApp.hasRenderSystem ? this.createTextureFromImage(image, ImageSourceFormat.Png === source.format, imodel, params) : undefined;
    });
  }

  /** Create a new texture by its element ID. This texture will be retrieved asynchronously from the backend. A placeholder image will be associated with the texture until the requested image data loads. */
  public createTextureFromElement(_id: Id64String, _imodel: IModelConnection, _params: RenderTexture.Params, _format: ImageSourceFormat): RenderTexture | undefined { return undefined; }

  /** Create a new texture from a cube of HTML images.
   * @internal
   */
  public createTextureFromCubeImages(_posX: HTMLImageElement, _negX: HTMLImageElement, _posY: HTMLImageElement, _negY: HTMLImageElement, _posZ: HTMLImageElement, _negZ: HTMLImageElement, _imodel: IModelConnection, _params: RenderTexture.Params): RenderTexture | undefined { return undefined; }

  /** @internal */
  public onInitialized(): void { }

  /** @internal */
  public enableDiagnostics(_enable: RenderDiagnostics): void { }

  /** @internal */
  public get supportsLogZBuffer(): boolean { return false !== this.options.logarithmicDepthBuffer; }

  /** Obtain an object that can be used to control various debugging features. Returns `undefined` if debugging features are unavailable for this `RenderSystem`.
   * @beta
   */
  public get debugControl(): RenderSystemDebugControl | undefined { return undefined; }

  /** @internal */
  public collectStatistics(_stats: RenderMemory.Statistics): void { }

  /** A function that is invoked after the WebGL context is lost. Context loss is almost always caused by excessive consumption of GPU memory.
   * After context loss occurs, the RenderSystem will be unable to interact with WebGL by rendering viewports, creating graphics and textures, etc.
   * By default, this function invokes [[ToolAdmin.exceptionHandler]] with a brief message describing what occurred.
   * An application can override this behavior as follows:
   * ```ts
   * RenderSystem.contextLossHandler = (): Promise<any> => {
   *  // your implementation here.
   * }
   * ```
   * @note Context loss is reported by the browser some short time *after* it has occurred. It is not possible to determine the specific cause.
   * @see [[TileAdmin.gpuMemoryLimit]] to limit the amount of GPU memory consumed thereby reducing the likelihood of context loss.
   * @see [[TileAdmin.totalTileContentBytes]] for the amount of GPU memory allocated for tile graphics.
   */
  public static async contextLossHandler(): Promise<any> {
    const msg = IModelApp.i18n.translate("iModelJs:Errors.WebGLContextLost");
    return ToolAdmin.exceptionHandler(msg);
  }
}

/** A RenderSystem provides access to resources used by the internal WebGL-based rendering system.
 * An application rarely interacts directly with the RenderSystem; instead it interacts with types like [[Viewport]] which
 * coordinate with the RenderSystem on the application's behalf.
 * @see [[IModelApp.renderSystem]].
 * @public
 */
export namespace RenderSystem { // eslint-disable-line no-redeclare
  /** Options passed to [[IModelApp.supplyRenderSystem]] to configure the [[RenderSystem]] on startup. Many of these options serve as "feature flags" used to enable newer, experimental features. As such they typically begin life tagged as "alpha" or "beta" and are subsequently deprecated when the feature is declared stable.
   *
   * @public
   */
  export interface Options {
    /** WebGL extensions to be explicitly disabled, regardless of whether or not the WebGL implementation supports them.
     * This is chiefly useful for testing code that only executes in the absence of particular extensions, while running on a system that supports those extensions.
     *
     * Default value: undefined
     *
     * @public
     */
    disabledExtensions?: WebGLExtensionName[];

    /** If true, preserve the shader source code as internal strings, useful for debugging purposes.
     *
     * Default value: false
     *
     * @public
     */
    preserveShaderSourceCode?: boolean;

    /** If true, display solar shadows when enabled by [ViewFlags.shadows]($common).
     *
     * Default value: true
     *
     * @beta
     */
    displaySolarShadows?: boolean;

    /** If the view frustum is sufficiently large, and the EXT_frag_depth WebGL extension is available, use a logarithmic depth buffer to improve depth buffer resolution. Framerate may degrade to an extent while the logarithmic depth buffer is in use. If this option is disabled, or the extension is not supported, the near and far planes of very large view frustums will instead be moved to reduce the draw distance.
     *
     * Default value: true
     *
     * @public
     */
    logarithmicDepthBuffer?: boolean;

    /** ###TODO this appears to do nothing. @internal */
    filterMapTextures?: boolean;
    /** ###TODO this appears to do nothing. @internal */
    filterMapDrapeTextures?: boolean;

    /** If true, [[ScreenViewport]]s will respect the DPI of the display.  See [[Viewport.devicePixelRatio]] and [[Viewport.cssPixelsToDevicePixels]].
     * @see [[dpiAwareLOD]] to control whether device pixel ratio affects the level of detail for tile graphics and decorations.
     * @see [[Viewport.cssPixelsToDevicePixels]] to convert CSS pixels to device pixels.
     * @see [[Viewport.devicePixelRatio]].
     *
     * Default value: true
     *
     * @public
     */
    dpiAwareViewports?: boolean;

    /** If defined, this will be used as the device pixel ratio instead of the system's actual device pixel ratio.
     * This can be helpful for situations like running in the iOS Simulator where forcing a lower resolution by setting a sub-1 device pixel ratio would increase performance.
     * @note If this setting is used to decrease the effective device pixel ratio, the view will appear pixelated.
     * @note This setting should only be used to increase performance in situations like the iOS Simulator for testing purposes only. It should not be used in a production situation.
     * @note This setting has no effect if [[dpiAwareViewports]] is `false`.
     *
     * Default value: undefined
     *
     * @public
     */
    devicePixelRatioOverride?: number;

    /** If true, [[ScreenViewport]]s will take into account the DPI of the display when computing the level of detail for tile graphics and decorations.
     * This can result in sharper-looking images on high-DPI devices like mobile phones, but may reduce performance on such devices.
     * @note This setting has no effect if [[dpiAwareViewports]] is `false`.
     * @see [[Viewport.devicePixelRatio]].
     *
     * Default value: false
     *
     * @public
     */
    dpiAwareLOD?: boolean;

    /** If true will attempt to create a WebGL2 context, falling back to WebGL1 if WebGL2 is not supported.
     *
     * Default value: true
     *
     * @public
     */
    useWebGL2?: boolean;

    /** If true, plan projection models will be rendered using [PlanProjectionSettings]($common) defined by the [[DisplayStyle3dState]].
     * Default value: true
     * @public
     */
    planProjections?: boolean;

    /** To help prevent delays when a user interacts with a [[Viewport]], the WebGL render system can precompile shader programs before any Viewport is opened.
     * This particularly helps applications when they do not open a Viewport immediately upon startup - for example, if the user is first expected to select an iModel and a view through the user interface.
     * Shader precompilation will cease once all shader programs have been compiled, or when a Viewport is opened (registered with the [[ViewManager]]).
     * @note Enabling this feature can slow UI interactions before a [[Viewport]] is opened.
     * To enable this feature, set this to `true`.
     *
     * Default value: false
     *
     * @beta
     */
    doIdleWork?: boolean;

    /** WebGL context attributes to explicitly set when initializing [[IModelApp.renderSystem]].
     * Exposed chiefly for OpenCities Planner.
     * @internal
     */
    contextAttributes?: WebGLContextAttributes;

    /** If true, and the `WEBGL_debug_shaders` extension is available, accumulate debug information during shader compilation.
     * This information can be accessed via `RenderSystemDebugControl.debugShaderFiles`.
     * Default value: false
     * @internal
     */
    debugShaders?: boolean;

    /** Initial antialias setting
     * If > 1, and a WebGL2 context is being used, will turn on antialiasing using that many samples.
     * Default value: 1
     * @public
     */
    antialiasSamples?: number;
  }
}
