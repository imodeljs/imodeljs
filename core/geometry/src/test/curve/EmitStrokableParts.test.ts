/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { CurvePrimitive } from "../../curve/CurvePrimitive";
import { LineString3d } from "../../curve/LineString3d";
import { StrokeOptions } from "../../curve/StrokeOptions";
import { FrameBuilder } from "../../geometry3d/FrameBuilder";
import { IStrokeHandler } from "../../geometry3d/GeometryHandler";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
// import { Point3d, Vector3d, Transform, Matrix3d, Range1d } from "../PointVector";
import { Sample } from "../../serialization/GeometrySamples";
// import { Geometry } from "../Geometry";
import { Checker } from "../Checker";

function maxSegmentLength(linestring: LineString3d): number {
  let aMax = 0;
  for (let i = 0; i + 1 < linestring.numPoints(); i++) {
    aMax = Math.max(linestring.pointAt(i)!.distance(linestring.pointAt(i + 1)!), aMax);
  }
  return aMax;
}

class StrokeVerifier implements IStrokeHandler {
  private _myCP: CurvePrimitive | undefined;
  private _myParent: CurvePrimitive | undefined;
  private _ck: Checker;
  public frameBuilder: FrameBuilder;
  public constructor(ck: Checker) {
    this._ck = ck;
    this._myParent = undefined;
    this._myCP = undefined;
    this.frameBuilder = new FrameBuilder();
  }
  public startCurvePrimitive(cp: CurvePrimitive): void { this._myCP = cp; }
  public announcePointTangent(xyz: Point3d, fraction: number, tangent: Vector3d): void {
    this.frameBuilder.announcePoint(xyz);
    this._ck.testTrue(this.frameBuilder.hasOrigin, "frameBuilder.hasOrigin after a point is announced");
    this.frameBuilder.announceVector(tangent);
    if (this._ck.testPointer(this._myCP)) {
      const ray = this._myCP.fractionToPointAndDerivative(fraction);
      this._ck.testPoint3d(xyz, ray.origin, "Stroke validator point");
      this._ck.testVector3d(tangent, ray.direction, "Stroke validator point");
    }
  }

  /** Announce that curve primitive cp should be evaluated in the specified fraction interval. */
  public announceIntervalForUniformStepStrokes(
    _cp: CurvePrimitive,
    _numStrokes: number,
    _fraction0: number,
    _fraction1: number): void {
    //
  }
  /** Announce numPoints interpolated between point0 and point1, with associated fractions */
  public announceSegmentInterval(
    _cp: CurvePrimitive,
    _point0: Point3d,
    _point1: Point3d,
    _numStrokes: number,
    _fraction0: number,
    _fraction1: number): void {
    //
  }
  public endCurvePrimitive(_cp: CurvePrimitive): void { this._myCP = undefined; }
  public startParentCurvePrimitive(_cp: CurvePrimitive): void {
    this._ck.testUndefined(this._myParent, "Stroker parentCurve cannot be recursive");
    this._myParent = _cp;
  }
  public endParentCurvePrimitive(_cp: CurvePrimitive): void { this._myParent = undefined; }

}

describe("EmitStrokableParts", () => {
  it("MaxEdgeLength", () => {
    const ck = new Checker();
    const curves = Sample.createSmoothCurvePrimitives();
    curves.push(LineString3d.createRectangleXY(Point3d.create(0, 0), 4, 2, true));
    for (const c of curves) {
      const ls1 = LineString3d.create();
      // const aTotal = c.curveLength();
      const options = StrokeOptions.createForCurves();
      options.maxEdgeLength = undefined;
      c.emitStrokes(ls1, options);
      const aMax = maxSegmentLength(ls1);
      options.maxEdgeLength = 0.25 * aMax;
      const ls2 = LineString3d.create();
      c.emitStrokes(ls2, options);
      const aMax2 = maxSegmentLength(ls2);
      ck.testLE(aMax2, options.maxEdgeLength, "maxEdgeLength effective for strokes", c);
      const handler = new StrokeVerifier(ck);
      c.emitStrokableParts(handler, options);
    }
    ck.checkpoint("EmitStrokableParts.MaxEdgeLength", { curves: curves.length });
    expect(ck.getNumErrors()).equals(0);
  });
});
