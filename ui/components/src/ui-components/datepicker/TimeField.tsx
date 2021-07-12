/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Date
 */

import * as React from "react";
import { Input } from "@itwin/itwinui-react";
import { SpecialKey, TimeDisplay } from "@bentley/ui-abstract";
import { UiComponents } from "../UiComponents";
import "./TimeField.scss";

/** Interface used to hold 24 hour time in
 * hours, minutes, and seconds.
 * @internal
 */
export interface TimeSpec {
  hours: number;
  minutes: number;
  seconds: number;
}

/** Interface for props used by [[TimeField]] component.
 * @internal
 */
export interface TimeFieldProps {
  time: TimeSpec;
  timeDisplay: TimeDisplay;
  onTimeChange?: (time: TimeSpec) => void;
  readOnly?: boolean;
}

function getValidInt(intText: string, min: number, max: number, defaultValue: number) {
  try {
    const newValue = parseInt(intText, 10);
    if (newValue >= min && newValue <= max)
      return newValue;
  } catch (_e) {
    // istanbul ignore next
    return defaultValue;
  }
  return defaultValue;
}

function isSameTime(a: TimeSpec, b: TimeSpec) {
  return a.hours === b.hours && a.minutes === b.minutes && a.seconds === b.seconds;
}

/** Field used to set the Hour:Minutes:Seconds in the [[DataPicker]] Popup panel. The user may key-in the value or use up/down keys to
 * change the time.
 * @internal
 */
