/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/* eslint-disable no-console */

import { expect } from "chai";
import { Arc3d } from "../../curve/Arc3d";
import { ChainCollectorContext } from "../../curve/ChainCollectorContext";
import { AnyCurve, AnyRegion } from "../../curve/CurveChain";
import { BagOfCurves, CurveChain, CurveCollection } from "../../curve/CurveCollection";
import { CurveFactory } from "../../curve/CurveFactory";
import { CurveLocationDetail } from "../../curve/CurveLocationDetail";
import { CurvePrimitive } from "../../curve/CurvePrimitive";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { PolygonWireOffsetContext } from "../../curve/internalContexts/PolygonOffsetContext";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Loop } from "../../curve/Loop";
import { Path } from "../../curve/Path";
import { RegionOps } from "../../curve/RegionOps";
import { Geometry } from "../../Geometry";
import { Angle } from "../../geometry3d/Angle";
import { GrowableXYZArray } from "../../geometry3d/GrowableXYZArray";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Plane3dByOriginAndVectors } from "../../geometry3d/Plane3dByOriginAndVectors";
import { Point2d } from "../../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Point3dArray } from "../../geometry3d/PointHelpers";
import { PolylineOps } from "../../geometry3d/PolylineOps";
import { Range2d, Range3d } from "../../geometry3d/Range";
import { Transform } from "../../geometry3d/Transform";
import { PolyfaceBuilder } from "../../polyface/PolyfaceBuilder";
import { PolyfaceQuery } from "../../polyface/PolyfaceQuery";
import { Sample } from "../../serialization/GeometrySamples";
import { IModelJson } from "../../serialization/IModelJsonSchema";
import { HalfEdgeGraph } from "../../topology/Graph";
import { HalfEdgeGraphMerge } from "../../topology/Merging";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";
import { prettyPrint } from "../testFunctions";
import { GraphChecker } from "./Graph.test";
import * as fs from "fs";

const diegoPathA = [
  {
    lineSegment: [[9.475113484165819, -13.519605207518564, 0], [13.203035410431951, -14.269123503051588, 0]],
  }, {
    arc: {
      center: [13.005924613981659, -15.249504721722534, 0],
      vectorX: [0.1971107964502951, 0.9803812186709463, 0],
      vectorY: [0.9803812186709463, -0.1971107964502951, 0],
      sweepStartEnd:
        [0, 72.830637847867],
    },
  }, { lineSegment: [[14.000803020390693, -15.148425760207218, 0], [14.34957401104505, -18.58123435046298, 0]] }, {
    lineSegment: [[14.34957401104505, -18.58123435046298, 0], [12.673764076933416, -20.859772802822125, 0]],
  }, {
    arc: {
      center: [11.868182928857742, -20.2672873482622, 0],
      vectorX: [0.8055811480756748, -0.5924854545599226, 0],
      vectorY: [-0.5924854545599226, -0.8055811480756748, 0],
      sweepStartEnd: [0, 71.45442290504732],
    },
  }, {
    lineSegment: [
      [11.562686951204984, -21.21948071498872, 0],
      [8.527182927305319, -20.245587909330848, 0]],
  }, {
    lineSegment: [[8.527182927305319, -20.245587909330848, 0], [7.111360097008944, -16.594638869216595, 0]],
  }, {
    arc: {
      center: [8.043708604295633, -16.2330780016434, 0],
      vectorX: [-0.9323485072866892, -0.3615608675731971, 0],
      vectorY: [-0.3615608675731971, 0.9323485072866892, 0],
      sweepStartEnd: [0, 68.03218413297601],
    },
  },
  {
    lineSegment: [[7.359620917079077, -15.503678223607576, 0], [9.47511348416582, -13.519605207518566, 0]],
  }];

class PolygonBooleanTests {
  public allGeometry: GeometryQuery[] = [];
  public x0 = 0;
  public y0 = 0;
  public ck = new Checker();
  /**
   * * 0==> no output
   * * 1==> output for single call
   * * 2==> output one call
   */
  public debugPersistence = 0;
  public noisy = 0;
  public setDebugControls(noisy: number, persistence: number) {
    this.noisy = noisy;
    this.debugPersistence = persistence;
  }
  public getNoisy(): number { return this.debugPersistence > 0 ? this.noisy : 0; }
  public endDebugMethod() {
    if (this.debugPersistence === 1) {
      RegionOps.setCheckPointFunction(undefined);
    }

  }
  public getNumErrors() { return this.ck.getNumErrors(); }

