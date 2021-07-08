/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModels
 */

// cspell:ignore cset csets ecchanges

import * as os from "os";
import * as path from "path";
import {
  ChangeSetApplyOption, ChangeSetStatus, ClientRequestContext, GuidString, IModelHubStatus, IModelStatus, Logger, OpenMode, WSStatus,
} from "@bentley/bentleyjs-core";
import { IModelHubError } from "@bentley/imodelhub-client";
import {
  BriefcaseIdValue, BriefcaseProps, BriefcaseStatus, ChangesetFileProps, ChangesetIndexOrId, ChangesetProps, ChangesetType, CreateIModelProps,
  IModelError, IModelRpcOpenProps, IModelVersion, LocalBriefcaseProps, RequestNewBriefcaseProps,
} from "@bentley/imodeljs-common";
import { IModelJsNative } from "@bentley/imodeljs-native";
import { AuthorizedClientRequestContext, WsgError } from "@bentley/itwin-client";
import { TelemetryEvent } from "@bentley/telemetry-client";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { CheckpointManager, ProgressFunction } from "./CheckpointManager";
import { BriefcaseDb, IModelDb } from "./IModelDb";
import { IModelHost } from "./IModelHost";
import { IModelJsFs } from "./IModelJsFs";
import { UsageLoggingUtilities } from "./usage-logging/UsageLoggingUtilities";

const loggerCategory = BackendLoggerCategory.IModelDb;

/** The Id assigned to a briefcase by iModelHub, or [[BriefcaseIdValue.Unassigned]] .
 * @public
 */
export type BriefcaseId = number;

/** The argument for [[BriefcaseManager.downloadBriefcase]]
 * @public
*/
export type RequestNewBriefcaseArg = RequestNewBriefcaseProps & {
  /** If present, a function called periodically during the download to indicate progress.
   * @note return non-zero from this function to abort the download.
   */
  onProgress?: ProgressFunction;
};

/** Manages downloading Briefcases and downloading and uploading changesets.
 * @public
 */
export class BriefcaseManager {
  /** @internal
   * @note temporary, will be removed in 3.0
   * @deprecated
   */
  public static getCompatibilityPath(iModelId: GuidString): string { return path.join(this._compatibilityDir, iModelId, "bc"); }

  /** Get the local path of the folder storing files that are associated with an imodel */
  public static getIModelPath(iModelId: GuidString): string { return path.join(this._cacheDir, iModelId); }

  /** @internal */
  public static getChangeSetsPath(iModelId: GuidString): string { return path.join(this.getIModelPath(iModelId), "csets"); }

  /** @internal */
  public static getChangeCachePathName(iModelId: GuidString): string { return path.join(this.getIModelPath(iModelId), iModelId.concat(".bim.ecchanges")); }

  /** @internal */
  public static getChangedElementsPathName(iModelId: GuidString): string { return path.join(this.getIModelPath(iModelId), iModelId.concat(".bim.elems")); }

  private static _briefcaseSubDir = "briefcases";
  /** @internal */
  public static getBriefcaseBasePath(iModelId: GuidString): string {
    return path.join(this.getIModelPath(iModelId), this._briefcaseSubDir);
  }

  /** Get the name of the local file that holds, or will hold, a local briefcase in the briefcase cache.
   * @note The briefcase cache is a local directory established in the call to [[BriefcaseManager.initialize]].
   * @param briefcase the iModelId and BriefcaseId for the filename
   * @see getIModelPath
   */
  public static getFileName(briefcase: BriefcaseProps): string {
    return path.join(this.getBriefcaseBasePath(briefcase.iModelId), `${briefcase.briefcaseId}.bim`);
  }

  /** get the name for previous version of BriefcaseManager.
   * @note temporary, will be removed in 3.0
   * @deprecated
   * @internal
   */
  public static getCompatibilityFileName(briefcase: BriefcaseProps): string {
    // eslint-disable-next-line deprecation/deprecation
    return path.join(this.getCompatibilityPath(briefcase.iModelId), briefcase.briefcaseId === 0 ? "PullOnly" : "PullAndPush", briefcase.briefcaseId.toString(), "bc.bim");
  }

