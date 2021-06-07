/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { join } from "path";
import { DbResult, GuidString, IModelStatus, OpenMode } from "@bentley/bentleyjs-core";
import { BriefcaseIdValue, IModelError } from "@bentley/imodeljs-common";
import { BriefcaseManager } from "../BriefcaseManager";
import { ChangesetFileProps, ChangesetId, ChangesetProps, ChangesetRange, LocalDirName, LocalFileName } from "../BackendHubAccess";
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
    db.executeSQL("CREATE TABLE briefcases(id INTEGER PRIMARY KEY,user TEXT)");
    db.executeSQL("CREATE TABLE timeline(id TEXT PRIMARY KEY,parentId TEXT,description TEXT,user TEXT,size BIGINT,type INTEGER,pushDate TEXT,briefcaseId INTEGER,FOREIGN KEY(parentId) REFERENCES timeline(id))");
    db.executeSQL("CREATE TABLE checkpoints(csIndex INTEGER PRIMARY KEY)");
    db.executeSQL("CREATE TABLE versions(name TEXT PRIMARY KEY,id TEXT,FOREIGN KEY(id) REFERENCES timeline(id))");
    db.saveChanges();

    const path = this.uploadCheckpoint({ changesetId: "", localFile: arg.revision0 });
    const nativeDb = IModelDb.openDgnDb({ path }, OpenMode.ReadWrite);
    try {
      nativeDb.saveProjectGuid(this.contextId);
      nativeDb.setDbGuid(this.iModelId);
      nativeDb.saveChanges();
      nativeDb.deleteAllTxns(); // necessary before resetting briefcaseId
      nativeDb.resetBriefcaseId(BriefcaseIdValue.Unassigned);
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

  public checkpointNameFromId(changesetId: ChangesetId) {
    return changesetId === "" ? "0" : changesetId;
  }

  /** "upload" a checkpoint */
  public uploadCheckpoint(arg: { changesetId: ChangesetId, localFile: LocalFileName }) {
    const index = (arg.changesetId !== "") ? this.getChangesetIndex(arg.changesetId) : 0;
    const db = this.db;
    db.withSqliteStatement("INSERT INTO checkpoints(csIndex) VALUES (?)", (stmt) => {
      stmt.bindValue(1, index);
      const res = stmt.step();
      if (DbResult.BE_SQLITE_DONE !== res)
        throw new IModelError(res, "can't insert checkpoint into mock db");
    });
    db.saveChanges();
    const outName = join(this.checkpointDir, this.checkpointNameFromId(arg.changesetId));
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

  /** Find the checkpoint that is no newer than a changesetId */
  public queryPreviousCheckpoint(changesetId: ChangesetId): ChangesetId {
    if (changesetId === "")
      return "";
    const index = this.getChangesetIndex(changesetId);
    return this.db.withSqliteStatement("SELECT max(csIndex) FROM checkpoints WHERE csIndex <= ? ", (stmt) => {
      stmt.bindValue(1, index);
      const res = stmt.step();
      if (DbResult.BE_SQLITE_ROW !== res)
        throw new IModelError(res, "can't get previous checkpoint");
      return this.getChangesetByIndex(stmt.getValue(0).getInteger()).id;
    });
  }

  /** "download" a checkpoint */
  public downloadCheckpoint(arg: { changesetId: ChangesetId, targetFile: LocalFileName }) {
    const prev = this.queryPreviousCheckpoint(arg.changesetId);
    IModelJsFs.copySync(join(this.checkpointDir, this.checkpointNameFromId(prev)), arg.targetFile);
    return prev;
  }

  private copyChangeset(arg: ChangesetFileProps): ChangesetFileProps {
    IModelJsFs.copySync(join(this.changesetDir, arg.id), arg.pathname);
    return arg;
  }

  /** "download" a changeset */
  public downloadChangeset(arg: { changesetId: ChangesetId, targetDir: LocalDirName }) {
    const cs = this.getChangesetById(arg.changesetId);
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
