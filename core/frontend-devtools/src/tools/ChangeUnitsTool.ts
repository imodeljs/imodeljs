/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { IModelApp, Tool } from "@bentley/imodeljs-frontend";
import { parseToggle } from "./parseToggle";

// CSpell: ignore fmtr

/** Controls whether quantities are formatted using imperial or metric units.
 * Such formatting is used in many places; one example is the output of the MeasureTool.
 * @beta
 */
export class ChangeUnitsTool extends Tool {
  public static override toolId = "ChangeUnits";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  // support boolean for backwards compatibility
  public override run(useMetric?: boolean): boolean {
    const fmtr = IModelApp.quantityFormatter;

    // if no arg then toggle to metric from any non-metric unit system
    const useImperial = undefined !== useMetric ? !useMetric : fmtr.activeUnitSystem === "metric";
    const unitSystem = useImperial ? "imperial" : "metric";

    if (unitSystem !== fmtr.activeUnitSystem) {
      fmtr.setActiveUnitSystem(unitSystem);// eslint-disable-line @typescript-eslint/no-floating-promises
      IModelApp.toolAdmin.startDefaultTool();
    }

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const enable = parseToggle(args[0]);
    if (typeof enable !== "string")
      this.run(enable);

    return true;
  }
}
