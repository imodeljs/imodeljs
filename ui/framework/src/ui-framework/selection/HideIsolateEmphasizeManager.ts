/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import { BeEvent, GuidString, Id64String } from "@bentley/bentleyjs-core";
import { FeatureAppearance, GeometricElementProps } from "@bentley/imodeljs-common";
import { EmphasizeElements, FeatureOverrideProvider, FeatureSymbology, IModelApp, IModelConnection, ScreenViewport, Viewport } from "@bentley/imodeljs-frontend";
import { Presentation } from "@bentley/presentation-frontend";
import { SyncUiEventDispatcher } from "../syncui/SyncUiEventDispatcher";
import { UiFramework } from "../UiFramework";

/** Supported Hide, Isolate, and Emphasize Actions. These also serve as FeatureTracking Ids.
 * @public
 */
export enum HideIsolateEmphasizeAction {
  EmphasizeSelectedElements = "EmphasizeSelectedElements",
  IsolateSelectedElements = "IsolateSelectedElements",
  IsolateSelectedCategories = "IsolateSelectedCategories",
  IsolateSelectedModels = "IsolateSelectedModels",
  HideSelectedElements = "HideSelectedElements",
  HideSelectedModels = "HideSelectedModels",
  HideSelectedCategories = "HideSelectedCategories",
  ClearHiddenIsolatedEmphasized = "ClearHiddenIsolatedEmphasized",
  ClearOverrideModels = "ClearOverrideModels",
  ClearOverrideCategories = "ClearOverrideCategories",
}

const featureIdMap = new Map<HideIsolateEmphasizeAction, GuidString>([
  [HideIsolateEmphasizeAction.EmphasizeSelectedElements, "d74eb93f-deae-4700-8da6-1013a8a7aa26"],
  [HideIsolateEmphasizeAction.IsolateSelectedElements, "24327638-1611-45fa-a379-fa73329098ec"],
  [HideIsolateEmphasizeAction.IsolateSelectedCategories, "e58081ab-2c33-4a15-924f-71082b58ca3b"],
  [HideIsolateEmphasizeAction.IsolateSelectedModels, "3475921e-7dd1-4547-993e-a3e284ef8b62"],
  [HideIsolateEmphasizeAction.HideSelectedElements, "2ca673ec-001a-4890-bc25-18bc88358fe0"],
  [HideIsolateEmphasizeAction.HideSelectedModels, "8b41e859-ae17-4e19-b220-87a5cf9f8242"],
  [HideIsolateEmphasizeAction.HideSelectedCategories, "c5d6916b-e8d7-4796-bae9-a5303712d46b"],
  [HideIsolateEmphasizeAction.ClearHiddenIsolatedEmphasized, "7b135c8a-3f3c-4297-b36c-b0ac51f1d8de"],
  [HideIsolateEmphasizeAction.ClearOverrideModels, "6e519b94-edab-4b13-9ce7-0bcdfa27ccfe"],
  [HideIsolateEmphasizeAction.ClearOverrideCategories, "9d2be3c6-6992-4c30-84eb-10f6b9379d06"],
]);

/** Selection Context Action Event Argument
 * @public
 */
export interface EmphasizeElementsChangedArgs {
  /** viewport where action was performed */
  readonly viewport: ScreenViewport;
  /** action being performed */
  readonly action: HideIsolateEmphasizeAction;
}

/** Overrides given models to provide emphasize functionality
 * @public
 */
// istanbul ignore next
class ModelOverrideProvider implements FeatureOverrideProvider {
  constructor(public modelIds: string[], public defaultAppearance: FeatureAppearance) { }

  public addFeatureOverrides(overrides: FeatureSymbology.Overrides, _viewport: Viewport): void {
    overrides.setDefaultOverrides(this.defaultAppearance, true);
    // Override with nothing so that we keep the model looking normal and override the default appearance of everything else
    const emptyAppearance = FeatureAppearance.fromJSON({});
    this.modelIds.forEach((modelId: string) => {
      overrides.overrideModel(modelId, emptyAppearance, true);
    });
  }
}

/** Overrides given categories to provide emphasize functionality
 *  @public
 */
// istanbul ignore next
class SubCategoryOverrideProvider implements FeatureOverrideProvider {
  constructor(public subCategoryIds: string[], public defaultAppearance: FeatureAppearance) { }

