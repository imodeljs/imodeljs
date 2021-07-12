/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module CartesianGeometry
 */

import { Geometry } from "../Geometry";
import { Point4d } from "../geometry4d/Point4d";
import { Angle } from "./Angle";
import { Ray3d } from "./Ray3d";
import { HasZ, XAndY, XYAndZ, XYZProps } from "./XYZProps";

/**
 *  * `XYZ` is a minimal object containing x,y,z and operations that are meaningful without change in both point and vector.
 *  * `XYZ` is not instantiable.
 *  * The derived (instantiable) classes are
 *    * `Point3d`
 *    * `Vector3d`
 * @public
 */
export class XYZ implements XYAndZ {
  /** x coordinate */
  public x: number;
  /** y coordinate */
  public y: number;
  /** z coordinate */
  public z: number;
  /**
   * Set the x,y,z  parts.
   * @param x (optional) x part
   * @param y (optional) y part
   * @param z (optional) z part
   */
  public set(x: number = 0, y: number = 0, z: number = 0) { this.x = x; this.y = y; this.z = z; }

  /** Set the x,y,z parts to zero. */
  public setZero() { this.x = 0; this.y = 0; this.z = 0; }
  protected constructor(x: number = 0, y: number = 0, z: number = 0) { this.x = x; this.y = y; this.z = z; }
  /** Type guard for XAndY.
   * @note this will return true for an XYAndZ. If you wish to distinguish between the two, call isXYAndZ first.
   */
  public static isXAndY(arg: any): arg is XAndY { return arg.x !== undefined && arg.y !== undefined; }
  /** Type guard to determine whether an object has a member called "z" */
  public static hasZ(arg: any): arg is HasZ { return arg.z !== undefined; }
  /** Type guard for XYAndZ.  */
  public static isXYAndZ(arg: any): arg is XYAndZ { return this.isXAndY(arg) && this.hasZ(arg); }
  /** Test if arg is any of:
   * * XAndY
   * * XYAndZ
   * * [number,number]
   * * [number,number,number]
   */
  public static isAnyImmediatePointType(arg: any): boolean {
    return Point3d.isXAndY(arg) || Geometry.isNumberArray(arg, 2);
  }
  /** Look for (in order) an x coordinate present as:
   * * arg.x
   * * arg[0]
   */
  public static accessX(arg: any, defaultValue?: number): number | undefined {
    if (arg.x !== undefined)
      return arg.x;
    if (Array.isArray(arg) && arg.length > 0 && Number.isFinite(arg[0]))
      return arg[0];
    return defaultValue;
  }
  /** Look for (in order) an x coordinate present as:
   * * arg.y
   * * arg[1]
   */
  public static accessY(arg: any, defaultValue?: number): number | undefined {
    if (arg.y !== undefined)
      return arg.y;
    if (Array.isArray(arg) && arg.length > 1 && Number.isFinite(arg[1]))
      return arg[1];
    return defaultValue;
  }

  /** Look for (in order) an x coordinate present as:
   * * arg.z
   * * arg[2]
   */
  public static accessZ(arg: any, defaultValue?: number): number | undefined {
    if (arg.z !== undefined)
      return arg.z;
    if (Array.isArray(arg) && arg.length > 2 && Number.isFinite(arg[2]))
      return arg[2];
    return defaultValue;
  }
  /**
   * Set the x,y,z parts from one of these input types
   *
   * * XYZ -- copy the x,y,z parts
   * * Float64Array -- Copy from indices 0,1,2 to x,y,z
   * * XY -- copy the x, y parts and set z=0
   */
  public setFrom(other: Float64Array | XAndY | XYAndZ | undefined) {
    if (other === undefined) {
      this.setZero();
    } else if (XYZ.isXAndY(other)) {
      this.x = other.x;
      this.y = other.y;
      this.z = XYZ.hasZ(other) ? other.z : 0;
    } else {
      this.x = other[0];
      this.y = other[1];
      this.z = other[2];
    }
  }
  /**
   * Set the x,y,z parts from a Point3d.
   * This is the same effect as `setFrom(other)` with no pretesting of variant input type
   * * Set to zeros if `other` is undefined.
   */
  public setFromPoint3d(other?: XYAndZ) {
    if (other) {
      this.x = other.x;
      this.y = other.y;
      this.z = other.z;
    } else {
      this.setZero();
    }
  }
  /**
   * Set the x,y,z parts from a Vector3d
   * This is the same effect as `setFrom(other)` with no pretesting of variant input type
   */
  public setFromVector3d(other: Vector3d) {
    if (other) {
      this.x = other.x;
      this.y = other.y;
      this.z = other.z;
    } else {
      this.setZero();
    }
  }

