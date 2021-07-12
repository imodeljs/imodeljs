/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { Map4d, Point3d } from "@bentley/geometry-core";
import { ColorByName, ColorDef, Frustum, LinePixels, Npc } from "@bentley/imodeljs-common";
import {
  CoordSystem, DecorateContext, Decorator, GraphicBuilder, GraphicType, IModelApp, Tool, Viewport, ViewState, ViewState3d,
} from "@bentley/imodeljs-frontend";
import { parseToggle } from "./parseToggle";

interface FrustumDecorationOptions {
  showPreloadFrustum?: boolean;
  showBackgroundIntersecctions?: boolean;
}

/**
 * Decorates the viewport with a graphical depiction of a Frustum.
 * This is obviously only useful when drawn inside a viewport using a *different* Frustum.
 * Options for doing so include:
 *  - Having more than one viewport, and drawing the frustum of one viewport inside the other viewports; and
 *  - Allowing the user to take a snapshot of the current frustum, then navigate the view to inspect it within the same viewport.
 */
class FrustumDecoration {
  private readonly _worldFrustum: Frustum;
  private readonly _adjustedWorldFrustum: Frustum;
  private readonly _preloadFrustum: Frustum;
  private readonly _npcFrustum: Frustum;
  private readonly _worldToNpcMap: Map4d;
  private readonly _eyePoint: Point3d;
  private readonly _focalPlane: number;
  private readonly _isCameraOn: boolean;

  private constructor(vp: Viewport, view: ViewState3d, private readonly _options?: FrustumDecorationOptions) {
    this._worldFrustum = vp.getFrustum(CoordSystem.World, false);
    this._adjustedWorldFrustum = vp.getFrustum(CoordSystem.World, true);
    this._preloadFrustum = vp.viewingSpace.getPreloadFrustum();
    this._npcFrustum = vp.getFrustum(CoordSystem.Npc, true);
    this._worldToNpcMap = vp.viewingSpace.worldToNpcMap.clone();
    this._eyePoint = view.camera.getEyePoint().clone();
    this._focalPlane = vp.worldToNpc(view.getTargetPoint()).z;
    this._isCameraOn = vp.isCameraOn;
  }

  public static create(vp: Viewport, options?: FrustumDecorationOptions): FrustumDecoration | undefined {
    const view = vp.view.isSpatialView() ? vp.view : undefined;
    return undefined !== view ? new FrustumDecoration(vp, view, options) : undefined;
  }

  public decorate(context: DecorateContext): void {
    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);

    if (this._isCameraOn)
      FrustumDecoration.drawEyePositionAndFocalPlane(builder, this._npcFrustum, this._worldToNpcMap, this._eyePoint, this._focalPlane, context.viewport);

