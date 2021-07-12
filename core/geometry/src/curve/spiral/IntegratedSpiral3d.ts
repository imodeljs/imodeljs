/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Curve
 */

import { TransitionSpiral3d } from "./TransitionSpiral3d";
import { Segment1d } from "../../geometry3d/Segment1d";
import { AngleSweep } from "../../geometry3d/AngleSweep";
import { Transform } from "../../geometry3d/Transform";
import { LineString3d } from "../LineString3d";
import { NormalizedTransition } from "./NormalizedTransition";
import { TransitionConditionalProperties } from "./TransitionConditionalProperties";
import { Quadrature } from "../../numerics/Quadrature";
import { Point3d } from "../../geometry3d/Point3dVector3d";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Angle } from "../../geometry3d/Angle";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/Plane3dByOriginAndUnitNormal";
import { AxisOrder, Geometry } from "../../Geometry";
import { StrokeOptions } from "../StrokeOptions";
import { GeometryHandler, IStrokeHandler } from "../../geometry3d/GeometryHandler";
import { Ray3d } from "../../geometry3d/Ray3d";
import { Plane3dByOriginAndVectors } from "../../geometry3d/Plane3dByOriginAndVectors";
import { Range3d } from "../../geometry3d/Range";
import { GeometryQuery } from "../GeometryQuery";
/**
 * An IntegratedSpiral3d is a curve defined by integrating its curvature.
 * * The first integral of curvature (with respect to distance along the curve) is the bearing angle (in radians)
 * * Integrating (cos(theta), sin(theta)) gives displacement from the start point, and thus the actual curve position.
 * * The curvature functions of interest are all symmetric snap functions in the NormalizedTransition class.
 * * `TransitionConditionalProperties` implements the computations of the interrelationship of radii, bearing, and length.
 * @public
 */
export class IntegratedSpiral3d extends TransitionSpiral3d {
  /** String name for schema properties */
  public readonly curvePrimitiveType = "transitionSpiral";

  /** start and end radii as a Segment1d */
  public radius01: Segment1d;
  /** start and end bearings as an AngleSweep */
  public bearing01: AngleSweep;
  /** stroked approximation of entire spiral. */
  private _globalStrokes: LineString3d;
  /** stroked approximation of active spiral.
   * * Same count as global -- possibly overly fine, but it gives some consistency between same clothoid constructed as partial versus complete.
   * * If no trimming, this points to the same place as the _globalStrokes !!!  Don't double transform!!!
   */
  private _activeStrokes?: LineString3d;
  /** Return the internal stroked form of the (possibly partial) spiral   */
  public get activeStrokes(): LineString3d { return this._activeStrokes !== undefined ? this._activeStrokes : this._globalStrokes; }
  private _evaluator: NormalizedTransition;
  /** Total curve arc length (computed) */
  private _arcLength01: number;
  /** Curvatures (inverse radii) at start and end */
  private _curvature01: Segment1d;
  /** evaluator for transition */
  // constructor demands all bearing, radius, and length data -- caller determines usual dependency of "any 4 determine the 5th"
  private constructor(spiralType: string | undefined,
    evaluator: NormalizedTransition,
    radius01: Segment1d,
    bearing01: AngleSweep,
    activeFractionInterval: Segment1d,
    localToWorld: Transform,
    arcLength: number,
    properties: TransitionConditionalProperties | undefined) {
    super(spiralType, localToWorld, activeFractionInterval, properties);
    this._evaluator = evaluator;
    this.radius01 = radius01;
    this.bearing01 = bearing01;
    this._arcLength01 = arcLength;
    this._globalStrokes = LineString3d.create();
    // initialize for compiler -- but this will be recomputed in refreshComputeProperties ...
    this._curvature01 = Segment1d.create(0, 1);
    this.refreshComputedProperties();
  }
  /** default spiral type name. (clothoid) */
  public static readonly defaultSpiralType = "clothoid";

  /** use the integrated function to return an angle at fractional position. */

  public globalFractionToBearingRadians(fraction: number): number {
    const areaFraction = this._evaluator.fractionToArea(fraction);
    const dx = this._arcLength01;
    return this.bearing01.startRadians + areaFraction * dx * this._curvature01.signedDelta() + fraction * this._curvature01.x0 * dx;
  }
  /** use the integrated function to return an angle at fractional position. */
  public globalFractionToCurvature(fraction: number): number {
    const f = this._evaluator.fractionToCurvatureFraction(fraction);
    return this._curvature01.fractionToPoint(f);
  }

