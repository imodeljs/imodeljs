/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyGrid
 */

import classnames from "classnames";
import * as React from "react";
import { PropertyRecord, PropertyValueFormat } from "@bentley/ui-abstract";
import { CommonProps, Orientation, RatioChangeResult } from "@bentley/ui-core";
import { PropertyUpdatedArgs } from "../../editors/EditorContainer";
import { ActionButtonRenderer } from "../../properties/renderers/ActionButtonRenderer";
import { PropertyRenderer } from "../../properties/renderers/PropertyRenderer";
import { PropertyValueRendererManager } from "../../properties/ValueRendererManager";
import { PropertyGridColumnInfo } from "../../properties/renderers/PropertyGridColumns";
import { PropertyCategory } from "../PropertyDataProvider";

/** Properties of [[PropertyList]] React component
 * @public
 */
export interface PropertyListProps extends CommonProps {
  orientation: Orientation;
  category?: PropertyCategory;
  properties: PropertyRecord[];
  selectedPropertyKey?: string;
  onPropertyClicked?: (property: PropertyRecord, key?: string) => void;
  onPropertyRightClicked?: (property: PropertyRecord, key?: string) => void;
  onPropertyContextMenu?: (property: PropertyRecord, e: React.MouseEvent) => void;
  columnRatio?: number;
  /** Callback to column ratio changed event */
  onColumnChanged?: (ratio: number) => void | RatioChangeResult;
  propertyValueRendererManager?: PropertyValueRendererManager;
  editingPropertyKey?: string;
  onEditCommit?: (args: PropertyUpdatedArgs, category: PropertyCategory) => void;
  onEditCancel?: () => void;
  /** Enables/disables property hovering effect */
  isPropertyHoverEnabled?: boolean;
  /** Enables/disables property selection */
  isPropertySelectionEnabled?: boolean;
  /** Enables/disables property right click selection */
  isPropertyRightClickSelectionEnabled?: boolean;
  /** Array of action button renderers */
  actionButtonRenderers?: ActionButtonRenderer[];
  /** Is resize handle hovered */
  isResizeHandleHovered?: boolean;
  /** Callback to hover event change */
  onResizeHandleHoverChanged?: (isHovered: boolean) => void;
  /** Is resize handle being dragged */
  isResizeHandleBeingDragged?: boolean;
  /** Callback to drag event change */
  onResizeHandleDragChanged?: (isDragStarted: boolean) => void;
  /** Callback to list width change event */
  onListWidthChanged?: (width: number) => void;
  /** Information for styling property grid columns */
  columnInfo?: PropertyGridColumnInfo;
}

/**
 * Get unique key for property record
 * @internal
 */
export function getPropertyKey(propertyCategory: PropertyCategory, propertyRecord: PropertyRecord) {
  return propertyCategory.name + propertyRecord.property.name;
}

/** State of [[PropertyList]] React component
 * @internal
 */
interface PropertyListState {
  /** Width of the whole property list container */
  width?: number;
}

/** A React component that renders multiple properties within a category as a list.
 * @public
 */
export class PropertyList extends React.Component<PropertyListProps, PropertyListState> {

  /** @internal */
  public override readonly state: PropertyListState = {};

  constructor(props: PropertyListProps) {
    super(props);
  }

  private _listRef = React.createRef<HTMLDivElement>();

  private _onEditCommit = (args: PropertyUpdatedArgs) => {
    // istanbul ignore else
    if (this.props.onEditCommit && this.props.category)
      this.props.onEditCommit(args, this.props.category);
  };

  private afterRender() {
    if (this.props.orientation !== Orientation.Horizontal || !this._listRef.current)
      return;
    const width = this._listRef.current.getBoundingClientRect().width;
    if (width !== this.state.width) {
      if (this.props.onListWidthChanged)
        this.props.onListWidthChanged(width);

      this.setState({ width });
    }
  }

  /** @internal */
  public override componentDidMount() {
    this.afterRender();
  }

  /** @internal */
  public override componentDidUpdate() {
    this.afterRender();
  }

  /** @internal */
  public override render() {
    const propertyListClassName = classnames(
      (this.props.orientation === Orientation.Horizontal) ? "components-property-list--horizontal" : "components-property-list--vertical",
      this.props.className,
    );

    return (
      <div className={propertyListClassName} style={this.props.style} ref={this._listRef}>
        {this.props.properties.map((propertyRecord: PropertyRecord) => {
          const key = this.props.category ? getPropertyKey(this.props.category, propertyRecord) : propertyRecord.property.name;
          return (
            <PropertyRenderer
              key={key}
              uniqueKey={key}
              isHoverable={this.props.isPropertyHoverEnabled}
              isSelectable={this.props.isPropertySelectionEnabled}
              isSelected={key === this.props.selectedPropertyKey}
              propertyRecord={propertyRecord}
              orientation={this.props.orientation}
              onClick={propertyRecord.value.valueFormat === PropertyValueFormat.Primitive ? this.props.onPropertyClicked : undefined}
              onRightClick={propertyRecord.value.valueFormat === PropertyValueFormat.Primitive ? this.props.onPropertyRightClicked : undefined}
              onContextMenu={this.props.onPropertyContextMenu}
              columnRatio={this.props.columnRatio}
              // eslint-disable-next-line deprecation/deprecation
              onColumnRatioChanged={this.props.onColumnChanged}
              propertyValueRendererManager={this.props.propertyValueRendererManager}
              isEditing={key === this.props.editingPropertyKey}
              onEditCommit={this._onEditCommit}
              onEditCancel={this.props.onEditCancel}
              width={this.state.width}
              actionButtonRenderers={this.props.actionButtonRenderers}
              isResizeHandleHovered={this.props.isResizeHandleHovered}
              onResizeHandleHoverChanged={this.props.onResizeHandleHoverChanged}
              isResizeHandleBeingDragged={this.props.isResizeHandleBeingDragged}
              onResizeHandleDragChanged={this.props.onResizeHandleDragChanged}
              columnInfo={this.props.columnInfo}
            />);
        })}
      </div>
    );
  }
}
