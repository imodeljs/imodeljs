/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Popup
 */

import * as React from "react";
import { OnCancelFunc, RelativePosition } from "@bentley/ui-abstract";
import { DivWithOutsideClick, Orientation, Point, Size, SizeProps } from "@bentley/ui-core";
import { CursorPopup } from "../cursor/cursorpopup/CursorPopup";
import { PopupManager, PopupPropsBase } from "./PopupManager";
import { PositionPopup } from "./PositionPopup";
import { MessageDiv } from "../messages/MessageSpan";

/** @alpha */
export interface HTMLElementPopupProps extends PopupPropsBase {
  element: HTMLElement;
  relativePosition: RelativePosition;
  orientation: Orientation;
  onCancel: OnCancelFunc;
}

/** @internal */
interface HTMLElementPopupState {
  size: Size;
}

/** Popup component for HTMLElement
 * @alpha
 */
export class HTMLElementPopup extends React.PureComponent<HTMLElementPopupProps, HTMLElementPopupState> {
  /** @internal */
  public override readonly state = {
    size: new Size(-1, -1),
  };

  private _onSizeKnown = (newSize: SizeProps) => {
    // istanbul ignore else
    if (!this.state.size.equals(newSize))
      this.setState({ size: Size.create(newSize) });
  };

  public override render() {
    let point = PopupManager.getPopupPosition(this.props.el, this.props.pt, new Point(), this.state.size);
    const popupRect = CursorPopup.getPopupRect(point, this.props.offset, this.state.size, this.props.relativePosition);
    point = new Point(popupRect.left, popupRect.top);

    return (
      <PositionPopup key={this.props.id}
        className="uifw-no-border"
        point={point}
        onSizeKnown={this._onSizeKnown}
      >
        <DivWithOutsideClick onOutsideClick={this.props.onCancel}>
          <MessageDiv message={this.props.element} />
        </DivWithOutsideClick>
      </PositionPopup>
    );
  }
}
