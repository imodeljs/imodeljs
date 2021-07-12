/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Filtering
 */

import "./ResultSelector.scss";
import classnames from "classnames";
import * as React from "react";
import { SpecialKey } from "@bentley/ui-abstract";
import { CommonProps } from "@bentley/ui-core";
import { UiComponents } from "../UiComponents";

/** [[ResultSelector]] React Component state
 * @internal
 */
interface ResultSelectorState {
  /** Currently selected result/entry index */
  selectedResultId: number;
  /** Input string */
  selectedResultEdit: string;
  /** Informs if selectedResult is currently being edited */
  selectedResultInEditMode: boolean;
}

/** [[ResultSelector]] React Component properties
 * @public
 */
export interface ResultSelectorProps extends CommonProps {
  /** Total number of results/entries */
  resultCount: number;
  /** Callback to currently selected result/entry change */
  onSelectedChanged: (index: number) => void;
}

/** Component for stepping through results/entries
 * @public
 */
export class ResultSelector extends React.PureComponent<ResultSelectorProps, ResultSelectorState> {
  private _ofLabel = UiComponents.translate("general.of");

  /** @internal */
  constructor(props: ResultSelectorProps) {
    super(props);
    this.state = {
      selectedResultId: props.resultCount ? 1 : 0,
      selectedResultEdit: "",
      selectedResultInEditMode: false,
    };
  }

  private _onClickPrevious = () => {
    if (this.state.selectedResultInEditMode) {
      this._onSelectedResultConfirmed();
      return;
    }
    if (this.state.selectedResultId > 1) {
      this.props.onSelectedChanged(this.state.selectedResultId - 1);
      this.setState((state) => ({ selectedResultId: state.selectedResultId - 1 }));
    }
  };

  private _onClickNext = () => {
    if (this.state.selectedResultInEditMode) {
      this._onSelectedResultConfirmed();
      return;
    }
    if (this.state.selectedResultId < this.props.resultCount) {
      this.props.onSelectedChanged(this.state.selectedResultId + 1);
      this.setState((state) => ({ selectedResultId: state.selectedResultId + 1 }));
    }
  };

  private get _maxSelectedResultInputLength() {
    return this.props.resultCount.toString().length;
  }

  private _onSelectedResultChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.value.length <= this._maxSelectedResultInputLength)
      this.setState({ selectedResultEdit: event.target.value });
  };

  private _onSelectedResultConfirmed = () => {
    let selectedId = +this.state.selectedResultEdit;
    if (selectedId > this.props.resultCount)
      selectedId = this.props.resultCount;
    else if (selectedId < 1)
      selectedId = 1;

    this.setState({ selectedResultInEditMode: false, selectedResultId: selectedId });
    this.props.onSelectedChanged(selectedId);
  };

  private _onSelectedResultClick = () => {
    this.setState((state) => ({
      selectedResultInEditMode: true,
      selectedResultEdit: state.selectedResultId.toString(),
    }));
  };

  private _onSelectedResultKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === SpecialKey.Enter)
      this._onSelectedResultConfirmed();
  };

  /** @internal */
  public override componentDidMount() {
    this.props.onSelectedChanged(this.props.resultCount ? 1 : 0);
  }

  /** @internal */
  public override componentDidUpdate(prevProps: ResultSelectorProps) {
    if (this.props.resultCount !== prevProps.resultCount) {
      this.props.onSelectedChanged(this.props.resultCount ? 1 : 0);
    }
  }

  /** @internal */
  public override render() {
    return (
      <span className={classnames("components-result-selector", this.props.className)} style={this.props.style}>
        <button className={classnames("components-result-selector-button", "icon", "icon-chevron-left")}
          onClick={this._onClickPrevious}
          disabled={this.props.resultCount <= 0} />

        <span style={{ pointerEvents: this.props.resultCount ? "auto" : "none" }}
          className="components-result-selector-current-result"
          onClick={this._onSelectedResultClick} role="presentation">
          {this.state.selectedResultInEditMode ?
            <input type="number"
              style={{ width: `${this.state.selectedResultEdit.length * 0.60 + 1}em` }}
              value={this.state.selectedResultEdit}
              onChange={this._onSelectedResultChanged}
              onBlur={this._onSelectedResultConfirmed}
              onKeyDown={this._onSelectedResultKeyDown} /> :
            this.state.selectedResultId}
          <span style={{ marginLeft: "5px", marginRight: "5px" }}>{this._ofLabel}</span>
          <span>{this.props.resultCount}</span>
        </span>

        <button className="components-result-selector-button icon icon-chevron-right"
          onClick={this._onClickNext}
          disabled={this.props.resultCount <= 0} />
      </span>
    );
  }
}
