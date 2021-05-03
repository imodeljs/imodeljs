/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import * as fs from "fs";
import { Guid, GuidString } from "@bentley/bentleyjs-core";
import { ContextPermissions, IModelClient, IModelPermissions } from "@bentley/imodelhub-client";
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { TestUsers } from "@bentley/oidc-signin-tool";
import { TestConfig } from "../TestConfig";
import * as utils from "./TestUtils";
import { RequestType, ResponseBuilder } from "../ResponseBuilder";
import { workDir } from "./TestConstants";

function mockGetContextPermissions(contextId: string, webView: boolean, read: boolean, write: boolean, manage: boolean, deleteiModel: boolean) {
  if (!TestConfig.enableMocks) {
    return;
  }

  contextId = contextId || Guid.createValue();
  const requestPath: string = `/sv1.1/Repositories/Context--${contextId}/ContextScope/Permission`;
  const requestResponse = ResponseBuilder.generateGetResponse<ContextPermissions>(ResponseBuilder.generateObject<ContextPermissions>(ContextPermissions,
    new Map<string, any>([
      ["webView", webView],
      ["read", read],
      ["write", write],
      ["manage", manage],
      ["delete", deleteiModel],
    ])));
  ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, requestResponse);
}

function mockGetiModelPermissions(imodelId: string, webView: boolean, read: boolean, write: boolean, manage: boolean) {
  if (!TestConfig.enableMocks) {
    return;
  }

  const requestPath: string = `/sv1.1/Repositories/iModel--${imodelId}/iModelScope/Permission`;
  const requestResponse = ResponseBuilder.generateGetResponse<IModelPermissions>(ResponseBuilder.generateObject<IModelPermissions>(IModelPermissions,
    new Map<string, any>([
      ["webView", webView],
      ["read", read],
      ["write", write],
      ["manage", manage],
    ])));
  ResponseBuilder.mockResponse(utils.IModelHubUrlMock.getUrl(), RequestType.Get, requestPath, requestResponse);
}

describe("iModelHub PermissionsManager", () => {
  let projectId: string;
  let imodelId: GuidString;
  let imodelClient: IModelClient;
  let requestContext: AuthorizedClientRequestContext;

  before(async function () {
    this.enableTimeouts(false);
    const accessToken: AccessToken = TestConfig.enableMocks ? new utils.MockAccessToken() : await utils.login(TestUsers.super);
    requestContext = new AuthorizedClientRequestContext(accessToken);

    (requestContext as any).activityId = "iModelHub PermissionHandler";
    projectId = await utils.getProjectId(requestContext, "iModelJsTest");

    await utils.createIModel(requestContext, utils.sharedimodelName, projectId);
    imodelId = await utils.getIModelId(requestContext, utils.sharedimodelName, projectId);
    imodelClient = utils.getIModelHubClient();

    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir);
    }
  });

  afterEach(async () => {
    ResponseBuilder.clearMocks();
  });

  after(async () => {
    if (TestConfig.enableIModelBank) {
      await utils.deleteIModelByName(requestContext, projectId, utils.sharedimodelName);
    }
  });

  it("should get Context permissions (#unit)", async () => {
    mockGetContextPermissions(projectId, true, true, true, true, false);

    const contextPermissions: ContextPermissions = await imodelClient.permissions!.getContextPermissions(requestContext, projectId);
    chai.assert.isTrue(contextPermissions.webView && contextPermissions.read && contextPermissions.write && contextPermissions.manage);
    chai.assert.isFalse(contextPermissions.delete);
  });

  it("should get iModel permissions (#unit)", async () => {
    mockGetiModelPermissions(imodelId, true, true, false, false);

    const imodelPermissions: IModelPermissions = await imodelClient.permissions!.getiModelPermissions(requestContext, imodelId);
    chai.assert.isTrue(imodelPermissions.webView && imodelPermissions.read);
    chai.assert.isFalse(imodelPermissions.write || imodelPermissions.manage);
  });
});
