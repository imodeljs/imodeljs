/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { FeatureAppearance, FeatureAppearanceProps, RgbColorProps } from "@bentley/imodeljs-common";
import { getCesiumAssetUrl, IModelApp, NotifyMessageDetails, OutputMessagePriority, Tool, Viewport } from "@bentley/imodeljs-frontend";
import { copyStringToClipboard } from "../ClipboardUtilities";
import { parseBoolean } from "./parseBoolean";
import { parseToggle } from "./parseToggle";

/** This tool attaches a specified reality model.
 * @beta
 */
export class AttachRealityModelTool extends Tool {
  public static override toolId = "AttachRealityModelTool";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 1; }

  /** This method runs the tool, attaching a specified reality model.
   * @param data a [[ContextRealityModelProps]] JSON representation
   */
  public override run(data: string): boolean {
    const props = JSON.parse(data);
    const vp = IModelApp.viewManager.selectedView;
    if (vp === undefined)
      return false;

    if (props === undefined || props.tilesetUrl === undefined) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, `Properties ${props} are not valid`));
    }

    vp.displayStyle.attachRealityModel(props);
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Reality Model ${props.tilesetUrl} attached`));

    return true;
  }

  /** Executes this tool's run method with args[0] containing `data`.
   * @see [[run]]
   */
  public override parseAndRun(...args: string[]): boolean {
    return this.run(args[0]);
  }
}

/** This tool saves a reality model's JSON representation to the system clipboard.
 * @beta */
export class SaveRealityModelTool extends Tool {
  public static override toolId = "SaveRealityModelTool";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  /** This method runs the tool, saving a reality model's JSON representation to the system clipboard.
   * @param name the name of the reality model to copy; if undefined, copy the last found reality model
   */
  public override run(name: string | undefined): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp === undefined)
      return false;
    vp.displayStyle.forEachRealityModel((realityModel) => {
      if (name === undefined || realityModel.name === name) {
        copyStringToClipboard(JSON.stringify(realityModel.toJSON()));
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Reality Model ${realityModel.name} copied to clipboard`));
      }
    });

    return true;
  }

  /** Executes this tool's run method with args[0] containing `name`.
   * @see [[run]]
   */
  public override parseAndRun(...args: string[]): boolean {
    return this.run(args.length > 0 ? args[0] : undefined);
  }
}

function changeRealityModelAppearanceOverrides(vp: Viewport, overrides: FeatureAppearanceProps, index: number): boolean {
  const model = vp.displayStyle.settings.contextRealityModels.models[index];
  if (!model)
    return false;

  model.appearanceOverrides = model.appearanceOverrides ? model.appearanceOverrides.clone(overrides) : FeatureAppearance.fromJSON(overrides);
  return true;
}

/** Set reality model appearance override for transparency in display style.
 * @beta
 */
export class SetRealityModelTransparencyTool extends Tool {
  public static override toolId = "SetRealityModelTransparencyTool";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  public override run(transparency: number, index: number): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp === undefined)
      return false;

    const changed = changeRealityModelAppearanceOverrides(vp, { transparency }, index);

    if (changed)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Reality Model at Index: ${index} set to transparency: ${transparency}`));

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(parseFloat(args[0]), args.length > 1 ? parseInt(args[1], 10) : -1);
  }
}
/** Set reality model appearance override for locatable in display style.
 * @beta
 */
export class SetRealityModelLocateTool extends Tool {
  public static override toolId = "SetRealityModelLocateTool";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  public override run(locate: boolean, index: number): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp === undefined)
      return false;

    const nonLocatable = locate ? undefined : true;
    const changed = changeRealityModelAppearanceOverrides(vp, { nonLocatable }, index);

    if (changed)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Reality Model at Index: ${index} set to locate: ${locate}`));

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const locate = parseBoolean(args[0]);
    return locate === undefined ? false : this.run(locate, args.length > 1 ? parseInt(args[1], 10) : -1);
  }
}

