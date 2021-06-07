/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModels
 */

import * as path from "path";
import { assert, DbResult, GuidString, Id64String, IModelStatus, Logger, PerfLogger, using } from "@bentley/bentleyjs-core";
import { ChangedValueState, ChangeOpCode, IModelError, IModelVersion } from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { ChangesetFileProps, ChangesetId } from "./BackendHubAccess";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { BriefcaseManager } from "./BriefcaseManager";
import { ECDb, ECDbOpenMode } from "./ECDb";
import { ECSqlStatement } from "./ECSqlStatement";
import { BriefcaseDb, IModelDb } from "./IModelDb";
import { IModelHost, KnownLocations } from "./IModelHost";
import { IModelJsFs } from "./IModelJsFs";

const loggerCategory: string = BackendLoggerCategory.ECDb;

/** Represents an instance of the `ChangeSummary` ECClass from the `ECDbChange` ECSchema
 * combined with the information from the related `ChangeSet` instance (from the `IModelChange` ECSchema) from
 * which the Change Summary was extracted.
 *
 * See also
 * - [ChangeSummaryManager.queryChangeSummary]($backend)
 * - [ChangeSummary Overview]($docs/learning/ChangeSummaries)
 * @beta
 */
export interface ChangeSummary {
  id: Id64String;
  changeSet: { wsgId: GuidString, parentWsgId: GuidString, description: string, pushDate: string, userCreated: GuidString };
}

/** Represents an instance of the `InstanceChange` ECClass from the `ECDbChange` ECSchema
 *
 * See also
 * - [ChangeSummaryManager.queryInstanceChange]($backend)
 * - [ChangeSummary Overview]($docs/learning/ChangeSummaries)
 * @beta
 */
export interface InstanceChange {
  id: Id64String;
  summaryId: Id64String;
  changedInstance: { id: Id64String, className: string };
  opCode: ChangeOpCode;
  isIndirect: boolean;
}

/** Options for [ChangeSummaryManager.extractChangeSummaries]($backend).
 * @beta
 */
export interface ChangeSummaryExtractOptions {
  /** If specified, change summaries are extracted from the start version to the current version as of which the iModel
   *  was opened. If undefined, the extraction starts at the first version of the iModel.
   */
  startVersion?: IModelVersion;
  /** If specified, the change summary will be extracted only for current version as of which the iModel
   *  was opened.
   */
  currentVersionOnly?: boolean;
}

/** @beta */
export class ChangeSummaryExtractContext {
  public constructor(public readonly iModel: IModelDb) { }

  public get iModelId(): GuidString { return this.iModel.iModelId; }
}

/** Class to extract Change Summaries for a briefcase.
 *
 * See also:
 * - [ChangeSummary Overview]($docs/learning/ChangeSummaries)
 * @beta
 */
export class ChangeSummaryManager {
  private static readonly _currentIModelChangeSchemaVersion = { read: 2, write: 0, minor: 0 };

  /** Determines whether the *Change Cache file* is attached to the specified iModel or not
   * @param iModel iModel to check whether a *Change Cache file* is attached
   * @returns Returns true if the *Change Cache file* is attached to the iModel. false otherwise
   */
  public static isChangeCacheAttached(iModel: IModelDb): boolean {
    if (!iModel || !iModel.isOpen)
      throw new IModelError(IModelStatus.BadRequest, "Briefcase must be open");

    return iModel.nativeDb.isChangeCacheAttached();
  }

  /** Attaches the *Change Cache file* to the specified iModel if it hasn't been attached yet.
   * A new *Change Cache file* will be created for the iModel if it hasn't existed before.
   * @param iModel iModel to attach the *Change Cache file* file to
   * @throws [IModelError]($common)
   */
  public static attachChangeCache(iModel: IModelDb): void {
    if (!iModel || !iModel.isOpen)
      throw new IModelError(IModelStatus.BadRequest, "Briefcase must be open");

    if (ChangeSummaryManager.isChangeCacheAttached(iModel))
      return;

    const changesCacheFilePath: string = BriefcaseManager.getChangeCachePathName(iModel.iModelId);
    if (!IModelJsFs.existsSync(changesCacheFilePath)) {
      using(new ECDb(), (changeCacheFile: ECDb) => {
        ChangeSummaryManager.createChangeCacheFile(iModel, changeCacheFile, changesCacheFilePath);
      });
    }

    assert(IModelJsFs.existsSync(changesCacheFilePath));
    const res: DbResult = iModel.nativeDb.attachChangeCache(changesCacheFilePath);
    if (res !== DbResult.BE_SQLITE_OK)
      throw new IModelError(res, `Failed to attach Change Cache file to ${iModel.pathName}.`);
  }

