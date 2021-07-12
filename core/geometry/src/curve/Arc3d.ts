/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */

import { Clipper } from "../clipping/ClipUtils";
import { AxisOrder, BeJSONFunctions, Geometry, PlaneAltitudeEvaluator } from "../Geometry";
import { Angle } from "../geometry3d/Angle";
import { AngleSweep } from "../geometry3d/AngleSweep";
import { GeometryHandler, IStrokeHandler } from "../geometry3d/GeometryHandler";
import { Matrix3d } from "../geometry3d/Matrix3d";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/Plane3dByOriginAndUnitNormal";
import { Plane3dByOriginAndVectors } from "../geometry3d/Plane3dByOriginAndVectors";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Range1d, Range3d } from "../geometry3d/Range";
import { Ray3d } from "../geometry3d/Ray3d";
import { Transform } from "../geometry3d/Transform";
import { XYAndZ } from "../geometry3d/XYZProps";
import { Matrix4d } from "../geometry4d/Matrix4d";
import { Point4d } from "../geometry4d/Point4d";
import { SineCosinePolynomial, SmallSystem, TrigPolynomial } from "../numerics/Polynomials";
import { CurveExtendMode, CurveExtendOptions, VariantCurveExtendParameter } from "./CurveExtendMode";
import { CurveIntervalRole, CurveLocationDetail, CurveSearchStatus } from "./CurveLocationDetail";
import { AnnounceNumberNumberCurvePrimitive, CurvePrimitive } from "./CurvePrimitive";
import { GeometryQuery } from "./GeometryQuery";
import { LineString3d } from "./LineString3d";
import { StrokeOptions } from "./StrokeOptions";

/* eslint-disable @typescript-eslint/naming-convention, no-empty */
/**
 * Compact vector form of an elliptic arc defined by center, vectors for angle coordinates 0 and 90 degrees, and sweep.
 * * See `Arc3d` for further details of the parameterization and meaning of the vectors.
 * @public
 */
export interface ArcVectors {
  /** center point of arc. */
  center: Point3d;
  /** vector to point at angle 0 in parameter space */
  vector0: Vector3d;
  /** vector to point at angle 90 degrees in parameter space */
  vector90: Vector3d;
  /** angle swept by the subset of the complete arc. */
  sweep: AngleSweep;
}
/**
 * Circular or elliptic arc.
 *
 * * The angle to point equation is:
 *
 * **  `X = center + cos(theta) * vector0 + sin(theta) * vector90`
 * * When the two vectors are perpendicular and have equal length, it is a true circle.
 * * Non-perpendicular vectors are always elliptic.
 * *  vectors of unequal length are always elliptic.
 * * To create an ellipse in the common "major and minor axis" form of an ellipse:
 * ** vector0 is the vector from the center to the major axis extreme.
 * ** vector90 is the vector from the center to the minor axis extreme.
 * ** note the constructing the vectors to the extreme points makes them perpendicular.
 * *  The method toScaledMatrix3d () can be called to convert the unrestricted vector0,vector90 to perpendicular form.
 * * The unrestricted form is much easier to work with for common calculations -- stroking, projection to 2d, intersection with plane.
 * @public
 */
export class Arc3d extends CurvePrimitive implements BeJSONFunctions {
  /** String name for schema properties */
  public readonly curvePrimitiveType = "arc";

  /**
   * Test if this and other are both instances of Arc3d.
   */
  public isSameGeometryClass(other: GeometryQuery): boolean { return other instanceof Arc3d; }
  private _center: Point3d;
  private _matrix: Matrix3d; // columns are [vector0, vector90, unitNormal]
  private _sweep: AngleSweep; // sweep limits.
  private static _workPointA = Point3d.create();
  private static _workPointB = Point3d.create();
  private static _workPointC = Point3d.create();
  private static _workVectorU = Vector3d.create();
  private static _workVectorV = Vector3d.create();
  /**
   * read property for (clone of) center
   */
  public get center(): Point3d { return this._center.clone(); }
  /**
   * read property for (clone of) vector0
   */
  public get vector0(): Vector3d { return this._matrix.columnX(); }
  /**
   * read property for (clone of) vector90
   */
  public get vector90(): Vector3d { return this._matrix.columnY(); }
  /**
   * read property for (clone of) plane normal, with arbitrary length.
   */
  public get perpendicularVector(): Vector3d { return this._matrix.columnZ(); }
  /**
   * read property for (clone of!) matrix of vector0, vector90, unit normal
   */
  public matrixClone(): Matrix3d { return this._matrix.clone(); }
  /**
   * read property for (reference to !!) matrix of vector0, vector90, unit normal
   */
  public get matrixRef(): Matrix3d { return this._matrix; }
  /** Sweep of the angle. */
  public get sweep(): AngleSweep { return this._sweep; }
  public set sweep(value: AngleSweep) { this._sweep.setFrom(value); }
  /**
   * An Arc3d extends along its complete elliptic arc
   */
  public override get isExtensibleFractionSpace(): boolean { return true; }

  // constructor copies the pointers !!!
  private constructor(center: Point3d, matrix: Matrix3d, sweep: AngleSweep) {
    super();
    this._center = center;
    this._matrix = matrix;
    this._sweep = sweep;
  }
  /**
   *  Return a clone of the arc, with transform applied
   * @param transform
   */
  public cloneTransformed(transform: Transform): CurvePrimitive {  // we know tryTransformInPlace succeeds.
    const c = this.clone();
    c.tryTransformInPlace(transform);
    return c;
  }

