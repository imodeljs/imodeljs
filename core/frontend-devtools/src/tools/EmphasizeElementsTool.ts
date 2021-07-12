/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import { Id64 } from "@bentley/bentleyjs-core";
import { ColorDef } from "@bentley/imodeljs-common";
import { EmphasizeElements, IModelApp, QueryVisibleFeaturesOptions, ScreenViewport, Tool } from "@bentley/imodeljs-frontend";
import { parseArgs } from "./parseArgs";

/** Applies the `EmphasizeElements` API in some way to the selected Viewport.
 * @beta
 */
export abstract class EmphasizeElementsTool extends Tool {
  protected get _wantCreate(): boolean { return true; }
  protected get _wantClear(): boolean { return false; }
  protected abstract execute(emph: EmphasizeElements, vp: ScreenViewport): void;

  public override run(_args: any[]): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp)
      return true;

    if (this._wantClear)
      EmphasizeElements.clear(vp);

    const emph = this._wantCreate ? EmphasizeElements.getOrCreate(vp) : EmphasizeElements.get(vp);
    if (undefined !== emph)
      this.execute(emph, vp);

    return true;
  }
}

const enum OverrideType { // eslint-disable-line no-restricted-syntax
  None = 0,
  Color = 1 << 0,
  Emphasis = 1 << 1,
  Both = Color | Emphasis,
}

/** If any elements are selected, emphasize them all by overriding their color to be orange; and de-emphasize all other elements by drawing them transparent grey.
 * @beta
 */
export class EmphasizeSelectedElementsTool extends EmphasizeElementsTool {
  public static override toolId = "EmphasizeSelectedElements";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }
  private _type = OverrideType.None;

  public execute(emph: EmphasizeElements, vp: ScreenViewport): void {
    if (OverrideType.None === (this._type & OverrideType.Color) || emph.overrideSelectedElements(vp, ColorDef.white, undefined, true, false)) {
      emph.wantEmphasis = OverrideType.None !== (this._type & OverrideType.Emphasis);
      if (emph.emphasizeSelectedElements(vp, undefined, true)) {
        vp.isFadeOutActive = true;
        return;
      }
    }

    // Empty selection set - clear any previous overrides.
    EmphasizeElements.clear(vp);
    emph.wantEmphasis = false;
    vp.isFadeOutActive = false;
  }

  public override parseAndRun(...args: string[]): boolean {
    if (1 === args.length) {
      switch (args[0].toLowerCase()[0]) {
        case "n":
          break;
        case "c":
          this._type = OverrideType.Color;
          break;
        case "e":
          this._type = OverrideType.Emphasis;
          break;
        case "b":
          this._type = OverrideType.Both;
          break;
      }
    }

    return this.run(args);
  }
}

/** Isolate all selected elements so that *only* those elements will be drawn.
 * @beta
 */
export class IsolateSelectedElementsTool extends EmphasizeElementsTool {
  public static override toolId = "IsolateSelectedElements";
  public execute(emph: EmphasizeElements, vp: ScreenViewport): void {
    emph.isolateSelectedElements(vp, true, true);
  }
}

/** Clear the set of isolated elements.
 * @beta
 */
export class ClearIsolatedElementsTool extends EmphasizeElementsTool {
  public static override toolId = "ClearIsolatedElements";
  protected override get _wantCreate() { return false; }
  public execute(emph: EmphasizeElements, vp: ScreenViewport): void {
    emph.clearIsolatedElements(vp);
  }
}

/** Reset [EmphasizeElements]($frontend) for the active [Viewport]($frontend).
 * @beta
 */
export class ClearEmphasizedElementsTool extends EmphasizeElementsTool {
  public static override toolId = "ClearEmphasizedElements";
  protected override get _wantCreate() { return false; }
  protected override get _wantClear() { return true; }

  public execute(emph: EmphasizeElements, vp: ScreenViewport): void {
    emph.clearEmphasizedElements(vp);
    vp.isFadeOutActive = false;
  }
}

/** Emphasize the set of elements currently visible in the view based on [Viewport.queryVisibleFeatures]($frontend).
 * @beta
 */
export class EmphasizeVisibleElementsTool extends EmphasizeElementsTool {
  public static override toolId = "EmphasizeVisibleElements";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 2; }
  private _options: QueryVisibleFeaturesOptions = { source: "screen" };
  protected override get _wantClear() { return true; }

  public override parseAndRun(...input: string[]): boolean {
    const args = parseArgs(input);
    const includeNonLocatable = args.getBoolean("n");
    let source: "screen" | "tiles";
    switch (input[0].toLowerCase()) {
      case "screen":
        source = "screen";
        break;
      case "tiles":
        source = "tiles";
        break;
      default:
        return false;
    }

    this._options = { source, includeNonLocatable };
    return this.run(input);
  }

  public execute(emph: EmphasizeElements, vp: ScreenViewport): void {
    const elementIds = new Set<string>();
    vp.queryVisibleFeatures(this._options, (features) => {
      for (const feature of features) {
        if (feature.iModel === vp.iModel && Id64.isValid(feature.elementId))
          elementIds.add(feature.elementId);
      }
    });

    emph.wantEmphasis = true;
    if (emph.emphasizeElements(elementIds, vp))
      vp.isFadeOutActive = true;
  }
}
