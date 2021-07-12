/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as sinon from "sinon";
import * as React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MultiValueFilter } from "../../../../ui-components/table/columnfiltering/multi-value-filter/MultiValueFilter";
import { ReactDataGridColumn, TableColumn } from "../../../../ui-components/table/component/TableColumn";
import { FilterableColumn, TableDistinctValue } from "../../../../ui-components/table/columnfiltering/ColumnFiltering";
import { ColumnDescription } from "../../../../ui-components/table/TableDataProvider";
import { TestFilterableTable } from "../../../TestUtils";

// cSpell:ignore columnfiltering

describe("MultiValueFilter", () => {
  let fakeTimers: sinon.SinonFakeTimers;
  const columnDescriptions: ColumnDescription[] = [
    {
      key: "multi-value1",
      label: "Multi-Value1",
      showDistinctValueFilters: true,
      showFieldFilters: true,
      filterCaseSensitive: false,
    },
    {
      key: "multi-value2",
      label: "Multi-Value2",
      showDistinctValueFilters: true,
      showFieldFilters: true,
      filterCaseSensitive: true,
    },
  ];
  const reactDataGridColumns: ReactDataGridColumn[] = [
    {
      key: columnDescriptions[0].key,
      name: columnDescriptions[0].label,
      filterRenderer: MultiValueFilter,
      filterable: true,
    },
    {
      key: columnDescriptions[1].key,
      name: columnDescriptions[1].label,
      filterRenderer: MultiValueFilter,
      filterable: true,
    },
  ];
  const testTable = new TestFilterableTable(columnDescriptions);
  const filterableColumn0: FilterableColumn = new TableColumn(testTable, columnDescriptions[0], reactDataGridColumns[0]);
  reactDataGridColumns[0].filterableColumn = filterableColumn0;
  const filterableColumn1: FilterableColumn = new TableColumn(testTable, columnDescriptions[1], reactDataGridColumns[1]);
  reactDataGridColumns[1].filterableColumn = filterableColumn1;
  reactDataGridColumns[1].filterableColumn.columnFilterDescriptor.distinctFilter.addDistinctValue("multi-value 1");

  const filterValueCount = 15;
  const getValidFilterValues = (_columnKey: string): any[] => {
    const values: TableDistinctValue[] = [];
    for (let index = 0; index < filterValueCount; index++) {
      values.push({ value: `multi-value ${index + 1}`, label: `Multi-Value ${index + 1}` });
    }
    return values;
  };

  const testChecked = (cbs: HTMLInputElement[], testResult: number): void => {
    let checked = 0;
    cbs.forEach((cb) => { if (cb.checked) checked++; });
    expect(checked).to.eq(testResult);
  };

  beforeEach(() => {
    fakeTimers = sinon.useFakeTimers();
  });

  afterEach(() => {
    fakeTimers.restore();
    cleanup();
  });

  it("renders filter Ui", () => {
    const spy = sinon.spy();
    const component = render(<MultiValueFilter onChange={spy} column={reactDataGridColumns[0]} getValidFilterValues={getValidFilterValues} />);
    expect(component.getByTestId("components-multi-value-filter")).to.exist;
  });

  it("clicking opens popup", () => {
    const spy = sinon.spy();
    const component = render(<MultiValueFilter onChange={spy} column={reactDataGridColumns[0]} getValidFilterValues={getValidFilterValues} />);
    expect(component.getByTestId("components-multi-value-filter")).to.exist;

    const button = component.container.querySelector(".components-popup-button");
    expect(button).to.exist;
    fireEvent.click(button!);

    expect(component.queryAllByTestId("core-chk-listboxitem-checkbox").length).to.eq(filterValueCount);
  });

  it("entering Search text limits values shown", async () => {
    const spy = sinon.spy();
    const component = render(<MultiValueFilter onChange={spy} column={reactDataGridColumns[0]} getValidFilterValues={getValidFilterValues} />);
    expect(component.getByTestId("components-multi-value-filter")).to.exist;

    const button = component.container.querySelector(".components-popup-button");
    expect(button).to.exist;
    fireEvent.click(button!);

    const searchBox = component.queryByTestId("core-searchbox-input") as HTMLInputElement;
    expect(searchBox).to.exist;

    let searchText = "6";
    fireEvent.change(searchBox, { target: { value: searchText } });
    expect(searchBox.value).to.be.equal(searchText);
    await fakeTimers.tickAsync(500);
    expect(component.queryAllByTestId("core-chk-listboxitem-checkbox").length).to.eq(1);

    searchText = "multi-value";
    fireEvent.change(searchBox, { target: { value: searchText } });
    expect(searchBox.value).to.be.equal(searchText);
    await fakeTimers.tickAsync(500);
    expect(component.queryAllByTestId("core-chk-listboxitem-checkbox").length).to.eq(filterValueCount);
  });

  it("entering Search text limits values shown for caseSensitive", async () => {
    const spy = sinon.spy();
    const component = render(<MultiValueFilter onChange={spy} column={reactDataGridColumns[1]} getValidFilterValues={getValidFilterValues} />);
    expect(component.getByTestId("components-multi-value-filter")).to.exist;

    const button = component.container.querySelector(".components-popup-button");
    expect(button).to.exist;
    fireEvent.click(button!);

    const checkboxes = component.queryAllByTestId("core-chk-listboxitem-checkbox") as HTMLInputElement[];
    expect(checkboxes.length).to.eq(filterValueCount);
    testChecked(checkboxes, 1);   // Because we populated the distinctFilter with one entry for reactDataGridColumns[1]

    const searchBox = component.queryByTestId("core-searchbox-input") as HTMLInputElement;
    expect(searchBox).to.exist;

    let searchText = "multi-value";
    fireEvent.change(searchBox, { target: { value: searchText } });
    expect(searchBox.value).to.be.equal(searchText);
    await fakeTimers.tickAsync(500);
    expect(component.queryAllByTestId("core-chk-listboxitem-checkbox").length).to.eq(0);

    searchText = "Multi-Value";
    fireEvent.change(searchBox, { target: { value: searchText } });
    expect(searchBox.value).to.be.equal(searchText);
    await fakeTimers.tickAsync(500);
    expect(component.queryAllByTestId("core-chk-listboxitem-checkbox").length).to.eq(filterValueCount);
  });

  it("checking a value then pressing Filter will filter results", async () => {
    const spy = sinon.spy();
    const component = render(<MultiValueFilter onChange={spy} column={reactDataGridColumns[0]} getValidFilterValues={getValidFilterValues} />);
    expect(component.getByTestId("components-multi-value-filter")).to.exist;

    const button = component.container.querySelector(".components-popup-button");
    expect(button).to.exist;
    fireEvent.click(button!);

    const checkboxes = component.queryAllByTestId("core-chk-listboxitem-checkbox");
    expect(checkboxes.length).to.eq(filterValueCount);

    fireEvent.click(checkboxes[0]);
    const filterButton = component.getByTestId("components-multi-value-button-filter");
    fireEvent.click(filterButton);

    spy.calledOnce.should.true;
  });

  it("checking multiple values then pressing Filter will filter results", async () => {
    const spy = sinon.spy();
    const component = render(<MultiValueFilter onChange={spy} column={reactDataGridColumns[0]} getValidFilterValues={getValidFilterValues} />);
    expect(component.getByTestId("components-multi-value-filter")).to.exist;

    const button = component.container.querySelector(".components-popup-button");
    expect(button).to.exist;
    fireEvent.click(button!);

    const checkboxes = component.queryAllByTestId("core-chk-listboxitem-checkbox");
    expect(checkboxes.length).to.eq(filterValueCount);

    // Test with less than 10
    const testCount = 4;
    for (let index = 0; index < testCount; index++) {
      fireEvent.click(checkboxes[index]);
    }
    const filterButton = component.getByTestId("components-multi-value-button-filter");
    fireEvent.click(filterButton);

    spy.calledOnce.should.true;
  });

  it("checking multiple values then pressing Filter will filter results", async () => {
    const spy = sinon.spy();
    const component = render(<MultiValueFilter onChange={spy} column={reactDataGridColumns[0]} getValidFilterValues={getValidFilterValues} />);
    expect(component.getByTestId("components-multi-value-filter")).to.exist;

    const button = component.container.querySelector(".components-popup-button");
    expect(button).to.exist;
    fireEvent.click(button!);

    const checkboxes = component.queryAllByTestId("core-chk-listboxitem-checkbox");
    expect(checkboxes.length).to.eq(filterValueCount);

    // Test with more than 10
    const testCount = 12;
    for (let index = 0; index < testCount; index++) {
      fireEvent.click(checkboxes[index]);
    }
    const filterButton = component.getByTestId("components-multi-value-button-filter");
    fireEvent.click(filterButton);

    spy.calledOnce.should.true;
  });

  it("checking a value then pressing Clear will uncheck all", async () => {
    const spy = sinon.spy();
    const component = render(<MultiValueFilter onChange={spy} column={reactDataGridColumns[0]} getValidFilterValues={getValidFilterValues} />);
    expect(component.getByTestId("components-multi-value-filter")).to.exist;

    const button = component.container.querySelector(".components-popup-button");
    expect(button).to.exist;
    fireEvent.click(button!);

    const checkboxes = component.queryAllByTestId("core-chk-listboxitem-checkbox") as HTMLInputElement[];
    expect(checkboxes.length).to.eq(filterValueCount);
    testChecked(checkboxes, 0);

    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    testChecked(checkboxes, 2);
    fireEvent.click(checkboxes[1]);
    testChecked(checkboxes, 1);

    const clearButton = component.getByTestId("components-multi-value-button-clear");
    fireEvent.click(clearButton);
    testChecked(checkboxes, 0);

    const filterButton = component.getByTestId("components-multi-value-button-filter");
    fireEvent.click(filterButton);

    spy.calledOnce.should.true;
  });

  it("pressing Cancel will not filter results", async () => {
    const spy = sinon.spy();
    const component = render(<MultiValueFilter onChange={spy} column={reactDataGridColumns[0]} getValidFilterValues={getValidFilterValues} />);
    expect(component.getByTestId("components-multi-value-filter")).to.exist;

    const button = component.container.querySelector(".components-popup-button");
    expect(button).to.exist;
    fireEvent.click(button!);

    const cancelButton = component.getByTestId("components-multi-value-button-cancel");
    fireEvent.click(cancelButton);

    spy.calledOnce.should.false;
  });

  it("clicking SelectAll will select all checkboxes", async () => {
    const spy = sinon.spy();
    const component = render(<MultiValueFilter onChange={spy} column={reactDataGridColumns[0]} getValidFilterValues={getValidFilterValues} />);
    expect(component.getByTestId("components-multi-value-filter")).to.exist;

    const button = component.container.querySelector(".components-popup-button");
    expect(button).to.exist;
    fireEvent.click(button!);

    const checkboxes = component.queryAllByTestId("core-chk-listboxitem-checkbox") as HTMLInputElement[];
    expect(checkboxes.length).to.eq(filterValueCount);
    testChecked(checkboxes, 0);

    const selectAllButton = component.getByTestId("components-multi-value-filter-selectAll");
    fireEvent.click(selectAllButton);
    testChecked(checkboxes, filterValueCount);

    fireEvent.click(checkboxes[0]);
    testChecked(checkboxes, filterValueCount - 1);

    fireEvent.click(selectAllButton);
    testChecked(checkboxes, filterValueCount);

    fireEvent.click(checkboxes[0]);
    testChecked(checkboxes, filterValueCount - 1);
    fireEvent.click(checkboxes[0]);
    testChecked(checkboxes, filterValueCount);

    fireEvent.click(selectAllButton);
    testChecked(checkboxes, 0);

    fireEvent.click(checkboxes[0]);
    testChecked(checkboxes, 1);
    fireEvent.click(checkboxes[0]);
    testChecked(checkboxes, 0);
  });
});
