/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */
import { Geometry } from "../../Geometry";
import { Angle } from "../../geometry3d/Angle";
import { CubicEvaluator } from "./CubicEvaluator";
/**
 * AustralianRailCorp spiral (also known as New South Wales spiral)
 * * The ultimate curve is a cubic `y = m * x^3`.
 * * `m` is a constant throughout the curve.
 * * Computation of m from the R and L is an complicated sequence, but is only done at construction time.
 * @internal
 */
export class AustralianRailCorpXYEvaluator extends CubicEvaluator {
  private _nominalLength1: number;
  private _nominalRadius1: number;
  private constructor(nominalLength1: number, nominalRadius1: number, axisLength: number, cubicM: number) {
    super(axisLength, cubicM);
    this._nominalLength1 = nominalLength1;
    this._nominalRadius1 = nominalRadius1;
  }
  public get nominalLength1() { return this._nominalLength1; }
  public get nominalRadius1() { return this._nominalRadius1; }
  public clone(): AustralianRailCorpXYEvaluator { return new AustralianRailCorpXYEvaluator(this._nominalLength1, this._nominalRadius1, this._axisLength, this._cubicM); }
  public static create(nominalLength1: number, nominalRadius1: number): AustralianRailCorpXYEvaluator | undefined {
    const axisLength = AustralianRailCorpXYEvaluator.radiusAndNominalLengthToAxisLength(nominalRadius1, nominalLength1);
    const phi = this.radiusAndAxisLengthToPhi(nominalRadius1, axisLength);
    const xc2 = axisLength * axisLength;
    const cubicM = Math.tan(phi) / (3.0 * xc2);
    return new AustralianRailCorpXYEvaluator(nominalLength1, nominalRadius1, axisLength, cubicM);
  }
  /**
   * Compute the phi constant for AustralianRail spiral with given end radius and length along axis.
   * @param nominalRadius1
   * @param axisLength
   */
  public static radiusAndAxisLengthToPhi(nominalRadius1: number, axisLength: number): number {
    const xc = axisLength;
    const expr1 = (2. / Math.sqrt(3.));
    let expr2 = (-(3. / 4.) * Math.sqrt(3.) * xc / nominalRadius1);
    if (expr2 < -1.0)
      expr2 = -1.0;
    if (expr2 > 1.0)
      expr2 = 1.0;
    const expr3 = Angle.degreesToRadians(240.);

    return Math.asin(expr1 * Math.cos(Math.acos(expr2) / 3. + expr3));
  }
  public override scaleInPlace(scaleFactor: number) {
    // apply the scale factor to all contents.
    // all distances scale directly . . .
    this._nominalLength1 *= scaleFactor;
    this._nominalRadius1 *= scaleFactor;
    super.scaleInPlace(scaleFactor);
  }
  /** Compute length along axis for AustralianRail spiral nominal radius and length.
   *
   */
  public static radiusAndNominalLengthToAxisLength(nominalRadius1: number, nominalLength1: number, tolerance: number = 1.0e-5,
    requiredConvergenceCount: number = 2) {
    const R = nominalRadius1;
    let idx = 0;
    let m, phi, xc2;

    let xc = .7 * nominalLength1;
    let convergenceCount = 0;
    // remark: This converges quickly --
    // for L=100, R=400
    //   ** full precision at 7th iteration.
    //   ** classic tolerance 1.0e-5 (7 digits from L) with requiredConvergenceCount = 1 gives 11 digits after 3 iterations
    //   ** each iteration adds about 2 digits.   This is quite good for a successive replacement without derivative !!!
    //   ** Unanswerable question: If this is only done once and reused over all evaluations, do you want:
    //       * run the 7 iterations to get full precision
    //       * stop with the classic tolerance to get compatibility?
    for (idx = 0; idx < 100; ++idx) {
      phi = this.radiusAndAxisLengthToPhi(R, xc);
      xc2 = xc * xc;
      m = Math.tan(phi) / (3.0 * xc2);
      const m2x4 = m * m * xc2 * xc2;
      const correction = xc * m2x4 * (
        (9. / 10.) + m2x4 * (
          -(9. / 8.) + m2x4 * (
            +(729. / 208.) + m2x4 *
            -(32805. / 2176.))));
      const correctedLength = xc + correction;
      xc = (nominalLength1 / correctedLength) * xc;

      if (Math.abs(nominalLength1 - correctedLength) < tolerance) {
        convergenceCount++;
        if (convergenceCount >= requiredConvergenceCount)
          break;
      } else {
        convergenceCount = 0;
      }
    }
    return xc;
  }
  public isAlmostEqual(other: any): boolean {
    if (other instanceof AustralianRailCorpXYEvaluator) {
      return Geometry.isAlmostEqualNumber(this._cubicM, other._cubicM)
        && Geometry.isAlmostEqualNumber(this._axisLength, other._axisLength)
        && Geometry.isAlmostEqualNumber(this._nominalLength1, other._nominalLength1)
        && Geometry.isAlmostEqualNumber(this._nominalRadius1, other._nominalRadius1);
    }
    return false;
  }
  /**
   * Return a (quite good approximation) of fraction along x axis for given distance along spiral.
   * * The AustralianRailSpiral has a supporting power series to approximately map distance along the spiral to an x coordinate.
   * * The `xToFraction(x)` method quickly (with a single divide) converts this x to fraction used fro this.fractionToX (fraction), this.fractionToY(fraction) etc to get coordinates and derivatives.
   * * The x-to-distance relation is not as precise as the CurvePrimitive method moveSignedDistanceFromFraction.
   * * It is supported here for users interested in replicating the AustralianRail distance mapping rather than the more accurate CurvePrimitive measurements.
   * * Round tripping distance through (a) distanceAlongSpiralToAustralianApproximateX, (b) xToFraction, and (c) curveLengthBetweenFractions has
   *   * 10 digit accuracy for L/R = 4, 12 digit accuracy for L/R = 10
   * @param s distance along the axis.
   */
  public distanceAlongSpiralToAustralianApproximateX(s: number): number {
    const a1 = 0.9000;
    const a2 = 5.1750;
    const a3 = 43.1948;
    const a4 = 426.0564;
    const m = this._cubicM;
    const m2s4 = m * m * s * s * s * s;
    const x = s * (1.0 - m2s4 * (a1 - m2s4 * (a2 - m2s4 * (a3 - m2s4 * a4))));
    return x;
  }
}
