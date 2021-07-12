/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Message
 */

import "./Button.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[TitleBarButton]] component.
 * @beta
 */
export interface TitleBarButtonProps extends CommonProps {
  /** Button content. */
  children?: React.ReactNode;
  /** Function called when button is clicked. */
  onClick?: () => void;
  /** Button title. */
  title?: string;
}

/** Button used in [[TitleBar]] component.
 * @beta
 */
export class TitleBarButton extends React.PureComponent<TitleBarButtonProps> {
  public override render() {
    const className = classnames(
      "nz-footer-dialog-button",
      this.props.className);

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
      <div
        className={className}
        onClick={this.props.onClick}
        style={this.props.style}
        title={this.props.title}
        role="button"
        tabIndex={-1}
      >
        {this.props.children}
      </div>
    );
  }
}
