/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Bezier1dNd } from "../../bspline/Bezier1dNd";
import { BezierCurve3d } from "../../bspline/BezierCurve3d";
import { BezierCurve3dH } from "../../bspline/BezierCurve3dH";
import { BSpline1dNd } from "../../bspline/BSpline1dNd";
import { BSplineCurve3d } from "../../bspline/BSplineCurve";
import { BSplineWrapMode, KnotVector } from "../../bspline/KnotVector";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/Plane3dByOriginAndUnitNormal";
import { Point2d } from "../../geometry3d/Point2dVector2d";
import { Point3d } from "../../geometry3d/Point3dVector3d";
import { Point4d } from "../../geometry4d/Point4d";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";

function exercise1dNdBase(ck: Checker, curve: Bezier1dNd) {
  ck.testLE(1, curve.order, "Bezier1dNd has nontrivial order");
  const polygon1 = curve.clonePolygon();
  const polygon2 = curve.clonePolygon(polygon1);
  // confirm the first copy was reused ...
  ck.testTrue(polygon1 === polygon2);

  const pointA = curve.getPolygonPoint(0);
  const pointB = curve.getPolygonPoint(1, pointA);
  ck.testTrue(pointA === pointB, "reuse buffer");
}
/* eslint-disable no-console */
describe("BsplineCurve", () => {

  it("PoleQueries", () => {
    const ck = new Checker();
    const allPoints: Point3d[] = [
      Point3d.create(0, 0, 0),
      Point3d.create(0, 10, 0),
      Point3d.create(10, 10, 0),
      Point3d.create(10, 0, 0),
      Point3d.create(20, 0, 0),
      Point3d.create(20, 10, 0)];

    ck.testUndefined(BezierCurve3d.create([]));
    const bezierCurves = [BezierCurve3d.create(allPoints)!, BezierCurve3dH.create(allPoints)!];
    ck.testFalse(bezierCurves[0].isAlmostEqual(bezierCurves[1]));
    ck.testFalse(bezierCurves[1].isAlmostEqual(bezierCurves[0]));
    const plane0 = Plane3dByOriginAndUnitNormal.createXYPlane();
    const plane1 = Plane3dByOriginAndUnitNormal.createZXPlane();
    for (const bezier of bezierCurves) {
      ck.testUndefined(bezier.getPolePoint3d(100));
      ck.testUndefined(bezier.getPolePoint4d(100));
      ck.testTrue(bezier.isInPlane(plane0));
      ck.testFalse(bezier.isInPlane(plane1));
      for (let i = 0; i < allPoints.length; i++) {
        const pole3d = bezier.getPolePoint3d(i);
        const pole4d = bezier.getPolePoint4d(i);
        const q = allPoints[i];
        if (ck.testPointer(pole3d)) {
          ck.testPoint3d(pole3d, q);
        }
        if (ck.testPointer(pole4d)) {
          ck.testPoint4d(pole4d, Point4d.create(q.x, q.y, q.z, 1.0));
        }
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("Bezier1dNd", () => {
    const ck = new Checker();
    ck.testUndefined(Bezier1dNd.create([]));
    const base2 = Bezier1dNd.create([Point2d.create(1, 2), Point2d.create(2, 2), Point2d.create(3, 1)]);
    const base25 = Bezier1dNd.create([Point2d.create(1, 2), Point2d.create(2, 2), Point2d.create(3, 1), Point2d.create(4, 0), Point2d.create(5, 1)]);
    ck.testFalse(base2!.isAlmostEqual(base25));
    ck.testFalse(base2!.isAlmostEqual(undefined));
    ck.testPointer(base2);
    exercise1dNdBase(ck, base2!);
    const base3 = Bezier1dNd.create([Point3d.create(1, 2), Point3d.create(2, 2), Point3d.create(3, 1)]);
    ck.testPointer(base3);
    exercise1dNdBase(ck, base3!);

    const base4 = Bezier1dNd.create([Point4d.create(1, 2, 0, 1), Point4d.create(2, 20, 1.5), Point4d.create(3, 1, 1, 0.9)]);
    ck.testPointer(base4);
    exercise1dNdBase(ck, base4!);
    ck.testFalse(base2!.isAlmostEqual(base3));
    ck.testFalse(base2!.isAlmostEqual(base4));

    const knotDegree = 5;
    const uniformKnots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const knotVector = KnotVector.create(uniformKnots, knotDegree, false);
    ck.testFalse(base4!.saturateInPlace(knotVector, 100));
    const knotVector1 = knotVector.clone();

    ck.testFalse(knotVector1.isIndexOfRealSpan(-1));
    ck.testFalse(knotVector1.isIndexOfRealSpan(knotVector1.rightKnotIndex));

    ck.testTrue(knotVector.isAlmostEqual(knotVector1));
    knotVector.setKnots([1, 2, 3, 4, 5], false);
    ck.testFalse(knotVector.isAlmostEqual(knotVector1));
    const knotVectorB = KnotVector.create([1, 1, 2, 3, 4, 5], 2); // replication at left but not right
    const knotVectorC = KnotVector.create([0, 1, 2, 3, 4, 4], 2); // replication at right but not left
    ck.testFalse(knotVectorB.testClosable(BSplineWrapMode.OpenByRemovingKnots));
    ck.testFalse(knotVectorC.testClosable(BSplineWrapMode.OpenByRemovingKnots));
    ck.testFalse(knotVectorC.testClosable(10 as BSplineWrapMode));
    ck.testFalse(knotVectorC.isAlmostEqual(knotVector1));
    ck.testExactNumber(knotVectorC.grevilleKnot(-1), knotVectorC.leftKnot);
    ck.testExactNumber(knotVectorC.grevilleKnot(20), knotVectorC.rightKnot);

    const zeroDegreeKnots = KnotVector.create([1, 2, 3], 0);
    const basis = new Float64Array(5);
    const basis1 = new Float64Array(3);
    basis[0] = 10.0;
    basis1[0] = 11.0;
    zeroDegreeKnots.evaluateBasisFunctions(0, 0, basis);   // nothing happens !
    ck.testExactNumber(1.0, basis[0]);
    zeroDegreeKnots.evaluateBasisFunctions1(0, 0, basis, basis1);   // nothing happens !
    ck.testExactNumber(1.0, basis[0]);
    ck.testExactNumber(0.0, basis1[0]);
    ck.testFalse(knotVector1.isIndexOfRealSpan(-1));
    const base2A = Bezier1dNd.create([Point2d.create(1, 2), Point2d.create(2, 2), Point2d.create(3, 1)])!;
    const base2B = Bezier1dNd.create([Point2d.create(1, 2), Point2d.create(2, 2), Point2d.create(3, 1)])!;
    ck.testTrue(base2A.subdivideToIntervalInPlace(0.25, 0.5));
    ck.testTrue(base2B.subdivideToIntervalInPlace(0.5, 0.25));
    for (const f of [0, 0.1, 0.4, 0.3]) {
      const valueA = base2A.evaluate(f);
      const valueB = base2B.evaluate(1 - f);
      ck.testFalse(base2A.isAlmostEqual(base2B));
      for (let i = 0; i < 2; i++) {
        ck.testCoordinate(valueA[i], valueB[i]);
      }
    }
    ck.testFalse(base2A.subdivideToIntervalInPlace(0.25, 0.25));
    ck.testFalse(base2A.subdivideInPlaceKeepLeft(0.0));
    ck.testFalse(base2A.subdivideInPlaceKeepRight(1.0));
    expect(ck.getNumErrors()).equals(0);
  });

  it("SaturateBezier", () => {
    const ck = new Checker();
    const geometry: GeometryQuery[] = [];
    const allPoints: Point3d[] = [
      Point3d.create(0, 0, 0),
      Point3d.create(0, 10, 0),
      Point3d.create(10, 10, 0),
      Point3d.create(10, 0, 0),
      Point3d.create(20, 0, 0),
      Point3d.create(20, 10, 0)];
    const livePoints = [];
    const uniformKnots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const yShift = 20.0;
    let currYShift = 0;
    const xShift1 = 50.0;
    const xShift2 = 100.0;
    for (const p of allPoints) {
      livePoints.push(p);
      if (livePoints.length > 2) {
        const bezier = BezierCurve3d.create(livePoints)!;
        const bezier1 = bezier.clone();
        const knotVector = KnotVector.create(uniformKnots, livePoints.length - 1, false);
        geometry.push(bezier.copyPointsAsLineString());
        geometry[geometry.length - 1].tryTranslateInPlace(0, currYShift, 0);
        bezier.saturateInPlace(knotVector, 0);
        bezier1.saturateInPlace(knotVector, 1);
        // Because the knot vector is uniform, the two saturations are identical.
        ck.testTrue(bezier.isAlmostEqual(bezier1));
        geometry.push(bezier.copyPointsAsLineString());
        geometry[geometry.length - 1].tryTranslateInPlace(0, currYShift, 0);
        const degree = livePoints.length - 1;
        const leftSaturated = [];
        const rightSaturated = [];
        for (let i = 0; i < degree; i++) leftSaturated.push(0);
        for (let i = 0; i < degree; i++) leftSaturated.push(i + 1);

        for (let i = 0; i < degree; i++) rightSaturated.push(i);
        const right = rightSaturated[rightSaturated.length - 1] + 1;
        for (let i = 0; i < degree; i++) rightSaturated.push(right);

        const bezier2 = BezierCurve3d.create(livePoints)!;
        const bezier3 = BezierCurve3d.create(livePoints)!;
        bezier2.saturateInPlace(KnotVector.create(leftSaturated, degree, false), 0);
        bezier3.saturateInPlace(KnotVector.create(rightSaturated, degree, false), 0);
        geometry.push(bezier2.copyPointsAsLineString());
        geometry[geometry.length - 1].tryTranslateInPlace(xShift1, currYShift, 0);
        geometry.push(bezier3.copyPointsAsLineString());
        geometry[geometry.length - 1].tryTranslateInPlace(xShift2, currYShift, 0);

        currYShift += yShift;
      }
    }
    GeometryCoreTestIO.saveGeometry(geometry, "BezierCurve3d", "SingleBezierSaturation");
    expect(ck.getNumErrors()).equals(0);
  });

  it("BsplineGrid", () => {
    const ck = new Checker();
    const geometry: GeometryQuery[] = [];
    const a = 3.0;
    const controlPoints: Point3d[] = [
      Point3d.create(0, 0, 0),
      Point3d.create(a, 10, 0),
      Point3d.create(10, 10, 0),
      Point3d.create(10 + a, 0, 0),
      Point3d.create(20, 0, 0),
      Point3d.create(20 + a, 10, 0),
      Point3d.create(10, 20, 0)];
    const dx = 100.0;
    let x0 = 0.0;
    let y0 = 0.0;
    const f0 = 0.05;
    const f1 = 1.0 - f0;
    const dy = 30.0;
    const tickLength = 0.5;
    const setbackDistance = 0.5;
    GeometryCoreTestIO.captureGeometry(geometry, LineString3d.create(controlPoints), x0, y0);
    for (const order of [3, 2, 3, 4, 5]) {
      x0 += dx;
      y0 = 0.0;
      const y1 = y0 + 2 * dy;
      const y2 = y0 + 1 * dy;
      const y3 = y0 + 3 * dy;
      const y4 = y3;
      // Output the full bspline with tic marks at the knot breaks
      const bcurve = BSplineCurve3d.createUniformKnots(controlPoints, order)!;
      GeometryCoreTestIO.captureGeometry(geometry, bcurve.clone(), x0, y0);
      const knots = bcurve.copyKnots(false);
      if (order > 2) {
        for (const u of knots) {
          if (u > 0.0 && u < 1.0) {
            const curvePoint = bcurve.knotToPointAndDerivative(u);                     // evaluate the knot point
            const perp = curvePoint.direction.rotate90CCWXY();
            perp.normalizeInPlace();
            GeometryCoreTestIO.captureGeometry(geometry, LineSegment3d.create(curvePoint.origin, curvePoint.origin.plusScaled(perp, tickLength)), x0, y0);
          }
        }
      }
      const allBeziers = bcurve.collectBezierSpans(false);
      // output each bezier, clipped off near the end points to emphasize that they are separate.
      let bezierIndex = 0;
      for (const bezier of allBeziers) {
        const bezier1 = bezier.clonePartialCurve(f0, f1)!;
        GeometryCoreTestIO.captureGeometry(geometry, bezier1, x0, y1);
        const detail0 = bezier.moveSignedDistanceFromFraction(0.0, setbackDistance, false);
        const detail1 = bezier.moveSignedDistanceFromFraction(1.0, -setbackDistance, false);
        const bezier2 = bezier.clonePartialCurve(detail0.fraction, detail1.fraction)!;
        GeometryCoreTestIO.captureGeometry(geometry, bezier2, x0, y2);
        if (bezierIndex === 0)
          GeometryCoreTestIO.createAndCaptureXYCircle(geometry, bezier.fractionToPoint(0.0), setbackDistance, x0, y2);
        GeometryCoreTestIO.createAndCaptureXYCircle(geometry, bezier.fractionToPoint(1.0), setbackDistance, x0, y2);
        // make sure partialClones overlap original  . . .
        const g0 = 0.2342345;
        const g1 = 0.82342367;
        GeometryCoreTestIO.captureGeometry(geometry, bezier.clone(), x0, y3);

        const bezier4 = bezier.clonePartialCurve(g0, 1.0)!;
        const bezier5 = bezier4.clonePartialCurve(0.0, (g1 - g0) / (1 - g0))!;  // Remark:  This uses the opposite left/right order of what happen in clone partial.  (Same result expected)
        const bezier6 = bezier.clonePartialCurve(g0, g1)!;
        ck.testTrue(bezier5.isAlmostEqual(bezier6), "bezier subdivision");  // wow, math is right.
        GeometryCoreTestIO.captureGeometry(geometry, bezier4, x0, y4);
        GeometryCoreTestIO.captureGeometry(geometry, bezier5, x0, y4);
        GeometryCoreTestIO.captureGeometry(geometry, bezier6, x0, y4);
        bezierIndex++;
      }
    }

    GeometryCoreTestIO.saveGeometry(geometry, "BezierCurve3d", "BsplineGrid");
    expect(ck.getNumErrors()).equals(0);
  });

  it("Bspline1dNd", () => {
    const ck = new Checker();
    const bspline = BSpline1dNd.create(4, 3, 2, KnotVector.create([1, 2, 3, 4], 1));
    if (ck.testPointer(bspline)) {
      const point0 = bspline.getPoint3dPole(0)!;
      ck.testExactNumber(0, point0.magnitude());
      const f = new Float64Array(5);
      // these exercise obscure code .. no test for values ...
      bspline.evaluateBasisFunctionsInSpan(-1, 0.5, f);
      bspline.evaluateBasisFunctionsInSpan(29, 0.5, f);
      ck.testFalse(bspline.testCloseablePolygon());
    }
    expect(ck.getNumErrors()).equals(0);
  });
});
