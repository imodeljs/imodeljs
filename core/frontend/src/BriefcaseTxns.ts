/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IModelConnection
 */

import { BeEvent } from "@bentley/bentleyjs-core";
import { Point3d, Range3d, Range3dProps, XYZProps } from "@bentley/geometry-core";
import {
  ChangedEntities, ChangesetIndexAndId, EcefLocation, EcefLocationProps, GeographicCRS, GeographicCRSProps, IModelStatus, IpcAppChannel, ModelIdAndGeometryGuid,
  RemoveFunction, RootSubjectProps, TxnNotifications,
} from "@bentley/imodeljs-common";
import { BriefcaseConnection } from "./BriefcaseConnection";
import { IpcApp, NotificationHandler } from "./IpcApp";

/**
 * Base class for notification handlers for events from the backend that are specific to a [[BriefcaseConnection]].
 * @see [[BriefcaseTxns]].
 * @public
 */
export abstract class BriefcaseNotificationHandler extends NotificationHandler {
  constructor(private _key: string) { super(); }
  public abstract get briefcaseChannelName(): string;
  public get channelName() { return `${this.briefcaseChannelName}:${this._key}`; }
}

/** Manages local changes to a [[BriefcaseConnection]] via [Txns]($docs/learning/InteractiveEditing.md).
 * @see [[BriefcaseConnection.txns]].
 * @see [TxnManager]($backend) for the backend counterpart.
 * @public
 */
export class BriefcaseTxns extends BriefcaseNotificationHandler implements TxnNotifications {
  private readonly _iModel: BriefcaseConnection;
  private _cleanup?: RemoveFunction;

  /** @internal */
  public get briefcaseChannelName() {
    return IpcAppChannel.Txns;
  }

  /** Event raised after Txn validation or changeset application to indicate the set of changed elements.
   * @note If there are many changed elements in a single Txn, the notifications are sent in batches so this event *may be called multiple times* per Txn.
   */
  public readonly onElementsChanged = new BeEvent<(changes: Readonly<ChangedEntities>) => void>();

  /** Event raised after Txn validation or changeset application to indicate the set of changed models.
   * @note If there are many changed models in a single Txn, the notifications are sent in batches so this event *may be called multiple times* per Txn.
   */
  public readonly onModelsChanged = new BeEvent<(changes: Readonly<ChangedEntities>) => void>();

  /** Event raised after the geometry within one or more [[GeometricModelState]]s is modified by applying a changeset or validation of a transaction.
   * A model's geometry can change as a result of:
   *  - Insertion or deletion of a geometric element within the model; or
   *  - Modification of an existing element's geometric properties; or
   *  - An explicit request to flag it as changed via [IModelDb.Models.updateModel]($backend).
   */
  public readonly onModelGeometryChanged = new BeEvent<(changes: ReadonlyArray<ModelIdAndGeometryGuid>) => void>();

  /** Event raised before a commit operation is performed. Initiated by a call to [[BriefcaseConnection.saveChanges]], unless there are no changes to save.
   * @see [[onCommitted]] for the event raised after the operation.
   */
  public readonly onCommit = new BeEvent<() => void>();

  /** Event raised after a commit operation is performed. Initiated by a call to [[BriefcaseConnection.saveChanges]], even if there were no changes to save.
   * The event supplies the following information:
   *  - `hasPendingTxns`: true if the briefcase has local changes not yet pushed to the server.
   *  - `time`: the time at which changes were saved on the backend (obtained via `Date.now()`).
   * @see [[onCommit]] for the event raised before the operation.
   */
  public readonly onCommitted = new BeEvent<(hasPendingTxns: boolean, time: number) => void>();

  /** Event raised after a changeset has been applied to the briefcase.
   * Changesets may be applied as a result of [[BriefcaseConnection.pullAndMergeChanges]], or by undo/redo operations.
   */
  public readonly onChangesApplied = new BeEvent<() => void>();

  /** Event raised before an undo/redo operation is performed.
   * @see [[onAfterUndoRedo]] for the event raised after the operation.
   */
  public readonly onBeforeUndoRedo = new BeEvent<(isUndo: boolean) => void>();

