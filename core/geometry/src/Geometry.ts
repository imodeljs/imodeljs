/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module CartesianGeometry
 */

// import { Point2d } from "./Geometry2d";
import { AngleSweep } from "./geometry3d/AngleSweep";
/* eslint-disable @typescript-eslint/naming-convention, no-empty */
import { Point2d, Vector2d, XY } from "./geometry3d/Point2dVector2d";
import { Point3d, Vector3d, XYZ } from "./geometry3d/Point3dVector3d";
import { XAndY } from "./geometry3d/XYZProps";
import { Point4d } from "./geometry4d/Point4d";

/** Enumeration of the 6 possible orderings of XYZ axis order
 * @public
 */
export enum AxisOrder {
  /** Right handed system, X then Y then Z */
  XYZ = 0, // eslint-disable-line @typescript-eslint/no-shadow
  /** Right handed system, Y then Z then X */
  YZX = 1,
  /** Right handed system, Z then X then Y */
  ZXY = 2,
  /** Left handed system, X then Z then Y */
  XZY = 4,
  /** Left handed system, Y then X then Z */
  YXZ = 5,
  /** Left handed system, Z then Y then X */
  ZYX = 6,
}
/** Enumeration of numeric indices of 3 axes AxisIndex.X, AxisIndex.Y, AxisIndex.Z
 * @public
 */
export enum AxisIndex {
  /** x axis is index 0 */
  X = 0,
  /** y axis is index 1 */
  Y = 1,
  /** 2 axis is index 2 */
  Z = 2,
}

/** Standard views.   Used in `Matrix3d.createStandardViewAxes (index: StandardViewIndex, worldToView :boolean)`
 * @public
 */
export enum StandardViewIndex {
  /** X to right, Y up */
  Top = 1,
  /** X to right, negative Y up */
  Bottom = 2,
  /** negative Y to right, Z up */
  Left = 3,
  /**  Y to right, Z up */
  Right = 4,
  /** X to right, Z up */
  Front = 5,
  /** negative X to right, Z up */
  Back = 6,
  /** View towards origin from (-1,-1,1) */
  Iso = 7,
  /** View towards origin from (1,-1,1) */
  RightIso = 8,
}

/** Enumeration among choice for how a coordinate transformation should incorporate scaling.
 * @public
 */
export enum AxisScaleSelect {
  /** All axes of unit length. */
  Unit = 0,
  /** On each axis, the vector length matches the longest side of the range of the data. */
  LongestRangeDirection = 1,
  /** On each axis, the vector length matches he length of the corresponding edge of the range. */
  NonUniformRangeContainment = 2,
}
/** object with a radians value and its associated cosine and sine values.
 * @public
 */
export interface TrigValues {
  /** the cosine value */
  c: number;
  /** the sine value */
  s: number;
  /** the radians value */
  radians: number;
}
/**
 * Interface so various plane representations can be used by algorithms that just want altitude evaluations.
 *
 * Specific implementors are
 * * Plane3dByOriginAndUnitNormal
 * * Point4d (used for homogeneous plane coefficients)
 * @public
 */
export interface PlaneAltitudeEvaluator {
  /**
 * Return the altitude of the point from the plane.
 * @param point point for evaluation
 */
  altitude(point: Point3d): number;
  /**
     * Return the altitude of the point from the plane, with the point supplied as simple x,y,z
     * @param x x coordinate
     * @param y y coordinate
     * @param z z coordinate
     */
  altitudeXYZ(x: number, y: number, z: number): number;
  /**
   * Return the derivative of altitude wrt motion along a vector.
   * @param point point for evaluation
   */
  velocity(vector: Vector3d): number;

  /**
   * Return the derivative of altitude wrt motion along a vector given by components
   * @param point point for evaluation
   */
  velocityXYZ(x: number, y: number, z: number): number;
  /**
   * Return the weighted altitude
   * @param point xyzw data.
   */
  weightedAltitude(point: Point4d): number;
}
/**
 * Interface for `toJSON` and `setFromJSON` methods
 * @public
 */
export interface BeJSONFunctions {
  /**
   * Set content from a JSON object.
   * If the json object is undefined or unrecognized, always set a default value.
   */
  setFromJSON(json: any): void;
  /** Return a json object with this object's contents. */
  toJSON(): any;
}

/** The Properties for a JSON representation of an Angle.
 * If value is a number, it is in *degrees*.
 * If value is an object, it can have either degrees or radians.
 * @public
 */
export type AngleProps = { degrees: number } | { radians: number } | { _radians: number } | { _degrees: number } | number;