export function TimeField({ time, timeDisplay, readOnly, onTimeChange }: TimeFieldProps) {
  const initialDateRef = React.useRef(time);
  const amLabelRef = React.useRef(UiComponents.translate("timepicker.day-period-am"));
  const pmLabelRef = React.useRef(UiComponents.translate("timepicker.day-period-pm"));
  const [timeSpec, setTimeSpec] = React.useState(time);
  const { hours, minutes, seconds } = timeSpec;
  const showDayPeriod = -1 !== (timeDisplay as string).search("aa");

  const getDisplayHours = React.useCallback((timeHours: number) => {
    if (!showDayPeriod) {
      return timeHours;
    }
    const outHours = (0 === timeHours) ? 12 : timeHours > 12 ? timeHours - 12 : timeHours;
    return outHours;
  }, [showDayPeriod]);

  // See if new initialDate props have changed since component mounted
  React.useEffect(() => {
    if (!isSameTime(time, initialDateRef.current)) {
      setTimeSpec(time);
      initialDateRef.current = time;
    }
  }, [time]);

  const displayHour = getDisplayHours(hours);
  const [dayPeriodText, setDayPeriodText] = React.useState(showDayPeriod ? (hours >= 12 ? pmLabelRef.current : amLabelRef.current) : undefined);
  const [hoursText, setHoursText] = React.useState(displayHour.toString().padStart(2, "0"));
  const [minutesText, setMinutesText] = React.useState(minutes.toString().padStart(2, "0"));
  const [secondsText, setSecondsText] = React.useState(seconds.toString().padStart(2, "0"));

  const updateTimeSpec = React.useCallback((newTime: TimeSpec) => {
    if (newTime.hours !== timeSpec.hours || newTime.minutes !== timeSpec.minutes || newTime.seconds !== timeSpec.seconds) {
      setTimeSpec(newTime);
      onTimeChange && onTimeChange(newTime);
    }
  }, [onTimeChange, timeSpec.hours, timeSpec.minutes, timeSpec.seconds]);

  const handleHoursChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setHoursText(event.currentTarget.value);
  }, []);

  const handleMinutesChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setMinutesText(event.currentTarget.value);
  }, []);
  const handleSecondsChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSecondsText(event.currentTarget.value);
  }, []);
  const handleDayPeriodChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setDayPeriodText(event.currentTarget.value);
  }, []);

  const handleHoursOnBlur = React.useCallback(() => {
    const newHours = getValidInt(hoursText, 0, 24, hours);
    setHoursText(getDisplayHours(newHours).toString().padStart(2, "0"));
    updateTimeSpec({ ...timeSpec, hours: newHours });
    showDayPeriod && setDayPeriodText(newHours >= 12 ? pmLabelRef.current : amLabelRef.current);
  }, [getDisplayHours, hours, hoursText, showDayPeriod, timeSpec, updateTimeSpec]);
  const handleMinutesOnBlur = React.useCallback(() => {
    const newMinutes = getValidInt(minutesText, 0, 59, minutes);
    setMinutesText(newMinutes.toString().padStart(2, "0"));
    updateTimeSpec({ ...timeSpec, minutes: newMinutes });
  }, [minutes, minutesText, timeSpec, updateTimeSpec]);
  const handleSecondsOnBlur = React.useCallback(() => {
    const newSeconds = getValidInt(secondsText, 0, 59, seconds);
    setSecondsText(newSeconds.toString().padStart(2, "0"));
    updateTimeSpec({ ...timeSpec, seconds: newSeconds });
  }, [seconds, secondsText, timeSpec, updateTimeSpec]);
  const handleDayPeriodOnBlur = React.useCallback(() => {
    let newPeriodText: string | undefined;
    // istanbul ignore else
    if (dayPeriodText === "AM" || dayPeriodText === "am" || dayPeriodText === amLabelRef.current)
      newPeriodText = amLabelRef.current;
    else if (dayPeriodText === "PM" || dayPeriodText === "pm" || dayPeriodText === pmLabelRef.current)
      newPeriodText = pmLabelRef.current;

    // istanbul ignore else
    if (undefined !== newPeriodText) {
      setDayPeriodText(newPeriodText);
      if (newPeriodText === amLabelRef.current && hours > 12) {
        updateTimeSpec({ ...timeSpec, hours: hours - 12 });
      } else if (newPeriodText === pmLabelRef.current && hours <= 11) {
        updateTimeSpec({ ...timeSpec, hours: hours + 12 });
      }
    }

  }, [dayPeriodText, hours, timeSpec, updateTimeSpec]);

  const handleHoursOnKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    // istanbul ignore else
    if (event.key === SpecialKey.ArrowDown || event.key === SpecialKey.ArrowUp) {
      let newHours = hours + (event.key === SpecialKey.ArrowDown ? -1 : 1);
      if (newHours < 0) newHours = 24;
      if (newHours > 24 || (newHours > 23 && ((minutes + seconds) > 0))) newHours = 0;
      setHoursText(getDisplayHours(newHours).toString().padStart(2, "0"));
      updateTimeSpec({ ...timeSpec, hours: newHours });
      showDayPeriod && setDayPeriodText(newHours >= 12 ? pmLabelRef.current : amLabelRef.current);
      event.preventDefault();
    } else if (event.key === SpecialKey.Enter) {
      const newHours = getValidInt(hoursText, 0, 24, hours);
      setHoursText(getDisplayHours(newHours).toString().padStart(2, "0"));
      updateTimeSpec({ ...timeSpec, hours: newHours });
      showDayPeriod && setDayPeriodText(newHours >= 12 ? pmLabelRef.current : amLabelRef.current);
      event.preventDefault();
    }
  }, [getDisplayHours, hours, hoursText, minutes, seconds, showDayPeriod, timeSpec, updateTimeSpec]);

  const handleMinutesOnKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === SpecialKey.ArrowDown) {
      const newMinutes = minutes === 0 ? 59 : minutes - 1;
      setMinutesText(newMinutes.toString().padStart(2, "0"));
      updateTimeSpec({ ...timeSpec, minutes: newMinutes });
      event.preventDefault();
    } else if (event.key === SpecialKey.ArrowUp) {
      const newMinutes = minutes === 59 ? 0 : minutes + 1;
      setMinutesText(newMinutes.toString().padStart(2, "0"));
      updateTimeSpec({ ...timeSpec, minutes: newMinutes });
      event.preventDefault();
    } else if (event.key === SpecialKey.Home || event.key === SpecialKey.End) {
      const newMinutes = event.key === SpecialKey.Home ? 0 : 59;
      setMinutesText(newMinutes.toString().padStart(2, "0"));
      updateTimeSpec({ ...timeSpec, minutes: newMinutes });
      event.preventDefault();
    } else /* istanbul ignore next */ if (event.key === SpecialKey.Enter) {
      const newMinutes = getValidInt(minutesText, 0, 59, minutes);
      setMinutesText(newMinutes.toString().padStart(2, "0"));
      updateTimeSpec({ ...timeSpec, minutes: newMinutes });
      event.preventDefault();
    }
  }, [minutesText, minutes, timeSpec, updateTimeSpec]);

  const handleSecondsOnKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    // istanbul ignore else
    if (event.key === SpecialKey.ArrowDown) {
      const newSeconds = seconds === 0 ? 59 : seconds - 1;
      setSecondsText(newSeconds.toString().padStart(2, "0"));
      updateTimeSpec({ ...timeSpec, seconds: newSeconds });
      event.preventDefault();
    } else if (event.key === SpecialKey.ArrowUp) {
      const newSeconds = seconds === 59 ? 0 : seconds + 1;
      setSecondsText(newSeconds.toString().padStart(2, "0"));
      updateTimeSpec({ ...timeSpec, seconds: newSeconds });
      event.preventDefault();
    } else if (event.key === SpecialKey.Home || event.key === SpecialKey.End) {
      const newSeconds = event.key === SpecialKey.Home ? 0 : 59;
      setSecondsText(newSeconds.toString().padStart(2, "0"));
      updateTimeSpec({ ...timeSpec, seconds: newSeconds });
      event.preventDefault();
    } else if (event.key === SpecialKey.Enter) {
      const newSeconds = getValidInt(secondsText, 0, 59, seconds);
      setSecondsText(newSeconds.toString().padStart(2, "0"));
      updateTimeSpec({ ...timeSpec, seconds: newSeconds });
      event.preventDefault();
    }
  }, [seconds, secondsText, timeSpec, updateTimeSpec]);

  const handleDayPeriodOnKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    let newPeriodText: string | undefined;
    // istanbul ignore else
    if (event.key === SpecialKey.ArrowDown || event.key === SpecialKey.Home || event.key === "a" || event.key === "A") {
      newPeriodText = amLabelRef.current;
      event.preventDefault();
    } else if (event.key === SpecialKey.ArrowUp || event.key === SpecialKey.End || event.key === "p" || event.key === "P") {
      newPeriodText = pmLabelRef.current;
      event.preventDefault();
    } else if (event.key === SpecialKey.Enter) {
      if (dayPeriodText === "AM" || dayPeriodText === "am" || dayPeriodText === amLabelRef.current)
        newPeriodText = amLabelRef.current;
      else if (dayPeriodText === "PM" || dayPeriodText === "pm" || dayPeriodText === pmLabelRef.current)
        newPeriodText = pmLabelRef.current;
      event.preventDefault();
    }
    // istanbul ignore else
    if (undefined !== newPeriodText) {
      setDayPeriodText(newPeriodText);
      /* istanbul ignore else */
      if (newPeriodText === amLabelRef.current && hours > 12) {
        updateTimeSpec({ ...timeSpec, hours: hours - 12 });
      } else if (newPeriodText === pmLabelRef.current && hours <= 11) {
        updateTimeSpec({ ...timeSpec, hours: hours + 12 });
      }
    }
  }, [dayPeriodText, hours, timeSpec, updateTimeSpec]);

  const showSeconds = -1 !== (timeDisplay as string).search(":ss");

  return <div data-testid="components-time-input" className="components-time">
    <Input className="components-time-input" onKeyDown={handleHoursOnKeyDown} onBlur={handleHoursOnBlur} onChange={handleHoursChange} value={hoursText} disabled={readOnly} />
    <span className="component-time-separator">:</span>
    <Input className="components-time-input" onKeyDown={handleMinutesOnKeyDown} onBlur={handleMinutesOnBlur} onChange={handleMinutesChange} value={minutesText} disabled={readOnly} />
    {showSeconds &&
      <>
        <span className="component-time-separator">:</span>
        <Input className="components-time-input" onKeyDown={handleSecondsOnKeyDown} onBlur={handleSecondsOnBlur} onChange={handleSecondsChange} value={secondsText} disabled={readOnly} />
      </>
    }
    {dayPeriodText &&
      <Input className="components-time-period-input" onKeyDown={handleDayPeriodOnKeyDown} onBlur={handleDayPeriodOnBlur} onChange={handleDayPeriodChange} value={dayPeriodText} disabled={readOnly} />
    }
  </div>;
}
