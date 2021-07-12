/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Curve
 */
import { InterpolationCurve3d } from "../bspline/InterpolationCurve3d";
import { Clipper } from "../clipping/ClipUtils";
import { StrokeCountMap } from "../curve/Query/StrokeCountMap";
import { AxisOrder, Geometry, PlaneAltitudeEvaluator } from "../Geometry";
import { AkimaCurve3d, BezierCurve3d, BSplineCurve3d, CurveChainWithDistanceIndex, DirectSpiral3d, IntegratedSpiral3d } from "../geometry-core";
import { IStrokeHandler } from "../geometry3d/GeometryHandler";
import { Matrix3d } from "../geometry3d/Matrix3d";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/Plane3dByOriginAndUnitNormal";
import { Plane3dByOriginAndVectors } from "../geometry3d/Plane3dByOriginAndVectors";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Ray3d } from "../geometry3d/Ray3d";
import { Transform } from "../geometry3d/Transform";
import { Order2Bezier } from "../numerics/BezierPolynomials";
import { Newton1dUnboundedApproximateDerivative, NewtonEvaluatorRtoR } from "../numerics/Newton";
import { GaussMapper } from "../numerics/Quadrature";
import { Arc3d } from "./Arc3d";
import { CurveExtendOptions, VariantCurveExtendParameter } from "./CurveExtendMode";
import { CurveIntervalRole, CurveLocationDetail, CurveSearchStatus } from "./CurveLocationDetail";
import { GeometryQuery } from "./GeometryQuery";
import { LineSegment3d } from "./LineSegment3d";
import { LineString3d } from "./LineString3d";
import { StrokeOptions } from "./StrokeOptions";

/** Describes the concrete type of a [[CurvePrimitive]]. Each type name maps to a specific subclass and can be used for type-switching in conditional statements.
 *  - "arc" => [[Arc3d]]
 *  - "lineSegment" => [[LineSegment3d]]
 *  - "lineString" => [[LineString3d]]
 *  - "bsplineCurve" => [[BSplineCurve3dBase]] which is an intermediate class implemented by [[BSplineCurve3d]] and [[BSplineCurve3dH]]
 *  - "bezierCurve" => [[BezierCurveBase]] which is an intermediate class implemented by [[BezierCurve3d]] and [[BezierCurve3dH]]
 *  - "transitionSpiral" => [[TransitionSpiral3d]]
 *  - "curveChainWithDistanceIndex" => [[CurveChainWithDistanceIndex]]
 * @see [[AnyCurvePrimitive]] for a union type that supports compile-time type narrowing.
 * @public
 */
export type CurvePrimitiveType = "arc" | "lineSegment" | "lineString" | "bsplineCurve" | "bezierCurve" | "transitionSpiral" | "curveChainWithDistanceIndex" | "interpolationCurve" | "akimaCurve";

/** Union type for subclasses of [[CurvePrimitive]]. Specific subclasses can be discriminated at compile- or run-time using [[CurvePrimitive.curvePrimitiveType]].
 * @public
 */
export type AnyCurvePrimitive = Arc3d | LineSegment3d | LineString3d | BSplineCurve3d | BezierCurve3d | DirectSpiral3d | IntegratedSpiral3d | CurveChainWithDistanceIndex | InterpolationCurve3d | AkimaCurve3d;

/** function signature for callback which announces a pair of numbers, such as a fractional interval, along with a containing CurvePrimitive.
 * @public
 */
export type AnnounceNumberNumberCurvePrimitive = (a0: number, a1: number, cp: CurvePrimitive) => void;
/** Function signature for a callback which announces a pair of numbers
 * @public
 */

export type AnnounceNumberNumber = (a0: number, a1: number) => void;
/** Function signature for a callback which announces a curve primitive
 * @public
 */
export type AnnounceCurvePrimitive = (cp: CurvePrimitive) => void;
/**
 * A curve primitive is bounded
 * A curve primitive maps fractions in 0..1 to points in space.
 * As the fraction proceeds from 0 towards 1, the point moves "forward" along the curve.
 * True distance along the curve is not always strictly proportional to fraction.
 * * LineSegment3d always has proportional fraction and distance
 * * an Arc3d which is true circular has proportional fraction and distance
 * *  A LineString3d is not proportional (except for special case of all segments of equal length)
 * * A Spiral3d is proportional
 * * A BsplineCurve3d is only proportional for special cases.
 *
 * For fractions outside 0..1, the curve primitive class may either (a) return the near endpoint or (b) evaluate an extended curve.
 * @public
 */
export abstract class CurvePrimitive extends GeometryQuery {
  /** String name for schema properties */
  public readonly geometryCategory = "curvePrimitive";
  /** String name for schema properties */
  public abstract readonly curvePrimitiveType: CurvePrimitiveType;

  protected constructor() { super(); }
  /**
   * data attached during stroking for facets.
   */
  public strokeData?: StrokeCountMap;
  /**
   * data attached in curve cutting.
   * @internal
   */
  public startCut?: CurveLocationDetail;
  /**
   * data attached in curve cutting.
   * @internal
   */
  public endCut?: CurveLocationDetail;
  /**
   * data attached by various algorithms (e.g. Region booleans)
   */
  public parent?: any;

