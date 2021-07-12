/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./Expandable.scss";
import classnames from "classnames";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { CommonProps } from "@bentley/ui-core";
import { ToolbarItem, ToolbarItemProps } from "../../Toolbar";

/** Properties of [[ExpandableItem]] component.
 * @beta
 */
export interface ExpandableItemProps extends CommonProps {
  /** Describes if expandable item triangle indicator should be hidden. */
  hideIndicator?: boolean;
  /** Describes if item is active. */
  isActive?: boolean;
  /** Describes if item is disabled. */
  isDisabled?: boolean;
  /** Panel of the toolbar. */
  panel?: React.ReactNode;
}

class ActualItem extends React.PureComponent<ExpandableItemProps> implements ToolbarItem {
  public readonly panel = document.createElement("div");

  public override render() {
    const className = classnames(
      "nz-toolbar-item-expandable-expandable",
      this.props.isActive && "nz-active",
      this.props.isDisabled && "nz-disabled",
      this.props.className);

    const panel = ReactDOM.createPortal((
      <div className="nz-panel">
        {this.props.panel}
      </div>
    ), this.panel);
    return (
      <div
        className={className}
        style={this.props.style}
      >
        {this.props.children}
        {this.props.hideIndicator ? undefined : <div className="nz-triangle" />}
        {panel}
      </div>
    );
  }
}

/** Expandable toolbar item.
 * @beta
 */
export class ExpandableItem extends React.PureComponent<ExpandableItemProps> {
  public override render() {
    const toolbarItemProps = this.props as ToolbarItemProps<ActualItem>;
    return (
      <ActualItem
        {...this.props}
        ref={toolbarItemProps.toolbarItemRef}
      />
    );
  }
}
