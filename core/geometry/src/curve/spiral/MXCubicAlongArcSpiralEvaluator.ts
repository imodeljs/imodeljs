/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */
import { Geometry } from "../../Geometry";
import { CubicEvaluator } from "./CubicEvaluator";
/**
 * MX Cubic along arc.
 * This is y= m*x^3 with
 * * x any point on the x axis
 * * `fraction` along the spiral goes to `x = fraction * Lx`
 * * m is (1/6RL)
 * * construction length L is nominal along the curve.
 * * x length Lx is along the axis, determined by two terms of the clothoid x series.
 * *
 * @param localToWorld
 * @param nominalL1
 * @param nominalR1
 * @param activeInterval
 * @internal
 */
export class MXCubicAlongArcEvaluator extends CubicEvaluator {
  public nominalLength1: number;
  public nominalRadius1: number;

  /** Constructor is private.  Caller responsible for cubicM validity. */
  private constructor(length1: number, radius1: number, axisLength: number, cubicM: number) {
    super(axisLength, cubicM);
    this.nominalLength1 = length1;
    this.nominalRadius1 = radius1;
  }

  /** Compute the cubic constant. */
  public static computeCubicM(length1: number, radius1: number): number | undefined {
    const axisLength = MXCubicAlongArcEvaluator.approximateDistanceAlongToX(length1, radius1, length1);
    return 1.0 / (6.0 * radius1 * axisLength);
  }

  public static create(length1: number, radius1: number): MXCubicAlongArcEvaluator | undefined {
    const m = this.computeCubicM(length1, radius1);
    if (m === undefined)
      return undefined;
    const xMax = MXCubicAlongArcEvaluator.approximateDistanceAlongToX(length1, radius1, length1);
    return new MXCubicAlongArcEvaluator(length1, radius1, xMax, m);
  }

  public override scaleInPlace(scaleFactor: number) {
    this.nominalLength1 *= scaleFactor;
    this.nominalRadius1 *= scaleFactor;
    super.scaleInPlace(scaleFactor);
  }
  /** return a deep copy of the evaluator */
  public clone(): MXCubicAlongArcEvaluator { return new MXCubicAlongArcEvaluator(this.nominalLength1, this.nominalRadius1, super._axisLength, this.cubicM); }
  /** Member by member matchup ... */
  public isAlmostEqual(other: any): boolean {
    if (other instanceof MXCubicAlongArcEvaluator) {
      return Geometry.isSameCoordinate(this.nominalLength1, other.nominalLength1)
        && Geometry.isSameCoordinate(this.nominalRadius1, other.nominalRadius1);
    }
    return false;
  }
  /**
   * Return a (fast but mediocre) approximation of spiral x position as function of approximate distance along the curve.
   * * This x-to-distance relation is not as precise as the CurvePrimitive method moveSignedDistanceFromFraction.
   * * It is supported here for users interested in replicating the Czech distance mapping rather than the more accurate CurvePrimitive measurements.
   * @param x distance along the x axis.
   */
  public static approximateDistanceAlongToX(nominalLength1: number, nominalRadius1: number, nominalDistanceAlong: number): number {
    const l2 = nominalLength1 * nominalLength1;
    const r2 = nominalRadius1 * nominalRadius1;
    const xx = nominalDistanceAlong * nominalDistanceAlong;
    return nominalDistanceAlong * (1.0 - xx * xx / (40.0 * r2 * l2));
  }
}
