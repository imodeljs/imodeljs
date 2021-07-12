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
        height={500}
        onClose={this._handleCancel}
        onEscape={this._handleCancel}
        onOutsideClick={this._handleCancel}
      >
        <div style={{ display: "flex", flexDirection: "row", marginBottom: "5px" }}>
          <span style={{ flex: "1", marginRight: "5px" }}>
            <FillCentered>
              {/* eslint-disable-next-line deprecation/deprecation */}
              <Spinner size={SpinnerSize.XLarge} />
              {/* eslint-disable-next-line deprecation/deprecation */}
              <Spinner size={SpinnerSize.Large} />
              {/* eslint-disable-next-line deprecation/deprecation */}
              <Spinner size={SpinnerSize.Medium} />
              {/* eslint-disable-next-line deprecation/deprecation */}
              <Spinner size={SpinnerSize.Small} />
            </FillCentered>
          </span>
          <span style={{ flex: "1", marginLeft: "5px" }}>
            <FillCentered>
              {/* eslint-disable-next-line deprecation/deprecation */}
              <Spinner size={SpinnerSize.XLarge} />
              {/* eslint-disable-next-line deprecation/deprecation */}
              <Spinner size={SpinnerSize.Large} />
              {/* eslint-disable-next-line deprecation/deprecation */}
              <Spinner size={SpinnerSize.Medium} />
              {/* eslint-disable-next-line deprecation/deprecation */}
              <Spinner size={SpinnerSize.Small} />
            </FillCentered>
          </span>
        </div>
        <br />
        <div style={{ display: "flex", flexDirection: "row" }}>
          <span style={{ flex: "1", marginRight: "5px" }}>
            <div style={{ border: "1px solid black", marginBottom: "10px" }}>
              <LoadingSpinner size="large" message="This is a LoadingSpinner" />
            </div>
            <div style={{ border: "1px solid black", marginBottom: "10px" }}>
              <LoadingSpinner size="" message="This is a LoadingSpinner" />
            </div>
            <div style={{ border: "1px solid black", marginBottom: "10px" }}>
              <LoadingSpinner size="small" message="This is a LoadingSpinner" />
            </div>
            <div style={{ border: "1px solid black" }}>
              <LoadingSpinner size="x-small" message="This is a LoadingSpinner" />
            </div>
          </span>
          <span style={{ flex: "1", marginLeft: "5px" }}>
            <div style={{ border: "1px solid black", marginBottom: "10px" }}>
              <LoadingSpinner size="large" message="This is a LoadingSpinner" messageOnTop={true} />
            </div>
            <div style={{ border: "1px solid black", marginBottom: "10px" }}>
              <LoadingSpinner size="" message="This is a LoadingSpinner" messageOnTop={true} />
            </div>
            <div style={{ border: "1px solid black", marginBottom: "10px" }}>
              <LoadingSpinner size="small" message="This is a LoadingSpinner" messageOnTop={true} />
            </div>
            <div style={{ border: "1px solid black" }}>
              <LoadingSpinner size="x-small" message="This is a LoadingSpinner" messageOnTop={true} />
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
