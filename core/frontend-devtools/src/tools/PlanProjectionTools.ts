/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { PlanProjectionSettings, PlanProjectionSettingsProps, SubCategoryOverride } from "@bentley/imodeljs-common";
import { DisplayStyle3dState, IModelApp, ModelState, NotifyMessageDetails, OutputMessagePriority, Viewport } from "@bentley/imodeljs-frontend";
import { copyStringToClipboard } from "../ClipboardUtilities";
import { DisplayStyleTool } from "./DisplayStyleTools";
import { parseArgs } from "./parseArgs";

/** Dumps a JSON representation of the plan projection settings for the current viewport.
 * @beta
 */
export class DumpPlanProjectionSettingsTool extends DisplayStyleTool {
  public static override toolId = "DumpLayerSettings";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  private _copyToClipboard = false;

  protected override get require3d() { return true; }

  protected parse(args: string[]) {
    if (1 === args.length)
      this._copyToClipboard = "c" === args[0].toLowerCase();

    return true;
  }

  protected execute(vp: Viewport): boolean {
    const settings = (vp.displayStyle as DisplayStyle3dState).settings.planProjectionSettings;
    if (undefined === settings) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "No plan projection settings defined"));
      return false;
    }

    const props = [];
    for (const [modelId, value] of settings)
      props.push({ modelId, settings: value.toJSON() });

    const json = JSON.stringify(props);
    if (this._copyToClipboard)
      copyStringToClipboard(json);

    const messageDetails = new NotifyMessageDetails(OutputMessagePriority.Info, "Dumped plan projection settings", json);
    IModelApp.notifications.outputMessage(messageDetails);

    return false;
  }
}

/** Changes subcategory display priority.
 * @beta
 */
export abstract class OverrideSubCategoryPriorityTool extends DisplayStyleTool {
  public static override toolId = "OverrideSubCategoryPriority";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  private readonly _subcatIds = new Set<string>();
  private _priority?: number;

  protected execute(vp: Viewport): boolean {
    const style = vp.displayStyle;
    for (const id of this._subcatIds) {
      const ovr = style.getSubCategoryOverride(id);
      if (undefined === ovr) {
        if (undefined !== this._priority)
          style.overrideSubCategory(id, SubCategoryOverride.fromJSON({ priority: this._priority }));
      } else {
        const props = ovr.toJSON();
        props.priority = this._priority;
        style.overrideSubCategory(id, SubCategoryOverride.fromJSON(props));
      }
    }

    return true;
  }

  protected parse(args: string[]) {
    for (const id of args[0].split(","))
      this._subcatIds.add(id);

    const priority = parseInt(args[1], 10);
    if (!Number.isNaN(priority))
      this._priority = priority;

    return true;
  }
}

/** Changes plan projection settings for one or more models.
 * @beta
 */
export abstract class ChangePlanProjectionSettingsTool extends DisplayStyleTool {
  public static override toolId = "ChangeLayerSettings";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 5; }

  private readonly _modelIds = new Set<string>();
  private _settings?: PlanProjectionSettings;

  protected override get require3d() { return true; }

  protected execute(vp: Viewport): boolean {
    const settings = (vp.displayStyle as DisplayStyle3dState).settings;
    for (const modelId of this._modelIds)
      settings.setPlanProjectionSettings(modelId, this._settings);

    return true;
  }

  protected parse(inputArgs: string[]) {
    if (!this.parseModels(inputArgs[0]))
      return false;

    const args = parseArgs(inputArgs.slice(1));
    const props: PlanProjectionSettingsProps = {};

    props.transparency = args.getFloat("t");
    props.overlay = args.getBoolean("o");
    props.enforceDisplayPriority = args.getBoolean("p");
    props.elevation = args.getFloat("e");

    this._settings = PlanProjectionSettings.fromJSON(props);
    return true;
  }

  private parseModels(models: string) {
    const vp = IModelApp.viewManager.selectedView!; // already validated by super.parseAndRun
    models = models.toLowerCase();

    const isPlanProjection = (modelId: string) => {
      const model = vp.iModel.models.getLoaded(modelId);
      return undefined !== model && isPlanProjectionModel(model);
    };
    const isPlanProjectionModel = (model: ModelState) => {
      const model3d = model.asGeometricModel3d;
      return undefined !== model3d && model3d.isPlanProjection;
    };

    switch (models[0]) {
      case "a": // all models in selector
        vp.view.forEachModel((model) => {
          if (isPlanProjectionModel(model))
            this._modelIds.add(model.id);
        });
        break;
      case "0": // comma-separated list of Ids
        for (const modelId of models.split(","))
          if (isPlanProjection(modelId))
            this._modelIds.add(modelId);

        break;
    }

    if (this._modelIds.size === 0) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, "No plan projection models"));
      return false;
    }

    return true;
  }
}
