/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Table
 */

import { Primitives } from "@bentley/ui-abstract";
import { RowItem } from "../TableDataProvider";

/** Operator used in FilterDescriptor
 * @public
 */
export enum FilterOperator {
  // All filterable types
  IsEqualTo,
  IsNotEqualTo,

  // Numeric types, Date, all types that implement these methods
  IsLessThan,
  IsLessThanOrEqualTo,
  IsGreaterThan,
  IsGreaterThanOrEqualTo,
  Range,

  // Strings
  StartsWith,
  EndsWith,
  Contains,
  DoesNotContain,
  IsContainedIn,
  IsNotContainedIn,
  IsEmpty,
  IsNotEmpty,

  // All filterable null-able types
  IsNull,
  IsNotNull,
}

/** Logical operator used for filter descriptor composition
 * @public
 */
export enum FilterCompositionLogicalOperator {
  And,
  Or,
}

/** FilterableTable contains the properties and methods provided by a filterable Table.
 * @public
 */
export interface FilterableTable {
  /** Gets the filter descriptors for the table. */
  filterDescriptors: CompositeFilterDescriptorCollection;

  /** Gets ECExpression to get property display value. */
  getPropertyDisplayValueExpression(property: string): string;
}

/** Represents a column that is filterable.
 * @public
 */
export interface FilterableColumn {
  /** Gets the owning Table for this column. */
  filterableTable: FilterableTable;

  /** Gets the filter descriptor. */
  columnFilterDescriptor: ColumnFilterDescriptor;

  /** Gets the member (key). */
  filterMemberKey: string;

  /** Gets the member type. */
  filterMemberType: string;

  /** Determines if the filter for this column is active. */
  isFilterActive: boolean;

  /** Determines if the filter should show distinct values as a filter option */
  showDistinctValueFilters: boolean;

  /** Determines if the filter should show field filter options */
  showFieldFilters: boolean;

  /** Determines if the filter is case-sensitive */
  filterCaseSensitive: boolean;

  /** Allows the column to create a filter descriptor for use in the filter descriptor collection. */
  createSimpleFilterDescriptor(value: any, filterOperator: FilterOperator): OperatorValueFilterDescriptor;

  /** Gets the distinct values within the columns in the table. */
  getDistinctValues(maximumValueCount?: number): Promise<DistinctValueCollection>;
}

/** A filtering abstraction that knows how to create predicate filtering expression.
 * @public
 */
export interface FilterDescriptor {
  /** Gets a value indicating whether this filter is active. */
  isActive: boolean;

  /** Clears the filter descriptor and sets it to inactive. */
  clear(): void;

  /** Evaluates a row for filtering. */
  evaluateRow(row: RowItem): boolean;

  /** Determines if this filter is for a particular column. */
  isFilterForColumn(columnKey: string): boolean;

  /** Returns filter as ECExpression.
   * @alpha */
  getFilterExpression(): string;
}

/** An abstraction for all filter descriptors that have an operator and a value
 * @public
 */
export interface OperatorValueFilterDescriptor extends FilterDescriptor {
  /** Gets the operator for the filter. */
  operator: FilterOperator;

  /** Gets the value for the filter. */
  value: any;

  /** Gets the member (key). */
  memberKey: string;

  /** Gets the member type. */
  memberType: string;

  /** Determines if the filtering is case sensitive. */
  isCaseSensitive: boolean;
}

/** Represents the distinct filter descriptor of a column filter descriptor.
 * @public
 */
export interface DistinctValuesFilterDescriptor extends FilterDescriptor {
  /** Gets the distinct values. */
  distinctValues: DistinctValueCollection;

  /** Gets the filter descriptors. */
  filterDescriptorCollection: OperatorValueFilterDescriptorCollection;

  /** Tries to find descriptor. */
  tryFindDescriptor(distinctValue: any): FilterDescriptor | undefined;

  /** Adds the distinct value. */
  addDistinctValue(distinctValue: any): void;

  /** Removes the distinct value. */
  removeDistinctValue(distinctValue: any): boolean;

  /** Gets or sets the FilterOperator used for comparing actual data values with checked distinct values.
   * The default is FilterOperator.IsEqualTo.
   */
  distinctValuesComparisonOperator: FilterOperator;
}

/** Represents the field filter descriptor of a column filter descriptor.
 * @public
 */
export interface FieldFilterDescriptor extends FilterDescriptor {

