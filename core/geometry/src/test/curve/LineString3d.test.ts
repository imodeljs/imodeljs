/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ClipPlane } from "../../clipping/ClipPlane";
import { CurveLocationDetail } from "../../curve/CurveLocationDetail";
import { CurvePrimitive } from "../../curve/CurvePrimitive";
import { LineSegment3d } from "../../curve/LineSegment3d";
import { LineString3d } from "../../curve/LineString3d";
import { StrokeOptions } from "../../curve/StrokeOptions";
import { GrowableXYZArray } from "../../geometry3d/GrowableXYZArray";
import { Matrix3d } from "../../geometry3d/Matrix3d";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/Plane3dByOriginAndUnitNormal";
import { Point2d } from "../../geometry3d/Point2dVector2d";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Transform } from "../../geometry3d/Transform";
import { Checker } from "../Checker";

/* eslint-disable no-console */

function exerciseLineString3d(ck: Checker, lsA: LineString3d) {
  const expectValidResults = lsA.numPoints() > 1;
  const a = 4.2;
  const scaleTransform = Transform.createFixedPointAndMatrix(Point3d.create(4, 3),
    Matrix3d.createScale(a, a, a));
  const lsB = lsA.clone();
  lsB.reverseInPlace();
  const lsC = lsA.clone()!;
  ck.testTrue(lsC.tryTransformInPlace(scaleTransform));
  // exercise evaluation logic within each segment.
  // force evaluations in zero segment linestring
  for (let segmentIndex = 0; segmentIndex === 0 || segmentIndex + 1 < lsA.numPoints(); segmentIndex++) {
    for (const localFraction of [0.1, 0.1, 0.6, 0.6]) {
      const globalFraction = lsA.segmentIndexAndLocalFractionToGlobalFraction(segmentIndex, localFraction);
      const frame = lsA.fractionToFrenetFrame(globalFraction);
      const xyz = lsA.fractionToPoint(globalFraction);
      const ray = lsA.fractionToPointAndDerivative(globalFraction);
      const closestPointDetail = lsA.closestPoint(xyz, false);
      if (expectValidResults) {
        ck.testTrue(frame.matrix.isRigid());
        ck.testPoint3d(xyz, ray.origin);
        ck.testPoint3d(xyz, frame.getOrigin(), "frenet vs fractionToPoint", lsA, segmentIndex, localFraction, globalFraction);
        ck.testCoordinate(globalFraction, closestPointDetail.fraction);
      }
    }
  }
  const splitFraction = 0.4203;
  const partA = lsA.clonePartialCurve(0.0, splitFraction);
  const partB = lsA.clonePartialCurve(1.0, splitFraction);  // reversed to exercise more code.  But length is absolute so it will add.
  if (expectValidResults
    && ck.testPointer(partA, "forward partial") && partA
    && ck.testPointer(partA, "forward partial") && partB) {
    ck.testCoordinate(lsA.curveLength(), partA.curveLength() + partB.curveLength(), "Partial curves sum to length", lsA, partA, partB);
  }
}
describe("LineString3d", () => {
  it("HelloWorld", () => {
    const ck = new Checker();
    const ls0 = LineString3d.create();
    exerciseLineString3d(ck, ls0);
    ls0.addPoint(Point3d.create(4, 3, 2));
    exerciseLineString3d(ck, ls0);
    const point100 = Point3d.create(1, 0, 0);
    const point420 = Point3d.create(4, 2, 0);
    const point450 = Point3d.create(4, 5, 0);
    const point150 = Point3d.create(1, 5, 0);
    const lsA = LineString3d.create([point100, point420, point450, point150]);
    exerciseLineString3d(ck, lsA);
    const lsB = LineString3d.createRectangleXY(
      Point3d.create(1, 1),
      3, 2, true);
    exerciseLineString3d(ck, lsB);
    const lsC = LineString3d.create([point100]);
    ck.testUndefined(lsC.quickUnitNormal(), "quickUnitNormal expected failure 1 point");
    lsC.addPoint(point420);
    ck.testUndefined(lsC.quickUnitNormal(), "quickUnitNormal expected failure 2 point");
    lsC.addPoint(point420.interpolate(0.6, point100));
    ck.testUndefined(lsC.quickUnitNormal(), "quickUnitNormal expected failure 3 point colinear");
    const normalA = lsA.quickUnitNormal();
    if (ck.testPointer(normalA, "quickUnitNormal") && normalA)
      ck.testCoordinate(1.0, normalA.magnitude(), "unit normal magnitude");

    ck.checkpoint("LineString3d.HelloWorld");
    expect(ck.getNumErrors()).equals(0);
  });

  it("createXY", () => {
    const ck = new Checker();
    const xyArray = [
      Point2d.create(1, 1),
      Point2d.create(4, 1),
      Point2d.create(4, 2),
      Point2d.create(0, 2),
    ];
    const jsArrayXY = [];
    const jsArrayXYZ = [];
    const dz = 10.0;
    for (const p of xyArray) {
      jsArrayXY.push([p.x, p.y]);
      jsArrayXYZ.push([p.x, p.y, dz]);
    }
    const ls10 = LineString3d.createXY(xyArray, dz);
    const ls0 = LineString3d.create(xyArray);
    const lsArrayXY = LineString3d.create(jsArrayXY);
    const lsArrayXYZ = LineString3d.create(jsArrayXYZ);
    lsArrayXY.tryTranslateInPlace(0, 0, dz);
    ls0.tryTranslateInPlace(0, 0, dz);

    ck.testTrue(ls0.isAlmostEqual(ls10));
    ck.testTrue(ls0.isAlmostEqual(lsArrayXY));
    ck.testTrue(ls0.isAlmostEqual(lsArrayXYZ));

    ck.testExactNumber(4, ls10.numPoints());
    expect(ck.getNumErrors()).equals(0);
  });

  it("clonePartial", () => {
    const ck = new Checker();
    // we know the length of this linestring is 'a'.
    // make partials
    const a = 5.0;
    const interiorFraction = 0.24324;
    const ls = LineString3d.createXY([Point2d.create(0, 1), Point2d.create(0.5 * a, 1), Point2d.create(a, 1)], 0);
    ck.testExactNumber(3, ls.numPoints());
    const ls1 = ls.clonePartialCurve(interiorFraction, 3.0)!;
    const ls2 = ls.clonePartialCurve(-4, interiorFraction)!;
    ck.testCoordinate(ls1.curveLength(), (1.0 - interiorFraction) * a, "clonePartial does not extrapolate up");
    ck.testCoordinate(ls2.curveLength(), (interiorFraction) * a, "clonePartial does not extrapolate down");
    expect(ck.getNumErrors()).equals(0);
  });

  it("addResolvedPoint", () => {
    const ck = new Checker();
    // addResolvedPoint is private -- tricky tricky...
    const a = 10.0;
    const ls = LineString3d.createXY([Point2d.create(0, 1), Point2d.create(0.5 * a, 1), Point2d.create(a, 1)], 0);
    const lsZ = ls as any;
    const dest = new GrowableXYZArray(5);
    // deviously reproduce the whole linestring via clamping ...
    lsZ.addResolvedPoint(-1, 0.3, dest);
    lsZ.addResolvedPoint(1, 0, dest);
    lsZ.addResolvedPoint(5, 0, dest);
    const n0 = dest.length;
    const ls0 = LineString3d.create();
    const ls0Z = ls0 as any;
    ls0Z.addResolvedPoint(0, 0, dest);
    ck.testExactNumber(n0, dest.length, "confirm no-op");
    ls0.addPointXYZ(1, 2, 3);
    ls0Z.addResolvedPoint(0, 0, dest);
    ck.testExactNumber(n0 + 1, dest.length, "confirm access to singleton");
    expect(ck.getNumErrors()).equals(0);
  });

  it("addAuxData", () => {
    const ck = new Checker();
    const ls = LineString3d.create();
    let n = 0;
    for (let f = 0; f <= 1.0; f += 0.25) {
      ls.addPointXYZ(f, 0, 0);
      ls.addFraction(f);
      ls.addUVParam(Point2d.create(f, f));
      ls.addDerivative(Vector3d.create(1, 2, 3));
      n++;
    }
    if (ck.testPointer(ls.fractions))
      ck.testExactNumber(n, ls.fractions.length);
    if (ck.testPointer(ls.packedDerivatives))
      ck.testExactNumber(n, ls.packedDerivatives.length);
    if (ck.testPointer(n, ls.packedDerivatives))
      ck.testExactNumber(n, ls.packedDerivatives!.length);
    ck.testExactNumber(n, ls.numPoints());
    expect(ck.getNumErrors()).equals(0);
  });

  it("RegularPolygon", () => {
    const ck = new Checker();
    const center = Point3d.create(3, 2, 1);
    const radius = 2.0;
    const poly1 = LineString3d.createRegularPolygonXY(center, 2, radius, true);
    const poly4 = LineString3d.createRegularPolygonXY(center, 4, radius, true);
    const poly4F = LineString3d.createRegularPolygonXY(center, 4, radius, false);
    ck.testUndefined(poly1.getIndexedSegment(5));
    ck.testFalse(poly4.isAlmostEqual(poly1));
    for (let i = 0; i < 4; i++) {
      ck.testCoordinate(radius, center.distance(poly4.pointAt(i)!)); // TRUE poly has points on the radius
      ck.testLE(radius, center.distance(poly4F.pointAt(i)!)); // FALSE poly has points outside the radius
      // const segment = poly4.getIndexedSegment(i);
      const segmentF = poly4F.getIndexedSegment(i)!;
      const detail = segmentF.closestPoint(center, false);
      ck.testCoordinate(0.5, detail.fraction);
      ck.testCoordinate(radius, center.distance(detail.point));
    }
    const data64 = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const polyF64 = LineString3d.createFloat64Array(data64);
    ck.testExactNumber(3 * polyF64.numPoints(), data64.length);
    expect(ck.getNumErrors()).equals(0);
  });
  it("AnnounceClipIntervals", () => {
    const ck = new Checker();
    const ls = LineString3d.create(Point3d.create(1, 1, 0), Point3d.create(4, 1, 0), Point3d.create(4, 2, 0), Point3d.create(0, 2, 0));
    const clipper = ClipPlane.createEdgeXY(Point3d.create(2, 0, 0), Point3d.create(0, 5, 0))!;
    // The linestring starts in, goes out, and comes back.  Verify 2 segments announced.
    let numAnnounce = 0;
    ls.announceClipIntervals(clipper,
      (_a0: number, _a1: number, _cp: CurvePrimitive) => {
        numAnnounce++;
      });
    ck.testExactNumber(numAnnounce, 2);
    expect(ck.getNumErrors()).equals(0);
  });

});
/**
 * Class to act as an iterator over points in a linestring.
 * * Internal data is:
 *   * pointer to the parent linestring
 *   * index of index of the next point to read.
 * * the parent LineString class
 */
