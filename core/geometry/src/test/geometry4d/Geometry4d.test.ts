/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Angle } from "../../geometry3d/Angle";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Plane3dByOriginAndVectors } from "../../geometry3d/Plane3dByOriginAndVectors";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Range3d } from "../../geometry3d/Range";
import { Transform } from "../../geometry3d/Transform";
import { Map4d } from "../../geometry4d/Map4d";
import { Matrix4d } from "../../geometry4d/Matrix4d";
import { PlaneByOriginAndVectors4d } from "../../geometry4d/PlaneByOriginAndVectors4d";
import { Point4d } from "../../geometry4d/Point4d";
import { SmallSystem } from "../../numerics/Polynomials";
import * as bsiChecker from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";
import { prettyPrint } from "../testFunctions";

/* eslint-disable no-console, @typescript-eslint/naming-convention */

/**
 *
 * @param select 0 for transform0, 1 for transform1
 * @param geometry array to receive new geometry
 * @param map map to evaluate
 * @param dx x offset for constructed geometry
 * @param dy y offset for constructed geometry
 * @param dz z offset for constructed geometry
 */
function appendNPC(select: number, geometry: GeometryQuery[], map: Map4d, dx: number, dy: number, dz: number) {
  const npcRange = Range3d.createXYZXYZ(0, 0, 0, 1, 1, 1);
  const shift = Vector3d.create(dx, dy, dz);
  const xyz = npcRange.corners();
  if (select === 0)
    map.transform0.multiplyPoint3dArrayQuietNormalize(xyz);
  else
    map.transform1.multiplyPoint3dArrayQuietNormalize(xyz);
  for (const point of xyz) {
    point.addInPlace(shift);
  }
  geometry.push(LineString3d.create(xyz[0], xyz[1], xyz[3], xyz[2], xyz[0],
    xyz[4], xyz[5], xyz[7], xyz[6], xyz[4]));
  geometry.push(LineSegment3d.create(xyz[1], xyz[5]));
  geometry.push(LineSegment3d.create(xyz[2], xyz[6]));
  geometry.push(LineSegment3d.create(xyz[3], xyz[7]));
}

class Geometry4dTests {
  constructor(public noisy: boolean = false) { }
  public testSums(ck: bsiChecker.Checker) {
    const point0 = Point4d.create(1, 2, 3, 4);
    const point1 = Point4d.create(2, 3, 4, 1);
    const point2 = Point4d.create(6, -1, 3, 2);
    const point3 = Point4d.create(0.5, 1.5, 2.5, 7);
    const sum3 = point0.plus3Scaled(point1, 3.3, point2, -0.3, point3, 1.2);
    const sum12 = point0.plus2Scaled(point1, 3.3, point2, -0.3).plusScaled(point3, 1.2);
    const result = sum3.minus(sum12);
    ck.testBoolean(false, sum3.isAlmostZero, "4d sums");
    ck.testBoolean(true, result.isAlmostZero, "4d sums");
  }

