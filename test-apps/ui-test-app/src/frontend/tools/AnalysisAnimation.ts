/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

// cSpell:ignore configurableui

import { Point3d } from "@bentley/geometry-core";
import { BeButtonEvent, EventHandled, IModelApp, PrimitiveTool, Viewport } from "@bentley/imodeljs-frontend";
import { ConfigurableUiManager } from "@bentley/ui-framework";
import { AnalysisAnimationToolSettingsProvider } from "./AnalysisAnimationToolSettings";

/** Tool that shows animation of Analysis information stored as a 'special' property in the display style.
 * @public
 */
export class AnalysisAnimationTool extends PrimitiveTool {
  public static override toolId = "AnalysisAnimation";  // used to look up labels and to register this tool
  public readonly points: Point3d[] = [];

  /** Allow tool to run on ready only iModels. */
  public override requireWriteableTarget(): boolean { return false; }
  public override onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }

  /** Show tool prompt. */
  public setupAndPromptForNextAction(): void {
    IModelApp.notifications.outputPromptByKey("UiFramework:tools.AnalysisAnimation.Prompts.SelectView");
  }

  /** Handle user pressing left mouse button. */
  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    this.points.push(ev.point.clone());
    this.setupAndPromptForNextAction();
    return EventHandled.No;
  }

  /** Handle user pressing right mouse button. */
  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    IModelApp.toolAdmin.startDefaultTool();
    return EventHandled.No;
  }

  /** Process request to restart the tool. */
  public onRestartTool(): void {
    const tool = new AnalysisAnimationTool();
    if (!tool.run())
      this.exitTool();
  }

  /** Process selected viewport changes. */
  public override onSelectedViewportChanged(_previous: Viewport | undefined, current: Viewport | undefined): void {
    if (undefined === current || undefined === current.view.analysisStyle)
      IModelApp.toolAdmin.startDefaultTool();
  }
}

ConfigurableUiManager.registerControl(AnalysisAnimationTool.toolId, AnalysisAnimationToolSettingsProvider);
