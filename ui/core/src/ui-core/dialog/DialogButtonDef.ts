/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Dialog
 */

/** Enum for button types. Determines button label, and default button style.
  * @public
  * @deprecated Use DialogButtonType in bentley/ui-abstract instead
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
  * @deprecated Use DialogButtonStyle in bentley/ui-abstract instead
  */
export enum DialogButtonStyle {
  None = "",
  Primary = "iui-cta",
  Hollow = "iui-default",
  Blue = "iui-high-visibility",
}

/** Interface for a dialog button in a button cluster
  * @public
  * @deprecated Use DialogButtonDef in bentley/ui-abstract instead
  */
export interface DialogButtonDef {
  /** type of button */
  type: DialogButtonType;             // eslint-disable-line deprecation/deprecation
  /** Triggered on button click */
  onClick: () => void;
  /** Which button style to decorate button width */
  buttonStyle?: DialogButtonStyle;    // eslint-disable-line deprecation/deprecation
  /** Disable the button */
  disabled?: boolean;
  /** Custom label */
  label?: string;
  /** Custom CSS class */
  className?: string;
}
