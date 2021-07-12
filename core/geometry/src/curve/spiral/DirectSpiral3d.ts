/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Curve
 */
import { Geometry } from "../../Geometry";
import { GeometryHandler, IStrokeHandler } from "../../geometry3d/GeometryHandler";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/Plane3dByOriginAndUnitNormal";
import { Plane3dByOriginAndVectors } from "../../geometry3d/Plane3dByOriginAndVectors";
import { Point3d } from "../../geometry3d/Point3dVector3d";
import { Range3d } from "../../geometry3d/Range";
import { Ray3d } from "../../geometry3d/Ray3d";
import { Segment1d } from "../../geometry3d/Segment1d";
import { Transform } from "../../geometry3d/Transform";
import { LineString3d } from "../LineString3d";
import { StrokeOptions } from "../StrokeOptions";
import { TransitionConditionalProperties } from "./TransitionConditionalProperties";
import { ClothoidSeriesRLEvaluator } from "./ClothoidSeries";
import { CzechSpiralEvaluator, ItalianSpiralEvaluator } from "./CzechSpiralEvaluator";
import { DirectHalfCosineSpiralEvaluator } from "./DirectHalfCosineSpiralEvaluator";
import { AustralianRailCorpXYEvaluator } from "./AustralianRailCorpXYEvaluator";
import { XYCurveEvaluator } from "./XYCurveEvaluator";
import { TransitionSpiral3d } from "./TransitionSpiral3d";
import { Angle } from "../../geometry3d/Angle";
import { MXCubicAlongArcEvaluator } from "./MXCubicAlongArcSpiralEvaluator";
import { PolishCubicEvaluator } from "./PolishCubicSpiralEvaluator";
/**
* DirectSpiral3d acts like a TransitionSpiral3d for serialization purposes, but implements spiral types that have "direct" xy calculations without the integrations required
* for IntegratedSpiral3d.
* * Each DirectSpiral3d carries an XYCurveEvaluator to give it specialized behavior.
* * Direct spirals that flow through serialization to native imodel02 are create with these static methods:
*   * createArema
*   * createJapaneseCubic
*   * createAustralianRail
*   * createDirectHalfCosine
*   * createChineseCubic
*   * createCzechCubic
*   * createPolishCubic
*   * createItalian
*   * createWesternAustralian
* @public
*/
export class DirectSpiral3d extends TransitionSpiral3d {

  /** String name for schema properties */

  public readonly curvePrimitiveType = "transitionSpiral";

  /** stroked approximation of entire spiral. */
  private _globalStrokes: LineString3d;
  /** stroked approximation of active spiral.
   * * Same count as global -- possibly overly fine, but it gives some consistency between same clothoid constructed as partial versus complete.
   * * If no trimming, this points to the same place as the _globalStrokes !!!  Don't double transform!!!
   */
  private _activeStrokes?: LineString3d;
  /** Return the internal stroked form of the (possibly partial) spiral   */
  public get activeStrokes(): LineString3d { return this._activeStrokes !== undefined ? this._activeStrokes : this._globalStrokes; }

  private _nominalL1: number;
  private _nominalR1: number;
  private _evaluator: XYCurveEvaluator;

  /** Return the nominal end radius. */
  public get nominalR1(): number { return this._nominalR1; }
  /** Return the nominal distance from inflection to endpoint. */
  public get nominalL1(): number { return this._nominalL1; }
  /** Return the nominal end curvature */
  public get nominalCurvature1(): number { return TransitionSpiral3d.radiusToCurvature(this._nominalR1); }
  /** Return the low level evaluator
   * @internal
   */
  public get evaluator(): XYCurveEvaluator { return this._evaluator; }

