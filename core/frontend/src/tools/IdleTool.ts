/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import { IModelApp } from "../IModelApp";
import { BeButton, BeButtonEvent, BeTouchEvent, BeWheelEvent, EventHandled, InteractiveTool } from "./Tool";
import { DefaultViewTouchTool, FitViewTool, ViewHandleType, ViewManip } from "./ViewTool";

/**
 * The default "idle" tool. If no tool is active, or the active tool does not respond to a given
 * event, input events are forwarded to the idle tool. The default idle tool converts middle mouse button events
 * and touch gestures into view navigation operations like pan, zoom, rotate, and fit.
 *
 * Controls are as follows:
 * - Mouse/keyboard:
 *   - mmb: pan
 *   - shift-mmb: rotate
 *   - wheel: zoom in/out
 *   - double-mmb: fit view
 * - Touch:
 *   - single-finger drag: rotate
 *   - two-finger drag: pan
 *   - pinch: zoom in/out
 *   - double-tap: fit view
 *
 * Touch inputs can be combined e.g. drag two fingers while moving them closer together => pan + zoom in
 * @public
 */
export class IdleTool extends InteractiveTool {
  public static override toolId = "Idle";
  public static override hidden = true;

  public override async onMouseStartDrag(ev: BeButtonEvent): Promise<EventHandled> {
    if (!ev.viewport)
      return EventHandled.No;

    let toolId: string;
    let handleId: ViewHandleType;

    switch (ev.button) {
      case BeButton.Middle:
        if (ev.isControlKey) {
          toolId = ev.viewport.view.allow3dManipulations() ? "View.Look" : "View.Scroll";
          handleId = ev.viewport.view.allow3dManipulations() ? ViewHandleType.Look : ViewHandleType.Scroll;
        } else if (ev.isShiftKey) {
          toolId = "View.Rotate";
          handleId = ViewHandleType.Rotate;
        } else {
          toolId = "View.Pan";
          handleId = ViewHandleType.Pan;
        }
        break;

      case BeButton.Data:
        // When no active tool is present install rotate view tool on drag of data button
        if (undefined !== IModelApp.toolAdmin.activeTool)
          return EventHandled.No;
        toolId = "View.Rotate";
        handleId = ViewHandleType.Rotate;
        break;

      default:
        // When no active tool is present install pan view tool on drag of reset button
        if (undefined !== IModelApp.toolAdmin.activeTool)
          return EventHandled.No;
        toolId = "View.Pan";
        handleId = ViewHandleType.Pan;
        break;
    }

    const currTool = IModelApp.toolAdmin.viewTool;
    if (currTool) {
      if (currTool instanceof ViewManip)
        return currTool.startHandleDrag(ev, handleId); // See if current view tool can drag using this handle, leave it active regardless...
      return EventHandled.No;
    }
    const viewTool = IModelApp.tools.create(toolId, ev.viewport, true, true) as ViewManip | undefined;
    if (viewTool && viewTool.run())
      return viewTool.startHandleDrag(ev);
    return EventHandled.Yes;
  }

  public override async onMiddleButtonUp(ev: BeButtonEvent): Promise<EventHandled> {
    if (!ev.viewport)
      return EventHandled.No;

    if (ev.isDoubleClick) {
      const viewTool = new FitViewTool(ev.viewport, true);
      return viewTool.run() ? EventHandled.Yes : EventHandled.No;
    }

    if (ev.isControlKey || ev.isShiftKey)
      return EventHandled.No;

    IModelApp.tentativePoint.process(ev);
    return EventHandled.Yes;
  }

  public override async onMouseWheel(ev: BeWheelEvent) { return IModelApp.toolAdmin.processWheelEvent(ev, true); }

  public override async onTouchMoveStart(ev: BeTouchEvent, startEv: BeTouchEvent): Promise<EventHandled> {
    const tool = new DefaultViewTouchTool(startEv, ev);
    return tool.run() ? EventHandled.Yes : EventHandled.No;
  }

  public override async onTouchTap(ev: BeTouchEvent): Promise<EventHandled> {
    if (ev.isSingleTap) {
      // Send data down/up for single finger tap.
      IModelApp.toolAdmin.convertTouchTapToButtonDownAndUp(ev, BeButton.Data); // eslint-disable-line @typescript-eslint/no-floating-promises
      return EventHandled.Yes;
    } else if (ev.isTwoFingerTap) {
      // Send reset down/up for two finger tap.
      IModelApp.toolAdmin.convertTouchTapToButtonDownAndUp(ev, BeButton.Reset); // eslint-disable-line @typescript-eslint/no-floating-promises
      return EventHandled.Yes;
    } else if (ev.isDoubleTap) {
      // Fit view on single finger double tap.
      const tool = new FitViewTool(ev.viewport!, true);
      return tool.run() ? EventHandled.Yes : EventHandled.No;
    }
    return EventHandled.No;
  }

  public exitTool(): void { }
  public override run() { return true; }
}
