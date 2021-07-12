/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { CurveCurveApproachType } from "../../curve/CurveLocationDetail";
import { AxisOrder, Geometry } from "../../Geometry";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/Plane3dByOriginAndUnitNormal";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Range1d, Range3d } from "../../geometry3d/Range";
import { Ray3d } from "../../geometry3d/Ray3d";
import { Transform } from "../../geometry3d/Transform";
import { Checker } from "../Checker";
import { prettyPrint } from "../testFunctions";

/** create rays, using optional result (which may be undefined)
 */
function createRays(ck: Checker, target?: Ray3d) {
  const pointA = Point3d.create(1, 2, 3);
  const directionA = Vector3d.create(4, 5, 6);
  const pointB = pointA.plus(directionA);
  const ray = Ray3d.create(pointA, directionA, target);

  ck.testFalse(pointA === ray.origin, "confirm inputs cloned");
  ck.testFalse(directionA === ray.direction, "confirm inputs cloned");
  const ray1 = Ray3d.createXYZUVW(pointA.x, pointA.y, pointA.z, directionA.x, directionA.y, directionA.z, target);
  ck.testPoint3d(pointA, ray1.origin);
  ck.testVector3d(directionA, ray1.direction);

  const transform = Transform.createOriginAndMatrix(Point3d.create(4, 2, -1), Matrix3d.createScale(-3, -2, 5));
  const ray3 = ray.clone();
  const ray3A = ray.clone(Ray3d.createZero());
  const ray4 = ray.cloneTransformed(transform);
  ck.testTrue(ray3.isAlmostEqual(ray), "clone");
  ck.testTrue(ray3A.isAlmostEqual(ray), "clone");
  ck.testFalse(ray4.isAlmostEqual(ray), "clone Transformed");

  for (const f of [0.5, 1, -1]) {
    const pointF = ray1.fractionToPoint(f);
    const fractionOut = ray1.pointToFraction(pointF);
    ck.testCoordinate(f, fractionOut);
    const pointF4 = ray4.fractionToPoint(f);
    ck.testPoint3d(pointF4, transform.multiplyPoint3d(pointF), "transform*ray");

    const pointF1 = ray1.projectPointToRay(pointF);
    ck.testPoint3d(pointF, pointF1, "fraction to point re projects to same point");
    const frame = ray.toRigidZFrame();
    if (ck.testPointer(frame)) {
      const localPoint = Point3d.create(0.3, 0.8, 5.7);
      const globalPoint = frame.multiplyPoint3d(localPoint);
      const distanceToRay = ray.distance(globalPoint);
      ck.testCoordinate(distanceToRay, localPoint.magnitudeXY(), " projection distance is in plane part");
    }

    const ray5 = Ray3d.createPointVectorNumber(pointA, directionA, 4.0, target);
    ck.testPoint3d(ray5.origin, pointA);
    ck.testVector3d(ray5.direction, directionA);
  }

  const ray2 = Ray3d.createStartEnd(pointA, pointB);
  const ray2A = Ray3d.createStartEnd(pointA, pointB, Ray3d.createZero());
  ck.testTrue(ray2.isAlmostEqual(ray));
  ck.testTrue(ray2A.isAlmostEqual(ray));

  const json2 = ray2.toJSON();
  const ray2B = Ray3d.fromJSON(json2);
  const ray2C = Ray3d.fromJSON();
  ck.testTrue(ray2.isAlmostEqual(ray2B), "json round trip");
  ck.testPointer(ray2C, "expect some default fromJSON");

}

