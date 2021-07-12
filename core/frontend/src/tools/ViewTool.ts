/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import { BeDuration, BeTimePoint } from "@bentley/bentleyjs-core";
import {
  Angle, AngleSweep, Arc3d, AxisOrder, ClipUtilities, Constant, CurveLocationDetail, Geometry, LineString3d, Matrix3d, Plane3dByOriginAndUnitNormal,
  Point2d, Point3d, Range2d, Range3d, Ray3d, Transform, Vector2d, Vector3d, XAndY, YawPitchRollAngles,
} from "@bentley/geometry-core";
import { Cartographic, ColorDef, Frustum, LinePixels, NpcCenter } from "@bentley/imodeljs-common";
import {
  DialogItem, DialogProperty, DialogPropertySyncItem, PropertyDescriptionHelper,
} from "@bentley/ui-abstract";
import { AccuDraw, AccuDrawHintBuilder } from "../AccuDraw";
import { TentativeOrAccuSnap } from "../AccuSnap";
import { BingLocationProvider } from "../BingLocation";
import { CoordSystem } from "../CoordSystem";
import { IModelApp } from "../IModelApp";
import { LengthDescription } from "../properties/LengthDescription";
import { GraphicType } from "../render/GraphicBuilder";
import { Pixel } from "../render/Pixel";
import { StandardViewId } from "../StandardView";
import { Animator, ViewChangeOptions } from "../ViewAnimation";
import { DecorateContext } from "../ViewContext";
import {
  eyeToCartographicOnGlobeFromGcs, GlobalLocation, queryTerrainElevationOffset, rangeToCartographicArea, viewGlobalLocation,
  ViewGlobalLocationConstants,
} from "../ViewGlobalLocation";
import { DepthPointSource, ScreenViewport, Viewport } from "../Viewport";
import { ViewPose } from "../ViewPose";
import { ViewRect } from "../ViewRect";
import { ViewState3d } from "../ViewState";
import { ViewStatus } from "../ViewStatus";
import { EditManipulator } from "./EditManipulator";
import { PrimitiveTool } from "./PrimitiveTool";
import {
  BeButton, BeButtonEvent, BeModifierKeys, BeTouchEvent, BeWheelEvent, CoordSource, CoreTools, EventHandled, InputSource, InteractiveTool,
} from "./Tool";
import { ToolAssistance, ToolAssistanceImage, ToolAssistanceInputMethod, ToolAssistanceInstruction, ToolAssistanceSection } from "./ToolAssistance";
import { ToolSettings } from "./ToolSettings";

// cspell:ignore wasd, arrowright, arrowleft, pagedown, pageup, arrowup, arrowdown
/* eslint-disable no-restricted-syntax */

/** @internal */
const enum ViewHandleWeight {
  Thin = 1,
  Normal = 2,
  Bold = 3,
  VeryBold = 4,
  FatDot = 8,
}

/** @internal */
export enum ViewHandleType {
  None = 0,
  Rotate = 1,
  TargetCenter = 1 << 1,
  Pan = 1 << 2,
  Scroll = 1 << 3,
  Zoom = 1 << 4,
  Walk = 1 << 5,
  Fly = 1 << 6,
  Look = 1 << 7,
  LookAndMove = 1 << 8,
}

/** @internal */
const enum ViewManipPriority {
  Low = 1,
  Normal = 10,
  Medium = 100,
  High = 1000,
}

const enum NavigateMode { Pan = 0, Look = 1, Travel = 2 }

/* eslint-enable no-restricted-syntax */

// dampen an inertia vector according to tool settings
const inertialDampen = (pt: Vector3d) => {
  pt.scaleInPlace(Geometry.clamp(ToolSettings.viewingInertia.damping, .75, .999));
};

/** An InteractiveTool that manipulates a view.
 * @public
 */
export abstract class ViewTool extends InteractiveTool {
  public static translate(val: string) { return CoreTools.translate(`View.${val}`); }

  public inDynamicUpdate = false;
  public beginDynamicUpdate() { this.inDynamicUpdate = true; }
  public endDynamicUpdate() { this.inDynamicUpdate = false; }
  public override run(..._args: any[]): boolean {
    const toolAdmin = IModelApp.toolAdmin;
    if (undefined !== this.viewport && this.viewport === toolAdmin.markupView) {
      IModelApp.notifications.outputPromptByKey("Viewing.NotDuringMarkup");
      return false;
    }

    if (!toolAdmin.onInstallTool(this))
      return false;

    toolAdmin.startViewTool(this);
    toolAdmin.onPostInstallTool(this);
    return true;
  }

  public constructor(public viewport?: ScreenViewport) {
    super();
  }
  public override async onResetButtonUp(_ev: BeButtonEvent) {
    this.exitTool();
    return EventHandled.Yes;
  }

  /** Do not override. */
  public exitTool(): void { IModelApp.toolAdmin.exitViewTool(); }
  public static showPrompt(prompt: string) {
    IModelApp.notifications.outputPrompt(ViewTool.translate(prompt));
  }
}

/** @internal */
export abstract class ViewingToolHandle {
  protected readonly _lastPtNpc = new Point3d();
  protected _depthPoint?: Point3d;

  constructor(public viewTool: ViewManip) {
    this._depthPoint = undefined;
  }
  public onReinitialize(): void { }
  public onCleanup(): void { }
  public focusOut(): void { }
  public motion(_ev: BeButtonEvent): boolean { return false; }
  public checkOneShot(): boolean { return true; }
  public getHandleCursor(): string { return "default"; }
  public abstract doManipulation(ev: BeButtonEvent, inDynamics: boolean): boolean;
  public abstract firstPoint(ev: BeButtonEvent): boolean;
  public abstract testHandleForHit(ptScreen: Point3d, out: { distance: number, priority: ViewManipPriority }): boolean;
  public abstract get handleType(): ViewHandleType;
  public focusIn(): void { IModelApp.toolAdmin.setCursor(this.getHandleCursor()); }
  public drawHandle(_context: DecorateContext, _hasFocus: boolean): void { }
  public onWheel(_ev: BeWheelEvent): boolean { return false; }
  public onTouchStart(_ev: BeTouchEvent): boolean { return false; }
  public onTouchEnd(_ev: BeTouchEvent): boolean { return false; }
  public onTouchComplete(_ev: BeTouchEvent): boolean { return false; }
  public onTouchCancel(_ev: BeTouchEvent): boolean { return false; }
  public onTouchMove(_ev: BeTouchEvent): boolean { return false; }
  public onTouchMoveStart(_ev: BeTouchEvent, _startEv: BeTouchEvent): boolean { return false; }
  public onTouchTap(_ev: BeTouchEvent): boolean { return false; }
  public onKeyTransition(_wentDown: boolean, _keyEvent: KeyboardEvent): boolean { return false; }
  public onModifierKeyTransition(_wentDown: boolean, _modifier: BeModifierKeys, _event: KeyboardEvent): boolean { return false; }
  public needDepthPoint(_ev: BeButtonEvent, _isPreview: boolean): boolean { return false; }
  public adjustDepthPoint(isValid: boolean, _vp: Viewport, _plane: Plane3dByOriginAndUnitNormal, source: DepthPointSource): boolean {
    switch (source) {
      case DepthPointSource.Geometry:
      case DepthPointSource.Model:
      case DepthPointSource.BackgroundMap:
      case DepthPointSource.GroundPlane:
      case DepthPointSource.Grid:
      case DepthPointSource.Map:
        return isValid; // Sources with visible geometry/graphics are considered valid by default...
      default:
        return false; // Sources without visible geometry/graphics are NOT considered valid by default...
    }
  }
  protected pickDepthPoint(ev: BeButtonEvent) {
    this._depthPoint = this.viewTool.pickDepthPoint(ev);
  }
  // if we have a valid depth point, set the focus distance to
  protected changeFocusFromDepthPoint() {
    if (undefined !== this._depthPoint) {
      const view = this.viewTool.viewport!.view;
      if (view.isCameraEnabled())
        view.changeFocusFromPoint(this._depthPoint); // set the focus distance to the depth point
    }
  }
}

/** @internal */
export class ViewHandleArray {
  public handles: ViewingToolHandle[] = [];
  public focus = -1;
  public focusDrag = false;
  public hitHandleIndex = 0;
  constructor(public viewTool: ViewManip) { }

  public empty() {
    this.focus = -1;
    this.focusDrag = false;
    this.hitHandleIndex = -1; // setting to -1 will result in onReinitialize getting called before testHit which sets the hit index
    this.handles.length = 0;
  }

  public get count(): number { return this.handles.length; }
  public get hitHandle(): ViewingToolHandle | undefined { return this.getByIndex(this.hitHandleIndex); }
  public get focusHandle(): ViewingToolHandle | undefined { return this.getByIndex(this.focus); }
  public add(handle: ViewingToolHandle): void { this.handles.push(handle); }
  public getByIndex(index: number): ViewingToolHandle | undefined { return (index >= 0 && index < this.count) ? this.handles[index] : undefined; }
  public focusHitHandle(): void { this.setFocus(this.hitHandleIndex); }

  public testHit(ptScreen: Point3d, forced = ViewHandleType.None): boolean {
    this.hitHandleIndex = -1;
    const data = { distance: 0.0, priority: ViewManipPriority.Normal };
    let minDistance = 0.0;
    let minDistValid = false;
    let highestPriority = ViewManipPriority.Low;
    let nearestHitHandle: ViewingToolHandle | undefined;

    for (let i = 0; i < this.count; i++) {
      data.priority = ViewManipPriority.Normal;
      const handle = this.handles[i];

      if (forced) {
        if (handle.handleType === forced) {
          this.hitHandleIndex = i;
          return true;
        }
      } else if (handle.testHandleForHit(ptScreen, data)) {
        if (data.priority >= highestPriority) {
          if (data.priority > highestPriority)
            minDistValid = false;

          highestPriority = data.priority;

          if (!minDistValid || (data.distance < minDistance)) {
            minDistValid = true;
            minDistance = data.distance;
            nearestHitHandle = handle;
            this.hitHandleIndex = i;
          }
        }
      }
    }
    return undefined !== nearestHitHandle;
  }

  public drawHandles(context: DecorateContext): void {
    if (0 === this.count)
      return;

    // all handle objects must draw themselves
    for (let i = 0; i < this.count; ++i) {
      if (i !== this.hitHandleIndex) {
        const handle = this.handles[i];
        handle.drawHandle(context, this.focus === i);
      }
    }

    // draw the hit handle last
    if (-1 !== this.hitHandleIndex) {
      const handle = this.handles[this.hitHandleIndex];
      handle.drawHandle(context, this.focus === this.hitHandleIndex);
    }
  }

  public setFocus(index: number): void {
    if (this.focus === index && (this.focusDrag === this.viewTool.inHandleModify))
      return;

    let focusHandle: ViewingToolHandle | undefined;
    if (this.focus >= 0) {
      focusHandle = this.getByIndex(this.focus);
      if (focusHandle)
        focusHandle.focusOut();
    }

    if (index >= 0) {
      focusHandle = this.getByIndex(index);
      if (focusHandle)
        focusHandle.focusIn();
    }

    this.focus = index;
    this.focusDrag = this.viewTool.inHandleModify;

    const vp = this.viewTool.viewport;
    if (undefined !== vp)
      vp.invalidateDecorations();
  }

  public onReinitialize(): void { this.handles.forEach((handle) => handle.onReinitialize()); }
  public onCleanup(): void { this.handles.forEach((handle) => handle.onCleanup()); }
  public motion(ev: BeButtonEvent): void { this.handles.forEach((handle) => handle.motion(ev)); }
  public onWheel(ev: BeWheelEvent): boolean { let preventDefault = false; this.handles.forEach((handle) => { if (handle.onWheel(ev)) preventDefault = true; }); return preventDefault; }

  /** determine whether a handle of a specific type exists */
  public hasHandle(handleType: ViewHandleType): boolean { return this.handles.some((handle) => handle.handleType === handleType); }
}

/** Base class for tools that manipulate the frustum of a Viewport.
 * @public
 */
export abstract class ViewManip extends ViewTool {
  /** @internal */
  public viewHandles: ViewHandleArray;
  public frustumValid = false; // unused
  public readonly targetCenterWorld = new Point3d();
  public inHandleModify = false;
  public isDragging = false;
  public targetCenterValid = false;
  public targetCenterLocked = false;
  public nPts = 0;
  /** @internal */
  public forcedHandle = ViewHandleType.None;
  /** @internal */
  protected _depthPreview?: { testPoint: Point3d, pickRadius: number, plane: Plane3dByOriginAndUnitNormal, source: DepthPointSource, isDefaultDepth: boolean, sourceId?: string };
  /** @internal */
  protected _startPose?: ViewPose;

  constructor(viewport: ScreenViewport | undefined, public handleMask: number, public oneShot: boolean, public isDraggingRequired: boolean = false) {
    super(viewport);
    this.viewHandles = new ViewHandleArray(this);
    this.changeViewport(viewport);
  }

  public override decorate(context: DecorateContext): void {
    this.viewHandles.drawHandles(context);
    this.previewDepthPoint(context);
  }

  /** @internal */
  public previewDepthPoint(context: DecorateContext): void {
    if (undefined === this._depthPreview)
      return;

    const cursorVp = IModelApp.toolAdmin.cursorView;
    if (cursorVp !== context.viewport)
      return;

    let origin = this._depthPreview.plane.getOriginRef();
    let normal = this._depthPreview.plane.getNormalRef();

    if (this._depthPreview.isDefaultDepth) {
      origin = cursorVp.worldToView(origin); origin.z = 0.0; cursorVp.viewToWorld(origin, origin); // Avoid getting clipped out in z...
      normal = context.viewport.view.getZVector(); // Always draw circle for invalid depth point oriented to view...
    }

    const pixelSize = context.viewport.getPixelSizeAtPoint(origin);
    const skew = context.viewport.view.getAspectRatioSkew();
    const radius = this._depthPreview.pickRadius * pixelSize;
    const rMatrix = Matrix3d.createRigidHeadsUp(normal);
    const ellipse = Arc3d.createScaledXYColumns(origin, rMatrix, radius, radius / skew, AngleSweep.create360());
    const colorBase = (this._depthPreview.isDefaultDepth ? ColorDef.red : (DepthPointSource.Geometry === this._depthPreview.source ? ColorDef.green : context.viewport.hilite.color));
    const colorLine = EditManipulator.HandleUtils.adjustForBackgroundColor(colorBase, cursorVp).withTransparency(50);
    const colorFill = colorLine.withTransparency(200);

    const builder = context.createGraphicBuilder(GraphicType.WorldOverlay);
    builder.setSymbology(colorLine, colorFill, 1, this._depthPreview.isDefaultDepth ? LinePixels.Code2 : LinePixels.Solid);
    builder.addArc(ellipse, true, true);
    builder.addArc(ellipse, false, false);
    context.addDecorationFromBuilder(builder);

    ViewTargetCenter.drawCross(context, origin, this._depthPreview.pickRadius * 0.5, false);
  }

  /** @internal */
  public getDepthPointGeometryId(): string | undefined {
    if (undefined === this._depthPreview)
      return undefined;
    return (DepthPointSource.Geometry === this._depthPreview.source ? this._depthPreview.sourceId : undefined);
  }

  /** @internal */
  public clearDepthPoint(): boolean {
    if (undefined === this._depthPreview)
      return false;
    this._depthPreview = undefined;
    return true;
  }

  /** @internal */
  public pickDepthPoint(ev: BeButtonEvent, isPreview: boolean = false): Point3d | undefined {
    if (!isPreview && ev.viewport && undefined !== this.getDepthPointGeometryId())
      ev.viewport.flashedId = undefined;

    this.clearDepthPoint();
    if (isPreview && this.inDynamicUpdate)
      return undefined;

    const vp = ev.viewport;
    if (undefined === vp || undefined === this.viewHandles.hitHandle || !this.viewHandles.hitHandle.needDepthPoint(ev, isPreview))
      return undefined;

    const pickRadiusPixels = vp.pixelsFromInches(ToolSettings.viewToolPickRadiusInches);
    const result = vp.pickDepthPoint(ev.rawPoint, pickRadiusPixels);
    let isValidDepth = false;

    switch (result.source) {
      case DepthPointSource.Geometry:
      case DepthPointSource.Model:
      case DepthPointSource.Map:
        isValidDepth = true;
        break;
      case DepthPointSource.BackgroundMap:
      case DepthPointSource.GroundPlane:
      case DepthPointSource.Grid:
      case DepthPointSource.ACS:
      case DepthPointSource.TargetPoint:
        const npcPt = vp.worldToNpc(result.plane.getOriginRef());
        isValidDepth = !(npcPt.z < 0.0 || npcPt.z > 1.0);
        break;
    }

    // Allow handle to reject depth depending on source and to set a default depth point when invalid...
    isValidDepth = this.viewHandles.hitHandle.adjustDepthPoint(isValidDepth, vp, result.plane, result.source);

    if (isPreview)
      this._depthPreview = { testPoint: ev.rawPoint, pickRadius: pickRadiusPixels, plane: result.plane, source: result.source, isDefaultDepth: !isValidDepth, sourceId: result.sourceId };

    return (isValidDepth || isPreview ? result.plane.getOriginRef() : undefined);
  }

  public override onReinitialize(): void {
    if (undefined !== this.viewport) {
      this.viewport.synchWithView(); // make sure we store any changes in view undo buffer.
      this.viewHandles.setFocus(-1);
    }

    this.nPts = 0;
    this.inHandleModify = false;
    this.inDynamicUpdate = false;
    this._startPose = undefined;

    this.viewHandles.onReinitialize();
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    // Tool was started in "drag required" mode, don't advance tool state and wait to see if we get the start drag event.
    if ((0 === this.nPts && this.isDraggingRequired && !this.isDragging) || undefined === ev.viewport)
      return EventHandled.No;

    switch (this.nPts) {
      case 0:
        this.changeViewport(ev.viewport);
        if (this.processFirstPoint(ev))
          this.nPts = 1;
        break;
      case 1:
        this.nPts = 2;
        break;
    }

    if (this.nPts > 1) {
      this.inDynamicUpdate = false;
      if (this.processPoint(ev, false) && this.oneShot)
        this.exitTool();
      else
        this.onReinitialize();
    }

    return EventHandled.Yes;
  }