  /** Return the point (x,y,z) on the curve at fractional position.
   * @param fraction fractional position along the geometry.
   * @returns Returns a point on the curve.
   */
  public abstract fractionToPoint(fraction: number, result?: Point3d): Point3d;
  /** Return the point (x,y,z) and derivative on the curve at fractional position.
   *
   * * Note that this derivative is "derivative of xyz with respect to fraction."
   * * this derivative shows the speed of the "fractional point" moving along the curve.
   * * this is not generally a unit vector.  use fractionToPointAndUnitTangent for a unit vector.
   * @param fraction fractional position along the geometry.
   * @returns Returns a ray whose origin is the curve point and direction is the derivative with respect to the fraction.
   */
  public abstract fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
  /**
   * Returns a ray whose origin is the curve point and direction is the unit tangent.
   * @param fraction fractional position on the curve
   * @param result optional preallocated ray.
   */
  public fractionToPointAndUnitTangent(fraction: number, result?: Ray3d): Ray3d {
    const ray = this.fractionToPointAndDerivative(fraction, result);
    ray.trySetDirectionMagnitudeInPlace(1.0);
    return ray;
  }
  /**
   * Returns the (absolute) curvature magnitude.
   * * Base implementation in CurvePrimitive computes curvature from the first and second derivative vectors.
   * @param fraction fractional position on the curve
   */
  public fractionToCurvature(fraction: number): number | undefined {
    const data = this.fractionToPointAnd2Derivatives(fraction)!;
    const cross = data.vectorU.crossProduct(data.vectorV);
    const a = cross.magnitude();
    const b = data.vectorU.magnitude();
    return Geometry.conditionalDivideFraction(a, b * b * b);
  }

  /** Return a plane with
   *
   * * origin at fractional position along the curve
   * * vectorU is the first derivative, i.e. tangent vector with length equal to the rate of change with respect to the fraction.
   * * vectorV is the second derivative, i.e.derivative of vectorU.
   */
  public abstract fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined;

  /** Construct a frenet frame:
   * * origin at the point on the curve
   * * x axis is unit vector along the curve (tangent)
   * * y axis is perpendicular and in the plane of the osculating circle.
   * * z axis perpendicular to those.
   */
  public fractionToFrenetFrame(fraction: number, result?: Transform): Transform | undefined {
    const plane = this.fractionToPointAnd2Derivatives(fraction);
    if (!plane) return undefined;
    let axes = Matrix3d.createRigidFromColumns(plane.vectorU, plane.vectorV, AxisOrder.XYZ);
    if (axes)
      return Transform.createRefs(plane.origin, axes, result);
    // 2nd derivative not distinct -- do arbitrary headsUP ...
    const perpVector = Matrix3d.createPerpendicularVectorFavorXYPlane(plane.vectorU, plane.vectorV);
    axes = Matrix3d.createRigidFromColumns(plane.vectorU, perpVector, AxisOrder.XYZ);
    if (axes)
      return Transform.createRefs(plane.origin, axes, result);
    return undefined;
  }

  /**
   * Construct a point extrapolated along tangent at fraction.
   * @param fraction fractional position on the primitive
   * @param distance (signed) distance to move on the tangent.
   */
  public fractionAndDistanceToPointOnTangent(fraction: number, distance: number): Point3d {
    const ray = this.fractionToPointAndUnitTangent(fraction);
    return ray.fractionToPoint(distance);
  }

  /**
   * return the length of the curve.
   * * Curve length is always positive.
   */
  public curveLength(): number {
    const context = new CurveLengthContext();
    this.emitStrokableParts(context);
    return context.getSum();
  }
  /**
   * Returns a (high accuracy) length of the curve between fractional positions
   * * Curve length is always positive.
   * * Default implementation applies a generic gaussian integration.
   * * Most curve classes (certainly LineSegment, LineString, Arc) are expected to provide efficient implementations.
   */
  public curveLengthBetweenFractions(fraction0: number, fraction1: number): number {
    if (fraction0 === fraction1)
      return 0.0;
    const scale = this.getFractionToDistanceScale();
    if (scale !== undefined) {
      // We are in luck! simple proportions determine it all  !!!
      // (for example, a LineSegment3d or a circular arc)
      const totalLength = this.curveLength();
      return Math.abs((fraction1 - fraction0) * totalLength);
    }
    const context = new CurveLengthContext(fraction0, fraction1);
    this.emitStrokableParts(context);
    return Math.abs(context.getSum());
  }

  /**
   *
   * * Run an integration (with a default gaussian quadrature) with a fixed fractional step
   * * This is typically called by specific curve type implementations of curveLengthBetweenFractions.
   *   * For example, in Arc3d implementation of curveLengthBetweenFractions:
   *     * If the Arc3d is true circular, it the arc is true circular, use the direct `arcLength = radius * sweepRadians`
   *     * If the Arc3d is not true circular, call this method with an interval count appropriate to eccentricity and sweepRadians.
   * @returns Returns an integral estimated by numerical quadrature between the fractional positions.
   * @param fraction0 start fraction for integration
   * @param fraction1 end fraction for integration
   * @param numInterval number of quadrature intervals
   */
  public curveLengthWithFixedIntervalCountQuadrature(fraction0: number, fraction1: number, numInterval: number, numGauss: number = 5): number {
    if (fraction0 > fraction1) {
      const fSave = fraction0;
      fraction0 = fraction1;
      fraction1 = fSave;
    }
    const context = new CurveLengthContext(fraction0, fraction1, numGauss);
    context.announceIntervalForUniformStepStrokes(this, numInterval, fraction0, fraction1);
    return Math.abs(context.getSum());
  }

