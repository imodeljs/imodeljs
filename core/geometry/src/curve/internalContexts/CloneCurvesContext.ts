/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Curve
 */

import { Transform } from "../../geometry3d/Transform";
import { BagOfCurves, CurveChain, CurveCollection } from "../CurveCollection";
import { CurvePrimitive } from "../CurvePrimitive";
import { RecursiveCurveProcessorWithStack } from "../CurveProcessor";

/**
 * Algorithmic class for cloning curve collections.
 * * recurse through collection nodes, building image nodes as needed and inserting clones of children.
 * * for individual primitive, invoke doClone (protected) for direct clone; insert into parent
 */
export class CloneCurvesContext extends RecursiveCurveProcessorWithStack {
  protected _result: CurveCollection | undefined;
  private _transform: Transform | undefined;
  protected constructor(transform?: Transform) {
    super();
    this._transform = transform;
    this._result = undefined;
  }
  public static clone(target: CurveCollection, transform?: Transform): CurveCollection | undefined {
    const context = new CloneCurvesContext(transform);
    target.announceToCurveProcessor(context);
    return context._result;
  }
  public override enter(c: CurveCollection) {
    if (c instanceof CurveCollection)
      super.enter(c.cloneEmptyPeer());
  }
  public override leave(): CurveCollection | undefined {
    const result = super.leave();
    if (result) {
      if (this._stack.length === 0) // this should only happen once !!!
        this._result = result as BagOfCurves;
      else // push this result to top of stack.
        this._stack[this._stack.length - 1].tryAddChild(result);
    }
    return result;
  }
  // specialized clone methods override this (and allow announceCurvePrimitive to insert to parent)
  protected doClone(primitive: CurvePrimitive): CurvePrimitive | CurvePrimitive[] | undefined {
    if (this._transform)
      return primitive.cloneTransformed(this._transform) as CurvePrimitive;
    return primitive.clone() as CurvePrimitive;
  }
  public override announceCurvePrimitive(primitive: CurvePrimitive, _indexInParent: number): void {
    const c = this.doClone(primitive);
    if (c !== undefined && this._stack.length > 0) {
      const parent = this._stack[this._stack.length - 1];
      if (parent instanceof CurveChain || parent instanceof BagOfCurves)
        if (Array.isArray(c)) {
          for (const c1 of c) {
            parent.tryAddChild(c1);
          }
        } else {
          parent.tryAddChild(c);
        }
    }
  }
}
