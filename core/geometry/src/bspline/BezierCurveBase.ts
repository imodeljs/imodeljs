/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Bspline
 */

// import { Point2d } from "../Geometry2d";
import { CurvePrimitive } from "../curve/CurvePrimitive";
import { LineString3d } from "../curve/LineString3d";
import { StrokeOptions } from "../curve/StrokeOptions";
import { Geometry } from "../Geometry";
import { Angle } from "../geometry3d/Angle";
import { IStrokeHandler } from "../geometry3d/GeometryHandler";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/Plane3dByOriginAndUnitNormal";
/* eslint-disable @typescript-eslint/naming-convention, no-empty, no-console*/
import { Point3d } from "../geometry3d/Point3dVector3d";
import { Range3d } from "../geometry3d/Range";
import { Transform } from "../geometry3d/Transform";
import { Point4d } from "../geometry4d/Point4d";
import { UnivariateBezier } from "../numerics/BezierPolynomials";
import { Bezier1dNd } from "./Bezier1dNd";
import { KnotVector } from "./KnotVector";

/**
 * Base class for CurvePrimitive (necessarily 3D) with _polygon.
 * * This has a Bezier1dNd polygon as a member, and implements dimension-independent methods
 * * This exists to support
 *    * BezierCurve3d -- 3 coordinates x,y,z per block in the Bezier1dNd poles
 *    * BezierCurve3dH -- 4 coordinates x,y,z,w per block in the Bezier1dNd poles
 * * The implementations of "pure 3d" queries is based on calling `getPolePoint3d`.
 * * This has the subtle failure difference that `getPolePoint3d` call with a valid index on on a 3d curve always succeeds, but on 3dH curve fails when weight is zero.
 * @public
 */
export abstract class BezierCurveBase extends CurvePrimitive {
  /** String name for schema properties */
  public readonly curvePrimitiveType = "bezierCurve";

  /** Control points */
  protected _polygon: Bezier1dNd;
  /** scratch data blocks accessible by concrete class.   Initialized to correct blockSize in constructor. */
  protected _workData0: Float64Array;
  /** scratch data blocks accessible by concrete class.   Initialized to correct blockSize in constructor. */
  protected _workData1: Float64Array;
  /** Scratch xyz point accessible by derived classes. */
  protected _workPoint0: Point3d;
  /** Scratch xyz point accessible by derived classes. */
  protected _workPoint1: Point3d;

  protected constructor(blockSize: number, data: Float64Array) {
    super();
    this._polygon = new Bezier1dNd(blockSize, data);
    this._workPoint0 = Point3d.create();
    this._workPoint1 = Point3d.create();
    this._workData0 = new Float64Array(blockSize);
    this._workData1 = new Float64Array(blockSize);

  }
  /** reverse the poles in place */
  public reverseInPlace(): void { this._polygon.reverseInPlace(); }
  /** saturate the pole in place, using knot intervals from `spanIndex` of the `knotVector` */
  public saturateInPlace(knotVector: KnotVector, spanIndex: number): boolean {
    const boolStat = this._polygon.saturateInPlace(knotVector, spanIndex);
    if (boolStat) {
      this.setInterval(
        knotVector.spanFractionToFraction(spanIndex, 0.0),
        knotVector.spanFractionToFraction(spanIndex, 1.0));
    }
    return boolStat;
  }
  /** (property accessor) Return the polynomial degree (one less than order) */
  public get degree(): number {
    return this._polygon.order - 1;
  }
  /** (property accessor) Return the polynomial order */
  public get order(): number { return this._polygon.order; }
  /** (property accessor) Return the number of poles (aka control points) */
  public get numPoles(): number { return this._polygon.order; }
  /** Get pole `i` as a Point3d.
   * * For 3d curve, this is simple a pole access, and only fails (return `undefined`) for invalid index
   * * For 4d curve, this deweights the homogeneous pole and can fail due to 0 weight.
   */
  public abstract getPolePoint3d(i: number, point?: Point3d): Point3d | undefined;

