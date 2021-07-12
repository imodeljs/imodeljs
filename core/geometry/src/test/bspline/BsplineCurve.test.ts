/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { BezierCurve3d } from "../../bspline/BezierCurve3d";
import { BezierCurveBase } from "../../bspline/BezierCurveBase";
import { BSplineCurve3d } from "../../bspline/BSplineCurve";
import { BSplineCurve3dH } from "../../bspline/BSplineCurve3dH";
import { BSplineWrapMode, KnotVector } from "../../bspline/KnotVector";
// import { prettyPrint } from "./testFunctions";
import { CurveLocationDetail } from "../../curve/CurveLocationDetail";
import { CurvePrimitive } from "../../curve/CurvePrimitive";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Path } from "../../curve/Path";
import { StrokeOptions } from "../../curve/StrokeOptions";
import { Geometry } from "../../Geometry";
import { Angle } from "../../geometry3d/Angle";
import { AngleSweep } from "../../geometry3d/AngleSweep";
import { GrowableXYZArray } from "../../geometry3d/GrowableXYZArray";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/Plane3dByOriginAndUnitNormal";
import { Point3d } from "../../geometry3d/Point3dVector3d";
import { Range3d } from "../../geometry3d/Range";
import { Transform } from "../../geometry3d/Transform";
import { Point4d } from "../../geometry4d/Point4d";
import { Sample } from "../../serialization/GeometrySamples";
import { IModelJson } from "../../serialization/IModelJsonSchema";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";
import { prettyPrint } from "../testFunctions";

/** return knots [0,0,0, step, 2*step, ... N,N,N]
 * where there are:
 *  * (order-1) leading and trailing clamp values.
 *  * internal knots with given step.
 */
function buildClampedSteppedKnots(numPoints: number, order: number, step: number): number[] {
  const knots = [];
  const degree = order - 1;
  // left clamp always at 0 . . .
  for (let i = 0; i < degree; i++) knots.push(0);
  let b = step;
  // true internal knots
  for (let i = 1; i + order <= numPoints; i++) {
    b = i * step;
    knots.push(b);
  }
  // right clamp
  b = (numPoints - order + 1) * step;
  for (let i = 0; i < degree; i++) knots.push(b);
  return knots;
}
/** return knots [-K*step, -(K-1)*step, .. 0, step,  ....N, N+step, N+2*step]
 * where there are:
 *  * (order-1) leading and trailing values, uniformly stepped
 *  * internal knots with given step.
 *  * trailing values wrap with period N
 */
function buildWrappableSteppedKnots(numInterval: number, order: number, step: number): number[] {
  const knots = [];
  const knot0 = - step * (order - 2);
  for (let i = 0; i < numInterval + order - 2; i++)
    knots.push(knot0 + i * step);
  return knots;
}

function translateAndPush(allGeometry: GeometryQuery[], g: GeometryQuery | undefined, dx: number, dy: number) {
  if (g) {
    g.tryTranslateInPlace(dx, dy, 0);
    allGeometry.push(g);
  }
}
function showPlane(allGeometry: GeometryQuery[], plane: Plane3dByOriginAndUnitNormal, a: number, dx: number, dy: number) {
  const origin = plane.getOriginRef();
  const normal = plane.getNormalRef();
  const frame = Transform.createOriginAndMatrix(origin,
    Matrix3d.createRigidViewAxesZTowardsEye(normal.x, normal.y, normal.z));
  const g = LineString3d.create(
    frame.multiplyXYZ(-0.5 * a, 0, 0),
    frame.multiplyXYZ(a, 0, 0),
    frame.multiplyXYZ(a, a, 0),
    frame.multiplyXYZ(0, a, 0),
    origin,
    frame.multiplyXYZ(0, 0, 2 * a));
  if (g) {
    g.tryTranslateInPlace(dx, dy, 0);
    allGeometry.push(g);
  }
}

