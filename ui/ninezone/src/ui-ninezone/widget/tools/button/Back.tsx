/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./Back.scss";
import classnames from "classnames";
import * as React from "react";
import { NoChildrenProps, OmitChildrenProp } from "@bentley/ui-core";
import { ToolbarIcon, ToolbarIconProps } from "./Icon";

/** Properties of [[BackButton]] component.
 * @alpha
 */
export interface BackButtonProps extends OmitChildrenProp<ToolbarIconProps>, NoChildrenProps {
}

/** Back button which displays icon. Used in [[Toolbar]] component.
 * @note See basic button: [[ToolbarButton]]
 * @alpha
 */
export class BackButton extends React.PureComponent<BackButtonProps> {
  public override render() {
    const { className, ...props } = this.props;
    const buttonClassName = classnames(
      "nz-toolbar-button-back",
      className);

    return (
      <ToolbarIcon
        className={buttonClassName}
        {...props}
      />
    );
  }
}
