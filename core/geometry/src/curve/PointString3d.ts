/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */

import { BeJSONFunctions, Geometry } from "../Geometry";
import { GeometryHandler } from "../geometry3d/GeometryHandler";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/Plane3dByOriginAndUnitNormal";
import { Point3d } from "../geometry3d/Point3dVector3d";
import { Point3dArray } from "../geometry3d/PointHelpers";
import { Range3d } from "../geometry3d/Range";
import { Transform } from "../geometry3d/Transform";
import { GeometryQuery } from "./GeometryQuery";

/* eslint-disable @typescript-eslint/naming-convention, no-empty */

/**
 * A PointString3d is an array of points.
 * * PointString3D is first class (displayable, possibly persistent) geometry derived from the GeometryQuery base class.
 * * The various points in the PointString3d are NOT connected by line segments for display or other calculations.
 * @public
 */
export class PointString3d extends GeometryQuery implements BeJSONFunctions {
  /** String name for schema properties */
  public readonly geometryCategory = "pointCollection";

  /** Test if `other` is a PointString3d */
  public isSameGeometryClass(other: GeometryQuery): boolean { return other instanceof PointString3d; }
  private _points: Point3d[];
  /** return a clone of the points array. */
  public get points(): Point3d[] { return this._points; }
  private constructor() {
    super();
    this._points = [];
  }
  /** Clone and apply a transform. */
  public cloneTransformed(transform: Transform): PointString3d {  // we know tryTransformInPlace succeeds.
    const c = this.clone();
    c.tryTransformInPlace(transform);
    return c;
  }
  private static flattenArray(arr: any): any {
    return arr.reduce((flat: any, toFlatten: any) => {
      return flat.concat(Array.isArray(toFlatten) ? PointString3d.flattenArray(toFlatten) : toFlatten);
    }, []);
  }
  /** Create a PointString3d from points. */
  public static create(...points: any[]): PointString3d {
    const result = new PointString3d();
    result.addPoints(points);
    return result;
  }

  /** Add multiple points to the PointString3d */
  public addPoints(...points: any[]) {
    const toAdd: any[] = PointString3d.flattenArray(points);
    for (const p of toAdd) {
      if (p instanceof Point3d)
        this._points.push(p);
    }
  }
  /** Add a single point to the PointString3d */
  public addPoint(point: Point3d) {
    this._points.push(point);
  }
  /** Remove the last point added to the PointString3d */
  public popPoint() {
    this._points.pop();
  }

  /** Replace this PointString3d's point array by a clone of the array in `other` */
  public setFrom(other: PointString3d) {
    this._points = Point3dArray.clonePoint3dArray(other._points);
  }
  /** Create from an array of Point3d */
  public static createPoints(points: Point3d[]): PointString3d {
    const ps = new PointString3d();
    ps._points = Point3dArray.clonePoint3dArray(points);
    return ps;
  }
  /** Create a PointString3d from xyz coordinates packed in a Float64Array */
  public static createFloat64Array(xyzData: Float64Array): PointString3d {
    const ps = new PointString3d();
    for (let i = 0; i + 3 <= xyzData.length; i += 3)
      ps._points.push(Point3d.create(xyzData[i], xyzData[i + 1], xyzData[i + 2]));
    return ps;
  }
  /** Return a deep clone. */
  public clone(): PointString3d {
    const retVal = new PointString3d();
    retVal.setFrom(this);
    return retVal;
  }
  /** Replace this instance's points by those from a json array, e.g. `[[1,2,3], [4,2,2]]` */
  public setFromJSON(json?: any) {
    this._points.length = 0;
    if (Array.isArray(json)) {
      let xyz;
      for (xyz of json)
        this._points.push(Point3d.fromJSON(xyz));
    }
  }
  /**
   * Convert an PointString3d to a JSON object.
   * @return {*} [[x,y,z],...[x,y,z]]
   */
  public toJSON(): any {
    const value = [];
    for (const p of this._points) value.push(p.toJSON());
    return value;
  }
  /** Create a PointString3d from a json array, e.g. `[[1,2,3], [4,2,2]]` */
  public static fromJSON(json?: any): PointString3d {
    const ps = new PointString3d(); ps.setFromJSON(json); return ps;
  }
  /** Access a single point by index. */
  public pointAt(i: number, result?: Point3d): Point3d | undefined {
    if (i >= 0 && i < this._points.length) {
      if (result) { result.setFrom(this._points[i]); return result; }
      return this._points[i].clone();
    }
    return undefined;
  }
  /** Return the number of points. */
  public numPoints(): number { return this._points.length; }

  /** Reverse the point order */
  public reverseInPlace(): void {
    if (this._points.length >= 2) {
      let i0 = 0;
      let i1 = this._points.length - 1;
      while (i0 < i1) {
        const a = this._points[i0];
        this._points[i1] = this._points[i0];
        this._points[i0] = a;
        i0++;
        i1--;
      }
    }
  }
  /** Return the number of points. */
  public tryTransformInPlace(transform: Transform): boolean {
    transform.multiplyPoint3dArrayInPlace(this._points);
    return true;
  }
  /** Return the index and coordinates of the closest point to spacePoint. */
  public closestPoint(spacePoint: Point3d): { index: number, xyz: Point3d } {
    const result = { index: -1, xyz: Point3d.create() };
    const index = Point3dArray.closestPointIndex(this._points, spacePoint);
    if (index >= 0) {
      result.index = index;
      result.xyz.setFrom(this._points[index]);
    }
    return result;
  }
  /** Return true if all points are in the given plane. */
  public isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean {
    return Point3dArray.isCloseToPlane(this._points, plane, Geometry.smallMetricDistance);
  }
  /** Extend a range to include the points in this PointString3d. */
  public extendRange(rangeToExtend: Range3d, transform?: Transform): void {
    rangeToExtend.extendArray(this._points, transform);
  }
  /** Return true if corresponding points are almost equal. */
  public override isAlmostEqual(other: GeometryQuery): boolean {
    if (!(other instanceof PointString3d))
      return false;
    return Point3dArray.isAlmostEqual(this._points, other._points);
  }
  /** Reduce to empty set of points. */
  public clear() { this._points.length = 0; }
  /** Second step of double dispatch:  call `handler.handlePointString(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handlePointString3d(this);
  }

}
