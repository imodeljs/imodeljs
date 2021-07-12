/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Loop } from "../../curve/Loop";
import { StrokeOptions } from "../../curve/StrokeOptions";
import { Geometry } from "../../Geometry";
import { Angle } from "../../geometry3d/Angle";
import { AngleSweep } from "../../geometry3d/AngleSweep";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { PolygonOps } from "../../geometry3d/PolygonOps";
import { Range3d } from "../../geometry3d/Range";
import { Transform } from "../../geometry3d/Transform";
import { PolyfaceBuilder } from "../../polyface/PolyfaceBuilder";
import { Sample } from "../../serialization/GeometrySamples";
import { IModelJson } from "../../serialization/IModelJsonSchema";
import { SweepContour } from "../../solid/SweepContour";
import { HalfEdgeGraph, HalfEdgeMask } from "../../topology/Graph";
import { HalfEdgeGraphSearch } from "../../topology/HalfEdgeGraphSearch";
import { HalfEdgeGraphMerge, HalfEdgeGraphOps } from "../../topology/Merging";
import { Triangulator } from "../../topology/Triangulation";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";
import { prettyPrint } from "../testFunctions";
import { GraphChecker } from "./Graph.test";

function rotateArray(data: Point3d[], index0: number) {
  const out = [];
  for (let i = 0; i < data.length; i++) out.push(data[(index0 + i) % data.length].clone());
  return out;
}

