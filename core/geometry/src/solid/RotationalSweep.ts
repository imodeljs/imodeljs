/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Solid
 */

import { CurveCollection } from "../curve/CurveCollection";
import { GeometryQuery } from "../curve/GeometryQuery";
import { StrokeOptions } from "../curve/StrokeOptions";
import { AxisOrder, Geometry } from "../Geometry";
import { Angle } from "../geometry3d/Angle";
import { GeometryHandler } from "../geometry3d/GeometryHandler";
import { Matrix3d } from "../geometry3d/Matrix3d";
import { Range3d } from "../geometry3d/Range";
import { Ray3d } from "../geometry3d/Ray3d";
import { Transform } from "../geometry3d/Transform";
import { SolidPrimitive } from "./SolidPrimitive";
import { SweepContour } from "./SweepContour";

/**
 * A LinearSweep is
 * * A planar contour (any Loop, Path, or parityRegion)
 * * An axis vector.
 *   * The planar contour is expected to be in the plane of the axis vector
 *   * The contour may have points and/or lines that are on the axis, but otherwise is entirely on one side of the axis.
 * * A sweep angle.
 * @public
 */
export class RotationalSweep extends SolidPrimitive {
  /** String name for schema properties */
  public readonly solidPrimitiveType = "rotationalSweep";

  private _contour: SweepContour;
  private _normalizedAxis: Ray3d;
  private _sweepAngle: Angle;
  private constructor(contour: SweepContour, normalizedAxis: Ray3d, sweepAngle: Angle, capped: boolean) {
    super(capped);
    this._contour = contour;
    this._normalizedAxis = normalizedAxis;
    this.capped = capped;
    this._sweepAngle = sweepAngle;
  }
  /** Create a rotational sweep. */
  public static create(contour: CurveCollection, axis: Ray3d, sweepAngle: Angle, capped: boolean): RotationalSweep | undefined {
    if (!axis.direction.normalizeInPlace()) return undefined;
    const sweepable = SweepContour.createForRotation(contour, axis);
    if (!sweepable)
      return undefined;
    return new RotationalSweep(sweepable, axis, sweepAngle.clone(), capped);
  }

  /** Return a coordinate frame (right handed unit vectors)
   * * origin at origin of rotation ray
   * * z direction along the rotation ray.
   * * y direction perpendicular to the base contour plane
   */
  public getConstructiveFrame(): Transform | undefined {
    const contourPerpendicular = this._contour.localToWorld.matrix.columnZ();
    const axes = Matrix3d.createRigidFromColumns(contourPerpendicular, this._normalizedAxis.direction, AxisOrder.YZX);
    if (axes) {
      return Transform.createOriginAndMatrix(this._normalizedAxis.origin, axes);
    }
    return undefined;
  }
  /** return clone of (not reference to) the axis vector. */
  public cloneAxisRay(): Ray3d { return this._normalizedAxis.clone(); }
  /** Return (REFERENCE TO) the swept curves. */
  public getCurves(): CurveCollection { return this._contour.curves; }
  /** Return (REFERENCE TO) the swept curves with containing plane markup. */
  public getSweepContourRef(): SweepContour { return this._contour; }
  /** Return the sweep angle. */
  public getSweep(): Angle { return this._sweepAngle.clone(); }
  /** Test if `other` is a `RotationalSweep` */
  public isSameGeometryClass(other: any): boolean { return other instanceof RotationalSweep; }
  /** Test for same axis, capping, and swept geometry. */
  public override isAlmostEqual(other: GeometryQuery): boolean {
    if (other instanceof RotationalSweep) {
      return this._contour.isAlmostEqual(other._contour)
        && this._normalizedAxis.isAlmostEqual(other._normalizedAxis)
        && this.capped === other.capped;
    }
    return false;
  }
  /** return a deep clone */
  public clone(): RotationalSweep {
    return new RotationalSweep(this._contour.clone(), this._normalizedAxis.clone(), this._sweepAngle.clone(), this.capped);
  }
  /** Transform the contour and axis */
  public tryTransformInPlace(transform: Transform): boolean {
    if (!transform.matrix.isSingular()
      && this._contour.tryTransformInPlace(transform)) {
      this._normalizedAxis.transformInPlace(transform);
      return this._normalizedAxis.direction.normalizeInPlace();
    }
    return false;
  }
  /** return a cloned transform. */
  public cloneTransformed(transform: Transform): RotationalSweep {
    const result = this.clone();
    result.tryTransformInPlace(transform);
    return result;
  }
  /** Dispatch to strongly typed handler  `handler.handleRotationalSweep(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleRotationalSweep(this);
  }
  /** Return a transform that rotates around the rotational axis by a fraction of the total sweep. */
  public getFractionalRotationTransform(vFraction: number, result?: Transform): Transform {
    const radians = this._sweepAngle.radians * vFraction;
    const rotation = Transform.createFixedPointAndMatrix(this._normalizedAxis.origin,
      Matrix3d.createRotationAroundVector(this._normalizedAxis.direction, Angle.createRadians(radians),
        result ? result.matrix : undefined) as Matrix3d);
    return rotation;
  }
  /**
   * Return the curves of a constant-v section of the solid.
   * @param vFraction fractional position along the sweep direction
   */
  public constantVSection(vFraction: number): CurveCollection | undefined {
    const section = this._contour.curves.clone();
    if (section) {
      section.tryTransformInPlace(this.getFractionalRotationTransform(vFraction));
    }
    return section;
  }
  /** Extend range using sampled points on the surface. */
  public extendRange(range: Range3d, transform?: Transform) {
    const degreeStep = 360 / 32;
    const options = StrokeOptions.createForCurves();
    options.angleTol = Angle.createDegrees(degreeStep);
    const strokes = this._contour.curves.cloneStroked(options);
    const numStep = Geometry.stepCount(degreeStep, this._sweepAngle.degrees, 4, 32);
    const stepTransform = Transform.createIdentity();
    if (transform) {
      const compositeTransform = Transform.createIdentity();
      for (let i = 0; i <= numStep; i++) {
        transform.multiplyTransformTransform(this.getFractionalRotationTransform(i / numStep, stepTransform), compositeTransform);
        strokes.extendRange(range, compositeTransform);
      }

    } else {
      for (let i = 0; i <= numStep; i++)
        strokes.extendRange(range, this.getFractionalRotationTransform(i / numStep, stepTransform));
    }
  }
  /**
   * @return true if this is a closed volume.
   */
  public get isClosedVolume(): boolean {
    return this.capped || this._sweepAngle.isFullCircle;
  }
}