  // constructor demands radius1 and distance1 for nominal construction.
  // caller is responsible for managing intervals of partial spiral
  constructor(
    localToWorld: Transform,
    spiralType: string | undefined,
    originalProperties: TransitionConditionalProperties | undefined,
    nominalL1: number,
    nominalR1: number,
    activeFractionInterval: Segment1d | undefined,
    evaluator: XYCurveEvaluator) {
    super(spiralType, localToWorld, activeFractionInterval, originalProperties);
    this._nominalL1 = nominalL1;
    this._nominalR1 = nominalR1;
    this._evaluator = evaluator;
    this._globalStrokes = LineString3d.create();
    this._activeStrokes = LineString3d.create();
    // initialize for compiler -- but this will be recomputed in refreshComputeProperties ...
    this.refreshComputedProperties();
  }
  /**
   * Compute stroke data in an interval.
   * @param strokes strokes to clear and refill.
   * @param fraction0 start fraction
   * @param fraction1 end fraction
   */
  private computeStrokes(strokes: LineString3d, fractionA: number, fractionB: number, numInterval: number) {
    if (numInterval < 1)
      numInterval = 1;
    strokes.clear();
    strokes.ensureEmptyUVParams();
    strokes.ensureEmptyFractions();
    const distances = strokes.packedUVParams!;
    const nominalIntervalLength = Math.abs(fractionB - fractionA) * this._nominalL1;
    for (let i = 0; i <= numInterval; i++) {
      const fraction = Geometry.interpolate(fractionA, i / numInterval, fractionB);
      const nominalDistanceAlong = fraction * nominalIntervalLength;
      strokes.packedPoints.pushXYZ(this._evaluator.fractionToX(fraction),
        this._evaluator.fractionToY(fraction), 0);
      distances.pushXY(fraction, nominalDistanceAlong); // the second distance will be updated below
    }

    let fraction0 = distances.getXAtUncheckedPointIndex(0);
    let trueDistance0 = distances.getYAtUncheckedPointIndex(0); // whatever was assigned as start distance is fine
    let trueDistance1, fraction1;
    for (let i = 1; i <= numInterval; i++) {
      fraction1 = distances.getXAtUncheckedPointIndex(i);
      trueDistance1 = trueDistance0 + this._evaluator.integrateDistanceBetweenFractions(fraction0, fraction1);
      distances.setXYZAtCheckedPointIndex(i, fraction1, trueDistance1);
      fraction0 = fraction1;
      trueDistance0 = trueDistance1;
    }

  }
  /** Recompute strokes */
  public refreshComputedProperties() {
    const sweepRadians = this.nominalL1 / (2.0 * this.nominalR1);
    const radiansStep = 0.02;
    const numInterval = StrokeOptions.applyAngleTol(undefined, 4, sweepRadians, radiansStep);
    this.computeStrokes(this._globalStrokes, 0, 1, numInterval);
    const numActiveInterval = Math.ceil(this._activeFractionInterval.absoluteDelta() * numInterval);
    this._activeStrokes = LineString3d.create();
    this.computeStrokes(this._activeStrokes, this._activeFractionInterval.x0, this._activeFractionInterval.x1,
      numActiveInterval);
  }
  /**
   * Create a spiral object which uses numXTerm terms from the clothoid X series and numYTerm from the clothoid Y series.
   * @param numXTerm  number of terms to use from X series
   * @param numYTerm number of terms to use from Y series
   * @param localToWorld placement frame.  Inflection point is at origin, initial direction is along x axis.
   * @param nominalL1 design distance from inflection to end point.
   * @param nominalR1 design radius at end point.
   * @param activeInterval active interval (as fractions of nominalL1 !!!)
   */
  public static createTruncatedClothoid(
    spiralType: string,
    localToWorld: Transform,
    numXTerm: number, numYTerm: number,
    originalProperties: TransitionConditionalProperties | undefined,
    nominalL1: number, nominalR1: number,
    activeInterval: Segment1d | undefined): DirectSpiral3d | undefined {
    if (numXTerm < 1)
      numXTerm = 1;
    if (numYTerm < 1)
      numYTerm = 1;
    const evaluator = new ClothoidSeriesRLEvaluator(nominalL1, 1.0 / (2.0 * nominalL1 * nominalR1), numXTerm, numYTerm);
    return new DirectSpiral3d(
      localToWorld.clone(),
      spiralType,
      originalProperties,
      nominalL1, nominalR1,
      activeInterval ? activeInterval.clone() : Segment1d.create(0, 1), evaluator);
  }
  /**
   * Create an Japanese spiral clothoid approximation
   *   * X is 1 terms of the clothoid series as a function of nominal distance along.
   *   * Y is 1 terms f the clothoid series as a function of nominal distance along.
   *   * Remark: This is identical to the ChineseCubic
   * @param localToWorld axes with inflection at origin, tangent along x axis
   * @param nominalL1 nominal length as used in series LR terms.
   * @param nominalR1 nominal final radius as used in series LR terms
   * @param activeInterval fractional interval with (0, nominalL1) range for nominal distance along
   */
  public static createJapaneseCubic(
    localToWorld: Transform,
    nominalL1: number,
    nominalR1: number,
    activeInterval?: Segment1d): DirectSpiral3d | undefined {
    return this.createTruncatedClothoid("JapaneseCubic", localToWorld, 1, 1, undefined, nominalL1, nominalR1, activeInterval);
  }
  /**
   * Create a czech cubic.
   * This is y= m*x^3 with
   * * x any point on the x axis
   * * `fraction` along the spiral goes to `x = fraction * L`
   * * m is gamma / (6RL)
   *    * 1/(6RL) is the leading term of the sine series.
   *    * `gamma = 2R/sqrt (4RR-LL)` pushes y up a little bit to simulate the lost series terms.
   * @param localToWorld
   * @param nominalLx nominal length along x axis
   * @param nominalR1
   * @param activeInterval
   */
  public static createCzechCubic(
    localToWorld: Transform,
    nominalLx: number,
    nominalR1: number,
    activeInterval?: Segment1d): DirectSpiral3d | undefined {
    const evaluator = CzechSpiralEvaluator.create(nominalLx, nominalR1);
    if (evaluator === undefined)
      return undefined;
    return new DirectSpiral3d(
      localToWorld.clone(),
      "Czech",
      undefined,
      nominalLx, nominalR1,
      activeInterval ? activeInterval.clone() : Segment1d.create(0, 1), evaluator);
  }
  /**
   * Create an italian spiral
   * This is y= m*x^3 with
   * * x any point on the x axis
   * * `fraction` along the spiral goes to `x = fraction * L`
   * * m is gamma / (6RL)
   *    * 1/(6RL) is the leading term of the sine series.
   *    * `gamma = 2R/sqrt (4RR-LL)` pushes y up a little bit to simulate the lost series terms.
   * * L in gamma and m is the
   * @param localToWorld
   * @param nominalL1 nominal length along the spiral
   * @param nominalR1
   * @param activeInterval
   */
  public static createItalian(
    localToWorld: Transform,
    nominalL1: number,
    nominalR1: number,
    activeInterval?: Segment1d): DirectSpiral3d | undefined {
    const evaluator = ItalianSpiralEvaluator.create(nominalL1, nominalR1);
    if (evaluator === undefined)
      return undefined;
    return new DirectSpiral3d(
      localToWorld.clone(),
      "Italian",
      undefined,
      nominalL1, nominalR1,
      activeInterval ? activeInterval.clone() : Segment1d.create(0, 1), evaluator);
  }

