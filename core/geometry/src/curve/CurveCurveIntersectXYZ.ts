/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */

import { BSplineCurve3d, BSplineCurve3dBase } from "../bspline/BSplineCurve";
// import { BezierCurveBase } from "../bspline/BezierCurveBase";
// import { BezierCurve3dH } from "../bspline/BezierCurve3dH";
// import { UnivariateBezier } from "../numerics/BezierPolynomials";
import { BSplineCurve3dH } from "../bspline/BSplineCurve3dH";
import { Geometry } from "../Geometry";
import { NullGeometryHandler } from "../geometry3d/GeometryHandler";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/Plane3dByOriginAndUnitNormal";
// import { Arc3d } from "./Arc3d";
import { Vector2d } from "../geometry3d/Point2dVector2d";
// import { XYAndZ } from "../geometry3d/XYZProps";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
// import { LineString3d } from "./LineString3d";
import { SmallSystem, TrigPolynomial } from "../numerics/Polynomials";
// import { Point4d } from "../geometry4d/Point4d";
// import { Transform } from "../geometry3d/Transform";
// import { Matrix3d } from "../geometry3d/Matrix3d";
import { Arc3d } from "./Arc3d";
// import { Range3d } from "../geometry3d/Range";
import { CurveLocationDetailArrayPair } from "./CurveCurveIntersectXY";
import { CurveIntervalRole, CurveLocationDetail } from "./CurveLocationDetail";
import { CurvePrimitive } from "./CurvePrimitive";
import { GeometryQuery } from "./GeometryQuery";
import { LineSegment3d } from "./LineSegment3d";
import { LineString3d } from "./LineString3d";

// cspell:word XYRR
/**
 * * Handler class for XYZ intersections.
 * * Instances are initialized and called from CurveCurve.
 * * Constructor is told two geometry items A and B
 *   * geometryB is saved for later reference
 *   * type-specific handler methods will "see" geometry A repeatedly.
 *   * Hence geometryA is NOT saved by the constructor.
 * @internal
 */
export class CurveCurveIntersectXYZ extends NullGeometryHandler {
  // private geometryA: GeometryQuery;  // nb never used -- passed through handlers.
  private _extendA: boolean;
  private _geometryB: GeometryQuery;
  private _extendB: boolean;
  private _results!: CurveLocationDetailArrayPair;
  private reinitialize() {
    this._results = new CurveLocationDetailArrayPair();
  }
  /**
   *
   * @param _geometryA first curve for intersection.  This is NOT saved.
   * @param extendA flag to enable using extension of geometryA.
   * @param geometryB second curve for intersection.  Saved for reference by specific handler methods.
   * @param extendB flag for extension of geometryB.
   */
  public constructor(_geometryA: GeometryQuery, extendA: boolean, geometryB: GeometryQuery, extendB: boolean) {
    super();
    // this.geometryA = _geometryA;
    this._extendA = extendA;
    this._geometryB = geometryB;
    this._extendB = extendB;
    this.reinitialize();
  }
  /**
   * * Return the results structure for the intersection calculation.
   * @param reinitialize if true, a new results structure is created for use by later calls.
   *
   */
  public grabResults(reinitialize: boolean = false): CurveLocationDetailArrayPair {
    const result = this._results;
    if (reinitialize)
      this.reinitialize();
    return result;
  }

  private static _workVector2dA = Vector2d.create();

  private acceptFraction(extend0: boolean, fraction: number, extend1: boolean) {
    if (!extend0 && fraction < 0.0)
      return false;
    if (!extend1 && fraction > 1.0)
      return false;
    return true;
  }

