/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module MessageCenter
 */

import "./Tab.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[MessageCenterTab]] component.
 * @beta
 */
export interface MessageCenterTabProps extends CommonProps {
  /** Tab content. */
  children?: React.ReactNode;
  /** Describes if the tab is active. */
  isActive?: boolean;
  /** Function called when the tab is clicked. */
  onClick?: () => void;
}

/** Message center tab used in [[MessageCenterDialog]] component.
 * @beta
 */
export class MessageCenterTab extends React.PureComponent<MessageCenterTabProps> {
  public override render() {
    const className = classnames(
      "nz-footer-messageCenter-tab",
      this.props.isActive && "nz-active",
      this.props.className);

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
      <div
        className={className}
        style={this.props.style}
        onClick={this.props.onClick}
        role="tab"
        tabIndex={-1}
      >
        {this.props.children}
      </div>
    );
  }
}
