/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import "./TextEditor.scss";
import classnames from "classnames";
import * as React from "react";
import {
  IconEditorParams, InputEditorSizeParams, PrimitiveValue, PropertyEditorParams, PropertyEditorParamTypes, PropertyValue, PropertyValueFormat,
} from "@bentley/ui-abstract";
import { Icon, IconInput, Input, InputProps } from "@bentley/ui-core";
import { TypeConverterManager } from "../converters/TypeConverterManager";
import { PropertyEditorProps, TypeEditor } from "./EditorContainer";
import { UiComponents } from "../UiComponents";

/** @internal */
interface TextEditorState {
  inputValue: string;
  readonly: boolean;
  isDisabled?: boolean;
  size?: number;
  maxLength?: number;
  iconSpec?: string;
}

/** TextEditor React component that is a property editor with text input
 * @beta
 */
export class TextEditor extends React.PureComponent<PropertyEditorProps, TextEditorState> implements TypeEditor {
  private _isMounted = false;
  private _ariaLabel = UiComponents.translate("editor.text");
  private _inputElement = React.createRef<HTMLInputElement>();

  /** @internal */
  public override readonly state: Readonly<TextEditorState> = {
    inputValue: "",
    readonly: false,
  };

  public async getPropertyValue(): Promise<PropertyValue | undefined> {
    const record = this.props.propertyRecord;
    let propertyValue: PropertyValue | undefined;

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      propertyValue = await TypeConverterManager.getConverter(record.property.typename, record.property.converter?.name).convertFromStringToPropertyValue(this.state.inputValue, record);
      (propertyValue as PrimitiveValue).displayValue = this.state.inputValue;
    }

    return propertyValue;
  }

  public get htmlElement(): HTMLElement | null {
    return this._inputElement.current;
  }

  public get hasFocus(): boolean {
    return document.activeElement === this._inputElement.current;
  }

  private _updateInputValue = (e: React.ChangeEvent<HTMLInputElement>) => {
    // istanbul ignore else
    if (this._isMounted)
      this.setState({
        inputValue: e.target.value,
      });
  };

  /** @internal */
  public override componentDidMount() {
    this._isMounted = true;
    this.setStateFromProps(); // eslint-disable-line @typescript-eslint/no-floating-promises
  }

  /** @internal */
  public override componentWillUnmount() {
    this._isMounted = false;
  }

  /** @internal */
  public override componentDidUpdate(prevProps: PropertyEditorProps) {
    if (this.props.propertyRecord !== prevProps.propertyRecord) {
      this.setStateFromProps(); // eslint-disable-line @typescript-eslint/no-floating-promises
    }
  }

  private async setStateFromProps() {
    const record = this.props.propertyRecord;
    let initialValue = "";

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      const value = record.value.value;
      initialValue = await TypeConverterManager.getConverter(record.property.typename, record.property.converter?.name).convertPropertyToString(record.property, value);
    }

    const readonly = record && undefined !== record.isReadonly ? record.isReadonly : false;
    let size: number | undefined;
    let maxLength: number | undefined;
    let iconSpec: string | undefined;

    const isDisabled = record ? record.isDisabled : undefined;

    if (record && record.property && record.property.editor && record.property.editor.params) {
      const editorSizeParams = record.property.editor.params.find((param: PropertyEditorParams) => param.type === PropertyEditorParamTypes.InputEditorSize) as InputEditorSizeParams;
      if (editorSizeParams) {
        // istanbul ignore else
        if (editorSizeParams.size)
          size = editorSizeParams.size;
        // istanbul ignore else
        if (editorSizeParams.maxLength)
          maxLength = editorSizeParams.maxLength;
      }

      const iconParams = record.property.editor.params.find((param: PropertyEditorParams) => param.type === PropertyEditorParamTypes.Icon) as IconEditorParams;
      if (iconParams) {
        iconSpec = iconParams.definition.iconSpec;
      }
    }

    // istanbul ignore else
    if (this._isMounted)
      this.setState({ inputValue: initialValue, readonly, size, maxLength, isDisabled, iconSpec });
  }

  /** @internal */
  public override render(): React.ReactNode {
    const className = classnames("components-cell-editor", "components-text-editor", this.props.className);
    const minSize = this.state.size ? this.state.size : 8;
    const minWidthStyle: React.CSSProperties = {
      minWidth: `${minSize * 0.75}em`,
    };
    const inputProps: InputProps = {
      type: "text",
      className,
      style: this.props.style ? this.props.style : minWidthStyle,
      readOnly: this.state.readonly,
      disabled: this.state.isDisabled,
      size: this.state.size,
      maxLength: this.state.maxLength,
      value: this.state.inputValue,
      onBlur: this.props.onBlur,
      onChange: this._updateInputValue,
      setFocus: this.props.setFocus && !this.state.isDisabled,
      ref: this._inputElement,
    };

    inputProps["aria-label"] = this._ariaLabel;

    let reactNode: React.ReactNode;
    if (this.state.iconSpec) {
      const icon = <Icon iconSpec={this.state.iconSpec} />;
      reactNode = (
        <IconInput
          {...inputProps}
          icon={icon}
          data-testid="components-text-editor"
        />
      );
    } else {
      reactNode = (
        <Input
          {...inputProps}
          data-testid="components-text-editor"
        />
      );
    }

    return reactNode;
  }
}
