/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { LoremIpsum } from "lorem-ipsum";
import * as React from "react";
import {
  AlternateDateFormats, BasePropertyEditorParams, DateFormatter, InputEditorSizeParams, Primitives, PropertyDescription,
  PropertyEditorInfo, PropertyEditorParamTypes, PropertyRecord, PropertyValue, PropertyValueFormat, RangeEditorParams,
  SliderEditorParams, StandardEditorNames, StandardTypeNames, TimeDisplay,
} from "@bentley/ui-abstract";
import {
  ColumnDescription, FilterRenderer, LessGreaterOperatorProcessor,
  PropertyUpdatedArgs, RowItem, SelectionMode, SimpleTableDataProvider,
  Table, TableCellContextMenuArgs, TableCellUpdatedArgs, TableDataProvider, TableSelectionTarget, TypeConverter, TypeConverterManager,
} from "@bentley/ui-components";
import { ConfigurableCreateInfo, ConfigurableUiManager, ContentControl } from "@bentley/ui-framework";
import { Input, Select, SelectOption, ToggleSwitch } from "@itwin/itwinui-react";
import { BodyText, Gap } from "@bentley/ui-core";

class TableExampleContentControl extends ContentControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactNode = <TableExampleContent />;
  }
}

interface TableExampleState {
  dataProvider?: TableDataProvider;
  selectionMode: SelectionMode;
  tableSelectionTarget: TableSelectionTarget;
  selectedIndexes: any[];
  requestedTopRow: number;
  topRow: number;
  filtering: boolean;
  useUtc: boolean;
}

const createPropertyRecord = (value: any, column: ColumnDescription, typename: string, editor?: PropertyEditorInfo) => {
  const v: PropertyValue = {
    valueFormat: PropertyValueFormat.Primitive,
    value,
    displayValue: value,
  };
  const pd: PropertyDescription = {
    typename,
    name: column.key,
    displayLabel: column.label,
    editor,
  };
  column.propertyDescription = pd;
  return new PropertyRecord(v, pd);
};

const createDatePropertyRecord = (value: any, column: ColumnDescription, option: number) => {
  const v: PropertyValue = {
    valueFormat: PropertyValueFormat.Primitive,
    value,
  };

  let typename = StandardTypeNames.DateTime;
  let converter: any;

  switch (option) {
    case 0:
      typename = StandardTypeNames.DateTime;
      break;
    case 1:
      typename = StandardTypeNames.ShortDate;
      break;
    case 2:
      typename = StandardTypeNames.DateTime;
      converter = { options: { timeDisplay: TimeDisplay.H24M } }; // DateTime with 24hr time
      break;
    case 3:
      typename = StandardTypeNames.DateTime;
      converter = { options: { timeDisplay: TimeDisplay.H24MS } }; // DateTime with 24hr time
      break;
    case 4:
      typename = StandardTypeNames.DateTime;
      converter = { options: { timeDisplay: TimeDisplay.H12MSC } }; // DateTime with 12hr time
      break;
    case 5:
      typename = StandardTypeNames.ShortDate;
      converter = { name: "mm-dd-yyyy" };
      break;
    case 6:
      typename = StandardTypeNames.DateTime;
      converter = { options: { alternateDateFormat: AlternateDateFormats.IsoDateTime } };
      break;
    case 7:
      typename = StandardTypeNames.ShortDate;
      converter = { options: { alternateDateFormat: AlternateDateFormats.IsoShort } };
      break;
    case 8:
      typename = StandardTypeNames.ShortDate;
      converter = { options: { alternateDateFormat: AlternateDateFormats.UtcShort } };
      break;
    case 9:
      typename = StandardTypeNames.ShortDate;
      converter = { options: { alternateDateFormat: AlternateDateFormats.UtcShortWithDay } };
      break;
    case 10:
      typename = StandardTypeNames.DateTime;
      converter = { options: { alternateDateFormat: AlternateDateFormats.UtcDateTime } };
      break;
    case 11:
      typename = StandardTypeNames.DateTime;
      converter = { options: { alternateDateFormat: AlternateDateFormats.UtcDateTimeWithDay } };
      break;
  }

  const pd: PropertyDescription = {
    typename, // ShortDate | DateTime
    converter,
    name: column.key,
    displayLabel: column.label,
  };
  column.propertyDescription = pd;
  return new PropertyRecord(v, pd);
};

