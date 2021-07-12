/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./Group.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";
import { HorizontalAnchor, HorizontalAnchorHelpers, VerticalAnchor, VerticalAnchorHelpers } from "../../Stacked";

/** Available handle modes.
 * @alpha
 */
export enum HandleMode {
  Hovered,
  Visible,
  Timedout,
}

/** Helpers for [[HandleMode]].
 * @alpha
 */
export class HandleModeHelpers {
  /** Class name of [[HandleMode.Hovered]] */
  public static readonly HOVERED_CLASS_NAME = "nz-handle-hovered";
  /** Class name of [[HandleMode.Visible]] */
  public static readonly VISIBLE_CLASS_NAME = "nz-handle-visible";
  /** Class name of [[HandleMode.Timedout]] */
  public static readonly TIMEDOUT_CLASS_NAME = "nz-handle-timedout";

  /** @returns Class name of specified [[HandleMode]] */
  public static getCssClassName(mode: HandleMode): string {
    switch (mode) {
      case HandleMode.Hovered:
        return HandleModeHelpers.HOVERED_CLASS_NAME;
      case HandleMode.Visible:
        return HandleModeHelpers.VISIBLE_CLASS_NAME;
      case HandleMode.Timedout:
        return HandleModeHelpers.TIMEDOUT_CLASS_NAME;
    }
  }
}

/** Properties of [[TabGroup]] component.
 * @alpha
 */
export interface TabGroupProps extends CommonProps {
  /** Actual tabs. See: [[Tab]], [[TabSeparator]] */
  children?: React.ReactNode;
  /** Describes handle mode of this tab group. */
  handle: HandleMode;
  /** Describes to which side the widget of this tab is anchored. */
  horizontalAnchor: HorizontalAnchor;
  /** Describes if the tab group is collapsed. */
  isCollapsed?: boolean;
  /** Describes to which side the widget is vertically anchored. */
  verticalAnchor: VerticalAnchor;
}

/** Tab group component for stacked widget.
 * @alpha
 */
export class TabGroup extends React.PureComponent<TabGroupProps> {
  public override render() {
    const className = classnames(
      "nz-widget-rectangular-tab-group",
      this.props.isCollapsed && "nz-collapsed",
      HandleModeHelpers.getCssClassName(this.props.handle),
      HorizontalAnchorHelpers.getCssClassName(this.props.horizontalAnchor),
      VerticalAnchorHelpers.getCssClassName(this.props.verticalAnchor),
      this.props.className);

    return (
      <div
        className={className}
        style={this.props.style}
      >
        {this.props.children}
      </div>
    );
  }
}
