/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// import { Point3d } from "../PointVector";

import { expect } from "chai";
import { BSplineSurface3dH, BSplineSurface3dQuery } from "../../bspline/BSplineSurface";
import { BSplineWrapMode } from "../../bspline/KnotVector";
import { Geometry } from "../../Geometry";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/Plane3dByOriginAndUnitNormal";
import { Point3d } from "../../geometry3d/Point3dVector3d";
import { Range3d } from "../../geometry3d/Range";
import { Transform } from "../../geometry3d/Transform";
// import { BSplineSurface3d } from "../BSplineSurface";
import { Sample } from "../../serialization/GeometrySamples";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";

/* eslint-disable no-console */
function testBasisValues(ck: Checker, data: Float64Array, expectedValue: number = 1) {
  let s = 0.0; for (const a of data) s += a;
  ck.testCoordinate(expectedValue, s, "basis sum");
}
function testBSplineSurface(ck: Checker, surfaceA: BSplineSurface3dQuery) {
  const u0 = 0.25;
  const v0 = 0.30;
  const u1 = 0.5;
  const v1 = 0.8;
  const scaleFactor = 2.0;
  const pointA0 = surfaceA.fractionToPoint(u0, v0);
  const pointA1 = surfaceA.fractionToPoint(u1, v1);
  const transform = Transform.createScaleAboutPoint(pointA0, scaleFactor);
  const surfaceB = surfaceA.cloneTransformed(transform);
  ck.testFalse(surfaceA.isAlmostEqual(surfaceB), "scale changes surface");
  ck.testFalse(surfaceA.isAlmostEqual(0), "isAlmostEqual with nonbspline");
  ck.testTrue(surfaceB.isSameGeometryClass(surfaceA));
  const pointB0 = surfaceB.fractionToPoint(u0, v0);
  const pointB1 = surfaceB.fractionToPoint(u1, v1);
  const frameA0 = surfaceA.fractionToRigidFrame(u0, v0);
  const frameB0 = surfaceB.fractionToRigidFrame(u0, v0);
  if (ck.testPointer(frameA0)
    && ck.testPointer(frameB0)
    && frameA0
    && frameB0) {
    ck.testTransform(frameA0, frameB0);
    const frameA0Inverse = frameA0.inverse();
    if (ck.testPointer(frameA0Inverse)) {
      const rangeA2 = Range3d.create();
      surfaceA.extendRange(rangeA2, frameA0Inverse);
      const planeA2 = Plane3dByOriginAndUnitNormal.create(
        Point3d.createFrom(frameA0.origin),
        frameA0.matrix.columnZ());
      ck.testBoolean(surfaceA.isInPlane(planeA2!),
        Geometry.isSmallMetricDistance(rangeA2.zLength()),
        "Surface planarity test versus range in frame");
    }
  }

  ck.testPoint3d(pointA0, pointB0, "bspline surface scales about point");
  const pointX1 = pointA0.interpolate(scaleFactor, pointA1);
  ck.testPoint3d(pointB1, pointX1, "ScaleAboutPoint effect");

  surfaceA.reverseInPlace(0);
  const pointA0U = surfaceA.fractionToPoint(1.0 - u0, v0);
  ck.testPoint3d(pointA0, pointA0U, " evaluate after u reversal");
  surfaceA.reverseInPlace(1);
  const pointA0UV = surfaceA.fractionToPoint(1.0 - u0, 1.0 - v0);
  ck.testPoint3d(pointA0, pointA0UV, " evaluate after double reversal");

  const rangeA = Range3d.create();
  const rangeB = Range3d.create();
  surfaceA.extendRange(rangeA);
  surfaceB.extendRange(rangeB);
  const rangeA1 = Range3d.create();
  surfaceA.extendRange(rangeA1, transform);
  ck.testRange3d(rangeA1, rangeB, "extendRange applies transform");
  ck.testCoordinate(scaleFactor * rangeA.xLength(), rangeB.xLength());
  ck.testCoordinate(scaleFactor * rangeA.yLength(), rangeB.yLength());
  ck.testCoordinate(scaleFactor * rangeA.zLength(), rangeB.zLength());

  // verify degree, order, and pole layouts in expected "u-major" pole construction
  ck.testExactNumber(1, surfaceA.poleStepUV(0), "u-major u step");
  ck.testExactNumber(surfaceA.numPolesUV(0), surfaceA.poleStepUV(1), "v-major v step");
  ck.testExactNumber(surfaceA.numPolesTotal(), surfaceA.numPolesUV(0) * surfaceA.numPolesUV(1), "pole count is rectangular grid");
  for (const value of [0, 1]) {
    const select = surfaceA.numberToUVSelect(value);
    ck.testExactNumber(surfaceA.numPolesUV(select), surfaceA.numSpanUV(select) + surfaceA.degreeUV(select));
  }

  if (surfaceA instanceof BSplineSurface3dH) {
    const weightedPoles = surfaceA.copyPoints4d();
    const numU = surfaceA.numPolesUV(0);
    const numV = surfaceA.numPolesUV(1);
    for (let i = 0; i < numU; i++) {
      for (let j = 0; j < numV; j++) {
        const pole0 = surfaceA.getPole(i, j)!;
        const pole1 = weightedPoles[i + j * numU].realPointDefault000();
        ck.testPoint3d(pole0, pole1);
      }
    }
    const uKnots = surfaceA.knots[0];
    const vKnots = surfaceA.knots[1];
    const uBasis = uKnots.createBasisArray();
    const vBasis = vKnots.createBasisArray();
    const duBasis = uKnots.createBasisArray();
    const dvBasis = vKnots.createBasisArray();
    const numUSpan = surfaceA.numSpanUV(0);
    const numVSpan = surfaceA.numSpanUV(1);
    for (let i = 0; i < numUSpan; i++) {
      for (let j = 0; j < numVSpan; j++) {
        for (const f of [0.0, 0.3, 0.9]) {
          const uknot = surfaceA.spanFractionToKnot(0, i, f);
          const vknot = surfaceA.spanFractionToKnot(1, j, f);
          const knotPoint4d = surfaceA.knotToPoint4d(uknot, vknot);
          const point3d = surfaceA.knotToPoint(uknot, vknot);
          const uFraction = uKnots.spanFractionToFraction(i, f);
          const vFraction = vKnots.spanFractionToFraction(j, f);
          const fractionPoint = surfaceA.fractionToPoint(uFraction, vFraction);
          const fractionPoint4d = surfaceA.fractionToPoint4d(uFraction, vFraction);
          const fractionPoint4dto3d = fractionPoint4d.realPointDefault000();
          const knotPoint4dto3d = knotPoint4d.realPointDefault000();
          ck.testPoint3d(knotPoint4dto3d, fractionPoint);
          ck.testPoint3d(fractionPoint4dto3d, fractionPoint);
          ck.testPoint3d(point3d, knotPoint4dto3d);
          surfaceA.spanFractionsToBasisFunctions(0, i, f, uBasis, duBasis);
          testBasisValues(ck, uBasis, 1.0);
          testBasisValues(ck, duBasis, 0.0);
          surfaceA.spanFractionsToBasisFunctions(1, j, f, vBasis, dvBasis);
          testBasisValues(ck, vBasis, 1.0);
          testBasisValues(ck, dvBasis, 0.0);
        }
      }
    }

  }
}

