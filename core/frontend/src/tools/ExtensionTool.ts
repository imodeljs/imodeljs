/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import { Logger } from "@bentley/bentleyjs-core";
import { Extension } from "../extension/Extension";
import { IModelApp } from "../IModelApp";
import { NotifyMessageDetails, OutputMessageAlert, OutputMessagePriority, OutputMessageType } from "../NotificationManager";
import { Tool } from "./Tool";

const loggerCategory = "imodeljs-frontend.Extension";

/** An Immediate Tool that starts the process of loading an iModel.js extension. */
export class ExtensionTool extends Tool {
  private static _isListenerAdded = false;

  public static override toolId = "Extension";
  public static override get maxArgs() { return undefined; }
  public static override get minArgs() { return 1; }

  public override parseAndRun(...args: string[]): boolean {
    return this.run(args);
  }

  public override run(args: any[]): boolean {
    if (!ExtensionTool._isListenerAdded) {
      IModelApp.extensionAdmin.onExtensionLoaded.addListener(ExtensionTool.showLoadSuccess);
      ExtensionTool._isListenerAdded = true;
    }

    if (args && args.length > 0 && args[0]) {
      IModelApp.extensionAdmin.loadExtension(args[0], undefined, args.slice(1))
        .then(ExtensionTool.showLoadProblems.bind(null, args[0]), (err) => {
          const briefMessage = IModelApp.i18n.translate("iModelJs:ExtensionErrors.UnableToLoad", { extensionName: args[0] });
          const errorDetails = new NotifyMessageDetails(OutputMessagePriority.Error, briefMessage, (typeof err.message === "string") ? err.message : undefined, OutputMessageType.Alert, OutputMessageAlert.Balloon);
          IModelApp.notifications.outputMessage(errorDetails);
        });
    }
    return true;
  }

  private static showLoadSuccess(extensionName: string) {
    const briefMessage = IModelApp.i18n.translate("iModelJs:ExtensionErrors.Success", { extensionName });
    const info = new NotifyMessageDetails(OutputMessagePriority.Info, briefMessage, undefined, OutputMessageType.Toast);
    IModelApp.notifications.outputMessage(info);
    Logger.logInfo(loggerCategory, briefMessage);
  }

  // displays the problems encountered while trying to load a extension
  private static showLoadProblems(extensionName: string, extensionResults: Extension | undefined) {
    if (extensionResults === undefined) {
      const briefMessage = IModelApp.i18n.translate("iModelJs:ExtensionErrors.CantFind", { extensionName });
      const errorDetails = new NotifyMessageDetails(OutputMessagePriority.Warning, briefMessage, undefined, OutputMessageType.Alert, OutputMessageAlert.Balloon);
      IModelApp.notifications.outputMessage(errorDetails);
      Logger.logError(loggerCategory, `Extension ${extensionName} was not found`);
    }
  }
}
