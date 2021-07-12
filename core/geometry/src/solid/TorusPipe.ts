/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Solid
 */

import { Arc3d } from "../curve/Arc3d";
import { CurveCollection } from "../curve/CurveCollection";
import { GeometryQuery } from "../curve/GeometryQuery";
import { Loop } from "../curve/Loop";
import { Path } from "../curve/Path";
import { Geometry } from "../Geometry";
import { Angle } from "../geometry3d/Angle";
import { AngleSweep } from "../geometry3d/AngleSweep";
import { GeometryHandler, UVSurface, UVSurfaceIsoParametricDistance } from "../geometry3d/GeometryHandler";
import { Plane3dByOriginAndVectors } from "../geometry3d/Plane3dByOriginAndVectors";
import { Vector2d } from "../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Range3d } from "../geometry3d/Range";
import { Transform } from "../geometry3d/Transform";
import { SolidPrimitive } from "./SolidPrimitive";

/**
 * A torus pipe is a partial torus (donut).  In a local coordinate system
 * * The z axis passes through the hole.
 * * The "major hoop" arc has
 *   * vectorTheta0 = (radiusA,0,0)
 *   * vectorTheta90 = (0, radiusA,0)
 *   * The major arc point at angle theta is `C(theta) = vectorTheta0 * cos(theta) + vectorTheta90 * sin(theta)
 * * The minor hoop at theta various with phi "around the minor hoop"
 *    * (x,y,z) = C(theta) + (radiusB *cos(theta), radiusB * sin(theta)) * cos(phi) + (0,radiusB,0) * sin(phi)
 * * The stored form of the torus pipe is oriented for positive volume:
 *   * Both radii are positive, with r0 >= r1 > 0
 *   * The sweep is positive
 *   * The coordinate system has positive determinant.
 * * For uv parameterization,
 *   * u is around the minor hoop, with (0..1) mapping to phi of (0 degrees ..360 degrees)
 *   * v is along the major hoop with (0..1) mapping to theta of (0 .. sweep)
 *   * a constant v section is a full circle
 *   * a constant u section is an arc with sweep angle matching the torusPipe sweep angle.
 * @public
 */
export class TorusPipe extends SolidPrimitive implements UVSurface, UVSurfaceIsoParametricDistance {
  /** String name for schema properties */
  public readonly solidPrimitiveType = "torusPipe";

  private _localToWorld: Transform;
  private _radiusA: number;  // radius of (large) circle in xy plane
  private _radiusB: number;  // radius of (small) circle in xz plane.
  private _sweep: Angle;
  private _isReversed: boolean;

