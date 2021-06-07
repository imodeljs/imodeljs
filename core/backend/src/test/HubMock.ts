/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { join } from "path";
import * as sinon from "sinon";
import { Guid, GuidString } from "@bentley/bentleyjs-core";
import { CodeProps, IModelVersion } from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import {
  BackendHubAccess, BriefcaseDbArg, BriefcaseIdArg, ChangesetFileProps, ChangesetId, ChangesetIdArg, ChangesetProps, ChangesetRange, CheckPointArg,
  IModelIdArg, LocalDirName, LocalFileName, LockProps,
} from "../BackendHubAccess";
import { AuthorizedBackendRequestContext } from "../BackendRequestContext";
import { BriefcaseManager } from "../BriefcaseManager";
import { SnapshotDb } from "../IModelDb";
import { IModelHost } from "../IModelHost";
import { IModelHubBackend } from "../IModelHubBackend";
import { IModelJsFs } from "../IModelJsFs";
import { HubUtility } from "./integration/HubUtility";
import { KnownTestLocations } from "./KnownTestLocations";
import { LocalHub, LocalHubProps } from "./LocalHub";

/**
 * Mocks iModelHub for testing creating Briefcases, downloading checkpoints, and simulating multiple users pushing and pulling changesets, etc.
 *
 * Generally, tests for apis that *create or modify* iModels can and should be mocked. Otherwise they:
 * - create tremendous load on the test servers when they run on programmer's desktops and in CI jobs
 * - waste network and data center resources (i.e. $$$s),
 * - interfere with other tests running on the same or other systems, and
 * - (far worse) are the source of test flakiness outside of the api being tested.
 *
 * This class can be used to create tests that do not require authentication, are synchronous,
 * are guaranteed to be self-contained (i.e. do not interfere with other tests running at the same time or later), and do not fail for reasons outside
 * of the control of the test itself. As a bonus, in addition to making tests more reliable, mocking IModelHub generally makes tests run *much* faster.
 *
 * On the other hand, tests that expect to find an existing iModels, checkpoints, changesets, etc. in IModelHub cannot be mocked. In that case, those tests
 * should be careful to NOT modify the data, since doing so causes interference with other tests running simultaneously. These tests should be limited to
 * low level testing of the core apis only.
 *
 * To initialize HubMock, call [[startup]] at the beginning of your test, usually in `describe.before`. Thereafter, all access to iModelHub for an iModel will be
 * directed to a [[LocalHub]] - your test code does not change. After the test(s) complete, call [[shutdown]] (usually in `describe.after`) to stop mocking IModelHub and clean
 * up any resources used by the test(s). If you want to mock a single test, call [[startup]] as the first line and [[shutdown]] as the last. If you wish to run the
 * test against a "real" IModelHub, you can simply comment off the call [[startup]], though in that case you should make sure the name of your
 * iModel is unique so your test won't collide with other tests (iModel name uniqueness is not necessary for mocked tests.)
 *
 * Mocked tests must always start by creating a new iModel via [[IModelHost.hubAccess.createIModel]] with a `revision0` iModel.
 * They use mock (aka "bogus") credentials for `AccessTokens`, which is fine since [[HubMock]] never accesses resources outside the current
 * computer. The mock `AccessTokens` are obtained by calling [[IModelTestUtils.getUserContext]]. There are 4 user profiles (Regular, Manager,
 * Super, SuperManager) for simulating different users/roles.
 *
 * @note Only one HubMock at a time, *running in a single process*, may be active. The comments above about multiple simultaneous tests refer to tests
 * running on different computers, or on a single computer in multiple processes. All of those scenarios are problematic without mocking.
 *
 * @internal
 */
export class HubMock {
  private static mockRoot: LocalDirName | undefined;
  private static hubs = new Map<string, LocalHub>();
  private static _saveHubAccess: BackendHubAccess;

  /** Determine whether a test us currently being run under HubMock */
  public static get isValid() { return undefined !== this.mockRoot; }

