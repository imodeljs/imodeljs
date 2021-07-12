/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as fs from "fs";
import { BSplineCurve3d } from "../../bspline/BSplineCurve";
import { Arc3d } from "../../curve/Arc3d";
import { ConstructCurveBetweenCurves } from "../../curve/ConstructCurveBetweenCurves";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Path } from "../../curve/Path";
import { StrokeOptions } from "../../curve/StrokeOptions";
import { Angle } from "../../geometry3d/Angle";
import { AngleSweep } from "../../geometry3d/AngleSweep";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Plane3dByOriginAndVectors } from "../../geometry3d/Plane3dByOriginAndVectors";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Range3d } from "../../geometry3d/Range";
import { Ray3d } from "../../geometry3d/Ray3d";
import { Transform } from "../../geometry3d/Transform";
import { PolyfaceBuilder } from "../../polyface/PolyfaceBuilder";
import { Sample } from "../../serialization/GeometrySamples";
import { IModelJson } from "../../serialization/IModelJsonSchema";
import { Cone } from "../../solid/Cone";
import { RotationalSweep } from "../../solid/RotationalSweep";
import { RuledSweep } from "../../solid/RuledSweep";
import { SolidPrimitive } from "../../solid/SolidPrimitive";
import { Sphere } from "../../solid/Sphere";
import { SweepContour } from "../../solid/SweepContour";
import { TorusPipe } from "../../solid/TorusPipe";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";
import { prettyPrint } from "../testFunctions";

/* eslint-disable no-console */
let outputFolderPath = "./src/test/output";
// Output folder typically not tracked by git... make directory if not there
if (!fs.existsSync(outputFolderPath))
  fs.mkdirSync(outputFolderPath);
outputFolderPath = `${outputFolderPath}/`;

function verifyUnitPerpendicularFrame(ck: Checker, frame: Transform, source: any) {
  ck.testTrue(frame.matrix.isRigid(), "perpendicular frame", source);
}

