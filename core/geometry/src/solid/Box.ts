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
import { Geometry } from "../Geometry";
import { GeometryHandler } from "../geometry3d/GeometryHandler";
import { Matrix3d } from "../geometry3d/Matrix3d";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Range3d } from "../geometry3d/Range";
import { Transform } from "../geometry3d/Transform";
import { SolidPrimitive } from "./SolidPrimitive";

/**
 * A box-like solid defined by
 * * A local coordinate frame
 *   * (0,0,0) is left lower rear corner of box (considering "left" to reference x, "lower" to reference y, "rear and front" to reference z=0 and z=1)
 *   * (0,0,1) is left lower front corner.
 *   * (baseX,baseY,z) is right upper corner at z
 *   * note that the frame x and y columns are usually unit vectors in local space, but z is full rear to front vector
 * * The separate values for base and top x and y allow the box to be a "view frustum" with parallel back and front planes but independent x and y bellows effects.
 * @public
 */
export class Box extends SolidPrimitive {
  /** String name for schema properties */
  public readonly solidPrimitiveType = "box";

  private _localToWorld: Transform;
  private _baseX: number;
  private _baseY: number;
  private _topX: number;
  private _topY: number;

  protected constructor(map: Transform,
    baseX: number, baseY: number, topX: number, topY: number, capped: boolean) {
    super(capped);
    this._localToWorld = map;
    this._baseX = baseX;
    this._baseY = baseY;
    this._topX = topX;
    this._topY = topY;
  }
  /** Return a clone */
  public clone(): Box {
    return new Box(this._localToWorld.clone(), this._baseX, this._baseY, this._topX, this._topY, this.capped);
  }

  /** Return a coordinate frame (right handed unit vectors)
   * * origin lower left of box
   * * x direction on base rectangle x edge
   * * y direction in base rectangle
   * * z direction perpendicular
   */
  public getConstructiveFrame(): Transform | undefined {
    return this._localToWorld.cloneRigid();
  }
  /** Apply the transform to the box's `localToWorld` frame.
   * * Note that this may make the frame nonrigid.
   */
  public tryTransformInPlace(transform: Transform): boolean {
    if (transform.matrix.isSingular())
      return false;
    transform.multiplyTransformTransform(this._localToWorld, this._localToWorld);
    return true;
  }
  /** Clone the box and immediately apply `transform` to the local frame of the clone. */
  public cloneTransformed(transform: Transform): Box | undefined {
    const result = this.clone();
    transform.multiplyTransformTransform(result._localToWorld, result._localToWorld);
    return result;
  }

  /**
   * Create a new box from vector and size daa.
   * @param baseOrigin Origin of base rectangle
   * @param vectorX  Direction for base rectangle
   * @param vectorY Direction for base rectangle
   * @param topOrigin origin of top rectangle
   * @param baseX size factor for base rectangle (multiplies vectorX)
   * @param baseY size factor for base rectangle (multiplies vectorY)
   * @param topX size factor for top rectangle (multiplies vectorX)
   * @param topY size factor for top rectangle (multiplies vectorY)
   * @param capped true to define top and bottom closure caps
   */
  public static createDgnBox(baseOrigin: Point3d, vectorX: Vector3d, vectorY: Vector3d,
    topOrigin: Point3d,
    baseX: number, baseY: number, topX: number, topY: number,
    capped: boolean): Box | undefined {
    const vectorZ = baseOrigin.vectorTo(topOrigin);
    const localToWorld = Transform.createOriginAndMatrixColumns(baseOrigin, vectorX, vectorY, vectorZ);
    return new Box(localToWorld, baseX, baseY, topX, topY, capped);
  }

  /**
   * Create a new box with xy directions taken from columns of the `axes` matrix.
   * @param baseOrigin Origin of base rectangle
   * @param axes  Direction for base rectangle
   * @param topOrigin origin of top rectangle
   * @param baseX size factor for base rectangle (multiplies vectorX)
   * @param baseY size factor for base rectangle (multiplies vectorY)
   * @param topX size factor for top rectangle (multiplies vectorX)
   * @param topY size factor for top rectangle (multiplies vectorY)
   * @param capped true to define top and bottom closure caps
   */
  public static createDgnBoxWithAxes(baseOrigin: Point3d, axes: Matrix3d,
    topOrigin: Point3d,
    baseX: number, baseY: number, topX: number, topY: number,
    capped: boolean): Box | undefined {
    return Box.createDgnBox(baseOrigin, axes.columnX(), axes.columnY(), topOrigin,
      baseX, baseY, topX, topY, capped);
  }

