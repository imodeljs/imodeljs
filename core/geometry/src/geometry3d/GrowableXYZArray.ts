/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module ArraysAndInterfaces
 */

import { Geometry, PlaneAltitudeEvaluator } from "../Geometry";
import { Matrix4d } from "../geometry4d/Matrix4d";
import { IndexedReadWriteXYZCollection, IndexedXYZCollection } from "./IndexedXYZCollection";
import { Matrix3d } from "./Matrix3d";
import { Plane3dByOriginAndUnitNormal } from "./Plane3dByOriginAndUnitNormal";
import { Point2d } from "./Point2dVector2d";
import { Point3d, Vector3d } from "./Point3dVector3d";
import { Range1d, Range3d } from "./Range";
import { Transform } from "./Transform";
import { XYAndZ } from "./XYZProps";

/** `GrowableXYArray` manages a (possibly growing) Float64Array to pack xy coordinates.
 * @public
 */
export class GrowableXYZArray extends IndexedReadWriteXYZCollection {
  /**
   * array of packed xyz xyz xyz components
   */
  private _data: Float64Array;
  /**
   * Number of xyz triples (not floats) in the array
   */
  private _xyzInUse: number;
  /**
   * capacity in xyz triples. (not floats)
   */
  private _xyzCapacity: number;
  /** Construct a new GrowablePoint3d array.
   * @param numPoints [in] initial capacity.
   */
  public constructor(numPoints: number = 8) {
    super();
    this._data = new Float64Array(numPoints * 3);   // 8 Points to start (3 values each)
    this._xyzInUse = 0;
    this._xyzCapacity = numPoints;
  }

  /** The number of points in use. When the length is increased, the array is padded with zeroes. */
  public get length() { return this._xyzInUse; }
  public set length(newLength: number) {
    let oldLength = this.length;
    if (newLength < oldLength) {
      this._xyzInUse = newLength;
    } else if (newLength > oldLength) {
      this.ensureCapacity(newLength);
      while (oldLength++ < newLength)
        this.pushXYZ(0, 0, 0);
    }
  }

  /** Return the number of float64 in use. */
  public get float64Length() { return this._xyzInUse * 3; }
  /** Return the raw packed data.
   * * Note that the length of the returned Float64Array is a count of doubles, and includes the excess capacity
   */
  public float64Data(): Float64Array { return this._data; }

  /** If necessary, increase the capacity to a new pointCount.  Current coordinates and point count (length) are unchanged. */
  public ensureCapacity(pointCapacity: number) {
    if (pointCapacity > this._xyzCapacity) {
      const newData = new Float64Array(pointCapacity * 3);
      const numCopy = this.length * 3;
      for (let i = 0; i < numCopy; i++) newData[i] = this._data[i];
      this._data = newData;
      this._xyzCapacity = pointCapacity;
    }
  }
  /** Resize the actual point count, preserving excess capacity. */
  public resize(pointCount: number) {
    if (pointCount < this.length) {
      this._xyzInUse = pointCount >= 0 ? pointCount : 0;
    } else if (pointCount > this._xyzCapacity) {
      const newArray = new Float64Array(pointCount * 3);
      // Copy contents
      for (let i = 0; i < this._data.length; i += 3) {
        newArray[i] = this._data[i];
        newArray[i + 1] = this._data[i + 1];
        newArray[i + 2] = this._data[i + 2];
      }
      this._data = newArray;
      this._xyzCapacity = pointCount;
      this._xyzInUse = pointCount;
    }
  }
  /**
   * Make a copy of the (active) points in this array.
   * (The clone does NOT get excess capacity)
   */
  public clone(result?: GrowableXYZArray): GrowableXYZArray {
    const numValue = this.length * 3;
    if (!result)
      result = new GrowableXYZArray(this.length);
    else {
      result.clear();
      result.ensureCapacity(this.length);
    }
    const newData = result._data;
    const data = this._data;
    for (let i = 0; i < numValue; i++) newData[i] = data[i];
    result._xyzInUse = this.length;
    return result;
  }
  /** Create an array from various point data formats.
   * Valid inputs are:
   * * Point2d
   * * point3d
   * * An array of 2 doubles
   * * An array of 3 doubles
   * * A GrowableXYZArray
   * * Any json object satisfying Point3d.isXYAndZ
   * * Any json object satisfying Point3d.isXAndY
   * * A Float64Array of doubles, interpreted as xyzxyz
   * * An array of any of the above
   * @param data source points.
   * @param result optional pre-allocated GrowableXYZArray to clear and fill.
   */
  public static create(data: any, result?: GrowableXYZArray): GrowableXYZArray {
    if (result) {
      result.clear();
    } else {
      const pointCount = typeof data[0] === "number" ? data.length / 3 : data.length;
      result = new GrowableXYZArray(pointCount);
    }

    result.pushFrom(data);
    return result;
  }

