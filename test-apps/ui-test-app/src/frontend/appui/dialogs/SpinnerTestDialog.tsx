/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { Dialog, FillCentered, LoadingSpinner, Spinner, SpinnerSize } from "@bentley/ui-core";

export interface SpinnerTestDialogProps {
  opened: boolean;
}

export interface SpinnerTestDialogState {
  opened: boolean;
}

export class SpinnerTestDialog extends React.Component<SpinnerTestDialogProps, SpinnerTestDialogState> {
  public override readonly state: Readonly<SpinnerTestDialogState>;
  private _title = IModelApp.i18n.translate("SampleApp:buttons.spinnerTestDialog");

  constructor(props: SpinnerTestDialogProps) {
    super(props);
    this.state = {
      opened: this.props.opened,
    };
  }

  public override render(): JSX.Element {
    return (
      <Dialog
        title={this._title}
        opened={this.state.opened}
        modal={true}
        width={470}
        height={700}
        onClose={this._handleCancel}
        onEscape={this._handleCancel}
        onOutsideClick={this._handleCancel}
      >
        <div style={{ display: "flex", flexDirection: "row", marginBottom: "5px" }}>
          <span style={{ flex: "1", marginRight: "5px" }}>
            <FillCentered>
              <Spinner size={SpinnerSize.XLarge} />
              <Spinner size={SpinnerSize.Large} />
              <Spinner size={SpinnerSize.Medium} />
              <Spinner size={SpinnerSize.Small} />
            </FillCentered>
          </span>
          <span style={{ flex: "1", marginLeft: "5px" }}>
            <FillCentered>
              <Spinner size={SpinnerSize.XLarge} />
              <Spinner size={SpinnerSize.Large} />
              <Spinner size={SpinnerSize.Medium} />
              <Spinner size={SpinnerSize.Small} />
            </FillCentered>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "row", marginBottom: "5px" }}>
          <span style={{ flex: "1", marginRight: "5px" }}>
            <FillCentered>
              <Spinner size={SpinnerSize.XLarge} />
              <Spinner size={SpinnerSize.Large} />
              <Spinner size={SpinnerSize.Medium} />
              <Spinner size={SpinnerSize.Small} />
            </FillCentered>
          </span>
          <span style={{ flex: "1", marginLeft: "5px" }}>
            <FillCentered>
              <Spinner size={SpinnerSize.XLarge} />
              <Spinner size={SpinnerSize.Large} />
              <Spinner size={SpinnerSize.Medium} />
              <Spinner size={SpinnerSize.Small} />
            </FillCentered>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "row", marginBottom: "5px" }}>
          <span style={{ flex: "1", marginRight: "5px" }}>
            <FillCentered>
              <Spinner size={SpinnerSize.XLarge} />
              <Spinner size={SpinnerSize.Large} />
              <Spinner size={SpinnerSize.Medium} />
              <Spinner size={SpinnerSize.Small} />
            </FillCentered>
          </span>
          <span style={{ flex: "1", marginLeft: "5px" }}>
            <FillCentered>
              <Spinner size={SpinnerSize.XLarge} />
              <Spinner size={SpinnerSize.Large} />
              <Spinner size={SpinnerSize.Medium} />
              <Spinner size={SpinnerSize.Small} />
            </FillCentered>
          </span>
        </div>
        <br />
        <div style={{ display: "flex", flexDirection: "row" }}>
          <span style={{ flex: "1", marginRight: "5px" }}>
            <div style={{ border: "1px solid black", marginBottom: "10px" }}>
              <LoadingSpinner size={SpinnerSize.XLarge} message="This is a LoadingSpinner" />
            </div>
            <div style={{ border: "1px solid black", marginBottom: "10px" }}>
              <LoadingSpinner size={SpinnerSize.Large} message="This is a LoadingSpinner" />
            </div>
            <div style={{ border: "1px solid black", marginBottom: "10px" }}>
              <LoadingSpinner size={SpinnerSize.Medium} message="This is a LoadingSpinner" />
            </div>
            <div style={{ border: "1px solid black" }}>
              <LoadingSpinner size={SpinnerSize.Small} message="This is a LoadingSpinner" />
            </div>
          </span>
          <span style={{ flex: "1", marginLeft: "5px" }}>
            <div style={{ border: "1px solid black", marginBottom: "10px" }}>
              <LoadingSpinner size={SpinnerSize.XLarge} message="This is a LoadingSpinner" messageOnTop={true} />
            </div>
            <div style={{ border: "1px solid black", marginBottom: "10px" }}>
              <LoadingSpinner size={SpinnerSize.Large} message="This is a LoadingSpinner" messageOnTop={true} />
            </div>
            <div style={{ border: "1px solid black", marginBottom: "10px" }}>
              <LoadingSpinner size={SpinnerSize.Medium} message="This is a LoadingSpinner" messageOnTop={true} />
            </div>
            <div style={{ border: "1px solid black" }}>
              <LoadingSpinner size={SpinnerSize.Small} message="This is a LoadingSpinner" messageOnTop={true} />
            </div>
          </span>
        </div>
      </Dialog >
    );
  }

  private _handleCancel = () => {
    this._closeDialog();
  };

  private _closeDialog = () => {
    this.setState({
      opened: false,
    });
  };
}