/** The Properties for a JSON representation of an AngleSweep.
 * * The json data is always start and end angles as a pair in an array.
 * If AngleProps data is an array of two numbers, it is an angle in degrees.
 * If the AngleProps is an object with key degrees, the degrees value must be an array with the two degrees angles as numbers
 * If the AngleProps is an object with key radians, the radians value must be an array with the two radians angles as numbers
 * @public
 */
export type AngleSweepProps =
  AngleSweep |
  { degrees: [number, number] } |
  { radians: [number, number] } |
  [number, number];

/**
 * Class containing static methods for typical numeric operations.
 * * Experimentally, methods like Geometry.hypotenuse are observed to be faster than the system intrinsics.
 * * This is probably due to
 *    * Fixed length arg lists
 *    * strongly typed parameters
 * @public
 */
export class Geometry {
  /** Tolerance for small distances in metric coordinates */
  public static readonly smallMetricDistance = 1.0e-6;
  /** Square of `smallMetricTolerance` */
  public static readonly smallMetricDistanceSquared = 1.0e-12;
  /** tolerance for small angle measured in radians. */
  public static readonly smallAngleRadians = 1.0e-12;
  /** square of `smallAngleRadians` */
  public static readonly smallAngleRadiansSquared = 1.0e-24;
  /** numeric value that may considered huge for numbers expected to be 0..1 fractions.
   * * But note that the "allowed" result value is vastly larger than 1.
   */
  public static readonly largeFractionResult = 1.0e10;
  /** numeric value that may considered zero  0..1 fractions. */
  public static readonly smallFraction = 1.0e-10;
  /** numeric value that may considered huge for numbers expected to be coordinates.
   * * This allows larger results than `largeFractionResult`.
   */
  public static readonly largeCoordinateResult = 1.0e13;
  /** numeric value that may considered infinite for metric coordinates.
   * * This coordinate should be used only as a placeholder indicating "at infinity" -- computing actual points at this coordinate invites numerical problems.
   */
  public static readonly hugeCoordinate = 1.0e12;
  /** Test if absolute value of x is huge.
   * * See `Geometry.hugeCoordinate`
   */
  public static isHugeCoordinate(x: number): boolean {
    return x > this.hugeCoordinate || x < - this.hugeCoordinate;
  }

  /** Test if a number is odd.
   */
  public static isOdd(x: number): boolean {
    return (x & (0x01)) === 1;
  }
  /** Radians value for full circle 2PI radians minus `smallAngleRadians` */
  public static readonly fullCircleRadiansMinusSmallAngle = 2.0 * Math.PI - 1.0e-12;    // smallAngleRadians less than 360degrees
  /** Correct `distance` to zero if undefined or smaller than metric tolerance.   Otherwise return it unchanged. */
  public static correctSmallMetricDistance(distance: number | undefined, replacement: number = 0.0): number {
    if (distance === undefined || Math.abs(distance) < Geometry.smallMetricDistance) {
      return replacement;
    }
    return distance;
  }
  /**
 * If `a` is large enough for safe division, return `1/a`, using Geometry.smallMetricDistance as the tolerance for declaring it as divide by zero.  Otherwise return `undefined`.
 * @param a denominator of division
 */
  public static inverseMetricDistance(a: number): number | undefined { return (Math.abs(a) <= Geometry.smallMetricDistance) ? undefined : 1.0 / a; }
  /**
   * If `a` is large enough, return `1/a`, using the square of Geometry.smallMetricDistance as the tolerance for declaring it as divide by zero.  Otherwise return `undefined`.
   * @param a denominator of division
   */
  public static inverseMetricDistanceSquared(a: number): number | undefined {
    return (Math.abs(a) <= Geometry.smallMetricDistanceSquared) ? undefined : 1.0 / a;
  }
  /** Boolean test for metric coordinate near-equality */
  public static isSameCoordinate(x: number, y: number, tol?: number): boolean {
    if (tol)
      return Math.abs(x - y) < Math.abs(tol);
    return Math.abs(x - y) < Geometry.smallMetricDistance;
  }
  /** Boolean test for metric coordinate near-equality, with toleranceFactor applied to the usual smallMetricDistance */
  public static isSameCoordinateWithToleranceFactor(x: number, y: number, toleranceFactor: number): boolean {
    return Geometry.isSameCoordinate(x, y, toleranceFactor * Geometry.smallMetricDistance);
  }