  private static setupCacheDir(cacheRootDir: string) {
    this._cacheDir = cacheRootDir;
    IModelJsFs.recursiveMkDirSync(this._cacheDir);
  }

  private static _compatibilityDir: string;
  private static _initialized?: boolean;
  /** Initialize BriefcaseManager
   * @param cacheRootDir The root directory for storing a cache of downloaded briefcase files on the local computer.
   * Briefcases are stored relative to this path in sub-folders organized by IModelId.
   * @note It is perfectly valid for applications to store briefcases in locations they manage, outside of `cacheRootDir`.
   */
  public static initialize(cacheRootDir: string, compatibilityDir?: string) {
    if (this._initialized)
      return;
    this._compatibilityDir = compatibilityDir ?? "";
    this.setupCacheDir(cacheRootDir);
    IModelHost.onBeforeShutdown.addOnce(this.finalize, this);
    this._initialized = true;
  }

  private static finalize() {
    this._initialized = false;
  }

  /** Get a list of the local briefcase held in the briefcase cache, optionally for a single iModelId
   * @param iModelId if present, only briefcases for this iModelId are returned
   * @note usually there should only be one briefcase per iModel.
   */
  public static getCachedBriefcases(iModelId?: GuidString): LocalBriefcaseProps[] {
    const briefcaseList: LocalBriefcaseProps[] = [];
    const iModelDirs = IModelJsFs.readdirSync(this._cacheDir);
    for (const iModelDir of iModelDirs) {
      if (iModelId && iModelId !== iModelDir)
        continue;
      const bcPath = path.join(this._cacheDir, iModelDir, this._briefcaseSubDir);
      try {
        if (!IModelJsFs.lstatSync(bcPath)?.isDirectory)
          continue;
      } catch (err) {
        continue;
      }

      const briefcases = IModelJsFs.readdirSync(bcPath);
      for (const briefcaseName of briefcases) {
        if (briefcaseName.endsWith(".bim")) {
          try {
            const fileName = path.join(bcPath, briefcaseName);
            const fileSize = IModelJsFs.lstatSync(fileName)?.size ?? 0;
            const db = IModelDb.openDgnDb({ path: fileName }, OpenMode.Readonly);
            briefcaseList.push({ fileName, contextId: db.queryProjectGuid(), iModelId: db.getDbGuid(), briefcaseId: db.getBriefcaseId(), changeSetId: db.getParentChangeset().id, fileSize });
            db.closeIModel();
          } catch (_err) {
          }
        }
      }
    }
    return briefcaseList;
  }

  private static _cacheDir: string;
  /** Get the root directory for the briefcase cache */
  public static get cacheDir() { return this._cacheDir; }

  /** Determine whether the supplied briefcaseId is a standalone briefcase
   * @note this function returns true if the id is either unassigned or the value "DeprecatedStandalone"
   * @deprecated use id === BriefcaseIdValue.Unassigned
   */
  public static isStandaloneBriefcaseId(id: BriefcaseId) {
    // eslint-disable-next-line deprecation/deprecation
    return id === BriefcaseIdValue.Unassigned || id === BriefcaseIdValue.DeprecatedStandalone;
  }

  /** Determine whether the supplied briefcaseId is in the range of assigned BriefcaseIds issued by iModelHub
   * @note this does check whether the id was actually acquired by the caller.
   */
  public static isValidBriefcaseId(id: BriefcaseId) {
    return id >= BriefcaseIdValue.FirstValid && id <= BriefcaseIdValue.LastValid;
  }

  /** Acquire a new briefcaseId from iModelHub for the supplied iModelId
   * @note usually there should only be one briefcase per iModel per user.
   * @throws IModelError if a new briefcaseId could not be acquired.
   */
  public static async acquireNewBriefcaseId(requestContext: AuthorizedClientRequestContext, iModelId: GuidString): Promise<number> {
    return IModelHost.hubAccess.acquireNewBriefcaseId({ requestContext, iModelId });
  }