  public override async onDataButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this.nPts <= 1 && this.isDraggingRequired && !this.isDragging && this.oneShot)
      this.exitTool();

    return EventHandled.No;
  }

  public override async onMouseWheel(inputEv: BeWheelEvent): Promise<EventHandled> {
    const ev = inputEv.clone();
    if (this.viewHandles.onWheel(ev)) // notify handles that wheel has rolled.
      return EventHandled.Yes;

    IModelApp.toolAdmin.processWheelEvent(ev, false); // eslint-disable-line @typescript-eslint/no-floating-promises
    return EventHandled.Yes;
  }

  /** @internal */
  public async startHandleDrag(ev: BeButtonEvent, forcedHandle?: ViewHandleType): Promise<EventHandled> {
    if (this.inHandleModify)
      return EventHandled.No; // If already changing the view reject the request...

    if (undefined !== forcedHandle) {
      if (!this.viewHandles.hasHandle(forcedHandle))
        return EventHandled.No; // If requested handle isn't present reject the request...
      this.forcedHandle = forcedHandle;
    }

    this.receivedDownEvent = true; // Request up events even though we may not have gotten the down event...
    this.isDragging = true;

    if (0 === this.nPts)
      this.onDataButtonDown(ev); // eslint-disable-line @typescript-eslint/no-floating-promises

    return EventHandled.Yes;
  }

  public override async onMouseStartDrag(ev: BeButtonEvent): Promise<EventHandled> {
    if (BeButton.Data !== ev.button)
      return EventHandled.No;
    return this.startHandleDrag(ev);
  }

  public override async onMouseEndDrag(ev: BeButtonEvent): Promise<EventHandled> {
    // NOTE: To support startHandleDrag being called by IdleTool for middle button drag, check inHandleModify and not the button type...
    if (!this.inHandleModify)
      return EventHandled.No;
    this.isDragging = false;
    return (0 === this.nPts) ? EventHandled.Yes : this.onDataButtonDown(ev);
  }

  public override async onMouseMotion(ev: BeButtonEvent) {
    if (0 === this.nPts && this.viewHandles.testHit(ev.viewPoint))
      this.viewHandles.focusHitHandle();

    if (0 !== this.nPts)
      this.processPoint(ev, true);

    this.viewHandles.motion(ev);

    const prevSourceId = this.getDepthPointGeometryId();
    const showDepthChanged = (undefined !== this.pickDepthPoint(ev, true) || this.clearDepthPoint());
    if (ev.viewport && (showDepthChanged || prevSourceId)) {
      const currSourceId = this.getDepthPointGeometryId();
      if (currSourceId !== prevSourceId)
        ev.viewport.flashedId = currSourceId;

      ev.viewport.invalidateDecorations();
    }
  }

  public override async onTouchStart(ev: BeTouchEvent): Promise<void> {
    if (0 === this.nPts && this.viewHandles.testHit(ev.viewPoint))
      this.viewHandles.focusHitHandle();
    const focusHandle = this.viewHandles.focusHandle;
    if (undefined !== focusHandle)
      focusHandle.onTouchStart(ev);
  }

  public override async onTouchEnd(ev: BeTouchEvent): Promise<void> {
    const focusHandle = this.viewHandles.focusHandle;
    if (undefined !== focusHandle)
      focusHandle.onTouchEnd(ev);
  }

  public override async onTouchComplete(ev: BeTouchEvent): Promise<void> {
    const focusHandle = this.viewHandles.focusHandle;
    if (undefined !== focusHandle && focusHandle.onTouchComplete(ev))
      return;
    if (this.inHandleModify)
      return IModelApp.toolAdmin.convertTouchEndToButtonUp(ev);
  }

  public override async onTouchCancel(ev: BeTouchEvent): Promise<void> {
    const focusHandle = this.viewHandles.focusHandle;
    if (undefined !== focusHandle && focusHandle.onTouchCancel(ev))
      return;
    if (this.inHandleModify)
      return IModelApp.toolAdmin.convertTouchEndToButtonUp(ev, BeButton.Reset);
  }

  public override async onTouchMove(ev: BeTouchEvent): Promise<void> {
    const focusHandle = this.viewHandles.focusHandle;
    if (undefined !== focusHandle && focusHandle.onTouchMove(ev))
      return;
    if (this.inHandleModify)
      return IModelApp.toolAdmin.convertTouchMoveToMotion(ev);
  }

  public override async onTouchMoveStart(ev: BeTouchEvent, startEv: BeTouchEvent): Promise<EventHandled> {
    const focusHandle = this.viewHandles.focusHandle;
    if (undefined !== focusHandle && focusHandle.onTouchMoveStart(ev, startEv))
      return EventHandled.Yes;
    if (!this.inHandleModify && startEv.isSingleTouch)
      await IModelApp.toolAdmin.convertTouchMoveStartToButtonDownAndMotion(startEv, ev);
    return this.inHandleModify ? EventHandled.Yes : EventHandled.No;
  }

  public override async onTouchTap(ev: BeTouchEvent): Promise<EventHandled> {
    const focusHandle = this.viewHandles.focusHandle;
    if (undefined !== focusHandle && focusHandle.onTouchTap(ev))
      return EventHandled.Yes;
    return ev.isSingleTap ? EventHandled.Yes : EventHandled.No; // Prevent IdleTool from converting single tap into data button down/up...
  }

  public override async onKeyTransition(wentDown: boolean, keyEvent: KeyboardEvent): Promise<EventHandled> {
    const focusHandle = this.viewHandles.focusHandle;
    return (undefined !== focusHandle && focusHandle.onKeyTransition(wentDown, keyEvent) ? EventHandled.Yes : EventHandled.No);
  }

  public override async onModifierKeyTransition(wentDown: boolean, modifier: BeModifierKeys, event: KeyboardEvent): Promise<EventHandled> {
    const focusHandle = this.viewHandles.focusHandle;
    return (undefined !== focusHandle && focusHandle.onModifierKeyTransition(wentDown, modifier, event) ? EventHandled.Yes : EventHandled.No);
  }

  public override onPostInstall(): void {
    super.onPostInstall();
    this.onReinitialize(); // Call onReinitialize now that tool is installed.
  }

  /** @beta */
  public provideToolAssistance(mainInstrKey: string, additionalInstr?: ToolAssistanceInstruction[]): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, ViewTool.translate(mainInstrKey));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    const acceptMsg = CoreTools.translate("ElementSet.Inputs.AcceptPoint");
    const rejectMsg = CoreTools.translate("ElementSet.Inputs.Exit");
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchDrag, acceptMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, acceptMsg, false, ToolAssistanceInputMethod.Mouse));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, rejectMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, rejectMsg, false, ToolAssistanceInputMethod.Mouse));

    if (undefined !== additionalInstr) {
      for (const instr of additionalInstr) {
        if (ToolAssistanceInputMethod.Touch === instr.inputMethod)
          touchInstructions.push(instr);
        else
          mouseInstructions.push(instr);
      }
    }

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  public override onCleanup(): void {
    let restorePrevious = false;

    if (this.inDynamicUpdate) {
      this.endDynamicUpdate();
      restorePrevious = true;
    }

    const vp = this.viewport;
    if (undefined !== vp) {
      if (restorePrevious && this._startPose) {
        vp.view.applyPose(this._startPose);
        vp.animateFrustumChange();
      } else {
        vp.synchWithView();
      }

      vp.invalidateDecorations();
    }
    this.viewHandles.onCleanup();
    this.viewHandles.empty();
  }

  /**
   * Set the center of rotation for rotate handle.
   * @param pt the new target point in world coordinates
   * @param lockTarget consider the target point locked for this tool instance
   * @param saveTarget save this target point for use between tool instances
   */
  public setTargetCenterWorld(pt: Point3d, lockTarget: boolean, saveTarget: boolean) {
    this.targetCenterWorld.setFrom(pt);
    this.targetCenterValid = true;
    this.targetCenterLocked = lockTarget;

    if (!this.viewport)
      return;

    if (!this.viewport.view.allow3dManipulations())
      this.targetCenterWorld.z = 0.0;

    this.viewport.viewCmdTargetCenter = (saveTarget ? pt : undefined);
  }

  public updateTargetCenter(): void {
    const vp = this.viewport;
    if (!vp)
      return;

    if (this.targetCenterValid) {
      if (this.inHandleModify)
        return;
      if (IModelApp.tentativePoint.isActive) {
        let tentPt = IModelApp.tentativePoint.getPoint();
        if (!IModelApp.tentativePoint.isSnapped) {
          if (undefined === this._depthPreview && this.targetCenterLocked) {
            const ev = new BeButtonEvent();
            IModelApp.toolAdmin.fillEventFromCursorLocation(ev);
            this.targetCenterLocked = false; // Depth preview won't be active (or requested) if target is currently locked...
            this.pickDepthPoint(ev, true);
          }
          if (undefined !== this._depthPreview && !this._depthPreview.isDefaultDepth)
            tentPt = this._depthPreview.plane.getOriginRef(); // Prefer valid depth preview point to unsnapped tentative location...
        }
        this.setTargetCenterWorld(tentPt, true, false);
        IModelApp.tentativePoint.clear(true); // Clear tentative, there won't be a datapoint to accept...
      }
      return;
    }

    if (IModelApp.tentativePoint.isActive)
      return this.setTargetCenterWorld(IModelApp.tentativePoint.getPoint(), true, false);

    if (TentativeOrAccuSnap.isHot)
      return this.setTargetCenterWorld(TentativeOrAccuSnap.getCurrentPoint(), true, false);

    if (vp.viewCmdTargetCenter && this.isPointVisible(vp.viewCmdTargetCenter))
      return this.setTargetCenterWorld(vp.viewCmdTargetCenter, true, true);

    return this.setTargetCenterWorld(ViewManip.getDefaultTargetPointWorld(vp), false, false);
  }

  public processFirstPoint(ev: BeButtonEvent) {
    const forcedHandle = this.forcedHandle;
    this.forcedHandle = ViewHandleType.None;

    if (this.viewHandles.testHit(ev.viewPoint, forcedHandle)) {
      this.inHandleModify = true;
      this.viewHandles.focusHitHandle();
      const handle = this.viewHandles.hitHandle;
      if (undefined !== handle && !handle.firstPoint(ev))
        return false;
    }
    this._startPose = this.viewport ? this.viewport.view.savePose() : undefined;
    return true;
  }

  public processPoint(ev: BeButtonEvent, inDynamics: boolean) {
    const hitHandle = this.viewHandles.hitHandle;
    if (undefined === hitHandle)
      return true;

    const doUpdate = hitHandle.doManipulation(ev, inDynamics);
    return inDynamics || (doUpdate && hitHandle.checkOneShot());
  }

  public lensAngleMatches(angle: Angle, tolerance: number): boolean {
    const cameraView = this.viewport!.view;
    return !cameraView.is3d() ? false : Math.abs(cameraView.calcLensAngle().radians - angle.radians) < tolerance;
  }

  public get isZUp() {
    const view = this.viewport!.view;
    const viewX = view.getXVector();
    const viewY = view.getXVector();
    const zVec = Vector3d.unitZ();
    return (Math.abs(zVec.dotProduct(viewY)) > 0.99 && Math.abs(zVec.dotProduct(viewX)) < 0.01);
  }

  public static getFocusPlaneNpc(vp: Viewport): number {
    const pt = vp.worldToNpc(vp.view.getTargetPoint());
    return (pt.z < 0.0 || pt.z > 1.0) ? 0.5 : pt.z;
  }

  public static getDefaultTargetPointWorld(vp: Viewport): Point3d {
    if (!vp.view.allow3dManipulations())
      return vp.npcToWorld(NpcCenter);

    const targetPoint = vp.view.getTargetPoint();
    const targetPointNpc = vp.worldToNpc(targetPoint);

    if (targetPointNpc.z < 0.0 || targetPointNpc.z > 1.0) {
      targetPointNpc.z = 0.5;
      vp.npcToWorld(targetPointNpc, targetPoint);
    }

    return targetPoint;
  }

  /** Determine whether the supplied point is visible in this Viewport. */
  public isPointVisible(testPt: Point3d): boolean {
    const vp = this.viewport;
    if (!vp)
      return false;

    return vp.isPointVisibleXY(testPt);
  }

  /** @internal */
  public static computeFitRange(viewport: ScreenViewport): Range3d {
    const range = viewport.computeViewRange();
    const clip = (viewport.viewFlags.clipVolume ? viewport.view.getViewClip() : undefined);
    if (undefined !== clip) {
      const clipRange = ClipUtilities.rangeOfClipperIntersectionWithRange(clip, range);
      if (!clipRange.isNull)
        range.setFrom(clipRange);
    }
    return range;
  }

  public static fitView(viewport: ScreenViewport, animateFrustumChange: boolean, options?: ViewChangeOptions) {
    const range = this.computeFitRange(viewport);
    const aspect = viewport.viewRect.aspect;
    viewport.view.lookAtVolume(range, aspect, options);
    viewport.synchWithView({ animateFrustumChange });
    viewport.viewCmdTargetCenter = undefined;
  }

  /** @internal */
  public static fitViewWithGlobeAnimation(viewport: ScreenViewport, animateFrustumChange: boolean, options?: ViewChangeOptions) {
    const range = this.computeFitRange(viewport);

    if (animateFrustumChange && viewport.isCameraOn && viewport.viewingGlobe) {
      const view3d = viewport.view as ViewState3d;
      const cartographicCenter = view3d.rootToCartographic(range.center);
      if (undefined !== cartographicCenter) {
        const cartographicArea = rangeToCartographicArea(view3d, range);
        (async () => {
          await viewport.animateFlyoverToGlobalLocation({ center: cartographicCenter, area: cartographicArea }); // NOTE: Turns on camera...which is why we checked that it was already on...
          viewport.viewCmdTargetCenter = undefined;
        })().catch(() => { });
        return;
      }
    }

    const aspect = viewport.viewRect.aspect;
    viewport.view.lookAtVolume(range, aspect, options);
    viewport.synchWithView({ animateFrustumChange });
    viewport.viewCmdTargetCenter = undefined;
  }

  public static async zoomToAlwaysDrawnExclusive(viewport: ScreenViewport, options?: ViewChangeOptions): Promise<boolean> {
    if (!viewport.isAlwaysDrawnExclusive || undefined === viewport.alwaysDrawn || 0 === viewport.alwaysDrawn.size)
      return false;
    await viewport.zoomToElements(viewport.alwaysDrawn, options);
    return true;
  }

  public setCameraLensAngle(lensAngle: Angle, retainEyePoint: boolean): ViewStatus {
    const vp = this.viewport;
    if (!vp)
      return ViewStatus.InvalidViewport;

    const view = vp.view;
    if (!view.is3d() || !view.allow3dManipulations())
      return ViewStatus.InvalidViewport;

    const result = (retainEyePoint && view.isCameraOn) ?
      view.lookAtUsingLensAngle(view.getEyePoint(), view.getTargetPoint(), view.getYVector(), lensAngle) :
      vp.turnCameraOn(lensAngle);

    if (result !== ViewStatus.Success)
      return result;

    vp.setupFromView();
    return ViewStatus.Success;
  }

  public enforceZUp(pivotPoint: Point3d) {
    const vp = this.viewport;
    if (!vp || this.isZUp)
      return false;

    const viewY = vp.view.getYVector();
    const rotMatrix = Matrix3d.createRotationVectorToVector(viewY, Vector3d.unitZ());
    if (!rotMatrix)
      return false;

    const transform = Transform.createFixedPointAndMatrix(pivotPoint, rotMatrix);
    const frust = vp.getWorldFrustum();
    frust.multiply(transform);
    vp.setupViewFromFrustum(frust);
    return true;
  }

  public changeViewport(vp?: ScreenViewport): void {
    if (vp === this.viewport && 0 !== this.viewHandles.count) // If viewport isn't really changing do nothing...
      return;

    if (this.viewport)
      this.viewport.invalidateDecorations(); // Remove decorations from current viewport...

    this.viewport = vp;
    this.targetCenterValid = false;
    if (this.handleMask & (ViewHandleType.Rotate | ViewHandleType.TargetCenter))
      this.updateTargetCenter();

    this.viewHandles.empty();
    if (this.handleMask & ViewHandleType.Rotate)
      this.viewHandles.add(new ViewRotate(this));

    if (this.handleMask & ViewHandleType.TargetCenter)
      this.viewHandles.add(new ViewTargetCenter(this));

    if (this.handleMask & ViewHandleType.Pan)
      this.viewHandles.add(new ViewPan(this));

    if (this.handleMask & ViewHandleType.Scroll)
      this.viewHandles.add(new ViewScroll(this));

    if (this.handleMask & ViewHandleType.Zoom)
      this.viewHandles.add(new ViewZoom(this));

    if (this.handleMask & ViewHandleType.Walk)
      this.viewHandles.add(new ViewWalk(this));

    if (this.handleMask & ViewHandleType.Fly)
      this.viewHandles.add(new ViewFly(this));

    if (this.handleMask & ViewHandleType.Look)
      this.viewHandles.add(new ViewLook(this));

    if (this.handleMask & ViewHandleType.LookAndMove)
      this.viewHandles.add(new ViewLookAndMove(this));
  }
}

/** ViewingToolHandle for modifying the view's target point for operations like rotate */
class ViewTargetCenter extends ViewingToolHandle {
  public get handleType() { return ViewHandleType.TargetCenter; }
  public override checkOneShot(): boolean { return false; } // Don't exit tool after moving target in single-shot mode...
  public firstPoint(ev: BeButtonEvent) {
    if (undefined === ev.viewport)
      return false;
    ev.viewport.viewCmdTargetCenter = undefined; // Clear current saved target, must accept a new location with ctrl...
    return true;
  }

  public testHandleForHit(ptScreen: Point3d, out: { distance: number, priority: ViewManipPriority }): boolean {
    if (this.viewTool.isDraggingRequired)
      return false; // Target center handle is not movable in this mode, but it's still nice to display the point we're rotating about...

    const targetPt = this.viewTool.viewport!.worldToView(this.viewTool.targetCenterWorld);
    const distance = targetPt.distanceXY(ptScreen);
    const locateThreshold = this.viewTool.viewport!.pixelsFromInches(0.15);

    if (distance > locateThreshold)
      return false;

    out.distance = distance;
    out.priority = ViewManipPriority.High;
    return true;
  }

  /** @internal */
  public static drawCross(context: DecorateContext, worldPoint: Point3d, sizePixels: number, hasFocus: boolean): void {
    const crossSize = Math.floor(sizePixels) + 0.5;
    const outlineSize = crossSize + 1;
    const position = context.viewport.worldToView(worldPoint); position.x = Math.floor(position.x) + 0.5; position.y = Math.floor(position.y) + 0.5;
    const drawDecoration = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,.5)";
      ctx.lineWidth = hasFocus ? 5 : 3;
      ctx.moveTo(-outlineSize, 0);
      ctx.lineTo(outlineSize, 0);
      ctx.moveTo(0, -outlineSize);
      ctx.lineTo(0, outlineSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = "white";
      ctx.lineWidth = hasFocus ? 3 : 1;
      ctx.shadowColor = "black";
      ctx.shadowBlur = hasFocus ? 7 : 5;
      ctx.moveTo(-crossSize, 0);
      ctx.lineTo(crossSize, 0);
      ctx.moveTo(0, -crossSize);
      ctx.lineTo(0, crossSize);
      ctx.stroke();
    };
    context.addCanvasDecoration({ position, drawDecoration });
  }

  public override drawHandle(context: DecorateContext, hasFocus: boolean): void {
    if (context.viewport !== this.viewTool.viewport)
      return;

    if (!this.viewTool.targetCenterLocked && !this.viewTool.inHandleModify)
      return; // Don't display default target center, will be updated to use pick point on element...

    if (hasFocus && this.viewTool.inHandleModify)
      return; // Cross display handled by preview depth point...

    let sizeInches = 0.2;
    if (!hasFocus && this.viewTool.inHandleModify) {
      const hitHandle = this.viewTool.viewHandles.hitHandle;
      if (undefined !== hitHandle && ViewHandleType.Rotate !== hitHandle.handleType)
        return; // Only display when modifying another handle if that handle is rotate (not pan)...
      sizeInches = 0.1; // Display small target when dragging...
    }

    const crossSize = context.viewport.pixelsFromInches(sizeInches);
    ViewTargetCenter.drawCross(context, this.viewTool.targetCenterWorld, crossSize, hasFocus);
  }

  public doManipulation(ev: BeButtonEvent, inDynamics: boolean) {
    if (inDynamics || ev.viewport !== this.viewTool.viewport)
      return false;

    this.pickDepthPoint(ev);
    this.viewTool.setTargetCenterWorld(undefined !== this._depthPoint ? this._depthPoint : ev.point, true, ev.isControlKey); // Lock target for just this tool instance, only save if control is down...

    return false; // false means don't do screen update
  }

  /** @internal */
  public override needDepthPoint(_ev: BeButtonEvent, _isPreview: boolean): boolean {
    const focusHandle = this.viewTool.inHandleModify ? this.viewTool.viewHandles.focusHandle : undefined;
    return (undefined !== focusHandle && ViewHandleType.TargetCenter === focusHandle.handleType);
  }
}

/** A ViewingToolHandle with inertia.
 * If the handle is used with *throwing action* (mouse is moving when button goes up or via a touch with movement).
 * it continues to move briefly causing the operation to continue.
 */
abstract class HandleWithInertia extends ViewingToolHandle implements Animator {
  protected _duration!: BeDuration;
  protected _end!: BeTimePoint;
  protected _inertiaVec?: Vector3d;

  public doManipulation(ev: BeButtonEvent, inDynamics: boolean): boolean {
    if (ToolSettings.viewingInertia.enabled && !inDynamics && undefined !== this._inertiaVec)
      return this.beginAnimation();

    const thisPtNpc = ev.viewport!.worldToNpc(ev.point);
    thisPtNpc.z = this._lastPtNpc.z;

    this._inertiaVec = undefined;
    if (this._lastPtNpc.isAlmostEqual(thisPtNpc, 1.0e-10))
      return true;

    this._inertiaVec = this._lastPtNpc.vectorTo(thisPtNpc);
    return this.perform(thisPtNpc);
  }

  /** Set this handle to become the Viewport's animator */
  protected beginAnimation() {
    this._duration = ToolSettings.viewingInertia.duration;
    if (this._duration.isTowardsFuture) { // ensure duration is towards future. Otherwise, don't start animation
      this._end = BeTimePoint.fromNow(this._duration);
      this.viewTool.viewport!.setAnimator(this);
    }
    return true;
  }

  /** Move this handle during the inertia duration */
  public animate(): boolean {
    if (undefined === this._inertiaVec)
      return true; // handle was removed

    // get the fraction of the inertia duration that remains. The decay is a combination of the number of iterations (see damping below)
    // and time. That way the handle slows down even if the framerate is lower.
    const remaining = ((this._end.milliseconds - BeTimePoint.now().milliseconds) / this._duration.milliseconds);
    const pt = this._lastPtNpc.plusScaled(this._inertiaVec, remaining);

    // if we're not moving any more, or if the duration has elapsed, we're done
    if (remaining <= 0 || (this._lastPtNpc.minus(pt).magnitudeSquared() < .000001)) {
      this.viewTool.viewport!.saveViewUndo();
      return true; // remove this as the animator
    }
    this.perform(pt); // perform the viewing operation
    inertialDampen(this._inertiaVec);
    return false;
  }

  public interrupt() { }
  protected abstract perform(thisPtNpc: Point3d): boolean;
}

/** ViewingToolHandle for performing the "pan view" operation */
class ViewPan extends HandleWithInertia {
  public get handleType() { return ViewHandleType.Pan; }
  public override getHandleCursor() { return this.viewTool.inHandleModify ? IModelApp.viewManager.grabbingCursor : IModelApp.viewManager.grabCursor; }

  public firstPoint(ev: BeButtonEvent) {
    const tool = this.viewTool;
    const vp = tool.viewport!;
    vp.worldToNpc(ev.point, this._lastPtNpc);

    this._inertiaVec = undefined;

    // if the camera is on, we need to find the element under the starting point to get the z
    if (this.needDepthPoint(ev, false)) {
      this.pickDepthPoint(ev);
      if (undefined !== this._depthPoint)
        vp.worldToNpc(this._depthPoint, this._lastPtNpc);
      else
        this._lastPtNpc.z = ViewManip.getFocusPlaneNpc(vp);
    }

    tool.beginDynamicUpdate();
    tool.provideToolAssistance("Pan.Prompts.NextPoint");
    return true;
  }

  public testHandleForHit(_ptScreen: Point3d, out: { distance: number, priority: ViewManipPriority }): boolean {
    out.distance = 0.0;
    out.priority = ViewManipPriority.Low;
    return true;
  }

  /** perform the view pan operation */
  protected perform(thisPtNpc: Point3d) {
    const tool = this.viewTool;
    const vp = tool.viewport!;
    const view = vp.view;
    const dist = vp.npcToWorld(thisPtNpc).vectorTo(vp.npcToWorld(this._lastPtNpc));

    if (view.is3d()) {
      if (ViewStatus.Success !== view.moveCameraWorld(dist))
        return false;
      this.changeFocusFromDepthPoint(); // if we have a valid depth point, set it focus distance from it
    } else {
      view.setOrigin(view.getOrigin().plus(dist));
    }

    vp.setupFromView();
    this._lastPtNpc.setFrom(thisPtNpc);
    return true;
  }

  /** @internal */
  public override needDepthPoint(ev: BeButtonEvent, _isPreview: boolean): boolean {
    return ev.viewport!.isCameraOn && CoordSource.User === ev.coordsFrom;
  }
}

/** ViewingToolHandle for performing the "rotate view" operation */
class ViewRotate extends HandleWithInertia {
  private readonly _frustum = new Frustum();
  private readonly _activeFrustum = new Frustum();
  private readonly _anchorPtNpc = new Point3d();
  public get handleType() { return ViewHandleType.Rotate; }
  public override getHandleCursor() { return IModelApp.viewManager.rotateCursor; }

  public testHandleForHit(_ptScreen: Point3d, out: { distance: number, priority: ViewManipPriority }): boolean {
    out.distance = 0.0;
    out.priority = ViewManipPriority.Medium; // Always prefer over pan handle which is only force enabled by IdleTool middle button action...
    return true;
  }

  public firstPoint(ev: BeButtonEvent) {
    this._inertiaVec = undefined;

    const tool = this.viewTool;
    const vp = ev.viewport!;

    this.pickDepthPoint(ev);
    if (undefined !== this._depthPoint)
      tool.setTargetCenterWorld(this._depthPoint, false, false);

    vp.worldToNpc(ev.rawPoint, this._anchorPtNpc);
    this._lastPtNpc.setFrom(this._anchorPtNpc);

    vp.getFrustum(CoordSystem.World, false, this._activeFrustum);
    this._frustum.setFrom(this._activeFrustum);

    tool.beginDynamicUpdate();
    this.viewTool.provideToolAssistance("Rotate.Prompts.NextPoint");
    return true;
  }

