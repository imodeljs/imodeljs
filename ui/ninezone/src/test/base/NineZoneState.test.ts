/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect, should } from "chai";
import { castDraft, produce } from "immer";
import { Point, Rectangle } from "@bentley/ui-core";
import {
  addFloatingWidget, addPanelWidget, addPopoutWidget, addTab, createDraggedTabState, createFloatingWidgetState,
  createHorizontalPanelState, createNineZoneState, createPanelsState, createTabsState,
  createTabState, createVerticalPanelState, createWidgetState, dockWidgetContainer, findTab, floatWidget,
  initSizeAndPositionProps, isHorizontalPanelState, NineZoneStateReducer, popoutWidgetToChildWindow,
  removeTab, toolSettingsTabId,
} from "../../ui-ninezone";
import {
  convertAllPopupWidgetContainersToFloating, convertFloatingWidgetContainerToPopout, convertPopoutWidgetContainerToFloating,
  NineZoneState,
} from "../../ui-ninezone/base/NineZoneState";

describe("isHorizontalPanelState", () => {
  it("returns true based on side property", () => {
    isHorizontalPanelState(createHorizontalPanelState("top")).should.true;
  });

  it("returns false based on side property", () => {
    isHorizontalPanelState(createVerticalPanelState("left")).should.false;
  });
});

