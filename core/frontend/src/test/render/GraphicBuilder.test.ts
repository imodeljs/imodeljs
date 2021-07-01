/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import {
  Point3d, PolyfaceBuilder, Range3d, StrokeOptions, Transform,
} from "@bentley/geometry-core";
import { ColorByName, QParams3d, QPoint3dList, RenderMode } from "@bentley/imodeljs-common";
import { GraphicBuilder, GraphicBuilderOptions, GraphicType } from "../../render/GraphicBuilder";
import { IModelApp } from "../../IModelApp";
import { IModelConnection } from "../../IModelConnection";
import { createBlankConnection } from "../createBlankConnection";
import { RenderSystem } from "../../render/RenderSystem";
import { ScreenViewport } from "../../Viewport";
import { SpatialViewState } from "../../SpatialViewState";
import { MeshArgs, MeshParams, SurfaceType } from "../../render-primitives";
import { MeshGraphic } from "../../render/webgl/Mesh";
import { InstancedGraphicParams } from "../../render/InstancedGraphicParams";

describe("GraphicBuilder", () => {
  let imodel: IModelConnection;
  let viewport: ScreenViewport;

  const viewDiv = document.createElement("div");
  viewDiv.style.width = viewDiv.style.height = "1000px";
  document.body.appendChild(viewDiv);

  before(async () => {
    await IModelApp.startup();
    imodel = createBlankConnection();
  });

  beforeEach(() => {
    const spatialView = SpatialViewState.createBlank(imodel, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    viewport = ScreenViewport.create(viewDiv, spatialView);
  });

  afterEach(() => viewport.dispose());

  after(async () => {
    await imodel.close();
    await IModelApp.shutdown();
  });

  type BuilderOpts = Omit<GraphicBuilderOptions, "viewport" | "type">;

  function makeBuilder(type: GraphicType, options: BuilderOpts): GraphicBuilder {
    return IModelApp.renderSystem.createGraphic({ type, viewport, ...options });
  }

  const graphicTypes = [GraphicType.ViewBackground, GraphicType.Scene, GraphicType.WorldDecoration, GraphicType.WorldOverlay, GraphicType.ViewOverlay];

  describe("generates normals", () => {
    function expectNormals(type: GraphicType, options: BuilderOpts, expected: boolean): void {
      const builder = makeBuilder(type, options);
      expect(builder.wantNormals).to.equal(expected);
    }

    it("for scene graphics only by default", () => {
      for (const type of graphicTypes)
        expectNormals(type, {}, type === GraphicType.Scene);
    });

    it("always if generating edges", () => {
      expect(viewport.viewFlags.edgesRequired()).to.be.true;
      for (const type of graphicTypes) {
        expectNormals(type, { generateEdges: true }, true);
        expectNormals(type, { generateEdges: false }, type === GraphicType.Scene);
        expectNormals(type, { generateEdges: true, wantNormals: false }, false);
      }
    });

    it("always if explicitly requested", () => {
      for (const type of graphicTypes)
        expectNormals(type, { wantNormals: true }, true);
    });

    it("never if explicitly specified", () => {
      for (const type of graphicTypes)
        expectNormals(type, { wantNormals: false }, false);
    });
  });

  describe("generates edges", () => {
    function expectEdges(type: GraphicType, options: BuilderOpts, expected: boolean): void {
      const builder = makeBuilder(type, options);
      expect(builder.wantEdges).to.equal(expected);
    }

    it("by default only for scene graphics, if view flags require them", () => {
      expect(viewport.viewFlags.edgesRequired()).to.be.true;
      for (const type of graphicTypes)
        expectEdges(type, {}, type === GraphicType.Scene);
    });

    it("never, if view flags do not require them", () => {
      const vf = viewport.viewFlags.clone();
      vf.renderMode = RenderMode.SmoothShade;
      vf.visibleEdges = false;
      viewport.viewFlags = vf;
      expect(viewport.viewFlags.edgesRequired()).to.be.false;

      for (const type of graphicTypes)
        expectEdges(type, {}, false);
    });

    it("always if explicitly requested", () => {
      for (const type of graphicTypes)
        expectEdges(type, { generateEdges: true }, true);
    });

    it("never if explicitly specified", () => {
      for (const type of graphicTypes)
        expectEdges(type, { generateEdges: false }, false);
    });
  });

  describe("createTriMesh", () => {
    it("should create a simple mesh graphic", () => {
      const args = new MeshArgs();

      const points = [new Point3d(0, 0, 0), new Point3d(10, 0, 0), new Point3d(0, 10, 0)];
      args.points = new QPoint3dList(QParams3d.fromRange(Range3d.createArray(points)));
      for (const point of points)
        args.points.add(point);

      args.vertIndices = [0, 1, 2];
      args.colors.initUniform(ColorByName.tan);

      const graphic = IModelApp.renderSystem.createTriMesh(args);
      expect(graphic).not.to.be.undefined;
    });
  });

  describe("createMesh", () => {
    let renderSystemCreateMesh: typeof RenderSystem.prototype.createMesh;
    let createMeshInvoked = false;

    afterEach(() => {
      if (renderSystemCreateMesh)
        IModelApp.renderSystem.createMesh = renderSystemCreateMesh; // eslint-disable-line @typescript-eslint/unbound-method
    });

    function overrideCreateMesh(verifyParams?: (params: MeshParams) => void, verifyGraphic?: (graphic: MeshGraphic) => void): void {
      if (!renderSystemCreateMesh)
        renderSystemCreateMesh = IModelApp.renderSystem.createMesh; // eslint-disable-line @typescript-eslint/unbound-method

      createMeshInvoked = false;

      // eslint-disable-next-line @typescript-eslint/unbound-method
      IModelApp.renderSystem.createMesh = (params: MeshParams, instances?: InstancedGraphicParams) => {
        createMeshInvoked = true;
        if (verifyParams)
          verifyParams(params);

        const graphic = renderSystemCreateMesh.apply(IModelApp.renderSystem, [params, instances]) as MeshGraphic;
        expect(graphic).instanceof(MeshGraphic);
        if (verifyGraphic)
          verifyGraphic(graphic);

        return graphic;
      };
    }

    function injectNormalsCheck(expectNormals: boolean): void {
      const verifyParams = (params: MeshParams) => {
        expect(params.vertices.numRgbaPerVertex).to.equal(expectNormals ? 4 : 3);
      };
      const verifyGraphic = (graphic: MeshGraphic) => {
        expect(graphic.meshData.type).to.equal(expectNormals ? SurfaceType.Lit : SurfaceType.Unlit);
      };

      overrideCreateMesh(verifyParams, verifyGraphic);
    }

    function createTriangle(): Point3d[] {
      return [ new Point3d(0, 0, 0), new Point3d(100, 0, 0), new Point3d(0, 100, 0) ];
    }

    it("should preserve polyface normals", () => {
      const test = (wantNormals: boolean, requestNormals: boolean) => {
        // Currently there's no API for generating normals for a Polyface.
        // If normals are present and wanted, use them.
        // If present and unwanted, ignore them.
        // If wanted but not present, no normals until such an API is provided.
        injectNormalsCheck(wantNormals && requestNormals);
        expect(createMeshInvoked).to.be.false;

        const options = StrokeOptions.createForFacets();
        options.needNormals = wantNormals;
        const pfBuilder = PolyfaceBuilder.create(options);
        pfBuilder.addTriangleFacet(createTriangle());

        const gfBuilder = IModelApp.renderSystem.createGraphicBuilder(Transform.createIdentity(), GraphicType.WorldDecoration, viewport);
        gfBuilder.wantNormals = requestNormals; // should have no effect - normals come from polyface only, we don't generate them.
        gfBuilder.addPolyface(pfBuilder.claimPolyface(), false);
        const gf = gfBuilder.finish();
        gf.dispose();
        expect(createMeshInvoked).to.be.true;
      };

      test(false, false);
      test(true, true);
      test(false, true);
      test(true, false);
    });

    it("should generate normals for shapes if requested", () => {
      const test = (wantNormals: boolean) => {
        injectNormalsCheck(wantNormals);
        expect(createMeshInvoked).to.be.false;

        const builder = IModelApp.renderSystem.createGraphicBuilder(Transform.createIdentity(), GraphicType.WorldDecoration, viewport);
        builder.wantNormals = wantNormals;
        builder.addShape(createTriangle());
        const gf = builder.finish();
        gf.dispose();
        expect(createMeshInvoked).to.be.true;
      };

      test(false);
      test(true);
    });
  });
});
