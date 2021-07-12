/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { Id64String } from "@bentley/bentleyjs-core";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { ConfigurableCreateInfo, ConfigurableUiManager, WidgetControl } from "@bentley/ui-framework";
import { ActiveSettingsManager, iModelInfoAvailableEvent } from "../../../api/ActiveSettingsManager";

interface ActiveSettingsComponentState {
  modelId: Id64String | undefined;
  categoryId: Id64String | undefined;
}

export class ActiveSettingsComponent extends React.Component<{}, ActiveSettingsComponentState> {

  constructor(props?: any, context?: any) {
    super(props, context);
    this.state = { modelId: "", categoryId: "" };
    iModelInfoAvailableEvent.addListener(this.updateState, this);
  }

  private updateState() {
    this.setState((prev) => ({ ...prev, modelId: IModelApp.toolAdmin.activeSettings.model, categoryId: IModelApp.toolAdmin.activeSettings.category }));
  }

  private get activeModelName(): string {
    if (IModelApp.toolAdmin.activeSettings.model === undefined)
      return "";
    return ActiveSettingsManager.models.getNameFromId(IModelApp.toolAdmin.activeSettings.model) || "";
  }

  private get activeCategoryName(): string {
    if (IModelApp.toolAdmin.activeSettings.category === undefined)
      return "";
    return ActiveSettingsManager.categories.getNameFromId(IModelApp.toolAdmin.activeSettings.category) || "";
  }

  private getAllModels(): JSX.Element[] {
    return ActiveSettingsManager.models.cache.map((nid) =>
      <option id={nid.id} key={nid.id}>{nid.name}</option>,
    );
  }

  private onSelectModel(event: React.FormEvent<HTMLSelectElement>) {
    IModelApp.toolAdmin.activeSettings.model = event.currentTarget.options[event.currentTarget.selectedIndex].id;
    this.updateState();
  }

  private getAllCategories(): JSX.Element[] {
    return ActiveSettingsManager.categories.cache.map((nid) =>
      <option id={nid.id} key={nid.id}>{nid.name}</option>,
    );
  }

  private onSelectCategory(event: React.FormEvent<HTMLSelectElement>) {
    IModelApp.toolAdmin.activeSettings.category = event.currentTarget.options[event.currentTarget.selectedIndex].id;
    this.updateState();
  }

  public override render() {
    if (ActiveSettingsManager.models === undefined || ActiveSettingsManager.categories === undefined)
      return <div>...</div>;
    return (
      <div>
        <h2>Active Settings</h2>
        <table>
          <tbody>
            <tr>
              <td>Model</td>
              <td><select title="Active Model" value={this.activeModelName} onChange={(e) => this.onSelectModel(e)} >
                {this.getAllModels()}
              </select>
              </td>
            </tr>
            <tr>
              <td>Category</td>
              <td><select title="Active Category" value={this.activeCategoryName} onChange={(e) => this.onSelectCategory(e)} >
                {this.getAllCategories()}
              </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div >
    );
  }

}

export class ActiveSettingsWidget extends WidgetControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactNode = <ActiveSettingsComponent />;
  }
}
ConfigurableUiManager.registerControl("ActiveSettings", ActiveSettingsWidget);
