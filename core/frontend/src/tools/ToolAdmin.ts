/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import { AbandonedError, BeEvent, Id64String, IModelStatus, Logger } from "@bentley/bentleyjs-core";
import { Matrix3d, Point2d, Point3d, Transform, Vector3d, XAndY } from "@bentley/geometry-core";
import { Easing, GeometryStreamProps, NpcCenter } from "@bentley/imodeljs-common";
import { DialogItemValue, DialogPropertyItem, DialogPropertySyncItem } from "@bentley/ui-abstract";
import { AccuSnap, TentativeOrAccuSnap } from "../AccuSnap";
import { LocateOptions } from "../ElementLocateManager";
import { FrontendLoggerCategory } from "../FrontendLoggerCategory";
import { HitDetail } from "../HitDetail";
import { IModelApp } from "../IModelApp";
import { linePlaneIntersect } from "../LinePlaneIntersect";
import { MessageBoxIconType, MessageBoxType } from "../NotificationManager";
import { CanvasDecoration } from "../render/CanvasDecoration";
import { IconSprites } from "../Sprites";
import { ViewChangeOptions } from "../ViewAnimation";
import { DecorateContext, DynamicsContext } from "../ViewContext";
import { ScreenViewport, Viewport } from "../Viewport";
import { ViewStatus } from "../ViewStatus";
import { IdleTool } from "./IdleTool";
import { PrimitiveTool } from "./PrimitiveTool";
import {
  BeButton, BeButtonEvent, BeButtonState, BeModifierKeys, BeTouchEvent, BeWheelEvent, CoordinateLockOverrides, CoordSource, EventHandled,
  InputCollector, InputSource, InteractiveTool, Tool,
} from "./Tool";
import { ToolSettings } from "./ToolSettings";
import { ViewTool } from "./ViewTool";

/** @public */
export enum StartOrResume { Start = 1, Resume = 2 }

/** @public */
export enum ManipulatorToolEvent { Start = 1, Stop = 2, Suspend = 3, Unsuspend = 4 }

const enum MouseButton { Left = 0, Middle = 1, Right = 2 } // eslint-disable-line no-restricted-syntax

/** Class that maintains the state of tool settings properties for the current session
 * @internal
 */
export class ToolSettingsState {
  /** Retrieve saved tool settings DialogItemValue by property name. */
  public getInitialToolSettingValue(toolId: string, propertyName: string): DialogItemValue | undefined {
    const key = `${toolId}:${propertyName}`;
    const savedValue = window.sessionStorage.getItem(key);
    if (null !== savedValue) {
      return JSON.parse(savedValue) as DialogItemValue;
    }
    return undefined;
  }

  /** Retrieve an array of DialogPropertyItem with the values latest values that were used in the session. */
  public getInitialToolSettingValues(toolId: string, propertyNames: string[]): DialogPropertyItem[] | undefined {
    const initializedProperties: DialogPropertyItem[] = [];
    let propertyValue: DialogItemValue | undefined;

    propertyNames.forEach((propertyName: string) => {
      propertyValue = this.getInitialToolSettingValue(toolId, propertyName);
      if (propertyValue)
        initializedProperties.push({ value: propertyValue, propertyName });
    });

    return initializedProperties.length ? initializedProperties : undefined;
  }

  /** Save single tool settings value to session storage. */
  public saveToolSettingProperty(toolId: string, item: DialogPropertyItem): void {
    const key = `${toolId}:${item.propertyName}`;
    const objectAsString = JSON.stringify(item.value);
    window.sessionStorage.setItem(key, objectAsString);
  }

  /** Save an array of tool settings values to session storage */
  public saveToolSettingProperties(toolId: string, tsProps: DialogPropertyItem[]): void {
    tsProps.forEach((item: DialogPropertyItem) => this.saveToolSettingProperty(toolId, item));
  }
}

/** @internal */
export class ToolState {
  public coordLockOvr = CoordinateLockOverrides.None;
  public locateCircleOn = false;
  public setFrom(other: ToolState) { this.coordLockOvr = other.coordLockOvr; this.locateCircleOn = other.locateCircleOn; }
  public clone(): ToolState { const val = new ToolState(); val.setFrom(this); return val; }
}

/** @internal */
export class SuspendedToolState {
  private readonly _toolState: ToolState;
  private readonly _accuSnapState: AccuSnap.ToolState;
  private readonly _locateOptions: LocateOptions;
  private readonly _viewCursor?: string;
  private _inDynamics: boolean;
  private _shuttingDown = false;

  constructor() {
    const { toolAdmin, viewManager, accuSnap, locateManager } = IModelApp;
    toolAdmin.setIncompatibleViewportCursor(true); // Don't save this
    this._toolState = toolAdmin.toolState.clone();
    this._accuSnapState = accuSnap.toolState.clone();
    this._locateOptions = locateManager.options.clone();
    this._viewCursor = viewManager.cursor;
    this._inDynamics = viewManager.inDynamicsMode;
    if (this._inDynamics)
      viewManager.endDynamicsMode();
  }

  public stop() {
    if (this._shuttingDown)
      return;

    const { toolAdmin, viewManager, accuSnap, locateManager } = IModelApp;
    toolAdmin.setIncompatibleViewportCursor(true); // Don't restore this
    toolAdmin.toolState.setFrom(this._toolState);
    accuSnap.toolState.setFrom(this._accuSnapState);
    locateManager.options.setFrom(this._locateOptions);
    viewManager.setViewCursor(this._viewCursor);
    if (this._inDynamics)
      viewManager.beginDynamicsMode();
    else
      viewManager.endDynamicsMode();
  }
}

/** @internal */
export class CurrentInputState {
  private readonly _rawPoint: Point3d = new Point3d();
  private readonly _point: Point3d = new Point3d();
  private readonly _viewPoint: Point3d = new Point3d();
  public qualifiers = BeModifierKeys.None;
  public viewport?: ScreenViewport;
  public button: BeButtonState[] = [new BeButtonState(), new BeButtonState(), new BeButtonState()];
  public lastButton: BeButton = BeButton.Data;
  public inputSource: InputSource = InputSource.Unknown;
  public lastMotion = new Point2d();
  public lastWheelEvent?: BeWheelEvent;
  public lastTouchStart?: BeTouchEvent;
  public touchTapTimer?: number;
  public touchTapCount?: number;

  public get rawPoint() { return this._rawPoint; }
  public set rawPoint(pt: Point3d) { this._rawPoint.setFrom(pt); }
  public get point() { return this._point; }
  public set point(pt: Point3d) { this._point.setFrom(pt); }
  public get viewPoint() { return this._viewPoint; }
  public set viewPoint(pt: Point3d) { this._viewPoint.setFrom(pt); }
  public get isShiftDown() { return 0 !== (this.qualifiers & BeModifierKeys.Shift); }
  public get isControlDown() { return 0 !== (this.qualifiers & BeModifierKeys.Control); }
  public get isAltDown() { return 0 !== (this.qualifiers & BeModifierKeys.Alt); }

  public isDragging(button: BeButton) { return this.button[button].isDragging; }
  public onStartDrag(button: BeButton) { this.button[button].isDragging = true; }
  public onInstallTool() { this.clearKeyQualifiers(); this.lastWheelEvent = undefined; this.lastTouchStart = this.touchTapTimer = this.touchTapCount = undefined; }
  public clearKeyQualifiers() { this.qualifiers = BeModifierKeys.None; }
  public clearViewport(vp: Viewport) { if (vp === this.viewport) this.viewport = undefined; }
  private isAnyDragging() { return this.button.some((button) => button.isDragging); }
  private setKeyQualifier(qual: BeModifierKeys, down: boolean) { this.qualifiers = down ? (this.qualifiers | qual) : (this.qualifiers & (~qual)); }

  public setKeyQualifiers(ev: MouseEvent | KeyboardEvent | TouchEvent): void {
    this.setKeyQualifier(BeModifierKeys.Shift, ev.shiftKey);
    this.setKeyQualifier(BeModifierKeys.Control, ev.ctrlKey);
    this.setKeyQualifier(BeModifierKeys.Alt, ev.altKey);
  }

  public onMotion(pt2d: XAndY) {
    this.lastMotion.x = pt2d.x;
    this.lastMotion.y = pt2d.y;
  }

  public changeButtonToDownPoint(ev: BeButtonEvent) {
    ev.point = this.button[ev.button].downUorPt;
    ev.rawPoint = this.button[ev.button].downRawPt;

    if (ev.viewport)
      ev.viewPoint = ev.viewport.worldToView(ev.rawPoint);
  }

  public updateDownPoint(ev: BeButtonEvent) { this.button[ev.button].downUorPt = ev.point; }

  public onButtonDown(button: BeButton) {
    const viewPt = this.viewport!.worldToView(this.button[button].downRawPt);
    const center = this.viewport!.npcToView(NpcCenter);
    viewPt.z = center.z;

    const now = Date.now();
    const isDoubleClick = ((now - this.button[button].downTime) < ToolSettings.doubleClickTimeout.milliseconds) && (viewPt.distance(this.viewPoint) < this.viewport!.pixelsFromInches(ToolSettings.doubleClickToleranceInches));

    this.button[button].init(this.point, this.rawPoint, now, true, isDoubleClick, false, this.inputSource);
    this.lastButton = button;
  }

  public onButtonUp(button: BeButton) {
    this.button[button].isDown = false;
    this.button[button].isDragging = false;
    this.lastButton = button;
  }

