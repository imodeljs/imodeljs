/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { IModelApp, NotifyMessageDetails, OutputMessagePriority, RenderSystemDebugControl, Tool } from "@bentley/imodeljs-frontend";
import { parseToggle } from "./parseToggle";

/** Executes some code against a RenderSystemDebugControl obtained from the IModelApp's RenderSystem.
 * @beta
 */
export abstract class RenderSystemDebugControlTool extends Tool {
  public override run(_args: any[]): boolean {
    const control = IModelApp.renderSystem.debugControl;
    if (undefined !== control)
      this.execute(control);

    return true;
  }

  protected abstract execute(_control: RenderSystemDebugControl): void;
}

/** Forces webgl context loss.
 * @beta
 */
export class LoseWebGLContextTool extends RenderSystemDebugControlTool {
  public static override toolId = "LoseWebGLContext";
  public execute(control: RenderSystemDebugControl): void {
    control.loseContext();
  }
}

/** Toggles pseudo-wiremesh surface display, for better visualization of mesh faces.
 * @beta
 */
export class ToggleWiremeshTool extends RenderSystemDebugControlTool {
  public static override toolId = "ToggleWiremesh";
  public execute(control: RenderSystemDebugControl): void {
    control.drawSurfacesAsWiremesh = !control.drawSurfacesAsWiremesh;
  }
}

/** Compiles all registered shader programs for which compilation has not already been attempted.
 * This is useful for uncovering/debugging platform-specific shader issues.
 * @beta
 */
export class CompileShadersTool extends RenderSystemDebugControlTool {
  public static override toolId = "CompileShaders";
  public execute(control: RenderSystemDebugControl): void {
    const compiled = control.compileAllShaders();
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(compiled ? OutputMessagePriority.Info : OutputMessagePriority.Error, `${compiled ? "No" : "Some"} compilation errors occurred.`));
  }
}

/** Toggles whether or not device pixel ratio should be taken into account when computing LOD for tiles and decoration graphics.
 * @see [RenderSystem.Options.dpiAwareLOD]($frontend)
 * @beta
 */
export class ToggleDPIForLODTool extends RenderSystemDebugControlTool {
  public static override toolId = "ToggleDPIForLOD";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  private _enable?: boolean;

  public execute(control: RenderSystemDebugControl): void {
    const enable = this._enable ?? !control.dpiAwareLOD;
    control.dpiAwareLOD = enable;
    IModelApp.viewManager.invalidateViewportScenes();
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
