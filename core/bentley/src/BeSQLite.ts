/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module BeSQLite
 */

/** Whether to open a database readonly or writeable.
 * @public
 */
export enum OpenMode {
  Readonly = 0x00000001,
  ReadWrite = 0x00000002,
}

/** Values, stored in changesets, that indicate what operation was performed on the database.
 * @public
 */
export enum DbOpcode {
  /** A row was deleted. */
  Delete = 9,
  /** A new row was inserted. */
  Insert = 18,
  /** Some columns of an existing row were updated. */
  Update = 23,
}

/** Values for return codes from BeSQLite functions. Consult SQLite documentation for further explanations.
 * @public
 */
/* eslint-disable @typescript-eslint/naming-convention */
//  Disabling for the rest of the file since eslint does not correctly parse the entire enum, only parts of it
export enum DbResult {
  /** Success */
  BE_SQLITE_OK = 0,
  /** SQL error or missing database */
  BE_SQLITE_ERROR = 1,
  /** Internal logic error */
  BE_SQLITE_INTERNAL = 2,
  /** Access permission denied */
  BE_SQLITE_PERM = 3,
  /** Callback routine requested an abort */
  BE_SQLITE_ABORT = 4,
  /** The database file is locked */
  BE_SQLITE_BUSY = 5,
  /** A table in the database is locked */
  BE_SQLITE_LOCKED = 6,
  /** A malloc() failed */
  BE_SQLITE_NOMEM = 7,
  /** Attempt to write a readonly database */
  BE_SQLITE_READONLY = 8,
  /** Operation terminated by interrupt */
  BE_SQLITE_INTERRUPT = 9,
  /** Some kind of disk I/O error occurred */
  BE_SQLITE_IOERR = 10,
  /** The database disk image is malformed */
  BE_SQLITE_CORRUPT = 11,
  /** NOT USED. Table or record not found */
  BE_SQLITE_NOTFOUND = 12,
  /** Insertion failed because database is full or write operation failed because disk is full */
  BE_SQLITE_FULL = 13,
  /** Unable to open the database file */
  BE_SQLITE_CANTOPEN = 14,
  /** Database lock protocol error */
  BE_SQLITE_PROTOCOL = 15,
  /** Database is empty */
  BE_SQLITE_EMPTY = 16,
  /** The database schema changed */
  BE_SQLITE_SCHEMA = 17,
  /** String or BLOB exceeds size limit */
  BE_SQLITE_TOOBIG = 18,
  /** Abort due to constraint violation. See extended error values. */
  BE_SQLITE_CONSTRAINT_BASE = 19,
  /** Data type mismatch */
  BE_SQLITE_MISMATCH = 20,
  /** Library used incorrectly */
  BE_SQLITE_MISUSE = 21,
  /** Uses OS features not supported on host */
  BE_SQLITE_NOLFS = 22,
  /** Authorization denied */
  BE_SQLITE_AUTH = 23,
  /** Auxiliary database format error */
  BE_SQLITE_FORMAT = 24,
  /** 2nd parameter to Bind out of range */
  BE_SQLITE_RANGE = 25,
  /** File opened that is not a database file */
  BE_SQLITE_NOTADB = 26,
  /** Step() has another row ready */
  BE_SQLITE_ROW = 100,
  /** Step() has finished executing */
  BE_SQLITE_DONE = 101,

