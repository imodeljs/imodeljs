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
import { Toggle, ToggleProps } from "./Toggle";

/** Properties for [[LabeledToggle]]
 * @public
 */
export interface LabeledToggleProps extends ToggleProps {
  /** Text that will be shown next to the Toggle. */
  label?: string;
  /** Custom CSS class name for the label */
  labelClassName?: string;
  /** Custom CSS Style for the label */
  labelStyle?: React.CSSProperties;
}

/** Toggle component with a Label to the right
 * @public
 */
export class LabeledToggle extends React.PureComponent<LabeledToggleProps> {
  public override render(): JSX.Element {
    const { label, labelClassName, className, style, ...props } = this.props;

    return (
      <label style={this.props.style} className={classnames(
        "core-inputs-labeled-toggle",
        this.props.disabled && "uicore-disabled",
        this.props.className,
      )}>
        <Toggle className={className} style={style} {...props} />
        {label &&
          <div className={classnames("uicore-label", labelClassName)}>{label}</div>
        }
      </label>
    );
  }
}
