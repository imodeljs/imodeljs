/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { join } from "path";
import { DbResult, GuidString, Id64String, IModelHubStatus, IModelStatus, OpenMode } from "@bentley/bentleyjs-core";
import { LockLevel, LockType } from "@bentley/imodelhub-client";
import { BriefcaseIdValue, IModelError } from "@bentley/imodeljs-common";
import { ChangesetFileProps, ChangesetId, ChangesetProps, ChangesetRange, LocalDirName, LocalFileName, LockProps } from "../BackendHubAccess";
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
  level: LockLevel.None;
  released?: string;
  type?: LockType;
}
export interface LockStatusExclusive {
  level: LockLevel.Exclusive;
  briefcaseId: BriefcaseId;
  released?: string;
  type: LockType;
}

export interface LockStatusShared {
  level: LockLevel.Shared;
  sharedBy: Set<BriefcaseId>;
  released?: string;
  type: LockType;
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
    db.executeSQL("CREATE TABLE timeline(id TEXT PRIMARY KEY NOT NULL,parentId TEXT,description TEXT,user TEXT,size BIGINT,type INTEGER,pushDate TEXT,briefcaseId INTEGER,FOREIGN KEY(parentId) REFERENCES timeline(id))");
    db.executeSQL("CREATE TABLE checkpoints(csIndex INTEGER PRIMARY KEY NOT NULL)");
    db.executeSQL("CREATE TABLE versions(name TEXT PRIMARY KEY NOT NULL,id TEXT,FOREIGN KEY(id) REFERENCES timeline(id))");
    db.executeSQL("CREATE TABLE locks(id TEXT PRIMARY KEY NOT NULL,type INTEGER NOT NULL,level INTEGER NOT NULL,released TEXT,briefcaseId INTEGER,FOREIGN KEY(released) REFERENCES timeline(id))");
    db.executeSQL("CREATE TABLE sharedLocks(briefcaseId INTEGER NOT NULL,lockId TEXT NOT NULL,PRIMARY KEY(lockId,briefcaseId))");
    db.executeSQL("CREATE INDEX LockIdx ON locks(briefcaseId)");
    db.executeSQL("CREATE INDEX SharedLockIdx ON sharedLocks(briefcaseId)");
    db.saveChanges();

