/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Popup
 */

import "./CardPopup.scss";
import * as React from "react";
import classnames from "classnames";
import { CommonToolbarItem, OnCancelFunc, OnItemExecutedFunc, PropertyRecord, RelativePosition, SpecialKey } from "@bentley/ui-abstract";
import { DivWithOutsideClick, FocusTrap, LeadingText, Orientation, Point, Size, SizeProps } from "@bentley/ui-core";
import { CursorPopup } from "../cursor/cursorpopup/CursorPopup";
import { isReactContent, PopupContentType, PopupManager, PopupPropsBase } from "./PopupManager";
import { PositionPopup } from "./PositionPopup";
import { MessageDiv } from "../messages/MessageSpan";
import { Direction, PropertyValueRendererManager, ToolbarOpacitySetting, ToolbarPanelAlignment, ToolbarWithOverflow } from "@bentley/ui-components";

/** @alpha */
export interface CardPopupProps extends PopupPropsBase {
  content: PopupContentType;
  title: string | PropertyRecord | undefined;
  items: CommonToolbarItem[] | undefined;
  relativePosition: RelativePosition;
  orientation: Orientation;
  onCancel: OnCancelFunc;
  onItemExecuted: OnItemExecutedFunc;
}

/** @internal */
interface CardPopupState {
  size: Size;
}

/** Popup component for Input Editor
 * @alpha
 */
export class CardPopup extends React.PureComponent<CardPopupProps, CardPopupState> {
  /** @internal */
  public override readonly state = {
    size: new Size(-1, -1),
  };

  private _onSizeKnown = (newSize: SizeProps) => {
    // istanbul ignore else
    if (!this.state.size.equals(newSize))
      this.setState({ size: Size.create(newSize) });
  };

  private _handleKeyDown = (event: React.KeyboardEvent): void => {
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
        className={classnames("uifw-no-border", "uifw-card")}
        point={point}
        onSizeKnown={this._onSizeKnown}
      >
        <DivWithOutsideClick onOutsideClick={this.props.onCancel} onKeyDown={this._handleKeyDown}>
          <FocusTrap active={true} returnFocusOnDeactivate={true}>
            <Card content={this.props.content} title={this.props.title} items={this.props.items}
              onItemExecuted={this.props.onItemExecuted} />
          </FocusTrap>
        </DivWithOutsideClick>
      </PositionPopup>
    );
  }
}

/** @alpha */
export interface CardProps {
  content: PopupContentType;
  title: string | PropertyRecord | undefined;
  items: CommonToolbarItem[] | undefined;
  onItemExecuted: OnItemExecutedFunc;
}

/** @alpha */
export function Card(props: CardProps) {
  let titleNode: React.ReactNode;
  // istanbul ignore else
  if (props.title) {
    if (typeof props.title === "string")
      titleNode = <LeadingText>{props.title}</LeadingText>;
    else {
      const propertyValueRendererManager = PropertyValueRendererManager.defaultManager;
      const titleValue = propertyValueRendererManager.render(props.title);
      titleNode = <LeadingText>{titleValue}</LeadingText>;
    }
  }

  const content = isReactContent(props.content) ? props.content.reactNode : <MessageDiv message={props.content} />;

  return (
    <>
      <div className="uifw-card-content">
        {props.title &&
          <>
            {titleNode}
            <div className="uifw-card-gap" />
          </>
        }
        {content}
      </div>
      {props.items &&
        <>
          <div className="uifw-card-separator" />
          <ToolbarWithOverflow
            expandsTo={Direction.Bottom}
            panelAlignment={ToolbarPanelAlignment.Start}
            items={props.items}
            useDragInteraction={true}
            toolbarOpacitySetting={ToolbarOpacitySetting.Transparent}
            onItemExecuted={props.onItemExecuted}
          />
        </>
      }
    </>
  );
}