  /**
   * Redefine the arc with (captured references to) given data.
   * @param center arc center
   * @param matrix matrix with columns vector0, vector 90, and their unit cross product
   * @param sweep angle sweep
   */
  public setRefs(center: Point3d, matrix: Matrix3d, sweep: AngleSweep) {
    this._center = center;
    this._matrix = matrix;
    this._sweep = sweep;
  }
  /**
   * Redefine the arc with (clones of) given data.
   * @param center arc center
   * @param matrix matrix with columns vector0, vector 90, and their unit cross product
   * @param sweep angle sweep
   */
  public set(center: Point3d, matrix: Matrix3d, sweep: AngleSweep | undefined) {
    this.setRefs(center.clone(), matrix.clone(), sweep ? sweep.clone() : AngleSweep.create360());
  }
  /**
   * Copy center, matrix, and sweep from other Arc3d.
   */
  public setFrom(other: Arc3d) {
    this._center.setFrom(other._center);
    this._matrix.setFrom(other._matrix);
    this._sweep.setFrom(other._sweep);
  }
  /** Return a clone of this arc. */
  public clone(): Arc3d {
    return new Arc3d(this._center.clone(), this._matrix.clone(), this._sweep.clone());
  }
  /**
   * Create an arc, capturing references to center, matrix and sweep.
   * @param center center point
   * @param matrix matrix with columns vector0, vector90, and unit cross product
   * @param sweep sweep limits
   * @param result optional preallocated result.
   */
  public static createRefs(center: Point3d, matrix: Matrix3d, sweep: AngleSweep, result?: Arc3d): Arc3d {
    if (result) {
      result.setRefs(center, matrix, sweep);
      return result;
    }
    return new Arc3d(center, matrix, sweep);
  }
  /**
   * Create an arc from center, x column to be scaled, and y column to be scaled.
   * @param center center of ellipse
   * @param matrix matrix whose x and y columns are unit vectors to be scaled by radius0 and radius90
   * @param radius0 radius in x direction.
   * @param radius90 radius in y direction.
   * @param sweep sweep limits
   * @param result optional preallocated result.
   */
  public static createScaledXYColumns(center: Point3d | undefined, matrix: Matrix3d, radius0: number, radius90: number, sweep?: AngleSweep, result?: Arc3d): Arc3d {
    const vector0 = matrix.columnX();
    const vector90 = matrix.columnY();
    return Arc3d.create(center, vector0.scale(radius0, vector0), vector90.scale(radius90, vector90), sweep, result);
  }
  /**
   * Create a (full circular) arc from center, normal and radius
   * @param center center of ellipse.  If undefined, center at 000
   * @param normal normal vector
   * @param radius radius in x direction.
   * @param result optional preallocated result.
   */
  public static createCenterNormalRadius(center: Point3d | undefined, normal: Vector3d, radius: number, result?: Arc3d): Arc3d {
    const frame = Matrix3d.createRigidHeadsUp(normal);
    return Arc3d.createScaledXYColumns(center, frame, radius, radius, undefined, result);
  }

  /**
   * Creat an arc by center with vectors to points at 0 and 90 degrees in parameter space.
   * @param center arc center
   * @param vector0 vector to 0 degrees (commonly major axis)
   * @param vector90 vector to 90 degree point (commonly minor axis)
   * @param sweep sweep limits
   * @param result optional preallocated result
   */
  public static create(center: Point3d | undefined, vector0: Vector3d, vector90: Vector3d, sweep?: AngleSweep, result?: Arc3d): Arc3d {
    const normal = vector0.unitCrossProductWithDefault(vector90, 0, 0, 0); // normal will be 000 for degenerate case ! !!
    const matrix = Matrix3d.createColumns(vector0, vector90, normal);
    return Arc3d.createRefs(center !== undefined ? center.clone() : Point3d.create(0, 0, 0), matrix, sweep ? sweep.clone() : AngleSweep.create360(), result);
  }
  /** Return a clone of this arc, projected to given z value.
   * * If `z` is omitted, the clone is at the z of the center.
   * * Note that projection to fixed z can change circle into ellipse (and (rarely) ellipse to circle)
   */
  public cloneAtZ(z?: number): Arc3d {
    if (z === undefined)
      z = this._center.z;
    return Arc3d.createXYZXYZXYZ(
      this._center.x, this._center.y, this._center.z,
      this._matrix.coffs[0], this._matrix.coffs[3], 0,
      this._matrix.coffs[1], this._matrix.coffs[4], 0,
      this._sweep);
  }

  /**
   * Create an arc by center (cx,cy,xz) with vectors (ux,uy,uz) and (vx,vy,vz) to points at 0 and 90 degrees in parameter space.
   * @param result optional preallocated result
   */
  public static createXYZXYZXYZ(cx: number, cy: number, cz: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, sweep?: AngleSweep, result?: Arc3d): Arc3d {
    return Arc3d.create(Point3d.create(cx, cy, cz), Vector3d.create(ux, uy, uz), Vector3d.create(vx, vy, vz), sweep, result);
  }

