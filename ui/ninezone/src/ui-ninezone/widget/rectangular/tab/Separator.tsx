/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./Separator.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, NoChildrenProps } from "@bentley/ui-core";

/** Properties of [[TabSeparator]] component.
 * @alpha
 */
export interface TabSeparatorProps extends CommonProps, NoChildrenProps {
  readonly isHorizontal?: boolean;
}

/** Rectangular widget tab separator. Used in [[Stacked]] component.
 * @alpha
 */
export class TabSeparator extends React.PureComponent<TabSeparatorProps> {
  public override render() {
    const className = classnames(
      "nz-widget-rectangular-tab-separator",
      this.props.isHorizontal && "nz-horizontal",
      this.props.className);

    return (
      <div
        className={className}
        style={this.props.style}
      />
    );
  }
}
