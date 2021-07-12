/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Breadcrumb
 */

import classnames from "classnames";
import * as React from "react";
import { withDragSource, WithDragSourceProps } from "../../dragdrop/withDragSource";
import { withDropTarget } from "../../dragdrop/withDropTarget";
import { TreeDragDropType } from "../../tree/deprecated/hocs/withDragDrop";

/* eslint-disable deprecation/deprecation */

/** @internal */
export interface DragDropBreadcrumbNodeProps extends React.AllHTMLAttributes<HTMLSpanElement> {
  isOver?: boolean;
  isDragging?: boolean;
  canDrag?: boolean;
  canDrop?: boolean;
}

// Used internally in ./Breadcrumb.tsx
/** @internal */
export class DragDropBreadcrumbNodeComponent extends React.Component<DragDropBreadcrumbNodeProps> {
  public override render() {
    const { isOver, isDragging, canDrag, canDrop, ...props } = this.props as DragDropBreadcrumbNodeProps; // eslint-disable-line @typescript-eslint/no-unused-vars
    const classes = classnames(
      "components-breadcrumb-drop-target",
      {
        hover: canDrop && isOver,
        dragging: isDragging,
      });
    return (
      <div className={classes} {...props}>
        {this.props.children}
      </div>
    );
  }
}

/** @internal */
export function DragDropBreadcrumbNode<DragDropObject extends TreeDragDropType>() {
  return withDropTarget<DragDropBreadcrumbNodeProps & WithDragSourceProps<DragDropObject>, DragDropObject>(
    withDragSource<DragDropBreadcrumbNodeProps, DragDropObject>(DragDropBreadcrumbNodeComponent));
}
