/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import "./Table.scss";
import "../columnfiltering/ColumnFiltering.scss";
import classnamesDedupe from "classnames/dedupe";
import classnames from "classnames";
import { memoize } from "lodash";
import * as React from "react";
import { DisposableList, Guid, GuidString } from "@bentley/bentleyjs-core";
import { PropertyValueFormat } from "@bentley/ui-abstract";
import {
  CommonProps, Dialog, ElementResizeObserver, isNavigationKey, ItemKeyboardNavigator, LocalSettingsStorage,
  Orientation, SortDirection, UiSettings, UiSettingsStatus, UiSettingsStorage,
} from "@bentley/ui-core";
import {
  MultiSelectionHandler, OnItemsDeselectedCallback, OnItemsSelectedCallback, SelectionHandler, SingleSelectionHandler,
} from "../../common/selection/SelectionHandler";
import { SelectionMode } from "../../common/selection/SelectionModes";
import { ShowHideMenu } from "../../common/showhide/ShowHideMenu";
import { TypeConverterManager } from "../../converters/TypeConverterManager";
import { PropertyUpdatedArgs } from "../../editors/EditorContainer";
import { TableRowStyleProvider } from "../../properties/ItemStyle";
import { PropertyDialogState, PropertyValueRendererManager } from "../../properties/ValueRendererManager";
import { CompositeFilterDescriptorCollection, FilterCompositionLogicalOperator } from "../columnfiltering/ColumnFiltering";
import { MultiSelectFilter } from "../columnfiltering/data-grid-addons/MultiSelectFilter";
import { MultiValueFilter } from "../columnfiltering/multi-value-filter/MultiValueFilter";
import { NumericFilter } from "../columnfiltering/data-grid-addons/NumericFilter";
import { SingleSelectFilter } from "../columnfiltering/data-grid-addons/SingleSelectFilter";
import { DataGridFilterParser, ReactDataGridFilter } from "../columnfiltering/DataGridFilterParser";
import { TableFilterDescriptorCollection } from "../columnfiltering/TableFilterDescriptorCollection";
import { CellItem, ColumnDescription, FilterRenderer, RowItem, TableDataProvider } from "../TableDataProvider";
import { DragDropHeaderCell } from "./DragDropHeaderCell";
import { TableCell, TableCellContent, TableIconCellContent } from "./TableCell";
import { ReactDataGridColumn, TableColumn } from "./TableColumn";

// Matches how react-data-grid is exported
// https://github.com/Microsoft/TypeScript-Handbook/blob/master/pages/Modules.md#export--and-import--require
import ReactDataGrid = require("react-data-grid");

// cspell:ignore Overscan columnfiltering

const TABLE_ROW_HEIGHT = 27;
const TABLE_FILTER_ROW_HEIGHT = 32;

/**
 * Specifies table selection target.
 * @public
 */
export enum TableSelectionTarget {
  Row,
  Cell,
}

/** Scroll Direction */
enum SCROLL_DIRECTION {
  UP = "upwards",
  DOWN = "downwards",
  LEFT = "left",
  RIGHT = "right",
  NONE = "none",
}

/** Scroll State  */
interface ScrollState {
  height: number;
  scrollTop: number;
  scrollLeft: number;
  rowVisibleStartIdx: number;
  rowVisibleEndIdx: number;
  rowOverscanStartIdx: number;
  rowOverscanEndIdx: number;
  colVisibleStartIdx: number;
  colVisibleEndIdx: number;
  colOverscanStartIdx: number;
  colOverscanEndIdx: number;
  scrollDirection: SCROLL_DIRECTION;
  lastFrozenColumnIndex: number;
  isScrolling: boolean;
}

/** Properties for the Table React component
 * @public
 */
export interface TableProps extends CommonProps {
  /** Data provider for the Table */
  dataProvider: TableDataProvider;
  /** Amount of rows per page. The default is 100. */
  pageAmount?: number;

  /** Called when rows are loaded */
  onRowsLoaded?: (firstRowIndex: number, lastRowIndex: number) => void;

  /** Callback for determining if row is selected */
  isRowSelected?: (row: RowItem) => boolean;
  /** Callback for when rows are selected */
  onRowsSelected?: (rowIterator: AsyncIterableIterator<RowItem>, replace: boolean) => Promise<boolean>;
  /** Callback for when rows are deselected */
  onRowsDeselected?: (rowIterator: AsyncIterableIterator<RowItem>) => Promise<boolean>;

  /** Callback for determining if cell is selected */
  isCellSelected?: (rowIndex: number, cell: CellItem) => boolean;
  /** Callback for when cells are selected */
  onCellsSelected?: (cellIterator: AsyncIterableIterator<[RowItem, CellItem]>, replace: boolean) => Promise<boolean>;
  /** Callback for when cells are deselected */
  onCellsDeselected?: (cellIterator: AsyncIterableIterator<[RowItem, CellItem]>) => Promise<boolean>;

  /** Specifies the selection target. The default is Row. */
  tableSelectionTarget?: TableSelectionTarget;
  /** Specifies the selection mode. The default is Single. */
  selectionMode?: SelectionMode;

  /** Callback for when properties are being edited @beta */
  onPropertyEditing?: (args: TableCellEditorState) => void;
  /** Callback for when properties are updated @beta */
  onPropertyUpdated?: (propertyArgs: PropertyUpdatedArgs, cellArgs: TableCellUpdatedArgs) => Promise<boolean>;

  /** @internal */
  renderRow?: (item: RowItem, props: TableRowProps) => React.ReactNode;
  /** Enables context menu to show/hide columns */
  showHideColumns?: boolean;
  /** Indicates whether the Table columns are reorderable */
  reorderableColumns?: boolean;
  /** Optional parameter for persistent UI settings. Used for column reordering and show persistency. */
  settingsStorage?: UiSettingsStorage;
  /** Optional parameter for persistent UI settings. Used for column reordering and show persistency.
   * @deprecated use settingsStorage property */
  uiSettings?: UiSettings;
  /** Identifying string used for persistent state. */
  settingsIdentifier?: string;
  /** Custom property value renderer manager */
  propertyValueRendererManager?: PropertyValueRendererManager;
  /**
   * Gets called when rendering is finished. Should be used while testing to know when asynchronous rendering has finished.
   * @internal
   */
  onRender?: () => void;

  /** Hide the header */
  hideHeader?: boolean;
  /** Alternate the background of odd and even rows */
  stripedRows?: boolean;
  /** Specifies a row index to scroll to */
  scrollToRow?: number;
  /** @internal */
  onScrollToRow?: (rowIndex: number) => void;
  /** @internal */
  onApplyFilter?: () => void;

  /** Called to show a context menu when a cell is right-clicked. @beta */
  onCellContextMenu?: (args: TableCellContextMenuArgs) => void;
  /** Maximum number of distinct values for filtering */
  maximumDistinctValues?: number;
}

/** Properties for a Table cell
 * @public
 */
export interface CellProps {
  item: CellItem;
  displayValue: string;
  render: React.ComponentType<{ isSelected: boolean }>;
}

/** Properties for a Table row
 * @public
 */
export interface RowProps {
  index: number;
  item: RowItem;
  cells: { [key: string]: CellProps };
  render?: () => React.ReactNode;
  style?: React.CSSProperties;
}

interface RowsLoadResult {
  rows: RowProps[];
  selectedRowIndices: number[];
  selectedCellKeys: CellKey[];
}

interface ReactDataGridColumnEventArgs {
  rowIdx: number;
  idx: number;
  name: string;
}

/** Cell/Property Editor state
 * @public
 */
export interface TableCellEditorState {
  active: boolean;
  rowIndex?: number;
  colIndex?: number;
  cellKey?: string;
}

/** Cell/Property Updated Args
 * @public
 */
export interface TableCellUpdatedArgs {
  rowIndex: number;
  colIndex: number;
  cellKey: string;
}

/** Arguments for `TableProps.onCellContextMenu` callback
 * @beta
 */
