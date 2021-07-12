/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ArraysAndInterfaces
 */

import { IndexedReadWriteXYZCollection } from "./IndexedXYZCollection";
import { Point3d, Vector3d } from "./Point3dVector3d";
import { XYAndZ } from "./XYZProps";

/**
 * Helper object to access members of a Point3d[] in geometric calculations.
 * * The collection holds only a reference to the actual array.
 * * The actual array may be replaced by the user as needed.
 * * When replaced, there is no cached data to be updated.
 * @public
 */
export class Point3dArrayCarrier extends IndexedReadWriteXYZCollection {
  /** reference to array being queried. */
  public data: Point3d[];
  /** CAPTURE caller supplied array ... */
  public constructor(data: Point3d[]) {
    super();
    this.data = data;
  }
  /** test if `index` is a valid index into the array. */
  public isValidIndex(index: number): boolean {
    return index >= 0 && index < this.data.length;
  }
  /**
   * Access by index, returning strongly typed Point3d
   * @param index index of point within the array
   * @param result caller-allocated destination
   * @returns undefined if the index is out of bounds
   */
  public getPoint3dAtCheckedPointIndex(index: number, result?: Point3d): Point3d | undefined {
    if (this.isValidIndex(index)) {
      const source = this.data[index];
      return Point3d.create(source.x, source.y, source.z, result);
    }
    return undefined;
  }
  /**
   * Access by index, returning strongly typed Point3d
   * * This returns the xyz value but NOT reference to the point in the "carried" array.
   * @param index index of point within the array
   * @param result caller-allocated destination
   * @returns undefined if the index is out of bounds
   */
  public getPoint3dAtUncheckedPointIndex(index: number, result?: Point3d): Point3d {
    const source = this.data[index];
    return Point3d.create(source.x, source.y, source.z, result);
  }
  /**
   * Access by index, returning strongly typed Vector3d
   * @param index index of point within the array
   * @param result caller-allocated destination
   * @returns undefined if the index is out of bounds
   */
  public getVector3dAtCheckedVectorIndex(index: number, result?: Vector3d): Vector3d | undefined {
    if (this.isValidIndex(index)) {
      const source = this.data[index];
      return Vector3d.create(source.x, source.y, source.z, result);
    }
    return undefined;
  }
  /** access x of indexed point */
  public getXAtUncheckedPointIndex(pointIndex: number): number {
    return this.data[pointIndex].x;
  }

  /** access y of indexed point */
  public getYAtUncheckedPointIndex(pointIndex: number): number {
    return this.data[pointIndex].y;
  }

