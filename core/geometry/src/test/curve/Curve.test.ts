/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { BezierCurve3d } from "../../bspline/BezierCurve3d";
import { BezierCurve3dH } from "../../bspline/BezierCurve3dH";
import { BSplineCurve3d } from "../../bspline/BSplineCurve";
import { BSplineCurve3dH } from "../../bspline/BSplineCurve3dH";
import { Arc3d } from "../../curve/Arc3d";
import { CoordinateXYZ } from "../../curve/CoordinateXYZ";
import { CurveChainWithDistanceIndex } from "../../curve/CurveChainWithDistanceIndex";
import { BagOfCurves, CurveCollection } from "../../curve/CurveCollection";
import { CurveExtendMode } from "../../curve/CurveExtendMode";
import { CurveIntervalRole, CurveLocationDetail, CurveSearchStatus } from "../../curve/CurveLocationDetail";
import { CurvePrimitive } from "../../curve/CurvePrimitive";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Path } from "../../curve/Path";
import { CylindricalRangeQuery } from "../../curve/Query/CylindricalRange";
import { StrokeCountMap } from "../../curve/Query/StrokeCountMap";
import { StrokeOptions } from "../../curve/StrokeOptions";
import { TransitionSpiral3d } from "../../curve/spiral/TransitionSpiral3d";
import { IntegratedSpiral3d } from "../../curve/spiral/IntegratedSpiral3d";
import { Geometry } from "../../Geometry";
import { Angle } from "../../geometry3d/Angle";
import { AngleSweep } from "../../geometry3d/AngleSweep";
import { NullGeometryHandler } from "../../geometry3d/GeometryHandler";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/Plane3dByOriginAndUnitNormal";
import { Point2d } from "../../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Range3d } from "../../geometry3d/Range";
import { Ray3d } from "../../geometry3d/Ray3d";
import { Segment1d } from "../../geometry3d/Segment1d";
import { Transform } from "../../geometry3d/Transform";
import { Point4d } from "../../geometry4d/Point4d";
import { Newton1dUnboundedApproximateDerivative, NewtonEvaluatorRtoR } from "../../numerics/Newton";
import { Sample } from "../../serialization/GeometrySamples";
import { IModelJson } from "../../serialization/IModelJsonSchema";
import { RuledSweep } from "../../solid/RuledSweep";
import { Sphere } from "../../solid/Sphere";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";
import { prettyPrint } from "../testFunctions";
import { DirectSpiral3d } from "../../curve/spiral/DirectSpiral3d";

/* eslint-disable no-console */

class StrokeCountSearch extends NullGeometryHandler {
  public emitPackedStrokeCountMap(m: StrokeCountMap): any {
    const baseData = [m.numStroke, m.curveLength, m.a0, m.a1];
    if (!m.componentData) return baseData;
    const components = [];
    for (const cd of m.componentData) {
      const json = this.emitPackedStrokeCountMap(cd);
      components.push(json);
    }
    return { base: baseData, array: components };
  }
  public emitCountData(g: any) {
    if (g.strokeData instanceof StrokeCountMap)
      return this.emitPackedStrokeCountMap(g.strokeData);
    return undefined;
  }
  public override handleLineString3d(g: LineString3d) { return { numLineString3d: this.emitCountData(g) }; }
  public override handleArc3d(g: Arc3d) { return { numArc3d: this.emitCountData(g) }; }
  public override handleLineSegment3d(g: LineSegment3d) { return { numLineSegment3d: this.emitCountData(g) }; }
  public override handleBSplineCurve3d(g: BSplineCurve3d) { return { numBSplineCurve3d: this.emitCountData(g) }; }
  public override handleBSplineCurve3dH(g: BSplineCurve3dH) { return { numBSplineCurve3dH: this.emitCountData(g) }; }
  public handleLBezierCurve3d(g: BezierCurve3d) { return { numBezierCurve3d: this.emitCountData(g) }; }
  public handleLBezierCurve3dH(g: BezierCurve3dH) { return { numBezierCurve3dH: this.emitCountData(g) }; }
  public handleCurveChainWithDistanceIndex(g: CurveChainWithDistanceIndex) {
    const data = { numCurveVectorWithDistanceIndex: this.emitCountData(g) };
    const children = g.children;
    if (children) {
      (data as any).childCounts = [];
      for (const c of children) {
        (data as any).childCounts.push(this.emitCountData(c));
      }
    }
  }
  public override handlePath(g: Path) {
    const childData = [];
    const children = g.children;
    if (children) {
      for (const c of children) {
        childData.push(this.emitCountData(c));
      }
    }
    return { path: childData };
  }

  public static getJSON(g: GeometryQuery): any {
    const handler = new StrokeCountSearch();
    return g.dispatchToGeometryHandler(handler);
  }
}

class ExerciseCurve {
  public static exerciseStrokeData(ck: Checker, curve: CurvePrimitive) {

    const curveA = curve.clone() as CurvePrimitive;
    const count0 = curveA.computeStrokeCountForOptions();
    curveA.computeAndAttachRecursiveStrokeCounts();
    // console.log("strokes by count", count0);
    // console.log("attached to curve", prettyPrint(StrokeCountSearch.getJSON(curveA)));

    if (ck.testPointer(curveA.strokeData, "StrokeData attached", curveA) && curveA.strokeData) {
      if (!ck.testExactNumber(curveA.strokeData.numStroke, count0, curveA)) {
        console.log("strokes by count", count0);
        console.log("attached to curve", prettyPrint(StrokeCountSearch.getJSON(curveA)));
      }
    }
  }

  public static exerciseCloneAndTransform(ck: Checker, curveA: CurvePrimitive) {
    const u0 = 0.25;
    const u1 = 0.5;
    const scaleFactor = 2.0;
    const pointA0 = curveA.fractionToPoint(u0);
    const pointA1 = curveA.fractionToPoint(u1);
    const transform = Transform.createScaleAboutPoint(pointA0, scaleFactor);
    const curveB = curveA.cloneTransformed(transform);
    if (ck.testPointer(curveB) && curveB instanceof CurvePrimitive) {
      ck.testFalse(curveA.isAlmostEqual(curveB), "scale changes surface");
      ck.testTrue(curveB.isSameGeometryClass(curveA));
      const pointB0 = curveB.fractionToPoint(u0);
      curveB.fractionToPoint(u0);
      ck.testPoint3d(pointA0, pointB0, "fixed point preserved");
      const pointB1 = curveB.fractionToPoint(u1);
      ck.testCoordinate(scaleFactor * pointA0.distance(pointA1), pointB0.distance(pointB1));
      const frameA0 = curveA.fractionToFrenetFrame(u0);
      const frameB0 = curveB.fractionToFrenetFrame(u0);
      if (frameA0 && frameB0
        /* ck.testPointer(frameA0)
        && ck.testPointer(frameB0)
        && frameA0
        && frameB0*/ ) {
        ck.testTransform(frameA0, frameB0);
        const frameA0Inverse = frameA0.inverse();
        if (ck.testPointer(frameA0Inverse)) {
          const rangeA2 = Range3d.create();
          curveA.extendRange(rangeA2, frameA0Inverse);
          const planeA2 = Plane3dByOriginAndUnitNormal.create(
            Point3d.createFrom(frameA0.origin),
            frameA0.matrix.columnZ());
          ck.testBoolean(curveA.isInPlane(planeA2!),
            Geometry.isSmallMetricDistance(rangeA2.zLength()),
            "Surface planarity test versus range in frame");
        }
      }
    }
  }

