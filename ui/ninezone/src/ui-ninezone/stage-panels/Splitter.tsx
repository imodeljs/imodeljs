/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module StagePanels
 */

import "./Splitter.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps } from "@bentley/ui-core";

/** Properties of [[Splitter]] component.
 * @beta
 */
export interface SplitterProps extends CommonProps {
  /** Splitter content panes. */
  children?: React.ReactNode;
  /** Describes if the grip is hidden. */
  isGripHidden?: boolean;
  /** Describes if the splitter is vertical. */
  isVertical?: boolean;
}

/** State of [[Splitter]] component.
 * @beta
 */
interface SplitterState {
  sizeByPaneId: { [paneId: number]: number };
}

/** Splitter component of 9-Zone UI app.
 * @beta
 */
export class Splitter extends React.PureComponent<SplitterProps, SplitterState> {
  private _gripRefByGripId = new Map<number, React.RefObject<HTMLDivElement>>();
  private _splitterRef = React.createRef<HTMLDivElement>();
  private _draggedGrip: number | undefined;

  public constructor(props: SplitterProps) {
    super(props);

    const sizeByPaneId: { [paneId: number]: number } = {};
    const count = React.Children.count(props.children);
    for (let i = 0; i < count; i++) {
      sizeByPaneId[i] = 0;
    }
    this.state = {
      sizeByPaneId: this.getInitialPaneSizes(),
    };
  }

  public override componentDidMount() {
    document.addEventListener("pointerup", this._handleDocumentPointerUp);
    document.addEventListener("pointermove", this._handleDocumentPointerMove);
  }

  public override componentDidUpdate(prevProps: SplitterProps) {
    const prevCount = React.Children.count(prevProps.children);
    const count = React.Children.count(this.props.children);
    if (prevCount !== count) {
      this.setState({ sizeByPaneId: this.getInitialPaneSizes() });
    }
  }

  public override componentWillUnmount() {
    document.removeEventListener("pointerup", this._handleDocumentPointerUp);
    document.removeEventListener("pointermove", this._handleDocumentPointerMove);
  }

  public override render() {
    const className = classnames(
      "nz-stagePanels-splitter",
      this.props.isVertical && "nz-vertical",
      this.props.className);
    const length = React.Children.count(this.props.children) - 1;
    return (
      <div
        className={className}
        ref={this._splitterRef}
        style={this.props.style}
      >
        {React.Children.map(this.props.children, (child, index) => {
          const order = 1 + index * 2;
          const size = this.state.sizeByPaneId[index];
          return (
            <div
              className="nz-pane"
              key={order}
              style={{
                order,
                flexGrow: size,
              }}
            >
              {child}
            </div>
          );
        })}
        {!this.props.isGripHidden && Array.from({ length }, (_, index) => 2 + index * 2).map((order, index) => {
          return (
            <div
              className="nz-grip"
              key={order}
              onPointerDown={(e) => this._handlePointerDown(e, index)}
              ref={this.getGripRef(index)}
              style={{ order }}
            />
          );
        })}
      </div>
    );
  }

  private getGripRef(index: number) {
    const ref = this._gripRefByGripId.get(index);
    if (ref)
      return ref;
    const newRef = React.createRef<HTMLDivElement>();
    this._gripRefByGripId.set(index, newRef);
    return newRef;
  }

  private getInitialPaneSizes() {
    const count = React.Children.count(this.props.children);
    const paneSize = 100 / count;
    const sizeByPaneId: { [paneId: number]: number } = {};
    for (let i = 0; i < count; i++) {
      sizeByPaneId[i] = paneSize;
    }
    return sizeByPaneId;
  }

  private _handlePointerDown = (e: React.PointerEvent, id: number) => {
    e.preventDefault();
    this._draggedGrip = id;
  };

  private _handleDocumentPointerUp = (_: PointerEvent) => {
    this._draggedGrip = undefined;
  };

  private _handleDocumentPointerMove = (e: PointerEvent) => {
    this.setState((prevState, props) => {
      const gripRef = this._draggedGrip === undefined ? undefined : this.getGripRef(this._draggedGrip);
      if (this._draggedGrip === undefined ||
        !this._splitterRef.current ||
        !gripRef || !gripRef.current)
        return null;

      const gripId = this._draggedGrip;
      const splitterBounds = this._splitterRef.current.getBoundingClientRect();
      const splitterSize = props.isVertical ? splitterBounds.height : splitterBounds.width;

      const gripBounds = gripRef.current.getBoundingClientRect();
      const gripCenterPosition = props.isVertical ? gripBounds.top + gripBounds.height / 2 : gripBounds.left + gripBounds.width / 2;
      const pointerPosition = props.isVertical ? e.clientY : e.clientX;
      const resizeByPx = pointerPosition - gripCenterPosition;

      const resizeBy = resizeByPx / splitterSize * 100;
      const shrinkPaneId = resizeBy < 0 ? gripId : gripId + 1;
      const shrinkPaneSize = prevState.sizeByPaneId[shrinkPaneId];
      const shrinkBy = resizeBy < 0 ? resizeBy : -resizeBy;
      const newShrinkPaneSize = Math.max(0, shrinkPaneSize + shrinkBy);

      const growBy = shrinkPaneSize - newShrinkPaneSize;
      const growPaneId = resizeBy < 0 ? gripId + 1 : gripId;
      const growPaneSize = prevState.sizeByPaneId[growPaneId];
      const newGrowPaneSize = Math.max(0, growPaneSize + growBy);

      return {
        sizeByPaneId: {
          ...prevState.sizeByPaneId,
          [shrinkPaneId]: newShrinkPaneSize,
          [growPaneId]: newGrowPaneSize,
        },
      };
    });
  };
}
