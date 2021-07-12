/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */
import { Geometry } from "../../Geometry";
import { CubicEvaluator } from "./CubicEvaluator";
import { SimpleNewton } from "../../numerics/Newton";
/**
 * Czech cubic.
 * This is y= m*x^3 with
 * * x any point on the x axis
 * * `fraction` along the spiral goes to `x = fraction * L`
 * * m is gamma / (6RL)
 *    * 1/(6RL) is the leading term of the sine series.
 *    * `gamma = 2R/sqrt (4RR-LL)` pushes y down a little bit to simulate the lost series terms.
 * @param localToWorld
 * @param nominalL1
 * @param nominalR1
 * @param activeInterval
 * @internal
 */
export class CzechSpiralEvaluator extends CubicEvaluator {
  public nominalLength1: number;
  public nominalRadius1: number;

  /** Constructor is private.  Caller responsible for cubicM validity. */
  private constructor(length1: number, radius1: number, cubicM: number) {
    super(length1, cubicM);
    this.nominalLength1 = length1;
    this.nominalRadius1 = radius1;
  }
  /**
   * Return the scale factor between simple x^3 / (6RL) cubic and the czech correction.
   * * For typical case with l1/R1 smallish, this is just less than 1.0:
   *   (0.25==>0.99215), (0.15==>0.997184), (0.10==>0.998749), (0.05==>999687)
   * @param length1
   * @param radius1
   */
  public static gammaConstant(length1: number, radius1: number): number | undefined {
    return 2.0 * radius1 / Math.sqrt(4.0 * radius1 * radius1 - length1 * length1);
  }
  /** Compute the czech cubic constant. */
  public static computeCubicM(length1: number, radius1: number): number | undefined {
    const gamma = CzechSpiralEvaluator.gammaConstant(length1, radius1);
    // In the private update method, the LR values should have been vetted.
    if (gamma === undefined)
      return undefined;
    // If radius is negative, it shows up in gamma.  But the a signed denominator undoes it.  So take abs of denominator.
    return gamma / Math.abs((6.0 * radius1 * length1));
  }

  public static create(length1: number, radius1: number): CzechSpiralEvaluator | undefined {
    const m = this.computeCubicM(length1, radius1);
    if (m === undefined)
      return undefined;
    return new CzechSpiralEvaluator(length1, radius1, m);
  }

  public override scaleInPlace(scaleFactor: number) {
    this.nominalLength1 *= scaleFactor;
    this.nominalRadius1 *= scaleFactor;
    super.scaleInPlace(scaleFactor);
  }
  /** return a deep copy of the evaluator */
  public clone(): CzechSpiralEvaluator { return new CzechSpiralEvaluator(this.nominalLength1, this.nominalRadius1, this.cubicM); }
  /** Member by member matchup ... */
  public isAlmostEqual(other: any): boolean {
    if (other instanceof CzechSpiralEvaluator) {
      return Geometry.isSameCoordinate(this.nominalLength1, other.nominalLength1)
        && Geometry.isSameCoordinate(this.nominalRadius1, other.nominalRadius1);
    }
    return false;
  }

  /**
   * Return a (fast but mediocre) approximation of spiral length as a function of x axis position.
   * * This x-to-distance relation is not as precise as the CurvePrimitive method moveSignedDistanceFromFraction.
   * * It is supported here for users interested in replicating the Czech distance mapping rather than the more accurate CurvePrimitive measurements.
   * @param x distance along the x axis.
   */
  public xToCzechApproximateDistance(x: number): number {
    return CzechSpiralEvaluator.forwardL2R2Map(x, 1.0, this.nominalLength1, this.nominalRadius1);
  }
  /**
   * Return the inverse of the `forwardL2R2Map` function.
   * * The undefined result can only occur for distances outside the usual spirals.
   * @param s (approximate) distance along the spiral.
   *
   */
  public czechApproximateDistanceToX(d: number): number | undefined {
    return CzechSpiralEvaluator.inverseL2R2Map(d, 1.0, this.nominalLength1, this.nominalRadius1);
  }

