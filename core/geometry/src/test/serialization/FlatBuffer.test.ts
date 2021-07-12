/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Checker } from "../Checker";
import { flatbuffers } from "flatbuffers";
import { BGFBAccessors } from "../../serialization/BGFBAccessors";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { AngleSweep } from "../../geometry3d/AngleSweep";
import { Arc3d } from "../../curve/Arc3d";
import { LineString3d } from "../../curve/LineString3d";
import { Sample } from "../../serialization/GeometrySamples";
import { prettyPrint } from "../testFunctions";
import { Transform } from "../../geometry3d/Transform";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Angle } from "../../geometry3d/Angle";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { IModelJson } from "../../serialization/IModelJsonSchema";
import { BentleyGeometryFlatBuffer } from "../../serialization/BentleyGeometryFlatBuffer";
import { CurvePrimitive } from "../../curve/CurvePrimitive";
import { SolidPrimitive } from "../../solid/SolidPrimitive";
import { PointString3d } from "../../curve/PointString3d";
import { AuxChannelDataType } from "../../polyface/AuxData";
import { IntegratedSpiral3d } from "../../curve/spiral/IntegratedSpiral3d";
import { Segment1d } from "../../geometry3d/Segment1d";
import { TaggedNumericData } from "../../polyface/TaggedNumericData";
// cSpell:word flatbuffers
// cSpell:word fbjs
/* eslint-disable no-console, comma-dangle, quote-props */
it("HelloWorld", () => {
  const ck = new Checker();
  const builder = new flatbuffers.Builder(1024);
  const oSegment = BGFBAccessors.DSegment3d.createDSegment3d(builder, 1, 2, 3, 4, 5, 6);
  const oLine = BGFBAccessors.LineSegment.createLineSegment(builder, oSegment);
  builder.finish(oLine);
  const bytes = builder.asUint8Array();
  if (Checker.noisy.flatBuffer)
    console.log({ finalBytes: bytes, lineOffset: oLine });
  const buffer = new flatbuffers.ByteBuffer(bytes);
  const oLineA = BGFBAccessors.LineSegment.getRootAsLineSegment(buffer);
  const oSegmentA = oLineA.segment();

  if (Checker.noisy.flatBuffer)
    console.log({
      lineOffset: oLineA,
      x0: oSegmentA?.point0X(), y0: oSegmentA?.point0Y(), z0: oSegmentA?.point0Z(),
      x1: oSegmentA?.point1X(), y1: oSegmentA?.point1Y(), z1: oSegmentA?.point1Z()
    });

  ck.testExactNumber(1, oSegmentA!.point0X());
  ck.testExactNumber(2, oSegmentA!.point0Y());
  ck.testExactNumber(3, oSegmentA!.point0Z());
  ck.testExactNumber(4, oSegmentA!.point1X());
  ck.testExactNumber(5, oSegmentA!.point1Y());
  ck.testExactNumber(6, oSegmentA!.point1Z());

  expect(ck.getNumErrors()).equals(0);
});

it("HelloVariantGeometry", () => {
  const ck = new Checker();
  testGeometryQueryRoundTrip(ck, LineSegment3d.createXYZXYZ(1, 2, 3, 4, 5, 6));
  testGeometryQueryRoundTrip(ck, Arc3d.createXYZXYZXYZ(1, 2, 3, 4, 5, 6, 8, 3, 2, AngleSweep.createStartEndDegrees(10, 100)));
  testGeometryQueryRoundTrip(ck, LineString3d.create([[1, 2, 3], [6, 2, 4], [2, 3, 1]]));
  testGeometryQueryRoundTrip(ck, PointString3d.create([[1, 2, 3], [6, 2, 4], [2, 3, 1]]));
  const bCurves = Sample.createBsplineCurves(true);
  const hCurves = Sample.createBspline3dHCurves();
  for (const curve of [...bCurves, ...hCurves]) {
    testGeometryQueryRoundTrip(ck, curve);
  }
  expect(ck.getNumErrors()).equals(0);
});

it("HelloCurveVector", () => {
  const ck = new Checker();
  const cvs = [Sample.createCappedArcPath(3.0, 10, 90),
  ...Sample.createSimpleLoops(),
  ...Sample.createSimpleParityRegions(false)];
  for (const cv of cvs) {
    testGeometryQueryRoundTrip(ck, cv);
  }
  expect(ck.getNumErrors()).equals(0);
});

it("HelloMesh", () => {
  const ck = new Checker();
  const meshes = Sample.createSimpleIndexedPolyfaces(1);
  for (const mesh of meshes) {
    testGeometryQueryRoundTrip(ck, mesh);
  }
  expect(ck.getNumErrors()).equals(0);
});