  public captureAnnotatedGraph(graph: HalfEdgeGraph, dx: number, dy: number) {
    GraphChecker.captureAnnotatedGraph(this.allGeometry, graph, this.x0 + dx, this.y0 + dy);
  }
  public testBooleans(boundary0: Point3d[], boundary1: Point3d[]) {
    const range = Range3d.createArray(boundary0);
    const noisyDeltaX = range.xLength() * 1.25;
    let dx1 = noisyDeltaX;
    let boolOp = "";
    const noisy = this.getNoisy();
    if (noisy !== 0)
      RegionOps.setCheckPointFunction((name: string, graph: HalfEdgeGraph, properties: string, _extraData?: any) => {
        if (name === "After clusterAndMergeXYTheta"
          || noisy > 5) {
          this.captureAnnotatedGraph(graph, dx1, 0);
          dx1 += noisyDeltaX;
        }
        if (properties.indexOf("R") >= 0 && properties.indexOf("M") >= 0) {
          const euler = graph.countVertexLoops() - graph.countNodes() / 2.0 + graph.countFaceLoops();

          if (!this.ck.testExactNumber(2, euler, `${boolOp} Expected euler characteristic ${name}`)) {
            console.log(`outerRectangle  ${prettyPrint(boundary0)}`);
            console.log(`innerRectangle  ${prettyPrint(boundary1)}`);
            GraphChecker.dumpGraph(graph);
          }
        }

      });
    range.extendArray(boundary1);
    const yStep = 2.0 * range.yLength();
    this.y0 = 0.0;
    GeometryCoreTestIO.captureGeometry(this.allGeometry, LineString3d.create(boundary0), this.x0, this.y0);
    GeometryCoreTestIO.captureGeometry(this.allGeometry, LineString3d.create(boundary1), this.x0, this.y0);
    this.y0 += yStep; dx1 = 0.0;
    boolOp = "Union";
    let unionArea;
    let differenceAreaBOnly;
    let differenceAreaAOnly;
    let intersectionArea;
    const unionRegion = RegionOps.polygonXYAreaUnionLoopsToPolyface(boundary0, boundary1);
    if (this.ck.testPointer(unionRegion)) {
      unionArea = PolyfaceQuery.sumFacetAreas(unionRegion);
      GeometryCoreTestIO.captureGeometry(this.allGeometry, unionRegion, this.x0, this.y0);
    }
    this.y0 += yStep; dx1 = 0.0;

    boolOp = "Intersection";
    const intersectionRegion = RegionOps.polygonXYAreaIntersectLoopsToPolyface(boundary0, boundary1);
    if (this.ck.testPointer(intersectionRegion)) {
      intersectionArea = PolyfaceQuery.sumFacetAreas(intersectionRegion);
      GeometryCoreTestIO.captureGeometry(this.allGeometry, intersectionRegion, this.x0, this.y0);
    }
    this.y0 += yStep; dx1 = 0.0;

    boolOp = "Difference";
    const differenceRegionAOnly = RegionOps.polygonXYAreaDifferenceLoopsToPolyface(boundary0, boundary1);
    if (this.ck.testPointer(differenceRegionAOnly)) {
      differenceAreaAOnly = PolyfaceQuery.sumFacetAreas(differenceRegionAOnly);
      GeometryCoreTestIO.captureGeometry(this.allGeometry, differenceRegionAOnly, this.x0, this.y0);
    }
    this.y0 += yStep; dx1 = 0.0;

    boolOp = "Difference";
    const differenceRegionBOnly = RegionOps.polygonXYAreaDifferenceLoopsToPolyface(boundary1, boundary0);
    if (this.ck.testPointer(differenceRegionBOnly)) {
      differenceAreaBOnly = PolyfaceQuery.sumFacetAreas(differenceRegionBOnly);
      GeometryCoreTestIO.captureGeometry(this.allGeometry, differenceRegionBOnly, this.x0, this.y0);
    }

    if (unionArea !== undefined && intersectionArea !== undefined && differenceAreaAOnly !== undefined && differenceAreaBOnly !== undefined) {
      this.ck.testCoordinate(unionArea, differenceAreaAOnly + differenceAreaBOnly + intersectionArea);
    }
    this.x0 += 2.0 * range.xLength() + dx1;
    this.y0 = 0.0;
    this.endDebugMethod();
  }

