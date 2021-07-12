/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Notification
 */

import "./ValidationTextbox.scss";
import classnames from "classnames";
import * as React from "react";
import { SpecialKey } from "@bentley/ui-abstract";
import { CommonProps } from "@bentley/ui-core";
import { MessageManager } from "../messages/MessageManager";

/** Enum for Input Status used in [[ValidationTextbox]]
 * @alpha
 */
export enum InputStatus {
  Valid = 0,
  Invalid = 1,
}

/** Property interface for ValidationTextbox
 * @alpha
 */
interface ValidationTextboxProps extends CommonProps {
  /** value to set ValidationTextbox to initially */
  initialValue?: string;
  /** placeholder value to show in gray before anything is entered in */
  placeholder?: string;
  /** triggered when the content of ValidationTextbox is changed. Return true if valid */
  onValueChanged?: (value: string) => InputStatus;
  /** listens for <Enter> key presses */
  onEnterPressed?: () => void;
  /** listens for <Esc> key presses */
  onEscPressed?: () => void;
  /** width of ValidationTextbox, measured in em */
  size?: number;
  /** Error message to display */
  errorText?: string;
  /** Detailed error message to display */
  detailedErrorText?: string;
}

interface ValidationTextboxState {
  isValid: boolean;
}

/**
 * Input box that validates text based on provided criteria. Defaults to checking
 * for empty if no method for onValueChanged is provided.
 * @alpha
 */
export class ValidationTextbox extends React.PureComponent<ValidationTextboxProps, ValidationTextboxState> {
  constructor(props: ValidationTextboxProps) {
    super(props);

    this.state = { isValid: true };
  }

  /** @internal */
  public override render(): React.ReactNode {
    const sizeStyle: React.CSSProperties = {
      width: this.props.size ? `${this.props.size.toString()}em` : "12em",
    };
    const divStyle: React.CSSProperties = {
      ...sizeStyle,
      ...this.props.style,
    };

    const validClassNames = classnames(
      "ValidationTextbox-input",
    );

    const invalidClassNames = classnames(
      "ValidationTextbox-input",
      "ValidationTextbox-invalid",
    );

    return (
      <div
        className={classnames("uifw-ValidationTextbox", this.props.className)}
        style={divStyle}>
        <input
          className={this.state.isValid ? validClassNames : invalidClassNames}
          onChange={this._validateText}
          onKeyUp={this._handleKeyUp}
          onPaste={this._validateText}
          onCut={this._validateText}
          onBlur={this._validateText}
          placeholder={this.props.placeholder ? this.props.placeholder : ""}
          style={sizeStyle}
        />
        {this.props.children}
      </div>
    );
  }

  private processValidateText(target: HTMLInputElement | undefined): void {
    // istanbul ignore next
    if (undefined === target)
      return;

    const value = target.value;
    const isValid = this._calculateIsValid(value);

    this.setState({ isValid }, () => {
      if (this.state.isValid) {
        this._hideErrorMessage();
      } else {
        // istanbul ignore else
        if (this.props.errorText && !this.state.isValid)
          this._showErrorMessage(target);
      }
    });
  }

  /**
   * Determines if value is valid and resolves any defined functions.
   * Also will show or hide error message if defined.
   * @param event   Button press event that triggers validation
   */
  private _validateText = (event?: any): void => {
    this.processValidateText(event.target as HTMLInputElement);
  };

  /**
   * Determines if value provided is valid by calling user defined
   * function. If no function is provided, the default criteria for
   * validity is if the value has been defined.
   * @param value   The value provided in textbox
   */
  private _calculateIsValid(value: string): boolean {
    if (this.props.onValueChanged)
      return (this.props.onValueChanged(value) === InputStatus.Valid) ? /* istanbul ignore next */ true : false;
    return value.length > 0;
  }

  /** Hides error message */
  private _hideErrorMessage() {
    MessageManager.hideInputFieldMessage();
  }

  /** Displays error message. */
  private _showErrorMessage(target: Element) {
    MessageManager.displayInputFieldMessage(target as HTMLElement, this.props.errorText!, this.props.detailedErrorText);
    return;
  }

  /**
   * Manages special key codes by calling user defined functions
   * @param event   Keyup event
   */
  private _handleKeyUp = (event: React.KeyboardEvent<HTMLInputElement>) => {
    this.processValidateText(event.target as HTMLInputElement);

    switch (event.key) {
      case SpecialKey.Escape:
        // istanbul ignore else
        if (this.props.onEscPressed)
          this.props.onEscPressed();
        break;
      case SpecialKey.Enter:
        // istanbul ignore else
        if (this.props.onEnterPressed)
          this.props.onEnterPressed();
        break;
    }
  };
}
