/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Inputs
 */

import classnames from "classnames";
import * as React from "react";
import { Input, InputProps } from "./Input";
import { LabeledComponentProps, MessagedComponentProps } from "./LabeledComponentProps";

/* eslint-disable deprecation/deprecation */

/** Properties for [[LabeledInput]] components
 * @public
 * @deprecated Use LabeledInputProps in itwinui-react instead
 */
export interface LabeledInputProps extends InputProps, LabeledComponentProps, MessagedComponentProps { }  // eslint-disable-line deprecation/deprecation

/** Text input wrapper that provides additional styling and labeling
 * @public
 * @deprecated Use LabeledInput in itwinui-react instead
 */
export function LabeledInput(props: LabeledInputProps) {    // eslint-disable-line deprecation/deprecation
  const { label, status, className, style,
    inputClassName, inputStyle,
    labelClassName, labelStyle, disabled,
    message, messageClassName, messageStyle,
    ...otherProps } = props;

  return (
    <label style={style} className={classnames(
      "uicore-inputs-labeled-input",
      disabled && "uicore-disabled",
      status,
      className,
    )}>
      {label &&
        <div className={classnames("uicore-label", labelClassName)} style={labelStyle}> {label} </div>
      }
      <div className={classnames("input", { "with-icon": !!status })}>
        <Input disabled={disabled} className={inputClassName} style={inputStyle} {...otherProps} />
        {status &&
          <i className={classnames("icon", `icon-status-${status}`)} />
        }
      </div>
      {message &&
        <div className={classnames("uicore-message", messageClassName)} style={messageStyle}>{message}</div>
      }
    </label>
  );
}
