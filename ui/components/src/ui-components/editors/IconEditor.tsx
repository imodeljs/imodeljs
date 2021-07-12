/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import "./IconEditor.scss";
import classnames from "classnames";
import * as React from "react";
import {
  IconListEditorParams, PropertyEditorParams, PropertyEditorParamTypes, PropertyRecord, PropertyValue, PropertyValueFormat,
  StandardEditorNames, StandardTypeNames,
} from "@bentley/ui-abstract";
import { IconPickerButton } from "../iconpicker/IconPickerButton";
import { PropertyEditorProps, TypeEditor } from "./EditorContainer";
import { PropertyEditorBase, PropertyEditorManager } from "./PropertyEditorManager";

// cspell:ignore iconpicker

/** @internal */
interface IconEditorState {
  icon: string;
  icons: string[];
  numColumns: number;
  readonly?: boolean;
  isDisabled?: boolean;
}

/** IconEditor React component that is a property editor with button and popup
 * @alpha
 */
// istanbul ignore next
export class IconEditor extends React.PureComponent<PropertyEditorProps, IconEditorState> implements TypeEditor {
  private _control: any | null = null;
  private _isMounted = false;
  private _divElement = React.createRef<HTMLDivElement>();

  constructor(props: PropertyEditorProps) {
    super(props);

    let icon = "";
    let numColumns = 4;
    const icons: string[] = [];
    const readonly = false;

    // TODO: add support for following if we need to specify set of weights to display
    const record = props.propertyRecord;
    if (record && record.property && record.property.editor && record.property.editor.params) {
      const iconParams = record.property.editor.params.find((param: PropertyEditorParams) => param.type === PropertyEditorParamTypes.IconListData) as IconListEditorParams;
      // istanbul ignore else
      if (iconParams) {
        if (iconParams.iconValue)
          icon = iconParams.iconValue;
        if (iconParams.numColumns)
          numColumns = iconParams.numColumns;
        if (iconParams.iconValues)
          iconParams.iconValues.forEach((i: string) => icons.push(i));
      }
    }

    this.state = { icon, icons, numColumns, readonly };
  }

  public async getPropertyValue(): Promise<PropertyValue | undefined> {
    const record = this.props.propertyRecord;
    let propertyValue: PropertyValue | undefined;

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      propertyValue = {
        valueFormat: PropertyValueFormat.Primitive,
        value: this.state.icon,
        displayValue: "",
      };
    }

    return propertyValue;
  }

  public get htmlElement(): HTMLElement | null {
    return this._divElement.current;
  }

  public get hasFocus(): boolean {
    let containsFocus = false;
    if (this._divElement.current)
      containsFocus = this._divElement.current.contains(document.activeElement);
    return containsFocus;
  }

  private setFocus(): void {
    // istanbul ignore else
    if (this._control && !this.state.isDisabled) {
      this._control.setFocus();
    }
  }

  private _onIconChange = (icon: string) => {
    const propertyRecord = this.props.propertyRecord as PropertyRecord;

    this.setState({
      icon,
    }, async () => {
      // istanbul ignore else
      if (propertyRecord && this.props.onCommit) {
        const propertyValue = await this.getPropertyValue();
        // istanbul ignore else
        if (propertyValue) {
          this.props.onCommit({ propertyRecord, newValue: propertyValue });
        }
      }
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
      initialValue = record.value.value as string;
    }

    const readonly = record && undefined !== record.isReadonly ? record.isReadonly : false;
    const isDisabled = record ? record.isDisabled : undefined;

    // istanbul ignore else
    if (this._isMounted)
      this.setState(
        { icon: initialValue, readonly, isDisabled },
        () => {
          if (this.props.setFocus) {
            this.setFocus();
          }
        },
      );
  }

  /** @internal */
  public override render() {
    const { icon, icons, numColumns } = this.state;
    return (
      <div className={classnames("components-icon-editor", this.props.className)} style={this.props.style} ref={this._divElement}>
        <IconPickerButton ref={(control) => this._control = control}
          icon={icon}
          icons={icons}
          numColumns={numColumns}
          disabled={this.state.isDisabled}
          readonly={this.state.readonly}
          onIconChange={this._onIconChange}
          data-testid="components-icon-editor" />
      </div>
    );
  }
}

/** Icon Property Editor registered for the "text" and "string" type names and the "icon-picker" editor name.
 * It uses the [[IconEditor]] React component.
 * @alpha
 */
// istanbul ignore next
export class IconPropertyEditor extends PropertyEditorBase {
  public get reactNode(): React.ReactNode {
    return <IconEditor />;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.Text, IconPropertyEditor, StandardEditorNames.IconPicker);
PropertyEditorManager.registerEditor(StandardTypeNames.String, IconPropertyEditor, StandardEditorNames.IconPicker);