  /** Boolean test for metric coordinate near-equality of x, y pair */
  public static isSameCoordinateXY(x0: number, y0: number, x1: number, y1: number, tol: number = Geometry.smallMetricDistance): boolean {
    let d = x1 - x0;
    if (d < 0)
      d = -d;
    if (d > tol)
      return false;
    d = y1 - y0;
    if (d < 0)
      d = -d;
    return d < tol;
  }
  /** Boolean test for squared metric coordinate near-equality */
  public static isSameCoordinateSquared(x: number, y: number): boolean {
    return Math.abs(Math.sqrt(x) - Math.sqrt(y)) < Geometry.smallMetricDistance;
  }
  /** boolean test for small `dataA.distance (dataB)`  within `smallMetricDistance` */
  public static isSamePoint3d(dataA: Point3d, dataB: Point3d): boolean { return dataA.distance(dataB) < Geometry.smallMetricDistance; }
  /** boolean test for distance between `XYZ` objects within `smallMetricDistance`
   *  * Note that Point3d and Vector3d are both derived from XYZ, so this method tolerates mixed types.
   */
  public static isSameXYZ(dataA: XYZ, dataB: XYZ): boolean { return dataA.distance(dataB) < Geometry.smallMetricDistance; }
  /** boolean test for small `dataA.distanceXY (dataB)`  within `smallMetricDistance` */
  public static isSamePoint3dXY(dataA: Point3d, dataB: Point3d): boolean { return dataA.distanceXY(dataB) < Geometry.smallMetricDistance; }
  /** boolean test for small `dataA.distanceXY (dataB)`  within `smallMetricDistance` */
  public static isSameVector3d(dataA: Vector3d, dataB: Vector3d): boolean { return dataA.distance(dataB) < Geometry.smallMetricDistance; }
  /** boolean test for small `dataA.distanceXY (dataB)`  within `smallMetricDistance` */
  public static isSamePoint2d(dataA: Point2d, dataB: Point2d): boolean { return dataA.distance(dataB) < Geometry.smallMetricDistance; }
  /** boolean test for small `dataA.distanceXY (dataB)`  within `smallMetricDistance` */
  public static isSameVector2d(dataA: Vector2d, dataB: Vector2d): boolean { return dataA.distance(dataB) < Geometry.smallMetricDistance; }

  /**
   * Lexical comparison of (a.x,a.y) (b.x,b.y) with x as first test, y second.
   * * This is appropriate for a horizontal sweep in the plane.
   */
  public static lexicalXYLessThan(a: XY | XYZ, b: XY | XYZ): -1 | 0 | 1 {
    if (a.x < b.x)
      return -1;
    else if (a.x > b.x)
      return 1;
    if (a.y < b.y)
      return -1;
    else if (a.y > b.y)
      return 1;
    return 0;
  }
  /**
   * Lexical comparison of (a.x,a.y) (b.x,b.y) with y as first test, x second.
   * * This is appropriate for a vertical sweep in the plane.
   */
  public static lexicalYXLessThan(a: XY | XYZ, b: XY | XYZ): -1 | 0 | 1 {
    if (a.y < b.y)
      return -1;
    else if (a.y > b.y)
      return 1;
    if (a.x < b.x)
      return -1;
    else if (a.x > b.x)
      return 1;
    return 0;
  }
  /**
   * Lexical test, based on x first, y second, z third.
   */
  public static lexicalXYZLessThan(a: XYZ, b: XYZ): -1 | 0 | 1 {
    if (a.x < b.x)
      return -1;
    else if (a.x > b.x)
      return 1;
    if (a.y < b.y)
      return -1;
    else if (a.y > b.y)
      return 1;
    if (a.z < b.z)
      return -1;
    else if (a.z > b.z)
      return 1;
    return 0;
  }
  /** Test if `value` is small compared to `smallAngleRadians`.
   * * This is appropriate if `value` is know to be a typical 0..1 fraction.
   */
  public static isSmallRelative(value: number): boolean { return Math.abs(value) < Geometry.smallAngleRadians; }
  /** Test if `value` is small compared to `smallAngleRadians` */
  public static isSmallAngleRadians(value: number): boolean { return Math.abs(value) < Geometry.smallAngleRadians; }
  /** Toleranced equality test, using tolerance `smallAngleRadians * ( 1 + abs(a) + (abs(b)))`
   * * Effectively an absolute tolerance of `smallAngleRadians`, with tolerance increasing for larger values of a and b.
  */
  public static isAlmostEqualNumber(a: number, b: number): boolean {
    const sumAbs = 1.0 + Math.abs(a) + Math.abs(b);
    return Math.abs(a - b) <= Geometry.smallAngleRadians * sumAbs;
  }
  /** Toleranced equality test, using tolerance `smallAngleRadians * ( 1 + abs(a) + (abs(b)))`
   * * Effectively an absolute tolerance of `smallAngleRadians`, with tolerance increasing for larger values of a and b.
  */
  public static isAlmostEqualXAndY(a: XAndY, b: XAndY): boolean {
    const sumAbs = 1.0 + Math.abs(a.x) + Math.abs(b.x) + Math.abs(a.y) + Math.abs(b.y);
    const tolerance = Geometry.smallAngleRadians * sumAbs;
    return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
  }