    FrustumDecoration.drawFrustumBox(builder, this._worldFrustum, false, context.viewport); // show original frustum...
    FrustumDecoration.drawFrustumBox(builder, this._adjustedWorldFrustum, true, context.viewport); // show adjusted frustum...
    const options = this._options;
    if (options !== undefined) {
      if (options.showPreloadFrustum)
        FrustumDecoration.drawPreloadFrustum(builder, this._preloadFrustum);

      if (options?.showBackgroundIntersecctions) {
        const backgroundMapGeometry = context.viewport.view.displayStyle.getBackgroundMapGeometry();
        if (backgroundMapGeometry)
          backgroundMapGeometry.addFrustumDecorations(builder, this._adjustedWorldFrustum);
      }
    }
    context.addDecorationFromBuilder(builder);
  }

  public static drawPreloadFrustum(builder: GraphicBuilder, frustum: Frustum) {
    const preloadColor = ColorDef.create(ColorByName.coral);
    builder.setSymbology(preloadColor, preloadColor, 1, 2);
    builder.addFrustum(frustum);
  }

  public static drawFrustumBox(builder: GraphicBuilder, frustum: Frustum, adjustedBox: boolean, vp: Viewport): void {
    const backPts = this.getPlanePts(frustum.points, false); // back plane
    const frontPts = this.getPlanePts(frustum.points, true); // front plane

    const bgColor = vp.view.backgroundColor;
    const backAndBottomColor = ColorDef.red.adjustedForContrast(bgColor);
    const frontAndTopLeftColor = ColorDef.blue.adjustedForContrast(bgColor);
    const frontAndTopRightColor = ColorDef.green.adjustedForContrast(bgColor);
    const edgeWeight = adjustedBox ? 2 : 1;
    const edgeStyle = adjustedBox ? LinePixels.Solid : LinePixels.Code2;

    // Back plane
    builder.setSymbology(backAndBottomColor, ColorDef.black, edgeWeight, edgeStyle);
    builder.addLineString(backPts);

    // Front plane
    builder.setSymbology(frontAndTopLeftColor, ColorDef.black, edgeWeight, edgeStyle);
    builder.addLineString(frontPts);

    // Bottom edge
    builder.setSymbology(backAndBottomColor, ColorDef.black, edgeWeight, edgeStyle);
    builder.addLineString(this.getEdgePts(backPts, frontPts, 0));
    builder.addLineString(this.getEdgePts(backPts, frontPts, 1));

    // Top edge
    builder.setSymbology(frontAndTopRightColor, ColorDef.black, edgeWeight, edgeStyle);
    builder.addLineString(this.getEdgePts(backPts, frontPts, 2));
    builder.setSymbology(frontAndTopLeftColor, ColorDef.black, edgeWeight, edgeStyle);
    builder.addLineString(this.getEdgePts(backPts, frontPts, 3));
  }

  private static getEdgePts(startPts: Point3d[], endPts: Point3d[], index: number): Point3d[] {
    return [
      startPts[index],
      endPts[index],
    ];
  }

  private static getPlanePts(frustPts: Point3d[], front: boolean): Point3d[] {
    const baseIndex = front ? Npc._001 : Npc._000;
    const planePts = [
      frustPts[baseIndex + Npc._000],
      frustPts[baseIndex + Npc._100],
      frustPts[baseIndex + Npc._110],
      frustPts[baseIndex + Npc._010],
    ];

    planePts.push(planePts[0]);
    return planePts;
  }

  public static drawEyePositionAndFocalPlane(builder: GraphicBuilder, npcFrustum: Frustum, worldToNpcMap: Map4d, eyePoint: Point3d, focusPlaneNpc: number, vp: Viewport): void {
    // Eye position...
    const contrastColor = vp.getContrastToBackgroundColor();
    builder.setSymbology(contrastColor, ColorDef.black, 8);
    builder.addPointString([eyePoint]);

    // Focal plane...
    const focalPtsNpc = FrustumDecoration.getPlanePts(npcFrustum.points, false);
    const focalPtsWorld: Point3d[] = [];
    for (const npcPt of focalPtsNpc)
      focalPtsWorld.push(Point3d.create(npcPt.x, npcPt.y, focusPlaneNpc));
    worldToNpcMap.transform1.multiplyPoint3dArrayQuietNormalize(focalPtsWorld);

    const bgColor = vp.view.backgroundColor;
    const focalPlaneColor = ColorDef.green.adjustedForContrast(bgColor);
    const focalTransColor = focalPlaneColor.withTransparency(100);
    builder.setSymbology(focalPlaneColor, focalTransColor, 2);
    builder.addLineString(focalPtsWorld);
    builder.addShape(focalPtsWorld);
  }
}

/**
 * Decorates the viewport with a graphical depiction of a Frustum.
 * This is obviously only useful when drawn inside a viewport using a *different* Frustum.
 * Options for doing so include:
 *  - Having more than one viewport, and drawing the frustum of one viewport inside the other viewports; and
 *  - Allowing the user to take a snapshot of the current frustum, then navigate the view to inspect it within the same viewport.
 *  @beta
 */
export class FrustumDecorator implements Decorator {
  private readonly _decoration?: FrustumDecoration;

  private constructor(vp: Viewport, options?: FrustumDecorationOptions) {
    this._decoration = FrustumDecoration.create(vp, options);
  }

  /** This will allow the render system to cache and reuse the decorations created by this decorator's decorate() method. */
  public readonly useCachedDecorations = true;

  public decorate(context: DecorateContext): void {
    if (undefined !== this._decoration)
      this._decoration.decorate(context);
  }

  private static _instance?: FrustumDecorator;

  /** Add the decoration to the specified viewport. */
  public static enable(vp: Viewport, options?: FrustumDecorationOptions): void {
    FrustumDecorator.disable();
    FrustumDecorator._instance = new FrustumDecorator(vp, options);
    IModelApp.viewManager.addDecorator(FrustumDecorator._instance);
  }

