/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */

import { BSplineCurve3d, BSplineCurve3dBase } from "../bspline/BSplineCurve";
import { BSplineCurve3dH } from "../bspline/BSplineCurve3dH";
import { Geometry } from "../Geometry";
import { NullGeometryHandler } from "../geometry3d/GeometryHandler";
import { GrowableFloat64Array } from "../geometry3d/GrowableFloat64Array";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Range3d } from "../geometry3d/Range";
import { AnalyticRoots, SmallSystem } from "../numerics/Polynomials";
import { Arc3d } from "./Arc3d";
import { CurveIntervalRole, CurveLocationDetail, CurveLocationDetailPair } from "./CurveLocationDetail";
import { CurvePrimitive } from "./CurvePrimitive";
import { GeometryQuery } from "./GeometryQuery";
import { LineSegment3d } from "./LineSegment3d";
import { LineString3d } from "./LineString3d";

// cspell:word XYRR
/**
 * Set bits for comparison to range xy
 * * bit 0x01 => x smaller than range.low.x
 * * bit 0x02 => x larger than range.high.x
 * * bit 0x04 => x smaller than range.low.y
 * * bit 0x08 => x larger than range.high.y
 * @param xy point to test
 * @param range range for comparison
 */
function classifyBitsPointRangeXY(x: number, y: number, range: Range3d): number {
  let result = 0;
  if (x < range.low.x)
    result = 0x01;
  else if (x > range.high.x)
    result = 0x02;

  if (y < range.low.y)
    result |= 0x04;
  else if (y > range.high.y)
    result |= 0x08;
  return result;
}

/**
 * * Instances are initialized and called from CurveCurve.
 * * Constructor is told two geometry items A and B
 *   * geometryB is saved for later reference
 *   * type-specific handler methods will "see" geometry A repeatedly.
 *   * Hence geometryA is NOT saved by the constructor.
 * @internal
 */
export class CurveCurveCloseApproachXY extends NullGeometryHandler {
  // private geometryA: GeometryQuery;  // nb never used -- passed through handlers.
  /* geometryA exists through the handler call.
   * geometryB is static through (possibly multiple) geometryA.
   * at geometryB setup time, a strongly typed version of geometryB may be saved.
   */
  private _geometryB: GeometryQuery | undefined;
  private _circularArcB: Arc3d | undefined;
  private _circularRadiusB: number | undefined;
  private setGeometryB(geometryB: GeometryQuery | undefined) {
    this._geometryB = geometryB;
    this._circularArcB = undefined;
    this._circularRadiusB = undefined;
    if (geometryB instanceof Arc3d) {
      const r = geometryB.circularRadiusXY();
      if (r !== undefined) {
        this._circularRadiusB = r;
        this._circularArcB = geometryB;
      }
    }
  }
  /** approach larger than this is not interesting.
   * This is caller defined and can be undefined.
   */
  private _maxDistanceToAccept: number | undefined;
  /** Squared max distance.  This is private, and is forced to at least small metric distance squared */
  private _maxDistanceSquared: number;
  private _results!: CurveLocationDetailPair[];
  // private _coincidentGeometryContext: CoincidentGeometryQuery;
  private reinitialize() {
    this._results = [];
  }

  /**
   * @param _geometryA first curve for intersection.  This is NOT saved.
   * @param geometryB second curve for intersection.  Saved for reference by specific handler methods.
   */
  public constructor(_geometryA: GeometryQuery | undefined, geometryB: GeometryQuery | undefined) {
    super();
    // this.geometryA = _geometryA;
    this.setGeometryB(geometryB);
    this._maxDistanceSquared = Geometry.smallMetricDistanceSquared;
    // this._coincidentGeometryContext = CoincidentGeometryQuery.create();
    this.reinitialize();
  }
  /** Access the (possibly undefined) max distance to accept. */
  public set maxDistanceToAccept(value: number | undefined) {
    this._maxDistanceToAccept = value;
    if (this._maxDistanceToAccept !== undefined && this._maxDistanceToAccept > 0)
      this._maxDistanceSquared = this._maxDistanceToAccept * this._maxDistanceToAccept;
  }
  /** Set the (possibly undefined) max distance to accept. */
  public get maxDistanceToAccept(): number | undefined { return this._maxDistanceToAccept; }
  /** Ask if the maxDistanceToAccept value is defined and positive */
  public get isMaxDistanceSet(): boolean { return this._maxDistanceToAccept !== undefined && this._maxDistanceToAccept > 0; }
  /** Reset the geometry and flags, leaving all other parts unchanged (and preserving accumulated intersections) */
  public resetGeometry(_geometryA: GeometryQuery, geometryB: GeometryQuery) {
    this.setGeometryB(geometryB);
  }

