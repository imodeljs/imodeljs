/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./ToolSettings.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, Point, PointProps, Rectangle, RectangleProps } from "@bentley/ui-core";
import { DragHandle } from "../base/DragHandle";
import { TitleBar } from "../footer/dialog/TitleBar";
import { ResizeDirection, ResizeGrip, ResizeGripResizeArgs } from "./rectangular/ResizeGrip";
import { ResizeHandle } from "./Stacked";

/** Properties of [[ToolSettings]] component.
 * @beta
 */
export interface ToolSettingsProps extends CommonProps {
  /** Title bar buttons. I.e. [[TitleBarButton]] */
  buttons?: React.ReactNode;
  /** Tool settings content or content container. I.e. [[NestedToolSettings]], [[ScrollableToolSettings]] */
  children?: React.ReactNode;
  /** Content ref of this widget. */
  contentRef?: React.Ref<HTMLDivElement>;
  /** Describes if the widget should fill the zone. */
  fillZone?: boolean;
  /** Last pointer position of draggable tab. */
  lastPosition?: PointProps;
  /** Function called when widget is dragged. */
  onDrag?: (dragged: PointProps) => void;
  /** Function called when widget drag action is started.
   * @param initialPosition Initial pointer position in window coordinates.
   */
  onDragStart?: (initialPosition: PointProps) => void;
  /** Function called when widget drag action is finished. */
  onDragEnd?: () => void;
  /** Handler for mouse enter */
  onMouseEnter?: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  /** Handler for mouse leave */
  onMouseLeave?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  /** Function called when resize action is performed. */
  onResize?: (resizeBy: number, handle: ResizeHandle) => void;
  /** Tool settings title bar title. */
  title?: string;
}

/** Tool settings widget is used to display Tool Settings and Tool Assistance (in Zone 2 of 9-Zone UI).
 * @note Should be placed in [[Zone]] component.
 * @beta
 */
export class ToolSettings extends React.PureComponent<ToolSettingsProps> {
  private _widget = React.createRef<HTMLDivElement>();
  private _relativePosition?: Point;

  public getBounds(): RectangleProps {
    if (!this._widget.current)
      return new Rectangle();
    return this._widget.current.getBoundingClientRect();
  }

  public override render() {
    const className = classnames(
      "nz-widget-toolSettings",
      this.props.fillZone && "nz-fill",
      this.props.onDrag && "nz-draggable",
      this.props.className);

    return (
      <div
        className={className}
        style={this.props.style}
      >
        <div
          className="nz-widget"
          onMouseEnter={this.props.onMouseEnter}
          onMouseLeave={this.props.onMouseLeave}
          ref={this._widget}
        >
          <DragHandle
            className="nz-handle"
            lastPosition={this.props.lastPosition}
            onDrag={this.props.onDrag}
            onDragEnd={this.props.onDragEnd}
            onDragStart={this.props.onDragStart}
          >
            <TitleBar
              className="nz-title"
              title={this.props.title}
            >
              {this.props.buttons}
            </TitleBar>
          </DragHandle>
          <div
            className="nz-content"
            ref={this.props.contentRef}
          >
            {this.props.children}
          </div>
          {this.props.onResize && (<>
            <ResizeGrip
              className="nz-left-grip"
              direction={ResizeDirection.EastWest}
              onResize={this._handleLeftGripResize}
              onResizeEnd={this._handleResizeEnd}
              onResizeStart={this._handleResizeStart}
            />
            <ResizeGrip
              className="nz-top-grip"
              direction={ResizeDirection.NorthSouth}
              onResize={this._handleTopGripResize}
              onResizeEnd={this._handleResizeEnd}
              onResizeStart={this._handleResizeStart}
            />
            <ResizeGrip
              className="nz-right-grip"
              direction={ResizeDirection.EastWest}
              onResize={this._handleRightGripResize}
              onResizeEnd={this._handleResizeEnd}
              onResizeStart={this._handleResizeStart}
            />
            <ResizeGrip
              className="nz-bottom-grip"
              direction={ResizeDirection.NorthSouth}
              onResize={this._handleBottomGripResize}
              onResizeEnd={this._handleResizeEnd}
              onResizeStart={this._handleResizeStart}
            />
          </>)}
        </div>
      </div>
    );
  }

  private getResizeDifference(args: ResizeGripResizeArgs): PointProps | undefined {
    if (!this._relativePosition)
      return undefined;

    const bounds = Rectangle.create(args.bounds);
    const relativePosition = bounds.topLeft().getOffsetTo(args.position);
    return this._relativePosition.getOffsetTo(relativePosition);
  }

  private _handleResizeStart = (args: ResizeGripResizeArgs) => {
    const bounds = Rectangle.create(args.bounds);
    this._relativePosition = bounds.topLeft().getOffsetTo(args.position);
  };

  private _handleResizeEnd = () => {
    this._relativePosition = undefined;
  };

  private _handleLeftGripResize = (args: ResizeGripResizeArgs) => {
    const difference = this.getResizeDifference(args);
    difference && this.props.onResize && this.props.onResize(difference.x, ResizeHandle.Left);
  };

  private _handleTopGripResize = (args: ResizeGripResizeArgs) => {
    const difference = this.getResizeDifference(args);
    difference && this.props.onResize && this.props.onResize(difference.y, ResizeHandle.Top);
  };

  private _handleRightGripResize = (args: ResizeGripResizeArgs) => {
    const difference = this.getResizeDifference(args);
    difference && this.props.onResize && this.props.onResize(difference.x, ResizeHandle.Right);
  };

  private _handleBottomGripResize = (args: ResizeGripResizeArgs) => {
    const difference = this.getResizeDifference(args);
    difference && this.props.onResize && this.props.onResize(difference.y, ResizeHandle.Bottom);
  };
}