  public addFeatureOverrides(overrides: FeatureSymbology.Overrides, _viewport: Viewport): void {
    overrides.setDefaultOverrides(this.defaultAppearance, true);
    // Override with nothing so that we keep the category looking normal and override the default appearance of everything else
    const emptyAppearance = FeatureAppearance.fromJSON({});
    this.subCategoryIds.forEach((id: string) => {
      overrides.overrideSubCategory(id, emptyAppearance, true);
    });
  }
}

/** Cache of Models that are inside of subjects */
// istanbul ignore next
class SubjectModelIdsCache {
  private _imodel: IModelConnection;
  private _subjectsHierarchy: Map<Id64String, Id64String[]> | undefined;
  private _subjectModels: Map<Id64String, Id64String[]> | undefined;
  private _init: Promise<void> | undefined;

  constructor(imodel: IModelConnection) {
    this._imodel = imodel;
  }

  private async initSubjectsHierarchy() {
    this._subjectsHierarchy = new Map();
    const ecsql = `SELECT ECInstanceId id, Parent.Id parentId FROM bis.Subject WHERE Parent IS NOT NULL`;
    const result = this._imodel.query(ecsql, undefined, 1000);
    for await (const row of result) {
      let list = this._subjectsHierarchy.get(row.parentId);
      if (!list) {
        list = [];
        this._subjectsHierarchy.set(row.parentId, list);
      }
      list.push(row.id);
    }
  }

  private async initSubjectModels() {
    this._subjectModels = new Map();
    const ecsql = `SELECT p.ECInstanceId id, p.Parent.Id subjectId FROM bis.InformationPartitionElement p JOIN bis.Model m ON m.ModeledElement.Id = p.ECInstanceId`;
    const result = this._imodel.query(ecsql, undefined, 1000);
    for await (const row of result) {
      let list = this._subjectModels.get(row.subjectId);
      if (!list) {
        list = [];
        this._subjectModels.set(row.subjectId, list);
      }
      list.push(row.id);
    }
  }

  private async initCache() {
    if (!this._init) {
      this._init = Promise.all([this.initSubjectModels(), this.initSubjectsHierarchy()]).then(() => { });
    }
    return this._init;
  }

  private appendSubjectModelsRecursively(modelIds: Id64String[], subjectId: Id64String) {
    const subjectModelIds = this._subjectModels!.get(subjectId);
    if (subjectModelIds)
      modelIds.push(...subjectModelIds);

    const childSubjectIds = this._subjectsHierarchy!.get(subjectId);
    if (childSubjectIds)
      childSubjectIds.forEach((cs) => this.appendSubjectModelsRecursively(modelIds, cs));
  }

  public async getSubjectModelIds(subjectId: Id64String): Promise<Id64String[]> {
    await this.initCache();
    const modelIds = new Array<Id64String>();
    this.appendSubjectModelsRecursively(modelIds, subjectId);
    return modelIds;
  }
}

/**
 * Interface for class that handles Hide, Isolate, and Emphasize Actions
 * @public
 */
export abstract class HideIsolateEmphasizeActionHandler {
  public static emphasizeElementsChanged = new BeEvent<(args: EmphasizeElementsChangedArgs) => void>();

  /** String Id sent to allow UI to refresh its display state.  */
  public static get hideIsolateEmphasizeUiSyncId() {
    return "selection-context-emphasize-elements-changed";
  }

  /**
   * Function run when `IsolateSelectedElementsModel` tool button is pressed
   */
  public abstract processIsolateSelectedElementsModel(): Promise<void>;
  /**
   * Function run when `IsolateSelectedElementsModel` tool button is pressed
   */

  public abstract processIsolateSelectedElementsCategory(): Promise<void>;

  /**
   * Function run when `HideSelectedElementsModel` tool button is pressed
   */
  public abstract processIsolateSelected(): Promise<void>;

  /**
   * Function run when `HideSelectedElementsModel` tool button is pressed
   */
  public abstract processHideSelectedElementsModel(): Promise<void>;

  /**
   * Function that is run when `HideSelectedElementsCategory` tool button is pressed
   */
  public abstract processHideSelectedElementsCategory(): Promise<void>;

  /**
   * Function that is run when `HideSelected` tool button is pressed
   */
  public abstract processHideSelected(): Promise<void>;

  /**
   * Function that is run when `EmphasizeSelected` tool button is pressed
   */
  public abstract processEmphasizeSelected(): Promise<void>;

  /**
   * Function that is run when `ClearEmphasize` tool button is pressed
   */
  public abstract processClearEmphasize(): Promise<void>;

  /**
   * Function that informs called if Hide, Isolate, or Emphasize of elements is active.
   */
  public abstract areFeatureOverridesActive(vp: Viewport): boolean;

