/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./PopupTest.scss";
import * as React from "react";
import { DialogButtonType, RelativePosition } from "@bentley/ui-abstract";
import { Dialog, Popup } from "@bentley/ui-core";
import { ModalDialogManager } from "@bentley/ui-framework";
import { Button, ToggleSwitch } from "@itwin/itwinui-react";

interface PopupTestProps {
  opened: boolean;
}

interface PopupTestState {
  showTopLeft: boolean;
  showTop: boolean;
  showTopRight: boolean;
  showBottomLeft: boolean;
  showBottom: boolean;
  showBottomRight: boolean;
  showLeft: boolean;
  showRight: boolean;
  showArrow: boolean;
  showShadow: boolean;
  opened: boolean;
}

/**
 * Test dialog for popups.
 * @internal
 */
export class PopupTestDialog extends React.Component<PopupTestProps, PopupTestState> {
  public override readonly state: Readonly<PopupTestState>;
  private _targetTop: HTMLElement | null = null;
  private _targetBottom: HTMLElement | null = null;
  private _targetLeft: HTMLElement | null = null;
  private _targetRight: HTMLElement | null = null;
  private _targetTopLeft: HTMLElement | null = null;
  private _targetTopRight: HTMLElement | null = null;
  private _targetBottomLeft: HTMLElement | null = null;
  private _targetBottomRight: HTMLElement | null = null;

  constructor(props?: any, context?: any) {
    super(props, context);

    this.state = {
      showTopLeft: false, showTop: false, showTopRight: false, showBottomLeft: false, showBottom: false, showBottomRight: false,
      showArrow: false, showLeft: false, showRight: false, showShadow: true, opened: this.props.opened,
    };
  }

  private _toggleTopLeft = () => {
    this.setState((prevState) => ({ showTopLeft: !prevState.showTopLeft }));
  };

  private _closeTopLeft = () => {
    this.setState({ showTopLeft: false });
  };

  private _toggleTop = () => {
    this.setState((prevState) => ({ showTop: !prevState.showTop }));
  };

  private _closeTop = () => {
    this.setState({ showTop: false });
  };

  private _toggleTopRight = () => {
    this.setState((prevState) => ({ showTopRight: !prevState.showTopRight }));
  };

  private _onCloseTopRight = () => {
    this.setState({ showTopRight: false });
  };

  private _toggleBottomLeft = () => {
    this.setState((prevState) => ({ showBottomLeft: !prevState.showBottomLeft }));
  };

  private _onCloseBottomLeft = () => {
    this.setState({ showBottomLeft: false });
  };

  private _toggleBottom = () => {
    this.setState((prevState) => ({ showBottom: !prevState.showBottom }));
  };

  private _onCloseBottom = () => {
    this.setState({ showBottom: false });
  };

  private _toggleBottomRight = () => {
    this.setState((prevState) => ({ showBottomRight: !prevState.showBottomRight }));
  };

  private _onCloseBottomRight = () => {
    this.setState({ showBottomRight: false });
  };

  private _toggleLeft = () => {
    this.setState((prevState) => ({ showLeft: !prevState.showLeft }));
  };

  private _onCloseLeft = () => {
    this.setState({ showLeft: false });
  };

  private _toggleRight = () => {
    this.setState((prevState) => ({ showRight: !prevState.showRight }));
  };

  private _onCloseRight = () => {
    this.setState({ showRight: false });
  };

  private _onArrowChange = () => {
    this.setState((prevState) => ({ showArrow: !prevState.showArrow }));
  };

  private _onShadowChange = () => {
    this.setState((prevState) => ({ showShadow: !prevState.showShadow }));
  };

  private _handleOK = () => {
    this._closeDialog();
  };

  private _handleCancel = () => {
    this._closeDialog();
  };

  private _closeDialog = () => {
    this.setState((_prevState) => ({
      opened: false,
    }), () => {
      if (!this.state.opened)
        ModalDialogManager.closeDialog();
    });
  };