  /**
   *
   * * (Attempt to) find a position on the curve at a signed distance from start fraction.
   * * Return the position as a CurveLocationDetail.
   * * In the `CurveLocationDetail`, record:
   *   * `fractional` position
   *   * `fraction` = coordinates of the point
   *   * `search
   *   * `a` = (signed!) distance moved.   If `allowExtension` is false and the move reached the start or end of the curve, this distance is smaller than the requested signedDistance.
   *   * `curveSearchStatus` indicates one of:
   *     * `error` (unusual) computation failed not supported for this curve.
   *     * `success` full movement completed
   *     * `stoppedAtBoundary` partial movement completed. This can be due to either
   *        * `allowExtension` parameter sent as `false`
   *        * the curve type (e.g. bspline) does not support extended range.
   * * if `allowExtension` is true, movement may still end at the startPoint or end point for curves that do not support extended geometry (specifically bsplines)
   * * if the curve returns a value (i.e. not `undefined`) for `curve.getFractionToDistanceScale()`, the base class carries out the computation
   *    and returns a final location.
   *   * LineSegment3d relies on this.
   * * If the curve does not implement the computation or the curve has zero length, the returned `CurveLocationDetail` has
   *    * `fraction` = the value of `startFraction`
   *    * `point` = result of `curve.fractionToPoint(startFraction)`
   *    * `a` = 0
   *    * `curveStartState` = `CurveSearchStatus.error`
   * @param startFraction fractional position where the move starts
   * @param signedDistance distance to move.   Negative distance is backwards in the fraction space
   * @param allowExtension if true, all the move to go beyond the startPoint or endpoint of the curve.  If false, do not allow movement beyond the startPoint or endpoint
   * @param result optional result.
   * @returns A CurveLocationDetail annotated as above.  Note that if the curve does not support the calculation, there is still a result which contains the point at the input startFraction, with failure indicated in the `curveStartState` member
   */
  public moveSignedDistanceFromFraction(startFraction: number, signedDistance: number, allowExtension: boolean, result?: CurveLocationDetail): CurveLocationDetail {
    const scale = this.getFractionToDistanceScale();
    if (scale !== undefined) {
      // We are in luck! simple proportions determine it all  !!!
      // (for example, a LineSegment3d or a circular arc)
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
    return this.moveSignedDistanceFromFractionGeneric(startFraction, signedDistance, allowExtension, result);
  }
  /**
   * Generic algorithm to search for point at signed distance from a fractional startPoint.
   * * This will work for well for smooth curves.
   * * Curves with tangent or other low-order-derivative discontinuities may need to implement specialized algorithms.
   * * We need to find an endFraction which is the end-of-interval (usually upper) limit of integration of the tangent magnitude from startFraction to endFraction
   * * That integral is a function of endFraction.
   * * The derivative of that integral with respect to end fraction is the tangent magnitude at end fraction.
   * * Use that function and (easily evaluated!) derivative for a Newton iteration
   * * TO ALL WHO HAVE FUZZY MEMORIES OF CALCULUS CLASS: "The derivative of the integral wrt upper limit is the value of the integrand there" is the
   *       fundamental theorem of integral calculus !!! The fundamental theorem is not just an abstraction !!! It is being used
   *       here in its barest possible form !!!
   * * See https://en.wikipedia.org/wiki/Fundamental_theorem_of_calculus
   * @param startFraction
   * @param signedDistance
   * @param _allowExtension
   * @param result
   */
  protected moveSignedDistanceFromFractionGeneric(startFraction: number, signedDistance: number, allowExtension: boolean, result?: CurveLocationDetail): CurveLocationDetail {
    const limitFraction = signedDistance > 0.0 ? 1.0 : 0.0;
    const absDistance = Math.abs(signedDistance);
    const directionFactor = signedDistance < 0.0 ? -1.0 : 1.0;
    const availableLength = this.curveLengthBetweenFractions(startFraction, limitFraction);    // that is always positive
    if (availableLength < absDistance && !allowExtension)
      return CurveLocationDetail.createConditionalMoveSignedDistance(allowExtension, this, startFraction, limitFraction, signedDistance, result);
    const fractionStep = absDistance / availableLength;
    let fractionB = Geometry.interpolate(startFraction, fractionStep, limitFraction);
    let fractionA = startFraction;
    let distanceA = 0.0;
    const tol = 1.0e-12 * availableLength;
    let numConverged = 0;
    const tangent = Ray3d.createXAxis();
    // on each loop entry:
    // fractionA is the most recent endOfInterval.  (It may have been reached by a mixture of forward and backward step.)
    // distanceA is the distance to (the point at) fractionA
    // fractionB is the next end fraction
    for (let iterations = 0; iterations < 10; iterations++) {
      const distanceAB = this.curveLengthBetweenFractions(fractionA, fractionB);
      const directionAB = fractionB > fractionA ? directionFactor : -directionFactor;
      const distance0B = distanceA + directionAB * distanceAB;
      const distanceError = absDistance - distance0B;
      if (Math.abs(distanceError) < tol) {
        numConverged++;
        if (numConverged > 1)
          break;
      } else {
        numConverged = 0;
      }
      this.fractionToPointAndDerivative(fractionB, tangent);
      const tangentMagnitude = tangent.direction.magnitude();
      fractionA = fractionB;
      fractionB = fractionA + directionFactor * distanceError / tangentMagnitude;
      if (fractionA === fractionB) { // YES -- that is an exact equality test.   When it happens, there's no need for confirming with another iteration.
        numConverged = 100;
        break;
      }
      distanceA = distance0B;
    }
    if (numConverged > 1)
      return CurveLocationDetail.createConditionalMoveSignedDistance(false, this, startFraction, fractionB, signedDistance, result);

    result = CurveLocationDetail.createCurveEvaluatedFraction(this, startFraction, result);
    result.a = 0.0;
    result.curveSearchStatus = CurveSearchStatus.error;
    return result;
  }

  /**
   * * Returns true if the curve's fraction queries extend beyond 0..1.
   * * Base class default implementation returns false.
   * * These class (and perhaps others in the future) will return true:
   *   * LineSegment3d
   *   * LineString3d
   *   * Arc3d
   */
  public get isExtensibleFractionSpace(): boolean { return false; }
  /**
   * Compute a length which may be an fast approximation to the true length.
   * This is expected to be either (a) exact or (b) larger than the actual length, but by no more than
   * a small multiple, perhaps up to PI/2, but commonly much closer to 1.
   *
   * * An example use of this is for setting a tolerance which is a small multiple of the curve length.
   * * Simple line, circular arc, and transition spiral may return exact length
   * * Ellipse may return circumference of some circle or polygon that encloses the ellipse.
   * * bspline curve may return control polygon length
   * *
   */
  public abstract quickLength(): number;
  /** Search for the curve point that is closest to the spacePoint.
   *
   * * If the space point is exactly on the curve, this is the reverse of fractionToPoint.
   * * Since CurvePrimitive should always have start and end available as candidate points, this method should always succeed
   * @param spacePoint point in space
   * @param extend true to extend the curve (if possible), false for no extend, single CurveExtendOptions (for both directions), or array of distinct CurveExtendOptions for start and end.
   * @returns Returns a CurveLocationDetail structure that holds the details of the close point.
   */
  public closestPoint(spacePoint: Point3d, extend: VariantCurveExtendParameter): CurveLocationDetail | undefined {
    const strokeHandler = new ClosestPointStrokeHandler(spacePoint, extend);
    this.emitStrokableParts(strokeHandler);
    return strokeHandler.claimResult();
  }
  /**
   * Find intervals of this curvePrimitive that are interior to a clipper
   * @param clipper clip structure (e.g. clip planes)
   * @param announce (optional) function to be called announcing fractional intervals"  ` announce(fraction0, fraction1, curvePrimitive)`
   * @returns true if any "in" segments are announced.
   */
  public announceClipIntervals(_clipper: Clipper, _announce?: AnnounceNumberNumberCurvePrimitive): boolean {
    // DEFAULT IMPLEMENTATION -- no interior parts
    return false;
  }

  /** Return (if possible) a curve primitive which is a portion of this curve.
   * @param _fractionA [in] start fraction
   * @param _fractionB [in] end fraction
   */
  public clonePartialCurve(_fractionA: number, _fractionB: number): CurvePrimitive | undefined {
    return undefined;
  }
  /**
   * * If the curve primitive has distance-along-curve strictly proportional to curve fraction, return true
   * * If distance-along-the-curve is not proportional, return undefined.
   * * When defined, the scale factor is always the length of the curve.
   * * This scale factor is typically available for these curve types:
   * * * All `LineSegment3d`
   * * * Arc3d which is a true circular arc (axes perpendicular and of equal length).
   * * * CurveChainWithDistanceIndex
   * * This scale factor is undefined for these curve types:
   * * * Arc3d which is a true ellipse, i.e. unequal lengths of defining vectors or non-perpendicular defining vectors.
   * * * bspline and bezier curves
   * @returns scale factor or undefined
   */
  public getFractionToDistanceScale(): number | undefined { return undefined; }

  /** Reverse the curve's data so that its fractional stroking moves in the opposite direction. */
  public abstract reverseInPlace(): void;
  /**
   * Compute intersections with a plane.
   * * The intersections are appended to the result array.
   * * The base class implementation emits strokes to an AppendPlaneIntersectionStrokeHandler object, which uses a Newton iteration to get
   *     high-accuracy intersection points within strokes.
   * * Derived classes should override this default implementation if there are easy analytic solutions.
   * * Derived classes are free to implement extended intersections (e.g. arc!!!)
   * @param plane The plane to be intersected.
   * @param result Array to receive intersections
   * @returns Return the number of CurveLocationDetail's added to the result array.
   */
  public appendPlaneIntersectionPoints(plane: PlaneAltitudeEvaluator, result: CurveLocationDetail[]): number {
    const strokeHandler = new AppendPlaneIntersectionStrokeHandler(plane, result);
    const n0 = result.length;
    this.emitStrokableParts(strokeHandler);
    return result.length - n0;
  }
  /**
   * Examine contents of an array of CurveLocationDetail.
   * Filter the intersections according to the parameters.
   * @param allowExtend if false, remove points on the extension.
   * @param applySnappedCoordinates if true, change the stored fractions and coordinates to exact end values.  Otherwise
   *     use the exact values only for purpose of updating the curveIntervalRole.
   * @param startEndFractionTolerance if nonzero, adjust fraction to 0 or 1 with this tolerance.
   * @param startEndXYZTolerance if nonzero, adjust to endpoint with this tolerance.
   * @internal
   */
  public static snapAndRestrictDetails(
    details: CurveLocationDetail[],
    allowExtend: boolean = true,
    applySnappedCoordinates: boolean = false,
    startEndFractionTolerance = Geometry.smallAngleRadians,
    startEndXYZTolerance = Geometry.smallMetricDistance) {
    const n0 = details.length;
    let acceptIndex = 0;
    const point0 = Point3d.create();
    const point1 = Point3d.create();
    let snappedCoordinates: Point3d | undefined;
    for (let candidateIndex = 0; candidateIndex < n0; candidateIndex++) {
      snappedCoordinates = undefined;
      const detail = details[candidateIndex];
      let fraction = detail.fraction;
      let accept = allowExtend || Geometry.isIn01(fraction);
      if (detail.curve) {
        detail.curve.startPoint(point0);
        detail.curve.endPoint(point1);
      }

      if (startEndFractionTolerance > 0) {
        if (Math.abs(fraction) < startEndFractionTolerance) {
          fraction = 0.0;
          accept = true;
          detail.intervalRole = CurveIntervalRole.isolatedAtVertex;
          snappedCoordinates = point0;
        }
        if (Math.abs(fraction - 1.0) < startEndFractionTolerance) {
          fraction = 1.0;
          accept = true;
          detail.intervalRole = CurveIntervalRole.isolatedAtVertex;
          snappedCoordinates = point1;
          if (detail.curve)
            snappedCoordinates = detail.curve.startPoint(point1);
        }
      }
      if (startEndXYZTolerance > 0 && detail.curve !== undefined) {
        // REMARK: always test both endpoints.   If there is a cyclic fraction space, an intersection marked as "after" the end might have wrapped all the way to the beginning.
        if (detail.point.distance(point0) <= startEndXYZTolerance) {
          fraction = 0.0;
          detail.intervalRole = CurveIntervalRole.isolatedAtVertex;
          snappedCoordinates = point0;
        } else if (detail.point.distance(point1) <= startEndXYZTolerance) {
          fraction = 1.0;
          detail.intervalRole = CurveIntervalRole.isolatedAtVertex;
          snappedCoordinates = point1;
        }
      }
      if (accept) {
        if (applySnappedCoordinates) {
          detail.fraction = fraction;
          if (snappedCoordinates !== undefined)
            detail.point.setFrom(snappedCoordinates);
        }
        if (acceptIndex < candidateIndex)
          details[acceptIndex] = detail;
        acceptIndex++;
      }

    }
    if (acceptIndex < n0)
      details.length = acceptIndex;

  }

  /** Ask if the curve is within tolerance of a plane.
   * @returns Returns true if the curve is completely within tolerance of the plane.
   */
  public abstract isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  /** return the startPoint of the primitive.  The default implementation returns fractionToPoint (0.0) */
  public startPoint(result?: Point3d): Point3d { return this.fractionToPoint(0.0, result); }
  /** return the end point of the primitive. The default implementation returns fractionToPoint(1.0) */
  public endPoint(result?: Point3d): Point3d { return this.fractionToPoint(1.0, result); }
  /** Add strokes to caller-supplied linestring */
  public abstract emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
  /** Ask the curve to announce points and simple subcurve fragments for stroking.
   * See IStrokeHandler for description of the sequence of the method calls.
   */
  public abstract emitStrokableParts(dest: IStrokeHandler, options?: StrokeOptions): void;
  /**
   * return the stroke count required for given options.
   * * This returns a single number
   * * See computeComponentStrokeCountForOptions to get structured per-component counts and fraction mappings.
   * @param options StrokeOptions that determine count
   */
  public abstract computeStrokeCountForOptions(options?: StrokeOptions): number;

  /**
   * attach StrokeCountMap structure to this primitive (and recursively to any children)
   * * Base class implementation (here) gets the simple count from computeStrokeCountForOptions and attaches it.
   * * LineString3d, arc3d, BezierCurve3d, BezierCurve3dH accept that default.
   * * Subdivided primitives (linestring, bspline curve) implement themselves and attach a StrokeCountMap containing the
   *       total count, and also containing an array of StrokeCountMap per component.
   * * For CurvePrimitiveWithDistanceIndex, the top level gets (only) a total count, and each child gets
   *       its own StrokeCountMap with appropriate structure.
   * @param options StrokeOptions that determine count
   * @param parentStrokeMap optional map from parent.  Its count, curveLength, and a1 values are increased with count and distance from this primitive.
   * @return sum of `a0+this.curveLength()`, for use as `a0` of successor in chain.
   */
  public computeAndAttachRecursiveStrokeCounts(options?: StrokeOptions, parentMap?: StrokeCountMap) {
    const n = this.computeStrokeCountForOptions(options);
    const a = this.curveLength();
    CurvePrimitive.installStrokeCountMap(
      this,
      StrokeCountMap.createWithCurvePrimitive(this, n, a, 0, a),
      parentMap);
  }

  /**
   * * evaluate strokes at fractions indicated in a StrokeCountMap.
   *   * Base class implementation (here) gets the simple count from computeStrokeCountForOptions and strokes at uniform fractions.
   *   * LineString3d, arc3d, BezierCurve3d, BezierCurve3dH accept that default.
   *   * Subdivided primitives (linestring, bspline curve) implement themselves and evaluate within components.
   *   * CurvePrimitiveWithDistanceIndex recurses to its children.
   * * if packedFraction and packedDerivative arrays are present in the LineString3d, fill them.
   * @param map = stroke count data.
   * @param linestring = receiver linestring.
   * @return number of strokes added.  0 if any errors matching the map to the curve primitive.
   */
  public addMappedStrokesToLineString3D(map: StrokeCountMap, linestring: LineString3d): number {
    const numPoint0 = linestring.numPoints();
    if (map.primitive && map.primitive === this && map.numStroke > 0) {
      for (let i = 0; i <= map.numStroke; i++) {
        const fraction = i / map.numStroke;
        linestring.appendFractionToPoint(this, fraction);
      }
    }
    return linestring.numPoints() - numPoint0;
  }

  /**
   * final install step to save curveMap in curve.  If parentMap is given, update its length, count, and a1 fields
   * @param curve curve to receive the annotation
   * @param map
   * @param parentMap
   */
  public static installStrokeCountMap(curve: CurvePrimitive, curveMap: StrokeCountMap, parentMap?: StrokeCountMap) {
    if (parentMap)
      parentMap.addToCountAndLength(curveMap.numStroke, curveMap.curveLength);
    curve.strokeData = curveMap;
  }
  /**
   * Return an array containing only the curve primitives.
   * * This DEFAULT simply pushes `this` to the collectorArray.
   * * CurvePrimitiveWithDistanceIndex optionally collects its members.
   * @param collectorArray array to receive primitives (pushed -- the array is not cleared)
   * @param smallestPossiblePrimitives if false, CurvePrimitiveWithDistanceIndex returns only itself.  If true, it recurses to its (otherwise hidden) children.
   */
  public collectCurvePrimitivesGo(collectorArray: CurvePrimitive[], _smallestPossiblePrimitives: boolean, _explodeLinestrings: boolean = false) {
    collectorArray.push(this);
  }

  /**
   * Return an array containing only the curve primitives.
   * * This DEFAULT captures the default result construction and calls collectCurvePrimitivesGo
   * @param collectorArray optional array to receive primitives.   If present, new primitives are ADDED (without clearing the array.)
   * @param smallestPossiblePrimitives if false, CurvePrimitiveWithDistanceIndex returns only itself.  If true, it recurses to its (otherwise hidden) children.
   */
  public collectCurvePrimitives(collectorArray?: CurvePrimitive[], smallestPossiblePrimitives: boolean = false,
    explodeLinestrings: boolean = false): CurvePrimitive[] {
    const results: CurvePrimitive[] = collectorArray === undefined ? [] : collectorArray;
    this.collectCurvePrimitivesGo(results, smallestPossiblePrimitives, explodeLinestrings);
    return results;
  }

}

/** Intermediate class for managing the parentCurve announcements from an IStrokeHandler */
abstract class NewtonRotRStrokeHandler extends NewtonEvaluatorRtoR {
  protected _parentCurvePrimitive: CurvePrimitive | undefined;
  constructor() {
    super();
    this._parentCurvePrimitive = undefined;
  }
  /** retain the parentCurvePrimitive.
   * * Calling this method tells the handler that the parent curve is to be used for detail searches.
   * * Example: Transition spiral search is based on linestring first, then the exact spiral.
   * * Example: CurveChainWithDistanceIndex does NOT do this announcement -- the constituents act independently.
   */
  public startParentCurvePrimitive(curve: CurvePrimitive | undefined) { this._parentCurvePrimitive = curve; }
  /** Forget the parentCurvePrimitive */
  public endParentCurvePrimitive(_curve: CurvePrimitive | undefined) { this._parentCurvePrimitive = undefined; }
}

class AppendPlaneIntersectionStrokeHandler extends NewtonRotRStrokeHandler implements IStrokeHandler {
  private _curve: CurvePrimitive | undefined;
  private _plane: PlaneAltitudeEvaluator;
  private _intersections: CurveLocationDetail[];
  private _fractionA: number = 0;
  private _functionA: number = 0;
  // private derivativeA: number;   <---- Not currently used
  private _functionB: number = 0;
  private _fractionB: number = 0;
  private _derivativeB: number = 0;
  private _numThisCurve: number = 0;
  // scratch vars for use within methods.
  private _ray: Ray3d;
  private _newtonSolver: Newton1dUnboundedApproximateDerivative;