function showPoint(allGeometry: GeometryQuery[], point: Point3d, a: number, dx: number, dy: number) {
  const g = LineString3d.create(
    point,
    Point3d.create(point.x - a, point.y, point.z),
    Point3d.create(point.x + a, point.y, point.z),
    Point3d.create(point.x, point.y + a, point.z),
    Point3d.create(point.x, point.y, point.z));
  if (g) {
    g.tryTranslateInPlace(dx, dy, 0);
    allGeometry.push(g);
  }
}

function ellipsePoints(a: number, b: number, sweep: AngleSweep, numStep: number): Point3d[] {
  const points = [];
  for (let f = 0.0; f <= 1.00001; f += 1.0 / numStep) {
    const radians = sweep.fractionToRadians(f);
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    points.push(Point3d.create(a * c, b * s, 0.0));
  }
  return points;
}
/** Check if the linestring edgeLengths and angle meet stroke options demands
 * @param edgeLengthFactor factor to apply to edgeLength conditions
 * @param angleFactor factor to apply to angle conditions
 */
function checkStrokeProperties(ck: Checker, curve: CurvePrimitive, linestring: LineString3d, options: StrokeOptions,
  angleFactor: number = 1.1, edgeLengthFactor: number = 1.1): boolean {
  const numPoints = linestring.numPoints();
  let ok = true;
  if (ck.testLE(3, numPoints, "Expect 3 or more strokes")) {
    let maxRadians = 0;
    const vector0 = linestring.vectorBetween(0, 1)!;
    let vector1;
    let maxEdgeLength = vector0.magnitude();
    for (let i = 1; i + 1 < numPoints; i++) {
      vector1 = linestring.vectorBetween(i, i + 1)!;
      maxEdgeLength = Geometry.maxXY(maxEdgeLength, vector1.magnitude());
      maxRadians = Geometry.maxXY(maxRadians, vector0.angleTo(vector1).radians);
      vector0.setFromVector3d(vector1);
    }
    if (options.maxEdgeLength)
      if (!ck.testLE(maxRadians, edgeLengthFactor * options.maxEdgeLength, "strokeProperties edge length", curve))
        ok = false;
    if (options.angleTol)
      if (!ck.testLE(maxRadians, angleFactor * options.angleTol.radians, "stroke properties angle", curve))
        ok = false;
  }
  return ok;
}
/* eslint-disable no-console */
describe("BsplineCurve", () => {

  it("HelloWorld", () => {
    const ck = new Checker();
    for (const rational of [false, true]) {
      for (const order of [2, 3, 4, 5]) {
        if (Checker.noisy.bsplineEvaluation) console.log("\n\n ************* order ", order);
        // const a = 1.0;
        const b = 2.0;
        const points = [];
        const degree = order - 1;
        const numPoles = 5;
        const knots = KnotVector.createUniformClamped(numPoles, degree, 0.0, 1.0);
        // x should exactly match the knot value (even for high order)
        for (let i = 0; i < numPoles; i++) {
          const x = knots.grevilleKnot(i);
          points.push(Point3d.create(x, b, 0));
        }
        let curve: BSplineCurve3d | BSplineCurve3dH;
        if (rational)
          curve = BSplineCurve3dH.createUniformKnots(points, order) as BSplineCurve3dH;
        else
          curve = BSplineCurve3d.createUniformKnots(points, order) as BSplineCurve3d;
        const arcLength = curve.curveLength();
        ck.testLE(arcLength, curve.quickLength() + Geometry.smallMetricDistance, "order", order);
        if (Checker.noisy.bsplineEvaluation) {
          console.log("BsplineCurve", curve);
          console.log({ numPoles: curve.numPoles, numSpan: curve.numSpan });
          console.log("length", arcLength);
        }
        for (let span = 0; span < curve.numSpan; span++) {
          const p0 = curve.evaluatePointInSpan(span, 0.0);
          const p1 = curve.evaluatePointInSpan(span, 0.5);
          const p2 = curve.evaluatePointInSpan(span, 1.0);

          for (const spanFraction of [0.2, 0.3, 0.9]) {
            const knot = curve.spanFractionToKnot(span, spanFraction);
            const spanPoint = curve.evaluatePointInSpan(span, spanFraction);
            const spanTangent = curve.evaluatePointAndDerivativeInSpan(span, spanFraction);
            const spanTangent2 = curve.knotToPointAnd2Derivatives(knot);
            ck.testPoint3d(spanPoint, spanTangent2.origin, "evaluate == 2 derivative origin");
            ck.testVector3d(spanTangent.direction, spanTangent2.vectorU, "evaluate == 2 derivative origin");
            ck.testPoint3d(spanPoint, spanTangent.origin, "point and tangent evaluate");
            const knotPoint = curve.knotToPoint(knot);
            ck.testCoordinate(knot, knotPoint.x, "x == knot");
            ck.testPoint3d(spanPoint, knotPoint, "spanPoint, knotPoint", order, span, spanFraction);

          }
          ck.testCoordinate(b, p1.y, "constant bspline y");
          if (Checker.noisy.bsplineEvaluation) console.log("span", span, p0, p1, p2);
          if (span + 1 < curve.numSpan) {
            const q2 = curve.evaluatePointInSpan(span + 1, 0.0);
            ck.testPoint3d(p2, q2, "span match");
          }
        }
      }
    }
    ck.checkpoint("End BsplineCurve.HelloWorld");
    expect(ck.getNumErrors()).equals(0);
  });

  it("strokes", () => {
    const ck = new Checker();
    const bcurves = Sample.createMixedBsplineCurves();
    const defaultOption = StrokeOptions.createForCurves();
    const angleOptions = StrokeOptions.createForCurves();
    angleOptions.angleTol = Angle.createDegrees(5.0);
    const edgeLengthOptions = StrokeOptions.createForCurves();
    edgeLengthOptions.maxEdgeLength = 0.5;
    const allOptions = [defaultOption, angleOptions, edgeLengthOptions];
    const allGeometry: GeometryQuery[] = [];
    let xShift = 0.0;
    const dxShift = 10.0;
    const dyShift = 10.0;
    for (const curve of bcurves) {
      translateAndPush(allGeometry, curve.clone(), xShift, 0.0);
      let yShift = dyShift;
      for (const options of allOptions) {
        const linestring = LineString3d.create();
        curve.emitStrokes(linestring, options);
        const angleFactor = curve.order <= 2 ? 1000 : 1.6;  // suppress angle test on linear case.  Be fluffy on others.
        translateAndPush(allGeometry, linestring, xShift, yShift);
        if (!checkStrokeProperties(ck, curve, linestring, options, angleFactor, 1.1)) {
          linestring.clear();
          curve.emitStrokes(linestring, options);
        }
        yShift += dyShift;
      }
      xShift += dxShift;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "BSplineCurve", "strokes");

    ck.checkpoint("End BsplineCurve.strokes");
    expect(ck.getNumErrors()).equals(0);
  });

  it("KnotVector", () => {
    const ck = new Checker();
    const numPoles = 10;
    const degree = 3;
    const a0 = 1;
    const a1 = 22;
    const knots = KnotVector.createUniformClamped(numPoles, degree, a0, a1);
    const basisValues = knots.createBasisArray();
    ck.testExactNumber(basisValues.length, degree + 1);
    ck.testExactNumber(knots.knotLength01, a1 - a0, "knot range");
    for (let spanIndex = 0; spanIndex < knots.numSpans; spanIndex++) {
      const leftKnotFromSpan = knots.spanFractionToKnot(spanIndex, 0);
      const rightKnotFromSpan = knots.spanFractionToKnot(spanIndex, 1);
      const leftKnotFromArray = knots.knots[spanIndex + knots.leftKnotIndex];
      ck.testCoordinate(leftKnotFromArray, leftKnotFromSpan, "left of span reproduces knots");
      ck.testCoordinate(knots.spanIndexToSpanLength(spanIndex), rightKnotFromSpan - leftKnotFromSpan, "span length");

    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("DoubleKnots", () => {
    // stroke a bcurve with double knots .. bug was that the double knot intervals generated 0 or undefined stroke coordinates.
    // Be sure the curve is all in one quadrant so 00 is NOT in the stroke range.
    const ck = new Checker();
    const bcurve = BSplineCurve3d.create(
      [Point3d.create(1, 0),
      Point3d.create(2, 0, 0),
      Point3d.create(2, 1, 0),
      Point3d.create(3, 1, 0),
      Point3d.create(4, 0, 0),
      Point3d.create(5, 1, 0)],
      [0, 0, 0.5, 0.5, 0.75, 1, 1], 3)!;
    const path = Path.create(bcurve);
    const strokes = path.getPackedStrokes()!;
    // console.log(prettyPrint(strokes));
    const strokeRange = Range3d.create();
    strokes.extendRange(strokeRange);
    const curveRange = bcurve.range();
    curveRange.expandInPlace(0.00001);
    ck.testTrue(curveRange.containsRange(strokeRange));
    ck.testFalse(strokeRange.containsXYZ(0, 0, 0));
    expect(ck.getNumErrors()).equals(0);
  });

  it("Circles", () => {
    // stroke a circular bcurve
    const ck = new Checker();
    const bcurves = Sample.createBspline3dHArcs();
    const options = StrokeOptions.createForCurves();
    options.chordTol = 0.02;
    const allGeometry: GeometryQuery[] = [];
    let dx = 0.0;
    for (const bcurve of bcurves) {
      const ls = LineString3d.create();
      bcurve.emitStrokes(ls, options);
      GeometryCoreTestIO.captureGeometry(allGeometry, bcurve, dx, 0, 0);
      GeometryCoreTestIO.captureGeometry(allGeometry, ls, dx, 0, 0);
      dx += 5.0;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "BsplineCurve", "BCurveCircularArc");
    expect(ck.getNumErrors()).equals(0);
  });

  it("BSplineCircleConversion", () => {
    // stroke a circular bcurve
    const ck = new Checker();
    const microstationStyleArc = {
      bcurve: {
        closed: true,
        knots: [-0.33333333333333337, 0.0, 0.0, 0.0, 0.33333333333333331, 0.33333333333333331, 0.66666666666666663, 0.66666666666666663,
          1.0,
          1.0,
          1.0,
          1.3333333333333333],
        order: 3,
        points: [

          [1.0, 0.0, 0.0, 1.0],
          [0.50000000000000011, 0.86602540378443860, 0.0, 0.50000000000000011],
          [-0.49999999999999978, 0.86602540378443871, 0.0, 1.0], [-0.99999999999999989, 7.2674717409587315e-17, 0.0,
            0.50000000000000011],

          [-0.50000000000000044, -0.86602540378443849, 0.0, 1.0],
          [0.49999999999999922, -0.86602540378443904, 0.0, 0.50000000000000011], [1.0,
            -2.4492935982947064e-16, 0.0,
            1.0]],
      },
    };
    const g1 = IModelJson.Reader.parse(microstationStyleArc);

    GeometryCoreTestIO.saveGeometry([g1], "BsplineCurve", "CircleIMJson");
    expect(ck.getNumErrors()).equals(0);
  });

  it("SaturateBspline", () => {
    const ck = new Checker();
    const xStep = 120;
    let xShift = 0;
    const yShift = 60.0;
    const allGeometry: GeometryQuery[] = [];
    for (const factor of [0.5, 1, 3]) {
      const transform = Transform.createScaleAboutPoint(Point3d.create(0, 0, 0), factor);
      for (const allPoints of [
        [Point3d.create(0, 0, 0),
        Point3d.create(0, 10, 0),
        Point3d.create(10, 10, 0),
        Point3d.create(10, 0, 0),
        Point3d.create(20, 0, 0),
        Point3d.create(20, 10, 0),
        Point3d.create(25, 5, 0),
        Point3d.create(30, 5, 0),
        Point3d.create(35, 10, 0)],
        ellipsePoints(35, 20, AngleSweep.createStartEndDegrees(-45, 110), 9)]) {
        transform.multiplyPoint3dArrayInPlace(allPoints);
        for (let degree = 1; degree < 6; degree++) {
          const bcurve = BSplineCurve3d.createUniformKnots(allPoints, degree + 1)!;
          let cp: BezierCurveBase | undefined;
          for (let spanIndex = 0; ; spanIndex++) {
            cp = bcurve.getSaturatedBezierSpan3d(spanIndex, cp);
            if (!cp) break;
            const bezier = cp as BezierCurve3d;
            const poles = bezier.copyPointsAsLineString();
            translateAndPush(allGeometry, poles, xShift, yShift);
            let shiftCount = 2;
            for (const degrees of [24, 12, 6]) {
              const options = StrokeOptions.createForCurves();
              options.angleTol = Angle.createDegrees(degrees);
              const strokes = LineString3d.create();
              bezier.emitStrokes(strokes, options);
              translateAndPush(allGeometry, strokes, xShift, (shiftCount++) * yShift);
            }
            translateAndPush(allGeometry, bezier.clone(), xShift, (shiftCount++) * yShift);
          }
          translateAndPush(allGeometry, bcurve, xShift, 0);
          xShift += xStep;
        }
      }
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "BezierCurve3d", "BsplineSaturation");
    expect(ck.getNumErrors()).equals(0);
  });
  it("IntersectPlane", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const bcurves = Sample.createMixedBsplineCurves();
    const markerSize = 0.1;
    const planeSize = 0.5;
    let xShift = 0.0;
    const yShift = 0.0;
    for (const curve of bcurves) {
      translateAndPush(allGeometry, curve.clone(), xShift, yShift);
      for (const fraction of [0.2, 0.5, 0.73]) {
        const tangentRay = curve.fractionToPointAndDerivative(fraction);
        // Alter the ray z so it is not perpendicular ..
        // tangentRay.direction.z += 0.02;
        const intersections: CurveLocationDetail[] = [];
        const plane = Plane3dByOriginAndUnitNormal.create(tangentRay.origin, tangentRay.direction)!;  // This normalizes.
        curve.appendPlaneIntersectionPoints(plane, intersections);
        if (intersections.length > 1)
          curve.appendPlaneIntersectionPoints(plane, intersections);
        showPlane(allGeometry, plane, planeSize, xShift, yShift);
        for (const detail of intersections) {
          if (detail.point.isAlmostEqual(tangentRay.origin))
            showPoint(allGeometry, detail.point, markerSize, xShift, yShift);
          else
            translateAndPush(allGeometry, LineSegment3d.create(tangentRay.origin, detail.point), xShift, yShift);
        }
      }
      xShift += 10.0;
    }

    GeometryCoreTestIO.saveGeometry(allGeometry, "BSplineCurve", "IntersectPlane");
    expect(ck.getNumErrors()).equals(0);
  });

  it("BsplineCurve3dHCoverage", () => {
    const ck = new Checker();
    const poleBuffer = new Float64Array([
      0, 0, 0, 1,
      1, 0, 0, 1,
      1, 1, 0, 2,    // weights vary !!
      0, 1, 1, 1,    // non planar
      0, 2, 2, 1]);
    const myKnots = [0, 0, 0, 1, 2, 2, 2];
    const bcurve = BSplineCurve3dH.create(poleBuffer, myKnots, 4)!;
    const bcurveB = BSplineCurve3dH.createUniformKnots(poleBuffer, 4);

    ck.testFalse(bcurve.isInPlane(Plane3dByOriginAndUnitNormal.createXYPlane()));

    ck.testUndefined(BSplineCurve3dH.createUniformKnots(poleBuffer, 10));
    ck.testUndefined(BSplineCurve3dH.create(poleBuffer, myKnots, 10));
    ck.testPointer(bcurveB);
    const poleBufferA = bcurve.copyPointsFloat64Array();
    const poleArray = bcurve.copyPoints();
    if (ck.testExactNumber(poleArray.length * 4, poleBufferA.length)) {
      for (let i = 0, k = 0; i < poleArray.length; i++) {
        ck.testExactNumber(poleArray[i][0], poleBufferA[k++]);
        ck.testExactNumber(poleArray[i][1], poleBufferA[k++]);
        ck.testExactNumber(poleArray[i][2], poleBufferA[k++]);
        ck.testExactNumber(poleArray[i][3], poleBufferA[k++]);
      }
    }

    let n = 0;
    const myPole = Point3d.create();
    const myPoleH = Point4d.create();
    ck.testUndefined(bcurve.getPolePoint4d(100));
    for (; bcurve.getPolePoint3d(n, myPole) !== undefined; n++) {
      const q = bcurve.getPolePoint4d(n, myPoleH);
      if (ck.testPointer(q)) {
        const w = myPoleH.w;
        ck.testTrue(myPoleH.isAlmostEqualXYZW(myPole.x * w, myPole.y * w, myPole.z * w, w));
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("BsplineCurve3dCoverage", () => {
    const ck = new Checker();
    const poleBuffer = new Float64Array([
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 1,
      0, 2, 2]);
    const myKnots = [0, 0, 0, 1, 2, 2, 2];
    const bcurve = BSplineCurve3d.create(poleBuffer, myKnots, 4)!;
    const bcurveB = BSplineCurve3d.createUniformKnots(poleBuffer, 4);
    ck.testFalse(bcurve.isInPlane(Plane3dByOriginAndUnitNormal.createXYPlane()));
    ck.testUndefined(BSplineCurve3d.createUniformKnots(poleBuffer, 10));
    ck.testUndefined(BSplineCurve3d.create(poleBuffer, myKnots, 10));
    ck.testPointer(bcurveB);
    const poleBufferA = bcurve.copyPointsFloat64Array();
    const poleArray = bcurve.copyPoints();
    if (ck.testExactNumber(poleArray.length * 3, poleBufferA.length)) {
      for (let i = 0, k = 0; i < poleArray.length; i++) {
        ck.testExactNumber(poleArray[i][0], poleBufferA[k++]);
        ck.testExactNumber(poleArray[i][1], poleBufferA[k++]);
        ck.testExactNumber(poleArray[i][2], poleBufferA[k++]);
      }
    }

    let n = 0;
    const myPole = Point3d.create();
    const myPoleH = Point4d.create();
    ck.testUndefined(bcurve.getPolePoint4d(100));
    ck.testUndefined(bcurve.getPolePoint3d(100));
    for (; bcurve.getPolePoint3d(n, myPole) !== undefined; n++) {
      const q = bcurve.getPolePoint4d(n, myPoleH);
      if (ck.testPointer(q)) {
        const w = myPoleH.w;
        ck.testTrue(myPoleH.isAlmostEqualXYZW(myPole.x * w, myPole.y * w, myPole.z * w, w));
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("WeightedCurveMatch", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const poleArray = [
      Point3d.create(0, 0, 0),
      Point3d.create(1, 0, 0),
      Point3d.create(1, 1, 0),
      Point3d.create(0, 1, 1),
      Point3d.create(0, 2, 2)];
    for (const order of [3, 4, 5]) {
      const myKnots = buildClampedSteppedKnots(poleArray.length, order, 1.0);
      const bcurve3d = BSplineCurve3d.create(poleArray, myKnots, order)!;
      const bcurve4d = BSplineCurve3dH.create(poleArray, myKnots, order)!;
      allGeometry.push(bcurve3d);
      allGeometry.push(bcurve4d);
      for (const u of [0.2, 0.4, 0.5, 0.65, 1.0]) {
        const point3d = bcurve3d.fractionToPoint(u);
        const point4d = bcurve4d.fractionToPoint(u);
        if (!ck.testPoint3d(point3d, point4d, u)) {
          bcurve3d.fractionToPoint(u);
          bcurve4d.fractionToPoint(u);
        }

      }
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "BSplineCurve", "WeightedCurveMatch");
    expect(ck.getNumErrors()).equals(0);
  });

  it("WrappedCurves", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const xStep = 10.0;
    const poleArray = [
      Point3d.create(0, 0, 0),
      Point3d.create(1, 0, 0),
      Point3d.create(1, 1, 0),
      Point3d.create(0, 1, 1),
      Point3d.create(0, 2, 2)];
    for (const order of [2, 3, 4, 5]) {
      // wrap the points
      const wrappedPoleArray = [];
      for (const p of poleArray) wrappedPoleArray.push(p.clone());
      for (let i = 0; i + 1 < order; i++) wrappedPoleArray.push(poleArray[i].clone());
      const myKnots = buildWrappableSteppedKnots(poleArray.length, order, 1.0);
      const bcurve3d = BSplineCurve3d.create(wrappedPoleArray, myKnots, order)!;
      bcurve3d.setWrappable(BSplineWrapMode.OpenByAddingControlPoints);
      const bcurve4d = BSplineCurve3dH.create(wrappedPoleArray, myKnots, order)!;
      ck.testUndefined(bcurve3d.getSaturatedBezierSpan3d(100));
      ck.testUndefined(bcurve4d.getSaturatedBezierSpan3dH(100));

      bcurve4d.setWrappable(BSplineWrapMode.OpenByAddingControlPoints);
      GeometryCoreTestIO.captureGeometry(allGeometry, bcurve3d.clone(), (order - 2) * xStep, 0, 0);
      GeometryCoreTestIO.captureGeometry(allGeometry, bcurve4d.clone(), (order - 2) * xStep, xStep, 0);
      ck.testTrue(bcurve3d.isClosable === BSplineWrapMode.OpenByAddingControlPoints);
      ck.testTrue(bcurve4d.isClosable);
      ck.testFalse(bcurve3d.isAlmostEqual(bcurve4d));
      ck.testFalse(bcurve4d.isAlmostEqual(bcurve3d));
      for (const u of [0.2, 0.4, 0.5, 0.65, 1.0]) {
        const point3d = bcurve3d.fractionToPoint(u);
        const point4d = bcurve4d.fractionToPoint(u);
        if (!ck.testPoint3d(point3d, point4d, u)) {
          bcurve3d.fractionToPoint(u);
          bcurve4d.fractionToPoint(u);
        }
        // mess up poles first, then knots to reach failure branches in closure tests ...
        wrappedPoleArray[0].x += 0.1;
        const bcurve3dA = BSplineCurve3d.create(wrappedPoleArray, myKnots, order)!;
        bcurve3dA.setWrappable(BSplineWrapMode.OpenByAddingControlPoints);
        ck.testFalse(bcurve3dA.isClosable === BSplineWrapMode.OpenByAddingControlPoints);
        const bcurve4dA = BSplineCurve3dH.create(wrappedPoleArray, myKnots, order)!;
        bcurve4dA.setWrappable(BSplineWrapMode.OpenByAddingControlPoints);
        ck.testFalse(bcurve4dA.isClosable);

        // mess up knots.  The knot test precedes the pole test, so this failure gets hit before the poles (which are already altered)
        myKnots[order - 2] -= 0.1;
        const bcurve3dB = BSplineCurve3d.create(wrappedPoleArray, myKnots, order)!;
        bcurve3dB.setWrappable(BSplineWrapMode.OpenByAddingControlPoints);
        ck.testFalse(bcurve3dB.isClosable === BSplineWrapMode.OpenByAddingControlPoints);
        const bcurve4dB = BSplineCurve3dH.create(wrappedPoleArray, myKnots, order)!;
        bcurve4dB.setWrappable(BSplineWrapMode.OpenByAddingControlPoints);
        ck.testFalse(bcurve4dB.isClosable);
      }
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "BSplineCurve", "WeightedCurveMatch");
    expect(ck.getNumErrors()).equals(0);
  });

  it("StrokeWithKnotsA", () => {
    const ck = new Checker();
    const poles: Point3d[] = [];
    for (let i = 0; i < 10; i++)
      poles.push(Point3d.create(i, i * i, 0));
    const knots = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4];
    const bcurve = BSplineCurve3d.create(poles, knots, 4)!;
    const path = Path.create(bcurve);
    const options = new StrokeOptions();
    options.chordTol = 0.01;
    const strokes = path.getPackedStrokes(options);
    console.log(prettyPrint(strokes!.getPoint3dArray()));
    expect(ck.getNumErrors()).equals(0);
  });
  it("StrokeWithKnotsB", () => {
    const ck = new Checker();
    const path = IModelJson.Reader.parse({
      path: [{
        bcurve: {
          points: [[562203.9888586091, 4184365.4828894683, 13.075188058999167],
          [562203.8776459384, 4184365.258953491, 13.075185855086009],
          [562203.7664332676, 4184365.035017514, 13.075183688796626],
          [562203.6552205969, 4184364.811081537, 13.07518155809684],
          [562203.5440079262, 4184364.58714556, 13.075179427397055],
          [562203.4327952556, 4184364.3632095824, 13.07517733228783],
          [562203.3215825849, 4184364.1392736053, 13.075175270883584],
          [562203.0991924296, 4184363.691472501, 13.075171148727286],
          [562202.8768022744, 4184363.2436713967, 13.075167161227737],
          [562202.6544121193, 4184362.7958702925, 13.075163294885328]],
          knots: [0, 0, 0, 0, 0.2500197756132385, 0.2500197756132385, 0.2500197756132385,
            0.500039551226476, 0.500039551226476, 0.500039551226476, 1, 1, 1, 1],
          closed: false,
          order: 4,
        },
      }],
    });
    ck.testTrue(path instanceof Path);
    if (path instanceof Path) {
      const options = new StrokeOptions();
      options.chordTol = 0.01;
      const strokes = path.getPackedStrokes(options);
      console.log(prettyPrint(strokes!.getPoint3dArray()));
    }
  });
  // problem: concept station observes under-stroked parabolas.
  it("StrokeParabola", () => {
    const ck = new Checker();
    const x2 = 100.0;
    const allGeometry: GeometryQuery[] = [];
    let x0Out = 0.0;
    for (let i = 0; ; i++) {
      let options;
      if (i === 0) {
        options = undefined;
      } else if (i === 1)
        options = StrokeOptions.createForCurves();
      else if (i === 2)
        options = StrokeOptions.createForFacets();
      else if (i === 3) {
        options = StrokeOptions.createForCurves();
        options.angleTol = Angle.createDegrees(5.0);
      } else if (i === 4) {
        options = StrokeOptions.createForCurves();
        options.angleTol = Angle.createDegrees(2.5);
      } else if (i === 5) {
        options = StrokeOptions.createForCurves();
        options.chordTol = 0.2;
      } else if (i === 6) {
        options = StrokeOptions.createForCurves();
        options.chordTol = 0.02;
      } else if (i === 7) {
        options = StrokeOptions.createForCurves();
        options.maxEdgeLength = 10.0;
      } else
        break;

      for (const x1 of [30, 50, 80, 95]) {
        let y0Out = 0.0;
        const shift = 10.0;
        for (const y2 of [10, 40, 80]) {
          //          const poles = [[0, 0, 0], [x1, 0, 0], [x2, y2, 0]];
          const poles = [Point3d.create(0, 0, 0), Point3d.create(x1, 0, 0), Point3d.create(x2, y2, 0)];
          const bcurve = BSplineCurve3d.createUniformKnots(GrowableXYZArray.create(poles), 3)!;
          const bezier = BezierCurve3d.create(poles)!;
          const strokes = LineString3d.create();
          const bezierStrokes = LineString3d.create();
          bcurve.emitStrokes(strokes, options);
          bezier.emitStrokes(bezierStrokes, options);
          GeometryCoreTestIO.captureGeometry(allGeometry, bcurve, x0Out, y0Out, 0);
          GeometryCoreTestIO.captureGeometry(allGeometry, strokes, x0Out, y0Out, 0);

          GeometryCoreTestIO.captureGeometry(allGeometry, bezier, x0Out, y0Out + shift, 0);
          GeometryCoreTestIO.captureGeometry(allGeometry, bezierStrokes, x0Out, y0Out + shift, 0);
          ck.testExactNumber(strokes.numPoints(), bezierStrokes.numPoints(), "bezier stroke counts the same for isolated and bspline");
          y0Out += 100;
        }
        x0Out += 100;
      }
      x0Out += 200;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "BSpline", "StrokeParabola");
    expect(ck.getNumErrors()).equals(0);
  });
});
