/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Checkbox
 */

import classnames from "classnames";
import * as React from "react";
import { InputStatus } from "../inputs/InputStatus";
import { CommonProps } from "../utils/Props";
import { Omit } from "../utils/typeUtils";
import { mergeRefs } from "../utils/hooks/useRefs";

/** Properties for [[Checkbox]] React component
 * @public
 * @deprecated Use CheckboxProps in itwinui-react instead
 */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onClick" | "onBlur">, CommonProps {
  /** Text that will be shown next to the checkbox. */
  label?: string;
  /** Indicates checkbox is in an Indeterminate or Partial state, regardless of the `checked` state */
  indeterminate?: boolean;
  /** Input status like: "Success", "Warning" or "Error" */
  status?: InputStatus;
  /** Custom CSS class name for the checkbox input element */
  inputClassName?: string;
  /** Custom CSS Style for the checkbox input element */
  inputStyle?: React.CSSProperties;
  /** Custom CSS class name for the label element */
  labelClassName?: string;
  /** Custom CSS Style for the label element */
  labelStyle?: React.CSSProperties;
  /**
   * Event called when checkbox is clicked on. This is a good event to
   * use for preventing the action from bubbling to component's parents.
   */
  onClick?: (e: React.MouseEvent) => void;
  /** Event called when checkbox loses focus. */
  onBlur?: (e: React.FocusEvent) => void;
  /** Indicates whether the checkbox should set focus */
  setFocus?: boolean;
  /** Provides ability to return reference to HTMLInputElement */
  inputRef?: React.Ref<HTMLInputElement>;
}

/** A React component that renders a simple checkbox with label.
 * It is a wrapper for the `<input type="checkbox">` HTML element.
 * @public
 * @deprecated Use Checkbox in itwinui-react instead
 */
export class Checkbox extends React.PureComponent<CheckboxProps> {  // eslint-disable-line deprecation/deprecation
  private _checkboxInput = React.createRef<HTMLInputElement>();
  private _refs = mergeRefs(this._checkboxInput);

  /** @internal */
  constructor(props: CheckboxProps) { // eslint-disable-line deprecation/deprecation
    super(props);

    if (props.inputRef)
      this._refs = mergeRefs(this._checkboxInput, props.inputRef);
  }

  private _onCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  private _onCheckboxBlur = (e: React.FocusEvent) => {
    e.stopPropagation();
  };

  private _setIndeterminate(indeterminate: boolean) {
    // istanbul ignore else
    if (this._checkboxInput.current)
      this._checkboxInput.current.indeterminate = indeterminate;
  }

  public override componentDidMount() {
    if (this.props.indeterminate !== undefined)
      this._setIndeterminate(this.props.indeterminate);

    if (this.props.setFocus && this._checkboxInput.current)
      this._checkboxInput.current.focus();
  }

  /** @internal */
  public override componentDidUpdate(_prevProps: CheckboxProps) {  // eslint-disable-line deprecation/deprecation
    if (this.props.indeterminate !== undefined)
      this._setIndeterminate(this.props.indeterminate);
  }

  public override render() {
    const { status, disabled, label, indeterminate, className, inputClassName, inputStyle, labelClassName, labelStyle, // eslint-disable-line @typescript-eslint/no-unused-vars
      onClick, onBlur, setFocus, inputRef, ...inputProps } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars
    const checkBoxClass = classnames("core-checkbox",
      disabled && "core-disabled",
      !label && "core-checkbox-no-label",
      status,
      className);

    return (
      /* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
      /* eslint-disable-next-line jsx-a11y/click-events-have-key-events */
      <label className={checkBoxClass} onClick={onClick} onBlur={onBlur}>
        {label &&
          <span className="core-checkbox-label">{label}</span>
        }
        <input type="checkbox" ref={this._refs} {...inputProps}
          disabled={disabled} className={inputClassName} style={inputStyle}
          onClick={this._onCheckboxClick} onBlur={this._onCheckboxBlur} />
        <span className="core-checkbox-checkmark"></span>
      </label >
    );
  }
}
