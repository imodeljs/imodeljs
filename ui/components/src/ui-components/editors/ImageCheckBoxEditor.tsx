/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import "./ImageCheckBoxEditor.scss";
import classnames from "classnames";
import * as React from "react";
import {
  ImageCheckBoxParams, PropertyEditorParams, PropertyEditorParamTypes, PropertyValue, PropertyValueFormat, StandardEditorNames, StandardTypeNames,
} from "@bentley/ui-abstract";
import { PropertyEditorProps, TypeEditor } from "./EditorContainer";
import { PropertyEditorBase, PropertyEditorManager } from "./PropertyEditorManager";
import { ImageCheckBox } from "@bentley/ui-core";

// cSpell:ignore imagecheckbox

/** @internal */
interface ImageCheckBoxEditorState {
  /** Image for the "checked" state */
  imageOn: string;
  /** Image for the "unchecked" (default) state */
  imageOff: string;
  checkboxValue: boolean;
  isDisabled?: boolean;
}
/** [[ImageCheckBoxEditor]]
 * Boolean editor that renders with an image instead of checkbox
 * @beta
 */
export class ImageCheckBoxEditor extends React.PureComponent<PropertyEditorProps, ImageCheckBoxEditorState> implements TypeEditor {
  private _isMounted = false;
  private _inputElement: React.RefObject<HTMLInputElement> = React.createRef();

  /** @internal */
  public override readonly state: Readonly<ImageCheckBoxEditorState> = {
    imageOff: "",
    imageOn: "",
    checkboxValue: false,
    isDisabled: false,
  };

  public async getPropertyValue(): Promise<PropertyValue | undefined> {
    const record = this.props.propertyRecord;
    let propertyValue: PropertyValue | undefined;

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      propertyValue = {
        valueFormat: PropertyValueFormat.Primitive,
        value: this.state.checkboxValue,
        displayValue: "",
      };
    }

    return propertyValue;
  }

  public get htmlElement(): HTMLElement | null {
    return this._inputElement.current;
  }

  public get hasFocus(): boolean {
    return document.activeElement === this._inputElement.current;
  }

  /** @internal */
  public override componentDidMount() {
    this._isMounted = true;
    this.setStateFromProps();
  }

  /** @internal */
  public override componentWillUnmount() {
    this._isMounted = false;
  }

  /** @internal */
  public override componentDidUpdate(prevProps: PropertyEditorProps) {
    if (this.props.propertyRecord !== prevProps.propertyRecord) {
      this.setStateFromProps();
    }
  }

  private setStateFromProps() {
    const { propertyRecord } = this.props;
    let checkboxValue = false;
    let imageOn = "";
    let imageOff = "";
    let isDisabled = false;

    // istanbul ignore else
    if (propertyRecord && propertyRecord.value.valueFormat === PropertyValueFormat.Primitive) {
      const primitiveValue = propertyRecord.value.value;
      checkboxValue = primitiveValue as boolean;
    }

    // istanbul ignore else
    if (propertyRecord && propertyRecord.isDisabled)
      isDisabled = propertyRecord.isDisabled;

    if (propertyRecord && propertyRecord.property && propertyRecord.property.editor && propertyRecord.property.editor.params) {
      const imageCheckBoxParams = propertyRecord.property.editor.params.find((param: PropertyEditorParams) => param.type === PropertyEditorParamTypes.CheckBoxImages) as ImageCheckBoxParams;
      // istanbul ignore else
      if (imageCheckBoxParams) {
        imageOn = imageCheckBoxParams.imageOn;
        imageOff = imageCheckBoxParams.imageOff;
      }
    }
    this.setState({ imageOn, imageOff, checkboxValue, isDisabled });
  }

  private _handleClick = (checked: boolean) => {
    this.setState({
      checkboxValue: checked,
    }, async () => {
      // istanbul ignore else
      if (this.props.propertyRecord && this.props.onCommit) {
        const propertyValue = await this.getPropertyValue();
        // istanbul ignore else
        if (this._isMounted && propertyValue !== undefined) {
          this.props.onCommit({ propertyRecord: this.props.propertyRecord, newValue: propertyValue });
        }
      }
    });
  };

  public override render() {
    const className = classnames("components-cell-editor", "components-imagecheckbox-editor", this.props.className);
    const checked = this.state.checkboxValue;
    const isDisabled = !!this.state.isDisabled;

    return (
      <ImageCheckBox
        inputRef={this._inputElement}
        imageOff={this.state.imageOff}
        imageOn={this.state.imageOn}
        className={className}
        border={true}
        style={this.props.style}
        checked={checked}
        disabled={isDisabled}
        onClick={this._handleClick}
        data-testid="components-imagecheckbox-editor">
      </ImageCheckBox>
    );
  }
}

/** ImageCheckBox Property Editor registered for the "bool" and "boolean" type names.
 * It uses the [[ImageCheckBoxEditor]] React component.
 * @beta
 */
export class ImageCheckBoxPropertyEditor extends PropertyEditorBase {
  public get reactNode(): React.ReactNode {
    return <ImageCheckBoxEditor />;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.Boolean, ImageCheckBoxPropertyEditor, StandardEditorNames.ImageCheckBox);
PropertyEditorManager.registerEditor(StandardTypeNames.Bool, ImageCheckBoxPropertyEditor, StandardEditorNames.ImageCheckBox);