describe("NineZoneStateReducer", () => {
  describe("RESIZE", () => {
    it("should toggle collapsed property of panel", () => {
      const state = createNineZoneState();
      const newState = NineZoneStateReducer(state, {
        type: "RESIZE",
        size: {
          height: 200,
          width: 300,
        },
      });
      newState.size.should.eql({ height: 200, width: 300 });
    });

    it("should contain floating widgets", () => {
      let state = createNineZoneState({
        size: {
          height: 200,
          width: 300,
        },
      });
      state = addFloatingWidget(state, "fw1", ["t1"], {
        bounds: {
          top: 0,
          bottom: 150,
          left: 100,
          right: 200,
        },
      });
      const newState = NineZoneStateReducer(state, {
        type: "RESIZE",
        size: {
          height: 200,
          width: 160,
        },
      });
      newState.floatingWidgets.byId.fw1.bounds.should.eql({
        top: 0,
        bottom: 150,
        left: 60,
        right: 160,
      });
    });
  });

  describe("PANEL_TOGGLE_COLLAPSED", () => {
    it("should toggle collapsed property of panel", () => {
      const state = createNineZoneState();
      const newState = NineZoneStateReducer(state, {
        type: "PANEL_TOGGLE_COLLAPSED",
        side: "left",
      });
      newState.panels.left.collapsed.should.not.eq(state.panels.left.collapsed);
    });
  });

  describe("PANEL_SET_COLLAPSED", () => {
    it("should collapse panel", () => {
      const state = createNineZoneState();
      const newState = NineZoneStateReducer(state, {
        type: "PANEL_SET_COLLAPSED",
        side: "left",
        collapsed: true,
      });
      newState.panels.left.collapsed.should.true;
    });
  });

  describe("PANEL_SET_SIZE", () => {
    it("should set panel size", () => {
      const state = createNineZoneState();
      const newState = NineZoneStateReducer(state, {
        type: "PANEL_SET_SIZE",
        side: "left",
        size: 400,
      });
      Number(400).should.eq(newState.panels.left.size);
    });
  });

  describe("PANEL_TOGGLE_SPAN", () => {
    it("should toggle span property of panel", () => {
      const state = createNineZoneState();
      const newState = NineZoneStateReducer(state, {
        type: "PANEL_TOGGLE_SPAN",
        side: "top",
      });
      newState.panels.top.span.should.not.eq(state.panels.top.span);
    });
  });

  describe("PANEL_TOGGLE_PINNED", () => {
    it("should toggle pinned property of panel", () => {
      const state = createNineZoneState();
      const newState = NineZoneStateReducer(state, {
        type: "PANEL_TOGGLE_PINNED",
        side: "top",
      });
      newState.panels.top.pinned.should.not.eq(state.panels.top.pinned);
    });
  });

  describe("PANEL_INITIALIZE", () => {
    it("should initialize", () => {
      const state = createNineZoneState();
      const newState = NineZoneStateReducer(state, {
        type: "PANEL_INITIALIZE",
        side: "left",
        size: 300,
      });
      newState.panels.left.size!.should.eq(300);
    });
  });

  describe("WIDGET_TAB_CLICK", () => {
    it("should activate tab", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = addTab(state, "t1");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_CLICK",
        side: "left",
        widgetId: "w1",
        id: "t1",
      });
      newState.widgets.w1.activeTabId.should.eq("t1");
    });

    it("should restore minimized widget", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"], { minimized: true });
      state = addTab(state, "t1");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_CLICK",
        side: "left",
        widgetId: "w1",
        id: "t1",
      });
      newState.widgets.w1.minimized.should.false;
    });

    it("should expand (minimize other widgets)", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = addPanelWidget(state, "left", "w2", ["t2"]);
      state = addPanelWidget(state, "left", "w3", ["t3"]);
      state = addTab(state, "t1");
      state = addTab(state, "t2");
      state = addTab(state, "t3");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_CLICK",
        side: "left",
        widgetId: "w1",
        id: "t1",
      });
      newState.widgets.w1.minimized.should.false;
      newState.widgets.w2.minimized.should.true;
      newState.widgets.w3.minimized.should.true;
    });

    it("should not expand clicked tab is not active", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = addPanelWidget(state, "left", "w2", ["t2"]);
      state = addPanelWidget(state, "left", "w3", ["t3"]);
      state = addTab(state, "t1");
      state = addTab(state, "t2");
      state = addTab(state, "t2");
      state = addTab(state, "t3");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_CLICK",
        side: "left",
        widgetId: "w1",
        id: "t2",
      });
      newState.widgets.w1.minimized.should.false;
      newState.widgets.w2.minimized.should.false;
      newState.widgets.w3.minimized.should.false;
    });

    it("should maximize minimized floating widget", () => {
      let state = createNineZoneState();
      state = addFloatingWidget(state, "w1", ["t1"], undefined, { minimized: true });
      state = addTab(state, "t1");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_CLICK",
        side: undefined,
        widgetId: "w1",
        id: "t1",
      });
      newState.widgets.w1.minimized.should.false;
    });

    it("should update preferredFloatingWidgetSize of a tab", () => {
      let state = createNineZoneState();
      state = addFloatingWidget(state, "w1", ["t1"], {
        bounds: new Rectangle(0, 100, 200, 400).toProps(),
      });
      state = addTab(state, "t1");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_CLICK",
        side: undefined,
        widgetId: "w1",
        id: "t1",
      });
      newState.tabs.t1.preferredFloatingWidgetSize!.should.eql({ height: 300, width: 200 });
    });
  });

  describe("WIDGET_TAB_DOUBLE_CLICK", () => {
    it("should expand minimized widget", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"], { minimized: true });
      state = addPanelWidget(state, "left", "w2", ["t2"]);
      state = addPanelWidget(state, "left", "w3", ["t3"]);
      state = addTab(state, "t1");
      state = addTab(state, "t2");
      state = addTab(state, "t3");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DOUBLE_CLICK",
        side: "left",
        widgetId: "w1",
        id: "t1",
        floatingWidgetId: undefined,
      });
      newState.widgets.w1.minimized.should.false;
      newState.widgets.w2.minimized.should.true;
      newState.widgets.w3.minimized.should.true;
    });

    it("should activate inactive tab if widget is not minimized", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = addPanelWidget(state, "left", "w2", ["t2"]);
      state = addPanelWidget(state, "left", "w3", ["t3"]);
      state = addTab(state, "t1");
      state = addTab(state, "t2");
      state = addTab(state, "t3");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DOUBLE_CLICK",
        side: "left",
        widgetId: "w1",
        id: "t1",
        floatingWidgetId: undefined,
      });
      newState.widgets.w1.activeTabId.should.eq("t1");
    });

    it("should minimize", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = addPanelWidget(state, "left", "w2", ["t2"]);
      state = addPanelWidget(state, "left", "w3", ["t3"]);
      state = addTab(state, "t1");
      state = addTab(state, "t2");
      state = addTab(state, "t3");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DOUBLE_CLICK",
        side: "left",
        widgetId: "w1",
        id: "t1",
        floatingWidgetId: undefined,
      });
      newState.widgets.w1.minimized.should.true;
    });

    it("should not minimize last non-minimized widget", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = addPanelWidget(state, "left", "w2", ["t2"], { minimized: true });
      state = addPanelWidget(state, "left", "w3", ["t3"], { minimized: true });
      state = addTab(state, "t1");
      state = addTab(state, "t2");
      state = addTab(state, "t3");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DOUBLE_CLICK",
        side: "left",
        widgetId: "w1",
        id: "t1",
        floatingWidgetId: undefined,
      });
      newState.should.eq(state);
    });

    it("should minimize floating widget", () => {
      let state = createNineZoneState();
      state = addFloatingWidget(state, "fw1", ["t1"]);
      state = addTab(state, "t1");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DOUBLE_CLICK",
        id: "t1",
        side: undefined,
        widgetId: "fw1",
        floatingWidgetId: "fw1",
      });
      newState.widgets.fw1.minimized.should.true;
    });

    it("should activate tab", () => {
      let state = createNineZoneState();
      state = addFloatingWidget(state, "fw1", ["t1"]);
      state = addTab(state, "t1");
      state = addTab(state, "t2");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DOUBLE_CLICK",
        id: "t2",
        side: undefined,
        widgetId: "fw1",
        floatingWidgetId: "fw1",
      });
      newState.widgets.fw1.activeTabId.should.eq("t2");
    });
  });

  describe("PANEL_WIDGET_DRAG_START", () => {
    it("should move widget to floating state", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      const newState = NineZoneStateReducer(state, {
        type: "PANEL_WIDGET_DRAG_START",
        bounds: new Rectangle().toProps(),
        id: "w1",
        newFloatingWidgetId: "newId",
        side: "left",
      });
      (!!newState.floatingWidgets.byId.newId).should.true;
      newState.panels.left.widgets.length.should.eq(0);
    });

    it("should keep one widget expanded", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = addPanelWidget(state, "left", "w2", ["t2"], { minimized: true });
      const newState = NineZoneStateReducer(state, {
        type: "PANEL_WIDGET_DRAG_START",
        bounds: new Rectangle().toProps(),
        id: "w1",
        newFloatingWidgetId: "newId",
        side: "left",
      });
      newState.widgets.w2.minimized.should.false;
    });
  });

  describe("WIDGET_DRAG", () => {
    it("should move floating widget", () => {
      let state = createNineZoneState();
      state = produce(state, (draft) => {
        draft.floatingWidgets.byId.fw1 = createFloatingWidgetState("fw1", {
          bounds: new Rectangle(0, 100, 200, 400).toProps(),
        });
      });
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_DRAG",
        dragBy: new Point(10, 20).toProps(),
        floatingWidgetId: "fw1",
      });
      newState.floatingWidgets.byId.fw1!.bounds.should.eql({
        left: 10,
        top: 120,
        right: 210,
        bottom: 420,
      });
    });
  });

  describe("WIDGET_DRAG_END", () => {
    describe("no target", () => {
      it("should not remove floating widget", () => {
        let state = createNineZoneState();
        state = addFloatingWidget(state, "fw1", ["t1"]);
        const newState = NineZoneStateReducer(state, {
          type: "WIDGET_DRAG_END",
          floatingWidgetId: "fw1",
          target: {
            type: "floatingWidget",
          },
        });
        (!!newState.floatingWidgets.byId.fw1).should.true;
      });

      it("should contain minimized", () => {
        let state = createNineZoneState({
          size: {
            height: 1000,
            width: 2000,
          },
        });
        state = addFloatingWidget(state, "w1", ["t1"], {
          bounds: {
            left: 2500,
            top: 990,
            right: 2700,
            bottom: 1100,
          },
        }, {
          minimized: true,
        });
        const newState = NineZoneStateReducer(state, {
          type: "WIDGET_DRAG_END",
          floatingWidgetId: "w1",
          target: {
            type: "floatingWidget",
          },
        });
        newState.floatingWidgets.byId.w1.bounds.should.eql({
          left: 1800,
          top: 965,
          right: 2000,
          bottom: 1075,
        });
      });
    });

    describe("tab target", () => {
      it("should add dragged tab", () => {
        let state = createNineZoneState();
        state = addPanelWidget(state, "left", "w1", ["t1", "t2", "t3"]);
        state = addTab(state, "t1");
        state = addTab(state, "t2");
        state = addTab(state, "t3");
        state = addFloatingWidget(state, "fw1", ["fwt1"]);
        state = addTab(state, "fwt1");
        const newState = NineZoneStateReducer(state, {
          type: "WIDGET_DRAG_END",
          floatingWidgetId: "fw1",
          target: {
            type: "tab",
            tabIndex: 1,
            widgetId: "w1",
          },
        });
        newState.widgets.w1.tabs.length.should.eq(4);
        newState.widgets.w1.tabs[1].should.eq("fwt1");
      });

      it("should update home of tool settings floating widget", () => {
        let state = createNineZoneState();
        state = addFloatingWidget(state, "fw1", [toolSettingsTabId]);
        state = addFloatingWidget(state, "fw2", ["t2"], {
          home: {
            side: "bottom",
            widgetId: undefined,
            widgetIndex: 0,
          },
        });
        const newState = NineZoneStateReducer(state, {
          type: "WIDGET_DRAG_END",
          floatingWidgetId: "fw2",
          target: {
            type: "tab",
            tabIndex: 0,
            widgetId: "fw1",
          },
        });
        newState.floatingWidgets.byId.fw1.home.should.not.eq(state.floatingWidgets.byId.fw1.home);
        newState.floatingWidgets.byId.fw1.home.should.eql({
          side: "bottom",
          widgetId: undefined,
          widgetIndex: 0,
        });
      });
    });

    describe("widget target", () => {
      it("should add widget", () => {
        let state = createNineZoneState();
        state = addPanelWidget(state, "left", "w1", ["t1"]);
        state = addPanelWidget(state, "left", "w2", ["t2"]);
        state = addFloatingWidget(state, "fw1", ["fwt1"]);
        const newState = NineZoneStateReducer(state, {
          type: "WIDGET_DRAG_END",
          floatingWidgetId: "fw1",
          target: {
            type: "widget",
            newWidgetId: "newId",
            side: "left",
            widgetIndex: 1,
          },
        });
        newState.panels.left.widgets.length.should.eq(3);
        newState.panels.left.widgets[1].should.eq("newId");
      });
    });

    describe("panel target", () => {
      it("should add panel", () => {
        let state = createNineZoneState();
        state = addFloatingWidget(state, "fw1", ["fwt1"]);
        const newState = NineZoneStateReducer(state, {
          type: "WIDGET_DRAG_END",
          floatingWidgetId: "fw1",
          target: {
            type: "panel",
            newWidgetId: "newId",
            side: "left",
          },
        });
        newState.panels.left.widgets.length.should.eq(1);
        newState.panels.left.widgets[0].should.eq("newId");
      });
    });
  });

  describe("FLOATING_WIDGET_SEND_BACK", () => {
    it("should send back to specified `left` panel widget", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"], {
        tabs: ["t0"],
      });
      state = addFloatingWidget(state, "fw1", ["fwt1"], {
        home: {
          side: "left",
          widgetId: "w1",
          widgetIndex: 0,
        },
      }, {
        tabs: ["t1", "t2"],
      });
      const newState = NineZoneStateReducer(state, {
        type: "FLOATING_WIDGET_SEND_BACK",
        id: "fw1",
      });
      newState.widgets.w1.tabs.should.eql(["t0", "t1", "t2"]);
      should().not.exist(newState.widgets.fw1);
      should().not.exist(newState.floatingWidgets.byId.fw1);
      newState.floatingWidgets.allIds.indexOf("fw1").should.eq(-1);
    });

    it("should send back to specified `left` panel widget via function call", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"], {
        tabs: ["t0"],
      });
      state = addFloatingWidget(state, "fw1", ["fwt1"], {
        home: {
          side: "left",
          widgetId: "w1",
          widgetIndex: 0,
        },
      }, {
        tabs: ["t1", "t2"],
      });

      const newState = dockWidgetContainer(state, "fw1", true);
      newState!.widgets.w1.tabs.should.eql(["t0", "t1", "t2"]);
      should().not.exist(newState!.widgets.fw1);
      should().not.exist(newState!.floatingWidgets.byId.fw1);
      newState!.floatingWidgets.allIds.indexOf("fw1").should.eq(-1);
    });

    it("should send back to specified `left` panel widget via tabId and function call", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"], {
        tabs: ["t0"],
      });
      state = addFloatingWidget(state, "fw1", ["fwt1"], {
        home: {
          side: "left",
          widgetId: "w1",
          widgetIndex: 0,
        },
      }, {
        tabs: ["t1", "t2"],
      });

      const newState = dockWidgetContainer(state, "t1", false);
      newState!.widgets.w1.tabs.should.eql(["t0", "t1", "t2"]);
      should().not.exist(newState!.widgets.fw1);
      should().not.exist(newState!.floatingWidgets.byId.fw1);
      newState!.floatingWidgets.allIds.indexOf("fw1").should.eq(-1);
    });

    it("should send back to specified `right` panel widget", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "right", "w1", ["t0"]);
      state = addFloatingWidget(state, "fw1", ["t1", "t2"], {
        home: {
          side: "right",
          widgetId: "w1",
          widgetIndex: 0,
        },
      });
      const newState = NineZoneStateReducer(state, {
        type: "FLOATING_WIDGET_SEND_BACK",
        id: "fw1",
      });
      newState.widgets.w1.tabs.should.eql(["t0", "t1", "t2"]);
      should().not.exist(newState.widgets.fw1);
      should().not.exist(newState.floatingWidgets.byId.fw1);
      newState.floatingWidgets.allIds.indexOf("fw1").should.eq(-1);
    });

    it("should send back to widget container named same as floating widget when widgetId is undefined", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = addFloatingWidget(state, "fw1", ["t2", "t3"], {
        home: {
          side: "left",
          widgetId: undefined,
          widgetIndex: 0,
        },
      });
      const newState = NineZoneStateReducer(state, {
        type: "FLOATING_WIDGET_SEND_BACK",
        id: "fw1",
      });

      newState.panels.left.widgets.should.eql(["fw1", "w1"]);
      newState.widgets.w1.tabs.should.eql(["t1"]);
      newState.widgets.fw1.tabs.should.eql(["t2", "t3"]);
      should().not.exist(newState.floatingWidgets.byId.fw1);
      newState.floatingWidgets.allIds.indexOf("fw1").should.eq(-1);
    });

    it("should send back to a newly created widget container if the container no longer exists because all widget tabs were floated", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w2", ["t2"]);
      state = addFloatingWidget(state, "fw1", ["t1", "t2"], {
        home: {
          side: "left",
          widgetId: "w1",
          widgetIndex: 0,
        },
      });

      state.widgets.fw1.tabs.should.eql(["t1", "t2"]);

      const newState = NineZoneStateReducer(state, {
        type: "FLOATING_WIDGET_SEND_BACK",
        id: "fw1",
      });

      newState.panels.left.widgets.should.eql(["w1", "w2"]);
      newState.widgets.w1.tabs.should.eql(["t1", "t2"]);
      should().not.exist(newState.floatingWidgets.byId.fw1);
      newState.floatingWidgets.allIds.indexOf("fw1").should.eq(-1);
    });

    it("should insert to provided widgetIndex when maxWidgetCount is reached", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = addTab(state, "t1");
      state = addPanelWidget(state, "left", "w2", ["t2"]);
      state = addTab(state, "t2");
      state = addPanelWidget(state, "left", "w3", ["t3"]);
      state = addTab(state, "t3");
      state = addFloatingWidget(state, "fw1", ["ft1", "ft2"], {
        home: {
          side: "left",
          widgetId: undefined,
          widgetIndex: 1,
        },
      });
      const newState = NineZoneStateReducer(state, {
        type: "FLOATING_WIDGET_SEND_BACK",
        id: "fw1",
      });

      newState.panels.left.widgets.should.eql(["w1", "w2", "w3"]);
      newState.widgets.w1.tabs.should.eql(["t1"]);
      newState.widgets.w2.tabs.should.eql(["t2", "ft1", "ft2"]);
      newState.widgets.w3.tabs.should.eql(["t3"]);
      should().not.exist(newState.floatingWidgets.byId.fw1);
      newState.floatingWidgets.allIds.indexOf("fw1").should.eq(-1);
      should().not.exist(newState.widgets.fw1);
    });
  });

  describe("FLOATING_WIDGET_RESIZE", () => {
    it("should resize widget", () => {
      let state = createNineZoneState();
      state = addFloatingWidget(state, "fw1", ["t1"], {
        bounds: new Rectangle(0, 100, 200, 400).toProps(),
      });
      state = addTab(state, "t1");
      const newState = NineZoneStateReducer(state, {
        type: "FLOATING_WIDGET_RESIZE",
        id: "fw1",
        resizeBy: new Rectangle(0, 10, 20, 40).toProps(),
      });
      newState.floatingWidgets.byId.fw1!.bounds.should.eql({
        left: 0,
        top: 90,
        right: 220,
        bottom: 440,
      });
    });

    it("should set preferredFloatingWidgetSize of active tab", () => {
      let state = createNineZoneState();
      state = addFloatingWidget(state, "fw1", ["t1"], {
        bounds: new Rectangle(0, 100, 200, 400).toProps(),
      });
      state = addTab(state, "t1");
      const newState = NineZoneStateReducer(state, {
        type: "FLOATING_WIDGET_RESIZE",
        id: "fw1",
        resizeBy: new Rectangle(0, 10, 20, 40).toProps(),
      });
      newState.tabs.t1.preferredFloatingWidgetSize!.should.eql({
        width: 220,
        height: 350,
      });
    });
  });

  describe("FLOATING_WIDGET_BRING_TO_FRONT", () => {
    it("should bring widget to front", () => {
      let state = createNineZoneState();
      state = addFloatingWidget(state, "fw1", ["t1"]);
      state = addFloatingWidget(state, "fw2", ["t2"]);
      const newState = NineZoneStateReducer(state, {
        type: "FLOATING_WIDGET_BRING_TO_FRONT",
        id: "fw1",
      });
      newState.floatingWidgets.allIds.should.eql(["fw2", "fw1"]);
    });
  });

  describe("FLOATING_WIDGET_SET_ANIMATE_TRANSITION", () => {
    it("should set floating widget animate state", () => {
      let state = createNineZoneState();
      state = addFloatingWidget(state, "fw1", ["t1"]);
      const newState = NineZoneStateReducer(state, {
        type: "FLOATING_WIDGET_SET_ANIMATE_TRANSITION",
        id: "fw1",
        animateTransition: true,
      });
      newState.floatingWidgets.byId.fw1!.animateTransition.should.be.true;
    });
  });

  describe("WIDGET_TAB_DRAG_START", () => {
    it("should set dragged tab", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DRAG_START",
        floatingWidgetId: undefined,
        id: "t1",
        position: new Point(100, 200).toProps(),
        side: "left",
        widgetId: "w1",
      });
      (!!newState.draggedTab).should.true;
    });

    it("should remove tab from widget", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1", "t2"]);
      state = addTab(state, "t1");
      state = addTab(state, "t2");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DRAG_START",
        floatingWidgetId: undefined,
        id: "t1",
        position: new Point(100, 200).toProps(),
        side: "left",
        widgetId: "w1",
      });
      newState.widgets.w1.tabs.length.should.eq(1);
    });

    it("should remove widget from panel", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = addTab(state, "t1");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DRAG_START",
        floatingWidgetId: undefined,
        id: "t1",
        position: new Point(100, 200).toProps(),
        side: "left",
        widgetId: "w1",
      });
      newState.panels.left.widgets.length.should.eq(0);
    });

    it("should remove widget", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = addTab(state, "t1");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DRAG_START",
        floatingWidgetId: undefined,
        id: "t1",
        position: new Point(100, 200).toProps(),
        side: "left",
        widgetId: "w1",
      });
      should().not.exist(newState.widgets.w1);
    });

    it("should remove floating widget", () => {
      let state = createNineZoneState();
      state = addFloatingWidget(state, "fw1", ["t1"]);
      state = addTab(state, "t1");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DRAG_START",
        floatingWidgetId: "fw1",
        id: "t1",
        position: new Point(100, 200).toProps(),
        side: undefined,
        widgetId: "fw1",
      });
      (!!newState.floatingWidgets.byId.fw1).should.false;
    });

    it("should remove popout widget", () => {
      let state = createNineZoneState();
      state = addPopoutWidget(state, "pow1", ["t1"]);
      state = addTab(state, "t1");
      const newState = produce(state, (draft) => {
        removeTab(draft, "t1");
      });
      (!!newState.popoutWidgets.byId.pow1).should.false;
      // tab state should remain so preferred sizes are retained
      should().exist(newState.tabs.t1);
    });

    it("should keep active tab", () => {
      let state = createNineZoneState();
      state = addFloatingWidget(state, "fw1", ["t1", "t2"], undefined, { activeTabId: "t2" });
      state = addTab(state, "t1");
      state = addTab(state, "t2");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DRAG_START",
        floatingWidgetId: "fw1",
        id: "t2",
        position: new Point(100, 200).toProps(),
        side: undefined,
        widgetId: "fw1",
      });
      newState.widgets.fw1.activeTabId.should.eq("t1");
    });

    it("should keep one widget expanded", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = addPanelWidget(state, "left", "w2", ["t2"], { minimized: true });
      state = addTab(state, "t1");
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DRAG_START",
        floatingWidgetId: undefined,
        id: "t1",
        position: new Point(100, 200).toProps(),
        side: "left",
        widgetId: "w1",
      });
      newState.widgets.w2.minimized.should.false;
    });
  });

  describe("WIDGET_TAB_DRAG", () => {
    it("should update tab position", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", ["t1"]);
      state = produce(state, (draft) => {
        draft.draggedTab = createDraggedTabState("dt", {
          position: new Point(100, 200).toProps(),
        });
      });
      const newState = NineZoneStateReducer(state, {
        type: "WIDGET_TAB_DRAG",
        dragBy: new Point(10, 20).toProps(),
      });
      newState.draggedTab!.position.should.eql({
        x: 110,
        y: 220,
      });
    });
  });

  describe("WIDGET_TAB_DRAG_END", () => {
    describe("tab target", () => {
      it("should add tab", () => {
        let state = createNineZoneState();
        state = addPanelWidget(state, "left", "w1", ["t1", "t2"]);
        state = addTab(state, "t1");
        state = addTab(state, "t2");
        state = produce(state, (draft) => {
          draft.draggedTab = createDraggedTabState("dt", {
            position: new Point(100, 200).toProps(),
          });
        });
        const newState = NineZoneStateReducer(state, {
          type: "WIDGET_TAB_DRAG_END",
          id: "dt",
          target: {
            type: "tab",
            tabIndex: 1,
            widgetId: "w1",
          },
        });
        newState.widgets.w1.tabs.length.should.eq(3);
        newState.widgets.w1.tabs[1].should.eq("dt");
      });

      it("should update home of tool settings floating widget", () => {
        let state = createNineZoneState();
        state = produce(state, (draft) => {
          draft.draggedTab = createDraggedTabState("dt", {
            position: new Point(100, 200).toProps(),
            home: {
              side: "bottom",
              widgetId: undefined,
              widgetIndex: 0,
            },
          });
        });
        state = addFloatingWidget(state, "fw1", [toolSettingsTabId]);
        const newState = NineZoneStateReducer(state, {
          type: "WIDGET_TAB_DRAG_END",
          id: "d2",
          target: {
            type: "tab",
            tabIndex: 0,
            widgetId: "fw1",
          },
        });
        newState.floatingWidgets.byId.fw1.home.should.not.eq(state.floatingWidgets.byId.fw1.home);
        newState.floatingWidgets.byId.fw1.home.should.eql({
          side: "bottom",
          widgetId: undefined,
          widgetIndex: 0,
        });
      });
    });

    describe("widget target", () => {
      it("should add widget", () => {
        let state = createNineZoneState();
        state = addPanelWidget(state, "left", "w1", ["t1"]);
        state = produce(state, (draft) => {
          draft.draggedTab = createDraggedTabState("dt", {
            position: new Point(100, 200).toProps(),
          });
        });
        const newState = NineZoneStateReducer(state, {
          type: "WIDGET_TAB_DRAG_END",
          id: "dt",
          target: {
            type: "widget",
            newWidgetId: "newId",
            side: "left",
            widgetIndex: 0,
          },
        });
        newState.panels.left.widgets.length.should.eq(2);
        newState.panels.left.widgets[0].should.eq("newId");
      });
    });

    describe("panel target", () => {
      it("should add widget", () => {
        let state = createNineZoneState();
        state = produce(state, (draft) => {
          draft.draggedTab = createDraggedTabState("dt", {
            position: new Point(100, 200).toProps(),
          });
        });
        const newState = NineZoneStateReducer(state, {
          type: "WIDGET_TAB_DRAG_END",
          id: "dt",
          target: {
            type: "panel",
            newWidgetId: "newId",
            side: "left",
          },
        });
        newState.panels.left.widgets.length.should.eq(1);
        newState.panels.left.widgets[0].should.eq("newId");
      });
    });

    describe("floating widget target", () => {
      it("should add floating widget", () => {
        let state = createNineZoneState();
        state = produce(state, (draft) => {
          draft.tabs.dt = createTabState("dt");
        });
        state = produce(state, (draft) => {
          draft.draggedTab = createDraggedTabState("dt", {
            position: new Point(100, 200).toProps(),
          });
        });
        const newState = NineZoneStateReducer(state, {
          type: "WIDGET_TAB_DRAG_END",
          id: "dt",
          target: {
            type: "floatingWidget",
            newFloatingWidgetId: "newId",
            size: {
              height: 200,
              width: 200,
            },
          },
        });
        (!!newState.floatingWidgets.byId.newId).should.true;
      });
    });
  });

  describe("TOOL_SETTINGS_DOCK", () => {
    it("should dock from panel widget", () => {
      let state = createNineZoneState();
      state = addPanelWidget(state, "left", "w1", [toolSettingsTabId]);
      state = produce(state, (draft) => {
        draft.toolSettings = {
          type: "widget",
        };
      });
      const newState = NineZoneStateReducer(state, {
        type: "TOOL_SETTINGS_DOCK",
      });
      newState.toolSettings.type.should.eq("docked");
      should().not.exist(newState.widgets.w1);
    });

    it("should dock from floating widget", () => {
      let state = createNineZoneState();
      state = addFloatingWidget(state, "w1", [toolSettingsTabId]);
      state = produce(state, (draft) => {
        draft.toolSettings = {
          type: "widget",
        };
      });
      const newState = NineZoneStateReducer(state, {
        type: "TOOL_SETTINGS_DOCK",
      });
      newState.toolSettings.type.should.eq("docked");
      should().not.exist(newState.widgets.w1);
      should().not.exist(newState.floatingWidgets.byId.w1);
      newState.floatingWidgets.allIds.indexOf("w1").should.eq(-1);
    });
  });

  describe("TOOL_SETTINGS_DRAG_START", () => {
    it("should convert to floating widget", () => {
      const state = createNineZoneState();
      const newState = NineZoneStateReducer(state, {
        type: "TOOL_SETTINGS_DRAG_START",
        newFloatingWidgetId: "new-fw1",
      });
      newState.toolSettings.type.should.eq("widget");
      newState.floatingWidgets.byId["new-fw1"].id.should.eq("new-fw1");
    });

    it("should skip if not docked", () => {
      const state = produce(createNineZoneState(), (draft) => {
        draft.toolSettings.type = "widget";
      });
      const newState = NineZoneStateReducer(state, {
        type: "TOOL_SETTINGS_DRAG_START",
        newFloatingWidgetId: "new-fw1",
      });
      newState.should.eq(state);
    });

    it("should use preferredFloatingWidgetSize", () => {
      let state = createNineZoneState();
      state = produce(state, (draft) => {
        draft.tabs[toolSettingsTabId].preferredFloatingWidgetSize = { height: 400, width: 500 };
      });
      const newState = NineZoneStateReducer(state, {
        type: "TOOL_SETTINGS_DRAG_START",
        newFloatingWidgetId: "new-fw1",
      });

      newState.floatingWidgets.byId["new-fw1"].bounds.should.eql({
        left: 0,
        top: 0,
        bottom: 400,
        right: 500,
      });
    });
  });
});

