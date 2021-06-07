/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Dialog
 */

import { PropertyDescription } from "../properties/Description";

/** [[DialogItemValue]] Interface of PrimitiveValue types that have type editor support for use in dialogs
 * @public
 */
export interface DialogItemValue {
  value?: number | string | boolean | Date;
  displayValue?: string;
}
/** [[EditorPosition]] Interface used to identify the location of the item a DialogItem property value.
 * @public
 */
export interface EditorPosition {
  /** Determine the order the row is shown in UI */
  rowPriority: number;
  /** Determines the column position for the type editor */
  columnIndex: number;
  /** Number of columns to occupy. Defaults to 1
   * @deprecated
   */
  columnSpan?: number;
}

/** [[BaseDialogItem]] contains only the members necessary to create a PropertyRecord.
 * @public
 */
export interface BaseDialogItem {
  readonly value: DialogItemValue;
  readonly property: PropertyDescription;
  readonly isDisabled?: boolean;
}
/** [[DialogItem]] is the specification that the display engine turns into a UI item
 * @public
 */
export interface DialogItem extends BaseDialogItem {
  readonly editorPosition: EditorPosition;
  readonly lockProperty?: BaseDialogItem;
}

/** [[DialogPropertyItem]] us the specification to use if you are defining the components directly, e.g., in React
 * @public
 */
export interface DialogPropertyItem {
  readonly value: DialogItemValue;
  readonly propertyName: string;
}

/** [[DialogPropertySyncItem]] is used to pass sync messages for DialogPropertyItems
 * @public
 */
export interface DialogPropertySyncItem extends DialogPropertyItem {
  readonly isDisabled?: boolean;
  readonly property?: PropertyDescription;
}

/** [[DialogProperty]] is a generic helper class that assists working with properties used by UiLayoutDataProvider implementations (i.e. Tool Settings and Dynamic Dialogs).
 * @public
 */
export class DialogProperty<T> {
  constructor(public description: PropertyDescription, private _value: T, private _displayValue?: string, private _isDisabled?: boolean) { }

  public get isDisabled() {
    return !!this._isDisabled;
  }

  public set isDisabled(val: boolean) {
    this._isDisabled = val;
  }

  public get value() {
    return this._value;
  }

  public set value(val: T) {
    this._value = val;
  }

  public get name() {
    return this.description.name;
  }

  public set displayValue(val: string | undefined) {
    this._displayValue = val;
  }

  public get displayValue() {
    return this._displayValue;
  }

  public get dialogItemValue() {
    // istanbul ignore else
    if (typeof this._value === "string" || typeof this._value === "number" || typeof this._value === "undefined" || typeof this._value === "boolean" || this._value instanceof Date)
      return {
        value: this._value,
        displayValue: this._displayValue,
      } as DialogItemValue;
    // istanbul ignore next
    throw new Error("Not valid primitive type");
  }

  public set dialogItemValue(val: DialogItemValue) {
    this._value = val.value as unknown as T;
    this._displayValue = val.displayValue;
  }

  public get syncItem(): DialogPropertySyncItem {
    const isDisabled = this._isDisabled;
    return { propertyName: this.name, value: this.dialogItemValue, isDisabled };
  }

  public toDialogItem(editorPosition: EditorPosition, lockProperty?: DialogItem): DialogItem {
    return { value: this.dialogItemValue, property: this.description, editorPosition, isDisabled: this._isDisabled, lockProperty };
  }
}