  /** Download a new briefcase from iModelHub for the supplied iModelId.
   *
   * The process of downloading a briefcase file involves first obtaining a valid BriefcaseId from IModelHub. For each IModel, IModelHub maintains
   * a list of BriefcaseIds assigned to users, to ensure that no two users have the same BriefcaseId. Typically a given user will have only
   * one briefcase on their machine for a given iModelId. Rarely, it may be necessary to use more than one briefcase to make isolated independent sets of changes,
   * but that is exceedingly complicated and rare. If no BriefcaseId is supplied, a new one is acquired from iModelHub.
   *
   * Then, a Checkpoint file (as of a ChangeSetId, typically "Latest") is downloaded from IModelHub. After the download completes,
   * the briefcaseId in the local file is changed to acquired briefcaseId, changing the checkpoint file into a briefcase file.
   *
   * Each of these steps requires a valid `AuthorizedClientRequestContext` to provide the user's credentials for the requests.
   *
   * @param request The properties that specify the briefcase file to be downloaded.
   * @returns The properties of the local briefcase in a Promise that is resolved after the briefcase is fully downloaded and the briefcase file is ready for use via [BriefcaseDb.open]($backend).
   * @note The location of the local file to hold the briefcase is arbitrary and may be any valid *local* path on your machine. If you don't supply
   * a filename, the local briefcase cache is used by creating a file with the briefcaseId as its name in the `briefcases` folder below the folder named
   * for the IModelId.
   * @note *It is invalid to edit briefcases on a shared network drive* and that is a sure way to corrupt your briefcase (see https://www.sqlite.org/howtocorrupt.html)
   * @note The special briefcaseId [[BriefcaseIdValue.Unassigned]] (0) can be used for a local briefcase that can accept changesets but may not be generate changesets.
   * @see CheckpointManager.downloadCheckpoint
   */
  public static async downloadBriefcase(requestContext: AuthorizedClientRequestContext, request: RequestNewBriefcaseArg): Promise<LocalBriefcaseProps> {
    const briefcaseId = request.briefcaseId ?? await this.acquireNewBriefcaseId(requestContext, request.iModelId);
    const fileName = request.fileName ?? this.getFileName({ briefcaseId, iModelId: request.iModelId });

    if (IModelJsFs.existsSync(fileName))
      throw new IModelError(IModelStatus.FileAlreadyExists, `Briefcase "${fileName}" already exists`);

    const asOf = request.asOf ?? IModelVersion.latest().toJSON();
    const changeset = await this.changesetFromVersion(requestContext, IModelVersion.fromJSON(asOf), request.iModelId);

    const args = {
      localFile: fileName,
      checkpoint: {
        requestContext,
        contextId: request.contextId,
        iModelId: request.iModelId,
        changeSetId: changeset.id,
        changesetIndex: changeset.index,
      },
      onProgress: request.onProgress,
    };

    await CheckpointManager.downloadCheckpoint(args);
    const fileSize = IModelJsFs.lstatSync(fileName)?.size ?? 0;
    const response: LocalBriefcaseProps = {
      fileName,
      briefcaseId,
      iModelId: request.iModelId,
      contextId: request.contextId,
      changeSetId: args.checkpoint.changeSetId,
      changesetIndex: args.checkpoint.changesetIndex,
      fileSize,
    };

    // now open the downloaded checkpoint and reset its BriefcaseId
    const nativeDb = new IModelHost.platform.DgnDb();
    try {
      nativeDb.openIModel(fileName, OpenMode.ReadWrite);
    } catch (err) {
      throw new IModelError(err.errorNumber, `Could not open downloaded briefcase for write access: ${fileName}, err=${err.message}`);
    }
    try {
      nativeDb.resetBriefcaseId(briefcaseId);
      if (nativeDb.getParentChangeset().id !== args.checkpoint.changeSetId)
        throw new IModelError(IModelStatus.InvalidId, `Downloaded briefcase has wrong changesetId: ${fileName}`);
    } finally {
      nativeDb.closeIModel();
    }
    return response;
  }

  /** Deletes change sets of an iModel from local disk
   * @internal
   */
  public static deleteChangeSetsFromLocalDisk(iModelId: string) {
    const changeSetsPath: string = BriefcaseManager.getChangeSetsPath(iModelId);
    if (BriefcaseManager.deleteFolderAndContents(changeSetsPath))
      Logger.logTrace(loggerCategory, "Deleted change sets from local disk", () => ({ iModelId, changeSetsPath }));
  }