describe("Ray3d", () => {
  it("HelloWorld", () => {
    const ck = new Checker();
    const rayX = Ray3d.createXAxis();
    const rayY = Ray3d.createYAxis();
    const rayZ = Ray3d.createZAxis();
    ck.testPerpendicular(rayX.direction, rayY.direction);
    ck.testPerpendicular(rayX.direction, rayZ.direction);
    ck.testPerpendicular(rayY.direction, rayZ.direction);
    const ray0 = Ray3d.createZero();
    const rayQ = Ray3d.createXYZUVW(1, 2, 3, 4, 5, 6);
    const rayQ0 = Ray3d.createZero(rayQ);
    ck.testTrue(ray0.isAlmostEqual(rayQ0));
    ck.testTrue(ray0.isAlmostEqual(rayQ));

    const rayU = Ray3d.createXYZUVW(1, 2, 3, 4, 5, 6);
    ck.testTrue(rayU.trySetDirectionMagnitudeInPlace(2.0));
    ck.testCoordinate(2.0, rayU.direction.magnitude(), "ray direction with imposed magnitude");
    createRays(ck, undefined);
    createRays(ck, rayQ0);

    const nullRay = Ray3d.createXYZUVW(1, 2, 3, 0, 0, 0);  // general origin, zero vector to trigger else branches ..
    nullRay.toRigidZFrame();
    nullRay.tryNormalizeInPlaceWithAreaWeight(0.0);
    nullRay.tryNormalizeInPlaceWithAreaWeight(1.0);
    const spacePoint = Point3d.create(8, 10, 1);
    ck.testCoordinate(spacePoint.distance(nullRay.origin), nullRay.distance(spacePoint), "distance to null ray");

    ck.testFalse(nullRay.trySetDirectionMagnitudeInPlace(), "trySetMagnitude of null ray");

    ck.testUndefined(
      Ray3d.createWeightedDerivative(
        new Float64Array([1, 2, 3, 0]),
        new Float64Array([2, 1, 4, 0])));
    expect(ck.getNumErrors()).equals(0);
  });
  it("ClosestApproach", () => {
    const ck = new Checker();
    // we expect that there are no parallel pairs or intersecting pairs here . . .
    const raySample = [
      Ray3d.createXYZUVW(0, 1, 0, 1, 0, 0),
      Ray3d.createXYZUVW(0, 0, 1, 0, 1, 0),
      Ray3d.createXYZUVW(1, 0, 0, 0, 0, 1),
      Ray3d.createXYZUVW(1, 2, 3, 5, 2, -1),
      Ray3d.createXYZUVW(-3, 2, 4, -1, 3, 4),
    ];
    /* fractions for contrived intersections  */
    const f1 = 0.13123;
    const f2 = -0.1232;
    for (let indexA = 0; indexA < raySample.length; indexA++) {
      const rayA = raySample[indexA];
      const frame = Matrix3d.createRigidHeadsUp(rayA.direction, AxisOrder.ZXY);
      for (let indexB = 0; indexB < raySample.length; indexB++) {
        const rayB = raySample[indexB];
        const approach = Ray3d.closestApproachRay3dRay3d(rayA, rayB)!;
        if (indexA === indexB) {
          ck.testExactNumber(approach.approachType!, CurveCurveApproachType.CoincidentGeometry, indexA);
          const rayC = rayA.clone();
          const shiftDistance = 34.2 + indexA;
          rayC.origin.addScaledInPlace(frame.columnY(), shiftDistance);
          const approachC = Ray3d.closestApproachRay3dRay3d(rayA, rayC)!;
          ck.testExactNumber(approachC.approachType!, CurveCurveApproachType.ParallelGeometry, indexA);
          ck.testCoordinate(shiftDistance, approachC.detailA.point.distance(approachC.detailB.point));

        } else {
          ck.testExactNumber(approach.approachType!, CurveCurveApproachType.PerpendicularChord, [indexA, indexB]);
          const vector = Vector3d.createStartEnd(approach.detailA.point, approach.detailB.point);
          ck.testPerpendicular(vector, rayA.direction);
          ck.testPerpendicular(vector, rayB.direction);
          const rayE1 = rayA.clone();
          const rayE2 = rayB.clone();
          const point1 = rayE1.fractionToPoint(f1);
          const point2 = rayE2.fractionToPoint(f2);
          const vector12 = Vector3d.createStartEnd(point1, point2);
          rayE1.origin.addInPlace(vector12);
          // rayE2 at fraction f2 has been moved to rayE1 at fraction f1.  Confirm intersection there . .
          const approachE = Ray3d.closestApproachRay3dRay3d(rayE1, rayE2);
          ck.testExactNumber(approachE.approachType!, CurveCurveApproachType.Intersection, "forced intersection", [indexA, indexB]);
          ck.testCoordinate(f1, approachE.detailA.fraction);
          ck.testCoordinate(f2, approachE.detailB.fraction);
        }
      }
    }

    expect(ck.getNumErrors()).equals(0);
  });

  it("ClipToRange", () => {
    const ck = new Checker();
    // we expect that there are no parallel pairs or intersecting pairs here . . .
    const raySample = [
      Ray3d.createXYZUVW(0, 1, 0, 1, 0, 0),
      Ray3d.createXYZUVW(0, 0, 1, 0, 1, 0),
      Ray3d.createXYZUVW(1, 0, 0, 0, 0, 1),
      Ray3d.createXYZUVW(0, 2, 0, 1, 0, 0),
      Ray3d.createXYZUVW(0, 0, 2, 0, 1, 0),
      Ray3d.createXYZUVW(2, 0, 0, 0, 0, 1),
      Ray3d.createXYZUVW(0, -1, 0, 1, 0, 0),
      Ray3d.createXYZUVW(0, 0, -1, 0, 1, 0),
      Ray3d.createXYZUVW(-1, 0, 0, 0, 0, 1),
      Ray3d.createXYZUVW(0.5, 0.6, 0.7, 1, 2, 3),
      Ray3d.createXYZUVW(1, 2, 3, 5, 2, -1),
      Ray3d.createXYZUVW(-3, 2, 4, -1, 3, 4),
    ];
    const rangeSample = [
      Range3d.createXYZXYZ(0, 0, 0, 1, 1, 1),
      Range3d.createXYZXYZ(-100, -200, -300, 500, 600, 700),
      Range3d.createXYZXYZ(100, -200, -300, 500, 600, 700),
      Range3d.createXYZXYZ(200, 300, 400, 500, 600, 700),
    ];
    let numOutside = 0;
    for (const ray of raySample) {
      // ray.fractionToPoint(f) === ray1.fractionToPoint (-f)
      const ray1 = Ray3d.create(ray.origin, ray.direction.scale(-1));
      for (const range of rangeSample) {
        const interval = ray.intersectionWithRange3d(range);

        if (!interval.isNull) {
          for (const intervalFraction of [0.999999, 0.5, 0.000001, -0.001, 1.001]) {
            const point = ray.fractionToPoint(interval.fractionToPoint(intervalFraction));
            if (!ck.testBoolean(Geometry.isIn01(intervalFraction), range.containsPoint(point), "fractional point vs range", intervalFraction, point,
              prettyPrint(ray), prettyPrint(range)))
              ray.intersectionWithRange3d(range);
          }
          const interval1 = ray1.intersectionWithRange3d(range);
          if (ck.testDefined(interval1, "Expected reversed ray to have related intersection")) {
            ck.testCoordinate(interval.low, - interval1.high, "reversed ray");
            ck.testCoordinate(interval.high, - interval1.low, "reversed ray");
          }
        } else {
          numOutside++;
          for (let intervalFraction = -0.5; intervalFraction < 1.7; intervalFraction += 0.25) {
            const point = ray.fractionToPoint(interval.fractionToPoint(intervalFraction));
            ck.testFalse(range.containsPoint(point), "expect point outside", intervalFraction, point, ray, range);
          }
        }
      }
    }
    /** known inside to outside rays .. */
    for (const range of rangeSample) {
      const q = range.fractionToPoint(0.4, 0.2, 0.1);
      const interval0 = Range1d.createNull();
      for (const ray of raySample) {
        const ray3 = Ray3d.create(q, ray.direction);   // we know this starts inside
        const interval = ray3.intersectionWithRange3d(range, interval0);
        ck.testTrue(interval0 === interval, "Verify reuse result)");
        if (ck.testFalse(interval.isNull, "expect real intersection from inside start")) {
          ck.testTrue(interval.containsX(0.0));
          for (const intervalFraction of [0.999999, 0.5, 0.000001, -0.001, 1.001]) {
            const point = ray3.fractionToPoint(interval.fractionToPoint(intervalFraction));
            if (!ck.testBoolean(Geometry.isIn01(intervalFraction), range.containsPoint(point), "fractional point vs range", intervalFraction, point,
              prettyPrint(ray3), prettyPrint(range)))
              ray.intersectionWithRange3d(range);
          }
        }

      }
    }
    ck.testLE(0, numOutside, "Confirm some outside rays were vetted");
    const ray2 = raySample[0];
    const null3d = Range3d.createNull();
    const range1d = Range1d.createXX(0, 1);
    ck.testTrue(ray2.intersectionWithRange3d(null3d).isNull, "ray intersect null range");
    ck.testFalse(range1d.clipLinearMapToInterval(0, 1, 3, 1), "range1d clipLinearMapToInterval with null interval");
    expect(ck.getNumErrors()).equals(0);
  });

  it("IntersectWithPlane", () => {
    const ck = new Checker();
    const plane = Plane3dByOriginAndUnitNormal.createXYZUVW(1, 3, 2, 5, 2, 9)!;
    const rayA = Ray3d.createXYZUVW(5, 4, 2, 1, 3, 2);
    const rayB = Ray3d.createXYZUVW(5, 4, 1, -2, 5, 0);
    const fractionA = rayA.intersectionWithPlane(plane);
    if (fractionA !== undefined && ck.testIsFinite(fractionA)) {
      const point = rayA.fractionToPoint(fractionA);
      ck.testCoordinate(0, plane.altitude(point));
    }
    const fractionB = rayB.intersectionWithPlane(plane);
    ck.testUndefined(fractionB, "Detect ray parallel to plane");
    // This pair generates aDotN and UDotN both near zero
    const planeQ = Plane3dByOriginAndUnitNormal.createXYZUVW(
      101.38054428331306, -7.136947376249823, 14.575798896766162,
      1.4069516995683865e-17, 1.0468826690441132e-32, 1)!;
    const rayQ = Ray3d.createXYZUVW(95.87780347429201, -7.1369473762498234, 14.575798896766187,
      - 1, -4.61132646190051e-31, 4.567684502237405e-15);
    ck.testUndefined(rayQ.intersectionWithPlane(planeQ));
    expect(ck.getNumErrors()).equals(0);
  });
});
