/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import * as fs from "fs-extra";
import * as path from "path";
import { ChangeSetApplyOption, Id64, Id64String, Logger, LogLevel, OpenMode } from "@bentley/bentleyjs-core";
import { Arc3d, IModelJson as GeomJson, Point3d } from "@bentley/geometry-core";
import {
  ChangeSet, ChangeSetQuery, ChangesType, CheckpointQuery, IModelHubClient, IModelHubError, IModelQuery, VersionQuery,
} from "@bentley/imodelhub-client";
import { Code, ColorDef, GeometryStreamProps, IModel, IModelVersion, SubCategoryAppearance } from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { TestUsers, TestUtility } from "@bentley/oidc-signin-tool";
import { Reporter } from "@bentley/perf-tools/lib/Reporter";
import {
  BriefcaseManager, ConcurrencyControl, DictionaryModel, Element, IModelDb, IModelHost, IModelJsNative, SpatialCategory, StandaloneDb,
} from "../imodeljs-backend";
import { IModelTestUtils } from "../test/IModelTestUtils";
import { HubUtility } from "../test/integration/HubUtility";
import { KnownTestLocations } from "../test/KnownTestLocations";
import { RevisionUtility } from "../test/RevisionUtility";
import { PerfTestUtility } from "./PerfTestUtils";
import { IModelHubBackend } from "../IModelHubBackend";

/* eslint-disable @typescript-eslint/naming-convention */

async function getIModelAfterApplyingCS(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string, imodelId: string, client: IModelHubClient) {
  const changeSets = await client.changeSets.get(requestContext, imodelId);
  const firstChangeSetId = changeSets[0].wsgId;
  const secondChangeSetId = changeSets[1].wsgId;

  const args = { requestContext, contextId: projectId, iModelId: imodelId };
  // open imodel first time from imodel-hub with first revision
  const startTime = new Date().getTime();
  const iModelDb = await IModelTestUtils.downloadAndOpenCheckpoint({ ...args, asOf: IModelVersion.asOfChangeSet(firstChangeSetId).toJSON() });
  const endTime = new Date().getTime();
  assert.exists(iModelDb);
  const elapsedTime = (endTime - startTime) / 1000.0;
  assert.strictEqual(iModelDb.changeset.id, firstChangeSetId);
  assert.strictEqual(iModelDb.changeset.index, parseInt(changeSets[0].index!, 10));
  iModelDb.close();
  reporter.addEntry("ImodelChangesetPerformance", "GetImodel", "Execution time(s)", elapsedTime, { Description: "from hub first CS", Operation: "Open" });

  // open imodel from local cache with second revision
  const startTime1 = new Date().getTime();
  const iModelDb1 = await IModelTestUtils.downloadAndOpenCheckpoint({ ...args, asOf: IModelVersion.asOfChangeSet(secondChangeSetId).toJSON() });
  const endTime1 = new Date().getTime();
  assert.exists(iModelDb1);
  const elapsedTime1 = (endTime1 - startTime1) / 1000.0;
  assert.strictEqual(iModelDb1.changeset.id, secondChangeSetId);
  assert.strictEqual(iModelDb.changeset.index, parseInt(changeSets[1].index!, 10));
  iModelDb1.close();
  reporter.addEntry("ImodelChangesetPerformance", "GetImodel", "Execution time(s)", elapsedTime1, { Description: "from cache second CS", Operation: "Open" });

  // open imodel from local cache with first revision
  const startTime2 = new Date().getTime();
  const iModelDb2 = await IModelTestUtils.downloadAndOpenCheckpoint({ ...args, asOf: IModelVersion.first().toJSON() });
  const endTime2 = new Date().getTime();
  assert.exists(iModelDb2);
  const elapsedTime2 = (endTime2 - startTime2) / 1000.0;
  iModelDb2.close();
  reporter.addEntry("ImodelChangesetPerformance", "GetImodel", "Execution time(s)", elapsedTime2, { Description: "from cache first CS", Operation: "Open" });

  // open imodel from local cache with latest revision
  const startTime3 = new Date().getTime();
  const iModelDb3 = await IModelTestUtils.downloadAndOpenCheckpoint({ ...args, asOf: IModelVersion.named("latest").toJSON() });
  const endTime3 = new Date().getTime();
  assert.exists(iModelDb3);
  const elapsedTime3 = (endTime3 - startTime3) / 1000.0;
  iModelDb3.close();
  reporter.addEntry("ImodelChangesetPerformance", "GetImodel", "Execution time(s)", elapsedTime3, { Description: "from cache latest CS", Operation: "Open" });
}

async function pushIModelAfterMetaChanges(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string, imodelPushId: string) {
  const iModelPullAndPush = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: projectId, iModelId: imodelPushId });
  assert.exists(iModelPullAndPush);
  iModelPullAndPush.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());

  // get the time of applying a meta data change on an imodel
  const startTime = new Date().getTime();
  const rootEl: Element = iModelPullAndPush.elements.getRootSubject();
  rootEl.userLabel = `${rootEl.userLabel}changed`;
  iModelPullAndPush.elements.updateElement(rootEl);
  await iModelPullAndPush.concurrencyControl.request(requestContext);
  iModelPullAndPush.saveChanges("user changes root subject of the imodel");
  const endTime = new Date().getTime();
  const elapsedTime = (endTime - startTime) / 1000.0;
  reporter.addEntry("ImodelChangesetPerformance", "PushMetaChangeToHub", "Execution time(s)", elapsedTime, { Description: "make meta changes", Operation: "Update" });

  try {
    // get the time to push a meta data change of an imodel to imodel hub
    const startTime1 = new Date().getTime();
    await iModelPullAndPush.pushChanges(requestContext, "test change");
    const endTime1 = new Date().getTime();
    const elapsedTime1 = (endTime1 - startTime1) / 1000.0;
    reporter.addEntry("ImodelChangesetPerformance", "PushMetaChangeToHub", "Execution time(s)", elapsedTime1, { Description: "meta changes to hub", Operation: "Push" });
  } catch (error) { }

  await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, iModelPullAndPush);
}

