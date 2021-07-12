/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import "./PopupButton.scss";
import classnames from "classnames";
import * as React from "react";
import { RelativePosition, SpecialKey } from "@bentley/ui-abstract";
import { CommonDivProps, CommonProps, Div, Icon, Popup, UiCore } from "@bentley/ui-core";
import { Button } from "@itwin/itwinui-react";

/** Properties for [[PopupButton]] component
 * @alpha
 */
export interface PopupButtonProps extends CommonProps {
  /** Label to display in click area. */
  label?: string | React.ReactNode;
  /* Placeholder text used when there is no label yet */
  placeholder?: string;
  /** Contents of the popup */
  children: React.ReactNode;
  /** Title to display as tooltip. */
  title?: string;

  /** Set focus to popup - default is to set focus */
  moveFocus?: boolean;
  /** Element to receive focus, specified by React.RefObject or CSS selector string. If undefined and moveFocus is true then focus is moved to first focusable element. */
  focusTarget?: React.RefObject<HTMLElement> | string;

  /** Show or hide the box shadow (defaults to false) */
  showShadow?: boolean;
  /** Show or hide the arrow (defaults to false) */
  showArrow?: boolean;
  /** Indicates whether to set focus to the input element */
  setFocus?: boolean;
  /** Indicates whether to close the popup when Enter is pressed (defaults to true) */
  closeOnEnter?: boolean;

  /** Listens for click events on button area */
  onClick?: (event: React.MouseEvent) => void;
  /** Listens for popup close events */
  onClose?: () => void;
  /** Listens for Enter key in popup */
  onEnter?: () => void;
}

/** @internal */
interface PopupButtonState {
  showPopup: boolean;
}

/** PopupButton React component that is a button and property editor popup host
 * @alpha
 */
export class PopupButton extends React.PureComponent<PopupButtonProps, PopupButtonState> {
  private _buttonRef = React.createRef<HTMLDivElement>();

  /** @internal */
  public override readonly state: Readonly<PopupButtonState> = {
    showPopup: false,
  };

  /** @internal */
  public override componentDidMount() {
    if (this.props.setFocus && this._buttonRef.current)
      this._buttonRef.current.focus();
    this._buttonRef.current?.addEventListener("keydown", this._handleKeyDown);
  }

  /** @internal */
  public override componentWillUnmount() {
    // istanbul ignore next
    if (this._buttonRef.current)
      this._buttonRef.current.removeEventListener("keydown", this._handleKeyDown);
  }

  private _togglePopup = (event: React.MouseEvent) => {
    this.setState(
      (prevState) => ({ showPopup: !prevState.showPopup }),
      () => this.props.onClick && this.props.onClick(event));
  };

  public closePopup() {
    this._closePopup();
  }

  private _closePopup = () => {
    this.setState(
      { showPopup: false },
      () => {
        this.props.onClose && this.props.onClose();

        // istanbul ignore else
        if (this._buttonRef.current)
          this._buttonRef.current.focus();
      });
  };

  private _emptyKeyDown = (_event: React.KeyboardEvent) => {

  };
  private _handleKeyDown = (event: KeyboardEvent) => {
    // istanbul ignore else
    if ((event.key === SpecialKey.ArrowDown || event.key === SpecialKey.Space || event.key === SpecialKey.Enter) && !this.state.showPopup) {
      event.preventDefault();
      event.stopPropagation();
      this.setState({ showPopup: true });
    }
  };

  /** @internal */
  public override render(): React.ReactNode {
    const showArrow = this.props.showArrow ?? false;
    const showShadow = this.props.showShadow ?? false;
    const moveFocus = this.props.moveFocus ?? true;
    const showPlaceholder = this.props.label === undefined && this.props.placeholder !== undefined;

    const classNames = classnames(
      "components-popup-button",
      this.state.showPopup && "components-popup-expanded",
    );

    const valueClassNames = classnames(
      "components-popup-button-value",
      showPlaceholder && "components-popup-button-placeholder",
    );

    return (
      <div className={this.props.className}>
        <div className={classNames}
          onClick={this._togglePopup}
          onKeyDown={this._emptyKeyDown}
          data-testid="components-popup-button"
          tabIndex={0}
          ref={this._buttonRef}
          title={this.props.title}
          role="button"
        >
          <div className={valueClassNames}>
            {this.props.label || this.props.placeholder}
          </div>
          <div className={"components-popup-button-arrow"}>
            <div className={classnames("components-popup-button-arrow-icon", "icon", "icon-chevron-down")} />
          </div>
        </div>
        <Popup className="components-popup-button-popup" isOpen={this.state.showPopup} position={RelativePosition.Bottom}
          onClose={this._closePopup} onEnter={this.props.onEnter} closeOnEnter={this.props.closeOnEnter} target={this._buttonRef.current}
          showArrow={showArrow} showShadow={showShadow}
          moveFocus={moveFocus} focusTarget={this.props.focusTarget}
        >
          {this.props.children}
        </Popup>
      </div>

    );
  }
}

/** Popup content with padding
 * @alpha
 */
export function PopupContent(props: CommonDivProps) {
  return <Div {...props} mainClassName="components-editor-popup-content" />;
}

/** Properties for [[PopupOkCancelButtons]] component
 * @alpha
 */
export interface OkCancelProps {
  onOk: (event: React.MouseEvent) => void;
  onCancel: (event: React.MouseEvent) => void;
}

/** OK/Cancel Buttons
 * @alpha
 */
export function PopupOkCancelButtons(props: OkCancelProps) {
  return (
    <div className="components-popup-bottom-buttons">
      <Button
        className={classnames("components-popup-large-button", "components-popup-ok-button")}
        data-testid="components-popup-ok-button"
        styleType="cta"
        title={UiCore.translate("dialog.ok")}
        onClick={props.onOk}
      >
        <Icon iconSpec="icon-checkmark" />
      </Button>
      <Button
        className={classnames("components-popup-large-button", "components-popup-cancel-button")}
        data-testid="components-popup-cancel-button"
        title={UiCore.translate("dialog.cancel")}
        onClick={props.onCancel}
      >
        <Icon iconSpec="icon-remove" />
      </Button>
    </div>
  );
}