  /** Get pole `i` as a Point4d.
   * * For 3d curve, this accesses the simple pole and returns with weight 1.
   * * For 4d curve, this accesses the (weighted) pole.
   */
  public abstract getPolePoint4d(i: number, point?: Point4d): Point4d | undefined;
  /** Set mapping to parent curve (e.g. if this bezier is a span extracted from a bspline, this is the knot interval of the span) */
  public setInterval(a: number, b: number) { this._polygon.setInterval(a, b); }
  /** map `fraction` from this Bezier curves inherent 0..1 range to the (a,b) range of parent
   * * ( The parent range should have been previously defined with `setInterval`)
   */
  public fractionToParentFraction(fraction: number): number { return this._polygon.fractionToParentFraction(fraction); }

  /** append stroke points to a linestring, based on `strokeCount` and `fractionToPoint` from derived class*/
  public emitStrokes(dest: LineString3d, options?: StrokeOptions): void {
    const numPerSpan = this.computeStrokeCountForOptions(options);
    const fractionStep = 1.0 / numPerSpan;
    for (let i = 0; i <= numPerSpan; i++) {
      const fraction = i * fractionStep;
      this.fractionToPoint(fraction, this._workPoint0);
      dest.appendStrokePoint(this._workPoint0);
    }
  }
  /** announce intervals with stroke counts */
  public emitStrokableParts(handler: IStrokeHandler, _options?: StrokeOptions): void {
    const numPerSpan = this.computeStrokeCountForOptions(_options);
    handler.announceIntervalForUniformStepStrokes(this, numPerSpan, 0.0, 1.0);
  }
  /** Return a simple array of arrays with the control points as `[[x,y,z],[x,y,z],..]` */
  public copyPolesAsJsonArray(): any[] { return this._polygon.unpackToJsonArrays(); }

  /** return true if all poles are on a plane. */
  public isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean {
    let point: Point3d | undefined = this._workPoint0;
    for (let i = 0; ; i++) {
      point = this.getPolePoint3d(i, point);
      if (!point)
        return true;
      if (!plane.isPointInPlane(point))
        break;    // which gets to return false, which is otherwise unreachable . . .
    }
    return false;
  }
  /** Return the length of the control polygon. */
  public polygonLength(): number {
    if (!this.getPolePoint3d(0, this._workPoint0))
      return 0.0;
    let i = 0;
    let sum = 0.0;
    while (this.getPolePoint3d(++i, this._workPoint1)) {
      sum += this._workPoint0.distance(this._workPoint1);
      this._workPoint0.setFrom(this._workPoint1);
    }
    return sum;
  }
  /** Return the start point.  (first control point) */
  public override startPoint(): Point3d {
    const result = this.getPolePoint3d(0)!;   // ASSUME non-trivial pole set -- if null comes back, it bubbles out
    return result;
  }
  /** Return the end point.  (last control point) */
  public override endPoint(): Point3d {
    const result = this.getPolePoint3d(this.order - 1)!;    // ASSUME non-trivial pole set
    return result;
  }
  /** Return the control polygon length as a quick length estimate. */
  public quickLength(): number { return this.polygonLength(); }
  /** Concrete classes must implement extendRange . . .  */
  public abstract override extendRange(rangeToExtend: Range3d, transform?: Transform): void;
  /**
   * 1D bezier coefficients for use in range computations.
   * @internal
   */
  protected _workBezier?: UnivariateBezier; // available for bezier logic within a method
  /** scratch array for use by derived classes, using allocateAndZeroBezierWorkData for sizing. */
  protected _workCoffsA?: Float64Array;
  /** scratch array for use by derived classes, using allocateAndZeroBezierWorkData for sizing. */
  protected _workCoffsB?: Float64Array;

