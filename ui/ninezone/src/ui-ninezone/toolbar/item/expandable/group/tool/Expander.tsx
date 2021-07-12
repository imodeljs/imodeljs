/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./Expander.scss";
import classnames from "classnames";
import * as React from "react";
import { NoChildrenProps, Omit } from "@bentley/ui-core";
import { GroupTool, GroupToolProps } from "./Tool";

/** Properties of [[GroupToolExpander]] component.
 * @alpha
 */
export interface GroupToolExpanderProps extends Omit<GroupToolProps, "isActive" | "children">, NoChildrenProps {
}

/** Expandable entry of tool group panel. Used in [[GroupColumn]] hosted in [[NestedGroup]] component.
 * @alpha
 */
export class GroupToolExpander extends React.PureComponent<GroupToolExpanderProps> {
  public override render() {
    const { className, ...props } = this.props;

    const expanderClassName = classnames(
      "nz-toolbar-item-expandable-group-tool-expander",
      className);

    return (
      <GroupTool
        className={expanderClassName}
        {...props}>
        <div className="nz-expansion-indicator" />
      </GroupTool>
    );
  }
}
