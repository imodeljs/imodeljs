/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module iModels
 */

// cspell:ignore ulas postrc pollrc CANTOPEN

import {
  assert, BeEvent, BentleyStatus, ChangeSetStatus, ClientRequestContext, DbResult, Guid, GuidString, Id64, Id64Arg, Id64Array, Id64Set, Id64String,
  IModelStatus, JsonUtils, Logger, OpenMode,
} from "@bentley/bentleyjs-core";
import { Range3d } from "@bentley/geometry-core";
import { ChangesType } from "@bentley/imodelhub-client";
import {
  AxisAlignedBox3d, Base64EncodedString, BRepGeometryCreate, BriefcaseIdValue, CategorySelectorProps, Code, CodeSpec, CreateEmptySnapshotIModelProps,
  CreateEmptyStandaloneIModelProps, CreateSnapshotIModelProps, DisplayStyleProps, DomainOptions, EcefLocation, ElementAspectProps,
  ElementGeometryRequest, ElementGeometryUpdate, ElementGraphicsRequestProps, ElementLoadProps, ElementProps, EntityMetaData, EntityProps,
  EntityQueryParams, FilePropertyProps, FontMap, FontProps, GeoCoordinatesResponseProps, GeometryContainmentRequestProps,
  GeometryContainmentResponseProps, IModel, IModelCoordinatesResponseProps, IModelError, IModelNotFoundResponse, IModelProps, IModelRpcProps,
  IModelTileTreeProps, IModelVersion, LocalBriefcaseProps, MassPropertiesRequestProps, MassPropertiesResponseProps, ModelLoadProps, ModelProps,
  ModelSelectorProps, OpenBriefcaseProps, ProfileOptions, PropertyCallback, QueryLimit, QueryPriority, QueryQuota, QueryResponse, QueryResponseStatus,
  SchemaState, SheetProps, SnapRequestProps, SnapResponseProps, SnapshotOpenOptions, SpatialViewDefinitionProps, StandaloneOpenOptions,
  TextureLoadProps, ThumbnailProps, UpgradeOptions, ViewDefinitionProps, ViewQueryParams, ViewStateLoadProps, ViewStateProps,
} from "@bentley/imodeljs-common";
import { IModelJsNative } from "@bentley/imodeljs-native";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { BackendLoggerCategory } from "./BackendLoggerCategory";
import { BriefcaseId, BriefcaseManager } from "./BriefcaseManager";
import { CheckpointManager, CheckpointProps, V2CheckpointManager } from "./CheckpointManager";
import { ClassRegistry, MetaDataRegistry } from "./ClassRegistry";
import { CodeSpecs } from "./CodeSpecs";
import { ConcurrencyControl } from "./ConcurrencyControl";
import { ECSqlStatement } from "./ECSqlStatement";
import { Element, SectionDrawing, Subject } from "./Element";
import { ElementAspect, ElementMultiAspect, ElementUniqueAspect } from "./ElementAspect";
import { generateElementGraphics } from "./ElementGraphics";
import { Entity, EntityClassType } from "./Entity";
import { ExportGraphicsOptions, ExportPartGraphicsOptions } from "./ExportGraphics";
import { IModelHost } from "./IModelHost";
import { IModelJsFs } from "./IModelJsFs";
import { IpcHost } from "./IpcHost";
import { Model } from "./Model";
import { Relationships } from "./Relationship";
import { SqliteStatement, StatementCache } from "./SqliteStatement";
import { TxnManager } from "./TxnManager";
import { DrawingViewDefinition, SheetViewDefinition, ViewDefinition } from "./ViewDefinition";

const loggerCategory: string = BackendLoggerCategory.IModelDb;

/** Options for [[IModelDb.Models.updateModel]]
 * @note To mark *only* the geometry as changed, use [[IModelDb.Models.updateGeometryGuid]] instead.
 * @public
 */
export interface UpdateModelOptions extends ModelProps {
  /** If defined, update the last modify time of the Model */
  updateLastMod?: boolean;
  /** If defined, update the GeometryGuid of the Model */
  geometryChanged?: boolean;
}

/** Options supplied to [[IModelDb.computeProjectExtents]].
 * @public
 */
export interface ComputeProjectExtentsOptions {
  /** If true, the result will include `extentsWithOutliers`. */
  reportExtentsWithOutliers?: boolean;
  /** If true, the result will include `outliers`. */
  reportOutliers?: boolean;
}

/** The result of [[IModelDb.computeProjectExtents]].
 * @public
 */
export interface ComputedProjectExtents {
  /** The computed extents, excluding any outlier elements. */
  extents: Range3d;
  /** If requested by caller, the computed extents, *including* any outlier elements. */
  extentsWithOutliers?: Range3d;
  /** If requested by caller, the Ids of outlier elements excluded from the computed extents. */
  outliers?: Id64Array;
}

/** An iModel database file. The database file is either briefcase or a snapshot.
 * @see [Accessing iModels]($docs/learning/backend/AccessingIModels.md)
 * @see [About IModelDb]($docs/learning/backend/IModelDb.md)
 * @public
 */
export abstract class IModelDb extends IModel {
  private _initialized = false;
  protected static readonly _edit = "StandaloneEdit";
  /** Keep track of open imodels to support `tryFind` for RPC purposes */
  private static readonly _openDbs = new Map<string, IModelDb>();
  public static readonly defaultLimit = 1000; // default limit for batching queries
  public static readonly maxLimit = 10000; // maximum limit for batching queries
  public readonly models = new IModelDb.Models(this);
  public readonly elements = new IModelDb.Elements(this);
  public readonly views = new IModelDb.Views(this);
  public readonly tiles = new IModelDb.Tiles(this);
  private _relationships?: Relationships;
  private _concurrentQueryInitialized: boolean = false;
  private readonly _statementCache = new StatementCache<ECSqlStatement>();
  private readonly _sqliteStatementCache = new StatementCache<SqliteStatement>();
  private _codeSpecs?: CodeSpecs;
  private _classMetaDataRegistry?: MetaDataRegistry;
  protected _fontMap?: FontMap;
  protected _concurrentQueryStats = { resetTimerHandle: (null as any), logTimerHandle: (null as any), lastActivityTime: Date.now(), dispose: () => { } };
  private readonly _snaps = new Map<string, IModelJsNative.SnapRequest>();
  private static _shutdownListener: VoidFunction | undefined; // so we only register listener once

  /** Event called after a changeset is applied to this IModelDb. */
  public readonly onChangesetApplied = new BeEvent<() => void>();
  /** @internal */
  public notifyChangesetApplied() {
    this._changeSetId = this.nativeDb.getReversedChangeSetId() ?? this.nativeDb.getParentChangeSetId();
    this.onChangesetApplied.raiseEvent();
  }

  public readFontJson(): string { return JSON.stringify(this.nativeDb.readFontMap()); }
  public get fontMap(): FontMap { return this._fontMap ?? (this._fontMap = new FontMap(this.nativeDb.readFontMap())); }
  public embedFont(prop: FontProps): FontProps { this._fontMap = undefined; return this.nativeDb.embedFont(prop); }

  /** Check if this iModel has been opened read-only or not. */
  public get isReadonly(): boolean { return this.openMode === OpenMode.Readonly; }

  /** The Guid that identifies this iModel. */
  public get iModelId(): GuidString { return super.iModelId!; } // GuidString | undefined for the IModel superclass, but required for all IModelDb subclasses

  private _nativeDb?: IModelJsNative.DgnDb;
  /** @internal*/
  public get nativeDb(): IModelJsNative.DgnDb { return this._nativeDb!; }

  /** Get the full path fileName of this iModelDb
   * @note this member is only valid while the iModel is opened.
   */
  public get pathName(): string { return this.nativeDb.getFilePath(); }

  /** @internal */
  protected constructor(nativeDb: IModelJsNative.DgnDb, iModelToken: IModelRpcProps, openMode: OpenMode) {
    super(iModelToken, openMode);
    this._nativeDb = nativeDb;
    this.nativeDb.setIModelDb(this);
    this.initializeIModelDb();
    IModelDb._openDbs.set(this._fileKey, this);

    if (undefined === IModelDb._shutdownListener) { // the first time we create an IModelDb, add a listener to close any orphan files at shutdown.
      IModelDb._shutdownListener = IModelHost.onBeforeShutdown.addListener(() => {
        IModelDb._openDbs.forEach((db) => { // N.B.: db.close() removes from _openedDbs
          try {
            db.abandonChanges();
            db.close();
          } catch { }
        });
      });
    }
  }

  /** Close this IModel, if it is currently open. */
  public close(): void {
    if (!this.isOpen)
      return; // don't continue if already closed

    this.beforeClose();
    IModelDb._openDbs.delete(this._fileKey);
    this.nativeDb.closeIModel();
    this._nativeDb = undefined; // the underlying nativeDb has been freed by closeIModel
  }

  /** Event called when the iModel is about to be closed */
  public readonly onBeforeClose = new BeEvent<() => void>();

  /**
   * Called by derived classes before closing the connection
   * @internal
   */
  protected beforeClose() {
    this.onBeforeClose.raiseEvent();
    this.clearCaches();
    this._concurrentQueryStats.dispose();
  }

  /** @internal */
  protected initializeIModelDb() {
    const props = JSON.parse(this.nativeDb.getIModelProps()) as IModelProps;
    super.initialize(props.rootSubject.name, props);
    if (this._initialized)
      return;

    this._initialized = true;
    const db = this.isBriefcaseDb() || this.isStandaloneDb() ? this : undefined;
    if (!db || !IpcHost.isValid)
      return;

    db.onNameChanged.addListener(() => IpcHost.notifyTxns(db, "notifyIModelNameChanged", db.name));
    db.onRootSubjectChanged.addListener(() => IpcHost.notifyTxns(db, "notifyRootSubjectChanged", db.rootSubject));
    db.onProjectExtentsChanged.addListener(() => IpcHost.notifyTxns(db, "notifyProjectExtentsChanged", db.projectExtents.toJSON()));
    db.onGlobalOriginChanged.addListener(() => IpcHost.notifyTxns(db, "notifyGlobalOriginChanged", db.globalOrigin.toJSON()));
    db.onEcefLocationChanged.addListener(() => IpcHost.notifyTxns(db, "notifyEcefLocationChanged", db.ecefLocation?.toJSON()));
    db.onGeographicCoordinateSystemChanged.addListener(() => IpcHost.notifyTxns(db, "notifyGeographicCoordinateSystemChanged", db.geographicCoordinateSystem?.toJSON()));
  }

  /** Returns true if this is a BriefcaseDb
   * @see [[BriefcaseDb.open]]
   */
  public get isBriefcase(): boolean { return false; }
  /** Type guard for instanceof [[BriefcaseDb]] */
  public isBriefcaseDb(): this is BriefcaseDb { return this.isBriefcase; }

  /** Returns true if this is a SnapshotDb
   * @see [[SnapshotDb.open]]
   */
  public get isSnapshot(): boolean { return false; }
  /** Type guard for instanceof [[SnapshotDb]] */
  public isSnapshotDb(): this is SnapshotDb { return this.isSnapshot; }

  /** Returns true if this is a *standalone* iModel
   * @see [[StandaloneDb.open]]
   * @internal
   */
  public get isStandalone(): boolean { return false; }
  /** Type guard for instanceof [[StandaloneDb]]
   * @internal
   */
  public isStandaloneDb(): this is StandaloneDb { return this.isStandalone; }

  /** Return `true` if the underlying nativeDb is open and valid.
   * @internal
   */
  public get isOpen(): boolean { return undefined !== this.nativeDb; }

  /** Get the briefcase Id of this iModel */
  public getBriefcaseId(): BriefcaseId { return this.isOpen ? this.nativeDb.getBriefcaseId() : BriefcaseIdValue.Illegal; }

  /**
   * Use a prepared ECSQL statement, potentially from the statement cache. If the requested statement doesn't exist
   * in the statement cache, a new statement is prepared. After the callback completes, the statement is reset and saved
   * in the statement cache so it can be reused in the future. Use this method for ECSQL statements that will be
   * reused often and are expensive to prepare. The statement cache holds the most recently used statements, discarding
   * the oldest statements as it fills. For statements you don't intend to reuse, instead use [[withStatement]].
   * @param sql The SQLite SQL statement to execute
   * @param callback the callback to invoke on the prepared statement
   * @returns the value returned by `callback`.
   * @see [[withStatement]]
   * @public
   */
  public withPreparedStatement<T>(ecsql: string, callback: (stmt: ECSqlStatement) => T): T {
    const stmt = this._statementCache.findAndRemove(ecsql) ?? this.prepareStatement(ecsql);
    const release = () => this._statementCache.addOrDispose(stmt);
    try {
      const val = callback(stmt);
      if (val instanceof Promise) {
        val.then(release, release);
      } else {
        release();
      }
      return val;
    } catch (err) {
      release();
      throw err;
    }
  }

  /**
   * Prepared and execute a callback on an ECSQL statement. After the callback completes the statement is disposed.
   * Use this method for ECSQL statements are either not expected to be reused, or are not expensive to prepare.
   * For statements that will be reused often, instead use [[withPreparedStatement]].
   * @param sql The SQLite SQL statement to execute
   * @param callback the callback to invoke on the prepared statement
   * @returns the value returned by `callback`.
   * @see [[withPreparedStatement]]
   * @public
   */
  public withStatement<T>(ecsql: string, callback: (stmt: ECSqlStatement) => T): T {
    const stmt = this.prepareStatement(ecsql);
    const release = () => stmt.dispose();
    try {
      const val = callback(stmt);
      if (val instanceof Promise) {
        val.then(release, release);
      } else {
        release();
      }
      return val;
    } catch (err) {
      release();
      throw err;
    }
  }

  /** Compute number of rows that would be returned by the ECSQL.
   *
   * See also:
   * - [ECSQL Overview]($docs/learning/backend/ExecutingECSQL)
   * - [Code Examples]($docs/learning/backend/ECSQLCodeExamples)
   *
   * @param ecsql The ECSQL statement to execute
   * @param bindings The values to bind to the parameters (if the ECSQL has any).
   * Pass an *array* of values if the parameters are *positional*.
   * Pass an *object of the values keyed on the parameter name* for *named parameters*.
   * The values in either the array or object must match the respective types of the parameters.
   * See "[iModel.js Types used in ECSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" for details.
   * @returns Return row count.
   * @throws [[IModelError]] If the statement is invalid
   */
  public async queryRowCount(ecsql: string, bindings?: any[] | object): Promise<number> {
    for await (const row of this.query(`select count(*) nRows from (${ecsql})`, bindings)) {
      return row.nRows;
    }
    throw new IModelError(DbResult.BE_SQLITE_ERROR, "Failed to get row count");
  }

