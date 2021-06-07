/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BentleyStatus, ClientRequestContext, Guid, Logger } from "@bentley/bentleyjs-core";
import { BriefcaseDb, BriefcaseManager, IModelHost, IModelJsFs } from "@bentley/imodeljs-backend";
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { TestUsers, TestUtility } from "@bentley/oidc-signin-tool";
import { expect } from "chai";
import * as path from "path";
import { BridgeJobDefArgs, BridgeRunner } from "../../BridgeRunner";
import { ServerArgs } from "../../IModelHubUtils";
import { BridgeTestUtils, TestIModelInfo } from "../BridgeTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { HubUtility } from "./HubUtility";

describe("IModelBridgeFwk (#integration)", () => {
  let testProjectId: string;

  let readWriteTestIModel: TestIModelInfo;

  let requestContext: AuthorizedClientRequestContext;
  let managerRequestContext: AuthorizedClientRequestContext;

  before(async () => {
    BridgeTestUtils.setupLogging();
    BridgeTestUtils.setupDebugLogLevels();
    await BridgeTestUtils.startBackend();
    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir))
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);

    try {
      requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
    } catch (error) {
      // eslint-disable-next-line no-console
      Logger.logError("Error", `Failed with error: ${error}`);
    }

    testProjectId = await HubUtility.queryProjectIdByName(requestContext, "iModelJsIntegrationTest");
    const imodelName = `TestBridge_ReadWrite_${Guid.createValue()}`;
    const targetIModelId = await HubUtility.recreateIModel(requestContext, testProjectId, imodelName);
    expect(undefined !== targetIModelId);
    readWriteTestIModel = await BridgeTestUtils.getTestModelInfo(requestContext, testProjectId, imodelName);

    // Purge briefcases that are close to reaching the acquire limit
    managerRequestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.manager);
    await HubUtility.purgeAcquiredBriefcases(managerRequestContext, "iModelJsIntegrationTest", imodelName);
  });

  after(async () => {
    // Clean up the iModel
    try {
      await IModelHost.hubAccess.deleteIModel({ requestContext, contextId: testProjectId, iModelId: readWriteTestIModel.id });
    } catch (err) {
    }

    await BridgeTestUtils.shutdownBackend();
  });

  async function runBridge(bridgeJobDef: BridgeJobDefArgs, serverArgs: ServerArgs, isUpdate: boolean = false) {
    const runner = new BridgeRunner(bridgeJobDef, serverArgs);
    const status = await runner.synchronize();
    expect(status === BentleyStatus.SUCCESS);
    const briefcases = BriefcaseManager.getCachedBriefcases(serverArgs.iModelId);
    const briefcaseEntry = briefcases[0];
    expect(briefcaseEntry !== undefined);

    const imodel = await BriefcaseDb.open(new ClientRequestContext(), { fileName: briefcases[0].fileName, readonly: true });
    BridgeTestUtils.verifyIModel(imodel, bridgeJobDef, isUpdate);
    imodel.close();
  }

  it("should download and perform updates", async () => {
    const bridgeJobDef = new BridgeJobDefArgs();
    const sourcePath = path.join(KnownTestLocations.assetsDir, "TestBridge.json");
    const targetPath = path.join(KnownTestLocations.assetsDir, "TestBridge_.json");
    IModelJsFs.copySync(sourcePath, targetPath, { overwrite: true });
    bridgeJobDef.sourcePath = targetPath;
    bridgeJobDef.bridgeModule = "./test/integration/TestiModelBridge.js";

    const serverArgs = new ServerArgs();  // TODO have an iModelBank version of this test
    serverArgs.contextId = testProjectId;
    serverArgs.iModelId = readWriteTestIModel.id;
    serverArgs.getToken = async (): Promise<AccessToken> => {
      return requestContext.accessToken;
    };

    await runBridge(bridgeJobDef, serverArgs);

    // verify that an unchanged source results in an unchanged imodel
    await runBridge(bridgeJobDef, serverArgs, false);

    // verify that a changed source changes the imodel
    IModelJsFs.copySync(path.join(KnownTestLocations.assetsDir, "TestBridge_v2.json"), targetPath, { overwrite: true });
    await runBridge(bridgeJobDef, serverArgs, true);

    IModelJsFs.purgeDirSync(KnownTestLocations.outputDir);
  });
});
