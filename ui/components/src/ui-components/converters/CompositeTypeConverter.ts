/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module TypeConverters
 */

import { Primitives, StandardTypeNames } from "@bentley/ui-abstract";
import { TypeConverter } from "./TypeConverter";
import { TypeConverterManager } from "./TypeConverterManager";

/**
 * Composite type converter
 * @public
 */
export class CompositeTypeConverter extends TypeConverter {
  public override convertToString(value?: Primitives.Composite): string | Promise<string> {
    if (value === undefined)
      return "";
    return createDisplayValue(value);
  }

  public sortCompare(valueA: Primitives.Composite, valueB: Primitives.Composite, ignoreCase?: boolean | undefined): number {
    const length = Math.min(valueA.parts.length, valueB.parts.length);
    const separatorComparison = compareStrings(valueA.separator, valueB.separator, ignoreCase);
    for (let i = 0; i < length; i++) {
      const lhs = valueA.parts[i];
      const rhs = valueB.parts[i];
      const compareResult = lhs.typeName !== rhs.typeName ? compareStrings(lhs.displayValue, rhs.displayValue, ignoreCase)
        : TypeConverterManager.getConverter(lhs.typeName).sortCompare(lhs.rawValue, rhs.rawValue, ignoreCase);
      if (compareResult !== 0)
        return compareResult;

      if (i === 0 && separatorComparison !== 0)
        return separatorComparison;
    }

    if (valueA.parts.length !== valueB.parts.length)
      return valueA.parts.length - valueB.parts.length;

    return 0;
  }
}

TypeConverterManager.registerConverter(StandardTypeNames.Composite, CompositeTypeConverter);

const compareStrings = (lhs: string, rhs: string, ignoreCase?: boolean) => {
  if (ignoreCase)
    return lhs.toLocaleLowerCase().localeCompare(rhs.toLocaleLowerCase());
  else
    return lhs.localeCompare(rhs);
};

const createDisplayValue = async (compositeValue: Primitives.Composite): Promise<string> => {
  const parts: string[] = [];
  for (const part of compositeValue.parts) {
    let valueString: string;
    if (part.typeName === "composite") {
      valueString = await createDisplayValue(part.rawValue as Primitives.Composite);
    } else {
      valueString = await TypeConverterManager.getConverter(part.typeName).convertToString(part.rawValue);
    }

    parts.push(valueString);
  }

  return parts.join(compositeValue.separator);
};
