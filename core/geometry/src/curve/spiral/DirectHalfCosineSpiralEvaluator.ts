/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */
import { Geometry } from "../../Geometry";
import { XYCurveEvaluator } from "./XYCurveEvaluator";
import { SimpleNewton } from "../../numerics/Newton";
/**
 * @internal
 */
export class DirectHalfCosineSpiralEvaluator extends XYCurveEvaluator {
  public nominalLength1: number;
  public nominalRadius1: number;
  private _c: number;
  private _c1: number;
  private _c2: number;
  public constructor(length1: number, radius1: number) {
    super();
    this.nominalLength1 = length1;
    this.nominalRadius1 = radius1;
    const pi = Math.PI;
    this._c1 = 1.0 / (2.0 * pi * pi);
    this._c2 = 0.25;
    this._c = 0.0; // TO BE UPDATED BELOW
    this.updateConstants();
  }

  private updateConstants() {
    this._c = this.nominalLength1 * this.nominalLength1 / this.nominalRadius1;
  }
  public scaleInPlace(scaleFactor: number) {
    this.nominalLength1 *= scaleFactor;
    this.nominalRadius1 *= scaleFactor;
    this.updateConstants();
  }
  /** return a deep copy of the evaluator */
  public clone(): DirectHalfCosineSpiralEvaluator { return new DirectHalfCosineSpiralEvaluator(this.nominalLength1, this.nominalRadius1); }
  /** Member by member matchup ... */
  public isAlmostEqual(other: any): boolean {
    if (other instanceof DirectHalfCosineSpiralEvaluator) {
      return Geometry.isSameCoordinate(this.nominalLength1, other.nominalLength1)
        && Geometry.isSameCoordinate(this.nominalRadius1, other.nominalRadius1);
      // remark: c,c1,c2 are computed, need not be tested.
    }
    return false;
  }
  /** Evaluate X at fractional position. */
  public fractionToX(fraction: number): number { return fraction * this.nominalLength1; }
  /** Evaluate Y at fractional position. */
  public fractionToY(fraction: number): number {
    const theta = fraction * Math.PI;
    return this._c * (this._c2 * fraction * fraction - this._c1 * (1.0 - Math.cos(theta)));
  }
  /** Evaluate derivative of X with respect to fraction at fractional position. */
  public fractionToDX(_fraction: number): number { return this.nominalLength1; }

  /** Evaluate derivative of Y with respect to fraction at fractional position. */

  public fractionToDY(fraction: number): number {
    const pi = Math.PI;
    const theta = fraction * pi;
    return this._c * (2.0 * this._c2 * fraction - this._c1 * pi * Math.sin(theta));
  }
  /** Evaluate second derivative of X with respect to fraction at fractional position. */
  public fractionToDDX(_fraction: number): number { return 0.0; }

  /** Evaluate third derivative of Y with respect to fraction at fractional position. */

  public fractionToDDY(fraction: number): number {
    const pi = Math.PI;
    const theta = fraction * pi;
    return this._c * (2.0 * this._c2 - this._c1 * pi * pi * Math.cos(theta));
  }
  /** Evaluate second derivative of X with respect to fraction at fractional position. */
  public fractionToD3X(_fraction: number): number { return 0.0; }

  /** Evaluate third derivative of Y with respect to fraction at fractional position. */

  public fractionToD3Y(fraction: number): number {
    const pi = Math.PI;
    const theta = fraction * pi;
    return this._c * this._c1 * pi * pi * pi * Math.sin(theta);
  }

  /** Return the magnitude of the first vector at fractional coordinate. */

  public override fractionToTangentMagnitude(fraction: number): number {
    return Geometry.hypotenuseXY(this.fractionToDX(fraction), this.fractionToDY(fraction));

  }
  /** Invert the fractionToX function for given X. */
  public xToFraction(x: number): number | undefined {
    const fraction0 = x / this.nominalLength1;
    const fraction1 = SimpleNewton.runNewton1D(fraction0,
      (f: number) => (this.fractionToX(f) - x),
      (f: number) => this.fractionToDX(f));
    if (fraction1 === undefined)
      return undefined;
    return fraction1;

  }
}
