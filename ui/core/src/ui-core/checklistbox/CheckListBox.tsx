/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module CheckListBox
 */

import "./CheckListBox.scss";
import classnames from "classnames";
import * as React from "react";
import { Checkbox } from "@itwin/itwinui-react";
import { CommonProps } from "../utils/Props";

/** Properties for the [[CheckListBoxItem]] component
 * @public
 */
export interface CheckListBoxItemProps extends CommonProps {
  /** Label */
  label: string;
  /** Indicates whether the item is checked or not */
  checked?: boolean;
  /** Indicates whether the item is disabled or not */
  disabled?: boolean;
  /** Function called when item is clicked. */
  onClick?: () => any;
  /** Function called when item is changed. */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => any;
}

/** Item with a checkbox added to a [[CheckListBox]].
 * @public
 */
export class CheckListBoxItem extends React.PureComponent<CheckListBoxItemProps> {
  public override render() {
    const className = classnames("core-chk-listboxitem-checkbox", this.props.className);
    return (
      <li>
        <Checkbox checked={this.props.checked} disabled={this.props.disabled}
          className={className} style={this.props.style}
          label={this.props.label} onClick={this.props.onClick} onChange={this.props.onChange}
          data-testid="core-chk-listboxitem-checkbox" />
      </li>
    );
  }
}

/** Separator added to a [[CheckListBox]].
 * @public
 */
export function CheckListBoxSeparator() {
  return (
    <div className="core-chk-listbox-separator" />
  );
}

/** React component showing a list of Checkbox items.
 * @public
 */
export class CheckListBox extends React.PureComponent<CommonProps> {
  public override render() {
    const className = classnames("core-chk-listbox", this.props.className);
    return (
      <ul className={className} style={this.props.style}>
        {this.props.children}
      </ul>
    );
  }
}
