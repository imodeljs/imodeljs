/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import { fireEvent, render } from "@testing-library/react";
import { getUiSettingsManagerEntry, UiSettingsPage } from "../../ui-framework/settings/ui/UiSettingsPage";
import TestUtils, { handleError, selectChangeValueByText, storageMock, stubScrollIntoView } from "../TestUtils";
import { UiFramework } from "../../ui-framework/UiFramework";
import { ColorTheme } from "../../ui-framework/theme/ThemeManager";

describe("UiSettingsPage", () => {
  const localStorageToRestore = Object.getOwnPropertyDescriptor(window, "localStorage")!;
  let localStorageMock = storageMock();

  beforeEach(async () => {
    // create a new mock each run so there are no "stored values"
    localStorageMock = storageMock();
    await TestUtils.initializeUiFramework();
    Object.defineProperty(window, "localStorage", {
      get: () => localStorageMock,
    });
  });

  afterEach(() => {
    TestUtils.terminateUiFramework();
    Object.defineProperty(window, "localStorage", localStorageToRestore);
  });

  stubScrollIntoView();

  function getInputBySpanTitle(titleSpan: HTMLElement) {
    const settingsItemDiv = titleSpan.parentElement?.parentElement;
    expect(settingsItemDiv).not.to.be.undefined;
    return settingsItemDiv!.querySelector("input");
  }

  it("renders using getUiSettingsManagerEntry (V1)", async () => {
    const tabEntry = getUiSettingsManagerEntry(10, false);
    const wrapper = render(tabEntry.page);
    expect(wrapper).not.to.be.undefined;
    expect(wrapper.container.querySelectorAll("span.title").length).to.eq(3);
    wrapper.unmount();
  });

  // function getSelectBySpanTitle(titleSpan: HTMLElement) {
  //   const settingsItemDiv = titleSpan.parentElement?.parentElement;
  //   expect(settingsItemDiv).not.to.be.undefined;
  //   return settingsItemDiv!.querySelector("select");
  // }

  it("renders without version option (V1) set theme", async () => {
    const wrapper = render(<UiSettingsPage allowSettingUiFrameworkVersion={false} />);
    expect(wrapper).not.to.be.undefined;

    // const themeSpan = wrapper.getByText("settings.uiSettingsPage.themeTitle");
    // const themeSelect = getSelectBySpanTitle(themeSpan);
    // expect(themeSelect).not.to.be.null;
    // await TestUtils.flushAsyncOperations();
    // fireEvent.change(themeSelect!, { target: { value: "dark" } });
    // await TestUtils.flushAsyncOperations();
    // expect(themeSelect!.value).to.be.eq("dark");
    // fireEvent.change(themeSelect!, { target: { value: "light" } });
    // await TestUtils.flushAsyncOperations();
    // expect(themeSelect!.value).to.be.eq("light");

    const selectButton = wrapper.getByTestId("select-theme");
    selectChangeValueByText(selectButton, "settings.uiSettingsPage.dark", handleError);
    await TestUtils.flushAsyncOperations();
    expect(UiFramework.getColorTheme()).to.eq(ColorTheme.Dark);
    selectChangeValueByText(selectButton, "settings.uiSettingsPage.light", handleError);
    await TestUtils.flushAsyncOperations();
    expect(UiFramework.getColorTheme()).to.eq(ColorTheme.Light);

    wrapper.unmount();
  });

  it("renders without version option (V1) set widget opacity", async () => {
    const wrapper = render(<UiSettingsPage allowSettingUiFrameworkVersion={false} />);
    expect(wrapper).not.to.be.undefined;
    const handles = wrapper.container.querySelectorAll(".core-slider-handle");
    expect(handles.length).to.eq(1);
    fireEvent.mouseDown(handles[0]);
    fireEvent.mouseUp(handles[0]);
    await TestUtils.flushAsyncOperations();
    // trigger sync event processing
    UiFramework.setWidgetOpacity(.5);
    await TestUtils.flushAsyncOperations();
    wrapper.unmount();
  });

  it("renders without version option (V1) toggle auto-hide", async () => {
    const wrapper = render(<UiSettingsPage allowSettingUiFrameworkVersion={false} />);
    expect(wrapper).not.to.be.undefined;
    const autoHideSpan = wrapper.getByText("settings.uiSettingsPage.autoHideTitle");
    const checkbox = getInputBySpanTitle(autoHideSpan);
    expect(checkbox).not.to.be.null;
    fireEvent.click(checkbox!);
    await TestUtils.flushAsyncOperations();
    expect(checkbox?.checked).to.be.true;
    fireEvent.click(checkbox!);
    await TestUtils.flushAsyncOperations();
    expect(checkbox?.checked).to.be.false;
    expect(wrapper.container.querySelectorAll("span.title").length).to.eq(3);
    wrapper.unmount();
  });

  it("renders with version option (V1)", async () => {
    const wrapper = render(<UiSettingsPage allowSettingUiFrameworkVersion={true} />);
    expect(wrapper).not.to.be.undefined;
    expect(wrapper.container.querySelectorAll("span.title").length).to.eq(4);

    const titleSpan = wrapper.getByText("settings.uiSettingsPage.newUiTitle");
    const checkbox = getInputBySpanTitle(titleSpan);
    expect(checkbox).not.to.be.null;
    fireEvent.click(checkbox!);
    await TestUtils.flushAsyncOperations();
    expect(wrapper.container.querySelectorAll("span.title").length).to.eq(7);

    wrapper.unmount();
  });

  it("renders without version option (V2) toggle drag interaction", async () => {
    UiFramework.setUiVersion("2");
    await TestUtils.flushAsyncOperations();
    const wrapper = render(<UiSettingsPage allowSettingUiFrameworkVersion={false} />);
    expect(wrapper).not.to.be.undefined;

    const titleSpan = wrapper.getByText("settings.uiSettingsPage.dragInteractionTitle");
    const checkbox = getInputBySpanTitle(titleSpan);
    fireEvent.click(checkbox!);
    await TestUtils.flushAsyncOperations();
    expect(checkbox?.checked).to.be.true;
    fireEvent.click(checkbox!);
    await TestUtils.flushAsyncOperations();
    expect(checkbox?.checked).to.be.false;
    wrapper.unmount();
  });

  it("renders without version option (V2) toggle useProximityOpacity", async () => {
    UiFramework.setUiVersion("2");
    await TestUtils.flushAsyncOperations();
    const wrapper = render(<UiSettingsPage allowSettingUiFrameworkVersion={false} />);
    expect(wrapper).not.to.be.undefined;

    const titleSpan = wrapper.getByText("settings.uiSettingsPage.useProximityOpacityTitle");
    const checkbox = getInputBySpanTitle(titleSpan);
    fireEvent.click(checkbox!);
    await TestUtils.flushAsyncOperations();
    expect(checkbox?.checked).to.be.false;
    fireEvent.click(checkbox!);
    await TestUtils.flushAsyncOperations();
    expect(checkbox?.checked).to.be.true;
    wrapper.unmount();
  });

  it("renders without version option (V2) toggle snapWidgetOpacity", async () => {
    UiFramework.setUiVersion("2");
    await TestUtils.flushAsyncOperations();
    const wrapper = render(<UiSettingsPage allowSettingUiFrameworkVersion={false} />);
    expect(wrapper).not.to.be.undefined;

    const titleSpan = wrapper.getByText("settings.uiSettingsPage.snapWidgetOpacityTitle");
    const checkbox = getInputBySpanTitle(titleSpan);
    fireEvent.click(checkbox!);
    await TestUtils.flushAsyncOperations();
    expect(checkbox?.checked).to.be.true;
    fireEvent.click(checkbox!);
    await TestUtils.flushAsyncOperations();
    expect(checkbox?.checked).to.be.false;
    wrapper.unmount();
  });

  it("renders with version option (V2) toggle ui-version", async () => {
    UiFramework.setUiVersion("2");
    await TestUtils.flushAsyncOperations();
    const wrapper = render(<UiSettingsPage allowSettingUiFrameworkVersion={true} />);
    expect(wrapper).not.to.be.undefined;
    expect(wrapper.container.querySelectorAll("span.title").length).to.eq(7);
    const uiVersionSpan = wrapper.getByText("settings.uiSettingsPage.newUiTitle");
    const checkbox = getInputBySpanTitle(uiVersionSpan);

    fireEvent.click(checkbox!);
    await TestUtils.flushAsyncOperations();
    expect(wrapper.container.querySelectorAll("span.title").length).to.eq(4);

    fireEvent.click(checkbox!);
    await TestUtils.flushAsyncOperations();
    expect(wrapper.container.querySelectorAll("span.title").length).to.eq(7);

    wrapper.unmount();
  });

});
