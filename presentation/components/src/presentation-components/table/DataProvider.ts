/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import { sort } from "fast-sort";
import memoize from "micro-memoize";
import { assert } from "@bentley/bentleyjs-core";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import {
  Content, DefaultContentDisplayTypes, Descriptor, DescriptorOverrides, Field, FieldDescriptorType, InstanceKey, Item, NestedContentValue,
  PresentationError, PresentationStatus, ProcessFieldHierarchiesProps, RelationshipMeaning, Ruleset, SortDirection, StartItemProps,
  traverseContentItem, Value, ValuesDictionary,
} from "@bentley/presentation-common";
import { CellItem, ColumnDescription, TableDataProvider as ITableDataProvider, RowItem, TableDataChangeEvent } from "@bentley/ui-components";
import { HorizontalAlignment, SortDirection as UiSortDirection } from "@bentley/ui-core";
import { FieldHierarchyRecord, PropertyRecordsBuilder } from "../common/ContentBuilder";
import { CacheInvalidationProps, ContentDataProvider, IContentDataProvider } from "../common/ContentDataProvider";
import { DiagnosticsProps } from "../common/Diagnostics";
import { Page, PageContainer } from "../common/PageContainer";
import { createLabelRecord, translate } from "../common/Utils";

interface PromisedPage<TItem> extends Page<TItem> {
  promise?: Promise<void>;
}

/**
 * The default number of rows in a single page requested by [[PresentationTableDataProvider]]
 * @public
 */
export const TABLE_DATA_PROVIDER_DEFAULT_PAGE_SIZE = 20;

/**
 * The default number of pages cached by [[PresentationTableDataProvider]]
 * @public
 */
export const TABLE_DATA_PROVIDER_DEFAULT_CACHED_PAGES_COUNT = 5;

/**
 * Interface for presentation rules-driven table data provider.
 * @public
 */
export type IPresentationTableDataProvider = ITableDataProvider & IContentDataProvider & {
  /** Get key of ECInstance that's represented by the supplied row */
  getRowKey: (row: RowItem) => InstanceKey;
};

/**
 * Initialization properties for [[PresentationTableDataProvider]]
 * @public
 */
export interface PresentationTableDataProviderProps extends DiagnosticsProps {
  /** IModel to pull data from */
  imodel: IModelConnection;

  /** Ruleset or it's ID to be used for creating the content */
  ruleset: string | Ruleset;

  /** Number of rows in a single page requested from the backend. Defaults to [[TABLE_DATA_PROVIDER_DEFAULT_PAGE_SIZE]] */
  pageSize?: number;

  /** Number of pages cached in the data provider. Defaults to [[TABLE_DATA_PROVIDER_DEFAULT_CACHED_PAGES_COUNT]] */
  cachedPagesCount?: number;

  /** Display type to use when requesting data from the backend. Defaults to [[DefaultContentDisplayTypes.Grid]] */
  displayType?: string;

  /**
   * Auto-update table content when ruleset, ruleset variables or data in the iModel changes.
   * @alpha
   */
  enableContentAutoUpdate?: boolean;
}

/**
 * Presentation Rules-driven table data provider.
 * @public
 */
export class PresentationTableDataProvider extends ContentDataProvider implements IPresentationTableDataProvider {
  private _sortColumnKey: string | undefined;
  private _sortDirection = UiSortDirection.NoSort;
  private _filterExpression: string | undefined;
  private _pages: PageContainer<RowItem, PromisedPage<RowItem>>;
  public onColumnsChanged = new TableDataChangeEvent();
  public onRowsChanged = new TableDataChangeEvent();

  /** Constructor. */
  constructor(props: PresentationTableDataProviderProps) {
    super({
      imodel: props.imodel,
      ruleset: props.ruleset,
      displayType: props.displayType || DefaultContentDisplayTypes.Grid,
      pagingSize: props.pageSize || TABLE_DATA_PROVIDER_DEFAULT_PAGE_SIZE,
      enableContentAutoUpdate: props.enableContentAutoUpdate,
      ruleDiagnostics: props.ruleDiagnostics,
      devDiagnostics: props.devDiagnostics,
    });
    this._pages = new PageContainer(props.pageSize || TABLE_DATA_PROVIDER_DEFAULT_PAGE_SIZE,
      props.cachedPagesCount || TABLE_DATA_PROVIDER_DEFAULT_CACHED_PAGES_COUNT);
  }

  /** Get key of ECInstance that's represented by the supplied row */
  public getRowKey(row: RowItem): InstanceKey {
    return InstanceKey.fromJSON(JSON.parse(row.key));
  }

