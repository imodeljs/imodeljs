/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module CartesianGeometry
 */

/* eslint-disable @typescript-eslint/naming-convention, no-empty */
import { Geometry } from "../Geometry";
import { Point4d } from "../geometry4d/Point4d";
import { MultiLineStringDataVariant } from "../topology/Triangulation";
import { IndexedXYZCollection } from "./IndexedXYZCollection";
import { Plane3dByOriginAndUnitNormal } from "./Plane3dByOriginAndUnitNormal";
import { Point2d } from "./Point2dVector2d";
import { Point3d, Vector3d, XYZ } from "./Point3dVector3d";
import { PointStringDeepXYZArrayCollector, VariantPointDataStream } from "./PointStreaming";
import { Range3d } from "./Range";
import { Transform } from "./Transform";
import { XAndY, XYAndZ, XYZProps } from "./XYZProps";

/**
 * The `NumberArray` class contains static methods that act on arrays of numbers.
 * @public
 */
export class NumberArray {
  /** return the sum of values in an array,   The summation is done with correction terms which
   * improves last-bit numeric accuracy.
   */
  public static preciseSum(data: number[]) {
    const n = data.length;
    if (n === 0)
      return 0.0;
    let sum = data[0];
    let c = 0.0;
    let y: number;
    let t: number;
    for (let i = 1; i < n; i++) {
      y = data[i] - c;
      t = sum + y;
      c = (t - sum) - y;
      sum = t;
    }
    return sum;
  }
  /** Return true if arrays have identical counts and equal entries (using `!==` comparison) */
  public static isExactEqual(dataA: any[] | Float64Array | undefined, dataB: any[] | Float64Array | undefined) {
    if (dataA && dataB) {
      if (dataA.length !== dataB.length)
        return false;
      for (let i = 0; i < dataA.length; i++)
        if (dataA[i] !== dataB[i])
          return false;
      return true;
    }
    return (dataA === undefined && dataB === undefined);
  }
  /** Return true if arrays have identical counts and entries equal within tolerance */
  public static isAlmostEqual(
    dataA: number[] | Float64Array | undefined,
    dataB: number[] | Float64Array | undefined,
    tolerance: number) {
    if (dataA && dataB) {
      if (dataA.length !== dataB.length)
        return false;
      for (let i = 0; i < dataA.length; i++)
        if (Math.abs(dataA[i] - dataB[i]) >= tolerance) return false;
      return true;
    }
    return (dataA === undefined && dataB === undefined);
  }

  /** return the sum of numbers in an array.  Note that "PreciseSum" may be more accurate. */
  public static sum(data: number[] | Float64Array) {
    let sum = 0;
    for (const x of data) { sum += x; }
    return sum;
  }
  /** test if coordinate x appears (to tolerance by `Geometry.isSameCoordinate`) in this array of numbers */
  public static isCoordinateInArray(x: number, data: number[] | undefined): boolean {
    if (data) {
      for (const y of data) { if (Geometry.isSameCoordinate(x, y)) return true; }
    }
    return false;
  }
  /** Return the max absolute value in a array of numbers. */
  public static maxAbsArray(values: number[]) {
    const arrLen = values.length;
    if (arrLen === 0) {
      return 0.0;
    }
    let a = Math.abs(values[0]);
    for (let i = 1; i < arrLen; i++) {
      const b = Math.abs(values[i]);
      if (a < b) {
        a = b;
      }
    }
    return a;
  }
  /** return the max absolute value of a pair of numbers */
  public static maxAbsTwo(a1: number, a2: number) {
    a1 = Math.abs(a1);
    a2 = Math.abs(a2);
    return (a1 > a2) ? a1 : a2;
  }
  /** Return the max absolute difference between corresponding entries in two arrays of numbers
   * * If sizes are mismatched, only the smaller length is tested.
   */
  public static maxAbsDiff(dataA: number[] | Float64Array, dataB: number[] | Float64Array): number {
    let a = 0.0;
    const n = Math.min(dataA.length, dataB.length);
    for (let i = 0; i < n; i++) { a = Math.max(a, Math.abs(dataA[i] - dataB[i])); }
    return a;
  }