  private acceptFraction(fraction: number, fractionTol: number = 1.0e-12) {
    if (fraction < -fractionTol)
      return false;
    if (fraction > 1.0 + fractionTol)
      return false;
    return true;
  }
  /**
   * * Return the results structure for the intersection calculation, structured as an array of CurveLocationDetailPair
   * @param reinitialize if true, a new results structure is created for use by later calls.
   *
   */
  public grabPairedResults(reinitialize: boolean = false): CurveLocationDetailPair[] {
    const result = this._results;
    if (reinitialize)
      this.reinitialize();
    return result;
  }
  private sameCurveAndFraction(cp: CurvePrimitive, fraction: number, detail: CurveLocationDetail): boolean {
    return cp === detail.curve && Geometry.isAlmostEqualNumber(fraction, detail.fraction);
  }
  private testAndRecordPointPairApproach(cpA: CurvePrimitive, fA: number, pointA: Point3d,
    cpB: CurvePrimitive, fB: number, pointB: Point3d, reversed: boolean) {
    const d2 = pointA.distanceSquaredXY(pointB);
    if (d2 < this._maxDistanceSquared) {
      const detailA = CurveLocationDetail.createCurveFractionPoint(cpA, fA, pointA);
      const detailB = CurveLocationDetail.createCurveFractionPoint(cpB, fB, pointB);
      const pair = CurveLocationDetailPair.createCapture(detailA, detailB);
      if (reversed)
        pair.swapDetails();
      this._results.push(pair);
    }
  }
  /** compute intersection of two line segments.
   * filter by extension rules.
   * record with fraction mapping.
   */
  private recordPointWithLocalFractions(
    localFractionA: number,
    cpA: CurvePrimitive,
    fractionA0: number,
    fractionA1: number,
    localFractionB: number,   // Computed intersection fraction
    cpB: CurvePrimitive,
    fractionB0: number,
    fractionB1: number,
    reversed: boolean,
    intervalDetails?: undefined | CurveLocationDetailPair) {
    let globalFractionA, globalFractionB;
    let globalFractionA1, globalFractionB1;
    const isInterval = intervalDetails !== undefined && intervalDetails.detailA.hasFraction1 && intervalDetails.detailB.hasFraction1;
    if (isInterval) {
      globalFractionA = Geometry.interpolate(fractionA0, intervalDetails!.detailA.fraction, fractionA1);
      globalFractionB = Geometry.interpolate(fractionB0, intervalDetails!.detailB.fraction, fractionB1);
      globalFractionA1 = Geometry.interpolate(fractionA0, intervalDetails!.detailA.fraction1!, fractionA1);
      globalFractionB1 = Geometry.interpolate(fractionB0, intervalDetails!.detailB.fraction1!, fractionB1);
    } else {
      globalFractionA = globalFractionA1 = Geometry.interpolate(fractionA0, localFractionA, fractionA1);
      globalFractionB = globalFractionB1 = Geometry.interpolate(fractionB0, localFractionB, fractionB1);

    }
    // ignore duplicate of most recent point .  ..
    const numPrevious = this._results.length;
    if (numPrevious > 0 && !isInterval) {
      const oldDetailA = this._results[numPrevious - 1].detailA;
      const oldDetailB = this._results[numPrevious - 1].detailB;
      if (reversed) {
        if (this.sameCurveAndFraction(cpA, globalFractionA, oldDetailB) && this.sameCurveAndFraction(cpB, globalFractionB, oldDetailA))
          return;
      } else {
        if (this.sameCurveAndFraction(cpA, globalFractionA, oldDetailA) && this.sameCurveAndFraction(cpB, globalFractionB, oldDetailB))
          return;
      }
    }
    const detailA = CurveLocationDetail.createCurveFractionPoint(cpA,
      globalFractionA, cpA.fractionToPoint(globalFractionA));
    const detailB = CurveLocationDetail.createCurveFractionPoint(cpB,
      globalFractionB, cpB.fractionToPoint(globalFractionB));

    if (isInterval) {
      detailA.captureFraction1Point1(globalFractionA1, cpA.fractionToPoint(globalFractionA1));
      detailB.captureFraction1Point1(globalFractionB1, cpB.fractionToPoint(globalFractionB1));
    } else {
      detailA.setIntervalRole(CurveIntervalRole.isolated);
      detailB.setIntervalRole(CurveIntervalRole.isolated);
    }
    if (reversed) {
      this._results.push(new CurveLocationDetailPair(detailB, detailA));
    } else {
      this._results.push(new CurveLocationDetailPair(detailA, detailB));
    }
  }
  /**
   * capture a close approach pair that has point and local fraction but not curve.
   * record with fraction mapping.
   */
  private capturePairWithLocalFractions(
    pair: CurveLocationDetailPair,
    cpA: CurvePrimitive,
    fractionA0: number,
    fractionA1: number,
    cpB: CurvePrimitive,
    fractionB0: number,
    fractionB1: number,
    reversed: boolean) {
    const globalFractionA = Geometry.interpolate(fractionA0, pair.detailA.fraction, fractionA1);
    const globalFractionB = Geometry.interpolate(fractionB0, pair.detailB.fraction, fractionB1);
    // ignore duplicate of most recent point .  ..
    const numPrevious = this._results.length;
    if (numPrevious > 0) {
      const oldDetailA = this._results[numPrevious - 1].detailA;
      const oldDetailB = this._results[numPrevious - 1].detailB;
      if (reversed) {
        if (this.sameCurveAndFraction(cpA, globalFractionA, oldDetailB) && this.sameCurveAndFraction(cpB, globalFractionB, oldDetailA))
          return;
      } else {
        if (this.sameCurveAndFraction(cpA, globalFractionA, oldDetailA) && this.sameCurveAndFraction(cpB, globalFractionB, oldDetailB))
          return;
      }
    }
    pair.detailA.setIntervalRole(CurveIntervalRole.isolated);
    pair.detailB.setIntervalRole(CurveIntervalRole.isolated);

    if (reversed) {
      this._results.push(pair);
    } else {
      pair.swapDetails();
      this._results.push(pair);
    }
  }

