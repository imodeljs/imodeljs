/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as fs from "fs";
import { Arc3d } from "../../curve/Arc3d";
import { CurveFactory } from "../../curve/CurveFactory";
import { CurvePrimitive } from "../../curve/CurvePrimitive";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { Loop } from "../../curve/Loop";
import { Angle } from "../../geometry3d/Angle";
import { AngleSweep } from "../../geometry3d/AngleSweep";
import { Point3dArrayCarrier } from "../../geometry3d/Point3dArrayCarrier";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Segment1d } from "../../geometry3d/Segment1d";
import { PolyfaceBuilder } from "../../polyface/PolyfaceBuilder";
import { Sample } from "../../serialization/GeometrySamples";
import { IModelJson } from "../../serialization/IModelJsonSchema";
import { Checker } from "../Checker";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";

/* eslint-disable no-console */

describe("CurveFactory", () => {
  it("CreateFilletsOnLineString", () => {
    const allGeometry: GeometryQuery[] = [];
    const ck = new Checker();

    const points0 = [
      Point3d.create(1, 1),
      Point3d.create(5, 1),
      Point3d.create(3, 7),
    ];

    const points1 = [
      Point3d.create(1, 1),
      Point3d.create(5, 1),
      Point3d.create(8, 3),
      Point3d.create(13, 5),
      Point3d.create(12, 8),
      Point3d.create(5, 8)];

    const points2 = [
      Point3d.create(1, 1),
      Point3d.create(5, 1),
      Point3d.create(14, 3),
      Point3d.create(14, 11),
      Point3d.create(5, 11),
      Point3d.create(-1, 1),
      Point3d.create(-1, 8),
      Point3d.create(4, 12),
      Point3d.create(8, 14)];
    let x0 = 0.0;
    const xStep = 30;
    const yStep = 20;
    for (const points of [points0, points1, points2]) {
      for (const allowBackup of [true, false]) {
        let y0 = 0.0;
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, LineString3d.create(points), x0, y0);
        for (const radius of [0.5, 1.0, 2.0, 4.0, 6.0]) {
          y0 += yStep;
          const path = CurveFactory.createFilletsInLineString(points, radius, allowBackup);
          GeometryCoreTestIO.captureCloneGeometry(allGeometry, path, x0, y0);
        }
        x0 += xStep;
      }
      x0 += xStep;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "CurveFactory", "FilletsOnLineString");

    expect(ck.getNumErrors()).equals(0);
  });
  it("FilletArcDegenerate", () => {
    const ck = new Checker();

    const point0 = Point3d.create(1, 2, 3);
    const point2 = Point3d.create(4, 2, -1);
    const radius = 2.0;
    for (const lambda of [0.0, -0.52, 0.45, 1.2, 1.0]) {
      const point1 = point0.interpolate(lambda, point2);
      const data = Arc3d.createFilletArc(point0, point1, point2, radius);
      ck.testDefined(data, "Degenerated arc data");
      ck.testUndefined(data.arc, "Degenerate arc -- expect no arc in data");
    }
    expect(ck.getNumErrors()).equals(0);
  });
  it("appendToArcInPlace", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    let x0 = 0.0;
    const xStep = 3.0;
    const yStep = 3.0;
    for (const arcA0 of [
      Arc3d.createXYZXYZXYZ(0, 0, 0, 2, 0, 0, 0, 2, 0, AngleSweep.createStartEndDegrees(0, 90)),
      Arc3d.createCircularStartMiddleEnd(Point3d.create(1, 0, 0), Point3d.create(1.5, 1, 0), Point3d.create(1, 2, 0)) as Arc3d,
      Arc3d.createXYZXYZXYZ(0, 0, 0, 2, 0, 0, 0.5, 1, 0, AngleSweep.createStartEndDegrees(-10, 50))]) {
      for (const reverse of [false, true]) {
        const arcA = arcA0.clone();
        if (reverse)
          arcA.sweep.reverseInPlace();
        for (const segment of [Segment1d.create(1, 1.5), Segment1d.create(1.1, 1.5), Segment1d.create(1, 0.5)]) {
          let y0 = 0.0;
          for (const rotationAngleB of [0.0, 25.0]) {
            const arcA1 = arcA.clone();
            const arcA2 = arcA.clone();
            const arcB1 = arcA.cloneInRotatedBasis(Angle.createDegrees(rotationAngleB));
            arcB1.sweep = AngleSweep.createStartEnd(arcB1.sweep.fractionToAngle(segment.x0), arcB1.sweep.fractionToAngle(segment.x1));
            GeometryCoreTestIO.captureCloneGeometry(allGeometry, [arcA1, arcB1], x0, y0);
            markArcData(allGeometry, arcA1, 0.9, 0.05, x0, y0);
            markArcData(allGeometry, arcB1, 0.9, 0.05, x0, y0);
            const append1 = CurveFactory.appendToArcInPlace(arcA1, arcB1, true);
            if (append1) {
              markArcData(allGeometry, arcA1, 1.1, 0.05, x0, y0 + yStep);
              GeometryCoreTestIO.captureCloneGeometry(allGeometry, arcA1, x0, y0 + yStep);
            }
            const append2 = CurveFactory.appendToArcInPlace(arcA2, arcB1, false);
            if (append2) {
              markArcData(allGeometry, arcA2, 1.1, 0.05, x0, y0 + 2 * yStep);
              GeometryCoreTestIO.captureCloneGeometry(allGeometry, arcA1, x0, y0 + 2 * yStep);
            }
            y0 += 4 * yStep;
          }
          x0 += xStep;
        }
        x0 += 2.0 * xStep;
      }
      x0 += 3.0 * xStep;
    }

    GeometryCoreTestIO.saveGeometry(allGeometry, "CurveFactory", "appendToArcInPlace");
    expect(ck.getNumErrors()).equals(0);
  });
  it("FilletsInLinestring", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    let x0 = 0.0;
    const points = [Point3d.create(0, 0, 0), Point3d.create(2, 0, 0), Point3d.create(2, 5, 1), Point3d.create(4, 5, 1), Point3d.create(6, 2, 1), Point3d.create(6, 5, 1)];
    const lineString0 = LineString3d.create(points);
    points.reverse();
    const lineString1 = LineString3d.create(points);
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, lineString0, x0, 0);
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, lineString1, x0, 28);
    x0 += 20.0;
    for (const filletRadius of [0.2, 0.4, 0.6, 0.8, 1.2, 2.0, 4.0, 6.0]) {
      let y0 = 0.0;
      for (const lineString of [lineString0, lineString1]) {
        const chain0 = CurveFactory.createFilletsInLineString(lineString, filletRadius, false)!;
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, chain0, x0, y0);
        y0 += 8.0;
        const chain1 = CurveFactory.createFilletsInLineString(lineString, filletRadius, true)!;
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, chain1, x0, y0);
        y0 += 20.0;
      }
      x0 += 20.0;
    }

    const radii = [0, 2, 1, 0.8, 0.6, 0.4];
    const chain2 = CurveFactory.createFilletsInLineString(lineString0, radii, true)!;
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, chain2, x0, 0.0);
    GeometryCoreTestIO.saveGeometry(allGeometry, "CurveFactory", "FilletsInLineString");
    expect(ck.getNumErrors()).equals(0);
  });
});
/**
 *
 * @param allGeometry
 * @param arc
 * @param radialFraction draw arc at this fraction of radius
 * @param tickFraction draw start tic delta this radial fraction
 * @param x0
 * @param y0
 */