it("HelloSubdivisionSurface", () => {
  const ck = new Checker();
  const mesh = Sample.createTriangularUnitGridPolyface(Point3d.create(0, 0, 0),
    Vector3d.unitX(), Vector3d.unitY(), 3, 3);
  mesh.data.taggedNumericData = new TaggedNumericData(-1000, 0);
  testGeometryQueryRoundTrip(ck, mesh);
  const tg1 = new TaggedNumericData(-1000, 1);
  mesh.data.taggedNumericData = tg1;

  tg1.intData = [1, 2];
  testGeometryQueryRoundTrip(ck, mesh);

  tg1.doubleData = [0.5];
  testGeometryQueryRoundTrip(ck, mesh);

  expect(ck.getNumErrors()).equals(0);
});
it("HelloSpirals", () => {
  const ck = new Checker();
  const clothoid = IntegratedSpiral3d.createRadiusRadiusBearingBearing(
    Segment1d.create(0, 1000),
    AngleSweep.createStartEndDegrees(0, 5),
    Segment1d.create(0, 1),
    Transform.createOriginAndMatrix(Point3d.create(1, 2, 3), Matrix3d.createRotationAroundAxisIndex(2, Angle.createDegrees(-10))),
    "bloss");
  testGeometryQueryRoundTrip(ck, clothoid);
  expect(ck.getNumErrors()).equals(0);
});
/**
 * verify round trip write and read through multiple serialization forms:
 * * Flatbuffer without signature
 * * Flatbuffer with signature
 * * IModelJson
 * @param ck Checker for executing data checks
 * @param g single [[GeometryQuery]] or array of [[GeometryQuery]] to go round trip
 */
function testGeometryQueryRoundTripGo(ck: Checker, g: GeometryQuery | GeometryQuery[] | undefined) {
  if (!g)
    return;
  if (Checker.noisy.flatBuffer) {
    console.log("---------------------------------------");
    console.log("INPUT geometry: ", prettyPrint(IModelJson.Writer.toIModelJson(g)));
  }
  if (g instanceof GeometryQuery) {
    const justTheBytes = BentleyGeometryFlatBuffer.geometryToBytes(g);

    if (ck.testType(justTheBytes, Uint8Array)) {
      const g1 = BentleyGeometryFlatBuffer.bytesToGeometry(justTheBytes);
      if (Array.isArray(g1)) {
        ck.announceError("Unexpected array from flat buffer");
      } if (ck.testType(g1 as (GeometryQuery | undefined), GeometryQuery)) {
        if (!ck.testTrue(g.isAlmostEqual(g1 as GeometryQuery))) {
          console.log("input (mismatch): ", prettyPrint(IModelJson.Writer.toIModelJson(g)));
          console.log("OUTPUT (mismatch): ", prettyPrint(IModelJson.Writer.toIModelJson(g1)));
          const g2 = BentleyGeometryFlatBuffer.bytesToGeometry(justTheBytes);
          if (g2 instanceof GeometryQuery)
            ck.testTrue(g.isAlmostEqual(g2));
        }
      }
    }
    const bytesWithSignature = BentleyGeometryFlatBuffer.geometryToBytes(g, true);
    if (justTheBytes && bytesWithSignature) {
      ck.testExactNumber(justTheBytes.length + 8, bytesWithSignature.length, "Signature adds 8 bytes");
      const g3 = BentleyGeometryFlatBuffer.bytesToGeometry(bytesWithSignature, true);
      ck.testTrue(g3 instanceof GeometryQuery && g.isAlmostEqual(g3), "round trip with signature");
      ck.testUndefined(BentleyGeometryFlatBuffer.bytesToGeometry(justTheBytes, true), "signature state mismatch A");
      ck.testUndefined(BentleyGeometryFlatBuffer.bytesToGeometry(bytesWithSignature, false), "signature state mismatch B");
    }

    const json = IModelJson.Writer.toIModelJson(g);
    if (ck.testDefined(json, "toJson")) {
      const g2 = IModelJson.Reader.parse(json);
      if (ck.testDefined(g2, "to json to geometry") && ck.testTrue(g2 instanceof GeometryQuery) && g2 instanceof GeometryQuery) {
        ck.testTrue(g.isAlmostEqual(g2), "imjs round trip", g);
      }
    }
  } else if (Array.isArray(g)) {
    const justTheBytes = BentleyGeometryFlatBuffer.geometryToBytes(g);
    if (ck.testType(justTheBytes, Uint8Array)) {
      const g1 = BentleyGeometryFlatBuffer.bytesToGeometry(justTheBytes);
      if (!Array.isArray(g1)) {
        ck.announceError("Expected equal length array back from FB");
      } else if (!ck.testExactNumber(g.length, g1.length, "mismatched array lengths from FB")) {

      } else {
        for (let i = 0; i < g.length; i++) {
          ck.testGeometry(g[i], g1[i], ` FB round trip array ${i}`);
        }
      }
    }

  }
}
// Test imjs and flatbuffer round trips.
// If errors are noticed (by comparison of ck.getNumErrors()), do it again for debugging opportunity
export function testGeometryQueryRoundTrip(ck: Checker, g: GeometryQuery | GeometryQuery[] | undefined) {
  const count0 = ck.getNumErrors();
  testGeometryQueryRoundTripGo(ck, g);
  if (count0 !== ck.getNumErrors()) {
    testGeometryQueryRoundTripGo(ck, g);
  }
}

