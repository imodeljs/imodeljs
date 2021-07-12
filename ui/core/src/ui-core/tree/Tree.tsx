/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import "./Tree.scss";
import classnames from "classnames";
import * as React from "react";
import { Range2d } from "@bentley/geometry-core";
import { CommonProps } from "../utils/Props";

/** Properties for the [[Tree]] presentational React component
 * @public
 */
export interface TreeProps extends CommonProps {
  children?: React.ReactNode;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onKeyUp?: React.KeyboardEventHandler<HTMLDivElement>;
}

/** Presentation React component for a Tree
 * @public
 */
export class Tree extends React.PureComponent<TreeProps> {
  private _treeElement: React.RefObject<HTMLDivElement> = React.createRef();

  private get _scrollableContainer(): Element | undefined {
    if (!this._treeElement.current)
      return undefined;

    const isScrollable = (element: Element) => {
      const style = window.getComputedStyle(element);
      return style.overflow === "auto" || style.overflow === "scroll"
        || style.overflowY === "auto" || style.overflowY === "scroll"
        || style.overflowX === "auto" || style.overflowX === "scroll";
    };
    let scrollableContainer: Element | undefined = this._treeElement.current;
    while (scrollableContainer && !isScrollable(scrollableContainer))
      scrollableContainer = (scrollableContainer.children.length > 0) ? scrollableContainer.children[0] : undefined;

    return scrollableContainer;
  }

  public scrollToElement(element: Element) {
    const container = this._scrollableContainer;
    if (!container)
      return;

    // istanbul ignore next
    if (!Element.prototype.scrollTo) { // eslint-disable-line @typescript-eslint/unbound-method
      // workaround for Edge scrollTo issue https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/15534521/
      element.scrollIntoView();
      return;
    }

    const elementBox = element.getBoundingClientRect();
    const elementRange = Range2d.createXYXY(elementBox.left, elementBox.top, elementBox.right, elementBox.bottom);
    const containerBox = container.getBoundingClientRect();
    const containerRange = Range2d.createXYXY(containerBox.left - container.scrollLeft, containerBox.top - container.scrollTop,
      containerBox.right - container.scrollLeft, containerBox.bottom - container.scrollTop);

    let left: number;
    if (container.scrollLeft > 0 && elementRange.high.x <= containerRange.high.x) {
      // always attempt to keep horizontal scroll at 0
      left = 0;
    } else if (containerRange.low.x <= elementRange.low.x && containerRange.high.x >= elementRange.high.x) {
      // already visible - no need to scroll to
      left = container.scrollLeft;
    } else {
      left = elementRange.low.x - containerRange.low.x;
    }

    let top: number;
    if (containerRange.low.y <= elementRange.low.y && containerRange.high.y >= elementRange.high.y) {
      // already visible - no need to scroll to
      top = container.scrollTop;
    } else {
      top = elementRange.low.y - containerRange.low.y;
    }

    container.scrollTo({ left, top });
  }

  public getElementsByClassName(className: string): Element[] {
    if (!this._treeElement.current)
      return [];

    const elems = new Array<Element>();
    const collection = this._treeElement.current.getElementsByClassName(className);
    for (let i = 0; i < collection.length; ++i)
      elems.push(collection.item(i)!);
    return elems;
  }

  public setFocusByClassName(selector: string): boolean {
    let status = false;
    if (this._treeElement.current) {
      const element = this._treeElement.current.querySelector(selector) as HTMLElement;
      // istanbul ignore else
      if (element && element.focus) {
        element.focus();
        status = true;
      }
    }
    return status;
  }

  public override render() {
    const className = classnames(
      "core-tree",
      this.props.className);

    return (
      <div ref={this._treeElement}
        className={className}
        style={this.props.style}
        onMouseDown={this.props.onMouseDown}
        onMouseMove={this.props.onMouseMove}
        onMouseUp={this.props.onMouseUp}
        onKeyDown={this.props.onKeyDown}
        onKeyUp={this.props.onKeyUp}
        role="tree"
        tabIndex={-1}
      >
        {this.props.children}
      </div>
    );
  }
}