  /**
   * set up the _workBezier members with specific order.
   * * Try to reuse existing members if their sizes match.
   * * Ignore members corresponding to args that are 0 or negative.
   * @param primaryBezierOrder order of expected bezier
   * @param orderA length of _workCoffsA (simple array)
   * @param orderB length of _workCoffsB (simple array)
   */
  protected allocateAndZeroBezierWorkData(primaryBezierOrder: number, orderA: number, orderB: number) {
    if (primaryBezierOrder > 0) {
      if (this._workBezier !== undefined && this._workBezier.order === primaryBezierOrder) {
        this._workBezier.zero();
      } else
        this._workBezier = new UnivariateBezier(primaryBezierOrder);
    }
    if (orderA > 0) {
      if (this._workCoffsA !== undefined && this._workCoffsA.length === orderA)
        this._workCoffsA.fill(0);
      else
        this._workCoffsA = new Float64Array(orderA);
    }
    if (orderB > 0) {
      if (this._workCoffsB !== undefined && this._workCoffsB.length === orderB)
        this._workCoffsB.fill(0);
      else
        this._workCoffsB = new Float64Array(orderB);
    }
  }
  /**
   * Assess length and turn to determine a stroke count.
   * * this method is used by both BSplineCurve3d and BSplineCurve3dH.
   * * points are accessed via getPolePoint3d.
   *   * Hence a zero-weight pole will be a problem
   * @param options stroke options structure.
   */
  public computeStrokeCountForOptions(options?: StrokeOptions): number {

    this.getPolePoint3d(0, this._workPoint0);
    this.getPolePoint3d(1, this._workPoint1);
    let numStrokes = 1;
    if (this._workPoint0 && this._workPoint1) {
      let dx0 = this._workPoint1.x - this._workPoint0.x;
      let dy0 = this._workPoint1.y - this._workPoint0.y;
      let dz0 = this._workPoint1.z - this._workPoint0.z;
      let dx1, dy1, dz1; // first differences of leading edge
      let sumRadians = 0.0;
      let thisLength = Geometry.hypotenuseXYZ(dx0, dy0, dz0);
      this._workPoint1.setFromPoint3d(this._workPoint0);
      let sumLength = thisLength;
      let maxLength = thisLength;
      let maxRadians = 0.0;
      let thisRadians;
      for (let i = 2; this.getPolePoint3d(i, this._workPoint1); i++) {
        dx1 = this._workPoint1.x - this._workPoint0.x;
        dy1 = this._workPoint1.y - this._workPoint0.y;
        dz1 = this._workPoint1.z - this._workPoint0.z;
        thisRadians = Angle.radiansBetweenVectorsXYZ(dx0, dy0, dz0, dx1, dy1, dz1);
        sumRadians += thisRadians;
        maxRadians = Geometry.maxAbsXY(thisRadians, maxRadians);
        thisLength = Geometry.hypotenuseXYZ(dx1, dy1, dz1);
        sumLength += thisLength;
        maxLength = Geometry.maxXY(maxLength, thisLength);
        dx0 = dx1;
        dy0 = dy1;
        dz0 = dz1;
        this._workPoint0.setFrom(this._workPoint1);
      }
      const length1 = maxLength * this.degree;    // This may be larger than sumLength
      const length2 = Math.sqrt(length1 * sumLength);  // This is in between
      let radians1 = maxRadians * (this.degree - 1);  // As if worst case keeps happening.
      if (this.degree < 3)
        radians1 *= 3;  // so quadratics aren't under-stroked
      const radians2 = Math.sqrt(radians1 * sumRadians);
      numStrokes = StrokeOptions.applyAngleTol(options,
        StrokeOptions.applyMaxEdgeLength(options, this.degree, length2), radians2, 0.1);
      if (options) {
        numStrokes = options.applyChordTolToLengthAndRadians(numStrokes, sumLength, radians1);
      }
    }
    return numStrokes;
  }

}