export interface TableCellContextMenuArgs {
  /** Index of the row clicked */
  rowIndex: number;
  /** Index of the column clicked */
  colIndex: number;
  /** Key of the cell clicked */
  cellKey: string;
  /** An event which caused the context menu callback */
  event: React.MouseEvent;
  /** CellItem of the cell clicked */
  cellItem?: CellItem;
}

/** @internal */
interface TableState {
  columns: TableColumn[];
  hiddenColumns: string[];
  rows: RowProps[];
  rowsCount: number;
  menuVisible: boolean;
  menuX: number;
  menuY: number;
  cellEditorState: TableCellEditorState;
  dialog?: PropertyDialogState;
  keyboardEditorCellKey?: string;
  // TODO: Enable, when table gets refactored
  // popup?: PropertyPopupState;
  gridContainer: HTMLDivElement | null;
}

const initialState: TableState = {
  columns: [],
  hiddenColumns: [],
  rows: [],
  rowsCount: 0,
  cellEditorState: { active: false },
  menuVisible: false,
  menuX: 0,
  menuY: 0,
  gridContainer: null,
};

interface CellKey {
  rowIndex: number;
  columnKey: string;
}

/** TableRowRenderer props. */
interface TableRowRendererProps {
  rowRendererCreator: () => any;
}

/** ReactDataGrid requires a class component for the RowRenderer because it sets a ref to it. */
class TableRowRenderer extends React.Component<TableRowRendererProps> {
  public override render() {
    const creatorFn = this.props.rowRendererCreator();
    return creatorFn(this.props);
  }
}

const enum TableUpdate { // eslint-disable-line no-restricted-syntax
  None = 0,
  Rows = 1,
  Complete = 2,
}

const enum UpdateStatus { // eslint-disable-line no-restricted-syntax
  Continue,
  Abort,
}

/**
 * Table React component that displays rows and columns in a grid along with a header
 * @public
 */
export class Table extends React.Component<TableProps, TableState> {
  private _pageAmount = 100;
  private _disposableListeners = new DisposableList();
  private _isMounted = false;
  private _currentUpdate = TableUpdate.None;
  private _pendingUpdate = TableUpdate.None;
  private _rowLoadGuid = Guid.createValue();
  private _rowSelectionHandler: SelectionHandler<number>;
  private _cellSelectionHandler: SelectionHandler<CellKey>;
  private _selectedRowIndices: Set<number> = new Set<number>();
  private _selectedCellKeys: Map<string, Set<number>> = new Map<string, Set<number>>(); // column keys -> rowIndices
  private _rowItemSelectionHandlers?: Array<SingleSelectionHandler<number>>;
  private _cellItemSelectionHandlers?: Array<Array<SingleSelectionHandler<CellKey>>>;
  private _pressedItemSelected: boolean = false;
  private _tableRef = React.createRef<HTMLDivElement>();
  private _gridRef = React.createRef<ReactDataGrid<any>>();
  private _gridContainerRef = React.createRef<HTMLDivElement>();
  private _filterDescriptors?: TableFilterDescriptorCollection;
  private _filterRowShown = false;

  /** @internal */
  public override readonly state = initialState;

  /** @internal */
  constructor(props: TableProps) {
    super(props);

    if (props.pageAmount)
      this._pageAmount = props.pageAmount;

    this._disposableListeners.add(props.dataProvider.onColumnsChanged.addListener(this._onColumnsChanged));
    this._disposableListeners.add(props.dataProvider.onRowsChanged.addListener(this._onRowsChanged));
    this._rowSelectionHandler = new SelectionHandler(props.selectionMode ? props.selectionMode : SelectionMode.Single);
    this._cellSelectionHandler = new SelectionHandler(props.selectionMode ? props.selectionMode : SelectionMode.Single);
    this._rowSelectionHandler.onItemsSelectedCallback = this._onRowsSelected;
    this._rowSelectionHandler.onItemsDeselectedCallback = this._onRowsDeselected;
    this._cellSelectionHandler.onItemsSelectedCallback = this._onCellsSelected;
    this._cellSelectionHandler.onItemsDeselectedCallback = this._onCellsDeselected;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private get rowItemSelectionHandlers(): Array<SingleSelectionHandler<number>> {
    // istanbul ignore else
    if (!this._rowItemSelectionHandlers) {
      this._rowItemSelectionHandlers = [];
      for (let i = 0; i < this.state.rowsCount; i++)
        this._rowItemSelectionHandlers.push(this.createRowItemSelectionHandler(i));
    }
    return this._rowItemSelectionHandlers;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private get cellItemSelectionHandlers(): Array<Array<SingleSelectionHandler<CellKey>>> {
    // istanbul ignore else
    if (!this._cellItemSelectionHandlers) {
      this._cellItemSelectionHandlers = [];
      for (let rowIndex = 0; rowIndex < this.state.rowsCount; rowIndex++) {
        this._cellItemSelectionHandlers[rowIndex] = [];
        for (const column of this.state.columns) {
          this._cellItemSelectionHandlers[rowIndex].push(this.createCellItemSelectionHandler({ rowIndex, columnKey: column.key }));
        }
      }
    }
    return this._cellItemSelectionHandlers;
  }

  private async * createRowIterator(rowIndices: number[]): AsyncIterableIterator<RowItem> {
    for (const index of rowIndices)
      yield await this.props.dataProvider.getRow(index);
  }

  private async * createCellIterator(cellKeys: CellKey[]): AsyncIterableIterator<[RowItem, CellItem]> {
    for (const key of cellKeys) {
      const row = await this.props.dataProvider.getRow(key.rowIndex);
      yield [row, this._getCellItem(row, key.columnKey)];
    }
  }

  private _onRowsSelected: OnItemsSelectedCallback<number> = (rowIndices: number[], replace: boolean) => {
    if (this.props.onRowsSelected)
      this.props.onRowsSelected(this.createRowIterator(rowIndices), replace); // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  private _onRowsDeselected: OnItemsDeselectedCallback<number> = (rowIndices: number[]) => {
    if (this.props.onRowsDeselected)
      this.props.onRowsDeselected(this.createRowIterator(rowIndices)); // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  private _onCellsSelected: OnItemsSelectedCallback<CellKey> = (cellKeys: CellKey[], replace: boolean) => {
    if (this.props.onCellsSelected)
      this.props.onCellsSelected(this.createCellIterator(cellKeys), replace); // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  private _onCellsDeselected: OnItemsDeselectedCallback<CellKey> = (cellKeys: CellKey[]) => {
    if (this.props.onCellsDeselected)
      this.props.onCellsDeselected(this.createCellIterator(cellKeys)); // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  private get _tableSelectionTarget(): TableSelectionTarget {
    return this.props.tableSelectionTarget ? this.props.tableSelectionTarget : TableSelectionTarget.Row;
  }

  /** @internal */
  public override componentDidUpdate(previousProps: TableProps, previousState: TableState) {
    this._rowSelectionHandler.selectionMode = this.props.selectionMode ? this.props.selectionMode : SelectionMode.Single;
    this._cellSelectionHandler.selectionMode = this.props.selectionMode ? this.props.selectionMode : SelectionMode.Single;

    if (previousProps.dataProvider !== this.props.dataProvider) {
      this._disposableListeners.dispose();
      this._disposableListeners.add(this.props.dataProvider.onColumnsChanged.addListener(this._onColumnsChanged));
      this._disposableListeners.add(this.props.dataProvider.onRowsChanged.addListener(this._onRowsChanged));
    }

    if (this.props.dataProvider !== previousProps.dataProvider) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.update();
      return;
    }

    // When hiddenColumns length is changed, we need to re-render component so that cell widths would be calculated appropriately.
    if (previousState.hiddenColumns.length !== this.state.hiddenColumns.length)
      this.forceUpdate();

    if (this.props.isCellSelected !== previousProps.isCellSelected
      || this.props.isRowSelected !== previousProps.isRowSelected
      || this.props.tableSelectionTarget !== previousProps.tableSelectionTarget) {
      this.updateSelectedRows();
      this.updateSelectedCells();
    }

    if (this.props.scrollToRow !== previousProps.scrollToRow) {
      // istanbul ignore else
      if (this.props.scrollToRow !== undefined)
        this.scrollToRow(this.props.scrollToRow);
    }

    /* istanbul ignore next */
    if (this.props.onRender)
      this.props.onRender();
  }

  /** @internal */
  public override componentDidMount() {
    let gridContainer: HTMLDivElement | null = null;

    this._isMounted = true;

    // The previously used ReactResizeDetector, which does not work in popout/child windows, used deprecated React.findDomNode
    // which is now deprecated so, so new ElementResizeObserver requires you to pass the element to observe. So get the
    // same HTMLDivElement from grid as was used previously by ReactResizeDetector.
    if (this._gridRef.current) {
      const grid = this._gridRef.current as any;
      gridContainer = grid.getDataGridDOMNode();
    }
    this.setState({ gridContainer }, () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.update();
    });
  }

