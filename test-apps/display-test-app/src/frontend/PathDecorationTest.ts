/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { CanvasDecoration, DecorateContext, GraphicType, HitDetail, IModelApp, Tool } from "@bentley/imodeljs-frontend";
import { AxisAlignedBox3d, GeometryStreamProps } from "@bentley/imodeljs-common";
import { AngleSweep, Arc3d, Path, Range1d, Range3d } from "@bentley/geometry-core";

class PathCanvasDecoration implements CanvasDecoration {
  public drawDecoration(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "white";
    ctx.fillText("Path Decoration Test Tool Active", 256, 256);
  }
}

/** This class decorates a viewport with a small path.
 */
export class PathDecorationTest {
  public static decorator?: PathDecorationTest; // static variable so we can tell if the test is active.
  public static canvasDecoration = new PathCanvasDecoration();

  private _path: Path;
  private _pickId?: string;

  public constructor(extents: AxisAlignedBox3d) {
    this._path = _getPath(extents);
  }

  /** This will allow the render system to cache and reuse the decorations created by this decorator's decorate() method. */
  public readonly useCachedDecorations = true;

  /** We added this class as a ViewManager.decorator below. This method is called to ask for our decorations. Here we add the line string. */
  public decorate(context: DecorateContext) {
    if (undefined === this._pickId)
      this._pickId = context.viewport.iModel.transientIds.next;
    const pathBuilder = context.createGraphicBuilder(GraphicType.WorldDecoration, undefined, this._pickId);
    pathBuilder.addPath(this._path);
    context.addDecorationFromBuilder(pathBuilder);
    context.addCanvasDecoration(PathDecorationTest.canvasDecoration);
  }

  /** Test any hits against this id. */
  public testDecorationHit(id: string): boolean { return id === this._pickId; }

  /** Return no decoration geometry for picking. */
  public getDecorationGeometry(_hit: HitDetail): GeometryStreamProps | undefined { return undefined; }

  /** Create the PathDecorationTest object and adding it as a ViewManager decorator. */
  private static start(extents: AxisAlignedBox3d) {
    PathDecorationTest.decorator = new PathDecorationTest(extents);
    IModelApp.viewManager.addDecorator(PathDecorationTest.decorator);
  }

  /** stop the demo */
  private static stop() {
    if (PathDecorationTest.decorator)
      IModelApp.viewManager.dropDecorator(PathDecorationTest.decorator);
    PathDecorationTest.decorator = undefined;
  }

  /** Turn the line decoration on and off. */
  public static toggle(extents: AxisAlignedBox3d) {
    if (undefined === PathDecorationTest.decorator)
      this.start(extents);
    else
      this.stop();
  }
}

export class PathDecorationTestTool extends Tool {
  public static override toolId = "TogglePathDecoration";
  public override run(_args: any[]): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp)
      PathDecorationTest.toggle(vp.view.iModel.projectExtents);
    return true;
  }
}

function _getPath(extents: AxisAlignedBox3d): Path {
  const range = Range3d.createNull();
  range.extendPoint(extents.low);
  range.extendPoint(extents.high);

  const range1d = Range1d.createXX(0.0, 0.2);
  const curves = [];

  const numIterations = 1000;
  for (let i = 0; i < numIterations; i++) {
    const fract = range1d.fractionToPoint((i + 1.0) / numIterations);
    const halfFract = fract * 0.5;

    const a = range.fractionToPoint(0.0, 0.0, 0.0);
    const b = range.fractionToPoint(halfFract, 0.0, 0.0);
    const c = range.fractionToPoint(halfFract, halfFract, 0.0);
    const d = range.fractionToPoint(halfFract, halfFract, halfFract);
    const e = range.fractionToPoint(fract * 0.75, fract, fract);
    const f = range.fractionToPoint(fract, fract, fract);

    curves.push([a, b, c, d]);
    curves.push(Arc3d.create(d, d.vectorTo(e), d.vectorTo(f), AngleSweep.createStartEndDegrees(0.0, 90.0)));
  }

  return Path.create(...curves);
}