  public saveAndReset(directoryName: string, fileName: string) {
    GeometryCoreTestIO.saveGeometry(this.allGeometry, directoryName, fileName);
    this.allGeometry = [];
    this.x0 = 0;
    this.y0 = 0;
  }
}
describe("RegionOps", () => {

  it("BooleanRectangles", () => {
    const context = new PolygonBooleanTests();
    context.setDebugControls(10, 1);
    context.testBooleans(Sample.createRectangleXY(0, 0, 5, 2), Sample.createRectangleXY(1, 1, 2, 3));
    context.saveAndReset("RegionOps", "BooleanRectangles");
    expect(context.getNumErrors()).equals(0);
  });

  it.skip("BooleanFractalAB", () => {
    // EDL July 15 2019 This triggers euler problem
    const context = new PolygonBooleanTests();
    context.setDebugControls(10, 1);
    const fractalA = Sample.createFractalLMildConcavePatter(2, 1.0);
    const fractalB = Sample.createFractalHatReversingPattern(1, 0.7);
    context.testBooleans(fractalA, fractalB);
    context.saveAndReset("RegionOps", "BooleanFractalAB");
    expect(context.getNumErrors()).equals(0);
  });

  it.skip("BooleanFractalABRotated", () => {
    const context = new PolygonBooleanTests();
    context.setDebugControls(10, 1);
    const fractalA = Sample.createFractalLMildConcavePatter(2, 1.0);
    const fractalB = Sample.createFractalHatReversingPattern(1, 0.7);
    const transform = Transform.createFixedPointAndMatrix(Point3d.create(0, 0, 0), Matrix3d.createRotationAroundAxisIndex(2, Angle.createDegrees(0.123213213218937891722)));
    const fractalA1 = transform.multiplyInversePoint3dArray(fractalA)!;
    const fractalB1 = transform.multiplyInversePoint3dArray(fractalB)!;
    context.testBooleans(fractalA1, fractalB1);
    context.saveAndReset("RegionOps", "BooleanFractalABRotated");
    expect(context.getNumErrors()).equals(0);
  });

  it("BooleanFlat", () => {
    const context = new PolygonBooleanTests();
    context.setDebugControls(10, 1);
    const rectangle = Sample.createRectangleXY(0, 0, 10, 6);
    const splat = [
      Point3d.create(2, 1),
      Point3d.create(7, 1),
      Point3d.create(8, 3),
      Point3d.create(7, 4),
      Point3d.create(6, 4),
      Point3d.create(5, 3),
      Point3d.create(3, 3),
      Point3d.create(2, 4),
      Point3d.create(1, 3),
      Point3d.create(2, 1)];
    context.testBooleans(rectangle, splat);
    context.saveAndReset("RegionOps", "BooleanSplat");
    expect(context.getNumErrors()).equals(0);
  });

  it("CleanupSawTooth", () => {
    const context = new PolygonBooleanTests();
    context.setDebugControls(10, 1);
    const ax = 1.0;
    const ay = 0.0;
    const bx = 10.0;
    const by = 5.0;
    // create the rectangle as Point2d to exercise Point3dArray.streamXYZ and Point3dArray.streamXYZXYZ
    const rectangle = [Point2d.create(ax, ay), Point2d.create(bx, ay), Point2d.create(bx, by), Point2d.create(ax, by), Point2d.create(ax, ay)];
    // and create more stuff as Growable array . . .
    const diamond = new GrowableXYZArray();
    for (let i = 0; i < rectangle.length; i++) {
      diamond.push(Point3d.createFrom(rectangle[i].interpolate(0.5, rectangle[(i + 1) % rectangle.length])));
    }
    const allGeometry: GeometryQuery[] = [];
    let x0 = 0.0;
    let y0 = 0.0;
    for (const splat of [
      Sample.appendSawTooth([], 1, 0.5, 3, 1, 5),
      Sample.appendSawTooth([], 1, 0.5, 1, 1, 3)]) {
      const growableSplat = GrowableXYZArray.create(splat);
      const data = [growableSplat, rectangle];
      const range = Range3d.createFromVariantData(data);
      const dx = range.xLength() * 2.0;
      const dy = range.yLength() * 2.0;
      y0 = 0.0;
      const graph = HalfEdgeGraphMerge.formGraphFromChains(data, true)!;
      GraphChecker.captureAnnotatedGraph(allGeometry, graph, x0, y0);
      y0 += dy;
      const polyface = PolyfaceBuilder.graphToPolyface(graph);
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, polyface, x0, y0);
      x0 += dx;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "RegionOps", "CleanupSawTooth");
    expect(context.getNumErrors()).equals(0);
  });

  it("BooleanNullFaces", () => {
    const context = new PolygonBooleanTests();
    context.setDebugControls(10, 1);
    const outerRectangle = Sample.createRectangleXY(0, 0, 10, 6);
    for (const innerRectangle of [
      Sample.createRectangleXY(2, 4, -2, 2),
      Sample.createRectangleXY(2, 0, 3, 2),
      Sample.createRectangleXY(8, 0, 2, 2),
      Sample.createRectangleXY(3, 4, 2, 2),
      Sample.createRectangleXY(0, 0, 3, 6)]) {
      context.testBooleans(outerRectangle, innerRectangle);
      context.saveAndReset("RegionOps", "BooleanSplat");
    }
    expect(context.getNumErrors()).equals(0);
  });

});
/**
 * Exercise PolygonWireOffset and output to a file.
 * @param polygons polygons to offset
 * @param caseName name to use for output file
 * @param distances offset distances
 * @param distanceFactor factor to apply to distances.
 */
function testPolygonOffset(polygons: Point3d[][],
  caseName: string,
  distances: number[],
  distanceFactor: number) {
  const ck = new Checker();
  const allGeometry: GeometryQuery[] = [];
  let x0 = 0;
  let y0 = 0;

  for (const points of polygons) {
    const range = Range3d.createArray(points);
    const yStep = 2.0 * range.yLength() + 10;
    y0 = 0.0;
    GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(points), x0, y0, 0);
    y0 += yStep;
    for (const closed of [false, true]) {
      if (closed && !points[0].isAlmostEqualMetric(points[points.length - 1]))
        continue;
      GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(points), x0, y0, 0);
      for (const offsetDistance of distances) {
        const stickA = RegionOps.constructPolygonWireXYOffset(points, closed, offsetDistance * distanceFactor);
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, stickA, x0, y0, 0);
      }
      y0 += yStep;
    }
    x0 += yStep;
  }

  GeometryCoreTestIO.saveGeometry(allGeometry, "PolygonOffset", caseName);
  expect(ck.getNumErrors()).equals(0);
}

/**
 * Exercise PolygonWireOffset and output to a file.
 * @param polygons polygons to offset
 * @param caseName name to use for output file
 * @param distances offset distances
 * @param distanceFactor factor to apply to distances.
 */
function testFilteredPolygonOffset(polygons: Point3d[][],
  caseName: string,
  distances: number[],
  filterFactor: number[]) {
  const ck = new Checker();
  const allGeometry: GeometryQuery[] = [];
  let x0 = 0;
  let y0 = 0;

  const context = new PolygonWireOffsetContext();
  for (const points of polygons) {
    const range = Range3d.createArray(points);
    const yStep = 2.0 * range.yLength();
    const xStep = 2.0 * range.xLength();
    y0 = 0.0;
    const closed = points[0].isAlmostEqual(points[points.length - 1]);
    GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(points), x0, y0, 0);

    x0 += xStep;
    for (const offsetDistance of distances) {
      y0 = 0.0;
      // unfiltered offset
      GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create(points), x0, y0, 0);
      const stickA0 = context.constructPolygonWireXYOffset(points, closed, offsetDistance);
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, stickA0, x0, y0, 0);
      const stickB0 = context.constructPolygonWireXYOffset(points, closed, -offsetDistance);
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, stickB0, x0, y0, 0);
      y0 += yStep;
      for (const factor of filterFactor) {
        const pointsA = PolylineOps.compressByChordError(points, factor * offsetDistance);
        GeometryCoreTestIO.createAndCaptureXYCircle(allGeometry, points[0], factor * offsetDistance, x0, y0, 0.0);
        // overlay original, filter, and offset ...
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, LineString3d.create(points), x0, y0, 0);
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, LineString3d.create(pointsA), x0, y0, 0);
        const stickA = context.constructPolygonWireXYOffset(pointsA, closed, offsetDistance);
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, stickA, x0, y0, 0);
        const stickB = context.constructPolygonWireXYOffset(pointsA, closed, -offsetDistance);
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, stickB, x0, y0, 0);
        y0 += yStep;
      }
      x0 += xStep;
    }
  }

  GeometryCoreTestIO.saveGeometry(allGeometry, "PolygonOffset", caseName);
  expect(ck.getNumErrors()).equals(0);
}