  /** @internal */
  public override componentWillUnmount() {
    this._isMounted = false;
    this._disposableListeners.dispose();
  }

  private scrollToRow(rowIndex: number) {
    // istanbul ignore else
    if (this._gridRef.current) {
      const grid = this._gridRef.current as any;
      // istanbul ignore else
      if (grid.getRowOffsetHeight && grid.getDataGridDOMNode) {
        const top = TABLE_ROW_HEIGHT * rowIndex;
        const gridCanvas = grid.getDataGridDOMNode().querySelector(".react-grid-Canvas");
        gridCanvas.scrollTop = top;

        // istanbul ignore else
        if (this.props.onScrollToRow)
          this.props.onScrollToRow(rowIndex);
      }
    }
  }

  private setFocusToSelected() {
    // istanbul ignore next
    if (this._gridRef.current) {
      const grid = this._gridRef.current as any;
      // istanbul ignore else
      if (grid.getDataGridDOMNode) {
        const gridSelected = grid.getDataGridDOMNode().querySelector(".rdg-selected");
        // istanbul ignore else
        if (gridSelected) {
          gridSelected.focus();
        }
      }
    }
  }

  private async handlePendingUpdate(): Promise<UpdateStatus> {
    const update = this._pendingUpdate;
    this._pendingUpdate = TableUpdate.None;

    let status = UpdateStatus.Continue;
    if (update === TableUpdate.Complete)
      status = await this.updateColumns();
    // istanbul ignore else
    if (status === UpdateStatus.Continue && update > TableUpdate.None)
      status = await this.updateRows();
    return status;
  }

  private async updateColumns(): Promise<UpdateStatus> {
    if (this._currentUpdate !== TableUpdate.None) {
      this._pendingUpdate = TableUpdate.Complete;
      return UpdateStatus.Abort;
    }

    this._currentUpdate = TableUpdate.Complete;
    const columnDescriptions = await this.props.dataProvider.getColumns();
    this._currentUpdate = TableUpdate.None;

    // istanbul ignore next
    if (!this._isMounted)
      return UpdateStatus.Abort;

    if (this._pendingUpdate === TableUpdate.Complete) {
      await this.handlePendingUpdate();
      return UpdateStatus.Abort;
    }

    let dataGridColumns = columnDescriptions.map(this._columnDescriptionToReactDataGridColumn);
    if (this.props.settingsIdentifier) {
      // eslint-disable-next-line deprecation/deprecation
      const settingsStorage: UiSettingsStorage = this.props.settingsStorage || /* istanbul ignore next */ this.props.uiSettings || /* istanbul ignore next */ new LocalSettingsStorage();
      const reorderResult = await settingsStorage.getSetting(this.props.settingsIdentifier, "ColumnReorder");
      // istanbul ignore next
      if (reorderResult.status === UiSettingsStatus.Success) {
        const setting = reorderResult.setting as string[];
        // map columns according to the keys in columns, in the order of the loaded array of keys
        dataGridColumns = setting.map((key) => dataGridColumns.filter((col) => col.key === key)[0]);
      } else if (reorderResult.status === UiSettingsStatus.NotFound) {
        const keys = columnDescriptions.map((col) => col.key);
        await settingsStorage.saveSetting(this.props.settingsIdentifier, "ColumnReorder", keys);
      }
      const showhideResult = await settingsStorage.getSetting(this.props.settingsIdentifier, "ColumnShowHideHiddenColumns");
      // istanbul ignore next
      if (showhideResult.status === UiSettingsStatus.Success) {
        const hiddenColumns = showhideResult.setting as string[];
        this.setState({ hiddenColumns });
      }
    }

    let keyboardEditorCellKey: string | undefined;
    const tableColumns = dataGridColumns.map((dataGridColumn: ReactDataGridColumn, index: number) => {
      const tableColumn = new TableColumn(this, columnDescriptions[index], dataGridColumn);
      tableColumn.dataProvider = this.props.dataProvider;
      if (!keyboardEditorCellKey && tableColumn.columnDescription.editable)
        keyboardEditorCellKey = tableColumn.key;
      if (tableColumn.filterable)
        dataGridColumn.filterableColumn = tableColumn;
      return tableColumn;
    });

    for (const tableColumn of tableColumns) {
      if (tableColumn.filterable)
        tableColumn.distinctValueCollection = await tableColumn.getDistinctValues(this.props.maximumDistinctValues);
    }

    this.setState({ columns: tableColumns, keyboardEditorCellKey });

    if (this._pendingUpdate !== TableUpdate.None) {
      return this.handlePendingUpdate();
    }
    return UpdateStatus.Continue;
  }

  private _onColumnsChanged = async () => {
    await this.updateColumns();

    this._cellItemSelectionHandlers = undefined;
  };

  private async updateRows(): Promise<UpdateStatus> {
    if (this._currentUpdate !== TableUpdate.None) {
      if (this._pendingUpdate === TableUpdate.None)
        this._pendingUpdate = TableUpdate.Rows;
      return UpdateStatus.Abort;
    }

    this._currentUpdate = TableUpdate.Rows;
    const rowsCount = await this.props.dataProvider.getRowsCount();
    this._currentUpdate = TableUpdate.None;

    // istanbul ignore next
    if (!this._isMounted)
      return UpdateStatus.Abort;

    if (this._pendingUpdate !== TableUpdate.None) {
      return this.handlePendingUpdate();
    }

    if (rowsCount !== this.state.rowsCount) {
      this._rowItemSelectionHandlers = undefined;
      this._cellItemSelectionHandlers = undefined;

      // when updating the rows with new data from dataProvider clear out existing selections
      this._selectedRowIndices.clear();
      this._selectedCellKeys.clear();
    }

    this._rowGetterAsync.cache.clear!();
    this.setState({ rowsCount, rows: [] });
    this._rowGetterAsync(0, true); // eslint-disable-line @typescript-eslint/no-floating-promises
    return UpdateStatus.Continue;
  }

  private _onRowsChanged = async () => {
    await this.updateRows();
  };

  /** @internal */
  public async update(): Promise<UpdateStatus> {
    let status = await this.updateColumns();

    if (status !== UpdateStatus.Abort)
      status = await this.updateRows();

    if (this.props.scrollToRow !== undefined)
      this.scrollToRow(this.props.scrollToRow);

    /* istanbul ignore next */
    if (this.props.onRender)
      this.props.onRender();

    return status;
  }

  /** @internal */
  public updateSelectedRows() {
    const selectedRowIndices = new Set<number>();
    if (this.props.isRowSelected) {
      for (let rowIndex = 0; rowIndex < this.state.rows.length; rowIndex++) {
        if (this.state.rows[rowIndex] && this.props.isRowSelected(this.state.rows[rowIndex].item))
          selectedRowIndices.add(rowIndex);
      }
    }
    this._selectedRowIndices = selectedRowIndices;
    this.forceUpdate();
  }

  /** @internal */
  public updateSelectedCells() {
    const selectedCellKeys = new Map<string, Set<number>>();
    if (this.props.isCellSelected) {
      for (const column of this.state.columns) {
        const set = new Set<number>();
        for (let rowIndex = 0; rowIndex < this.state.rows.length; rowIndex++) {
          // istanbul ignore next
          if (!this.state.rows[rowIndex])
            continue;
          const cellItem = this._getCellItem(this.state.rows[rowIndex].item, column.key);
          if (this.props.isCellSelected(rowIndex, cellItem))
            set.add(rowIndex);
        }
        // istanbul ignore else
        if (set.size !== 0)
          selectedCellKeys.set(column.key, set);
      }
    }
    this._selectedCellKeys = selectedCellKeys;
    this.forceUpdate();
  }

