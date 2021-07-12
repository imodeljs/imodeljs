/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { ViewStateProps } from "@bentley/imodeljs-common";
import {
  EntityState, IModelApp, IModelConnection, NotifyMessageDetails, OutputMessagePriority, Tool, ViewState,
} from "@bentley/imodeljs-frontend";
import { copyStringToClipboard } from "../ClipboardUtilities";
import { parseArgs } from "./parseArgs";

/** Serialize a ViewState to JSON. The returned JSON can later be passed to [deserializeViewState] to reinstantiate the ViewState.
 * @beta
 */
export function serializeViewState(view: ViewState): ViewStateProps {
  return view.toProps();
}

/** Instantiate a ViewState serialized by [serializeViewState].
 * @beta
 */
export async function deserializeViewState(props: ViewStateProps, iModel: IModelConnection): Promise<ViewState> {
  const ctor = await iModel.findClassFor<typeof EntityState>(props.viewDefinitionProps.classFullName, undefined) as typeof ViewState | undefined;
  if (undefined === ctor)
    throw new Error("Class not found");

  const view = ctor.createFromProps(props, iModel);
  if (undefined === view)
    throw new Error("Failed to construct ViewState");

  await view.load();
  return view;
}

/** Copies a JSON representation of the active viewport's view to the clipboard.
 *  * Arguments:
 *  * `quote`: format the JSON so it can be parsed directly by [ApplyViewTool].
 * @beta
 */
export class SaveViewTool extends Tool {
  private _quote = false;
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }
  public static override toolId = "SaveView";

  public parse(inputArgs: string[]) {
    const args = parseArgs(inputArgs);
    function getArg(name: string): true | undefined {
      return args.getBoolean(name) ? true : undefined;
    }

    this._quote = true === getArg("q");

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    if (this.parse(args))
      return this.run();
    else
      return false;
  }

  public override run(): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, "No viewport"));
      return true;
    }

    try {
      let json = JSON.stringify(serializeViewState(vp.view));
      if (this._quote)
        json = `"${json.replace(/"/g, '""')}"`;
      copyStringToClipboard(json);
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "JSON copied to clipboard"));
    } catch (err) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, err.toString()));
    }

    return true;
  }
}

/** Given a string containing a JSON representation of a ViewState, applies that ViewState to the active viewport.
 * The JSON string should be enclosed in double quotes and embedded double quote should be duplicated, example:
 * - "{""viewDefinitionProps"":{""classFullName"":""BisCore:SpatialViewDefinition"",""id"":""0x1a""}}"
 * @beta
 */
export class ApplyViewTool extends Tool {
  public static override toolId = "ApplyView";
  public static override get maxArgs() { return 1; }
  public static override get minArgs() { return 1; }

  public override run(view?: ViewState): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== view && undefined !== vp)
      vp.changeView(view);

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp || 0 === args.length)
      return true;

    try {
      const json = JSON.parse(args[0]);

      // ###TODO: async...
      deserializeViewState(json, vp.iModel).then((view) => this.run(view)); // eslint-disable-line @typescript-eslint/no-floating-promises
    } catch (err) {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, err.toString()));
    }

    return true;
  }
}

/** Given the Id of a persistent ViewDefinition, applies that view to the active viewport.
 * @beta
 */
export class ApplyViewByIdTool extends Tool {
  public static override toolId = "ApplyViewById";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 1; }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(args[0]);
  }

  public override run(viewId?: string): boolean {
    if (typeof viewId !== "string")
      return false;

    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return false;

    vp.iModel.views.load(viewId).then((view) => {
      vp.changeView(view);
    }).catch(() => { });

    return true;
  }
}
