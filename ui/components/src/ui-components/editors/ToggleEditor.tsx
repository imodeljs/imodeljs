/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import "./ToggleEditor.scss";
import classnames from "classnames";
import * as React from "react";
import { PropertyValue, PropertyValueFormat, StandardEditorNames, StandardTypeNames } from "@bentley/ui-abstract";
import { PropertyEditorProps, TypeEditor } from "./EditorContainer";
import { PropertyEditorBase, PropertyEditorManager } from "./PropertyEditorManager";
import { ToggleSwitch } from "@itwin/itwinui-react";

/** @internal */
interface ToggleEditorState {
  toggleValue: boolean;
  isDisabled?: boolean;
}

/** ToggleEditor React component that is a property editor with checkbox input
 * @beta
 */
export class ToggleEditor extends React.PureComponent<PropertyEditorProps, ToggleEditorState> implements TypeEditor {
  private _isMounted = false;
  private _inputElement = React.createRef<HTMLInputElement>();

  /** @internal */
  public override readonly state: Readonly<ToggleEditorState> = {
    toggleValue: false,
    isDisabled: false,
  };

  public async getPropertyValue(): Promise<PropertyValue | undefined> {
    const record = this.props.propertyRecord;
    let propertyValue: PropertyValue | undefined;

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      propertyValue = {
        valueFormat: PropertyValueFormat.Primitive,
        value: this.state.toggleValue,
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

  private _updateToggleValue = (e: React.ChangeEvent<HTMLInputElement>): any => {
    // istanbul ignore else
    if (this._isMounted) {
      // istanbul ignore else
      if (this._isMounted) {
        let toggleValue: boolean = false;

        // istanbul ignore if
        if (e.target.checked !== undefined)   // Needed for unit test environment
          toggleValue = e.target.checked;
        else {
          // istanbul ignore else
          if (e.target.value !== undefined && typeof e.target.value === "boolean")
            toggleValue = e.target.value;
        }

        this.setState({
          toggleValue,
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
    let toggleValue = false;
    let isDisabled = false;

    // istanbul ignore else
    if (propertyRecord && propertyRecord.value.valueFormat === PropertyValueFormat.Primitive) {
      const primitiveValue = propertyRecord.value.value;
      toggleValue = primitiveValue as boolean;
    }

    // istanbul ignore else
    if (propertyRecord && propertyRecord.isDisabled)
      isDisabled = propertyRecord.isDisabled;

    // istanbul ignore else
    if (this._isMounted)
      this.setState({ toggleValue, isDisabled });
  }

  /** @internal */
  public override render() {
    const className = classnames("components-cell-editor", "components-toggle-editor", this.props.className);
    const isChecked = this.state.toggleValue;
    const isDisabled = !!this.state.isDisabled;

    return (
      <ToggleSwitch
        ref={this._inputElement}
        onBlur={this.props.onBlur}
        className={className}
        style={this.props.style}
        checked={isChecked}
        disabled={isDisabled}
        onChange={this._updateToggleValue}
        data-testid="components-toggle-editor"
        setFocus={this.props.setFocus} />
    );
  }
}

/** Toggle Property Editor registered for the "bool" and "boolean" type names and "toggle" editor name.
 * It uses the [[ToggleEditor]] React component.
 * @beta
 */
export class TogglePropertyEditor extends PropertyEditorBase {
  // istanbul ignore next
  public override get containerHandlesBlur(): boolean {
    return false;
  }

  public get reactNode(): React.ReactNode {
    return <ToggleEditor />;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.Bool, TogglePropertyEditor, StandardEditorNames.Toggle);
PropertyEditorManager.registerEditor(StandardTypeNames.Boolean, TogglePropertyEditor, StandardEditorNames.Toggle);