  /** Releases a briefcaseId from iModelHub. After this call it is illegal to generate changesets for the released briefcaseId.
   * @note generally, this method should not be called directly. Instead use [[deleteBriefcaseFiles]].
   * @see deleteBriefcaseFiles
   */
  public static async releaseBriefcase(requestContext: AuthorizedClientRequestContext, briefcase: BriefcaseProps): Promise<void> {
    if (this.isValidBriefcaseId(briefcase.briefcaseId))
      return IModelHost.hubAccess.releaseBriefcase({ requestContext, iModelId: briefcase.iModelId, briefcaseId: briefcase.briefcaseId });
  }

  /**
   * Delete and clean up a briefcase and all of its associated files. First, this method opens the supplied filename to determine its briefcaseId.
   * Then, if a requestContext is supplied, it releases a BriefcaseId from iModelHub. Finally it deletes the local briefcase file and
   * associated files (that is, all files in the same directory that start with the briefcase name).
   * @param filePath the full file name of the Briefcase to delete
   * @param requestContext context for releasing the briefcaseId
   */
  public static async deleteBriefcaseFiles(filePath: string, requestContext?: AuthorizedClientRequestContext): Promise<void> {
    try {
      const db = IModelDb.openDgnDb({ path: filePath }, OpenMode.Readonly);
      const briefcase: BriefcaseProps = {
        iModelId: db.getDbGuid(),
        briefcaseId: db.getBriefcaseId(),
      };
      db.closeIModel();

      if (requestContext) {
        if (this.isValidBriefcaseId(briefcase.briefcaseId)) {
          await BriefcaseManager.releaseBriefcase(requestContext, briefcase);
        }
      }
    } catch (error) {
    }

    // first try to delete the briefcase file
    try {
      if (IModelJsFs.existsSync(filePath))
        IModelJsFs.unlinkSync(filePath);
    } catch (err) {
      throw new IModelError(IModelStatus.BadRequest, `cannot delete briefcase file ${err}`);
    }

    // next, delete all files that start with the briefcase's filePath (e.g. "a.bim-locks", "a.bim-journal", etc.)
    try {
      const dirName = path.dirname(filePath);
      const fileName = path.basename(filePath);
      const files = IModelJsFs.readdirSync(dirName);
      for (const file of files) {
        if (file.startsWith(fileName))
          this.deleteFile(path.join(dirName, file)); // don't throw on error
      }
    } catch (err) {
    }
  }

  /** Deletes a file
   *  - Does not throw any error, but logs it instead
   *  - Returns true if the delete was successful
   */
  private static deleteFile(pathname: string): boolean {
    try {
      IModelJsFs.unlinkSync(pathname);
    } catch (error) {
      Logger.logError(loggerCategory, `Cannot delete file ${pathname}, ${error}`);
      return false;
    }
    return true;
  }

  /** Deletes a folder, checking if it's empty
   *  - Does not throw any error, but logs it instead
   *  - Returns true if the delete was successful
   */
  private static deleteFolderIfEmpty(folderPathname: string): boolean {
    try {
      const files = IModelJsFs.readdirSync(folderPathname);
      if (files.length > 0)
        return false;

      IModelJsFs.rmdirSync(folderPathname);
    } catch (error) {
      Logger.logError(loggerCategory, `Cannot delete folder: ${folderPathname}`);
      return false;
    }
    return true;
  }

  /** Deletes the contents of a folder, but not the folder itself
   *  - Does not throw any errors, but logs them.
   *  - returns true if the delete was successful.
   */
  private static deleteFolderContents(folderPathname: string): boolean {
    if (!IModelJsFs.existsSync(folderPathname))
      return false;

    let status = true;
    const files = IModelJsFs.readdirSync(folderPathname);
    for (const file of files) {
      const curPath = path.join(folderPathname, file);
      const locStatus = (IModelJsFs.lstatSync(curPath)!.isDirectory) ? BriefcaseManager.deleteFolderAndContents(curPath) : BriefcaseManager.deleteFile(curPath);
      if (!locStatus)
        status = false;
    }
    return status;
  }

