/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module StatusBar
 */

import "./StatusBar.scss";
import * as React from "react";
import { CommonDivProps, CommonProps, Div, MessageSeverity } from "@bentley/ui-core";
import { Footer, Status } from "@bentley/ui-ninezone";
import { ActivityMessageEventArgs, MessageAddedEventArgs, MessageManager } from "../messages/MessageManager";
import { SafeAreaContext } from "../safearea/SafeAreaContext";
import { UiShowHideManager } from "../utils/UiShowHideManager";
import { StatusBarFieldId, StatusBarWidgetControl, StatusBarWidgetControlArgs } from "./StatusBarWidgetControl";
import { StatusMessage } from "../messages/StatusMessageManager";
import { StatusMessagesContainer } from "../messages/StatusMessagesContainer";

// cspell:ignore safearea

/** State for the [[StatusBar]] React component
 * @internal
 */
interface StatusBarState {
  openWidget: StatusBarFieldId;
  messages: ReadonlyArray<StatusMessage>;
  activityMessageInfo: ActivityMessageEventArgs | undefined;
  isActivityMessageVisible: boolean;
  toastTarget: HTMLElement | null;
}

/** Properties for the [[StatusBar]] React component
 * @public
 */
export interface StatusBarProps extends CommonProps {
  widgetControl?: StatusBarWidgetControl;
  isInFooterMode: boolean;
}

/** Status Bar React component.
 * @public
 */
export class StatusBar extends React.Component<StatusBarProps, StatusBarState> {

  public static severityToStatus(severity: MessageSeverity): Status {
    let status = Status.Information;

    switch (severity) {
      case MessageSeverity.None:
        status = Status.Success;
        break;
      case MessageSeverity.Information:
        status = Status.Information;
        break;
      case MessageSeverity.Warning:
        status = Status.Warning;
        break;
      case MessageSeverity.Error:
      case MessageSeverity.Fatal:
        status = Status.Error;
        break;
    }

    return status;
  }

  /** @internal */
  constructor(props: StatusBarProps) {
    super(props);

    this.state = {
      openWidget: null,
      messages: MessageManager.activeMessageManager.messages,
      activityMessageInfo: undefined,
      isActivityMessageVisible: false,
      toastTarget: null,
    };
  }

  public override render(): React.ReactNode {
    let footerSections: React.ReactNode = null;
    const widgetControl = this.props.widgetControl;

    // istanbul ignore else
    if (widgetControl && widgetControl.getReactNode) {
      footerSections = widgetControl.getReactNode({
        isInFooterMode: this.props.isInFooterMode,
        openWidget: this.state.openWidget,
        toastTargetRef: this._handleToastTargetRef,
        onOpenWidget: this._handleOpenWidget,
      });
    }

    return (
      <StatusBarContext.Provider value={{
        isInFooterMode: this.props.isInFooterMode,
        openWidget: this.state.openWidget,
        toastTargetRef: this._handleToastTargetRef,
        onOpenWidget: this._handleOpenWidget,
      }}>
        <SafeAreaContext.Consumer>
          {(safeAreaInsets) => (
            <Footer
              className={this.props.className}
              messages={this.getFooterMessages()}
              isInFooterMode={this.props.isInFooterMode}
              onMouseEnter={UiShowHideManager.handleWidgetMouseEnter}
              safeAreaInsets={safeAreaInsets}
              style={this.props.style}
            >
              {footerSections}
            </Footer>
          )}
        </SafeAreaContext.Consumer>
      </StatusBarContext.Provider>
    );
  }

  public override componentDidMount() {
    MessageManager.onMessageAddedEvent.addListener(this._handleMessageAddedEvent);
    MessageManager.onActivityMessageUpdatedEvent.addListener(this._handleActivityMessageUpdatedEvent);
    MessageManager.onActivityMessageCancelledEvent.addListener(this._handleActivityMessageCancelledEvent);
    MessageManager.onMessagesUpdatedEvent.addListener(this._handleMessagesUpdatedEvent);

    MessageManager.activeMessageManager.initialize();
    MessageManager.updateMessages();
  }

