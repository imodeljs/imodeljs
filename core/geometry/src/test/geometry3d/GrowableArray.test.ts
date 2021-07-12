/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Angle } from "../../geometry3d/Angle";
import { GrowableBlockedArray } from "../../geometry3d/GrowableBlockedArray";
import { GrowableFloat64Array } from "../../geometry3d/GrowableFloat64Array";
import { GrowableXYZArray } from "../../geometry3d/GrowableXYZArray";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/Plane3dByOriginAndUnitNormal";
import { Point2d, Vector2d } from "../../geometry3d/Point2dVector2d";
import { Point3dArrayCarrier } from "../../geometry3d/Point3dArrayCarrier";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Point3dArray } from "../../geometry3d/PointHelpers";
import { Transform } from "../../geometry3d/Transform";
import { ClusterableArray } from "../../numerics/ClusterableArray";
import { PolyfaceQuery } from "../../polyface/PolyfaceQuery";
import { Sample } from "../../serialization/GeometrySamples";
import { Checker } from "../Checker";
import { prettyPrint } from "../testFunctions";

/* eslint-disable no-console */
/** point whose coordinates are a function of i only. */
function testPointI(i: number): Point3d {
  return Point3d.create(i, 2 * i + 1, i * i * 3 + i * 2 - 4);
}
describe("GrowableFloat64Array.HelloWorld", () => {
  it("SizeChanges", () => {
    const ck = new Checker();
    const arr = new GrowableFloat64Array();
    arr.ensureCapacity(16);
    const b = 5.4;
    const c = 12.9;
    ck.testExactNumber(arr.capacity(), 16);
    arr.push(1);
    arr.push(c);
    const l = arr.length;
    ck.testExactNumber(c, arr.atUncheckedIndex(l - 1));
    arr.setAtUncheckedIndex(l - 1, b);
    ck.testExactNumber(arr.atUncheckedIndex(l - 1), b);

    arr.resize(1);
    ck.testExactNumber(arr.length, 1);
    arr.resize(5);
    ck.testExactNumber(arr.length, 5);
    ck.testExactNumber(arr.front(), 1);
    ck.testExactNumber(arr.atUncheckedIndex(1), 0);
    ck.testExactNumber(arr.back(), 0);
    const capacityB = 100;
    const lB = arr.length;
    arr.ensureCapacity(capacityB);
    ck.testLE(capacityB, arr.capacity(), "adequate ensure capacity");
    ck.testExactNumber(lB, arr.length, "length after expanding capacity");
    ck.checkpoint("GrowableArray.float64");
    expect(ck.getNumErrors()).equals(0);
  });
  it("FilterToInterval", () => {
    const ck = new Checker();
    const arr = new GrowableFloat64Array();
    arr.ensureCapacity(16);
    const data = Sample.createGrowableArrayCountedSteps(0, 1, 101);
    const numRemaining = 3;
    data.restrictToInterval(9.5, 9.5 + numRemaining);
    ck.testExactNumber(numRemaining, data.length, "restrictToInterval");
    ck.checkpoint("GrowableArray.FilterToInterval");
    expect(ck.getNumErrors()).equals(0);
  });

  it("move", () => {
    const ck = new Checker();
    const arr = new GrowableFloat64Array();
    arr.ensureCapacity(16);
    const data = Sample.createGrowableArrayCountedSteps(0, 1, 101);
    const numRemaining = 11;
    data.restrictToInterval(9.5, 9.5 + numRemaining);
    ck.testExactNumber(numRemaining, data.length, "restrictToInterval");
    const data0 = data.clone();
    const data1 = data.clone(true);
    ck.testExactNumber(data0.length, data1.length);
    ck.testExactNumber(data.length, data0.capacity());
    ck.testExactNumber(data.capacity(), data1.capacity());

    const n = data.length;
    // tedious reverse to use methods ...
    for (let i = 0, j = n - 1; i < j; i++, j--) {
      // swap odd i by logic at this level.  others swap with single method call .swap
      if ((i % 2) === 1) {
        const a = data.atUncheckedIndex(i);
        data.move(j, i);
        data.setAtUncheckedIndex(j, a);
      } else {
        data.swap(i, j);
      }
    }
    for (let i = 0; i < n; i++)
      ck.testExactNumber(data0.atUncheckedIndex(i), data.atUncheckedIndex(n - 1 - i));
    // block copy a subset to the end ....
    const numCopy = n - 4;
    const c0 = 2;
    data.pushBlockCopy(2, numCopy);
    for (let i = 0; i < numCopy; i++)
      ck.testExactNumber(data.atUncheckedIndex(c0 + i), data.atUncheckedIndex(n + i));

    ck.checkpoint("GrowableArray.move");
    expect(ck.getNumErrors()).equals(0);
  });

});