  public perform(ptNpc: Point3d): boolean {
    const tool = this.viewTool;
    const vp = tool.viewport!;

    if (this._anchorPtNpc.isAlmostEqual(ptNpc, 1.0e-2)) // too close to anchor pt
      ptNpc.setFrom(this._anchorPtNpc);

    const currentFrustum = vp.getFrustum(CoordSystem.World, false);
    const frustumChange = !currentFrustum.equals(this._activeFrustum);
    if (frustumChange)
      this._frustum.setFrom(currentFrustum);
    else {
      if (!vp.setupViewFromFrustum(this._frustum))
        return false;
    }

    const currPt = vp.npcToView(ptNpc);
    if (frustumChange)
      this._anchorPtNpc.setFrom(ptNpc);

    const view = vp.view;
    let angle: Angle;
    let worldAxis: Vector3d;
    const worldPt = tool.targetCenterWorld;
    if (!view.allow3dManipulations()) {
      const centerPt = vp.worldToView(worldPt);
      const firstPt = vp.npcToView(this._anchorPtNpc);
      const vector0 = Vector2d.createStartEnd(centerPt, firstPt);
      const vector1 = Vector2d.createStartEnd(centerPt, currPt);
      angle = vector0.angleTo(vector1);
      worldAxis = Vector3d.unitZ();
    } else {
      const viewRect = vp.viewRect;

      vp.npcToView(ptNpc, currPt);
      const firstPt = vp.npcToView(this._anchorPtNpc);

      const xDelta = (currPt.x - firstPt.x);
      const yDelta = (currPt.y - firstPt.y);

      // Movement in screen x == rotation about drawing Z (preserve up) or rotation about screen  Y...
      const xAxis = ToolSettings.preserveWorldUp && !vp.viewingGlobe ? (undefined !== this._depthPoint ? vp.view.getUpVector(this._depthPoint) : Vector3d.unitZ()) : vp.rotation.getRow(1);

      // Movement in screen y == rotation about screen X...
      const yAxis = vp.rotation.getRow(0);

      const xRMatrix = xDelta ? Matrix3d.createRotationAroundVector(xAxis, Angle.createRadians(Math.PI / (viewRect.width / xDelta)))! : Matrix3d.identity;
      const yRMatrix = yDelta ? Matrix3d.createRotationAroundVector(yAxis, Angle.createRadians(Math.PI / (viewRect.height / yDelta)))! : Matrix3d.identity;
      const worldRMatrix = yRMatrix.multiplyMatrixMatrix(xRMatrix);
      const result = worldRMatrix.getAxisAndAngleOfRotation();
      angle = Angle.createRadians(-result.angle.radians);
      worldAxis = result.axis;
    }

    const worldMatrix = Matrix3d.createRotationAroundVector(worldAxis, angle);
    if (undefined !== worldMatrix) {
      const worldTransform = Transform.createFixedPointAndMatrix(worldPt, worldMatrix);
      const frustum = this._frustum.transformBy(worldTransform);
      view.setupFromFrustum(frustum);
      this.changeFocusFromDepthPoint(); // if we have a valid depth point, set it focus distance from it
      vp.setupFromView();
    }

    vp.getWorldFrustum(this._activeFrustum);
    this._lastPtNpc.setFrom(ptNpc);

    return true;
  }

  public override onWheel(ev: BeWheelEvent): boolean {
    // When rotate is active, the mouse wheel should zoom about the target center when it's displayed...
    const tool = this.viewTool;
    if (tool.targetCenterLocked || tool.inHandleModify) {
      ev.point = tool.targetCenterWorld;
      ev.coordsFrom = CoordSource.Precision; // WheelEventProcessor.doZoom checks this to decide whether to use raw or adjusted point...
    }
    return false;
  }

  /** @internal */
  public override needDepthPoint(ev: BeButtonEvent, _isPreview: boolean): boolean {
    return (!this.viewTool.targetCenterLocked && ev.viewport!.view.allow3dManipulations());
  }

  /** @internal */
  public override adjustDepthPoint(isValid: boolean, vp: Viewport, plane: Plane3dByOriginAndUnitNormal, source: DepthPointSource): boolean {
    if (vp.viewingGlobe && this.viewTool.isPointVisible(vp.iModel.ecefLocation!.earthCenter)) {
      plane.getOriginRef().setFrom(vp.iModel.ecefLocation!.earthCenter);
      plane.getNormalRef().setFrom(vp.view.getZVector());
      return true;
    }
    if (super.adjustDepthPoint(isValid, vp, plane, source)) {
      if (DepthPointSource.Geometry === source && vp instanceof ScreenViewport) {
        // If we had hit something we might need to undo the model display transform of the hit.
        const hitDetail = vp.picker.getHit(0);
        if (undefined !== hitDetail && undefined !== hitDetail.modelId) {
          vp.view.transformPointByModelDisplayTransform(hitDetail.modelId, plane.getOriginRef(), false);
        }
      }
      return true;
    }
    plane.getOriginRef().setFrom(this.viewTool.targetCenterWorld);
    return false;
  }
}

/** ViewingToolHandle for performing the "look view" operation */
class ViewLook extends ViewingToolHandle {
  private _eyePoint = new Point3d();
  private _firstPtView = new Point3d();
  private _rotation = new Matrix3d();
  private _frustum = new Frustum();
  public get handleType() { return ViewHandleType.Look; }
  public override getHandleCursor(): string { return IModelApp.viewManager.lookCursor; }

  public testHandleForHit(_ptScreen: Point3d, out: { distance: number, priority: ViewManipPriority }): boolean {
    out.distance = 0.0;
    out.priority = ViewManipPriority.Medium; // Always prefer over pan handle which is only force enabled by IdleTool middle button action...
    return true;
  }

  public firstPoint(ev: BeButtonEvent) {
    const tool = this.viewTool;
    const vp = ev.viewport!;
    const view = vp.view;
    if (!view || !view.is3d() || !view.allow3dManipulations())
      return false;

    this._firstPtView.setFrom(ev.viewPoint);
    this._eyePoint.setFrom(view.getEyePoint());
    this._rotation.setFrom(vp.rotation);

    vp.getWorldFrustum(this._frustum);
    tool.beginDynamicUpdate();
    this.viewTool.provideToolAssistance("Look.Prompts.NextPoint");
    return true;
  }

  public override onWheel(_ev: BeWheelEvent): boolean {
    const tool = this.viewTool;
    if (!tool.inHandleModify)
      return false;
    tool.nPts = 0; // start over
    tool.inHandleModify = false;
    tool.inDynamicUpdate = false;
    tool.viewHandles.setFocus(-1);
    return false;
  }

  public doManipulation(ev: BeButtonEvent, _inDynamics: boolean): boolean {
    const tool = this.viewTool;
    const viewport = tool.viewport!;

    if (ev.viewport !== viewport)
      return false;

    const worldTransform = this.getLookTransform(viewport, this._firstPtView, ev.viewPoint);
    const frustum = this._frustum.transformBy(worldTransform);
    this.viewTool.viewport!.setupViewFromFrustum(frustum);

    return true;
  }

  private getLookTransform(vp: Viewport, firstPt: Point3d, currPt: Point3d): Transform {
    const viewRect = vp.viewRect;
    const xExtent = viewRect.width;
    const yExtent = viewRect.height;
    const xDelta = (currPt.x - firstPt.x);
    const yDelta = (currPt.y - firstPt.y);
    const xAngle = -(xDelta / xExtent) * Math.PI;
    const yAngle = -(yDelta / yExtent) * Math.PI;

    const inverseRotation = this._rotation.inverse();
    const horizontalRotation = Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createRadians(xAngle));
    const verticalRotation = Matrix3d.createRotationAroundVector(Vector3d.unitX(), Angle.createRadians(yAngle));

    if (undefined === inverseRotation || undefined === horizontalRotation || undefined === verticalRotation)
      return Transform.createIdentity();

    verticalRotation.multiplyMatrixMatrix(this._rotation, verticalRotation);
    inverseRotation.multiplyMatrixMatrix(verticalRotation, verticalRotation);

    const newRotation = horizontalRotation.multiplyMatrixMatrix(verticalRotation);
    const transform = Transform.createFixedPointAndMatrix(this._eyePoint, newRotation);
    return transform;
  }
}

/** handle for tools that animate a frustum change based on the position of the cursor relative to an anchor point. */
abstract class AnimatedHandle extends ViewingToolHandle {
  protected readonly _anchorPtView = new Point3d();
  protected readonly _lastPtView = new Point3d();
  protected _lastMotionTime = 0;
  protected _deadZone = 36;

  public testHandleForHit(_ptScreen: Point3d, out: { distance: number, priority: ViewManipPriority }): boolean {
    out.distance = 0.0;
    out.priority = ViewManipPriority.Medium;
    return true;
  }

  protected getElapsedTime(): number {
    const prev = this._lastMotionTime;
    this._lastMotionTime = Date.now();
    return Geometry.clamp(this._lastMotionTime - prev, 0, 1000) / 1000.;
  }
  // called on mouse motion
  public doManipulation(ev: BeButtonEvent): boolean {
    this._lastPtView.setFrom(ev.viewPoint);
    return true;
  }

  // called when animation is interrupted
  public interrupt(): void { }
  public animate(): boolean {
    // Don't continue animation when mouse is outside view, and don't jump if it returns...
    if (undefined !== IModelApp.toolAdmin.cursorView)
      return true;
    this.getElapsedTime();
    return false;
  }

  public firstPoint(ev: BeButtonEvent): boolean {
    const vp = ev.viewport;
    const tool = this.viewTool;
    tool.inDynamicUpdate = true;
    if (vp && this.needDepthPoint(ev, false)) {
      this.pickDepthPoint(ev);
      if (undefined !== this._depthPoint) {
        vp.worldToView(this._depthPoint, this._anchorPtView);
      } else {
        vp.worldToNpc(ev.point, this._anchorPtView);
        this._anchorPtView.z = ViewManip.getFocusPlaneNpc(vp);
        vp.npcToView(this._anchorPtView, this._anchorPtView);
      }
    } else {
      this._anchorPtView.setFrom(ev.viewPoint);
    }
    this._lastPtView.setFrom(this._anchorPtView);
    this._lastMotionTime = Date.now();
    tool.viewport!.setAnimator(this);
    return true;
  }

  protected getDirection(): Vector3d | undefined {
    const dir = this._anchorPtView.vectorTo(this._lastPtView);
    dir.z = 0;
    return dir.magnitudeSquared() < this._deadZone ? undefined : dir; // dead zone around starting point
  }

  protected getInputVector(): Vector3d | undefined {
    const dir = this.getDirection();
    if (undefined === dir)
      return undefined;
    const viewRect = this.viewTool.viewport!.viewRect;
    return new Vector3d(dir.x * (2.0 / viewRect.width), dir.y * (2.0 / viewRect.height));
  }

  public override onReinitialize(): void {
    const tool = this.viewTool;
    tool.inDynamicUpdate = false;
    const vp = tool.viewport;
    if (undefined !== vp)
      vp.setAnimator();
  }

  // called when wheel rolls, reset tool
  public override onWheel(_ev: BeWheelEvent): boolean {
    const tool = this.viewTool;
    tool.nPts = 0; // start over
    tool.inDynamicUpdate = false; // not active
    return false;
  }
}

/** ViewingToolHandle for performing the "scroll view" operation */
class ViewScroll extends AnimatedHandle {
  public get handleType() { return ViewHandleType.Scroll; }
  public override getHandleCursor(): string { return "move"; }

  public override drawHandle(context: DecorateContext, _hasFocus: boolean): void {
    if (context.viewport !== this.viewTool.viewport || !this.viewTool.inDynamicUpdate)
      return;

    const radius = Math.floor(context.viewport.pixelsFromInches(0.1)) + 0.5;
    const position = this._anchorPtView.clone();
    const position2 = this._lastPtView.clone();
    const offset = position2.minus(position);
    const drawDecoration = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,255,0,.3)";
      ctx.setLineDash([10, 4]);
      ctx.lineWidth = 3;
      ctx.moveTo(0, 0);
      ctx.lineTo(offset.x, offset.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(0,0,0,.5)";
      ctx.lineWidth = 1;
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      let vec = Vector2d.createStartEnd(position, position2);
      if (undefined === vec)
        vec = Vector2d.unitX();
      else
        vec.normalize(vec);

      const slashPts = [new Point2d(), new Point2d()];
      slashPts[0].plusScaled(vec, radius, slashPts[0]);
      slashPts[1].plusScaled(vec, -radius, slashPts[1]);

      ctx.beginPath();
      ctx.strokeStyle = "black";
      ctx.lineWidth = 2;
      ctx.moveTo(slashPts[0].x, slashPts[0].y);
      ctx.lineTo(slashPts[1].x, slashPts[1].y);
      ctx.stroke();
    };
    context.addCanvasDecoration({ position, drawDecoration }, true);
  }

  public override firstPoint(ev: BeButtonEvent) {
    super.firstPoint(ev);
    this.viewTool.provideToolAssistance("Scroll.Prompts.NextPoint");
    return true;
  }

  public override animate(): boolean {
    if (!super.animate())
      return false;

    const dist = this.getDirection();
    if (undefined === dist)
      return false;

    dist.scaleInPlace(ToolSettings.scrollSpeed * this.getElapsedTime());
    const tool = this.viewTool;
    const viewport = tool.viewport!;

    if (viewport.isCameraOn) {
      const points: Point3d[] = new Array<Point3d>(2);
      points[0] = this._anchorPtView.clone();
      points[1] = points[0].plus(dist);

      viewport.viewToNpcArray(points);
      points[1].z = points[0].z;
      viewport.npcToWorldArray(points);

      const offset = points[1].minus(points[0]);
      const offsetTransform = Transform.createTranslation(offset);
      const frustum = viewport.getWorldFrustum();
      frustum.transformBy(offsetTransform, frustum);
      viewport.setupViewFromFrustum(frustum);
    } else {
      viewport.scroll(dist, { noSaveInUndo: true });
    }

    return false;
  }

  /** @internal */
  public override needDepthPoint(ev: BeButtonEvent, _isPreview: boolean): boolean {
    return ev.viewport!.isCameraOn && CoordSource.User === ev.coordsFrom;
  }
}

/** ViewingToolHandle for performing the "zoom view" operation */
class ViewZoom extends ViewingToolHandle {
  protected readonly _anchorPtNpc = new Point3d();
  protected readonly _anchorPtView = new Point3d();
  protected readonly _anchorPtWorld = new Point3d();
  protected readonly _lastPtView = new Point3d();
  protected readonly _startEyePoint = new Point3d();
  protected _startFrust?: Frustum;
  protected _lastZoomRatio = 1.0;
  public get handleType() { return ViewHandleType.Zoom; }
  public override getHandleCursor() { return IModelApp.viewManager.zoomCursor; }

  public testHandleForHit(_ptScreen: Point3d, out: { distance: number, priority: ViewManipPriority }): boolean {
    out.distance = 0.0;
    out.priority = ViewManipPriority.Medium; // Always prefer over pan handle which is only force enabled by IdleTool middle button action...
    return true;
  }

  public override drawHandle(context: DecorateContext, hasFocus: boolean): void {
    if (!hasFocus || context.viewport !== this.viewTool.viewport || !this.viewTool.inDynamicUpdate)
      return;

    const radius = Math.floor(context.viewport.pixelsFromInches(0.15)) + 0.5;
    const crossRadius = radius * 0.6;
    const position = this._anchorPtView.clone(); position.x = Math.floor(position.x) + 0.5; position.y = Math.floor(position.y) + 0.5;
    const drawDecoration = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,.5)";
      ctx.lineWidth = 1;
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = "black";
      ctx.lineWidth = 2;
      ctx.moveTo(-crossRadius, 0);
      ctx.lineTo(crossRadius, 0);
      if (this._lastZoomRatio < 1.0) {
        ctx.moveTo(0, -crossRadius);
        ctx.lineTo(0, crossRadius);
      }
      ctx.stroke();
    };
    context.addCanvasDecoration({ position, drawDecoration }, true);
  }

  public firstPoint(ev: BeButtonEvent) {
    const vp = ev.viewport!;
    this.viewTool.inDynamicUpdate = true;
    if (this.needDepthPoint(ev, false)) {
      this.pickDepthPoint(ev);
      if (undefined !== this._depthPoint) {
        vp.worldToView(this._depthPoint, this._anchorPtView);
      } else {
        vp.worldToNpc(ev.point, this._anchorPtView);
        this._anchorPtView.z = ViewManip.getFocusPlaneNpc(vp);
        vp.npcToView(this._anchorPtView, this._anchorPtView);
      }
    } else {
      this._anchorPtView.setFrom(ev.viewPoint);
    }
    this._lastPtView.setFrom(this._anchorPtView);

    vp.viewToNpc(this._anchorPtView, this._anchorPtNpc);
    vp.viewToWorld(this._anchorPtView, this._anchorPtWorld);
    this._startFrust = vp.getWorldFrustum();

    if (vp.view.isCameraEnabled())
      this._startEyePoint.setFrom(vp.view.getEyePoint());

    this.viewTool.provideToolAssistance("Zoom.Prompts.NextPoint");
    return true;
  }

  public override onWheel(_ev: BeWheelEvent): boolean {
    const tool = this.viewTool;
    if (!tool.inHandleModify)
      return false;
    tool.nPts = 0; // start over
    tool.inHandleModify = false;
    tool.inDynamicUpdate = false;
    tool.viewHandles.setFocus(-1);
    return false;
  }

  protected getDirection(): Vector3d | undefined {
    const dir = this._anchorPtView.vectorTo(this._lastPtView); dir.z = 0;
    return dir.magnitudeSquared() < 36 ? undefined : dir; // dead zone around starting point
  }

  public doManipulation(ev: BeButtonEvent): boolean {
    this._lastPtView.setFrom(ev.viewPoint);

    if (undefined === this._startFrust || undefined === this.getDirection()) // on anchor point?
      return false;

    const viewport = this.viewTool.viewport!;
    const view = viewport.view;
    const thisPtNpc = viewport.viewToNpc(this._lastPtView);
    const dist = this._anchorPtNpc.minus(thisPtNpc); dist.z = 0.0; dist.x = 0.0;
    let zoomRatio = 1.0 + (dist.magnitude() * ToolSettings.zoomSpeed);
    if (dist.y > 0)
      zoomRatio = 1.0 / zoomRatio;
    this._lastZoomRatio = zoomRatio;

    const frustum = this._startFrust.clone();
    const transform = Transform.createFixedPointAndMatrix(this._anchorPtWorld, Matrix3d.createScale(zoomRatio, zoomRatio, view.is3d() ? zoomRatio : 1.0));

    if (view.isCameraEnabled()) {
      const oldEyePoint = this._startEyePoint;
      const newEyePoint = transform.multiplyPoint3d(oldEyePoint);
      const cameraOffset = Vector3d.createStartEnd(oldEyePoint, newEyePoint);
      Transform.createTranslation(cameraOffset, transform);
    }

    frustum.transformBy(transform, frustum);
    if (ViewStatus.Success !== view.setupFromFrustum(frustum))
      return false;
    if (view.isCameraEnabled())
      this.changeFocusFromDepthPoint(); // if we have a valid depth point, set it focus distance from it
    return ViewStatus.Success === viewport.setupFromView();
  }

  /** @internal */
  public override needDepthPoint(ev: BeButtonEvent, _isPreview: boolean): boolean {
    return ev.viewport!.isCameraOn && CoordSource.User === ev.coordsFrom;
  }
}

/** @internal */
class NavigateMotion {
  private _seconds = 0;
  public readonly transform = Transform.createIdentity();
  constructor(public viewport: Viewport) { }

  public init(seconds: number) {
    this._seconds = seconds;
    this.transform.setIdentity();
  }

  public getViewUp(result?: Vector3d) { return this.viewport.rotation.getRow(1, result); }

  public getViewDirection(result?: Vector3d): Vector3d {
    const forward = this.viewport.rotation.getRow(2, result);
    forward.scale(-1, forward); // positive z is out of the screen, but we want direction into the screen
    return forward;
  }

  public takeElevator(height: number): void {
    const up = Point3d.create(0, 0, height * this._seconds);
    Transform.createTranslation(up, this.transform);
  }

  public modifyPitchAngleToPreventInversion(pitchAngle: number): number {
    const angleLimit = Angle.degreesToRadians(85);
    const angleTolerance = Angle.degreesToRadians(0.01);

    if (0.0 === pitchAngle)
      return 0.0;

    const viewUp = this.getViewUp();
    const viewDir = this.getViewDirection();
    const worldUp = Vector3d.unitZ();

    let viewAngle = worldUp.angleTo(viewUp).radians;
    if (viewDir.z < 0)
      viewAngle *= -1;

    let newAngle = pitchAngle + viewAngle;
    if (Math.abs(newAngle) < angleLimit)
      return pitchAngle; // not close to the limit
    if ((pitchAngle > 0) !== (viewAngle > 0) && (Math.abs(pitchAngle) < Math.PI / 2))
      return pitchAngle; // tilting away from the limit
    if (Math.abs(viewAngle) >= (angleLimit - angleTolerance))
      return 0.0; // at the limit already

    const difference = Math.abs(newAngle) - angleLimit;
    newAngle = (pitchAngle > 0) ? pitchAngle - difference : pitchAngle + difference;
    return newAngle; // almost at the limit, but still can go a little bit closer
  }