describe("findTab", () => {
  it("should return undefined if widget is not found", () => {
    let nineZone = produce(createNineZoneState(), (draft) => {
      draft.widgets.w1 = castDraft(createWidgetState("w1", ["t1"]));
    });
    nineZone = addTab(nineZone, "t1");
    const tab = findTab(nineZone, "t1");
    should().not.exist(tab);
  });

  it("should return undefined if tab is not found", () => {
    let nineZone = createNineZoneState();
    nineZone = addPanelWidget(nineZone, "left", "w1", ["t1"]);
    nineZone = addTab(nineZone, "t1");
    const tab = findTab(nineZone, "t2");
    should().not.exist(tab);
  });
});

describe("removeTab", () => {
  it("should not remove when tab is not found", () => {
    const state = createNineZoneState();
    const newState = produce(state, (draft) => {
      removeTab(draft, "t1");
    });
    newState.should.eq(state);
  });

  it("should update widget activeTabId", () => {
    let state = createNineZoneState();
    state = addPanelWidget(state, "left", "w1", ["t1", "t2"]);
    state = addTab(state, "t1");
    state = addTab(state, "t2");
    const newState = produce(state, (draft) => {
      removeTab(draft, "t1");
    });
    newState.widgets.w1.activeTabId.should.eq("t2");
  });

  it("should not update widget activeTabId", () => {
    let state = createNineZoneState();
    state = addPanelWidget(state, "left", "w1", ["t1", "t2"]);
    state = addTab(state, "t1");
    state = addTab(state, "t2");
    const newState = produce(state, (draft) => {
      removeTab(draft, "t2");
    });
    newState.widgets.w1.activeTabId.should.eq("t1");
    newState.widgets.w1.tabs.should.eql(["t1"]);
  });
});