describe("BSplineSurface", () => {
  it("BSplineSurface.Hello", () => {
    const ck = new Checker();
    const surfaceA = Sample.createXYGridBsplineSurface(4, 3, 3, 2);
    if (ck.testPointer(surfaceA)) {
      // test that bogus closure setups get rejected . .
      surfaceA.setWrappable(1, BSplineWrapMode.OpenByAddingControlPoints);
      testBSplineSurface(ck, surfaceA);
      ck.testFalse(surfaceA.isClosable(1));
      ck.testFalse(surfaceA.isClosable(0));
    }
    // A rational surface with unit weigths ... This is just a plane
    const surfaceAH1 = Sample.createWeightedXYGridBsplineSurface(4, 3, 3, 2);
    if (ck.testPointer(surfaceAH1))
      testBSplineSurface(ck, surfaceAH1);
    // A rational surface with mild bilinear-patch weight variation.  This is NOT planar ...
    const surfaceAHw = Sample.createWeightedXYGridBsplineSurface(4, 3, 3, 2, 1.0, 1.1, 0.9, 1.0);
    if (ck.testPointer(surfaceAHw))
      testBSplineSurface(ck, surfaceAHw);

    ck.checkpoint("BSplineSurface.Hello");
    expect(ck.getNumErrors()).equals(0);
  });

  it("Wrapped", () => {
    const ck = new Checker();
    const allGeometry = [];
    let dx = 0.0;
    let dy = 0.0;
    for (const orderU of [2, 3, 4, 5]) {
      dy = 0.0;
      for (const orderV of [2, 3, 4, 5]) {
        const bsurf = Sample.createPseudoTorusBsplineSurface(
          4.0, 1.0, // radii
          Math.max(12, orderU + 1), Math.max(6, orderV + 1),    // grid edges
          orderU, orderV);    // order}
        if (ck.testPointer(bsurf)) {

          ck.testTrue(bsurf.isClosable(0));
          ck.testTrue(bsurf.isClosable(1));

          bsurf.tryTranslateInPlace(dx, dy);
          allGeometry.push(bsurf);
        }
        dy += 20.0;
      }
      dx += 20.0;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "BSplineSurface", "Wrapped");
    ck.checkpoint("BSplineSurface.Wrapped");
    expect(ck.getNumErrors()).equals(0);
  });

  it("Cones", () => {
    const ck = new Checker();
    const allGeometry = [];
    let dx = 0.0;
    const dy = 0.0;
    for (const bsurf of [Sample.createConeBsplineSurface(
      Point3d.create(0, 0, 0),
      Point3d.create(0, 0, 1),
      4.0, 1.0, 2),
    Sample.createConeBsplineSurface(
      Point3d.create(0, 0, 0),
      Point3d.create(1, 3, 1),
      4.0, 1.0,
      3)]) {
      if (ck.testPointer(bsurf)) {
        bsurf.tryTranslateInPlace(dx, dy);
        allGeometry.push(bsurf);
        dx += 10.0;
      }
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "BSplineSurface", "createCone");
    ck.checkpoint("BSplineSurface.Wrapped");
    expect(ck.getNumErrors()).equals(0);
  });

});