  BE_SQLITE_IOERR_READ = (BE_SQLITE_IOERR | (1 << 8)),
  BE_SQLITE_IOERR_SHORT_READ = (BE_SQLITE_IOERR | (2 << 8)),
  BE_SQLITE_IOERR_WRITE = (BE_SQLITE_IOERR | (3 << 8)),
  BE_SQLITE_IOERR_FSYNC = (BE_SQLITE_IOERR | (4 << 8)),
  BE_SQLITE_IOERR_DIR_FSYNC = (BE_SQLITE_IOERR | (5 << 8)),
  BE_SQLITE_IOERR_TRUNCATE = (BE_SQLITE_IOERR | (6 << 8)),
  BE_SQLITE_IOERR_FSTAT = (BE_SQLITE_IOERR | (7 << 8)),
  BE_SQLITE_IOERR_UNLOCK = (BE_SQLITE_IOERR | (8 << 8)),
  BE_SQLITE_IOERR_RDLOCK = (BE_SQLITE_IOERR | (9 << 8)),
  BE_SQLITE_IOERR_DELETE = (BE_SQLITE_IOERR | (10 << 8)),
  BE_SQLITE_IOERR_BLOCKED = (BE_SQLITE_IOERR | (11 << 8)),
  BE_SQLITE_IOERR_NOMEM = (BE_SQLITE_IOERR | (12 << 8)),
  BE_SQLITE_IOERR_ACCESS = (BE_SQLITE_IOERR | (13 << 8)),
  BE_SQLITE_IOERR_CHECKRESERVEDLOCK = (BE_SQLITE_IOERR | (14 << 8)),
  BE_SQLITE_IOERR_LOCK = (BE_SQLITE_IOERR | (15 << 8)),
  BE_SQLITE_IOERR_CLOSE = (BE_SQLITE_IOERR | (16 << 8)),
  BE_SQLITE_IOERR_DIR_CLOSE = (BE_SQLITE_IOERR | (17 << 8)),
  BE_SQLITE_IOERR_SHMOPEN = (BE_SQLITE_IOERR | (18 << 8)),
  BE_SQLITE_IOERR_SHMSIZE = (BE_SQLITE_IOERR | (19 << 8)),
  BE_SQLITE_IOERR_SHMLOCK = (BE_SQLITE_IOERR | (20 << 8)),
  BE_SQLITE_IOERR_SHMMAP = (BE_SQLITE_IOERR | (21 << 8)),
  BE_SQLITE_IOERR_SEEK = (BE_SQLITE_IOERR | (22 << 8)),
  BE_SQLITE_IOERR_DELETE_NOENT = (BE_SQLITE_IOERR | (23 << 8)),

  /** attempt to create a new file when a file by that name already exists */
  BE_SQLITE_ERROR_FileExists = (BE_SQLITE_IOERR | (1 << 24)),
  /** attempt to open a BeSQLite::Db that is already in use somewhere. */
  BE_SQLITE_ERROR_AlreadyOpen = (BE_SQLITE_IOERR | (2 << 24)),
  /** attempt to open a BeSQLite::Db that doesn't have a property table. */
  BE_SQLITE_ERROR_NoPropertyTable = (BE_SQLITE_IOERR | (3 << 24)),
  /** the database name is not a file. */
  BE_SQLITE_ERROR_FileNotFound = (BE_SQLITE_IOERR | (4 << 24)),
  /** there is no transaction active and the database was opened with AllowImplicitTransactions=false */
  BE_SQLITE_ERROR_NoTxnActive = (BE_SQLITE_IOERR | (5 << 24)),
  /** wrong BeSQLite profile version */
  BE_SQLITE_ERROR_BadDbProfile = (BE_SQLITE_IOERR | (6 << 24)),
  /** Profile of file could not be determined. */
  BE_SQLITE_ERROR_InvalidProfileVersion = (BE_SQLITE_IOERR | (7 << 24)),
  /** Upgrade of profile of file failed. */
  BE_SQLITE_ERROR_ProfileUpgradeFailed = (BE_SQLITE_IOERR | (8 << 24)),
  /** Profile of file is too old. Therefore file can only be opened read-only. */
  BE_SQLITE_ERROR_ProfileTooOldForReadWrite = (BE_SQLITE_IOERR | (9 << 24)),
  /** Profile of file is too old. Therefore file cannot be opened. */
  BE_SQLITE_ERROR_ProfileTooOld = (BE_SQLITE_IOERR | (10 << 24)),
  /** Profile of file is too new for read-write access. Therefore file can only be opened read-only. */
  BE_SQLITE_ERROR_ProfileTooNewForReadWrite = (BE_SQLITE_IOERR | (11 << 24)),
  /** Profile of file is too new. Therefore file cannot be opened. */
  BE_SQLITE_ERROR_ProfileTooNew = (BE_SQLITE_IOERR | (12 << 24)),
  /** attempt to commit with active changetrack */
  BE_SQLITE_ERROR_ChangeTrackError = (BE_SQLITE_IOERR | (13 << 24)),
  /** invalid version of the revision file is being imported */
  BE_SQLITE_ERROR_InvalidChangeSetVersion = (BE_SQLITE_IOERR | (14 << 24)),
  /** The schemas found in the database need to be upgraded */
  BE_SQLITE_ERROR_SchemaUpgradeRequired = (BE_SQLITE_IOERR | 15 << 24),
  /** The schemas found in the database are too new, and the application needs to be upgraded. */
  BE_SQLITE_ERROR_SchemaTooNew = (BE_SQLITE_IOERR | 16 << 24),
  /** The schemas found in the database are too old, and the DgnDb needs to be upgraded. */
  BE_SQLITE_ERROR_SchemaTooOld = (BE_SQLITE_IOERR | 17 << 24),
  /** Error acquiring a lock on the schemas before upgrade. */
  BE_SQLITE_ERROR_SchemaLockFailed = (BE_SQLITE_IOERR | 18 << 24),
  /** Error upgrading the schemas in the database. */
  BE_SQLITE_ERROR_SchemaUpgradeFailed = (BE_SQLITE_IOERR | 19 << 24),
  /** Error importing the schemas into the database. */
  BE_SQLITE_ERROR_SchemaImportFailed = (BE_SQLITE_IOERR | 20 << 24),
  /** Error acquiring locks or codes */
  BE_SQLITE_ERROR_CouldNotAcquireLocksOrCodes = (BE_SQLITE_IOERR | 21 << 24),
  /** Recommended that the schemas found in the database be upgraded */
  BE_SQLITE_ERROR_SchemaUpgradeRecommended = (BE_SQLITE_IOERR | 22 << 24),

