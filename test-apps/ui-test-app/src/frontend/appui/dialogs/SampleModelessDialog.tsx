/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { ModelessDialog, ModelessDialogManager } from "@bentley/ui-framework";

export interface SampleModelessDialogProps {
  opened: boolean;
  dialogId: string;
  onClose?: () => void;
  movable?: boolean;
}

export interface SampleModelessDialogState {
  opened: boolean;
}

export class SampleModelessDialog extends React.Component<SampleModelessDialogProps, SampleModelessDialogState> {
  public override readonly state: Readonly<SampleModelessDialogState>;
  private _title = IModelApp.i18n.translate("SampleApp:buttons.sampleModelessDialog");

  constructor(props: SampleModelessDialogProps) {
    super(props);
    this.state = {
      opened: this.props.opened,
    };
  }

  public override render(): JSX.Element {
    return (
      <ModelessDialog
        title={this._title}
        opened={this.state.opened}
        dialogId={this.props.dialogId}
        width={450}
        height={300}
        movable={this.props.movable}
        onClose={this._handleCancel}
        onEscape={this._handleCancel}
      /* onOutsideClick={this._handleCancel} */
      >
        {/*  cSpell:disable */}
        Lorem ipsum dolor sit amet, posse imperdiet ius in, mundi cotidieque ei per.
        Vel scripta ornatus assentior cu. Duo nonumy equidem te, per ad malis deserunt consetetur.
        In per invidunt conceptam. Ea pri aeque corrumpit. Eum ea ipsum perfecto vulputate, an cum oblique ornatus.
        {/*  cSpell:enable */}
      </ModelessDialog >
    );
  }

  private _handleCancel = () => {
    this._closeDialog();
  };

  private _closeDialog = () => {
    this.setState(
      { opened: false },
      () => {
        if (this.props.onClose)
          this.props.onClose();
        else
          ModelessDialogManager.closeDialog(this.props.dialogId);
      }
    );
  };
}