async function createNewModelAndCategory(requestContext: AuthorizedClientRequestContext, rwIModel: IModelDb) {
  // Create a new physical model.
  const [, modelId] = IModelTestUtils.createAndInsertPhysicalPartitionAndModel(rwIModel, IModelTestUtils.getUniqueModelCode(rwIModel, "newPhysicalModel"), true);

  // Find or create a SpatialCategory.
  const dictionary: DictionaryModel = rwIModel.models.getModel(IModel.dictionaryId);
  const newCategoryCode = IModelTestUtils.getUniqueSpatialCategoryCode(dictionary, "ThisTestSpatialCategory");
  const spatialCategoryId: Id64String = SpatialCategory.insert(rwIModel, IModel.dictionaryId, newCategoryCode.value, new SubCategoryAppearance({ color: 0xff0000 }));

  // Reserve all of the codes that are required by the new model and category.
  try {
    if (rwIModel.isBriefcaseDb()) {
      await rwIModel.concurrencyControl.request(requestContext);
      requestContext.enter();
    }
  } catch (err) {
    if (err instanceof IModelHubError) {
      assert.fail(JSON.stringify(err));
    }
  }

  return { modelId, spatialCategoryId };
}

async function pushIModelAfterDataChanges(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string) {
  const iModelName = "CodesPushTest";
  // delete any existing imodel with given name
  const iModels = await IModelHubBackend.iModelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
  for (const iModelTemp of iModels) {
    await IModelHost.hubAccess.deleteIModel({ requestContext, contextId: projectId, iModelId: iModelTemp.id! });
  }
  // create new imodel with given name
  const rwIModelId = await IModelHost.hubAccess.createIModel({ requestContext, contextId: projectId, iModelName, description: "TestSubject" });
  assert.isNotEmpty(rwIModelId);
  const rwIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: projectId, iModelId: rwIModelId });

  // create new model, category and physical element, and insert in imodel
  rwIModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
  const r: { modelId: Id64String, spatialCategoryId: Id64String } = await createNewModelAndCategory(requestContext, rwIModel);
  rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, r.modelId, r.spatialCategoryId));
  rwIModel.saveChanges("User created model, category and one physical element");

  // get the time to push a data change of an imodel to imodel hub
  const startTime1 = new Date().getTime();
  await rwIModel.pushChanges(requestContext, "test change").catch(() => { });
  const endTime1 = new Date().getTime();
  const elapsedTime1 = (endTime1 - startTime1) / 1000.0;
  reporter.addEntry("ImodelChangesetPerformance", "PushDataChangeToHub", "Execution time(s)", elapsedTime1, { Description: "data changes to hub", Operation: "Push" });
  await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, rwIModel);
}

async function pushIModelAfterSchemaChanges(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string) {
  const iModelName = "SchemaPushTest";
  // delete any existing imodel with given name
  const iModels = await IModelHubBackend.iModelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
  for (const iModelTemp of iModels) {
    await IModelHost.hubAccess.deleteIModel({ requestContext, contextId: projectId, iModelId: iModelTemp.id! });
  }
  // create new imodel with given name
  const rwIModelId = await IModelHost.hubAccess.createIModel({ requestContext, contextId: projectId, iModelName, description: "TestSubject" });
  assert.isNotEmpty(rwIModelId);
  const rwIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: projectId, iModelId: rwIModelId });

  assert.isNotEmpty(rwIModelId);
  // import schema and push change to hub
  const schemaPathname = path.join(KnownTestLocations.assetsDir, "PerfTestDomain.ecschema.xml");
  rwIModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
  await rwIModel.importSchemas(requestContext, [schemaPathname]).catch(() => { });
  assert.isDefined(rwIModel.getMetaData("PerfTestDomain:" + "PerfElement"), "PerfElement" + "is present in iModel.");
  await rwIModel.concurrencyControl.request(requestContext);
  rwIModel.saveChanges("schema change pushed");
  await rwIModel.pullAndMergeChanges(requestContext);
  const startTime1 = new Date().getTime();
  await rwIModel.pushChanges(requestContext, "test change");
  const endTime1 = new Date().getTime();
  const elapsedTime1 = (endTime1 - startTime1) / 1000.0;
  reporter.addEntry("ImodelChangesetPerformance", "PushSchemaChangeToHub", "Execution time(s)", elapsedTime1, { Description: "schema changes to hub", Operation: "Push" });
  await IModelTestUtils.closeAndDeleteBriefcaseDb(requestContext, rwIModel);
}

const getElementCount = (iModel: IModelDb): number => {
  const rows: any[] = IModelTestUtils.executeQuery(iModel, "SELECT COUNT(*) AS cnt FROM bis.Element");
  const count = + rows[0].cnt;
  return count;
};