  /** Return the max absolute difference between corresponding entries in two Float64Array
   * * If sizes are mismatched, only the smaller length is tested.
   */
  public static maxAbsDiffFloat64(dataA: Float64Array, dataB: Float64Array): number {
    let a = 0.0;
    const n = Math.min(dataA.length, dataB.length);
    for (let i = 0; i < n; i++) { a = Math.max(a, Math.abs(dataA[i] - dataB[i])); }
    return a;
  }
  /**
   * Return an array with indicated start and end points, maximum step size internally
   * @param low low value
   * @param high high value
   * @param step max permitted step
   */
  public static createArrayWithMaxStepSize(low: number, high: number, step: number): number[] {
    if (low === high)
      return [low];
    const delta = high - low;
    const numInterval = Math.max(1, Math.floor(Math.abs(delta / step)));
    const result = [];
    result.push(low);
    for (let i = 1; i < numInterval; i++) {
      result.push(low + (i / numInterval) * delta);
    }
    result.push(high);
    return result;
  }

  /** copy numbers from variant sources to number[]. */
  public static create(source: number[] | Float64Array): number[] {
    const result: number[] = [];
    for (const q of source)
      result.push(q);
    return result;
  }

}
/**
 * The `Point2dArray` class contains static methods that act on arrays of 2d points.
 * @public
 */
export class Point2dArray {
  /** Return true if arrays have same length and matching coordinates. */
  public static isAlmostEqual(dataA: undefined | Point2d[], dataB: undefined | Point2d[]): boolean {
    if (dataA && dataB) {
      if (dataA.length !== dataB.length)
        return false;
      for (let i = 0; i < dataA.length; i++) {
        if (!dataA[i].isAlmostEqual(dataB[i]))
          return false;
      }
      return true;
    }
    return (dataA === undefined && dataB === undefined);
  }
  /**
   * Return an array containing clones of the Point3d data[]
   * @param data source data
   */
  public static clonePoint2dArray(data: Point2d[]): Point2d[] {
    return data.map((p: Point2d) => p.clone());
  }
  /**
   * Return the number of points when trailing points that match point 0 are excluded.
   * @param data array of XAndY points.
   */
  public static pointCountExcludingTrailingWraparound(data: XAndY[]): number {
    let n = data.length;
    if (n < 2)
      return n;
    const x0 = data[0].x;
    const y0 = data[0].y;
    while (n > 1) {
      if (!Geometry.isSameCoordinate(data[n - 1].x, x0) || !Geometry.isSameCoordinate(data[n - 1].y, y0))
        return n;
      n--;
    }
    return n;
  }

}

/**
 * The `Vector3ddArray` class contains static methods that act on arrays of 2d vectors.
 * @public
 */
export class Vector3dArray {
  /** Return true if arrays have same length and matching coordinates. */
  public static isAlmostEqual(dataA: undefined | Vector3d[], dataB: undefined | Vector3d[]): boolean {
    if (dataA && dataB) {
      if (dataA.length !== dataB.length)
        return false;
      for (let i = 0; i < dataA.length; i++)
        if (!dataA[i].isAlmostEqual(dataB[i]))
          return false;
      return true;
    }
    return (dataA === undefined && dataB === undefined);
  }
  /**
   * Return an array containing clones of the Vector3d data[]
   * @param data source data
   */
  public static cloneVector3dArray(data: XYAndZ[]): Vector3d[] {
    return data.map((p: XYAndZ) => Vector3d.create(p.x, p.y, p.z));
  }
}

/**
 * The `Point4dArray` class contains static methods that act on arrays of 4d points.
 * @public
 */
