/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Dialog
 */

import { BeUiEvent } from "@bentley/bentleyjs-core";
import { DialogPropertyItem, DialogPropertySyncItem } from "./DialogItem";

/** Sync UI Control Properties Event class.
 * @public
 */
export class SyncPropertiesChangeEvent extends BeUiEvent<SyncPropertiesChangeEventArgs> { }

/** [[UiDataProvider]] Abstract class that allows property values to be passed between hosting API and UI.
 * @public
 */
// istanbul ignore next
export abstract class UiDataProvider {
  /** Called by UI to inform data provider of changes. */
  public processChangesInUi(_properties: DialogPropertyItem[]): PropertyChangeResult {
    throw (new Error("Derived UiDataProvider must implement this method to apply changes to a bulk set of properties."));
  }

  /** Get Sync UI Control Properties Event */
  public onSyncPropertiesChangeEvent = new SyncPropertiesChangeEvent();

  public onItemsReloadedEvent = new BeUiEvent<void>();

  /** Called by UI to validate a property value */
  public validateProperty(_item: DialogPropertyItem): PropertyChangeResult {
    return { status: PropertyChangeStatus.Success };
  }

  /** Called to sync properties synchronously if a UiDataProvider is active for the UI */
  public syncProperties(syncProperties: DialogPropertySyncItem[]) {
    this.fireSyncPropertiesEvent(syncProperties);
  }

  /** Called to inform listener that the UiDataProvider has updated values for the UI */
  public fireSyncPropertiesEvent(syncProperties: DialogPropertySyncItem[]) {
    this.onSyncPropertiesChangeEvent.emit({ properties: syncProperties });
  }

  /** Called to inform listeners that new properties are ready for display in UI.
   */
  public fireItemsReloadedEvent() {
    this.onItemsReloadedEvent.emit();
  }

  /** Used to pass properties between a tool and an explicity defined UI dialog. See method supplyDialogItems in [[UiLayoutDataProvider]] for supplying
   * properties that will be used to dynamically create and layout control in a Dialog or Widget.
   */
  public supplyAvailableProperties(): DialogPropertyItem[] {
    throw (new Error("Derived UiDataProvider that want to use DialogPropertyItems must implement this method. Not for use with dynamic UI controls."));
  }
}

/** Sync UI Control Properties Event Args interface.
 * @public
 */
export interface SyncPropertiesChangeEventArgs {
  properties: DialogPropertySyncItem[];
}

/** Status of Proposed property changes from UI to UiDataProvider
 * @public
 */
export enum PropertyChangeStatus {
  /** Property Change(s) Succeeded */
  Success = 0,
  /** Error Processing Property Change(s) */
  Error = 2,
}

/** Interface used by UiDataProvider to report change status (validation) to UI.
 * @public
 */
export interface PropertyChangeResult {
  errorMsg?: string;
  status: PropertyChangeStatus;
}
