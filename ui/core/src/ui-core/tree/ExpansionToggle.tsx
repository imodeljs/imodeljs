/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import "./ExpansionToggle.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "../utils/Props";
import { UiCore } from "../UiCore";

/** Properties for the [[ExpansionToggle]] component
 * @public
 */
export interface ExpansionToggleProps extends CommonProps {
  isExpanded?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  ["data-testid"]?: string;
}

/** ExpansionToggle React component used by the [[TreeNode]] component to show collapsed or expanded state
 * @public
 */
export class ExpansionToggle extends React.PureComponent<ExpansionToggleProps> {
  public override render() {
    const className = classnames(
      "core-tree-expansionToggle",
      this.props.isExpanded && "is-expanded",
      this.props.className);
    const label = UiCore.translate(this.props.isExpanded ? "tree.collapse" : "tree.expand");

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
      <div
        onClick={this.props.onClick}
        className={className}
        style={this.props.style}
        data-testid={this.props["data-testid"]}
        role="button"
        tabIndex={-1}
        aria-label={label}
      >
        <i className="toggle icon icon-chevron-right" />
      </div>
    );
  }
}
