import { Logger } from "@bentley/bentleyjs-core";
/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module TypeConverters
 */

import { AlternateDateFormats, Primitives, StandardTypeNames, TimeDisplay } from "@bentley/ui-abstract";
import { TimeFormat } from "@bentley/ui-core";
import { formatInputDate } from "../datepicker/DateField";
import { adjustDateToTimezone } from "../datepicker/DatePicker";
import { UiComponents } from "../UiComponents";
import { LessGreaterOperatorProcessor, TypeConverter } from "./TypeConverter";
import { TypeConverterManager } from "./TypeConverterManager";
import { ConvertedPrimitives } from "./valuetypes/ConvertedTypes";

// cSpell:ignore datepicker valuetypes

/**
 * DateTime Type Converter.
 * @public
 */
export abstract class DateTimeTypeConverterBase extends TypeConverter implements LessGreaterOperatorProcessor {
  public override convertToString(value?: Primitives.Value) {
    if (value === undefined)
      return "";

    if (typeof value === "string")
      value = new Date(value);

    // istanbul ignore else
    if (value instanceof Date) {
      switch (this.getTimeFormat()) {
        case TimeFormat.Short: return value.toLocaleDateString();
        case TimeFormat.Long: return value.toLocaleString();
      }
      return value.toISOString();
    }

    // istanbul ignore next
    return value.toString();
  }

  public static isValidTimeDisplay(type: TimeDisplay): boolean {
    return Object.keys(TimeDisplay).some((key) => (TimeDisplay as any)[key] === type);
  }

  public static isAlternateDateFormats(type: AlternateDateFormats): boolean {
    return Object.keys(AlternateDateFormats).some((key) => (AlternateDateFormats as any)[key] === type);
  }

  // supported options:
  //    timeDisplay?: TimeDisplay
  //    alternateDateFormat?: AlternateDateFormats
  public override convertToStringWithOptions(value?: Primitives.Value, options?: { [key: string]: any }): string | Promise<string> {
    if (value === undefined)
      return "";

    if (options) {
      let timeDisplay: TimeDisplay | undefined = (this.getTimeFormat() === TimeFormat.Long) ? TimeDisplay.H12MC : undefined;
      let alternateDateFormat = AlternateDateFormats.None;

      // istanbul ignore else
      if ("alternateDateFormat" in options && DateTimeTypeConverterBase.isAlternateDateFormats(options.alternateDateFormat)) {
        alternateDateFormat = options.alternateDateFormat;
      }

      if (this.getTimeFormat() === TimeFormat.Long) {
        // istanbul ignore else
        if ("timeDisplay" in options) {
          // istanbul ignore if
          if (alternateDateFormat) {
            Logger.logInfo(UiComponents.loggerCategory(this), `Invalid specification of timeDisplay with alternateDateFormat specification`);
          } else {
            // istanbul ignore else
            if (DateTimeTypeConverterBase.isValidTimeDisplay(options.timeDisplay))
              timeDisplay = options.timeDisplay;
          }
        }
      }

      // istanbul ignore else
      if (typeof value === "string") {
        value = new Date(value);  // this value will be based on local time zone
        // istanbul ignore else
        if (value instanceof Date && alternateDateFormat) {
          // alternateDateFormat displays UTC time, so assume string is specifying UTC Date and Time
          value = adjustDateToTimezone(value, value.getTimezoneOffset() * -1);
        }
      }

      // istanbul ignore else
      if (value instanceof Date) {
        // Ensure if alternateDateFormat is specified make sure it matches proper Long/Short format.
        if (this.getTimeFormat() === TimeFormat.Long) {
          if (alternateDateFormat === AlternateDateFormats.IsoShort)
            alternateDateFormat = AlternateDateFormats.IsoDateTime;
          if (alternateDateFormat === AlternateDateFormats.UtcShort)
            alternateDateFormat = AlternateDateFormats.UtcDateTime;
          if (alternateDateFormat === AlternateDateFormats.UtcShortWithDay)
            alternateDateFormat = AlternateDateFormats.UtcDateTimeWithDay;
        } else {
          // short time format
          if (alternateDateFormat === AlternateDateFormats.IsoDateTime)
            alternateDateFormat = AlternateDateFormats.IsoShort;
          if (alternateDateFormat === AlternateDateFormats.UtcDateTime)
            alternateDateFormat = AlternateDateFormats.UtcShort;
          if (alternateDateFormat === AlternateDateFormats.UtcDateTimeWithDay)
            alternateDateFormat = AlternateDateFormats.UtcShortWithDay;
        }

        const formattedDateTime = formatInputDate(value, timeDisplay, undefined, alternateDateFormat);
        // istanbul ignore else
        if (formattedDateTime)
          return formattedDateTime;
      }
    }

    return this.convertToString(value);
  }

