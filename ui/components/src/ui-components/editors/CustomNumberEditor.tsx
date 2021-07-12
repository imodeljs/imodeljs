/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

// cSpell:ignore customnumber testid

import "./CustomNumberEditor.scss";
import classnames from "classnames";
import * as React from "react";
import { Logger } from "@bentley/bentleyjs-core";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from "@bentley/imodeljs-frontend";
import {
  CustomFormattedNumberParams, IconEditorParams, InputEditorSizeParams, PrimitiveValue, PropertyEditorParams, PropertyEditorParamTypes,
  PropertyRecord, PropertyValue, PropertyValueFormat, SpecialKey, StandardEditorNames, StandardTypeNames,
} from "@bentley/ui-abstract";
import { Icon, IconInput, Input, InputProps } from "@bentley/ui-core";
import { UiComponents } from "../UiComponents";
import { PropertyEditorProps, TypeEditor } from "./EditorContainer";
import { PropertyEditorBase, PropertyEditorManager } from "./PropertyEditorManager";

/** @internal */
interface CustomNumberEditorState {
  inputValue: string;
  size?: number;
  maxLength?: number;
  iconSpec?: string;
}

/** CustomNumberEditor is a React component that is a property editor for numbers that specify custom formatting and parsing functions.
 * @alpha
 */
export class CustomNumberEditor extends React.PureComponent<PropertyEditorProps, CustomNumberEditorState> implements TypeEditor {
  private _isMounted = false;
  private _formatParams: CustomFormattedNumberParams | undefined;
  private _inputElement = React.createRef<HTMLInputElement>();

  /** @internal */
  public override readonly state: Readonly<CustomNumberEditorState> = {
    inputValue: "",
  };