  /** Returns true if this and other have equal x,y,z parts within Geometry.smallMetricDistance.
   * @param other The other XYAndZ to compare
   * @param tol The tolerance for the comparison. If undefined, use [[Geometry.smallMetricDistance]]
   */
  public isAlmostEqual(other: XYAndZ, tol?: number): boolean {
    return Geometry.isSameCoordinate(this.x, other.x, tol)
      && Geometry.isSameCoordinate(this.y, other.y, tol)
      && Geometry.isSameCoordinate(this.z, other.z, tol);
  }
  /** Return true if this and other have equal x,y,z parts within Geometry.smallMetricDistance. */
  public isAlmostEqualXYZ(x: number, y: number, z: number, tol?: number): boolean {
    return Geometry.isSameCoordinate(this.x, x, tol)
      && Geometry.isSameCoordinate(this.y, y, tol)
      && Geometry.isSameCoordinate(this.z, z, tol);
  }
  /** Return true if this and other have equal x,y parts within Geometry.smallMetricDistance. */
  public isAlmostEqualXY(other: XAndY, tol?: number): boolean {
    return Geometry.isSameCoordinate(this.x, other.x, tol)
      && Geometry.isSameCoordinate(this.y, other.y, tol);
  }
  /** Return a JSON object as array `[x,y,z]` */
  public toJSON(): XYZProps { return this.toArray(); }
  /** Return as an array `[x,y,z]` */
  public toArray(): number[] { return [this.x, this.y, this.z]; }
  /** Return a JSON object as key value pairs `{x: value, y: value, z: value}` */
  public toJSONXYZ(): XYZProps { return { x: this.x, y: this.y, z: this.z }; }
  /** Pack the x,y,z values in a Float64Array. */
  public toFloat64Array(): Float64Array { return Float64Array.of(this.x, this.y, this.z); }
  /**
   * Set the x,y,z properties from one of several json forms:
   *
   * *  array of numbers: [x,y,z]
   * *  object with x,y, and (optional) z as numeric properties {x: xValue, y: yValue, z: zValue}
   */
  public setFromJSON(json?: XYZProps): void {
    if (Array.isArray(json)) {
      this.set(json[0] || 0, json[1] || 0, json[2] || 0);
      return;
    }
    if (json) {
      this.set(json.x || 0, json.y || 0, json.z || 0);
      return;
    }
    this.set(0, 0, 0);
  }
  /** Return the distance from this point to other */
  public distance(other: XYAndZ): number {
    const xDist = other.x - this.x;
    const yDist = other.y - this.y;
    const zDist = other.z - this.z;
    return (Math.sqrt(xDist * xDist + yDist * yDist + zDist * zDist));
  }
  /** Return squared distance from this point to other */
  public distanceSquared(other: XYAndZ): number {
    const xDist = other.x - this.x;
    const yDist = other.y - this.y;
    const zDist = other.z - this.z;
    return (xDist * xDist + yDist * yDist + zDist * zDist);
  }
  /** Return the XY distance from this point to other */
  public distanceXY(other: XAndY): number {
    const xDist = other.x - this.x;
    const yDist = other.y - this.y;
    return (Math.sqrt(xDist * xDist + yDist * yDist));
  }
  /** Return squared XY distance from this point to other */
  public distanceSquaredXY(other: XAndY): number {
    const xDist = other.x - this.x;
    const yDist = other.y - this.y;
    return (xDist * xDist + yDist * yDist);
  }
  /** Return the largest absolute distance between corresponding components */
  public maxDiff(other: XYAndZ): number {
    return Math.max(Math.abs(this.x - other.x), Math.abs(this.y - other.y), Math.abs(this.z - other.z));
  }
  /**
   * Return the x,y, z component corresponding to 0,1,2.
   */
  public at(index: number): number {
    if (index < 0.5)
      return this.x;
    if (index > 1.5)
      return this.z;
    return this.y;
  }
  /**
   * Return the x,y, z component corresponding to 0,1,2.
   */
  public setAt(index: number, value: number): void {
    if (index < 0.5)
      this.x = value;
    if (index > 1.5)
      this.z = value;
    else
      this.y = value;
  }
  /** Return the index (0,1,2) of the x,y,z component with largest absolute value */
  public indexOfMaxAbs(): number {
    let index = 0;
    let a = Math.abs(this.x);
    let b = Math.abs(this.y);
    if (b > a) {
      index = 1;
      a = b;
    }
    b = Math.abs(this.z);
    if (b > a) {
      index = 2;
    }
    return index;
  }
  /** Return true if the if x,y,z components are all nearly zero to tolerance Geometry.smallMetricDistance */
  public get isAlmostZero(): boolean {
    return Geometry.isSmallMetricDistance(this.x) && Geometry.isSmallMetricDistance(this.y) && Geometry.isSmallMetricDistance(this.z);
  }
  /** Return the largest absolute value of any component */
  public maxAbs(): number { return Math.max(Math.abs(this.x), Math.abs(this.y), Math.abs(this.z)); }
  /** Return the sqrt of the sum of squared x,y,z parts */
  public magnitude(): number { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  /** Return the sum of squared x,y,z parts */
  public magnitudeSquared(): number { return this.x * this.x + this.y * this.y + this.z * this.z; }
  /** Return sqrt of the sum of squared x,y parts */
  public magnitudeXY(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
  /** Return the sum of squared x,y parts */
  public magnitudeSquaredXY(): number { return this.x * this.x + this.y * this.y; }
  /** exact equality test. */
  public isExactEqual(other: XYAndZ): boolean { return this.x === other.x && this.y === other.y && this.z === other.z; }
  /** equality test with Geometry.smallMetricDistance tolerance */
  public isAlmostEqualMetric(other: XYAndZ): boolean { return this.maxDiff(other) <= Geometry.smallMetricDistance; }
  /** add x,y,z from other in place. */
  public addInPlace(other: XYAndZ): void { this.x += other.x; this.y += other.y; this.z += other.z; }
  /** add x,y,z from other in place. */
  public subtractInPlace(other: XYAndZ): void { this.x -= other.x; this.y -= other.y; this.z -= other.z; }
  /** add (in place) the scaled x,y,z of other */
  public addScaledInPlace(other: XYAndZ, scale: number): void {
    this.x += scale * other.x;
    this.y += scale * other.y;
    this.z += scale * other.z;
  }
  /** Multiply the x, y, z parts by scale. */
  public scaleInPlace(scale: number) { this.x *= scale; this.y *= scale; this.z *= scale; }
  /** add to x, y, z parts */
  public addXYZInPlace(dx: number = 0.0, dy: number = 0.0, dz: number = 0.0) { this.x += dx; this.y += dy; this.z += dz; }
  /** Clone strongly typed as Point3d */
  public cloneAsPoint3d() { return Point3d.create(this.x, this.y, this.z); }
  /** Return a (full length) vector from this point to other */
  public vectorTo(other: XYAndZ, result?: Vector3d): Vector3d {
    return Vector3d.create(other.x - this.x, other.y - this.y, other.z - this.z, result);
  }
  /** Return a multiple of a the (full length) vector from this point to other */
  public scaledVectorTo(other: XYAndZ, scale: number, result?: Vector3d): Vector3d {
    return Vector3d.create(scale * (other.x - this.x), scale * (other.y - this.y), scale * (other.z - this.z), result);
  }
  /** Return a unit vector from this vector to other. Return a 000 vector if the input is too small to normalize.
   * @param other target of created vector.
   * @param result optional result vector.
   */
  public unitVectorTo(target: XYAndZ, result?: Vector3d): Vector3d | undefined { return this.vectorTo(target, result).normalize(result); }
  /** Freeze this XYZ */
  public freeze(): Readonly<this> { return Object.freeze(this); }

  /** access x part of XYZProps (which may be .x or [0]) */
  public static x(xyz: XYZProps | undefined, defaultValue: number = 0): number{
    if (xyz === undefined)
      return defaultValue;
    if (Array.isArray(xyz))
      return xyz[0];
    if (xyz.x !== undefined)
      return xyz.x;
    return defaultValue;
  }
  /** access x part of XYZProps (which may be .x or [0]) */
  public static y(xyz: XYZProps | undefined, defaultValue: number = 0): number{
    if (xyz === undefined)
      return defaultValue;
    if (Array.isArray(xyz))
      return xyz[1];
    if (xyz.y !== undefined)
      return xyz.y;
    return defaultValue;
  }
  /** access x part of XYZProps (which may be .x or [0]) */
  public static z(xyz: XYZProps | undefined, defaultValue: number = 0): number{
    if (xyz === undefined)
      return defaultValue;
    if (Array.isArray(xyz))
      return xyz[2];
    if (xyz.z !== undefined)
      return xyz.z;
    return defaultValue;
  }

}
/** 3D point with `x`,`y`,`z` as properties
 * @public
 */
export class Point3d extends XYZ {
  /** Constructor for Point3d */
  constructor(x: number = 0, y: number = 0, z: number = 0) { super(x, y, z); }
  /**
   * Convert json to Point3d.  Accepted forms are:
   * * `[1,2,3]` --- array of numbers
   * *  array of numbers: [x,y,z]
   * *  object with x,y, and (optional) z as numeric properties {x: xValue, y: yValue, z: zValue}
   * @param json json value.
   */
  public static fromJSON(json?: XYZProps): Point3d { const val = new Point3d(); val.setFromJSON(json); return val; }
  /** Return a new Point3d with the same coordinates */
  public clone(result?: Point3d): Point3d { return Point3d.create(this.x, this.y, this.z, result); }
  /** Create a new Point3d with given coordinates
   * @param x x part
   * @param y y part
   * @param z z part
   */
  public static create(x: number = 0, y: number = 0, z: number = 0, result?: Point3d): Point3d {
    if (result) {
      result.x = x;
      result.y = y;
      result.z = z;
      return result;
    }
    return new Point3d(x, y, z);
  }
  /** Copy contents from another Point3d, Point2d, Vector2d, or Vector3d */
  public static createFrom(data: XYAndZ | XAndY | Float64Array, result?: Point3d): Point3d {
    if (data instanceof Float64Array) {
      let x = 0;
      let y = 0;
      let z = 0;
      if (data.length > 0)
        x = data[0];
      if (data.length > 1)
        y = data[1];
      if (data.length > 2)
        z = data[2];
      return Point3d.create(x, y, z, result);
    }
    return Point3d.create(data.x, data.y, XYZ.hasZ(data) ? data.z : 0, result);
  }
  /**
   * Copy x,y,z from
   * @param xyzData flat array of xyzxyz for multiple points
   * @param pointIndex index of point to extract.   This index is multiplied by 3 to obtain starting index in the array.
   * @param result optional result point.
   */
  public static createFromPacked(xyzData: Float64Array, pointIndex: number, result?: Point3d): Point3d | undefined {
    const indexX = pointIndex * 3;
    if (indexX >= 0 && indexX + 2 < xyzData.length)
      return Point3d.create(xyzData[indexX], xyzData[indexX + 1], xyzData[indexX + 2], result);
    return undefined;
  }
  /**
   * Copy and unweight xyzw.
   * @param xyzData flat array of x,y,z,w,x,y,z,w for multiple points
   * @param pointIndex index of point to extract.   This index is multiplied by 4 to obtain starting index in the array.
   * @param result optional result point.
   */
  public static createFromPackedXYZW(xyzData: Float64Array, pointIndex: number, result?: Point3d): Point3d | undefined {
    const indexX = pointIndex * 4;
    if (indexX >= 0 && indexX + 3 < xyzData.length) {
      const w = xyzData[indexX + 3];
      if (!Geometry.isSmallMetricDistance(w)) {
        const divW = 1.0 / w;
        return Point3d.create(divW * xyzData[indexX], divW * xyzData[indexX + 1], divW * xyzData[indexX + 2], result);
      }
    }
    return undefined;
  }
/**
 * Return an array of points constructed from groups of 3 entries in a Float64Array.
 * Any incomplete group at the tail of the array is ignored.
 */
  public static createArrayFromPackedXYZ(data: Float64Array): Point3d[]{
    const result = [];
    for (let i = 0; i + 2 < data.length; i += 3)
      result.push(new Point3d(data[i], data[i + 1], data[i + 2]));
    return result;
  }
  /** Create a new point with 000 xyz */
  public static createZero(result?: Point3d): Point3d { return Point3d.create(0, 0, 0, result); }
  /** Return the cross product of the vectors from this to pointA and pointB
   *
   * *  the result is a vector
   * *  the result is perpendicular to both vectors, with right hand orientation
   * *  the magnitude of the vector is twice the area of the triangle.
   */
  public crossProductToPoints(pointA: Point3d, pointB: Point3d, result?: Vector3d): Vector3d {
    return Vector3d.createCrossProduct(pointA.x - this.x, pointA.y - this.y, pointA.z - this.z, pointB.x - this.x, pointB.y - this.y, pointB.z - this.z, result);
  }
  /** Return the magnitude of the cross product of the vectors from this to pointA and pointB
   */
  public crossProductToPointsMagnitude(pointA: Point3d, pointB: Point3d): number {
    return Geometry.crossProductMagnitude(pointA.x - this.x, pointA.y - this.y, pointA.z - this.z, pointB.x - this.x, pointB.y - this.y, pointB.z - this.z);
  }

  /** Return the triple product of the vectors from this to pointA, pointB, pointC
   *
   * * This is a scalar (number)
   * *  This is 6 times the (signed) volume of the tetrahedron on the 4 points.
   */
  public tripleProductToPoints(pointA: Point3d, pointB: Point3d, pointC: Point3d): number {
    return Geometry.tripleProduct(pointA.x - this.x, pointA.y - this.y, pointA.z - this.z, pointB.x - this.x, pointB.y - this.y, pointB.z - this.z, pointC.x - this.x, pointC.y - this.y, pointC.z - this.z);
  }
  /** Return the cross product of the vectors from this to pointA and pointB
   *
   * *  the result is a scalar
   * *  the magnitude of the vector is twice the signed area of the triangle.
   * *  this is positive for counter-clockwise order of the points, negative for clockwise.
   */
  public crossProductToPointsXY(pointA: Point3d, pointB: Point3d): number {
    return Geometry.crossProductXYXY(pointA.x - this.x, pointA.y - this.y, pointB.x - this.x, pointB.y - this.y);
  }
  /** Return a point interpolated between this point and the right param. */
  public interpolate(fraction: number, other: XYAndZ, result?: Point3d): Point3d {
    if (fraction <= 0.5)
      return Point3d.create(this.x + fraction * (other.x - this.x), this.y + fraction * (other.y - this.y), this.z + fraction * (other.z - this.z), result);
    const t: number = fraction - 1.0;
    return Point3d.create(other.x + t * (other.x - this.x), other.y + t * (other.y - this.y), other.z + t * (other.z - this.z), result);
  }
  /**
   * Return a ray whose ray.origin is interpolated, and ray.direction is the vector between points with a
   * scale factor applied.
   * @param fraction fractional position between points.
   * @param other endpoint of interpolation
   * @param tangentScale scale factor to apply to the startToEnd vector
   * @param result  optional receiver.
   */
  public interpolatePointAndTangent(fraction: number, other: Point3d, tangentScale: number, result?: Ray3d): Ray3d {
    result = result ? result : Ray3d.createZero();
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    const dz = other.z - this.z;
    result.direction.set(tangentScale * dx, tangentScale * dy, tangentScale * dz);
    if (fraction <= 0.5)
      result.origin.set(this.x + fraction * dx, this.y + fraction * dy, this.z + fraction * dz);
    else {
      const t: number = fraction - 1.0;
      result.origin.set(other.x + t * dx, other.y + t * dy, other.z + t * dz);
    }
    return result;
  }
  /** Return a point with independent x,y,z fractional interpolation. */
  public interpolateXYZ(fractionX: number, fractionY: number, fractionZ: number, other: Point3d, result?: Point3d): Point3d {
    return Point3d.create(Geometry.interpolate(this.x, fractionX, other.x), Geometry.interpolate(this.y, fractionY, other.y), Geometry.interpolate(this.z, fractionZ, other.z), result);
  }
  /** Interpolate between points, then add a shift in the xy plane by a fraction of the XY projection perpendicular. */
  public interpolatePerpendicularXY(fraction: number, pointB: Point3d, fractionXYPerp: number, result?: Point3d): Point3d {
    result = result ? result : new Point3d();
    const vector = pointB.minus(this);
    this.interpolate(fraction, pointB, result);
    result.x -= fractionXYPerp * vector.y;
    result.y += fractionXYPerp * vector.x;
    return result;
  }
  /** Return point minus vector */
  public minus(vector: XYAndZ, result?: Point3d): Point3d {
    return Point3d.create(this.x - vector.x, this.y - vector.y, this.z - vector.z, result);
  }
  /** Return point plus vector */
  public plus(vector: XYAndZ, result?: Point3d): Point3d {
    return Point3d.create(this.x + vector.x, this.y + vector.y, this.z + vector.z, result);
  }
  /** Return point plus vector */
  public plusXYZ(dx: number = 0, dy: number = 0, dz: number = 0, result?: Point3d): Point3d {
    return Point3d.create(this.x + dx, this.y + dy, this.z + dz, result);
  }
  /** Return point + vector * scalar */
  public plusScaled(vector: XYAndZ, scaleFactor: number, result?: Point3d): Point3d {
    return Point3d.create(this.x + vector.x * scaleFactor, this.y + vector.y * scaleFactor, this.z + vector.z * scaleFactor, result);
  }
  /** Return point + vectorA * scalarA + vectorB * scalarB */
  public plus2Scaled(vectorA: XYAndZ, scalarA: number, vectorB: XYZ, scalarB: number, result?: Point3d): Point3d {
    return Point3d.create(this.x + vectorA.x * scalarA + vectorB.x * scalarB, this.y + vectorA.y * scalarA + vectorB.y * scalarB, this.z + vectorA.z * scalarA + vectorB.z * scalarB, result);
  }
  /** Return point + vectorA * scalarA + vectorB * scalarB + vectorC * scalarC */
  public plus3Scaled(vectorA: XYAndZ, scalarA: number, vectorB: XYAndZ, scalarB: number, vectorC: XYAndZ, scalarC: number, result?: Point3d): Point3d {
    return Point3d.create(
      this.x + vectorA.x * scalarA + vectorB.x * scalarB + vectorC.x * scalarC,
      this.y + vectorA.y * scalarA + vectorB.y * scalarB + vectorC.y * scalarC,
      this.z + vectorA.z * scalarA + vectorB.z * scalarB + vectorC.z * scalarC, result);
  }
  /**
   * Return a point that is scaled from the source point.
   * @param source existing point
   * @param scale scale factor to apply to its x,y,z parts
   * @param result optional point to receive coordinates
   */
  public static createScale(source: XYAndZ, scale: number, result?: Point3d): Point3d {
    return Point3d.create(source.x * scale, source.y * scale, source.z * scale, result);
  }
  /** create a point that is a linear combination (weighted sum) of 2 input points.
   * @param pointA first input point
   * @param scaleA scale factor for pointA
   * @param pointB second input point
   * @param scaleB scale factor for pointB
   */
  public static createAdd2Scaled(pointA: XYAndZ, scaleA: number, pointB: XYAndZ, scaleB: number, result?: Point3d): Point3d {
    return Point3d.create(pointA.x * scaleA + pointB.x * scaleB, pointA.y * scaleA + pointB.y * scaleB, pointA.z * scaleA + pointB.z * scaleB, result);
  }
  /** Create a point that is a linear combination (weighted sum) of 3 input points.
   * @param pointA first input point
   * @param scaleA scale factor for pointA
   * @param pointB second input point
   * @param scaleB scale factor for pointB
   * @param pointC third input point.
   * @param scaleC scale factor for pointC
   */
  public static createAdd3Scaled(pointA: XYAndZ, scaleA: number, pointB: XYAndZ, scaleB: number, pointC: XYAndZ, scaleC: number, result?: Point3d): Point3d {
    return Point3d.create(pointA.x * scaleA + pointB.x * scaleB + pointC.x * scaleC, pointA.y * scaleA + pointB.y * scaleB + pointC.y * scaleC, pointA.z * scaleA + pointB.z * scaleB + pointC.z * scaleC, result);
  }
  /**
   * Return the dot product of vectors from this to pointA and this to pointB.
   * @param targetA target point for first vector
   * @param targetB target point for second vector
   */
  public dotVectorsToTargets(targetA: Point3d, targetB: Point3d): number {
    return (targetA.x - this.x) * (targetB.x - this.x) +
      (targetA.y - this.y) * (targetB.y - this.y) +
      (targetA.z - this.z) * (targetB.z - this.z);
  }
  /** Return the fractional projection of this onto a line between points.
   *
   */
  public fractionOfProjectionToLine(startPoint: Point3d, endPoint: Point3d, defaultFraction: number = 0): number {
    const denominator = startPoint.distanceSquared(endPoint);
    if (denominator < Geometry.smallMetricDistanceSquared)
      return defaultFraction;
    return startPoint.dotVectorsToTargets(endPoint, this) / denominator;
  }
}
/** 3D vector with `x`,`y`,`z` as properties
 * @public
 */
export class Vector3d extends XYZ {
  constructor(x: number = 0, y: number = 0, z: number = 0) { super(x, y, z); }
/**
 * Return an array of vectors constructed from groups of 3 entries in a Float64Array.
 * Any incomplete group at the tail of the array is ignored.
 */
 public static createArrayFromPackedXYZ(data: Float64Array): Vector3d[]{
  const result = [];
  for (let i = 0; i + 2 < data.length; i += 3)
    result.push(new Vector3d(data[i], data[i + 1], data[i + 2]));
  return result;
}

  /**
   * Copy xyz from this instance to a new (or optionally reused) Vector3d
   * @param result optional instance to reuse.
   */
  public clone(result?: Vector3d): Vector3d { return Vector3d.create(this.x, this.y, this.z, result); }
  /**
   * return a Vector3d (new or reused from optional result)
   * @param x x component
   * @param y y component
   * @param z z component
   * @param result optional instance to reuse
   */
  public static create(x: number = 0, y: number = 0, z: number = 0, result?: Vector3d): Vector3d {
    if (result) {
      result.x = x;
      result.y = y;
      result.z = z;
      return result;
    }
    return new Vector3d(x, y, z);
  }
  /**
   * Create a vector which is cross product of two vectors supplied as separate arguments
   * @param ux x coordinate of vector u
   * @param uy y coordinate of vector u
   * @param uz z coordinate of vector u
   * @param vx x coordinate of vector v
   * @param vy y coordinate of vector v
   * @param vz z coordinate of vector v
   * @param result optional result vector.
   */
  public static createCrossProduct(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, result?: Vector3d): Vector3d {
    return Vector3d.create(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx, result);
  }
  /**
   * Accumulate a vector which is cross product vectors from origin (ax,ay,az) to targets (bx,by,bz) and (cx,cy,cz)
   * @param ax x coordinate of origin
   * @param ay y coordinate of origin
   * @param az z coordinate of origin
   * @param bx x coordinate of target point b
   * @param by y coordinate of target point b
   * @param bz z coordinate of target point b
   * @param cx x coordinate of target point c
   * @param cy y coordinate of target point c
   * @param cz z coordinate of target point c
   */
  public addCrossProductToTargetsInPlace(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    this.x += uy * vz - uz * vy;
    this.y += uz * vx - ux * vz;
    this.z += ux * vy - uy * vx;
  }
  /**
   * Return the cross product of the vectors from origin to pointA and pointB.
   *
   * * the result is a vector
   * * the result is perpendicular to both vectors, with right hand orientation
   * * the magnitude of the vector is twice the area of the triangle.
   */
  public static createCrossProductToPoints(origin: XYAndZ, pointA: XYAndZ, pointB: XYAndZ, result?: Vector3d): Vector3d {
    return Vector3d.createCrossProduct(pointA.x - origin.x, pointA.y - origin.y, pointA.z - origin.z, pointB.x - origin.x, pointB.y - origin.y, pointB.z - origin.z, result);
  }
  /**
   * Return a vector defined by polar coordinates distance and angle from x axis
   * @param r distance measured from origin
   * @param theta angle from x axis to the vector (in xy plane)
   * @param z optional z coordinate
   */
  public static createPolar(r: number, theta: Angle, z?: number): Vector3d {
    return Vector3d.create(r * theta.cos(), r * theta.sin(), z);
  }

  /**
   * Return a vector defined in spherical coordinates.
   * @param r sphere radius
   * @param theta angle in xy plane
   * @param phi angle from xy plane to the vector
   */
  public static createSpherical(r: number, theta: Angle, phi: Angle): Vector3d {
    const cosPhi = phi.cos();
    return Vector3d.create(cosPhi * r * theta.cos(), cosPhi * r * theta.sin(), r * phi.sin());
  }
  /**
   * Convert json to Vector3d.  Accepted forms are:
   * * `[1,2,3]` --- array of numbers
   * *  array of numbers: [x,y,z]
   * *  object with x,y, and (optional) z as numeric properties {x: xValue, y: yValue, z: zValue}
   * @param json json value.
   */

  public static fromJSON(json?: XYZProps): Vector3d { const val = new Vector3d(); val.setFromJSON(json); return val; }
  /** Copy contents from another Point3d, Point2d, Vector2d, or Vector3d */
  public static createFrom(data: XYAndZ | XAndY | Float64Array | number[], result?: Vector3d): Vector3d {
    if (data instanceof Float64Array) {
      let x = 0;
      let y = 0;
      let z = 0;
      if (data.length > 0)
        x = data[0];
      if (data.length > 1)
        y = data[1];
      if (data.length > 2)
        z = data[2];
      return Vector3d.create(x, y, z, result);
    } else if (Array.isArray(data)) {
      return Vector3d.create(data[0], data[1], data.length > 2 ? data[2] : 0);
    }
    return Vector3d.create(data.x, data.y, XYZ.hasZ(data) ? data.z : 0.0, result);
  }
  /**
   * Return a vector defined by start and end points (end - start).
   * @param start start point for vector
   * @param end end point for vector
   * @param result optional result
   */
  public static createStartEnd(start: XYAndZ, end: XYAndZ, result?: Vector3d): Vector3d {
    if (result) {
      result.set(end.x - start.x, end.y - start.y, end.z - start.z);
      return result;
    }
    return new Vector3d(end.x - start.x, end.y - start.y, end.z - start.z);
  }
  /**
   * Return a vector (optionally in preallocated result, otherwise newly created) from [x0,y0,z0] to [x1,y1,z1]
   * @param x0 start point x coordinate
   * @param y0 start point y coordinate
   * @param z0 start point z coordinate
   * @param x1 end point x coordinate
   * @param y1 end point y coordinate
   * @param z1 end point z coordinate
   * @param result optional result vector
   */
  public static createStartEndXYZXYZ(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, result?: Vector3d): Vector3d {
    return this.create(x1 - x0, y1 - y0, z1 - z0, result);
  }
  /**
   * Return a vector which is the input vector rotated around the axis vector.
   * @param vector initial vector
   * @param axis axis of rotation
   * @param angle angle of rotation.  If undefined, 90 degrees is implied
   * @param result optional result vector
   * @returns undefined if axis has no length.
   */
  public static createRotateVectorAroundVector(vector: Vector3d, axis: Vector3d, angle?: Angle): Vector3d | undefined {
    // Rodriguez formula, https://en.wikipedia.org/wiki/Rodrigues'_rotation_formula
    const unitAxis = axis.normalize();
    if (unitAxis) {
      const xProduct = unitAxis.crossProduct(vector);
      let c, s;
      if (angle) {
        c = angle.cos();
        s = angle.sin();
      } else {
        c = 0.0;
        s = 1.0;
      }
      return Vector3d.createAdd3Scaled(vector, c, xProduct, s, unitAxis, unitAxis.dotProduct(vector) * (1.0 - c));
    }
    return undefined;
  }
  /**
   * Set (replace) xzz components so they are a vector from point0 to point1
   * @param point0 start point of computed vector
   * @param point1 end point of computed vector.
   */
  public setStartEnd(point0: XYAndZ, point1: XYAndZ) {
    this.x = point1.x - point0.x;
    this.y = point1.y - point0.y;
    this.z = point1.z - point0.z;
  }
  /** Return a vector with 000 xyz parts. */
  public static createZero(result?: Vector3d): Vector3d { return Vector3d.create(0, 0, 0, result); }
  /** Return a unit X vector optionally multiplied by a scale  */
  public static unitX(scale: number = 1): Vector3d { return new Vector3d(scale, 0, 0); }
  /** Return a unit Y vector  */
  public static unitY(scale: number = 1): Vector3d { return new Vector3d(0, scale, 0); }
  /** Return a unit Z vector  */
  public static unitZ(scale: number = 1): Vector3d { return new Vector3d(0, 0, scale); }
  /** Divide by denominator, but return undefined if denominator is zero. */
  public safeDivideOrNull(denominator: number, result?: Vector3d): Vector3d | undefined {
    if (denominator !== 0.0) {
      return this.scale(1.0 / denominator, result);
    }
    return undefined;
  }
  /**
   * Return a pair object containing (a) property `v` which is a unit vector in the direction
   * of the input and (b) property mag which is the magnitude (length) of the input (instance) prior to normalization.
   * If the instance (input) is a near zero length the `v` property of the output is undefined.
   * @param result optional result.
   */
  public normalizeWithLength(result?: Vector3d): {
    v: Vector3d | undefined;
    mag: number;
  } {
    const magnitude = Geometry.correctSmallMetricDistance(this.magnitude());
    result = result ? result : new Vector3d();
    return { v: this.safeDivideOrNull(magnitude, result), mag: magnitude };
  }
  /**
   * Return a unit vector parallel with this.  Return undefined if this.magnitude is near zero.
   * @param result optional result.
   */
  public normalize(result?: Vector3d): Vector3d | undefined { return this.normalizeWithLength(result).v; }
  /**
   * If this vector has nonzero length, divide by the length to change to a unit vector.
   * @returns true if normalization completed.
   */
  public normalizeInPlace(): boolean {
    const a = Geometry.inverseMetricDistance(this.magnitude());
    if (a === undefined)
      return false;
    this.x *= a;
    this.y *= a;
    this.z *= a;
    return true;
  }
  /** Return the fractional projection of spaceVector onto this */
  public fractionOfProjectionToVector(target: Vector3d, defaultFraction: number = 0): number {
    const numerator = this.dotProduct(target);
    const denominator = target.magnitudeSquared();
    if (denominator < Geometry.smallMetricDistanceSquared)
      return defaultFraction;
    return numerator / denominator;
  }
  /** Return a new vector with components negated from the calling instance.
   * @param result optional result vector.
   */
  public negate(result?: Vector3d): Vector3d {
    result = result ? result : new Vector3d();
    result.x = -this.x;
    result.y = -this.y;
    result.z = -this.z;
    return result;
  }
  /** Return a vector same length as this but rotate 90 degrees CCW */
  public rotate90CCWXY(result?: Vector3d): Vector3d {
    result = result ? result : new Vector3d();
    // save x,y to allow aliasing ..
    const xx: number = this.x;
    const yy: number = this.y;
    result.x = -yy;
    result.y = xx;
    result.z = this.z;
    return result;
  }
  /**
   * Return a vector which is in the xy plane, perpendicular ot the xy part of this vector, and of unit length.
   * * If the xy part is 00, the return is the rotated (but not normalized) xy parts of this vector.
   * @param result optional preallocated result.
   */
  public unitPerpendicularXY(result?: Vector3d): Vector3d {
    result = result ? result : new Vector3d();
    const xx: number = this.x;
    const yy: number = this.y;
    result.x = -yy;
    result.y = xx;
    result.z = 0.0;
    const d2: number = xx * xx + yy * yy;
    if (d2 !== 0.0) {
      const a = 1.0 / Math.sqrt(d2);
      result.x *= a;
      result.y *= a;
    }
    return result;
  }
  /**
   * Rotate the xy parts of this vector around the z axis.
   * * z is taken unchanged to the result.
   * @param angle angle to rotate
   * @param result optional preallocated result
   */
  public rotateXY(angle: Angle, result?: Vector3d): Vector3d {
    const s = angle.sin();
    const c = angle.cos();
    const xx: number = this.x;
    const yy: number = this.y;
    result = result ? result : new Vector3d();
    result.x = xx * c - yy * s;
    result.y = xx * s + yy * c;
    result.z = this.z;
    return result;
  }
  /**
   * Return a (new or optionally preallocated) vector that is rotated 90 degrees in the plane of this vector and the target vector.
   * @param target Second vector which defines the plane of rotation.
   * @param result optional preallocated vector for result.
   * @returns rotated vector, or undefined if the cross product of this and the the target cannot be normalized (i.e. if the target and this are colinear)
   */
  public rotate90Towards(target: Vector3d, result?: Vector3d): Vector3d | undefined {
    const normal = this.crossProduct(target).normalize();
    return normal ? normal.crossProduct(this, result) : undefined;
  }
  /** Rotate this vector 90 degrees around an axis vector.
   * @returns the (new or optionally reused result) rotated vector, or undefined if the axis vector cannot be normalized.
   */
  public rotate90Around(axis: Vector3d, result?: Vector3d): Vector3d | undefined {
    const unitNormal = axis.normalize();
    return unitNormal ? unitNormal.crossProduct(this).plusScaled(unitNormal, unitNormal.dotProduct(this), result) : undefined;
  }
  /**
   * Return a vector computed at fractional position between this vector and vectorB
   * @param fraction fractional position.  0 is at `this`.  1 is at `vectorB`.  True fractions are "between", negatives are "before this", beyond 1 is "beyond vectorB".
   * @param vectorB second vector
   * @param result optional preallocated result.
   */
  public interpolate(fraction: number, vectorB: XYAndZ, result?: Vector3d): Vector3d {
    result = result ? result : new Vector3d();
    if (fraction <= 0.5) {
      result.x = this.x + fraction * (vectorB.x - this.x);
      result.y = this.y + fraction * (vectorB.y - this.y);
      result.z = this.z + fraction * (vectorB.z - this.z);
    } else {
      const t: number = fraction - 1.0;
      result.x = vectorB.x + t * (vectorB.x - this.x);
      result.y = vectorB.y + t * (vectorB.y - this.y);
      result.z = vectorB.z + t * (vectorB.z - this.z);
    }
    return result;
  }
  /**
   * Return the vector sum `this - vector`
   * @param vector right side of addition.
   * @param result optional preallocated result.
   */
  public plus(vector: XYAndZ, result?: Vector3d): Vector3d {
    result = result ? result : new Vector3d();
    result.x = this.x + vector.x;
    result.y = this.y + vector.y;
    result.z = this.z + vector.z;
    return result;
  }
  /**
   * Return the vector difference `this - vector`
   * @param vector right side of subtraction.
   * @param result optional preallocated result.
   */
  public minus(vector: XYAndZ, result?: Vector3d): Vector3d {
    result = result ? result : new Vector3d();
    result.x = this.x - vector.x;
    result.y = this.y - vector.y;
    result.z = this.z - vector.z;
    return result;
  }
  /** Return vector + vector * scalar */
  public plusScaled(vector: XYAndZ, scaleFactor: number, result?: Vector3d): Vector3d {
    result = result ? result : new Vector3d();
    result.x = this.x + vector.x * scaleFactor;
    result.y = this.y + vector.y * scaleFactor;
    result.z = this.z + vector.z * scaleFactor;
    return result;
  }

  /** Return the (strongly typed Vector3d) `this Vector3d + vectorA * scalarA + vectorB * scalarB` */
  public plus2Scaled(vectorA: XYAndZ, scalarA: number, vectorB: XYAndZ, scalarB: number, result?: Vector3d): Vector3d {
    result = result ? result : new Vector3d();
    result.x = this.x + vectorA.x * scalarA + vectorB.x * scalarB;
    result.y = this.y + vectorA.y * scalarA + vectorB.y * scalarB;
    result.z = this.z + vectorA.z * scalarA + vectorB.z * scalarB;
    return result;
  }

  /** Return the (strongly typed Vector3d) `thisVector3d + vectorA * scalarA + vectorB * scalarB + vectorC * scalarC` */
  public plus3Scaled(vectorA: XYAndZ, scalarA: number, vectorB: XYAndZ, scalarB: number, vectorC: XYAndZ, scalarC: number, result?: Vector3d): Vector3d {
    result = result ? result : new Vector3d();
    result.x = this.x + vectorA.x * scalarA + vectorB.x * scalarB + vectorC.x * scalarC;
    result.y = this.y + vectorA.y * scalarA + vectorB.y * scalarB + vectorC.y * scalarC;
    result.z = this.z + vectorA.z * scalarA + vectorB.z * scalarB + vectorC.z * scalarC;
    return result;
  }
  /** Return the (strongly typed Vector3d) `thisVector3d + vectorA * scalarA + vectorB * scalarB` */
  public static createAdd2Scaled(vectorA: XYAndZ, scaleA: number, vectorB: XYAndZ, scaleB: number, result?: Vector3d): Vector3d {
    return Vector3d.create(vectorA.x * scaleA + vectorB.x * scaleB, vectorA.y * scaleA + vectorB.y * scaleB, vectorA.z * scaleA + vectorB.z * scaleB, result);
  }
  /** Return the (strongly typed Vector3d) `thisVector3d + vectorA * scalarA + vectorB * scalarB` with all components presented as numbers */
  public static createAdd2ScaledXYZ(ax: number, ay: number, az: number, scaleA: number, bx: number, by: number, bz: number, scaleB: number, result?: Vector3d): Vector3d {
    return Vector3d.create(ax * scaleA + bx * scaleB, ay * scaleA + by * scaleB, az * scaleA + bz * scaleB, result);
  }
  /** Return the (strongly typed Vector3d) `thisVector3d + vectorA * scaleA + vectorB * scaleB + vectorC * scaleC` */
  public static createAdd3Scaled(vectorA: XYAndZ, scaleA: number, vectorB: XYAndZ, scaleB: number, vectorC: XYAndZ, scaleC: number, result?: Vector3d): Vector3d {
    return Vector3d.create(vectorA.x * scaleA + vectorB.x * scaleB + vectorC.x * scaleC, vectorA.y * scaleA + vectorB.y * scaleB + vectorC.y * scaleC, vectorA.z * scaleA + vectorB.z * scaleB + vectorC.z * scaleC, result);
  }
  /** Return vector * scalar */
  public scale(scale: number, result?: Vector3d): Vector3d {
    result = result ? result : new Vector3d();
    result.x = this.x * scale;
    result.y = this.y * scale;
    result.z = this.z * scale;
    return result;
  }
  /**
   * Return a (optionally new or reused) vector in the direction of `this` but with specified length.
   * @param length desired length of vector
   * @param result optional preallocated result
   */
  public scaleToLength(length: number, result?: Vector3d): Vector3d | undefined {
    const mag = Geometry.correctSmallMetricDistance(this.magnitude());
    if (mag === 0)
      return undefined;
    return this.scale(length / mag, result);
  }
  /** Compute the cross product of this vector with `vectorB`.   Immediately pass it to `normalize`.
   * @param vectorB second vector for cross product.
   * @returns see `Vector3d` method `normalize()` for error condition.
   */
  public unitCrossProduct(vectorB: Vector3d, result?: Vector3d): Vector3d | undefined {
    return this.crossProduct(vectorB, result).normalize(result);
  }
  /**
   * Compute the cross product of this vector with `vectorB`.   Normalize it, using given xyz as default if length is zero.
   * @param vectorB second vector of cross product
   * @param x x value for default result
   * @param y y value for default result
   * @param z z value for default result
   * @param result optional pre-allocated result.
   */
  public unitCrossProductWithDefault(vectorB: Vector3d, x: number, y: number, z: number, result?: Vector3d): Vector3d {
    const unit = this.crossProduct(vectorB, result).normalize(result);
    if (unit === undefined)
      return Vector3d.create(x, y, z, result);
    return unit;
  }
  /**
   * Normalize this vector, using given xyz as default if length is zero.
   * * if this instance and x,y,z are both 000, return unit x vector.
   * @param x x value for default result
   * @param y y value for default result
   * @param z z value for default result
   * @param result optional pre-allocated result.
   */
  public normalizeWithDefault(x: number, y: number, z: number, result?: Vector3d): Vector3d {
    const unit = this.normalize(result);
    if (unit)
      return unit;
    // try back to x,y,z
    result = Vector3d.create(x, y, z, result);
    if (result.normalizeInPlace())
      return result;

    return Vector3d.create(1, 0, 0, result);
  }
  /**
   * Try to normalize (divide by magnitude), storing the result in place.
   * @param smallestMagnitude smallest magnitude allowed as divisor.
   * @returns false if magnitude is too small.  In this case the vector is unchanged.
   */
  public tryNormalizeInPlace(smallestMagnitude: number = Geometry.smallMetricDistance): boolean {
    const a = this.magnitude();
    if (a < smallestMagnitude || a === 0.0)
      return false;
    this.scaleInPlace(1.0 / a);
    return true;
  }
  /**
   * Compute cross product with `vectorB`.
   * @param vectorB second vector for cross product.
   * @param productLength desired length of result vector.
   * @param result optional preallocated vector
   * @return undefined if the cross product is near zero length.
   */
  public sizedCrossProduct(vectorB: Vector3d, productLength: number, result?: Vector3d): Vector3d | undefined {
    result = this.crossProduct(vectorB, result);
    if (result.tryNormalizeInPlace()) {
      result.scaleInPlace(productLength);
      return result;
    }
    return undefined;
  }
  /**
   * Compute the squared magnitude of a cross product (without allocating a temporary vector object)
   * @param vectorB second vector of cross product
   * @returns the squared magnitude of the cross product of this instance with vectorB.
   */
  public crossProductMagnitudeSquared(vectorB: XYAndZ): number {
    const xx = this.y * vectorB.z - this.z * vectorB.y;
    const yy = this.z * vectorB.x - this.x * vectorB.z;
    const zz = this.x * vectorB.y - this.y * vectorB.x;
    return xx * xx + yy * yy + zz * zz;
  }
  /**
   * Compute the  magnitude of a cross product (without allocating a temporary vector object)
   * @param vectorB second vector of cross product
   * @returns the  magnitude of the cross product of this instance with vectorB.
   */
  public crossProductMagnitude(vectorB: XYAndZ): number {
    return Math.sqrt(this.crossProductMagnitudeSquared(vectorB));
  }
  /** Return the dot product of this vector with vectorB.
   * @param vectorB second vector of cross product
   * @returns the dot product of this instance with vectorB
   */
  public dotProduct(vectorB: XYAndZ): number {
    return this.x * vectorB.x + this.y * vectorB.y + this.z * vectorB.z;
  }
  /**
   * Return the dot product of the xyz components of two inputs that are XYAndZ but otherwise not explicitly Vector3d
   * @param targetA target point for first vector
   * @param targetB target point for second vector
   */
  public static dotProductAsXYAndZ(dataA: XYAndZ, dataB: XYAndZ): number {
    return dataA.x * dataB.x + dataA.y * dataB.y + dataA.z * dataB.z;
  }

  /**
   * Returns the dot product of this vector with the with vector from pointA to pointB
   * @param pointA start point of second vector of dot product
   * @param pointB end point of second vector of dot product
   */
  public dotProductStartEnd(pointA: XYAndZ, pointB: XYAndZ): number {
    return this.x * (pointB.x - pointA.x)
      + this.y * (pointB.y - pointA.y)
      + this.z * (pointB.z - pointA.z);
  }

  /**
   * Returns the dot product with vector (pointB - pointA * pointB.w)
   * * That is, pointA is weighted to weight of pointB.
   * * If pointB.w is zero, the homogeneous pointB is a simple vector
   * * If pointB.w is nonzero, the vector "from A to B" is not physical length.
   */
  public dotProductStart3dEnd4d(pointA: Point3d, pointB: Point4d): number {
    const w = pointB.w;
    return this.x * (pointB.x - pointA.x * w)
      + this.y * (pointB.y - pointA.y * w)
      + this.z * (pointB.z - pointA.z * w);
  }

  /** Cross product with vector from pointA to pointB */
  public crossProductStartEnd(pointA: Point3d, pointB: Point3d, result?: Vector3d): Vector3d {
    return Vector3d.createCrossProduct(this.x, this.y, this.z, pointB.x - pointA.x, pointB.y - pointA.y, pointB.z - pointA.z, result);
  }
  /** Cross product (xy parts only) with vector from pointA to pointB */
  public crossProductStartEndXY(pointA: Point3d, pointB: Point3d): number {
    return Geometry.crossProductXYXY(this.x, this.y, pointB.x - pointA.x, pointB.y - pointA.y);
  }
  /** Dot product with vector from pointA to pointB, with pointB given as x,y,z */
  public dotProductStartEndXYZ(pointA: Point3d, x: number, y: number, z: number): number {
    return this.x * (x - pointA.x)
      + this.y * (y - pointA.y)
      + this.z * (z - pointA.z);
  }
  /** Dot product with vector from pointA to pointB, using only xy parts */
  public dotProductStartEndXY(pointA: Point3d, pointB: Point3d): number {
    return this.x * (pointB.x - pointA.x)
      + this.y * (pointB.y - pointA.y);
  }
  /** Dot product with vector from pointA to pointB, with pointB given as (weighted) x,y,z,w
   * * pointB is a homogeneous point that has to be unweighted
   * * if the weight is near zero metric, the return is zero.
   */
  public dotProductStartEndXYZW(pointA: Point3d, x: number, y: number, z: number, w: number): number {
    if (Geometry.isSmallMetricDistance(w))
      return 0.0;
    const dw = 1.0 / w;
    return this.x * (dw * x - pointA.x)
      + this.y * (dw * y - pointA.y)
      + this.z * (dw * z - pointA.z);
  }
  /** Return the dot product of the instance and vectorB, using only the x and y parts. */
  public dotProductXY(vectorB: Vector3d): number {
    return this.x * vectorB.x + this.y * vectorB.y;
  }
  /**
   * Dot product with vector (x,y,z)
   * @param x x component for dot product
   * @param y y component for dot product
   * @param z z component for dot product
   */
  public dotProductXYZ(x: number, y: number, z: number = 0): number {
    return this.x * x + this.y * y + this.z * z;
  }
  /** Return the triple product of the instance, vectorB, and vectorC  */
  public tripleProduct(vectorB: Vector3d, vectorC: Vector3d): number {
    return Geometry.tripleProduct(this.x, this.y, this.z, vectorB.x, vectorB.y, vectorB.z, vectorC.x, vectorC.y, vectorC.z);
  }
  /** Return the cross product of the instance and vectorB, using only the x and y parts. */
  public crossProductXY(vectorB: Vector3d): number {
    return this.x * vectorB.y - this.y * vectorB.x;
  }
  /**
   * Return the cross product of this vector and vectorB.
   * @param vectorB second vector of cross product
   * @param result optional preallocated result.
   */
  public crossProduct(vectorB: Vector3d, result?: Vector3d): Vector3d {
    return Vector3d.createCrossProduct(this.x, this.y, this.z, vectorB.x, vectorB.y, vectorB.z, result);
  }
  /**
   * return cross product of `this` with the vector `(x, y, z)`
   * @param x x component of second vector
   * @param y y component of second vector
   * @param z z component of second vector
   * @param result computed cross product (new Vector3d).
   */
  public crossProductXYZ(x: number, y: number, z: number, result?: Vector3d): Vector3d {
    return Vector3d.createCrossProduct(this.x, this.y, this.z, x, y, z, result);
  }

  /**
   * Return the (Strongly typed) angle from this vector to vectorB.
   * * The returned angle is always positive and no larger than 180 degrees (PI radians)
   * * The returned angle is "in the plane containing the two vectors"
   * * Use `planarAngleTo`, `signedAngleTo`, `angleToXY` to take have angle measured in specific plane.
   * @param vectorB target vector of rotation.
   */
  public angleTo(vectorB: Vector3d): Angle {
    return Angle.createAtan2(this.crossProductMagnitude(vectorB), this.dotProduct(vectorB));
  }
  /**
   * Return the (Strongly typed) angle from this vector to the plane perpendicular to planeNormal.
   * * The returned vector is signed
   * * The returned vector is (as degrees) always less than or equal to 90 degrees.
   * @param planeNormal a normal vector to the plane
   */
  public angleFromPerpendicular(vectorB: Vector3d): Angle {
    return Angle.createAtan2(this.dotProduct(vectorB), this.crossProductMagnitude(vectorB));
  }

  /**
   * Return the (Strongly typed) angle from this vector to vectorB,using only the xy parts.
   * * The returned angle can range from negative 180 degrees (negative PI radians) to positive 180 degrees (positive PI radians), not closed on the negative side.
   * * Use `planarAngleTo`, `signedAngleTo`, `angleToXY` to take have angle measured in other planes.
   * @param vectorB target vector of rotation.
   */
  public angleToXY(vectorB: Vector3d): Angle {
    return Angle.createAtan2(this.crossProductXY(vectorB), this.dotProductXY(vectorB));
  }
  /**
   * Return the (radians as a simple number, not strongly typed Angle) radians from this vector to vectorB.
   * * The returned angle can be positive or negative, with magnitude no larger than PI radians
   * * Use signedRadiansTo` to take have angle measured in other planes.
   * @param vectorB target vector of rotation.
   */
  public planarRadiansTo(vector: Vector3d, planeNormal: Vector3d): number {
    const square = planeNormal.dotProduct(planeNormal);
    if (square === 0.0)
      return 0.0;
    const factor = 1.0 / square;
    const projection0: Vector3d = this.plusScaled(planeNormal, -this.dotProduct(planeNormal) * factor);
    const projection1: Vector3d = vector.plusScaled(planeNormal, -vector.dotProduct(planeNormal) * factor);
    return projection0.signedRadiansTo(projection1, planeNormal);
  }
  /**
   * Return the (as strongly typed Angle) Angle from this vector to vectorB.
   * * The returned angle can range from negative PI to positive PI (not closed on negative side)
   * * Use signedRadiansTo` to take have angle measured in other planes.
   * @param vectorB target vector of rotation.
   */
  public planarAngleTo(vector: Vector3d, planeNormal: Vector3d): Angle {
    return Angle.createRadians(this.planarRadiansTo(vector, planeNormal));
  }

  /**
   * Return the (simple number of radians, not Strongly typed Angle) angle from this vector to vectorB, measured in the plane containing both, with vectorW indicating which side to view to control sign of the angle.
   * * The returned angle can range from negative PI to positive PI (not closed on negative side)
   * * The returned angle is "in the plane containing the two vectors"
   * * `vectorW` distinguishes between the sides of the plane, but does not have to be perpendicular.
   * * The returned angle has the same sign as vectorW dot product (thisVector cross vectorB)
   * @param vectorB target vector of rotation.
   */
  public signedRadiansTo(vector1: Vector3d, vectorW: Vector3d): number {
    const p = this.crossProduct(vector1);
    const theta = Math.atan2(p.magnitude(), this.dotProduct(vector1));
    if (vectorW.dotProduct(p) < 0.0)
      return -theta;
    else
      return theta;
  }
  /**
   * Return the (strongly typed Angle) angle from this vector to vectorB, measured in the plane containing both, with vectorW indicating which side to view to control sign of the angle.
   * * The returned angle can range from negative 180 degrees (negative PI radians) to positive 180 degrees (positive PI radians), not closed on the negative side.
   * * The returned angle is "in the plane containing the two vectors"
   * * `vectorW` distinguishes between the sides of the plane, but does not have to be perpendicular.
   * * The returned angle has the same sign as vectorW dot product (thisVector cross vectorB)
   * @param vectorB target vector of rotation.
   */
  public signedAngleTo(vector1: Vector3d, vectorW: Vector3d): Angle { return Angle.createRadians(this.signedRadiansTo(vector1, vectorW)); }
  /** Return the smallest (strongly typed) angle from the (bidirectional) line containing `this` to the (bidirectional) line containing `vectorB` */
  public smallerUnorientedAngleTo(vectorB: Vector3d): Angle {
    return Angle.createRadians(this.smallerUnorientedRadiansTo(vectorB));
  }
  /** Return the smallest angle (in radians) from the (bidirectional) line containing `this` to the (bidirectional) line containing `vectorB` */
  public smallerUnorientedRadiansTo(vectorB: Vector3d): number {
    const c = this.dotProduct(vectorB);
    const s = this.crossProductMagnitude(vectorB);
    return Math.atan2(Math.abs(s), Math.abs(c));
  }

  /*
    signedAngleTo(vectorB: Vector3d, upVector: Vector3d): Angle { }
    // sectors
    isInSmallerSector(vectorA: Vector3d, vectorB: Vector3d): boolean { }
    isInCCWSector(vectorA: Vector3d, vectorB: Vector3d, upVector: Vector3d): boolean { }
    */
  /**
   * Test if this vector is parallel to other.
   * @param other second vector in comparison
   * @param oppositeIsParallel if the vectors are on the same line but in opposite directions, return this value.
   * @param returnValueIfAnInputIsZeroLength if either vector is near zero length, return this value.
   */
  public isParallelTo(other: Vector3d, oppositeIsParallel: boolean = false, returnValueIfAnInputIsZeroLength: boolean = false): boolean {
    const a2 = this.magnitudeSquared();
    const b2 = other.magnitudeSquared();
    // we know both are 0 or positive -- no need for
    if (a2 < Geometry.smallMetricDistanceSquared || b2 < Geometry.smallMetricDistanceSquared)
      return returnValueIfAnInputIsZeroLength;
    const dot = this.dotProduct(other);
    if (dot < 0.0 && !oppositeIsParallel)
      return returnValueIfAnInputIsZeroLength;
    const cross2 = this.crossProductMagnitudeSquared(other);
    /* a2,b2,cross2 are squared lengths of respective vectors */
    /* cross2 = sin^2(theta) * a2 * b2 */
    /* For small theta, sin^2(theta)~~theta^2 */
    return cross2 <= Geometry.smallAngleRadiansSquared * a2 * b2;
  }
  /**
   * Test if this vector is perpendicular to other.
   * @param other second vector in comparison
   * @param returnValueIfAnInputIsZeroLength if either vector is near zero length, return this value.
   */
  public isPerpendicularTo(other: Vector3d, returnValueIfAnInputIsZeroLength: boolean = false): boolean {
    const aa = this.magnitudeSquared();
    if (aa < Geometry.smallMetricDistanceSquared)
      return returnValueIfAnInputIsZeroLength;
    const bb = other.magnitudeSquared();
    if (bb < Geometry.smallMetricDistanceSquared)
      return returnValueIfAnInputIsZeroLength;
    const ab = this.dotProduct(other);
    return ab * ab <= Geometry.smallAngleRadiansSquared * aa * bb;
  }
}
