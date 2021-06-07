/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Base
 */

// Cspell:ignore popout
import { castDraft, Draft, produce } from "immer";
import { Point, PointProps, Rectangle, RectangleProps, SizeProps } from "@bentley/ui-core";
import { HorizontalPanelSide, isHorizontalPanelSide, PanelSide, panelSides, VerticalPanelSide } from "../widget-panels/Panel";
import { assert } from "@bentley/bentleyjs-core";
import { getUniqueId } from "./NineZone";

/** @internal future */
export interface SizeAndPositionProps extends SizeProps, PointProps { }

/** @internal future */
export interface TabState {
  readonly id: string;
  readonly label: string;
  readonly preferredFloatingWidgetSize?: SizeProps;
  readonly preferredPopoutWidgetSize?: SizeAndPositionProps;
  readonly preferredPanelWidgetSize?: "fit-content";
  readonly allowedPanelTargets?: PanelSide[];
  readonly canPopout?: boolean;
}

/** @internal future */
export interface TabsState { readonly [id: string]: TabState }

/** @internal future */
export interface WidgetState {
  readonly activeTabId: TabState["id"];
  readonly id: string;
  readonly minimized: boolean;
  readonly tabs: ReadonlyArray<TabState["id"]>;
}

/** @internal future */
export interface FloatingWidgetState {
  readonly bounds: RectangleProps;
  readonly id: WidgetState["id"];
  readonly home: FloatingWidgetHomeState;
}

/** @internal future */
export interface PopoutWidgetState {
  readonly bounds: RectangleProps;
  readonly id: WidgetState["id"];
  readonly home: FloatingWidgetHomeState;
}

/** @internal future */
export interface FloatingWidgetHomeState {
  readonly widgetIndex: number;
  readonly widgetId: WidgetState["id"] | undefined;
  readonly side: PanelSide;
}

/** @internal future */
export interface DraggedTabState {
  readonly tabId: TabState["id"];
  readonly position: PointProps;
  readonly home: FloatingWidgetHomeState;
}

/** @internal future */
export interface WidgetsState { readonly [id: string]: WidgetState }

/** @internal future */
export interface FloatingWidgetsState {
  readonly byId: { readonly [id: string]: FloatingWidgetState };
  readonly allIds: ReadonlyArray<FloatingWidgetState["id"]>;
}

/** @internal future */
export interface PopoutWidgetsState {
  readonly byId: { readonly [id: string]: PopoutWidgetState };
  readonly allIds: ReadonlyArray<PopoutWidgetState["id"]>;
}

/** @internal future */
export interface TabTargetTabState {
  readonly widgetId: WidgetState["id"];
  readonly tabIndex: number;
  readonly type: "tab";
}

/** @internal future */
export interface TabTargetPanelState {
  readonly side: PanelSide;
  readonly newWidgetId: WidgetState["id"];
  readonly type: "panel";
}

/** @internal future */
export interface TabTargetWidgetState {
  readonly side: PanelSide;
  readonly newWidgetId: WidgetState["id"];
  readonly widgetIndex: number;
  readonly type: "widget";
}

/** @internal future */
export interface TabTargetFloatingWidgetState {
  readonly type: "floatingWidget";
  readonly newFloatingWidgetId: FloatingWidgetState["id"];
  readonly size: SizeProps;
}

/** @internal future */
export type TabTargetState = TabTargetPanelState | TabTargetWidgetState | TabTargetTabState | TabTargetFloatingWidgetState;

/** @internal future */
export type WidgetTargetPanelState = TabTargetPanelState;

/** @internal future */
export type WidgetTargetWidgetState = TabTargetWidgetState;

/** @internal future */
export type WidgetTargetTabState = TabTargetTabState;

/** @internal future */
export interface WidgetTargetFloatingWidgetState {
  readonly type: "floatingWidget";
}

/** @internal future */
export type WidgetTargetState = WidgetTargetPanelState | WidgetTargetWidgetState | WidgetTargetTabState | WidgetTargetFloatingWidgetState;

/** @internal future */
export interface PanelsState {
  readonly bottom: HorizontalPanelState;
  readonly left: VerticalPanelState;
  readonly right: VerticalPanelState;
  readonly top: HorizontalPanelState;
}

/** @internal future */
export interface PanelState {
  readonly collapseOffset: number;
  readonly collapsed: boolean;
  readonly maxSize: number;
  readonly minSize: number;
  readonly pinned: boolean;
  readonly resizable: boolean;
  readonly side: PanelSide;
  readonly size: number | undefined;
  readonly widgets: ReadonlyArray<WidgetState["id"]>;
  readonly maxWidgetCount: number;
}

/** @internal future */
export interface HorizontalPanelState extends PanelState {
  readonly span: boolean;
  readonly side: HorizontalPanelSide;
}

/** @internal future */
export interface VerticalPanelState extends PanelState {
  readonly side: VerticalPanelSide;
}

/** @internal future */
export interface DockedToolSettingsState {
  readonly type: "docked";
}

/** @internal future */
export interface WidgetToolSettingsState {
  readonly type: "widget";
}

/** @internal future */
export type ToolSettingsState = DockedToolSettingsState | WidgetToolSettingsState;

/** @internal future */
export interface NineZoneState {
  readonly draggedTab: DraggedTabState | undefined;
  readonly floatingWidgets: FloatingWidgetsState;
  readonly popoutWidgets: PopoutWidgetsState;
  readonly panels: PanelsState;
  readonly tabs: TabsState;
  readonly toolSettings: ToolSettingsState;
  readonly widgets: WidgetsState;
  readonly size: SizeProps;
}

/** @internal future */
export interface ResizeAction {
  readonly type: "RESIZE";
  readonly size: SizeProps;
}

/** @internal future */
export interface PanelToggleCollapsedAction {
  readonly type: "PANEL_TOGGLE_COLLAPSED";
  readonly side: PanelSide;
}

/** @internal future */
export interface PanelSetCollapsedAction {
  readonly type: "PANEL_SET_COLLAPSED";
  readonly collapsed: boolean;
  readonly side: PanelSide;
}

/** @internal future */
export interface PanelSetSizeAction {
  readonly type: "PANEL_SET_SIZE";
  readonly side: PanelSide;
  readonly size: number;
}

/** @internal future */
export interface PanelToggleSpanAction {
  readonly type: "PANEL_TOGGLE_SPAN";
  readonly side: HorizontalPanelSide;
}

