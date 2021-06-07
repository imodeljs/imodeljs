/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ChangedElementsDb
 */

import { DbResult, IDisposable, IModelStatus, OpenMode } from "@bentley/bentleyjs-core";
import { ChangeData, ChangedElements, ChangedModels, IModelError } from "@bentley/imodeljs-common";
import { IModelJsNative } from "@bentley/imodeljs-native";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { ChangeSummaryExtractContext, ChangeSummaryManager } from "./ChangeSummaryManager";
import { ECDbOpenMode } from "./ECDb";
import { IModelDb } from "./IModelDb";
import { IModelHost } from "./IModelHost";

/**
 * Options for processChangesets function
 * @internal
 * */
export interface ProcessChangesetOptions {
  startChangesetId: string;
  endChangesetId: string;
  rulesetId: string;
  filterSpatial?: boolean;
  wantParents?: boolean;
  wantPropertyChecksums?: boolean;
  rulesetDir?: string;
  tempDir?: string;
}

/** An ChangedElementsDb file
 * @internal
 */
export class ChangedElementsDb implements IDisposable {
  private _nativeDb: IModelJsNative.ChangedElementsECDb | undefined;

  constructor() {
    this._nativeDb = new IModelHost.platform.ChangedElementsECDb();
  }

  public dispose(): void {
    if (!this._nativeDb)
      return;

    this.closeDb();
    this._nativeDb.dispose();
    this._nativeDb = undefined;
  }

  /** Create a ChangedElementsDb
   * @param pathName The path to the ECDb file to create.
   * @throws [IModelError]($common) if the operation failed.
   */
  private _createDb(briefcase: IModelDb, pathName: string): void {
    const status: DbResult = this.nativeDb.createDb(briefcase.nativeDb, pathName);
    if (status !== DbResult.BE_SQLITE_OK)
      throw new IModelError(status, "Failed to created ECDb");
  }

  /** Open the Changed Elements Db.
   * @param pathName The path to the ECDb file to open
   * @param openMode Open mode
   * @throws [IModelError]($common) if the operation failed.
   */
  private _openDb(pathName: string, openMode: ECDbOpenMode = ECDbOpenMode.Readonly): void {
    const nativeOpenMode = openMode === ECDbOpenMode.Readonly ? OpenMode.Readonly : OpenMode.ReadWrite;
    const tryUpgrade = openMode === ECDbOpenMode.FileUpgrade;
    const status = this.nativeDb.openDb(pathName, nativeOpenMode, tryUpgrade);
    if (status !== DbResult.BE_SQLITE_OK)
      throw new IModelError(status, "Failed to open ECDb");
  }

  /** Open the Changed Elements Db.
   * @param pathName The path to the ECDb file to open
   * @param openMode Open mode
   * @returns ChangedElementsDb
   */
  public static openDb(pathName: string, openMode: ECDbOpenMode = ECDbOpenMode.Readonly): ChangedElementsDb {
    const cacheDb = new ChangedElementsDb();
    cacheDb._openDb(pathName, openMode);
    return cacheDb;
  }

  /** Create the changed elements cache db
   * @param briefcase IModelDb to use
   * @param pathName The path to the ECDb file to create.
   * @returns The new cache db
   */
  public static createDb(briefcase: IModelDb, pathName: string): ChangedElementsDb {
    const cacheDb = new ChangedElementsDb();
    cacheDb._createDb(briefcase, pathName);
    return cacheDb;
  }

  /** Processes a range of changesets and adds it to the changed elements cache
   * @param requestContext The client request context
   * @param briefcase iModel briefcase to use
   * @param options Options for processing
   */
  public async processChangesets(requestContext: AuthorizedClientRequestContext, briefcase: IModelDb, options: ProcessChangesetOptions): Promise<DbResult> {
    requestContext.enter();
    const changeSummaryContext = new ChangeSummaryExtractContext(briefcase);
    const changesets = await ChangeSummaryManager.downloadChangesets(requestContext, changeSummaryContext, options.startChangesetId, options.endChangesetId);
    requestContext.enter();
    // ChangeSets need to be processed from newest to oldest
    changesets.reverse();
    const status = this.nativeDb.processChangesets(
      briefcase.nativeDb,
      changesets,
      options.rulesetId,
      options.filterSpatial,
      options.wantParents,
      options.wantPropertyChecksums,
      options.rulesetDir,
      options.tempDir,
    );
    if (status !== DbResult.BE_SQLITE_OK)
      throw new IModelError(status, "Failed to process changesets");
    return status;
  }

