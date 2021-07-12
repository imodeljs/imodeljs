/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Dialog
 */

import { BeUiEvent } from "@bentley/bentleyjs-core";
import { PropertyEditorParams, PropertyEditorParamTypes, SuppressLabelEditorParams } from "../properties/EditorParams";
import { PropertyRecord } from "../properties/Record";
import { PrimitiveValue, PropertyValueFormat } from "../properties/Value";
import { BaseDialogItem, DialogItem, DialogPropertyItem, DialogPropertySyncItem } from "./DialogItem";
import { PropertyChangeResult, PropertyChangeStatus, UiDataProvider } from "./UiDataProvider";

/** Enum for button types. Determines button label, and default button style.
 * @public
 */
export enum DialogButtonType {
  None = "",
  Close = "close",
  OK = "ok",
  Cancel = "cancel",
  Yes = "yes",
  No = "no",
  Retry = "retry",
  Next = "next",
  Previous = "previous"
}

/** Enum for button style.
 * @public
 */
export enum DialogButtonStyle {
  None = "",
  Primary = "uicore-buttons-primary",
  Hollow = "uicore-buttons-hollow",
  Blue = "uicore-buttons-blue",
}

/** Interface for a dialog button in a button cluster
 * @public
 */
export interface DialogButtonDef {
  /** type of button */
  type: DialogButtonType;
  /** Triggered on button click */
  onClick: () => void;
  /** Which button style to decorate button width */
  buttonStyle?: DialogButtonStyle;
  /** Disable the button */
  disabled?: boolean;
  /** Custom label */
  label?: string;
  /** Custom CSS class */
  className?: string;
}

/** [[DialogRow]] is the interface that groups dialog items into rows for building UI
 * @public
 */
export interface DialogRow {
  priority: number;
  items: DialogItem[];
}

/**
 * @public
 */
export abstract class UiLayoutDataProvider extends UiDataProvider {
  private _items: ReadonlyArray<DialogItem> | undefined;

  /** Applies changes from one or more properties - some dialogs will use this to send a bulk set of changes back to the provider */
  public override processChangesInUi(properties: DialogPropertyItem[]): PropertyChangeResult {
    // Default implementation is to just pass each property to applyUiPropertyChange
    properties.forEach((property) => this.applyUiPropertyChange(property));
    return { status: PropertyChangeStatus.Success };
  }

  /** Applies change of a single property - this is the default method used when property editors are dynamically generated. */
  // istanbul ignore next
  public applyUiPropertyChange = (_updatedValue: DialogPropertySyncItem): void => {
    throw (new Error("Derived UiDataProvider should implement this to apply change to a single property."));
  };

  private _rows: DialogRow[] | undefined;

  /** Array of dialog rows */
  public get rows(): DialogRow[] {
    if (!this._rows) {
      this._rows = this.layoutDialogRows();
    }
    return this._rows;
  }

  protected loadItemsInternal(items: ReadonlyArray<DialogItem> | undefined) {
    this._items = items ? items : [];
    this._rows = this.layoutDialogRows();
  }

  /** Called by UI to request available properties that can be bound to user supplied UI components (See Tool1UiProvider for example). */
  // istanbul ignore next
  public supplyDialogItems(): DialogItem[] | undefined {
    throw (new Error("Derived UiDataProvider must implement this method to supply set of properties."));
  }

  public get items(): ReadonlyArray<DialogItem> {
    if (undefined === this._items) {
      this.loadItemsInternal(this.supplyDialogItems());
    }
    return this._items!;
  }

  /** Called to inform listeners that new properties are ready for display in UI. */
  public reloadDialogItems(emitEvent = true) {
    this.loadItemsInternal(this.supplyDialogItems());
    // istanbul ignore else
    if (emitEvent)
      this.fireItemsReloadedEvent();
  }

  /**
   * @internal
   */
  public layoutDialogRows(): DialogRow[] {
    const rows: DialogRow[] = [];

    this.items.forEach((item) => {
      const row = rows.find((value) => value.priority === item.editorPosition.rowPriority);
      if (row) {
        row.items.push(item);
      } else {
        rows.push({ priority: item.editorPosition.rowPriority, items: [item] });
      }
    });

    // sort rows
    rows.sort((a: DialogRow, b: DialogRow) => a.priority - b.priority);
    // sort records
    rows.forEach((row: DialogRow) => row.items.sort((a: DialogItem, b: DialogItem) => a.editorPosition.columnIndex - b.editorPosition.columnIndex));
    return rows;
  }

  /** Determines if a dialog item editor wants a label */
  public static editorWantsLabel(item: DialogItem): boolean {
    if (item.property.editor && item.property.editor.params) {
      const params = item.property.editor.params.find((param: PropertyEditorParams) => param.type === PropertyEditorParamTypes.SuppressEditorLabel) as SuppressLabelEditorParams;
      // istanbul ignore else
      if (params)
        return false;
    }
    return true;
  }

  /** Determines if a dialog items has an associated lock property */
  public static hasAssociatedLockProperty(item: DialogItem): boolean {
    return !!item.lockProperty;
  }

  /** Gets the disabled state for a given dialog item */
  public static getItemDisabledState(baseDialogItem: BaseDialogItem): boolean {
    const dialogItem = baseDialogItem as DialogItem;
    // istanbul ignore else
    if (dialogItem === undefined || dialogItem.lockProperty === undefined)
      return !!baseDialogItem.isDisabled;
    const value = dialogItem.lockProperty.value;
    // istanbul ignore next
    if (value === undefined)
      return !!baseDialogItem.isDisabled;

    return !value.value;
  }

  /** Gets a property record for a given dialog item */
  public static getPropertyRecord = (dialogItem: BaseDialogItem): PropertyRecord => {
    const propertyValue = { valueFormat: PropertyValueFormat.Primitive, value: dialogItem.value.value, displayValue: dialogItem.value.displayValue };
    const record = new PropertyRecord(propertyValue as PrimitiveValue, dialogItem.property);
    record.isDisabled = UiLayoutDataProvider.getItemDisabledState(dialogItem);
    return record;
  };

  /** Determines if a dialog row only contains button group editors */
  public static onlyContainButtonGroupEditors(row: DialogRow): boolean {
    for (const item of row.items) {
      // istanbul ignore else
      if (UiLayoutDataProvider.hasAssociatedLockProperty(item) || undefined === item.property.editor || "enum-buttongroup" !== item.property.editor.name || UiLayoutDataProvider.editorWantsLabel(item))
        return false;
    }
    return true;
  }
}

/** [[DialogLayoutDataProvider]] Abstract class that allows property values to be passed between hosting API and Dialog that generates and arranges components dynamically
 * including the buttons at the bottom of the dialog.
 * @public
 */
export abstract class DialogLayoutDataProvider extends UiLayoutDataProvider {
  public onButtonsReloadedEvent = new BeUiEvent<void>();

  /** Called to inform listeners that modal dialog button data needs to be refreshed. */
  public fireDialogButtonsReloadEvent() {
    this.onButtonsReloadedEvent.emit();
  }

  public supplyButtonData(): DialogButtonDef[] | undefined {
    // Derived class should override
    const buttons: DialogButtonDef[] = [];
    // istanbul ignore next
    buttons.push({ type: DialogButtonType.OK, onClick: () => { } });
    // istanbul ignore next
    buttons.push({ type: DialogButtonType.Cancel, onClick: () => { } });
    return buttons;
  }
}
