/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Message
 */

import "./Message.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { Status, StatusHelpers } from "./Status";

/** Properties of [[Message]] component.
 * @beta
 */
export interface StatusMessageProps extends CommonProps {
  /** Footer message content. I.e. [[MessageLayout]] */
  children?: React.ReactNode;
  /** Message icon. */
  icon?: React.ReactNode;
  /** Message status. */
  status: Status;
}

/** Component used to define toast, sticky and activity message.
 * @beta
 */
export class Message extends React.PureComponent<StatusMessageProps> {
  public override render() {
    const className = classnames(
      "nz-footer-message-message",
      StatusHelpers.getCssClassName(this.props.status),
      this.props.className);

    return (
      <div
        className={className}
        style={this.props.style}
      >
        {this.props.icon !== undefined &&
          <div className="nz-icon">
            {this.props.icon}
          </div>
        }
        {this.props.children}
      </div>
    );
  }
}