  public toEvent(ev: BeButtonEvent, useSnap: boolean) {
    let coordsFrom = CoordSource.User;
    const point = this.point.clone();
    let viewport = this.viewport;

    if (useSnap) {
      const snap = TentativeOrAccuSnap.getCurrentSnap(false);
      if (snap) {
        coordsFrom = snap.isHot ? CoordSource.ElemSnap : CoordSource.User;
        point.setFrom(snap.isPointAdjusted ? snap.adjustedPoint : snap.getPoint()); // NOTE: adjustedPoint can be set by adjustSnapPoint even when not hot...
        viewport = snap.viewport;
      } else if (IModelApp.tentativePoint.isActive) {
        coordsFrom = CoordSource.TentativePoint;
        point.setFrom(IModelApp.tentativePoint.getPoint());
        viewport = IModelApp.tentativePoint.viewport;
      }
    }

    const buttonState = this.button[this.lastButton];
    ev.init({
      point, rawPoint: this.rawPoint, viewPoint: this.viewPoint, viewport, coordsFrom,
      keyModifiers: this.qualifiers, button: this.lastButton, isDown: buttonState.isDown,
      isDoubleClick: buttonState.isDoubleClick, isDragging: buttonState.isDragging,
      inputSource: this.inputSource,
    });
  }

  public adjustLastDataPoint(ev: BeButtonEvent) {
    const state = this.button[BeButton.Data];
    state.downUorPt = ev.point;
    state.downRawPt = ev.point;
    this.viewport = ev.viewport;
  }

  public toEventFromLastDataPoint(ev: BeButtonEvent) {
    const state = this.button[BeButton.Data];
    const point = state.downUorPt;
    const rawPoint = state.downRawPt;
    const viewPoint = this.viewport ? this.viewport.worldToView(rawPoint) : Point3d.create(); // BeButtonEvent is invalid when viewport is undefined
    ev.init({
      point, rawPoint, viewPoint, viewport: this.viewport!, coordsFrom: CoordSource.User,
      keyModifiers: this.qualifiers, button: BeButton.Data, isDown: state.isDown,
      isDoubleClick: state.isDoubleClick, isDragging: state.isDragging, inputSource: state.inputSource,
    });
  }

  public fromPoint(vp: ScreenViewport, pt: XAndY, source: InputSource) {
    this.viewport = vp;
    this._viewPoint.x = pt.x;
    this._viewPoint.y = pt.y;
    this._viewPoint.z = vp.npcToView(NpcCenter).z;
    vp.viewToWorld(this._viewPoint, this._rawPoint);
    this.point = this._rawPoint;
    this.inputSource = source;
  }

  public fromButton(vp: ScreenViewport, pt: XAndY, source: InputSource, applyLocks: boolean) {
    this.fromPoint(vp, pt, source);

    // NOTE: Using the hit point on the element is preferable to ignoring a snap that is not "hot" completely
    if (TentativeOrAccuSnap.getCurrentSnap(false)) {
      if (applyLocks)
        IModelApp.toolAdmin.adjustSnapPoint();
      return;
    }
    IModelApp.toolAdmin.adjustPoint(this._point, vp, true, applyLocks);
  }

  public isStartDrag(button: BeButton): boolean {
    // First make sure we aren't already dragging any button
    if (this.isAnyDragging())
      return false;

    const state = this.button[button];
    if (!state.isDown)
      return false;

    if ((Date.now() - state.downTime) <= ToolSettings.startDragDelay.milliseconds)
      return false;

    const viewPt = this.viewport!.worldToView(state.downRawPt);
    const deltaX = Math.abs(this._viewPoint.x - viewPt.x);
    const deltaY = Math.abs(this._viewPoint.y - viewPt.y);

    return ((deltaX + deltaY) > this.viewport!.pixelsFromInches(ToolSettings.startDragDistanceInches));
  }
}

/** A ToolEvent combines an HTML Event and a Viewport. It is stored in a queue for processing by the ToolAdmin.eventLoop. */
interface ToolEvent {
  ev: Event;
  vp?: ScreenViewport; // Viewport is optional - keyboard events aren't associated with a Viewport.
}

/** Controls the operation of [[Tool]]s, administering the current [[ViewTool]], [[PrimitiveTool]], and [[IdleTool]] and forwarding events to the appropriate tool.
 * @public
 */
export class ToolAdmin {
  public markupView?: ScreenViewport;
  /** @internal */
  public readonly currentInputState = new CurrentInputState();
  /** @internal */
  public readonly toolState = new ToolState();
  /** @internal */
  public readonly toolSettingsState = new ToolSettingsState();
  private _canvasDecoration?: CanvasDecoration;
  private _suspendedByViewTool?: SuspendedToolState;
  private _suspendedByInputCollector?: SuspendedToolState;
  private _viewTool?: ViewTool;
  private _primitiveTool?: PrimitiveTool;
  private _idleTool?: IdleTool;
  private _inputCollector?: InputCollector;
  private _saveCursor?: string;
  private _saveLocateCircle = false;
  private _defaultToolId = "Select";
  private _defaultToolArgs?: any[];
  /**
   * The active settings that placement tools will use.
   * @alpha
   */
  public readonly activeSettings = new ToolAdmin.ActiveSettings();

  /** The name of the [[PrimitiveTool]] to use as the default tool. Defaults to "Select", referring to [[SelectionTool]].
   * @see [[startDefaultTool]] to activate the default tool.
   * @see [[defaultToolArgs]] to supply arguments when starting the tool.
   */
  public get defaultToolId(): string {
    return this._defaultToolId;
  }
  public set defaultToolId(toolId: string) {
    this._defaultToolId = toolId;
  }

  /** The arguments supplied to the default [[Tool]]'s [[Tool.run]] method from [[startDefaultTool]].
   * @see [[defaultToolId]] to configure the default tool.
   */
  public get defaultToolArgs(): any[] | undefined {
    return this._defaultToolArgs;
  }
  public set defaultToolArgs(args: any[] | undefined) {
    this._defaultToolArgs = args;
  }

  /** Apply operations such as transform, copy or delete to all members of an assembly. */
  public assemblyLock = false;
  /** If Grid Lock is on, project data points to grid. */
  public gridLock = false;
  /** If ACS Snap Lock is on, project snap points to the ACS plane. */
  public acsPlaneSnapLock = false;
  /** If ACS Plane Lock is on, standard view rotations are relative to the ACS instead of global. */
  public acsContextLock = false;

  /** Options for how uncaught exceptions should be handled by [[ToolAdmin.exceptionHandler]]. */
  public static exceptionOptions = {
    /** Log exception to Logger. */
    log: true,
    /** Show an alert box explaining that a problem happened. */
    alertBox: true,
    /** Include the "gory details" (e.g. stack trace) in the alert box. */
    details: true,
    /** break into debugger (only works if debugger is already opened) */
    launchDebugger: true,
  };

  /** A function that catches otherwise-uncaught exceptions occurring inside ToolAdmin.eventLoop.
   * To customize the behavior of this function, modify [[ToolAdmin.exceptionOptions]].
   * To replace it within your own handler, simply assign to it, e.g.:
   * ```ts
   * ToolAdmin.exceptionHandler = (exception: any): Promise<any> => {
   *  ... your implementation here
   * }
   * ```
   */
  public static async exceptionHandler(exception: any): Promise<any> {
    const opts = ToolAdmin.exceptionOptions;
    const msg: string = undefined !== exception.stack ? exception.stack : exception.toString();
    if (opts.log)
      Logger.logError(`${FrontendLoggerCategory.Package}.unhandledException`, msg);

    if (opts.launchDebugger) // this does nothing if the debugger window is not already opened
      debugger; // eslint-disable-line no-debugger

    if (!opts.alertBox)
      return;

    let out = `<h2>${IModelApp.i18n.translate("iModelJs:Errors.ReloadPage")}</h2>`;
    if (opts.details) {
      out += `<h3>${IModelApp.i18n.translate("iModelJs:Errors.Details")}</h3><h4>`;
      msg.split("\n").forEach((line) => out += `${line}<br>`);
      out += "</h4>";
    }

    const div = document.createElement("div");
    div.innerHTML = out;
    return IModelApp.notifications.openMessageBox(MessageBoxType.MediumAlert, div, MessageBoxIconType.Critical);
  }

  private static readonly _removals: VoidFunction[] = [];

  /** The registered handler method that will update the UI with any property value changes.
   *  @internal
   */
  private _toolSettingsChangeHandler: ((toolId: string, syncProperties: DialogPropertySyncItem[]) => void) | undefined = undefined;

  /** Returns the handler registered by the UI layer that allows it to display property changes made by the active Tool.
   * @internal
   */
  public get toolSettingsChangeHandler() { return this._toolSettingsChangeHandler; }
  public set toolSettingsChangeHandler(handler: ((toolId: string, syncProperties: DialogPropertySyncItem[]) => void) | undefined) {
    this._toolSettingsChangeHandler = handler;
  }

  /** The registered handler method that will inform the UI to reload tool setting with properties from active tool.
 *  @internal
 */
  private _reloadToolSettingsHandler: (() => void) | undefined = undefined;

  /** Returns the handler registered by the UI layer that allows it to display property changes made by the active Tool.
   * @internal
   */
  public get reloadToolSettingsHandler() { return this._reloadToolSettingsHandler; }
  public set reloadToolSettingsHandler(handler: (() => void) | undefined) {
    this._reloadToolSettingsHandler = handler;
  }

