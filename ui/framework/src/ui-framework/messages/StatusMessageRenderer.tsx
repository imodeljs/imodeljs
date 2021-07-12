/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Notification
 */

import "./StatusMessageRenderer.scss";
import * as React from "react";
import classnames from "classnames";
import { ActivityMessageEventArgs, MessageAddedEventArgs, MessageManager } from "./MessageManager";
import { CommonProps } from "@bentley/ui-core";
import { StatusMessage } from "./StatusMessageManager";
import { StatusMessagesContainer } from "./StatusMessagesContainer";

/** Properties for [[StatusMessageRenderer]] component
 * @beta
 */
export interface StatusMessageRendererProps extends CommonProps {
  closeMessage?: (id: string) => void;
  cancelActivityMessage?: () => void;
  dismissActivityMessage?: () => void;
}

/** Message Popup React component that renders one or more Toast or Sticky messages and an Activity message
 * @beta
 */
export function StatusMessageRenderer(props: StatusMessageRendererProps) {
  const [messages, setMessages] = React.useState<ReadonlyArray<StatusMessage>>(MessageManager.activeMessageManager.messages);
  const [activityMessageInfo, setActivityMessageInfo] = React.useState<ActivityMessageEventArgs | undefined>(undefined);
  const [isActivityMessageVisible, setIsActivityMessageVisible] = React.useState(false);

  React.useEffect(() => {
    const handleMessageAddedEvent = (_args: MessageAddedEventArgs) => {
      setMessages(MessageManager.activeMessageManager.messages);
    };

    return MessageManager.onMessageAddedEvent.addListener(handleMessageAddedEvent);
  }, []);

  React.useEffect(() => {
    /** Respond to clearing the message list */
    const handleMessagesUpdatedEvent = () => {
      setMessages(MessageManager.activeMessageManager.messages);
    };

    return MessageManager.onMessagesUpdatedEvent.addListener(handleMessagesUpdatedEvent);
  }, []);

  React.useEffect(() => {
    const handleActivityMessageUpdatedEvent = (args: ActivityMessageEventArgs) => {
      setActivityMessageInfo(args);
      if (args.restored)
        setIsActivityMessageVisible(true);
    };

    return MessageManager.onActivityMessageUpdatedEvent.addListener(handleActivityMessageUpdatedEvent);
  }, [isActivityMessageVisible]);

  React.useEffect(() => {
    const handleActivityMessageCancelledEvent = () => {
      setActivityMessageInfo(undefined);
      setIsActivityMessageVisible(false);
    };

    return MessageManager.onActivityMessageCancelledEvent.addListener(handleActivityMessageCancelledEvent);
  }, []);

  const closeMessage = React.useCallback((id: string) => {
    MessageManager.activeMessageManager.remove(id);
    MessageManager.updateMessages();
    props.closeMessage && props.closeMessage(id);
  }, [props]);

  const cancelActivityMessage = React.useCallback(() => {
    MessageManager.endActivityMessage(false);
    props.cancelActivityMessage && props.cancelActivityMessage();
  }, [props]);

  const dismissActivityMessage = React.useCallback(() => {
    setIsActivityMessageVisible(false);
    props.dismissActivityMessage && props.dismissActivityMessage();
  }, [props]);

  if (!(activityMessageInfo && isActivityMessageVisible) && messages.length === 0)
    return null;

  return (
    <div className={classnames("uifw-message-renderer", props.className)} style={props.style}>
      <StatusMessagesContainer
        messages={messages}
        activityMessageInfo={activityMessageInfo}
        isActivityMessageVisible={isActivityMessageVisible}
        toastTarget={null}
        closeMessage={closeMessage}
        cancelActivityMessage={cancelActivityMessage}
        dismissActivityMessage={dismissActivityMessage}
      />

    </div>
  );
}