  /**
   * emit recordPoint for multiple pairs (on full curve!)
   * @param cpA first curve primitive.   (possibly different from curve in detailA, but fraction compatible)
   * @param cpB second curve primitive.   (possibly different from curve in detailA, but fraction compatible)
   * @param pairs array of pairs
   * @param reversed true to have order reversed in final structures.
   */
  public recordPairs(cpA: CurvePrimitive, cpB: CurvePrimitive,
    pairs: CurveLocationDetailPair[] | undefined, reversed: boolean) {
    if (pairs !== undefined) {
      for (const p of pairs) {
        this.recordPointWithLocalFractions(p.detailA.fraction, cpA, 0, 1,
          p.detailB.fraction, cpB, 0, 1, reversed, p);
      }
    }
  }
  /**
   * record fully assembled (but possibly reversed) detail pair.
   * @param detailA first detail
   * @param detailB second detail
   * @param reversed true to have order reversed in final structures.
   */
  public captureDetailPair(detailA: CurveLocationDetail | undefined, detailB: CurveLocationDetail | undefined, reversed: boolean) {
    if (detailA && detailB) {
      if (reversed) {
        this._results.push(CurveLocationDetailPair.createCapture(detailA, detailB));
      } else {
        this._results.push(CurveLocationDetailPair.createCapture(detailB, detailA));
      }
    }
  }