  /** Toleranced equality test, using caller-supplied tolerance.
   * If no tolerance is given, use smallMetricDistance
   */
  public static isDistanceWithinTol(distance: number, tol?: number): boolean {
    if (tol !== undefined)
      return Math.abs(distance) <= Math.abs(tol);
    return Math.abs(distance) <= Geometry.smallMetricDistance;
    }
  /** Toleranced equality test, using `smallMetricDistance` tolerance. */
  public static isSmallMetricDistance(distance: number): boolean {
    return Math.abs(distance) <= Geometry.smallMetricDistance;
  }

  /** Toleranced equality, using `smallMetricDistanceSquared` tolerance. */
  public static isSmallMetricDistanceSquared(distanceSquared: number): boolean {
    return Math.abs(distanceSquared) <= Geometry.smallMetricDistanceSquared;
  }
  /** Return `axis modulo 3` with proper handling of negative indices (-1 is z), -2 is y, -3 is x etc) */
  public static cyclic3dAxis(axis: number): number {
    /* Direct test for the most common cases, avoid modulo */
    if (axis >= 0) {
      if (axis < 3)
        return axis;
      if (axis < 6)
        return axis - 3;
      return axis % 3;
    }
    const j = axis + 3;
    if (j >= 0)
      return j;
    return 2 - ((-axis - 1) % 3);
  }
  /** Return the AxisOrder for which axisIndex is the first named axis.
   * * `axisIndex===0`returns AxisOrder.XYZ
   * * `axisIndex===1`returns AxisOrder.YZX
   * * `axisIndex===2`returns AxisOrder.ZXY
   */
  public static axisIndexToRightHandedAxisOrder(axisIndex: AxisIndex): AxisOrder {
    if (axisIndex === 0) return AxisOrder.XYZ;
    if (axisIndex === 1) return AxisOrder.YZX;
    if (axisIndex === 2) return AxisOrder.ZXY;
    return Geometry.axisIndexToRightHandedAxisOrder(Geometry.cyclic3dAxis(axisIndex));
  }
  /** Return the largest absolute distance from a to either of b0 or b1 */
  public static maxAbsDiff(a: number, b0: number, b1: number): number { return Math.max(Math.abs(a - b0), Math.abs(a - b1)); }
  /** Return the largest absolute absolute value among x,y,z */
  public static maxAbsXYZ(x: number, y: number, z: number): number {
    return Geometry.maxXYZ(Math.abs(x), Math.abs(y), Math.abs(z));
  }
  /** Return the largest absolute absolute value among x,y */
  public static maxAbsXY(x: number, y: number): number {
    return Geometry.maxXY(Math.abs(x), Math.abs(y));
  }

  /** Return the largest signed value among a, b, c */
  public static maxXYZ(a: number, b: number, c: number): number {
    let q = a;
    if (b > q) q = b;
    if (c > q) q = c;
    return q;
  }
  /** Examine the value (particularly sign) of x.
   * * If x is negative, return outNegative.
   * * If x is true zero, return outZero
   * * If x is positive, return outPositive
   */
  public static split3WaySign(x: number, outNegative: number, outZero: number, outPositive: number): number {
    if (x < 0)
      return outNegative;
    if (x > 0.0)
      return outPositive;
    return outZero;
  }

  /** Return the largest signed value among a, b */
  public static maxXY(a: number, b: number): number {
    let q = a;
    if (b > q) q = b;
    return q;
  }

  /** Return the smallest signed value among a, b */
  public static minXY(a: number, b: number): number {
    let q = a;
    if (b < q) q = b;
    return q;
  }
  /** Return the hypotenuse `sqrt(x*x + y*y)`. This is much faster than `Math.hypot(x,y)`. */
  public static hypotenuseXY(x: number, y: number): number { return Math.sqrt(x * x + y * y); }
  /** Return the squared `hypotenuse (x*x + y*y)`. */
  public static hypotenuseSquaredXY(x: number, y: number): number { return x * x + y * y; }
  /** Return the square of x */
  public static square(x: number): number { return x * x; }

