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
import { StrokeOptions } from "./StrokeOptions";

/**
 * * A `ParityRegion` is a collection of `Loop` objects.
 * * The loops collectively define a planar region.
 * * A point is "in" the composite region if it is "in" an odd number of the loops.
 * @see [Curve Collections]($docs/learning/geometry/CurveCollection.md) learning article.
 * @public
 */
export class ParityRegion extends CurveCollection {
  /** String name for schema properties */
  public readonly curveCollectionType = "parityRegion";

  /** Test if `other` is an instance of `ParityRegion` */
  public isSameGeometryClass(other: GeometryQuery): boolean { return other instanceof ParityRegion; }
  /** Array of loops in this parity region. */
  protected _children: Loop[];
  /** Return the array of loops in this parity region. */
  public override get children(): Loop[] { return this._children; }
  /** Construct parity region with empty loop array */
  public constructor() { super(); this._children = []; }
  /**
   * Add loops (recursively) to this region's children
   */
  public addLoops(data?: Loop | Loop[] | Loop[][]) {
    if (data === undefined) {
    } else if (data instanceof Loop)
      this.children.push(data);
    else if (Array.isArray(data)) {
      for (const child of data) {
        if (child instanceof Loop)
          this.children.push(child);
        else if (Array.isArray(child))
          this.addLoops(child);
      }
    }
  }
  /** Return a single loop or parity region with given loops.
   * * The returned structure CAPTURES the loops.
   * * The loops are NOT reorganized by hole analysis.
   */
  public static createLoops(data?: Loop | Loop[] | Loop[][]): Loop | ParityRegion {
    if (data instanceof Loop)
      return data;
    const result = new ParityRegion();
    result.addLoops(data);
    return result;
  }

  /** Create a parity region with given loops */
  public static create(...data: Loop[]): ParityRegion {
    const result = new ParityRegion();
    for (const child of data) {
      result.children.push(child);
    }
    return result;
  }
  /** Return the boundary type (4) of a corresponding  MicroStation CurveVector */
  public dgnBoundaryType(): number { return 4; }
  /** invoke `processor.announceParityRegion(this, indexInParent)` */
  public announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent: number = -1): void {
    return processor.announceParityRegion(this, indexInParent);
  }
  /** Return a deep copy. */
  public override clone(): ParityRegion {
    const clone = new ParityRegion();
    let child;
    for (child of this.children) {
      const childClone = child.clone();
      if (childClone instanceof Loop)
        clone.children.push(childClone);
    }
    return clone;
  }
  /** Stroke these curves into a new ParityRegion. */
  public cloneStroked(options?: StrokeOptions): ParityRegion {
    const clone = new ParityRegion();
    let child;
    for (child of this.children) {
      const childStrokes = child.cloneStroked(options) as Loop;
      if (childStrokes)
        clone.children.push(childStrokes);
    }
    return clone;
  }
  /** Create a new empty parity region. */
  public cloneEmptyPeer(): ParityRegion { return new ParityRegion(); }
  /** Add `child` to this parity region.
   * * any child type other than `Loop` is ignored.
   */
  public tryAddChild(child: AnyCurve | undefined): boolean {
    if (child && child instanceof Loop) {
      this._children.push(child);
      return true;
    }
    return false;
  }
  /** Get child `i` by index. */
  public getChild(i: number): Loop | undefined {
    if (i < this._children.length)
      return this._children[i];
    return undefined;
  }
  /** Second step of double dispatch:  call `handler.handleRegion(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleParityRegion(this);
  }
}
