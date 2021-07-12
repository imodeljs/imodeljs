/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Date
 */

import "./DateField.scss";
import * as React from "react";
import classnames from "classnames";
import { AlternateDateFormats, DateFormatter, TimeDisplay } from "@bentley/ui-abstract";
import { CommonProps } from "@bentley/ui-core";
import { Input } from "@itwin/itwinui-react";
import { Logger } from "@bentley/bentleyjs-core";

/** Props for [[DateField]] Component.
 * @internal
 */
export interface DateFieldProps extends CommonProps {
  /** Defines initial date and time for component. */
  initialDate: Date;
  /** Function to call when the date or time is changed. */
  onDateChange?: (day: Date) => void;
  /** Optional value to define if edit field allows editing. If a DateFormatter is provided
   * it must provide a parseData function or the field will be read only no matter the setting of this value. */
  readOnly?: boolean;
  /** Optional date formatter that produces an explicit date display */
  dateFormatter?: DateFormatter;
  /** This property has two purposes, the first is specify that the display of time is desired and the second is to define the format of the time display. */
  timeDisplay?: TimeDisplay;
}

/** Function to format a Date object that is used in control, type editor, and type converter
 * to produce a consistent formatted Date string.
 * @internal
 */
export function formatInputDate(inputDate: Date, timeDisplay?: TimeDisplay, customFormatter?: DateFormatter, alternateDateFormat?: AlternateDateFormats): string | undefined {
  if (customFormatter) {
    return customFormatter.formateDate(inputDate);
  }

  if (alternateDateFormat) {
    switch (alternateDateFormat) {
      case AlternateDateFormats.IsoDateTime:
        return inputDate.toISOString();
      case AlternateDateFormats.IsoShort:
        return inputDate.toISOString().slice(0, 10);
      case AlternateDateFormats.UtcDateTime:
        return inputDate.toUTCString().slice(5);
      case AlternateDateFormats.UtcShort:
        return inputDate.toUTCString().slice(5, 16);
      case AlternateDateFormats.UtcDateTimeWithDay:
        return inputDate.toUTCString();
      case AlternateDateFormats.UtcShortWithDay:
        return inputDate.toUTCString().slice(0, 16);
    }
  } else {
    const dateString = inputDate.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
    let timeString: string = "";

    if (timeDisplay) {
      switch (timeDisplay) {
        case TimeDisplay.H12MC:
          timeString = inputDate.toLocaleTimeString(undefined, { hour12: true, hour: "2-digit", minute: "2-digit" });
          break;
        case TimeDisplay.H12MSC:
          timeString = (inputDate.toLocaleTimeString(undefined, { hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit" }));
          break;
        case TimeDisplay.H24M:
          timeString = (inputDate.toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit" }));
          // istanbul ignore next
          if (timeString === "24:00")
            timeString = "00:00";
          break;
        case TimeDisplay.H24MS:
          timeString = (inputDate.toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }));
          // istanbul ignore next
          if (timeString === "24:00:00")
            timeString = "00:00:00";
          break;
      }
    }
    return timeString.length ? `${dateString}, ${timeString}` : dateString;
  }
}

/** Date input component. This component is typically used by the [[DatePickerPopupButton]] to display and edit date and time.
 * @internal
 */
export function DateField({ initialDate, onDateChange, readOnly, dateFormatter, timeDisplay, style, className }: DateFieldProps) {
  const initialDateRef = React.useRef(initialDate);
  const [hasBadInput, setHasBadInput] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(formatInputDate(initialDate, timeDisplay, dateFormatter));

  // See if new initialDate props have changed since component mounted
  React.useEffect(() => {
    // istanbul ignore else
    if (initialDate.getTime() !== initialDateRef.current.getTime()) {
      initialDateRef.current = initialDate;
    }
    setInputValue(formatInputDate(initialDate, timeDisplay, dateFormatter));
  }, [initialDate, dateFormatter, timeDisplay]);

  const handleInputChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.currentTarget.value);
  }, []);

  const parseDate = React.useCallback((dateString: string) => {
    try {
      if (dateFormatter && dateFormatter.parseDate)
        return dateFormatter.parseDate(dateString);

      const newDateValue = Date.parse(dateString);
      // istanbul ignore else
      if (newDateValue)
        return new Date(newDateValue);
    } catch (_error) /* istanbul ignore next */ {
      Logger.logInfo("DateField", `Encountered error parsing input value '${dateString}' as a date.`);
      return undefined;
    }
    // istanbul ignore next
    return undefined;
  }, [dateFormatter]);

  const updateInputDate = React.useCallback((dateString: string) => {
    try {
      const newDateValue = parseDate(dateString);
      if (newDateValue) {
        const newDate = new Date(newDateValue);
        onDateChange && onDateChange(newDate);
        setHasBadInput(false);
      } else {
        setHasBadInput(true);
      }
    } catch (_error) {
      // istanbul ignore next
      setHasBadInput(true);
    }
  }, [onDateChange, parseDate]);

  const handleOnBlur = React.useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    updateInputDate(event.target.value);
  }, [updateInputDate]);

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    // istanbul ignore else
    if (event.key === "Enter") {
      updateInputDate(event.currentTarget.value);
      event.preventDefault();
    }
  }
  const classNames = classnames(className, "components-date-input", hasBadInput && "components-date-has-error");
  return <Input data-testid="components-date-input" style={style} className={classNames} onKeyDown={onInputKeyDown} onBlur={handleOnBlur}
    onChange={handleInputChange} value={inputValue} disabled={readOnly || (dateFormatter && !(dateFormatter.parseDate))} />;
}
