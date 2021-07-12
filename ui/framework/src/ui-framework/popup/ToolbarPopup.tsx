/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Popup
 */

import * as React from "react";
import { CommonToolbarItem, OnCancelFunc, OnItemExecutedFunc, RelativePosition, SpecialKey } from "@bentley/ui-abstract";
import { DivWithOutsideClick, FocusTrap, Orientation, Point, Size, SizeProps } from "@bentley/ui-core";
import { Direction, Toolbar, ToolbarOpacitySetting, ToolbarPanelAlignment } from "@bentley/ui-components";
import { CursorPopup } from "../cursor/cursorpopup/CursorPopup";
import { PopupManager, PopupPropsBase } from "./PopupManager";
import { PositionPopup } from "./PositionPopup";

/** @alpha */
export interface ToolbarPopupProps extends PopupPropsBase {
  items: CommonToolbarItem[];
  relativePosition: RelativePosition;
  orientation: Orientation;
  onCancel: OnCancelFunc;
  onItemExecuted: OnItemExecutedFunc;
}

/** @internal */
interface ToolbarPopupState {
  size: Size;
}

/** Popup component for Input Editor
 * @alpha
 */
export class ToolbarPopup extends React.PureComponent<ToolbarPopupProps, ToolbarPopupState> {
  /** @internal */
  public override readonly state = {
    size: new Size(-1, -1),
  };

  private _onSizeKnown = (newSize: SizeProps) => {
    // istanbul ignore else
    if (!this.state.size.equals(newSize))
      this.setState({ size: Size.create(newSize) });
  };

  private _handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    switch (event.key) {
      case SpecialKey.Escape:
        this._cancel();
        break;
    }
  };

  private _cancel() {
    // istanbul ignore else
    if (this.props.onCancel) {
      this.props.onCancel();
    }
  }

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
        <DivWithOutsideClick onOutsideClick={this.props.onCancel} onKeyDown={this._handleKeyDown}>
          <FocusTrap active={true} returnFocusOnDeactivate={true}>
            <Toolbar
              expandsTo={Direction.Bottom}
              panelAlignment={ToolbarPanelAlignment.Start}
              items={this.props.items}
              useDragInteraction={true}
              toolbarOpacitySetting={ToolbarOpacitySetting.Defaults}
              onItemExecuted={this.props.onItemExecuted}
            />
          </FocusTrap>
        </DivWithOutsideClick>
      </PositionPopup>
    );
  }
}