async function executeQueryTime(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string, imodelId: string) {
  const iModelDb = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: projectId, iModelId: imodelId, asOf: IModelVersion.named("latest").toJSON() });
  assert.exists(iModelDb);
  const startTime = new Date().getTime();
  const stat = IModelTestUtils.executeQuery(iModelDb, "SELECT * FROM BisCore.LineStyle");
  const endTime = new Date().getTime();
  const elapsedTime1 = (endTime - startTime) / 1000.0;
  assert.equal(7, stat.length);
  reporter.addEntry("ImodelChangesetPerformance", "ExecuteQuery", "Execution time(s)", elapsedTime1, { Description: "execute a simple ECSQL query", Operation: "ExecuteQuery" });
  iModelDb.close();
}

async function reverseChanges(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string) {
  const iModelName = "reverseChangeTest";
  // delete any existing imodel with given name
  const iModels = await IModelHubBackend.iModelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
  for (const iModelTemp of iModels)
    await IModelHost.hubAccess.deleteIModel({ requestContext, contextId: projectId, iModelId: iModelTemp.id! });

  // create new imodel with given name
  const rwIModelId = await IModelHost.hubAccess.createIModel({ requestContext, contextId: projectId, iModelName, description: "TestSubject" });
  assert.isNotEmpty(rwIModelId);
  const rwIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: projectId, iModelId: rwIModelId });

  // create new model, category and physical element, and insert in imodel, and push these changes
  rwIModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
  const r: { modelId: Id64String, spatialCategoryId: Id64String } = await createNewModelAndCategory(requestContext, rwIModel);
  rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, r.modelId, r.spatialCategoryId));
  rwIModel.saveChanges("User created model, category and one physical element");
  await rwIModel.pushChanges(requestContext, "test change").catch(() => { });
  const firstCount = getElementCount(rwIModel);
  assert.equal(firstCount, 7);

  let i = 0;
  while (i < 4) {
    rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, r.modelId, r.spatialCategoryId));
    i = i + 1;
  }
  rwIModel.saveChanges("added more elements to imodel");
  await rwIModel.pushChanges(requestContext, "test change").catch(() => { });
  const secondCount = getElementCount(rwIModel);
  assert.equal(secondCount, 11);

  const iModelId = await HubUtility.queryIModelIdByName(requestContext, projectId, "reverseChangeTest");
  const changeSets = await IModelHost.hubAccess.queryChangesets({ requestContext, iModelId });
  const firstChangeSetId = changeSets[0].id;
  const startTime = new Date().getTime();
  await rwIModel.reverseChanges(requestContext, IModelVersion.asOfChangeSet(firstChangeSetId));// eslint-disable-line deprecation/deprecation
  const endTime = new Date().getTime();
  const elapsedTime1 = (endTime - startTime) / 1000.0;

  const reverseCount = getElementCount(rwIModel);
  assert.equal(reverseCount, firstCount);

  reporter.addEntry("ImodelChangesetPerformance", "ReverseChanges", "Execution time(s)", elapsedTime1, { Description: "reverse the imodel to first CS from latest", Operation: "ReverseChanges" });
  rwIModel.close();
}

async function reinstateChanges(requestContext: AuthorizedClientRequestContext, reporter: Reporter, projectId: string) {
  const iModelName = "reinstateChangeTest";
  // delete any existing imodel with given name
  const iModels = await IModelHubBackend.iModelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
  for (const iModelTemp of iModels)
    await IModelHost.hubAccess.deleteIModel({ requestContext, contextId: projectId, iModelId: iModelTemp.id! });

  // create new imodel with given name
  const rwIModelId = await IModelHost.hubAccess.createIModel({ requestContext, contextId: projectId, iModelName, description: "TestSubject" });
  assert.isNotEmpty(rwIModelId);
  const rwIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: projectId, iModelId: rwIModelId });

  // create new model, category and physical element, and insert in imodel, and push these changes
  rwIModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
  const r: { modelId: Id64String, spatialCategoryId: Id64String } = await createNewModelAndCategory(requestContext, rwIModel);
  rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, r.modelId, r.spatialCategoryId));
  rwIModel.saveChanges("User created model, category and one physical element");
  await rwIModel.pushChanges(requestContext, "test change").catch(() => { });
  const firstCount = getElementCount(rwIModel);
  assert.equal(firstCount, 7);

  let i = 0;
  while (i < 4) {
    rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, r.modelId, r.spatialCategoryId));
    i = i + 1;
  }
  rwIModel.saveChanges("added more elements to imodel");
  await rwIModel.pushChanges(requestContext, "test change").catch(() => { });
  const secondCount = getElementCount(rwIModel);
  assert.equal(secondCount, 11);

  const iModelId = await HubUtility.queryIModelIdByName(requestContext, projectId, iModelName);
  const changeSets = await IModelHost.hubAccess.queryChangesets({ requestContext, iModelId });
  const firstChangeSetId = changeSets[0].id;
  await rwIModel.reverseChanges(requestContext, IModelVersion.asOfChangeSet(firstChangeSetId));// eslint-disable-line deprecation/deprecation
  const reverseCount = getElementCount(rwIModel);
  assert.equal(reverseCount, firstCount);

  const startTime = new Date().getTime();
  await rwIModel.reinstateChanges(requestContext, IModelVersion.latest());// eslint-disable-line deprecation/deprecation
  const endTime = new Date().getTime();
  const elapsedTime1 = (endTime - startTime) / 1000.0;
  const reinstateCount = getElementCount(rwIModel);
  assert.equal(reinstateCount, secondCount);

  reporter.addEntry("ImodelChangesetPerformance", "ReinstateChanges", "Execution time(s)", elapsedTime1, { Description: "reinstate the imodel to latest CS from first", Operation: "ReinstateChanges" });
  rwIModel.close();
}

