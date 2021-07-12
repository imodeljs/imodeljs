/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Notification
 */

import * as React from "react";
import { UiCore } from "@bentley/ui-core";
import { MessageHyperlink, MessageLayout, MessageProgress, Status } from "@bentley/ui-ninezone";
import { Small } from "@itwin/itwinui-react";
import { ToastPresentation } from "@itwin/itwinui-react/cjs/core/Toast/Toast";
import { UiFramework } from "../UiFramework";
import { ActivityMessageEventArgs } from "../messages/MessageManager";
import { MessageLabel } from "./MessageLabel";

/** Properties for a [[ActivityMessage]]
 * @beta
 */
export interface ActivityMessageProps {
  activityMessageInfo: ActivityMessageEventArgs;
  cancelActivityMessage: () => void;
  dismissActivityMessage: () => void;
}

/** Activity Message React component
 * @beta
 */
export function ActivityMessage(props: ActivityMessageProps) {
  const messageDetails = props.activityMessageInfo.details;
  const [percentCompleteLabel] = React.useState(UiFramework.translate("activityCenter.percentComplete"));
  const [cancelLabel] = React.useState(UiCore.translate("dialog.cancel"));

  return (
    <ToastPresentation
      category="informational"
      hasCloseButton={true}
      onClose={props.dismissActivityMessage}
      content={
        <MessageLayout
          buttons={(messageDetails && messageDetails.supportsCancellation) &&
            <MessageHyperlink onClick={props.cancelActivityMessage}>{cancelLabel}</MessageHyperlink>
          }
          progress={(messageDetails && messageDetails.showProgressBar) &&
            <MessageProgress
              status={Status.Information}
              progress={props.activityMessageInfo.percentage}
            />
          }
        >
          <div>
            <MessageLabel message={props.activityMessageInfo.message} className="uifw-statusbar-message-brief" />
            {(messageDetails && messageDetails.showPercentInMessage) &&
              <Small>{props.activityMessageInfo.percentage + percentCompleteLabel}</Small>
            }
          </div>
        </MessageLayout>
      }
    />
  );
}
