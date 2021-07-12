/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from "@bentley/imodeljs-frontend";
import { Dialog, Icon } from "@bentley/ui-core";
import { Calculator, ModalDialogManager } from "@bentley/ui-framework";

export interface CalculatorDialogProps {
  opened: boolean;
}

export interface CalculatorDialogState {
  opened: boolean;
}

export class CalculatorDialog extends React.Component<CalculatorDialogProps, CalculatorDialogState> {
  public override readonly state: Readonly<CalculatorDialogState>;

  constructor(props: CalculatorDialogProps) {
    super(props);
    this.state = {
      opened: this.props.opened,
    };
  }

  public override render(): JSX.Element {
    return (
      <Dialog
        title={"Calculator"}
        opened={this.state.opened}
        modal={false}
        onClose={() => this._handleClose()}
        onEscape={() => this._handleClose()}
        width={186}
        maxHeight={500}
      >
        <Calculator resultIcon={<Icon iconSpec="icon-placeholder" />} onOk={this._handleOk} onCancel={this._handleClose} />
      </Dialog>
    );
  }

  private _handleOk = (value: number) => {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Calculated value is ${value}`));
    this._handleClose();
  };

  private _handleClose = () => {
    this.setState({ opened: false }, () => {
      ModalDialogManager.closeDialog();
    });
  };

  public override componentDidUpdate(oldProps: CalculatorDialogProps) {
    if (oldProps.opened !== this.props.opened) {
      this.setState((_, props) => ({ opened: props.opened }));
    }
  }
}
