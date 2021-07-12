/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Polyface
 */

import { Geometry } from "../Geometry";
import { BarycentricTriangle } from "../geometry3d/BarycentricTriangle";
import { IndexedXYZCollection } from "../geometry3d/IndexedXYZCollection";
import { Point3d } from "../geometry3d/Point3dVector3d";

/**
 * `TriangleCandidate` is a `BarycentricTriangle` with additional application-specific label data:
 * * `quality` = numeric indicator of quality (e.g. aspect ratio of this triangle or a combination with other triangles)
 * * `isValid` = boolean flag.
 * * `id` = application specific identifier
 * @internal
 */
export class TriangleCandidate extends BarycentricTriangle {
  private _quality: number;
  private _isValid: boolean;
  public id: number;
  private constructor(point0: Point3d, point1: Point3d, point2: Point3d, id: number, quality: number, isValid: boolean) {
    super(point0, point1, point2);
    this._isValid = isValid;
    this._quality = quality;
    this.id = id;
  }
  /**
   * Copy all coordinate and label data from `other` to this.
   * @param other source triangle
   */
  public override setFrom(other: TriangleCandidate): TriangleCandidate {
    super.setFrom(other);
    this._isValid = other._isValid;
    this._quality = other._quality;
    this.id = other.id;
    return this;
  }

  /** Create (always) a TriangleCandidate.
   * * Access points from multiple `IndexedXYZCollection`
   * * mark invalid if any indices are invalid.
   */
  public static createFromIndexedXYZ(source0: IndexedXYZCollection, index0: number, source1: IndexedXYZCollection, index1: number, source2: IndexedXYZCollection, index2: number, id: number, result?: TriangleCandidate): TriangleCandidate {
    if (!result)
      result = new TriangleCandidate(Point3d.create(), Point3d.create(), Point3d.create(), id, 0.0, false);
    result.id = id;
    let numValid = 0;
    if (undefined !== source0.getPoint3dAtCheckedPointIndex(index0, result.points[0]))
      numValid++;
    if (undefined !== source1.getPoint3dAtCheckedPointIndex(index1, result.points[1]))
      numValid++;
    if (undefined !== source2.getPoint3dAtCheckedPointIndex(index2, result.points[2]))
      numValid++;
    if (numValid === 3)
      result.updateAspectRatio();
    else
      result.markInvalid();
    return result;
  }
  /** (property) return the validity flag. */
  public get isValid(): boolean { return this._isValid; }
  /**
   * * Mark this triangle invalid.
   * * optionally set aspect ratio.
   * * points are not changed
   * @param aspectRatio
   */
  public markInvalid(quality?: number) {
    this._isValid = false;
    if (quality !== undefined)
      this._quality = quality;
  }
  /**
   * * Recompute the aspect ratio.
   * * Mark invalid if aspect ratio is 0 or negative.
   */
  public updateAspectRatio() {
    this._quality = super.aspectRatio;
    this._isValid = this._quality > 0.0;
  }
  /**
   * Clone all coordinate and label data.
   * @param result optional preallocated `TriangleCandidate`
   */
  public override clone(result?: TriangleCandidate): TriangleCandidate {
    if (result)
      return result.setFrom(this);
    return new TriangleCandidate(this.points[0].clone(), this.points[1].clone(), this.points[2].clone(), this.id, this._quality, this._isValid);
  }
  /**
   * Return a `TriangleCandidate` with
   *  * coordinate data and labels from `candidateA`
   *  * LOWER quality of the two candidates.
   *  * quality reduced by 1 if triangles have opposing normals (negative dot product of the two normals)
   * @param candidateA candidate known to be valid
   * @param candidateB candidate that may by valid
   * @param result copy of candidate A, but if candidateB is valid the result aspect ratio is reduced (a) to the minimum of the two ratios and then (b) reduced by 1 if orientations clash.
   */
  public static copyWithLowerQuality(candidateA: TriangleCandidate, candidateB: TriangleCandidate, result?: TriangleCandidate): TriangleCandidate {
    result = candidateA.clone(result);
    if (candidateB.isValid) {
      const dot = candidateA.dotProductOfCrossProductsFromOrigin(candidateB);
      result._quality = Geometry.minXY(candidateA.aspectRatio, candidateB.aspectRatio);
      if (dot < 0.0)
        result._quality -= 1.0;
    }
    return result;
  }
  /**
   * choose better aspect ratio of triangle, other.
   * @param triangle known valid triangle, to be updated
   * @param other candidate replacement
   */
  public static updateIfOtherHasHigherQuality(triangle: TriangleCandidate, other: TriangleCandidate) {
    if (other.isValid && other._quality > triangle._quality)
      triangle.setFrom(other);
  }
}