/** @internal future */
export interface PanelTogglePinnedAction {
  readonly type: "PANEL_TOGGLE_PINNED";
  readonly side: PanelSide;
}

/** @internal future */
export interface PanelInitializeAction {
  readonly type: "PANEL_INITIALIZE";
  readonly side: PanelSide;
  readonly size: number;
}

/** @internal future */
export interface FloatingWidgetResizeAction {
  readonly type: "FLOATING_WIDGET_RESIZE";
  readonly id: FloatingWidgetState["id"];
  readonly resizeBy: RectangleProps;
}

/** @internal future */
export interface FloatingWidgetBringToFrontAction {
  readonly type: "FLOATING_WIDGET_BRING_TO_FRONT";
  readonly id: FloatingWidgetState["id"];
}

/** @internal future */
export interface FloatingWidgetSendBackAction {
  readonly type: "FLOATING_WIDGET_SEND_BACK";
  readonly id: FloatingWidgetState["id"];
}

/** @internal future */
export interface PopoutWidgetSendBackAction {
  readonly type: "POPOUT_WIDGET_SEND_BACK";
  readonly id: PopoutWidgetState["id"];
}

/** @internal future */
export interface PanelWidgetDragStartAction {
  readonly type: "PANEL_WIDGET_DRAG_START";
  readonly newFloatingWidgetId: FloatingWidgetState["id"];
  readonly id: WidgetState["id"];
  readonly bounds: RectangleProps;
  readonly side: PanelSide;
}

/** @internal future */
export interface WidgetDragAction {
  readonly type: "WIDGET_DRAG";
  readonly dragBy: PointProps;
  readonly floatingWidgetId: FloatingWidgetState["id"];
}

/** @internal future */
export interface WidgetDragEndAction {
  readonly type: "WIDGET_DRAG_END";
  readonly floatingWidgetId: FloatingWidgetState["id"];
  readonly target: WidgetTargetState;
}

/** @internal future */
export interface WidgetTabClickAction {
  readonly type: "WIDGET_TAB_CLICK";
  readonly side: PanelSide | undefined;
  readonly widgetId: WidgetState["id"];
  readonly id: TabState["id"];
}

/** @internal future */
export interface WidgetTabDoubleClickAction {
  readonly type: "WIDGET_TAB_DOUBLE_CLICK";
  readonly side: PanelSide | undefined;
  readonly widgetId: WidgetState["id"];
  readonly floatingWidgetId: FloatingWidgetState["id"] | undefined;
  readonly id: TabState["id"];
}

/** @internal future */
export interface WidgetTabPopoutAction {
  readonly type: "WIDGET_TAB_POPOUT";
  readonly id: WidgetState["activeTabId"];
}

/** @internal future */
export interface WidgetTabDragStartAction {
  readonly type: "WIDGET_TAB_DRAG_START";
  readonly side: PanelSide | undefined;
  readonly widgetId: WidgetState["id"];
  readonly floatingWidgetId: FloatingWidgetState["id"] | undefined;
  readonly id: TabState["id"];
  readonly position: PointProps;
}

/** @internal future */
export interface WidgetTabDragAction {
  readonly type: "WIDGET_TAB_DRAG";
  readonly dragBy: PointProps;
}

/** @internal future */
export interface WidgetTabDragEndAction {
  readonly type: "WIDGET_TAB_DRAG_END";
  readonly id: TabState["id"];
  readonly target: TabTargetState;
}

/** @internal future */
export interface ToolSettingsDragStartAction {
  readonly type: "TOOL_SETTINGS_DRAG_START";
  readonly newFloatingWidgetId: FloatingWidgetState["id"];
}

/** @internal future */
export interface ToolSettingsDockAction {
  readonly type: "TOOL_SETTINGS_DOCK";
}

/** @internal future */
export type NineZoneActionTypes =
  ResizeAction |
  PanelToggleCollapsedAction |
  PanelSetCollapsedAction |
  PanelSetSizeAction |
  PanelToggleSpanAction |
  PanelTogglePinnedAction |
  PanelInitializeAction |
  FloatingWidgetResizeAction |
  FloatingWidgetBringToFrontAction |
  FloatingWidgetSendBackAction |
  PopoutWidgetSendBackAction |
  PanelWidgetDragStartAction |
  WidgetDragAction |
  WidgetDragEndAction |
  WidgetTabClickAction |
  WidgetTabDoubleClickAction |
  WidgetTabDragStartAction |
  WidgetTabDragAction |
  WidgetTabDragEndAction |
  WidgetTabPopoutAction |
  ToolSettingsDragStartAction |
  ToolSettingsDockAction;

/** @internal */
export const toolSettingsTabId = "nz-tool-settings-tab";

