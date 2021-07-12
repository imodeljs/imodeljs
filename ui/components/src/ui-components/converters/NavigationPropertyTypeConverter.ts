/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/**
 * @packageDocumentation
 * @module TypeConverters
 */

import { Primitives, PropertyDescription, StandardTypeNames } from "@bentley/ui-abstract";
import { TypeConverter } from "./TypeConverter";
import { TypeConverterManager } from "./TypeConverterManager";

/**
 * Navigation property type converter.
 * @public
 */
export class NavigationPropertyTypeConverter extends TypeConverter {
  public override convertPropertyToString(propertyDescription: PropertyDescription, value?: Primitives.Value) {
    return value === undefined ? "" : propertyDescription.displayLabel;
  }

  public sortCompare(a: Primitives.Value, b: Primitives.Value, ignoreCase?: boolean): number {
    return TypeConverterManager
      .getConverter(StandardTypeNames.Hexadecimal)
      .sortCompare((a as Primitives.InstanceKey).id, (b as Primitives.InstanceKey).id, ignoreCase);
  }
}

TypeConverterManager.registerConverter(StandardTypeNames.Navigation, NavigationPropertyTypeConverter);