  /** compute intersection of two line segments.
   * filter by extension rules.
   * reject if evaluated points do not match coordinates (e.g. close approach point)
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
  ) {
    const globalFractionA = Geometry.interpolate(fractionA0, localFractionA, fractionA1);
    const globalFractionB = Geometry.interpolate(fractionB0, localFractionB, fractionB1);
    // ignore duplicate of most recent point .  ..
    const numPrevious = this._results.dataA.length;
    if (numPrevious > 0) {
      const topFractionA = this._results.dataA[numPrevious - 1].fraction;
      const topFractionB = this._results.dataB[numPrevious - 1].fraction;
      if (reversed) {
        if (Geometry.isAlmostEqualNumber(topFractionA, globalFractionB) && Geometry.isAlmostEqualNumber(topFractionB, globalFractionA))
          return;
      } else {
        if (Geometry.isAlmostEqualNumber(topFractionA, globalFractionA) && Geometry.isAlmostEqualNumber(topFractionB, globalFractionB))
          return;
      }
    }
    const pointA = cpA.fractionToPoint(globalFractionA);
    const pointB = cpB.fractionToPoint(globalFractionB);
    if (!pointA.isAlmostEqualMetric(pointB))
      return;

    const detailA = CurveLocationDetail.createCurveFractionPoint(cpA,
      globalFractionA, pointA);
    detailA.setIntervalRole(CurveIntervalRole.isolated);
    const detailB = CurveLocationDetail.createCurveFractionPoint(cpB,
      globalFractionB, pointB);
    detailB.setIntervalRole(CurveIntervalRole.isolated);
    if (reversed) {
      this._results.dataA.push(detailB);
      this._results.dataB.push(detailA);
    } else {
      this._results.dataA.push(detailA);
      this._results.dataB.push(detailB);
    }
  }
  /** compute intersection of two line segments.
   * filter by extension rules.
   * record with fraction mapping.
   */
  private computeSegmentSegment3D(
    cpA: CurvePrimitive,
    extendA0: boolean,
    pointA0: Point3d,
    fractionA0: number,
    pointA1: Point3d,
    fractionA1: number,
    extendA1: boolean,
    cpB: CurvePrimitive,
    extendB0: boolean,
    pointB0: Point3d,
    fractionB0: number,
    pointB1: Point3d,
    fractionB1: number,
    extendB1: boolean,
    reversed: boolean,
  ) {
    const uv = CurveCurveIntersectXYZ._workVector2dA;
    if (SmallSystem.lineSegment3dClosestApproachUnbounded(
      pointA0, pointA1,
      pointB0, pointB1, uv)
      && this.acceptFraction(extendA0, uv.x, extendA1)
      && this.acceptFraction(extendB0, uv.y, extendB1)
    ) {
      this.recordPointWithLocalFractions(uv.x, cpA, fractionA0, fractionA1, uv.y, cpB, fractionB0, fractionB1, reversed);
    }
  }
  // Caller accesses data from a line segment and passes to here.
  // (The line segment in question might be (a) a full line segment or (b) a fragment within a linestring.  The fraction and extend parameters
  // allow all combinations to be passed in)
  // This method applies transform.
  private dispatchSegmentSegment(
    cpA: CurvePrimitive,
    extendA0: boolean,
    pointA0: Point3d,
    fractionA0: number,
    pointA1: Point3d,
    fractionA1: number,
    extendA1: boolean,
    cpB: CurvePrimitive,
    extendB0: boolean,
    pointB0: Point3d,
    fractionB0: number,
    pointB1: Point3d,
    fractionB1: number,
    extendB1: boolean,
    reversed: boolean,
  ) {
    this.computeSegmentSegment3D(
      cpA, extendA0, pointA0, fractionA0, pointA1, fractionA1, extendA1,
      cpB, extendB0, pointB0, fractionB0, pointB1, fractionB1, extendB1,
      reversed);
  }
  /**
   * Create a plane whose normal is a "better" cross product as a choice of `vectorA cross vectorB` or `vectorA cross vectorC`
   * * The heuristic for "better" is:
   *   * first choice is cross product with `vectorB`.  Use it if the cosine of the angel from vectorA to vectorB is less than cosineValue.
   *   * otherwise use vectorC
   * @param origin plane origin
   * @param vectorA vector which must be in the plane.
   * @param cosineValue typically cosine of something near 90 degrees.
   * @param vectorB first candidate for additional in-plane vector
   * @param vectorC second candidate for additional in-plane vector
   */
  public createPlaneWithPreferredPerpendicular(origin: Point3d, vectorA: Vector3d, cosineValue: number, vectorB: Vector3d, vectorC: Vector3d): Plane3dByOriginAndUnitNormal | undefined {
    const dotAA = vectorA.magnitudeSquared();
    const dotBB = vectorB.magnitudeSquared();
    const dotAB = Math.abs(vectorA.dotProduct(vectorB));
    const cross = vectorA.unitCrossProduct(dotAB < cosineValue * dotAA * dotBB ? vectorB : vectorC);
    if (cross)
      return Plane3dByOriginAndUnitNormal.create(origin, cross);
    return undefined;
  }
  // Caller accesses data from a linestring or segment and passes it here.
  // (The line segment in question might be (a) a full line segment or (b) a fragment within a linestring.  The fraction and extend parameters
  // allow all combinations to be passed in)
  private dispatchSegmentArc(
    cpA: CurvePrimitive,
    extendA0: boolean,
    pointA0: Point3d,
    fractionA0: number,
    pointA1: Point3d,
    fractionA1: number,
    extendA1: boolean,
    arc: Arc3d,
    extendB0: boolean,
    extendB1: boolean,
    reversed: boolean,
  ) {
    const lineVector = Vector3d.createStartEnd(pointA0, pointA1);
    const plane = this.createPlaneWithPreferredPerpendicular(pointA0, lineVector, 0.9, arc.perpendicularVector, arc.vector0);
    if (plane !== undefined) {
      const candidates: CurveLocationDetail[] = [];
      arc.appendPlaneIntersectionPoints(plane, candidates);
      let lineFraction;
      let linePoint: Point3d | undefined;
      for (const c of candidates) {
        if (this.acceptFraction(extendB0, c.fraction, extendB1)) {
          lineFraction = SmallSystem.lineSegment3dXYClosestPointUnbounded(pointA0, pointA1, c.point);
          if (lineFraction !== undefined) {
            linePoint = pointA0.interpolate(lineFraction, pointA1, linePoint);
            if (linePoint.isAlmostEqualMetric(c.point)
              && this.acceptFraction(extendA0, lineFraction, extendA1)) {
              this.recordPointWithLocalFractions(lineFraction, cpA, fractionA0, fractionA1,
                c.fraction, arc, 0, 1, reversed);

            }
          }
        }
      }
    }
  }

