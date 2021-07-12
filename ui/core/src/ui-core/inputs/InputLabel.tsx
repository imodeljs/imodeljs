/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Inputs
 */

import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "../utils/Props";
import { LabeledComponentProps, MessagedComponentProps } from "./LabeledComponentProps";

/** Properties for [[InputLabel]] components
 * @public
 */
export interface InputLabelProps extends LabeledComponentProps, MessagedComponentProps, CommonProps {
  disabled?: boolean;
}

/** Text input wrapper that provides additional styling and labeling
 * @public
 */
export class InputLabel extends React.PureComponent<InputLabelProps> {
  public override render(): JSX.Element {
    const { label, status, className, style,
      labelClassName, labelStyle,
      message, messageClassName, messageStyle } = this.props;

    return (
      <label style={style} className={classnames(
        "uicore-inputs-labeled-input",
        this.props.disabled && "uicore-disabled",
        status,
        className,
      )}>
        {label &&
          <div className={classnames("uicore-label", labelClassName)} style={labelStyle}> {label} </div>
        }
        <div className={classnames("input", { "with-icon": !!status })}>
          {this.props.children}
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
}