  /**
   * `ECExpression` for filtering data in the table.
   */
  public get filterExpression(): string | undefined { return this._filterExpression; }
  public set filterExpression(value: string | undefined) {
    if (this._filterExpression === value)
      return;
    this._filterExpression = value;
    this.invalidateCache({ descriptorConfiguration: true, size: true, content: true });
  }

  /**
   * Get the column which is used for sorting data in the table.
   */
  public get sortColumn(): Promise<ColumnDescription | undefined> {
    return (async () => {
      if (!this._sortColumnKey)
        return undefined;
      const columns = await this.getColumns();
      return columns.find((col) => (col.key === this._sortColumnKey));
    })();
  }

  /**
   * Get key of the column which is used for sorting data in the table.
   */
  public get sortColumnKey() { return this._sortColumnKey; }

  /**
   * Get sort direction. Defaults to `SortDirection.NoSort` which means
   * undefined sorting.
   */
  public get sortDirection() { return this._sortDirection; }

  /**
   * Sorts the data in this data provider.
   * @param columnIndex Index of the column to sort on.
   * @param sortDirection Sorting direction.
   */
  public async sort(columnIndex: number, sortDirection: UiSortDirection): Promise<void> {
    const columns = await this.getColumns();
    const sortingColumn = columns[columnIndex];
    if (!sortingColumn)
      throw new PresentationError(PresentationStatus.InvalidArgument, "Invalid column index");
    this._sortColumnKey = sortingColumn.key;
    this._sortDirection = sortDirection;
    this.invalidateCache({ descriptorConfiguration: true, content: true });
  }

  protected override invalidateCache(props: CacheInvalidationProps): void {
    super.invalidateCache(props);

    if (props.descriptor) {
      this._filterExpression = undefined;
      this._sortColumnKey = undefined;
      this._sortDirection = UiSortDirection.NoSort;
    }

    if (props.descriptor || props.descriptorConfiguration) {
      if (this.getColumns) {
        this.getColumns.cache.keys.length = 0;
        this.getColumns.cache.values.length = 0;
      }
      if (this.onColumnsChanged)
        this.onColumnsChanged.raiseEvent();
    }

    if (props.size || props.content) {
      if (this._pages)
        this._pages.invalidatePages();
      if (this.onRowsChanged)
        this.onRowsChanged.raiseEvent();
    }
  }

  /**
   * Tells the data provider to _not_ request descriptor and instead configure
   * content using `getDescriptorOverrides()` call
   */
  protected override shouldConfigureContentDescriptor(): boolean { return false; }

  /**
   * Provides content configuration for the property grid
   */
  protected override getDescriptorOverrides(): DescriptorOverrides {
    const overrides = super.getDescriptorOverrides();
    if (this._sortColumnKey && this._sortDirection !== UiSortDirection.NoSort) {
      overrides.sorting = {
        field: { type: FieldDescriptorType.Name, fieldName: this._sortColumnKey },
        direction: (this._sortDirection === UiSortDirection.Descending) ? SortDirection.Descending : SortDirection.Ascending,
      };
    }
    if (this._filterExpression)
      overrides.filterExpression = this._filterExpression;
    return overrides;
  }

  /**
   * Returns column definitions.
   */
  public getColumns = memoize(async (): Promise<ColumnDescription[]> => {
    const descriptor = await this.getContentDescriptor();
    return createColumns(descriptor);
  });

  /**
   * Get the total number of rows.
   */
  public async getRowsCount() {
    return this.getContentSetSize();
  }

  /**
   * Get a single row.
   * @param rowIndex Index of the row to return.
   */
  public async getRow(rowIndex: number): Promise<RowItem> {
    let page = this._pages.getPage(rowIndex);
    if (!page) {
      page = this._pages.reservePage(rowIndex);
      page.promise = this.getContent({
        start: page.position.start,
        size: page.position.end - page.position.start + 1,
      }).then((c: Content | undefined) => {
        page!.items = createRows(c);
      }).catch((e) => {
        throw e;
      });
    }
    await page.promise;
    return page.items![rowIndex - page.position.start];
  }

  /**
   * Try to get a loaded row. Returns undefined if the row is not currently loaded.
   * @param rowIndex Index of the row to return.
   */
  public getLoadedRow(rowIndex: number): Readonly<RowItem> | undefined {
    return this._pages.getItem(rowIndex);
  }
}

const DISPLAY_LABEL_COLUMN_KEY = "/DisplayLabel/";

