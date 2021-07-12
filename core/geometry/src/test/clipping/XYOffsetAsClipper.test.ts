/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as fs from "fs";

import { Checker } from "../Checker";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { Range3d } from "../../geometry3d/Range";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";
import { LineString3d } from "../../curve/LineString3d";
import { UnionOfConvexClipPlaneSets } from "../../clipping/UnionOfConvexClipPlaneSets";
import { ClipUtilities } from "../../clipping/ClipUtils";
import { GrowableXYZArray } from "../../geometry3d/GrowableXYZArray";
import { IModelJson } from "../../serialization/IModelJsonSchema";
import { CurveChain, CurveCollection } from "../../curve/CurveCollection";
import { PolyfaceQuery } from "../../polyface/PolyfaceQuery";
import { IndexedPolyface } from "../../polyface/Polyface";
import { Angle } from "../../geometry3d/Angle";
import { OffsetHelpers } from "../../curve/internalContexts/MultiChainCollector";
import { RegionOps } from "../../curve/RegionOps";
import { Path } from "../../curve/Path";
import { ClippedPolyfaceBuilders, PolyfaceClip } from "../../polyface/PolyfaceClip";

describe("OffsetByClip", () => {
  it("LongLineString", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const range = Range3d.createXYZXYZ(-1, -1, -1, 6, 6, 1);

    const pointsA = [Point3d.create(0, 2), Point3d.create(0, 0, 0), Point3d.create(1, 0), Point3d.create(2, 1), Point3d.create(3, 3)];
    pointsA.push(Point3d.create(5, 3));
    pointsA.push(Point3d.create(5, 0));
    pointsA.push(Point3d.create(4, 2));
    pointsA.push(Point3d.create(4, 0));
    pointsA.push(Point3d.create(4, -0.5));
    pointsA.push(Point3d.create(3, -0.5));
    pointsA.push(Point3d.create(3, 0));
    pointsA.push(Point3d.create(2, -0.5));
    const pointsC = [Point3d.create(0, 0), Point3d.create(4, 0)];
    const pointsB = [];
    pointsB.push(Point3d.create(-53.94490516785141, 46.9407384215234, -3.8955028593080985));
    pointsB.push(Point3d.create(-53.94490516785141, 6.495277504543655, -3.8955028593080985));
    pointsB.push(Point3d.create(-53.94490516785141, -37.759261578476604, -3.8955028593080985));
    pointsB.push(Point3d.create(7.83254294135434, -37.759261578476604, -3.8955028593080985));
    pointsB.push(Point3d.create(75.4280760324446, -37.759261578476604, -3.8955028593080985));
    pointsB.push(Point3d.create(75.4280760324446, 2.6861993385031404, -3.8955028593080985));
    pointsB.push(Point3d.create(75.4280760324446, 46.9407384215234, -3.8955028593080985));
    pointsB.push(Point3d.create(13.650627923238844, 46.9407384215234, -3.8955028593080985));
    pointsB.push(Point3d.create(-53.94490516785141, 46.9407384215234, -3.8955028593080985));

    let y00 = 0.0;
    for (const points of [pointsC, pointsB, pointsA]) {
      let x0 = 0.0;
      for (const leftSign of [1, 0.25, 0, -0.50, -2.0]) {
        let y0 = y00;
        for (const rightOffset of [0.2, 0.3, 0.4, 0.8, -0.2]) {
          GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(points), x0, y0);
          const offsetClipper = ClipUtilities.createXYOffsetClipFromLineString(points, leftSign * rightOffset, rightOffset, -0.1, -0.02);
          if (ck.testType(offsetClipper, UnionOfConvexClipPlaneSets)) {
            for (const c of offsetClipper.convexSets) {
              ClipUtilities.announceLoopsOfConvexClipPlaneSetIntersectRange(c, range,
                (loopPoints: GrowableXYZArray) => {
                  GeometryCoreTestIO.createAndCaptureLoop(allGeometry, loopPoints, x0, y0);
                });
            }
          }
          y0 += 10.0;
        }
        x0 += 15.0;
      }
      y00 += 60.0;
    }
    expect(ck.getNumErrors()).equals(0);
    GeometryCoreTestIO.saveGeometry(allGeometry, "OffsetByClip", "LongLineString");
  });

  it("LongLineStringB", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const range = Range3d.createXYZXYZ(-100, -100, -10, 100, 100, 10);
    const pointsB = [];
    pointsB.push(Point3d.create(-53.94490516785141, 46.9407384215234, -3.8955028593080985));
    pointsB.push(Point3d.create(-53.94490516785141, 6.495277504543655, -3.8955028593080985));
    pointsB.push(Point3d.create(-53.94490516785141, -37.759261578476604, -3.8955028593080985));
    pointsB.push(Point3d.create(7.83254294135434, -37.759261578476604, -3.8955028593080985));
    pointsB.push(Point3d.create(75.4280760324446, -37.759261578476604, -3.8955028593080985));
    pointsB.push(Point3d.create(75.4280760324446, 2.6861993385031404, -3.8955028593080985));
    pointsB.push(Point3d.create(75.4280760324446, 46.9407384215234, -3.8955028593080985));
    pointsB.push(Point3d.create(13.650627923238844, 46.9407384215234, -3.8955028593080985));
    pointsB.push(Point3d.create(-53.94490516785141, 46.9407384215234, -3.8955028593080985));
    // make another one with no midpoints.
    const pointsA = [];
    pointsA.push(pointsB[0]);
    pointsA.push(pointsB[2]);
    pointsA.push(pointsB[4]);
    pointsA.push(pointsB[6]);
    pointsA.push(pointsB[8]);

    const pointsC = [];
    pointsC.push(pointsB[0]);
    pointsC.push(pointsB[2]);
    pointsC.push(pointsB[4]);
    let y00 = 0.0;
    for (const points of [pointsC, pointsA, pointsB]) {
      let x0 = 0.0;
      let y0 = y00;
      for (const leftOffset of [10]) {
        GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(points), x0, y0);
        const offsetClipper = ClipUtilities.createXYOffsetClipFromLineString(points, leftOffset, 0, -9999, 9999);
        if (ck.testType(offsetClipper, UnionOfConvexClipPlaneSets)) {
          for (const c of offsetClipper.convexSets) {
            ClipUtilities.announceLoopsOfConvexClipPlaneSetIntersectRange(c, range,
              (loopPoints: GrowableXYZArray) => {
                GeometryCoreTestIO.createAndCaptureLoop(allGeometry, loopPoints, x0, y0);
              });
          }
          y0 += 30.0;
        }
        x0 += 200.0;
      }
      y00 += 100.0;
    }

    const zClipper = ClipUtilities.createXYOffsetClipFromLineString([], 1, 1, -1, -1);
    ck.testExactNumber(1, zClipper.convexSets.length);

    expect(ck.getNumErrors()).equals(0);
    GeometryCoreTestIO.saveGeometry(allGeometry, "OffsetByClip", "LongLineStringB");
  });

  it("Coverage", () => {
  });

  it("DiegoProblemCases", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const shape1 = IModelJson.Reader.parse(JSON.parse(fs.readFileSync(
      "./src/test/testInputs/clipping/DiegoTrickyBuilding/case1.imjs", "utf8"))) as CurveCollection;
    const shape2 = IModelJson.Reader.parse(JSON.parse(fs.readFileSync(
      "./src/test/testInputs/clipping/DiegoTrickyBuilding/case2.imjs", "utf8"))) as CurveCollection;
    //    const shape3 = IModelJson.Reader.parse(JSON.parse(fs.readFileSync(
    //       "./src/test/testInputs/clipping/DiegoTrickyBuilding/case3.imjs", "utf8"))) as CurveCollection;
    let x00 = 0;
    const y00 = 0;
    const z00 = 0;
    const zShape = 0.1;
    const offsetDistance = 3.0;
    for (const shape of [shape1, shape2]) {
      const range = shape.range();
      const x0 = x00 - range.low.x;
      const y0 = y00 - range.low.y;
      const z0 = z00 - range.low.z;
      const clipRange = range.clone();
      clipRange.expandInPlace(offsetDistance);
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, shape, x0, y0, z0 + zShape);
      if (shape instanceof CurveChain) {
        const points = shape.getPackedStrokes()!;
        const offsetClipper = ClipUtilities.createXYOffsetClipFromLineString(points, offsetDistance, offsetDistance, range.low.z - 0.1, range.low.z - 0.02);
        if (ck.testType(offsetClipper, UnionOfConvexClipPlaneSets)) {
          for (const c of offsetClipper.convexSets) {
            ClipUtilities.announceLoopsOfConvexClipPlaneSetIntersectRange(c, clipRange,
              (loopPoints: GrowableXYZArray) => {
                GeometryCoreTestIO.createAndCaptureLoop(allGeometry, loopPoints, x0, y0, z0);
              });
          }
        }
        x00 += range.xLength() * 2;
      }
    }
    expect(ck.getNumErrors()).equals(0);
    GeometryCoreTestIO.saveGeometry(allGeometry, "OffsetByClip", "DiegoProblemCases");
  });