  /** Return the bearing at given fraction of the active interval .... */

  public fractionToBearingRadians(activeFraction: number): number {
    const fraction = this.activeFractionInterval.fractionToPoint(activeFraction);
    return this.bearing01.startRadians + fraction * this._arcLength01 * (this._curvature01.x0 + 0.5 * fraction * (this._curvature01.x1 - this._curvature01.x0));
  }
  /** Return the curvature at given fraction of the active interval ...
   * * The `undefined` result is to match the abstract class -- it cannot actually occur.
   */
  public override fractionToCurvature(activeFraction: number): number | undefined {
    // BUG? active interval
    return this._curvature01.fractionToPoint(this.activeFractionInterval.fractionToPoint(activeFraction));
  }

  // These static variables are reused on calls to integrateFromStartFraction

  private static _gaussFraction: Float64Array;
  private static _gaussWeight: Float64Array;
  private static _gaussMapper: (xA: number, xB: number, arrayX: Float64Array, arrayW: Float64Array) => number;
  /** Initialize class level work arrays. */
  public static initWorkSpace() {
    IntegratedSpiral3d._gaussFraction = new Float64Array(5);
    IntegratedSpiral3d._gaussWeight = new Float64Array(5);
    IntegratedSpiral3d._gaussMapper = Quadrature.setupGauss5;
  }
  /** Evaluate and sum the gauss quadrature formulas to integrate cos(theta), sin(theta) fractional subset of a reference length.
   * (recall that theta is a nonlinear function of the fraction.)
   * * This is a single interval of gaussian integration.
   * * The fraction is on the full spiral (not in the mapped active interval)
   * @param xyz advancing integrated point.
   * @param fractionA fraction at start of interval
   * @param fractionB fraction at end of interval.
   * @param unitArcLength length of curve for 0 to 1 fractional
   */
  private fullSpiralIncrementalIntegral(xyz: Point3d, fractionA: number, fractionB: number, applyMatrix: boolean) {
    const gaussFraction = IntegratedSpiral3d._gaussFraction;
    const gaussWeight = IntegratedSpiral3d._gaussWeight;
    const numEval = IntegratedSpiral3d._gaussMapper(fractionA, fractionB, gaussFraction, gaussWeight);
    const deltaL = this._arcLength01;
    let w = 0;
    let dx = 0.0;
    let dy = 0.0;
    for (let k = 0; k < numEval; k++) {
      const radians = this.globalFractionToBearingRadians(gaussFraction[k]);
      w = gaussWeight[k] * deltaL;
      dx += w * Math.cos(radians);
      dy += w * Math.sin(radians);
    }
    if (applyMatrix)
      Matrix3d.xyzPlusMatrixTimesXYZ(xyz, this.localToWorld.matrix, { x: dx, y: dy, z: 0.0 }, xyz);
    else
      xyz.addXYZInPlace(dx, dy, 0.0);

  }
  /** Recompute strokes */
  public refreshComputedProperties() {
    this._curvature01 = Segment1d.create(
      TransitionSpiral3d.radiusToCurvature(this.radius01.x0),
      TransitionSpiral3d.radiusToCurvature(this.radius01.x1));
    this._globalStrokes.clear();
    const currentPoint = Point3d.create();
    this._globalStrokes.appendStrokePoint(currentPoint);
    const numInterval = 16;

    const fractionStep = 1.0 / numInterval;
    for (let i = 1; i <= numInterval; i++) {
      const fraction0 = (i - 1) * fractionStep;
      const fraction1 = i * fractionStep;
      this.fullSpiralIncrementalIntegral(currentPoint, fraction0, fraction1, false);
      this._globalStrokes.appendStrokePoint(currentPoint);
    }
    this._globalStrokes.tryTransformInPlace(this.localToWorld);
    if (!this.activeFractionInterval.isExact01) {
      if (this._activeStrokes === undefined)
        this._activeStrokes = LineString3d.create();
      this._activeStrokes.clear();
      // finer strokes in the active interval ... same fraction step, but mapped
      // This assumes factionToPoint acts normally within refreshComputedProperties -- that depends on the global strokes we just computed, but not on the active strokes
      for (let i = 0; i <= numInterval; i++) {
        const localFraction = i * fractionStep;
        this._activeStrokes.addPoint(this.fractionToPoint(localFraction));
      }
    }
  }
  /**
   * Create a transition spiral with radius and bearing conditions.
   * @param radius01 radius (inverse curvature) at start and end. (radius of zero means straight line)
   * @param bearing01 bearing angles at start and end.  bearings are measured from the x axis, positive clockwise towards y axis
   * @param activeFractionInterval fractional limits of the active portion of the spiral.
   * @param localToWorld placement frame.  Fractional coordinate 0 is at the origin.
   */
  public static createRadiusRadiusBearingBearing(radius01: Segment1d, bearing01: AngleSweep, activeFractionInterval: Segment1d, localToWorld: Transform, typeName?: string) {
    const arcLength = TransitionSpiral3d.radiusRadiusSweepRadiansToArcLength(radius01.x0, radius01.x1, bearing01.sweepRadians);
    if (typeName === undefined)
      typeName = "clothoid";
    const evaluator = NormalizedTransition.findEvaluator(typeName);
    if (!evaluator)
      return undefined;
    return new IntegratedSpiral3d(typeName, evaluator,
      radius01.clone(),
      bearing01.clone(), activeFractionInterval.clone(), localToWorld.clone(), arcLength,
      new TransitionConditionalProperties(radius01.x0, radius01.x1,
        bearing01.startAngle.clone(), bearing01.endAngle.clone(),
        undefined));
  }
  /**
   * Create a transition spiral.
   * * Inputs must provide exactly 4 of the 5 values `[radius0,radius1,bearing0,bearing1,length`.
   * @param spiralType one of "clothoid", "bloss", "biquadratic", "cosine", "sine".  If undefined, "clothoid" is used.
   * @param radius0 radius (or 0 for tangent to line) at start
   * @param radius1 radius (or 0 for tangent to line) at end
   * @param bearing0 bearing, measured CCW from x axis at start.
   * @param bearing1 bearing, measured CCW from x axis at end.
   * @param fractionInterval optional fractional interval for an "active" portion of the curve.   if omitted, the full [0,1] is used.
   * @param localToWorld placement transform
   */
  public static createFrom4OutOf5(
    spiralType: string | undefined,
    radius0: number | undefined,
    radius1: number | undefined,
    bearing0: Angle | undefined,
    bearing1: Angle | undefined,
    arcLength: number | undefined,
    fractionInterval: undefined | Segment1d,
    localToWorld: Transform): IntegratedSpiral3d | undefined {
    if (spiralType === undefined)
      spiralType = "clothoid";
    const evaluator = NormalizedTransition.findEvaluator(spiralType);
    if (!evaluator)
      return undefined;
    const data = new TransitionConditionalProperties(radius0, radius1, bearing0, bearing1, arcLength);
    const data1 = data.clone();
    if (!data.tryResolveAnySingleUnknown())
      return undefined;
    if (fractionInterval === undefined)
      fractionInterval = Segment1d.create(0, 1);
    return new IntegratedSpiral3d(
      spiralType,
      evaluator,
      Segment1d.create(data.radius0, data.radius1),
      AngleSweep.createStartEnd(data.bearing0!, data.bearing1!),
      fractionInterval ? fractionInterval.clone() : Segment1d.create(0, 1),
      localToWorld, data.curveLength!, data1);
  }
  /** Copy all defining data from another spiral. */
  public setFrom(other: IntegratedSpiral3d): IntegratedSpiral3d {
    this.localToWorld.setFrom(other.localToWorld);
    this.radius01.setFrom(other.radius01);
    this._curvature01.setFrom(other._curvature01);
    this.bearing01.setFrom(other.bearing01);
    this.localToWorld.setFrom(other.localToWorld);
    this.activeFractionInterval.setFrom(other.activeFractionInterval);
    this._arcLength01 = other._arcLength01;
    return this;
  }
  /** Deep clone of this spiral */
  public clone(): IntegratedSpiral3d {
    return new IntegratedSpiral3d(this._spiralType, this._evaluator,
      this.radius01.clone(), this.bearing01.clone(),
      this.activeFractionInterval.clone(), this.localToWorld.clone(), this._arcLength01,
      this._designProperties?.clone());
  }
  /** apply `transform` to this spiral's local to world transform. */
  public tryTransformInPlace(transformA: Transform): boolean {

    const rigidData = this.applyRigidPartOfTransform(transformA);
    if (rigidData !== undefined) {
      this._curvature01.x0 /= rigidData.scale;
      this._curvature01.x1 /= rigidData.scale;
      this.radius01.x0 *= rigidData.scale;
      this.radius01.x1 *= rigidData.scale;
      this._arcLength01 *= rigidData.scale;
    }
    this.refreshComputedProperties();
    return true;
  }
  /** Clone with a transform applied  */
  public cloneTransformed(transform: Transform): TransitionSpiral3d {
    const result = this.clone();
    result.tryTransformInPlace(transform); // ok, we're confident it will always work.
    return result;
  }
  /** Return the spiral start point. */
  public override startPoint(): Point3d { return this.activeStrokes.startPoint(); }
  /** return the spiral end point. */
  public override endPoint(): Point3d { return this.activeStrokes.endPoint(); }
  /** test if the local to world transform places the spiral xy plane into `plane` */
  public isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean {
    return plane.isPointInPlane(this.localToWorld.origin as Point3d)
      && Geometry.isSameCoordinate(0.0, this.localToWorld.matrix.dotColumnX(plane.getNormalRef()))
      && Geometry.isSameCoordinate(0.0, this.localToWorld.matrix.dotColumnY(plane.getNormalRef()));
  }
  /** Return length of the spiral.  Because TransitionSpiral is parameterized directly in terms of distance along, this is a simple return value. */
  public quickLength() { return this._arcLength01; }
  /** Return length of the spiral.  Because TransitionSpiral is parameterized directly in terms of distance along, this is a simple return value. */
  public override curveLength() { return this._arcLength01; }
  /** Test if `other` is an instance of `TransitionSpiral3d` */
  public isSameGeometryClass(other: any): boolean { return other instanceof TransitionSpiral3d; }
  /** Add strokes from this spiral to `dest`.
   * * Linestrings will usually stroke as just their points.
   * * If maxEdgeLength is given, this will sub-stroke within the linestring -- not what we want.
   */
  public emitStrokes(dest: LineString3d, options?: StrokeOptions): void { this.activeStrokes.emitStrokes(dest, options); }
  /** emit stroke fragments to `dest` handler. */
  public emitStrokableParts(dest: IStrokeHandler, options?: StrokeOptions): void {
    const n = this.computeStrokeCountForOptions(options);
    const activeStrokes = this.activeStrokes;
    dest.startParentCurvePrimitive(this);
    if (n <= activeStrokes.numPoints()) {
      this.activeStrokes.emitStrokableParts(dest, options);
    } else {
      dest.announceIntervalForUniformStepStrokes(this, n, 0.0, 1.0);
    }
    dest.endParentCurvePrimitive(this);
  }