  /**
   *
   * @param fractionA
   * @param pointA
   * @param pointB0
   * @param pointB1
   * @param fractionB
   * @param minDistanceSquared
   * @param closestApproach
   */
  private static updatePointToSegmentDistance(fractionA: number, pointA: Point3d, pointB0: Point3d, pointB1: Point3d, fractionB: number, minDistanceSquared: number, closestApproach?: CurveLocationDetailPair): CurveLocationDetailPair | undefined {
    if (fractionB < 0)
      fractionB = 0;
    else if (fractionB > 1)
      fractionB = 1;
    this._workPointB0 = pointB0.interpolate(fractionB, pointB1, this._workPointB0);
    const distanceSquared = this._workPointB0.distanceSquaredXY(pointA);
    if (distanceSquared < minDistanceSquared) {
      if (closestApproach === undefined || distanceSquared < closestApproach.detailA.a) {
        if (closestApproach === undefined)
          closestApproach = CurveLocationDetailPair.createCapture(CurveLocationDetail.create(), CurveLocationDetail.create());
        closestApproach.detailA.setFP(fractionA, pointA);
        closestApproach.detailA.a = distanceSquared;
        closestApproach.detailB.setFP(fractionB, this._workPointB0);
        closestApproach.detailA.a = distanceSquared;
      }
    }
    return closestApproach;
  }
  /**
   * Return fractions of close approach within minDistance between two line segments( a0,a1) and (b0, b1)
   * * minDistance is assumed positive
   * Return the fractional (not xy) coordinates in result.x, result.y
   * @param a0 start point of line a
   * @param a1  end point of line a
   * @param b0  start point of line b
   * @param b1 end point of line b
   * @param result point to receive fractional coordinates of intersection.   result.x is fraction on line a. result.y is fraction on line b.
   */
  private static segmentSegmentBoundedApproach(a0: Point3d, a1: Point3d, b0: Point3d, b1: Point3d, minDistanceSquared: number): CurveLocationDetailPair | undefined {
    const ux = a1.x - a0.x;
    const uy = a1.y - a0.y;

    const vx = b1.x - b0.x;
    const vy = b1.y - b0.y;
    const e00x = b0.x - a0.x;
    const e00y = b0.y - a0.y;

    const e01x = b1.x - a0.x;
    const e01y = b1.y - a0.y;

    const e10x = b0.x - a1.x;
    const e10y = b0.y - a1.y;

    const e11x = b1.x - a1.x;
    const e11y = b1.y - a1.y;
    const hab0 = Geometry.crossProductXYXY(ux, uy, e00x, e00y);
    const hab1 = Geometry.crossProductXYXY(ux, uy, e01x, e01y);
    const hba0 = -Geometry.crossProductXYXY(vx, vy, e00x, e00y);
    const hba1 = -Geometry.crossProductXYXY(vx, vy, e11x, e11y);

    if (hab0 * hab1 < 0.0 && hba0 * hba1 < 0.0) {
      // true intersection, strictly within both segments !!!
      const fractionA = -hba0 / (hba1 - hba0);
      const fractionB = -hab0 / (hab1 - hab0);
      return CurveLocationDetailPair.createCapture(CurveLocationDetail.createCurveFractionPoint(undefined, fractionA, a0.interpolate(fractionA, a1)),
        CurveLocationDetail.createCurveFractionPoint(undefined, fractionB, b0.interpolate(fractionB, b1)));
    }
    let closestApproach: CurveLocationDetailPair | undefined;
    const uu = Geometry.hypotenuseSquaredXY(ux, uy);
    if (hab0 * hab0 < minDistanceSquared * uu)
      closestApproach = this.updatePointToSegmentDistance(0, b0, a0, a1, Geometry.dotProductXYXY(ux, uy, e00x, e00y) / uu, minDistanceSquared, closestApproach);
    if (hab1 * hab1 < minDistanceSquared * uu)
      closestApproach = this.updatePointToSegmentDistance(1, b1, a0, a1, Geometry.dotProductXYXY(ux, uy, e01x, e01y) / uu, minDistanceSquared, closestApproach);

    const vv = Geometry.hypotenuseSquaredXY(vx, vy);
    if (hba0 * hba0 < minDistanceSquared * vv)
      closestApproach = this.updatePointToSegmentDistance(0, a0, b0, b1, -Geometry.dotProductXYXY(vx, vy, e00x, e00y) / vv, minDistanceSquared, closestApproach);
    if (hba1 * hba1 < minDistanceSquared * vv)
      closestApproach = this.updatePointToSegmentDistance(1, a1, b0, b1, -Geometry.dotProductXYXY(vx, vy, e10x, e10y) / vv, minDistanceSquared, closestApproach);
    return closestApproach;
  }
  /**
   * Return fractions of close approach within minDistance between two line segments( a0,a1) and (b0, b1)
   * * minDistance is assumed positive
   * Return the fractional (not xy) coordinates in result.x, result.y
   * @param a0 start point of line a
   * @param a1  end point of line a
   * @param b0  start point of line b
   * @param b1 end point of line b
   * @param result point to receive fractional coordinates of intersection.   result.x is fraction on line a. result.y is fraction on line b.
   */
  private testAndRecordFractionalPairApproach(cpA: CurvePrimitive, fA0: number, fA1: number, testProjectionOnA: boolean,
    cpB: CurvePrimitive, fB0: number, fB1: number, testProjectionOnB: boolean, reversed: boolean) {
    const pointA0 = cpA.fractionToPoint(fA0);
    const pointA1 = cpA.fractionToPoint(fA1);
    const pointB0 = cpB.fractionToPoint(fB0);
    const pointB1 = cpB.fractionToPoint(fB1);
    this.testAndRecordPointPairApproach(cpA, fA0, pointA0, cpB, fB0, pointB0, reversed);
    this.testAndRecordPointPairApproach(cpA, fA1, pointA1, cpB, fB0, pointB0, reversed);
    this.testAndRecordPointPairApproach(cpA, fA0, pointA0, cpB, fB1, pointB1, reversed);
    this.testAndRecordPointPairApproach(cpA, fA1, pointA1, cpB, fB1, pointB1, reversed);
    if (testProjectionOnB) {
      this.testAndRecordProjection(cpA, fA0, pointA0, cpB, fB0, fB1, reversed);
      this.testAndRecordProjection(cpA, fA1, pointA1, cpB, fB0, fB1, reversed);
    }
    if (testProjectionOnA) {
      this.testAndRecordProjection(cpB, fB0, pointB0, cpA, fA0, fA1, !reversed);
      this.testAndRecordProjection(cpB, fB1, pointB1, cpA, fA0, fA1, !reversed);
    }
  }

  private testAndRecordProjection(cpA: CurvePrimitive, fA: number, pointA: Point3d,
    cpB: CurvePrimitive, fB0: number, fB1: number, reversed: boolean) {
    // NO NO NO -- this is 3D closest point --- need 2d !!
    const detail = cpB.closestPoint(pointA, false);
    if (detail) {
      const fB = Geometry.restrictToInterval(detail.fraction, fB0, fB1);
      if (fB === detail.fraction) {
        this.testAndRecordPointPairApproach(cpA, fA, pointA, cpB, detail.fraction, detail.point, reversed);
      }
    }
  }
  /** compute intersection of two line segments.
   * filter by extension rules.
   * record with fraction mapping.
   * * The fraction mappings allow portions of a linestring to be passed here.
   */
  private computeSegmentSegment3D(
    cpA: CurvePrimitive,
    pointA0: Point3d,
    fractionA0: number,
    pointA1: Point3d,
    fractionA1: number,
    cpB: CurvePrimitive,
    pointB0: Point3d,
    fractionB0: number,
    pointB1: Point3d,
    fractionB1: number,
    reversed: boolean,
  ) {
    const approach = CurveCurveCloseApproachXY.segmentSegmentBoundedApproach(pointA0, pointA1, pointB0, pointB1, this._maxDistanceSquared);
    if (approach)
      this.capturePairWithLocalFractions(approach, cpA, fractionA0, fractionA1, cpB, fractionB0, fractionB1, reversed);
  }