  /** Default implementation just calls convertFromString with no options */
  public override convertFromStringWithOptions(value: string, options?: { [key: string]: any }): ConvertedPrimitives.Value | undefined | Promise<ConvertedPrimitives.Value | undefined> {
    if (!value)
      return undefined;

    if (options) {
      let alternateDateFormat = AlternateDateFormats.None;

      // istanbul ignore else
      if ("alternateDateFormat" in options && DateTimeTypeConverterBase.isAlternateDateFormats(options.alternateDateFormat)) {
        alternateDateFormat = options.alternateDateFormat;
      }

      // istanbul ignore else
      let date = new Date(value);  // this value will be based on local time zone
      // istanbul ignore else
      if (date instanceof Date && alternateDateFormat) {
        // alternateDateFormat displays UTC time, so assume string is specifying UTC Date and Time
        date = adjustDateToTimezone(date, date.getTimezoneOffset() * -1);
      }
    }

    return this.convertFromString(value);
  }

  private isDateValid(date: Date) {
    return date instanceof Date && !isNaN(+date);
  }

  public override convertFromString(value: string) {
    if (!value)
      return undefined;

    const dateValue = new Date(value);

    if (!this.isDateValid(dateValue))
      return undefined;

    return dateValue;
  }

  protected abstract getTimeFormat(): TimeFormat;

  public override get isLessGreaterType(): boolean { return true; }

  public sortCompare(valueA: Date, valueB: Date, _ignoreCase?: boolean): number {
    return valueA.valueOf() - valueB.valueOf();
  }

  public override isEqualTo(valueA: Date, valueB: Date): boolean {
    return valueA.valueOf() === valueB.valueOf();
  }

  public override isNotEqualTo(valueA: Date, valueB: Date): boolean {
    return valueA.valueOf() !== valueB.valueOf();
  }

  public isLessThan(a: Date, b: Date): boolean {
    return a.valueOf() < b.valueOf();
  }

  public isLessThanOrEqualTo(a: Date, b: Date): boolean {
    return a.valueOf() <= b.valueOf();
  }

  public isGreaterThan(a: Date, b: Date): boolean {
    return a.valueOf() > b.valueOf();
  }

  public isGreaterThanOrEqualTo(a: Date, b: Date): boolean {
    return a.valueOf() >= b.valueOf();
  }
}

/**
 * Short Date Type Converter.
 * @public
 */
export class ShortDateTypeConverter extends DateTimeTypeConverterBase {
  protected getTimeFormat(): TimeFormat { return TimeFormat.Short; }
}
TypeConverterManager.registerConverter(StandardTypeNames.ShortDate, ShortDateTypeConverter);

/**
 * Date Time Type Converter.
 * @public
 */
export class DateTimeTypeConverter extends DateTimeTypeConverterBase {
  protected getTimeFormat(): TimeFormat { return TimeFormat.Long; }
}
TypeConverterManager.registerConverter(StandardTypeNames.DateTime, DateTimeTypeConverter);