  /** Return the hypotenuse `sqrt(x*x + y*y + z*z)`. This is much faster than `Math.hypot(x,y,z)`. */
  public static hypotenuseXYZ(x: number, y: number, z: number): number { return Math.sqrt(x * x + y * y + z * z); }
  /** Return the squared hypotenuse `(x*x + y*y + z*z)`. This is much faster than `Math.hypot(x,y,z)`. */
  public static hypotenuseSquaredXYZ(x: number, y: number, z: number): number { return x * x + y * y + z * z; }
  /** Return the (full 4d) hypotenuse `sqrt(x*x + y*y + z*z + w*w)`. This is much faster than `Math.hypot(x,y,z,w)`. */
  public static hypotenuseXYZW(x: number, y: number, z: number, w: number): number { return Math.sqrt(x * x + y * y + z * z + w * w); }
  /** Return the squared hypotenuse `(x*x + y*y + z*z+w*w)`. This is much faster than `Math.hypot(x,y,z)`. */
  public static hypotenuseSquaredXYZW(x: number, y: number, z: number, w: number): number { return x * x + y * y + z * z + w * w; }
  /**
   * Return the distance between xy points given as numbers.
   * @param x0 x coordinate of point 0
   * @param y0 y coordinate of point 0
   * @param x1 x coordinate of point 1
   * @param y1 y coordinate of point 1
   */
  public static distanceXYXY(x0: number, y0: number, x1: number, y1: number): number {
    return Geometry.hypotenuseXY(x1 - x0, y1 - y0);
  }
  /**
   * Return the distance between xyz points given as numbers.
   * @param x0 x coordinate of point 0
   * @param y0 y coordinate of point 0
   * @param z0 z coordinate of point 0
   * @param x1 x coordinate of point 1
   * @param y1 y coordinate of point 1
   * @param z1 z coordinate of point 1
   */
  public static distanceXYZXYZ(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
    return Geometry.hypotenuseXYZ(x1 - x0, y1 - y0, z1 - z0);
  }
  /** Returns Returns the triple product of 3 vectors provided as x,y,z number sequences.
   *
   * * The triple product is the determinant of the 3x3 matrix with the 9 numbers placed in either row or column order.
   * * The triple product is positive if the 3 vectors form a right handed coordinate system.
   * * The triple product is negative if the 3 vectors form a left handed coordinate system.
   * * Treating the 9 numbers as 3 vectors U, V, W, any of these formulas gives the same result:
   *
   * ** U dot (V cross W)
   * ** V dot (W cross U)
   * ** W dot (U cross V)
   * **  (-U dot (W cross V))  -- (note the negative -- reversing cross product order changes the sign)
   * ** (-V dot (U cross W)) -- (note the negative -- reversing cross product order changes the sign)
   * ** (-W dot (V cross U)) -- (note the negative -- reversing cross product order changes the sign)
   * * the triple product is 6 times the (signed) volume of the tetrahedron with the three vectors as edges from a common vertex.
   */
  public static tripleProduct(
    ux: number, uy: number, uz: number,
    vx: number, vy: number, vz: number,
    wx: number, wy: number, wz: number): number {
    return ux * (vy * wz - vz * wy)
      + uy * (vz * wx - vx * wz)
      + uz * (vx * wy - vy * wx);
  }
  /** Returns the determinant of the 4x4 matrix unrolled as the 16 parameters.
   */
  public static determinant4x4(
    xx: number, xy: number, xz: number, xw: number,
    yx: number, yy: number, yz: number, yw: number,
    zx: number, zy: number, zz: number, zw: number,
    wx: number, wy: number, wz: number, ww: number): number {
    return xx * this.tripleProduct(yy, yz, yw, zy, zz, zw, wy, wz, ww)
      - yx * this.tripleProduct(xy, xz, xw, zy, zz, zw, wy, wz, ww)
      + zx * this.tripleProduct(xy, xz, xw, yy, yz, yw, wy, wz, ww)
      - wx * this.tripleProduct(xy, xz, xw, yy, yz, yw, zy, zz, zw);
  }
  /** Return the mean curvature for two radii, with 0 radius implying 0 curvature */
  public static meanCurvatureOfRadii(r0: number, r1: number): number {
    return 0.5 * (this.safeDivideFraction(1, r0, 0) + this.safeDivideFraction(1, r1, 0));
  }
  /**
 * Returns curvature magnitude from a first and second derivative vector.
 * @param ux  first derivative x component
 * @param uy first derivative y component
 * @param uz first derivative z component
 * @param vx second derivative x component
 * @param vy second derivative y component
 * @param vz second derivative z component
 */
  public static curvatureMagnitude(
    ux: number, uy: number, uz: number,
    vx: number, vy: number, vz: number): number {
    let q = uy * vz - uz * vy;
    let sum = q * q;
    q = uz * vx - ux * vz;
    sum += q * q;
    q = ux * vy - uy * vx;
    sum += q * q;
    const a = Math.sqrt(ux * ux + uy * uy + uz * uz);
    const b = Math.sqrt(sum);
    // (sum and a are both nonnegative)
    const aaa = a * a * a;
    // radius of curvature = aaa / b;
    // curvature = b/aaa
    const tol = Geometry.smallAngleRadians;
    if (aaa > tol * b)
      return b / aaa;
    return 0; // hm.. maybe should be infinite?
  }

