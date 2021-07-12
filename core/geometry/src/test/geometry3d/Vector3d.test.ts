/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// import { Sample } from "../serialization/GeometrySamples";
import { expect } from "chai";
import { Angle } from "../../geometry3d/Angle";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import * as bsiChecker from "../Checker";

/* eslint-disable no-console */
describe("Vector3d", () => {
  it("hello", () => {
    const ck = new bsiChecker.Checker();
    const pointA = Point3d.create(1, 2, 5);
    const pointB = Point3d.create(4, 2, 9);
    const q = 3.902;
    const vectorABq = pointA.scaledVectorTo(pointB, q);
    const vectorAB = pointA.vectorTo(pointB);
    ck.testParallel(vectorAB, vectorABq, "parallel vectors");
    ck.testCoordinate(q * vectorAB.magnitude(), vectorABq.magnitude(), "enforced magnitude");

    const vectorABxyz = Vector3d.createStartEndXYZXYZ(pointA.x, pointA.y, pointA.z, pointB.x, pointB.y, pointB.z);
    ck.testVector3d(vectorAB, vectorABxyz);

    ck.checkpoint("Vector3d.hello");
    expect(ck.getNumErrors()).equals(0);
  });

  it("DotProducts", () => {
    const ck = new bsiChecker.Checker();
    const vectorA = Vector3d.create(-4, 4, 2);
    const unitZ = Vector3d.unitZ();
    const vectorB = Vector3d.create(0.3, 9.1, -2);
    const pointB0 = Point3d.create(3, 2, 8);
    const pointB1 = pointB0.plus(vectorB);

    ck.testCoordinate(vectorA.crossProductXY(vectorB), vectorA.tripleProduct(vectorB, unitZ), "crossProductXY");
    ck.testCoordinate(vectorA.crossProductStartEndXY(pointB0, pointB1), vectorA.tripleProduct(vectorB, unitZ), "crossProductXY");
    ck.checkpoint("Vector3d.DotProducts");
    expect(ck.getNumErrors()).equals(0);
  });
  it("XYAngle", () => {
    const ck = new bsiChecker.Checker();
    const unitX = Vector3d.unitX();
    const unitZ = Vector3d.unitZ();
    for (const z of [-0.2, 0, 1.8])
      for (const r of [0.5, 1.0, 2.9])
        for (const degrees of [-40, -179, 0, 10, 90, 170]) {
          const theta = Angle.createDegrees(degrees);
          const vector = Vector3d.createPolar(r, theta, z);
          ck.testCoordinate(vector.magnitudeXY(), r);
          ck.testAngleNoShift(theta, unitX.planarAngleTo(vector, unitZ));
        }
    ck.checkpoint("Point3d.zeros");
    expect(ck.getNumErrors()).equals(0);
  });

  it("NormalizeWithDefault", () => {
    const ck = new bsiChecker.Checker();
    const vectorA = Vector3d.create(1, 2, 3);
    const vectorB = vectorA.normalizeWithDefault(1, 0, 0);
    ck.testParallel(vectorA, vectorB);
    ck.testCoordinate(1.0, vectorB.magnitude(), "unit vector magnitude");
    const vectorC = Vector3d.createZero();
    const vectorD = vectorC.normalizeWithDefault(0, 0, 1);
    ck.testVector3d(vectorD, Vector3d.unitZ());
    ck.checkpoint("Point3dArray.HelloWorld");
    expect(ck.getNumErrors()).equals(0);
  });
  it("RotateVectorAroundVector", () => {
    const ck = new bsiChecker.Checker();
    const vectorA = Vector3d.create(1, 2, 3);
    const axis = Vector3d.create(-1, 3, 6);
    const theta = Angle.createDegrees(20);
    const vectorA1 = Vector3d.createRotateVectorAroundVector(vectorA, axis, theta);
    if (ck.testPointer(vectorA1)) {
      const theta1 = vectorA.planarAngleTo(vectorA1, axis);
      ck.testAngleNoShift(theta, theta1);
    }

    const vectorA2 = Vector3d.createRotateVectorAroundVector(vectorA, axis);
    if (ck.testPointer(vectorA2)) {
      const theta1 = vectorA.planarAngleTo(vectorA2, axis);
      ck.testAngleNoShift(theta1, Angle.createDegrees(90));
    }
    ck.testUndefined(Vector3d.createRotateVectorAroundVector(vectorA, Vector3d.create(0, 0, 0)));
    expect(ck.getNumErrors()).equals(0);
  });

});
