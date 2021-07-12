/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Loading
 */

import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "../utils/Props";
import { percentInRange } from "../loading/LoadingBar";

/** Properties for [[ProgressBar]] component
 * @beta
 * @deprecated Use ProgressLinearProps in itwinui-react instead.
 */
export interface ProgressBarProps extends CommonProps {
  /** Height (in pixels) of the progress bar. (defaults to 4px) */
  barHeight?: number;
  /** Indicates whether the progress bar is determinate showing a percentage or indeterminate continuously animating. (defaults to false) */
  indeterminate?: boolean;
  /** One of two possible labels. If only one label is given it will be centered. Otherwise, this label is shown on the left. */
  labelLeft?: string;
  /** One of two possible labels. If only one label is given it will be centered. Otherwise, this label is shown on the right. */
  labelRight?: string;
  /** Percent for determinate progress bar. */
  percent?: number;
}

/**
 * ProgressBar React component shows a horizontal progress bar.
 * The determinate bar reflects a percentage and the indeterminate bar continuously animates.
 * @beta
 * @deprecated Use ProgressLinear in itwinui-react instead.
 */
export function ProgressBar(props: ProgressBarProps) {    // eslint-disable-line deprecation/deprecation
  const percent = props.percent !== undefined ? percentInRange(props.percent) : 0;
  const outerStyle: React.CSSProperties = {
    ...props.style,
    height: props.barHeight !== undefined ? `${props.barHeight}px` : undefined,
  };
  const innerStyle: React.CSSProperties = {
    width: !props.indeterminate ? `${percent}%` : undefined,
  };
  const innerClass = !props.indeterminate ? "uicore-progress-bar-determinate" : "uicore-progress-bar-indeterminate";
  const hasLabel = props.labelLeft !== undefined || props.labelRight !== undefined;
  const multipleLabels = props.labelLeft !== undefined && props.labelRight !== undefined;
  const bar = (
    <div className={classnames("uicore-progress-bar", props.className)} style={outerStyle}>
      <div className={innerClass} style={innerStyle} />
    </div>
  );
  const content = !hasLabel ?
    bar :
    (
      <div className="uicore-progress-bar-labeled">
        {bar}
        <div className="uicore-label">
          {multipleLabels && <><span>{props.labelLeft}</span><span>{props.labelRight}</span></>}
          {!multipleLabels && <>{props.labelLeft}{props.labelRight}</>}
        </div>
      </div>
    );

  return content;
}
