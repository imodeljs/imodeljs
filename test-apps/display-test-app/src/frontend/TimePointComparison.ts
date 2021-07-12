/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import {
  ClipPlane, ClipPrimitive, ClipVector, ConvexClipPlaneSet, Point3d, Transform, Vector3d,
} from "@bentley/geometry-core";
import {
  AccuDrawHintBuilder,
  FeatureSymbology, GraphicBranch, IModelApp, RenderClipVolume, SceneContext, ScreenViewport, TileTreeReference, Tool,
} from "@bentley/imodeljs-frontend";

/** Prototype for SYNCHRO feature. Split the viewport down the middle. Left-hand side remains frozen at current time point. Right-hand side updates when time point changes. */
class TimePointComparison {
  private readonly _clipVolume?: RenderClipVolume;
  private readonly _timePoint: number;

  private constructor(clip: ClipVector, timePoint: number) {
    this._clipVolume = IModelApp.renderSystem.createClipVolume(clip);
    this._timePoint = timePoint;
  }

  public forEachTileTreeRef(viewport: ScreenViewport, func: (ref: TileTreeReference) => void): void {
    viewport.view.forEachTileTreeRef(func);
  }

  public addToScene(output: SceneContext): void {
    const vp = output.viewport;
    const clip = vp.view.getViewClip();
    const timePoint = vp.timePoint;

    vp.view.setViewClip(this._clipVolume?.clipVector);
    vp.displayStyle.settings.timePoint = this._timePoint;

    const context = vp.createSceneContext();
    vp.createScene(context);

    const gfx = context.graphics;
    if (0 < gfx.length) {
      const ovrs = new FeatureSymbology.Overrides(vp);

      const branch = new GraphicBranch();
      branch.symbologyOverrides = ovrs;
      for (const gf of gfx)
        branch.entries.push(gf);

      output.outputGraphic(IModelApp.renderSystem.createGraphicBranch(branch, Transform.createIdentity(), { clipVolume: this._clipVolume }));
    }

    vp.view.setViewClip(clip);
    vp.displayStyle.settings.timePoint = timePoint;
  }

  public static toggle(vp: ScreenViewport): void {
    if (!vp.view.isSpatialView())
      return;

    let provider: TimePointComparison | undefined;
    vp.forEachTiledGraphicsProvider((x) => {
      if (x instanceof TimePointComparison)
        provider = x;
    });

    if (!provider) {
      const timePoint = vp.timePoint ?? vp.view.displayStyle.scheduleScript?.duration.low;
      if (undefined === timePoint)
        return;

      const rect = vp.getClientRect();
      let point = new Point3d(rect.width / 2, rect.height / 2, 0);
      point = vp.viewToWorld(point);

      const boresite = AccuDrawHintBuilder.getBoresite(point, vp);
      const viewY = vp.rotation.rowY();
      const normal = viewY.crossProduct(boresite.direction);

      const createClip = (vec: Vector3d, pt: Point3d) => {
        const plane = ClipPlane.createNormalAndPoint(vec, pt)!;
        const planes = ConvexClipPlaneSet.createPlanes([plane]);
        return ClipVector.createCapture([ClipPrimitive.createCapture(planes)]);
      };

      vp.addTiledGraphicsProvider(new TimePointComparison(createClip(normal, point), timePoint));
      vp.view.setViewClip(createClip(normal.negate(), point));
      vp.viewFlags.clipVolume = true;
    } else {
      vp.dropTiledGraphicsProvider(provider);
      vp.view.setViewClip(undefined);
    }

    vp.invalidateScene();
  }
}

export class TimePointComparisonTool extends Tool {
  public static override toolId = "ToggleTimePointComparison";

  public override run(): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp)
      TimePointComparison.toggle(vp);

    return true;
  }
}
