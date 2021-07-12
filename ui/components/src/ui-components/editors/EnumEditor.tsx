/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import "./EnumEditor.scss";
import classnames from "classnames";
import * as React from "react";
import { EnumerationChoice, PropertyValue, PropertyValueFormat, StandardTypeNames } from "@bentley/ui-abstract";
import { Select, SelectOption } from "@itwin/itwinui-react";
import { PropertyEditorProps, TypeEditor } from "./EditorContainer";
import { PropertyEditorBase, PropertyEditorManager } from "./PropertyEditorManager";
import { UiComponents } from "../UiComponents";

/** @internal */
interface EnumEditorState {
  selectValue: string | number;
  valueIsNumber: boolean;
  options: SelectOption<string>[];
}

/** EnumEditor React component that is a property editor with select input
  * @beta
  */
export class EnumEditor extends React.PureComponent<PropertyEditorProps, EnumEditorState> implements TypeEditor {
  private _isMounted = false;
  private _ariaLabel = UiComponents.translate("editor.enum");
  private _divElement = React.createRef<HTMLDivElement>();

  /** @internal */
  public override readonly state: Readonly<EnumEditorState> = {
    selectValue: "",
    valueIsNumber: false,
    options: [],
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

  private _updateSelectValue = (newValue: string) => {
    // istanbul ignore else
    if (this._isMounted) {
      let selectValue: string | number;

      // istanbul ignore if
      if (this.state.valueIsNumber)
        selectValue = parseInt(newValue, 10);
      else
        selectValue = newValue;

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

    let choices: EnumerationChoice[] | undefined;

    if (propertyRecord && propertyRecord.property.enum) {
      // istanbul ignore else
      if (propertyRecord.property.enum.choices instanceof Promise) {
        choices = await propertyRecord.property.enum.choices;
      } else {
        choices = propertyRecord.property.enum.choices;
      }
    }

    const options: SelectOption<string>[] = [];
    if (choices) {
      choices.forEach((choice: EnumerationChoice) => {
        options.push({ value: choice.value.toString(), label: choice.label });
      });
    }

    // istanbul ignore else
    if (this._isMounted)
      this.setState({ selectValue: initialValue, valueIsNumber, options });
  }

  /** @internal */
  public override render() {
    const className = classnames("components-cell-editor", "components-enum-editor", this.props.className);
    const selectValue = this.state.selectValue !== undefined ? this.state.selectValue.toString() : /* istanbul ignore next */ undefined;

    // set min-width to show about 4 characters + down arrow
    const minWidthStyle: React.CSSProperties = {
      minWidth: `6em`,
    };

    return (
      <div ref={this._divElement}>
        <Select
          className={className}
          style={this.props.style ? this.props.style : minWidthStyle}
          value={selectValue}
          onChange={this._updateSelectValue}
          data-testid="components-select-editor"
          options={this.state.options}
          setFocus={this.props.setFocus}
          aria-label={this._ariaLabel} />
      </div>
    );
  }
}

/** Enum Property Button Group Editor registered for the "enum" type name.
  * It uses the [[EnumEditor]] React component.
  * @beta
  */
export class EnumPropertyEditor extends PropertyEditorBase {
  // istanbul ignore next
  public override get containerHandlesEnter(): boolean {
    return false;
  }
  public override get containerStopsKeydownPropagation(): boolean {
    return false;
  }

  public get reactNode(): React.ReactNode {
    return <EnumEditor />;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.Enum, EnumPropertyEditor);