export class Point4dArray {
  /** pack each point and its corresponding weight into a buffer of xyzw xyzw ... */
  public static packPointsAndWeightsToFloat64Array(data: Point3d[] | Float64Array | number[], weights: number[] | Float64Array,
    result?: Float64Array): Float64Array | undefined {
    if (Array.isArray(data) && data[0] instanceof Point3d) {
      const points = data as Point3d[];
      if (points.length !== weights.length)
        return undefined;
      result = result ? result : new Float64Array(4 * points.length);
      let i = 0;
      let k = 0;
      for (k = 0; k < points.length; k++) {
        result[i++] = points[k].x;
        result[i++] = points[k].y;
        result[i++] = points[k].z;
        result[i++] = weights[k];
      }
      return result;
    } else {
      const points = data as (Float64Array | number[]);
      const numPoints = weights.length;
      if (points.length !== 3 * numPoints)
        return undefined;
      let i = 0; let k;
      result = result ? result : new Float64Array(4 * numPoints);
      for (k = 0; k < numPoints; k++) {
        const k0 = 3 * k;
        result[i++] = points[k0];
        result[i++] = points[k0 + 1];
        result[i++] = points[k0 + 2];
        result[i++] = weights[k];
      }
      return result;
    }
    return undefined;
  }

  /** pack x,y,z,w in Float64Array. */
  public static packToFloat64Array(data: Point4d[], result?: Float64Array): Float64Array {
    result = result ? result : new Float64Array(4 * data.length);
    let i = 0;
    for (const p of data) {
      result[i++] = p.x;
      result[i++] = p.y;
      result[i++] = p.z;
      result[i++] = p.w;
    }
    return result;
  }
  /** unpack from  ... to array of Point4d */
  public static unpackToPoint4dArray(data: Float64Array): Point4d[] {
    const result = [];
    for (let i = 0; i + 3 < data.length; i += 4) {
      result.push(Point4d.create(data[i], data[i + 1], data[i + 2], data[i + 3]));
    }
    return result;
  }
  /** unpack from xyzw xyzw... array to array of Point3d and array of weight.
   */
  public static unpackFloat64ArrayToPointsAndWeights(data: Float64Array, points: Point3d[], weights: number[],
    pointFormatter: (x: number, y: number, z: number) => any = Point3d.create) {
    points.length = 0;
    weights.length = 0;
    for (let i = 0; i + 3 < data.length; i += 4) {
      points.push(pointFormatter(data[i], data[i + 1], data[i + 2]));
      weights.push(data[i + 3]);
    }
  }
  private static _workPoint4d = Point4d.create();
  /**
   * Multiply (and replace) each block of 4 values as a Point4d.
   * @param transform transform to apply
   * @param xyzw array of x,y,z,w points.
   */
  public static multiplyInPlace(transform: Transform, xyzw: Float64Array): void {
    const numXYZW = xyzw.length;
    const xyzw1 = Point4dArray._workPoint4d;
    for (let i = 0; i + 3 < numXYZW; i += 4) {
      transform.multiplyXYZW(xyzw[i], xyzw[i + 1], xyzw[i + 2], xyzw[i + 3], xyzw1);
      xyzw[i] = xyzw1.x;
      xyzw[i + 1] = xyzw1.y;
      xyzw[i + 2] = xyzw1.z;
      xyzw[i + 3] = xyzw1.w;
    }
  }
  /** test for near equality of all corresponding numeric values, treated as coordinates. */
  public static isAlmostEqual(dataA: Point4d[] | Float64Array | undefined, dataB: Point4d[] | Float64Array | undefined): boolean {
    if (dataA && dataB) {
      if (dataA.length !== dataB.length)
        return false;
      if (dataA instanceof Float64Array && dataB instanceof Float64Array) {
        for (let i = 0; i < dataA.length; i++)
          if (!Geometry.isSameCoordinate(dataA[i], dataB[i]))
            return false;
      } else if (Array.isArray(dataA) && Array.isArray(dataB)) {
        for (let i = 0; i < dataA.length; i++)
          if (!dataA[i].isAlmostEqual(dataB[i]))
            return false;
      }
      return true;
    }
    // if both are null it is equal, otherwise unequal
    return (dataA === undefined && dataB === undefined);
  }
  /** return true iff all xyzw points' altitudes are within tolerance of the plane.*/
  public static isCloseToPlane(data: Point4d[] | Float64Array, plane: Plane3dByOriginAndUnitNormal, tolerance: number = Geometry.smallMetricDistance): boolean {
    if (Array.isArray(data)) {
      for (const xyzw of data) {
        if (Math.abs(plane.altitudeXYZW(xyzw.x, xyzw.y, xyzw.z, xyzw.w)) > tolerance)
          return false;
      }
    } else if (data instanceof Float64Array) {
      const numXYZ = data.length;
      for (let i = 0; i + 2 < numXYZ; i += 4) {
        if (Math.abs(plane.altitudeXYZW(data[i], data[i + 1], data[i + 2], data[i + 3])) > tolerance)
          return false;
      }
    }
    return true;
  }

}
/**
 * The `Point3dArray` class contains static methods that act on arrays of 3d points.
 * @public
 */