  // Caller accesses data from a line segment and passes to here.
  // (The line segment in question might be (a) a full line segment or (b) a fragment within a linestring.  The fraction and extend parameters
  // allow all combinations to be passed in)
  // This method applies transform.
  private dispatchSegmentSegment(
    cpA: CurvePrimitive,
    pointA0: Point3d,
    fractionA0: number,
    pointA1: Point3d,
    fractionA1: number,
    cpB: CurvePrimitive,
    pointB0: Point3d,
    fractionB0: number,
    pointB1: Point3d,
    fractionB1: number,
    reversed: boolean,
  ) {
    this.computeSegmentSegment3D(
      cpA, pointA0, fractionA0, pointA1, fractionA1,
      cpB, pointB0, fractionB0, pointB1, fractionB1,
      reversed);
  }

  // Caller accesses data from a linestring or segment and passes it here.
  // (The line segment in question might be (a) a full line segment or (b) a fragment within a linestring.  The fraction and extend parameters
  // allow all combinations to be passed in)
  private dispatchSegmentArc(
    cpA: CurvePrimitive,
    pointA0: Point3d,
    fractionA0: number,
    pointA1: Point3d,
    fractionA1: number,
    arc: Arc3d,
    reversed: boolean,
  ) {
    // To consider:
    // 1) endpoint to endpoint or projection
    // 2) true intersection
    // 3) line parallel to arc tangent.
    this.testAndRecordFractionalPairApproach(cpA, 0, 1, true, arc, 0, 1, false, reversed);
    // Arc: X = C + cU + sV
    // Line:  contains points A0,A1
    // Arc point colinear with line if det (A0, A1, X) = 0
    // with homogeneous xyw points and vectors.
    // With equational X:   det (A0, A1, C) + c det (A0, A1,U) + s det (A0, A1, V) = 0.
    // solve for theta.
    // evaluate points.
    // project back to line.

    const data = arc.toTransformedVectors();
    const pointA0Local = pointA0;
    const pointA1Local = pointA1;
    const alpha = Geometry.tripleProductXYW(pointA0Local, 1, pointA1Local, 1, data.center, 1);
    const beta = Geometry.tripleProductXYW(pointA0Local, 1, pointA1Local, 1, data.vector0, 0);
    const gamma = Geometry.tripleProductXYW(pointA0Local, 1, pointA1Local, 1, data.vector90, 0);
    const cosines = new GrowableFloat64Array(2);
    const sines = new GrowableFloat64Array(2);
    const radians = new GrowableFloat64Array(2);
    const numRoots = AnalyticRoots.appendImplicitLineUnitCircleIntersections(alpha, beta, gamma, cosines, sines, radians);
    for (let i = 0; i < numRoots; i++) {
      const arcPoint = data.center.plus2Scaled(data.vector0, cosines.atUncheckedIndex(i), data.vector90, sines.atUncheckedIndex(i));
      const arcFraction = data.sweep.radiansToSignedPeriodicFraction(radians.atUncheckedIndex(i));
      const lineFraction = SmallSystem.lineSegment3dXYClosestPointUnbounded(pointA0Local, pointA1Local, arcPoint);
      if (lineFraction !== undefined && this.acceptFraction(lineFraction) && this.acceptFraction(arcFraction)) {
        this.recordPointWithLocalFractions(lineFraction, cpA, fractionA0, fractionA1,
          arcFraction, arc, 0, 1, reversed);
      }
    }

    // line parallel to arc tangent.
    const dotUT = data.vector0.crossProductStartEndXY(pointA0, pointA1);
    const dotVT = data.vector90.crossProductStartEndXY(pointA0, pointA1);
    const parallelRadians = Math.atan2(dotVT, dotUT);
    for (const radians1 of [parallelRadians, parallelRadians + Math.PI]) {
      const arcPoint = data.center.plus2Scaled(data.vector0, Math.cos(radians1), data.vector90, Math.sin(radians1));
      const arcFraction = data.sweep.radiansToSignedPeriodicFraction(radians1);
      const lineFraction = SmallSystem.lineSegment3dXYClosestPointUnbounded(pointA0Local, pointA1Local, arcPoint);
      if (lineFraction !== undefined && this.acceptFraction(lineFraction) && this.acceptFraction(arcFraction)) {
        this.recordPointWithLocalFractions(lineFraction, cpA, fractionA0, fractionA1,
          arcFraction, arc, 0, 1, reversed);
      }
    }

  }

  // Caller accesses data from two arcs, ensures circular, and orders with radiusA >= radiusB

