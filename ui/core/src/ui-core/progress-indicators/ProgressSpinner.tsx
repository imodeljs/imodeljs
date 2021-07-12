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
import { Icon } from "../icons/IconComponent";
import { SpinnerSize } from "../loading/Spinner";

/**
 * Properties for [[ProgressSpinner]] component
 * @beta
 * @deprecated Use ProgressRadialProps in itwinui-react instead.
 */
export interface ProgressSpinnerProps extends CommonProps {
  /**
   * Spinner percentage. Should be a number between 0 and 100.
   * @default 0
   */
  value?: number;
  /**
   * Spinner variant. If true, value will be ignored.
   * @default false
   */
  indeterminate?: boolean;
  /**
   * If true, spinner will be full, green, and display a checkmark.
   * @default false
   */
  success?: boolean;
  /**
   * If true, spinner will be full, red, and display an X.
   * @default false
   */
  error?: boolean;
  /**
   * Size of spinner
   * @default width/height of 40px
   */
  size?: SpinnerSize; // eslint-disable-line deprecation/deprecation
  /**
   * Child components
   */
  children?: React.ReactNode;
}

/**
 * Circular Progress Indicator that supports determinate and indeterminate modes.
 * @beta
 * @deprecated Use ProgressRadial in itwinui-react instead.
 */
export function ProgressSpinner(props: ProgressSpinnerProps) {    // eslint-disable-line deprecation/deprecation
  const {
    value = 0,
    indeterminate = false,
    success = false,
    error = false,
    style = {},
    size,
    children,
  } = props;

  let outerClassName = classnames("uicore-progress-spinner");
  const outerStyle = { ...style };
  const fillStyle: React.CSSProperties = {};
  // Ensure value is bounded 0 - 100;
  const dashOffset = 100 - Math.min(Math.max(value, 0), 100);
  let content: React.ReactNode;

  if (error) {
    outerClassName = classnames(outerClassName, "error");
    content = <Icon iconSpec="icon-close-2" />;
  } else if (success) {
    outerClassName = classnames(outerClassName, "success");
    content = (
      <Icon iconSpec="icon-checkmark" />
    );
  } else if (indeterminate) {
    outerClassName = classnames(outerClassName, "indeterminate");
    content = children;
  } else {
    outerClassName = classnames(outerClassName, "determinate");
    fillStyle.strokeDashoffset = dashOffset;
    content = children;
  }

  setDefaultDimensions(outerStyle, size);

  return (
    <div className={outerClassName} style={outerStyle}>
      <svg className="spinner" viewBox="0 0 40 40">
        <circle className="shape" cx="20" cy="20" r="15.91549" />
        <circle
          className="fill"
          cx="20"
          cy="20"
          r="15.91549"
          style={fillStyle}
        />
      </svg>
      {content && <span className="uicore-progress-spinner-content">{content}</span>}
    </div>
  );
}

const setDefaultDimensions = (style: React.CSSProperties, inSize?: SpinnerSize) => {  // eslint-disable-line deprecation/deprecation
  let size = 40;

  if (inSize !== undefined) {
    switch (inSize) {
      case SpinnerSize.Small:   // eslint-disable-line deprecation/deprecation
        size = 16;
        break;
      case SpinnerSize.Medium:  // eslint-disable-line deprecation/deprecation
        size = 32;
        break;
      case SpinnerSize.Large:   // eslint-disable-line deprecation/deprecation
        size = 64;
        break;
      case SpinnerSize.XLarge:  // eslint-disable-line deprecation/deprecation
        size = 96;
        break;
    }
  }
  style.width = style.width ? style.width : size;
  style.height = style.height ? style.height : size;
};
