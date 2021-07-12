/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { IModelApp, PrimitiveVisibility, RenderTargetDebugControl, ScreenViewport, Tool } from "@bentley/imodeljs-frontend";
import { parseToggle } from "./parseToggle";

/** Executes some code against a RenderTargetDebugControl obtained from the selected viewport.
 * @beta
 */
export abstract class RenderTargetDebugControlTool extends Tool {
  public override run(_args: any[]): boolean {
    const view = IModelApp.viewManager.selectedView;
    const control = undefined !== view ? view.target.debugControl : undefined;
    if (undefined !== control)
      this.execute(control, view!);

    return true;
  }

  protected abstract execute(_control: RenderTargetDebugControl, _vp: ScreenViewport): void;
}

type DebugControlBoolean =
  "displayDrapeFrustum" | "drawForReadPixels" | "displayRealityTileRanges" | "displayRealityTileRanges" |
  "displayRealityTilePreload" | "freezeRealityTiles" | "logRealityTiles" | "vcSupportIntersectingVolumes";

/** Toggles some aspect of a RenderTargetDebugControl for the selected viewport.
 * @beta
 */
export abstract class RenderTargetDebugControlToggleTool extends RenderTargetDebugControlTool {
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  private _enable?: boolean;

  protected abstract get aspect(): DebugControlBoolean;

  protected execute(control: RenderTargetDebugControl, vp: ScreenViewport): void {
    const value = undefined !== this._enable ? this._enable : !control[this.aspect];
    control[this.aspect] = value;
    vp.invalidateRenderPlan();
  }

  public override parseAndRun(...args: string[]): boolean {
    const enable = parseToggle(args[0]);
    if (typeof enable !== "string") {
      this._enable = enable;
      this.run([]);
    }

    return true;
  }
}

/** Toggles between normal rendering and rendering as if drawing to an off-screen framebuffer for element locate. Useful for debugging locate issues.
 * @beta
 */
export class ToggleReadPixelsTool extends RenderTargetDebugControlToggleTool {
  public static override toolId = "ToggleReadPixels";
  public get aspect(): DebugControlBoolean { return "drawForReadPixels"; }
}

/** Turn on the display of the draping frustum.
 * @beta
 */
export class ToggleDrapeFrustumTool extends RenderTargetDebugControlToggleTool {
  public static override toolId = "ToggleDrapeFrustum";
  public get aspect(): DebugControlBoolean { return "displayDrapeFrustum"; }
}

/** Control whether all geometry renders, or only instanced or batched geometry.
 * Allowed argument: "instanced", "batched", "all". Defaults to "all" if no arguments supplied.
 * @beta
 */
export class TogglePrimitiveVisibilityTool extends RenderTargetDebugControlTool {
  public static override toolId = "TogglePrimitiveVisibility";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  private _visibility = PrimitiveVisibility.All;

  public execute(control: RenderTargetDebugControl, vp: ScreenViewport): void {
    control.primitiveVisibility = this._visibility;
    vp.invalidateScene();
  }

  public override parseAndRun(...args: string[]): boolean {
    if (0 < args.length) {
      switch (args[0].toLowerCase()) {
        case "instanced":
          this._visibility = PrimitiveVisibility.Instanced;
          break;
        case "batched":
          this._visibility = PrimitiveVisibility.Uninstanced;
          break;
        case "all":
          break;
        default:
          return true;
      }
    }

    return this.run(args);
  }
}

/** Turn on display of reality tile boundaries.
 * @beta
 */
export class ToggleRealityTileBounds extends RenderTargetDebugControlToggleTool {
  public static override toolId = "ToggleRealityTileBounds";
  public get aspect(): DebugControlBoolean { return "displayRealityTileRanges"; }
}

/** Turn on display of reality tile preload debugging.
 * @beta
 */
export class ToggleRealityTilePreload extends RenderTargetDebugControlToggleTool {
  public static override toolId = "ToggleRealityTilePreload";
  public get aspect(): DebugControlBoolean { return "displayRealityTilePreload"; }
}
/** Freeze loading of reality tiles.
 * @beta
 */
export class ToggleRealityTileFreeze extends RenderTargetDebugControlToggleTool {
  public static override toolId = "ToggleRealityTileFreeze";
  public get aspect(): DebugControlBoolean { return "freezeRealityTiles"; }
}

/** Turn on logging of console tile selection and loading (to console).
 * @beta
 */
export class ToggleRealityTileLogging extends RenderTargetDebugControlToggleTool {
  public static override toolId = "ToggleRealityTileLogging";
  public get aspect(): DebugControlBoolean { return "logRealityTiles"; }
}

/** Toggles support for intersecting volume classifiers.
 * @beta
 */
export class ToggleVolClassIntersect extends RenderTargetDebugControlToggleTool {
  public static override toolId = "ToggleVCIntersect";
  public get aspect(): DebugControlBoolean { return "vcSupportIntersectingVolumes"; }
}

/** Set the number of antialiasing samples to use (<=1 for no antialiasing).
 * @beta
 */
export class SetAASamplesTool extends RenderTargetDebugControlTool {
  public static override toolId = "SetAASamples";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  private _aaSamples = 1;
  private _changeAll = false;

  public execute(_control: RenderTargetDebugControl, vp: ScreenViewport): void {
    if (this._changeAll)
      IModelApp.viewManager.setAntialiasingAllViews(this._aaSamples);
    else
      vp.antialiasSamples = this._aaSamples;
  }

  /** Runs this tool, setting the number of antialiasing samples to use (<=1 for no antialiasing).
   * @param args contains the arguments used by the tool's run method: args[0] contains the number of samples; optionally args[1] can contain the word "all" in order to set those number of samples for all viewports.
   */
  public override parseAndRun(...args: string[]): boolean {
    if (0 < args.length)
      this._aaSamples = parseInt(args[0], 10);
    this._changeAll = (1 < args.length && args[1].toLowerCase() === "all");

    return this.run(args);
  }
}