  /** Execute a query against this ECDb but restricted by quota and limit settings. This is intended to be used internally
   * The result of the query is returned as an array of JavaScript objects where every array element represents an
   * [ECSQL row]($docs/learning/ECSQLRowFormat).
   *
   * See also:
   * - [ECSQL Overview]($docs/learning/backend/ExecutingECSQL)
   * - [Code Examples]($docs/learning/backend/ECSQLCodeExamples)
   *
   * @param ecsql The ECSQL statement to execute
   * @param bindings The values to bind to the parameters (if the ECSQL has any).
   * Pass an *array* of values if the parameters are *positional*.
   * Pass an *object of the values keyed on the parameter name* for *named parameters*.
   * The values in either the array or object must match the respective types of the parameters.
   * See "[iModel.js Types used in ECSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" for details.
   * @param limitRows Specify upper limit for rows that can be returned by the query.
   * @param quota Specify non binding quota. These values are constrained by global setting
   * but never the less can be specified to narrow down the quota constraint for the query but staying under global settings.
   * @param priority Specify non binding priority for the query. It can help user to adjust
   * priority of query in queue so that small and quicker queries can be prioritized over others.
   * @param restartToken when provide cancel the previous query with same token in same session.
   * @returns Returns structure containing rows and status.
   * See [ECSQL row format]($docs/learning/ECSQLRowFormat) for details about the format of the returned rows.
   * @internal
   */
  public async queryRows(ecsql: string, bindings?: any[] | object, limit?: QueryLimit, quota?: QueryQuota, priority?: QueryPriority, restartToken?: string, abbreviateBlobs?: boolean): Promise<QueryResponse> {
    const stats = this._concurrentQueryStats;
    const config = IModelHost.configuration!.concurrentQuery;
    stats.lastActivityTime = Date.now();
    if (!this._concurrentQueryInitialized) {
      // Initialize concurrent query and setup statistics reset timer
      this._concurrentQueryInitialized = this.nativeDb.concurrentQueryInit(config);
      stats.dispose = () => {
        if (stats.logTimerHandle) {
          clearInterval(stats.logTimerHandle);
          stats.logTimerHandle = null;
        }
        if (stats.resetTimerHandle) {
          clearInterval(stats.resetTimerHandle);
          stats.resetTimerHandle = null;
        }
      };
      // Concurrent query will reset and log statistics every 'resetStatisticsInterval'
      const resetIntervalMs = 1000 * 60 * Math.max(config.resetStatisticsInterval ? config.resetStatisticsInterval : 60, 10);
      stats.resetTimerHandle = setInterval(() => {
        if (this.isOpen && this._concurrentQueryInitialized) {
          try {
            const timeElapsedSinceLastActivity = Date.now() - stats.lastActivityTime;
            if (timeElapsedSinceLastActivity < resetIntervalMs) {
              const statistics = JSON.parse(this.nativeDb.captureConcurrentQueryStats(true));
              Logger.logInfo(loggerCategory, "Resetting concurrent query statistics", () => statistics);
            }
          } catch { }
        } else {
          clearInterval(stats.resetTimerHandle);
          stats.resetTimerHandle = null;
        }
      }, resetIntervalMs);
      (stats.resetTimerHandle as NodeJS.Timeout).unref();
      // Concurrent query will log statistics every 'logStatisticsInterval'
      const logIntervalMs = 1000 * 60 * Math.max(config.logStatisticsInterval ? config.logStatisticsInterval : 5, 5);
      stats.logTimerHandle = setInterval(() => {
        if (this.isOpen && this._concurrentQueryInitialized) {
          try {
            const timeElapsedSinceLastActivity = Date.now() - stats.lastActivityTime;
            if (timeElapsedSinceLastActivity < logIntervalMs) {
              const statistics = JSON.parse(this.nativeDb.captureConcurrentQueryStats(false));
              Logger.logInfo(loggerCategory, "Concurrent query statistics", () => statistics);
            }
          } catch { }
        } else {
          clearInterval(stats.logTimerHandle);
          stats.logTimerHandle = null;
        }
      }, logIntervalMs);
      (stats.logTimerHandle as NodeJS.Timeout).unref();
    }
    if (!bindings) bindings = [];
    if (!limit) limit = {};
    if (!quota) quota = {};
    if (!priority) priority = QueryPriority.Normal;

    return new Promise<QueryResponse>((resolve) => {
      if (!this.isOpen) {
        resolve({ status: QueryResponseStatus.Done, rows: [] });
      } else {
        let sessionRestartToken = restartToken ? restartToken.trim() : "";
        if (sessionRestartToken !== "")
          sessionRestartToken = `${ClientRequestContext.current.sessionId}:${sessionRestartToken}`;

        const postResult = this.nativeDb.postConcurrentQuery(ecsql, JSON.stringify(bindings, Base64EncodedString.replacer), limit!, quota!, priority!, sessionRestartToken, abbreviateBlobs);
        if (postResult.status !== IModelJsNative.ConcurrentQuery.PostStatus.Done)
          resolve({ status: QueryResponseStatus.PostError, rows: [] });

        const poll = () => {
          if (!this.nativeDb || !this.nativeDb.isOpen()) {
            resolve({ status: QueryResponseStatus.Done, rows: [] });
          } else {
            const pollResult = this.nativeDb.pollConcurrentQuery(postResult.taskId);
            if (pollResult.status === IModelJsNative.ConcurrentQuery.PollStatus.Done) {
              resolve({ status: QueryResponseStatus.Done, rows: JSON.parse(pollResult.result, Base64EncodedString.reviver) });
            } else if (pollResult.status === IModelJsNative.ConcurrentQuery.PollStatus.Partial) {
              const returnBeforeStep = pollResult.result.length === 0;
              resolve({ status: QueryResponseStatus.Partial, rows: returnBeforeStep ? [] : JSON.parse(pollResult.result, Base64EncodedString.reviver) });
            } else if (pollResult.status === IModelJsNative.ConcurrentQuery.PollStatus.Timeout)
              resolve({ status: QueryResponseStatus.Timeout, rows: [] });
            else if (pollResult.status === IModelJsNative.ConcurrentQuery.PollStatus.Pending)
              setTimeout(() => { poll(); }, config.pollInterval);
            else if (pollResult.status === IModelJsNative.ConcurrentQuery.PollStatus.Cancelled)
              resolve({ status: QueryResponseStatus.Cancelled, rows: [pollResult.result] });
            else
              resolve({ status: QueryResponseStatus.Error, rows: [pollResult.result] });
          }
        };
        setTimeout(() => { poll(); }, config.pollInterval);
      }
    });
  }

  /** Execute a query and stream its results
   * The result of the query is async iterator over the rows. The iterator will get next page automatically once rows in current page has been read.
   * [ECSQL row]($docs/learning/ECSQLRowFormat).
   *
   * See also:
   * - [ECSQL Overview]($docs/learning/backend/ExecutingECSQL)
   * - [Code Examples]($docs/learning/backend/ECSQLCodeExamples)
   *
   * @param ecsql The ECSQL statement to execute
   * @param bindings The values to bind to the parameters (if the ECSQL has any).
   * Pass an *array* of values if the parameters are *positional*.
   * Pass an *object of the values keyed on the parameter name* for *named parameters*.
   * The values in either the array or object must match the respective types of the parameters.
   * See "[iModel.js Types used in ECSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" for details.
   * @param limitRows Specify upper limit for rows that can be returned by the query.
   * @param quota Specify non binding quota. These values are constrained by global setting
   * but never the less can be specified to narrow down the quota constraint for the query but staying under global settings.
   * @param priority Specify non binding priority for the query. It can help user to adjust
   * priority of query in queue so that small and quicker queries can be prioritized over others.
   * @returns Returns the query result as an *AsyncIterableIterator<any>*  which lazy load result as needed
   * See [ECSQL row format]($docs/learning/ECSQLRowFormat) for details about the format of the returned rows.
   * @throws [[IModelError]] If there was any error while submitting, preparing or stepping into query
   */
  public async * query(ecsql: string, bindings?: any[] | object, limitRows?: number, quota?: QueryQuota, priority?: QueryPriority, abbreviateBlobs?: boolean): AsyncIterableIterator<any> {
    let result: QueryResponse;
    let offset: number = 0;
    let rowsToGet = limitRows ? limitRows : -1;
    do {
      result = await this.queryRows(ecsql, bindings, { maxRowAllowed: rowsToGet, startRowOffset: offset }, quota, priority, undefined, abbreviateBlobs);
      while (result.status === QueryResponseStatus.Timeout) {
        result = await this.queryRows(ecsql, bindings, { maxRowAllowed: rowsToGet, startRowOffset: offset }, quota, priority, undefined, abbreviateBlobs);
      }

      if (result.status === QueryResponseStatus.Error) {
        if (result.rows[0] === undefined) {
          throw new IModelError(DbResult.BE_SQLITE_ERROR, "Invalid ECSql");
        } else {
          throw new IModelError(DbResult.BE_SQLITE_ERROR, result.rows[0]);
        }
      }

      if (rowsToGet > 0) {
        rowsToGet -= result.rows.length;
      }
      offset += result.rows.length;

      for (const row of result.rows)
        yield row;

    } while (result.status !== QueryResponseStatus.Done);
  }

  /** Execute a query and stream its results
   * The result of the query is async iterator over the rows. The iterator will get next page automatically once rows in current page has been read.
   * [ECSQL row]($docs/learning/ECSQLRowFormat).
   *
   * See also:
   * - [ECSQL Overview]($docs/learning/backend/ExecutingECSQL)
   * - [Code Examples]($docs/learning/backend/ECSQLCodeExamples)
   *
   * @param token None empty restart token. The previous query with same token would be cancelled. This would cause
   * exception which user code must handle.
   * @param ecsql The ECSQL statement to execute
   * @param bindings The values to bind to the parameters (if the ECSQL has any).
   * Pass an *array* of values if the parameters are *positional*.
   * Pass an *object of the values keyed on the parameter name* for *named parameters*.
   * The values in either the array or object must match the respective types of the parameters.
   * See "[iModel.js Types used in ECSQL Parameter Bindings]($docs/learning/ECSQLParameterTypes)" for details.
   * @param limitRows Specify upper limit for rows that can be returned by the query.
   * @param quota Specify non binding quota. These values are constrained by global setting
   * but never the less can be specified to narrow down the quota constraint for the query but staying under global settings.
   * @param priority Specify non binding priority for the query. It can help user to adjust
   * priority of query in queue so that small and quicker queries can be prioritized over others.
   * @returns Returns the query result as an *AsyncIterableIterator<any>*  which lazy load result as needed
   * See [ECSQL row format]($docs/learning/ECSQLRowFormat) for details about the format of the returned rows.
   * @throws [[IModelError]] If there was any error while submitting, preparing or stepping into query
   */
  public async * restartQuery(token: string, ecsql: string, bindings?: any[] | object, limitRows?: number, quota?: QueryQuota, priority?: QueryPriority): AsyncIterableIterator<any> {
    let result: QueryResponse;
    let offset: number = 0;
    let rowsToGet = limitRows ? limitRows : -1;
    do {
      result = await this.queryRows(ecsql, bindings, { maxRowAllowed: rowsToGet, startRowOffset: offset }, quota, priority, token);
      while (result.status === QueryResponseStatus.Timeout) {
        result = await this.queryRows(ecsql, bindings, { maxRowAllowed: rowsToGet, startRowOffset: offset }, quota, priority, token);
      }
      if (result.status === QueryResponseStatus.Cancelled) {
        throw new IModelError(DbResult.BE_SQLITE_INTERRUPT, `Query cancelled`);
      } else if (result.status === QueryResponseStatus.Error) {
        if (result.rows[0] === undefined) {
          throw new IModelError(DbResult.BE_SQLITE_ERROR, "Invalid ECSql");
        } else {
          throw new IModelError(DbResult.BE_SQLITE_ERROR, result.rows[0]);
        }
      }

      if (rowsToGet > 0) {
        rowsToGet -= result.rows.length;
      }
      offset += result.rows.length;

      for (const row of result.rows)
        yield row;

    } while (result.status !== QueryResponseStatus.Done);
  }

  /**
   * Use a prepared SQL statement, potentially from the statement cache. If the requested statement doesn't exist
   * in the statement cache, a new statement is prepared. After the callback completes, the statement is reset and saved
   * in the statement cache so it can be reused in the future. Use this method for SQL statements that will be
   * reused often and are expensive to prepare. The statement cache holds the most recently used statements, discarding
   * the oldest statements as it fills. For statements you don't intend to reuse, instead use [[withSqliteStatement]].
   * @param sql The SQLite SQL statement to execute
   * @param callback the callback to invoke on the prepared statement
   * @returns the value returned by `callback`.
   * @see [[withPreparedStatement]]
   * @public
   */
  public withPreparedSqliteStatement<T>(sql: string, callback: (stmt: SqliteStatement) => T): T {
    const stmt = this._sqliteStatementCache.findAndRemove(sql) ?? this.prepareSqliteStatement(sql);
    const release = () => this._sqliteStatementCache.addOrDispose(stmt);
    try {
      const val: T = callback(stmt);
      if (val instanceof Promise) {
        val.then(release, release);
      } else {
        release();
      }
      return val;
    } catch (err) {
      release();
      throw err;
    }
  }

  /**
   * Prepared and execute a callback on a SQL statement. After the callback completes the statement is disposed.
   * Use this method for SQL statements are either not expected to be reused, or are not expensive to prepare.
   * For statements that will be reused often, instead use [[withPreparedSqliteStatement]].
   * @param sql The SQLite SQL statement to execute
   * @param callback the callback to invoke on the prepared statement
   * @returns the value returned by `callback`.
   * @public
   */
  public withSqliteStatement<T>(sql: string, callback: (stmt: SqliteStatement) => T): T {
    const stmt = this.prepareSqliteStatement(sql);
    const release = () => stmt.dispose();
    try {
      const val: T = callback(stmt);
      if (val instanceof Promise) {
        val.then(release, release);
      } else {
        release();
      }
      return val;
    } catch (err) {
      release();
      throw err;
    }
  }

  /** Prepare an SQL statement.
   * @param sql The SQL statement to prepare
   * @throws [[IModelError]] if there is a problem preparing the statement.
   * @internal
   */
  public prepareSqliteStatement(sql: string): SqliteStatement {
    const stmt = new SqliteStatement(sql);
    stmt.prepare(this.nativeDb);
    return stmt;
  }

  /** Query for a set of entity ids, given an EntityQueryParams
   * @param params The query parameters. The `limit` and `offset` members should be used to page results.
   * @returns an Id64Set with results of query
   * @throws [[IModelError]] if the generated statement is invalid or [IModelDb.maxLimit]($backend) exceeded when collecting ids.
   *
   * *Example:*
   * ``` ts
   * [[include:ECSQL-backend-queries.select-element-by-code-value-using-queryEntityIds]]
   * ```
   */
  public queryEntityIds(params: EntityQueryParams): Id64Set {
    let sql = "SELECT ECInstanceId FROM ";
    if (params.only)
      sql += "ONLY ";
    sql += params.from;
    if (params.where) sql += ` WHERE ${params.where}`;
    if (params.orderBy) sql += ` ORDER BY ${params.orderBy}`;
    if (typeof params.limit === "number" && params.limit > 0) sql += ` LIMIT ${params.limit}`;
    if (typeof params.offset === "number" && params.offset > 0) sql += ` OFFSET ${params.offset}`;

    const ids = new Set<string>();
    this.withPreparedStatement(sql, (stmt) => {
      if (params.bindings)
        stmt.bindValues(params.bindings);
      for (const row of stmt) {
        if (row.id !== undefined) {
          ids.add(row.id);
          if (ids.size > IModelDb.maxLimit) {
            throw new IModelError(IModelStatus.BadRequest, "Max LIMIT exceeded in SELECT statement");
          }
        }
      }
    });
    return ids;
  }

  /** Empty the ECSqlStatementCache for this iModel.
   * @deprecated use clearCaches
   */
  public clearStatementCache(): void { this._statementCache.clear(); }

  /** Empty the SqliteStatementCache for this iModel.
   * @deprecated use clearCaches
   */
  public clearSqliteStatementCache(): void { this._sqliteStatementCache.clear(); }

  /** Clear all in-memory caches held in this IModelDb. */
  public clearCaches() {
    this._statementCache.clear();
    this._sqliteStatementCache.clear();
  }

  /** Get the GUID of this iModel.  */
  public getGuid(): GuidString { return this.nativeDb.getDbGuid(); }