  /**
   * Function run when `ClearOverrideCategories` tool button is pressed
   */
  public abstract processClearOverrideCategories(): Promise<void>;

  /**
   * Function run when `ClearOverrideModels` tool button is pressed
   */
  public abstract processClearOverrideModels(): Promise<void>;
}

/** Provides helper functions for doing commands on logical selection like categories and subjects.
 * @public
 */
// istanbul ignore next
export class HideIsolateEmphasizeManager extends HideIsolateEmphasizeActionHandler {
  // TODO: We need to check the type by going to backend, not by using classnames
  private static _categoryClassName = "BisCore:SpatialCategory";
  private static _subjectClassName = "BisCore:Subject";
  private static _modelClassName = "BisCore:PhysicalModel";
  private static _subjectModelIdsCache: SubjectModelIdsCache | undefined = undefined;
  private static _overrideCategoryIds = new Map<Viewport, Set<string>>();
  private static _overrideModelIds = new Map<Viewport, Set<string>>();

  /**
   * Initialize the subject model cache
   * @param iModelConnection iModel to use for querying subject's models
   */
  public static initializeSubjectModelCache(iModelConnection: IModelConnection) {
    HideIsolateEmphasizeManager._subjectModelIdsCache = new SubjectModelIdsCache(iModelConnection);
  }

  /**
   * Returns true if the selection in presentation layer only has a single selection class and it is the given one
   * @param className ECClass name to check for
   */
  private static _checkClassSelected(className: string) {
    if (!UiFramework.getIModelConnection())
      throw new Error("Undefined iModelConnection");

    const selection = Presentation.selection.getSelection(UiFramework.getIModelConnection()!);
    return selection.size === 1 && selection.instanceKeys.has(className);
  }

  /**
   * Gets the Ids of all elements selected that have the given class name
   * @param className ECClass name to check for
   */
  private static _getIdsOfClassName(className: string) {
    if (!UiFramework.getIModelConnection())
      throw new Error("Undefined iModelConnection");

    const selection = Presentation.selection.getSelection(UiFramework.getIModelConnection()!);
    const ids: string[] = [];
    selection.instanceKeys.forEach((currentIds: Set<string>, key: string) => {
      if (key === className)
        ids.push(...currentIds);
    });
    return ids;
  }

  /** Returns true if there are only categories selected in presentation's logical selection */
  private static categorySelected() {
    return HideIsolateEmphasizeManager._checkClassSelected(HideIsolateEmphasizeManager._categoryClassName);
  }

  /** Returns true if there are only subjects selected in presentation's logical selection */
  private static subjectSelected() {
    return HideIsolateEmphasizeManager._checkClassSelected(HideIsolateEmphasizeManager._subjectClassName);
  }

  /** Returns true if a model is selected in presentation's logical selection */
  private static modelSelected() {
    return HideIsolateEmphasizeManager._checkClassSelected(HideIsolateEmphasizeManager._modelClassName);
  }

  /**
   * Hide the selected category found in presentation layer's logical selection
   * @param vp Viewport to affect
   */
  private static hideSelectedCategory(vp: Viewport) {
    const ids = HideIsolateEmphasizeManager._getIdsOfClassName(HideIsolateEmphasizeManager._categoryClassName);
    vp.changeCategoryDisplay(ids, false);
  }

  /** Get sub categories that relate to the category Id */
  private static async _getSubCategories(iModelConnection: IModelConnection, categoryIds: string[]) {
    const allSubcats: string[] = [];
    const request = iModelConnection.subcategories.load(categoryIds);
    if (request)
      await request.promise;

    for (const categoryId of categoryIds) {
      const subcats = iModelConnection.subcategories.getSubCategories(categoryId);
      if (subcats)
        allSubcats.push(...subcats);
    }
    return allSubcats;
  }

  /**
   * Emphasize the selected category found in presentation layer's logical selection
   * @param vp Viewport to affect
   */
  public static async emphasizeSelectedCategory(vp: Viewport) {
    const ids = HideIsolateEmphasizeManager._getIdsOfClassName(HideIsolateEmphasizeManager._categoryClassName);
    if (ids.length === 0)
      return;

    const defaultAppearance = EmphasizeElements.getOrCreate(vp).createDefaultAppearance();
    EmphasizeElements.clear(vp);
    const subcats = await HideIsolateEmphasizeManager._getSubCategories(vp.iModel, ids);
    vp.addFeatureOverrideProvider(new SubCategoryOverrideProvider(subcats, defaultAppearance));
  }