describe("BlockedArray", () => {
  it("Cluster", () => {
    const ck = new Checker();
    Checker.noisy.cluster = false;

    const blocks = new ClusterableArray(2, 1, 20);
    ck.testExactNumber(blocks.numPerBlock, 4);
    const e = 0.00001;
    const tolerance = 0.1;
    // This is the vector perpendicular to the sort direction.
    // points on these lines get considered for clusters.
    const perp = Vector2d.create(
      ClusterableArray.sortVectorComponent(1),
      -ClusterableArray.sortVectorComponent(0));

    // these points are distinct ...
    const xy0 = Point2d.create(1, 2);
    const xy1 = Point2d.create(3, 2);
    const xy2 = xy1.plusScaled(perp, 1.0);
    const xy3 = Point2d.create(3, 4.35);
    const xy4 = xy3.plusScaled(perp, 1.2);
    const xy5 = xy4.plusScaled(perp, -3.2);
    const points = [xy0, xy1, xy2, xy3, xy4, xy5];
    // add points, not in order, some shifted be vectors of size around e.
    // But the shifted things are marked as known to be with the same base point.
    blocks.addPoint2d(xy0, 0);
    blocks.addPoint2d(xy0.plusXY(e, 0), 0);

    blocks.addPoint2d(xy3.plusXY(-e, 0.5 * e), 3);

    blocks.addPoint2d(xy1, 1);
    blocks.addPoint2d(xy1.plusXY(e, 0), 1);

    blocks.addPoint2d(xy2, 2);
    blocks.addPoint2d(xy4.plusXY(e, -e), 4);

    blocks.addPoint2d(xy5, 5);

    blocks.addPoint2d(xy3, 3);
    blocks.addPoint2d(xy3.plusXY(e, e), 3);
    blocks.addPoint2d(xy1.plusXY(-e, 0), 1);

    blocks.addPoint2d(xy4.plusXY(0, -e), 4);
    blocks.addPoint2d(xy4.plusXY(0, -0.2 * e), 4);

    blocks.addPoint2d(xy4.plusXY(0.3 * e, -0.2 * e), 4);

    // get clusters !!!!
    // note that the order the clusters appear has no relationship to 012345 above.
    if (Checker.noisy.cluster) console.log(blocks.toJSON());
    const clusterIndices = blocks.clusterIndicesLexical(tolerance);
    if (Checker.noisy.cluster) console.log(blocks.toJSON());
    if (Checker.noisy.cluster) console.log(JSON.stringify(clusterIndices));
    for (let i = 0; i < clusterIndices.length; i++) {
      const k0 = clusterIndices[i];
      if (!ClusterableArray.isClusterTerminator(k0)) {
        const clusterIndex0 = blocks.getExtraData(k0, 0);
        const uv0 = blocks.getPoint2d(k0);
        if (Checker.noisy.cluster) console.log("cluster seed ", k0, uv0);
        for (; i < clusterIndices.length; i++) {
          const k1 = clusterIndices[i];
          if (ClusterableArray.isClusterTerminator(k1)) break;
          const uv1 = blocks.getPoint2d(k1);
          if (Checker.noisy.cluster) console.log("    cluster member", k1, uv1);
          const clusterIndex1 = blocks.getExtraData(k1, 0);
          ck.testExactNumber(clusterIndex0, clusterIndex1);
          ck.testLE(
            blocks.distanceBetweenBlocks(k0, k1), tolerance,
            "confirm cluster tolerance");
          // k0, k1 should match each other and the original cluster point
          ck.testLE(uv0.distance(uv1), tolerance, "query cluster", k0, k1);
          ck.testLE(uv1.distance(points[clusterIndex1]), tolerance, "original cluster");
        }
      }
    }
    // verify the various forms of index . ..
    const clusterToClusterStart = blocks.createIndexClusterToClusterStart(clusterIndices);
    const blockToClusterStart = blocks.createIndexBlockToClusterStart(clusterIndices);
    const blockToClusterIndex = blocks.createIndexBlockToClusterIndex(clusterIndices);
    const n = clusterIndices.length;
    ck.testExactNumber(blockToClusterStart.length, blocks.numBlocks);
    ck.testExactNumber(blockToClusterIndex.length, blocks.numBlocks);
    for (let clusterIndex = 0; clusterIndex < clusterToClusterStart.length; clusterIndex++) {
      const clusterStart = clusterToClusterStart[clusterIndex];
      for (let i = clusterStart; i < n && !ClusterableArray.isClusterTerminator(clusterIndices[i]); i++) {
        const b = clusterIndices[i];
        ck.testExactNumber(blockToClusterStart[b], clusterStart, "blockToClusterStart");
        ck.testExactNumber(clusterIndex, blockToClusterIndex[b], blockToClusterIndex);
      }
    }

    blocks.clear();
    ck.testExactNumber(blocks.numBlocks, 0);
    blocks.addBlock([3, 2, 1]);
    blocks.addDirect(5, 6, 7, 8, 9);
    blocks.addBlock([1, 2, 3]);
    const sortedView = blocks.sortIndicesLexical();
    ck.testPoint2d(blocks.getPoint2d(sortedView[0]), Point2d.create(1, 2));

    const blocks2 = new ClusterableArray(2, 3, 5);
    blocks2.addPoint2d(Point2d.create(1, 2), 5, 6, 7);
    blocks2.addPoint3d(Point3d.create(1, 2, 3), 5, 6, 7);
    ck.testPoint3d(blocks2.getPoint3d(1), Point3d.create(1, 2, 3));
    const obj = blocks2.toJSON();
    ck.testTrue(obj[0][2][0] === 1 && obj[0][2][1] === 2);
    ck.testTrue(obj[1][2][0] === 1 && obj[1][2][1] === 2);
    blocks2.popBlock();
    ck.testExactNumber(blocks2.numBlocks, 1);
    ck.testExactNumber(blocks2.checkedComponent(0, 1)!, 1);
    ck.testUndefined(blocks2.checkedComponent(1, 2));

    ck.checkpoint("GrowableArray.annotateClusters");
    expect(ck.getNumErrors()).equals(0);
  });
  it("HelloWorld", () => {
    // REMARK: GrowableBlockedArray gets significant testing via GrowableXYZArray.
    const ck = new Checker();
    const numPerBlock = 5;
    const numInitialBlocks = 7;
    const data0 = new GrowableBlockedArray(numPerBlock, numInitialBlocks);
    ck.testExactNumber(numPerBlock, data0.numPerBlock);
    ck.testExactNumber(0, data0.numBlocks);
    const blockStep = 10;
    const baseBlock = [1, 3, 5, 7, 9];    // all less than blockStep to simplify testing.
    const numAdd = 9;
    for (let i = 0; i < numAdd; i++) {
      const newBlock = [];
      const blockBaseValue = blockStep * data0.numBlocks;
      for (const a of baseBlock) newBlock.push(a + blockBaseValue);
      if (i === 3 || i === 7)
        newBlock.push(999);    // an extraneous value to test handling of oversize inputs
      data0.addBlock(newBlock);
    }

    for (let blockIndex = 0; blockIndex < numAdd; blockIndex++) {
      for (let j = 0; j < numPerBlock; j++) {
        ck.testExactNumber(baseBlock[j] + blockIndex * blockStep, data0.component(blockIndex, j));
      }
    }
    ck.testExactNumber(numAdd, data0.numBlocks);
    ck.checkpoint("GrowableBlockedArray.HelloWorld");
    expect(ck.getNumErrors()).equals(0);
  });

});

