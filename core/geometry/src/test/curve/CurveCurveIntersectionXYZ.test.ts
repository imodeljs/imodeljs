/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Arc3d } from "../../curve/Arc3d";
import { CurveCurve } from "../../curve/CurveCurve";
import { CurveLocationDetailArrayPair } from "../../curve/CurveCurveIntersectXY";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Checker } from "../Checker";

/* eslint-disable no-console */
function testIntersectionsXYZ(
  ck: Checker,
  intersections: CurveLocationDetailArrayPair, minExpected: number, maxExpected: number,
  testCoordinates: boolean = false): boolean {
  const baseErrorCount = ck.getNumErrors();
  if (ck.testExactNumber(intersections.dataA.length, intersections.dataB.length, "intersections A B match")) {
    const n = intersections.dataA.length;
    if (n < minExpected || n > maxExpected) {
      ck.announceError("intersection count out of range", n, minExpected, maxExpected);
    }
    if (testCoordinates) {
      for (let i = 0; i < n; i++) {
        ck.testPoint3d(intersections.dataA[i].point, intersections.dataB[i].point, "CLD coordinate match");
        const fA = intersections.dataA[i].fraction;
        const fB = intersections.dataB[i].fraction;
        const cpA = intersections.dataA[i].curve;
        const cpB = intersections.dataB[i].curve;
        if (ck.testPointer(cpA)
          && ck.testPointer(cpB)) {
          ck.testPoint3d(cpA.fractionToPoint(fA), intersections.dataA[i].point);
          ck.testPoint3d(cpB.fractionToPoint(fB), intersections.dataB[i].point);
        }
      }
    }
  }
  return ck.getNumErrors() === baseErrorCount;
}

describe("CurveCurveIntersectionXYZ", () => {

  it("LineLineMapped", () => {
    const ck = new Checker();

    const segment0 = LineSegment3d.createXYXY(1, 2, 4, 2);
    const segment1 = LineSegment3d.createXYXY(4, 1, 2, 3);
    const segment2 = segment1.clone();
    segment2.tryTranslateInPlace(0, 0, 1);
    const intersectionsAB = CurveCurve.intersectionXYZ(segment0, false, segment1, false);
    testIntersectionsXYZ(ck, intersectionsAB, 1, 1);

    const intersectionsBA = CurveCurve.intersectionXYZ(segment2, false, segment0, false);
    testIntersectionsXYZ(ck, intersectionsBA, 0, 0);

    ck.checkpoint("CurveCurve.LineLine");
    expect(ck.getNumErrors()).equals(0);
  });

  it("LineArcMapped", () => {
    const ck = new Checker();

    const arc1 = Arc3d.create(Point3d.create(3, 1, 0), Vector3d.create(5, 1, 0), Vector3d.create(-1, 7, 0));
    const f0 = 0.0;
    const f1 = 0.25;
    const pointA = arc1.fractionToPoint(f0);
    const pointB = arc1.fractionToPoint(f1);

    const segment0 = LineSegment3d.create(pointA, pointB);
    const intersectionsAB = CurveCurve.intersectionXYZ(segment0, true, arc1, true);
    testIntersectionsXYZ(ck, intersectionsAB, 2, 2);

    const intersectionsBA = CurveCurve.intersectionXYZ(arc1, true, segment0, true);
    testIntersectionsXYZ(ck, intersectionsBA, 2, 2);

    expect(ck.getNumErrors()).equals(0);
  });

  it("LineStringLineString", () => {
    const ck = new Checker();
    // const segment0 = LineSegment3d.createXYXY(1, 2, 4, 2);
    const linestring0 = LineString3d.create(Point3d.create(1, 1), Point3d.create(3, 0), Point3d.create(3, 5));
    const linestring1 = LineString3d.create(Point3d.create(2, 4, 0), Point3d.create(4, 1, 0), Point3d.create(2, 5, 0));
    const intersectionsX = CurveCurve.intersectionXYZ(linestring0, true, linestring1, true);

    testIntersectionsXYZ(ck, intersectionsX, 2, 2);
    expect(ck.getNumErrors()).equals(0);
  });

  it("LineLineString", () => {
    const ck = new Checker();
    // const segment0 = LineSegment3d.createXYXY(1, 2, 4, 2);
    const lineSegment0 = LineSegment3d.create(Point3d.create(1, 4), Point3d.create(5, 1));
    const lineString1 = LineString3d.create(Point3d.create(2, 4, 0), Point3d.create(4, 1, 0), Point3d.create(5, 5, 0));
    const intersectionsX = CurveCurve.intersectionXYZ(lineSegment0, true, lineString1, true);
    testIntersectionsXYZ(ck, intersectionsX, 2, 2);

    const intersectionsX1 = CurveCurve.intersectionXYZ(lineString1, true, lineSegment0, true);
    testIntersectionsXYZ(ck, intersectionsX1, 2, 2);

    expect(ck.getNumErrors()).equals(0);
  });

  it("ArcLineString", () => {
    const ck = new Checker();
    const arc0 = Arc3d.createCircularStartMiddleEnd(Point3d.create(1, 4), Point3d.create(4, 2), Point3d.create(7, 4)) as Arc3d;
    const linestring1 = LineString3d.create(Point3d.create(2, 4, 0), Point3d.create(4, 1, 0), Point3d.create(5, 5, 0));
    const intersectionsX = CurveCurve.intersectionXYZ(arc0, false, linestring1, false);

    testIntersectionsXYZ(ck, intersectionsX, 2, 2);
    const intersectionsX1 = CurveCurve.intersectionXYZ(linestring1, false, arc0, false);

    testIntersectionsXYZ(ck, intersectionsX1, 2, 2);

    expect(ck.getNumErrors()).equals(0);
  });

  it("ArcArcSkew", () => {
    const ck = new Checker();
    const arcA = Arc3d.create(Point3d.create(1, 1, 1), Vector3d.create(4, 0, 0), Vector3d.create(0, 1, 0));
    const arcB = Arc3d.create(Point3d.create(1, 1, 1), Vector3d.create(0, 1, 0), Vector3d.create(0, 0, 2));
    const intersectionsAB = CurveCurve.intersectionXYZ(arcA, true, arcB, true);
    testIntersectionsXYZ(ck, intersectionsAB, 2, 2);

    expect(ck.getNumErrors()).equals(0);
  });

  it("ArcArcInPlane", () => {
    const ck = new Checker();
    const arcA = Arc3d.create(Point3d.create(1, 1, 1), Vector3d.create(4, 0, 0), Vector3d.create(0, 4, 0));
    const arcB = Arc3d.create(Point3d.create(4, 1, 1), Vector3d.create(2, 2, 0), Vector3d.create(-2, 2));
    const intersectionsAB = CurveCurve.intersectionXYZ(arcA, true, arcB, true);
    testIntersectionsXYZ(ck, intersectionsAB, 2, 2);

    arcA.tryTranslateInPlace(0, 0, 1);
    const intersectionsAB1 = CurveCurve.intersectionXYZ(arcA, true, arcB, true);
    testIntersectionsXYZ(ck, intersectionsAB1, 0, 0);

    expect(ck.getNumErrors()).equals(0);
  });
});
