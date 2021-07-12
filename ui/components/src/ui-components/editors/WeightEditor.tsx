/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import "./WeightEditor.scss";
import classnames from "classnames";
import * as React from "react";
import { PropertyRecord, PropertyValue, PropertyValueFormat, StandardEditorNames, StandardTypeNames } from "@bentley/ui-abstract";
import { WeightPickerButton } from "../lineweight/WeightPickerButton";
import { PropertyEditorProps, TypeEditor } from "./EditorContainer";
import { PropertyEditorBase, PropertyEditorManager } from "./PropertyEditorManager";

// cspell:ignore lineweight

/** @internal */
interface WeightEditorState {
  weightValue: number;
  readonly: boolean;
  isDisabled?: boolean;
}

/** WeightEditor React component that is a property editor for picking a weight using a [[WeightPickerButton]] component
 * @beta
 */
export class WeightEditor extends React.PureComponent<PropertyEditorProps, WeightEditorState> implements TypeEditor {
  private _control: any | null = null;
  private _isMounted = false;
  private _availableWeights: number[] = [];
  private _divElement = React.createRef<HTMLDivElement>();

  /** @internal */
  public override readonly state: Readonly<WeightEditorState> = {
    weightValue: 0,
    readonly: false,
  };

  constructor(props: PropertyEditorProps) {
    super(props);

    // TODO: add support for following if we need to specify set of weights to display
    //  const record = this.props.propertyRecord;
    //  if (record && record.property && record.property.editor && record.property.editor.params) {
    //    const weightParams = record.property.editor.params.find((param: PropertyEditorParams) => param.type === PropertyEditorParamTypes.ColorData) as WeightEditorParams;
    //    // istanbul ignore else
    //    if (weightParams) {
    //      weightParams.weightValues.forEach((weight: number) => {
    //        this._availableWeights.push(weight);
    //      });
    //    }
    //   }
  }

  public async getPropertyValue(): Promise<PropertyValue | undefined> {
    const record = this.props.propertyRecord;
    let propertyValue: PropertyValue | undefined;

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      propertyValue = {
        valueFormat: PropertyValueFormat.Primitive,
        value: this.state.weightValue,
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
    // istanbul ignore else
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

  private _onLineWeightPick = (weight: number) => {
    const propertyRecord = this.props.propertyRecord as PropertyRecord;

    this.setState({
      weightValue: weight,
    }, async () => {
      // istanbul ignore else
      if (propertyRecord && this.props.onCommit) {
        const propertyValue = await this.getPropertyValue();
        // istanbul ignore else
        if (propertyValue !== undefined) {
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
    let initialValue = 0;

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      initialValue = record.value.value as number;
    }

    const readonly = record && undefined !== record.isReadonly ? record.isReadonly : false;
    const isDisabled = record ? record.isDisabled : undefined;

    // istanbul ignore else
    if (this._isMounted)
      this.setState(
        { weightValue: initialValue, readonly, isDisabled },
        () => {
          if (this.props.setFocus) {
            this.setFocus();
          }
        },
      );
  }

  /** @internal */
  public override render() {
    return (
      <div className={classnames("components-weight-editor", this.props.className)} style={this.props.style} ref={this._divElement}>
        <WeightPickerButton ref={(control) => this._control = control}
          activeWeight={this.state.weightValue}
          weights={this._availableWeights.length > 0 ? /* istanbul ignore next */ this._availableWeights : undefined}
          disabled={this.state.isDisabled ? true : false}
          readonly={this.state.readonly}
          onLineWeightPick={this._onLineWeightPick}
          data-testid="components-weight-editor" />
      </div>
    );
  }
}

/** Weight Property Editor registered for the "number" type name and "weight-picker" editor name.
 * It uses the [[WeightEditor]] React component.
 * @beta
 */
export class WeightPropertyEditor extends PropertyEditorBase {
  // istanbul ignore next
  public get reactNode(): React.ReactNode {
    return <WeightEditor />;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.Number, WeightPropertyEditor, StandardEditorNames.WeightPicker);
