/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import { AxisOrder, Matrix3d, Point3d, Transform, Vector3d } from "@bentley/geometry-core";
import { ColorDef } from "@bentley/imodeljs-common";
import { AccuDrawHintBuilder } from "../AccuDraw";
import { HitDetail } from "../HitDetail";
import { IModelApp } from "../IModelApp";
import { IModelConnection } from "../IModelConnection";
import { SelectionSetEvent } from "../SelectionSet";
import { DecorateContext } from "../ViewContext";
import { Viewport } from "../Viewport";
import { BeButton, BeButtonEvent, BeTouchEvent, CoordinateLockOverrides, EventHandled, InputCollector, InputSource, Tool } from "./Tool";
import { ManipulatorToolEvent } from "./ToolAdmin";

/** Classes and methods to create on screen control handles for interactive modification of element(s) and pickable decorations.
 * The basic flow is:
 * - Create a sub-class of [[EditManipulator.HandleProvider]] to listen for start of [[SelectTool]] or any other PrimitiveTool that supports handle providers.
 * - Respond to [[ManipulatorToolEvent.Start]] by adding a listener for [[SelectionSet]] change event.
 * - Respond to selection changed event to create control handles as pickable decorations when the desired element(s) or pickable decoration is selected.
 * - Respond to button events on the control handle decoration and run a sub-class of [[EditManipulator.HandleTool]] to modify.
 * @public
*/
export namespace EditManipulator {
  /** Specifies the event for [[EditManipulator.HandleProvider.onManipulatorEvent]] */
  export enum EventType {
    /** Control handles should be created, updated, or cleared based on the active selection. */
    Synch,
    /** Control handle modification was cancelled by user. */
    Cancel,
    /** Control handle modification was accepted by user. */
    Accept
  }

  /** Interactive control handle modification is done by installing an [[InputCollector]].
   * Modification typically is started from a click or press and drag while over the handle graphics.
   * The HandleTool base class is set up to define an offset by 2 points. The second point is
   * defined by either another click, or up event when initiated from press and drag.
   * @see [[EditManipulator.HandleProvider]]
   */
  export abstract class HandleTool extends InputCollector {
    public static toolId = "Select.Manipulator"; // Doesn't matter, not included in tool registry...
    public static hidden = true;
    public readonly manipulator: HandleProvider;

    public constructor(manipulator: HandleProvider) {
      super();
      this.manipulator = manipulator;
    }

    /** Establish the initial tool state for handle modification.
     * Default implementation honors the active locks and enables AccuSnap; behavior suitable for a shape vertex handle.
     * @note An InputCollector inherits the tool state of the suspended primitive tool.
     */
    protected init(): void {
      // Set this.receivedDownEvent to still get up events sent to this tool instance when installed from another tool's down event (ex. onModelStartDrag).
      this.receivedDownEvent = true;

      // Override inherited tool state from suspended primitive tool...
      if (this.wantAccuSnap)
        this.initLocateElements(false, true, undefined, CoordinateLockOverrides.None);
      else
        this.initLocateElements(false, false, undefined, CoordinateLockOverrides.All);
    }

    /** Whether to call [[AccuSnap.enableSnap]] for handle modification.
     * @return true to enable snapping to elements.
     */
    protected get wantAccuSnap(): boolean { return true; }

    /** Called from reset button up event to allow modification to be cancelled.
     * @return true to cancel modification.
     */
    protected cancel(_ev: BeButtonEvent): boolean { return true; }

    /** Called from data button down event to check if enough input has been gathered to complete the modification.
     * @return true to complete modification.
     */
    protected abstract accept(_ev: BeButtonEvent): boolean;

    /** Called following cancel or accept to update the handle provider
     * and return control to suspended PrimitiveTool.
     */
    protected async onComplete(_ev: BeButtonEvent, event: EventType): Promise<EventHandled> {
      this.exitTool();
      this.manipulator.onManipulatorEvent(event);

      return EventHandled.Yes;
    }

    public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
      if (!this.accept(ev))
        return EventHandled.No;

      return this.onComplete(ev, EventType.Accept);
    }

    public async onResetButtonUp(ev: BeButtonEvent): Promise<EventHandled> {
      if (!this.cancel(ev))
        return EventHandled.No;

      return this.onComplete(ev, EventType.Cancel);
    }

    public async onTouchMove(ev: BeTouchEvent): Promise<void> { return IModelApp.toolAdmin.convertTouchMoveToMotion(ev); }
    public async onTouchComplete(ev: BeTouchEvent): Promise<void> { return IModelApp.toolAdmin.convertTouchEndToButtonUp(ev); }
    public async onTouchCancel(ev: BeTouchEvent): Promise<void> { return IModelApp.toolAdmin.convertTouchEndToButtonUp(ev, BeButton.Reset); }