  public static exerciseReverseInPlace(ck: Checker, curve: CurvePrimitive) {
    const curveA = curve.clone() as CurvePrimitive;
    curveA.reverseInPlace();
    for (const f of [0, 0.2, 0.6, 0.92, 1]) {
      let point = curve.fractionToPoint(f);
      let pointA = curveA.fractionToPoint(1.0 - f);
      if (!ck.testPoint3d(point, pointA, "Reverse Curve", curve, f)) {
        console.log("Reverse in place trap", curveA);
        point = curve.fractionToPoint(f);
        pointA = curveA.fractionToPoint(1.0 - f);
      }
    }
  }
  public static exerciseCurvePlaneIntersections(ck: Checker, curve: CurvePrimitive) {
    if (curve instanceof BSplineCurve3d) return;  // TODO
    // if (curve instanceof TransitionSpiral3d) return;  // TODO
    for (const fractionA of [0.421, 0.421, 0.45, 0.45]) {
      const tangentA = curve.fractionToPointAndDerivative(fractionA)!;
      if (ck.testPointer(tangentA)) {
        const plane = Plane3dByOriginAndUnitNormal.create(tangentA.origin, tangentA.direction)!;
        const intersections: CurveLocationDetail[] = [];
        curve.appendPlaneIntersectionPoints(plane, intersections);
        const foundAt = intersections.filter(
          (detail: CurveLocationDetail, _index: number, _data: CurveLocationDetail[]) => {
            if (detail.curve === curve)
              return Geometry.isAlmostEqualNumber(detail.fraction, fractionA);
            // Different curve -- maybe a constituent?  accept based on points
            return plane.getOriginRef().isAlmostEqual(detail.point);
          });
        ck.testTrue(foundAt.length >= 1, "planeCurveIntersections", curve, plane, fractionA);
      }
    }
  }

  public static exerciseMoveSignedDistance(ck: Checker, curve: CurvePrimitive) {
    for (const segment of [
      Segment1d.create(0.0, 0.5),
      Segment1d.create(0.5, 1.0),
      Segment1d.create(0.1, 0.35),
      Segment1d.create(0.38, 0.92),
      Segment1d.create(-0.1, 0.2),
      Segment1d.create(-0.1, 0.2),
      Segment1d.create(0.9, 1.2),
      Segment1d.create(0.9, 1.2)]) {
      const a = segment.x0;
      const b = segment.x1;
      const distanceAB = curve.curveLengthBetweenFractions(a, b);
      const distanceBA = curve.curveLengthBetweenFractions(b, a);
      if (!ck.testCoordinate(distanceAB, distanceBA)) {
        curve.curveLengthBetweenFractions(a, b);
        curve.curveLengthBetweenFractions(b, a);
      }
      let detailAtoB = curve.moveSignedDistanceFromFraction(a, distanceAB, true);
      let detailBtoA = curve.moveSignedDistanceFromFraction(b, -distanceAB, true);
      if (!segment.isIn01 &&
        (detailAtoB.curveSearchStatus === CurveSearchStatus.stoppedAtBoundary
          || detailBtoA.curveSearchStatus === CurveSearchStatus.stoppedAtBoundary)) {
        // um .. not sure what to test for
      } else if (detailAtoB.curveSearchStatus === undefined
        || detailBtoA.curveSearchStatus === undefined
        || detailAtoB.curveSearchStatus !== CurveSearchStatus.success
        || detailBtoA.curveSearchStatus !== CurveSearchStatus.success) {
        detailAtoB = curve.moveSignedDistanceFromFraction(a, distanceAB, true);
        detailBtoA = curve.moveSignedDistanceFromFraction(b, -distanceAB, true);
        ck.announceError("Incomplete moveSignedDistanceFromFraction", a, b, curve);
      } else {
        if (curve.isExtensibleFractionSpace || segment.isIn01) {
          ck.testCoordinate(b, detailAtoB.fraction);
          ck.testCoordinate(a, detailBtoA.fraction);
        } else {

        }
      }
    }
  }

