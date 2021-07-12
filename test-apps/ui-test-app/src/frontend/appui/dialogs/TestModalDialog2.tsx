/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./TestModalDialog2.scss";
import * as React from "react";
import { ColorDef } from "@bentley/imodeljs-common";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from "@bentley/imodeljs-frontend";
import { ColorPickerButton } from "@bentley/ui-components";
import { Dialog, DialogButtonType } from "@bentley/ui-core";

export interface TestModalDialog2Props {
  opened: boolean;
  onResult?: (result: DialogButtonType) => void;
}

export interface TestModalDialog2State {
  opened: boolean;
  movable: boolean;
  resizable: boolean;
  overlay: boolean;
  colors1: ColorDef[];
  colors2: ColorDef[];

}

export class TestModalDialog2 extends React.Component<TestModalDialog2Props, TestModalDialog2State> {
  public override readonly state: Readonly<TestModalDialog2State>;

  constructor(props: TestModalDialog2Props) {
    super(props);

    const redDef = ColorDef.from(255, 0, 0, 0);
    const blueDef = ColorDef.from(0, 0, 255, 0);
    const purpleDef = ColorDef.create("#800080");
    const greenDef = ColorDef.from(0, 255, 0, 0);

    this.state = {
      opened: this.props.opened,
      movable: true,
      resizable: true,
      overlay: true,
      colors1: [redDef, blueDef, purpleDef, greenDef],
      colors2: [redDef, blueDef, purpleDef, greenDef],
    };
  }

  private _handleColorChange1 = (color: ColorDef, index: number) => {
    const colors1 = [...this.state.colors1];
    colors1[index] = color;
    this.setState({ colors1 });
    const msg = `Color1 set to ${color.toRgbString()} alpha=${(color.getAlpha() / 255) * 100}%`;
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
  };

  private _handleColorChange2 = (color: ColorDef, index: number) => {
    const colors2 = [...this.state.colors2];
    colors2[index] = color;
    this.setState({ colors2 });
    const msg = `Color2 set to ${color.toRgbString()} alpha=${(color.getAlpha() / 255) * 100}%`;
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
  };

  public override render(): JSX.Element {

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
        onEscape={this._handleCancel}
        onClose={this._handleCancel}
        onOutsideClick={this._handleCancel}
        minHeight={150}
        maxHeight={400}
      >
        <div className="modal-dialog2">
          <div className="list-contents">
            <span className="list-header">List 1</span>
            <ColorPickerButton className="color-picker-text" initialColor={this.state.colors1[0]} onColorPick={(color: ColorDef) => this._handleColorChange1(color, 0)} /><span className="label-data">Color1</span>
            <ColorPickerButton className="color-picker-text" initialColor={this.state.colors1[1]} onColorPick={(color: ColorDef) => this._handleColorChange1(color, 1)} /><span className="label-data">Color2</span>
            <ColorPickerButton className="color-picker-text" initialColor={this.state.colors1[2]} onColorPick={(color: ColorDef) => this._handleColorChange1(color, 2)} /><span className="label-data">Color3</span>
            <ColorPickerButton className="color-picker-text" initialColor={this.state.colors1[3]} onColorPick={(color: ColorDef) => this._handleColorChange1(color, 3)} /><span className="label-data">Color4</span>
          </div>
          <div className="list-contents">
            <span className="list-header">List 2</span>
            <ColorPickerButton className="color-picker-text" initialColor={this.state.colors2[0]} onColorPick={(color: ColorDef) => this._handleColorChange2(color, 0)} /><span className="label-data">Color1</span>
            <ColorPickerButton className="color-picker-text" initialColor={this.state.colors2[1]} onColorPick={(color: ColorDef) => this._handleColorChange2(color, 1)} /><span className="label-data">Color2</span>
            <ColorPickerButton className="color-picker-text" initialColor={this.state.colors2[2]} onColorPick={(color: ColorDef) => this._handleColorChange2(color, 2)} /><span className="label-data">Color3</span>
            <ColorPickerButton className="color-picker-text" initialColor={this.state.colors2[3]} onColorPick={(color: ColorDef) => this._handleColorChange2(color, 3)} /><span className="label-data">Color4</span>
          </div>
        </div >
      </Dialog >
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
