/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DragDrop
 */
import * as React from "react";
import { ConnectDropTarget, DndComponentClass, DropTarget } from "react-dnd";
import { DragSourceArguments, DropTargetArguments, DropTargetProps } from "./DragDropDef";

/** React properties for withDropTarget Higher-Order Component
 * @beta
 * @deprecated
 */
export interface WithDropTargetProps<DragDropObject = any> {
  /** Properties and callbacks for DropTarget */
  dropProps: DropTargetProps<DragDropObject>; // eslint-disable-line deprecation/deprecation
  /** Whether to propagate to parent DropTargets. */
  shallow?: boolean;
  /** Style properties for dropTarget wrapper element */
  dropStyle?: React.CSSProperties;

  /** @internal */
  connectDropTarget?: ConnectDropTarget;
  /** @internal */
  isOver?: boolean;
  /** @internal */
  canDrop?: boolean;
  /** @internal */
  item?: DragDropObject;
  /** @internal */
  type?: string | symbol;
}

/**
 * HOC (Higher-Order Component) that transforms wrapped component into a DropTarget.
 * @param Component component to wrap.
 * @beta
 * @deprecated
 */
// istanbul ignore next
export const withDropTarget = <ComponentProps extends {}, DragDropObject = any>(
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Component: React.ComponentType<ComponentProps>,
): DndComponentClass<typeof React.Component, ComponentProps & WithDropTargetProps<DragDropObject>> => { // eslint-disable-line deprecation/deprecation
  type Props = ComponentProps & WithDropTargetProps<DragDropObject>; // eslint-disable-line deprecation/deprecation
  return DropTarget((props: Props): Array<string | symbol> => {
    if (props.dropProps.objectTypes) {
      if (typeof props.dropProps.objectTypes === "function")
        return props.dropProps.objectTypes();
      else
        return props.dropProps.objectTypes;
    }
    return [];
  }, {
    drop(props, monitor, component) {
      const dragSourceArgs = monitor.getItem() as DragSourceArguments<DragDropObject>; // eslint-disable-line deprecation/deprecation
      if (monitor.isOver({ shallow: props.shallow || false })) {
        let dropRect: ClientRect = {} as ClientRect;
        const componentElement = component.rootElement;
        if (componentElement) {
          dropRect = componentElement.getBoundingClientRect();
        }

        const clientOffset = monitor.getClientOffset() || dragSourceArgs.clientOffset;
        const initialClientOffset = monitor.getInitialClientOffset() || dragSourceArgs.initialClientOffset;
        const sourceClientOffset = monitor.getSourceClientOffset() || dragSourceArgs.sourceClientOffset;
        const initialSourceClientOffset = monitor.getInitialSourceClientOffset() || dragSourceArgs.initialSourceClientOffset;

        const dropTargetArgs: DropTargetArguments<DragDropObject> = { // eslint-disable-line deprecation/deprecation
          ...dragSourceArgs,
          row: undefined, // clear stale row/col values to be set while propagating back down
          col: undefined,
          dropRect,
          clientOffset,
          initialClientOffset,
          sourceClientOffset,
          initialSourceClientOffset,
        };
        if (props.dropProps.onDropTargetDrop)
          return props.dropProps.onDropTargetDrop(dropTargetArgs);
      }
      return;
    },
    hover(props, monitor, component) {
      if (monitor.isOver({ shallow: props.shallow || false }) && props.dropProps.onDropTargetOver) {
        const dragSourceArgs = monitor.getItem() as DragSourceArguments<DragDropObject>; // eslint-disable-line deprecation/deprecation
        let dropRect: ClientRect = {} as ClientRect;
        const componentElement = component.rootElement;
        if (componentElement) {
          dropRect = componentElement.getBoundingClientRect();
        }

        const clientOffset = monitor.getClientOffset() || dragSourceArgs.clientOffset;
        const initialClientOffset = monitor.getInitialClientOffset() || dragSourceArgs.initialClientOffset;
        const sourceClientOffset = monitor.getSourceClientOffset() || dragSourceArgs.sourceClientOffset;
        const initialSourceClientOffset = monitor.getInitialSourceClientOffset() || dragSourceArgs.initialSourceClientOffset;

        const dropTargetArgs: DropTargetArguments<DragDropObject> = { // eslint-disable-line deprecation/deprecation
          ...dragSourceArgs,
          row: undefined, // clear stale row/col values to be set while propagating back down
          col: undefined,
          dropRect,
          clientOffset,
          initialClientOffset,
          sourceClientOffset,
          initialSourceClientOffset,
        };
        props.dropProps.onDropTargetOver(dropTargetArgs);
      }
    },
    canDrop(props, monitor) {
      if (monitor.isOver({ shallow: props.shallow || false }) && props.dropProps.canDropTargetDrop) {
        const dragSourceArgs = monitor.getItem() as DragSourceArguments<DragDropObject>; // eslint-disable-line deprecation/deprecation
        const clientOffset = monitor.getClientOffset() || dragSourceArgs.clientOffset;
        const initialClientOffset = monitor.getInitialClientOffset() || dragSourceArgs.initialClientOffset;
        const sourceClientOffset = monitor.getSourceClientOffset() || dragSourceArgs.sourceClientOffset;
        const initialSourceClientOffset = monitor.getInitialSourceClientOffset() || dragSourceArgs.initialSourceClientOffset;

        const dropTargetArgs: DropTargetArguments<DragDropObject> = { // eslint-disable-line deprecation/deprecation
          ...dragSourceArgs,
          clientOffset,
          initialClientOffset,
          sourceClientOffset,
          initialSourceClientOffset,
        };
        return props.dropProps.canDropTargetDrop(dropTargetArgs);
      }
      return true;
    },
  }, (connect, monitor) => {
    return {
      connectDropTarget: connect.dropTarget(),
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
      item: monitor.getItem(),
      type: monitor.getItemType() || undefined,
    };
  })(class WithDropTarget extends React.Component<any> {
    public rootElement: HTMLDivElement | null = null;
    public override render() {
      const {
        dropProps, shallow, // eslint-disable-line @typescript-eslint/no-unused-vars
        connectDropTarget,
        isOver, canDrop, item, type,
        dropStyle, // eslint-disable-line @typescript-eslint/no-unused-vars
        ...props } = this.props as WithDropTargetProps<DragDropObject>; // eslint-disable-line deprecation/deprecation

      const p = {
        item,
        type,
        isOver,
        canDrop,
      };
      return connectDropTarget!(
        <div className="drop-target-wrapper" data-testid="drop-target-wrapper" ref={(el) => { this.rootElement = el; }} style={this.props.dropStyle}>
          <Component {...props} {...(p as any)} />
        </div>,
      );
    }
  }) as any;
};
