/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module HubAccess
 */

import { join } from "path";
import { AzureFileHandler } from "@bentley/backend-itwin-client";
import { BriefcaseStatus, GuidString, IModelStatus, Logger } from "@bentley/bentleyjs-core";
import {
  BriefcaseQuery, ChangeSet, ChangeSetQuery, ChangesType, CheckpointQuery, CheckpointV2Query, CodeQuery, IModelBankClient, IModelClient, IModelHubClient, IModelQuery,
  Lock, LockLevel, LockQuery, LockType, VersionQuery,
} from "@bentley/imodelhub-client";
import { CodeProps, IModelError, IModelVersion } from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext, ProgressCallback, UserCancelledError } from "@bentley/itwin-client";
import { AuthorizedBackendRequestContext } from "./BackendRequestContext";
import { BriefcaseManager } from "./BriefcaseManager";
import {
  BriefcaseDbArg, BriefcaseIdArg, ChangesetFileProps, ChangesetId, ChangesetIdArg, ChangesetProps, ChangesetRange, CheckPointArg, IModelIdArg,
  LockProps,
} from "./BackendHubAccess";
import { IModelHost } from "./IModelHost";
import { IModelJsFs } from "./IModelJsFs";
import { ConcurrencyControl } from "./ConcurrencyControl";

/** @internal */
export class IModelHubBackend {

  private static _imodelClient?: IModelClient;
  private static _isIModelBankClient = false;

  public static setIModelClient(client?: IModelClient) {
    this._imodelClient = client;
    this._isIModelBankClient = client instanceof IModelBankClient;
  }

  public static get isUsingIModelBankClient(): boolean {
    return this._isIModelBankClient;
  }

  public static get iModelClient(): IModelClient {
    if (!this._imodelClient)
      this._imodelClient = new IModelHubClient(new AzureFileHandler());

    return this._imodelClient;
  }

  public static async getRequestContext(arg: { requestContext?: AuthorizedClientRequestContext }) {
    return arg.requestContext ?? AuthorizedBackendRequestContext.create();
  }

  public static async getLatestChangesetId(arg: IModelIdArg): Promise<string> {
    const requestContext = await this.getRequestContext(arg);
    const changeSets: ChangeSet[] = await this.iModelClient.changeSets.get(requestContext, arg.iModelId, new ChangeSetQuery().top(1).latest());
    return (changeSets.length === 0) ? "" : changeSets[changeSets.length - 1].wsgId;
  }

