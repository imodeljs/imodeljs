/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./ViewportDialog.scss";
import * as React from "react";
import { Id64String } from "@bentley/bentleyjs-core";
import { IModelApp, IModelConnection, ScreenViewport } from "@bentley/imodeljs-frontend";
import { ViewportComponent } from "@bentley/ui-components";
import { FillCentered, LoadingSpinner } from "@bentley/ui-core";
import { ModelessDialog, ModelessDialogManager, ViewSelector, ViewSelectorChangedEventArgs } from "@bentley/ui-framework";
import { ExternalIModel } from "../ExternalIModel";

export interface ViewportDialogProps {
  opened: boolean;
  projectName: string;
  imodelName: string;
  dialogId: string;
}

export interface ViewportDialogState {
  opened: boolean;
  viewId?: Id64String;
  iModelConnection?: IModelConnection;
}

export class ViewportDialog extends React.Component<ViewportDialogProps, ViewportDialogState> {
  private _loading = IModelApp.i18n.translate("SampleApp:Test.loading");
  private _viewport: ScreenViewport | undefined;

  public override readonly state: Readonly<ViewportDialogState>;

  constructor(props: ViewportDialogProps) {
    super(props);
    this.state = {
      opened: this.props.opened,
    };
  }

  public override async componentDidMount() {
    const externalIModel = new ExternalIModel(this.props.projectName, this.props.imodelName);
    await externalIModel.openIModel();

    if (externalIModel.viewId && externalIModel.iModelConnection) {
      this.setState({
        viewId: externalIModel.viewId,
        iModelConnection: externalIModel.iModelConnection,
      });
    }

    ViewSelector.onViewSelectorChangedEvent.addListener(this._handleViewSelectorChangedEvent);
  }

  public override componentWillUnmount() {
    ViewSelector.onViewSelectorChangedEvent.removeListener(this._handleViewSelectorChangedEvent);
  }

  private _handleViewSelectorChangedEvent = (args: ViewSelectorChangedEventArgs) => {
    if (this._viewport === IModelApp.viewManager.selectedView) {
      this.setState({
        viewId: args.viewDefinitionId,
        iModelConnection: args.iModelConnection,
      });
    }
  };

  public override render(): JSX.Element {

    /* Demo values */
    const width = 400;
    const height = 300;
    const x = window.innerWidth - width - 50;
    const y = window.innerHeight - height - 50;

    return (
      <ModelessDialog
        className="viewport-dialog"
        title={this.props.dialogId}
        opened={this.state.opened}
        resizable={true}
        movable={true}
        width={width} height={height}
        x={x} y={y}
        minWidth={200} minHeight={100}
        onClose={() => this._handleClose()}
        onEscape={() => this._handleClose()}
        inset={false}
        dialogId={this.props.dialogId}
      >
        <div className="viewport-dialog-container" >
          {this.getContent()}
        </div>
      </ModelessDialog >
    );
  }

  private getContent(): React.ReactNode {
    let content: React.ReactNode;

    if (this.state.viewId === undefined || this.state.iModelConnection === undefined)
      content = (
        <FillCentered> <LoadingSpinner message={this._loading} /> </FillCentered>
      );
    else
      content = (
        <ViewportComponent
          viewDefinitionId={this.state.viewId}
          imodel={this.state.iModelConnection}
          viewportRef={(v: ScreenViewport) => { this._viewport = v; }} />
      );

    return content;
  }

  private _handleClose = () => {
    this._closeDialog(() => {
    });
  };

  private _closeDialog = (followUp: () => void) => {
    this.setState(() => ({
      opened: false,
    }), () => {
      if (!this.state.opened)
        ModelessDialogManager.closeDialog(this.props.dialogId);
      followUp();
    });
  };
}
