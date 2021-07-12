/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Bspline
 */

import { LineString3d } from "../curve/LineString3d";
import { GeometryHandler } from "../geometry3d/GeometryHandler";
import { Plane3dByOriginAndVectors } from "../geometry3d/Plane3dByOriginAndVectors";
import { Point2d } from "../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Range3d } from "../geometry3d/Range";
import { Ray3d } from "../geometry3d/Ray3d";
import { Transform } from "../geometry3d/Transform";
import { Point4d } from "../geometry4d/Point4d";
import { BezierPolynomialAlgebra } from "../numerics/BezierPolynomials";
import { BezierCurveBase } from "./BezierCurveBase";

// ================================================================================================================
// ================================================================================================================
// ================================================================================================================
// ================================================================================================================
/** 3d Bezier curve class.
 * * Use BezierCurve3dH if the curve has weights.
 * * The control points (xyz) are managed as the _packedData buffer in the _polygon member of BezierCurveBase.
 * @public
 */
export class BezierCurve3d extends BezierCurveBase {
  /** test if `other` is also a BezierCurve3d. */
  public isSameGeometryClass(other: any): boolean { return other instanceof BezierCurve3d; }
  /** apply the transform to the control points. */
  public tryTransformInPlace(transform: Transform): boolean {
    const data = this._workData0;
    for (let i = 0; i < this._polygon.order; i++) {
      this._polygon.getPolygonPoint(i, data);
      transform.multiplyXYZToFloat64Array(data[0], data[1], data[2], data);
      this._polygon.setPolygonPoint(i, data);
    }
    return true;
  }
  private _workRay0: Ray3d;
  private _workRay1: Ray3d;
  /** Return a specific pole as a full `[x,y,z] Point3d` */
  public getPolePoint3d(i: number, result?: Point3d): Point3d | undefined {
    const data = this._polygon.getPolygonPoint(i, this._workData0);
    if (data)
      return Point3d.create(data[0], data[1], data[2], result);
    return undefined;
  }
  /** Return a specific pole as a full `[w*x,w*y,w*z, w] Point4d` */
  public getPolePoint4d(i: number, result?: Point4d): Point4d | undefined {
    const data = this._polygon.getPolygonPoint(i, this._workData0);
    if (data)
      return Point4d.create(data[0], data[1], data[2], 1.0, result);
    return undefined;
  }
  /**
   * Capture a polygon as the data for a new `BezierCurve3d`
   * @param polygon complete packed data and order.
   */
  private constructor(polygon: Float64Array) {
    super(3, polygon);
    this._workRay0 = Ray3d.createXAxis();
    this._workRay1 = Ray3d.createXAxis();
  }
  /** Return poles as a linestring */
  public copyPointsAsLineString(): LineString3d {
    const result = LineString3d.create();
    for (let i = 0; i < this._polygon.order; i++)
      result.addPoint(this.getPolePoint3d(i)!);
    return result;
  }
  /** Create a curve with given points.
   * * If input is `Point2d[]`, the points are promoted with `z=0` and `w=1`
   * * If input is `Point3d[]`, the points are promoted with w=1`
   *
   */
  public static create(data: Point3d[] | Point2d[]): BezierCurve3d | undefined {
    if (data.length < 1)
      return undefined;
    const polygon = new Float64Array(data.length * 3);
    if (data[0] instanceof Point3d) {
      let i = 0;
      for (const p of (data as Point3d[])) {
        polygon[i++] = p.x;
        polygon[i++] = p.y;
        polygon[i++] = p.z;
      }
      return new BezierCurve3d(polygon);
    } else if (data[0] instanceof Point2d) {
      let i = 0;
      for (const p of (data as Point2d[])) {
        polygon[i++] = p.x;
        polygon[i++] = p.y;
        polygon[i++] = 0.0;
      }
      return new BezierCurve3d(polygon);
    }
    return undefined;
  }
  /** create a bezier curve of specified order, filled with zeros */
  public static createOrder(order: number): BezierCurve3d {
    const polygonArray = new Float64Array(order * 3); // This is initialized to zeros!!
    return new BezierCurve3d(polygonArray);
  }
  /** Load order * 3 doubles from data[3 * spanIndex] as poles */
  public loadSpanPoles(data: Float64Array, spanIndex: number) {
    this._polygon.loadSpanPoles(data, spanIndex);
  }
  /** Clone as a bezier 3d. */
  public clone(): BezierCurve3d {
    return new BezierCurve3d(this._polygon.clonePolygon());
  }
  /** Clone the interval from f0 to f1. */
  public override clonePartialCurve(f0: number, f1: number): BezierCurve3d | undefined {
    const partialCurve = new BezierCurve3d(this._polygon.clonePolygon());
    partialCurve._polygon.subdivideToIntervalInPlace(f0, f1);
    return partialCurve;
  }