  public static async getChangesetIdFromNamedVersion(arg: IModelIdArg & { versionName: string }): Promise<string> {
    const requestContext = await this.getRequestContext(arg);
    const versions = await this.iModelClient.versions.get(requestContext, arg.iModelId, new VersionQuery().select("ChangeSetId").byName(arg.versionName));
    if (!versions[0] || !versions[0].changeSetId)
      throw new IModelError(IModelStatus.NotFound, `Named version ${arg.versionName} not found`);
    return versions[0].changeSetId;
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

  public static async createIModel(arg: { requestContext?: AuthorizedClientRequestContext, contextId: GuidString, iModelName: string, description?: string, revision0?: string }): Promise<GuidString> {
    if (this.isUsingIModelBankClient)
      throw new IModelError(IModelStatus.BadRequest, "This is a iModelHub only operation");

    const requestContext = await this.getRequestContext(arg);
    const hubIModel = await this.iModelClient.iModels.create(requestContext, arg.contextId, arg.iModelName, { path: arg.revision0, description: arg.description });
    requestContext.enter();
    return hubIModel.wsgId;
  }

  public static async deleteIModel(arg: IModelIdArg & { contextId: GuidString }): Promise<void> {
    const dirName = BriefcaseManager.getIModelPath(arg.iModelId);
    if (IModelJsFs.existsSync(dirName)) {
      IModelJsFs.purgeDirSync(dirName);
      IModelJsFs.rmdirSync(dirName);
    }
    return this.iModelClient.iModels.delete(await this.getRequestContext(arg), arg.contextId, arg.iModelId);
  }

  public static async queryIModelByName(arg: { requestContext?: AuthorizedClientRequestContext, contextId: GuidString, iModelName: string }): Promise<GuidString | undefined> {
    const iModels = await this.iModelClient.iModels.get(await this.getRequestContext(arg), arg.contextId, new IModelQuery().byName(arg.iModelName));
    return iModels.length === 0 ? undefined : iModels[0].id!;
  }

  public static async pushChangeset(arg: IModelIdArg & { changesetProps: ChangesetFileProps, releaseLocks: boolean }) {
    const changeset = new ChangeSet();
    const changesetProps = arg.changesetProps;
    changeset.id = changesetProps.id;
    changeset.parentId = changesetProps.parentId;
    changeset.changesType = changesetProps.changesType;
    changeset.fileSize = changesetProps.size!.toString();
    changeset.description = changesetProps.description;
    changeset.briefcaseId = changesetProps.briefcaseId;
    if (changeset.description.length >= 255) {
      Logger.logWarning("imodelhub-access", `pushChanges - Truncating description to 255 characters. ${changeset.description}`);
      changeset.description = changeset.description.slice(0, 254);
    }

    const requestContext = await this.getRequestContext(arg);
    requestContext.enter();
    await this.iModelClient.changeSets.create(requestContext, arg.iModelId, changeset, changesetProps.pathname);
    if (arg.releaseLocks)
      return this.iModelClient.locks.deleteAll(requestContext, arg.iModelId, arg.changesetProps.briefcaseId);

  }

  /** Releases a briefcaseId from iModelHub. After this call it is illegal to generate changesets for the released briefcaseId.
   * @note generally, this method should not be called directly. Instead use [[deleteBriefcaseFiles]].
   * @see deleteBriefcaseFiles
   */
  public static async releaseBriefcase(arg: BriefcaseIdArg): Promise<void> {
    const { briefcaseId, iModelId } = arg;
    const requestContext = await this.getRequestContext(arg);
    try {
      await this.iModelClient.briefcases.get(requestContext, iModelId, new BriefcaseQuery().byId(briefcaseId));
      requestContext.enter();
    } catch (error) {
      requestContext.enter();
      throw error;
    }

    await this.iModelClient.briefcases.delete(requestContext, iModelId, briefcaseId);
    requestContext.enter();
  }

  public static async getMyBriefcaseIds(arg: IModelIdArg): Promise<number[]> {
    const requestContext = await this.getRequestContext(arg);
    const myHubBriefcases = await this.iModelClient.briefcases.get(requestContext, arg.iModelId, new BriefcaseQuery().ownedByMe().selectDownloadUrl());
    const myBriefcaseIds: number[] = [];
    for (const hubBc of myHubBriefcases)
      myBriefcaseIds.push(hubBc.briefcaseId!); // save the list of briefcaseIds we already own.
    return myBriefcaseIds;
  }

  public static async acquireNewBriefcaseId(arg: { requestContext?: AuthorizedClientRequestContext, iModelId: GuidString }): Promise<number> {
    const requestContext = await this.getRequestContext(arg);
    const briefcase = await this.iModelClient.briefcases.create(requestContext, arg.iModelId);
    requestContext.enter();

    if (!briefcase)
      throw new IModelError(BriefcaseStatus.CannotAcquire, "Could not acquire briefcase");

    return briefcase.briefcaseId!;
  }

  public static async getChangesetIndexFromId(arg: IModelIdArg & { changesetId: ChangesetId }): Promise<number> {
    if (arg.changesetId === "")
      return 0; // the first version

    const requestContext = await this.getRequestContext(arg);
    const changeSet = (await this.iModelClient.changeSets.get(requestContext, arg.iModelId, new ChangeSetQuery().byId(arg.changesetId)))[0];
    requestContext.enter();
    return +changeSet.index!;
  }

  public static toChangeSetProps(cs: ChangeSet): ChangesetProps {
    return {
      id: cs.wsgId, parentId: cs.parentId ? cs.parentId : "", briefcaseId: cs.briefcaseId!, pushDate: cs.pushDate!,
      description: cs.description ?? "", changesType: cs.changesType ?? ChangesType.Regular, userCreated: cs.userCreated!,
    };
  }
  private static toChangeSetFileProps(cs: ChangeSet, basePath: string): ChangesetFileProps {
    const csProps = this.toChangeSetProps(cs) as ChangesetFileProps;
    csProps.pathname = join(basePath, cs.fileName!);
    return csProps;
  }

  public static async queryChangeSetProps(arg: IModelIdArg & { changesetId: ChangesetId }): Promise<ChangesetProps> {
    const query = new ChangeSetQuery();
    query.byId(arg.changesetId);

    const requestContext = await this.getRequestContext(arg);
    const changeSets = await this.iModelClient.changeSets.get(requestContext, arg.iModelId, query);
    if (changeSets.length === 0)
      throw new Error(`Unable to find change set ${arg.changesetId} for iModel ${arg.iModelId}`);

    return this.toChangeSetProps(changeSets[0]);
  }

  public static async queryChangeset(arg: ChangesetIdArg): Promise<ChangesetProps> {
    const requestContext = await this.getRequestContext(arg);
    const changeSets = await this.iModelClient.changeSets.get(requestContext, arg.iModelId, new ChangeSetQuery().byId(arg.changesetId));
    if (undefined === changeSets)
      throw new IModelError(IModelStatus.NotFound, `ChangeSet ${arg.changesetId} not found`);

    return this.toChangeSetProps(changeSets[0]);
  }

  public static async downloadChangeset(arg: ChangesetIdArg): Promise<ChangesetFileProps> {
    const requestContext = await this.getRequestContext(arg);
    const changeSetsPath = BriefcaseManager.getChangeSetsPath(arg.iModelId);

    const changeSets = await this.iModelClient.changeSets.download(requestContext, arg.iModelId, new ChangeSetQuery().byId(arg.changesetId), changeSetsPath);
    if (undefined === changeSets)
      throw new IModelError(IModelStatus.NotFound, `ChangeSet ${arg.changesetId} not found`);

    return this.toChangeSetFileProps(changeSets[0], BriefcaseManager.getChangeSetsPath(arg.iModelId));
  }

  private static async getQueryFromRange(arg: IModelIdArg & { range?: ChangesetRange }): Promise<ChangeSetQuery | undefined> {
    const query = new ChangeSetQuery();
    if (!arg.range)
      return query; // returns all changesets

    const range = arg.range;
    const after = range.after ?? (range.first === "" ? "" : (await this.queryChangeSetProps({ ...arg, changesetId: range.first })).parentId);
    if (range.end === "" || after === range.end)
      return undefined;

    if (!range.end)
      query.fromId(after); //
    else
      query.betweenChangeSets(range.end, after); // note: weird order is necessary because second arg being blank means "from start"

    return query;
  }

  /** queries for change sets in the specified range. */
  public static async queryChangesets(arg: IModelIdArg & { range?: ChangesetRange }): Promise<ChangesetProps[]> {
    const query = await this.getQueryFromRange(arg);
    const val: ChangesetProps[] = [];
    if (query) {
      const requestContext = await this.getRequestContext(arg);
      const changeSets = await this.iModelClient.changeSets.get(requestContext, arg.iModelId, query);
      requestContext.enter();

      for (const cs of changeSets)
        val.push(this.toChangeSetProps(cs));
    }
    return val;
  }

  /** Downloads change sets in the specified range. */
  public static async downloadChangesets(arg: IModelIdArg & { range?: ChangesetRange }): Promise<ChangesetFileProps[]> {
    const val: ChangesetFileProps[] = [];
    const query = await this.getQueryFromRange(arg);
    if (query) {
      const requestContext = await this.getRequestContext(arg);
      const changeSetsPath = BriefcaseManager.getChangeSetsPath(arg.iModelId);
      const changeSets = await this.iModelClient.changeSets.download(requestContext, arg.iModelId, query, changeSetsPath);

      for (const cs of changeSets)
        val.push(this.toChangeSetFileProps(cs, changeSetsPath));
    }
    return val;
  }

  public static async downloadV1Checkpoint(arg: CheckPointArg): Promise<ChangesetId> {
    const checkpoint = arg.checkpoint;
    let checkpointQuery = new CheckpointQuery().selectDownloadUrl();
    checkpointQuery = checkpointQuery.precedingCheckpoint(checkpoint.changeSetId);
    const requestContext = checkpoint.requestContext ?? await AuthorizedBackendRequestContext.create();
    const checkpoints = await this.iModelClient.checkpoints.get(requestContext, checkpoint.iModelId, checkpointQuery);
    if (checkpoints.length !== 1)
      throw new IModelError(BriefcaseStatus.VersionNotFound, "no checkpoints not found");

    const cancelRequest: any = {};
    const progressCallback: ProgressCallback = (progress) => {
      if (arg.onProgress && arg.onProgress(progress.loaded, progress.total!) !== 0)
        cancelRequest.cancel?.();
    };

    await this.iModelClient.checkpoints.download(requestContext, checkpoints[0], arg.localFile, progressCallback, cancelRequest);
    return checkpoints[0].mergedChangeSetId!;
  }

  public static async downloadV2Checkpoint(arg: CheckPointArg): Promise<ChangesetId> {
    const checkpoint = arg.checkpoint;
    let checkpointQuery = new CheckpointV2Query();
    checkpointQuery = checkpointQuery.precedingCheckpointV2(checkpoint.changeSetId).selectContainerAccessKey();
    const requestContext = checkpoint.requestContext ?? await AuthorizedBackendRequestContext.create();
    const checkpoints = await this.iModelClient.checkpointsV2.get(requestContext, checkpoint.iModelId, checkpointQuery);
    if (checkpoints.length !== 1)
      throw new IModelError(IModelStatus.NotFound, "V2 checkpoint not found");

    const { containerAccessKeyContainer, containerAccessKeySAS, containerAccessKeyAccount, containerAccessKeyDbName } = checkpoints[0];
    if (!containerAccessKeyContainer || !containerAccessKeySAS || !containerAccessKeyAccount || !containerAccessKeyDbName)
      throw new IModelError(IModelStatus.NotFound, "invalid V2 checkpoint");

    const downloader = new IModelHost.platform.DownloadV2Checkpoint({
      container: containerAccessKeyContainer,
      auth: containerAccessKeySAS,
      storageType: "azure?sas=1",
      user: containerAccessKeyAccount,
      dbAlias: containerAccessKeyDbName,
      writeable: false,
      localFile: arg.localFile,
    });

    let timer: NodeJS.Timeout | undefined;
    try {
      let total = 0;
      const onProgress = arg.onProgress;
      if (onProgress) {
        timer = setInterval(async () => { // set an interval timer to show progress every 250ms
          const progress = downloader.getProgress();
          total = progress.total;
          if (onProgress(progress.loaded, progress.total))
            downloader.cancelDownload();
        }, 250);
      }
      await downloader.downloadPromise;
      onProgress?.(total, total); // make sure we call progress func one last time when download completes
    } catch (err) {
      throw (err.message === "cancelled") ? new UserCancelledError(BriefcaseStatus.DownloadCancelled, "download cancelled") : err;
    } finally {
      if (timer)
        clearInterval(timer);
    }
    return checkpoints[0].changeSetId!;
  }

  public static async releaseAllLocks(arg: BriefcaseIdArg) {
    const requestContext = await this.getRequestContext(arg);
    return this.iModelClient.locks.deleteAll(requestContext, arg.iModelId, arg.briefcaseId);

  }
  public static async releaseAllCodes(arg: BriefcaseIdArg) {
    const requestContext = await this.getRequestContext(arg);
    return this.iModelClient.codes.deleteAll(requestContext, arg.iModelId, arg.briefcaseId);

  }

  public static async queryAllLocks(arg: BriefcaseDbArg): Promise<LockProps[]> {
    const requestContext = await this.getRequestContext(arg);
    const heldLocks = await this.iModelClient.locks.get(requestContext, arg.briefcase.iModelId, new LockQuery().byBriefcaseId(arg.briefcase.briefcaseId));
    return heldLocks.map((lock) => ({ type: lock.lockType!, objectId: lock.objectId!, level: lock.lockLevel! }));
  }

  public static async queryAllCodes(arg: BriefcaseDbArg): Promise<CodeProps[]> {
    const requestContext = await this.getRequestContext(arg);
    const reservedCodes = await this.iModelClient.codes.get(requestContext, arg.briefcase.iModelId, new CodeQuery().byBriefcaseId(arg.briefcase.briefcaseId));
    return reservedCodes.map((code) => ({ spec: code.codeSpecId!, scope: code.codeScope!, value: code.value! }));
  }

  public static toHubLock(arg: BriefcaseDbArg, reqLock: LockProps): Lock {
    const lock = new Lock();
    lock.briefcaseId = arg.briefcase.briefcaseId;
    lock.lockLevel = reqLock.level;
    lock.lockType = reqLock.type;
    lock.objectId = reqLock.objectId;
    lock.releasedWithChangeSet = arg.briefcase.changeSetId;
    lock.seedFileId = arg.briefcase.iModelId;
    return lock;
  }

  public static toHubLocks(arg: BriefcaseDbArg & { locks: LockProps[] }): Lock[] {
    return arg.locks.map((lock) => this.toHubLock(arg, lock));
  }

  public static async acquireLocks(arg: BriefcaseDbArg & { locks: LockProps[] }): Promise<void> {
    const hubLocks = this.toHubLocks(arg);
    await this.iModelClient.locks.update(await this.getRequestContext(arg), arg.briefcase.iModelId, hubLocks);
  }

  public static async acquireSchemaLock(arg: BriefcaseDbArg): Promise<void> {
    await this.acquireLocks({ ...arg, locks: [ConcurrencyControl.Request.schemaLock] });
  }

  public static async querySchemaLock(arg: BriefcaseDbArg): Promise<boolean> {
    const locks = await this.iModelClient.locks.get(await this.getRequestContext(arg), arg.briefcase.iModelId, new LockQuery().byLockType(LockType.Schemas).byLockLevel(LockLevel.Exclusive));
    return locks.length > 0;
  }
}