  /** Update the project extents for this iModel.
   * <p><em>Example:</em>
   * ``` ts
   * [[include:IModelDb.updateProjectExtents]]
   * ```
   */
  public updateProjectExtents(newExtents: AxisAlignedBox3d) {
    this.projectExtents = newExtents;
    this.updateIModelProps();
  }

  /** Compute an appropriate project extents for this iModel based on the ranges of all spatial elements.
   * Typically, the result is simply the union of the ranges of all spatial elements. However, the algorithm also detects "outlier elements",
   * whose placements locate them so far from the rest of the spatial geometry that they are considered statistically insignificant. The
   * range of an outlier element does not contribute to the computed extents.
   * @param options Specifies the level of detail desired in the return value.
   * @returns the computed extents.
   * @note This method does not modify the IModel's stored project extents. @see [[updateProjectExtents]].
   */
  public computeProjectExtents(options?: ComputeProjectExtentsOptions): ComputedProjectExtents {
    const wantFullExtents = true === options?.reportExtentsWithOutliers;
    const wantOutliers = true === options?.reportOutliers;
    const result = this.nativeDb.computeProjectExtents(wantFullExtents, wantOutliers);
    return {
      extents: Range3d.fromJSON(result.extents),
      extentsWithOutliers: result.fullExtents ? Range3d.fromJSON(result.fullExtents) : undefined,
      outliers: result.outliers,
    };
  }

  /** Update the [EcefLocation]($docs/learning/glossary#eceflocation) of this iModel.  */
  public updateEcefLocation(ecef: EcefLocation) {
    this.setEcefLocation(ecef);
    this.updateIModelProps();
  }

  /** Update the IModelProps of this iModel in the database. */
  public updateIModelProps(): void {
    this.nativeDb.updateIModelProps(this.toJSON());
  }

  /** Commit pending changes to this iModel.
   * @note If this IModelDb is a briefcase that is synchronized with iModelHub, then you must call [[ConcurrencyControl.request]] before attempting to save changes.
   * @param description Optional description of the changes
   * @throws [[IModelError]] if there is a problem saving changes or if there are pending, un-processed lock or code requests.
   */
  public saveChanges(description?: string): void {
    if (this.openMode === OpenMode.Readonly)
      throw new IModelError(IModelStatus.ReadOnly, "IModelDb was opened read-only");

    const stat = this.nativeDb.saveChanges(description);
    if (DbResult.BE_SQLITE_OK !== stat)
      throw new IModelError(stat, `Could not save changes (${description})`);
  }

  /** Abandon pending changes in this iModel. You might also want to call [ConcurrencyControl.abandonResources]($backend) if this is a briefcase and you want to relinquish locks or codes that you acquired preemptively. */
  public abandonChanges(): void {
    this.nativeDb.abandonChanges();
  }

  /** @internal */
  public reverseTxns(numOperations: number, allowCrossSessions?: boolean): IModelStatus {
    return this.nativeDb.reverseTxns(numOperations, allowCrossSessions);
  }
  /** @internal */
  public reinstateTxn(): IModelStatus {
    return this.nativeDb.reinstateTxn();
  }

  /** Import an ECSchema. On success, the schema definition is stored in the iModel.
   * This method is asynchronous (must be awaited) because, in the case where this IModelDb is a briefcase, this method first obtains the schema lock from the iModel server.
   * You must import a schema into an iModel before you can insert instances of the classes in that schema. See [[Element]]
   * @param requestContext Context used for logging and authorization (if applicable)
   * @param schemaFileName  Full path to an ECSchema.xml file that is to be imported.
   * @throws [[IModelError]] if the schema lock cannot be obtained or there is a problem importing the schema.
   * @note Changes are saved if importSchemas is successful and abandoned if not successful.
   * @see querySchemaVersion
   */
  public async importSchemas(requestContext: ClientRequestContext, schemaFileNames: string[]): Promise<void> {
    requestContext.enter();
    if (this.isSnapshot || this.isStandalone) {
      const status = this.nativeDb.importSchemas(schemaFileNames);
      if (DbResult.BE_SQLITE_OK !== status)
        throw new IModelError(status, "Error importing schema");
      this.clearCaches();
      return;
    }

    if (!(requestContext instanceof AuthorizedClientRequestContext))
      throw new IModelError(BentleyStatus.ERROR, "Importing the schema requires an AuthorizedClientRequestContext");

    if (this.isBriefcaseDb() && this.allowLocalChanges) {
      await this.concurrencyControl.locks.lockSchema(requestContext);
      requestContext.enter();
    }

    const stat = this.nativeDb.importSchemas(schemaFileNames);
    if (DbResult.BE_SQLITE_OK !== stat) {
      throw new IModelError(stat, "Error importing schema");
    }

    this.clearCaches();
    try {
      // The schema import logic and/or imported Domains may have created new elements and models.
      // Make sure we have the supporting locks and codes.
      if (this.isBriefcaseDb() && this.allowLocalChanges) {
        await this.concurrencyControl.request(requestContext);
        requestContext.enter();
      }
    } catch (err) {
      requestContext.enter();
      this.abandonChanges();
      throw err;
    }
  }

  /** Import ECSchema(s) serialized to XML. On success, the schema definition is stored in the iModel.
   * This method is asynchronous (must be awaited) because, in the case where this IModelDb is a briefcase, this method first obtains the schema lock from the iModel server.
   * You must import a schema into an iModel before you can insert instances of the classes in that schema. See [[Element]]
   * @param requestContext Context used for logging and authorization (if applicable)
   * @param serializedXmlSchemas  The xml string(s) created from a serialized ECSchema.
   * @throws [[IModelError]] if the schema lock cannot be obtained or there is a problem importing the schema.
   * @note Changes are saved if importSchemaStrings is successful and abandoned if not successful.
   * @see querySchemaVersion
   * @alpha
   */
  public async importSchemaStrings(requestContext: ClientRequestContext, serializedXmlSchemas: string[]): Promise<void> {
    requestContext.enter();
    if (this.isSnapshot || this.isStandalone) {
      const status = this.nativeDb.importXmlSchemas(serializedXmlSchemas);
      if (DbResult.BE_SQLITE_OK !== status) {
        throw new IModelError(status, "Error importing schema");
      }
      this.clearCaches();
      return;
    }

    if (!(requestContext instanceof AuthorizedClientRequestContext)) {
      throw new IModelError(BentleyStatus.ERROR, "Importing the schema requires an AuthorizedClientRequestContext");
    }
    if (this.isBriefcaseDb() && this.allowLocalChanges) {
      await this.concurrencyControl.locks.lockSchema(requestContext);
      requestContext.enter();
    }

    const stat = this.nativeDb.importXmlSchemas(serializedXmlSchemas);
    if (DbResult.BE_SQLITE_OK !== stat) {
      throw new IModelError(stat, "Error importing schema");
    }

    this.clearCaches();
    try {
      // The schema import logic and/or imported Domains may have created new elements and models.
      // Make sure we have the supporting locks and codes.
      if (this.isBriefcaseDb() && this.allowLocalChanges) {
        await this.concurrencyControl.request(requestContext);
        requestContext.enter();
      }
    } catch (err) {
      requestContext.enter();
      this.abandonChanges();
      throw err;
    }
  }

  /** Find an opened instance of any subclass of IModelDb, by filename
   * @note this method returns an IModelDb if the filename is open for *any* subclass of IModelDb
  */
  public static findByFilename(fileName: string): IModelDb | undefined {
    for (const entry of this._openDbs) {
      if (entry[1].pathName === fileName)
        return entry[1];
    }
    return undefined;
  }

  /** Find an open IModelDb by its key.
   * @note This method is mainly for use by RPC implementations.
   * @throws [[IModelNotFoundResponse]] if an open IModelDb matching the key is not found.
   * @see [IModel.key]($common)
   */
  public static findByKey(key: string): IModelDb {
    const iModelDb = this.tryFindByKey(key);
    if (undefined === iModelDb) {
      Logger.logError(loggerCategory, "IModelDb not open or wrong type", () => ({ key }));
      throw new IModelNotFoundResponse(); // a very specific status for the RpcManager
    }
    return iModelDb;
  }

  /** Attempt to find an open IModelDb by key.
   * @returns The matching IModelDb or `undefined`.
   */
  public static tryFindByKey(key: string): IModelDb | undefined {
    return this._openDbs.get(key);
  }

  /** @internal */
  public static openDgnDb(file: { path: string, key?: string }, openMode: OpenMode, upgradeOptions?: UpgradeOptions, props?: SnapshotOpenOptions): IModelJsNative.DgnDb {
    file.key = file.key ?? Guid.createValue();
    if (this.tryFindByKey(file.key))
      throw new IModelError(IModelStatus.AlreadyOpen, `key [${file.key}] for file [${file.path}] is already in use`);

    const isUpgradeRequested = upgradeOptions?.domain === DomainOptions.Upgrade || upgradeOptions?.profile === ProfileOptions.Upgrade;
    if (isUpgradeRequested && openMode !== OpenMode.ReadWrite)
      throw new IModelError(IModelStatus.UpgradeFailed, "Cannot upgrade a Readonly Db");

    try {
      const nativeDb = new IModelHost.platform.DgnDb();
      nativeDb.openIModel(file.path, openMode, upgradeOptions, props);
      return nativeDb;
    } catch (err) {
      throw new IModelError(err.errorNumber, `Could not open iModel [${err.message}], ${file.path}`);
    }
  }

  /**
   * Determines if the schemas in the Db must or can be upgraded by comparing them with those included in the
   * current version of the software.
   * @param filePath Full name of the briefcase including path
   * @param forReadWrite Pass true if validating for read-write scenarios - note that the schema version requirements
   * for opening the DgnDb read-write is more stringent than when opening the database read-only
   * @throws [[IModelError]] If the Db was in an invalid state and that causes a problem with validating schemas
   * @see [[BriefcaseDb.upgradeSchemas]] or [[StandaloneDb.upgradeSchemas]]
   * @see ($docs/learning/backend/IModelDb.md#upgrading-schemas-in-an-imodel)
   */
  public static validateSchemas(filePath: string, forReadWrite: boolean): SchemaState {
    const openMode = forReadWrite ? OpenMode.ReadWrite : OpenMode.Readonly;
    const file = { path: filePath };
    let result = DbResult.BE_SQLITE_OK;
    try {
      const upgradeOptions: UpgradeOptions = {
        domain: DomainOptions.CheckRecommendedUpgrades,
      };
      const nativeDb = this.openDgnDb(file, openMode, upgradeOptions);
      nativeDb.closeIModel();
    } catch (err) {
      result = err.errorNumber;
    }

    let schemaState: SchemaState = SchemaState.UpToDate;
    switch (result) {
      case DbResult.BE_SQLITE_OK:
        schemaState = SchemaState.UpToDate;
        break;
      case DbResult.BE_SQLITE_ERROR_ProfileTooOld:
      case DbResult.BE_SQLITE_ERROR_ProfileTooOldForReadWrite:
      case DbResult.BE_SQLITE_ERROR_SchemaTooOld:
        schemaState = SchemaState.TooOld;
        break;
      case DbResult.BE_SQLITE_ERROR_ProfileTooNew:
      case DbResult.BE_SQLITE_ERROR_ProfileTooNewForReadWrite:
      case DbResult.BE_SQLITE_ERROR_SchemaTooNew:
        schemaState = SchemaState.TooNew;
        break;
      case DbResult.BE_SQLITE_ERROR_SchemaUpgradeRecommended:
        schemaState = SchemaState.UpgradeRecommended;
        break;
      case DbResult.BE_SQLITE_ERROR_SchemaUpgradeRequired:
        schemaState = SchemaState.UpgradeRequired;
        break;
      case DbResult.BE_SQLITE_ERROR_InvalidProfileVersion:
        throw new IModelError(DbResult.BE_SQLITE_ERROR_InvalidProfileVersion, "The profile of the Db is invalid. Cannot upgrade or open the Db.");
      default:
        throw new IModelError(DbResult.BE_SQLITE_ERROR, "Error validating schemas. Cannot upgrade or open the Db.");
    }
    return schemaState;
  }

  /** Get the ClassMetaDataRegistry for this iModel.
   * @internal
   */
  public get classMetaDataRegistry(): MetaDataRegistry {
    if (this._classMetaDataRegistry === undefined) this._classMetaDataRegistry = new MetaDataRegistry();
    return this._classMetaDataRegistry;
  }

  /** Get the linkTableRelationships for this IModel */
  public get relationships(): Relationships { return this._relationships || (this._relationships = new Relationships(this)); }

  /** Get the CodeSpecs in this IModel. */
  public get codeSpecs(): CodeSpecs { return (this._codeSpecs !== undefined) ? this._codeSpecs : (this._codeSpecs = new CodeSpecs(this)); }

  /** @internal */
  public insertCodeSpec(codeSpec: CodeSpec): Id64String {
    const { error, result } = this.nativeDb.insertCodeSpec(codeSpec.name, JSON.stringify(codeSpec.properties));
    if (error) throw new IModelError(error.status, `inserting CodeSpec ${codeSpec}`);
    return Id64.fromJSON(result);
  }

  /** Prepare an ECSQL statement.
   * @param sql The ECSQL statement to prepare
   * @throws [[IModelError]] if there is a problem preparing the statement.
   */
  public prepareStatement(sql: string): ECSqlStatement {
    const stmt = new ECSqlStatement();
    stmt.prepare(this.nativeDb, sql);
    return stmt;
  }

  /** Prepare an ECSQL statement.
   * @param sql The ECSQL statement to prepare
   * @returns `undefined` if there is a problem preparing the statement.
   */
  public tryPrepareStatement(sql: string): ECSqlStatement | undefined {
    const statement = new ECSqlStatement();
    const result = statement.tryPrepare(this.nativeDb, sql);
    return DbResult.BE_SQLITE_OK === result.status ? statement : undefined;
  }

  /** Construct an entity (Element or Model) from an iModel.
   * @throws [[IModelError]] if the entity cannot be constructed.
   */
  public constructEntity<T extends Entity>(props: EntityProps): T {
    const jsClass = this.getJsClass(props.classFullName);
    return new jsClass(props, this) as T;
  }

  /** Get the JavaScript class that handles a given entity class.  */
  public getJsClass<T extends typeof Entity>(classFullName: string): T {
    try {
      return ClassRegistry.getClass(classFullName, this) as T;
    } catch (err) {
      if (!ClassRegistry.isNotFoundError(err)) {
        Logger.logError(loggerCategory, err.toString());
        throw err;
      }

      this.loadMetaData(classFullName);
      return ClassRegistry.getClass(classFullName, this) as T;
    }
  }

  /** Get metadata for a class. This method will load the metadata from the iModel into the cache as a side-effect, if necessary.
   * @throws [[IModelError]] if the metadata cannot be found nor loaded.
   */
  public getMetaData(classFullName: string): EntityMetaData {
    let metadata = this.classMetaDataRegistry.find(classFullName);
    if (metadata === undefined) {
      this.loadMetaData(classFullName);
      metadata = this.classMetaDataRegistry.find(classFullName);
      if (metadata === undefined)
        throw ClassRegistry.makeMetaDataNotFoundError(classFullName); // do not log
    }
    return metadata;
  }