describe("ImodelChangesetPerformance", () => {
  const reporter = new Reporter();
  let projectId: string;
  let imodelId: string;
  let imodelPushId: string;
  let client: IModelHubClient;
  let requestContext: AuthorizedClientRequestContext;

  before(async () => {
    if (!fs.existsSync(KnownTestLocations.outputDir))
      fs.mkdirSync(KnownTestLocations.outputDir);
    const configData = require(path.join(__dirname, "CSPerfConfig.json")); // eslint-disable-line @typescript-eslint/no-var-requires
    projectId = configData.basicTest.projectId;
    imodelId = configData.basicTest.imodelId;
    imodelPushId = configData.basicTest.imodelPushId;

    client = new IModelHubClient();

    requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
  });

  after(() => {
    const csvPath1 = path.join(KnownTestLocations.outputDir, "BackendOnlyPerfTest.csv");
    reporter.exportCSV(csvPath1);
  });

  it("GetImodel", async () => {
    await getIModelAfterApplyingCS(requestContext, reporter, projectId, imodelId, client).catch(() => { });
  });

  it("PushMetaChangeToHub", async () => {
    await pushIModelAfterMetaChanges(requestContext, reporter, projectId, imodelPushId).catch(() => { });
  });

  it("PushDataChangeToHub", async () => {
    await pushIModelAfterDataChanges(requestContext, reporter, projectId).catch(() => { });
  });

  it("PushSchemaChangeToHub", async () => {
    await pushIModelAfterSchemaChanges(requestContext, reporter, projectId).catch(() => { });
  });

  it("ExecuteQuery", async () => {
    await executeQueryTime(requestContext, reporter, projectId, imodelId).catch(() => { });
  });

  it("ReverseChanges", async () => {
    await reverseChanges(requestContext, reporter, projectId).catch(() => { });
  });

  it("ReinstateChanges", async () => {
    await reinstateChanges(requestContext, reporter, projectId).catch(() => { });
  });

});