  /**
   * Create an MX Cubic whose nominal length is close to along the curve.
   * This is y= m*x^3 with
   * * m is 1/ (6RL1)
   *    * 1/(6RL) is the leading term of the sine series.
   * * L1 is an along-the-x-axis distance that is slightly LESS THAN the nominal length
   * * x is axis position that is slightly LESS than nominal distance along
   * * L1, x use the approximation   `x = s * ( 1 - s^4/ (40 R R L L))
   * @param localToWorld
   * @param nominalL1
   * @param nominalR1
   * @param activeInterval
   */
  public static createMXCubicAlongArc(
    localToWorld: Transform,
    nominalL1: number,
    nominalR1: number,
    activeInterval?: Segment1d): DirectSpiral3d | undefined {
    const evaluator = MXCubicAlongArcEvaluator.create(nominalL1, nominalR1);
    if (evaluator === undefined)
      return undefined;
    return new DirectSpiral3d(
      localToWorld.clone(),
      "MXCubicAlongArc",
      undefined,
      nominalL1, nominalR1,
      activeInterval ? activeInterval.clone() : Segment1d.create(0, 1), evaluator);
  }

  /**
   * Create a polish cubic
   * This is y= m*x^3 with
   * * m is 1/ (6RL)
   *    * 1/(6RL) is the leading term of the sine series.
   * * L is nominal length
   * * R is nominal end radius.
   * * x ranges up to the x axis distance for which the polish distance series produces f(x)=L
   * * The support class PolishCubicEvaluator has static methods for the distance series and its inversion.
   */
  public static createPolishCubic(
    localToWorld: Transform,
    nominalL1: number,
    nominalR1: number,
    activeInterval?: Segment1d): DirectSpiral3d | undefined {
    const evaluator = PolishCubicEvaluator.create(nominalL1, nominalR1);
    if (evaluator === undefined)
      return undefined;
    return new DirectSpiral3d(
      localToWorld.clone(),
      "PolishCubic",
      undefined,
      nominalL1, nominalR1,
      activeInterval ? activeInterval.clone() : Segment1d.create(0, 1), evaluator);
  }