  /** Invoke a callback on each property of the specified class, optionally including superclass properties.
   * @param iModel  The IModel that contains the schema
   * @param classFullName The full class name to load the metadata, if necessary
   * @param wantSuper If true, superclass properties will also be processed
   * @param func The callback to be invoked on each property
   * @param includeCustom If true (default), include custom-handled properties in the iteration. Otherwise, skip custom-handled properties.
   * @note Custom-handled properties are core properties that have behavior enforced by C++ handlers.
   */
  public static forEachMetaData(iModel: IModelDb, classFullName: string, wantSuper: boolean, func: PropertyCallback, includeCustom: boolean = true) {
    const meta = iModel.getMetaData(classFullName); // will load if necessary
    for (const propName in meta.properties) { // eslint-disable-line guard-for-in
      const propMeta = meta.properties[propName];
      if (includeCustom || !propMeta.isCustomHandled || propMeta.isCustomHandledOrphan)
        func(propName, propMeta);
    }

    if (wantSuper && meta.baseClasses && meta.baseClasses.length > 0)
      meta.baseClasses.forEach((baseClass) => this.forEachMetaData(iModel, baseClass, true, func, includeCustom));
  }

  /** @internal */
  private loadMetaData(classFullName: string) {
    if (this.classMetaDataRegistry.find(classFullName))
      return;

    const className = classFullName.split(":");
    if (className.length !== 2)
      throw new IModelError(IModelStatus.BadArg, `Invalid classFullName: ${classFullName}`);

    const val = this.nativeDb.getECClassMetaData(className[0], className[1]);
    if (val.error)
      throw new IModelError(val.error.status, `Error getting class meta data for: ${classFullName}`);

    const metaData = new EntityMetaData(JSON.parse(val.result!));
    this.classMetaDataRegistry.add(classFullName, metaData);

    // Recursive, to make sure that base classes are cached.
    if (metaData.baseClasses !== undefined && metaData.baseClasses.length > 0)
      metaData.baseClasses.forEach((baseClassName: string) => this.loadMetaData(baseClassName));
  }

  /** Query if this iModel contains the definition of the specified class.
   * @param classFullName The full name of the class, for example, SomeSchema:SomeClass
   * @returns true if the iModel contains the class definition or false if not.
   * @see querySchemaVersion
   * @see importSchema
   */
  public containsClass(classFullName: string): boolean {
    const classNameParts = classFullName.replace(".", ":").split(":");
    return classNameParts.length === 2 && this.nativeDb.getECClassMetaData(classNameParts[0], classNameParts[1]).error === undefined;
  }

  /** Query for a schema of the specified name in this iModel.
   * @returns The schema version as a semver-compatible string or `undefined` if the schema has not been imported.
   */
  public querySchemaVersion(schemaName: string): string | undefined {
    const sql = `SELECT VersionMajor,VersionWrite,VersionMinor FROM ECDbMeta.ECSchemaDef WHERE Name=:schemaName LIMIT 1`;
    return this.withPreparedStatement(sql, (statement: ECSqlStatement): string | undefined => {
      statement.bindString("schemaName", schemaName);
      if (DbResult.BE_SQLITE_ROW === statement.step()) {
        const versionMajor: number = statement.getValue(0).getInteger(); // ECSchemaDef.VersionMajor --> semver.major
        const versionWrite: number = statement.getValue(1).getInteger(); // ECSchemaDef.VersionWrite --> semver.minor
        const versionMinor: number = statement.getValue(2).getInteger(); // ECSchemaDef.VersionMinor --> semver.patch
        return `${versionMajor}.${versionWrite}.${versionMinor}`;
      }
      return undefined;
    });
  }

  /** Retrieve a named texture image from this iModel, as a Uint8Array.
   * @param props the texture load properties which must include the name of the texture to load
   * @returns the Uint8Array or undefined if the texture image is not present.
   * @alpha
   */
  public getTextureImage(props: TextureLoadProps): Uint8Array | undefined { return this.nativeDb.getTextureImage(props); }

  /** Query a "file property" from this iModel, as a string.
   * @returns the property string or undefined if the property is not present.
   */
  public queryFilePropertyString(prop: FilePropertyProps): string | undefined {
    return this.nativeDb.queryFileProperty(prop, true) as string | undefined;
  }

  /** Query a "file property" from this iModel, as a blob.
   * @returns the property blob or undefined if the property is not present.
   */
  public queryFilePropertyBlob(prop: FilePropertyProps): Uint8Array | undefined {
    return this.nativeDb.queryFileProperty(prop, false) as Uint8Array | undefined;
  }

  /** Save a "file property" to this iModel
   * @param prop the FilePropertyProps that describes the new property
   * @param value either a string or a blob to save as the file property
   * @returns 0 if successful, status otherwise
   */
  public saveFileProperty(prop: FilePropertyProps, strValue: string | undefined, blobVal?: Uint8Array): DbResult {
    try {
      this.nativeDb.saveFileProperty(prop, strValue, blobVal);
      return DbResult.BE_SQLITE_OK;
    } catch (err) {
      return err.errorNumber;
    }
  }

  /** delete a "file property" from this iModel
   * @param prop the FilePropertyProps that describes the property
   * @returns 0 if successful, status otherwise
   */
  public deleteFileProperty(prop: FilePropertyProps): DbResult {
    try {
      this.nativeDb.saveFileProperty(prop, undefined, undefined);
      return DbResult.BE_SQLITE_OK;
    } catch (err) {
      return err.errorNumber;
    }
  }

  /** Query for the next available major id for a "file property" from this iModel.
   * @param prop the FilePropertyProps that describes the property
   * @returns the next available (that is, an unused) id for prop. If none are present, will return 0.
   */
  public queryNextAvailableFileProperty(prop: FilePropertyProps) { return this.nativeDb.queryNextAvailableFileProperty(prop); }

  public async requestSnap(requestContext: ClientRequestContext, sessionId: string, props: SnapRequestProps): Promise<SnapResponseProps> {
    requestContext.enter();
    let request = this._snaps.get(sessionId);
    if (undefined === request) {
      request = new IModelHost.platform.SnapRequest();
      this._snaps.set(sessionId, request);
    } else
      request.cancelSnap();

    return new Promise<SnapResponseProps>((resolve, reject) => {
      if (!this.isOpen) {
        reject(new Error("not open"));
      } else {
        request!.doSnap(this.nativeDb, JsonUtils.toObject(props), (ret: IModelJsNative.ErrorStatusOrResult<IModelStatus, SnapResponseProps>) => {
          this._snaps.delete(sessionId);
          if (ret.error !== undefined)
            reject(new Error(ret.error.message));
          else
            resolve(ret.result!); // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
        });
      }
    });
  }

  /** Cancel a previously requested snap. */
  public cancelSnap(sessionId: string): void {
    const request = this._snaps.get(sessionId);
    if (undefined !== request) {
      request.cancelSnap();
      this._snaps.delete(sessionId);
    }
  }

  /** Get the clip containment status for the supplied elements. */
  public async getGeometryContainment(requestContext: ClientRequestContext, props: GeometryContainmentRequestProps): Promise<GeometryContainmentResponseProps> {
    requestContext.enter();
    return new Promise<GeometryContainmentResponseProps>((resolve, reject) => {
      if (!this.isOpen) {
        reject(new Error("not open"));
      } else {
        this.nativeDb.getGeometryContainment(JSON.stringify(props), (ret: IModelJsNative.ErrorStatusOrResult<IModelStatus, GeometryContainmentResponseProps>) => {
          if (ret.error !== undefined)
            reject(new Error(ret.error.message));
          else
            resolve(ret.result!); // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
        });
      }
    });
  }

  /** Get the mass properties for the supplied elements. */
  public async getMassProperties(requestContext: ClientRequestContext, props: MassPropertiesRequestProps): Promise<MassPropertiesResponseProps> {
    requestContext.enter();
    const resultString = this.nativeDb.getMassProperties(JSON.stringify(props));
    return JSON.parse(resultString) as MassPropertiesResponseProps;
  }

  /** Get the IModel coordinate corresponding to each GeoCoordinate point in the input */
  public async getIModelCoordinatesFromGeoCoordinates(requestContext: ClientRequestContext, props: string): Promise<IModelCoordinatesResponseProps> {
    requestContext.enter();
    const resultString = this.nativeDb.getIModelCoordinatesFromGeoCoordinates(props);
    return JSON.parse(resultString) as IModelCoordinatesResponseProps;
  }

  /** Get the GeoCoordinate (longitude, latitude, elevation) corresponding to each IModel Coordinate point in the input */
  public async getGeoCoordinatesFromIModelCoordinates(requestContext: ClientRequestContext, props: string): Promise<GeoCoordinatesResponseProps> {
    requestContext.enter();
    const resultString = this.nativeDb.getGeoCoordinatesFromIModelCoordinates(props);
    return JSON.parse(resultString) as GeoCoordinatesResponseProps;
  }

  /** Export meshes suitable for graphics APIs from arbitrary geometry in elements in this IModelDb.
   *  * Requests can be slow when processing many elements so it is expected that this function be used on a dedicated backend,
   *    or that shared backends export a limited number of elements at a time.
   *  * Vertices are exported in the IModelDb's world coordinate system, which is right-handed with Z pointing up.
   *  * The results of changing [ExportGraphicsOptions]($imodeljs-backend) during the [ExportGraphicsOptions.onGraphics]($imodeljs-backend) callback are not defined.
   *
   * Example that prints the mesh for element 1 to stdout in [OBJ format](https://en.wikipedia.org/wiki/Wavefront_.obj_file)
   * ```ts
   * const onGraphics: ExportGraphicsFunction = (info: ExportGraphicsInfo) => {
   *   const mesh: ExportGraphicsMesh = info.mesh;
   *   for (let i = 0; i < mesh.points.length; i += 3) {
   *     process.stdout.write(`v ${mesh.points[i]} ${mesh.points[i + 1]} ${mesh.points[i + 2]}\n`);
   *     process.stdout.write(`vn ${mesh.normals[i]} ${mesh.normals[i + 1]} ${mesh.normals[i + 2]}\n`);
   *   }
   *
   *   for (let i = 0; i < mesh.params.length; i += 2) {
   *     process.stdout.write(`vt ${mesh.params[i]} ${mesh.params[i + 1]}\n`);
   *   }
   *
   *   for (let i = 0; i < mesh.indices.length; i += 3) {
   *     const p1 = mesh.indices[i];
   *     const p2 = mesh.indices[i + 1];
   *     const p3 = mesh.indices[i + 2];
   *     process.stdout.write(`f ${p1}/${p1}/${p1} ${p2}/${p2}/${p2} ${p3}/${p3}/${p3}\n`);
   *   }
   * };
   *
   * iModel.exportGraphics(({ onGraphics, elementIdArray: ["0x1"] }));
   * ```
   * @returns 0 if successful, status otherwise
   * @public
   */
  public exportGraphics(exportProps: ExportGraphicsOptions): DbResult {
    return this.nativeDb.exportGraphics(exportProps);
  }

  /**
   * Exports meshes suitable for graphics APIs from a specified [GeometryPart]($imodeljs-backend)
   * in this IModelDb.
   * The expected use case is to call [IModelDb.exportGraphics]($imodeljs-backend) and supply the
   * optional partInstanceArray argument, then call this function for each unique GeometryPart from
   * that list.
   *  * The results of changing [ExportPartGraphicsOptions]($imodeljs-backend) during the
   *    [ExportPartGraphicsOptions.onPartGraphics]($imodeljs-backend) callback are not defined.
   *  * See export-gltf under test-apps in the iModel.js monorepo for a working reference.
   * @returns 0 is successful, status otherwise
   * @public
   */
  public exportPartGraphics(exportProps: ExportPartGraphicsOptions): DbResult {
    return this.nativeDb.exportPartGraphics(exportProps);
  }

  /** Request geometry stream information from an element in binary format instead of json.
   * @returns DbResult.BE_SQLITE_OK if successful
   * @alpha
   */
  public elementGeometryRequest(requestProps: ElementGeometryRequest): DbResult {
    return this.nativeDb.processGeometryStream(requestProps);
  }

  /** Update the geometry stream for the supplied element from binary format data instead of json.
   * @returns DbResult.BE_SQLITE_OK if successful
   * @alpha
   */
  public elementGeometryUpdate(updateProps: ElementGeometryUpdate): DbResult {
    return this.nativeDb.updateGeometryStream(updateProps);
  }

  /** Create brep geometry for inclusion in an element's geometry stream.
   * @returns DbResult.BE_SQLITE_OK if successful
   * @throws [[IModelError]] to report issues with input geometry or parameters
   * @see [IModelDb.elementGeometryUpdate]($imodeljs-backend)
   * @alpha
   */
  public createBRepGeometry(createProps: BRepGeometryCreate): DbResult {
    return this.nativeDb.createBRepGeometry(createProps);
  }

  /** Generate graphics for an element or geometry stream.
   * @see [readElementGraphics]($frontend) to convert the result to a [RenderGraphic]($frontend) for display.
   */
  public async generateElementGraphics(request: ElementGraphicsRequestProps): Promise<Uint8Array | undefined> {
    return generateElementGraphics(request, this);
  }
}

/** @public */
export namespace IModelDb { // eslint-disable-line no-redeclare

  /** The collection of models in an [[IModelDb]].
   * @public
   */
  export class Models {
    /** @internal */
    public constructor(private _iModel: IModelDb) { }

    /** Get the ModelProps with the specified identifier.
     * @param modelId The Model identifier.
     * @throws [[IModelError]] if the model is not found or cannot be loaded.
     * @see tryGetModelProps
     */
    public getModelProps<T extends ModelProps>(id: Id64String): T {
      return this.getModelJson<T>({ id });
    }

    /** Get the ModelProps with the specified identifier.
     * @param modelId The Model identifier.
     * @returns The ModelProps or `undefined` if the model is not found.
     * @throws [[IModelError]] if the model cannot be loaded.
     * @note Useful for cases when a model may or may not exist and throwing an `Error` would be overkill.
     * @see getModelProps
     */
    public tryGetModelProps<T extends ModelProps>(id: Id64String): T | undefined {
      return this.tryGetModelJson({ id });
    }

    /** Query for the last modified time of the specified Model.
     * @internal
     */
    public queryLastModifiedTime(modelId: Id64String): string {
      const sql = `SELECT LastMod FROM ${Model.classFullName} WHERE ECInstanceId=:modelId`;
      return this._iModel.withPreparedStatement(sql, (statement) => {
        statement.bindId("modelId", modelId);
        if (DbResult.BE_SQLITE_ROW === statement.step()) {
          return statement.getValue(0).getDateTime();
        }
        throw new IModelError(IModelStatus.InvalidId, `Can't get lastMod time for Model ${modelId}`);
      });
    }

    /** Get the Model with the specified identifier.
     * @param modelId The Model identifier.
     * @param modelClass Optional class to validate instance against. This parameter can accept abstract or concrete classes, but should be the same as the template (`T`) parameter.
     * @throws [[IModelError]] if the model is not found, cannot be loaded, or fails validation when `modelClass` is specified.
     * @see tryGetModel
     */
    public getModel<T extends Model>(modelId: Id64String, modelClass?: EntityClassType<Model>): T {
      const model: T | undefined = this.tryGetModel(modelId, modelClass);
      if (undefined === model) {
        throw new IModelError(IModelStatus.NotFound, `Model=${modelId}`);
      }
      return model;
    }

    /** Get the Model with the specified identifier.
     * @param modelId The Model identifier.
     * @param modelClass Optional class to validate instance against. This parameter can accept abstract or concrete classes, but should be the same as the template (`T`) parameter.
     * @returns The Model or `undefined` if the model is not found or fails validation when `modelClass` is specified.
     * @throws [[IModelError]] if the model cannot be loaded.
     * @note Useful for cases when a model may or may not exist and throwing an `Error` would be overkill.
     * @see getModel
     */
    public tryGetModel<T extends Model>(modelId: Id64String, modelClass?: EntityClassType<Model>): T | undefined {
      const modelProps = this.tryGetModelProps<T>(modelId);
      if (undefined === modelProps) {
        return undefined; // no Model with that modelId found
      }
      const model = this._iModel.constructEntity<T>(modelProps);
      if (undefined === modelClass) {
        return model; // modelClass was not specified, cannot call instanceof to validate
      }
      return model instanceof modelClass ? model : undefined;
    }