  private dispatchCircularCircularOrdered(
    cpA: Arc3d,
    radiusA: number,
    cpB: Arc3d,
    radiusB: number,
    reversed: boolean,
  ) {
    const c = cpA.center.distance(cpB.center);
    const e = this._maxDistanceToAccept !== undefined ? this._maxDistanceToAccept : Geometry.smallMetricDistance;
    if (c > radiusA + radiusB + e)    // widely separated !!
      return;
    // To consider:
    // 1) endpoint to endpoint or projection
    // 2) true intersection
    // 3) line parallel to arc tangent.
    this.testAndRecordFractionalPairApproach(cpA, 0, 1, false, cpB, 0, 1, false, reversed);
    if (Geometry.isSmallMetricDistance(c)) {

    } else {
      // ?? endpoint hits are recorded.  Maybe also need overlap?
      const vectorAB = Vector3d.createStartEnd(cpA.center, cpB.center);
      vectorAB.scaleInPlace(1.0 / c);
      if (c - radiusA - radiusB > e) {
        // no approaches possible
      } else {
        for (const rA of [-radiusA, radiusA]) {
          for (const rB of [-radiusB, radiusB]) {
            const tangentDistance = c - rA + rB;
            if (tangentDistance < e) {
              const detailA = this.resolveDirectionToArcXYFraction(cpA, vectorAB, rA);
              if (detailA) {
                const detailB = this.resolveDirectionToArcXYFraction(cpB, vectorAB, rB);
                if (detailB) {
                  this.captureDetailPair(detailA, detailB, reversed);
                }
              }
            }
          }
        }
      }
    }
  }
  /** Find the fractional point (if any) on an arc, known to be circular and displayed from the center in the direction of a scaled vector.
   *
   */
  private resolveDirectionToArcXYFraction(arc: Arc3d, radialVector: Vector3d, scale: number): CurveLocationDetail | undefined {
    // The scale ultimately only affects the direction --- easiest way to use it is two multiplies
    const c = scale * arc.matrixRef.columnDotXYZ(0, radialVector.x, radialVector.y, 0);
    const s = scale * arc.matrixRef.columnDotXYZ(1, radialVector.x, radialVector.y, 0);
    const radians = Math.atan2(s, c);
    const fraction = arc.sweep.radiansToPositivePeriodicFraction(radians, 0);
    if (fraction < 1.0)
      return CurveLocationDetail.createCurveEvaluatedFraction(arc, fraction);
    return undefined;
  }
  // Caller accesses data from two arcs.
  // Selects the best conditioned arc (in xy parts) as "circle after inversion"
  // Solves the arc-arc equations
  private dispatchArcArc(
    cpA: Arc3d,
    cpB: Arc3d,
    reversed: boolean,
  ) {
    if (this._circularArcB) {
      const radiusB = this._circularRadiusB!;
      const radiusA = cpA.circularRadiusXY();
      if (radiusA !== undefined) {
        if (radiusA >= radiusB)
          this.dispatchCircularCircularOrdered(cpA, radiusA, cpB, radiusB, reversed);
        else
          this.dispatchCircularCircularOrdered(cpB, radiusB, cpA, radiusA, !reversed);
        return;
      }
    }
    // Fall through for
  }
  // Caller accesses data from two arcs.
  // Selects the best conditioned arc (in xy parts) as "circle after inversion"
  // Solves the arc-arc equations
  private dispatchArcBsplineCurve3d(
    cpA: Arc3d,
    cpB: BSplineCurve3d,
    reversed: boolean) {
    const ls = LineString3d.create();
    cpB.emitStrokes(ls);
    this.computeArcLineString(cpA, ls, reversed);
  }

  // Caller accesses data from two arcs.
  // Selects the best conditioned arc (in xy parts) as "circle after inversion"
  // Solves the arc-arc equations
  private dispatchBSplineCurve3dBSplineCurve3d(
    bcurveA: BSplineCurve3dBase,
    bcurveB: BSplineCurve3dBase,
    reversed: boolean) {
    const lsA = LineString3d.create();
    bcurveA.emitStrokes(lsA);
    const lsB = LineString3d.create();
    bcurveB.emitStrokes(lsB);
    this.computeLineStringLineString(lsA, lsB, reversed);

  }

