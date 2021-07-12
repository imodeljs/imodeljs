/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Breadcrumb
 */

import * as React from "react";
import { getDisplayName } from "@bentley/ui-core";
import { DragSourceArguments, DragSourceProps, DropTargetArguments, DropTargetProps } from "../../dragdrop/DragDropDef";
import { TreeDragDropType } from "../../tree/deprecated/hocs/withDragDrop";
import { TreeNodeItem } from "../../tree/TreeDataProvider";
import { BreadcrumbNode, BreadcrumbNodeProps, BreadcrumbProps } from "../Breadcrumb";
import { DragDropBreadcrumbNode } from "./DragDropBreadcrumbNode";

/* eslint-disable deprecation/deprecation */

/**
 * Props that are injected to the HOC component.
 * @beta
 * @deprecated
 */
export interface BreadcrumbDragDropProps<DragDropObject = any> {
  dragProps?: DragSourceProps<DragDropObject>;
  dropProps?: DropTargetProps<DragDropObject>;
}

/**
 * A HOC component that adds drag and drop functionality to the supplied breadcrumb component.
 * @beta
 * @deprecated
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function withBreadcrumbDragDrop<P extends BreadcrumbProps, DragDropObject extends TreeDragDropType>(BreadcrumbComponent: React.ComponentType<P>): React.ComponentType<P & BreadcrumbDragDropProps<DragDropObject>> {

  type CombinedProps = P & BreadcrumbDragDropProps<DragDropObject>;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  return class WithDragAndDrop extends React.Component<CombinedProps> {

    public static get displayName() { return `WithDragDrop(${getDisplayName(BreadcrumbComponent)})`; }

    public createNodeDragProps(item?: TreeNodeItem, parent?: TreeNodeItem): DragSourceProps<DragDropObject> {
      if (!item || !this.props.dragProps)
        return {};

      const { onDragSourceBegin, onDragSourceEnd, objectType } = this.props.dragProps as any;
      const dragProps: DragSourceProps<DragDropObject> = {
        onDragSourceBegin: (args: DragSourceArguments<DragDropObject>) => {
          args.dataObject = item.extendedData as DragDropObject;
          args.parentObject = (parent || this.props.dataProvider) as DragDropObject;
          return onDragSourceBegin ? onDragSourceBegin(args) : args;
        },
        onDragSourceEnd: (args: DragSourceArguments<DragDropObject>) => {
          // istanbul ignore else
          if (onDragSourceEnd) {
            args.parentObject = (parent || this.props.dataProvider) as DragDropObject;
            onDragSourceEnd(args);
          }
        },
        objectType: () => {
          if (typeof objectType === "function")
            return objectType(item.extendedData as DragDropObject);
          else
            return objectType;
        },
      };
      return dragProps;
    }

    public createNodeDropProps(item?: TreeNodeItem): DropTargetProps<DragDropObject> {
      if (!this.props.dropProps)
        return {};
      const { onDropTargetDrop, onDropTargetOver, canDropTargetDrop, objectTypes } = this.props.dropProps as any;
      const dropProps = {
        onDropTargetDrop: (args: DropTargetArguments<DragDropObject>): DropTargetArguments<DragDropObject> => {
          args.dropLocation = (item || this.props.dataProvider) as DragDropObject;
          return onDropTargetDrop ? onDropTargetDrop(args) : args;
        },
        onDropTargetOver: (args: DropTargetArguments<DragDropObject>) => {
          // istanbul ignore else
          if (onDropTargetOver) {
            args.dropLocation = (item || this.props.dataProvider) as DragDropObject;
            onDropTargetOver(args);
          }
        },
        canDropTargetDrop: (args: DropTargetArguments<DragDropObject>) => {
          args.dropLocation = (item || this.props.dataProvider) as DragDropObject;
          return canDropTargetDrop ? canDropTargetDrop(args) : true;
        },
        objectTypes,
      };
      return dropProps;
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    private renderNode = (props: BreadcrumbNodeProps, node?: TreeNodeItem, parent?: TreeNodeItem): React.ReactNode => {
      const baseNode = this.props.renderNode ? /* istanbul ignore next */this.props.renderNode(props, node) : <BreadcrumbNode {...props} />;
      const DDBreadcrumbNode = DragDropBreadcrumbNode<DragDropObject>(); // eslint-disable-line @typescript-eslint/naming-convention
      return (
        <DDBreadcrumbNode
          key={(node && /* istanbul ignore next */ node.id) || "root"}
          dragProps={this.createNodeDragProps(node, parent)}
          dropProps={this.createNodeDropProps(node)}>
          {baseNode}
        </DDBreadcrumbNode>
      );
    };

    public override render() {
      const { dragProps, dropProps, renderNode, ...treeProps } = this.props as any; // eslint-disable-line @typescript-eslint/no-unused-vars
      return (
        <BreadcrumbComponent {...treeProps}
          renderNode={this.renderNode} />
      );
    }
  };
}
