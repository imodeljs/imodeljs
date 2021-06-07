/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { DisplayStyle3dState, IModelConnection, MockRender, ScreenViewport, ViewState3d } from "@bentley/imodeljs-frontend";
import { assert, expect } from "chai";
import * as enzyme from "enzyme";
import * as React from "react";
import * as sinon from "sinon";
import { TestUtils } from "./TestUtils";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import {
  BackgroundMapSettings, DisplayStyle3dSettings, PlanarClipMaskMode,
  PlanarClipMaskPriority, TerrainHeightOriginMode, TerrainSettings,
} from "@bentley/imodeljs-common";
import { MapManagerSettings } from "../ui/widget/MapManagerSettings";
import { SourceMapContext } from "../ui/widget/MapLayerManager";
import { NumberInput, Select, Toggle } from "@bentley/ui-core";
import { SpecialKey } from "@bentley/ui-abstract";

describe("MapManagerSettings", () => {
  const viewportMock = moq.Mock.ofType<ScreenViewport>();
  const viewMock = moq.Mock.ofType<ViewState3d>();
  const displayStyleMock = moq.Mock.ofType<DisplayStyle3dState>();
  const imodelMock = moq.Mock.ofType<IModelConnection>();
  const displayStyleSettingsMock = moq.Mock.ofType<DisplayStyle3dSettings>();
  const backgroundMapSettingsMock = moq.Mock.ofType<BackgroundMapSettings>();
  const terrainSettingsMock = moq.Mock.ofType<TerrainSettings>();

  // Utility methods that give the index of components rendered by
  // MapManagerSettings.
  // Any re-ordering inside the component render will invalidate
  // this and will need to be revisited.
  const getToggleIndex = (toggleName: string) => {
    switch (toggleName) {
      case "locatable": return 0;
      case "mask": return 1;
      case "depthBuffer": return 2;
      case "terrain": return 3;
    }
    assert.fail("invalid name provided.");
    return 0;
  };

  const getNumericInputIndex = (name: string) => {
    switch (name) {
      case "groundBias": return 0;
      case "terrainOrigin": return 1;
      case "exaggeration": return 2;
    }
    assert.fail("invalid name provided.");
    return 0;
  };

  const changeNumericInputValue = (component: any, value: number) => {
    // For some reasons could not get 'simulate' and 'change' to work here, so calling directly the onChange prop instead.
    component.find("input").props().onChange!({ currentTarget: { value } } as any);

    // Handler is not triggered until there is a key press
    component.find("input").simulate("keydown", { key: SpecialKey.Enter });
    component.update();
  };

  before(async () => {
    await TestUtils.initialize();
    await MockRender.App.startup({});
  });

  after(async () => {
    await MockRender.App.shutdown();
    TestUtils.terminateUiComponents();
  });

  beforeEach(() => {
    terrainSettingsMock.reset();
    terrainSettingsMock.setup((ts) => ts.heightOriginMode).returns(() => TerrainHeightOriginMode.Geodetic);
    terrainSettingsMock.setup((ts) => ts.heightOrigin).returns(() => 0);
    terrainSettingsMock.setup((ts) => ts.exaggeration).returns(() => 0);
    backgroundMapSettingsMock.reset();
    backgroundMapSettingsMock.setup((bgMapSettings) => bgMapSettings.groundBias).returns(() => 0);
    backgroundMapSettingsMock.setup((bgMapSettings) => bgMapSettings.transparency).returns(() => 0);
    backgroundMapSettingsMock.setup((bgMapSettings) => bgMapSettings.applyTerrain).returns(() => false);
    backgroundMapSettingsMock.setup((bgMapSettings) => bgMapSettings.terrainSettings).returns(() => terrainSettingsMock.object);
    backgroundMapSettingsMock.setup((bgMapSettings) => bgMapSettings.useDepthBuffer).returns(() => false);
    backgroundMapSettingsMock.setup((bgMapSettings) => bgMapSettings.useDepthBuffer).returns(() => true);
    displayStyleSettingsMock.reset();
    displayStyleSettingsMock.setup((styleSettings) => styleSettings.backgroundMap).returns(() => backgroundMapSettingsMock.object);
    displayStyleMock.reset();
    displayStyleMock.setup((ds) => ds.attachMapLayerSettings(moq.It.isAny(), moq.It.isAny(), moq.It.isAny()));
    displayStyleMock.setup((style) => style.attachMapLayerSettings(moq.It.isAny(), moq.It.isAny(), moq.It.isAny()));
    displayStyleMock.setup((style) => style.settings).returns(() => displayStyleSettingsMock.object);
    viewMock.reset();
    viewMock.setup((view) => view.iModel).returns(() => imodelMock.object);
    viewMock.setup((x) => x.getDisplayStyle3d()).returns(() => displayStyleMock.object);

    viewportMock.reset();
    viewportMock.setup((viewport) => viewport.view).returns(() => viewMock.object);
    viewportMock.setup((viewport) => viewport.changeBackgroundMapProps(moq.It.isAny()));
    viewportMock.setup((viewport) => viewport.invalidateRenderPlan());
  });
  const refreshFromStyle = sinon.spy();

  const mountComponent = () => {
    return enzyme.mount(
      <SourceMapContext.Provider value={{
        activeViewport: viewportMock.object,
        loadingSources: false,
        sources: [],
        bases: [],
        refreshFromStyle,
      }}>
        <MapManagerSettings />
      </SourceMapContext.Provider>);
  };

  it("renders", () => {
    const wrapper = mountComponent();
    wrapper.unmount();
  });

  it("Terrain toggle", () => {
    const component = mountComponent();

    const numericInputs = component.find(NumberInput);
    // Make sure groundBias is NOT disabled
    // Note: Ideally I would use a CSS selector instead of searching html, but could not find any that would work.
    expect(numericInputs.at(0).find("input").html().includes('disabled=""')).to.be.false;

    // terrainOrigin and exaggeration be disabled initially
    expect(numericInputs.at(1).find("input").html().includes('disabled=""')).to.be.true;
    expect(numericInputs.at(2).find("input").html().includes('disabled=""')).to.be.true;

    // Make sure the 'useDepthBuffer' toggle is NOT disabled
    let toggles = component.find(Toggle);

    // Elevation type should be disabled initially
    expect(component.find("select").at(0).html().includes('disabled=""')).to.be.true;

    expect(toggles.at(getToggleIndex("depthBuffer")).find(".uicore-disabled").exists()).to.be.false;

    // 'changeBackgroundMapProps' should not have been called before terrain is toggled
    viewportMock.verify((x) => x.changeBackgroundMapProps(moq.It.isAny()), moq.Times.never());

    // Toggle 'enable' terrain
    const input = toggles.at(getToggleIndex("terrain")).find("input");
    input.simulate("change", { checked: true });
    component.update();

    // 'changeBackgroundMapProps' should have been called once now
    viewportMock.verify((x) => x.changeBackgroundMapProps(moq.It.isAny()), moq.Times.once());

    // 'useDepthBuffer' toggle should now be disabled
    toggles = component.find(Toggle);
    expect(toggles.at(getToggleIndex("depthBuffer")).find(".uicore-disabled").exists()).to.be.true;

    // Make sure groundBias is now disabled
    expect(numericInputs.at(0).find("input").html().includes('disabled=""')).to.be.true;

    // terrainOrigin and exaggeration should be enable after terrain was toggled
    expect(numericInputs.at(1).find("input").html().includes('disabled=""')).to.be.false;
    expect(numericInputs.at(2).find("input").html().includes('disabled=""')).to.be.false;

    // Elevation type should be enabled
    expect(component.find("select").at(0).html().includes('disabled=""')).to.be.false;
    component.unmount();
  });

  it("Transparency slider", () => {
    viewportMock.verify((x) => x.changeBackgroundMapProps(moq.It.isAny()), moq.Times.never());
    const component = mountComponent();
    component.find(".core-slider-handle").simulate("keydown", { key: SpecialKey.ArrowUp });
    viewportMock.verify((x) => x.changeBackgroundMapProps({ transparency: 0.01 }), moq.Times.once());
    component.unmount();
  });

  it("Locatable toggle", () => {
    const component = mountComponent();
    const toggles = component.find(Toggle);

    viewportMock.verify((x) => x.changeBackgroundMapProps(moq.It.isAny()), moq.Times.never());
    toggles.at(getToggleIndex("locatable")).find("input").simulate("change", { checked: true });
    component.update();

    // 'changeBackgroundMapProps' should have been called once now
    viewportMock.verify((x) => x.changeBackgroundMapProps({ nonLocatable: true }), moq.Times.once());
    component.unmount();
  });

  it("Mask toggle", () => {

    const component = mountComponent();

    const toggles = component.find(Toggle);

    viewportMock.verify((x) => x.changeBackgroundMapProps(moq.It.isAny()), moq.Times.never());

    toggles.at(getToggleIndex("mask")).find("input").simulate("change", { checked: true });
    component.update();

    // 'changeBackgroundMapProps' should have been called once now
    viewportMock.verify((x) => x.changeBackgroundMapProps({ planarClipMask: { mode: PlanarClipMaskMode.Priority, priority: PlanarClipMaskPriority.BackgroundMap } }), moq.Times.once());

    toggles.at(getToggleIndex("mask")).find("input").simulate("change", { checked: true });
    component.update();

    viewportMock.verify((x) => x.changeBackgroundMapProps({ planarClipMask: { mode: PlanarClipMaskMode.None } }), moq.Times.once());
    component.unmount();
  });

  it("ground bias", () => {
    const component = mountComponent();
    const numericInputs = component.find(NumberInput);

    viewportMock.verify((x) => x.changeBackgroundMapProps(moq.It.isAny()), moq.Times.never());
    changeNumericInputValue(numericInputs.at(getNumericInputIndex("groundBias")), 1);
    viewportMock.verify((x) => x.changeBackgroundMapProps({ groundBias: 1 }), moq.Times.once());
    component.unmount();
  });

  it("terrainOrigin", () => {
    const component = mountComponent();
    const numericInputs = component.find(NumberInput);
    viewportMock.verify((x) => x.changeBackgroundMapProps(moq.It.isAny()), moq.Times.never());

    // turn on the 'terrain' toggle then change the input value
    const toggles = component.find(Toggle);
    toggles.at(getToggleIndex("terrain")).find("input").simulate("change", { checked: true });
    changeNumericInputValue(numericInputs.at(getNumericInputIndex("terrainOrigin")), 1);

    viewportMock.verify((x) => x.changeBackgroundMapProps({ terrainSettings: { heightOrigin: 1 } }), moq.Times.once());
    component.unmount();
  });

  it("exaggeration", () => {
    const component = mountComponent();
    const numericInputs = component.find(NumberInput);

    viewportMock.verify((x) => x.changeBackgroundMapProps(moq.It.isAny()), moq.Times.never());

    // turn ON the 'terrain' toggle then change the input value
    const toggles = component.find(Toggle);
    toggles.at(getToggleIndex("terrain")).find("input").simulate("change", { checked: true });
    changeNumericInputValue(numericInputs.at(getNumericInputIndex("exaggeration")), 1);

    viewportMock.verify((x) => x.changeBackgroundMapProps({ terrainSettings: { exaggeration: 1 } }), moq.Times.once());
    component.unmount();
  });

  it("heightOriginMode geoid", () => {
    const component = mountComponent();

    viewportMock.verify((x) => x.changeBackgroundMapProps(moq.It.isAny()), moq.Times.never());

    // turn ON the 'terrain' toggle then change the combo box value
    const toggles = component.find(Toggle);
    toggles.at(getToggleIndex("terrain")).find("input").simulate("change", { checked: true });

    const select = component.find(Select);
    select.props().onChange!({ target: { value: "geoid" } } as any);
    viewportMock.verify((x) => x.changeBackgroundMapProps({ terrainSettings: { heightOriginMode: TerrainHeightOriginMode.Geoid } }), moq.Times.once());
    component.unmount();
  });

  it("heightOriginMode geodetic", () => {
    const component = mountComponent();

    viewportMock.verify((x) => x.changeBackgroundMapProps(moq.It.isAny()), moq.Times.never());

    // turn ON the 'terrain' toggle then change the combo box value
    const toggles = component.find(Toggle);
    toggles.at(getToggleIndex("terrain")).find("input").simulate("change", { checked: true });

    const select = component.find(Select);
    select.props().onChange!({ target: { value: "geodetic" } } as any);
    viewportMock.verify((x) => x.changeBackgroundMapProps({ terrainSettings: { heightOriginMode: TerrainHeightOriginMode.Geodetic } }), moq.Times.once());
    component.unmount();
  });

  it("heightOriginMode ground", () => {
    const component = mountComponent();

    viewportMock.verify((x) => x.changeBackgroundMapProps(moq.It.isAny()), moq.Times.never());

    // turn ON the 'terrain' toggle then change the combo box value
    const toggles = component.find(Toggle);
    toggles.at(getToggleIndex("terrain")).find("input").simulate("change", { checked: true });

    const select = component.find(Select);
    select.props().onChange!({ target: { value: "ground" } } as any);
    viewportMock.verify((x) => x.changeBackgroundMapProps({ terrainSettings: { heightOriginMode: TerrainHeightOriginMode.Ground } }), moq.Times.once());
    component.unmount();
  });
});