function markArcData(allGeometry: GeometryQuery[], arc: Arc3d, radialFraction: number, tickFraction: number, x0: number, y0: number) {
  const arc1 = arc.clone();
  const center = arc.center;
  const start = arc.startPoint();
  const point0 = arc.angleToPointAndDerivative(Angle.createDegrees(0));
  const point90 = arc.angleToPointAndDerivative(Angle.createDegrees(90));
  arc1.matrixRef.scaleColumnsInPlace(radialFraction, radialFraction, 1.0);
  GeometryCoreTestIO.captureGeometry(allGeometry, [arc1,
    LineSegment3d.create(center.interpolate(radialFraction, start), center.interpolate(radialFraction + tickFraction, start)),
    LineString3d.create(point0.origin, center, point90.origin)], x0, y0);
}
const ppePathInputDirector = "./src/test/testInputs/pipeConnections/";
describe("PipeConnections", () => {
  it("ChainCollector", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    let refPoint: Point3d | undefined;
    let x0 = 0;
    let y0 = 0;
    let z0 = 0;
    const dx = 400.0;
    const dy = 600.0;
    const pipeRadius = 0.20;
    const bendRadius = 0.50;
    for (const filename of ["pipeLinesApril2020"]) {
      const stringData = fs.readFileSync(`${ppePathInputDirector}${filename}.imjs`, "utf8");
      if (stringData) {
        const jsonData = JSON.parse(stringData);
        const fragments = IModelJson.Reader.parse(jsonData);
        if (Array.isArray(fragments)) {
          for (const g of fragments) {
            if (g instanceof LineString3d) {
              if (refPoint === undefined) {
                refPoint = g.packedPoints.getPoint3dAtCheckedPointIndex(0);
                if (refPoint) {
                  x0 = -refPoint.x;
                  y0 = -refPoint.y;
                  z0 = -refPoint.z;
                }
              }
              const chain0 = CurveFactory.createFilletsInLineString(g, bendRadius, false)!;
              const pipe0 = CurveFactory.createPipeSegments(chain0, pipeRadius);
              GeometryCoreTestIO.captureCloneGeometry(allGeometry, chain0, x0 + dx, y0 + dy, z0);
              GeometryCoreTestIO.captureCloneGeometry(allGeometry, pipe0, x0, y0, z0);
            }
          }
        }
      }
      GeometryCoreTestIO.saveGeometry(allGeometry, "PipeConnections", filename);
    }
    expect(ck.getNumErrors()).equals(0);
  });
  it("createMiteredPipeSections", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    let x0 = 0.0;
    let y0 = 0.0;
    const radius = 0.25;
    const allPaths: Array<Point3dArrayCarrier | CurvePrimitive> = [];
    for (const numPoints of [8, 20, 40]) {
      const path = new Point3dArrayCarrier(
        Sample.createPointSineWave(undefined, numPoints, 10.0 / numPoints,
          5.0, AngleSweep.createStartEndDegrees(0, 520),
          3.0, AngleSweep.createStartEndDegrees(0, 100)));
      allPaths.push(path);
    }
    const bsplines = Sample.createBsplineCurves(false);
    for (const b of bsplines)
      allPaths.push(b);
    for (const path of allPaths) {
      y0 = 0;
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, path, x0, y0);
      y0 += 10.0;
      const builder = PolyfaceBuilder.create();
      builder.addMiteredPipes(path, radius);
      const mesh = builder.claimPolyface();
      GeometryCoreTestIO.captureCloneGeometry(allGeometry, mesh, x0, y0);
      x0 += 10;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "CurveFactory", "createMiteredPipeSections");
    expect(ck.getNumErrors()).equals(0);
  });
  it("createArcPointTangentPoint", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const pointA = Point3d.create(0.5, 0.2, 0.4);
    let x0 = 0;

    for (const tangentA of [Vector3d.create(1, 0, 0), Vector3d.create(-2, 3, 6), Vector3d.create(-1, -2, -5)]) {
      let y0 = 0.0;
      GeometryCoreTestIO.createAndCaptureXYCircle(allGeometry, pointA, 0.1, x0, y0);
      GeometryCoreTestIO.captureGeometry(allGeometry, LineSegment3d.create(pointA, pointA.plus(tangentA)), x0, y0);
      for (const pointB of [pointA.plus(Vector3d.create(3, 2, 0)), Point3d.create(0, 5, 2), Point3d.create(-2, -1, 5)]) {
        GeometryCoreTestIO.captureGeometry(allGeometry, LineSegment3d.create(pointA, pointA.plus(tangentA)), x0, y0);
        GeometryCoreTestIO.createAndCaptureXYCircle(allGeometry, pointB, 0.1, x0, y0);
        const arc = CurveFactory.createArcPointTangentPoint(pointA, tangentA, pointB);
        ck.testDefined(arc, "Expect arc Point Tangent Point", pointA, tangentA, pointB);
        GeometryCoreTestIO.captureCloneGeometry(allGeometry, arc, x0, y0);
        if (arc) {
          const point90 = arc.radiansToPointAndDerivative(0.5 * Math.PI);
          GeometryCoreTestIO.createAndCaptureXYCircle(allGeometry, point90.origin, 0.05, x0, y0);
          GeometryCoreTestIO.captureGeometry(allGeometry, LineString3d.create([pointA, arc.center, point90.origin]), x0, y0);
          ck.testPoint3d(pointA, arc.startPoint(), "arc start");
          ck.testPoint3d(pointB, arc.endPoint(), "arc end");
          const tangentRay = arc.fractionToPointAndDerivative(0.0);
          ck.testParallel(tangentA, tangentRay.direction, "arc tangent");
        }
        y0 += 20;
      }
      x0 += 20.0;
    }
    GeometryCoreTestIO.saveGeometry(allGeometry, "CurveFactory", "createArcPointTangentPoint");
    expect(ck.getNumErrors()).equals(0);
  });
  it("createRectangleXY", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const x0 = 1.5;
    const y0 = 2.0;
    const x1 = 6;
    const y1 = 7;
    const radiusA = 3.0;
    const rectangleA = CurveFactory.createRectangleXY(x0, y0, x1, y1, 0, radiusA);
    const rectangleB1 = CurveFactory.createRectangleXY(x0, y0, x1, y1, 0, undefined);
    const rectangleB0 = CurveFactory.createRectangleXY(x0, y0, x1, y1, 0, 0.0);
    ck.testType(rectangleA, Loop);
    ck.testType(rectangleB0, Loop);
    ck.testType(rectangleB1, Loop);
    const radii: (number | undefined)[] = [undefined, 0, 1, 2, 3];
    let yOut = 0.0;
    for (const yB of [4, -4]) {
      let xOut = 0.0;
      for (const xB of [6, -6]) {
        for (const radiusD of radii) {
          const rectangleD = CurveFactory.createRectangleXY(0, 0, xB, yB, 0, radiusD);
          ck.testType(rectangleD, Loop, "CurveFactory always returns a loop");
          GeometryCoreTestIO.captureCloneGeometry(allGeometry, rectangleD, xOut, yOut);
          xOut += 10.0;
        }
        xOut += 20.0;
      }
      yOut += 20;
    }

    GeometryCoreTestIO.saveGeometry(allGeometry, "CurveFactory", "createRectangleXY");
    expect(ck.getNumErrors()).equals(0);
  });

});
