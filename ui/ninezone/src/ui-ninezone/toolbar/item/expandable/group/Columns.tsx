/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./Columns.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[Columns]] component.
 * @alpha
 */
export interface ColumnsProps extends CommonProps {
  /** Actual columns. I.e. [[GroupColumn]] */
  children?: React.ReactNode;
}

/** Columns of tool group. Used in [[Group]], [[NestedGroup]] components.
 * @alpha
 */
export class Columns extends React.PureComponent<ColumnsProps> {
  public override render() {
    const className = classnames(
      "nz-toolbar-item-expandable-group-columns",
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
