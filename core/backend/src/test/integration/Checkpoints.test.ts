/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import { ChildProcess } from "child_process";
import * as fs from "fs-extra";
import * as path from "path";
import { GuidString } from "@bentley/bentleyjs-core";
import { CheckpointV2Query } from "@bentley/imodelhub-client";
import { ChangesetProps } from "@bentley/imodeljs-common";
import { BlobDaemon } from "@bentley/imodeljs-native";
import { TestUsers, TestUtility } from "@bentley/oidc-signin-tool";
import { IModelHubBackend } from "../../IModelHubBackend";
import { AuthorizedBackendRequestContext, IModelHost, IModelJsFs, SnapshotDb } from "../../imodeljs-backend";
import { KnownTestLocations } from "../KnownTestLocations";
import { HubUtility } from "./HubUtility";

describe("Checkpoints (#integration)", () => {
  let requestContext: AuthorizedBackendRequestContext;
  let testIModelId: GuidString;
  let testContextId: GuidString;
  let testChangeSet: ChangesetProps;

  const blockcacheDir = path.join(KnownTestLocations.outputDir, "blockcachevfs");
  let daemonProc: ChildProcess;
  let originalEnv: any;

  before(async () => {
    originalEnv = { ...process.env };
    process.env.BLOCKCACHE_DIR = blockcacheDir;
    // IModelTestUtils.setupDebugLogLevels();

    requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
    testContextId = await HubUtility.getTestContextId(requestContext);
    testIModelId = await HubUtility.getTestIModelId(requestContext, HubUtility.testIModelNames.stadium);
    testChangeSet = await IModelHost.hubAccess.getLatestChangeset({ requestContext, iModelId: testIModelId });

    const checkpointQuery = new CheckpointV2Query().byChangeSetId(testChangeSet.id).selectContainerAccessKey();
    const checkpoints = await IModelHubBackend.iModelClient.checkpointsV2.get(requestContext, testIModelId, checkpointQuery);
    assert.equal(checkpoints.length, 1, "checkpoint missing");
    assert.isDefined(checkpoints[0].containerAccessKeyAccount, "checkpoint storage account is invalid");

    // Start daemon process and wait for it to be ready
    fs.chmodSync((BlobDaemon as any).exeName({}), 744);  // FIXME: This probably needs to be an imodeljs-native postinstall step...
    daemonProc = BlobDaemon.start({
      daemonDir: blockcacheDir,
      storageType: "azure?sas=1",
      user: checkpoints[0].containerAccessKeyAccount!,
    });
    while (!IModelJsFs.existsSync(path.join(blockcacheDir, "portnumber.bcv"))) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

  after(async () => {
    process.env = originalEnv;

    if (daemonProc) {
      const onDaemonExit = new Promise((resolve) => daemonProc.once("exit", resolve));
      daemonProc.kill();
      await onDaemonExit;
    }
    fs.removeSync(blockcacheDir);
  });

  it("should be able to open and read V2 checkpoint", async () => {
    const iModel = await SnapshotDb.openCheckpointV2({
      requestContext,
      contextId: testContextId,
      iModelId: testIModelId,
      changeSetId: testChangeSet.id,
    });
    assert.equal(iModel.getGuid(), testIModelId);
    assert.equal(iModel.changeset.id, testChangeSet.id);
    assert.equal(iModel.contextId, testContextId);
    assert.equal(iModel.rootSubject.name, "Stadium Dataset 1");
    let numModels = await iModel.queryRowCount("SELECT * FROM bis.model");
    assert.equal(numModels, 32);

    await iModel.reattachDaemon(requestContext);
    numModels = await iModel.queryRowCount("SELECT * FROM bis.model");
    assert.equal(numModels, 32);

    iModel.close();
  }).timeout(120000);
});
