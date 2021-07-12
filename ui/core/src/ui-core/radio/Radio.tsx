/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Radio
 */

import classnames from "classnames";
import * as React from "react";
import { LabeledComponentProps } from "../inputs/LabeledComponentProps";
import { CommonProps } from "../utils/Props";

/** Properties for [[Radio]] component
 * @public
 * @deprecated Use RadioProps in itwinui-react instead
 */
export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement>, CommonProps, LabeledComponentProps { }

/** Basic radio input component is a wrapper for the `<input type="radio">` HTML element.
 * @public
 * @deprecated Use Radio in itwinui-react instead
 */
export class Radio extends React.PureComponent<RadioProps> {  // eslint-disable-line deprecation/deprecation
  public override render(): JSX.Element {
    const { label, disabled, status, className, style, inputStyle, inputClassName, type, ...props } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars

    return (
      <label style={style} className={classnames(
        "uicore-inputs-radio",
        disabled && "core-disabled",
        status,
        className,
      )}>
        {label &&
          <span>{label}</span>
        }
        <input type={"radio"} className={inputClassName} style={inputStyle} disabled={disabled} {...props} />
        <span className="core-radio-checkmark"></span>
      </label>
    );
  }
}
