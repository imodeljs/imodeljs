/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { IModelApp, NotifyMessageDetails, OutputMessagePriority, Tool } from "@bentley/imodeljs-frontend";
import { copyStringToClipboard } from "../ClipboardUtilities";
import { parseArgs } from "./parseArgs";

/** Base class for a tool that can convert between source aspect Ids and element Ids.
 * A "source aspect Id" is a string that identifies an object (such as an element) in the source document from which the iModel originated.
 * For example, if the iModel was produced by the MicroStation bridge, the source aspect Id is usually a V8 element Id.
 * @beta
 */
export abstract class SourceAspectIdTool extends Tool {
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  protected abstract getECSql(queryId: string): string;

  public override run(idToQuery?: string, copyToClipboard?: boolean): boolean {
    if (typeof idToQuery === "string")
      this.doQuery(idToQuery, true === copyToClipboard); // eslint-disable-line @typescript-eslint/no-floating-promises

    return true;
  }

  public override parseAndRun(...keyinArgs: string[]): boolean {
    const args = parseArgs(keyinArgs);
    return this.run(args.get("i"), args.getBoolean("c"));
  }

  private async doQuery(queryId: string, copyToClipboard: boolean): Promise<void> {
    const imodel = IModelApp.viewManager.selectedView?.iModel;
    if (undefined === imodel)
      return;

    let resultId;
    try {
      for await (const row of imodel.query(this.getECSql(queryId), undefined, 1))
        resultId = row.resultId;
    } catch (ex) {
      resultId = ex.toString();
    }

    if (typeof resultId !== "string")
      resultId = "NOT FOUND";

    if (copyToClipboard)
      copyStringToClipboard(resultId);

    const message = `${queryId} => ${resultId}`;
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, message));
  }
}

/** Given a source aspect Id, output the Id of the corresponding element in the iModel.
 * A "source aspect Id" is a string that identifies an object (such as an element) in the source document from which the iModel originated.
 * For example, if the iModel was produced by the MicroStation bridge, the source aspect Id is usually a V8 element Id.
 * Arguments:
 *  - `id=elementId` where `elementId` is the numeric Id of the element of interest (e.g., `0x13a6c`; decimal notation is also permitted).
 *  - `copy=0|1` where `1` indicates the source aspect Id should be copied to the clipboard.
 * The command outputs to the IModelApp.notifications the corresponding source aspect Id, or "NOT FOUND".
 * @beta
 */
export class SourceAspectIdFromElementIdTool extends SourceAspectIdTool {
  public static override toolId = "SourceAspectIdFromElementId";

  protected getECSql(queryId: string): string {
    return `SELECT Identifier as resultId FROM BisCore.ExternalSourceAspect WHERE Element.Id=${queryId} AND [Kind]='Element'`;
  }
}

/** Given the Id of an element in the iModel, output the source aspect Id of the object in the source document from which the element originated.
 * A "source aspect Id" is a string that identifies an object (such as an element) in the source document from which the iModel originated.
 * For example, if the iModel was produced by the MicroStation bridge, the source aspect Id is usually a V8 element Id.
 * Arguments:
 *  - `id=sourceAspectId` where `sourceAspectId` is the string identifier of the object of interest.
 *  - `copy=0|1` where `1` indicates the element Id should be copied to the clipboard.
 * The command outputs to the IModelApp.notifications the corresponding element Id, or "NOT FOUND".
 * @beta
 */
export class ElementIdFromSourceAspectIdTool extends SourceAspectIdTool {
  public static override toolId = "ElementIdFromSourceAspectId";

  protected getECSql(queryId: string): string {
    return `SELECT Element.Id as resultId FROM BisCore.ExternalSourceAspect WHERE Identifier='${queryId}' AND [Kind]='Element'`;
  }
}
