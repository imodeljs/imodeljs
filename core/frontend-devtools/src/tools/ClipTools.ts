/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import {
  ClipStyle, ClipStyleProps, ColorByName, ColorDef, LinePixels, RenderMode, RgbColor,
} from "@bentley/imodeljs-common";
import { IModelApp, Tool, Viewport } from "@bentley/imodeljs-frontend";
import { parseToggle } from "./parseToggle";
import { parseBoolean } from "./parseBoolean";
import { DisplayStyleTool } from "./DisplayStyleTools";

/** This tool specifies or unspecifies a clip color to use for pixels inside or outside the clip region.
 * Arguments can be:
 * - clear
 * - inside   <color string> | clear
 * - outside  <color string> | clear
 * <color string> must be in one of the following forms:
 * "rgb(255,0,0)"
 * "rgba(255,0,0,255)"
 * "rgb(100%,0%,0%)"
 * "hsl(120,50%,50%)"
 * "#rrbbgg"
 * "blanchedAlmond" (see possible values from [[ColorByName]]). Case insensitive.
 * @see [ColorDef]
 * @beta
 */
export class ClipColorTool extends Tool {
  public static override toolId = "ClipColorTool";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }

  private _clearClipColors() {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp) {
      const props = vp.displayStyle.settings.clipStyle.toJSON() ?? {};
      props.insideColor = props.outsideColor = undefined;
      vp.displayStyle.settings.clipStyle = ClipStyle.fromJSON(props);
    }
  }

  private setClipColor(colStr: string, which: "insideColor" | "outsideColor") {
    const vp = IModelApp.viewManager.selectedView;
    if (vp) {
      const props = vp.displayStyle.settings.clipStyle.toJSON() ?? {};
      props[which] = colStr === "clear" ? undefined : RgbColor.fromColorDef(ColorDef.fromString(colStr));
      vp.displayStyle.settings.clipStyle = ClipStyle.fromJSON(props);
    }
  }

  /** This runs the tool using the given arguments, specifying or unspecifying a clip color to use for pixels inside or outside the clip region.
   * Arguments can be:
   * - clear
   * - inside   <color string> | clear
   * - outside  <color string> | clear
   * <color string> must be in one of the following forms:
   * "rgb(255,0,0)"
   * "rgba(255,0,0,255)"
   * "rgb(100%,0%,0%)"
   * "hsl(120,50%,50%)"
   * "#rrbbgg"
   * "blanchedAlmond" (see possible values from [[ColorByName]]). Case insensitive.
   * @beta
   */
  public override parseAndRun(...args: string[]): boolean {
    if (1 === args.length) {
      if (args[0] === "clear")
        this._clearClipColors();

      return true;
    }

    const which = args[0];
    if (which === "inside" || which === "outside")
      this.setClipColor(args[1], "inside" === which ? "insideColor" : "outsideColor");

    return true;
  }
}

/** Controls a view state's view details' flag for producing cut geometry for a clip style.
 * @beta
 */
export class ToggleSectionCutTool extends Tool {
  public static override toolId = "ToggleSectionCut";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  /** This method runs the tool, controlling a view state's view details' flag for producing cut geometry for a clip style.
   * @param produceCutGeometry whether to produce cut geometry
   */
  public override run(produceCutGeometry?: boolean): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (vp) {
      const style = vp.view.displayStyle.settings.clipStyle;
      produceCutGeometry = produceCutGeometry ?? !style.produceCutGeometry;
      if (produceCutGeometry !== style.produceCutGeometry) {
        const json = {
          ...vp.view.displayStyle.settings.clipStyle.toJSON(),
          produceCutGeometry,
        };

        vp.view.displayStyle.settings.clipStyle = ClipStyle.fromJSON(json);
        vp.invalidateScene();
      }
    }

    return true;
  }

  /** Executes this tool's run method with args[0] containing `produceCutGeometry`.
   * @see [[run]]
   */
  public override parseAndRun(...args: string[]): boolean {
    const enable = parseToggle(args[0]);
    if (typeof enable !== "string")
      this.run(enable);

    return true;
  }
}

/** Simple tool that toggles a hard-coded clip style overriding various aspects of the cut geometry appearance.
 * @beta
 */
export class TestClipStyleTool extends DisplayStyleTool {
  public static override toolId = "TestClipStyle";
  public static override get maxArgs() { return 1; }
  public static override get minArgs() { return 1; }

  private _useStyle = false;

  protected override get require3d() { return true; }

  protected parse(args: string[]): boolean {
    this._useStyle = parseBoolean(args[0]) ?? false;
    return true;
  }

  protected execute(vp: Viewport): boolean {
    const props: ClipStyleProps = { produceCutGeometry: true };
    if (this._useStyle) {
      props.cutStyle = {
        viewflags: {
          renderMode: RenderMode.SmoothShade,
          visibleEdges: true,
          hiddenEdges: false,
        },
        appearance: {
          rgb: { r: 0xff, g: 0x7f, b: 0 },
          transparency: 0.5,
          nonLocatable: true,
        },
        hiddenLine: {
          visible: {
            ovrColor: true,
            color: ColorByName.blue,
            pattern: LinePixels.Solid,
            width: 3,
          },
        },
      };
    }

    vp.displayStyle.settings.clipStyle = ClipStyle.fromJSON(props);
    vp.invalidateRenderPlan();
    vp.setFeatureOverrideProviderChanged();

    return true;
  }
}