class IterableLineStringPoint3dIterator implements Iterator<Point3d> {
  private _linestring: LineStringWithIterator;
  private _nextReadIndex: number;
  public constructor(linestring: LineStringWithIterator) {
    this._linestring = linestring;
    this._nextReadIndex = 0;
  }
  public next(): IteratorResult<Point3d> {
    const point = this._linestring.pointAt(this._nextReadIndex++);
    if (point)
      return { done: false, value: point };
    return { done: true, value: undefined } as any as IteratorResult<Point3d>;
  }
  public [Symbol.iterator](): IterableIterator<Point3d> { return this; }
}
/**
 * This is a linestring class which
 * * Stores its point data in a Float64Array (NOT as individual Point3d objects)
 * * has a `pointIterator ()` method which returns an iterator so that users can visit points with `for (const p of linestring.pointIterator()){}`
 */
class LineStringWithIterator {
  private _data: Float64Array;
  public constructor(points: Point3d[]) {
    this._data = new Float64Array(3 * points.length);
    let i = 0;
    for (const p of points) {
      this._data[i++] = p.x;
      this._data[i++] = p.y;
      this._data[i++] = p.z;
    }
  }
  public [Symbol.iterator](): IterableIterator<Point3d> { return new IterableLineStringPoint3dIterator(this); }
  /**
   * access a point by index.  The point coordinates are returned as a first class point object.
   * @param index index of point to access
   */
  public pointAt(index: number): Point3d | undefined {
    const k = index * 3;
    if (k < this._data.length)
      return new Point3d(this._data[k], this._data[k + 1], this._data[k + 2]);
    return undefined;
  }
}
describe("LineStringIterator", () => {

  it("HelloWorld", () => {
    const ck = new Checker();
    const allPoints: Point3d[] = [
      Point3d.create(0, 0, 0),
      Point3d.create(0, 10, 0),
      Point3d.create(10, 10, 0),
      Point3d.create(10, 0, 0),
      Point3d.create(20, 0, 0),
      Point3d.create(20, 10, 0)];
    const ls = new LineStringWithIterator(allPoints);
    let i = 0;
    for (const p of ls) {
      ck.testPoint3d(p, allPoints[i], "LineStringIterator");
      i++;
      // console.log("for..of ", p.toJSON());
    }
    expect(ck.getNumErrors()).equals(0);
  });

});