  /** Returns the determinant of 3x3 matrix with x and y rows taken from 3 points, third row from corresponding numbers.
   *
   */
  public static tripleProductXYW(
    columnA: XAndY, weightA: number,
    columnB: XAndY, weightB: number,
    columnC: XAndY, weightC: number): number {
    return Geometry.tripleProduct(
      columnA.x, columnB.x, columnC.x,
      columnA.y, columnB.y, columnC.y,
      weightA, weightB, weightC);
  }

  /** Returns the determinant of 3x3 matrix with x and y rows taken from 3 points, third row from corresponding numbers.
   *
   */
  public static tripleProductPoint4dXYW(
    columnA: Point4d,
    columnB: Point4d,
    columnC: Point4d): number {
    return Geometry.tripleProduct(
      columnA.x, columnB.x, columnC.x,
      columnA.y, columnB.y, columnC.y,
      columnA.w, columnB.w, columnC.w);
  }
  /** 2D cross product of vectors layed out as scalars. */
  public static crossProductXYXY(ux: number, uy: number, vx: number, vy: number): number {
    return ux * vy - uy * vx;
  }

  /** 3D cross product of vectors layed out as scalars. */
  public static crossProductXYZXYZ(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, result?: Vector3d): Vector3d {
    return Vector3d.create(
      uy * vz - uz * vy,
      uz * vx - ux * vz,
      ux * vy - uy * vx, result);
  }

  /** magnitude of 3D cross product of vectors, with the vectors presented as */
  public static crossProductMagnitude(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): number {
    return Geometry.hypotenuseXYZ(
      uy * vz - uz * vy,
      uz * vx - ux * vz,
      ux * vy - uy * vx);
  }
  /** 3D dot product of vectors layed out as scalars. */
  public static dotProductXYZXYZ(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): number {
    return ux * vx + uy * vy + uz * vz;
  }
  /** 2D dot product of vectors layed out as scalars. */
  public static dotProductXYXY(ux: number, uy: number, vx: number, vy: number): number {
    return ux * vx + uy * vy;
  }
  /**
   * Clamp to (min(a,b), max(a,b))
   * @param x
   * @param a
   * @param b
   */
  public static clampToStartEnd(x: number, a: number, b: number): number {
    if (a > b)
      return Geometry.clampToStartEnd(x, b, a);
    if (x < a)
      return a;
    if (b < x)
      return b;
    return x;
  }
  /**
   * Clamp value to (min,max) with no test for order of (min,max)
   * @param value value to clamp
   * @param min smallest allowed output
   * @param max largest allowed result.
   */
  public static clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
  /** If given a number, return it.   If given undefined, return `defaultValue`. */
  public static resolveNumber(value: number | undefined, defaultValue: number = 0): number {
    return value !== undefined ? value : defaultValue;
  }
  /** If given a value, return it.   If given undefined, return `defaultValue`. */
  public static resolveValue<T>(value: T | undefined, defaultValue: T): T {
    return value !== undefined ? value : defaultValue;
  }
/** If given value matches a target, return undefined.   Otherwise return the value. */
public static resolveToUndefined<T>(value: T | undefined, targetValue: T): T | undefined {
  return value === targetValue ? undefined : value;
}

  /** simple interpolation between values, but choosing (based on fraction) a or b as starting point for maximum accuracy. */
  public static interpolate(a: number, f: number, b: number): number {
    return f <= 0.5 ? a + f * (b - a) : b - (1.0 - f) * (b - a);
  }