  private renderPopup(title: string, onClose: () => any) {
    return (
      <div className="popup-test-content">
        <h4>{title}</h4>
        <div />
        <ul>
          <li onClick={onClose}>Item 1</li>
          <li onClick={onClose}>Item 2</li>
          <li onClick={onClose}>Item 3</li>
          <li onClick={onClose}>Item 4</li>
        </ul>
      </div>
    );
  }
  public override render() {
    return (
      <Dialog
        title={"Test Popups"}
        opened={this.state.opened}
        modal={true}
        buttonCluster={[
          { type: DialogButtonType.OK, onClick: () => { this._handleOK(); } },
          { type: DialogButtonType.Cancel, onClick: () => { this._handleCancel(); } },
        ]}
        onClose={() => this._handleCancel()}
        onEscape={() => this._handleCancel()}
      >
        <div className="popup-test" >
          <div className="popup-content">
            <div className="buttons">
              <div>
                <Button onClick={this._toggleTopLeft} ref={(element) => { this._targetTopLeft = element; }}>
                  Top Left
                </Button>
                <Popup className="popup-colors" isOpen={this.state.showTopLeft} position={RelativePosition.TopLeft} onClose={this._closeTopLeft} target={this._targetTopLeft}
                  showArrow={this.state.showArrow} showShadow={this.state.showShadow}>
                  {this.renderPopup("Top Left", this._closeTopLeft)}
                </Popup>
              </div>
              <div>
                <Button onClick={this._toggleTop} ref={(element) => { this._targetTop = element; }}>
                  Top
                </Button>
                <Popup className="popup-colors" isOpen={this.state.showTop} position={RelativePosition.Top} onClose={this._closeTop} target={this._targetTop}
                  showArrow={this.state.showArrow} showShadow={this.state.showShadow}>
                  {this.renderPopup("Top Center", this._closeTop)}
                </Popup>
              </div>
              <div>
                <Button onClick={this._toggleTopRight} ref={(element) => { this._targetTopRight = element; }}>
                  Top Right
                </Button>
                <Popup className="popup-colors" isOpen={this.state.showTopRight} position={RelativePosition.TopRight} target={this._targetTopRight}
                  onClose={this._onCloseTopRight} showArrow={this.state.showArrow} showShadow={this.state.showShadow}>
                  {this.renderPopup("Top Right", this._onCloseTopRight)}
                </Popup>
              </div>
            </div>
            <div className="buttons">
              <div>
                <Button onClick={this._toggleLeft} ref={(element) => { this._targetLeft = element; }}>
                  Left
                </Button>
                <Popup className="popup-colors" isOpen={this.state.showLeft} position={RelativePosition.Left} target={this._targetLeft}
                  onClose={this._onCloseLeft} showArrow={this.state.showArrow} showShadow={this.state.showShadow}>
                  {this.renderPopup("Left Center", this._onCloseLeft)}
                </Popup>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <Button onClick={this._toggleRight} ref={(element) => { this._targetRight = element; }}>
                  Right
                </Button>
                <Popup className="popup-colors" isOpen={this.state.showRight} position={RelativePosition.Right} target={this._targetRight}
                  onClose={this._onCloseRight} showArrow={this.state.showArrow} showShadow={this.state.showShadow}>
                  {this.renderPopup("Right Center", this._onCloseRight)}
                </Popup>
              </div>
            </div>
            <div className="buttons">
              <div>
                <Button onClick={this._toggleBottomLeft} ref={(element) => { this._targetBottomLeft = element; }}>
                  Bottom Left
                </Button>
                <Popup className="popup-colors" isOpen={this.state.showBottomLeft} position={RelativePosition.BottomLeft} target={this._targetBottomLeft}
                  onClose={this._onCloseBottomLeft} showArrow={this.state.showArrow} showShadow={this.state.showShadow}>
                  {this.renderPopup("Bottom Left", this._onCloseBottomLeft)}
                </Popup>
              </div>
              <div>
                <Button onClick={this._toggleBottom} ref={(element) => { this._targetBottom = element; }}>
                  Bottom
                </Button>
                <Popup className="popup-colors" isOpen={this.state.showBottom} position={RelativePosition.Bottom} target={this._targetBottom}
                  onClose={this._onCloseBottom} showArrow={this.state.showArrow} showShadow={this.state.showShadow}>
                  {this.renderPopup("Bottom Center", this._onCloseBottom)}
                </Popup>
              </div>
              <div>
                <Button onClick={this._toggleBottomRight} ref={(element) => { this._targetBottomRight = element; }}>
                  Bottom Right
                </Button>
                <Popup className="popup-colors" isOpen={this.state.showBottomRight} position={RelativePosition.BottomRight} target={this._targetBottomRight}
                  onClose={this._onCloseBottomRight} showArrow={this.state.showArrow} showShadow={this.state.showShadow}>
                  {this.renderPopup("Bottom Right", this._onCloseBottomRight)}
                </Popup>
              </div>
            </div>
          </div>
          <div className="options">
            <div>
              <label>Arrow</label>
              <ToggleSwitch className="popup-toggle" onChange={this._onArrowChange} checked={this.state.showArrow} />
            </div>
            <div>
              <label>Shadow</label>
              <ToggleSwitch className="popup-toggle" onChange={this._onShadowChange} checked={this.state.showShadow} />
            </div>
          </div>
        </div>
      </Dialog>
    );
  }
}
