/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { BeDuration } from "@bentley/bentleyjs-core";
import { Camera, ColorDef, Hilite } from "@bentley/imodeljs-common";
import {
  DrawingViewState, FlashMode, FlashSettings, FlashSettingsOptions, IModelApp, TileBoundingBoxes, Tool, Viewport,
} from "@bentley/imodeljs-frontend";
import { parseArgs } from "./parseArgs";
import { parseToggle } from "./parseToggle";

/** Base class for a tool that toggles some aspect of a Viewport.
 * @beta
 */
export abstract class ViewportToggleTool extends Tool {
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 1; }

  protected abstract toggle(vp: Viewport, enable?: boolean): void;

  public run(enable?: boolean): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp)
      this.toggle(vp, enable);

    return true;
  }

  public parseAndRun(...args: string[]): boolean {
    const enable = parseToggle(args[0]);
    if (typeof enable !== "string")
      this.run(enable);

    return true;
  }
}

/** Freeze or unfreeze the scene for the selected viewport. While the scene is frozen, no new tiles will be selected for drawing within the viewport.
 * @beta
 */
export class FreezeSceneTool extends ViewportToggleTool {
  public static toolId = "FreezeScene";

  protected toggle(vp: Viewport, enable?: boolean): void {
    if (undefined === enable || enable !== vp.freezeScene)
      vp.freezeScene = !vp.freezeScene;
  }
}

const boundingVolumeNames = [
  "none",
  "volume",
  "content",
  "both",
  "children",
  "sphere",
];

/** Set the tile bounding volume decorations to display in the selected viewport.
 * Omitting the argument turns on Volume bounding boxes if bounding boxes are currently off; otherwise, toggles them off.
 * Allowed inputs are "none", "volume", "content", "both" (volume and content), "children", and "sphere".
 * @beta
 */
export class ShowTileVolumesTool extends Tool {
  public static toolId = "ShowTileVolumes";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 1; }

  public run(boxes?: TileBoundingBoxes): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp)
      return true;

    if (undefined === boxes)
      boxes = TileBoundingBoxes.None === vp.debugBoundingBoxes ? TileBoundingBoxes.Volume : TileBoundingBoxes.None;

    vp.debugBoundingBoxes = boxes;
    return true;
  }

  public parseAndRun(...args: string[]): boolean {
    let boxes: TileBoundingBoxes | undefined;
    if (0 !== args.length) {
      const arg = args[0].toLowerCase();
      for (let i = 0; i < boundingVolumeNames.length; i++) {
        if (arg === boundingVolumeNames[i]) {
          boxes = i;
          break;
        }
      }

      if (undefined === boxes)
        return true;
    }

    return this.run(boxes);
  }
}

/** This tool sets the aspect ratio skew for the selected viewport.
 * @beta
 */
export class SetAspectRatioSkewTool extends Tool {
  public static toolId = "SetAspectRatioSkew";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 1; }

  /** This method runs the tool, setting the aspect ratio skew for the selected viewport.
   * @param skew the aspect ratio (x/y) skew value; 1.0 or undefined removes any skew
   */
  public run(skew?: number): boolean {
    if (undefined === skew)
      skew = 1.0;

    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp) {
      vp.view.setAspectRatioSkew(skew);
      vp.synchWithView();
    }

    return true;
  }

  /** Executes this tool's run method.
   * @param args the first entry of this array contains the `skew` argument
   * @see [[run]]
   */
  public parseAndRun(...args: string[]): boolean {
    const skew = args.length > 0 ? parseFloat(args[0]) : 1.0;
    return !Number.isNaN(skew) && this.run(skew);
  }
}

/** Changes the selected viewport's hilite or emphasis settings.
 * @beta
 */
export abstract class ChangeHiliteTool extends Tool {
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 6; }

  public run(settings?: Hilite.Settings): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp)
      this.apply(vp, settings);

    return true;
  }

  protected abstract apply(vp: Viewport, settings: Hilite.Settings | undefined): void;
  protected abstract getCurrentSettings(vp: Viewport): Hilite.Settings;

  public parseAndRun(...inputArgs: string[]): boolean {
    if (0 === inputArgs.length)
      return this.run();

    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp)
      return true;

    const cur = this.getCurrentSettings(vp);
    const colors = cur.color.colors;
    let visible = cur.visibleRatio;
    let hidden = cur.hiddenRatio;
    let silhouette = cur.silhouette;

    const args = parseArgs(inputArgs);
    const parseColorComponent = (c: "r" | "g" | "b") => {
      const num = args.getInteger(c);
      if (undefined !== num)
        colors[c] = Math.floor(Math.max(0, Math.min(255, num)));
    };

    parseColorComponent("r");
    parseColorComponent("g");
    parseColorComponent("b");

    const silhouetteArg = args.getInteger("s");
    if (undefined !== silhouetteArg && silhouetteArg >= Hilite.Silhouette.None && silhouetteArg <= Hilite.Silhouette.Thick)
      silhouette = silhouetteArg;

    const v = args.getFloat("v");
    if (undefined !== v && v >= 0 && v <= 1)
      visible = v;

    const h = args.getFloat("h");
    if (undefined !== h && h >= 0 && h <= 1)
      hidden = h;

    if (undefined === silhouette)
      silhouette = cur.silhouette;

    if (undefined === visible)
      visible = cur.visibleRatio;

    if (undefined === hidden)
      hidden = cur.hiddenRatio;

    const settings: Hilite.Settings = {
      color: ColorDef.from(colors.r, colors.g, colors.b),
      silhouette,
      visibleRatio: visible,
      hiddenRatio: hidden,
    };

    return this.run(settings);
  }
}