/** @internal future */
export const NineZoneStateReducer: (state: NineZoneState, action: NineZoneActionTypes) => NineZoneState = produce(( // eslint-disable-line @typescript-eslint/naming-convention
  state: Draft<NineZoneState>,
  action: NineZoneActionTypes,
) => {
  switch (action.type) {
    case "RESIZE": {
      setSizeProps(state.size, action.size);
      const nzBounds = Rectangle.createFromSize(action.size);
      for (const id of state.floatingWidgets.allIds) {
        const floatingWidget = state.floatingWidgets.byId[id];
        const bounds = Rectangle.create(floatingWidget.bounds);
        const containedBounds = bounds.containIn(nzBounds);
        setRectangleProps(floatingWidget.bounds, containedBounds);
      }
      return;
    }
    case "PANEL_TOGGLE_COLLAPSED": {
      const panel = state.panels[action.side];
      panel.collapsed = !panel.collapsed;
      return;
    }
    case "PANEL_SET_COLLAPSED": {
      const panel = state.panels[action.side];
      panel.collapsed = action.collapsed;
      return;
    }
    case "PANEL_SET_SIZE": {
      const panel = state.panels[action.side];
      const newSize = Math.min(Math.max(action.size, panel.minSize), panel.maxSize);
      state.panels[action.side].size = newSize;
      return;
    }
    case "PANEL_TOGGLE_SPAN": {
      const panel = state.panels[action.side];
      state.panels[action.side].span = !panel.span;
      return;
    }
    case "PANEL_TOGGLE_PINNED": {
      const panel = state.panels[action.side];
      state.panels[action.side].pinned = !panel.pinned;
      return;
    }
    case "PANEL_INITIALIZE": {
      const panel = state.panels[action.side];
      const newSize = Math.min(Math.max(action.size, panel.minSize), panel.maxSize);
      state.panels[action.side].size = newSize;
      return;
    }
    case "PANEL_WIDGET_DRAG_START": {
      const panel = state.panels[action.side];
      const widgetIndex = panel.widgets.indexOf(action.id);

      state.floatingWidgets.allIds.push(action.newFloatingWidgetId);
      state.floatingWidgets.byId[action.newFloatingWidgetId] = {
        bounds: Rectangle.create(action.bounds).toProps(),
        id: action.newFloatingWidgetId,
        home: {
          side: action.side,
          widgetId: undefined,
          widgetIndex,
        },
      };
      state.widgets[action.newFloatingWidgetId] = state.widgets[action.id];
      state.widgets[action.newFloatingWidgetId].id = action.newFloatingWidgetId;
      delete state.widgets[action.id];

      panel.widgets.splice(widgetIndex, 1);

      const expandedWidget = panel.widgets.find((widgetId) => {
        return state.widgets[widgetId].minimized === false;
      });
      if (!expandedWidget && panel.widgets.length > 0) {
        const firstWidget = state.widgets[panel.widgets[0]];
        firstWidget.minimized = false;
      }
      return;
    }
    case "WIDGET_DRAG": {
      const floatingWidget = state.floatingWidgets.byId[action.floatingWidgetId];
      assert(!!floatingWidget);
      const newBounds = Rectangle.create(floatingWidget.bounds).offset(action.dragBy);
      setRectangleProps(floatingWidget.bounds, newBounds);
      return;
    }
    case "WIDGET_DRAG_END": {
      const target = action.target;
      const floatingWidget = state.floatingWidgets.byId[action.floatingWidgetId];
      const draggedWidget = state.widgets[action.floatingWidgetId];
      if (isWidgetTargetFloatingWidgetState(target)) {
        const nzBounds = Rectangle.createFromSize(state.size);
        if (draggedWidget.minimized) {
          const bounds = Rectangle.create(floatingWidget.bounds);
          const containedBounds = bounds.setHeight(35).containIn(nzBounds);
          const newBounds = Rectangle.create(floatingWidget.bounds).setPosition(containedBounds.topLeft());
          setRectangleProps(floatingWidget.bounds, newBounds);
        } else {
          const containedBounds = Rectangle.create(floatingWidget.bounds).containIn(nzBounds);
          setRectangleProps(floatingWidget.bounds, containedBounds);
        }
        floatingWidgetBringToFront(state, action.floatingWidgetId);
        return;
      }
      if (isWidgetTargetTabState(target)) {
        if (isToolSettingsFloatingWidget(state, target.widgetId)) {
          state.floatingWidgets.byId[target.widgetId].home = floatingWidget.home;
        }
        const targetWidget = state.widgets[target.widgetId];
        targetWidget.tabs.splice(target.tabIndex, 0, ...draggedWidget.tabs);
      } else if (isWidgetTargetWidgetState(target)) {
        state.panels[target.side].widgets.splice(target.widgetIndex, 0, target.newWidgetId);
        state.widgets[target.newWidgetId] = {
          ...draggedWidget,
          id: target.newWidgetId,
        };
      } else {
        state.panels[target.side].widgets = [target.newWidgetId];
        state.widgets[target.newWidgetId] = {
          ...draggedWidget,
          id: target.newWidgetId,
          minimized: false,
        };
      }
      delete state.widgets[action.floatingWidgetId];
      delete state.floatingWidgets.byId[action.floatingWidgetId];
      const idIndex = state.floatingWidgets.allIds.indexOf(action.floatingWidgetId);
      state.floatingWidgets.allIds.splice(idIndex, 1);
      return;
    }
    case "FLOATING_WIDGET_RESIZE": {
      const { resizeBy } = action;
      const floatingWidget = state.floatingWidgets.byId[action.id];
      assert(!!floatingWidget);
      const bounds = Rectangle.create(floatingWidget.bounds);
      const newBounds = bounds.inset(-resizeBy.left, -resizeBy.top, -resizeBy.right, -resizeBy.bottom);
      setRectangleProps(floatingWidget.bounds, newBounds);

      const widget = state.widgets[action.id];
      const size = newBounds.getSize();
      const tab = state.tabs[widget.activeTabId];
      initSizeProps(tab, "preferredFloatingWidgetSize", size);
      return;
    }
    case "FLOATING_WIDGET_BRING_TO_FRONT": {
      floatingWidgetBringToFront(state, action.id);
      return;
    }
    case "FLOATING_WIDGET_SEND_BACK": {
      const floatingWidget = state.floatingWidgets.byId[action.id];
      const widget = state.widgets[action.id];
      const home = floatingWidget.home;
      const panel = state.panels[home.side];
      let homeWidget;
      if (home.widgetId) {
        homeWidget = state.widgets[home.widgetId];
      } else if (panel.widgets.length === panel.maxWidgetCount) {
        const id = panel.widgets[home.widgetIndex];
        homeWidget = state.widgets[id];
      }

      if (homeWidget) {
        homeWidget.tabs.push(...widget.tabs);
        removeWidget(state, widget.id);
      } else {
        const destinationWidgetContainerName = home.widgetId ?? widget.id;
        // if widget container was remove because it was empty insert it
        state.widgets[destinationWidgetContainerName] = {
          activeTabId: widget.tabs[0],
          id: destinationWidgetContainerName,
          minimized: false,
          tabs: [...widget.tabs],
        };
        panel.widgets.splice(home.widgetIndex, 0, destinationWidgetContainerName);
        widget.minimized = false;
        if (home.widgetId)
          removeWidget(state, widget.id);
        else
          removeFloatingWidget(state, widget.id);
      }
      return;
    }
    case "POPOUT_WIDGET_SEND_BACK": {
      const popoutWidget = state.popoutWidgets.byId[action.id];
      const widget = state.widgets[action.id];
      const home = popoutWidget.home;
      const panel = state.panels[home.side];
      let homeWidget;
      if (home.widgetId) {
        homeWidget = state.widgets[home.widgetId];
      } else if (panel.widgets.length === panel.maxWidgetCount) {
        const id = panel.widgets[home.widgetIndex];
        homeWidget = state.widgets[id];
      }

      if (homeWidget) {
        homeWidget.tabs.push(...widget.tabs);
        removeWidget(state, widget.id);
      } else {
        const destinationWidgetContainerName = home.widgetId ?? widget.id;
        // if widget container was remove because it was empty insert it
        state.widgets[destinationWidgetContainerName] = {
          activeTabId: widget.tabs[0],
          id: destinationWidgetContainerName,
          minimized: false,
          tabs: [...widget.tabs],
        };
        panel.widgets.splice(home.widgetIndex, 0, destinationWidgetContainerName);
        widget.minimized = false;
        if (home.widgetId)
          removeWidget(state, widget.id);
        else
          removePopoutWidget(state, widget.id);
      }
      return;
    }

    case "WIDGET_TAB_CLICK": {
      const widget = state.widgets[action.widgetId];
      const isActive = action.id === widget.activeTabId;
      const floatingWidget = state.floatingWidgets.byId[action.widgetId];
      if (floatingWidget) {
        const size = Rectangle.create(floatingWidget.bounds).getSize();
        const activeTab = state.tabs[action.id];
        initSizeProps(activeTab, "preferredFloatingWidgetSize", size);
      }

      setWidgetActiveTabId(state, widget.id, action.id);
      if (widget.minimized) {
        widget.minimized = false;
        return;
      }

      const panel = action.side ? state.panels[action.side] : undefined;
      if (isActive && panel) {
        for (const wId of panel.widgets) {
          const w = state.widgets[wId];
          w.minimized = true;
        }
        widget.minimized = false;
      }
      return;
    }
    case "WIDGET_TAB_DOUBLE_CLICK": {
      const panel = action.side ? state.panels[action.side] : undefined;
      const widget = state.widgets[action.widgetId];
      const active = action.id === widget.activeTabId;
      const panelWidgets = panel?.widgets || [];
      const maximized = panelWidgets.filter((wId) => {
        return !state.widgets[wId].minimized;
      }, 0);
      if (widget.minimized) {
        setWidgetActiveTabId(state, widget.id, action.id);
        for (const wId of panelWidgets) {
          const w = state.widgets[wId];
          w.minimized = w.id !== widget.id;
        }
        return;
      }
      if (!active) {
        setWidgetActiveTabId(state, widget.id, action.id);
        return;
      }
      if (maximized.length > 1)
        widget.minimized = true;
      if (action.floatingWidgetId !== undefined)
        widget.minimized = true;
      return;
    }
    case "WIDGET_TAB_DRAG_START": {
      const tabId = action.id;
      let home: FloatingWidgetHomeState | undefined;
      if (action.floatingWidgetId) {
        const floatingWidget = state.floatingWidgets.byId[action.floatingWidgetId];
        home = floatingWidget.home;
      } else {
        assert(!!action.side);
        const panel = state.panels[action.side];
        const widgetIndex = panel.widgets.indexOf(action.widgetId);
        home = {
          side: action.side,
          widgetId: action.widgetId,
          widgetIndex,
        };
      }
      state.draggedTab = {
        tabId,
        position: Point.create(action.position).toProps(),
        home,
      };
      removeWidgetTabInternal(state, action.widgetId, action.floatingWidgetId, undefined, action.side, action.id);
      return;
    }
    case "WIDGET_TAB_DRAG": {
      const draggedTab = state.draggedTab;
      assert(!!draggedTab);
      const newPosition = Point.create(draggedTab.position).offset(action.dragBy);
      setPointProps(draggedTab.position, newPosition);
      return;
    }
    case "WIDGET_TAB_DRAG_END": {
      assert(!!state.draggedTab);
      const target = action.target;
      if (isTabTargetTabState(target)) {
        if (isToolSettingsFloatingWidget(state, target.widgetId)) {
          const floatingWidget = state.floatingWidgets.byId[target.widgetId];
          floatingWidget.home = state.draggedTab.home;
        }
        const targetWidget = state.widgets[target.widgetId];
        targetWidget.tabs.splice(target.tabIndex, 0, action.id);
      } else if (isTabTargetPanelState(target)) {
        state.panels[target.side].widgets.push(target.newWidgetId);
        state.widgets[target.newWidgetId] = {
          activeTabId: action.id,
          id: target.newWidgetId,
          minimized: false,
          tabs: [action.id],
        };
      } else if (isTabTargetWidgetState(target)) {
        state.panels[target.side].widgets.splice(target.widgetIndex, 0, target.newWidgetId);
        state.widgets[target.newWidgetId] = {
          activeTabId: action.id,
          id: target.newWidgetId,
          minimized: false,
          tabs: [action.id],
        };
      } else {
        const tab = state.tabs[state.draggedTab.tabId];
        const nzBounds = Rectangle.createFromSize(state.size);
        const bounds = Rectangle.createFromSize(tab.preferredFloatingWidgetSize || target.size).offset(state.draggedTab.position);
        const containedBounds = bounds.containIn(nzBounds);
        state.floatingWidgets.byId[target.newFloatingWidgetId] = {
          bounds: containedBounds.toProps(),
          id: target.newFloatingWidgetId,
          home: state.draggedTab.home,
        };
        state.floatingWidgets.allIds.push(target.newFloatingWidgetId);
        state.widgets[target.newFloatingWidgetId] = {
          activeTabId: action.id,
          id: target.newFloatingWidgetId,
          minimized: false,
          tabs: [action.id],
        };
      }
      state.draggedTab = undefined;
      return;
    }
    case "TOOL_SETTINGS_DRAG_START": {
      if (isDockedToolSettingsState(state.toolSettings)) {
        const tab = state.tabs[toolSettingsTabId];
        state.toolSettings = {
          type: "widget",
        };
        state.widgets[action.newFloatingWidgetId] = {
          activeTabId: toolSettingsTabId,
          id: action.newFloatingWidgetId,
          minimized: false,
          tabs: [toolSettingsTabId],
        };
        const size = tab.preferredFloatingWidgetSize || { height: 200, width: 300 };
        state.floatingWidgets.byId[action.newFloatingWidgetId] = {
          bounds: Rectangle.createFromSize(size).toProps(),
          id: action.newFloatingWidgetId,
          home: {
            side: "left",
            widgetId: undefined,
            widgetIndex: 0,
          },
        };
        state.floatingWidgets.allIds.push(action.newFloatingWidgetId);
      }
      return;
    }
    case "TOOL_SETTINGS_DOCK": {
      removeWidgetTab(state, toolSettingsTabId);
      state.toolSettings = {
        type: "docked",
      };
      return;
    }
  }
});