const createEnumPropertyRecord = (rowIndex: number, column: ColumnDescription) => {
  const value = rowIndex % 4;
  const v: PropertyValue = {
    valueFormat: PropertyValueFormat.Primitive,
    value,
    displayValue: value.toString(),
  };
  const pd: PropertyDescription = {
    typename: StandardTypeNames.Enum,
    name: column.key,
    displayLabel: column.label,
  };
  column.propertyDescription = pd;
  const enumPropertyRecord = new PropertyRecord(v, pd);
  enumPropertyRecord.property.enum = { choices: [], isStrict: false };
  enumPropertyRecord.property.enum.choices = [
    { label: "Yellow", value: 0 },
    { label: "Red", value: 1 },
    { label: "Green", value: 2 },
    { label: "Blue", value: 3 },
  ];
  return enumPropertyRecord;
};

const createLoremPropertyRecord = (column: ColumnDescription) => {
  const lorem = new LoremIpsum();
  const value = lorem.generateWords(5);

  const v: PropertyValue = {
    valueFormat: PropertyValueFormat.Primitive,
    value,
    displayValue: value,
  };

  const editorParams: BasePropertyEditorParams[] = [];
  const inputSizeParams: InputEditorSizeParams = {
    type: PropertyEditorParamTypes.InputEditorSize,
    size: 30,
  };
  editorParams.push(inputSizeParams);

  const pd: PropertyDescription = {
    typename: StandardTypeNames.Text,
    name: column.key,
    displayLabel: column.label,
    editor: { name: StandardEditorNames.MultiLine, params: editorParams },
  };
  column.propertyDescription = pd;
  return new PropertyRecord(v, pd);
};

export class TableExampleContent extends React.Component<{}, TableExampleState>  {
  public override readonly state: Readonly<TableExampleState>;

  private _columns: ColumnDescription[] = [
    {
      key: "id",
      label: "ID",
      resizable: true,
      sortable: true,
      width: 90,
      editable: true,
      filterable: true,
      filterRenderer: FilterRenderer.Numeric,
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      resizable: true,
      editable: true,
      filterable: true,
      filterRenderer: FilterRenderer.MultiSelect,
    },
    {
      key: "title",
      label: "Title",
      sortable: true,
      resizable: true,
      editable: true,
      filterable: true,
      filterRenderer: FilterRenderer.MultiValue,
    },
    {
      key: "color",
      label: "Color",
      sortable: true,
      resizable: true,
      editable: true,
      width: 180,
      filterable: true,
      filterRenderer: FilterRenderer.SingleSelect,
    },
    {
      key: "lorem",
      label: "Lorem",
      resizable: true,
      editable: true,
      filterable: true,
      filterRenderer: FilterRenderer.Text,
    },
  ];

  constructor(props: any) {
    super(props);

    this.state = {
      selectedIndexes: [],
      selectionMode: SelectionMode.Single,
      tableSelectionTarget: TableSelectionTarget.Row,
      requestedTopRow: 0,
      topRow: 0,
      filtering: true,
      useUtc: false,
    };
  }

  private loadData(useUtc: boolean) {
    const editorParams: BasePropertyEditorParams[] = [];
    const sliderParams: SliderEditorParams = {
      type: PropertyEditorParamTypes.Slider,
      minimum: 1,
      maximum: 100,
      step: 1,
      showTooltip: true,
      tooltipBelow: true,
    };
    const rangeParams: RangeEditorParams = {
      type: PropertyEditorParamTypes.Range,
      minimum: 1,
      maximum: 100,
    };
    editorParams.push(sliderParams);
    editorParams.push(rangeParams);

    const rows = new Array<RowItem>();
    for (let i = 1; i <= 1000 /* 00 */; i++) {
      const row: RowItem = { key: i.toString(), cells: [] };
      row.cells.push({
        key: this._columns[0].key,
        record: createPropertyRecord(i, this._columns[0], StandardTypeNames.Int, { name: StandardEditorNames.Slider, params: editorParams }),
      });
      const monthValue = i % 12;
      const dayValue = i % 28;
      const day = new Date();
      if (useUtc) {
        day.setUTCFullYear(2019, monthValue, dayValue);
        day.setUTCHours(0, 0, 0, 0);
      } else {
        day.setFullYear(2019, monthValue, dayValue);
        day.setHours(0, 0, 0, 0);
      }
      row.cells.push({
        key: this._columns[1].key,
        record: createDatePropertyRecord(day, this._columns[1], (i - 1) % 12), // 12 different options (0-11)
      });
      row.cells.push({
        key: this._columns[2].key,
        record: createPropertyRecord(`Title ${i}`, this._columns[2], StandardTypeNames.String),
      });
      row.cells.push({
        key: this._columns[3].key,
        record: createEnumPropertyRecord(i, this._columns[3]),
      });
      row.cells.push({
        key: this._columns[4].key,
        record: createLoremPropertyRecord(this._columns[4]),
      });
      rows.push(row);
    }

    const dataProvider = new SimpleTableDataProvider(this._columns);
    dataProvider.setItems(rows);
    this.setState({ dataProvider });
  }