  /** Detaches the *Change Cache file* from the specified iModel.
   * @param iModel iModel to detach the *Change Cache file* to
   * @throws [IModelError]($common) in case of errors, e.g. if no *Change Cache file* was attached before.
   * @deprecated This method is not required to be called anymore. The attach change cache will stay around until connection is closed.
   */
  public static detachChangeCache(iModel: IModelDb): void {
    if (!iModel || !iModel.isOpen)
      throw new IModelError(IModelStatus.BadRequest, "Briefcase must be open");

    iModel.clearCaches();
    const res: DbResult = iModel.nativeDb.detachChangeCache();
    if (res !== DbResult.BE_SQLITE_OK)
      throw new IModelError(res, `Failed to detach Change Cache file from ${iModel.pathName}.`);
  }

  /** Extracts change summaries from the specified iModel.
   * Change summaries are extracted from the version the iModel was opened with up through the specified start version.
   * If no start version has been specified, the first version will be used.
   * @param requestContext The client request context
   * @param iModel iModel to extract change summaries for. The iModel must not be a standalone iModel.
   * Note: For every version to extract a summary from, the method moves the iModel to that version before extraction. After
   * the extraction has completed, the iModel is moved back to the original version.
   * @param options Extraction options
   * @return the Ids of the extracted change summaries.
   * @throws [IModelError]($common) if the iModel is standalone
   */
  public static async extractChangeSummaries(requestContext: AuthorizedClientRequestContext, iModel: BriefcaseDb, options?: ChangeSummaryExtractOptions): Promise<Id64String[]> {
    requestContext.enter();
    if (!iModel?.isOpen)
      throw new IModelError(IModelStatus.BadRequest, "Briefcase must be open");

    const ctx = new ChangeSummaryExtractContext(iModel);

    const endChangeSetId = iModel.changeSetId;
    assert(endChangeSetId.length !== 0);

    let startChangeSetId = "";
    if (options) {
      if (options.startVersion) {
        startChangeSetId = await IModelHost.hubAccess.getChangesetIdFromVersion({ version: options.startVersion, requestContext, iModelId: ctx.iModelId });
        requestContext.enter();
      } else if (options.currentVersionOnly) {
        startChangeSetId = endChangeSetId;
      }
    }

    Logger.logInfo(loggerCategory, "Started Change Summary extraction...", () => ({ iModelId: ctx.iModelId, startChangeSetId, endChangeSetId }));
    const totalPerf = new PerfLogger(`ChangeSummaryManager.extractChangeSummaries [ChangeSets: ${startChangeSetId} through ${endChangeSetId}, iModel: ${ctx.iModelId}]`);

    // download necessary changesets if they were not downloaded before and retrieve infos about those changesets
    let perfLogger = new PerfLogger("ChangeSummaryManager.extractChangeSummaries>Retrieve ChangeSetInfos and download ChangeSets from Hub");
    const changeSetInfos = await ChangeSummaryManager.downloadChangesets(requestContext, ctx, startChangeSetId, endChangeSetId);
    requestContext.enter();
    perfLogger.dispose();
    Logger.logTrace(loggerCategory, "Retrieved changesets to extract from from cache or from hub.", () => ({ iModelId: ctx.iModelId, startChangeSetId, endChangeSetId, changeSets: changeSetInfos }));

    // Detach change cache as it's being written to during the extraction
    const isChangeCacheAttached = this.isChangeCacheAttached(iModel);
    if (isChangeCacheAttached) {
      throw new IModelError(DbResult.BE_SQLITE_ERROR, "There is an attached change cache file. Re-open the connection to detach it.");
    }

    perfLogger = new PerfLogger("ChangeSummaryManager.extractChangeSummaries>Open or create local Change Cache file");
    const changesFile: ECDb = ChangeSummaryManager.openOrCreateChangesFile(iModel);
    perfLogger.dispose();
    Logger.logTrace(loggerCategory, "Opened or created Changes Cachefile.", () => ({ iModelId: ctx.iModelId, startChangeSetId, endChangeSetId }));

    if (!changesFile || !changesFile.nativeDb) {
      assert(false, "Should not happen as an exception should have been thrown in that case");
      throw new IModelError(IModelStatus.BadArg, "Failed to create Change Cache file.");
    }

    try {
      // extract summaries from end changeset through start changeset, so that we only have to go back in history
      const changeSetCount: number = changeSetInfos.length;
      const endChangeSetIx: number = changeSetCount - 1;
      const summaries: Id64String[] = [];
      for (let i = endChangeSetIx; i >= 0; i--) {
        const currentChangeSetInfo = changeSetInfos[i];
        const currentChangeSetId = currentChangeSetInfo.id;
        Logger.logInfo(loggerCategory, `Started Change Summary extraction for changeset #${i + 1}...`, () => ({ iModelId: ctx.iModelId, changeSetId: currentChangeSetId }));

        const existingSummaryId: Id64String | undefined = ChangeSummaryManager.isSummaryAlreadyExtracted(changesFile, currentChangeSetId);
        if (!!existingSummaryId) {
          Logger.logInfo(loggerCategory, `Change Summary for changeset #${i + 1} already exists. It is not extracted again.`, () => ({ iModelId: ctx.iModelId, changeSetId: currentChangeSetId }));
          summaries.push(existingSummaryId);
          continue;
        }

        // iModel is at end changeset, so no need to reverse for it.
        if (i !== endChangeSetIx) {
          perfLogger = new PerfLogger("ChangeSummaryManager.extractChangeSummaries>Roll iModel to previous changeset");
          await iModel.reverseChanges(requestContext, IModelVersion.asOfChangeSet(currentChangeSetId)); // eslint-disable-line deprecation/deprecation
          requestContext.enter();
          perfLogger.dispose();
          Logger.logTrace(loggerCategory, `Moved iModel to changeset #${i + 1} to extract summary from.`, () => ({ iModelId: ctx.iModelId, changeSetId: currentChangeSetId }));
        }

        const changeSetFilePath = currentChangeSetInfo.pathname;
        if (!IModelJsFs.existsSync(changeSetFilePath))
          throw new IModelError(IModelStatus.FileNotFound, `Failed to extract change summary: ChangeSet file "${changeSetFilePath}" does not exist.`);

        perfLogger = new PerfLogger("ChangeSummaryManager.extractChangeSummaries>Extract ChangeSummary");
        const stat = iModel.nativeDb.extractChangeSummary(changesFile.nativeDb, changeSetFilePath);
        perfLogger.dispose();
        if (stat.error && stat.error.status !== DbResult.BE_SQLITE_OK)
          throw new IModelError(stat.error.status, stat.error.message);

        Logger.logTrace(loggerCategory, `Actual Change summary extraction done for changeset #${i + 1}.`, () => ({ iModelId: ctx.iModelId, changeSetId: currentChangeSetId }));

        perfLogger = new PerfLogger("ChangeSummaryManager.extractChangeSummaries>Add ChangeSet info to ChangeSummary");
        const changeSummaryId = stat.result!;
        summaries.push(changeSummaryId);
        ChangeSummaryManager.addExtendedInfos(changesFile, changeSummaryId, currentChangeSetId, currentChangeSetInfo.parentId, currentChangeSetInfo.description, currentChangeSetInfo.pushDate, currentChangeSetInfo.userCreated);
        perfLogger.dispose();
        Logger.logTrace(loggerCategory, `Added extended infos to Change Summary for changeset #${i + 1}.`, () => ({ iModelId: ctx.iModelId, changeSetId: currentChangeSetId }));

        Logger.logInfo(loggerCategory, `Finished Change Summary extraction for changeset #${i + 1}.`, () => ({ iModelId: ctx.iModelId, changeSetId: currentChangeSetId }));
      }

      changesFile.saveChanges();
      return summaries;
    } finally {
      changesFile.dispose();

      // Reattach change cache if it was attached before the extraction
      if (isChangeCacheAttached)
        ChangeSummaryManager.attachChangeCache(iModel);

      perfLogger = new PerfLogger("ChangeSummaryManager.extractChangeSummaries>Move iModel to original changeset");
      if (iModel.changeSetId !== endChangeSetId)
        await iModel.reinstateChanges(requestContext, IModelVersion.asOfChangeSet(endChangeSetId));// eslint-disable-line deprecation/deprecation
      requestContext.enter();
      perfLogger.dispose();
      Logger.logTrace(loggerCategory, "Moved iModel to initial changeset (the end changeset).", () => ({ iModelId: ctx.iModelId, startChangeSetId, endChangeSetId }));

      totalPerf.dispose();
      Logger.logInfo(loggerCategory, "Finished Change Summary extraction.", () => ({ iModelId: ctx.iModelId, startChangeSetId, endChangeSetId }));
    }
  }

