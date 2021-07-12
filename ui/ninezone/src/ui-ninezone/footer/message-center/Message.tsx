/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module MessageCenter
 */

import "./Message.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[MessageCenterMessage]] component.
 * @beta
 */
export interface MessageCenterMessageProps extends CommonProps {
  /** Message content. */
  children?: React.ReactNode;
  /** Message icon. */
  icon?: React.ReactNode;
}

/** Message entry in [[MessageCenterDialog]] component.
 * @beta
 */
export class MessageCenterMessage extends React.PureComponent<MessageCenterMessageProps> {
  public override render() {
    const className = classnames(
      "nz-footer-messageCenter-message",
      this.props.className);

    return (
      <div
        className={className}
        style={this.props.style}
      >
        {this.props.icon &&
          <div className="nz-icon">
            {this.props.icon}
          </div>
        }
        {this.props.children &&
          <div className="nz-content">
            {this.props.children}
          </div>
        }
      </div>
    );
  }
}