  /**
   * Create an axis-aligned `Box` primitive for a range.
   * @param range range corners Origin of base rectangle
   * @param capped true to define top and bottom closure caps
   */
  public static createRange(range: Range3d, capped: boolean): Box | undefined {
    if (!range.isNull) {
      const lowPoint = range.low;
      const xSize = range.xLength();
      const ySize = range.yLength();
      const zPoint = range.low.clone();
      zPoint.z = zPoint.z + range.zLength();
      return Box.createDgnBox(
        lowPoint,
        Vector3d.unitX(), Vector3d.unitY(),
        zPoint,
        xSize, ySize, xSize, ySize, capped);
    }
    return undefined;
  }
  /** (property accessor) return the x length at z = 0 */
  public getBaseX(): number { return this._baseX; }
  /** (property accessor) return the y length at z = 0 */
  public getBaseY(): number { return this._baseY; }
  /** (property accessor) return the x length at z = 1 */
  public getTopX(): number { return this._topX; }
  /** (property accessor) return the x length at z = 1 */
  public getTopY(): number { return this._topY; }
  /** (property accessor) return the local coordinates point (0,0,0) to world */
  public getBaseOrigin(): Point3d { return this._localToWorld.multiplyXYZ(0, 0, 0); }
  /** (property accessor) return the local coordinates point (0,0,1) to world */
  public getTopOrigin(): Point3d { return this._localToWorld.multiplyXYZ(0, 0, 1); }
  /** (property accessor) return the local coordinate frame x vector */
  public getVectorX(): Vector3d { return this._localToWorld.matrix.columnX(); }
  /** (property accessor) return the local coordinate frame y vector */
  public getVectorY(): Vector3d { return this._localToWorld.matrix.columnY(); }
  /** (property accessor) return the local coordinate frame z vector */
  public getVectorZ(): Vector3d { return this._localToWorld.matrix.columnZ(); }
  /** Test of `other` is also of class `Box` */
  public isSameGeometryClass(other: any): boolean { return other instanceof Box; }
  /** test for near equality */
  public override isAlmostEqual(other: GeometryQuery): boolean {
    if (other instanceof Box) {
      if (this.capped !== other.capped) return false;
      if (!this._localToWorld.isAlmostEqual(other._localToWorld)) return false;
      return Geometry.isSameCoordinate(this._baseX, other._baseX)
        && Geometry.isSameCoordinate(this._baseY, other._baseY)
        && Geometry.isSameCoordinate(this._topX, other._topX)
        && Geometry.isSameCoordinate(this._topY, other._topY);
    }
    return false;
  }
  /** Second step of double dispatch:  call `handler.handleBox(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleBox(this);
  }
  /** Return strokes of the cross-section rectangle at local z coordinate */
  public strokeConstantVSection(zFraction: number): LineString3d {
    const ax = Geometry.interpolate(this._baseX, zFraction, this._topX);
    const ay = Geometry.interpolate(this._baseY, zFraction, this._topY);
    const result = LineString3d.create();
    const transform = this._localToWorld;
    const workPoint = Point3d.create();
    transform.multiplyXYZ(0, 0, zFraction, workPoint);
    result.addPoint(workPoint);
    transform.multiplyXYZ(ax, 0, zFraction, workPoint);
    result.addPoint(workPoint);
    transform.multiplyXYZ(ax, ay, zFraction, workPoint);
    result.addPoint(workPoint);
    transform.multiplyXYZ(0, ay, zFraction, workPoint);
    result.addPoint(workPoint);
    transform.multiplyXYZ(0, 0, zFraction, workPoint);
    result.addPoint(workPoint);
    return result;
  }
  /**
   * Returns the 8 corners in x fastest, then y, finally z lexical order.
   */
  public getCorners(): Point3d[] {
    const transform = this._localToWorld;
    const ax = this._baseX;
    const ay = this._baseY;
    const bx = this._topX;
    const by = this._topY;
    return [
      transform.multiplyXYZ(0, 0, 0),
      transform.multiplyXYZ(ax, 0, 0),
      transform.multiplyXYZ(0, ay, 0),
      transform.multiplyXYZ(ax, ay, 0),
      transform.multiplyXYZ(0, 0, 1),
      transform.multiplyXYZ(bx, 0, 1),
      transform.multiplyXYZ(0, by, 1),
      transform.multiplyXYZ(bx, by, 1),
    ];
  }

  /**
   * Consider the box sides (not top and bottom) as a (u,v) surface with
   * * v = 0 as the z=0 local plane
   * * v = 1 as the z=1 local plane
   * Return the (rectangular) section at fractional v
   */
  public constantVSection(zFraction: number): CurveCollection {
    const ls = this.strokeConstantVSection(zFraction);
    return Loop.create(ls);
  }
  /** Extend  `rangeToExtend` by each of the 8 corners */
  public extendRange(rangeToExtend: Range3d, transform?: Transform): void {
    const boxTransform = this._localToWorld;
    const ax = this._baseX;
    const ay = this._baseY;
    const bx = this._topX;
    const by = this._topY;
    if (transform) {
      rangeToExtend.extendTransformTransformedXYZ(transform, boxTransform, 0, 0, 0);
      rangeToExtend.extendTransformTransformedXYZ(transform, boxTransform, ax, 0, 0);
      rangeToExtend.extendTransformTransformedXYZ(transform, boxTransform, 0, ay, 0);
      rangeToExtend.extendTransformTransformedXYZ(transform, boxTransform, ax, ay, 0);
      rangeToExtend.extendTransformTransformedXYZ(transform, boxTransform, 0, 0, 1);
      rangeToExtend.extendTransformTransformedXYZ(transform, boxTransform, bx, 0, 1);
      rangeToExtend.extendTransformTransformedXYZ(transform, boxTransform, 0, by, 1);
      rangeToExtend.extendTransformTransformedXYZ(transform, boxTransform, bx, by, 1);
    } else {
      rangeToExtend.extendTransformedXYZ(boxTransform, 0, 0, 0);
      rangeToExtend.extendTransformedXYZ(boxTransform, ax, 0, 0);
      rangeToExtend.extendTransformedXYZ(boxTransform, 0, ay, 0);
      rangeToExtend.extendTransformedXYZ(boxTransform, ax, ay, 0);
      rangeToExtend.extendTransformedXYZ(boxTransform, 0, 0, 1);
      rangeToExtend.extendTransformedXYZ(boxTransform, bx, 0, 1);
      rangeToExtend.extendTransformedXYZ(boxTransform, 0, by, 1);
      rangeToExtend.extendTransformedXYZ(boxTransform, bx, by, 1);
    }
  }
  /**
   * @return true if this is a closed volume.
   */
  public get isClosedVolume(): boolean {
    return this.capped;
  }
}