it("HelloSolidPrimitive", () => {
  const ck = new Checker();
  const solids = Sample.createClosedSolidSampler(true);
  const transform = Transform.createFixedPointAndMatrix(Point3d.create(1, 2, 3),
    Matrix3d.createRotationAroundVector(Vector3d.create(4, 3, -1), Angle.createDegrees(17))!);
  for (const s of solids) {
    testGeometryQueryRoundTrip(ck, s);
    s.tryTransformInPlace(transform);
    testGeometryQueryRoundTrip(ck, s);
  }
  expect(ck.getNumErrors()).equals(0);
});

it("HelloBSplineSurface", () => {
  const ck = new Checker();
  const surfaces = [Sample.createXYGridBsplineSurface(6, 5, 4, 2)!,
  Sample.createWeightedXYGridBsplineSurface(7, 6, 5, 4, 1.1, 1.2, 1.3, 1.4)!];
  const _transform = Transform.createFixedPointAndMatrix(Point3d.create(1, 2, 3),
    Matrix3d.createRotationAroundVector(Vector3d.create(4, 3, -1), Angle.createDegrees(17))!);
  for (const s of surfaces) {
    testGeometryQueryRoundTrip(ck, s);
    // s.tryTransformInPlace(transform);
    // testGeometryQueryRoundTrip(ck, s);
  }
  expect(ck.getNumErrors()).equals(0);
});
const arcBytes = new Uint8Array([
  98, 103, 48, 48, 48, 49, 102, 98, 8, 0, 0, 0, 0, 0, 0, 0, 234, 254, 255, 255, 0, 0, 0, 15, 12, 0, 0, 0, 0, 0, 6, 0, 8, 0, 4, 0, 6, 0, 0, 0, 4, 0, 0, 0, 3, 0, 0, 0, 0, 1,
  0, 0, 124, 0, 0, 0, 16, 0, 0, 0, 0, 0, 10, 0, 12, 0, 7, 0, 8, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 2, 4, 0, 0, 0, 22, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 64, 52, 51, 51, 51, 51, 51, 211, 63, 0, 0, 0, 0, 0, 0, 0, 0, 10, 215, 163, 112, 61, 10, 183, 191, 204, 204, 204,
  204, 204, 204, 236, 63, 0, 0, 0, 0, 0, 0, 0, 0, 135, 68, 231, 74, 24, 87, 230, 191, 99, 10, 144, 136, 95, 164, 21, 64, 138, 255, 255, 255, 0, 0, 0, 2, 12, 0,
  0, 0, 0, 0, 6, 0, 98, 0, 4, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 64, 0, 0, 0, 0, 0, 0, 0, 0, 135, 68, 231, 74, 24, 87, 230, 191, 99, 10, 144, 136, 95, 164, 21, 64, 0, 0, 0, 0, 0,
  0, 10, 0, 14, 0, 7, 0, 8, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 2, 12, 0, 0, 0, 0, 0, 6, 0, 92, 0, 4, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 8, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  24, 45, 68, 84, 251, 33, 249, 63]);
const singleArcBytes = new Uint8Array([
  98, 103, 48, 48, 48, 49, 102, 98, 8, 0, 0, 0, 0, 0, 0, 0, 218, 255, 255, 255, 0, 0, 0, 15, 12, 0, 0, 0, 0, 0, 6, 0, 8, 0, 4, 0, 6, 0, 0, 0, 4, 0, 0, 0, 1, 0, 0, 0, 16,
  0, 0, 0, 0, 0, 10, 0, 14, 0, 7, 0, 8, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 2, 12, 0, 0, 0, 0, 0, 6, 0, 92, 0, 4, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 24, 45, 68, 84, 251, 33, 249, 63]);