/** Set reality model appearance override for emphasized in display style.
 * @beta
 */
export class SetRealityModelEmphasizedTool extends Tool {
  public static override toolId = "SetRealityModelEmphasizedTool";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  public override run(emphasized: true | undefined, index: number): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp === undefined)
      return false;

    const changed = changeRealityModelAppearanceOverrides(vp, { emphasized }, index);

    if (changed)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Reality Model at Index: ${index} set to emphasized: ${emphasized}`));

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const emphasized = parseBoolean(args[0]);
    return emphasized === undefined ? false : this.run(emphasized ? true : undefined, args.length > 1 ? parseInt(args[1], 10) : -1);
  }
}

/** Detach reality model from display style.
 * @beta
 */
export class DetachRealityModelTool extends Tool {
  public static override toolId = "ViewportDetachRealityModel";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override run(index: number): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp === undefined)
      return false;

    const model = vp.displayStyle.settings.contextRealityModels.models[index];
    if (!model)
      return false;

    vp.displayStyle.settings.contextRealityModels.delete(model);
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(args.length > 1 ? parseInt(args[0], 10) : -1);
  }
}

/** Set reality model appearance override for color in display style.
 * @beta
 */
export class SetRealityModelColorTool extends Tool {
  public static override toolId = "SetRealityModelColorTool";
  public static override get minArgs() { return 3; }
  public static override get maxArgs() { return 4; }

  public override run(rgb: RgbColorProps, index: number): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp === undefined)
      return false;

    const changed = changeRealityModelAppearanceOverrides(vp, { rgb }, index);

    if (changed)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Reality Model at Index: ${index} set to color: ${rgb}`));

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run({ r: parseFloat(args[0]), g: parseFloat(args[1]), b: parseFloat(args[2]) }, args.length > 3 ? parseInt(args[3], 10) : -1);
  }
}

/** Clear reality model appearance override in display style.
 * @beta
 */
export class ClearRealityModelAppearanceOverrides extends Tool {
  public static override toolId = "ClearRealityModelAppearanceOverrides";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override run(index: number): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return false;

    const model = vp.displayStyle.settings.contextRealityModels.models[index];
    if (!model)
      return false;

    model.appearanceOverrides = undefined;
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(args[0] === undefined ? -1 : parseInt(args[0], 10));
  }
}

/** Attach a cesium asset from the Ion ID and key.
 * @beta
 */
export class AttachCesiumAssetTool extends Tool {
  public static override toolId = "AttachCesiumAssetTool";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  public override run(assetId: number, requestKey: string): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp === undefined)
      return false;

    const props = { tilesetUrl: getCesiumAssetUrl(assetId, requestKey) };
    vp.displayStyle.attachRealityModel(props);
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Cesium Asset #${assetId} attached`));
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const assetId = parseInt(args[0], 10);
    return Number.isNaN(assetId) ? false : this.run(assetId, args[1]);
  }
}

/** Turn on/off display of OpenStreetMap buildings
 * @beta
 */
export class ToggleOSMBuildingDisplay extends Tool {
  public static override toolId = "SetBuildingDisplay";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 2; }

  public override run(onOff?: boolean, transparency?: number): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp === undefined)
      return false;

    if (onOff === undefined)
      onOff = undefined === vp.displayStyle.getOSMBuildingRealityModel(); // Toggle current state.

    const appearanceOverrides = (transparency !== undefined && transparency > 0 && transparency < 1) ? FeatureAppearance.fromJSON({ transparency }) : undefined;

    vp.displayStyle.setOSMBuildingDisplay({ onOff, appearanceOverrides });
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const toggle = parseToggle(args[0]);
    const transparency = args.length > 0 ? parseFloat(args[1]) : undefined;
    return typeof toggle === "string" ? false : this.run(toggle, transparency);
  }
}
