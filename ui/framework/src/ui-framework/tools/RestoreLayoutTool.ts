/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */
import { IModelApp, NotifyMessageDetails, OutputMessagePriority, Tool } from "@bentley/imodeljs-frontend";
import { FrontstageManager } from "../frontstage/FrontstageManager";
import { FrontstageDef } from "../frontstage/FrontstageDef";
import { UiFramework } from "../UiFramework";

/**
 * Immediate tool that will reset the layout to that specified in the stage definition. A stage Id
 * may be passed in, if not the active stage is used. The stage Id is case sensitive.
 * @alpha
 */
export class RestoreFrontstageLayoutTool extends Tool {
  public static override toolId = "RestoreFrontstageLayout";
  public static override iconSpec = "icon-view-layouts";

  // istanbul ignore next
  public static override get minArgs() { return 0; }
  // istanbul ignore next
  public static override get maxArgs() { return 1; }

  public override run(frontstageId?: string): boolean {
    let frontstageDef: FrontstageDef | undefined;

    if (frontstageId) {
      frontstageDef = FrontstageManager.findFrontstageDef(frontstageId);
    } else {
      frontstageDef = FrontstageManager.activeFrontstageDef;
    }

    if (frontstageDef)
      frontstageDef.restoreLayout();
    else
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, UiFramework.translate("tools.RestoreFrontstageLayout.noStageFound")));
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(args[0]);
  }
}