  /**
   * return the stroke count required for given options.
   * @param options StrokeOptions that determine count
   */

  public computeStrokeCountForOptions(options?: StrokeOptions): number {
    let numStroke;
    if (options) {
      const rMin = Math.min(Math.abs(this.radius01.x0), Math.abs(this.radius01.x1));
      numStroke = options.applyTolerancesToArc(rMin, this.bearing01.sweepRadians);
      numStroke = options.applyMaxEdgeLength(numStroke, this.curveLength());
      numStroke = options.applyMinStrokesPerPrimitive(numStroke);
    } else {
      numStroke = StrokeOptions.applyAngleTol(undefined, 4, this.bearing01.sweepRadians);
    }
    return numStroke;
  }

  /** Reverse the active interval and active strokes.
   * * Primary defining data remains unchanged !!!
   */

  public reverseInPlace(): void {
    this.activeFractionInterval.reverseInPlace();
    if (this._activeStrokes === undefined)
      this._activeStrokes = this._globalStrokes.clone();
    this._activeStrokes.reverseInPlace();
  }
  /** Evaluate curve point with respect to fraction. */
  public fractionToPoint(activeFraction: number, result?: Point3d): Point3d {
    let globalFraction = this.activeFractionInterval.fractionToPoint(activeFraction);
    globalFraction = Geometry.clampToStartEnd(globalFraction, 0, 1);
    const numStrokes = this._globalStrokes.packedPoints.length - 1;
    const index0 = Math.trunc(globalFraction * numStrokes); // This indexes the point to the left of the query.
    const globalFraction0 = index0 / numStrokes;
    result = this._globalStrokes.packedPoints.getPoint3dAtUncheckedPointIndex(index0, result);
    // console.log(" fractionToPoint ", activeFraction, this.activeFractionInterval, "( global integration " + globalFraction0 + " to " + globalFraction + ")", index0);
    this.fullSpiralIncrementalIntegral(result, globalFraction0, globalFraction, true);
    return result;
  }
  /** Evaluate curve point and derivative with respect to fraction. */
  public fractionToPointAndDerivative(activeFraction: number, result?: Ray3d): Ray3d {
    const globalFraction = this.activeFractionInterval.fractionToPoint(activeFraction);
    result = result ? result : Ray3d.createZero();
    this.fractionToPoint(activeFraction, result.origin);
    const radians = this.globalFractionToBearingRadians(globalFraction);
    const a = this._arcLength01 * this.activeFractionInterval.signedDelta();
    this.localToWorld.matrix.multiplyXY(a * Math.cos(radians), a * Math.sin(radians), result.direction);
    return result;
  }

