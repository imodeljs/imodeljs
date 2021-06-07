/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { Id64String } from "@bentley/bentleyjs-core";
import { PlanarClipMaskMode, PlanarClipMaskPriority, PlanarClipMaskSettings } from "@bentley/imodeljs-common";
import {
  BeButtonEvent, ContextRealityModelState, EventHandled, HitDetail, IModelApp, LocateFilterStatus, LocateResponse, PrimitiveTool, ScreenViewport, Tool,
} from "@bentley/imodeljs-frontend";

/** Set Map Masking by selected models.
 * @beta
 */
export class SetMapHigherPriorityMasking extends Tool {
  public static toolId = "SetMapHigherPriorityMask";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 1; }

  public run(transparency?: number): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp)
      return false;

    vp.changeBackgroundMapProps({ planarClipMask: { mode: PlanarClipMaskMode.Priority, priority: PlanarClipMaskPriority.BackgroundMap, transparency } });
    vp.invalidateRenderPlan();
    return true;
  }

  public parseAndRun(...args: string[]): boolean {
    const transparency =  parseFloat(args[0]);
    return this.run( (transparency !== undefined && transparency  < 1.0) ? transparency : undefined);
  }
}

/** Unmask Mask.
 * @beta
 */
export class UnmaskMapTool extends Tool {
  public static toolId = "UnmaskMap";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 0; }

  public run(): boolean {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp)
      return false;

    vp.changeBackgroundMapProps({ planarClipMask: { mode: PlanarClipMaskMode.None } });
    vp.invalidateRenderPlan();
    return true;
  }
  public parseAndRun(..._args: string[]): boolean {
    return this.run();
  }
}

/** Base class for the reality model planar masking tools.
 * @beta
 */
export abstract class PlanarMaskBaseTool extends PrimitiveTool {
  protected readonly _acceptedModelIds = new Set<Id64String>();
  protected readonly _acceptedSubCategoryIds = new Set<Id64String>();
  protected readonly _acceptedElementIds = new Set<Id64String>();
  protected _transparency?: number;
  protected _useSelection: boolean = false;
  protected _targetMaskModel?: Id64String | ContextRealityModelState;

