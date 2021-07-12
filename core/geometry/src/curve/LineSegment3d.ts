/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */

import { Clipper } from "../clipping/ClipUtils";
import { BeJSONFunctions, Geometry, PlaneAltitudeEvaluator } from "../Geometry";
import { GeometryHandler, IStrokeHandler } from "../geometry3d/GeometryHandler";
import { Plane3dByOriginAndVectors } from "../geometry3d/Plane3dByOriginAndVectors";
import { Point3d } from "../geometry3d/Point3dVector3d";
import { Range3d } from "../geometry3d/Range";
import { Ray3d } from "../geometry3d/Ray3d";
import { Transform } from "../geometry3d/Transform";
import { Order2Bezier } from "../numerics/BezierPolynomials";
import { CurveExtendOptions, VariantCurveExtendParameter } from "./CurveExtendMode";
import { CurveIntervalRole, CurveLocationDetail } from "./CurveLocationDetail";
import { AnnounceNumberNumberCurvePrimitive, CurvePrimitive } from "./CurvePrimitive";
import { GeometryQuery } from "./GeometryQuery";
import { LineString3d } from "./LineString3d";
import { StrokeOptions } from "./StrokeOptions";

/* eslint-disable @typescript-eslint/naming-convention, no-empty */
/**
 * A LineSegment3d is:
 *
 * * A 3d line segment represented by its start and end coordinates
 *   * startPoint
 *   * endPoint
 * * The segment is parameterized with fraction 0 at the start and fraction 1 at the end, i.e. either of these equivalent forms to map fraction `f` to a point `X(f)`
 * ```
 * equation
 *  X(f) = P_0 + f * (P_1 - P_0)\newline
 *  X(f) = (1-f)*P_0  + f * P_0
 * ```
 * @public
 */
export class LineSegment3d extends CurvePrimitive implements BeJSONFunctions {
  /** String name for schema properties */
  public readonly curvePrimitiveType = "lineSegment";

  /** test if `other` is of class `LineSegment3d` */
  public isSameGeometryClass(other: GeometryQuery): boolean { return other instanceof LineSegment3d; }
  private _point0: Point3d;
  private _point1: Point3d;
  /** Return REFERENCE to the start point of this segment.
   * * (This is distinct from the `CurvePrimitive` abstract method `endPoint()` which creates a returned point
   */
  public get point0Ref(): Point3d { return this._point0; }
  /** Return REFERENCE to the end point of this segment.
   * * (This is distinct from the `CurvePrimitive` abstract method `endPoint()` which creates a returned point
   */
  public get point1Ref(): Point3d { return this._point1; }
  /**
   * A LineSegment3d extends along its infinite line.
   */
  public override get isExtensibleFractionSpace(): boolean { return true; }