  /** Event raised after an undo/redo operation is performed.
   * @see [[onBeforeUndoRedo]] for the event raised before to the operation.
   */
  public readonly onAfterUndoRedo = new BeEvent<(isUndo: boolean) => void>();

  /** Event raised after changes are pulled and merged into the briefcase.
   * @see [[BriefcaseConnection.pullAndMergeChanges]].
   */
  public readonly onChangesPulled = new BeEvent<(parentChangeset: ChangesetIndexAndId) => void>();

  /** Event raised after the briefcase's local changes are pushed.
   * @see [[BriefcaseConnection.pushChanges]].
   */
  public readonly onChangesPushed = new BeEvent<(parentChangeset: ChangesetIndexAndId) => void>();

  /** @internal */
  public constructor(iModel: BriefcaseConnection) {
    super(iModel.key);
    this._iModel = iModel;
    this._cleanup = this.registerImpl();
  }

  /** @internal */
  public dispose(): void {
    if (this._cleanup) {
      this._cleanup();
      this._cleanup = undefined;

      this.onElementsChanged.clear();
      this.onModelsChanged.clear();
      this.onModelGeometryChanged.clear();
      this.onCommit.clear();
      this.onCommitted.clear();
      this.onChangesApplied.clear();
      this.onBeforeUndoRedo.clear();
      this.onAfterUndoRedo.clear();
      this.onChangesPulled.clear();
      this.onChangesPushed.clear();
    }
  }

  /** Query if the briefcase has any pending Txns waiting to be pushed. */
  public async hasPendingTxns(): Promise<boolean> { // eslint-disable-line @bentley/prefer-get
    return IpcApp.callIpcHost("hasPendingTxns", this._iModel.key);
  }

  /** Determine if any reversible (undoable) changes exist.
   * @see [[reverseSingleTxn]] or [[reverseAll]] to undo changes.
   */
  public async isUndoPossible(): Promise<boolean> { // eslint-disable-line @bentley/prefer-get
    return IpcApp.callIpcHost("isUndoPossible", this._iModel.key);
  }

  /** Determine if any reinstatable (redoable) changes exist.
   * @see [[reinstateTxn]] to redo changes.
   */
  public async isRedoPossible(): Promise<boolean> { // eslint-disable-line @bentley/prefer-get
    return IpcApp.callIpcHost("isRedoPossible", this._iModel.key);
  }

  /** Get the description of the operation that would be reversed by calling [[reverseTxns]]`(1)`.
   * This is useful for showing the operation that would be undone, for example in a menu.
   */
  public async getUndoString(): Promise<string> {
    return IpcApp.callIpcHost("getUndoString", this._iModel.key);
  }

  /** Get a description of the operation that would be reinstated by calling [[reinstateTxn]].
   * This is useful for showing the operation that would be redone, in a pull-down menu for example.
   */
  public async getRedoString(): Promise<string> {
    return IpcApp.callIpcHost("getRedoString", this._iModel.key);
  }

  /** Reverse (undo) the most recent operation.
   * @see [[reinstateTxn]] to redo operations.
   * @see [[reverseAll]] to undo all operations.
   * @see [[isUndoPossible]] to determine if any reversible operations exist.
   */
  public async reverseSingleTxn(): Promise<IModelStatus> {
    return this.reverseTxns(1);
  }

  /** Reverse (undo) the most recent operation(s) to the briefcase in the current session.
   * @param numOperations the number of operations to reverse. If this is greater than 1, the entire set of operations will
   *  be reinstated together when/if [[reinstateTxn]] is called.
   * @note If there are any outstanding uncommitted changes, they are reversed.
   * @note The term "operation" is used rather than Txn, since multiple Txns can be grouped together via [TxnManager.beginMultiTxnOperation]($backend). So,
   * even if numOperations is 1, multiple Txns may be reversed if they were grouped together when they were made.
   * @note If numOperations is too large only the number of reversible operations are reversed.
   */
  public async reverseTxns(numOperations: number): Promise<IModelStatus> {
    return IpcApp.callIpcHost("reverseTxns", this._iModel.key, numOperations);
  }

