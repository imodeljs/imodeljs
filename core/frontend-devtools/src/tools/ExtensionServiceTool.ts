/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import { Logger } from "@bentley/bentleyjs-core";
import { ContextRegistryClient } from "@bentley/context-registry-client";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { ExtensionServiceExtensionLoader, IModelApp, NotifyMessageDetails, OutputMessageAlert, OutputMessagePriority, OutputMessageType, Tool } from "@bentley/imodeljs-frontend";

const loggerCategory = "frontend-devtools.extensionServiceTool";

/**
 * An Immediate Tool that adds an iModel.js Extension Service context Id to an application.
 * @beta
 */
export class ExtensionServiceTool extends Tool {
  public static override toolId = "ExtensionService";
  public static override get maxArgs() { return undefined; }
  public static override get minArgs() { return 1; }

  /** Executes this tool's run method.
   * @param args contains the arguments used by the tool's run method
   * @see [[run]]
   * `args` can contain:
   *   public: adds context Id of 00000000-0000-0000-0000-000000000000
   *   project | asset <contextName>: runs the extension service tool for either a project or asset with specified context name
   *   id <contextName>: adds context Id of <contextName>
   */
  public override parseAndRun(...args: string[]): boolean {
    return this.run(args);
  }

  /** This method runs the tool, adding an iModel.js Extension Service context Id to an application.
   * @param args an array describing what context Id to add
   * `args` can contain:
   *   public: adds context Id of 00000000-0000-0000-0000-000000000000
   *   project | asset <contextName>: runs the extension service tool for either a project or asset with specified context name
   *   id <contextName>: adds context Id of <contextName>
   */
  public override run(args: any[]): boolean {
    if (!args || args.length < 1 || typeof args[0] !== "string") {
      return false;
    }

    if (args[0] === "public") {
      IModelApp.extensionAdmin.addExtensionLoaderFront(new ExtensionServiceExtensionLoader("00000000-0000-0000-0000-000000000000"));
      ExtensionServiceTool.showSuccess("public");
      return true;
    }

    if (args.length < 2 || typeof args[1] !== "string")
      return false;

    const contextName: string = args.slice(1).join(" ");

    if (args[0] === "project" || args[0] === "asset") {
      ExtensionServiceTool.runWithName(contextName, args[0]).catch(() => { });
      return true;
    }

    if (args[0] === "id") {
      IModelApp.extensionAdmin.addExtensionLoaderFront(new ExtensionServiceExtensionLoader(contextName));
      ExtensionServiceTool.showSuccess(contextName);
      return true;
    }

    return false;
  }

  private static async runWithName(contextName: string, contextType: "project" | "asset") {
    try {
      const cid = await ExtensionServiceTool.getContextId(contextType, contextName);

      if (cid === undefined) {
        ExtensionServiceTool.showError(contextName);
        return;
      }
      IModelApp.extensionAdmin.addExtensionLoaderFront(new ExtensionServiceExtensionLoader(cid));
      ExtensionServiceTool.showSuccess(contextName);
    } catch (err) {
      const briefMessage = `Unable to add Extension Service Connected Context '${contextName}'`;
      const errorDetails = new NotifyMessageDetails(OutputMessagePriority.Error, briefMessage, (typeof err.message === "string") ? err.message : undefined, OutputMessageType.Alert, OutputMessageAlert.Balloon);
      IModelApp.notifications.outputMessage(errorDetails);
    }
  }

  private static async getContextId(contextType: "project" | "asset", contextName: string): Promise<string | undefined> {
    const token = await IModelApp.authorizationClient?.getAccessToken();
    if (token === undefined)
      throw new Error("Authentication required");

    const requestContext = new AuthorizedClientRequestContext(token);
    const contextRegistry = new ContextRegistryClient();
    if (contextType === "project") {
      const project = await contextRegistry.getProject(requestContext, {
        $select: "*",
        $filter: `Name+eq+'${contextName}'`,
      });
      if (!project || !project.wsgId) {
        return undefined;
      }
      return project.wsgId;
    } else {
      const asset = await contextRegistry.getAsset(requestContext, {
        $select: "*",
        $filter: `Name+eq+'${contextName}'`,
      });
      if (!asset || !asset.wsgId) {
        return undefined;
      }
      return asset.wsgId;
    }
  }

  private static showSuccess(contextName: string) {
    const briefMessage = `Extension Service Connected Context '${contextName}' added`;
    const info = new NotifyMessageDetails(OutputMessagePriority.Info, briefMessage, undefined, OutputMessageType.InputField);
    IModelApp.notifications.outputMessage(info);
    Logger.logInfo(loggerCategory, briefMessage);
  }

  private static showError(contextName: string) {
    const briefMessage = `Cannot find Connected Context '${contextName}'`;
    const errorDetails = new NotifyMessageDetails(OutputMessagePriority.Warning, briefMessage, undefined, OutputMessageType.Alert, OutputMessageAlert.Balloon);
    IModelApp.notifications.outputMessage(errorDetails);
    Logger.logError(loggerCategory, `Extension Service: Connected Context '${contextName}' was not found`);
  }
}