  public static exerciseFractionToPoint(ck: Checker, curve: CurvePrimitive | undefined, expectProportionalDistance: boolean, expectEqualChordLength: boolean) {
    if (!curve) {
      ck.announceError("Null CurvePrimitive provided to exerciseFractionAndPoint");
      return;
    }

    const derivativeIncrement = 1.0e-4;
    const derivativeTolerance = 1.0e-6;
    const derivative2Tolerance = 1.0e-5;
    const point0 = curve.fractionToPoint(0.0);
    const previousPoint = curve.fractionToPoint(0);
    let newPoint = point0.clone();
    const length01 = curve.curveLength();
    let previousDistance = 0;
    const fractions = [0, 1 / 7.0, 2 / 7.0, 3 / 7.0, 4 / 7.0];
    let length0F;
    for (const fraction of fractions) {
      // equal steps but stay away from possible interior vertices of linestrings !!!
      newPoint = curve.fractionToPoint(fraction, newPoint);
      const distance = previousPoint.distance(newPoint);

      if (expectProportionalDistance) {
        length0F = curve.curveLengthBetweenFractions(0.0, fraction);
        if (curve instanceof TransitionSpiral3d) {
          // special tolerance on spirals . . .
          const delta = Math.abs(fraction * length01 - length0F);
          ck.testCoordinate(0, delta / 1000.0, "fluffy length along spiral");
        } else
          ck.testCoordinate(fraction * length01, length0F, "interpolated points at expected distance");
      }
      if (expectEqualChordLength && previousDistance !== 0.0)
        ck.testCoordinate(distance, previousDistance, "equalChordLength in fractional Steps");
      previousPoint.setFrom(newPoint);
      previousDistance = distance;
      // if it is an interior point confirm rudimentary derivative properties
      if (Math.abs(fraction - 0.5) < 0.49) {
        const pointA0 = curve.fractionToPoint(fraction - derivativeIncrement);
        const pointA1 = curve.fractionToPoint(fraction);
        const pointA2 = curve.fractionToPoint(fraction + derivativeIncrement);
        const delta01 = Vector3d.createStartEnd(pointA0, pointA1);
        const delta12 = Vector3d.createStartEnd(pointA1, pointA2);
        const delta012 = Vector3d.createStartEnd(delta01, delta12);
        const delta02 = Vector3d.createStartEnd(pointA0, pointA2);
        const derivativeRay = curve.fractionToPointAndDerivative(fraction);
        const plane1 = curve.fractionToPointAnd2Derivatives(fraction);
        const unitRay = curve.fractionToPointAndUnitTangent(fraction);
        ck.testParallel(unitRay.direction, derivativeRay.direction);
        ck.testPoint3d(pointA1, derivativeRay.origin);
        const approximateDerivative = delta02.scale(0.5 / derivativeIncrement);
        const approximateDerivative2 = delta012.scale(1.0 / (derivativeIncrement * derivativeIncrement));
        ck.testTrue(approximateDerivative.distance(derivativeRay.direction) < derivativeTolerance * (1 + derivativeRay.direction.magnitude()),
          "approximate derivative", derivativeRay.direction, approximateDerivative, curve, fraction);
        if (plane1) { //  curve instanceof TransitionSpiral3d
          ck.testPoint3d(derivativeRay.origin, plane1.origin, "points with derivatives");
          if (!(curve instanceof TransitionSpiral3d)) {
            // TransitionSpiral has weird derivative behavior?
            // if (!ck.testTrue(approximateDerivative2.distance(plane1.vectorV) < derivative2Tolerance * (1 + plane1.vectorV.magnitude())))
            //  curve.fractionToPointAnd2Derivatives(fraction);
            const radians = approximateDerivative2.angleTo(plane1.vectorV).radians;
            if (!ck.testLE(radians, 0.001))
              curve.fractionToPointAnd2Derivatives(fraction);
            if (!ck.testTrue(approximateDerivative2.distance(plane1.vectorV) < derivative2Tolerance * (1 + plane1.vectorV.magnitude()))) {
              const magU = plane1.vectorU.magnitude();
              const magV = plane1.vectorV.magnitude();
              const magV2 = approximateDerivative2.magnitude();
              const ratio = magV / magV2;
              console.log(` (magU  ${magU} (magV  ${magV} (magV2  ${magV2} (magV/magV2  ${ratio} (L  ${curve.curveLength()} (radians  ${radians}`);
              curve.fractionToPointAnd2Derivatives(fraction);
            }
          }
        }
      }
    }
    ExerciseCurve.exerciseCurvePlaneIntersections(ck, curve);
    ExerciseCurve.exerciseReverseInPlace(ck, curve);
    ExerciseCurve.exerciseCloneAndTransform(ck, curve);
    ExerciseCurve.exerciseCloneAndTransform(ck, curve);
    ExerciseCurve.exerciseStrokeData(ck, curve);
    // evaluate near endpoints to trigger end conditions
    const point0A = curve.startPoint();
    const point1A = curve.endPoint();
    ck.testLE(point0A.distance(point1A), curve.quickLength(), "start end distance LE curve quick length");

    for (const f of [0.01, 0.48343, 0.992]) {
      const xyzA = Point3d.create();
      const xyzB = curve.fractionToPoint(f);
      curve.fractionToPoint(f, xyzA);
      ck.testPoint3d(xyzA, xyzB);

      const rayA = Ray3d.createZero();
      const rayB = curve.fractionToPointAndDerivative(f);
      curve.fractionToPointAndDerivative(f, rayA);
      ck.testTrue(rayA.isAlmostEqual(rayB), "default result for fractionToPointAndDerivative");
    }
  }

  public static exerciseClosestPoint(ck: Checker, curve: CurvePrimitive, fractionA: number): boolean {
    const pointA = curve.fractionToPoint(fractionA);
    let detail = curve.closestPoint(pointA, false);
    if (ck.testPointer(detail)) {
      if (detail.curve === curve) {
        if (!ck.testCoordinate(fractionA, detail.fraction, "fraction round trip")
          || !ck.testPoint3d(pointA, detail.point, "round trip point")) {
          const pointB = curve.fractionToPoint(fractionA);
          detail = curve.closestPoint(pointB, false);
        } else {
          // The search tunneled into a contained curve.   Only verify the point.
          if (!ck.testPoint3d(pointA, detail.point, "round trip point")
            || !ck.testPoint3d(pointA, detail.curve.fractionToPoint(detail.fraction))) {
            detail = curve.closestPoint(pointA, false);
          }
        }
      }
    }
    return true;
  }