describe("ImodelChangesetPerformance big datasets", () => {
  let iModelRootDir: string;
  const configData = require(path.join(__dirname, "CSPerfConfig.json")); // eslint-disable-line @typescript-eslint/no-var-requires
  const csvPath = path.join(KnownTestLocations.outputDir, "ApplyCSLocalPerf.csv");

  before(async () => {
    iModelRootDir = configData.rootDir;
    if (!fs.existsSync(KnownTestLocations.outputDir))
      fs.mkdirSync(KnownTestLocations.outputDir);
  });
  function getChangesetSummary(changeSets: ChangeSet[]): {} {
    const schemaChanges = changeSets.filter((obj) => obj.changesType === ChangesType.Schema);
    const dataChanges = changeSets.filter((obj) => obj.changesType !== ChangesType.Schema);
    const csSummary = {
      count: changeSets.length,
      fileSizeKB: Math.round(changeSets.reduce((prev, cs) => prev + Number(cs.fileSize), 0) / 1024),
      schemaChanges: {
        count: schemaChanges.length,
        fileSizeKB: Math.round(schemaChanges.reduce((prev, cs) => prev + Number(cs.fileSize), 0) / 1024),
      },
      nonSchemaChanges: {
        count: dataChanges.length,
        fileSizeKB: Math.round(dataChanges.reduce((prev, cs) => prev + Number(cs.fileSize), 0) / 1024),
      },
    };
    return csSummary;
  }

  async function downloadChangesets(requestContext: AuthorizedClientRequestContext, imodelId: string, changeSets: ChangeSet[], downloadDir: string) {
    if (fs.existsSync(downloadDir))
      fs.removeSync(downloadDir);
    // get first changeset as betweenChangeSets skips the first entry
    const csQuery1 = new ChangeSetQuery();
    csQuery1.byId(changeSets[0].id!);
    await IModelHubBackend.iModelClient.changeSets.download(requestContext, imodelId, csQuery1, downloadDir);
    const incr: number = 100;
    for (let j = 0; j <= changeSets.length; j = j + incr) {
      const csQuery = new ChangeSetQuery();
      if ((j + incr) < changeSets.length)
        csQuery.betweenChangeSets(changeSets[j].id!, changeSets[j + incr].id);
      else
        csQuery.betweenChangeSets(changeSets[j].id!, changeSets[changeSets.length - 1].id);
      csQuery.selectDownloadUrl();

      requestContext.enter();
      await IModelHubBackend.iModelClient.changeSets.download(requestContext, imodelId, csQuery, downloadDir);
    }
  }
  async function setupIModel(modelInfo: any) {
    const downloadDir: string = path.join(iModelRootDir, modelInfo.modelName);
    // if folder exists, we'll just use the local copy
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir);
    }
    const requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);

    // first get all info and save it
    const iModel = await HubUtility.queryIModelByName(requestContext, modelInfo.projId, modelInfo.modelName);
    if (!iModel)
      throw new Error(`IModel with id ${modelInfo.modelId} not found`);

    fs.writeFileSync(path.join(downloadDir, "imodel.json"), JSON.stringify(iModel, undefined, 4));

    const changeSets = await IModelHubBackend.iModelClient.changeSets.get(requestContext, modelInfo.modelId);
    fs.writeFileSync(path.join(downloadDir, "changeSets.json"), JSON.stringify(changeSets, undefined, 4));

    const query = new VersionQuery();
    query.orderBy("createdDate");
    const namedVers = await IModelHubBackend.iModelClient.versions.get(requestContext, modelInfo.modelId, query);
    fs.writeFileSync(path.join(downloadDir, "namedVersions.json"), JSON.stringify(namedVers, undefined, 4));

    const query2 = new CheckpointQuery();
    const checkpoints = await IModelHubBackend.iModelClient.checkpoints.get(requestContext, modelInfo.modelId, query2);
    fs.writeFileSync(path.join(downloadDir, "checkPoints.json"), JSON.stringify(checkpoints, undefined, 4));

    const modelSummary = {
      iModelInfo: modelInfo,
      changesetSummary: getChangesetSummary(changeSets),
      namedVersions: {
        count: namedVers.length,
        latest: namedVers[0],
      },
      checkPoints: {
        count: checkpoints.length,
        latest: checkpoints[0],
      },
    };
    fs.writeFileSync(path.join(downloadDir, "summary.json"), JSON.stringify(modelSummary, undefined, 4));

    // now download the seed file, if not there
    const seedPathname = path.join(downloadDir, "seed", modelInfo.modelName!.concat(".bim"));
    if (!fs.existsSync(seedPathname))
      await IModelHubBackend.iModelClient.iModels.download(requestContext, modelInfo.modelId, seedPathname);

    // now download changesets. first check if there are some, then download only newer ones
    const csDir = path.join(downloadDir, "changeSets");
    if (!fs.existsSync(csDir)) {
      await downloadChangesets(requestContext, modelInfo.modelId, changeSets, csDir);
    } else {
      // delete the temp files
      const tempFiles = fs.readdirSync(csDir).filter((fileName) => !fileName.endsWith(".cs"));
      for (const tempFile of tempFiles) {
        fs.removeSync(path.join(csDir, tempFile));
      }

      const csFiles = fs.readdirSync(csDir).filter((fileName) => fileName.endsWith(".cs"));
      // if more than 80% files are there, download the missing ones
      if ((csFiles.length / changeSets.length) > 0.8) {
        // download missing changeset files
        const missingChangesets = changeSets.filter((el) => {
          return !csFiles.find((obj) => obj === el.fileName);
        });
        for (const cs of missingChangesets) {
          const csQuery = new ChangeSetQuery();
          csQuery.byId(cs.id!);
          await IModelHubBackend.iModelClient.changeSets.download(requestContext, modelInfo.modelId, csQuery, csDir);
        }
      } else {
        // download all again
        await downloadChangesets(requestContext, modelInfo.modelId, changeSets, csDir);
      }
    }
  }

  function getStats(changesetFilePath: string) {
    const stats = RevisionUtility.computeStatistics(changesetFilePath, true);
    const details = {
      rowsDeleted: stats.statistics.byOp.rowDeleted,
      rowsInserted: stats.statistics.byOp.rowInserted,
      rowsUpdated: stats.statistics.byOp.rowsUpdated,
      rowsChanged: stats.statistics.rowsChanged,
      tablesChanged: stats.statistics.tablesChanged,
      schemaChangesTable: 0,
      schemaChangesIndex: 0,
    };
    if (stats.hasSchemaChanges) {
      const parts: string[] = stats.schemaChanges.toString().split(";");
      const indexParts = parts.filter((obj) => obj.includes("INDEX"));
      const tableParts = parts.filter((obj) => obj.includes("TABLE"));

      details.schemaChangesTable = tableParts.length;
      details.schemaChangesIndex = indexParts.length;
    }
    return details;
  }

  it.skip("ApplyChangeset Get from iModelHub", async () => {
    const csvPath1 = path.join(KnownTestLocations.outputDir, "ApplyCSPerf.csv");
    const reporter = new Reporter();
    const batchSize: number = 50;
    for (const ds of configData.bigDatasets) {
      const projectId: string = ds.projId;
      const imodelId: string = ds.modelId;

      const client: IModelHubClient = new IModelHubClient();
      let requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
      const changeSets = await client.changeSets.get(requestContext, imodelId);
      const startNum: number = ds.csStart ? ds.csStart : 0;
      const endNum: number = ds.csEnd ? ds.csEnd : changeSets.length;
      const modelInfo = {
        projId: projectId,
        projName: ds.projName,
        modelId: imodelId,
        modelName: ds.modelName,
      };

      const firstChangeSetId = changeSets[startNum].wsgId;
      const iModelDb = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: projectId, iModelId: imodelId, asOf: IModelVersion.asOfChangeSet(firstChangeSetId).toJSON() });

      for (let j = startNum; j < endNum; ++j) {
        const cs: ChangeSet = changeSets[j];
        let apply: boolean = false;
        if (ds.csType === "All") {
          apply = true;
        } else {
          if (ds.csType === cs.changesType) {
            apply = true;
          }
        }
        if (apply) {
          // eslint-disable-next-line no-console
          console.log(`For iModel: ${ds.modelName}: Applying changeset: ${(j + 1).toString()} / ${endNum.toString()}`);
          requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
          const startTime = new Date().getTime();
          await iModelDb.pullAndMergeChanges(requestContext, IModelVersion.asOfChangeSet(cs.wsgId));
          const endTime = new Date().getTime();
          const elapsedTime = (endTime - startTime) / 1000.0;

          const csInfo = {
            GUID: cs.wsgId,
            fileSize: cs.fileSize,
            type: cs.changesType,
            desc: cs.description,
          };
          reporter.addEntry("ImodelChangesetPerformance", "ApplyChangeset", "Time(s)", elapsedTime, { csNum: j, csDetail: csInfo, modelDetail: modelInfo });
        }
        if (j % batchSize === 0) { // After few runs write results in case test fails
          reporter.exportCSV(csvPath1);
          reporter.clearEntries();
        }
      }
      iModelDb.close();
      reporter.exportCSV(csvPath1);
      reporter.clearEntries();
    }
  });

  it("ApplyChangeset Local", async () => {
    Logger.initializeToConsole();
    Logger.setLevelDefault(LogLevel.Error);
    Logger.setLevel("HubUtility", LogLevel.Info);
    Logger.setLevel("Performance", LogLevel.Info);

    for (const ds of configData.bigDatasets) {
      const modelInfo = {
        projId: ds.projId,
        projName: ds.projName,
        modelId: ds.modelId,
        modelName: ds.modelName,
      };
      const csStart = ds.csStart;
      const csEnd = ds.csEnd;
      const iModelDir: string = path.join(iModelRootDir, modelInfo.modelName);
      if (ds.setup)
        await setupIModel(modelInfo);
      const results = HubUtility.getApplyChangeSetTime(iModelDir, csStart, csEnd);

      const changeSetJsonPathname = path.join(iModelDir, "changeSets.json");
      const jsonStr = fs.readFileSync(changeSetJsonPathname).toString();
      const changeSetsJson = JSON.parse(jsonStr);

      const changesetsInfo = [];
      for (const changeSetJson of changeSetsJson) {
        changesetsInfo.push(changeSetJson);
      }

      const reporter = new Reporter();
      for (const result of results) {
        const csDetail = changesetsInfo.filter((obj) => obj.id === result.csId);
        const csInfo = {
          GUID: result.csId,
          fileSize: csDetail[0].fileSize,
          type: ChangesType[csDetail[0].changesType],
          desc: csDetail[0].description,
        };
        const stats = getStats(path.join(iModelDir, "changeSets", `${result.csId}.cs`));
        reporter.addEntry("ImodelChangesetPerformance", "ApplyChangesetLocal", "Time(s)", result.time, { csNum: result.csNum, csDetail: csInfo, csStats: stats, modelDetail: modelInfo });
      }
      reporter.exportCSV(csvPath);
    }
  });
});