  public requireWriteableTarget(): boolean { return false; }
  public onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }

  public onUnsuspend(): void { this.showPrompt(); }
  private setupAndPromptForNextAction(): void {
    this._useSelection = (undefined !== this.targetView && this.iModel.selectionSet.isActive);
    this.initLocateElements(!this._useSelection || (this.targetModelRequired() && !this._targetMaskModel));
    IModelApp.locateManager.options.allowDecorations = true;    // So we can select "contextual" reality models.
    this.showPrompt();
  }
  protected targetModelRequired(): boolean { return true; }
  protected elementRequired(): boolean { return true; }
  protected allowSelection(): boolean { return true; }
  protected abstract showPrompt(): void;
  protected abstract createToolInstance(): PlanarMaskBaseTool;
  protected abstract applyMask(vp: ScreenViewport): void;
  private clearIds() {
    this._acceptedElementIds.clear();
    this._acceptedModelIds.clear();
  }
  public exitTool() {
    super.exitTool();
    this._transparency = undefined;
  }

  public onRestartTool(): void {
    this.clearIds();
    this._acceptedSubCategoryIds.clear();
    const tool = this.createToolInstance();
    if (!tool.run())
      this.exitTool();
  }

  public parseAndRun(...args: string[]): boolean {
    const transparency =  parseFloat(args[0]);
    this._transparency = (transparency !== undefined && transparency  < 1.0) ? transparency : undefined;
    return this.run();
  }

  public onCleanup(): void {
    if (0 !== this._acceptedElementIds.size)
      this.iModel.hilited.setHilite(this._acceptedElementIds, false);
    this.clearIds();
  }

  public async filterHit(hit: HitDetail, _out?: LocateResponse): Promise<LocateFilterStatus> {
    if (!hit.modelId)
      return LocateFilterStatus.Reject;

    if (undefined === this._targetMaskModel && this.targetModelRequired()) {
      if (undefined !== hit.viewport.displayStyle.contextRealityModelStates.find((x) => x.modelId === hit.modelId))
        return LocateFilterStatus.Accept;

      const model = this.iModel.models.getLoaded(hit.modelId)?.asSpatialModel;
      return model?.isRealityModel ? LocateFilterStatus.Accept : LocateFilterStatus.Reject;
    } else
      return (hit.isElementHit && !hit.isModelHit && !this._acceptedElementIds.has(hit.sourceId)) ? LocateFilterStatus.Accept : LocateFilterStatus.Reject;
  }

  public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const hit = await IModelApp.locateManager.doLocate(new LocateResponse(), true, ev.point, ev.viewport, ev.inputSource);
    const vp = IModelApp.viewManager.selectedView;
    if (undefined === vp)
      return EventHandled.No;

    if (undefined !== hit && undefined === this._targetMaskModel && this.targetModelRequired()) {
      if (hit.modelId) {
        this._targetMaskModel = hit.viewport.displayStyle.contextRealityModelStates.find((x) => x.modelId === hit.modelId) ?? hit.modelId;
        if (!this.elementRequired()) {
          this.applyMask(vp);
          this.onRestartTool();
        }
      }
    } else if (this._useSelection && this.iModel.selectionSet.isActive) {
      const elements = await this.iModel.elements.getProps(this.iModel.selectionSet.elements);
      for (const element of elements) {
        if (element.id && element.model) {
          this._acceptedElementIds.add(element.id);
          this._acceptedModelIds.add(element.model);
        }
      }
      this.applyMask(vp);
      this.exitTool();
      return EventHandled.No;
    } else if (undefined !== hit && hit.isElementHit) {
      const sourceId = hit.sourceId;
      if (!this._acceptedElementIds.has(sourceId)) {
        this._acceptedElementIds.add(sourceId);
        this._acceptedModelIds.add(hit.modelId!);
        if (hit.subCategoryId)
          this._acceptedSubCategoryIds.add(hit.subCategoryId);
        this.applyMask(vp);
      }
    }
    this.setupAndPromptForNextAction();
    return EventHandled.No;
  }

  protected createSubCategoryMask() {
    return PlanarClipMaskSettings.createForElementsOrSubCategories(PlanarClipMaskMode.IncludeSubCategories, this._acceptedSubCategoryIds, this._acceptedModelIds, this._transparency);
  }

  protected createElementMask(option: "include" | "exclude") {
    const mode = "include" === option ? PlanarClipMaskMode.IncludeElements : PlanarClipMaskMode.ExcludeElements;
    return PlanarClipMaskSettings.createForElementsOrSubCategories(mode, this._acceptedElementIds, this._acceptedModelIds, this._transparency);
  }

  protected createModelMask() {
    return PlanarClipMaskSettings.createForModels(this._acceptedModelIds, this._transparency);
  }

  protected setRealityModelMask(vp: ScreenViewport, mask: PlanarClipMaskSettings): void {
    if (typeof this._targetMaskModel === "string")
      vp.displayStyle.settings.planarClipMasks.set(this._targetMaskModel, mask);
    else if (undefined !== this._targetMaskModel)
      this._targetMaskModel.planarClipMaskSettings = mask;
  }
}
/** Tool to mask background map by elements
 * @beta
 */
export class MaskBackgroundMapByElementTool extends PlanarMaskBaseTool {
  public static toolId = "MaskBackgroundMapByElement";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 1; }
  protected targetModelRequired() { return false; }
  protected showPrompt(): void {
    IModelApp.notifications.outputPromptByKey(`FrontendDevTools:tools.MaskBackgroundMapByElement.Prompts.${this._useSelection ? "AcceptSelection" : "IdentifyMaskElement"}`);
  }
  protected createToolInstance(): PlanarMaskBaseTool { return new MaskBackgroundMapByElementTool(); }
  protected applyMask(vp: ScreenViewport): void {
    vp.changeBackgroundMapProps({ planarClipMask: this.createElementMask("include").toJSON() });
  }
}
/** Tool to mask background map by excluded elements
 * @beta
 */