export class Point3dArray {
  /** pack x,y,z to `Float64Array` */
  public static packToFloat64Array(data: Point3d[]): Float64Array {
    const result = new Float64Array(3 * data.length);
    let i = 0;
    for (const p of data) {
      result[i++] = p.x;
      result[i++] = p.y;
      result[i++] = p.z;
    }
    return result;
  }
  /**
   * Compute the 8 weights of trilinear mapping
   * By appropriate choice of weights, this can be used for both point and derivative mappings.
   * @param weights preallocated array to receive weights.
   * @param u0 low u weight
   * @param u1 high u weight
   * @param v0 low v weight
   * @param v1 high v weight
   * @param w0 low w weight
   * @param w1 high w weight
   */
  public static evaluateTrilinearWeights(weights: Float64Array, u0: number, u1: number, v0: number, v1: number, w0: number, w1: number) {

    weights[0] = u0 * v0 * w0;
    weights[1] = u1 * v0 * w0;
    weights[2] = u0 * v1 * w0;
    weights[3] = u1 * v1 * w0;
    weights[4] = u0 * v0 * w1;
    weights[5] = u1 * v0 * w1;
    weights[6] = u0 * v1 * w1;
    weights[7] = u1 * v1 * w1;
  }
  /**
   * sum the weighted x components from a point array.
   * * weights.length is the number of summed terms
   * * points must have at least that length
   * @param weights
   * @param points
   */
  public static sumWeightedX(weights: Float64Array, points: Point3d[]): number {
    let sum = 0.0;
    const n = weights.length;
    for (let i = 0; i < n; i++)
      sum += weights[i] * points[i].x;
    return sum;
  }

  /**
   * sum the weighted x components from a point array.
   * * weights.length is the number of summed terms
   * * points must have at least that length
   * @param weights
   * @param points
   */
  public static sumWeightedY(weights: Float64Array, points: Point3d[]): number {
    let sum = 0.0;
    const n = weights.length;
    for (let i = 0; i < n; i++)
      sum += weights[i] * points[i].y;
    return sum;
  }

  /**
   * sum the weighted x components from a point array.
   * * weights.length is the number of summed terms
   * * points must have at least that length
   * @param weights
   * @param points
   */
  public static sumWeightedZ(weights: Float64Array, points: Point3d[]): number {
    let sum = 0.0;
    const n = weights.length;
    for (let i = 0; i < n; i++)
      sum += weights[i] * points[i].z;
    return sum;
  }