  public generateMouseLookTransform(accumulator: Vector3d, movement: XAndY, result?: Transform): Transform {
    const vp = this.viewport;
    const view = vp.view;
    if (!view.is3d() || !vp.isCameraOn)
      return Transform.createIdentity();
    const viewRect = this.viewport.viewRect;
    const xExtent = viewRect.width;
    const yExtent = viewRect.height;
    accumulator.z += this._seconds; // accumulate time delta since start...
    const snappiness = 10.0; // larger values are more responsive...
    const fraction = Geometry.clamp(snappiness * accumulator.z, 0.0, 1.0);
    accumulator.x = Geometry.interpolate(accumulator.x, fraction, movement.x);
    accumulator.y = Geometry.interpolate(accumulator.y, fraction, movement.y);
    const xAngle = -(accumulator.x / xExtent) * Math.PI * 2.0;
    const yAngle = -(accumulator.y / yExtent) * Math.PI;
    const viewRot = vp.rotation;
    const invViewRot = viewRot.inverse()!;
    const pitchAngle = Angle.createRadians(this.modifyPitchAngleToPreventInversion(yAngle));
    const pitchMatrix = Matrix3d.createRotationAroundVector(Vector3d.unitX(), pitchAngle)!;
    const pitchTimesView = pitchMatrix.multiplyMatrixMatrix(viewRot);
    const inverseViewTimesPitchTimesView = invViewRot.multiplyMatrixMatrix(pitchTimesView);
    const yawMatrix = Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createRadians(xAngle))!;
    const yawTimesInverseViewTimesPitchTimesView = yawMatrix.multiplyMatrixMatrix(inverseViewTimesPitchTimesView);
    return Transform.createFixedPointAndMatrix(view.getEyePoint(), yawTimesInverseViewTimesPitchTimesView, result);
  }

  public generateRotationTransform(yawRate: number, pitchRate: number, result?: Transform): Transform {
    const vp = this.viewport;
    const view = vp.view;
    if (!view.is3d() || !vp.isCameraOn)
      return Transform.createIdentity();
    const viewRot = vp.rotation;
    const invViewRot = viewRot.inverse()!;
    const pitchAngle = Angle.createRadians(this.modifyPitchAngleToPreventInversion(pitchRate * this._seconds));
    const pitchMatrix = Matrix3d.createRotationAroundVector(Vector3d.unitX(), pitchAngle)!;
    const pitchTimesView = pitchMatrix.multiplyMatrixMatrix(viewRot);
    const inverseViewTimesPitchTimesView = invViewRot.multiplyMatrixMatrix(pitchTimesView);
    const yawMatrix = Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createRadians(yawRate * this._seconds))!;
    const yawTimesInverseViewTimesPitchTimesView = yawMatrix.multiplyMatrixMatrix(inverseViewTimesPitchTimesView);
    return Transform.createFixedPointAndMatrix(view.getEyePoint(), yawTimesInverseViewTimesPitchTimesView, result);
  }

  public generateTranslationTransform(velocity: Vector3d, isConstrainedToXY: boolean, result?: Transform) {
    const points: Point3d[] = new Array<Point3d>(3);
    points[0] = new Point3d(0, 0, 0);
    points[1] = new Point3d(1, 0, 0);
    points[2] = new Point3d(0, 1, 0);
    if (this.viewport.isCameraOn) {
      this.viewport.viewToNpcArray(points);
      points[0].z = points[1].z = points[2].z = ViewManip.getFocusPlaneNpc(this.viewport); // use the focal plane for z coordinates
      this.viewport.npcToViewArray(points);
    }
    this.viewport.viewToWorldArray(points);
    const xDir = Vector3d.createStartEnd(points[0], points[1]);
    xDir.normalizeInPlace();
    const yDir = Vector3d.createStartEnd(points[0], points[2]);
    yDir.normalizeInPlace();

    const zDir = this.getViewDirection();

    if (isConstrainedToXY) {
      const up = Vector3d.unitZ();
      const cross = up.crossProduct(zDir);
      cross.crossProduct(up, zDir);
      zDir.normalizeInPlace();
    }

    xDir.scale(velocity.x * this._seconds, xDir);
    yDir.scale(velocity.y * this._seconds, yDir);
    zDir.scale(velocity.z * this._seconds, zDir);

    xDir.plus(yDir, xDir).plus(zDir, xDir);
    return Transform.createTranslation(xDir, result);
  }

  public moveAndMouseLook(accumulator: Vector3d, linearVelocity: Vector3d, movement: XAndY, isConstrainedToXY: boolean): boolean {
    const rotateTrans = this.generateMouseLookTransform(accumulator, movement);
    const dollyTrans = this.generateTranslationTransform(linearVelocity, isConstrainedToXY);
    this.transform.setMultiplyTransformTransform(rotateTrans, dollyTrans);
    return (accumulator.x >= movement.x && accumulator.y >= movement.y);
  }

  public moveAndLook(linearVelocity: Vector3d, angularVelocityX: number, angularVelocityY: number, isConstrainedToXY: boolean): void {
    const rotateTrans = this.generateRotationTransform(angularVelocityX, angularVelocityY);
    const dollyTrans = this.generateTranslationTransform(linearVelocity, isConstrainedToXY);
    this.transform.setMultiplyTransformTransform(rotateTrans, dollyTrans);
  }

  public pan(horizontalVelocity: number, verticalVelocity: number): void {
    const travel = new Vector3d(horizontalVelocity, verticalVelocity, 0);
    this.moveAndLook(travel, 0, 0, false);
  }

  public travel(yawRate: number, pitchRate: number, forwardVelocity: number, isConstrainedToXY: boolean): void {
    const travel = new Vector3d(0, 0, forwardVelocity);
    this.moveAndLook(travel, yawRate, pitchRate, isConstrainedToXY);
  }

  public look(yawRate: number, pitchRate: number): void { this.generateRotationTransform(yawRate, pitchRate, this.transform); }

  /** reset pitch of view to zero */
  public resetToLevel(): void {
    const view = this.viewport.view;
    if (!view.is3d() || !view.isCameraOn)
      return;
    const angles = YawPitchRollAngles.createFromMatrix3d(this.viewport.rotation)!;
    angles.pitch.setRadians(0); // reset pitch to zero
    Transform.createFixedPointAndMatrix(view.getEyePoint(), angles.toMatrix3d(), this.transform);
  }
}

/** ViewingToolHandle for performing the Walk and Fly operations */
abstract class ViewNavigate extends AnimatedHandle {
  private _initialized = false;
  protected abstract getNavigateMotion(seconds: number): NavigateMotion | undefined;

  public override getHandleCursor() { return IModelApp.viewManager.walkCursor; }
  public getMaxLinearVelocity() { return ToolSettings.walkVelocity; }
  public getMaxAngularVelocity() { return Math.PI / 4; }

  public getNavigateMode(): NavigateMode {
    const state = IModelApp.toolAdmin.currentInputState;
    return (state.isShiftDown || !this.viewTool.viewport!.isCameraOn) ? NavigateMode.Pan :
      state.isControlDown ? NavigateMode.Look : NavigateMode.Travel;
  }

  // called in animation loop
  public override animate(): boolean {
    if (!super.animate())
      return false;

    const motion = this.getNavigateMotion(this.getElapsedTime());

    if (undefined !== motion) {
      const vp = this.viewTool.viewport!;
      const frust = vp.getWorldFrustum();
      frust.multiply(motion.transform);
      vp.setupViewFromFrustum(frust);
    }
    return false;
  }

  public override onReinitialize(): void {
    super.onReinitialize();
    if (this._initialized)
      return;
    this._initialized = true;

    const tool = this.viewTool;
    const vp = tool.viewport;
    if (undefined === vp)
      return;

    const view = vp.view;
    if (!view.allow3dManipulations())
      return;

    const walkAngle = ToolSettings.walkCameraAngle;
    if (!tool.lensAngleMatches(walkAngle, Angle.degreesToRadians(15.)) || !tool.isZUp) {
      //  This turns on the camera if its not already on. It also assures the camera is centered. Obviously this is required if
      //  the camera is not on or the lens angle is not what we want. We also want to do it if Z will be
      //  adjusted because EnforceZUp swivels the camera around what GetTargetPoint returns. If the FocusDistance is not set to something
      //  reasonable the target point may be far beyond anything relevant.
      tool.setCameraLensAngle(walkAngle, tool.lensAngleMatches(walkAngle, Angle.degreesToRadians(45.)));
    }

    if (ToolSettings.walkEnforceZUp)
      tool.enforceZUp(view.getTargetPoint());

    vp.animateFrustumChange();
  }

  public override drawHandle(context: DecorateContext, hasFocus: boolean): void {
    if (!hasFocus || context.viewport !== this.viewTool.viewport || !this.viewTool.inDynamicUpdate)
      return;
    const position = this._anchorPtView.clone();
    position.x = Math.floor(position.x) + 0.5;
    position.y = Math.floor(position.y) + 0.5;
    const drawDecoration = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.strokeStyle = "black";
      ctx.fillStyle = "rgba(255,255,255,.3)";
      ctx.lineWidth = 1;
      ctx.arc(0, 0, 5, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fill();
    };
    context.addCanvasDecoration({ position, drawDecoration });
  }
}

/** ViewingToolHandle for looking around and moving through a model using mouse+wasd or on-screen control sticks for touch */
class ViewLookAndMove extends ViewNavigate {
  private _navigateMotion: NavigateMotion;
  private _lastCollision = 0;
  private _lastReadPt = new Point3d();
  private _lastReference?: Plane3dByOriginAndUnitNormal;
  private _lastContour?: LineString3d;
  private _currentContour?: LineString3d;
  protected readonly _positionInput = new Vector3d();
  protected readonly _accumulator = new Vector3d();
  protected _lastMovement?: XAndY;
  protected _touchStartL?: BeTouchEvent;
  protected _touchStartR?: BeTouchEvent;
  protected _touchLast?: BeTouchEvent;
  protected _touchElevate = false;
  protected _touchLook = false;
  protected _touchSpeedUp = false;
  protected _havePointerLock = false;
  protected _pointerLockChangeListener?: EventListener;
  protected _pointerLockClickEngagementListener?: EventListener;
  protected _pointerLockKeyEngagementListener?: EventListener;

  constructor(viewManip: ViewManip) {
    super(viewManip);
    this._navigateMotion = new NavigateMotion(this.viewTool.viewport!);
  }

  public get handleType(): ViewHandleType { return ViewHandleType.LookAndMove; }
  public override getHandleCursor(): string { return IModelApp.viewManager.lookCursor; }

  public override testHandleForHit(_ptScreen: Point3d, out: { distance: number, priority: ViewManipPriority }): boolean {
    out.distance = 0.0;
    out.priority = ViewManipPriority.Medium; // Always prefer over pan handle which is only force enabled by IdleTool middle button action...
    return true;
  }

  public override onReinitialize(): void {
    super.onReinitialize();
    this._touchStartL = this._touchStartR = this._touchLast = undefined;
    this._touchElevate = this._touchSpeedUp = this._touchLook = false;
    if (this.viewTool.viewHandles.testHit(Point3d.createZero(), ViewHandleType.LookAndMove))
      this.viewTool.viewHandles.focusHitHandle(); // Ensure key events go to this handle by default w/o requiring motion...
    this.onCleanup();
    this.requestPointerLock(true);
  }

  public override onCleanup(): void {
    super.onCleanup();
    this.releasePointerLock();
  }

  private pointerLockChangeEvent(): void {
    const vp = this.viewTool.viewport;
    if (undefined !== vp && document.pointerLockElement === vp.canvas) {
      vp.npcToView(NpcCenter, this._anchorPtView); // Display indicator in the middle of the view for pointer lock...
      this._lastPtView.setFrom(this._anchorPtView);
      this._havePointerLock = true;
      vp.invalidateDecorations();
    } else {
      this._havePointerLock = false;
    }
  }

  private requestPointerLock(enable: boolean): void {
    if (!enable) {
      if (undefined !== this._pointerLockClickEngagementListener) {
        document.removeEventListener("click", this._pointerLockClickEngagementListener, false);
        this._pointerLockClickEngagementListener = undefined;
      }
      if (undefined !== this._pointerLockKeyEngagementListener) {
        document.removeEventListener("keydown", this._pointerLockKeyEngagementListener, false);
        this._pointerLockKeyEngagementListener = undefined;
      }
      return;
    }

    if (!ToolSettings.walkRequestPointerLock)
      return;

    const vp = this.viewTool.viewport;
    if (undefined === vp)
      return;

    // NOTE: Chrome appears to be the only browser that doesn't require pointer lock to be requested from an engagement event like click.
    //       Currently pointer lock is requested for "click" and not "mousedown" since we don't want pointer lock for drag operation.
    if (undefined === this._pointerLockChangeListener) {
      this._pointerLockChangeListener = () => this.pointerLockChangeEvent();
      document.addEventListener("pointerlockchange", this._pointerLockChangeListener, false);
    }

    if (undefined === this._pointerLockClickEngagementListener) {
      this._pointerLockClickEngagementListener = () => {
        if (1 === this.viewTool.nPts && undefined !== IModelApp.toolAdmin.cursorView)
          vp.canvas.requestPointerLock();
      };
      document.addEventListener("click", this._pointerLockClickEngagementListener, false);
    }

    if (undefined === this._pointerLockKeyEngagementListener) {
      this._pointerLockKeyEngagementListener = (ev: Event) => {
        if (0 === this.viewTool.nPts && undefined !== IModelApp.toolAdmin.cursorView && this.isNavigationKey(ev as KeyboardEvent))
          vp.canvas.requestPointerLock();
      };
      document.addEventListener("keydown", this._pointerLockKeyEngagementListener, false);
    }
  }

  private releasePointerLock(): void {
    this._havePointerLock = false;
    this.requestPointerLock(false);
    if (undefined !== this._pointerLockChangeListener) {
      document.removeEventListener("pointerlockchange", this._pointerLockChangeListener, false);
      this._pointerLockChangeListener = undefined;
    }
    if (null !== document.pointerLockElement)
      document.exitPointerLock();
  }

  public override firstPoint(ev: BeButtonEvent): boolean {
    this.viewTool.provideToolAssistance("LookAndMove.Prompts.NextPoint");
    if (!super.firstPoint(ev))
      return false;

    const vp = this.viewTool.viewport;
    if (undefined === vp || !vp.isCameraOn)
      return true;

    if (InputSource.Mouse === ev.inputSource) {
      this._deadZone = Math.pow(vp.pixelsFromInches(0.5), 2); // Only used if pointer lock isn't supported...
    } else {
      this._touchLook = true;
      vp.npcToView(NpcCenter, this._anchorPtView); // Display indicator in the middle of the view for touch look...
    }
    return true;
  }

  public override doManipulation(ev: BeButtonEvent): boolean {
    if (InputSource.Mouse === ev.inputSource)
      this._lastMovement = this._havePointerLock ? ev.movement : undefined;
    else
      this._lastMovement = this._lastPtView.vectorTo(ev.viewPoint).scale(2.0); // ev.movement isn't available for button event created from touch event...
    this._accumulator.setZero();

    return super.doManipulation(ev);
  }

  public override getMaxLinearVelocity() {
    const maxLinearVelocity = super.getMaxLinearVelocity();
    if (0 === ToolSettings.walkVelocityChange)
      return (this._touchSpeedUp ? maxLinearVelocity * 2.0 : maxLinearVelocity);

    const speedFactor = Geometry.clamp(ToolSettings.walkVelocityChange + (ToolSettings.walkVelocityChange > 0 ? 1 : -1), -10, 10);
    const speedMultiplier = (speedFactor >= 0 ? speedFactor : 1 / Math.abs(speedFactor));

    return maxLinearVelocity * speedMultiplier;
  }

  protected getMaxAngularVelocityX() { return 2 * this.getMaxAngularVelocity(); } // Allow turning to be faster than looking up/down...
  protected getMaxAngularVelocityY() { return this.getMaxAngularVelocity(); }

  protected getLinearVelocity(): Vector3d {
    const positionInput = Vector3d.create();
    const vp = this.viewTool.viewport!;

    const position = this.getTouchStartPosition(this._touchStartL);
    if (undefined !== position) {
      const outerRadius = this.getTouchControlRadius(vp);
      const offset = this.getTouchOffset(this._touchStartL, outerRadius);
      const inputL = new Vector3d(offset.x * (1.0 / outerRadius), offset.y * (1.0 / outerRadius));
      positionInput.x = inputL.x * this.getMaxLinearVelocity();
      if (this._touchElevate)
        positionInput.y = inputL.y * this.getMaxLinearVelocity();
      else
        positionInput.z = inputL.y * -this.getMaxLinearVelocity();
      return positionInput;
    }

    this._positionInput.scale(this.getMaxLinearVelocity(), positionInput);
    return positionInput;
  }

  protected getAngularVelocity(): Vector3d {
    const angularInput = Vector3d.create();
    const vp = this.viewTool.viewport!;

    const position = this.getTouchStartPosition(this._touchStartR);
    if (undefined !== position) {
      const outerRadius = this.getTouchControlRadius(vp);
      const offset = this.getTouchOffset(this._touchStartR, outerRadius);
      const inputA = new Vector3d(offset.x * (1.0 / outerRadius), offset.y * (1.0 / outerRadius));
      angularInput.x = inputA.x * -this.getMaxAngularVelocityX();
      angularInput.y = inputA.y * -this.getMaxAngularVelocityY();
      return angularInput;
    }

    if (this._havePointerLock || this._touchLook)
      return angularInput;

    const input = this.getInputVector();
    if (undefined !== input) {
      angularInput.x = input.x * -this.getMaxAngularVelocityX();
      angularInput.y = input.y * -this.getMaxAngularVelocityY();
    }
    return angularInput;
  }

  protected getHorizAndVertVelocity(): Vector3d | undefined {
    const input = this.getInputVector();
    if (undefined === input)
      return undefined;
    input.scale(this.getMaxLinearVelocity(), input);
    return input;
  }

  private computeCollisionData(vp: Viewport, eyePt: Point3d): void {
    const contourLine = LineString3d.create();
    const viewPt = vp.npcToView(NpcCenter);
    const pts: Point2d[] = [];
    pts[0] = new Point2d(Math.floor(viewPt.x + 0.5), vp.viewRect.top);
    pts[1] = new Point2d(pts[0].x + 1, vp.viewRect.bottom);
    const range = Range2d.createArray(pts);

    let detectStepUp = false;
    const rect = new ViewRect();
    rect.initFromRange(range);
    vp.readPixels(rect, Pixel.Selector.GeometryAndDistance, (pixels) => {
      if (undefined === pixels)
        return;

      const sRange = Range2d.createNull();
      sRange.extendPoint(Point2d.create(vp.cssPixelsToDevicePixels(range.low.x), vp.cssPixelsToDevicePixels(range.low.y)));
      sRange.extendPoint(Point2d.create(vp.cssPixelsToDevicePixels(range.high.x), vp.cssPixelsToDevicePixels(range.high.y)));

      const testPoint = Point2d.create(sRange.low.x);
      for (testPoint.y = sRange.high.y; testPoint.y >= sRange.low.y; --testPoint.y) {
        const pixel = pixels.getPixel(testPoint.x, testPoint.y);
        if (pixel.distanceFraction < 0)
          continue; // No geometry at location...

        const hitPointWorld = vp.getPixelDataWorldPoint(pixels, testPoint.x, testPoint.y);
        if (undefined === hitPointWorld)
          continue;

        if (0 === contourLine.numPoints()) {
          if (undefined === this._lastReference) {
            const refPt = (ToolSettings.walkDetectFloor ? eyePt.plusScaled(Vector3d.unitZ(), -ToolSettings.walkEyeHeight) : hitPointWorld);
            this._lastReference = Plane3dByOriginAndUnitNormal.create(refPt, Vector3d.unitZ());
            detectStepUp = ToolSettings.walkDetectFloor;
          } else if (undefined !== this._lastContour && this._lastContour.numPoints() > 1) {
            let fractLo, fractHi;
            const forwardDir = Vector3d.unitZ().crossProduct(vp.view.getXVector());
            const yPlaneHi = Plane3dByOriginAndUnitNormal.create(hitPointWorld, forwardDir);

            if (undefined !== yPlaneHi) {
              yPlaneHi.getNormalRef().scaleInPlace(-1);
              yPlaneHi.getOriginRef().addScaledInPlace(yPlaneHi.getNormalRef(), Constant.oneCentimeter * 5);

              const resultHi: CurveLocationDetail[] = [];
              this._lastContour.appendPlaneIntersectionPoints(yPlaneHi, resultHi);

              for (const intsecHi of resultHi) {
                if ((undefined === fractHi || intsecHi.fraction < fractHi) && intsecHi.point.distance(hitPointWorld) < ToolSettings.walkEyeHeight)
                  fractHi = intsecHi.fraction;
              }

              if (undefined !== fractHi) {
                const yPlaneLo = yPlaneHi.clone();
                yPlaneLo.getOriginRef().addScaledInPlace(yPlaneLo.getNormalRef(), ToolSettings.walkEyeHeight * 2);

                const resultLo: CurveLocationDetail[] = [];
                this._lastContour.appendPlaneIntersectionPoints(yPlaneLo, resultLo);

                for (const intsecLo of resultLo) {
                  if (undefined === fractLo || intsecLo.fraction < fractLo)
                    fractLo = intsecLo.fraction;
                }

                if (undefined === fractLo && yPlaneHi.altitude(this._lastContour.startPoint()) > 0)
                  fractLo = 0; // Include from start if last path was shorter than requested section...
              }
            }

            if (undefined !== fractLo && undefined !== fractHi && fractHi > fractLo) {
              // Keep section of last contour to account for loosing sight of what is underfoot while moving forward...
              const partialCurve = this._lastContour.clonePartialCurve(fractLo, fractHi);
              if (undefined !== partialCurve && partialCurve instanceof LineString3d)
                contourLine.addPoints(partialCurve.packedPoints);
            } else {
              // Moved too far from last contour...
              detectStepUp = true;
            }
          }
        } else if (contourLine.numPoints() > 1) {
          const startPt = contourLine.packedPoints.getPoint3dAtUncheckedPointIndex(contourLine.numPoints() - 2);
          const testPt = contourLine.packedPoints.getPoint3dAtUncheckedPointIndex(contourLine.numPoints() - 1);

          const fraction = testPt.fractionOfProjectionToLine(startPt, hitPointWorld, 0.0);
          const closePoint = startPt.interpolate(fraction, hitPointWorld);

          if (closePoint.isAlmostEqual(testPt, 1.0e-5)) {
            // Colinear point, extent segment...
            contourLine.packedPoints.setAtCheckedPointIndex(contourLine.numPoints() - 1, hitPointWorld);
            continue;
          }
        }

        contourLine.addPoint(hitPointWorld);
      }
    }, true);

    // Use single point to denote "no geometry found" until movement is detected...
    if (0 === contourLine.numPoints()) {
      contourLine.addPoint(this._lastReadPt);
    } else if (detectStepUp && undefined !== this._lastReference) {
      const start = contourLine.startPoint();
      const forwardDir = Vector3d.unitZ().crossProduct(vp.view.getXVector());
      const stepPlane = Plane3dByOriginAndUnitNormal.create(start.plusScaled(forwardDir, ToolSettings.walkStepHeight), forwardDir);

      const resultStep: CurveLocationDetail[] = [];
      if (undefined !== stepPlane)
        contourLine.appendPlaneIntersectionPoints(stepPlane, resultStep);

      let stepPt;
      for (const intsecStep of resultStep) {
        if (undefined === stepPt || intsecStep.point.z > stepPt.z)
          stepPt = intsecStep.point;
      }

      if (undefined !== stepPt) {
        const xyDist = start.distanceXY(stepPt);
        const zDist = stepPt.z - start.z;
        const slope = (0.0 === xyDist ? Math.PI : Math.atan(zDist / xyDist));

        if (slope > Angle.createDegrees(10.0).radians && slope < Angle.createDegrees(50.0).radians) {
          const slopeRay = Ray3d.create(start, Vector3d.createStartEnd(stepPt, start));
          const slopePt = Point3d.create();

          if (undefined !== slopeRay.intersectionWithPlane(this._lastReference, slopePt)) {
            contourLine.reverseInPlace();
            contourLine.addPoint(slopePt);
            contourLine.reverseInPlace();
          }
        }
      }
    }

    this._currentContour = contourLine;
    if (ToolSettings.walkDetectFloor)
      this._lastContour = this._currentContour;
  }