  private static _workPointAA0 = Point3d.create();
  private static _workPointAA1 = Point3d.create();
  private static _workPointBB0 = Point3d.create();
  private static _workPointBB1 = Point3d.create();
  private static _workPointBB2 = Point3d.create();
  private static _workVectorA = Vector3d.create();
  /** low level dispatch of linestring with (beziers of) a bspline curve */
  public dispatchLineStringBSplineCurve(lsA: LineString3d, curveB: BSplineCurve3d, reversed: boolean): any {
    const lsB = LineString3d.create();
    curveB.emitStrokes(lsB);
    this.computeLineStringLineString(lsA, lsB, reversed);
  }
  /** low level dispatch of linestring with (beziers of) a bspline curve */
  public dispatchSegmentBsplineCurve(lsA: LineSegment3d, curveB: BSplineCurve3d, reversed: boolean): any {
    const lsB = LineString3d.create();
    curveB.emitStrokes(lsB);
    this.computeSegmentLineString(lsA, lsB, reversed);
  }
  /** Detail computation for segment approaching linestring. */
  public computeSegmentLineString(lsA: LineSegment3d, lsB: LineString3d, reversed: boolean): any {
    const pointA0 = lsA.point0Ref;
    const pointA1 = lsA.point1Ref;
    let pointB0 = CurveCurveCloseApproachXY._workPointBB0;
    let pointB1 = CurveCurveCloseApproachXY._workPointBB1;
    let pointB2 = CurveCurveCloseApproachXY._workPointBB2;
    let cross0, cross1, cross2;
    let dot0, dot1, dot2;
    const vectorA = CurveCurveCloseApproachXY._workVectorA;
    Vector3d.createStartEnd(pointA0, pointA1, vectorA);
    const aa = vectorA.magnitudeSquared();
    const numB = lsB.numPoints();
    lsB.packedPoints.getPoint3dAtUncheckedPointIndex(0, pointB0);
    lsB.packedPoints.getPoint3dAtUncheckedPointIndex(1, pointB0);
    cross0 = vectorA.crossProductStartEndXY(pointA0, pointB0);
    cross1 = vectorA.crossProductStartEndXY(pointA0, pointB0);
    dot0 = vectorA.dotProductStartEndXY(pointA0, pointB0);
    dot1 = vectorA.dotProductStartEndXY(pointA0, pointB1);
    for (let iB = 2; iB < numB; iB++) {
      // project point B[iB] to segmentA.  If within limits, see if it is a local minimum distance . . .
      lsB.packedPoints.getPoint3dAtUncheckedPointIndex(iB, pointB1);
      cross2 = vectorA.crossProductStartEndXY(pointA0, pointB0);
      dot2 = vectorA.dotProductStartEndXY(pointA0, pointB2);
      if ((cross0 - cross1) * (cross2 - cross1) <= 0.0) {
        // There is a true minimum at point1 ... see if it is within the line
        if (dot1 >= 0.0 && dot1 <= aa) {
          const fractionA1 = dot1 / aa;
          const projection = pointA0.interpolate(dot1 / aa, pointA1);
          if (pointB1.distanceXY(projection) < this._maxDistanceToAccept!) {
            const detailA = CurveLocationDetail.createCurveFractionPoint(lsA, fractionA1, projection);
            const detailB = CurveLocationDetail.createCurveFractionPoint(lsB, iB / (numB - 1), pointB2);
            const pair = CurveLocationDetailPair.createCaptureOptionalReverse(detailA, detailB, reversed);
            this._results.push(pair);
          }
        }
      }
      const tempPoint = pointB0; pointB0 = pointB1; pointB1 = pointB2; pointB2 = tempPoint;
      const tempCross = cross0; cross0 = cross1; cross1 = cross2; cross2 = tempCross;
      const tempDot = dot0; dot0 = dot1; dot1 = dot2; dot2 = tempDot;
    }
    this.testAndRecordFractionalPairApproach(lsA, 0, 1, true, lsB, 0, 1, false, reversed);
    return undefined;
  }
  /** Detail computation for arcA intersecting lsB. */
  public computeArcLineString(arcA: Arc3d, lsB: LineString3d, reversed: boolean): any {
    const pointB0 = CurveCurveCloseApproachXY._workPointBB0;
    const pointB1 = CurveCurveCloseApproachXY._workPointBB1;
    const numB = lsB.numPoints();
    if (numB > 1) {
      const dfB = 1.0 / (numB - 1);
      let fB0;
      let fB1;
      fB0 = 0.0;
      lsB.pointAt(0, pointB0);
      for (let ib = 1; ib < numB; ib++, pointB0.setFrom(pointB1), fB0 = fB1) {
        lsB.pointAt(ib, pointB1);
        fB1 = ib * dfB;
        this.dispatchSegmentArc(
          lsB, pointB0, fB0, pointB1, fB1,
          arcA,
          !reversed);
      }
    }
    return undefined;
  }

