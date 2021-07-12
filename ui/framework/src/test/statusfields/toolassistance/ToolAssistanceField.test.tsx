/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { ReactWrapper } from "enzyme";
import * as React from "react";
import * as sinon from "sinon";
import { Logger } from "@bentley/bentleyjs-core";
import { MockRender, ToolAssistance, ToolAssistanceImage, ToolAssistanceInputMethod } from "@bentley/imodeljs-frontend";
import { WidgetState } from "@bentley/ui-abstract";
import { LocalSettingsStorage } from "@bentley/ui-core";
import { FooterPopup, TitleBarButton } from "@bentley/ui-ninezone";
import { ToggleSwitch } from "@itwin/itwinui-react";
import {
  AppNotificationManager, ConfigurableCreateInfo, ConfigurableUiControlType, CursorPopupManager, FrontstageManager, StatusBar, StatusBarWidgetControl,
  StatusBarWidgetControlArgs, ToolAssistanceField, WidgetDef,
} from "../../../ui-framework";
import TestUtils, { mount, storageMock } from "../../TestUtils";

describe("ToolAssistanceField", () => {
  const uiSettingsStorage = new LocalSettingsStorage({ localStorage: storageMock() } as Window);

  before(async () => {
    await uiSettingsStorage.saveSetting("ToolAssistance", "showPromptAtCursor", true);
    await uiSettingsStorage.saveSetting("ToolAssistance", "mouseTouchTabIndex", 0);
  });

  class AppStatusBarWidgetControl extends StatusBarWidgetControl {
    constructor(info: ConfigurableCreateInfo, options: any) {
      super(info, options);
    }

    public getReactNode({ isInFooterMode, onOpenWidget, openWidget }: StatusBarWidgetControlArgs): React.ReactNode {
      return (
        <>
          <ToolAssistanceField isInFooterMode={isInFooterMode} onOpenWidget={onOpenWidget} openWidget={openWidget}
            includePromptAtCursor={true}
            uiSettings={uiSettingsStorage} />
        </>
      );
    }
  }

  let widgetControl: StatusBarWidgetControl | undefined;

  const clickIndicator = (wrapper: ReactWrapper) => {
    wrapper.update();
    const indicator = wrapper.find("div.nz-indicator");
    expect(indicator.length).to.eq(1);
    indicator.simulate("click");
    wrapper.update();
  };

  before(async () => {
    await TestUtils.initializeUiFramework();
    await MockRender.App.startup();

    const statusBarWidgetDef = new WidgetDef({
      classId: AppStatusBarWidgetControl,
      defaultState: WidgetState.Open,
      isFreeform: false,
      isStatusBar: true,
    });
    widgetControl = statusBarWidgetDef.getWidgetControl(ConfigurableUiControlType.StatusBarWidget) as StatusBarWidgetControl;
  });

  after(async () => {
    TestUtils.terminateUiFramework();
    await MockRender.App.shutdown();
  });

  // cSpell:Ignore TOOLPROMPT

  it("Status Bar with ToolAssistanceField should mount", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const helloWorld = "Hello World!";
    const notifications = new AppNotificationManager();
    notifications.outputPrompt(helloWorld);
    wrapper.update();
  });

  it("dialog should open and close on click", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const helloWorld = "Hello World!";
    const notifications = new AppNotificationManager();
    notifications.outputPrompt(helloWorld);
    wrapper.update();

    clickIndicator(wrapper);

    expect(wrapper.find("div.nz-footer-toolAssistance-dialog").length).to.eq(1);

    clickIndicator(wrapper);

    expect(wrapper.find("div.nz-footer-toolAssistance-dialog").length).to.eq(0);
  });

  it("passing isNew:true should use newDot", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, "Click on something", true);

    const instruction1 = ToolAssistance.createInstruction(ToolAssistanceImage.AcceptPoint, "xyz", true);
    const instruction2 = ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["A"]), "Press a key", true);
    const section1 = ToolAssistance.createSection([instruction1, instruction2], "Inputs");

    const instructions = ToolAssistance.createInstructions(mainInstruction, [section1]);

    notifications.setToolAssistance(instructions);
    wrapper.update();

    clickIndicator(wrapper);

    expect(wrapper.find(".nz-footer-toolAssistance-newDot").length).to.eq(3);
    expect(wrapper.find(".nz-text-new").length).to.eq(3);
  });

  it("ToolAssistanceImage.Keyboard with a single key should generate key image", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.AcceptPoint, "xyz");
    const instruction1 = ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["A"]), "Press a key");
    const section1 = ToolAssistance.createSection([instruction1], "Inputs");
    const instructions = ToolAssistance.createInstructions(mainInstruction, [section1]);
    notifications.setToolAssistance(instructions);

    wrapper.update();

    clickIndicator(wrapper);

    expect(wrapper.find(".nz-content-dialog .uifw-toolassistance-key").length).to.eq(1);
  });

  it("should support known icons and multiple sections", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction("icon-clock", "This is the prompt that is fairly long 1234567890");

    const instruction1 = ToolAssistance.createInstruction(ToolAssistanceImage.AcceptPoint, "xyz");
    const instruction2 = ToolAssistance.createInstruction(ToolAssistanceImage.MouseWheel, "xyz");
    const section1 = ToolAssistance.createSection([instruction1, instruction2], "Inputs");

    const instruction21 = ToolAssistance.createInstruction(ToolAssistanceImage.LeftClick, "xyz");
    const instruction22 = ToolAssistance.createInstruction(ToolAssistanceImage.RightClick, "xyz");
    const instruction23 = ToolAssistance.createInstruction(ToolAssistanceImage.LeftClickDrag, "xyz");
    const instruction24 = ToolAssistance.createInstruction(ToolAssistanceImage.RightClickDrag, "xyz");
    const instruction25 = ToolAssistance.createInstruction(ToolAssistanceImage.MouseWheelClickDrag, "xyz");
    const section2 = ToolAssistance.createSection([instruction21, instruction22, instruction23, instruction24, instruction25], "More Inputs");

    const instruction31 = ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchTap, "xyz");
    const instruction32 = ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchDoubleTap, "xyz");
    const instruction33 = ToolAssistance.createInstruction(ToolAssistanceImage.OneTouchDrag, "xyz");
    const instruction34 = ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchTap, "xyz");
    const instruction35 = ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchDrag, "xyz");
    const instruction36 = ToolAssistance.createInstruction(ToolAssistanceImage.TwoTouchPinch, "xyz");
    const instruction37 = ToolAssistance.createInstruction(ToolAssistanceImage.TouchCursorTap, "xyz");
    const instruction38 = ToolAssistance.createInstruction(ToolAssistanceImage.TouchCursorDrag, "xyz");
    const section3 = ToolAssistance.createSection([instruction31, instruction32, instruction33, instruction34, instruction35, instruction36, instruction37, instruction38], "Touch Inputs");

    const instructions = ToolAssistance.createInstructions(mainInstruction, [section1, section2, section3]);

    notifications.setToolAssistance(instructions);

    clickIndicator(wrapper);

    expect(wrapper.find("div.nz-footer-toolAssistance-dialog").length).to.eq(1);
    expect(wrapper.find("div.nz-footer-toolAssistance-separator").length).to.eq(4);
    expect(wrapper.find("div.nz-footer-toolAssistance-instruction").length).to.eq(16);
  });

  it("ToolAssistanceImage.Keyboard with a key containing multiple chars should use large key", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.AcceptPoint, "xyz");
    const instruction1 = ToolAssistance.createKeyboardInstruction(ToolAssistance.shiftKeyboardInfo, "Press the Shift key");
    const section1 = ToolAssistance.createSection([instruction1], "Inputs");
    const instructions = ToolAssistance.createInstructions(mainInstruction, [section1]);

    notifications.setToolAssistance(instructions);

    clickIndicator(wrapper);

    expect(wrapper.find(".nz-content-dialog .uifw-toolassistance-key-large").length).to.eq(1);
  });

  it("ToolAssistanceImage.Keyboard with 2 keys should use medium keys", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.AcceptPoint, "xyz");
    const instruction1 = ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["A", "B"]), "Press one of two keys");
    const section1 = ToolAssistance.createSection([instruction1], "Inputs");
    const instructions = ToolAssistance.createInstructions(mainInstruction, [section1]);

    notifications.setToolAssistance(instructions);

    clickIndicator(wrapper);

    expect(wrapper.find(".nz-content-dialog .uifw-toolassistance-key-medium").length).to.eq(2);
  });

  it("ToolAssistanceImage.Keyboard with a modifier key should a medium modifier key & medium key", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.AcceptPoint, "xyz");
    const instruction1 = ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo([ToolAssistance.ctrlKey, "Z"]), "Press Ctrl+Z", true);
    const section1 = ToolAssistance.createSection([instruction1], "Inputs");
    const instructions = ToolAssistance.createInstructions(mainInstruction, [section1]);

    notifications.setToolAssistance(instructions);

    clickIndicator(wrapper);

    expect(wrapper.find(".nz-content-dialog .uifw-toolassistance-key-modifier").length).to.eq(1);
    expect(wrapper.find(".nz-content-dialog .uifw-toolassistance-key-medium").length).to.eq(1);
  });

  it("ToolAssistanceImage.Keyboard with bottomRow should use small keys", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.AcceptPoint, "xyz");
    const instruction1 = ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo(["W"], ["A", "S", "D"]), "Press one of four keys");
    const section1 = ToolAssistance.createSection([instruction1], "Inputs");
    const instructions = ToolAssistance.createInstructions(mainInstruction, [section1]);

    notifications.setToolAssistance(instructions);

    clickIndicator(wrapper);

    expect(wrapper.find(".nz-content-dialog .uifw-toolassistance-key-small").length).to.eq(4);
  });

  it("ToolAssistanceImage.Keyboard but keyboardInfo should log error", () => {
    const spyMethod = sinon.spy(Logger, "logError");
    mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.Keyboard, "Press a key" /* No keyboardInfo */);
    const instructions = ToolAssistance.createInstructions(mainInstruction);

    notifications.setToolAssistance(instructions);

    spyMethod.called.should.true;
  });

  it("ToolAssistanceImage.Keyboard with invalid keyboardInfo should log error", () => {
    const spyMethod = sinon.spy(Logger, "logError");
    mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createKeyboardInstruction(ToolAssistance.createKeyboardInfo([]), "Press key");
    const instructions = ToolAssistance.createInstructions(mainInstruction);

    notifications.setToolAssistance(instructions);

    spyMethod.called.should.true;
  });

  it("createModifierKeyInstruction should generate valid instruction", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, "Click on something", true, ToolAssistanceInputMethod.Both, ToolAssistance.createKeyboardInfo([]));

    const instruction1 = ToolAssistance.createModifierKeyInstruction(ToolAssistance.shiftKey, ToolAssistanceImage.LeftClick, "Shift + something else");
    const instruction2 = ToolAssistance.createModifierKeyInstruction(ToolAssistance.ctrlKey, "icon-cursor-click", "Ctrl + something else");
    const instruction3 = ToolAssistance.createModifierKeyInstruction(ToolAssistance.shiftKey, ToolAssistanceImage.LeftClickDrag, "shiftKey + drag something");
    const instruction4 = ToolAssistance.createModifierKeyInstruction(ToolAssistance.shiftKey, ToolAssistanceImage.RightClickDrag, "shiftKey + drag something");
    const instruction5 = ToolAssistance.createModifierKeyInstruction(ToolAssistance.shiftKey, ToolAssistanceImage.MouseWheelClickDrag, "shiftKey + drag something");
    const section1 = ToolAssistance.createSection([instruction1, instruction2, instruction3, instruction4, instruction5], "Inputs");
    const instructions = ToolAssistance.createInstructions(mainInstruction, [section1]);
    notifications.setToolAssistance(instructions);

    clickIndicator(wrapper);

    expect(wrapper.find("div.uifw-toolassistance-key-modifier").length).to.eq(5);
    expect(wrapper.find("div.uifw-toolassistance-svg-medium").length).to.eq(1);
    expect(wrapper.find("div.uifw-toolassistance-icon-medium").length).to.eq(1);
    expect(wrapper.find("div.uifw-toolassistance-svg-medium-wide").length).to.eq(3);
  });

  it("should support svg icons in string-based instruction.image", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction("svg:test", "This is the prompt");

    const instructions = ToolAssistance.createInstructions(mainInstruction);

    notifications.setToolAssistance(instructions);

    clickIndicator(wrapper);

    expect(wrapper.find("div.uifw-toolassistance-svg").length).to.eq(1);
    expect(wrapper.find("div.uifw-toolassistance-icon-large").length).to.eq(0);
  });

  it("invalid modifier key info along with image should log error", () => {
    const spyMethod = sinon.spy(Logger, "logError");
    mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, "Click on something", true, ToolAssistanceInputMethod.Both, ToolAssistance.createKeyboardInfo([]));
    const instructions = ToolAssistance.createInstructions(mainInstruction);
    notifications.setToolAssistance(instructions);

    spyMethod.called.should.true;
  });

  it("should close on outside click", () => {
    const wrapper = mount<StatusBar>(<StatusBar widgetControl={widgetControl} isInFooterMode />);
    const footerPopup = wrapper.find(FooterPopup);

    const statusBarInstance = wrapper.instance();
    statusBarInstance.setState(() => ({ openWidget: "test-widget" }));

    const outsideClick = new MouseEvent("");
    sinon.stub(outsideClick, "target").get(() => document.createElement("div"));
    footerPopup.prop("onOutsideClick")!(outsideClick);

    expect(statusBarInstance.state.openWidget).null;
  });

  it("should not close on outside click if pinned", () => {
    const wrapper = mount<StatusBar>(<StatusBar widgetControl={widgetControl} isInFooterMode />);
    const footerPopup = wrapper.find(FooterPopup);

    const statusBarInstance = wrapper.instance();
    statusBarInstance.setState(() => ({ openWidget: "test-widget" }));

    const toolAssistanceField = wrapper.find(ToolAssistanceField);
    expect(toolAssistanceField.length).to.eq(1);
    expect(toolAssistanceField.state("isPinned")).to.be.false;
    toolAssistanceField.setState({ isPinned: true });
    expect(toolAssistanceField.state("isPinned")).to.be.true;

    const outsideClick = new MouseEvent("");
    sinon.stub(outsideClick, "target").get(() => document.createElement("div"));
    footerPopup.prop("onOutsideClick")!(outsideClick);

    expect(statusBarInstance.state.openWidget).not.null;
  });

  it("dialog should open and close on click, even if pinned", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const helloWorld = "Hello World!";
    const notifications = new AppNotificationManager();
    notifications.outputPrompt(helloWorld);
    wrapper.update();

    clickIndicator(wrapper);

    expect(wrapper.find("div.nz-footer-toolAssistance-dialog").length).to.eq(1);

    const toolAssistanceField = wrapper.find(ToolAssistanceField);
    expect(toolAssistanceField.length).to.eq(1);
    expect(toolAssistanceField.state("isPinned")).to.be.false;
    toolAssistanceField.setState({ isPinned: true });
    expect(toolAssistanceField.state("isPinned")).to.be.true;

    clickIndicator(wrapper);

    expect(wrapper.find("div.nz-footer-toolAssistance-dialog").length).to.eq(0);
    expect(toolAssistanceField.state("isPinned")).to.be.false;
  });

  it("should set showPromptAtCursor on toggle click", async () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={false} />);
    await TestUtils.flushAsyncOperations();
    const toolAssistanceField = wrapper.find(ToolAssistanceField);
    expect(toolAssistanceField.length).to.eq(1);
    expect(toolAssistanceField.state("showPromptAtCursor")).to.be.true;

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, "Click on something", true);
    const instructions = ToolAssistance.createInstructions(mainInstruction);
    notifications.setToolAssistance(instructions);

    clickIndicator(wrapper);

    const toggle = wrapper.find(ToggleSwitch);
    expect(toggle.length).to.eq(1);
    toggle.find("input").simulate("change", { target: { checked: false } });

    expect(toolAssistanceField.state("showPromptAtCursor")).to.be.false;
  });

  it("cursorPrompt should open when tool assistance set", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={false} />);

    const toolAssistanceField = wrapper.find(ToolAssistanceField);
    expect(toolAssistanceField.length).to.eq(1);
    toolAssistanceField.setState({ showPromptAtCursor: true });

    const spyMethod = sinon.spy();
    CursorPopupManager.onCursorPopupUpdatePositionEvent.addListener(spyMethod);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, "Click on something", true);
    const instructions = ToolAssistance.createInstructions(mainInstruction);
    notifications.setToolAssistance(instructions);
    wrapper.update();

    spyMethod.called.should.true;

    CursorPopupManager.onCursorPopupUpdatePositionEvent.removeListener(spyMethod);
  });

  it("cursorPrompt should open when tool icon changes", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={false} />);

    FrontstageManager.onToolIconChangedEvent.emit({ iconSpec: "icon-placeholder" });

    const toolAssistanceField = wrapper.find(ToolAssistanceField);
    expect(toolAssistanceField.length).to.eq(1);
    toolAssistanceField.setState({ showPromptAtCursor: true });

    // emit before instructions set
    FrontstageManager.onToolIconChangedEvent.emit({ iconSpec: "icon-placeholder" });

    const spyMethod = sinon.spy();
    CursorPopupManager.onCursorPopupUpdatePositionEvent.addListener(spyMethod);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, "Click on something", true);
    const instructions = ToolAssistance.createInstructions(mainInstruction);
    notifications.setToolAssistance(instructions);

    // emit after instructions set
    FrontstageManager.onToolIconChangedEvent.emit({ iconSpec: "icon-placeholder" });

    wrapper.update();

    spyMethod.called.should.true;

    CursorPopupManager.onCursorPopupUpdatePositionEvent.removeListener(spyMethod);
  });

  it("mouse & touch instructions should generate tabs", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, "Click on something", true);

    const instruction1 = ToolAssistance.createInstruction(ToolAssistanceImage.AcceptPoint, "xyz", true, ToolAssistanceInputMethod.Mouse);
    const instruction2 = ToolAssistance.createInstruction(ToolAssistanceImage.AcceptPoint, "xyz", true, ToolAssistanceInputMethod.Touch);
    const section1 = ToolAssistance.createSection([instruction1, instruction2], "Inputs");

    const instructions = ToolAssistance.createInstructions(mainInstruction, [section1]);

    notifications.setToolAssistance(instructions);

    clickIndicator(wrapper);

    const tabList = wrapper.find("ul.uifw-toolAssistance-tabs");
    expect(tabList.length).to.eq(1);

    const tabIndex = wrapper.find(ToolAssistanceField).state("mouseTouchTabIndex");
    expect(tabIndex).to.satisfy((index: number) => index === 0 || index === 1);
    const nonActive = tabList.find("li:not(.core-active)");
    expect(nonActive.length).to.eq(1);

    const anchor = nonActive.find("a");
    expect(anchor.length).to.eq(1);
    anchor.simulate("click");

    const newTabIndex = wrapper.find(ToolAssistanceField).state("mouseTouchTabIndex");
    expect(tabIndex !== newTabIndex).to.be.true;
  });

  it("touch instructions should show", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const notifications = new AppNotificationManager();
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, "Click on something", true);

    const instruction1 = ToolAssistance.createInstruction(ToolAssistanceImage.AcceptPoint, "xyz", true, ToolAssistanceInputMethod.Touch);
    const section1 = ToolAssistance.createSection([instruction1], "Inputs");

    const instructions = ToolAssistance.createInstructions(mainInstruction, [section1]);

    notifications.setToolAssistance(instructions);

    clickIndicator(wrapper);

    const showTouchInstructions = wrapper.find(ToolAssistanceField).state("showTouchInstructions");
    expect(showTouchInstructions).to.be.true;
  });

  it("dialog should open, pin and close on click", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const helloWorld = "Hello World!";
    const notifications = new AppNotificationManager();
    notifications.outputPrompt(helloWorld);

    clickIndicator(wrapper);

    expect(wrapper.find("div.nz-footer-toolAssistance-dialog").length).to.eq(1);

    const toolAssistanceField = wrapper.find(ToolAssistanceField);
    expect(toolAssistanceField.length).to.eq(1);
    expect(toolAssistanceField.state("isPinned")).to.be.false;

    let buttons = wrapper.find(TitleBarButton); // Pin button
    expect(buttons.length).to.eq(1);
    buttons.simulate("click");
    wrapper.update();
    expect(toolAssistanceField.state("isPinned")).to.be.true;

    buttons = wrapper.find(TitleBarButton);   // Close button
    expect(buttons.length).to.eq(1);
    buttons.simulate("click");
    wrapper.update();
    expect(toolAssistanceField.state("isPinned")).to.be.false;

    expect(wrapper.find("div.nz-footer-toolAssistance-dialog").length).to.eq(0);
  });

});