function isToolSettingsFloatingWidget(state: Draft<NineZoneState>, id: WidgetState["id"]) {
  const widget = state.widgets[id];
  return (widget.tabs.length === 1 &&
    widget.tabs[0] === toolSettingsTabId &&
    id in state.floatingWidgets.byId
  );
}

/** @internal */
export function floatingWidgetBringToFront(state: Draft<NineZoneState>, floatingWidgetId: FloatingWidgetState["id"]) {
  const idIndex = state.floatingWidgets.allIds.indexOf(floatingWidgetId);
  const spliced = state.floatingWidgets.allIds.splice(idIndex, 1);
  state.floatingWidgets.allIds.push(spliced[0]);
}

/** Removes tab from the UI, but keeps the tab state.
 * @internal
 */
export function removeWidgetTab(state: Draft<NineZoneState>, tabId: TabState["id"]) {
  const location = findTab(state, tabId);
  if (!location)
    return;
  const floatingWidgetId = "floatingWidgetId" in location ? location.floatingWidgetId : undefined;
  const popoutWidgetId = "popoutWidgetId" in location ? location.popoutWidgetId : undefined;
  const side = "side" in location ? location.side : undefined;
  return removeWidgetTabInternal(state, location.widgetId, floatingWidgetId, popoutWidgetId, side, tabId);
}

