/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { DbResult, GuidString, Id64, Id64String, Logger, LogLevel, PerfLogger } from "@bentley/bentleyjs-core";
import {
  ChangedValueState, ChangeOpCode, ColorDef, IModel, IModelVersion, SubCategoryAppearance,
} from "@bentley/imodeljs-common";
import { assert } from "chai";
import * as path from "path";
import {
  AuthorizedBackendRequestContext, BriefcaseDb, BriefcaseManager, ChangeSummary, ChangeSummaryManager, ConcurrencyControl, ECSqlStatement,
  ElementOwnsChildElements, IModelHost, IModelJsFs, SpatialCategory,
} from "../../imodeljs-backend";
import { IModelTestUtils, TestUserType } from "../IModelTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { HubUtility } from "./HubUtility";
import { TestChangeSetUtility } from "./TestChangeSetUtility";

function setupTest(iModelId: string): void {
  const cacheFilePath: string = BriefcaseManager.getChangeCachePathName(iModelId);
  if (IModelJsFs.existsSync(cacheFilePath))
    IModelJsFs.removeSync(cacheFilePath);
}

function getChangeSummaryAsJson(iModel: BriefcaseDb, changeSummaryId: string) {
  const changeSummary: ChangeSummary = ChangeSummaryManager.queryChangeSummary(iModel, changeSummaryId);
  const content = { id: changeSummary.id, changeSet: changeSummary.changeSet, instanceChanges: new Array<any>() };

  iModel.withPreparedStatement("SELECT ECInstanceId FROM ecchange.change.InstanceChange WHERE Summary.Id=? ORDER BY ECInstanceId", (stmt) => {
    stmt.bindId(1, changeSummary.id);
    while (stmt.step() === DbResult.BE_SQLITE_ROW) {
      const row = stmt.getRow();

      const instanceChange: any = ChangeSummaryManager.queryInstanceChange(iModel, Id64.fromJSON(row.id));
      switch (instanceChange.opCode) {
        case ChangeOpCode.Insert: {
          const rows: any[] = IModelTestUtils.executeQuery(iModel, ChangeSummaryManager.buildPropertyValueChangesECSql(iModel, instanceChange, ChangedValueState.AfterInsert));
          assert.equal(rows.length, 1);
          instanceChange.after = rows[0];
          break;
        }
        case ChangeOpCode.Update: {
          let rows: any[] = IModelTestUtils.executeQuery(iModel, ChangeSummaryManager.buildPropertyValueChangesECSql(iModel, instanceChange, ChangedValueState.BeforeUpdate));
          assert.equal(rows.length, 1);
          instanceChange.before = rows[0];
          rows = IModelTestUtils.executeQuery(iModel, ChangeSummaryManager.buildPropertyValueChangesECSql(iModel, instanceChange, ChangedValueState.AfterUpdate));
          assert.equal(rows.length, 1);
          instanceChange.after = rows[0];
          break;
        }
        case ChangeOpCode.Delete: {
          const rows: any[] = IModelTestUtils.executeQuery(iModel, ChangeSummaryManager.buildPropertyValueChangesECSql(iModel, instanceChange, ChangedValueState.BeforeDelete));
          assert.equal(rows.length, 1);
          instanceChange.before = rows[0];
          break;
        }
        default:
          throw new Error(`Unexpected ChangedOpCode ${instanceChange.opCode}`);
      }
      content.instanceChanges.push(instanceChange);
    }
  });

  return content;
}

