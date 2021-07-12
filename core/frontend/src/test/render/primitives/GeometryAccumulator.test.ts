/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import { LineString3d, Loop, Path, Point3d, Range3d, Transform } from "@bentley/geometry-core";
import { ColorDef, GraphicParams } from "@bentley/imodeljs-common";
import { IModelApp } from "../../../IModelApp";
import { IModelConnection } from "../../../IModelConnection";
import { RenderGraphic } from "../../../render/RenderGraphic";
import { StandardViewId } from "../../../StandardView";
import { SpatialViewState } from "../../../SpatialViewState";
import { Branch } from "../../../render/webgl/Graphic";
import { createBlankConnection } from "../../createBlankConnection";
import { FakeGeometry } from "./Fake";
import { DisplayParams, GenerateEdges, Geometry, GeometryAccumulator, GeometryOptions } from "../../../render-primitives";

describe("GeometryAccumulator tests", () => {
  let iModel: IModelConnection;
  let spatialView: SpatialViewState;
  let accum: GeometryAccumulator;

  const canvas = document.createElement("canvas");
  assert(null !== canvas);
  canvas.width = canvas.height = 1000;
  document.body.appendChild(canvas);

  before(async () => {
    await IModelApp.startup();
    iModel = createBlankConnection();
    spatialView = SpatialViewState.createBlank(iModel, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    spatialView.setStandardRotation(StandardViewId.RightIso);
  });

  after(async () => {
    if (iModel) await iModel.close();
    await IModelApp.shutdown();
  });

  it("addPath works as expected", () => {
    accum = new GeometryAccumulator({ iModel });

    const points: Point3d[] = [];
    points.push(new Point3d(0, 0, 0));
    points.push(new Point3d(1, 0, 0));

    const line = LineString3d.create(points);
    const pth = Path.create(line);

    const gfParams: GraphicParams = new GraphicParams();
    gfParams.lineColor = ColorDef.white;
    const displayParams = DisplayParams.createForLinear(gfParams);

    expect(accum.geometries.isEmpty).to.be.true;
    expect(accum.addPath(pth, displayParams, Transform.createIdentity(), false)).to.be.true;
    expect(accum.geometries.length).to.equal(1);

    // ###TODO test case where addPath returns false
  });

  it("addLoop works as expected", () => {
    accum = new GeometryAccumulator({ iModel });

    const points: Point3d[] = [];
    points.push(new Point3d(0, 0, 0));
    points.push(new Point3d(1, 0, 0));
    points.push(new Point3d(1, 1, 0));
    points.push(new Point3d(0, 1, 0));

    const line = LineString3d.create(points);
    const loop = Loop.create(line);

    const gfParams: GraphicParams = new GraphicParams();
    gfParams.lineColor = ColorDef.white;
    gfParams.fillColor = ColorDef.black; // forces region outline flag
    const displayParams: DisplayParams = DisplayParams.createForMesh(gfParams, false);

    expect(accum.geometries.isEmpty).to.be.true;
    expect(accum.addLoop(loop, displayParams, Transform.createIdentity(), false)).to.be.true;
    expect(accum.geometries.length).to.equal(1);

    // ###TODO test case where addLoop returns false
  });

  it("addPolyface works as expected", () => {
    accum = new GeometryAccumulator({ iModel });

    const points: Point3d[] = [];
    points.push(new Point3d(0, 0, 0));
    points.push(new Point3d(1, 0, 0));
    points.push(new Point3d(1, 1, 0));
    points.push(new Point3d(0, 1, 0));

    const line = LineString3d.create(points);
    const loop = Loop.create(line);

    const gfParams: GraphicParams = new GraphicParams();
    gfParams.lineColor = ColorDef.white;
    gfParams.fillColor = ColorDef.black; // forces region outline flag
    const displayParams: DisplayParams = DisplayParams.createForMesh(gfParams, false);

    const loopRange: Range3d = new Range3d();
    loop.range(undefined, loopRange);
    expect(loopRange).to.not.be.null;

    const loopGeom = Geometry.createFromLoop(loop, Transform.createIdentity(), loopRange, displayParams, false);

    // query polyface list from loopGeom
    const pfPrimList = loopGeom.getPolyfaces(0)!;
    assert(pfPrimList !== undefined);

    expect(pfPrimList.length).to.be.greaterThan(0);
    const pfPrim = pfPrimList[0];
    expect(pfPrim.indexedPolyface.pointCount).to.equal(points.length);

    expect(accum.geometries.isEmpty).to.be.true;
    expect(accum.addPolyface(pfPrim.indexedPolyface, displayParams, Transform.createIdentity())).to.be.true;
    expect(accum.geometries.length).to.equal(1);

    // ###TODO test case where addPolyface returns false
  });

  it("addGeometry works as expected", () => {
    accum = new GeometryAccumulator({ iModel });

    expect(accum.geometries.isEmpty).to.be.true;
    expect(accum.isEmpty).to.be.true;
    const fkGeom = new FakeGeometry();
    expect(accum.addGeometry(fkGeom)).to.be.true;
    expect(accum.geometries.length).to.equal(1);
  });

  it("clear works as expected", () => {
    accum = new GeometryAccumulator({ iModel });

    expect(accum.isEmpty).to.be.true;
    accum.addGeometry(new FakeGeometry());
    expect(accum.isEmpty).to.be.false;
    accum.clear();
    expect(accum.isEmpty).to.be.true;
  });

  it("toMeshBuilderMap works as expected", () => {
    accum = new GeometryAccumulator({ iModel });

    const points: Point3d[] = [];
    points.push(new Point3d(0, 0, 0));
    points.push(new Point3d(1, 0, 0));
    points.push(new Point3d(1, 1, 0));
    points.push(new Point3d(0, 1, 0));

    const line = LineString3d.create(points);
    const loop = Loop.create(line);

    const gfParams: GraphicParams = new GraphicParams();
    gfParams.lineColor = ColorDef.white;
    gfParams.fillColor = ColorDef.black; // forces region outline flag
    const displayParams: DisplayParams = DisplayParams.createForMesh(gfParams, false);

    const loopRange: Range3d = new Range3d();
    loop.range(undefined, loopRange);

    const loopGeom = Geometry.createFromLoop(loop, Transform.createIdentity(), loopRange, displayParams, false);

    const pathPoints: Point3d[] = [];
    pathPoints.push(new Point3d(0, 0, 0));
    pathPoints.push(new Point3d(1, 0, 0));

    const line2 = LineString3d.create(pathPoints);
    const pth = Path.create(line2);

    const gfParams2: GraphicParams = new GraphicParams();
    gfParams2.lineColor = ColorDef.white;
    const displayParams2: DisplayParams = DisplayParams.createForLinear(gfParams2);

    accum.addPolyface(loopGeom.getPolyfaces(0)![0].indexedPolyface, displayParams, Transform.createIdentity());
    accum.addPath(pth, displayParams2, Transform.createIdentity(), false);

    expect(accum.geometries.length).to.equal(2);
    const map = accum.toMeshBuilderMap(new GeometryOptions(GenerateEdges.No), 0.22);
    expect(map.size).to.equal(2);
  });

  it("toMeshes works as expected", () => {
    accum = new GeometryAccumulator({ iModel });

    const points: Point3d[] = [];
    points.push(new Point3d(0, 0, 0));
    points.push(new Point3d(1, 0, 0));
    points.push(new Point3d(1, 1, 0));
    points.push(new Point3d(0, 1, 0));

    const line = LineString3d.create(points);
    const loop = Loop.create(line);

    const gfParams: GraphicParams = new GraphicParams();
    gfParams.lineColor = ColorDef.white;
    gfParams.fillColor = ColorDef.black; // forces region outline flag
    const displayParams: DisplayParams = DisplayParams.createForMesh(gfParams, false);

    const loopRange: Range3d = new Range3d();
    loop.range(undefined, loopRange);

    const loopGeom = Geometry.createFromLoop(loop, Transform.createIdentity(), loopRange, displayParams, false);

    const pathPoints: Point3d[] = [];
    pathPoints.push(new Point3d(0, 0, 0));
    pathPoints.push(new Point3d(1, 0, 0));

    const line2 = LineString3d.create(pathPoints);
    const pth = Path.create(line2);

    const gfParams2: GraphicParams = new GraphicParams();
    gfParams2.lineColor = ColorDef.white;
    const displayParams2: DisplayParams = DisplayParams.createForLinear(gfParams2);

    accum.addPolyface(loopGeom.getPolyfaces(0)![0].indexedPolyface, displayParams, Transform.createIdentity());
    accum.addPath(pth, displayParams2, Transform.createIdentity(), false);

    expect(accum.geometries.length).to.equal(2);
    const meshes = accum.toMeshes(new GeometryOptions(GenerateEdges.No), 0.22);
    expect(meshes.length).to.equal(2);
  });

  it("saveToGraphicList works as expected", () => {
    accum = new GeometryAccumulator({ iModel });

    const points: Point3d[] = [];
    points.push(new Point3d(0, 0, 0));
    points.push(new Point3d(1, 0, 0));
    points.push(new Point3d(1, 1, 0));
    points.push(new Point3d(0, 1, 0));

    const line = LineString3d.create(points);
    const loop = Loop.create(line);

    const gfParams: GraphicParams = new GraphicParams();
    gfParams.lineColor = ColorDef.white;
    gfParams.fillColor = ColorDef.black; // forces region outline flag
    const displayParams: DisplayParams = DisplayParams.createForMesh(gfParams, false);

    const loopRange: Range3d = new Range3d();
    loop.range(undefined, loopRange);

    const loopGeom = Geometry.createFromLoop(loop, Transform.createIdentity(), loopRange, displayParams, false);

    const pathPoints: Point3d[] = [];
    pathPoints.push(new Point3d(0, 0, 0));
    pathPoints.push(new Point3d(1, 0, 0));

    const line2 = LineString3d.create(pathPoints);
    const pth = Path.create(line2);

    const gfParams2: GraphicParams = new GraphicParams();
    gfParams2.lineColor = ColorDef.white;
    const displayParams2: DisplayParams = DisplayParams.createForLinear(gfParams2);

    accum.addPolyface(loopGeom.getPolyfaces(0)![0].indexedPolyface, displayParams, Transform.createIdentity());
    accum.addPath(pth, displayParams2, Transform.createIdentity(), false);

    const graphics = new Array<RenderGraphic>();
    accum.saveToGraphicList(graphics, new GeometryOptions(GenerateEdges.No), 0.22);
    expect(graphics.length).to.equal(1);
    const graphic = graphics[0];
    expect(graphic instanceof Branch).to.be.true;
    expect((graphic as Branch).branch.entries.length).to.equal(2);
  });
});
