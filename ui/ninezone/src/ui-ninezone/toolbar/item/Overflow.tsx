/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./Overflow.scss";
import classnames from "classnames";
import * as React from "react";
import { ExpandableItem, ExpandableItemProps } from "./expandable/Expandable";
import { Item } from "./Item";

/** Properties of [[Overflow]] component.
 * @beta
 */
export interface OverflowProps extends ExpandableItemProps {
  /** Function called when button is clicked. */
  onClick?: () => void;
}

/** Expandable toolbar item component that displays ellipsis icon. Used in [[Toolbar]] component.
 * @beta
 */
export class Overflow extends React.PureComponent<OverflowProps> {
  public override render() {
    const { onClick, className, ...props } = this.props;
    const itemClassName = classnames(
      "nz-toolbar-item-overflow",
      className);

    return (
      <ExpandableItem
        className={itemClassName}
        {...props}
      >
        <Item
          className="nz-ellipsis-icon"
          onClick={onClick}
          icon={
            <div className="nz-ellipsis" />
          }
        />
      </ExpandableItem>
    );
  }
}
