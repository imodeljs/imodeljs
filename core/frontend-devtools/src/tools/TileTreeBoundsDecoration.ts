/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { ColorDef, LinePixels } from "@bentley/imodeljs-common";
import { DecorateContext, GraphicType, IModelApp, TileTreeReference, Tool } from "@bentley/imodeljs-frontend";
import { parseToggle } from "./parseToggle";

class TreeDecoration {
  private static _instance?: TreeDecoration;
  private _removeMe?: () => void;

  private constructor() {
    this._removeMe = IModelApp.viewManager.addDecorator(this);
  }

  private stop() {
    if (this._removeMe) {
      this._removeMe();
      this._removeMe = undefined;
    }
  }

  /** This will allow the render system to cache and reuse the decorations created by this decorator's decorate() method. */
  public readonly useCachedDecorations = true;

  public decorate(context: DecorateContext): void {
    context.viewport.forEachTileTreeRef((ref) => this.drawBoundingBox(ref, context));
  }

  private drawBoundingBox(ref: TileTreeReference, context: DecorateContext): void {
    const tree = ref.treeOwner.tileTree;
    const location = ref.getLocation();
    if (undefined === location || undefined === tree || tree.isContentUnbounded || tree.range.isNull)
      return;

    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration, location);
    builder.setSymbology(ColorDef.green, ColorDef.green, 1, LinePixels.Solid);
    builder.addRangeBox(tree.range);

    if (undefined !== tree.contentRange) {
      builder.setSymbology(ColorDef.red, ColorDef.red, 1, LinePixels.Solid);
      builder.addRangeBox(tree.contentRange);
    }

    context.addDecorationFromBuilder(builder);
  }

  public static toggle(enabled?: boolean): void {
    const instance = TreeDecoration._instance;
    if (undefined !== enabled && (undefined !== instance) === enabled)
      return;

    if (undefined === instance) {
      TreeDecoration._instance = new TreeDecoration();
    } else {
      instance.stop();
      TreeDecoration._instance = undefined;
    }
  }
}

/** Display in every viewport a green range graphic for each displayed tile tree, plus a red range graphic for each tile tree's content range if defined.
 * @beta
 */
export class ToggleTileTreeBoundsDecorationTool extends Tool {
  public static override toolId = "ToggleTileTreeBoundsDecoration";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public override run(enable?: boolean): boolean {
    TreeDecoration.toggle(enable);
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const enable = parseToggle(args[0]);
    if (typeof enable !== "string")
      this.run(enable);

    return true;
  }
}
