/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Solid
 */

import { CurveCollection } from "../curve/CurveCollection";
import { GeometryQuery } from "../curve/GeometryQuery";
import { LineString3d } from "../curve/LineString3d";
import { Loop } from "../curve/Loop";
import { Path } from "../curve/Path";
import { GeometryHandler } from "../geometry3d/GeometryHandler";
import { Vector3d } from "../geometry3d/Point3dVector3d";
import { PolygonOps } from "../geometry3d/PolygonOps";
import { Range3d } from "../geometry3d/Range";
import { Transform } from "../geometry3d/Transform";
import { XAndY } from "../geometry3d/XYZProps";
import { SolidPrimitive } from "./SolidPrimitive";
import { SweepContour } from "./SweepContour";

/**
 * A LinearSweep is a `SolidPrimitive` defined by
 * * A set of curves (any Loop, Path, or parityRegion)
 * * A sweep vector
 * If the object is "capped", the curves must be planar.
 * @public
 */
export class LinearSweep extends SolidPrimitive {
  /** String name for schema properties */
  public readonly solidPrimitiveType = "linearSweep";

  private _contour: SweepContour;
  private _direction: Vector3d;

  private constructor(contour: SweepContour, direction: Vector3d, capped: boolean) {
    super(capped);
    this._contour = contour;
    this._direction = direction;
  }
  /**
   * Create a sweep of a starting contour.
   * @param contour contour to be swept
   * @param direction sweep vector.  The contour is swept the full length of the vector.
   * @param capped true to include end caps
   */
  public static create(contour: CurveCollection, direction: Vector3d, capped: boolean): LinearSweep | undefined {
    const sweepable = SweepContour.createForLinearSweep(contour, direction);
    if (!sweepable)
      return undefined;
    return new LinearSweep(sweepable, direction, capped);
  }
  /** Create a z-direction sweep of the polyline or polygon given as xy linestring values.
   * * If not capped, the xyPoints array is always used unchanged.
   * * If capped but the xyPoints array does not close, exact closure will be enforced by one of these:
   * * * If the final point is almost equal to the first, it is replaced by the exact first point.
   * * * if the final point is not close to the first an extra point is added.
   * * If capped, the point order will be reversed if necessary to produce positive volume.
   * @param xyPoints array of xy coordinates
   * @param z z value to be used for all coordinates
   * @param zSweep the sweep distance in the z direction.
   * @param capped true if caps are to be added.
   */
  public static createZSweep(xyPoints: XAndY[], z: number, zSweep: number, capped: boolean): LinearSweep | undefined {
    const xyz = LineString3d.createXY(xyPoints, z, capped);
    if (capped) {
      xyz.addClosurePoint();
      const area = PolygonOps.areaXY(xyz.points);
      if (area * zSweep < 0.0)
        xyz.points.reverse();
    }
    const contour: CurveCollection = capped ? Loop.create(xyz) : Path.create(xyz);
    return LinearSweep.create(contour, Vector3d.create(0, 0, zSweep), capped);
  }
  /** get a reference to the swept curves */
  public getCurvesRef(): CurveCollection { return this._contour.curves; }
  /** Get a reference to the `SweepContour` carrying the plane of the curves */
  public getSweepContourRef(): SweepContour { return this._contour; }
  /** return a clone of the sweep vector */
  public cloneSweepVector(): Vector3d { return this._direction.clone(); }
  /** Test if `other` is also an instance of `LinearSweep` */
  public isSameGeometryClass(other: any): boolean { return other instanceof LinearSweep; }
  /** Return a deep clone */
  public clone(): LinearSweep {
    return new LinearSweep(this._contour.clone(), this._direction.clone(), this.capped);
  }
  /** apply a transform to the curves and sweep vector */
  public tryTransformInPlace(transform: Transform): boolean {
    if (transform.matrix.isSingular())
      return false;
    if (this._contour.tryTransformInPlace(transform)) {
      transform.multiplyVector(this._direction, this._direction);
      return true;
    }
    return false;
  }

  /** Return a coordinate frame (right handed unit vectors)
   * * origin on base contour
   * * x, y directions from base contour.
   * * z direction perpendicular
   */
  public getConstructiveFrame(): Transform | undefined {
    return this._contour.localToWorld.cloneRigid();
  }
  /** Return a transformed clone */
  public cloneTransformed(transform: Transform): LinearSweep {
    const result = this.clone();
    result.tryTransformInPlace(transform);
    return result;
  }
  /** Test for near-equality of coordinates in `other` */
  public override isAlmostEqual(other: GeometryQuery): boolean {
    if (other instanceof LinearSweep) {
      return this._contour.isAlmostEqual(other._contour)
        && this._direction.isAlmostEqual(other._direction)
        && this.capped === other.capped;
    }
    return false;
  }
  /** Invoke strongly typed `handler.handleLinearSweep(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleLinearSweep(this);
  }
  /**
   * Return the curves at a fraction along the sweep direction.
   * @param vFraction fractional position along the sweep direction
   */
  public constantVSection(vFraction: number): CurveCollection | undefined {
    const section = this._contour.curves.clone();
    if (section && vFraction !== 0.0)
      section.tryTransformInPlace(Transform.createTranslation(this._direction.scale(vFraction)));
    return section;
  }
  /** Extend `rangeToExtend` to include this geometry. */
  public extendRange(rangeToExtend: Range3d, transform?: Transform) {
    const contourRange = this._contour.curves.range(transform);
    rangeToExtend.extendRange(contourRange);
    if (transform) {
      const transformedDirection = transform.multiplyVector(this._direction);
      contourRange.low.addInPlace(transformedDirection);
      contourRange.high.addInPlace(transformedDirection);
    } else {
      contourRange.low.addInPlace(this._direction);
      contourRange.high.addInPlace(this._direction);
    }
    rangeToExtend.extendRange(contourRange);
  }
  /**
   * @return true if this is a closed volume.
   */
  public get isClosedVolume(): boolean {
    return this.capped && this._contour.curves.isAnyRegionType;
  }
}
