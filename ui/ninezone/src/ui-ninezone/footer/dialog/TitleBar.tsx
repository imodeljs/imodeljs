/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Message
 */

import "./TitleBar.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[TitleBar]] component.
 * @beta
 */
export interface TitleBarProps extends CommonProps {
  /** Title bar buttons. I.e. [[TitleBarButton]] */
  children?: React.ReactNode;
  /** Title bar title. */
  title?: string;
}

/** Title bar of [[Dialog]] component.
 * @beta
 */
export class TitleBar extends React.PureComponent<TitleBarProps> {
  public override render() {
    const className = classnames(
      "nz-footer-dialog-titleBar",
      this.props.className);

    return (
      <div
        className={className}
        style={this.props.style}
      >
        <span className="nz-title">
          {this.props.title}
        </span>
        {this.props.children}
      </div>
    );
  }
}