/** Removes tab from the UI and deletes the tab state.
 * @internal
 */
export function removeTab(state: Draft<NineZoneState>, tabId: TabState["id"]) {
  removeWidgetTab(state, tabId);
  // keep state.tabs[tabId] around for preferred size info
}

function removeWidgetTabInternal(
  state: Draft<NineZoneState>,
  widgetId: WidgetState["id"],
  floatingWidgetId: FloatingWidgetState["id"] | undefined,
  popoutWidgetId: PopoutWidgetState["id"] | undefined,
  side: PanelSide | undefined,
  tabId: TabState["id"],
) {
  const widget = state.widgets[widgetId];
  const tabs = widget.tabs;
  const tabIndex = tabs.indexOf(tabId);
  tabs.splice(tabIndex, 1);
  if (tabId === widget.activeTabId) {
    setWidgetActiveTabId(state, widget.id, widget.tabs[0]);
  }

  if (tabs.length === 0) {
    if (floatingWidgetId !== undefined) {
      delete state.floatingWidgets.byId[floatingWidgetId];
      const idIndex = state.floatingWidgets.allIds.indexOf(floatingWidgetId);
      state.floatingWidgets.allIds.splice(idIndex, 1);
    }
    if (popoutWidgetId !== undefined) {
      delete state.popoutWidgets.byId[popoutWidgetId];
      const idIndex = state.popoutWidgets.allIds.indexOf(popoutWidgetId);
      state.popoutWidgets.allIds.splice(idIndex, 1);
    }
    if (side) {
      const widgets = state.panels[side].widgets;
      const widgetIndex = widgets.indexOf(widgetId);
      widgets.splice(widgetIndex, 1);

      const expandedWidget = widgets.find((wId) => {
        return state.widgets[wId].minimized === false;
      });
      if (!expandedWidget && widgets.length > 0) {
        const firstWidget = state.widgets[widgets[0]];
        firstWidget.minimized = false;
      }
    }
    delete state.widgets[widgetId];
  }
}

function removeWidget(state: Draft<NineZoneState>, id: WidgetState["id"]) {
  delete state.widgets[id];
  removeFloatingWidget(state, id);
  removePopoutWidget(state, id);
}

function removeFloatingWidget(state: Draft<NineZoneState>, id: FloatingWidgetState["id"]) {
  delete state.floatingWidgets.byId[id];
  const index = state.floatingWidgets.allIds.indexOf(id);
  index >= 0 && state.floatingWidgets.allIds.splice(index, 1);
}

function removePopoutWidget(state: Draft<NineZoneState>, id: PopoutWidgetState["id"]) {
  // istanbul ignore else
  if (state.popoutWidgets) {
    delete state.popoutWidgets.byId[id];
    const index = state.popoutWidgets.allIds.indexOf(id);
    index >= 0 && state.popoutWidgets.allIds.splice(index, 1);
  }
}

function setWidgetActiveTabId(
  state: Draft<NineZoneState>,
  widgetId: WidgetState["id"],
  tabId: WidgetState["activeTabId"],
) {
  state.widgets[widgetId].activeTabId = tabId;
  const floatingWidget = state.floatingWidgets.byId[widgetId];
  if (floatingWidget && tabId) {
    const size = Rectangle.create(floatingWidget.bounds).getSize();
    const activeTab = state.tabs[tabId];
    initSizeProps(activeTab, "preferredFloatingWidgetSize", size);
  }
}

/** @internal */
export function createPanelsState(args?: Partial<PanelsState>): PanelsState {
  return {
    bottom: createHorizontalPanelState("bottom"),
    left: createVerticalPanelState("left"),
    right: createVerticalPanelState("right"),
    top: createHorizontalPanelState("top"),
    ...args,
  };
}

/** @internal */
export function createTabsState(args?: Partial<TabsState>): TabsState {
  return {
    [toolSettingsTabId]: createTabState(toolSettingsTabId, {
      label: "Tool Settings",
      allowedPanelTargets: ["bottom", "left", "right"],
    }),
    ...args,
  };
}

/** @internal future */
export function createNineZoneState(args?: Partial<NineZoneState>): NineZoneState {
  return {
    draggedTab: undefined,
    floatingWidgets: {
      byId: {},
      allIds: [],
    },
    popoutWidgets: {
      byId: {},
      allIds: [],
    },
    panels: createPanelsState(),
    widgets: {},
    tabs: createTabsState(),
    toolSettings: {
      type: "docked",
    },
    size: {
      height: 0,
      width: 0,
    },
    ...args,
  };
}

/** @internal */
export function createWidgetState(id: WidgetState["id"], tabs: WidgetState["tabs"], args?: Partial<WidgetState>): WidgetState {
  assert(tabs.length !== 0);
  return {
    activeTabId: tabs[0],
    id,
    minimized: false,
    tabs,
    ...args,
  };
}