  /** Processes a range of changesets and adds it to the changed elements cache
   * This call will close the IModelDb object as it is required for processing and applying changesets
   * @param requestContext The client request context
   * @param briefcase iModel briefcase to use
   * @param options options for processing
   */
  public async processChangesetsAndRoll(requestContext: AuthorizedClientRequestContext, briefcase: IModelDb, options: ProcessChangesetOptions): Promise<DbResult> {
    requestContext.enter();
    const changeSummaryContext = new ChangeSummaryExtractContext(briefcase);
    const changesets = await ChangeSummaryManager.downloadChangesets(requestContext, changeSummaryContext, options.startChangesetId, options.endChangesetId);
    requestContext.enter();
    // ChangeSets need to be processed from newest to oldest
    changesets.reverse();
    // Close briefcase before doing processing and rolling briefcase
    const dbFilename = briefcase.pathName;
    const dbGuid = briefcase.getGuid();
    briefcase.close();
    // Process changesets
    const status = this.nativeDb.processChangesetsAndRoll(
      dbFilename,
      dbGuid,
      changesets,
      options.rulesetId,
      options.filterSpatial,
      options.wantParents,
      options.wantPropertyChecksums,
      options.rulesetDir,
      options.tempDir,
    );
    if (status !== DbResult.BE_SQLITE_OK)
      throw new IModelError(status, "Failed to process changesets");
    return status;
  }

  /** Get changed elements between two changesets
   * @param startChangesetId Start Changeset Id
   * @param endChangesetId End Changeset Id
   * @returns Returns the changed elements between the changesets provided
   * @throws [IModelError]($common) if the operation failed.
   */
  public getChangedElements(startChangesetId: string, endChangesetId: string): ChangedElements | undefined {
    const result = this.nativeDb.getChangedElements(startChangesetId, endChangesetId);
    if (result.error || !result.result)
      throw new IModelError(result.error ? result.error.status : -1, result.error ? result.error.message : "Problem getting changed elements");
    return (result.result.changedElements) as ChangedElements;
  }

  /** Get changed models between two changesets
   * @param startChangesetId Start Changeset Id
   * @param endChangesetId End Changeset Id
   * @returns Returns the changed models between the changesets provided
   * @throws [IModelError]($common) if the operation failed.
   */
  public getChangedModels(startChangesetId: string, endChangesetId: string): ChangedModels | undefined {
    const result = this.nativeDb.getChangedElements(startChangesetId, endChangesetId);
    if (result.error || !result.result)
      throw new IModelError(result.error ? result.error.status : -1, result.error ? result.error.message : "Problem getting changed models");
    return (result.result.changedModels) as ChangedModels;
  }

  /** Get changed models between two changesets
   * @param startChangesetId Start Changeset Id
   * @param endChangesetId End Changeset Id
   * @returns Returns the changed models between the changesets provided
   * @throws [IModelError]($common) if the operation failed.
   */
  public getChangeData(startChangesetId: string, endChangesetId: string): ChangeData | undefined {
    const result = this.nativeDb.getChangedElements(startChangesetId, endChangesetId);
    if (result.error)
      throw new IModelError(result.error.status, result.error.message);
    return result.result as ChangeData;
  }

  /** Returns true if the Changed Elements Db is open */
  public get isOpen(): boolean { return this.nativeDb.isOpen(); }

  /** Returns true if the cache already contains this changeset Id */
  public isProcessed(changesetId: string): boolean { return this.nativeDb.isProcessed(changesetId); }

  /** Close the Db after saving any uncommitted changes.
   * @throws [IModelError]($common) if the database is not open.
   */
  public closeDb(): void {
    this.nativeDb.closeDb();
  }

  public cleanCaches(): void {
    this.nativeDb.cleanCaches();
  }

  /** @internal */
  public get nativeDb(): IModelJsNative.ChangedElementsECDb {
    if (!this._nativeDb)
      throw new IModelError(IModelStatus.BadRequest, "ChangedElementsDb object has already been disposed.");

    return this._nativeDb;
  }
}