  public async getPropertyValue(): Promise<PropertyValue | undefined> {
    const record = this.props.propertyRecord as PropertyRecord;
    let propertyValue: PropertyValue | undefined;

    if (record.isReadonly) {
      return {
        valueFormat: PropertyValueFormat.Primitive,
        value: (record.value as PrimitiveValue).value,
        displayValue: (record.value as PrimitiveValue).displayValue,
      };
    }

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      const parseResults = (this._formatParams as CustomFormattedNumberParams).parseFunction(this.state.inputValue);
      if (!parseResults.parseError && undefined !== parseResults.value) {
        const newDisplayValue = (this._formatParams as CustomFormattedNumberParams).formatFunction(parseResults.value as number);
        propertyValue = {
          valueFormat: PropertyValueFormat.Primitive,
          value: parseResults.value,
          displayValue: newDisplayValue,
        };
        // make sure the text in the input item matches the latest formatted text... this could get out if the input string say 1.5 === the display string of 1'-6"
        // istanbul ignore else
        if (newDisplayValue !== this.state.inputValue) {
          this.setState({ inputValue: newDisplayValue });
        }
      } else {
        const msg = new NotifyMessageDetails(OutputMessagePriority.Error, parseResults.parseError ? parseResults.parseError : /* istanbul ignore next */ UiComponents.translate("errors.unable-to-parse-quantity"));
        this.htmlElement && msg.setInputFieldTypeDetails(this.htmlElement);
        // istanbul ignore next
        if (IModelApp.notifications)
          IModelApp.notifications.outputMessage(msg);
        const displayValue = (record.value.displayValue && record.value.displayValue.length > 0) ? record.value.displayValue : /* istanbul ignore next */ (this._formatParams as CustomFormattedNumberParams).formatFunction(record.value.value as number);
        propertyValue = {
          valueFormat: PropertyValueFormat.Primitive,
          value: record.value.value,
          displayValue,
        };
      }
    }
    return propertyValue;
  }

  public get htmlElement(): HTMLElement | null {
    return this._inputElement.current;
  }

  public get hasFocus(): boolean {
    return document.activeElement === this._inputElement.current;
  }

  private shouldSetFocus(): boolean {
    if (!this.props.setFocus)
      return false;

    const record = this.props.propertyRecord as PropertyRecord;
    const disabled = (record && !record.isDisabled) ? false : true;
    const readonly = (record && !record.isReadonly) ? false : true;

    return (!disabled && !readonly);
  }

  private _applyUpdatedValue(userInput: string) {
    const record = this.props.propertyRecord as PropertyRecord;
    const readonly = (record && !record.isReadonly) ? false : true;
    const disabled = (record && !record.isDisabled) ? false : true;

    if (readonly || disabled)
      return;

    // istanbul ignore else
    if (this._isMounted)
      this.setState({
        inputValue: userInput,
      });
  }

  private _updateInputValue = (e: React.ChangeEvent<HTMLInputElement>) => {
    this._applyUpdatedValue(e.target.value);
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

  private _getInitialDisplayValue(): string {
    const record = this.props.propertyRecord;
    let initialDisplayValue = "";
    let numberValue = 0;
    // istanbul ignore else
    if (record) {
      // istanbul ignore else
      if (record.value.valueFormat === PropertyValueFormat.Primitive) {
        const primitiveValue = record.value;
        numberValue = (undefined !== primitiveValue.value) ? primitiveValue.value as number : /* istanbul ignore next */ 0;
        // istanbul ignore else
        if (primitiveValue.displayValue)
          initialDisplayValue = primitiveValue.displayValue;
        else
          initialDisplayValue = (this._formatParams as CustomFormattedNumberParams).formatFunction(numberValue);
      }
    }

    return initialDisplayValue;
  }

  private async setStateFromProps() {
    const record = this.props.propertyRecord;
    // istanbul ignore next
    if (!record || !record.property) {
      Logger.logError(UiComponents.loggerCategory(this), "PropertyRecord must be defined to use CustomNumberPropertyEditor");
      // eslint-disable-next-line no-console
      // console.log("PropertyRecord must be defined to use CustomNumberPropertyEditor");
      return;
    }
    // istanbul ignore else
    if (record.property && record.property.editor && record.property.editor.params) {
      this._formatParams = record.property.editor.params.find((param: PropertyEditorParams) => param.type === PropertyEditorParamTypes.CustomFormattedNumber) as CustomFormattedNumberParams;
    }

    if (!this._formatParams) {
      Logger.logError(UiComponents.loggerCategory(this), `CustomFormattedNumberParams must be defined for property ${record.property.name}`);
      // eslint-disable-next-line no-console
      // console.log(`CustomFormattedNumberParams must be defined for property ${record!.property!.name}`);
      return;
    }

    const initialDisplayValue = this._getInitialDisplayValue();
    let size: number | undefined;
    let maxLength: number | undefined;
    let iconSpec: string | undefined;

    // istanbul ignore else
    if (record.property && record.property.editor && record.property.editor.params) {
      const editorSizeParams = record.property.editor.params.find((param: PropertyEditorParams) => param.type === PropertyEditorParamTypes.InputEditorSize) as InputEditorSizeParams;
      // istanbul ignore else
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
      this.setState({ inputValue: initialDisplayValue, size, maxLength, iconSpec });
  }

  private _resetToOriginalValue() {
    const initialDisplayValue = this._getInitialDisplayValue();

    this.setState({ inputValue: initialDisplayValue });
  }

  private _onKeyPress = (e: KeyboardEvent) => {
    // istanbul ignore else
    if (e.key === SpecialKey.Escape) {
      const initialDisplayValue = this._getInitialDisplayValue();
      if (initialDisplayValue !== this.state.inputValue) {
        e.preventDefault();
        e.stopPropagation();
        this._resetToOriginalValue();
      } else {
        // istanbul ignore else
        if (this.props.onCancel)
          this.props.onCancel();
      }
    }

    // istanbul ignore else
    if (e.key !== SpecialKey.Enter) {
      // istanbul ignore next
      if (IModelApp.notifications)
        IModelApp.notifications.closeInputFieldMessage();
    }
  };

  // istanbul ignore next
  private _onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  /** @internal */
  public override render(): React.ReactNode {
    const minSize = this.state.size ? this.state.size : 8;
    const minWidthStyle: React.CSSProperties = {
      minWidth: `${minSize * 0.75}em`,
    };
    const record = this.props.propertyRecord as PropertyRecord;
    if (!record || !this._formatParams)
      return null;

    const readOnly = !record.isReadonly ? false : true;
    const disabled = !record.isDisabled ? false : true;

    const className = classnames("components-cell-editor", "components-customnumber-editor", this.props.className);

    const inputProps: InputProps = {
      className,
      style: this.props.style ? this.props.style : minWidthStyle,
      readOnly,
      disabled,
      size: this.state.size,
      maxLength: this.state.maxLength,
      value: this.state.inputValue,
      onChange: this._updateInputValue,
      onBlur: this.props.onBlur,
      onFocus: this._onFocus,
      setFocus: this.shouldSetFocus(),
      nativeKeyHandler: this._onKeyPress,
      ref: this._inputElement,
    };

    let reactNode: React.ReactNode;
    if (this.state.iconSpec) {
      const icon = <Icon iconSpec={this.state.iconSpec} />;
      reactNode = (
        <IconInput
          {...inputProps}
          icon={icon}
          data-testid="components-customnumber-editor"
        />
      );
    } else {
      reactNode = (
        <Input
          {...inputProps}
          data-testid="components-customnumber-editor"
        />
      );
    }

    return reactNode;
  }
}

/** Custom Property Editor registered for the "number" type name and the "number-custom" editor name.
 * It uses the [[CustomNumberEditor]] React component.
 * @alpha
 */
export class CustomNumberPropertyEditor extends PropertyEditorBase {
  public get reactNode(): React.ReactNode {
    return <CustomNumberEditor />;
  }
  public override get containerHandlesEscape(): boolean {
    return false;
  }
}
PropertyEditorManager.registerEditor(StandardTypeNames.Number, CustomNumberPropertyEditor, StandardEditorNames.NumberCustom);