  // Caller promises arcs are coplanar.
  // Passes "other" as {center, vector0, vector90} in local xy space of cpA
  // Solves the arc-arc equations for that local ellipse with unit circle.
  // Solution fractions map directly to original arcs.
  private dispatchArcArcInPlane(
    cpA: Arc3d,
    extendA: boolean,
    cpB: Arc3d,
    extendB: boolean,
    reversed: boolean,
  ) {
    const otherVectors = cpA.otherArcAsLocalVectors(cpB);
    if (otherVectors !== undefined) {
      const ellipseRadians: number[] = [];
      const circleRadians: number[] = [];
      TrigPolynomial.solveUnitCircleHomogeneousEllipseIntersection(
        otherVectors.center.x, otherVectors.center.y, 1.0,
        otherVectors.vector0.x, otherVectors.vector0.y, 0.0,
        otherVectors.vector90.x, otherVectors.vector90.y, 0.0,
        ellipseRadians, circleRadians);
      for (let i = 0; i < ellipseRadians.length; i++) {
        const fractionA = cpA.sweep.radiansToSignedPeriodicFraction(circleRadians[i]);
        const fractionB = cpA.sweep.radiansToSignedPeriodicFraction(ellipseRadians[i]);
        // hm .. do we really need to check the fractions?  We know they are internal to the beziers
        if (this.acceptFraction(extendA, fractionA, extendA) && this.acceptFraction(extendB, fractionB, extendB)) {
          this.recordPointWithLocalFractions(fractionA, cpA, 0, 1,
            fractionB, cpB, 0, 1, reversed);
        }
      }
    }
  }
  // Caller accesses data from two arcs.
  // Selects the best conditioned arc (in xy parts) as "circle after inversion"
  // Solves the arc-arc equations
  private dispatchArcArc(
    cpA: Arc3d,
    extendA: boolean,
    cpB: Arc3d,
    extendB: boolean,
    reversed: boolean,
  ) {
    // If arcs are in different planes:
    // 1) Intersect each plane with the other arc (quadratic)
    // 2) accept points that appear in both intersection sets.
    // If arcs are in parallel planes -- no intersections
    // If arcs are in the same plane -- xy intersection in that plane.
    const planeA = Plane3dByOriginAndUnitNormal.create(cpA.center, cpA.perpendicularVector);
    const planeB = Plane3dByOriginAndUnitNormal.create(cpB.center, cpB.perpendicularVector);
    if (planeA === undefined || planeB === undefined)
      return;

    if (planeA.getNormalRef().isParallelTo(planeB.getNormalRef())) {
      if (planeA.isPointInPlane(planeB.getOriginRef()) && planeB.isPointInPlane(planeA.getOriginRef())) {
        // coplanar !!!
        this.dispatchArcArcInPlane(cpA, extendA, cpB, extendB, reversed);
      }
    } else {
      const arcBPoints: CurveLocationDetail[] = [];
      cpB.appendPlaneIntersectionPoints(planeA, arcBPoints);
      const arcAPoints: CurveLocationDetail[] = [];
      cpA.appendPlaneIntersectionPoints(planeB, arcAPoints);
      for (const detailB of arcBPoints) {
        for (const detailA of arcAPoints) {
          if (detailA.point.isAlmostEqual(detailB.point)) {
            if (this.acceptFraction(extendA, detailA.fraction, extendA)
              && this.acceptFraction(extendB, detailB.fraction, extendB)) {
              this.recordPointWithLocalFractions(detailA.fraction, cpA, 0, 1,
                detailB.fraction, cpB, 0, 1, reversed);
            }
          }
        }
      }
    }
  }
  // Caller accesses data from two arcs.
  // Selects the best conditioned arc (in xy parts) as "circle after inversion"
  // Solves the arc-arc equations
  private dispatchArcBsplineCurve3d(
    _: Arc3d,
    _extendA: boolean,
    _cpB: BSplineCurve3d,
    _extendB: boolean,
    _reversed: boolean,
  ) {
    /*
    // Arc: X = C + cU + sV
    // implicitize the arc as viewed.  This "3d" matrix is homogeneous "XYW" not "xyz"
    let matrixA: Matrix3d;
    if (this._worldToLocalPerspective) {
      const dataA = cpA.toTransformedPoint4d(this._worldToLocalPerspective);
      matrixA = Matrix3d.createColumnsXYW(dataA.vector0, dataA.vector0.w, dataA.vector90, dataA.vector90.w, dataA.center, dataA.center.w);
    } else {
      const dataA = cpA.toTransformedVectors(this._worldToLocalAffine);
      matrixA = Matrix3d.createColumnsXYW(dataA.vector0, 0, dataA.vector90, 0, dataA.center, 1);
    }
    // The worldToLocal has moved the arc vectors into screen space.
    // matrixA captures the xyw parts (ignoring z)
    // for any point in world space,
    // THIS CODE ONLY WORKS FOR
    const matrixAInverse = matrixA.inverse();
    if (matrixAInverse) {
      const orderF = cpB.order; // order of the beziers for simple coordinates
      const orderG = 2 * orderF - 1;  // order of the (single) bezier for squared coordinates.
      const coffF = new Float64Array(orderF);
      const univariateBezierG = new UnivariateBezier(orderG);
      const axx = matrixAInverse.at(0, 0); const axy = matrixAInverse.at(0, 1); const axz = 0.0; const axw = matrixAInverse.at(0, 2);
      const ayx = matrixAInverse.at(1, 0); const ayy = matrixAInverse.at(1, 1); const ayz = 0.0; const ayw = matrixAInverse.at(1, 2);
      const awx = matrixAInverse.at(2, 0); const awy = matrixAInverse.at(2, 1); const awz = 0.0; const aww = matrixAInverse.at(2, 2);

      if (matrixAInverse) {
        let bezier: BezierCurve3dH | undefined;
        for (let spanIndex = 0; ; spanIndex++) {
          bezier = cpB.getSaturatedBezierSpan3dH(spanIndex, bezier);
          if (!bezier) break;
          if (this._worldToLocalPerspective)
            bezier.tryMultiplyMatrix4dInPlace(this._worldToLocalPerspective);
          else if (this._worldToLocalAffine)
            bezier.tryTransformInPlace(this._worldToLocalAffine);
          univariateBezierG.zero();
          bezier.poleProductsXYZW(coffF, axx, axy, axz, axw);
          univariateBezierG.addSquaredSquaredBezier(coffF, 1.0);
          bezier.poleProductsXYZW(coffF, ayx, ayy, ayz, ayw);
          univariateBezierG.addSquaredSquaredBezier(coffF, 1.0);
          bezier.poleProductsXYZW(coffF, awx, awy, awz, aww);
          univariateBezierG.addSquaredSquaredBezier(coffF, -1.0);
          const roots = univariateBezierG.roots(0.0, true);
          if (roots) {
            for (const root of roots) {
              const fractionB = bezier.fractionToParentFraction(root);
              // The univariate bezier (which has been transformed by the view transform) evaluates into xyw space
              const bcurvePoint4d = bezier.fractionToPoint4d(root);
              const c = bcurvePoint4d.dotProductXYZW(axx, axy, axz, axw);
              const s = bcurvePoint4d.dotProductXYZW(ayx, ayy, ayz, ayw);
              const arcFraction = cpA.sweep.radiansToSignedPeriodicFraction(Math.atan2(s, c));
              if (this.acceptFraction(extendA, arcFraction, extendA) && this.acceptFraction(extendB, fractionB, extendB)) {
                this.recordPointWithLocalFractions(arcFraction, cpA, 0, 1,
                  fractionB, cpB, 0, 1, reversed);
              }
            }
          }
        }
      }
    }
     */
  }
  /*
  // apply the transformation to bezier curves. optionally construct ranges.
  private transformBeziers(beziers: BezierCurve3dH[]) {
    if (this._worldToLocalAffine) {
      for (const bezier of beziers) bezier.tryTransformInPlace(this._worldToLocalAffine);
    } else if (this._worldToLocalPerspective) {
      for (const bezier of beziers) bezier.tryMultiplyMatrix4dInPlace(this._worldToLocalPerspective);
    }
  }
   */
  /*
  private getRanges(beziers: BezierCurveBase[]): Range3d[] {
    const ranges: Range3d[] = [];
    ranges.length = 0;
    for (const b of beziers) {
      ranges.push(b.range());
    }
    return ranges;
  }
  private _xyzwA0?: Point4d;
  private _xyzwA1?: Point4d;
  private _xyzwPlane?: Point4d;
  private _xyzwB?: Point4d;

  private dispatchBezierBezierStrokeFirst(
    bezierA: BezierCurve3dH,
    bcurveA: BSplineCurve3dBase,
    strokeCountA: number,
    bezierB: BezierCurve3dH,
    bcurveB: BSplineCurve3dBase,
    _strokeCountB: number,
    univariateBezierB: UnivariateBezier,  // caller-allocated for univariate coefficients.
    reversed: boolean) {
    if (!this._xyzwA0) this._xyzwA0 = Point4d.create();
    if (!this._xyzwA1) this._xyzwA1 = Point4d.create();
    if (!this._xyzwPlane) this._xyzwPlane = Point4d.create();
    if (!this._xyzwB) this._xyzwB = Point4d.create();
    /-*

              const roots = univariateBezierG.roots(0.0, true);
              if (roots) {
                for (const root of roots) {
                  const fractionB = bezier.fractionToParentFraction(root);
                  // The univariate bezier (which has been transformed by the view transform) evaluates into xyw space
                  const bcurvePoint4d = bezier.fractionToPoint4d(root);
                  const c = bcurvePoint4d.dotProductXYZW(axx, axy, axz, axw);
                  const s = bcurvePoint4d.dotProductXYZW(ayx, ayy, ayz, ayw);
                  const arcFraction = cpA.sweep.radiansToSignedPeriodicFraction(Math.atan2(s, c));
                  if (this.acceptFraction(extendA, arcFraction, extendA) && this.acceptFraction(extendB, fractionB, extendB)) {
                    this.recordPointWithLocalFractions(arcFraction, cpA, 0, 1,
                      fractionB, cpB, 0, 1, reversed);
                  }
                }
   *-/
    bezierA.fractionToPoint4d(0.0, this._xyzwA0);
    let f0 = 0.0;
    let f1 = 1.0;
    const intervalTolerance = 1.0e-5;
    const df = 1.0 / strokeCountA;
    for (let i = 1; i <= strokeCountA; i++ , f0 = f1, this._xyzwA0.setFrom(this._xyzwA1)) {
      f1 = i * df;
      bezierA.fractionToPoint4d(f1, this._xyzwA1);
      Point4d.createPlanePointPointZ(this._xyzwA0, this._xyzwA1, this._xyzwPlane);
      bezierB.poleProductsXYZW(univariateBezierB.coffs, this._xyzwPlane.x, this._xyzwPlane.y, this._xyzwPlane.z, this._xyzwPlane.w);
      let errors = 0;
      const roots = univariateBezierB.roots(0.0, true);
      if (roots)
        for (const r of roots) {
          const bezierBFraction = r;
          bezierB.fractionToPoint4d(bezierBFraction, this._xyzwB);
          const segmentAFraction = SmallSystem.lineSegment3dHXYClosestPointUnbounded(this._xyzwA0, this._xyzwA1, this._xyzwB);
          if (segmentAFraction && Geometry.isIn01WithTolerance(segmentAFraction, intervalTolerance)) {
            const bezierAFraction = Geometry.interpolate(f0, segmentAFraction, f1);
            /*- TODO implement newton search
            const xyMatchingFunction = new BezierBezierIntersectionXYRRToRRD(bezierA, bezierB);
            const newtonSearcher = new Newton2dUnboundedWithDerivative(xyMatchingFunction);
            newtonSearcher.setUV(bezierAFraction, bezierBFraction);
            if (newtonSearcher.runIterations()) {
              bezierAFraction = newtonSearcher.getU();
              bezierBFraction = newtonSearcher.getV();
            }
             *-/
              // We have a near intersection at fractions on the two beziers !!!
              // Iterate on the curves for a true intersection ....
              // NEEDS WORK -- just accept . . .
            const bcurveAFraction = bezierA.fractionToParentFraction(bezierAFraction);
            const bcurveBFraction = bezierB.fractionToParentFraction(bezierBFraction);
            const xyzA0 = bezierA.fractionToPoint(bezierAFraction);
            const xyzA1 = bcurveA.fractionToPoint(bcurveAFraction);
            const xyzB0 = bezierB.fractionToPoint(bezierBFraction);
            const xyzB1 = bcurveB.fractionToPoint(bcurveBFraction);
            if (!xyzA0.isAlmostEqualXY(xyzA1))
              errors++;
            if (!xyzB0.isAlmostEqualXY(xyzB1))
              errors++;
            if (errors > 0 && !xyzA0.isAlmostEqual(xyzB0))
              errors++;
            if (errors > 0 && !xyzA1.isAlmostEqual(xyzB1))
              errors++;
            if (this.acceptFraction(false, bcurveAFraction, false) && this.acceptFraction(false, bcurveBFraction, false)) {
              this.recordPointWithLocalFractions(bcurveAFraction, bcurveA, 0, 1,
                bcurveBFraction, bcurveB, 0, 1, reversed);
            }
          }
        }
    }
  }
             */

