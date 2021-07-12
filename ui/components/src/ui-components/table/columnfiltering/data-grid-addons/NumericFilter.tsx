/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
* This code has been adapted from
* [react-data-grid-addons](https://github.com/adazzle/react-data-grid/tree/master/packages/react-data-grid-addons).
*--------------------------------------------------------------------------------------------*/

import React from "react";
import { UiComponents } from "../../../UiComponents";
import { ReactDataGridColumn } from "../../component/TableColumn";
import { NumericFilterRule, NumericFilterType } from "../DataGridFilterParser";

/** @internal */
export interface NumericFilterProps {
  onChange: (args: { filterTerm: any, column: ReactDataGridColumn }) => void;
  column: ReactDataGridColumn;
  placeholder?: string;
}

/* istanbul ignore next */
/** @internal */
export class NumericFilter extends React.Component<NumericFilterProps> {
  private _tooltipText = UiComponents.translate("table.filter.numericTooltip");      // "Input Methods: Range (x-y), Greater Then (>x), Less Then (<y)";
  private _placeholder = UiComponents.translate("table.filter.numericPlaceholder");  // "e.g. 3,10-15,>20"

  constructor(props: NumericFilterProps) {
    super(props);
  }

  private getRules(value: string) {
    const rules: NumericFilterRule[] = [];
    if (value === "") {
      return rules;
    }
    // check comma
    const list = value.split(",");
    if (list.length > 0) {
      // handle each value with comma
      list.forEach((obj) => {
        if (obj.indexOf("-") > 0) { // handle dash
          const begin = parseFloat(obj.split("-")[0]);
          const end = parseFloat(obj.split("-")[1]);
          rules.push({ type: NumericFilterType.Range, begin, end });
        } else if (obj.indexOf(">") > -1) { // handle greater then
          const begin = parseFloat(obj.split(">")[1]);
          rules.push({ type: NumericFilterType.GreaterThan, value: begin });
        } else if (obj.indexOf("<") > -1) { // handle less then
          const end = parseFloat(obj.split("<")[1]);
          rules.push({ type: NumericFilterType.LessThan, value: end });
        } else { // handle normal values
          const numericValue = parseFloat(obj);
          rules.push({ type: NumericFilterType.ExactMatch, value: numericValue });
        }
      });
    }
    return rules;
  }

  private _handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => { // Validate the input
    const regex = ">|<|-|,|.|([0-9])";
    const result = RegExp(regex).test(e.key);
    if (result === false) {
      e.preventDefault();
    }
  };

  private _handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const filters = this.getRules(value);
    this.props.onChange({ filterTerm: (filters.length > 0 ? filters : null), column: this.props.column });
  };

  public override render() {
    const inputKey = `header-filter-${this.props.column.key}`;
    const columnStyle: React.CSSProperties = {
      float: "left",
      marginRight: 5,
      maxWidth: "80%",
    };
    const badgeStyle: React.CSSProperties = {
      cursor: "help",
    };

    return (
      <div>
        <div style={columnStyle}>
          <input key={inputKey} type="text" placeholder={this.props.placeholder || this._placeholder} className="form-control input-sm"
            onChange={this._handleChange} onKeyPress={this._handleKeyPress} />
        </div>
        <div className="input-sm">
          <span className="badge" style={badgeStyle} title={this._tooltipText}>?</span>
        </div>
      </div>
    );
  }
}
