/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import "./BooleanEditor.scss";
import classnames from "classnames";
import * as React from "react";
import { PropertyValue, PropertyValueFormat, StandardTypeNames } from "@bentley/ui-abstract";
import { Checkbox } from "@bentley/ui-core";
import { PropertyEditorProps, TypeEditor } from "./EditorContainer";
import { PropertyEditorBase, PropertyEditorManager } from "./PropertyEditorManager";

/** @internal */
interface BooleanEditorState {
  checkboxValue: boolean;
  isDisabled?: boolean;
}

/** BooleanEditor React component that is a property editor with checkbox input
 * @beta
 */
export class BooleanEditor extends React.PureComponent<PropertyEditorProps, BooleanEditorState> implements TypeEditor {
  private _isMounted = false;
  private _inputElement = React.createRef<HTMLInputElement>();

  /** @internal */
  public override readonly state: Readonly<BooleanEditorState> = {
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

  private _updateCheckboxValue = (e: React.ChangeEvent<HTMLInputElement>) => {
    // istanbul ignore else
    if (this._isMounted) {
      let checkboxValue: boolean = false;

      // istanbul ignore if
      if (e.target.checked !== undefined)   // Needed for unit test environment
        checkboxValue = e.target.checked;
      else {
        // istanbul ignore else
        if (e.target.value !== undefined && typeof e.target.value === "boolean")
          checkboxValue = e.target.value;
      }

      this.setState({
        checkboxValue,
      }, async () => {
        // istanbul ignore else
        if (this.props.propertyRecord && this.props.onCommit) {
          const propertyValue = await this.getPropertyValue();
          // istanbul ignore else
          if (propertyValue !== undefined) {
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
    let checkboxValue = false;
    let isDisabled = false;

    // istanbul ignore else
    if (propertyRecord && propertyRecord.value.valueFormat === PropertyValueFormat.Primitive) {
      const primitiveValue = propertyRecord.value.value;
      checkboxValue = primitiveValue as boolean;
    }

    // istanbul ignore else
    if (propertyRecord && propertyRecord.isDisabled)
      isDisabled = propertyRecord.isDisabled;

    // istanbul ignore else
    if (this._isMounted)
      this.setState({ checkboxValue, isDisabled });
  }

  /** @internal */
  public override render() {
    const className = classnames("components-cell-editor", "components-boolean-editor", this.props.className);
    const checked = this.state.checkboxValue;
    const isDisabled = !!this.state.isDisabled;

    return (
      <Checkbox
        inputRef={this._inputElement}
        onBlur={this.props.onBlur}
        className={className}
        style={this.props.style}
        checked={checked}
        onChange={this._updateCheckboxValue}
        setFocus={this.props.setFocus}
        disabled={isDisabled}
        data-testid="components-checkbox-editor">
      </Checkbox>
    );
  }
}

/** Boolean Property Editor registered for the "bool" and "boolean" type names.
 * It uses the [[BooleanEditor]] React component.
 * @beta
 */
export class BooleanPropertyEditor extends PropertyEditorBase {
  public get reactNode(): React.ReactNode {
    return <BooleanEditor />;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.Bool, BooleanPropertyEditor);
PropertyEditorManager.registerEditor(StandardTypeNames.Boolean, BooleanPropertyEditor);
