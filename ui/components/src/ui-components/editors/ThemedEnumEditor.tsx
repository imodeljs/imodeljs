/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import "./ThemedEnumEditor.scss";
import classnames from "classnames";
import * as React from "react";
import { EnumerationChoice, PropertyValue, PropertyValueFormat, StandardEditorNames, StandardTypeNames } from "@bentley/ui-abstract";
import { OptionType, ThemedSelect } from "@bentley/ui-core";
import { PropertyEditorProps, TypeEditor } from "./EditorContainer";
import { PropertyEditorBase, PropertyEditorManager } from "./PropertyEditorManager";
import { ActionMeta, ValueType } from "react-select/src/types";

/** Properties for [[EnumEditor]] component
 * @beta
 */
export interface ThemedEnumEditorProps extends PropertyEditorProps {
  /** Allow searching in enum list */
  isSearchable?: boolean;
  /** The prompt string used when no enum member has been selected */
  placeholder?: string;
  /** The function to return an error message used when the search string can't be found in the list */
  noOptionsMessage?: (obj: { inputValue: string }) => string | null;
}
/** @internal */
interface EnumEditorState {
  selectValue: string | number;
  valueIsNumber: boolean;
  options: OptionType[] | undefined;
}

/** EnumEditor React component that is a property editor with select input
 * @beta
 */
export class ThemedEnumEditor extends React.PureComponent<ThemedEnumEditorProps, EnumEditorState> implements TypeEditor {
  private _isMounted = false;
  private _divElement = React.createRef<HTMLDivElement>();

  /** @internal */
  public override readonly state: Readonly<EnumEditorState> = {
    selectValue: "",
    valueIsNumber: false,
    options: undefined,
  };

  public async getPropertyValue(): Promise<PropertyValue | undefined> {
    const record = this.props.propertyRecord;
    let propertyValue: PropertyValue | undefined;

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      propertyValue = {
        valueFormat: PropertyValueFormat.Primitive,
        value: this.state.selectValue,
        displayValue: "",
      };
    }

    return propertyValue;
  }

  // istanbul ignore next
  public get htmlElement(): HTMLElement | null {
    return this._divElement.current;
  }

  // istanbul ignore next
  public get hasFocus(): boolean {
    let containsFocus = false;
    // istanbul ignore else
    if (this._divElement.current)
      containsFocus = this._divElement.current.contains(document.activeElement);
    return containsFocus;
  }

  private _updateSelectValue = (value: ValueType<OptionType>, action: ActionMeta<OptionType>) => {
    // istanbul ignore else
    if (this._isMounted && action.action === "select-option" && value) {
      let selectValue: string | number;
      const selectedOption: OptionType = value as OptionType;
      // istanbul ignore next
      if (selectedOption === undefined) // no multi-select allowed
        return;

      if (this.state.valueIsNumber)
        selectValue = parseInt(selectedOption.value, 10);
      else
        selectValue = selectedOption.value;

      this.setState({
        selectValue,
      }, async () => {
        // istanbul ignore else
        if (this.props.propertyRecord && this.props.onCommit) {
          const propertyValue = await this.getPropertyValue();
          // istanbul ignore else
          if (propertyValue) {
            this.props.onCommit({ propertyRecord: this.props.propertyRecord, newValue: propertyValue });
          }
        }
      });
    }
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
    const { propertyRecord } = this.props;
    let initialValue: string | number = "";
    let valueIsNumber: boolean = false;
    let choices: EnumerationChoice[] | undefined;

    if (propertyRecord && propertyRecord.property.enum) {
      // istanbul ignore else
      if (propertyRecord.property.enum.choices instanceof Promise) {
        choices = await propertyRecord.property.enum.choices;
      } else {
        choices = propertyRecord.property.enum.choices;
      }
    }

    let options: OptionType[] = [];
    if (this.state.options === undefined) {
      if (choices) {
        choices.forEach((choice: EnumerationChoice) => {
          options.push({ value: choice.value.toString(), label: choice.label });
        });
      }
    } else {
      options = this.state.options;
    }

    // istanbul ignore else
    if (propertyRecord && propertyRecord.value.valueFormat === PropertyValueFormat.Primitive) {
      const primitiveValue = propertyRecord.value.value;
      if (typeof primitiveValue === "string") {
        initialValue = primitiveValue;
        valueIsNumber = false;
      } else {
        initialValue = primitiveValue as number;
        valueIsNumber = true;
      }
    }

    // istanbul ignore else
    if (this._isMounted)
      this.setState({ selectValue: initialValue, valueIsNumber, options });
  }

  /** @internal */
  public override render() {
    const className = classnames("components-cell-editor", "components-enum-editor", this.props.className);
    const selectValue = this.state.selectValue ? this.state.selectValue.toString() : undefined;
    const options = this.state.options === undefined ? [] : this.state.options;
    const selectedOption = options.find((e) => e.value === selectValue);
    const { isSearchable, placeholder, noOptionsMessage } = this.props;
    // set min-width to show about 4 characters + down arrow
    const minWidthStyle: React.CSSProperties = {
      minWidth: `${6 * 0.75}em`,
    };

    return (
      <ThemedSelect
        divRef={this._divElement}
        className={className}
        value={selectedOption}
        onChange={this._updateSelectValue}
        data-testid="components-select-editor"
        styles={this.props.style ? this.props.style : minWidthStyle}
        isSearchable={isSearchable}
        placeholder={placeholder}
        noOptionsMessage={noOptionsMessage}
        isMulti={false}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={this.props.setFocus}
        options={options} />
    );
  }
}

/** Enum Property Button Group Editor registered for the "enum" type name.
 * It uses the [[EnumEditor]] React component.
 * @beta
 */
export class ThemedEnumPropertyEditor extends PropertyEditorBase {

  // istanbul ignore next
  public override get containerHandlesBlur(): boolean {
    return false;
  }
  // istanbul ignore next
  public override get containerHandlesEscape(): boolean {
    return false;
  }
  // istanbul ignore next
  public override get containerHandlesEnter(): boolean {
    return false;
  }
  // istanbul ignore next
  public override get containerHandlesTab(): boolean {
    return false;
  }
  // istanbul ignore next
  public get reactNode(): React.ReactNode {
    return <ThemedEnumEditor />;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.Enum, ThemedEnumPropertyEditor, StandardEditorNames.ThemedEnum);
