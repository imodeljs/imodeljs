/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/**
 * @packageDocumentation
 * @module iModels
 */

/** @public */
export type LocalFileName = string;
/** @public */
export type LocalDirName = string;

/** A string that identifies a changeset.
 * @note this string is *not* a Guid. It is generated internally based on the content of the changeset.
 * @public
 */
export type ChangesetId = string;

/** The index of a changeset, assigned by iModelHub.
 * @note 0 means "before the first changeset." Values less than 0 are invalid.
 * @public
 */
export type ChangesetIndex = number;

/** Both the index and Id of a changeset
 * @public
 */
export interface ChangesetIndexAndId { index: ChangesetIndex, id: ChangesetId }

/** The Id and optionally the index of a changeset
 * @public
 */
export interface ChangesetIdWithIndex { index?: ChangesetIndex, id: ChangesetId }

/** either changeset index, id, or both
* @public
*/
export type ChangesetIndexOrId = ChangesetIndexAndId | { index: ChangesetIndex, id?: never } | { id: ChangesetId, index?: never };

/** Value to indicate whether a changeset contains schema changes or not
 * @public */
export enum ChangesetType {
  /** changeset does *not* contain schema changes. */
  Regular = 0,
  /** changeset *does* contain schema changes. */
  Schema = 1,
}

/** Properties of a changeset
 * @beta
 */
export interface ChangesetProps {
  /** The index (sequence number) from IModelHub for this changeset. Larger index values were pushed later. */
  index: ChangesetIndex;
  /** the ChangesetId */
  id: ChangesetId;
  /** the ChangeSetId of the parent changeset of this changeset */
  parentId: ChangesetId;
  /** The type of changeset */
  changesType: ChangesetType;
  /** The user-supplied description of the work this changeset holds */
  description: string;
  /** The BriefcaseId of the briefcase that created this changeset */
  briefcaseId: number;
  /** The date this changeset was uploaded to the hub */
  pushDate: string;
  /** The identity of the user that created this changeset */
  userCreated: string;
  /** The size, in bytes, of this changeset */
  size?: number;
}

/** Properties of a changeset file
 * @beta
 */
export interface ChangesetFileProps extends ChangesetProps {
  /** The full pathname of the local file holding this changeset. */
  pathname: LocalFileName;
}

/**
 * A range of changesets
 * @public
 */
export interface ChangesetRange {
  /** index of the first changeset */
  first: ChangesetIndex;
  /** index of last changeset. If undefined, all changesets after first are returned. */
  end?: ChangesetIndex;
}
