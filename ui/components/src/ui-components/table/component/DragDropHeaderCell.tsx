/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import classnames from "classnames";
import * as React from "react";
import * as RDG from "react-data-grid";
import { CommonProps } from "@bentley/ui-core";
import { DragSourceArguments, DropTargetArguments } from "../../dragdrop/DragDropDef";
import { withDragSource } from "../../dragdrop/withDragSource";
import { withDropTarget } from "../../dragdrop/withDropTarget";
import { ColumnDragLayer } from "./ColumnDragLayer";

// eslint-disable-next-line @typescript-eslint/naming-convention
const HeaderCell = (RDG && (RDG as any).HeaderCell); // react-data-grid @types does not support the HeaderCell export, but it is exported in the js-only library.

/** @internal */
export interface DragDropHeaderCellProps extends CommonProps {
  onHeaderDrop?: (source: string, target: string) => void; // inherited by parent
  column: any; // inherited by parent
}

interface HeaderWrapperProps extends CommonProps {
  item?: DropTargetArguments; // eslint-disable-line deprecation/deprecation
  type?: string;
  isDragging?: boolean;
  isOver?: boolean;
  canDrag?: boolean;
  canDrop?: boolean;
}

class HeaderWrapper extends React.Component<HeaderWrapperProps> {
  public override render(): React.ReactNode {
    const { type, item, isOver, isDragging, canDrag, canDrop, ...props } = this.props as HeaderWrapperProps; // eslint-disable-line @typescript-eslint/no-unused-vars

    let mode = 0;
    if (item && item.clientOffset && item.initialClientOffset) {
      // istanbul ignore next
      if (item.clientOffset.x > item.initialClientOffset.x)
        mode = 1;
      else
        mode = -1;
    }

    const classes = classnames(
      "components-table-header-drag-drop",
      {
        left: canDrop && !isDragging && isOver && /* istanbul ignore next */ mode === -1,
        right: canDrop && !isDragging && isOver && /* istanbul ignore next */ mode === 1,
        dragging: isDragging,
      },
      this.props.className,
    );
    return (
      <div className={classes} style={this.props.style}>
        <HeaderCell {...props} />
      </div>
    );
  }
}

/** @internal */
export const DragDropHeaderWrapper = withDragSource(withDropTarget(HeaderWrapper)); // eslint-disable-line deprecation/deprecation

// Used only internally in ./Table.tsx
/** @internal */
export class DragDropHeaderCell extends React.Component<DragDropHeaderCellProps> {
  public override render(): React.ReactNode {
    const { column } = this.props;
    /* istanbul ignore next */
    const dropTargetProps = {
      onDropTargetDrop: (args: DropTargetArguments): DropTargetArguments => { // eslint-disable-line deprecation/deprecation
        const sourceKey = args.dataObject.key || "";
        const sourceXpos = args.dataObject.xpos || 0;
        const targetKey = (column && column.key) || "";
        const targetXpos = (column && column.left) || 0;
        args.dataObject = { sourceKey, targetKey, sourceXpos, targetXpos };
        return args;
      },
      objectTypes: ["Column"],
    };
    const dragSourceProps = {
      onDragSourceBegin: (args: DragSourceArguments) => { // eslint-disable-line deprecation/deprecation
        args.dataObject = {
          key: (column && column.key) || /* istanbul ignore next */ "",
          xpos: (column && column.left) || /* istanbul ignore next */ "",
          column,
        };
        return args;
      },
      onDragSourceEnd: (args: DragSourceArguments) => { // eslint-disable-line deprecation/deprecation
        const { sourceKey, targetKey } = args.dataObject;
        this.props.onHeaderDrop && this.props.onHeaderDrop(sourceKey, targetKey);
      },
      objectType: () => {
        return "Column";
      },
      defaultDragLayer: ColumnDragLayer, // eslint-disable-line deprecation/deprecation
    };
    return (
      <DragDropHeaderWrapper
        {...this.props}
        dragProps={dragSourceProps}
        dropProps={dropTargetProps}
        shallow={false}
      />
    );
  }
}