describe("ChangeSummary (#integration)", () => {
  let requestContext: AuthorizedBackendRequestContext;
  let testContextId: string;

  let readOnlyTestIModelId: GuidString;
  let readWriteTestIModelId: GuidString;

  before(async () => {
    Logger.setLevel("DgnCore", LogLevel.Error);
    Logger.setLevel("BeSQLite", LogLevel.Error);

    HubUtility.allowHubBriefcases = true;
    requestContext = await IModelTestUtils.getUserContext(TestUserType.Regular);

    testContextId = await HubUtility.getTestContextId(requestContext);
    requestContext.enter();
    readOnlyTestIModelId = await HubUtility.getTestIModelId(requestContext, HubUtility.testIModelNames.readOnly);
    requestContext.enter();
    readWriteTestIModelId = await HubUtility.getTestIModelId(requestContext, HubUtility.testIModelNames.readWrite);
    requestContext.enter();

    await HubUtility.purgeAcquiredBriefcasesById(requestContext, readOnlyTestIModelId);
    requestContext.enter();
    await HubUtility.purgeAcquiredBriefcasesById(requestContext, readWriteTestIModelId);
    requestContext.enter();

    // Purge briefcases that are close to reaching the acquire limit
    const managerRequestContext = await IModelTestUtils.getUserContext(TestUserType.Manager);
    managerRequestContext.enter();
    await HubUtility.purgeAcquiredBriefcasesById(managerRequestContext, readOnlyTestIModelId);
    managerRequestContext.enter();
    await HubUtility.purgeAcquiredBriefcasesById(managerRequestContext, readWriteTestIModelId);
    managerRequestContext.enter();
  });

  after(() => HubUtility.allowHubBriefcases = false);

  it("Attach / Detach ChangeCache file to closed imodel", async () => {
    setupTest(readOnlyTestIModelId);

    const iModel = await IModelTestUtils.downloadAndOpenCheckpoint({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId });
    iModel.close();
    assert.exists(iModel);
    assert.throw(() => ChangeSummaryManager.isChangeCacheAttached(iModel));
    assert.throw(() => ChangeSummaryManager.attachChangeCache(iModel));
  });

  it("Extract ChangeSummaries", async () => {
    setupTest(readOnlyTestIModelId);

    const iModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId });
    assert.exists(iModel);
    try {
      const summaryIds = await ChangeSummaryManager.extractChangeSummaries(requestContext, iModel);
      ChangeSummaryManager.attachChangeCache(iModel);
      assert.isTrue(ChangeSummaryManager.isChangeCacheAttached(iModel));

      iModel.withPreparedStatement("SELECT ECInstanceId,ECClassId,ExtendedProperties FROM change.ChangeSummary ORDER BY ECInstanceId", (myStmt) => {
        let rowCount: number = 0;
        while (myStmt.step() === DbResult.BE_SQLITE_ROW) {
          rowCount++;
          const row: any = myStmt.getRow();
          assert.equal(row.className, "ECDbChange.ChangeSummary");
          assert.isUndefined(row.extendedProperties, "ChangeSummary.ExtendedProperties is not expected to be populated when change summaries are extracted.");
        }
        assert.isAtLeast(rowCount, 3);
      });

      iModel.withPreparedStatement("SELECT ECClassId,Summary,WsgId,ParentWsgId,Description,PushDate,UserCreated FROM imodelchange.ChangeSet ORDER BY Summary.Id", (myStmt) => {
        let rowCount: number = 0;
        while (myStmt.step() === DbResult.BE_SQLITE_ROW) {
          rowCount++;
          const row: any = myStmt.getRow();
          assert.equal(row.className, "IModelChange.ChangeSet");
          assert.equal(row.summary.id, summaryIds[rowCount - 1]);
          assert.equal(row.summary.relClassName, "IModelChange.ChangeSummaryIsExtractedFromChangeset");
          assert.isDefined(row.pushDate, "IModelChange.ChangeSet.PushDate is expected to be set for the changesets used in this test.");
          assert.isDefined(row.userCreated, "IModelChange.ChangeSet.UserCreated is expected to be set for the changesets used in this test.");
          // the other properties are not used, but using them in the ECSQL is important to verify preparation works
        }
        assert.isAtLeast(rowCount, 3);
      });

    } finally {
      await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel);
    }
  });

  it("Extract ChangeSummary for single changeset", async () => {
    setupTest(readOnlyTestIModelId);

    const changeSets = await IModelHost.hubAccess.queryChangesets({ requestContext, iModelId: readOnlyTestIModelId });
    assert.isAtLeast(changeSets.length, 3);
    // extract summary for second changeset
    const changesetId: string = changeSets[1].id;

    const iModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId });
    try {
      assert.exists(iModel);
      await iModel.reverseChanges(requestContext, IModelVersion.asOfChangeSet(changesetId));// eslint-disable-line deprecation/deprecation

      // now extract change summary for that one changeset
      const summaryIds = await ChangeSummaryManager.extractChangeSummaries(requestContext, iModel, { currentVersionOnly: true });
      assert.equal(summaryIds.length, 1);
      assert.isTrue(Id64.isValidId64(summaryIds[0]));
      assert.isTrue(IModelJsFs.existsSync(BriefcaseManager.getChangeCachePathName(readOnlyTestIModelId)));
      assert.exists(iModel);
      ChangeSummaryManager.attachChangeCache(iModel);
      assert.isTrue(ChangeSummaryManager.isChangeCacheAttached(iModel));

      iModel.withPreparedStatement("SELECT WsgId, Summary, ParentWsgId, Description, PushDate, UserCreated FROM imodelchange.ChangeSet", (myStmt) => {
        assert.equal(myStmt.step(), DbResult.BE_SQLITE_ROW);
        const row: any = myStmt.getRow();
        assert.isDefined(row.wsgId);
        assert.equal(row.wsgId, changesetId);
        assert.isDefined(row.summary);
        assert.equal(row.summary.id, summaryIds[0]);
        assert.isDefined(row.pushDate, "IModelChange.ChangeSet.PushDate is expected to be set for the changesets used in this test.");
        assert.isDefined(row.userCreated, "IModelChange.ChangeSet.UserCreated is expected to be set for the changesets used in this test.");
        // the other properties are not used, but using them in the ECSQL is important to verify preparation works
        assert.equal(myStmt.step(), DbResult.BE_SQLITE_DONE);
      });
    } finally {
      await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel);
    }
  });

  it("Extracting ChangeSummaries for a range of changesets", async () => {
    setupTest(readOnlyTestIModelId);

    const changeSets = await IModelHost.hubAccess.queryChangesets({ requestContext, iModelId: readOnlyTestIModelId });
    assert.isAtLeast(changeSets.length, 3);
    const startChangeSetId: string = changeSets[0].id;
    const endChangeSetId: string = changeSets[1].id;
    const startVersion: IModelVersion = IModelVersion.asOfChangeSet(startChangeSetId);
    const endVersion: IModelVersion = IModelVersion.asOfChangeSet(endChangeSetId);

    const iModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId, asOf: endVersion.toJSON() });
    try {
      assert.exists(iModel);
      const summaryIds = await ChangeSummaryManager.extractChangeSummaries(requestContext, iModel, { startVersion });
      assert.equal(summaryIds.length, 2);
      assert.isTrue(IModelJsFs.existsSync(BriefcaseManager.getChangeCachePathName(readOnlyTestIModelId)));

      assert.exists(iModel);
      ChangeSummaryManager.attachChangeCache(iModel);
      assert.isTrue(ChangeSummaryManager.isChangeCacheAttached(iModel));

      iModel.withPreparedStatement("SELECT WsgId, Summary, ParentWsgId, Description, PushDate, UserCreated FROM imodelchange.ChangeSet ORDER BY Summary.Id", (myStmt) => {
        assert.equal(myStmt.step(), DbResult.BE_SQLITE_ROW);
        let row: any = myStmt.getRow();
        assert.isDefined(row.wsgId);
        // Change summaries are extracted from end to start, so order is inverse of changesets
        assert.equal(row.wsgId, endChangeSetId);
        assert.isDefined(row.summary);
        assert.equal(row.summary.id, summaryIds[0]);
        assert.isDefined(row.pushDate, "IModelChange.ChangeSet.PushDate is expected to be set for the changesets used in this test.");
        assert.isDefined(row.userCreated, "IModelChange.ChangeSet.UserCreated is expected to be set for the changesets used in this test.");
        // the other properties are not used, but using them in the ECSQL is important to verify preparation works
        assert.equal(myStmt.step(), DbResult.BE_SQLITE_ROW);
        row = myStmt.getRow();
        assert.isDefined(row.wsgId);
        assert.equal(row.wsgId, startChangeSetId);
        assert.isDefined(row.summary);
        assert.equal(row.summary.id, summaryIds[1]);
        assert.isDefined(row.pushDate, "IModelChange.ChangeSet.PushDate is expected to be set for the changesets used in this test.");
        assert.isDefined(row.userCreated, "IModelChange.ChangeSet.UserCreated is expected to be set for the changesets used in this test.");
      });
    } finally {
      await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel);
    }
  });

  it("Subsequent ChangeSummary extractions", async () => {
    setupTest(readOnlyTestIModelId);

    const changeSets = await IModelHost.hubAccess.queryChangesets({ requestContext, iModelId: readOnlyTestIModelId });
    assert.isAtLeast(changeSets.length, 3);
    // first extraction: just first changeset
    const firstChangesetId: string = changeSets[0].id;

    let iModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId });
    try {
      assert.exists(iModel);
      await iModel.reverseChanges(requestContext, IModelVersion.asOfChangeSet(firstChangesetId));// eslint-disable-line deprecation/deprecation

      // now extract change summary for that one changeset
      const summaryIds = await ChangeSummaryManager.extractChangeSummaries(requestContext, iModel, { currentVersionOnly: true });
      assert.equal(summaryIds.length, 1);
      assert.isTrue(IModelJsFs.existsSync(BriefcaseManager.getChangeCachePathName(readOnlyTestIModelId)));

      assert.exists(iModel);
      ChangeSummaryManager.attachChangeCache(iModel);
      assert.isTrue(ChangeSummaryManager.isChangeCacheAttached(iModel));

      iModel.withPreparedStatement("SELECT WsgId, Summary, ParentWsgId, Description, PushDate, UserCreated FROM imodelchange.ChangeSet", (myStmt) => {
        assert.equal(myStmt.step(), DbResult.BE_SQLITE_ROW);
        const row: any = myStmt.getRow();
        assert.isDefined(row.wsgId);
        assert.equal(row.wsgId, firstChangesetId);
        assert.isDefined(row.summary);
        assert.equal(row.summary.id, summaryIds[0]);
        assert.isDefined(row.pushDate, "IModelChange.ChangeSet.PushDate is expected to be set for the changesets used in this test.");
        assert.isDefined(row.userCreated, "IModelChange.ChangeSet.UserCreated is expected to be set for the changesets used in this test.");
        // the other properties are not used, but using them in the ECSQL is important to verify preparation works
        assert.equal(myStmt.step(), DbResult.BE_SQLITE_DONE);
      });

      // now do second extraction for last changeset
      const lastChangesetId: string = changeSets[changeSets.length - 1].id;
      await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel);
      iModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId, asOf: IModelVersion.asOfChangeSet(lastChangesetId).toJSON() });
      // WIP not working yet until cache can be detached.
      // await iModel.pullAndMergeChanges(accessToken, IModelVersion.asOfChangeSet(lastChangesetId));

      await ChangeSummaryManager.extractChangeSummaries(requestContext, iModel, { currentVersionOnly: true });

      // WIP
      ChangeSummaryManager.attachChangeCache(iModel);
      assert.isTrue(ChangeSummaryManager.isChangeCacheAttached(iModel));

      iModel.withPreparedStatement("SELECT cset.WsgId changesetId FROM change.ChangeSummary csum JOIN imodelchange.ChangeSet cset ON csum.ECInstanceId=cset.Summary.Id ORDER BY csum.ECInstanceId", (myStmt) => {
        let rowCount: number = 0;
        while (myStmt.step() === DbResult.BE_SQLITE_ROW) {
          rowCount++;
          const row: any = myStmt.getRow();
          assert.isDefined(row.changesetId);
          if (rowCount === 1)
            assert.equal(row.changesetId, firstChangesetId);
          else if (rowCount === 2)
            assert.equal(row.changesetId, lastChangesetId);
        }
        assert.equal(rowCount, 2);
      });
    } finally {
      iModel.close();
    }
  });

  it("Query ChangeSummary content", async () => {
    const testIModelId: string = readOnlyTestIModelId;
    setupTest(testIModelId);

    let perfLogger = new PerfLogger("IModelDb.open");
    const iModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: testContextId, iModelId: readOnlyTestIModelId });
    perfLogger.dispose();
    try {
      await ChangeSummaryManager.extractChangeSummaries(requestContext, iModel);
      assert.exists(iModel);
      ChangeSummaryManager.attachChangeCache(iModel);
      assert.isTrue(ChangeSummaryManager.isChangeCacheAttached(iModel));

      const outDir = KnownTestLocations.outputDir;
      if (!IModelJsFs.existsSync(outDir))
        IModelJsFs.mkdirSync(outDir);

      const changeSummaries = new Array<ChangeSummary>();
      iModel.withPreparedStatement("SELECT ECInstanceId FROM ecchange.change.ChangeSummary ORDER BY ECInstanceId", (stmt) => {
        perfLogger = new PerfLogger("ChangeSummaryManager.queryChangeSummary");
        while (stmt.step() === DbResult.BE_SQLITE_ROW) {
          const row = stmt.getRow();
          const csum: ChangeSummary = ChangeSummaryManager.queryChangeSummary(iModel, Id64.fromJSON(row.id));
          changeSummaries.push(csum);
        }
        perfLogger.dispose();
      });

      for (const changeSummary of changeSummaries) {
        const filePath = path.join(outDir, `imodelid_${readWriteTestIModelId}_changesummaryid_${changeSummary.id}.changesummary.json`);
        if (IModelJsFs.existsSync(filePath))
          IModelJsFs.unlinkSync(filePath);

        const content = { id: changeSummary.id, changeSet: changeSummary.changeSet, instanceChanges: new Array<any>() };
        iModel.withPreparedStatement("SELECT ECInstanceId FROM ecchange.change.InstanceChange WHERE Summary.Id=? ORDER BY ECInstanceId", (stmt) => {
          stmt.bindId(1, changeSummary.id);
          perfLogger = new PerfLogger(`ChangeSummaryManager.queryInstanceChange for all instances in ChangeSummary ${changeSummary.id}`);
          while (stmt.step() === DbResult.BE_SQLITE_ROW) {
            const row = stmt.getRow();

            const instanceChange: any = ChangeSummaryManager.queryInstanceChange(iModel, Id64.fromJSON(row.id));
            switch (instanceChange.opCode) {
              case ChangeOpCode.Insert: {
                const rows: any[] = IModelTestUtils.executeQuery(iModel, ChangeSummaryManager.buildPropertyValueChangesECSql(iModel, instanceChange, ChangedValueState.AfterInsert));
                assert.equal(rows.length, 1);
                instanceChange.after = rows[0];
                break;
              }
              case ChangeOpCode.Update: {
                let rows: any[] = IModelTestUtils.executeQuery(iModel, ChangeSummaryManager.buildPropertyValueChangesECSql(iModel, instanceChange, ChangedValueState.BeforeUpdate));
                assert.equal(rows.length, 1);
                instanceChange.before = rows[0];
                rows = IModelTestUtils.executeQuery(iModel, ChangeSummaryManager.buildPropertyValueChangesECSql(iModel, instanceChange, ChangedValueState.BeforeUpdate));
                assert.equal(rows.length, 1);
                instanceChange.after = rows[0];
                break;
              }
              case ChangeOpCode.Delete: {
                const rows: any[] = IModelTestUtils.executeQuery(iModel, ChangeSummaryManager.buildPropertyValueChangesECSql(iModel, instanceChange, ChangedValueState.BeforeDelete));
                assert.equal(rows.length, 1);
                instanceChange.before = rows[0];
                break;
              }
              default:
                throw new Error(`Unexpected ChangedOpCode ${instanceChange.opCode}`);
            }

            content.instanceChanges.push(instanceChange);
          }
          perfLogger.dispose();
        });

        IModelJsFs.writeFileSync(filePath, JSON.stringify(content));
      }
    } finally {
      await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel);
    }
  });

  it.skip("Create ChangeSummary-s for changes to parent elements", async () => {
    // Generate a unique name for the iModel (so that this test can be run simultaneously by multiple users+hosts simultaneously)
    const iModelName = HubUtility.generateUniqueName("ParentElementChangeTest");

    // Recreate iModel
    const managerRequestContext = await IModelTestUtils.getUserContext(TestUserType.Manager);
    const projectId = await HubUtility.getTestContextId(managerRequestContext);
    const iModelId = await HubUtility.recreateIModel(managerRequestContext, projectId, iModelName);

    // Cleanup local cache
    setupTest(iModelId);

    // Populate the iModel with 3 elements
    const iModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: managerRequestContext, contextId: projectId, iModelId });
    iModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
    const [, modelId] = IModelTestUtils.createAndInsertPhysicalPartitionAndModel(iModel, IModelTestUtils.getUniqueModelCode(iModel, "TestPhysicalModel"), true);
    await iModel.concurrencyControl.request(managerRequestContext);
    iModel.saveChanges("Added test model");
    const categoryId = SpatialCategory.insert(iModel, IModel.dictionaryId, "TestSpatialCategory", new SubCategoryAppearance({ color: ColorDef.fromString("rgb(255,0,0)").toJSON() }));
    await iModel.concurrencyControl.request(managerRequestContext);
    iModel.saveChanges("Added test category");
    const elementId1: Id64String = iModel.elements.insertElement(IModelTestUtils.createPhysicalObject(iModel, modelId, categoryId));
    const elementId2: Id64String = iModel.elements.insertElement(IModelTestUtils.createPhysicalObject(iModel, modelId, categoryId));
    const elementId3: Id64String = iModel.elements.insertElement(IModelTestUtils.createPhysicalObject(iModel, modelId, categoryId));
    await iModel.concurrencyControl.request(managerRequestContext);
    iModel.saveChanges("Added test elements");

    // Setup the hierarchy as element3 -> element1
    const element3 = iModel.elements.getElement(elementId3);
    element3.parent = new ElementOwnsChildElements(elementId1);
    iModel.elements.updateElement(element3);
    iModel.saveChanges("Updated element1 as the parent of element3");

    // Push changes to the hub
    await iModel.pushChanges(managerRequestContext, "Setup test model");

    // Modify the hierarchy to element3 -> element2
    element3.parent = new ElementOwnsChildElements(elementId2);
    iModel.elements.updateElement(element3);
    iModel.saveChanges("Updated element2 as the parent of element3");

    // Push changes to the hub
    await iModel.pushChanges(managerRequestContext, "Updated parent element");

    // Validate that the second change summary captures the change to the parent correctly
    try {
      const changeSummaryIds = await ChangeSummaryManager.extractChangeSummaries(requestContext, iModel);
      assert.strictEqual(2, changeSummaryIds.length);

      ChangeSummaryManager.attachChangeCache(iModel);
      assert.isTrue(ChangeSummaryManager.isChangeCacheAttached(iModel));

      const changeSummaryJson = getChangeSummaryAsJson(iModel, changeSummaryIds[0]);
      // console.log(JSON.stringify(changeSummaryJson, undefined, 2));

      assert.strictEqual(changeSummaryJson.instanceChanges.length, 3);

      const instanceChange = changeSummaryJson.instanceChanges[0];
      assert.strictEqual(instanceChange.changedInstance.id, elementId3);
      assert.strictEqual(instanceChange.changedInstance.className, "[Generic].[PhysicalObject]");
      assert.strictEqual(instanceChange.before["parent.id"], elementId1);
      assert.strictEqual(instanceChange.after["parent.id"], elementId2);

      const modelChange = changeSummaryJson.instanceChanges[1];
      assert.strictEqual(modelChange.changedInstance.id, modelId);
      assert.strictEqual(modelChange.changedInstance.className, "[BisCore].[PhysicalModel]");
      assert.exists(modelChange.before.lastMod);
      assert.exists(modelChange.after.lastMod);

      const relInstanceChange = changeSummaryJson.instanceChanges[2];
      assert.strictEqual(relInstanceChange.changedInstance.className, "[BisCore].[ElementOwnsChildElements]");
      assert.strictEqual(relInstanceChange.before.sourceId, elementId1);
      assert.strictEqual(relInstanceChange.before.targetId, elementId3);
      assert.strictEqual(relInstanceChange.after.sourceId, elementId2);
      assert.strictEqual(relInstanceChange.after.targetId, elementId3);
    } finally {
      await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModel);
    }

    await IModelHost.hubAccess.deleteIModel({ requestContext, contextId: projectId, iModelId });
  });

  it.skip("should be able to extract the last change summary right after applying a change set", async () => {
    const userContext1 = await IModelTestUtils.getUserContext(TestUserType.Manager);
    const userContext2 = await IModelTestUtils.getUserContext(TestUserType.SuperManager);

    // User1 creates an iModel (on the Hub)
    const testUtility = new TestChangeSetUtility(userContext1, "ChangeSummaryTest");
    await testUtility.createTestIModel();

    // User2 opens the iModel
    const iModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: userContext2, contextId: testUtility.projectId, iModelId: testUtility.iModelId });

    // Attach change cache
    ChangeSummaryManager.attachChangeCache(iModel);
    assert.isTrue(ChangeSummaryManager.isChangeCacheAttached(iModel));

    // User1 pushes a change set
    await testUtility.pushTestChangeSet();

    // User2 applies the change set and extracts the change summary
    await iModel.pullAndMergeChanges(userContext2, IModelVersion.latest());

    const changeSummariesIds = await ChangeSummaryManager.extractChangeSummaries(userContext2, iModel, { currentVersionOnly: true });
    if (changeSummariesIds.length !== 1)
      throw new Error("ChangeSet summary extraction returned invalid ChangeSet summary IDs.");

    const changeSummaryId = changeSummariesIds[0];
    // const changeSummaryJson = getChangeSummaryAsJson(iModel, changeSummaryId);
    // console.log(JSON.stringify(changeSummaryJson, undefined, 2)); // eslint-disable-line

    iModel.withPreparedStatement(
      "SELECT ECInstanceId FROM ecchange.change.InstanceChange WHERE Summary.Id=? ORDER BY ECInstanceId",
      (sqlStatement: ECSqlStatement) => {
        sqlStatement.bindId(1, changeSummaryId);
        while (sqlStatement.step() === DbResult.BE_SQLITE_ROW) {
          const instanceChangeId = Id64.fromJSON(sqlStatement.getRow().id);
          const instanceChange = ChangeSummaryManager.queryInstanceChange(iModel, instanceChangeId);
          const changedInstanceClass = instanceChange.changedInstance.className;
          const isModelChange = changedInstanceClass === "[BisCore].[PhysicalModel]";
          const changedInstanceOp = instanceChange.opCode;
          const changedPropertyValueNames = ChangeSummaryManager.getChangedPropertyValueNames(iModel, instanceChangeId);
          assert.isNotEmpty(changedInstanceClass);
          assert.strictEqual(isModelChange ? ChangeOpCode.Update : ChangeOpCode.Insert, changedInstanceOp);
          assert.isAbove(changedPropertyValueNames.length, 0);
        }
      });
  });

});