export class MaskBackgroundMapByExcludedElementTool extends PlanarMaskBaseTool {
  public static toolId = "MaskBackgroundMapByExcludedElement";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 1; }
  protected targetModelRequired() { return false; }
  protected showPrompt(): void {
    IModelApp.notifications.outputPromptByKey(`FrontendDevTools:tools.MaskBackgroundMapByExcludedElement.Prompts.${this._useSelection ? "AcceptSelection" : "IdentifyMaskElement"}`);
  }
  protected createToolInstance(): PlanarMaskBaseTool { return new MaskBackgroundMapByExcludedElementTool(); }
  protected applyMask(vp: ScreenViewport): void {
    vp.changeBackgroundMapProps({ planarClipMask: this.createElementMask("exclude").toJSON() });
  }
}

/** Tool to mask background map by SubCategories
 * @beta
 */
export class MaskBackgroundMapBySubCategoryTool extends PlanarMaskBaseTool {
  public static toolId = "MaskBackgroundMapBySubCategory";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 1; }
  protected targetModelRequired() { return false; }
  protected allowSelection(): boolean { return false; }   // Need picking to get subcategory.
  protected showPrompt(): void {
    IModelApp.notifications.outputPromptByKey("FrontendDevTools:tools.MaskBackgroundMapBySubCategory.Prompts.IdentifyMaskSubCategory");
  }
  protected createToolInstance(): PlanarMaskBaseTool { return new MaskBackgroundMapBySubCategoryTool(); }
  protected applyMask(vp: ScreenViewport): void {
    vp.changeBackgroundMapProps({ planarClipMask: this.createSubCategoryMask().toJSON() });
  }
}

/** Tool to mask background map by geometric models
 * @beta
 */
export class MaskBackgroundMapByModelTool extends PlanarMaskBaseTool {
  public static toolId = "MaskBackgroundMapByModel";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 1; }
  protected targetModelRequired() { return false; }
  protected showPrompt(): void {
    IModelApp.notifications.outputPromptByKey(`FrontendDevTools:tools.MaskBackgroundMapByModel.Prompts.${this._useSelection ? "AcceptSelection" : "IdentifyMaskModel"}`);
  }
  protected createToolInstance(): PlanarMaskBaseTool { return new MaskBackgroundMapByModelTool(); }
  protected applyMask(vp: ScreenViewport): void {
    vp.changeBackgroundMapProps({ planarClipMask: this.createModelMask().toJSON() });
  }
}

/** Tool to mask reality model by elements
 * @beta
 */
export class MaskRealityModelByElementTool extends PlanarMaskBaseTool {
  public static toolId = "MaskRealityModelByElement";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 1; }
  protected targetModelRequired() { return true; }

  protected showPrompt(): void {
    const key = `FrontendDevTools:tools.MaskRealityModelByElement.Prompts.${  this._targetMaskModel === undefined ? "IdentifyRealityModel" : (this._useSelection ? "AcceptSelection" : "IdentifyMaskElement")}`;
    IModelApp.notifications.outputPromptByKey(key);
  }
  protected createToolInstance(): PlanarMaskBaseTool { return new MaskRealityModelByElementTool(); }
  protected applyMask(vp: ScreenViewport): void {
    this.setRealityModelMask(vp, this.createElementMask("include"));
  }
}

/** Tool to mask reality model by excluded elements
 * @beta
 */
export class MaskRealityModelByExcludedElementTool extends PlanarMaskBaseTool {
  public static toolId = "MaskRealityModelByExcludedElement";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 1; }
  protected targetModelRequired() { return true; }

  protected showPrompt(): void {
    const key = `FrontendDevTools:tools.MaskRealityModelByExcludedElement.Prompts.${this._targetMaskModel === undefined ? "IdentifyRealityModel" : (this._useSelection ? "AcceptSelection" : "IdentifyMaskElement")}`;
    IModelApp.notifications.outputPromptByKey(key);
  }
  protected createToolInstance(): PlanarMaskBaseTool { return new MaskRealityModelByExcludedElementTool(); }
  protected applyMask(vp: ScreenViewport): void {
    this.setRealityModelMask(vp, this.createElementMask("exclude"));
  }
}

/** Tool to mask reality model by geometric models
 * @beta
 */