  /** The registered handler method that will trigger UI Sync processing.
   *  @internal
   */
  private _toolSyncUiEventDispatcher: ((syncEventId: string, useImmediateDispatch?: boolean) => void) | undefined = undefined;

  /** Returns the handler registered by the UI layer that will trigger UiSyncEvent processing that informs UI component to refresh their state.
   * @internal
   */
  public get toolSyncUiEventDispatcher() { return this._toolSyncUiEventDispatcher; }
  public set toolSyncUiEventDispatcher(handler: ((syncEventId: string, useImmediateDispatch?: boolean) => void) | undefined) {
    this._toolSyncUiEventDispatcher = handler;
  }

  /** Handler for keyboard events. */
  private static _keyEventHandler = (ev: KeyboardEvent) => {
    if (!ev.repeat) // we don't want repeated keyboard events. If we keep them they interfere with replacing mouse motion events, since they come as a stream.
      ToolAdmin.addEvent(ev);
  };

  /** @internal */
  public onInitialized() {
    if (typeof document === "undefined")
      return;    // if document isn't defined, we're probably running in a test environment. At any rate, we can't have interactive tools.

    this._idleTool = IModelApp.tools.create("Idle") as IdleTool;

    ["keydown", "keyup"].forEach((type) => {
      document.addEventListener(type, ToolAdmin._keyEventHandler as EventListener, false);
      ToolAdmin._removals.push(() => { document.removeEventListener(type, ToolAdmin._keyEventHandler as EventListener, false); });
    });

    ToolAdmin._removals.push(() => { window.onfocus = null; });
  }

  /** @internal */
  public onShutDown() {
    this.clearMotionPromises();
    this._idleTool = undefined;
    IconSprites.emptyAll(); // clear cache of icon sprites
    ToolAdmin._removals.forEach((remove) => remove());
    ToolAdmin._removals.length = 0;
  }

  /** Get the ScreenViewport where the cursor is currently, if any. */
  public get cursorView(): ScreenViewport | undefined { return this.currentInputState.viewport; }

  /** Called from ViewManager.dropViewport to prevent tools from continuing to operate on the dropped viewport.
   * @internal
   */
  public forgetViewport(vp: ScreenViewport): void {
    // Ignore pending motion promises on fulfillment.
    this.clearMotionPromises();

    // make sure tools don't think the cursor is still in this viewport.
    this.onMouseLeave(vp);

    // Remove any events associated with this viewport.
    ToolAdmin._toolEvents = ToolAdmin._toolEvents.filter((ev) => ev.vp !== vp);
  }

  private getMousePosition(event: ToolEvent): XAndY {
    return event.vp!.mousePosFromEvent(event.ev as MouseEvent);
  }

  private getMouseMovement(event: ToolEvent): XAndY {
    return event.vp!.mouseMovementFromEvent(event.ev as MouseEvent);
  }

  private getMouseButton(button: number) {
    switch (button) {
      case MouseButton.Middle: return BeButton.Middle;
      case MouseButton.Right: return BeButton.Reset;
      default: return BeButton.Data;
    }
  }

  private async onMouseButton(event: ToolEvent, isDown: boolean): Promise<any> {
    const ev = event.ev as MouseEvent;
    const vp = event.vp!;
    const pos = this.getMousePosition(event);
    const button = this.getMouseButton(ev.button);

    this.currentInputState.setKeyQualifiers(ev);
    return isDown ? this.onButtonDown(vp, pos, button, InputSource.Mouse) : this.onButtonUp(vp, pos, button, InputSource.Mouse);
  }

  private async onWheel(event: ToolEvent): Promise<EventHandled> {
    const ev = event.ev as WheelEvent;
    const vp = event.vp!;
    if (this.filterViewport(vp))
      return EventHandled.Yes;
    const current = this.currentInputState;
    current.setKeyQualifiers(ev);

    if (ev.deltaY === 0)
      return EventHandled.No;

    let delta: number;
    switch (ev.deltaMode) {
      case ev.DOM_DELTA_LINE:
        delta = -ev.deltaY * ToolSettings.wheelLineFactor; // 40
        break;
      case ev.DOM_DELTA_PAGE:
        delta = -ev.deltaY * ToolSettings.wheelPageFactor; // 120;
        break;
      default: // DOM_DELTA_PIXEL:
        delta = -ev.deltaY;
        break;
    }

    const pt2d = this.getMousePosition(event);

    vp.setAnimator();
    current.fromButton(vp, pt2d, InputSource.Mouse, true);
    const wheelEvent = new BeWheelEvent();
    wheelEvent.wheelDelta = delta;
    current.toEvent(wheelEvent, true);

    const overlayHit = this.pickCanvasDecoration(wheelEvent);
    if (undefined !== overlayHit && undefined !== overlayHit.onWheel && overlayHit.onWheel(wheelEvent))
      return EventHandled.Yes;

    const tool = this.activeTool;
    if (undefined === tool || EventHandled.Yes !== await tool.onMouseWheel(wheelEvent) && vp !== this.markupView)
      return this.idleTool.onMouseWheel(wheelEvent);
    return EventHandled.Yes;
  }

  private async sendTapEvent(touchEv: BeTouchEvent): Promise<EventHandled> {
    touchEv.viewport!.setAnimator();
    const overlayHit = this.pickCanvasDecoration(touchEv);
    if (undefined !== overlayHit && undefined !== overlayHit.onMouseButton && overlayHit.onMouseButton(touchEv))
      return EventHandled.Yes;

    if (await IModelApp.accuSnap.onTouchTap(touchEv))
      return EventHandled.Yes;

    const tool = this.activeTool;
    if (undefined !== tool && EventHandled.Yes === await tool.onTouchTap(touchEv))
      return EventHandled.Yes;

    return this.idleTool.onTouchTap(touchEv);
  }

  private async doubleTapTimeout(): Promise<void> {
    const current = this.currentInputState;
    if (undefined === current.touchTapTimer)
      return;

    const touchEv = current.lastTouchStart;
    const numTouches = (undefined !== current.lastTouchStart ? current.lastTouchStart.touchCount : 0);
    const numTaps = (undefined !== current.touchTapCount ? current.touchTapCount : 0);

    current.touchTapTimer = current.touchTapCount = current.lastTouchStart = undefined;
    if (undefined === touchEv || 0 > numTouches || 0 > numTaps)
      return;

    touchEv.tapCount = numTaps;
    await this.sendTapEvent(touchEv);
  }

