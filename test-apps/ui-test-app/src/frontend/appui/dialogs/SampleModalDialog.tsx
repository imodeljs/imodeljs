/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { Dialog, DialogButtonType } from "@bentley/ui-core";

export interface SampleModalDialogProps {
  opened: boolean;
  onResult?: (result: DialogButtonType) => void;
}

export interface SampleModalDialogState {
  opened: boolean;
}

export class SampleModalDialog extends React.Component<SampleModalDialogProps, SampleModalDialogState> {
  public override readonly state: Readonly<SampleModalDialogState>;
  private _title = IModelApp.i18n.translate("SampleApp:buttons.sampleModalDialog");

  constructor(props: SampleModalDialogProps) {
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
        width={450}
        height={300}
        onClose={this._handleCancel}
        onEscape={this._handleCancel}
        onOutsideClick={this._handleCancel}
        buttonCluster={[
          { type: DialogButtonType.OK, onClick: this._handleOK },
          { type: DialogButtonType.Cancel, onClick: this._handleCancel },
        ]}
      >
        Lorem ipsum dolor sit amet, posse imperdiet ius in, mundi cotidieque ei per.
        Vel scripta ornatus assentior cu. Duo nonumy equidem te, per ad malis deserunt consetetur.
        In per invidunt conceptam. Ea pri aeque corrumpit. Eum ea ipsum perfecto vulputate, an cum oblique ornatus.
      </Dialog >
    );
  }

  private _handleOK = () => {
    this._closeDialog(() => this.props.onResult && this.props.onResult(DialogButtonType.OK));
  };

  private _handleCancel = () => {
    this._closeDialog(() => this.props.onResult && this.props.onResult(DialogButtonType.Cancel));
  };

  private _closeDialog = (followUp: () => void) => {
    this.setState(
      { opened: false },
      () => followUp());
  };
}