  private checkForCollision(vp: Viewport, motion: NavigateMotion, positionInput: Vector3d): number {
    if (!ToolSettings.walkCollisions)
      return 0;

    const view = vp.view;
    if (!view.is3d() || !view.isCameraOn)
      return 0;

    if (undefined !== this._currentContour) {
      const pixelSize = vp.pixelsFromInches(0.75);
      const viewPt = vp.npcToView(NpcCenter);
      const readPt = vp.worldToView(this._lastReadPt);
      if (viewPt.distanceXY(readPt) > pixelSize)
        this._currentContour = undefined;
      if (0.0 !== positionInput.y)
        this._lastReference = undefined; // Choose a new reference plane after elevation change...
    }

    const eyePt = view.getEyePoint();

    if (undefined === this._currentContour && positionInput.z > 0.0) {
      vp.viewToNpc(vp.npcToView(NpcCenter), this._lastReadPt);
      this._lastReadPt.z = ViewManip.getFocusPlaneNpc(vp);
      vp.npcToWorld(this._lastReadPt, this._lastReadPt);

      // Rotate view to look straight down...
      // const frust = vp.getWorldFrustum();
      // const saveFrustum = frust.clone();

      // const viewUp = vp.view.getYVector();
      // const viewDir = vp.view.getZVector(); viewDir.scaleInPlace(-1);
      // const worldUp = Vector3d.unitZ();
      // const viewAngle = worldUp.angleTo(viewUp).radians;

      // const pitchAngle = Angle.createRadians((-Math.PI / 2) - (viewDir.z < 0 ? -viewAngle : viewAngle));
      // const pitchMatrix = Matrix3d.createRotationAroundVector(Vector3d.unitX(), pitchAngle)!;
      // const pitchTimesView = pitchMatrix.multiplyMatrixMatrix(vp.rotation);

      // const invViewRot = vp.rotation.inverse()!;
      // const inverseViewTimesPitchTimesView = invViewRot.multiplyMatrixMatrix(pitchTimesView);
      // const transform = Transform.createFixedPointAndMatrix(view.getEyePoint(), inverseViewTimesPitchTimesView);

      // frust.multiply(transform);
      // vp.setupViewFromFrustum(frust);
      // this.computeCollisionData(vp, eyePt);
      // vp.setupViewFromFrustum(saveFrustum);

      this.computeCollisionData(vp, eyePt);
    }

    if (undefined === this._currentContour || this._currentContour.numPoints() < 2 || positionInput.z <= 0.0)
      return 0;

    const newEyePt = motion.transform.multiplyPoint3d(eyePt);
    const planeY = Plane3dByOriginAndUnitNormal.create(eyePt, vp.view.getYVector());
    const resultY: CurveLocationDetail[] = [];
    const nIntersectY = planeY ? this._currentContour.appendPlaneIntersectionPoints(planeY, resultY) : 0;
    const padDist = Constant.oneMeter * 0.5; // stop well before point directly underfoot to avoid clipping through walls...

    if (0 !== nIntersectY) {
      let resultVec;
      for (const intsec of resultY) {
        const resultNpc = vp.worldToNpc(intsec.point);
        if (resultNpc.z >= 1 || resultNpc.z <= 0)
          continue;

        const hitVec = Vector3d.createStartEnd(newEyePt, intsec.point);
        if (undefined === resultVec)
          resultVec = hitVec;
        else if (hitVec.magnitude() < resultVec.magnitude())
          resultVec.setFrom(hitVec);
      }

      if (undefined !== resultVec) {
        const eyeVec = Vector3d.createStartEnd(eyePt, newEyePt);
        if (eyeVec.dotProduct(resultVec) <= 0.0 || resultVec.magnitude() < padDist)
          return 1; // Stay put, high barrier...
      }
    }

    if (!ToolSettings.walkDetectFloor || undefined === this._lastReference)
      return 0;

    const forwardDir = Vector3d.unitZ().crossProduct(vp.view.getXVector());
    const planeZ = Plane3dByOriginAndUnitNormal.create(newEyePt, forwardDir);
    const resultZ: CurveLocationDetail[] = [];
    const nIntersectZ = planeZ ? this._currentContour.appendPlaneIntersectionPoints(planeZ, resultZ) : 0;

    if (0 !== nIntersectZ) {
      const heightPt = Point3d.create();
      const maintainHeight = Vector3d.create();

      for (const intsec of resultZ) {
        if (intsec.point.z > newEyePt.z)
          continue; // Ignore overhead point...

        const refPt = this._lastReference.projectPointToPlane(intsec.point);
        const offset = Vector3d.createStartEnd(refPt, intsec.point);

        if (offset.magnitude() > maintainHeight.magnitude()) {
          heightPt.setFrom(intsec.point);
          maintainHeight.setFrom(offset);
        }
      }

      if (maintainHeight.magnitude() >= ToolSettings.walkStepHeight && maintainHeight.dotProduct(this._lastReference.getNormalRef()) > 0)
        return 2; // Stay put, low barrier...

      const moveTransform = Transform.createTranslation(maintainHeight);
      motion.transform.multiplyTransformTransform(moveTransform, motion.transform);
      this._lastReference.getOriginRef().setFrom(heightPt);
    }
    return 0;
  }

  protected getNavigateMotion(elapsedTime: number): NavigateMotion | undefined {
    const vp = this.viewTool.viewport;
    if (undefined === vp)
      return;

    const motion = this._navigateMotion;
    motion.init(elapsedTime);

    if (!vp.isCameraOn) {
      const input = this.getHorizAndVertVelocity();
      if (undefined === input)
        return;
      motion.pan(input.x, input.y);
      return motion;
    }

    const positionInput = this.getLinearVelocity();
    const angularInput = this.getAngularVelocity();

    if (0.0 === angularInput.magnitude() && 0.0 === positionInput.magnitude() && undefined === this._lastMovement)
      return;

    this.requestPointerLock(false); // Ignore engagement events after modification starts (either from mouse or keys)...
    const current = IModelApp.toolAdmin.currentInputState;
    if (!this._havePointerLock && InputSource.Mouse === current.inputSource && !current.isDragging(BeButton.Data))
      current.onStartDrag(BeButton.Data); // Treat data down -> navigate key -> data up the same as a drag...

    if (undefined !== this._lastMovement) {
      if (motion.moveAndMouseLook(this._accumulator, positionInput, this._lastMovement, true))
        this._lastMovement = undefined;
    } else {
      motion.moveAndLook(positionInput, angularInput.x, angularInput.y, true);
    }

    const prevCollision = this._lastCollision;
    this._lastCollision = this.checkForCollision(vp, motion, positionInput);
    if (this._lastCollision !== prevCollision)
      vp.invalidateDecorations();

    return this._lastCollision ? undefined : motion;
  }

  protected enableDynamicUpdate(vp: ScreenViewport): void {
    const tool = this.viewTool;
    if (tool.inDynamicUpdate)
      return;

    tool.changeViewport(vp);
    tool.viewport!.setAnimator(this);
    tool.inDynamicUpdate = true;
    tool.inHandleModify = true;

    vp.npcToView(NpcCenter, this._anchorPtView);
    this._lastPtView.setFrom(this._anchorPtView); // Display indicator in the middle of the view...
  }

  private toggleCollisions(): void {
    ToolSettings.walkCollisions = !ToolSettings.walkCollisions;
    this._lastCollision = 0;
    this._lastReference = this._lastContour = this._currentContour = undefined;
    if (this.viewTool.viewport)
      this.viewTool.viewport.invalidateDecorations();
  }

  private toggleDetectFloor(): void {
    ToolSettings.walkDetectFloor = !ToolSettings.walkDetectFloor;
    if (ToolSettings.walkDetectFloor && !ToolSettings.walkCollisions)
      return this.toggleCollisions();
    this._lastReference = this._lastContour = this._currentContour = undefined;
    if (this.viewTool.viewport)
      this.viewTool.viewport.invalidateDecorations();
  }

  private changeWalkVelocity(increase?: boolean): void {
    if (undefined === increase)
      ToolSettings.walkVelocityChange = 0;
    else
      ToolSettings.walkVelocityChange = Geometry.clamp(ToolSettings.walkVelocityChange + (increase ? 1 : -1), -9, 9);
    if (this.viewTool.viewport)
      this.viewTool.viewport.invalidateDecorations();
  }

  public override onWheel(ev: BeWheelEvent): boolean {
    const tool = this.viewTool;
    if (!tool.inHandleModify || undefined === tool.viewport)
      return super.onWheel(ev);
    const focusHandle = tool.viewHandles.focusHandle;
    if (undefined === focusHandle || ViewHandleType.LookAndMove !== focusHandle.handleType)
      return super.onWheel(ev);
    this.changeWalkVelocity(ev.wheelDelta > 0);
    tool.viewport.setAnimator(this); // animator was cleared by wheel event...
    return true;
  }

  private isNavigationKey(keyEvent: KeyboardEvent): boolean {
    if (keyEvent.repeat || keyEvent.ctrlKey || keyEvent.altKey)
      return false;

    switch (keyEvent.key.toLowerCase()) {
      case "arrowright":
      case "d":
      case "arrowleft":
      case "a":
      case "arrowup":
      case "w":
      case "arrowdown":
      case "s":
      case "pagedown":
      case "q":
      case "pageup":
      case "e":
        return true;
      default:
        return false;
    }
  }

  private enableKeyStart(): boolean {
    const vp = this.viewTool.viewport;
    if (0 !== this.viewTool.nPts || undefined === vp)
      return false;

    const pt = vp.view.getTargetPoint();
    const ev = new BeButtonEvent({ point: pt, rawPoint: pt, viewPoint: vp.worldToView(pt), viewport: vp, inputSource: InputSource.Mouse, isDown: true });
    this.viewTool.changeViewport(ev.viewport);
    if (!this.viewTool.processFirstPoint(ev))
      return false;

    this.viewTool.nPts = 1;
    return true;
  }

  public override onKeyTransition(wentDown: boolean, keyEvent: KeyboardEvent): boolean {
    if (!this.viewTool.inDynamicUpdate) {
      this._positionInput.setZero(); // clear input from a previous dynamic update...
      if (!wentDown || !this.isNavigationKey(keyEvent) || !this.enableKeyStart())
        return false;
    }

    if (keyEvent.ctrlKey || keyEvent.altKey)
      return false;

    switch (keyEvent.key.toLowerCase()) {
      case "arrowright":
      case "d":
        this._positionInput.x = Geometry.clamp(this._positionInput.x + (wentDown ? 1.0 : -1.0), -1.0, 1.0);
        return true;
      case "arrowleft":
      case "a":
        this._positionInput.x = Geometry.clamp(this._positionInput.x + (wentDown ? -1.0 : 1.0), -1.0, 1.0);
        return true;
      case "arrowup":
      case "w":
        this._positionInput.z = Geometry.clamp(this._positionInput.z + (wentDown ? 1.0 : -1.0), -1.0, 1.0);
        return true;
      case "arrowdown":
      case "s":
        this._positionInput.z = Geometry.clamp(this._positionInput.z + (wentDown ? -1.0 : 1.0), -1.0, 1.0);
        return true;
      case "pagedown":
      case "q":
        this._positionInput.y = Geometry.clamp(this._positionInput.y + (wentDown ? 1.0 : -1.0), -1.0, 1.0);
        return true;
      case "pageup":
      case "e":
        this._positionInput.y = Geometry.clamp(this._positionInput.y + (wentDown ? -1.0 : 1.0), -1.0, 1.0);
        return true;
      case "c":
        if (wentDown)
          this.toggleCollisions();
        return true;
      case "z":
        if (wentDown)
          this.toggleDetectFloor();
        return true;
      case "+":
        if (wentDown)
          this.changeWalkVelocity(true);
        return true;
      case "-":
        if (wentDown)
          this.changeWalkVelocity(false);
        return true;
      case "=":
        if (wentDown)
          this.changeWalkVelocity();
        return true;
      default:
        return false;
    }
  }

  protected getTouchControlRadius(vp: Viewport): number {
    const viewRect = vp.viewRect;
    const radius = Math.floor(Math.min(viewRect.width, viewRect.height) / 15.0) + 0.5;
    const minRadius = vp.pixelsFromInches(0.1);
    const maxRadius = vp.pixelsFromInches(1.0);
    return Geometry.clamp(radius, minRadius, maxRadius);
  }

  protected getTouchZoneLowerLeft(vp: Viewport): ViewRect {
    const viewRect = vp.viewRect;
    const rectLL = viewRect.clone();
    rectLL.top += viewRect.height * 0.6;
    rectLL.right -= viewRect.width * 0.6;
    rectLL.insetByPercent(0.05);
    return rectLL;
  }

  protected getTouchZoneLowerRight(vp: Viewport): ViewRect {
    const viewRect = vp.viewRect;
    const rectLR = viewRect.clone();
    rectLR.top += viewRect.height * 0.6;
    rectLR.left += viewRect.width * 0.6;
    rectLR.insetByPercent(0.05);
    return rectLR;
  }

  protected getTouchStartPosition(touchStart: BeTouchEvent | undefined): Point2d | undefined {
    if (undefined === touchStart || undefined === touchStart.viewport)
      return undefined;
    return BeTouchEvent.getTouchPosition(touchStart.touchEvent.changedTouches[0], touchStart.viewport);
  }

  protected getTouchOffset(touchStart: BeTouchEvent | undefined, radius: number): Vector2d {
    const offset = Vector2d.create();
    if (undefined === this._touchLast)
      return offset;

    const position = this.getTouchStartPosition(touchStart);
    if (undefined === position)
      return offset;

    const lastTouch = BeTouchEvent.findTouchById(this._touchLast.touchEvent.targetTouches, touchStart!.touchEvent.changedTouches[0].identifier);
    if (undefined === lastTouch)
      return offset;

    const minOffsetRadius = Math.floor(radius * 0.1) + 0.5;
    const maxOffsetRadius = Math.floor(radius * 1.2) + 0.5;
    const lastPos = BeTouchEvent.getTouchPosition(lastTouch, touchStart!.viewport!);
    const lastVec = Vector2d.createStartEnd(position, lastPos);

    if (lastVec.magnitude() > maxOffsetRadius)
      lastVec.scaleToLength(maxOffsetRadius, lastVec);
    if (lastVec.magnitude() > minOffsetRadius)
      offset.plus(lastVec, offset);

    return offset;
  }

  public override onTouchStart(ev: BeTouchEvent): boolean {
    if (undefined === ev.viewport || !ev.viewport.isCameraOn || 1 !== ev.touchEvent.changedTouches.length)
      return (undefined === this._touchStartL && undefined !== this._touchStartR ? false : true);

    const startPos = this.getTouchStartPosition(ev);
    if (undefined === startPos)
      return false;

    const rectLL = this.getTouchZoneLowerLeft(ev.viewport);
    const rectLR = this.getTouchZoneLowerRight(ev.viewport);

    if (undefined === this._touchStartL && rectLL.containsPoint(startPos)) {
      this._touchStartL = this._touchLast = ev;
      ev.viewport.invalidateDecorations();
      return true;
    }

    if (undefined === this._touchStartR && rectLR.containsPoint(startPos)) {
      this._touchStartR = this._touchLast = ev;
      ev.viewport.invalidateDecorations();
      return true;
    }

    return false;
  }

  public override onTouchEnd(ev: BeTouchEvent): boolean {
    let changed = false;

    if (undefined !== this._touchStartL && undefined !== BeTouchEvent.findTouchById(ev.touchEvent.changedTouches, this._touchStartL.touchEvent.changedTouches[0].identifier)) {
      this._touchStartL = undefined;
      changed = true;
    }

    if (undefined !== this._touchStartR && undefined !== BeTouchEvent.findTouchById(ev.touchEvent.changedTouches, this._touchStartR.touchEvent.changedTouches[0].identifier)) {
      this._touchStartR = undefined;
      changed = true;
    }

    if (changed && undefined !== ev.viewport)
      ev.viewport.invalidateDecorations();

    return changed;
  }

  public override onTouchComplete(_ev: BeTouchEvent): boolean {
    if (!this.viewTool.inDynamicUpdate || undefined === this._touchLast)
      return false;
    this.viewTool.onReinitialize();
    return true;
  }

  public override onTouchCancel(ev: BeTouchEvent): boolean {
    return this.onTouchComplete(ev);
  }

  public override onTouchMove(ev: BeTouchEvent): boolean {
    if (undefined === ev.viewport || !this.viewTool.inDynamicUpdate || (undefined === this._touchStartL && undefined === this._touchStartR))
      return false;

    let changed = false;

    if (undefined !== this._touchStartL && undefined !== BeTouchEvent.findTouchById(ev.touchEvent.changedTouches, this._touchStartL.touchEvent.changedTouches[0].identifier))
      changed = true;

    if (undefined !== this._touchStartR && undefined !== BeTouchEvent.findTouchById(ev.touchEvent.changedTouches, this._touchStartR.touchEvent.changedTouches[0].identifier))
      changed = true;

    if (changed) {
      this._touchLast = ev;
      ev.viewport.invalidateDecorations();
    }

    return true;
  }

  public override onTouchMoveStart(ev: BeTouchEvent, _startEv: BeTouchEvent): boolean {
    if (undefined === ev.viewport)
      return false;

    if (undefined === this._touchStartL && undefined === this._touchStartR)
      return false;

    this.enableDynamicUpdate(ev.viewport);
    return true;
  }

  public override onTouchTap(ev: BeTouchEvent): boolean {
    if (undefined === ev.viewport || this.viewTool.inDynamicUpdate || !ev.isSingleTap)
      return false;

    const rectLL = this.getTouchZoneLowerLeft(ev.viewport);
    if (rectLL.containsPoint(ev.viewPoint))
      this._touchElevate = !this._touchElevate; // Toggle elevate mode for left control until next touch complete...

    const rectLR = this.getTouchZoneLowerRight(ev.viewport);
    if (rectLR.containsPoint(ev.viewPoint))
      this._touchSpeedUp = !this._touchSpeedUp; // Toggle speed increase for left control until next touch complete...

    return false;
  }

  public override drawHandle(context: DecorateContext, hasFocus: boolean): void {
    super.drawHandle(context, hasFocus);
    if (!hasFocus || context.viewport !== this.viewTool.viewport)
      return;

    // if (undefined !== this._currentContour && this._currentContour.numPoints() > 0) {
    //   const builder = context.createGraphicBuilder(GraphicType.WorldOverlay);
    //   const color = context.viewport.getContrastToBackgroundColor();

    //   builder.setSymbology(color, color, 8);

    //   if (this._currentContour.numPoints() > 1)
    //     builder.addLineString(this._currentContour.points);
    //   else
    //     builder.addPointString(this._currentContour.points);

    //   builder.setSymbology(ColorDef.blue, color, 15);
    //   builder.addPointString([this._lastReadPt]);

    //   if (this._lastReference) {
    //     builder.setSymbology(ColorDef.green, color, 15);
    //     builder.addPointString([this._lastReference.getOriginRef()]);
    //   }

    //   context.addDecorationFromBuilder(builder);
    // }

    if (ToolSettings.walkCollisions && this.viewTool.inDynamicUpdate) {
      const position = this._anchorPtView.clone();
      position.x = Math.floor(position.x) + 0.5;
      position.y = Math.floor(position.y) + 0.5;

      const drawCollisionArrows = (ctx: CanvasRenderingContext2D) => {
        const arrowSize = 20;
        const addArrow = (angle: number) => {
          const end = arrowSize;
          const start = end / 2;
          const mid = start / 2;
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(start, 0);
          ctx.lineTo(end, 0);
          ctx.moveTo(start, 0);
          ctx.lineTo(start + mid, mid);
          ctx.moveTo(start, 0);
          ctx.lineTo(start + mid, -mid);
          ctx.stroke();
          ctx.rotate(-angle);
        };

        ctx.strokeStyle = "black";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        addArrow(0);
        addArrow(Math.PI);

        ctx.strokeStyle = (1 === this._lastCollision ? "red" : "white");
        ctx.lineWidth = 1;
        addArrow(0);
        addArrow(Math.PI);

        if (ToolSettings.walkDetectFloor) {
          ctx.strokeStyle = "black";
          ctx.lineWidth = 5;
          addArrow(-Math.PI / 2);
          ctx.strokeStyle = (2 === this._lastCollision ? "red" : "white");
          ctx.lineWidth = 1;
          addArrow(-Math.PI / 2);
        }
      };
      context.addCanvasDecoration({ position, drawDecoration: drawCollisionArrows });
    }

    if ((0 !== ToolSettings.walkVelocityChange || this._touchSpeedUp) && this.viewTool.inDynamicUpdate) {
      const arrowSize = 12;
      const speedUp = (ToolSettings.walkVelocityChange > 0 || this._touchSpeedUp ? true : false);
      const position = this._anchorPtView.clone();
      position.x = Math.floor(position.x) + 0.5;
      position.y = Math.floor(position.y + (arrowSize / 3)) + 0.5;

      const drawSpeedChange = (ctx: CanvasRenderingContext2D) => {
        const addArrows = () => {
          const end = arrowSize;
          const start = end / 2;
          const midY = (end + start) / 2;
          const midX = (arrowSize / 4) * (speedUp ? 1 : -1);
          ctx.beginPath();
          ctx.moveTo(0, start);
          ctx.lineTo(midX, midY);
          ctx.lineTo(0, end);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-midX, start);
          ctx.lineTo(0, midY);
          ctx.lineTo(-midX, end);
          ctx.stroke();
        };

        ctx.strokeStyle = "black";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        addArrows();

        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        addArrows();
      };
      context.addCanvasDecoration({ position, drawDecoration: drawSpeedChange });
    }

    const positionL = this.getTouchStartPosition(this._touchStartL);
    const positionR = this.getTouchStartPosition(this._touchStartR);

    if (undefined === positionL && undefined === positionR)
      return;

    const outerRadius = this.getTouchControlRadius(context.viewport);
    const innerRadius = Math.floor(outerRadius * 0.65) + 0.5;
    const offsetL = this.getTouchOffset(this._touchStartL, outerRadius);
    const offsetR = this.getTouchOffset(this._touchStartR, outerRadius);

