/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Curve
 */
import { AnyCurve } from "./CurveChain";
import { BagOfCurves, CurveCollection } from "./CurveCollection";
import { CurvePrimitive } from "./CurvePrimitive";
import { Loop } from "./Loop";
import { ParityRegion } from "./ParityRegion";
import { Path } from "./Path";
import { UnionRegion } from "./UnionRegion";

/* eslint-disable @typescript-eslint/naming-convention, no-empty */

/** base class for detailed traversal of curve artifacts.
 * * This recurses to children in the quickest way (no records of path)
 * * Use the RecursiveCurveProcessorWithStack to record the path along the visit.
 * @public
 */
export abstract class RecursiveCurveProcessor {
  protected constructor() {
  }

  /** process error content */
  public announceUnexpected(_data: AnyCurve, _indexInParent: number) { }
  /** process a leaf primitive. */
  public announceCurvePrimitive(_data: CurvePrimitive, _indexInParent = -1): void { }

  /** announce a path (recurse to children) */
  public announcePath(data: Path, _indexInParent: number = -1): void {
    let i = 0;
    for (const curve of data.children)
      this.announceCurvePrimitive(curve, i++);
  }
  /** announce a loop (recurse to children) */
  public announceLoop(data: Loop, _indexInParent: number = -1): void {
    let i = 0;
    for (const curve of data.children)
      this.announceCurvePrimitive(curve, i++);
  }

  /** announce beginning or end of loops in a parity region */
  public announceParityRegion(data: ParityRegion, _indexInParent: number = -1): void {
    let i = 0;
    for (const loop of data.children)
      this.announceLoop(loop, i++);
  }
  /** announce beginning or end of a parity region */
  public announceUnionRegion(data: UnionRegion, _indexInParent: number = -1): void {
    let i = 0;
    for (const child of data.children) {
      child.announceToCurveProcessor(this, i++);
    }
  }

  /** announce a bag of curves.
   * * The default implementation visits each child and calls the appropriate dispatch to
   * * `this.announceCurvePrimitive(child)`
   * * `child.announceToCurveProcessor(this)`
   */
  public announceBagOfCurves(data: BagOfCurves, _indexInParent: number = -1): void {
    for (const child of data.children) {
      if (child instanceof CurvePrimitive)
        this.announceCurvePrimitive(child);
      else
        child.announceToCurveProcessor(this);
    }
  }
}

/** base class for detailed traversal of curve artifacts
 * * During recursion,  maintains a stack that shows complete path to each artifact.
 * * Use the QuickRecursiveCurveProcessor to visit without recording the path.
 * @public
 */
export abstract class RecursiveCurveProcessorWithStack extends RecursiveCurveProcessor {
  /** Stack of curve collections that are "up the tree" from the current point of the traversal. */
  protected _stack: CurveCollection[];
  protected constructor() {
    super();
    this._stack = [];
  }
  /** Push `data` onto the stack so its status is available during processing of children.
   * * Called when `data` is coming into scope.
   */
  public enter(data: CurveCollection) { this._stack.push(data); }
  /** Pop the stack
   * * called when the top of the stack goes out of scope
   */
  public leave(): CurveCollection | undefined { return this._stack.pop(); }

  /** process error content */
  public override announceUnexpected(_data: AnyCurve, _indexInParent: number) { }
  /** process a leaf primitive. */
  public override announceCurvePrimitive(_data: CurvePrimitive, _indexInParent = -1): void { }

  /** announce a path (recurse to children) */
  public override announcePath(data: Path, indexInParent: number = -1): void {
    this.enter(data);
    super.announcePath(data, indexInParent);
    this.leave();
  }
  /** announce a loop (recurse to children) */
  public override announceLoop(data: Loop, indexInParent: number = -1): void {
    this.enter(data);
    super.announceLoop(data, indexInParent);
    this.leave();
  }

  /** announce beginning or end of loops in a parity region */
  public override announceParityRegion(data: ParityRegion, _indexInParent: number = -1): void {
    this.enter(data);
    let i = 0;
    for (const loop of data.children)
      this.announceLoop(loop, i++);
    this.leave();
  }
  /** announce beginning or end of a parity region */
  public override announceUnionRegion(data: UnionRegion, indexInParent: number = -1): void {
    this.enter(data);
    super.announceUnionRegion(data, indexInParent);
    this.leave();
  }
  /**
   * Announce members of an unstructured collection.
   * * push the collection reference on the stack
   * * announce children
   * * pop the stack
   * @param data the collection
   * @param _indexInParent index where the collection appears in its parent.
   */
  public override announceBagOfCurves(data: BagOfCurves, _indexInParent: number = -1): void {
    this.enter(data);
    let i = 0;
    for (const child of data.children) {
      if (child instanceof CurvePrimitive)
        this.announceCurvePrimitive(child, i++);
      else
        child.announceToCurveProcessor(this);
    }
    this.leave();
  }
}
