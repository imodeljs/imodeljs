/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./Tab.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[ToolSettingsTab]] component.
 * @beta
 */
export interface ToolSettingsTabProps extends CommonProps {
  /** Tab icon. */
  children?: React.ReactNode;
  /** Function called when the tab is clicked. */
  onClick?: () => void;
  /** Function called when a key is pressed. */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /** Tab title. */
  title?: string;
  /** Handler for mouse enter */
  onMouseEnter?: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  /** Handler for mouse leave */
  onMouseLeave?: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
}

/** Tool settings widget tab is displayed when the [[ToolSettings]] widget is closed.
 * @note Used in [[Zone]] component.
 * @beta
 */
export class ToolSettingsTab extends React.PureComponent<ToolSettingsTabProps> {
  public override render() {
    const className = classnames(
      "nz-widget-toolSettings-tab",
      this.props.className);

    return (
      <button
        className={className}
        onClick={this.props.onClick}
        onKeyDown={this.props.onKeyDown}
        style={this.props.style}
        title={this.props.title}
        onMouseEnter={this.props.onMouseEnter}
        onMouseLeave={this.props.onMouseLeave}
      >
        {this.props.children}
      </button>
    );
  }
}
