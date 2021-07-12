/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module StatusBar
 */

import * as React from "react";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { Button, ButtonType, FillCentered } from "@bentley/ui-core";
import { Indicator, StatusBarFieldId, StatusFieldProps } from "@bentley/ui-framework";
import { Dialog, FooterPopup, TitleBar } from "@bentley/ui-ninezone";
import { ColorPickerPopup } from "@bentley/ui-components";
import { ColorDef } from "@bentley/imodeljs-common";

interface SampleStatusFieldState {
  target: HTMLElement | null;
}

export class SampleStatusField extends React.Component<StatusFieldProps, SampleStatusFieldState> {
  private _className: string;
  private _title = IModelApp.i18n.translate("SampleApp:statusFields.sampleField");

  constructor(props: any) {
    super(props);

    this.state = {
      target: null,
    };

    this._className = this.constructor.name;
  }

  public override render() {
    const isOpen = this.props.openWidget === this._className;

    return (
      <>
        <div ref={this._handleTargetRef} title={this._title}>
          <Indicator
            iconName="icon-placeholder"
            onClick={this._handleIndicatorClick}
            opened={isOpen}
            isInFooterMode={this.props.isInFooterMode}
          />
        </div>
        <FooterPopup
          target={this.state.target}
          onClose={this._handleClose}
          isOpen={isOpen}>
          <Dialog titleBar={<TitleBar title={this._title} />}>
            {this.renderContents()}
          </Dialog>
        </FooterPopup>
      </>
    );
  }

  /** Render buttons for clear and show/hide manipulators */
  private renderContents() {
    const colorDef = ColorDef.blue;
    return (
      <div style={{ height: "70px" }}>
        <FillCentered>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <ColorPickerPopup initialColor={colorDef} />
            <Button buttonType={ButtonType.Blue}>{IModelApp.i18n.translate("SampleApp:statusFields.sampleButton")}</Button>
          </div>
        </FillCentered>
      </div>
    );
  }

  /** Handle opening/closing the dialog */
  private _handleIndicatorClick = () => {
    /** dialog setup */
    /* . . . */

    const isOpen = this.props.openWidget === this._className;
    if (isOpen)
      this.setOpenWidget(null);
    else
      this.setOpenWidget(this._className);
  };

  private _handleTargetRef = (target: HTMLElement | null) => {
    this.setState({ target });
  };

  private _handleClose = () => {
    this.setOpenWidget(null);
  };

  /** Opens the pop-up window. */
  private setOpenWidget(openWidget: StatusBarFieldId) {
    // istanbul ignore else
    if (this.props.onOpenWidget)
      this.props.onOpenWidget(openWidget);
  }

}