    /** Read the properties for a Model as a json string.
     * @param modelIdArg a json string with the identity of the model to load. Must have either "id" or "code".
     * @returns a json string with the properties of the model.
     * @throws [[IModelError]] if the model is not found or cannot be loaded.
     * @see tryGetModelJson
     * @internal
     */
    public getModelJson<T extends ModelProps>(modelIdArg: ModelLoadProps): T {
      const modelJson = this.tryGetModelJson<T>(modelIdArg);
      if (undefined === modelJson) {
        throw new IModelError(IModelStatus.NotFound, `Model=${modelIdArg}`);
      }
      return modelJson;
    }

    /** Read the properties for a Model as a json string.
     * @param modelIdArg a json string with the identity of the model to load. Must have either "id" or "code".
     * @returns a json string with the properties of the model or `undefined` if the model is not found.
     * @see getModelJson
     */
    private tryGetModelJson<T extends ModelProps>(modelIdArg: ModelLoadProps): T | undefined {
      try {
        return this._iModel.nativeDb.getModel(modelIdArg) as T;
      } catch (err) {
        return undefined;
      }
    }

    /** Get the sub-model of the specified Element.
     * See [[IModelDb.Elements.queryElementIdByCode]] for more on how to find an element by Code.
     * @param modeledElementId Identifies the modeled element.
     * @param modelClass Optional class to validate instance against. This parameter can accept abstract or concrete classes, but should be the same as the template (`T`) parameter.
     * @throws [[IModelError]] if the sub-model is not found, cannot be loaded, or fails validation when `modelClass` is specified.
     * @see tryGetSubModel
     */
    public getSubModel<T extends Model>(modeledElementId: Id64String | GuidString | Code, modelClass?: EntityClassType<Model>): T {
      const modeledElementProps = this._iModel.elements.getElementProps<ElementProps>(modeledElementId);
      if (modeledElementProps.id === IModel.rootSubjectId) {
        throw new IModelError(IModelStatus.NotFound, "Root subject does not have a sub-model");
      }
      return this.getModel<T>(modeledElementProps.id!, modelClass);
    }

    /** Get the sub-model of the specified Element.
     * See [[IModelDb.Elements.queryElementIdByCode]] for more on how to find an element by Code.
     * @param modeledElementId Identifies the modeled element.
     * @param modelClass Optional class to validate instance against. This parameter can accept abstract or concrete classes, but should be the same as the template (`T`) parameter.
     * @returns The sub-model or `undefined` if the specified element does not have a sub-model or fails validation when `modelClass` is specified.
     * @see getSubModel
     */
    public tryGetSubModel<T extends Model>(modeledElementId: Id64String | GuidString | Code, modelClass?: EntityClassType<Model>): T | undefined {
      const modeledElementProps = this._iModel.elements.tryGetElementProps(modeledElementId);
      if ((undefined === modeledElementProps) || (IModel.rootSubjectId === modeledElementProps.id)) {
        return undefined;
      }
      return this.tryGetModel<T>(modeledElementProps.id!, modelClass);
    }

    /** Create a new model in memory.
     * See the example in [[InformationPartitionElement]].
     * @param modelProps The properties to use when creating the model.
     * @throws [[IModelError]] if there is a problem creating the model.
     */
    public createModel<T extends Model>(modelProps: ModelProps): T { return this._iModel.constructEntity<T>(modelProps); }

    /** Insert a new model.
     * @param props The data for the new model.
     * @returns The newly inserted model's Id.
     * @throws [[IModelError]] if unable to insert the model.
     */
    public insertModel(props: ModelProps): Id64String {
      try {
        return props.id = this._iModel.nativeDb.insertModel(props instanceof Model ? props.toJSON() : props);
      } catch (err) {
        throw new IModelError(err.errorNumber, `Error inserting model [${err.message}], class=${props.classFullName}`);
      }
    }

    /** Update an existing model.
     * @param props the properties of the model to change
     * @throws [[IModelError]] if unable to update the model.
     */
    public updateModel(props: UpdateModelOptions): void {
      try {
        this._iModel.nativeDb.updateModel(props instanceof Model ? props.toJSON() : props);
      } catch (err) {
        throw new IModelError(err.errorNumber, `error updating model [${err.message}] id=${props.id}`);
      }
    }
    /** Mark the geometry of [[GeometricModel]] as having changed, by recording an indirect change to its GeometryGuid property.
     * Typically the GeometryGuid changes automatically when [[GeometricElement]]s within the model are modified, but
     * explicitly updating it is occasionally useful after modifying definition elements like line styles or materials that indirectly affect the appearance of
     * [[GeometricElement]]s that reference those definition elements in their geometry streams.
     * Cached [Tile]($frontend)s are only invalidated after the geometry guid of the model changes.
     * @note This will throw IModelError with [IModelStatus.VersionTooOld]($bentleyjs-core) if a version of the BisCore schema older than 1.0.11 is present in the iModel.
     * @throws IModelError if unable to update the geometry guid.
     * @see [[TxnManager.onModelGeometryChanged]] for the event emitted in response to such a change.
     */
    public updateGeometryGuid(modelId: Id64String): void {
      const error = this._iModel.nativeDb.updateModelGeometryGuid(modelId);
      if (error !== IModelStatus.Success)
        throw new IModelError(error, `updating geometry guid for model ${modelId}`);
    }

    /** Delete one or more existing models.
     * @param ids The Ids of the models to be deleted
     * @throws [[IModelError]]
     */
    public deleteModel(ids: Id64Arg): void {
      Id64.toIdSet(ids).forEach((id) => {
        try {
          this._iModel.nativeDb.deleteModel(id);
        } catch (err) {
          throw new IModelError(err.errorNumber, `error deleting model [${err.message}] id ${id}`);
        }
      });
    }
  }

  /** The collection of elements in an [[IModelDb]].
   * @public
   */
  export class Elements {
    /** @internal */
    public constructor(private _iModel: IModelDb) { }

    /** Read element data from the iModel as JSON
     * @param elementIdArg a json string with the identity of the element to load. Must have one of "id", "federationGuid", or "code".
     * @returns The JSON properties of the element.
     * @throws [[IModelError]] if the element is not found or cannot be loaded.
     * @see tryGetElementJson
     * @internal
     */
    public getElementJson<T extends ElementProps>(elementId: ElementLoadProps): T {
      const elementProps = this.tryGetElementJson<T>(elementId);
      if (undefined === elementProps)
        throw new IModelError(IModelStatus.NotFound, `reading element=${elementId}`);
      return elementProps;
    }

    /** Read element data from the iModel as JSON
     * @param elementIdArg a json string with the identity of the element to load. Must have one of "id", "federationGuid", or "code".
     * @returns The JSON properties of the element or `undefined` if the element is not found.
     * @throws [[IModelError]] if the element exists, but cannot be loaded.
     * @see getElementJson
     */
    private tryGetElementJson<T extends ElementProps>(loadProps: ElementLoadProps): T | undefined {
      try {
        return this._iModel.nativeDb.getElement(loadProps) as T;
      } catch (err) {
        return undefined;
      }
    }

    /** Get properties of an Element by Id, FederationGuid, or Code
     * @throws [[IModelError]] if the element is not found or cannot be loaded.
     * @see tryGetElementProps
     */
    public getElementProps<T extends ElementProps>(elementId: Id64String | GuidString | Code | ElementLoadProps): T {
      const elementProps = this.tryGetElementProps<T>(elementId);
      if (undefined === elementProps)
        throw new IModelError(IModelStatus.NotFound, `reading element=${elementId}`);
      return elementProps;
    }

    /** Get properties of an Element by Id, FederationGuid, or Code
     * @returns The properties of the element or `undefined` if the element is not found.
     * @throws [[IModelError]] if the element exists, but cannot be loaded.
     * @note Useful for cases when an element may or may not exist and throwing an `Error` would be overkill.
     * @see getElementProps
     */
    public tryGetElementProps<T extends ElementProps>(elementId: Id64String | GuidString | Code | ElementLoadProps): T | undefined {
      if (typeof elementId === "string") {
        elementId = Id64.isId64(elementId) ? { id: elementId } : { federationGuid: elementId };
      } else if (elementId instanceof Code) {
        elementId = { code: elementId };
      }
      return this.tryGetElementJson<T>(elementId);
    }

    /** Get an element by Id, FederationGuid, or Code
     * @param elementId either the element's Id, Code, or FederationGuid, or an ElementLoadProps
     * @param elementClass Optional class to validate instance against. This parameter can accept abstract or concrete classes, but should be the same as the template (`T`) parameter.
     * @throws [[IModelError]] if the element is not found, cannot be loaded, or fails validation when `elementClass` is specified.
     * @see tryGetElement
     */
    public getElement<T extends Element>(elementId: Id64String | GuidString | Code | ElementLoadProps, elementClass?: EntityClassType<Element>): T {
      const element = this.tryGetElement<T>(elementId, elementClass);
      if (undefined === element)
        throw new IModelError(IModelStatus.NotFound, `Element=${elementId}`);
      return element;
    }

    /** Get an element by Id, FederationGuid, or Code
     * @param elementId either the element's Id, Code, or FederationGuid, or an ElementLoadProps
     * @param elementClass Optional class to validate instance against. This parameter can accept abstract or concrete classes, but should be the same as the template (`T`) parameter.
     * @returns The element or `undefined` if the element is not found or fails validation when `elementClass` is specified.
     * @throws [[IModelError]] if the element exists, but cannot be loaded.
     * @note Useful for cases when an element may or may not exist and throwing an `Error` would be overkill.
     * @see getElement
     */
    public tryGetElement<T extends Element>(elementId: Id64String | GuidString | Code | ElementLoadProps, elementClass?: EntityClassType<Element>): T | undefined {
      if (typeof elementId === "string") {
        elementId = Id64.isId64(elementId) ? { id: elementId } : { federationGuid: elementId };
      } else if (elementId instanceof Code) {
        elementId = { code: elementId };
      }
      const elementProps = this.tryGetElementJson<T>(elementId);
      if (undefined === elementProps) {
        return undefined; // no Element with that elementId found
      }
      const element = this._iModel.constructEntity<T>(elementProps);
      if (undefined === elementClass) {
        return element; // elementClass was not specified, cannot call instanceof to validate
      }
      return element instanceof elementClass ? element : undefined;
    }

    /** Query for the Id of the element that has a specified code.
     * This method is for the case where you know the element's Code.
     * If you only know the code *value*, then in the simplest case, you can query on that
     * and filter the results.
     * In the simple case, call [[IModelDb.queryEntityIds]], specifying the code value in the where clause of the query params.
     * Or, you can execute an ECSQL select statement. See
     * [frequently used ECSQL queries]($docs/learning/backend/ECSQL-queries.md) for an example.
     * @param code The code to look for
     * @returns The element that uses the code or undefined if the code is not used.
     * @throws IModelError if the code is invalid
     */
    public queryElementIdByCode(code: Code): Id64String | undefined {
      if (Id64.isInvalid(code.spec))
        throw new IModelError(IModelStatus.InvalidCodeSpec, "Invalid CodeSpec");

      if (code.value === undefined)
        throw new IModelError(IModelStatus.InvalidCode, "Invalid Code");

      return this._iModel.withPreparedStatement("SELECT ECInstanceId FROM BisCore:Element WHERE CodeSpec.Id=? AND CodeScope.Id=? AND CodeValue=?", (stmt: ECSqlStatement) => {
        stmt.bindId(1, code.spec);
        stmt.bindId(2, Id64.fromString(code.scope));
        stmt.bindString(3, code.value);
        if (DbResult.BE_SQLITE_ROW !== stmt.step())
          return undefined;

        return stmt.getValue(0).getId();
      });
    }

    /** Query for the last modified time of the specified element.
     * @internal
     */
    public queryLastModifiedTime(elementId: Id64String): string {
      const sql = "SELECT LastMod FROM BisCore:Element WHERE ECInstanceId=:elementId";
      return this._iModel.withPreparedStatement<string>(sql, (statement: ECSqlStatement): string => {
        statement.bindId("elementId", elementId);
        if (DbResult.BE_SQLITE_ROW === statement.step())
          return statement.getValue(0).getDateTime();
        throw new IModelError(IModelStatus.InvalidId, `Can't get lastMod time for Element ${elementId}`);
      });
    }

    /** Create a new instance of an element.
     * @param elProps The properties of the new element.
     * @throws [[IModelError]] if there is a problem creating the element.
     */
    public createElement<T extends Element>(elProps: ElementProps): T { return this._iModel.constructEntity<T>(elProps); }

    /** Insert a new element into the iModel.
     * @param elProps The properties of the new element.
     * @returns The newly inserted element's Id.
     * @throws [[IModelError]] if unable to insert the element.
     */
    public insertElement(elProps: ElementProps): Id64String {
      try {
        return elProps.id = this._iModel.nativeDb.insertElement(elProps instanceof Element ? elProps.toJSON() : elProps);
      } catch (err) {
        throw new IModelError(err.errorNumber, `Error inserting element [${err.message}], class=${elProps.classFullName}`);
      }
    }

    /** Update some properties of an existing element.
     * To support clearing a property value, every property name that is present in the `elProps` object will be updated even if the value is `undefined`.
     * To keep an individual element property unchanged, it should either be excluded from the `elProps` parameter or set to its current value.
     * @param elProps the properties of the element to update.
     * @note As described above, this is a special case where there is a difference between a property being excluded and a property being present in `elProps` but set to `undefined`.
     * @throws [[IModelError]] if unable to update the element.
     */
    public updateElement(elProps: ElementProps): void {
      try {
        this._iModel.nativeDb.updateElement(elProps instanceof Element ? elProps.toJSON() : elProps);
      } catch (err) {
        throw new IModelError(err.errorNumber, `Error updating element [${err.message}], id:${elProps.id}`);
      }
    }

    /** Delete one or more elements from this iModel.
     * @param ids The set of Ids of the element(s) to be deleted
     * @throws [[IModelError]]
     * @see deleteDefinitionElements
     */
    public deleteElement(ids: Id64Arg): void {
      const iModel = this._iModel;
      Id64.toIdSet(ids).forEach((id) => {
        try {
          iModel.nativeDb.deleteElement(id);
        } catch (err) {
          throw new IModelError(err.errorNumber, `Error deleting element [${err.message}], id:${id}`);
        }
      });
    }

