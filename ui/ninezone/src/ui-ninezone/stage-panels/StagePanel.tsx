/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module StagePanels
 */

import "./StagePanel.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, Point, Rectangle } from "@bentley/ui-core";
import { SafeAreaInsets, SafeAreaInsetsHelpers } from "../utilities/SafeAreaInsets";
import { ResizeDirection, ResizeGrip, ResizeGripResizeArgs } from "../widget/rectangular/ResizeGrip";

/** Describes available stage panel types.
 * @beta
 */
export enum StagePanelType {
  Bottom,
  Left,
  Top,
  Right,
}

/** Helpers for [[StagePanelType]].
 * @internal
 */
export class StagePanelTypeHelpers {
  /** @returns Class name of specified [[StagePanelType]] */
  public static getCssClassName(type: StagePanelType): string {
    switch (type) {
      case StagePanelType.Bottom:
        return "nz-panel-bottom";
      case StagePanelType.Left:
        return "nz-panel-left";
      case StagePanelType.Right:
        return "nz-panel-right";
      case StagePanelType.Top:
        return "nz-panel-top";
    }
  }

  /** Returns true if stage panel with specified [[StagePanelType]] is vertical. */
  public static isVertical(type: StagePanelType): boolean {
    switch (type) {
      case StagePanelType.Bottom:
      case StagePanelType.Top:
        return false;
      case StagePanelType.Left:
      case StagePanelType.Right:
        return true;
    }
  }
}

/** Properties of [[StagePanel]] component.
 * @beta
 */
export interface StagePanelProps extends CommonProps {
  /** Stage panel content. */
  children?: React.ReactNode;
  /** Function called when stage panel collapse mode is toggled. */
  onToggleCollapse?: () => void;
  /** Function called when resize action is performed. */
  onResize?: (resizeBy: number) => void;
  /** Describes respected safe area insets. */
  safeAreaInsets?: SafeAreaInsets;
  /** Stage panel size. */
  size?: number;
  /** Stage panel type. */
  type: StagePanelType;
}

/** Stage panel used in [[StagePanels]] component.
 * @beta
 */
export class StagePanel extends React.PureComponent<StagePanelProps> {
  private _lastPosition?: Point;
  private _relativePosition?: Point;

  public override render() {
    const className = classnames(
      "nz-stagePanels-stagePanel",
      StagePanelTypeHelpers.getCssClassName(this.props.type),
      this.props.safeAreaInsets && SafeAreaInsetsHelpers.getCssClassNames(this.props.safeAreaInsets),
      this.props.className);
    const isVertical = StagePanelTypeHelpers.isVertical(this.props.type);
    const style = {
      ...this.props.size === undefined ? undefined :
        isVertical ? { width: `${this.props.size}px` } : { height: `${this.props.size}px` },
      ...this.props.style,
    };
    return (
      <div
        className={className}
        style={style}
      >
        <div>
          {this.props.children}
        </div>
        {this.props.onResize && <ResizeGrip
          className="nz-resize-grip"
          direction={isVertical ? ResizeDirection.EastWest : ResizeDirection.NorthSouth}
          onClick={this.props.onToggleCollapse}
          onResize={this._handleResize}
          onResizeEnd={this._handleResizeEnd}
          onResizeStart={this._handleResizeStart}
        />}
      </div>
    );
  }

  private _handleResize = (args: ResizeGripResizeArgs) => {
    if (!this._lastPosition || !this._relativePosition)
      return;

    const bounds = Rectangle.create(args.bounds);
    const relativePosition = bounds.topLeft().getOffsetTo(args.position);
    const resizeOffset = this._relativePosition.getOffsetTo(relativePosition);
    const dragOffset = this._lastPosition.getOffsetTo(args.position);

    const isVertical = StagePanelTypeHelpers.isVertical(this.props.type);
    const dragBy = isVertical ? dragOffset.x : dragOffset.y;
    const resizeBy = isVertical ? resizeOffset.x : resizeOffset.y;

    this._lastPosition = Point.create(args.position);

    if (dragBy * resizeBy <= 0)
      return;

    const direction = this.props.type === StagePanelType.Left || this.props.type === StagePanelType.Top ? 1 : -1;
    this.props.onResize && this.props.onResize(direction * resizeBy);
  };

  private _handleResizeEnd = () => {
    this._lastPosition = undefined;
    this._relativePosition = undefined;
  };

  private _handleResizeStart = (args: ResizeGripResizeArgs) => {
    const bounds = Rectangle.create(args.bounds);
    this._relativePosition = bounds.topLeft().getOffsetTo(args.position);
    this._lastPosition = Point.create(args.position);
  };
}
