/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { GuidString, Logger } from "@bentley/bentleyjs-core";
import { Project } from "@bentley/context-registry-client";
import { FrontendAuthorizationClient } from "@bentley/frontend-authorization-client";
import { BriefcaseQuery, Briefcase as HubBriefcase, IModelCloudEnvironment, IModelQuery } from "@bentley/imodelhub-client";
import { AuthorizedFrontendRequestContext, IModelHubFrontend, NativeApp, NativeAppAuthorization } from "@bentley/imodeljs-frontend";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { getAccessTokenFromBackend, TestUserCredentials } from "@bentley/oidc-signin-tool/lib/frontend";
import { TestRpcInterface } from "../../common/RpcInterfaces";
import { IModelBankCloudEnv } from "./IModelBankCloudEnv";
import { IModelHubCloudEnv } from "./IModelHubCloudEnv";

export class TestUtility {
  public static testContextName = "iModelJsIntegrationTest";
  public static testIModelNames = {
    noVersions: "NoVersionsTest",
    stadium: "Stadium Dataset 1",
    readOnly: "ReadOnlyTest",
    readWrite: "ReadWriteTest",
    connectionRead: "ConnectionReadTest",
    smallTex: "SmallTex",
    sectionDrawingLocations: "SectionDrawingLocations",
    // Includes a display style with a schedule script embedded in JSON.
    synchro: "SYNCHRO.UTK",
    // A version of the above that uses BisCore 1.0.13 and includes a second display style with schedule script stored
    // separately on a RenderTimeline element.
    synchroNew: "SYNCHRO.UTK.1.0.13",
  };

  public static testSnapshotIModels = {
    mirukuru: "mirukuru.ibim",
  };

  private static contextId: GuidString | undefined = undefined;
  /** Returns the ContextId if a Context with the name exists. Otherwise, returns undefined. */
  public static async getTestContextId(requestContext: AuthorizedClientRequestContext): Promise<GuidString> {
    requestContext.enter();
    if (undefined !== TestUtility.contextId)
      return TestUtility.contextId;
    return TestUtility.queryContextIdByName(TestUtility.testContextName);
  }

  public static imodelCloudEnv: IModelCloudEnvironment;

  public static async getAuthorizedClientRequestContext(user: TestUserCredentials): Promise<AuthorizedClientRequestContext> {
    const accessToken = await getAccessTokenFromBackend(user);
    return new AuthorizedClientRequestContext(accessToken);
  }

  public static async initializeTestProject(testContextName: string, user: TestUserCredentials): Promise<FrontendAuthorizationClient> {
    const cloudParams = await TestRpcInterface.getClient().getCloudEnv();
    if (cloudParams.iModelBank) {
      this.imodelCloudEnv = new IModelBankCloudEnv(cloudParams.iModelBank.url, false);
    } else {
      this.imodelCloudEnv = new IModelHubCloudEnv();
    }

    let authorizationClient: FrontendAuthorizationClient;
    if (NativeApp.isValid) {
      authorizationClient = new NativeAppAuthorization({ clientId: "testapp", redirectUri: "", scope: "" });
      await NativeApp.callNativeHost("setAccessTokenProps", (await getAccessTokenFromBackend(user)).toJSON());
    } else {
      authorizationClient = this.imodelCloudEnv.getAuthorizationClient(undefined, user);
      await authorizationClient.signIn();
    }
    const accessToken = await authorizationClient.getAccessToken();
    if (this.imodelCloudEnv instanceof IModelBankCloudEnv) {
      await this.imodelCloudEnv.bootstrapIModelBankProject(new AuthorizedClientRequestContext(accessToken), testContextName);
    }

    return authorizationClient;
  }

  public static async queryContextIdByName(contextName: string): Promise<string> {
    const requestContext = await AuthorizedFrontendRequestContext.create();
    const project: Project = await this.imodelCloudEnv.contextMgr.queryProjectByName(requestContext, contextName);
    assert(project && project.wsgId);
    return project.wsgId;
  }

  public static async queryIModelIdbyName(contextId: string, iModelName: string): Promise<string> {
    const requestContext = await AuthorizedFrontendRequestContext.create();
    const iModels = await this.imodelCloudEnv.imodelClient.iModels.get(requestContext, contextId, new IModelQuery().byName(iModelName));
    assert(iModels.length > 0);
    assert(iModels[0].wsgId);

    return iModels[0].wsgId;
  }

  /** Purges all acquired briefcases for the specified iModel (and user), if the specified threshold of acquired briefcases is exceeded */
  public static async purgeAcquiredBriefcases(iModelId: string, acquireThreshold: number = 16): Promise<void> {
    const requestContext = await AuthorizedFrontendRequestContext.create();
    const briefcases: HubBriefcase[] = await IModelHubFrontend.iModelClient.briefcases.get(requestContext, iModelId, new BriefcaseQuery().ownedByMe());
    if (briefcases.length > acquireThreshold) {
      Logger.logInfo("TestUtility", `Reached limit of maximum number of briefcases for ${iModelId}. Purging all briefcases.`);

      const promises = new Array<Promise<void>>();
      briefcases.forEach((briefcase: HubBriefcase) => {
        promises.push(IModelHubFrontend.iModelClient.briefcases.delete(requestContext, iModelId, briefcase.briefcaseId!));
      });
      await Promise.all(promises);
    }
  }
}
