/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { FeatureAppearance, FeatureAppearanceProps, LinePixels, RgbColorProps } from "@bentley/imodeljs-common";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority, SpatialViewState, Tool, Viewport } from "@bentley/imodeljs-frontend";
import { parseBoolean } from "./parseBoolean";

function changeModelAppearanceOverrides(vp: Viewport | undefined, overrides: FeatureAppearanceProps, name: string): boolean {
  let changed = false;
  if (vp !== undefined && vp.view instanceof SpatialViewState)
    vp.view.forEachModel((model) => {
      if (name === undefined || model.name === name) {
        changed = true;
        const existingOverrides = vp.displayStyle.settings.getModelAppearanceOverride(model.id);
        vp.overrideModelAppearance(model.id, existingOverrides ? existingOverrides.clone(overrides) : FeatureAppearance.fromJSON(overrides));
      }
    });

  return changed;
}

/** Set model appearance override for transparency in display style.
 * @beta
 */
export class SetModelTransparencyTool extends Tool {
  public static override toolId = "SetModelTransparencyTool";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  public override run(transparency: number, name: string): boolean {
    const changed = changeModelAppearanceOverrides(IModelApp.viewManager.selectedView, { transparency }, name);

    if (changed)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Model: ${name} set to transparency: ${transparency}`));

    return changed;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(parseFloat(args[0]), args[1]);
  }
}

/** Set model appearance override for line weight in display style.
 * @beta
 */
export class SetModelLineWeightTool extends Tool {
  public static override toolId = "SetModelLineWeightTool";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  public override run(weight: number, name: string): boolean {
    const changed = changeModelAppearanceOverrides(IModelApp.viewManager.selectedView, { weight }, name);

    if (changed)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Model: ${name} set to line weight: ${weight}`));

    return changed;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(parseFloat(args[0]), args[1]);
  }
}

/** Set model appearance override for line code in display style.
 * @beta
 */
export class SetModelLineCodeTool extends Tool {
  public static override toolId = "SetModelLineCodeTool";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }
  public static linePixels = [LinePixels.Code0, LinePixels.Code1, LinePixels.Code2, LinePixels.Code3, LinePixels.Code4, LinePixels.Code5, LinePixels.Code6, LinePixels.Code7];

  public override run(lineCode: number, name: string): boolean {
    if (lineCode < 0 || lineCode >= SetModelLineCodeTool.linePixels.length)
      return false;

    const changed = changeModelAppearanceOverrides(IModelApp.viewManager.selectedView, { linePixels: SetModelLineCodeTool.linePixels[lineCode] }, name);

    if (changed)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Model: ${name} set to line code: ${lineCode}`));

    return changed;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(parseFloat(args[0]), args[1]);
  }
}

/** Set model appearance override for nonLocatable in display style.
 * @beta
 */
export class SetModelLocateTool extends Tool {
  public static override toolId = "SetModelLocateTool";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  public override run(locate: boolean, name: string): boolean {
    const nonLocatable = locate ? undefined : true;
    const changed = changeModelAppearanceOverrides(IModelApp.viewManager.selectedView, { nonLocatable }, name);

    if (changed)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Mode: ${name} set to locate: ${locate}`));

    return changed;
  }

  public override parseAndRun(...args: string[]): boolean {
    const locate = parseBoolean(args[0]);
    return locate === undefined ? false : this.run(locate, args[1]);
  }
}

/** Set model appearance override for emphasized in display style.
 * @beta
 */
export class SetModelEmphasizedTool extends Tool {
  public static override toolId = "SetModelEmphasizedTool";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  public override run(emphasized: true | undefined, name: string): boolean {
    const changed = changeModelAppearanceOverrides(IModelApp.viewManager.selectedView, { emphasized }, name);

    if (changed)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Mode: ${name} set to emphasized: ${emphasized}`));

    return changed;
  }

  public override parseAndRun(...args: string[]): boolean {
    const emphasized = parseBoolean(args[0]);
    return emphasized === undefined ? false : this.run(emphasized ? true : undefined, args[1]);
  }
}

/** Set model appearance override for ignoreMaterials in display style.
 * @beta
 */
export class SetModelIgnoresMaterialsTool extends Tool {
  public static override toolId = "SetModelIgnoresMaterialsTool";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  public override run(ignoresMaterial: true | undefined, name: string): boolean {
    const changed = changeModelAppearanceOverrides(IModelApp.viewManager.selectedView, { ignoresMaterial }, name);

    if (changed)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Mode: ${name} set to ignore Materials: ${ignoresMaterial}`));

    return changed;
  }

  public override parseAndRun(...args: string[]): boolean {
    const ignoresMaterial = parseBoolean(args[0]);
    return ignoresMaterial === undefined ? false : this.run(ignoresMaterial ? true : undefined, args[1]);
  }
}

/** Set model appearance override for color in display style.
 * @beta
 */
export class SetModelColorTool extends Tool {
  public static override toolId = "SetModelColorTool";
  public static override get minArgs() { return 3; }
  public static override get maxArgs() { return 4; }

  public override run(rgb: RgbColorProps, name: string): boolean {
    const changed = changeModelAppearanceOverrides(IModelApp.viewManager.selectedView, { rgb }, name);

    if (changed)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Model: ${name} set to color: ${rgb}`));

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run({ r: parseFloat(args[0]), g: parseFloat(args[1]), b: parseFloat(args[2]) }, args[3]);
  }
}

/** clear model appearance overrides in display style.
 * @beta
 */
export class ClearModelAppearanceOverrides extends Tool {
  public static override toolId = "ClearModelAppearanceOverrides";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override run(name?: string): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp !== undefined && vp.view instanceof SpatialViewState) {
      vp.view.forEachModel((model) => {
        if (name === undefined || model.name === name)
          vp.dropModelAppearanceOverride(model.id);
      });
    }

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(args[0]);
  }
}
