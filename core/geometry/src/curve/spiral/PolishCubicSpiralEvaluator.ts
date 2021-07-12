/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */
import { Geometry } from "../../Geometry";
import { SimpleNewton } from "../../numerics/Newton";
import { CubicEvaluator } from "./CubicEvaluator";
/**
 * Polish Cubic.
 * * Construction takes nominal length and end radius.
 * curve is  is y= m*x^3 with
 * * x any point on the x axis
 * * m is (1/6RL)
 * * Lx = x length is along the axis, determined by inversion of a distance series at nominal length
 * *
 * @param localToWorld
 * @param nominalL1
 * @param nominalR1
 * @param activeInterval
 * @internal
 */
export class PolishCubicEvaluator extends CubicEvaluator {
  public nominalLength1: number;
  public nominalRadius1: number;

  /** Constructor is private.  Caller responsible for cubicM validity. */
  private constructor(length1: number, radius1: number, axisLength: number, cubicM: number) {
    super(axisLength, cubicM);
    this.nominalLength1 = length1;
    this.nominalRadius1 = radius1;
  }

  /** Compute the czech cubic constant. */
  public static computeCubicM(length1: number, radius1: number): number {
    return 1.0 / (6.0 * length1 * radius1);
  }

  public static create(length1: number, radius1: number): PolishCubicEvaluator | undefined {
    const m = this.computeCubicM(length1, radius1);
    if (m === undefined)
      return undefined;
    const xMax = PolishCubicEvaluator.approximateDistanceAlongToX(length1, radius1, length1);
    if (xMax === undefined)
      return undefined;
    return new PolishCubicEvaluator(length1, radius1, xMax, m);
  }

  public override scaleInPlace(scaleFactor: number) {
    this.nominalLength1 *= scaleFactor;
    this.nominalRadius1 *= scaleFactor;
    super.scaleInPlace(scaleFactor);
  }
  /** return a deep copy of the evaluator */
  public clone(): PolishCubicEvaluator { return new PolishCubicEvaluator(this.nominalLength1, this.nominalRadius1, super._axisLength, this.cubicM); }
  /** Member by member matchup ... */
  public isAlmostEqual(other: any): boolean {
    if (other instanceof PolishCubicEvaluator) {
      return Geometry.isSameCoordinate(this.nominalLength1, other.nominalLength1)
        && Geometry.isSameCoordinate(this.nominalRadius1, other.nominalRadius1);
    }
    return false;
  }

  /** Compute the coefficient of x^4 in the x-to-distance series expansion */
  public static computeX4SeriesCoefficient(length1: number, radius1: number): number {
    return 1.0 / (4.0 * length1 * length1 * radius1 * radius1);
  }
  /**
   * Evaluate a series approximation of distance along the true curve.
   * @param x distance along x axis
   * @param radius1 nominal end radius
   * @param length1 nominal length along curve
   * @returns
   */
  public static xToApproximateDistance(x: number, radius1: number, length1: number): number {
    // C31 * ( 1 + 1 / 10 * E31 - 1 / 72 * E31^2 + 1 / 208 * E31^3 - 5 / 2176 * E31^4 )
    const a4 = this.computeX4SeriesCoefficient(length1, radius1);
    const ax2 = a4 * x * x;
    const ax3 = ax2 * x;
    const ax4 = ax3 * x;
    const s0 = x * (1.0 + ax4 * (0.1 + ax4 * (-1.0 / 72.0 + ax4 * (1.0 / 208.0 - 5.0 * ax4 / 2176.0))));
    return s0;
  }

  /**
   * Evaluate the derivative of the x-to-distance series.
   * @param x distance along x axis
   * @param radius1 nominal end radius
   * @param length1 nominal length along curve
   * @returns
   */
  public static xToApproximateDistanceDerivative(x: number, radius1: number, length1: number): number {
    // C31 * ( 1 + 1 / 10 * E31 - 1 / 72 * E31^2 + 1 / 208 * E31^3 - 5 / 2176 * E31^4 )
    const a4 = this.computeX4SeriesCoefficient(length1, radius1);
    const ax2 = a4 * x * x;
    const ax3 = ax2 * x;
    const ax4 = ax3 * x;
    // derivative notes ..
    // take away leading x -- this reduces each power by 1
    // multiply each coefficient by its original power:
    //  0.1==>0.5
    // 1/72==> 9/72 = 1/8
    // 1/208==>13/208=1/16
    // 1/2176==>17/2176= 1/128
    const ds = (1.0 + ax4 * (0.5 + ax4 * (-1.0 / 8.0 + ax4 * (1.0 / 16.0 - 5.0 * ax4 / 128.0))));
    return ds;
  }

  /** Invert the xToApproximateDistance function. */
  public static approximateDistanceAlongToX(s: number, radius1: number, length1: number): number | undefined {
    const root = SimpleNewton.runNewton1D(s,
      (x: number) => (this.xToApproximateDistance(x, radius1, length1) - s),
      (x: number) => this.xToApproximateDistanceDerivative(x, radius1, length1));
    return root;
  }
}