describe("PolygonOffset", () => {

  it("TestA", () => {

    // const yStep = 10.0;
    const rectangle0 = Sample.createRectangleXY(0, 0, 5, 6);
    const wPoints = [
      Point3d.create(0, 5),
      Point3d.create(2, 0),
      Point3d.create(3.0),
      Point3d.create(4, 5),
      Point3d.create(5, 5),
      Point3d.create(5.5, 0),
      Point3d.create(6, 0),
      Point3d.create(6.6, 1)];
    const star1 = Sample.createStar(1, 1, 0, 4, 3, 3, true);
    const star2 = Sample.createStar(1, 1, 0, 5, 2, 5, true);
    testPolygonOffset([rectangle0, star1, star2, wPoints], "TestA", [-0.5, 0.5, 1.0, -1.0, -2.0], 1.0);

  });

  it("TestSplitLine", () => {
    const allPoints = [];
    for (const upperCount of [2, 1, 2, 3, 8]) {
      const points = Sample.createInterpolatedPoints(Point3d.create(0, 1), Point3d.create(2, 3), upperCount, undefined, 0, upperCount);
      allPoints.push(points);
    }
    testPolygonOffset(allPoints, "TestSplitLine", [-0.5, 0.5, 1.0, -1.0, -2.0], 1.0);

  });

  it("TestColinear", () => {
    const allPoints = [];
    for (const delta of [0, 0.01, 0.4]) {
      const points: Point3d[] = [];
      const corners = Sample.createRectangleXY(0, 0, 5, 6);
      corners[1].x += delta;
      corners[2].x += 0.2 * delta;
      corners[2].y += delta;
      corners[3].x -= delta * 2;
      Sample.createInterpolatedPoints(corners[0], corners[1], 3, points, 0, 2);
      Sample.createInterpolatedPoints(corners[1], corners[2], 3, points, 0, 2);
      Sample.createInterpolatedPoints(corners[2], corners[3], 4, points, 0, 3);
      Sample.createInterpolatedPoints(corners[3], corners[0], 3, points, 0, 3);
      allPoints.push(points);
    }
    testPolygonOffset(allPoints, "TestColinear", [-0.5, 0.5, 1.0, -1.0, -2.0], 1.0);
  });

  it("TestSpikes", () => {
    const points = [];
    const dxA = 2.0;
    const dxB = 0.5;
    const dyC = 1.0;
    const dyD = 0.1;
    let x = 0.0;
    points.push(Point3d.create(0, 0, 0));
    for (let i = 2; i < 7; i++) {
      points.push(Point3d.create(x += dxA, 0));
      points.push(Point3d.create(x += dxB, dyC * i));
      points.push(Point3d.create(x += dxB, dyD));
    }
    // A problem part of mild fractal
    const pointsA = [];
    pointsA.push(Point3d.create(1432.1250000000005, 4889.2499999999964, 0.0));
    pointsA.push(Point3d.create(433.8750, 4720.50, 0.0));
    pointsA.push(Point3d.create(-442.8750, 5226.750, 0.0));
    pointsA.push(Point3d.create(-1350.0, 5564.250, 0.0));
    pointsA.push(Point3d.create(-675.0, 3750.0, 0.0));
    pointsA.push(Point3d.create(337.50, 1996.50, 0.0));
    // pointsA.push(Point3d.create(0.0, 0.0, 0.0));

    for (const p of pointsA) {
      p.scaleInPlace(0.001);
    }

    const offsetDistances = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25, 1.5, 2.0, 2.5];
    //     const offsetDistances = [0.7];
    testPolygonOffset([pointsA, points], "SpikeRight", offsetDistances, -1);
    testPolygonOffset([pointsA, points], "SpikeLeft", offsetDistances, 1);
  });

  it("TestGouge", () => {
    const points = [];
    points.push(Point3d.create(0, 0, 0));
    points.push(Point3d.create(0, 1, 0));
    points.push(Point3d.create(2, 5, 0));
    points.push(Point3d.create(2.5, 5.0));
    points.push(Point3d.create(3, 1, 0));
    points.push(Point3d.create(3, -2, 0));
    const offsetDistances = [0.7];
    // testPolygonOffset([points], "SpikeOutside", offsetDistances, 1);
    testPolygonOffset([points], "TestGouge", offsetDistances, -1);

  });

  it("TestFractals", () => {
    const pointsA = Sample.createFractalLMildConcavePatter(2, 0.9);
    let r = Range3d.createArray(pointsA);
    let a = r.xLength() * 0.02;
    let offsetDistances = [2 * a, a, -a, -2 * a];
    testPolygonOffset([pointsA], "MildConcaveFractal", offsetDistances, 1.0);
    const pointsB = Sample.createFractalHatReversingPattern(2, 0.9);
    r = Range3d.createArray(pointsA);
    a = r.xLength() * 0.005;
    offsetDistances = [a, 2 * a, 4 * a];
    testPolygonOffset([pointsB], "FractalHatReverse", offsetDistances, 1);

    const filterFactors = [0.5, 1.0, 1.5, 2.0];
    testFilteredPolygonOffset([pointsA, pointsB], "filteredFractals", offsetDistances, filterFactors);

  });
});

