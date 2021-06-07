/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import * as semver from "semver";
import { DbOpcode, DbResult, GuidString, Id64String, IModelHubStatus } from "@bentley/bentleyjs-core";
import { CodeState, HubCode, IModelHubError, IModelQuery, Lock, LockLevel, LockQuery } from "@bentley/imodelhub-client";
import { CodeScopeSpec, CodeSpec, IModel, IModelError, RequestNewBriefcaseProps, SchemaState, SubCategoryAppearance } from "@bentley/imodeljs-common";
import { WsgError } from "@bentley/itwin-client";
import { IModelHubBackend } from "../../IModelHubBackend";
import {
  AuthorizedBackendRequestContext, BriefcaseDb, BriefcaseManager, ConcurrencyControl, DictionaryModel, Element, IModelHost, IModelJsFs, LockProps,
  SpatialCategory, SqliteStatement, SqliteValue, SqliteValueType,
} from "../../imodeljs-backend";
import { HubMock } from "../HubMock";
import { IModelTestUtils, TestUserType, Timer } from "../IModelTestUtils";
import { HubUtility } from "./HubUtility";

export async function createNewModelAndCategory(requestContext: AuthorizedBackendRequestContext, rwIModel: BriefcaseDb, parent?: Id64String) {
  // Create a new physical model.
  const [, modelId] = await IModelTestUtils.createAndInsertPhysicalPartitionAndModelAsync(requestContext, rwIModel, IModelTestUtils.getUniqueModelCode(rwIModel, "newPhysicalModel"), true, parent);
  requestContext.enter();

  // Find or create a SpatialCategory.
  const dictionary: DictionaryModel = rwIModel.models.getModel<DictionaryModel>(IModel.dictionaryId);
  const newCategoryCode = IModelTestUtils.getUniqueSpatialCategoryCode(dictionary, "ThisTestSpatialCategory");
  const category = SpatialCategory.create(rwIModel, IModel.dictionaryId, newCategoryCode.value);
  await rwIModel.concurrencyControl.requestResourcesForInsert(requestContext, [category]);
  requestContext.enter();
  const spatialCategoryId = rwIModel.elements.insertElement(category);
  category.setDefaultAppearance(new SubCategoryAppearance({ color: 0xff0000 }));
  // const spatialCategoryId: Id64String = SpatialCategory.insert(rwIModel, IModel.dictionaryId, newCategoryCode.value!, new SubCategoryAppearance({ color: 0xff0000 }));

  // Reserve all of the codes that are required by the new model and category.
  try {
    await rwIModel.concurrencyControl.request(requestContext);
  } catch (err) {
    if (err instanceof IModelHubError) {
      assert.fail(JSON.stringify(err));
    }
  }

  return { modelId, spatialCategoryId };
}

function toHubLock(props: LockProps, briefcaseId: number): Lock {
  const lock = new Lock();
  lock.briefcaseId = briefcaseId;
  lock.lockLevel = props.level;
  lock.lockType = props.type;
  lock.objectId = props.objectId;
  // lock.releasedWithChangeSet =
  return lock;
}

