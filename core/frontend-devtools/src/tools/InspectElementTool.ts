/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { Id64, Id64Array, Id64String } from "@bentley/bentleyjs-core";
import { GeometrySummaryOptions, GeometrySummaryVerbosity, IModelReadRpcInterface } from "@bentley/imodeljs-common";
import {
  BeButtonEvent, CoreTools, EventHandled, HitDetail, IModelApp, LocateFilterStatus, LocateResponse, MessageBoxIconType, MessageBoxType,
  NotifyMessageDetails, OutputMessagePriority, PrimitiveTool,
} from "@bentley/imodeljs-frontend";
import { copyStringToClipboard } from "../ClipboardUtilities";
import { parseArgs } from "./parseArgs";

/** Creates a readable text summary of a geometric element or geometry part. The keyin takes the following arguments, all of which are optional:
 *  - `id=elementId,elementId,elementId` comma-separated list of element Ids where each `elementId` is a hexadecimal element Id such as "0x12cb";
 *  - `symbology=0|1` where 1 indicates detailed symbology information should be included in the output;
 *  - `placement=0|1` where 1 indicates detailed geometric element placement should be included; and
 *  - `verbosity=0|1|2` controlling the verbosity of the output for each geometric primitive in the geometry stream. Higher values = more detailed information. Note verbosity=2 can produce megabytes of data for certain types of geometric primitives like large meshes.
 *  - `modal=0|1` where 1 indicates the output should appear in a modal dialog.
 *  - `copy=0|1` where 1 indicates the output should be copied to the clipboard. Defaults to true.
 *  - `refs=0|1` where 1 indicates that for geometry parts a list of all elements referencing that part should be included in the output. This is extremely computationally expensive.
 * If no id is specified, the tool runs in interactive mode: first operating upon the selection set (if any), then allowing the user to select additional elements.
 * @beta
 */
export class InspectElementTool extends PrimitiveTool {
  public static override toolId = "InspectElement";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 6; }

  private _options: GeometrySummaryOptions = {};
  private _elementIds?: Id64String[];
  private _modal = false;
  private _useSelection = false;
  private _doCopy = false;

  constructor(options?: GeometrySummaryOptions, elementIds?: Id64String[]) {
    super();
    if (undefined !== options)
      this._options = { ...options };

    this._elementIds = elementIds;
  }

  private setupAndPromptForNextAction(): void {
    this._useSelection = (undefined !== this.targetView && this.targetView.iModel.selectionSet.isActive);
    if (!this._useSelection)
      IModelApp.accuSnap.enableLocate(true);

    this.showPrompt();
  }

  private showPrompt(): void {
    CoreTools.outputPromptByKey(this._useSelection ? "ElementSet.Prompts.ConfirmSelection" : "ElementSet.Prompts.IdentifyElement");
  }

  public override autoLockTarget(): void { }

  public override requireWriteableTarget(): boolean { return false; }

  public override onUnsuspend(): void {
    this.showPrompt();
  }

  public override onPostInstall(): void {
    super.onPostInstall();

    if (undefined !== this._elementIds)
      this.process(this._elementIds).then(() => {
        this.onReinitialize();
      }).catch((err) => {
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, err.toString()));
      });
    else {
      this.setupAndPromptForNextAction();
    }
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (this._useSelection) {
      if (undefined !== ev.viewport) {
        const ids: Id64Array = [];
        ev.viewport.iModel.selectionSet.elements.forEach((id) => {
          if (!Id64.isInvalid(id) && !Id64.isTransient(id))
            ids.push(id);
        });

        if (0 === ids.length)
          IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, CoreTools.translate("ElementSet.Error.NotSupportedElmType")));
        else
          await this.process(ids);

        this.onReinitialize();
        return EventHandled.Yes;
      }
    }

    const hit = await IModelApp.locateManager.doLocate(new LocateResponse(), true, ev.point, ev.viewport, ev.inputSource);
    if (undefined === hit || !hit.isElementHit)
      return EventHandled.No;

    await this.process([hit.sourceId]);
    this.setupAndPromptForNextAction();
    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    this.onReinitialize();
    return EventHandled.No;
  }

  public override onReinitialize(): void {
    if (this._useSelection || undefined !== this._elementIds) {
      this.exitTool();
    } else {
      this.onRestartTool();
    }
  }

  public onRestartTool(): void {
    const tool = new InspectElementTool();
    if (!tool.run())
      this.exitTool();
  }

  public override async filterHit(hit: HitDetail, _out: LocateResponse): Promise<LocateFilterStatus> {
    return hit.isElementHit ? LocateFilterStatus.Accept : LocateFilterStatus.Reject;
  }

  private async process(elementIds: Id64String[]) {
    const request = {
      elementIds,
      options: this._options,
    };
    let messageDetails: NotifyMessageDetails;
    try {
      const str = await IModelReadRpcInterface.getClientForRouting(this.iModel.routingContext.token).getGeometrySummary(this.iModel.getRpcProps(), request);
      if (this._doCopy)
        copyStringToClipboard(str);

      const brief = `Summary ${this._doCopy ? "copied to clipboard." : "complete."}`;
      messageDetails = new NotifyMessageDetails(OutputMessagePriority.Info, brief, str);

      if (this._modal) {
        const div = document.createElement("div");
        const appendText = (toAppend: string) => {
          const txt = document.createElement("div");
          txt.innerText = toAppend;
          div.append(txt);
        };

        const lines = str.split("\n");
        const maxLines = 30;
        let curLine = 0;
        for (const line of lines) {
          appendText(line);
          if (++curLine > maxLines) {
            appendText("...");
            break;
          }
        }

        await IModelApp.notifications.openMessageBox(MessageBoxType.Ok, div, MessageBoxIconType.Information);
      }
    } catch (err) {
      messageDetails = new NotifyMessageDetails(OutputMessagePriority.Error, "Error occurred while generating summary", err.toString());
    }

    IModelApp.notifications.outputMessage(messageDetails);
  }

  public override parseAndRun(...inputArgs: string[]): boolean {
    const args = parseArgs(inputArgs);
    const ids = args.get("i");
    if (undefined !== ids)
      this._elementIds = ids.split(",");

    const verbosity = args.getInteger("v");
    if (undefined !== verbosity) {
      switch (verbosity) {
        case 0:
          this._options.geometryVerbosity = GeometrySummaryVerbosity.Basic;
          break;
        case 1:
          this._options.geometryVerbosity = GeometrySummaryVerbosity.Detailed;
          break;
        case 2:
          this._options.geometryVerbosity = GeometrySummaryVerbosity.Full;
          break;
      }
    }

    const symbology = args.getBoolean("s");
    if (undefined !== symbology)
      this._options.verboseSymbology = symbology;

    const placement = args.getBoolean("p");
    if (undefined !== placement)
      this._options.includePlacement = placement;

    const parts = args.getBoolean("r");
    if (true === parts && undefined !== IModelApp.viewManager.selectedView)
      this._options.includePartReferences = IModelApp.viewManager.selectedView.view.is3d() ? "3d" : "2d";

    const modal = args.getBoolean("m");
    if (undefined !== modal)
      this._modal = modal;

    const doCopy = args.getBoolean("c");
    if (undefined !== doCopy)
      this._doCopy = doCopy;

    return this.run();
  }
}