  /** push a point to the end of the array */
  public push(toPush: XYAndZ) {
    this.pushXYZ(toPush.x, toPush.y, toPush.z);
  }

  /** push all points of an array */
  public pushAll(points: Point3d[]) {
    for (const p of points) this.push(p);
  }
  /** Push points from variant sources.
   * Valid inputs are:
   * * Point2d
   * * point3d
   * * An array of 2 doubles
   * * An array of 3 doubles
   * * A GrowableXYZArray
   * * Any json object satisfying Point3d.isXYAndZ
   * * Any json object satisfying Point3d.isXAndY
   * * A Float64Array of doubles, interpreted as xyzxyz
   * * An array of any of the above
   * @returns the number of points added.
   */
  public pushFrom(p: any) {
    if (p instanceof Point3d)
      this.pushXYZ(p.x, p.y, p.z);
    else if (p instanceof GrowableXYZArray)
      this.pushFromGrowableXYZArray(p);
    else if (p instanceof Point2d)
      this.pushXYZ(p.x, p.y, 0.0);
    else if (Geometry.isNumberArray(p, 4)) {
      const n = p.length;
      for (let i = 0; i + 2 < n; i += 3)
        this.pushXYZ(p[i], p[i + 1], p[i + 2]);
    } else if (Geometry.isNumberArray(p, 3))
      this.pushXYZ(p[0], p[1], p[2]);
    else if (Geometry.isNumberArray(p, 2))
      this.pushXYZ(p[0], p[1], 0.0);
    else if (Array.isArray(p)) {
      // direct recursion re-wraps p and goes infinite.  unroll here .
      for (const q of p)
        this.pushFrom(q);
    } else if (Point3d.isXYAndZ(p))
      this.pushXYZ(p.x, p.y, p.z);
    else if (Point3d.isXAndY(p))
      this.pushXYZ(p.x, p.y, 0.0);
    else if (p instanceof Float64Array) {
      const n = p.length;
      for (let i = 0; i + 2 < n; i += 3)
        this.pushXYZ(p[i], p[i + 1], p[i + 2]);
    } else if (p instanceof IndexedXYZCollection) {
      for (let i = 0; i < p.length; i++)
        this.pushXYZ(p.getXAtUncheckedPointIndex(i), p.getYAtUncheckedPointIndex(i), p.getZAtUncheckedPointIndex(i));
    }
  }
  /**
   * Replicate numWrap xyz values from the front of the array as new values at the end.
   * @param numWrap number of xyz values to replicate
   */
  public pushWrap(numWrap: number) {
    if (this._xyzInUse > 0) {
      let k;
      for (let i = 0; i < numWrap; i++) {
        k = 3 * i;
        this.pushXYZ(this._data[k], this._data[k + 1], this._data[k + 2]);
      }
    }
  }
  /** append a new point with given x,y,z */
  public pushXYZ(x: number, y: number, z: number) {
    const index = this._xyzInUse * 3;
    if (index >= this._data.length)
      this.ensureCapacity(this.length === 0 ? 4 : this.length * 2);
    this._data[index] = x;
    this._data[index + 1] = y;
    this._data[index + 2] = z;
    this._xyzInUse++;
  }
  /** Shift all data forward to make space for numPoints at the front.
   * * Leading (3*numPoints) doubles are left with prior contents.
   * * _xyzInUse count is increased
  */
  private shiftForward(numPoints: number) {
    if (numPoints <= 0)
      return;
    let newCapacity = this.length + numPoints;  // in POINTS
    if (newCapacity > this._xyzCapacity) {
      newCapacity = Math.max(4, 2 * this._xyzCapacity);
      this.ensureCapacity(newCapacity);
    }
    const numAddedDouble = 3 * numPoints;
    const lastIndex = this._xyzInUse * 3;
    this._data.copyWithin(numAddedDouble, 0, lastIndex);
    this._xyzInUse += numPoints;
  }
  /** prepend a new point with given x,y,z
   * * Remark: this copies all content forward.
   */
  public pushFrontXYZ(x: number, y: number, z: number) {
    this.shiftForward(1);
    this._data[0] = x;
    this._data[1] = y;
    this._data[2] = z;
  }
  /** prepend a new point at the front of the array.
   *
   */
  public pushFront(toPush: XYAndZ) {
    this.pushFrontXYZ(toPush.x, toPush.y, toPush.z);
  }