/* eslint-disable no-console */
describe("Triangulation", () => {
  it("NullTriangulations", () => {
    const ck = new Checker();
    ck.testUndefined(Triangulator.createTriangulatedGraphFromPoints([Point3d.create(0, 0, 0)]));
    ck.testUndefined(Triangulator.createTriangulatedGraphFromLoops([]));

    expect(ck.getNumErrors()).equals(0);
  });
  it("TriangulateLoops", () => {
    const ck = new Checker();
    let yShift = 0;
    const dx = 40.0;
    const dy = 30.0;
    const allGeometry: GeometryQuery[] = [];
    for (const myLoops of [
      [[Point3d.create(1, -1, 0), Point3d.create(2, -1, 0), Point3d.create(2, 1, 0)]],
      // outer
      [[Point3d.create(0, 0, 0), Point3d.create(3, -2, 0), Point3d.create(6, 2, 0), Point3d.create(5, 5, 0), Point3d.create(4, 2, 0), Point3d.create(1, 3, 0)],
      // hole
      [Point3d.create(1, 1, 0), Point3d.create(2, 2, 0), Point3d.create(3, 1, 0)]],
      // triangle with one hole
      [[Point3d.create(0, 0, 0), Point3d.create(5, -5, 0), Point3d.create(5, 5, 0)],
      [Point3d.create(2, 1, 0), Point3d.create(3, 1, 0), Point3d.create(3, 0, 0)]],
      // triangle with one hole, CCW orientation on the hole (expect it to be corrected)
      [[Point3d.create(0, 0, 0), Point3d.create(5, -5, 0), Point3d.create(5, 5, 0)],
      [Point3d.create(2, 1, 0), Point3d.create(3, 0, 0), Point3d.create(3, 1, 0)]],
      // rectangle with 2 holes
      [[Point3d.create(0, 0, 0), Point3d.create(5, 0, 0), Point3d.create(5, 5, 0), Point3d.create(0, 5, 0)],
      [Point3d.create(1, 1, 0), Point3d.create(2, 2, 0), Point3d.create(2, 1, 0)],
      [Point3d.create(3, 1.5, 0), Point3d.create(4, 3, 0), Point3d.create(4, 1.5, 0)]],
      // rectangle with 2 holes, duplicate points here and there
      [[Point3d.create(0, 0, 0), Point3d.create(5, 0, 0), Point3d.create(5, 0, 0), Point3d.create(5, 5, 0), Point3d.create(0, 5, 0)],
      [Point3d.create(1, 1, 0), Point3d.create(2, 2, 0), Point3d.create(2, 1, 0), Point3d.create(2, 1, 0)],
      [Point3d.create(3, 1.5, 0), Point3d.create(4, 3, 0), Point3d.create(4, 1.5, 0), Point3d.create(3, 1.5, 0)]],
      Sample.createStarsInStars(11, 8, 5, 2, 1, 4, 3, 3, false),
      Sample.createStarsInStars(10, 10, 2, 2, 2, 4, 3, 3, false),
      Sample.createStarsInStars(14, 8, 6, 2, 0.4, 5, 3, 4, false)]) {

      let xShift = 0;
      for (const loop of myLoops) {
        const g = LineString3d.create(loop);
        GeometryCoreTestIO.captureGeometry(allGeometry, g, xShift, yShift);
      }
      xShift += dx;
      // triangulate and flip in the outer loop only . . .
      const graph1 = Triangulator.createTriangulatedGraphFromSingleLoop(myLoops[0]);
      if (graph1) {
        const unflippedOuter = PolyfaceBuilder.graphToPolyface(graph1);
        unflippedOuter.tryTranslateInPlace(xShift, yShift, 0);
        allGeometry.push(unflippedOuter);
        xShift += dx;

        Triangulator.flipTriangles(graph1);
        const flippedOuter = PolyfaceBuilder.graphToPolyface(graph1);
        flippedOuter.tryTranslateInPlace(xShift, yShift, 0);
        allGeometry.push(flippedOuter);
        xShift += 2 * dx;
      } else
        xShift += 3 * dx;
      // triangulate with the hole
      const graph2 = Triangulator.createTriangulatedGraphFromLoops(myLoops)!;
      if (graph2) {
        const unflipped2 = PolyfaceBuilder.graphToPolyface(graph2);
        unflipped2.tryTranslateInPlace(xShift, yShift, 0);
        allGeometry.push(unflipped2);
        xShift += dx;

        Triangulator.flipTriangles(graph2);
        const flipped2 = PolyfaceBuilder.graphToPolyface(graph2);
        flipped2.tryTranslateInPlace(xShift, yShift, 0);
        allGeometry.push(flipped2);
        xShift += dx;
      } else
        xShift += 3 * dx;

      yShift += dy;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "Graph", "TriangulateAndFlip");
    ck.checkpoint("TriangulateAndFlip");
    expect(ck.getNumErrors()).equals(0);
  });

  it("TriangulateBadLoops", () => {
    const ck = new Checker();

    let yShift = 0;
    const dx = 40.0;
    const dy = 30.0;
    const allGeometry: GeometryQuery[] = [];
    for (const myLoops of [
      // rectangle with hole not fully contained
      [[Point3d.create(0, 0, 0), Point3d.create(5, 0, 0), Point3d.create(5, 5, 0), Point3d.create(0, 5, 0)],
      [Point3d.create(1, -1, 0), Point3d.create(2, -1, 0), Point3d.create(2, 1, 0)]],
      // Edge-Edge contact from hole to parent along lower edge.
      [[Point3d.create(0, 0, 0), Point3d.create(4, 0, 0), Point3d.create(8, 0, 0), Point3d.create(10, 0, 0), Point3d.create(10, 5, 0), Point3d.create(0, 5, 0)],
      [Point3d.create(4, 0, 0), Point3d.create(8, 0, 0), Point3d.create(8, 2, 0), Point3d.create(4, 2, 0)]],
      // Edge-Edge contact from hole to parent along right edge.
      [[Point3d.create(10, 0, 0), Point3d.create(10, 4), Point3d.create(10, 8), Point3d.create(10, 10, 0), Point3d.create(0, 10, 0), Point3d.create(0, 0, 0)],
      [Point3d.create(10, 4), Point3d.create(10, 8), Point3d.create(6, 8)]],
    ]) {

      let xShift = 0;
      for (const loop of myLoops) {
        const g = LineString3d.create(loop);
        GeometryCoreTestIO.captureGeometry(allGeometry, g, xShift, yShift);
      }
      xShift += dx;
      // triangulate with the hole
      const graph2 = Triangulator.createTriangulatedGraphFromLoops(myLoops)!;
      if (graph2) {
        const unflipped2 = PolyfaceBuilder.graphToPolyface(graph2);
        unflipped2.tryTranslateInPlace(xShift, yShift, 0);
        allGeometry.push(unflipped2);
        xShift += dx;

        Triangulator.flipTriangles(graph2);
        const flipped2 = PolyfaceBuilder.graphToPolyface(graph2);
        flipped2.tryTranslateInPlace(xShift, yShift, 0);
        allGeometry.push(flipped2);
        xShift += dx;
      } else
        xShift += 3 * dx;

      yShift += dy;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "Graph", "TriangulateBadLoops");
    ck.checkpoint("TriangulateAndFlip");
    expect(ck.getNumErrors()).equals(0);
  });

  it("SquareWaves", () => {
    const ck = new Checker();
    let degreeCount = 0;
    const allGeometry: GeometryQuery[] = [];
    let x0 = 0;
    for (const degrees of [0, 10, 30, 95, -20]) {
      let y0 = 0.0;
      for (const numPhase of [1, 3, 7, 15]) {
        const name = `SquareWave ${degreeCount}.${numPhase}`;
        degreeCount++;
        const pointA = Point3d.create(1.5 * numPhase, 0, 0);
        const yShiftVector = Vector3d.create(0, 2, 0);
        const rotation = Transform.createFixedPointAndMatrix(
          Point3d.create(1.5 * numPhase, 0, 0),
          Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createDegrees(degrees)) as Matrix3d);
        const points = Sample.createSquareWave(Point3d.create(0, 0, 0), 1, 0.5, 2, numPhase, 1);
        rotation.multiplyVector(yShiftVector, yShiftVector);
        if (degrees !== 0.0)
          rotation.multiplyPoint3dArrayInPlace(points);
        if (Checker.noisy.squareWaves)
          console.log(name, "Rotation angle ", degrees, " numPhase", numPhase);
        const graph = Triangulator.createTriangulatedGraphFromSingleLoop(points);
        if (ck.testType(graph, HalfEdgeGraph)) {
          const pfA = PolyfaceBuilder.graphToPolyface(graph);
          Triangulator.flipTriangles(graph);

          GraphChecker.verifyMaskAroundFaces(ck, graph, HalfEdgeMask.EXTERIOR);
          const pfB = PolyfaceBuilder.graphToPolyface(graph);
          // const pfC = PolyfaceBuilder.graphToPolyface(graph);
          const ls = LineString3d.create(points);
          const ls1 = LineString3d.create(Point3d.create(), pointA);
          ls.tryTranslateInPlace(x0, y0);
          pfA.tryTranslateInPlace(x0 + yShiftVector.x, y0 + yShiftVector.y, 0);
          pfB.tryTranslateInPlace(x0 + 2 * yShiftVector.x, y0 + 2 * yShiftVector.y, 0);
          // pfC.tryTranslateInPlace(x0 + 4 * yShiftVector.x, y0 + 4 * yShiftVector.y, 0);

          ls1.tryTranslateInPlace(x0, y0);
          GeometryCoreTestIO.captureGeometry(allGeometry, [ls1, ls, pfA, pfB], x0, y0);
        }
        y0 += 3 + 4 * numPhase;
      }
      x0 += 100.0;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "Triangulation", "SquareWaves");
    expect(ck.getNumErrors()).equals(0);
  });
});

