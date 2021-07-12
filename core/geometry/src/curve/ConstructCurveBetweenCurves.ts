/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */

import { Geometry } from "../Geometry";
import { NullGeometryHandler } from "../geometry3d/GeometryHandler";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Arc3d } from "./Arc3d";
import { GeometryQuery } from "./GeometryQuery";
import { LineSegment3d } from "./LineSegment3d";
import { LineString3d } from "./LineString3d";

/**
 * Context for constructing a curve that is interpolated between two other curves.
 * * The only callable method is the static `InterpolateBetween`.
 * * Other methods are called only by `dispatchToGeometryHandler`
 * @public
 */
export class ConstructCurveBetweenCurves extends NullGeometryHandler {
  // private geometry0: GeometryQuery;  <-- Never used
  private _geometry1: GeometryQuery;
  private _fraction: number;
  private constructor(_geometry0: GeometryQuery, _fraction: number, _geometry1: GeometryQuery) {
    super();
    // this.geometry0 = _geometry0;   <-- Never used
    this._geometry1 = _geometry1;
    this._fraction = _fraction;
  }

  /**
   * * To be directly called only by double dispatcher
   * * Assumes this.geometry1 was set by calling context.
   * * Construct the interpolated curve between this.geometry1 and the supplied segment0.
   */
  public override handleLineSegment3d(segment0: LineSegment3d): any {
    if (this._geometry1 instanceof LineSegment3d) {
      const segment1 = this._geometry1;
      return LineSegment3d.create(
        segment0.startPoint().interpolate(this._fraction, segment1.startPoint()),
        segment0.endPoint().interpolate(this._fraction, segment1.endPoint()));
    }
    return undefined;
  }
  /**
   * * To be directly called only by double dispatcher
   * * Assumes this.geometry1 was set by calling context.
   * * Construct the interpolated curve between this.geometry1 and the supplied ls0.
   */
  public override handleLineString3d(ls0: LineString3d): any {
    if (this._geometry1 instanceof LineString3d) {
      const ls1 = this._geometry1;
      if (ls0.numPoints() === ls1.numPoints()) {
        const numPoints = ls0.numPoints();
        const ls = LineString3d.create();
        const workPoint = Point3d.create();
        const workPoint0 = Point3d.create();
        const workPoint1 = Point3d.create();
        const fraction = this._fraction;
        for (let i = 0; i < numPoints; i++) {
          ls0.pointAt(i, workPoint0);
          ls1.pointAt(i, workPoint1);
          workPoint0.interpolate(fraction, workPoint1, workPoint);
          ls.addPoint(workPoint);
        }
        if (ls0.fractions && ls1.fractions) {
          for (let i = 0; i < numPoints; i++) {
            ls.addFraction(Geometry.interpolate(ls0.fractions.atUncheckedIndex(i), fraction, ls1.fractions.atUncheckedIndex(i)));
          }
        }
        if (ls0.strokeData && ls1.strokeData) {
          // Policy: simple clone of stroke count map from ls0.
          // The curveLength will not match.
          // But we expect to be called at a time compatible count and a0,a1 are the important thing.
          ls.strokeData = ls0.strokeData.clone();
        }
        if (ls0.packedDerivatives && ls1.packedDerivatives) {
          const workVector0 = Vector3d.create();
          const workVector1 = Vector3d.create();
          for (let i = 0; i < numPoints; i++) {
            ls0.packedDerivatives.getVector3dAtCheckedVectorIndex(i, workVector0);
            ls1.packedDerivatives.getVector3dAtCheckedVectorIndex(i, workVector1);
            ls.addDerivative(workVector0.interpolate(fraction, workVector1));
          }

        }
        return ls;
      }
    }
    return undefined;
  }
  /**
   * * To be directly called only by double dispatcher
   * * Assumes this.geometry1 was set by calling context.
   * * Construct the interpolated curve between this.geometry1 and the supplied arc0.
   */
  public override handleArc3d(arc0: Arc3d): any {
    if (this._geometry1 instanceof Arc3d) {
      const arc1 = this._geometry1;
      return Arc3d.create(
        arc0.center.interpolate(this._fraction, arc1.center),
        arc0.vector0.interpolate(this._fraction, arc1.vector0),
        arc0.vector90.interpolate(this._fraction, arc1.vector90),
        arc0.sweep.interpolate(this._fraction, arc1.sweep));
    }
    return undefined;
  }

  /**
   * Construct a geometry item which is fractionally interpolated between two others.
   * * The construction is only supported between certain types:
   * * * LineSegment3d+LineSegment3d -- endpoints are interpolated
   * * * LineString3d+LineString3d with matching counts.  Each point is interpolated.
   * * * Arc3d+Arc3d -- center, vector0, vector90, and limit angles of the sweep are interpolated.
   * @param geometry0 geometry "at fraction 0"
   * @param fraction  fractional position
   * @param geometry1 geometry "at fraction 1"
   */
  public static interpolateBetween(geometry0: GeometryQuery, fraction: number, geometry1: GeometryQuery): GeometryQuery | undefined {
    const handler = new ConstructCurveBetweenCurves(geometry0, fraction, geometry1);
    return geometry0.dispatchToGeometryHandler(handler);
  }
}
