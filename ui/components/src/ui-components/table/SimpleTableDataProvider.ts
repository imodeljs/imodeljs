/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import { Primitives, PropertyRecord, PropertyValueFormat, UiError } from "@bentley/ui-abstract";
import { SortDirection } from "@bentley/ui-core";
import { TypeConverterManager } from "../converters/TypeConverterManager";
import { UiComponents } from "../UiComponents";
import { CompositeFilterDescriptorCollection, DistinctValueCollection, TableDistinctValue } from "./columnfiltering/ColumnFiltering";
import { ColumnDescription, MutableTableDataProvider, RowItem, TableDataChangeEvent } from "./TableDataProvider";

// cSpell:ignore columnfiltering

/**
 * A Table Data Provider using an array of items.
 * @public
 */
export class SimpleTableDataProvider implements MutableTableDataProvider {
  private _items: RowItem[];
  private _rowItemIndices: number[];     // Used for both filtering and sorting
  private _columns: ColumnDescription[];
  private _secondarySortColumnStack?: number[];
  private _sortDirection: SortDirection = SortDirection.NoSort;
  private _sortColumnIndex: number = -1;
  private _filterDescriptors?: CompositeFilterDescriptorCollection;

  /** Event emitted by the data provider when column data changes */
  public onColumnsChanged = new TableDataChangeEvent();
  /** Event emitted by the data provider when row data changes */
  public onRowsChanged = new TableDataChangeEvent();

  constructor(columns: ColumnDescription[]) {
    this._columns = columns;
    this._items = [];
    this._rowItemIndices = [];
    this._secondarySortColumnStack = [];
  }

  /** Sets the row items based on an array */
  public setItems(items: RowItem[]): void {
    this._items = items;
    this._rowItemIndices = [];
    this.resetRowIndices();
    this.onRowsChanged.raiseEvent();
  }

  private resetRowIndices(): void {
    this._rowItemIndices.splice(0);

    for (let rowIndex = 0; rowIndex < this._items.length; rowIndex++) {
      this._rowItemIndices.push(rowIndex);
    }
  }

  /** Retrieves the column descriptions */
  public async getColumns(): Promise<ColumnDescription[]> {
    return this._columns;
  }

  /** Retrieves the row count */
  public async getRowsCount(): Promise<number> {
    return this._rowItemIndices.length;
  }

  /** Retrieves a specific row by index */
  public async getRow(rowIndex: number, unfiltered?: boolean): Promise<RowItem> {
    let realRowIndex: number = -1;

    if (unfiltered) {
      // istanbul ignore else
      if (0 <= rowIndex && rowIndex < this._items.length)
        realRowIndex = rowIndex;
    } else {
      if (0 <= rowIndex && rowIndex < this._rowItemIndices.length)
        realRowIndex = this.getRowIndexFromFilteredRowIndex(rowIndex);
    }

    if (0 <= realRowIndex && realRowIndex < this._items.length)
      return this._items[realRowIndex];

    throw new UiError(UiComponents.loggerCategory(this), `getRow: Invalid row index - ${rowIndex}`);
  }

  private getRowIndexFromFilteredRowIndex(filteredRowIndex: number): number {
    // istanbul ignore next
    if (filteredRowIndex === undefined)
      return filteredRowIndex;

    // istanbul ignore next
    if (filteredRowIndex < 0 || filteredRowIndex >= this._rowItemIndices.length)
      return -1;

    return this._rowItemIndices[filteredRowIndex];
  }

  /** Sorts the rows based on the value in a specific column */
  public async sort(columnIndex: number, sortDirection: SortDirection): Promise<void> {
    // istanbul ignore next
    if (columnIndex < 0 || columnIndex >= this._columns.length)
      return;

    this._sortColumnIndex = columnIndex;
    this._sortDirection = sortDirection;

    if (sortDirection === SortDirection.NoSort) {
      if (this._filterDescriptors)
        await this.applyFilterDescriptors(this._filterDescriptors);
      else
        this.resetRowIndices();
      return;
    }

    this._secondarySortColumnStack = [];
    this._secondarySortColumnStack.push(columnIndex);

    // Sort by the column
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const dataProvider = this;
    this._rowItemIndices.sort((a: number, b: number) => {
      return dataProvider.sortDispatcher(dataProvider._items[a], dataProvider._items[b], columnIndex, sortDirection);
    });

    delete this._secondarySortColumnStack;

    return;
  }

  private sortDispatcher(a: RowItem, b: RowItem, columnIndex: number, sortDirection: SortDirection): number {
    let result = this.sortRows(a, b, columnIndex, sortDirection);

    if (result !== 0)
      return result;

    // Secondary sort column support
    // istanbul ignore else
    const column = this._columns[columnIndex];
    if (this._secondarySortColumnStack !== undefined &&
      column.secondarySortColumn !== undefined &&
      column.secondarySortColumn !== columnIndex &&
      this._secondarySortColumnStack.indexOf(column.secondarySortColumn) < 0) {

      this._secondarySortColumnStack.push(column.secondarySortColumn);
      result = this.sortDispatcher(a, b, column.secondarySortColumn, sortDirection);
      this._secondarySortColumnStack.pop();
    }

    return result;
  }

