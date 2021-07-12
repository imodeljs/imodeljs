/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Utilities
 */

import "./Badge.scss";
import classnames from "classnames";
import * as React from "react";
import { SvgSprite } from "../icons/SvgSprite";
import { CommonProps } from "../utils/Props";

/** Properties for the [[Badge]] React component
 * @internal
 */
export interface BadgeProps extends CommonProps {
  svg: any;
}

/** Beta Badge React component
 * @internal
 */
export class Badge extends React.PureComponent<BadgeProps> {
  public override render(): JSX.Element {
    return (
      <div className={classnames("core-badge", this.props.className)} style={this.props.style}>
        <SvgSprite src={this.props.svg} />
      </div>
    );
  }
}
