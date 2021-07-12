/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Loading
 */

import "./LoadingBar.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "../utils/Props";

/** Properties for [[LoadingBar]] component
 * @public
 */
export interface LoadingBarProps extends CommonProps {
  /** Percent */
  percent: number;
  /** Show percentage (optional) */
  showPercentage?: boolean;
  /** Height (in pixels) of the loading bar */
  barHeight: number;
}

/**
 * A loading bar with optional percentage text.
 * @public
 */
export class LoadingBar extends React.PureComponent<LoadingBarProps> {
  public static defaultProps: Partial<LoadingBarProps> = {
    barHeight: 4,
  };

  public override render() {
    const percent = `${percentInRange(this.props.percent)}%`;
    const containerClass = classnames(this.props.className, "core-lb");
    return (
      <div className={containerClass} style={this.props.style}>
        <div className="lb-container" style={{ height: this.props.barHeight }}>
          <div className="fill" style={{ width: percent }} />
        </div>
        {this.props.showPercentage && <span className="percent">{percent}</span>}
      </div>
    );
  }
}

/** Sanity check to keep percentage between 0 & 100
 * @internal
 */
export function percentInRange(percent: number): number {
  let value = Math.min(percent, 100);
  value = Math.max(value, 0);
  return value;
}