    const drawDecoration = (ctx: CanvasRenderingContext2D, isLeft: boolean) => {
      ctx.beginPath();
      ctx.strokeStyle = "black";
      ctx.fillStyle = "rgba(150,150,150,0.4)";
      ctx.lineWidth = 2;
      ctx.arc(0, 0, outerRadius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fill();

      ctx.shadowColor = "black";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 5;

      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = innerRadius;
      ctx.lineCap = "round";
      ctx.moveTo(0, 0);
      ctx.lineTo(isLeft ? offsetL.x : offsetR.x, isLeft ? offsetL.y : offsetR.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = "black";
      ctx.fillStyle = "rgba(200,200,200,0.8";
      ctx.lineWidth = 1;
      ctx.arc(isLeft ? offsetL.x : offsetR.x, isLeft ? offsetL.y : offsetR.y, innerRadius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fill();
    };

    const drawDecorationL = (ctx: CanvasRenderingContext2D) => { drawDecoration(ctx, true); };
    const drawDecorationR = (ctx: CanvasRenderingContext2D) => { drawDecoration(ctx, false); };

    if (undefined !== positionL)
      context.addCanvasDecoration({ position: positionL, drawDecoration: drawDecorationL });

    if (undefined !== positionR)
      context.addCanvasDecoration({ position: positionR, drawDecoration: drawDecorationR });
  }
}

/** ViewingToolHandle for performing the "walk view" operation */
class ViewWalk extends ViewNavigate {
  private _navigateMotion: NavigateMotion;

  constructor(viewManip: ViewManip) {
    super(viewManip);
    this._navigateMotion = new NavigateMotion(this.viewTool.viewport!);
  }
  public get handleType(): ViewHandleType { return ViewHandleType.Walk; }
  public override firstPoint(ev: BeButtonEvent): boolean { this.viewTool.provideToolAssistance("Walk.Prompts.NextPoint"); return super.firstPoint(ev); }

  protected getNavigateMotion(elapsedTime: number): NavigateMotion | undefined {
    const input = this.getInputVector();
    if (undefined === input)
      return undefined;

    const motion = this._navigateMotion;
    motion.init(elapsedTime);

    switch (this.getNavigateMode()) {
      case NavigateMode.Pan:
        input.scale(this.getMaxLinearVelocity(), input);
        motion.pan(input.x, input.y);
        break;
      case NavigateMode.Look:
        input.scale(-this.getMaxAngularVelocity(), input);
        motion.look(input.x, input.y);
        break;
      case NavigateMode.Travel:
        motion.travel(-input.x * this.getMaxAngularVelocity(), 0, -input.y * this.getMaxLinearVelocity(), true);
        break;
    }

    return motion;
  }
}

/** ViewingToolHandle for performing the "fly view" operation */
class ViewFly extends ViewNavigate {
  private _navigateMotion: NavigateMotion;

  constructor(viewManip: ViewManip) {
    super(viewManip);
    this._navigateMotion = new NavigateMotion(this.viewTool.viewport!);
  }
  public get handleType(): ViewHandleType { return ViewHandleType.Fly; }
  public override firstPoint(ev: BeButtonEvent): boolean { this.viewTool.provideToolAssistance("Fly.Prompts.NextPoint"); return super.firstPoint(ev); }

  protected getNavigateMotion(elapsedTime: number): NavigateMotion | undefined {
    const input = this.getInputVector();
    if (undefined === input)
      return undefined;

    const motion = this._navigateMotion;
    motion.init(elapsedTime);

    switch (this.getNavigateMode()) {
      case NavigateMode.Pan:
        input.scale(this.getMaxLinearVelocity(), input);
        motion.pan(input.x, input.y);
        break;
      case NavigateMode.Look:
        input.scale(-this.getMaxAngularVelocity(), input);
        motion.look(input.x, input.y);
        break;
      case NavigateMode.Travel:
        input.scale(-this.getMaxAngularVelocity() * 2.0, input);
        motion.travel(input.x, input.y, this.getMaxLinearVelocity(), false);
        break;
    }

    return motion;
  }
}

/** The tool that performs a Pan view operation
 * @public
 */
export class PanViewTool extends ViewManip {
  public static override toolId = "View.Pan";
  public static override iconSpec = "icon-hand-2";
  constructor(vp: ScreenViewport | undefined, oneShot = false, isDraggingRequired = false) {
    super(vp, ViewHandleType.Pan, oneShot, isDraggingRequired);
  }
  public override onReinitialize(): void {
    super.onReinitialize();
    this.provideToolAssistance("Pan.Prompts.FirstPoint");
  }
}

/** A tool that performs a Rotate view operation
 * @public
 */
export class RotateViewTool extends ViewManip {
  public static override toolId = "View.Rotate";
  public static override iconSpec = "icon-gyroscope";
  constructor(vp: ScreenViewport, oneShot = false, isDraggingRequired = false) {
    super(vp, ViewHandleType.Rotate | ViewHandleType.Pan | ViewHandleType.TargetCenter, oneShot, isDraggingRequired);
  }
  public override onReinitialize(): void { super.onReinitialize(); this.provideToolAssistance("Rotate.Prompts.FirstPoint"); }
}

/** A tool that performs the look operation
 * @public
 */
export class LookViewTool extends ViewManip {
  public static override toolId = "View.Look";
  public static override iconSpec = "icon-view-navigation";
  constructor(vp: ScreenViewport, oneShot = false, isDraggingRequired = false) {
    super(vp, ViewHandleType.Look | ViewHandleType.Pan, oneShot, isDraggingRequired);
  }
  public override onReinitialize(): void { super.onReinitialize(); this.provideToolAssistance("Look.Prompts.FirstPoint"); }
}

/** A tool that performs the scroll operation
 * @public
 */
export class ScrollViewTool extends ViewManip {
  public static override toolId = "View.Scroll";
  public static override iconSpec = "icon-move";
  constructor(vp: ScreenViewport, oneShot = false, isDraggingRequired = false) {
    super(vp, ViewHandleType.Scroll, oneShot, isDraggingRequired);
  }
  public override onReinitialize(): void { super.onReinitialize(); this.provideToolAssistance("Scroll.Prompts.FirstPoint"); }
}

/** A tool that performs the zoom operation
 * @public
 */
export class ZoomViewTool extends ViewManip {
  public static override toolId = "View.Zoom";
  public static override iconSpec = "icon-zoom";
  constructor(vp: ScreenViewport, oneShot = false, isDraggingRequired = false) {
    super(vp, ViewHandleType.Zoom | ViewHandleType.Pan, oneShot, isDraggingRequired);
  }
  public override onReinitialize(): void { super.onReinitialize(); this.provideToolAssistance("Zoom.Prompts.FirstPoint"); }
}

/** A tool that performs the walk operation using mouse+keyboard or touch controls.
 * Keyboard and mouse controls are similar to those used by many video games:
 *  - Mouse motion: look around.
 *  - W, A, S, D (or arrow keys): move forward, left, right, or backward respectively.
 *  - E, Q (or PgUp, PgDn): move up and down respectively.
 *  - +, - (or scroll wheel): increase or decrease velocity.
 * @public
 */
export class LookAndMoveTool extends ViewManip {
  public static override toolId = "View.LookAndMove";
  public static override iconSpec = "icon-walk";
  constructor(vp: ScreenViewport, oneShot = false, isDraggingRequired = false) {
    const viewport = (undefined === vp ? IModelApp.viewManager.selectedView : vp); // Need vp to enable camera/check lens in onReinitialize...
    super(viewport, ViewHandleType.LookAndMove | ViewHandleType.Pan, oneShot, isDraggingRequired);
  }
  public override onReinitialize(): void { super.onReinitialize(); this.provideToolAssistance("LookAndMove.Prompts.FirstPoint"); }

  /** @beta */
  public override provideToolAssistance(mainInstrKey: string): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, ViewTool.translate(mainInstrKey));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    const acceptMsg = this.inDynamicUpdate ? CoreTools.translate("ElementSet.Inputs.AcceptPoint") : ViewTool.translate("LookAndMove.Inputs.AcceptLookPoint");
    const rejectMsg = CoreTools.translate("ElementSet.Inputs.Exit");

    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, acceptMsg, false, ToolAssistanceInputMethod.Mouse));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, rejectMsg, false, ToolAssistanceInputMethod.Mouse));

    mouseInstructions.push(ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["W"], ["A", "S", "D"]), ViewTool.translate("LookAndMove.Inputs.WalkKeys"), false));
    mouseInstructions.push(ToolAssistance.createKeyboardInstruction(ToolAssistance.arrowKeyboardInfo, ViewTool.translate("LookAndMove.Inputs.WalkKeys"), false));
    mouseInstructions.push(ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["Q", "E"]), ViewTool.translate("LookAndMove.Inputs.ElevateKeys"), false));
    mouseInstructions.push(ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["\u21de", "\u21df"]), ViewTool.translate("LookAndMove.Inputs.ElevateKeys"), false));
    mouseInstructions.push(ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["C", "Z"]), ViewTool.translate("LookAndMove.Inputs.CollideKeys"), false));
    mouseInstructions.push(ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["+", "-"]), ViewTool.translate("LookAndMove.Inputs.VelocityChange"), false));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.MouseWheel, ViewTool.translate("LookAndMove.Inputs.VelocityChange"), false, ToolAssistanceInputMethod.Mouse));

    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TouchCursorDrag, ViewTool.translate("LookAndMove.Inputs.TouchZoneLL"), false, ToolAssistanceInputMethod.Touch));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TouchCursorDrag, ViewTool.translate("LookAndMove.Inputs.TouchZoneLR"), false, ToolAssistanceInputMethod.Touch));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, ViewTool.translate("LookAndMove.Inputs.TouchTapLL"), false, ToolAssistanceInputMethod.Touch));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, ViewTool.translate("LookAndMove.Inputs.TouchTapLR"), false, ToolAssistanceInputMethod.Touch));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchDrag, acceptMsg, false, ToolAssistanceInputMethod.Touch));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, rejectMsg, false, ToolAssistanceInputMethod.Touch));

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }
}

/** A tool that performs the walk operation
 * @public
 */
export class WalkViewTool extends ViewManip {
  public static override toolId = "View.Walk";
  public static override iconSpec = "icon-walk";
  constructor(vp: ScreenViewport, oneShot = false, isDraggingRequired = false) {
    const viewport = (undefined === vp ? IModelApp.viewManager.selectedView : vp); // Need vp to enable camera/check lens in onReinitialize...
    super(viewport, ViewHandleType.Walk | ViewHandleType.Pan, oneShot, isDraggingRequired);
  }
  public override onReinitialize(): void { super.onReinitialize(); this.provideToolAssistance("Walk.Prompts.FirstPoint"); }

  /** @beta */
  public override provideToolAssistance(mainInstrKey: string): void {
    const walkInstructions: ToolAssistanceInstruction[] = [];
    walkInstructions.push(ToolAssistance.createModifierKeyInstruction(ToolAssistance.shiftKey, ToolAssistanceImage.LeftClickDrag, ViewTool.translate("Pan.flyover"), false, ToolAssistanceInputMethod.Mouse));
    walkInstructions.push(ToolAssistance.createModifierKeyInstruction(ToolAssistance.ctrlKey, ToolAssistanceImage.LeftClickDrag, ViewTool.translate("Look.flyover"), false, ToolAssistanceInputMethod.Mouse));
    super.provideToolAssistance(mainInstrKey, walkInstructions);
  }
}

/** A tool that performs the fly operation
 * @public
 */
export class FlyViewTool extends ViewManip {
  public static override toolId = "View.Fly";
  public static override iconSpec = "icon-airplane";
  constructor(vp: ScreenViewport, oneShot = false, isDraggingRequired = false) {
    super(vp, ViewHandleType.Fly | ViewHandleType.Pan, oneShot, isDraggingRequired);
  }
  public override onReinitialize(): void { super.onReinitialize(); this.provideToolAssistance("Fly.Prompts.FirstPoint"); }

  /** @beta */
  public override provideToolAssistance(mainInstrKey: string): void {
    const flyInstructions: ToolAssistanceInstruction[] = [];
    flyInstructions.push(ToolAssistance.createModifierKeyInstruction(ToolAssistance.shiftKey, ToolAssistanceImage.LeftClickDrag, ViewTool.translate("Pan.flyover"), false, ToolAssistanceInputMethod.Mouse));
    flyInstructions.push(ToolAssistance.createModifierKeyInstruction(ToolAssistance.ctrlKey, ToolAssistanceImage.LeftClickDrag, ViewTool.translate("Look.flyover"), false, ToolAssistanceInputMethod.Mouse));
    super.provideToolAssistance(mainInstrKey, flyInstructions);
  }
}

/** A tool that performs a fit view
 * @public
 */
export class FitViewTool extends ViewTool {
  public static override toolId = "View.Fit";
  public static override iconSpec = "icon-fit-to-view";
  public oneShot: boolean;
  public doAnimate: boolean;
  public isolatedOnly: boolean;
  constructor(viewport: ScreenViewport, oneShot: boolean, doAnimate = true, isolatedOnly = true) {
    super(viewport);
    this.viewport = viewport;
    this.oneShot = oneShot;
    this.doAnimate = doAnimate;
    this.isolatedOnly = isolatedOnly;
  }

  /** @beta */
  public provideToolAssistance(): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, ViewTool.translate("Fit.Prompts.FirstPoint"));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    const acceptMsg = CoreTools.translate("ElementSet.Inputs.Accept");
    const rejectMsg = CoreTools.translate("ElementSet.Inputs.Exit");
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, acceptMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, acceptMsg, false, ToolAssistanceInputMethod.Mouse));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, rejectMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, rejectMsg, false, ToolAssistanceInputMethod.Mouse));

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (ev.viewport)
      return await this.doFit(ev.viewport, this.oneShot, this.doAnimate, this.isolatedOnly) ? EventHandled.Yes : EventHandled.No;

    return EventHandled.No;
  }

  public override onPostInstall() {
    super.onPostInstall();
    if (undefined === this.viewport || !this.oneShot)
      this.provideToolAssistance();

    if (this.viewport)
      this.doFit(this.viewport, this.oneShot, this.doAnimate, this.isolatedOnly); // eslint-disable-line @typescript-eslint/no-floating-promises
  }

  public async doFit(viewport: ScreenViewport, oneShot: boolean, doAnimate = true, isolatedOnly = true): Promise<boolean> {
    if (!isolatedOnly || !await ViewManip.zoomToAlwaysDrawnExclusive(viewport, { animateFrustumChange: doAnimate }))
      ViewManip.fitViewWithGlobeAnimation(viewport, doAnimate);
    if (oneShot)
      this.exitTool();
    return oneShot;
  }
}

/** A tool that views a location on the background map from a satellite's perspective; the viewed location is derived from the position of the current camera's eye above the background map. Operates on the selected view.
 * @public
 */
export class ViewGlobeSatelliteTool extends ViewTool {
  public static override toolId = "View.GlobeSatellite";
  // public static iconSpec = "icon-view-globe-satellite"; // ###TODO: need icon for this
  public oneShot: boolean;
  public doAnimate: boolean;
  constructor(viewport: ScreenViewport, oneShot = true, doAnimate = true) {
    super(viewport);
    this.viewport = viewport;
    this.oneShot = oneShot;
    this.doAnimate = doAnimate;
  }

  /** @internal */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (ev.viewport)
      return (await this._beginSatelliteView(ev.viewport, this.oneShot, this.doAnimate)) ? EventHandled.Yes : EventHandled.No;

    return EventHandled.No;
  }

  /** @internal */
  public override onPostInstall() {
    super.onPostInstall();
    const viewport = undefined === this.viewport ? IModelApp.viewManager.selectedView : this.viewport;
    if (viewport) {
      (async () => {
        await this._beginSatelliteView(viewport, this.oneShot, this.doAnimate);
      })().catch(() => { });
    }
  }

  private async _beginSatelliteView(viewport: ScreenViewport, oneShot: boolean, doAnimate = true): Promise<boolean> {
    const carto = await eyeToCartographicOnGlobeFromGcs(viewport);
    if (carto !== undefined) {
      (async () => { // eslint-disable-line @typescript-eslint/no-floating-promises
        let elevationOffset = 0;
        const elevation = await queryTerrainElevationOffset(viewport, carto);
        if (elevation !== undefined)
          elevationOffset = elevation;
        return this._doSatelliteView(viewport, oneShot, doAnimate, elevationOffset);
      })().catch(() => { });
    }
    return true;
  }

  private _doSatelliteView(viewport: ScreenViewport, oneShot: boolean, doAnimate = true, elevationOffset = 0): boolean {
    viewGlobalLocation(viewport, doAnimate, ViewGlobalLocationConstants.satelliteHeightAboveEarthInMeters + elevationOffset);
    if (oneShot)
      this.exitTool();
    return oneShot;
  }
}

/** A tool that views a location on the background map from a bird's eye perspective; the viewed location is derived from the position of the current camera's eye above the background map. Operates on the selected view.
 * @public
 */
export class ViewGlobeBirdTool extends ViewTool {
  public static override toolId = "View.GlobeBird";
  // public static iconSpec = "icon-view-globe-bird"; // ###TODO: need icon for this
  public oneShot: boolean;
  public doAnimate: boolean;
  constructor(viewport: ScreenViewport, oneShot = true, doAnimate = true) {
    super(viewport);
    this.viewport = viewport;
    this.oneShot = oneShot;
    this.doAnimate = doAnimate;
  }

  /** @internal */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (ev.viewport)
      return (await this._beginDoBirdView(ev.viewport, this.oneShot, this.doAnimate)) ? EventHandled.Yes : EventHandled.No;

    return EventHandled.No;
  }

  /** @internal */
  public override onPostInstall() {
    super.onPostInstall();
    const viewport = undefined === this.viewport ? IModelApp.viewManager.selectedView : this.viewport;
    if (viewport) {
      (async () => {
        await this._beginDoBirdView(viewport, this.oneShot, this.doAnimate);
      })().catch(() => { });
    }
  }

  private async _beginDoBirdView(viewport: ScreenViewport, oneShot: boolean, doAnimate = true): Promise<boolean> {
    const carto = await eyeToCartographicOnGlobeFromGcs(viewport);
    if (carto !== undefined) {
      (async () => { // eslint-disable-line @typescript-eslint/no-floating-promises
        let elevationOffset = 0;
        const elevation = await queryTerrainElevationOffset(viewport, carto);
        if (elevation !== undefined)
          elevationOffset = elevation;
        return this._doBirdView(viewport, oneShot, doAnimate, elevationOffset);
      })().catch(() => { });
    }
    return true;
  }

  private _doBirdView(viewport: ScreenViewport, oneShot: boolean, doAnimate = true, elevationOffset = 0): boolean {
    viewGlobalLocation(viewport, doAnimate, ViewGlobalLocationConstants.birdHeightAboveEarthInMeters + elevationOffset, ViewGlobalLocationConstants.birdPitchAngleRadians);
    if (oneShot)
      this.exitTool();
    return oneShot;
  }
}

/** A tool that views a location on the background map corresponding to a specified string.
 * This will either look down at the location using a bird's eye height, or, if a range is available, the entire range corresponding to the location will be viewed.
 * Operates on the selected view.
 * @public
 */
export class ViewGlobeLocationTool extends ViewTool {
  private _globalLocation?: GlobalLocation;

  public static override toolId = "View.GlobeLocation";
  // public static iconSpec = "icon-view-globe-location"; // ###TODO: need icon for this
  public oneShot: boolean;
  public doAnimate: boolean;
  constructor(viewport: ScreenViewport, oneShot = true, doAnimate = true) {
    super(viewport);
    this.viewport = viewport;
    this.oneShot = oneShot;
    this.doAnimate = doAnimate;
  }

  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return undefined; }

  /** This runs the tool based on the provided location arguments.
   * arguments: latitude longitude | string
   * If specified, the latitude and longitude arguments are numbers specified in degrees.
   * If specified, the string argument contains a location name. Examples of location name include named geographic areas like "Seattle, WA" or "Alaska", a specific address like "1600 Pennsylvania Avenue NW, Washington, DC 20500", or a place name like "Philadelphia Museum of Art".
   **/
  public override parseAndRun(...args: string[]): boolean {
    if (2 === args.length) { // try to parse latitude and longitude
      const latitude = parseFloat(args[0]);
      const longitude = parseFloat(args[1]);
      if (!Number.isNaN(latitude) || !Number.isNaN(longitude)) {
        const center = Cartographic.fromRadians(Angle.degreesToRadians(longitude), Angle.degreesToRadians(latitude));
        this._globalLocation = { center };
      }
    }

    if (this._globalLocation === undefined) {
      const locationString = args.join(" ");
      const bingLocationProvider = new BingLocationProvider();
      (async () => { // eslint-disable-line @typescript-eslint/no-floating-promises
        this._globalLocation = await bingLocationProvider.getLocation(locationString);
        if (this._globalLocation !== undefined) {
          const viewport = undefined === this.viewport ? IModelApp.viewManager.selectedView : this.viewport;
          if (viewport !== undefined) {
            const elevationOffset = await queryTerrainElevationOffset(viewport, this._globalLocation.center);
            if (elevationOffset !== undefined)
              this._globalLocation.center.height = elevationOffset;
          }
          await this._doLocationView();
        }
      })().catch(() => { });
    }

    if (this._globalLocation !== undefined)
      return this.run();
    return true;
  }

  /** @internal */
  public override onPostInstall() {
    super.onPostInstall();
    (async () => {
      await this._doLocationView();
    })().catch(() => { });
  }

  private async _doLocationView(): Promise<boolean> {
    const viewport = undefined === this.viewport ? IModelApp.viewManager.selectedView : this.viewport;
    if (viewport) {
      if (undefined !== this._globalLocation)
        await viewport.animateFlyoverToGlobalLocation(this._globalLocation);
    }
    if (this.oneShot)
      this.exitTool();
    return this.oneShot;
  }
}

/** A tool that views the current iModel on the background map so that the extent of the project is visible. Operates on the selected view.
 * @public
 */
export class ViewGlobeIModelTool extends ViewTool {
  public static override toolId = "View.GlobeIModel";
  // public static iconSpec = "icon-view-globe-imodel"; // ###TODO: need icon for this
  public oneShot: boolean;
  public doAnimate: boolean;
  constructor(viewport: ScreenViewport, oneShot = true, doAnimate = true) {
    super(viewport);
    this.viewport = viewport;
    this.oneShot = oneShot;
    this.doAnimate = doAnimate;
  }

  /** @internal */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (ev.viewport)
      return this._doIModelView() ? EventHandled.Yes : EventHandled.No;

    return EventHandled.No;
  }

  /** @internal */
  public override onPostInstall() {
    super.onPostInstall();
    this._doIModelView();
  }

  private _doIModelView(): boolean {
    const viewport = undefined === this.viewport ? IModelApp.viewManager.selectedView : this.viewport;
    if (viewport && (viewport.view instanceof ViewState3d)) {
      const extents = viewport.view.iModel.projectExtents;
      const center = viewport.view.iModel.projectExtents.center;
      const view3d = viewport.view;
      const cartographicCenter = view3d.rootToCartographic(center);
      if (cartographicCenter !== undefined) {
        const cartographicArea = rangeToCartographicArea(view3d, extents);
        (async () => {
          await viewport.animateFlyoverToGlobalLocation({ center: cartographicCenter, area: cartographicArea });
        })().catch(() => { });
      }
    }
    if (this.oneShot)
      this.exitTool();
    return this.oneShot;
  }
}

/** A tool that rotates the view to one of the standard views.
 * @public
 */
export class StandardViewTool extends ViewTool {
  public static override toolId = "View.Standard";
  public static override iconSpec = "icon-cube-faces-top";
  constructor(viewport: ScreenViewport, private _standardViewId: StandardViewId) { super(viewport); }

  public override onPostInstall() {
    super.onPostInstall();
    if (this.viewport) {
      const vp = this.viewport;
      const id = vp.view.allow3dManipulations() ? this._standardViewId : StandardViewId.Top;
      const rMatrix = AccuDraw.getStandardRotation(id, vp, vp.isContextRotationRequired);
      const inverse = rMatrix.inverse();
      if (undefined !== inverse) {
        const targetMatrix = inverse.multiplyMatrixMatrix(vp.rotation);
        const rotateTransform = Transform.createFixedPointAndMatrix(ViewManip.getDefaultTargetPointWorld(vp), targetMatrix);
        const newFrustum = vp.getFrustum();
        newFrustum.multiply(rotateTransform);
        vp.view.setupFromFrustum(newFrustum);
        vp.synchWithView({ animateFrustumChange: true });
      }
    }
    this.exitTool();
  }
}

/** A tool that performs a Window-area view operation
 * @public
 */
export class WindowAreaTool extends ViewTool {
  public static override toolId = "View.WindowArea";
  public static override iconSpec = "icon-window-area";
  private _haveFirstPoint: boolean = false;
  private _firstPtWorld: Point3d = Point3d.create();
  private _secondPtWorld: Point3d = Point3d.create();
  private _lastPtView?: Point3d;
  private _corners = [new Point3d(), new Point3d()];
  private _shapePts = [new Point3d(), new Point3d(), new Point3d(), new Point3d(), new Point3d()];
  private _fillColor = ColorDef.from(0, 0, 255, 200);

  public override onPostInstall() { super.onPostInstall(); this.provideToolAssistance(); }
  public override onReinitialize() { this._haveFirstPoint = false; this._firstPtWorld.setZero(); this._secondPtWorld.setZero(); this.provideToolAssistance(); }
  public override async onResetButtonUp(ev: BeButtonEvent): Promise<EventHandled> { if (this._haveFirstPoint) { this.onReinitialize(); return EventHandled.Yes; } return super.onResetButtonUp(ev); }

