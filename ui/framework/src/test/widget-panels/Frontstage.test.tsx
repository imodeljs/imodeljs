/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { shallow } from "enzyme";
import * as React from "react";
import * as sinon from "sinon";
import * as moq from "typemoq";
import produce from "immer";
import { render } from "@testing-library/react";
import { act, renderHook } from "@testing-library/react-hooks";
import { Logger } from "@bentley/bentleyjs-core";
import { AbstractWidgetProps, StagePanelLocation, StagePanelSection, UiItemsManager, UiItemsProvider, WidgetState } from "@bentley/ui-abstract";
import { Size, UiSettingsResult, UiSettingsStatus } from "@bentley/ui-core";
import { addFloatingWidget, addPanelWidget, addTab, createDraggedTabState, createNineZoneState, NineZone, NineZoneState, toolSettingsTabId } from "@bentley/ui-ninezone";
import {
  ActiveFrontstageDefProvider, addMissingWidgets, addPanelWidgets, addWidgets, CoreTools, expandWidget, Frontstage, FrontstageDef,
  FrontstageManager, FrontstageProvider, getWidgetId, initializeNineZoneState, initializePanel, isFrontstageStateSettingResult, ModalFrontstageComposer,
  packNineZoneState, restoreNineZoneState, setWidgetState, showWidget, StagePanel, StagePanelDef, StagePanelState, StagePanelZoneDef, StagePanelZonesDef,
  UiSettingsProvider, useActiveModalFrontstageInfo, useFrontstageManager, useNineZoneDispatch, useNineZoneState, useSavedFrontstageState,
  useSaveFrontstageSettings, useSyncDefinitions, useUpdateNineZoneSize, Widget, WidgetDef, WidgetPanelsFrontstage, WidgetPanelsFrontstageState, Zone, ZoneDef,
} from "../../ui-framework";
import TestUtils, { mount, storageMock, stubRaf, UiSettingsStub } from "../TestUtils";
import { IModelApp, NoRenderApp } from "@bentley/imodeljs-frontend";
import { should } from "chai";

/* eslint-disable @typescript-eslint/no-floating-promises, react/display-name */

function createSavedNineZoneState(args?: Partial<NineZoneState>) {
  return {
    ...createNineZoneState(args),
    tabs: {},
  };
}

type SavedNineZoneState = ReturnType<typeof packNineZoneState>;
type SavedTabState = SavedNineZoneState["tabs"][0];

function createSavedTabState(id: SavedTabState["id"], args?: Partial<SavedTabState>): SavedTabState {
  return {
    id,
    ...args,
  };
}

function createFrontstageState(nineZone = createSavedNineZoneState()): WidgetPanelsFrontstageState {
  return {
    id: "frontstage1",
    nineZone,
    stateVersion: 100,
    version: 100,
  };
}

/** @internal */
export class TestFrontstageUi2 extends FrontstageProvider {
  public get frontstage() {
    return (
      <Frontstage
        id="TestFrontstageUi2"
        defaultTool={CoreTools.selectElementCommand}
        defaultLayout="SingleContent"
        contentGroup="TestContentGroup1"
        leftPanel={
          <StagePanel
            panelZones={{
              start: {
                widgets: [
                  <Widget
                    key="LeftStart1"
                    id="LeftStart1"
                    label="Left Start 1"
                    element="Left Start 1 widget"
                  />,
                ],
              },
            }}
          />
        }
      />
    );
  }
}

/** @internal */
export class TestFrontstageUi1 extends FrontstageProvider {
  public get frontstage() {
    return (
      <Frontstage
        id="TestFrontstageUi1"
        defaultTool={CoreTools.selectElementCommand}
        defaultLayout="SingleContent"
        contentGroup="TestContentGroup1"
        centerLeft={
          <Zone
            widgets={[
              <Widget
                key="CenterLeft1"
                id="CenterLeft1"
              />,
            ]}
          />
        }
        bottomLeft={
          <Zone
            widgets={[
              <Widget
                key="BottomLeft1"
                id="BottomLeft1"
              />,
            ]}
          />
        }
        leftPanel={
          <StagePanel
            widgets={[
              <Widget
                key="Left1"
                id="Left1"
                label="Left 1"
                element="Left 1 widget"
              />,
            ]}
            panelZones={{
              start: {
                widgets: [
                  <Widget
                    key="LeftStart1"
                    id="LeftStart1"
                    label="Left Start 1"
                    element="Left Start 1 widget"
                  />,
                ],
              },
              middle: {
                widgets: [
                  <Widget
                    key="LeftMiddle1"
                    id="LeftMiddle1"
                    label="Left Middle 1"
                    element="Left Middle 1 widget"
                  />,
                ],
              },
              end: {
                widgets: [
                  <Widget
                    key="LeftEnd1"
                    id="LeftEnd1"
                    label="Left End 1"
                    element="Left End 1 widget"
                  />,
                ],
              },
            }}
          />
        }
        centerRight={
          <Zone
            widgets={[
              <Widget
                key="CenterRight1"
                id="CenterRight1"
              />,
            ]}
          />
        }
        bottomRight={
          <Zone
            widgets={[
              <Widget
                key="BottomRight1"
                id="BottomRight1"
              />,
            ]}
          />
        }
        rightPanel={
          <StagePanel
            widgets={[
              <Widget
                key="Right1"
                id="Right1"
                label="Right 1"
                element="Right 1 widget"
              />,
            ]}
            panelZones={{
              start: {
                widgets: [
                  <Widget
                    key="RightStart1"
                    id="RightStart1"
                    label="Right Start 1"
                    element="Right Start 1 widget"
                  />,
                ],
              },
              middle: {
                widgets: [
                  <Widget
                    key="RightMiddle1"
                    id="RightMiddle1"
                    label="Right Middle 1"
                    element="Right Middle 1 widget"
                  />,
                ],
              },
              end: {
                widgets: [
                  <Widget
                    key="RightEnd1"
                    id="RightEnd1"
                    label="Right End 1"
                    element="Right End 1 widget"
                  />,
                ],
              },
            }}
          />
        }
        topPanel={
          <StagePanel
            widgets={[
              <Widget
                key="Top1"
                id="Top1"
                label="Top 1"
                element="Top 1 widget"
              />,
            ]}
            panelZones={{
              start: {
                widgets: [
                  <Widget
                    key="TopStart1"
                    id="TopStart1"
                    label="Top Start 1"
                    element="Top Start 1 widget"
                  />,
                ],
              },
              end: {
                widgets: [
                  <Widget
                    key="TopEnd1"
                    id="TopEnd1"
                    label="Top End 1"
                    element="Top End 1 widget"
                  />,
                ],
              },
            }}
          />
        }
        topMostPanel={
          <StagePanel
            widgets={[
              <Widget
                key="TopMost1"
                id="TopMost1"
                label="Top Most 1"
                element="Top Most 1 widget"
              />,
            ]}
          />
        }
        bottomPanel={
          <StagePanel
            widgets={[
              <Widget
                key="Bottom1"
                id="Bottom1"
                label="Bottom 1"
                element="Bottom 1 widget"
              />,
            ]}
            panelZones={{
              start: {
                widgets: [
                  <Widget
                    key="BottomStart1"
                    id="BottomStart1"
                    label="Bottom Start 1"
                    element="Bottom Start 1 widget"
                  />,
                ],
              },
              end: {
                widgets: [
                  <Widget
                    key="BottomEnd1"
                    id="BottomEnd1"
                    label="Bottom End 1"
                    element="Bottom End 1 widget"
                  />,
                ],
              },
            }}
          />
        }
        bottomMostPanel={
          <StagePanel
            widgets={[
              <Widget
                key="BottomMost1"
                id="BottomMost1"
                label="Bottom Most 1"
                element="Bottom Most 1 widget"
              />,
            ]}
          />
        }
      />
    );
  }
}

/** @internal */
export class TestUi2Provider implements UiItemsProvider {
  public readonly id = "TestUi2Provider";

  public provideWidgets(_stageId: string, _stageUsage: string, location: StagePanelLocation, section?: StagePanelSection) {
    const widgets: Array<AbstractWidgetProps> = [];
    widgets.push({ // should only be added once to Left Start pane
      id: "TestUi2ProviderW1",
      label: "TestUi2Provider W1",
      getWidgetContent: () => "TestUi2Provider W1 widget",
    });
    if (location === StagePanelLocation.Right && section === StagePanelSection.Middle)
      widgets.push({
        id: "TestUi2ProviderRM1",
        label: "TestUi2Provider RM1",
        getWidgetContent: () => "TestUi2Provider RM1 widget",
      });
    return widgets;
  }
}

