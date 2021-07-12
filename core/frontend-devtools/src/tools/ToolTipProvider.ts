/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { HitDetail, IModelApp, Tool, ToolTipProvider } from "@bentley/imodeljs-frontend";
import { parseToggle } from "./parseToggle";

/** Augments tooltips with detailed information useful for debugging.
 * @internal
 */
class DebugToolTipProvider implements ToolTipProvider {
  private static _instance?: DebugToolTipProvider;

  public async augmentToolTip(hit: HitDetail, tooltipPromise: Promise<HTMLElement | string>): Promise<HTMLElement | string> {
    // discard and overwrite
    await tooltipPromise;

    const keys: Array<keyof HitDetail> = ["sourceId", "modelId", "subCategoryId", "tileId", "geometryClass"];
    let html = "";
    for (const key of keys) {
      const value = hit[key];
      if (undefined === value)
        continue;

      html = `${html + key}: ${value.toString()}<br>`;
    }

    const div = document.createElement("div");
    div.innerHTML = html;
    return div;
  }

  public static setEnabled(enabled: boolean | undefined): void {
    if (undefined === enabled)
      enabled = undefined === this._instance;

    if (enabled) {
      if (undefined === this._instance) {
        this._instance = new DebugToolTipProvider();
        IModelApp.viewManager.addToolTipProvider(this._instance);
      }
    } else if (undefined !== this._instance) {
      IModelApp.viewManager.dropToolTipProvider(this._instance);
      this._instance = undefined;
    }
  }
}

/** Replaces the default tooltips displayed when mousing over elements to instead display information useful for debugging, including
 * element, model, subcategory, and tile Ids as well as geometry class.
 * @beta
 */
export class ToggleToolTipsTool extends Tool {
  public static override toolId = "ToggleToolTips";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override run(enable?: boolean): boolean {
    DebugToolTipProvider.setEnabled(enable);
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const enable = parseToggle(args[0]);
    if (typeof enable !== "string")
      this.run(enable);

    return true;
  }
}
