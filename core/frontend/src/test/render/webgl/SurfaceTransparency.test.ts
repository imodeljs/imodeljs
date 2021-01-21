/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Guid } from "@bentley/bentleyjs-core";
import { Point2d, Point3d, Range3d, Vector3d } from "@bentley/geometry-core";
import {
  Cartographic, ColorDef, ImageBuffer, ImageBufferFormat, QParams3d, QPoint3dList, RenderMaterial, RenderMode, RenderTexture, TextureMapping,
} from "@bentley/imodeljs-common";
import { RenderGraphic } from "../../../render/RenderGraphic";
import { createRenderPlanFromViewport } from "../../../render/RenderPlan";
import { IModelApp } from "../../../IModelApp";
import { BlankConnection } from "../../../IModelConnection";
import { SpatialViewState } from "../../../SpatialViewState";
import { ScreenViewport } from "../../../Viewport";
import { Target } from "../../../render/webgl/Target";
import { Primitive } from "../../../render/webgl/Primitive";
import { RenderPass } from "../../../render/webgl/RenderFlags";
import { MeshGraphic, SurfaceGeometry } from "../../../render/webgl/Mesh";
import { MeshArgs } from "../../../render/primitives/mesh/MeshPrimitives";
import { MeshParams } from "../../../render/primitives/VertexTable";

function createMesh(transparency: number, mat?: RenderMaterial | RenderTexture): RenderGraphic {
  const args = new MeshArgs();
  args.colors.initUniform(ColorDef.from(255, 0, 0, transparency));

  if (mat instanceof RenderMaterial) {
    args.material = mat;
    args.texture = args.material.textureMapping?.texture;
  } else {
    args.texture = mat;
  }

  if (args.texture)
    args.textureUv = [ new Point2d(0, 1), new Point2d(1, 1), new Point2d(0, 0), new Point2d(1, 0) ];

  const points = [ new Point3d(0, 0, 0), new Point3d(1, 0, 0), new Point3d(0, 1, 0), new Point3d(1, 1, 0) ];
  args.points = new QPoint3dList(QParams3d.fromRange(Range3d.createXYZXYZ(0, 0, 0, 1, 1, 1)));
  for (const point of points)
    args.points.add(point);

  args.vertIndices = [0, 1, 2, 2, 1, 3];
  args.isPlanar = true;

  const params = MeshParams.create(args);
  return IModelApp.renderSystem.createMesh(params)!;
}