  // Return the first defined curve among: this.parentCurvePrimitive, this.curve;
  public effectiveCurve(): CurvePrimitive | undefined {
    if (this._parentCurvePrimitive)
      return this._parentCurvePrimitive;
    return this._curve;
  }
  public get getDerivativeB() { return this._derivativeB; }    // <--- DerivativeB is not currently used anywhere. Provided getter to suppress tslint error

  public constructor(plane: PlaneAltitudeEvaluator, intersections: CurveLocationDetail[]) {
    super();
    this._plane = plane;
    this._intersections = intersections;
    this.startCurvePrimitive(undefined);
    this._ray = Ray3d.createZero();
    this._newtonSolver = new Newton1dUnboundedApproximateDerivative(this);
  }
  public startCurvePrimitive(curve: CurvePrimitive | undefined) {
    this._curve = curve;
    this._fractionA = 0.0;
    this._numThisCurve = 0;
    this._functionA = 0.0;
    // this.derivativeA = 0.0;
  }
  public endCurvePrimitive() { }
  public announceIntervalForUniformStepStrokes(
    cp: CurvePrimitive,
    numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    this.startCurvePrimitive(cp);
    if (numStrokes < 1) numStrokes = 1;
    const df = 1.0 / numStrokes;
    for (let i = 0; i <= numStrokes; i++) {
      const fraction = Geometry.interpolate(fraction0, i * df, fraction1);
      cp.fractionToPointAndDerivative(fraction, this._ray);
      this.announcePointTangent(this._ray.origin, fraction, this._ray.direction);
    }
  }
  public announceSegmentInterval(
    _cp: CurvePrimitive,
    point0: Point3d,
    point1: Point3d,
    _numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    const h0 = this._plane.altitude(point0);
    const h1 = this._plane.altitude(point1);
    if (h0 * h1 > 0.0)
      return;
    const fraction01 = Order2Bezier.solveCoffs(h0, h1);
    // let numIntersection = 0;
    if (fraction01 !== undefined) {
      // numIntersection++;
      const fraction = Geometry.interpolate(fraction0, fraction01, fraction1);
      this._newtonSolver.setX(fraction);
      if (this._newtonSolver.runIterations()) {
        this.announceSolutionFraction(this._newtonSolver.getX());
      }
      // this.intersections.push(CurveLocationDetail.createCurveFractionPoint(cp, fraction, cp.fractionToPoint(fraction)));
    }
  }
  private announceSolutionFraction(fraction: number) {
    const curve = this.effectiveCurve();
    if (curve) {
      this._ray = curve.fractionToPointAndDerivative(fraction, this._ray);
      this._intersections.push(CurveLocationDetail.createCurveFractionPoint(curve, fraction, this._ray.origin));
    }
  }
  public evaluate(fraction: number): boolean {
    const curve = this.effectiveCurve();
    if (!curve)
      return false;
    this.currentF = this._plane.altitude(curve.fractionToPoint(fraction));
    return true;
  }
  /**
   * * ASSUME both the "A" and "B"  evaluations (fraction, function, and derivative) are known.
   * * If function value changed sign between, interpolate an approximate root and improve it with
   *     the newton solver.
   */
  private searchInterval() {
    if (this._functionA * this._functionB > 0) return;
    if (this._functionA === 0) this.announceSolutionFraction(this._fractionA);
    if (this._functionB === 0) this.announceSolutionFraction(this._fractionB);
    if (this._functionA * this._functionB < 0) {
      const fraction = Geometry.inverseInterpolate(this._fractionA, this._functionA, this._fractionB, this._functionB);
      if (fraction) {
        this._newtonSolver.setX(fraction);
        if (this._newtonSolver.runIterations())
          this.announceSolutionFraction(this._newtonSolver.getX());
      }
    }
  }
  /** Evaluate and save _functionB, _derivativeB, and _fractionB. */
  private evaluateB(xyz: Point3d, fraction: number, tangent: Vector3d) {
    this._functionB = this._plane.altitude(xyz);
    this._derivativeB = this._plane.velocity(tangent);
    this._fractionB = fraction;
  }
  /**
   * Announce point and tangent for evaluations.
   * * The function evaluation is saved as the "B" function point.
   * * The function point count is incremented
   * * If function point count is greater than 1, the current interval is searched.
   * * The just-evaluated point ("B") is saved as the "old" ("A") evaluation point.
   * @param xyz
   * @param fraction
   * @param tangent
   */
  public announcePointTangent(xyz: Point3d, fraction: number, tangent: Vector3d): void {
    this.evaluateB(xyz, fraction, tangent);
    if (this._numThisCurve++ > 0) this.searchInterval();
    this._functionA = this._functionB;
    this._fractionA = this._fractionB;
  }
}

class CurveLengthContext implements IStrokeHandler {
  private _curve: CurvePrimitive | undefined;
  private _summedLength: number;
  private _ray: Ray3d;
  private _fraction0: number;
  private _fraction1: number;
  private _gaussMapper: GaussMapper;