  /** Deletes a folder and all it's contents.
   *  - Does not throw any errors, but logs them.
   *  - returns true if the delete was successful.
   */
  private static deleteFolderAndContents(folderPathname: string): boolean {
    if (!IModelJsFs.existsSync(folderPathname))
      return true;

    let status = false;
    status = BriefcaseManager.deleteFolderContents(folderPathname);
    if (!status)
      return false;

    status = BriefcaseManager.deleteFolderIfEmpty(folderPathname);
    return status;
  }

  /** @internal */
  public static async changesetFromVersion(requestContext: AuthorizedClientRequestContext, version: IModelVersion, iModelId: string): Promise<ChangesetProps> {
    return IModelHost.hubAccess.getChangesetFromVersion({ requestContext, iModelId, version });
  }

  /** Processes (merges or reverses) changesets to get the briefcase to the specified target version.
   * Note: The briefcase must have been opened ReadWrite, and the method keeps it in the same state.
   * @internal
   */
  public static async processChangesets(requestContext: AuthorizedClientRequestContext, db: IModelDb, target: ChangesetIndexOrId): Promise<void> {
    if (!db.isOpen || db.nativeDb.isReadonly()) // don't use db.isReadonly - we reopen the file writable just for this operation but db.isReadonly is still true
      throw new IModelError(ChangeSetStatus.ApplyError, "Briefcase must be open ReadWrite to process change sets");

    let targetIndex = target.index ?? -1;
    if (targetIndex < 0)
      targetIndex = (await IModelHost.hubAccess.queryChangeset({ requestContext, changeset: target, iModelId: db.iModelId })).index;
    const parenChangeset = db.nativeDb.getParentChangeset();
    if (undefined === parenChangeset.index)
      parenChangeset.index = (await IModelHost.hubAccess.queryChangeset({ requestContext, iModelId: db.iModelId, changeset: { id: parenChangeset.id } })).index;

    // Determine the reinstates, reversals or merges required
    let reverseToIndex: number | undefined, mergeToIndex: number | undefined;
    if (targetIndex < parenChangeset.index) {
      reverseToIndex = targetIndex;
    } else if (targetIndex > parenChangeset.index) {
      mergeToIndex = targetIndex;
    }

    // Reverse, reinstate and merge as necessary
    if (mergeToIndex !== undefined) {
      await BriefcaseManager.applyChangesets(requestContext, db, mergeToIndex, ChangeSetApplyOption.Merge);
    } else if (reverseToIndex !== undefined) {
      // eslint-disable-next-line deprecation/deprecation
      await BriefcaseManager.applyChangesets(requestContext, db, reverseToIndex, ChangeSetApplyOption.Reverse);
    }
  }

  private static async applySingleChangeset(db: IModelDb, changeSet: ChangesetFileProps, processOption: ChangeSetApplyOption) {
    return db.nativeDb.applyChangeset(changeSet, processOption);
  }

  private static async applyChangesets(requestContext: AuthorizedClientRequestContext, db: IModelDb, targetChangeSetIndex: number, processOption: ChangeSetApplyOption): Promise<void> {
    let currentChangeSetIndex = db.changeset.index;
    if (currentChangeSetIndex === undefined)
      currentChangeSetIndex = (await IModelHost.hubAccess.queryChangeset({ requestContext, iModelId: db.iModelId, changeset: { id: db.changeset.id } })).index;
    if (targetChangeSetIndex === currentChangeSetIndex)
      return; // nothing to apply

    const reverse = (targetChangeSetIndex < currentChangeSetIndex);

    // Download change sets
    const changeSets = await IModelHost.hubAccess.downloadChangesets({
      requestContext, iModelId: db.iModelId,
      range: { first: reverse ? targetChangeSetIndex + 1 : currentChangeSetIndex + 1, end: reverse ? currentChangeSetIndex : targetChangeSetIndex },
      targetDir: BriefcaseManager.getChangeSetsPath(db.iModelId),
    });
    if (reverse)
      changeSets.reverse();

    for (const changeSet of changeSets)
      await this.applySingleChangeset(db, changeSet, processOption);

    // notify listeners
    db.notifyChangesetApplied();
  }

