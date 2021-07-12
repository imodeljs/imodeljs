/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Curve
 */
import { Transform } from "../../geometry3d/Transform";
import { CurveCollection } from "../CurveCollection";
import { CurvePrimitive } from "../CurvePrimitive";
import { RecursiveCurveProcessor } from "../CurveProcessor";

/** Algorithmic class: Transform curves in place.
 * @internal
 */
export class TransformInPlaceContext extends RecursiveCurveProcessor {
  public numFail: number;
  public numOK: number;
  public transform: Transform;
  constructor(transform: Transform) { super(); this.numFail = 0; this.numOK = 0; this.transform = transform; }
  public static tryTransformInPlace(target: CurveCollection, transform: Transform): boolean {
    const context = new TransformInPlaceContext(transform);
    target.announceToCurveProcessor(context);
    return context.numFail === 0;
  }
  public override announceCurvePrimitive(curvePrimitive: CurvePrimitive, _indexInParent: number): void {
    if (!curvePrimitive.tryTransformInPlace(this.transform))
      this.numFail++;
    else
      this.numOK++;
  }
}
