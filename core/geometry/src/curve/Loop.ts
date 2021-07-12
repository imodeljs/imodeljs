/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */
import { GeometryHandler } from "../geometry3d/GeometryHandler";
import { IndexedXYZCollection } from "../geometry3d/IndexedXYZCollection";
import { Point3d } from "../geometry3d/Point3dVector3d";
import { AnyCurve } from "./CurveChain";
import { CurveChain } from "./CurveCollection";
import { CurvePrimitive } from "./CurvePrimitive";
import { RecursiveCurveProcessor } from "./CurveProcessor";
import { GeometryQuery } from "./GeometryQuery";
import { LineString3d } from "./LineString3d";
import { StrokeOptions } from "./StrokeOptions";

/**
 * A `Loop` is a curve chain that is the boundary of a closed (planar) loop.
 * @see [Curve Collections]($docs/learning/geometry/CurveCollection.md) learning article.
 * @public
 */
export class Loop extends CurveChain {
  /** String name for schema properties */
  public readonly curveCollectionType = "loop";

  /** tag value that can be set to true for user code to mark inner and outer loops. */
  public override isInner: boolean = false;
  /** test if `other` is a `Loop` */
  public isSameGeometryClass(other: GeometryQuery): boolean { return other instanceof Loop; }
  /** Test if `other` is an instance of `Loop` */
  public constructor() { super(); }
  /**
   * Create a loop from variable length list of CurvePrimitives
   * @param curves array of individual curve primitives
   */
  public static create(...curves: CurvePrimitive[]): Loop {
    const result = new Loop();
    for (const curve of curves) {
      result.children.push(curve);
    }
    return result;
  }
  /**
   * Create a loop from an array of curve primitives
   * @param curves array of individual curve primitives
   */
  public static createArray(curves: CurvePrimitive[]): Loop {
    const result = new Loop();
    for (const curve of curves) {
      result.children.push(curve);
    }
    return result;
  }
  /** Create a loop from an array of points */
  public static createPolygon(points: IndexedXYZCollection | Point3d[]): Loop {
    const linestring = LineString3d.create(points);
    linestring.addClosurePoint();
    return Loop.create(linestring);
  }
  /** Create a loop with the stroked form of this loop. */
  public cloneStroked(options?: StrokeOptions): AnyCurve {
    const strokes = LineString3d.create();
    for (const curve of this.children)
      curve.emitStrokes(strokes, options);
    return Loop.create(strokes);
  }
  /** Return the boundary type (2) of a corresponding  MicroStation CurveVector */
  public dgnBoundaryType(): number { return 2; } // (2) all "Loop" become "outer"
  /** invoke `processor.announceLoop(this, indexInParent)` */
  public announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent: number = -1): void {
    return processor.announceLoop(this, indexInParent);
  }
  /** Create a new `Loop` with no children */
  public cloneEmptyPeer(): Loop { return new Loop(); }
  /** Second step of double dispatch:  call `handler.handleLoop(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleLoop(this);
  }
}

/** Carrier object for loops characterized by area sign
 * @public
 */
export interface SignedLoops {
  /** Array of loops that have positive area sign.  (i.e. counterclockwise loops) */
  positiveAreaLoops: Loop[];
  /** Array of loops that have negative area sign. (i.e. clockwise loops. */
  negativeAreaLoops: Loop[];
  /** slivers where there are coincident sections of input curves. */
  slivers: Loop[];
}
