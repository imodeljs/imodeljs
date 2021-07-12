/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Cursor
 */

import "./CursorPopup.scss";
import * as React from "react";
import classnames from "classnames";
import { RelativePosition } from "@bentley/ui-abstract";
import { CommonDivProps, CommonProps, Div, PointProps, RectangleProps, Size, SizeProps } from "@bentley/ui-core";
import { TitleBar } from "@bentley/ui-ninezone";
import { CursorPopupFadeOutEventArgs, CursorPopupManager } from "./CursorPopupManager";

/** Properties for the [[CursorPopup]] React component
 * @public
 */
export interface CursorPopupProps extends CommonProps {
  id: string;
  content: React.ReactNode;
  pt: PointProps;
  offset: PointProps;
  relativePosition: RelativePosition;
  title?: string;
  shadow?: boolean;
  /** Function called when size is known. */
  onSizeKnown?: (size: SizeProps) => void;
}

/** Enum for showing CursorPopup
 * @internal - unit testing
 */
export enum CursorPopupShow {
  Open,
  FadeOut,
}

/** State for the [[CursorPopup]] React component
 * @internal
 */
interface CursorPopupState {
  showPopup: CursorPopupShow;
  size: Size;
}

/** CursorPopup React component
 * @public
 */
export class CursorPopup extends React.Component<CursorPopupProps, CursorPopupState> {

  private _isMounted: boolean = false;

  /** @internal */
  public static fadeOutTime = 500;

  /** @internal */
  constructor(props: CursorPopupProps) {
    super(props);

    this.state = {
      showPopup: CursorPopupShow.Open,
      size: new Size(-1, -1),
    };
  }

  public override componentDidMount() {
    this._isMounted = true;
    CursorPopupManager.onCursorPopupFadeOutEvent.addListener(this._handleCursorPopupFadeOutEvent);
  }

  public override componentWillUnmount() {
    this._isMounted = false;
    CursorPopupManager.onCursorPopupFadeOutEvent.removeListener(this._handleCursorPopupFadeOutEvent);
  }

  private _handleCursorPopupFadeOutEvent = (args: CursorPopupFadeOutEventArgs) => {
    if (this.props.id === args.id) {
      // istanbul ignore else
      if (this._isMounted)
        this.setState({ showPopup: CursorPopupShow.FadeOut });
    }
  };

  /** @internal */
  public static getPopupRect(pt: PointProps, offset: PointProps, popupSize: SizeProps | undefined, relativePosition: RelativePosition): RectangleProps {
    const popupRect = { top: 0, left: 0, right: 0, bottom: 0 };

    if (popupSize === undefined)
      return popupRect;

    switch (relativePosition) {
      case RelativePosition.Top:
        popupRect.bottom = pt.y - offset.y;
        popupRect.left = pt.x - (popupSize.width / 2);
        popupRect.top = popupRect.bottom - popupSize.height;
        popupRect.right = popupRect.left + popupSize.width;
        break;
      case RelativePosition.Left:
        popupRect.right = pt.x - offset.x;
        popupRect.top = pt.y - (popupSize.height / 2);
        popupRect.left = popupRect.right - popupSize.width;
        popupRect.bottom = popupRect.top + popupSize.height;
        break;
      case RelativePosition.Right:
        popupRect.left = pt.x + offset.x;
        popupRect.top = pt.y - (popupSize.height / 2);
        popupRect.right = popupRect.left + popupSize.width;
        popupRect.bottom = popupRect.top + popupSize.height;
        break;
      case RelativePosition.Bottom:
        popupRect.top = pt.y + offset.y;
        popupRect.left = pt.x - (popupSize.width / 2);
        popupRect.bottom = popupRect.top + popupSize.height;
        popupRect.right = popupRect.left + popupSize.width;
        break;
      case RelativePosition.TopLeft:
        popupRect.bottom = pt.y - offset.y;
        popupRect.right = pt.x - offset.x;
        popupRect.top = popupRect.bottom - popupSize.height;
        popupRect.left = popupRect.right - popupSize.width;
        break;
      case RelativePosition.TopRight:
        popupRect.bottom = pt.y - offset.y;
        popupRect.left = pt.x + offset.x;
        popupRect.top = popupRect.bottom - popupSize.height;
        popupRect.right = popupRect.left + popupSize.width;
        break;
      case RelativePosition.BottomLeft:
        popupRect.top = pt.y + offset.y;
        popupRect.right = pt.x - offset.x;
        popupRect.bottom = popupRect.top + popupSize.height;
        popupRect.left = popupRect.right - popupSize.width;
        break;
      case RelativePosition.BottomRight:
        popupRect.top = pt.y + offset.y;
        popupRect.left = pt.x + offset.x;
        popupRect.bottom = popupRect.top + popupSize.height;
        popupRect.right = popupRect.left + popupSize.width;
        break;
    }

    return popupRect;
  }

  private setDivRef(div: HTMLDivElement | null) {
    // istanbul ignore else
    if (div) {
      const rect = div.getBoundingClientRect();
      const newSize = new Size(rect.width, rect.height);

      // istanbul ignore else
      if (!this.state.size.equals(newSize)) {
        // istanbul ignore else
        if (this.props.onSizeKnown)
          this.props.onSizeKnown(newSize);

        // istanbul ignore else
        if (this._isMounted)
          this.setState({ size: newSize });
      }
    }
  }

  /** @internal */
  public override render() {
    const popupRect = CursorPopup.getPopupRect(this.props.pt, this.props.offset, this.state.size, this.props.relativePosition);

    const positioningStyle: React.CSSProperties = {
      left: popupRect.left,
      top: popupRect.top,
    };

    const classNames = classnames(
      "uifw-cursorpopup",
      this.props.shadow && "core-popup-shadow",
      this.state.showPopup === CursorPopupShow.FadeOut && "uifw-cursorpopup-fadeOut",
    );

    return (
      <div className={classNames} ref={(e) => this.setDivRef(e)} style={positioningStyle}>
        {this.props.title &&
          <TitleBar
            title={this.props.title}
            className="uifw-cursorpopup-title" />
        }
        {this.props.content}
      </div>
    );
  }
}

/** CursorPopup content with padding
 * @public
 */
export function CursorPopupContent(props: CommonDivProps) {
  return <Div {...props} mainClassName="uifw-cursorpopup-content" />;
}