  /** @internal */
  public static async downloadChangesets(requestContext: AuthorizedClientRequestContext, ctx: ChangeSummaryExtractContext, first: ChangesetId, end: ChangesetId): Promise<ChangesetFileProps[]> {
    requestContext.enter();

    const changeSetInfos = await IModelHost.hubAccess.downloadChangesets({ requestContext, iModelId: ctx.iModelId, range: { first, end } });
    requestContext.enter();
    assert(first === "" || first === changeSetInfos[0].id);
    assert(end === changeSetInfos[changeSetInfos.length - 1].id);
    return changeSetInfos;
  }

  private static openOrCreateChangesFile(iModel: BriefcaseDb): ECDb {
    if (!iModel?.isOpen)
      throw new IModelError(IModelStatus.BadArg, "Invalid iModel handle. iModel must be open.");

    const changesFile = new ECDb();
    const changeCacheFilePath = BriefcaseManager.getChangeCachePathName(iModel.iModelId);
    if (IModelJsFs.existsSync(changeCacheFilePath)) {
      ChangeSummaryManager.openChangeCacheFile(changesFile, changeCacheFilePath);
      return changesFile;
    }

    try {
      ChangeSummaryManager.createChangeCacheFile(iModel, changesFile, changeCacheFilePath);
      return changesFile;
    } catch (e) {
      // delete cache file again in case it was created but schema import failed
      if (IModelJsFs.existsSync(changeCacheFilePath))
        IModelJsFs.removeSync(changeCacheFilePath);

      throw e;
    }
  }