  public static exerciseStroke(ck: Checker, curve: CurvePrimitive): void {
    const strokes = LineString3d.create();
    const options = StrokeOptions.createForCurves();
    const theta = Angle.createDegrees(10);

    const directRange = curve.range();
    const extendRange = Range3d.create();
    curve.extendRange(extendRange);
    options.minStrokesPerPrimitive = 2;
    options.angleTol = theta;
    const chordFraction = Math.cos(theta.radians);
    curve.emitStrokes(strokes, options);
    ck.testCoordinateOrder(2, strokes.points.length, "Non-trivial strokes");
    const curveLength = curve.curveLength();
    const strokeLength = strokes.curveLength();
    const strokeRange = strokes.range();
    ck.testTrue(directRange.containsRange(strokeRange), "range from curve contains range of strokes");
    ck.testTrue(extendRange.containsRange(strokeRange), "range from curve by extend contains range of strokes");

    ck.testLE(strokeLength, curveLength, "strokeLength cannot exceed curveLength");
    if (!ck.testLE(chordFraction * curveLength, strokeLength, "strokes appear accurate")
      || Checker.noisy.stroke) {
      console.log(" CURVE", curve);
      const curveLength1 = curve.curveLength();
      console.log("computed length", curveLength1);
      console.log("STROKES", strokes);
    }
  }
  public static testManyCurves(ck: Checker) {

    {
      const segment = LineSegment3d.create(Point3d.create(1, 2, 3), Point3d.create(4, 5, 10));
      ExerciseCurve.exerciseFractionToPoint(ck, segment, true, true);
      ExerciseCurve.exerciseMoveSignedDistance(ck, segment);
      ExerciseCurve.exerciseStroke(ck, segment);
      ExerciseCurve.exerciseClosestPoint(ck, segment, 0.1);
      ExerciseCurve.exerciseCloneAndTransform(ck, segment);
    }
    { // a circular arc . . .
      const arc = Arc3d.create(Point3d.create(1, 2, 3),
        Vector3d.create(2, 0, 0),
        Vector3d.create(0, 2, 0),
        AngleSweep.createStartEndDegrees(0, 180));
      if (arc) {
        ExerciseCurve.exerciseFractionToPoint(ck, arc, false, true);
        ExerciseCurve.exerciseMoveSignedDistance(ck, arc);
        ExerciseCurve.exerciseClosestPoint(ck, arc, 0.1);
        ExerciseCurve.exerciseStroke(ck, arc);
        ExerciseCurve.exerciseCloneAndTransform(ck, arc);
      }
    }

    { // a non-circular arc . . .  (much harder computations!!)
      const arc = Arc3d.create(Point3d.create(1, 2, 3),
        Vector3d.create(3, 0, 0),
        Vector3d.create(0, 2, 0),
        AngleSweep.createStartEndDegrees(0, 180));
      if (arc) {
        ExerciseCurve.exerciseFractionToPoint(ck, arc, false, false);
        ExerciseCurve.exerciseMoveSignedDistance(ck, arc);
        ExerciseCurve.exerciseClosestPoint(ck, arc, 0.1);
        ExerciseCurve.exerciseStroke(ck, arc);
        ExerciseCurve.exerciseCloneAndTransform(ck, arc);
      }
    }

    {
      const linestring = LineString3d.createPoints([
        Point3d.create(0, 0, 0),
        Point3d.create(1, 0, 0),
        Point3d.create(1, 1, 0)]);
      ExerciseCurve.exerciseFractionToPoint(ck, linestring, false, false);
      ExerciseCurve.exerciseMoveSignedDistance(ck, linestring);
      ExerciseCurve.exerciseStroke(ck, linestring);
      ExerciseCurve.exerciseCloneAndTransform(ck, linestring);
    }
    {
      const linestring = LineString3d.create(
        Point3d.create(0, 0, 0),
        Point3d.create(1, 0, 0),
        Point3d.create(2, 1, 0));
      ExerciseCurve.exerciseFractionToPoint(ck, linestring, false, false);
      ExerciseCurve.exerciseMoveSignedDistance(ck, linestring);
      ExerciseCurve.exerciseStroke(ck, linestring);
      ExerciseCurve.exerciseCloneAndTransform(ck, linestring);
    }

    {
      const linestring = LineString3d.create();
      ck.testExactNumber(0, linestring.points.length);
    }
    const bcurve = BSplineCurve3d.createUniformKnots(
      [Point3d.create(0, 0, 0), Point3d.create(5, 0, 0), Point3d.create(10, 4, 0)],
      3);
    if (ck.testPointer(bcurve)) {
      ExerciseCurve.exerciseFractionToPoint(ck, bcurve, false, false);
      ExerciseCurve.exerciseStroke(ck, bcurve);
      ExerciseCurve.exerciseClosestPoint(ck, bcurve, 0.1);
    }
    // with weights, but all weights 1.0
    const bcurveH1 = BSplineCurve3dH.createUniformKnots(
      [Point4d.create(0, 0, 0, 1), Point4d.create(5, 0, 0, 1), Point4d.create(10, 4, 0, 1)],
      3);
    if (ck.testPointer(bcurveH1)) {
      ExerciseCurve.exerciseFractionToPoint(ck, bcurveH1, false, false);
      ExerciseCurve.exerciseStroke(ck, bcurveH1);
      ExerciseCurve.exerciseClosestPoint(ck, bcurveH1, 0.1);
    }

    const poles4d = [
      Point4d.create(0, 0, 0, 1),
      Point4d.create(5, 0, 0, 0.8),
      Point4d.create(10, 4, 0, 1),
      Point4d.create(15, 4, 0, 1),
      Point4d.create(20, 0, 0, 1)];

    for (let order = 3; order <= poles4d.length; order++) {
      const bcurveH = BSplineCurve3dH.createUniformKnots(poles4d, order);
      if (ck.testPointer(bcurveH)) {
        ExerciseCurve.exerciseFractionToPoint(ck, bcurveH, false, false);
        ExerciseCurve.exerciseStroke(ck, bcurveH);
        ExerciseCurve.exerciseMoveSignedDistance(ck, bcurveH);
        ExerciseCurve.exerciseClosestPoint(ck, bcurveH, 0.1);
        ExerciseCurve.exerciseClosestPoint(ck, bcurveH, 0.48);
        ExerciseCurve.exerciseClosestPoint(ck, bcurveH, 0.82);
      }
    }

    const bezierCurve0 = BezierCurve3d.create([
      Point2d.create(0, 0), Point2d.create(0.5, 0.0), Point2d.create(1, 1)])!;
    ExerciseCurve.exerciseFractionToPoint(ck, bezierCurve0, false, false);
    ExerciseCurve.exerciseMoveSignedDistance(ck, bezierCurve0);
    ExerciseCurve.exerciseStroke(ck, bezierCurve0);
    ExerciseCurve.exerciseClosestPoint(ck, bezierCurve0, 0.1);

    const bezierCurve = BezierCurve3dH.create([
      Point2d.create(0, 0), Point2d.create(0.5, 0.0), Point2d.create(1, 1)])!;
    ExerciseCurve.exerciseMoveSignedDistance(ck, bezierCurve);
    ExerciseCurve.exerciseFractionToPoint(ck, bezierCurve, false, false);
    ExerciseCurve.exerciseStroke(ck, bezierCurve);
    ExerciseCurve.exerciseClosestPoint(ck, bezierCurve, 0.1);

    const bezierCurve3d = BezierCurve3dH.create([
      Point3d.create(0, 0), Point3d.create(0.5, 0.0), Point3d.create(1, 1), Point3d.create(2, 1, 1)])!;
    ExerciseCurve.exerciseFractionToPoint(ck, bezierCurve, false, false);
    ExerciseCurve.exerciseMoveSignedDistance(ck, bezierCurve3d);
    ExerciseCurve.exerciseStroke(ck, bezierCurve3d);
    ExerciseCurve.exerciseClosestPoint(ck, bezierCurve3d, 0.1);

    if (Checker.noisy.testTransitionSpiral) {
      for (const spiral of [
        DirectSpiral3d.createDirectHalfCosine(Transform.createIdentity(), 100, 300, undefined),
        DirectSpiral3d.createJapaneseCubic(Transform.createIdentity(), 100, 300, undefined),
        DirectSpiral3d.createArema(Transform.createIdentity(), 100, 300, undefined),
        IntegratedSpiral3d.createRadiusRadiusBearingBearing(
          Segment1d.create(0, 1000),
          AngleSweep.createStartEndDegrees(0, 10),
          Segment1d.create(0, 1),
          Transform.createIdentity())]) {
        if (ck.testPointer(spiral)) {
          ExerciseCurve.exerciseCurvePlaneIntersections(ck, spiral);
          ExerciseCurve.exerciseFractionToPoint(ck, spiral, (spiral instanceof IntegratedSpiral3d), false);
          ExerciseCurve.exerciseStroke(ck, spiral);
          ExerciseCurve.exerciseClosestPoint(ck, spiral, 0.3);
        }
      }

    }
  }
}