  /**
   * Return a quick estimate of the eccentricity of the ellipse.
   * * The estimator is the cross magnitude of the product of vectors U and V, divided by square of the larger magnitude
   * * for typical Arc3d with perpendicular UV, this is exactly the small axis divided by large.
   * * note that the eccentricity is AT MOST ONE.
   */
  public quickEccentricity(): number {
    const magX = this._matrix.columnXMagnitude();
    const magY = this._matrix.columnYMagnitude();
    const jacobian = this._matrix.columnXYCrossProductMagnitude();
    const largeAxis = Geometry.maxXY(magX, magY);
    return jacobian / (largeAxis * largeAxis);
  }
  /** Create a circular arc defined by start point, any intermediate point, and end point.
   * If the points are colinear, assemble them into a linestring.
   */
  public static createCircularStartMiddleEnd(
    pointA: XYAndZ,
    pointB: XYAndZ,
    pointC: XYAndZ,
    result?: Arc3d): Arc3d | LineString3d | undefined {
    const vectorAB = Vector3d.createStartEnd(pointA, pointB);
    const vectorAC = Vector3d.createStartEnd(pointA, pointC);
    const ab = vectorAB.magnitude();
    const bc = vectorAC.magnitude();
    const normal = vectorAB.sizedCrossProduct(vectorAC, Math.sqrt(ab * bc));
    if (normal) {
      const vectorToCenter = SmallSystem.linearSystem3d(
        normal.x, normal.y, normal.z,
        vectorAB.x, vectorAB.y, vectorAB.z,
        vectorAC.x, vectorAC.y, vectorAC.z,
        0,              // vectorToCenter DOT normal = 0
        0.5 * ab * ab,  // vectorToCenter DOT vectorBA = 0.5 * vectorBA DOT vectorBA  (Rayleigh quotient)
        0.5 * bc * bc); // vectorToCenter DOT vectorBC = 0.5 * vectorBC DOT vectorBC  (Rayleigh quotient)
      if (vectorToCenter) {
        const center = Point3d.create(pointA.x, pointA.y, pointA.z).plus(vectorToCenter);
        const vectorX = Vector3d.createStartEnd(center, pointA);
        const vectorY = Vector3d.createRotateVectorAroundVector(vectorX, normal, Angle.createDegrees(90));
        if (vectorY) {
          const vectorCenterToC = Vector3d.createStartEnd(center, pointC);
          const sweepAngle = vectorX.signedAngleTo(vectorCenterToC, normal);
          if (sweepAngle.radians < 0.0)
            sweepAngle.addMultipleOf2PiInPlace(1.0);
          return Arc3d.create(center, vectorX, vectorY,
            AngleSweep.createStartEndRadians(0.0, sweepAngle.radians), result);
        }
      }
    }
    return LineString3d.create(pointA, pointB, pointC);
  }
  /** The arc has simple proportional arc length if and only if it is a circular arc. */
  public override getFractionToDistanceScale(): number | undefined {
    const radius = this.circularRadius();
    if (radius !== undefined)
      return Math.abs(radius * this._sweep.sweepRadians);
    return undefined;
  }
  /**
   * Convert a fractional position to xyz coordinates
   * @param fraction fractional position on arc
   * @param result optional preallocated result
   */
  public fractionToPoint(fraction: number, result?: Point3d): Point3d {
    const radians = this._sweep.fractionToRadians(fraction);
    return this._matrix.originPlusMatrixTimesXY(this._center, Math.cos(radians), Math.sin(radians), result);
  }
  /**
   * Convert fractional arc and radial positions to xyz coordinates
   * @param fraction fractional position on arc
   * @param result optional preallocated result
   */
  public fractionAndRadialFractionToPoint(arcFraction: number, radialFraction: number, result?: Point3d): Point3d {
    const radians = this._sweep.fractionToRadians(arcFraction);
    return this._matrix.originPlusMatrixTimesXY(this._center, radialFraction * Math.cos(radians), radialFraction * Math.sin(radians), result);
  }

  /**
   * Convert a fractional position to xyz coordinates and derivative with respect to fraction.
   * @param fraction fractional position on arc
   * @param result optional preallocated result
   */
  public fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d {
    result = this.radiansToPointAndDerivative(this._sweep.fractionToRadians(fraction), result);
    result.direction.scaleInPlace(this._sweep.sweepRadians);
    return result;
  }