  public override componentDidMount() {
    this.loadData(this.state.useUtc);
  }

  private _onChangeSelectionMode = (newValue: SelectionMode) => {
    this.setState({ selectionMode: newValue });
  };

  private _onChangeTableSelectionTarget = (newValue: TableSelectionTarget) => {
    this.setState({ tableSelectionTarget: newValue });
  };

  private _updatePropertyRecord(record: PropertyRecord, newValue: PropertyValue): PropertyRecord {
    return record.copyWithNewValue(newValue);
  }

  private _handlePropertyUpdated = async (propertyArgs: PropertyUpdatedArgs, cellArgs: TableCellUpdatedArgs): Promise<boolean> => {
    let updated = false;

    if (propertyArgs.propertyRecord) {
      propertyArgs.propertyRecord = this._updatePropertyRecord(propertyArgs.propertyRecord, propertyArgs.newValue);
      if (cellArgs.rowIndex >= 0) {
        const rowItem = await this.state.dataProvider!.getRow(cellArgs.rowIndex);
        if (rowItem) {
          const cellItem = rowItem.cells.find((cell) => cell.key === cellArgs.cellKey);
          if (cellItem) {
            cellItem.record = propertyArgs.propertyRecord;
            updated = true;
          }
        }
      }
    }

    return updated;
  };

  private _onRequestedTopRowChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let requestedTopRow = 0;
    if (e.target.value)
      requestedTopRow = parseInt(e.target.value, 10);
    this.setState({ requestedTopRow });
  };

  private _onScrollToRow = (topRowIndex: number) => {
    this.setState({ topRow: topRowIndex });
  };

  private _handleCellContextMenu = (args: TableCellContextMenuArgs) => {
    // eslint-disable-next-line no-console
    console.log(`rowIndex ${args.rowIndex}, colIndex ${args.colIndex}, cellKey ${args.cellKey}`);
  };

  private _onUtcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    this.setState({ useUtc: checked });
    this.loadData(checked);
  };

  private _onFilteringChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    this.setState({ filtering: checked });
    this._columns.forEach((column: ColumnDescription) => {
      column.filterable = checked;
    });
    if (this.state.dataProvider) {
      this.state.dataProvider.onColumnsChanged.raiseEvent();
      this.state.dataProvider.onRowsChanged.raiseEvent();
    }
  };

  private _selectionModes: SelectOption<SelectionMode>[] = [
    { value: SelectionMode.Single, label: "Single" },
    { value: SelectionMode.SingleAllowDeselect, label: "Single Allow Deselect" },
    { value: SelectionMode.Multiple, label: "Multiple" },
    { value: SelectionMode.Extended, label: "Extended" },
  ];

  private _selectionTargets: SelectOption<TableSelectionTarget>[] = [
    { value: TableSelectionTarget.Row, label: "Row" },
    { value: TableSelectionTarget.Cell, label: "Cell" },
  ];

  public override render(): React.ReactNode {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexFlow: "column" }}>
        <div style={{ display: "flex", alignItems: "center", height: "32px" }}>
          <Select onChange={this._onChangeSelectionMode} aria-label="Selection Mode" value={this.state.selectionMode} options={this._selectionModes} />
          <Gap />
          <Select onChange={this._onChangeTableSelectionTarget} aria-label="Selection Target" value={this.state.tableSelectionTarget} options={this._selectionTargets} />
          <Gap />
          <label>
            <BodyText>Top row:</BodyText>
            &nbsp;
            <Input onChange={this._onRequestedTopRowChange} style={{ width: "100px" }} />
            &nbsp;
            <span>({this.state.topRow})</span>
          </label>
          <Gap />
          <label style={{ display: "flex" }}>
            <BodyText>Filtering:</BodyText>
            &nbsp;
            <ToggleSwitch checked={this.state.filtering} onChange={this._onFilteringChange} title="Filtering" />
          </label>
          <Gap />
          <label style={{ display: "flex" }}>
            <BodyText>UTC:</BodyText>
            &nbsp;
            <ToggleSwitch checked={this.state.useUtc} onChange={this._onUtcChange} title="Use UTC in lieu of local time" />
          </label>
        </div>
        <div style={{ flex: "1", height: "calc(100% - 32px)" }}>
          {this.state.dataProvider &&
            <Table
              dataProvider={this.state.dataProvider}
              tableSelectionTarget={this.state.tableSelectionTarget}
              selectionMode={this.state.selectionMode}
              onPropertyUpdated={this._handlePropertyUpdated}
              scrollToRow={this.state.requestedTopRow}
              onScrollToRow={this._onScrollToRow}
              onCellContextMenu={this._handleCellContextMenu}
              stripedRows={true}
            />}
        </div>
      </div>
    );
  }
}