  private static createChangeCacheFile(iModel: IModelDb, changesFile: ECDb, changeCacheFilePath: string): void {
    if (!iModel?.isOpen)
      throw new IModelError(IModelStatus.BadArg, "Invalid iModel object. iModel must be open.");

    const stat: DbResult = iModel.nativeDb.createChangeCache(changesFile.nativeDb, changeCacheFilePath);
    if (stat !== DbResult.BE_SQLITE_OK)
      throw new IModelError(stat, `Failed to create Change Cache file at "${changeCacheFilePath}".`);

    // Extended information like changeset ids, push dates are persisted in the IModelChange ECSchema
    changesFile.importSchema(ChangeSummaryManager.getExtendedSchemaPath());
  }

  private static openChangeCacheFile(changesFile: ECDb, changeCacheFilePath: string): void {
    changesFile.openDb(changeCacheFilePath, ECDbOpenMode.FileUpgrade);

    const actualSchemaVersion: { read: number, write: number, minor: number } = changesFile.withPreparedStatement("SELECT VersionMajor read,VersionWrite write,VersionMinor minor FROM meta.ECSchemaDef WHERE Name='IModelChange'",
      (stmt: ECSqlStatement) => {
        if (stmt.step() !== DbResult.BE_SQLITE_ROW)
          throw new IModelError(DbResult.BE_SQLITE_ERROR, "File is not a valid Change Cache file.");

        return stmt.getRow();
      });

    if (actualSchemaVersion.read === ChangeSummaryManager._currentIModelChangeSchemaVersion.read &&
      actualSchemaVersion.write === ChangeSummaryManager._currentIModelChangeSchemaVersion.write &&
      actualSchemaVersion.minor === ChangeSummaryManager._currentIModelChangeSchemaVersion.minor)
      return;

    changesFile.importSchema(ChangeSummaryManager.getExtendedSchemaPath());
  }

  private static getExtendedSchemaPath(): string { return path.join(KnownLocations.packageAssetsDir, "IModelChange.02.00.00.ecschema.xml"); }

  private static isSummaryAlreadyExtracted(changesFile: ECDb, changeSetId: GuidString): Id64String | undefined {
    return changesFile.withPreparedStatement("SELECT Summary.Id summaryid FROM imodelchange.ChangeSet WHERE WsgId=?",
      (stmt: ECSqlStatement) => {
        stmt.bindString(1, changeSetId);
        if (DbResult.BE_SQLITE_ROW === stmt.step())
          return stmt.getValue(0).getId();

        return undefined;
      });
  }

