/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as sinon from "sinon";

import * as React from "react";
import { fireEvent, render } from "@testing-library/react";
import { IModelApp, MockRender, QuantityType, QuantityTypeKey, UnitSystemKey } from "@bentley/imodeljs-frontend";
import TestUtils, { getButtonWithText, handleError, selectChangeValueByText, stubScrollIntoView } from "../TestUtils";
// import { getQuantityFormatsSettingsManagerEntry, ModalDialogRenderer} from "../../ui-framework";
import { Presentation, PresentationManager } from "@bentley/presentation-frontend";
import { PresentationUnitSystem } from "@bentley/presentation-common";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import { mockPresentationManager } from "@bentley/presentation-components/lib/test/_helpers/UiComponents";
import { getQuantityFormatsSettingsManagerEntry } from "../../ui-framework/settings/quantityformatting/QuantityFormat";
import { ModalDialogRenderer } from "../../ui-framework/dialog/ModalDialogManager";
import { FormatProps } from "@bentley/imodeljs-quantity";
import { UiFramework } from "../../ui-framework/UiFramework";

describe("QuantityFormatSettingsPage", () => {

  let presentationManagerMock: moq.IMock<PresentationManager>;
  const sandbox = sinon.createSandbox();

  before(async () => {
    await TestUtils.initializeUiFramework();
    await MockRender.App.startup();
  });

  after(async () => {
    TestUtils.terminateUiFramework();
    await MockRender.App.shutdown();
    Presentation.terminate();
  });

  beforeEach(async () => {
    await IModelApp.quantityFormatter.reinitializeFormatAndParsingsMaps(new Map<UnitSystemKey, Map<QuantityTypeKey, FormatProps>>(), "imperial");
    presentationManagerMock = mockPresentationManager().presentationManager;
    presentationManagerMock.setup((x) => x.activeUnitSystem).returns(() => PresentationUnitSystem.BritishImperial);
    Presentation.setPresentationManager(presentationManagerMock.object);
  });

  afterEach(() => {
    sandbox.restore();
  });

  stubScrollIntoView();

  it("will handle internal unit system change", async () => {
    const settingsEntry = getQuantityFormatsSettingsManagerEntry(10);
    expect(settingsEntry.itemPriority).to.eql(10);

    const unitSystemSpy = sandbox.spy();

    // setup fake setter in the mocked object
    sandbox.stub(Presentation.presentation, "activeUnitSystem").set(unitSystemSpy);

    const wrapper = render(settingsEntry.page);

    const selectButton = wrapper.getByTestId("unitSystemSelector");

    // initial unit system value should be imperial so no change expected for initial change.
    // fireEvent.change(selectButton, { target: { value: "imperial" } });
    selectChangeValueByText(selectButton, "presentationUnitSystem.BritishImperial", handleError);
    expect(unitSystemSpy.calledOnce).to.be.false;

    // fireEvent.change(selectButton, { target: { value: "metric" } });
    selectChangeValueByText(selectButton, "presentationUnitSystem.Metric", handleError);
    expect(unitSystemSpy.calledOnce).to.be.true;
    unitSystemSpy.resetHistory();
    await TestUtils.flushAsyncOperations();

    // fireEvent.change(selectButton, { target: { value: "usCustomary" } });
    selectChangeValueByText(selectButton, "presentationUnitSystem.USCustomary", handleError);
    expect(unitSystemSpy.calledOnce).to.be.true;
    unitSystemSpy.resetHistory();
    await TestUtils.flushAsyncOperations();

    // fireEvent.change(selectButton, { target: { value: "usSurvey" } });
    selectChangeValueByText(selectButton, "presentationUnitSystem.USSurvey", handleError);
    expect(unitSystemSpy.calledOnce).to.be.true;
    unitSystemSpy.resetHistory();
    await TestUtils.flushAsyncOperations();

    // fireEvent.change(selectButton, { target: { value: "imperial" } });
    selectChangeValueByText(selectButton, "presentationUnitSystem.BritishImperial", handleError);
    expect(unitSystemSpy.calledOnce).to.be.true;
    await TestUtils.flushAsyncOperations();

    wrapper.unmount();
  });

  it("will listen for external unit system changes", async () => {
    const settingsEntry = getQuantityFormatsSettingsManagerEntry(10, { initialQuantityType: QuantityType.Length });
    expect(settingsEntry.itemPriority).to.eql(10);

    const unitSystemSpy = sandbox.spy();

    // setup fake setter in the mocked object
    sandbox.stub(Presentation.presentation, "activeUnitSystem").set(unitSystemSpy);

    const wrapper = render(settingsEntry.page);
    await IModelApp.quantityFormatter.setActiveUnitSystem("metric", false);
    await TestUtils.flushAsyncOperations();

    const exampleFormat = wrapper.getByTestId("format-sample-formatted");
    expect(exampleFormat.textContent).to.eql("1234.56 m");

    wrapper.unmount();
  });

  it("will render 3 units and process quantity type selection in list", async () => {
    await IModelApp.quantityFormatter.setActiveUnitSystem("imperial", false);

    const availableUnitSystems = new Set<UnitSystemKey>(["metric", "imperial", "usSurvey"]);
    const settingsEntry = getQuantityFormatsSettingsManagerEntry(10, { initialQuantityType: QuantityType.LengthEngineering, availableUnitSystems });
    expect(settingsEntry.itemPriority).to.eql(10);

    const wrapper = render(settingsEntry.page);
    await TestUtils.flushAsyncOperations();

    const listSelector = `ul.uifw-quantity-types`;
    const categoryList = wrapper.container.querySelector(listSelector);
    expect(categoryList!.getAttribute("data-value")).to.eql("QuantityTypeEnumValue-9");

    const dataValueSelector = `li[data-value='QuantityTypeEnumValue-7']`;
    const categoryEntry = wrapper.container.querySelector(dataValueSelector);
    expect(categoryEntry).not.to.be.null;
    fireEvent.click(categoryEntry!);
    await TestUtils.flushAsyncOperations();
    expect(categoryList!.getAttribute("data-value")).to.eql("QuantityTypeEnumValue-7");

    wrapper.unmount();
  });

  it("save prop changes", async () => {
    const availableUnitSystems = new Set<UnitSystemKey>(["metric", "imperial", "usSurvey"]);
    const settingsEntry = getQuantityFormatsSettingsManagerEntry(10, { initialQuantityType: QuantityType.LengthEngineering, availableUnitSystems });
    expect(settingsEntry.itemPriority).to.eql(10);

    const wrapper = render(<div>
      <ModalDialogRenderer />
      {settingsEntry.page}
    </div>);

    const setButton = getButtonWithText(wrapper.container, "settings.quantity-formatting.setButtonLabel", handleError);
    expect(setButton!.hasAttribute("disabled")).to.be.true;
    const clearButton = getButtonWithText(wrapper.container, "settings.quantity-formatting.clearButtonLabel", handleError);
    expect(clearButton!.hasAttribute("disabled")).to.be.true;

    const checkbox = wrapper.getByTestId("show-unit-label-checkbox");
    fireEvent.click(checkbox);
    await TestUtils.flushAsyncOperations();

    expect(setButton!.hasAttribute("disabled")).to.be.false;
    fireEvent.click(setButton!);
    await TestUtils.flushAsyncOperations();
    expect(setButton!.hasAttribute("disabled")).to.be.true;
    expect(clearButton!.hasAttribute("disabled")).to.be.false;
    fireEvent.click(clearButton!);
    await TestUtils.flushAsyncOperations();
    expect(clearButton!.hasAttribute("disabled")).to.be.true;

    wrapper.unmount();
  });

  it("will trigger modal and save prop changes", async () => {
    const availableUnitSystems = new Set<UnitSystemKey>(["metric", "imperial", "usSurvey"]);
    const settingsEntry = getQuantityFormatsSettingsManagerEntry(10, { initialQuantityType: QuantityType.LengthEngineering, availableUnitSystems });
    expect(settingsEntry.itemPriority).to.eql(10);

    const wrapper = render(<div>
      <ModalDialogRenderer />
      {settingsEntry.page}
    </div>);

    const setButton = getButtonWithText(wrapper.container, "settings.quantity-formatting.setButtonLabel", handleError);
    expect(setButton!.hasAttribute("disabled")).to.be.true;
    const clearButton = getButtonWithText(wrapper.container, "settings.quantity-formatting.clearButtonLabel", handleError);
    expect(clearButton!.hasAttribute("disabled")).to.be.true;

    const checkbox = wrapper.getByTestId("show-unit-label-checkbox");
    fireEvent.click(checkbox);
    await TestUtils.flushAsyncOperations();

    expect(setButton!.hasAttribute("disabled")).to.be.false;

    const dataValueSelector = `li[data-value='QuantityTypeEnumValue-7']`;
    const categoryEntry = wrapper.container.querySelector(dataValueSelector);
    expect(categoryEntry).not.to.be.null;
    fireEvent.click(categoryEntry!);
    await TestUtils.flushAsyncOperations();

    const yesButton = wrapper.container.querySelector("button.dialog-button-yes");
    fireEvent.click(yesButton!);
    await TestUtils.flushAsyncOperations();
    wrapper.unmount();
  });

  it("will trigger modal and don't save prop changes", async () => {
    const availableUnitSystems = new Set<UnitSystemKey>(["metric", "imperial", "usSurvey"]);
    const settingsEntry = getQuantityFormatsSettingsManagerEntry(10, { initialQuantityType: QuantityType.LengthEngineering, availableUnitSystems });
    expect(settingsEntry.itemPriority).to.eql(10);

    const wrapper = render(<div>
      <ModalDialogRenderer />
      {settingsEntry.page}
    </div>);

    const setButton = getButtonWithText(wrapper.container, "settings.quantity-formatting.setButtonLabel", handleError);
    expect(setButton!.hasAttribute("disabled")).to.be.true;
    const clearButton = getButtonWithText(wrapper.container, "settings.quantity-formatting.clearButtonLabel", handleError);
    expect(clearButton!.hasAttribute("disabled")).to.be.true;
    await TestUtils.flushAsyncOperations();

    const checkbox = wrapper.getByTestId("show-unit-label-checkbox");
    fireEvent.click(checkbox);
    await TestUtils.flushAsyncOperations();

    expect(setButton!.hasAttribute("disabled")).to.be.false;

    const dataValueSelector = `li[data-value='QuantityTypeEnumValue-7']`;
    const categoryEntry = wrapper.container.querySelector(dataValueSelector);
    expect(categoryEntry).not.to.be.null;
    fireEvent.click(categoryEntry!);
    await TestUtils.flushAsyncOperations();

    const noButton = wrapper.container.querySelector("button.dialog-button-no");
    fireEvent.click(noButton!);
    await TestUtils.flushAsyncOperations();

    wrapper.unmount();
  });

  it("will trigger modal by event from settings manager and don't save prop changes", async () => {
    const availableUnitSystems = new Set<UnitSystemKey>(["metric", "imperial", "usSurvey"]);
    const settingsEntry = getQuantityFormatsSettingsManagerEntry(10, { initialQuantityType: QuantityType.LengthEngineering, availableUnitSystems });
    expect(settingsEntry.itemPriority).to.eql(10);

    const wrapper = render(<div>
      <ModalDialogRenderer />
      {settingsEntry.page}
    </div>);

    const setButton = getButtonWithText(wrapper.container, "settings.quantity-formatting.setButtonLabel", handleError);
    expect(setButton!.hasAttribute("disabled")).to.be.true;
    const clearButton = getButtonWithText(wrapper.container, "settings.quantity-formatting.clearButtonLabel", handleError);
    expect(clearButton!.hasAttribute("disabled")).to.be.true;
    await TestUtils.flushAsyncOperations();

    const checkbox = wrapper.getByTestId("show-unit-label-checkbox");
    fireEvent.click(checkbox);
    await TestUtils.flushAsyncOperations();

    expect(setButton!.hasAttribute("disabled")).to.be.false;

    UiFramework.settingsManager.onProcessSettingsTabActivation.emit({ requestedSettingsTabId: "unknown", tabSelectionFunc: () => { } });
    await TestUtils.flushAsyncOperations();

    const noButton = wrapper.container.querySelector("button.dialog-button-no");
    fireEvent.click(noButton!);
    await TestUtils.flushAsyncOperations();

    wrapper.unmount();
  });

});
