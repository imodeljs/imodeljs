/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module HubAccess
 */

import { GuidString, Id64String } from "@bentley/bentleyjs-core";
import {
  ChangesetFileProps, ChangesetId, ChangesetIndex, ChangesetIndexOrId, ChangesetProps, ChangesetRange, CodeProps, IModelVersion, LocalDirName,
  LocalFileName,
} from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { BriefcaseId } from "./BriefcaseManager";
import { DownloadRequest } from "./CheckpointManager";

/** The scope of a lock.
 * @public
 */
export enum LockScope {
  /** The entity is not locked */
  None,
  /** Holding a shared lock blocks other users from acquiring the Exclusive lock on an entity. More than one user may acquire the shared lock. */
  Shared,
  /** A Lock that blocks other users from making modifications to an entity. */
  Exclusive,
}

/**
 * The properties of an iModel server lock.
 * @beta
 */
export interface LockProps {
  /** The entityId for the lock */
  entityId: Id64String;
  /** the lock scope */
  scope: LockScope;
}

/** Argument for methods that must supply an IModelId
 * @internal
 */
export interface IModelIdArg {
  iModelId: GuidString;
  requestContext?: AuthorizedClientRequestContext;
}

/** Argument for methods that must supply an IModel name and ContextId
 * @internal
 */
export interface IModelNameArg {
  requestContext?: AuthorizedClientRequestContext;
  contextId: GuidString;
  iModelName: string;
}

/** Argument for methods that must supply briefcase properties
 * @internal
 */
export interface BriefcaseDbArg {
  requestContext?: AuthorizedClientRequestContext;
  briefcase: {
    briefcaseId: BriefcaseId;
    iModelId: GuidString;
    changeSetId: ChangesetId;
  };
}

/** Argument for methods that must supply an IModelId and a BriefcaseId
 * @internal
 */
export interface BriefcaseIdArg extends IModelIdArg {
  briefcaseId: number;
}

/** Argument for methods that must supply an IModelId and a changeset
 * @internal
 */
export interface ChangesetArg extends IModelIdArg {
  changeset: ChangesetIndexOrId;
}

/** @internal */
export interface ChangesetIndexArg extends IModelIdArg {
  csIndex: ChangesetIndex;
}

/** Argument for methods that must supply an IModelId and a range of ChangesetIds.
 * @internal
 */
export interface ChangesetRangeArg extends IModelIdArg {
  /** the range of changesets desired. If is undefined, *all* changesets are returned. */
  range?: ChangesetRange;
}

/** @internal */
export type CheckPointArg = DownloadRequest;

/** Methods for accessing services of IModelHub from the backend.
 * @note these methods may be mocked for tests
 * @internal
 */
export interface BackendHubAccess {
  /** Download all the changesets in the specified range. */
  downloadChangesets: (arg: ChangesetRangeArg & { targetDir: LocalDirName }) => Promise<ChangesetFileProps[]>;
  /** Download a single changeset. */
  downloadChangeset: (arg: ChangesetArg & { targetDir: LocalDirName }) => Promise<ChangesetFileProps>;
  /** Query the changeset properties given a ChangesetIndex  */
  queryChangeset: (arg: ChangesetArg) => Promise<ChangesetProps>;
  /** Query an array of changeset properties given a range of ChangesetIndexes  */
  queryChangesets: (arg: ChangesetRangeArg) => Promise<ChangesetProps[]>;
  /** push a changeset to iMOdelHub. Returns the newly pushed changeSet's index */
  pushChangeset: (arg: IModelIdArg & { changesetProps: ChangesetFileProps }) => Promise<ChangesetIndex>;
  /** Get the ChangesetProps of the most recent changeset */
  getLatestChangeset: (arg: IModelIdArg) => Promise<ChangesetProps>;
  /** Get the ChangesetProps for an IModelVersion */
  getChangesetFromVersion: (arg: IModelIdArg & { version: IModelVersion }) => Promise<ChangesetProps>;
  /** Get the ChangesetProps for a named version */
  getChangesetFromNamedVersion: (arg: IModelIdArg & { versionName: string }) => Promise<ChangesetProps>;

  /** Acquire a new briefcaseId for the supplied iModelId
     * @note usually there should only be one briefcase per iModel per user.
     */
  acquireNewBriefcaseId: (arg: IModelIdArg) => Promise<number>;
  /** Release a briefcaseId. After this call it is illegal to generate changesets for the released briefcaseId. */
  releaseBriefcase: (arg: BriefcaseIdArg) => Promise<void>;

  /** get an array of the briefcases assigned to the current user. */
  getMyBriefcaseIds: (arg: IModelIdArg) => Promise<number[]>;

  /** download a v1 checkpoint */
  downloadV1Checkpoint: (arg: CheckPointArg) => Promise<ChangesetId>;
  /** download a v2 checkpoint */
  downloadV2Checkpoint: (arg: CheckPointArg) => Promise<ChangesetId>;

  /** acquire a list of locks. Throws if unsuccessful */
  acquireLocks: (arg: BriefcaseDbArg & { locks: LockProps[] }) => Promise<void>;
  /** acquire the schema lock. Throws if unsuccessful */
  acquireSchemaLock: (arg: BriefcaseDbArg) => Promise<void>;

  /** determine whether the schema lock is currently held */
  querySchemaLock: (arg: BriefcaseDbArg) => Promise<boolean>;
  /** get the full list of held locks for a briefcase */
  queryAllLocks: (arg: BriefcaseDbArg) => Promise<LockProps[]>;

  /** release all currently held locks */
  releaseAllLocks: (arg: BriefcaseIdArg & ChangesetIndexArg) => Promise<void>;

  /** Query codes */
  queryAllCodes: (arg: BriefcaseDbArg) => Promise<CodeProps[]>;
  /** release codes */
  releaseAllCodes: (arg: BriefcaseIdArg) => Promise<void>;

  /** get the iModelId of an iModel by name. Undefined if no iModel with that name exists.  */
  queryIModelByName: (arg: IModelNameArg) => Promise<GuidString | undefined>;
  /** create a new iModel. Returns the Guid of the newly created iModel */
  createIModel: (arg: IModelNameArg & { description?: string, revision0?: LocalFileName }) => Promise<GuidString>;
  /** delete an iModel  */
  deleteIModel: (arg: IModelIdArg & { contextId: GuidString }) => Promise<void>;
}