  private static _weightUVW = new Float64Array(8);
  private static _weightDU = new Float64Array(8);
  private static _weightDV = new Float64Array(8);
  private static _weightDW = new Float64Array(8);
  /**
   * Compute a point by trilinear mapping.
   * @param points array of 8 points at corners, with x index varying fastest.
   * @param result optional result point
   */
  public static evaluateTrilinearPoint(points: Point3d[], u: number, v: number, w: number, result?: Point3d): Point3d {
    if (!result) result = Point3d.create(0, 0, 0);
    this.evaluateTrilinearWeights(this._weightUVW, 1 - u, u, 1 - v, v, 1 - w, w);
    let a;
    for (let i = 0; i < 8; i++) {
      a = this._weightUVW[i];
      result.x += a * points[i].x;
      result.y += a * points[i].y;
      result.z += a * points[i].z;
    }
    return result;
  }
  /**
   * Compute a point and derivatives wrt uvw by trilinear mapping.
   * * evaluated point is the point part of the transform
   * * u,v,w derivatives are the respective columns of the matrix part of the transform.
   * @param points array of 8 points at corners, with x index varying fastest.
   * @param result optional result transform
   */
  public static evaluateTrilinearDerivativeTransform(points: Point3d[], u: number, v: number, w: number, result?: Transform): Transform {
    this.evaluateTrilinearWeights(this._weightUVW, 1 - u, u, 1 - v, v, 1 - w, w);
    this.evaluateTrilinearWeights(this._weightDU, -1, 1, 1 - v, v, 1 - w, w);
    this.evaluateTrilinearWeights(this._weightDV, 1 - u, u, -1, 1, 1 - w, w);
    this.evaluateTrilinearWeights(this._weightDW, 1 - u, u, 1 - v, v, -1, 1);
    return Transform.createRowValues(
      this.sumWeightedX(this._weightDU, points), this.sumWeightedX(this._weightDV, points), this.sumWeightedX(this._weightDW, points), this.sumWeightedX(this._weightUVW, points),
      this.sumWeightedY(this._weightDU, points), this.sumWeightedY(this._weightDV, points), this.sumWeightedY(this._weightDW, points), this.sumWeightedY(this._weightUVW, points),
      this.sumWeightedZ(this._weightDU, points), this.sumWeightedZ(this._weightDV, points), this.sumWeightedZ(this._weightDW, points), this.sumWeightedZ(this._weightUVW, points),
      result);
  }
  /** unpack from a number array or Float64Array to an array of `Point3d` */
  public static unpackNumbersToPoint3dArray(data: Float64Array | number[]): Point3d[] {
    const result = [];
    for (let i = 0; i + 2 < data.length; i += 3) {
      result.push(Point3d.create(data[i], data[i + 1], data[i + 2]));
    }
    return result;
  }

  /**
   * return an 2-dimensional array containing all the values of `data` in arrays of numPerBlock
   * @param data simple array of numbers
   * @param numPerBlock number of values in each block at first level down
   */
  public static unpackNumbersToNestedArrays(data: Float64Array, numPerBlock: number): any[] {
    const result = [];
    const n = data.length;
    let i = 0;
    let i1 = 0;
    while (i < n) {
      // there is at least one more value for a block
      const row = [];
      i1 = i + numPerBlock;
      if (i1 > n)
        i1 = n;
      for (; i < i1; i++) {
        row.push(data[i]);
      }
      result.push(row);
    }
    return result;
  }

  /**
   * return an 3-dimensional array containing all the values of `data` in arrays numPerRow blocks of numPerBlock
   * @param data simple array of numbers
   * @param numPerBlock number of values in each block at first level down
   */
  public static unpackNumbersToNestedArraysIJK(data: Float64Array, numPerBlock: number, numPerRow: number): any[] {
    const result = [];
    const n = data.length;
    let i = 0;
    let i1 = 0;
    let i2;
    while (i < n) {
      const row = [];
      i2 = i + numPerBlock * numPerRow;
      while (i < i2) {
        const block = [];
        i1 = i + numPerBlock;
        if (i1 > n)
          i1 = n;
        for (; i < i1; i++) {
          block.push(data[i]);
        }
        row.push(block);
      }
      result.push(row);
    }
    return result;
  }
  /**  multiply a transform times each x,y,z triple and replace the x,y,z in the packed array */
  public static multiplyInPlace(transform: Transform, xyz: Float64Array): void {
    const xyz1 = Point3d.create();
    const numXYZ = xyz.length;
    for (let i = 0; i + 2 < numXYZ; i += 3) {
      transform.multiplyXYZ(xyz[i], xyz[i + 1], xyz[i + 2], xyz1);
      xyz[i] = xyz1.x;
      xyz[i + 1] = xyz1.y;
      xyz[i + 2] = xyz1.z;
    }
  }
  /** Apply Geometry.isAlmostEqual to corresponding coordinates */
  public static isAlmostEqual(dataA: Point3d[] | Float64Array | undefined, dataB: Point3d[] | Float64Array | undefined): boolean {
    if (dataA && dataB) {
      if (dataA.length !== dataB.length)
        return false;
      if (dataA instanceof Float64Array && dataB instanceof Float64Array) {
        for (let i = 0; i < dataA.length; i++)
          if (!Geometry.isSameCoordinate(dataA[i], dataB[i]))
            return false;
      } else if (Array.isArray(dataA) && Array.isArray(dataB)) {
        for (let i = 0; i < dataA.length; i++)
          if (!dataA[i].isAlmostEqual(dataB[i]))
            return false;
      }
      return true;
    }
    // if both are null it is equal, otherwise unequal
    return (dataA === undefined && dataB === undefined);
  }

