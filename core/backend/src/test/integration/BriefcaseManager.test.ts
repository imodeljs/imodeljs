/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { BriefcaseStatus, GuidString, IModelStatus, OpenMode, StopWatch } from "@bentley/bentleyjs-core";
import { BriefcaseIdValue, IModelError, IModelVersion } from "@bentley/imodeljs-common";
import { UserCancelledError } from "@bentley/itwin-client";
import { V1CheckpointManager } from "../../CheckpointManager";
import { AuthorizedBackendRequestContext, BriefcaseDb, BriefcaseManager, Element, IModelHost, IModelJsFs } from "../../imodeljs-backend";
import { HubMock } from "../HubMock";
import { IModelTestUtils, TestUserType } from "../IModelTestUtils";
import { HubUtility } from "./HubUtility";
import { TestChangeSetUtility } from "./TestChangeSetUtility";

// Configuration needed:
//    imjs_test_regular_user_name
//    imjs_test_regular_user_password
//    imjs_test_manager_user_name
//    imjs_test_manager_user_password
//    imjs_test_super_manager_user_name
//    imjs_test_super_manager_password
//    imjs_test_imodelhub_user_name
//    imjs_test_imodelhub_user_password
//    imjs_oidc_browser_test_client_id
//      - Required to be a SPA
//    imjs_oidc_browser_test_redirect_uri
//    imjs_oidc_browser_test_scopes
//      - Required scopes: "openid imodelhub context-registry-service:read-only"

