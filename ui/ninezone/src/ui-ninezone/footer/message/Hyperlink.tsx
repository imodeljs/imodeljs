/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Message
 */

import "./Hyperlink.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[MessageHyperlink]] component.
 * @beta
 */
export interface MessageHyperlinkProps extends CommonProps {
  /** Hyperlink text. */
  children?: string;
  /** Function called when hyperlink is clicked. */
  onClick?: () => void;
}

/** Hyperlink component used in [[Message]] component.
 * @beta
 */
export class MessageHyperlink extends React.PureComponent<MessageHyperlinkProps> {
  public override render() {
    const className = classnames(
      "nz-footer-message-hyperlink",
      this.props.className);

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
      <div
        className={className}
        onClick={this.props.onClick}
        style={this.props.style}
        role="link"
        tabIndex={-1}
      >
        {this.props.children}
      </div>
    );
  }
}