describe("Curves", () => {
  it("Exercise", () => {
    const ck = new Checker();
    ExerciseCurve.testManyCurves(ck);
    ck.checkpoint("End CurvePrimitive.Evaluations");
    expect(ck.getNumErrors()).equals(0);
  });
  it("Create and exercise distanceIndex", () => {
    const ck = new Checker();
    const paths = Sample.createCurveChainWithDistanceIndex();
    const dx = 10.0;
    const allGeometry = [];
    for (const p of paths) {
      const q = p.clone()!;
      ck.testTrue(p.isAlmostEqual(q));
      q.tryTranslateInPlace(dx, 0, 0);
      allGeometry.push(p.clone());
      ExerciseCurve.exerciseFractionToPoint(ck, p, true, false);
      ExerciseCurve.exerciseStroke(ck, p);
      ExerciseCurve.exerciseClosestPoint(ck, p, 0.1);
      ExerciseCurve.exerciseCloneAndTransform(ck, p);
      ExerciseCurve.exerciseMoveSignedDistance(ck, p);
      ck.testFalse(p.isInPlane(Plane3dByOriginAndUnitNormal.create(Point3d.create(1, 3, 2.123213213), Vector3d.create(0.3423, 3.1, -0.3))!));
      const point0 = p.startPoint();
      const point1 = p.endPoint();
      const point0F = p.fractionToPoint(0.0);
      const point1F = p.fractionToPoint(1.0);
      ck.testPoint3d(point0, point0F);
      ck.testPoint3d(point1, point1F);
      ck.testFalse(p.isAlmostEqual(LineSegment3d.createXYXY(1, 2, 3, 4)));
      // test closest point for points on extended tangent ....
      const e = 0.001;
      const ray0 = p.fractionToPointAndUnitTangent(0.0);
      const ray1 = p.fractionToPointAndUnitTangent(1.0);
      const p0 = ray0.fractionToPoint(-e);
      const p1 = ray1.fractionToPoint(e);

      const c0 = p.closestPoint(p0, false);
      const c1 = p.closestPoint(p1, false);
      const error0 = ck.getNumErrors();
      // console.log("\n\n  START CURVE ", prettyPrint(IModelJson.Writer.toIModelJson(p.path)));
      if (ck.testPointer(c0)) {
        if (!ck.testPoint3d(ray0.origin, c0.point))
          p.closestPoint(p0, false);
      }
      if (ck.testPointer(c1)) {
        if (!ck.testPoint3d(ray1.origin, c1.point))
          p.closestPoint(p1, false);
      }

      const c0x = p.closestPoint(p0, CurveExtendMode.OnCurve);
      const c1x = p.closestPoint(p1, CurveExtendMode.OnCurve);
      const proximityFactor = 0.01;   // WE TRUST THAT THE CURVE DOES NOT BEND MUCH IN SMALL EXTRAPOLATION -- projected point should be closer than extension distance.
      if (ck.testPointer(c0x)) {
        if (c0x.childDetail && c0x.childDetail.curve!.isExtensibleFractionSpace)
          ck.testLT(p0.distance(c0x.point), proximityFactor * e, "small distance from curve");
        p.closestPoint(p0, CurveExtendMode.OnCurve);
      }
      if (ck.testPointer(c1x)) {
        if (c1x.childDetail && c1x.childDetail.curve!.isExtensibleFractionSpace)
          ck.testLT(p1.distance(c1x.point), proximityFactor * e, "small distance from curve");
        p.closestPoint(p1, CurveExtendMode.OnCurve);
      }

      if (ck.getNumErrors() > error0)
        console.log("  With this curve", prettyPrint(IModelJson.Writer.toIModelJson(p.path)));
    }

    ck.checkpoint("CurvePrimitive.Create and exercise distanceIndex");
    GeometryCoreTestIO.saveGeometry(allGeometry, "CurvePrimitive", "CurveChainWithDistanceIndex");

    expect(ck.getNumErrors()).equals(0);
  });
  it("DistanceIndexMismatches", () => {
    const ck = new Checker();
    const pathA = Sample.createSquareWavePath(4, 1, 1, 0, 1, 0);   // 4 waves as one linestring
    const pathB = Sample.createSquareWavePath(1, 1, 1, 0, 1, 0);   // 1 wave as one linestring
    const pathC = Sample.createSquareWavePath(1, 1, 1, 0, 0, 1);    // 1 wave as 4 line segments
    const pathD = Sample.createSquareWavePath(4, 1, 1, 0, 0, 2);    // 4 wave as 4 linestrings
    const emptyBag = BagOfCurves.create();
    const bag1 = BagOfCurves.create();
    const bagWithPath = BagOfCurves.create(pathA.clone()!);

    const lineSegment = LineSegment3d.createXYXY(0, 0, 1, 1);
    bag1.tryAddChild(lineSegment.clone());
    const allGeometry: GeometryQuery[] = [];
    GeometryCoreTestIO.captureGeometry(allGeometry, pathA.clone(), 0, 0, 0);
    GeometryCoreTestIO.captureGeometry(allGeometry, pathB.clone(), 0, 2, 0);
    GeometryCoreTestIO.captureGeometry(allGeometry, pathC.clone(), 0, 4, 0);
    GeometryCoreTestIO.captureGeometry(allGeometry, pathD.clone(), 0, 30, 0);

    // const indexedPathA = CurveChainWithDistanceIndex.createCapture(pathA);
    // const indexedPathB = CurveChainWithDistanceIndex.createCapture(pathB);
    // const indexedPathC = CurveChainWithDistanceIndex.createCapture(pathC);
    // const indexedPathD = CurveChainWithDistanceIndex.createCapture(pathD);
    const returnUndefined = (_a: CurvePrimitive, _b: CurvePrimitive): CurvePrimitive | undefined => undefined;
    const returnCloneA = (a: CurvePrimitive, _b: CurvePrimitive): CurvePrimitive | undefined => {
      const c = a.clone();
      if (c)
        return c as CurvePrimitive;
      return undefined;
    };
    ck.testUndefined(RuledSweep.mutatePartners(pathA, emptyBag, returnCloneA), "mutatePartners rejects mismatched collection types");
    ck.testUndefined(RuledSweep.mutatePartners(pathA, pathD, returnCloneA), "mutatePartners rejects mismatched collection lengths");
    ck.testUndefined(RuledSweep.mutatePartners(pathA, pathB, returnUndefined), "mutatePartners echos undefined steps");
    ck.testTrue(emptyBag.isAlmostEqual(RuledSweep.mutatePartners(emptyBag, emptyBag, returnUndefined)!), "mutatePartners notices empty collection");
    ck.testUndefined(RuledSweep.mutatePartners(emptyBag, bag1, returnCloneA), "mutatePartners notices different collection size");
    ck.testUndefined(RuledSweep.mutatePartners(bag1, bag1, returnUndefined), "mutatePartners notices failed mutator");
    ck.testUndefined(emptyBag.getChild(0));
    ck.testUndefined(bag1.getChild(4));
    ck.testUndefined(RuledSweep.mutatePartners(pathA, (lineSegment as any) as CurveCollection, returnUndefined), "mutatePartners rejects non-collection");
    ck.testUndefined(RuledSweep.mutatePartners((lineSegment as any) as CurveCollection, (lineSegment as any) as CurveCollection, returnUndefined), "mutatePartners rejects non-collection");
    ck.testUndefined(RuledSweep.mutatePartners(bagWithPath, bagWithPath, returnUndefined), "mutatePartners sees undefined step for collection in bag");
    ck.checkpoint("CurvePrimitive.DistanceIndexMismatches");
    GeometryCoreTestIO.saveGeometry(allGeometry, "CurvePrimitive", "CurveChainWithDistanceIndex");

    expect(ck.getNumErrors()).equals(0);
  });
  it("DistanceIndexClosestPoint", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    let x0 = 0;
    let y0 = 0;
    const primitives = [];
    primitives.push(LineString3d.create(Point3d.create(1, 0, 0), Point3d.create(1, 1, 0), Point3d.create(1.8, 2, 0), Point3d.create(2, 3, 0)));
    primitives.push(Arc3d.createCircularStartMiddleEnd(Point3d.create(2, 3, 0), Point3d.create(2.2, 4, 0), Point3d.create(2, 5, 0))!);
    primitives.push(LineString3d.create(Point3d.create(2, 5, 0), Point3d.create(2.2, 6, 0), Point3d.create(1, 7, 0), Point3d.create(2, 8, 0)));
    primitives.push(Arc3d.createCircularStartMiddleEnd(Point3d.create(2, 8, 0), Point3d.create(1.7, 9, 0), Point3d.create(2, 10, 0))!);
    primitives.push(LineSegment3d.create(Point3d.create(2, 10, 0), Point3d.create(2.1, 11, 0)));
    for (const numPrimitive of [1, 2, 3, 4, 5]) {
      for (const primitive0 of [0, 1, 2, 3, 4]) {
        const path = Path.create();
        for (let i = primitive0; i < primitives.length && i < primitive0 + numPrimitive; i++)
          path.tryAddChild(primitives[i]);
        const indexedPath = CurveChainWithDistanceIndex.createCapture(path)!;
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, path, x0, y0);
        const range = indexedPath.range();

        for (const x of [0, 0.7, 2.2, 3]) {
          for (let y = range.low.y - 1.0; y <= range.high.y + 1.1; y += 0.5) {
            const spacePoint = Point3d.create(x, y);
            const detail = indexedPath.closestPoint(spacePoint, false);
            if (ck.testDefined(detail) && detail) {
              const unitTangent = indexedPath.fractionToPointAndUnitTangent(detail.fraction);
              // strokes .. space point to new evaluation to short step on tangent back to nearby point on line from space point to detail point
              GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(spacePoint, unitTangent.origin,
                unitTangent.fractionToPoint(0.05),
                spacePoint.interpolate(0.95, detail.point)), x0, y0);

            }
          }
        }
        y0 += 20;
      }
      x0 += 10;
      y0 = 0;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "CurvePrimitive", "DistanceIndexClosestPoint");

    expect(ck.getNumErrors()).equals(0);
  });

});

