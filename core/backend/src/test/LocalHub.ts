/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { join } from "path";
import { DbResult, GuidString, Id64String, IModelHubStatus, IModelStatus, OpenMode } from "@bentley/bentleyjs-core";
import { BriefcaseIdValue, ChangesetFileProps, ChangesetId, ChangesetIndex, ChangesetIndexOrId, ChangesetProps, ChangesetRange, IModelError, LocalDirName, LocalFileName } from "@bentley/imodeljs-common";
import { LockProps, LockScope } from "../BackendHubAccess";
import { BriefcaseId, BriefcaseManager } from "../BriefcaseManager";
import { IModelDb } from "../IModelDb";
import { IModelJsFs } from "../IModelJsFs";
import { SQLiteDb } from "../SQLiteDb";

// cspell:ignore rowid

/** @internal */
export interface MockBriefcaseIdProps {
  id: number;
  user: string;
}

/** @internal */
export interface LocalHubProps {
  readonly contextId: GuidString;
  readonly iModelId: GuidString;
  readonly iModelName: string;
  readonly description?: string;
  readonly revision0: string;
}

export interface LockStatusNone {
  scope: LockScope.None;
  lastCsIndex?: ChangesetIndex;
}
export interface LockStatusExclusive {
  scope: LockScope.Exclusive;
  briefcaseId: BriefcaseId;
  lastCsIndex?: ChangesetIndex;
}

export interface LockStatusShared {
  scope: LockScope.Shared;
  sharedBy: Set<BriefcaseId>;
  lastCsIndex?: ChangesetIndex;
}

type LockStatus = LockStatusNone | LockStatusExclusive | LockStatusShared;

/**
 * A "local" mock for IModelHub to provide access to a single iModel. Used by HubMock.
 * @internal
 */
export class LocalHub {
  public readonly contextId: GuidString;
  public readonly iModelId: GuidString;
  public readonly iModelName: string;
  public readonly description?: string;
  private _hubDb?: SQLiteDb;
  private _nextBriefcaseId = BriefcaseIdValue.FirstValid;
  private _latestChangesetIndex = 0;
  public get latestChangesetIndex() { return this._latestChangesetIndex; }

  public constructor(public readonly rootDir: string, arg: LocalHubProps) {
    this.contextId = arg.contextId;
    this.iModelId = arg.iModelId;
    this.iModelName = arg.iModelName;
    this.description = arg.description;

    this.cleanup();

    IModelJsFs.recursiveMkDirSync(this.rootDir);
    IModelJsFs.mkdirSync(this.changesetDir);
    IModelJsFs.mkdirSync(this.checkpointDir);

    const db = this._hubDb = new SQLiteDb();
    db.createDb(this.mockDbName);
    db.executeSQL("CREATE TABLE briefcases(id INTEGER PRIMARY KEY NOT NULL,user TEXT NOT NULL)");
    db.executeSQL("CREATE TABLE timeline(csIndex INTEGER PRIMARY KEY NOT NULL,csId TEXT NOT NULL UNIQUE,description TEXT,user TEXT,size BIGINT,type INTEGER,pushDate TEXT,briefcaseId INTEGER)");
    db.executeSQL("CREATE TABLE checkpoints(csIndex INTEGER PRIMARY KEY NOT NULL)");
    db.executeSQL("CREATE TABLE versions(name TEXT PRIMARY KEY NOT NULL,csIndex TEXT,FOREIGN KEY(csIndex) REFERENCES timeline(csIndex))");
    db.executeSQL("CREATE TABLE locks(entityId INTEGER PRIMARY KEY NOT NULL,level INTEGER NOT NULL,lastCSetIndex INTEGER,briefcaseId INTEGER,FOREIGN KEY(lastCSetIndex) REFERENCES timeline(csIndex))");
    db.executeSQL("CREATE TABLE sharedLocks(lockId TEXT NOT NULL,briefcaseId INTEGER NOT NULL,PRIMARY KEY(lockId,briefcaseId))");
    db.executeSQL("CREATE INDEX LockIdx ON locks(briefcaseId)");
    db.executeSQL("CREATE INDEX SharedLockIdx ON sharedLocks(briefcaseId)");
    db.saveChanges();

    const path = this.uploadCheckpoint({ changesetIndex: 0, localFile: arg.revision0 });
    const nativeDb = IModelDb.openDgnDb({ path }, OpenMode.ReadWrite);
    try {
      nativeDb.saveProjectGuid(this.contextId);
      nativeDb.setDbGuid(this.iModelId);
      nativeDb.saveChanges();
      nativeDb.deleteAllTxns(); // necessary before resetting briefcaseId
      nativeDb.resetBriefcaseId(BriefcaseIdValue.Unassigned);
      nativeDb.saveChanges();
    } finally {
      nativeDb.closeIModel();
    }
  }