  protected constructor(map: Transform, radiusA: number, radiusB: number, sweep: Angle, capped: boolean) {
    super(capped);
    this._localToWorld = map;
    this._radiusA = radiusA;
    this._radiusB = radiusB;
    this._sweep = sweep;
    this._isReversed = false;
  }
  /** return a copy of the TorusPipe */
  public clone(): TorusPipe {
    const result = new TorusPipe(this._localToWorld.clone(), this._radiusA, this._radiusB, this._sweep.clone(), this.capped);
    result._isReversed = this._isReversed;
    return result;
  }
  /** Apply `transform` to the local coordinate system. */
  public tryTransformInPlace(transform: Transform): boolean {
    if (transform.matrix.isSingular())
      return false;
    transform.multiplyTransformTransform(this._localToWorld, this._localToWorld);
    return true;
  }
  /** Clone this TorusPipe and transform the clone */
  public cloneTransformed(transform: Transform): TorusPipe | undefined {
    const result = this.clone();
    transform.multiplyTransformTransform(result._localToWorld, result._localToWorld);
    return result;
  }
  /** Create a new `TorusPipe`
   * @param frame local to world transformation
   * @param majorRadius major hoop radius
   * @param minorRadius minor hoop radius
   * @param sweep sweep angle for major circle, with positive sweep from x axis towards y axis.
   * @param capped true for circular caps
   */
  public static createInFrame(frame: Transform, majorRadius: number, minorRadius: number, sweep: Angle, capped: boolean): TorusPipe | undefined {
    // force near-zero radii to true zero
    majorRadius = Math.abs(Geometry.correctSmallMetricDistance(majorRadius));
    minorRadius = Math.abs(Geometry.correctSmallMetricDistance(minorRadius));
    if (majorRadius < minorRadius) return undefined;
    if (majorRadius === 0.0) return undefined;
    if (minorRadius === 0.0) return undefined;

    if (sweep.isAlmostZero) return undefined;
    const xScale = 1.0;
    let yScale = 1.0;
    let zScale = 1.0;
    if (frame.matrix.determinant() < 0.0) zScale *= -1.0;
    let isReversed = false;
    const sweep1 = sweep.clone();
    if (sweep.radians < 0.0) {
      sweep1.setRadians(-sweep.radians);
      zScale *= -1.0;
      yScale *= -1.0;
      isReversed = true;
    }
    const frame1 = frame.clone();
    frame1.matrix.scaleColumns(xScale, yScale, zScale, frame1.matrix);
    const result = new TorusPipe(frame1, majorRadius, minorRadius, sweep1, capped);
    result._isReversed = isReversed;
    return result;
  }

  /** Create a TorusPipe from the typical parameters of the Dgn file */
  public static createDgnTorusPipe(center: Point3d, vectorX: Vector3d, vectorY: Vector3d, majorRadius: number, minorRadius: number,
    sweep: Angle, capped: boolean) {
    const vectorZ = vectorX.crossProduct(vectorY);
    vectorZ.scaleToLength(vectorX.magnitude(), vectorZ);
    const frame = Transform.createOriginAndMatrixColumns(center, vectorX, vectorY, vectorZ);
    return TorusPipe.createInFrame(frame, majorRadius, minorRadius, sweep, capped);
  }
  /** Create a TorusPipe from its primary arc and minor radius */
  public static createAlongArc(arc: Arc3d, minorRadius: number, capped: boolean) {
    if (!Angle.isAlmostEqualRadiansAllowPeriodShift(0.0, arc.sweep.startRadians))
      arc = arc.cloneInRotatedBasis(arc.sweep.startAngle);
    const sweepRadians = arc.sweep.sweepRadians;
    const data = arc.toScaledMatrix3d();
    const frame = Transform.createOriginAndMatrix(data.center, data.axes);
    return TorusPipe.createInFrame(frame, data.r0, minorRadius, Angle.createRadians(sweepRadians), capped);
  }

