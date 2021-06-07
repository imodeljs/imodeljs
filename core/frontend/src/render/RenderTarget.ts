/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { Id64String, IDisposable } from "@bentley/bentleyjs-core";
import { Point2d, XAndY } from "@bentley/geometry-core";
import { Frustum, ImageBuffer, SpatialClassifier } from "@bentley/imodeljs-common";
import { HiliteSet } from "../SelectionSet";
import { SceneContext } from "../ViewContext";
import { Viewport } from "../Viewport";
import { ViewRect } from "../ViewRect";
import { IModelConnection } from "../IModelConnection";
import { CanvasDecoration } from "./CanvasDecoration";
import { Decorations } from "./Decorations";
import { FeatureSymbology } from "./FeatureSymbology";
import { AnimationBranchStates } from "./GraphicBranch";
import { GraphicBuilderOptions } from "./GraphicBuilder";
import { Pixel } from "./Pixel";
import { GraphicList } from "./RenderGraphic";
import { RenderMemory } from "./RenderMemory";
import { RenderPlan } from "./RenderPlan";
import { RenderPlanarClassifier } from "./RenderPlanarClassifier";
import { RenderSystem, RenderTextureDrape } from "./RenderSystem";
import { Scene } from "./Scene";
import { QueryTileFeaturesOptions, QueryVisibleFeaturesCallback } from "./VisibleFeature";
import { FrameStatsCollector } from "./FrameStats";

/** Used for debugging purposes, to toggle display of instanced or batched primitives.
 * @see [[RenderTargetDebugControl]].
 * @internal
 */
export enum PrimitiveVisibility {
  /** Draw all primitives. */
  All,
  /** Only draw instanced primitives. */
  Instanced,
  /** Only draw un-instanced primitives. */
  Uninstanced,
}

/** An interface optionally exposed by a RenderTarget that allows control of various debugging features.
 * @internal
 */
export interface RenderTargetDebugControl {
  /** If true, render to the screen as if rendering off-screen for readPixels(). */
  drawForReadPixels: boolean;
  primitiveVisibility: PrimitiveVisibility;
  vcSupportIntersectingVolumes: boolean;
  readonly shadowFrustum: Frustum | undefined;
  displayDrapeFrustum: boolean;
  /** Override device pixel ratio for on-screen targets only. This supersedes window.devicePixelRatio.
   * Undefined clears the override. Chiefly useful for tests.
   */
  devicePixelRatioOverride?: number;
  displayRealityTilePreload: boolean;
  displayRealityTileRanges: boolean;
  logRealityTiles: boolean;
  freezeRealityTiles: boolean;
}

/** A RenderTarget connects a [[Viewport]] to a WebGLRenderingContext to enable the viewport's contents to be displayed on the screen.
 * Application code rarely interacts directly with a RenderTarget - instead, it interacts with a Viewport which forwards requests to the implementation
 * of the RenderTarget.
 * @internal
 */
export abstract class RenderTarget implements IDisposable, RenderMemory.Consumer {
  public pickOverlayDecoration(_pt: XAndY): CanvasDecoration | undefined { return undefined; }

  public abstract get renderSystem(): RenderSystem;

  /** NB: *Device pixels*, not CSS pixels! */
  public abstract get viewRect(): ViewRect;

  public get devicePixelRatio(): number { return 1; }
  public cssPixelsToDevicePixels(cssPixels: number, floor = true): number {
    const pix = cssPixels * this.devicePixelRatio;
    return floor ? Math.floor(pix) : pix;
  }

  /** Given the size of a logical pixel in meters, convert it to the size of a physical pixel in meters, if [[RenderSystem.dpiAwareLOD]] is `true`.
   * Used when computing LOD for graphics.
   */
  public adjustPixelSizeForLOD(cssPixelSize: number): number {
    return this.renderSystem.dpiAwareLOD ? this.cssPixelsToDevicePixels(cssPixelSize, false) : cssPixelSize;
  }