  /** Remove the decoration from the specified viewport. */
  public static disable(): void {
    const instance = FrustumDecorator._instance;
    if (undefined !== instance) {
      IModelApp.viewManager.dropDecorator(instance);
      FrustumDecorator._instance = undefined;
    }
  }

  public static get isEnabled() { return undefined !== FrustumDecorator._instance; }
}

/** Enable ("ON"), disable ("OFF"), or toggle ("TOGGLE" or omitted) the [[FrustumDecorator]].
 * @beta
 */
export class ToggleFrustumSnapshotTool extends Tool {
  public static override toolId = "ToggleFrustumSnapshot";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 2; }

  public override run(enable?: boolean, showPreloadFrustum?: boolean, showBackgroundIntersecctions?: boolean): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp)
      return true;

    if (undefined === enable)
      enable = !FrustumDecorator.isEnabled;

    if (enable !== FrustumDecorator.isEnabled) {
      if (enable) {
        FrustumDecorator.enable(vp, { showPreloadFrustum, showBackgroundIntersecctions });
        vp.onChangeView.addOnce(() => FrustumDecorator.disable());
      } else {
        FrustumDecorator.disable();
      }
    }

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    let showPreload, showBackgroundIntersections, enable;
    for (const arg of args) {
      if (arg === "preload")
        showPreload = true;
      else if (arg === "background")
        showBackgroundIntersections = true;
      else
        enable = parseToggle(arg);
    }

    if (typeof enable !== "string")
      this.run(enable, showPreload, showBackgroundIntersections);

    return true;
  }
}

/**
 * Decorates the viewport with a graphical depiction of a Frustum from the currently selected viewport.
 * Only useful when more than one spatial viewport is open.
 */
class SelectedViewFrustumDecoration {
  private static _decorator?: SelectedViewFrustumDecoration;
  protected _targetVp: Viewport;
  protected _removeDecorationListener?: () => void;
  protected _removeViewChangedListener?: () => void;

  /** This will allow the render system to cache and reuse the decorations created by this decorator's decorate() method. */
  public readonly useCachedDecorations = true;

  public constructor(vp: Viewport, private _options?: FrustumDecorationOptions) {
    this._targetVp = vp;
    this._removeDecorationListener = IModelApp.viewManager.addDecorator(this);
    this._removeViewChangedListener = vp.onViewChanged.addListener(this.onViewChanged, this); // eslint-disable-line @typescript-eslint/unbound-method
    IModelApp.viewManager.invalidateCachedDecorationsAllViews(this);
  }

  protected stop(): void {
    if (this._removeDecorationListener) {
      this._removeDecorationListener();
      this._removeDecorationListener = undefined;
    }
    if (this._removeViewChangedListener) {
      this._removeViewChangedListener();
      this._removeViewChangedListener = undefined;
    }

    IModelApp.viewManager.invalidateCachedDecorationsAllViews(this);
  }

  public onViewChanged(targetVp: Viewport): void {
    if (targetVp !== this._targetVp)
      return;
    const decorator = SelectedViewFrustumDecoration._decorator;
    if (undefined !== decorator) {
      for (const vp of IModelApp.viewManager) {
        if (vp !== this._targetVp)
          vp.invalidateCachedDecorations(decorator);
      }
    }
  }

  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!this._targetVp.view.isSpatialView() || vp === this._targetVp || !vp.view.isSpatialView())
      return;

    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);

    if (this._targetVp.isCameraOn) {
      const npcFrustum = this._targetVp.getFrustum(CoordSystem.Npc, true);
      const focalPlane = this._targetVp.worldToNpc(this._targetVp.view.getTargetPoint()).z;
      FrustumDecoration.drawEyePositionAndFocalPlane(builder, npcFrustum, this._targetVp.viewingSpace.worldToNpcMap, this._targetVp.view.camera.getEyePoint(), focalPlane, context.viewport);
    }

    const worldFrustum = this._targetVp.getFrustum(CoordSystem.World, false);
    const adjustedWorldFrustum = this._targetVp.getFrustum(CoordSystem.World, true);

    FrustumDecoration.drawFrustumBox(builder, worldFrustum, false, context.viewport); // show original frustum...
    FrustumDecoration.drawFrustumBox(builder, adjustedWorldFrustum, true, context.viewport); // show adjusted frustum...
    if (this._options && this._options.showPreloadFrustum)
      FrustumDecoration.drawPreloadFrustum(builder, context.viewport.viewingSpace.getPreloadFrustum());

    context.addDecorationFromBuilder(builder);
  }

  // Returns true if decoration becomes enabled.
  public static toggle(vp: Viewport, enabled?: boolean): boolean {
    if (undefined !== enabled) {
      const alreadyEnabled = undefined !== SelectedViewFrustumDecoration._decorator;
      if (enabled === alreadyEnabled)
        return alreadyEnabled;
    }

    if (undefined === SelectedViewFrustumDecoration._decorator) {
      SelectedViewFrustumDecoration._decorator = new SelectedViewFrustumDecoration(vp);
      return true;
    } else {
      SelectedViewFrustumDecoration._decorator.stop();
      SelectedViewFrustumDecoration._decorator = undefined;
      return false;
    }
  }
}

