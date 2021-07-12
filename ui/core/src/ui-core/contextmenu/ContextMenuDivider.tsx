/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ContextMenu
 */

import * as React from "react";
import classnames from "classnames";
import { CommonProps } from "../utils/Props";

/**
 * Menu Divider for [[ContextMenu]]. Inserts a line between items, used for list item grouping.
 * @public
 */
export class ContextMenuDivider extends React.PureComponent<CommonProps> {
  public override render(): JSX.Element {
    const { className, ...props } = this.props;
    return (
      <div {...props} data-testid="core-context-menu-divider" className={classnames("core-context-menu-divider", className)} />
    );
  }
}