describe("BriefcaseManager (#integration)", () => {
  let testContextId: string;

  let readOnlyTestIModelId: GuidString;
  const readOnlyTestVersions = ["FirstVersion", "SecondVersion", "ThirdVersion"];
  const readOnlyTestElementCounts = [27, 28, 29];

  let noVersionsTestIModelId: GuidString;
  let requestContext: AuthorizedBackendRequestContext;
  let managerRequestContext: AuthorizedBackendRequestContext;

  before(async () => {
    // IModelTestUtils.setupDebugLogLevels();

    requestContext = await IModelTestUtils.getUserContext(TestUserType.Regular);
    testContextId = await HubUtility.getTestContextId(requestContext);
    readOnlyTestIModelId = await HubUtility.getTestIModelId(requestContext, HubUtility.testIModelNames.readOnly);
    noVersionsTestIModelId = await HubUtility.getTestIModelId(requestContext, HubUtility.testIModelNames.readWrite);
  });

  it("should open and close an iModel from the Hub", async () => {
    const iModel = await IModelTestUtils.openCheckpointUsingRpc({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId, asOf: IModelVersion.first().toJSON() });
    assert.exists(iModel, "No iModel returned from call to BriefcaseManager.open");

    // Validate that the IModelDb is readonly
    assert(iModel.isReadonly, "iModel not set to Readonly mode");

    const expectedChangeSetId = await IModelHost.hubAccess.getChangesetIdFromVersion({ version: IModelVersion.first(), requestContext, iModelId: readOnlyTestIModelId });
    assert.strictEqual(iModel.changeSetId!, expectedChangeSetId);
    assert.strictEqual(iModel.changeSetId!, expectedChangeSetId);

    const pathname = iModel.pathName;
    assert.isTrue(IModelJsFs.existsSync(pathname));
    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel);

    assert.isFalse(IModelJsFs.existsSync(pathname), `Briefcase continues to exist at ${pathname}`);
  });

  it("should reuse checkpoints", async () => {
    const iModel1 = await IModelTestUtils.openCheckpointUsingRpc({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId, asOf: IModelVersion.named("FirstVersion").toJSON() });
    assert.exists(iModel1, "No iModel returned from call to BriefcaseManager.open");

    const iModel2 = await IModelTestUtils.openCheckpointUsingRpc({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId, asOf: IModelVersion.named("FirstVersion").toJSON() });
    assert.exists(iModel2, "No iModel returned from call to BriefcaseManager.open");
    assert.equal(iModel1, iModel2, "previously open briefcase was expected to be shared");

    const iModel3 = await IModelTestUtils.openCheckpointUsingRpc({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId, asOf: IModelVersion.named("SecondVersion").toJSON() });
    assert.exists(iModel3, "No iModel returned from call to BriefcaseManager.open");
    assert.notEqual(iModel3, iModel2, "opening two different versions should not cause briefcases to be shared when the older one is open");

    const pathname2 = iModel2.pathName;
    iModel2.close();
    assert.isTrue(IModelJsFs.existsSync(pathname2));

    const pathname3 = iModel3.pathName;
    iModel3.close();
    assert.isTrue(IModelJsFs.existsSync(pathname3));

    const iModel4 = await IModelTestUtils.openCheckpointUsingRpc({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId, asOf: IModelVersion.named("FirstVersion").toJSON() });
    assert.exists(iModel4, "No iModel returned from call to BriefcaseManager.open");
    assert.equal(iModel4.pathName, pathname2, "previously closed briefcase was expected to be shared");

    const iModel5 = await IModelTestUtils.openCheckpointUsingRpc({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId, asOf: IModelVersion.named("SecondVersion").toJSON() });
    assert.exists(iModel5, "No iModel returned from call to BriefcaseManager.open");
    assert.equal(iModel5.pathName, pathname3, "previously closed briefcase was expected to be shared");

    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel4);
    assert.isFalse(IModelJsFs.existsSync(pathname2));

    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel5);
    assert.isFalse(IModelJsFs.existsSync(pathname3));
  });

  it("should open iModels of specific versions from the Hub", async () => {
    const iModelFirstVersion = await IModelTestUtils.openCheckpointUsingRpc({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId, asOf: IModelVersion.first().toJSON() });
    assert.exists(iModelFirstVersion);
    assert.strictEqual(iModelFirstVersion.changeSetId!, "");

    const changeSets = await IModelHost.hubAccess.queryChangesets({ requestContext, iModelId: readOnlyTestIModelId });

    for (const [arrayIndex, versionName] of readOnlyTestVersions.entries()) {
      const iModelFromVersion = await IModelTestUtils.openCheckpointUsingRpc({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId, asOf: IModelVersion.asOfChangeSet(changeSets[arrayIndex + 1].id).toJSON() });
      assert.exists(iModelFromVersion);
      assert.strictEqual(iModelFromVersion.changeSetId!, changeSets[arrayIndex + 1].id);

      const iModelFromChangeSet = await IModelTestUtils.openCheckpointUsingRpc({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId, asOf: IModelVersion.named(versionName).toJSON() });
      assert.exists(iModelFromChangeSet);
      assert.strictEqual(iModelFromChangeSet, iModelFromVersion);
      assert.strictEqual(iModelFromChangeSet.changeSetId!, changeSets[arrayIndex + 1].id);

      const elementCount = iModelFromVersion.withStatement("SELECT COUNT(*) FROM bis.Element", (stmt) => {
        stmt.step();
        return stmt.getValue(0).getInteger();
      });
      assert.equal(elementCount, readOnlyTestElementCounts[arrayIndex], `Count isn't what's expected for ${iModelFromVersion.pathName}, version ${versionName}`);

      iModelFromVersion.close();
      iModelFromChangeSet.close();
    }

    const iModelLatestVersion = await IModelTestUtils.openCheckpointUsingRpc({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId });
    assert.isDefined(iModelLatestVersion);
    assert.isUndefined(iModelLatestVersion.nativeDb.getReversedChangeSetId());
    assert.strictEqual(iModelLatestVersion.nativeDb.getParentChangeSetId(), changeSets[3].id);

    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModelFirstVersion);
    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModelLatestVersion);
  });

  it("should open an iModel with no versions", async () => {
    const iModelNoVer = await IModelTestUtils.openCheckpointUsingRpc({ requestContext, contextId: testContextId, iModelId: noVersionsTestIModelId });
    assert.exists(iModelNoVer);
    assert(iModelNoVer.iModelId === noVersionsTestIModelId, "Correct iModel not found");
  });

  it("should find checkpoints from previous versions", async () => {
    const arg = { requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId };
    let checkpoint = await IModelTestUtils.openCheckpointUsingRpc(arg);
    // eslint-disable-next-line deprecation/deprecation
    const compatName = V1CheckpointManager.getCompatibilityFileName({ ...arg, changeSetId: checkpoint.changeSetId! });
    let checkpointName = checkpoint.pathName;
    checkpoint.close();

    if (compatName !== checkpointName) {
      IModelJsFs.recursiveMkDirSync(path.dirname(compatName)); // make sure the old path exists
      IModelJsFs.copySync(checkpointName, compatName); // move the file from where we put it in the new location to the old location
      IModelJsFs.removeSync(checkpointName); // make sure we don't find this file
      checkpoint = await IModelTestUtils.openCheckpointUsingRpc(arg); // now try opening it, and we should find the old file
      checkpointName = checkpoint.pathName;
      checkpoint.close();
      assert.equal(checkpointName, compatName, "checkpoint should be found in old location");
    }

    IModelJsFs.removeSync(compatName); // now delete old file and make sure we don't use it
    checkpoint = await IModelTestUtils.openCheckpointUsingRpc(arg);
    checkpointName = checkpoint.pathName;
    checkpoint.close();
    assert.notEqual(checkpointName, compatName, "checkpoint should be found in new location");
  });

  it("should find briefcases from previous versions", async () => {
    HubMock.startup("previous version");
    const iModelId = await HubUtility.createIModel(managerRequestContext, testContextId, "prevIModel");

    const arg = { requestContext, contextId: testContextId, iModelId };
    let briefcase = await IModelTestUtils.openBriefcaseUsingRpc(arg);
    // eslint-disable-next-line deprecation/deprecation
    const compatName = BriefcaseManager.getCompatibilityFileName({ ...arg, briefcaseId: briefcase.briefcaseId });
    const compatLocksFile = path.join(path.dirname(compatName), `${path.basename(compatName, ".bim")}.cctl.bim`);
    let briefcaseName = briefcase.pathName;
    briefcase.close();

    if (compatName !== briefcaseName) {
      IModelJsFs.recursiveMkDirSync(path.dirname(compatName)); // make sure the old path exists
      IModelJsFs.copySync(briefcaseName, compatName); // move the file from where we put it in the new location to the old location
      IModelJsFs.copySync(`${briefcaseName}-locks`, compatLocksFile); // copy the locks file to its old name too
      IModelJsFs.removeSync(briefcaseName); // make sure we don't find this file
      briefcase = await IModelTestUtils.openBriefcaseUsingRpc(arg); // now try opening it, and we should find the old file
      briefcaseName = briefcase.pathName;
      briefcase.close();
      assert.equal(briefcaseName, compatName, "briefcase should be found in old location");
      assert.isFalse(IModelJsFs.existsSync(compatLocksFile)); // we should have deleted it
    }

    IModelJsFs.removeSync(compatName); // now delete old file and make sure we don't use it
    briefcase = await IModelTestUtils.openBriefcaseUsingRpc(arg);
    briefcaseName = briefcase.pathName;
    briefcase.close();
    assert.notEqual(briefcaseName, compatName, "briefcase should be found in new location");
    HubMock.shutdown();
  });

  it("Open iModels with various names causing potential issues on Windows/Unix", async () => {
    HubMock.startup("bad names");
    let iModelName = "iModel Name With Spaces";
    let iModelId = await HubUtility.createIModel(managerRequestContext, testContextId, iModelName);
    const args = { requestContext, contextId: testContextId, iModelId };
    assert.isDefined(iModelId);
    let iModel = await IModelTestUtils.openCheckpointUsingRpc(args);
    assert.isDefined(iModel);

    iModelName = "iModel Name With :\/<>?* Characters";
    iModelId = await HubUtility.createIModel(managerRequestContext, testContextId, iModelName);
    assert.isDefined(iModelId);
    iModel = await IModelTestUtils.openCheckpointUsingRpc(args);
    assert.isDefined(iModel);

    iModelName = "iModel Name Thats Excessively Long " +
      "0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789" +
      "0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789" +
      "01234567890123456789"; // 35 + 2*100 + 20 = 255
    // Note: iModelHub does not accept a name that's longer than 255 characters.
    assert.equal(255, iModelName.length);
    iModelId = await HubUtility.createIModel(managerRequestContext, testContextId, iModelName);
    assert.isDefined(iModelId);
    iModel = await IModelTestUtils.openCheckpointUsingRpc(args);
    assert.isDefined(iModel);
    iModel.close();
    HubMock.shutdown();
  });

  it("should set appropriate briefcase ids for FixedVersion, PullOnly and PullAndPush workflows", async () => {
    HubMock.startup("briefcaseids");
    const iModelId = await HubUtility.createIModel(requestContext, testContextId, "imodel1");
    const args = { requestContext, contextId: testContextId, iModelId, deleteFirst: true };
    const iModel1 = await IModelTestUtils.openCheckpointUsingRpc(args);
    assert.equal(BriefcaseIdValue.Unassigned, iModel1.nativeDb.getBriefcaseId(), "checkpoint should be 0");

    const iModel2 = await IModelTestUtils.openBriefcaseUsingRpc({ ...args, briefcaseId: 0 });
    assert.equal(BriefcaseIdValue.Unassigned, iModel2.briefcaseId, "pullOnly should be 0");

    const iModel3 = await IModelTestUtils.openBriefcaseUsingRpc(args);
    assert.isTrue(iModel3.briefcaseId >= BriefcaseIdValue.FirstValid && iModel3.briefcaseId <= BriefcaseIdValue.LastValid, "valid briefcaseId");

    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel1);
    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel2);
    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel3);
    HubMock.shutdown();
  });

  it("should reuse a briefcaseId when re-opening iModels for pullAndPush workflows", async () => {
    HubMock.startup("briefcaseIdsReopen");
    const iModelId = await HubUtility.createIModel(requestContext, testContextId, "imodel1");

    const args = { requestContext, contextId: testContextId, iModelId, deleteFirst: true };
    const iModel1 = await IModelTestUtils.openBriefcaseUsingRpc(args);
    const briefcaseId1 = iModel1.briefcaseId;
    iModel1.close(); // Keeps the briefcase by default

    const iModel3 = await IModelTestUtils.openBriefcaseUsingRpc(args);
    const briefcaseId3 = iModel3.briefcaseId;
    assert.strictEqual(briefcaseId3, briefcaseId1);

    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel3);
    HubMock.shutdown();
  });

  it("should reuse a briefcaseId when re-opening iModels of different versions for pullAndPush and pullOnly workflows", async () => {
    HubMock.startup("workflow");
    const userContext1 = await IModelTestUtils.getUserContext(TestUserType.Manager);
    const userContext2 = await IModelTestUtils.getUserContext(TestUserType.SuperManager);

    // User1 creates an iModel on the Hub
    const testUtility = new TestChangeSetUtility(userContext1, HubUtility.generateUniqueName("BriefcaseReuseTest"));
    await testUtility.createTestIModel();

    // User2 opens and then closes the iModel pullOnly/pullPush, keeping the briefcase
    const args = { requestContext: userContext2, contextId: testUtility.projectId, iModelId: testUtility.iModelId };
    const iModelPullAndPush = await IModelTestUtils.openBriefcaseUsingRpc(args);
    const briefcaseIdPullAndPush: number = iModelPullAndPush.briefcaseId;
    const changeSetIdPullAndPush = iModelPullAndPush.changeSetId;
    iModelPullAndPush.close();

    const iModelPullOnly = await IModelTestUtils.openBriefcaseUsingRpc({ ...args, briefcaseId: 0 });
    const briefcaseIdPullOnly: number = iModelPullOnly.briefcaseId;
    const changeSetIdPullOnly = iModelPullOnly.changeSetId;
    iModelPullOnly.close();

    // User1 pushes a change set
    await testUtility.pushTestChangeSet();

    // User 2 reopens the iModel pullOnly/pullPush => Expect the same briefcase to be re-used, but the changeSet should have been updated!!
    const iModelPullAndPush2 = await IModelTestUtils.openBriefcaseUsingRpc(args);
    const briefcaseIdPullAndPush2: number = iModelPullAndPush2.briefcaseId;
    assert.strictEqual(briefcaseIdPullAndPush2, briefcaseIdPullAndPush);
    const changeSetIdPullAndPush2 = iModelPullAndPush2.changeSetId;
    assert.notStrictEqual(changeSetIdPullAndPush2, changeSetIdPullAndPush);
    await IModelTestUtils.closeAndDeleteBriefcaseDb(userContext2, iModelPullAndPush2);

    const iModelPullOnly2 = await IModelTestUtils.openBriefcaseUsingRpc({ ...args, briefcaseId: 0 });
    const briefcaseIdPullOnly2: number = iModelPullOnly2.briefcaseId;
    assert.strictEqual(briefcaseIdPullOnly2, briefcaseIdPullOnly);
    const changeSetIdPullOnly2 = iModelPullOnly2.changeSetId;
    assert.notStrictEqual(changeSetIdPullOnly2, changeSetIdPullOnly);
    await IModelTestUtils.closeAndDeleteBriefcaseDb(userContext2, iModelPullOnly2);

    // Delete iModel from the Hub and disk
    await testUtility.deleteTestIModel();
    HubMock.shutdown();
  });

  it("should not be able to edit PullOnly briefcases", async () => {
    HubMock.startup("pullOnly");
    const userContext1 = await IModelTestUtils.getUserContext(TestUserType.Manager); // User1 is just used to create and update the iModel
    const userContext2 = await IModelTestUtils.getUserContext(TestUserType.SuperManager); // User2 is used for the test

    // User1 creates an iModel on the Hub
    const testUtility = new TestChangeSetUtility(userContext1, "PullOnlyTest");
    await testUtility.createTestIModel();

    const args = { requestContext: userContext2, contextId: testUtility.projectId, iModelId: testUtility.iModelId, briefcaseId: 0 };

    // User2 opens the iModel pullOnly and is not able to edit (even if the db is opened read-write!)
    let iModelPullOnly = await IModelTestUtils.openBriefcaseUsingRpc(args);
    assert.exists(iModelPullOnly);
    assert.isTrue(!iModelPullOnly.isReadonly);
    assert.isTrue(iModelPullOnly.isOpen);
    assert.equal(iModelPullOnly.openMode, OpenMode.ReadWrite);

    const briefcaseId = iModelPullOnly.briefcaseId;
    const pathname = iModelPullOnly.pathName;

    const rootEl: Element = iModelPullOnly.elements.getRootSubject();
    rootEl.userLabel = `${rootEl.userLabel}changed`;
    await expect(iModelPullOnly.concurrencyControl.requestResourcesForUpdate(userContext2, [rootEl]))
      .to.be.rejectedWith(IModelError).to.eventually.have.property("errorNumber", IModelStatus.NotOpenForWrite);

    assert.throws(() => iModelPullOnly.elements.updateElement(rootEl), IModelError);

    iModelPullOnly.close();

    // User2 should be able to re-open the iModel pullOnly again
    iModelPullOnly = await IModelTestUtils.openBriefcaseUsingRpc(args);
    const changeSetIdPullAndPush = iModelPullOnly.changeSetId;
    assert.strictEqual(iModelPullOnly.briefcaseId, briefcaseId);
    assert.strictEqual(iModelPullOnly.pathName, pathname);
    assert.isFalse(iModelPullOnly.nativeDb.hasUnsavedChanges());
    assert.isFalse(iModelPullOnly.nativeDb.hasPendingTxns());

    // User1 pushes a change set
    await testUtility.pushTestChangeSet();

    // User2 closes and reopens the iModel pullOnly as of the newer version
    // - the briefcase will be upgraded to the newer version since it was closed and re-opened.
    iModelPullOnly.close();
    iModelPullOnly = await IModelTestUtils.openBriefcaseUsingRpc(args);
    const changeSetIdPullAndPush3 = iModelPullOnly.changeSetId;
    assert.notStrictEqual(changeSetIdPullAndPush3, changeSetIdPullAndPush);
    assert.strictEqual(iModelPullOnly.briefcaseId, briefcaseId);
    assert.strictEqual(iModelPullOnly.pathName, pathname);
    assert.isFalse(iModelPullOnly.nativeDb.hasUnsavedChanges());
    assert.isFalse(iModelPullOnly.nativeDb.hasPendingTxns());

    // User1 pushes another change set
    await testUtility.pushTestChangeSet();

    // User2 should be able pull and merge changes
    await iModelPullOnly.pullAndMergeChanges(userContext2, IModelVersion.latest());
    const changeSetIdPullAndPush4 = iModelPullOnly.changeSetId;
    assert.notStrictEqual(changeSetIdPullAndPush4, changeSetIdPullAndPush3);

    // User2 should NOT be able to push the changes
    await expect(iModelPullOnly.pushChanges(userContext2, "test change")).to.be.rejectedWith(IModelError);

    // Delete iModel from the Hub and disk
    await IModelTestUtils.closeAndDeleteBriefcaseDb(userContext2, iModelPullOnly);
    await testUtility.deleteTestIModel();
    HubMock.shutdown();
  });

  it("should be able to edit a PullAndPush briefcase, reopen it as of a new version, and then push changes", async () => {
    HubMock.startup("pullPush");
    const userContext1 = await IModelTestUtils.getUserContext(TestUserType.Manager); // User1 is just used to create and update the iModel
    const userContext2 = await IModelTestUtils.getUserContext(TestUserType.SuperManager); // User2 is used for the test

    // User1 creates an iModel on the Hub
    const testUtility = new TestChangeSetUtility(userContext1, "PullAndPushTest");
    await testUtility.createTestIModel();

    // User2 opens the iModel pullAndPush and is able to edit and save changes
    const args = { requestContext: userContext2, contextId: testUtility.projectId, iModelId: testUtility.iModelId };
    let iModelPullAndPush = await IModelTestUtils.openBriefcaseUsingRpc(args);
    assert.exists(iModelPullAndPush);
    const briefcaseId = iModelPullAndPush.briefcaseId;
    const pathname = iModelPullAndPush.pathName;

    const rootEl: Element = iModelPullAndPush.elements.getRootSubject();
    rootEl.userLabel = `${rootEl.userLabel}changed`;
    await iModelPullAndPush.concurrencyControl.requestResourcesForUpdate(userContext2, [rootEl]);
    iModelPullAndPush.elements.updateElement(rootEl);

    await iModelPullAndPush.concurrencyControl.request(userContext2);
    assert.isTrue(iModelPullAndPush.nativeDb.hasUnsavedChanges());
    assert.isFalse(iModelPullAndPush.nativeDb.hasPendingTxns());
    iModelPullAndPush.saveChanges();
    assert.isFalse(iModelPullAndPush.nativeDb.hasUnsavedChanges());
    assert.isTrue(iModelPullAndPush.nativeDb.hasPendingTxns());

    iModelPullAndPush.close();

    // User2 should be able to re-open the iModel pullAndPush again
    // - the changes will still be there
    iModelPullAndPush = await IModelTestUtils.openBriefcaseUsingRpc(args);
    const changeSetIdPullAndPush = iModelPullAndPush.changeSetId;
    assert.strictEqual(iModelPullAndPush.briefcaseId, briefcaseId);
    assert.strictEqual(iModelPullAndPush.pathName, pathname);
    assert.isFalse(iModelPullAndPush.nativeDb.hasUnsavedChanges());
    assert.isTrue(iModelPullAndPush.nativeDb.hasPendingTxns());

    // User1 pushes a change set
    await testUtility.pushTestChangeSet();

    // User2 should be able to re-open the iModel
    await IModelTestUtils.openBriefcaseUsingRpc(args);

    // User2 closes and reopens the iModel pullAndPush as of the newer version
    // - the changes will still be there, AND
    // - the briefcase will be upgraded to the newer version since it was closed and re-opened.
    iModelPullAndPush.close();
    iModelPullAndPush = await IModelTestUtils.openBriefcaseUsingRpc(args);
    const changeSetIdPullAndPush3 = iModelPullAndPush.changeSetId;
    assert.notStrictEqual(changeSetIdPullAndPush3, changeSetIdPullAndPush);
    assert.strictEqual(iModelPullAndPush.briefcaseId, briefcaseId);
    assert.strictEqual(iModelPullAndPush.pathName, pathname);
    assert.isFalse(iModelPullAndPush.nativeDb.hasUnsavedChanges());
    assert.isTrue(iModelPullAndPush.nativeDb.hasPendingTxns());

    // User2 should be able to push the changes now
    await iModelPullAndPush.pushChanges(userContext2, "test change");
    const changeSetIdPullAndPush4 = iModelPullAndPush.changeSetId;
    assert.notStrictEqual(changeSetIdPullAndPush4, changeSetIdPullAndPush3);

    // Delete iModel from the Hub and disk
    await IModelTestUtils.closeAndDeleteBriefcaseDb(userContext2, iModelPullAndPush);
    await testUtility.deleteTestIModel();
    HubMock.shutdown();
  });

  it("should be able to show progress when downloading a briefcase (#integration)", async () => {
    const testIModelId = await HubUtility.getTestIModelId(requestContext, HubUtility.testIModelNames.stadium);

    let numProgressCalls = 0;

    readline.clearLine(process.stdout, 0);
    readline.moveCursor(process.stdout, -20, 0);
    let done = 0;
    let complete = 0;
    const downloadProgress = (loaded: number, total: number) => {
      if (total > 0) {
        const message = `${HubUtility.testIModelNames.stadium} Download Progress ... ${(loaded * 100 / total).toFixed(2)}%`;
        process.stdout.write(message);
        readline.moveCursor(process.stdout, -1 * message.length, 0);
        if (loaded >= total)
          process.stdout.write(os.EOL);
        numProgressCalls++;
        done = loaded;
        complete = total;
      }
      return 0;
    };

    const args = {
      contextId: testContextId,
      iModelId: testIModelId,
      briefcaseId: BriefcaseIdValue.Unassigned,
      onProgress: downloadProgress,
    };
    const fileName = BriefcaseManager.getFileName(args);
    await BriefcaseManager.deleteBriefcaseFiles(fileName);
    const watch = new StopWatch("download", true);
    const props = await BriefcaseManager.downloadBriefcase(requestContext, args);
    // eslint-disable-next-line no-console
    console.log(`download took ${watch.elapsedSeconds} seconds`);
    const iModel = await BriefcaseDb.open(requestContext, { fileName: props.fileName });

    await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel);
    assert.isAbove(numProgressCalls, 0, "download progress called");
    assert.isAbove(done, 0, "done set");
    assert.isAbove(complete, 0, "complete set");
  });

  it("Should be able to cancel an in progress download (#integration)", async () => {
    const testIModelId = await HubUtility.getTestIModelId(requestContext, HubUtility.testIModelNames.stadium);
    let aborted = 0;
    const args = {
      contextId: testContextId,
      iModelId: testIModelId,
      briefcaseId: BriefcaseIdValue.Unassigned,
      onProgress: () => aborted,
    };
    await BriefcaseManager.deleteBriefcaseFiles(BriefcaseManager.getFileName(args), requestContext);

    const downloadPromise = BriefcaseManager.downloadBriefcase(requestContext, args);
    setTimeout(async () => aborted = 1, 1000);
    await expect(downloadPromise).to.be.rejectedWith(UserCancelledError).to.eventually.have.property("errorNumber", BriefcaseStatus.DownloadCancelled);
  });

});
