/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Notification
 */

import "./StickyMessage.scss";
import * as React from "react";
import classnames from "classnames";
import { MessageSeverity } from "@bentley/ui-core";
import { MessageLayout } from "@bentley/ui-ninezone";
import { ToastPresentation } from "@itwin/itwinui-react/cjs/core/Toast/Toast";
import { NotifyMessageDetailsType } from "../messages/ReactNotifyMessageDetails";
import { MessageLabel } from "./MessageLabel";
import { getToastCategory } from "./getToastCategory";

/** Properties for a [[StickyMessage]]
 * @beta
 */
export interface StickyMessageProps {
  id: string;
  messageDetails: NotifyMessageDetailsType;
  severity: MessageSeverity;
  closeMessage: (id: string) => void;
}

/** Sticky Message React component
 * @beta
 */
export function StickyMessage(props: StickyMessageProps) {
  const { id, messageDetails, severity, closeMessage } = props;
  const category = getToastCategory(severity);
  const [closing, setClosing] = React.useState(false);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => closeMessage(id), 500);
  };

  const classNames = classnames(
    "uifw-statusbar-sticky-message",
    closing && "uifw-closing",
  );

  return (
    <div className={classNames}>
      <ToastPresentation
        category={category}
        hasCloseButton={true}
        onClose={handleClose}
        content={
          <MessageLayout>
            <MessageLabel message={messageDetails.briefMessage} className="uifw-statusbar-message-brief" />
            {messageDetails.detailedMessage &&
              <MessageLabel message={messageDetails.detailedMessage} className="uifw-statusbar-message-detailed" />
            }
          </MessageLayout>
        }
      />
    </div>
  );
}