  /** Reverse (undo) all changes back to the beginning of the session.
   * @see [[reinstateTxn]] to redo changes.
   * @see [[reverseSingleTxn]] to undo only the most recent operation.
   * @see [[isUndoPossible]] to determine if any reversible operations exist.
   */
  public async reverseAll(): Promise<IModelStatus> {
    return IpcApp.callIpcHost("reverseAllTxn", this._iModel.key);
  }

  /** Reinstate (redo) the most recently reversed transaction. Since at any time multiple transactions can be reversed, it
   * may take multiple calls to this method to reinstate all reversed operations.
   * @returns Success if a reversed transaction was reinstated, error status otherwise.
   * @note If there are any outstanding uncommitted changes, they are canceled before the Txn is reinstated.
   * @see [[isRedoPossible]] to determine if any reinstatable operations exist.
   * @see [[reverseSingleTxn]] or [[reverseAll]] to undo changes.
   */
  public async reinstateTxn(): Promise<IModelStatus> {
    return IpcApp.callIpcHost("reinstateTxn", this._iModel.key);
  }

  /** Restart the current TxnManager session. This causes all Txns in the current session to no longer be undoable (as if the file was closed
   * and reopened.)
   * @note This can be quite disconcerting to the user expecting to be able to undo previously made changes. It should only be used
   * under extreme circumstances where damage to the file or session could happen if the currently committed are reversed. Use sparingly and with care.
   * Probably a good idea to alert the user it happened.
   */
  public async restartTxnSession(): Promise<void> {
    await IpcApp.callIpcHost("restartTxnSession", this._iModel.key);
  }

  /** @internal */
  public notifyElementsChanged(changed: ChangedEntities): void {
    this.onElementsChanged.raiseEvent(changed);
  }

  /** @internal */
  public notifyModelsChanged(changed: ChangedEntities): void {
    this.onModelsChanged.raiseEvent(changed);
  }

  /** @internal */
  public notifyGeometryGuidsChanged(changes: ModelIdAndGeometryGuid[]): void {
    this.onModelGeometryChanged.raiseEvent(changes);
  }

  /** @internal */
  public notifyCommit() {
    this.onCommit.raiseEvent();
  }

  /** @internal */
  public notifyCommitted(hasPendingTxns: boolean, time: number) {
    this.onCommitted.raiseEvent(hasPendingTxns, time);
  }

  /** @internal */
  public notifyChangesApplied() {
    this.onChangesApplied.raiseEvent();
  }

  /** @internal */
  public notifyBeforeUndoRedo(isUndo: boolean) {
    this.onBeforeUndoRedo.raiseEvent(isUndo);
  }

  /** @internal */
  public notifyAfterUndoRedo(isUndo: boolean) {
    this.onAfterUndoRedo.raiseEvent(isUndo);
  }

  /** @internal */
  public notifyPulledChanges(parentChangeset: ChangesetIndexAndId) {
    this.onChangesPulled.raiseEvent(parentChangeset);
  }

  /** @internal */
  public notifyPushedChanges(parentChangeset: ChangesetIndexAndId) {
    this.onChangesPushed.raiseEvent(parentChangeset);
  }

  /** @internal */
  public notifyIModelNameChanged(name: string) {
    this._iModel.name = name;
  }

  /** @internal */
  public notifyRootSubjectChanged(subject: RootSubjectProps) {
    this._iModel.rootSubject = subject;
  }

  /** @internal */
  public notifyProjectExtentsChanged(range: Range3dProps) {
    this._iModel.projectExtents = Range3d.fromJSON(range);
  }

  /** @internal */
  public notifyGlobalOriginChanged(origin: XYZProps) {
    this._iModel.globalOrigin = Point3d.fromJSON(origin);
  }

  /** @internal */
  public notifyEcefLocationChanged(ecef: EcefLocationProps | undefined) {
    this._iModel.ecefLocation = ecef ? new EcefLocation(ecef) : undefined;
  }

  /** @internal */
  public notifyGeographicCoordinateSystemChanged(gcs: GeographicCRSProps | undefined) {
    this._iModel.geographicCoordinateSystem = gcs ? new GeographicCRS(gcs) : undefined;
  }
}
