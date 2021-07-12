/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./Tools.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, NoChildrenProps } from "@bentley/ui-core";

/** Properties of [[Tools]] component.
 * @alpha
 */
export interface ToolsProps extends CommonProps, NoChildrenProps {
  /**
   * Button displayed between horizontal and vertical toolbars.
   * I.e. [[AppButton]] in Tools zone or navigation aid control in Navigation zone.
   */
  button?: React.ReactNode;
  /** Horizontal toolbar. See [[Toolbar]] */
  horizontalToolbar?: React.ReactNode;
  /**
   * True if this widget is used in Navigation zone.
   * Controls how the toolbars and button are aligned.
   */
  isNavigation?: boolean;
  /** Vertical toolbar. See [[Toolbar]] */
  verticalToolbar?: React.ReactNode;
  /** Pass true to reduce the distance between toolbars when [[ToolsProps.button]] is not provided. */
  preserveSpace?: boolean;
  /** Handler for mouse enter */
  onMouseEnter?: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  /** Handler for mouse leave */
  onMouseLeave?: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
}

/** Tools widget is used in Tools (Zone 1) and Navigation (Zone 3) zones of 9-Zone UI.
 * @note Should be placed in [[Zone]] component.
 * @alpha
 */
export class Tools extends React.PureComponent<ToolsProps> {
  public override render() {
    const singleToolbar = (this.props.verticalToolbar !== undefined && this.props.horizontalToolbar === undefined) ||
      (this.props.verticalToolbar === undefined && this.props.horizontalToolbar !== undefined);
    const noGap = singleToolbar && this.props.button === undefined;
    const reducedGap = !singleToolbar && this.props.button === undefined && this.props.preserveSpace;
    const className = classnames(
      "nz-widget-tools",
      noGap && "nz-no-gap",
      reducedGap && "nz-reduced-gap",
      this.props.isNavigation && "nz-navigation",
      this.props.className);

    return (
      <div className={className} style={this.props.style}>
        <div className="nz-app-button"
          onMouseEnter={this.props.onMouseEnter}
          onMouseLeave={this.props.onMouseLeave}
        >
          {this.props.button}
        </div>
        <div className="nz-horizontal-toolbar"
          onMouseEnter={this.props.onMouseEnter}
          onMouseLeave={this.props.onMouseLeave}
        >
          {this.props.horizontalToolbar}
        </div>
        <div className="nz-vertical-toolbar"
          onMouseEnter={this.props.onMouseEnter}
          onMouseLeave={this.props.onMouseLeave}
        >
          {this.props.verticalToolbar}
        </div>
      </div>
    );
  }
}
