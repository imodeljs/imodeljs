/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module AccuDraw
 */

import * as React from "react";
import { OnCancelFunc, OnNumberCommitFunc } from "@bentley/ui-abstract";
import { DivWithOutsideClick, Icon, Size, SizeProps } from "@bentley/ui-core";
import { PopupManager, PopupPropsBase } from "../popup/PopupManager";
import { PositionPopup, PositionPopupContent } from "../popup/PositionPopup";
import { Calculator } from "./Calculator";

/** @alpha */
export interface CalculatorPopupProps extends PopupPropsBase {
  initialValue: number;
  resultIcon: string;
  onOk: OnNumberCommitFunc;
  onCancel: OnCancelFunc;
}

/** @internal */
interface CalculatorPopupState {
  size: Size;
}

/** Popup component for Calculator
 * @alpha
 */
export class CalculatorPopup extends React.PureComponent<CalculatorPopupProps, CalculatorPopupState> {
  /** @internal */
  public override readonly state = {
    size: new Size(-1, -1),
  };

  private _onSizeKnown = (newSize: SizeProps) => {
    // istanbul ignore else
    if (!this.state.size.equals(newSize))
      this.setState({ size: Size.create(newSize) });
  };

  /** @internal */
  public override render() {
    const point = PopupManager.getPopupPosition(this.props.el, this.props.pt, this.props.offset, this.state.size);

    return (
      <PositionPopup key={this.props.id}
        point={point}
        className="uifw-calculator-host"
        onSizeKnown={this._onSizeKnown}
      >
        <DivWithOutsideClick onOutsideClick={this.props.onCancel}>
          <PositionPopupContent>
            <Calculator
              initialValue={this.props.initialValue}
              resultIcon={<Icon iconSpec={this.props.resultIcon} />}
              onOk={this.props.onOk}
              onCancel={this.props.onCancel} />
          </PositionPopupContent>
        </DivWithOutsideClick>
      </PositionPopup>
    );
  }

}
