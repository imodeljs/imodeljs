/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./Stacked.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, NoChildrenProps, Point, PointProps, Rectangle, RectangleProps } from "@bentley/ui-core";
import { DisabledResizeHandles, DisabledResizeHandlesHelpers } from "../utilities/DisabledResizeHandles";
import { ResizeDirection, ResizeGrip, ResizeGripResizeArgs } from "./rectangular/ResizeGrip";

/** Available [[Stacked]] widget horizontal anchors.
 * @beta
 */
export enum HorizontalAnchor {
  Left,
  Right,
}

/** Available [[Stacked]] widget vertical anchors.
 * @beta
 */
export enum VerticalAnchor {
  Bottom,
  BottomPanel,
  Middle,
  TopPanel,
}

/** Available resize handles of rectangular widget.
 * @beta
 */
export enum ResizeHandle {
  Left,
  Top,
  Right,
  Bottom,
}

/** Helpers for [[HorizontalAnchor]].
 * @internal
 */
export class HorizontalAnchorHelpers {
  /** Class name of [[HorizontalAnchor.Left]] */
  public static readonly LEFT_CLASS_NAME = "nz-left-anchor";
  /** Class name of [[HorizontalAnchor.Right]] */
  public static readonly RIGHT_CLASS_NAME = "nz-right-anchor";

  /** @returns Class name of specified [[HorizontalAnchor]] */
  public static getCssClassName(anchor: HorizontalAnchor): string {
    switch (anchor) {
      case HorizontalAnchor.Left:
        return HorizontalAnchorHelpers.LEFT_CLASS_NAME;
      case HorizontalAnchor.Right:
        return HorizontalAnchorHelpers.RIGHT_CLASS_NAME;
    }
  }
}

/** Helpers for [[VerticalAnchor]].
 * @internal
 */
export class VerticalAnchorHelpers {
  /** Class name of [[VerticalAnchor.Bottom]] */
  public static readonly BOTTOM_CLASS_NAME = "nz-bottom-anchor";
  /** Class name of [[VerticalAnchor.Bottom]] */
  public static readonly BOTTOM_PANEL_CLASS_NAME = "nz-bottom-panel-anchor";
  /** Class name of [[VerticalAnchor.Middle]] */
  public static readonly MIDDLE_CLASS_NAME = "nz-middle-anchor";
  /** Class name of [[VerticalAnchor.Bottom]] */
  public static readonly TOP_PANEL_CLASS_NAME = "nz-top-panel-anchor";

  /** @returns Class name of specified [[VerticalAnchor]] */
  public static getCssClassName(anchor: VerticalAnchor): string {
    switch (anchor) {
      case VerticalAnchor.Bottom:
        return VerticalAnchorHelpers.BOTTOM_CLASS_NAME;
      case VerticalAnchor.BottomPanel:
        return VerticalAnchorHelpers.BOTTOM_PANEL_CLASS_NAME;
      case VerticalAnchor.Middle:
        return VerticalAnchorHelpers.MIDDLE_CLASS_NAME;
      case VerticalAnchor.TopPanel:
        return VerticalAnchorHelpers.TOP_PANEL_CLASS_NAME;
    }
  }

  /** @returns Returns true if [[VerticalAnchor]] defines horizontal stacked widget. */
  public static isHorizontal(anchor: VerticalAnchor) {
    switch (anchor) {
      case VerticalAnchor.BottomPanel:
      case VerticalAnchor.TopPanel:
        return true;
      default:
        return false;
    }
  }
}

/** Properties of [[Stacked]] component.
 * @alpha
 */
export interface StackedProps extends CommonProps, NoChildrenProps {
  /** Content of this widget. I.e. [[WidgetContent]] */
  content?: React.ReactNode;
  /** Content ref of this widget. */
  contentRef?: React.Ref<HTMLDivElement>;
  /** Describes disabled resize handles. */
  disabledResizeHandles?: DisabledResizeHandles;
  /** Describes if the widget should fill the zone. */
  fillZone?: boolean;
  /** Describes to which side the widget is horizontally anchored. */
  horizontalAnchor: HorizontalAnchor;
  /** Describes if the widget is in collapsed stage panel. */
  isCollapsed?: boolean;
  /** Describes if the widget is being dragged. */
  isDragged?: boolean;
  /** Describes if the widget is floating. */
  isFloating?: boolean;
  /** True if widget is open, false otherwise. */
  isOpen?: boolean;
  /** Describes if the tab bar is visible. */
  isTabBarVisible?: boolean;
  /** Function called when resize action is performed. */
  onResize?: (resizeBy: number, handle: ResizeHandle, filledHeightDiff: number) => void;
  /** Widget tabs. See: [[Tab]], [[TabSeparator]], [[Group]] */
  tabs?: React.ReactNode;
  /** Describes to which side the widget is vertically anchored. */
  verticalAnchor: VerticalAnchor;
  /** Handler for mouse enter */
  onMouseEnter?: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  /** Handler for mouse leave */
  onMouseLeave?: (event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
}

/** Stacked widget is used to display multiple tabs and some content.
 * @note Should be placed in [[Zone]] component.
 * @alpha
 */
export class Stacked extends React.PureComponent<StackedProps> {
  private _widget = React.createRef<HTMLDivElement>();
  private _relativePosition?: Point;

