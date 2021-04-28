/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Point2d } from "@bentley/geometry-core";
import { ColorIndex, FeatureIndexType, QParams2d, QParams3d, QPoint3d, QPoint3dList, RenderTexture } from "@bentley/imodeljs-common";
import { MockRender } from "../../../render/MockRender";
import { MeshArgs } from "../../../render/primitives/mesh/MeshPrimitives";
import { MeshParams } from "../../../render/primitives/VertexTable";

function expectMeshParams(args: MeshArgs, colorIndex: ColorIndex, vertexBytes: number[][], expectedColors?: number[], quvParams?: QParams2d) {
  const params = MeshParams.create(args);

  // Compare vertex table bytes
  const data = params.vertices.data;
  let dataIndex = 0;
  for (const bytes of vertexBytes) {
    for (const byte of bytes) {
      expect(data[dataIndex++]).to.equal(byte);
    }
  }

  // Compare appended color table
  expect(undefined === colorIndex.nonUniform).to.equal(undefined === expectedColors);
  if (undefined !== expectedColors) {
    expect(expectedColors.length).to.equal(colorIndex.nonUniform!.colors.length * 4);

    for (const color of expectedColors) {
      expect(data[dataIndex++]).to.equal(color);
    }
  }

  if (undefined !== quvParams) {
    const compParams = params.vertices.uvParams!;
    expect(compParams).not.to.be.undefined;
    expect(quvParams.origin.x).to.equal(compParams.origin.x);
    expect(quvParams.origin.y).to.equal(compParams.origin.y);
    expect(quvParams.scale.x).to.equal(compParams.scale.x);
    expect(quvParams.scale.y).to.equal(compParams.scale.y);
  }
}

class FakeTexture extends RenderTexture {
  public constructor() { super(RenderTexture.Params.defaults); }
  public dispose() { }
  public get bytesUsed(): number { return 0; }
}

describe("VertexLUT", () => {
  before(async () => {
    await MockRender.App.startup();
  });
  after(async () => MockRender.App.shutdown());

  it("should produce correct VertexLUT.Params from MeshArgs", () => {
    // Make a mesh consisting of a single triangle.
    const positions = new QPoint3dList(QParams3d.fromZeroToOne());
    positions.push(QPoint3d.fromScalars(0, 1, 2));
    positions.push(QPoint3d.fromScalars(0x7fff, 0xf00d, 0xc001));
    positions.push(QPoint3d.fromScalars(0xbaad, 0, 0xffff));

    // Test simple unlit vertices (no normals or uv params; uniform colors + features)
    const args = new MeshArgs();
    args.points = positions;
    args.vertIndices = [0, 1, 2];

    const expected = [
      [
        0x00, 0x00, 0x01, 0x00, // pos.x, pos.y
        0x02, 0x00, 0x00, 0x00, // pos.z, color index
        0x00, 0x00, 0x00, 0x00, // feature index
      ],
      [
        0xff, 0x7f, 0x0d, 0xf0,
        0x01, 0xc0, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
      [
        0xad, 0xba, 0x00, 0x00,
        0xff, 0xff, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
    ];

    expectMeshParams(args, args.colors, expected);

    // Add uv params
    args.texture = new FakeTexture();
    args.textureUv = [];
    args.textureUv.push(new Point2d(-1, 1));  // 0, 0xffff
    args.textureUv.push(new Point2d(1, 0));   // 0xffff, 0x8000
    args.textureUv.push(new Point2d(0, -1));  // 0x8000, 0

    expected[0].push(0x00); expected[0].push(0x00); expected[0].push(0xff); expected[0].push(0xff);
    expected[1].push(0xff); expected[1].push(0xff); expected[1].push(0x00); expected[1].push(0x80);
    expected[2].push(0x00); expected[2].push(0x80); expected[2].push(0x00); expected[2].push(0x00);

    const qUVParams = QParams2d.fromNormalizedRange();
    expectMeshParams(args, args.colors, expected, undefined, qUVParams);

    // Add feature IDs
    args.features.type = FeatureIndexType.NonUniform;
    args.features.featureIDs = new Uint32Array(3);
    args.features.featureIDs[0] = 0xbaadf00d;
    args.features.featureIDs[1] = 0xc001bead;
    args.features.featureIDs[2] = 0;

    expected[0][8] = 0x0d; expected[0][9] = 0xf0; expected[0][10] = 0xad; expected[0][11] = 0xba;
    expected[1][8] = 0xad; expected[1][9] = 0xbe; expected[1][10] = 0x01; expected[1][11] = 0xc0;

    expectMeshParams(args, args.colors, expected);

    // Remove uv params
    args.texture = undefined;
    for (const arr of expected) {
      arr.splice(12);
    }

    // Add non-uniform color.
    const colors = new Uint32Array(3);
    colors[0] = 0xffeeddcc;
    colors[1] = 0x00010203;
    colors[2] = 0x7f00ff00;
    const colorIndices = [0, 0x0001, 0xffee];
    args.colors.initNonUniform(colors, colorIndices, true);

    expected[0][6] = 0x00; expected[0][7] = 0x00;
    expected[1][6] = 0x01; expected[1][7] = 0x00;
    expected[2][6] = 0xee; expected[2][7] = 0xff;

    // NB: The color values in VertexLUT.Params have premultiplied alpha, and alpha set to (255 - transparency)
    const expectedColors = [
      0x00, 0x00, 0x00, 0x00,
      0x03, 0x02, 0x01, 0xff,
      0x00, 0x80, 0x00, 0x80,
    ];

    expectMeshParams(args, args.colors, expected, expectedColors);
  });
});
