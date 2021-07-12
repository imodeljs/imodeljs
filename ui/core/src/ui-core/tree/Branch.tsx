/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import "./Branch.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "../utils/Props";

/** Properties for [[TreeBranch]] React component
 * @public
 */
export interface TreeBranchProps extends CommonProps {
  /** Child nodes of the tree branch */
  children?: React.ReactNode;
}

/** Presentation React component for a Tree branch
 * @public
 */
export class TreeBranch extends React.PureComponent<TreeBranchProps> {
  public override render() {
    const className = classnames(
      "core-tree-branch",
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