  public getBounds(): RectangleProps {
    if (!this._widget.current)
      return new Rectangle();
    return this._widget.current.getBoundingClientRect();
  }

  public override render() {
    const className = classnames(
      "nz-widget-stacked",
      !this.props.isOpen && "nz-closed",
      this.props.isDragged && "nz-dragged",
      this.props.isFloating && "nz-floating",
      this.props.fillZone && "nz-fill-zone",
      this.props.isCollapsed && "nz-collapsed",
      HorizontalAnchorHelpers.getCssClassName(this.props.horizontalAnchor),
      VerticalAnchorHelpers.getCssClassName(this.props.verticalAnchor),
      this.props.className);

    const isHorizontal = VerticalAnchorHelpers.isHorizontal(this.props.verticalAnchor);

    const isSecondaryGripEnabled = isGripEnabled(getSecondaryGripHandle(this.props), this.props);
    const isContentGripEnabled = isGripEnabled(getContentGripHandle(this.props), this.props);
    const isTabsGripEnabled = isGripEnabled(getTabsGripHandle(this.props), this.props);
    const isPrimaryGripEnabled = isGripEnabled(getPrimaryGripHandle(this.props), this.props);
    return (
      <div
        className={className}
        style={this.props.style}
        ref={this._widget}
        onMouseEnter={this.props.onMouseEnter}
        onMouseLeave={this.props.onMouseLeave}
      >
        {this.props.isTabBarVisible && <div className="nz-tab-bar" />}
        <div className="nz-content-container">
          <div
            className="nz-content"
            ref={this.props.contentRef}
          >
            {this.props.content}
          </div>
          {isSecondaryGripEnabled && <ResizeGrip
            className="nz-secondary-grip"
            direction={isHorizontal ? ResizeDirection.EastWest : ResizeDirection.NorthSouth}
            onResize={this._handleSecondaryGripResize}
            onResizeEnd={this._handleResizeEnd}
            onResizeStart={this._handleResizeStart}
          />}
          {isContentGripEnabled && <ResizeGrip
            className="nz-content-grip"
            direction={isHorizontal ? ResizeDirection.NorthSouth : ResizeDirection.EastWest}
            onResize={this._handleContentGripResize}
            onResizeEnd={this._handleResizeEnd}
            onResizeStart={this._handleResizeStart}
          />}
        </div>
        <div className="nz-tabs-column">
          <div className="nz-tabs">
            {this.props.tabs}
          </div>
          <div className="nz-tabs-grip-container">
            {isTabsGripEnabled && <ResizeGrip
              className="nz-tabs-grip"
              direction={isHorizontal ? ResizeDirection.NorthSouth : ResizeDirection.EastWest}
              onResize={this._handleTabsGripResize}
              onResizeEnd={this._handleResizeEnd}
              onResizeStart={this._handleResizeStart}
            />}
          </div>
        </div>
        <div className="nz-height-expander" />
        {isPrimaryGripEnabled && <ResizeGrip
          className="nz-primary-grip"
          direction={isHorizontal ? ResizeDirection.EastWest : ResizeDirection.NorthSouth}
          onResize={this._handlePrimaryGripResize}
          onResizeEnd={this._handleResizeEnd}
          onResizeStart={this._handleResizeStart}
        />}
      </div>
    );
  }

