/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { DisplayStyle3dState, IModelApp, IModelConnection, MapLayerSource, MapLayerSourceStatus, MockRender, NotifyMessageDetails, OutputMessagePriority, ScreenViewport, ViewState3d } from "@bentley/imodeljs-frontend";
import { assert, expect } from "chai";
import * as enzyme from "enzyme";
import * as React from "react";
import * as sinon from "sinon";
import { MapUrlDialog } from "../ui/widget/MapUrlDialog";
import { TestUtils } from "./TestUtils";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import { MapLayerSettings, MapSubLayerProps } from "@bentley/imodeljs-common";

describe("MapUrlDialog", () => {
  const sandbox = sinon.createSandbox();
  const viewportMock = moq.Mock.ofType<ScreenViewport>();
  const viewMock = moq.Mock.ofType<ViewState3d>();
  const displayStyleMock = moq.Mock.ofType<DisplayStyle3dState>();
  const imodelMock = moq.Mock.ofType<IModelConnection>();

  const sampleWmsSubLayers: MapSubLayerProps[] = [{name: "subLayer1"}, {name: "subLayer1"}];
  const sampleWmsLayerSettings = MapLayerSettings.fromJSON({
    formatId: "WMS",
    name: "Test Map",
    visible: true,
    transparentBackground: true,
    isBase: false,
    subLayers: sampleWmsSubLayers,
    accessKey: undefined,
    transparency: 0,
    url: "https://server/wms",
  });
  sampleWmsLayerSettings?.setCredentials("testUser", "TestPassword");

  before(async () => {
    await TestUtils.initialize();

    await MockRender.App.startup({});
  });

  after(async () => {
    await MockRender.App.shutdown();
    TestUtils.terminateUiComponents();
  });

  afterEach(() => {
    sandbox.restore();
  });

  beforeEach(() => {
    displayStyleMock.reset();
    displayStyleMock.setup((ds) => ds.attachMapLayerSettings( moq.It.isAny(),  moq.It.isAny(),  moq.It.isAny()) );
    viewMock.reset();
    viewMock.setup((view) => view.iModel).returns(() => imodelMock.object);
    viewportMock.reset();
    viewportMock.setup((viewport) => viewport.view).returns(() => viewMock.object);
    viewportMock.setup((viewport) => viewport.displayStyle).returns(() => displayStyleMock.object);
  });

  const mockModalUrlDialogOk = () => {
  };

  it("renders",  () => {
    const wrapper = enzyme.mount(<MapUrlDialog activeViewport={viewportMock.object} isOverlay={false} onOkResult={mockModalUrlDialogOk} />);
    wrapper.unmount();
  });

  it("attach a valid WMS layer (with sublayers) to display style", async () => {

    const spyMessage = sandbox.spy(IModelApp.notifications, "outputMessage");

    sandbox.stub(MapLayerSource.prototype, "validateSource").callsFake(async function (_ignoreCache?: boolean) {
      return Promise.resolve({ status: MapLayerSourceStatus.Valid, subLayers:sampleWmsSubLayers });
    });

    const component = enzyme.mount(<MapUrlDialog isOverlay={false}  activeViewport={viewportMock.object} onOkResult={mockModalUrlDialogOk} />);
    const layerTypeSelect = component.find("select");
    await (layerTypeSelect.props()as any).onChange({ preventDefault: () => {}, target: { value: "WMS"  }} as any);

    const allInputs = component.find("input");
    expect(allInputs.length).to.equals(4);
    allInputs.at(0).simulate("change", {target: { value: sampleWmsLayerSettings?.name} });
    allInputs.at(1).simulate("change", {target: { value: sampleWmsLayerSettings?.url } });
    allInputs.at(2).simulate("change", {target: { value: sampleWmsLayerSettings?.userName } });
    allInputs.at(3).simulate("change", {target: { value: sampleWmsLayerSettings?.password } });

    const allButtons = component.find("button");
    expect(allButtons.length).to.equals(3);
    allButtons.at(1).simulate("click");

    await TestUtils.flushAsyncOperations();

    if(!sampleWmsLayerSettings)
      assert.fail("Invalid layer  settings");
    displayStyleMock.verify((x) => x.attachMapLayerSettings(sampleWmsLayerSettings, false, undefined), moq.Times.once());

    spyMessage.calledWithExactly(new NotifyMessageDetails(OutputMessagePriority.Info, "Messages.MapLayerAttached"));

    component.unmount();
  });

  it("attempt to attach a WMS layer requiring credentials", async () => {

    sandbox.stub(IModelApp.notifications, "outputMessage");

    const validateSourceStub = sandbox.stub(MapLayerSource.prototype, "validateSource").callsFake(async function (_ignoreCache?: boolean) {
      return Promise.resolve({ status: MapLayerSourceStatus.RequireAuth });
    });

    const component = enzyme.mount(<MapUrlDialog
      isOverlay={false}
      activeViewport={viewportMock.object}
      mapTypesOptions= {{supportTileUrl: false, supportWmsAuthentication:true}}
      onOkResult={mockModalUrlDialogOk} />);
    const layerTypeSelect = component.find("select");
    await (layerTypeSelect.props()as any).onChange({ preventDefault: () => {}, target: { value: "WMS"  }} as any);
    await TestUtils.flushAsyncOperations();

    let allInputs = component.find("input");
    expect(allInputs.length).to.equals(4);
    allInputs.at(0).simulate("change", {target: { value: sampleWmsLayerSettings?.name} });
    allInputs.at(1).simulate("change", {target: { value: sampleWmsLayerSettings?.url } });

    let allButtons = component.find("button");
    expect(allButtons.length).to.equals(3);

    // Click the OK button
    allButtons.at(1).simulate("click");
    await TestUtils.flushAsyncOperations();
    let warnMessage= component.find("div.map-layer-source-warnMessage");
    expect(warnMessage.html().includes("CustomAttach.MissingCredentials")).to.be.true;

    // Make validateSource returns validateSource returns InvalidCredentials now
    validateSourceStub.restore();
    sandbox.stub(MapLayerSource.prototype, "validateSource").callsFake(async function (_ignoreCache?: boolean) {
      return Promise.resolve({ status: MapLayerSourceStatus.InvalidCredentials });
    });

    // Set username/password
    allInputs = component.find("input");
    expect(allInputs.length).to.equals(4);
    allInputs.at(2).simulate("change", {target: { value: sampleWmsLayerSettings?.userName } });
    allInputs.at(3).simulate("change", {target: { value: sampleWmsLayerSettings?.password } });

    // Click again the same button
    allButtons = component.find("button");
    expect(allButtons.length).to.equals(3);
    allButtons.at(1).simulate("click");
    await TestUtils.flushAsyncOperations();
    warnMessage = component.find("div.map-layer-source-warnMessage");
    expect(warnMessage.html().includes("CustomAttach.InvalidCredentials")).to.be.true;

    component.unmount();
  });

});
