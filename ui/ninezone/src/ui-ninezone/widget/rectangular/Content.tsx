/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import "./Content.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, NoChildrenProps } from "@bentley/ui-core";
import { HorizontalAnchor, HorizontalAnchorHelpers } from "../Stacked";

/** Properties of [[WidgetContent]] component.
 * @alpha
 */
export interface WidgetContentProps extends CommonProps, NoChildrenProps { // eslint-disable-line @typescript-eslint/naming-convention
  /** Describes to which side the widget of this content is anchored. */
  anchor: HorizontalAnchor;
  /** Content container ref. */
  containerRef?: React.Ref<HTMLDivElement>;
  /** Actual content. */
  content?: React.ReactNode;
}

/** Scrollable widget content. Used by [[Stacked]] component.
 * @alpha
 */
export class WidgetContent extends React.PureComponent<WidgetContentProps> {
  private _content = React.createRef<HTMLDivElement>();
  private _scrollTop = 0;
  private _scrollLeft = 0;

  public override componentDidUpdate() {
    if (!this._content.current)
      return;
    this._content.current.scrollTop = this._scrollTop;
    this._content.current.scrollLeft = this._scrollLeft;
  }

  public override render() {
    const className = classnames(
      "nz-widget-rectangular-content",
      HorizontalAnchorHelpers.getCssClassName(this.props.anchor),
      this.props.className);

    return (
      <div
        className={className}
        ref={this._content}
        onScroll={this._handleScroll}
        style={this.props.style}
      >
        <div
          className="nz-container"
          ref={this.props.containerRef}
        >
          {this.props.content}
        </div>
      </div>
    );
  }

  private _handleScroll = () => {
    if (!this._content.current)
      return;
    this._scrollTop = this._content.current.scrollTop;
    this._scrollLeft = this._content.current.scrollLeft;
  };
}