export class MaskRealityModelByModelTool extends PlanarMaskBaseTool {
  public static toolId = "MaskRealityModelByModel";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 1; }

  protected targetModelRequired() { return true; }

  protected showPrompt(): void {
    const key = `FrontendDevTools:tools.MaskRealityModelByModel.Prompts.${this._targetMaskModel === undefined ? "IdentifyRealityModel" : (this._useSelection ? "AcceptSelection" : "IdentifyMaskModel")}`;
    IModelApp.notifications.outputPromptByKey(key);
  }
  protected createToolInstance(): PlanarMaskBaseTool { return new MaskRealityModelByModelTool(); }
  protected applyMask(vp: ScreenViewport): void {
    this.setRealityModelMask(vp, this.createModelMask());
  }
}

/** Tool to mask reality model by SubCategories
 * @beta
 */
export class MaskRealityModelBySubCategoryTool extends PlanarMaskBaseTool {
  public static toolId = "MaskRealityModelBySubCategory";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 1; }
  protected targetModelRequired() { return true; }
  protected allowSelection(): boolean { return false; }   // Need picking to get subcategory.

  protected showPrompt(): void {
    const key = `FrontendDevTools:tools.MaskRealityModelByModel.Prompts.${  this._targetMaskModel === undefined ? "IdentifyRealityModel" : "IdentifyMaskSubCategory"}`;
    IModelApp.notifications.outputPromptByKey(key);
  }
  protected createToolInstance(): PlanarMaskBaseTool { return new MaskRealityModelBySubCategoryTool(); }
  protected applyMask(vp: ScreenViewport): void {
    this.setRealityModelMask(vp, this.createSubCategoryMask());
  }
}

/** Tool to mask reality model by higher priority models.
 * @beta
 */
export class SetHigherPriorityRealityModelMasking extends PlanarMaskBaseTool {
  public static toolId = "SetHigherPriorityRealityModelMasking";
  public static get minArgs() { return 0; }
  public static get maxArgs() { return 2; }
  protected targetModelRequired() { return true; }
  protected elementRequired() { return false; }
  private _priority = 0;

  protected showPrompt(): void {
    IModelApp.notifications.outputPromptByKey("FrontendDevTools:tools.SetHigherPriorityRealityModelMasking.Prompts.IdentifyRealityModel");
  }
  protected createToolInstance(): PlanarMaskBaseTool { return new SetHigherPriorityRealityModelMasking(); }
  protected applyMask(vp: ScreenViewport): void {
    const basePriority = this._targetMaskModel === vp.displayStyle.getOSMBuildingRealityModel() ? PlanarClipMaskPriority.GlobalRealityModel : PlanarClipMaskPriority.RealityModel;
    this.setRealityModelMask(vp, PlanarClipMaskSettings.createByPriority(basePriority + this._priority, this._transparency)!);
  }

  public parseAndRun(...args: string[]): boolean {
    super.parseAndRun(...args);
    const priority = parseInt(args[0], 10);
    this._priority = (priority === undefined || isNaN(priority)) ? 0 : priority;
    return this.run();
  }
}

/** Remove masks from reality model.
 * @beta
 */
export class UnmaskRealityModelTool extends PlanarMaskBaseTool {
  public static toolId = "UnmaskRealityModel";
  protected targetModelRequired() { return true; }

  protected showPrompt(): void {
    IModelApp.notifications.outputPromptByKey("FrontendDevTools:tools.UnmaskRealityModel.Prompts.IdentifyRealityModel");
  }
  protected createToolInstance(): PlanarMaskBaseTool { return new UnmaskRealityModelTool(); }
  protected applyMask(vp: ScreenViewport): void {
    const settings = PlanarClipMaskSettings.createForElementsOrSubCategories(PlanarClipMaskMode.IncludeSubCategories, this._acceptedSubCategoryIds, this._acceptedModelIds);
    this.setRealityModelMask(vp, settings);
  }
  public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const hit = await IModelApp.locateManager.doLocate(new LocateResponse(), true, ev.point, ev.viewport, ev.inputSource);
    if (hit?.modelId) {
      const model = hit.viewport.displayStyle.contextRealityModelStates.find((x) => x.modelId === hit.modelId);
      if (model)
        model.planarClipMaskSettings = undefined;
      else
        hit.viewport.displayStyle.settings.planarClipMasks.delete(hit.modelId);

      this.onRestartTool();
    }

    return EventHandled.No;
  }
}