  // Caller accesses data from two arcs.
  // Selects the best conditioned arc (in xy parts) as "circle after inversion"
  // Solves the arc-arc equations
  private dispatchBSplineCurve3dBSplineCurve3d(
    _bcurveA: BSplineCurve3dBase,
    _bcurveB: BSplineCurve3dBase,
    _reversed: boolean) {
    /*
  const bezierSpanA = bcurveA.collectBezierSpans(true) as BezierCurve3dH[];
  const bezierSpanB = bcurveB.collectBezierSpans(true) as BezierCurve3dH[];
  const numA = bezierSpanA.length;
  const numB = bezierSpanB.length;
  this.transformBeziers(bezierSpanA);
  this.transformBeziers(bezierSpanB);
  const rangeA = this.getRanges(bezierSpanA);
  const rangeB = this.getRanges(bezierSpanB);
  const orderA = bcurveA.order;
  const orderB = bcurveB.order;
  const univariateCoffsA = new UnivariateBezier(orderA);
  const univariateCoffsB = new UnivariateBezier(orderB);
  for (let a = 0; a < numA; a++) {
    for (let b = 0; b < numB; b++) {
      if (rangeA[a].intersectsRangeXY(rangeB[b])) {
        const strokeCountA = bezierSpanA[a].computeStrokeCountForOptions();
        const strokeCountB = bezierSpanB[b].computeStrokeCountForOptions();
        if (strokeCountA < strokeCountB)
          this.dispatchBezierBezierStrokeFirst(bezierSpanA[a], bcurveA, strokeCountA, bezierSpanB[b], bcurveB, strokeCountB, univariateCoffsB, !_reversed);
        else
          this.dispatchBezierBezierStrokeFirst(bezierSpanB[b], bcurveB, strokeCountB, bezierSpanA[a], bcurveA, strokeCountA, univariateCoffsA, _reversed);
      }
    }
  }
               */
  }