  /** Return the frenet frame at fractional position. */

  public override fractionToFrenetFrame(activeFraction: number, result?: Transform): Transform {
    const globalFraction = this.activeFractionInterval.fractionToPoint(activeFraction);
    result = result ? result : Transform.createIdentity();
    result.origin.setFrom(this.fractionToPoint(activeFraction));
    Matrix3d.createRigidFromMatrix3d(this.localToWorld.matrix, AxisOrder.XYZ, result.matrix);

    const radians = this.globalFractionToBearingRadians(globalFraction);
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    result.matrix.applyGivensColumnOp(0, 1, c, s);
    return result;
  }
  /** Return a plane with
   *
   * * origin at fractional position along the curve
   * * vectorU is the first derivative, i.e. tangent vector with length equal to the rate of change with respect to the fraction.
   * * vectorV is the second derivative, i.e.derivative of vectorU.
   */
  public fractionToPointAnd2Derivatives(activeFraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined {
    const globalFraction = this.activeFractionInterval.fractionToPoint(activeFraction);
    const origin = this.fractionToPoint(activeFraction);
    const radians = this.globalFractionToBearingRadians(globalFraction);
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const delta = this.activeFractionInterval.signedDelta();
    const a = delta;
    const b = a * delta;
    const vectorX = this.localToWorld.matrix.multiplyXY(a * c, a * s);
    const vectorY = this.localToWorld.matrix.multiplyXY(-b * s, b * c);
    vectorY.scaleInPlace(this.globalFractionToCurvature(globalFraction));
    return Plane3dByOriginAndVectors.createCapture(origin, vectorX, vectorY, result);
  }
  /** Second step of double dispatch:  call `handler.handleTransitionSpiral(this)` */
  public dispatchToGeometryHandler(handler: GeometryHandler): any {
    return handler.handleTransitionSpiral(this);
  }
  /** extend the range by the strokes of the spiral */
  public extendRange(rangeToExtend: Range3d, transform?: Transform): void {
    this.activeStrokes.extendRange(rangeToExtend, transform);
  }
  /** compare various coordinate quantities */
  public override isAlmostEqual(other?: GeometryQuery): boolean {
    if (other instanceof IntegratedSpiral3d) {
      return this.radius01.isAlmostEqual(other.radius01)
        && this.bearing01.isAlmostEqualAllowPeriodShift(other.bearing01)
        && this.localToWorld.isAlmostEqual(other.localToWorld)
        && Geometry.isSameCoordinate(this._arcLength01, other._arcLength01)
        && this.activeFractionInterval.isAlmostEqual(other.activeFractionInterval)
        && this._curvature01.isAlmostEqual(other._curvature01);
    }
    return false;
  }

}
// at load time, initialize gauss quadrature workspace
IntegratedSpiral3d.initWorkSpace();