  /**
   * Query the model Id that models a subject
   * @param subjectId Subject Id to use in query
   */
  private static async _getModelIds(subjectId: string): Promise<string[]> {
    return HideIsolateEmphasizeManager._subjectModelIdsCache!.getSubjectModelIds(subjectId);
  }

  /**
   * Hide the selected subject's model found in the presentation layer's logical selection
   * @param vp Viewport to affect
   */
  private static async hideSelectedSubject(vp: Viewport) {
    const ids = HideIsolateEmphasizeManager._getIdsOfClassName(HideIsolateEmphasizeManager._subjectClassName);
    if (ids.length === 0)
      return;

    const modelIds = await HideIsolateEmphasizeManager._getModelIds(ids[0]);
    vp.changeModelDisplay(modelIds, false);
  }

  /**
   * Isolate the selected subject's model found in the presentation layer's logical selection
   * @param vp Viewport to affect
   */
  private static async emphasizeSelectedSubject(vp: Viewport) {
    const ids = HideIsolateEmphasizeManager._getIdsOfClassName(HideIsolateEmphasizeManager._subjectClassName);
    if (ids.length === 0)
      return;

    const modelIds = await HideIsolateEmphasizeManager._getModelIds(ids[0]);
    const defaultAppearance = EmphasizeElements.getOrCreate(vp).createDefaultAppearance();
    EmphasizeElements.clear(vp);
    vp.addFeatureOverrideProvider(new ModelOverrideProvider(modelIds, defaultAppearance));
  }

  /**
   * Hide the selected model
   * @param vp Viewport to affect
   */
  private static hideSelectedModel(vp: Viewport) {
    const ids = HideIsolateEmphasizeManager._getIdsOfClassName(HideIsolateEmphasizeManager._modelClassName);
    if (ids.length === 0)
      return;

    vp.changeModelDisplay(ids, false);
  }

  /**
   * Isolate the selected model
   * @param vp Viewport to affect
   */
  private static emphasizeSelectedModel(vp: Viewport) {
    const ids = HideIsolateEmphasizeManager._getIdsOfClassName(HideIsolateEmphasizeManager._modelClassName);
    if (ids.length === 0)
      return;

    const defaultAppearance = EmphasizeElements.getOrCreate(vp).createDefaultAppearance();
    EmphasizeElements.clear(vp);
    vp.addFeatureOverrideProvider(new ModelOverrideProvider(ids, defaultAppearance));
  }

  /**
   * Isolate the selected elements
   * @param vp Viewport to affect
   */
  public static isolateSelected(vp: Viewport) {
    EmphasizeElements.getOrCreate(vp).isolateSelectedElements(vp, true, false); // Isolate selected elements
  }

  /**
   * Hide the selected elements
   * @param vp Viewport to affect
   */
  public static hideSelected(vp: Viewport) {
    EmphasizeElements.getOrCreate(vp).hideSelectedElements(vp, false, false); // Hide all selected elements
  }

  /**
   * Clear Hidden,Isolated, or Emphasized elements in specified view
   * @param vp Viewport to affect
   *
   */
  public static clearEmphasize(vp: Viewport | undefined) {
    if (vp) {
      EmphasizeElements.clear(vp);
    }
  }

  /**
   * Emphasize the selected elements from either presentation layer's logical selection or selected graphics
   * @param vp Viewport to affect
   * @param emphasisSilhouette defaults to true
   */
  public static async emphasizeSelected(vp: Viewport, emphasisSilhouette = true) {
    if (HideIsolateEmphasizeManager.categorySelected()) {
      await HideIsolateEmphasizeManager.emphasizeSelectedCategory(vp);
      return;
    } else if (HideIsolateEmphasizeManager.modelSelected()) {
      HideIsolateEmphasizeManager.emphasizeSelectedModel(vp);
      return;
    } else if (HideIsolateEmphasizeManager.subjectSelected()) {
      await HideIsolateEmphasizeManager.emphasizeSelectedSubject(vp);
      return;
    }

    const ee = EmphasizeElements.getOrCreate(vp);
    ee.wantEmphasis = emphasisSilhouette;

    ee.emphasizeSelectedElements(vp, undefined, true, false); // Emphasize elements by making all others grey/transparent
    vp.isFadeOutActive = true; // Enable flat alpha for greyed out elements…
  }

