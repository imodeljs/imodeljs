/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyEditors
 */

import "./DateTimeEditor.scss";
import classnames from "classnames";
import * as React from "react";
import {
  AlternateDateFormats, PropertyValue, PropertyValueFormat, StandardTypeNames, TimeDisplay,
} from "@bentley/ui-abstract";
import { BodyText } from "@bentley/ui-core";
import { PropertyEditorProps, TypeEditor } from "./EditorContainer";
import { PropertyEditorBase, PropertyEditorManager } from "./PropertyEditorManager";
import { PopupButton, PopupContent, PopupOkCancelButtons } from "./PopupButton";
import { TimeField, TimeSpec } from "../datepicker/TimeField";
import { TypeConverter } from "../converters/TypeConverter";
import { adjustDateToTimezone, DatePicker } from "../datepicker/DatePicker";
import { TypeConverterManager } from "../converters/TypeConverterManager";
import { DateTimeTypeConverterBase } from "../converters/DateTimeTypeConverter";

// cSpell:ignore datepicker

/** @internal */
interface DateTimeEditorState {
  value: Date;
  displayValue?: string;
  timeDisplay?: TimeDisplay;
  isDisabled?: boolean;
  typeConverter?: TypeConverter;
  editInUtc: boolean;
}

/** @internal */
interface DateTimeEditorProps extends PropertyEditorProps {
  showTime?: boolean;
}

/** DateTimeEditor React component that is a property editor for selection of date and time.
 * @internal
 */
export class DateTimeEditor extends React.PureComponent<DateTimeEditorProps, DateTimeEditorState> implements TypeEditor {
  private _isMounted = false;
  private _enterKey = false;
  private _divElement = React.createRef<HTMLDivElement>();

  /** @internal */
  public override readonly state: Readonly<DateTimeEditorState> = {
    value: new Date(),
    editInUtc: false,
  };

