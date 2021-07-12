/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Dialog
 */

import "./MessageBox.scss";
import classnames from "classnames";
import * as React from "react";
import { Dialog, DialogButtonDef } from "../dialog/Dialog";
import { CommonProps } from "../utils/Props";

/** Message Severity enum.
 * @public
 */
export enum MessageSeverity {
  None = 0,
  Information = 1,
  Question = 2,
  Warning = 3,
  Error = 4,
  Fatal = 5,
}

/** Properties for the [[MessageBox]] component
 * @public
 */
export interface MessageBoxProps extends CommonProps {
  /** Severity of MessageBox */
  severity: MessageSeverity;
  /** whether to show dialog or not */
  opened: boolean;
  /** List of [[DialogButtonDef]] objects specifying buttons and associated onClick events */
  buttonCluster: DialogButtonDef[];
  /** Title to show in title bar of dialog  */
  title?: string | JSX.Element;
  /** onClick event for X button for dialog */
  onClose?: () => void;
  /** 'keyup' event for <Esc> key */
  onEscape?: () => void;
  /** minimum width that the dialog may be resized to. Default: 400 */
  minWidth?: number;
  /** minimum height that the dialog may be resized to. Default: 400 */
  minHeight?: number;
  /** initial width of dialog.
   * Displayed in px if value is a number, otherwise displayed in specified CSS unit.
   * Default: "50%"
   */
  width?: string | number;
  /** initial height of dialog.
   * Displayed in px if value is a number, otherwise displayed in specified CSS unit.
   * Default: ""
   */
  height?: string | number;
  /** Whether to show background overlay. Default: true */
  modal?: boolean;
  /** Custom CSS class name for the content */
  contentClassName?: string;
  /** Custom CSS Style for the content */
  contentStyle?: React.CSSProperties;
}

/** Message Box React component.
 * @public
 */
export class MessageBox extends React.PureComponent<MessageBoxProps> {
  public static defaultProps: Partial<MessageBoxProps> = {
    minWidth: 400,
    minHeight: 400,
    width: "512px",
    modal: true,
  };

  public override render(): JSX.Element {
    return (
      <Dialog
        title={this.props.title}
        buttonCluster={this.props.buttonCluster}
        opened={this.props.opened}
        width={this.props.width}
        onClose={this.props.onClose}
        onEscape={this.props.onEscape}
        modal={this.props.modal}
        className={this.props.className}
        style={this.props.style} >
        <MessageContainer severity={this.props.severity} className={this.props.contentClassName} style={this.props.contentStyle}>
          {this.props.children}
        </MessageContainer>
      </Dialog>
    );
  }
}

/** Properties for the [[MessageContainer]] component
 * @public
 */
export interface MessageContainerProps extends CommonProps {
  severity: MessageSeverity;
}

/** Message Container React component.
 * @public
 */
export class MessageContainer extends React.PureComponent<MessageContainerProps> {
  public static getIconClassName(severity: MessageSeverity, hollow?: boolean): string {
    let iconClassName = "";

    switch (severity) {
      case MessageSeverity.None:
        iconClassName = hollow ? "icon-status-success-hollow" : "icon-status-success" + " core-message-box-success";
        break;
      case MessageSeverity.Information:
        iconClassName = hollow ? "icon-info-hollow" : "icon-info" + " core-message-box-information";
        break;
      case MessageSeverity.Question:
        iconClassName = hollow ? "icon-help-hollow" : "icon-help" + " core-message-box-question";
        break;
      case MessageSeverity.Warning:
        iconClassName = hollow ? "icon-status-warning" : "icon-status-warning" + " core-message-box-warning";  // TODO - need icon-status-warning-hollow icon
        break;
      case MessageSeverity.Error:
        iconClassName = hollow ? "icon-status-error-hollow" : "icon-status-error" + " core-message-box-error";
        break;
      case MessageSeverity.Fatal:
        iconClassName = hollow ? "icon-status-rejected" : "icon-status-rejected" + " core-message-box-fatal";
        break;
    }

    return iconClassName;
  }

  public override render(): JSX.Element {
    const iconClassName = classnames(
      "icon",
      "core-message-box-icon",
      MessageContainer.getIconClassName(this.props.severity),
    );

    return (
      <div className="core-message-box-container">
        <div className={iconClassName} />
        <div className={classnames("core-message-box-content", this.props.className)} style={this.props.style}>
          {this.props.children}
        </div>
      </div>
    );
  }
}
