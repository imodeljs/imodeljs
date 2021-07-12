/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Curve
 */

import { CurveCollection } from "../CurveCollection";
import { CurvePrimitive } from "../CurvePrimitive";
import { LineSegment3d } from "../LineSegment3d";
import { LineString3d } from "../LineString3d";
import { CloneCurvesContext } from "./CloneCurvesContext";

/**
 * Algorithmic class for cloning with linestrings expanded to line segments
 * @internal
 */
export class CloneWithExpandedLineStrings extends CloneCurvesContext {
  public constructor() {
    // we have no transform ....
    super(undefined);
  }
  // We know we have no transform !!!
  protected override doClone(primitive: CurvePrimitive): CurvePrimitive | CurvePrimitive[] | undefined {
    if (primitive instanceof LineString3d && primitive.numPoints() > 1) {
      const packedPoints = primitive.packedPoints;
      const n = packedPoints.length;
      const segments = [];
      for (let i = 0; i + 1 < n; i++) {
        segments.push(LineSegment3d.createCapture(packedPoints.getPoint3dAtUncheckedPointIndex(i), packedPoints.getPoint3dAtUncheckedPointIndex(i + 1)));
      }
      return segments;
    }
    return primitive.clone() as CurvePrimitive;
  }
  public static override clone(target: CurveCollection): CurveCollection | undefined {
    const context = new CloneWithExpandedLineStrings();
    target.announceToCurveProcessor(context);
    return context._result;
  }
}