describe("RegionInOut", () => {
  it("EasyRectangleInOut", () => {
    const ck = new Checker();
    const range = Range2d.createXYXY(-2, 1, 4, 3);
    const rectangle = Sample.createRectangleInRange2d(range, 0, true);
    const loop = Loop.create(LineString3d.create(rectangle));
    const loopWithSegments = loop.cloneWithExpandedLineStrings() as Loop;
    for (const geometry of [loop, loopWithSegments]) {
      /** pure rectangle interior hits */
      for (const u of [-1, 0.5, 2]) {
        for (const v of [-0.4, 0.6, 3]) {
          const xy = range.fractionToPoint(u, v);
          ck.testBoolean(Geometry.isIn01(u) && Geometry.isIn01(v), RegionOps.testPointInOnOutRegionXY(geometry, xy.x, xy.y) > 0, { case: "SimpleInOut", uu: u, vv: v });
        }
      }
      // rectangle edge hits
      // q01 is always on an extended edge
      for (const q01 of [0, 1]) {
        // qe is somewhere "along" the edge
        for (const qe of [-0.4, 0.0, 0.3, 1.0, 1.6]) {
          for (const uv of [Point2d.create(q01, qe), Point2d.create(qe, q01)]) {
            const xy = range.fractionToPoint(uv.x, uv.y);
            ck.testExactNumber(Geometry.isIn01(qe) ? 0 : -1,
              RegionOps.testPointInOnOutRegionXY(geometry, xy.x, xy.y), { case: "InOutEdge", uu: uv.x, vv: uv.y });
          }
        }
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("CircleInOut", () => {
    const ck = new Checker();
    const arc0 = Arc3d.createXYEllipse(Point3d.create(0, 0, 0), 3, 2);
    const arc1 = arc0.cloneInRotatedBasis(Angle.createDegrees(15)); Loop;
    for (const arc of [arc0, arc1]) {
      for (const fraction of [0.0, 0.25, 0.4, 0.5, 0.88, 1.0]) {
        for (const radialFraction of [0.4, 1.0, 1.2]) {
          const xy = arc.fractionAndRadialFractionToPoint(fraction, radialFraction);
          const region = Loop.create(arc);
          const classify = RegionOps.testPointInOnOutRegionXY(region, xy.x, xy.y);
          const expectedClassify = Geometry.split3WaySign(radialFraction - 1.0, 1.0, 0.0, -1.0);
          if (!ck.testExactNumber(expectedClassify, classify, { arcInOut: arc, fractionAlong: fraction, fractionRadial: radialFraction }))
            RegionOps.testPointInOnOutRegionXY(region, xy.x, xy.y);
        }
      }
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("MixedInOut", () => {
    const allGeometry: GeometryQuery[] = [];
    const ck = new Checker();
    const unitZ = Vector3d.unitZ();
    const smallDistance = 0.001;
    const testPoint = Point3d.create();
    const testBasis = Plane3dByOriginAndVectors.createXYPlane();
    let x0 = 0.0;
    const y0 = 0.0;
    const z1 = 0.01;
    const errorVector = Vector3d.create(-1, 1, 0);
    const parityRegions = Sample.createSimpleParityRegions(true) as AnyRegion[];
    const unionRegions = Sample.createSimpleUnions() as AnyRegion[];
    for (const loop of parityRegions.concat(unionRegions)) {
      const range = loop.range();
      const primitives = loop.collectCurvePrimitives();
      // arbitrarily test various points on a line.
      const bigMarkerSize = 0.1;
      for (const fy of [0.4, 0.5, 0.6]) {
        for (const fx of [-0.05, 0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0, 1.05]) {
          range.fractionToPoint(fx, fy, 0, testPoint);
          const classify = RegionOps.testPointInOnOutRegionXY(loop, testPoint.x, testPoint.y);
          let marker = 0;
          if (classify < 0) marker = -4;
          if (classify > 0) marker = 4;
          GeometryCoreTestIO.createAndCaptureXYMarker(allGeometry, marker, testPoint, bigMarkerSize, x0, y0, z1);
        }
      }
      // We trust
      // 1) primitives have usual CCW outside, CW holes
      // 2) points close to primitives are in to left, out to right -- other primitives are not nearby
      // 3) frenet frame is well defined
      for (const cp of primitives) {
        for (const fraction of [0.359823, 0.5623112321]) {
          const basis = cp.fractionToPointAnd2Derivatives(fraction, testBasis);
          if (basis !== undefined) {
            basis.vectorU.normalizeInPlace();
            const perp = unitZ.crossProduct(basis.vectorU); // This should be an inward perpendicular !
            for (const q of [1, 0, -1]) {
              basis.origin.plusScaled(perp, q * smallDistance, testPoint);
              const classify = RegionOps.testPointInOnOutRegionXY(loop, testPoint.x, testPoint.y);
              ck.testExactNumber(q, classify, "InOut", { primitive: cp, f: fraction, point: testPoint });
              let marker = 0;
              if (q < 0) marker = -4;
              if (q > 0) marker = 4;
              GeometryCoreTestIO.createAndCaptureXYMarker(allGeometry, marker, testPoint, smallDistance, x0, y0, z1);
              if (q !== classify) {
                RegionOps.testPointInOnOutRegionXY(loop, testPoint.x, testPoint.y);
                GeometryCoreTestIO.captureGeometry(allGeometry, LineSegment3d.create(testPoint, testPoint.plus(errorVector)), x0, y0);
              }
            }
          }
        }
      }
      GeometryCoreTestIO.captureGeometry(allGeometry, loop, x0, y0);
      x0 += 20.0;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "RegionOps", "MixedInOut");
    expect(ck.getNumErrors()).equals(0);
  });

});

function curveLength(source: AnyCurve): number {
  if (source instanceof CurvePrimitive)
    return source.curveLength();
  if (source instanceof CurveCollection)
    return source.sumLengths();
  return 0.0;
}

describe("CloneSplitCurves", () => {
  it("PathSplits", () => {
    const allGeometry: GeometryQuery[] = [];
    const ck = new Checker();
    let x0 = 0;
    const y0 = 0;
    const yStep = 5.0;
    const y1 = 0.1;
    const y2 = 0.5;
    const line010 = LineSegment3d.createCapture(Point3d.create(0, 0, 0), Point3d.create(10, 0, 0));
    const arc010 = Arc3d.createCircularStartMiddleEnd(Point3d.create(0, 0), Point3d.create(5, -y1), Point3d.create(10, 0))!;
    // const line1 = LineSegment3d.createCapture(Point3d.create(1, -1, 0), Point3d.create(1, 1, 0));
    // const lineString234 = LineString3d.create([2, -1], [3, 1], [4, -1]);
    const arc5 = Arc3d.createXY(Point3d.create(5, 0, 0), 1);
    const linestring10 = LineString3d.create([10, 0], [11, y1], [10, y1]);
    // Assemble the cutters out of order to stress the sort logic.
    // const cutters = BagOfCurves.create(line1, arc5, lineString234);
    const cutters = BagOfCurves.create(arc5);
    const pathsToCut: AnyCurve[] = [
      line010,    // just a line
      arc010,     // just an arc
      LineString3d.create([0, 0], [10, 0], [10, y2], [0, y2]), // just a linestring
      Path.create(LineSegment3d.create(Point3d.create(0, y2), Point3d.create(0, 0)), line010.clone()),   // two lines that will rejoin in output
      Path.create(line010.clone(), LineSegment3d.create(line010.endPoint(), Point3d.create(0, y2))),   // two lines that will rejoin in output
      Path.create(line010.clone(), linestring10, Arc3d.createCircularStartMiddleEnd(linestring10.endPoint(), Point3d.create(5, y1), Point3d.create(0, 2 * y1))!)];
    for (const source of pathsToCut) {
      const cut = RegionOps.cloneCurvesWithXYSplitFlags(source, cutters) as CurveCollection;
      ck.testCoordinate(cut.sumLengths(), curveLength(source), "split curve markup preserves length");

      GeometryCoreTestIO.captureCloneGeometry(allGeometry, [source, cutters], x0, y0);
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, cut, x0, y0 + yStep);
      const splits = RegionOps.splitToPathsBetweenFlagBreaks(cut, true);
      if (splits)
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, cutters, x0, y0 + 2 * yStep);
      if (splits instanceof BagOfCurves)
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, splits.children, x0, y0 + 2 * yStep);
      else
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, splits, x0, y0 + 2 * yStep);
      x0 += 20;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "RegionOps", "PathSplits");

    expect(ck.getNumErrors()).equals(0);
  });

  it("ChainCollector", () => {
    const ck = new Checker();
    const chainCollector = new ChainCollectorContext(true);
    const segment1 = LineSegment3d.createXYZXYZ(1, 2, 3, 4, 2, 1);
    const segment2 = LineSegment3d.createXYZXYZ(4, 2, 1, 5, 2, 6);
    segment2.startCut = CurveLocationDetail.createCurveFractionPoint(segment1, 1, segment1.endPoint());
    ck.testUndefined(chainCollector.grabResult());
    chainCollector.announceCurvePrimitive(segment1);
    const singleton = chainCollector.grabResult();
    chainCollector.announceCurvePrimitive(segment1);
    chainCollector.announceCurvePrimitive(segment2);
    ck.testTrue(singleton instanceof LineSegment3d);

    expect(ck.getNumErrors()).equals(0);
  });
  it("ChainCollectorBreaks", () => {
    const ck = new Checker();
    const pointA0 = Point3d.create(0, 0, 0);
    const pointB0 = Point3d.create(1, 0, 0);
    const pointB1 = Point3d.create(1, 0, 1);
    const pointC1 = Point3d.create(2, 0, 1);

    const segmentA0B0 = LineSegment3d.create(pointA0, pointB0);
    const segmentB0C1 = LineSegment3d.create(pointB0, pointC1);
    const segmentB1C1 = LineSegment3d.create(pointB1, pointC1);
    ck.testFalse(ChainCollectorContext.needBreakBetweenPrimitives(segmentA0B0, segmentB0C1), "A0B0..B0C1");
    ck.testTrue(ChainCollectorContext.needBreakBetweenPrimitives(undefined, segmentB0C1), "undefined..B0C1");
    ck.testTrue(ChainCollectorContext.needBreakBetweenPrimitives(segmentA0B0, undefined), "A0B0..undefined");
    ck.testTrue(ChainCollectorContext.needBreakBetweenPrimitives(segmentA0B0, segmentB1C1), "A0B0..B1C1");
    ck.testFalse(ChainCollectorContext.needBreakBetweenPrimitives(segmentA0B0, segmentB1C1, true), "A0B0..B0C1XY");
    expect(ck.getNumErrors()).equals(0);
  });
  it("GeneralChainA", () => {
    const allGeometry: GeometryQuery[] = [];
    const ck = new Checker();
    const segments = [
      LineSegment3d.create(
        Point3d.createFrom({ x: 22.213935902760078, y: 6.72335636194596, z: 0 }),
        Point3d.createFrom({ x: 19.126382295715867, y: 7.030119101735917, z: 0 })),
      LineSegment3d.create(
        Point3d.createFrom({ x: 18.480825764734846, y: 3.237105594599584, z: 0 }),
        Point3d.createFrom({ x: 22.213935902760074, y: 6.72335636194596, z: 0 })),
      LineSegment3d.create(
        Point3d.createFrom({ x: 16.68697627970194, y: 5.084431827079689, z: 0 }),
        Point3d.createFrom({ x: 18.48082576473485, y: 3.2371055945995857, z: 0 })),
      LineSegment3d.create(
        Point3d.createFrom({ x: 13.954141275010276, y: 6.64077838793302, z: 0 }),
        Point3d.createFrom({ x: 16.68697627970194, y: 5.0844318270796895, z: 0 })),
      LineSegment3d.create(
        Point3d.createFrom({ x: 15.253988532688888, y: 8.496059229639044, z: 0 }),
        Point3d.createFrom({ x: 13.954141275010276, y: 6.64077838793302, z: 0 })),
      LineSegment3d.create(
        Point3d.createFrom({ x: 15.253988532688888, y: 8.496059229639043, z: 0 }),
        Point3d.createFrom({ x: 17.707917522590943, y: 9.036828096780024, z: 0 })),
      LineSegment3d.create(
        Point3d.createFrom({ x: 19.126382295715864, y: 7.030119101735919, z: 0 }),
        Point3d.createFrom({ x: 17.70791752259094, y: 9.03682809678002, z: 0 })),
    ];
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, segments, 0, 0, 0);
    const collector = new ChainCollectorContext(false);
    for (const s of segments) {
      collector.announceCurvePrimitive(s, true);
    }
    const chains = collector.grabResult(true);
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, chains, 20, 0, 0);
    GeometryCoreTestIO.saveGeometry(allGeometry, "RegionOps", "GeneralChainA");

    expect(ck.getNumErrors()).equals(0);

  });
  it("GeneralChainB", () => {
    const allGeometry: GeometryQuery[] = [];
    const ck = new Checker();
    const segments = [
      LineSegment3d.create(
        Point3d.createFrom({ x: 22.213935902760078, y: 6.72335636194596, z: 0 }),
        Point3d.createFrom({ x: 19.126382295715867, y: 7.030119101735917, z: 0 })),
      LineSegment3d.create(
        Point3d.createFrom({ x: 18.480825764734846, y: 3.237105594599584, z: 0 }),
        Point3d.createFrom({ x: 22.213935902760074, y: 6.72335636194596, z: 0 })),
      LineSegment3d.create(
        Point3d.createFrom({ x: 16.68697627970194, y: 5.084431827079689, z: 0 }),
        Point3d.createFrom({ x: 18.48082576473485, y: 3.2371055945995857, z: 0 })),
      LineSegment3d.create(
        Point3d.createFrom({ x: 13.954141275010276, y: 6.64077838793302, z: 0 }),
        Point3d.createFrom({ x: 16.68697627970194, y: 5.0844318270796895, z: 0 })),
      LineSegment3d.create(
        Point3d.createFrom({ x: 15.253988532688888, y: 8.496059229639044, z: 0 }),
        Point3d.createFrom({ x: 13.954141275010276, y: 6.64077838793302, z: 0 })),
      LineSegment3d.create(
        Point3d.createFrom({ x: 17.707917522590943, y: 9.036828096780024, z: 0 }),
        Point3d.createFrom({ x: 15.253988532688888, y: 8.496059229639043, z: 0 })),
      LineSegment3d.create(
        Point3d.createFrom({ x: 19.126382295715864, y: 7.030119101735919, z: 0 }),
        Point3d.createFrom({ x: 17.70791752259094, y: 9.03682809678002, z: 0 })),
    ];
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, segments, 0, 0, 0);
    const collector = new ChainCollectorContext(false);
    for (const s of segments) {
      collector.announceCurvePrimitive(s, true);
    }
    const chains = collector.grabResult(true);
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, chains, 20, 0, 0);
    GeometryCoreTestIO.saveGeometry(allGeometry, "RegionOps", "GeneralChainB");

    expect(ck.getNumErrors()).equals(0);
  });

  it("GeneralPathC", () => {
    const allGeometry: GeometryQuery[] = [];
    const ck = new Checker();
    const pathA = IModelJson.Reader.parse(diegoPathA);
    if (ck.testDefined(pathA, "Parsed geometry") && (pathA instanceof CurveChain || Array.isArray(pathA))) {
      const collector = new ChainCollectorContext(false);
      if (Array.isArray(pathA)) {
        for (const s of pathA) {
          collector.announceCurvePrimitive(s, true);
        }
      } else {
        for (const s of pathA.children) {
          collector.announceCurvePrimitive(s, true);
        }
      }
      const loopA = collector.grabResult(true);
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, pathA, 0, 0);
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, loopA, 0, 20);
      if (loopA instanceof Loop) {
        const loopAOffset = RegionOps.constructCurveXYOffset(loopA, 0.2);
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, loopA, 0, 40);
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, loopAOffset, 0, 40, -0.1);
      }
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "RegionOps", "ChainAndOffset");

    expect(ck.getNumErrors()).equals(0);

  });
  it("InOutSplits", () => {
    const allGeometry: GeometryQuery[] = [];
    const ck = new Checker();
    let x0 = 10;
    const y0 = 0;
    const yStep = 12;
    const xStep = 20;
    // Make a loop with multiple boundary curves . . .
    const segmentA = LineSegment3d.createXYXY(0, 0, 10, 0);
    const arcA = Arc3d.createCircularStartMiddleEnd(Point3d.create(10, 0), Point3d.create(12, 5, 0), Point3d.create(10, 10, 0))!;
    const stringA = LineString3d.create([10, 10], [0, 10], [0, 0]);
    const loop = Loop.create(segmentA, arcA, stringA);

    const path0 = CurveFactory.createFilletsInLineString([
      Point3d.create(1, 1),
      Point3d.create(5, 1),
      Point3d.create(8, 3),
      Point3d.create(13, 5),
      Point3d.create(12, 8),
      Point3d.create(5, 8)], 0.5);

    const path1 = CurveFactory.createFilletsInLineString([
      Point3d.create(1, 1),
      Point3d.create(5, 1),
      Point3d.create(14, 3),
      Point3d.create(14, 11),
      Point3d.create(5, 11),
      Point3d.create(-1, 1)], 3.5);
    for (const path of [path0, path1]) {
      // output raw geometry
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, loop, x0, y0);
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, path, x0, y0);

      const splitParts = RegionOps.splitPathsByRegionInOnOutXY(path, loop);
      let yOut = y0;
      for (const outputArray of [splitParts.insideParts, splitParts.outsideParts]) {
        yOut += yStep;
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, loop, x0, yOut);
        for (const fragment of outputArray) {
          GeometryCoreTestIO.captureCloneGeometry(allGeometry, fragment, x0, yOut);
        }
      }
      x0 += xStep;
    }

    GeometryCoreTestIO.saveGeometry(allGeometry, "RegionOps", "InOutSplits");

    expect(ck.getNumErrors()).equals(0);
  });
});

