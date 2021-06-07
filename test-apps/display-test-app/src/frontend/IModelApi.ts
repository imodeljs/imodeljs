/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { OpenMode } from "@bentley/bentleyjs-core";
import { HubIModel, IModelQuery, Version, VersionQuery } from "@bentley/imodelhub-client";
import { IModelVersion } from "@bentley/imodeljs-common";
import { AuthorizedFrontendRequestContext, IModelHubFrontend, RemoteBriefcaseConnection } from "@bentley/imodeljs-frontend";

export class IModelApi {

  /** Get all iModels in a project */
  public static async getIModelByName(requestContext: AuthorizedFrontendRequestContext, projectId: string, iModelName: string): Promise<HubIModel | undefined> {
    const queryOptions = new IModelQuery();
    queryOptions.select("*").top(100).skip(0);
    const iModels: HubIModel[] = await IModelHubFrontend.iModelClient.iModels.get(requestContext, projectId, queryOptions);
    if (iModels.length < 1)
      return undefined;
    for (const thisIModel of iModels) {
      if (!!thisIModel.id && thisIModel.name === iModelName) {
        const versions: Version[] = await IModelHubFrontend.iModelClient.versions.get(requestContext, thisIModel.id, new VersionQuery().select("Name,ChangeSetId").top(1));
        if (versions.length > 0) {
          thisIModel.latestVersionName = versions[0].name;
          thisIModel.latestVersionChangeSetId = versions[0].changeSetId;
        }
        return thisIModel;
      }
    }
    return undefined;
  }

  /* eslint-disable deprecation/deprecation */
  /** Open the specified version of the IModel */
  public static async openIModel(projectId: string, iModelId: string, changeSetId: string | undefined, openMode: OpenMode): Promise<RemoteBriefcaseConnection> {
    return RemoteBriefcaseConnection.open(projectId, iModelId, openMode, changeSetId ? IModelVersion.asOfChangeSet(changeSetId) : IModelVersion.latest());
  }
}
