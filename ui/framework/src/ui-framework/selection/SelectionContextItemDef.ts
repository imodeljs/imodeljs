/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

import { ConditionalBooleanValue } from "@bentley/ui-abstract";
import { ContentViewManager } from "../content/ContentViewManager";
import { SessionStateActionId } from "../redux/SessionState";
import { CommandItemDef } from "../shared/CommandItemDef";
import { BaseItemState } from "../shared/ItemDefBase";
import { SyncUiEventId } from "../syncui/SyncUiEventDispatcher";
import { GroupItemDef } from "../toolbar/GroupItem";
import { UiFramework } from "../UiFramework";
import { HideIsolateEmphasizeActionHandler } from "./HideIsolateEmphasizeManager";

/** return SyncEventIds that trigger selection state function refresh.
 * @beta
 */
export function getFeatureOverrideSyncEventIds(): string[] {
  return [SyncUiEventId.ActiveContentChanged, SyncUiEventId.ActiveViewportChanged, HideIsolateEmphasizeActionHandler.hideIsolateEmphasizeUiSyncId];
}

/** return SyncEventIds that trigger selection state function refresh.
 * @beta
 */
export function getSelectionContextSyncEventIds(): string[] {
  return [SyncUiEventId.SelectionSetChanged, SyncUiEventId.ActiveContentChanged, SyncUiEventId.ActiveViewportChanged, SessionStateActionId.SetNumItemsSelected];
}

/** return SyncEventIds that trigger selection state function refresh.
 * @beta
 */
export function isNoSelectionActive(): boolean {
  const activeContentControl = ContentViewManager.getActiveContentControl();
  let selectionCount = 0;
  // istanbul ignore if
  if (!UiFramework.frameworkStateKey)
    selectionCount = UiFramework.store.getState()[UiFramework.frameworkStateKey].frameworkState.sessionState.numItemsSelected;

  // istanbul ignore if
  if (activeContentControl /* istanbul ignore next */ && activeContentControl.viewport
    && /* istanbul ignore next */ (activeContentControl.viewport.view.iModel.selectionSet.size > 0 || selectionCount > 0))
    return false;
  return true;
}

/** return ConditionalBooleanValue object used to show items if selection set is active.
 * @beta
 */
export function areNoFeatureOverridesActive(): boolean {
  const activeContentControl = ContentViewManager.getActiveContentControl();
  // istanbul ignore next
  if (activeContentControl && activeContentControl.viewport)
    return !UiFramework.hideIsolateEmphasizeActionHandler.areFeatureOverridesActive(activeContentControl.viewport);

  return true;
}

/** return ConditionalBooleanValue object used to show item if feature overrides are active.
 * @beta
 */
export function getIsHiddenIfFeatureOverridesActive(): ConditionalBooleanValue {
  return new ConditionalBooleanValue(areNoFeatureOverridesActive, getFeatureOverrideSyncEventIds());
}

/** return ConditionalBooleanValue object used to show items if selection set is active.
 * @beta
 */
export function getIsHiddenIfSelectionNotActive(): ConditionalBooleanValue {
  return new ConditionalBooleanValue(isNoSelectionActive, getSelectionContextSyncEventIds());
}

/** return state with isVisible set to true is SectionSet is active.
 * @beta
 */
// istanbul ignore next
export function featureOverridesActiveStateFunc(state: Readonly<BaseItemState>): BaseItemState {
  const activeContentControl = ContentViewManager.getActiveContentControl();
  let isVisible = false;

  // istanbul ignore next
  if (activeContentControl && activeContentControl.viewport)
    isVisible = UiFramework.hideIsolateEmphasizeActionHandler.areFeatureOverridesActive(activeContentControl.viewport);

  return { ...state, isVisible };
}

/** return state with isVisible set to true is SectionSet is active.
 * @beta
 */
// istanbul ignore next
export function selectionContextStateFunc(state: Readonly<BaseItemState>): BaseItemState {
  const activeContentControl = ContentViewManager.getActiveContentControl();
  let isVisible = false;

  let selectionCount = 0;
  if (!UiFramework.frameworkStateKey)
    selectionCount = UiFramework.store.getState()[UiFramework.frameworkStateKey].frameworkState.sessionState.numItemsSelected;

  if (activeContentControl && activeContentControl.viewport && (activeContentControl.viewport.view.iModel.selectionSet.size > 0 || selectionCount > 0))
    isVisible = true;
  return { ...state, isVisible };
}

/** Utility Class that provides definitions for tools dependent on current selection. These definitions can be used to populate toolbars.
 * @public
 */
// istanbul ignore next
export class SelectionContextToolDefinitions {