  /**
   * Create an AustralianRailCorp spiral
   * This is y= m*x^3 with
   * * x any point on the x axis
   * * `fraction` along the spiral goes to `x = fraction * L`
   * * m is gamma / (6RL)
   *    * 1/(6RL) is the leading term of the sine series.
   *    * `gamma = 2R/sqrt (4RR-LL)` pushes y up a little bit to simulate the lost series terms.
   * @param localToWorld
   * @param nominalL1
   * @param nominalR1
   * @param activeInterval
   */
  public static createAustralianRail(
    localToWorld: Transform,
    nominalL1: number,
    nominalR1: number,
    activeInterval?: Segment1d): DirectSpiral3d | undefined {
    const evaluator = AustralianRailCorpXYEvaluator.create(nominalL1, nominalR1);
    if (evaluator === undefined)
      return undefined;
    return new DirectSpiral3d(
      localToWorld.clone(),
      "AustralianRailCorp",
      undefined,
      nominalL1, nominalR1,
      activeInterval ? activeInterval.clone() : Segment1d.create(0, 1), evaluator);
  }

  public static createDirectHalfCosine(
    localToWorld: Transform,
    nominalL1: number,
    nominalR1: number,
    activeInterval?: Segment1d): DirectSpiral3d | undefined {
    return new this(localToWorld, "HalfCosine", undefined, nominalL1, nominalR1, activeInterval,
      new DirectHalfCosineSpiralEvaluator(nominalL1, nominalR1));
  }
  /**
   * Create an Arema spiral clothoid approximation
   *   * X is 2 terms of the clothoid series as a function of nominal distance along
   *   * Y is 2 terms f the clothoid series as a function of nominal distance along
   *   * Remark: This is identical to the ChineseCubic
   * @param localToWorld axes with inflection at origin, tangent along x axis
   * @param nominalL1 nominal length as used in series LR terms.
   * @param nominalR1 nominal final radius as used in series LR terms
   * @param activeInterval fractional interval with (0, nominalL1) range for nominal distance along
   */
  public static createArema(
    localToWorld: Transform,
    nominalL1: number,
    nominalR1: number,
    activeInterval?: Segment1d): DirectSpiral3d | undefined {
    return this.createTruncatedClothoid("Arema", localToWorld, 2, 2, undefined, nominalL1, nominalR1, activeInterval);
  }