  public override componentWillUnmount() {
    MessageManager.onMessageAddedEvent.removeListener(this._handleMessageAddedEvent);
    MessageManager.onActivityMessageUpdatedEvent.removeListener(this._handleActivityMessageUpdatedEvent);
    MessageManager.onActivityMessageCancelledEvent.removeListener(this._handleActivityMessageCancelledEvent);
    MessageManager.onMessagesUpdatedEvent.removeListener(this._handleMessagesUpdatedEvent);
  }

  private _handleMessageAddedEvent = (_args: MessageAddedEventArgs) => {
    this.setState({ messages: MessageManager.activeMessageManager.messages });
  };

  /** Respond to clearing the message list */
  private _handleMessagesUpdatedEvent = () => {
    this.setState({ messages: MessageManager.activeMessageManager.messages });
  };

  /**
   * Sets state of the status bar to updated values reflecting activity progress.
   * @param args  New values to set for ActivityMessage
   */
  private _handleActivityMessageUpdatedEvent = (args: ActivityMessageEventArgs) => {
    this.setState((prevState) => ({
      activityMessageInfo: args,
      isActivityMessageVisible: args.restored ? true : prevState.isActivityMessageVisible,
    }));
  };

  /**
   * Hides ActivityMessage after cancellation
   */
  private _handleActivityMessageCancelledEvent = () => {
    this.setState({
      isActivityMessageVisible: false,
    });
  };

  private getFooterMessages(): React.ReactNode {
    if (!(this.state.activityMessageInfo && this.state.isActivityMessageVisible) && this.state.messages.length === 0)
      return null;

    return (
      <StatusMessagesContainer
        messages={this.state.messages}
        activityMessageInfo={this.state.activityMessageInfo}
        isActivityMessageVisible={this.state.isActivityMessageVisible}
        toastTarget={this.state.toastTarget}
        closeMessage={this._closeMessage}
        cancelActivityMessage={this._cancelActivityMessage}
        dismissActivityMessage={this._dismissActivityMessage}
      />
    );
  }

  /**
   * Ends canceled process and dismisses ActivityMessage
   */
  private _cancelActivityMessage = () => {
    MessageManager.endActivityMessage(false);
    this._dismissActivityMessage();
  };

  /**
   * Dismisses ActivityMessage
   */
  private _dismissActivityMessage = () => {
    this.setState({
      isActivityMessageVisible: false,
    });
  };

  private _handleOpenWidget = (openWidget: StatusBarFieldId) => {
    this.setState({
      openWidget,
    });
  };

  private _closeMessage = (id: string) => {
    MessageManager.activeMessageManager.remove(id);
    MessageManager.updateMessages();
  };

  private _handleToastTargetRef = (toastTarget: HTMLElement | null) => {
    this.setState({ toastTarget });
  };
}

/** StatusBar With Space Between Items React functional component
 * @public
 */
export function StatusBarSpaceBetween(props: CommonDivProps) {
  const { className, ...divProps } = props;
  return <Div {...divProps} mainClassName={className ? className : "uifw-statusbar-space-between"} />;
}

/** StatusBar Left Section React functional component
 * @public
 */
export function StatusBarLeftSection(props: CommonDivProps) {
  const { className, ...divProps } = props;
  return <Div {...divProps} mainClassName={className ? className : "uifw-statusbar-left"} />;
}

/** StatusBar Center Section React functional component
 * @public
 */
export function StatusBarCenterSection(props: CommonDivProps) {
  const { className, ...divProps } = props;
  return <Div {...divProps} mainClassName={className ? className : "uifw-statusbar-center"} />;
}

/** StatusBar Right Section React functional component
 * @public
 */
export function StatusBarRightSection(props: CommonDivProps) {
  const { className, ...divProps } = props;
  return <Div {...divProps} mainClassName={className ? className : "uifw-statusbar-right"} />;
}

/** Context providing values for StatusFieldProps and MessageCenterFieldProps
 *  @internal
 */
export const StatusBarContext = React.createContext<StatusBarWidgetControlArgs>({ // eslint-disable-line @typescript-eslint/naming-convention
  isInFooterMode: true,
  onOpenWidget: /* istanbul ignore next */ () => { },
  openWidget: "",
  toastTargetRef: { current: null },
});
