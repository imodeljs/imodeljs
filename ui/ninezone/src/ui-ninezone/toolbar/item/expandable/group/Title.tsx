/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./Title.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[Title]] component.
 * @alpha
 */
export interface TitleProps extends CommonProps {
  /** Actual title. */
  children?: React.ReactNode;
}

/** Tool group title.
 * @alpha
 */
export class Title extends React.PureComponent<TitleProps> {
  public override render() {
    const className = classnames(
      "nz-toolbar-item-expandable-group-title",
      this.props.className);

    return (
      <div
        className={className}
        style={this.props.style}
      >
        {this.props.children}
      </div>
    );
  }
}
