/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "@bentley/bentleyjs-core";
import { IModelJson, Path } from "@bentley/geometry-core";
import { ColorDef, ViewDetails } from "@bentley/imodeljs-common";
import { DecorateContext, GraphicType, IModelApp, IModelConnection, Tool } from "@bentley/imodeljs-frontend";
import { parseArgs } from "@bentley/frontend-devtools";

class AspectRatioSkewDecorator {
  private static _instance?: AspectRatioSkewDecorator;
  private readonly _path: Path;
  private readonly _applyAspectRatioSkew: boolean;

  private constructor(iModel: IModelConnection, applyAspectRatioSkew: boolean) {
    this._applyAspectRatioSkew = applyAspectRatioSkew;

    const l = iModel.projectExtents.low;
    const h = iModel.projectExtents.high;
    const c = iModel.projectExtents.center;
    const json = {
      path: [{
        bcurve: {
          closed: false,
          knots: [0, 0, 0, 1, 1, 1],
          order: 3,
          points: [
            [l.x, l.y, c.z],
            [c.x, h.y, c.z],
            [h.x, c.y, c.z],
          ],
        },
      }],
    };

    const path = IModelJson.Reader.parse(json);
    assert(path instanceof Path);
    this._path = path;

    // Increase the max aspect ratio skew to fit our needs for profile display
    ViewDetails.maxSkew = 1000;
  }

  public decorate(context: DecorateContext): void {
    if (!context.viewport.view.isSpatialView())
      return;

    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);
    builder.applyAspectRatioSkew = this._applyAspectRatioSkew;
    builder.setSymbology(ColorDef.white, ColorDef.white, 3);
    builder.addPath(this._path);
    context.addDecorationFromBuilder(builder);
  }

  public static toggle(iModel: IModelConnection, applyAspectRatioSkew: boolean): void {
    const dec = this._instance;
    if (dec) {
      IModelApp.viewManager.dropDecorator(dec);
      this._instance = undefined;
    } else {
      this._instance = new AspectRatioSkewDecorator(iModel, applyAspectRatioSkew);
      IModelApp.viewManager.addDecorator(this._instance);
    }
  }
}

/** Decorates all spatial views with a simple bspline curve based on the iModel's project extents, taking into account the view's aspect ratio skew when
 * producing the decoration graphics unless specified otherwise. Use `fdt aspect skew` to change the aspect ratio skew.
 * The level of detail of the graphics should be adjusted based on the skew; if the key-in argument specifies *not* to do so, expect lower-resolution
 * graphics when skew > 1.
 */
export class ToggleAspectRatioSkewDecoratorTool extends Tool {
  private _applyAspectRatioSkew = true;

  public static override toolId = "ToggleAspectRatioSkewDecorator";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override run(): boolean {
    const iModel = IModelApp.viewManager.selectedView?.iModel;
    if (iModel)
      AspectRatioSkewDecorator.toggle(iModel, this._applyAspectRatioSkew);

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const parsedArgs = parseArgs(args);
    this._applyAspectRatioSkew = parsedArgs.getBoolean("a") ?? true;
    return this.run();
  }
}