  /** @beta */
  public provideToolAssistance(): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, ViewTool.translate(this._haveFirstPoint ? "WindowArea.Prompts.NextPoint" : "WindowArea.Prompts.FirstPoint"));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    const acceptMsg = CoreTools.translate("ElementSet.Inputs.AcceptPoint");
    const restartMsg = CoreTools.translate("ElementSet.Inputs.Restart");
    const exitMsg = CoreTools.translate("ElementSet.Inputs.Exit");
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchDrag, acceptMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, acceptMsg, false, ToolAssistanceInputMethod.Mouse));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, exitMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, this._haveFirstPoint ? restartMsg : exitMsg, false, ToolAssistanceInputMethod.Mouse));

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === ev.viewport)
      return EventHandled.Yes;

    if (undefined === this.viewport) {
      this.viewport = ev.viewport;
    } else if (!ev.viewport.view.hasSameCoordinates(this.viewport.view)) {
      if (this._haveFirstPoint)
        return EventHandled.Yes;
      this.viewport = ev.viewport;
      this._lastPtView = ev.viewPoint;
      IModelApp.viewManager.invalidateDecorationsAllViews();
      return EventHandled.Yes;
    }

    if (this._haveFirstPoint) {
      this._secondPtWorld.setFrom(ev.point);
      this.doManipulation(ev, false);
      this.onReinitialize();
      this.viewport.invalidateDecorations();
    } else {
      this._firstPtWorld.setFrom(ev.point);
      this._secondPtWorld.setFrom(this._firstPtWorld);
      this._haveFirstPoint = true;
      this._lastPtView = ev.viewPoint;
      this.provideToolAssistance();
    }

    return EventHandled.Yes;
  }

  public override async onMouseMotion(ev: BeButtonEvent) { this.doManipulation(ev, true); }
  public override async onTouchTap(ev: BeTouchEvent): Promise<EventHandled> { return ev.isSingleTap ? EventHandled.Yes : EventHandled.No; } // Prevent IdleTool from converting single tap into data button down/up...
  public override async onTouchMoveStart(ev: BeTouchEvent, startEv: BeTouchEvent): Promise<EventHandled> { if (!this._haveFirstPoint && startEv.isSingleTouch) await IModelApp.toolAdmin.convertTouchMoveStartToButtonDownAndMotion(startEv, ev); return this._haveFirstPoint ? EventHandled.Yes : EventHandled.No; }
  public override async onTouchMove(ev: BeTouchEvent): Promise<void> { if (this._haveFirstPoint) return IModelApp.toolAdmin.convertTouchMoveToMotion(ev); }
  public override async onTouchComplete(ev: BeTouchEvent): Promise<void> { if (this._haveFirstPoint) return IModelApp.toolAdmin.convertTouchEndToButtonUp(ev); }
  public override async onTouchCancel(ev: BeTouchEvent): Promise<void> { if (this._haveFirstPoint) return IModelApp.toolAdmin.convertTouchEndToButtonUp(ev, BeButton.Reset); }

  private computeWindowCorners(): Point3d[] | undefined {
    const vp = this.viewport!;
    const corners = this._corners;

    corners[0].setFrom(this._firstPtWorld);
    corners[1].setFrom(this._secondPtWorld);
    vp.worldToViewArray(corners);

    const delta = corners[1].minus(corners[0]);
    if (delta.magnitudeXY() < vp.pixelsFromInches(ToolSettings.startDragDistanceInches))
      return undefined;

    const currentDelta = vp.viewDelta;
    if (currentDelta.x === 0 || delta.x === 0)
      return undefined;

    const viewAspect = currentDelta.y / currentDelta.x;
    const aspectRatio = Math.abs(delta.y / delta.x);

    let halfDeltaX;
    let halfDeltaY;
    if (aspectRatio < viewAspect) {
      halfDeltaX = Math.abs(delta.x) / 2.0;
      halfDeltaY = halfDeltaX * viewAspect;
    } else {
      halfDeltaY = Math.abs(delta.y) / 2.0;
      halfDeltaX = halfDeltaY / viewAspect;
    }

    const center = corners[0].plusScaled(delta, 0.5);
    corners[0].x = center.x - halfDeltaX;
    corners[0].y = center.y - halfDeltaY;
    corners[1].x = center.x + halfDeltaX;
    corners[1].y = center.y + halfDeltaY;
    return corners;
  }

  public override decorate(context: DecorateContext): void {
    if (undefined === this.viewport || !context.viewport.view.hasSameCoordinates(this.viewport.view))
      return;
    const vp = this.viewport;
    const color = vp.getContrastToBackgroundColor();
    if (this._haveFirstPoint) {
      const corners = this.computeWindowCorners();
      if (undefined === corners)
        return;

      this._shapePts[0].x = this._shapePts[3].x = corners[0].x;
      this._shapePts[1].x = this._shapePts[2].x = corners[1].x;
      this._shapePts[0].y = this._shapePts[1].y = corners[0].y;
      this._shapePts[2].y = this._shapePts[3].y = corners[1].y;
      this._shapePts[0].z = this._shapePts[1].z = this._shapePts[2].z = this._shapePts[3].z = corners[0].z;
      this._shapePts[4].setFrom(this._shapePts[0]);
      vp.viewToWorldArray(this._shapePts);

      const builder = context.createGraphicBuilder(GraphicType.WorldOverlay);

      builder.setBlankingFill(this._fillColor);
      builder.addShape(this._shapePts);

      builder.setSymbology(color, color, ViewHandleWeight.Thin);
      builder.addLineString(this._shapePts);

      builder.setSymbology(color, color, ViewHandleWeight.FatDot);
      builder.addPointString([this._firstPtWorld]);

      context.addDecorationFromBuilder(builder);
      return;
    }

    if (undefined === this._lastPtView || context.viewport !== IModelApp.toolAdmin.cursorView)
      return; // Full screen cross-hair only displays in cursor view...

    const cursorPt = this._lastPtView.clone(); cursorPt.x = Math.floor(cursorPt.x) + 0.5; cursorPt.y = Math.floor(cursorPt.y) + 0.5;
    const viewRect = vp.viewRect;

    const drawDecoration = (ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.strokeStyle = (ColorDef.black === color ? "black" : "white");
      ctx.lineWidth = 1;
      ctx.moveTo(viewRect.left, cursorPt.y);
      ctx.lineTo(viewRect.right, cursorPt.y);
      ctx.moveTo(cursorPt.x, viewRect.top);
      ctx.lineTo(cursorPt.x, viewRect.bottom);
      ctx.stroke();
    };
    context.addCanvasDecoration({ drawDecoration });
  }

  private doManipulation(ev: BeButtonEvent, inDynamics: boolean): void {
    this._secondPtWorld.setFrom(ev.point);
    if (inDynamics) {
      if (undefined !== this.viewport && undefined !== ev.viewport && !ev.viewport.view.hasSameCoordinates(this.viewport.view)) {
        this._lastPtView = undefined;
        return;
      }
      this._lastPtView = ev.viewPoint;
      IModelApp.viewManager.invalidateDecorationsAllViews();
      return;
    }

    const corners = this.computeWindowCorners();
    if (undefined === corners)
      return;

    let delta: Vector3d;
    const vp = this.viewport!;
    const view = vp.view;
    vp.viewToWorldArray(corners);

    const opts: ViewChangeOptions = {
      onExtentsError: (stat) => view.outputStatusMessage(stat),
    };

    if (view.isCameraEnabled()) {
      const windowArray: Point3d[] = [corners[0].clone(), corners[1].clone()];
      vp.worldToViewArray(windowArray);

      const windowRange = new ViewRect(windowArray[0].x, windowArray[0].y, windowArray[1].x, windowArray[1].y);

      let npcZValues = vp.determineVisibleDepthRange(windowRange);
      if (undefined === npcZValues)
        npcZValues = { minimum: 0, maximum: ViewManip.getFocusPlaneNpc(vp) };

      const lensAngle = view.getLensAngle();

      vp.worldToNpcArray(corners);
      corners[0].z = corners[1].z = npcZValues.maximum;

      vp.npcToWorldArray(corners);  // Put corners back in world at correct depth
      const viewPts: Point3d[] = [corners[0].clone(), corners[1].clone()];
      vp.rotation.multiplyVectorArrayInPlace(viewPts);  // rotate to view orientation to get extents

      const range = Range3d.createArray(viewPts);
      delta = Vector3d.createStartEnd(range.low, range.high);

      const focusDist = delta.x / (2.0 * Math.tan(lensAngle.radians / 2));

      const newTarget = corners[0].interpolate(.5, corners[1]);
      const newEye = newTarget.plusScaled(view.getZVector(), focusDist);

      if (ViewStatus.Success !== view.lookAtUsingLensAngle(newEye, newTarget, view.getYVector(), lensAngle, undefined, undefined, opts))
        return;
    } else {
      const rot = vp.rotation;
      rot.multiplyVectorArrayInPlace(corners);

      const range = Range3d.createArray(corners);
      delta = Vector3d.createStartEnd(range.low, range.high);
      // get the view extents
      delta.z = view.getExtents().z;

      const originVec = rot.multiplyTransposeXYZ(range.low.x, range.low.y, range.low.z);

      // make sure its not too big or too small
      const stat = view.adjustViewDelta(delta, originVec, rot, vp.viewRect.aspect, opts);
      if (stat !== ViewStatus.Success)
        return;

      view.setExtents(delta);
      view.setOrigin(originVec);
    }

    vp.synchWithView({ animateFrustumChange: true });
  }
}

/** @internal */
export class DefaultViewTouchTool extends ViewManip implements Animator {
  public static override toolId = ""; // touch tools installed by IdleTool are never registered
  private readonly _lastPtView = new Point3d();
  private readonly _startPtWorld = new Point3d();
  private readonly _startPtView = new Point3d();
  private readonly _frustum = new Frustum();
  private _startDirection!: Vector2d;
  private _startDistance = 0.0;
  private _startTouchCount = 0;
  private _inertiaVec?: Vector3d;
  private _singleTouch = false;
  private _duration!: BeDuration;
  private _end!: BeTimePoint;
  private _hasZoom = false;
  private _rotate2dDisabled = false;
  private _rotate2dThreshold?: Angle;
  private _only2dManipulations = false;

  /** Move this handle during the inertia duration */
  public animate(): boolean {
    if (undefined === this._inertiaVec)
      return true; // handle was removed

    // get the fraction of the inertia duration that remains. The decay is a combination of the number of iterations (see damping below)
    // and time. That way the handle slows down even if the framerate is lower.
    const remaining = ((this._end.milliseconds - BeTimePoint.now().milliseconds) / this._duration.milliseconds);
    const pt = this._lastPtView.plusScaled(this._inertiaVec, remaining);
    const vec = this._lastPtView.minus(pt);

    // if we're not moving any more, or if the duration has elapsed, we're done
    if (remaining <= 0 || (vec.magnitudeSquared() < .000001)) {
      this.viewport!.saveViewUndo();
      return true; // remove this as the animator
    }

    this._lastPtView.setFrom(pt);
    this.perform();
    inertialDampen(this._inertiaVec);
    return false;
  }

  public interrupt() { }

  constructor(startEv: BeTouchEvent, ev: BeTouchEvent, only2dManipulations = false) {
    super(startEv.viewport, 0, true, false);
    this._only2dManipulations = only2dManipulations;
    this.onStart(ev);
  }

  public onStart(ev: BeTouchEvent): void {
    const vp = this.viewport!;
    vp.getWorldFrustum(this._frustum);

    const visiblePoint = vp.pickNearestVisibleGeometry(ev.rawPoint);
    if (undefined !== visiblePoint) {
      this._startPtWorld.setFrom(visiblePoint);
      vp.worldToView(this._startPtWorld, this._startPtView);
    } else {
      this._startPtView.setFrom(ev.viewPoint);
      this._startPtView.z = vp.worldToView(ViewManip.getDefaultTargetPointWorld(vp)).z;
      vp.viewToWorld(this._startPtView, this._startPtWorld);
    }
    this._rotate2dDisabled = false;
    this._rotate2dThreshold = undefined;
    this._lastPtView.setFrom(this._startPtView);
    this._startTouchCount = ev.touchCount;
    this._startDirection = (2 <= ev.touchCount ? Vector2d.createStartEnd(BeTouchEvent.getTouchPosition(ev.touchEvent.targetTouches[0], vp), BeTouchEvent.getTouchPosition(ev.touchEvent.targetTouches[1], vp)) : Vector2d.createZero());
    this._startDistance = (2 === ev.touchCount ? this._startDirection.magnitude() : 0.0);
  }

  private computeZoomRatio(ev?: BeTouchEvent): number {
    this._hasZoom = false;
    if (undefined === ev || 0.0 === this._startDistance)
      return 1.0;

    const vp = this.viewport!;
    const distance = (2 === ev.touchCount ? BeTouchEvent.getTouchPosition(ev.touchEvent.targetTouches[0], vp).distance(BeTouchEvent.getTouchPosition(ev.touchEvent.targetTouches[1], vp)) : 0.0);
    const threshold = this.viewport!.pixelsFromInches(ToolSettings.touchZoomChangeThresholdInches);

    if (0.0 === distance || Math.abs(this._startDistance - distance) < threshold)
      return 1.0;

    this._hasZoom = true;
    const adjustedDist = (distance > this._startDistance ? (distance - threshold) : (distance + threshold)); // Avoid sudden jump in zoom scale by subtracting zoom threshold distance...
    return Geometry.clamp(this._startDistance / adjustedDist, .1, 10);
  }

  private computeRotation(ev?: BeTouchEvent): Angle {
    if (undefined === ev || ev.touchCount < 2 || this._rotate2dDisabled)
      return Angle.createDegrees(0.0);

    const vp = this.viewport!;
    const direction = Vector2d.createStartEnd(BeTouchEvent.getTouchPosition(ev.touchEvent.targetTouches[0], vp), BeTouchEvent.getTouchPosition(ev.touchEvent.targetTouches[1], vp));
    const rotation = this._startDirection.angleTo(direction);

    if (undefined === this._rotate2dThreshold) {
      if (Math.abs(rotation.radians) < Angle.createDegrees(5.0).radians)
        return Angle.createDegrees(0.0); // Check against threshold until sufficient rotation is detected...

      const angularDistance = Math.abs(direction.magnitude() / 2.0 * Math.sin(Math.abs(rotation.radians)));
      const zoomDistance = Math.abs(direction.magnitude() - this._startDirection.magnitude());
      const panDistance = this._startPtView.distanceXY(this._lastPtView);

      // NOTE: The * 0.75 below is because it's easy to confuse an attempted rotate for an attempted pan or zoom, and this tries to balance that without having a false positive in the opposite direction.
      if (angularDistance < (zoomDistance * 0.75) || angularDistance < (panDistance * 0.75)) {
        this._rotate2dDisabled = true; // Restrict subsequent view changes to pan and zoom only...
        return Angle.createDegrees(0.0);
      }

      this._rotate2dThreshold = Angle.createRadians(-rotation.radians);
    }

    return Angle.createRadians(rotation.radians + this._rotate2dThreshold.radians); // Avoid jump when starting rotation...
  }

  private handle2dPan() {
    const screenDist = Point2d.create(this._startPtView.x - this._lastPtView.x, this._startPtView.y - this._lastPtView.y);
    this.viewport!.scroll(screenDist, { noSaveInUndo: true });
  }

  private handle2dRotateZoom(ev?: BeTouchEvent): void {
    const vp = this.viewport!;
    const rotation = this.computeRotation(ev);
    const zoomRatio = this.computeZoomRatio(ev);
    const targetWorld = vp.viewToWorld(this._lastPtView);
    const translateTransform = Transform.createTranslation(this._startPtWorld.minus(targetWorld));
    const rotationTransform = Transform.createFixedPointAndMatrix(targetWorld, Matrix3d.createRotationAroundVector(vp.view.getZVector(), rotation)!);
    const scaleTransform = Transform.createScaleAboutPoint(this._startPtWorld, zoomRatio);
    const transform = translateTransform.multiplyTransformTransform(rotationTransform);

    scaleTransform.multiplyTransformTransform(transform, transform);
    const frustum = this._frustum.transformBy(transform);
    vp.setupViewFromFrustum(frustum);
  }

  private handle3dRotate(): void {
    const vp = this.viewport!;
    const viewRect = vp.viewRect;
    const xExtent = viewRect.width;
    const yExtent = viewRect.height;
    const xDelta = this._lastPtView.x - this._startPtView.x;
    const yDelta = this._lastPtView.y - this._startPtView.y;

    const xAxis = ToolSettings.preserveWorldUp ? Vector3d.unitZ() : vp.rotation.getRow(1);
    const yAxis = vp.rotation.getRow(0);
    const xRMatrix = (0.0 !== xDelta) ? Matrix3d.createRotationAroundVector(xAxis, Angle.createRadians(Math.PI / (xExtent / xDelta)))! : Matrix3d.identity;
    const yRMatrix = (0.0 !== yDelta) ? Matrix3d.createRotationAroundVector(yAxis, Angle.createRadians(Math.PI / (yExtent / yDelta)))! : Matrix3d.identity;
    const worldRMatrix = yRMatrix.multiplyMatrixMatrix(xRMatrix);

    const result = worldRMatrix.getAxisAndAngleOfRotation();
    const radians = Angle.createRadians(-result.angle.radians);
    const worldAxis = result.axis;

    const rotationMatrix = Matrix3d.createRotationAroundVector(worldAxis, radians);
    if (undefined === rotationMatrix)
      return;

    const worldTransform = Transform.createFixedPointAndMatrix(this._startPtWorld, rotationMatrix);
    const frustum = this._frustum.transformBy(worldTransform);
    vp.setupViewFromFrustum(frustum);
  }

  private handle3dPanZoom(ev?: BeTouchEvent): void {
    const vp = this.viewport!;
    const zoomRatio = this.computeZoomRatio(ev);

    if (vp.isCameraOn) {
      const targetWorld = vp.viewToWorld(this._lastPtView);
      const preTrans = Transform.createTranslationXYZ(-targetWorld.x, -targetWorld.y, -targetWorld.z);
      const postTrans = Transform.createTranslation(this._startPtWorld);

      preTrans.origin.scaleInPlace(zoomRatio);
      preTrans.matrix.scale(zoomRatio, preTrans.matrix);
      const cameraTransform = postTrans.multiplyTransformTransform(preTrans);

      const view = vp.view as ViewState3d;
      const oldEyePoint = view.getEyePoint();
      const newEyePoint = cameraTransform.multiplyPoint3d(oldEyePoint);
      const cameraOffset = newEyePoint.minus(oldEyePoint);
      const cameraOffsetTransform = Transform.createTranslation(cameraOffset);

      const frustum = this._frustum.transformBy(cameraOffsetTransform);
      vp.setupViewFromFrustum(frustum);
      return;
    }

    const targetNpc = vp.viewToNpc(this._lastPtView);
    const transform = Transform.createFixedPointAndMatrix(targetNpc, Matrix3d.createScale(zoomRatio, zoomRatio, 1.0));
    const viewCenter = Point3d.create(.5, .5, .5);
    const startPtNpc = vp.viewToNpc(this._startPtView);
    const shift = startPtNpc.minus(targetNpc); shift.z = 0.0;
    const offset = Transform.createTranslation(shift);

    offset.multiplyTransformTransform(transform, transform);
    transform.multiplyPoint3d(viewCenter, viewCenter);
    vp.npcToWorld(viewCenter, viewCenter);
    vp.zoom(viewCenter, zoomRatio, { noSaveInUndo: true });
  }

  private handleEvent(ev: BeTouchEvent): void {
    if (undefined === this.viewport)
      return;

    if (this._startTouchCount !== ev.touchCount) {
      this.onStart(ev);
      return;
    }

    this._inertiaVec = undefined;
    const thisPt = ev.viewPoint;
    const smallDistance = 2.0;
    const samePoint = this._lastPtView.isAlmostEqualXY(thisPt, smallDistance);
    if (1 === ev.touchCount && samePoint)
      return; // Don't early return if multi-touch, center doesn't have to move for zoom...

    if (this._startPtView.isAlmostEqualXY(thisPt, smallDistance)) {
      this._lastPtView.setFrom(this._startPtView);
    } else {
      // Don't add inertia if the viewing operation included zoom, only do this for pan and rotate.
      if (!samePoint && !this._hasZoom) {
        this._inertiaVec = this._lastPtView.vectorTo(thisPt);
        this._inertiaVec.z = 0;
      }
      this._singleTouch = ev.isSingleTouch;
      this._lastPtView.setFrom(thisPt);
      this._lastPtView.z = this._startPtView.z;
    }
    this.perform(ev);
  }

  private perform(ev?: BeTouchEvent) {
    const vp = this.viewport!;
    vp.setupViewFromFrustum(this._frustum);

    const singleTouch = this._singleTouch;
    return (!this._only2dManipulations && vp.view.allow3dManipulations()) ?
      singleTouch ? this.handle3dRotate() : this.handle3dPanZoom(ev) :
      singleTouch ? this.handle2dPan() : this.handle2dRotateZoom(ev);
  }

  public override async onDataButtonDown(_ev: BeButtonEvent) { return EventHandled.Yes; }
  public override async onDataButtonUp(_ev: BeButtonEvent) { return EventHandled.Yes; }
  public override async onTouchMove(ev: BeTouchEvent): Promise<void> {
    this.handleEvent(ev);
  }
  public override async onTouchCancel(_ev: BeTouchEvent): Promise<void> { this.exitTool(); }
  public override async onTouchComplete(_ev: BeTouchEvent): Promise<void> {
    // if we were moving when the touch ended, add inertia to the viewing operation
    if (this._inertiaVec) {
      this._duration = ToolSettings.viewingInertia.duration;
      if (this._duration.isTowardsFuture) { // ensure duration is towards future. Otherwise, don't start animation
        this._end = BeTimePoint.fromNow(this._duration);
        this.viewport!.setAnimator(this);
      }
    }

    this.exitTool();
  }
}

/** A tool that performs view undo operation. An application could also just call Viewport.doUndo directly, creating a ViewTool isn't required.
 * @public
 */
export class ViewUndoTool extends ViewTool {
  public static override toolId = "View.Undo";
  public static override iconSpec = "icon-window-backward";

  public override onPostInstall() {
    if (this.viewport)
      this.viewport.doUndo(ScreenViewport.animation.time.normal);
    this.exitTool();
  }
}

/** A tool that performs view redo operation. An application could also just call Viewport.doRedo directly, creating a ViewTool isn't required.
 * @public
 */
export class ViewRedoTool extends ViewTool {
  public static override toolId = "View.Redo";
  public static override iconSpec = "icon-window-forward";

  public override onPostInstall() {
    if (this.viewport)
      this.viewport.doRedo(ScreenViewport.animation.time.normal);
    this.exitTool();
  }
}

/** A tool that toggles the camera on/off in a spatial view
 * @public
 */
export class ViewToggleCameraTool extends ViewTool {
  public static override toolId = "View.ToggleCamera";
  public static override iconSpec = "icon-camera";

  public override onInstall(): boolean { return (undefined !== this.viewport && this.viewport.view.allow3dManipulations()); }

  public override onPostInstall(): void {
    if (this.viewport) {
      const vp = this.viewport;
      if (vp.isCameraOn)
        (vp.view as ViewState3d).turnCameraOff();
      else
        vp.turnCameraOn();

      vp.synchWithView();
    }
    this.exitTool();
  }
}

/** A tool that sets the view camera by two points. This is a PrimitiveTool and not a ViewTool to allow the view to be panned, zoomed, and rotated while defining the points.
 * To show tool settings for specifying camera and target heights above the snap point, make sure formatting and parsing data are cached before the tool starts
 * by calling QuantityFormatter.onInitialized at app startup.
 * @public
 */