describe("ImodelChangesetPerformance own data", () => {
  const seedVersionName: string = "Seed data";
  let requestContext: AuthorizedClientRequestContext;
  const outDir: string = path.join(KnownTestLocations.outputDir, "ChangesetPerfOwn");
  const csvPath = path.join(KnownTestLocations.outputDir, "ApplyCSPerfOwnData.csv");
  const reporter = new Reporter();
  const configData = require(path.join(__dirname, "CSPerfConfig.json")); // eslint-disable-line @typescript-eslint/no-var-requires
  const dbSize: number = configData.ownDataTest.dbSize;
  const iModelNameBase: string = `CS_Lg3d_PElSub3_${dbSize}_`;
  const opSizes: number[] = configData.ownDataTest.opSizes;
  const baseNames: string[] = configData.ownDataTest.baseNames;
  const projectId: string = configData.ownDataTest.projectId;
  const schemaDetail = configData.ownDataTest.schema;
  const schemaName: string = schemaDetail.name;
  const baseClassName: string = schemaDetail.baseName;
  const hier: number = schemaDetail.hierarchy;
  const className: string = `${baseClassName}Sub${(hier - 1).toString()}`;

  async function setupLocalIModel(projId: string, modelId: string, localPath: string) {
    requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
    const iModelDb = await IModelTestUtils.downloadAndOpenCheckpoint({ requestContext, contextId: projId, iModelId: modelId, asOf: IModelVersion.named(seedVersionName).toJSON() });
    const pathName = iModelDb.pathName;
    iModelDb.close();
    if (fs.existsSync(localPath))
      fs.copySync(pathName, localPath);

    const nativeDb = new IModelHost.platform.DgnDb();
    nativeDb.openIModel(localPath, OpenMode.ReadWrite);
    nativeDb.saveLocalValue("StandaloneEdit", "");
    nativeDb.saveChanges();
    nativeDb.closeIModel();
  }

  async function lastChangesetToken(modelId: string): Promise<IModelJsNative.ChangesetFileProps> {
    requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
    const changeSets = await IModelHubBackend.iModelClient.changeSets.get(requestContext, modelId);
    const changeSet = changeSets[changeSets.length - 1];
    const query = new ChangeSetQuery();
    query.byId(changeSet.wsgId);
    const downloadDir = path.join(BriefcaseManager.cacheDir, modelId, "csets");
    await IModelHubBackend.iModelClient.changeSets.download(requestContext, modelId, query, downloadDir);
    const pathname = path.join(downloadDir, changeSet.fileName!);
    return { id: changeSet.id!, parentId: changeSet.parentId!, pathname, changesType: changeSet.changesType!, index: +changeSet.index!, pushDate: "", userCreated: "", briefcaseId: 0, description: "" };
  }

  before(async () => {
    Logger.initializeToConsole();
    // Logger.setLevelDefault(LogLevel.Error);
    Logger.setLevel("HubUtility", LogLevel.Info);
    // Logger.setLevel("Performance", LogLevel.Info);

    if (!fs.existsSync(KnownTestLocations.outputDir))
      fs.mkdirSync(KnownTestLocations.outputDir);
    if (!fs.existsSync(outDir))
      fs.mkdirSync(outDir);

    requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
    for (const opSize of opSizes) {
      for (const baseName of baseNames) {
        const iModelName = `${iModelNameBase + baseName}_${opSize.toString()}`;
        const iModels = await IModelHubBackend.iModelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
        if (iModels.length === 0) {
          // create iModel and push changesets 1) with schema 2) with 1M records of PerfElementSub3 3) insert of opSize for actual testing
          // eslint-disable-next-line no-console
          console.log(`iModel ${iModelName} does not exist on iModelHub. Creating with changesets...`);
          const imodelId = await IModelHost.hubAccess.createIModel({ requestContext, contextId: projectId, iModelName, description: "TestSubject" });
          const iModelDb = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext, contextId: projectId, iModelId: imodelId });

          const schemaPathname = path.join(outDir, `${schemaName}.01.00.00.ecschema.xml`);
          const sxml: string = PerfTestUtility.genSchemaXML(schemaName, baseClassName, hier, true, true, []);
          fs.writeFileSync(schemaPathname, sxml);

          iModelDb.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
          await iModelDb.importSchemas(requestContext, [schemaPathname]).catch(() => { });
          assert.isDefined(iModelDb.getMetaData(`${schemaName}:${baseClassName}`), `${baseClassName} is not present in iModel.`);
          await iModelDb.concurrencyControl.request(requestContext);
          iModelDb.saveChanges("schema changes");
          await iModelDb.pullAndMergeChanges(requestContext);
          await iModelDb.pushChanges(requestContext, "perf schema import");

          // seed with existing elements
          iModelDb.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
          const [, newModelId] = IModelTestUtils.createAndInsertPhysicalPartitionAndModel(iModelDb, Code.createEmpty(), true);
          let spatialCategoryId = SpatialCategory.queryCategoryIdByName(iModelDb, IModel.dictionaryId, "MySpatialCategory");
          if (undefined === spatialCategoryId)
            spatialCategoryId = SpatialCategory.insert(iModelDb, IModel.dictionaryId, "MySpatialCategory", new SubCategoryAppearance({ color: ColorDef.fromString("rgb(255,0,0)").toJSON() }));

          requestContext.enter();
          for (let m = 0; m < dbSize; ++m) {
            const elementProps = PerfTestUtility.initElemProps(`${schemaName}:${className}`, iModelDb, newModelId, spatialCategoryId);
            const geomElement = iModelDb.elements.createElement(elementProps);
            const id = iModelDb.elements.insertElement(geomElement);
            assert.isTrue(Id64.isValidId64(id), "insert failed");
          }
          requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
          await iModelDb.concurrencyControl.request(requestContext);
          iModelDb.saveChanges();
          await iModelDb.pushChanges(requestContext, `Seed data for ${className}`);

          // create named version here
          const changeSets = await IModelHubBackend.iModelClient.changeSets.get(requestContext, imodelId);
          const lastCSId = changeSets[changeSets.length - 1].wsgId;
          const seedData = await IModelHubBackend.iModelClient.versions.create(requestContext, imodelId, lastCSId, seedVersionName);
          assert.equal(seedData.name, seedVersionName);

          const minId: number = PerfTestUtility.getMinId(iModelDb, "bis.PhysicalElement");
          const elementIdIncrement = Math.floor(dbSize / opSize);

          switch (baseName) {
            case "I": // create changeset with insert operation
              for (let m = 0; m < opSize; ++m) {
                const elementProps = PerfTestUtility.initElemProps(`${schemaName}:${className}`, iModelDb, newModelId, spatialCategoryId);
                const geomElement = iModelDb.elements.createElement(elementProps);
                const id = iModelDb.elements.insertElement(geomElement);
                assert.isTrue(Id64.isValidId64(id), "insert failed");
              }
              requestContext.enter();
              await iModelDb.concurrencyControl.request(requestContext);
              iModelDb.saveChanges();
              await iModelDb.pushChanges(requestContext, `${className} inserts: ${opSize}`);
              break;
            case "D": // create changeset with Delete operation
              for (let i = 0; i < opSize; ++i) {
                try {
                  const elId = minId + elementIdIncrement * i;
                  iModelDb.elements.deleteElement(Id64.fromLocalAndBriefcaseIds(elId, 0));
                } catch (err) {
                  assert.isTrue(false);
                }
              }
              requestContext.enter();
              await iModelDb.concurrencyControl.request(requestContext);
              iModelDb.saveChanges();
              await iModelDb.pushChanges(requestContext, `${className} deletes: ${opSize}`);
              break;
            case "U": // create changeset with Update operation
              const geomArray: Arc3d[] = [
                Arc3d.createXY(Point3d.create(0, 0), 2),
                Arc3d.createXY(Point3d.create(5, 5), 5),
                Arc3d.createXY(Point3d.create(-5, -5), 10),
              ];

              const geometryStream: GeometryStreamProps = [];
              for (const geom of geomArray) {
                const arcData = GeomJson.Writer.toIModelJson(geom);
                geometryStream.push(arcData);
              }
              for (let i = 0; i < opSize; ++i) {
                const elId = minId + elementIdIncrement * i;
                const editElem: Element = iModelDb.elements.getElement(Id64.fromLocalAndBriefcaseIds(elId, 0));
                (editElem as any).baseStr = "PerfElement - UpdatedValue";
                editElem.setUserProperties("geom", geometryStream);
                try {
                  iModelDb.elements.updateElement(editElem);
                } catch (_err) {
                  assert.fail("Element.update failed");
                }
              }
              requestContext.enter();
              await iModelDb.concurrencyControl.request(requestContext);
              iModelDb.saveChanges();
              await iModelDb.pushChanges(requestContext, `${className} updates: ${opSize}`);
              break;
            default:
              break;
          }

          iModelDb.close();
        } else {
          // eslint-disable-next-line no-console
          console.log(`iModel ${iModelName} exists on iModelHub`);
        }
      }
    }
  });
  it("InsertChangeset", async () => {
    for (const opSize of opSizes) {
      const iModelName = `${iModelNameBase}I_${opSize.toString()}`;
      const iModels = await IModelHubBackend.iModelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
      const iModel = iModels.find((im) => im.name === iModelName);
      if (iModel) {
        // eslint-disable-next-line no-console
        console.log(`Downloading iModel ${iModelName} from iModelHub.`);
        const iModelPathname = path.join(BriefcaseManager.cacheDir, iModel.id!, `${iModelName}_insert.bim`);
        await setupLocalIModel(projectId, iModel.id!, iModelPathname);
        const saIModel: StandaloneDb = StandaloneDb.openFile(iModelPathname, OpenMode.ReadWrite);
        // download last changeset file
        const csToken = await lastChangesetToken(iModel.id!);
        const applyOption = ChangeSetApplyOption.Merge;
        // eslint-disable-next-line no-console
        console.log(`Applying Insert changeset to iModel ${iModelName}.`);
        requestContext = await TestUtility.getAuthorizedClientRequestContext(TestUsers.regular);
        try {
          const startTime = new Date().getTime();
          saIModel.nativeDb.applyChangeset(csToken, applyOption);
          const endTime = new Date().getTime();
          const elapsedTime = (endTime - startTime) / 1000.0;
          reporter.addEntry("ImodelChangesetPerformance", "ChangesetInsert", "Time(s)", elapsedTime, { ElementClassName: "PerfElementSub3", InitialCount: dbSize, opCount: opSize });
        } catch (error) {
          assert.isTrue(false, "Apply changeset failed");
        }
        saIModel.saveChanges();
        saIModel.close();
      }
    }
    reporter.exportCSV(csvPath);
  });
  it("DeleteChangeset", async () => {
    for (const opSize of opSizes) {
      const iModelName = `${iModelNameBase}D_${opSize.toString()}`;
      const iModels = await IModelHubBackend.iModelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
      const iModel = iModels.find((im) => im.name === iModelName);
      if (iModel) {
        // eslint-disable-next-line no-console
        console.log(`Downloading iModel ${iModelName} from iModelHub.`);
        const iModelPathname = path.join(BriefcaseManager.cacheDir, iModel.id!, `${iModelName}_delete.bim`);
        await setupLocalIModel(projectId, iModel.id!, iModelPathname);
        const saIModel: StandaloneDb = StandaloneDb.openFile(iModelPathname, OpenMode.ReadWrite);
        // download last changeset file
        const csToken = await lastChangesetToken(iModel.id!);
        const applyOption = ChangeSetApplyOption.Merge;
        // eslint-disable-next-line no-console
        console.log(`Applying Delete changeset to iModel ${iModelName}.`);
        try {
          const startTime = new Date().getTime();
          saIModel.nativeDb.applyChangeset(csToken, applyOption);
          const endTime = new Date().getTime();
          const elapsedTime = (endTime - startTime) / 1000.0;
          reporter.addEntry("ImodelChangesetPerformance", "ChangesetDelete", "Time(s)", elapsedTime, { ElementClassName: "PerfElementSub3", InitialCount: dbSize, opCount: opSize });
        } catch (err) {
          assert.isTrue(false, "Apply changeset failed");
        }
        saIModel.saveChanges();
        saIModel.close();
      }
    }
    reporter.exportCSV(csvPath);
  });
  it("UpdateChangeset", async () => {
    for (const opSize of opSizes) {
      const iModelName = `${iModelNameBase}U_${opSize.toString()}`;
      const iModels = await IModelHubBackend.iModelClient.iModels.get(requestContext, projectId, new IModelQuery().byName(iModelName));
      const iModel = iModels.find((im) => im.name === iModelName);
      if (iModel) {
        // eslint-disable-next-line no-console
        console.log(`Downloading iModel ${iModelName} from iModelHub.`);
        const iModelPathname = path.join(BriefcaseManager.cacheDir, iModel.id!, `${iModelName}_update.bim`);
        await setupLocalIModel(projectId, iModel.id!, iModelPathname);
        const saIModel: StandaloneDb = StandaloneDb.openFile(iModelPathname, OpenMode.ReadWrite);
        // download last changeset file
        const csToken = await lastChangesetToken(iModel.id!);
        const applyOption = ChangeSetApplyOption.Merge;
        // eslint-disable-next-line no-console
        console.log(`Applying Update changeset to iModel ${iModelName}.`);
        try {
          const startTime = new Date().getTime();
          saIModel.nativeDb.applyChangeset(csToken, applyOption);
          const endTime = new Date().getTime();
          const elapsedTime = (endTime - startTime) / 1000.0;
          reporter.addEntry("ImodelChangesetPerformance", "ChangesetUpdate", "Time(s)", elapsedTime, { ElementClassName: "PerfElementSub3", InitialCount: dbSize, opCount: opSize });
        } catch (err) {
          assert.isTrue(false, "Apply changeset failed");
        }
        saIModel.saveChanges();
        saIModel.close();
      }
    }
    reporter.exportCSV(csvPath);
  });
});