    const path = this.uploadCheckpoint({ changeSetId: "", localFile: arg.revision0 });
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
      stmt.bindValue(1, newId);
      stmt.bindValue(2, user);
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
      stmt.bindValue(1, id);
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
          id: stmt.getValue(0).getInteger(),
          user: stmt.getValue(1).getString(),
        });
      }
    });
    return briefcases;
  }

  /** Get an array of all of the currently assigned BriefcaseIds*/
  public getBriefcaseIds(user: string): number[] {
    const briefcases: number[] = [];
    this.db.withSqliteStatement("SELECT id FROM briefcases WHERE user=?", (stmt) => {
      stmt.bindValue(1, user);
      while (DbResult.BE_SQLITE_ROW === stmt.step())
        briefcases.push(stmt.getValue(0).getInteger());
    });
    return briefcases;
  }

  /** Add a changeset to the timeline */
  public addChangeset(changeset: ChangesetFileProps) {
    const stats = IModelJsFs.lstatSync(changeset.pathname);
    if (!stats)
      throw new Error(`cannot read changeset file ${changeset.pathname}`);

    const db = this.db;
    db.withSqliteStatement("INSERT INTO timeline(id,parentId,description,size,type,pushDate,user,briefcaseId) VALUES (?,?,?,?,?,?,?,?)", (stmt) => {
      stmt.bindValue(1, changeset.id);
      stmt.bindValue(2, changeset.parentId === "" ? undefined : changeset.parentId);
      stmt.bindValue(3, changeset.description);
      stmt.bindValue(4, stats.size);
      stmt.bindValue(5, changeset.changesType ?? 0);
      stmt.bindValue(6, changeset.pushDate ?? new Date().toString());
      stmt.bindValue(7, changeset.userCreated ?? "");
      stmt.bindValue(8, changeset.briefcaseId);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_DONE !== rc)
        throw new IModelError(rc, "can't insert changeset into mock db");
    });
    db.saveChanges();
    IModelJsFs.copySync(changeset.pathname, join(this.changesetDir, changeset.id));
  }

  /** Get the index of a changeset by its Id */
  public getChangesetIndex(id: ChangesetId): number {
    if (id === "")
      return 0;

    return this.db.withPreparedSqliteStatement("SELECT rowid FROM timeline WHERE Id=?", (stmt) => {
      stmt.bindValue(1, id);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_ROW !== rc)
        throw new IModelError(rc, `changeset ${id} not found`);

      return stmt.getValue(0).getInteger();
    });
  }

  /** Get the properties of a changeset by its Id */
  public getChangesetById(id: ChangesetId): ChangesetProps {
    return this.getChangesetByIndex(this.getChangesetIndex(id));
  }

  /** Get the properties of a changeset by its index */
  public getChangesetByIndex(index: number): ChangesetProps {
    if (index === 0)
      return { id: "", changesType: 0, description: "revision0", parentId: "", briefcaseId: 0, pushDate: "", userCreated: "" };

    return this.db.withPreparedSqliteStatement("SELECT parentId,description,size,type,pushDate,user,id,briefcaseId FROM timeline WHERE rowid=?", (stmt) => {
      stmt.bindValue(1, index);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_ROW !== rc)
        throw new IModelError(rc, `changeset at index ${index} not found`);

      return {
        parentId: stmt.getValue(0).isNull ? "" : stmt.getValue(0).getString(),
        description: stmt.getValue(1).getString(),
        size: stmt.getValue(2).getDouble(),
        changesType: stmt.getValue(3).getInteger(),
        pushDate: stmt.getValue(4).getString(),
        userCreated: stmt.getValue(5).getString(),
        id: stmt.getValue(6).getString(),
        briefcaseId: stmt.getValue(7).getInteger(),
        index,
      };
    });
  }

  /** Get an array of changesets starting with first to last, by index */
  public getChangesets(first?: number, last?: number): ChangesetProps[] {
    const changesets: ChangesetProps[] = [];
    if (undefined === first)
      first = 1;
    if (undefined === last)
      last = this.getLatestChangesetIndex();
    if (0 === first) {
      changesets.push(this.getChangesetByIndex(0));
      ++first;
    }

    this.db.withPreparedSqliteStatement("SELECT rowid FROM timeline WHERE rowid>=? AND rowid<=? ORDER BY rowid", (stmt) => {
      stmt.bindValue(1, first);
      stmt.bindValue(2, last);
      while (DbResult.BE_SQLITE_ROW === stmt.step())
        changesets.push(this.getChangesetByIndex(stmt.getValue(0).getInteger()));
    });
    return changesets;
  }

  /** Get the index of the latest changeset. 0=no changesets have been added. */
  public getLatestChangesetIndex(): number {
    return this.db.withSqliteStatement("SELECT max(rowid) FROM timeline", (stmt) => {
      stmt.step();
      return stmt.getValue(0).getInteger();
    });
  }

  /** Get the ChangesetId of the latest changeset */
  public getLatestChangesetId(): ChangesetId {
    return this.getChangesetByIndex(this.getLatestChangesetIndex()).id;
  }

  /** Name a version */
  public addNamedVersion(arg: { versionName: string, id: ChangesetId }) {
    const db = this.db;
    db.withSqliteStatement("INSERT INTO versions(name,id) VALUES (?,?)", (stmt) => {
      stmt.bindValue(1, arg.versionName);
      stmt.bindValue(2, arg.id);
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
      stmt.bindValue(1, versionName);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_DONE !== rc)
        throw new IModelError(rc, "can't delete named version");
    });
    db.saveChanges();
  }

  /** find the ChangesetId of a named version */
  public findNamedVersion(versionName: string): ChangesetId {
    return this.db.withSqliteStatement("SELECT id FROM versions WHERE name=?", (stmt) => {
      stmt.bindValue(1, versionName);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_ROW !== rc)
        throw new IModelError(IModelStatus.NotFound, `Named version ${versionName} not found`);
      return stmt.getValue(0).getString();
    });
  }

  public checkpointNameFromId(changeSetId: ChangesetId) {
    return changeSetId === "" ? "0" : changeSetId;
  }

  /** "upload" a checkpoint */
  public uploadCheckpoint(arg: { changeSetId: ChangesetId, localFile: LocalFileName }) {
    const index = (arg.changeSetId !== "") ? this.getChangesetIndex(arg.changeSetId) : 0;
    const db = this.db;
    db.withSqliteStatement("INSERT INTO checkpoints(csIndex) VALUES (?)", (stmt) => {
      stmt.bindValue(1, index);
      const res = stmt.step();
      if (DbResult.BE_SQLITE_DONE !== res)
        throw new IModelError(res, "can't insert checkpoint into mock db");
    });
    db.saveChanges();
    const outName = join(this.checkpointDir, this.checkpointNameFromId(arg.changeSetId));
    IModelJsFs.copySync(arg.localFile, outName);
    return outName;
  }

  /** Get an array of the changeset index for all checkpoints */
  public getCheckpoints(): number[] {
    const checkpoints: number[] = [];
    this.db.withSqliteStatement("SELECT csIndex FROM checkpoints", (stmt) => {
      while (DbResult.BE_SQLITE_ROW === stmt.step())
        checkpoints.push(stmt.getValue(0).getInteger());

    });
    return checkpoints;
  }

  /** Find the checkpoint that is no newer than a changeSetId */
  public queryPreviousCheckpoint(changeSetId: ChangesetId): ChangesetId {
    if (changeSetId === "")
      return "";
    const index = this.getChangesetIndex(changeSetId);
    return this.db.withSqliteStatement("SELECT max(csIndex) FROM checkpoints WHERE csIndex <= ? ", (stmt) => {
      stmt.bindValue(1, index);
      const res = stmt.step();
      if (DbResult.BE_SQLITE_ROW !== res)
        throw new IModelError(res, "can't get previous checkpoint");
      return this.getChangesetByIndex(stmt.getValue(0).getInteger()).id;
    });
  }

  /** "download" a checkpoint */
  public downloadCheckpoint(arg: { changeSetId: ChangesetId, targetFile: LocalFileName }) {
    const prev = this.queryPreviousCheckpoint(arg.changeSetId);
    IModelJsFs.copySync(join(this.checkpointDir, this.checkpointNameFromId(prev)), arg.targetFile);
    return prev;
  }

  private copyChangeset(arg: ChangesetFileProps): ChangesetFileProps {
    IModelJsFs.copySync(join(this.changesetDir, arg.id), arg.pathname);
    return arg;
  }

  /** "download" a changeset */
  public downloadChangeset(arg: { changeSetId: ChangesetId, targetDir: LocalDirName }) {
    const cs = this.getChangesetById(arg.changeSetId);
    const csProps = { ...cs, pathname: join(arg.targetDir, cs.id) };
    return this.copyChangeset(csProps);
  }

  /** Get the ChangesetProps for all changesets in a given range */
  public queryChangesets(range?: ChangesetRange): ChangesetProps[] {
    range = range ?? { first: "" };
    const startId = (undefined !== range.after) ? range.after : range.first;
    let startIndex = this.getChangesetIndex(startId);
    if (undefined !== range.after)
      startIndex++;
    if (startIndex === 0) // there's no changeset for index 0 - that's revision0
      startIndex = 1;
    const endIndex = range.end ? this.getChangesetIndex(range.end) : this.getLatestChangesetIndex();
    if (endIndex < startIndex)
      throw new Error("illegal changeset range");

    const changesets: ChangesetProps[] = [];
    while (startIndex <= endIndex)
      changesets.push(this.getChangesetByIndex(startIndex++));
    return changesets;
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
      stmt.bindValue(1, elementId);
      const briefcases = new Set<BriefcaseId>();
      while (DbResult.BE_SQLITE_ROW === stmt.step())
        briefcases.add(stmt.getValue(0).getInteger());
      return briefcases;
    });
  }

  public queryAllLocks(briefcaseId: number) {
    const locks: LockProps[] = [];
    this.db.withPreparedSqliteStatement("SELECT id FROM locks WHERE briefcaseId=?", (stmt) => {
      stmt.bindValue(1, briefcaseId);
      while (DbResult.BE_SQLITE_ROW === stmt.step())
        locks.push({ objectId: stmt.getValue(0).getString(), level: LockLevel.Exclusive, type: LockType.Element });
    });
    this.db.withPreparedSqliteStatement("SELECT lockId FROM sharedLocks WHERE briefcaseId=?", (stmt) => {
      stmt.bindValue(1, briefcaseId);
      while (DbResult.BE_SQLITE_ROW === stmt.step())
        locks.push({ objectId: stmt.getValue(0).getString(), level: LockLevel.Shared, type: LockType.Model });
    });
    return locks;
  }

  public queryLockStatus(elementId: Id64String): LockStatus {
    return this.db.withPreparedSqliteStatement("SELECT released,type,level,briefcaseId FROM locks WHERE id=?", (stmt) => {
      stmt.bindValue(1, elementId);
      const rc = stmt.step();
      if (DbResult.BE_SQLITE_ROW !== rc)
        return { level: LockLevel.None };
      const releaseVal = stmt.getValue(0);
      const state = {
        released: releaseVal.isNull ? undefined : releaseVal.getString(),
        type: stmt.getValue(1).getInteger(),
        level: stmt.getValue(2).getInteger(),
      };
      switch (state.level) {
        case LockLevel.None:
          return state;
        case LockLevel.Exclusive:
          return { ...state, briefcaseId: stmt.getValue(3).getInteger() };
        case LockLevel.Shared:
          return { ...state, sharedBy: this.querySharedLockHolders(elementId) };
        default:
          throw new Error("illegal lock state");
      }
    });
  }

  private reserveLock(currStatus: LockStatus, props: LockProps, briefcase: { changeSetId: ChangesetId, briefcaseId: BriefcaseId }) {
    if (props.level === LockLevel.Exclusive && currStatus.released && (this.getChangesetIndex(currStatus.released) > this.getChangesetIndex(briefcase.changeSetId)))
      throw new IModelError(IModelHubStatus.PullIsRequired, "Pull is required");

    const wantShared = props.level === LockLevel.Shared;
    if (wantShared && (currStatus.level === LockLevel.Exclusive))
      throw new Error("cannot acquire shared lock because an exclusive lock is already held");

    if (currStatus.type !== undefined && currStatus.type !== props.type)
      throw new Error("cannot change lock type");

    this.db.withPreparedSqliteStatement("INSERT INTO locks(id,type,level,briefcaseId) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET briefcaseId=excluded.briefcaseId,level=excluded.level", (stmt) => {
      stmt.bindValue(1, props.objectId);
      stmt.bindValue(2, props.type);
      stmt.bindValue(3, props.level);
      stmt.bindValue(4, wantShared ? undefined : briefcase.briefcaseId);
      const rc = stmt.step();
      if (rc !== DbResult.BE_SQLITE_DONE)
        throw new Error("cannot insert lock");
    });

    if (wantShared) {
      this.db.withPreparedSqliteStatement("INSERT INTO sharedLocks(lockId,briefcaseId) VALUES(?,?)", (stmt) => {
        stmt.bindValue(1, props.objectId);
        stmt.bindValue(2, briefcase.briefcaseId);
        const rc = stmt.step();
        if (rc !== DbResult.BE_SQLITE_DONE)
          throw new Error("cannot insert shared lock");
      });
    }
    this.db.saveChanges();
  }

  private clearLock(id: Id64String) {
    this.db.withPreparedSqliteStatement("UPDATE locks SET level=0,briefcaseId=NULL WHERE id=?", (stmt) => {
      stmt.bindValue(1, id);
      const rc = stmt.step();
      if (rc !== DbResult.BE_SQLITE_DONE)
        throw new Error("can't release lock");
    });
  }
  private updateLockChangeset(id: Id64String, changeSetId: ChangesetId) {
    this.db.withPreparedSqliteStatement("UPDATE locks SET released=?1 WHERE id=?2", (stmt) => {
      stmt.bindValue(1, changeSetId);
      stmt.bindValue(2, id);
      const rc = stmt.step();
      if (rc !== DbResult.BE_SQLITE_DONE)
        throw new Error("can't update lock changeSetId");
    });
  }

  public requestLock(props: LockProps, briefcase: { changeSetId: ChangesetId, briefcaseId: BriefcaseId }) {
    if (props.level === LockLevel.None)
      throw new Error("cannot request lock for LockLevel.None");

    const lockStatus = this.queryLockStatus(props.objectId);
    switch (lockStatus.level) {
      case LockLevel.None:
        return this.reserveLock(lockStatus, props, briefcase);

      case LockLevel.Shared:
        if (props.level !== LockLevel.Shared)
          throw new Error("element is locked with shared access, cannot obtain exclusive lock");
        if (!lockStatus.sharedBy.has(briefcase.briefcaseId))
          this.reserveLock(lockStatus, props, briefcase);
        return;

      case LockLevel.Exclusive:
        if (lockStatus.briefcaseId !== briefcase.briefcaseId)
          throw new IModelError(IModelHubStatus.LockOwnedByAnotherBriefcase, "lock is already owned by another user");
    }
  }

  public releaseLock(arg: { props: LockProps, changeSetId: ChangesetId, briefcaseId: BriefcaseId }) {
    const lockId = arg.props.objectId;
    const lockStatus = this.queryLockStatus(lockId);
    switch (lockStatus.level) {
      case LockLevel.None:
        throw new IModelError(IModelHubStatus.LockDoesNotExist, "lock not held");

      case LockLevel.Exclusive:
        if (lockStatus.briefcaseId !== arg.briefcaseId)
          throw new IModelError(IModelHubStatus.LockOwnedByAnotherBriefcase, "lock not held by this briefcase");
        this.updateLockChangeset(lockId, arg.changeSetId);
        this.clearLock(lockId);
        break;

      case LockLevel.Shared:
        if (!lockStatus.sharedBy.has(arg.briefcaseId))
          throw new IModelError(IModelHubStatus.LockDoesNotExist, "shared lock not held by this briefcase");

        this.db.withPreparedSqliteStatement("DELETE FROM sharedLocks WHERE lockId=? AND briefcaseId=?", (stmt) => {
          stmt.bindValue(1, lockId);
          stmt.bindValue(2, arg.briefcaseId);
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