/** Enable ("ON"), disable ("OFF"), or toggle ("TOGGLE" or omitted) the selected view frustum decoration.
 * @beta
 */
export class ToggleSelectedViewFrustumTool extends Tool {
  public static override toolId = "ToggleSelectedViewFrustum";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override run(enable?: boolean): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp || !vp.view.isSpatialView())
      return false;
    if (SelectedViewFrustumDecoration.toggle(vp, enable)) {
      const remove = vp.onChangeView.addListener((_vp: Viewport, prev: ViewState) => {
        if (!prev.hasSameCoordinates(vp.view)) {
          SelectedViewFrustumDecoration.toggle(vp, false);
          remove();
        }
      });
    }

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const enable = parseToggle(args[0]);
    if (typeof enable !== "string")
      this.run(enable);

    return true;
  }
}

class ShadowFrustumDecoration {
  private static _instance?: ShadowFrustumDecoration;
  private _targetVp: Viewport;
  private _cleanup?: () => void;

  /** This will allow the render system to cache and reuse the decorations created by this decorator's decorate() method. */
  public readonly useCachedDecorations = true;

  public constructor(vp: Viewport) {
    this._targetVp = vp;
    const removeDecorator = IModelApp.viewManager.addDecorator(this);
    const removeOnRender = vp.onRender.addListener((_) => this.onRender());
    this._cleanup = () => { removeDecorator(); removeOnRender(); };
    IModelApp.viewManager.invalidateCachedDecorationsAllViews(this);
  }

  private stop(): void {
    if (undefined !== this._cleanup) {
      this._cleanup();
      this._cleanup = undefined;
    }

    IModelApp.viewManager.invalidateCachedDecorationsAllViews(this);
  }

  public onRender(): void {
    const decorator = ShadowFrustumDecoration._instance;
    if (undefined !== decorator) {
      for (const vp of IModelApp.viewManager) {
        if (vp !== this._targetVp)
          vp.invalidateCachedDecorations(decorator);
      }
    }
  }

  public decorate(context: DecorateContext): void {
    const frustum = this._targetVp.target.debugControl!.shadowFrustum;
    if (undefined === frustum)
      return;

    const thisVp = context.viewport;
    if (thisVp === this._targetVp || !thisVp.view.isSpatialView())
      return;

    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);
    FrustumDecoration.drawFrustumBox(builder, frustum, false, thisVp);
    context.addDecorationFromBuilder(builder);
  }

  public static toggle(vp: Viewport, enabled?: boolean): void {
    const instance = ShadowFrustumDecoration._instance;
    if (undefined !== enabled) {
      const alreadyEnabled = undefined !== instance;
      if (enabled === alreadyEnabled)
        return;
    }

    if (undefined === instance) {
      ShadowFrustumDecoration._instance = new ShadowFrustumDecoration(vp);
    } else {
      instance.stop();
      ShadowFrustumDecoration._instance = undefined;
    }
  }
}

/** Toggle visualization of the selected viewport's shadow frustum in all other viewports.
 * @beta
 */
export class ToggleShadowFrustumTool extends Tool {
  public static override toolId = "ToggleShadowFrustum";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override run(enable?: boolean): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp && vp.view.isSpatialView())
      ShadowFrustumDecoration.toggle(vp, enable);

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const enable = parseToggle(args[0]);
    if (typeof enable !== "string")
      this.run(enable);

    return true;
  }
}