    /** DefinitionElements can only be deleted if it can be determined that they are not referenced by other Elements.
     * This *usage query* can be expensive since it may involve scanning the GeometryStreams of all GeometricElements.
     * Since [[deleteElement]] does not perform these additional checks, it fails in order to prevent potentially referenced DefinitionElements from being deleted.
     * This method performs those expensive checks and then calls *delete* if not referenced.
     * @param ids The Ids of the DefinitionElements to attempt to delete. To prevent multiple passes over the same GeometricElements, it is best to pass in the entire array of
     * DefinitionElements rather than calling this method separately for each one. Ids that are not valid DefinitionElements will be ignored.
     * @returns An IdSet of the DefinitionElements that are used and were therefore not deleted.
     * @see deleteElement
     * @beta
     */
    public deleteDefinitionElements(definitionElementIds: Id64Array): Id64Set {
      const usageInfo = this._iModel.nativeDb.queryDefinitionElementUsage(definitionElementIds);
      if (!usageInfo) {
        throw new IModelError(IModelStatus.BadRequest, "Error querying for DefinitionElement usage");
      }
      const usedIdSet = usageInfo.usedIds ? Id64.toIdSet(usageInfo.usedIds) : new Set<Id64String>();
      const deleteIfUnused = (ids: Id64Array | undefined, used: Id64Set): void => {
        if (ids) { ids.forEach((id) => { if (!used.has(id)) { this._iModel.elements.deleteElement(id); } }); }
      };
      try {
        this._iModel.nativeDb.beginPurgeOperation();
        deleteIfUnused(usageInfo.spatialCategoryIds, usedIdSet);
        deleteIfUnused(usageInfo.drawingCategoryIds, usedIdSet);
        deleteIfUnused(usageInfo.viewDefinitionIds, usedIdSet);
        deleteIfUnused(usageInfo.geometryPartIds, usedIdSet);
        deleteIfUnused(usageInfo.lineStyleIds, usedIdSet);
        deleteIfUnused(usageInfo.renderMaterialIds, usedIdSet);
        deleteIfUnused(usageInfo.subCategoryIds, usedIdSet);
        deleteIfUnused(usageInfo.textureIds, usedIdSet);
        deleteIfUnused(usageInfo.displayStyleIds, usedIdSet);
        deleteIfUnused(usageInfo.categorySelectorIds, usedIdSet);
        deleteIfUnused(usageInfo.modelSelectorIds, usedIdSet);
        if (usageInfo.otherDefinitionElementIds) {
          this._iModel.elements.deleteElement(usageInfo.otherDefinitionElementIds);
        }
      } finally {
        this._iModel.nativeDb.endPurgeOperation();
      }
      if (usageInfo.viewDefinitionIds) {
        // take another pass in case a deleted ViewDefinition was the only usage of these view-related DefinitionElements
        let viewRelatedIds: Id64Array = [];
        if (usageInfo.displayStyleIds) { viewRelatedIds = viewRelatedIds.concat(usageInfo.displayStyleIds.filter((id) => usedIdSet.has(id))); }
        if (usageInfo.categorySelectorIds) { viewRelatedIds = viewRelatedIds.concat(usageInfo.categorySelectorIds.filter((id) => usedIdSet.has(id))); }
        if (usageInfo.modelSelectorIds) { viewRelatedIds = viewRelatedIds.concat(usageInfo.modelSelectorIds.filter((id) => usedIdSet.has(id))); }
        if (viewRelatedIds.length > 0) {
          const viewRelatedUsageInfo = this._iModel.nativeDb.queryDefinitionElementUsage(viewRelatedIds);
          if (viewRelatedUsageInfo) {
            const usedViewRelatedIdSet: Id64Set = viewRelatedUsageInfo.usedIds ? Id64.toIdSet(viewRelatedUsageInfo.usedIds) : new Set<Id64String>();
            try {
              this._iModel.nativeDb.beginPurgeOperation();
              deleteIfUnused(viewRelatedUsageInfo.displayStyleIds, usedViewRelatedIdSet);
              deleteIfUnused(viewRelatedUsageInfo.categorySelectorIds, usedViewRelatedIdSet);
              deleteIfUnused(viewRelatedUsageInfo.modelSelectorIds, usedViewRelatedIdSet);
            } finally {
              this._iModel.nativeDb.endPurgeOperation();
            }
            viewRelatedIds.forEach((id) => { if (!usedViewRelatedIdSet.has(id)) { usedIdSet.delete(id); } });
          }
        }
      }
      return usedIdSet;
    }

    /** Query for the child elements of the specified element.
     * @returns Returns an array of child element identifiers.
     * @throws [[IModelError]]
     */
    public queryChildren(elementId: Id64String): Id64String[] {
      const sql = "SELECT ECInstanceId FROM BisCore:Element WHERE Parent.Id=:elementId";
      return this._iModel.withPreparedStatement(sql, (statement: ECSqlStatement): Id64String[] => {
        statement.bindId("elementId", elementId);
        const childIds: Id64String[] = [];
        while (DbResult.BE_SQLITE_ROW === statement.step()) {
          childIds.push(statement.getValue(0).getId());
        }
        return childIds;
      });
    }

    /** Returns true if the specified Element has a sub-model.
     * @see [[IModelDb.Models.getSubModel]]
     */
    public hasSubModel(elementId: Id64String): boolean {
      if (IModel.rootSubjectId === elementId)
        return false; // Special case since the RepositoryModel does not sub-model the root Subject

      // A sub-model will have the same Id value as the element it is describing
      const sql = "SELECT ECInstanceId FROM BisCore:Model WHERE ECInstanceId=:elementId";
      return this._iModel.withPreparedStatement(sql, (statement: ECSqlStatement): boolean => {
        statement.bindId("elementId", elementId);
        return DbResult.BE_SQLITE_ROW === statement.step();
      });
    }

    /** Get the root subject element. */
    public getRootSubject(): Subject { return this.getElement(IModel.rootSubjectId); }

    /** Query for aspects of a particular class (polymorphically) associated with this element.
     * @throws [[IModelError]]
     * @note Most cases should use the [[getAspects]] wrapper rather than calling this method directly.
     * @internal
     */
    public _queryAspects(elementId: Id64String, fromClassFullName: string, excludedClassFullNames?: Set<string>): ElementAspect[] { // eslint-disable-line @typescript-eslint/naming-convention
      const sql = `SELECT ECInstanceId,ECClassId FROM ${fromClassFullName} WHERE Element.Id=:elementId ORDER BY ECClassId,ECInstanceId`; // ORDER BY to maximize statement reuse
      return this._iModel.withPreparedStatement(sql, (statement: ECSqlStatement): ElementAspect[] => {
        statement.bindId("elementId", elementId);
        const aspects: ElementAspect[] = [];
        while (DbResult.BE_SQLITE_ROW === statement.step()) {
          const aspectInstanceId: Id64String = statement.getValue(0).getId();
          const aspectClassFullName: string = statement.getValue(1).getClassNameForClassId().replace(".", ":");
          if ((undefined === excludedClassFullNames) || (!excludedClassFullNames.has(aspectClassFullName))) {
            aspects.push(this._queryAspect(aspectInstanceId, aspectClassFullName));
          }
        }
        return aspects;
      });
    }

    /** Query for aspect by ECInstanceId
     * @throws [[IModelError]]
     */
    private _queryAspect(aspectInstanceId: Id64String, aspectClassName: string): ElementAspect {
      const sql = `SELECT * FROM ${aspectClassName} WHERE ECInstanceId=:aspectInstanceId`;
      const aspect: ElementAspectProps | undefined = this._iModel.withPreparedStatement(sql, (statement: ECSqlStatement): ElementAspectProps | undefined => {
        statement.bindId("aspectInstanceId", aspectInstanceId);
        if (DbResult.BE_SQLITE_ROW === statement.step()) {
          const aspectProps: ElementAspectProps = statement.getRow(); // start with everything that SELECT * returned
          aspectProps.classFullName = (aspectProps as any).className.replace(".", ":"); // add in property required by EntityProps
          (aspectProps as any).className = undefined; // clear property from SELECT * that we don't want in the final instance
          return aspectProps;
        }
        return undefined;
      });
      if (undefined === aspect) {
        throw new IModelError(IModelStatus.NotFound, `ElementAspect not found ${aspectInstanceId}, ${aspectClassName}`);
      }
      return this._iModel.constructEntity<ElementAspect>(aspect);
    }

    /** Get a single ElementAspect by its instance Id.
     * @throws [[IModelError]]
     */
    public getAspect(aspectInstanceId: Id64String): ElementAspect {
      const sql = "SELECT ECClassId FROM BisCore:ElementAspect WHERE ECInstanceId=:aspectInstanceId";
      const aspectClassFullName = this._iModel.withPreparedStatement(sql, (statement: ECSqlStatement): string | undefined => {
        statement.bindId("aspectInstanceId", aspectInstanceId);
        return (DbResult.BE_SQLITE_ROW === statement.step()) ? statement.getValue(0).getClassNameForClassId().replace(".", ":") : undefined;
      });
      if (undefined === aspectClassFullName) {
        throw new IModelError(IModelStatus.NotFound, `ElementAspect not found ${aspectInstanceId}`);
      }
      return this._queryAspect(aspectInstanceId, aspectClassFullName);
    }

    /** Get the ElementAspect instances that are owned by the specified element.
     * @param elementId Get ElementAspects associated with this Element
     * @param aspectClassFullName Optionally filter ElementAspects polymorphically by this class name
     * @throws [[IModelError]]
     */
    public getAspects(elementId: Id64String, aspectClassFullName?: string): ElementAspect[] {
      if (undefined === aspectClassFullName) {
        const uniqueAspects: ElementAspect[] = this._queryAspects(elementId, ElementUniqueAspect.classFullName);
        const multiAspects: ElementAspect[] = this._queryAspects(elementId, ElementMultiAspect.classFullName);
        return uniqueAspects.concat(multiAspects);
      }
      const aspects: ElementAspect[] = this._queryAspects(elementId, aspectClassFullName);
      return aspects;
    }

    /** Insert a new ElementAspect into the iModel.
     * @param aspectProps The properties of the new ElementAspect.
     * @throws [[IModelError]] if unable to insert the ElementAspect.
     */
    public insertAspect(aspectProps: ElementAspectProps): void {
      try {
        this._iModel.nativeDb.insertElementAspect(aspectProps);
      } catch (err) {
        throw new IModelError(err.errorNumber, `Error inserting ElementAspect [${err.message}], class: ${aspectProps.classFullName}`);
      }
    }

    /** Update an exist ElementAspect within the iModel.
     * @param aspectProps The properties to use to update the ElementAspect.
     * @throws [[IModelError]] if unable to update the ElementAspect.
     */
    public updateAspect(aspectProps: ElementAspectProps): void {
      try {
        this._iModel.nativeDb.updateElementAspect(aspectProps);
      } catch (err) {
        throw new IModelError(err.errorNumber, `Error updating ElementAspect [${err.message}], id: ${aspectProps.id}`);
      }
    }

    /** Delete one or more ElementAspects from this iModel.
     * @param aspectInstanceIds The set of instance Ids of the ElementAspect(s) to be deleted
     * @throws [[IModelError]] if unable to delete the ElementAspect.
     */
    public deleteAspect(aspectInstanceIds: Id64Arg): void {
      const iModel = this._iModel;
      Id64.toIdSet(aspectInstanceIds).forEach((aspectInstanceId) => {
        try {
          iModel.nativeDb.deleteElementAspect(aspectInstanceId);
        } catch (err) {
          throw new IModelError(err.errorNumber, `Error deleting ElementAspect [${err.message}], id: ${aspectInstanceId}`);
        }
      });
    }
  }

  /** The collection of views in an [[IModelDb]].
   * @public
   */
  export class Views {
    /** @internal */
    public constructor(private _iModel: IModelDb) { }

    /** Query for the array of ViewDefinitionProps of the specified class and matching the specified IsPrivate setting.
     * @param className Query for view definitions of this class.
     * @param wantPrivate If true, include private view definitions.
     */
    public queryViewDefinitionProps(className: string = "BisCore.ViewDefinition", limit = IModelDb.defaultLimit, offset = 0, wantPrivate: boolean = false): ViewDefinitionProps[] {
      const where = (wantPrivate === false) ? "IsPrivate=FALSE" : "";
      const ids = this._iModel.queryEntityIds({ from: className, limit, offset, where });

      const props: ViewDefinitionProps[] = [];
      const imodel = this._iModel;
      ids.forEach((id) => {
        try {
          props.push(imodel.elements.getElementProps<ViewDefinitionProps>(id));
        } catch (err) { }
      });

      return props;
    }

    /** Default parameters for iterating/querying ViewDefinitions. Includes all subclasses of ViewDefinition, excluding only those marked 'private'. */
    public static readonly defaultQueryParams: ViewQueryParams = { from: "BisCore.ViewDefinition", where: "IsPrivate=FALSE" };

    /** Iterate all ViewDefinitions matching the supplied query.
     * @param params Specifies the query by which views are selected.
     * @param callback Function invoked for each ViewDefinition matching the query. Return false to terminate iteration, true to continue.
     * @returns true if all views were iterated, false if iteration was terminated early due to callback returning false.
     *
     * **Example: Finding all views of a specific DrawingModel**
     * ``` ts
     * [[include:IModelDb.Views.iterateViews]]
     * ```
     */
    public iterateViews(params: ViewQueryParams, callback: (view: ViewDefinition) => boolean): boolean {
      const ids = this._iModel.queryEntityIds(params);
      let finished = true;
      for (const id of ids) {
        try {
          const view = this._iModel.elements.getElement(id);
          if (undefined !== view && view instanceof ViewDefinition) {
            finished = callback(view);
            if (!finished)
              break;
          }
        } catch (err) { }
      }

      return finished;
    }

    public getViewStateData(viewDefinitionId: string, options?: ViewStateLoadProps): ViewStateProps {
      const elements = this._iModel.elements;
      const viewDefinitionElement = elements.getElement<ViewDefinition>(viewDefinitionId);
      const viewDefinitionProps = viewDefinitionElement.toJSON();
      const categorySelectorProps = elements.getElementProps<CategorySelectorProps>(viewDefinitionProps.categorySelectorId);

      const displayStyleOptions: ElementLoadProps = {
        id: viewDefinitionProps.displayStyleId,
        displayStyle: options?.displayStyle,
      };
      const displayStyleProps = elements.getElementProps<DisplayStyleProps>(displayStyleOptions);

      const viewStateData: ViewStateProps = { viewDefinitionProps, displayStyleProps, categorySelectorProps };

      const modelSelectorId = (viewDefinitionProps as SpatialViewDefinitionProps).modelSelectorId;
      if (modelSelectorId !== undefined) {
        viewStateData.modelSelectorProps = elements.getElementProps<ModelSelectorProps>(modelSelectorId);
      } else if (viewDefinitionElement instanceof SheetViewDefinition) {
        viewStateData.sheetProps = elements.getElementProps<SheetProps>(viewDefinitionElement.baseModelId);
        viewStateData.sheetAttachments = Array.from(this._iModel.queryEntityIds({
          from: "BisCore.ViewAttachment",
          where: `Model.Id=${viewDefinitionElement.baseModelId}`,
        }));
      } else if (viewDefinitionElement instanceof DrawingViewDefinition) {
        // Ensure view has known extents
        try {
          const rangeVal = this._iModel.nativeDb.queryModelExtents(JSON.stringify({ id: viewDefinitionElement.baseModelId }));
          if (rangeVal.result)
            viewStateData.modelExtents = Range3d.fromJSON(JSON.parse(rangeVal.result).modelExtents);
        } catch (_) {
          //
        }

        // Include information about the associated [[SectionDrawing]], if any.
        // NB: The SectionDrawing ECClass may not exist in the iModel's version of the BisCore ECSchema.
        try {
          const sectionDrawing = this._iModel.elements.tryGetElement<SectionDrawing>(viewDefinitionElement.baseModelId);
          if (sectionDrawing && sectionDrawing.spatialView && Id64.isValidId64(sectionDrawing.spatialView.id)) {
            viewStateData.sectionDrawing = {
              spatialView: sectionDrawing.spatialView.id,
              displaySpatialView: true === sectionDrawing.jsonProperties.displaySpatialView,
              drawingToSpatialTransform: sectionDrawing.jsonProperties.drawingToSpatialTransform,
            };
          }
        } catch (_) {
          //
        }
      }

      return viewStateData;
    }

