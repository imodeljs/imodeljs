/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */
import { CurveChain, CurveCollection } from "../CurveCollection";
import { CurvePrimitive } from "../CurvePrimitive";
import { RecursiveCurveProcessorWithStack } from "../CurveProcessor";

// import { SumLengthsContext, GapSearchContext, CountLinearPartsSearchContext, CloneCurvesContext, TransformInPlaceContext } from "./CurveSearches";
/** Algorithmic class: Accumulate maximum gap between adjacent primitives of CurveChain.
 * @internal
 */
export class GapSearchContext extends RecursiveCurveProcessorWithStack {
  public maxGap: number;
  constructor() { super(); this.maxGap = 0.0; }
  public static maxGap(target: CurveCollection): number {
    const context = new GapSearchContext();
    target.announceToCurveProcessor(context);
    return context.maxGap;
  }
  public override announceCurvePrimitive(curve: CurvePrimitive, _indexInParent: number): void {
    if (this._stack.length > 0) {
      const parent = this._stack[this._stack.length - 1];
      if (parent instanceof CurveChain) {
        const chain = parent;
        const nextCurve = chain.cyclicCurvePrimitive(_indexInParent + 1);
        if (curve !== undefined && nextCurve !== undefined) {
          this.maxGap = Math.max(this.maxGap, curve.endPoint().distance(nextCurve.startPoint()));
        }
      }
    }
  }
}