  /** access z of indexed point */
  public getZAtUncheckedPointIndex(pointIndex: number): number {
    return this.data[pointIndex].z;
  }
  /**
   * Return a vector from the point at indexA to the point at indexB
   * @param indexA index of point within the array
   * @param indexB index of point within the array
   * @param result caller-allocated vector.
   * @returns undefined if either index is out of bounds
   */
  public vectorIndexIndex(indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined {
    if (this.isValidIndex(indexA) && this.isValidIndex(indexB))
      return Vector3d.createStartEnd(this.data[indexA], this.data[indexB], result);
    return undefined;
  }
  /**
   * Return a vector from given origin to point at indexB
   * @param origin origin for vector
   * @param indexB index of point within the array
   * @param result caller-allocated vector.
   * @returns undefined if index is out of bounds
   */
  public vectorXYAndZIndex(origin: XYAndZ, indexB: number, result?: Vector3d): Vector3d | undefined {
    if (this.isValidIndex(indexB))
      return Vector3d.createStartEnd(origin, this.data[indexB], result);
    return undefined;
  }
  /**
   * Return the cross product of vectors from origin to points at indexA and indexB
   * @param origin origin for vector
   * @param indexA index of first target within the array
   * @param indexB index of second target within the array
   * @param result caller-allocated vector.
   * @returns undefined if either index is out of bounds
   */
  public crossProductXYAndZIndexIndex(origin: XYAndZ, indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined {
    if (this.isValidIndex(indexA) && this.isValidIndex(indexB))
      return Vector3d.createCrossProductToPoints(origin, this.data[indexA], this.data[indexB], result);
    return undefined;
  }
  /**
   * Return the cross product of vectors from point at originIndex to points at indexA and indexB
   * @param originIndex index of origin
   * @param indexA index of first target within the array
   * @param indexB index of second target within the array
   * @param result caller-allocated vector.
   * @returns return true if indexA, indexB both valid
   */
  public crossProductIndexIndexIndex(originIndex: number, indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined {
    if (this.isValidIndex(originIndex) && this.isValidIndex(indexA) && this.isValidIndex(indexB))
      return Vector3d.createCrossProductToPoints(this.data[originIndex], this.data[indexA], this.data[indexB], result);
    return undefined;
  }
  /**
   * Compute the cross product of vectors from point at originIndex to points at indexA and indexB, and accumulate it to the result.
   * @param origin index of origin
   * @param indexA index of first target within the array
   * @param indexB index of second target within the array
   * @param result caller-allocated vector.
   * @returns return true if indexA, indexB both valid
   */
  public accumulateCrossProductIndexIndexIndex(originIndex: number, indexA: number, indexB: number, result: Vector3d): void {
    const data = this.data;
    if (this.isValidIndex(originIndex) && this.isValidIndex(indexA) && this.isValidIndex(indexB))
      result.addCrossProductToTargetsInPlace(data[originIndex].x, data[originIndex].y, data[originIndex].z, data[indexA].x, data[indexA].y, data[indexA].z, data[indexB].x, data[indexB].y, data[indexB].z);
  }
  /**
   * * compute the cross product from indexed origin t indexed targets targetAIndex and targetB index.
   * * accumulate it to the result.
   */
  public accumulateScaledXYZ(index: number, scale: number, sum: Point3d): void {
    if (this.isValidIndex(index)) {
      const point = this.data[index];
      sum.x += scale * point.x;
      sum.y += scale * point.y;
      sum.z += scale * point.z;
    }
  }
  /**
   * read-only property for number of XYZ in the collection.
   */
  public get length(): number {
    return this.data.length;
  }
  /** push a (clone of) point onto the collection
   * * point itself is not pushed -- xyz data is extracted into the native form of the collection.
   */
  public push(data: Point3d): void {
    this.data.push(data.clone());
  }
  /**
   * push a new point (given by coordinates) onto the collection
   * @param x x coordinate
   * @param y y coordinate
   * @param z z coordinate
   */
  public pushXYZ(x?: number, y?: number, z?: number): void {
    this.data.push(Point3d.create(x === undefined ? 0.0 : x, y === undefined ? 0.0 : y, z === undefined ? 0.0 : z));
  }
  /** extract (copy) the final point */
  public back(result?: Point3d): Point3d | undefined {
    if (this.data.length > 0) {
      return this.data[this.data.length - 1].clone(result);
    }
    return undefined;
  }
  /** extract (copy) the first point */
  public front(result?: Point3d): Point3d | undefined {
    if (this.data.length > 0) {
      return this.data[0].clone(result);
    }
    return undefined;
  }

  /** remove the final point. */
  public pop(): void {
    if (this.data.length > 0)
      this.data.pop();
  }
  /** remove all points. */
  public clear(): void {
    this.data.length = 0;
  }
  /** Reverse the points in place */
  public reverseInPlace(): void {
    this.data.reverse();
  }
  /**
   * Return distance squared between indicated points.
   * * Concrete classes may be able to implement this without creating a temporary.
   * @param index0 first point index
   * @param index1 second point index
   * @param defaultDistanceSquared distance squared to return if either point index is invalid.
   *
   */
  public distanceSquaredIndexIndex(index0: number, index1: number): number | undefined {
    const n = this.data.length;
    if (index0 >= 0 && index0 < n && index1 >= 0 && index1 < n) {
      return this.data[index0].distanceSquared(this.data[index1]);
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
  public distanceIndexIndex(index0: number, index1: number): number | undefined {
    const n = this.data.length;
    if (index0 >= 0 && index0 < n && index1 >= 0 && index1 < n) {
      return this.data[index0].distance(this.data[index1]);
    }
    return undefined;
  }
  /** Adjust index into range by modulo with the length. */
  public override cyclicIndex(i: number): number {
    return (i % this.length);
  }

}