describe("float widget tab", () => {
  it("should apply position and size", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1"], { minimized: true });
    state = addPanelWidget(state, "right", "rightMiddle", ["t2"]);
    state = addPanelWidget(state, "right", "rightEnd", ["t3"]);
    state = addTab(state, "t1");
    state = addTab(state, "t2");
    state = addTab(state, "t3");
    const newState = floatWidget(state, "badname", { x: 55, y: 105 }, { height: 200, width: 200 });
    expect(newState).to.be.undefined;
    const newDockedState = dockWidgetContainer(state, "badname");
    expect(newDockedState).to.be.undefined;
  });

  it("should apply position and size", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1"], { minimized: true });
    state = addPanelWidget(state, "right", "rightMiddle", ["t2"]);
    state = addPanelWidget(state, "right", "rightEnd", ["t3"]);
    state = addTab(state, "t1");
    state = addTab(state, "t2");
    state = addTab(state, "t3");
    expect(Object.entries(state.floatingWidgets.byId).length).to.be.eql(0);
    state.widgets.rightStart.tabs.indexOf("t1").should.not.eq(-1);

    const newState = floatWidget(state, "t1", { x: 55, y: 105 }, { height: 200, width: 200 });
    expect(newState).to.not.be.undefined;
    // exercise code that return if already floating
    floatWidget(newState!, "t1", { x: 55, y: 105 }, { height: 200, width: 200 });

    expect(Object.entries(newState!.floatingWidgets.byId).length).to.be.eql(1);
    const floatingWidgetContainerId = Object.keys(newState!.floatingWidgets.byId)[0];
    newState!.floatingWidgets.byId[floatingWidgetContainerId].bounds.should.eql({
      left: 55,
      top: 105,
      bottom: 105 + 200,
      right: 55 + 200,
    });
    newState!.floatingWidgets.byId[floatingWidgetContainerId].home.should.eql({
      side: "right",
      widgetId: "rightStart",
      widgetIndex: 0,
    });

    // restore widget tab "t1" back to original "rightStart" location
    const dockedState = dockWidgetContainer(newState!, "t1");
    // exercise code that return if already docked
    dockWidgetContainer(newState!, "t1");
    expect(dockedState).to.not.be.undefined;
    // console.log (JSON.stringify(dockedState)); // eslint-disable-line no-console
    dockedState!.widgets.rightStart.tabs.indexOf("t1").should.not.eq(-1);
    expect(Object.entries(dockedState!.floatingWidgets.byId).length).to.be.eql(0);
  });

  it("should apply position and preferred size", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1"], { minimized: true });
    state = addPanelWidget(state, "right", "rightMiddle", ["t2"]);
    state = addPanelWidget(state, "right", "rightEnd", ["t3"]);
    state = addTab(state, "t1", { preferredFloatingWidgetSize: { height: 222, width: 222 } });
    state = addTab(state, "t2");
    state = addTab(state, "t3");
    expect(Object.entries(state.floatingWidgets.byId).length).to.be.eql(0);
    state.widgets.rightStart.tabs.indexOf("t1").should.not.eq(-1);

    const newState = floatWidget(state, "t1", { x: 55, y: 105 });
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.floatingWidgets.byId).length).to.be.eql(1);
    const floatingWidgetContainerId = Object.keys(newState!.floatingWidgets.byId)[0];
    newState!.floatingWidgets.byId[floatingWidgetContainerId].bounds.should.eql({
      left: 55,
      top: 105,
      bottom: 105 + 222,
      right: 55 + 222,
    });
    newState!.floatingWidgets.byId[floatingWidgetContainerId].home.should.eql({
      side: "right",
      widgetId: "rightStart",
      widgetIndex: 0,
    });

    // restore widget tab "t1" back to original "rightStart" location
    const dockedState = dockWidgetContainer(newState!, "t1");
    expect(dockedState).to.not.be.undefined;
    dockedState!.widgets.rightStart.tabs.indexOf("t1").should.not.eq(-1);
    expect(Object.entries(dockedState!.floatingWidgets.byId).length).to.be.eql(0);
  });

  it("should apply default position {x:50, y:100} and size {height:400, width:400}", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1"], { minimized: true });
    state = addPanelWidget(state, "right", "rightMiddle", ["t2"]);
    state = addPanelWidget(state, "right", "rightEnd", ["t3"]);
    state = addTab(state, "t1");
    state = addTab(state, "t2");
    state = addTab(state, "t3");
    expect(Object.entries(state.floatingWidgets.byId).length).to.be.eql(0);
    state.widgets.rightStart.tabs.indexOf("t1").should.not.eq(-1);

    const newState = floatWidget(state, "t1");
    expect(newState).to.not.be.undefined;

    expect(Object.entries(newState!.floatingWidgets.byId).length).to.be.eql(1);
    const floatingWidgetContainerId = Object.keys(newState!.floatingWidgets.byId)[0];
    newState!.floatingWidgets.byId[floatingWidgetContainerId].bounds.should.eql({
      left: 50,
      top: 100,
      bottom: 100 + 400,
      right: 50 + 400,
    });
    newState!.floatingWidgets.byId[floatingWidgetContainerId].home.should.eql({
      side: "right",
      widgetId: "rightStart",
      widgetIndex: 0,
    });

    // restore widget tab "t1" back to original "rightStart" location
    const dockedState = dockWidgetContainer(newState!, "t1");
    // exercise code that return if already docked
    dockWidgetContainer(newState!, "t1");
    expect(dockedState).to.not.be.undefined;
    // console.log (JSON.stringify(dockedState)); // eslint-disable-line no-console
    dockedState!.widgets.rightStart.tabs.indexOf("t1").should.not.eq(-1);
    expect(Object.entries(dockedState!.floatingWidgets.byId).length).to.be.eql(0);
  });

  it("should apply position and default size of (400,400)", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1"], { minimized: true });
    state = addPanelWidget(state, "right", "rightMiddle", ["t2"]);
    state = addPanelWidget(state, "right", "rightEnd", ["t3"]);
    state = addTab(state, "t1");
    state = addTab(state, "t2");
    state = addTab(state, "t3");
    expect(Object.entries(state.floatingWidgets.byId).length).to.be.eql(0);
    state.widgets.rightStart.tabs.indexOf("t1").should.not.eq(-1);

    const newState = floatWidget(state, "t1", { x: 55, y: 105 });
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.floatingWidgets.byId).length).to.be.eql(1);
    const floatingWidgetContainerId = Object.keys(newState!.floatingWidgets.byId)[0];
    newState!.floatingWidgets.byId[floatingWidgetContainerId].bounds.should.eql({
      left: 55,
      top: 105,
      bottom: 105 + 400,
      right: 55 + 400,
    });
    newState!.floatingWidgets.byId[floatingWidgetContainerId].home.should.eql({
      side: "right",
      widgetId: "rightStart",
      widgetIndex: 0,
    });

    // restore widget tab "t1" back to original "rightStart" location
    const dockedState = dockWidgetContainer(newState!, "t1");
    expect(dockedState).to.not.be.undefined;
    dockedState!.widgets.rightStart.tabs.indexOf("t1").should.not.eq(-1);
    expect(Object.entries(dockedState!.floatingWidgets.byId).length).to.be.eql(0);
  });

  it("should properly handle multiple widget tabs", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1", "ta", "tb"], { minimized: true });
    state = addPanelWidget(state, "right", "rightMiddle", ["t2"]);
    state = addPanelWidget(state, "right", "rightEnd", ["t3"]);
    state = addTab(state, "t1");
    state = addTab(state, "ta");
    state = addTab(state, "tb");
    state = addTab(state, "t2");
    state = addTab(state, "t3");
    expect(Object.entries(state.floatingWidgets.byId).length).to.be.eql(0);
    state.widgets.rightStart.tabs.indexOf("t1").should.not.eq(-1);

    const newState = floatWidget(state, "t1", { x: 55, y: 105 });
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.floatingWidgets.byId).length).to.be.eql(1);
    const floatingWidgetContainerId = Object.keys(newState!.floatingWidgets.byId)[0];
    newState!.floatingWidgets.byId[floatingWidgetContainerId].bounds.should.eql({
      left: 55,
      top: 105,
      bottom: 105 + 400,
      right: 55 + 400,
    });
    newState!.floatingWidgets.byId[floatingWidgetContainerId].home.should.eql({
      side: "right",
      widgetId: "rightStart",
      widgetIndex: 0,
    });

    // restore widget tab "t1" back to original "rightStart" location
    const dockedState = dockWidgetContainer(newState!, "t1");
    expect(dockedState).to.not.be.undefined;
    // console.log (JSON.stringify(dockedState)); // eslint-disable-line no-console
    dockedState!.widgets.rightStart.tabs.indexOf("t1").should.not.eq(-1);
    expect(Object.entries(dockedState!.floatingWidgets.byId).length).to.be.eql(0);
  });

  it("should create popout entries with default size and location", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1", "ta", "tb"], { minimized: true });
    state = addTab(state, "t1");
    state = addTab(state, "ta");
    state = addTab(state, "tb");
    const newState = popoutWidgetToChildWindow(state, "t1");
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.popoutWidgets.byId).length).to.be.eql(1);
    const popoutWidgetContainerId = Object.keys(newState!.popoutWidgets.byId)[0];

    newState!.popoutWidgets.byId[popoutWidgetContainerId].bounds.should.eql({
      left: 0,
      top: 0,
      bottom: 800,
      right: 600,
    });
  });

  it("should create popout entries with specified size and location", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1", "ta", "tb"], { minimized: true });
    state = addTab(state, "t1");
    state = addTab(state, "ta");
    state = addTab(state, "tb");
    const newState = popoutWidgetToChildWindow(state, "t1", { x: 5, y: 10 }, { width: 100, height: 200 });
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.popoutWidgets.byId).length).to.be.eql(1);
    const popoutWidgetContainerId = Object.keys(newState!.popoutWidgets.byId)[0];

    newState!.popoutWidgets.byId[popoutWidgetContainerId].bounds.should.eql({
      left: 5,
      top: 10,
      bottom: 10 + 200,
      right: 5 + 100,
    });

    // return undefined because it is already in popout state.
    const state2 = popoutWidgetToChildWindow(newState!, "t1");
    expect(state2).to.be.undefined;
  });

  it("should create popout entries with specified size and location (given initial state with no popout data)", () => {
    let state = {
      draggedTab: undefined,
      floatingWidgets: {
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
        height: 1000,
        width: 1600,
      },
    } as unknown;

    state = addPanelWidget(state as NineZoneState, "right", "rightStart", ["t1", "ta", "tb"], { minimized: true });
    state = addTab(state as NineZoneState, "t1");
    state = addTab(state as NineZoneState, "ta");
    state = addTab(state as NineZoneState, "tb");
    const newState = popoutWidgetToChildWindow(state as NineZoneState, "t1", { x: 5, y: 10 }, { width: 100, height: 200 });
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.popoutWidgets.byId).length).to.be.eql(1);
    const popoutWidgetContainerId = Object.keys(newState!.popoutWidgets.byId)[0];

    newState!.popoutWidgets.byId[popoutWidgetContainerId].bounds.should.eql({
      left: 5,
      top: 10,
      bottom: 10 + 200,
      right: 5 + 100,
    });

    // return undefined because it is already in popout state.
    expect(popoutWidgetToChildWindow(newState!, "t1")).to.be.undefined;

    // return undefined because no tab "zz" is defined.
    expect(popoutWidgetToChildWindow(newState!, "zz")).to.be.undefined;
  });

  it("should create multiple popout entries and then remove the last one (via reducer)", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1", "ta", "tb"], { minimized: true });
    state = addTab(state, "t1");
    state = addTab(state, "ta");
    state = addTab(state, "tb");
    let newState = popoutWidgetToChildWindow(state, "t1");
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.popoutWidgets.byId).length).to.be.eql(1);
    const popoutWidgetContainerId1 = Object.keys(newState!.popoutWidgets.byId)[0];

    newState = popoutWidgetToChildWindow(newState!, "ta");
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.popoutWidgets.byId).length).to.be.eql(2);
    const popoutWidgetContainerId2 = Object.keys(newState!.popoutWidgets.byId)[1];
    const latestState = NineZoneStateReducer(newState!, {
      type: "POPOUT_WIDGET_SEND_BACK",
      id: popoutWidgetContainerId2,
    });
    expect(Object.entries(latestState.popoutWidgets.byId).length).to.be.eql(1);
    expect(Object.keys(latestState.popoutWidgets.byId)[0]).to.be.eql(popoutWidgetContainerId1);
  });

  it("should send back to widget container named same as floating widget when widgetId is undefined", () => {
    let state = createNineZoneState();
    state = addPanelWidget(state, "left", "w1", ["t1"]);
    state = addPopoutWidget(state, "fw1", ["t2", "t3"], {
      home: {
        side: "left",
        widgetId: undefined,
        widgetIndex: 0,
      },
    });
    const newState = NineZoneStateReducer(state, {
      type: "POPOUT_WIDGET_SEND_BACK",
      id: "fw1",
    });

    newState.panels.left.widgets.should.eql(["fw1", "w1"]);
    newState.widgets.w1.tabs.should.eql(["t1"]);
    newState.widgets.fw1.tabs.should.eql(["t2", "t3"]);
    should().not.exist(newState.popoutWidgets.byId.fw1);
    newState.popoutWidgets.allIds.indexOf("fw1").should.eq(-1);
  });

  it("should send back to a newly created widget container if the container no longer exists because all widget tabs were popped out", () => {
    let state = createNineZoneState();
    state = addPanelWidget(state, "left", "w2", ["t2"]);
    state = addPopoutWidget(state, "fw1", ["t1", "t2"], {
      home: {
        side: "left",
        widgetId: "w1",
        widgetIndex: 0,
      },
    });

    state.widgets.fw1.tabs.should.eql(["t1", "t2"]);

    const newState = NineZoneStateReducer(state, {
      type: "POPOUT_WIDGET_SEND_BACK",
      id: "fw1",
    });

    newState.panels.left.widgets.should.eql(["w1", "w2"]);
    newState.widgets.w1.tabs.should.eql(["t1", "t2"]);
    should().not.exist(newState.popoutWidgets.byId.fw1);
    newState.popoutWidgets.allIds.indexOf("fw1").should.eq(-1);
  });

  it("should insert to provided widgetIndex when maxWidgetCount is reached", () => {
    let state = createNineZoneState();
    state = addPanelWidget(state, "left", "w1", ["t1"]);
    state = addTab(state, "t1");
    state = addPanelWidget(state, "left", "w2", ["t2"]);
    state = addTab(state, "t2");
    state = addPanelWidget(state, "left", "w3", ["t3"]);
    state = addTab(state, "t3");
    state = addPopoutWidget(state, "fw1", ["ft1", "ft2"], {
      home: {
        side: "left",
        widgetId: undefined,
        widgetIndex: 1,
      },
    });
    const newState = NineZoneStateReducer(state, {
      type: "POPOUT_WIDGET_SEND_BACK",
      id: "fw1",
    });

    newState.panels.left.widgets.should.eql(["w1", "w2", "w3"]);
    newState.widgets.w1.tabs.should.eql(["t1"]);
    newState.widgets.w2.tabs.should.eql(["t2", "ft1", "ft2"]);
    newState.widgets.w3.tabs.should.eql(["t3"]);
    should().not.exist(newState.popoutWidgets.byId.fw1);
    newState.popoutWidgets.allIds.indexOf("fw1").should.eq(-1);
    should().not.exist(newState.widgets.fw1);
  });

  it("should create multiple popout entries and then remove the last one (via function)", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1", "ta", "tb"], { minimized: true });
    state = addTab(state, "t1");
    state = addTab(state, "ta");
    state = addTab(state, "tb");
    let newState = popoutWidgetToChildWindow(state, "t1");
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.popoutWidgets.byId).length).to.be.eql(1);
    const popoutWidgetContainerId1 = Object.keys(newState!.popoutWidgets.byId)[0];

    expect(dockWidgetContainer(newState!, "zz", true)).to.be.undefined;

    newState = popoutWidgetToChildWindow(newState!, "ta");
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.popoutWidgets.byId).length).to.be.eql(2);
    const popoutWidgetContainerId2 = Object.keys(newState!.popoutWidgets.byId)[1];
    let latestState = dockWidgetContainer(newState!, popoutWidgetContainerId2, true);
    expect(Object.entries(latestState!.popoutWidgets.byId).length).to.be.eql(1);
    expect(Object.keys(latestState!.popoutWidgets.byId)[0]).to.be.eql(popoutWidgetContainerId1);

    latestState = dockWidgetContainer(latestState!, "t1", false);
    expect(Object.entries(latestState!.popoutWidgets.byId).length).to.be.eql(0);
  });

  it("should create multiple popout entries and then convert them to floating", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1", "ta", "tb"], { minimized: true });
    state = addTab(state, "t1");
    state = addTab(state, "ta");
    state = addTab(state, "tb");
    let newState = popoutWidgetToChildWindow(state, "t1");
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.popoutWidgets.byId).length).to.be.eql(1);
    newState = popoutWidgetToChildWindow(newState!, "ta");
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.popoutWidgets.byId).length).to.be.eql(2);
    newState = convertAllPopupWidgetContainersToFloating(newState!);
    expect(Object.entries(newState.popoutWidgets.byId).length).to.be.eql(0);
  });

  it("should create multiple popout entries and then convert one of them to floating", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1", "ta", "tb"], { minimized: true });
    state = addTab(state, "t1");
    state = addTab(state, "ta");
    state = addTab(state, "tb");
    let newState = popoutWidgetToChildWindow(state, "t1");
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.popoutWidgets.byId).length).to.be.eql(1);
    const popoutWidgetContainerId1 = Object.keys(newState!.popoutWidgets.byId)[0];
    newState = popoutWidgetToChildWindow(newState!, "ta");
    expect(newState).to.not.be.undefined;
    expect(Object.entries(newState!.popoutWidgets.byId).length).to.be.eql(2);
    newState = convertPopoutWidgetContainerToFloating(newState!, popoutWidgetContainerId1);
    expect(Object.entries(newState.popoutWidgets.byId).length).to.be.eql(1);

    newState = convertFloatingWidgetContainerToPopout(newState, popoutWidgetContainerId1);
    expect(Object.entries(newState.popoutWidgets.byId).length).to.be.eql(2);
  });

  it("should process initSizeAndPositionProps", () => {
    let state = createNineZoneState({ size: { height: 1000, width: 1600 } });
    state = addPanelWidget(state, "right", "rightStart", ["t1", "ta", "tb"], { minimized: true });
    state = addTab(state, "t1");

    const preferredSizeAndPosition = { height: 800, width: 600, x: 55, y: 55 };
    state = produce(state, (draft) => {
      initSizeAndPositionProps(draft.tabs.t1, "preferredPopoutWidgetSize", preferredSizeAndPosition);
    });
    expect(state.tabs.t1.preferredPopoutWidgetSize?.height).to.be.eql(preferredSizeAndPosition.height);
    expect(state.tabs.t1.preferredPopoutWidgetSize?.width).to.be.eql(preferredSizeAndPosition.width);

    const preferredSizeAndPosition2 = { height: 800, width: 600, x: 75, y: 75 };
    state = produce(state, (draft) => {
      initSizeAndPositionProps(draft.tabs.t1, "preferredPopoutWidgetSize", preferredSizeAndPosition2);
    });
    expect(state.tabs.t1.preferredPopoutWidgetSize?.height).to.be.eql(preferredSizeAndPosition2.height);
    expect(state.tabs.t1.preferredPopoutWidgetSize?.width).to.be.eql(preferredSizeAndPosition2.width);
  });
});
