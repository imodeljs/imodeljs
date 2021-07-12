/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as fs from "fs";
import { BezierCurve3d } from "../../bspline/BezierCurve3d";
import { Arc3d } from "../../curve/Arc3d";
import { BagOfCurves, ConsolidateAdjacentCurvePrimitivesOptions, CurveCollection } from "../../curve/CurveCollection";
import { CurveFactory } from "../../curve/CurveFactory";
import { CurveLocationDetail } from "../../curve/CurveLocationDetail";
import { CurvePrimitive } from "../../curve/CurvePrimitive";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Loop } from "../../curve/Loop";
import { Path } from "../../curve/Path";
import { RegionOps } from "../../curve/RegionOps";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Range3d } from "../../geometry3d/Range";
import { Transform } from "../../geometry3d/Transform";
import { Sample } from "../../serialization/GeometrySamples";
import { IModelJson } from "../../serialization/IModelJsonSchema";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";

/* eslint-disable no-console */

const consolidateAdjacentPath = "./src/test/testInputs/curve/";
/**
 * mutate data so it is an array or undefined.
 */
function resolveToArray(data: any) {
  if (data === undefined)
    return data;
  if (Array.isArray(data))
    return data;
  return [data];
}
function verifyCurveCollection(ck: Checker, collection: CurveCollection) {
  const scaleFactor = 3.0;
  const scaleTransform = Transform.createScaleAboutPoint(Point3d.createZero(), scaleFactor);
  const length0 = collection.sumLengths();
  const gap0 = collection.maxGap();
  const range0 = collection.range();
  const range2 = Range3d.createNull();
  const range2A = collection.range(undefined, range2);
  ck.testTrue(range2 === range2A, "reuse result range");
  ck.testTrue(range2.isAlmostEqual(range0));

  const path2 = collection.clone();
  if (ck.testPointer(path2, "clone!!") && path2) {
    const length2 = path2.sumLengths();
    ck.testCoordinate(length0, length2, "path2.sumLengths");
  }
  const path3 = collection.cloneTransformed(scaleTransform);
  if (ck.testPointer(path3)) {
    if (!ck.testBoolean(false, path3.isAlmostEqual(collection), "cloneTransform not almostEqual")) {
      const path3A = collection.cloneTransformed(scaleTransform);
      if (ck.testPointer(path3A)) {
        ck.testBoolean(false, path3A.isAlmostEqual(collection), "cloneTransform not almostEqual");
      }
    }
  }

  ck.testBoolean(true, collection.isAlmostEqual(collection), "isAlmostEqual on self");
  // console.log (prettyPrint (collection));
  collection.tryTransformInPlace(scaleTransform);
  const length1 = collection.sumLengths();
  // console.log (prettyPrint (collection));
  const gap1 = collection.maxGap();
  const range1 = collection.range();

  if (path3) {
    const length3 = path3.sumLengths();
    ck.testCoordinate(length1, length3, "length of clone(transform), transformInPlace");
    const path5 = collection.cloneTransformed(scaleTransform)!;
    path5.sumLengths();

  }

  ck.testCoordinate(length0 * scaleFactor, length1, "scaled length");
  ck.testCoordinate(gap0 * scaleFactor, gap1, "scaled maxGap");
  ck.testCoordinate(range0.xLength() * scaleFactor, range1.xLength(), "scaled rangeX");
  ck.testCoordinate(range0.yLength() * scaleFactor, range1.yLength(), "scaled rangeY");
  ck.testCoordinate(range0.zLength() * scaleFactor, range1.zLength(), "scaled rangeZ");
  const path4 = collection.cloneStroked();
  ck.testPointer(path4, "clone Stroked");

  ck.testFalse(collection.isOpenPath && collection.isClosedPath, "Collection cannot be both open and closed path");
  ck.testFalse(collection.isOpenPath && collection.isAnyRegionType, "Collection cannot be both open and region");
  if (collection.children) {
    let i = 0;
    for (const child of collection.children) {
      const child1 = collection.getChild(i++);
      ck.testTrue(child === child1, "collection.getChild matches iterator ");
    }
  }

}
describe("CurveCollection", () => {
  it("HelloWorld", () => {
    const ck = new Checker();
    for (const data of Sample.createBagOfCurves()) verifyCurveCollection(ck, data);
    for (const data of Sample.createSimpleParityRegions()) verifyCurveCollection(ck, data);
    for (const data of Sample.createSimplePaths(true)) verifyCurveCollection(ck, data);
    for (const data of Sample.createSimpleLoops()) verifyCurveCollection(ck, data);
    for (const data of Sample.createSimpleUnions()) verifyCurveCollection(ck, data);
    ck.checkpoint("CurveCollection.HelloWorld");
    expect(ck.getNumErrors()).equals(0);
  });
  it("hasNonLinearPrimitives", () => {
    const ck = new Checker();
    const counts = { nonLinearTrue: 0, nonLinearFalse: 1 };
    for (const data of Sample.createBagOfCurves())
      if (data.checkForNonLinearPrimitives())
        counts.nonLinearTrue++;
      else
        counts.nonLinearFalse++;
    // We think (hard to prove!!) that the array of BagOfCurves had some members in each category ... flag if not.
    ck.testLE(0, counts.nonLinearFalse, "BagOfCurves samples should have some linear-only");
    ck.testLE(0, counts.nonLinearTrue, "BagOfCurves samples should have some nonLinear");
    ck.checkpoint("CurveCollection.hasNonLinearPrimitives");
    expect(ck.getNumErrors()).equals(0);
  });
  it("CyclicIndex", () => {
    const ck = new Checker();
    const loop = Loop.create();
    ck.testUndefined(loop.cyclicCurvePrimitive(0), "cyclicCurvePrimitive returns undefined in empty loop");
    const path = Path.create();
    ck.testUndefined(path.cyclicCurvePrimitive(0), "cyclicCurvePrimitive returns undefined in empty path");
    const line = LineSegment3d.createXYZXYZ(1, 2, 3, 6, 2, 3);
    const linestring = LineString3d.create([[6, 2, 3], [5, 3, 9], [1, 2, 3]]);
    loop.tryAddChild(line);
    loop.tryAddChild(linestring);
    path.tryAddChild(line);
    path.tryAddChild(linestring);

    ck.testPointer(loop.cyclicCurvePrimitive(0), "cyclicCurvePrimitive in singleton loop");
    ck.testPointer(path.cyclicCurvePrimitive(0), "cyclicCurvePrimitive in singleton path");
    for (const g of [loop, path]) {
      const n = g.children.length;
      for (let k = 0; k < n; k++) {
        const c0 = g.cyclicCurvePrimitive(k);
        for (let i = -2; i < 4; i++) {
          ck.testTrue(loop.cyclicCurvePrimitive(k + i * n) === c0, "cyclicCurvePrimitive ");
        }
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });
});

describe("ConsolidateAdjacentPrimitives", () => {

  it("Lines", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    let x0 = 0.0;
    const xStep = 5.0;
    const yStep = 5.0;
    const y0 = 0.0;
    for (const originalPoints of [Sample.createStar(0, 0, 0, 3, 1, 40, false), Sample.createStar(0, 0, 0, 1, Math.sqrt(2), 4, false)]) {
      const path0 = Path.create();
      let i0 = 0;
      for (const edgesInBlock of [2, 5, 1, 9]) {
        if (i0 + edgesInBlock >= originalPoints.length)
          break;
        if (edgesInBlock === 1) {
          path0.children.push(LineSegment3d.create(originalPoints[i0], originalPoints[i0 + 1]));
          i0 += 1;
        } else {
          const linestring = LineString3d.create();
          for (let i = i0; i < i0 + edgesInBlock + 1; i++) {
            linestring.addPoint(originalPoints[i]);
          }
          path0.children.push(linestring);
          i0 += edgesInBlock;
        }
        x0 += xStep;
      }
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, path0, x0, y0);
      markLimits(allGeometry, path0.collectCurvePrimitives(), 0.01, 0.03, 0.01, x0, y0);
      RegionOps.consolidateAdjacentPrimitives(path0);
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, path0, x0, y0 + yStep);
      ck.testExactNumber(1, path0.children.length, "full consolidation");
      markLimits(allGeometry, path0.collectCurvePrimitives(), 0.01, 0.03, 0.01, x0, y0 + yStep);
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "ConsolidateAdjacentPrimitives", "Lines");
    expect(ck.getNumErrors()).equals(0);
  });

  it("LinesAndArcs", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    ck.testUndefined(CurveFactory.createFilletsInLineString([Point3d.create(0, 0, 0)], 0.2, false));
    let x0 = 0.0;
    const y0 = 0.0;
    const points = [Point3d.create(0, 0, 0), Point3d.create(2, 0, 0), Point3d.create(2, 3, 1), Point3d.create(4, 3, 1), Point3d.create(6, 2, 1)];
    const tail = points[points.length - 1];
    const chain0 = CurveFactory.createFilletsInLineString(points, 0.2, false)!;
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, chain0, x0, y0);
    x0 += 10;
    chain0.tryAddChild(BezierCurve3d.create([tail,
      tail.plus(Vector3d.create(1, 1, 0)),
      tail.plus(Vector3d.create(2, 0, -1)),
      tail.plus(Vector3d.create(-2, 3, 0))]));
    const chain1 = Path.create();
    const breakFractionRadius = 0.4;
    let radians = 0.3;
    for (const c of chain0.children) {
      radians += 0.25;
      const breakFraction = 0.5 + Math.cos(radians) * breakFractionRadius;
      chain1.tryAddChild(c.clonePartialCurve(0.0, breakFraction));
      chain1.tryAddChild(c.clonePartialCurve(breakFraction, 1.0));
    }
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, chain1, x0, y0);
    markLimits(allGeometry, chain1.collectCurvePrimitives(), 0.01, 0.03, 0.01, x0, y0);
    x0 += 20.0;
    for (const optionBits of [0, 1, 2, 3]) {
      const options = new ConsolidateAdjacentCurvePrimitivesOptions();
      let dx = 0;
      let dy = 0;
      options.consolidateLinearGeometry = false;
      options.consolidateCompatibleArcs = false;
      if ((optionBits & 0x01) !== 0) {
        dx = 10;
        options.consolidateLinearGeometry = true;
      }
      if ((optionBits & 0x02) !== 0) {
        dy = 10;
        options.consolidateCompatibleArcs = true;
      }
      const chainA = chain1.clone()!;
      RegionOps.consolidateAdjacentPrimitives(chainA, options);
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, chainA, x0 + dx, y0 + dy);
      markLimits(allGeometry, chainA.collectCurvePrimitives(), 0.01, 0.03, 0.01, x0 + dx, y0 + dy);
      ck.testCoordinate(chain0.sumLengths(), chainA.sumLengths(), " compressed length with ", options);
    }

    GeometryCoreTestIO.saveGeometry(allGeometry, "ConsolidateAdjacentPrimitives", "LinesAndArcs");
    expect(ck.getNumErrors()).equals(0);
  });
  it("consolidateAdjacentFiles", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    let x0 = 0;
    const y0 = 0;
    for (const filename of ["consolidateAdjacent00"]) {
      const stringData = fs.readFileSync(`${consolidateAdjacentPath}${filename}.imjs`, "utf8");
      if (stringData) {
        const jsonData = JSON.parse(stringData);
        const fragments = resolveToArray(IModelJson.Reader.parse(jsonData));
        if (Array.isArray(fragments)) {
          for (const g of fragments) {
            let g1 = g;
            if (g instanceof CurvePrimitive)
              g1 = Path.create(g);
            if (g1 instanceof CurveCollection) {
              const range = g.range();
              const dx = 2.0 * range.xLength();
              const dy = 1.1 * range.yLength();
              const lengthA = g1.sumLengths();
              GeometryCoreTestIO.captureCloneGeometry(allGeometry, g1, x0, y0);
              RegionOps.consolidateAdjacentPrimitives(g1);
              const lengthB = g1.sumLengths();
              ck.testCoordinate(lengthA, lengthB, "consolidateAdjacentPrimitives should not change length");
              GeometryCoreTestIO.captureCloneGeometry(allGeometry, g1, x0, y0 + dy);
              x0 += dx;
            }
          }
        }
      }
      GeometryCoreTestIO.saveGeometry(allGeometry, "ConsolidateAdjacent", filename);
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("Misc", () => {
    const ck = new Checker();
    const unitCircle = Arc3d.createUnitCircle();
    const loop0 = Loop.create(unitCircle);
    const loop1 = Loop.create(unitCircle.clonePartialCurve(0, 0.25)!, unitCircle.clonePartialCurve(0.25, 1.0)!);

    RegionOps.consolidateAdjacentPrimitives(loop0);
    RegionOps.consolidateAdjacentPrimitives(loop1);
    ck.testExactNumber(1, loop0.children.length);
    ck.testExactNumber(1, loop1.children.length);

    const arc1 = Arc3d.createCircularStartMiddleEnd(Point3d.create(0, 0, 0), Point3d.create(1, 1, 0), Point3d.create(0, 2, 0))!;
    const arc2 = Arc3d.createCircularStartMiddleEnd(arc1.endPoint(), Point3d.create(1, 3, 0), Point3d.create(2, 2, 0))!;
    const arcArcPath = Path.create(arc1, arc2);
    RegionOps.consolidateAdjacentPrimitives(arcArcPath);
    ck.testExactNumber(2, arcArcPath.children.length, " arcs with cusp are not consolidated");

    const zero = Point3d.create(0, 0, 0);
    const singlePointPathA = Path.create(LineString3d.createPoints([zero, zero, zero]));
    RegionOps.consolidateAdjacentPrimitives(singlePointPathA);
    ck.testExactNumber(1, singlePointPathA.children.length, "Single point path consolidates to stub");
    singlePointPathA.tryAddChild(LineSegment3d.create(zero, zero));
    RegionOps.consolidateAdjacentPrimitives(singlePointPathA);

    ck.testExactNumber(1, singlePointPathA.children.length, "Single point path consolidates to stub");
    const singlePointPathB = Path.create(LineString3d.create(Point3d.create(1, 1, 2)));
    RegionOps.consolidateAdjacentPrimitives(singlePointPathB);
    ck.testExactNumber(1, singlePointPathB.children.length, "Single point path consolidates to stub");
    expect(ck.getNumErrors()).equals(0);
  });
  it("ClosestPointInCollection", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const loops = Sample.createSimpleLoops();
    const paths = Sample.createSimplePaths();
    const parityRegions = Sample.createSimpleParityRegions();
    const collection = BagOfCurves.create();
    let x0 = 0;
    const tolerance = 1.0e-8;
    const localPoints: Point3d[] = [];
    for (const x of [-0.2, 0.3, 0.8, 1.1]) {
      for (const y of [-0.4, 0.45, 1.2])
        localPoints.push(Point3d.create(x, y));
    }
    for (const c of [...loops, ...paths, ...parityRegions]) {
      const range = c.range();
      collection.tryAddChild(c);
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, c, x0, 0, 0);
      for (const xyzLocal of localPoints) {
        const xyz = range.localToWorld(xyzLocal)!;
        const detail = c.closestPoint(xyz);
        GeometryCoreTestIO.createAndCaptureXYCircle(allGeometry, xyz, 0.2, x0, 0, 0);
        if (ck.testType(detail, CurveLocationDetail) && detail) {
          GeometryCoreTestIO.captureCloneGeometry(allGeometry, [xyz, detail.point], x0, 0, 0);
          // verify that the close point is closer than a small test set on its own primitive.
          //  (This does not confirm that the correct primitive was chosen)
          if (ck.testDefined(detail.curve)) {
            for (const f of [0.0, 0.153, 0.389, 0.82342, 1.0]) {
              const xyzF = detail.curve!.fractionToPoint(f);
              ck.testLE(detail.a, xyz.distance(xyzF) + tolerance);
            }
          }
        }
      }
      x0 += 2.0 * range.xLength();
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "CurveCollection", "ClosestPoint");
    expect(ck.getNumErrors()).equals(0);
  });

});
/**
 * Capture markers at shiftFraction and (1-shiftFraction) on each primitive of curves.
 * @param allGeometry
 * @param curves
 * @param markerSize
 * @param shiftFraction
 * @param x0
 * @param y0
 */
function markLimits(allGeometry: GeometryQuery[], primitives: CurvePrimitive[], shiftFraction: number, markerSize0: number, markerSize1: number, x0: number, y0: number) {
  for (const p of primitives) {
    GeometryCoreTestIO.createAndCaptureXYCircle(allGeometry, p.fractionToPoint(shiftFraction), markerSize0, x0, y0);
    GeometryCoreTestIO.createAndCaptureXYCircle(allGeometry, p.fractionToPoint(1.0 - shiftFraction), markerSize1, x0, y0);
  }
}