  private _columnDescriptionToReactDataGridColumn = (columnDescription: ColumnDescription): ReactDataGridColumn => {
    const isEditable = !!columnDescription.editable;

    const column: ReactDataGridColumn = {
      key: columnDescription.key,
      name: columnDescription.label,
      icon: columnDescription.icon,
      width: columnDescription.width,
      resizable: !!columnDescription.resizable,
      sortable: !!columnDescription.sortable,
      draggable: !!this.props.reorderableColumns,
      filterable: !!columnDescription.filterable,
    };

    column.events = {};

    if (this.props.onCellContextMenu) {
      column.events.onContextMenu = this.cellContextMenu.bind(this, column);
    }

    if (isEditable) {
      column.events.onClick = this.cellEditOnClick.bind(this, column);
    }

    if (columnDescription.filterRenderer !== undefined) {
      switch (columnDescription.filterRenderer) {
        case FilterRenderer.Numeric:
          column.filterRenderer = NumericFilter;
          break;
        case FilterRenderer.MultiSelect:
          column.filterRenderer = MultiSelectFilter;
          break;
        case FilterRenderer.MultiValue:
          column.filterRenderer = MultiValueFilter;
          break;
        case FilterRenderer.SingleSelect:
          column.filterRenderer = SingleSelectFilter;
          break;
        case FilterRenderer.Text:
          // column.filterRenderer is not set for the Text input filter
          break;
      }
    }

    return column;
  };

  private _getCellItem = (row: RowItem, columnKey: string): CellItem => {
    return row.cells.find((cell: CellItem) => cell.key === columnKey) || /* istanbul ignore next */ { key: columnKey };
  };

  private isCellSelected(key: CellKey) {
    const set = this._selectedCellKeys.get(key.columnKey);
    if (set)
      return set.has(key.rowIndex);
    return false;
  }

  private selectCells(cellKeys: CellKey[]) {
    for (const key of cellKeys) {
      let set = this._selectedCellKeys.get(key.columnKey);
      if (!set) {
        set = new Set();
        this._selectedCellKeys.set(key.columnKey, set);
      }
      set.add(key.rowIndex);
    }
  }

  private deselectCells(cellKeys: CellKey[]) {
    for (const key of cellKeys) {
      // istanbul ignore else
      const set = this._selectedCellKeys.get(key.columnKey);
      // istanbul ignore else
      if (set)
        set.delete(key.rowIndex);
    }
  }

  private createRowItemSelectionHandler(rowIndex: number): SingleSelectionHandler<number> {
    return {
      preselect: () => {
        this._pressedItemSelected = this._selectedRowIndices.has(rowIndex);
      },
      select: () => {
        // istanbul ignore else
        if (!this._selectedRowIndices.has(rowIndex)) {
          this._selectedRowIndices.add(rowIndex);
          if (!this._pressedItemSelected)
            this.forceUpdate();
        }
      },
      deselect: () => {
        // istanbul ignore else
        if (this._selectedRowIndices.has(rowIndex)) {
          this._selectedRowIndices.delete(rowIndex);
          this.forceUpdate();
        }
      },
      isSelected: () => this._selectedRowIndices.has(rowIndex),
      item: () => rowIndex,
    };
  }

  private _rowComponentSelectionHandler: MultiSelectionHandler<number> = {
    deselectAll: () => {
      this._selectedRowIndices = new Set<number>();
      if (!this._pressedItemSelected) {
        this._deactivateCellEditor();
        this.forceUpdate();
      }
    },
    selectBetween: (rowIndex1: number, rowIndex2: number) => {
      const selections = [];
      const lowerNumber = rowIndex1 < rowIndex2 ? rowIndex1 : rowIndex2;
      const higherNumber = rowIndex1 > rowIndex2 ? rowIndex1 : rowIndex2;
      for (let i = lowerNumber; i <= higherNumber; i++) {
        // istanbul ignore else
        if (!this._selectedRowIndices.has(i)) {
          selections.push(i);
          this._selectedRowIndices.add(i);
        }
      }

      this.forceUpdate();
      return selections;
    },
    updateSelection: (selections: number[], deselections: number[]): void => {
      for (const rowIndex of selections) {
        // istanbul ignore else
        if (!this._selectedRowIndices.has(rowIndex))
          this._selectedRowIndices.add(rowIndex);
      }

      for (const rowIndex of deselections) {
        // istanbul ignore else
        if (this._selectedRowIndices.has(rowIndex))
          this._selectedRowIndices.delete(rowIndex);
      }
      this.forceUpdate();
    },
    areEqual: (item1: number, item2: number) => item1 === item2,
  };

  private createCellItemSelectionHandler(cellKey: CellKey): SingleSelectionHandler<CellKey> {
    return {
      preselect: () => {
        this._pressedItemSelected = this.isCellSelected(cellKey);
      },
      select: () => {
        this.selectCells([cellKey]);
        this.forceUpdate();
      },
      deselect: () => {
        this.deselectCells([cellKey]);
        this.forceUpdate();
      },
      isSelected: () => this.isCellSelected(cellKey),
      item: () => cellKey,
    };
  }

  private _cellComponentSelectionHandler: MultiSelectionHandler<CellKey> = {
    deselectAll: () => {
      this._selectedCellKeys = new Map<string, Set<number>>();
      this.forceUpdate();
    },
    selectBetween: (item1: CellKey, item2: CellKey) => {
      const selections: CellKey[] = [];
      const lowerIndex = item1.rowIndex < item2.rowIndex ? item1.rowIndex : item2.rowIndex;
      const higherIndex = item1.rowIndex > item2.rowIndex ? item1.rowIndex : item2.rowIndex;
      let secondItem: CellKey;
      let firstItemFound = false;
      let secondItemFound = false;

      for (let rowIndex = lowerIndex; rowIndex <= higherIndex; rowIndex++) {
        for (const column of this.state.columns) {
          if (!firstItemFound) {
            if (rowIndex === item1.rowIndex && column.key === item1.columnKey) {
              firstItemFound = true;
              secondItem = item2;
            } else {
              // istanbul ignore else
              if (rowIndex === item2.rowIndex && column.key === item2.columnKey) {
                firstItemFound = true;
                secondItem = item1;
              } else
                continue;
            }
          }

          const cellKey = { rowIndex, columnKey: column.key };
          if (!this.isCellSelected(cellKey))
            selections.push(cellKey);

          if (rowIndex === secondItem!.rowIndex && column.key === secondItem!.columnKey) {
            secondItemFound = true;
            break;
          }
        }
        if (secondItemFound)
          break;
      }

      this.selectCells(selections);
      this.forceUpdate();
      return selections;
    },
    updateSelection: (selections: CellKey[], deselections: CellKey[]): void => {
      this.selectCells(selections);
      this.deselectCells(deselections);
      this.forceUpdate();
    },
    areEqual: (item1: CellKey, item2: CellKey) => item1.rowIndex === item2.rowIndex && item1.columnKey === item2.columnKey,
  };

  private _rowGetter = (i: number): RowProps => {
    if (this.state.rows[i])
      return this.state.rows[i];

    // get another page of rows
    // note: always start loading at the beginning of a page to avoid
    // requesting duplicate data (e.g. a page that starts at 0, at 1, at 2, ...)
    this._rowGetterAsync(i - (i % this._pageAmount), false); // eslint-disable-line @typescript-eslint/no-floating-promises

    // Return placeholder object
    return { item: { key: "", cells: [] }, index: i, cells: {} };
  };