  private tangentMagnitude(fraction: number): number {
    this._ray = (this._curve as CurvePrimitive).fractionToPointAndDerivative(fraction, this._ray);
    return this._ray.direction.magnitude();
  }
  public getSum() { return this._summedLength; }

  public constructor(fraction0: number = 0.0, fraction1: number = 1.0, numGaussPoints: number = 5) {
    this.startCurvePrimitive(undefined);
    this._summedLength = 0.0;
    this._ray = Ray3d.createZero();
    if (fraction0 < fraction1) {
      this._fraction0 = fraction0;
      this._fraction1 = fraction1;
    } else {
      this._fraction0 = fraction1;
      this._fraction1 = fraction0;
    }
    this._gaussMapper = new GaussMapper(numGaussPoints);
  }
  public startCurvePrimitive(curve: CurvePrimitive | undefined) {
    this._curve = curve;
  }
  public startParentCurvePrimitive(_curve: CurvePrimitive) { }
  public endParentCurvePrimitive(_curve: CurvePrimitive) { }

  public endCurvePrimitive() { }
  public announceIntervalForUniformStepStrokes(
    cp: CurvePrimitive,
    numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    if (fraction0 < this._fraction0) fraction0 = this._fraction0;
    if (fraction1 > this._fraction1) fraction1 = this._fraction1;
    if (fraction1 > fraction0) {
      this.startCurvePrimitive(cp);
      if (numStrokes < 1) numStrokes = 1;
      const df = 1.0 / numStrokes;
      for (let i = 1; i <= numStrokes; i++) {
        const fractionA = Geometry.interpolate(fraction0, (i - 1) * df, fraction1);
        const fractionB = i === numStrokes ? fraction1 : Geometry.interpolate(fraction0, (i) * df, fraction1);
        const numGauss = this._gaussMapper.mapXAndW(fractionA, fractionB);
        for (let k = 0; k < numGauss; k++) {
          this._summedLength += this._gaussMapper.gaussW[k] * this.tangentMagnitude(this._gaussMapper.gaussX[k]);
        }
      }
    }
  }
  public announceSegmentInterval(
    _cp: CurvePrimitive,
    point0: Point3d,
    point1: Point3d,
    _numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    const segmentLength = point0.distance(point1);
    if (this._fraction0 <= fraction0 && fraction1 <= this._fraction1)
      this._summedLength += segmentLength;
    else {
      let g0 = fraction0;
      let g1 = fraction1;
      if (g0 < this._fraction0) g0 = this._fraction0;
      if (g1 > this._fraction1) g1 = this._fraction1;
      if (g1 > g0) {
        this._summedLength += segmentLength * (g1 - g0) / (fraction1 - fraction0);
      }
    }
  }
  public announcePointTangent(_xyz: Point3d, _fraction: number, _tangent: Vector3d): void {
    // uh oh -- need to retain point for next interval
  }
}
// context for searching for closest point .. .
class ClosestPointStrokeHandler extends NewtonRotRStrokeHandler implements IStrokeHandler {
  private _curve: CurvePrimitive | undefined;
  private _closestPoint: CurveLocationDetail | undefined;
  private _spacePoint: Point3d;
  private _extend: VariantCurveExtendParameter;
  private _fractionA: number = 0;
  private _functionA: number = 0;
  private _functionB: number = 0;
  private _fractionB: number = 0;
  private _numThisCurve: number = 0;
  // scratch vars for use within methods.
  private _workPoint: Point3d;
  private _workRay: Ray3d;
  private _newtonSolver: Newton1dUnboundedApproximateDerivative;