describe("Surface transparency", () => {
  let imodel: BlankConnection;
  let viewport: ScreenViewport;
  let opaqueTexture: RenderTexture;
  let translucentTexture: RenderTexture;
  let opaqueMaterial: RenderMaterial;
  let translucentMaterial: RenderMaterial;

  const viewDiv = document.createElement("div");
  viewDiv.style.width = viewDiv.style.height = "100px";
  document.body.appendChild(viewDiv);

  before(async () => {
    await IModelApp.startup();

    const exton = Cartographic.fromDegrees(-75.686694, 40.065757, 0);
    imodel = BlankConnection.create({
      name: "test",
      location: exton,
      extents: new Range3d(-1000, -1000, -100, 1000, 1000, 100),
      contextId: Guid.createValue(),
    });

    const opaqueImage = ImageBuffer.create(new Uint8Array([255, 255, 255]), ImageBufferFormat.Rgb, 1);
    opaqueTexture = IModelApp.renderSystem.createTextureFromImageBuffer(opaqueImage, imodel, new RenderTexture.Params(imodel.transientIds.next))!;
    expect(opaqueTexture).not.to.be.undefined;

    const translucentImage = ImageBuffer.create(new Uint8Array([255, 255, 255, 127]), ImageBufferFormat.Rgba, 1);
    translucentTexture = IModelApp.renderSystem.createTextureFromImageBuffer(translucentImage, imodel, new RenderTexture.Params(imodel.transientIds.next))!;
    expect(translucentTexture).not.to.be.undefined;

    opaqueMaterial = createMaterial(1);
    translucentMaterial = createMaterial(0.5);
  });

  beforeEach(() => {
    const view = SpatialViewState.createBlank(imodel, new Point3d(), new Vector3d(1, 1, 1));
    view.viewFlags.renderMode = RenderMode.SmoothShade;
    viewport = ScreenViewport.create(viewDiv, view);
  });

  afterEach(() => {
    viewport.dispose();
  });

  after(async () => {
    if (imodel)
      await imodel.close();

    await IModelApp.shutdown();
  });

  function createMaterial(alpha?: number, texture?: RenderTexture, textureWeight?: number): RenderMaterial {
    const params = new RenderMaterial.Params();
    params.alpha = alpha;
    if (texture)
      params.textureMapping = new TextureMapping(texture, new TextureMapping.Params({ textureWeight }));

    const material = IModelApp.renderSystem.createMaterial(params, imodel);
    expect(material).not.to.be.undefined;
    return material!;
  }

  type SetupFunc = (view: SpatialViewState) => RenderGraphic;

  function expectRenderPass(pass: RenderPass.Translucent | RenderPass.OpaquePlanar, setup: SetupFunc): void {
    const graphic = setup(viewport.view as SpatialViewState);

    const mesh = graphic as MeshGraphic;
    expect(mesh).instanceof(MeshGraphic);
    const primitive = (mesh as any)._primitives[0] as Primitive;
    expect(primitive).instanceof(Primitive);
    expect(primitive.cachedGeometry).instanceof(SurfaceGeometry);

    const plan = createRenderPlanFromViewport(viewport);
    viewport.target.changeRenderPlan(plan);
    expect(primitive.getRenderPass(viewport.target as Target)).to.equal(pass);
  }

  function expectOpaque(setup: SetupFunc): void {
    expectRenderPass(RenderPass.OpaquePlanar, setup);
  }

  function expectTranslucent(setup: SetupFunc): void {
    expectRenderPass(RenderPass.Translucent, setup);
  }

  it("uses base transparency", () => {
    expectOpaque(() => createMesh(0));
    expectTranslucent(() => createMesh(255));
    expectTranslucent(() => createMesh(127));
  });

  it("uses material transparency if overridden", () => {
    expectOpaque(() => createMesh(0, opaqueMaterial));
    expectTranslucent(() => createMesh(127, translucentMaterial));
    expectOpaque(() => createMesh(127, opaqueMaterial));
    expectTranslucent(() => createMesh(0, translucentMaterial));
  });

  it("uses base transparency if not overridden by material", () => {
    const noAlphaMaterial = createMaterial();
    expectOpaque(() => createMesh(0, noAlphaMaterial));
    expectTranslucent(() => createMesh(127, noAlphaMaterial));
  });

  it("uses base transparency if materials are disabled", () => {
    viewport.viewFlags.materials = false;
    expectOpaque(() => createMesh(0, opaqueMaterial));
    expectOpaque(() => createMesh(0, translucentMaterial));
    expectTranslucent(() => createMesh(127, opaqueMaterial));
    expectTranslucent(() => createMesh(127, translucentMaterial));
  });

  it("uses texture transparency", () => {
    expectOpaque(() => createMesh(0, opaqueTexture));
    expectOpaque(() => createMesh(127, opaqueTexture));
    expectTranslucent(() => createMesh(0, translucentTexture));
    expectTranslucent(() => createMesh(127, translucentTexture));
  });

  it("uses combination of material and texture transparency", () => {
    const m1 = createMaterial(1, opaqueTexture);
    const m2 = createMaterial(0.5, opaqueTexture);
    const m3 = createMaterial(0.5, translucentTexture);
    const m4 = createMaterial(1, translucentTexture);

    expectOpaque(() => createMesh(0, m1));
    expectOpaque(() => createMesh(127, m1));
    expectTranslucent(() => createMesh(0, m2));
    expectTranslucent(() => createMesh(127, m2));
    expectTranslucent(() => createMesh(0, m3));
    expectTranslucent(() => createMesh(127, m3));
    expectTranslucent(() => createMesh(0, m4));
    expectTranslucent(() => createMesh(127, m4));
  });

  it("ignores texture transparency if textures are disabled", () => {
    viewport.viewFlags.textures = false;
  });

  it("ignores material and texture transparency if both view flags are disabled", () => {
  });
});
