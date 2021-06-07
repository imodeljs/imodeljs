/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import { assert } from "@bentley/bentleyjs-core";
import { IModelApp } from "../IModelApp";
import { IModelConnection } from "../IModelConnection";
import { NotifyMessageDetails, OutputMessagePriority } from "../NotificationManager";
import { Viewport } from "../Viewport";
import { AccuDrawShortcuts } from "./AccuDrawTool";
import { BeButton, BeButtonEvent, CoordinateLockOverrides, CoreTools, InteractiveTool } from "./Tool";

/** The PrimitiveTool class can be used to implement tools to create or modify geometric elements.
 * @see [Writing a PrimitiveTool]($docs/learning/frontend/primitivetools.md)
 * @public
 */
export abstract class PrimitiveTool extends InteractiveTool {
  /** The viewport within which the tool operates.
   * @note This property is only initialized if [[run]] returns `true`, causing the tool to be installed.
   */
  public targetView?: Viewport;
  private _targetModelId?: string;
  public get targetModelId() { return this._targetModelId; }
  public set targetModelId(v: string | undefined) { this._targetModelId = v; }
  public targetIsLocked: boolean = false; // If target model is known, set this to true in constructor and override getTargetModel.

  /** Get the iModel on which this tool operates.
   * @note The iModel is obtained from [[targetView]], so should only be invoked if the tool installed successfully.
   */
  public get iModel(): IModelConnection {
    assert(undefined !== this.targetView);
    return this.targetView.view.iModel;
  }

  /**
   * Establish this tool as the active PrimitiveTool.
   * @return true if this tool was installed (though it may have exited too)
   * @note If you override this method you **must** call `super.run` and return false if it returns false.
   */
  public run(..._args: any[]): boolean {
    const { toolAdmin, viewManager } = IModelApp;
    if (!this.isCompatibleViewport(viewManager.selectedView, false) || !toolAdmin.onInstallTool(this))
      return false;

    toolAdmin.startPrimitiveTool(this);
    toolAdmin.onPostInstallTool(this);
    return true;
  }

  /** Determine whether the supplied Viewport is compatible with this tool.
   * @param vp the Viewport to check
   */
  public isCompatibleViewport(vp: Viewport | undefined, isSelectedViewChange: boolean): boolean {
    if (undefined === vp)
      return false; // No views are open...

    const view = vp.view;
    const iModel = view.iModel;

    if (this.requireWriteableTarget() && iModel.isReadonly)
      return false; // this Tool can't be used when iModel is read only.

    if (undefined === this.targetView || (!this.targetIsLocked && isSelectedViewChange))
      this.targetView = vp; // Update target to new view if undefined or still free to change.

    if (undefined === this.targetModelId && (!this.targetIsLocked || vp === this.targetView))
      return true; // Accept if this view is current target or any type of model/view is still ok as target is still free to change.

    if (iModel !== this.iModel)
      return false; // Once a ViewState has been established, only accept viewport showing the same iModel.

    if (this.targetModelId)
      return view.viewsModel(this.targetModelId); // If a specific target model is specified, only allow view that shows it.

    if (view.isSpatialView() && this.targetView.view.isSpatialView())
      return true; // No specific target, two spatial views are considered compatible.

    let allowView = false;
    view.forEachModel((model) => { if (!allowView && this.targetView!.view.viewsModel(model.id)) allowView = true; });
    return allowView; // Accept if this view shares a model in common with target.
  }

