/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import * as React from "react";
import { getDisplayName } from "@bentley/ui-core";
import { DragSourceArguments, DragSourceProps, DropTargetArguments, DropTargetProps } from "../../../dragdrop/DragDropDef";
import { withDropTarget } from "../../../dragdrop/withDropTarget";
import { TreeDataProvider, TreeNodeItem } from "../../TreeDataProvider";
import { BeInspireTreeNode } from "../component/BeInspireTree";
import { TreeNode, TreeNodeProps } from "../component/Node";
import { TreeProps } from "../component/Tree";
import { DragDropTreeNode } from "./DragDropTreeNode";

/* eslint-disable deprecation/deprecation */

/**
 * Type for drag and drop,
 * @beta
 * @deprecated
 */
export type TreeDragDropType = {} | TreeNodeItem | TreeDataProvider;

/**
 * Props that are injected to the HOC component.
 * @beta
 * @deprecated
 */
export interface TreeDragDropProps<DragDropObject = any> {
  dragProps?: DragSourceProps<DragDropObject>;
  dropProps?: DropTargetProps<DragDropObject>;
}

/**
 * A HOC component that adds drag and drop functionality to the supplied tree component.
 * @beta
 * @deprecated
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function DEPRECATED_withTreeDragDrop<P extends TreeProps, DragDropObject extends TreeDragDropType>(TreeComponent: React.ComponentType<P>): React.ComponentType<P & TreeDragDropProps<DragDropObject>> {

  type CombinedProps = P & TreeDragDropProps<DragDropObject>;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const DropTree = withDropTarget<P, DragDropObject>(TreeComponent);

  return class WithDragAndDrop extends React.Component<CombinedProps> {

    public static get displayName() { return `WithDragAndDrop(${getDisplayName(TreeComponent)})`; }

    private createTreeDropProps(): DropTargetProps<DragDropObject> {
      if (!this.props.dropProps)
        return {};
      const { onDropTargetOver, onDropTargetDrop, canDropTargetDrop, objectTypes } = this.props.dropProps as DropTargetProps;
      const dropProps: DropTargetProps<DragDropObject> = {
        onDropTargetOver: (args: DropTargetArguments<DragDropObject>) => {
          // istanbul ignore else
          if (onDropTargetOver) {
            args.dropLocation = this.props.dataProvider as DragDropObject;
            onDropTargetOver(args);
          }
        },
        onDropTargetDrop: (args: DropTargetArguments<DragDropObject>): DropTargetArguments<DragDropObject> => {
          args.dropLocation = this.props.dataProvider as DragDropObject;
          return onDropTargetDrop ? onDropTargetDrop(args) : args;
        },
        canDropTargetDrop: (args: DropTargetArguments<DragDropObject>) => {
          args.dropLocation = this.props.dataProvider as DragDropObject;
          return canDropTargetDrop ? canDropTargetDrop(args) : true;
        },
        objectTypes,
      };
      return dropProps;
    }

    private createNodeDragProps(item: BeInspireTreeNode<TreeNodeItem>): DragSourceProps<DragDropObject> {
      if (!this.props.dragProps)
        return {};

      const parent = item.getParent() as BeInspireTreeNode<TreeNodeItem>;
      const { onDragSourceBegin, onDragSourceEnd, objectType } = this.props.dragProps as DragSourceProps;
      const dragProps: DragSourceProps<DragDropObject> = {
        onDragSourceBegin: (args: DragSourceArguments<DragDropObject>): DragSourceArguments<DragDropObject> => {
          args.dataObject = (item.payload && item.payload.extendedData) as DragDropObject;
          args.parentObject = ((parent && parent.payload) || this.props.dataProvider) as DragDropObject;
          return onDragSourceBegin ? onDragSourceBegin(args) : args;
        },
        onDragSourceEnd: (args: DragSourceArguments<DragDropObject>) => {
          // istanbul ignore else
          if (onDragSourceEnd) {
            args.parentObject = ((parent && parent.payload) || this.props.dataProvider) as DragDropObject;
            onDragSourceEnd(args);
          }
        },
        objectType: () => {
          // istanbul ignore else
          if (objectType) {
            if (typeof objectType === "function")
              return objectType(item.payload!.extendedData as DragDropObject);
            else
              return objectType;
          } else return "";
        },
      };
      return dragProps;
    }

    private createNodeDropProps(item: BeInspireTreeNode<TreeNodeItem>): DropTargetProps<DragDropObject> {
      if (!this.props.dropProps)
        return {};

      const parent = item.getParent() as BeInspireTreeNode<DragDropObject>;
      let index = 0;
      if (parent !== undefined)
        index = parent.getChildren().indexOf(item);
      const { onDropTargetOver, onDropTargetDrop, canDropTargetDrop, objectTypes } = this.props.dropProps as DropTargetProps;
      const dropProps: DropTargetProps<DragDropObject> = {
        onDropTargetOver: (args: DropTargetArguments<DragDropObject>) => {
          // istanbul ignore else
          if (onDropTargetOver) {
            // populate tree information while it's accessible
            args.dropLocation = item.payload as DragDropObject;
            if (args.dropRect) {
              const relativeY = (args.clientOffset.y - args.dropRect.top) / args.dropRect.height;
              if ((relativeY < 1 / 3 || relativeY > 2 / 3) && index !== undefined) {
                args.dropLocation = (parent && parent.payload) || this.props.dataProvider as DragDropObject;
                args.row = index;
                if (relativeY > 2 / 3) {
                  args.row = index + 1;
                }
              }
            }
            onDropTargetOver(args);
          }
        },
        onDropTargetDrop: (args: DropTargetArguments<DragDropObject>): DropTargetArguments<DragDropObject> => {
          // populate tree information while it's accessible
          args.dropLocation = item.payload as DragDropObject;
          if (args.dropRect) {
            const relativeY = (args.clientOffset.y - args.dropRect.top) / args.dropRect.height;
            if ((relativeY < 1 / 3 || relativeY > 2 / 3) && index !== undefined) {
              args.dropLocation = (parent && parent.payload) || this.props.dataProvider as DragDropObject;
              args.row = index;
              if (relativeY > 2 / 3) {
                args.row = index + 1;
              }
            }
          }
          if (onDropTargetDrop) return onDropTargetDrop(args);
          return args;
        },
        canDropTargetDrop: (args: DropTargetArguments<DragDropObject>) => {
          // populate tree information while it's accessible
          args.dropLocation = item.payload as DragDropObject;
          if (canDropTargetDrop) return canDropTargetDrop(args);
          return true;
        },
        objectTypes,
      };
      return dropProps;
    }

    public renderNode = (item: BeInspireTreeNode<TreeNodeItem>, props: TreeNodeProps): React.ReactNode => {
      // istanbul ignore next
      const baseNode = this.props.renderOverrides && this.props.renderOverrides.renderNode ? this.props.renderOverrides.renderNode(item, props) : <TreeNode {...props} />;
      const DDTreeNode = DragDropTreeNode<DragDropObject>(); // eslint-disable-line @typescript-eslint/naming-convention
      return (
        <DDTreeNode
          key={item.id}
          dragProps={this.createNodeDragProps(item)}
          dropProps={this.createNodeDropProps(item)}
          shallow={true}>
          {baseNode}
        </DDTreeNode>
      );
    };

    public override render() {
      const { dragProps, dropProps, renderNode, ...treeProps } = this.props as any; // eslint-disable-line @typescript-eslint/no-unused-vars
      return (
        <DropTree {...treeProps}
          renderNode={this.renderNode}
          dropStyle={{ height: "100%" }}
          dropProps={this.createTreeDropProps()}
          shallow={true} />
      );
    }

  };
}