const createColumns = (descriptor: Readonly<Descriptor> | undefined): ColumnDescription[] => {
  if (!descriptor)
    return [];

  if (descriptor.displayType === DefaultContentDisplayTypes.List)
    return [createLabelColumn()];

  // Return array of ColumnDescriptions created from fields which are sorted and with extracted SameInstanceFields
  return getFieldsWithExtractedSameInstanceFields(
    sort(descriptor.fields).by([
      { desc: (f) => f.priority },
      { asc: (f) => f.label },
    ])
  ).map((f) => createColumn(f));
};

const getFieldsWithExtractedSameInstanceFields = (fields: Field[]) => {
  const updatedFields: Field[] = fields.map((f) => f.clone());
  for (let i = 0; i < updatedFields.length; i++) {
    const field = updatedFields[i];
    if (field.isNestedContentField() && field.relationshipMeaning === RelationshipMeaning.SameInstance) {
      const nestedFields = field.nestedFields.map((nestedField: Field): Field => {
        nestedField.resetParentship();
        return nestedField;
      });

      const updatedChildFields = getFieldsWithExtractedSameInstanceFields(nestedFields);
      updatedFields.splice(i, 1, ...updatedChildFields);

      // Skip inserted fields
      i += updatedChildFields.length - 1;
    }
  }
  return updatedFields;
};

const getFieldsWithExtractedSameInstanceFieldsAndCreateMap = (fields: Field[]) => {
  let firstExtractedFieldNameToNestedFieldMap: { [fieldName: string]: Field } = {};
  const updatedFields: Field[] = fields.map((f) => f.clone());

  for (let i = 0; i < updatedFields.length; i++) {
    const field = updatedFields[i];
    if (field.isNestedContentField() && field.relationshipMeaning === RelationshipMeaning.SameInstance) {
      // Reset parentship for nestedFields, so ContentBuilder.createPropertyRecord() wouldn't create an array record
      const nestedFields = field.nestedFields.map((nestedField: Field): Field => {
        nestedField.resetParentship();
        return nestedField;
      });
      const { firstExtractedFieldNameToNestedFieldMap: childFirstExtractedFieldToNestedFieldMap, updatedFields: childUpdatedFields } = getFieldsWithExtractedSameInstanceFieldsAndCreateMap(nestedFields);
      const deletedField = updatedFields.splice(i, 1, ...childUpdatedFields)[0];

      // Map the first extracted field name to a nestedField from which the field was extracted and merge it with the map found in child fields.
      firstExtractedFieldNameToNestedFieldMap = {
        ...firstExtractedFieldNameToNestedFieldMap,
        ...childFirstExtractedFieldToNestedFieldMap,
        [field.nestedFields[0].name]: deletedField,
      };

      // Skip inserted fields
      i += childUpdatedFields.length - 1;
    }
  }
  return { firstExtractedFieldNameToNestedFieldMap, updatedFields };
};

const extractValues = (values: ValuesDictionary<Value>, sameInstanceNestedFieldNames: string[]) => {
  // Map representing how many fields were merged in order to create a field specified by fieldName.
  const mergedFieldsCounts: { [fieldName: string]: number } = {};
  const updatedValues: ValuesDictionary<Value> = { ...values };
  for (const fieldName of sameInstanceNestedFieldNames) {
    const value = values[fieldName];
    if (!Value.isNestedContent(value))
      continue;

    extractNestedContentValue(updatedValues, value, mergedFieldsCounts, sameInstanceNestedFieldNames);

    delete updatedValues[fieldName];
  }
  return { mergedFieldsCounts, updatedValues };
};

const extractNestedContentValue = (values: ValuesDictionary<Value>, nestedContentValues: NestedContentValue[], mergedFieldsCounts: { [field: string]: number }, sameInstanceNestedFieldNames: string[]) => {
  // If nestedContentValue has only one value item, then all the values within the item will be extracted.
  if (nestedContentValues.length === 1) {
    /* Get value map from the only item. */
    const nestedContentValueMap = nestedContentValues[0].values;
    // eslint-disable-next-line guard-for-in
    for (const valueMapKey in nestedContentValueMap) {
      const childValue = nestedContentValueMap[valueMapKey];
      // Check if child value in nested item itself is nested, if it is, try extracting values from it too,
      // if not, then finish extracting values.
      if (Value.isNestedContent(childValue) && sameInstanceNestedFieldNames.includes(valueMapKey))
        extractNestedContentValue(values, childValue, mergedFieldsCounts, sameInstanceNestedFieldNames);
      else
        values[valueMapKey] = nestedContentValueMap[valueMapKey];
    }
  }
  // If nestedContentValue has more than one value item, then cells that should have values from extracted item will be merged
  // while leaving a link that opens a dialog item containing all the values in nestedContentValue.
  if (nestedContentValues.length > 1) {
    const keys = Object.keys(nestedContentValues[0].values);
    const valueMapKey = keys[0];
    // Set the nestedContentValue to be on the first cell that should contain extracted values.
    values[valueMapKey] = nestedContentValues;
    // Save information that describes how many cells will have to be merged in order to create this cell.
    // Using this information, width of the merged cell will be calculated.
    mergedFieldsCounts[valueMapKey] = keys.length;
  }
};