  private async onTouch(event: ToolEvent): Promise<void> {
    const touchEvent = event.ev as TouchEvent;
    const vp = event.vp!;
    if (this.filterViewport(vp))
      return;

    const ev = new BeTouchEvent({ touchEvent });
    const current = this.currentInputState;
    const pos = BeTouchEvent.getTouchListCentroid(0 !== touchEvent.targetTouches.length ? touchEvent.targetTouches : touchEvent.changedTouches, vp);

    switch (touchEvent.type) {
      case "touchstart":
        if (touchEvent.changedTouches.length === touchEvent.targetTouches.length)
          vp.setAnimator(); // Clear viewport animator on start of new touch input (first contact point added)...
        current.setKeyQualifiers(touchEvent);
        break;
      case "touchend":
        current.setKeyQualifiers(touchEvent);
        break;
    }

    current.fromButton(vp, undefined !== pos ? pos : Point2d.createZero(), InputSource.Touch, true);
    current.toEvent(ev, false);
    const tool = this.activeTool;

    switch (touchEvent.type) {
      case "touchstart": {
        current.lastTouchStart = ev;
        IModelApp.accuSnap.onTouchStart(ev);
        if (undefined !== tool)
          tool.onTouchStart(ev); // eslint-disable-line @typescript-eslint/no-floating-promises
        return;
      }

      case "touchend": {
        IModelApp.accuSnap.onTouchEnd(ev);
        if (undefined !== tool) {
          await tool.onTouchEnd(ev);
          if (0 === ev.touchCount)
            await tool.onTouchComplete(ev);
        }

        if (undefined === current.lastTouchStart)
          return;

        if (ev.touchEvent.timeStamp - current.lastTouchStart.touchEvent.timeStamp > (2.0 * ToolSettings.doubleTapTimeout.milliseconds))
          return; // Too much time has passed from touchstart to be considered a tap...

        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < ev.touchEvent.changedTouches.length; i++) {
          const currTouch = ev.touchEvent.changedTouches[i];
          const startTouch = BeTouchEvent.findTouchById(current.lastTouchStart.touchEvent.targetTouches, currTouch.identifier);

          if (undefined !== startTouch) {
            const currPt = BeTouchEvent.getTouchPosition(currTouch, vp);
            const startPt = BeTouchEvent.getTouchPosition(startTouch, vp);

            if (currPt.distance(startPt) < vp.pixelsFromInches(ToolSettings.touchMoveDistanceInches))
              continue; // Hasn't moved appreciably....
          }

          current.lastTouchStart = undefined; // Not a tap...
          return;
        }

        if (0 !== ev.touchCount || undefined === current.lastTouchStart)
          return;

        // All fingers off, defer processing tap until we've waited long enough to detect double tap...
        if (undefined === current.touchTapTimer) {
          current.touchTapTimer = Date.now();
          current.touchTapCount = 1;
          // eslint-disable-next-line @typescript-eslint/no-floating-promises,@typescript-eslint/unbound-method
          ToolSettings.doubleTapTimeout.executeAfter(this.doubleTapTimeout, this);
        } else if (undefined !== current.touchTapCount) {
          current.touchTapCount++;
        }
        return;
      }

      case "touchcancel": {
        current.lastTouchStart = undefined;
        IModelApp.accuSnap.onTouchCancel(ev);
        if (undefined !== tool)
          tool.onTouchCancel(ev); // eslint-disable-line @typescript-eslint/no-floating-promises
        return;
      }

      case "touchmove": {
        if (!IModelApp.accuSnap.onTouchMove(ev) && undefined !== tool)
          tool.onTouchMove(ev); // eslint-disable-line @typescript-eslint/no-floating-promises

        if (undefined === current.lastTouchStart)
          return;

        if (ev.touchEvent.timeStamp - current.lastTouchStart.touchEvent.timeStamp < ToolSettings.touchMoveDelay.milliseconds)
          return;

        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < ev.touchEvent.changedTouches.length; ++i) {
          const currTouch = ev.touchEvent.changedTouches[i];
          const startTouch = BeTouchEvent.findTouchById(current.lastTouchStart.touchEvent.targetTouches, currTouch.identifier);

          if (undefined === startTouch)
            continue;

          const currPt = BeTouchEvent.getTouchPosition(currTouch, vp);
          const startPt = BeTouchEvent.getTouchPosition(startTouch, vp);

          if (currPt.distance(startPt) < vp.pixelsFromInches(ToolSettings.touchMoveDistanceInches))
            continue; // Hasn't moved appreciably....

          const touchStart = current.lastTouchStart;
          current.lastTouchStart = undefined;

          if (IModelApp.accuSnap.onTouchMoveStart(ev, touchStart))
            return;

          if (undefined === tool || EventHandled.Yes !== await tool.onTouchMoveStart(ev, touchStart))
            this.idleTool.onTouchMoveStart(ev, touchStart); // eslint-disable-line @typescript-eslint/no-floating-promises
          return;
        }
        return;
      }
    }
  }

  /** A first-in-first-out queue of ToolEvents. */
  private static _toolEvents: ToolEvent[] = [];
  private static tryReplace(ev: Event, vp?: ScreenViewport): boolean {
    if (ToolAdmin._toolEvents.length < 1)
      return false;
    const last = ToolAdmin._toolEvents[ToolAdmin._toolEvents.length - 1];
    const lastType = last.ev.type;
    if (lastType !== ev.type || (lastType !== "mousemove" && lastType !== "touchmove"))
      return false; // only mousemove and touchmove can replace previous
    last.ev = ev; // sequential moves are not important. Replace the previous one with this one.
    last.vp = vp;
    return true;
  }

  /** @internal */
  private static getNextEvent(): ToolEvent | undefined {
    if (ToolAdmin._toolEvents.length > 1) // if there is more than one event, we're going to need another animation frame to process it.
      IModelApp.requestNextAnimation();

    return ToolAdmin._toolEvents.shift(); // pull first event from the queue
  }

  /** Called from HTML event listeners. Events are processed in the order they're received in ToolAdmin.eventLoop
   * @internal
   */
  public static addEvent(ev: Event, vp?: ScreenViewport): void {
    if (!ToolAdmin.tryReplace(ev, vp)) // see if this event replaces the last event in the queue
      this._toolEvents.push({ ev, vp }); // otherwise put it at the end of the queue.

    IModelApp.requestNextAnimation(); // wake up event loop, if
  }

  /** Process the next event in the event queue, if any. */
  private async processNextEvent(): Promise<any> {
    const event = ToolAdmin.getNextEvent(); // pull first event from the queue
    if (undefined === event)
      return; // nothing in queue

    switch (event.ev.type) {
      case "mousedown": return this.onMouseButton(event, true);
      case "mouseup": return this.onMouseButton(event, false);
      case "mousemove": return this.onMouseMove(event);
      case "mouseover": return this.onMouseEnter(event);
      case "mouseout": return this.onMouseLeave(event.vp!);
      case "wheel": return this.onWheel(event);
      case "keydown": return this.onKeyTransition(event, true);
      case "keyup": return this.onKeyTransition(event, false);
      case "touchstart": return this.onTouch(event);
      case "touchend": return this.onTouch(event);
      case "touchcancel": return this.onTouch(event);
      case "touchmove": return this.onTouch(event);
    }
  }

  private _processingEvent = false;
  /**
   * Process a single event, plus timer events. Don't start work on new events if the previous one has not finished.
   * @internal
   */
  public async processEvent(): Promise<void> {
    if (this._processingEvent)
      return; // we're still working on the previous event.

    try {
      this._processingEvent = true;  // we can't allow any further event processing until the current event completes.
      await this.processNextEvent();
    } catch (exception) {
      await ToolAdmin.exceptionHandler(exception); // we don't attempt to exit here
    } finally {
      this._processingEvent = false; // this event is now finished. Allow processing next time through.
    }
  }

  /** The idleTool handles events that are not otherwise processed. */
  public get idleTool(): IdleTool { return this._idleTool!; }
  public set idleTool(idleTool: IdleTool) { this._idleTool = idleTool; }

  /** Return true to filter (ignore) events to the given viewport */
  protected filterViewport(vp: ScreenViewport) {
    if (undefined === vp || vp.isDisposed)
      return true;

    const tool = this.activeTool;
    return (undefined !== tool ? !tool.isCompatibleViewport(vp, false) : false);
  }

  /** @internal */
  public onInstallTool(tool: InteractiveTool) { this.currentInputState.onInstallTool(); return tool.onInstall(); }
  /** @internal */
  public onPostInstallTool(tool: InteractiveTool) { tool.onPostInstall(); }

  public get viewTool(): ViewTool | undefined { return this._viewTool; }
  public get primitiveTool(): PrimitiveTool | undefined { return this._primitiveTool; }

  /** The currently active InteractiveTool. May be ViewTool, InputCollector, PrimitiveTool, undefined - in that priority order. */
  public get activeTool(): InteractiveTool | undefined {
    return this._viewTool ? this._viewTool : (this._inputCollector ? this._inputCollector : this._primitiveTool); // NOTE: Viewing tools suspend input collectors as well as primitives
  }

  /** The current tool. May be ViewTool, InputCollector, PrimitiveTool, or IdleTool - in that priority order. */
  public get currentTool(): InteractiveTool { return this.activeTool ? this.activeTool : this.idleTool; }

  /** Ask the current tool to provide tooltip contents for the supplied HitDetail. */
  public async getToolTip(hit: HitDetail): Promise<HTMLElement | string> { return this.currentTool.getToolTip(hit); }

  /**
   * Event raised whenever the active tool changes. This includes PrimitiveTool, ViewTool, and InputCollector.
   * @param newTool The newly activated tool
   */
  public readonly activeToolChanged = new BeEvent<(tool: Tool, start: StartOrResume) => void>();

  /**
   * Event raised by tools that support edit manipulators like the SelectTool.
   * @param tool The current tool
   */
  public readonly manipulatorToolEvent = new BeEvent<(tool: Tool, event: ManipulatorToolEvent) => void>();

  private async onMouseEnter(event: ToolEvent): Promise<void> {
    const vp = event.vp!;
    const current = this.currentInputState;
    current.viewport = vp;

    // Detect if drag was active and button was released outside the view...
    const tool = this.activeTool;
    if (undefined === tool)
      return;

    const buttonMask = (event.ev as MouseEvent).buttons;
    const cancelDrag = (current.isDragging(BeButton.Data) && !(buttonMask & 1)) || (current.isDragging(BeButton.Reset) && !(buttonMask & 2)) || (current.isDragging(BeButton.Middle) && !(buttonMask & 4));
    if (cancelDrag)
      tool.onReinitialize();
  }

  /** @internal */
  public onMouseLeave(vp: ScreenViewport): void {
    IModelApp.accuSnap.clear();
    this.currentInputState.clearViewport(vp);
    this.setCanvasDecoration(vp);
    vp.invalidateDecorations(); // stop drawing locate circle...
  }

  /** @internal */
  public updateDynamics(ev?: BeButtonEvent, useLastData?: boolean, adjustPoint?: boolean): void {
    if (undefined === this.activeTool)
      return;

    if (undefined === ev) {
      ev = new BeButtonEvent();

      if (useLastData)
        this.fillEventFromLastDataButton(ev);
      else
        this.fillEventFromCursorLocation(ev);

      if (adjustPoint && undefined !== ev.viewport)
        this.adjustPoint(ev.point, ev.viewport);
    }

    if (undefined === ev.viewport)
      return;

    // Support tools requesting async information in onMouseMotion for use in decorate or onDynamicFrame...
    const toolPromise = this._toolMotionPromise = this.activeTool.onMouseMotion(ev);
    const tool = this.activeTool;
    const vp = ev.viewport;
    const motion = ev;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    toolPromise.then(() => {
      if (toolPromise !== this._toolMotionPromise)
        return;

      // Update decorations when dynamics are inactive...
      if (!IModelApp.viewManager.inDynamicsMode) {
        vp.invalidateDecorations();
        return;
      }

      // Update dynamics and decorations only after motion...
      const context = new DynamicsContext(vp);
      tool.onDynamicFrame(motion, context);
      context.changeDynamics();
    });
  }

  public async sendEndDragEvent(ev: BeButtonEvent): Promise<any> {
    let tool = this.activeTool;

    if (undefined !== tool) {
      if (!tool.isValidLocation(ev, true))
        tool = undefined;
      else if (tool.receivedDownEvent)
        tool.receivedDownEvent = false;
      else
        tool = undefined;
    }

    // Don't send tool end drag event if it didn't get the start drag event
    if (undefined === tool || EventHandled.Yes !== await tool.onMouseEndDrag(ev))
      return this.idleTool.onMouseEndDrag(ev);
  }

  private setCanvasDecoration(vp: ScreenViewport, dec?: CanvasDecoration, ev?: BeButtonEvent) {
    if (dec === this._canvasDecoration)
      return;

    if (this._canvasDecoration && this._canvasDecoration.onMouseLeave)
      this._canvasDecoration.onMouseLeave();
    this._canvasDecoration = dec;
    if (ev && dec && dec.onMouseEnter) dec.onMouseEnter(ev);

    vp.canvas.style.cursor = dec ? (dec.decorationCursor ? dec.decorationCursor : "pointer") : IModelApp.viewManager.cursor;
    vp.invalidateDecorations();
  }

  private pickCanvasDecoration(ev: BeButtonEvent) {
    const vp = ev.viewport!;
    const decoration = (undefined === this.viewTool) ? vp.pickCanvasDecoration(ev.viewPoint) : undefined;
    this.setCanvasDecoration(vp, decoration, ev);
    return decoration;
  }

  /** Current request for locate/snap */
  private _snapMotionPromise?: Promise<boolean>;
  /** Current request for active tool motion event */
  private _toolMotionPromise?: Promise<void>;

  private clearMotionPromises(): void {
    this._snapMotionPromise = this._toolMotionPromise = undefined;
  }

  private async onMotionSnap(ev: BeButtonEvent): Promise<boolean> {
    try {
      await IModelApp.accuSnap.onMotion(ev);
      return true;
    } catch (error) {
      if (error instanceof AbandonedError)
        return false; // expected, not a problem. Just ignore this motion and return.
      throw error; // unknown error
    }
  }

  private async onStartDrag(ev: BeButtonEvent, tool?: InteractiveTool): Promise<EventHandled> {
    if (undefined !== tool && EventHandled.Yes === await tool.onMouseStartDrag(ev))
      return EventHandled.Yes;

    // Pass start drag event to idle tool if active tool doesn't explicitly handle it
    return this.idleTool.onMouseStartDrag(ev);
  }

  private async onMotion(vp: ScreenViewport, pt2d: XAndY, inputSource: InputSource, forceStartDrag: boolean = false, movement?: XAndY): Promise<any> {
    const current = this.currentInputState;
    current.onMotion(pt2d);

    if (this.filterViewport(vp)) {
      this.setIncompatibleViewportCursor(false);
      return;
    }

    const ev = new BeButtonEvent();
    current.fromPoint(vp, pt2d, inputSource);
    current.toEvent(ev, false);

    const overlayHit = this.pickCanvasDecoration(ev);
    if (undefined !== overlayHit) {
      if (overlayHit.onMouseMove)
        overlayHit.onMouseMove(ev);
      return; // we're inside a pickable decoration, don't send event to tool
    }

    const snapPromise = this._snapMotionPromise = this.onMotionSnap(ev);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    snapPromise.then((snapOk) => {
      if (!snapOk || snapPromise !== this._snapMotionPromise)
        return;

      // Update event to account for AccuSnap adjustments...
      current.fromButton(vp, pt2d, inputSource, true);
      current.toEvent(ev, true);
      ev.movement = movement;

      IModelApp.accuDraw.onMotion(ev);

      const tool = this.activeTool;
      const isValidLocation = (undefined !== tool ? tool.isValidLocation(ev, false) : true);
      this.setIncompatibleViewportCursor(isValidLocation);

      if (forceStartDrag || current.isStartDrag(ev.button)) {
        current.onStartDrag(ev.button);
        current.changeButtonToDownPoint(ev);
        ev.isDragging = true;

        if (undefined !== tool && isValidLocation)
          tool.receivedDownEvent = true;

        return this.onStartDrag(ev, isValidLocation ? tool : undefined);
      }

      this.updateDynamics(ev);
      return;
    });

    if (this.isLocateCircleOn)
      vp.invalidateDecorations();
  }

  private async onMouseMove(event: ToolEvent): Promise<any> {
    const vp = event.vp!;
    const pos = this.getMousePosition(event);
    const mov = this.getMouseMovement(event);

    // Sometimes the mouse goes down in a view, but we lose focus while its down so we never receive the up event.
    // That makes it look like the motion is a drag. Fix that by clearing the "isDown" based on the buttons member of the MouseEvent.
    const buttonMask = (event.ev as MouseEvent).buttons;
    if (!(buttonMask & 1))
      this.currentInputState.button[BeButton.Data].isDown = false;

    return this.onMotion(vp, pos, InputSource.Mouse, false, mov);
  }

  public adjustPointToACS(pointActive: Point3d, vp: Viewport, perpendicular: boolean): void {
    // The "I don't want ACS lock" flag can be set by tools to override the default behavior
    if (0 !== (this.toolState.coordLockOvr & CoordinateLockOverrides.ACS))
      return;

    let viewZRoot: Vector3d;

    // Lock to the construction plane
    if (vp.view.is3d() && vp.view.isCameraOn)
      viewZRoot = vp.view.camera.eye.vectorTo(pointActive);
    else
      viewZRoot = vp.rotation.getRow(2);

    const auxOriginRoot = vp.getAuxCoordOrigin();
    const auxRMatrixRoot = vp.getAuxCoordRotation();
    let auxNormalRoot = auxRMatrixRoot.getRow(2);

    // If ACS xy plane is perpendicular to view and not snapping, project to closest xz or yz plane instead
    if (auxNormalRoot.isPerpendicularTo(viewZRoot) && !TentativeOrAccuSnap.isHot) {
      const auxXRoot = auxRMatrixRoot.getRow(0);
      const auxYRoot = auxRMatrixRoot.getRow(1);
      auxNormalRoot = (Math.abs(auxXRoot.dotProduct(viewZRoot)) > Math.abs(auxYRoot.dotProduct(viewZRoot))) ? auxXRoot : auxYRoot;
    }
    linePlaneIntersect(pointActive, pointActive, viewZRoot, auxOriginRoot, auxNormalRoot, perpendicular);
  }

  public adjustPointToGrid(pointActive: Point3d, vp: Viewport) {
    // The "I don't want grid lock" flag can be set by tools to override the default behavior
    if (!this.gridLock || 0 !== (this.toolState.coordLockOvr & CoordinateLockOverrides.Grid))
      return;
    vp.pointToGrid(pointActive);
  }

  public adjustPoint(pointActive: Point3d, vp: ScreenViewport, projectToACS: boolean = true, applyLocks: boolean = true): void {
    if (Math.abs(pointActive.z) < 1.0e-7)
      pointActive.z = 0.0; // remove Z fuzz introduced by active depth when near 0

    let handled = false;

    if (applyLocks && !(IModelApp.tentativePoint.isActive || IModelApp.accuSnap.isHot))
      handled = IModelApp.accuDraw.adjustPoint(pointActive, vp, false);

    // NOTE: We don't need to support axis lock, it is worthless if you have AccuDraw
    if (!handled && vp.isPointAdjustmentRequired) {
      if (applyLocks)
        this.adjustPointToGrid(pointActive, vp);

      if (projectToACS)
        this.adjustPointToACS(pointActive, vp, false);
    } else if (applyLocks) {
      const savePoint = pointActive.clone();

      this.adjustPointToGrid(pointActive, vp);

      // if grid lock changes point, resend point to accudraw
      if (handled && !pointActive.isExactEqual(savePoint))
        IModelApp.accuDraw.adjustPoint(pointActive, vp, false);
    }

    if (Math.abs(pointActive.z) < 1.0e-7)
      pointActive.z = 0.0;
  }

  public adjustSnapPoint(perpendicular: boolean = true): void {
    const snap = TentativeOrAccuSnap.getCurrentSnap(false);
    if (!snap)
      return;

    const vp = snap.viewport;
    const isHot = snap.isHot;
    const point = snap.getPoint().clone();
    const savePt = point.clone();

    if (!isHot) // Want point adjusted to grid for a hit that isn't hot
      this.adjustPointToGrid(point, vp);

    if (!IModelApp.accuDraw.adjustPoint(point, vp, isHot)) {
      if (vp.isSnapAdjustmentRequired)
        this.adjustPointToACS(point, vp, perpendicular || IModelApp.accuDraw.isActive);
    }

    if (!point.isExactEqual(savePt))
      snap.adjustedPoint.setFrom(point);
  }

  /** @internal */
  public async sendButtonEvent(ev: BeButtonEvent): Promise<any> {
    const overlayHit = this.pickCanvasDecoration(ev);
    if (undefined !== overlayHit && undefined !== overlayHit.onMouseButton && overlayHit.onMouseButton(ev))
      return;
    if (IModelApp.accuSnap.onPreButtonEvent(ev))
      return;

    const activeTool = this.activeTool;
    let tool = activeTool;

    if (undefined !== tool) {
      if (!tool.isValidLocation(ev, true))
        tool = undefined;
      else if (ev.isDown)
        tool.receivedDownEvent = true;
      else if (tool.receivedDownEvent)
        tool.receivedDownEvent = false;
      else
        tool = undefined;
    }

    if (IModelApp.accuDraw.onPreButtonEvent(ev))
      return;

    switch (ev.button) {
      case BeButton.Data: {
        if (undefined === tool) {
          if (undefined !== activeTool)
            break;
          tool = this.idleTool; // Pass data button event to idle tool when no active tool present
        }

        if (ev.isDown) {
          await tool.onDataButtonDown(ev);
        } else {
          await tool.onDataButtonUp(ev);
          break;
        }

        // Lock tool to target model of this view on first data button
        if (tool instanceof PrimitiveTool)
          tool.autoLockTarget();

        // Update tool dynamics. Use last data button location which was potentially adjusted by onDataButtonDown and not current event
        this.updateDynamics(undefined, true);
        break;
      }

      case BeButton.Reset: {
        if (undefined === tool) {
          if (undefined !== activeTool)
            break;
          tool = this.idleTool; // Pass reset button event to idle tool when no active tool present
        }

        if (ev.isDown)
          await tool.onResetButtonDown(ev);
        else
          await tool.onResetButtonUp(ev);
        break;
      }

      case BeButton.Middle: {
        // Pass middle button event to idle tool when active tool doesn't explicitly handle it
        if (ev.isDown) {
          if (undefined === tool || EventHandled.Yes !== await tool.onMiddleButtonDown(ev))
            await this.idleTool.onMiddleButtonDown(ev);
        } else {
          if (undefined === tool || EventHandled.Yes !== await tool.onMiddleButtonUp(ev))
            await this.idleTool.onMiddleButtonUp(ev);
        }
        break;
      }
    }

    IModelApp.tentativePoint.onButtonEvent(ev);
    IModelApp.accuDraw.onPostButtonEvent(ev);
  }

  private async onButtonDown(vp: ScreenViewport, pt2d: XAndY, button: BeButton, inputSource: InputSource): Promise<any> {
    const filtered = this.filterViewport(vp);
    if (undefined === this._viewTool && button === BeButton.Data)
      IModelApp.viewManager.setSelectedView(vp);
    if (filtered)
      return;

    vp.setAnimator();
    const ev = new BeButtonEvent();
    const current = this.currentInputState;
    current.fromButton(vp, pt2d, inputSource, true);
    current.onButtonDown(button);
    current.toEvent(ev, true);
    current.updateDownPoint(ev);

    return this.sendButtonEvent(ev);
  }

  private async onButtonUp(vp: ScreenViewport, pt2d: XAndY, button: BeButton, inputSource: InputSource): Promise<any> {
    if (this.filterViewport(vp))
      return;

    const ev = new BeButtonEvent();
    const current = this.currentInputState;
    const wasDragging = current.isDragging(button);
    current.fromButton(vp, pt2d, inputSource, true);
    current.onButtonUp(button);
    current.toEvent(ev, true);

    if (wasDragging)
      return this.sendEndDragEvent(ev);

    current.changeButtonToDownPoint(ev);
    return this.sendButtonEvent(ev);
  }

  /** Called when any *modifier* (Shift, Alt, or Control) key is pressed or released. */
  private async onModifierKeyTransition(wentDown: boolean, modifier: BeModifierKeys, event: KeyboardEvent): Promise<void> {
    const activeTool = this.activeTool;
    const changed = activeTool ? await activeTool.onModifierKeyTransition(wentDown, modifier, event) : EventHandled.No;

    if (changed === EventHandled.Yes) {
      IModelApp.viewManager.invalidateDecorationsAllViews();
      this.updateDynamics();
    }
  }

  private static getModifierKey(event: KeyboardEvent): BeModifierKeys {
    switch (event.key) {
      case "Alt": return BeModifierKeys.Alt;
      case "Shift": return BeModifierKeys.Shift;
      case "Control": return BeModifierKeys.Control;
    }
    return BeModifierKeys.None;
  }

  /** Process key down events while the Ctrl key is pressed */
  public async onCtrlKeyPressed(keyEvent: KeyboardEvent): Promise<{handled: boolean, result: boolean}> {
    let handled = false;
    let result = false;

    switch (keyEvent.key) {
      case "z":
      case "Z":
        result = await this.doUndoOperation();
        handled = true;
        break;
      case "y":
      case "Y":
        result = await this.doRedoOperation();
        handled = true;
        break;
      case "F2":
        result = IModelApp.uiAdmin.showKeyinPalette();
        handled = true;
        break;
    }

    return { handled, result };
  }

  /** Process shortcut key events */
  public processShortcutKey(_keyEvent: KeyboardEvent, _wentDown: boolean): boolean {
    return false;
  }

  /** Event for every key down and up transition. */
  private async onKeyTransition(event: ToolEvent, wentDown: boolean): Promise<any> {
    const keyEvent = event.ev as KeyboardEvent;
    this.currentInputState.setKeyQualifiers(keyEvent);

    const modifierKey = ToolAdmin.getModifierKey(keyEvent);

    if (BeModifierKeys.None !== modifierKey)
      return this.onModifierKeyTransition(wentDown, modifierKey, keyEvent);

    if (wentDown && keyEvent.ctrlKey) {
      const { handled, result } = await this.onCtrlKeyPressed(keyEvent);
      if (handled)
        return result;
    }

    const activeTool = this.activeTool;
    if (activeTool) {
      if (EventHandled.Yes === await activeTool.onKeyTransition(wentDown, keyEvent))
        return EventHandled.Yes;
    }

    if (this.processShortcutKey(keyEvent, wentDown))
      return EventHandled.Yes;

    return EventHandled.No;
  }

  /** Called to undo previous data button for primitive tools or undo last write operation. */
  public async doUndoOperation(): Promise<boolean> {
    const activeTool = this.activeTool;
    if (activeTool instanceof PrimitiveTool) {
      // ### TODO Add method so UI can be showing string to inform user that undo of last data point is available...
      if (await activeTool.undoPreviousStep())
        return true;
    }

    const imodel = IModelApp.viewManager.selectedView?.view.iModel;
    if (undefined === imodel || imodel.isReadonly || !imodel.isBriefcaseConnection())
      return false;

    if (IModelStatus.Success !== await imodel.txns.reverseSingleTxn())
      return false;

    // ### TODO Restart of primitive tool should be handled by Txn event listener...needs to happen even if not the active tool...
    if (undefined !== this._primitiveTool)
      this._primitiveTool.onRestartTool();

    return true;
  }

  /** Called to redo previous data button for primitive tools or undo last write operation. */
  public async doRedoOperation(): Promise<boolean> {
    const activeTool = this.activeTool;
    if (activeTool instanceof PrimitiveTool) {
      // ### TODO Add method so UI can be showing string to inform user that undo of last data point is available...
      if (await activeTool.redoPreviousStep())
        return true;
    }

    const imodel = IModelApp.viewManager.selectedView?.view.iModel;
    if (undefined === imodel || imodel.isReadonly || !imodel.isBriefcaseConnection())
      return false;

    if (IModelStatus.Success !== await imodel.txns.reinstateTxn())
      return false;

    // ### TODO Restart of primitive tool should be handled by Txn event listener...needs to happen even if not the active tool...
    if (undefined !== this._primitiveTool)
      this._primitiveTool.onRestartTool();

    return true;
  }

  private onActiveToolChanged(tool: Tool, start: StartOrResume): void {
    this.clearMotionPromises();
    this.activeToolChanged.raiseEvent(tool, start);
  }

  private onUnsuspendTool() {
    const tool = this.activeTool;
    if (tool === undefined)
      return;

    tool.onUnsuspend();
    this.onActiveToolChanged(tool, StartOrResume.Resume);
  }

  /** @internal */
  public setInputCollector(newTool?: InputCollector) {
    if (undefined !== this._inputCollector) {
      this._inputCollector.onCleanup();
      this._inputCollector = undefined;
    }
    this._inputCollector = newTool;
  }

  /** @internal */
  public exitInputCollector() {
    if (undefined === this._inputCollector)
      return;
    let unsuspend = false;
    if (this._suspendedByInputCollector) {
      this._suspendedByInputCollector.stop();
      this._suspendedByInputCollector = undefined;
      unsuspend = true;
    }

    IModelApp.viewManager.invalidateDecorationsAllViews();
    this.setInputCollector(undefined);
    if (unsuspend)
      this.onUnsuspendTool();

    IModelApp.accuDraw.onInputCollectorExit();
    this.updateDynamics();
  }

  /** @internal */
  public startInputCollector(newTool: InputCollector): void {
    IModelApp.notifications.outputPrompt("");
    IModelApp.accuDraw.onInputCollectorInstall();

    if (undefined !== this._inputCollector) {
      this.setInputCollector(undefined);
    } else {
      const tool = this.activeTool;
      if (tool)
        tool.onSuspend();
      this._suspendedByInputCollector = new SuspendedToolState();
    }

    IModelApp.viewManager.endDynamicsMode();
    IModelApp.viewManager.invalidateDecorationsAllViews();

    this.setInputCollector(newTool);
    // it is important to raise event after setInputCollector is called
    this.onActiveToolChanged(newTool, StartOrResume.Start);
  }

  /** @internal */
  public setViewTool(newTool?: ViewTool) {
    if (undefined !== this._viewTool) {
      this._viewTool.onCleanup();
      this._viewTool = undefined;
    }
    this._viewTool = newTool;
  }

  /** @internal */
  public exitViewTool() {
    if (undefined === this._viewTool)
      return;
    let unsuspend = false;
    if (undefined !== this._suspendedByViewTool) {
      this._suspendedByViewTool.stop(); // Restore state of suspended tool
      this._suspendedByViewTool = undefined;
      unsuspend = true;
    }

    IModelApp.viewManager.invalidateDecorationsAllViews();
    this.setViewTool(undefined);
    if (unsuspend)
      this.onUnsuspendTool();

    IModelApp.accuDraw.onViewToolExit();
    this.updateDynamics();
  }

  /** @internal */
  public startViewTool(newTool: ViewTool) {

    IModelApp.notifications.outputPrompt("");
    IModelApp.accuDraw.onViewToolInstall();

    if (undefined !== this._viewTool) {
      this.setViewTool(undefined);
    } else {
      const tool = this.activeTool;
      if (tool)
        tool.onSuspend();
      this._suspendedByViewTool = new SuspendedToolState();
    }

    IModelApp.viewManager.endDynamicsMode();
    IModelApp.viewManager.invalidateDecorationsAllViews();

    this.toolState.coordLockOvr = CoordinateLockOverrides.All;
    this.toolState.locateCircleOn = false;

    IModelApp.accuSnap.onStartTool();

    this.setCursor(IModelApp.viewManager.crossHairCursor);
    this.setViewTool(newTool);
    // it is important to raise event after setViewTool is called
    this.onActiveToolChanged(newTool, StartOrResume.Start);
  }

  /** @internal */
  public setPrimitiveTool(newTool?: PrimitiveTool) {
    if (undefined !== this._primitiveTool) {
      this._primitiveTool.onCleanup();
      this._primitiveTool = undefined;
    }
    this._primitiveTool = newTool;
  }

  /** @internal */
  public startPrimitiveTool(newTool?: PrimitiveTool) {
    IModelApp.notifications.outputPrompt("");
    this.exitViewTool();

    if (undefined !== this._primitiveTool)
      this.setPrimitiveTool(undefined);

    // clear the primitive tool first so following call does not trigger the refreshing of the ToolSetting for the previous primitive tool
    this.exitInputCollector();

    IModelApp.viewManager.endDynamicsMode();
    this.setIncompatibleViewportCursor(true); // Don't restore this
    IModelApp.viewManager.invalidateDecorationsAllViews();

    this.toolState.coordLockOvr = CoordinateLockOverrides.None;
    this.toolState.locateCircleOn = false;

    IModelApp.accuDraw.onPrimitiveToolInstall();
    IModelApp.accuSnap.onStartTool();

    if (undefined !== newTool) {
      this.setCursor(IModelApp.viewManager.crossHairCursor);
      this.setPrimitiveTool(newTool);
    }
    // it is important to raise event after setPrimitiveTool is called
    this.onActiveToolChanged(undefined !== newTool ? newTool : this.idleTool, StartOrResume.Start);
  }

  /** Method used by interactive tools to send updated values to UI components, typically showing tool settings.
   * @beta
   */
  public syncToolSettingsProperties(toolId: string, syncProperties: DialogPropertySyncItem[]): void {
    if (this.toolSettingsChangeHandler)
      this.toolSettingsChangeHandler(toolId, syncProperties);
  }

  /** Method used by interactive tools to send request to reload UI from properties returned via method supplyToolSettingsProperties.
   * @beta
   */
  public reloadToolSettingsProperties(): void {
    if (this.reloadToolSettingsHandler)
      this.reloadToolSettingsHandler();
  }

  /** Method used to "bump" the value of a tool setting for the current tool.
   * To "bump" a setting means to toggle a boolean value or cycle through enum values.
   * If no `settingIndex` param is specified, the first setting is bumped.
   * Returns true if the setting was successfully bumped.
   * @beta
   */
  public async bumpToolSetting(settingIndex?: number): Promise<boolean> {
    return this.currentTool.bumpToolSetting(settingIndex);
  }

  /** Method used by interactive tools to inform one or more UI components to refresh. This is typically used to update labels or icons associated with a specific tool.
   * This method should be used when the caller wants the UI layer to process the sync event immediately. Use dispatchUiSyncEvent when the event may be triggered while other
   * more important user interaction processing is required.
   * @param specificSyncEventId Optional sync event id. If not specified then "tool-admin-refresh-ui" is used.
   * @param toolId Optional, will be used if specificSyncEventId is not specified. If used, the resulting sync event Id will be created using `tool-admin-refresh-ui-${toolId}`.toLowerCase()
   * @beta
   */
  public dispatchImmediateUiSyncEvent(specificSyncEventId?: string, toolId?: string): void {
    const defaultRefreshEventId = "tool-admin-refresh-ui";
    if (this.toolSyncUiEventDispatcher) {
      if (specificSyncEventId)
        this.toolSyncUiEventDispatcher(specificSyncEventId.toLowerCase(), true);
      else if (toolId)
        this.toolSyncUiEventDispatcher(`${defaultRefreshEventId}-${toolId}`.toLowerCase(), true);
      else
        this.toolSyncUiEventDispatcher(defaultRefreshEventId, true);
    }
  }

  /** Method used by interactive tools to inform one or more UI components to refresh. This is typically used to update labels or icons associated with a specific tool.
   * This method should be used when the caller wants the UI layer to process the sync event on a timer, waiting a few 100 ms, allowing other events that may require a UI refresh
   * to be processed together.
   * @param specificSyncEventId Optional sync event id. If not specified then "tool-admin-refresh-ui" is used.
   * @param toolId Optional, will be used if specificSyncEventId is not specified. If used, the resulting sync event Id will be created using `tool-admin-refresh-ui-${toolId}`.toLowerCase()
   * @beta
   */
  public dispatchUiSyncEvent(specificSyncEventId?: string, toolId?: string): void {
    const defaultRefreshEventId = "tool-admin-refresh-ui";
    if (this.toolSyncUiEventDispatcher) {
      if (specificSyncEventId)
        this.toolSyncUiEventDispatcher(specificSyncEventId.toLowerCase());
      else if (toolId)
        this.toolSyncUiEventDispatcher(`${defaultRefreshEventId}-${toolId}`.toLowerCase());
      else
        this.toolSyncUiEventDispatcher(defaultRefreshEventId);
    }
  }

  /**
   * Starts the default [[Tool]], if any. Generally invoked automatically when other tools exit, so shouldn't be called directly.
   * @note The default tool is expected to be a subclass of [[PrimitiveTool]]. A call to startDefaultTool is required to terminate
   * an active [[ViewTool]] or [[InputCollector]] and replace or clear the current [[PrimitiveTool]].
   * The tool's [[Tool.run]] method is invoked with arguments specified by [[defaultToolArgs]].
   * @see [[defaultToolId]] to configure the default tool.
   */
  public startDefaultTool() {
    if (!IModelApp.tools.run(this.defaultToolId, this.defaultToolArgs))
      this.startPrimitiveTool(undefined);
  }

  public setCursor(cursor: string | undefined): void {
    if (undefined === this._saveCursor)
      IModelApp.viewManager.setViewCursor(cursor);
    else
      this._saveCursor = cursor;
  }

  /** @internal */
  public testDecorationHit(id: string): boolean { return this.currentTool.testDecorationHit(id); }

  /** @internal */
  public getDecorationGeometry(hit: HitDetail): GeometryStreamProps | undefined { return this.currentTool.getDecorationGeometry(hit); }

  /** @internal */
  public decorate(context: DecorateContext): void {
    const tool = this.activeTool;
    if (undefined !== tool) {
      tool.decorate(context);

      if (undefined !== this._inputCollector && tool !== this._inputCollector)
        this._inputCollector.decorateSuspended(context);

      if (undefined !== this._primitiveTool && tool !== this._primitiveTool)
        this._primitiveTool.decorateSuspended(context);
    }

    const viewport = this.currentInputState.viewport;
    if (viewport !== context.viewport)
      return;

    const ev = new BeButtonEvent();
    this.fillEventFromCursorLocation(ev);

    const hit = IModelApp.accuDraw.isActive ? undefined : IModelApp.accuSnap.currHit; // NOTE: Show surface normal until AccuDraw becomes active
    viewport.drawLocateCursor(context, ev.viewPoint, viewport.pixelsFromInches(IModelApp.locateManager.apertureInches), this.isLocateCircleOn, hit);
  }

  public get isLocateCircleOn(): boolean {
    if (!this.toolState.locateCircleOn || undefined !== this._canvasDecoration)
      return false;

    if (InputSource.Mouse === this.currentInputState.inputSource)
      return true;

    return (InputSource.Touch === this.currentInputState.inputSource && undefined !== IModelApp.accuSnap.touchCursor);
  }

  /** @internal */
  public beginDynamics(): void {
    IModelApp.accuDraw.onBeginDynamics();
    IModelApp.viewManager.beginDynamicsMode();
    this.setCursor(IModelApp.viewManager.dynamicsCursor);
  }

  /** @internal */
  public endDynamics(): void {
    IModelApp.accuDraw.onEndDynamics();
    IModelApp.viewManager.endDynamicsMode();
    this.setCursor(IModelApp.viewManager.crossHairCursor);
  }

  /** @internal */
  public fillEventFromCursorLocation(ev: BeButtonEvent) { this.currentInputState.toEvent(ev, true); }
  /** @internal */
  public fillEventFromLastDataButton(ev: BeButtonEvent) { this.currentInputState.toEventFromLastDataPoint(ev); }
  /** @internal */
  public setAdjustedDataPoint(ev: BeButtonEvent) { this.currentInputState.adjustLastDataPoint(ev); }

  /** Can be called by tools that wish to emulate mouse button down/up events for onTouchTap. */
  public async convertTouchTapToButtonDownAndUp(ev: BeTouchEvent, button: BeButton = BeButton.Data): Promise<void> {
    const pt2d = ev.viewPoint;
    await this.onButtonDown(ev.viewport!, pt2d, button, InputSource.Touch);
    return this.onButtonUp(ev.viewport!, pt2d, button, InputSource.Touch);
  }

  /** Can be called by tools that wish to emulate moving the mouse with a button depressed for onTouchMoveStart.
   * @note Calls the tool's onMouseStartDrag method from onMotion.
   */
  public async convertTouchMoveStartToButtonDownAndMotion(startEv: BeTouchEvent, ev: BeTouchEvent, button: BeButton = BeButton.Data): Promise<void> {
    await this.onButtonDown(startEv.viewport!, startEv.viewPoint, button, InputSource.Touch);
    return this.onMotion(ev.viewport!, ev.viewPoint, InputSource.Touch, true);
  }

  /** Can be called by tools that wish to emulate pressing the mouse button for onTouchStart or onTouchMoveStart. */
  public async convertTouchStartToButtonDown(ev: BeTouchEvent, button: BeButton = BeButton.Data): Promise<void> {
    return this.onButtonDown(ev.viewport!, ev.viewPoint, button, InputSource.Touch);
  }

  /** Can be called by tools that wish to emulate releasing the mouse button for onTouchEnd or onTouchComplete.
   * @note Calls the tool's onMouseEndDrag method if convertTouchMoveStartToButtonDownAndMotion was called for onTouchMoveStart.
   */
  public async convertTouchEndToButtonUp(ev: BeTouchEvent, button: BeButton = BeButton.Data): Promise<void> {
    return this.onButtonUp(ev.viewport!, ev.viewPoint, button, InputSource.Touch);
  }

  /** Can be called by tools that wish to emulate a mouse motion event for onTouchMove. */
  public async convertTouchMoveToMotion(ev: BeTouchEvent): Promise<void> {
    return this.onMotion(ev.viewport!, ev.viewPoint, InputSource.Touch);
  }

  /** @internal */
  public setIncompatibleViewportCursor(restore: boolean) {
    if (restore) {
      if (undefined === this._saveCursor)
        return;

      this.toolState.locateCircleOn = this._saveLocateCircle;
      IModelApp.viewManager.setViewCursor(this._saveCursor);
      this._saveCursor = undefined;
      return;
    }

    if (undefined !== this._saveCursor)
      return;

    this._saveLocateCircle = this.toolState.locateCircleOn;
    this._saveCursor = IModelApp.viewManager.cursor;
    this.toolState.locateCircleOn = false;
    IModelApp.viewManager.setViewCursor("not-allowed");
  }

  /** Performs default handling of mouse wheel event (zoom in/out) */
  public async processWheelEvent(ev: BeWheelEvent, doUpdate: boolean): Promise<EventHandled> {
    await WheelEventProcessor.process(ev, doUpdate);
    IModelApp.viewManager.invalidateDecorationsAllViews();
    this.updateDynamics(ev);
    return EventHandled.Yes;
  }

  /** @internal */
  public onSelectedViewportChanged(previous: ScreenViewport | undefined, current: ScreenViewport | undefined): void {
    IModelApp.accuDraw.onSelectedViewportChanged(previous, current);

    if (undefined === current) {
      this.callOnCleanup();
      return;
    }

    if (undefined !== this._viewTool)
      this._viewTool.onSelectedViewportChanged(previous, current);

    if (undefined !== this._inputCollector)
      this._inputCollector.onSelectedViewportChanged(previous, current);

    if (undefined !== this._primitiveTool)
      this._primitiveTool.onSelectedViewportChanged(previous, current);
  }

  public setLocateCircleOn(locateOn: boolean): void {
    if (undefined === this._saveCursor)
      this.toolState.locateCircleOn = locateOn;
    else
      this._saveLocateCircle = locateOn;
  }

  public setLocateCursor(enableLocate: boolean): void {
    const viewManager = IModelApp.viewManager;
    this.setCursor(viewManager.inDynamicsMode ? viewManager.dynamicsCursor : viewManager.crossHairCursor);
    this.setLocateCircleOn(enableLocate);
    viewManager.invalidateDecorationsAllViews();
  }

  /** @internal */
  public callOnCleanup(): void {
    this.exitViewTool();
    this.exitInputCollector();
    if (undefined !== this._primitiveTool)
      this._primitiveTool.onCleanup();
  }
}