  /**
   * Apply the projection transform (if any) to (xyz, w)
   * @param xyz xyz parts of input point.
   * @param w   weight to use for homogeneous effects
   */
  /*
  private projectPoint(xyz: XYAndZ, w: number = 1.0): Point4d {
    if (this._worldToLocalPerspective)
      return this._worldToLocalPerspective.multiplyPoint3d(xyz, w);
    if (this._worldToLocalAffine)
      return this._worldToLocalAffine.multiplyXYZW(xyz.x, xyz.y, xyz.z, w);
    return Point4d.createFromPointAndWeight(xyz, w);
  }
  private mapNPCPlaneToWorld(npcPlane: Point4d, worldPlane: Point4d) {
    // for NPC pointY, Y^ * H = 0 is "on" plane H.  (Hat is transpose)
    // NPC Y is A*X for our transform A and worldPointX.
    // hence (A X)^ * H = 0
    // hence X^ * A^ * H = 0
    // hence K = A^ * H
    if (this._worldToLocalAffine) {
      this._worldToLocalAffine.multiplyTransposeXYZW(npcPlane.x, npcPlane.y, npcPlane.z, npcPlane.w, worldPlane);
    } else if (this._worldToLocalPerspective) {
      this._worldToLocalPerspective.multiplyTransposePoint4d(npcPlane, worldPlane);
    } else {
      npcPlane.clone(worldPlane);
    }
  }
   */
  // Caller accesses data from segment and bsplineCurve
  // Selects the best conditioned arc (in xy parts) as "circle after inversion"
  // Solves the arc-arc equations
  private dispatchSegmentBsplineCurve(
    _cpA: CurvePrimitive,
    _extendA0: boolean,
    _pointA0: Point3d,
    _fractionA0: number,
    _pointA1: Point3d,
    _fractionA1: number,
    _extendA1: boolean,
    _bcurve: BSplineCurve3d,
    _extendB: boolean,
    _reversed: boolean,
  ) {
    /*
    const pointA0H = this.projectPoint(pointA0);
    const pointA1H = this.projectPoint(pointA1);
    const planeCoffs = Point4d.createPlanePointPointZ(pointA0H, pointA1H);
    this.mapNPCPlaneToWorld(planeCoffs, planeCoffs);
      // NOW .. we have a plane in world space.  Intersect it with the bspline:
    const intersections: CurveLocationDetail[] = [];
    bcurve.appendPlaneIntersectionPoints(planeCoffs, intersections);
      // intersections has WORLD points with bspline fractions.   (The bspline fractions are all good 0..1 fractions within the spline.)
      // accept those that are within the segment range.
    for (const detail of intersections) {
      const fractionB = detail.fraction;
      const curvePoint = detail.point;
      const curvePointH = this.projectPoint(curvePoint);
      const lineFraction = SmallSystem.lineSegment3dHXYClosestPointUnbounded(pointA0H, pointA1H, curvePointH);
      if (lineFraction !== undefined && this.acceptFraction(extendA0, lineFraction, extendA1) && this.acceptFraction(extendB, fractionB, extendB)) {
        this.recordPointWithLocalFractions(lineFraction, cpA, fractionA0, fractionA1,
          fractionB, bcurve, 0, 1, reversed);
      }
    }
       */
  }