  private getPrimitiveValue(record: PropertyRecord) {
    let primitiveValue: Primitives.Value | undefined;
    const recordValue = record.value;
    // istanbul ignore else
    if (recordValue.valueFormat === PropertyValueFormat.Primitive)
      primitiveValue = recordValue.value;
    return primitiveValue;
  }

  private sortRows(a: RowItem, b: RowItem, columnIndex: number, sortDirection: SortDirection): number {
    const aCell = a.cells[columnIndex];
    const bCell = b.cells[columnIndex];

    let result: number = 0;
    const column = this._columns[columnIndex];

    const propertyDescription = column.propertyDescription;
    const valueA = this.getPrimitiveValue(aCell.record as PropertyRecord);
    const valueB = this.getPrimitiveValue(bCell.record as PropertyRecord);
    // istanbul ignore else
    if (valueA !== undefined && valueB !== undefined && propertyDescription)
      result = TypeConverterManager.getConverter(propertyDescription.typename, propertyDescription.converter?.name).sortCompare(valueA, valueB, column.sortIgnoreCase);

    if (sortDirection === SortDirection.Descending)
      result *= -1;

    return result;
  }

  /** Gets distinct values in a column
   * @beta
   */
  public async getDistinctValues(columnKey: string, maximumValueCount?: number): Promise<DistinctValueCollection> {
    const distinctValues = new DistinctValueCollection();
    const columnIndex = this._columns.findIndex((description: ColumnDescription) => description.key === columnKey);
    if (columnIndex < 0 || columnIndex >= this._columns.length)
      return distinctValues;

    const columnDescription = this._columns[columnIndex];
    const propertyDescription = columnDescription.propertyDescription;
    const uniqueKeysMap: { [key: string]: TableDistinctValue } = {};
    const uniqueValues: any[] = [];

    // istanbul ignore next
    if (!propertyDescription)
      return distinctValues;

    for (const row of this._items) {
      const cell = row.cells[columnIndex];
      const record = cell.record;

      // istanbul ignore next
      if (record === undefined)
        continue;

      const value = this.getPrimitiveValue(record);
      const displayValue = await TypeConverterManager
        .getConverter(propertyDescription.typename, propertyDescription.converter?.name)
        .convertPropertyToString(propertyDescription, value);

      // istanbul ignore next
      if (value === undefined || typeof displayValue !== "string")
        continue;

      const valueKey = value.toString();
      if (!uniqueKeysMap.hasOwnProperty(valueKey)) {
        const propertyValue: TableDistinctValue = { value, label: displayValue };

        uniqueKeysMap[valueKey] = propertyValue;
        uniqueValues.push(propertyValue);
      }
    }

    distinctValues.values = uniqueValues;

    distinctValues.values.sort((a: TableDistinctValue, b: TableDistinctValue) => {
      if (a.value && b.value)
        return TypeConverterManager.getConverter(propertyDescription.typename, propertyDescription.converter?.name).sortCompare(a.value, b.value);
      return 0;
    });

    if (maximumValueCount !== undefined && distinctValues.values.length > maximumValueCount)
      distinctValues.values.splice(maximumValueCount);

    return distinctValues;
  }

  /** Apply a filter descriptor collection
   * @beta
   */
  public async applyFilterDescriptors(filterDescriptors: CompositeFilterDescriptorCollection): Promise<void> {
    this._filterDescriptors = filterDescriptors;

    this._rowItemIndices.splice(0);

    this._items.forEach((row: RowItem, i: number) => {
      if (filterDescriptors.evaluateRow(row))
        this._rowItemIndices.push(i);
    });

    if (this._sortDirection !== SortDirection.NoSort) {
      await this.sort(this._sortColumnIndex, this._sortDirection);
    }
  }

  /** Adds a row to the end */
  public addRow(rowItem: RowItem): number {
    return this.insertRow(rowItem, -1);
  }

  /** Inserts a row at a given row index */
  public insertRow(rowItem: RowItem, index: number): number {
    let newIdx = index;

    if (index < 0 || index >= this._items.length)
      newIdx = this._items.push(rowItem) - 1;
    else
      this._items.splice(newIdx, 0, rowItem);

    this.resetRowIndices();
    this.onRowsChanged.raiseEvent();

    return newIdx;
  }

  /** Deletes a row */
  public deleteRow(rowItem: RowItem, raiseRowsChangedEvent: boolean = true): void {
    const rowIndex = this.findRowIndex(rowItem);
    if (rowIndex >= 0) {
      this._items.splice(rowIndex, 1);

      this.resetRowIndices();

      if (raiseRowsChangedEvent)
        this.onRowsChanged.raiseEvent();
    }
  }

  /** Moves a row to a new row index */
  public moveRow(rowItem: RowItem, newIndex: number): number {
    const oldIndex = this.findRowIndex(rowItem);
    if (oldIndex >= 0) {
      this.deleteRow(rowItem, false);

      if (newIndex > oldIndex)
        newIndex--;     // removing the row will shrink the count by 1

      return this.insertRow(rowItem, newIndex);
    }

    return -1;
  }

  private findRowIndex(item: RowItem): number {
    for (let i = 0; i < this._items.length; i++) {
      if (item === this._items[i])
        return i;
    }
    return -1;
  }
}