  /** return simple average of all coordinates.   (000 if empty array) */
  public static centroid(points: IndexedXYZCollection, result?: Point3d): Point3d {
    result = Point3d.create(0, 0, 0, result);
    const p = Point3d.create();
    if (points.length > 0) {
      for (let i = 0; i < points.length; i++) {
        points.getPoint3dAtCheckedPointIndex(i, p);
        result.x += p.x; result.y += p.y; result.z += p.z;
      }
      result.scaleInPlace(1.0 / points.length);
    }
    return result;
  }

  /** Return the index of the point most distant from spacePoint */
  public static indexOfMostDistantPoint(points: Point3d[], spacePoint: XYZ, farVector: Vector3d): number | undefined {
    if (points.length === 0)
      return undefined;
    let dMax = -1;
    let d;
    let result = -1;
    for (let i = 0; i < points.length; i++) {
      d = spacePoint.distance(points[i]);
      if (d > dMax) {
        spacePoint.vectorTo(points[i], farVector);
        dMax = d;
        result = i;
      }
    }
    return result;
  }
  /** return the index of the point whose vector from space point has the largest magnitude of cross product with given vector. */
  public static indexOfPointWithMaxCrossProductMagnitude(points: Point3d[], spacePoint: Point3d, vector: Vector3d, farVector: Vector3d): number | undefined {
    if (points.length === 0)
      return undefined;
    let dMax = -1;
    let d;
    let result = -1;
    let vectorAB; // to be reused in loop !!!
    for (let i = 0; i < points.length; i++) {
      vectorAB = spacePoint.vectorTo(points[i], vectorAB);
      d = vectorAB.crossProductMagnitude(vector);
      if (d > dMax) {
        farVector.setFrom(vectorAB);
        dMax = d;
        result = i;
      }
    }
    return result;
  }

  /** Return the index of the closest point in the array (full xyz) */
  public static closestPointIndex(data: XYAndZ[], spacePoint: XYAndZ): number {
    let index = -1;
    let dMin = Number.MAX_VALUE;
    let d;
    const x0 = spacePoint.x;
    const y0 = spacePoint.y;
    const z0 = spacePoint.z;
    for (let i = 0; i < data.length; i++) {
      d = Geometry.distanceXYZXYZ(x0, y0, z0, data[i].x, data[i].y, data[i].z);
      if (d < dMin) {
        index = i;
        dMin = d;
      }
    }
    return index;
  }
  /** return true iff all points' altitudes are within tolerance of the plane.*/
  public static isCloseToPlane(data: Point3d[] | Float64Array, plane: Plane3dByOriginAndUnitNormal, tolerance: number = Geometry.smallMetricDistance): boolean {
    if (Array.isArray(data)) {
      let xyz;
      for (xyz of data) {
        if (Math.abs(plane.altitude(xyz)) > tolerance)
          return false;
      }
    } else if (data instanceof Float64Array) {
      const numXYZ = data.length;
      for (let i = 0; i + 2 < numXYZ; i += 3) {
        if (Math.abs(plane.altitudeXYZ(data[i], data[i + 1], data[i + 2])) > tolerance)
          return false;
      }
    }
    return true;
  }
  /**
   * Sum lengths of edges.
   * @param data points.
   */
  public static sumEdgeLengths(data: Point3d[] | Float64Array, addClosureEdge: boolean = false): number {
    let sum = 0.0;
    if (Array.isArray(data)) {
      const n = data.length - 1;
      for (let i = 0; i < n; i++) sum += data[i].distance(data[i + 1]);
      if (addClosureEdge && n > 0)
        sum += data[0].distance(data[n]);

    } else if (data instanceof Float64Array) {
      const numXYZ = data.length;
      let i = 0;
      for (; i + 5 < numXYZ; i += 3) {  // final i points at final point x
        sum += Geometry.hypotenuseXYZ(data[i + 3] - data[i],
          data[i + 4] - data[i + 1],
          data[i + 5] - data[i + 2]);
      }
      if (addClosureEdge && i >= 3) {
        sum += Geometry.hypotenuseXYZ(data[0] - data[i],
          data[1] - data[i + 1],
          data[2] - data[i + 2]);
      }
    }
    return sum;
  }

