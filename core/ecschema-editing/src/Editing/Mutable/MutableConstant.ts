/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Constant, LazyLoadedPhenomenon } from "@bentley/ecschema-metadata";

/**
 * @internal
 * An abstract class used for schema editing.
 */
export abstract class MutableConstant extends Constant {
  public abstract override setPhenomenon(phenomenon: LazyLoadedPhenomenon): void;
  public abstract override setDefinition(definition: string): void;
  public abstract override setNumerator(numerator: number): void;
  public abstract override setDenominator(denominator: number): void;
  public abstract override setDisplayLabel(displayLabel: string): void;
}