describe("RectangleRecognizer", () => {
  it("rectangleEdgeTransform", () => {
    const ck = new Checker();
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    for (const degrees of [0, 25.6]) {
      const points = Sample.createRegularPolygon(0, 0, 0, Angle.createDegrees(degrees), 2, 4, true);
      for (const requireClosure of [true, false]) {
        for (const data of [points,
          GrowableXYZArray.create(points),
          LineString3d.create(points),
          Path.create(LineString3d.create(points)),
          Loop.createPolygon(points),
          makeSticks(points)]) {
          const transform = RegionOps.rectangleEdgeTransform(data, requireClosure);
          ck.testDefined(transform);
          if (transform) {
            for (let i = 0; i < points.length; i++) {
              ck.testPoint3d(points[i], transform.multiplyXYZ(uv[i][0], uv[i][1]), `rectangle transform point ${i}`);
            }
          }
        }
      }
      ck.testUndefined(RegionOps.rectangleEdgeTransform(points.slice(0, 3), false), "short array should fail");
      const transform4 = RegionOps.rectangleEdgeTransform(points.slice(0, 4), false);
      const transform5 = RegionOps.rectangleEdgeTransform(points, true);
      if (ck.testDefined(transform4) && transform4 && ck.testDefined(transform5) && transform5)
        ck.testTransform(transform4, transform5);
      ck.testUndefined(RegionOps.rectangleEdgeTransform(points.slice(0, 3), false), "short array should fail");

      for (let i = 0; i < 4; i++) {
        const points1 = Point3dArray.clonePoint3dArray(points);
        points1[i].z += 0.01;
        ck.testUndefined(RegionOps.rectangleEdgeTransform(points1), `non planar should fail ${i}`);
        const points2 = Point3dArray.clonePoint3dArray(points);
        points2[i].x += 0.01;
        ck.testUndefined(RegionOps.rectangleEdgeTransform(points2), `skew should fail ${i}`);
      }
    }
    ck.testUndefined(RegionOps.rectangleEdgeTransform(LineSegment3d.createXYZXYZ(1, 2, 3, 4, 5, 2)));
    ck.testUndefined(RegionOps.rectangleEdgeTransform(Path.create(Arc3d.createUnitCircle())));
    ck.testUndefined(RegionOps.rectangleEdgeTransform(BagOfCurves.create()));
    expect(ck.getNumErrors()).equals(0);
  });
  it("3PointTurnChecks", () => {
    // const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const road = IModelJson.Reader.parse(JSON.parse(fs.readFileSync(
      "./src/test/testInputs/intersections/WilsonShapes/roadShape.imjs", "utf8")));
    const badShape = IModelJson.Reader.parse(JSON.parse(fs.readFileSync(
      "./src/test/testInputs/intersections/WilsonShapes/3pointTurnShape_overlaps.imjs", "utf8")));
    const goodShape = IModelJson.Reader.parse(JSON.parse(fs.readFileSync(
      "./src/test/testInputs/intersections/WilsonShapes/3pointTurnShape_fits.imjs", "utf8")));

    if (road instanceof Loop) {
      const roadRange = road.range();

      let x0 = -roadRange.low.x;
      const xStep = 2.0 * roadRange.xLength();
      const yStep = 1.2 * roadRange.yLength();

      for (const shape of [badShape, goodShape]) {
        if (shape instanceof Loop) {
          let y0 = -roadRange.low.y;
          const splitParts = RegionOps.splitPathsByRegionInOnOutXY(shape, road);
          GeometryCoreTestIO.captureCloneGeometry(allGeometry, road, x0, y0);
          GeometryCoreTestIO.captureCloneGeometry(allGeometry, shape, x0, y0);
          const dz = 0.1;
          for (const outputArray of [splitParts.insideParts, splitParts.outsideParts]) {
            y0 += yStep;
            GeometryCoreTestIO.captureCloneGeometry(allGeometry, road, x0, y0);
            for (const fragment of outputArray) {
              GeometryCoreTestIO.captureCloneGeometry(allGeometry, fragment, x0, y0, dz);
            }
          }
        }
        x0 += xStep;
      }
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "RegionOps", "3PointTurnChecks");
  });

});

function makeSticks(points: Point3d[]): Path {
  const path = Path.create();
  for (let i = 0; i + 1 < points.length; i++) {
    path.tryAddChild(LineSegment3d.create(points[i], points[i + 1]));
  }
  return path;
}