  /**
   * Begin mocking IModelHub access. After this call, all access to IModelHub will be directed to a [[LocalHub]].
   * @param mockName a unique name (e.g. "MyTest") for this HubMock to disambiguate tests when more than one is simultaneously active.
   * It is used to create a private directory used by the HubMock for a test. That directory is removed when [[shutdown]] is called.
   */
  public static startup(mockName: LocalDirName) {
    if (this.isValid)
      throw new Error("Either a previous test did not call HubMock.shutdown() properly, or more than one test is simultaneously attempting to use HubMock, which is not allowed");

    this.hubs.clear();
    this.mockRoot = join(KnownTestLocations.outputDir, "HubMock", mockName);
    IModelJsFs.recursiveMkDirSync(this.mockRoot);
    IModelJsFs.purgeDirSync(this.mockRoot);
    this._saveHubAccess = IModelHost.hubAccess;
    IModelHost.setHubAccess(this);
    HubUtility.contextId = Guid.createValue(); // all iModels for this test get the same "contextId"

    sinon.stub(IModelVersion, "getLatestChangeSetId").callsFake(async (): Promise<GuidString> => {
      throw new Error("this method is deprecated and cannot be used while IModelHub is mocked - use IModelHost.hubaccess.getChangesetIdFromVersion");
    });

    sinon.stub(IModelVersion, "getChangeSetFromNamedVersion").callsFake(async (): Promise<GuidString> => {
      throw new Error("this method is deprecated and cannot be used while IModelHub is mocked - use IModelHost.hubaccess.getChangesetIdFromVersion");
    });

    sinon.stub(IModelHubBackend, "iModelClient").get(() => {
      throw new Error("IModelHubAccess is mocked for this test - use only IModelHost.hubaccess functions");
    });

  }

  /** Stop a HubMock that was previously started with [[startup]]
   * @note this function throws an exception if any of the iModels used during the tests are left open.
   */
  public static shutdown() {
    if (!this.isValid)
      return;

    HubUtility.contextId = undefined;
    for (const hub of this.hubs)
      hub[1].cleanup();

    this.hubs.clear();
    IModelJsFs.purgeDirSync(this.mockRoot!);
    IModelJsFs.removeSync(this.mockRoot!);
    sinon.restore();
    IModelHost.setHubAccess(this._saveHubAccess);
    this.mockRoot = undefined;
  }

  public static findLocalHub(iModelId: GuidString): LocalHub {
    const hub = this.hubs.get(iModelId);
    if (!hub)
      throw new Error(`local hub for iModel ${iModelId} not created`);
    return hub;
  }

  /** create a [[LocalHub]] for an iModel.  */
  public static create(arg: LocalHubProps) {
    if (!this.mockRoot)
      throw new Error("call startup first");

    const mock = new LocalHub(join(this.mockRoot, arg.iModelId), arg);
    this.hubs.set(arg.iModelId, mock);
  }

  /** remove the [[LocalHub]] for an iModel */
  public static destroy(iModelId: GuidString) {
    const hub = this.findLocalHub(iModelId);
    hub.cleanup();
    this.hubs.delete(iModelId);
  }

  /** All methods below are mocks of the [[BackendHubAccess]] interface */

  public static async getChangesetIdFromNamedVersion(arg: IModelIdArg & { versionName: string }): Promise<string> {
    return this.findLocalHub(arg.iModelId).findNamedVersion(arg.versionName);
  }

  public static async getChangesetIdFromVersion(arg: IModelIdArg & { version: IModelVersion }): Promise<string> {
    const version = arg.version;
    if (version.isFirst)
      return "";

    const asOf = version.getAsOfChangeSet();
    if (asOf)
      return asOf;

    const versionName = version.getName();
    if (versionName)
      return this.getChangesetIdFromNamedVersion({ ...arg, versionName });

    return this.getLatestChangesetId(arg);
  }

  public static async getLatestChangesetId(arg: IModelIdArg): Promise<string> {
    return this.findLocalHub(arg.iModelId).getLatestChangesetId();
  }

  public static async getChangesetIndexFromId(arg: IModelIdArg & { changesetId: ChangesetId }): Promise<number> {
    return this.findLocalHub(arg.iModelId).getChangesetIndex(arg.changesetId);
  }

  public static async getMyBriefcaseIds(arg: IModelIdArg): Promise<number[]> {
    const requestContext = arg.requestContext ?? await AuthorizedBackendRequestContext.create();
    return this.findLocalHub(arg.iModelId).getBriefcaseIds(requestContext.accessToken.getUserInfo()!.id);
  }

