/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Toolbar
 */

import "./App.scss";
import classnames from "classnames";
import * as React from "react";
import { NoChildrenProps, OmitChildrenProp } from "@bentley/ui-core";
import { ToolbarIcon, ToolbarIconProps } from "./Icon";

/** Properties of [[BackButton]] component.
 * @alpha
 */
export interface AppButtonProps extends OmitChildrenProp<ToolbarIconProps>, NoChildrenProps {
  /** Indicates whether to use a small App button */
  small?: boolean;
  /** Mouse proximity to button */
  mouseProximity?: number;
}

/** App button which displays icon. Used in [[Toolbar]] component.
 * @note See basic button: [[ToolbarButton]]
 * @alpha
 */
export class AppButton extends React.PureComponent<AppButtonProps> {
  public override render() {
    const { className, small, ...props } = this.props;

    const buttonClassName = (small) ? classnames("nz-toolbar-button-app-small", className) : classnames("nz-toolbar-button-app", className);

    return (
      <ToolbarIcon
        className={buttonClassName}
        icon={this.props.icon}
        small={!!small}
        {...props}
      >
        <div className="nz-bars">
          <div className="nz-bar" />
          <div className="nz-bar" />
          <div className="nz-bar" />
        </div>
      </ToolbarIcon>
    );
  }
}
