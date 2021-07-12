/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { LoremIpsum } from "lorem-ipsum";
import { Dialog } from "@bentley/ui-core";
import { DialogButtonType } from "@bentley/ui-abstract";
import { Checkbox, Input } from "@itwin/itwinui-react";

export interface TestModalDialogProps {
  opened: boolean;
  onResult?: (result: DialogButtonType) => void;
}

export interface TestModalDialogState {
  opened: boolean;
  movable: boolean;
  resizable: boolean;
  overlay: boolean;
  testInput: string;
}

export class TestModalDialog extends React.Component<TestModalDialogProps, TestModalDialogState> {
  public override readonly state: Readonly<TestModalDialogState>;
  private _paragraphs: string[] = [];

  constructor(props: TestModalDialogProps) {
    super(props);
    this.state = {
      opened: this.props.opened,
      movable: false,
      resizable: false,
      overlay: true,
      testInput: "",
    };

    const lorem = new LoremIpsum();
    for (let i = 0; i < 4; i++)
      this._paragraphs.push(lorem.generateWords(40));
  }

  private handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    this.setState({ testInput: e.target.value });
  };

  public override render(): JSX.Element {
    // cspell:disable
    return (
      <Dialog
        title={"Modal Dialog"}
        opened={this.state.opened}
        resizable={this.state.resizable}
        movable={this.state.movable}
        modal={this.state.overlay}
        buttonCluster={[
          { type: DialogButtonType.OK, onClick: this._handleOK },
          { type: DialogButtonType.Cancel, onClick: this._handleCancel },
        ]}
        onClose={this._handleCancel}
        onEscape={this._handleCancel}
        minHeight={"300px"}
        minWidth={"500px"}
        maxHeight={"600px"}
        maxWidth={"1000px"}
        onOutsideClick={this._handleCancel}
        trapFocus={true}
      >
        <p>{this._paragraphs[0]}</p>
        <p>{this._paragraphs[1]}</p>
        <p>{this._paragraphs[2]}</p>
        <p>{this._paragraphs[3]}</p>
        {/* Input box below is used to test focus trap processing */}
        <Input onChange={this.handleChange} />
        <p>
          <Checkbox checked={this.state.movable} label="Movable" onChange={(_) => { this.setState((prevState) => ({ movable: !prevState.movable })); }} />
          <br />
          <Checkbox checked={this.state.resizable} label="Resizable" onChange={(_) => { this.setState((prevState) => ({ resizable: !prevState.resizable })); }} />
          <br />
          <Checkbox checked={this.state.overlay} label="Modal" onChange={(_) => { this.setState((prevState) => ({ overlay: !prevState.overlay })); }} />
        </p>
      </Dialog>
    );
    // cspell:enable
  }

  private _handleOK = () => {
    this._closeDialog(() => {
      if (this.props.onResult)
        this.props.onResult(DialogButtonType.OK);
    });
  };

  private _handleCancel = () => {
    this._closeDialog(() => {
      if (this.props.onResult)
        this.props.onResult(DialogButtonType.Cancel);
    });
  };

  private _closeDialog = (_followUp: () => void) => {
    this.setState({
      opened: false,
    });
  };
}
