/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Geometry } from "../../Geometry";
import { Angle } from "../../geometry3d/Angle";
import { GrowableFloat64Array } from "../../geometry3d/GrowableFloat64Array";
import { GrowableXYArray } from "../../geometry3d/GrowableXYArray";
import { GrowableXYZArray } from "../../geometry3d/GrowableXYZArray";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Point2dArrayCarrier } from "../../geometry3d/Point2dArrayCarrier";
// import { ClusterableArray } from "../numerics/ClusterableArray";
// import { prettyPrint } from "./testFunctions";
import { Point2d, Vector2d } from "../../geometry3d/Point2dVector2d";
import { Point3dArrayCarrier } from "../../geometry3d/Point3dArrayCarrier";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Range2d } from "../../geometry3d/Range";
import { Transform } from "../../geometry3d/Transform";
import { Sample } from "../../serialization/GeometrySamples";
import { Checker } from "../Checker";

/* eslint-disable no-console */

describe("GrowableXYArray", () => {
  it("PointMoments", () => {
    const ck = new Checker();
    for (let n = 3; n < 100; n *= 2) {
      const pointA = new GrowableXYArray();
      const pointB = [];
      ck.testExactNumber(pointA.length, 0);
      // load pointB
      for (let i = 0; i < n; i++) {
        pointB.push(Point2d.create(Math.cos(i * i), i + 0.25));
        // pointB.push(Point2d.create(i, i + 0.25));
        // pointB.push(Point2d.create(-i, i + 0.25));
      }

      // verify undefined returns from empty array
      ck.testUndefined(pointA.front());
      ck.testUndefined(pointA.back());
      ck.testFalse(pointA.isIndexValid(4));
      for (const p of pointB) {
        pointA.push(p);
        ck.testPoint2d(p, pointA.back() as Point2d);
        ck.testPoint2d(pointB[0], pointA.front() as Point2d);
      }
      for (let i = 0; i < n; i++)
        ck.testPoint2d(pointB[i], pointA.getPoint2dAtUncheckedPointIndex(i));
      ck.testExactNumber(pointA.length, pointB.length, "array lengths");

      let lengthA = 0;
      for (let i = 0; i + 1 < n; i++) {
        lengthA += pointA.getPoint2dAtUncheckedPointIndex(i).distance(pointA.getPoint2dAtUncheckedPointIndex(i + 1));
      }
      const lengthA1 = pointA.sumLengths();
      ck.testCoordinate(lengthA, lengthA1, "polyline length");
      ck.testExactNumber(pointA.length, n);

      // we are confident that all x coordinates are distinct ...
      const sortOrder = pointA.sortIndicesLexical();
      for (let i = 1; i < sortOrder.length; i++) {
        const a = sortOrder[i - 1];
        const b = sortOrder[i];
        ck.testTrue(pointA.compareLexicalBlock(a, b) < 0, " confirm lexical sort order");
        ck.testTrue(pointA.component(a, 0) <= pointA.component(b, 0), "confirm sort order x");
      }
    }
    ck.checkpoint("GrowablePoint2dArray.HelloWorld");
    expect(ck.getNumErrors()).equals(0);
  });
  it("CloneExtractAndPop", () => {
    const ck = new Checker();
    const n = 11;
    const pointA3d = Sample.createGrowableArrayCirclePoints(1.0, n, false);
    const pointAXY = GrowableXYArray.create(pointA3d);
    const pointBXY = pointAXY.clone();
    const pointC = pointAXY.getPoint2dArray();
    const pointD = GrowableXYArray.create(pointC);
    const eps = 1.0e-16;  // ugh ..
    ck.testTrue(pointAXY.isAlmostEqual(pointBXY, eps));
    ck.testTrue(pointAXY.isAlmostEqual(pointD, eps));
    expect(ck.getNumErrors()).equals(0);

    const xyBuffer = pointAXY.float64Data();
    for (let i = 0; i < n; i++) {
      ck.testTrue(Geometry.isSamePoint2d(
        pointAXY.getPoint2dAtUncheckedPointIndex(i), Point2d.create(xyBuffer[2 * i], xyBuffer[2 * i + 1])));
    }

    pointD.clear();
    ck.testExactNumber(0, pointD.length);
    for (let i = 1; i <= 2 * n; i++) {
      pointBXY.pop();
      ck.testExactNumber(Math.max(0, n - i), pointBXY.length);
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("Transfer", () => {
    const ck = new Checker();
    const n = 11;
    const pointA = GrowableXYArray.create(Sample.createGrowableArrayCirclePoints(1.0, n, false));
    const pointB = new GrowableXYArray(10);
    ck.testFalse(pointA.isAlmostEqual(pointB), "isAlmostEqual detects length");
    ck.testFalse(GrowableXYArray.isAlmostEqual(pointA, pointB), "static isAlmostEqual");
    ck.testUndefined(pointA.getPoint2dAtCheckedPointIndex(-5));

    for (let i = 0; i < pointA.length; i++) {
      pointB.pushXY(100, 100);
      const xy = pointA.getPoint2dAtCheckedPointIndex(i)!;
      pointB.transferFromGrowableXYArray(i, pointA, i);
      ck.testExactNumber(0, pointB.distanceIndexToPoint(i, xy)!);
    }

    const z0 = 5.0;
    const pointA3d = pointA.getPoint3dArray(z0);
    for (let i = 0; i < pointA3d.length; i++) {
      const xyz = pointA3d[i];
      const xy = pointA.getPoint2dAtUncheckedPointIndex(i);
      ck.testExactNumber(z0, xyz.z);
      ck.testExactNumber(xyz.x, xy.x);
      ck.testExactNumber(xyz.y, xy.y);
    }

    const vector = Vector3d.create(3, 9);
    const transform = Transform.createTranslation(vector);
    const pointE = pointA.clone();
    const eps = 1.0e-16;
    const pointF = pointA.clone();
    for (let i = 0; i < pointE.length; i++) {
      const xy = pointE.getPoint2dAtCheckedPointIndex(i)!.plus(vector);
      pointE.setAtCheckedPointIndex(i, xy);
      pointF.setXYZAtCheckedPointIndex(i, xy.x, xy.y);
    }
    const pointG = pointA.clone();
    pointG.multiplyTransformInPlace(transform);
    ck.testFalse(pointA.isAlmostEqual(pointG), "isAlmostEqual detects change");
    ck.testFalse(GrowableXYArray.isAlmostEqual(pointA, pointG), "static isAlmostEqual");
    ck.testTrue(pointE.isAlmostEqual(pointF, 10 * eps));
    ck.testTrue(pointE.isAlmostEqual(pointG, 10 * eps));
    expect(ck.getNumErrors()).equals(0);
  });

  it("Transform", () => {
    const ck = new Checker();
    const n = 11;
    const pointA = GrowableXYArray.create(Sample.createGrowableArrayCirclePoints(1.0, n, false));
    const pointB = pointA.clone();
    const rangeA = Range2d.createNull();
    pointA.extendRange(rangeA);
    const transform = Transform.createRowValues(
      1, 2, 4, 3,
      2, 5, 4, -3,
      0.2, 0.3, 0.4, 0.5);
    const rangeB = Range2d.createNull();
    const rangeC = Range2d.createNull();
    pointB.multiplyTransformInPlace(transform);
    pointA.extendRange(rangeC, transform);
    pointB.extendRange(rangeB);
    ck.testRange2d(rangeB, rangeC, "transformed array range");

    const transformG0 = Transform.createOriginAndMatrix(Point3d.createZero(), transform.matrix);
    const pointG1 = pointB.clone();
    const pointG2 = pointB.clone();
    pointG1.multiplyMatrix3dInPlace(transform.matrix);
    pointG2.multiplyTransformInPlace(transformG0);
    ck.testTrue(pointG1.isAlmostEqual(pointG2, 1.0e-16));

    const pointH1 = pointB.clone();
    const pointH2 = pointB.clone();
    const factor = 2.3423478238907987;
    pointH1.scaleInPlace(factor);
    pointH2.multiplyMatrix3dInPlace(Matrix3d.createScale(factor, factor, factor));
    ck.testTrue(pointH1.isAlmostEqual(pointH2));
    expect(ck.getNumErrors()).equals(0);
  });
  it("AreaXY", () => {
    const ck = new Checker();
    for (const n of [4, 9, 64]) {
      const r = 1.0;
      const circlePoints = Sample.createGrowableArrayCirclePoints(r, n, true);
      const pointA = GrowableXYArray.create(circlePoints);
      const areaA = pointA.areaXY();
      const areaB = circlePoints.areaXY();
      ck.testCoordinate(areaA, areaB, "areaXY versus 3d array");
      const radians = Math.PI / n; // half the triangle angles
      ck.testCoordinate(areaA, n * r * r * Math.cos(radians) * Math.sin(radians));
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("Wrap", () => {
    const ck = new Checker();
    const numWrap = 3;
    for (let n = 5; n < 100; n *= 2) {
      const pointA3d = Sample.createGrowableArrayCirclePoints(1.0, n, false);
      const pointA = GrowableXYArray.create(pointA3d);

      pointA.pushWrap(numWrap);
      ck.testExactNumber(n + numWrap, pointA.length, "pushWrap increases length");
      for (let i = 0; i < numWrap; i++) {
        ck.testPoint2d(pointA.getPoint2dAtUncheckedPointIndex(i), pointA.getPoint2dAtUncheckedPointIndex(n + i), "wrapped point");
      }
      let numDup = 0;
      const sortOrder = pointA.sortIndicesLexical();
      for (let i = 0; i + 1 < pointA.length; i++) {
        const k0 = sortOrder[i];
        const k1 = sortOrder[i + 1];
        if (pointA.getPoint2dAtUncheckedPointIndex(k0).isAlmostEqual(pointA.getPoint2dAtUncheckedPointIndex(k1))) {
          ck.testLT(k0, k1, "lexical sort preserves order for duplicates");
          numDup++;
        } else {
          const s = pointA.compareLexicalBlock(k0, k1);
          ck.testExactNumber(-1, s);
          const s1 = pointA.compareLexicalBlock(k1, k0);
          ck.testExactNumber(1, s1);
        }
      }
      ck.testExactNumber(numWrap, numDup, "confirm numWrap duplicates");
    }
    ck.checkpoint("GrowablePoint2dArray.Wrap");
    expect(ck.getNumErrors()).equals(0);
  });

  /** Basic output testing on appendages, sorting, transforming of a known inverse, and testing recognition of plane proximity within correct tolerance */
  it("BlackBoxTests", () => {
    const ck = new Checker();
    const arr = new GrowableXYArray();
    arr.ensureCapacity(9);
    arr.push(Point2d.create(1, 2));
    arr.push(Point2d.create(4, 5));
    arr.push(Point2d.create(7, 8));
    arr.resize(2);
    ck.testExactNumber(arr.length, 2);
    ck.testTrue(arr.compareLexicalBlock(0, 1) < 0 && arr.compareLexicalBlock(1, 0) > 0);
    const point = Point2d.create();
    arr.getPoint2dAtCheckedPointIndex(1, point);
    const vector = arr.getVector2dAtCheckedVectorIndex(1)!;
    ck.testTrue(point.isAlmostEqual(vector));
    ck.testPoint2d(point, Point2d.create(4, 5));

    const transform = Transform.createOriginAndMatrix(Point3d.create(0, 0), Matrix3d.createRowValues(
      2, 1, 0,
      2, 0, 0,
      2, 0, 1,
    ));
    const noInverseTransform = Transform.createOriginAndMatrix(Point3d.create(0, 0), Matrix3d.createRowValues(
      1, 6, 4,
      2, 4, -1,
      -1, 2, 5,
    ));

    ck.testTrue(arr.tryTransformInverseInPlace(transform));
    ck.testFalse(arr.tryTransformInverseInPlace(noInverseTransform));
    ck.testPoint2d(arr.getPoint2dAtUncheckedPointIndex(0), Point2d.create(1, -1));

    arr.resize(1);

    expect(ck.getNumErrors()).equals(0);
  });

  it("IndexedXYCollection", () => {
    const ck = new Checker();
    const points = Sample.createFractalDiamondConvexPattern(1, -0.5);
    const frame = Transform.createFixedPointAndMatrix(Point3d.create(1, 2, 0),
      Matrix3d.createRotationAroundVector(Vector3d.create(0, 0, 1), Angle.createDegrees(15.7))!);
    frame.multiplyPoint3dArrayInPlace(points);

    const points2d = [];
    for (const p of points)
      points2d.push(Point2d.create(p.x, p.y));

    const gPoints = new GrowableXYArray();
    gPoints.pushAllXYAndZ(points);
    const iPoints = new Point2dArrayCarrier(points2d);
    const iOrigin = iPoints.getPoint2dAtCheckedPointIndex(0)!;
    const gOrigin = gPoints.getPoint2dAtCheckedPointIndex(0)!;
    ck.testPoint2d(iOrigin, gOrigin, "point 0 access");
    for (let i = 1; i + 1 < points.length; i++) {
      const j = i + 1;
      const pointIA = iPoints.getPoint2dAtCheckedPointIndex(i)!;
      const pointGA = gPoints.getPoint2dAtCheckedPointIndex(i)!;
      const pointIB = iPoints.getPoint2dAtCheckedPointIndex(j)!;
      const pointGB = gPoints.getPoint2dAtCheckedPointIndex(j)!;
      const vectorIA = iPoints.vectorIndexIndex(i, j)!;
      const vectorGA = gPoints.vectorIndexIndex(i, j)!;

      const vectorIA1 = iPoints.vectorXAndYIndex(pointIA, j)!;
      const vectorGA1 = gPoints.vectorXAndYIndex(pointIA, j)!;

      ck.testVector2d(vectorIA1, vectorGA1, "vectorXYAndZIndex");
      ck.testPoint2d(pointIA, pointGA, "atPoint2dIndex");
      ck.testVector2d(vectorIA, pointIA.vectorTo(pointIB));
      ck.testVector2d(vectorGA, pointIA.vectorTo(pointGB));
      ck.testCoordinate(
        iPoints.crossProductIndexIndexIndex(0, i, j)!,
        gPoints.crossProductIndexIndexIndex(0, i, j)!);
      ck.testCoordinate(
        iPoints.crossProductXAndYIndexIndex(iOrigin, i, j)!,
        gPoints.crossProductXAndYIndexIndex(gOrigin, i, j)!);

      ck.testVector2d(
        iPoints.getVector2dAtCheckedVectorIndex(i)!,
        gPoints.getVector2dAtCheckedVectorIndex(i)!,
        "atVector2dIndex");

    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("resizeAndBoundsChecks", () => {
    const ck = new Checker();
    const points = Sample.createFractalDiamondConvexPattern(1, -0.5);

    const xyPoints = new GrowableXYArray(points.length);    // just enough so we know the initial capacity.
    for (const p of points)
      xyPoints.push(p);

    ck.testTrue(GrowableXYArray.isAlmostEqual(xyPoints, xyPoints), "isAlmostEqual duplicate pair");
    ck.testTrue(GrowableXYArray.isAlmostEqual(undefined, undefined), "isAlmostEqual undefined pair");

    ck.testFalse(GrowableXYArray.isAlmostEqual(undefined, xyPoints), "isAlmostEqual one undefined");
    ck.testFalse(GrowableXYArray.isAlmostEqual(xyPoints, undefined), "isAlmostEqual one undefined");

    const n0 = xyPoints.length;
    ck.testExactNumber(n0, points.length);
    const deltaN = 5;
    const n1 = n0 + deltaN;
    xyPoints.resize(n1);
    ck.testExactNumber(n1, xyPoints.length);

    const n2 = n0 - deltaN;
    xyPoints.resize(n2);  // blow away some points.

    ck.testUndefined(xyPoints.getVector2dAtCheckedVectorIndex(-4));
    ck.testUndefined(xyPoints.getVector2dAtCheckedVectorIndex(n2));

    // verify duplicate methods ....
    for (let i0 = 3; i0 < n2; i0 += 5) {
      for (let i1 = 0; i1 < n2; i1 += 3) {
        const vectorA = points[i0].vectorTo(points[i1]);
        const vectorB = xyPoints.vectorIndexIndex(i0, i1);
        if (vectorB)
          ck.testVector2d(Vector2d.create(vectorA.x, vectorA.y), vectorB);
        else
          ck.announceError("vectorIndexIndex?", i0, i1, vectorA, vectorB);
      }
    }

    const spacePoint = Point2d.create(1, 4);
    for (let i0 = 2; i0 < n2; i0 += 6) {
      const distance0 = xyPoints.distanceIndexToPoint(i0, spacePoint);
      const distance1 = xyPoints.getPoint2dAtCheckedPointIndex(i0)!.distance(spacePoint);
      const vectorI0 = xyPoints.vectorXAndYIndex(spacePoint, i0);
      if (ck.testPointer(vectorI0) && distance0 !== undefined) {
        ck.testCoordinate(vectorI0.magnitude(), distance0)!;
        ck.testCoordinate(distance0, distance1);
      }
    }

    ck.testUndefined(xyPoints.distance(-1, 0), "distance to invalid indexA");
    ck.testUndefined(xyPoints.distance(0, -1), "distance to invalid indexB");
    const point0 = xyPoints.getPoint2dAtCheckedPointIndex(0)!;
    for (let i = 1; i < xyPoints.length; i++) {
      ck.testExactNumber(xyPoints.distance(0, i)!, xyPoints.distanceIndexToPoint(i, point0)!);
    }
    ck.testUndefined(xyPoints.distanceIndexToPoint(-1, spacePoint), "distance to invalid indexA");

    ck.testFalse(xyPoints.setXYZAtCheckedPointIndex(-5, 1, 2), "negative index for setCoordinates");
    ck.testFalse(xyPoints.setXYZAtCheckedPointIndex(100, 1, 2), "huge index for setCoordinates");

    ck.testFalse(xyPoints.setAtCheckedPointIndex(-5, spacePoint), "negative index for setAt");
    ck.testFalse(xyPoints.setAtCheckedPointIndex(100, spacePoint), "huge index for setAt");
    ck.testUndefined(xyPoints.vectorXAndYIndex(spacePoint, -5), "negative index for vectorXYAndZIndex");

    expect(ck.getNumErrors()).equals(0);
  });

  it("transferAndSet", () => {
    const ck = new Checker();
    const points = Sample.createFractalDiamondConvexPattern(1, -0.5);

    const array0 = new GrowableXYArray(points.length);    // just enough so we know the initial capacity.
    for (const p of points)
      array0.push(p);
    const n0 = array0.length;

    const array1 = new GrowableXYArray();
    // transfers with bad source index
    ck.testExactNumber(0, array1.pushFromGrowableXYArray(array0, -1), "invalid source index for pushFromGrowable");
    ck.testExactNumber(0, array1.pushFromGrowableXYArray(array0, n0 + 1), "invalid source index for pushFromGrowable");
    // Any transfer into empty array is bad . ..
    ck.testFalse(array1.transferFromGrowableXYArray(-1, array0, 1), "invalid source index transferFromGrowable");
    ck.testFalse(array1.transferFromGrowableXYArray(0, array0, 1), "invalid source index transferFromGrowable");
    ck.testFalse(array1.transferFromGrowableXYArray(100, array0, 1), "invalid source index transferFromGrowable");

    ck.testUndefined(array1.crossProductIndexIndexIndex(-1, 0, 1), "bad index0 for cross product");
    ck.testUndefined(array1.crossProductIndexIndexIndex(0, 100, 1), "bad index1 for cross product");
    ck.testUndefined(array1.crossProductIndexIndexIndex(0, 1, 100), "bad index2 for cross product");
    const spacePoint = Point2d.create(1, 2);
    ck.testUndefined(array1.crossProductXAndYIndexIndex(spacePoint, -1, 0), "bad indexA for cross product");
    ck.testUndefined(array1.crossProductXAndYIndexIndex(spacePoint, 0, -1), "bad indexB for cross product");

    const resultA = Point2d.create();
    const interpolationFraction = 0.321;
    for (let k = 1; k + 2 < n0; k++) {
      ck.testExactNumber(1, array1.pushFromGrowableXYArray(array0, k), "transformFromGrowable");

      ck.testUndefined(array1.interpolate(-1, 0.3, k), "interpolate with bad index");
      ck.testUndefined(array1.interpolate(100, 0.3, k), "interpolate with bad index");
      ck.testUndefined(array1.vectorIndexIndex(-1, k), "invalid index vectorIndexIndex");
      ck.testUndefined(array1.vectorIndexIndex(k, -1), "invalid index vectorIndexIndex");

      ck.testUndefined(array1.interpolate(k, 0.3, n0 + 1), "interpolate with bad index");
      ck.testUndefined(array1.interpolate(k, 0.3, n0 + 3), "interpolate with bad index");
      const k1 = (2 * k) % n0;    // this should be a valid index !!!
      if (ck.testTrue(array0.isIndexValid(k1)
        && ck.testPointer(array0.interpolate(k, interpolationFraction, k1, resultA)))) {
        const k2 = (2 * k + 1) % n0;

        const point0 = array0.getPoint2dAtUncheckedPointIndex(k);
        const point1 = array0.getPoint2dAtUncheckedPointIndex(k1);
        const resultB = point0.interpolate(interpolationFraction, point1);
        ck.testPoint2d(resultA, resultB, "compare interpolation paths");
        const crossA = array0.crossProductIndexIndexIndex(k, k1, k2);
        const crossB = array0.crossProductXAndYIndexIndex(point0, k1, k2);
        if (ck.testIsFinite(crossA) && crossA !== undefined && ck.testIsFinite(crossB) && crossB !== undefined) {
          ck.testCoordinate(crossA, crossB, "cross products to indexed points");
        }
      }
    }
    // bad transfers when the dest is not empty . . .
    ck.testFalse(array1.transferFromGrowableXYArray(-1, array0, 1), "invalid source index transferFromGrowable");
    ck.testFalse(array1.transferFromGrowableXYArray(100, array0, 1), "invalid source index transferFromGrowable");

    expect(ck.getNumErrors()).equals(0);
  });
  it("Compress", () => {
    const ck = new Checker();
    const data = new GrowableFloat64Array();
    data.compressAdjacentDuplicates(); // nothing happens on empty array.
    const n0 = 22;
    for (let i = 0; i < n0; i++) {
      const c = Math.cos(i * i);
      let n = 1;
      if (c < -0.6)
        n = 3;
      else if (c > 0.1) {
        if (c < 0.8)
          n = 2;
        else
          n = 4;
      }
      for (let k = 0; k < n; k++)
        data.push(i);
    }
    const n1 = data.length;
    data.compressAdjacentDuplicates(0.0001);
    ck.testExactNumber(n0, data.length, "compressed array big length", n1);
    expect(ck.getNumErrors()).equals(0);
  });
  it("LoadFromArray", () => {
    const ck = new Checker();
    const n = 5;
    const pointA = GrowableXYZArray.create(Sample.createGrowableArrayCirclePoints(1.0, n, false));
    const pointB = GrowableXYZArray.create(pointA.float64Data());
    const dataC = [];
    for (const x of pointA.float64Data()) dataC.push(x);
    const pointC = GrowableXYZArray.create(dataC);
    ck.testTrue(GrowableXYZArray.isAlmostEqual(pointA, pointB));
    ck.testTrue(GrowableXYZArray.isAlmostEqual(pointA, pointC));
    ck.testExactNumber(pointA.length, pointB.length);
    ck.testExactNumber(pointA.length, pointC.length);

    // GrowableXYZArray might hold some additional points exceeding the actual point length
    // Make sure that there are no hidden points
    ck.testUndefined(pointA.component(n, 0));
    ck.testUndefined(pointB.component(n, 0));
    ck.testUndefined(pointC.component(n, 0));
    expect(ck.getNumErrors()).equals(0);
  });

  it("MethodsImplementedByInterface", () => {
    const ck = new Checker();
    const growablePoints = new GrowableXYZArray();
    growablePoints.pushFrom([[0, 1, 2], [2, 3, 1], [-2, 3, 9]]);
    const simplePoints = growablePoints.getPoint3dArray();
    const wrapper = new Point3dArrayCarrier(simplePoints);
    let i = 0;
    for (const p of wrapper.points) {
      ck.testPoint3d(p, simplePoints[i], "wrapper vs simple");
      ck.testPoint3d(p, growablePoints.getPoint3dAtUncheckedPointIndex(i), "wrapper vs growable");
      i++;
    }
    const growableRange = growablePoints.getRange();
    const wrapperRange = wrapper.getRange();
    ck.testRange3d(growableRange, wrapperRange, "growable vs wrapper");
  });
  it("removeClosurePoints", () => {
    const ck = new Checker();
    const origin = Point3d.create(1, 2, 3);
    const points = Sample.createSquareWave(origin, 2, 1, 3, 3, 5);    // This has a single closure point !!
    const wrapper = new Point3dArrayCarrier(points);
    const originalCount = wrapper.length;
    const originalTrim = originalCount - 1;
    GrowableXYZArray.removeClosure(wrapper);
    ck.testExactNumber(originalTrim, points.length, "original closure point=>no change");
    GrowableXYZArray.removeClosure(wrapper);
    ck.testExactNumber(originalTrim, points.length, "no closure point=>no change");
    for (const numAdd of [1, 3]) {
      for (let i = 0; i < numAdd; i++)
        wrapper.push(origin);
      ck.testExactNumber(originalTrim + numAdd, wrapper.length, `after adding  ${numAdd} closure points`);
      GrowableXYZArray.removeClosure(wrapper);
      ck.testExactNumber(originalTrim, wrapper.length, `after removeClosure ${numAdd}`);
    }

  });

});