/**
 * Default processor to handle wheel events.
 * @internal
 */
export class WheelEventProcessor {
  public static async process(ev: BeWheelEvent, doUpdate: boolean): Promise<void> {
    const vp = ev.viewport;
    if (undefined === vp)
      return;

    await this.doZoom(ev);

    if (doUpdate) {
      // AccuSnap hit won't be invalidated without cursor motion (closes info window, etc.).
      IModelApp.accuSnap.clear();
    }
  }

  private static async doZoom(ev: BeWheelEvent): Promise<ViewStatus> {
    const vp = ev.viewport;
    if (undefined === vp)
      return ViewStatus.InvalidViewport;

    let zoomRatio = ToolSettings.wheelZoomRatio;
    if (zoomRatio < 1)
      zoomRatio = 1;
    if (ev.wheelDelta > 0)
      zoomRatio = 1 / zoomRatio;

    let isSnapOrPrecision = false;
    const target = Point3d.create();
    if (IModelApp.tentativePoint.isActive) {
      // Always use Tentative location, adjusted point, not cross
      isSnapOrPrecision = true;
      target.setFrom(IModelApp.tentativePoint.getPoint());
    } else {
      // Never use AccuSnap location as initial zoom clears snap causing zoom center to "jump"
      isSnapOrPrecision = CoordSource.Precision === ev.coordsFrom;
      target.setFrom(isSnapOrPrecision ? ev.point : ev.rawPoint);
    }

    const view = vp.view;
    const animationOptions: ViewChangeOptions = {
      animateFrustumChange: true,
      cancelOnAbort: true,
      animationTime: ScreenViewport.animation.time.wheel.milliseconds,
      easingFunction: Easing.Cubic.Out,
      onExtentsError: (err) => view.outputStatusMessage(err),
    };

    const currentInputState = IModelApp.toolAdmin.currentInputState;
    let status: ViewStatus;
    const now = Date.now();
    if (view.is3d() && view.isCameraOn) {
      if (!isSnapOrPrecision) {
        let lastEvent = currentInputState.lastWheelEvent;
        if (undefined !== lastEvent && lastEvent.viewport &&
          now - lastEvent.time < ToolSettings.doubleClickTimeout.milliseconds &&
          lastEvent.viewport.view.equals(view) && lastEvent.viewPoint.distanceSquaredXY(ev.viewPoint) < 10) {
          target.setFrom(lastEvent.point);
          lastEvent.time = now;
        } else {
          const newTarget = vp.pickNearestVisibleGeometry(target);
          if (undefined !== newTarget) {
            target.setFrom(newTarget);
          } else {
            view.getTargetPoint(target);
          }
          currentInputState.lastWheelEvent = lastEvent = ev.clone();
          lastEvent.point.setFrom(target);
        }
      }

      const transform = Transform.createFixedPointAndMatrix(target, Matrix3d.createScale(zoomRatio, zoomRatio, zoomRatio));
      const eye = view.getEyePoint();
      const newEye = transform.multiplyPoint3d(eye);
      const offset = eye.vectorTo(newEye);

      // when you're too close to an object, the wheel zoom operation will stop. We set a "bump distance" so you can blast through obstacles.
      const bumpDist = Math.max(ToolSettings.wheelZoomBumpDistance, view.minimumFrontDistance());
      if (offset.magnitude() < bumpDist) {
        offset.scaleToLength(bumpDist, offset); // move bump distance, just to get to the other side.
        target.addInPlace(offset);
        newEye.setFrom(eye.plus(offset));
        currentInputState.lastWheelEvent = undefined; // we need to search on the "other side" of what we were bumping into
      }

      const zDir = view.getZVector();
      target.setFrom(newEye.plusScaled(zDir, zDir.dotProduct(newEye.vectorTo(target))));

      if (ViewStatus.Success === (status = view.lookAtUsingLensAngle(newEye, target, view.getYVector(), view.camera.lens, undefined, undefined, animationOptions)))
        vp.synchWithView(animationOptions);
    } else {
      const targetNpc = vp.worldToNpc(target);
      const trans = Transform.createFixedPointAndMatrix(targetNpc, Matrix3d.createScale(zoomRatio, zoomRatio, 1));

      const viewCenter = trans.multiplyPoint3d(Point3d.create(.5, .5, .5));
      vp.npcToWorld(viewCenter, viewCenter);
      return vp.zoom(viewCenter, zoomRatio, animationOptions);
    }

    // if we scrolled out, we may have invalidated the current AccuSnap path
    await IModelApp.accuSnap.reEvaluate();
    return status;
  }
}

/**
 * @public
 */
export namespace ToolAdmin { // eslint-disable-line no-redeclare

  /**
   * Active settings that placement tools will use.
   * @alpha
   */
  export class ActiveSettings {

    /** The active category */
    public category?: Id64String;

    /** The target model */
    public model?: Id64String;
  }

}
