/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import { Arc3d, IndexedPolyface, LineString3d, Loop, Path, Point2d, Point3d, Polyface, Range3d, Transform } from "@bentley/geometry-core";
import { ColorDef, GraphicParams } from "@bentley/imodeljs-common";
import {
  GraphicType, IModelApp, IModelConnection, ScreenViewport, SnapshotConnection, SpatialViewState, StandardViewId,
} from "@bentley/imodeljs-frontend";
import {
  DisplayParams, Geometry, GeometryAccumulator, PrimitiveBuilder, StrokesPrimitiveList, StrokesPrimitivePointList, StrokesPrimitivePointLists,
} from "@bentley/imodeljs-frontend/lib/render-primitives";
import { Branch } from "@bentley/imodeljs-frontend/lib/webgl";

describe("PrimitiveBuilder", () => {
  let imodel: IModelConnection;
  let viewport: ScreenViewport;

  before(async () => {   // Create a ViewState to load into a Viewport
    await IModelApp.startup();
    imodel = await SnapshotConnection.openFile("test.bim"); // relative path resolved by BackendTestAssetResolver

    const viewDiv = document.createElement("div");
    assert(null !== viewDiv);
    viewDiv.style.width = viewDiv.style.height = "1000px";
    document.body.appendChild(viewDiv);

    const spatialView = await imodel.views.load("0x34") as SpatialViewState;
    spatialView.setStandardRotation(StandardViewId.RightIso);

    viewport = ScreenViewport.create(viewDiv, spatialView);
  });

  after(async () => {
    if (viewport) viewport.dispose();
    if (imodel) await imodel.close();
    await IModelApp.shutdown();
  });

  it("should produce proper arc strokes for specific tolerances", () => {
    const primBuilder = new PrimitiveBuilder(IModelApp.renderSystem, { type: GraphicType.Scene, viewport });

    const pointA = new Point3d(-100, 0, 0);
    const pointB = new Point3d(0, 100, 0);
    const pointC = new Point3d(100, 0, 0);
    const arc = Arc3d.createCircularStartMiddleEnd(pointA, pointB, pointC);
    assert(arc !== undefined && arc instanceof Arc3d);
    if (arc === undefined || !(arc instanceof Arc3d))
      return;

    primBuilder.addArc(arc, false, false);

    assert(!(primBuilder.accum.geometries.isEmpty));

    const arcGeom: Geometry | undefined = primBuilder.accum.geometries.first;
    assert(arcGeom !== undefined);
    if (arcGeom === undefined)
      return;

    let strokesPrimList: StrokesPrimitiveList | undefined = arcGeom.getStrokes(0.22);

    assert(strokesPrimList !== undefined);
    if (strokesPrimList === undefined)
      return;

    expect(strokesPrimList.length).to.be.greaterThan(0);
    let strksPrims: StrokesPrimitivePointLists = strokesPrimList[0].strokes;
    expect(strksPrims.length).to.be.greaterThan(0);
    let strks: StrokesPrimitivePointList = strksPrims[0];

    // check that first and last point of stroking match first and last point of original points
    expect(strks.points[0].isAlmostEqual(pointA)).to.be.true;
    expect(strks.points[strks.points.length - 1].isAlmostEqual(pointC)).to.be.true;
    const numPointsA = strks.points.length;

    strokesPrimList = arcGeom.getStrokes(0.12);

    assert(strokesPrimList !== undefined);
    if (strokesPrimList === undefined)
      return;

    expect(strokesPrimList.length).to.be.greaterThan(0);
    strksPrims = strokesPrimList[0].strokes;
    expect(strksPrims.length).to.be.greaterThan(0);
    strks = strksPrims[0];

    // check that first and last point of stroking match first and last point of original points
    expect(strks.points[0].isAlmostEqual(pointA)).to.be.true;
    expect(strks.points[strks.points.length - 1].isAlmostEqual(pointC)).to.be.true;
    const numPointsB = strks.points.length;

    expect(numPointsA).to.be.lessThan(numPointsB);
  });

  it("should not produce any strokes for Polyface", () => {
    const primBuilder = new PrimitiveBuilder(IModelApp.renderSystem, { type: GraphicType.Scene, viewport });

    // const pointA = new Point3d(-100, 0, 0);
    // const pointB = new Point3d(0, 100, 0);
    // const pointC = new Point3d(100, 0, 0);

    const polyFace = IndexedPolyface.create();
    polyFace.addPointXYZ(-100, 0, 0);
    polyFace.addPointXYZ(0, 100, 0);
    polyFace.addPointXYZ(100, 0, 0);
    assert(polyFace !== undefined && polyFace instanceof Polyface);
    if (polyFace === undefined || !(polyFace instanceof Polyface))
      return;

    primBuilder.addPolyface(polyFace);

    assert(!(primBuilder.accum.geometries.isEmpty));

    const firstGeom: Geometry | undefined = primBuilder.accum.geometries.first;
    assert(firstGeom !== undefined);
    if (firstGeom === undefined)
      return;

    let strokesPrimList: StrokesPrimitiveList | undefined = firstGeom.getStrokes(0.22);
    assert(strokesPrimList === undefined);

    strokesPrimList = firstGeom.getStrokes(0.12);
    assert(strokesPrimList === undefined);
  });

  it("should not produce any strokes for Shape", () => {
    const primBuilder = new PrimitiveBuilder(IModelApp.renderSystem, { type: GraphicType.Scene, viewport });

    const pointA = new Point3d(-100, 0, 0);
    const pointB = new Point3d(0, 100, 0);
    const pointC = new Point3d(100, 0, 0);
    primBuilder.addShape([pointA, pointB, pointC]);
    assert(!(primBuilder.accum.geometries.isEmpty));

    const arcGeom: Geometry | undefined = primBuilder.accum.geometries.first;
    assert(arcGeom !== undefined);
    if (arcGeom === undefined)
      return;

    let strokesPrimList: StrokesPrimitiveList | undefined = arcGeom.getStrokes(0.22);
    assert(strokesPrimList === undefined || strokesPrimList.length === 0);

    strokesPrimList = arcGeom.getStrokes(0.12);
    assert(strokesPrimList === undefined || strokesPrimList.length === 0);
  });

  it("should not produce any strokes for Shape2d", () => {
    const primBuilder = new PrimitiveBuilder(IModelApp.renderSystem, { type: GraphicType.Scene, viewport });

    const pointA = new Point2d(-100, 0);
    const pointB = new Point2d(0, 100);
    const pointC = new Point2d(100, 0);
    primBuilder.addShape2d([pointA, pointB, pointC], 5);
    assert(!(primBuilder.accum.geometries.isEmpty));

    const arcGeom: Geometry | undefined = primBuilder.accum.geometries.first;
    assert(arcGeom !== undefined);
    if (arcGeom === undefined)
      return;

    let strokesPrimList: StrokesPrimitiveList | undefined = arcGeom.getStrokes(0.22);
    assert(strokesPrimList === undefined || strokesPrimList.length === 0);

    strokesPrimList = arcGeom.getStrokes(0.12);
    assert(strokesPrimList === undefined || strokesPrimList.length === 0);
  });

  it("should produce proper LineString strokes; different tolerances should have no effect", () => {
    const primBuilder = new PrimitiveBuilder(IModelApp.renderSystem, { type: GraphicType.Scene, viewport });

    const pointA = new Point3d(-100, 0, 0);
    const pointB = new Point3d(0, 100, 0);
    const pointC = new Point3d(100, 0, 0);
    const pointList = [pointA, pointB, pointC];

    primBuilder.addLineString(pointList);

    assert(!(primBuilder.accum.geometries.isEmpty));

    const pointGeom: Geometry | undefined = primBuilder.accum.geometries.first;
    assert(pointGeom !== undefined);
    if (pointGeom === undefined)
      return;

    let strokesPrimList: StrokesPrimitiveList | undefined = pointGeom.getStrokes(0.0);

    assert(strokesPrimList !== undefined);
    if (strokesPrimList === undefined)
      return;

    expect(strokesPrimList.length).to.be.greaterThan(0);
    let strksPrims: StrokesPrimitivePointLists = strokesPrimList[0].strokes;
    expect(strksPrims.length).to.be.greaterThan(0);
    let strks: StrokesPrimitivePointList = strksPrims[0];

    // check that points of stroking match points of original points
    expect(strks.points[0].isAlmostEqual(pointA)).to.be.true;
    expect(strks.points[1].isAlmostEqual(pointB)).to.be.true;
    expect(strks.points[2].isAlmostEqual(pointC)).to.be.true;
    const numPointsA = strks.points.length;

    strokesPrimList = pointGeom.getStrokes(1.0);

    assert(strokesPrimList !== undefined);
    if (strokesPrimList === undefined)
      return;

    expect(strokesPrimList.length).to.be.greaterThan(0);
    strksPrims = strokesPrimList[0].strokes;
    expect(strksPrims.length).to.be.greaterThan(0);
    strks = strksPrims[0];

    // check that first and last point of stroking match first and last point of original points
    expect(strks.points[0].isAlmostEqual(pointA)).to.be.true;
    expect(strks.points[1].isAlmostEqual(pointB)).to.be.true;
    expect(strks.points[2].isAlmostEqual(pointC)).to.be.true;
    const numPointsB = strks.points.length;

    expect(numPointsA).to.equal(numPointsB);
  });

  it("should produce proper PointString strokes; different tolerances should have no effect", () => {
    const primBuilder = new PrimitiveBuilder(IModelApp.renderSystem, { type: GraphicType.Scene, viewport });

    const pointA = new Point3d(-100, 0, 0);
    const pointB = new Point3d(0, 100, 0);
    const pointC = new Point3d(100, 0, 0);
    const pointList = [pointA, pointB, pointC];

    primBuilder.addPointString(pointList);

    assert(!(primBuilder.accum.geometries.isEmpty));

    const pointGeom: Geometry | undefined = primBuilder.accum.geometries.first;
    assert(pointGeom !== undefined);
    if (pointGeom === undefined)
      return;

    let strokesPrimList: StrokesPrimitiveList | undefined = pointGeom.getStrokes(0.0);

    assert(strokesPrimList !== undefined);
    if (strokesPrimList === undefined)
      return;

    expect(strokesPrimList.length).to.be.greaterThan(0);
    let strksPrims: StrokesPrimitivePointLists = strokesPrimList[0].strokes;
    expect(strksPrims.length).to.be.greaterThan(0);
    let strks: StrokesPrimitivePointList = strksPrims[0];

    // check that points of stroking match points of original points
    expect(strks.points[0].isAlmostEqual(pointA)).to.be.true;
    expect(strks.points[1].isAlmostEqual(pointB)).to.be.true;
    expect(strks.points[2].isAlmostEqual(pointC)).to.be.true;
    const numPointsA = strks.points.length;

    strokesPrimList = pointGeom.getStrokes(1.0);

    assert(strokesPrimList !== undefined);
    if (strokesPrimList === undefined)
      return;

    expect(strokesPrimList.length).to.be.greaterThan(0);
    strksPrims = strokesPrimList[0].strokes;
    expect(strksPrims.length).to.be.greaterThan(0);
    strks = strksPrims[0];

    // check that first and last point of stroking match first and last point of original points
    expect(strks.points[0].isAlmostEqual(pointA)).to.be.true;
    expect(strks.points[1].isAlmostEqual(pointB)).to.be.true;
    expect(strks.points[2].isAlmostEqual(pointC)).to.be.true;
    const numPointsB = strks.points.length;

    expect(numPointsA).to.equal(numPointsB);
  });

  it("should produce proper PointString2d strokes; different tolerances should have no effect", () => {
    const primBuilder = new PrimitiveBuilder(IModelApp.renderSystem, { type: GraphicType.Scene, viewport });

    const pointA = new Point2d(-100, 0);
    const pointB = new Point2d(0, 100);
    const pointC = new Point2d(100, 0);
    const pointList = [pointA, pointB, pointC];

    primBuilder.addPointString2d(pointList, 5);

    assert(!(primBuilder.accum.geometries.isEmpty));

    const pointGeom: Geometry | undefined = primBuilder.accum.geometries.first;
    assert(pointGeom !== undefined);
    if (pointGeom === undefined)
      return;

    let strokesPrimList: StrokesPrimitiveList | undefined = pointGeom.getStrokes(0.0);

    assert(strokesPrimList !== undefined);
    if (strokesPrimList === undefined)
      return;

    expect(strokesPrimList.length).to.be.greaterThan(0);
    let strksPrims: StrokesPrimitivePointLists = strokesPrimList[0].strokes;
    expect(strksPrims.length).to.be.greaterThan(0);
    let strks: StrokesPrimitivePointList = strksPrims[0];

    // check that points of stroking match points of original points
    expect(strks.points[0].isAlmostEqual(Point3d.create(-100, 0, 5))).to.be.true;
    expect(strks.points[1].isAlmostEqual(Point3d.create(0, 100, 5))).to.be.true;
    expect(strks.points[2].isAlmostEqual(Point3d.create(100, 0, 5))).to.be.true;
    const numPointsA = strks.points.length;

    strokesPrimList = pointGeom.getStrokes(1.0);

    assert(strokesPrimList !== undefined);
    if (strokesPrimList === undefined)
      return;

    expect(strokesPrimList.length).to.be.greaterThan(0);
    strksPrims = strokesPrimList[0].strokes;
    expect(strksPrims.length).to.be.greaterThan(0);
    strks = strksPrims[0];

    // check that first and last point of stroking match first and last point of original points
    expect(strks.points[0].isAlmostEqual(Point3d.create(-100, 0, 5))).to.be.true;
    expect(strks.points[1].isAlmostEqual(Point3d.create(0, 100, 5))).to.be.true;
    expect(strks.points[2].isAlmostEqual(Point3d.create(100, 0, 5))).to.be.true;
    const numPointsB = strks.points.length;

    expect(numPointsA).to.equal(numPointsB);
  });

  it("should be able to finish graphics", () => {
    const primBuilder = new PrimitiveBuilder(IModelApp.renderSystem, { type: GraphicType.Scene, viewport });
    const accum = new GeometryAccumulator({ iModel: imodel });

    const gfParams: GraphicParams = new GraphicParams();
    gfParams.lineColor = ColorDef.white;
    gfParams.fillColor = ColorDef.black; // forces region outline flag
    const displayParams: DisplayParams = DisplayParams.createForMesh(gfParams, false);

    const points: Point3d[] = [];
    points.push(new Point3d(0, 0, 0));
    points.push(new Point3d(1, 0, 0));
    points.push(new Point3d(1, 1, 0));
    points.push(new Point3d(0, 1, 0));

    const line = LineString3d.create(points);
    const loop = Loop.create(line);
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

    accum.addPolyface(loopGeom.getPolyfaces(0.22)![0].indexedPolyface, displayParams, Transform.createIdentity());
    accum.addPath(pth, displayParams2, Transform.createIdentity(), false);

    const graphic = primBuilder.finishGraphic(accum);
    expect(primBuilder.primitives.length).to.equal(0); // if only 1 entry (a branch), the list of primitives is popped.
    expect(graphic instanceof Branch).to.be.true;
    expect((graphic as Branch).branch.entries.length).to.equal(2);
  });
});
