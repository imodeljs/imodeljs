/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Checker } from "../Checker";
import { Sample } from "../../serialization/GeometrySamples";
import { AkimaCurve3d } from "../../bspline/AkimaCurve3d";
import { GeometryCoreTestIO } from "../GeometryCoreTestIO";
import { GeometryQuery } from "../../curve/GeometryQuery";
import { testGeometryQueryRoundTrip } from "../serialization/FlatBuffer.test";

/* eslint-disable no-console */

describe("AkimaCurve3d", () => {
  it("HelloWorld", () => {
    const ck = new Checker();
    const allGeometry: GeometryQuery[] = [];
    const circlePoints = Sample.createUnitCircle(8);
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, circlePoints, 0, 0, 0);

    const curve = AkimaCurve3d.create({ fitPoints: circlePoints });
    ck.testDefined(curve);
    GeometryCoreTestIO.captureCloneGeometry(allGeometry, curve, 0, 0, 0);
    testGeometryQueryRoundTrip(ck, curve);
    GeometryCoreTestIO.saveGeometry(allGeometry, "AkimaCurve3d", "HelloWorld");
    expect(ck.getNumErrors()).equals(0);
  });
});
