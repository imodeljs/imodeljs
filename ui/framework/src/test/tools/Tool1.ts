/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Point3d } from "@bentley/geometry-core";
import { BeButtonEvent, EventHandled, IModelApp, PrimitiveTool } from "@bentley/imodeljs-frontend";

/** @internal */
export class Tool1 extends PrimitiveTool {
  public static override toolId = "Tool1";
  public readonly points: Point3d[] = [];

  public override requireWriteableTarget(): boolean { return false; }
  public override onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }

  public setupAndPromptForNextAction(): void {
    IModelApp.notifications.outputPromptByKey("SampleApp:tools.Tool1.Prompts.GetPoint");
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    this.points.push(ev.point.clone());
    this.setupAndPromptForNextAction();
    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    IModelApp.toolAdmin.startDefaultTool();
    return EventHandled.No;
  }

  public onRestartTool(): void {
    const tool = new Tool1();
    if (!tool.run())
      this.exitTool();
  }
}
