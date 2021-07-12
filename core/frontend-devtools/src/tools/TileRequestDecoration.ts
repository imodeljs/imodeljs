/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { ColorDef, LinePixels } from "@bentley/imodeljs-common";
import { DecorateContext, GraphicBuilder, GraphicType, IModelApp, TileTree, Tool, Viewport } from "@bentley/imodeljs-frontend";
import { parseToggle } from "./parseToggle";

class TileRequestDecoration {
  private static _instance?: TileRequestDecoration;
  private _removeDecorator?: () => void;
  private readonly _targetVp: Viewport;

  private constructor(vp: Viewport) {
    this._targetVp = vp;
    this._removeDecorator = IModelApp.viewManager.addDecorator(this);
  }

  private stop(): void {
    if (this._removeDecorator) {
      this._removeDecorator();
      this._removeDecorator = undefined;
    }
  }

  /** This will allow the render system to cache and reuse the decorations created by this decorator's decorate() method. */
  public readonly useCachedDecorations = true;

  public decorate(context: DecorateContext): void {
    const tiles = IModelApp.tileAdmin.getRequestsForViewport(this._targetVp);
    if (undefined === tiles)
      return;

    const map = new Map<TileTree, GraphicBuilder>();
    for (const tile of tiles) {
      let builder = map.get(tile.tree);
      if (undefined === builder) {
        builder = context.createGraphicBuilder(GraphicType.WorldDecoration, tile.tree.iModelTransform);
        map.set(tile.tree, builder);
      }

      let color = ColorDef.white;
      if (undefined !== tile.request)
        color = tile.request.isQueued ? ColorDef.green : ColorDef.red;

      builder.setSymbology(color, color, 1, LinePixels.Solid);
      builder.addRangeBox(tile.range);
    }

    for (const builder of map.values())
      context.addDecorationFromBuilder(builder);
  }

  public static toggle(vp: Viewport, enabled?: boolean): void {
    const instance = TileRequestDecoration._instance;
    if (undefined !== enabled) {
      if ((undefined !== instance) === enabled)
        return;
    }

    if (undefined === instance) {
      TileRequestDecoration._instance = new TileRequestDecoration(vp);
    } else {
      instance.stop();
      TileRequestDecoration._instance = undefined;
    }
  }
}

/** Display in every viewport a range graphic for every tile currently being requested for the viewport that was initially selected when the decorator was installed.
 * Green indicates queued (http request not yet sent), red indicates active (http request sent). White indicates unexpected state.
 * @beta
 */
export class ToggleTileRequestDecorationTool extends Tool {
  public static override toolId = "ToggleTileRequestDecoration";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override run(enable?: boolean): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp)
      TileRequestDecoration.toggle(vp, enable);

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const enable = parseToggle(args[0]);
    if (typeof enable !== "string")
      this.run(enable);

    return true;
  }
}