  /**
   * Create a Chinese clothoid approximation
   *   * X is 2 terms of the clothoid series as a function of nominal distance along
   *   * Y is 2 terms f the clothoid series as a function of nominal distance along
   *   * Remark: This is identical to the Arema spiral
   * @param localToWorld axes with inflection at origin, tangent along x axis
   * @param nominalL1 nominal length as used in series LR terms.
   * @param nominalR1 nominal final radius as used in series LR terms
   * @param activeInterval fractional interval with (0, nominalL1) range for nominal distance along
   */
  public static createChineseCubic(
    localToWorld: Transform,
    nominalL1: number,
    nominalR1: number,
    activeInterval?: Segment1d): DirectSpiral3d | undefined {
    return this.createTruncatedClothoid("ChineseCubic", localToWorld, 2, 2, undefined, nominalL1, nominalR1, activeInterval);
  }
  /**
   * Create a Western Australian direct spiral.
   *   * X is 2 terms of the clothoid series as a function of distance along
   *   * Y is 1 term (cubic in nominal distance along)
   * @param localToWorld axes with inflection at origin, tangent along x axis
   * @param nominalL1 nominal length as used in series LR terms.
   * @param nominalR1 nominal final radius as used in series LR terms
   * @param activeInterval fractional interval with (0, nominalL1) range for nominal distance along
   */
  public static createWesternAustralian(
    localToWorld: Transform,
    nominalL1: number,
    nominalR1: number,
    activeInterval?: Segment1d): DirectSpiral3d | undefined {
    return this.createTruncatedClothoid("WesternAustralian", localToWorld, 2, 1, undefined, nominalL1, nominalR1, activeInterval);
  }
  /**
   * Create (if possible) a DirectSpiral3d, applying various strict conditions appropriate to the spiral type.
   * The parameter list includes extraneous values in order to directly match IntegratedSpiral3d.create, which has greater flexibility about
   *    mixtures of values.
   * * IMPORTANT RESTRICTIONS
   *   * Direct spirals must have the inflection at the origin of their coordinate system, aligned with the x axis.
   *      * hence bearing0 = 0
   *      * hence radius0 = 0
   *   * bearing1 is ignored
   *   * radius1 must be given.
   *   * arcLength must be given,
   * @param spiralType one of the types in `DirectSpiralTypeNames`
   * @param radius0 radius (or 0 for tangent to line) at start.   Must be ZERO or UNDEFINED
   * @param radius1 radius (or 0 for tangent to line) at end.
   * @param bearing0 bearing, measured CCW from x axis at start.   Must be ZERO or UNDEFINED
   * @param bearing1 bearing, measured CCW from x axis at end.    IGNORED.
   * @param fractionInterval optional fractional interval for an "active" portion of the curve.   if omitted, the full [0,1] is used.
   * @param localToWorld placement transform
   */
  public static createFromLengthAndRadius(
    spiralType: string,
    radius0: number | undefined,
    radius1: number | undefined,
    bearing0: Angle | undefined,
    _bearing1: Angle | undefined,
    arcLength: number | undefined,
    activeInterval: undefined | Segment1d,
    localToWorld: Transform): TransitionSpiral3d | undefined {
    if (bearing0 !== undefined && !bearing0.isAlmostZero)
      return undefined;
    if (radius0 !== undefined && !Geometry.isSmallMetricDistance(radius0))
      return undefined;
    if (radius1 === undefined || Geometry.isSmallMetricDistance(radius1))
      return undefined;
    if (arcLength === undefined)
      return undefined;
    if (Geometry.equalStringNoCase(spiralType, "Arema"))
      return this.createArema(localToWorld, arcLength, radius1, activeInterval);
    if (Geometry.equalStringNoCase(spiralType, "ChineseCubic"))
      return this.createChineseCubic(localToWorld, arcLength, radius1, activeInterval);
    if (Geometry.equalStringNoCase(spiralType, "JapaneseCubic"))
      return this.createJapaneseCubic(localToWorld, arcLength, radius1, activeInterval);
    if (Geometry.equalStringNoCase(spiralType, "HalfCosine"))
      return this.createDirectHalfCosine(localToWorld, arcLength, radius1, activeInterval);
    if (Geometry.equalStringNoCase(spiralType, "Czech"))
      return this.createCzechCubic(localToWorld, arcLength, radius1, activeInterval);
    if (Geometry.equalStringNoCase(spiralType, "Italian"))
      return this.createItalian(localToWorld, arcLength, radius1, activeInterval);
    if (Geometry.equalStringNoCase(spiralType, "AustralianRailCorp"))
      return this.createAustralianRail(localToWorld, arcLength, radius1, activeInterval);
    if (Geometry.equalStringNoCase(spiralType, "MXCubicAlongArc"))
      return this.createMXCubicAlongArc(localToWorld, arcLength, radius1, activeInterval);
    if (Geometry.equalStringNoCase(spiralType, "WesternAustralian"))
      return this.createWesternAustralian(localToWorld, arcLength, radius1, activeInterval);
    if (Geometry.equalStringNoCase(spiralType, "PolishCubic"))
      return this.createPolishCubic(localToWorld, arcLength, radius1, activeInterval);
    return undefined;
  }
  /** Deep clone of this spiral */
  public clone(): DirectSpiral3d {
    return new DirectSpiral3d(
      this.localToWorld.clone(),
      this._spiralType,
      this.designProperties?.clone(),
      this._nominalL1,
      this._nominalR1,
      this._activeFractionInterval?.clone(),
      this._evaluator.clone());
  }
  /** apply `transform` to this spiral's local to world transform. */
  public tryTransformInPlace(transformA: Transform): boolean {
    const rigidData = this.applyRigidPartOfTransform(transformA);
    if (rigidData !== undefined) {
      this._nominalL1 *= rigidData.scale;
      this._nominalR1 *= rigidData.scale;
      this.evaluator.scaleInPlace(rigidData.scale);
    }
    this.refreshComputedProperties();
    return true;
  }
  /** Clone with a transform applied  */
  public cloneTransformed(transform: Transform): DirectSpiral3d {
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
  /** Return quick length of the spiral.
   * The tangent vector of a true clothoid is length 1 everywhere, so simple proportion of nominalL1 is a good approximation.
   */
  public quickLength() {
    const distanceData = this._globalStrokes.packedUVParams!;
    const n = distanceData.length;
    return distanceData.getYAtUncheckedPointIndex(n - 1);
  }
  /** Return length of the spiral.
   * * True length is stored at back of uvParams . . .
   */
  public override curveLength() { return this.quickLength(); }
  /** Test if `other` is an instance of `TransitionSpiral3d` */
  public isSameGeometryClass(other: any): boolean { return other instanceof DirectSpiral3d; }
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
      // this.activeStrokes.emitStrokableParts(dest, options);
      dest.announceIntervalForUniformStepStrokes(this, 2 * activeStrokes.numPoints(), 0.0, 1.0);
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
    const nominalRadians = this._nominalL1 / (2.0 * this._nominalR1);
    if (options) {
      const rMin = Math.abs(this._nominalR1);
      numStroke = options.applyTolerancesToArc(rMin, nominalRadians);
      numStroke = options.applyMaxEdgeLength(numStroke, this.quickLength());
      numStroke = options.applyMinStrokesPerPrimitive(numStroke);
    } else {
      numStroke = StrokeOptions.applyAngleTol(undefined, 4, nominalRadians, 0.02);
    }
    numStroke = Math.ceil(this._activeFractionInterval.absoluteDelta() * numStroke);
    return numStroke;
  }

