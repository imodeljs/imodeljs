/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Popup
 */

import * as React from "react";
import { OnCancelFunc, OnValueCommitFunc, Primitives, PropertyRecord, PropertyValueFormat } from "@bentley/ui-abstract";
import { EditorContainer, PropertyUpdatedArgs } from "@bentley/ui-components";
import { DivWithOutsideClick, Size, SizeProps } from "@bentley/ui-core";
import { PopupManager, PopupPropsBase } from "./PopupManager";
import { PositionPopup, PositionPopupContent } from "./PositionPopup";

/** @alpha */
export class InputEditorCommitHandler {
  constructor(
    public readonly onCommit: OnValueCommitFunc,
  ) { }

  public handleCommit = (args: PropertyUpdatedArgs) => {
    let newValue: Primitives.Value = 0;
    // istanbul ignore else
    if (args.newValue.valueFormat === PropertyValueFormat.Primitive && args.newValue.value !== undefined) {
      newValue = args.newValue.value;
    }
    this.onCommit(newValue);
  };
}

/** @alpha */
export interface InputEditorPopupProps extends PopupPropsBase {
  record: PropertyRecord;
  onCancel: OnCancelFunc;
  commitHandler: InputEditorCommitHandler;
}

/** @internal */
interface InputEditorPopupState {
  size: Size;
}

/** Popup component for Input Editor
 * @alpha
 */
export class InputEditorPopup extends React.PureComponent<InputEditorPopupProps, InputEditorPopupState> {
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
        onSizeKnown={this._onSizeKnown}
      >
        <DivWithOutsideClick onOutsideClick={this.props.onCancel}>
          <PositionPopupContent>
            <EditorContainer
              propertyRecord={this.props.record}
              onCommit={this.props.commitHandler.handleCommit}
              onCancel={this.props.onCancel}
              setFocus={true} />
          </PositionPopupContent>
        </DivWithOutsideClick>
      </PositionPopup>
    );
  }
}