// lineSegment.fbjs
const singleSegmentBytes = new Uint8Array([
  98, 103, 48, 48, 48, 49, 102, 98, 8, 0, 0, 0, 0, 0, 0, 0, 138, 255, 255, 255, 0, 0, 0, 15, 12, 0, 0, 0, 0, 0, 6, 0, 8, 0, 4, 0, 6, 0, 0, 0, 4, 0, 0, 0, 2, 0, 0, 0, 96,
  0, 0, 0, 4, 0, 0, 0, 178, 255, 255, 255, 0, 0, 0, 1, 12, 0, 0, 0, 0, 0, 6, 0, 58, 0, 4, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 8, 64, 0, 0, 0, 0, 0, 0, 8, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 14, 0, 7, 0, 8, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 1, 12, 0, 0, 0, 0, 0, 6, 0,
  52, 0, 4, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const sphereBytes = new Uint8Array(
  [
    98, 103, 48, 48, 48, 49, 102, 98, 8, 0, 0, 0, 0, 0, 0, 0, 26, 254, 255, 255, 0, 0, 0, 15, 12, 0, 0, 0, 0, 0, 6, 0, 8, 0, 4, 0, 6, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 208,
    1, 0, 0, 44, 1, 0, 0, 160, 0, 0, 0, 4, 0, 0, 0, 114, 255, 255, 255, 0, 0, 0, 7, 4, 0, 0, 0, 222, 254, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16, 64, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16, 64, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 16, 64, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 64, 24, 45, 68, 84, 251, 33, 233, 191, 24, 45, 68, 84, 251, 33, 249, 63, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 10, 0, 12, 0, 7, 0, 8, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 7, 4, 0, 0, 0, 214, 254, 255, 255, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 8, 64, 24, 45, 68, 84, 251, 33, 233, 191, 138, 173, 132, 250, 10, 116, 1, 64, 1, 0, 0, 0, 0, 0, 0, 0, 106, 255, 255, 255, 0,
    0, 0, 7, 12, 0, 0, 0, 0, 0, 6, 0, 130, 0, 4, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 64, 0, 0, 0, 0, 0, 0, 8,
    64, 24, 45, 68, 84, 251, 33, 249, 191, 24, 45, 68, 84, 251, 33, 9, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 14, 0, 7, 0, 8, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0,
    7, 12, 0, 0, 0, 0, 0, 6, 0, 124, 0, 4, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0, 0, 0, 0,
    24, 45, 68, 84, 251, 33, 249, 191, 24, 45, 68, 84, 251, 33, 9, 64, 0, 0, 0, 0, 0, 0, 0, 0]);
it("HelloNativeBytes", () => {
  const ck = new Checker();
  for (const nativeBytes of [sphereBytes, singleSegmentBytes, singleArcBytes, arcBytes]) {
    const g0 = BentleyGeometryFlatBuffer.bytesToGeometry(nativeBytes, true);
    if (Checker.noisy.flatBuffer)
      console.log("nativeBytes=>g types", geometryTypes(g0));
    if (ck.testDefined(g0, "native bytes to geometry") && g0) {
      testGeometryQueryRoundTrip(ck, g0);
      const jsBytes = BentleyGeometryFlatBuffer.geometryToBytes(g0, true);
      if (Checker.noisy.flatBuffer) {
        console.log({ nativeBytesLength: nativeBytes?.length });
        console.log({ jsBytesLength: jsBytes?.length });
      }
      if (ck.testDefined(jsBytes, "geometry to bytes") && jsBytes) {
        const g1 = BentleyGeometryFlatBuffer.bytesToGeometry(jsBytes, true);
        if (ck.testDefined(g1, "jsBytes to geometry") && g1)
          console.log("nativeBytes=>g=>jsBytes=>g types", geometryTypes(g1));
        testGeometryQueryRoundTrip(ck, g1);
        if (isGeometry(g1) && isGeometry(g0)) {
          if (!ck.testGeometry(g0, g1, "nativeBytes=>g0=>jsBytes=>g1")) {
            console.log({ nativeBytesLength: nativeBytes.length });
            console.log({ jsBytesLength: jsBytes.length });
          }
        }
      }

    }
  }
  expect(ck.getNumErrors()).equals(0);
});

function geometryTypes(g: GeometryQuery | GeometryQuery[] | undefined): any {
  if (Array.isArray(g)) {
    const result = [];
    for (const g1 of g)
      result.push(geometryTypes(g1));
    return result;
  } else if (g instanceof CurvePrimitive) {
    return g.curvePrimitiveType;
  } else if (g instanceof SolidPrimitive) {
    return g.solidPrimitiveType;
  } else {
    return typeof (g);
  }
}
function isGeometry(g: GeometryQuery | GeometryQuery[] | undefined): boolean {
  return g instanceof GeometryQuery || Array.isArray(g);
}
it("PolyfaceAuxData", () => {
  const ck = new Checker();
  const polyfaces = Sample.createSimpleIndexedPolyfaces(1.0);
  for (let i = 0; i < 1; i++) {
    const p = polyfaces[i];
    Sample.addAuxDataScalarChannel(p.data, 2,
      "distance", "time",
      5, 2, 3, AuxChannelDataType.Distance,
      (t: number, xyz: Point3d) => (t * xyz.x + t * (t - 1) * xyz.y)
    );
    testGeometryQueryRoundTrip(ck, p);
  }
  expect(ck.getNumErrors()).equals(0);
});
