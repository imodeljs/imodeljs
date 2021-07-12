/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./Column.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[GroupColumn]] component.
 * @alpha
 */
export interface GroupColumnProps extends CommonProps {
  /** Actual content. I.e. tool items: [[GroupToolExpander]], [[GroupTool]] */
  children?: React.ReactNode;
}

/** Tool group column. Used in [[Group]], [[NestedGroup]] components.
 * @alpha
 */
export class GroupColumn extends React.PureComponent<GroupColumnProps> {
  public override render() {
    const className = classnames(
      "nz-toolbar-item-expandable-group-column",
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
