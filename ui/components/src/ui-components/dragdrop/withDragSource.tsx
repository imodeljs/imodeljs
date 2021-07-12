/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DragDrop
 */
import * as React from "react";
import { ConnectDragPreview, ConnectDragSource, DndComponentClass, DragSource } from "react-dnd";
import { DragSourceArguments, DragSourceProps, DropEffects, DropStatus, DropTargetArguments } from "./DragDropDef";

/** React properties for withDragSource Higher-Order Component
 * @beta
 * @deprecated
 */
export interface WithDragSourceProps<DragDropObject = any> {
  /** Properties and callbacks for DragSource. */
  dragProps: DragSourceProps<DragDropObject>; // eslint-disable-line deprecation/deprecation
  /** Style properties for dropTarget wrapper element */
  dragStyle?: React.CSSProperties;
  /** Which dropEffect dragSource should default to. */
  defaultDropEffect?: DropEffects; // eslint-disable-line deprecation/deprecation
  /** Which dropEffect dragSource should be used when ctrl button is pressed during start of drag. */
  ctrlDropEffect?: DropEffects; // eslint-disable-line deprecation/deprecation
  /** Which dropEffect dragSource should be used when alt button is pressed during start of drag. */
  altDropEffect?: DropEffects; // eslint-disable-line deprecation/deprecation
  /** @internal */
  connectDragSource?: ConnectDragSource;
  /** @internal */
  connectDragPreview?: ConnectDragPreview;
  /** @internal */
  isDragging?: boolean;
  /** @internal */
  canDrag?: boolean;
  /** @internal */
  item?: DragDropObject;
  /** @internal */
  type?: string | symbol | null;
}

/** @internal */
interface WithDragSourceState {
  ctrlKey: boolean;
  altKey: boolean;
}
let emptyImage: HTMLImageElement | undefined;

