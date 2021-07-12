/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import "./NumericInputEditor.scss";
import classnames from "classnames";
import * as React from "react";
import {
  InputEditorSizeParams, PropertyEditorParams, PropertyEditorParamTypes, PropertyValue, PropertyValueFormat, RangeEditorParams,
  StandardEditorNames, StandardTypeNames,
} from "@bentley/ui-abstract";
import { NumberInput } from "@bentley/ui-core";
import { PropertyEditorProps, TypeEditor } from "./EditorContainer";
import { PropertyEditorBase, PropertyEditorManager } from "./PropertyEditorManager";

/** @internal */
interface NumericInputEditorState {
  value: number;
  readonly: boolean;
  isDisabled?: boolean;
  size?: number;
  maxLength?: number;

  min?: number;
  max?: number;
  step?: number;
  precision?: number;
}

/** NumericInputEditor React component that is a property editor with numeric input & up/down buttons
 * @beta
 */
export class NumericInputEditor extends React.PureComponent<PropertyEditorProps, NumericInputEditorState> implements TypeEditor {
  private _isMounted = false;
  private _inputElement: React.RefObject<HTMLInputElement> = React.createRef();
  public hasFocus = false; // hot used since containerHandlesEnter is false

  /** @internal */
  public override readonly state: Readonly<NumericInputEditorState> = {
    value: 0,
    readonly: false,
  };

  public async getPropertyValue(): Promise<PropertyValue | undefined> {
    const record = this.props.propertyRecord;
    let propertyValue: PropertyValue | undefined;

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      propertyValue = {
        valueFormat: PropertyValueFormat.Primitive,
        value: this.state.value,
        displayValue: "",
      };
    }

    return propertyValue;
  }

  public get htmlElement(): HTMLElement | null {
    return this._inputElement.current;
  }

  private _handleCommit = async (): Promise<void> => {
    // istanbul ignore else
    if (this.props.propertyRecord && this.props.onCommit) {
      const propertyValue = await this.getPropertyValue();
      // istanbul ignore else
      if (propertyValue !== undefined) {
        this.props.onCommit({ propertyRecord: this.props.propertyRecord, newValue: propertyValue });
      }
    }
  };

  private _updateValue = (value: number | undefined, _stringValue: string): void => {
    const newValue = value !== undefined ? value : /* istanbul ignore next */ 0;

    // istanbul ignore else
    if (this._isMounted)
      this.setState({
        value: newValue,
      }, async () => {
        await this._handleCommit();
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
    let initialValue = 0;

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      initialValue = record.value.value as number;
    }

    const readonly = record && undefined !== record.isReadonly ? record.isReadonly : false;
    let size: number | undefined;
    let maxLength: number | undefined;
    let min: number | undefined;
    let max: number | undefined;
    let step: number | undefined;
    let precision: number | undefined;

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

      const rangeParams = record.property.editor.params.find((param: PropertyEditorParams) => param.type === PropertyEditorParamTypes.Range) as RangeEditorParams;
      if (rangeParams) {
        min = rangeParams.minimum;
        max = rangeParams.maximum;
        step = rangeParams.step;
        precision = rangeParams.precision;
      }
    }

    // istanbul ignore else
    if (this._isMounted)
      this.setState({ value: initialValue, readonly, size, maxLength, isDisabled, min, max, step, precision });
  }

  /** @internal */
  public override render(): React.ReactNode {
    const className = classnames("components-cell-editor", "components-numeric-input-editor", this.props.className);
    const minSize = this.state.size ? this.state.size : 8;
    const style: React.CSSProperties = {
      ...this.props.style,
      minWidth: `${minSize * 0.75}em`,
    };

    return (
      <NumberInput
        ref={this._inputElement}
        className={className}
        style={style}
        value={this.state.value}
        min={this.state.min}
        max={this.state.max}
        step={this.state.step}
        precision={this.state.precision}
        readOnly={this.state.readonly}
        maxLength={this.state.maxLength}
        onBlur={this.props.onBlur}
        onChange={this._updateValue}
        setFocus={this.props.setFocus && !this.state.isDisabled}
      />
    );
  }
}

/** Numeric Input Property Editor registered for the "number" type name and "numeric-input" editor name.
 * It uses the [[NumericInputEditor]] React component.
 * @beta
 */
export class NumericInputPropertyEditor extends PropertyEditorBase {
  public get reactNode(): React.ReactNode {
    return <NumericInputEditor />;
  }
  // istanbul ignore next
  public override get containerHandlesEnter(): boolean { // let input editor process enter key
    return false;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.Number, NumericInputPropertyEditor, StandardEditorNames.NumericInput);
PropertyEditorManager.registerEditor(StandardTypeNames.Int, NumericInputPropertyEditor, StandardEditorNames.NumericInput);
PropertyEditorManager.registerEditor(StandardTypeNames.Float, NumericInputPropertyEditor, StandardEditorNames.NumericInput);
PropertyEditorManager.registerEditor(StandardTypeNames.Double, NumericInputPropertyEditor, StandardEditorNames.NumericInput);
