/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Curve
 */
import { GeometryHandler } from "../geometry3d/GeometryHandler";
import { Point3d } from "../geometry3d/Point3dVector3d";
import { Range3d } from "../geometry3d/Range";
import { Transform } from "../geometry3d/Transform";
import { GeometryQuery } from "./GeometryQuery";

/** A Coordinate is a Point3d with supporting methods from the GeometryQuery abstraction.
 * @public
 */
export class CoordinateXYZ extends GeometryQuery {
  /** String name for interface properties */
  public readonly geometryCategory = "point";

  private _xyz: Point3d;
  /** Return a (REFERENCE TO) the coordinate data. */
  public get point() { return this._xyz; }
  /**
   * @param xyz point to be CAPTURED.
   */
  private constructor(xyz: Point3d) {
    super();
    this._xyz = xyz;
  }
  /** Create a new CoordinateXYZ containing a CLONE of point */
  public static create(point: Point3d): CoordinateXYZ {
    return new CoordinateXYZ(point.clone());
  }
  /** Create a new CoordinateXYZ */
  public static createXYZ(x: number = 0, y: number = 0, z: number = 0): CoordinateXYZ {
    return new CoordinateXYZ(Point3d.create(x, y, z));
  }

  /** return the range of the point */
  public override range(): Range3d { return Range3d.create(this._xyz); }

  /** extend `rangeToExtend` to include this point (optionally transformed) */
  public extendRange(rangeToExtend: Range3d, transform?: Transform): void {
    if (transform)
      rangeToExtend.extendTransformedXYZ(transform, this._xyz.x, this._xyz.y, this._xyz.z);
    else
      rangeToExtend.extend(this._xyz);
  }
  /** Apply transform to the Coordinate's point. */
  public tryTransformInPlace(transform: Transform): boolean {
    transform.multiplyPoint3d(this._xyz, this._xyz);
    return true;
  }
  /** return a transformed clone.
   */
  public cloneTransformed(transform: Transform): GeometryQuery | undefined {
    const result = new CoordinateXYZ(this._xyz.clone());
    result.tryTransformInPlace(transform);
    return result;
  }
  /** return a clone */
  public clone(): GeometryQuery | undefined {
    return new CoordinateXYZ(this._xyz.clone());
  }
  /** return GeometryQuery children for recursive queries.
   *
   * * leaf classes do not need to implement.
   */

  /** test if (other instanceof Coordinate).  */
  public isSameGeometryClass(other: GeometryQuery): boolean {
    return other instanceof CoordinateXYZ;
  }
  /** test for exact structure and nearly identical geometry.
   *
   * *  Leaf classes must implement !!!
   * *  base class implementation recurses through children.
   * *  base implementation is complete for classes with children and no properties.
   * *  classes with both children and properties must implement for properties, call super for children.
   */
  public override isAlmostEqual(other: GeometryQuery): boolean {
    return (other instanceof CoordinateXYZ) && this._xyz.isAlmostEqual(other._xyz);
  }
  /** Second step of double dispatch:  call `handler.handleCoordinateXYZ(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleCoordinateXYZ(this);
  }
}
