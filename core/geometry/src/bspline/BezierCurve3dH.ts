/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Bspline
 */

import { CurveLocationDetail } from "../curve/CurveLocationDetail";
import { Geometry } from "../Geometry";
import { GeometryHandler } from "../geometry3d/GeometryHandler";
import { Plane3dByOriginAndVectors } from "../geometry3d/Plane3dByOriginAndVectors";
import { Point2d } from "../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Range3d } from "../geometry3d/Range";
import { Ray3d } from "../geometry3d/Ray3d";
import { Transform } from "../geometry3d/Transform";
import { Matrix4d } from "../geometry4d/Matrix4d";
import { Point4d } from "../geometry4d/Point4d";
import { BezierPolynomialAlgebra } from "../numerics/BezierPolynomials";
import { BezierCurveBase } from "./BezierCurveBase";

/** 3d curve with homogeneous weights.
 * * A control point with weight w and cartesian (projected) coordinates x,y,z has the weight multiplied into the coordinates,
 *    hence the control point as stored is (xw, yw, zw, w).
 * @public
 */
export class BezierCurve3dH extends BezierCurveBase {
  /** test if `other` is also a BezierCurve3dH. */
  public isSameGeometryClass(other: any): boolean { return other instanceof BezierCurve3dH; }
  /**
   * Apply (multiply by) an affine transform
   * @param transform
   */
  public tryTransformInPlace(transform: Transform): boolean {
    const data = this._workData0;
    for (let i = 0; i < this._polygon.order; i++) {
      this._polygon.getPolygonPoint(i, data);
      transform.multiplyXYZWToFloat64Array(data[0], data[1], data[2], data[3], data);
      this._polygon.setPolygonPoint(i, data);
    }
    return true;
  }
  /**
   * Apply (multiply by) a perspective transform
   * @param matrix
   */
  public tryMultiplyMatrix4dInPlace(matrix: Matrix4d) {
    matrix.multiplyBlockedFloat64ArrayInPlace(this._polygon.packedData);
  }
  private _workRay0: Ray3d;
  private _workRay1: Ray3d;
  /** Return a specific pole as a full `[x,y,z,x] Point4d` */
  public getPolePoint4d(i: number, result?: Point4d): Point4d | undefined {
    const data = this._polygon.getPolygonPoint(i, this._workData0);
    if (data)
      return Point4d.create(data[0], data[1], data[2], data[3], result);
    return undefined;
  }
  /** Return a specific pole normalized to weight 1
   */
  public getPolePoint3d(i: number, result?: Point3d): Point3d | undefined {
    const data = this._polygon.getPolygonPoint(i, this._workData0);
    if (data)
      return Point3d.createFromPackedXYZW(data, 0, result);
    return undefined;
  }
  /**
   * Returns true if all weights are within tolerance of 1.0
   */
  public isUnitWeight(tolerance?: number): boolean {
    if (tolerance === undefined)
      tolerance = Geometry.smallAngleRadians;
    const aLow = 1.0 - tolerance;
    const aHigh = 1.0 + tolerance;
    const data = this._polygon.packedData;
    const n = data.length;
    let a;
    for (let i = 3; i < n; i += 4) {
      a = data[i];
      if (a < aLow || a > aHigh)
        return false;
    }
    return true;
  }
  /**
   * Capture a polygon as the data for a new `BezierCurve3dH`
   * @param polygon complete packed data and order.
   */
  private constructor(polygon: Float64Array) {
    super(4, polygon);
    this._workRay0 = Ray3d.createXAxis();
    this._workRay1 = Ray3d.createXAxis();
  }
  /** Create a curve with given points.
   * * If input is `Point2d[]`, the points are promoted with `z=0` and `w=1`
   * * If input is `Point3d[]`, the points are promoted with w=1`
   *
   */
  public static create(data: Point3d[] | Point4d[] | Point2d[]): BezierCurve3dH | undefined {
    if (data.length < 1)
      return undefined;
    const polygon = new Float64Array(data.length * 4);
    if (data[0] instanceof Point3d) {
      let i = 0;
      for (const p of (data as Point3d[])) {
        polygon[i++] = p.x;
        polygon[i++] = p.y;
        polygon[i++] = p.z;
        polygon[i++] = 1.0;
      }
      return new BezierCurve3dH(polygon);
    } else if (data[0] instanceof Point4d) {
      let i = 0;
      for (const p of (data as Point4d[])) {
        polygon[i++] = p.x;
        polygon[i++] = p.y;
        polygon[i++] = p.z;
        polygon[i++] = p.w;
      }
      return new BezierCurve3dH(polygon);
    } else if (data[0] instanceof Point2d) {
      let i = 0;
      for (const p of (data as Point2d[])) {
        polygon[i++] = p.x;
        polygon[i++] = p.y;
        polygon[i++] = 0.0;
        polygon[i++] = 1.0;
      }
      return new BezierCurve3dH(polygon);
    }
    return undefined;
  }
  /** create a bezier curve of specified order, filled with zeros */
  public static createOrder(order: number): BezierCurve3dH {
    const polygonArray = new Float64Array(order * 4); // and we trust that this is all zeros !!!
    return new BezierCurve3dH(polygonArray);
  }
  /** Load order * 4 doubles from data[3 * spanIndex] as poles (with added weight) */
  public loadSpan3dPolesWithWeight(data: Float64Array, spanIndex: number, weight: number) {
    this._polygon.loadSpanPolesWithWeight(data, 3, spanIndex, weight);
  }
  /** Load order * 4 doubles from data[3 * spanIndex] as poles (with added weight) */
  public loadSpan4dPoles(data: Float64Array, spanIndex: number) {
    this._polygon.loadSpanPoles(data, spanIndex);
  }
  /** Clone the entire curve. */
  public clone(): BezierCurve3dH {
    return new BezierCurve3dH(this._polygon.clonePolygon());
  }
  /**
   * Return a curve after transform.
   */
  public cloneTransformed(transform: Transform): BezierCurve3dH {
    const curve1 = this.clone();
    curve1.tryTransformInPlace(transform);
    return curve1;
  }
  /** Return a (deweighted) point on the curve. If deweight fails, returns 000 */
  public fractionToPoint(fraction: number, result?: Point3d): Point3d {
    this._polygon.evaluate(fraction, this._workData0);
    result = Point3d.createFromPackedXYZW(this._workData0, 0, result);
    return result ? result : Point3d.createZero();
  }
  /** Return a (deweighted) point on the curve. If deweight fails, returns 000 */
  public fractionToPoint4d(fraction: number, result?: Point4d): Point4d {
    this._polygon.evaluate(fraction, this._workData0);
    return Point4d.createFromPackedXYZW(this._workData0, 0, result);
  }
  /** Return the cartesian point and derivative vector. */
  public fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d {
    this._polygon.evaluate(fraction, this._workData0);
    this._polygon.evaluateDerivative(fraction, this._workData1);
    result = Ray3d.createWeightedDerivative(this._workData0, this._workData1, result);
    if (result)
      return result;
    // Bad. Very Bad.  Return origin and x axis.   Should be undefined, but usual cartesian types do not allow that
    return Ray3d.createXAxis();
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
  /** test for nearly equal control points */
  public override isAlmostEqual(other: any): boolean {
    if (other instanceof BezierCurve3dH) {
      return this._polygon.isAlmostEqual(other._polygon);
    }
    return false;
  }
  /** Second step of double dispatch:  call `handler.handleBezierCurve3dH(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleBezierCurve3dH(this);
  }
  /**
   * Form dot products of each pole with given coefficients. Return as entries in products array.
   * @param products array of (scalar) dot products
   * @param ax x coefficient
   * @param ay y coefficient
   * @param az z coefficient
   * @param aw w coefficient
   */
  public poleProductsXYZW(products: Float64Array, ax: number, ay: number, az: number, aw: number) {
    const n = this.numPoles;
    const data = this._polygon.packedData;
    for (let i = 0, k = 0; i < n; i++, k += 4)
      products[i] = ax * data[k] + ay * data[k + 1] + az * data[k + 2] + aw * data[k + 3];
  }
  /** Find the closest point within the bezier span, using true perpendicular test (but no endpoint test)
   * * If closer than previously recorded, update the CurveLocationDetail
   * * This assumes this bezier is saturated.
   * @param spacePoint point being projected
   * @param detail pre-allocated detail to record (evolving) closest point.
   * @returns true if an updated occurred, false if either (a) no perpendicular projections or (b) perpendiculars were not closer.
   */
  public updateClosestPointByTruePerpendicular(spacePoint: Point3d, detail: CurveLocationDetail): boolean {
    let numUpdates = 0;
    let roots: number[] | undefined;
    if (this.isUnitWeight()) {
      // unweighted !!!
      const productOrder = 2 * this.order - 2;
      this.allocateAndZeroBezierWorkData(productOrder, 0, 0);
      const bezier = this._workBezier!;
      // closestPoint condition is:
      //   (spacePoint - curvePoint) DOT curveTangent = 0;
      // Each product (x,y,z) of the DOT is the product of two bezier polynomials
      BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(bezier.coffs, this._polygon.packedData, 4, this.order, 1.0, 0, -spacePoint.x, 0);
      BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(bezier.coffs, this._polygon.packedData, 4, this.order, 1.0, 1, -spacePoint.y, 1);
      BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(bezier.coffs, this._polygon.packedData, 4, this.order, 1.0, 2, -spacePoint.z, 2);
      roots = bezier.roots(0.0, true);
    } else {
      // This bezier has weights.
      // The pure cartesian closest point condition is
      //   (spacePoint - X/w) DOT (X' w - w' X)/ w^2 = 0
      // ignoring denominator and using bezier coefficient differences for the derivative, making the numerator 0 is
      //   (w * spacePoint - X) DOT ( DELTA X * w - DELTA w * X) = 0
      const orderA = this.order;
      const orderB = 2 * this.order - 2; // products of component and component difference.
      const productOrder = orderA + orderB - 1;
      this.allocateAndZeroBezierWorkData(productOrder, orderA, orderB);
      const bezier = this._workBezier!;
      const workA = this._workCoffsA!;
      const workB = this._workCoffsB!;
      const packedData = this._polygon.packedData;
      for (let i = 0; i < 3; i++) {
        // x representing loop pass:   (w * spacePoint.x - curve.x(s), 1.0) * (curveDelta.x(s) * curve.w(s) - curve.x(s) * curveDelta.w(s))
        // (and p.w is always 1)
        BezierPolynomialAlgebra.scaledComponentSum(workA, packedData, 4, orderA, 3, spacePoint.at(i), // w * spacePoint.x
          i, -1.0); // curve.x(s) * 1.0
        BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(workB, packedData, 4, orderA, 1.0, 3, 1.0, i);
        BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(workB, packedData, 4, orderA, -1.0, i, 1.0, 3);
        BezierPolynomialAlgebra.accumulateProduct(bezier.coffs, workA, workB);
      }
      roots = bezier.roots(0.0, true);
    }
    if (roots) {
      for (const fraction of roots) {
        const xyz = this.fractionToPoint(fraction);
        const a = xyz.distance(spacePoint);
        numUpdates += detail.updateIfCloserCurveFractionPointDistance(this, fraction, xyz, a) ? 1 : 0;
      }
    }
    return numUpdates > 0;
  }
  /** Extend `rangeToExtend`, using candidate extrema at
   * * both end points
   * * any internal extrema in x,y,z
   */
  public extendRange(rangeToExtend: Range3d, transform?: Transform) {
    const order = this.order;
    if (!transform) {
      this.allocateAndZeroBezierWorkData(order * 2 - 2, 0, 0);
      const bezier = this._workBezier!;
      const data = this._polygon.packedData;
      this.getPolePoint3d(0, this._workPoint0);
      rangeToExtend.extend(this._workPoint0);
      this.getPolePoint3d(order - 1, this._workPoint0);
      rangeToExtend.extend(this._workPoint0);
      // Example:
      // For x component ...
      //     coefficients of (weighted x) are at axisIndex=0
      //     deweighted polynomial is (x(s)/w(s))
      //    its derivative (to be zeroed) is
      //              (x'(s)*w(s) -x(s) * w'(s)) / w^2(s)
      // The coefficients of the derivatives are (degree times) differences of successive coffs.
      // Make the numerator zero to get extrema
      for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
        bezier.zero();
        BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(
          bezier.coffs,
          data, 4, order,
          1.0,
          axisIndex, 0.0,
          3);
        BezierPolynomialAlgebra.accumulateScaledShiftedComponentTimesComponentDelta(
          bezier.coffs,
          data, 4, order,
          -1.0,
          3, 0.0,
          axisIndex);
        const roots = bezier.roots(0.0, true);
        if (roots) {
          for (const r of roots) {
            this.fractionToPoint(r, this._workPoint0);
            rangeToExtend.extend(this._workPoint0);
          }
        }
      }
    } else {
      this.allocateAndZeroBezierWorkData(order * 2 - 2, order, order);
      const componentCoffs = this._workCoffsA!;   // to hold transformed copy of x,y,z in turn.
      const weightCoffs = this._workCoffsB!;    // to hold weights
      const bezier = this._workBezier!;

      this.getPolePoint3d(0, this._workPoint0);
      rangeToExtend.extendTransformedPoint(transform, this._workPoint0);
      this.getPolePoint3d(order - 1, this._workPoint0);
      rangeToExtend.extendTransformedPoint(transform, this._workPoint0);

      const data = this._polygon.packedData;      // Example:
      // For x component ...
      //     coefficients of (weighted x) are at axisIndex=0
      //     deweighted polynomial is (x(s)/w(s))
      //    its derivative (to be zeroed) is
      //              (x'(s)*w(s) -x(s) * w'(s)) / w^2(s)
      // The coefficients of the derivatives are (degree times) differences of successive coffs.
      // Make the numerator zero to get extrema
      // apply one row of the transform to get the transformed coff by itself
      let weight;
      for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
        bezier.zero();
        for (let i = 0, k = 0; i < order; i++, k += 4) {
          weight = data[k + 3];
          componentCoffs[i] = transform.multiplyComponentXYZW(axisIndex, data[k], data[k + 1], data[k + 2], weight);
          weightCoffs[i] = weight;
        }
        BezierPolynomialAlgebra.accumulateProductWithDifferences(bezier.coffs, componentCoffs, weightCoffs, 1.0);
        BezierPolynomialAlgebra.accumulateProductWithDifferences(bezier.coffs, weightCoffs, componentCoffs, -1.0);
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
