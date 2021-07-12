/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Notification
 */

import "./InputField.scss";
import classnames from "classnames";
import * as React from "react";
import { OutputMessagePriority } from "@bentley/imodeljs-frontend";
import { RelativePosition } from "@bentley/ui-abstract";
import { Popup } from "@bentley/ui-core";
import { InputFieldMessageEventArgs, MessageManager } from "../messages/MessageManager";
import { MessageDiv } from "./MessageSpan";
import { NotifyMessageType } from "./ReactNotifyMessageDetails";

/** Properties of [[InputFieldMessage]] component.
 * @public
 */
interface InputFieldMessageProps {
  showCloseButton?: boolean;
}

/** [[InputFieldMessage]] state.
 * @internal
 */
interface InputFieldMessageState {
  isVisible: boolean;
  priority: OutputMessagePriority;
  message: NotifyMessageType;
  detailedMessage?: NotifyMessageType;
  inputFieldElement?: HTMLElement;
  showCloseButton?: boolean;
}

/** InputField message pops up near pointer when attempting an invalid interaction.
 * @public
 */
export class InputFieldMessage extends React.PureComponent<InputFieldMessageProps, InputFieldMessageState> {
  public override readonly state: Readonly<InputFieldMessageState> = {
    message: "",
    isVisible: false,
    priority: OutputMessagePriority.None,
    showCloseButton: !!this.props.showCloseButton,
  };

  public override render(): React.ReactNode {
    const { isVisible, inputFieldElement, message, priority, detailedMessage, showCloseButton } = this.state;

    if (!inputFieldElement || !message) {
      return null;
    }

    let iconClassName = "";
    switch (priority) {
      case OutputMessagePriority.Warning:
        iconClassName = "icon-status-warning";
        break;
      case OutputMessagePriority.Error:
        iconClassName = "icon-status-error";
        break;
      case OutputMessagePriority.Info:
        iconClassName = "icon-info";
        break;
    }

    return (
      <Popup
        isOpen={isVisible}
        position={RelativePosition.BottomLeft}
        onClose={this._onInputMessageClose}
        target={inputFieldElement}>
        <div className="uifw-popup-message-inputField">
          <div className="uifw-popup-message-inputField-content">
            <div className="uifw-popup-message-inputField-primary">
              {iconClassName &&
                <span className="uifw-popup-message-icon"> <i className={classnames("icon", iconClassName)} /> </span>
              }
              <span className="uifw-popup-message-text">
                <MessageDiv className="uifw-popup-message-brief" message={message} />
                {detailedMessage &&
                  <MessageDiv className="uifw-popup-message-detailed" message={detailedMessage} />
                }
              </span>
            </div>
          </div>
          {showCloseButton &&
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div className="uifw-popup-message-close" onClick={this._onInputMessageClose} role="button" tabIndex={-1}>
              <i className="icon icon-close" />
            </div>
          }
        </div>
      </Popup>);
  }

  public override componentDidMount(): void {
    MessageManager.onInputFieldMessageAddedEvent.addListener(this._handleInputFieldMessageAddedEvent);
    MessageManager.onInputFieldMessageRemovedEvent.addListener(this._handleInputFieldMessageRemovedEvent);
  }

  public override componentWillUnmount(): void {
    MessageManager.onInputFieldMessageAddedEvent.removeListener(this._handleInputFieldMessageAddedEvent);
    MessageManager.onInputFieldMessageRemovedEvent.removeListener(this._handleInputFieldMessageRemovedEvent);
  }

  private _onInputMessageClose = () => {
    this.setState({ isVisible: false });
  };

  private _handleInputFieldMessageAddedEvent = (args: InputFieldMessageEventArgs) => {
    this.setState({
      inputFieldElement: args.target as HTMLElement,
      message: args.messageText,
      isVisible: true,
      priority: args.priority,
      detailedMessage: args.detailedMessage,
    });
  };

  private _handleInputFieldMessageRemovedEvent = () => {
    this.setState({ isVisible: false });
  };
}