describe("Frontstage local storage wrapper", () => {
  const localStorageToRestore = Object.getOwnPropertyDescriptor(window, "localStorage")!;
  const localStorageMock = storageMock();

  before(async () => {
    Object.defineProperty(window, "localStorage", {
      get: () => localStorageMock,
    });
  });

  after(() => {
    Object.defineProperty(window, "localStorage", localStorageToRestore);
  });

  describe("WidgetPanelsFrontstage", () => {
    it("should render", () => {
      const frontstageDef = new FrontstageDef();
      sinon.stub(FrontstageManager, "activeFrontstageDef").get(() => frontstageDef);
      const wrapper = shallow(<WidgetPanelsFrontstage />);
      wrapper.should.matchSnapshot();
    });

    it("should render modal stage content", () => {
      const modalStageInfo = {
        title: "TestModalStage",
        content: <div>Hello World!</div>,
      };
      sinon.stub(FrontstageManager, "activeModalFrontstage").get(() => modalStageInfo);
      const frontstageDef = new FrontstageDef();
      const contentGroup = moq.Mock.ofType<FrontstageDef["contentGroup"]>();
      sinon.stub(FrontstageManager, "activeFrontstageDef").get(() => frontstageDef);
      sinon.stub(frontstageDef, "contentGroup").get(() => contentGroup.object);
      const wrapper = shallow(<WidgetPanelsFrontstage />);
      wrapper.should.matchSnapshot();
    });

    it("should not render w/o frontstage", () => {
      sinon.stub(FrontstageManager, "activeFrontstageDef").get(() => undefined);
      const wrapper = shallow(<WidgetPanelsFrontstage />);
      wrapper.should.matchSnapshot();
    });
  });

  describe("ModalFrontstageComposer", () => {
    before(async () => {
      await TestUtils.initializeUiFramework();
    });

    after(() => {
      TestUtils.terminateUiFramework();
    });

    it("should render modal stage content when mounted", () => {
      const modalStageInfo = {
        title: "TestModalStage",
        content: <div>Hello World!</div>,
      };
      mount(<ModalFrontstageComposer stageInfo={modalStageInfo} />);
    });

    it("should add tool activated event listener", () => {
      const addListenerSpy = sinon.spy(FrontstageManager.onModalFrontstageChangedEvent, "addListener");
      const removeListenerSpy = sinon.spy(FrontstageManager.onModalFrontstageChangedEvent, "removeListener");
      const sut = renderHook(() => useActiveModalFrontstageInfo());
      sut.unmount();
      addListenerSpy.calledOnce.should.true;
      removeListenerSpy.calledOnce.should.true;
    });

    it("should update active modal info", () => {
      const modalStageInfo = {
        title: "TestModalStage",
        content: <div>Hello World!</div>,
      };

      sinon.stub(FrontstageManager, "activeModalFrontstage").get(() => undefined);
      renderHook(() => useActiveModalFrontstageInfo());
      act(() => {
        sinon.stub(FrontstageManager, "activeModalFrontstage").get(() => undefined);
        FrontstageManager.onModalFrontstageChangedEvent.emit({
          modalFrontstageCount: 0,
        });

        sinon.stub(FrontstageManager, "activeModalFrontstage").get(() => modalStageInfo);
        FrontstageManager.onModalFrontstageChangedEvent.emit({
          modalFrontstageCount: 1,
        });
      });
    });

    describe("ActiveFrontstageDefProvider", () => {
      before(async () => {
        await TestUtils.initializeUiFramework();
      });

      after(() => {
        TestUtils.terminateUiFramework();
      });

      beforeEach(() => {
        sinon.stub(FrontstageManager, "nineZoneSize").set(() => { });
      });

      it("should render", () => {
        const frontstageDef = new FrontstageDef();
        const wrapper = shallow(<ActiveFrontstageDefProvider frontstageDef={frontstageDef} />);
        wrapper.should.matchSnapshot();
      });

      it("should fall back to cached NineZoneState", () => {
        const frontstageDef = new FrontstageDef();
        frontstageDef.nineZoneState = createNineZoneState();

        const newFrontstageDef = new FrontstageDef();
        newFrontstageDef.nineZoneState = undefined;

        const wrapper = mount<{ frontstageDef: FrontstageDef }>(<ActiveFrontstageDefProvider frontstageDef={frontstageDef} />);
        wrapper.setProps({ frontstageDef: newFrontstageDef });

        const nineZone = wrapper.find(NineZone);
        nineZone.prop("state").should.eq(frontstageDef.nineZoneState);
      });
    });

    describe("useNineZoneDispatch", () => {
      beforeEach(() => {
        sinon.stub(FrontstageManager, "nineZoneSize").set(() => { });
      });

      it("should modify nineZoneState with default NineZoneReducer", () => {
        const frontstageDef = new FrontstageDef();
        const nineZoneState = createNineZoneState();
        frontstageDef.nineZoneState = nineZoneState;
        const { result } = renderHook(() => useNineZoneDispatch(frontstageDef));
        result.current({
          type: "PANEL_INITIALIZE",
          side: "left",
          size: 200,
        });
        frontstageDef.nineZoneState.should.not.eq(nineZoneState);
        (frontstageDef.nineZoneState.panels.left.size === 200).should.true;
      });

      it("should not modify when nineZoneState is not defined", () => {
        const frontstageDef = new FrontstageDef();
        frontstageDef.nineZoneState = undefined;
        const { result } = renderHook(() => useNineZoneDispatch(frontstageDef));
        result.current({
          type: "PANEL_INITIALIZE",
          side: "left",
          size: 200,
        });
        (frontstageDef.nineZoneState === undefined).should.true;
      });

      it("should set nineZoneSize when RESIZE is received", () => {
        const spy = sinon.stub(FrontstageManager, "nineZoneSize").set(() => { });
        const frontstageDef = new FrontstageDef();
        frontstageDef.nineZoneState = createNineZoneState();
        const { result } = renderHook(() => useNineZoneDispatch(frontstageDef));
        result.current({
          type: "RESIZE",
          size: {
            width: 5,
            height: 10,
          },
        });
        spy.calledOnceWithExactly(sinon.match({ width: 5, height: 10 }));
      });

      it("should set vertical (left/right) panel max size from percentage spec", () => {
        const frontstageDef = new FrontstageDef();
        const panel = new StagePanelDef();
        sinon.stub(panel, "maxSizeSpec").get(() => ({ percentage: 50 }));
        sinon.stub(frontstageDef, "leftPanel").get(() => panel);
        frontstageDef.nineZoneState = createNineZoneState();
        const { result } = renderHook(() => useNineZoneDispatch(frontstageDef));
        result.current({
          type: "RESIZE",
          size: {
            height: 200,
            width: 500,
          },
        });
        frontstageDef.nineZoneState.panels.left.maxSize.should.eq(250);
      });

      it("should set horizontal (top/bottom) panel max size from percentage spec", () => {
        const frontstageDef = new FrontstageDef();
        const panel = new StagePanelDef();
        sinon.stub(panel, "maxSizeSpec").get(() => ({ percentage: 50 }));
        sinon.stub(frontstageDef, "topPanel").get(() => panel);
        frontstageDef.nineZoneState = createNineZoneState();
        const { result } = renderHook(() => useNineZoneDispatch(frontstageDef));
        result.current({
          type: "RESIZE",
          size: {
            height: 200,
            width: 500,
          },
        });
        frontstageDef.nineZoneState.panels.top.maxSize.should.eq(100);
      });

      it("should update panel size", () => {
        const frontstageDef = new FrontstageDef();
        const panel = new StagePanelDef();
        sinon.stub(panel, "maxSizeSpec").get(() => 250);
        sinon.stub(frontstageDef, "leftPanel").get(() => panel);

        let state = createNineZoneState();
        state = produce(state, (draft) => {
          draft.panels.left.size = 300;
        });
        frontstageDef.nineZoneState = state;
        const { result } = renderHook(() => useNineZoneDispatch(frontstageDef));
        result.current({
          type: "RESIZE",
          size: {
            height: 200,
            width: 500,
          },
        });
        frontstageDef.nineZoneState.panels.left.size!.should.eq(250);
      });
    });

    describe("useNineZoneState", () => {
      it("should return initial nineZoneState", () => {
        const frontstageDef = new FrontstageDef();
        const nineZoneState = createNineZoneState();
        frontstageDef.nineZoneState = nineZoneState;
        const { result } = renderHook(() => useNineZoneState(frontstageDef));
        nineZoneState.should.eq(result.current);
      });

      it("should return nineZoneState of provided frontstageDef", () => {
        const frontstageDef = new FrontstageDef();
        const nineZoneState = createNineZoneState();
        frontstageDef.nineZoneState = nineZoneState;
        const newFrontstageDef = new FrontstageDef();
        const newNineZoneState = createNineZoneState();
        newFrontstageDef.nineZoneState = newNineZoneState;
        const { result, rerender } = renderHook((def: FrontstageDef) => useNineZoneState(def), {
          initialProps: frontstageDef,
        });
        rerender(newFrontstageDef);
        newNineZoneState.should.eq(result.current);
      });

      it("should return updated nineZoneState", () => {
        const frontstageDef = new FrontstageDef();
        const nineZoneState = createNineZoneState();
        const newNineZoneState = createNineZoneState();
        frontstageDef.nineZoneState = nineZoneState;
        const { result } = renderHook(() => useNineZoneState(frontstageDef));
        act(() => {
          frontstageDef.nineZoneState = newNineZoneState;
        });
        newNineZoneState.should.eq(result.current);
      });

      it("should ignore nineZoneState changes of other frontstages", () => {
        const frontstageDef = new FrontstageDef();
        const nineZoneState = createNineZoneState();
        const newNineZoneState = createNineZoneState();
        frontstageDef.nineZoneState = nineZoneState;
        const { result } = renderHook(() => useNineZoneState(frontstageDef));
        act(() => {
          (new FrontstageDef()).nineZoneState = newNineZoneState;
        });
        nineZoneState.should.eq(result.current);
      });
    });

    describe("useSavedFrontstageState", () => {
      it("should load saved nineZoneState", async () => {
        const setting = createFrontstageState();
        const uiSettings = new UiSettingsStub();
        sinon.stub(uiSettings, "getSetting").resolves({
          status: UiSettingsStatus.Success,
          setting,
        });
        const frontstageDef = new FrontstageDef();
        renderHook(() => useSavedFrontstageState(frontstageDef), {
          wrapper: (props) => <UiSettingsProvider {...props} settingsStorage={uiSettings} />,
        });
        await TestUtils.flushAsyncOperations();
        frontstageDef.nineZoneState?.should.matchSnapshot();
      });

      it("should not load nineZoneState when nineZoneState is already initialized", async () => {
        const frontstageDef = new FrontstageDef();
        frontstageDef.nineZoneState = createNineZoneState();
        const uiSettings = new UiSettingsStub();
        const spy = sinon.spy(uiSettings, "getSetting");
        renderHook(() => useSavedFrontstageState(frontstageDef), {
          wrapper: (props) => <UiSettingsProvider {...props} settingsStorage={uiSettings} />,
        });
        spy.notCalled.should.true;
      });

      it("should initialize nineZoneState", async () => {
        const setting = createFrontstageState();
        const uiSettings = new UiSettingsStub();
        sinon.stub(uiSettings, "getSetting").returns(Promise.resolve<UiSettingsResult>({
          status: UiSettingsStatus.Success,
          setting,
        }));
        const frontstageDef = new FrontstageDef();
        sinon.stub(frontstageDef, "version").get(() => setting.version + 1);
        renderHook(() => useSavedFrontstageState(frontstageDef), {
          wrapper: (props) => <UiSettingsProvider {...props} settingsStorage={uiSettings} />,
        });
        await TestUtils.flushAsyncOperations();
        (frontstageDef.nineZoneState !== undefined).should.true;
        frontstageDef.nineZoneState!.should.not.eq(setting.nineZone);
      });

      it("should add missing widgets", async () => {
        const setting = createFrontstageState();
        const uiSettings = new UiSettingsStub();
        sinon.stub(uiSettings, "getSetting").resolves({
          status: UiSettingsStatus.Success,
          setting,
        });
        const frontstageDef = new FrontstageDef();
        const leftPanel = new StagePanelDef();
        leftPanel.initializeFromProps({
          resizable: true,
          widgets: [
            <Widget
              key="w1"
              id="w1"
            />,
          ],
        }, StagePanelLocation.Left);
        sinon.stub(frontstageDef, "leftPanel").get(() => leftPanel);

        renderHook(() => useSavedFrontstageState(frontstageDef), {
          wrapper: (props) => <UiSettingsProvider {...props} settingsStorage={uiSettings} />,
        });
        await TestUtils.flushAsyncOperations();

        should().exist(frontstageDef.nineZoneState?.tabs.w1);
      });
    });

    describe("useSaveFrontstageSettings", () => {
      it("should save frontstage settings", () => {
        const fakeTimers = sinon.useFakeTimers();
        const uiSettings = new UiSettingsStub();
        const spy = sinon.stub(uiSettings, "saveSetting").resolves({
          status: UiSettingsStatus.Success,
        });
        const frontstageDef = new FrontstageDef();
        frontstageDef.nineZoneState = createNineZoneState();
        renderHook(() => useSaveFrontstageSettings(frontstageDef), {
          wrapper: (props) => <UiSettingsProvider {...props} settingsStorage={uiSettings} />,
        });
        fakeTimers.tick(1000);
        fakeTimers.restore();

        spy.calledOnce.should.true;
      });

      it("should not save if tab is dragged", () => {
        const fakeTimers = sinon.useFakeTimers();
        const uiSettings = new UiSettingsStub();
        const spy = sinon.stub(uiSettings, "saveSetting").resolves({
          status: UiSettingsStatus.Success,
        });
        const frontstageDef = new FrontstageDef();
        frontstageDef.nineZoneState = produce(createNineZoneState(), (draft) => {
          draft.draggedTab = createDraggedTabState("t1");
        });
        renderHook(() => useSaveFrontstageSettings(frontstageDef), {
          wrapper: (props) => <UiSettingsProvider {...props} settingsStorage={uiSettings} />,
        });
        fakeTimers.tick(1000);
        fakeTimers.restore();

        spy.notCalled.should.true;
      });
    });

    describe("useFrontstageManager", () => {
      it("should not handle onWidgetStateChangedEvent when nineZoneState is unset", () => {
        const frontstageDef = new FrontstageDef();
        frontstageDef.nineZoneState = undefined;
        renderHook(() => useFrontstageManager(frontstageDef));
        const widgetDef = new WidgetDef({});
        FrontstageManager.onWidgetStateChangedEvent.emit({
          widgetDef,
          widgetState: WidgetState.Open,
        });
        (frontstageDef.nineZoneState === undefined).should.true;
      });

      it("should handle onWidgetStateChangedEvent", () => {
        const frontstageDef = new FrontstageDef();
        let nineZoneState = createNineZoneState();
        nineZoneState = addPanelWidget(nineZoneState, "left", "w1", ["t1"]);
        nineZoneState = addPanelWidget(nineZoneState, "left", "w2", ["t2"]);
        nineZoneState = addTab(nineZoneState, "t1");
        frontstageDef.nineZoneState = nineZoneState;
        renderHook(() => useFrontstageManager(frontstageDef));
        const widgetDef = new WidgetDef({
          id: "t1",
        });
        FrontstageManager.onWidgetStateChangedEvent.emit({
          widgetDef,
          widgetState: WidgetState.Closed,
        });
        frontstageDef.nineZoneState.widgets.w1.minimized.should.true;
      });

      it("should handle onWidgetShowEvent", () => {
        const frontstageDef = new FrontstageDef();
        let nineZoneState = createNineZoneState();
        nineZoneState = addPanelWidget(nineZoneState, "left", "w1", ["t1"]);
        nineZoneState = addTab(nineZoneState, "t1");
        nineZoneState = produce(nineZoneState, (draft) => {
          draft.panels.left.collapsed = true;
        });
        frontstageDef.nineZoneState = nineZoneState;
        renderHook(() => useFrontstageManager(frontstageDef));
        const widgetDef = new WidgetDef({
          id: "t1",
        });
        FrontstageManager.onWidgetShowEvent.emit({
          widgetDef,
        });
        frontstageDef.nineZoneState.panels.left.collapsed.should.false;
      });

      it("should handle onWidgetExpandEvent", () => {
        const frontstageDef = new FrontstageDef();
        let nineZoneState = createNineZoneState();
        nineZoneState = addPanelWidget(nineZoneState, "left", "w1", ["t1"], { minimized: true });
        nineZoneState = addPanelWidget(nineZoneState, "left", "w2", ["t2"]);
        nineZoneState = addTab(nineZoneState, "t1");
        frontstageDef.nineZoneState = nineZoneState;
        renderHook(() => useFrontstageManager(frontstageDef));
        const widgetDef = new WidgetDef({
          id: "t1",
        });
        FrontstageManager.onWidgetExpandEvent.emit({
          widgetDef,
        });
        frontstageDef.nineZoneState.widgets.w1.minimized.should.false;
      });

      describe("onFrontstageRestoreLayoutEvent", () => {
        it("should delete saved setting", () => {
          const frontstageDef = new FrontstageDef();
          frontstageDef.nineZoneState = createNineZoneState();
          const uiSettings = new UiSettingsStub();
          const spy = sinon.spy(uiSettings, "deleteSetting");
          renderHook(() => useFrontstageManager(frontstageDef), {
            wrapper: (props) => <UiSettingsProvider {...props} settingsStorage={uiSettings} />,
          });
          FrontstageManager.onFrontstageRestoreLayoutEvent.emit({
            frontstageDef,
          });
          spy.calledOnce.should.true;
        });

        it("should unset nineZoneState", () => {
          const frontstageDef = new FrontstageDef();
          frontstageDef.nineZoneState = createNineZoneState();
          const uiSettings = new UiSettingsStub();
          renderHook(() => useFrontstageManager(frontstageDef), {
            wrapper: (props) => <UiSettingsProvider {...props} settingsStorage={uiSettings} />,
          });
          const frontstageDef1 = new FrontstageDef();
          sinon.stub(frontstageDef1, "id").get(() => "f1");
          frontstageDef1.nineZoneState = createNineZoneState();
          FrontstageManager.onFrontstageRestoreLayoutEvent.emit({
            frontstageDef: frontstageDef1,
          });
          (frontstageDef1.nineZoneState === undefined).should.true;
        });
      });

      describe("onWidgetLabelChangedEvent", () => {
        it("should update tab label", () => {
          const frontstageDef = new FrontstageDef();
          let state = createNineZoneState();
          state = addPanelWidget(state, "left", "w1", ["t1"]);
          state = addTab(state, "t1");
          frontstageDef.nineZoneState = state;
          const widgetDef = new WidgetDef({ id: "t1" });
          renderHook(() => useFrontstageManager(frontstageDef));

          sinon.stub(widgetDef, "label").get(() => "test");
          FrontstageManager.onWidgetLabelChangedEvent.emit({
            widgetDef,
          });

          frontstageDef.nineZoneState.tabs.t1.label.should.eq("test");
        });

        it("should not fail if tab doesn't exist", () => {
          const frontstageDef = new FrontstageDef();
          frontstageDef.nineZoneState = createNineZoneState();
          const widgetDef = new WidgetDef({ id: "t1" });
          renderHook(() => useFrontstageManager(frontstageDef));

          sinon.stub(widgetDef, "label").get(() => "test");

          (() => {
            FrontstageManager.onWidgetLabelChangedEvent.emit({ widgetDef });
          }).should.not.throw();
        });
      });
    });

    describe("useSyncDefinitions", () => {
      it("should set panel widget state to Open", () => {
        const frontstageDef = new FrontstageDef();
        const zoneDef = new ZoneDef();
        sinon.stub(frontstageDef, "centerRight").get(() => zoneDef);
        const widgetDef = new WidgetDef({});
        sinon.stub(widgetDef, "id").get(() => "t1");
        const spy = sinon.spy(widgetDef, "setWidgetState");
        zoneDef.addWidgetDef(widgetDef);
        renderHook(() => useSyncDefinitions(frontstageDef));
        act(() => {
          let nineZone = createNineZoneState();
          nineZone = addPanelWidget(nineZone, "left", "w1", ["t1"]);
          nineZone = addTab(nineZone, "t1");
          frontstageDef.nineZoneState = nineZone;
        });
        spy.calledOnceWithExactly(WidgetState.Open).should.true;
      });

      it("should set panel widget state to Closed", () => {
        const frontstageDef = new FrontstageDef();
        const zoneDef = new ZoneDef();
        sinon.stub(frontstageDef, "centerRight").get(() => zoneDef);
        const widgetDef = new WidgetDef({});
        sinon.stub(widgetDef, "id").get(() => "t1");
        const spy = sinon.spy(widgetDef, "setWidgetState");
        zoneDef.addWidgetDef(widgetDef);
        renderHook(() => useSyncDefinitions(frontstageDef));
        act(() => {
          let nineZone = createNineZoneState();
          nineZone = addPanelWidget(nineZone, "left", "w1", ["t1", "t2"], { activeTabId: "t2" });
          nineZone = addTab(nineZone, "t1");
          nineZone = addTab(nineZone, "t2");
          frontstageDef.nineZoneState = nineZone;
        });
        spy.calledOnceWithExactly(WidgetState.Closed).should.true;
      });

      it("should set StagePanelDef size", () => {
        const frontstageDef = new FrontstageDef();
        const rightPanel = new StagePanelDef();
        sinon.stub(frontstageDef, "rightPanel").get(() => rightPanel);
        const spy = sinon.spy(rightPanel, "size", ["set"]);
        renderHook(() => useSyncDefinitions(frontstageDef));
        act(() => {
          let nineZone = createNineZoneState();
          nineZone = produce(nineZone, (draft) => {
            draft.panels.right.size = 234;
          });
          frontstageDef.nineZoneState = nineZone;
        });
        sinon.assert.calledOnceWithExactly(spy.set, 234);
      });

      it("should set StagePanelState.Off", () => {
        const frontstageDef = new FrontstageDef();
        const rightPanel = new StagePanelDef();
        const spy = sinon.spy();
        sinon.stub(rightPanel, "panelState").get(() => StagePanelState.Off).set(spy);
        sinon.stub(frontstageDef, "rightPanel").get(() => rightPanel);
        renderHook(() => useSyncDefinitions(frontstageDef));
        act(() => {
          let nineZone = createNineZoneState();
          nineZone = produce(nineZone, (draft) => {
            draft.panels.right.collapsed = true;
          });
          frontstageDef.nineZoneState = nineZone;
        });
        sinon.assert.calledOnceWithExactly(spy, StagePanelState.Off);
      });

      it("should set floating widget state to Open", () => {
        const frontstageDef = new FrontstageDef();
        const zoneDef = new ZoneDef();
        sinon.stub(frontstageDef, "centerRight").get(() => zoneDef);
        const widgetDef = new WidgetDef({});
        sinon.stub(widgetDef, "id").get(() => "t1");
        const spy = sinon.spy(widgetDef, "setWidgetState");
        zoneDef.addWidgetDef(widgetDef);
        renderHook(() => useSyncDefinitions(frontstageDef));
        act(() => {
          let nineZone = createNineZoneState();
          nineZone = addFloatingWidget(nineZone, "w1", ["t1"]);
          nineZone = addTab(nineZone, "t1");
          frontstageDef.nineZoneState = nineZone;
        });
        spy.calledOnceWithExactly(WidgetState.Open).should.true;
      });

      it("should set floating widget state to Closed", () => {
        const frontstageDef = new FrontstageDef();
        const zoneDef = new ZoneDef();
        sinon.stub(frontstageDef, "centerRight").get(() => zoneDef);
        const widgetDef = new WidgetDef({});
        sinon.stub(widgetDef, "id").get(() => "t1");
        const spy = sinon.spy(widgetDef, "setWidgetState");
        zoneDef.addWidgetDef(widgetDef);
        renderHook(() => useSyncDefinitions(frontstageDef));
        act(() => {
          let nineZone = createNineZoneState();
          nineZone = addFloatingWidget(nineZone, "w1", ["t1", "t2"], undefined, { activeTabId: "t2" });
          nineZone = addTab(nineZone, "t1");
          frontstageDef.nineZoneState = nineZone;
        });
        spy.calledOnceWithExactly(WidgetState.Closed).should.true;
      });
    });

    describe("initializeNineZoneState", () => {
      it("should initialize widgets", () => {
        const frontstageDef = new FrontstageDef();
        sinon.stub(frontstageDef, "centerLeft").get(() => new ZoneDef());
        sinon.stub(frontstageDef, "bottomLeft").get(() => new ZoneDef());
        sinon.stub(frontstageDef, "leftPanel").get(() => new StagePanelDef());
        sinon.stub(frontstageDef, "centerRight").get(() => new ZoneDef());
        sinon.stub(frontstageDef, "bottomRight").get(() => new ZoneDef());
        sinon.stub(frontstageDef, "rightPanel").get(() => new StagePanelDef());
        sinon.stub(frontstageDef, "topPanel").get(() => new StagePanelDef());
        sinon.stub(frontstageDef, "topMostPanel").get(() => new StagePanelDef());
        sinon.stub(frontstageDef, "bottomPanel").get(() => new StagePanelDef());
        sinon.stub(frontstageDef, "bottomMostPanel").get(() => new StagePanelDef());
        const state = initializeNineZoneState(frontstageDef);
        state.should.matchSnapshot();
      });

      it("should keep one widget open", () => {
        const frontstageDef = new FrontstageDef();
        const centerLeft = new ZoneDef();
        const widgetDef = new WidgetDef({
          id: "w1",
        });
        sinon.stub(frontstageDef, "centerLeft").get(() => centerLeft);
        sinon.stub(centerLeft, "widgetDefs").get(() => [widgetDef]);
        const state = initializeNineZoneState(frontstageDef);
        state.widgets.leftStart.activeTabId.should.eq("w1");
      });

      it("should initialize size", () => {
        sinon.stub(FrontstageManager, "nineZoneSize").get(() => new Size(10, 20));
        const frontstageDef = new FrontstageDef();
        const sut = initializeNineZoneState(frontstageDef);
        sut.size.should.eql({ width: 10, height: 20 });
      });

      it("should not initialize size", () => {
        const frontstageDef = new FrontstageDef();
        const sut = initializeNineZoneState(frontstageDef);
        sut.size.should.eql({ width: 0, height: 0 });
      });

      it("should initialize preferredPanelWidgetSize of tool settings widget", () => {
        const frontstageDef = new FrontstageDef();
        const zoneDef = new ZoneDef();
        const widgetDef = new WidgetDef({
          id: "w1",
          preferredPanelSize: "fit-content",
        });
        sinon.stub(frontstageDef, "topCenter").get(() => zoneDef);
        sinon.stub(zoneDef, "getSingleWidgetDef").returns(widgetDef);
        const sut = initializeNineZoneState(frontstageDef);
        sut.tabs[toolSettingsTabId].preferredPanelWidgetSize!.should.eq("fit-content");
      });

      it("should add panel zone widgets", () => {
        const frontstageDef = new FrontstageDef();
        const panelDef = new StagePanelDef();
        const start = new StagePanelZoneDef();
        const middle = new StagePanelZoneDef();
        const end = new StagePanelZoneDef();
        const w1 = new WidgetDef({ id: "w1" });
        const w2 = new WidgetDef({ id: "w2" });
        const w3 = new WidgetDef({ id: "w3" });
        sinon.stub(frontstageDef, "leftPanel").get(() => panelDef);
        sinon.stub(panelDef.panelZones, "start").get(() => start);
        sinon.stub(panelDef.panelZones, "middle").get(() => middle);
        sinon.stub(panelDef.panelZones, "end").get(() => end);
        sinon.stub(start, "widgetDefs").get(() => [w1]);
        sinon.stub(middle, "widgetDefs").get(() => [w2]);
        sinon.stub(end, "widgetDefs").get(() => [w3]);
        const state = initializeNineZoneState(frontstageDef);
        state.panels.left.widgets.should.eql(["leftStart", "leftMiddle", "leftEnd"]);
        should().exist("w1");
        should().exist("w2");
        should().exist("w3");
      });
    });

    describe("addPanelWidgets", () => {
      it("should add widgets from panel zones", () => {
        let state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const leftPanel = new StagePanelDef();
        const panelZones = new StagePanelZonesDef();
        const panelZone = new StagePanelZoneDef();
        const widgetDef = new WidgetDef({
          id: "w1",
        });
        sinon.stub(frontstageDef, "leftPanel").get(() => leftPanel);
        sinon.stub(leftPanel, "panelZones").get(() => panelZones);
        sinon.stub(panelZones, "start").get(() => panelZone);
        sinon.stub(panelZone, "widgetDefs").get(() => [widgetDef]);
        state = addPanelWidgets(state, frontstageDef, "left");
        state.panels.left.widgets[0].should.eq("leftStart");
      });

      it("should add bottomLeft widgets", () => {
        let state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const zoneDef = new ZoneDef();
        const widgetDef = new WidgetDef({
          id: "w1",
        });
        sinon.stub(frontstageDef, "bottomLeft").get(() => zoneDef);
        sinon.stub(zoneDef, "widgetDefs").get(() => [widgetDef]);
        state = addPanelWidgets(state, frontstageDef, "left");
        state.panels.left.widgets[0].should.eq("leftMiddle");
        state.widgets.leftMiddle.tabs.should.eql(["w1"]);
      });

      it("should add centerRight widgets", () => {
        let state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const zoneDef = new ZoneDef();
        const widgetDef = new WidgetDef({
          id: "w1",
        });
        sinon.stub(frontstageDef, "centerRight").get(() => zoneDef);
        sinon.stub(zoneDef, "widgetDefs").get(() => [widgetDef]);
        state = addPanelWidgets(state, frontstageDef, "right");
        state.panels.right.widgets[0].should.eq("rightStart");
        state.widgets.rightStart.tabs.should.eql(["w1"]);
      });

      it("should add bottomRight widgets", () => {
        let state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const zoneDef = new ZoneDef();
        const widgetDef = new WidgetDef({
          id: "w1",
        });
        sinon.stub(frontstageDef, "bottomRight").get(() => zoneDef);
        sinon.stub(zoneDef, "widgetDefs").get(() => [widgetDef]);
        state = addPanelWidgets(state, frontstageDef, "right");
        state.panels.right.widgets[0].should.eq("rightMiddle");
        state.widgets.rightMiddle.tabs.should.eql(["w1"]);
      });

      it("should add leftPanel widgets", () => {
        let state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const panelDef = new StagePanelDef();
        const widgetDef = new WidgetDef({
          id: "w1",
        });
        sinon.stub(frontstageDef, "leftPanel").get(() => panelDef);
        sinon.stub(panelDef, "panelWidgetDefs").get(() => [widgetDef]);
        state = addPanelWidgets(state, frontstageDef, "left");
        state.panels.left.widgets[0].should.eq("leftEnd");
        state.widgets.leftEnd.tabs.should.eql(["w1"]);
      });

      it("should add rightPanel widgets", () => {
        let state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const panelDef = new StagePanelDef();
        const widgetDef = new WidgetDef({
          id: "w1",
        });
        sinon.stub(frontstageDef, "rightPanel").get(() => panelDef);
        sinon.stub(panelDef, "panelWidgetDefs").get(() => [widgetDef]);
        state = addPanelWidgets(state, frontstageDef, "right");
        state.panels.right.widgets[0].should.eq("rightEnd");
        state.widgets.rightEnd.tabs.should.eql(["w1"]);
      });

      it("should add topPanel widgets", () => {
        let state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const panelDef = new StagePanelDef();
        const widgetDef = new WidgetDef({
          id: "w1",
        });
        sinon.stub(frontstageDef, "topPanel").get(() => panelDef);
        sinon.stub(panelDef, "panelWidgetDefs").get(() => [widgetDef]);
        state = addPanelWidgets(state, frontstageDef, "top");
        state.panels.top.widgets[0].should.eq("topStart");
        state.widgets.topStart.tabs.should.eql(["w1"]);
      });

      it("should add topMostPanel widgets", () => {
        let state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const panelDef = new StagePanelDef();
        const widgetDef = new WidgetDef({
          id: "w1",
        });
        sinon.stub(frontstageDef, "topMostPanel").get(() => panelDef);
        sinon.stub(panelDef, "panelWidgetDefs").get(() => [widgetDef]);
        state = addPanelWidgets(state, frontstageDef, "top");
        state.panels.top.widgets[0].should.eq("topEnd");
        state.widgets.topEnd.tabs.should.eql(["w1"]);
      });

      it("should add bottomPanel widgets", () => {
        let state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const panelDef = new StagePanelDef();
        const widgetDef = new WidgetDef({
          id: "w1",
        });
        sinon.stub(frontstageDef, "bottomPanel").get(() => panelDef);
        sinon.stub(panelDef, "panelWidgetDefs").get(() => [widgetDef]);
        state = addPanelWidgets(state, frontstageDef, "bottom");
        state.panels.bottom.widgets[0].should.eq("bottomStart");
        state.widgets.bottomStart.tabs.should.eql(["w1"]);
      });

      it("should add bottomMostPanel widgets", () => {
        let state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const panelDef = new StagePanelDef();
        const widgetDef = new WidgetDef({
          id: "w1",
        });
        sinon.stub(frontstageDef, "bottomMostPanel").get(() => panelDef);
        sinon.stub(panelDef, "panelWidgetDefs").get(() => [widgetDef]);
        state = addPanelWidgets(state, frontstageDef, "bottom");
        state.panels.bottom.widgets[0].should.eq("bottomEnd");
        state.widgets.bottomEnd.tabs.should.eql(["w1"]);
      });
    });

    describe("initializePanel", () => {
      it("should initialize max size", () => {
        const state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const leftPanel = new StagePanelDef();
        sinon.stub(frontstageDef, "leftPanel").get(() => leftPanel);
        sinon.stub(leftPanel, "maxSizeSpec").get(() => 100);
        const sut = initializePanel(state, frontstageDef, "left");
        sut.panels.left.maxSize.should.eq(100);
      });

      it("should initialize min size", () => {
        const state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const leftPanel = new StagePanelDef();
        sinon.stub(frontstageDef, "leftPanel").get(() => leftPanel);
        sinon.stub(leftPanel, "minSize").get(() => 50);
        const sut = initializePanel(state, frontstageDef, "left");
        sut.panels.left.minSize.should.eq(50);
      });
    });

    describe("addWidgets", () => {
      it("should use widget label", () => {
        let state = createNineZoneState();
        const widget = new WidgetDef({
          id: "w1",
          label: "Widget 1",
        });
        state = addWidgets(state, [widget], "left", "leftStart");
        state.tabs.w1.label.should.eq("Widget 1");
      });

      it("should activate tab based on widget state", () => {
        let state = createNineZoneState();
        const widget = new WidgetDef({
          id: "w1",
          defaultState: WidgetState.Open,
        });
        state = addWidgets(state, [widget], "left", "leftStart");
        state.widgets.leftStart.activeTabId.should.eq("w1");
      });
    });

    describe("getWidgetId", () => {
      it("should return 'leftStart'", () => {
        getWidgetId("left", "start").should.eq("leftStart");
      });

      it("should return 'leftMiddle'", () => {
        getWidgetId("left", "middle").should.eq("leftMiddle");
      });

      it("should return 'leftEnd'", () => {
        getWidgetId("left", "end").should.eq("leftEnd");
      });

      it("should return 'rightStart'", () => {
        getWidgetId("right", "start").should.eq("rightStart");
      });

      it("should return 'rightMiddle'", () => {
        getWidgetId("right", "middle").should.eq("rightMiddle");
      });

      it("should return 'rightEnd'", () => {
        getWidgetId("right", "end").should.eq("rightEnd");
      });

      it("should return 'topStart'", () => {
        getWidgetId("top", "start").should.eq("topStart");
      });

      it("should return 'topEnd'", () => {
        getWidgetId("top", "end").should.eq("topEnd");
      });

      it("should return 'bottomStart'", () => {
        getWidgetId("bottom", "start").should.eq("bottomStart");
      });

      it("should return 'bottomEnd'", () => {
        getWidgetId("bottom", "end").should.eq("bottomEnd");
      });
    });

    describe("isFrontstageStateSettingResult", () => {
      it("isFrontstageStateSettingResult", () => {
        isFrontstageStateSettingResult({ status: UiSettingsStatus.UnknownError }).should.false;
      });
    });

    describe("setWidgetState", () => {
      it("should not update for other states", () => {
        let nineZone = createNineZoneState();
        nineZone = addPanelWidget(nineZone, "left", "w1", ["t1"]);
        nineZone = addTab(nineZone, "t1");
        const sut = setWidgetState(nineZone, new WidgetDef({ id: "t1" }), WidgetState.Floating);
        sut.should.eq(nineZone);
      });

      describe("WidgetState.Open", () => {
        it("should open widget", () => {
          let nineZone = createNineZoneState();
          nineZone = addPanelWidget(nineZone, "left", "w1", ["t1"]);
          nineZone = addTab(nineZone, "t1");
          const sut = setWidgetState(nineZone, new WidgetDef({ id: "t1" }), WidgetState.Open);
          sut.widgets.w1.activeTabId.should.eq("t1");
        });

        it("should add removed tab", () => {
          let nineZone = createNineZoneState();
          nineZone = addPanelWidget(nineZone, "left", "w1", ["t1"]);
          nineZone = addTab(nineZone, "t1");
          const sut = setWidgetState(nineZone, new WidgetDef({ id: "t2" }), WidgetState.Open);
          sut.panels.left.widgets.length.should.eq(2);
        });

        it("should add removed tab by existing widget", () => {
          let nineZone = createNineZoneState();
          nineZone = addPanelWidget(nineZone, "left", "w1", ["t1"]);
          nineZone = addPanelWidget(nineZone, "left", "w2", ["t2"]);
          nineZone = addTab(nineZone, "t1");
          nineZone = addTab(nineZone, "t2");
          const widgetDef = new WidgetDef({ id: "t3" });
          widgetDef.tabLocation = {
            ...widgetDef.tabLocation,
            widgetId: "w2",
          };
          const sut = setWidgetState(nineZone, widgetDef, WidgetState.Open);
          sut.widgets.w2.tabs.should.eql(["t3", "t2"]);
        });

        it("should add removed tab to existing panel widget", () => {
          let nineZone = createNineZoneState();
          nineZone = addPanelWidget(nineZone, "left", "w1", ["t1"]);
          nineZone = addPanelWidget(nineZone, "left", "w2", ["t2_1", "t2_2", "t2_3"]);
          nineZone = addPanelWidget(nineZone, "left", "w3", ["t3"]);
          nineZone = addTab(nineZone, "t1");
          nineZone = addTab(nineZone, "t2_1");
          nineZone = addTab(nineZone, "t2_2");
          nineZone = addTab(nineZone, "t2_3");
          nineZone = addTab(nineZone, "t3");
          const widgetDef = new WidgetDef({ id: "t4" });
          widgetDef.tabLocation = {
            ...widgetDef.tabLocation,
            widgetIndex: 1,
            tabIndex: 2,
          };
          const sut = setWidgetState(nineZone, widgetDef, WidgetState.Open);
          sut.widgets.w2.tabs.should.eql(["t2_1", "t2_2", "t4", "t2_3"]);
        });
      });

      describe("WidgetState.Closed", () => {
        it("should not minimize if tab is not active", () => {
          let nineZone = createNineZoneState();
          nineZone = addFloatingWidget(nineZone, "w1", ["t1", "t2"], undefined, { activeTabId: "t2" });
          nineZone = addTab(nineZone, "t1");
          nineZone = addTab(nineZone, "t2");
          const sut = setWidgetState(nineZone, new WidgetDef({ id: "t1" }), WidgetState.Closed);
          sut.should.eq(nineZone);
        });

        it("should minimize floating widget", () => {
          let nineZone = createNineZoneState();
          nineZone = addFloatingWidget(nineZone, "w1", ["t1"]);
          nineZone = addTab(nineZone, "t1");
          const sut = setWidgetState(nineZone, new WidgetDef({ id: "t1" }), WidgetState.Closed);
          sut.widgets.w1.minimized.should.true;
        });

        it("should minimize panel widget", () => {
          let nineZone = createNineZoneState();
          nineZone = addPanelWidget(nineZone, "left", "w1", ["t1"]);
          nineZone = addPanelWidget(nineZone, "left", "w2", ["t2"]);
          nineZone = addTab(nineZone, "t1");
          const sut = setWidgetState(nineZone, new WidgetDef({ id: "t1" }), WidgetState.Closed);
          sut.widgets.w1.minimized.should.true;
        });

        it("should not minimize single panel widget", () => {
          let nineZone = createNineZoneState();
          nineZone = addPanelWidget(nineZone, "left", "w1", ["t1"]);
          nineZone = addTab(nineZone, "t1");
          const sut = setWidgetState(nineZone, new WidgetDef({ id: "t1" }), WidgetState.Closed);
          sut.widgets.w1.minimized.should.false;
        });

        it("should add removed tab", () => {
          let nineZone = createNineZoneState();
          nineZone = addPanelWidget(nineZone, "left", "w1", ["t1"]);
          nineZone = addTab(nineZone, "t1");
          const sut = setWidgetState(nineZone, new WidgetDef({ id: "t2" }), WidgetState.Closed);
          sut.panels.left.widgets.length.should.eq(2);
        });
      });

      describe("WidgetState.Hidden", () => {
        it("should not update if tab is not found", () => {
          const nineZone = createNineZoneState();
          const sut = setWidgetState(nineZone, new WidgetDef({ id: "t1" }), WidgetState.Hidden);
          sut.should.eq(nineZone);
        });

        it("should hide the widget", () => {
          let nineZone = createNineZoneState();
          nineZone = addPanelWidget(nineZone, "left", "w1", ["t1", "t2"]);
          nineZone = addTab(nineZone, "t1");
          const sut = setWidgetState(nineZone, new WidgetDef({ id: "t1" }), WidgetState.Hidden);
          sut.widgets.w1.tabs.should.eql(["t2"]);
        });

        it("should use default panel side for a floating widget", () => {
          let nineZone = createNineZoneState();
          nineZone = addFloatingWidget(nineZone, "w1", ["t1"]);
          nineZone = addTab(nineZone, "t1");
          const widgetDef = new WidgetDef({ id: "t1" });
          setWidgetState(nineZone, widgetDef, WidgetState.Hidden);
          widgetDef.tabLocation.side.should.eq("left");
          widgetDef.tabLocation.widgetIndex.should.eq(0);
        });
      });

    });

    describe("showWidget ", () => {
      it("should not update if tab is not found", () => {
        const nineZone = createNineZoneState();
        const sut = showWidget(nineZone, "t1");
        sut.should.eq(nineZone);
      });

      it("should bring floating widget to front", () => {
        let nineZone = createNineZoneState();
        nineZone = addFloatingWidget(nineZone, "w1", ["t1"]);
        nineZone = addFloatingWidget(nineZone, "w2", ["t2"]);
        nineZone = addTab(nineZone, "t1");
        const sut = showWidget(nineZone, "t1");
        sut.floatingWidgets.allIds[0].should.eq("w2");
        sut.floatingWidgets.allIds[1].should.eq("w1");
      });
    });

    describe("expandWidget ", () => {
      it("should not update if tab is not found", () => {
        const nineZone = createNineZoneState();
        const sut = expandWidget(nineZone, "t1");
        sut.should.eq(nineZone);
      });

      it("should expand floating widget", () => {
        let nineZone = createNineZoneState();
        nineZone = addFloatingWidget(nineZone, "w1", ["t1"], undefined, { minimized: true });
        nineZone = addTab(nineZone, "t1");
        const sut = expandWidget(nineZone, "t1");
        sut.widgets.w1.minimized.should.false;
      });
    });

    describe("restoreNineZoneState", () => {
      it("should log info if widgetDef is not found", () => {
        const spy = sinon.spy(Logger, "logInfo");
        const frontstageDef = new FrontstageDef();
        const savedState = {
          ...createSavedNineZoneState(),
          tabs: {
            t1: createSavedTabState("t1"),
          },
        };
        restoreNineZoneState(frontstageDef, savedState);
        spy.calledOnce.should.true;
        spy.firstCall.args[2]!().should.matchSnapshot();
      });

      it("should remove tab from widgetState if widgetDef is not found", () => {
        const frontstageDef = new FrontstageDef();
        sinon.stub(frontstageDef, "findWidgetDef").withArgs("t2").returns(new WidgetDef({ id: "t2" }));
        let state = createNineZoneState();
        state = addPanelWidget(state, "left", "w1", ["t1", "t2"]);
        state = addTab(state, "t1", { label: "t1" });
        state = addTab(state, "t2", { label: "t2" });
        state = addTab(state, "t3", { label: "t3" });
        const savedState = {
          ...createSavedNineZoneState(state),
          tabs: {
            t1: createSavedTabState("t1"),
            t2: createSavedTabState("t2"),
            t3: createSavedTabState("t3", { preferredFloatingWidgetSize: { width: 444, height: 555 } }),
          },
        };
        const newState = restoreNineZoneState(frontstageDef, savedState);
        newState.widgets.w1.tabs.indexOf("t1").should.eq(-1);
        newState.widgets.w1.tabs.indexOf("t2").should.eq(0);
        newState.tabs.t3.preferredFloatingWidgetSize?.width.should.eq(444);
      });

      it("should restore tabs", () => {
        const frontstageDef = new FrontstageDef();
        const widgetDef = new WidgetDef({});
        sinon.stub(frontstageDef, "findWidgetDef").returns(widgetDef);
        const savedState = {
          ...createSavedNineZoneState(),
          tabs: {
            t1: createSavedTabState("t1"),
          },
        };
        const sut = restoreNineZoneState(frontstageDef, savedState);
        sut.should.matchSnapshot();
      });

      it("should RESIZE", () => {
        sinon.stub(FrontstageManager, "nineZoneSize").get(() => new Size(10, 20));
        const frontstageDef = new FrontstageDef();
        const savedState = {
          ...createSavedNineZoneState({
            size: {
              width: 1,
              height: 2,
            },
          }),
          tabs: {
            t1: createSavedTabState("t1"),
          },
        };

        const sut = restoreNineZoneState(frontstageDef, savedState);
        sut.size.should.eql({ width: 10, height: 20 });
      });

      it("should not RESIZE", () => {
        const frontstageDef = new FrontstageDef();
        const savedState = {
          ...createSavedNineZoneState({
            size: {
              width: 1,
              height: 2,
            },
          }),
          tabs: {
            t1: createSavedTabState("t1"),
          },
        };

        const sut = restoreNineZoneState(frontstageDef, savedState);
        sut.size.should.eql({ width: 1, height: 2 });
      });
    });

    describe("packNineZoneState", () => {
      it("should remove labels", () => {
        let nineZone = createNineZoneState();
        nineZone = addFloatingWidget(nineZone, "w1", ["t1"]);
        nineZone = addTab(nineZone, "t1");
        const sut = packNineZoneState(nineZone);
        sut.should.matchSnapshot();
      });
    });

    describe("useUpdateNineZoneSize", () => {
      it("should update size of nine zone state when new frontstage is activated", () => {
        const { rerender } = renderHook((props) => useUpdateNineZoneSize(props), { initialProps: new FrontstageDef() });

        const newFrontstageDef = new FrontstageDef();
        newFrontstageDef.nineZoneState = createNineZoneState();

        sinon.stub(FrontstageManager, "nineZoneSize").get(() => new Size(10, 20));
        rerender(newFrontstageDef);

        newFrontstageDef.nineZoneState.size.should.eql({ width: 10, height: 20 });
      });

      it("should not update size if FrontstageManager.nineZoneSize is not initialized", () => {
        const { rerender } = renderHook((props) => useUpdateNineZoneSize(props), { initialProps: new FrontstageDef() });

        const newFrontstageDef = new FrontstageDef();
        newFrontstageDef.nineZoneState = createNineZoneState({ size: { height: 1, width: 2 } });

        rerender(newFrontstageDef);

        newFrontstageDef.nineZoneState.size.should.eql({ height: 1, width: 2 });
      });
    });

    describe("addMissingWidgets", () => {
      it("should add centerLeft widgets", () => {
        const state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const zoneDef = new ZoneDef();
        const widgetDef = new WidgetDef({ id: "w1" });
        sinon.stub(zoneDef, "widgetDefs").get(() => [widgetDef]);
        sinon.stub(frontstageDef, "centerLeft").get(() => zoneDef);
        const newState = addMissingWidgets(frontstageDef, state);
        should().exist(newState.tabs.w1);
      });

      it("should add bottomLeft widgets", () => {
        let state = createNineZoneState();
        state = addTab(state, "t2");
        const frontstageDef = new FrontstageDef();
        const zoneDef = new ZoneDef();
        const widgetDef = new WidgetDef({ id: "t1" });
        const widgetDef2 = new WidgetDef({ id: "t2" });
        sinon.stub(zoneDef, "widgetDefs").get(() => [widgetDef, widgetDef2]);
        sinon.stub(frontstageDef, "bottomLeft").get(() => zoneDef);
        const newState = addMissingWidgets(frontstageDef, state);
        should().exist(newState.tabs.t1);
        should().exist(newState.tabs.t2);
      });

      it("should add centerRight widgets", () => {
        const state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const zoneDef = new ZoneDef();
        const widgetDef = new WidgetDef({ id: "w1" });
        sinon.stub(zoneDef, "widgetDefs").get(() => [widgetDef]);
        sinon.stub(frontstageDef, "centerRight").get(() => zoneDef);
        const newState = addMissingWidgets(frontstageDef, state);
        should().exist(newState.tabs.w1);
      });

      it("should add bottomRight widgets", () => {
        const state = createNineZoneState();
        const frontstageDef = new FrontstageDef();
        const zoneDef = new ZoneDef();
        const widgetDef = new WidgetDef({ id: "w1" });
        sinon.stub(zoneDef, "widgetDefs").get(() => [widgetDef]);
        sinon.stub(frontstageDef, "bottomRight").get(() => zoneDef);
        const newState = addMissingWidgets(frontstageDef, state);
        should().exist(newState.tabs.w1);
      });

      it("should add leftPanel widgets", () => {
        let state = createNineZoneState();
        state = addPanelWidget(state, "left", "start", ["start1"]);
        state = addPanelWidget(state, "left", "middle", ["middle1"]);
        state = addPanelWidget(state, "left", "end", ["end1"]);
        state = addTab(state, "start1");
        state = addTab(state, "middle1");
        state = addTab(state, "end1");
        const frontstageDef = new FrontstageDef();
        const panelDef = new StagePanelDef();
        panelDef.initializeFromProps({
          resizable: true,
          widgets: [
            <Widget
              key="w1"
              id="w1"
            />,
          ],
          panelZones: {
            start: {
              widgets: [
                <Widget
                  key="ws1"
                  id="ws1"
                />,
              ],
            },
            middle: {
              widgets: [
                <Widget
                  key="wm1"
                  id="wm1"
                />,
              ],
            },
            end: {
              widgets: [
                <Widget
                  key="we1"
                  id="we1"
                />,
              ],
            },
          },
        }, StagePanelLocation.Left);
        sinon.stub(frontstageDef, "leftPanel").get(() => panelDef);
        const newState = addMissingWidgets(frontstageDef, state);
        newState.widgets.start.tabs.should.eql(["start1", "ws1"]);
        newState.widgets.middle.tabs.should.eql(["middle1", "wm1"]);
        newState.widgets.end.tabs.should.eql(["end1", "w1", "we1"]);
      });

      it("should add rightPanel widgets", () => {
        let state = createNineZoneState();
        state = addPanelWidget(state, "right", "start", ["start1"]);
        state = addPanelWidget(state, "right", "middle", ["middle1"]);
        state = addPanelWidget(state, "right", "end", ["end1"]);
        state = addTab(state, "start1");
        state = addTab(state, "middle1");
        state = addTab(state, "end1");
        const frontstageDef = new FrontstageDef();
        const panelDef = new StagePanelDef();
        panelDef.initializeFromProps({
          resizable: true,
          widgets: [
            <Widget
              key="w1"
              id="w1"
            />,
          ],
          panelZones: {
            start: {
              widgets: [
                <Widget
                  key="ws1"
                  id="ws1"
                />,
              ],
            },
            middle: {
              widgets: [
                <Widget
                  key="wm1"
                  id="wm1"
                />,
              ],
            },
            end: {
              widgets: [
                <Widget
                  key="we1"
                  id="we1"
                />,
              ],
            },
          },
        }, StagePanelLocation.Right);
        sinon.stub(frontstageDef, "rightPanel").get(() => panelDef);
        const newState = addMissingWidgets(frontstageDef, state);
        newState.widgets.start.tabs.should.eql(["start1", "ws1"]);
        newState.widgets.middle.tabs.should.eql(["middle1", "wm1"]);
        newState.widgets.end.tabs.should.eql(["end1", "w1", "we1"]);
      });

      it("should add topPanel widgets", () => {
        let state = createNineZoneState();
        state = addPanelWidget(state, "top", "start", ["start1"]);
        state = addPanelWidget(state, "top", "end", ["end1"]);
        state = addTab(state, "start1");
        state = addTab(state, "end1");
        const frontstageDef = new FrontstageDef();
        const panelDef = new StagePanelDef();
        panelDef.initializeFromProps({
          resizable: true,
          widgets: [
            <Widget
              key="w1"
              id="w1"
            />,
          ],
          panelZones: {
            start: {
              widgets: [
                <Widget
                  key="ws1"
                  id="ws1"
                />,
              ],
            },
            end: {
              widgets: [
                <Widget
                  key="we1"
                  id="we1"
                />,
              ],
            },
          },
        }, StagePanelLocation.Top);
        const panelDef1 = new StagePanelDef();
        panelDef1.initializeFromProps({
          resizable: true,
          widgets: [
            <Widget
              key="w2"
              id="w2"
            />,
          ],
        }, StagePanelLocation.TopMost);
        sinon.stub(frontstageDef, "topPanel").get(() => panelDef);
        sinon.stub(frontstageDef, "topMostPanel").get(() => panelDef1);
        const newState = addMissingWidgets(frontstageDef, state);
        newState.widgets.start.tabs.should.eql(["start1", "w1", "ws1"]);
        newState.widgets.end.tabs.should.eql(["end1", "w2", "we1"]);
      });

      it("should add bottomPanel widgets", () => {
        let state = createNineZoneState();
        state = addPanelWidget(state, "bottom", "start", ["start1"]);
        state = addPanelWidget(state, "bottom", "end", ["end1"]);
        state = addTab(state, "start1");
        state = addTab(state, "end1");
        const frontstageDef = new FrontstageDef();
        const panelDef = new StagePanelDef();
        panelDef.initializeFromProps({
          resizable: true,
          widgets: [
            <Widget
              key="w1"
              id="w1"
            />,
          ],
          panelZones: {
            start: {
              widgets: [
                <Widget
                  key="ws1"
                  id="ws1"
                />,
              ],
            },
            end: {
              widgets: [
                <Widget
                  key="we1"
                  id="we1"
                />,
              ],
            },
          },
        }, StagePanelLocation.Bottom);
        const panelDef1 = new StagePanelDef();
        panelDef1.initializeFromProps({
          resizable: true,
          widgets: [
            <Widget
              key="w2"
              id="w2"
            />,
          ],
        }, StagePanelLocation.BottomMost);
        sinon.stub(frontstageDef, "bottomPanel").get(() => panelDef);
        sinon.stub(frontstageDef, "bottomMostPanel").get(() => panelDef1);
        const newState = addMissingWidgets(frontstageDef, state);
        newState.widgets.start.tabs.should.eql(["start1", "w1", "ws1"]);
        newState.widgets.end.tabs.should.eql(["end1", "w2", "we1"]);
      });
    });

    describe("dynamic widgets", () => {
      stubRaf();
      beforeEach(async () => {
        await TestUtils.initializeUiFramework();
        await NoRenderApp.startup();
      });

      afterEach(() => {
        UiItemsManager.unregister("TestUi2Provider");
        FrontstageManager.clearFrontstageDefs();
        FrontstageManager.setActiveFrontstageDef(undefined);
      });

      afterEach(() => {
        TestUtils.terminateUiFramework();
        IModelApp.shutdown();
      });

      it("should render pre-loaded extension widgets when state is initialized", async () => {
        UiItemsManager.register(new TestUi2Provider());

        const frontstageProvider = new TestFrontstageUi2();
        FrontstageManager.addFrontstageProvider(frontstageProvider);
        await FrontstageManager.setActiveFrontstageDef(frontstageProvider.frontstageDef);
        const { findByText } = render(<WidgetPanelsFrontstage />);
        await findByText("Left Start 1");
        await findByText("TestUi2Provider RM1");
        await findByText("TestUi2Provider W1");
      });

      it("should listen for window close event", async () => {
        UiItemsManager.register(new TestUi2Provider());
        const frontstageProvider = new TestFrontstageUi2();
        FrontstageManager.addFrontstageProvider(frontstageProvider);
        await FrontstageManager.setActiveFrontstageDef(frontstageProvider.frontstageDef);
        const spy = sinon.stub(frontstageProvider.frontstageDef!, "setIsApplicationClosing");
        const wrapper = render(<WidgetPanelsFrontstage />);
        spy.calledOnce.should.true;
        window.dispatchEvent(new Event("beforeunload"));
        spy.calledTwice.should.true;
        wrapper.unmount();
      });

      it("should render pre-loaded extension widgets when state is restored", async () => {
        UiItemsManager.register(new TestUi2Provider());

        const spy = sinon.spy(localStorageMock, "getItem");
        let state = createNineZoneState();
        state = addPanelWidget(state, "left", "leftStart", ["LeftStart1"]);
        state = addTab(state, "LeftStart1");
        const setting = createFrontstageState(state);

        const uiSettings = new UiSettingsStub();
        sinon.stub(uiSettings, "getSetting").resolves({
          status: UiSettingsStatus.Success,
          setting,
        });

        const frontstageProvider = new TestFrontstageUi2();
        FrontstageManager.addFrontstageProvider(frontstageProvider);
        await FrontstageManager.setActiveFrontstageDef(frontstageProvider.frontstageDef);
        const { findByText } = render(<WidgetPanelsFrontstage />, {
          wrapper: (props) => <UiSettingsProvider {...props} settingsStorage={uiSettings} />,
        });
        await findByText("Left Start 1");
        await findByText("TestUi2Provider RM1");
        await findByText("TestUi2Provider W1");

        sinon.assert.notCalled(spy);
      });

      it("should render loaded extension widgets", async () => {
        const frontstageProvider = new TestFrontstageUi2();
        FrontstageManager.addFrontstageProvider(frontstageProvider);
        await FrontstageManager.setActiveFrontstageDef(frontstageProvider.frontstageDef);
        const { findByText } = render(<WidgetPanelsFrontstage />);
        await findByText("Left Start 1");

        act(() => {
          UiItemsManager.register(new TestUi2Provider());
        });
        await findByText("TestUi2Provider RM1");
        await findByText("TestUi2Provider W1");
      });

      it("should stop rendering unloaded extension widgets", async () => {
        const frontstageProvider = new TestFrontstageUi2();
        FrontstageManager.addFrontstageProvider(frontstageProvider);
        await FrontstageManager.setActiveFrontstageDef(frontstageProvider.frontstageDef);
        const frontstageDef = FrontstageManager.activeFrontstageDef!;
        render(<WidgetPanelsFrontstage />);

        act(() => {
          UiItemsManager.register(new TestUi2Provider());
        });

        await TestUtils.flushAsyncOperations();
        should().exist(frontstageDef.nineZoneState!.tabs.LeftStart1, "LeftStart1");
        should().exist(frontstageDef.nineZoneState!.tabs.TestUi2ProviderRM1, "TestUi2ProviderRM1");
        should().exist(frontstageDef.nineZoneState!.tabs.TestUi2ProviderW1, "TestUi2ProviderW1");
        frontstageDef.nineZoneState!.widgets.rightMiddle.tabs.should.eql(["TestUi2ProviderRM1"], "rightMiddle widget tabs");
        frontstageDef.nineZoneState!.widgets.leftStart.tabs.should.eql(["LeftStart1", "TestUi2ProviderW1"], "leftStart widget tabs");

        act(() => {
          UiItemsManager.unregister("TestUi2Provider");
        });

        await TestUtils.flushAsyncOperations();
        should().exist(frontstageDef.nineZoneState!.tabs.LeftStart1, "LeftStart1 after unregister");
        // tabs should remain but no widget container should reference them
        should().exist(frontstageDef.nineZoneState!.tabs.TestUi2ProviderRM1, "TestUi2ProviderRM1 after unregister");
        should().exist(frontstageDef.nineZoneState!.tabs.TestUi2ProviderW1, "TestUi2ProviderW1 after unregister");
        should().not.exist(frontstageDef.nineZoneState!.widgets.rightMiddle, "rightMiddle widget");
        frontstageDef.nineZoneState!.widgets.leftStart.tabs.should.eql(["LeftStart1"], "leftStart widget tabs");
      });

      it("should render from 1.0 definition", async () => {
        const frontstageProvider = new TestFrontstageUi1();
        FrontstageManager.addFrontstageProvider(frontstageProvider);
        await FrontstageManager.setActiveFrontstageDef(frontstageProvider.frontstageDef);
        const frontstageDef = FrontstageManager.activeFrontstageDef!;
        render(<WidgetPanelsFrontstage />);

        await TestUtils.flushAsyncOperations();
        const state = frontstageDef.nineZoneState!;

        state.panels.left.widgets.should.eql(["leftStart", "leftMiddle", "leftEnd"]);
        state.panels.right.widgets.should.eql(["rightStart", "rightMiddle", "rightEnd"]);
        state.panels.top.widgets.should.eql(["topStart", "topEnd"]);
        state.panels.bottom.widgets.should.eql(["bottomStart", "bottomEnd"]);

        state.widgets.leftStart.tabs.should.eql(["CenterLeft1", "LeftStart1"]);
        state.widgets.leftMiddle.tabs.should.eql(["BottomLeft1", "LeftMiddle1"]);
        state.widgets.leftEnd.tabs.should.eql(["Left1", "LeftEnd1"]);

        state.widgets.rightStart.tabs.should.eql(["CenterRight1", "RightStart1"]);
        state.widgets.rightMiddle.tabs.should.eql(["BottomRight1", "RightMiddle1"]);
        state.widgets.rightEnd.tabs.should.eql(["Right1", "RightEnd1"]);

        state.widgets.topStart.tabs.should.eql(["Top1", "TopStart1"]);
        state.widgets.topEnd.tabs.should.eql(["TopMost1", "TopEnd1"]);

        state.widgets.bottomStart.tabs.should.eql(["Bottom1", "BottomStart1"]);
        state.widgets.bottomEnd.tabs.should.eql(["BottomMost1", "BottomEnd1"]);
      });
    });
  });

  it("should set nineZoneSize when WIDGET_TAB_POPOUT is received", () => {
    const frontstageDef = new FrontstageDef();
    const spy = sinon.stub(frontstageDef, "popoutWidget");

    frontstageDef.nineZoneState = createNineZoneState();
    const { result } = renderHook(() => useNineZoneDispatch(frontstageDef));
    result.current({
      type: "WIDGET_TAB_POPOUT",
      id: "t1",
    });
    spy.calledOnceWithExactly("t1");
  });
});