  /** given an axisOrder (e.g. XYZ, YZX, ZXY, XZYLeftHanded etc) and an (integer) offset, resolve to an axis index. */
  public static axisOrderToAxis(order: AxisOrder, index: number): number {
    const axis = order <= AxisOrder.ZXY ? order + index : (order - AxisOrder.XZY) - index;
    return Geometry.cyclic3dAxis(axis);
  }
  /** Return (a modulo period), e.g. for use as a cyclic index.  Both a and period may be negative. */
  public static modulo(a: number, period: number): number {
    if (period <= 0) {
      if (period === 0)
        return a;
      return -Geometry.modulo(-a, -period);
    }

    if (a >= 0) {
      if (a < period)
        return a;
      if (a < 2 * period)
        return a - period;
    } else {
      a += period;  // hopefully move into primary period without division and floor
      if (a > 0)
        return a;
    }
    const m = Math.floor(a / period);
    return a - m * period;
  }
  /** return 0 if the value is undefined, 1 if defined. */
  public static defined01(value: any): number { return value === undefined ? 0 : 1; }
  /** normally, return numerator/denominator.
   * but if the ratio would exceed Geometry.largeFractionResult, return undefined.
   */
  public static conditionalDivideFraction(numerator: number, denominator: number): number | undefined {
    if (Math.abs(denominator) * Geometry.largeFractionResult > Math.abs(numerator))
      return numerator / denominator;
    return undefined;
  }

  /** normally, return numerator/denominator.
   * but if the ratio would exceed Geometry.largestResult, return undefined.
   */
  public static conditionalDivideCoordinate(numerator: number, denominator: number, largestResult: number = Geometry.largeCoordinateResult): number | undefined {
    if (Math.abs(denominator * largestResult) > Math.abs(numerator))
      return numerator / denominator;
    return undefined;
  }

  /** return the 0, 1, or 2 pairs of (c,s) values that solve
   * {constCoff + cosCoff * c + sinCoff * s = }
   * with the constraint {c*c+s*s = 1}
   */
  public static solveTrigForm(constCoff: number, cosCoff: number, sinCoff: number): Vector2d[] | undefined {
    {
      const delta2 = cosCoff * cosCoff + sinCoff * sinCoff;
      const constCoff2 = constCoff * constCoff;
      // let nSolution = 0;
      let result;
      if (delta2 > 0.0) {
        const lambda = - constCoff / delta2;
        const a2 = constCoff2 / delta2;
        const D2 = 1.0 - a2;
        if (D2 >= 0.0) {
          const mu = Math.sqrt(D2 / delta2);
          /* c0,s0 = closest approach of line to origin */
          const c0 = lambda * cosCoff;
          const s0 = lambda * sinCoff;
          // nSolution = 2;
          result = [Vector2d.create(c0 - mu * sinCoff, s0 + mu * cosCoff), Vector2d.create(c0 + mu * sinCoff, s0 - mu * cosCoff)];
        }
      }
      return result;
    }
  }

  /** normally,  return the number result of conditionalDivideFraction.
   * but if conditionalDivideFraction fails return specified default number.
   */
  public static safeDivideFraction(numerator: number, denominator: number, defaultResult: number): number {
    const a = Geometry.conditionalDivideFraction(numerator, denominator);
    if (a !== undefined)
      return a;
    return defaultResult;
  }
  /** For a line f(x) whose function values at x0 and x1 are f0 and f1, return the x value at which f(x)=fTarget;
   */
  public static inverseInterpolate(x0: number, f0: number, x1: number, f1: number,
    targetF: number = 0,
    defaultResult?: number): number | undefined {
    const g = Geometry.conditionalDivideFraction(targetF - f0, f1 - f0);
    if (g)
      return Geometry.interpolate(x0, g, x1);
    return defaultResult;
  }
  /** For a line f(x) whose function values at x=0 and x=1 are f0 and f1, return the x value at which f(x)=fTarget;
   */
  public static inverseInterpolate01(f0: number, f1: number, targetF: number = 0): number | undefined {
    return Geometry.conditionalDivideFraction(targetF - f0, f1 - f0);
  }
  /** Return true if json is an array with at least minEntries, and all entries are numbers (including those beyond minEntries) */
  public static isNumberArray(json: any, minEntries: number = 0): boolean {
    if (Array.isArray(json) && json.length >= minEntries) {
      let entry;
      for (entry of json) {
        //        if (!(entry as number) && entry !== 0.0)
        if (!Number.isFinite(entry))
          return false;
      }
      return true;
    }
    return false;
  }
  /** Return true if json is an array of at least numNumberArrays, with at least minEntries in each number array.
   */
  public static isArrayOfNumberArray(json: any, numNumberArray: number, minEntries: number = 0): boolean {
    if (Array.isArray(json) && json.length >= numNumberArray) {
      let entry;
      for (entry of json)
        if (!Geometry.isNumberArray(entry, minEntries)) return false;
      return true;
    }
    return false;
  }

