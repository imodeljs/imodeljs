/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Geometry } from "../../Geometry";
import { Angle } from "../../geometry3d/Angle";
import { Point3d, Vector3d, XYZ } from "../../geometry3d/Point3dVector3d";
import { Sample } from "../../serialization/GeometrySamples";
import * as bsiChecker from "../Checker";

/* eslint-disable no-console */
describe("Point3d", () => {
  it("zeros", () => {
    const ck = new bsiChecker.Checker();
    const alwaysZero = Point3d.create(0, 0);
    const alwaysZeroA = Point3d.createZero();
    const alwaysZeroB = Point3d.createZero();
    ck.testTrue(alwaysZero.isExactEqual(alwaysZeroA));
    ck.testTrue(alwaysZero.isExactEqual(alwaysZeroB));
    const pointA = Point3d.create(1, 2);
    const epsilon = 1.0e-15;
    const pointB = Point3d.create(pointA.x, pointA.x + 0.01);
    ck.testFalse(Point3d.create(epsilon, epsilon).isAlmostEqualMetric(pointB), "is almost zero (epsilon)");

    ck.testFalse(pointA.isAlmostZero, "is almost zero");

    ck.testFalse(alwaysZero.isExactEqual(pointA));
    pointA.setZero();
    ck.testPoint3d(alwaysZero, pointA);

    ck.testTrue(alwaysZero.isAlmostZero, "is almost zero");
    ck.testTrue(Point3d.create(epsilon, epsilon).isAlmostZero, "is almost zero (epsilon)");
    ck.testTrue(Point3d.create(epsilon, epsilon).isAlmostEqualMetric(alwaysZero), "is almost zero (epsilon)");
    ck.testPoint3d(alwaysZero, alwaysZeroA);

    ck.checkpoint("Point3d.zeros");
    expect(ck.getNumErrors()).equals(0);
  });

  it("XYAndZ", () => {
    const ck = new bsiChecker.Checker();
    ck.testTrue(XYZ.isXYAndZ({ x: 1, y: 2, z: 4 }));
    ck.testFalse(XYZ.isXYAndZ({ x: 1, y: 2 }));
    ck.testFalse(XYZ.isXYAndZ({ z: 1, y: 2 }));
    ck.testFalse(XYZ.isXYAndZ({ x: 1, z: 2 }));
    expect(ck.getNumErrors()).equals(0);
  });

  it("Diffs", () => {
    const ck = new bsiChecker.Checker();

    const pointA = Point3d.create(1, 2);
    const pointB = Point3d.create(-2, 5);

    const vectorAB = pointA.vectorTo(pointB);
    const pointDiff = pointA.maxDiff(pointB);
    const pointA3d = Point3d.createFrom(pointA);
    const pointB3d = Point3d.createFrom(pointB);
    pointA3d.z = 32.9;
    pointB3d.z = 29.1;
    const vectorMax = vectorAB.maxAbs();
    ck.testCoordinate(pointDiff, vectorMax, "maxdiff, maxabs");
    ck.testCoordinate(vectorAB.magnitude(), pointA.distance(pointB), "distance and magnitude");
    ck.testCoordinate(vectorAB.magnitudeSquared(), pointA.distanceSquared(pointB), "distance and magnitude");
    ck.testCoordinate(vectorAB.magnitudeSquaredXY(), pointA.distanceSquaredXY(pointB), "distance and magnitude");
    const d3 = pointA3d.distanceXY(pointB3d);
    const pointDist = pointA.distance(pointB);
    ck.testCoordinate(pointDist, d3, "point3d.distanceXY");
    ck.testCoordinate(pointDist * pointDist, pointA3d.distanceSquaredXY(pointB3d), "point3d.distanceXY");

    const symmetricLattice3 = Sample.createPoint3dLattice(-3, 1, 3);
    for (const point of symmetricLattice3) {
      const i = point.indexOfMaxAbs();
      const i1 = Geometry.cyclic3dAxis(i + 1);
      const i2 = Geometry.cyclic3dAxis(i + 2);
      ck.testLE(Math.abs(point.at(i1)), Math.abs(point.at(i)), "max abs 1");
      ck.testLE(Math.abs(point.at(i2)), Math.abs(point.at(i)), "max abs 2");
      ck.testExactNumber(Math.abs(point.at(i)), point.maxAbs(), "max abs versus index");
    }

    const boxI = Sample.createPoint3dLattice(1, 1, 2); // the usual 8 box points ...
    const boxJ = Sample.createPoint3dLattice(1.25, 0.7, 2.55);
    const origin = Point3d.create(6.9, 0.11, 0.4);
    const s1 = 0.23;
    const s2 = 0.91;
    const s3 = -1.49;
    const theta = Angle.createDegrees(20);
    const theta90 = Angle.createDegrees(90);
    for (const pointI of boxI) {
      const vectorI = origin.vectorTo(pointI);
      const rotateIXY = vectorI.rotateXY(theta);
      const rotateIXY90 = vectorI.rotate90CCWXY();
      ck.testExactNumber(rotateIXY.z, vectorI.z, "rotateXY preserves z");
      const thetaXY = vectorI.angleToXY(rotateIXY);
      const thetaXY90 = vectorI.angleToXY(rotateIXY90);
      ck.testAngleNoShift(theta, thetaXY, "rotateXY, angleXY");
      ck.testAngleNoShift(thetaXY90, theta90, "rotate90XY, angleXY");

      for (const pointJ of boxJ) {
        const vectorJ = origin.vectorTo(pointJ);
        const sizeQ0 = 0.754;
        const vectorIJcross = vectorI.sizedCrossProduct(vectorJ, sizeQ0)!;
        ck.testCoordinate(sizeQ0, vectorIJcross.magnitude());
        const signedAngle = vectorI.signedAngleTo(vectorJ, vectorIJcross);
        ck.testAngleNoShift(
          vectorI.angleTo(vectorJ),
          signedAngle,
          "cross product used consistently for signed angle");
        ck.testCoordinate(
          vectorJ.angleTo(vectorI).radians,
          vectorI.signedAngleTo(vectorJ, vectorIJcross).radians,
          "cross product used consistently for reverse order signed angle");

        const vectorQ = vectorIJcross.plus(vectorI.scale(0.219));
        ck.testVector3d(vectorJ, vectorI.plus(vectorI.vectorTo(vectorJ)));
        ck.testPoint3d(
          origin.plus3Scaled(vectorI, s1, vectorJ, s2, vectorQ, s3),
          origin.plusScaled(vectorI, s1).plus2Scaled(vectorJ, s2, vectorQ, s3));
        /* be sure to exercise interpolatePointAndTangent with fractions on both sides of 0.5 */
        const vectorIJ = pointI.vectorTo(pointJ);
        const vectorIJV = vectorI.vectorTo(vectorJ);
        const unitIJV = vectorI.unitVectorTo(vectorJ);
        ck.testVector3d(vectorIJ, vectorIJV, "vectorTo between points, vectors");
        if (ck.testPointer(unitIJV)) {
          ck.testParallel(unitIJV, vectorIJ);
          ck.testCoordinate(unitIJV.dotProduct(vectorIJV), vectorI.distance(vectorJ));
        }
        for (const f of [0.1, 0.5, 0.9, 1.1]) {
          const ray = pointI.interpolatePointAndTangent(f, pointJ, 1.0);
          const point = pointI.interpolate(f, pointJ);
          ck.testPoint3d(point, ray.origin);
          ck.testVector3d(vectorIJ, ray.direction);
        }
        /* remark -- we trust that:
        *  pointI and pointJ are never equal
        * vectorI and vectorJ are never equal or parallel
        * vectorI and vectorJ are never parallel to a principal axis
        */
        const unitIJ = pointI.unitVectorTo(pointJ)!;
        ck.testCoordinate(unitIJ.dotProduct(vectorIJ), pointI.distance(pointJ));
        const fIJ = vectorI.fractionOfProjectionToVector(vectorJ);
        const perpVector = vectorI.minus(vectorJ.scale(fIJ));
        ck.testPerpendicular(vectorJ, perpVector, "projection vector");

        const rotateI90 = vectorI.rotate90Towards(vectorJ);
        if (ck.testPointer(rotateI90)) {
          ck.testPerpendicular(vectorI, rotateI90);
          const cross = vectorI.crossProduct(rotateI90);
          ck.testParallel(cross, vectorIJcross);
        }
      }
    }
    ck.checkpoint("Point3d.Diffs");
    expect(ck.getNumErrors()).equals(0);
  });

  it("createFrom", () => {
    const ck = new bsiChecker.Checker();
    const pointA = Point3d.createFrom({ x: 1, y: 2 });
    const pointB = Point3d.createFrom({ x: 1, y: 2, z: 3 });
    const pointA1 = Point3d.createFrom(new Float64Array([1, 2]));
    const pointB1 = Point3d.createFrom(new Float64Array([1, 2, 3]));
    ck.testPoint3d(pointA, pointA1);
    ck.testPoint3d(pointB, pointB1);
    const pointC = Point3d.createFrom(new Float64Array([1]));
    ck.testPoint3d(pointC, Point3d.create(1, 0, 0));
    const vectorA = Vector3d.createFrom({ x: 1, y: 2 });
    const vectorB = Vector3d.createFrom({ x: 1, y: 2, z: 3 });
    const vectorA1 = Vector3d.createFrom(new Float64Array([1, 2]));
    const vectorB1 = Vector3d.createFrom(new Float64Array([1, 2, 3]));
    ck.testVector3d(vectorA, vectorA1);
    ck.testVector3d(vectorB, vectorB1);
    const vectorC = Vector3d.createFrom(new Float64Array([1]));
    ck.testVector3d(vectorC, Vector3d.create(1, 0, 0));

    ck.testExactNumber(0, Point3d.createFrom(new Float64Array([])).maxAbs());
    ck.testExactNumber(0, Vector3d.createFrom(new Float64Array([])).maxAbs());
    expect(ck.getNumErrors()).equals(0);
  });

});
