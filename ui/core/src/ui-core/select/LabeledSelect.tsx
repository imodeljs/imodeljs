/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Select
 */

/* eslint-disable deprecation/deprecation */

import classnames from "classnames";
import * as React from "react";
import { LabeledComponentProps, MessagedComponentProps } from "../inputs/LabeledComponentProps";
import { Select, SelectProps } from "./Select";

/** Properties for [[LabeledSelect]] components
 * @public
 * @deprecated Use LabeledSelectProps in itwinui-react instead
 */
export interface LabeledSelectProps extends SelectProps, LabeledComponentProps, MessagedComponentProps { }

/** Dropdown wrapper that allows for additional styling and labelling
 * @public
 * @deprecated Use LabeledSelect in itwinui-react instead
 */
export class LabeledSelect extends React.PureComponent<LabeledSelectProps> {
  public override render(): JSX.Element {
    const { label, status, className, style,
      inputClassName, inputStyle,
      labelClassName, labelStyle,
      message, messageClassName, messageStyle,
      ...props } = this.props;

    return (
      <label style={style} className={classnames(
        "uicore-inputs-labeled-select",
        this.props.disabled && "uicore-disabled",
        status,
        className,
      )}>
        {label &&
          <div className={classnames("uicore-label", labelClassName)} style={labelStyle}> {label} </div>
        }
        <Select disabled={this.props.disabled} className={inputClassName} style={inputStyle} {...props} />
        {message &&
          <div className={classnames("uicore-message", messageClassName)} style={messageStyle}>{message}</div>
        }
      </label>
    );
  }
}
