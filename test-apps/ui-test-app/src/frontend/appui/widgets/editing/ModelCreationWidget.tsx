/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import {
  EditingFunctions,
  IModelApp, MessageBoxIconType, MessageBoxType, NotifyMessageDetails, OutputMessagePriority, SpatialViewState,
} from "@bentley/imodeljs-frontend";
import { ConfigurableCreateInfo, ConfigurableUiManager, UiFramework, WidgetControl } from "@bentley/ui-framework";
import { ActiveSettingsManager } from "../../../api/ActiveSettingsManager";
import { ErrorHandling } from "../../../api/ErrorHandling";
import { Button } from "@itwin/itwinui-react";

const modelNameId = "ui-test-app-modelcreation-modelname";

interface ModelCreationComponentState {
  haveName: boolean;
}

export class ModelCreationComponent extends React.Component<{}, ModelCreationComponentState> {

  constructor(props?: any, context?: any) {
    super(props, context);
    this.state = { haveName: false };
  }

  private get modelNameInput(): HTMLElement | null {
    return document.getElementById(modelNameId);
  }

  private get modelName(): string {
    return (this.modelNameInput as any).value;
  }

  private set modelName(v: string) {
    (this.modelNameInput as any).value = v;
  }

  private onNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    const modelName = (event.target as any).value;
    this.setState((prev) => ({ ...prev, haveName: (modelName.length !== 0) }));
  }

  /* eslint-disable deprecation/deprecation */
  private async createNewModel() {
    const iModel = UiFramework.getIModelConnection();
    if (iModel === undefined || !iModel.isRemoteBriefcaseConnection())
      return;
    const modelName = this.modelName;
    if (modelName === "")
      return;
    const editing = new EditingFunctions(iModel);
    const modelCode = await editing.codes.makeModelCode(iModel.models.repositoryModelId, modelName);
    const viewport = IModelApp.viewManager.selectedView;
    if (viewport === undefined)
      return;
    if (!(viewport.view instanceof SpatialViewState)) {
      await IModelApp.notifications.openMessageBox(MessageBoxType.Ok, "Must be in a Spatial View", MessageBoxIconType.Critical);
      return;
    }

    try {
      const modelId = await editing.models.createAndInsertPhysicalModel(modelCode);
      await iModel.saveChanges("");

      await viewport.addViewedModels([modelId]);
      ActiveSettingsManager.onModelCreated(modelId, modelName, true);

      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `${modelName} created.`));

      this.modelName = "";
      this.setState((prev) => ({ ...prev, haveName: false }));

    } catch (err) {
      ErrorHandling.onUnexpectedError(err);
    }
  }

  public override render() {
    return (
      <div>
        <h2>Create Model</h2>
        <label htmlFor={modelNameId}>Name: </label>
        <input id={modelNameId} type="text" onChange={(ev) => this.onNameChange(ev)} />
        <p></p>
        <Button styleType="cta" onClick={async () => this.createNewModel()} disabled={!this.state.haveName}>
          Create Model
        </Button>
      </div >
    );
  }

}

export class ModelCreationWidget extends WidgetControl {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);

    this.reactNode = <ModelCreationComponent />;
  }
}
ConfigurableUiManager.registerControl("ModelCreation", ModelCreationWidget);