  /** Gets the filter descriptors. */
  filterDescriptorCollection: OperatorValueFilterDescriptorCollection;

  /** Tries to find descriptor. */
  tryFindDescriptor(fieldValue: any, operator: FilterOperator): FilterDescriptor | undefined;

  /** Adds the field value. */
  addFieldValue(fieldValue: any, operator: FilterOperator, isCaseSensitive?: boolean): void;

  /** Removes the field value. */
  removeFieldValue(fieldValue: any, operator: FilterOperator): boolean;

  /** Gets or sets the logical operator. */
  logicalOperator: FilterCompositionLogicalOperator;
}

/** Represents a column filter descriptor associated with a specific column.
 * @public
 */
export interface ColumnFilterDescriptor extends FilterDescriptor {
  /** Gets the Distinct Values filter descriptor. */
  distinctFilter: DistinctValuesFilterDescriptor;

  /** Gets the Field filter descriptor. */
  fieldFilter: FieldFilterDescriptor;
}

/** Distinct Value for Table filtering purposes
 * @public
 */
export interface TableDistinctValue {
  value: Primitives.Value;
  label: string;
}

/** A set of distinct values for a column.
 * @public
 */
export class DistinctValueCollection {
  private _values: TableDistinctValue[];

  constructor() {
    this._values = new Array<TableDistinctValue>();
  }

  public get values() { return this._values; }
  public set values(values: TableDistinctValue[]) { this._values = values; }
}

/** Represents a composite filtering abstraction which has a collection of
 * filter descriptors combined together by a logical operator.
 * @public
 */
export interface CompositeFilterDescriptor extends FilterDescriptor {
  /** Gets or sets the logical operator. */
  logicalOperator: FilterCompositionLogicalOperator;

  /** Gets filter descriptors that will be used for composition. */
  filterDescriptorCollection: FilterDescriptorCollection;
}

/** Collection of FilterDescriptor objects composed together by a logical operator.
 * @public
 */
export interface CompositeFilterDescriptorCollection {
  /** Gets the number of filter descriptors in the collection */
  count: number;

  /** Gets and sets the logical operator. */
  logicalOperator: FilterCompositionLogicalOperator;

  /** Evaluates a row for filtering */
  evaluateRow(row: RowItem): boolean;

  /** Determines if a filter is active for a particular column */
  isColumnFilterActive(columnKey: string): boolean;

  /** Gets the filter for a particular column */
  getColumnFilterDescriptor(columnKey: string): ColumnFilterDescriptor | undefined;

  /** Adds a filter descriptor to the collection */
  add(item: FilterDescriptor): void;

  /** Clears the filter descriptor. */
  clear(): void;

  /** Returns filter as ECExpression.
   * @alpha */
  getFilterExpression(): string;
}

/** Collection of filter descriptors.
 * @public
 */
export abstract class FilterDescriptorCollectionBase<TDescriptor extends FilterDescriptor> {
  private _descriptors: TDescriptor[];

  constructor() {
    this._descriptors = new Array<TDescriptor>();
  }

  public get descriptors() { return this._descriptors; }

  /** Adds an FilterDescriptor to the collection.
   * @param item  The FilterDescriptor to add.
   */
  public add(item: TDescriptor): void {
    this.descriptors.push(item);
  }

  /** Removes a particular FilterDescriptor from the collection.
   * @param item  The FilterDescriptor to remove.
   */
  public remove(item: TDescriptor): boolean {
    const index = this.descriptors.indexOf(item);
    if (index >= 0) {
      this.descriptors.splice(index, 1);
      return true;
    }
    return false;
  }

  /** Clears the collection.
   */
  public clear(): void {
    this.descriptors.splice(0);
  }

  /** Determines if the collection is active.
   */
  public get isActive(): boolean {
    return this.descriptors.some((fd: TDescriptor) => fd.isActive);
  }

  /** Gets the count of items in the collection.
   */
  public get count(): number {
    return this.descriptors.length;
  }
}

/** Collection of filter descriptors.
 * @public
 */
export class FilterDescriptorCollection extends FilterDescriptorCollectionBase<FilterDescriptor> {
}

/** Collection of OperatorValue filter descriptors.
 * @public
 */
export class OperatorValueFilterDescriptorCollection extends FilterDescriptorCollectionBase<OperatorValueFilterDescriptor> {
}