  private static _workPointAA0 = Point3d.create();
  private static _workPointAA1 = Point3d.create();
  private static _workPointBB0 = Point3d.create();
  private static _workPointBB1 = Point3d.create();
  /** low lever bspline curve -- STUB  .. */
  public dispatchLineStringBSplineCurve(_lsA: LineString3d, _extendA: boolean, _curveB: BSplineCurve3d, _extendB: boolean, _reversed: boolean): any {
    /*
    const numA = lsA.numPoints();
    if (numA > 1) {
      const dfA = 1.0 / (numA - 1);
      let fA0;
      let fA1;
      fA0 = 0.0;
      const pointA0 = CurveCurveIntersectXYZ._workPointA0;
      const pointA1 = CurveCurveIntersectXYZ._workPointA1;
      lsA.pointAt(0, pointA0);
      for (let iA = 1; iA < numA; iA++ , pointA0.setFrom(pointA1), fA0 = fA1) {
        lsA.pointAt(iA, pointA1);
        fA1 = iA * dfA;
        this.dispatchSegmentBsplineCurve(
          lsA, iA === 1 && extendA, pointA0, fA0, pointA1, fA1, (iA + 1) === numA && extendA,
          curveB, extendB, reversed);
      }
    }
    return undefined;
     */
  }

