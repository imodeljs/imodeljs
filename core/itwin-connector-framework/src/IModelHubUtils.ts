/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { ContextRegistryClient, Project } from "@bentley/context-registry-client";
import { Guid } from "@bentley/bentleyjs-core";
import { HubIModel, IModelClient, IModelHubClient, IModelQuery } from "@bentley/imodelhub-client";
import { AzureFileHandler } from "@bentley/backend-itwin-client";

/** Arguments that describe the iModelHub server environment used for the job
 * @alpha
 */
export class ServerArgs {
  /** Name of the iModel. Either the name or the GUID of the iModel must be defined. */
  public iModelName?: string;
  /** GUID of the iModel. Either the name or the GUID of the iModel must be defined. */
  public iModelId?: string;
  /** GUID of the Context (project) where this iModel resides. Either contextId or contextName must be defined. */
  public contextId?: string;
  /** Name of the Context (project) where this iModel resides. Either contextId or contextName must be defined. */
  public contextName?: string;
  public getToken?: () => Promise<AccessToken>;
  /** Create an iModel on the hub if one does not exist.
   * @internal
   */
  public createiModel: boolean = false;
  /** Specifies which environment: dev, QA, release */
  public environment?: string;
}

/** Helps with queries on Bentley Connect */
export class ConnectUtils {
  public static async getContextId(contextName: string, requestContext: AuthorizedClientRequestContext): Promise<string> {
    const project: Project = await (new ContextRegistryClient()).getProject(requestContext, { $select: "$id", $filter: `Name+like+'${contextName}'` }); // Throws if project not found
    return project.wsgId;
  }
}

/** Helps set up to work with Bentley iModelHub
 * @alpha
 */
export class IModelHubUtils {

  /** Create the right kind of IModelClient for working with iModelHub */
  public static makeIModelClient(): IModelClient {
    return new IModelHubClient(new AzureFileHandler());
  }

  /**
   * Gets the Guid of an iModel from iModelHub
   * @param contextId Guid of iModel context
   * @param imodelName Name of iModel
   * @returns Guid of specified iModel
   * @throws If an iModel with specified contextId and name could not be found
   */
  public static async getIModelIdFromName(serverArgs: ServerArgs, requestContext: AuthorizedClientRequestContext, imodelClient: IModelClient): Promise<string> {
    if (serverArgs.iModelId !== undefined)
      return serverArgs.iModelId;

    if (serverArgs.contextId === undefined)
      throw new Error("Must initialize ContextId before using");
    if (serverArgs.iModelName === undefined)
      throw new Error("Must initialize BriefcaseName before using");

    // get iModel from iModelHub
    const imodel: HubIModel = (await imodelClient.iModels.get(requestContext, serverArgs.contextId, new IModelQuery().byName(serverArgs.iModelName)))[0];
    if (!imodel) {
      throw new Error(`iModel with name ${serverArgs.iModelName} was not found in the given project/context.`);
    }
    return imodel.wsgId;
  }

  public static async initialize(serverArgs: ServerArgs, requestContext: AuthorizedClientRequestContext, iModelClient: IModelClient) {
    if (serverArgs === undefined || serverArgs.contextId === undefined && serverArgs.contextName === undefined) {
      throw new Error("Need to supply either a context name or a context id");
    }

    if (serverArgs.contextName !== undefined) {
      serverArgs.contextId = await ConnectUtils.getContextId(serverArgs.contextName, requestContext);
    }

    if (serverArgs.contextId === undefined) {
      throw new Error(`Could not find project ${serverArgs.contextName}.`);
    }
    if (Guid.isGuid(serverArgs.iModelName!))
      serverArgs.iModelId = serverArgs.iModelName;
    else
      serverArgs.iModelId = await this.getIModelIdFromName(serverArgs, requestContext, iModelClient);

    if (serverArgs.iModelId === undefined)
      throw new Error("Failed to get IModelId from briefcaseName");
  }

}