    private getViewThumbnailArg(viewDefinitionId: Id64String): FilePropertyProps {
      return { namespace: "dgn_View", name: "Thumbnail", id: viewDefinitionId };
    }

    /** Get the thumbnail for a view.
     * @param viewDefinitionId The Id of the view for thumbnail
     * @returns the ThumbnailProps, or undefined if no thumbnail exists.
     */
    public getThumbnail(viewDefinitionId: Id64String): ThumbnailProps | undefined {
      const viewArg = this.getViewThumbnailArg(viewDefinitionId);
      const sizeProps = this._iModel.nativeDb.queryFileProperty(viewArg, true) as string;
      if (undefined === sizeProps)
        return undefined;

      const out = JSON.parse(sizeProps) as ThumbnailProps;
      out.image = this._iModel.nativeDb.queryFileProperty(viewArg, false) as Uint8Array;
      return out;
    }

    /** Save a thumbnail for a view.
     * @param viewDefinitionId The Id of the view for thumbnail
     * @param thumbnail The thumbnail data.
     * @returns 0 if successful
     */
    public saveThumbnail(viewDefinitionId: Id64String, thumbnail: ThumbnailProps): number {
      const viewArg = this.getViewThumbnailArg(viewDefinitionId);
      const props = { format: thumbnail.format, height: thumbnail.height, width: thumbnail.width };
      this._iModel.nativeDb.saveFileProperty(viewArg, JSON.stringify(props), thumbnail.image);
      return 0;
    }

    /** Set the default view property the iModel
     * @param viewId The Id of the ViewDefinition to use as the default
     */
    public setDefaultViewId(viewId: Id64String): void {
      const spec = { namespace: "dgn_View", name: "DefaultView" };
      const blob32 = new Uint32Array(2);
      blob32[0] = Id64.getLowerUint32(viewId);
      blob32[1] = Id64.getUpperUint32(viewId);
      const blob8 = new Uint8Array(blob32.buffer);
      this._iModel.saveFileProperty(spec, undefined, blob8);
    }
  }

  /** Represents the current state of a pollable tile content request.
   * Note: lack of a "completed" state because polling a completed request returns the content as a Uint8Array.
   * @internal
   */
  export enum TileContentState {
    New, // Request was just created and enqueued.
    Pending, // Request is enqueued but not yet being processed.
    Loading, // Request is being actively processed.
  }

  /** @internal */
  export class Tiles {
    /** @internal */
    public constructor(private _iModel: IModelDb) { }

    /** @internal */
    public async requestTileTreeProps(requestContext: ClientRequestContext, id: string): Promise<IModelTileTreeProps> {
      requestContext.enter();

      return new Promise<IModelTileTreeProps>((resolve, reject) => {
        requestContext.enter();
        this._iModel.nativeDb.getTileTree(id, (ret: IModelJsNative.ErrorStatusOrResult<IModelStatus, any>) => {
          if (undefined !== ret.error)
            reject(new IModelError(ret.error.status, `TreeId=${id}`));
          else
            resolve(ret.result as IModelTileTreeProps);
        });
      });
    }

    private pollTileContent(resolve: (arg0: IModelJsNative.TileContent) => void, reject: (err: Error) => void, treeId: string, tileId: string, requestContext: ClientRequestContext) {
      requestContext.enter();

      let ret;
      try {
        ret = this._iModel.nativeDb.pollTileContent(treeId, tileId);
      } catch (err) {
        // Typically "imodel not open".
        reject(err);
        return;
      }

      if (undefined !== ret.error) {
        reject(new IModelError(ret.error.status, `TreeId=${treeId} TileId=${tileId}`));
      } else if (typeof ret.result !== "number") { // if type is not a number, it's the TileContent interface
        const res = ret.result as IModelJsNative.TileContent;
        const iModelId = this._iModel.iModelId;

        const tileSizeThreshold = IModelHost.logTileSizeThreshold;
        const tileSize = res.content.length;
        if (tileSize > tileSizeThreshold) {
          Logger.logWarning(loggerCategory, "Tile size (in bytes) larger than specified threshold", () => ({ tileSize, tileSizeThreshold, treeId, tileId, iModelId }));
        }

        const loadTimeThreshold = IModelHost.logTileLoadTimeThreshold;
        const loadTime = res.elapsedSeconds;
        if (loadTime > loadTimeThreshold) {
          Logger.logWarning(loggerCategory, "Tile load time (in seconds) greater than specified threshold", () => ({ loadTime, loadTimeThreshold, treeId, tileId, iModelId }));
        }

        resolve(res);
      } else { // if the type is a number, it's the TileContentState enum
        // ###TODO: Decide appropriate timeout interval. May want to switch on state (new vs loading vs pending)
        setTimeout(() => this.pollTileContent(resolve, reject, treeId, tileId, requestContext), 10);
      }
    }

    /** @internal */
    public async requestTileContent(requestContext: ClientRequestContext, treeId: string, tileId: string): Promise<IModelJsNative.TileContent> {
      requestContext.enter();

      return new Promise<IModelJsNative.TileContent>((resolve, reject) => {
        this.pollTileContent(resolve, reject, treeId, tileId, requestContext);
      });
    }
  }
}

/** A local copy of an iModel from iModelHub that can pull and potentially push changesets.
 * BriefcaseDb raises a set of events to allow apps and subsystems to track its object life cycle, including [[onOpen]] and [[onOpened]].
 * @public
 */
export class BriefcaseDb extends IModelDb {
  /** Manages local changes to this briefcase. */
  public readonly txns = new TxnManager(this);

  /** override superclass method */
  public get isBriefcase(): boolean { return true; }

  /* the BriefcaseId of the briefcase opened with this BriefcaseDb */
  public readonly briefcaseId: number;

  /** Returns `true` if this is briefcaseDb is opened writable and can be used to make changesets */
  public get allowLocalChanges(): boolean { return this.openMode === OpenMode.ReadWrite && this.briefcaseId !== 0; }

  /** Event raised just before a BriefcaseDb is opened.
   *  * If the open requires authorization [AuthorizedClientRequestContext]($itwin-client) is passed in to the event handler. Otherwise [[ClientRequestContext]] is passed in
   * **Example:**
   * ``` ts
   * [[include:BriefcaseDb.onOpen]]
   * ```
   */
  public static readonly onOpen = new BeEvent<(_requestContext: ClientRequestContext, _props: IModelRpcProps) => void>();

  /** Event raised just after a BriefcaseDb is opened.
   * **Example:**
   * ``` ts
   * [[include:BriefcaseDb.onOpened]]
   * ```
   */
  public static readonly onOpened = new BeEvent<(_requestContext: ClientRequestContext, _imodelDb: BriefcaseDb) => void>();

  public static findByKey(key: string): BriefcaseDb {
    return super.findByKey(key) as BriefcaseDb;
  }

  public static tryFindByKey(key: string): BriefcaseDb | undefined {
    const db = super.tryFindByKey(key);
    return db?.isBriefcaseDb() ? db : undefined;
  }

  public abandonChanges(): void {
    if (this.allowLocalChanges)
      this.concurrencyControl.abandonRequest();

    super.abandonChanges();
  }

  /** The Guid that identifies the *context* that owns this iModel. */
  public get contextId(): GuidString { return super.contextId!; } // GuidString | undefined for the superclass, but required for BriefcaseDb

  /** Id of the last ChangeSet that was applied to this iModel.
   * @note An empty string indicates the first version.
   */
  public get changeSetId(): string { return super.changeSetId!; } // string | undefined for the superclass, but required for BriefcaseDb
  public set changeSetId(csId: string) { this._changeSetId = csId; }

  /** Get the ConcurrencyControl for this iModel.
   * The concurrency control is used available *only* if the briefcase has been setup to synchronize changes with iModelHub (i.e., syncMode = SyncMode.PullAndPush),
   * and has been opened ReadWrite (i.e., openMode = OpenMode.ReadWrite)
   * @beta
   */
  public readonly concurrencyControl: ConcurrencyControl;

  private constructor(nativeDb: IModelJsNative.DgnDb, token: IModelRpcProps, openMode: OpenMode) {
    super(nativeDb, token, openMode);
    this.concurrencyControl = new ConcurrencyControl(this);
    this.concurrencyControl.setPolicy(new ConcurrencyControl.PessimisticPolicy());
    this.briefcaseId = this.nativeDb.getBriefcaseId();
  }

  /** Commit pending changes to this iModel.
   * @note If this IModelDb is a briefcase that is synchronized with iModelHub, then you must call [[ConcurrencyControl.request]] before attempting to save changes.
   * @param description Optional description of the changes
   * @throws [[IModelError]] if there is a problem saving changes or if there are pending, un-processed lock or code requests.
   */
  public saveChanges(description?: string): void {
    if (this.allowLocalChanges)
      this.concurrencyControl.onSaveChanges();

    super.saveChanges(description);
  }

  /**
   * Upgrades the profile or domain schemas and returns the new change set id
   */
  private static async upgradeProfileOrDomainSchemas(arg: { requestContext: AuthorizedClientRequestContext, briefcase: LocalBriefcaseProps & OpenBriefcaseProps, upgradeOptions: UpgradeOptions, description: string }): Promise<void> {
    const lockArg = { ...arg, ...arg.briefcase };
    const requestContext = arg.requestContext;
    // Lock schemas
    await IModelHost.hubAccess.acquireSchemaLock(lockArg);

    // Upgrade and validate
    try {
      // openDgnDb performs the upgrade
      const nativeDb = this.openDgnDb({ path: arg.briefcase.fileName, key: arg.briefcase.key }, OpenMode.ReadWrite, arg.upgradeOptions);

      try {
        if (!nativeDb.hasPendingTxns()) {
          await IModelHost.hubAccess.releaseAllLocks(lockArg);
          return; // No changes made due to the upgrade
        }
      } finally {
        nativeDb.closeIModel();
      }
    } catch (err) {
      await IModelHost.hubAccess.releaseAllLocks(lockArg);
      throw err;
    }

    // Push changes
    const briefcaseDb = await BriefcaseDb.open(requestContext, { ...arg.briefcase, readonly: false });
    try {
      // Sync the concurrencyControl cache so that it includes the schema lock we requested before the open
      await briefcaseDb.concurrencyControl.syncCache(requestContext);
      await briefcaseDb.pushChanges(requestContext, arg.description, ChangesType.Schema);
      arg.briefcase.changeSetId = briefcaseDb.changeSetId;
    } finally {
      briefcaseDb.close();
      requestContext.enter();
    }
  }

  /** Upgrades the schemas in the iModel based on the current version of the software. Follows a sequence of operations -
   * * Acquires a schema lock to prevent other users from making a concurrent upgrade
   * * Updates the local briefcase with the schema changes.
   * * Pushes the resulting change set(s) to the iModel Hub.
   * Note that the upgrade requires that the local briefcase be closed, and may result in one or two change sets depending on whether both
   * profile and domain schemas need to get upgraded. At the end of the call, the local database is left back in the closed state.
   * @param requestContext The context for authorization to push upgraded change sets
   * @param briefcaseProps Properties of the downloaded briefcase and any additional parameters needed to open the briefcase. @see [[BriefcaseManager.downloadBriefcase]]
   * @throws [[IModelError]] If there was a problem with upgrading schemas
   * @see [[BriefcaseDb.validateSchemas]]
   * @see ($docs/learning/backend/IModelDb.md#upgrading-schemas-in-an-imodel)
  */
  public static async upgradeSchemas(requestContext: AuthorizedClientRequestContext, briefcase: LocalBriefcaseProps & OpenBriefcaseProps): Promise<void> {
    // Note: For admins we do not care about translations and keep description consistent, but we do need to enhance this to
    // include more information on versions
    const upgradeArg = { requestContext, briefcase };
    await this.upgradeProfileOrDomainSchemas({ ...upgradeArg, upgradeOptions: { profile: ProfileOptions.Upgrade }, description: "Upgraded profile" });
    await this.upgradeProfileOrDomainSchemas({ ...upgradeArg, upgradeOptions: { domain: DomainOptions.Upgrade }, description: "Upgraded domain schemas" });
    requestContext.enter();
  }

  /** Open a briefcase file and return a new BriefcaseDb to interact with it.
   * @param requestContext The context for authorization to acquire locks
   * @param args parameters that specify the file name, and options for opening the briefcase file
   */
  public static async open(requestContext: ClientRequestContext, args: OpenBriefcaseProps): Promise<BriefcaseDb> {
    requestContext.enter();

    const file = { path: args.fileName, key: args.key };
    const openMode = args.readonly ? OpenMode.Readonly : OpenMode.ReadWrite;
    const nativeDb = this.openDgnDb(file, openMode);
    const token: IModelRpcProps = {
      key: file.key ?? Guid.createValue(),
      iModelId: nativeDb.getDbGuid(),
      contextId: nativeDb.queryProjectGuid(),
      changeSetId: nativeDb.getReversedChangeSetId() ?? nativeDb.getParentChangeSetId(),
      openMode,
    };

    this.onOpen.raiseEvent(requestContext, token);
    const briefcaseDb = new BriefcaseDb(nativeDb, token, openMode);

    if (briefcaseDb.allowLocalChanges) {
      if (!(requestContext instanceof AuthorizedClientRequestContext))
        throw new IModelError(BentleyStatus.ERROR, "local changes requires authorization");
      await briefcaseDb.concurrencyControl.onOpened(requestContext);
    }

    BriefcaseManager.logUsage(requestContext, token);
    this.onOpened.raiseEvent(requestContext, briefcaseDb);
    return briefcaseDb;
  }

  /** @internal */
  public beforeClose() {
    super.beforeClose();
    if (this.allowLocalChanges)
      this.concurrencyControl.onClose();
  }

  private closeAndReopen(openMode: OpenMode) {
    const fileName = this.pathName;
    this.nativeDb.closeIModel();
    this.nativeDb.openIModel(fileName, openMode);
  }

  /** Pull and Merge changes from iModelHub
   * @param requestContext Context used for authorization to pull change sets
   * @param version Version to pull and merge to.
   * @throws [[IModelError]] If the pull and merge fails.
   * @returns the new changeSetId of this BriefcaseDb after pulling
   */
  public async pullAndMergeChanges(requestContext: AuthorizedClientRequestContext, version: IModelVersion = IModelVersion.latest()): Promise<string> {
    if (this.allowLocalChanges)
      this.concurrencyControl.onMergeChanges();

    if (this.isReadonly) // we allow pulling changes into a briefcase that is readonly - close and reopen it writeable
      this.closeAndReopen(OpenMode.ReadWrite);
    try {
      await BriefcaseManager.pullAndMergeChanges(requestContext, this, version);
    } finally {
      if (this.isReadonly) // if the briefcase was opened readonly - close and reopen it readonly
        this.closeAndReopen(OpenMode.Readonly);
    }

    IpcHost.notifyTxns(this, "notifyPulledChanges", this.changeSetId);

    this.changeSetId = this.nativeDb.getParentChangeSetId();
    this.initializeIModelDb();
    return this.changeSetId;
  }