  /** low lever segment intersect linestring .. */
  public computeSegmentLineString(lsA: LineSegment3d, extendA: boolean, lsB: LineString3d, extendB: boolean, reversed: boolean): any {
    const pointA0 = lsA.point0Ref;
    const pointA1 = lsA.point1Ref;
    const pointB0 = CurveCurveIntersectXYZ._workPointBB0;
    const pointB1 = CurveCurveIntersectXYZ._workPointBB1;
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
        this.dispatchSegmentSegment(
          lsA, extendA, pointA0, 0.0, pointA1, 1.0, extendA,
          lsB, ib === 1 && extendB, pointB0, fB0, pointB1, fB1, (ib + 1) === numB && extendB,
          reversed);
      }
    }
    return undefined;
  }

  /** low lever arc intersect linestring .. */
  public computeArcLineString(arcA: Arc3d, extendA: boolean, lsB: LineString3d, extendB: boolean, reversed: boolean): any {
    const pointB0 = CurveCurveIntersectXYZ._workPointBB0;
    const pointB1 = CurveCurveIntersectXYZ._workPointBB1;
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
          lsB, ib === 1 && extendB, pointB0, fB0, pointB1, fB1, (ib + 1) === numB && extendB,
          arcA, extendA, extendA,
          !reversed);
      }
    }
    return undefined;
  }

  /** double dispatch handler for strongly typed segment.. */
  public override handleLineSegment3d(segmentA: LineSegment3d): any {
    if (this._geometryB instanceof LineSegment3d) {
      const segmentB = this._geometryB;
      this.dispatchSegmentSegment(
        segmentA, this._extendA, segmentA.point0Ref, 0.0, segmentA.point1Ref, 1.0, this._extendA,
        segmentB, this._extendB, segmentB.point0Ref, 0.0, segmentB.point1Ref, 1.0, this._extendB,
        false);
    } else if (this._geometryB instanceof LineString3d) {
      this.computeSegmentLineString(segmentA, this._extendA, this._geometryB, this._extendB, false);
    } else if (this._geometryB instanceof Arc3d) {
      this.dispatchSegmentArc(
        segmentA, this._extendA, segmentA.point0Ref, 0.0, segmentA.point1Ref, 1.0, this._extendA,
        this._geometryB, this._extendB, this._extendB, false);
    } else if (this._geometryB instanceof BSplineCurve3d) {
      this.dispatchSegmentBsplineCurve(
        segmentA, this._extendA, segmentA.point0Ref, 0.0, segmentA.point1Ref, 1.0, this._extendA,
        this._geometryB, this._extendB, false);
    }
  }
  /** double dispatch handler for strongly typed linestring .. */
  public override handleLineString3d(lsA: LineString3d): any {
    if (this._geometryB instanceof LineString3d) {
      const lsB = this._geometryB;
      const pointA0 = CurveCurveIntersectXYZ._workPointAA0;
      const pointA1 = CurveCurveIntersectXYZ._workPointAA1;
      const pointB0 = CurveCurveIntersectXYZ._workPointBB0;
      const pointB1 = CurveCurveIntersectXYZ._workPointBB1;
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
        const extendA = this._extendA;
        const extendB = this._extendB;
        lsA.pointAt(0, pointA0);
        for (let ia = 1; ia < numA; ia++, pointA0.setFrom(pointA1), fA0 = fA1) {
          fA1 = ia * dfA;
          fB0 = 0.0;
          lsA.pointAt(ia, pointA1);
          lsB.pointAt(0, pointB0);
          for (let ib = 1; ib < numB; ib++, pointB0.setFrom(pointB1), fB0 = fB1) {
            lsB.pointAt(ib, pointB1);
            fB1 = ib * dfB;
            this.dispatchSegmentSegment(
              lsA, ia === 1 && extendA, pointA0, fA0, pointA1, fA1, (ia + 1) === numA && extendA,
              lsB, ib === 1 && extendB, pointB0, fB0, pointB1, fB1, (ib + 1) === numB && extendB,
              false);
          }
        }
      }
    } else if (this._geometryB instanceof LineSegment3d) {
      this.computeSegmentLineString(this._geometryB, this._extendB, lsA, this._extendA, true);
    } else if (this._geometryB instanceof Arc3d) {
      this.computeArcLineString(this._geometryB, this._extendB, lsA, this._extendA, true);
    } else if (this._geometryB instanceof BSplineCurve3d) {
      this.dispatchLineStringBSplineCurve(lsA, this._extendA, this._geometryB, this._extendB, false);
    }
    return undefined;
  }
  /** double dispatch handler for strongly typed arc .. */
  public override handleArc3d(arc0: Arc3d): any {
    if (this._geometryB instanceof LineSegment3d) {
      this.dispatchSegmentArc(
        this._geometryB, this._extendB, this._geometryB.point0Ref, 0.0, this._geometryB.point1Ref, 1.0, this._extendB,
        arc0, this._extendA, this._extendA, true);
    } else if (this._geometryB instanceof LineString3d) {
      this.computeArcLineString(arc0, this._extendA, this._geometryB, this._extendB, false);
    } else if (this._geometryB instanceof Arc3d) {
      this.dispatchArcArc(arc0, this._extendA, this._geometryB, this._extendB, false);
    } else if (this._geometryB instanceof BSplineCurve3d) {
      this.dispatchArcBsplineCurve3d(arc0, this._extendA, this._geometryB, this._extendB, false);
    }
    return undefined;
  }
  /** double dispatch handler for strongly typed bspline curve.. */
  public override handleBSplineCurve3d(curve: BSplineCurve3d): any {
    if (this._geometryB instanceof LineSegment3d) {
      this.dispatchSegmentBsplineCurve(
        this._geometryB, this._extendB, this._geometryB.point0Ref, 0.0, this._geometryB.point1Ref, 1.0, this._extendB,
        curve, this._extendA, true);
    } else if (this._geometryB instanceof LineString3d) {
      this.dispatchLineStringBSplineCurve(this._geometryB, this._extendB, curve, this._extendA, true);
    } else if (this._geometryB instanceof Arc3d) {
      this.dispatchArcBsplineCurve3d(this._geometryB, this._extendB, curve, this._extendA, true);
    } else if (this._geometryB instanceof BSplineCurve3dBase) {
      this.dispatchBSplineCurve3dBSplineCurve3d(curve, this._geometryB, false);
    }
    return undefined;
  }
  /** double dispatch handler for strongly typed homogeneous bspline curve. */
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
