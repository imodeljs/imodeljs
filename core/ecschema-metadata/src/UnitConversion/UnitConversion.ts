/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Constant, Unit } from "../ecschema-metadata";
import { SchemaItemType } from "../ECObjects";
import { Float } from "./Float";

/**
 * Class used for building unit conversions, storing how to get from source unit to target unit, and evaluating input and converting it to output
 * @alpha
 */
export class UnitConversion {
  /** @internal */
  constructor(public readonly factor: number = 1.0, public readonly offset: number = 0.0) {}

  /**
   * Converts x using UnitConversion
   * @param x Input magnitude to be converted
   * @returns Output magnitude after conversion
   */
  public evaluate(x: number): number {
    return this.factor * x + this.offset;
  }

  /**
   * Compute the UnitConversion's inverse with multiplicative inverse for factor and additive inverse for offset
   * Used to invert source's UnitConversion so that it can be composed with target's UnitConversion cleanly
   * @internal
   */
  public inverse(): UnitConversion {
    const inverseFactor = 1.0 / this.factor;
    return new UnitConversion(inverseFactor, -this.offset * inverseFactor);
  }

  /**
   * Combines two UnitConversion
   * Used to combine source's UnitConversion and target's UnitConversion for a final UnitConversion that can be evaluated
   * @internal
   */
  public compose(conversion: UnitConversion): UnitConversion {
    return new UnitConversion(
      this.factor * conversion.factor,
      conversion.factor * this.offset + conversion.offset
    );
  }

  /**
   * Multiples two UnitConversions together
   * Used during traversal/reducing to get the right factor
   * @internal
   */
  public multiply(conversion: UnitConversion): UnitConversion {
    if (Float.equals(conversion.offset, 0.0) && Float.equals(this.offset, 0.0))
      return new UnitConversion(this.factor * conversion.factor, 0.0);

    throw new Error("Cannot multiply two maps with non-zero offsets");
  }

  /**
   * Raise UnitConversion's factor with power exponent
   * Used during traversal/reducing to get the right factor when there are exponents between nodes
   * @internal
   */
  public raise(power: number): UnitConversion {
    if (Float.equals(1.0, power))
      return new UnitConversion(this.factor, this.offset);
    else if (Float.equals(0.0, power)) return new UnitConversion(1.0, 0.0);

    if (Float.equals(this.offset, 0.0))
      return new UnitConversion(this.factor ** power, 0.0);

    throw new Error("Cannot raise map with non-zero offset");
  }

  /**
   * Returns a default UnitConversion with factor of 1 and offset of 0
   * @internal
   */
  public static identity = new UnitConversion();

  /**
   * Returns UnitConversion with unit's numerator and denominator in factor and unit's offset in offset
   * Used during traversal/reducing where it will be composed
   * @internal
   */
  public static from(unit: Unit | Constant): UnitConversion {
    if (unit.schemaItemType === SchemaItemType.Unit)
      return new UnitConversion(unit.denominator / unit.numerator, -unit.offset);

    return new UnitConversion(unit.denominator / unit.numerator, 0.0);
  }
}