  private static addExtendedInfos(changesFile: ECDb, changeSummaryId: Id64String, changesetWsgId: GuidString, changesetParentWsgId?: GuidString, description?: string, changesetPushDate?: string, changeSetUserCreated?: GuidString): void {
    changesFile.withPreparedStatement("INSERT INTO imodelchange.ChangeSet(Summary.Id,WsgId,ParentWsgId,Description,PushDate,UserCreated) VALUES(?,?,?,?,?,?)",
      (stmt: ECSqlStatement) => {
        stmt.bindId(1, changeSummaryId);
        stmt.bindString(2, changesetWsgId);
        if (changesetParentWsgId)
          stmt.bindString(3, changesetParentWsgId);

        if (description)
          stmt.bindString(4, description);

        if (changesetPushDate)
          stmt.bindDateTime(5, changesetPushDate);

        if (changeSetUserCreated)
          stmt.bindString(6, changeSetUserCreated);

        const r: DbResult = stmt.step();
        if (r !== DbResult.BE_SQLITE_DONE)
          throw new IModelError(r, `Failed to add changeset information to extracted change summary ${changeSummaryId}`);
      });
  }

  /** Queries the ChangeSummary for the specified change summary id
   *
   * See also
   * - `ECDbChange.ChangeSummary` ECClass in the *ECDbChange* ECSchema
   * - [Change Summary Overview]($docs/learning/ChangeSummaries)
   * @param iModel iModel
   * @param changeSummaryId ECInstanceId of the ChangeSummary
   * @returns Returns the requested ChangeSummary object
   * @throws [IModelError]($common) If change summary does not exist for the specified id, or if the
   * change cache file hasn't been attached, or in case of other errors.
   */
  public static queryChangeSummary(iModel: BriefcaseDb, changeSummaryId: Id64String): ChangeSummary {
    if (!ChangeSummaryManager.isChangeCacheAttached(iModel))
      throw new IModelError(IModelStatus.BadArg, "Change Cache file must be attached to iModel.");

    return iModel.withPreparedStatement("SELECT WsgId,ParentWsgId,Description,PushDate,UserCreated FROM ecchange.imodelchange.ChangeSet WHERE Summary.Id=?",
      (stmt: ECSqlStatement) => {
        stmt.bindId(1, changeSummaryId);
        if (stmt.step() !== DbResult.BE_SQLITE_ROW)
          throw new IModelError(IModelStatus.BadArg, `No ChangeSet information found for ChangeSummary ${changeSummaryId}.`);

        const row = stmt.getRow();
        return { id: changeSummaryId, changeSet: { wsgId: row.wsgId, parentWsgId: row.parentWsgId, description: row.description, pushDate: row.pushDate, userCreated: row.userCreated } };
      });
  }

  /** Queries the InstanceChange for the specified instance change id.
   *
   * See also
   * - `ECDbChange.InstanceChange` ECClass in the *ECDbChange* ECSchema
   * - [Change Summary Overview]($docs/learning/ChangeSummaries)
   * @param iModel iModel
   * @param instanceChangeId ECInstanceId of the InstanceChange (see `ECDbChange.InstanceChange` ECClass in the *ECDbChange* ECSchema)
   * @returns Returns the requested InstanceChange object (see `ECDbChange.InstanceChange` ECClass in the *ECDbChange* ECSchema)
   * @throws [IModelError]($common) if instance change does not exist for the specified id, or if the
   * change cache file hasn't been attached, or in case of other errors.
   */
  public static queryInstanceChange(iModel: BriefcaseDb, instanceChangeId: Id64String): InstanceChange {
    if (!ChangeSummaryManager.isChangeCacheAttached(iModel))
      throw new IModelError(IModelStatus.BadArg, "Change Cache file must be attached to iModel.");

    // query instance changes
    const instanceChange: InstanceChange = iModel.withPreparedStatement(`SELECT ic.Summary.Id summaryId, s.Name changedInstanceSchemaName, c.Name changedInstanceClassName, ic.ChangedInstance.Id changedInstanceId,
      ic.OpCode, ic.IsIndirect FROM ecchange.change.InstanceChange ic JOIN main.meta.ECClassDef c ON c.ECInstanceId = ic.ChangedInstance.ClassId
      JOIN main.meta.ECSchemaDef s ON c.Schema.Id = s.ECInstanceId WHERE ic.ECInstanceId =? `, (stmt: ECSqlStatement) => {
      stmt.bindId(1, instanceChangeId);
      if (stmt.step() !== DbResult.BE_SQLITE_ROW)
        throw new IModelError(IModelStatus.BadArg, `No InstanceChange found for id ${instanceChangeId}.`);

      const row = stmt.getRow();
      const changedInstanceId: Id64String = row.changedInstanceId;
      const changedInstanceClassName: string = `[${row.changedInstanceSchemaName}].[${row.changedInstanceClassName}]`;
      const op: ChangeOpCode = row.opCode as ChangeOpCode;

      return {
        id: instanceChangeId, summaryId: row.summaryId, changedInstance: { id: changedInstanceId, className: changedInstanceClassName },
        opCode: op, isIndirect: row.isIndirect,
      };
    });

    return instanceChange;
  }