/** Changes the selected viewport's hilite settings, or resets to defaults.
 * @beta
 */
export class ChangeHiliteSettingsTool extends ChangeHiliteTool {
  public static toolId = "ChangeHiliteSettings";

  protected getCurrentSettings(vp: Viewport) { return vp.hilite; }
  protected apply(vp: Viewport, settings?: Hilite.Settings): void {
    vp.hilite = undefined !== settings ? settings : new Hilite.Settings();
  }
}

/** Changes the selected viewport's emphasis settings.
 * @beta
 */
export class ChangeEmphasisSettingsTool extends ChangeHiliteTool {
  public static toolId = "ChangeEmphasisSettings";

  protected getCurrentSettings(vp: Viewport) { return vp.emphasisSettings; }
  protected apply(vp: Viewport, settings?: Hilite.Settings): void {
    if (undefined !== settings)
      vp.emphasisSettings = settings;
  }
}

/** Changes the [FlashSettings]($frontend) for the selected [Viewport]($frontend).
 * @beta
 */
export class ChangeFlashSettingsTool extends Tool {
  public static toolId = "ChangeFlashSettings";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 3; }

  public run(settings?: FlashSettings): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp)
      vp.flashSettings = settings ?? new FlashSettings();

    return true;
  }

  public parseAndRun(...inputArgs: string[]): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return true;

    if (1 === inputArgs.length && "default" === inputArgs[0].toLowerCase())
      return this.run();

    const options: FlashSettingsOptions = { };
    const args = parseArgs(inputArgs);

    const intensity = args.getFloat("i");
    if (undefined !== intensity)
      options.maxIntensity = intensity;

    const mode = args.get("m");
    if (mode) {
      switch (mode[0].toLowerCase()) {
        case "b":
          options.litMode = FlashMode.Brighten;
          break;
        case "h":
          options.litMode = FlashMode.Hilite;
          break;
        default:
          return false;
      }
    }

    const duration = args.getFloat("d");
    if (undefined !== duration)
      options.duration = BeDuration.fromSeconds(duration);

    return this.run(vp.flashSettings.clone(options));
  }
}

/** Enables or disables fade-out transparency mode for the selected viewport.
 * @beta
 */
export class FadeOutTool extends ViewportToggleTool {
  public static toolId = "FadeOut";

  protected toggle(vp: Viewport, enable?: boolean): void {
    if (undefined === enable || enable !== vp.isFadeOutActive)
      vp.isFadeOutActive = !vp.isFadeOutActive;
  }
}

/** Sets the default tile size modifier used for all viewports that don't explicitly override it.
 * @beta
 */
export class DefaultTileSizeModifierTool extends Tool {
  public static toolId = "DefaultTileSizeMod";
  public static get minArgs() { return 1; }
  public static get maxArgs() { return 1; }

  /** This method runs the tool, setting the default tile size modifier used for all viewports that don't explicitly override it.
   * @param modifier the tile size modifier to use; if undefined, do not set modifier
   */
  public run(modifier?: number): boolean {
    if (undefined !== modifier)
      IModelApp.tileAdmin.defaultTileSizeModifier = modifier;

    return true;
  }

  /** Executes this tool's run method with args[0] containing `modifier`.
   * @see [[run]]
   */
  public parseAndRun(...args: string[]): boolean {
    return this.run(Number.parseFloat(args[0]));
  }
}

/** Sets or clears the tile size modifier override for the selected viewport.
 * @beta
 */
export class ViewportTileSizeModifierTool extends Tool {
  public static toolId = "ViewportTileSizeMod";
  public static get minArgs() { return 1; }
  public static get maxArgs() { return 1; }

  /** This method runs the tool, setting the tile size modifier used for the selected viewport.
   * @param modifier the tile size modifier to use; if undefined, reset the modifier
   */
  public run(modifier?: number): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp)
      vp.setTileSizeModifier(modifier);

    return true;
  }

  /** Executes this tool's run method with args[0] containing the `modifier` argument or the string "reset" in order to reset the modifier.
   * @see [[run]]
   */
  public parseAndRun(...args: string[]): boolean {
    const arg = args[0].toLowerCase();
    const modifier = "reset" === arg ? undefined : Number.parseFloat(args[0]);
    return this.run(modifier);
  }
}

/** This tool adds a reality model to the viewport.
 * @beta
 */
export class ViewportAddRealityModel extends Tool {
  public static toolId = "ViewportAddRealityModel";
  public static get minArgs() { return 1; }
  public static get maxArgs() { return 1; }

