/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import "./DragDropRow.scss";
import classnames from "classnames";
import * as React from "react";
import { BreadcrumbDetailsDragDropType } from "../../breadcrumb/breadcrumbdetails/hoc/withDragDrop";
import { DragSourceArguments, DragSourceProps, DropTargetArguments, DropTargetProps } from "../../dragdrop/DragDropDef";
import { withDragSource, WithDragSourceProps } from "../../dragdrop/withDragSource";
import { withDropTarget } from "../../dragdrop/withDropTarget";
import { TableDropTargetProps } from "./withDragDrop";

/** @internal */
export interface DragDropRowProps<DragDropObject = any> {
  dragProps: DragSourceProps<DragDropObject>; // eslint-disable-line deprecation/deprecation
  dropProps: TableDropTargetProps<DragDropObject>; // eslint-disable-line deprecation/deprecation
}

interface RowWrapperProps extends React.AllHTMLAttributes<HTMLDivElement> {
  isDragging?: boolean;
  isOver?: boolean;
  canDrag?: boolean;
  canDrop?: boolean;
  canDropOn?: boolean;
  onRender?: () => void;
}

enum HoverMode {
  Above,
  On,
  Below,
}

/** @internal */
interface RowWrapperState {
  hoverMode: HoverMode;
}

/** @internal */
export class DragDropRowWrapper extends React.Component<RowWrapperProps, RowWrapperState> {
  private _root: HTMLDivElement | null = null;
  public override readonly state: RowWrapperState = {
    hoverMode: HoverMode.Above,
  };
  public override render(): React.ReactElement<any> {
    const { isDragging, isOver, canDrop, children } = this.props as RowWrapperProps;
    const mode = this.state.hoverMode;
    const classes = classnames("components-table-drop-target", {
      above: canDrop && isOver && mode === HoverMode.Above,
      on: canDrop && isOver && mode === HoverMode.On,
      below: canDrop && isOver && mode === HoverMode.Below,
      dragging: isDragging,
    });
    return (
      <div
        className={classes} data-testid="components-table-drop-target"
        ref={(el) => { this._root = el; }}
        onDragOver={this._handleDragOver}>
        {children}
      </div>
    );
  }

  public override componentDidMount() {
    // istanbul ignore next
    if (this.props.onRender)
      this.props.onRender();
  }

  public override componentDidUpdate() {
    // istanbul ignore next
    if (this.props.onRender)
      this.props.onRender();
  }

  private _handleDragOver = (event: React.DragEvent) => {
    if (this.props.isOver && this._root) {
      const rect = this._root.getBoundingClientRect();
      let relativeY = (event.clientY - rect.top) / rect.height;
      // istanbul ignore next
      if (this.props.style !== undefined &&
        this.props.style.top !== undefined && typeof this.props.style.top === "number" &&
        this.props.style.height !== undefined && typeof this.props.style.height === "number")
        relativeY = (event.clientY - this.props.style.top) / this.props.style.height;
      if (this.props.canDropOn) {
        if (relativeY < 1 / 3) {
          if (this.state.hoverMode !== HoverMode.Above)
            this.setState({ hoverMode: HoverMode.Above });
        } else if (relativeY < 2 / 3) {
          if (this.state.hoverMode !== HoverMode.On)
            this.setState({ hoverMode: HoverMode.On });
        } else {
          if (this.state.hoverMode !== HoverMode.Below)
            this.setState({ hoverMode: HoverMode.Below });
        }
      } else {
        if (relativeY < 1 / 2) {
          if (this.state.hoverMode !== HoverMode.Above)
            this.setState({ hoverMode: HoverMode.Above });
        } else {
          if (this.state.hoverMode !== HoverMode.Below)
            this.setState({ hoverMode: HoverMode.Below });
        }
      }
    }
  };
}

/** @internal */
export function DragDropRow<DragDropObject extends BreadcrumbDetailsDragDropType>() { // eslint-disable-line deprecation/deprecation
  // Used only internally in ./Table.tsx
  return class DragDropRowComponent extends React.Component<DragDropRowProps<DragDropObject> & any> {
    public createDragProps(index?: number) {
      if (!this.props.dragProps)
        return {};
      const { onDragSourceBegin, onDragSourceEnd, objectType } = this.props.dragProps;
      const dragProps = {
        onDragSourceBegin: (args: DragSourceArguments) => { // eslint-disable-line deprecation/deprecation
          return onDragSourceBegin ? onDragSourceBegin(args) : args; // Must return something for drag data.
        },
        onDragSourceEnd,
        objectType: () => {
          // istanbul ignore else
          if (objectType) {
            if (typeof objectType === "function")
              return objectType({ row: index } as any);
            else
              return objectType;
          } else return "";
        },
      };
      return dragProps;
    }
    public createDropProps(index?: number): DropTargetProps<DragDropObject> { // eslint-disable-line deprecation/deprecation
      if (!this.props.dropProps)
        return {};
      // eslint-disable-next-line deprecation/deprecation
      const { onDropTargetDrop, onDropTargetOver, canDropTargetDrop, objectTypes, canDropOn } = this.props.dropProps as TableDropTargetProps;
      const dropProps = {
        onDropTargetDrop: (args: DropTargetArguments): DropTargetArguments => { // eslint-disable-line deprecation/deprecation
          if (index !== undefined) {
            args.row = index;
            if (args.dropRect) {
              const relativeY = (args.clientOffset.y - args.dropRect.top) / args.dropRect.height;
              if ((canDropOn && relativeY > 2 / 3) || (!canDropOn && relativeY > 1 / 2))
                args.row = index + 1;
            }
          }
          return onDropTargetDrop ? onDropTargetDrop(args) : args; // Must return something for pass-through to OnDragSourceEnd.
        }, onDropTargetOver: (args: DropTargetArguments) => { // eslint-disable-line deprecation/deprecation
          // istanbul ignore else
          if (onDropTargetOver) {
            if (index !== undefined) {
              args.row = index;
              if (args.dropRect) {
                const relativeY = (args.clientOffset.y - args.dropRect.top) / args.dropRect.height;
                if ((canDropOn && relativeY > 2 / 3) || (!canDropOn && relativeY > 1 / 2))
                  args.row = index + 1;
              }
            }
            onDropTargetOver(args);
          }
        }, canDropTargetDrop: (args: DropTargetArguments) => { // eslint-disable-line deprecation/deprecation
          if (index !== undefined) {
            args.row = index;
          }
          return canDropTargetDrop ? canDropTargetDrop(args) : true; // Must return something determining if item can drop.
        }, objectTypes,
      };
      return dropProps;
    }
    public override render(): React.ReactElement<any> {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const DDRow = withDropTarget<RowWrapperProps & WithDragSourceProps<DragDropObject>, DragDropObject>( // eslint-disable-line deprecation/deprecation
        withDragSource<RowWrapperProps, DragDropObject>(DragDropRowWrapper)); // eslint-disable-line deprecation/deprecation
      const { dragProps, dropProps, ...props } = this.props; // eslint-disable-line @typescript-eslint/no-unused-vars
      return (
        <DDRow
          canDropOn={(this.props.dropProps && this.props.dropProps.canDropOn) || false}
          {...props}
          dropProps={this.createDropProps(this.props.idx)}
          dragProps={this.createDragProps(this.props.idx)}
          shallow={false}>
          {this.props.children}
        </DDRow>
      );
    }
  };
}