/** @internal */
export function createFloatingWidgetState(id: FloatingWidgetState["id"], args?: Partial<FloatingWidgetState>): FloatingWidgetState {
  return {
    bounds: new Rectangle().toProps(),
    id,
    home: {
      side: "left",
      widgetId: undefined,
      widgetIndex: 0,
    },
    ...args,
  };
}
/** @internal */
export function createPopoutWidgetState(id: PopoutWidgetState["id"], args?: Partial<PopoutWidgetState>): PopoutWidgetState {
  return {
    bounds: new Rectangle().toProps(),
    id,
    home: {
      side: "left",
      widgetId: undefined,
      widgetIndex: 0,
    },
    ...args,
  };
}

/** @internal */
export function createTabState(id: TabState["id"], args?: Partial<TabState>): TabState {
  return {
    allowedPanelTargets: undefined,
    id,
    label: "",
    ...args,
  };
}

/** @internal */
export function createDraggedTabState(tabId: DraggedTabState["tabId"], args?: Partial<DraggedTabState>): DraggedTabState {
  return {
    tabId,
    home: {
      side: "left",
      widgetId: undefined,
      widgetIndex: 0,
    },
    position: new Point().toProps(),
    ...args,
  };
}

/** @internal */
export function addPanelWidget(state: NineZoneState, side: PanelSide, id: WidgetState["id"], tabs: WidgetState["tabs"], widgetArgs?: Partial<WidgetState>): NineZoneState {
  const widget = createWidgetState(id, tabs, widgetArgs);
  return produce(state, (stateDraft) => {
    stateDraft.widgets[widget.id] = castDraft(widget);
    stateDraft.panels[side].widgets.push(widget.id);
  });
}

/** @internal */
export function addFloatingWidget(state: NineZoneState, id: FloatingWidgetState["id"], tabs: WidgetState["tabs"], floatingWidgetArgs?: Partial<FloatingWidgetState>,
  widgetArgs?: Partial<WidgetState>,
): NineZoneState {
  const floatingWidget = createFloatingWidgetState(id, floatingWidgetArgs);
  const widget = createWidgetState(id, tabs, widgetArgs);
  return produce(state, (stateDraft) => {
    stateDraft.floatingWidgets.byId[id] = floatingWidget;
    stateDraft.floatingWidgets.allIds.push(id);
    stateDraft.widgets[id] = castDraft(widget);
  });
}

/** @internal */
export function addPopoutWidget(state: NineZoneState, id: PopoutWidgetState["id"], tabs: WidgetState["tabs"], popoutWidgetArgs?: Partial<PopoutWidgetState>,
  widgetArgs?: Partial<WidgetState>,
): NineZoneState {
  const popoutWidget = createPopoutWidgetState(id, popoutWidgetArgs);
  const widget = createWidgetState(id, tabs, widgetArgs);
  return produce(state, (stateDraft) => {
    stateDraft.popoutWidgets.byId[id] = popoutWidget;
    stateDraft.popoutWidgets.allIds.push(id);
    stateDraft.widgets[id] = castDraft(widget);
  });
}

/** @internal */
export function addTab(state: NineZoneState, id: TabState["id"], tabArgs?: Partial<TabState>): NineZoneState {
  const tab = {
    ...createTabState(id),
    ...tabArgs,
  };
  return produce(state, (stateDraft) => {
    stateDraft.tabs[id] = tab;
  });
}

/** @internal */
export function createPanelState(side: PanelSide) {
  return {
    collapseOffset: 100,
    collapsed: false,
    maxSize: 600,
    minSize: 200,
    pinned: true,
    resizable: true,
    side,
    size: undefined,
    widgets: [],
    maxWidgetCount: getMaxWidgetCount(side),
  };
}

/** @internal */
export function createVerticalPanelState(side: VerticalPanelSide, args?: Partial<VerticalPanelState>): VerticalPanelState {
  return {
    ...createPanelState(side),
    side,
    ...args,
  };
}

/** @internal */
export function createHorizontalPanelState(side: HorizontalPanelSide, args?: Partial<HorizontalPanelState>): HorizontalPanelState {
  return {
    ...createPanelState(side),
    minSize: 100,
    side,
    span: true,
    ...args,
  };
}

/** @internal */
export function isHorizontalPanelState(state: PanelState): state is HorizontalPanelState {
  return isHorizontalPanelSide(state.side);
}

function isTabTargetTabState(state: TabTargetState): state is TabTargetTabState {
  return state.type === "tab";
}

function isTabTargetPanelState(state: TabTargetState): state is TabTargetPanelState {
  return state.type === "panel";
}

function isTabTargetWidgetState(state: TabTargetState): state is TabTargetWidgetState {
  return state.type === "widget";
}

function isWidgetTargetFloatingWidgetState(state: WidgetTargetState): state is WidgetTargetFloatingWidgetState {
  return state.type === "floatingWidget";
}

function isWidgetTargetTabState(state: WidgetTargetState): state is WidgetTargetTabState {
  return state.type === "tab";
}

function isWidgetTargetWidgetState(state: WidgetTargetState): state is WidgetTargetWidgetState {
  return state.type === "widget";
}

function isDockedToolSettingsState(state: ToolSettingsState): state is DockedToolSettingsState {
  return state.type === "docked";
}

/** @internal */
export function setRectangleProps(props: Draft<RectangleProps>, bounds: RectangleProps) {
  props.left = bounds.left;
  props.right = bounds.right;
  props.top = bounds.top;
  props.bottom = bounds.bottom;
}

function setPointProps(props: Draft<PointProps>, point: PointProps) {
  props.x = point.x;
  props.y = point.y;
}

function setSizeProps(props: Draft<SizeProps>, size: SizeProps) {
  props.height = size.height;
  props.width = size.width;
}

type KeysOfType<T, Type> = { [K in keyof T]: T[K] extends Type ? K : never }[keyof T];

function initSizeProps<T, K extends KeysOfType<T, SizeProps | undefined>>(obj: T, key: K, size: SizeProps) {
  if (obj[key]) {
    setSizeProps(obj[key], size);
    return;
  }
  (obj[key] as SizeProps) = {
    height: size.height,
    width: size.width,
  };
}

