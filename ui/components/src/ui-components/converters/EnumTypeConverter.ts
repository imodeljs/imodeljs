/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module TypeConverters
 */

import { EnumerationChoice, EnumerationChoicesInfo, Primitives, PropertyDescription, StandardTypeNames } from "@bentley/ui-abstract";
import { TypeConverter } from "./TypeConverter";
import { TypeConverterManager } from "./TypeConverterManager";

/**
 * Enum Type Converter.
 * @public
 */
export class EnumTypeConverter extends TypeConverter {
  public override convertPropertyToString(propertyDescription: PropertyDescription, value?: Primitives.Enum) {
    if (value === undefined)
      return "";

    if (propertyDescription.enum) {
      return this.getMatchingStringValue(propertyDescription.enum, value);
    }

    return super.convertToString(value);
  }

  private async getMatchingStringValue(enumVal: EnumerationChoicesInfo, value: Primitives.Enum) {
    let choices: EnumerationChoice[] = [];

    if (enumVal.choices instanceof Promise) {
      choices = await enumVal.choices;
    } else {
      choices = enumVal.choices;
    }

    const pos = this.getPosition(choices, value);
    if (-1 !== pos)
      return choices[pos].label;

    return this.convertToString(value);
  }

  private getPosition(choices: EnumerationChoice[], value: Primitives.Enum): number {
    for (let i = 0; i < choices.length; ++i) {
      if (choices[i].value === value)
        return i;
    }
    return -1;
  }

  public sortCompare(a: Primitives.Enum, b: Primitives.Enum, ignoreCase?: boolean): number {
    if (isNaN(+a) || isNaN(+b)) {
      return TypeConverterManager.getConverter("string").sortCompare(a, b, ignoreCase);
    }

    return (+a) - (+b);
  }
}

TypeConverterManager.registerConverter(StandardTypeNames.Enum, EnumTypeConverter);