export class SetupCameraTool extends PrimitiveTool {
  public static override toolId = "View.SetupCamera";
  public static override iconSpec = "icon-camera-location";
  public viewport?: ScreenViewport;
  protected _haveEyePt: boolean = false;
  protected _eyePtWorld: Point3d = Point3d.create();
  protected _targetPtWorld: Point3d = Point3d.create();

  public override isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean { return (super.isCompatibleViewport(vp, isSelectedViewChange) && undefined !== vp && vp.view.allow3dManipulations()); }
  public override isValidLocation(_ev: BeButtonEvent, _isButtonEvent: boolean): boolean { return true; }
  public override requireWriteableTarget(): boolean { return false; }
  public override onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }
  public override onUnsuspend(): void { this.provideToolAssistance(); }
  protected setupAndPromptForNextAction(): void { IModelApp.accuSnap.enableSnap(true); this.provideToolAssistance(); }
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> { if (this._haveEyePt) this.onReinitialize(); else this.exitTool(); return EventHandled.Yes; }

  /** @beta */
  protected provideToolAssistance(): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, ViewTool.translate(this._haveEyePt ? "SetupCamera.Prompts.NextPoint" : "SetupCamera.Prompts.FirstPoint"));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    const acceptMsg = CoreTools.translate("ElementSet.Inputs.AcceptPoint");
    const rejectMsg = CoreTools.translate(this._haveEyePt ? "ElementSet.Inputs.Restart" : "ElementSet.Inputs.Exit");
    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, acceptMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, acceptMsg, false, ToolAssistanceInputMethod.Mouse));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, rejectMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, rejectMsg, false, ToolAssistanceInputMethod.Mouse));

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  public onRestartTool(): void {
    const tool = new SetupCameraTool();
    if (!tool.run())
      this.exitTool();
  }

  protected getAdjustedEyePoint() { return this.useCameraHeight ? this._eyePtWorld.plusScaled(Vector3d.unitZ(), this.cameraHeight) : this._eyePtWorld; }
  protected getAdjustedTargetPoint() { return this.useTargetHeight ? this._targetPtWorld.plusScaled(Vector3d.unitZ(), this.targetHeight) : this._targetPtWorld; }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === ev.viewport) {
      return EventHandled.Yes;
    } else if (undefined === this.viewport) {
      if (!ev.viewport.view.allow3dManipulations())
        return EventHandled.Yes;
      this.viewport = ev.viewport;
    } else if (this.viewport.view.iModel !== ev.viewport.view.iModel) {
      if (this._haveEyePt)
        return EventHandled.Yes;
      this.viewport = ev.viewport;
      return EventHandled.Yes;
    }

    if (this._haveEyePt) {
      this._targetPtWorld.setFrom(ev.point);
      this.doManipulation();
      this.onReinitialize();
    } else {
      this._eyePtWorld.setFrom(ev.point);
      this._targetPtWorld.setFrom(this._eyePtWorld);
      this._haveEyePt = true;
      this.setupAndPromptForNextAction();
    }

    return EventHandled.Yes;
  }

  public override async onMouseMotion(ev: BeButtonEvent) {
    if (!this._haveEyePt)
      return;
    this._targetPtWorld.setFrom(ev.point);
    IModelApp.viewManager.invalidateDecorationsAllViews();
  }

  public static drawCameraFrustum(context: DecorateContext, vp: ScreenViewport, eyePtWorld: Point3d, targetPtWorld: Point3d, eyeSnapPtWorld?: Point3d, targetSnapPtWorld?: Point3d) {
    if (!vp.view.is3d() || vp.view.iModel !== context.viewport.view.iModel)
      return;

    const zVec = Vector3d.createStartEnd(eyePtWorld, targetPtWorld);
    const focusDist = zVec.normalizeWithLength(zVec).mag;
    if (focusDist <= Constant.oneMillimeter) // eye and target are too close together
      return;

    const xVec = new Vector3d();
    const yVec = Vector3d.unitZ();
    if (yVec.crossProduct(zVec).normalizeWithLength(xVec).mag < Geometry.smallMetricDistance)
      return;
    if (zVec.crossProduct(xVec).normalizeWithLength(yVec).mag < Geometry.smallMetricDistance)
      return;

    const lensAngle = ToolSettings.walkCameraAngle;
    const extentX = Math.tan(lensAngle.radians / 2.0) * focusDist;
    const extentY = extentX * (vp.view.extents.y / vp.view.extents.x);

    const pt1 = targetPtWorld.plusScaled(xVec, -extentX); pt1.plusScaled(yVec, extentY, pt1);
    const pt2 = targetPtWorld.plusScaled(xVec, extentX); pt2.plusScaled(yVec, extentY, pt2);
    const pt3 = targetPtWorld.plusScaled(xVec, extentX); pt3.plusScaled(yVec, -extentY, pt3);
    const pt4 = targetPtWorld.plusScaled(xVec, -extentX); pt4.plusScaled(yVec, -extentY, pt4);

    const color = EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.black, vp);
    const builderHid = context.createGraphicBuilder(GraphicType.WorldOverlay);

    builderHid.setSymbology(color, color, ViewHandleWeight.Bold);
    builderHid.addLineString([eyePtWorld, targetPtWorld]);

    builderHid.setSymbology(color, color, ViewHandleWeight.Thin, LinePixels.Code2);
    builderHid.addLineString([eyePtWorld, pt1]);
    builderHid.addLineString([eyePtWorld, pt2]);
    builderHid.addLineString([eyePtWorld, pt3]);
    builderHid.addLineString([eyePtWorld, pt4]);
    builderHid.addLineString([pt1, pt2, pt3, pt4, pt1]);

    if (eyeSnapPtWorld)
      builderHid.addLineString([eyeSnapPtWorld, eyePtWorld]);
    if (targetSnapPtWorld)
      builderHid.addLineString([targetSnapPtWorld, targetPtWorld]);

    builderHid.setSymbology(color, color, ViewHandleWeight.FatDot);
    builderHid.addPointString([eyePtWorld, targetPtWorld]);

    if (eyeSnapPtWorld)
      builderHid.addPointString([eyeSnapPtWorld]);
    if (targetSnapPtWorld)
      builderHid.addPointString([targetSnapPtWorld]);

    context.addDecorationFromBuilder(builderHid);

    const backColor = ColorDef.from(0, 0, 255, 200);
    const sideColor = context.viewport.hilite.color.withAlpha(25);
    const builderVis = context.createGraphicBuilder(GraphicType.WorldDecoration);

    builderVis.setSymbology(color, color, ViewHandleWeight.Normal);
    builderVis.addLineString([eyePtWorld, pt1]);
    builderVis.addLineString([eyePtWorld, pt2]);
    builderVis.addLineString([eyePtWorld, pt3]);
    builderVis.addLineString([eyePtWorld, pt4]);
    builderVis.addLineString([pt1, pt2, pt3, pt4, pt1]);

    builderVis.setSymbology(color, backColor, ViewHandleWeight.Thin);
    builderVis.addShape([pt1, pt2, pt3, pt4]);

    builderVis.setSymbology(color, sideColor, ViewHandleWeight.Thin);
    builderVis.addShape([eyePtWorld, pt1, pt2]);
    builderVis.addShape([eyePtWorld, pt2, pt3]);
    builderVis.addShape([eyePtWorld, pt3, pt4]);
    builderVis.addShape([eyePtWorld, pt4, pt1]);

    context.addDecorationFromBuilder(builderVis);
  }

  public override decorate(context: DecorateContext): void {
    if (!this._haveEyePt || undefined === this.viewport)
      return;
    SetupCameraTool.drawCameraFrustum(context, this.viewport, this.getAdjustedEyePoint(), this.getAdjustedTargetPoint(), this.useCameraHeight ? this._eyePtWorld : undefined, this.useTargetHeight ? this._targetPtWorld : undefined);
  }

  public override decorateSuspended(context: DecorateContext): void { this.decorate(context); }

  private doManipulation(): void {
    const vp = this.viewport;
    if (undefined === vp)
      return;

    const view = vp.view;
    if (!view.is3d() || !view.allow3dManipulations())
      return;

    const eyePtWorld = this.getAdjustedEyePoint();
    const targetPtWorld = this.getAdjustedTargetPoint();
    const lensAngle = ToolSettings.walkCameraAngle;
    if (ViewStatus.Success !== view.lookAtUsingLensAngle(eyePtWorld, targetPtWorld, Vector3d.unitZ(), lensAngle))
      return;

    vp.synchWithView({ animateFrustumChange: true });
  }

  private _useCameraHeightProperty: DialogProperty<boolean> | undefined;
  public get useCameraHeightProperty() {
    if (!this._useCameraHeightProperty)
      this._useCameraHeightProperty = new DialogProperty<boolean>(
        PropertyDescriptionHelper.buildLockPropertyDescription("useCameraHeight"), false, undefined, false);
    return this._useCameraHeightProperty;
  }
  public get useCameraHeight(): boolean { return this.useCameraHeightProperty.value; }
  public set useCameraHeight(option: boolean) { this.useCameraHeightProperty.value = option; }

  private _cameraHeightProperty: DialogProperty<number> | undefined;
  public get cameraHeightProperty() {
    if (!this._cameraHeightProperty)
      this._cameraHeightProperty = new DialogProperty<number>(new LengthDescription("cameraHeight", ViewTool.translate("SetupCamera.Labels.CameraHeight")),
        0.0, undefined, !this.useCameraHeight);
    return this._cameraHeightProperty;
  }
  public get cameraHeight(): number { return this.cameraHeightProperty.value; }
  public set cameraHeight(value: number) { this.cameraHeightProperty.value = value; }

  private _useTargetHeightProperty: DialogProperty<boolean> | undefined;
  public get useTargetHeightProperty() {
    if (!this._useTargetHeightProperty)
      this._useTargetHeightProperty = new DialogProperty<boolean>(
        PropertyDescriptionHelper.buildLockPropertyDescription("useTargetHeight"), false, undefined, false);
    return this._useTargetHeightProperty;
  }
  public get useTargetHeight(): boolean { return this.useTargetHeightProperty.value; }
  public set useTargetHeight(value: boolean) { this.useTargetHeightProperty.value = value; }

  private _targetHeightProperty: DialogProperty<number> | undefined;
  public get targetHeightProperty() {
    if (!this._targetHeightProperty)
      this._targetHeightProperty = new DialogProperty<number>(new LengthDescription("targetHeight", ViewTool.translate("SetupCamera.Labels.TargetHeight")),
        0.0, undefined, !this.useTargetHeight);
    return this._targetHeightProperty;
  }
  public get targetHeight(): number { return this.targetHeightProperty.value; }
  public set targetHeight(value: number) { this.targetHeightProperty.value = value; }

  private syncCameraHeightState(): void {
    this.cameraHeightProperty.displayValue = (this.cameraHeightProperty.description as LengthDescription).format(this.cameraHeight);
    this.cameraHeightProperty.isDisabled = !this.useCameraHeight;
    this.syncToolSettingsProperties([this.cameraHeightProperty.syncItem]);
  }

  private syncTargetHeightState(): void {
    this.targetHeightProperty.displayValue = (this.targetHeightProperty.description as LengthDescription).format(this.targetHeight);
    this.targetHeightProperty.isDisabled = !this.useTargetHeight;
    this.syncToolSettingsProperties([this.targetHeightProperty.syncItem]);
  }

  public override applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): boolean {
    if (updatedValue.propertyName === this.useCameraHeightProperty.name) {
      this.useCameraHeight = updatedValue.value.value as boolean;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.useCameraHeightProperty.item);
      this.syncCameraHeightState();
    } else if (updatedValue.propertyName === this.useTargetHeightProperty.name) {
      this.useTargetHeight = updatedValue.value.value as boolean;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.useTargetHeightProperty.item);
      this.syncTargetHeightState();
    } else if (updatedValue.propertyName === this.cameraHeightProperty.name) {
      this.cameraHeight = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.cameraHeightProperty.item);
    } else if (updatedValue.propertyName === this.targetHeightProperty.name) {
      this.targetHeight = updatedValue.value.value as number;
      IModelApp.toolAdmin.toolSettingsState.saveToolSettingProperty(this.toolId, this.targetHeightProperty.item);
    }
    return true;
  }

  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    // load latest values from session
    IModelApp.toolAdmin.toolSettingsState.getInitialToolSettingValues(this.toolId,
      [
        this.useCameraHeightProperty.name, this.useTargetHeightProperty.name, this.cameraHeightProperty.name, this.targetHeightProperty.name,
      ])
      ?.forEach((value) => {
        if (value.propertyName === this.useCameraHeightProperty.name)
          this.useCameraHeightProperty.dialogItemValue = value.value;
        else if (value.propertyName === this.cameraHeightProperty.name)
          this.cameraHeightProperty.dialogItemValue = value.value;
        else if (value.propertyName === this.useTargetHeightProperty.name)
          this.useTargetHeightProperty.dialogItemValue = value.value;
        else if (value.propertyName === this.targetHeightProperty.name)
          this.targetHeightProperty.dialogItemValue = value.value;
      });

    // ensure controls are enabled/disabled base on current lock property state
    this.targetHeightProperty.isDisabled = !this.useTargetHeight;
    this.cameraHeightProperty.isDisabled = !this.useCameraHeight;

    const cameraHeightLock = this.useCameraHeightProperty.toDialogItem({ rowPriority: 1, columnIndex: 0 });
    const targetHeightLock = this.useTargetHeightProperty.toDialogItem({ rowPriority: 2, columnIndex: 0 });

    const toolSettings = new Array<DialogItem>();
    toolSettings.push(this.cameraHeightProperty.toDialogItem({ rowPriority: 1, columnIndex: 1 }, cameraHeightLock));
    toolSettings.push(this.targetHeightProperty.toDialogItem({ rowPriority: 2, columnIndex: 1 }, targetHeightLock));
    return toolSettings;
  }
}

/** A tool that sets a walk tool starting position by a floor point and look direction. This is a PrimitiveTool and not a ViewTool to allow the view to be panned, zoomed, and rotated while defining the points.
 * @public
 */
export class SetupWalkCameraTool extends PrimitiveTool {
  public static override toolId = "View.SetupWalkCamera";
  public static override iconSpec = "icon-camera-location";
  public viewport?: ScreenViewport;
  protected _haveEyePt: boolean = false;
  protected _eyePtWorld: Point3d = Point3d.create();
  protected _targetPtWorld: Point3d = Point3d.create();

  public override isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean { return (super.isCompatibleViewport(vp, isSelectedViewChange) && undefined !== vp && vp.view.allow3dManipulations()); }
  public override isValidLocation(_ev: BeButtonEvent, _isButtonEvent: boolean): boolean { return true; }
  public override requireWriteableTarget(): boolean { return false; }
  public override onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }
  public override onUnsuspend(): void { this.provideToolAssistance(); }
  protected setupAndPromptForNextAction(): void { IModelApp.accuSnap.enableSnap(true); this.provideToolAssistance(); }
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> { if (this._haveEyePt) this.onReinitialize(); else this.exitTool(); return EventHandled.Yes; }

  /** @beta */
  protected provideToolAssistance(): void {
    const mainInstruction = ToolAssistance.createInstruction(this.iconSpec, ViewTool.translate(this._haveEyePt ? "SetupWalkCamera.Prompts.NextPoint" : "SetupWalkCamera.Prompts.FirstPoint"));
    const mouseInstructions: ToolAssistanceInstruction[] = [];
    const touchInstructions: ToolAssistanceInstruction[] = [];

    const acceptMsg = CoreTools.translate("ElementSet.Inputs.AcceptPoint");
    const rejectMsg = CoreTools.translate(this._haveEyePt ? "ElementSet.Inputs.Restart" : "ElementSet.Inputs.Exit");
    if (!ToolAssistance.createTouchCursorInstructions(touchInstructions))
      touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, acceptMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, acceptMsg, false, ToolAssistanceInputMethod.Mouse));
    touchInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, rejectMsg, false, ToolAssistanceInputMethod.Touch));
    mouseInstructions.push(ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, rejectMsg, false, ToolAssistanceInputMethod.Mouse));

    const sections: ToolAssistanceSection[] = [];
    sections.push(ToolAssistance.createSection(mouseInstructions, ToolAssistance.inputsLabel));
    sections.push(ToolAssistance.createSection(touchInstructions, ToolAssistance.inputsLabel));

    const instructions = ToolAssistance.createInstructions(mainInstruction, sections);
    IModelApp.notifications.setToolAssistance(instructions);
  }

  public onRestartTool(): void {
    const tool = new SetupWalkCameraTool();
    if (!tool.run())
      this.exitTool();
  }

  protected getAdjustedEyePoint() { return this._eyePtWorld.plusScaled(Vector3d.unitZ(), ToolSettings.walkEyeHeight); }
  protected getAdjustedTargetPoint() { return Point3d.create(this._targetPtWorld.x, this._targetPtWorld.y, this.getAdjustedEyePoint().z); }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (undefined === ev.viewport) {
      return EventHandled.Yes;
    } else if (undefined === this.viewport) {
      if (!ev.viewport.view.allow3dManipulations())
        return EventHandled.Yes;
      this.viewport = ev.viewport;
    } else if (this.viewport.view.iModel !== ev.viewport.view.iModel) {
      if (this._haveEyePt)
        return EventHandled.Yes;
      this.viewport = ev.viewport;
      return EventHandled.Yes;
    }

    if (this._haveEyePt) {
      this._targetPtWorld.setFrom(ev.point);
      this.doManipulation();
      this.onReinitialize();
    } else {
      this._eyePtWorld.setFrom(ev.point);
      this._targetPtWorld.setFrom(this._eyePtWorld);
      this._haveEyePt = true;
      this.setupAndPromptForNextAction();
    }

    return EventHandled.Yes;
  }

  public override async onMouseMotion(ev: BeButtonEvent) {
    if (!this._haveEyePt)
      return;
    this._targetPtWorld.setFrom(ev.point);
    IModelApp.viewManager.invalidateDecorationsAllViews();
  }

  private static getFigurePoints(): Point3d[] {
    const figurePts: Point3d[] = [];
    figurePts.push(Point3d.create(1.064, -0.014));
    figurePts.push(Point3d.create(1.051, 0.039));
    figurePts.push(Point3d.create(1.008, 0.058));
    figurePts.push(Point3d.create(0.962, 0.048));
    figurePts.push(Point3d.create(0.920, 0.026));
    figurePts.push(Point3d.create(0.898, 0.026));
    figurePts.push(Point3d.create(0.853, 0.094));
    figurePts.push(Point3d.create(0.741, 0.120));
    figurePts.push(Point3d.create(0.652, 0.091));
    figurePts.push(Point3d.create(0.514, 0.107));
    figurePts.push(Point3d.create(0.304, 0.108));
    figurePts.push(Point3d.create(0.040, 0.135));
    figurePts.push(Point3d.create(-0.023, 0.133));
    figurePts.push(Point3d.create(-0.031, 0.088));
    figurePts.push(Point3d.create(0.041, 0.068));
    figurePts.push(Point3d.create(0.299, 0.035));
    figurePts.push(Point3d.create(0.447, -0.015));
    figurePts.push(Point3d.create(0.267, -0.042));
    figurePts.push(Point3d.create(0.019, -0.036));
    figurePts.push(Point3d.create(-0.027, -0.146));
    figurePts.push(Point3d.create(-0.005, -0.179));
    figurePts.push(Point3d.create(0.056, -0.108));
    figurePts.push(Point3d.create(0.270, -0.122));
    figurePts.push(Point3d.create(0.483, -0.120));
    figurePts.push(Point3d.create(0.649, -0.145));
    figurePts.push(Point3d.create(0.715, -0.186));
    figurePts.push(Point3d.create(0.865, -0.135));
    figurePts.push(Point3d.create(0.905, -0.039));
    figurePts.push(Point3d.create(0.948, -0.035));
    figurePts.push(Point3d.create(0.979, -0.051));
    figurePts.push(Point3d.create(1.037, -0.046));
    figurePts.push(figurePts[0].clone());
    return figurePts;
  }

  private static getFigureTransform(vp: Viewport, base: Point3d, direction: Vector3d, scale: number): Transform | undefined {
    const boresite = AccuDrawHintBuilder.getBoresite(base, vp);
    if (Math.abs(direction.dotProduct(boresite.direction)) >= 0.9999)
      return undefined;

    const matrix = Matrix3d.createRigidFromColumns(direction, boresite.direction, AxisOrder.XZY);
    if (undefined === matrix)
      return undefined;

    matrix.scaleColumnsInPlace(scale, scale, scale);
    return Transform.createRefs(base.clone(), matrix);
  }

  public static drawFigure(context: DecorateContext, vp: Viewport, groundPt: Point3d, eyeHeight: number): void {
    if (!vp.view.is3d() || vp.view.iModel !== context.viewport.view.iModel)
      return;

    const transform = this.getFigureTransform(context.viewport, groundPt, Vector3d.unitZ(), eyeHeight);
    if (undefined === transform)
      return;

    const figurePts = this.getFigurePoints();
    const color = EditManipulator.HandleUtils.adjustForBackgroundColor(ColorDef.black, vp);
    const fill = ColorDef.from(255, 245, 225, 100);

    const builderShadow = context.createGraphicBuilder(GraphicType.WorldOverlay);
    builderShadow.setSymbology(color, ColorDef.black.withAlpha(30), ViewHandleWeight.Thin);
    builderShadow.addArc(Arc3d.createXY(groundPt, eyeHeight * 0.22), true, true);
    context.addDecorationFromBuilder(builderShadow);

    const builderHid = context.createGraphicBuilder(GraphicType.WorldDecoration, transform);
    builderHid.setSymbology(color, fill, ViewHandleWeight.Thin);
    builderHid.addShape(figurePts); // Copies points...
    context.addDecorationFromBuilder(builderHid);

    const builderVis = context.createGraphicBuilder(GraphicType.WorldOverlay, transform);
    builderVis.setSymbology(color, color, ViewHandleWeight.Normal);
    builderVis.addLineString(figurePts); // Owns points...
    context.addDecorationFromBuilder(builderVis);
  }

  public override decorate(context: DecorateContext): void {
    if (!this._haveEyePt || undefined === this.viewport)
      return;
    SetupWalkCameraTool.drawFigure(context, this.viewport, this._eyePtWorld, ToolSettings.walkEyeHeight);
    SetupCameraTool.drawCameraFrustum(context, this.viewport, this.getAdjustedEyePoint(), this.getAdjustedTargetPoint(), this._eyePtWorld, this._targetPtWorld);
  }

  public override decorateSuspended(context: DecorateContext): void { this.decorate(context); }

  private doManipulation(): void {
    const vp = this.viewport;
    if (undefined === vp)
      return;

    const view = vp.view;
    if (!view.is3d() || !view.allow3dManipulations())
      return;

    const eyePtWorld = this.getAdjustedEyePoint();
    const targetPtWorld = this.getAdjustedTargetPoint();
    const lensAngle = ToolSettings.walkCameraAngle;
    if (ViewStatus.Success !== view.lookAtUsingLensAngle(eyePtWorld, targetPtWorld, Vector3d.unitZ(), lensAngle))
      return;

    vp.synchWithView({ animateFrustumChange: true });
  }
}
