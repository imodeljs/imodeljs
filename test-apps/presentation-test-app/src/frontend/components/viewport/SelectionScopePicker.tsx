/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { SelectionScope } from "@bentley/presentation-common";
import { Presentation } from "@bentley/presentation-frontend";

export interface SelectionScopePickerProps {
  imodel: IModelConnection;
}
export interface SelectionScopePickerState {
  availableSelectionScopes?: SelectionScope[];
  activeScopeId?: string;
}
export default class SelectionScopePicker extends React.Component<SelectionScopePickerProps, SelectionScopePickerState> {
  constructor(props: SelectionScopePickerProps) {
    super(props);
    this.state = {
      activeScopeId: (typeof Presentation.selection.scopes.activeScope === "string") ? Presentation.selection.scopes.activeScope : Presentation.selection.scopes.activeScope?.id,
    };
  }
  public override componentDidMount() {
    this.initAvailableSelectionScopes(); // eslint-disable-line @typescript-eslint/no-floating-promises
  }
  private async initAvailableSelectionScopes() {
    const scopes = await Presentation.selection.scopes.getSelectionScopes(this.props.imodel);
    // note: the functional selection scope is currently 'hidden' - we need to manually add it here
    scopes.push({ id: "functional-element", label: "Functional Element", description: "Selected associated functional element" });
    scopes.push({ id: "functional-assembly", label: "Functional Assembly", description: "Selected associated functional assembly" });
    scopes.push({ id: "functional-top-assembly", label: "Functional Top Assembly", description: "Selected associated functional top assembly" });
    this.setState({ availableSelectionScopes: scopes });
  }
  public override componentDidUpdate(prevProps: SelectionScopePickerProps, _prevState: SelectionScopePickerState) {
    if (this.props.imodel !== prevProps.imodel) {
      this.setState({ availableSelectionScopes: undefined });
      this.initAvailableSelectionScopes(); // eslint-disable-line @typescript-eslint/no-floating-promises
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private onSelectedScopeChanged = (e: React.ChangeEvent<HTMLSelectElement>) => {
    Presentation.selection.scopes.activeScope = e.target.value;
    this.setState({ activeScopeId: e.target.value });
  };
  public override render() {
    if (!this.state.availableSelectionScopes || 0 === this.state.availableSelectionScopes.length)
      return null;
    return (
      <div className="SelectionScopePicker">
        {/* eslint-disable-next-line jsx-a11y/no-onchange */}
        <select onChange={this.onSelectedScopeChanged} value={this.state.activeScopeId}>
          {this.state.availableSelectionScopes.map((scope: SelectionScope) => (<option
            value={scope.id}
            key={scope.id}
          >
            {scope.label}
          </option>))}
        </select>
      </div>
    );
  }
}