  BE_SQLITE_LOCKED_SHAREDCACHE = (BE_SQLITE_LOCKED | (1 << 8)),
  BE_SQLITE_BUSY_RECOVERY = (BE_SQLITE_BUSY | (1 << 8)),
  BE_SQLITE_CANTOPEN_NOTEMPDIR = (BE_SQLITE_CANTOPEN | (1 << 8)),
  BE_SQLITE_CANTOPEN_ISDIR = (BE_SQLITE_CANTOPEN | (2 << 8)),
  BE_SQLITE_CANTOPEN_FULLPATH = (BE_SQLITE_CANTOPEN | (3 << 8)),
  BE_SQLITE_CORRUPT_VTAB = (BE_SQLITE_CORRUPT | (1 << 8)),
  BE_SQLITE_READONLY_RECOVERY = (BE_SQLITE_READONLY | (1 << 8)),
  BE_SQLITE_READONLY_CANTLOCK = (BE_SQLITE_READONLY | (2 << 8)),
  BE_SQLITE_READONLY_ROLLBACK = (BE_SQLITE_READONLY | (3 << 8)),
  BE_SQLITE_ABORT_ROLLBACK = (BE_SQLITE_ABORT | (2 << 8)),
  BE_SQLITE_CONSTRAINT_CHECK = (BE_SQLITE_CONSTRAINT_BASE | (1 << 8)),
  BE_SQLITE_CONSTRAINT_COMMITHOOK = (BE_SQLITE_CONSTRAINT_BASE | (2 << 8)),
  BE_SQLITE_CONSTRAINT_FOREIGNKEY = (BE_SQLITE_CONSTRAINT_BASE | (3 << 8)),
  BE_SQLITE_CONSTRAINT_FUNCTION = (BE_SQLITE_CONSTRAINT_BASE | (4 << 8)),
  BE_SQLITE_CONSTRAINT_NOTNULL = (BE_SQLITE_CONSTRAINT_BASE | (5 << 8)),
  BE_SQLITE_CONSTRAINT_PRIMARYKEY = (BE_SQLITE_CONSTRAINT_BASE | (6 << 8)),
  BE_SQLITE_CONSTRAINT_TRIGGER = (BE_SQLITE_CONSTRAINT_BASE | (7 << 8)),
  BE_SQLITE_CONSTRAINT_UNIQUE = (BE_SQLITE_CONSTRAINT_BASE | (8 << 8)),
  BE_SQLITE_CONSTRAINT_VTAB = (BE_SQLITE_CONSTRAINT_BASE | (9 << 8)),
}
/* eslint-enable @typescript-eslint/naming-convention */

/** Options that specify how to apply ChangeSets.
 * @public
 */
export enum ChangeSetApplyOption {
  /** ChangeSet won't be used.  */
  None = 0,
  /** ChangeSet will be merged into the Db */
  Merge,
  /**
   * ChangeSet will be reversed from the Db
   * @deprecated
   */
  Reverse,
  /** ChangeSet will be reinstated into the Db
   * @deprecated
   */
  Reinstate,
}