  /** Retrieves the names of the properties whose values have changed for the given instance change
   *
   * See also [Change Summary Overview]($docs/learning/ChangeSummaries)
   * @param iModel iModel
   * @param instanceChangeId Id of the InstanceChange to query the properties whose values have changed
   * @returns Returns names of the properties whose values have changed for the given instance change
   * @throws [IModelError]($common) if the change cache file hasn't been attached, or in case of other errors.
   */
  public static getChangedPropertyValueNames(iModel: IModelDb, instanceChangeId: Id64String): string[] {
    return iModel.withPreparedStatement("SELECT AccessString FROM ecchange.change.PropertyValueChange WHERE InstanceChange.Id=?",
      (stmt: ECSqlStatement) => {
        stmt.bindId(1, instanceChangeId);

        const selectClauseItems: string[] = [];
        while (stmt.step() === DbResult.BE_SQLITE_ROW) {
          // access string tokens need to be escaped as they might collide with reserved words in ECSQL or SQLite
          const accessString: string = stmt.getValue(0).getString();
          const accessStringTokens: string[] = accessString.split(".");
          assert(accessStringTokens.length > 0);

          let isFirstToken: boolean = true;
          let item: string = "";
          for (const token of accessStringTokens) {
            if (!isFirstToken)
              item += ".";

            item += `[${token}]`;
            isFirstToken = false;
          }
          selectClauseItems.push(item);
        }

        return selectClauseItems;
      });
  }

  /** Builds the ECSQL to query the property value changes for the specified instance change and the specified ChangedValueState.
   *
   * See also [Change Summary Overview]($docs/learning/ChangeSummaries)
   * @param iModel iModel
   * @param instanceChangeInfo InstanceChange to query the property value changes for
   *        changedInstance.className must be fully qualified and schema and class name must be escaped with square brackets if they collide with reserved ECSQL words: `[schema name].[class name]`
   * @param changedValueState The Changed State to query the values for. This must correspond to the [InstanceChange.OpCode]($backend) of the InstanceChange.
   * @param changedPropertyNames List of the property names for which values have changed for the specified instance change.
   *        The list can be obtained by calling [ChangeSummaryManager.getChangedPropertyValueNames]($imodeljs-backend).
   *        If omitted, the method will call the above method by itself. The parameter allows for checking first whether
   *        an instance change has any property value changes at all. If there are no property value changes, this method
   *        should not be called, as it will throw an error.
   * @returns Returns the ECSQL that will retrieve the property value changes
   * @throws [IModelError]($common) if instance change does not exist, if there are not property value changes for the instance change,
   *        if the change cache file hasn't been attached, or in case of other errors.
   */
  public static buildPropertyValueChangesECSql(iModel: IModelDb, instanceChangeInfo: { id: Id64String, summaryId: Id64String, changedInstance: { id: Id64String, className: string } }, changedValueState: ChangedValueState, changedPropertyNames?: string[]): string {
    let selectClauseItems: string[];
    if (!changedPropertyNames) {
      // query property value changes just to build a SELECT statement against the class of the changed instance
      selectClauseItems = ChangeSummaryManager.getChangedPropertyValueNames(iModel, instanceChangeInfo.id);
    } else
      selectClauseItems = changedPropertyNames;

    if (selectClauseItems.length === 0)
      throw new IModelError(IModelStatus.BadArg, `No property value changes found for InstanceChange ${instanceChangeInfo.id}.`);

    let ecsql: string = "SELECT ";
    selectClauseItems.map((item: string, index: number) => {
      if (index !== 0)
        ecsql += ",";

      ecsql += item;
    });

    // Avoiding parameters in the Changes function speeds up performance because ECDb can do optimizations
    // if it knows the function args at prepare time
    ecsql += ` FROM main.${instanceChangeInfo.changedInstance.className}.Changes(${instanceChangeInfo.summaryId},${changedValueState}) WHERE ECInstanceId=${instanceChangeInfo.changedInstance.id}`;
    return ecsql;
  }
}