  public testNormalization(ck: bsiChecker.Checker) {
    const hPoint0 = Point4d.create(1, 2, 3, 0);
    const hPointA = Point4d.create(1, 2, 3, 4);
    const hPointA1 = hPointA.normalizeWeight();
    const hPointB = Point4d.create(4, 1, 2, 2);

    ck.testPointer(hPointA1, "non-null pointer");
    ck.testBoolean(true, hPoint0.normalizeWeight() === undefined, "confirm null normalize");

    const vector01A = hPointB.crossWeightedMinus(hPointA);
    const cPointA = Point3d.create();
    hPointA.realPointDefault000(cPointA);
    const cPointB = hPointB.realPointDefault000();
    const vector01C = cPointA.vectorTo(cPointB);
    ck.testParallel(vector01A, vector01C, "pseudo vector direction");
  }
  public testPoint4d(ck: bsiChecker.Checker) {

    const pointZ = Point4d.fromJSON([]);
    ck.testExactNumber(0, pointZ.maxAbs(), "default fromJSON");
    ck.testExactNumber(0, Point4d.fromJSON([4.0]).maxAbs());
    const hPointA = Point4d.create(1, 2, 3, 4);
    // const hPointA1 = hPointA.normalizeWeight();
    const hPointANeg = hPointA.negate();
    const hPointA1 = hPointA.clone();
    const hPointA2 = Point4d.create(0, 0, 0, 0);
    hPointA2.setFrom(hPointA1);
    ck.testPoint4d(hPointA, hPointA2);

    const unitVectors = [Point4d.unitX(), Point4d.unitY(), Point4d.unitZ(), Point4d.unitW()];
    const cc = new Float64Array([2, 3, 5, 4]);
    const pointC = Point4d.createFromPackedXYZW(cc);
    for (let i = 0; i < 4; i++) {
      ck.testExactNumber(cc[i], unitVectors[i].dotProduct(pointC));
      const a = 2.0 + i;
      const pointCX = pointC.plusScaled(unitVectors[i], a); // introduce diffs.
      ck.testCoordinate(a, pointC.maxDiff(pointCX));

      const pointAMinusC = hPointA.minus(pointC);
      ck.testCoordinate(pointAMinusC.magnitudeXYZW(), hPointA.distanceXYZW(pointC));
      ck.testCoordinate(pointAMinusC.magnitudeXYZW() * pointAMinusC.magnitudeXYZW(),
        hPointA.distanceSquaredXYZW(pointC));
    }

    const pointD = Point4d.createZero();
    const pointD2 = Point4d.createZero();
    Point4d.create(cc[0], cc[1], cc[2], cc[3], pointD);  // create with supplied target.
    ck.testPoint4d(pointC, pointD);
    pointC.clone(pointD2);
    ck.testPoint4d(pointD2, pointC);

    const pointAPlusC = hPointA.plus(pointC);
    const pointAPlusCScaled = hPointA.plusScaled(pointC, 1.0);
    ck.testPoint4d(pointAPlusC, pointAPlusCScaled, "Add versus add with scale");
    ck.testCoordinate(hPointA.magnitudeXYZW(), hPointANeg.magnitudeXYZW());

    const uvw = Vector3d.create(4, 2, 9);
    const point0 = Point4d.createFromPointAndWeight(uvw, 0);
    const point1 = Point4d.createFromPointAndWeight(uvw, 1);
    const b = 2.0;
    const point2 = Point4d.createFromPointAndWeight(uvw, b);
    const xyz0 = point0.realPoint();
    const xyz1 = point1.realPoint();
    ck.testUndefined(xyz0, "zero-weight point rejected by normalize");
    const xyz2 = point2.realPoint();
    const xyz0A = point0.realPointDefault000();
    ck.testPointer(xyz0A);
    ck.testExactNumber(0, xyz0A.magnitude(), "default 000");
    ck.testPoint4d(point1, Point4d.createFromPointAndWeight(xyz2!, 0.50).normalizeWeight()!);
    ck.testPointer(xyz1, "simple normalize");
  }

}
describe("Geometry4d.HelloWorld", () => {
  it("Geometry4d sums", () => {
    const ck = new bsiChecker.Checker();
    const source = new Geometry4dTests(false);
    source.testSums(ck);
    source.testPoint4d(ck);
    ck.checkpoint("End Geometry4d.HelloWorld");
    expect(ck.getNumErrors()).equals(0);
  });

  it("DotProducts", () => {
    const ck = new bsiChecker.Checker();
    const origin = Point4d.create(2, 5, 1, 3);
    const vectorU = Point4d.create(5, 3, 9, 0.2);
    const vectorV = Point4d.create(0.3, 0.9, -0.7, 1.2);
    const targetU = origin.plus(vectorU);
    const targetV = origin.plus(vectorV);
    const dot = vectorU.dotProduct(vectorV);
    const dotTarget = origin.dotVectorsToTargets(targetU, targetV);
    ck.testCoordinate(dot, dotTarget, "dotTarget");
    ck.checkpoint("Geometry4d.DotProducts");
    expect(ck.getNumErrors()).equals(0);
  });

  it("Set", () => {
    const ck = new bsiChecker.Checker();
    const pointA = Point4d.create(1, 2, 3, 4);
    const pointZ = Point4d.createZero();
    pointA.set();    // should become zero!!!
    ck.testPoint4d(pointA, pointZ, "implicit zero");
    ck.checkpoint("Set");
    expect(ck.getNumErrors()).equals(0);
  });

  it("ResultInPlace", () => {
    const ck = new bsiChecker.Checker();
    const dataA = Point4d.create(1, 2, 3, 4);
    const dataB1 = Point4d.createZero();
    const dataB2 = Point4d.createZero();
    dataA.scale(-1, dataB1);
    dataA.negate(dataB2);
    ck.testPoint4d(dataB1, dataB2, "negate, scale");
    ck.checkpoint("Set");
    expect(ck.getNumErrors()).equals(0);
  });

  it("NormalizeXYZW", () => {
    const ck = new bsiChecker.Checker();
    const pointA = Point4d.create(1, 2, 3, 4);
    const pointB = pointA.normalizeXYZW()!;
    const alpha = pointA.x / pointB.x;
    ck.testCoordinate(1.0, pointB.magnitudeXYZW());
    const pointC1 = Point4d.createZero();
    const pointC = pointB.scale(alpha, pointC1);
    ck.testPoint4d(pointA, pointC, "scale steps");
    ck.checkpoint("NormalizeXYZW");
    expect(ck.getNumErrors()).equals(0);
  });

  it("AddScaled", () => {
    const ck = new bsiChecker.Checker();
    const pointA = Point4d.create(1, 2, 3, 4);
    const pointB = Point4d.create(0.3, 0.2, -0.4, 1.2);
    const pointC = Point4d.create(11, 7, -4, 9);
    const a = 3.1;
    const b = 2.9;
    const pointAaBb = Point4d.createAdd2Scaled(pointA, a, pointB, b);
    const pointAaBbC0 = Point4d.createAdd3Scaled(pointA, a, pointB, b, pointC, 0);
    const pointC0ABb = Point4d.createAdd3Scaled(pointC, 0, pointA, a, pointB, b);
    ck.testPoint4d(pointAaBb, pointAaBbC0, "createAdd2Scaled");
    ck.testPoint4d(pointAaBb, pointC0ABb, "createAdd2Scaled");
    ck.checkpoint("Set");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("Geometry4d.Hello3d", () => {
  it("Geometry4d normalization", () => {
    const ck = new bsiChecker.Checker();
    const source = new Geometry4dTests(false);
    source.testNormalization(ck);
    ck.checkpoint("End Geometry4d.Hello3d");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("Geometry4d.BoxMap", () => {
  it("BoxMap", () => {
    const ck = new bsiChecker.Checker();
    const lowA = Point3d.create(1, 2, 4);
    const highA = Point3d.create(2, 3, 5);
    const lowB = Point3d.create(100, 100, 100);
    const highB = Point3d.create(101, 101, 101);

    if (bsiChecker.Checker.noisy.boxMap) {
      console.log("lowA", lowA);
      console.log("highA", highA);
      console.log("lowB", lowB);
      console.log("highB", highB);
    }
    const map = Map4d.createBoxMap(lowA, highA, lowB, highB);
    const map2 = Map4d.createIdentity();
    const map3 = Map4d.createBoxMap(lowA, highA, lowB, highB, map2);
    ck.testPointer(map);
    ck.testPointer(map3);
    ck.testTrue(map2 === map3, "reuse createBoxMap result");
    ck.testTrue(map!.isAlmostEqual(map3!), "verify reused map");
    ck.testUndefined(Map4d.createBoxMap(lowA, highA, lowB, lowB));
    ck.testUndefined(Map4d.createBoxMap(highA, highA, lowB, highB));
    ck.testUndefined(Map4d.createVectorFrustum(Point3d.create(0, 0, 1),
      Vector3d.unitX(), Vector3d.unitY(), Vector3d.unitY(), 0.8), "expect no map from singular axes");
    const map4 = Map4d.fromJSON({});
    ck.testTrue(map4.isAlmostEqual(Map4d.createIdentity()));
    if (ck.testPointer(map, "Expect box map") && map) {
      if (bsiChecker.Checker.noisy.boxMap) {
        console.log("A==>B", prettyPrint(map.transform0));
        console.log("B==>A", prettyPrint(map.transform1));
      }
      for (const fractionPoint of [Point3d.create(0.4, 0, 0), Point3d.create(0, 0.2, 0), Point3d.create(0, 0, 1.1), Point3d.create(0.3, 0.5, 0.2)]) {
        const pointA0 = lowA.interpolateXYZ(fractionPoint.x, fractionPoint.y, fractionPoint.z, highA);
        const pointB0 = lowB.interpolateXYZ(fractionPoint.x, fractionPoint.y, fractionPoint.z, highB);
        const pointB1 = map.transform0.multiplyPoint3dQuietNormalize(pointA0);
        const pointA1 = map.transform1.multiplyPoint3dQuietNormalize(pointB0);
        ck.testPoint3d(pointB0, pointB1, "pointB0, pointA0-->pointB1");
        ck.testPoint3d(pointA0, pointA1, "pointA0, pointB0-->pointA1");
      }
    }
    ck.checkpoint("Geometry4d.BoxMap");
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("Matrix4d", () => {
  it("Set", () => {
    const ck = new bsiChecker.Checker();
    const zero = Matrix4d.createZero();
    const zeroA = Matrix4d.createIdentity();
    zeroA.setFromJSON([[1], [2]]);
    ck.testMatrix4d(zero, zeroA, "setFromJSON defaults to zero matrix");
    ck.checkpoint("Matrix4d.set");
    expect(ck.getNumErrors()).equals(0);
  });

  it("Multiply", () => {
    const ck = new bsiChecker.Checker();
    const matrixA = Matrix4d.createRowValues(
      10, 2, 3, 4,
      5, 20, 2, 1,
      4, 6, 30, 2,
      3, 2, 1, 30);
    const matrixB = Matrix4d.createRowValues(
      30, -2, -1, 0.3,
      1, 40, 0.1, 3,
      2, 4, 15, 6,
      -0.3, 0.1, 4, 20);

    const diagonalB = matrixB.diagonal();
    const BX = matrixB.columnX();
    const BY = matrixB.columnY();
    const BZ = matrixB.columnZ();
    const BW = matrixB.columnW();

    ck.testExactNumber(diagonalB.x, BX.x, "diagonal x");
    ck.testExactNumber(diagonalB.y, BY.y, "diagonal x");
    ck.testExactNumber(diagonalB.z, BZ.z, "diagonal z");
    ck.testExactNumber(diagonalB.w, BW.w, "diagonal w");

    const matrixAB = matrixA.multiplyMatrixMatrix(matrixB);
    const matrixABT = matrixA.multiplyMatrixMatrixTranspose(matrixB);
    const matrixATB = matrixA.multiplyMatrixTransposeMatrix(matrixB);
    const matrixBAT = matrixB.multiplyMatrixTransposeMatrix(matrixA);
    const matrixBAT_T = matrixBAT.cloneTransposed();
    const matrixATB_T = matrixATB.cloneTransposed();
    ck.testCoordinate(0, matrixATB.maxDiff(matrixBAT_T), "BTA transpose");
    ck.testCoordinate(0, matrixBAT.maxDiff(matrixATB_T), "ATB transpose");
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4; col++) {
        ck.testCoordinate(
          matrixAB.atIJ(row, col),
          matrixA.rowDotColumn(row, matrixB, col),
          "AB entry", row, col);
        ck.testCoordinate(
          matrixABT.atIJ(row, col),
          matrixA.rowDotRow(row, matrixB, col),
          "ABT entry", row, col);
        ck.testCoordinate(
          matrixATB.atIJ(row, col),
          matrixA.columnDotColumn(row, matrixB, col),
          "ATB entry", row, col);
      }

    const CX = matrixAB.columnX();
    const CY = matrixAB.columnY();
    const CZ = matrixAB.columnZ();
    const CW = matrixAB.columnW();

    const ABX = matrixA.multiplyPoint4d(BX);
    const ABY = matrixA.multiplyPoint4d(BY);
    const ABZ = matrixA.multiplyPoint4d(BZ);
    const ABW = matrixA.multiplyPoint4d(BW);

    ck.testPoint4d(CX, ABX, "X column");
    ck.testPoint4d(CY, ABY, "Y column");
    ck.testPoint4d(CZ, ABZ, "Z column");
    ck.testPoint4d(CW, ABW, "W column");

    const matrixAT = matrixA.cloneTransposed();
    const pointX = Point4d.create(3, 2, 9, 4);
    const pointATX0 = matrixA.multiplyTransposePoint4d(pointX);
    const pointATX1 = matrixAT.multiplyPoint4d(pointX);
    // interface makes point4d pass for XYAndZ
    const pointAX0 = matrixA.multiplyPoint3d(pointX, pointX.w);
    const pointAX = matrixA.multiplyPoint4d(pointX);
    ck.testPoint4d(pointAX0, pointAX, "multiply with separated w");
    ck.testPoint4d(pointATX0, pointATX1, "multiplyTranspose");

    const point3dArray: Point3d[] = [Point3d.create(1, 2, -2), Point3d.create(2, 4, 3)];
    const weight = 1.4;
    const point4dArray: Point4d[] = [];
    matrixAB.multiplyPoint3dArray(point3dArray, point4dArray, weight);
    const point3dArray1: Point3d[] = [];
    matrixAB.multiplyPoint4dArrayQuietRenormalize(point4dArray, point3dArray1);
    for (let i = 0; i < point3dArray.length; i++) {
      const p = point3dArray[i];
      const pointQ =
        Point4d.createAdd2Scaled(CX, p.x, CY, p.y).plus(
          Point4d.createAdd2Scaled(CZ, p.z, CW, weight));
      ck.testPoint4d(pointQ, point4dArray[i]);
    }

    expect(ck.getNumErrors()).equals(0);
  });

  it("MultiplyAndRenormalize", () => {
    const ck = new bsiChecker.Checker();
    const matrixA = Matrix4d.createRowValues(
      10, 2, 3, 4,
      5, 20, 2, 1,
      4, 6, 30, 2,
      3, 2, 1, 30);
    const pointQ = [Point3d.create(3, 2, 5), Point3d.create(2, 9, -4)];
    const pointQ4d = [];
    const pointAQ4d = [];
    for (const Q of pointQ) {
      const Q4d = Point4d.createFromPointAndWeight(Q, 1);
      pointQ4d.push(Q4d);
      pointAQ4d.push(matrixA.multiplyPoint4d(Q4d));
    }
    matrixA.multiplyPoint3dArrayQuietNormalize(pointQ);
    for (let i = 0; i < pointQ.length; i++) {
      const Q1 = pointQ[i]; // that was renormalized.
      const Q14d = pointAQ4d[i].normalizeWeight()!;
      ck.testPoint4d(Point4d.createFromPointAndWeight(Q1, 1), Q14d);
    }
    expect(ck.getNumErrors()).equals(0);
  });
  // cspell:word ABAT
  it("addTranslationSandwichInPlace", () => {
    const ck = new bsiChecker.Checker();
    const matrixZ = Matrix4d.createRowValues(
      10, 3, 4, 5,
      6, 30, 1, 1.2,
      8, 3, -15, 2,
      9, 1, 2, 11);
    const scale = 1.25;
    const allMatrices = [
      Matrix4d.createZero(),
      Matrix4d.createIdentity(),
    ];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const matrix = Matrix4d.createZero();
        matrix.setAtIJ(i, j, 2.0);
        allMatrices.push(matrix);
      }
    }
    allMatrices.push(Matrix4d.createRowValues(
      10, 2, 3, 4,
      5, 20, 2, 1,
      4, 6, 30, 2,
      3, 2, 1, 30));
    for (const matrixB of allMatrices)
      for (const xyz of [[2, 0, 0], [0, 3, 0], [0, 0, 4]]) {
        const ax = xyz[0];
        const ay = xyz[1];
        const az = xyz[2];
        const matrixA = Matrix4d.createTranslationXYZ(ax, ay, az);
        const matrixAB = matrixA.multiplyMatrixMatrix(matrixB);
        const matrixABAT = matrixAB.multiplyMatrixMatrixTranspose(matrixA);
        // addTranslationSandwichInPlace with zero instance should match matrixABAT full multiply
        const matrixD0 = Matrix4d.createZero();
        matrixD0.addTranslationSandwichInPlace(matrixB, ax, ay, az, 1.0);
        ck.testMatrix4d(matrixABAT, matrixD0, "product ABAT versus addTranslationSandwichInPlace", prettyPrint(matrixB), xyz);
        // now confirm add scaled effect with nontrivial staring matrix.
        const matrixE = matrixZ.plusScaled(matrixABAT, scale);
        const matrixE1 = matrixZ.clone();
        matrixE1.addTranslationSandwichInPlace(matrixB, ax, ay, az, scale);
        ck.testMatrix4d(matrixE, matrixE1, "addTranslationSandwichInPlace full test", prettyPrint(matrixB), xyz);
      }
    expect(ck.getNumErrors()).equals(0);
  });

  it("Misc", () => {
    const ck = new bsiChecker.Checker();
    const matrixA = Matrix4d.createRowValues(
      10, 2, 3, 4,
      5, 20, 2, 1,
      4, 6, 30, 2,
      3, 2, 1, 30);
    const arrayB = matrixA.rowArrays();
    const f = 2.9;
    const arrayC = matrixA.rowArrays((value: number) => f * value);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const a = matrixA.atIJ(i, j);
        const b = arrayB[i][j];
        const c = arrayC[i][j];
        ck.testCoordinate(a, b);
        ck.testCoordinate(f * a, c);
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });
  it("Inverse", () => {
    const ck = new bsiChecker.Checker();

    for (const matrixA of [
      Matrix4d.createRowValues(0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
      Matrix4d.createRowValues(
        1, 0, 0, 0,
        0, 2, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1),
      Matrix4d.createRowValues(
        10, 2, 3, 4,
        5, 20, 2, 1,
        4, 6, 30, 2,
        3, 2, 1, 30),
      Matrix4d.createRowValues(
        -4509.659901029264, -2398.122299764309, 0, 4192.763181336376,
        1705.3435500113474, -6341.664102191739, 0, 312.814982291711,
        0, -0, 179.36736748646942, -118.00864861439914,
        0, -0, 0, 1),
      Matrix4d.createRowValues(
        -5.199577930106449e-8, 5.5878993626914775e-8, 0, 0.005147466964956382,
        - 2.116903271812029e-10, - 7.745682382609335e-10, 0, 0.009886485615341636,
        1.0596550131841224e-8, 3.877244310855186e-8, 1.1236140303104357e-7, 0.00017487220506423595,
        2.119310026368245e-8, 7.754488621710374e-8, 0, 0.010227421860234953),
      Matrix4d.createRowValues(
        -0.00006936056809344464, 0.00002622893965818147, 0, 0.49974485667496793,
        -0.00001813902597199655, -0.00004796736591244489, 0, 0.3652941567347317,
        0, 0, 0.0013814942135607167, 0.3550280429194092,
        0, 0, 0, 1)])
      verifyInverse(ck, matrixA, "diagonally dominant");

    for (const a33 of [1, 10, 100]) {
      verifyInverse(ck,
        Matrix4d.createRowValues(
          0, 1, 0, 0,
          - 0.6643638388299198, 0, 0.7474093186836596, 0,
          0.7474093186836597, 0, 0.6643638388299198, 0,
          0, 0, 0, a33), `David S example with scale ${a33}`);
    }

    for (const singularMatrix of [
      Matrix4d.createRowValues(     // row 1,2 match
        10, 2, 3, 4,
        5, 20, 2, 1,
        5, 20, 2, 1,
        3, 2, 1, 30),
      Matrix4d.createRowValues(   // column 2,3 match
        10, 2, 4, 4,
        5, 20, 2, 2,
        4, 6, 2, 2,
        3, 2, 30, 30),
      Matrix4d.createRowValues(     // row 3 is sum of rows 0,1,2
        10, 2, 3, 4,
        5, 20, 2, 1,
        5, 20, 2, 1,
        20, 42, 7, 6)]) {
      for (const scaleFactor of [1.0, 0.232136936231648, 1.0 / 3.8798797912312, Math.sqrt(2), Math.sqrt(20), Math.sqrt(200)]) {
        const scaledMatrix = singularMatrix.clone();
        scaledMatrix.scaleRowsInPlace(scaleFactor, scaleFactor, scaleFactor, scaleFactor);
        ck.testUndefined(scaledMatrix.createInverse());
      }
    }

    const matrixB = Matrix4d.createRowValues(
      10, 1, 2, 3,
      0, 10, 3, 4,
      0, 10, 3, 4,  // same as row 2 -- this makes it singular!!!
      0, 0, 1, 1);
    ck.testUndefined(matrixB.createInverse());

    const matrixC = Matrix4d.createRowValues(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const matrixC0 = Matrix4d.createZero();
    Matrix4d.createRowValues(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, matrixC0);
    ck.testMatrix4d(matrixC, matrixC0, "createRowValues with result");
    const rows = [matrixC.rowX(), matrixC.rowY(), matrixC.rowZ(), matrixC.rowW()];
    const matrixCT = matrixC.cloneTransposed();
    const cols = [matrixCT.columnX(), matrixCT.columnY(), matrixCT.columnZ(), matrixCT.columnW()];
    const matrixD = Matrix4d.createRowValues(-3, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
    // const matrixCD = matrixC.multiplyMatrixMatrix(matrixD);
    const matrixCTD0 = matrixC.multiplyMatrixTransposeMatrix(matrixD);
    const matrixCTD1 = matrixCT.multiplyMatrixMatrix(matrixD);
    ck.testMatrix4d(matrixCTD0, matrixCTD1, "multiplyMatrixTransposeMatrix");
    for (let i = 0; i < 4; i++)
      ck.testPoint4d(rows[i], cols[i], "row, col from transpose");

    for (let i = 0; i < 3; i++) {
      ck.testCoordinate(
        rows[i].dotProduct(rows[i + 1]),
        rows[i].dotProductXYZW(rows[i + 1].x, rows[i + 1].y, rows[i + 1].z, rows[i + 1].w),
        "dot product scalars");
    }
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        ck.testCoordinate(
          matrixD.columnDotColumn(i, matrixC, j),
          matrixD.columnDotRow(i, matrixCT, j));
    ck.checkpoint("Matrix4d.Inverse");
    expect(ck.getNumErrors()).equals(0);
  });
});

/* verify that 3d and 4d planes match.  This only makes sense if
* the 4d plane is known to have weights (1,0,0) on (origin, vectorU, vectorV)
*/
function verify3d4dPlaneMatch(
  ck: bsiChecker.Checker,
  planeA: Plane3dByOriginAndVectors,
  planeB: PlaneByOriginAndVectors4d) {
  for (const uv of [[0.4, 0.62], [0, 0], [1, 0], [0, 1]]) {
    const q3d = planeA.fractionToPoint(uv[0], uv[1]);
    const q4d = planeB.fractionToPoint(uv[0], uv[1]);
    const q4dReal = q4d.realPoint()!;
    ck.testPoint3d(q3d, q4dReal);
  }
  const planeXY = PlaneByOriginAndVectors4d.createXYPlane(); // NOT to be overwritten
  const planeB1 = planeB.clone();
  ck.testTrue(planeB1.isAlmostEqual(planeB));
  const planeB2 = PlaneByOriginAndVectors4d.createXYPlane(); // to be overwritten
  if (!planeB.isAlmostEqual(planeB2)) {
    planeB2.setFrom(planeB);
    ck.testTrue(planeB.isAlmostEqual(planeB2));
    const planeB2A = PlaneByOriginAndVectors4d.createXYPlane(); // to be overwritten
    // clone to target
    const planeB3 = planeB.clone(planeB2A);
    ck.testTrue(planeB.isAlmostEqual(planeB3));
    // now rewrite as planeXY ..
    PlaneByOriginAndVectors4d.createXYPlane(planeB3);
    ck.testTrue(planeXY.isAlmostEqual(planeB3), "revert to XY plane");

    const planeB4 = PlaneByOriginAndVectors4d.createOriginAndVectors(
      planeB.origin, planeB.vectorU, planeB.vectorV);
    ck.testTrue(planeB.isAlmostEqual(planeB4));
    // reuse planeB3
    PlaneByOriginAndVectors4d.createOriginAndVectors(planeB.origin, planeB.vectorU, planeB.vectorV, planeB3);
    ck.testTrue(planeB.isAlmostEqual(planeB3));
  }

}
describe("Plane4dByOriginAndVectors", () => {
  it("Create", () => {
    const ck = new bsiChecker.Checker();
    const origin = Point4d.create(1, 2, 3, 2);
    const vectorU = Point4d.create(3, 7, 9, 0);
    const vectorV = Point4d.create(-5, 2, 8, 1);
    const plane0 = PlaneByOriginAndVectors4d.createOriginAndVectors(origin, vectorU, vectorV);
    ck.testPoint4d(origin, plane0.origin);
    ck.testPoint4d(vectorU, plane0.vectorU);
    ck.testPoint4d(vectorV, plane0.vectorV);
    ck.checkpoint("Plane4dByOriginAndVectors.Create");
    expect(ck.getNumErrors()).equals(0);
  });

  it("Match3d", () => {
    const ck = new bsiChecker.Checker();
    const origin = Point3d.create(1, 2, 3);
    const vectorU = Vector3d.create(3, 7, 9);
    const vectorV = Vector3d.create(-5, 2, 8);
    const targetU = origin.plus(vectorU);
    const targetV = origin.plus(vectorV);
    const plane0 = PlaneByOriginAndVectors4d.createOriginAndTargets3d(origin,
      targetU, targetV);
    const plane2 = PlaneByOriginAndVectors4d.createOriginAndVectors(
      Point4d.createFromPointAndWeight(origin, 1),
      Point4d.createFromPointAndWeight(vectorU, 0),
      Point4d.createFromPointAndWeight(vectorV, 0));
    ck.testPoint4d(plane0.origin, plane2.origin);
    ck.testPoint4d(plane0.vectorU, plane2.vectorU);
    ck.testPoint4d(plane0.vectorV, plane2.vectorV);
    const plane1 = Plane3dByOriginAndVectors.createOriginAndVectors(
      origin, vectorU, vectorV);
    verify3d4dPlaneMatch(ck, plane1, plane0);
    verify3d4dPlaneMatch(ck,
      Plane3dByOriginAndVectors.createXYPlane(),
      PlaneByOriginAndVectors4d.createXYPlane());

    expect(ck.getNumErrors()).equals(0);
  });

});
function suppressNearZero(value: number): number {
  const tol = 1.0e-15;
  if (Math.abs(value) < tol) return 0;
  if (Math.abs(value - 1) < tol) return 1.0;
  return value;
}
function prettyMap(map: Map4d): any {
  return prettyPrint([
    map.transform0.rowArrays(suppressNearZero),
    map.transform0.rowArrays(suppressNearZero),
  ]);
}
function verifySandwich(ck: bsiChecker.Checker, meat: Map4d, bread: Map4d) {
  const inverseMeat = meat.clone();
  inverseMeat.reverseInPlace();
  // bsiChecker.Checker.noisy.map4d = true;
  const sandwich0M1 = meat.sandwich0This1(bread);
  const sandwich0I1 = inverseMeat.sandwich0This1(bread);
  const product01 = sandwich0M1.multiplyMapMap(sandwich0I1);
  const identity = Map4d.createIdentity();
  if (bsiChecker.Checker.noisy.map4d) {
    console.log("meat", prettyMap(meat));
    console.log("bread", prettyMap(bread));
    console.log("product01", prettyMap(product01));
  }
  ck.testTrue(product01.isAlmostEqual(identity), "Sandwich identity");

  const sandwich1M0 = meat.sandwich1This0(bread);
  const sandwich1I0 = inverseMeat.sandwich1This0(bread);
  const product10 = sandwich1M0.multiplyMapMap(sandwich1I0);
  if (bsiChecker.Checker.noisy.map4d) {
    console.log("product10", prettyMap(product10));
  }
  ck.testTrue(product10.isAlmostEqual(identity), "Sandwich identity");
}
describe("Map4d", () => {
  it("Create", () => {
    const ck = new bsiChecker.Checker();
    const mapI = Map4d.createIdentity();
    const fixedPoint = Point3d.create(1, 2, 3);
    const scaleFactor = 2.5;
    const scaleTransform = Transform.createScaleAboutPoint(fixedPoint, scaleFactor);
    const scaleTransform1 = scaleTransform.inverse()!;
    ck.testUndefined(Map4d.createTransform(scaleTransform, scaleTransform),
      "confirm Map4d constructor rejects mismatch");
    const scaleMap = Map4d.createTransform(scaleTransform, scaleTransform1);
    if (ck.testPointer(scaleMap)) {
      ck.testFalse(mapI.isAlmostEqual(scaleMap));
      const scaleMap1 = Map4d.createRefs(scaleMap.transform1.clone(), scaleMap.transform0.clone());
      const reverseMap = scaleMap.clone();
      reverseMap.reverseInPlace();
      ck.testTrue(scaleMap1.isAlmostEqual(reverseMap));

      const mapB = Map4d.createIdentity();
      mapB.setFrom(scaleMap);
      ck.testTrue(mapB.isAlmostEqual(scaleMap));
      mapB.setIdentity();
      ck.testTrue(mapB.isAlmostEqual(mapI));
    }
    const frustumIdentity = Map4d.createVectorFrustum(
      Point3d.create(0, 0, 0),
      Vector3d.create(1, 0, 0),
      Vector3d.create(0, 1, 0),
      Vector3d.create(0, 0, 1),
      1.0)!;
    ck.testTrue(mapI.isAlmostEqual(frustumIdentity), "Identity frustum");

    const yzxFrustum = Map4d.createVectorFrustum( // YZX frustum, eyepoint at (10,0,0) ??
      Point3d.create(0, 0, 0),
      Vector3d.create(0, 1, 0),
      Vector3d.create(0, 0, 1),
      Vector3d.create(1, 0, 0),
      0.9)!;

    const rotationTransform = Transform.createFixedPointAndMatrix(
      Point3d.create(4, 2, 8),
      Matrix3d.createRotationAroundVector(Vector3d.create(1, 2, 3), Angle.createDegrees(10))!);
    const rotationMap = Map4d.createTransform(rotationTransform, rotationTransform.inverse())!;
    verifySandwich(ck, rotationMap, mapI);
    verifySandwich(ck, mapI, rotationMap);
    verifySandwich(ck, scaleMap!, rotationMap);
    verifySandwich(ck, rotationMap, scaleMap!);
    ck.testPointer(yzxFrustum, "yzxFrustum");
    ck.checkpoint("Map4d.Create");
    expect(ck.getNumErrors()).equals(0);
  });
  // EDL Dec 7, 2017 This compose perspective transforms with different eye (convergence) points
  // and outputs graphics to show the effect of each on a unit box.
  // The output goes to an imjs file to view in microstation.
  it("CompositeFrustum", () => {
    const origin = Point3d.create(0, 0, 0);
    const xExtent = Vector3d.unitX();
    const yExtent = Vector3d.unitY();
    const zExtent = Vector3d.unitZ();
    const zFraction = 0.8;
    const yFraction = 0.7;
    const xFraction = 0.9;
    const mapZ = Map4d.createVectorFrustum(origin, xExtent, yExtent, zExtent, zFraction)!;
    const mapX = Map4d.createVectorFrustum(origin, yExtent, zExtent, xExtent, xFraction)!;
    const mapY = Map4d.createVectorFrustum(origin, zExtent, xExtent, yExtent, yFraction)!;
    const geometry: GeometryQuery[] = [];

    const mapXY = mapX.multiplyMapMap(mapY);
    const mapXYZ = mapXY.multiplyMapMap(mapZ);
    for (const select of [0, 1]) {
      const a = select * 30;
      appendNPC(select, geometry, mapX, 0, a, 0);
      appendNPC(select, geometry, mapY, 4, a, 0);
      appendNPC(select, geometry, mapZ, 8, a, 0);
      appendNPC(select, geometry, mapXY, 4, a + 10, 0);
      appendNPC(select, geometry, mapXYZ, 8, a + 10, 0);
    }
    GeometryCoreTestIO.saveGeometry(geometry, "Geometry4d", "CompositeFrustum");
  });

  it("VectorFrustum", () => {
    const ck = new bsiChecker.Checker();
    const origin = Point3d.create(111.55210256687462, -8.3610081610513802, -10.253043196228713);
    const uVector = Vector3d.create(62.386308713014060, -0.00000000000000000, 0.00000000000000000);
    const vVector = Vector3d.create(0.00000000000000000, 62.386308713014060, -0.00000000000000000);
    const wVector = Vector3d.create(31.041154356507047, 31.041154356507032, 31.041154356507036);
    const fraction = 0.0048728640349349457;
    const frustum = Map4d.createVectorFrustum(origin, uVector, vVector, wVector, fraction);
    // console.log (prettyPrint (frustum!));
    if (ck.testPointer(frustum)) {
      const product = frustum.transform0.multiplyMatrixMatrix(frustum.transform1);
      ck.testTrue(product.isIdentity(), "vector frustum inverts");
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("Point4d properties", () => {
    const ck = new bsiChecker.Checker();
    const pointA = Point4d.create(2, 3, 4, 5);
    const pointB = pointA.clone();
    ck.testPoint4d(pointA, pointB, "Point4d clone");

    pointB.x += 1;
    ck.testExactNumber(pointA.x + 1, pointB.x);
    pointB.y += 2;
    ck.testExactNumber(pointA.y + 2, pointB.y);
    pointB.z += 3;
    ck.testExactNumber(pointA.z + 3, pointB.z);
    pointB.w += 4;
    ck.testExactNumber(pointA.w + 4, pointB.w);

    expect(ck.getNumErrors()).equals(0);
  });

  it("ProjectiveLineIntersection", () => {
    const ck = new bsiChecker.Checker();
    const hA0 = Point4d.create(0, 0, 0, 1);
    const hA1 = Point4d.create(3, 1, 0, 1);
    const hB0 = Point4d.create(1, 0, 0, 1);
    const hB1 = Point4d.create(1, 1, 0, 1);
    for (const wA1 of [1, 1.1, 1.3]) {
      for (const wB0 of [1, 0.4, 2]) {
        hA1.w = wA1;
        hB0.w = wB0;
        const fractions = SmallSystem.lineSegment3dHXYTransverseIntersectionUnbounded(hA0, hA1, hB0, hB1);
        if (ck.testPointer(fractions, "expect solution of intersections") && fractions !== undefined) {
          const hAX = hA0.interpolate(fractions.x, hA1);
          const hBX = hB0.interpolate(fractions.y, hB1);
          ck.testCoordinate(hAX.realDistanceXY(hBX)!, 0);
        }
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("ProjectiveLineClosestPointXY", () => {
    const ck = new bsiChecker.Checker();
    let badFraction: number | undefined;
    for (const wA0 of [1, 1.1, 1.3]) {
      for (const wA1 of [1, 0.4, 1.5]) {  // remark wA1=2 creates anomalies with spacePoint 2,4,2,anyW?
        for (const wSpace of [1, 0.9]) {
          const hA0 = Point4d.create(0, 0, 0, wA0);
          const hA1 = Point4d.create(3, 1, 0, wA1);
          const spacePoint = Point4d.create(2, 4, 2, wSpace);
          const fraction = SmallSystem.lineSegment3dHXYClosestPointUnbounded(hA0, hA1, spacePoint);
          if (ck.testTrue(fraction !== undefined, "Expect real fraction from closet point step") && fraction !== undefined) {
            const linePoint = hA0.interpolate(fraction, hA1);
            const lineVector = hA1.crossWeightedMinus(hA0);
            const spaceVector = linePoint.crossWeightedMinus(spacePoint);
            ck.testPerpendicular(lineVector, spaceVector);
          } else {
            // recompute for debug ...
            console.log("Error case");
            console.log("A0", hA0);
            console.log("A1", hA1);
            console.log("spacePoint", spacePoint);
            badFraction = SmallSystem.lineSegment3dHXYClosestPointUnbounded(hA0, hA1, spacePoint);
          }
        }
      }
    }
    ck.testTrue(badFraction === undefined);
    expect(ck.getNumErrors()).equals(0);
  });

  it("CreateMap4dWithUndefinedTransform1", () => {
    const ck = new bsiChecker.Checker();
    const transform1 = Transform.createRowValues(
      10, 1, 1, 0,
      1, 11, 2, 3,
      2, 4, 20, -2);   // good transform, but skewed for fun
    const singularTransform = Transform.createRowValues(
      10, 1, 1, 0,
      10, 1, 1, 0,
      2, 4, 20, -2);   // repeated row makes it singular
    const map1 = Map4d.createTransform(transform1);
    const singularMap = Map4d.createTransform(singularTransform);
    ck.testPointer(map1, "Map4d computed its own inverse");
    ck.testUndefined(singularMap, "Map4d detected singular input");
    expect(ck.getNumErrors()).equals(0);
  });
});

function verifyInverse(ck: bsiChecker.Checker, matrixA: Matrix4d, name: string): boolean {
  const inverse = matrixA.createInverse();
  if (ck.testPointer(inverse, "Expect inverse ", name, matrixA) && inverse) {
    const product = matrixA.multiplyMatrixMatrix(inverse);
    ck.testTrue(product.isIdentity(), "Expect A*inverse = I", name, prettyPrint(matrixA), prettyPrint(inverse), prettyPrint(product));

    const matrixB = matrixA.clone();
    const detA = matrixA.determinant();
    for (const ij of [[0, 1], [0, 2], [3, 1]]) {
      matrixB.rowOperation(ij[0], ij[1], 0, 2.0);
      const detB = matrixB.determinant();
      ck.testCoordinate(detA, detB, "row operation does not change determinant");
    }
    exerciseNearInverse(ck, matrixA, 0, 1, name);
    exerciseNearInverse(ck, matrixA, 1, 2, name);
    exerciseNearInverse(ck, matrixA, 2, 3, name);
    exerciseNearInverse(ck, matrixA, 3, 1, name);

    return true;
  }
  return false;
}
/**
 * * Input a nonsingular matrix.
 * * make a sequence of "near singular" matrices
 * * repeat for k = each column index
 *   * COPY row i to row j.  Now it is singular.
 *   * Add small value e to [j][k].
 *   * increase e until the matrix becomes nonsingular
 */
export function exerciseNearInverse(ck: bsiChecker.Checker, matrixA: Matrix4d, i: number, j: number, name: string) {
  const inverse = matrixA.createInverse();
  const aMax = matrixA.maxAbs();
  if (ck.testDefined(inverse) && inverse !== undefined) {
    let e;
    let ok = false;
    // copying row i to row j makes it singular.
    // We expect that adding modest sized e "somewhere along row j" will make it nonsingular
    for (e = 1.0e-15 * aMax; !ok && e < aMax; e *= 10) {
      for (let k = 0; k < 4 && !ok; k++) {
        const matrixB = matrixA.clone();
        for (let m = 0; m < 4; m++)
          matrixB.setAtIJ(j, m, matrixB.atIJ(i, m));
        const b0 = matrixB.atIJ(j, k);
        ck.testUndefined(matrixB.createInverse());
        matrixB.setAtIJ(j, k, b0 + e);
        const inverseB = matrixB.createInverse();
        if (inverseB !== undefined) {
          ok = true;
        }
      }
    }
    if (!ck.testTrue(ok, "unable to make step in invertible", name, i, j, matrixA))
      console.log(`matrixA ${prettyPrint(matrixA)}`);
  }
}