  /**
   * Checks that the adjusted point from the supplied button event is within the project extents for spatial views. The range of physical geometry
   * should always be fully inside the project extents. Only checking the adjusted point won't absolutely guarantee that a tool doesn't create/move geometry
   * outside the project extents, but it will be sufficient to handle most cases and provide good feedback to the user.
   * @return true if ev is acceptable.
   */
  public isValidLocation(ev: BeButtonEvent, isButtonEvent: boolean): boolean {
    const vp = ev.viewport;
    if (undefined === vp)
      return false;

    if (isButtonEvent && BeButton.Data !== ev.button)
      return true;

    const view = vp.view;
    if (!view.isSpatialView())
      return true;

    // NOTE: If points aren't being adjusted then the tool shouldn't be creating geometry currently (ex. locating elements) and we shouldn't filter point...
    if (0 !== (IModelApp.toolAdmin.toolState.coordLockOvr & CoordinateLockOverrides.ACS))
      return true;

    // We know the tool isn't doing a locate, we don't know what it will do with this point. Minimize erroneous filtering by restricting the check to when AccuSnap is tool enable (not user enabled)...
    if (!IModelApp.accuSnap.isSnapEnabled)
      return true;

    const extents = view.iModel.projectExtents;
    if (extents.containsPoint(ev.point))
      return true;

    if (isButtonEvent && ev.isDown)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, CoreTools.translate("ElementSet.Error.ProjectExtents")));

    return false;
  }

  /** Called on data button down event to lock the tool to its current target model. */
  public autoLockTarget(): void { if (undefined === this.targetView) return; this.targetIsLocked = true; }

  /**  Returns the prompt based on the tool's current state. */
  public getPrompt(): string { return ""; }

  /** Called from isCompatibleViewport to check for a read only iModel, which is not a valid target for tools that create or modify elements. */
  public requireWriteableTarget(): boolean { return true; }

  /**
   * Called when active view changes. Tool may choose to restart or exit based on current view type.
   * @param _previous The previously active view.
   * @param current The new active view.
   */
  public onSelectedViewportChanged(_previous: Viewport | undefined, current: Viewport | undefined): void {
    if (this.isCompatibleViewport(current, true))
      return;
    this.onRestartTool();
  }

  /**
   * Called when an external event may invalidate the current tool's state.
   * Examples are undo, which may invalidate any references to elements, or an incompatible active view change.
   * The active tool is expected to call installTool with a new instance, or exitTool to start the default tool.
   * ```ts
   *   const tool = new MyPrimitiveTool();
   *   if (!tool.run())
   *     this.exitTool(); // Don't leave current instance active if new instance rejects install...
   * ```
   */
  public abstract onRestartTool(): void;

  /**
   * Called to reset tool to initial state. PrimitiveTool implements this method to call onRestartTool.
   */
  public onReinitialize(): void { this.onRestartTool(); }

  public exitTool(): void { IModelApp.toolAdmin.startDefaultTool(); }

  /**
   * Called to reverse to a previous tool state (ex. undo last data button).
   * @return false to instead reverse the most recent transaction.
   */
  public async onUndoPreviousStep(): Promise<boolean> { return false; }

  /** @internal */
  public async undoPreviousStep(): Promise<boolean> {
    if (!await this.onUndoPreviousStep())
      return false;

    AccuDrawShortcuts.processPendingHints(); // Process any hints the active tool setup in _OnUndoPreviousStep now...
    IModelApp.viewManager.invalidateDecorationsAllViews();
    IModelApp.toolAdmin.updateDynamics();

    return true;
  }

  /**
   * Called to reinstate to a previous tool state (ex. redo last data button).
   * @return false to instead reinstate the most recent transaction.
   */
  public async onRedoPreviousStep(): Promise<boolean> { return false; }

  /** @internal */
  public async redoPreviousStep(): Promise<boolean> {
    if (!await this.onRedoPreviousStep())
      return false;

    AccuDrawShortcuts.processPendingHints(); // Process any hints the active tool setup in _OnUndoPreviousStep now...
    IModelApp.viewManager.invalidateDecorationsAllViews();
    IModelApp.toolAdmin.updateDynamics();

    return true;
  }

  /** If this tool is editing a briefcase, commits any elements that the tool has changed, supplying the tool name as the undo string. */
  public async saveChanges(): Promise<void> {
    if (this.iModel.isBriefcaseConnection())
      return this.iModel.saveChanges(this.toolId);
  }
}