describe("LineStringAnnotation", () => {
  it("DegenerateCases", () => {
    const ck = new Checker();
    const ls0 = LineString3d.create();
    const badPoint0 = ls0.startPoint();
    const badPoint1 = ls0.endPoint();
    const zeroPoint = Point3d.create();
    const intersections: CurveLocationDetail[] = [];
    ck.testFalse(ls0.isAlmostEqual(LineSegment3d.createXYZXYZ(0, 0, 0, 1, 1, 1)));
    ck.testExactNumber(0, ls0.appendPlaneIntersectionPoints(Plane3dByOriginAndUnitNormal.createXYPlane(), intersections));
    ck.testPoint3d(zeroPoint, badPoint0);
    ck.testPoint3d(zeroPoint, badPoint1);
    ck.testExactNumber(0, ls0.curveLengthBetweenFractions(0, 0));
    ck.testExactNumber(0, ls0.curveLengthBetweenFractions(0, 1));
    const p0 = Point3d.create(1, 2, 3);
    const p1 = Point3d.create(4, 1, 2);
    const ls2 = LineString3d.create([p0, p1]);
    ck.testCoordinate(p0.distance(p1), ls2.curveLengthBetweenFractions(0, 1));

    const ls2A = LineString3d.create([p0, p0]);
    const frame = ls2.fractionToFrenetFrame(0.5);
    const frameA = ls2A.fractionToFrenetFrame(0.5);
    const l24Bad = LineString3d.create([p0, p0, p0, p0]);
    const frame4Bad = l24Bad.fractionToFrenetFrame(0.5);
    ck.testPointer(frame);
    ck.testPointer(frameA);
    ck.testPointer(frame4Bad);
    expect(ck.getNumErrors()).equals(0);
  });
  it("FractionArray", () => {
    const ck = new Checker();
    const ls0 = LineString3d.create();
    ls0.ensureEmptyFractions();
    ls0.ensureEmptyFractions();
    const p0 = Point3d.create(1, 2, 3);
    const p1 = Point3d.create(4, 1, 2);
    ls0.appendStrokePoint(p0, 0.0);
    ls0.appendStrokePoint(p1, 1.0);
    ck.testExactNumber(2, ls0.numPoints());
    ls0.appendStrokePoint(p1, 1.0);   // this is a duplicate
    ck.testExactNumber(2, ls0.numPoints());
    ls0.appendStrokePoint(p1, 0.0);   // this is xyz dup but fraction different
    ck.testExactNumber(2, ls0.numPoints());

    const line = LineSegment3d.createXYZXYZ(1, 2, 3, 2, 5, 1);
    ls0.clear();
    ls0.ensureEmptyFractions();
    ls0.appendFractionToPoint(line, 0.0);
    ck.testExactNumber(1, ls0.numPoints());

    ls0.clear();
    ls0.ensureEmptyDerivatives();
    ls0.ensureEmptyDerivatives();
    ls0.appendFractionToPoint(line, 0.0);
    ls0.appendFractionToPoint(line, 1.0);
    ck.testExactNumber(ls0.fractions!.length, ls0.packedDerivatives!.length);
    ls0.clear();
    ck.testExactNumber(0, ls0.numPoints());
    ck.testExactNumber(0, ls0.fractions!.length);
    expect(ck.getNumErrors()).equals(0);
  });

  it("AppendInterpolated", () => {
    const ck = new Checker();
    const ls0 = LineString3d.create();
    const p0 = Point3d.create(1, 2, 3);
    const p1 = Point3d.create(4, 1, 2);
    const p2 = Point3d.create(6, 3, 0);
    for (const i of [0, 1]) {
      ls0.clear();
      ls0.appendInterpolatedStrokePoints(3, p0, p1, true);
      ck.testExactNumber(4, ls0.numPoints());
      ls0.appendInterpolatedStrokePoints(4, p1, p2, false);
      ck.testExactNumber(7, ls0.numPoints());
      if (i === 0)
        ls0.ensureEmptyFractions();
    }
    ls0.fractionToFrenetFrame(1.1);
    expect(ck.getNumErrors()).equals(0);
  });

  it("StrokeCountWithMaxEdgeLength", () => {
    const ck = new Checker();
    const p0 = Point3d.create(1, 0, 0);
    const p1 = Point3d.create(3, 0, 0);
    const p2 = Point3d.create(3, 5, 0);
    const ls0 = LineString3d.create(p0, p1, p2);
    const options = StrokeOptions.createForCurves();
    options.maxEdgeLength = 1.0;
    const n = ls0.computeStrokeCountForOptions(options);
    ck.testExactNumber(7, n);
    expect(ck.getNumErrors()).equals(0);
  });

  it("CreateAnnotations", () => {
    const ck = new Checker();
    const allPoints: Point3d[] = [
      Point3d.create(0, 0, 0),
      Point3d.create(0, 10, 0),
      Point3d.create(10, 10, 0),
      Point3d.create(10, 0, 0),
      Point3d.create(20, 0, 0),
      Point3d.create(20, 10, 0)];
    const ls = LineString3d.create(allPoints);

    const normalIndices = ls.ensureEmptyNormalIndices();
    const pointIndices = ls.ensureEmptyPointIndices();
    const paramIndices = ls.ensureEmptyUVIndices();
    const params = ls.ensureEmptyUVParams();
    const surfaceNormals = ls.ensureEmptySurfaceNormals();

    ck.testUndefined(ls.derivativeAt(1));
    ck.testUndefined(ls.surfaceNormalAt(3));
    ck.testPointer(normalIndices);
    ck.testPointer(pointIndices);
    ck.testPointer(paramIndices);
    ck.testPointer(params);
    ck.testPointer(surfaceNormals);

    // meaningless data -- just fill all the arrays ..
    const n = allPoints.length;

    for (let i = 0; i < n; i++) {
      const v = Vector3d.create(2 * i, i * i * i);
      ls.addSurfaceNormal(v);
      const vN = ls.surfaceNormalAt(i);
      if (ck.testPointer(vN))
        ck.testVector3d(v, vN);
      ls.addDerivative(v);
      const v1 = ls.derivativeAt(i);
      if (ck.testPointer(v1))
        ck.testVector3d(v, v1);
      if ((i & 0x01) !== 0)
        ls.addUVParam(Point2d.create(0, i));
      else
        ls.addUVParamAsUV(i, 0);
    }

    ck.testExactNumber(n, surfaceNormals.length);
    ck.testExactNumber(n, params.length);

    // again to reach overwrite blocks
    const normalIndicesA = ls.ensureEmptyNormalIndices();
    const pointIndicesA = ls.ensureEmptyPointIndices();
    const paramIndicesA = ls.ensureEmptyUVIndices();
    const paramsA = ls.ensureEmptyUVParams();
    const surfaceNormalsA = ls.ensureEmptySurfaceNormals();

    ck.testPointer(normalIndicesA);
    ck.testPointer(pointIndicesA);
    ck.testPointer(paramIndicesA);
    ck.testPointer(paramsA);
    ck.testPointer(surfaceNormalsA);

    expect(ck.getNumErrors()).equals(0);
  });

});