  /** Construct a plane with
   * * origin at the fractional position along the arc
   * * x axis is the first derivative, i.e. tangent along the arc
   * * y axis is the second derivative, i.e. in the plane and on the center side of the tangent.
   * If the arc is circular, the second derivative is directly towards the center
   */
  public fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    const radians = this._sweep.fractionToRadians(fraction);
    if (!result) result = Plane3dByOriginAndVectors.createXYPlane();
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    this._matrix.originPlusMatrixTimesXY(this._center, c, s, result.origin);
    const a = this._sweep.sweepRadians;
    this._matrix.multiplyXY(-a * s, a * c, result.vectorU);
    const aa = a * a;
    this._matrix.multiplyXY(- aa * c, -aa * s, result.vectorV);
    return result;
  }
  /**
   * Evaluate the point and derivative with respect to the angle (in radians)
   * @param radians angular position
   * @param result optional preallocated ray.
   */
  public radiansToPointAndDerivative(radians: number, result?: Ray3d): Ray3d {
    result = result ? result : Ray3d.createZero();
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    this._matrix.originPlusMatrixTimesXY(this._center, c, s, result.origin);
    this._matrix.multiplyXY(-s, c, result.direction);
    return result;
  }
  /**
   * Evaluate the point and derivative with respect to the angle (in radians)
   * @param radians angular position
   * @param result optional preallocated ray.
   */
  public radiansToPoint(radians: number, result?: Point3d): Point3d {
    result = result ? result : Point3d.create();
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    this._matrix.originPlusMatrixTimesXY(this._center, c, s, result);
    return result;
  }

  /**
   * Return a parametric plane with
   * * origin at arc center
   * * vectorU from center to arc at angle (in radians)
   * * vectorV from center to arc at 90 degrees past the angle.
   * @param radians angular position
   * @param result optional preallocated plane
   */
  public radiansToRotatedBasis(radians: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors {
    result = result ? result : Plane3dByOriginAndVectors.createXYPlane();
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    result.origin.setFromPoint3d(this.center);
    this._matrix.multiplyXY(c, s, result.vectorU);
    this._matrix.multiplyXY(-s, c, result.vectorV);
    return result;
  }

  /**
   * Evaluate the point and derivative with respect to the angle (in radians)
   * @param theta angular position
   * @param result optional preallocated ray.
   */
  public angleToPointAndDerivative(theta: Angle, result?: Ray3d): Ray3d {
    result = result ? result : Ray3d.createZero();
    const c = theta.cos();
    const s = theta.sin();
    this._matrix.originPlusMatrixTimesXY(this._center, c, s, result.origin);
    this._matrix.multiplyXY(-s, c, result.direction);
    return result;
  }
  /**
   * Return the start point tof the arc.
   * @param result optional preallocated result
   */
  public override startPoint(result?: Point3d): Point3d { return this.fractionToPoint(0.0, result); }

  /**
   * Return the end point tof the arc.
   * @param result optional preallocated result
   */
  public override endPoint(result?: Point3d): Point3d { return this.fractionToPoint(1.0, result); }
  /** * If this is a circular arc, return the simple length derived from radius and sweep.
   * * Otherwise (i.e. if this elliptical) fall through to CurvePrimitive base implementation which
   *     Uses quadrature.
   */
  public override curveLength(): number {
    return this.curveLengthBetweenFractions(0, 1);
  }
  // !! misspelled Gauss in the published static !!!   Declare it ok.
  // cspell::word Guass
  /** Gauss point quadrature count for evaluating curve length.   (The number of intervals is adjusted to the arc sweep) */
  public static readonly quadratureGuassCount = 5;
  /** In quadrature for arc length, use this interval (divided by quickEccentricity) */
  public static readonly quadratureIntervalAngleDegrees = 10.0;
  /** * If this is a circular arc, return the simple length derived from radius and sweep.
   * * Otherwise (i.e. if this elliptical) fall through CurvePrimitive integrator.
   */
  public override curveLengthBetweenFractions(fraction0: number, fraction1: number): number {
    const simpleLength = this.getFractionToDistanceScale();
    if (simpleLength !== undefined)
      return simpleLength * Math.abs(fraction1 - fraction0);
    // fall through for true ellipse . .. stroke and accumulate quadrature with typical count .  ..
    let f0 = fraction0;
    let f1 = fraction1;
    if (fraction0 > fraction1) {
      f0 = fraction1;
      f1 = fraction0;
    }
    const sweepDegrees = (f1 - f0) * this._sweep.sweepDegrees;
    let eccentricity = this.quickEccentricity();
    if (eccentricity < 0.00001)
      eccentricity = 0.00001;
    let numInterval = Math.ceil(sweepDegrees / (eccentricity * Arc3d.quadratureIntervalAngleDegrees));
    if (numInterval > 400)
      numInterval = 400;
    if (numInterval < 1)
      numInterval = 1;
    return super.curveLengthWithFixedIntervalCountQuadrature(f0, f1, numInterval, Arc3d.quadratureGuassCount);
  }

  /**
   * Return an approximate (but easy to compute) arc length.
   * The estimate is:
   * * Form 8 chords on full circle, proportionally fewer for partials.  (But 2 extras if less than half circle.)
   * * sum the chord lengths
   * * For a circle, we know this crude approximation has to be increased by a factor (theta/(2 sin (theta/2)))
   * * Apply that factor.
   * * Experiments confirm that this is within 3 percent for a variety of eccentricities and arc sweeps.
   */
  public quickLength(): number {
    const totalSweep = Math.abs(this._sweep.sweepRadians);
    let numInterval = Math.ceil(4 * totalSweep / Math.PI);
    if (numInterval < 1)
      numInterval = 1;
    if (numInterval < 4)
      numInterval += 3;
    else if (numInterval < 6)
      numInterval += 2;   // force extras for short arcs
    const pointA = Arc3d._workPointA;
    const pointB = Arc3d._workPointB;
    let chordSum = 0.0;
    this.fractionToPoint(0.0, pointA);
    for (let i = 1; i <= numInterval; i++) {
      this.fractionToPoint(i / numInterval, pointB);
      chordSum += pointA.distance(pointB);
      pointA.setFromPoint3d(pointB);
    }
    // The chord sum is always shorter.
    // if it is a true circular arc, the ratio of correct over sum is easy ...
    const dTheta = totalSweep / numInterval;
    const factor = dTheta / (2.0 * Math.sin(0.5 * dTheta));
    return chordSum * factor;
  }
  /**
   * * See extended comments on `CurvePrimitive.moveSignedDistanceFromFraction`
   * * A zero length line generates `CurveSearchStatus.error`
   * * Nonzero length line generates `CurveSearchStatus.success` or `CurveSearchStatus.stoppedAtBoundary`
   */
  public override moveSignedDistanceFromFraction(startFraction: number, signedDistance: number, allowExtension: false, result?: CurveLocationDetail): CurveLocationDetail {
    if (!this.isCircular) // suppress extension !!!
      return super.moveSignedDistanceFromFractionGeneric(startFraction, signedDistance, allowExtension, result);
    const totalLength = this.curveLength();
    const signedFractionMove = Geometry.conditionalDivideFraction(signedDistance, totalLength);
    if (signedFractionMove === undefined) {
      return CurveLocationDetail.createCurveFractionPointDistanceCurveSearchStatus(
        this, startFraction, this.fractionToPoint(startFraction), 0.0, CurveSearchStatus.error);
    }
    return CurveLocationDetail.createConditionalMoveSignedDistance(
      allowExtension,
      this,
      startFraction,
      startFraction + signedFractionMove,
      signedDistance,
      result);
  }
  /**
   * Return all angles (in radians) where the ellipse tangent is perpendicular to the vector to a spacePoint.
   * @param spacePoint point of origin of vectors to the ellipse
   * @param _extend (NOT SUPPORTED -- ALWAYS ACTS AS "true")
   * @param _endpoints if true, force the end radians into the result.
   */
  public allPerpendicularAngles(spacePoint: Point3d, _extend: boolean = true, _endpoints: boolean = false): number[] {
    const radians: number[] = [];
    const vectorQ = spacePoint.vectorTo(this.center);
    const uu = this._matrix.columnXMagnitudeSquared();
    const uv = this._matrix.columnXDotColumnY();
    const vv = this._matrix.columnYMagnitudeSquared();
    TrigPolynomial.solveUnitCircleImplicitQuadricIntersection(
      uv,
      vv - uu,
      -uv,
      this._matrix.dotColumnY(vectorQ),
      -this._matrix.dotColumnX(vectorQ),
      0.0, radians);
    if (_endpoints) {
      radians.push(this.sweep.startRadians);
      radians.push(this.sweep.endRadians);
    }

    return radians;
  }
  /**
   * Return details of the closest point on the arc, optionally extending to full ellipse.
   * @param spacePoint search for point closest to this point.
   * @param extend if true, consider projections to the complete ellipse.   If false, consider only endpoints and projections within the arc sweep.
   * @param result optional preallocated result.
   */
  public override closestPoint(spacePoint: Point3d, extend: VariantCurveExtendParameter, result?: CurveLocationDetail): CurveLocationDetail {
    result = CurveLocationDetail.create(this, result);
    const allRadians = this.allPerpendicularAngles(spacePoint, true, true);
    let extend0 = CurveExtendOptions.resolveVariantCurveExtendParameterToCurveExtendMode(extend, 0);
    let extend1 = CurveExtendOptions.resolveVariantCurveExtendParameterToCurveExtendMode(extend, 1);
    // distinct extends for cyclic space are awkward ....
    if (this._sweep.isFullCircle) {
      extend0 = CurveExtendMode.None;
      extend1 = CurveExtendMode.None;
    }
    if (extend0 !== CurveExtendMode.None && extend1 !== CurveExtendMode.None) {
      allRadians.push(this._sweep.startRadians);
      allRadians.push(this._sweep.endRadians);
    }
    // hm... logically there must at least two angles there ...  but if it happens return the start point ...
    const workRay = Ray3d.createZero();
    if (allRadians.length === 0) {
      result.setFR(0.0, this.radiansToPointAndDerivative(this._sweep.startRadians, workRay));
      result.a = spacePoint.distance(result.point);
    } else {
      let dMin = Number.MAX_VALUE;
      let d = 0;
      for (const radians of allRadians) {
        const fraction = CurveExtendOptions.resolveRadiansToSweepFraction(extend, radians, this.sweep);
        if (fraction !== undefined) {
          this.fractionToPointAndDerivative(fraction, workRay);

          d = spacePoint.distance(workRay.origin);
          if (d < dMin) {
            dMin = d;
            result.setFR(fraction, workRay);
            result.a = d;
          }
        }
      }
    }
    return result;
  }
  /** Reverse the sweep  of the arc. */
  public reverseInPlace(): void { this._sweep.reverseInPlace(); }
  /** apply a transform to the arc basis vectors.
   * * nonuniform (i.e. skewing) transforms are allowed.
   * * The transformed vector0 and vector90 are NOT squared up as major minor axes.  (This is a good feature!!)
   */
  public tryTransformInPlace(transform: Transform): boolean {
    this._center = transform.multiplyPoint3d(this._center, this._center);
    this._matrix = transform.matrix.multiplyMatrixMatrix(this._matrix, this._matrix);
    // force re-normalization of columnZ.
    this.setVector0Vector90(this._matrix.columnX(), this._matrix.columnY());
    return true;
  }
  /**
   * Return true if the ellipse center and basis vectors are in the plane
   * @param plane
   */
  public isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean {
    const normal = plane.getNormalRef();
    // The ellipse vectors are full-length  -- true distance comparisons say things.
    return Geometry.isSmallMetricDistance(plane.altitude(this._center))
      && Geometry.isSmallMetricDistance(this._matrix.dotColumnX(normal))
      && Geometry.isSmallMetricDistance(this._matrix.dotColumnY(normal));
  }
  /**
   * Return true if the vector0 and vector90 are of equal length and perpendicular.
   */
  public get isCircular(): boolean {
    const axx = this._matrix.columnXMagnitudeSquared();
    const ayy = this._matrix.columnYMagnitudeSquared();
    const axy = this._matrix.columnXDotColumnY();
    return Angle.isPerpendicularDotSet(axx, ayy, axy) && Geometry.isSameCoordinateSquared(axx, ayy);
  }
  /**
   * Return true if the vector0 and vector90 are of equal length and perpendicular.
   */
  public circularRadiusXY(): number | undefined {
    const ux = this._matrix.at(0, 0);
    const uy = this._matrix.at(1, 0);
    const vx = this._matrix.at(0, 1), vy = this._matrix.at(1, 1);
    const axx = Geometry.dotProductXYXY(ux, uy, ux, uy);
    const ayy = Geometry.dotProductXYXY(vx, vy, vx, vy);
    const axy = Geometry.dotProductXYXY(ux, uy, vx, vy);
    if (Angle.isPerpendicularDotSet(axx, ayy, axy) && Geometry.isSameCoordinateSquared(axx, ayy))
      return Geometry.hypotenuseXY(ux, uy);
    return undefined;
  }

  /** If the arc is circular, return its radius.  Otherwise return undefined */
  public circularRadius(): number | undefined {
    return this.isCircular ? this._matrix.columnXMagnitude() : undefined;
  }

  /** Return the larger of the two defining vectors. */
  public maxVectorLength(): number { return Math.max(this._matrix.columnXMagnitude(), this._matrix.columnYMagnitude()); }
  /**
   * compute intersections with a plane.
   * @param plane plane to intersect
   * @param result array of locations on the curve.
   */
  public override appendPlaneIntersectionPoints(plane: PlaneAltitudeEvaluator, result: CurveLocationDetail[]): number {
    const constCoff = plane.altitude(this._center);
    const coffs = this._matrix.coffs;
    const cosCoff = plane.velocityXYZ(coffs[0], coffs[3], coffs[6]);
    const sinCoff = plane.velocityXYZ(coffs[1], coffs[4], coffs[7]);
    const trigPoints = Geometry.solveTrigForm(constCoff, cosCoff, sinCoff);
    let numIntersection = 0;
    if (trigPoints !== undefined) {
      numIntersection = trigPoints.length;
      let xy;
      for (xy of trigPoints) {
        const radians = Math.atan2(xy.y, xy.x);
        const fraction = this._sweep.radiansToPositivePeriodicFraction(radians);
        const detail = CurveLocationDetail.createCurveFractionPoint(this, fraction, this.fractionToPoint(fraction));
        detail.intervalRole = CurveIntervalRole.isolated;
        if (Angle.isAlmostEqualRadiansAllowPeriodShift(radians, this._sweep.startRadians))
          detail.intervalRole = CurveIntervalRole.isolatedAtVertex;
        else if (Angle.isAlmostEqualRadiansAllowPeriodShift(radians, this._sweep.endRadians))
          detail.intervalRole = CurveIntervalRole.isolatedAtVertex;
        result.push(detail);
      }
    }
    return numIntersection;
  }
  /**
   * Extend a range to include the range of the arc.
   * @param range range being extended.
   * @param transform optional transform to apply to the arc.
   */
  public extendRange(range: Range3d, transform?: Transform): void {
    const trigForm = new SineCosinePolynomial(0, 0, 0);
    const center = this._center.clone(Arc3d._workPointA);
    const vectorU = this._matrix.columnX(Arc3d._workVectorU);
    const vectorV = this._matrix.columnY(Arc3d._workVectorV);
    if (transform) {
      transform.multiplyPoint3d(center, center);
      transform.multiplyVector(vectorU, vectorU);
      transform.multiplyVector(vectorV, vectorV);
    }
    const lowPoint = Arc3d._workPointB;
    const highPoint = Arc3d._workPointC;
    const range1 = Range1d.createNull();
    for (let i = 0; i < 3; i++) {
      trigForm.set(center.at(i), vectorU.at(i), vectorV.at(i));
      trigForm.rangeInSweep(this._sweep, range1);
      lowPoint.setAt(i, range1.low);
      highPoint.setAt(i, range1.high);
    }
    range.extend(lowPoint);
    range.extend(highPoint);

  }
  /**
   * Set up a SineCosinePolynomial as the function c+u*cos(theta)+v*sin(theta) where
   *  c,u,v are coefficients obtained by evaluating altitude and velocity relative to the plane.
   * @param plane plane for altitude calculation.
   * @param result optional result.
   * @internal
   */
  public getPlaneAltitudeSineCosinePolynomial(plane: PlaneAltitudeEvaluator, result?: SineCosinePolynomial): SineCosinePolynomial {
    if (!result)
      result = new SineCosinePolynomial(0, 0, 0);
    result.set(plane.altitude(this._center),
      plane.altitudeXYZ(this._matrix.coffs[0], this._matrix.coffs[3], this._matrix.coffs[6]),
      plane.altitudeXYZ(this._matrix.coffs[1], this._matrix.coffs[4], this._matrix.coffs[7]));
    return result;
  }
  /**
   * Create a new arc which is a unit circle centered at the origin.
   */
  public static createUnitCircle(): Arc3d {
    return Arc3d.createRefs(Point3d.create(0, 0, 0), Matrix3d.createIdentity(), AngleSweep.create360());
  }
  /**
   * Create a new arc which is parallel to the xy plane, with given center and radius and optional angle sweep.
   * @param center center of arc
   * @param radius radius of arc
   * @param sweep sweep limits.  defaults to full circle.
   */
  public static createXY(
    center: Point3d,
    radius: number,
    sweep: AngleSweep = AngleSweep.create360()): Arc3d {
    return new Arc3d(center.clone(), Matrix3d.createScale(radius, radius, 1.0), sweep);
  }
  /**
   * Create a new arc which is parallel to the xy plane, with given center and x,y radii, and optional angle sweep
   * @param center center of ellipse
   * @param radiusA x axis radius
   * @param radiusB y axis radius
   * @param sweep angle sweep
   */
  public static createXYEllipse(
    center: Point3d,
    radiusA: number,
    radiusB: number,
    sweep: AngleSweep = AngleSweep.create360()): Arc3d {
    return new Arc3d(center.clone(), Matrix3d.createScale(radiusA, radiusB, 1.0), sweep);
  }
  /**
   * Replace the arc's 0 and 90 degree vectors.
   * @param vector0 vector from center to ellipse point at 0 degrees in parameter space
   * @param vector90 vector from center to ellipse point at 90 degrees in parameter space
   */
  public setVector0Vector90(vector0: Vector3d, vector90: Vector3d) {
    this._matrix.setColumns(vector0, vector90,
      vector0.unitCrossProductWithDefault(vector90, 0, 0, 0), // normal will be 000 for degenerate case !!!;
    );
  }
  /** Return the arc definition with rigid matrix form with axis radii.
   */
  public toScaledMatrix3d(): { center: Point3d, axes: Matrix3d, r0: number, r90: number, sweep: AngleSweep } {
    const angleData = Angle.dotProductsToHalfAngleTrigValues(
      this._matrix.columnXMagnitudeSquared(),
      this._matrix.columnYMagnitudeSquared(),
      this._matrix.columnXDotColumnY(), true);
    const vector0A = this._matrix.multiplyXY(angleData.c, angleData.s);
    const vector90A = this._matrix.multiplyXY(-angleData.s, angleData.c);

    const axes = Matrix3d.createRigidFromColumns(vector0A, vector90A, AxisOrder.XYZ);
    return {
      axes: (axes ? axes : Matrix3d.createIdentity()),
      center: this._center,
      r0: vector0A.magnitude(),
      r90: vector90A.magnitude(),
      sweep: this.sweep.cloneMinusRadians(angleData.radians),
    };
  }
  /** Return the arc definition with center, two vectors, and angle sweep;
   */
  public toVectors(): ArcVectors {
    return {
      center: this.center,
      vector0: this._matrix.columnX(),
      vector90: this._matrix.columnY(),
      sweep: this.sweep,
    };
  }

  /** Return the arc definition with center, two vectors, and angle sweep, optionally transformed.
   */
  public toTransformedVectors(transform?: Transform): { center: Point3d, vector0: Vector3d, vector90: Vector3d, sweep: AngleSweep } {
    return transform ? {
      center: transform.multiplyPoint3d(this._center),
      vector0: transform.multiplyVector(this._matrix.columnX()),
      vector90: transform.multiplyVector(this._matrix.columnY()),
      sweep: this.sweep,
    }
      : {
        center: this._center.clone(),
        vector0: this._matrix.columnX(),
        vector90: this._matrix.columnY(),
        sweep: this.sweep,
      };
  }

  /** Return the arc definition with center, two vectors, and angle sweep, transformed to 4d points.
   */
  public toTransformedPoint4d(matrix: Matrix4d): { center: Point4d, vector0: Point4d, vector90: Point4d, sweep: AngleSweep } {
    return {
      center: matrix.multiplyPoint3d(this._center, 1.0),
      vector0: matrix.multiplyPoint3d(this._matrix.columnX(), 0.0),
      vector90: matrix.multiplyPoint3d(this._matrix.columnY(), 0.0),
      sweep: this.sweep,
    };
  }
  /**
   * Set this arc from a json object with these values:
   * * center center point
   * * vector0 vector from center to 0 degree point in parameter space (commonly but not always the major axis vector)
   * * vector90 vector from center to 90 degree point in parameter space (commonly but not always the minor axis vector)
   * @param json
   */
  public setFromJSON(json?: any) {
    if (json && json.center && json.vector0 && json.vector90 && json.sweep) {
      this._center.setFromJSON(json.center);
      const vector0 = Vector3d.create();
      const vector90 = Vector3d.create();
      vector0.setFromJSON(json.vector0);
      vector90.setFromJSON(json.vector90);
      this.setVector0Vector90(vector0, vector90);
      this._sweep.setFromJSON(json.sweep);
    } else {
      this._center.set(0, 0, 0);
      this._matrix.setFrom(Matrix3d.identity);
      this._sweep.setStartEndRadians();
    }
  }
  /**
   * Convert to a JSON object.
   * @return {*} [center:  [], vector0:[], vector90:[], sweep []}
   */
  public toJSON(): any {
    return {
      center: this._center.toJSON(),
      sweep: this._sweep.toJSON(),
      vector0: this._matrix.columnX().toJSON(),
      vector90: this._matrix.columnY().toJSON(),
    };
  }
  /**
   * Test if this arc is almost equal to another GeometryQuery object
   */
  public override isAlmostEqual(otherGeometry: GeometryQuery): boolean {
    if (otherGeometry instanceof Arc3d) {
      const other = otherGeometry;
      return this._center.isAlmostEqual(other._center)
        && this._matrix.isAlmostEqual(other._matrix)
        && this._sweep.isAlmostEqualAllowPeriodShift(other._sweep);
    }
    return false;
  }

  /** Emit strokes to caller-supplied linestring */
  public emitStrokes(dest: LineString3d, options?: StrokeOptions): void {
    const numStrokes = this.computeStrokeCountForOptions(options);
    dest.appendFractionalStrokePoints(this, numStrokes, 0.0, 1.0, true);
  }

  /** Emit strokes to caller-supplied handler */
  public emitStrokableParts(handler: IStrokeHandler, options?: StrokeOptions): void {
    const numStrokes = this.computeStrokeCountForOptions(options);
    handler.startCurvePrimitive(this);
    handler.announceIntervalForUniformStepStrokes(this, numStrokes, 0.0, 1.0);
    handler.endCurvePrimitive(this);
  }

  /**
   * return the stroke count required for given options.
   * @param options StrokeOptions that determine count
   */
  public computeStrokeCountForOptions(options?: StrokeOptions): number {
    let numStroke;
    if (options) {
      const rMax = this.maxVectorLength();
      numStroke = options.applyTolerancesToArc(rMax, this._sweep.sweepRadians);
    } else {
      numStroke = StrokeOptions.applyAngleTol(undefined, 1, this._sweep.sweepRadians);
    }
    return numStroke;
  }
  /** Second step of double dispatch:  call `handler.handleArc3d(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleArc3d(this);
  }
  /** Return (if possible) an arc which is a portion of this curve.
   * @param fractionA [in] start fraction
   * @param fractionB [in] end fraction
   */
  public override clonePartialCurve(fractionA: number, fractionB: number): CurvePrimitive | undefined {
    if (fractionB < fractionA) {
      const arcA = this.clonePartialCurve(fractionB, fractionA);
      if (arcA)
        arcA.reverseInPlace();
      return arcA;
    }
    const arcB = this.clone();

    arcB.sweep.setStartEndRadians(
      this.sweep.fractionToRadians(fractionA),
      this.sweep.fractionToRadians(fractionB));
    return arcB;
  }
  /** Return an arc whose basis vectors are rotated by given angle within the current basis space.
   * * the result arc will have its zero-degree point (new `vector0`) at the current `vector0 * cos(theta) + vector90 * sin(theta)`
   * * the result sweep is adjusted so all fractional coordinates (e.g. start and end) evaluate to the same xyz.
   *   * Specifically, theta is subtracted from the original start and end angles.
   * @param theta the angle (in the input arc space) which is to become the 0-degree point in the new arc.
   */
  public cloneInRotatedBasis(theta: Angle): Arc3d {
    const c = theta.cos();
    const s = theta.sin();
    const vector0 = this._matrix.multiplyXY(c, s);
    const vector90 = this._matrix.multiplyXY(-s, c);

    const newSweep = AngleSweep.createStartEndRadians(this._sweep.startRadians - theta.radians, this._sweep.endRadians - theta.radians);
    const arcB = Arc3d.create(this._center.clone(), vector0, vector90, newSweep);
    return arcB;
  }

  /**
   * Find intervals of this CurvePrimitive that are interior to a clipper
   * @param clipper clip structure (e.g.clip planes)
   * @param announce(optional) function to be called announcing fractional intervals"  ` announce(fraction0, fraction1, curvePrimitive)`
   * @returns true if any "in" segments are announced.
   */
  public override announceClipIntervals(clipper: Clipper, announce?: AnnounceNumberNumberCurvePrimitive): boolean {
    return clipper.announceClippedArcIntervals(this, announce);
  }
  /** Compute the center and vectors of another arc as local coordinates within this arc's frame. */
  public otherArcAsLocalVectors(other: Arc3d): ArcVectors | undefined {
    const otherOrigin = this._matrix.multiplyInverseXYZAsPoint3d(
      other.center.x - this.center.x, other.center.y - this.center.y, other.center.z - this.center.z);
    const otherVector0 = this._matrix.multiplyInverse(other.vector0);
    const otherVector90 = this._matrix.multiplyInverse(other.vector90);
    if (otherOrigin && otherVector0 && otherVector90) {
      return { center: otherOrigin, vector0: otherVector0, vector90: otherVector90, sweep: this.sweep.clone() };
    }
    return undefined;
  }
  /**
   * Determine an arc "at a point of inflection" of a point sequence.
   * * Return the arc along with the fractional positions of the tangency points.
   * * In the returned object:
   *   * `arc` is the (bounded) arc
   *   * `fraction10` is the tangency point's position as an interpolating fraction of the line segment from `point1` (backwards) to `point0`
   *   * `fraction12` is the tangency point's position as an interpolating fraction of the line segment from `point1` (forward) to `point2`
   *   * `point1` is the `point1` input.
   * * If unable to construct the arc:
   *   * `point` is the `point` input.
   *   * both fractions are zero
   *   * `arc` is undefined.
   * @param point0 first point of path. (the point before the point of inflection)
   * @param point1 second point of path (the point of inflection)
   * @param point2 third point of path (the point after the point of inflection)
   * @param radius arc radius
   *
   */
  public static createFilletArc(point0: Point3d, point1: Point3d, point2: Point3d, radius: number): ArcBlendData {
    const vector10 = Vector3d.createStartEnd(point1, point0);
    const vector12 = Vector3d.createStartEnd(point1, point2);
    const d10 = vector10.magnitude();
    const d12 = vector12.magnitude();
    if (vector10.normalizeInPlace() && vector12.normalizeInPlace()) {
      const bisector = vector10.plus(vector12);
      if (bisector.normalizeInPlace()) {
        // const theta = vector12.angleTo(bisector);
        // vector10, vector12, and bisector are UNIT vectors
        // bisector splits the angle between vector10 and vector12
        const perpendicular = vector12.minus(vector10);
        const perpendicularMagnitude = perpendicular.magnitude();  // == 2 * sin(theta)
        const sinTheta = 0.5 * perpendicularMagnitude;
        if (!Geometry.isSmallAngleRadians(sinTheta)) {  // (for small theta, sinTheta is almost equal to theta)
          const cosTheta = Math.sqrt(1 - sinTheta * sinTheta);
          const tanTheta = sinTheta / cosTheta;
          const alphaRadians = Math.acos(sinTheta);
          const distanceToCenter = radius / sinTheta;
          const distanceToTangency = radius / tanTheta;
          const f10 = distanceToTangency / d10;
          const f12 = distanceToTangency / d12;
          const center = point1.plusScaled(bisector, distanceToCenter);
          bisector.scaleInPlace(-radius);
          perpendicular.scaleInPlace(radius / perpendicularMagnitude);
          const arc02 = Arc3d.create(center, bisector, perpendicular, AngleSweep.createStartEndRadians(-alphaRadians, alphaRadians));
          return { arc: arc02, fraction10: f10, fraction12: f12, point: point1.clone() };
        }
      }
    }
    return { fraction10: 0.0, fraction12: 0.0, point: point1.clone() };
  }
  /** Scale the vector0 and vector90 vectors by `scaleFactor` */
  public scaleAboutCenterInPlace(scaleFactor: number) {
    this._matrix.scaleColumnsInPlace(scaleFactor, scaleFactor, 1.0);
  }
  /** Return the (signed!) area between (a fractional portion of) the arc and the chord between those points */
  public areaToChordXY(fraction0: number, fraction1: number): number {
    let detJ = Geometry.crossProductXYXY(
      this._matrix.coffs[0], this._matrix.coffs[3],
      this._matrix.coffs[1], this._matrix.coffs[4]);
    // areas in arc of unit circle with radians limits
    const radians0 = this._sweep.fractionToRadians(fraction0);
    const radians1 = this._sweep.fractionToRadians(fraction1);
    // const midRadians = 0.5 * (radians0 + radians1);
    const alpha = 0.5 * (radians1 - radians0);
    if (alpha < 0.0)
      detJ = - detJ;
    const wedgeArea = Math.cos(alpha) * Math.sin(alpha);
    return (alpha - wedgeArea) * detJ;
  }
}
/**
 * Carrier structure for an arc with fractional data on incoming, outgoing curves.
 * @public
 */
export interface ArcBlendData {
  /** Constructed arc */
  arc?: Arc3d;
  /** fraction "moving backward" on the inbound curve */
  fraction10: number;
  /** fraction "moving forward" on the outbound curve */
  fraction12: number;
  /** optional reference point */
  point?: Point3d;
}
