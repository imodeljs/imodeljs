/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DragDrop
 */

import classnames from "classnames";
import * as React from "react";
import { DndComponentClass, DragLayer, DragLayerMonitor } from "react-dnd";
import { DragLayerProps, DragSourceArguments } from "@bentley/ui-components";
import { CommonProps, UiEvent } from "@bentley/ui-core";

/** Drag/Drop Layer Changed Event Args class.
 * @beta
 * @deprecated
 */
export interface DragDropLayerChangedEventArgs {
  /** The new drag type. */
  type: string | undefined;
}

/** Drag/Drop Layer Changed Event class.
 * @beta
 * @deprecated
 */
export class DragDropLayerChangedEvent extends UiEvent<DragDropLayerChangedEventArgs> { } // eslint-disable-line deprecation/deprecation

/** Drag/Drop Layer Manager class.
 * @beta
 * @deprecated
 */
export class DragDropLayerManager {
  private static _currentType: string | undefined;
  private static _layers: { [type: string]: React.ComponentType<DragLayerProps> } = {}; // eslint-disable-line deprecation/deprecation
  private static _dragDropLayerChangedEvent = new DragDropLayerChangedEvent(); // eslint-disable-line deprecation/deprecation

  // istanbul ignore next
  public static get onDragDropLayerChangedEvent(): DragDropLayerChangedEvent { return this._dragDropLayerChangedEvent; } // eslint-disable-line deprecation/deprecation

  /**
   * Gets the currently active drag type.
   */
  public static getType(): string | undefined {
    return this._currentType;
  }

  /**
   * Gets the DragLayer component of the currently active type.
   */
  public static getActiveLayer() {
    // istanbul ignore if
    if (this._currentType)
      return this._layers[this._currentType];
    return undefined;
  }

  /**
   * Sets the current type.
   * @note The current drag type is set automatically when a drag starts. Manually setting type before a drag will be overridden by DragDropManager.
   */
  public static setType(type: string | undefined) {
    this._currentType = type;
    this._dragDropLayerChangedEvent.emit({ type });
  }

  /** Registers a new DragLayer for the given type. */
  // istanbul ignore next
  public static registerTypeLayer(type: string, layer: React.ComponentType<DragLayerProps>) { // eslint-disable-line deprecation/deprecation
    this._layers[type] = layer;
  }
}

/** Properties for the DragDropLayerRenderer component
 * @beta
 * @deprecated
 */
export interface DragDropLayerRendererProps extends CommonProps {
  dragging?: boolean;
  item?: any;
  itemType?: string;
  args?: DragSourceArguments; // eslint-disable-line deprecation/deprecation
  /** @internal */
  clientOffset?: { x: number, y: number };
  /** @internal */
  initialClientOffset?: { x: number, y: number };
  /** @internal */
  sourceClientOffset?: { x: number, y: number };
  /** @internal */
  initialSourceClientOffset?: { x: number, y: number };
}

/** DragDropLayerRenderer component.
 * @beta
 * @deprecated
 */
export class DragDropLayerRendererComponent extends React.Component<DragDropLayerRendererProps> { // eslint-disable-line deprecation/deprecation
  private _dragging: boolean = false;

  constructor(props: DragDropLayerRendererProps) { // eslint-disable-line deprecation/deprecation
    super(props);
  }

  public override componentDidMount() {
    window.addEventListener("dragstart", this._handleDragStart);
    window.addEventListener("dragend", this._handleDragEnd);
  }

  public override componentWillUnmount() {
    window.removeEventListener("dragstart", this._handleDragStart);
    window.removeEventListener("dragend", this._handleDragEnd);
  }

  // istanbul ignore next
  private _handleDragStart = () => {
    this._dragging = true;
  };

  // istanbul ignore next
  private _handleDragEnd = () => {
    this._dragging = false;
  };

  // istanbul ignore next
  public override render(): React.ReactNode {
    // eslint-disable-next-line deprecation/deprecation
    if (this.props.itemType !== DragDropLayerManager.getType()) { // A drag of a new type has been triggered.
      DragDropLayerManager.setType(this.props.itemType); // eslint-disable-line deprecation/deprecation
    }
    const { item,
      clientOffset, initialClientOffset,
      sourceClientOffset, initialSourceClientOffset,
    } = this.props;

    const dragSourceArgs = item as DragSourceArguments; // eslint-disable-line deprecation/deprecation

    // eslint-disable-next-line deprecation/deprecation
    const LayerElement = DragDropLayerManager.getActiveLayer() || (dragSourceArgs && dragSourceArgs.defaultDragLayer); // eslint-disable-line @typescript-eslint/naming-convention
    if (!this._dragging || !LayerElement)
      return null;

    if (clientOffset)
      dragSourceArgs.clientOffset = clientOffset;
    if (initialClientOffset)
      dragSourceArgs.initialClientOffset = initialClientOffset;

    dragSourceArgs.sourceClientOffset = sourceClientOffset;
    dragSourceArgs.initialSourceClientOffset = initialSourceClientOffset;

    return (
      <div className={classnames("uifw-dragdrop-layer", this.props.className)} style={this.props.style}>
        <LayerElement args={dragSourceArgs} />
      </div>
    );
  }
}

/** Dnd Collecting Function */
const collect = (monitor: DragLayerMonitor) => ({
  item: monitor.getItem(),
  itemType: monitor.getItemType(),
  clientOffset: monitor.getClientOffset(),
  initialClientOffset: monitor.getInitialClientOffset(),
  sourceClientOffset: monitor.getSourceClientOffset(),
  initialSourceClientOffset: monitor.getInitialSourceClientOffset(),
  dragging: monitor.isDragging(),
});

/**
 * Contains the DragLayers to all DragSource types.
 * New DragLayers are registered by type using [[DragDropLayerManager.registerTypeLayer]]
 * This component must be placed on a root DOM node at the bottom to render DragLayers properly.
 * @beta
 * @deprecated
 */
export const DragDropLayerRenderer: typeof DragDropLayerRendererComponent & DndComponentClass<typeof React.Component, {}> =  // eslint-disable-line deprecation/deprecation
  DragLayer<DragDropLayerRendererProps>(collect)(DragDropLayerRendererComponent) as any; // eslint-disable-line deprecation/deprecation
