/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { InvertedUnit, LazyLoadedUnit, LazyLoadedUnitSystem } from "@bentley/ecschema-metadata";

/**
 * @internal
 * An abstract class used for schema editing.
 */
export abstract class MutableInvertedUnit extends InvertedUnit {
  public abstract override setInvertsUnit(invertsUnit: LazyLoadedUnit): void;
  public abstract override setUnitSystem(unitSystem: LazyLoadedUnitSystem): void;
  public abstract override setDisplayLabel(displayLabel: string): void;
}
