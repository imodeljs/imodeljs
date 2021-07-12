/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Arc3d } from "../../curve/Arc3d";
import { LineString3d } from "../../curve/LineString3d";
import { Path } from "../../curve/Path";
import { StrokeOptions } from "../../curve/StrokeOptions";
import { Point3d, Vector3d } from "../../geometry3d/Point3dVector3d";
import { Transform } from "../../geometry3d/Transform";
import { AuxChannel, AuxChannelData, AuxChannelDataType, PolyfaceAuxData } from "../../polyface/AuxData";
import { PolyfaceBuilder } from "../../polyface/PolyfaceBuilder";
import { IModelJson } from "../../serialization/IModelJsonSchema";
import { Checker } from "../Checker";

/** Create a polyface representing a cantilever beam with [[PolyfaceAuxData]] representing the stress and deflection. */
function createCantileverBeamPolyface(beamRadius: number = 10.0, beamLength: number = 100.0, facetSize: number = 1.0, zScale: number = 1.0) {

  const builder = PolyfaceBuilder.create();
  const crossSectionArc = Arc3d.create(Point3d.createZero(), Vector3d.create(0.0, beamRadius, 0.0), Vector3d.create(0.0, 0.0, beamRadius));
  const strokedCrossSection = LineString3d.create();
  const strokeOptions = StrokeOptions.createForCurves();
  strokeOptions.maxEdgeLength = facetSize;
  crossSectionArc.emitStrokes(strokedCrossSection, strokeOptions);
  // pack as a singleton path to touch "else"
  const path = Path.create(strokedCrossSection);
  for (let x = 0.0; x < beamLength; x += facetSize)
    builder.addBetweenTransformedLineStrings(path, Transform.createTranslationXYZ(x, 0.0, 0.0), Transform.createTranslationXYZ(x + facetSize, 0.0, 0.0), true);

  const polyface = builder.claimPolyface();
  const heightData: number[] = [];

  const scratchPoint = Point3d.create();
  for (let i = 0; i < polyface.data.point.length; i++) {
    const point = polyface.data.point.getPoint3dAtCheckedPointIndex(i, scratchPoint) as Point3d;
    heightData.push(point.z * zScale);
  }
  const heightChannel = new AuxChannel([new AuxChannelData(0.0, heightData)], AuxChannelDataType.Distance, "Height", "");

  polyface.data.auxData = new PolyfaceAuxData([heightChannel], polyface.data.pointIndex);

  return polyface;
}
// ---------------------------------------------------------------------------------------------------

describe("PolyfaceAuxData", () => {
  it("testRoundTrip", () => {
    const ck = new Checker();
    const beam = createCantileverBeamPolyface();

    const writer = new IModelJson.Writer();

    const json = writer.emit(beam);
    const roundTrippedBeam = IModelJson.Reader.parse(json);

    ck.testTrue(beam.isAlmostEqual(roundTrippedBeam));
    expect(ck.getNumErrors()).equals(0);
  });

  it("CreateAuxChannelData", () => {
    const ck = new Checker();
    const auxData0 = new AuxChannelData(1, [10, 11, 12]);
    const auxData1 = auxData0.clone();
    const auxData10 = new AuxChannelData(2, [10, 11, 12]);
    const auxData11 = new AuxChannelData(2, [10, 11, 12, 13]);
    const auxData12 = new AuxChannelData(2, [10, 21, 12]);
    ck.testTrue(auxData0.isAlmostEqual(auxData1, 1.0e-5));
    ck.testFalse(auxData0.isAlmostEqual(auxData10));
    ck.testFalse(auxData0.isAlmostEqual(auxData11));
    ck.testFalse(auxData0.isAlmostEqual(auxData12));

    expect(ck.getNumErrors()).equals(0);
  });
  it("CreateAuxChannel", () => {
    const ck = new Checker();
    const data00 = new AuxChannelData(0, [1, 2, 3]);
    const data10 = new AuxChannelData(10, [11, 12, 13]);
    const data20 = new AuxChannelData(20, [21, 22, 25]);
    const data20B = new AuxChannelData(20, [21, 22, 26]);
    const channel0 = new AuxChannel([data00, data10, data20],
      AuxChannelDataType.Distance,
      "MyDistances",
      "MicrometerA");

    const channelA = new AuxChannel([data00, data10],
      AuxChannelDataType.Distance,
      "MyDistancesA",
      "MicrometerA");

    const channelB = new AuxChannel([data00, data20, data10],
      AuxChannelDataType.Distance,
      "MyDistancesB",
      "MicrometerA");

    const channelC = new AuxChannel([data00, data20, data10],
      AuxChannelDataType.Distance,
      "MyDistancesC",
      "MicrometerA");
    const channelD = new AuxChannel([data00, data20B, data10],
      AuxChannelDataType.Distance,
      "MyDistancesC",
      "MicrometerA");

    const channel1 = channel0.clone();
    ck.testTrue(channel0.isAlmostEqual(channel0));
    ck.testTrue(channel0.isAlmostEqual(channel1));

    ck.testFalse(channel0.isAlmostEqual(channelA));
    ck.testFalse(channel0.isAlmostEqual(channelB));
    ck.testFalse(channel0.isAlmostEqual(channelC));
    ck.testFalse(channelD.isAlmostEqual(channelC));

    ck.testExactNumber(data00.values.length, channel0.valueCount);
    const range00 = channel0.scalarRange!;
    ck.testTrue(range00.containsX(12), "channel range");
    ck.testFalse(range00.containsX(100), "channel range");

    for (const channelType of [AuxChannelDataType.Normal, AuxChannelDataType.Vector]) {
      const vectorData = new AuxChannelData(1, [10, 11, 12, 20, 21, 22, 30, 31, 32]);
      const vectorChannel = new AuxChannel([vectorData], channelType, "vector or normal data", "inputB");
      ck.testFalse(vectorChannel.isScalar, "vector type");
      ck.testUndefined(vectorChannel.scalarRange, "no scalarRange on vector channel");
      ck.testExactNumber(vectorChannel.entriesPerValue, 3, "3 members in vector data");
    }
    expect(ck.getNumErrors()).equals(0);
  });

  it("CreatePolyfaceAuxData", () => {
    const ck = new Checker();
    const beam = createCantileverBeamPolyface(10, 100, 1);
    const beam1 = createCantileverBeamPolyface(20, 25, 0.5);
    const beam2 = createCantileverBeamPolyface(20, 25, 0.5, 4.0);
    const auxDataA = beam.data.auxData;
    ck.testFalse(PolyfaceAuxData.isAlmostEqual(auxDataA, undefined));
    ck.testFalse(PolyfaceAuxData.isAlmostEqual(undefined, auxDataA));
    if (ck.testPointer(auxDataA)) {
      const auxDataB = beam.data.auxData!.clone();
      ck.testTrue(auxDataA.isAlmostEqual(auxDataB), "cloned PpolyfaceAuxData");
      ck.testFalse(auxDataA.isAlmostEqual(beam1.data.auxData!, 1.0e-9));
    }
    ck.testFalse(beam1.isAlmostEqual(beam2));
    expect(ck.getNumErrors()).equals(0);
  });

});
