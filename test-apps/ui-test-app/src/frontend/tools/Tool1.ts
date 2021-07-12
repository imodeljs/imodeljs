/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Point3d } from "@bentley/geometry-core";
import { ColorDef } from "@bentley/imodeljs-common";
import {
  BeButtonEvent, EventHandled, IModelApp, NotifyMessageDetails, OutputMessagePriority, PrimitiveTool, ToolAssistance, ToolAssistanceImage,
} from "@bentley/imodeljs-frontend";
import { DialogItemValue, DialogPropertySyncItem } from "@bentley/ui-abstract";

export class Tool1 extends PrimitiveTool {
  public static override toolId = "Tool1";
  public static override iconSpec = "icon-placeholder";
  public readonly points: Point3d[] = [];
  private _weight = 1;
  public get weight() { return this._weight; }
  public set weight(value: number) {
    this._weight = value;

    const msg = `Weight set to ${value}`;
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
  }

  private syncColorInUi(): void {
    const syncColorValue: DialogItemValue = { value: this._color.tbgr };
    const syncColor: DialogPropertySyncItem = { value: syncColorValue, propertyName: "color" };
    this.syncToolSettingsProperties([syncColor]);
  }

  private _color = ColorDef.green;
  public get color() { return this._color; }
  public set color(value: ColorDef) {
    this._color = value;

    const msg = `Color set to ${value.toRgbString()}`;
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));

    this.syncColorInUi();
  }

  public override requireWriteableTarget(): boolean { return false; }
  public override onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }
  public override onUnsuspend(): void { this.provideToolAssistance(); }

  /** Establish current tool state and initialize drawing aides following onPostInstall, onDataButtonDown, onUndoPreviousStep, or other events that advance or back up the current tool state.
   * Enable snapping or auto-locate for AccuSnap.
   * Setup AccuDraw using AccuDrawHintBuilder.
   * Set view cursor when default cursor isn't applicable.
   * Provide tool assistance.
   */
  protected setupAndPromptForNextAction(): void {
    this.provideToolAssistance();
  }

  /** A tool is responsible for providing tool assistance appropriate to the current tool state following significant events.
   * After onPostInstall to establish instructions for the initial tool state.
   * After onUnsuspend to reestablish instructions when no longer suspended by a ViewTool or InputCollector.
   * After onDataButtonDown (or other tool event) advances or backs up the current tool state.
   * After onUndoPreviousStep or onRedoPreviousStep modifies the current tool state.
   */
  protected provideToolAssistance(): void {
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, IModelApp.i18n.translate("SampleApp:tools.Tool2.Prompts.GetPoint"));

    const instruction1 = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, "Click on something", true);
    const instruction2 = ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["A"]), "Press a key");
    const instruction3 = ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["A", "B"]), "Press one of two keys", true);
    const instruction4 = ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["W"], ["A", "S", "D"]), "Press one of four keys");
    const instruction5 = ToolAssistance.createKeyboardInstruction(ToolAssistance.shiftKeyboardInfo, "Press the Shift key", true);
    const instruction6 = ToolAssistance.createKeyboardInstruction(ToolAssistance.ctrlKeyboardInfo, "Press the Ctrl key");
    const instruction7 = ToolAssistance.createKeyboardInstruction(ToolAssistance.altKeyboardInfo, "Press the Alt key");

    const section1 = ToolAssistance.createSection([instruction1, instruction2, instruction3, instruction4, instruction5, instruction6, instruction7], ToolAssistance.inputsLabel);

    const instruction21 = ToolAssistance.createInstruction(ToolAssistanceImage.AcceptPoint, "Accept result");
    const instruction22 = ToolAssistance.createInstruction(ToolAssistanceImage.MouseWheel, "Use mouse wheel");
    // cSpell:disable
    const instruction23 = ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, "Left click. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.");
    const instruction24 = ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, "Right click. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.");
    // cSpell:enable
    const section2 = ToolAssistance.createSection([instruction21, instruction22, instruction23, instruction24], "More Inputs");

    const instructions = ToolAssistance.createInstructions(mainInstruction, [section1, section2]);

    IModelApp.notifications.setToolAssistance(instructions);
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    this.points.push(ev.point.clone());
    this.setupAndPromptForNextAction();
    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    /* Common reset behavior for primitive tools is calling onReinitialize to restart or exitTool to terminate. */
    this.onReinitialize();
    return EventHandled.No;
  }

  public onRestartTool(): void {
    const tool = new Tool1();
    if (!tool.run())
      this.exitTool();
  }
}