  /**
   * @internal
   * @deprecated - reversing previously applied changesets is not supported.
  */
  public static async reverseChanges(requestContext: AuthorizedClientRequestContext, db: BriefcaseDb, reverseToVersion: IModelVersion): Promise<void> {
    if (db.openMode === OpenMode.Readonly)
      throw new IModelError(ChangeSetStatus.ApplyError, "Cannot reverse changes in a ReadOnly briefcase");

    const request = await BriefcaseManager.changesetFromVersion(requestContext, reverseToVersion, db.iModelId);
    const currentChangeSetIndex = (await IModelHost.hubAccess.queryChangeset({ requestContext, iModelId: db.iModelId, changeset: db.changeset })).index;
    if (request.index > currentChangeSetIndex)
      throw new IModelError(ChangeSetStatus.ApplyError, "Cannot reverse to a later version");

    return BriefcaseManager.processChangesets(requestContext, db, request);
  }

  /**
   * @internal
   * @deprecated - reversing previously applied changesets is not supported.
   */
  public static async reinstateChanges(requestContext: AuthorizedClientRequestContext, db: BriefcaseDb, reinstateToVersion?: IModelVersion): Promise<void> {
    if (db.openMode === OpenMode.Readonly)
      throw new IModelError(ChangeSetStatus.ApplyError, "Cannot reinstate changes in a ReadOnly briefcase");

    const targetVersion = reinstateToVersion || IModelVersion.asOfChangeSet(db.nativeDb.getParentChangeset().id);
    const target = await BriefcaseManager.changesetFromVersion(requestContext, targetVersion, db.iModelId);
    const currentChangeSetIndex = (await IModelHost.hubAccess.queryChangeset({ requestContext, iModelId: db.iModelId, changeset: db.changeset })).index;
    if (target.index < currentChangeSetIndex)
      throw new IModelError(ChangeSetStatus.ApplyError, "Can reinstate only to a later version");

    return BriefcaseManager.processChangesets(requestContext, db, target);
  }

  /** Pull and merge changes from iModelHub
   * @param requestContext The client request context
   * @param briefcase Local briefcase
   * @param mergeToVersion Version of the iModel to merge until.
   * @internal
   */
  public static async pullAndMergeChanges(requestContext: AuthorizedClientRequestContext, db: BriefcaseDb, mergeToVersion: IModelVersion = IModelVersion.latest()): Promise<void> {
    const target = await BriefcaseManager.changesetFromVersion(requestContext, mergeToVersion, db.iModelId);

    let currentChangeSetIndex = db.changeset.index;
    try {
      if (currentChangeSetIndex === undefined)
        currentChangeSetIndex = (await IModelHost.hubAccess.queryChangeset({ requestContext, iModelId: db.iModelId, changeset: db.changeset })).index;
      requestContext.enter();
    } catch (error) {
      requestContext.enter();
      if (error instanceof WsgError && error.errorNumber === WSStatus.InstanceNotFound)
        throw new IModelError(BriefcaseStatus.ContainsDeletedChangeSets, "Briefcase contains changeSets that were deleted");

      throw error;
    }

    if (target.index < currentChangeSetIndex)
      throw new IModelError(ChangeSetStatus.NothingToMerge, "Nothing to merge");

    return BriefcaseManager.processChangesets(requestContext, db, target);
  }

  /** Attempt to push a ChangeSet to iModelHub */
  private static async pushChangeset(requestContext: AuthorizedClientRequestContext, db: BriefcaseDb, description: string, releaseLocks: boolean): Promise<void> {
    const changesetProps = db.nativeDb.startCreateChangeset();
    changesetProps.briefcaseId = db.briefcaseId;
    changesetProps.description = description;
    changesetProps.size = IModelJsFs.lstatSync(changesetProps.pathname)!.size;

    // Refresh the access token since startCreateChangeSet may have taken significant time
    const auth = IModelHost.authorizationClient;
    if (auth)
      requestContext.accessToken = await auth.getAccessToken();

    const csIndex = await IModelHost.hubAccess.pushChangeset({ requestContext, iModelId: db.iModelId, changesetProps });
    db.nativeDb.completeCreateChangeset({ index: csIndex });
    if (releaseLocks)
      await IModelHost.hubAccess.releaseAllLocks({ requestContext, iModelId: db.iModelId, briefcaseId: db.briefcaseId, csIndex });
  }