  /** move the coordinates at fromIndex to toIndex.
   * * No action if either index is invalid.
   */
  public moveIndexToIndex(fromIndex: number, toIndex: number) {
    if (this.isIndexValid(fromIndex) && this.isIndexValid(toIndex)) {
      let iA = fromIndex * 3;
      let iB = toIndex * 3;
      this._data[iB++] = this._data[iA++];
      this._data[iB++] = this._data[iA++];
      this._data[iB] = this._data[iA];
    }
  }
  /** Remove one point from the back.
   * * NOTE that (in the manner of std::vector native) this is "just" removing the point -- no point is NOT returned.
   * * Use `back ()` to get the last x,y,z assembled into a `Point3d `
   */
  public pop() {
    if (this._xyzInUse > 0)
      this._xyzInUse--;
  }
  /**
   * Test if index is valid for an xyz (point or vector) within this array
   * @param index xyz index to test.
   */
  public isIndexValid(index: number): boolean {
    if (index >= this._xyzInUse || index < 0)
      return false;
    return true;
  }
  /**
   * Clear all xyz data, but leave capacity unchanged.
   */
  public clear() {
    this._xyzInUse = 0;
  }
  /**
   * Get a point by index, strongly typed as a Point3d.  This is unchecked.  Use getPoint3dAtCheckedPointIndex to have validity test.
   * @param pointIndex index to access
   * @param result optional result
   */
  public getPoint3dAtUncheckedPointIndex(pointIndex: number, result?: Point3d): Point3d {
    const index = 3 * pointIndex;
    return Point3d.create(this._data[index], this._data[index + 1], this._data[index + 2], result);
  }

  /**
   * Get a point by index, strongly typed as a Point2d.  This is unchecked.  Use getPoint2dAtCheckedPointIndex to have validity test.
   * @param pointIndex index to access
   * @param result optional result
   */
  public getPoint2dAtUncheckedPointIndex(pointIndex: number, result?: Point2d): Point2d {
    const index = 3 * pointIndex;
    return Point2d.create(this._data[index], this._data[index + 1], result);
  }

  /** copy xyz into strongly typed Point3d */
  public getPoint3dAtCheckedPointIndex(pointIndex: number, result?: Point3d): Point3d | undefined {
    const index = 3 * pointIndex;
    if (this.isIndexValid(pointIndex)) {
      if (!result) result = Point3d.create();
      result.x = this._data[index];
      result.y = this._data[index + 1];
      result.z = this._data[index + 2];
      return result;
    }
    return undefined;
  }

  /** access x of indexed point */
  public getXAtUncheckedPointIndex(pointIndex: number): number {
    const index = 3 * pointIndex;
    return this._data[index];
  }

  /** access y of indexed point */
  public getYAtUncheckedPointIndex(pointIndex: number): number {
    const index = 3 * pointIndex;
    return this._data[index + 1];
  }

  /** access y of indexed point */
  public getZAtUncheckedPointIndex(pointIndex: number): number {
    const index = 3 * pointIndex;
    return this._data[index + 2];
  }

  /** copy xy into strongly typed Point2d */
  public getPoint2dAtCheckedPointIndex(pointIndex: number, result?: Point2d): Point2d | undefined {
    const index = 3 * pointIndex;
    if (this.isIndexValid(pointIndex)) {
      if (!result) result = Point2d.create();
      result.x = this._data[index];
      result.y = this._data[index + 1];
      return result;
    }
    return undefined;
  }
  /** copy xyz into strongly typed Vector3d */
  public getVector3dAtCheckedVectorIndex(vectorIndex: number, result?: Vector3d): Vector3d | undefined {
    const index = 3 * vectorIndex;
    if (vectorIndex >= 0 && vectorIndex < this._xyzInUse) {
      if (!result) result = Vector3d.create();
      result.x = this._data[index];
      result.y = this._data[index + 1];
      result.z = this._data[index + 2];
      return result;
    }
    return undefined;
  }

  /**
   * Read coordinates from source array, place them at index within this array.
   * @param destIndex point index where coordinates are to be placed in this array
   * @param source source array
   * @param sourceIndex point index in source array
   * @returns true if destIndex and sourceIndex are both valid.
   */
  public transferFromGrowableXYZArray(destIndex: number, source: GrowableXYZArray, sourceIndex: number): boolean {
    if (this.isIndexValid(destIndex) && source.isIndexValid(sourceIndex)) {
      const i = destIndex * 3;
      const j = sourceIndex * 3;
      this._data[i] = source._data[j];
      this._data[i + 1] = source._data[j + 1];
      this._data[i + 2] = source._data[j + 2];
      return true;
    }
    return false;
  }

  /**
   * push coordinates from the source array to the end of this array.
   * @param source source array
   * @param sourceIndex xyz index within the source.  If undefined, entire source is pushed.
   * @returns number of points pushed.
   */
  public pushFromGrowableXYZArray(source: GrowableXYZArray, sourceIndex?: number): number {
    // full array push  . . .
    if (sourceIndex === undefined) {
      const numXYZAdd = source.length;
      this.ensureCapacity(this.length + numXYZAdd);
      const nXAdd = source.length * 3;
      const i0 = this._xyzInUse * 3;
      for (let i = 0; i < nXAdd; i++)
        this._data[i0 + i] = source._data[i];
      this._xyzInUse += numXYZAdd;
      return numXYZAdd;
    }
    // single point push . . .
    if (source.isIndexValid(sourceIndex)) {
      const j = sourceIndex * 3;
      this.pushXYZ(source._data[j], source._data[j + 1], source._data[j + 2]);
      return 1;
    }
    return 0;
  }

