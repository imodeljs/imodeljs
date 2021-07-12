/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Dialog
 */

import * as React from "react";
import { MessageBoxIconType, MessageBoxType, MessageBoxValue } from "@bentley/imodeljs-frontend";
import { CommonProps, DialogButtonDef, DialogButtonType, MessageBox, MessageSeverity } from "@bentley/ui-core";
import { ModalDialogManager } from "./ModalDialogManager";

/** Properties for [[StandardMessageBox]] React component
 * @public
 */
export interface StandardMessageBoxProps extends CommonProps {
  /** Indicates whether the message box is open */
  opened: boolean;
  /** The standard icon to display in the message box */
  iconType: MessageBoxIconType;
  /** Title to display in the message box */
  title: string;
  /** Controls the button set displayed */
  messageBoxType: MessageBoxType;
  /** Callback function for processing the message box result */
  onResult?: (result: MessageBoxValue) => void;
}

/** State for [[StandardMessageBox]] React component
 * @internal
 */
interface StandardMessageBoxState {
  opened: boolean;
}

/** StandardMessageBox React component displays a standard icon, message text and a standard button set in the lower right.
 * @public
 */
export class StandardMessageBox extends React.PureComponent<StandardMessageBoxProps, StandardMessageBoxState> {

  /** @internal */
  public override readonly state: Readonly<StandardMessageBoxState>;

  constructor(props: StandardMessageBoxProps) {
    super(props);
    this.state = {
      opened: this.props.opened,
    };
  }

  public override render(): JSX.Element {
    const buttonCluster: DialogButtonDef[] = new Array<DialogButtonDef>();

    switch (this.props.messageBoxType) {
      case MessageBoxType.Ok:
      case MessageBoxType.LargeOk:
        buttonCluster.push({ type: DialogButtonType.OK, onClick: () => { this._handleButton(MessageBoxValue.Ok); } });
        break;
      case MessageBoxType.OkCancel:
      case MessageBoxType.MediumAlert:
        buttonCluster.push({ type: DialogButtonType.OK, onClick: () => { this._handleButton(MessageBoxValue.Ok); } });
        buttonCluster.push({ type: DialogButtonType.Cancel, onClick: () => { this._handleButton(MessageBoxValue.Cancel); } });
        break;
      case MessageBoxType.YesNo:
      case MessageBoxType.YesNoCancel:
        buttonCluster.push({ type: DialogButtonType.Yes, onClick: () => { this._handleButton(MessageBoxValue.Yes); } });
        buttonCluster.push({ type: DialogButtonType.No, onClick: () => { this._handleButton(MessageBoxValue.No); } });
        if (MessageBoxType.YesNoCancel === this.props.messageBoxType)
          buttonCluster.push({ type: DialogButtonType.Cancel, onClick: () => { this._handleButton(MessageBoxValue.Cancel); } });
        break;
    }

    let severity = MessageSeverity.None;
    switch (this.props.iconType) {
      case MessageBoxIconType.NoSymbol:
        severity = MessageSeverity.None;
        break;
      case MessageBoxIconType.Information:
        severity = MessageSeverity.Information;
        break;
      case MessageBoxIconType.Question:
        severity = MessageSeverity.Question;
        break;
      case MessageBoxIconType.Warning:
        severity = MessageSeverity.Warning;
        break;
      case MessageBoxIconType.Critical:
        severity = MessageSeverity.Error;
        break;
    }

    return (
      <MessageBox
        className={this.props.className}
        style={this.props.style}
        opened={this.state.opened}
        title={this.props.title}
        severity={severity}
        buttonCluster={buttonCluster}
        onClose={this._handleCancel}
        onEscape={this._handleCancel}
      >
        {this.props.children}
      </MessageBox>
    );
  }

  private _handleButton = (buttonType: MessageBoxValue) => {
    this._closeDialog(() => {
      // istanbul ignore else
      if (this.props.onResult)
        this.props.onResult(buttonType);
    });
  };

  private _handleCancel = () => {
    this._closeDialog(() => {
      // istanbul ignore else
      if (this.props.onResult)
        this.props.onResult(MessageBoxValue.Cancel);
    });
  };

  private _closeDialog = (followUp: () => void) => {
    this.setState((_prevState) => ({
      opened: false,
    }), () => {
      ModalDialogManager.closeDialog();
      followUp();
    });
  };
}
