/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./Item.scss";
import classnames from "classnames";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { CommonProps, Size, SizeProps } from "@bentley/ui-core";
import { ToolbarItem, ToolbarItemProps } from "../Toolbar";

/** Properties of [[Item]] component.
 * @beta
 */
export interface ItemProps extends CommonProps {
  /** button icon. */
  icon?: React.ReactNode;
  /** Describes if item is active. */
  isActive?: boolean;
  /** Describes if the item is disabled. */
  isDisabled?: boolean;
  /** Function called when the item is clicked. */
  onClick?: () => void;
  /** Function called when a key is pressed. */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /** Title for the item. */
  title?: string;
  /** Function called when size is known. */
  onSizeKnown?: (size: SizeProps) => void;
  /** A badge to draw. */
  badge?: React.ReactNode;
}

class ActualItem extends React.PureComponent<ItemProps> implements ToolbarItem {
  public readonly panel = document.createElement("div");
  public readonly history = document.createElement("div");
  public size: Size = new Size(0, 0);

  private setSizeFromRef(button: HTMLButtonElement | null) {
    // istanbul ignore else
    if (button) {
      const rect = button.getBoundingClientRect();
      this.size = new Size(rect.width, rect.height);

      if (this.props.onSizeKnown)
        this.props.onSizeKnown(this.size);
    }
  }

  public override render() {
    const className = classnames(
      "nz-toolbar-item-item",
      this.props.isActive && "nz-active",
      this.props.isDisabled && "nz-disabled",
      this.props.className);

    const panel = ReactDOM.createPortal(<div className="nz-panel"></div>, this.panel);
    const history = ReactDOM.createPortal(<div className="nz-history"></div>, this.history);
    return (
      <button
        ref={(e) => this.setSizeFromRef(e)}
        disabled={this.props.isDisabled}  // this is needed to prevent focusing/keyboard access to disabled buttons
        onClick={this.props.onClick}
        onKeyDown={this.props.onKeyDown}
        className={className}
        style={this.props.style}
        title={this.props.title}
      >
        <div className="nz-icon">
          {this.props.icon}
        </div>
        {this.props.badge &&
          <div className="nz-badge">
            {this.props.badge}
          </div>
        }
        {panel}
        {history}
      </button>
    );
  }
}

/** Toolbar item component. Used in [[Toolbar]] component.
 * @beta
 */
export class Item extends React.PureComponent<ItemProps> {
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