  private _rowGetterAsync = memoize(async (index: number, clearRows: boolean): Promise<void> => {
    // istanbul ignore next
    if (index < 0)
      return;

    // load up to `this._pageAmount` more rows
    const maxIndex = Math.min(this.state.rowsCount, index + this._pageAmount);
    const loadResult = await this.loadRows(index, maxIndex);

    // istanbul ignore next
    if (!this._isMounted)
      return;

    // istanbul ignore next
    if (this._pendingUpdate !== TableUpdate.None)
      return;

    const selectedRowIndices = this._selectedRowIndices;
    for (const rowIndex of loadResult.selectedRowIndices) {
      // istanbul ignore else
      if (!selectedRowIndices.has(rowIndex))
        selectedRowIndices.add(rowIndex);
    }
    this._selectedRowIndices = selectedRowIndices;

    this.selectCells(loadResult.selectedCellKeys);
    this.setState((prev) => {
      const rows = clearRows ? [] : [...prev.rows];
      loadResult.rows.forEach((r, i) => { rows[index + i] = r; });
      return { rows };
    }, async () => {
      if (this.props.onRowsLoaded)
        this.props.onRowsLoaded(index, index + loadResult.rows.length - 1);

      const showFilter = this._isShowFilterRow();
      if (showFilter !== this._filterRowShown)
        this.toggleFilterRow(showFilter);
    });
  });

  private async renderCellContent(cellItem: CellItem, column: ReactDataGridColumn, displayValue: string): Promise<React.ComponentType<{ isSelected: boolean }>> {
    if (column.icon)
      return () => <TableIconCellContent iconName={displayValue} />;

    return (props: { isSelected: boolean }) => (
      <TableCellContent
        height={TABLE_ROW_HEIGHT}
        isSelected={props.isSelected}
        cellItem={cellItem}
        onDialogOpen={this._onDialogOpen}
        propertyValueRendererManager={this.props.propertyValueRendererManager
          ? this.props.propertyValueRendererManager
          : PropertyValueRendererManager.defaultManager}
        style={{ zIndex: ((cellItem.mergedCellsCount ?? 1) > 1) ? 1 : undefined }}
      />
    );
  }

  private async getCellDisplayValue(cellItem: CellItem): Promise<string> {
    // istanbul ignore next
    if (!cellItem.record || cellItem.record.value.valueFormat !== PropertyValueFormat.Primitive)
      return "";

    const value = cellItem.record.value.value;

    if (value === undefined)
      return "";

    const displayValue = await TypeConverterManager
      .getConverter(cellItem.record.property.typename, cellItem.record.property.converter?.name)
      .convertPropertyToString(cellItem.record.property, value);

    return displayValue ? displayValue : /* istanbul ignore next */ "";
  }

  private async createPropsForRowItem(item: RowItem, index: number): Promise<RowProps> {
    const cellProps: { [key: string]: CellProps } = {};
    for (const column of this.state.columns) {
      const cellItem = this._getCellItem(item, column.key);
      const displayValue = await this.getCellDisplayValue(cellItem);
      cellProps[column.key] = {
        item: cellItem,
        displayValue,
        render: await this.renderCellContent(cellItem, column.reactDataGridColumn, displayValue),
      };
    }
    const rowStyle = TableRowStyleProvider.createStyle(item.colorOverrides ? item.colorOverrides : {});
    return {
      item,
      index,
      cells: cellProps,
      render: undefined,
      style: rowStyle,
    };
  }

  private async loadRows(beginIndex: number, endIndex: number): Promise<RowsLoadResult> {
    const result: RowsLoadResult = {
      rows: [],
      selectedRowIndices: [],
      selectedCellKeys: [],
    };
    this._rowLoadGuid = Guid.createValue();
    const currentSelectedRowGuid: GuidString = this._rowLoadGuid;

    const promises = new Array<Promise<RowProps>>();
    for (let i = beginIndex; i < endIndex; ++i) {
      promises.push(
        this.props.dataProvider.getRow(i).then(async (rowData) =>
          this.createPropsForRowItem(rowData, i).then((rowProps) => (rowProps)),
        ));
    }

    try {
      result.rows = await Promise.all(promises);
    } catch { }

    // Check if another loadRows got called while this one was still going
    if (currentSelectedRowGuid === this._rowLoadGuid) {
      for (const rowProps of result.rows) {
        if (this.props.isRowSelected && this.props.isRowSelected(rowProps.item))
          result.selectedRowIndices.push(rowProps.index);

        if (this.props.isCellSelected) {
          for (const column of this.state.columns) {
            const cellItem = this._getCellItem(rowProps.item, column.key);
            if (this.props.isCellSelected(rowProps.index, cellItem))
              result.selectedCellKeys.push({ rowIndex: rowProps.index, columnKey: column.key });
          }
        }
      }
    }

    return result;
  }

  private _handleGridSort = (columnKey: string, sortDirection: "ASC" | "DESC" | "NONE") => {
    let directionEnum: SortDirection;

    switch (sortDirection) {
      case "ASC":
        directionEnum = SortDirection.Ascending;
        break;
      case "DESC":
        directionEnum = SortDirection.Descending;
        break;
      case "NONE":
      default:
        directionEnum = SortDirection.NoSort;
        break;
    }

    // Sort the column
    this.gridSortAsync(columnKey, directionEnum); // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  private getColumnIndexFromKey(columnKey: string): number {
    return this.state.columns.findIndex((column: TableColumn) => column.key === columnKey);
  }

  private async gridSortAsync(columnKey: string, directionEnum: SortDirection) {
    const columnIndex = this.getColumnIndexFromKey(columnKey);
    // istanbul ignore next
    if (columnIndex < 0)
      return;

    await this.props.dataProvider.sort(columnIndex, directionEnum);

    // istanbul ignore next
    if (!this._isMounted)
      return;

    this.updateRows(); // eslint-disable-line @typescript-eslint/no-floating-promises
  }