  /**
     * evaluate a series expansion that is used with varying signs (plus or minus 1) in czech and italian spirals.
     * @param x distance along the x axis.
     */
  public static forwardL2R2Map(x: number, sign: number, length: number, radius: number): number {
    const l2 = length * length;
    const r2 = radius * radius;
    const Q = 4.0 * r2 - l2;
    const xx = x * x;
    return x * (1.0 + sign * xx * xx / (10.0 * Q * l2));
  }
  /**
   * Return the inverse of the `forwardL2R2Map` function.
   * * The undefined result can only occur for distances outside the usual spirals.
   * @param s (approximate) distance along the spiral.
   *
   */
  public static inverseL2R2Map(b: number, sign: number, length: number, radius: number): number | undefined {
    const l2 = length * length;
    const r2 = radius * radius;
    const Q = 4.0 * r2 - l2;
    const a = sign / (10.0 * Q * l2);
    return SimpleNewton.runNewton1D(b,
      (x: number) => {
        const xx = x * x;
        return x * (1.0 + xx * xx * a) - b;
      },
      (x: number) => {
        const xx = x * x;
        return 1.0 + 5 * xx * xx * a;
      });
  }
}
/**
 * Italian cubic.
 * This is y= m*x^3 with
 * * x any point on the x axis
 * * `fraction` along the spiral goes to `x = fraction * L`
 * * m is gamma / (6RL)
 *    * 1/(6RL) is the leading term of the sine series.
 *    * `gamma = 2R/sqrt (4RR-LL)` pushes y down a little bit to simulate the lost series terms.
 * @param localToWorld
 * @param nominalL1
 * @param nominalR1
 * @param activeInterval
 * @internal
 */
export class ItalianSpiralEvaluator extends CubicEvaluator {
  public nominalLength1: number;
  public nominalRadius1: number;

  /** Compute the czech cubic constant.
   * ** funky mixture of lengths ....
   */
  private static computeCubicM(lengthXByForward: number, radius1: number): number | undefined {
    const gamma = CzechSpiralEvaluator.gammaConstant(lengthXByForward, radius1);
    // In the private update method, the LR values should have been vetted.
    if (gamma === undefined)
      return undefined;
    // If radius is negative, it shows up in gamma.  But the a signed denominator undoes it.  So take abs of denominator.
    return gamma / Math.abs((6.0 * radius1 * lengthXByForward));
  }

  /** Constructor is private.  Caller responsible for cubicM validity. */
  private constructor(length1: number, radius1: number, lengthX: number, cubicM: number) {
    super(lengthX, cubicM);
    this.nominalLength1 = length1;
    this.nominalRadius1 = radius1;
  }
  public static create(length1: number, radius1: number): ItalianSpiralEvaluator | undefined {
    // um ... this seems goofy.  lengthX from forward, then invert for another .   But that's what the native code does ...
    const lengthX = CzechSpiralEvaluator.forwardL2R2Map(length1, -1.0, length1, radius1);
    const lengthX1 = CzechSpiralEvaluator.inverseL2R2Map(length1, 1.0, lengthX, radius1);
    if (lengthX1 === undefined)
      return undefined;
    const m = ItalianSpiralEvaluator.computeCubicM(lengthX, radius1);
    if (m === undefined)
      return undefined;
    return new ItalianSpiralEvaluator(length1, radius1, lengthX1, m);
  }

  public override scaleInPlace(scaleFactor: number) {
    this.nominalLength1 *= scaleFactor;
    this.nominalRadius1 *= scaleFactor;
    super.scaleInPlace(scaleFactor);
  }
  /** return a deep copy of the evaluator */
  public clone(): ItalianSpiralEvaluator { return new ItalianSpiralEvaluator(this.nominalLength1, this.nominalRadius1, super.axisLength, this.cubicM); }
  /** Member by member matchup ... */
  public isAlmostEqual(other: any): boolean {
    if (other instanceof ItalianSpiralEvaluator) {
      return Geometry.isSameCoordinate(this.nominalLength1, other.nominalLength1)
        && Geometry.isSameCoordinate(this.nominalRadius1, other.nominalRadius1);
    }
    return false;
  }
  /**
     * Return a (fast but mediocre) approximation of spiral length as a function of x axis position.
     * * This x-to-distance relation is not as precise as the CurvePrimitive method moveSignedDistanceFromFraction.
     * * It is supported here for users interested in replicating the Czech distance mapping rather than the more accurate CurvePrimitive measurements.
     * @param x distance along the x axis.
     */
  public distanceToItalianApproximateX(x: number): number {
    return CzechSpiralEvaluator.forwardL2R2Map(x, -1.0, this.nominalLength1, this.nominalRadius1);
  }
  /**
   * Return the inverse of the `forwardL2R2Map` function.
   * * The undefined result can only occur for distances outside the usual spirals.
   * @param s (approximate) distance along the spiral.
   *
   */
  public xToItalianApproximateDistance(d: number): number | undefined {
    return CzechSpiralEvaluator.inverseL2R2Map(d, -1.0, this.nominalLength1, this.nominalRadius1);
  }
}
