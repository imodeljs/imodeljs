/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */
import { IModelApp, Tool } from "@bentley/imodeljs-frontend";
import { ToolSettingsManager } from "../zones/toolsettings/ToolSettingsManager";

/**
 * Immediate tool that will focus into the Tool Settings widget.
 * @alpha
 */
export class FocusToolSettings extends Tool {
  public static override toolId = "FocusToolSettings";

  public override run(): boolean {
    return ToolSettingsManager.focusIntoToolSettings();
  }
}

/**
 * Immediate tool that will bump a Tool Settings value.
 * @alpha
 */
export class BumpToolSetting extends Tool {
  public static override toolId = "BumpToolSetting";

  // istanbul ignore next
  public static override get maxArgs() { return 1; }

  public override run(settingIndexStr?: string): boolean {
    let settingIndex: number | undefined;
    if (settingIndexStr) {
      settingIndex = parseInt(settingIndexStr, 10);
      if (isNaN(settingIndex))
        return false;
    }
    IModelApp.toolAdmin.bumpToolSetting(settingIndex);  // eslint-disable-line @typescript-eslint/no-floating-promises
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(args[0]);
  }
}
