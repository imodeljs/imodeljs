/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */
import { RecurseToCurvesGeometryHandler } from "../../geometry3d/GeometryHandler";
import { PlaneAltitudeEvaluator } from "../../Geometry";
import { Range1d } from "../../geometry3d/Range";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { LineSegment3d } from "../LineSegment3d";
import { LineString3d } from "../LineString3d";
import { GrowableXYZArray } from "../../geometry3d/GrowableXYZArray";
import { Arc3d } from "../Arc3d";
import { SineCosinePolynomial } from "../../numerics/Polynomials";
import { GeometryQuery } from "../GeometryQuery";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/Plane3dByOriginAndUnitNormal";
import { BSplineCurve3d } from "../../bspline/BSplineCurve";
import { BSplineCurve3dH } from "../../bspline/BSplineCurve3dH";

/**
 * Accumulator context for searching for extrema of geometry along a plane.
 * @internal
 */
export class PlaneAltitudeRangeContext extends RecurseToCurvesGeometryHandler {
  public plane: PlaneAltitudeEvaluator;
  public range: Range1d;
  public lowPoint: Point3d | undefined;
  public highPoint: Point3d | undefined;
  private constructor(plane: PlaneAltitudeEvaluator) {
    super();
    this.plane = plane;
    this.range = Range1d.createNull();
    this.resetRange();
  }

  public resetRange() {
    this.range.setNull();
  }

  public announcePoint(point: Point3d) {
    const h = this.plane.altitude(point);
    if (this.range.extendLow(h))
      this.lowPoint = point.clone(this.lowPoint);
    if (this.range.extendHigh(h))
      this.highPoint = point.clone(this.highPoint);
  }

  public announcePoints(points: GrowableXYZArray) {
    for (let i = 0; i < points.length; i++) {
      const h = points.evaluateUncheckedIndexPlaneAltitude(i, this.plane);
      if (this.range.extendLow(h))
        this.lowPoint = points.getPoint3dAtUncheckedPointIndex(i, this.lowPoint);
      if (this.range.extendHigh(h))
        this.highPoint = points.getPoint3dAtUncheckedPointIndex(i, this.highPoint);
    }
  }

  public static createCapture(plane: PlaneAltitudeEvaluator): PlaneAltitudeRangeContext {
    const context = new PlaneAltitudeRangeContext(plane);
    return context;
  }

  public override handleLineSegment3d(segment: LineSegment3d) {
    this.announcePoint(segment.point0Ref);
    this.announcePoint(segment.point1Ref);
  }

  public override handleLineString3d(lineString: LineString3d) {
    this.announcePoints(lineString.packedPoints);
  }

  public override handleBSplineCurve3d(bcurve: BSplineCurve3d) {
    // ugh.   The point MUST be on the curve -- usual excess-range of poles is not ok.
    const ls = LineString3d.create();
    bcurve.emitStrokes(ls);
    this.handleLineString3d(ls);
  }
  public override handleBSplineCurve3dH(bcurve: BSplineCurve3dH) {
    // ugh.   The point MUST be on the curve -- usual excess-range of poles is not ok.
    const ls = LineString3d.create();
    bcurve.emitStrokes(ls);
    this.handleLineString3d(ls);
  }

  private _sineCosinePolynomial?: SineCosinePolynomial;
  private _workPoint?: Point3d;
  public override handleArc3d(g: Arc3d) {
    this._sineCosinePolynomial = g.getPlaneAltitudeSineCosinePolynomial(this.plane, this._sineCosinePolynomial);
    let radians = this._sineCosinePolynomial.referenceMinMaxRadians();
    if (g.sweep.isRadiansInSweep(radians))
      this.announcePoint((this._workPoint = g.radiansToPoint(radians, this._workPoint)));
    radians += Math.PI;
    if (g.sweep.isRadiansInSweep(radians))
      this.announcePoint((this._workPoint = g.radiansToPoint(radians, this._workPoint)));
    this.announcePoint((this._workPoint = g.startPoint(this._workPoint)));
    this.announcePoint((this._workPoint = g.endPoint(this._workPoint)));
  }
  public static findExtremePointsInDirection(geometry: GeometryQuery, direction: Vector3d): Point3d[] | undefined {
    const plane = Plane3dByOriginAndUnitNormal.create(Point3d.create(0, 0, 0), direction);
    if (plane) {
      const context = new PlaneAltitudeRangeContext(plane);
      geometry.dispatchToGeometryHandler(context);
      if (context.highPoint && context.lowPoint)
        return [context.lowPoint, context.highPoint];
    }
    return undefined;
  }
}