  /** Push changes to iModelHub. Locks are released and codes are marked as used as part of a successful push.
   * If there are no changes, then locks are released and reserved codes are released.
   * @param requestContext Context used for authorization to push change sets
   * @param description The changeset description
   * @throws [[IModelError]] If there are unsaved changes or the pull and merge fails.
   * @note This function is a no-op if there are no changes to push.
   */
  public async pushChanges(requestContext: AuthorizedClientRequestContext, description: string, changeType: ChangesType = ChangesType.Regular): Promise<void> {
    requestContext.enter();
    if (this.nativeDb.hasUnsavedChanges())
      throw new IModelError(ChangeSetStatus.HasUncommittedChanges, "Cannot push changeset with unsaved changes");
    if (!this.allowLocalChanges)
      throw new IModelError(BentleyStatus.ERROR, "Briefcase must be obtained with SyncMode.PullAndPush and opened ReadWrite");
    if (!this.nativeDb.hasPendingTxns()) {
      await this.concurrencyControl.onPushEmpty(requestContext);
      return; // nothing to push
    }

    await this.concurrencyControl.onPushChanges(requestContext);

    await BriefcaseManager.pushChanges(requestContext, this, description, changeType);
    requestContext.enter();
    this.changeSetId = this.nativeDb.getParentChangeSetId();
    this.initializeIModelDb();

    IpcHost.notifyTxns(this, "notifyPushedChanges", this.changeSetId);
    return this.concurrencyControl.onPushedChanges(requestContext);
  }

  /** Reverse a previously applied set of changes
   * @param requestContext Context used for authorization to pull change sets
   * @param version Version to reverse changes to.
   * @throws [[IModelError]] If the reversal fails.
   * @deprecated reversing previously applied changes is not supported
   */
  public async reverseChanges(requestContext: AuthorizedClientRequestContext, version: IModelVersion = IModelVersion.latest()): Promise<void> {
    requestContext.enter();
    await BriefcaseManager.reverseChanges(requestContext, this, version);// eslint-disable-line deprecation/deprecation
    requestContext.enter();
    this.initializeIModelDb();
  }

  /** Reinstate a previously reversed set of changes
   * @param requestContext The client request context.
   * @param version Version to reinstate changes to.
   * @throws [[IModelError]] If the reinstate fails.
   * @deprecated reversing previously applied changes is not supported
   */
  public async reinstateChanges(requestContext: AuthorizedClientRequestContext, version: IModelVersion = IModelVersion.latest()): Promise<void> {
    requestContext.enter();
    await BriefcaseManager.reinstateChanges(requestContext, this, version);// eslint-disable-line deprecation/deprecation
    requestContext.enter();
    this.initializeIModelDb();
  }
}

/** A *snapshot* iModel database file that is used for archival and data transfer purposes.
 * @see [Snapshot iModels]($docs/learning/backend/AccessingIModels.md#snapshot-imodels)
 * @see [About IModelDb]($docs/learning/backend/IModelDb.md)
 * @public
 */
export class SnapshotDb extends IModelDb {
  public get isSnapshot(): boolean { return true; }
  private _createClassViewsOnClose?: boolean;
  /** The full path to the snapshot iModel file.
   * @deprecated use pathName
  */
  public get filePath(): string { return this.pathName; }

  private constructor(nativeDb: IModelJsNative.DgnDb, key: string) {
    const openMode = nativeDb.isReadonly() ? OpenMode.Readonly : OpenMode.ReadWrite;
    const iModelRpcProps: IModelRpcProps = { key, iModelId: nativeDb.getDbGuid(), changeSetId: nativeDb.getParentChangeSetId(), openMode };
    super(nativeDb, iModelRpcProps, openMode);
  }

  public static findByKey(key: string): SnapshotDb {
    return super.findByKey(key) as SnapshotDb;
  }

  public static tryFindByKey(key: string): SnapshotDb | undefined {
    const db = super.tryFindByKey(key);
    return db?.isSnapshotDb() ? db : undefined;
  }

  /** Create an *empty* local [Snapshot]($docs/learning/backend/AccessingIModels.md#snapshot-imodels) iModel file.
   * Snapshots are not synchronized with iModelHub, so do not have a change timeline.
   * > Note: A *snapshot* cannot be modified after [[close]] is called.
   * @param filePath The file that will contain the new iModel *snapshot*
   * @param options The parameters that define the new iModel *snapshot*
   * @returns A writeable SnapshotDb
   * @see [Snapshot iModels]($docs/learning/backend/AccessingIModels.md#snapshot-imodels)
   */
  public static createEmpty(filePath: string, options: CreateEmptySnapshotIModelProps): SnapshotDb {
    const nativeDb = new IModelHost.platform.DgnDb();
    nativeDb.createIModel(filePath, options);
    nativeDb.resetBriefcaseId(BriefcaseIdValue.Unassigned);

    const snapshotDb = new SnapshotDb(nativeDb, Guid.createValue());
    if (options.createClassViews)
      snapshotDb._createClassViewsOnClose = true; // save flag that will be checked when close() is called
    return snapshotDb;
  }

  /** Create a local [Snapshot]($docs/learning/backend/AccessingIModels.md#snapshot-imodels) iModel file, using this iModel as a *seed* or starting point.
   * Snapshots are not synchronized with iModelHub, so do not have a change timeline.
   * > Note: A *snapshot* cannot be modified after [[close]] is called.
   * @param iModelDb The snapshot will be initialized from the current contents of this iModelDb
   * @param snapshotFile The file that will contain the new iModel *snapshot*
   * @param options Optional properties that determine how the snapshot iModel is created.
   * @returns A writeable SnapshotDb
   * @see [Snapshot iModels]($docs/learning/backend/AccessingIModels.md#snapshot-imodels)
   */
  public static createFrom(iModelDb: IModelDb, snapshotFile: string, options?: CreateSnapshotIModelProps): SnapshotDb {
    if (iModelDb.nativeDb.isEncrypted())
      throw new IModelError(DbResult.BE_SQLITE_MISUSE, "Cannot create a snapshot from an encrypted iModel");

    IModelJsFs.copySync(iModelDb.pathName, snapshotFile);
    IModelHost.platform.DgnDb.vacuum(snapshotFile);

    if (options?.password)
      IModelHost.platform.DgnDb.encryptDb(snapshotFile, options);

    const nativeDb = new IModelHost.platform.DgnDb();
    nativeDb.openIModel(snapshotFile, OpenMode.ReadWrite, undefined, options);

    // Replace iModelId if seedFile is a snapshot, preserve iModelId if seedFile is an iModelHub-managed briefcase
    if (!BriefcaseManager.isValidBriefcaseId(nativeDb.getBriefcaseId()))
      nativeDb.setDbGuid(Guid.createValue());

    nativeDb.deleteLocalValue(IModelDb._edit);
    nativeDb.saveChanges();
    nativeDb.deleteAllTxns();
    nativeDb.resetBriefcaseId(BriefcaseIdValue.Unassigned);
    nativeDb.saveChanges();
    const snapshotDb = new SnapshotDb(nativeDb, Guid.createValue());
    if (options?.createClassViews)
      snapshotDb._createClassViewsOnClose = true; // save flag that will be checked when close() is called

    return snapshotDb;
  }

  /** open this SnapshotDb read/write, strictly to apply incoming changesets. Used for creating new checkpoints.
   * @internal
   */
  public static openForApplyChangesets(path: string, props?: SnapshotOpenOptions): SnapshotDb {
    const file = { path, key: props?.key };
    const nativeDb = this.openDgnDb(file, OpenMode.ReadWrite, undefined, props);
    return new SnapshotDb(nativeDb, file.key!);
  }

  /** Open a read-only iModel *snapshot*.
   * @param path the full path of the snapshot iModel file to open.
   * @param props options for opening snapshot
   * @see [[close]]
   * @throws [[IModelError]] If the file is not found or is not a valid *snapshot*.
   */
  public static openFile(path: string, opts?: SnapshotOpenOptions): SnapshotDb {
    const file = { path, key: opts?.key };
    const nativeDb = this.openDgnDb(file, OpenMode.Readonly, undefined, opts);
    return new SnapshotDb(nativeDb, file.key!);
  }

  /** Open a previously downloaded V1 checkpoint file.
   * @note The key is generated by this call is predictable and is formed from the IModelId and ChangeSetId.
   * This is so every backend working on the same checkpoint will use the same key, to permit multiple backends
   * servicing the same checkpoint.
   * @internal
   */
  public static openCheckpointV1(fileName: string, checkpoint: CheckpointProps) {
    const snapshot = this.openFile(fileName, { key: CheckpointManager.getKey(checkpoint) });
    snapshot._contextId = checkpoint.contextId;
    return snapshot;
  }

  /** Open a V2 *checkpoint*, a special form of snapshot iModel that represents a read-only snapshot of an iModel from iModelHub at a particular point in time.
   * > Note: The checkpoint daemon must already be running and a checkpoint must already exist in iModelHub's storage *before* this function is called.
   * @param checkpoint The checkpoint to open
   * @note The key is generated by this call is predictable and is formed from the IModelId and ChangeSetId.
   * This is so every backend working on the same checkpoint will use the same key, to permit multiple backends
   * servicing the same checkpoint.
   * @throws [[IModelError]] If the checkpoint is not found in iModelHub or the checkpoint daemon is not supported in the current environment.
   * @internal
   */
  public static async openCheckpointV2(checkpoint: CheckpointProps): Promise<SnapshotDb> {
    const filePath = await V2CheckpointManager.attach(checkpoint);
    const snapshot = SnapshotDb.openFile(filePath, { lazyBlockCache: true, key: CheckpointManager.getKey(checkpoint) });
    snapshot._contextId = checkpoint.contextId;
    try {
      CheckpointManager.validateCheckpointGuids(checkpoint, snapshot.nativeDb);
    } catch (err) {
      snapshot.close();
      throw err;
    }
    return snapshot;
  }

  /** Used to refresh the checkpoint daemon's access to this checkpoint's storage container.
   * @param requestContext The client request context.
   * @throws [[IModelError]] If the db is not a checkpoint.
   * @internal
   */
  public async reattachDaemon(requestContext: AuthorizedClientRequestContext): Promise<void> {
    if (!this._changeSetId)
      throw new IModelError(IModelStatus.WrongIModel, `SnapshotDb is not a checkpoint`);
    await V2CheckpointManager.attach({ requestContext, contextId: this.contextId!, iModelId: this.iModelId, changeSetId: this._changeSetId });
  }

  /** @internal */
  public beforeClose(): void {
    super.beforeClose();
    if (this._createClassViewsOnClose) { // check for flag set during create
      if (BentleyStatus.SUCCESS !== this.nativeDb.createClassViewsInDb()) {
        throw new IModelError(IModelStatus.SQLiteError, "Error creating class views");
      } else {
        this.saveChanges();
      }
    }
  }
}

/** Standalone iModels are read/write files that are not managed by iModelHub.
 * They are relevant only for small-scale single-user scenarios.
 * Standalone iModels are designed such that the API for Standalone iModels and Briefcase
 * iModels (those synchronized with iModelHub) are as similar and consistent as possible.
 * This leads to a straightforward process where the a user starts with StandaloneDb and can
 * optionally choose to upgrade to iModelHub.
 *
 * Some additional details. Standalone iModels:
 * - always have [Guid.empty]($bentley) for their contextId (they are "unassociated" files)
 * - always have BriefcaseId === [BriefcaseIdValue.Unassigned]($common)
 * - are connected to the frontend via [BriefcaseConnection.openStandalone]($frontend)
 * - may be opened without supplying any user credentials
 * - may be opened read/write
 * - may optionally support undo/redo via [[TxnManager]]
 * - cannot apply a changeset to nor generate a changesets (since there is no timeline from which to get/push changesets)
 * @public
 */
export class StandaloneDb extends IModelDb {
  public get isStandalone(): boolean { return true; }
  /** Manages local changes to this briefcase. */
  public readonly txns: TxnManager;
  /** The full path to the standalone iModel file.
   * @deprecated use pathName
   */
  public get filePath(): string { return this.pathName; }

  public static findByKey(key: string): StandaloneDb {
    return super.findByKey(key) as StandaloneDb;
  }

  public static tryFindByKey(key: string): StandaloneDb | undefined {
    const db = super.tryFindByKey(key);
    return db?.isStandaloneDb() ? db : undefined;
  }

  /** This property is always undefined as a StandaloneDb does not accept nor generate changesets. */
  public get changeSetId() { return undefined; } // string | undefined for the superclass, but always undefined for StandaloneDb

  private constructor(nativeDb: IModelJsNative.DgnDb, key: string) {
    const openMode = nativeDb.isReadonly() ? OpenMode.Readonly : OpenMode.ReadWrite;
    const iModelRpcProps: IModelRpcProps = { key, iModelId: nativeDb.getDbGuid(), openMode, contextId: Guid.empty };
    super(nativeDb, iModelRpcProps, openMode);
    this.txns = new TxnManager(this);
  }

  /** Create an *empty* standalone iModel.
   * @param filePath The file path for the iModel
   * @param args The parameters that define the new iModel
   */
  public static createEmpty(filePath: string, args: CreateEmptyStandaloneIModelProps): StandaloneDb {
    const nativeDb = new IModelHost.platform.DgnDb();
    nativeDb.createIModel(filePath, args);
    nativeDb.saveLocalValue(IModelDb._edit, undefined === args.allowEdit ? "" : args.allowEdit);
    nativeDb.saveProjectGuid(Guid.empty);
    nativeDb.resetBriefcaseId(BriefcaseIdValue.Unassigned);
    nativeDb.saveChanges();
    return new StandaloneDb(nativeDb, Guid.createValue());
  }

  /**
   * Upgrades the schemas in the standalone iModel file.
   * Note that the upgrade requires that the file be closed, and will leave it back in the closed state.
   * @param filePath Full path name of the standalone iModel file.
   * @see ($docs/learning/backend/IModelDb.md#upgrading-schemas-in-an-imodel)
   * @see [[StandaloneDb.validateSchemas]]
   */
  public static upgradeSchemas(filePath: string) {
    let nativeDb = this.openDgnDb({ path: filePath }, OpenMode.ReadWrite, { profile: ProfileOptions.Upgrade });
    assert(!nativeDb.hasUnsavedChanges(), "Expected schema upgrade to have saved any changes made");
    nativeDb.closeIModel();

    nativeDb = this.openDgnDb({ path: filePath }, OpenMode.ReadWrite, { domain: DomainOptions.Upgrade });
    assert(!nativeDb.hasUnsavedChanges(), "Expected schema upgrade to have saved any changes made");
    nativeDb.closeIModel();
  }

  /** Open a standalone iModel file.
   * @param filePath The path of the standalone iModel file.
   * @param openMode Optional open mode for the standalone iModel. The default is read/write.
   * @returns a new StandaloneDb if the file is not currently open, and the existing StandaloneDb if it is already
   * @throws [[IModelError]] if the file is not a standalone iModel.
   * @see [BriefcaseConnection.openStandalone]($frontend) to open a StandaloneDb from the frontend
   */
  public static openFile(filePath: string, openMode: OpenMode = OpenMode.ReadWrite, options?: StandaloneOpenOptions): StandaloneDb {
    const file = { path: filePath, key: options?.key };
    const nativeDb = this.openDgnDb(file, openMode);

    try {
      const projectId = nativeDb.queryProjectGuid();
      const briefcaseId = nativeDb.getBriefcaseId();
      if (projectId !== Guid.empty || !(briefcaseId === BriefcaseIdValue.Unassigned || briefcaseId === BriefcaseIdValue.DeprecatedStandalone))// eslint-disable-line deprecation/deprecation
        throw new IModelError(IModelStatus.WrongIModel, `${filePath} is not a Standalone db. projectId=${projectId}, briefcaseId=${briefcaseId}`);

      if (openMode === OpenMode.ReadWrite && (undefined === nativeDb.queryLocalValue(IModelDb._edit)))
        throw new IModelError(IModelStatus.ReadOnly, `${filePath} is not editable`);
    } catch (error) {
      nativeDb.closeIModel();
      throw error;
    }

    return new StandaloneDb(nativeDb, file.key!);
  }
}
