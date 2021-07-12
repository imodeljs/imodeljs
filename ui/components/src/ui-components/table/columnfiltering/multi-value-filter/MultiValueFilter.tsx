/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import "./MultiValueFilter.scss";
import React from "react";
import { CheckBoxState, CheckListBox, CheckListBoxItem, SearchBox, UiCore } from "@bentley/ui-core";
import { Button, Checkbox } from "@itwin/itwinui-react";
import { PopupButton, PopupContent } from "../../../editors/PopupButton";
import { ReactDataGridColumn } from "../../component/TableColumn";
import { UiComponents } from "../../../UiComponents";
import { FilterCompositionLogicalOperator, TableDistinctValue } from "../ColumnFiltering";
import { FieldFilterData, MultiValueFilterData } from "../DataGridFilterParser";

function contains(valueA: string, valueB: string, caseSensitive: boolean): boolean {
  // istanbul ignore next
  if (!valueA || !valueB || valueB.length > valueA.length)
    return false;

  if (caseSensitive)
    return valueA.indexOf(valueB, 0) !== -1;

  return valueA.toLocaleUpperCase().indexOf(valueB.toLocaleUpperCase(), 0) !== -1;
}

/** @internal */
export interface MultiValueFilterProps {
  onChange: (args: { filterTerm: any, column: ReactDataGridColumn }) => void;
  column: ReactDataGridColumn;
  getValidFilterValues: (key: string) => any[];
  placeholder?: string;
}

