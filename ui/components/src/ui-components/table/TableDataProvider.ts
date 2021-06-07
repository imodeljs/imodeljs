/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import { BeEvent } from "@bentley/bentleyjs-core";
import { PropertyDescription, PropertyRecord } from "@bentley/ui-abstract";
import { HorizontalAlignment, SortDirection } from "@bentley/ui-core";
import { ItemColorOverrides, ItemStyle } from "../properties/ItemStyle";
import { CompositeFilterDescriptorCollection, DistinctValueCollection } from "./columnfiltering/ColumnFiltering";

// cSpell:ignore columnfiltering

/** Filter Renderer for a Table column
 * @public
 */
export enum FilterRenderer {
  Numeric = 1,
  MultiSelect,
  SingleSelect,
  Text,
  MultiValue,
}

/**
 * Column definition provided to Table.
 * @public
 */
export interface ColumnDescription {
  /** A unique key for this column. */
  key: string;

  /** Column header label */
  label: string;
  /** Property description for all cells in the column */
  propertyDescription?: PropertyDescription;

  /** Preferred initial width of the column */
  width?: number;

  /** Indicates whether the cells in the column are editable. Defaults to false. */
  editable?: boolean;
  /** Indicates whether the column is resizable. Defaults to false. */
  resizable?: boolean;
  /** Indicates whether the display value for the cell is treated as an icon spec. Defaults to false. */
  icon?: boolean;

  /** Indicates whether the column is sortable. Defaults to false. */
  sortable?: boolean;
  /** Specifies a secondary sort column to use when cell values are the same. */
  secondarySortColumn?: number;
  /** Indicates whether the column sorting ignores case. Defaults to false. */
  sortIgnoreCase?: boolean;

  /** Indicates whether the column is filterable. Defaults to false. */
  filterable?: boolean;
  /** Specifies the filter renderer for the column. */
  filterRenderer?: FilterRenderer;

  /** Show field filters in Multi-Value column filtering popup. Defaults to true. */
  showFieldFilters?: boolean;
  /** Show distinct value checkboxes in Multi-Value column filtering popup. Defaults to true. */
  showDistinctValueFilters?: boolean;
  /** Filtering is case-sensitive in Multi-Value column filtering popup. Defaults to false. */
  filterCaseSensitive?: boolean;
}

/**
 * Cell definition provided to Table.
 * @public
 */
export interface CellItem {
  /** Key for the column containing the cell */
  key: string;
  /** Property record for the cell */
  record?: PropertyRecord;

  /** Indicates whether the cell is disabled */
  isDisabled?: boolean;
  /** Specifies the horizontal alignment of the contents of the cell */
  alignment?: HorizontalAlignment;

  /** Style properties for the contents of the cell */
  style?: ItemStyle;

  /**
   * Property to specify how many cells were merged to create this cell.
   * Default value is 1.
   * @alpha
   */
  mergedCellsCount?: number;
}

/**
 * Row definition provided to Table.
 * @public
 */
export interface RowItem {
  /** A unique key for this row */
  key: string;
  /** Array of cells in the row */
  cells: CellItem[];
  /** Indicates whether the row is disabled */
  isDisabled?: boolean;
  /** Color overrides for all cells in the row */
  colorOverrides?: ItemColorOverrides;

  /**
   * A key-value pairs data structure that can be used by data provider
   * to store some custom data for this node item.
   */
  extendedData?: { [key: string]: any };

  /**
   * Get the value from the cell for filtering purposes.
   * If not specified and the value is a primitive, the recordValue.value is returned.
   */
  getValueFromCell?: (columnKey: string) => any;
}

/** An interface table data change listeners
 * @public
 */
export declare type TableDataChangesListener = () => void;

/** An event broadcasted on table data changes
 * @public
 */
export class TableDataChangeEvent extends BeEvent<TableDataChangesListener> { }

/**
 * TableDataProvider provides data to the Table.
 * It also provides support for data Sorting & Filtering.
 * @public
 */
export interface TableDataProvider {
  /** Event emitted by the data provider when column data changes */
  onColumnsChanged: TableDataChangeEvent;
  /** Event emitted by the data provider when row data changes */
  onRowsChanged: TableDataChangeEvent;

  /** Retrieves the column descriptions */
  getColumns(): Promise<ColumnDescription[]>;
  /** Retrieves the row count */
  getRowsCount(): Promise<number>;
  /** Retrieves a specific row by index */
  getRow(rowIndex: number, unfiltered?: boolean): Promise<RowItem>;

  /** Sorts the rows based on the value in a specific column */
  sort(columnIndex: number, sortDirection: SortDirection): Promise<void>;

  // Column Filtering methods

  /** Apply a filter descriptor collection
   */
  applyFilterDescriptors?: (filterDescriptors: CompositeFilterDescriptorCollection) => Promise<void>;

  /** Gets distinct values in a column
   */
  getDistinctValues?: (columnKey: string, maximumValueCount?: number) => Promise<DistinctValueCollection>;

  /** Gets property display value expression
   * @alpha
   */
  getPropertyDisplayValueExpression?: (property: string) => string;
}

/**
 * MutableTableDataProvider provides mutation methods for data in the Table.
 * Useful for Drag & Drop processing.
 * @public
 */
export interface MutableTableDataProvider extends TableDataProvider {
  /** Adds a row to the end */
  addRow(rowItem: RowItem): number;
  /** Inserts a row at a given row index */
  insertRow(rowItem: RowItem, index: number): number;
  /** Deletes a row */
  deleteRow(rowItem: RowItem): void;
  /** Moves a row to a new row index */
  moveRow(rowItem: RowItem, newIndex: number): number;
}