describe("IModelWriteTest (#integration)", () => {
  let managerRequestContext: AuthorizedBackendRequestContext;
  let superRequestContext: AuthorizedBackendRequestContext;
  let testContextId: string;
  let readWriteTestIModelId: GuidString;

  let readWriteTestIModelName: string;

  before(async () => {
    // IModelTestUtils.setupDebugLogLevels();
    HubMock.startup("IModelWriteTest");

    managerRequestContext = await IModelTestUtils.getUserContext(TestUserType.Manager);
    superRequestContext = await IModelTestUtils.getUserContext(TestUserType.Super);
    (superRequestContext as any).activityId = "IModelWriteTest (#integration)";

    testContextId = await HubUtility.getTestContextId(managerRequestContext);
    readWriteTestIModelName = HubUtility.generateUniqueName("ReadWriteTest");
    readWriteTestIModelId = await HubUtility.recreateIModel(managerRequestContext, testContextId, readWriteTestIModelName);

    // Purge briefcases that are close to reaching the acquire limit
    await HubUtility.purgeAcquiredBriefcasesById(managerRequestContext, readWriteTestIModelId);
  });

  after(async () => {
    try {
      await HubUtility.deleteIModel(managerRequestContext, "iModelJsIntegrationTest", readWriteTestIModelName);
      HubMock.shutdown();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(err);
    }
  });

  it("acquire codespec lock", async () => {
    const iModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: superRequestContext, contextId: testContextId, iModelId: readWriteTestIModelId });
    const codeSpec1 = CodeSpec.create(iModel, "MyCodeSpec1", CodeScopeSpec.Type.Model);
    iModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());

    await iModel.concurrencyControl.locks.lockCodeSpecs(superRequestContext);
    await iModel.concurrencyControl.locks.lockCodeSpecs(superRequestContext);
    assert.isTrue(iModel.concurrencyControl.locks.hasCodeSpecsLock);
    iModel.insertCodeSpec(codeSpec1);
    iModel.saveChanges();
    await iModel.pushChanges(superRequestContext, "inserted MyCodeSpec1");
    assert.isFalse(iModel.concurrencyControl.locks.hasCodeSpecsLock, "pushChanges should automatically release all locks");

    // Verify that locks are released even if there are no changes.
    const prePushChangesetId = iModel.changeSetId;
    await iModel.concurrencyControl.locks.lockCodeSpecs(superRequestContext);
    assert.isTrue(iModel.concurrencyControl.locks.hasCodeSpecsLock);
    /* make no changes */
    await iModel.pushChanges(superRequestContext, "did nothing");
    assert.equal(prePushChangesetId, iModel.changeSetId, "no changeset was pushed");

    assert.isFalse(iModel.concurrencyControl.locks.hasCodeSpecsLock, "pushChanges should automatically release all locks");

    let found = false;
    let briefcases = BriefcaseManager.getCachedBriefcases(readWriteTestIModelId);
    for (const briefcase of briefcases) {
      if (briefcase.briefcaseId === iModel.briefcaseId && briefcase.contextId === testContextId && briefcase.iModelId === readWriteTestIModelId) {
        assert.equal(briefcase.fileName, iModel.pathName);
        found = true;
      }
    }
    assert.isTrue(found);
    await IModelTestUtils.closeAndDeleteBriefcaseDb(superRequestContext, iModel);

    found = false;
    briefcases = BriefcaseManager.getCachedBriefcases(); // test getCachedBriefcases without iModelId
    for (const briefcase of briefcases) {
      if (briefcase.briefcaseId === iModel.briefcaseId && briefcase.contextId === testContextId && briefcase.iModelId === readWriteTestIModelId)
        found = true;
    }
    assert.isFalse(found);
  });

  it.skip("should verify that briefcase A can acquire Schema lock while briefcase B holds an element lock", async () => {

    const bcA = await IModelHubBackend.iModelClient.briefcases.create(managerRequestContext, readWriteTestIModelId);
    const bcB = await IModelHubBackend.iModelClient.briefcases.create(managerRequestContext, readWriteTestIModelId);
    assert.notEqual(bcA.briefcaseId, bcB.briefcaseId);
    assert.isTrue(bcA.briefcaseId !== undefined);
    assert.isTrue(bcB.briefcaseId !== undefined);
    const bcALockReq = toHubLock(ConcurrencyControl.Request.schemaLock, bcA.briefcaseId!);
    const bcBLockReq = toHubLock(ConcurrencyControl.Request.getElementLock("0x1", LockLevel.Exclusive), bcB.briefcaseId!);
    // First, B acquires element lock
    const bcBLocksAcquired = await IModelHubBackend.iModelClient.locks.update(managerRequestContext, readWriteTestIModelId, [bcBLockReq]);
    // Next, A acquires schema lock
    const bcALocksAcquired = await IModelHubBackend.iModelClient.locks.update(managerRequestContext, readWriteTestIModelId, [bcALockReq]);

    assert.isTrue(bcALocksAcquired.length !== 0);
    assert.equal(bcALocksAcquired[0].briefcaseId, bcA.briefcaseId);
    assert.equal(bcALocksAcquired[0].lockType, bcALockReq.lockType);

    assert.isTrue(bcBLocksAcquired.length !== 0);
    assert.equal(bcBLocksAcquired[0].briefcaseId, bcB.briefcaseId);
    assert.equal(bcBLocksAcquired[0].lockType, bcBLockReq.lockType);

    const bcALocksQueryResults = await IModelHubBackend.iModelClient.locks.get(managerRequestContext, readWriteTestIModelId, new LockQuery().byBriefcaseId(bcA.briefcaseId!));
    const bcBLocksQueryResults = await IModelHubBackend.iModelClient.locks.get(managerRequestContext, readWriteTestIModelId, new LockQuery().byBriefcaseId(bcB.briefcaseId!));
    assert.deepEqual(bcALocksAcquired, bcALocksQueryResults);
    assert.deepEqual(bcBLocksAcquired, bcBLocksQueryResults);

    bcBLockReq.lockLevel = LockLevel.None;
    await IModelHubBackend.iModelClient.locks.update(managerRequestContext, readWriteTestIModelId, [bcBLockReq]);
    bcALockReq.lockLevel = LockLevel.None;
    await IModelHubBackend.iModelClient.locks.update(managerRequestContext, readWriteTestIModelId, [bcALockReq]);

    await IModelHubBackend.iModelClient.briefcases.delete(managerRequestContext, readWriteTestIModelId, bcA.briefcaseId!);
    await IModelHubBackend.iModelClient.briefcases.delete(managerRequestContext, readWriteTestIModelId, bcB.briefcaseId!);
  });

  it("test change-merging scenarios in optimistic concurrency mode (#integration)", async () => {
    const firstUserRequestContext = await IModelTestUtils.getUserContext(TestUserType.Super);
    (firstUserRequestContext as any).activityId = "test change-merging scenarios in optimistic concurrency mode (#integration)";
    const secondUserRequestContext = await IModelTestUtils.getUserContext(TestUserType.SuperManager);
    const neutralObserverUserRequestContext = await IModelTestUtils.getUserContext(TestUserType.Manager);

    const firstIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: firstUserRequestContext, contextId: testContextId, iModelId: readWriteTestIModelId });
    const secondIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: secondUserRequestContext, contextId: testContextId, iModelId: readWriteTestIModelId });
    const neutralObserverIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: neutralObserverUserRequestContext, contextId: testContextId, iModelId: readWriteTestIModelId });
    assert.notEqual(firstIModel, secondIModel);
    assert.equal(firstIModel.nativeDb.getBriefcaseId(), firstIModel.briefcaseId);
    assert.isAbove(firstIModel.briefcaseId, 0);
    assert.equal(secondIModel.nativeDb.getBriefcaseId(), secondIModel.briefcaseId);
    assert.isAbove(secondIModel.briefcaseId, 0);
    assert.equal(neutralObserverIModel.nativeDb.getBriefcaseId(), neutralObserverIModel.briefcaseId);
    assert.isAbove(neutralObserverIModel.briefcaseId, 0);

    // Set up optimistic concurrency. Note the defaults are:
    firstIModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
    secondIModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());
    // Note: neutralObserver's IModel does not need to be configured for optimistic concurrency. He just pulls changes.

    // Check that the policy has been setup correctly
    let secondPolicy = secondIModel.concurrencyControl.getPolicy();
    assert.isDefined(secondPolicy);
    assert.isTrue(secondPolicy instanceof ConcurrencyControl.OptimisticPolicy);
    assert.equal((secondPolicy as ConcurrencyControl.OptimisticPolicy).conflictResolution.updateVsUpdate, ConcurrencyControl.OnConflict.RejectIncomingChange);
    assert.equal((secondPolicy as ConcurrencyControl.OptimisticPolicy).conflictResolution.updateVsDelete, ConcurrencyControl.OnConflict.AcceptIncomingChange);
    assert.equal((secondPolicy as ConcurrencyControl.OptimisticPolicy).conflictResolution.deleteVsUpdate, ConcurrencyControl.OnConflict.RejectIncomingChange);

    // firstUser: create model, category, and element el1
    const r = await createNewModelAndCategory(firstUserRequestContext, firstIModel);
    const el1 = firstIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(firstIModel, r.modelId, r.spatialCategoryId));
    // const el2 = firstIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(firstIModel, r.modelId, r.spatialCategoryId));
    firstIModel.saveChanges("firstUser created model, category, and two elements");
    await firstIModel.pushChanges(firstUserRequestContext, "test");

    // secondUser: pull and merge
    await secondIModel.pullAndMergeChanges(secondUserRequestContext);

    // Validate that the policy has been setup correctly after pullAndMerge (that causes the briefcase to reopen)
    secondPolicy = secondIModel.concurrencyControl.getPolicy();
    assert.isDefined(secondPolicy);
    assert.isTrue(secondPolicy instanceof ConcurrencyControl.OptimisticPolicy);
    assert.equal((secondPolicy as ConcurrencyControl.OptimisticPolicy).conflictResolution.updateVsUpdate, ConcurrencyControl.OnConflict.RejectIncomingChange);
    assert.equal((secondPolicy as ConcurrencyControl.OptimisticPolicy).conflictResolution.updateVsDelete, ConcurrencyControl.OnConflict.AcceptIncomingChange);
    assert.equal((secondPolicy as ConcurrencyControl.OptimisticPolicy).conflictResolution.deleteVsUpdate, ConcurrencyControl.OnConflict.RejectIncomingChange);

    // --- Test 1: Overlapping changes that really are conflicts => conflict-resolution policy is applied ---

    // firstUser: modify el1.userLabel
    if (true) {
      const el1cc: Element = firstIModel.elements.getElement(el1);
      el1cc.userLabel = `${el1cc.userLabel} -> changed by firstUser`;
      firstIModel.elements.updateElement(el1cc);
      firstIModel.saveChanges("firstUser modified el1.userLabel");
      await firstIModel.pushChanges(firstUserRequestContext, "test");
    }

    // secondUser: modify el1.userLabel
    let expectedValueOfEl1UserLabel: string;
    if (true) {
      const el1before: Element = (secondIModel.elements.getElement(el1));
      expectedValueOfEl1UserLabel = `${el1before.userLabel} -> changed by secondUser`;
      el1before.userLabel = expectedValueOfEl1UserLabel;
      secondIModel.elements.updateElement(el1before);
      secondIModel.saveChanges("secondUser modified el1.userLabel");

      // pull + merge => take secondUser's change (RejectIncomingChange). That's because the default updateVsUpdate setting is RejectIncomingChange
      await secondIModel.pullAndMergeChanges(secondUserRequestContext);
      const el1after = secondIModel.elements.getElement(el1);
      assert.equal(el1after.userLabel, expectedValueOfEl1UserLabel);

      await secondIModel.pushChanges(secondUserRequestContext, "test");
    }

    // Make sure a neutral observer sees secondUser's change.
    if (true) {
      await neutralObserverIModel.pullAndMergeChanges(neutralObserverUserRequestContext);
      const elobj = neutralObserverIModel.elements.getElement(el1);
      assert.equal(elobj.userLabel, expectedValueOfEl1UserLabel);
    }

    // firstUser: pull and see that secondUser has overridden my change
    if (true) {
      await firstIModel.pullAndMergeChanges(firstUserRequestContext);
      const elobj = firstIModel.elements.getElement(el1);
      assert.equal(elobj.userLabel, expectedValueOfEl1UserLabel);
    }

    // --- Test 2: Overlapping changes that are not conflicts  ---
    /* **************** No. We do not support property-level change-merging.

    // firstUser: modify el1.userLabel
    const wasExpectedValueofEl1UserLabel = expectedValueofEl1UserLabel;
    if (true) {
      const el1cc: Element = firstIModel.elements.getElement(el1);
      assert.equal(el1cc.userLabel, wasExpectedValueofEl1UserLabel);
      expectedValueofEl1UserLabel = el1cc.userLabel + " -> changed again by firstUser";
      el1cc.userLabel = expectedValueofEl1UserLabel;
      firstIModel.elements.updateElement(el1cc);
      firstIModel.saveChanges("firstUser modified el1.userLabel");
      await firstIModel.pushChanges(firstUserRequestContext);
    }

    // Make sure a neutral observer sees firstUser's changes.
    if (true) {
      await neutralObserverIModel.pullAndMergeChanges(neutralObserverUserRequestContext);
      const elobj = neutralObserverIModel.elements.getElement(el1);
      assert.equal(elobj.userLabel, expectedValueofEl1UserLabel);
    }

    // secondUser: modify el1.userProperties
    const secondUserPropNs = "secondUser";
    const secondUserPropName = "property";
    const expectedValueOfSecondUserProp: string = "x";
    if (true) {
      const el1before: Element = secondIModel.elements.getElement(el1);
      assert.equal(el1before.userLabel, wasExpectedValueofEl1UserLabel);

      el1before.setUserProperties(secondUserPropNs, { property: expectedValueOfSecondUserProp }); // secondUser changes userProperties
      secondIModel.elements.updateElement(el1before);
      secondIModel.saveChanges("secondUser modified el1.userProperties");
      assert.equal(el1before.userLabel, wasExpectedValueofEl1UserLabel, "secondUser does not change userLabel");

      // pull + merge => no conflict + both changes should be intact
      await secondIModel.pullAndMergeChanges(secondUserRequestContext);
      const el1after = secondIModel.elements.getElement(el1);
      assert.equal(el1after.userLabel, expectedValueofEl1UserLabel);
      assert.equal(el1after.getUserProperties(secondUserPropNs)[secondUserPropName], expectedValueOfSecondUserProp);

      await secondIModel.pushChanges(secondUserRequestContext);
    }

    // firstUser: pull and see both changes
    if (true) {
      await firstIModel.pullAndMergeChanges(firstUserRequestContext);
      const elobj = firstIModel.elements.getElement(el1);
      assert.equal(elobj.userLabel, expectedValueofEl1UserLabel);
      assert.equal(elobj.getUserProperties(secondUserPropNs)[secondUserPropName], expectedValueOfSecondUserProp);
    }

    // Make sure a neutral observer sees both changes.
    if (true) {
      await neutralObserverIModel.pullAndMergeChanges(neutralObserverUserRequestContext);
      const elobj = neutralObserverIModel.elements.getElement(el1);
      assert.equal(elobj.userLabel, expectedValueofEl1UserLabel);
      assert.equal(elobj.getUserProperties(secondUserPropNs)[secondUserPropName], expectedValueOfSecondUserProp);
    }
  */
    // --- Test 3: Non-overlapping changes ---
    firstIModel.close();
    secondIModel.close();
    neutralObserverIModel.close();

  });

  // Does not work with mocks
  it("should build concurrency control request", async () => {
    const iModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: managerRequestContext, contextId: testContextId, iModelId: readWriteTestIModelId });

    const el: Element = iModel.elements.getRootSubject();
    el.buildConcurrencyControlRequest(DbOpcode.Update);    // make a list of the locks, etc. that will be needed to update this element
    const req = iModel.concurrencyControl.pendingRequest;
    assert.isDefined(req);
    assert.isArray(req.locks);
    assert.equal(req.locks.length, 1, " we expect to need a lock on the element (exclusive), its model (shared), and the db itself (shared)");
    assert.isArray(req.codes);
    assert.equal(req.codes.length, 0, " since we didn't add or change the element's code, we don't expect to need a code reservation");

    iModel.close();
  });

  it.skip("should push changes with codes (#integration)", async () => {
    const adminRequestContext = await IModelTestUtils.getUserContext(TestUserType.SuperManager);
    let timer = new Timer("delete iModels");
    // Delete any existing iModels with the same name as the read-write test iModel
    const iModelName = "CodesPushTest";
    const iModels = await IModelHubBackend.iModelClient.iModels.get(adminRequestContext, testContextId, new IModelQuery().byName(iModelName));
    for (const iModelTemp of iModels) {
      await IModelHubBackend.iModelClient.iModels.delete(adminRequestContext, testContextId, iModelTemp.id!);
    }
    timer.end();

    // Create a new empty iModel on the Hub & obtain a briefcase
    timer = new Timer("create iModel");
    const rwIModelId = await IModelHost.hubAccess.createIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelName, description: "TestSubject" });
    assert.isNotEmpty(rwIModelId);
    const rwIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: adminRequestContext, contextId: testContextId, iModelId: rwIModelId });
    timer.end();

    timer = new Timer("querying codes");
    const initialCodes = await IModelHubBackend.iModelClient.codes.get(adminRequestContext, rwIModelId);
    timer.end();

    timer = new Timer("make local changes");
    const code = IModelTestUtils.getUniqueModelCode(rwIModel, "newPhysicalModel");
    await IModelTestUtils.createAndInsertPhysicalPartitionAndModelAsync(adminRequestContext, rwIModel, code, true);
    adminRequestContext.enter();

    await rwIModel.concurrencyControl.request(adminRequestContext);
    rwIModel.saveChanges("inserted generic objects");
    timer.end();

    assert.isTrue(rwIModel.concurrencyControl.codes.isReserved(code), "I reserved the code newPhysicalModel");

    timer = new Timer("push changes");

    // Push the changes to the hub
    const prePushChangeSetId = rwIModel.changeSetId;
    await rwIModel.pushChanges(adminRequestContext, "test");
    const postPushChangeSetId = rwIModel.changeSetId;
    assert(!!postPushChangeSetId);
    expect(prePushChangeSetId !== postPushChangeSetId);

    timer.end();

    timer = new Timer("querying codes");
    const codes = await IModelHubBackend.iModelClient.codes.get(adminRequestContext, rwIModelId);
    timer.end();
    expect(codes.length > initialCodes.length);
    assert.isTrue(codes.some((hcode) => (hcode.value === code.value) && (hcode.state === CodeState.Used)), "verify that I got the code that I reserved and used");

    // Now verify that code reservations are released even if we call pushChanges with no changes.
    const code2 = IModelTestUtils.getUniqueModelCode(rwIModel, "anotherCode");
    await rwIModel.concurrencyControl.codes.reserve(adminRequestContext, [code2]);
    assert.isTrue(rwIModel.concurrencyControl.codes.isReserved(code2), "I reserved the code anotherCode");
    /* make no changes */
    await rwIModel.pushChanges(adminRequestContext, "no changes");
    assert.equal(postPushChangeSetId, rwIModel.changeSetId), "no changeset created or pushed";
    assert.isFalse(rwIModel.concurrencyControl.codes.isReserved(code2), "I released my reservation of the code anotherCode");

    const codesAfter = await IModelHubBackend.iModelClient.codes.get(adminRequestContext, rwIModelId);
    assert.deepEqual(codesAfter, codes, "The code that used above is still marked as used");
  });

  it.skip("should defer locks and codes in bulk mode (#integration)", async () => {
    const adminRequestContext = await IModelTestUtils.getUserContext(TestUserType.SuperManager);
    // Delete any existing iModels with the same name as the read-write test iModel
    const iModelName = HubUtility.generateUniqueName("ConcurrencyControlBulkModeTest");
    const deleteIModel = await HubUtility.queryIModelByName(adminRequestContext, testContextId, iModelName);
    if (undefined !== deleteIModel)
      await IModelHost.hubAccess.deleteIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelId: deleteIModel });

    // Create a new empty iModel on the Hub & obtain a briefcase
    const rwIModelId = await IModelHost.hubAccess.createIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelName, description: "TestSubject" });
    assert.isNotEmpty(rwIModelId);
    const rwIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: adminRequestContext, contextId: testContextId, iModelId: rwIModelId });

    const dictionary = rwIModel.models.getModel<DictionaryModel>(IModel.dictionaryId);
    const newCategoryCode = IModelTestUtils.getUniqueSpatialCategoryCode(dictionary, "ThisTestSpatialCategory");
    const newCategoryCode2 = IModelTestUtils.getUniqueSpatialCategoryCode(dictionary, "ThisTestSpatialCategory2");
    // assert.isTrue(await rwIModel.concurrencyControl.codes.areAvailable(adminRequestContext, [newCategoryCode]));
    const subCategory = new SubCategoryAppearance({ color: 0xff0000 });
    const newModelCode = IModelTestUtils.getUniqueModelCode(rwIModel, "newPhysicalModel");

    assert.isFalse(rwIModel.concurrencyControl.hasPendingRequests);

    assert.throws(() => IModelTestUtils.createAndInsertPhysicalPartitionAndModel(rwIModel, newModelCode, true), IModelError);  // s/ have errorNumber=RepositoryStatus.LockNotHeld
    assert.throws(() => SpatialCategory.insert(rwIModel, IModel.dictionaryId, newCategoryCode.value, subCategory), IModelError);  // s/ have errorNumber=RepositoryStatus.LockNotHeld

    // assert.isUndefined(rwIModel.models.tryGetModelProps())
    assert.isUndefined(rwIModel.elements.tryGetElement(newCategoryCode));
    assert.isUndefined(rwIModel.elements.tryGetElement(newCategoryCode2));

    rwIModel.concurrencyControl.startBulkMode();
    // rwIModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());

    assert.isFalse(rwIModel.concurrencyControl.hasPendingRequests);

    IModelTestUtils.createAndInsertPhysicalPartitionAndModel(rwIModel, newModelCode, true);
    SpatialCategory.insert(rwIModel, IModel.dictionaryId, newCategoryCode.value, subCategory);
    SpatialCategory.insert(rwIModel, IModel.dictionaryId, newCategoryCode2.value, subCategory);

    assert.isTrue(undefined !== rwIModel.elements.getElement(newCategoryCode));
    assert.isTrue(undefined !== rwIModel.elements.getElement(newCategoryCode2));

    assert.isTrue(rwIModel.concurrencyControl.hasPendingRequests);
    await rwIModel.concurrencyControl.request(adminRequestContext);
    assert.isFalse(rwIModel.concurrencyControl.hasPendingRequests);
    rwIModel.saveChanges("inserted generic objects");

    // While we're here, do a quick test of lock management
    const bcId = rwIModel.concurrencyControl.iModel.briefcaseId;
    const iModelId = rwIModel.concurrencyControl.iModel.iModelId;

    let heldLocks = await IModelHubBackend.iModelClient.locks.get(adminRequestContext, iModelId, new LockQuery().byBriefcaseId(bcId));
    assert.isTrue(heldLocks.length !== 0);

    await expect(rwIModel.concurrencyControl.abandonResources(adminRequestContext)).to.be.rejectedWith(IModelError, "");

    await rwIModel.pushChanges(adminRequestContext, "");

    heldLocks = await IModelHubBackend.iModelClient.locks.get(adminRequestContext, iModelId, new LockQuery().byBriefcaseId(bcId));
    assert.isTrue(heldLocks.length === 0);

    await rwIModel.concurrencyControl.abandonResources(adminRequestContext); // should do nothing and be harmless

    await IModelHubBackend.iModelClient.iModels.delete(adminRequestContext, testContextId, iModelId);
  });

  it("should handle undo/redo (#integration)", async () => {
    const adminRequestContext = await IModelTestUtils.getUserContext(TestUserType.SuperManager);
    let timer = new Timer("delete iModels");
    // Delete any existing iModels with the same name as the read-write test iModel
    const iModelName = "CodesUndoRedoPushTest";
    const iModelId = await IModelHost.hubAccess.queryIModelByName({ requestContext: adminRequestContext, contextId: testContextId, iModelName });
    if (iModelId)
      await IModelHost.hubAccess.deleteIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelId });
    timer.end();

    // Create a new empty iModel on the Hub & obtain a briefcase
    timer = new Timer("create iModel");
    const rwIModelId = await IModelHost.hubAccess.createIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelName, description: "TestSubject" });
    assert.isNotEmpty(rwIModelId);
    const rwIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: adminRequestContext, contextId: testContextId, iModelId: rwIModelId });
    timer.end();

    // create and insert a new model with code1
    const code1 = IModelTestUtils.getUniqueModelCode(rwIModel, "newPhysicalModel1");
    await IModelTestUtils.createAndInsertPhysicalPartitionAndModelAsync(adminRequestContext, rwIModel, code1, true);
    adminRequestContext.enter();

    assert.isTrue(rwIModel.elements.getElement(code1) !== undefined); // throws if element is not found

    // create a local txn with that change
    rwIModel.saveChanges("inserted newPhysicalModel");

    // Reverse that local txn
    rwIModel.txns.reverseSingleTxn();

    try {
      //  The model that I just created with code1 should no longer be there.
      const theNewModel = rwIModel.elements.getElement(code1); // throws if element is not found
      assert.isTrue(theNewModel === undefined); // really should not be here.
      assert.fail(); // should not be here.
    } catch (_err) {
      // this is what I expect
    }

    // Create and insert a model with code2
    const code2 = IModelTestUtils.getUniqueModelCode(rwIModel, "newPhysicalModel2");
    await IModelTestUtils.createAndInsertPhysicalPartitionAndModelAsync(adminRequestContext, rwIModel, code2, true);
    adminRequestContext.enter();

    rwIModel.saveChanges("inserted generic objects");

    // The iModel should have a model with code1 and not code2
    assert.isTrue(rwIModel.elements.getElement(code2) !== undefined); // throws if element is not found

    timer = new Timer("push changes");

    // Push the changes to the hub
    const prePushChangeSetId = rwIModel.changeSetId;
    await rwIModel.pushChanges(adminRequestContext, "test");
    const postPushChangeSetId = rwIModel.changeSetId;
    assert(!!postPushChangeSetId);
    expect(prePushChangeSetId !== postPushChangeSetId);

    timer.end();

    rwIModel.close();
    // The iModel should have code1 marked as used and not code2
    // timer = new Timer("querying codes");
    // const codes = await IModelHubAccess.iModelClient.codes.get(adminRequestContext, rwIModelId);
    // timer.end();
    // assert.isTrue(codes.find((code) => (code.value === "newPhysicalModel2" && code.state === CodeState.Used)) !== undefined);
    // assert.isFalse(codes.find((code) => (code.value === "newPhysicalModel" && code.state === CodeState.Used)) !== undefined);
  });

  it("should not push changes with lock conflicts (#integration)", async () => {
    const adminRequestContext = await IModelTestUtils.getUserContext(TestUserType.SuperManager);
    let timer = new Timer("delete iModels");
    const iModelName = "LocksConflictTest";
    const iModelId = await IModelHost.hubAccess.queryIModelByName({ requestContext: adminRequestContext, contextId: testContextId, iModelName });
    if (iModelId)
      await IModelHost.hubAccess.deleteIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelId });
    timer.end();

    timer = new Timer("create iModel");
    const rwIModelId = await IModelHost.hubAccess.createIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelName, description: "TestSubject" });

    const rwIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: adminRequestContext, contextId: testContextId, iModelId: rwIModelId });
    adminRequestContext.enter();
    timer.end();

    rwIModel.concurrencyControl.startBulkMode();  // in bulk mode, we don't have to get locks before we make local changes. They are tracked and deferred until saveChanges requests them all at once.

    //  Create a new model and put two elements in it
    const [, newModelId] = IModelTestUtils.createAndInsertPhysicalPartitionAndModel(rwIModel, IModelTestUtils.getUniqueModelCode(rwIModel, "newPhysicalModel"), true);
    const dictionary: DictionaryModel = rwIModel.models.getModel<DictionaryModel>(IModel.dictionaryId);
    const newCategoryCode = IModelTestUtils.getUniqueSpatialCategoryCode(dictionary, "ThisTestSpatialCategory");
    // assert.isTrue(await rwIModel.concurrencyControl.codes.areAvailable(adminRequestContext, [newCategoryCode]));
    const spatialCategoryId: Id64String = SpatialCategory.insert(rwIModel, IModel.dictionaryId, newCategoryCode.value, new SubCategoryAppearance({ color: 0xff0000 }));
    const elid1 = rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, newModelId, spatialCategoryId));
    const elid2 = rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, newModelId, spatialCategoryId));

    await rwIModel.concurrencyControl.request(adminRequestContext);
    adminRequestContext.enter();
    rwIModel.saveChanges("created newPhysicalModel");
    timer = new Timer("pullmergepush");
    await rwIModel.pushChanges(adminRequestContext, "newPhysicalModel");
    adminRequestContext.enter();

    //  Have another briefcase take out an exclusive lock on element #1
    const otherBriefcaseId = await IModelHost.hubAccess.acquireNewBriefcaseId({ requestContext: adminRequestContext, iModelId: rwIModelId });
    assert.notEqual(otherBriefcaseId, rwIModel.briefcaseId);
    const otherBriefcaseLockReq = ConcurrencyControl.Request.getElementLock(elid1, LockLevel.Exclusive);
    await IModelHost.hubAccess.acquireLocks({
      requestContext: adminRequestContext, briefcase: {
        briefcaseId: rwIModel.briefcaseId, changeSetId: rwIModel.changeSetId, iModelId: rwIModel.iModelId,
      }, locks: [otherBriefcaseLockReq],
    });

    assert.isUndefined(rwIModel.elements.getElement(elid1).userLabel, "element #1 should have no userLabel");

    // This briefcase can insert elements with no problem
    const elid4 = rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, newModelId, spatialCategoryId));
    await rwIModel.concurrencyControl.request(adminRequestContext);
    rwIModel.saveChanges("inserted element #4");
    // (don't push! We want this newly inserted element to be in the local briefcase and its fake local lock to be in the cctl lock cache together with
    // the changes that we are about to try and fail to make in the next step.)

    // This briefcase will now try to modify the locked element, and that should fail.
    let elid3: Id64String | undefined;
    if (true) {
      const el1Props = rwIModel.elements.getElement(elid1);
      el1Props.userLabel = "try to change it in this briefcase (won't work)";
      rwIModel.elements.updateElement(el1Props);
      // Also create another new element as part of the same txn.
      elid3 = rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, newModelId, spatialCategoryId));
      assert.isTrue(rwIModel.concurrencyControl.locks.holdsLock(ConcurrencyControl.Request.getElementLock(elid3, LockLevel.Exclusive))); // (tricky: ccmgr pretends that new elements are locked.)
      assert.isTrue(rwIModel.concurrencyControl.hasPendingRequests); // we have to get the lock before we can carry through with this
      // let rejectedWithError: Error | undefined;
      // try {
      //   await rwIModel.concurrencyControl.request(adminRequestContext);
      // } catch (err) {
      //   rejectedWithError = err;
      // }
      // assert.isTrue(rejectedWithError !== undefined);
      // assert.isTrue(rejectedWithError instanceof IModelHubError);
      // assert.equal((rejectedWithError as IModelHubError).errorNumber, IModelHubStatus.LockOwnedByAnotherBriefcase);
    }

    // This briefcase has no choice but to abandon everything it did since the last call to saveChanges. That includes both the change to the locked element and the insert of the new element.
    rwIModel.abandonChanges();

    // Verify that all uncommitted changes and temporary locks were rolled back
    assert.isFalse(rwIModel.concurrencyControl.hasPendingRequests); // when we abandon changes, we also abandon the pending resource request
    assert.isUndefined(rwIModel.elements.getElement(elid1).userLabel, "the modification of element #1 should have been unwound");
    assert.isUndefined(rwIModel.elements.tryGetElement(elid3), "the insert of element #3 should have been unwound");
    assert.isFalse(rwIModel.concurrencyControl.locks.holdsLock(ConcurrencyControl.Request.getElementLock(elid3, LockLevel.Exclusive)), "The fake local lock on element #3 should have been discarded");
    // ... but all committed changes and temporary locks were retained.
    assert.isTrue(undefined !== rwIModel.elements.tryGetElement(elid4), "the insert of the first new element should have been retained");
    assert.isTrue(rwIModel.concurrencyControl.locks.holdsLock(ConcurrencyControl.Request.getElementLock(elid4, LockLevel.Exclusive)), "The fake local lock on element #4 should have been retained");

    // This briefcase should be able to modify element #2.
    if (true) {
      const el2Props = rwIModel.elements.getElement(elid2);
      el2Props.userLabel = "changed by this briefcase";
      rwIModel.elements.updateElement(el2Props);
      assert.isTrue(rwIModel.concurrencyControl.hasPendingRequests); // we have to get the lock before we can carry through with this
      await rwIModel.concurrencyControl.request(adminRequestContext);
      adminRequestContext.enter();
      rwIModel.saveChanges("this briefcase changed el2");
      await rwIModel.pushChanges(adminRequestContext, "this briefcase changed el2");
    }

    // Now make the other briefcase release its lock and show that this briefcase can update element #1.
    // await IModelHost.hubAccess.reiModelClient.locks.update(adminRequestContext, rwIModelId, [otherBriefcaseLockReq]);
    // if (true) {
    //   const el1Props = rwIModel.elements.getElement(elid1);
    //   el1Props.userLabel = "changed by this briefcase";
    //   assert.isFalse(rwIModel.concurrencyControl.hasPendingRequests);
    //   rwIModel.elements.updateElement(el1Props);
    //   assert.isTrue(rwIModel.concurrencyControl.hasPendingRequests); // we have to get the lock before we can carry through with this
    //   await rwIModel.concurrencyControl.request(adminRequestContext);
    //   assert.isFalse(rwIModel.concurrencyControl.hasPendingRequests);
    //   adminRequestContext.enter();
    //   rwIModel.saveChanges("this briefcase change to el2");
    //   await rwIModel.pushChanges(adminRequestContext, "this briefcase change to el2");
    // }

    await IModelTestUtils.closeAndDeleteBriefcaseDb(adminRequestContext, rwIModel);
  });

  it.skip("Locks conflict test II (#integration)", async () => {
    const adminRequestContext = await IModelTestUtils.getUserContext(TestUserType.SuperManager);
    let timer = new Timer("delete iModels");
    const iModelName = "LocksConflictTestII";
    const iModelId = await IModelHost.hubAccess.queryIModelByName({ requestContext: adminRequestContext, contextId: testContextId, iModelName });
    if (iModelId)
      await IModelHost.hubAccess.deleteIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelId });
    timer.end();

    timer = new Timer("create iModel");
    const rwIModelId = await IModelHost.hubAccess.createIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelName, description: "TestSubject" });
    const rwIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: adminRequestContext, contextId: testContextId, iModelId: rwIModelId });
    adminRequestContext.enter();
    timer.end();

    rwIModel.concurrencyControl.startBulkMode();  // in bulk mode, we don't have to get locks before we make local changes. They are tracked and deferred until saveChanges requests them all at once.

    //  Create a new model and put an element in it (elid1)
    const [, newModelId] = IModelTestUtils.createAndInsertPhysicalPartitionAndModel(rwIModel, IModelTestUtils.getUniqueModelCode(rwIModel, "newPhysicalModel"), true);
    const dictionary: DictionaryModel = rwIModel.models.getModel<DictionaryModel>(IModel.dictionaryId);
    const newCategoryCode = IModelTestUtils.getUniqueSpatialCategoryCode(dictionary, "ThisTestSpatialCategory");
    // assert.isTrue(await rwIModel.concurrencyControl.codes.areAvailable(adminRequestContext, [newCategoryCode]));
    const spatialCategoryId: Id64String = SpatialCategory.insert(rwIModel, IModel.dictionaryId, newCategoryCode.value, new SubCategoryAppearance({ color: 0xff0000 }));
    const elid1 = rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, newModelId, spatialCategoryId));

    await rwIModel.concurrencyControl.request(adminRequestContext);
    adminRequestContext.enter();
    rwIModel.saveChanges("created newPhysicalModel");
    timer = new Timer("pullmergepush");
    await rwIModel.pushChanges(adminRequestContext, "newPhysicalModel");
    adminRequestContext.enter();

    await rwIModel.concurrencyControl.endBulkMode(adminRequestContext); // leave bulk mode. Now we will have to get locks before making changes.
    adminRequestContext.enter();

    //  --- Briefcase 2
    //  Have another briefcase take out an exclusive lock on element #1
    const briefcase2 = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: superRequestContext, contextId: testContextId, iModelId: rwIModelId });
    superRequestContext.enter();

    assert.notEqual(briefcase2.briefcaseId, rwIModel.briefcaseId);

    const el1bc2 = briefcase2.elements.getElement(elid1);
    await briefcase2.concurrencyControl.requestResourcesForUpdate(superRequestContext, [el1bc2]);
    superRequestContext.enter();

    // --- Briefcase 1
    // Now let the first briefcase try to delete element #1. That should fail with a lock error.
    const el1bc1 = rwIModel.elements.getElement(elid1);
    assert.throws(() => rwIModel.elements.deleteElement(elid1)); // this should throw, because we haven't requested a lock yet
    await expect(rwIModel.concurrencyControl.requestResourcesForDelete(adminRequestContext, [el1bc1])).to.be.rejectedWith(WsgError, "Lock(s) is owned by another briefcase.");

    briefcase2.close();
    await IModelTestUtils.closeAndDeleteBriefcaseDb(adminRequestContext, rwIModel);
  });

  it.skip("should not push changes with code conflicts (#integration)", async () => {
    const adminRequestContext = await IModelTestUtils.getUserContext(TestUserType.SuperManager);
    let timer = new Timer("delete iModels");
    const iModelName = "CodesConflictTest";
    const iModelId = await IModelHost.hubAccess.queryIModelByName({ requestContext: adminRequestContext, contextId: testContextId, iModelName });
    if (iModelId)
      await IModelHost.hubAccess.deleteIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelId });
    timer.end();

    timer = new Timer("create iModel");
    const rwIModelId = await IModelHost.hubAccess.createIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelName, description: "TestSubject" });
    assert.isNotEmpty(rwIModelId);

    const rwIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: adminRequestContext, contextId: testContextId, iModelId: rwIModelId });
    timer.end();

    const code = IModelTestUtils.getUniqueModelCode(rwIModel, "newPhysicalModel");
    const otherBriefcase = await IModelHubBackend.iModelClient.briefcases.create(adminRequestContext, rwIModelId);

    let codesReserved = (await IModelHubBackend.iModelClient.codes.get(adminRequestContext, rwIModelId)).filter((c) => c.state === CodeState.Reserved);
    assert.equal(codesReserved.length, 0);

    const hubCode = new HubCode();
    hubCode.value = code.value;
    hubCode.codeSpecId = code.spec;
    hubCode.codeScope = code.scope;
    hubCode.briefcaseId = otherBriefcase.briefcaseId;
    hubCode.state = CodeState.Reserved;
    await IModelHubBackend.iModelClient.codes.update(adminRequestContext, rwIModelId, [hubCode]);
    adminRequestContext.enter();
    await rwIModel.concurrencyControl.syncCache(adminRequestContext); // I must tell ConcurrencyControl whenever I make changes to locks/codes in iModelHub by using the lower-level API directly.
    adminRequestContext.enter();

    timer = new Timer("querying codes");
    codesReserved = (await IModelHubBackend.iModelClient.codes.get(adminRequestContext, rwIModelId)).filter((c) => c.state === CodeState.Reserved);
    timer.end();
    assert.equal(codesReserved.length, 1);
    assert.equal(codesReserved[0].value, hubCode.value);

    let rejectedWithError: Error | undefined;
    try {
      await IModelTestUtils.createAndInsertPhysicalPartitionAndModelAsync(adminRequestContext, rwIModel, code, true);
    } catch (err) {
      rejectedWithError = err;
    }
    assert.isTrue(rejectedWithError !== undefined);
    assert.isTrue(rejectedWithError instanceof IModelHubError);
    assert.equal((rejectedWithError as IModelHubError).errorNumber, IModelHubStatus.CodeReservedByAnotherBriefcase);
  });

  it("should write to briefcase with optimistic concurrency (#integration)", async () => {
    const adminRequestContext = await IModelTestUtils.getUserContext(TestUserType.SuperManager);
    // Delete any existing iModels with the same name as the OptimisticConcurrencyTest iModel
    const iModelName = HubUtility.generateUniqueName("OptimisticConcurrencyTest");

    // Create a new empty iModel on the Hub & obtain a briefcase
    let timer = new Timer("create iModel");
    const rwIModelId = await IModelHost.hubAccess.createIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelName, description: "TestSubject" });
    assert.isNotEmpty(rwIModelId);
    const rwIModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: adminRequestContext, contextId: testContextId, iModelId: rwIModelId });
    timer.end();

    timer = new Timer("make local changes");

    // Turn on optimistic concurrency control. This allows the app to modify elements, models, etc. without first acquiring locks.
    // Later, when the app downloads and merges changeSets from the Hub into the briefcase, BriefcaseManager will merge changes and handle conflicts.
    // The app still has to reserve codes.
    rwIModel.concurrencyControl.setPolicy(new ConcurrencyControl.OptimisticPolicy());

    // Show that we can modify the properties of an element. In this case, we modify the root element itself.
    const rootEl: Element = rwIModel.elements.getRootSubject();
    rootEl.userLabel = `${rootEl.userLabel}changed`;
    rwIModel.elements.updateElement(rootEl);

    assert.isFalse(rwIModel.concurrencyControl.hasPendingRequests);

    rwIModel.saveChanges(JSON.stringify({ userid: "user1", description: "changed a userLabel" }));  // save it, to show that saveChanges will accumulate local txn descriptions

    // Create a new physical model.
    const [, newModelId] = await IModelTestUtils.createAndInsertPhysicalPartitionAndModelAsync(adminRequestContext, rwIModel, IModelTestUtils.getUniqueModelCode(rwIModel, "newPhysicalModel"), true);
    adminRequestContext.enter();

    // Find or create a SpatialCategory.
    const dictionary: DictionaryModel = rwIModel.models.getModel<DictionaryModel>(IModel.dictionaryId);
    const newCategoryCode = IModelTestUtils.getUniqueSpatialCategoryCode(dictionary, "ThisTestSpatialCategory");
    // assert.isTrue(await rwIModel.concurrencyControl.codes.areAvailable(adminRequestContext, [newCategoryCode]));
    const spatialCategoryId: Id64String = SpatialCategory.insert(rwIModel, IModel.dictionaryId, newCategoryCode.value, new SubCategoryAppearance({ color: 0xff0000 }));

    timer.end();

    timer = new Timer("query Codes I");

    // iModel.concurrencyControl should have recorded the codes that are required by the new elements.
    assert.isTrue(rwIModel.concurrencyControl.hasPendingRequests);
    // assert.isTrue(await rwIModel.concurrencyControl.areAvailable(adminRequestContext));

    timer.end();
    timer = new Timer("reserve Codes");

    // Reserve all of the codes that are required by the new model and category.
    try {
      await rwIModel.concurrencyControl.request(adminRequestContext);
    } catch (err) {
      if (err instanceof IModelHubError) {
        assert.fail(JSON.stringify(err));
      }
    }

    timer.end();
    timer = new Timer("query Codes II");

    // Verify that the codes are reserved.
    const category = rwIModel.elements.getElement(spatialCategoryId);
    assert.isTrue(category.code.value !== undefined);
    // const codeStates = await rwIModel.concurrencyControl.codes.query(adminRequestContext, category.code.spec, category.code.scope);
    // const foundCode: MultiCode[] = codeStates.filter((cs) => (cs.value === category.code.value) && (cs.state === CodeState.Reserved));
    // assert.equal(foundCode.length, 1);

    /* NEEDS WORK - query just this one code
  assert.isTrue(category.code.value !== undefined);
  const codeStates2 = await iModel.concurrencyControl.codes.query(adminAccessToken, category.code.spec, category.code.scope, category.code.value!);
  assert.equal(codeStates2.length, 1);
  assert.equal(codeStates2[0].values.length, 1);
  assert.equal(codeStates2[0].values[0], category.code.value!);
  */

    timer.end();

    timer = new Timer("make more local changes");

    // Create a couple of physical elements.
    const elid1 = rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, newModelId, spatialCategoryId));
    rwIModel.elements.insertElement(IModelTestUtils.createPhysicalObject(rwIModel, newModelId, spatialCategoryId));

    // Commit the local changes to a local transaction in the briefcase.
    rwIModel.saveChanges(JSON.stringify({ userid: "user1", description: "inserted generic objects" }));

    rwIModel.elements.getElement(elid1); // throws if elid1 is not found
    rwIModel.elements.getElement(spatialCategoryId); // throws if spatialCategoryId is not found

    timer.end();

    timer = new Timer("pullmergepush");

    // Push the changes to the hub
    const prePushChangeSetId = rwIModel.changeSetId;
    await rwIModel.pushChanges(adminRequestContext, "test");
    const postPushChangeSetId = rwIModel.changeSetId;
    assert(!!postPushChangeSetId);
    expect(prePushChangeSetId !== postPushChangeSetId);

    timer.end();

    // Open a readonly copy of the iModel
    const roIModel = await IModelTestUtils.downloadAndOpenCheckpoint({ requestContext: adminRequestContext, contextId: testContextId, iModelId: rwIModelId });
    assert.exists(roIModel);

    await IModelTestUtils.closeAndDeleteBriefcaseDb(adminRequestContext, rwIModel);
    roIModel.close();

    await IModelHost.hubAccess.deleteIModel({ requestContext: adminRequestContext, contextId: testContextId, iModelId: rwIModelId });
  });

  it("Run plain SQL against fixed version connection", async () => {
    const iModel = await IModelTestUtils.downloadAndOpenBriefcase({ requestContext: managerRequestContext, contextId: testContextId, iModelId: readWriteTestIModelId });
    try {
      iModel.withPreparedSqliteStatement("CREATE TABLE Test(Id INTEGER PRIMARY KEY, Name TEXT NOT NULL, Code INTEGER)", (stmt: SqliteStatement) => {
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      iModel.withPreparedSqliteStatement("INSERT INTO Test(Name,Code) VALUES(?,?)", (stmt: SqliteStatement) => {
        stmt.bindValue(1, "Dummy 1");
        stmt.bindValue(2, 100);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      iModel.withPreparedSqliteStatement("INSERT INTO Test(Name,Code) VALUES(?,?)", (stmt: SqliteStatement) => {
        stmt.bindValues(["Dummy 2", 200]);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      iModel.withPreparedSqliteStatement("INSERT INTO Test(Name,Code) VALUES(:p1,:p2)", (stmt: SqliteStatement) => {
        stmt.bindValue(":p1", "Dummy 3");
        stmt.bindValue(":p2", 300);
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      iModel.withPreparedSqliteStatement("INSERT INTO Test(Name,Code) VALUES(:p1,:p2)", (stmt: SqliteStatement) => {
        stmt.bindValues({ ":p1": "Dummy 4", ":p2": 400 });
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });

      iModel.saveChanges();

      iModel.withPreparedSqliteStatement("SELECT Id,Name,Code FROM Test ORDER BY Id", (stmt: SqliteStatement) => {
        for (let i: number = 1; i <= 4; i++) {
          assert.equal(stmt.step(), DbResult.BE_SQLITE_ROW);
          assert.equal(stmt.getColumnCount(), 3);
          const val0: SqliteValue = stmt.getValue(0);
          assert.equal(val0.columnName, "Id");
          assert.equal(val0.type, SqliteValueType.Integer);
          assert.isFalse(val0.isNull);
          assert.equal(val0.getInteger(), i);

          const val1: SqliteValue = stmt.getValue(1);
          assert.equal(val1.columnName, "Name");
          assert.equal(val1.type, SqliteValueType.String);
          assert.isFalse(val1.isNull);
          assert.equal(val1.getString(), `Dummy ${i}`);

          const val2: SqliteValue = stmt.getValue(2);
          assert.equal(val2.columnName, "Code");
          assert.equal(val2.type, SqliteValueType.Integer);
          assert.isFalse(val2.isNull);
          assert.equal(val2.getInteger(), i * 100);

          const row: any = stmt.getRow();
          assert.equal(row.id, i);
          assert.equal(row.name, `Dummy ${i}`);
          assert.equal(row.code, i * 100);
        }
        assert.equal(stmt.step(), DbResult.BE_SQLITE_DONE);
      });
    } finally {
      // delete the briefcase as the test modified it locally.
      let briefcasePath: string | undefined;
      if (iModel.isOpen)
        briefcasePath = iModel.pathName;

      await IModelTestUtils.closeAndDeleteBriefcaseDb(managerRequestContext, iModel);
      if (!!briefcasePath && IModelJsFs.existsSync(briefcasePath))
        IModelJsFs.unlinkSync(briefcasePath);
    }
  });

  it("Run plain SQL against readonly connection", async () => {
    const iModel = await IModelTestUtils.downloadAndOpenCheckpoint({ requestContext: managerRequestContext, contextId: testContextId, iModelId: readWriteTestIModelId });

    iModel.withPreparedSqliteStatement("SELECT Name,StrData FROM be_Prop WHERE Namespace='ec_Db'", (stmt: SqliteStatement) => {
      let rowCount = 0;
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        rowCount++;
        assert.equal(stmt.getColumnCount(), 2);
        const nameVal: SqliteValue = stmt.getValue(0);
        assert.equal(nameVal.columnName, "Name");
        assert.equal(nameVal.type, SqliteValueType.String);
        assert.isFalse(nameVal.isNull);
        const name: string = nameVal.getString();

        const versionVal = stmt.getValue(1);
        assert.equal(versionVal.columnName, "StrData");
        assert.equal(versionVal.type, SqliteValueType.String);
        assert.isFalse(versionVal.isNull);
        const profileVersion: any = JSON.parse(versionVal.getString());

        assert.isTrue(name === "SchemaVersion" || name === "InitialSchemaVersion");
        if (name === "SchemaVersion") {
          assert.equal(profileVersion.major, 4);
          assert.equal(profileVersion.minor, 0);
          assert.equal(profileVersion.sub1, 0);
          assert.isAtLeast(profileVersion.sub2, 1);
        } else if (name === "InitialSchemaVersion") {
          assert.equal(profileVersion.major, 4);
          assert.equal(profileVersion.minor, 0);
          assert.equal(profileVersion.sub1, 0);
          assert.isAtLeast(profileVersion.sub2, 1);
        }
      }
      assert.equal(rowCount, 2);
    });
    iModel.close();
  });

  it("should be able to upgrade a briefcase with an older schema", async () => {
    const projectId = await HubUtility.getTestContextId(managerRequestContext);

    /**
     * Test validates that -
     * - User "manager" upgrades the BisCore schema in the briefcase from version 1.0.0 to 1.0.10+
     * - User "super" can get the upgrade "manager" made
     */

    /* Setup test - Push an iModel with an old BisCore schema up to the Hub */
    const pathname = IModelTestUtils.resolveAssetFile("CompatibilityTestSeed.bim");
    const hubName = HubUtility.generateUniqueName("CompatibilityTest");
    const iModelId = await HubUtility.pushIModel(managerRequestContext, projectId, pathname, hubName, true);

    // Download two copies of the briefcase - manager and super
    const args: RequestNewBriefcaseProps = { contextId: projectId, iModelId };
    const managerBriefcaseProps = await BriefcaseManager.downloadBriefcase(managerRequestContext, args);
    const superBriefcaseProps = await BriefcaseManager.downloadBriefcase(superRequestContext, args);

    /* User "manager" upgrades the briefcase */

    // Validate the original state of the BisCore schema in the briefcase
    let iModel = await BriefcaseDb.open(managerRequestContext, { fileName: managerBriefcaseProps.fileName });
    const beforeVersion = iModel.querySchemaVersion("BisCore");
    assert.isTrue(semver.satisfies(beforeVersion!, "= 1.0.0"));
    assert.isFalse(iModel.nativeDb.hasPendingTxns());
    iModel.close();

    // Validate that the BisCore schema is recognized as a recommended upgrade
    let schemaState = BriefcaseDb.validateSchemas(managerBriefcaseProps.fileName, true);
    assert.strictEqual(schemaState, SchemaState.UpgradeRecommended);

    // Upgrade the schemas
    await BriefcaseDb.upgradeSchemas(managerRequestContext, managerBriefcaseProps);

    // Validate state after upgrade
    let schemaLock = await IModelHost.hubAccess.querySchemaLock({ requestContext: managerRequestContext, briefcase: managerBriefcaseProps });
    assert.isFalse(schemaLock); // Validate no schema locks held by the hub
    iModel = await BriefcaseDb.open(managerRequestContext, { fileName: managerBriefcaseProps.fileName });
    managerRequestContext.enter();
    const afterVersion = iModel.querySchemaVersion("BisCore");
    assert.isTrue(semver.satisfies(afterVersion!, ">= 1.0.10"));
    assert.isFalse(iModel.nativeDb.hasPendingTxns());
    assert.isFalse(iModel.concurrencyControl.locks.hasSchemaLock);
    assert.isFalse(iModel.nativeDb.hasUnsavedChanges());
    iModel.close();

    /* User "super" can get the upgrade "manager" made */

    // Validate that the BisCore schema is recognized as a recommended upgrade
    schemaState = BriefcaseDb.validateSchemas(superBriefcaseProps.fileName, true);
    assert.strictEqual(schemaState, SchemaState.UpgradeRecommended);

    // SKIPPED FOR NOW - locking not mocked yet
    // Upgrade the schemas - should fail, since user hasn't pulled changes done by manager
    // // let result: IModelHubStatus = IModelHubStatus.Success;
    // try {
    //   await BriefcaseDb.upgradeSchemas(superRequestContext, superBriefcaseProps);
    // } catch (err) {
    //   // result = err.errorNumber;
    // }
    // assert.strictEqual(result, IModelHubStatus.PullIsRequired);

    // Open briefcase and pull change sets to upgrade
    const superIModel = await BriefcaseDb.open(superRequestContext, { fileName: superBriefcaseProps.fileName });
    superBriefcaseProps.changeSetId = await superIModel.pullAndMergeChanges(superRequestContext);
    const superVersion = superIModel.querySchemaVersion("BisCore");
    assert.isTrue(semver.satisfies(superVersion!, ">= 1.0.10"));
    assert.isFalse(superIModel.nativeDb.hasUnsavedChanges()); // Validate no changes were made
    assert.isFalse(superIModel.nativeDb.hasPendingTxns()); // Validate no changes were made
    superIModel.close();

    // Validate that there are no upgrades required
    schemaState = BriefcaseDb.validateSchemas(superBriefcaseProps.fileName, true);
    assert.strictEqual(schemaState, SchemaState.UpToDate);

    // Upgrade the schemas - ensure this is a no-op
    await BriefcaseDb.upgradeSchemas(superRequestContext, superBriefcaseProps);
    superRequestContext.enter();

    // Ensure there are no schema locks
    schemaLock = await IModelHost.hubAccess.querySchemaLock({ requestContext: superRequestContext, briefcase: superBriefcaseProps });
    assert.isFalse(schemaLock); // Validate no schema locks held by the hub

    /* Cleanup after test */
    await IModelHost.hubAccess.deleteIModel({ requestContext: managerRequestContext, contextId: projectId, iModelId });
  });

});