/** @internal */
export function MultiValueFilter(props: MultiValueFilterProps) {
  const [clearLabel] = React.useState(() => UiCore.translate("general.clear"));
  const [filterLabel] = React.useState(() => UiComponents.translate("button.label.filter"));
  const [cancelLabel] = React.useState(() => UiCore.translate("dialog.cancel"));
  const [searchLabel] = React.useState(() => UiComponents.translate("button.label.search"));
  const [selectAllLabel] = React.useState(() => UiComponents.translate("button.label.selectAll"));
  const [distinctFilter] = React.useState(() => props.column.filterableColumn!.columnFilterDescriptor.distinctFilter);
  const [buttonLabel, setButtonLabel] = React.useState<string | undefined>(undefined);
  const [buttonTooltip, setButtonTooltip] = React.useState<string | undefined>(undefined);
  const [searchText, setSearchText] = React.useState("");
  const [selectAllState, setSelectAllState] = React.useState(CheckBoxState.Off);
  const [filterCaseSensitive] = React.useState(() => !!props.column.filterableColumn!.filterCaseSensitive);
  const [showDistinctValueFilters] = React.useState(() => !!props.column.filterableColumn!.showDistinctValueFilters);
  const popupButtonRef = React.useRef<PopupButton>(null);

  const distinctValues = React.useMemo((): TableDistinctValue[] => {
    let options = props.getValidFilterValues(props.column.key);
    options = options.map((o: any) => {
      // istanbul ignore next
      if (typeof o === "string") {
        return { value: o, label: o };
      }
      return o;
    });
    return options;
  }, [props]);

  const checkedValues = React.useMemo((): TableDistinctValue[] => {
    const values = new Array<TableDistinctValue>();
    for (const distinctValue of distinctValues) {
      if (distinctFilter.tryFindDescriptor(distinctValue.value) !== undefined)
        values.push(distinctValue);
    }
    return values;
  }, [distinctValues, distinctFilter]);

  const [checkedDistinctValues, setCheckedDistinctValues] = React.useState<TableDistinctValue[]>(() => checkedValues);

  React.useEffect(() => {
    setCheckedDistinctValues(checkedValues);
  }, [checkedValues]);

  const handleClear = React.useCallback(() => {
    checkedDistinctValues.length = 0;
    const newValues = checkedDistinctValues.slice();
    setCheckedDistinctValues(newValues);
    setSelectAllState(CheckBoxState.Off);
  }, [checkedDistinctValues]);

  const closePopup = () => {
    // istanbul ignore else
    if (popupButtonRef.current)
      popupButtonRef.current.closePopup();
  };

  const handleApplyFilter = React.useCallback(() => {
    const filterData: MultiValueFilterData = {
      distinctValues: new Array<TableDistinctValue>(),
      fieldValues: new Array<FieldFilterData>(),
      fieldLogicalOperator: FilterCompositionLogicalOperator.And,
    };

    for (const checkedDistinctValue of checkedDistinctValues) {
      filterData.distinctValues.push(checkedDistinctValue);
    }

    closePopup();
    setSearchText("");

    let label: string | undefined;
    if (checkedDistinctValues.length === 1)
      label = checkedDistinctValues[0].label;
    else if (checkedDistinctValues.length > 1)
      label = `${checkedDistinctValues[0].label} (+${checkedDistinctValues.length - 1})`;
    setButtonLabel(label);

    let tooltip: string | undefined;
    if (checkedDistinctValues.length > 1) {
      const lineBreak = "\u000d\u000a";
      const maxTooltipValues = 10;
      const shownTooltipValues = Math.min(10, checkedDistinctValues.length);
      tooltip = checkedDistinctValues[0].label;
      for (let index = 1; index < shownTooltipValues; index++) {
        tooltip += `${lineBreak}${checkedDistinctValues[index].label}`;
      }
      if (checkedDistinctValues.length > shownTooltipValues) {
        tooltip += `${lineBreak}(+${checkedDistinctValues.length - maxTooltipValues})`;
      }
    }
    setButtonTooltip(tooltip);

    props.onChange({ filterTerm: filterData, column: props.column });
  }, [props, checkedDistinctValues]);

  const handleCancel = React.useCallback(() => {
    closePopup();
    setSearchText("");
  }, []);

  const handleSearchValueChanged = React.useCallback((value: string): void => {
    setSearchText(value);
  }, []);

  const handleSelectAllChanged = React.useCallback((_e: React.ChangeEvent<HTMLInputElement>) => {
    let newState = CheckBoxState.On;
    if (selectAllState === CheckBoxState.Off || selectAllState === CheckBoxState.Partial) {
      const newValues = distinctValues.slice();
      setCheckedDistinctValues(newValues);
      newState = CheckBoxState.On;
    } else {
      checkedDistinctValues.length = 0;
      const newValues = checkedDistinctValues.slice();
      setCheckedDistinctValues(newValues);
      newState = CheckBoxState.Off;
    }
    setSelectAllState(newState);
  }, [checkedDistinctValues, distinctValues, selectAllState]);

  const handleCheckboxChanged = React.useCallback((e: React.ChangeEvent<HTMLInputElement>, distinctValue: TableDistinctValue) => {
    const index = checkedDistinctValues.indexOf(distinctValue);
    const newCheckedValues = checkedDistinctValues.slice();
    if (e.target.checked) {
      // istanbul ignore else
      if (index === -1)
        newCheckedValues.push(distinctValue);
    } else {
      // istanbul ignore else
      if (index !== -1)
        newCheckedValues.splice(index, 1);
    }
    setCheckedDistinctValues(newCheckedValues);

    let newSelectAllState = CheckBoxState.Partial;
    if (newCheckedValues.length === distinctValues.length)
      newSelectAllState = CheckBoxState.On;
    else if (newCheckedValues.length === 0)
      newSelectAllState = CheckBoxState.Off;
    setSelectAllState(newSelectAllState);
  }, [checkedDistinctValues, distinctValues]);

  const checkBoxItems = React.useMemo((): JSX.Element[] => {
    const items = distinctValues
      .filter((distinctValue: TableDistinctValue) => {
        return (searchText.length === 0 || contains(distinctValue.label, searchText, filterCaseSensitive));
      })
      .map((distinctValue: TableDistinctValue, i: number) => {
        const checked = checkedDistinctValues.find((checkedDistinctValue) => checkedDistinctValue.value === distinctValue.value) !== undefined;
        return (
          <CheckListBoxItem key={i} label={distinctValue.label} checked={checked}
            onChange={(e) => handleCheckboxChanged(e, distinctValue)} />
        );
      });
    return items;
  }, [checkedDistinctValues, distinctValues, handleCheckboxChanged, searchText, filterCaseSensitive]);

  const disableSelectAll = checkBoxItems.length !== distinctValues.length;

  return (
    <div data-testid="components-multi-value-filter">
      <PopupButton placeholder={props.placeholder || filterLabel}
        label={buttonLabel}
        title={buttonTooltip}
        closeOnEnter={false}
        setFocus={false}
        moveFocus={false}
        ref={popupButtonRef}
      >
        <PopupContent>
          {showDistinctValueFilters &&
            <div>
              <div className="components-multi-value-filter-searchbox">
                <SearchBox placeholder={searchLabel} onValueChanged={handleSearchValueChanged} valueChangedDelay={250} />
              </div>
              <div className="components-multi-value-filter-selectAll">
                <Checkbox
                  label={selectAllLabel} checked={selectAllState === CheckBoxState.On} indeterminate={selectAllState === CheckBoxState.Partial}
                  onChange={handleSelectAllChanged} disabled={disableSelectAll}
                  data-testid="components-multi-value-filter-selectAll" />
              </div>
              <div className="components-multi-value-filter-distinct-values">
                <CheckListBox>
                  {checkBoxItems}
                </CheckListBox>
              </div>
            </div>
          }
          <div className="components-multi-value-buttons">
            <Button size="small" onClick={handleClear} data-testid="components-multi-value-button-clear">{clearLabel}</Button>
            <Button size="small" styleType="cta" onClick={handleApplyFilter} data-testid="components-multi-value-button-filter">{filterLabel}</Button>
            <Button size="small" onClick={handleCancel} data-testid="components-multi-value-button-cancel">{cancelLabel}</Button>
          </div>
        </PopupContent>
      </PopupButton>
    </div>
  );
}
