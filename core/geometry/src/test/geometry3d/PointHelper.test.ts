/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Arc3d } from "../../curve/Arc3d";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Loop } from "../../curve/Loop";
import { StrokeOptions } from "../../curve/StrokeOptions";
import { Geometry } from "../../Geometry";
import { Angle } from "../../geometry3d/Angle";
import { FrameBuilder } from "../../geometry3d/FrameBuilder";
import { GrowableXYZArray } from "../../geometry3d/GrowableXYZArray";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/Plane3dByOriginAndUnitNormal";
import { Point2d, Vector2d } from "../../geometry3d/Point2dVector2d";
import { Point3dArrayCarrier } from "../../geometry3d/Point3dArrayCarrier";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { NumberArray, Point2dArray, Point3dArray, Point4dArray, Vector3dArray } from "../../geometry3d/PointHelpers";
import { PolygonOps } from "../../geometry3d/PolygonOps";
import { Range3d } from "../../geometry3d/Range";
import { Ray3d } from "../../geometry3d/Ray3d";
import { Transform } from "../../geometry3d/Transform";
import { Matrix4d } from "../../geometry4d/Matrix4d";
import { MomentData } from "../../geometry4d/MomentData";
import { Point4d } from "../../geometry4d/Point4d";
import { Sample } from "../../serialization/GeometrySamples";
import { HalfEdgeGraph } from "../../topology/Graph";
import { HalfEdgeGraphSearch } from "../../topology/HalfEdgeGraphSearch";
import { Triangulator } from "../../topology/Triangulation";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";

/* eslint-disable no-console */
/* eslint-disable deprecation/deprecation */
/**
 * Return the radius of a circle with area matching centroidData.a
 * @param centroidData result of centroid calculation, with "a" property.
 */