const createColumn = (field: Readonly<Field>): ColumnDescription => {
  return {
    key: field.name,
    label: field.label,
    sortable: true,
    editable: !field.isReadonly,
    filterable: false,
    // note: disable column filtering until this data provider supports filtering
    // filterable: (field.type.valueFormat === PropertyValueFormat.Primitive),
  };
};

const createLabelColumn = (): ColumnDescription => {
  return {
    key: DISPLAY_LABEL_COLUMN_KEY,
    label: translate("general.display-label"),
    sortable: true,
    editable: false,
    filterable: false,
  };
};

const createRows = (c: Readonly<Content> | undefined): RowItem[] => {
  if (!c)
    return [];
  const { firstExtractedFieldNameToNestedFieldMap: sameInstanceFieldsMap, updatedFields } = getFieldsWithExtractedSameInstanceFieldsAndCreateMap(c.descriptor.fields);
  return c.contentSet.map((item) => createRow(c.descriptor, item, sameInstanceFieldsMap, updatedFields));
};

const createRow = (descriptor: Readonly<Descriptor>, item: Readonly<Item>, sameInstanceFieldsMap: { [fieldName: string]: Field }, updatedFields: Field[]): RowItem => {
  if (item.primaryKeys.length !== 1) {
    // note: for table view we expect the record to always have only 1 primary key
    throw new PresentationError(PresentationStatus.InvalidArgument, "item.primaryKeys");
  }
  const { mergedFieldsCounts: mergedCellsCounts, updatedValues } = extractValues(item.values, Object.values(sameInstanceFieldsMap).map((field) => (field.name)));
  const updatedItem = new Item(item.primaryKeys, item.label, item.imageId, item.classInfo, updatedValues, item.displayValues, item.mergedFieldNames, item.extendedData);

  const key = JSON.stringify(item.primaryKeys[0]);
  if (descriptor.displayType === DefaultContentDisplayTypes.List) {
    return {
      key,
      cells: [{
        key: DISPLAY_LABEL_COLUMN_KEY,
        record: createLabelRecord(item.label, "content_item_label"),
      }],
    };
  }

  const builder = new CellsBuilder(mergedCellsCounts, sameInstanceFieldsMap);
  traverseContentItem(builder, { ...descriptor, fields: updatedFields }, updatedItem);
  return { key, cells: builder.cells };
};

class CellsBuilder extends PropertyRecordsBuilder {
  private _cells?: CellItem[];

  public constructor(
    private _mergedCellCounts: { [fieldName: string]: number },
    private _sameInstanceFields: { [fieldName: string]: Field },
  ) {
    super();
  }

  public get cells(): CellItem[] {
    assert(this._cells !== undefined);
    return this._cells;
  }

  public override processFieldHierarchies(props: ProcessFieldHierarchiesProps): void {
    props.hierarchies.forEach((hierarchy) => {
      const mergedCellsCount = this._mergedCellCounts[hierarchy.field.name];
      if (mergedCellsCount) {
        // if the field wants to be merged with subsequent fields, instead of rendering value of
        // the field itself, we want to render the NestedContentField that this field originated from,
        // but keep the name as-is, because columns are being created using original hierarchy.
        const expandedNestedContentField = this._sameInstanceFields[hierarchy.field.name];
        expandedNestedContentField.name = hierarchy.field.name;
        hierarchy.field = expandedNestedContentField;
      }
    });
  }

  protected createRootPropertiesAppender() {
    return {
      append: (record: FieldHierarchyRecord) => {
        assert(this._cells !== undefined);
        const itemProps: Partial<CellItem> = {};
        const mergedCellsCount = this._mergedCellCounts[record.fieldHierarchy.field.name];
        if (mergedCellsCount) {
          itemProps.mergedCellsCount = mergedCellsCount;
          itemProps.alignment = HorizontalAlignment.Center;
        }
        this._cells.push({
          key: record.fieldHierarchy.field.name,
          record: record.record,
          ...itemProps,
        });
      },
    };
  }

  public override startItem(props: StartItemProps): boolean {
    this._cells = [];
    return super.startItem(props);
  }
}
