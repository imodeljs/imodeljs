/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { EmphasizeElements, IModelApp, ScreenViewport, Tool } from "@bentley/imodeljs-frontend";
import { BentleyStatus, Id64, Id64Array } from "@bentley/bentleyjs-core";
import { ClipPlaneContainment, ClipVector } from "@bentley/geometry-core";
import { ColorDef, GeometryContainmentRequestProps } from "@bentley/imodeljs-common";

/** Color code current selection set based on containment with current view clip.
 * For selecting elements outside clip, turn off clipvolume in view settings dialog.
 * Use EDIT on clip tools dialog to re-display clip decoration after classification.
 */
export class FenceClassifySelectedTool extends Tool {
  public static override toolId = "Fence.ClassifySelected";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 1; }

  public async doClassify(vp: ScreenViewport, candidates: Id64Array, clip: ClipVector, allowOverlaps: boolean): Promise<void> {
    const requestProps: GeometryContainmentRequestProps = {
      candidates,
      clip: clip.toJSON(),
      allowOverlaps,
      viewFlags: vp.viewFlags.toJSON(),
    };

    const result = await vp.iModel.getGeometryContainment(requestProps);
    if (BentleyStatus.SUCCESS !== result.status || undefined === result.candidatesContainment)
      return;

    const inside: Id64Array = [];
    const outside: Id64Array = [];
    const overlap: Id64Array = [];

    result.candidatesContainment.forEach((val, index) => {
      switch (val) {
        case ClipPlaneContainment.StronglyInside:
          inside.push(candidates[index]);
          break;
        case ClipPlaneContainment.Ambiguous:
          overlap.push(candidates[index]);
          break;
        case ClipPlaneContainment.StronglyOutside:
          outside.push(candidates[index]);
          break;
      }
    });

    EmphasizeElements.getOrCreate(vp).overrideElements(inside, vp, ColorDef.green);
    EmphasizeElements.getOrCreate(vp).overrideElements(outside, vp, ColorDef.red);
    EmphasizeElements.getOrCreate(vp).overrideElements(overlap, vp, ColorDef.blue);
    EmphasizeElements.getOrCreate(vp).defaultAppearance = EmphasizeElements.getOrCreate(vp).createDefaultAppearance();
  }

  public override run(insideOnly?: true | undefined): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp)
      return false;

    const isActive = EmphasizeElements.getOrCreate(vp).isActive(vp);
    EmphasizeElements.clear(vp);

    if (undefined === vp.view.getViewClip() || !vp.iModel.selectionSet.isActive)
      return !isActive;

    const candidates: Id64Array = [];
    vp.iModel.selectionSet.elements.forEach((val) => { if (!Id64.isInvalid(val) && !Id64.isTransient(val)) candidates.push(val); });
    if (0 === candidates.length)
      return false;

    vp.iModel.selectionSet.emptyAll();
    this.doClassify(vp, candidates, vp.view.getViewClip()!, insideOnly ? false : true); // eslint-disable-line @typescript-eslint/no-floating-promises
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const insideOnly = (undefined !== args[0] && "inside" === args[0].toLowerCase()) ? true : undefined;
    this.run(insideOnly);
    return true;
  }
}