  public constructor(spacePoint: Point3d, extend: VariantCurveExtendParameter) {
    super();
    this._spacePoint = spacePoint;
    this._workPoint = Point3d.create();
    this._workRay = Ray3d.createZero();
    this._closestPoint = undefined;
    this._extend = extend;
    this.startCurvePrimitive(undefined);
    this._newtonSolver = new Newton1dUnboundedApproximateDerivative(this);
  }

  public claimResult(): CurveLocationDetail | undefined {
    if (this._closestPoint) {
      this._newtonSolver.setX(this._closestPoint.fraction);
      this._curve = this._closestPoint.curve;
      if (this._newtonSolver.runIterations()) {
        let fraction = this._newtonSolver.getX();
        fraction = CurveExtendOptions.correctFraction(this._extend, fraction);
        this.announceSolutionFraction(fraction);
      }
    }
    return this._closestPoint;
  }
  public startCurvePrimitive(curve: CurvePrimitive | undefined) {
    this._curve = curve;
    this._fractionA = 0.0;
    this._numThisCurve = 0;
    this._functionA = 0.0;
  }
  public endCurvePrimitive() { }
  public announceIntervalForUniformStepStrokes(
    cp: CurvePrimitive,
    numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    this.startCurvePrimitive(cp);
    if (numStrokes < 1) numStrokes = 1;
    const df = 1.0 / numStrokes;
    for (let i = 0; i <= numStrokes; i++) {
      const fraction = Geometry.interpolate(fraction0, i * df, fraction1);
      cp.fractionToPointAndDerivative(fraction, this._workRay);
      this.announceRay(fraction, this._workRay);
    }
  }

