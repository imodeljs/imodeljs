/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import "./Node.scss";
import classnames from "classnames";
import * as React from "react";
import { Checkbox, CheckboxProps, ProgressRadial } from "@itwin/itwinui-react";
import { CheckBoxState } from "../enums/CheckBoxState";
import { CommonProps } from "../utils/Props";
import { Omit } from "../utils/typeUtils";
import { ExpansionToggle } from "./ExpansionToggle";

/** Props for node Checkbox renderer
 * @beta
 */
export type NodeCheckboxRenderProps = Omit<CheckboxProps, "onChange" | "onClick"> & {
  onChange: (checked: boolean) => void;
  onClick: (e: React.MouseEvent) => void;
};

/** Type for node Checkbox renderer
 * @beta
 */
export type NodeCheckboxRenderer = (props: NodeCheckboxRenderProps) => React.ReactNode;

/** Number of pixels the node gets offset per each hierarchy level */
export const LEVEL_OFFSET = 20;

const EXPANSION_TOGGLE_WIDTH = 24;

/** Properties for Tree Node CheckBox
 * @beta
 */
export interface NodeCheckboxProps {
  /** State of the checkbox */
  state?: CheckBoxState;
  /** Click event callback */
  onClick?: (newState: CheckBoxState) => void;
  /** Indicates whether checkbox is disabled */
  isDisabled?: boolean;
  /** Tooltip to be displayed when mouse is hovered over checkbox */
  tooltip?: string;
}

/** Properties for the [[TreeNode]] React component
 * @public
 */
export interface TreeNodeProps extends CommonProps {
  label: React.ReactNode;
  level: number;
  icon?: React.ReactChild;
  /** Properties for the checkbox.
   * @beta */
  checkboxProps?: NodeCheckboxProps;
  isLeaf?: boolean;
  isLoading?: boolean;
  isExpanded?: boolean;
  isFocused?: boolean;
  isSelected?: boolean;
  isHoverDisabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  onClickExpansionToggle?: () => void;
  children?: React.ReactNode;

  /** Contains render overrides for different pieces of the node component. */
  renderOverrides?: {
    /** Callback to render a checkbox. Only called when checkbox is displayed.
     * @beta */
    renderCheckbox?: NodeCheckboxRenderer;
  };
  ["data-testid"]?: string;
}

/** Presentation React component for a Tree node
 * @public
 */
export class TreeNode extends React.Component<TreeNodeProps> {
  constructor(props: TreeNodeProps) {
    super(props);
  }

  public override render() {
    const className = classnames(
      "core-tree-node",
      this.props.isFocused && "is-focused",
      this.props.isSelected && "is-selected",
      this.props.isHoverDisabled && "is-hover-disabled",
      this.props.className);
    let offset = this.props.level * LEVEL_OFFSET;
    if (!this.props.isLoading && this.props.isLeaf)
      offset += EXPANSION_TOGGLE_WIDTH; // Add expansion toggle/loader width if they're not rendered

    const loader = this.props.isLoading ? (<div className="loader"><ProgressRadial size="x-small" indeterminate /></div>) : undefined;

    let checkbox: React.ReactNode;
    if (this.props.checkboxProps) {
      const props: NodeCheckboxRenderProps = {
        label: "",
        checked: this.props.checkboxProps.state === CheckBoxState.On,
        indeterminate: this.props.checkboxProps.state === CheckBoxState.Partial,
        disabled: this.props.checkboxProps.isDisabled,
        title: this.props.checkboxProps.tooltip,
        onClick: this._onCheckboxClick,
        onChange: this._onCheckboxChange,
      };
      if (this.props.renderOverrides && this.props.renderOverrides.renderCheckbox) {
        checkbox = this.props.renderOverrides.renderCheckbox(props);
      } else {
        checkbox = (
          <Checkbox {...props}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => this._onCheckboxChange(e.target.checked)} data-testid={this.createSubComponentTestId("checkbox")}
          />
        );
      }
    }

    const icon = this.props.icon ? (<div className="core-tree-node-icon">{this.props.icon}</div>) : undefined;

    const toggle = (this.props.isLoading || this.props.isLeaf) ? undefined : (
      <ExpansionToggle
        className="expansion-toggle"
        data-testid={this.createSubComponentTestId("expansion-toggle")}
        onClick={this._onClickExpansionToggle}
        isExpanded={this.props.isExpanded}
      />
    );

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
      <div
        className={className}
        style={this.props.style}
        data-testid={this.props["data-testid"]}
        onClick={this._onClick}
        onContextMenu={this.props.onContextMenu}
        onMouseDown={this.props.onMouseDown}
        onMouseUp={this.props.onMouseUp}
        onMouseMove={this.props.onMouseMove}
        role="treeitem"
        tabIndex={-1}
      >
        <div
          className="contents"
          style={{ marginLeft: offset }}
          data-testid={this.createSubComponentTestId("contents")}
        >
          {loader}
          {toggle}
          {checkbox}
          {icon}
          {this.props.label}
        </div>
        {this.props.children}
      </div>
    );
  }

  private createSubComponentTestId(subId: string): string | undefined {
    if (!this.props["data-testid"])
      return undefined;
    return `${this.props["data-testid"]}-${subId}`;
  }

  private _onCheckboxChange = (checked: boolean) => {
    if (this.props.checkboxProps && this.props.checkboxProps.onClick && !this.props.checkboxProps.isDisabled)
      this.props.checkboxProps.onClick(checked ? CheckBoxState.On : CheckBoxState.Off);
  };

  private _onCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  private _onClickExpansionToggle = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (this.props.onClickExpansionToggle)
      this.props.onClickExpansionToggle();
  };

  private _onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (this.props.onClick)
      this.props.onClick(e);
  };
}
