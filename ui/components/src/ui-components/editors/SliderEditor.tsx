/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import "./SliderEditor.scss";
import classnames from "classnames";
import * as React from "react";
import {
  PropertyEditorParams, PropertyEditorParamTypes, PropertyValue, PropertyValueFormat, SliderEditorParams, StandardEditorNames, StandardTypeNames,
} from "@bentley/ui-abstract";
import { Icon, Slider } from "@bentley/ui-core";
import { PropertyEditorProps, TypeEditor } from "./EditorContainer";
import { PropertyEditorBase, PropertyEditorManager } from "./PropertyEditorManager";
import { PopupButton, PopupContent, PopupOkCancelButtons } from "./PopupButton";

/** @internal */
interface SliderEditorState {
  value: number;
  isDisabled?: boolean;

  min: number;
  max: number;

  size?: number;
  step?: number;
  mode?: number;
  reversed?: boolean;
  showTooltip?: boolean;
  tooltipBelow?: boolean;
  formatTooltip?: (value: number) => string;

  showMinMax?: boolean;
  minIconSpec?: string;
  maxIconSpec?: string;

  showTicks?: boolean;
  showTickLabels?: boolean;
  formatTick?: (tick: number) => string;
  getTickCount?: () => number;
  getTickValues?: () => number[];
}

/** SliderEditor React component that is a property editor with numeric input & up/down buttons
 * @beta
 */
export class SliderEditor extends React.PureComponent<PropertyEditorProps, SliderEditorState> implements TypeEditor {
  private _isMounted = false;
  private _enterKey = false;
  private _divElement = React.createRef<HTMLDivElement>();

  /** @internal */
  public override readonly state: Readonly<SliderEditorState> = {
    value: 0,
    min: 0,
    max: 100,
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
    return this._divElement.current;
  }

  public get hasFocus(): boolean {
    let containsFocus = false;
    // istanbul ignore else
    if (this._divElement.current)
      containsFocus = this._divElement.current.contains(document.activeElement);
    return containsFocus;
  }

  private _handleChange = (values: readonly number[]): void => {
    const newValue = values.length === 1 ? values[0] : /* istanbul ignore next */ 0;

    // istanbul ignore else
    if (this._isMounted)
      this.setState({
        value: newValue,
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

    let size: number | undefined;
    let min = 0;
    let max = 100;
    let step: number | undefined;
    let mode: number | undefined;
    let reversed: boolean | undefined;
    let showTooltip: boolean | undefined;
    let tooltipBelow: boolean | undefined;
    let formatTooltip: ((value: number) => string) | undefined;
    let showMinMax: boolean | undefined;
    let minIconSpec: string | undefined;
    let maxIconSpec: string | undefined;
    let showTicks: boolean | undefined;
    let showTickLabels: boolean | undefined;
    let formatTick: ((tick: number) => string) | undefined;
    let getTickCount: (() => number) | undefined;
    let getTickValues: (() => number[]) | undefined;

    const isDisabled = record ? record.isDisabled : undefined;

    if (record && record.property && record.property.editor && record.property.editor.params) {
      const sliderParams = record.property.editor.params.find((param: PropertyEditorParams) => param.type === PropertyEditorParamTypes.Slider) as SliderEditorParams;
      // istanbul ignore else
      if (sliderParams) {
        min = sliderParams.minimum;
        max = sliderParams.maximum;
        size = sliderParams.size;
        step = sliderParams.step;
        mode = sliderParams.mode;
        reversed = sliderParams.reversed;
        showTooltip = sliderParams.showTooltip;
        tooltipBelow = sliderParams.tooltipBelow;
        formatTooltip = sliderParams.formatTooltip;
        showMinMax = sliderParams.showMinMax;
        minIconSpec = sliderParams.minIconSpec;
        maxIconSpec = sliderParams.maxIconSpec;
        showTicks = sliderParams.showTicks;
        showTickLabels = sliderParams.showTickLabels;
        formatTick = sliderParams.formatTick;
        getTickCount = sliderParams.getTickCount;
        getTickValues = sliderParams.getTickValues;
      }
    }

    // istanbul ignore else
    if (this._isMounted)
      this.setState({
        value: initialValue, isDisabled,
        size,
        min, max, step, mode,
        reversed, showTooltip, tooltipBelow, formatTooltip, showMinMax, minIconSpec, maxIconSpec,
        showTicks, showTickLabels, formatTick, getTickCount, getTickValues,
      });
  }

  private _handleEnter = async (): Promise<void> => {
    this._enterKey = true;
    await this._handleCommit();
  };

  private _handleClose = async (): Promise<void> => {
    if (this._enterKey) {
      this._enterKey = false;
    } else {
      // istanbul ignore else
      if (this.props.onCancel)
        this.props.onCancel();
    }
  };

  private _handleOk = async (_event: React.MouseEvent): Promise<void> => {
    await this._handleCommit();
  };

  private _handleCancel = (_event: React.MouseEvent): void => {
    // istanbul ignore else
    if (this.props.onCancel) {
      this.props.onCancel();
    }
  };

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

  /** @internal */
  public override render(): React.ReactNode {
    const className = classnames("components-cell-editor", "components-slider-editor", this.props.className);
    const minSize = this.state.size ? this.state.size : 100;
    const style: React.CSSProperties = {
      ...this.props.style,
      minWidth: `${minSize}px`,
    };

    const minImage = this.state.minIconSpec ? <Icon iconSpec={this.state.minIconSpec} /> : undefined;
    const maxImage = this.state.maxIconSpec ? <Icon iconSpec={this.state.maxIconSpec} /> : undefined;

    const popupContent = (
      <Slider
        className="components-slider-editor-slider"
        style={style}
        values={[this.state.value]}
        min={this.state.min}
        max={this.state.max}
        step={this.state.step}
        disabled={this.state.isDisabled}
        reversed={this.state.reversed}
        showTooltip={this.state.showTooltip}
        tooltipBelow={this.state.tooltipBelow}
        formatTooltip={this.state.formatTooltip}
        showMinMax={this.state.showMinMax}
        minImage={minImage}
        maxImage={maxImage}
        showTicks={this.state.showTicks}
        showTickLabels={this.state.showTickLabels}
        formatTick={this.state.formatTick}
        getTickCount={this.state.getTickCount}
        getTickValues={this.state.getTickValues}
        onChange={this._handleChange}
        includeTicksInWidth={true}
      />
    );

    return (
      <div className={className} ref={this._divElement}>
        <PopupButton label={this.state.value} onClose={this._handleClose} onEnter={this._handleEnter}
          setFocus={this.props.setFocus} focusTarget=".core-slider-handle">
          <PopupContent>
            {popupContent}
            <PopupOkCancelButtons onOk={this._handleOk} onCancel={this._handleCancel} />
          </PopupContent>
        </PopupButton>
      </div>
    );
  }
}

/** Slider Property Editor registered for the "number" type name and "slider" editor name.
 * It uses the [[SliderEditor]] React component.
 * @beta
 */
export class SliderPropertyEditor extends PropertyEditorBase {
  public get reactNode(): React.ReactNode {
    return <SliderEditor />;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.Number, SliderPropertyEditor, StandardEditorNames.Slider);
PropertyEditorManager.registerEditor(StandardTypeNames.Int, SliderPropertyEditor, StandardEditorNames.Slider);
PropertyEditorManager.registerEditor(StandardTypeNames.Float, SliderPropertyEditor, StandardEditorNames.Slider);
PropertyEditorManager.registerEditor(StandardTypeNames.Double, SliderPropertyEditor, StandardEditorNames.Slider);