  private get db() { return this._hubDb!; } // eslint-disable-line @typescript-eslint/naming-convention
  public get changesetDir() { return join(this.rootDir, "changesets"); }
  public get checkpointDir() { return join(this.rootDir, "checkpoints"); }
  public get mockDbName() { return join(this.rootDir, "localHub.db"); }

  /** Acquire the next available briefcaseId and assign it to the supplied user */
  public acquireNewBriefcaseId(user: string): number {
    const db = this.db;
    const newId = this._nextBriefcaseId++;
    db.withSqliteStatement("INSERT INTO briefcases(id,user) VALUES (?,?)", (stmt) => {
      stmt.bindInteger(1, newId);
      stmt.bindString(2, user);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_DONE !== rc)
        throw new IModelError(rc, "can't update briefcaseId in mock database");
    });
    db.saveChanges();
    return newId;
  }

  /** Release a briefcaseId */
  public releaseBriefcaseId(id: number) {
    const db = this.db;
    db.withSqliteStatement("DELETE FROM briefcases WHERE id=?", (stmt) => {
      stmt.bindInteger(1, id);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_DONE !== rc)
        throw new IModelError(rc, `briefcaseId ${id} was not reserved`);
    });
    db.saveChanges();
  }

  /** Get an array of all of the currently assigned Briefcases */
  public getBriefcases(): MockBriefcaseIdProps[] {
    const briefcases: MockBriefcaseIdProps[] = [];
    this.db.withSqliteStatement("SELECT id,user FROM briefcases", (stmt) => {
      while (DbResult.BE_SQLITE_ROW === stmt.step()) {
        briefcases.push({
          id: stmt.getValueInteger(0),
          user: stmt.getValueString(1),
        });
      }
    });
    return briefcases;
  }

  /** Get an array of all of the currently assigned BriefcaseIds for a user */
  public getBriefcaseIds(user: string): number[] {
    const briefcases: number[] = [];
    this.db.withSqliteStatement("SELECT id FROM briefcases WHERE user=?", (stmt) => {
      stmt.bindString(1, user);
      while (DbResult.BE_SQLITE_ROW === stmt.step())
        briefcases.push(stmt.getValueInteger(0));
    });
    return briefcases;
  }

  private getChangesetFileName(index: number) {
    return join(this.changesetDir, `changeset-${index}`);
  }

  /** Add a changeset to the timeline
   * @return the changesetIndex of the added changeset
   */
  public addChangeset(changeset: ChangesetFileProps): ChangesetIndex {
    const stats = IModelJsFs.lstatSync(changeset.pathname);
    if (!stats)
      throw new Error(`cannot read changeset file ${changeset.pathname}`);

    const parentIndex = this.getChangesetById(changeset.parentId).index;
    if (parentIndex !== this.latestChangesetIndex)
      throw new IModelError(IModelStatus.InvalidParent, "changeset parent is not latest changeset");

    const db = this.db;
    changeset.index = this._latestChangesetIndex + 1;
    db.withSqliteStatement("INSERT INTO timeline(csIndex,csId,description,size,type,pushDate,user,briefcaseId) VALUES (?,?,?,?,?,?,?,?)", (stmt) => {
      stmt.bindInteger(1, changeset.index);
      stmt.bindString(2, changeset.id);
      stmt.bindString(3, changeset.description);
      stmt.bindInteger(4, stats.size);
      stmt.bindInteger(5, changeset.changesType ?? 0);
      stmt.bindString(6, changeset.pushDate ?? new Date().toString());
      stmt.bindString(7, changeset.userCreated ?? "");
      stmt.bindInteger(8, changeset.briefcaseId);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_DONE !== rc)
        throw new IModelError(rc, "can't insert changeset into mock db");
    });
    this._latestChangesetIndex = changeset.index; // only change this after insert succeeds
    db.saveChanges();
    IModelJsFs.copySync(changeset.pathname, this.getChangesetFileName(changeset.index));
    return changeset.index;
  }

  /** Get the index of a changeset by its Id */
  public getChangesetIndex(id: ChangesetId): number {
    if (id === "")
      return 0;

    return this.db.withPreparedSqliteStatement("SELECT csIndex FROM timeline WHERE csId=?", (stmt) => {
      stmt.bindString(1, id);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_ROW !== rc)
        throw new IModelError(rc, `changeset ${id} not found`);

      return stmt.getValueInteger(0);
    });
  }

  /** Get the properties of a changeset by its Id */
  public getChangesetById(id: ChangesetId): ChangesetProps {
    return this.getChangesetByIndex(this.getChangesetIndex(id));
  }

  public getPreviousIndex(index: ChangesetIndex) {
    return this.db.withPreparedSqliteStatement("SELECT max(csIndex) FROM timeline WHERE csIndex<?", (stmt) => {
      stmt.bindInteger(1, index);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_ROW !== rc)
        throw new IModelError(rc, `cannot get previous index`);

      return stmt.getValueInteger(0);
    });
  }

  public getParentId(index: ChangesetIndex): ChangesetId {
    if (index === 0)
      return "";

    return this.db.withPreparedSqliteStatement("SELECT csId FROM timeline WHERE csIndex=?", (stmt) => {
      stmt.bindInteger(1, this.getPreviousIndex(index));
      stmt.step();
      return stmt.getValueString(0);
    });
  }

  /** Get the properties of a changeset by its index */
  public getChangesetByIndex(index: number): ChangesetProps {
    if (index <= 0)
      return { id: "", changesType: 0, description: "revision0", parentId: "", briefcaseId: 0, pushDate: "", userCreated: "", index: 0 };

    return this.db.withPreparedSqliteStatement("SELECT description,size,type,pushDate,user,csId,briefcaseId FROM timeline WHERE csIndex=?", (stmt) => {
      stmt.bindInteger(1, index);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_ROW !== rc)
        throw new IModelError(rc, `changeset at index ${index} not found`);

      return {
        description: stmt.getValueString(0),
        size: stmt.getValueDouble(1),
        changesType: stmt.getValueInteger(2),
        pushDate: stmt.getValueString(3),
        userCreated: stmt.getValueString(4),
        id: stmt.getValueString(5),
        briefcaseId: stmt.getValueInteger(6),
        index,
        parentId: this.getParentId(index),
      };
    });
  }

  public getLatestChangeset(): ChangesetProps {
    return this.getChangesetByIndex(this.latestChangesetIndex);
  }

  public getChangesetId(index: ChangesetIndex): ChangesetId {
    return this.getChangesetByIndex(index).id;
  }

  /** Get an array of changesets starting with first to last, by index */
  public queryChangesets(range?: ChangesetRange): ChangesetProps[] {
    const changesets: ChangesetProps[] = [];
    const first = range?.first ?? 0;
    const last = range?.end ?? this.latestChangesetIndex;

    this.db.withPreparedSqliteStatement("SELECT csIndex FROM timeline WHERE csIndex>=? AND csIndex<=? ORDER BY csIndex", (stmt) => {
      stmt.bindInteger(1, first);
      stmt.bindInteger(2, last);
      while (DbResult.BE_SQLITE_ROW === stmt.step())
        changesets.push(this.getChangesetByIndex(stmt.getValueInteger(0)));
    });
    return changesets;
  }

  /** Name a version */
  public addNamedVersion(arg: { versionName: string, csIndex: ChangesetIndex }) {
    const db = this.db;
    db.withSqliteStatement("INSERT INTO versions(name,csIndex) VALUES (?,?)", (stmt) => {
      stmt.bindString(1, arg.versionName);
      stmt.bindInteger(2, arg.csIndex);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_DONE !== rc)
        throw new IModelError(rc, "can't insert named version");
    });
    db.saveChanges();
  }

  /** Delete a named version */
  public deleteNamedVersion(versionName: string) {
    const db = this.db;
    db.withSqliteStatement("DELETE FROM versions WHERE name=?", (stmt) => {
      stmt.bindString(1, versionName);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_DONE !== rc)
        throw new IModelError(rc, "can't delete named version");
    });
    db.saveChanges();
  }

  /** find the changeset for a named version */
  public findNamedVersion(versionName: string): ChangesetProps {
    const index = this.db.withSqliteStatement("SELECT csIndex FROM versions WHERE name=?", (stmt) => {
      stmt.bindString(1, versionName);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_ROW !== rc)
        throw new IModelError(IModelStatus.NotFound, `Named version ${versionName} not found`);
      return stmt.getValueInteger(0);
    });
    return this.getChangesetByIndex(index);
  }

  public checkpointNameFromIndex(csIndex: ChangesetIndex) {
    return `checkpoint-${csIndex}`;
  }

  /** "upload" a checkpoint */
  public uploadCheckpoint(arg: { changesetIndex: ChangesetIndex, localFile: LocalFileName }) {
    const db = this.db;
    db.withSqliteStatement("INSERT INTO checkpoints(csIndex) VALUES (?)", (stmt) => {
      stmt.bindInteger(1, arg.changesetIndex);
      const res = stmt.step();
      if (DbResult.BE_SQLITE_DONE !== res)
        throw new IModelError(res, "can't insert checkpoint into mock db");
    });
    db.saveChanges();
    const outName = join(this.checkpointDir, this.checkpointNameFromIndex(arg.changesetIndex));
    IModelJsFs.copySync(arg.localFile, outName);
    return outName;
  }

  /** Get an array of the indexes for a range of checkpoints */
  public getCheckpoints(range?: ChangesetRange): ChangesetIndex[] {
    const first = range?.first ?? 0;
    const last = range?.end ?? this.latestChangesetIndex;

    const checkpoints: ChangesetIndex[] = [];
    this.db.withSqliteStatement("SELECT csIndex FROM checkpoints WHERE csIndex>=? AND csIndex<=? ORDER BY csIndex", (stmt) => {
      stmt.bindInteger(1, first);
      stmt.bindInteger(2, last);
      while (DbResult.BE_SQLITE_ROW === stmt.step())
        checkpoints.push(stmt.getValueInteger(0));

    });
    return checkpoints;
  }

  /** Find the checkpoint that is no newer than a changesetIndex */
  public queryPreviousCheckpoint(changesetIndex: ChangesetIndex): ChangesetIndex {
    if (changesetIndex <= 0)
      return 0;

    return this.db.withSqliteStatement("SELECT max(csIndex) FROM checkpoints WHERE csIndex <= ? ", (stmt) => {
      stmt.bindInteger(1, changesetIndex);
      const res = stmt.step();
      if (DbResult.BE_SQLITE_ROW !== res)
        throw new IModelError(res, "can't get previous checkpoint");
      return stmt.getValueInteger(0);
    });
  }

  /** "download" a checkpoint */
  public downloadCheckpoint(arg: { changeset: ChangesetIndexOrId, targetFile: LocalFileName }) {
    const index = arg.changeset.index ?? this.getChangesetIndex(arg.changeset.id);
    const prev = this.queryPreviousCheckpoint(index);
    IModelJsFs.copySync(join(this.checkpointDir, this.checkpointNameFromIndex(prev)), arg.targetFile);
    return this.getChangesetByIndex(prev).id;
  }

  private copyChangeset(arg: ChangesetFileProps): ChangesetFileProps {
    IModelJsFs.copySync(this.getChangesetFileName(arg.index), arg.pathname);
    return arg;
  }

  /** "download" a changeset */
  public downloadChangeset(arg: { index: ChangesetIndex, targetDir: LocalDirName }) {
    const cs = this.getChangesetByIndex(arg.index);
    const csProps = { ...cs, pathname: join(arg.targetDir, cs.id), index: arg.index };
    return this.copyChangeset(csProps);
  }

  /** "download" all the changesets in a given range */
  public downloadChangesets(arg: { range?: ChangesetRange, targetDir: LocalDirName }): ChangesetFileProps[] {
    const cSets = this.queryChangesets(arg.range) as ChangesetFileProps[];
    for (const cs of cSets) {
      cs.pathname = join(arg.targetDir, cs.id);
      this.copyChangeset(cs);
    }
    return cSets;
  }

  private querySharedLockHolders(elementId: Id64String) {
    return this.db.withPreparedSqliteStatement("SELECT briefcaseId FROM sharedLocks WHERE lockId=?", (stmt) => {
      stmt.bindId(1, elementId);
      const briefcases = new Set<BriefcaseId>();
      while (DbResult.BE_SQLITE_ROW === stmt.step())
        briefcases.add(stmt.getValueInteger(0));
      return briefcases;
    });
  }

  public queryAllLocks(briefcaseId: number) {
    const locks: LockProps[] = [];
    this.db.withPreparedSqliteStatement("SELECT entityId FROM locks WHERE briefcaseId=?", (stmt) => {
      stmt.bindInteger(1, briefcaseId);
      while (DbResult.BE_SQLITE_ROW === stmt.step())
        locks.push({ entityId: stmt.getValueString(0), scope: LockScope.Exclusive });
    });
    this.db.withPreparedSqliteStatement("SELECT lockId FROM sharedLocks WHERE briefcaseId=?", (stmt) => {
      stmt.bindInteger(1, briefcaseId);
      while (DbResult.BE_SQLITE_ROW === stmt.step())
        locks.push({ entityId: stmt.getValueString(0), scope: LockScope.Shared });
    });
    return locks;
  }

  public queryLockStatus(elementId: Id64String): LockStatus {
    return this.db.withPreparedSqliteStatement("SELECT lastCSetIndex,level,briefcaseId FROM locks WHERE entityId=?", (stmt) => {
      stmt.bindId(1, elementId);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_ROW !== rc)
        return { scope: LockScope.None };
      const lastCsVal = stmt.getValue(0);
      const state = {
        lastCsIndex: lastCsVal.isNull ? undefined : lastCsVal.getInteger(),
        scope: stmt.getValueInteger(1),
      };
      switch (state.scope) {
        case LockScope.None:
          return state;
        case LockScope.Exclusive:
          return { ...state, briefcaseId: stmt.getValueInteger(2) };
        case LockScope.Shared:
          return { ...state, sharedBy: this.querySharedLockHolders(elementId) };
        default:
          throw new Error("illegal lock state");
      }
    });
  }

  private reserveLock(currStatus: LockStatus, props: LockProps, briefcase: { changeSetId: ChangesetId, briefcaseId: BriefcaseId }) {
    if (props.scope === LockScope.Exclusive && currStatus.lastCsIndex && (currStatus.lastCsIndex > this.getChangesetIndex(briefcase.changeSetId)))
      throw new IModelError(IModelHubStatus.PullIsRequired, "Pull is required");

    const wantShared = props.scope === LockScope.Shared;
    if (wantShared && (currStatus.scope === LockScope.Exclusive))
      throw new Error("cannot acquire shared lock because an exclusive lock is already held");

    this.db.withPreparedSqliteStatement("INSERT INTO locks(entityId,level,briefcaseId) VALUES(?,?,?) ON CONFLICT(entityId) DO UPDATE SET briefcaseId=excluded.briefcaseId,level=excluded.level", (stmt) => {
      stmt.bindId(1, props.entityId);
      stmt.bindInteger(2, props.scope);
      stmt.bindValue(3, wantShared ? undefined : briefcase.briefcaseId);
      const rc = stmt.step();
      if (rc !== DbResult.BE_SQLITE_DONE)
        throw new Error("cannot insert lock");
    });

    if (wantShared) {
      this.db.withPreparedSqliteStatement("INSERT INTO sharedLocks(lockId,briefcaseId) VALUES(?,?)", (stmt) => {
        stmt.bindId(1, props.entityId);
        stmt.bindInteger(2, briefcase.briefcaseId);
        const rc = stmt.step();
        if (rc !== DbResult.BE_SQLITE_DONE)
          throw new Error("cannot insert shared lock");
      });
    }
    this.db.saveChanges();
  }

  private clearLock(id: Id64String) {
    this.db.withPreparedSqliteStatement("UPDATE locks SET level=0,briefcaseId=NULL WHERE entityId=?", (stmt) => {
      stmt.bindId(1, id);
      const rc = stmt.step();
      if (rc !== DbResult.BE_SQLITE_DONE)
        throw new Error("can't release lock");
    });
  }
  private updateLockChangeset(id: Id64String, index: ChangesetIndex) {
    if (index <= 0)
      return;

    this.db.withPreparedSqliteStatement("UPDATE locks SET lastCSetIndex=?1 WHERE entityId=?2", (stmt) => {
      stmt.bindInteger(1, index);
      stmt.bindId(2, id);
      const rc = stmt.step();
      if (rc !== DbResult.BE_SQLITE_DONE)
        throw new Error("can't update lock changeSetId");
    });
  }

  public requestLock(props: LockProps, briefcase: { changeSetId: ChangesetId, briefcaseId: BriefcaseId }) {
    if (props.scope === LockScope.None)
      throw new Error("cannot request lock for LockScope.None");

    const lockStatus = this.queryLockStatus(props.entityId);
    switch (lockStatus.scope) {
      case LockScope.None:
        return this.reserveLock(lockStatus, props, briefcase);

      case LockScope.Shared:
        if (props.scope !== LockScope.Shared)
          throw new Error("element is locked with shared access, cannot obtain exclusive lock");
        if (!lockStatus.sharedBy.has(briefcase.briefcaseId))
          this.reserveLock(lockStatus, props, briefcase);
        return;

      case LockScope.Exclusive:
        if (lockStatus.briefcaseId !== briefcase.briefcaseId)
          throw new IModelError(IModelHubStatus.LockOwnedByAnotherBriefcase, "lock is already owned by another user");
    }
  }

  public releaseLock(arg: { props: LockProps, csIndex: ChangesetIndex, briefcaseId: BriefcaseId }) {
    const lockId = arg.props.entityId;
    const lockStatus = this.queryLockStatus(lockId);
    switch (lockStatus.scope) {
      case LockScope.None:
        throw new IModelError(IModelHubStatus.LockDoesNotExist, "lock not held");

      case LockScope.Exclusive:
        if (lockStatus.briefcaseId !== arg.briefcaseId)
          throw new IModelError(IModelHubStatus.LockOwnedByAnotherBriefcase, "lock not held by this briefcase");
        this.updateLockChangeset(lockId, arg.csIndex);
        this.clearLock(lockId);
        break;

      case LockScope.Shared:
        if (!lockStatus.sharedBy.has(arg.briefcaseId))
          throw new IModelError(IModelHubStatus.LockDoesNotExist, "shared lock not held by this briefcase");

        this.db.withPreparedSqliteStatement("DELETE FROM sharedLocks WHERE lockId=? AND briefcaseId=?", (stmt) => {
          stmt.bindId(1, lockId);
          stmt.bindInteger(2, arg.briefcaseId);
          const rc = stmt.step();
          if (rc !== DbResult.BE_SQLITE_DONE)
            throw new Error("can't remove shared lock");
        });
        if (lockStatus.sharedBy.size === 1)
          this.clearLock(lockId);
    }
    this.db.saveChanges();
  }

  public removeDir(dirName: string) {
    if (IModelJsFs.existsSync(dirName)) {
      IModelJsFs.purgeDirSync(dirName);
      IModelJsFs.rmdirSync(dirName);
    }

  }
  public cleanup() {
    if (this._hubDb) {
      this._hubDb.closeDb();
      this._hubDb = undefined;
    }
    try {
      this.removeDir(BriefcaseManager.getIModelPath(this.iModelId));
      this.removeDir(this.rootDir);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`ERROR: test left an iModel open for [${this.iModelName}]. LocalMock cannot clean up - make sure you call imodel.close() in your test`);
    }
  }
}
