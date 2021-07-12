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
import { CommonProps, PointProps, Rectangle, RectangleProps } from "@bentley/ui-core";
import { DragHandle } from "../../../base/DragHandle";
import { HorizontalAnchor, HorizontalAnchorHelpers, VerticalAnchor, VerticalAnchorHelpers } from "../../Stacked";

/** Describes available tab modes.
 * @alpha
 */
export enum TabMode {
  Closed,
  Open,
  Active,
}

/** Helpers for [[TabMode]].
 * @alpha
 */
export class TabModeHelpers {
  /** Class name of [[TabMode.Closed]] */
  public static readonly CLOSED_CLASS_NAME = "nz-mode-closed";
  /** Class name of [[TabMode.Open]] */
  public static readonly OPEN_CLASS_NAME = "nz-mode-open";
  /** Class name of [[TabMode.Active]] */
  public static readonly ACTIVE_CLASS_NAME = "nz-mode-active";

  /** @returns Class name of specified [[TabMode]] */
  public static getCssClassName(mode: TabMode): string {
    switch (mode) {
      case TabMode.Closed:
        return TabModeHelpers.CLOSED_CLASS_NAME;
      case TabMode.Open:
        return TabModeHelpers.OPEN_CLASS_NAME;
      case TabMode.Active:
        return TabModeHelpers.ACTIVE_CLASS_NAME;
    }
  }
}

/** Properties of [[Tab]] component.
 * @alpha
 */
export interface TabProps extends CommonProps {
  /** A badge to draw. */
  badge?: React.ReactNode;
  /** Tab icon. */
  children?: React.ReactNode;
  /** Describes to which side the widget of this tab is anchored. */
  horizontalAnchor: HorizontalAnchor;
  /** Describes if the tab is collapsed. */
  isCollapsed?: boolean;
  /** Describes if the tab is protruded when active. */
  isProtruding: boolean;
  /** Last pointer position of draggable tab. */
  lastPosition?: PointProps;
  /** Describes current tab mode. */
  mode: TabMode;
  /** Function called when the tab is clicked. */
  onClick?: () => void;
  /** Function called when tab is dragged. */
  onDrag?: (dragged: PointProps) => void;
  /** Function called when tab drag action is started.
   * @param initialPosition Initial pointer position in window coordinates.
   */
  onDragStart?: (initialPosition: PointProps) => void;
  /** Function called when tab drag action is finished. */
  onDragEnd?: () => void;
  /** Title for the tab. */
  title?: string;
  /** Describes to which side the widget is vertically anchored. */
  verticalAnchor: VerticalAnchor;
}

/** Default properties of [[Tab]] component.
 * @alpha
 */
type TabDefaultProps = Pick<TabProps, "isProtruding">;

/** Rectangular widget tab. Used in [[Stacked]] component.
 * @alpha
 */
export class Tab extends React.PureComponent<TabProps> {
  private _tab = React.createRef<HTMLDivElement>();

  public static defaultProps: TabDefaultProps = {
    isProtruding: true,
  };

  public getBounds(): RectangleProps {
    if (!this._tab.current)
      return new Rectangle();
    return this._tab.current.getBoundingClientRect();
  }

  public override render() {
    const className = classnames(
      "nz-widget-rectangular-tab-tab",
      this.props.isProtruding && "nz-protruding",
      this.props.isCollapsed && "nz-collapsed",
      HorizontalAnchorHelpers.getCssClassName(this.props.horizontalAnchor),
      VerticalAnchorHelpers.getCssClassName(this.props.verticalAnchor),
      TabModeHelpers.getCssClassName(this.props.mode),
      this.props.className);

    return (
      <div
        className={className}
        ref={this._tab}
        style={this.props.style}
        title={this.props.title}
      >
        {this.props.children}
        {this.props.badge &&
          <div className="nz-badge">
            {this.props.badge}
          </div>
        }
        <DragHandle
          className="nz-draggable"
          lastPosition={this.props.lastPosition}
          onClick={this.props.onClick}
          onDrag={this.props.onDrag}
          onDragEnd={this.props.onDragEnd}
          onDragStart={this.props.onDragStart}
        />
      </div>
    );
  }
}
