/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { join } from "path";
import { Guid } from "@bentley/bentleyjs-core";
import { ChangesetFileProps, ChangesetType } from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { LockProps, LockScope } from "../../BackendHubAccess";
import { BriefcaseManager } from "../../BriefcaseManager";
import { IModelHost } from "../../IModelHost";
import { IModelJsFs } from "../../IModelJsFs";
import { HubMock } from "../HubMock";
import { IModelTestUtils, TestUserType } from "../IModelTestUtils";
import { KnownTestLocations } from "../KnownTestLocations";
import { LockStatusExclusive, LockStatusShared } from "../LocalHub";

describe("HubMock", () => {
  const tmpDir = join(KnownTestLocations.outputDir, "HubMockTest");
  const contextId = Guid.createValue();
  const revision0 = IModelTestUtils.resolveAssetFile("test.bim");
  let requestContext: AuthorizedClientRequestContext;

  before(async () => {
    HubMock.startup("HubMockTest");
    requestContext = await IModelTestUtils.getUserContext(TestUserType.Regular);
  });
  after(() => {
    HubMock.shutdown();
  });

  it("should be able to create HubMock", async () => {
    const iModelId = await IModelHost.hubAccess.createIModel({ contextId, iModelName: "test imodel", revision0 });
    const localHub = HubMock.findLocalHub(iModelId);
    let checkpoints = localHub.getCheckpoints();
    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0], 0);

    const cp1 = join(tmpDir, "cp-1.bim");
    localHub.downloadCheckpoint({ changeset: { index: 0 }, targetFile: cp1 });
    const stat1 = IModelJsFs.lstatSync(cp1);
    const statRev0 = IModelJsFs.lstatSync(revision0);
    assert.equal(stat1?.size, statRev0?.size);

    assert.equal(2, localHub.acquireNewBriefcaseId("user1"));
    assert.equal(3, localHub.acquireNewBriefcaseId("user2"));
    assert.equal(4, localHub.acquireNewBriefcaseId("user3"));

    let briefcases = localHub.getBriefcases();
    assert.equal(briefcases.length, 3);
    assert.deepEqual(briefcases[0], { id: 2, user: "user1" });
    assert.deepEqual(briefcases[1], { id: 3, user: "user2" });
    assert.deepEqual(briefcases[2], { id: 4, user: "user3" });

    localHub.releaseBriefcaseId(2);
    briefcases = localHub.getBriefcases();
    assert.equal(briefcases.length, 2);
    assert.deepEqual(briefcases[0], { id: 3, user: "user2" });
    assert.deepEqual(briefcases[1], { id: 4, user: "user3" });

    localHub.releaseBriefcaseId(4);
    briefcases = localHub.getBriefcases();
    assert.equal(briefcases.length, 1);
    assert.deepEqual(briefcases[0], { id: 3, user: "user2" });

    assert.equal(5, localHub.acquireNewBriefcaseId("user4"));
    briefcases = localHub.getBriefcases();
    assert.equal(briefcases.length, 2);
    assert.deepEqual(briefcases[0], { id: 3, user: "user2" });
    assert.deepEqual(briefcases[1], { id: 5, user: "user4" });

    const cs1: ChangesetFileProps = {
      id: "changeset0", description: "first changeset", changesType: ChangesetType.Regular, parentId: "", briefcaseId: 100, pushDate: "", index: 0,
      userCreated: "user1", pathname: IModelTestUtils.resolveAssetFile("CloneTest.01.00.00.ecschema.xml"),
    };
    cs1.index = localHub.addChangeset(cs1);
    const changesets1 = localHub.queryChangesets();
    assert.equal(changesets1.length, 1);
    assert.equal(changesets1[0].id, cs1.id);
    assert.equal(changesets1[0].description, cs1.description);
    assert.equal(changesets1[0].changesType, cs1.changesType);
    assert.equal(changesets1[0].index, 1);
    assert.equal(changesets1[0].briefcaseId, 100);
    assert.isAtLeast(changesets1[0].size!, 1);
    assert.equal(changesets1[0].parentId, "");
    assert.isDefined(changesets1[0].pushDate);
    assert.equal(cs1.id, localHub.getLatestChangeset().id);

    const cs2: ChangesetFileProps = {
      id: "changeset1", parentId: "changeset0", description: "second changeset", changesType: ChangesetType.Schema, briefcaseId: 200, pushDate: "", index: 0,
      userCreated: "user2", pathname: IModelTestUtils.resolveAssetFile("CloneTest.01.00.01.ecschema.xml"),
    };
    cs2.index = localHub.addChangeset(cs2);
    const changesets2 = localHub.queryChangesets();
    assert.equal(changesets2.length, 2);
    assert.deepEqual(changesets1[0], changesets2[0]);
    assert.equal(changesets2[1].id, cs2.id);
    assert.equal(changesets2[1].parentId, cs2.parentId);
    assert.equal(changesets2[1].description, cs2.description);
    assert.equal(changesets2[1].changesType, cs2.changesType);
    assert.equal(changesets2[1].index, 2);
    assert.equal(changesets2[1].briefcaseId, 200);
    assert.isAtLeast(changesets2[1].size!, 1);
    assert.isDefined(changesets2[1].pushDate);
    assert.equal(cs2.id, localHub.getLatestChangeset().id);

    localHub.uploadCheckpoint({ changesetIndex: cs2.index, localFile: revision0 });
    checkpoints = localHub.getCheckpoints();
    assert.equal(checkpoints.length, 2);
    assert.equal(checkpoints[1], 2);

    const version1 = "release 1";
    const version2 = "release 2";
    localHub.addNamedVersion({ versionName: version1, csIndex: cs1.index });
    localHub.addNamedVersion({ versionName: version2, csIndex: cs2.index });
    assert.equal(localHub.findNamedVersion(version1).index, cs1.index);
    expect(() => localHub.findNamedVersion("not there")).throws("not found");
    expect(() => localHub.addNamedVersion({ versionName: version2, csIndex: cs2.index })).throws("insert");
    localHub.deleteNamedVersion(version1);
    expect(() => localHub.findNamedVersion(version1)).throws("not found");

    // test for duplicate changeset id
    const cs3: ChangesetFileProps = { id: "changeset0", parentId: "changeset1", description: "third changeset", changesType: ChangesetType.Regular, pathname: cs1.pathname, briefcaseId: 100, userCreated: "", pushDate: "", index: 0 };
    expect(() => localHub.addChangeset(cs3)).throws("can't insert");
    // now test for valid changeset id, but bad parentId
    const cs4 = { ...cs3, id: "changeset4", parentId: "bad", description: "fourth changeset" };
    expect(() => localHub.addChangeset(cs4)).throws("bad not found");

    cs3.id = "changeset3";
    cs3.parentId = cs2.id;
    cs3.index = localHub.addChangeset(cs3);
    assert.equal(0, localHub.queryPreviousCheckpoint(0));
    assert.equal(0, localHub.queryPreviousCheckpoint(cs1.index));
    assert.equal(cs2.index, localHub.queryPreviousCheckpoint(cs2.index));
    assert.equal(cs2.index, localHub.queryPreviousCheckpoint(cs3.index));

    const cSets = localHub.downloadChangesets({ range: { first: cs1.index, end: cs2.index }, targetDir: tmpDir });
    assert.equal(cSets.length, 2);
    assert.equal(cSets[0].id, cs1.id);
    assert.equal(cSets[0].changesType, cs1.changesType);
    assert.equal(cSets[0].userCreated, cs1.userCreated);
    assert.equal(cSets[0].parentId, cs1.parentId);
    assert.equal(cSets[0].description, cs1.description);

    assert.equal(cSets[1].id, cs2.id);
    assert.equal(cSets[1].changesType, cs2.changesType);
    assert.equal(cSets[1].userCreated, cs2.userCreated);
    assert.equal(cSets[1].parentId, cs2.parentId);
    assert.equal(cSets[1].description, cs2.description);

    const orig1 = IModelJsFs.readFileSync(cs1.pathname);
    const downloaded1 = IModelJsFs.readFileSync(cSets[0].pathname);
    assert.deepEqual(orig1, downloaded1);

    const orig2 = IModelJsFs.readFileSync(cs2.pathname);
    const downloaded2 = IModelJsFs.readFileSync(cSets[1].pathname);
    assert.deepEqual(orig2, downloaded2);
    assert.notDeepEqual(orig1, orig2);

    const lock1: LockProps = {
      scope: LockScope.Shared,
      entityId: "0x12",
    };
    localHub.requestLock(lock1, { briefcaseId: 1, changeSetId: cs1.id });
    let lockStat = localHub.queryLockStatus(lock1.entityId);
    assert.equal(lockStat.scope, LockScope.Shared);
    assert.equal((lockStat as LockStatusShared).sharedBy.size, 1);
    assert.isTrue((lockStat as LockStatusShared).sharedBy.has(1));

    assert.isUndefined(lockStat.lastCsIndex);
    localHub.requestLock(lock1, { briefcaseId: 10, changeSetId: cs1.id });
    lockStat = localHub.queryLockStatus(lock1.entityId);
    assert.equal((lockStat as LockStatusShared).sharedBy.size, 2);
    assert.isTrue((lockStat as LockStatusShared).sharedBy.has(1));
    assert.isTrue((lockStat as LockStatusShared).sharedBy.has(10));

    expect(() => localHub.requestLock({ ...lock1, scope: LockScope.Exclusive }, { briefcaseId: 2, changeSetId: "cs1" })).to.throw("cannot obtain exclusive");
    expect(() => localHub.releaseLock({ props: lock1, briefcaseId: 9, csIndex: cs1.index })).to.throw("shared lock not held");

    localHub.releaseLock({ props: lock1, briefcaseId: 1, csIndex: cs1.index });
    lockStat = localHub.queryLockStatus(lock1.entityId);
    assert.equal((lockStat as LockStatusShared).sharedBy.size, 1);

    localHub.releaseLock({ props: lock1, briefcaseId: 10, csIndex: cs1.index });
    lockStat = localHub.queryLockStatus(lock1.entityId);
    assert.equal(lockStat.scope, LockScope.None);

    lock1.scope = LockScope.Exclusive;
    localHub.requestLock(lock1, { briefcaseId: 4, changeSetId: cs1.id });
    lockStat = localHub.queryLockStatus(lock1.entityId);
    assert.equal(lockStat.scope, LockScope.Exclusive);
    localHub.requestLock(lock1, { briefcaseId: 4, changeSetId: cs1.id });
    expect(() => localHub.requestLock(lock1, { briefcaseId: 5, changeSetId: cs1.id })).to.throw("already owned");
    expect(() => localHub.requestLock({ ...lock1, scope: LockScope.Shared }, { briefcaseId: 5, changeSetId: cs1.id })).to.throw("already owned");
    localHub.releaseLock({ props: lock1, briefcaseId: 4, csIndex: cs2.index });
    lockStat = localHub.queryLockStatus(lock1.entityId);
    assert.equal(lockStat.scope, LockScope.None);
    assert.equal(lockStat.lastCsIndex, cs2.index);

    expect(() => localHub.requestLock(lock1, { briefcaseId: 5, changeSetId: cs1.id })).to.throw("Pull is required");
    localHub.requestLock(lock1, { briefcaseId: 5, changeSetId: cs2.id });
    lockStat = localHub.queryLockStatus(lock1.entityId);
    assert.equal(lockStat.scope, LockScope.Exclusive);
    assert.equal((lockStat as LockStatusExclusive).briefcaseId, 5);
    assert.equal(lockStat.lastCsIndex, cs2.index);

    localHub.requestLock({ scope: LockScope.Exclusive, entityId: "0x22" }, { briefcaseId: 5, changeSetId: cs1.id });
    lockStat = localHub.queryLockStatus("0x22");
    assert.equal(lockStat.scope, LockScope.Exclusive);
    assert.equal((lockStat as LockStatusExclusive).briefcaseId, 5);
    assert.isUndefined(lockStat.lastCsIndex);

    localHub.requestLock({ scope: LockScope.Exclusive, entityId: "0x23" }, { briefcaseId: 6, changeSetId: cs1.id });
    localHub.requestLock({ scope: LockScope.Shared, entityId: "0x24" }, { briefcaseId: 6, changeSetId: cs1.id });
    localHub.requestLock({ scope: LockScope.Shared, entityId: "0x24" }, { briefcaseId: 5, changeSetId: cs1.id });

    const locks = localHub.queryAllLocks(5);
    assert.equal(locks.length, 3);

    await IModelHost.hubAccess.deleteIModel({ contextId, iModelId });
  });

  it("use HubMock with BriefcaseManager", async () => {
    const iModelId = await IModelHost.hubAccess.createIModel({ contextId, iModelName: "test imodel", revision0 });
    const briefcase = await BriefcaseManager.downloadBriefcase(requestContext, { contextId, iModelId });
    assert.equal(briefcase.briefcaseId, 2);
    assert.equal(briefcase.changeSetId, "");
    assert.equal(briefcase.iModelId, iModelId);
    assert.equal(briefcase.contextId, contextId);
    await IModelHost.hubAccess.deleteIModel({ contextId, iModelId });
  });
});