function setSizeAndPointProps(props: Draft<SizeAndPositionProps>, inValue: SizeAndPositionProps) {
  props.x = inValue.x;
  props.y = inValue.y;
  props.height = inValue.height;
  props.width = inValue.width;
}

/** @internal */
export function initSizeAndPositionProps<T, K extends KeysOfType<T, SizeAndPositionProps | undefined>>(obj: T, key: K, inValue: SizeAndPositionProps) {
  if (obj[key]) {
    setSizeAndPointProps(obj[key], inValue);
    return;
  }
  (obj[key] as SizeAndPositionProps) = {
    x: inValue.x,
    y: inValue.y,
    height: inValue.height,
    width: inValue.width,
  };
}

function getMaxWidgetCount(side: PanelSide) {
  if (side === "left" || side === "right")
    return 3;
  return 2;
}

interface PanelLocation {
  widgetId: WidgetState["id"];
  side: PanelSide;
}

interface FloatingLocation {
  widgetId: WidgetState["id"];
  floatingWidgetId: FloatingWidgetState["id"];
}

interface PopoutLocation {
  widgetId: WidgetState["id"];
  popoutWidgetId: PopoutWidgetState["id"];
}

type TabLocation = PanelLocation | FloatingLocation | PopoutLocation;

/** @internal */
export function isFloatingLocation(location: TabLocation): location is FloatingLocation {
  return "floatingWidgetId" in location;
}

/** @internal */
export function isPopoutLocation(location: TabLocation): location is PopoutLocation {
  return "popoutWidgetId" in location;
}

/** @internal */
export function isPanelLocation(location: TabLocation): location is PanelLocation {
  return "side" in location;
}

/** @internal */
export function isFloatingWidgetLocation(location: WidgetLocation): location is FloatingLocation {
  return "floatingWidgetId" in location;
}

/** @internal */
export function isPopoutWidgetLocation(location: WidgetLocation): location is PopoutLocation {
  return "popoutWidgetId" in location;
}

/** @internal */
export function findTab(state: NineZoneState, id: TabState["id"]): TabLocation | undefined {
  let widgetId;
  for (const [, widget] of Object.entries(state.widgets)) {
    const index = widget.tabs.indexOf(id);
    if (index >= 0) {
      widgetId = widget.id;
      break;
    }
  }
  if (!widgetId)
    return undefined;
  const widgetLocation = findWidget(state, widgetId);
  return widgetLocation ? {
    ...widgetLocation,
    widgetId,
  } : undefined;
}

type WidgetLocation =
  { side: PanelSide } |
  { floatingWidgetId: FloatingWidgetState["id"] } |
  { popoutWidgetId: PopoutWidgetState["id"] };

/** @internal */
export function findWidget(state: NineZoneState, id: WidgetState["id"]): WidgetLocation | undefined {
  if (id in state.floatingWidgets.byId) {
    return {
      floatingWidgetId: id,
    };
  }
  // istanbul ignore else
  if (state.popoutWidgets) {
    if (id in state.popoutWidgets.byId) {
      return {
        popoutWidgetId: id,
      };
    }
  }
  for (const side of panelSides) {
    const panel = state.panels[side];
    const index = panel.widgets.indexOf(id);
    if (index >= 0) {
      return {
        side,
      };
    }
  }
  return undefined;
}

/** @internal */
export function floatWidget(state: NineZoneState, widgetTabId: string, point?: PointProps, size?: SizeProps) {
  const location = findTab(state, widgetTabId);
  if (location) {
    if (isFloatingLocation(location))
      return undefined; // already floating

    const tab = state.tabs[widgetTabId];
    const preferredSize = size ?? (tab.preferredFloatingWidgetSize ?? { height: 400, width: 400 });
    const preferredPoint = point ?? { x: 50, y: 100 };
    const preferredBounds = Rectangle.createFromSize(preferredSize).offset(preferredPoint);
    const nzBounds = Rectangle.createFromSize(state.size);
    const containedBounds = preferredBounds.containIn(nzBounds);

    // istanbul ignore else - no else/using as type guard to cast
    if (isPanelLocation(location)) {
      const floatingWidgetId = getUniqueId();
      const panel = state.panels[location.side];
      const widgetIndex = panel.widgets.indexOf(location.widgetId);

      return produce(state, (draft) => {
        const floatedTab = draft.tabs[widgetTabId];
        initSizeProps(floatedTab, "preferredFloatingWidgetSize", preferredSize);
        removeWidgetTab(draft, widgetTabId);
        draft.floatingWidgets.byId[floatingWidgetId] = {
          bounds: containedBounds.toProps(),
          id: floatingWidgetId,
          home: {
            side: location.side,
            widgetId: location.widgetId,
            widgetIndex,
          },
        };
        draft.floatingWidgets.allIds.push(floatingWidgetId);
        draft.widgets[floatingWidgetId] = {
          activeTabId: widgetTabId,
          id: floatingWidgetId,
          minimized: false,
          tabs: [widgetTabId],
        };
      });
    } else if (isPopoutLocation(location)) {
      return convertPopoutWidgetContainerToFloating(state, location.popoutWidgetId);
    }
  }
  return undefined;
}

/** @internal */
export function dockWidgetContainer(state: NineZoneState, widgetTabId: string, idIsContainerId?: boolean) {
  if (idIsContainerId) {
    const widgetLocation = findWidget(state, widgetTabId);
    if (widgetLocation) {
      if (isFloatingWidgetLocation(widgetLocation)) {
        const floatingWidgetId = widgetLocation.floatingWidgetId;
        return NineZoneStateReducer(state, {
          type: "FLOATING_WIDGET_SEND_BACK",
          id: floatingWidgetId,
        });
      } else {
        // istanbul ignore else
        if (isPopoutWidgetLocation(widgetLocation)) {
          const popoutWidgetId = widgetLocation.popoutWidgetId;
          return NineZoneStateReducer(state, {
            type: "POPOUT_WIDGET_SEND_BACK",
            id: popoutWidgetId,
          });
        }
      }
    }
  } else {
    const location = findTab(state, widgetTabId);
    if (location) {
      if (isFloatingLocation(location)) {
        const floatingWidgetId = location.widgetId;
        return NineZoneStateReducer(state, {
          type: "FLOATING_WIDGET_SEND_BACK",
          id: floatingWidgetId,
        });
      } else {
        // istanbul ignore else
        if (isPopoutLocation(location)) {
          const popoutWidgetId = location.widgetId;
          return NineZoneStateReducer(state, {
            type: "POPOUT_WIDGET_SEND_BACK",
            id: popoutWidgetId,
          });
        }
      }
    }
  }

  return undefined;
}