  /**
   * Return the first point, or undefined if the array is empty.
   */
  public front(result?: Point3d): Point3d | undefined {
    if (this._xyzInUse === 0) return undefined;
    return this.getPoint3dAtUncheckedPointIndex(0, result);
  }
  /**
   * Return the last point, or undefined if the array is empty.
   */
  public back(result?: Point3d): Point3d | undefined {
    if (this._xyzInUse < 1) return undefined;
    return this.getPoint3dAtUncheckedPointIndex(this._xyzInUse - 1, result);
  }
  /**
   * Set the coordinates of a single point.
   * @param pointIndex index of point to set
   * @param value coordinates to set
   */
  public setAtCheckedPointIndex(pointIndex: number, value: XYAndZ): boolean {
    if (!this.isIndexValid(pointIndex))
      return false;
    let index = pointIndex * 3;
    this._data[index++] = value.x;
    this._data[index++] = value.y;
    this._data[index] = value.z;
    return true;
  }
  /**
   * Set the coordinates of a single point given as coordinates
   * @param pointIndex index of point to set
   * @param x x coordinate
   * @param y y coordinate
   * @param z z coordinate
   */
  public setXYZAtCheckedPointIndex(pointIndex: number, x: number, y: number, z: number): boolean {
    if (!this.isIndexValid(pointIndex))
      return false;
    let index = pointIndex * 3;
    this._data[index++] = x;
    this._data[index++] = y;
    this._data[index] = z;
    return true;
  }