ConfigurableUiManager.registerControl("TableExampleContent", TableExampleContentControl);

/** An example formatter that both formats and parses dates. */
class MdyFormatter implements DateFormatter {
  private _formatter = new Intl.DateTimeFormat(undefined,
    {
      year: "numeric",    /* "2-digit", "numeric" */
      month: "2-digit",   /* "2-digit", "numeric", "narrow", "short", "long" */
      day: "2-digit",     /* "2-digit", "numeric" */
    });

  public formateDate(date: Date) {
    const formatParts = this._formatter.formatToParts(date);
    const month = formatParts.find((part) => part.type === "month")!.value;
    const day = formatParts.find((part) => part.type === "day")!.value;
    const year = formatParts.find((part) => part.type === "year")!.value;
    return `${month}-${day}-${year}`;
  }

  public parseDate(dateString: string) {
    const mdy = dateString.split("-").filter((value) => !!value);
    if (mdy.length !== 3) return undefined;
    const month = parseInt(mdy[0], 10);
    const day = parseInt(mdy[1], 10);
    const year = parseInt(mdy[2], 10);

    // validate
    if (isNaN(month) || month < 0 || month > 12) return undefined;
    if (isNaN(day) || day < 0 || day > 31) return undefined;
    if (isNaN(year) || year < 1800 || year > 2300) return undefined;

    return new Date(year, month - 1, day);
  }
}

/**
 * Custom Date Time Type Converter.
 */
class MmDdYyyDateTypeConverter extends TypeConverter implements LessGreaterOperatorProcessor {
  private _formatter = new MdyFormatter();

  public override convertToString(value?: Primitives.Value) {
    if (value === undefined)
      return "";

    if (typeof value === "string")
      value = new Date(value);

    if (value instanceof Date) {
      return this._formatter.formateDate(value);
    }

    return value.toString();
  }

  public override convertFromString(value: string) {
    if (!value)
      return undefined;

    return this._formatter.parseDate(value);
  }

  public override get isLessGreaterType(): boolean { return true; }

  public sortCompare(valueA: Date, valueB: Date, _ignoreCase?: boolean): number {
    return valueA.valueOf() - valueB.valueOf();
  }

  public override isEqualTo(valueA: Date, valueB: Date): boolean {
    return valueA.valueOf() === valueB.valueOf();
  }

  public override isNotEqualTo(valueA: Date, valueB: Date): boolean {
    return valueA.valueOf() !== valueB.valueOf();
  }

  public isLessThan(a: Date, b: Date): boolean {
    return a.valueOf() < b.valueOf();
  }

  public isLessThanOrEqualTo(a: Date, b: Date): boolean {
    return a.valueOf() <= b.valueOf();
  }

  public isGreaterThan(a: Date, b: Date): boolean {
    return a.valueOf() > b.valueOf();
  }

  public isGreaterThanOrEqualTo(a: Date, b: Date): boolean {
    return a.valueOf() >= b.valueOf();
  }
}

TypeConverterManager.registerConverter(StandardTypeNames.ShortDate, MmDdYyyDateTypeConverter, "mm-dd-yyyy");
