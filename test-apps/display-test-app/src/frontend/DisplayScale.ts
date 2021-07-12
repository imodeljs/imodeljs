/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Matrix3d, Point3d, Transform } from "@bentley/geometry-core";
import { IModelApp, ModelDisplayTransformProvider, Tool } from "@bentley/imodeljs-frontend";
import { parseArgs } from "@bentley/frontend-devtools";

class DisplayScaleTransformProvider implements ModelDisplayTransformProvider {
  public constructor(private readonly _models: Set<string>, private readonly _scaleTransform: Transform) { }

  public getModelDisplayTransform(modelId: string, baseTransform: Transform): Transform {
    if (!this._models.has(modelId))
      return baseTransform;

    // Apply scale as last part of model to world transform.
    return this._scaleTransform.multiplyTransformTransform(baseTransform);
  }

  public get transform(): Transform { return this._scaleTransform.clone(); }
}

/** Apply a display transform to all currently displayed models. */
export class ApplyModelDisplayScaleTool extends Tool {
  public static override toolId = "ApplyModelDisplayScale";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 3; }

  public override run(scale: Point3d): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return false;

    const f = vp.getWorldFrustum();
    // If there was already a transform then we need to undo it for the frustum.
    if (undefined !== vp.view.modelDisplayTransformProvider && vp.view.modelDisplayTransformProvider instanceof DisplayScaleTransformProvider) {
      const t = vp.view.modelDisplayTransformProvider.transform;
      const sx = t.matrix.getColumn(0).magnitude();
      const sy = t.matrix.getColumn(1).magnitude();
      const sz = t.matrix.getColumn(2).magnitude();
      const inverseMax = 1.0 / Math.max(sx, sy, sz);
      const scaleFrustumInvTf = Transform.createRefs(Point3d.createZero(), Matrix3d.createScale(inverseMax, inverseMax, inverseMax));
      f.multiply(scaleFrustumInvTf);
    }

    let scl;
    let maxScale = 1.0;
    if (scale.isAlmostEqual(Point3d.create(1.0, 1.0, 1.0))) {
      if (undefined !== vp.view.modelDisplayTransformProvider) {
        vp.view.modelDisplayTransformProvider = undefined;
      } else {
        return false;
      }
      scl = Matrix3d.createIdentity();
    } else {
      scl = Matrix3d.createScale(scale.x, scale.y, scale.z);
      maxScale = Math.max(scale.y, scale.y, scale.z);
    }

    const models = new Set<string>();
    vp.view.forEachModel((model) => models.add(model.id));

    const sclTf = Transform.createRefs(Point3d.createZero(), scl);
    const tp = new DisplayScaleTransformProvider(models, sclTf);
    vp.setModelDisplayTransformProvider(tp);

    // Scale frustum uniformly using the largest of the scale values.
    const scaleFrustumTf = Transform.createRefs(Point3d.createZero(), Matrix3d.createScale(maxScale, maxScale, maxScale));
    f.multiply(scaleFrustumTf);
    vp.setupViewFromFrustum(f);

    return true;
  }

  public override parseAndRun(...input: string[]): boolean {
    const args = parseArgs(input);
    const scale = new Point3d(args.getFloat("x") ?? 1.0, args.getFloat("y") ?? 1.0, args.getFloat("z") ?? 1.0);
    return this.run(scale);
  }
}
