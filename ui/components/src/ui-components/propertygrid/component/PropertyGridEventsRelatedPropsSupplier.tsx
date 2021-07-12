/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module PropertyGrid
 */
import "./PropertyGrid.scss";
import * as React from "react";
import { PropertyRecord, PropertyValueFormat } from "@bentley/ui-abstract";
import { PropertyUpdatedArgs } from "../../editors/EditorContainer";
import { PropertyCategory } from "../PropertyDataProvider";
import { CommonPropertyGridProps } from "./PropertyGridCommons";
import { PropertyListProps } from "./PropertyList";

/** @internal */
export type PropertyGridEventsRelatedProps = Pick<PropertyListProps, "onPropertyClicked" | "onPropertyRightClicked" |
"onPropertyContextMenu" | "onEditCommit" | "onEditCancel" | "selectedPropertyKey" | "editingPropertyKey"> &
Pick<CommonPropertyGridProps, "isPropertySelectionOnRightClickEnabled" | "isPropertyEditingEnabled"> &
Required<Pick<CommonPropertyGridProps, "isPropertyHoverEnabled" | "isPropertySelectionEnabled">>;

/** Properties for [[PropertyGridEventsRelatedPropsSupplier]] React component
 * @internal
 */
export type PropertyGridEventsRelatedPropsSupplierProps = Pick<CommonPropertyGridProps, "onPropertyContextMenu" |
"isPropertySelectionOnRightClickEnabled" | "isPropertySelectionOnRightClickEnabled" |
"onPropertySelectionChanged" | "isPropertyEditingEnabled" | "onPropertyUpdated"> &
Required<Pick<CommonPropertyGridProps, "isPropertyHoverEnabled" | "isPropertySelectionEnabled">> & {
  children: (context: PropertyGridEventsRelatedProps) => React.ReactNode;
};

/** State of [[PropertyGridEventsRelatedPropsSupplier]] React component
 * @internal
 */
interface PropertyGridEventsRelatedPropsSupplierState {
  /** Unique key of currently selected property */
  selectedPropertyKey?: string;
  /** Unique key of currently edited property */
  editingPropertyKey?: string;
}

/** PropertyGridEventsRelatedPropsSupplier React component.
 * @internal
 */
export class PropertyGridEventsRelatedPropsSupplier extends React.Component<PropertyGridEventsRelatedPropsSupplierProps, PropertyGridEventsRelatedPropsSupplierState> {
  /** @internal */
  constructor(props: PropertyGridEventsRelatedPropsSupplierProps) {
    super(props);
    this.state = {};
  }

  private _isClickSupported() {
    return this.props.isPropertySelectionEnabled || this.props.isPropertyEditingEnabled;
  }

  private _isRightClickSupported() {
    return this.props.isPropertySelectionOnRightClickEnabled;
  }

  private _onPropertyRightClicked = (property: PropertyRecord, key?: string) => {
    // istanbul ignore else
    if (this._isRightClickSupported())
      this.onEnabledPropertyRightClicked(property, key);
  };

  private _onPropertyClicked = (property: PropertyRecord, key?: string) => {
    // istanbul ignore else
    if (this._isClickSupported())
      this.onEnabledPropertyLeftClicked(property, key);
  };

  private _onPropertyContextMenu = (property: PropertyRecord, e: React.MouseEvent) => {
    if (this.props.onPropertyContextMenu) {
      this.props.onPropertyContextMenu({ propertyRecord: property, event: e });
    }
  };

  private _onEditCommit = async (args: PropertyUpdatedArgs, category: PropertyCategory) => {
    // istanbul ignore else
    if (this.props.onPropertyUpdated) {
      await this.props.onPropertyUpdated(args, category);
      this.setState({ editingPropertyKey: undefined });
    }
  };

  private _onEditCancel = () => {
    this.setState({ editingPropertyKey: undefined });
  };

  private onEnabledPropertyRightClicked(property: PropertyRecord, key: string | undefined) {
    let selectedPropertyKey = this.state.selectedPropertyKey;
    let editingPropertyKey = this.state.editingPropertyKey;

    editingPropertyKey = undefined;
    if (selectedPropertyKey !== key)
      selectedPropertyKey = key;

    if (this.props.onPropertySelectionChanged)
      this.props.onPropertySelectionChanged(property);

    this.setState({ selectedPropertyKey, editingPropertyKey });
  }

  private onEnabledPropertyLeftClicked(property: PropertyRecord, key: string | undefined) {
    let selectedPropertyKey = this.state.selectedPropertyKey;
    let editingPropertyKey = this.state.editingPropertyKey;

    const isValuePrimitive = property.value.valueFormat === PropertyValueFormat.Primitive;
    const isEditingEnabled = this.props.isPropertyEditingEnabled;
    const isSelectionEnabled = this.props.isPropertySelectionEnabled;

    if (isEditingEnabled && isValuePrimitive) {
      // Deselect editing key only if another selection was made
      editingPropertyKey = isSelectionEnabled && selectedPropertyKey !== key ? undefined : key;
    }

    if (editingPropertyKey === key) {
      this.setState({ editingPropertyKey });
      return;
    }

    // Select/Deselect
    selectedPropertyKey = selectedPropertyKey !== key ? key : undefined;

    if (this.props.onPropertySelectionChanged)
      this.props.onPropertySelectionChanged(property);

    this.setState({ selectedPropertyKey, editingPropertyKey });
  }

  /** @internal */
  public override render() {
    const renderContext: PropertyGridEventsRelatedProps = {
      isPropertyHoverEnabled: this.props.isPropertyHoverEnabled,
      isPropertySelectionEnabled: this.props.isPropertySelectionEnabled,
      isPropertySelectionOnRightClickEnabled: this.props.isPropertySelectionOnRightClickEnabled,
      isPropertyEditingEnabled: this.props.isPropertyEditingEnabled,
      selectedPropertyKey: this.state.selectedPropertyKey,
      editingPropertyKey: this.state.editingPropertyKey,
      onEditCommit: this._onEditCommit,
      onEditCancel: this._onEditCancel,
      onPropertyClicked: this._isClickSupported() ? this._onPropertyClicked : undefined,
      onPropertyRightClicked: this._isRightClickSupported() ? this._onPropertyRightClicked : undefined,
      onPropertyContextMenu: this._onPropertyContextMenu,
    };

    return (
      <React.Fragment>
        {this.props.children(renderContext)}
      </React.Fragment>
    );
  }
}
