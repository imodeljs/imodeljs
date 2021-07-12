/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */
import { Tool } from "@bentley/imodeljs-frontend";
import { SettingsModalFrontstage } from "../frontstage/ModalSettingsStage";

/**
 * Immediate tool that will open the Settings modal stage.
 * @alpha
 */
export class OpenSettingsTool extends Tool {
  public static override toolId = "OpenSettings";
  public static override iconSpec = "icon-settings";

  // istanbul ignore next
  public static override get minArgs() { return 0; }
  // istanbul ignore next
  public static override get maxArgs() { return 1; }

  public override run(settingCategory?: string): boolean {
    SettingsModalFrontstage.showSettingsStage(settingCategory);
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(args[0]);
  }
}
