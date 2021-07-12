/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import classnames from "classnames";
import * as React from "react";
import { Icon } from "../icons/IconComponent";
import { CommonDivProps } from "../utils/Props";

/** Properties for the [[Tile]] component
 * @beta
 */
export interface TileProps extends CommonDivProps {
  title: string;
  icon?: string | React.ReactNode;
  featured?: boolean;
  minimal?: boolean;
  href?: string;
  onClick?: (e: any) => any;
  stepNum?: number;
  stepCount?: number;
}

/** @internal */
export type TileDefaultProps = Pick<TileProps, "stepNum">;

/** The Tile React component is a container for rendering elements that can be grouped together.
 * @beta
 */
export class Tile extends React.Component<TileProps> {

  /** @internal */
  public static readonly defaultProps: TileDefaultProps = {
    stepNum: 0,
  };

  /** @internal */
  public override render(): JSX.Element {
    const stepType =
      (this.props.stepCount && this.props.stepCount < 13)
        ? Math.floor(this.props.stepNum! * 12 / (this.props.stepCount - 1))
        : this.props.stepNum! % 16;
    const stepClass = `uicore-step-${stepType}`;

    const classNames = classnames(
      "uicore-tiles-tile",
      stepClass,
      this.props.featured && "uicore-featured",
      this.props.minimal && "uicore-minimal",
    );

    const icon: React.ReactNode = (typeof this.props.icon === "string") ? <Icon iconSpec={this.props.icon} /> : this.props.icon;

    return (
      <div className={classNames} style={this.props.style}>
        <a className="uicore-link" href={this.props.href} onClick={this.props.onClick}>
          <div className="uicore-icon">
            {icon}
          </div>
          <p className="uicore-title">{this.props.title}</p>
        </a>
        {this.props.children && !this.props.minimal &&
          <div className="uicore-children">
            {this.props.children}
          </div>
        }
      </div>
    );
  }
}
