/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */
import { GeometryHandler } from "../geometry3d/GeometryHandler";
import { AnyCurve } from "./CurveChain";
import { CurveCollection } from "./CurveCollection";
import { RecursiveCurveProcessor } from "./CurveProcessor";
import { GeometryQuery } from "./GeometryQuery";
import { Loop } from "./Loop";
import { ParityRegion } from "./ParityRegion";
import { StrokeOptions } from "./StrokeOptions";

/**
 * * A `UnionRegion` is a collection of other planar region types -- `Loop` and `ParityRegion`.
 * * The composite is the union of the contained regions.
 * * A point is "in" the composite if it is "in" one or more of the contained regions.
 * @see [Curve Collections]($docs/learning/geometry/CurveCollection.md) learning article.
 * @public
 */
export class UnionRegion extends CurveCollection {
  /** String name for schema properties */
  public readonly curveCollectionType = "unionRegion";

  /** test if `other` is a `UnionRegion` */
  public isSameGeometryClass(other: GeometryQuery): boolean { return other instanceof UnionRegion; }
  /** collection of Loop and ParityRegion children. */
  protected _children: Array<ParityRegion | Loop>;
  /** Return the array of regions */
  public override get children(): Array<ParityRegion | Loop> { return this._children; }
  /** Constructor -- initialize with no children */
  public constructor() { super(); this._children = []; }
  /** Create a `UnionRegion` with given region children */
  public static create(...data: Array<ParityRegion | Loop>): UnionRegion {
    const result = new UnionRegion();
    for (const child of data) {
      result.tryAddChild(child);
    }
    return result;
  }
  /** Return the boundary type (5) of a corresponding  MicroStation CurveVector */
  public dgnBoundaryType(): number { return 5; }
  /** dispatch to more strongly typed  `processor.announceUnionRegion(this, indexInParent)` */
  public announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent: number = -1): void {
    return processor.announceUnionRegion(this, indexInParent);
  }
  /** Return structural clone with stroked primitives. */
  public cloneStroked(options?: StrokeOptions): UnionRegion {
    const clone = new UnionRegion();
    let child;
    for (child of this._children) {
      const childStrokes = child.cloneStroked(options) as ParityRegion | Loop;
      if (childStrokes)
        clone.children.push(childStrokes);
    }
    return clone;
  }
  /** Return new empty `UnionRegion` */
  public cloneEmptyPeer(): UnionRegion { return new UnionRegion(); }
  /** add a child.
   * * Returns false if the `AnyCurve` child is not a region type.
   */
  public tryAddChild(child: AnyCurve): boolean {
    if (child && child instanceof ParityRegion || child instanceof Loop) {
      this._children.push(child);
      return true;
    }
    return false;
  }
  /** Return a child identified by index. */
  public getChild(i: number): Loop | ParityRegion | undefined {
    if (i < this._children.length)
      return this._children[i];
    return undefined;
  }
  /** Second step of double dispatch:  call `handler.handleUnionRegion(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleUnionRegion(this);
  }
}