  public static get isolateModelsInSelectionItemDef() {
    return new CommandItemDef({
      commandId: "UiFramework.IsolateModel",
      iconSpec: "icon-model-isolate",
      labelKey: "UiFramework:tools.isolateModels",
      execute: async () => UiFramework.hideIsolateEmphasizeActionHandler.processIsolateSelectedElementsModel(),
    });
  }

  public static get isolateCategoriesInSelectionItemDef() {
    return new CommandItemDef({
      commandId: "UiFramework.IsolateCategory",
      iconSpec: "icon-layers-isolate",
      labelKey: "UiFramework:tools.isolateCategories",
      execute: async () => UiFramework.hideIsolateEmphasizeActionHandler.processIsolateSelectedElementsCategory(),
    });
  }

  public static get isolateElementsItemDef() {
    return new CommandItemDef({
      commandId: "UiFramework.IsolateSelected",
      iconSpec: "icon-asset-isolate",
      labelKey: "UiFramework:tools.isolateSelected",
      stateSyncIds: getSelectionContextSyncEventIds(),
      stateFunc: selectionContextStateFunc,
      isHidden: getIsHiddenIfSelectionNotActive(),
      execute: async () => UiFramework.hideIsolateEmphasizeActionHandler.processIsolateSelected(),
    });
  }

  public static get isolateSelectionToolGroup() {
    return new GroupItemDef({
      groupId: "UiFramework.IsolateSelectionGroup",
      labelKey: "UiFramework:tools.isolate",
      iconSpec: "icon-isolate",
      stateSyncIds: getSelectionContextSyncEventIds(),
      stateFunc: selectionContextStateFunc,
      isHidden: getIsHiddenIfSelectionNotActive(),
      items: [this.isolateElementsItemDef, this.isolateCategoriesInSelectionItemDef, this.isolateModelsInSelectionItemDef],
      itemsInColumn: 3,
    });
  }

  public static get hideModelsInSelectionItemDef() {
    return new CommandItemDef({
      commandId: "UiFramework.HideModel",
      iconSpec: "icon-model-hide",
      labelKey: "UiFramework:tools.hideModels",
      execute: async () => UiFramework.hideIsolateEmphasizeActionHandler.processHideSelectedElementsModel(),
    });
  }

  public static get hideCategoriesInSelectionItemDef() {
    return new CommandItemDef({
      commandId: "UiFramework.HideCategory",
      iconSpec: "icon-layers-hide",
      labelKey: "UiFramework:tools.hideCategories",
      execute: async () => UiFramework.hideIsolateEmphasizeActionHandler.processHideSelectedElementsCategory(),
    });
  }

  public static get hideElementsItemDef() {
    return new CommandItemDef({
      commandId: "UiFramework.HideSelected",
      iconSpec: "icon-asset-classification-hide",
      labelKey: "UiFramework:tools.hideSelected",
      isHidden: getIsHiddenIfSelectionNotActive(),
      stateSyncIds: getSelectionContextSyncEventIds(),
      stateFunc: selectionContextStateFunc,
      execute: async () => UiFramework.hideIsolateEmphasizeActionHandler.processHideSelected(),
    });
  }

  public static get hideSectionToolGroup() {
    return new GroupItemDef({
      groupId: "UiFramework.HideSelectionGroup",
      labelKey: "UiFramework:tools.hide",
      iconSpec: "icon-visibility-hide-2",
      isHidden: getIsHiddenIfSelectionNotActive(),
      stateSyncIds: getSelectionContextSyncEventIds(),
      stateFunc: selectionContextStateFunc,
      items: [this.hideElementsItemDef, this.hideCategoriesInSelectionItemDef, this.hideModelsInSelectionItemDef],
      itemsInColumn: 3,
    });
  }

  public static get emphasizeElementsItemDef() {
    return new CommandItemDef({
      commandId: "UiFramework.EmphasizeSelected",
      iconSpec: "icon-visibility-semi-transparent",
      labelKey: "UiFramework:tools.emphasizeSelected",
      isHidden: getIsHiddenIfSelectionNotActive(),
      stateSyncIds: getSelectionContextSyncEventIds(),
      stateFunc: selectionContextStateFunc,
      execute: async () => UiFramework.hideIsolateEmphasizeActionHandler.processEmphasizeSelected(),
    });
  }

  public static get clearHideIsolateEmphasizeElementsItemDef() {
    return new CommandItemDef({
      commandId: "UiFramework.ClearHideIsolateEmphasize",
      iconSpec: "icon-visibility",
      labelKey: "UiFramework:tools.clearVisibility",
      isHidden: getIsHiddenIfFeatureOverridesActive(),
      stateSyncIds: getFeatureOverrideSyncEventIds(),
      stateFunc: featureOverridesActiveStateFunc,
      execute: async () => UiFramework.hideIsolateEmphasizeActionHandler.processClearEmphasize(),
    });
  }

}