  private announceCandidate(cp: CurvePrimitive, fraction: number, point: Point3d) {
    const distance = this._spacePoint.distance(point);
    if (this._closestPoint && distance > this._closestPoint.a)
      return;
    this._closestPoint = CurveLocationDetail.createCurveFractionPoint(cp, fraction, point, this._closestPoint);
    this._closestPoint.a = distance;
    if (this._parentCurvePrimitive !== undefined)
      this._closestPoint.curve = this._parentCurvePrimitive;
  }
  public announceSegmentInterval(
    cp: CurvePrimitive,
    point0: Point3d,
    point1: Point3d,
    _numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    let localFraction = this._spacePoint.fractionOfProjectionToLine(point0, point1, 0.0);
    // only consider extending the segment if the immediate caller says we are at endpoints ...
    if (!this._extend)
      localFraction = Geometry.clampToStartEnd(localFraction, 0.0, 1.0);
    else {
      if (fraction0 !== 0.0)
        localFraction = Math.max(localFraction, 0.0);
      if (fraction1 !== 1.0)
        localFraction = Math.min(localFraction, 1.0);
    }
    this._workPoint = point0.interpolate(localFraction, point1);
    const globalFraction = Geometry.interpolate(fraction0, localFraction, fraction1);
    this.announceCandidate(cp, globalFraction, this._workPoint);
  }
  private searchInterval() {
    if (this._functionA * this._functionB > 0) return;
    if (this._functionA === 0) this.announceSolutionFraction(this._fractionA);
    if (this._functionB === 0) this.announceSolutionFraction(this._fractionB);
    if (this._functionA * this._functionB < 0) {
      const fraction = Geometry.inverseInterpolate(this._fractionA, this._functionA, this._fractionB, this._functionB);
      if (fraction) {
        this._newtonSolver.setX(fraction);
        if (this._newtonSolver.runIterations())
          this.announceSolutionFraction(this._newtonSolver.getX());
      }
    }
  }
  private evaluateB(fractionB: number, dataB: Ray3d) {
    this._functionB = dataB.dotProductToPoint(this._spacePoint);
    this._fractionB = fractionB;
  }
  private announceSolutionFraction(fraction: number) {
    if (this._curve)
      this.announceCandidate(this._curve, fraction, this._curve.fractionToPoint(fraction));
  }
  public evaluate(fraction: number): boolean {
    let curve = this._curve;
    if (this._parentCurvePrimitive)
      curve = this._parentCurvePrimitive;
    if (curve) {
      this._workRay = curve.fractionToPointAndDerivative(fraction, this._workRay);
      this.currentF = this._workRay.dotProductToPoint(this._spacePoint);
      return true;
    }
    return false;
  }
  public announceRay(fraction: number, data: Ray3d): void {
    this.evaluateB(fraction, data);
    if (this._numThisCurve++ > 0) this.searchInterval();
    this._functionA = this._functionB;
    this._fractionA = this._fractionB;
  }
  public announcePointTangent(point: Point3d, fraction: number, tangent: Vector3d) {
    this._workRay.set(point, tangent);
    this.announceRay(fraction, this._workRay);
  }
}
