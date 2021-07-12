/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import "./TableCell.scss";
import classnames from "classnames";
import * as React from "react";
import { CommonProps, Icon, Omit } from "@bentley/ui-core";
import { EditorContainer, EditorContainerProps } from "../../editors/EditorContainer";
import { ItemStyleProvider } from "../../properties/ItemStyle";
import {
  PropertyContainerType, PropertyDialogState, PropertyValueRendererContext, PropertyValueRendererManager,
} from "../../properties/ValueRendererManager";
import { CellItem } from "../TableDataProvider";

/**
 * Properties of the [[TableCell]] React component
 * @public
 */
export interface TableCellProps extends CommonProps {
  /** Additional class name for the cell container */
  className?: string;
  /** Title of the cell container */
  title: string;
  /** Cell content */
  children?: React.ReactNode;
  /** Click event callback */
  onClick?: (e: React.MouseEvent) => void;
  /** MouseMove event callback */
  onMouseMove?: (e: React.MouseEvent) => void;
  /** MouseDown event callback */
  onMouseDown?: (e: React.MouseEvent) => void;
  /** Properties for [[EditorContainer]]. Activates cell editing and provides properties to the container */
  cellEditingProps?: Omit<EditorContainerProps, "title">;
}

/**
 * A React component that renders a table cell
 * @public
 */
export class TableCell extends React.PureComponent<TableCellProps> {
  /** @internal */
  public override render() {

    if (this.props.cellEditingProps) {
      return (
        <div
          className={classnames("components-table-cell", this.props.className)}
          style={this.props.style}
        >
          <EditorContainer
            title={this.props.title}
            {...this.props.cellEditingProps}
          />
        </div>
      );
    }

    return (
      <div
        className={classnames("components-table-cell", this.props.className)}
        style={this.props.style}
        title={this.props.title}
        onClick={this.props.onClick}
        onMouseMove={this.props.onMouseMove}
        onMouseDown={this.props.onMouseDown}
        role="presentation"
      >
        {this.props.children}
      </div>
    );
  }
}

/** Properties of the [[TableCellContent]] React component
 * @public
 */
export interface TableCellContentProps extends CommonProps {
  /** Indicates, whether container cell is selected or not */
  isSelected: boolean;
  /** Props for the item that will be rendered */
  cellItem: CellItem;
  /** Height of the component */
  height?: number;
  /** Callback to DialogOpen event */
  onDialogOpen?: (state: PropertyDialogState) => void;
  /** Property value renderer manager */
  propertyValueRendererManager: PropertyValueRendererManager;
}

/** State of the [[TableCellContent]] React component
 * @internal
 */
interface TableCellContentState {
  /** Rendered content */
  content: React.ReactNode;
}

/** A React component that renders table cell content
 * @public
 */
export class TableCellContent extends React.PureComponent<TableCellContentProps, TableCellContentState> {
  /** @internal */
  public override readonly state: TableCellContentState = {
    content: <div className={this.props.className} style={this.getStyle(this.props.cellItem, this.props.isSelected, this.props.height)} />,
  };

  private _isMounted = false;

  private getStyle(cellItem: CellItem, isSelected: boolean, height?: number): React.CSSProperties {
    return {
      ...ItemStyleProvider.createStyle(cellItem.style ? cellItem.style : {}, isSelected),
      textAlign: cellItem.alignment,
      height,
      lineHeight: `${height}px`, // Centers text vertically
      ...this.props.style,
    };
  }

  private async renderContent(props: TableCellContentProps) {
    const style = this.getStyle(props.cellItem, props.isSelected, props.height);

    if (!props.cellItem.record)
      return <div className={this.props.className} style={style} />;

    const rendererContext: PropertyValueRendererContext = {
      containerType: PropertyContainerType.Table,
      onDialogOpen: this.props.onDialogOpen,
      style,
      // TODO: Enable, when table gets refactored. Explanation in ./../table/NonPrimitiveValueRenderer
      // onPopupShow: this._onPopupShow,
      // onPopupHide: this._onPopupHide,
    };

    return this.props.propertyValueRendererManager.render(props.cellItem.record, rendererContext);
  }

  private doPropsDiffer(props1: TableCellContentProps, props2: TableCellContentProps) {
    return props1.cellItem !== props2.cellItem
      || props1.isSelected !== props2.isSelected
      || props1.onDialogOpen !== props2.onDialogOpen
      || props1.propertyValueRendererManager !== props2.propertyValueRendererManager;
  }

  /** @internal */
  public override async componentDidMount() {
    this._isMounted = true;
    const content = await this.renderContent(this.props);

    // istanbul ignore else
    if (this._isMounted)
      this.setState({ content });
  }

  /** @internal */
  public override componentWillUnmount() {
    this._isMounted = false;
  }

  /** @internal */
  public override async componentDidUpdate(prevProps: TableCellContentProps) {
    if (this.doPropsDiffer(prevProps, this.props)) {
      const content = await this.renderContent(this.props);

      if (this._isMounted)
        this.setState({ content });
    }
  }

  /** @internal */
  public override render() {
    return this.state.content;
  }
}

/** Properties for the [[TableIconCellContent]] React component
 * @public
 */
export interface TableIconCellContentProps {
  /** Icon name */
  iconName: string;
}

/**
 * A React component that renders table cell content as a Bentley icon
 * @public
 */
export class TableIconCellContent extends React.PureComponent<TableIconCellContentProps> {
  /** @internal */
  public override render() {
    return <Icon iconSpec={this.props.iconName} />;
  }
}