  /**
   * Isolate the selected subject's model found in the presentation layer's logical selection
   * @param vp Viewport to affect
   */
  public static async isolateSelectedSubject(vp: Viewport) {
    const ids = HideIsolateEmphasizeManager._getIdsOfClassName(HideIsolateEmphasizeManager._subjectClassName);
    if (ids.length === 0)
      return;

    const modelIds = await HideIsolateEmphasizeManager._getModelIds(ids[0]);
    await vp.replaceViewedModels(modelIds);
  }

  /**
   * Isolate the selected model
   * @param vp Viewport to affect
   */
  public static async isolateSelectedModel(vp: Viewport) {
    const ids = HideIsolateEmphasizeManager._getIdsOfClassName(HideIsolateEmphasizeManager._modelClassName);
    if (ids.length === 0)
      return;

    await vp.replaceViewedModels(ids);
  }

  /**
   * Isolate the selected category found in presentation layer's logical selection
   * @param vp Viewport to affect
   */
  private static isolateSelectedCategory(vp: Viewport) {
    const ids = new Set(HideIsolateEmphasizeManager._getIdsOfClassName(HideIsolateEmphasizeManager._categoryClassName));
    const categoriesToDrop: string[] = [];
    vp.view.categorySelector.categories.forEach((categoryId: string) => {
      if (!ids.has(categoryId))
        categoriesToDrop.push(categoryId);
    });
    vp.changeCategoryDisplay(categoriesToDrop, false);
    vp.changeCategoryDisplay(ids, true);
  }

  private static async getSelectionSetElementModels(iModel: IModelConnection) {
    const props = await iModel.elements.getProps(iModel.selectionSet.elements);
    const modelIds = new Set<string>();
    for (const prop of props)
      if (prop.model)
        modelIds.add(prop.model);
    return modelIds;
  }

  private static async getSelectionSetElementCategories(iModel: IModelConnection) {
    const props = (await iModel.elements.getProps(iModel.selectionSet.elements)) as GeometricElementProps[];
    const categoryIds = new Set<string>();
    for (const prop of props)
      if (prop.category)
        categoryIds.add(prop.category);
    return categoryIds;
  }

  /**
   * Isolate either based on Presentation selection, if defined, else the selected graphic elements
   * @param vp Viewport to affect
   */
  public static async isolateCommand(vp: Viewport) {
    if (HideIsolateEmphasizeManager.categorySelected()) {
      HideIsolateEmphasizeManager.isolateSelectedCategory(vp);
      return;
    } else if (HideIsolateEmphasizeManager.modelSelected()) {
      await HideIsolateEmphasizeManager.isolateSelectedModel(vp);
      return;
    } else if (HideIsolateEmphasizeManager.subjectSelected()) {
      await HideIsolateEmphasizeManager.isolateSelectedSubject(vp);
      return;
    }
  }

  /**
   * Isolate model from selected elements
   * @param vp Viewport to affect
   */
  public static async isolateSelectedElementsModel(vp: Viewport) {
    const modelsToKeep = new Set(await HideIsolateEmphasizeManager.getSelectionSetElementModels(vp.iModel));

    if (vp.view.isSpatialView()) {
      const modelsToTurnOff = [...vp.view.modelSelector.models].filter((modelId: string) => !modelsToKeep.has(modelId));
      this.updateModelOverride (vp, modelsToTurnOff);
    }

    await vp.replaceViewedModels(modelsToKeep);
  }

  /**
   * Isolate the selected category found in SelectionSet elements
   * @param vp Viewport to affect
   */
  public static async isolateSelectedElementsCategory(vp: Viewport) {
    const categoriesToKeep = new Set(await HideIsolateEmphasizeManager.getSelectionSetElementCategories(vp.iModel));
    const categoriesToTurnOff = [...vp.view.categorySelector.categories].filter((categoryId: string) => !categoriesToKeep.has(categoryId));
    vp.changeCategoryDisplay(categoriesToTurnOff, false);
    vp.changeCategoryDisplay(categoriesToKeep, true);
    this.updateCategoryOverride (vp, categoriesToTurnOff);
  }

  /**
   * Hide either based on Presentation selection, if defined, else the selected graphic elements
   * @param vp Viewport to affect
   */
  public static async hideCommand(vp: Viewport) {
    if (HideIsolateEmphasizeManager.categorySelected()) {
      HideIsolateEmphasizeManager.hideSelectedCategory(vp);
      return;
    } else if (HideIsolateEmphasizeManager.modelSelected()) {
      HideIsolateEmphasizeManager.hideSelectedModel(vp);
      return;
    } else if (HideIsolateEmphasizeManager.subjectSelected()) {
      await HideIsolateEmphasizeManager.hideSelectedSubject(vp);
      return;
    }
    EmphasizeElements.getOrCreate(vp).hideSelectedElements(vp, false, false); // Hide selected elements
  }

