/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./Items.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { OrthogonalDirection, OrthogonalDirectionHelpers } from "../utilities/Direction";

/** Properties of [[Items]] component.
 * @alpha
 */
export interface ItemsProps extends CommonProps {
  /** Toolbar items. */
  children?: React.ReactNode;
  /** Toolbar items direction. */
  direction: OrthogonalDirection;
}

/** Toolbar items container. Used in [[Toolbar]] component.
 * @alpha
 */
export class Items extends React.PureComponent<ItemsProps> {
  public override render() {
    const className = classnames(
      "nz-toolbar-items",
      OrthogonalDirectionHelpers.getCssClassName(this.props.direction),
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