  private createRowCells(rowProps: RowProps, isSelected: boolean): { [columnKey: string]: React.ReactNode } {
    const cells: { [columnKey: string]: React.ReactNode } = {};
    let gridColumns: HTMLElement[] = [];
    let foundHiddenColumns = 0;

    // istanbul ignore else
    if (this._gridRef.current && (this._gridRef.current as any).getDataGridDOMNode)
      gridColumns = (this._gridRef.current as any).getDataGridDOMNode().querySelectorAll(".react-grid-HeaderCell");

    for (let index = 0; index < this.state.columns.length; index++) {
      const column = this.state.columns[index];

      const cellProps = rowProps.cells[column.key];
      if (!cellProps) {
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const CellContent = cellProps.render;
      const isEditorCell =
        this.state.cellEditorState.active
        && this.state.cellEditorState.rowIndex === rowProps.index
        && this.state.cellEditorState.colIndex === index
        && cellProps.item.record;

      let onClick: ((e: React.MouseEvent) => void) | undefined;
      let onMouseMove: ((e: React.MouseEvent) => void) | undefined;
      let onMouseDown: ((e: React.MouseEvent) => void) | undefined;
      let className: string | undefined;

      const cellKey = { rowIndex: rowProps.index, columnKey: column.key };
      if (this._tableSelectionTarget === TableSelectionTarget.Cell) {
        const selectionHandler = this.createCellItemSelectionHandler(cellKey);
        const selectionFunction = this._cellSelectionHandler.createSelectionFunction(this._cellComponentSelectionHandler, selectionHandler);
        onClick = (e: React.MouseEvent) => selectionFunction(e.shiftKey, e.ctrlKey);
        onMouseMove = (e: React.MouseEvent) => {
          // istanbul ignore else
          if (e.buttons === 1)
            this._cellSelectionHandler.updateDragAction(cellKey);
        };
        onMouseDown = () => {
          this._cellSelectionHandler.createDragAction(this._cellComponentSelectionHandler, this.cellItemSelectionHandlers, cellKey);
        };
        className = classnames({ "is-selected": this.isCellSelected(cellKey) });
      } else {
        if (this._selectedRowIndices.has(rowProps.index))
          className = classnames({ "is-keyboard-editable": this.state.keyboardEditorCellKey === column.key });
      }

      className = classnames(className, this.getCellBorderStyle(cellKey));
      const mergedAdjacentCellsCount = (cellProps.item.mergedCellsCount ?? 1) - 1;
      let cellWidth = 0;

      for (let i = 0; i <= mergedAdjacentCellsCount; i++) {
        const col = this.state.columns[index + i];
        if (this.state.hiddenColumns.indexOf(col.key) === -1) {
          const gridColumn = gridColumns[index + i - foundHiddenColumns];
          const gridColumnWidth = gridColumn ? gridColumn.getBoundingClientRect().width : 0;
          cellWidth += gridColumnWidth;
        } else {
          foundHiddenColumns++;
        }

        if (i > 0) {
          cells[col.key] = (
            <TableCell
              className={className.replace("border-bottom", "")}
              title={"empty-cell"}
              onClick={onClick}
              onMouseMove={onMouseMove}
              onMouseDown={onMouseDown}
            >
            </TableCell>
          );
        }
        const mergedColumn = this.state.columns[index + i];
        const emptyCellKey = { rowIndex: rowProps.index, columnKey: mergedColumn.key };
        className = classnamesDedupe(className, this.getCellBorderStyle(emptyCellKey));
      }
      index += mergedAdjacentCellsCount;

      cells[column.key] = (
        <TableCell
          className={className}
          title={cellProps.displayValue}
          onClick={onClick}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          cellEditingProps={isEditorCell ? {
            onCancel: this._deactivateCellEditor,
            onCommit: this._onCellCommit,
            propertyRecord: cellProps.item.record!,
            setFocus: true,
          } : undefined}
          style={{ width: (mergedAdjacentCellsCount > 0) ? cellWidth : undefined }}
        >
          <CellContent isSelected={isSelected} />
        </TableCell>
      );
    }
    return cells;
  }

  private getCellBorderStyle(key: CellKey): string {
    const isCellSelected = (cellKey: CellKey): boolean => {
      if (this._tableSelectionTarget === TableSelectionTarget.Row) {
        return this._selectedRowIndices.has(cellKey.rowIndex);
      }

      return this.isCellSelected(cellKey);
    };

    const cellIsSelected = isCellSelected(key);
    const columnIndex = this.state.columns.findIndex((column) => key.columnKey === column.key);

    const isTopBorderVisible = (): boolean => {
      if (key.rowIndex === 0) {
        return cellIsSelected;
      }

      if (cellIsSelected) {
        return !isCellSelected({ rowIndex: key.rowIndex - 1, columnKey: key.columnKey });
      }

      // Bottom border is rendered by drawing the top border on the node below
      // Check if the node above needs its bottom border drawn
      return isCellSelected({ rowIndex: key.rowIndex - 1, columnKey: key.columnKey });
    };

    const isRightBorderVisible = (): boolean => {
      if (!cellIsSelected) {
        return false;
      }

      if (columnIndex === this.state.columns.length - 1) {
        return true;
      }

      return !isCellSelected({ rowIndex: key.rowIndex, columnKey: this.state.columns[columnIndex + 1].key });
    };

    const isBottomBorderVisible = (): boolean => {
      return cellIsSelected && key.rowIndex === this.state.rowsCount - 1;
    };

    const isLeftBorderVisible = (): boolean => {
      if (!cellIsSelected) {
        return false;
      }

      if (columnIndex === 0) {
        return true;
      }

      return !isCellSelected({ rowIndex: key.rowIndex, columnKey: this.state.columns[columnIndex - 1].key });
    };

    return classnames({
      "border-top": isTopBorderVisible(),
      "border-right": isRightBorderVisible(),
      "border-bottom": isBottomBorderVisible(),
      "border-left": isLeftBorderVisible(),
    });
  }

  private _createRowRenderer = () => {
    return (props: { row: RowProps, [k: string]: React.ReactNode }) => {
      // istanbul ignore next
      const renderRow = this.props.renderRow ? this.props.renderRow : this.renderRow;
      const { row: rowProps, ...reactDataGridRowProps } = props;
      if (this._tableSelectionTarget === TableSelectionTarget.Row) {
        const selectionFunction = this._rowSelectionHandler.createSelectionFunction(this._rowComponentSelectionHandler, this.createRowItemSelectionHandler(props.row.index));
        const onClick = (e: React.MouseEvent) => selectionFunction(e.shiftKey, e.ctrlKey);
        const onMouseDown = () => {
          this._rowSelectionHandler.createDragAction(this._rowComponentSelectionHandler, [this.rowItemSelectionHandlers], props.row.index);
        };
        const onMouseMove = (e: React.MouseEvent) => {
          // istanbul ignore else
          if (e.buttons === 1)
            this._rowSelectionHandler.updateDragAction(props.row.index);
        };
        const isSelected = this._selectedRowIndices.has(props.row.index);
        const cells = this.createRowCells(rowProps, isSelected);
        const row = renderRow(rowProps.item, { ...reactDataGridRowProps, cells, isSelected });
        return <div
          className={classnames("components-table-row")}
          onClickCapture={onClick}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          style={props.row.style}
          role="presentation">
          {row}
        </div>;
      } else {
        const cells = this.createRowCells(rowProps, false);
        return renderRow(rowProps.item, { ...reactDataGridRowProps, cells });
      }
    };
  };

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private renderRow = (item: RowItem, props: TableRowProps): React.ReactNode => {
    return <TableRow key={item.key} {...props} />;
  };

  private _onMouseUp = () => {
    if (this._tableSelectionTarget === TableSelectionTarget.Row)
      this._rowSelectionHandler.completeDragAction();
    else
      this._cellSelectionHandler.completeDragAction();
  };

  private _onMouseDown = () => {
    document.addEventListener("mouseup", this._onMouseUp, { capture: true, once: true });
  };

  private _onHeaderDrop = (source: string, target: string) => {
    const cols = [...this.state.columns];
    const columnSourceIndex = this.state.columns.findIndex((i) => i.key === source);
    const columnTargetIndex = this.state.columns.findIndex((i) => i.key === target);

    cols.splice(columnTargetIndex, 0, cols.splice(columnSourceIndex, 1)[0]);
    // istanbul ignore else
    if (this.props.settingsIdentifier) {
      const settingsStorage: UiSettingsStorage = this.props.settingsStorage || /* istanbul ignore next */ new LocalSettingsStorage();
      const keys = cols.map((col) => col.key);
      settingsStorage.saveSetting(this.props.settingsIdentifier, "ColumnReorder", keys); // eslint-disable-line @typescript-eslint/no-floating-promises
    }
    this.setState({ columns: [] }, () => { // fix react-data-grid update issues
      this.setState({ columns: cols });
    });
  };

  private cellEditOnClick(column: ReactDataGridColumn, _ev: React.SyntheticEvent<any>, args: ReactDataGridColumnEventArgs): void {
    // Prevent editing when property record is not primitive
    // istanbul ignore else
    if (this.state.rows[args.rowIdx]) {
      const record = this._getCellItem(this.state.rows[0].item, column.key).record;
      // istanbul ignore next
      if (record && record.value.valueFormat !== PropertyValueFormat.Primitive)
        return;
    }

    if (this.state.keyboardEditorCellKey !== column.key)
      this.setState({ keyboardEditorCellKey: column.key });

    let activate = false;

    if (this._pressedItemSelected)
      activate = true;

    if (activate)
      this.activateCellEditor(args.rowIdx, args.idx, column.key);
    else
      this._deactivateCellEditor();
  }

  private cellContextMenu(column: ReactDataGridColumn, e: React.SyntheticEvent<any>, args: ReactDataGridColumnEventArgs): void {
    // istanbul ignore else
    if (this.props.onCellContextMenu) {
      const contextMenuArgs: TableCellContextMenuArgs = {
        rowIndex: args.rowIdx,
        colIndex: args.idx,
        cellKey: column.key,
        event: e as unknown as React.MouseEvent,
      };

      // istanbul ignore else
      if (this.state.rows[args.rowIdx])
        contextMenuArgs.cellItem = this._getCellItem(this.state.rows[args.rowIdx].item, column.key);

      e.preventDefault();
      this.props.onCellContextMenu(contextMenuArgs);
    }
  }

  private activateCellEditor(rowIndex: number, colIndex: number, cellKey: string): void {
    const cellEditorState = { active: true, rowIndex, colIndex, cellKey };
    // istanbul ignore else
    if (cellEditorState !== this.state.cellEditorState) {
      this.setState(
        { cellEditorState },
        () => {
          // istanbul ignore else
          if (this.props.onPropertyEditing)
            this.props.onPropertyEditing(cellEditorState);
        },
      );
    }
  }

  private _deactivateCellEditor = (): void => {
    if (this.state.cellEditorState.active)
      this.setState({ cellEditorState: { active: false } }, () => setImmediate(() => this.setFocusToSelected()));
  };

  /** @internal */
  public override shouldComponentUpdate(_props: TableProps): boolean {
    return true;
  }

  private _onCellCommit = async (args: PropertyUpdatedArgs) => {
    // istanbul ignore else
    if (this.props.onPropertyUpdated) {
      const cellUpdatedArgs: TableCellUpdatedArgs = {
        rowIndex: this.state.cellEditorState.rowIndex!,
        colIndex: this.state.cellEditorState.colIndex!,
        cellKey: this.state.cellEditorState.cellKey!,
      };
      const allowed = await this.props.onPropertyUpdated(args, cellUpdatedArgs);
      // istanbul ignore else
      if (allowed && this.state.cellEditorState.rowIndex !== undefined && this.state.cellEditorState.rowIndex >= 0) {
        this._deactivateCellEditor();
        await this.updateRows();
      } else {
        this._deactivateCellEditor();
      }
    }
  };

  private _getVisibleColumns = (): ReactDataGridColumn[] => {
    return this.state.columns
      .filter((tableColumn: TableColumn) => this.state.hiddenColumns.indexOf(tableColumn.key) === -1)
      .map((tableColumn: TableColumn) => tableColumn.reactDataGridColumn);
  };

  private _handleShowHideContextMenu = (e: React.MouseEvent) => {
    const header = e.currentTarget.querySelector(".react-grid-Header");
    // istanbul ignore else
    if (header) {
      const headerRect = header.getBoundingClientRect();
      const offsetY = headerRect.top;
      const height = headerRect.height;
      const x = e.clientX, y = e.clientY;
      // istanbul ignore else
      if (y < offsetY + height) {
        e.preventDefault();
        this.setState({
          menuX: x, menuY: y,
          menuVisible: true,
        });
      }
    }
  };

  private _hideContextMenu = () => {
    // istanbul ignore else
    if (this.props.showHideColumns)
      this.setState({ menuVisible: false });
  };

  // istanbul ignore next
  private _handleShowHideChange = (cols: string[]) => {
    this.setState({ hiddenColumns: cols });
    if (this.props.settingsIdentifier) {
      const settingsStorage: UiSettingsStorage = this.props.settingsStorage || new LocalSettingsStorage();
      settingsStorage.saveSetting(this.props.settingsIdentifier, "ColumnShowHideHiddenColumns", cols); // eslint-disable-line @typescript-eslint/no-floating-promises
    }
    return true;
  };

  // istanbul ignore next
  private _onDialogOpen = (dialogState: PropertyDialogState) => this.setState({ dialog: dialogState });

  // istanbul ignore next
  private _onDialogClose = () => this.setState({ dialog: undefined });

  private _isShowFilterRow(): boolean {
    return this.state.columns.some((tableColumn: TableColumn) => tableColumn.filterable);
  }

  /** Turn on/off filter row */
  private toggleFilterRow(showFilter: boolean): void {
    // istanbul ignore else
    if (this._gridRef.current) {
      const grid = this._gridRef.current as any;
      // istanbul ignore else
      if (grid.onToggleFilter && showFilter !== this._filterRowShown) {
        grid.onToggleFilter();

        this._filterRowShown = showFilter;
      }
    }
  }

  /** Gets the filter descriptors for the table.
   * @internal
   */
  public get filterDescriptors(): CompositeFilterDescriptorCollection {
    if (undefined === this._filterDescriptors) {
      this._filterDescriptors = new TableFilterDescriptorCollection();
      this._filterDescriptors.logicalOperator = FilterCompositionLogicalOperator.And;
    }

    return this._filterDescriptors;
  }

  /** Gets ECExpression to get property display value.
   * @internal
   */
  // istanbul ignore next
  public getPropertyDisplayValueExpression(property: string): string {
    if (this.props.dataProvider.getPropertyDisplayValueExpression !== undefined)
      return this.props.dataProvider.getPropertyDisplayValueExpression(property);
    return property;
  }

  private _handleFilterChange = (filter: ReactDataGridFilter): void => {
    const columnKey = filter.column.key;
    const tableColumn = this.state.columns.find((column: TableColumn) => column.key === columnKey);

    // istanbul ignore else
    if (tableColumn) {
      setTimeout(async () => {
        await DataGridFilterParser.handleFilterChange(filter, tableColumn.columnFilterDescriptor, tableColumn.columnDescription, this._applyFilter);
      });
    }
  };

  // istanbul ignore next
  private _handleOnClearFilters = () => {
    this.filterDescriptors.clear();

    this._applyFilter();  // eslint-disable-line @typescript-eslint/no-floating-promises
  };

  private _applyFilter = async (): Promise<void> => {
    // istanbul ignore else
    if (this.props.dataProvider.applyFilterDescriptors) {
      await this.props.dataProvider.applyFilterDescriptors(this.filterDescriptors);
      await this.updateRows();

      // istanbul ignore else
      if (this.props.onApplyFilter)
        this.props.onApplyFilter();
    }
  };

  // istanbul ignore next
  private _getValidFilterValues = (columnKey: string): any[] => {
    const tableColumn = this.state.columns.find((column: TableColumn) => column.reactDataGridColumn.key === columnKey);
    if (tableColumn && tableColumn.distinctValueCollection) {
      return tableColumn.distinctValueCollection.values;
    }
    return [];
  };

  // TODO: Enable, when table gets refactored. Explanation in ./../table/NonPrimitiveValueRenderer
  // private _onPopupShow = (popupState: PropertyPopupState) => this.setState({ popup: popupState });

  // private _onPopupHide = () =>  this.setState({ popup: undefined });

  // istanbul ignore next
  private _onScroll = (scrollData: ScrollState) => {
    if (this.props.onScrollToRow)
      this.props.onScrollToRow(scrollData.rowVisibleStartIdx);
  };

  /** Determines if focus is in an input element - for filter checking */
  private isFocusOnInputElement(): boolean {
    const element: HTMLElement = document.activeElement as HTMLElement;
    return element &&
      (element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement);
  }

  private _onKeyboardEvent = (e: React.KeyboardEvent, keyDown: boolean) => {
    if (isNavigationKey(e.key) && !this.state.cellEditorState.active && !this.isFocusOnInputElement()) {
      if (this._tableSelectionTarget === TableSelectionTarget.Row) {
        const handleKeyboardSelectItem = (index: number) => {
          const selectionFunction = this._rowSelectionHandler.createSelectionFunction(this._rowComponentSelectionHandler, this.createRowItemSelectionHandler(index));
          selectionFunction(e.shiftKey, e.ctrlKey);
        };

        const handleKeyboardActivateItem = (index: number) => {
          // istanbul ignore else
          if (this.state.keyboardEditorCellKey) {
            const columnIndex = this.getColumnIndexFromKey(this.state.keyboardEditorCellKey);
            // istanbul ignore else
            if (0 <= columnIndex && columnIndex < this.state.columns.length) {
              const columnDescription = this.state.columns[columnIndex].columnDescription;
              // istanbul ignore else
              if (columnDescription && columnDescription.editable)
                this.activateCellEditor(index, columnIndex, this.state.keyboardEditorCellKey);
            }

          }
        };

        const handleCrossAxisArrowKey = (forward: boolean) => {
          // istanbul ignore else
          if (this.state.keyboardEditorCellKey) {
            let newEditorCellKey: string | undefined;
            const columnIndex = this.getColumnIndexFromKey(this.state.keyboardEditorCellKey);

            // istanbul ignore else
            if (columnIndex >= 0) {
              let newColIndex = columnIndex;

              while (!newEditorCellKey) {
                if (forward)
                  newColIndex++;
                else
                  newColIndex--;

                if (newColIndex < 0)
                  newColIndex = this.state.columns.length - 1;
                else if (newColIndex >= this.state.columns.length)
                  newColIndex = 0;

                // istanbul ignore next
                if (newColIndex === columnIndex)
                  break;

                const isEditable = this.state.columns[newColIndex].columnDescription.editable;
                if (isEditable)
                  newEditorCellKey = this.state.columns[newColIndex].key;
              }

              // istanbul ignore else
              if (newEditorCellKey)
                this.setState({ keyboardEditorCellKey: newEditorCellKey });
            }
          }
        };

        const itemKeyboardNavigator = new ItemKeyboardNavigator(handleKeyboardSelectItem, handleKeyboardActivateItem);
        itemKeyboardNavigator.orientation = Orientation.Vertical;
        itemKeyboardNavigator.allowWrap = false;
        itemKeyboardNavigator.itemCount = this.state.rowsCount;
        itemKeyboardNavigator.crossAxisArrowKeyHandler = handleCrossAxisArrowKey;

        const processedRow = this._rowSelectionHandler.processedItem ? this._rowSelectionHandler.processedItem /* istanbul ignore next */ : 0;
        keyDown ?
          itemKeyboardNavigator.handleKeyDownEvent(e, processedRow) :
          itemKeyboardNavigator.handleKeyUpEvent(e, processedRow);
      } else {
        const handleKeyboardSelectItem = (index: number) => {
          const processedCell = this._cellSelectionHandler.processedItem;
          // istanbul ignore else
          if (processedCell) {
            const cellKey = { rowIndex: index, columnKey: processedCell.columnKey };
            const selectionHandler = this.createCellItemSelectionHandler(cellKey);
            const selectionFunction = this._cellSelectionHandler.createSelectionFunction(this._cellComponentSelectionHandler, selectionHandler);
            selectionFunction(e.shiftKey, e.ctrlKey);
          }
        };

        const handleKeyboardActivateItem = (index: number) => {
          const processedCell = this._cellSelectionHandler.processedItem;
          // istanbul ignore else
          if (processedCell) {
            const columnIndex = this.getColumnIndexFromKey(processedCell.columnKey);
            // istanbul ignore else
            if (0 <= columnIndex && columnIndex < this.state.columns.length) {
              const columnDescription = this.state.columns[columnIndex].columnDescription;
              // istanbul ignore else
              if (columnDescription && columnDescription.editable)
                this.activateCellEditor(index, columnIndex, processedCell.columnKey);
            }
          }
        };

        const handleCrossAxisArrowKey = (forward: boolean) => {
          const processedCell = this._cellSelectionHandler.processedItem;
          // istanbul ignore else
          if (processedCell) {
            const columnIndex = this.getColumnIndexFromKey(processedCell.columnKey);
            // istanbul ignore else
            if (columnIndex >= 0) {
              let newColIndex = columnIndex;

              if (forward)
                newColIndex++;
              else
                newColIndex--;

              if (newColIndex < 0)
                newColIndex = this.state.columns.length - 1;
              else if (newColIndex >= this.state.columns.length)
                newColIndex = 0;

              const columnKey = this.state.columns[newColIndex].key;
              const cellKey = { rowIndex: processedCell.rowIndex, columnKey };
              const selectionHandler = this.createCellItemSelectionHandler(cellKey);
              const selectionFunction = this._cellSelectionHandler.createSelectionFunction(this._cellComponentSelectionHandler, selectionHandler);
              selectionFunction(e.shiftKey, e.ctrlKey);
            }
          }
        };

        const itemKeyboardNavigator = new ItemKeyboardNavigator(handleKeyboardSelectItem, handleKeyboardActivateItem);
        itemKeyboardNavigator.orientation = Orientation.Vertical;
        itemKeyboardNavigator.allowWrap = false;
        itemKeyboardNavigator.itemCount = this.state.rowsCount;
        itemKeyboardNavigator.crossAxisArrowKeyHandler = handleCrossAxisArrowKey;

        const processedRow = this._cellSelectionHandler.processedItem ? this._cellSelectionHandler.processedItem.rowIndex /* istanbul ignore next */ : 0;
        keyDown ?
          itemKeyboardNavigator.handleKeyDownEvent(e, processedRow) :
          itemKeyboardNavigator.handleKeyUpEvent(e, processedRow);
      }
    }
  };

  private _onKeyDown = (e: React.KeyboardEvent) => this._onKeyboardEvent(e, true);
  private _onKeyUp = (e: React.KeyboardEvent) => this._onKeyboardEvent(e, false);

  /** @internal */
  public override render() {
    const rowRenderer = <TableRowRenderer rowRendererCreator={() => this._createRowRenderer()} />;

    const visibleColumns = this._getVisibleColumns();
    const tableClassName = classnames(
      "components-table",
      this.props.className,
      {
        "hide-header": this.props.hideHeader,
        "striped-rows": this.props.stripedRows,
        "row-selection": this._tableSelectionTarget === TableSelectionTarget.Row,
        "cell-selection": this._tableSelectionTarget === TableSelectionTarget.Cell,
      },
    );

    return (
      <>
        <div className={tableClassName} style={this.props.style}
          onMouseDown={this._onMouseDown}
          onContextMenu={this.props.showHideColumns ? this._handleShowHideContextMenu : undefined}
          onKeyDown={this._onKeyDown}
          onKeyUp={this._onKeyUp}
          role="presentation"
        >
          {this.props.showHideColumns &&
            <ShowHideMenu
              opened={this.state.menuVisible}
              items={this.state.columns.map((column) => ({ id: column.key, label: column.reactDataGridColumn.name }))}
              x={this.state.menuX} y={this.state.menuY}
              initialHidden={this.state.hiddenColumns}
              onClose={this._hideContextMenu}
              onShowHideChange={this._handleShowHideChange} />
          }
          <ElementResizeObserver watchedElement={this.state.gridContainer}
            render={({ width, height }) => (
              <ReactDataGrid
                ref={this._gridRef}
                columns={visibleColumns}
                rowGetter={this._rowGetter}
                rowRenderer={rowRenderer}
                rowsCount={this.state.rowsCount}
                {...(this.props.reorderableColumns ? {
                  draggableHeaderCell: DragDropHeaderCell,
                  onHeaderDrop: this._onHeaderDrop,
                } as any : {})}
                minHeight={height}
                minWidth={width}
                headerRowHeight={TABLE_ROW_HEIGHT}
                rowHeight={TABLE_ROW_HEIGHT}
                onGridSort={this._handleGridSort}
                enableRowSelect={null}  // Prevent deprecation warning
                onAddFilter={this._handleFilterChange}
                onClearFilters={this._handleOnClearFilters} // eslint-disable-line @typescript-eslint/unbound-method
                headerFiltersHeight={TABLE_FILTER_ROW_HEIGHT}
                getValidFilterValues={this._getValidFilterValues}
                onScroll={this._onScroll}
              />
            )}
          />
        </div>
        <div ref={this._tableRef}>
          {this.state.dialog
            ?
            // istanbul ignore next
            <Dialog
              opened={true}
              onClose={this._onDialogClose}
              title={this.state.dialog.title}
              height={"50vh"}
            >
              {this.state.dialog.content}
            </Dialog>
            : undefined}
          {/* TODO: Enable, when table gets refactored. Explanation in ./../../properties/renderers/value/table/NonPrimitiveValueRenderer */}
          {/* {this.state.popup
            ?
            <Popup
              isShown={true}
              fixedPosition={this.state.popup.fixedPosition}
              position={Position.Top}
            >
              {this.state.popup.content}
            </Popup>
            :
            undefined} */}
        </div>
      </>
    );
  }
}

/**
 * Props for the [[TableRow]] component
 * @internal
 */
export interface TableRowProps extends CommonProps {
  cells: { [key: string]: React.ReactNode };
  isSelected?: boolean;
}

/**
 * Default component for rendering a row for the Table
 * @internal
 */
export class TableRow extends React.Component<TableRowProps> {

  /** @internal */
  public override render() {
    const { cells, isSelected, ...props } = this.props;
    return (
      <ReactDataGrid.Row {...props} row={cells} isSelected={isSelected} />
    );
  }
}
