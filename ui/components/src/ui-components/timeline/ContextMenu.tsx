/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./ContextMenu.scss";
import classnames from "classnames";
import * as React from "react";
import { RelativePosition } from "@bentley/ui-abstract";
import { CommonProps, Popup } from "@bentley/ui-core";
/* eslint-disable deprecation/deprecation */

/* istanbul ignore next */
/** Properties for [[ContextMenuItem]] component
 * @internal
 * @deprecated
 */
export interface MenuItem {
  /** Name of the context menu item */
  name?: string;
  /** Optional icon */
  icon?: string;
  /** Disabled */
  disabled?: boolean;
  /** Checked or not */
  checked?: boolean;
  /** Separator */
  isSeparator?: boolean;
  /** Called when the item is clicked */
  onClick?: () => void;
}

/* istanbul ignore next */
/**
 * A context menu item.
 * @internal
 * @deprecated
 */
export class ContextMenuItem extends React.Component<MenuItem> {

  private _onClick = (event: any) => {
    event.stopPropagation();
    // istanbul ignore else
    if (!this.props.disabled && !this.props.isSeparator && this.props.onClick) {
      this.props.onClick();
    }
  };

  // istanbul ignore next - WIP
  public override render() {
    const menuClassName = classnames(
      "contextmenu-item-wip",
      this.props.disabled && "disabled",
      this.props.checked && "checked",
    );

    return (
      <>
        {this.props.isSeparator && <div className="separator" role="separator" />}
        {!this.props.isSeparator &&
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li className={menuClassName} onClick={this._onClick} role="menuitem">
            {this.props.checked && <span className="icon icon-checkmark" />}
            {(this.props.icon && !this.props.checked) && <span className={classnames("user-icon icon", this.props.icon)} />}
            <span>{this.props.name}</span>
          </li>
        }
      </>
    );
  }
}

/* istanbul ignore next */
/** Properties for [[ContextMenu]] component
 * @internal
 * @deprecated
 */
export interface ContextMenuProps extends CommonProps {
  /** Show or hide the context menu */
  isOpened: boolean;
  /** Position the context menu relative to the parent */
  position: RelativePosition;
  /** List of context menu items */
  items?: MenuItem[];
  /** Called when the mouse is clicked outside the context menu */
  onClickOutside?: () => void;
  /** parent element */
  parent: HTMLElement | null;
}

/* istanbul ignore next */
/** Context menu for timeline component
 * @internal
 * @deprecated
 */
export class ContextMenu extends React.Component<ContextMenuProps> {
  // istanbul ignore next - WIP
  public override render() {
    const { items, parent, position, isOpened, onClickOutside } = this.props;
    return (
      <Popup isOpen={isOpened} target={parent} position={position} onClose={onClickOutside}>
        <div data-testid="timeline-contextmenu-div" className="contextmenu-wip">
          <ul>
            {items && items.map((item: MenuItem, index: number) => (
              <ContextMenuItem key={index} name={item.name} icon={item.icon} disabled={item.disabled} onClick={item.onClick} isSeparator={item.isSeparator} />
            ))
            }
            {this.props.children}
          </ul>
        </div>
      </Popup>
    );
  }
}