  private static _workPointB0 = Point3d.create();
  // private static _workPointB1 = Point3d.create();
  /** double dispatch handler for strongly typed segment.. */
  public override handleLineSegment3d(segmentA: LineSegment3d): any {
    if (this._geometryB instanceof LineSegment3d) {
      const segmentB = this._geometryB;
      this.dispatchSegmentSegment(
        segmentA, segmentA.point0Ref, 0.0, segmentA.point1Ref, 1.0,
        segmentB, segmentB.point0Ref, 0.0, segmentB.point1Ref, 1.0,
        false);
    } else if (this._geometryB instanceof LineString3d) {
      this.computeSegmentLineString(segmentA, this._geometryB, false);
    } else if (this._geometryB instanceof Arc3d) {
      this.dispatchSegmentArc(
        segmentA, segmentA.point0Ref, 0.0, segmentA.point1Ref, 1.0,
        this._geometryB, false);
    } else if (this._geometryB instanceof BSplineCurve3d) {
      this.dispatchSegmentBsplineCurve(segmentA, this._geometryB, false);
    }
  }
  private computeLineStringLineString(lsA: LineString3d, lsB: LineString3d, reversed: boolean) {
    const rangeA = lsA.range();
    const rangeB = lsB.range();
    rangeA.expandInPlace(this._maxDistanceToAccept!);
    if (!rangeB.intersectsRangeXY(rangeA))
      return;
    let bitB0: number;
    let bitB1: number;
    const rangeA1 = Range3d.createNull();
    const pointA0 = CurveCurveCloseApproachXY._workPointAA0;
    const pointA1 = CurveCurveCloseApproachXY._workPointAA1;
    const pointB0 = CurveCurveCloseApproachXY._workPointBB0;
    const pointB1 = CurveCurveCloseApproachXY._workPointBB1;
    const numA = lsA.numPoints();
    const numB = lsB.numPoints();
    if (numA > 1 && numB > 1) {
      lsA.pointAt(0, pointA0);
      const dfA = 1.0 / (numA - 1);
      const dfB = 1.0 / (numB - 1);
      let fA0 = 0.0;
      let fB0;
      let fA1;
      let fB1;
      lsA.pointAt(0, pointA0);
      for (let ia = 1; ia < numA; ia++, pointA0.setFrom(pointA1), fA0 = fA1) {
        fA1 = ia * dfA;
        fB0 = 0.0;
        lsA.pointAt(ia, pointA1);
        rangeA1.setNull();
        rangeA1.extendPoint(pointA0);
        rangeA1.extendPoint(pointA1);
        rangeA1.expandInPlace(this._maxDistanceToAccept!);
        if (rangeA1.intersectsRangeXY(rangeB)) {
          lsB.pointAt(0, pointB0);
          bitB0 = classifyBitsPointRangeXY(pointB0.x, pointB0.y, rangeA1);
          for (let ib = 1; ib < numB; ib++, pointB0.setFrom(pointB1), fB0 = fB1, bitB0 = bitB1) {
            lsB.pointAt(ib, pointB1);
            bitB1 = classifyBitsPointRangeXY(pointB1.x, pointB1.y, rangeA1);
            fB1 = ib * dfB;
            // Do NOT study the segment in detail if both bitB bits are on for any of the 4 planes . ..
            if ((bitB0 & bitB1) === 0) {
              this.dispatchSegmentSegment(
                lsA, pointA0, fA0, pointA1, fA1,
                lsB, pointB0, fB0, pointB1, fB1,
                reversed);
            }
          }
        }
      }
    }
  }
  /** double dispatch handler for strongly typed linestring.. */
  public override handleLineString3d(lsA: LineString3d): any {
    if (this._geometryB instanceof LineString3d) {
      const lsB = this._geometryB;
      this.computeLineStringLineString(lsA, lsB, false);
    } else if (this._geometryB instanceof LineSegment3d) {
      this.computeSegmentLineString(this._geometryB, lsA, true);
    } else if (this._geometryB instanceof Arc3d) {
      this.computeArcLineString(this._geometryB, lsA, true);
    } else if (this._geometryB instanceof BSplineCurve3d) {
      this.dispatchLineStringBSplineCurve(lsA, this._geometryB, false);
    }
    return undefined;
  }
  /** double dispatch handler for strongly typed arc .. */
  public override handleArc3d(arc0: Arc3d): any {
    if (this._geometryB instanceof LineSegment3d) {
      this.dispatchSegmentArc(
        this._geometryB, this._geometryB.point0Ref, 0.0, this._geometryB.point1Ref, 1.0,
        arc0, true);
    } else if (this._geometryB instanceof LineString3d) {
      this.computeArcLineString(arc0, this._geometryB, false);
    } else if (this._geometryB instanceof Arc3d) {
      this.dispatchArcArc(arc0, this._geometryB, false);
    } else if (this._geometryB instanceof BSplineCurve3d) {
      this.dispatchArcBsplineCurve3d(arc0, this._geometryB, false);
    }
    return undefined;
  }
  /** double dispatch handler for strongly typed bspline curve .. */
  public override handleBSplineCurve3d(curve: BSplineCurve3d): any {
    if (this._geometryB instanceof LineSegment3d) {
      this.dispatchSegmentBsplineCurve(this._geometryB, curve, true);
    } else if (this._geometryB instanceof LineString3d) {
      this.dispatchLineStringBSplineCurve(this._geometryB, curve, true);
    } else if (this._geometryB instanceof Arc3d) {
      this.dispatchArcBsplineCurve3d(this._geometryB, curve, true);
    } else if (this._geometryB instanceof BSplineCurve3dBase) {
      this.dispatchBSplineCurve3dBSplineCurve3d(curve, this._geometryB, false);
    }
    return undefined;
  }
  /** double dispatch handler for strongly typed homogeneous bspline curve .. */
  public override handleBSplineCurve3dH(_curve: BSplineCurve3dH): any {
    /* NEEDS WORK -- make "dispatch" methods tolerant of both 3d and 3dH ..."easy" if both present BezierCurve3dH span loaders
    if (this._geometryB instanceof LineSegment3d) {
      this.dispatchSegmentBsplineCurve(
        this._geometryB, this._extendB, this._geometryB.point0Ref, 0.0, this._geometryB.point1Ref, 1.0, this._extendB,
        curve, this._extendA, true);
    } else if (this._geometryB instanceof LineString3d) {
      this.dispatchLineStringBSplineCurve(this._geometryB, this._extendB, curve, this._extendA, true);
    } else if (this._geometryB instanceof Arc3d) {
      this.dispatchArcBsplineCurve3d(this._geometryB, this._extendB, curve, this._extendA, true);
    }
    */
    return undefined;
  }
}
