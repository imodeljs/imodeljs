/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Button
 */

import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "../utils/Props";

/** Sizes for [[Button]] component
 * @public
 */
export enum ButtonSize {
  Default = "",
  Large = "large",
}

/** Types for [[Button]] component
 * @public
 */
export enum ButtonType {
  Primary = "primary",
  Blue = "blue",
  Disabled = "disabled",
  Hollow = "hollow",
}

/** Properties for [[Button]] component
 * @public
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, CommonProps {
  /** Allow ID to be passed to Button */
  id?: string;
  /** Default and large sizes */
  size?: ButtonSize;
  /** 4 styles to tweak the content of the button */
  buttonType?: ButtonType;
  /** A function to be run when the element is clicked */
  onClick?: ((event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void);
}

/** Generic button component
 * @public
 */
export class Button extends React.PureComponent<ButtonProps> {
  public override render() {
    const { buttonType, size, className, style, onClick, ...props } = this.props;

    let typeClassName = getButtonTypeClassName(buttonType);

    if (size === ButtonSize.Large)
      typeClassName += "-large";

    return <button {...props} className={classnames(typeClassName, className)} style={style} onClick={onClick} />;
  }
}

/** @internal */
export function getButtonTypeClassName(buttonType?: ButtonType): string {
  let typeClassName: string;
  switch (buttonType) {
    case ButtonType.Blue:
      typeClassName = "uicore-buttons-blue";
      break;
    case ButtonType.Disabled:
      typeClassName = "uicore-buttons-disabled";
      break;
    case ButtonType.Hollow:
      typeClassName = "uicore-buttons-hollow";
      break;
    case ButtonType.Primary:
    default:
      typeClassName = "uicore-buttons-primary";
      break;
  }
  return typeClassName;
}
