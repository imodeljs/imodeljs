/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Curve
 */

import { NullGeometryHandler } from "../../geometry3d/GeometryHandler";
import { Point3d } from "../../geometry3d/Point3dVector3d";
import { PolylineCompressionContext } from "../../geometry3d/PolylineCompressionByEdgeOffset";
import { PolylineOps } from "../../geometry3d/PolylineOps";
import { Arc3d } from "../Arc3d";
import { ConsolidateAdjacentCurvePrimitivesOptions, CurveChain } from "../CurveCollection";
import { CurveFactory } from "../CurveFactory";
import { LineSegment3d } from "../LineSegment3d";
import { LineString3d } from "../LineString3d";
import { Loop } from "../Loop";
import { Path } from "../Path";
import { ParityRegion } from "../ParityRegion";

/**
 * * Implementation class for ConsolidateAdjacentCurvePrimitives.
 *
 * @internal
 */
export class ConsolidateAdjacentCurvePrimitivesContext extends NullGeometryHandler {
  private _options: ConsolidateAdjacentCurvePrimitivesOptions;
  public constructor(options?: ConsolidateAdjacentCurvePrimitivesOptions) {
    super();
    this._options = options ? options : new ConsolidateAdjacentCurvePrimitivesOptions();
  }
  /** look for adjacent compatible primitives in a path or loop. */
  public handleCurveChain(g: CurveChain) {
    const children = g.children;
    const numOriginal = children.length;
    const points: Point3d[] = [];
    let numAccept = 0;
    // i0 <=i < i1 is a range of child indices.
    // numAccept is the number of children accepted (contiguously at front of children)
    for (let i0 = 0; i0 < numOriginal;) {
      const basePrimitive = g.children[i0];
      if (this._options.consolidateLinearGeometry && (basePrimitive instanceof LineSegment3d || basePrimitive instanceof LineString3d)) {
        points.length = 0;
        let i1 = i0;
        // on exit, i1 is beyond the block of linear primitives  . ..
        for (; i1 < g.children.length; i1++) {
          const nextPrimitive = g.children[i1];
          if (nextPrimitive instanceof LineSegment3d) {
            points.push(nextPrimitive.startPoint());
            points.push(nextPrimitive.endPoint());
          } else if (nextPrimitive instanceof LineString3d) {
            const source = nextPrimitive.packedPoints;
            for (let k = 0; k < source.length; k++) {
              points.push(source.getPoint3dAtUncheckedPointIndex(k));
            }
          } else {
            break;
          }
        }
        if (points.length > 1) {
          const tolerance = this._options.colinearPointTolerance;
          const compressedPointsA = PolylineOps.compressShortEdges(points, tolerance);
          const compressedPointsB = PolylineOps.compressByPerpendicularDistance(compressedPointsA, tolerance);
          if (i0 === 0 && i1 === numOriginal) {
            // points is the entire curve, and the curve is closed.   Maybe the first and last segments are colinear.
            PolylineCompressionContext.compressColinearWrapInPlace(compressedPointsB, tolerance);
          }
          if (compressedPointsB.length < 2) {
            // Collapsed to a point?  Make a single point linestring
            g.children[numAccept++] = LineString3d.create(compressedPointsB[0]);
          } else if (compressedPointsB.length === 2) {
            g.children[numAccept++] = LineSegment3d.create(compressedPointsB[0], compressedPointsB[1]);
          } else {
            g.children[numAccept++] = LineString3d.createPoints(compressedPointsB);
          }
        } else {
          g.children[numAccept++] = basePrimitive;
        }
        i0 = i1;
      } else if (this._options.consolidateCompatibleArcs && basePrimitive instanceof Arc3d) {
        // subsume subsequent arcs into basePrimitive.
        // always accept base primitive.
        for (; ++i0 < g.children.length;) {
          const nextPrimitive = g.children[i0];
          if (!(nextPrimitive instanceof Arc3d))
            break;
          if (!CurveFactory.appendToArcInPlace(basePrimitive, nextPrimitive))
            break;
        }
        // i0 has already advanced
        g.children[numAccept++] = basePrimitive;    // which has been extended 0 or more times.
      } else {
        g.children[numAccept++] = basePrimitive;
        i0++;
      }
    }
    g.children.length = numAccept;
  }

  public override handlePath(g: Path): any { return this.handleCurveChain(g); }
  public override handleLoop(g: Loop): any { return this.handleCurveChain(g); }
  public override handleParityRegion(g: ParityRegion): any {
    for (const child of g.children)
      child.dispatchToGeometryHandler(this);
  }
}