  private getFilledHeightDiff(): number {
    const widget = this._widget.current;
    if (!widget)
      return 0;

    const heightStyle = widget.style.height;
    const height = widget.clientHeight;

    widget.style.height = "100%";
    const filledHeight = widget.clientHeight;

    widget.style.height = heightStyle;

    const offset = filledHeight - height;
    return offset;
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

  private _handleTabsGripResize = (args: ResizeGripResizeArgs) => {
    const difference = this.getResizeDifference(args);
    if (!difference)
      return;
    const filledHeightDiff = this.getFilledHeightDiff();
    const handle = getTabsGripHandle(this.props);
    const resizeBy = getResizeBy(difference, handle);
    this.props.onResize && this.props.onResize(resizeBy, handle, filledHeightDiff);
  };

  private _handleContentGripResize = (args: ResizeGripResizeArgs) => {
    const difference = this.getResizeDifference(args);
    if (!difference)
      return;
    const filledHeightDiff = this.getFilledHeightDiff();
    const handle = getContentGripHandle(this.props);
    const resizeBy = getResizeBy(difference, handle);
    this.props.onResize && this.props.onResize(resizeBy, handle, filledHeightDiff);
  };

  private _handlePrimaryGripResize = (args: ResizeGripResizeArgs) => {
    const difference = this.getResizeDifference(args);
    if (!difference)
      return;
    const filledHeightDiff = this.getFilledHeightDiff();
    const handle = getPrimaryGripHandle(this.props);
    const resizeBy = getResizeBy(difference, handle);
    this.props.onResize && this.props.onResize(resizeBy, handle, filledHeightDiff);
  };

  private _handleSecondaryGripResize = (args: ResizeGripResizeArgs) => {
    const difference = this.getResizeDifference(args);
    if (!difference)
      return;
    const handle = getSecondaryGripHandle(this.props);
    const resizeBy = getResizeBy(difference, handle);
    const filledHeightDiff = this.getFilledHeightDiff();
    this.props.onResize && this.props.onResize(resizeBy, handle, filledHeightDiff);
  };
}

const getSecondaryGripHandle = (props: Pick<StackedProps, "verticalAnchor">) => {
  if (VerticalAnchorHelpers.isHorizontal(props.verticalAnchor))
    return ResizeHandle.Right;
  return ResizeHandle.Bottom;
};

const getContentGripHandle = (props: Pick<StackedProps, "horizontalAnchor" | "verticalAnchor">) => {
  if (props.verticalAnchor === VerticalAnchor.BottomPanel)
    return ResizeHandle.Bottom;
  if (props.verticalAnchor === VerticalAnchor.TopPanel)
    return ResizeHandle.Top;
  if (props.horizontalAnchor === HorizontalAnchor.Left)
    return ResizeHandle.Left;
  return ResizeHandle.Right;
};

const getTabsGripHandle = (props: Pick<StackedProps, "horizontalAnchor" | "verticalAnchor">) => {
  if (props.verticalAnchor === VerticalAnchor.BottomPanel)
    return ResizeHandle.Top;
  if (props.verticalAnchor === VerticalAnchor.TopPanel)
    return ResizeHandle.Bottom;
  if (props.horizontalAnchor === HorizontalAnchor.Left)
    return ResizeHandle.Right;
  return ResizeHandle.Left;
};

const getPrimaryGripHandle = (props: Pick<StackedProps, "verticalAnchor">) => {
  if (VerticalAnchorHelpers.isHorizontal(props.verticalAnchor))
    return ResizeHandle.Left;
  return ResizeHandle.Top;
};

const getResizeBy = (difference: PointProps, resizeHandle: ResizeHandle) => {
  switch (resizeHandle) {
    case ResizeHandle.Top:
    case ResizeHandle.Bottom:
      return difference.y;
    default:
      return difference.x;
  }
};

const isGripEnabled = (resizeHandle: ResizeHandle, props: Pick<StackedProps, "disabledResizeHandles" | "onResize">) => {
  const disabledResizeHandles = props.disabledResizeHandles === undefined ? DisabledResizeHandles.None : props.disabledResizeHandles;
  let isDisabled;
  switch (resizeHandle) {
    case ResizeHandle.Left:
      isDisabled = DisabledResizeHandlesHelpers.isLeftDisabled(disabledResizeHandles);
      break;
    case ResizeHandle.Right:
      isDisabled = DisabledResizeHandlesHelpers.isRightDisabled(disabledResizeHandles);
      break;
    case ResizeHandle.Top:
      isDisabled = DisabledResizeHandlesHelpers.isTopDisabled(disabledResizeHandles);
      break;
    case ResizeHandle.Bottom:
      isDisabled = DisabledResizeHandlesHelpers.isBottomDisabled(disabledResizeHandles);
      break;
  }
  return !!props.onResize && !isDisabled;
};