  public abstract get wantInvertBlackBackground(): boolean;

  public abstract get analysisFraction(): number;
  public abstract set analysisFraction(fraction: number);

  public get animationBranches(): AnimationBranchStates | undefined { return undefined; }
  public set animationBranches(_transforms: AnimationBranchStates | undefined) { }

  public get antialiasSamples(): number { return 1; }
  public set antialiasSamples(_numSamples: number) { }

  public assignFrameStatsCollector(_collector: FrameStatsCollector) { }

  /** Update the solar shadow map. If a SceneContext is supplied, shadows are enabled; otherwise, shadows are disabled. */
  public updateSolarShadows(_context: SceneContext | undefined): void { }
  public getPlanarClassifier(_id: Id64String): RenderPlanarClassifier | undefined { return undefined; }
  public createPlanarClassifier(_properties?: SpatialClassifier): RenderPlanarClassifier | undefined { return undefined; }
  public getTextureDrape(_id: Id64String): RenderTextureDrape | undefined { return undefined; }

  public createGraphicBuilder(options: GraphicBuilderOptions) {
    return this.renderSystem.createGraphic(options);
  }

  public dispose(): void { }
  public reset(): void { }
  public abstract changeScene(scene: Scene): void;
  public abstract changeDynamics(dynamics?: GraphicList): void;
  public abstract changeDecorations(decorations: Decorations): void;
  public abstract changeRenderPlan(plan: RenderPlan): void;
  public abstract drawFrame(sceneMilSecElapsed?: number): void;
  public overrideFeatureSymbology(_ovr: FeatureSymbology.Overrides): void { }
  public setHiliteSet(_hilited: HiliteSet): void { }
  public setFlashed(_elementId: Id64String, _intensity: number): void { }
  public onBeforeRender(_viewport: Viewport, _setSceneNeedRedraw: (redraw: boolean) => void): void { }
  public abstract setViewRect(_rect: ViewRect, _temporary: boolean): void;
  public onResized(): void { }
  public abstract updateViewRect(): boolean; // force a RenderTarget viewRect to resize if necessary since last draw
  /** `rect` is specified in *CSS* pixels. */
  public abstract readPixels(rect: ViewRect, selector: Pixel.Selector, receiver: Pixel.Receiver, excludeNonLocatable: boolean): void;
  /** `_rect` is specified in *CSS* pixels. */
  public readImage(_rect: ViewRect, _targetSize: Point2d, _flipVertically: boolean): ImageBuffer | undefined { return undefined; }
  public readImageToCanvas(): HTMLCanvasElement { return document.createElement("canvas"); }
  public collectStatistics(_stats: RenderMemory.Statistics): void { }

  /** Specify whether webgl content should be rendered directly to the screen.
   * If rendering to screen becomes enabled, returns the canvas to which to render the webgl content.
   * Returns undefined if rendering to screen becomes disabled, or is not supported by this RenderTarget.
   */
  public setRenderToScreen(_toScreen: boolean): HTMLCanvasElement | undefined { return undefined; }

  public get debugControl(): RenderTargetDebugControl | undefined { return undefined; }

  /** An ordered list of names of screen-space post-processing effects to be applied to the image produced by this target.
   * The effects are applied in the order in which they appear in the list. Any names not corresponding to a registered effect are ignored.
   * This may have no effect if this target does not support screen-space effects.
   * @see [[RenderSystem.createScreenSpaceEffectBuilder]] to create and register new effects.
   */
  public abstract get screenSpaceEffects(): Iterable<string>;
  public abstract set screenSpaceEffects(_effectNames: Iterable<string>);

  /** Implementation for [[Viewport.queryVisibleFeatures]]. Not intended for direct usage. The returned iterable remains valid only for the duration of the
   * Viewport.queryVisibleFeatures call.
   */
  public queryVisibleTileFeatures(_options: QueryTileFeaturesOptions, _iModel: IModelConnection, callback: QueryVisibleFeaturesCallback): void {
    callback([]);
  }
}
