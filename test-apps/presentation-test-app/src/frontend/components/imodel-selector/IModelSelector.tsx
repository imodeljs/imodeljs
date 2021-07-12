/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import "./IModelSelector.css";
import * as React from "react";
import { IModelApp, IModelConnection } from "@bentley/imodeljs-frontend";
import { Select, SelectOption } from "@bentley/ui-core";
import { MyAppFrontend } from "../../api/MyAppFrontend";

export interface Props {
  onIModelSelected: (imodel?: IModelConnection, path?: string) => void;
  activeIModelPath?: string;
}

export interface State {
  activeIModel?: IModelConnection;
  availableImodels: SelectOption[];
  error?: any;
}

export class IModelSelector extends React.Component<Props, State> {

  constructor(props: Props) {
    super(props);
    this.state = { availableImodels: [] };
  }

  public override async componentDidMount() {
    const imodels = await MyAppFrontend.getSampleImodels();
    imodels.splice(0, 0, "");
    this.setState({
      availableImodels: imodels.map((path: string) => ({
        label: path.split(/[\\/]/).pop() ?? "",
        value: path,
      })),
    });
    if (this.props.activeIModelPath && imodels.includes(this.props.activeIModelPath)) {
      await this.doOpenIModel(this.props.activeIModelPath);
    }
  }

  private async doOpenIModel(imodelPath: string) {
    if (this.state.activeIModel) {
      await this.state.activeIModel.close();
    }

    let imodel: IModelConnection | undefined;
    if (imodelPath) {
      try {
        imodel = await MyAppFrontend.openIModel(imodelPath);
        this.setState({ activeIModel: imodel, error: undefined });
      } catch (err) {
        this.setState({ activeIModel: undefined, error: err });
      }
    }
    this.props.onIModelSelected(imodel, imodelPath);
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private onImodelSelected = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    await this.doOpenIModel(e.currentTarget.value);
  };

  public override render() {
    let error = null;
    if (this.state.error)
      error = (<div className="Error">{IModelApp.i18n.translate("Sample:controls.notifications.error")}: {this.state.error.message}</div>);

    return (
      <div className="IModelSelector">
        <Select
          options={this.state.availableImodels}
          defaultValue={this.props.activeIModelPath}
          placeholder={IModelApp.i18n.translate("Sample:controls.notifications.select-imodel")}
          onChange={this.onImodelSelected}
        />
        {error}
      </div>
    );
  }
}