// cspell:word arnoldas
  it("ArnoldasLaneClip", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const fullRoadMesh = IModelJson.Reader.parse(JSON.parse(fs.readFileSync(
      "./src/test/testInputs/clipping/arnoldasLaneClipper/fullRoadMesh.imjs", "utf8")));
    // const largeClipRegion = IModelJson.Reader.parse(JSON.parse(fs.readFileSync(
    //   "./src/test/testInputs/clipping/arnoldasLaneClipper/largeClipRegion.imjs", "utf8")));
    if (fullRoadMesh instanceof IndexedPolyface) {
      const meshRange = fullRoadMesh.range();
      const x0 = -meshRange.low.x;
      const y0 = -meshRange.low.y;
      const dx = meshRange.xLength();
      // Extract the boundary of the upward facing mesh ..
      const boundary = PolyfaceQuery.boundaryOfVisibleSubset(fullRoadMesh, 0, Vector3d.unitZ(), Angle.createDegrees(2.0));
      if (boundary){
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, fullRoadMesh, x0, y0);
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, boundary, x0, y0);
        const chainsA = OffsetHelpers.collectChains([boundary], 1.0e-6);
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, chainsA, x0 + dx, y0);
        // ugh .. we know it's a closed Loop.   collectChains is fuzzy in its return type ..
        if (chainsA instanceof Path) {
          RegionOps.consolidateAdjacentPrimitives(chainsA);
          GeometryCoreTestIO.captureCloneGeometry(allGeometry, chainsA, x0 + 2 * dx, y0);
          // Look for the contiguous "right side" -- segments with both components going to first quadrant.
          const rightSideChains: LineString3d[] = [];
          for (const primitive of chainsA.children) {
            if (primitive instanceof LineString3d)
              filterSegments(primitive,
                (pointA: Point3d, pointB: Point3d) => { return pointB.x - pointA.x >= 0.0 && pointB.y - pointA.y >= 0.0; },
                (ls: LineString3d) => rightSideChains.push(ls));
          }
          // we expect only one right side chain ..
          for (const ls of rightSideChains) {
            const clipper = ClipUtilities.createXYOffsetClipFromLineString(ls.packedPoints, 1.0, 0.0, meshRange.low.z - 1, meshRange.high.z + 1);
            const builders = ClippedPolyfaceBuilders.create(true, true, true);
            // first method: clip the whole polyface at once ....
            PolyfaceClip.clipPolyfaceUnionOfConvexClipPlaneSetsToBuilders(fullRoadMesh, clipper, builders);
            const clipA = builders.builderA?.claimPolyface();
            const clipB = builders.builderB?.claimPolyface();
            GeometryCoreTestIO.captureCloneGeometry(allGeometry, clipA, x0 + 3 * dx, y0);
            GeometryCoreTestIO.captureCloneGeometry(allGeometry, clipB, x0 + 2.8 * dx, y0);
            const num0 = fullRoadMesh.facetCount;
            if (ck.testDefined(clipA) && clipA
              && ck.testDefined(clipB) && clipB) {
              // hard to say what the output "should" be ... be test that counts are similar . .
              // (The motivation for this problem was that there were many, many unnecessary interior edges)
              const numA = clipA.facetCount;
              const numB = clipB.facetCount;
              ck.testLE(numA, 4.5 * num0);
              ck.testLE(numB, 4.5 * num0);
              ck.testLE(num0, 2 * numA);
              ck.testLE(num0, 2 * numB);
            }
            // second method clip the polyface one facet at a time.
            // This indeed produces full facets !!!!
            const visitor = fullRoadMesh.createVisitor();
            for (; visitor.moveToNextFacet();){
              const clipResult: GrowableXYZArray[] = [];
              clipper.polygonClip(visitor.point.getPoint3dArray(), clipResult);
              for (const q of clipResult){
                GeometryCoreTestIO.captureCloneGeometry(allGeometry, q, x0 + 4.0 * dx, y0);
              }
            }
          }
        }
      }
    }

    expect(ck.getNumErrors()).equals(0);
    GeometryCoreTestIO.saveGeometry(allGeometry, "OffsetByClip", "ArnoldasLaneClip");
  });
});

// Pass each segment to a test function.
// Collect sequences of accepted segments into linestrings.
function filterSegments(linestring: LineString3d,
  segmentTestFunction: (pointA: Point3d, pointB: Point3d) => boolean,
linestringAcceptFunction: (ls: LineString3d) => void): void{
  const pointA = Point3d.create();
  const pointB = Point3d.create();
  let currentLineString: LineString3d | undefined;
  for (let i = 0; i + 1 < linestring.packedPoints.length; i++){
    linestring.packedPoints.getPoint3dAtCheckedPointIndex(i, pointA);
    linestring.packedPoints.getPoint3dAtCheckedPointIndex(i + 1, pointB);
    if (segmentTestFunction(pointA, pointB)) {
      if (!currentLineString) {
        currentLineString = LineString3d.create();
        currentLineString.addPoint(pointA);
      }
      currentLineString.addPoint(pointB);
    } else {
      if (currentLineString) {
        linestringAcceptFunction(currentLineString);
        currentLineString = undefined;
      }
    }
  }
  if (currentLineString)
    linestringAcceptFunction(currentLineString);
}