  /**
   * CAPTURE point references as a `LineSegment3d`
   * @param point0
   * @param point1
   */
  protected constructor(point0: Point3d, point1: Point3d) { super(); this._point0 = point0; this._point1 = point1; }
  /** Set the start and endpoints by capturing input references. */
  public setRefs(point0: Point3d, point1: Point3d) { this._point0 = point0; this._point1 = point1; }
  /** Set the start and endpoints by cloning the input parameters. */
  public set(point0: Point3d, point1: Point3d) { this._point0 = point0.clone(); this._point1 = point1.clone(); }
  /** copy (clone) data from other */
  public setFrom(other: LineSegment3d) { this._point0.setFrom(other._point0); this._point1.setFrom(other._point1); }
  /** Return a (clone of) the start point. (This is NOT a reference to the stored start point) */
  public override startPoint(result?: Point3d): Point3d {
    if (result) { result.setFrom(this._point0); return result; }
    return this._point0.clone();
  }
  /** Return a (clone of) the end point. (This is NOT a reference to the stored end point) */
  public override endPoint(result?: Point3d): Point3d {
    if (result) { result.setFrom(this._point1); return result; }
    return this._point1.clone();
  }
  /** Return the point and derivative vector at fractional position along the line segment. */
  public fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d {
    result = result ? result : Ray3d.createZero();
    result.direction.setStartEnd(this._point0, this._point1);
    this._point0.interpolate(fraction, this._point1, result.origin);
    return result;
  }
  /** Construct a plane with
   * * origin at the fractional position along the line segment
   * * x axis is the first derivative, i.e. along the line segment
   * * y axis is the second derivative, i.e. 000
   */
  public fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    result = result ? result : Plane3dByOriginAndVectors.createXYPlane();
    result.vectorU.setStartEnd(this._point0, this._point1);
    result.vectorV.set(0, 0, 0);
    this._point0.interpolate(fraction, this._point1, result.origin);
    return result;
  }

  /** Clone the LineSegment3d */
  public clone(): LineSegment3d { return LineSegment3d.create(this._point0, this._point1); }
  /** Clone and apply transform to the clone. */
  public cloneTransformed(transform: Transform): CurvePrimitive {  // we know tryTransformInPlace succeeds.
    const c = this.clone();
    c.tryTransformInPlace(transform);
    return c;
  }
  /** Create with start and end points.  The point contents are cloned into the LineSegment3d. */
  public static create(point0: Point3d, point1: Point3d, result?: LineSegment3d): LineSegment3d {
    if (result) {
      result.set(point0, point1);  // and this will clone them !!
      return result;
    }
    return new LineSegment3d(point0.clone(), point1.clone());
  }

  /** Create with start and end points.  The point contents are CAPTURED into the result */
  public static createCapture(point0: Point3d, point1: Point3d): LineSegment3d {
    return new LineSegment3d(point0, point1);
  }
  /** create a LineSegment3d from xy coordinates of start and end, with common z.
   * @param x0 start point x coordinate.
   * @param y0 start point y coordinate.
   * @param x1 end point x coordinate.
   * @param y1 end point y coordinate.
   * @param z z coordinate to use for both points.
   * @param result optional existing LineSegment to be reinitialized.
   */
  public static createXYXY(x0: number, y0: number, x1: number, y1: number, z: number = 0, result?: LineSegment3d) {
    if (result) {
      result._point0.set(x0, y0, z);
      result._point1.set(x1, y1, z);
      return result;
    }
    return new LineSegment3d(Point3d.create(x0, y0, z), Point3d.create(x1, y1, z));
  }

  /** create a LineSegment3d from xy coordinates of start and end, with common z.
   * @param x0 start point x coordinate.
   * @param y0 start point y coordinate.
   * @param x1 end point x coordinate.
   * @param y1 end point y coordinate.
   * @param z z coordinate to use for both points.
   * @param result optional existing LineSegment to be reinitialized.
   */
  public static createXYZXYZ(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, result?: LineSegment3d) {
    if (result) {
      result._point0.set(x0, y0, z0);
      result._point1.set(x1, y1, z1);
      return result;
    }
    return new LineSegment3d(Point3d.create(x0, y0, z0), Point3d.create(x1, y1, z1));
  }

  /** Return the point at fractional position along the line segment. */
  public fractionToPoint(fraction: number, result?: Point3d): Point3d { return this._point0.interpolate(fraction, this._point1, result); }
  /** Return the length of the segment. */
  public override curveLength(): number { return this._point0.distance(this._point1); }
  /** Return the length of the partial segment between fractions. */
  public override curveLengthBetweenFractions(fraction0: number, fraction1: number): number {
    return Math.abs(fraction1 - fraction0) * this._point0.distance(this._point1);
  }
  /** Return the length of the segment. */
  public quickLength(): number { return this.curveLength(); }

  /**
   * Returns a curve location detail with both xyz and fractional coordinates of the closest point.
   * @param spacePoint point in space
   * @param extend if false, only return points within the bounded line segment. If true, allow the point to be on the unbounded line that contains the bounded segment.
   */
  public override closestPoint(spacePoint: Point3d, extend: VariantCurveExtendParameter, result?: CurveLocationDetail): CurveLocationDetail {
    let fraction = spacePoint.fractionOfProjectionToLine(this._point0, this._point1, 0.0);
    fraction = CurveExtendOptions.correctFraction(extend, fraction);
    result = CurveLocationDetail.create(this, result);
    // remark: This can be done by result.setFP (fraction, thePoint, undefined, a)
    //   but that creates a temporary point.
    result.fraction = fraction;
    this._point0.interpolate(fraction, this._point1, result.point);
    result.vectorInCurveLocationDetail = undefined;
    result.a = result.point.distance(spacePoint);
    return result;
  }
  /** swap the endpoint references. */
  public reverseInPlace(): void {
    const a = this._point0;
    this._point0 = this._point1;
    this._point1 = a;
  }
  /** Transform the two endpoints of this LinSegment. */
  public tryTransformInPlace(transform: Transform): boolean {
    this._point0 = transform.multiplyPoint3d(this._point0, this._point0);
    this._point1 = transform.multiplyPoint3d(this._point1, this._point1);
    return true;
  }
  /** Test if both endpoints are in a plane (within tolerance) */
  public isInPlane(plane: PlaneAltitudeEvaluator): boolean {
    return Geometry.isSmallMetricDistance(plane.altitude(this._point0))
      && Geometry.isSmallMetricDistance(plane.altitude(this._point1));
  }
  /** Compute points of simple (transverse) with a plane.
   * * Use isInPlane to test if the line segment is completely in the plane.
   */
  public override appendPlaneIntersectionPoints(plane: PlaneAltitudeEvaluator, result: CurveLocationDetail[]): number {
    const h0 = plane.altitude(this._point0);
    const h1 = plane.altitude(this._point1);
    const fraction = Order2Bezier.solveCoffs(h0, h1);
    let numIntersection = 0;
    if (fraction !== undefined) {
      numIntersection++;
      const detail = CurveLocationDetail.createCurveFractionPoint(this, fraction, this.fractionToPoint(fraction));
      detail.intervalRole = CurveIntervalRole.isolated;
      result.push(detail);
    }
    return numIntersection;
  }
  /**
   * Extend a range to include the (optionally transformed) line segment
   * @param range range to extend
   * @param transform optional transform to apply to the end points
   */
  public extendRange(range: Range3d, transform?: Transform): void {
    if (transform) {
      range.extendTransformedPoint(transform, this._point0);
      range.extendTransformedPoint(transform, this._point1);
    } else {
      range.extendPoint(this._point0);
      range.extendPoint(this._point1);
    }
  }
  /**
   * Construct a line from either of these json forms:
   *
   * * object with named start and end:
   * `{startPoint: pointValue, endPoint: pointValue}`
   * * array of two point values:
   * `[pointValue, pointValue]`
   * The point values are any values accepted by the Point3d method setFromJSON.
   * @param json data to parse.
   */
  public setFromJSON(json?: any) {
    if (!json) {
      this._point0.set(0, 0, 0);
      this._point1.set(1, 0, 0);
      return;
    } else if (json.startPoint && json.endPoint) { // {startPoint:json point, endPoint:json point}
      this._point0.setFromJSON(json.startPoint);
      this._point1.setFromJSON(json.endPoint);
    } else if (Array.isArray(json)
      && json.length > 1) { // [json point, json point]
      this._point0.setFromJSON(json[0]);
      this._point1.setFromJSON(json[1]);
    }
  }
  /** A simple line segment's fraction and distance are proportional. */
  public override getFractionToDistanceScale(): number | undefined { return this.curveLength(); }
  /**
   * Place the lineSegment3d start and points in a json object
   * @return {*} [[x,y,z],[x,y,z]]
   */
  public toJSON(): any { return [this._point0.toJSON(), this._point1.toJSON()]; }
  /** Create a new `LineSegment3d` with coordinates from json object.   See `setFromJSON` for object layout description. */
  public static fromJSON(json?: any): LineSegment3d {
    const result = new LineSegment3d(Point3d.createZero(), Point3d.create());
    result.setFromJSON(json);
    return result;
  }
  /** Near equality test with `other`. */
  public override isAlmostEqual(other: GeometryQuery): boolean {
    if (other instanceof LineSegment3d) {
      const ls = other;
      return this._point0.isAlmostEqual(ls._point0) && this._point1.isAlmostEqual(ls._point1);
    }
    return false;
  }

  /** Emit strokes to caller-supplied linestring */
  public emitStrokes(dest: LineString3d, options?: StrokeOptions): void {
    const numStroke = this.computeStrokeCountForOptions(options);
    dest.appendFractionalStrokePoints(this, numStroke, 0.0, 1.0);
  }
  /** Emit strokes to caller-supplied handler */
  public emitStrokableParts(handler: IStrokeHandler, options?: StrokeOptions): void {
    handler.startCurvePrimitive(this);
    const numStroke = this.computeStrokeCountForOptions(options);
    handler.announceSegmentInterval(this, this._point0, this._point1, numStroke, 0.0, 1.0);
    handler.endCurvePrimitive(this);
  }

  /**
   * return the stroke count required for given options.
   * @param options StrokeOptions that determine count
   */
  public computeStrokeCountForOptions(options?: StrokeOptions): number {
    let numStroke = 1;
    if (options) {
      if (options.maxEdgeLength)
        numStroke = options.applyMaxEdgeLength(numStroke, this.curveLength());
      numStroke = options.applyMinStrokesPerPrimitive(numStroke);
    }
    return numStroke;
  }
  /** Second step of double dispatch:  call `handler.handleLineSegment3d(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleLineSegment3d(this);
  }

  /**
   * Find intervals of this curve primitive that are interior to a clipper
   * @param clipper clip structure (e.g. clip planes)
   * @param announce function to be called announcing fractional intervals"  ` announce(fraction0, fraction1, curvePrimitive)`
   */
  public override announceClipIntervals(clipper: Clipper, announce?: AnnounceNumberNumberCurvePrimitive): boolean {
    return clipper.announceClippedSegmentIntervals(0.0, 1.0, this._point0, this._point1,
      announce ? (fraction0: number, fraction1: number) => announce(fraction0, fraction1, this) : undefined);
  }

  /** Return (if possible) a curve primitive which is a portion of this curve.
   * @param fractionA [in] start fraction
   * @param fractionB [in] end fraction
   */
  public override clonePartialCurve(fractionA: number, fractionB: number): CurvePrimitive | undefined {
    return LineSegment3d.create(this.fractionToPoint(fractionA), this.fractionToPoint(fractionB));
  }
}