    public onPostInstall(): void {
      super.onPostInstall();
      this.init();
    }
  }

  /** A handle provider maintains a set of controls used to modify element(s) or pickable decorations.
   * The provider works in conjunction with any PrimitiveTool that raises events for [[ToolAdmin.manipulatorToolEvent]].
   * @see [[SelectTool]] The default PrimitiveTool that supports handle providers.
   */
  export abstract class HandleProvider {
    protected _isActive = false;
    protected _removeManipulatorToolListener?: () => void;
    protected _removeSelectionListener?: () => void;
    protected _removeDecorationListener?: () => void;

    /** Create a new handle provider to listen for [[ToolAdmin.manipulatorToolEvent]].
     * Usually followed by a call to [[IModelApp.toolAdmin.startDefaultTool]] to immediately raise the [[ManipulatorToolEvent.Start]] event.
     */
    public constructor(public iModel: IModelConnection) {
      this._removeManipulatorToolListener = IModelApp.toolAdmin.manipulatorToolEvent.addListener((tool, event) => this.onManipulatorToolEvent(tool, event));
    }

    /** Call to clear this handle provider. */
    protected stop(): void {
      if (this._removeSelectionListener) {
        this._removeSelectionListener();
        this._removeSelectionListener = undefined;
      }
      if (this._removeManipulatorToolListener) {
        this._removeManipulatorToolListener();
        this._removeManipulatorToolListener = undefined;
      }
      this.clearControls();
    }

    /** Event raised by a PrimitiveTool that supports handle providers.
     * Add listener for [[IModelConnection.selectionSet.onChanged]] on start event and remove on stop event.
     * Control handles can be created from the active selection set, which may include persistent elements and pickable decorations.
     * @see [[SelectionSet]]
     */
    public onManipulatorToolEvent(_tool: Tool, event: ManipulatorToolEvent): void {
      switch (event) {
        case ManipulatorToolEvent.Start: {
          if (this._removeSelectionListener)
            break;
          this._removeSelectionListener = this.iModel.selectionSet.onChanged.addListener((ev) => this.onSelectionChanged(ev));
          if (this.iModel.selectionSet.isActive)
            this.onManipulatorEvent(EventType.Synch); // Give opportunity to add controls when tool is started with an existing selection...
          break;
        }
        case ManipulatorToolEvent.Stop: {
          if (!this._removeSelectionListener)
            break;
          this._removeSelectionListener();
          this._removeSelectionListener = undefined;
          this.clearControls();
        }
      }
    }

    /** Event raised by [[SelectionSet]] when the active selection changes.
     * Calls onManipulatorEvent to let the provider create, update, or clear it's set of controls as appropriate.
     * @see [[SelectionSet]]
     */
    public onSelectionChanged(ev: SelectionSetEvent): void {
      if (this.iModel === ev.set.iModel)
        this.onManipulatorEvent(EventType.Synch);
    }

    /** Register for decorate event to start displaying control handles. */
    protected updateDecorationListener(add: boolean): void {
      if (this._removeDecorationListener) {
        if (!add) {
          this._removeDecorationListener();
          this._removeDecorationListener = undefined;
        }
        IModelApp.viewManager.invalidateDecorationsAllViews();
      } else if (add) {
        if (!this._removeDecorationListener)
          this._removeDecorationListener = IModelApp.viewManager.addDecorator(this);
        IModelApp.viewManager.invalidateDecorationsAllViews();
      }
    }

    /** Sub-classes should override to display the pickable graphics for their controls. */
    public decorate(_context: DecorateContext): void { }

    /** The provider is responsible for checking if modification by controls is valid.
     * May still wish to present controls for "transient" geometry in non-read/write applications, etc.
     */
    protected abstract createControls(): Promise<boolean>;

    /* Call to stop displaying the the control handles */
    protected clearControls(): void {
      this.updateDecorationListener(this._isActive = false);
    }

    /** A provider can install an [[InputCollector]] to support interactive modification.
     * @return true if a tool was successfully run.
     * @see [[EditManipulator.HandleTool]]
    */
    protected abstract modifyControls(_hit: HitDetail, _ev: BeButtonEvent): boolean;

    /* Create, update, or clear based on the current selection. */
    protected async updateControls(): Promise<void> {
      const created = await this.createControls();
      if (this._isActive && !created)
        this.clearControls();
      else
        this.updateDecorationListener(this._isActive = created);
    }

    /* Update controls to reflect active selection or post-modification state. */
    public onManipulatorEvent(_eventType: EventType): void {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.updateControls();
    }

    /** Sub-classes can override to perform some operation for a double click on a handle. */
    protected async onDoubleClick(_hit: HitDetail, _ev: BeButtonEvent): Promise<EventHandled> { return EventHandled.No; }

    /** Sub-classes can override to present a menu for a right click on a handle. */
    protected async onRightClick(_hit: HitDetail, _ev: BeButtonEvent): Promise<EventHandled> { return EventHandled.No; }

    /** Sub-classes can override to respond to a touch tap on a handle. By default, handles are selected by touch drag and taps are ignored. */
    protected async onTouchTap(_hit: HitDetail, _ev: BeButtonEvent): Promise<EventHandled> { return EventHandled.Yes; }

    /** Event raised by a PrimitiveTool that supports handle providers to allow a pickable decoration to respond to being located. */
    public async onDecorationButtonEvent(hit: HitDetail, ev: BeButtonEvent): Promise<EventHandled> {
      if (!this._isActive)
        return EventHandled.No;

      if (ev.isDoubleClick)
        return this.onDoubleClick(hit, ev); // Allow double click on handle to override default operation (ex. fit view).

      if (BeButton.Reset === ev.button && !ev.isDown && !ev.isDragging)
        return this.onRightClick(hit, ev); // Allow right click on handle to present a menu.

      if (BeButton.Data !== ev.button)
        return EventHandled.No;

      if (ev.isControlKey)
        return EventHandled.No; // Support ctrl+click to select multiple controls (ex. linestring vertices)...

      if (InputSource.Touch === ev.inputSource && !ev.isDragging)
        return this.onTouchTap(hit, ev); // Default is to select controls on touch drag only, ignore tap on control...

      if (ev.isDown && !ev.isDragging)
        return EventHandled.No; // Select controls on up event or down event only after drag started...

      if (!this.modifyControls(hit, ev))
        return EventHandled.No;

      // In case InputCollector was installed for handle modification, don't wait for motion to show dynamic frame adjusted for AccuDraw hints...
      IModelApp.accuDraw.refreshDecorationsAndDynamics();

      return EventHandled.Yes;
    }
  }

  /** Utility methods for creating control handles and other decorations. */
  export class HandleUtils {
    /** Adjust input color for contrast against view background.
     * @param color The color to adjust.
     * @param vp The viewport to compare.
     * @return color adjusted for view background color or original color if view background color isn't being used.
     */
    public static adjustForBackgroundColor(color: ColorDef, vp: Viewport): ColorDef {
      if (vp.view.is3d() && vp.view.getDisplayStyle3d().environment.sky.display)
        return color;
      return color.adjustedForContrast(vp.view.backgroundColor);
    }

    /** Compute a transform that will try to orient a 2d shape (like an arrow) to face the camera.
     * @param vp The viewport to get the rotation from.
     * @param base The world coordinate point to pivot about.
     * @param direction The world coordinate axis to tilt along.
     * @param sizeInches The transform scale specified in screen inches.
     * @returns transform or undefined when input direction is almost perpendicular to viewing direction.
     * @see [[getArrowShape]]
     */
    public static getArrowTransform(vp: Viewport, base: Point3d, direction: Vector3d, sizeInches: number): Transform | undefined {
      const boresite = AccuDrawHintBuilder.getBoresite(base, vp);
      if (Math.abs(direction.dotProduct(boresite.direction)) >= 0.99)
        return undefined;

      const pixelSize = vp.pixelsFromInches(sizeInches);
      const scale = vp.viewingSpace.getPixelSizeAtPoint(base) * pixelSize;
      const matrix = Matrix3d.createRigidFromColumns(direction, boresite.direction, AxisOrder.XZY);
      if (undefined === matrix)
        return undefined;

      matrix.scaleColumnsInPlace(scale, scale, scale);
      return Transform.createRefs(base.clone(), matrix);
    }

    /** Return array of shape points representing a unit arrow in xy plane pointing in positive x direction. */
    public static getArrowShape(baseStart: number = 0.0, baseWidth: number = 0.15, tipStart: number = 0.55, tipEnd: number = 1.0, tipWidth: number = 0.3, flangeStart: number = tipStart, flangeWidth: number = baseWidth): Point3d[] {
      const shapePts: Point3d[] = [];
      shapePts[0] = Point3d.create(tipEnd, 0.0);
      shapePts[1] = Point3d.create(flangeStart, tipWidth);
      shapePts[2] = Point3d.create(tipStart, flangeWidth);
      shapePts[3] = Point3d.create(baseStart, baseWidth);
      shapePts[4] = Point3d.create(baseStart, -baseWidth);
      shapePts[5] = Point3d.create(tipStart, -flangeWidth);
      shapePts[6] = Point3d.create(flangeStart, -tipWidth);
      shapePts[7] = shapePts[0].clone();
      return shapePts;
    }
  }
}