function exerciseUVToWorld(ck: Checker, s: SolidPrimitive, u: number, v: number, deltaUV: number) {
  if ("UVFractionToPoint" in s && "UVFractionToPointAndTangents" in s) {
    const u1 = u + deltaUV;
    const v1 = v + deltaUV;
    // IF .. the solid is reasonably smooth and wraps a full circle, the angle (in degrees) is 360/deltaUV.
    const toleranceDegrees = 10.0 * 360.0 * deltaUV;

    const point00 = (s as any).UVFractionToPoint(u, v);
    const point10 = (s as any).UVFractionToPoint(u1, v);
    const point01 = (s as any).UVFractionToPoint(u, v1);
    const plane00 = (s as any).UVFractionToPointAndTangents(u, v) as Plane3dByOriginAndVectors;
    const vector10 = Vector3d.createStartEnd(point00, point10);
    const vector01 = Vector3d.createStartEnd(point00, point01);
    vector10.scaleInPlace(1.0 / deltaUV);
    vector01.scaleInPlace(1.0 / deltaUV);
    ck.testPoint3d(point00, plane00.origin, "same point on variant evaluators");
    if (!ck.testLT(vector10.angleTo(plane00.vectorU).degrees, toleranceDegrees))
      console.log(" U", vector10, plane00.vectorU);
    if (!ck.testLT(vector01.angleTo(plane00.vectorV).degrees, toleranceDegrees))
      console.log(" V", vector01, plane00.vectorV);

  }

}
function exerciseSolids(ck: Checker, solids: GeometryQuery[], _name: string) {
  const scaleTransform = Transform.createFixedPointAndMatrix(Point3d.create(1, 2, 2), Matrix3d.createUniformScale(2));
  for (const s of solids) {
    if (s instanceof SolidPrimitive) {
      const s1 = s.clone()!;
      ck.testFalse(s1.tryTransformInPlace(Transform.createZero()));
      ck.testFalse(s1.isAlmostEqual(LineSegment3d.createXYXY(0, 0, 1, 1)));
      if (ck.testPointer(s1, "solid clone") && s1) {
        ck.testTrue(s1.isSameGeometryClass(s), "Clone class match");
        ck.testTrue(s1.isAlmostEqual(s), "solid clone matches original");
        const s2 = s.cloneTransformed(scaleTransform);
        if (ck.testPointer(s2) && s1.tryTransformInPlace(scaleTransform)) {
          ck.testFalse(s2.isAlmostEqual(s), "scaled is different from original");
          ck.testTrue(s1.isAlmostEqual(s2), "clone transform commute");
          const range2A = Range3d.create();
          const range2B = Range3d.create();
          s2.extendRange(range2A);
          s.extendRange(range2B, scaleTransform);
          range2B.expandInPlace(0.10 * range2B.diagonal().magnitude());    // HACK -- ranges are not precise.  Allow fuzz.
          if (!ck.testTrue(range2B.containsRange(range2A), "range commutes with scale transform",
            range2B.low.toJSON(),
            range2A.low.toJSON(),
            range2A.high.toJSON(),
            range2B.high.toJSON())) {
            console.log("s", prettyPrint(IModelJson.Writer.toIModelJson(s)));
            console.log("s.range", prettyPrint(s.range()));
            console.log("s1", prettyPrint(IModelJson.Writer.toIModelJson(s1)));
            console.log("s2", prettyPrint(IModelJson.Writer.toIModelJson(s2)));
            const range2C = Range3d.create();
            const range2D = Range3d.create();
            s2.extendRange(range2C);
            s.extendRange(range2D, scaleTransform);
          }

          exerciseUVToWorld(ck, s, 0.01, 0.02, 0.0001);
        }
      }
      const frame = s.getConstructiveFrame();
      if (ck.testPointer(frame, "getConstructiveFrame") && frame) {
        verifyUnitPerpendicularFrame(ck, frame, s);
      }
      const sC = s.clone();
      if (sC instanceof SolidPrimitive) {
        sC.capped = !sC.capped;
        if (s instanceof TorusPipe)
          ck.testBoolean(s.getSweepAngle().isFullCircle, s.isAlmostEqual(sC), "complete TorusPipe cap status is incidental");
        else
          ck.testFalse(s.isAlmostEqual(sC), "isAlmostEqual should detected cap change.");
      }
    }
  }
}
describe("Solids", () => {
  it("Cones", () => {
    const ck = new Checker();
    const cones = Sample.createCones();
    exerciseSolids(ck, cones, "Cones");
    for (const c of cones) {
      const rA = c.getRadiusA();
      const rB = c.getRadiusB();
      const rMax = c.getMaxRadius();
      ck.testLE(rA, rMax);
      ck.testLE(rB, rMax);
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("ConeUVToPoint", () => {
    // create true cones to allow simple checks ...
    const ck = new Checker();

    for (const cone of [
      Cone.createAxisPoints(Point3d.create(0, 0, 0), Point3d.create(0, 0, 1), 1, 0, false)!,
      Cone.createAxisPoints(Point3d.create(1, 3, 2), Point3d.create(3, 9, 2), 4, 2, false)!]) {
      for (const u of [0.0, 0.25, 1.0]) {
        const plane0 = cone.uvFractionToPointAndTangents(u, 0.0);
        const plane1 = cone.uvFractionToPointAndTangents(u, 1.0);
        const vector01 = Vector3d.createStartEnd(plane0.origin, plane1.origin);
        for (const v of [0.0, 0.40, 0.80]) {
          const pointV = cone.uvFractionToPoint(u, v);
          ck.testPoint3d(pointV, plane0.origin.interpolate(v, plane1.origin));
          const planeV = cone.uvFractionToPointAndTangents(u, v);
          ck.testVector3d(vector01, planeV.vectorV, "V derivative is side stroke");
          ck.testVector3d(planeV.vectorU, plane0.vectorU.interpolate(v, plane1.vectorU), "U derivative interpolates");
        }
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("ConeConstructionErrors", () => {
    const ck = new Checker();
    const centerA = Point3d.create(1, 2, 3);
    const centerB = Point3d.create(4, -1, 2);
    const centerC = Point3d.create(0, 3, 5);
    ck.testUndefined(Cone.createAxisPoints(centerA, centerA, 1, 1, false), "no duplicated center for cone");
    ck.testUndefined(Cone.createAxisPoints(centerA, centerB, 1, -3, false), "0 radius point may not be interior");
    ck.testUndefined(Cone.createAxisPoints(centerA, centerB, 0, 0, false), "must have at least one nonzero radius");

    const coneABCapped = Cone.createAxisPoints(centerA, centerB, 1, 1, true)!;
    const coneABCapped22 = Cone.createAxisPoints(centerA, centerB, 2, 2, true)!;
    const coneABOpen = Cone.createAxisPoints(centerA, centerB, 1, 1, false)!;
    const coneACCapped = Cone.createAxisPoints(centerA, centerC, 1, 1, true)!;

    ck.testFalse(coneABCapped.isAlmostEqual(coneABOpen), "capping difference detected");
    ck.testFalse(coneACCapped.isAlmostEqual(coneABCapped), "cones with different axis");
    ck.testFalse(coneABCapped22.isAlmostEqual(coneABCapped), "cones with different radii");
    ck.testFalse(coneABCapped.isAlmostEqual(LineSegment3d.createXYXY(1, 2, 3, 4)), "non-cone other");
    // hm .. just make sure these default cases come back.
    ck.testPointer(coneABCapped.strokeConstantVSection(0.2, undefined, undefined));
    ck.testPointer(coneABCapped.strokeConstantVSection(0.2, undefined, StrokeOptions.createForFacets()));
    expect(ck.getNumErrors()).equals(0);
  });

  it("Spheres", () => {
    const ck = new Checker();
    const spheres = Sample.createSpheres(true);
    exerciseSolids(ck, spheres, "Spheres");
    for (const s of spheres) {
      const r = s.trueSphereRadius();
      if (r !== undefined) {
        ck.testCoordinate(r, s.cloneVectorX().magnitude(), s);
        ck.testCoordinate(r, s.cloneVectorY().magnitude(), s);
        ck.testCoordinate(r, s.cloneVectorZ().magnitude(), s);
      }
      const sectionA = s.strokeConstantVSection(0.25, undefined);
      const sectionB = s.strokeConstantVSection(0.25, 32);
      const options = StrokeOptions.createForCurves();
      options.angleTol = Angle.createDegrees(360 / 12);
      const sectionC = s.strokeConstantVSection(0.25, undefined, options);
      ck.testExactNumber(sectionA.numPoints(), 17);
      ck.testExactNumber(sectionB.numPoints(), 33, "explicit stroke count");
      ck.testExactNumber(sectionC.numPoints(), 13, "stroke count by angle");
    }

    const origin = Point3d.create(1, 2, 3);
    const vectorX = Vector3d.create(3, 0, -1);
    const vectorZ = vectorX.crossProductXYZ(0, 1, 0);
    const rA = 3.0;
    const sweep = AngleSweep.createFullLatitude();
    const northSweep = AngleSweep.createStartEndDegrees(0, 90);
    ck.testUndefined(Sphere.createDgnSphere(origin, vectorX, vectorX, rA, rA, sweep, true));
    const northA = Sphere.createDgnSphere(origin, vectorX, vectorZ, rA, rA, northSweep, true)!;
    const northB = Sphere.createDgnSphere(origin, vectorX, vectorZ, rA, rA, northSweep, false)!;
    ck.testFalse(northA.isAlmostEqual(LineSegment3d.createXYZXYZ(1, 2, 3, 4, 5, 6)), "sphere.isAlmostEqual(nonSphere)");
    ck.testFalse(northA.isAlmostEqual(northB), "capping difference");

    expect(ck.getNumErrors()).equals(0);
  });
  it("TransformedSpheres", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const origin = Point3d.createZero();
    const radius = 2.0;
    const spheres = [Sphere.createCenterRadius(origin, radius), Sphere.createCenterRadius(origin, radius, AngleSweep.createStartEndDegrees(0, 45)), Sphere.createCenterRadius(origin, radius, AngleSweep.createStartEndDegrees(0, -45))];
    const options = StrokeOptions.createForFacets();
    options.needNormals = true;
    let x0 = 0;
    const y0 = 0;
    for (const sphere of spheres) {
      transformAndFacet(allGeometry, sphere, Transform.createIdentity(), options, x0, y0);
      transformAndFacet(allGeometry, sphere, Transform.createFixedPointAndMatrix(Point3d.create(radius, 0, 0), Matrix3d.createDirectionalScale(Vector3d.unitX(), -1.0)), options, x0, y0);
      transformAndFacet(allGeometry, sphere, Transform.createFixedPointAndMatrix(Point3d.create(0, radius, 0), Matrix3d.createDirectionalScale(Vector3d.unitY(), -1.0)), options, x0, y0);
      transformAndFacet(allGeometry, sphere, Transform.createFixedPointAndMatrix(Point3d.create(0, 0, radius), Matrix3d.createDirectionalScale(Vector3d.unitZ(), -1.0)), options, x0, y0);
      x0 += 5.0 * radius;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "Solids", "TransformedSpheres");
    expect(ck.getNumErrors()).equals(0);
  });

  it("Boxes", () => {
    const ck = new Checker();
    const boxes = Sample.createBoxes();
    exerciseSolids(ck, boxes, "Boxes");
    for (const b of boxes) {
      const vectorX = b.getVectorX();
      const vectorY = b.getVectorY();
      const vectorZ = b.getVectorZ();
      // well defined box will have independent vectors .
      const matrix = Matrix3d.createColumns(vectorX, vectorY, vectorZ);
      ck.testTrue(matrix.inverse() !== undefined, "Expect sample box to have good coordinate frame.");
    }
    expect(ck.getNumErrors()).equals(0);
  });
  it("TorusPipes", () => {
    const ck = new Checker();
    exerciseSolids(ck, Sample.createTorusPipes(), "TorusPipes");

    const frame = Transform.createIdentity();
    const halfSweep = Angle.createDegrees(180);
    ck.testUndefined(TorusPipe.createInFrame(frame, 1, 3, halfSweep, true));
    ck.testUndefined(TorusPipe.createInFrame(frame, 0, 0, halfSweep, true));
    ck.testUndefined(TorusPipe.createInFrame(frame, 2, 0, halfSweep, true));
    ck.testUndefined(TorusPipe.createInFrame(frame, 2, 1, Angle.createDegrees(0), true));
    ck.testUndefined(TorusPipe.createInFrame(frame, 2, 1, Angle.createDegrees(0), true));

    const frameA = Transform.createOriginAndMatrix(Point3d.create(1, 2, 3), Matrix3d.createScale(1, 1, 1));
    const frameB = Transform.createOriginAndMatrix(Point3d.create(1, 2, 3), Matrix3d.createScale(1, 1, -1)); // with negative determinant to trigger reversal logic
    const torusA = TorusPipe.createInFrame(frameA, 3, 1, halfSweep, true);
    const torusB = TorusPipe.createInFrame(frameB, 3, 1, halfSweep, true);    // z will be reverse so that it matches torusA!
    ck.testPointer(torusA);
    ck.testPointer(torusB);
    ck.testTrue(torusA!.isAlmostEqual(torusB!));
    const negativeSweep = Angle.createDegrees(-10);
    const torusC = TorusPipe.createInFrame(frameA, 3, 1, negativeSweep, true)!;
    ck.testTrue(torusC.getSweepAngle().degrees > 0.0);    // confirm that the angle got reversed

    expect(ck.getNumErrors()).equals(0);
  });
  it("LinearSweeps", () => {
    const ck = new Checker();
    exerciseSolids(ck, Sample.createSimpleLinearSweeps(), "LinearSweeps");
    expect(ck.getNumErrors()).equals(0);
  });

  it("RotationalSweeps", () => {
    const ck = new Checker();
    const sweeps = Sample.createSimpleRotationalSweeps();
    exerciseSolids(ck, sweeps, "RotationalSweeps");

    const line = LineSegment3d.createXYXY(1, 4, 2, -1);
    const contour = Path.create(line);
    ck.testUndefined(RotationalSweep.create(contour, Ray3d.createXYZUVW(0, 0, 0, 0, 0, 0), Angle.createDegrees(180), false));
    expect(ck.getNumErrors()).equals(0);
  });
  it("RotationalSweepTransform", () => {
    const ck = new Checker();
    const sweeps = Sample.createSimpleRotationalSweeps();
    const transforms = [
      Transform.createTranslationXYZ(10, 0, 0),
      Transform.createTranslationXYZ(0, 20, 0),
      Transform.createTranslationXYZ(20, 0, 0), // Maybe harder than first pass because dx changes?
      Transform.createOriginAndMatrix(Point3d.create(0, 0, 0), Matrix3d.createUniformScale(2)),
      Transform.createOriginAndMatrix(Point3d.create(0, 10, 0), Matrix3d.createUniformScale(2))];
    const allGeometry: GeometryQuery[] = [];
    let dy = 0;
    const unitBox = Sample.createRangeEdges(Range3d.createXYZXYZ(0, 0, 0, 1, 3, 0.25))!;
    /*
        for (const s of sweeps) {
          GeometryCoreTestIO.captureGeometry(allGeometry, s.clone(), 0, 0);
        }
        */
    for (let sampleIndex = 0; sampleIndex < sweeps.length; sampleIndex += 2) {  // increment by 2 to skip cap variants
      let dx = 100;
      const s = sweeps[sampleIndex];
      // GeometryCoreTestIO.captureGeometry(allGeometry, s.clone(), 0, 0);
      // GeometryCoreTestIO.captureGeometry(allGeometry, s.clone(), 0.5 * dx, dy);
      // GeometryCoreTestIO.captureGeometry(allGeometry, s.clone(), dx, 0.5 * dy);
      // GeometryCoreTestIO.captureGeometry(allGeometry, s.clone(), dx, dy);
      GeometryCoreTestIO.captureGeometry(allGeometry, unitBox.clone(), dx, dy);
      const range = s.range();
      const rangeEdges = Sample.createRangeEdges(range)!;
      GeometryCoreTestIO.captureGeometry(allGeometry, rangeEdges, dx, dy);
      for (let transformIndex = 0; transformIndex < 4; transformIndex++) {
        const transform = transforms[transformIndex];
        GeometryCoreTestIO.captureGeometry(allGeometry, unitBox.clone(), dx, dy);
        const s1 = s.cloneTransformed(transform);
        GeometryCoreTestIO.captureGeometry(allGeometry, s.clone(), dx, dy);
        GeometryCoreTestIO.captureGeometry(allGeometry, s1, dx, dy);
        /*
        GeometryCoreTestIO.captureGeometry(allGeometry, s.clone()!, dx, dy);
        for (const vFraction of [0.25, 0.5, 0.75]) {
          const section = s1.constantVSection(vFraction)!;
          GeometryCoreTestIO.captureGeometry(allGeometry, section, dx, dy);
        }

        const range1 = s1.range();
        const rangeEdges1 = Sample.createRangeEdges(range1)!;
        GeometryCoreTestIO.captureGeometry(allGeometry, rangeEdges1, dx, dy);
        */
        dx += 100.0;
      }
      dy += 100.0;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "TransformedSolids", "RotationalSweep");
    expect(ck.getNumErrors()).equals(0);
  });

  it("RuledSweeps", () => {
    const ck = new Checker();
    const sweeps = Sample.createRuledSweeps(true, true);
    exerciseSolids(ck, sweeps, "RuledSweeps");

    for (const s of sweeps) {
      const section = s.constantVSection(0.1);
      ck.testPointer(section, "constant V section");
    }
    ck.testUndefined(RuledSweep.create([Path.create()], false));

    const rectangleA = Path.create(Sample.createRectangleXY(0, 0, 2, 1, 0));
    const rectangleB = Path.create(Sample.createRectangleXY(0, 0, 2, 1, 1));
    const rectangleC = Path.create(Sample.createRectangleXY(0, 0, 2, 1, 2));

    const sweep2 = RuledSweep.create([rectangleA.clone()!, rectangleB.clone()!], false)!;
    const sweep3 = RuledSweep.create([rectangleA.clone()!, rectangleB.clone()!, rectangleC.clone()!], false)!;
    ck.testFalse(sweep2.isAlmostEqual(sweep3));
    expect(ck.getNumErrors()).equals(0);
  });

  it("Ellipsoids", () => {
    const ck = new Checker();
    const ellipsoids = Sample.createEllipsoids();
    exerciseSolids(ck, ellipsoids, "Ellipsoids");
    for (const e of ellipsoids) {
      const radius = e.trueSphereRadius();
      ck.testUndefined(radius, "Ellipsoid is nonSpherical");
      const localToWorld = e.cloneLocalToWorld();
      ck.testPoint3d(localToWorld.getOrigin(), e.cloneCenter());
      expect(ck.getNumErrors()).equals(0);
    }
  });
  it("SweepContour", () => {
    const ck = new Checker();
    // EDL 1/7/18 tried to make sweep constructions fail with all data on z axis.
    // generic line frenet frame defeats this.  so suppress the test.
    /*
        const zLine = LineSegment3d.createXYZXYZ(0, 0, 0, 0, 0, 5);
        const zPath = Path.create(zLine);
        const zDir = Vector3d.unitZ();
        const zRay = Ray3d.createXYZUVW(0, 0, 0, zDir.z, zDir.y, zDir.z);
        ck.testUndefined(SweepContour.createForLinearSweep(zPath, Vector3d.unitZ()));
        ck.testUndefined(SweepContour.createForRotation(zPath, zRay));
    */
    const path = Path.create(LineString3d.create(Sample.createRectangleXY(0, 0, 4, 2, 0)));
    const contourA = SweepContour.createForLinearSweep(path)!;
    const contourB = contourA.cloneTransformed(Transform.createTranslationXYZ(5, 0, 0))!;
    const allGeometry: GeometryQuery[] = [];
    GeometryCoreTestIO.captureGeometry(allGeometry, contourA.getCurves()!.clone(), 0, 0, 0);
    GeometryCoreTestIO.captureGeometry(allGeometry, contourB.getCurves()!.clone(), 0, 0, 0);
    ck.testFalse(contourA.isAlmostEqual(contourB));
    ck.testFalse(contourA.isAlmostEqual(path));
    GeometryCoreTestIO.saveGeometry(allGeometry, "TransformedSolids", "SweepContour");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("CurveCurve", () => {
  it("Mismatches", () => {
    const ck = new Checker();
    const segment = LineSegment3d.createXYZXYZ(1, 2, 2, 4, 2, -1);
    const arc = Arc3d.createUnitCircle();
    const points = [Point3d.create(0, 0, 0), Point3d.create(1, 1, 0), Point3d.create(3, 1, 0), Point3d.create(3, 0, 0)];
    const bcurve = BSplineCurve3d.createUniformKnots(points, 3)!;
    const linestring = LineString3d.create(points);
    ck.testUndefined(ConstructCurveBetweenCurves.interpolateBetween(segment, 0.5, arc));
    ck.testUndefined(ConstructCurveBetweenCurves.interpolateBetween(segment, 0.5, linestring));
    ck.testUndefined(ConstructCurveBetweenCurves.interpolateBetween(segment, 0.5, bcurve));
    ck.testUndefined(ConstructCurveBetweenCurves.interpolateBetween(arc, 0.5, linestring));
    ck.testUndefined(ConstructCurveBetweenCurves.interpolateBetween(linestring, 0.5, arc));
    ck.testUndefined(ConstructCurveBetweenCurves.interpolateBetween(arc, 0.5, bcurve));
    ck.testUndefined(ConstructCurveBetweenCurves.interpolateBetween(bcurve, 0.5, segment));
    expect(ck.getNumErrors()).equals(0);
  });
});

function transformAndFacet(allGeometry: GeometryQuery[], g: GeometryQuery, transform: Transform, options: StrokeOptions, x0: number, y0: number) {
  const g1 = g.cloneTransformed(transform);
  if (g1) {
    const builder = PolyfaceBuilder.create(options);
    builder.addGeometryQuery(g1);
    const facets = builder.claimPolyface();
    GeometryCoreTestIO.captureGeometry(allGeometry, facets, x0, y0);
  }
}