  /**
   * Hide the models defined by the elements in the current SelectionSet
   * @param vp Viewport to affect
   */
  public static async hideSelectedElementsModel(vp: Viewport) {
    const modelIds = await HideIsolateEmphasizeManager.getSelectionSetElementModels(vp.iModel);
    vp.changeModelDisplay(modelIds, false);
    this.updateModelOverride (vp, [...modelIds]);
  }

  /**
   * Clear (restore) the previously hidden/isolated models hidden by hideSelectedElementsModel
   * @param vp Viewport to affect
   */
  public static clearOverrideModels(vp: Viewport) {
    const ids = this._overrideModelIds.get(vp);
    if (ids) {
      vp.changeModelDisplay([...ids], true);
      this.clearModelOverride(vp);
    }
  }

  /**
   * Determine if models are hidden by hideSelectedElementsModel or isolateSelectedElementsModel
   * @param vp Viewport to affect
   */
  public static isOverrideModels(vp: Viewport): boolean {
    const ids = this._overrideModelIds.get(vp);
    return (ids) ? [...ids].length > 0 : false;
  }

  /**
   * Determine if categories are hidden by hideSelectedElementsCategory or isolateSelectedElementsCategory
   * @param vp Viewport to affect
   */
  public static isOverrideCategories(vp: Viewport): boolean {
    const ids = this._overrideCategoryIds.get(vp);
    return (ids) ? [...ids].length > 0 : false;
  }

  /**
   * Hide the categories defined by the elements in the current SelectionSet
   * @param vp Viewport to affect
   */
  public static async hideSelectedElementsCategory(vp: Viewport) {
    const categoryIds = await HideIsolateEmphasizeManager.getSelectionSetElementCategories(vp.iModel);
    vp.changeCategoryDisplay(categoryIds, false);
    this.updateCategoryOverride (vp, [...categoryIds]);
  }

  /**
   * Clear (restore) the previously hidden categories hidden by hideSelectedElementsCategory
   * @param vp Viewport to affect
   */
  public static clearOverrideCategories(vp: Viewport) {
    const ids = this._overrideCategoryIds.get(vp);
    if (ids) {
      vp.changeCategoryDisplay([...ids], true);
      this.clearCategoryOverride(vp);
    }
  }

  /** Checks to see if any featureOverrideProviders are active */
  public areFeatureOverridesActive(vp: Viewport): boolean {
    const emphasizeElementsProvider = vp.findFeatureOverrideProviderOfType<EmphasizeElements>(EmphasizeElements);
    if (undefined !== emphasizeElementsProvider && emphasizeElementsProvider.isActive)
      return true;

    const modelOverrideProvider = vp.findFeatureOverrideProviderOfType<ModelOverrideProvider>(ModelOverrideProvider);
    if (undefined !== modelOverrideProvider && modelOverrideProvider.modelIds.length > 0)
      return true;

    const subCategoryOverrideProvider = vp.findFeatureOverrideProviderOfType<SubCategoryOverrideProvider>(SubCategoryOverrideProvider);
    if (undefined !== subCategoryOverrideProvider && subCategoryOverrideProvider.subCategoryIds.length > 0)
      return true;

    return false;
  }

  /**
     * Function that is run when `IsolateSelectedElementsModel` tool button is pressed
     */
  public async processIsolateSelectedElementsModel(): Promise<void> {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return;

    await HideIsolateEmphasizeManager.isolateSelectedElementsModel(vp);

    HideIsolateEmphasizeActionHandler.emphasizeElementsChanged.raiseEvent({ viewport: vp, action: HideIsolateEmphasizeAction.IsolateSelectedModels });
    UiFramework.postTelemetry(HideIsolateEmphasizeAction.IsolateSelectedModels, featureIdMap.get(HideIsolateEmphasizeAction.IsolateSelectedModels)); // eslint-disable-line @typescript-eslint/no-floating-promises
    SyncUiEventDispatcher.dispatchSyncUiEvent(HideIsolateEmphasizeActionHandler.hideIsolateEmphasizeUiSyncId);
  }