/** @internal */
export function convertFloatingWidgetContainerToPopout(state: NineZoneState, widgetContainerId: string): NineZoneState {
  // istanbul ignore next - not an expected condition
  if (!state.widgets[widgetContainerId]?.tabs || state.widgets[widgetContainerId].tabs.length !== 1) {
    // currently only support popping out a floating widget container if it has a single tab
    return state;
  }
  return produce(state, (draft) => {
    const floatingWidget = state.floatingWidgets.byId[widgetContainerId];
    const bounds = floatingWidget.bounds;
    const home = floatingWidget.home;
    const id = floatingWidget.id;
    // remove the floating entry
    delete draft.floatingWidgets.byId[widgetContainerId];
    const idIndex = draft.floatingWidgets.allIds.indexOf(widgetContainerId);
    draft.floatingWidgets.allIds.splice(idIndex, 1);
    // insert popout entry
    draft.popoutWidgets.byId[widgetContainerId] = { bounds, id, home };
    draft.popoutWidgets.allIds.push(widgetContainerId);
  });
}

/** @internal */
export function convertPopoutWidgetContainerToFloating(state: NineZoneState, widgetContainerId: string): NineZoneState {
  return produce(state, (draft) => {
    const popoutWidget = state.popoutWidgets.byId[widgetContainerId];
    const bounds = popoutWidget.bounds;
    const home = popoutWidget.home;
    const id = popoutWidget.id;
    // remove the floating entry
    delete draft.popoutWidgets.byId[widgetContainerId];
    const idIndex = draft.popoutWidgets.allIds.indexOf(widgetContainerId);
    draft.popoutWidgets.allIds.splice(idIndex, 1);
    // insert popout entry
    draft.floatingWidgets.byId[widgetContainerId] = { bounds, id, home };
    draft.floatingWidgets.allIds.push(widgetContainerId);
  });
}

/**
   * When running in web-browser - browser prohibits auto opening of popup windows so convert any PopoutWidgets to
   * FloatingWidgets in this situation.
   * @internal
   */
export function convertAllPopupWidgetContainersToFloating(state: NineZoneState): NineZoneState {
  return produce(state, (draft) => {
    for (const widgetContainerId of state.popoutWidgets.allIds) {
      const popoutWidget = state.popoutWidgets.byId[widgetContainerId];
      const bounds = popoutWidget.bounds;
      const home = popoutWidget.home;
      const id = popoutWidget.id;
      // remove the popout entry
      delete draft.popoutWidgets.byId[widgetContainerId];
      const idIndex = draft.popoutWidgets.allIds.indexOf(widgetContainerId);
      draft.popoutWidgets.allIds.splice(idIndex, 1);
      // insert floating entry
      draft.floatingWidgets.byId[widgetContainerId] = { bounds, id, home };
      draft.floatingWidgets.allIds.push(widgetContainerId);
    }
  });
}

/** @internal */
export function popoutWidgetToChildWindow(state: NineZoneState, widgetTabId: string, point?: PointProps, size?: SizeProps) {
  const location = findTab(state, widgetTabId);
  // istanbul ignore else
  if (location) {
    if (isPopoutLocation(location))
      return undefined; // already popout

    const tab = state.tabs[widgetTabId];
    const preferredSizeAndPosition = { height: 800, width: 600, x: 0, y: 0, ...tab.preferredPopoutWidgetSize, ...size, ...point };
    const preferredBounds = Rectangle.createFromSize(preferredSizeAndPosition).offset(preferredSizeAndPosition);

    const nzBounds = Rectangle.createFromSize(state.size);
    const containedBounds = preferredBounds.containIn(nzBounds);
    const popoutWidgetId = getUniqueId();

    // istanbul ignore else - no else/using as type guard to cast
    if (isPanelLocation(location)) {
      const panel = state.panels[location.side];
      const widgetIndex = panel.widgets.indexOf(location.widgetId);

      return produce(state, (draft) => {
        const popoutTab = draft.tabs[widgetTabId];
        initSizeAndPositionProps(popoutTab, "preferredPopoutWidgetSize", preferredSizeAndPosition);
        removeWidgetTab(draft, widgetTabId);
        if (!draft.popoutWidgets) {
          draft.popoutWidgets = {
            byId: {},
            allIds: [],
          };
        }
        draft.popoutWidgets.byId[popoutWidgetId] = {
          bounds: containedBounds.toProps(),
          id: popoutWidgetId,
          home: {
            side: location.side,
            widgetId: location.widgetId,
            widgetIndex,
          },
        };
        draft.popoutWidgets.allIds.push(popoutWidgetId);
        draft.widgets[popoutWidgetId] = {
          activeTabId: widgetTabId,
          id: popoutWidgetId,
          minimized: false,
          tabs: [widgetTabId],
        };
      });
    } else if (isFloatingLocation(location)) {
      const floatingWidget = state.widgets[location.floatingWidgetId];
      // popout widget can only have a single widgetTab so if that is the case just convert floating container to popout container
      if (floatingWidget.tabs.length === 1) {
        return convertFloatingWidgetContainerToPopout(state, location.floatingWidgetId);
      }

      // remove the tab from the floating container and create a new popout container
      const home = state.floatingWidgets.byId[location.floatingWidgetId].home;
      return produce(state, (draft) => {
        const popoutTab = draft.tabs[widgetTabId];
        initSizeAndPositionProps(popoutTab, "preferredPopoutWidgetSize", preferredSizeAndPosition);
        removeWidgetTab(draft, widgetTabId);
        if (!draft.popoutWidgets) {
          draft.popoutWidgets = {
            byId: {},
            allIds: [],
          };
        }
        draft.popoutWidgets.byId[popoutWidgetId] = {
          bounds: containedBounds.toProps(),
          id: popoutWidgetId,
          home,
        };
        draft.popoutWidgets.allIds.push(popoutWidgetId);
        draft.widgets[popoutWidgetId] = {
          activeTabId: widgetTabId,
          id: popoutWidgetId,
          minimized: false,
          tabs: [widgetTabId],
        };
      });

    }
  }

  return undefined;
}
