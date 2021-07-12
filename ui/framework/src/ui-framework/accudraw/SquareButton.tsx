/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module AccuDraw
 */

import "./SquareButton.scss";
import classnames from "classnames";
import * as React from "react";
import { Button, ButtonProps, ButtonType, Omit } from "@bentley/ui-core";

/** @alpha */
export interface SquareButtonProps extends Omit<ButtonProps, "size" | "buttonType"> { } // eslint-disable-line @typescript-eslint/no-empty-interface

/** @alpha */
export class SquareButton extends React.PureComponent<SquareButtonProps> {
  public override render() {
    const { className, style, ...buttonProps } = this.props;

    const buttonClassNames = classnames(
      "uifw-square-button",
      className,
    );
    const buttonStyle: React.CSSProperties = {
      ...style,
    };

    return (
      <Button {...buttonProps} buttonType={ButtonType.Hollow} className={buttonClassNames} style={buttonStyle} />
    );
  }
}