  /** Reverse the active interval and active strokes.
   * * Primary defining data remains unchanged !!!
   */

  public reverseInPlace(): void {
    this._activeFractionInterval.reverseInPlace();
    if (this._activeStrokes === undefined)
      this._activeStrokes = this._globalStrokes.clone();
    this._activeStrokes.reverseInPlace();
  }
  /** Evaluate curve point with respect to fraction. */
  public fractionToPoint(activeFraction: number, result?: Point3d): Point3d {
    const globalFraction = this._activeFractionInterval.fractionToPoint(activeFraction);
    result = this._evaluator.fractionToPoint(globalFraction, result);
    this.localToWorld.multiplyPoint3d(result, result);
    return result;
  }
  /** Evaluate curve point and derivative with respect to fraction. */
  public fractionToPointAndDerivative(activeFraction: number, result?: Ray3d): Ray3d {
    const globalFraction = this._activeFractionInterval.fractionToPoint(activeFraction);
    result = this._evaluator.fractionToPointAndDerivative(globalFraction, result);
    result.direction.scaleInPlace(this._activeFractionInterval.signedDelta());
    result.transformInPlace(this.localToWorld);
    return result;
  }

  /** Return a plane with
   *
   * * origin at fractional position along the curve
   * * vectorU is the first derivative, i.e. tangent vector with length equal to the rate of change with respect to the fraction.
   * * vectorV is the second derivative, i.e.derivative of vectorU.
   */

  public fractionToPointAnd2Derivatives(activeFraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined {
    const globalFraction = this._activeFractionInterval.fractionToPoint(activeFraction);
    result = this._evaluator.fractionToPointAnd2Derivatives(globalFraction, result);
    const a = this._activeFractionInterval.signedDelta();
    result.vectorU.scaleInPlace(a);
    result.vectorV.scaleInPlace(a * a);
    result.transformInPlace(this.localToWorld);
    return result;
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
  public override isAlmostEqual(other: any): boolean {
    if (other instanceof DirectSpiral3d) {
      return Geometry.isSameCoordinate(this._nominalL1, other._nominalL1)
        && Geometry.isSameCoordinate(this._nominalR1, other._nominalR1)
        && this.localToWorld.isAlmostEqual(other.localToWorld)
        && this._activeFractionInterval.isAlmostEqual(other._activeFractionInterval)
        && this._evaluator.isAlmostEqual(other._evaluator);
    }
    return false;
  }
}