  /** This method runs the tool, adding a reality model to the viewport
   * @param url the URL which points to the reality model tileset
   */
  public run(url: string): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp)
      vp.displayStyle.attachRealityModel({ tilesetUrl: url });

    return true;
  }

  /** Executes this tool's run method with args[0] containing the `url` argument.
   * @see [[run]]
   */
  public parseAndRun(...args: string[]): boolean {
    return this.run(args[0]);
  }
}

/** Changes the `allow3dManipulations` flag for the selected viewport if the viewport is displaying a `ViewState3d`.
 * @beta
 */
export class Toggle3dManipulationsTool extends ViewportToggleTool {
  public static toolId = "Toggle3dManipulations";

  protected toggle(vp: Viewport, allow?: boolean): void {
    if (!vp.view.is3d())
      return;

    if (undefined === allow)
      allow = !vp.view.allow3dManipulations();

    if (allow !== vp.view.allow3dManipulations()) {
      vp.view.setAllow3dManipulations(allow);
      IModelApp.toolAdmin.startDefaultTool();
    }
  }
}

/** Toggles display of view attachments in sheet views.
 * @beta
 */
export class ToggleViewAttachmentsTool extends ViewportToggleTool {
  public static toolId = "ToggleViewAttachments";

  protected toggle(vp: Viewport, enable?: boolean): void {
    if (undefined === enable || enable !== vp.wantViewAttachments)
      vp.wantViewAttachments = !vp.wantViewAttachments;
  }
}

/** Toggle display of view attachment boundaries in sheet views.
 * @beta
 */
export class ToggleViewAttachmentBoundariesTool extends ViewportToggleTool {
  public static toolId = "ToggleViewAttachmentBoundaries";

  protected toggle(vp: Viewport, enable?: boolean): void {
    if (undefined === enable || enable !== vp.wantViewAttachmentBoundaries)
      vp.wantViewAttachmentBoundaries = !vp.wantViewAttachmentBoundaries;
  }
}

/** Toggle display of view attachment clip shapes in sheet views.
 * @beta
 */
export class ToggleViewAttachmentClipShapesTool extends ViewportToggleTool {
  public static toolId = "ToggleViewAttachmentClipShapes";

  protected toggle(vp: Viewport, enable?: boolean): void {
    if (undefined === enable || enable !== vp.wantViewAttachmentClipShapes)
      vp.wantViewAttachmentClipShapes = !vp.wantViewAttachmentClipShapes;
  }
}

/** Toggles display of 2d graphics in a [DrawingViewState]($frontend). This setting affects all drawing views until it is reset.
 * @beta
 */
export class ToggleDrawingGraphicsTool extends ViewportToggleTool {
  public static toolId = "ToggleDrawingGraphics";

  protected toggle(vp: Viewport, enable?: boolean): void {
    if (undefined === enable || enable !== DrawingViewState.hideDrawingGraphics) {
      DrawingViewState.hideDrawingGraphics = !DrawingViewState.hideDrawingGraphics;
      vp.invalidateScene();
    }
  }
}

/** Toggles whether a [SectionDrawing]($backend)'s spatial view is always displayed along with the 2d graphics by a [DrawingViewState]($frontend), even
 * if it otherwise would not be. This setting affects all section drawing views until it is reset.
 * @beta
 */
export class ToggleSectionDrawingSpatialViewTool extends ViewportToggleTool {
  public static toolId = "ToggleSectionDrawingSpatialView";

  protected toggle(vp: Viewport, enable?: boolean): void {
    if (undefined === enable || enable !== DrawingViewState.alwaysDisplaySpatialView) {
      DrawingViewState.alwaysDisplaySpatialView = !DrawingViewState.alwaysDisplaySpatialView;
      if (vp.view instanceof DrawingViewState) {
        // Force the view to update its section drawing attachment.
        const view = vp.view.clone();
        view.changeViewedModel(view.baseModelId).then(() => { // eslint-disable-line @typescript-eslint/no-floating-promises
          view.load().then(() => vp.changeView(view)); // eslint-disable-line @typescript-eslint/no-floating-promises
        });
      }
    }
  }
}

/** Change the camera settings of the selected viewport.
 * @beta
 */
export class ChangeCameraTool extends Tool {
  public static get minArgs() { return 1; }
  public static get maxArgs() { return 2; }
  public static toolId = "ChangeCamera";

  public run(camera?: Camera): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (camera && vp && vp.view.is3d()) {
      const view = vp.view.clone();
      view.camera.setFrom(camera);
      vp.changeView(view);
    }

    return true;
  }

  public parseAndRun(...inArgs: string[]): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp || !vp.view.is3d())
      return false;

    const camera = vp.view.camera.clone();
    const args = parseArgs(inArgs);
    const lens = args.getFloat("l");
    if (undefined !== lens)
      camera.lens.setDegrees(lens);

    const focusDist = args.getFloat("d");
    if (undefined !== focusDist)
      camera.focusDist = focusDist;

    return this.run(camera);
  }
}