  /**
   * Return an array containing clones of the Point3d data[]
   * @param data source data
   */
  public static clonePoint3dArray(data: XYZProps[] | Float64Array): Point3d[] {
    const result: Point3d[] = [];
    if (data.length === 0)
      return result;
    if (data instanceof Float64Array) {
      for (let i = 0; i + 2 < data.length; i += 3)
        result.push(Point3d.create(data[i], data[i + 1], data[i + 2]));
      return result;
    }
    for (const p of data) {
      if (Array.isArray(p))
        result.push(Point3d.create (p[0], p[1], p[2]));
      else
        result.push(Point3d.create(p.x, p.y, p.z));
    }
    return result;
  }
  /**
   * Return an array containing Point2d with xy parts of each Point3d
   * @param data source data
   */
  public static clonePoint2dArray(data: XYAndZ[]): Point2d[] {
    return data.map((p: XYAndZ) => Point2d.create(p.x, p.y));
  }
  /**
   * clone points in the input array, inserting points within each edge to limit edge length.
   * @param points array of points
   * @param maxEdgeLength max length of an edge
   */
  public static cloneWithMaxEdgeLength(points: Point3d[], maxEdgeLength: number): Point3d[] {
    if (points.length === 0)
      return [];
    const result = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1].distance(points[i]);
      const n = Geometry.stepCount(maxEdgeLength, a, 1);
      for (let k = 1; k < n; k++)
        result.push(points[i - 1].interpolate(k / n, points[i]));
      result.push(points[i]);

    }
    return result;
  }
  /** Pack isolated x,y,z args as a json `[x,y,z]` */
  private static xyzToArray(x: number, y: number, z: number): number[] { return [x, y, z]; }

  /**
   * return similarly-structured array, array of arrays, etc, with the lowest level point data specifically structured as arrays of 3 numbers `[1,2,3]`
   * @param data point data with various leaf forms such as `[1,2,3]`, `{x:1,y:2,z:3}`, `Point3d`
   */
  public static cloneDeepJSONNumberArrays(data: MultiLineStringDataVariant): number[][] {
    const collector = new PointStringDeepXYZArrayCollector(this.xyzToArray);
    VariantPointDataStream.streamXYZ(data, collector);
    return collector.claimResult();
  }
  /**
   * clone an array of [[XYZProps]] data, specifically as arrays of 3 numbers
   */
  public static cloneXYZPropsAsNumberArray(data: XYZProps[]): number[][] {
     // data is an array ... each member is either Point3d or [x,y,z]
    const result = [];
    for (const p of data) {
      if (p instanceof Point3d) {
        result.push([p.x, p.y, p.z]);
      } else if (Array.isArray(p)) {
        result.push([p[0], p[1], p.length > 2 ? p[2] : 0.0]);
      }
    }
    return result;
  }
  /**
   * clone an array of [[XYZProps]] data, specifically as flattened array of number
   */
  public static cloneXYZPropsAsFloat64Array(data: XYZProps[]): Float64Array {
    const result = new Float64Array(data.length * 3);
    let i = 0;
    for (const p of data) {
      if (p instanceof Point3d){
      result[i++] = p.x;
      result[i++] = p.y;
        result[i++] = p.z;
      } else if (Array.isArray (p)){
        result[i++] = p[0];
        result[i++] = p[1];
        result[i++] = p.length > 2 ? p[2] : 0.0;    // allow missing z
      }
    }
    return result;
 }

  /**
   * return similarly-structured array, array of arrays, etc, with the lowest level point data specifically structured as `Point3d`.
   * @param data point data with various leaf forms such as `[1,2,3]`, `{x:1,y:2,z:3}`, `Point3d`
   */
  public static cloneDeepXYZPoint3dArrays(data: MultiLineStringDataVariant): any[] {
    const collector = new PointStringDeepXYZArrayCollector(Point3d.create);
    VariantPointDataStream.streamXYZ(data, collector);
    return collector.claimResult();
  }
  /**
   * `Point3dArray.createRange(data)` is deprecated.  Used `Range3d.createFromVariantData(data: MultiLineStringDataVariant): Range3d`
   * @deprecated Use Range3d.createFromVariantData (data)
   * @param data
   */
  public static createRange(data: MultiLineStringDataVariant): Range3d { return Range3d.createFromVariantData(data); }

  /** Computes the hull of the XY projection of points.
   * * Returns the hull as an array of Point3d
   * * Optionally returns non-hull points in `insidePoints[]`
   * * If both arrays empty if less than 3 points.
   * *
   */
  public static computeConvexHullXY(points: Point3d[], hullPoints: Point3d[], insidePoints: Point3d[], addClosurePoint: boolean = false) {
    hullPoints.length = 0;
    insidePoints.length = 0;
    let n = points.length;
    // Get deep copy
    const xy1: Point3d[] = points.slice(0, n);
    xy1.sort(Geometry.lexicalXYLessThan);
    if (n < 3) {
      for (const p of xy1)
        hullPoints.push(p);
      if (addClosurePoint && xy1.length > 0)
        hullPoints.push(xy1[0]);
      return;
    }
    hullPoints.push(xy1[0]); // This is sure to stay
    hullPoints.push(xy1[1]); // This one can be removed in loop.
    let numInside = 0;
    // First sweep creates upper hull
    for (let i = 2; i < n; i++) {
      const candidate = xy1[i];
      let top = hullPoints.length - 1;
      while (top >= 1 && hullPoints[top - 1].crossProductToPointsXY(hullPoints[top], candidate) <= 0.0) {
        xy1[numInside++] = hullPoints[top];
        top--;
        hullPoints.pop();
      }
      hullPoints.push(candidate);
    }
    const i0 = hullPoints.length - 1;
    xy1.length = numInside;
    xy1.push(hullPoints[0]);    // force first point to be reconsidered as final hull point.
    xy1.sort(Geometry.lexicalXYLessThan);
    n = xy1.length;
    // xy1.back () is already on stack.
    hullPoints.push(xy1[n - 1]);
    for (let i = n - 1; i-- > 0;) {
      const candidate = xy1[i];
      let top = hullPoints.length - 1;
      while (top > i0 && hullPoints[top - 1].crossProductToPointsXY(hullPoints[top], candidate) <= 0.0) {
        insidePoints.push(hullPoints[top]);
        top--;
        hullPoints.pop();
      }
      if (i > 0)    // don't replicate start !!!
        hullPoints.push(candidate);
    }
    if (addClosurePoint)
      hullPoints.push(hullPoints[0]);
  }
  /**
   * Return (clones of) points in data[] with min and max x and y parts.
   * @param data array to examine.
   */
  public static minMaxPoints(data: Point3d[]): { minXPoint: Point3d, maxXPoint: Point3d, minYPoint: Point3d, maxYPoint: Point3d } | undefined {
    if (data.length === 0)
      return undefined;
    const result = { minXPoint: data[0].clone(), maxXPoint: data[0].clone(), minYPoint: data[0].clone(), maxYPoint: data[0].clone() };
    let q;
    for (let i = 1; i < data.length; i++) {
      q = data[i];
      if (q.x < result.minXPoint.x) result.minXPoint.setFromPoint3d(q);
      if (q.x > result.maxXPoint.x) result.maxXPoint.setFromPoint3d(q);
      if (q.y < result.minYPoint.y) result.minYPoint.setFromPoint3d(q);
      if (q.y > result.maxYPoint.y) result.maxYPoint.setFromPoint3d(q);
    }
    return result;
  }
}