  /** Attempt to pull merge and push once */
  private static async pushChangesOnce(requestContext: AuthorizedClientRequestContext, db: BriefcaseDb, description: string, releaseLocks: boolean): Promise<void> {
    await BriefcaseManager.pullAndMergeChanges(requestContext, db, IModelVersion.latest());
    try {
      await BriefcaseManager.pushChangeset(requestContext, db, description, releaseLocks);
    } catch (err) {
      db.nativeDb.abandonCreateChangeset();
      throw err;
    }
  }

  /** Return true to attempt pushing again. */
  private static shouldRetryPush(error: any): boolean {
    if (error instanceof IModelHubError && error.errorNumber) {
      switch (error.errorNumber) {
        case IModelHubStatus.AnotherUserPushing:
        case IModelHubStatus.PullIsRequired:
        case IModelHubStatus.DatabaseTemporarilyLocked:
        case IModelHubStatus.OperationFailed:
          return true;
      }
    }
    return false;
  }

  /** Push local changes to the hub
   * @param requestContext The client request context
   * @param briefcase Identifies the IModelDb that contains the pending changes.
   * @param description a description of the changeset that is to be pushed.
   * @param relinquishCodesLocks release locks held after pushing?
   * @internal
   */
  public static async pushChanges(requestContext: AuthorizedClientRequestContext, db: BriefcaseDb, description: string, _changeType: ChangesetType = ChangesetType.Regular, releaseLocks: boolean = true): Promise<void> {
    const retryCount = 5;
    for (let currentIteration = 0; currentIteration < retryCount; ++currentIteration) {
      let pushed = false;
      let error: any;
      try {
        await BriefcaseManager.pushChangesOnce(requestContext, db, description, releaseLocks);
        pushed = true;
      } catch (err) {
        error = err;
      }
      if (pushed)
        return;

      if (!BriefcaseManager.shouldRetryPush(error) || currentIteration === retryCount - 1) {
        throw error;
      }
      const delay = Math.floor(Math.random() * 4800) + 200;
      await new Promise((resolve: any) => setTimeout(resolve, delay));
    }
  }

  /** Create an iModel on iModelHub
   * @deprecated use IModelHost.hubAccess.createIModel
   */
  public static async create(requestContext: AuthorizedClientRequestContext, contextId: GuidString, iModelName: GuidString, args: CreateIModelProps): Promise<GuidString> {
    return IModelHost.hubAccess.createIModel({ requestContext, contextId, iModelName, description: args.rootSubject.description });
  }

  /** @internal */
  public static logUsage(requestContext: ClientRequestContext, token: IModelRpcOpenProps) {
    // NEEDS_WORK: Move usage logging to the native layer, and make it happen even if not authorized
    if (!(requestContext instanceof AuthorizedClientRequestContext)) {
      Logger.logTrace(loggerCategory, "Cannot log usage without appropriate authorization", () => token);
      return;
    }

    requestContext.enter();
    const telemetryEvent = new TelemetryEvent(
      "imodeljs-backend - Open iModel",
      "7a6424d1-2114-4e89-b13b-43670a38ccd4", // Feature: "iModel Use"
      token.contextId,
      token.iModelId,
      token.changeSetId,
    );
    IModelHost.telemetry.postTelemetry(requestContext, telemetryEvent); // eslint-disable-line @typescript-eslint/no-floating-promises

    UsageLoggingUtilities.postUserUsage(requestContext, token.contextId!, IModelJsNative.AuthType.OIDC, os.hostname(), IModelJsNative.UsageType.Trial)
      .catch((err) => {
        requestContext.enter();
        Logger.logError(loggerCategory, `Could not log user usage`, () => ({ errorStatus: err.status, errorMessage: err.message, ...token }));
      });
  }
}