  /** return the number of steps to take so that numSteps * stepSize >= total.
   * minCount is returned for both (a) setSize 0 or less and (b) stepSize > total.
   * A small tolerance is applied for almost
  */
  public static stepCount(stepSize: number, total: number, minCount = 1, maxCount = 101): number {
    if (stepSize <= 0)
      return minCount;
    total = Math.abs(total);
    if (stepSize >= total)
      return minCount;
    const stepCount = Math.floor((total + 0.999999 * stepSize) / stepSize);
    if (stepCount < minCount)
      return minCount;
    if (stepCount > maxCount)
      return maxCount;
    return stepCount;
  }
  /** Test if x is in simple 0..1 interval.  But optionally skip the test.  (this odd behavior is very convenient for code that sometimes does not do the filtering.)
   * @param x value to test.
   * @param apply01 if false, accept all x.
   */
  public static isIn01(x: number, apply01: boolean = true): boolean { return apply01 ? x >= 0.0 && x <= 1.0 : true; }
  /** Test if x is in simple 0..1 interval.  But optionally skip the test.  (this odd behavior is very convenient for code that sometimes does not do the filtering.)
   * @param x value to test.
   * @param apply01 if false, accept all x.
   */
  public static isIn01WithTolerance(x: number, tolerance: number): boolean { return x + tolerance >= 0.0 && x - tolerance <= 1.0; }
  /**
   * restrict x so it is in the interval `[a,b]`, allowing a,b to be in either order.
   * @param x
   * @param a (usually the lower) interval limit
   * @param b (usually the upper) interval limit
   */
  public static restrictToInterval(x: number, a: number, b: number): number {
    if (a <= b) {
      if (x < a) return a;
      if (x > b) return b;
      return x;
    }
    // reversed interval ....
    if (x < b) return b;
    if (x > a) return a;
    return x;
  }
  /**
   * Case-insensitive string comparison.
   * * Return true if the toUpperCase values match.
   */
  public static equalStringNoCase(string1: string, string2: string): boolean {
    return string1.toUpperCase() === string2.toUpperCase();
  }
/** test for EXACT match of number arrays. */
  public static exactEqualNumberArrays(a: number[] | undefined, b: number[] | undefined): boolean {
  if (Array.isArray(a) && a.length === 0)
      a = undefined;
  if (Array.isArray(b) && b.length === 0)
      b = undefined;
  if (a === undefined && b === undefined)
    return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length)
      return false;
    for (let i = 0; i < a.length; i++)
      if (a[i] !== b[i])
        return false;
    return true;
  }
  return false;
}

/** test for  match of XYZ arrays. */
  public static almostEqualArrays<T>(a: T[] | undefined, b: T[] | undefined,
    testFunction: (p: T, q: T) => boolean): boolean{
    if (Array.isArray(a) && a.length === 0)
      a = undefined;
  if (Array.isArray(b) && b.length === 0)
      b = undefined;
  if (a === undefined && b === undefined)
    return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length)
      return false;
    for (let i = 0; i < a.length; i++){
      if (!testFunction (a[i],b[i]))
        return false;
      }
    return true;
    }
  return false;
  }

/** test for  match of typed arrays (e.g. Float64Array). */
public static almostEqualNumberArrays(a: number[] | Float64Array | undefined, b: number[] | Float64Array | undefined,
  testFunction: (p: number, q: number) => boolean): boolean{
  if (Array.isArray(a) && a.length === 0)
    a = undefined;
if (Array.isArray(b) && b.length === 0)
    b = undefined;
if (a === undefined && b === undefined)
  return true;
if (Array.isArray(a) && Array.isArray(b)) {
  if (a.length !== b.length)
    return false;
  for (let i = 0; i < a.length; i++){
    if (!testFunction (a[i],b[i]))
      return false;
    }
  return true;
  }
return false;
}

  /**
   * Return
   * * true if both values are defined and equal (with ===).
   * * false if both defined by not equal
   * * return (option arg) resultIfBothUndefined when both are undefined.
   * * return false if one is defined and the other undefined
   * @param a first value
   * @param b second value
   * @param resultIfBothUndefined return value when both are undefined.
   * @returns
   */
  public static areEqualAllowUndefined<T>(a: T | undefined, b: T | undefined, resultIfBothUndefined: boolean = true): boolean{
    if (a === undefined && b === undefined)
      return resultIfBothUndefined;
    if (a !== undefined && b !== undefined)
      return a === b;
    return false;
  }

  /** clone an array whose members have a clone method.
   * * undefined return from clone is forced into the output array.
  */
  public static cloneMembers<T extends  Cloneable<T>>(a: T[] | undefined): T[] | undefined{
    if (a === undefined)
      return undefined;
    const b: T[] = [];
    for (const p of a) {
      b.push(p.clone()!);
      }
    return b;
    }
}

/**
 * interface for method with a clone operation
 * @public
 */
export interface Cloneable<T> {
  /** required method to return a deep clone. */
  clone (): T | undefined;
}