  /**
   * Function that is run when `IsolateSelectedElementsCategory` tool button is pressed
   */
  public async processIsolateSelectedElementsCategory(): Promise<void> {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return;

    await HideIsolateEmphasizeManager.isolateSelectedElementsCategory(vp);

    HideIsolateEmphasizeActionHandler.emphasizeElementsChanged.raiseEvent({ viewport: vp, action: HideIsolateEmphasizeAction.IsolateSelectedCategories });
    UiFramework.postTelemetry(HideIsolateEmphasizeAction.IsolateSelectedCategories, featureIdMap.get(HideIsolateEmphasizeAction.IsolateSelectedCategories)); // eslint-disable-line @typescript-eslint/no-floating-promises
    SyncUiEventDispatcher.dispatchSyncUiEvent(HideIsolateEmphasizeActionHandler.hideIsolateEmphasizeUiSyncId);
  }

  /**
   * Function that is run when `IsolateSelected` tool button is pressed
   */
  public async processIsolateSelected(): Promise<void> {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return;
    HideIsolateEmphasizeManager.isolateSelected(vp);

    HideIsolateEmphasizeActionHandler.emphasizeElementsChanged.raiseEvent({ viewport: vp, action: HideIsolateEmphasizeAction.IsolateSelectedElements });
    UiFramework.postTelemetry(HideIsolateEmphasizeAction.IsolateSelectedElements, featureIdMap.get(HideIsolateEmphasizeAction.IsolateSelectedElements)); // eslint-disable-line @typescript-eslint/no-floating-promises
    SyncUiEventDispatcher.dispatchSyncUiEvent(HideIsolateEmphasizeActionHandler.hideIsolateEmphasizeUiSyncId);

    // clear out selection now that any callbacks have processed
    const selection = vp.view.iModel.selectionSet;
    if (selection.isActive)
      selection.emptyAll();
  }

  /**
   * Function that is run when `HideSelectedElementsModel` tool button is pressed
   */
  public async processHideSelectedElementsModel(): Promise<void> {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return;

    await HideIsolateEmphasizeManager.hideSelectedElementsModel(vp);

    HideIsolateEmphasizeActionHandler.emphasizeElementsChanged.raiseEvent({ viewport: vp, action: HideIsolateEmphasizeAction.HideSelectedModels });
    UiFramework.postTelemetry(HideIsolateEmphasizeAction.HideSelectedModels, featureIdMap.get(HideIsolateEmphasizeAction.HideSelectedModels)); // eslint-disable-line @typescript-eslint/no-floating-promises
    SyncUiEventDispatcher.dispatchSyncUiEvent(HideIsolateEmphasizeActionHandler.hideIsolateEmphasizeUiSyncId);
  }

  /**
   * Function that is run when `HideSelectedElementsCategory` tool button is pressed
   */
  public async processHideSelectedElementsCategory(): Promise<void> {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return;

    await HideIsolateEmphasizeManager.hideSelectedElementsCategory(vp);

    HideIsolateEmphasizeActionHandler.emphasizeElementsChanged.raiseEvent({ viewport: vp, action: HideIsolateEmphasizeAction.HideSelectedCategories });
    UiFramework.postTelemetry(HideIsolateEmphasizeAction.HideSelectedCategories, featureIdMap.get(HideIsolateEmphasizeAction.HideSelectedCategories)); // eslint-disable-line @typescript-eslint/no-floating-promises
    SyncUiEventDispatcher.dispatchSyncUiEvent(HideIsolateEmphasizeActionHandler.hideIsolateEmphasizeUiSyncId);
  }

  /**
   * Function that is run when `HideSelected` tool button is pressed
   */
  public async processHideSelected(): Promise<void> {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return;

    HideIsolateEmphasizeManager.hideSelected(vp);

    HideIsolateEmphasizeActionHandler.emphasizeElementsChanged.raiseEvent({ viewport: vp, action: HideIsolateEmphasizeAction.HideSelectedElements });
    UiFramework.postTelemetry(HideIsolateEmphasizeAction.HideSelectedCategories, featureIdMap.get(HideIsolateEmphasizeAction.HideSelectedElements)); // eslint-disable-line @typescript-eslint/no-floating-promises
    SyncUiEventDispatcher.dispatchSyncUiEvent(HideIsolateEmphasizeActionHandler.hideIsolateEmphasizeUiSyncId);

    // clear out selection now that any callbacks have processed
    const selection = vp.view.iModel.selectionSet;
    if (selection.isActive)
      selection.emptyAll();
  }