  /** Return a coordinate frame (right handed, unit axes)
   * * origin at center of major circle
   * * major circle in xy plane
   * * z axis perpendicular
   */
  public getConstructiveFrame(): Transform | undefined {
    return this._localToWorld.cloneRigid();
  }
  /** Return the center of the torus pipe (inside the donut hole) */
  public cloneCenter(): Point3d { return this._localToWorld.getOrigin(); }
  /** return the vector along the x axis (in the major hoops plane) */
  public cloneVectorX(): Vector3d { return this._localToWorld.matrix.columnX(); }
  /** return the vector along the y axis (in the major hoop plane) */
  public cloneVectorY(): Vector3d { return this._localToWorld.matrix.columnY(); }
  /** get the minor hoop radius (`radiusA`) */
  public getMinorRadius(): number { return this._radiusB; }
  /** get the major hoop radius (`radiusB`) */
  public getMajorRadius(): number { return this._radiusA; }
  /** get the sweep angle along the major circle. */
  public getSweepAngle(): Angle { return this._sweep.clone(); }
  /** Ask if this TorusPipe is labeled as reversed */
  public getIsReversed(): boolean { return this._isReversed; }
  /** Return the sweep angle as a fraction of full 360 degrees (2PI radians) */
  public getThetaFraction(): number { return this._sweep.radians / (Math.PI * 2.0); }
  /** ask if `other` is an instance of `TorusPipe` */
  public isSameGeometryClass(other: any): boolean { return other instanceof TorusPipe; }
  /** test if `this` and `other` have nearly equal geometry */
  public override isAlmostEqual(other: GeometryQuery): boolean {
    if (other instanceof TorusPipe) {
      if ((!this._sweep.isFullCircle) && this.capped !== other.capped) return false;
      if (!this._localToWorld.isAlmostEqual(other._localToWorld)) return false;
      return Geometry.isSameCoordinate(this._radiusA, other._radiusA)
        && Geometry.isSameCoordinate(this._radiusB, other._radiusB)
        && this._sweep.isAlmostEqualNoPeriodShift(other._sweep);
    }
    return false;
  }
  /** Return the angle (in radians) for given fractional position around the major hoop.
   */
  public vFractionToRadians(v: number): number { return this._sweep.radians * v; }
  /** Second step of double dispatch:  call `handler.handleTorusPipe(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleTorusPipe(this);
  }

  /**
   * Return the Arc3d section at vFraction.  For the TorusPipe, this is a minor circle.
   * @param vFraction fractional position along the sweep direction
   */
  public constantVSection(v: number): CurveCollection | undefined {
    const thetaRadians = this.vFractionToRadians(v);
    const c0 = Math.cos(thetaRadians);
    const s0 = Math.sin(thetaRadians);
    const majorRadius = this.getMajorRadius();
    const minorRadius = this.getMinorRadius();

    const center = this._localToWorld.multiplyXYZ(majorRadius * c0, majorRadius * s0, 0);
    const vector0 = this._localToWorld.multiplyVectorXYZ(minorRadius * c0, minorRadius * s0, 0);
    const vector90 = this._localToWorld.multiplyVectorXYZ(0, 0, minorRadius);
    return Loop.create(Arc3d.create(center, vector0, vector90));
  }
  /** Return an arc at constant u, and arc sweep  matching this TorusPipe sweep. */
  public constantUSection(uFraction: number): CurveCollection | undefined {
    const theta1Radians = this._sweep.radians;
    const phiRadians = uFraction * Math.PI;

    const majorRadius = this.getMajorRadius();
    const minorRadius = this.getMinorRadius();
    const transform = this._localToWorld;
    const axes = transform.matrix;
    const center = this._localToWorld.multiplyXYZ(0, 0, minorRadius * Math.sin(phiRadians));
    const rxy = majorRadius + minorRadius * Math.cos(phiRadians);
    const vector0 = axes.multiplyXYZ(rxy, 0, 0);
    const vector90 = axes.multiplyXYZ(0, rxy, 0);
    return Path.create(Arc3d.create(center, vector0, vector90, AngleSweep.createStartEndRadians(0.0, theta1Radians)));
  }
  /** extend `rangeToExtend` to include this `TorusPipe` */
  public extendRange(rangeToExtend: Range3d, transform?: Transform) {
    const theta1Radians = this._sweep.radians;
    const majorRadius = this.getMajorRadius();
    const minorRadius = this.getMinorRadius();
    const transform0 = this._localToWorld;
    const numThetaSample = Math.ceil(theta1Radians / (Math.PI / 16.0));
    const numHalfPhiSample = 16;
    let phi0 = 0;
    let dPhi = 0;
    let numPhiSample = 0;
    let theta = 0;
    let cosTheta = 0;
    let sinTheta = 0;
    let rxy = 0;
    let phi = 0;
    let j = 0;
    const dTheta = theta1Radians / numThetaSample;
    for (let i = 0; i <= numThetaSample; i++) {
      theta = i * dTheta;
      cosTheta = Math.cos(theta);
      sinTheta = Math.sin(theta);
      // At the ends, do the entire phi circle.
      // Otherwise only do the outer half
      if (i === 0 || i === numThetaSample) {
        phi0 = -Math.PI;
        dPhi = 2.0 * Math.PI / numHalfPhiSample;
        numPhiSample = numHalfPhiSample;
      } else {
        phi0 = -0.5 * Math.PI;
        dPhi = Math.PI / numHalfPhiSample;
        numPhiSample = 2 * numHalfPhiSample - 1;
      }
      if (transform) {
        for (j = 0; j <= numPhiSample; j++) {
          phi = phi0 + j * dPhi;
          rxy = majorRadius + minorRadius * Math.cos(phi);
          rangeToExtend.extendTransformTransformedXYZ(transform, transform0,
            cosTheta * rxy, sinTheta * rxy,
            Math.sin(phi) * minorRadius);
        }
      } else {
        for (j = 0; j <= numPhiSample; j++) {
          phi = phi0 + j * dPhi;
          rxy = majorRadius + minorRadius * Math.sin(phi);
          rangeToExtend.extendTransformedXYZ(transform0,
            cosTheta * rxy, sinTheta * rxy,
            Math.sin(phi) * minorRadius);
        }
      }
    }
  }
  /** Evaluate as a uv surface
   * @param u fractional position in minor (phi)
   * @param v fractional position on major (theta) arc
   */
  public uvFractionToPoint(u: number, v: number, result?: Point3d): Point3d {
    const thetaRadians = v * this._sweep.radians;
    const phiRadians = u * Math.PI * 2.0;
    const cosTheta = Math.cos(thetaRadians);
    const sinTheta = Math.sin(thetaRadians);
    const minorRadius = this.getMinorRadius();
    const rxy = this.getMajorRadius() + Math.cos(phiRadians) * minorRadius;
    return this._localToWorld.multiplyXYZ(rxy * cosTheta, rxy * sinTheta, minorRadius * Math.sin(phiRadians), result);
  }
  /** Evaluate as a uv surface, returning point and two vectors.
   * @param u fractional position in minor (phi)
   * @param v fractional position on major (theta) arc
   */
  public uvFractionToPointAndTangents(u: number, v: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    const thetaRadians = v * this._sweep.radians;
    const phiRadians = u * Math.PI * 2.0;
    const fTheta = this._sweep.radians;
    const fPhi = Math.PI * 2.0;
    const cosTheta = Math.cos(thetaRadians);
    const sinTheta = Math.sin(thetaRadians);
    const sinPhi = Math.sin(phiRadians);
    const cosPhi = Math.cos(phiRadians);
    const minorRadius = this.getMinorRadius();
    const rxy = this.getMajorRadius() + Math.cos(phiRadians) * minorRadius;
    const rSinPhi = minorRadius * sinPhi;
    const rCosPhi = minorRadius * cosPhi;   // appears only as derivative of rSinPhi.
    return Plane3dByOriginAndVectors.createOriginAndVectors(
      this._localToWorld.multiplyXYZ(cosTheta * rxy, sinTheta * rxy, rSinPhi),
      this._localToWorld.multiplyVectorXYZ(-cosTheta * rSinPhi * fPhi, -sinTheta * rSinPhi * fPhi, rCosPhi * fPhi),
      this._localToWorld.multiplyVectorXYZ(-rxy * sinTheta * fTheta, rxy * cosTheta * fTheta, 0),
      result);
  }
  /**
   * Directional distance query
   * * u direction is around the (full) minor hoop
   * * v direction is around the outer radius, sum of (absolute values of) major and minor radii.
   */
  public maxIsoParametricDistance(): Vector2d {
    const a = Math.abs(this.getMajorRadius());
    const b = Math.abs(this.getMinorRadius());
    return Vector2d.create(b * Math.PI * 2.0, (a + b) * this._sweep.radians);
  }
  /**
   * @return true if this is a closed volume.
   */
  public get isClosedVolume(): boolean {
    return this.capped || this._sweep.isFullCircle;
  }

}