function testGraphFromSegments(ck: Checker, x0: number, segments: LineSegment3d[], expectSingleLoop: boolean, fileName: string, outputAnnotatedGeometry: boolean = true) {
  const theGraph = HalfEdgeGraphMerge.formGraphFromSegments(segments);
  GraphChecker.verifySignedFaceCounts(ck, theGraph, undefined, 1, undefined);
  const dx = x0;
  const yStep = 25;
  let dy = -yStep;
  const allGeometry: GeometryQuery[] = [];
  GeometryCoreTestIO.captureGeometry(allGeometry, segments, dx, dy += yStep);
  if (outputAnnotatedGeometry)
    GraphChecker.captureAnnotatedGraph(allGeometry, theGraph, dx, dy += yStep);
  if (expectSingleLoop)
    GraphChecker.verifyGraphCounts(ck, theGraph, true, 2, undefined, undefined);
  HalfEdgeGraphOps.formMonotoneFaces(theGraph);
  GraphChecker.verifySignedFaceCounts(ck, theGraph, undefined, 1, undefined);
  GeometryCoreTestIO.captureGeometry(allGeometry, PolyfaceBuilder.graphToPolyface(theGraph), dx, dy += yStep);
  if (outputAnnotatedGeometry)
    GraphChecker.captureAnnotatedGraph(allGeometry, theGraph, dx, dy += yStep);

  // console.log("Total Faces: ", theGraph.collectFaceLoops().length);
  // for (const face of faces) {
  //   Triangulator.earcutFromSingleFaceLoop(face);
  // }
  // exportGraph(theGraph, "AfterTriangulation");
  GeometryCoreTestIO.saveGeometry(allGeometry, "Graph", fileName);

}
describe("MonotoneFaces", () => {
  // 5 sides -- tall rectangle with upward V at bottom edge.

  // somewhat nasty polygon ....
  const loopB: LineSegment3d[] = [
    LineSegment3d.create(Point3d.create(0, 20), Point3d.create(0, 0)),
    LineSegment3d.create(Point3d.create(0, 0), Point3d.create(3, 3)),
    LineSegment3d.create(Point3d.create(3, 3), Point3d.create(6, 0)),
    LineSegment3d.create(Point3d.create(6, 0), Point3d.create(6, 8)),
    LineSegment3d.create(Point3d.create(6, 8), Point3d.create(9, 5)),
    LineSegment3d.create(Point3d.create(9, 5), Point3d.create(10, 2)),
    LineSegment3d.create(Point3d.create(10, 2), Point3d.create(12, 7)),
    LineSegment3d.create(Point3d.create(12, 7), Point3d.create(14, 5)),
    LineSegment3d.create(Point3d.create(14, 5), Point3d.create(18, 15)),
    LineSegment3d.create(Point3d.create(18, 15), Point3d.create(16, 17)),
    LineSegment3d.create(Point3d.create(16, 17), Point3d.create(16.5, 20)),
    LineSegment3d.create(Point3d.create(16.5, 20), Point3d.create(14, 18)),
    LineSegment3d.create(Point3d.create(14, 18), Point3d.create(15, 22)),
    LineSegment3d.create(Point3d.create(15, 22), Point3d.create(12, 21)),
    LineSegment3d.create(Point3d.create(12, 21), Point3d.create(10, 20)),
    LineSegment3d.create(Point3d.create(10, 20), Point3d.create(9, 17)),
    LineSegment3d.create(Point3d.create(9, 17), Point3d.create(6, 15)),
    LineSegment3d.create(Point3d.create(6, 15), Point3d.create(0, 20)),
  ];

  it("loopA", () => {
    const ck = new Checker();
    let id = 0;
    const ax = 5.0;
    const ay = 10.0;
    // const e = 0.1;
    for (const loopA of [
      Sample.creatVerticalStaggerPolygon(-1, -2, 4, 3, ax, ay, 0, 0),
      Sample.creatVerticalStaggerPolygon(3, 0, 0, 4, ax, ay, 0, 0),
      // Sample.creatVerticalStaggerPolygon(3, e, e, 3, ax, ay, 0, 0),
      // Sample.creatVerticalStaggerPolygon(3, 0, 0, 3, ax, ay, 0, 0),
      // Sample.creatVerticalStaggerPolygon(-3, 2, 1, 2, ax, ay, 0, 0),
      // Sample.creatVerticalStaggerPolygon(3, 0, 0, 3, ax, ay, 0, 0),
      // Sample.creatVerticalStaggerPolygon(3, 0, 0, -3, ax, ay, 0, 0),
      // Sample.creatVerticalStaggerPolygon(3, 0, 0, -5, ax, ay, -1, 0),
      // Sample.creatVerticalStaggerPolygon(7, 0, 0, -6, ax, ay, -0.5, 0),
    ]) {
      const segmentA = Sample.convertPointsToSegments(loopA);
      testGraphFromSegments(ck, id * 30, segmentA, true, `LoopA${id++}`, false);
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("loopB", () => {
    const ck = new Checker();
    testGraphFromSegments(ck, 0, loopB, true, "LoopB");
    expect(ck.getNumErrors()).equals(0);
  });

  it("HashMerge", () => {
    const ck = new Checker();
    const a = 1.0;
    const b = 2.0;
    const allGeometry: GeometryQuery[] = [];
    let dx = 0.0;
    let dy = 0.0;
    for (const numLine of [2]) {
      const lines = [];
      const xMin = 0;
      const xMax = (numLine + 1) * a;
      const yMin = 0;
      const yMax = (numLine + 1) * b;
      const yStep = yMax + b;
      // horizontal lines ...
      for (let i = 1; i <= numLine; i++) {
        lines.push(LineSegment3d.createXYXY(xMin, i * b, xMax, i * b));
      }
      // vertical lines
      for (let i = 1; i <= numLine; i++) {
        lines.push(LineSegment3d.createXYXY(i * a, yMin, i * a, yMax));
      }
      const theGraph = HalfEdgeGraphMerge.formGraphFromSegments(lines);

      GeometryCoreTestIO.captureGeometry(allGeometry, lines, dx, dy);
      dy += yStep;

      GraphChecker.captureAnnotatedGraph(allGeometry, theGraph, dx, dy);
      dy += yStep;

      const numFace = (numLine - 1) * (numLine - 2);
      GraphChecker.verifyGraphCounts(ck, theGraph, true, numFace, (numLine + 2) * (numLine + 2) - 4, a * b * numFace);

      HalfEdgeGraphOps.formMonotoneFaces(theGraph);
      GraphChecker.captureAnnotatedGraph(allGeometry, theGraph, dx, dy);
      dy += yStep;
      // console.log("Total Faces: ", theGraph.collectFaceLoops().length);
      // for (const face of faces) {
      //   Triangulator.earcutFromSingleFaceLoop(face);
      // }
      // exportGraph(theGraph, "AfterTriangulation");
      dx += a * (numLine + 4);
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "Graph", "HashMerge");
    expect(ck.getNumErrors()).equals(0);
  });

});

describe("Triangulation", () => {
  it("TriangulateFractals", () => {
    const baseVectorA = Vector3d.create(0, 0, 0);
    const allGeometry = [];
    // REMARK
    // EDL Feb 20 2019
    // Triangulation introduces a search z heap (not understood by me at this time) for very large polygons.
    // With original trigger of 80 edges, some invalid triangulations occur for numRecursion = 2 (the original limit)
    // Raise the trigger to 200 and all is fine.
    // But the statement coverage drops significantly -- 94% to 93.37
    // numRecursion = 3 generates larger polygons (around 400) and again there are some failures.
    // so we conclude the z heap is large chunk of code with some bugs.
    // This is an unlikely use case at this time.  So
    //   1) the heap trigger is left at 200 (see Triangulation.ts)
    //   2) add a method `Triangulation.setAndReturnHeapTrigger (number): number`
    // Someday debug that ....
    for (const numRecursion of [1, 2, 3]) {
      for (const perpendicularFactor of [0.85, -1.0, -0.5]) {
        let yMax = 0.0;
        const baseVectorB = baseVectorA.clone();
        for (const generatorFunction of [
          Sample.createFractalSquareReversingPattern,
          Sample.createFractalDiamondConvexPattern,
          Sample.createFractalLReversingPattern,
          Sample.createFractalHatReversingPattern,
          Sample.createFractalLMildConcavePatter]) {
          for (const degrees of [0, 10, 79]) {
            const points = generatorFunction(numRecursion, perpendicularFactor);
            const transform0 = Transform.createFixedPointAndMatrix(points[0], Matrix3d.createRotationAroundAxisIndex(2, Angle.createDegrees(degrees)));
            transform0.multiplyPoint3dArrayInPlace(points);
            const range = Range3d.createArray(points);
            const dy = range.yLength();
            yMax = Math.max(yMax, dy);
            const transform = Transform.createTranslation(baseVectorB);
            transform.multiplyPoint3dArray(points, points);
            baseVectorB.addInPlace(Vector3d.create(2 * range.xLength(), 0, 0));
            allGeometry.push(Loop.create(LineString3d.create(points)));
            const graph = Triangulator.createTriangulatedGraphFromSingleLoop(points);
            if (graph) {
              const pfA = PolyfaceBuilder.graphToPolyface(graph);
              pfA.tryTranslateInPlace(0, 2.0 * dy, 0);
              allGeometry.push(pfA);
              Triangulator.flipTriangles(graph);
              const pfB = PolyfaceBuilder.graphToPolyface(graph);
              pfB.tryTranslateInPlace(0, 4.0 * dy, 0);
              allGeometry.push(pfB);
            }
          }
          baseVectorA.addInPlace(Vector3d.create(0, 8.0 * yMax, 0));
        }
      }
      baseVectorA.x += 100;
      baseVectorA.y = 0.0;
    }

    GeometryCoreTestIO.saveGeometry(allGeometry, "Triangulation", "TriangulateFractals");
  });
  /* These cases had problems -- but maybe only due to bad input?
    it("ProblemTriangulation", () => {
      Triangulator.setAndReturnHeapTrigger(80);
      const baseVectorA = Vector3d.create(0, 0, 0);
      const allGeometry = [];
      for (let maxCut = 50; maxCut < 91; maxCut++) {
        const numRecursion = 2;
        const perpendicularFactor = 0.8;
        let yMax = 0.0;
        let xStep = 0.0;
        const baseVectorB = baseVectorA.clone();
        for (const generatorFunction of [
          Sample.createFractalLMildConcavePatter,
        ]) {
          const points = generatorFunction(numRecursion, perpendicularFactor);
          const range = Range3d.createArray(points);
          const dy = range.yLength();
          yMax = Math.max(yMax, dy);
          xStep += 2.0 * range.xLength();
          const transform = Transform.createTranslation(baseVectorB);
          transform.multiplyPoint3dArray(points, points);
          baseVectorB.addInPlace(Vector3d.create(2 * range.xLength(), 0, 0));
          allGeometry.push(Loop.create(LineString3d.create(points)));
          const graph = Triangulator.earcutSingleLoop(points);
          if (graph) {
            const pfA = PolyfaceBuilder.graphToPolyface(graph);
            pfA.tryTranslateInPlace(0, 2.0 * dy, 0);
            allGeometry.push(pfA);
            Triangulator.cleanupTriangulation(graph);
            const pfB = PolyfaceBuilder.graphToPolyface(graph);
            pfB.tryTranslateInPlace(0, 4.0 * dy, 0);
            allGeometry.push(pfB);
          }
        }
        baseVectorA.x += 2.0 * xStep;
      }
      Triangulator.setAndReturnHeapTrigger(undefined);
      GeometryCoreTestIO.saveGeometry(allGeometry, "Graph", "ProblemTriangulation");
    });
    it("ProblemTriangulationB", () => {
      Triangulator.setAndReturnHeapTrigger(5);

      const baseVectorA = Vector3d.create(0, 0, 0);
      const allGeometry = [];
      let yMax = 0.0;
      let xStep = 0.0;
      const basePoints = [
        Point3d.create(0.250, -0.100, 0.000),
        Point3d.create(0.750, -0.100, 0.000),
        Point3d.create(1.000, 1.000, 0.000),
        Point3d.create(1.350, 1.150, 0.000),
        Point3d.create(2.000, 2.000, 0.000),
        Point3d.create(2.100, 2.250, 0.000),
        Point3d.create(2.100, 2.750, 0.000)];
      for (const rotateIndex of [0, 1, 2, 3, 4, 5, 6]) {
        const points = rotateArray(basePoints, rotateIndex);
        const range = Range3d.createArray(points);
        const dy = range.yLength();
        yMax = Math.max(yMax, dy);
        xStep = 2.0 * range.xLength();
        const transform = Transform.createTranslation(baseVectorA);
        transform.multiplyPoint3dArray(points, points);
        allGeometry.push(Loop.create(LineString3d.create(points)));
        const graph = Triangulator.earcutSingleLoop(points);
        if (graph) {
          const pfA = PolyfaceBuilder.graphToPolyface(graph);
          pfA.tryTranslateInPlace(0, 2.0 * dy, 0);
          allGeometry.push(pfA);
          Triangulator.cleanupTriangulation(graph);
          const pfB = PolyfaceBuilder.graphToPolyface(graph);
          pfB.tryTranslateInPlace(0, 4.0 * dy, 0);
          allGeometry.push(pfB);
        }
        baseVectorA.x += xStep;
      }
      // get back to base heap trigger ...
      Triangulator.setAndReturnHeapTrigger(undefined);

      GeometryCoreTestIO.saveGeometry(allGeometry, "Graph", "ProblemTriangulationB");
    });
  */
  it("TriangulationWithColinearVertices", () => {
    const numTheta = 5;
    const numThetaSkip = 1;
    const allGeometry = [];
    const r = 1.0;
    let x0 = 0.0;
    const dy = 2.0;
    for (const numColinear of [1, 3, 7]) {
      const points = [Point3d.create(-r, 0, 0)];
      for (let i = 0; i <= numColinear; i++)
        points.push(Point3d.create(Geometry.interpolate(-r, i / numColinear, r), 0, 0));
      for (let i = 1; i < numTheta; i++) {
        const theta = Angle.createDegrees(i * 180 / numTheta);
        points.push(Point3d.create(r * theta.cos(), r * theta.sin(), 0));
      }
      // run the triangulator with the array rotated to each x-axis point, and one of every numThetaSkip points around the arc.
      let y0 = 0.0;
      for (let rotation = 0; rotation < points.length; rotation += (rotation < numColinear ? 1 : numThetaSkip)) {
        const pointsB = rotateArray(points, rotation);
        const graph = Triangulator.createTriangulatedGraphFromSingleLoop(pointsB);
        if (graph) {
          const pfA = PolyfaceBuilder.graphToPolyface(graph);
          pfA.tryTranslateInPlace(x0, y0 + 2.0 * dy, 0);
          allGeometry.push(pfA);
          Triangulator.flipTriangles(graph);
          const pfB = PolyfaceBuilder.graphToPolyface(graph);
          pfB.tryTranslateInPlace(x0, y0 + 4.0 * dy, 0);
          allGeometry.push(pfB);
          y0 += 10.0;
        }
      }
      x0 += 4.0;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "Triangulation", "TriangulationWithColinearVertices");
  });
  // public static createCutPie(x0: number, y0: number, radius: number, sweep: AngleSweep, numRadialEdges: number, numArcEdges: number, addClosure = false) {
  it("PieCuts", () => {
    const ck = new Checker();

    const numThetaSkip = 3;
    const allGeometry: GeometryQuery[] = [];
    const r = 1.0;
    let x0 = 0.0;
    // promise: all x above x0 is free space.
    for (const points of [
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(0, 180), 2, 2, false),
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(0, 180), 2, 3, false),
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(0, 180), 2, 4, false),
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(0, 180), 2, 6, false),
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(0, 180), 1, 4, false),
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(0, 180), 5, 12, false),
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(0, 180), 1, 4, false),
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(0, 90), 2, 5, false),
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(0, 180), 3, 9, false),
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(0, 90), 3, 4, false),
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(0, 180), 5, 12, false),
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(-10, 270), 2, 8, false),
      Sample.createCutPie(0, 0, r, AngleSweep.createStartEndDegrees(-30, 200), 5, 12, false),
      Sample.createCutPie(0, 0, 100 * r, AngleSweep.createStartEndDegrees(0, 180), 5, 12, false),
    ]) {
      // run the triangulator with the array rotated to each x-axis point, and one of every numThetaSkip points around the arc.
      let y0 = 0.0;
      const range = Range3d.createArray(points);
      const expectedTriangleCount = points.length - 2;   // we know that the point array is unclosed !!!
      const dx = range.xLength();
      const dy = range.yLength();
      const ex = x0 - range.low.x;
      const polygonArea = PolygonOps.areaXY(points);
      x0 += r;
      for (let rotation = 0; rotation < points.length; rotation += (rotation < 4 ? 1 : numThetaSkip)) {
        const pointsB = rotateArray(points, rotation);
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, pointsB, x0, y0);
        Triangulator.clearAndEnableDebugGraphCapture(true);
        const graph = Triangulator.createTriangulatedGraphFromSingleLoop(pointsB)!;
        if (ck.testDefined(graph, "unexpected empty graph from triangulation") && graph) {
          const faceSummary = HalfEdgeGraphSearch.collectFaceAreaSummary(graph, false);
          ck.testExactNumber(1, faceSummary.numNegative, "Exactly one outer loop after triangulation");
          ck.testExactNumber(0, faceSummary.numZero, " no slivers");
          ck.testExactNumber(expectedTriangleCount, faceSummary.numPositive, "triangle count");
          ck.testCoordinate(polygonArea, faceSummary.positiveSum, "positive area sum");
          const pfA = PolyfaceBuilder.graphToPolyface(graph);
          GeometryCoreTestIO.captureCloneGeometry(allGeometry, pfA, ex, y0 + 1.5 * dy, 0);
          Triangulator.flipTriangles(graph);
          const pfB = PolyfaceBuilder.graphToPolyface(graph);
          GeometryCoreTestIO.captureCloneGeometry(allGeometry, pfB, ex, y0 + 3.0 * dy, 0);
        } else {
          const badGraph = Triangulator.claimDebugGraph();
          GraphChecker.captureAnnotatedGraph(allGeometry, badGraph, ex, y0 + 2.0 * dy);
        }
        y0 += 8.0 * dy;
      }
      x0 += 2.0 * dx;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "Triangulation", "PieCuts");
    expect(ck.getNumErrors()).equals(0);
  });

  it("FacetsInCircle", () => {
    const ck = new Checker();
    const savedMeshes: GeometryQuery[] = [];
    let x0 = 0;
    for (const r of [1.0, 3.234242342]) {
      let y0 = 0;
      for (const n of [4, 7, 16, 19]) {
        const points = [];
        for (let i = 0; i < n; i++) {
          const angle = Angle.createDegrees(i * 360 / n);
          points.push(Point3d.create(r * angle.cos(), r * angle.sin()));
        }
        points.push(points[0].clone());
        x0 += 2.0 * r;
        const graph = Triangulator.createTriangulatedGraphFromSingleLoop(points)!;
        ck.testExactNumber(n - 1, graph.countFaceLoops());
        if (graph)
          GeometryCoreTestIO.captureGeometry(savedMeshes, PolyfaceBuilder.graphToPolyface(graph), x0, y0, 0);
        y0 += 2.0 * r;
      }
    }

    GeometryCoreTestIO.saveGeometry(savedMeshes, "Triangulation", "Circles");
    expect(ck.getNumErrors()).equals(0);
  });
  it("DegeneratePolygons", () => {
    const ck = new Checker();
    for (const points of [
      [{ x: 5.36, y: 8.85, z: 23.78 },
      { x: 8.822141987513945, y: 6.843546977282015, z: 23.78 },
      { x: 8.822141987513945, y: 6.843546977282015, z: 23.78 },
      { x: 5.36, y: 8.85, z: 23.78 },
      { x: 5.36, y: 8.85, z: 23.78 }],
      [{ x: 0, y: 0, z: 0 },
      { x: 3.4621419875139443, y: -2.0064530227179844, z: 0 },
      { x: 0, y: 0, z: 0 }],
      [{ x: 0, y: 0, z: 0 },
      { x: 2.9577539019415324, y: -0.8576720613542541, z: 0 },
      { x: 8.881784197001252e-16, y: 0, z: 0 }],
    ]) {
      const graph = Triangulator.createTriangulatedGraphFromSingleLoop(points);
      if (graph) {
        const polyface = PolyfaceBuilder.graphToPolyface(graph);
        ck.testExactNumber(polyface.facetCount, 0, "degenerate triangle produced no facets.");
      }
    }
  });
  it("facets for ACS", () => {
    const ck = new Checker();
    const savedMeshes = [];
    let counter0 = 0;
    for (const a of [4.5]) { // , 4.1, 3.5, 3]) {
      // sawtooth. Triangulate leading portions that are valid polygons (edge from origin does not cross)
      const basePoints = [
        Point3d.create(0, 1, 0),
        Point3d.create(4, 1, 0),
        Point3d.create(a, 0, 0),
        Point3d.create(6, 2, 0),
        Point3d.create(a, 4, 0),
        Point3d.create(4, 3, 0),
        Point3d.create(0, 3, 0)];
      let counter1 = 0;
      const needParams = true;
      for (let startIndex = 0; startIndex < basePoints.length; startIndex++) {
        const arrowPoints = [];
        for (let j = 0; j < basePoints.length; j++)
          arrowPoints.push(basePoints[(startIndex + j) % basePoints.length]);
        const loop = Loop.createPolygon(arrowPoints);
        const sweepContour = SweepContour.createForLinearSweep(loop);

        const options = new StrokeOptions();
        options.needParams = false;
        options.needParams = needParams;
        const builder = PolyfaceBuilder.create(options);

        sweepContour!.emitFacets(builder, false);
        const polyface = builder.claimPolyface(true);
        if (!ck.testExactNumber(arrowPoints.length - 2, polyface.facetCount, `Triangle count in arrow ${counter0}.${counter1}   needParams${needParams}`)
          || Checker.noisy.acsArrows) {
          console.log(` Triangulation From Start index ${startIndex} needParams ${needParams} `);
          console.log(`   arrow parameter ${a}`);
          console.log(`    Facet Count ${polyface.facetCount} counter0 ${counter0}   counter1 ${counter1}`);
          console.log(prettyPrint(arrowPoints));
          const jsPolyface = IModelJson.Writer.toIModelJson(polyface);
          console.log(prettyPrint(jsPolyface));
        }
        polyface.tryTranslateInPlace(counter1 * 10, counter0 * 10, 0);
        savedMeshes.push(polyface);
        counter1++;
      }
      counter0++;
    }
    GeometryCoreTestIO.saveGeometry(savedMeshes, "Triangulation", "ACSArrows");
    expect(ck.getNumErrors()).equals(0);
  });
  it("BowTies", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const step = 10.0;
    let dx = 0.;
    for (const a of [4.5]) { // , 4.1, 3.5, 3]) {
      // Create bow ties.   Start triangulation at each vertex.
      const basePoints = [
        Point3d.create(0, 0, 0),
        Point3d.create(4, 0, 0),
        Point3d.create(0, a, 0),
        Point3d.create(4, a, 0)];
      for (let startIndex = 0; startIndex < basePoints.length; startIndex++) {
        let dy = 0.0;
        const shiftedPoints = [];
        for (let j = 0; j < basePoints.length; j++)
          shiftedPoints.push(basePoints[(startIndex + j) % basePoints.length]);

        const graph = Triangulator.createTriangulatedGraphFromSingleLoop(shiftedPoints)!;
        GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(shiftedPoints), dx, dy += step);
        GraphChecker.captureAnnotatedGraph(allGeometry, graph, dx, dy += step);
        dx += step;
      }
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "Triangulation", "BowTies");
    expect(ck.getNumErrors()).equals(0);
  });

  it("FlexQuad", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const step = 10.0;
    let dx = 0.;
    for (const a of [4.5]) { // , 4.1, 3.5, 3]) {
      // Create bow ties.   Start triangulation at each vertex.
      const basePoints = [
        Point3d.create(0, 0, 0),
        Point3d.create(4, 0, 0),
        Point3d.create(4, a, 0),
        Point3d.create(3, 1, 0)];
      for (let startIndex = 0; startIndex < basePoints.length; startIndex++) {
        let dy = 0.0;
        const shiftedPoints = [];
        for (let j = 0; j < basePoints.length; j++)
          shiftedPoints.push(basePoints[(startIndex + j) % basePoints.length]);

        const graph = Triangulator.createTriangulatedGraphFromSingleLoop(shiftedPoints)!;
        GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(shiftedPoints), dx, dy += step);
        GraphChecker.captureAnnotatedGraph(allGeometry, graph, dx, dy += step);
        dx += step;
      }
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "Triangulation", "FlexQuad");
    expect(ck.getNumErrors()).equals(0);
  });

  it("PinchedTriangulation", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    let dx = -960;
    const dy = -3616;
    const loops = [];
    // A single pinch point:
    for (const dy14 of [0, 1, -1]) {
      loops.push([
        { x: 960, y: 3616 },
        // { x: 961, y: 3616 },
        { x: 968, y: 3612 + dy14 },
        // { x: 969, y: 3612 + dy14 },
        { x: 972, y: 3608 },
        { x: 968, y: 3608 },
        { x: 968, y: 3612 + dy14 },
        { x: 960, y: 3612 },
        { x: 960, y: 3616 },
        { x: 960, y: 3616 }]);
    }
    // multiple pinch points:
    const x0 = 960;
    const y0 = 3616;
    for (const touchAllPointsOnReturn of [true, false]) {
      for (const numPinch of [2, 3, 5]) {
        const points = [];
        points.push({ x: x0, y: y0 });
        let x1 = x0;
        const y1 = y0 - 2;
        // walk out in sawtooth steps
        for (let i = 0; i < numPinch; i++) {
          points.push({ x: x1 + 1, y: y1 });
          points.push({ x: x1 + 2, y: y0 });
          x1 += 2;
        }
        if (touchAllPointsOnReturn) {
          // walk back in each interval
          for (let i = 0; i < numPinch; i++) {
            points.push({ x: x1, y: y0 });
            x1 -= 2;
          }
        }
        loops.push(points);
      }
    }
    for (const points of loops) {
      GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(points), dx, dy);
      const graph = Triangulator.createTriangulatedGraphFromSingleLoop(points)!;
      if (graph) {
        GraphChecker.captureAnnotatedGraph(allGeometry, graph, dx, dy + 10);
        GraphChecker.verifyMaskAroundFaces(ck, graph, HalfEdgeMask.EXTERIOR);
        const polyface = PolyfaceBuilder.graphToPolyface(graph);
        GeometryCoreTestIO.captureGeometry(allGeometry, polyface, dx, dy + 20);
      }

      const graph1 = Triangulator.createTriangulatedGraphFromLoops([points]);
      if (graph1) {
        const polyface1 = PolyfaceBuilder.graphToPolyface(graph1);
        GeometryCoreTestIO.captureGeometry(allGeometry, polyface1, dx, dy + 30);
      }
      dx += 20;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "Triangulation", "PinchedTriangulation");
    expect(ck.getNumErrors()).equals(0);
  });

});