  /**
   * Function that is run when `EmphasizeSelected` tool button is pressed
   */
  public async processEmphasizeSelected(): Promise<void> {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return;

    await HideIsolateEmphasizeManager.emphasizeSelected(vp);
    HideIsolateEmphasizeActionHandler.emphasizeElementsChanged.raiseEvent({ viewport: vp, action: HideIsolateEmphasizeAction.EmphasizeSelectedElements });
    UiFramework.postTelemetry(HideIsolateEmphasizeAction.EmphasizeSelectedElements, featureIdMap.get(HideIsolateEmphasizeAction.EmphasizeSelectedElements)); // eslint-disable-line @typescript-eslint/no-floating-promises
    SyncUiEventDispatcher.dispatchSyncUiEvent(HideIsolateEmphasizeActionHandler.hideIsolateEmphasizeUiSyncId);

    // clear out selection now that any callbacks have processed
    const selection = vp.view.iModel.selectionSet;
    if (selection.isActive)
      selection.emptyAll();
  }

  /**
   * Function that is run when `ClearEmphasize` tool button is pressed
   */
  public async processClearEmphasize(): Promise<void> {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return;
    HideIsolateEmphasizeManager.clearEmphasize(vp);

    HideIsolateEmphasizeActionHandler.emphasizeElementsChanged.raiseEvent({ viewport: vp, action: HideIsolateEmphasizeAction.ClearHiddenIsolatedEmphasized });
    UiFramework.postTelemetry(HideIsolateEmphasizeAction.ClearHiddenIsolatedEmphasized, featureIdMap.get(HideIsolateEmphasizeAction.ClearHiddenIsolatedEmphasized)); // eslint-disable-line @typescript-eslint/no-floating-promises
    SyncUiEventDispatcher.dispatchSyncUiEvent(HideIsolateEmphasizeActionHandler.hideIsolateEmphasizeUiSyncId);
  }

  /**
   * Function that is run when `ClearOverrideModels` tool button is pressed
   */
  public async processClearOverrideModels(): Promise<void> {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return;
    HideIsolateEmphasizeManager.clearOverrideModels(vp);

    HideIsolateEmphasizeActionHandler.emphasizeElementsChanged.raiseEvent({ viewport: vp, action: HideIsolateEmphasizeAction.ClearOverrideModels });
    UiFramework.postTelemetry(HideIsolateEmphasizeAction.ClearOverrideModels, featureIdMap.get(HideIsolateEmphasizeAction.ClearOverrideModels)); // eslint-disable-line @typescript-eslint/no-floating-promises
    SyncUiEventDispatcher.dispatchSyncUiEvent(HideIsolateEmphasizeActionHandler.hideIsolateEmphasizeUiSyncId);
  }

  /**
   * Function that is run when `ClearOverrideCategories` tool button is pressed
   */
  public async processClearOverrideCategories(): Promise<void> {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp)
      return;
    HideIsolateEmphasizeManager.clearOverrideCategories(vp);

    HideIsolateEmphasizeActionHandler.emphasizeElementsChanged.raiseEvent({ viewport: vp, action: HideIsolateEmphasizeAction.ClearOverrideCategories });
    UiFramework.postTelemetry(HideIsolateEmphasizeAction.ClearOverrideCategories, featureIdMap.get(HideIsolateEmphasizeAction.ClearOverrideCategories)); // eslint-disable-line @typescript-eslint/no-floating-promises
    SyncUiEventDispatcher.dispatchSyncUiEvent(HideIsolateEmphasizeActionHandler.hideIsolateEmphasizeUiSyncId);
  }

  /**
   * Add category ids to the category override cache (hidden or isolated categories)
   */
  private static updateCategoryOverride(vp: Viewport, ids: string[]) {
    const prevIds = this._overrideCategoryIds.get(vp);
    const newIds = [...(prevIds || []), ...ids];
    this._overrideCategoryIds.set (vp, new Set(newIds));
  }

  /**
   * Add model ids to the model override cache (hidden or isolated models)
   */
  private static updateModelOverride(vp: Viewport, ids: string[]) {
    const prevIds = this._overrideModelIds.get(vp);
    const newIds = [...(prevIds || []), ...ids];
    this._overrideModelIds.set (vp, new Set(newIds));
  }

  /**
   * Clear the category override cache (hidden or isolated categories)
   */
  private static clearCategoryOverride(vp: Viewport) {
    this._overrideCategoryIds.delete (vp);
  }

  /**
   * Clear the model override cache (hidden or isolated models)
   */
  private static clearModelOverride(vp: Viewport) {
    this._overrideModelIds.delete (vp);
  }
}
