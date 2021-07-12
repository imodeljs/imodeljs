/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./ResizeGrip.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, Point, PointProps, Rectangle, RectangleProps } from "@bentley/ui-core";
import { PointerCaptor } from "../../base/PointerCaptor";

/** Available resize directions of resize grip.
 * @alpha
 */
export enum ResizeDirection {
  EastWest,
  NorthSouth,
  NorthEast_SouthWest, // eslint-disable-line @typescript-eslint/naming-convention
  NorthWest_SouthEast, // eslint-disable-line @typescript-eslint/naming-convention
}

/** Helpers for [[ResizeDirection]].
 * @alpha
 */
export class ResizeDirectionHelpers {
  /** Class name of [[ResizeDirection.EastWest]] */
  public static readonly EW_CLASS_NAME = "nz-direction-ew";
  /** Class name of [[ResizeDirection.NorthSouth]] */
  public static readonly NS_CLASS_NAME = "nz-direction-ns";
  /** Class name of [[ResizeDirection.NorthEast_SouthWest]] */
  public static readonly NE_SW_CLASS_NAME = "nz-direction-ne-sw";
  /** Class name of [[ResizeDirection.NorthWest_SouthEast]] */
  public static readonly NW_SE_CLASS_NAME = "nz-direction-nw-se";

  /** @returns Returns class name of specified [[ResizeDirection]] */
  public static getCssClassName(direction: ResizeDirection): string {
    switch (direction) {
      case ResizeDirection.EastWest:
        return ResizeDirectionHelpers.EW_CLASS_NAME;
      case ResizeDirection.NorthSouth:
        return ResizeDirectionHelpers.NS_CLASS_NAME;
      case ResizeDirection.NorthEast_SouthWest:
        return ResizeDirectionHelpers.NE_SW_CLASS_NAME;
      case ResizeDirection.NorthWest_SouthEast:
        return ResizeDirectionHelpers.NW_SE_CLASS_NAME;
    }
  }
}

/** Arguments used in resize actions of [[ResizeGrip]] component.
 * @alpha
 */
export interface ResizeGripResizeArgs {
  /** Pointer position. */
  readonly position: PointProps;
  /** Grip bounds. */
  readonly bounds: RectangleProps;
}

/** Properties of [[ResizeGrip]] component.
 * @alpha
 */
export interface ResizeGripProps extends CommonProps {
  /** Function called when grip is clicked. */
  onClick?: () => void;
  /** Function called when grip is resized. */
  onResize?: (args: ResizeGripResizeArgs) => void;
  /** Function called when resize action is ended. */
  onResizeEnd?: (args: ResizeGripResizeArgs) => void;
  /** Function called when resize action is started. */
  onResizeStart?: (args: ResizeGripResizeArgs) => void;
  /** Available resize directions of resize grip. */
  direction: ResizeDirection;
}

interface ResizeGripState {
  isPointerDown: boolean;
}

/** Resize grip used by [[Stacked]] component.
 * @alpha
 */
export class ResizeGrip extends React.PureComponent<ResizeGripProps, ResizeGripState> {
  private _grip = React.createRef<HTMLDivElement>();
  private _isResizing = false;
  private _movedBy = 0;
  private _lastPosition = new Point();

  /** @internal */
  public override readonly state: ResizeGripState = {
    isPointerDown: false,
  };

  public override render() {
    const className = classnames(
      "nz-widget-rectangular-resizeGrip",
      ResizeDirectionHelpers.getCssClassName(this.props.direction),
      this.props.className);

    return (
      <PointerCaptor
        className={className}
        isPointerDown={this.state.isPointerDown}
        onPointerDown={this._handlePointerDown}
        onPointerUp={this._handlePointerUp}
        onPointerMove={this._handlePointerMove}
        style={this.props.style}
      >
        <div // eslint-disable-line jsx-a11y/click-events-have-key-events
          className="nz-grip"
          onClick={this._handleClick}
          ref={this._grip}
          role="button"
          tabIndex={-1}
        />
      </PointerCaptor>
    );
  }

  private _handleClick = () => {
    if (this._movedBy > 0)
      return;
    this.props.onClick && this.props.onClick();
  };

  private _handlePointerDown = (e: PointerEvent) => {
    this.setState({ isPointerDown: true });
    const grip = this._grip.current;
    if (!grip)
      return;

    this._movedBy = 0;
    this._lastPosition = new Point(e.clientX, e.clientY);

    this._isResizing = true;
    e.preventDefault();

    const bounds = Rectangle.create(grip.getBoundingClientRect());
    this.props.onResizeStart && this.props.onResizeStart({
      position: {
        x: e.clientX,
        y: e.clientY,
      },
      bounds: bounds.toProps(),
    });
  };

  private _handlePointerUp = (e: PointerEvent) => {
    this.setState({ isPointerDown: false });
    const grip = this._grip.current;
    if (!this._isResizing || !grip)
      return;

    const newPosition = new Point(e.clientX, e.clientY);
    this._movedBy += newPosition.getManhattanDistanceTo(this._lastPosition);
    this._lastPosition = newPosition;

    e.preventDefault();
    this._isResizing = false;
    const bounds = Rectangle.create(grip.getBoundingClientRect());
    this.props.onResizeEnd && this.props.onResizeEnd({
      position: {
        x: e.clientX,
        y: e.clientY,
      },
      bounds: bounds.toProps(),
    });
  };

  private _handlePointerMove = (e: PointerEvent) => {
    const grip = this._grip.current;
    if (!this._isResizing || !grip)
      return;

    const newPosition = new Point(e.clientX, e.clientY);
    this._movedBy += newPosition.getManhattanDistanceTo(this._lastPosition);
    this._lastPosition = newPosition;

    const bounds = Rectangle.create(grip.getBoundingClientRect());
    this.props.onResize && this.props.onResize({
      position: {
        x: e.clientX,
        y: e.clientY,
      },
      bounds: bounds.toProps(),
    });
  };
}