  public static async acquireNewBriefcaseId(arg: IModelIdArg): Promise<number> {
    const requestContext = arg.requestContext ?? await AuthorizedBackendRequestContext.create();
    return this.findLocalHub(arg.iModelId).acquireNewBriefcaseId(requestContext.accessToken.getUserInfo()!.id);

  }
  /** Release a briefcaseId. After this call it is illegal to generate changesets for the released briefcaseId. */
  public static async releaseBriefcase(arg: BriefcaseIdArg): Promise<void> {
    return this.findLocalHub(arg.iModelId).releaseBriefcaseId(arg.briefcaseId);
  }

  public static async downloadChangeset(arg: ChangesetIdArg): Promise<ChangesetFileProps> {
    return this.findLocalHub(arg.iModelId).downloadChangeset({ changesetId: arg.changesetId, targetDir: BriefcaseManager.getChangeSetsPath(arg.iModelId) });
  }

  public static async downloadChangesets(arg: IModelIdArg & { range?: ChangesetRange }): Promise<ChangesetFileProps[]> {
    return this.findLocalHub(arg.iModelId).downloadChangesets({ range: arg.range, targetDir: BriefcaseManager.getChangeSetsPath(arg.iModelId) });
  }

  public static async queryChangeset(arg: IModelIdArg & { changesetId: ChangesetId }): Promise<ChangesetProps> {
    return this.findLocalHub(arg.iModelId).getChangesetById(arg.changesetId);
  }

  public static async queryChangesets(arg: IModelIdArg & { range?: ChangesetRange }): Promise<ChangesetProps[]> {
    return this.findLocalHub(arg.iModelId).queryChangesets(arg.range);
  }

  public static async pushChangeset(arg: IModelIdArg & { changesetProps: ChangesetFileProps, releaseLocks: boolean }): Promise<void> {
    return this.findLocalHub(arg.iModelId).addChangeset(arg.changesetProps);
  }

  public static async downloadV2Checkpoint(arg: CheckPointArg): Promise<ChangesetId> {
    return this.findLocalHub(arg.checkpoint.iModelId).downloadCheckpoint({ changesetId: arg.checkpoint.changeSetId, targetFile: arg.localFile });
  }

  public static async downloadV1Checkpoint(arg: CheckPointArg): Promise<ChangesetId> {
    return this.findLocalHub(arg.checkpoint.iModelId).downloadCheckpoint({ changesetId: arg.checkpoint.changeSetId, targetFile: arg.localFile });
  }

  public static async releaseAllLocks(_arg: BriefcaseIdArg) {
  }

  public static async releaseAllCodes(_arg: BriefcaseIdArg) {
  }

  public static async queryAllLocks(_arg: BriefcaseDbArg): Promise<LockProps[]> {
    return [];
  }

  public static async queryAllCodes(_arg: BriefcaseDbArg): Promise<CodeProps[]> {
    return [];
  }

  public static async acquireLocks(_arg: BriefcaseDbArg & { locks: LockProps[] }): Promise<void> {
  }

  public static async acquireSchemaLock(_arg: BriefcaseDbArg): Promise<void> {
  }

  public static async querySchemaLock(_arg: BriefcaseDbArg): Promise<boolean> {
    return false;
  }

  public static async queryIModelByName(arg: { requestContext?: AuthorizedClientRequestContext, contextId: GuidString, iModelName: string }): Promise<GuidString | undefined> {
    for (const hub of this.hubs) {
      const localHub = hub[1];
      if (localHub.contextId === arg.contextId && localHub.iModelName === arg.iModelName)
        return localHub.iModelId;
    }
    return undefined;
  }

  public static async createIModel(arg: { requestContext?: AuthorizedClientRequestContext, contextId: GuidString, iModelName: string, description?: string, revision0?: LocalFileName }): Promise<GuidString> {
    const revision0 = arg.revision0 ?? join(this.mockRoot!, "revision0.bim");

    const localProps = { ...arg, iModelId: Guid.createValue(), revision0 };
    if (!arg.revision0) { // if they didn't supply a revision0 file, create a blank one.
      const blank = SnapshotDb.createEmpty(revision0, { rootSubject: { name: arg.description ?? arg.iModelName } });
      blank.saveChanges();
      blank.close();
    }

    this.create(localProps);
    if (!arg.revision0)
      IModelJsFs.removeSync(revision0);

    return localProps.iModelId;
  }

  public static async deleteIModel(arg: IModelIdArg & { contextId: GuidString }): Promise<void> {
    return this.destroy(arg.iModelId);
  }

}

