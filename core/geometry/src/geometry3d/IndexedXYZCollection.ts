/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module ArraysAndInterfaces
 */

// import { Point2d } from "./Geometry2d";
import { Point3d, Vector3d } from "./Point3dVector3d";
import { Range3d } from "./Range";
/* eslint-disable @typescript-eslint/naming-convention, no-empty */
import { XYAndZ } from "./XYZProps";

class PointsIterator implements Iterator<Point3d>, Iterable<Point3d> {
  private readonly _collection: IndexedXYZCollection;
  private _curIndex = -1;

  public constructor(collection: IndexedXYZCollection) {
    this._collection = collection;
  }

  public next(): IteratorResult<Point3d> {
    if (++this._curIndex >= this._collection.length) {
      // The ECMAScript spec states that value=undefined is valid if done=true. The TypeScript interface violates the spec hence the cast to any and back below.
      return { done: true } as any as IteratorResult<Point3d>;
    }

    return {
      value: this._collection.getPoint3dAtUncheckedPointIndex(this._curIndex),
      done: false,
    };
  }

  public [Symbol.iterator](): Iterator<Point3d> { return this; }
}
/**
 * abstract base class for read-only access to XYZ data with indexed reference.
 * * This allows algorithms to work with Point3d[] or GrowableXYZ.
 * ** GrowableXYZArray implements these for its data.
 * ** Point3dArrayCarrier carries a (reference to) a Point3d[] and implements the methods with calls on that array reference.
 * * In addition to "point by point" accessors, there abstract members compute commonly useful vector data "between points".
 * * Methods that create vectors among multiple indices allow callers to avoid creating temporaries.
 * @public
 */
export abstract class IndexedXYZCollection {
  /**
   * Return the point at `index` as a strongly typed Point3d.
   * @param index index of point within the array
   * @param result caller-allocated destination
   * @returns undefined if the index is out of bounds
   */
  public abstract getPoint3dAtCheckedPointIndex(index: number, result?: Point3d): Point3d | undefined;
  /**
   * Return the point at `index` as a strongly typed Point3d, without checking the point index validity.
   * @param index index of point within the array
   * @param result caller-allocated destination
   * @returns undefined if the index is out of bounds
   */
  public abstract getPoint3dAtUncheckedPointIndex(index: number, result?: Point3d): Point3d;
  /**
   * Get from `index` as a strongly typed Vector3d.
   * @param index index of point within the array
   * @param result caller-allocated destination
   * @returns undefined if the index is out of bounds
   */
  public abstract getVector3dAtCheckedVectorIndex(index: number, result?: Vector3d): Vector3d | undefined;
  /**
   * Return a vector from the point at `indexA` to the point at `indexB`
   * @param indexA index of point within the array
   * @param indexB index of point within the array
   * @param result caller-allocated vector.
   * @returns undefined if either index is out of bounds
   */
  public abstract vectorIndexIndex(indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
  /**
   * Return a vector from `origin` to the point at `indexB`
   * @param origin origin for vector
   * @param indexB index of point within the array
   * @param result caller-allocated vector.
   * @returns undefined if index is out of bounds
   */
  public abstract vectorXYAndZIndex(origin: XYAndZ, indexB: number, result?: Vector3d): Vector3d | undefined;

  /**
   * Return the cross product of the vectors from `origin` to points at `indexA` and `indexB`
   * @param origin origin for vector
   * @param indexA index of first target within the array
   * @param indexB index of second target within the array
   * @param result caller-allocated vector.
   * @returns undefined if either index is out of bounds
   */
  public abstract crossProductXYAndZIndexIndex(origin: XYAndZ, indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
  /**
   * Return the cross product of vectors from `origin` to points at `indexA` and `indexB`
   * @param origin origin for vector
   * @param indexA index of first target within the array
   * @param indexB index of second target within the array
   * @param result optional caller-allocated vector.
   * @returns undefined if either index is out of bounds
   */
  public abstract crossProductIndexIndexIndex(origin: number, indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
  /**
   * Return the cross product of vectors from origin point at `indexA` to target points at `indexB` and `indexC`
   * @param origin index of origin
   * @param indexA index of first target within the array
   * @param indexB index of second target within the array
   * @param result caller-allocated vector.
   * @returns return true if indexA, indexB both valid
   */
  public abstract accumulateCrossProductIndexIndexIndex(origin: number, indexA: number, indexB: number, result: Vector3d): void;

  /**
   * read-only property for number of XYZ in the collection.
   */
  public abstract get length(): number;
  /**
   * Return distance squared between indicated points.
   * @param index0 first point index
   * @param index1 second point index
   */
  public abstract distanceSquaredIndexIndex(index0: number, index1: number): number | undefined;
  /**
   * Return distance between indicated points.
   * @param index0 first point index
   * @param index1 second point index
   */
  public abstract distanceIndexIndex(index0: number, index1: number): number | undefined;

  /** Adjust index into range by modulo with the length. */
  public cyclicIndex(i: number): number {
    return (i % this.length);
  }
  /** Return the range of the points. */
  public getRange(): Range3d {
    const range = Range3d.createNull();
    const n = this.length;
    const point = Point3d.create();
    for (let i = 0; i < n; i++) {
      this.getPoint3dAtUncheckedPointIndex(i, point);
      range.extendPoint(point);
    }
    return range;
  }
  /** Accumulate scale times the x,y,z values at index.
   * * No action if index is out of bounds.
   */
  public abstract accumulateScaledXYZ(index: number, scale: number, sum: Point3d): void;

  /** access x of indexed point */
  public abstract getXAtUncheckedPointIndex(pointIndex: number): number;

  /** access y of indexed point */
  public abstract getYAtUncheckedPointIndex(pointIndex: number): number;

  /** access z of indexed point */
  public abstract getZAtUncheckedPointIndex(pointIndex: number): number;

  /** Return iterator over the points in this collection. Usage:
   * ```ts
   *  for (const point: Point3d of collection.points) { ... }
   * ```
   */
  public get points(): Iterable<Point3d> {
    return new PointsIterator(this);
  }
  /** convert to Point3d[] */
  public getArray(): Point3d[]{
    const result = [];
    for (const p of this.points)
      result.push(p);
    return result;
  }
}
/**
 * abstract base class extends IndexedXYZCollection, adding methods to push, peek, and pop, and rewrite.
 * @public
 */
export abstract class IndexedReadWriteXYZCollection extends IndexedXYZCollection {
  /** push a (clone of) point onto the collection
   * * point itself is not pushed -- xyz data is extracted into the native form of the collection.
   */
  public abstract push(data: XYAndZ): void;
  /**
   * push a new point (given by coordinates) onto the collection
   * @param x x coordinate
   * @param y y coordinate
   * @param z z coordinate
   */
  public abstract pushXYZ(x?: number, y?: number, z?: number): void;
  /** extract the final point */
  public abstract back(result?: Point3d): Point3d | undefined;
  /** extract the first point */
  public abstract front(result?: Point3d): Point3d | undefined;
  /** remove the final point. */
  public abstract pop(): void;
  /**  clear all entries */
  public abstract clear(): void;
  /** reverse the points in place. */
  public abstract reverseInPlace(): void;
}
