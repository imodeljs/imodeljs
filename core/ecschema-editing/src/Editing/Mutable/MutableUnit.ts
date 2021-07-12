/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { LazyLoadedPhenomenon, LazyLoadedUnitSystem, Unit } from "@bentley/ecschema-metadata";

/**
 * @internal
 * An abstract class used for schema editing.
 */
export abstract class MutableUnit extends Unit {
  public abstract override setPhenomenon(phenomenon: LazyLoadedPhenomenon): Promise<void>;
  public abstract override setUnitSystem(unitSystem: LazyLoadedUnitSystem): Promise<void>;
  public abstract override setDefinition(definition: string): Promise<void>;
  public abstract override setDisplayLabel(displayLabel: string): void;
}
