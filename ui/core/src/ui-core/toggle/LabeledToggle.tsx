/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toggle
 */

import "./LabeledToggle.scss";
import classnames from "classnames";
import * as React from "react";
import { ToggleSwitch, ToggleSwitchProps } from "@itwin/itwinui-react";

/** Properties for [[LabeledToggle]]
 * @public
 * @deprecated Use ToggleSwitchProps from itwinui-react instead
 */
export interface LabeledToggleProps extends ToggleSwitchProps {
  /** Text that will be shown next to the Toggle. */
  label?: string;
  /** Custom CSS class name for the label */
  labelClassName?: string;
  /** Custom CSS Style for the label */
  labelStyle?: React.CSSProperties;
}

/** Toggle component with a Label to the right
 * @public
 * @deprecated Use ToggleSwitch from itwinui-react with `labelPosition="right"` instead
 */
export class LabeledToggle extends React.PureComponent<LabeledToggleProps> {  // eslint-disable-line deprecation/deprecation
  public override render(): JSX.Element {
    const { label, labelClassName, className, style, ...props } = this.props;

    return (
      <label style={this.props.style} className={classnames(
        "core-inputs-labeled-toggle",
        this.props.disabled && "uicore-disabled",
        this.props.className,
      )}>
        <ToggleSwitch className={className} style={style} {...props} />
        {label &&
          <div className={classnames("uicore-label", labelClassName)}>{label}</div>
        }
      </label>
    );
  }
}
