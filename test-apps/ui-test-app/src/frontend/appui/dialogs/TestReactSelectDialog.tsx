/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { Dialog, LabeledThemedSelect, ThemedSelect } from "@bentley/ui-core";
import { ModalDialogManager } from "@bentley/ui-framework";
import { DialogButtonType } from "@bentley/ui-abstract";

enum ColorOptions {
  Red,
  White,
  Blue,
  Yellow,
  Orange,
}

const colorChoices = [
  { label: "Red", value: ColorOptions.Red },
  { label: "White", value: ColorOptions.White },
  { label: "Blue", value: ColorOptions.Blue },
  { label: "Yellow", value: ColorOptions.Yellow },
  { label: "Orange", value: ColorOptions.Orange },
];

const cityChoices = [
  { label: "London", value: "London" },
  { label: "Paris", value: "Paris" },
  { label: "Stockholm", value: "Stockholm" },
  { label: "Berlin", value: "Berlin" },
  { label: "Mumbai", value: "Mumbai" },
  { label: "Christchurch", value: "Christchurch" },
  { label: "Johannesburg", value: "Johannesburg" },
  { label: "Beijing", value: "Beijing" },
  { label: "New York", value: "New York" },
];

interface TestReactSelectDialogProps {
  opened: boolean;
  onResult?: (result: DialogButtonType) => void;
}

interface TestReactSelectDialogState {
  opened: boolean;
  movable: boolean;
  resizable: boolean;
  overlay: boolean;

}

export class TestReactSelectDialog extends React.Component<TestReactSelectDialogProps, TestReactSelectDialogState> {
  public override readonly state: Readonly<TestReactSelectDialogState>;
  constructor(props: TestReactSelectDialogProps) {
    super(props);
    this.state = {
      opened: this.props.opened,
      movable: true,
      resizable: true,
      overlay: true,
    };
  }
  public override render(): JSX.Element {
    return (<Dialog
      title={"React-Select Modal Dialog"}
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
      minHeight={300}
      maxHeight={600}
      maxWidth={600}
    >
      <div className="modal-react-select-dialog">
        <div><label className="label-data">Color: </label><ThemedSelect options={colorChoices} /></div>
        <div><label className="label-data">Choose Cities: </label><ThemedSelect isMulti={true} isSearchable={true} options={cityChoices} /></div>
        <div><LabeledThemedSelect label={"Labeled ThemedSelect Multi"} isMulti={true} isSearchable={true} options={cityChoices} /></div>
      </div>
    </Dialog>
    );
  }

  private _handleOK = () => {
    this._closeDialog(() => {
    });
  };

  private _handleCancel = () => {
    this._closeDialog(() => {
      if (this.props.onResult)
        this.props.onResult(DialogButtonType.Cancel);
    });
  };

  private _closeDialog = (followUp: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.setState({
      opened: false,
    }, () => {
      if (!this.state.opened)
        ModalDialogManager.closeDialog();
      followUp();
    });
  };
}