class NewtonEvaluatorClosestPointOnCurve extends NewtonEvaluatorRtoR {
  private _curve: CurvePrimitive;
  private _spacePoint: Point3d;
  public lastFraction: number;
  public lastEvaluationA: Ray3d;
  public constructor(curve: CurvePrimitive, spacePoint: Point3d) {
    super();
    this._spacePoint = spacePoint;
    this._curve = curve;
    this.lastFraction = 0;
    this.lastEvaluationA = Ray3d.createZero();
    // console.log("\n**\n");
    // console.log("ClosestPoint", spacePoint, curve);
  }
  public evaluate(f: number): boolean {
    this.lastFraction = f;
    this.lastEvaluationA = this._curve.fractionToPointAndDerivative(f, this.lastEvaluationA);
    this.currentF = this.lastEvaluationA.direction.dotProductStartEnd(this._spacePoint, this.lastEvaluationA.origin);
    // console.log("evaluate ", this.lastFraction, this.lastEvaluationA, this.currentF);
    return true;
  }

}
describe("CurvePrimitive.Newton", () => {
  it("CurvePrimitive.Newton", () => {
    const initialShift = 0.05;
    const ck = new Checker();
    for (const c of Sample.createSmoothCurvePrimitives()) {
      // console.log(prettyPrint(c));
      for (const f of [0.25, 0.6]) {
        const xyz = c.fractionToPoint(f);
        const evaluator = new NewtonEvaluatorClosestPointOnCurve(c, xyz);
        const searcher = new Newton1dUnboundedApproximateDerivative(evaluator);
        searcher.setX(f + initialShift);  // start searching from a fraction close to the known result.
        // the step cannot be too big for nasty curves !!!
        // console.log("search at fraction " + f);
        if (ck.testBoolean(true, searcher.runIterations(), "Newton finish")) {
          ck.testCoordinate(f, searcher.getX());
        }
      }
    }
    ck.checkpoint("CurvePrimitive.Newton");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("CurvePrimitive.TransitionSpiral", () => {
  it("CurvePrimitive.TransitionSpiral", () => {
    const ck = new Checker();
    const c = IntegratedSpiral3d.createRadiusRadiusBearingBearing(
      Segment1d.create(0, 100),
      AngleSweep.createStartEndDegrees(0, 5),
      Segment1d.create(0, 1),
      Transform.createIdentity())!;
    const point0 = c.fractionToPointAndDerivative(0);
    const point1 = Ray3d.createZero();
    const numStroke = 50;
    let chordSum = 0.0;
    let trapezoidSum = 0.0;
    for (let i = 1; i <= numStroke; i++) {
      const fraction = i / numStroke;
      c.fractionToPointAndDerivative(fraction, point1);
      chordSum += point0.origin.distance(point1.origin);
      trapezoidSum += 0.5 * (point0.direction.magnitude() + point1.direction.magnitude()) / numStroke;
      if (Checker.noisy.spirals)
        console.log("f", fraction, "  point", point1);
      point0.setFrom(point1);
    }
    if (Checker.noisy.spirals) {
      console.log("arcLength", c.curveLength());
      console.log("  chordSum ", chordSum, " deltaC", chordSum - c.curveLength());
      console.log("  trapSum ", trapezoidSum, " deltaT", trapezoidSum - c.curveLength());
    }
    // We expect trapezoidSum to be good (really good!) approximation of the length.
    // chordSum is not so good -- allow it to haver a bigger error.
    ck.testCoordinateWithToleranceFactor(chordSum, trapezoidSum, 1000.0, "spiral length versus chord sum");
    ck.testCoordinate(c.curveLength(), trapezoidSum, "spiral length versus trapezoid sum");

    ck.checkpoint("CurvePrimitive.TransitionSpiral");
    expect(ck.getNumErrors()).equals(0);
  });
});

function testSamples(_ck: Checker, samples: any[], maxEcho: number = 0) {
  let s0 = "UNDEFINED";
  let n0 = 0;
  // whatever is in samples:
  // 1) If it has toJSON method, write that to console
  // 2) Otherwise try IModelJson . .
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (i < maxEcho) {
      if (s.toJSON)
        console.log(`from toJSON(): ${JSON.stringify(s.toJSON())}`);
      else {
        const json = IModelJson.Writer.toIModelJson(s);
        if (json)
          console.log("IModelJson.Writer.toIModelJson:", prettyPrint(json));
      }
    }

    const s1 = s.constructor.name;
    // s.consecutive;
    if (s1 !== s0) {
      if (n0 > 0) {
        console.log([s0, n0]);
        n0 = 0;
      }
    }
    n0++;
    s0 = s1;
  }
  if (n0 !== 0)
    console.log([s0, n0]);
}
describe("Samples", () => {
  it("Counts", () => {
    const ck = new Checker();
    testSamples(ck, Sample.point2d);
    testSamples(ck, Sample.point3d);
    testSamples(ck, Sample.createMatrix4ds());
    testSamples(ck, Sample.createRange3ds());
    testSamples(ck, Sample.createSmoothCurvePrimitives());
    testSamples(ck, Sample.createSimplePaths(false));
    testSamples(ck, Sample.createSimpleLoops());

    // testSamples(ck, Sample.createSimpleXYPointLoops());
    testSamples(ck, Sample.createSimpleParityRegions());
    testSamples(ck, Sample.createSimpleUnions());
    testSamples(ck, Sample.createSimpleLinearSweeps());
    testSamples(ck, Sample.createSimpleRotationalSweeps());
    testSamples(ck, Sample.createSpheres());
    testSamples(ck, Sample.createCones());
    testSamples(ck, Sample.createTorusPipes());
    testSamples(ck, Sample.createBoxes());
    testSamples(ck, Sample.createRuledSweeps());
    testSamples(ck, Sample.createSimpleIndexedPolyfaces(1));
    testSamples(ck, Sample.createClipPlanes());
    ck.checkpoint("Samples");
    expect(ck.getNumErrors()).equals(0);
  });
});

/** starting at startIndex, look for index of a CurveLocationDetail with matching point.
 * @returns Return index where found, or data.length if not found.
 */
function findPointInCLDArray(point: Point3d, data: CurveLocationDetail[], startIndex: number): number {
  for (let i = startIndex; i < data.length; i++) {
    if (point.isAlmostEqual(data[i].point)) return i;
  }
  return data.length;
}

/** test curve interval role against allowable values */
function testCurveIntervalRole(
  ck: Checker,
  cld: CurveLocationDetail,
  values: CurveIntervalRole[]): boolean {
  const value = cld.intervalRole;
  for (const v of values)
    if (v === value) return true;
  ck.announceError("Expect CurveIntervalRole value", cld, values);
  return false;
}
describe("Linestring3dSpecials", () => {
  it("frenetFrame", () => {
    const ck = new Checker();
    const a = 0.02;
    const ax = 2 * a;
    const ay = a;
    const az = a;
    const geometry = [];
    for (const linestring of [
      LineString3d.create(
        Point3d.create(0, 0, 0),
        Point3d.create(1, 0, 0),  // pure X
        Point3d.create(1, 1, 0),  // pure Y
        Point3d.create(4, 2, 1),  // everything tilts
        Point3d.create(8, 1, 0)), // dive down
      LineString3d.createRegularPolygonXY(Point3d.create(0, 10, 0), 7, 3.0, true)]) {
      geometry.push(linestring);
      const df = 0.125 / (linestring.numPoints() - 1);
      for (let fraction = 0; fraction <= 1.0000001; fraction += df) {
        const frame0 = linestring.fractionToFrenetFrame(fraction)!;
        geometry.push(LineString3d.create(frame0.origin,
          frame0.multiplyXYZ(ax, 0, 0),
          frame0.multiplyXYZ(0, ay, 0),
          frame0.multiplyXYZ(0, -ay, 0),
          frame0.multiplyXYZ(ax, 0, 0),
          frame0.multiplyXYZ(0, 0, az),
          frame0.origin));
        const tangent = linestring.fractionToPointAndUnitTangent(fraction);
        ck.testPerpendicular(tangent.direction, frame0.matrix.columnZ());
      }
    }
    GeometryCoreTestIO.saveGeometry(geometry, "Linestring3d", "fractionToFrenetFrame");
    ck.checkpoint("Linestring3dSpecials.FrenetFrame");
    expect(ck.getNumErrors()).equals(0);
  });

  it("appendPlaneIntersections", () => {
    const ck = new Checker();
    const linestring = LineString3d.create();
    Sample.appendPhases(linestring, 3, Vector3d.create(2, 0, 0), Vector3d.create(3, 1, 0), Vector3d.create(2, 0.4, 0.1));

    // this linestring proceeds "forward" so that planes perpendicular to segment interior points will have only one intersection !!!
    const numSegment = linestring.numPoints() - 1;
    const segmentFraction = 0.25;
    for (let i = 0; i < numSegment; i++) {
      const globalFraction = (i + segmentFraction) / numSegment;
      const pointOnSegment = linestring.fractionToPointAndUnitTangent((i + segmentFraction) / numSegment);
      const plane = Plane3dByOriginAndUnitNormal.create(pointOnSegment.origin, pointOnSegment.direction);
      const intersections = new Array<CurveLocationDetail>();
      linestring.appendPlaneIntersectionPoints(plane!, intersections);
      if (ck.testExactNumber(1, intersections.length, `Expect single intersection ${i}`)
        && ck.testCoordinate(globalFraction, intersections[0].fraction, `intersection fraction on segment ${i}`)
        && ck.testPoint3d(plane!.getOriginRef(), intersections[0].point, `intersection point on segment ${i}`)) {
        // all ok!!
      } else {
        intersections.length = 0;
        linestring.appendPlaneIntersectionPoints(plane!, intersections);
      }
    }
    // inspect each set of 3 successive points.
    // make a plane through the three points.
    // expect to find each of the 3 points in the intersection list.
    for (let i = 0; i + 2 < numSegment; i++) {
      const point0 = linestring.pointAt(i)!;
      const point1 = linestring.pointAt(i + 1)!;
      const point2 = linestring.pointAt(i + 2)!;
      const plane3 = Plane3dByOriginAndUnitNormal.create(point0, point0.crossProductToPoints(point1, point2));
      if (plane3) {
        const intersections = new Array<CurveLocationDetail>();
        linestring.appendPlaneIntersectionPoints(plane3, intersections);
        if (ck.testLE(3, intersections.length, "Expect 3 intersection points")) {
          const index0 = findPointInCLDArray(point0, intersections, 0);
          const index1 = findPointInCLDArray(point1, intersections, index0);
          const index2 = findPointInCLDArray(point2, intersections, index1);
          if (ck.testExactNumber(index0 + 1, index1, "consecutive points in intersection list.")
            && ck.testExactNumber(index1 + 1, index2, "consecutive points in intersection list.")) {
            // when inspecting the intervalRole, allow for ends to be subsumed by larger intervals.
            testCurveIntervalRole(ck, intersections[index0], [CurveIntervalRole.intervalStart, CurveIntervalRole.intervalInterior]);
            testCurveIntervalRole(ck, intersections[index1], [CurveIntervalRole.intervalInterior]);
            testCurveIntervalRole(ck, intersections[index2], [CurveIntervalRole.intervalEnd, CurveIntervalRole.intervalInterior]);
          }
        }
      }
    }

    ck.checkpoint("Linestring3d.appendPlaneIntersections");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("CoordinateXYZ", () => {
  it("Hello", () => {
    const ck = new Checker();
    const pointS = Point3d.create(10, 0, 0);
    const scale = 2.0;
    const transform = Transform.createScaleAboutPoint(pointS, scale);
    const coordinateA = CoordinateXYZ.create(Point3d.create(1, 2, 3));
    const coordinateB = coordinateA.clone();
    if (ck.testPointer(coordinateB) && coordinateB instanceof CoordinateXYZ) {
      const coordinateC = coordinateA.cloneTransformed(transform) as CoordinateXYZ;
      ck.testPoint3d(coordinateA.point, coordinateB.point);
      const distanceAC = pointS.distance(coordinateC.point);
      ck.testCoordinate(scale * pointS.distance(coordinateA.point), distanceAC);
      const range = coordinateA.range();
      coordinateC.extendRange(range);
      // with only 2 points, the range diagonal must join the points . . .
      ck.testTrue(coordinateA.isSameGeometryClass(coordinateC));
      ck.testFalse(coordinateA.isAlmostEqual(coordinateC));
      ck.testTrue(coordinateA.isAlmostEqual(coordinateB));
    }

    ck.checkpoint("CoordinateXYZ.Hello");
    expect(ck.getNumErrors()).equals(0);
  });
});

// compare fractionToPoint and curveLengthBetweenFractions for curves that are supposed to have identical parameterizations.
// EXAMPLE:   (a) LineString3d with equal length segments (b) CurveChainWithDistanceIndex with each of those segments as an independent LineSegment3d.
function compareIsomorphicCurves(ck: Checker, curveA: CurvePrimitive, curveB: CurvePrimitive) {
  const fractions = [0.0, 0.125, 0.55, 0.882, 1.0];
  for (const fraction of fractions) {
    const pointA = curveA.fractionToPoint(fraction);
    const pointB = curveB.fractionToPoint(fraction);
    if (!ck.testPoint3d(pointA, pointB, ` compare at fraction ${fraction}`))
      curveB.fractionToPoint(fraction);
  }
  const intervalFractions = [0.0, 0.4, 0.2, 0.9, 1.0, 0.3];
  for (let i = 0; i + 1 < intervalFractions.length; i++) {
    const f0 = intervalFractions[i];
    const f1 = intervalFractions[i + 1];
    const lengthA = curveA.curveLengthBetweenFractions(f0, f1);
    const lengthB = curveB.curveLengthBetweenFractions(f0, f1);
    if (!ck.testCoordinate(lengthA, lengthB, `curveLengthBetweenFractions (${f0},${f1}`)) {
      curveA.curveLengthBetweenFractions(f0, f1);
      curveB.curveLengthBetweenFractions(f0, f1);
    }
  }
}
describe("IsomorphicCurves", () => {
  it("Hello", () => {
    const ck = new Checker();
    const options1 = StrokeOptions.createForCurves();
    options1.maxEdgeLength = 0.5;
    for (const options of [undefined, options1]) {
      const allPoints = [
        Point3d.create(0, 0, 0),
        Point3d.create(1, 0, 0),
        Point3d.create(2, 0, 0),
        Point3d.create(2, 1, 0)];
      for (let numPoints = 2; numPoints <= allPoints.length; numPoints++) {
        // console.log("Isomorphic LineString (" + numPoints + ")");
        // assemble leading numPoints part of allPoints ...
        const currentPoints = [allPoints[0]];
        for (let i = 1; i < numPoints; i++)
          currentPoints.push(allPoints[i]);
        const linestring = LineString3d.create(currentPoints);
        const path = Path.create();
        // console.log(prettyPrint(currentPoints));
        for (let i = 0; i + 1 < currentPoints.length; i++) {
          path.tryAddChild(LineSegment3d.create(currentPoints[i], currentPoints[i + 1]));
        }
        const chain = CurveChainWithDistanceIndex.createCapture(path, options)!;
        compareIsomorphicCurves(ck, linestring, chain);
      }
    }
    ck.checkpoint("IsomorphicCurves.Hello");
    expect(ck.getNumErrors()).equals(0);

  });
});

describe("CylindricalRange", () => {
  it("Hello", () => {
    const ck = new Checker();
    const options = StrokeOptions.createForCurves();
    options.chordTol = 0.01;
    const curves = Sample.createSimplePaths(false);
    for (const c of curves) {
      const strokes = c.cloneStroked();
      for (const ray of [
        Ray3d.createXYZUVW(0, 0, 0, 1, 0, 0),
        Ray3d.createXYZUVW(1, 2, 4, 3, 1, 5)]) {
        const vector1 = CylindricalRangeQuery.computeMaxVectorFromRay(ray, c);
        ck.testPointer(vector1);
        const vector2 = CylindricalRangeQuery.computeMaxVectorFromRay(ray, strokes);
        ck.testPointer(vector2);
        const d1 = vector1.magnitude();
        const d2 = vector2.magnitude();
        // stroked range should be smaller.  But cylindricalRangeQuery uses strokes.  Be fluffy . ..
        const e = Math.abs(d1 - d2);
        ck.testLE(e, 2.0 * options.chordTol);
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });
});
describe("GeometryQuery", () => {
  it("Obscure Coverage.", () => {
    const ck = new Checker();
    const sg = LineSegment3d.createXYXY(1, 2, 5, 4);
    const ls = LineString3d.create(Point3d.create(1, 1, 2), Point3d.create(4, 2, 1));
    ck.testUndefined(ls.children, "linestring has no children -- expected undefined from base class");
    const pathA = Path.create(sg);
    const pathB = Path.create(ls, sg);
    const pathC = Path.create();   // empty !!!
    ck.testFalse(pathA.isAlmostEqual(pathB));
    ck.testFalse(pathA.isAlmostEqual(ls));
    ck.testFalse(pathA.isAlmostEqual(pathC));
    ck.testTrue(pathC.isAlmostEqual(pathC));

    expect(ck.getNumErrors()).equals(0);
  });

  it("CurvePrimitive", () => {
    const ck = new Checker();
    ck.testUndefined(CurveCollection.createCurveLocationDetailOnAnyCurvePrimitive(undefined, 0.5));
    ck.testUndefined(CurveCollection.createCurveLocationDetailOnAnyCurvePrimitive(Sphere.createCenterRadius(Point3d.create(0, 0, 0), 2)));
    const path = Path.create(LineSegment3d.createXYXY(1, 2, 3, 4));
    ck.testUndefined(path.getChild(-1));
    ck.testUndefined(path.getChild(3));
    expect(ck.getNumErrors()).equals(0);
  });
});
