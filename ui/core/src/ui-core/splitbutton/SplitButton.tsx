/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module SplitButton
 */

import "./SplitButton.scss";
import classnames from "classnames";
import * as React from "react";
import { PopupContextMenu } from "../contextmenu/PopupContextMenu";
import { Icon, IconSpec } from "../icons/IconComponent";
import { CommonProps } from "../utils/Props";
import { RelativePosition, SpecialKey } from "@bentley/ui-abstract";
import { ButtonType, getButtonTypeClassName } from "../button/Button";

// TODO: implement
/** @internal */
export enum SplitButtonActionType {
  ContextMenu, // eslint-disable-line @typescript-eslint/no-shadow
  List,
}

/** Properties for [[SplitButton]] component
 * @public
 */
export interface SplitButtonProps extends CommonProps {
  /** Label to display in click area. */
  label: string | React.ReactNode;
  /** Listens for click events on button area */
  onClick?: (event: any) => any;
  /** Listens for execute on button area */
  onExecute?: () => any;
  /** Specifies icon for Splitbutton component */
  icon?: IconSpec;
  /** Indicates whether to draw a border around the button */
  drawBorder?: boolean;
  /** ToolTip text */
  toolTip?: string;
  /** Direction relative to the button to which the popup is expanded (defaults to Bottom) */
  popupPosition?: RelativePosition;
  /** 4 styles to tweak the content of the button */
  buttonType?: ButtonType;

  /** @internal */
  initialExpanded?: boolean;
}

/** @internal */
interface SplitButtonState {
  expanded: boolean;
}

/**
 * SplitButton with an action button on the left and an arrow button that displays a context menu on the right.
 * @public
 */
export class SplitButton extends React.Component<SplitButtonProps, SplitButtonState> {
  private _arrowElement = React.createRef<HTMLDivElement>();
  private _buttonRef = React.createRef<HTMLDivElement>();
  private _closing: boolean = false;

  /** @internal */
  public override readonly state: Readonly<SplitButtonState> = { expanded: false };

  constructor(props: SplitButtonProps) {
    super(props);

    this.state = {
      expanded: props.initialExpanded !== undefined ? props.initialExpanded : false,
    };
  }

  public override render(): JSX.Element {
    let icon = (<></>);
    if (this.props.icon !== undefined) {
      icon = (
        <Icon iconSpec={this.props.icon} />
      );
    }

    const borderClassName = (this.props.drawBorder && this.props.buttonType === undefined) ? "core-split-button-border" : undefined;
    const typeClassName = this.props.buttonType !== undefined ? getButtonTypeClassName(this.props.buttonType) : "core-split-button-default-colors";
    const classNames = classnames(
      "core-split-button",
      typeClassName,
      borderClassName,
      this.state.expanded && "core-expanded",
      this.props.className);
    const position = this.props.popupPosition !== undefined ? this.props.popupPosition : RelativePosition.BottomLeft;

    return (
      <div data-testid="core-split-button-root" title={this.props.toolTip}
        className={classNames}
        style={this.props.style}
        tabIndex={0}
        onKeyUp={this._handleKeyUp}
        ref={this._buttonRef}
        role="button"
      >
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <div data-testid="core-split-button-label" onClick={this.props.onClick}
          className={classnames("core-split-button-label", this.props.drawBorder && "core-split-button-border")}
          role="button" tabIndex={-1}
        >
          {icon} {this.props.label}
        </div>
        <div className={classnames("core-split-button-divider", this.props.drawBorder && "core-split-button-border")} />
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <div className={"core-split-button-arrow"} ref={this._arrowElement} onClick={this._handleArrowClick}
          role="button" tabIndex={-1}
        >
          <div className={classnames("core-split-button-arrow-icon", "icon", "icon-chevron-down")} />
          <PopupContextMenu
            position={position}
            target={this._buttonRef.current}
            animate={false}
            selectedIndex={0}
            onSelect={this._handleClose}
            onOutsideClick={this._handleClose}
            onEsc={this._handleClose}
            isOpen={this.state.expanded}
            autoflip={false}>
            {this.props.children}
          </PopupContextMenu>
        </div>
      </div>
    );
  }

  private _handleKeyUp = (event: React.KeyboardEvent) => {
    if (event.key === SpecialKey.Enter) {
      this.props.onExecute && this.props.onExecute();
    } else if (event.key === SpecialKey.ArrowDown && !this.state.expanded) {
      this._closing = false;
      this._open();
    } else {
      this._closing = false;
    }
  };

  private _open = () => {
    // istanbul ignore else
    if (!this.state.expanded && !this._closing) {
      this.setState({ expanded: true });
    } else {
      this._closing = false;
    }
  };

  private _handleArrowClick = (event: React.MouseEvent) => {
    if (this.state.expanded) {
      event.stopPropagation();
      this.setState({ expanded: false });
      this._closing = false;
    } else {
      this._open();
    }
  };

  private _handleClose = (event: any) => {
    // istanbul ignore else
    if (this._arrowElement.current && this._buttonRef.current) {
      // istanbul ignore next
      if (this.state.expanded && "target" in event && this._arrowElement.current.contains(event.target))
        this._closing = true;
      this.setState((_prevState) => ({ expanded: false }));
      this._buttonRef.current.focus();
    }
  };
}