  public async getPropertyValue(): Promise<PropertyValue | undefined> {
    const record = this.props.propertyRecord;
    let propertyValue: PropertyValue | undefined;

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      propertyValue = {
        valueFormat: PropertyValueFormat.Primitive,
        value: this.state.value,
        displayValue: this.state.displayValue,
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

  public async processDateChange(typeConverter: TypeConverter, newValue: Date): Promise<void> {
    // istanbul ignore else
    if (this.props.propertyRecord) {
      const displayValue = await typeConverter.convertPropertyToString(this.props.propertyRecord.property, newValue);
      this.setState({
        value: newValue,
        displayValue,
      });
    }
  }

  private _handleChange = (newValue: Date): void => {
    // istanbul ignore else
    if (this._isMounted && this.state.typeConverter) {
      // istanbul ignore else
      if (this.state.editInUtc) {
        newValue = adjustDateToTimezone(newValue, newValue.getTimezoneOffset() * -1);
      }

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.processDateChange(this.state.typeConverter, newValue);
    }
  };

  private _handleTimeChange = (time: TimeSpec): void => {
    // Combine new time into selected Date
    if (this.state.editInUtc) {
      const newWorkingDate = adjustDateToTimezone(this.state.value, 0);
      newWorkingDate.setUTCHours(time.hours, time.minutes, time.seconds);
      this._handleChange(newWorkingDate);
    } else {
      const newWorkingDate = new Date(this.state.value.getTime());
      newWorkingDate.setHours(time.hours, time.minutes, time.seconds);
      this._handleChange(newWorkingDate);
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
    const record = this.props.propertyRecord;
    let initialValue: Date | undefined;
    let typeConverter: TypeConverter | undefined;
    let timeDisplay: TimeDisplay | undefined;
    let alternateDateFormat = AlternateDateFormats.None;
    let editInUtc = false;

    // istanbul ignore else
    if (this.props.showTime)
      timeDisplay = TimeDisplay.H12MC;

    // istanbul ignore else
    if (record && record.value.valueFormat === PropertyValueFormat.Primitive) {
      // istanbul ignore else
      if (record.value.value instanceof Date)
        initialValue = new Date(record.value.value);
      else if (typeof record.value.value === "string")
        initialValue = new Date(record.value.value);

      typeConverter = TypeConverterManager.getConverter(record.property.typename, record.property.converter?.name);

      const options = record.property.converter?.options;
      if (options) {
        // istanbul ignore else
        if ("alternateDateFormat" in options) {
          // istanbul ignore else
          if (DateTimeTypeConverterBase.isAlternateDateFormats(options.alternateDateFormat)) {
            timeDisplay = TimeDisplay.H24MS;
            alternateDateFormat = options.alternateDateFormat;
          }
        }

        if ("timeDisplay" in options && this.props.showTime) {
          timeDisplay = options.timeDisplay;
          // use 24 hr time display if alternateDateFormat is defined
          // istanbul ignore next
          if (alternateDateFormat && timeDisplay !== TimeDisplay.H24MS && timeDisplay !== TimeDisplay.H24M)
            timeDisplay = TimeDisplay.H24MS;
        }

        // istanbul ignore else
        if (alternateDateFormat) {
          editInUtc = true;

          if (this.props.showTime) {
            if (alternateDateFormat === AlternateDateFormats.IsoShort) {
              alternateDateFormat = AlternateDateFormats.IsoDateTime;
            }
            if (alternateDateFormat === AlternateDateFormats.UtcShort) {
              alternateDateFormat = AlternateDateFormats.UtcDateTime;
            }
            if (alternateDateFormat === AlternateDateFormats.UtcShortWithDay) {
              alternateDateFormat = AlternateDateFormats.UtcDateTimeWithDay;
            }
          } else {
            timeDisplay = undefined;
            if (alternateDateFormat === AlternateDateFormats.IsoDateTime)
              alternateDateFormat = AlternateDateFormats.IsoShort;
            if (alternateDateFormat === AlternateDateFormats.UtcDateTime)
              alternateDateFormat = AlternateDateFormats.UtcShort;
            if (alternateDateFormat === AlternateDateFormats.UtcDateTimeWithDay)
              alternateDateFormat = AlternateDateFormats.UtcShortWithDay;
          }
        }
      }
    }

    // istanbul ignore next
    if (!initialValue) {
      throw new Error("Bad Value");
    }

    // istanbul ignore next
    if (!typeConverter) {
      throw new Error("Unable to determine TypeConverter");
    }

    const isDisabled = record && !!record.isDisabled;
    const displayValue = await typeConverter.convertPropertyToString(record!.property, initialValue);

    // istanbul ignore else
    if (this._isMounted)
      this.setState({
        value: initialValue,
        isDisabled,
        timeDisplay,
        typeConverter,
        displayValue,
        editInUtc,
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
      // istanbul ignore next
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
    const date = this.state.editInUtc ? adjustDateToTimezone(this.state.value, 0) : this.state.value;
    const timeSpec: TimeSpec = {
      hours: date.getHours(),
      minutes: date.getMinutes(),
      seconds: date.getSeconds(),
    };

    const className = classnames("components-cell-editor", "components-datetime-editor", this.props.className);

    return (
      <div className={className} ref={this._divElement}>
        <PopupButton label={this.state.displayValue} onClose={this._handleClose} onEnter={this._handleEnter}
          setFocus={this.props.setFocus}>
          <PopupContent>
            <>
              <div className="components-date-picker-calendar-popup-panel" data-testid="components-date-picker-calendar-popup-panel">
                <DatePicker selected={date} onDateChange={this._handleChange} showFocusOutline={false} />
                {this.state.timeDisplay &&
                  <div className="time-container">
                    <BodyText className="time-label">{"Time"}</BodyText>
                    <TimeField time={timeSpec} timeDisplay={this.state.timeDisplay} onTimeChange={this._handleTimeChange} />
                  </div>
                }
              </div>
            </>
            <PopupOkCancelButtons onOk={this._handleOk} onCancel={this._handleCancel} />
          </PopupContent>
        </PopupButton>
      </div>
    );
  }
}

/** DateTime Property Editor registered for the "number" type name and "DateTime" editor name.
  * It uses the [[DateTimeEditor]] React component.
  * @internal
  */
export class ShortDateTimePropertyEditor extends PropertyEditorBase {
  public get reactNode(): React.ReactNode {
    return <DateTimeEditor showTime={false} />;
  }
  // istanbul ignore next
  public override get containerHandlesTab(): boolean {
    return false;
  }
}

/** DateTime Property Editor registered for the "number" type name and "DateTime" editor name.
  * It uses the [[DateTimeEditor]] React component.
  * @internal
  */
export class DateTimePropertyEditor extends PropertyEditorBase {
  public get reactNode(): React.ReactNode {
    return <DateTimeEditor showTime={true} />;
  }
  // istanbul ignore next
  public override get containerHandlesTab(): boolean {
    return false;
  }
}

PropertyEditorManager.registerEditor(StandardTypeNames.ShortDate, ShortDateTimePropertyEditor);
PropertyEditorManager.registerEditor(StandardTypeNames.DateTime, DateTimePropertyEditor);
