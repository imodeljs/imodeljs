/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Point3d } from "@bentley/geometry-core";
import placeholderSvg from "@bentley/icons-generic/icons/placeholder.svg?sprite";
import {
  BeButtonEvent, EventHandled, IModelApp, PrimitiveTool, ToolAssistance, ToolAssistanceImage, ToolAssistanceInputMethod,
} from "@bentley/imodeljs-frontend";
import { IconSpecUtilities } from "@bentley/ui-abstract";

export class Tool2 extends PrimitiveTool {
  public static override toolId = "Tool2";
  public static override iconSpec = IconSpecUtilities.createSvgIconSpec(placeholderSvg);
  public readonly points: Point3d[] = [];

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

    const instruction1 = ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, "Click on something", true);
    const instruction2 = ToolAssistance.createInstruction(ToolAssistanceImage.LeftClickDrag, "Click then drag", true);
    const instruction3 = ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["B"]), "Press a key");
    const instruction4 = ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["C", "D"]), "Press one of two keys", true);
    const instruction5 = ToolAssistance.createKeyboardInstruction(ToolAssistance.arrowKeyboardInfo, "Press one of four keys");
    const instruction6 = ToolAssistance.createKeyboardInstruction(ToolAssistance.shiftSymbolKeyboardInfo, "Press the Shift key");
    const instruction7 = ToolAssistance.createModifierKeyInstruction(ToolAssistance.shiftKey, ToolAssistanceImage.LeftClick, "Shift + something else");
    const instruction8 = ToolAssistance.createModifierKeyInstruction(ToolAssistance.ctrlKey, ToolAssistanceImage.LeftClick, "Ctrl + something else");
    const instruction9 = ToolAssistance.createModifierKeyInstruction(ToolAssistance.altKey, ToolAssistanceImage.LeftClickDrag, "Alt + something else");
    const instruction10 = ToolAssistance.createModifierKeyInstruction(ToolAssistance.shiftKey, "icon-cursor-click", "Shift + something else");
    const instruction11 = ToolAssistance.createModifierKeyInstruction(ToolAssistance.ctrlKey, "icon-cursor-click", "Ctrl + something else");
    const instruction12 = ToolAssistance.createModifierKeyInstruction(ToolAssistance.altKey, "icon-cursor-click", "Alt + something else");

    const instruction13 = ToolAssistance.createInstruction("icon-cursor-click", "Using icon-cursor-click icon");
    const instruction14 = ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo([ToolAssistance.ctrlKey, "Z"]), "Press Ctrl+Z", true);
    const instruction15 = ToolAssistance.createInstruction(IconSpecUtilities.createSvgIconSpec(placeholderSvg), "Using placeholder SVG icon");

    const instructionT1 = ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, "Tap on something", false, ToolAssistanceInputMethod.Touch);
    const instructionT2 = ToolAssistance.createInstruction(ToolAssistanceImage.LeftClickDrag, "Tap on something then drag", false, ToolAssistanceInputMethod.Touch);

    const section1 = ToolAssistance.createSection(
      [
        instruction1, instruction2, instruction3, instruction4, instruction5, instruction6, instruction7, instruction8,
        instruction9, instruction10, instruction11, instruction12, instruction13, instruction14, instruction15,
        instructionT1, instructionT2,
      ],
      ToolAssistance.inputsLabel);

    const instructions = ToolAssistance.createInstructions(mainInstruction, [section1]);

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
    const tool = new Tool2();
    if (!tool.run())
      this.exitTool();
  }
}
