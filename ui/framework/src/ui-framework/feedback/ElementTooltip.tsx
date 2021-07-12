/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Notification
 */

import classnames from "classnames";
import * as React from "react";
import { XAndY } from "@bentley/geometry-core";
import { ToolTipOptions } from "@bentley/imodeljs-frontend";
import { CommonProps, Point, PointProps, Rectangle, SizeProps, UiEvent } from "@bentley/ui-core";
import { offsetAndContainInContainer, Tooltip } from "@bentley/ui-ninezone";
import { MessageDiv } from "../messages/MessageSpan";
import { NotifyMessageType } from "../messages/ReactNotifyMessageDetails";

/** [[ElementTooltip]] State.
 * @internal
 */
interface ElementTooltipState {
  isVisible: boolean;
  message: NotifyMessageType;
  position: PointProps;
  options?: ToolTipOptions;
}

/** [[ElementTooltipChangedEvent]] arguments.
 * @public
 */
export interface ElementTooltipChangedEventArgs {
  isTooltipVisible: boolean;
  message: NotifyMessageType;
  el?: HTMLElement;
  pt?: XAndY;
  options?: ToolTipOptions;
}

/** ElementTooltip Changed Event class.
 * @public
 */
export class ElementTooltipChangedEvent extends UiEvent<ElementTooltipChangedEventArgs> { }

/** ElementTooltip React component.
 * @public
 */
export class ElementTooltip extends React.Component<CommonProps, ElementTooltipState> {
  private static _elementTooltipChangedEvent: ElementTooltipChangedEvent = new ElementTooltipChangedEvent();
  private static _isTooltipVisible: boolean;
  private static _isTooltipHalted: boolean;

  public static get onElementTooltipChangedEvent(): ElementTooltipChangedEvent { return ElementTooltip._elementTooltipChangedEvent; }
  public static get isTooltipVisible(): boolean { return ElementTooltip._isTooltipVisible; }

  public static showTooltip(el: HTMLElement, message: NotifyMessageType, pt?: XAndY, options?: ToolTipOptions): void {
    // istanbul ignore if
    if (ElementTooltip._isTooltipHalted)
      return;
    ElementTooltip._isTooltipVisible = true;
    ElementTooltip.onElementTooltipChangedEvent.emit({ isTooltipVisible: true, el, message, pt, options });
  }

  public static hideTooltip(): void {
    ElementTooltip._isTooltipVisible = false;
    ElementTooltip.onElementTooltipChangedEvent.emit({ isTooltipVisible: false, message: "" });
  }

  // istanbul ignore next
  public static get isTooltipHalted(): boolean { return ElementTooltip._isTooltipHalted; }
  // istanbul ignore next
  public static set isTooltipHalted(halt: boolean) {
    ElementTooltip._isTooltipHalted = halt;
    if (halt && ElementTooltip._isTooltipVisible)
      ElementTooltip.hideTooltip();
  }

  private _size: SizeProps = {
    height: 0,
    width: 0,
  };
  private _element?: HTMLElement;
  private _position?: PointProps;

  /** @internal */
  public override readonly state: Readonly<ElementTooltipState> = {
    message: "",
    isVisible: false,
    position: {
      x: 0,
      y: 0,
    },
  };

  constructor(props: CommonProps) {
    super(props);
  }

  public override render() {
    if (!this.state.isVisible)
      return null;

    const className = classnames(
      "uifw-element-tooltip",
      this.props.className);

    const messageNode = <MessageDiv message={this.state.message} />;

    return (
      <div className="uifw-element-tooltip-container">
        <Tooltip
          className={className}
          style={this.props.style}
          position={this.state.position}
          onSizeChanged={this._handleSizeChanged}
        >
          {messageNode}
        </Tooltip>
      </div>
    );
  }

  public override componentDidMount(): void {
    ElementTooltip.onElementTooltipChangedEvent.addListener(this._handleElementTooltipChangedEvent);
  }

  public override componentWillUnmount(): void {
    ElementTooltip.onElementTooltipChangedEvent.removeListener(this._handleElementTooltipChangedEvent);
  }

  private _handleElementTooltipChangedEvent = (args: ElementTooltipChangedEventArgs) => {
    this._element = args.el;
    this._position = args.pt;
    this.setState({
      isVisible: args.isTooltipVisible,
      message: args.message,
    });
    this.updatePosition();
  };

  // istanbul ignore next
  private _handleSizeChanged = (size: SizeProps) => {
    this._size = size;
    this.updatePosition();
  };

  private updatePosition() {
    this.setState((prevState) => {
      if (!this._element)
        return null;
      // istanbul ignore next
      if (!this._position)
        return null;

      const containerBounds = Rectangle.create(this._element.getBoundingClientRect());
      const relativeBounds = Rectangle.createFromSize(this._size).offset(this._position);
      const adjustedPosition: Point = offsetAndContainInContainer(relativeBounds, containerBounds.getSize(), { x: 8, y: 8 });
      const position = adjustedPosition.offset(containerBounds.topLeft());

      // istanbul ignore else
      if (position.equals(prevState.position))
        return null;

      // istanbul ignore next
      return {
        position,
      };
    });
  }
}
