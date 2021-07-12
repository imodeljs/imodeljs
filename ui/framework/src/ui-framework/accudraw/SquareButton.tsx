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
import { Omit } from "@bentley/ui-core";
import { Button, ButtonProps } from "@itwin/itwinui-react";

/** @alpha */
export interface SquareButtonProps extends Omit<ButtonProps, "size" | "styleType"> { } // eslint-disable-line @typescript-eslint/no-empty-interface

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
      <Button {...buttonProps} size="small" className={buttonClassNames} style={buttonStyle} />
    );
  }
}