  /**
   * Return a curve after transform.
   */
  public cloneTransformed(transform: Transform): BezierCurve3d {
    const curve1 = this.clone();
    curve1.tryTransformInPlace(transform);
    return curve1;
  }
  /** Return a (de-weighted) point on the curve. If de-weight fails, returns 000 */
  public fractionToPoint(fraction: number, result?: Point3d): Point3d {
    this._polygon.evaluate(fraction, this._workData0);
    return Point3d.create(this._workData0[0], this._workData0[1], this._workData0[2], result);
  }
  /** Return the cartesian point and derivative vector. */
  public fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d {
    this._polygon.evaluate(fraction, this._workData0);
    this._polygon.evaluateDerivative(fraction, this._workData1);
    return Ray3d.createXYZUVW(this._workData0[0], this._workData0[1], this._workData0[2], this._workData1[0], this._workData1[1], this._workData1[2], result);
  }
  /** Construct a plane with
   * * origin at the fractional position along the arc
   * * x axis is the first derivative, i.e. tangent along the arc
   * * y axis is the second derivative, i.e. in the plane and on the center side of the tangent.
   * If the arc is circular, the second derivative is directly towards the center
   */
  public fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    const epsilon = 1.0e-8;
    const a = 1.0 / (2.0 * epsilon);
    if (!result)
      result = Plane3dByOriginAndVectors.createXYPlane();
    const ray = this.fractionToPointAndDerivative(fraction, this._workRay0);
    result.origin.setFrom(ray.origin);
    result.vectorU.setFrom(ray.direction);
    const ray0 = this.fractionToPointAndDerivative(fraction - epsilon, this._workRay0);
    const ray1 = this.fractionToPointAndDerivative(fraction + epsilon, this._workRay1);
    Vector3d.createAdd2Scaled(ray0.direction, -a, ray1.direction, a, result.vectorV);
    return result;
  }
  /** Near-equality test on poles. */
  public override isAlmostEqual(other: any): boolean {
    if (other instanceof BezierCurve3d) {
      return this._polygon.isAlmostEqual(other._polygon);
    }
    return false;
  }
  /** Second step of double dispatch:  call `handler.handleBezierCurve3d(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleBezierCurve3d(this);
  }
  /** Extend `rangeToExtend`, using candidate extrema at
   * * both end points
   * * any internal extrema in x,y,z
   */
  public extendRange(rangeToExtend: Range3d, transform?: Transform) {
    const order = this.order;
    if (!transform) {
      this.allocateAndZeroBezierWorkData(order - 1, 0, 0);
      const bezier = this._workBezier!;
      this.getPolePoint3d(0, this._workPoint0);
      rangeToExtend.extend(this._workPoint0);
      this.getPolePoint3d(order - 1, this._workPoint0);
      rangeToExtend.extend(this._workPoint0);
      for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
        BezierPolynomialAlgebra.componentDifference(bezier.coffs, this._polygon.packedData, 3, order, axisIndex);
        const roots = bezier.roots(0.0, true);
        if (roots) {
          for (const r of roots) {
            this.fractionToPoint(r, this._workPoint0);
            rangeToExtend.extend(this._workPoint0);
          }
        }
      }
    } else {
      this.allocateAndZeroBezierWorkData(order - 1, order, 0);
      const bezier = this._workBezier!;
      const componentCoffs = this._workCoffsA!;   // to hold transformed copy of x,y,z in turn.

      this.getPolePoint3d(0, this._workPoint0);
      rangeToExtend.extendTransformedPoint(transform, this._workPoint0);
      this.getPolePoint3d(order - 1, this._workPoint0);
      rangeToExtend.extendTransformedPoint(transform, this._workPoint0);
      const data = this._polygon.packedData;
      for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
        // apply one row of the transform to get the transformed coff by itself
        for (let i = 0, k = 0; i < order; i++, k += 3)
          componentCoffs[i] = transform.multiplyComponentXYZ(axisIndex, data[k], data[k + 1], data[k + 2]);
        BezierPolynomialAlgebra.univariateDifference(componentCoffs, bezier.coffs);
        const roots = bezier.roots(0.0, true);
        if (roots && roots.length > 0) {
          for (const r of roots) {
            this.fractionToPoint(r, this._workPoint0);
            rangeToExtend.extendTransformedPoint(transform, this._workPoint0);
          }
        }
      }

    }
  }
}