function equivalentCircleRadius(centroidData: Ray3d): number {
  return Math.sqrt(centroidData.a === undefined ? 0.0 : centroidData.a / Math.PI);
}
describe("FrameBuilder", () => {
  it("HelloWorld", () => {
    const ck = new Checker();
    const builder = new FrameBuilder();
    ck.testFalse(builder.hasOrigin, "frameBuilder.hasOrigin at start");

    for (const points of [
      [Point3d.create(0, 0, 0), Point3d.create(1, 0, 0), Point3d.create(0, 1, 0)], [Point3d.create(0, 0, 0), Point3d.create(1, 0, 0),
        /* */ Point3d.create(1, 1, 0)], [Point3d.create(1, 2, -1), Point3d.create(1, 3, 5), Point3d.create(-2, 1, 7)],
    ]) {
      builder.clear();
      const point0 = points[0];
      const point1 = points[1];
      const point2 = points[2];
      ck.testUndefined(builder.getValidatedFrame(), "frame in progress");
      const count0 = builder.announcePoint(point0);
      const count1 = builder.announcePoint(point0); // exercise the quick out.
      ck.testExactNumber(count0, count1, "repeat point ignored");
      ck.testTrue(builder.hasOrigin, "frameBuilder.hasOrigin with point");
      ck.testUndefined(builder.getValidatedFrame(), "no frame for minimal data");
      ck.testUndefined(builder.getValidatedFrame(), "frame in progress");

      builder.announcePoint(point1);
      ck.testUndefined(builder.getValidatedFrame(), "frame in progress");
      ck.testCoordinate(1, builder.savedVectorCount(), "expect 1 good vector");
      ck.testUndefined(builder.getValidatedFrame(), "frame in progress");

      builder.announcePoint(point2);
      ck.testUndefined(builder.getValidatedFrame(true), "frame in progress");
      const rFrame = builder.getValidatedFrame(false);
      if (ck.testPointer(rFrame, "expect right handed frame") && rFrame
        && ck.testBoolean(true, rFrame.matrix.isRigid(), "good frame")) {
        const inverse = rFrame.inverse();
        if (ck.testPointer(inverse, "invertible frame") && inverse) {
          const product = rFrame.multiplyTransformTransform(inverse);
          ck.testBoolean(true, product.isIdentity, "correct inverse");
          const q0 = inverse.multiplyPoint3d(point0);
          const q1 = inverse.multiplyPoint3d(point1);
          const q2 = inverse.multiplyPoint3d(point2);
          ck.testCoordinate(0.0, q0.x, "point0 is origin");
          ck.testCoordinate(0.0, q0.y, "point0 is origin");
          ck.testCoordinate(0.0, q0.z, "point0 is origin");
          ck.testCoordinate(0.0, q1.y, "point1 on x axis");
          ck.testCoordinate(0.0, q1.z, "point1 on x axis");
          ck.testCoordinate(0.0, q2.z, "point2 on xy plane");
          ck.testCoordinateOrder(0.0, q2.y, "point1 in positive y plane");
        }
      }
    }
    ck.checkpoint("FrameBuilder");
    expect(ck.getNumErrors()).equals(0);
  });

  it("createFrameWithCCWPolygon", () => {
    const ck = new Checker();
    ck.testUndefined(FrameBuilder.createFrameWithCCWPolygon([
      Point3d.create(1, 2, 3)]), "detect incomplete frame data");
    ck.testUndefined(FrameBuilder.createFrameWithCCWPolygon([
      Point3d.create(1, 2, 3), Point3d.create(1, 2, 3), Point3d.create(1, 2, 3)]), "detect singular frame data");

    const triangle0 = [Point3d.create(1, 0), Point3d.create(0, 1), Point3d.create(0, 0)];
    const triangle1 = Point3dArray.clonePoint3dArray(triangle0);
    triangle1.reverse();
    const frame0 = FrameBuilder.createFrameWithCCWPolygon(triangle0);
    const frame1 = FrameBuilder.createFrameWithCCWPolygon(triangle1);
    if (ck.testDefined(frame0) && ck.testDefined(frame1) && frame0 && frame1) {
      const unitZ0 = frame0.matrix.columnZ();
      const unitZ1 = frame1.matrix.columnZ();
      ck.testCoordinate(-1, unitZ0.dotProduct(unitZ1), "opposing unit Z vectors");
    }

    expect(ck.getNumErrors()).equals(0);
  });

  it("TrilinearMap", () => {
    const ck = new Checker();
    const range = Range3d.create(Point3d.create(1, 2, 3), Point3d.create(4, 7, 8));
    const points = range.corners();
    for (const uvw of [Point3d.create(0.4, 0.2, 0.3), Point3d.create(0, 0, 0)]) {
      const q0 = range.fractionToPoint(uvw.x, uvw.y, uvw.z);
      const q1 = Point3dArray.evaluateTrilinearPoint(points, uvw.x, uvw.y, uvw.z);
      ck.testPoint3d(q0, q1, "Trilinear map versus range fractions");
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("PointHelperMisc", () => {
    const ck = new Checker();
    ck.testTrue(Point2dArray.isAlmostEqual(undefined, undefined));
    ck.testTrue(Point3dArray.isAlmostEqual(undefined, undefined));
    ck.testTrue(Vector3dArray.isAlmostEqual(undefined, undefined));
    const emptyArray = Point3dArray.cloneWithMaxEdgeLength([], 1);
    ck.testExactNumber(0, emptyArray.length);
    expect(ck.getNumErrors()).equals(0);
  });

});

// ASSUME pointsA is planar with at least 3 points, and first turn is left.
// (Therefore first cross product is its normal)
function testCentroidNormal(ck: Checker, pointsA: Point3d[], expectedArea: number) {
  // console.log ("\n\n testCentroidNormal", pointsA);
  const normalA = pointsA[0].crossProductToPoints(pointsA[1], pointsA[2]);
  for (const transform of Sample.createRigidTransforms()) {
    const normalB = transform.multiplyVector(normalA);
    const pointsB = transform.multiplyPoint3dArray(pointsA);
    const pointsQ = GrowableXYZArray.create(pointsB);
    // console.log (" transform", transform);
    // console.log (" pointsB", pointsB);
    ck.testCoordinate(normalA.magnitude(), normalB.magnitude(), "rigid transform");
    const normalC = PolygonOps.areaNormal(pointsB);
    const areaC = PolygonOps.area(pointsB);
    ck.testCoordinate(areaC, normalC.magnitude(), "area normal magnitude matches area");
    const normalQ = PolygonOps.areaNormalGo(pointsQ)!;
    PolygonOps.areaNormalGo(pointsQ, normalQ);
    ck.testVector3d(normalC, normalQ);
    const ray = PolygonOps.centroidAreaNormal(pointsB);
    if (ck.testParallel(normalB, normalC, "polygon normal", transform)
      && ck.testCoordinate(expectedArea, normalC.magnitude())
      && ck.testPointer(ray, "area computed") && ray && ray.a)
      ck.testCoordinate(expectedArea, ray.a);
  }
}
describe("PointHelper.centroid", () => {
  it("PointHelper.centroid", () => {
    const ck = new Checker();
    for (const pointsA of Sample.createSimpleXYPointLoops()) {
      const areaXY = PolygonOps.areaXY(pointsA);
      testCentroidNormal(ck, pointsA, areaXY);
    }

    ck.checkpoint("PointHelper.centroid");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("MomentData.HelloWorld", () => {
  it("PointHelper.annotateClusters", () => {
    const ck = new Checker();
    // Checker.noisy.momentData = true;

    // Test undefined/empty returns
    const mData = MomentData.pointsToPrincipalAxes([])!;
    ck.testTrue(mData.origin.isAlmostZero);
    const tempMatrix = Matrix4d.createRowValues(1, 1, 1, 0,
      1, 1, 1, 0,
      1, 1, 1, 0,
      1, 1, 1, 0);
    ck.testUndefined(MomentData.inertiaProductsToPrincipalAxes(Point3d.create(1, 2, 3), tempMatrix));
    mData.origin = Point3d.create(1, 2, 3);
    mData.clearSums();
    ck.testTrue(mData.origin.x === 0 && mData.origin.y === 0 && mData.origin.z === 0);

    // make an ellipse.
    // stroke it with a multiple of 4 chords so points are symmetric and major/minor axis points are there.
    // compute principal moments and axes of the points.
    const radiusB = 1.0;
    for (const radiusA of [1, 2, 3.5]) {
      for (const degreesY of [0, 10, 78]) {
        for (const degreesZ of [0, -5, 20]) {
          const rotateZ = Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createDegrees(degreesZ)) as Matrix3d;
          const rotateY = Matrix3d.createRotationAroundVector(Vector3d.unitY(), Angle.createDegrees(degreesY)) as Matrix3d;
          const axes0 = rotateY.multiplyMatrixMatrix(rotateZ);

          const arc = Arc3d.createXYEllipse(Point3d.create(0, 0), radiusA, radiusB);
          arc.tryTransformInPlace(Transform.createFixedPointAndMatrix(Point3d.create(1, 0, 0), axes0));

          if (Checker.noisy.momentData) {
            console.log("******************************");
            console.log("   Data rotation degrees Y*Z*data", degreesY, degreesZ);
            console.log("            X", axes0.columnX());
            console.log("            Y", axes0.columnY());
            console.log("            Z", axes0.columnZ());
            console.log("   Radius ratio", radiusA);
            console.log("Arc center", arc.center);
          }
          const ls = LineString3d.create();
          const options = StrokeOptions.createForCurves();
          options.minStrokesPerPrimitive = 16;
          arc.emitStrokes(ls, options);
          ls.popPoint(); // eliminate the closure point -- now the center really is the centroid
          const moments = MomentData.pointsToPrincipalAxes(ls.points)!;
          if (Checker.noisy.momentData) {
            console.log("RawMoments Diagonal", moments.sums.diagonal().toJSON());
            console.log("origin", moments.localToWorldMap.origin);
            console.log("X", moments.localToWorldMap.matrix.columnX());
            console.log("Y", moments.localToWorldMap.matrix.columnY());
            console.log("Z", moments.localToWorldMap.matrix.columnZ());
            console.log("radius", moments.radiusOfGyration.toJSON());
          }
          ck.testPoint3d(arc.center, moments.origin, "Moment centroid matches ellipse");
          ck.testTrue(moments.radiusOfGyration.x <= moments.radiusOfGyration.y, "Moment.x <= moment.y");
          ck.testTrue(moments.radiusOfGyration.y <= moments.radiusOfGyration.z, "Moment.y <= moment.z");
          const principalZ = moments.localToWorldMap.matrix.columnZ();
          ck.testTrue(principalZ.isPerpendicularTo(axes0.columnX()), "principal Z perp X");
          ck.testTrue(principalZ.isPerpendicularTo(axes0.columnY()), "principal Z perp Z");
          ck.testCoordinate(Math.max(radiusA, radiusB) / Math.min(radiusA, radiusB),
            moments.radiusOfGyration.y / moments.radiusOfGyration.x,
            "Radii for Symmetric points on ellipse scale as axis lengths");
          if (Geometry.isAlmostEqualNumber(radiusA, radiusB)) {
            ck.testCoordinate(radiusA, moments.radiusOfGyration.z, "Circle radius Of gyration is radius");
            // extra call for debugger . . .
            MomentData.pointsToPrincipalAxes(ls.points)!;

          }
        }
      }
    }

    const axes122 = Matrix3d.createScale(2, 1, 2);
    const momentsXYZ = Vector3d.create(2, 1, 2);
    MomentData.sortColumnsForIncreasingMoments(axes122, momentsXYZ);
    ck.checkpoint("MomentData.HelloWorld");

    ck.testExactNumber(1, momentsXYZ.at(0));
    ck.testExactNumber(2, momentsXYZ.at(1));
    ck.testExactNumber(2, momentsXYZ.at(2));
    ck.testCoordinate(1, axes122.columnXMagnitude());
    ck.testCoordinate(2, axes122.columnYMagnitude());
    ck.testCoordinate(2, axes122.columnZMagnitude());
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("PolygonOps", () => {
  it("PolygonClip", () => {
    const ck = new Checker();
    // Coordinates rigged to make it easy to have "exact" hits of x,y lines at 0, 1, or 2 vertices
    const ay = 5;
    const ax1 = 8;
    const ax0 = 0.0;
    const ax2 = 10.0; // depend on --------ax0--------ax1========ax2---- with edge along the ====
    const points = [
      Point2d.create(ax0, 0),
      Point2d.create(ax2, 0),
      Point2d.create(ax2, ay),
      Point2d.create(ax1, ay),
      Point2d.create(ax1, 8),
      Point2d.create(ax0, 8),
      Point2d.create(ax0, 0)];
    const points3d = [];
    for (const p of points)
      points3d.push(Point3d.create(p.x, p.y));
    const carrier = new Point3dArrayCarrier(points3d);
    const q = 0.1;
    const onEdge = Point2d.create(0, 1);
    ck.testExactNumber(0, PolygonOps.classifyPointInPolygon(onEdge.x, onEdge.y, points)!);
    const easyIn = Point2d.create(1, 1);
    const easyOut = Point2d.create(20, 20);
    const xHit = Point2d.create(2, ay);
    const yHit = Point2d.create(ax1, 2);
    const xyHit = Point2d.create(ax1, ay);
    ck.testExactNumber(1, PolygonOps.classifyPointInPolygon(easyIn.x, easyIn.y, points)!, "IN with no vertex hits");
    ck.testExactNumber(-1, PolygonOps.classifyPointInPolygon(easyOut.x, easyOut.y, points)!, "OUT with no vertex hits");
    ck.testExactNumber(-1, PolygonOps.classifyPointInPolygon(-1, 0, points)!, "OUT by simple X");
    ck.testExactNumber(-1, PolygonOps.classifyPointInPolygon(20, 0.5, points)!, "OUT by simple X");
    ck.testExactNumber(-1, PolygonOps.classifyPointInPolygon(1, -0.5, points)!, "OUT by simple Y");
    ck.testExactNumber(-1, PolygonOps.classifyPointInPolygon(1, 14.5, points)!, "OUT by simple Y");

    ck.testExactNumber(1, PolygonOps.classifyPointInPolygon(xHit.x, xHit.y, points)!, "IN with horizontal vertex hits");
    ck.testExactNumber(1, PolygonOps.classifyPointInPolygon(yHit.x, yHit.y, points)!, "IN with vertical vertex hits");
    ck.testExactNumber(0, PolygonOps.classifyPointInPolygon(xyHit.x, xyHit.y, points)!, "ON with xy vertex hits");
    ck.testExactNumber(-1, PolygonOps.classifyPointInPolygon(easyOut.x, easyOut.y, points)!);
    ck.testExactNumber(-1, PolygonOps.classifyPointInPolygon(ax1 + q, ay + q, points)!);

    ck.testExactNumber(1, PolygonOps.classifyPointInPolygonXY(xHit.x, xHit.y, carrier)!, "IN with horizontal vertex hits");
    ck.testExactNumber(1, PolygonOps.classifyPointInPolygonXY(yHit.x, yHit.y, carrier)!, "IN with vertical vertex hits");
    ck.testExactNumber(0, PolygonOps.classifyPointInPolygonXY(xyHit.x, xyHit.y, carrier)!, "ON with xy vertex hits");
    ck.testExactNumber(-1, PolygonOps.classifyPointInPolygonXY(easyOut.x, easyOut.y, carrier)!);
    ck.testExactNumber(-1, PolygonOps.classifyPointInPolygonXY(ax1 + q, ay + q, carrier)!);

    ck.testExactNumber(0, PolygonOps.testXYPolygonTurningDirections([]));

    for (let x = -1.5; x < 14; x += 1.0) {
      const classification = PolygonOps.classifyPointInPolygon(x, ay, points)!;
      if (x < ax0 || x > ax2)
        ck.testExactNumber(-1, classification, `Expect OUT ${x}`);
      else if (x > ax0 && x < ax1)
        ck.testExactNumber(1, classification, `Expect IN ${x}`);
      else if (x >= ax1 && x <= ax2)
        ck.testExactNumber(0, classification, `Expect ON ${x}`);
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("DegenerateInOut", () => {
    const ck = new Checker();
    const pointsOnXAxis = [Point3d.create(1, 0, 0), Point3d.create(2, 0, 0), Point3d.create(3, 0, 0)];
    ck.testUndefined(PolygonOps.classifyPointInPolygon(0, 0, pointsOnXAxis));
    ck.testUndefined(PolygonOps.classifyPointInPolygonXY(0, 0, new Point3dArrayCarrier(pointsOnXAxis)));
    expect(ck.getNumErrors()).equals(0);
  });

  it("SquareWaveInOut", () => {
    const ck = new Checker();
    // Coordinates rigged to make it easy to have "exact" hits of x,y lines at 0, 1, or 2 vertices
    const dxLow = 4.0;
    const dxHigh = 1.0;
    const dyWave = 0.25;
    const points = Sample.createSquareWave(Point3d.create(0, 0), dxLow, dyWave, dxHigh, 4, 2);
    const graph = new HalfEdgeGraph();
    const faceSeed = Triangulator.createFaceLoopFromCoordinates(graph, points, true, false)!;

    // useful tidbit ...if a horizontal edge is short (dxHigh) things just before and after are IN.  Otherwise OUT
    // if a vertical edge is short (dxWave), we know IN just above and OUT just below
    // if a vertical edge is long, we know OUT both above and below
    //
    const delta = 0.1;
    for (let i = 0; i + 1 < points.length; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const p = p0.interpolate(0.234234, p1);
      ck.testExactNumber(0, PolygonOps.classifyPointInPolygon(p.x, p.y, points)!, "mid-edge point");

      if (p0.y === p1.y) {
        const xA = Math.min(p0.x, p1.x) - delta;
        const xB = Math.max(p0.x, p1.x) + delta;
        const expected = Math.abs(p1.x - p0.x) === dxHigh ? 1 : -1;
        ck.testExactNumber(expected, PolygonOps.classifyPointInPolygon(xA, p.y, points)!, "xA point", xA, p0.y);
        ck.testExactNumber(expected, HalfEdgeGraphSearch.pointInOrOnFaceXY(faceSeed, xA, p.y)!, "xA point", xA, p0.y);
        ck.testExactNumber(expected, PolygonOps.classifyPointInPolygon(xB, p.y, points)!, "xB point", xB, p0.y);
        ck.testExactNumber(expected, HalfEdgeGraphSearch.pointInOrOnFaceXY(faceSeed, xB, p.y)!, "xB point", xB, p0.y);
      } else if (p0.x === p1.x) {
        const yA = Math.min(p0.y, p1.y);
        const yB = Math.max(p0.y, p1.y);
        const expectAtMax = yB === dyWave ? 1 : -1;
        ck.testExactNumber(-1, PolygonOps.classifyPointInPolygon(p0.x, yA - delta, points)!, "yA-delta point");
        ck.testExactNumber(expectAtMax, PolygonOps.classifyPointInPolygon(p0.x, yB + delta, points)!, "yB+delta  point");
      }
    }
    const perpendicularSign = [1, 0, -1];
    const perpendicularFraction = 0.01;

    for (let node0 = faceSeed; ;) {
      node0 = node0.faceSuccessor;
      for (const v of perpendicularSign) {
        const point = node0.fractionAlongAndPerpendicularToPoint2d(0.3, v * perpendicularFraction);
        const c0 = PolygonOps.classifyPointInPolygon(point.x, point.y, points)!;
        const c1 = HalfEdgeGraphSearch.pointInOrOnFaceXY(faceSeed, point.x, point.y)!;
        ck.testExactNumber(v, c0, "in/out in point array");
        ck.testExactNumber(v, c1, "in/out in graph face");
      }
      if (node0 === faceSeed)
        break;
    }
    expect(ck.getNumErrors()).equals(0);
  });

  /**
   * Build a wobbly polygon.
   * Test lots of to known left and right of edges.
   * Aside from the number of edges in the polygon, these are pretty easy tests -- there should be no vertex hits.
   */
  it("GeneralInOut", () => {
    const ck = new Checker();
    const points = Sample.createFractalDiamondConvexPattern(1, 0.34);
    const graph = new HalfEdgeGraph();
    const faceSeed = Triangulator.createFaceLoopFromCoordinates(graph, points, true, false)!;
    // NOTE -- do NOT test true mid edge points -- classifier is fragile on non-principal lines
    const perpendicularSign = [1, -1];
    const perpendicularFraction = 0.01;

    for (let node0 = faceSeed; ;) {
      node0 = node0.faceSuccessor;
      for (const v of perpendicularSign) {
        const point = node0.fractionAlongAndPerpendicularToPoint2d(0.3, v * perpendicularFraction);
        const c0 = PolygonOps.classifyPointInPolygon(point.x, point.y, points)!;
        const c1 = HalfEdgeGraphSearch.pointInOrOnFaceXY(faceSeed, point.x, point.y)!;
        ck.testExactNumber(v, c0, "in/out in point array");
        ck.testExactNumber(v, c1, "in/out in graph face");
      }
      if (node0 === faceSeed)
        break;
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("XYTurningDirections", () => {
    const ck = new Checker();
    for (const close of [false, true]) {
      // Note "star" construction with same inner and outer radius is a circle.
      const circle = Sample.createStar(1, 1, 0, 2, 2, 5, close);
      ck.testExactNumber(1, PolygonOps.testXYPolygonTurningDirections(circle), " CCW circle turn counts");
      circle.reverse();
      ck.testExactNumber(-1, PolygonOps.testXYPolygonTurningDirections(circle), " CW circle turn counts");

      const star = Sample.createStar(1, 2, 0, 5, 2, 5, close);
      ck.testExactNumber(0, PolygonOps.testXYPolygonTurningDirections(star), " CCW circle turn counts");
      star.reverse();
      ck.testExactNumber(0, PolygonOps.testXYPolygonTurningDirections(star), " CW circle turn counts");
    }
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("Point3dArray", () => {
  it("DistantPoints", () => {
    const ck = new Checker();
    ck.checkpoint("FrameBuilder");
    const pointsA = Sample.createGrowableArrayCirclePoints(1.0, 7, false, 0, 0);
    Sample.createGrowableArrayCirclePoints(3.5, 37, false, 1.2, 2.8, pointsA);
    const pointsB = pointsA.getPoint3dArray();
    const frame = FrameBuilder.createFrameToDistantPoints(pointsB);
    const noFrame = FrameBuilder.createFrameToDistantPoints([Point3d.create(0, 0, 0)]);
    ck.testUndefined(noFrame, "Expect undefined frame from 1 point");
    const spacePoint = Point3d.create(3, 2, 5);
    const spaceVector = Vector3d.create(-1, 2, 4);
    const resultVector = Vector3d.create();
    ck.testUndefined(Point3dArray.indexOfMostDistantPoint([], spacePoint, resultVector));
    ck.testUndefined(Point3dArray.indexOfPointWithMaxCrossProductMagnitude([], spacePoint, spaceVector, resultVector));

    if (ck.testPointer(frame, "frame to points") && frame) {
      const origin = frame.origin;
      const longVector = Vector3d.create();
      Point3dArray.indexOfMostDistantPoint(pointsB, origin, longVector);

      // We expect the frame encloses sll points with uv coordinates in [-1,1]
      const range = Range3d.createInverseTransformedArray(frame, pointsB);
      const e = 1.0e-14;
      const a = longVector.magnitude();
      const range1 = Range3d.createXYZXYZ(-a, -a, -e, a, a, e);
      ck.testTrue(range1.containsRange(range), "frame maps to -1,1");
    }

    expect(ck.getNumErrors()).equals(0);
  });

  it("MiscArrayOps", () => {
    const ck = new Checker();
    const pointsA = Sample.createFractalDiamondConvexPattern(1, -0.5);
    const frame = Transform.createFixedPointAndMatrix(Point3d.create(1, 2, 3),
      Matrix3d.createRotationAroundVector(Vector3d.create(0.3, -0.2, 1.2), Angle.createDegrees(15.7))!);
    frame.multiplyPoint3dArrayInPlace(pointsA);

    const map = FrameBuilder.createRightHandedLocalToWorld(pointsA);
    if (ck.testPointer(map, "Right Handed Map") && map) {
      const plane = Plane3dByOriginAndUnitNormal.create(
        map.getOrigin(), map.matrix.columnZ())!;
      ck.testTrue(Point3dArray.isCloseToPlane(pointsA, plane), "points in plane of frame");
    }

    const pointsB = Point3dArray.clonePoint3dArray(pointsA);
    ck.testTrue(Point3dArray.isAlmostEqual(pointsA, pointsB), "Point3dArray isAlmostEqual");
    frame.multiplyPoint3dArrayInPlace(pointsB);
    ck.testFalse(Point3dArray.isAlmostEqual(pointsA, pointsB), "Point3dArray isAlmostEqual after change to B");

    const xyzA = Point3dArray.packToFloat64Array(pointsA);
    const pointsA1 = Point3dArray.unpackNumbersToPoint3dArray(xyzA);
    ck.testTrue(Point3dArray.isAlmostEqual(pointsA, pointsA1), "pack and unpack");

    const points2dA = Point3dArray.clonePoint2dArray(pointsA);
    const points2dB = Point2dArray.clonePoint2dArray(points2dA);
    ck.testTrue(Point2dArray.isAlmostEqual(points2dA, points2dB), "Point2d array isAlmostEqual");
    const a = points2dB[0].clone();
    points2dB[0].x += 1;
    ck.testFalse(Point2dArray.isAlmostEqual(points2dA, points2dB), "Point2d array isAlmostEqual after coordinate change");
    points2dB[0] = a;
    ck.testTrue(Point2dArray.isAlmostEqual(points2dA, points2dB), "Point2d array isAlmostEqual");
    points2dB.pop();
    ck.testFalse(Point2dArray.isAlmostEqual(points2dA, points2dB), "Point2d array isAlmostEqual after pop");

    const vector3dA = Vector3dArray.cloneVector3dArray(pointsA);
    const vector3dB = Vector3dArray.cloneVector3dArray(vector3dA);
    ck.testTrue(Vector3dArray.isAlmostEqual(vector3dA, vector3dB), "Vector3dArray isAlmostEqual");
    vector3dA[Math.floor(vector3dA.length / 2)].x += 1.0;
    ck.testFalse(Vector3dArray.isAlmostEqual(vector3dA, vector3dB), "Vector3dArray isAlmostEqual after x change");

    expect(ck.getNumErrors()).equals(0);
  });

  it("Point4dArray", () => {
    const ck = new Checker();
    const pointsA = Sample.createFractalDiamondConvexPattern(1, -0.5);
    const frame = Transform.createFixedPointAndMatrix(Point3d.create(1, 2, 3),
      Matrix3d.createRotationAroundVector(Vector3d.create(0.3, -0.2, 1.2), Angle.createDegrees(15.7))!);
    frame.multiplyPoint3dArrayInPlace(pointsA);
    const weights = [];
    const amplitude = 0.25;
    const dTheta = 0.1;
    for (let i = 0; i < pointsA.length; i++)
      weights.push(1.0 + amplitude * Math.cos(i * dTheta));
    const xyzw = Point4dArray.packPointsAndWeightsToFloat64Array(pointsA, weights)!;
    ck.testExactNumber(4.0 * weights.length, xyzw.length, "Point4dArray.packToFloat64Array length");
    const point4dB = Point4dArray.unpackToPoint4dArray(xyzw);

    const point4dC = Point4dArray.unpackToPoint4dArray(xyzw);
    point4dC.pop();
    ck.testFalse(Point4dArray.isAlmostEqual(point4dB, point4dC));
    ck.testTrue(Point4dArray.isAlmostEqual(point4dB, point4dB));
    ck.testTrue(Point4dArray.isAlmostEqual(undefined, undefined));

    const xyzwB = Point4dArray.packToFloat64Array(point4dB);
    ck.testTrue(NumberArray.isExactEqual(xyzw, xyzwB), "packed point4d variants");
    xyzwB[3] += 1.0;
    ck.testFalse(NumberArray.isExactEqual(xyzw, xyzwB), "packed point4d variants");

    const pointsB: Point3d[] = [];
    const weightB: number[] = [];
    Point4dArray.unpackFloat64ArrayToPointsAndWeights(xyzw, pointsB, weightB);
    ck.testTrue(Point3dArray.isAlmostEqual(pointsA, pointsB), "point3d from point4d trips");
    ck.testTrue(NumberArray.isExactEqual(weights, weightB), "weights from point4d trips");

    const point4dBChanged = point4dB.map((x: Point4d) => x.clone());
    point4dBChanged[1].x = 0.213213;
    ck.testFalse(Point4dArray.isAlmostEqual(point4dB, point4dBChanged));
    expect(ck.getNumErrors()).equals(0);
  });

  it("Point4dArrayPlane", () => {
    const ck = new Checker();
    const center = Point4d.create(1, 2, 3, 1);
    const vector0 = Point4d.create(0, 3, 4, 6);
    const vector90 = Point4d.create(4, 2, -3, 2);
    const allPoints = [];
    const plane4d = Point4d.perpendicularPoint4dPlane(center, vector0, vector90);
    // confirm plane contains all 3 of the basis points . . .
    ck.testCoordinate(plane4d.dotProduct(center), 0);
    ck.testCoordinate(plane4d.dotProduct(vector0), 0);
    ck.testCoordinate(plane4d.dotProduct(vector90), 0);
    for (const degrees of [0, 30, 69, 123]) {
      const theta = Angle.createDegrees(degrees);
      const c = theta.cos();
      const s = theta.sin();
      allPoints.push(center.plus2Scaled(vector0, c, vector90, s));
    }
    const plane3d = plane4d.toPlane3dByOriginAndUnitNormal();
    if (ck.testPointer(plane3d)) {
      ck.testCoordinate(plane3d.altitudeXYZW(center.x, center.y, center.z, center.w), 0);
      ck.testCoordinate(plane3d.altitudeXYZW(vector0.x, vector0.y, vector0.z, vector0.w), 0);
      ck.testCoordinate(plane3d.altitudeXYZW(vector90.x, vector90.y, vector90.z, vector90.w), 0);
      ck.testTrue(Point4dArray.isCloseToPlane(allPoints, plane3d));
      // throw on another point sure to be off plane:
      allPoints.push(center.plusScaled(plane4d, 0.1));
      ck.testFalse(Point4dArray.isCloseToPlane(allPoints, plane3d));
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("ParityTests", () => {
    const ck = new Checker();
    const a = 5;
    const b = 2;
    const polygon = [
      Point2d.create(0, 0),
      Point2d.create(8, 0),
      Point2d.create(8, b),
      Point2d.create(a, b),
      Point2d.create(a, 6),
      Point2d.create(0, 6)];
    for (const p of polygon) {

      ck.testExactNumber(0, PolygonOps.classifyPointInPolygon(p.x, p.y, polygon)!);
    }

    // const pointA = Point2d.create(1, 2);
    // const pointB = Point2d.create(1.5, 0.2);
    // ck.testExactNumber(0, PolygonOps.oldParity(pointA, [pointA]));
    // ck.testExactNumber(-1, PolygonOps.oldParity(pointA, [pointB]));
    const radiansQ = 0.276234342921378;
    const vectorQ = Vector2d.create(Math.cos(radiansQ), Math.sin(radiansQ));
    const pointQ = polygon[3].plusScaled(vectorQ, -0.2);
    // make a polygon with exact pointQ hits for x,y, and the ("secret") special angle for secondary testing
    const polygonQ = [
      polygon[0],
      Point2d.create(pointQ.x, 0),
      polygon[1],
      Point2d.create(8, pointQ.y),
      polygon[2],
      polygon[3],
      polygon[4],
      polygon[5]];
    ck.testExactNumber(1, PolygonOps.classifyPointInPolygon(pointQ.x, pointQ.y, polygonQ)!);
    ck.testExactNumber(1, PolygonOps.classifyPointInPolygon(pointQ.x, pointQ.y, polygonQ)!);
    expect(ck.getNumErrors()).equals(0);
  });

  it("PolylineLength", () => {
    const ck = new Checker();
    const packedPoints = [
      0, 0, 0,
      2, 0, 0,
      2, 2, 0,
      2, 2, 2,
      0, 2, 2,
      0, 2, 0,
      0, 0, 0];

    const packed64 = new Float64Array(packedPoints);
    const points = Point3dArray.unpackNumbersToPoint3dArray(packed64);

    for (const addClosureEdge of [false, true]) {
      const a0 = Point3dArray.sumEdgeLengths(points, addClosureEdge);
      const a64 = Point3dArray.sumEdgeLengths(packed64, addClosureEdge);
      const transform = Sample.createMessyRigidTransform(Point3d.create(2, 5, 9));
      transform.multiplyPoint3dArrayInPlace(points);
      const a1 = Point3dArray.sumEdgeLengths(points, addClosureEdge);
      ck.testCoordinate(a1, a0, "rigid transform does not change distances");
      ck.testExactNumber(a0, a64);
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("Point3dArrayCarrierBadIndex", () => {
    const ck = new Checker();
    const carrier = new Point3dArrayCarrier([Point3d.create(1, 2, 3), Point3d.create(6, 2, 9), Point3d.create(6, 2, 0), Point3d.create(-4, 2, 8)]);
    const a = carrier.length;
    // These methods should return undefined if any index is bad.
    // (we know the index tests happen in a single validation function -- "some" calls need to test both extremes of out-of-bounds, but any particular arg only has to be tested in one direction)
    ck.testUndefined(carrier.getPoint3dAtCheckedPointIndex(-1));
    ck.testUndefined(carrier.getPoint3dAtCheckedPointIndex(a));
    ck.testUndefined(carrier.getVector3dAtCheckedVectorIndex(-1));
    ck.testUndefined(carrier.getVector3dAtCheckedVectorIndex(a));

    const cross = Vector3d.create();
    ck.testUndefined(carrier.accumulateCrossProductIndexIndexIndex(-1, 1, 3, cross));
    ck.testUndefined(carrier.accumulateCrossProductIndexIndexIndex(1, 21, 3, cross));
    ck.testUndefined(carrier.accumulateCrossProductIndexIndexIndex(1, 3, -1, cross));

    const origin = Point3d.create(1, 4, 2);

    ck.testUndefined(carrier.crossProductIndexIndexIndex(-1, 1, 3, cross));
    ck.testUndefined(carrier.crossProductIndexIndexIndex(1, 21, 3, cross));
    ck.testUndefined(carrier.crossProductIndexIndexIndex(1, 3, -1, cross));

    ck.testUndefined(carrier.crossProductXYAndZIndexIndex(origin, -1, 3, cross));
    ck.testUndefined(carrier.crossProductXYAndZIndexIndex(origin, 21, a, cross));

    ck.testUndefined(carrier.vectorIndexIndex(-1, 3));
    ck.testUndefined(carrier.vectorIndexIndex(1, 30));
    ck.testUndefined(carrier.vectorXYAndZIndex(origin, -1));
    ck.testPointer(carrier.vectorXYAndZIndex(origin, 1));

    const xyz1 = carrier.getPoint3dAtCheckedPointIndex(1)!;
    const xyz3 = carrier.getPoint3dAtCheckedPointIndex(3)!;
    const dA = carrier.distanceIndexIndex(1, 3);
    const dA2 = carrier.distanceSquaredIndexIndex(1, 3);
    ck.testFalse(dA === undefined);
    ck.testFalse(dA2 === undefined);
    ck.testCoordinate(xyz1.distanceSquared(xyz3), dA2!, "distance indexIndex in carrier");
    ck.testCoordinate(xyz1.distance(xyz3), dA!, "distance indexIndex in carrier");

    ck.testUndefined(carrier.distanceIndexIndex(0, 100));
    ck.testUndefined(carrier.distanceIndexIndex(1000, 0));

    ck.testUndefined(carrier.distanceSquaredIndexIndex(0, 100));
    ck.testUndefined(carrier.distanceSquaredIndexIndex(1000, 0));

    expect(ck.getNumErrors()).equals(0);
  });

  it("Point3dArrayCarrierPushPop", () => {
    const ck = new Checker();
    const carrierA = new Point3dArrayCarrier([]);
    const carrierB = new Point3dArrayCarrier([]);
    ck.testUndefined(carrierA.front(), "front() in empty array");
    ck.testUndefined(carrierA.back(), "back() in empty array");
    const zData = [10, 11, 12, 13, 14, 22];
    for (let k = 0; k < zData.length; k++) {
      carrierA.pushXYZ(k + 1, 2 * k + 5, zData[k]);
      carrierB.push(Point3d.create(k + 1, 2 * k + 5, zData[k]));
    }
    ck.testPoint3d(carrierA.front()!, carrierB.front()!);
    ck.testPoint3d(carrierA.back()!, carrierB.back()!);

    for (let k = 1; k < zData.length; k++) {
      carrierA.pop();
      carrierB.pop();
      ck.testPoint3d(carrierA.front()!, carrierB.front()!);
      ck.testPoint3d(carrierA.back()!, carrierB.back()!);
    }
    ck.testExactNumber(1, carrierA.length);
    ck.testExactNumber(1, carrierB.length);
    expect(ck.getNumErrors()).equals(0);
  });

  it("Point2dArray", () => {
    const ck = new Checker();
    const pointsA = Sample.createFractalDiamondConvexPattern(1, -0.5);
    const numA = pointsA.length;
    const numB = Point2dArray.pointCountExcludingTrailingWraparound(pointsA);
    ck.testExactNumber(0, Point2dArray.pointCountExcludingTrailingWraparound([]));
    ck.testExactNumber(numA, numB + 1);
    const centroid = Point2d.create();
    const pointsOnLine = [];
    for (const xRight of [1, 2, 4, 6]) {
      ck.testUndefined(PolygonOps.centroidAndAreaXY(pointsOnLine, centroid));
      pointsOnLine.push(Point2d.create(xRight, 0));
    }

    expect(ck.getNumErrors()).equals(0);
  });

  it("Vector3dArray", () => {
    const ck = new Checker();
    const arrayA = [];
    const arrayB = [];
    for (const i of [1, 2, 4, 3]) {
      const vector = Vector3d.create(i, i * i, i - 1);
      arrayA.push(vector);
      arrayB.push(vector.clone());
    }
    ck.testTrue(Vector3dArray.isAlmostEqual(arrayA, arrayB));
    arrayB.pop();
    ck.testFalse(Vector3dArray.isAlmostEqual(arrayA, arrayB));
    expect(ck.getNumErrors()).equals(0);
  });
  it("NumberArrayComparison", () => {
    const ck = new Checker();
    const dataA0 = [1, 2, 3, 4, 5];
    const dataA1 = new Float64Array([1, 2, 3, 4, 5]);
    const dataB0 = dataA0.map((x) => x);
    dataB0.pop();
    ck.testTrue(NumberArray.isAlmostEqual(dataA0, dataA1, 0.1));
    ck.testFalse(NumberArray.isAlmostEqual(dataA0, dataB0, 0.01));
    ck.testFalse(NumberArray.isExactEqual(dataA0, dataB0));
    ck.testFalse(NumberArray.isAlmostEqual(dataA0, [], 0.01));
    ck.testFalse(NumberArray.isAlmostEqual([], dataA0, 0.01));
    ck.testFalse(NumberArray.isAlmostEqual(dataA0, undefined, 0.01));
    ck.testFalse(NumberArray.isAlmostEqual(undefined, dataA0, 0.01));
    ck.testExactNumber(0, NumberArray.preciseSum([]));
    const e = 0.01;
    dataA1[3] += e;
    ck.testTrue(NumberArray.isAlmostEqual(dataA0, dataA1, 2 * e));
    ck.testFalse(NumberArray.isAlmostEqual(dataA0, dataA1, 0.5 * e));
    ck.testFalse(NumberArray.isCoordinateInArray(1, []));
    for (const x of dataA0) {
      ck.testTrue(NumberArray.isCoordinateInArray(x, dataA0));
      ck.testFalse(NumberArray.isCoordinateInArray(x + 0.1231897897, dataA0));
    }
    ck.testExactNumber(0, NumberArray.maxAbsArray([]));
    expect(ck.getNumErrors()).equals(0);
  });

  it("CentroidBranches", () => {
    const ck = new Checker();
    const pointsA = [Point3d.create(0, 0, 0), Point3d.create(1, 0, 0), Point3d.create(0, 4, 0)];
    const pointsC = pointsA.map((xyz: Point3d) => xyz.clone());
    pointsC.push(Point3d.create(0, 2, 0));    // more points, same normal and area!!!
    pointsC.push(Point3d.create(0, 1, 0));    // more points, same normal and area!!!

    const pointsB = Point3dArray.clonePoint3dArray(pointsA);
    pointsB.push(pointsB[0].clone());   // degenerate quad !!!!

    ck.testExactNumber(3, Point2dArray.pointCountExcludingTrailingWraparound(pointsA));
    // single point ...
    const point0 = Point3d.create(1, 2, 3);
    const point1 = Point3d.create(3, 2, 9);
    ck.testExactNumber(1, Point2dArray.pointCountExcludingTrailingWraparound([point0, point0, point0, point0]));
    ck.testExactNumber(3, Point2dArray.pointCountExcludingTrailingWraparound(pointsB));
    ck.testExactNumber(0.0, PolygonOps.sumTriangleAreas([]));
    ck.testExactNumber(0.0, PolygonOps.sumTriangleAreas([point0]));
    ck.testExactNumber(0.0, PolygonOps.sumTriangleAreas([point0, point1]));
    const carrierA = new Point3dArrayCarrier(pointsA);
    const carrierB = new Point3dArrayCarrier(pointsB);
    const carrierC = new Point3dArrayCarrier(pointsC);

    const rayA = PolygonOps.centroidAreaNormal(pointsA)!;
    const rayB = PolygonOps.centroidAreaNormal(pointsB)!;

    const unitA = Vector3d.create();
    const unitB = Vector3d.create();
    const unitC = Vector3d.create();

    ck.testTrue(PolygonOps.unitNormal(carrierA, unitA));
    ck.testTrue(PolygonOps.unitNormal(carrierB, unitB));
    ck.testTrue(PolygonOps.unitNormal(carrierC, unitC));

    ck.testVector3d(unitA, unitB);
    ck.testVector3d(unitA, unitC);

    ck.testPoint3d(rayA.origin, rayB.origin);
    ck.testVector3d(rayA.direction, rayB.direction);
    // degenerate -- points on a line . . .
    const pointsOnLine = [];
    for (let i = 0; i < 6; i++) {
      pointsOnLine.push(Point3d.create(i, i, i));
      ck.testUndefined(PolygonOps.centroidAreaNormal(pointsOnLine));
    }
    expect(ck.getNumErrors()).equals(0);
  });
});

function compareAreaData(ck: Checker, polygonA: Point3d[], polygonB: Point3d[] | GrowableXYZArray) {
  const areaA = PolygonOps.area(polygonA);
  // const rayA = PolygonOps.centroidAreaNormal(polygonA);
  let areaB = -10203213;
  // let rayB = Ray3d.create();
  if (polygonB instanceof GrowableXYZArray) {
    const normalB = Vector3d.create();
    PolygonOps.areaNormalGo(polygonB, normalB);
    areaB = normalB.magnitude();
  } else {
    areaB = PolygonOps.area(polygonB);
  }
  ck.testCoordinate(areaA, areaB);
}

describe("PolygonAreas", () => {

  it("TriangleVariants", () => {
    const ck = new Checker();
    const triangle000 = Sample.createTriangleWithSplitEdges(0, 0, 0);
    const triangle010 = Sample.createTriangleWithSplitEdges(0, 1, 0);
    const triangle123 = Sample.createTriangleWithSplitEdges(1, 2, 3);
    const triangle000G = GrowableXYZArray.create(triangle000);
    const triangle010G = GrowableXYZArray.create(triangle010);
    const triangle123G = GrowableXYZArray.create(triangle123);
    compareAreaData(ck, triangle000, triangle010);
    compareAreaData(ck, triangle000, triangle123);
    compareAreaData(ck, triangle000, triangle000G);
    compareAreaData(ck, triangle000, triangle010G);
    compareAreaData(ck, triangle000, triangle123G);

    ck.checkpoint("PolygonAreas.TriangleVariants");
    expect(ck.getNumErrors()).equals(0);
  });
  it("LShape", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];

    const pointA = [
      Point3d.create(-0.9351812543901677, -7.103406859177103, -14.793064616249996),
      Point3d.create(0.8399443606226988, 6.380010831659742, -14.793064616249996),
      Point3d.create(-12.986794582812577, 8.200335547052022, -14.793064616249996),
      Point3d.create(-13.582645174519337, 3.6744009645259488, -14.793064616249996),
      Point3d.create(-3.545902502657718, 2.3530387241332935, -14.793064616249996),
      Point3d.create(-4.725177525963828, -6.604444384177479, -14.793064616249996),
      Point3d.create(-0.9351812543901677, -7.103406859177103, -14.793064616249996),
    ];
    const centroidA = PolygonOps.centroidAreaNormal(pointA)!;
    GeometryCoreTestIO.captureGeometry(allGeometry, Loop.createPolygon(pointA));
    GeometryCoreTestIO.captureGeometry(allGeometry, Arc3d.createCenterNormalRadius(centroidA.origin, centroidA.direction, equivalentCircleRadius(centroidA)));
    GeometryCoreTestIO.captureGeometry(allGeometry, LineSegment3d.create(centroidA.origin, centroidA.origin.plus(centroidA.direction)));
    const a = 2.0;
    const scaleTransform = Transform.createFixedPointAndMatrix(centroidA.origin, Matrix3d.createScale(a, a, a))!;
    const pointB = scaleTransform.multiplyPoint3dArray(pointA);
    const centroidB = PolygonOps.centroidAreaNormal(pointB)!;
    GeometryCoreTestIO.captureGeometry(allGeometry, Loop.createPolygon(pointB));
    GeometryCoreTestIO.captureGeometry(allGeometry, Arc3d.createCenterNormalRadius(centroidB.origin, centroidB.direction, equivalentCircleRadius(centroidB)));
    ck.testPoint3d(centroidA.origin, centroidB.origin, "origin is invariant after scale around origin");
    ck.testVector3d(centroidA.direction, centroidB.direction, "origin is invariant after scale around origin");
    ck.testCoordinate(a * a * centroidA.a!, centroidB.a!, "area scales");

    const rotationTransform = Transform.createFixedPointAndMatrix(Point3d.create(0, 1, 3), Matrix3d.createRotationAroundVector(Vector3d.create(2, 3, 1), Angle.createDegrees(45.0))!)!;
    const pointC = rotationTransform.multiplyPoint3dArray(pointA);
    const centroidC = PolygonOps.centroidAreaNormal(pointC)!;
    const centroidC1 = centroidA.cloneTransformed(rotationTransform);
    GeometryCoreTestIO.captureGeometry(allGeometry, Loop.createPolygon(pointC));
    GeometryCoreTestIO.captureGeometry(allGeometry, Arc3d.createCenterNormalRadius(centroidC.origin, centroidC.direction, equivalentCircleRadius(centroidC)));
    ck.testPoint3d(centroidC.origin, centroidC1.origin);
    ck.testVector3d(centroidC.direction, centroidC1.direction);
    ck.testCoordinate((centroidA as any).a, (centroidC as any).a);

    GeometryCoreTestIO.saveGeometry(allGeometry, "PolygonAreas", "LShape");
    expect(ck.getNumErrors()).equals(0);
  });

  it("streamXYZ", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const zz = -14.79;
    const pointA = [
      Point3d.create(-0.9351812543901677, -7.103406859177103, zz),
      Point3d.create(0.8399443606226988, 6.380010831659742, zz),
      Point3d.create(-12.986794582812577, 8.200335547052022, zz),
      Point3d.create(-13.582645174519337, 3.6744009645259488, zz),
      Point3d.create(-3.545902502657718, 2.3530387241332935, zz),
      Point3d.create(-4.725177525963828, -6.604444384177479, zz),
      Point3d.create(-0.9351812543901677, -7.103406859177103, zz),
    ];
    const pointB = [
      Point2d.create(-0.9351812543901677, -7.103406859177103),
      Point2d.create(0.8399443606226988, 6.380010831659742),
      Point2d.create(-12.986794582812577, 8.200335547052022),
      Point2d.create(-13.582645174519337, 3.6744009645259488),
      Point2d.create(-3.545902502657718, 2.3530387241332935),
      Point2d.create(-4.725177525963828, -6.604444384177479),
      Point2d.create(-0.9351812543901677, -7.103406859177103),
    ];

    const pointC = GrowableXYZArray.create(pointA);
    const rangeC = Range3d.createFromVariantData(pointC);
    const rangeA0 = Range3d.createFromVariantData(pointA);

    ck.testRange3d(rangeA0, rangeC);
    const rangeA1 = Range3d.createArray(pointA);
    ck.testRange3d(rangeA0, rangeA1, "range by structured search, array");
    const pointAB = [pointA, pointB];
    const rangeAB0 = Range3d.createFromVariantData(pointAB);
    const rangeAB1 = rangeA1.clone();
    const rangeB0 = Range3d.createFromVariantData(pointB);
    rangeAB1.extendRange(rangeB0);
    ck.testRange3d(rangeAB0, rangeAB1, "create range variant");
    GeometryCoreTestIO.saveGeometry(allGeometry, "PolygonAreas", "streamXYZ");
    expect(ck.getNumErrors()).equals(0);
  });

  it("cloneVariants", () => {
    const ck = new Checker();
    // const allGeometry: GeometryQuery[] = [];
    const pointA = Sample.createStar(1, 2, 3, 4, 6, 5, true);
    const pointB = Sample.createRectangle(-2, 4, 5, 2);

    const pointC = GrowableXYZArray.create([1, 2, 2, 4, 2, 1, 5, 2, 3]);
    const dataA = Point3dArray.cloneDeepJSONNumberArrays(pointA);
    ck.testExactNumber(11, dataA.length);
    const dataB = Point3dArray.cloneDeepXYZPoint3dArrays(pointA);
    ck.testExactNumber(11, dataB.length, "Round Trip as Point3d[]");
    const dataABC = Point3dArray.cloneDeepJSONNumberArrays([pointA, pointB, pointC]);
    const linestringsABC0 = LineString3d.createArrayOfLineString3d(dataABC);

    const lsA = LineString3d.create(pointA);
    const lsB = LineString3d.create(pointB);
    const lsC = LineString3d.create(pointC);
    if (ck.testExactNumber(3, linestringsABC0.length, "3 linestrings in flattened data")) {
      ck.testTrue(lsA.isAlmostEqual(linestringsABC0[0]), "pointA");
      ck.testTrue(lsB.isAlmostEqual(linestringsABC0[1]), "pointB");
      ck.testTrue(lsC.isAlmostEqual(linestringsABC0[2]), "pointC");
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("minMaxPoints", () => {
    const ck = new Checker();
    // const allGeometry: GeometryQuery[] = [];
    const pointA = Sample.createStar(1, 2, 3, 4, 6, 5, true);
    const minMaxPoints = Point3dArray.minMaxPoints(pointA);
    if (ck.testDefined(minMaxPoints) && minMaxPoints) {
      const rangeA = Point3dArray.createRange(pointA);  // DEPRECATED !!!!
      const range = Range3d.createArray(pointA);
      ck.testCoordinate(minMaxPoints.minXPoint.x, range.low.x);
      ck.testCoordinate(minMaxPoints.minYPoint.y, range.low.y);
      ck.testCoordinate(minMaxPoints.maxXPoint.x, range.high.x);
      ck.testCoordinate(minMaxPoints.maxYPoint.y, range.high.y);
      ck.testCoordinate(minMaxPoints.maxYPoint.y, rangeA.high.y);
    }
    ck.testUndefined(Point3dArray.minMaxPoints([]));
    expect(ck.getNumErrors()).equals(0);
  });
  it("steppedArray", () => {
    const ck = new Checker();
    const a = 3.0;
    const b = 17;
    const singleton = NumberArray.createArrayWithMaxStepSize(a, a, 10);
    ck.testExactNumber(1, singleton.length, "singleton");
    ck.testExactNumber(a, singleton[0]);
    const forward = NumberArray.createArrayWithMaxStepSize(a, b, 5);
    const reverse = NumberArray.createArrayWithMaxStepSize(b, a, 5);
    reverse.reverse();
    ck.testNumberArray(forward, reverse, "spaced numbers with reversal");

    expect(ck.getNumErrors()).equals(0);
  });

  it("nestedArray", () => {
    const ck = new Checker();
    const data10 = new Float64Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const numPerBlock of [1, 3, 4, 5]) {
      const arrayA = Point3dArray.unpackNumbersToNestedArrays(data10, numPerBlock);
      let k = 0;
      for (const q of arrayA) {
        ck.testTrue(Array.isArray(q));
        ck.testTrue(q.length <= numPerBlock);
        if (k + numPerBlock <= data10.length)
          ck.testExactNumber(numPerBlock, q.length);
        for (const x of q)
          ck.testExactNumber(data10[k++], x);
      }

    }
    const numPerRowB = 4;
    const leafB = 3;
    const numRowB = 5;
    const dataB = [];
    for (let i = 0; i < numPerRowB * leafB * numRowB; i++)
      dataB.push(i);
    const arrayAB = Point3dArray.unpackNumbersToNestedArraysIJK(new Float64Array(dataB), numPerRowB, leafB);
    ck.testExactNumber(numRowB, arrayAB.length, "IJK column length");
    expect(ck.getNumErrors()).equals(0);
  });

  it("ConvexHullManyPoints", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const a = 3.29;
    const dTheta = 0.34;
    let x0 = 0;
    const y0 = 0;
    for (const numPoints of [9, 42, 273]) {
      const points: Point3d[] = [];
      for (let theta = 0.01 * (numPoints - 8); points.length < numPoints; theta += dTheta) {
        points.push(lisajouePoint3d(theta * theta, a, 0));
      }
      const range = Range3d.createFromVariantData(points);
      const dx = Math.ceil(range.xLength() + 4);
      const dy = Math.ceil(range.yLength() + 1);
      const interior: Point3d[] = [];
      const hull: Point3d[] = [];
      Point3dArray.computeConvexHullXY(points, hull, interior, true);
      // hull.push(hull[0].clone());    // closure point !
      GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create([0, 0], [1, 0], [1, 1], [0, 1], [0, 0]), x0, y0);

      GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(hull), x0, y0);
      GeometryCoreTestIO.createAndCaptureXYCircle(allGeometry, points, 0.01, x0, y0);
      GeometryCoreTestIO.createAndCaptureXYCircle(allGeometry, points, 0.01, x0, y0 + dy);
      GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(interior), x0, y0);
      ck.checkpoint("ConvexHullManyPoints");
      if (ck.testExactNumber(points.length + 1, hull.length + interior.length)) {
        let residual = points;
        const y1 = y0 + 2 * dy;
        GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(hull), x0, y1);
        const minXPoints = [];
        const minYPoints = [];
        const maxXPoints = [];
        const maxYPoints = [];
        while (residual.length > 0) {
          const newInterior: Point3d[] = [];
          const newHull: Point3d[] = [];
          Point3dArray.computeConvexHullXY(residual, newHull, newInterior, true);
          GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(newHull), x0, y1);
          const q = Point3dArray.minMaxPoints(newHull)!;

          minXPoints.push(q.minXPoint);
          minYPoints.push(q.minYPoint);

          maxXPoints.push(q.maxXPoint);
          maxYPoints.push(q.maxYPoint);
          residual = newInterior;
        }
        GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(minXPoints), x0, y1);
        GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(maxXPoints), x0, y1);
        GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(minYPoints), x0, y1);
        GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(maxYPoints), x0, y1);
      }
      x0 += dx;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "Point3dArray", "ConvexHullManyPoints");
    expect(ck.getNumErrors()).equals(0);
  });

  it("SmallConvexHullExample", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const points: Point3d[] = [];
    points.push(Point3d.create(1, 0, 0));
    points.push(Point3d.create(2, 1, 0));
    points.push(Point3d.create(1, 3, 0));
    points.push(Point3d.create(8, 0.5, 0));
    points.push(Point3d.create(5, 6, 0));
    points.push(Point3d.create(-1, 2, 0));
    points.push(Point3d.create(3, 4, 0));
    const hullPoints: Point3d[] = [];
    const interiorPoints: Point3d[] = [];
    Point3dArray.computeConvexHullXY(points, hullPoints, interiorPoints, true);
    // output circles at the original points . . .
    GeometryCoreTestIO.createAndCaptureXYCircle(allGeometry, points, 0.04, 0, 0);
    // Output a linestring . . .
    GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(hullPoints), 0, 0);
    GeometryCoreTestIO.saveGeometry(allGeometry, "Point3dArray", "SmallConvexHullExample");
    expect(ck.getNumErrors()).equals(0);
  });

});

// cspell:word lisajoue
export function lisajouePoint3d(theta: number, a: number, z: number = 0): Point3d {
  const r = Math.cos(a * theta);
  return Point3d.create(r * Math.cos(theta), r * Math.sin(theta), z);
}