function getEmptyImage(): HTMLImageElement {
  if (!emptyImage) {
    emptyImage = new Image();
    emptyImage.src =
      "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  }
  return emptyImage;
}

/**
 * HOC (Higher-Order Component) that transforms wrapped component into a DragSource.
 * @param Component component to wrap.
 * @beta
 * @deprecated
 */
// istanbul ignore next
export const withDragSource = <ComponentProps extends {}, DragDropObject = any>(
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Component: React.ComponentType<ComponentProps>,
): DndComponentClass<typeof React.Component, ComponentProps & WithDragSourceProps<DragDropObject>> => { // eslint-disable-line deprecation/deprecation
  type Props = ComponentProps & WithDragSourceProps<DragDropObject>; // eslint-disable-line deprecation/deprecation
  return DragSource((props: Props) => {
    if (props.dragProps.objectType) {
      if (typeof props.dragProps.objectType === "function")
        return props.dragProps.objectType();
      else
        return props.dragProps.objectType;
    }
    return "";
  }, {
    beginDrag(props, _monitor, component) {
      let dropEffect = props.defaultDropEffect || DropEffects.Move; // eslint-disable-line deprecation/deprecation
      if (component.state.ctrlKey) {
        dropEffect = props.ctrlDropEffect || DropEffects.Copy; // eslint-disable-line deprecation/deprecation
      } else if (component.state.altKey) {
        dropEffect = props.altDropEffect || DropEffects.Link; // eslint-disable-line deprecation/deprecation
      }
      let dragRect: ClientRect = { left: 0, top: 0 } as ClientRect;
      const componentElement = component.rootElement;
      if (componentElement) {
        dragRect = componentElement.getBoundingClientRect();
      }
      const obj: DragSourceArguments<DragDropObject> = { // eslint-disable-line deprecation/deprecation
        dataObject: {} as DragDropObject,
        dropEffect,
        dropStatus: DropStatus.None, // eslint-disable-line deprecation/deprecation
        dragRect,
        defaultDragLayer: props.dragProps.defaultDragLayer,
        clientOffset: { x: dragRect.left || 0, y: dragRect.top || 0 },
        initialClientOffset: { x: dragRect.left || 0, y: dragRect.top || 0 },
      };
      if (props.dragProps.onDragSourceBegin) return props.dragProps.onDragSourceBegin(obj);
      return obj;
    },
    endDrag(props, monitor, component) {
      let dragRect: ClientRect = { left: 0, top: 0 } as ClientRect;
      const componentElement = component && component.rootElement;
      if (componentElement) {
        dragRect = componentElement.getBoundingClientRect();
      }
      // eslint-disable-next-line deprecation/deprecation
      const obj: DropTargetArguments<DragDropObject> = monitor.getDropResult() as DropTargetArguments<DragDropObject> || // if onDropTargetDrop returns a value
        // eslint-disable-next-line deprecation/deprecation
        monitor.getItem() as DropTargetArguments<DragDropObject> || // otherwise, get current drag item.
      { // fallback
        dataObject: {},
        dropEffect: DropEffects.None, // eslint-disable-line deprecation/deprecation
        dropStatus: DropStatus.None, // eslint-disable-line deprecation/deprecation
        dragRect,
        clientOffset: { x: 0, y: 0 },
        initialClientOffset: { x: 0, y: 0 },
        sourceClientOffset: { x: 0, y: 0 },
        initialSourceClientOffset: { x: 0, y: 0 },
      };
      const {
        dataObject,
        dropEffect, dropStatus, dropRect,
        initialClientOffset, initialSourceClientOffset,
        local, row, col } = obj;

      const clientOffset = monitor.getClientOffset() || obj.clientOffset;
      const sourceClientOffset = monitor.getSourceClientOffset() || obj.sourceClientOffset;
      const dragObj: DragSourceArguments<DragDropObject> = { // eslint-disable-line deprecation/deprecation
        dataObject,
        dropEffect, dropStatus, dropRect, dragRect,
        clientOffset, initialClientOffset, sourceClientOffset, initialSourceClientOffset,
        local, row, col,
      };
      if (props.dragProps.onDragSourceEnd)
        props.dragProps.onDragSourceEnd(dragObj);
    },
  }, (connect, monitor) => {
    return {
      connectDragSource: connect.dragSource(),
      connectDragPreview: connect.dragPreview(),
      isDragging: monitor.isDragging(),
      canDrag: monitor.canDrag(),
      item: monitor.getItem(),
      type: monitor.getItemType(),
    };
  })(class DragSourceWrapper extends React.Component<any, WithDragSourceState> {
    public rootElement: HTMLDivElement | null = null;
    public override readonly state: WithDragSourceState = {
      ctrlKey: false,
      altKey: false,
    };
    public static defaultProps: any = {
      defaultDropEffect: DropEffects.Move, // eslint-disable-line deprecation/deprecation
      ctrlDropEffect: DropEffects.Copy, // eslint-disable-line deprecation/deprecation
      altDropEffect: DropEffects.Link, // eslint-disable-line deprecation/deprecation
    };
    public override render() {
      const {
        dragProps, connectDragSource, connectDragPreview, // eslint-disable-line @typescript-eslint/no-unused-vars
        isDragging, canDrag, item, type,
        defaultDropEffect, ctrlDropEffect, altDropEffect,
        dragStyle, // eslint-disable-line @typescript-eslint/no-unused-vars
        ...props } = this.props as WithDragSourceProps<DragDropObject>; // eslint-disable-line deprecation/deprecation
      const p = {
        item,
        type,
        isDragging,
        canDrag,
      };
      const effectMap: { [key: number]: string } = {
        [DropEffects.Move]: "move", // eslint-disable-line deprecation/deprecation
        [DropEffects.Copy]: "copy", // eslint-disable-line deprecation/deprecation
        [DropEffects.Link]: "link", // eslint-disable-line deprecation/deprecation
      };

      const defaultEffect = effectMap[defaultDropEffect as number];
      const ctrlEffect = effectMap[ctrlDropEffect as number];
      const altEffect = effectMap[altDropEffect as number];

      const dropEffect = this.state.ctrlKey ? ctrlEffect || "copy" : this.state.altKey ? altEffect || "link" : defaultEffect || "move";
      return connectDragSource!(
        <div className="drag-source-wrapper" data-testid="drag-source-wrapper" ref={(el) => { this.rootElement = el; }} style={this.props.dragStyle}>
          <Component {...props} {...(p as any)} />
        </div>,
        { dropEffect },
      );
    }
    public override componentDidMount() {
      if (this.props.connectDragPreview) {
        this.props.connectDragPreview(getEmptyImage() as any, { captureDraggingState: true });
      }
      window.addEventListener("keydown", this.handleKeyChange);
      window.addEventListener("keyup", this.handleKeyChange);
    }
    public override componentWillUnmount() {
      window.removeEventListener("keydown", this.handleKeyChange);
      window.removeEventListener("keyup", this.handleKeyChange);
    }
    public handleKeyChange = (event: any) => {
      const { ctrlKey, altKey } = event;
      if (this.state.ctrlKey !== ctrlKey) {
        this.setState({ ctrlKey });
      }
      if (this.state.altKey !== altKey) {
        this.setState({ altKey });
      }
    };
  }) as any;
};