describe("GrowablePoint3dArray", () => {
  it("PointMoments", () => {
    const ck = new Checker();
    for (let n = 3; n < 100; n *= 2) {
      const pointA = new GrowableXYZArray();
      const pointB = [];
      ck.testExactNumber(pointA.length, 0);
      // load pointB
      for (let i = 0; i < n; i++) {
        pointB.push(Point3d.create(Math.cos(i * i), i + 0.25, i + 0.5));
        // pointB.push(Point3d.create(i, i + 0.25, i + 0.5));
        // pointB.push(Point3d.create(-i, i + 0.25, i + 0.5));
      }

      // verify undefined returns from empty array
      ck.testUndefined(pointA.front());
      ck.testUndefined(pointA.back());
      ck.testFalse(pointA.isIndexValid(4));
      for (const p of pointB) {
        pointA.push(p);
        ck.testPoint3d(p, pointA.back() as Point3d);
        ck.testPoint3d(pointB[0], pointA.front() as Point3d);
      }
      for (let i = 0; i < n; i++)
        ck.testPoint3d(pointB[i], pointA.getPoint3dAtUncheckedPointIndex(i));
      ck.testExactNumber(pointA.length, pointB.length, "array lengths");

      let lengthA = 0;
      for (let i = 0; i + 1 < n; i++) {
        lengthA += pointA.getPoint3dAtUncheckedPointIndex(i).distance(pointA.getPoint3dAtUncheckedPointIndex(i + 1));
        const d0 = pointA.distanceIndexIndex(i, i + 1);
        const d1 = pointA.distanceIndexIndex(i, i + 1);
        const d1Squared = pointA.distanceSquaredIndexIndex(i, i + 1);
        ck.testCoordinate(d0!, d1!);
        ck.testFalse(d1Squared === undefined);
        ck.testCoordinate(d0! * d0!, d1Squared!);
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
      ck.testUndefined(pointA.distanceIndexIndex(0, 1000));
      ck.testUndefined(pointA.distanceIndexIndex(-1, 0));

      ck.testUndefined(pointA.distanceSquaredIndexIndex(0, 1000));
      ck.testUndefined(pointA.distanceSquaredIndexIndex(-1, 0));
    }
    ck.checkpoint("GrowablePoint3dArray.HelloWorld");
    expect(ck.getNumErrors()).equals(0);
  });

  it("Wrap", () => {
    const ck = new Checker();
    const numWrap = 3;
    for (let n = 5; n < 100; n *= 2) {
      const pointA = Sample.createGrowableArrayCirclePoints(1.0, n, false);
      pointA.pushWrap(numWrap);
      ck.testExactNumber(n + numWrap, pointA.length, "pushWrap increases length");
      for (let i = 0; i < numWrap; i++) {
        ck.testPoint3d(pointA.getPoint3dAtUncheckedPointIndex(i), pointA.getPoint3dAtUncheckedPointIndex(n + i), "wrapped point");
      }
      let numDup = 0;
      const sortOrder = pointA.sortIndicesLexical();
      for (let i = 0; i + 1 < pointA.length; i++) {
        const k0 = sortOrder[i];
        const k1 = sortOrder[i + 1];
        if (pointA.getPoint3dAtUncheckedPointIndex(k0).isAlmostEqual(pointA.getPoint3dAtUncheckedPointIndex(k1))) {
          ck.testLT(k0, k1, "lexical sort preserves order for duplicates");
          numDup++;
        } else {
          const s = pointA.compareLexicalBlock(k0, k1);
          ck.testExactNumber(-1, s);
          const s1 = pointA.compareLexicalBlock(k1, k0);
          ck.testExactNumber(1, s1);
        }
        ck.testExactNumber(i, pointA.cyclicIndex(i));
        ck.testExactNumber(i, pointA.cyclicIndex(i + pointA.length));
      }
      ck.testExactNumber(numWrap, numDup, "confirm numWrap duplicates");
    }
    ck.checkpoint("GrowablePoint3dArray.Wrap");
    expect(ck.getNumErrors()).equals(0);
  });

  it("PolyfaceMoments", () => {
    const ck = new Checker();
    ck.checkpoint("Solids.PointMoments");
    // https://en.wikipedia.org/wiki/List_of_second_moments_of_area
    // https://en.wikipedia.org/wiki/List_of_moments_of_inertia
    // Filled rectangular area with x size b, y size h, centered at origin.
    const b = 6.0;
    const h = 2.0;
    const IX = b * h * h * h / 12.0;
    const IY = b * b * b * h / 12.0;
    for (const origin of [Point3d.create(-b / 2, -h / 2, 0), Point3d.create(1, 1, 0)]) {
      const polyface = Sample.createTriangularUnitGridPolyface(
        origin,
        Vector3d.create(b, 0, 0), Vector3d.create(0, h, 0), 2, 2, false, false, false);
      const moments = PolyfaceQuery.computePrincipalAreaMoments(polyface);
      if (Checker.noisy.rectangleMoments) {
        console.log("Rectangle lower left", origin);
        console.log(prettyPrint(polyface));
        console.log(prettyPrint(moments!));
        console.log("expected IX", IX);
        console.log("expected IY", IY);
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });
  /** Basic output testing on appendages, sorting, transforming of a known inverse, and testing recognition of plane proximity within correct tolerance */
  it("BlackBoxTests", () => {
    const ck = new Checker();
    const arr = new GrowableXYZArray();
    arr.ensureCapacity(9);
    arr.push(Point3d.create(1, 2, 3));
    arr.push(Point3d.create(4, 5, 6));
    arr.push(Point3d.create(7, 8, 9));
    arr.resize(2);
    ck.testExactNumber(arr.length, 2);
    ck.testTrue(arr.compareLexicalBlock(0, 1) < 0 && arr.compareLexicalBlock(1, 0) > 0);
    const point = Point3d.create();
    arr.getPoint3dAtCheckedPointIndex(1, point);
    const vector = arr.getVector3dAtCheckedVectorIndex(1)!;
    ck.testTrue(point.isAlmostEqual(vector));
    ck.testPoint3d(point, Point3d.create(4, 5, 6));

    const transform = Transform.createOriginAndMatrix(Point3d.create(0, 0, 0), Matrix3d.createRowValues(
      2, 1, 0,
      2, 0, 0,
      2, 0, 1,
    ));
    const noInverseTransform = Transform.createOriginAndMatrix(Point3d.create(0, 0, 0), Matrix3d.createRowValues(
      1, 6, 4,
      2, 4, -1,
      -1, 2, 5,
    ));

    ck.testTrue(arr.tryTransformInverseInPlace(transform));
    ck.testFalse(arr.tryTransformInverseInPlace(noInverseTransform));
    ck.testPoint3d(arr.getPoint3dAtUncheckedPointIndex(0), Point3d.create(1, -1, 1));

    arr.resize(1);

    const closePlane = Plane3dByOriginAndUnitNormal.create(Point3d.create(1, -1 + 1.0e-10, 1), Vector3d.create(1, 1, 1));
    const nonClosePlane = Plane3dByOriginAndUnitNormal.create(Point3d.create(1, -1 + 1.0e-4, 1), Vector3d.create(1, 1, 1));
    ck.testTrue(arr.isCloseToPlane(closePlane!));
    ck.testFalse(arr.isCloseToPlane(nonClosePlane!));

    expect(ck.getNumErrors()).equals(0);
  });

  it("IndexedXYZCollection", () => {
    const ck = new Checker();
    const points = Sample.createFractalDiamondConvexPattern(1, -0.5);
    const frame = Transform.createFixedPointAndMatrix(Point3d.create(1, 2, 3),
      Matrix3d.createRotationAroundVector(Vector3d.create(0.3, -0.2, 1.2), Angle.createDegrees(15.7))!);
    frame.multiplyPoint3dArrayInPlace(points);

    const gPoints = new GrowableXYZArray();
    gPoints.pushAll(points);
    const iPoints = new Point3dArrayCarrier(points);
    const iOrigin = iPoints.getPoint3dAtCheckedPointIndex(0)!;
    const gOrigin = gPoints.getPoint3dAtCheckedPointIndex(0)!;
    ck.testPoint3d(iOrigin, gOrigin, "point 0 access");
    for (let i = 1; i + 1 < points.length; i++) {
      const j = i + 1;
      const pointIA = iPoints.getPoint3dAtCheckedPointIndex(i)!;
      const pointGA = gPoints.getPoint3dAtCheckedPointIndex(i)!;
      const pointIB = iPoints.getPoint3dAtCheckedPointIndex(j)!;
      const pointGB = gPoints.getPoint3dAtCheckedPointIndex(j)!;
      const vectorIA = iPoints.vectorIndexIndex(i, j)!;
      const vectorGA = gPoints.vectorIndexIndex(i, j)!;

      const vectorIA1 = iPoints.vectorXYAndZIndex(pointIA, j)!;
      const vectorGA1 = gPoints.vectorXYAndZIndex(pointIA, j)!;

      ck.testVector3d(vectorIA1, vectorGA1, "vectorXYAndZIndex");
      ck.testPoint3d(pointIA, pointGA, "atPoint3dIndex");
      ck.testVector3d(vectorIA, pointIA.vectorTo(pointIB));
      ck.testVector3d(vectorGA, pointIA.vectorTo(pointGB));
      ck.testVector3d(
        iPoints.crossProductIndexIndexIndex(0, i, j)!,
        gPoints.crossProductIndexIndexIndex(0, i, j)!);
      ck.testVector3d(
        iPoints.crossProductXYAndZIndexIndex(iOrigin, i, j)!,
        gPoints.crossProductXYAndZIndexIndex(gOrigin, i, j)!);

      ck.testVector3d(
        iPoints.getVector3dAtCheckedVectorIndex(i)!,
        gPoints.getVector3dAtCheckedVectorIndex(i)!,
        "atVector3dIndex");

      ck.testPoint3d(Point3dArray.centroid(iPoints), Point3dArray.centroid(gPoints), "centroid");
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("resizeAndBoundsChecks", () => {
    const ck = new Checker();
    const points = Sample.createFractalDiamondConvexPattern(1, -0.5);

    const xyzPoints = new GrowableXYZArray(points.length);    // just enough so we know the initial capacity.
    for (const p of points)
      xyzPoints.push(p);

    ck.testTrue(GrowableXYZArray.isAlmostEqual(xyzPoints, xyzPoints), "isAlmostEqual duplicate pair");
    ck.testTrue(GrowableXYZArray.isAlmostEqual(undefined, undefined), "isAlmostEqual undefined pair");

    ck.testFalse(GrowableXYZArray.isAlmostEqual(undefined, xyzPoints), "isAlmostEqual one undefined");
    ck.testFalse(GrowableXYZArray.isAlmostEqual(xyzPoints, undefined), "isAlmostEqual one undefined");

    const n0 = xyzPoints.length;
    ck.testExactNumber(n0, points.length);
    const deltaN = 5;
    const n1 = n0 + deltaN;
    xyzPoints.resize(n1);
    ck.testExactNumber(n1, xyzPoints.length);

    const n2 = n0 - deltaN;
    xyzPoints.resize(n2);  // blow away some points.

    ck.testUndefined(xyzPoints.getVector3dAtCheckedVectorIndex(-4));
    ck.testUndefined(xyzPoints.getVector3dAtCheckedVectorIndex(n2));

    // verify duplicate methods ....
    for (let i0 = 3; i0 < n2; i0 += 5) {
      for (let i1 = 0; i1 < n2; i1 += 3) {
        const vectorA = points[i0].vectorTo(points[i1]);
        const vectorB = xyzPoints.vectorIndexIndex(i0, i1);
        if (vectorB)
          ck.testVector3d(vectorA, vectorB);
        else
          ck.announceError("vectorIndexIndex?", i0, i1, vectorA, vectorB);
      }
    }

    const spacePoint = Point3d.create(1, 4, 3);
    for (let i0 = 2; i0 < n2; i0 += 6) {
      const distance0 = xyzPoints.distanceIndexToPoint(i0, spacePoint);
      const distance1 = xyzPoints.getPoint3dAtCheckedPointIndex(i0)!.distance(spacePoint);
      const vectorI0 = xyzPoints.vectorXYAndZIndex(spacePoint, i0);
      if (ck.testPointer(vectorI0) && distance0 !== undefined) {
        ck.testCoordinate(vectorI0.magnitude(), distance0)!;
        ck.testCoordinate(distance0, distance1);
      }
    }

    ck.testUndefined(xyzPoints.distanceIndexIndex(-1, 0), "distance to invalid indexA");
    ck.testUndefined(xyzPoints.distanceIndexIndex(0, -1), "distance to invalid indexB");
    ck.testUndefined(xyzPoints.distanceIndexToPoint(-1, spacePoint), "distance to invalid indexA");

    ck.testFalse(xyzPoints.setXYZAtCheckedPointIndex(-5, 1, 2, 3), "negative index for setCoordinates");
    ck.testFalse(xyzPoints.setXYZAtCheckedPointIndex(100, 1, 2, 3), "huge index for setCoordinates");

    ck.testFalse(xyzPoints.setAtCheckedPointIndex(-5, spacePoint), "negative index for setAt");
    ck.testFalse(xyzPoints.setAtCheckedPointIndex(100, spacePoint), "huge index for setAt");
    ck.testUndefined(xyzPoints.vectorXYAndZIndex(spacePoint, -5), "negative index for vectorXYAndZIndex");

    expect(ck.getNumErrors()).equals(0);
  });

  it("transferAndSet", () => {
    const ck = new Checker();
    const points = Sample.createFractalDiamondConvexPattern(1, -0.5);

    const array0 = new GrowableXYZArray(points.length);    // just enough so we know the initial capacity.
    for (const p of points)
      array0.push(p);
    const n0 = array0.length;

    const array1 = new GrowableXYZArray();
    // transfers with bad source index
    ck.testExactNumber(0, array1.pushFromGrowableXYZArray(array0, -1), "invalid source index for pushFromGrowable");
    ck.testExactNumber(0, array1.pushFromGrowableXYZArray(array0, n0 + 1), "invalid source index for pushFromGrowable");
    // Any transfer into empty array is bad . ..
    ck.testFalse(array1.transferFromGrowableXYZArray(-1, array0, 1), "invalid source index transferFromGrowable");
    ck.testFalse(array1.transferFromGrowableXYZArray(0, array0, 1), "invalid source index transferFromGrowable");
    ck.testFalse(array1.transferFromGrowableXYZArray(100, array0, 1), "invalid source index transferFromGrowable");

    ck.testUndefined(array1.crossProductIndexIndexIndex(-1, 0, 1), "bad index0 for cross product");
    ck.testUndefined(array1.crossProductIndexIndexIndex(0, 100, 1), "bad index1 for cross product");
    ck.testUndefined(array1.crossProductIndexIndexIndex(0, 1, 100), "bad index2 for cross product");
    const spacePoint = Point3d.create(1, 2, 3);
    ck.testUndefined(array1.crossProductXYAndZIndexIndex(spacePoint, -1, 0), "bad indexA for cross product");
    ck.testUndefined(array1.crossProductXYAndZIndexIndex(spacePoint, 0, -1), "bad indexB for cross product");

    const resultA = Point3d.create();
    const interpolationFraction = 0.321;
    for (let k = 1; k + 2 < n0; k++) {
      ck.testExactNumber(1, array1.pushFromGrowableXYZArray(array0, k), "transformFromGrowable");

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

        const point0 = array0.getPoint3dAtUncheckedPointIndex(k);
        const point1 = array0.getPoint3dAtUncheckedPointIndex(k1);
        const resultB = point0.interpolate(interpolationFraction, point1);
        ck.testPoint3d(resultA, resultB, "compare interpolation paths");
        const crossA = array0.crossProductIndexIndexIndex(k, k1, k2);
        const crossB = array0.crossProductXYAndZIndexIndex(point0, k1, k2);
        if (ck.testPointer(crossA) && ck.testPointer(crossB)) {
          ck.testVector3d(crossA, crossB, "cross products to indexed points");
        }
      }
    }
    // bad transfers when the dest is not empty . . .
    ck.testFalse(array1.transferFromGrowableXYZArray(-1, array0, 1), "invalid source index transferFromGrowable");
    ck.testFalse(array1.transferFromGrowableXYZArray(100, array0, 1), "invalid source index transferFromGrowable");

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

  it("Coverage", () => {
    const ck = new Checker();
    const dataA = new GrowableXYZArray();
    const dataB = new GrowableXYZArray();
    for (let i = 0; i < 5; i++) {
      dataA.push(testPointI(i));
    }
    for (let j = 0; j < 3; j++) {
      dataB.push(testPointI(2 * j));
    }

    for (let i = 0; i < dataA.length; i++) {
      for (let j = 0; j < dataB.length; j++) {
        ck.testCoordinate(GrowableXYZArray.distanceBetweenPointsIn2Arrays(dataA, i, dataB, j)!,
          testPointI(i).distance(testPointI(2 * j)));
        const pointA2 = dataA.getPoint2dAtCheckedPointIndex(i)!;
        const pointB2 = dataB.getPoint2dAtUncheckedPointIndex(j);
        const pointA3 = dataA.getPoint3dAtCheckedPointIndex(i)!;
        const pointB3 = dataB.getPoint3dAtUncheckedPointIndex(j);
        ck.testCoordinate(pointA2.distance(pointB2), pointB3.distanceXY(pointA3));
      }
    }
    for (const i of [-2, 12]) {
      ck.testUndefined(dataA.getPoint2dAtCheckedPointIndex(i));
      for (const j of [24, -3]) {
        ck.testUndefined(GrowableXYZArray.distanceBetweenPointsIn2Arrays(dataA, i, dataB, j));
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });
  it("TransformingNormals", () => {
    const ck = new Checker();
    const dataA = new GrowableXYZArray();
    ck.testFalse(dataA.multiplyAndRenormalizeMatrix3dInverseTransposeInPlace(Matrix3d.createScale(0, 1, 0)), "Singular Matrix should fail");

    const matrix = Matrix3d.createRowValues(
      6, -3, 1,
      4, 9, 2,
      -1, 4, 8);
    const matrixTranspose = matrix.transpose();
    dataA.pushXYZ(1, 0, 0);
    ck.testTrue(dataA.multiplyAndRenormalizeMatrix3dInverseTransposeInPlace(matrix), "Normal transform with good data");
    dataA.pushXYZ(0, 0, 0);
    ck.testFalse(dataA.multiplyAndRenormalizeMatrix3dInverseTransposeInPlace(matrix), "Normal transform with bad data");

    dataA.clear();
    for (let i = 0; i < 5; i++) {
      dataA.push(testPointI(i));
    }
    const matrixInverseTranspose = matrixTranspose.inverse()!;
    const dataB = dataA.clone();
    ck.testTrue(dataA.multiplyAndRenormalizeMatrix3dInverseTransposeInPlace(matrix));
    dataB.multiplyMatrix3dInPlace(matrixInverseTranspose);
    for (let i = 0; i < dataA.length; i++) {
      const vectorA = dataA.getVector3dAtCheckedVectorIndex(i)!;
      const vectorB = dataB.getVector3dAtCheckedVectorIndex(i)!;
      ck.testCoordinate(vectorA.magnitude(), 1.0);
      ck.testParallel(vectorA, vectorB);
    }
    expect(ck.getNumErrors()).equals(0);
  });
  it("pushFrom", () => {
    const ck = new Checker();
    const dataA = new GrowableXYZArray();
    const dataB = new GrowableXYZArray();
    const dataC = new GrowableXYZArray();
    const dataD = new GrowableXYZArray();
    const dataA0 = new GrowableXYZArray();
    const dataB0 = new GrowableXYZArray();
    const dataC0 = new GrowableXYZArray();
    const points = [
      Point3d.create(1, 2, 3),
      Point3d.create(2, 4, 10)];

    /** Assemble the points into GrowableXYZArray with variant input parse ... */
    dataA.pushFrom(points);
    for (const p of points) {
      dataB.pushFrom(p);
      dataC.pushFrom({ x: p.x, y: p.y, z: p.z });
      dataD.pushFrom([p.x, p.y, p.z]);
    }
    for (const p of points) {
      const p2 = Point2d.create(p.x, p.y);
      dataA0.pushFrom(p2);
      dataB0.pushFrom({ x: p.x, y: p.y });
      dataC0.pushFrom([p.x, p.y]);
    }
    ck.testTrue(GrowableXYZArray.isAlmostEqual(dataA, dataB));
    ck.testTrue(GrowableXYZArray.isAlmostEqual(dataA, dataC));
    ck.testTrue(GrowableXYZArray.isAlmostEqual(dataA0, dataB0));
    ck.testTrue(GrowableXYZArray.isAlmostEqual(dataA0, dataC0));
    expect(ck.getNumErrors()).equals(0);
  });
  it("pushFront", () => {
    const ck = new Checker();
    const dataA = new GrowableXYZArray();
    const dataB = new GrowableXYZArray();
    // push front and back, forcing several reallocations
    for (let i = 0; i < 75; i++) {
      const xyz = { x: i, y: 10 + i, z: 20 + i };
      dataA.push(xyz);
      dataB.pushFront(xyz);
    }
    dataA.reverseInPlace();
    ck.testTrue(GrowableXYZArray.isAlmostEqual(dataA, dataB));
    expect(ck.getNumErrors()).equals(0);
  });

});