  /**
   * Copy all points into a simple array of Point3d
   */
  public getPoint3dArray(): Point3d[] {
    const result = [];
    const data = this._data;
    const n = this.length;
    for (let i = 0; i < n; i++) {
      result.push(Point3d.create(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]));
    }
    return result;
  }
  /** multiply each point by the transform, replace values. */
  public multiplyTransformInPlace(transform: Transform) {
    const data = this._data;
    const nDouble = this.float64Length;
    const coffs = transform.matrix.coffs;
    const origin = transform.origin;
    const x0 = origin.x;
    const y0 = origin.y;
    const z0 = origin.z;
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i + 2 <= nDouble; i += 3) {
      x = data[i];
      y = data[i + 1];
      z = data[i + 2];
      data[i] = coffs[0] * x + coffs[1] * y + coffs[2] * z + x0;
      data[i + 1] = coffs[3] * x + coffs[4] * y + coffs[5] * z + y0;
      data[i + 2] = coffs[6] * x + coffs[7] * y + coffs[8] * z + z0;
    }
  }

  /** reverse the order of points. */
  public reverseInPlace() {
    const n = this.length;
    let j0, j1;
    let a;
    const data = this._data;
    for (let i0 = 0, i1 = n - 1; i0 < i1; i0++, i1--) {
      j0 = 3 * i0;
      j1 = 3 * i1;
      a = data[j0]; data[j0] = data[j1]; data[j1] = a;
      j0++;
      j1++;
      a = data[j0]; data[j0] = data[j1]; data[j1] = a;
      j0++;
      j1++;
      a = data[j0]; data[j0] = data[j1]; data[j1] = a;
    }
  }

  /** multiply each xyz (as a vector) by matrix, replace values. */
  public multiplyMatrix3dInPlace(matrix: Matrix3d) {
    const data = this._data;
    const nDouble = this.float64Length;
    const coffs = matrix.coffs;
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i + 2 <= nDouble; i += 3) {
      x = data[i];
      y = data[i + 1];
      z = data[i + 2];
      data[i] = coffs[0] * x + coffs[1] * y + coffs[2] * z;
      data[i + 1] = coffs[3] * x + coffs[4] * y + coffs[5] * z;
      data[i + 2] = coffs[6] * x + coffs[7] * y + coffs[8] * z;
    }
  }

  /** multiply each xyz (as a vector) by matrix inverse transpose, renormalize the vector, replace values.
   * * This is the way to apply a matrix (possibly with skew and scale) to a surface normal, and
   *      have it end up perpendicular to the transformed in-surface vectors.
   * * Return false if matrix is not invertible or if any normalization fails.
   */
  public multiplyAndRenormalizeMatrix3dInverseTransposeInPlace(matrix: Matrix3d): boolean {
    const data = this._data;
    const nDouble = this.float64Length;
    if (!matrix.computeCachedInverse(true))
      return false;
    const coffs = matrix.inverseCoffs!;
    const tol = 1.0e-15;
    let x = 0;
    let y = 0;
    let z = 0;
    let x1;
    let y1;
    let z1;
    let q;
    let a;
    let numFail = 0;
    for (let i = 0; i + 2 <= nDouble; i += 3) {
      x = data[i];
      y = data[i + 1];
      z = data[i + 2];
      x1 = coffs[0] * x + coffs[3] * y + coffs[6] * z;
      y1 = coffs[1] * x + coffs[4] * y + coffs[7] * z;
      z1 = coffs[2] * x + coffs[5] * y + coffs[8] * z;
      a = x1 * x1 + y1 * y1 + z1 * z1;
      if (a < tol) {
        // put the originals back ..
        x1 = x; y1 = y; z1 = z;
        numFail++;
      } else if (Math.abs(a - 1.0) > tol) {
        q = 1.0 / Math.sqrt(a);
        x1 *= q;
        y1 *= q;
        z1 *= q;
      } // else -- q is near 1, no need to do the division !!
      data[i] = x1;
      data[i + 1] = y1;
      data[i + 2] = z1;
    }
    return numFail === 0;
  }

  /** multiply each xyz (as a point) by a homogeneous matrix and update as the normalized point
   *
   */
  public multiplyMatrix4dAndQuietRenormalizeMatrix4d(matrix: Matrix4d) {
    const data = this._data;
    const nDouble = this.float64Length;
    const xyz1 = Point3d.create();
    for (let i = 0; i + 2 <= nDouble; i += 3) {
      matrix.multiplyXYZWQuietRenormalize(data[i], data[i + 1], data[i + 2], 1.0, xyz1);
      data[i] = xyz1.x;
      data[i + 1] = xyz1.y;
      data[i + 2] = xyz1.z;
    }
  }

  /** multiply each point by the transform, replace values. */
  public tryTransformInverseInPlace(transform: Transform): boolean {
    const data = this._data;
    const nDouble = this.float64Length;
    const matrix = transform.matrix;
    matrix.computeCachedInverse(true);
    const coffs = matrix.inverseCoffs;
    if (!coffs)
      return false;
    const origin = transform.origin;
    const x0 = origin.x;
    const y0 = origin.y;
    const z0 = origin.z;
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i + 3 <= nDouble; i += 3) {
      x = data[i] - x0;
      y = data[i + 1] - y0;
      z = data[i + 2] - z0;
      data[i] = coffs[0] * x + coffs[1] * y + coffs[2] * z;
      data[i + 1] = coffs[3] * x + coffs[4] * y + coffs[5] * z;
      data[i + 2] = coffs[6] * x + coffs[7] * y + coffs[8] * z;
    }
    return true;
  }
  /** Extend `range` to extend by all points. */
  public extendRange(rangeToExtend: Range3d, transform?: Transform) {
    const numDouble = this.float64Length;
    const data = this._data;
    if (transform) {
      for (let i = 0; i + 3 <= numDouble; i += 3)
        rangeToExtend.extendTransformedXYZ(transform, data[i], data[i + 1], data[i + 2]);
    } else {
      for (let i = 0; i + 3 <= numDouble; i += 3)
        rangeToExtend.extendXYZ(data[i], data[i + 1], data[i + 2]);

    }
  }
  /** get range of points. */
  public override getRange(transform?: Transform): Range3d {
    const range = Range3d.createNull();
    this.extendRange(range, transform);
    return range;
  }

  /** Initialize `range` with coordinates in this array. */
  public setRange(range: Range3d, transform?: Transform) {
    range.setNull();
    this.extendRange(range, transform);
  }

  /** Sum the lengths of segments between points. */
  public sumLengths(): number {
    let sum = 0.0;
    const n = 3 * (this._xyzInUse - 1);  // Length already takes into account what specifically is in use
    const data = this._data;
    for (let i = 0; i < n; i += 3) sum += Geometry.hypotenuseXYZ(
      data[i + 3] - data[i],
      data[i + 4] - data[i + 1],
      data[i + 5] - data[i + 2]);
    return sum;
  }
  /**
   * Multiply each x,y,z by the scale factor.
   * @param factor
   */
  public scaleInPlace(factor: number) {
    if (this._data) {
      const numFloat = this.float64Length;
      for (let i = 0; i < numFloat; i++)
        this._data[i] = this._data[i] * factor;
    }
  }
  /** test if all points are within tolerance of a plane. */
  public isCloseToPlane(plane: Plane3dByOriginAndUnitNormal, tolerance: number = Geometry.smallMetricDistance): boolean {
    const numCoordinate = 3 * this._xyzInUse;
    const data = this._data;
    for (let i = 0; i < numCoordinate; i += 3)
      if (Math.abs(plane.altitudeXYZ(data[i], data[i + 1], data[i + 2])) > tolerance)
        return false;
    return true;
  }
  /** Compute a point at fractional coordinate between points i and j */
  public interpolate(i: number, fraction: number, j: number, result?: Point3d): Point3d | undefined {
    if (this.isIndexValid(i) && this.isIndexValid(j)) {
      const fraction0 = 1.0 - fraction;
      const data = this._data;
      i = 3 * i;
      j = 3 * j;
      return Point3d.create(
        fraction0 * data[i] + fraction * data[j],
        fraction0 * data[i + 1] + fraction * data[j + 1],
        fraction0 * data[i + 2] + fraction * data[j + 2], result);
    }
    return undefined;
  }

  /**
   * * Compute a point at fractional coordinate between points i and j of source
   * * push onto this array.
   */
  public pushInterpolatedFromGrowableXYZArray(source: GrowableXYZArray, i: number, fraction: number, j: number) {
    if (source.isIndexValid(i) && source.isIndexValid(j)) {
      const fraction0 = 1.0 - fraction;
      const data = source._data;
      i = 3 * i;
      j = 3 * j;
      this.pushXYZ(
        fraction0 * data[i] + fraction * data[j],
        fraction0 * data[i + 1] + fraction * data[j + 1],
        fraction0 * data[i + 2] + fraction * data[j + 2]);
    }
  }

  /** Sum the signed areas of the projection to xy plane */
  public areaXY(): number {
    let area = 0.0;
    const n = 3 * this._xyzInUse;    // float count !!
    if (n > 6) {
      const x0 = this._data[n - 3];
      const y0 = this._data[n - 2];
      let dx1 = this._data[0] - x0;
      let dy1 = this._data[1] - y0;
      let dx2 = 0;
      let dy2 = 0;
      for (let i = 3; i < n; i += 3, dx1 = dx2, dy1 = dy2) {
        dx2 = this._data[i] - x0;
        dy2 = this._data[i + 1] - y0;
        area += Geometry.crossProductXYXY(dx1, dy1, dx2, dy2);
      }
    }
    return 0.5 * area;
  }

  /** Compute a vector from index origin i to indexed target j  */
  public vectorIndexIndex(i: number, j: number, result?: Vector3d): Vector3d | undefined {
    if (!this.isIndexValid(i) || !this.isIndexValid(j))
      return undefined;
    if (!result) result = Vector3d.create();
    const data = this._data;
    i = 3 * i;
    j = 3 * j;
    result.x = data[j] - data[i];
    result.y = data[j + 1] - data[i + 1];
    result.z = data[j + 2] - data[i + 2];
    return result;
  }

  /** Compute a vector from origin to indexed target j */
  public vectorXYAndZIndex(origin: XYAndZ, j: number, result?: Vector3d): Vector3d | undefined {
    if (this.isIndexValid(j)) {
      const data = this._data;
      j = 3 * j;
      return Vector3d.create(
        data[j] - origin.x,
        data[j + 1] - origin.y,
        data[j + 2] - origin.z, result);
    }
    return undefined;
  }

  /** Compute the cross product of vectors from from indexed origin to indexed targets i and j */
  public crossProductIndexIndexIndex(originIndex: number, targetAIndex: number, targetBIndex: number, result?: Vector3d): Vector3d | undefined {
    const i = originIndex * 3;
    const j = targetAIndex * 3;
    const k = targetBIndex * 3;
    const data = this._data;
    if (this.isIndexValid(originIndex) && this.isIndexValid(targetAIndex) && this.isIndexValid(targetBIndex))
      return Geometry.crossProductXYZXYZ(
        data[j] - data[i], data[j + 1] - data[i + 1], data[j + 2] - data[i + 2],
        data[k] - data[i], data[k + 1] - data[i + 1], data[k + 2] - data[i + 2],
        result);
    return undefined;
  }

  /** Compute the dot product of pointIndex with [x,y,z] */
  public evaluateUncheckedIndexDotProductXYZ(pointIndex: number, x: number, y: number, z: number): number {
    const i = pointIndex * 3;
    const data = this._data;
    return data[i] * x + data[i + 1] * y + data[i + 2] * z;
  }
  /** Compute the dot product of pointIndex with [x,y,z] */
  public evaluateUncheckedIndexPlaneAltitude(pointIndex: number, plane: PlaneAltitudeEvaluator): number {
    const i = pointIndex * 3;
    const data = this._data;
    return plane.altitudeXYZ(data[i], data[i + 1], data[i + 2]);
  }

  /**
   * * compute the cross product from indexed origin t indexed targets targetAIndex and targetB index.
   * * accumulate it to the result.
   */
  public accumulateCrossProductIndexIndexIndex(originIndex: number, targetAIndex: number, targetBIndex: number, result: Vector3d): void {
    const i = originIndex * 3;
    const j = targetAIndex * 3;
    const k = targetBIndex * 3;
    const data = this._data;
    if (this.isIndexValid(originIndex) && this.isIndexValid(targetAIndex) && this.isIndexValid(targetBIndex))
      result.addCrossProductToTargetsInPlace(
        data[i], data[i + 1], data[i + 2],
        data[j], data[j + 1], data[j + 2],
        data[k], data[k + 1], data[k + 2]);
    return undefined;
  }

  /**
   * * compute the cross product from indexed origin t indexed targets targetAIndex and targetB index.
   * * accumulate it to the result.
   */
  public accumulateScaledXYZ(index: number, scale: number, sum: Point3d): void {
    const i = index * 3;
    const data = this._data;
    if (this.isIndexValid(index)) {
      sum.x += scale * data[i];
      sum.y += scale * data[i + 1];
      sum.z += scale * data[i + 2];
    }
  }

  /** Compute the cross product of vectors from from origin to indexed targets i and j */
  public crossProductXYAndZIndexIndex(origin: XYAndZ, targetAIndex: number, targetBIndex: number, result?: Vector3d): Vector3d | undefined {
    const j = targetAIndex * 3;
    const k = targetBIndex * 3;
    const data = this._data;
    if (this.isIndexValid(targetAIndex) && this.isIndexValid(targetBIndex))
      return Geometry.crossProductXYZXYZ(
        data[j] - origin.x, data[j + 1] - origin.y, data[j + 2] - origin.z,
        data[k] - origin.x, data[k + 1] - origin.y, data[k + 2] - origin.z,
        result);
    return undefined;
  }

  /** Return the distance between an array point and the input point. */
  public distanceIndexToPoint(i: number, spacePoint: XYAndZ): number | undefined {
    if (i >= 0 && i < this._xyzInUse) {
      const i0 = 3 * i;
      return Geometry.hypotenuseXYZ(
        spacePoint.x - this._data[i0],
        spacePoint.y - this._data[i0 + 1],
        spacePoint.z - this._data[i0 + 2]);
    }
    return undefined;
  }

  /**
   * Return distance squared between indicated points.
   * * Concrete classes may be able to implement this without creating a temporary.
   * @param index0 first point index
   * @param index1 second point index
   * @param defaultDistanceSquared distance squared to return if either point index is invalid.
   *
   */
  public distanceSquaredIndexIndex(i: number, j: number): number | undefined {
    if (i >= 0 && i < this._xyzInUse && j >= 0 && j <= this._xyzInUse) {
      const i0 = 3 * i;
      const j0 = 3 * j;
      return Geometry.hypotenuseSquaredXYZ(
        this._data[j0] - this._data[i0],
        this._data[j0 + 1] - this._data[i0 + 1],
        this._data[j0 + 2] - this._data[i0 + 2]);
    }
    return undefined;
  }
  /**
   * Return distance between indicated points.
   * * Concrete classes may be able to implement this without creating a temporary.
   * @param index0 first point index
   * @param index1 second point index
   * @param defaultDistanceSquared distance squared to return if either point index is invalid.
   */
  public distanceIndexIndex(i: number, j: number): number | undefined {
    if (i >= 0 && i < this._xyzInUse && j >= 0 && j <= this._xyzInUse) {
      const i0 = 3 * i;
      const j0 = 3 * j;
      return Geometry.hypotenuseXYZ(
        this._data[j0] - this._data[i0],
        this._data[j0 + 1] - this._data[i0 + 1],
        this._data[j0 + 2] - this._data[i0 + 2]);
    }
    return undefined;
  }
  /** Return the distance between points in distinct arrays. */
  public static distanceBetweenPointsIn2Arrays(arrayA: GrowableXYZArray, i: number, arrayB: GrowableXYZArray, j: number): number | undefined {

    if (i >= 0 && i < arrayA._xyzInUse && j >= 0 && j <= arrayB._xyzInUse) {
      const i0 = 3 * i;
      const j0 = 3 * j;
      return Geometry.hypotenuseXYZ(
        arrayB._data[j0] - arrayA._data[i0],
        arrayB._data[j0 + 1] - arrayA._data[i0 + 1],
        arrayB._data[j0 + 2] - arrayA._data[i0 + 2]);
    }
    return undefined;
  }
  /** test for near equality between two `GrowableXYZArray`. */
  public static isAlmostEqual(dataA: GrowableXYZArray | undefined, dataB: GrowableXYZArray | undefined): boolean {
    if (dataA && dataB) {
      if (dataA.length !== dataB.length)
        return false;
      for (let i = 0; i < dataA.length; i++)
        if (!dataA.getPoint3dAtUncheckedPointIndex(i).isAlmostEqual(dataB.getPoint3dAtUncheckedPointIndex(i)))
          return false;
      return true;
    }
    // if both are null it is equal, otherwise unequal
    return (!dataA && !dataB);
  }

  /** Return an array of block indices sorted per compareLexicalBlock function */
  public sortIndicesLexical(): Uint32Array {
    const n = this._xyzInUse;
    // let numCompare = 0;
    const result = new Uint32Array(n);
    for (let i = 0; i < n; i++)result[i] = i;
    result.sort(
      (blockIndexA: number, blockIndexB: number) => {
        // numCompare++;
        return this.compareLexicalBlock(blockIndexA, blockIndexB);
      });
    // console.log (n, numCompare);
    return result;
  }

  /** compare two blocks in simple lexical order. */
  public compareLexicalBlock(ia: number, ib: number): number {
    let ax = 0;
    let bx = 0;
    for (let i = 0; i < 3; i++) {
      ax = this._data[ia * 3 + i];
      bx = this._data[ib * 3 + i];
      if (ax > bx) return 1;
      if (ax < bx) return -1;
    }
    return ia - ib; // so original order is maintained among duplicates !!!!
  }

  /** Access a single double at offset within a block.  This has no index checking. */
  public component(pointIndex: number, componentIndex: number): number {
    return this._data[3 * pointIndex + componentIndex];
  }
  /**
   * add points at regular steps from `other`
   * @param source
   * @param pointIndex0
   * @param step
   * @param numAdd
   */
  public addSteppedPoints(other: GrowableXYZArray, pointIndex0: number, step: number, numAdd: number) {
    const dataB = other._data;
    let b0 = pointIndex0 * 3;
    const nb = other.length * 3;
    let numAdded = 0;
    while (b0 >= 0 && b0 + 2 < nb && numAdded < numAdd) {
      this.pushXYZ(dataB[b0], dataB[b0 + 1], dataB[b0 + 2]);
      b0 += step * 3;
      numAdded++;
    }
  }

  /**
   * find the min and max distance between corresponding indexed points.   Excess points are ignored.
   * @param arrayA first array
   * @param arrayB second array
   */
  public static distanceRangeBetweenCorrespondingPoints(arrayA: GrowableXYZArray, arrayB: GrowableXYZArray): Range1d {
    const dataA = arrayA._data;
    const dataB = arrayB._data;
    const n = Math.min(arrayA.length, arrayB.length);
    let i = 0;
    let k0;
    const range = Range1d.createNull();
    while (i < n) {
      k0 = 3 * i;
      range.extendX(Geometry.hypotenuseXYZ(dataA[k0] - dataB[k0], dataA[k0 + 1] - dataB[k0 + 1], dataA[k0 + 2] - dataB[k0 + 2]));
      i++;
    }
    return range;
  }
  /**
   * remove trailing point(s) within tolerance of the start point.
   * @param points
   * @param tolerance
   */
  public static removeClosure(points: IndexedReadWriteXYZCollection, tolerance: number = Geometry.smallMetricDistance) {
    while (points.length > 1 && points.distanceIndexIndex(0, points.length - 1)! < tolerance)
      points.pop();
  }
  /**
   * * Triangle for (unchecked!) for three points identified by index
   * * z direction of frame is 001.
   * * Transform axes from origin to targetX and targetY
   * * in local coordinates (u,v,w) the xy interior of the triangle is `u>=0, v>= 0, w>= 0, u+v+w<1`
   * * Return undefined if transform is invertible (i.e. points are not in a vertical plane.)
   */
  public fillLocalXYTriangleFrame(originIndex: number, targetAIndex: number, targetBIndex: number, result?: Transform): Transform | undefined {
    if (this.isIndexValid(originIndex) && this.isIndexValid(targetAIndex) && this.isIndexValid(targetBIndex)) {
      let i0 = originIndex * 3;
      const data = this._data;
      const ax = data[i0++];
      const ay = data[i0++];
      const az = data[i0++];
      i0 = targetAIndex * 3;
      const ux = data[i0++] - ax;
      const uy = data[i0++] - ay;
      const uz = data[i0++] - az;
      i0 = targetBIndex * 3;
      const vx = data[i0++] - ax;
      const vy = data[i0++] - ay;
      const vz = data[i0++] - az;
      result = Transform.createRowValues(
        ux, vx, 0, ax,
        uy, vy, 0, ay,
        uz, vz, 1, az, result);
      return result.computeCachedInverse() ? result : undefined;
    }
    return undefined;
  }
  /**
   * Pass the (x,y,z) of each point to a function which returns a replacement for of of the 3 components.
   * @param componentIndex Index (0,1,2) of component to be replaced.
   * @param func function to be called as `func(x,y,z)`, returning a replacement value for componentIndex
   */
  public mapComponent(componentIndex: 0 | 1 | 2, func: (x: number, y: number, z: number) => number) {
    const n = this._data.length;
    let q;
    for (let i = 0; i + 2 < n; i += 3) {
      q = func(this._data[i], this._data[i + 1], this._data[i + 2]);
      this._data[i + componentIndex] = q;
    }
  }
}
