/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import * as sinon from "sinon";
import { render } from "@testing-library/react";
import {
  ActivityMessageDetails, ActivityMessageEndReason, NotifyMessageDetails, OutputMessagePriority, OutputMessageType,
} from "@bentley/imodeljs-frontend";
import { WidgetState } from "@bentley/ui-abstract";
import { MessageSeverity } from "@bentley/ui-core";
import { MessageHyperlink, MessageLayout, MessageProgress, Toast } from "@bentley/ui-ninezone";
import { IconButton } from "@itwin/itwinui-react";
import { ToastPresentation } from "@itwin/itwinui-react/cjs/core/Toast/Toast";
import {
  AppNotificationManager, ConfigurableCreateInfo, ConfigurableUiControlType, MessageCenterField, StatusBar, StatusBarCenterSection,
  StatusBarLeftSection, StatusBarRightSection, StatusBarSpaceBetween, StatusBarWidgetControl, StatusBarWidgetControlArgs, WidgetDef,
} from "../../ui-framework";
import TestUtils, { mount } from "../TestUtils";
import { MessageManager } from "../../ui-framework/messages/MessageManager";
import { StatusMessagesContainer } from "../../ui-framework/messages/StatusMessagesContainer";
import { createDOMRect } from "../Utils";

describe("StatusBar", () => {

  class AppStatusBarWidgetControl extends StatusBarWidgetControl {
    constructor(info: ConfigurableCreateInfo, options: any) {
      super(info, options);
    }

    public getReactNode({ isInFooterMode, onOpenWidget, openWidget }: StatusBarWidgetControlArgs): React.ReactNode {
      return (
        <>
          <MessageCenterField isInFooterMode={isInFooterMode} onOpenWidget={onOpenWidget} openWidget={openWidget} />
        </>
      );
    }
  }

  let widgetControl: StatusBarWidgetControl | undefined;
  let notifications: AppNotificationManager;

  before(async () => {
    await TestUtils.initializeUiFramework();

    const statusBarWidgetDef = new WidgetDef({
      classId: AppStatusBarWidgetControl,
      defaultState: WidgetState.Open,
      isFreeform: false,
      isStatusBar: true,
    });
    widgetControl = statusBarWidgetDef.getWidgetControl(ConfigurableUiControlType.StatusBarWidget) as StatusBarWidgetControl;

    notifications = new AppNotificationManager();
  });

  after(() => {
    TestUtils.terminateUiFramework();
  });

  beforeEach(() => {
    MessageManager.activeMessageManager.initialize();
  });

  it("StatusBar should mount", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);
    wrapper.unmount();
  });

  it("StatusBar should render a Toast message", async () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const details = new NotifyMessageDetails(OutputMessagePriority.None, "A brief message.", "A detailed message.");
    notifications.outputMessage(details);
    wrapper.update();

    expect(wrapper.find(Toast).length).to.eq(1);
    expect(wrapper.find(ToastPresentation).length).to.eq(1);
    expect(wrapper.find(MessageLayout).length).to.eq(1);
    wrapper.unmount();
  });

  it("StatusBar should render a Toast message and animate out", async () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const details = new NotifyMessageDetails(OutputMessagePriority.Warning, "A brief message.", "A detailed message.");
    notifications.outputMessage(details);
    wrapper.update();

    expect(wrapper.find(Toast).length).to.eq(1);

    const toast = wrapper.find(".nz-toast");
    expect(toast.length).to.eq(1);
    toast.simulate("transitionEnd");
    wrapper.update();

    expect(wrapper.find(".nz-toast").length).to.eq(0);
    wrapper.unmount();
  });

  it("StatusBar should render a Sticky message", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const details = new NotifyMessageDetails(OutputMessagePriority.Info, "A brief message.", "A detailed message.", OutputMessageType.Sticky);
    notifications.outputMessage(details);
    wrapper.update();

    expect(wrapper.find(ToastPresentation).length).to.eq(1);
    expect(wrapper.find(MessageLayout).length).to.eq(1);
    expect(wrapper.find(IconButton).length).to.eq(1);
    wrapper.unmount();
  });

  it("Sticky message should close on button click", () => {
    const fakeTimers = sinon.useFakeTimers();
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const details = new NotifyMessageDetails(OutputMessagePriority.Error, "A brief message.", "A detailed message.", OutputMessageType.Sticky);
    notifications.outputMessage(details);
    wrapper.update();

    expect(wrapper.find(IconButton).length).to.eq(1);

    wrapper.find(IconButton).simulate("click");
    fakeTimers.tick(1000);
    fakeTimers.restore();
    wrapper.update();
    expect(wrapper.find(ToastPresentation).length).to.eq(0);
    wrapper.unmount();
  });

  it("StatusBar should render an Activity message", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const details = new ActivityMessageDetails(true, true, false);
    notifications.setupActivityMessage(details);
    notifications.outputActivityMessage("Message text", 50);
    wrapper.update();

    expect(wrapper.find(ToastPresentation).length).to.eq(1);
    expect(wrapper.find(MessageProgress).length).to.eq(1);

    notifications.endActivityMessage(ActivityMessageEndReason.Completed);
    wrapper.update();
    expect(wrapper.find(ToastPresentation).length).to.eq(0);
    wrapper.unmount();
  });

  it("Activity message should be canceled", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const details = new ActivityMessageDetails(true, true, true);
    notifications.setupActivityMessage(details);
    notifications.outputActivityMessage("Message text", 50);
    wrapper.update();
    expect(wrapper.find(ToastPresentation).length).to.eq(1);

    wrapper.find(MessageHyperlink).simulate("click");
    wrapper.update();
    expect(wrapper.find(ToastPresentation).length).to.eq(0);
    wrapper.unmount();
  });

  it("Activity message should be dismissed", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const details = new ActivityMessageDetails(true, true, true);
    notifications.setupActivityMessage(details);
    notifications.outputActivityMessage("Message text", 50);
    wrapper.update();
    expect(wrapper.find(ToastPresentation).length).to.eq(1);

    wrapper.find(IconButton).simulate("click");
    wrapper.update();
    expect(wrapper.find(ToastPresentation).length).to.eq(0);
    wrapper.unmount();
  });

  it("StatusBar should render Toast, Sticky & Activity messages", async () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const details1 = new NotifyMessageDetails(OutputMessagePriority.None, "A brief message.", "A detailed message.");
    notifications.outputMessage(details1);
    const details2 = new NotifyMessageDetails(OutputMessagePriority.None, "A brief message.", "A detailed message.", OutputMessageType.Sticky);
    notifications.outputMessage(details2);
    const details3 = new ActivityMessageDetails(true, true, true);
    notifications.setupActivityMessage(details3);
    notifications.outputActivityMessage("Message text", 50);
    wrapper.update();

    expect(wrapper.find(ToastPresentation).length).to.eq(3);
    wrapper.unmount();
  });

  it("StatusBar should render maximum of 3 Sticky messages", async () => {
    MessageManager.maxDisplayedStickyMessages = 3;

    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const details1 = new NotifyMessageDetails(OutputMessagePriority.None, "A brief message 1.", undefined, OutputMessageType.Sticky);
    notifications.outputMessage(details1);
    const details2 = new NotifyMessageDetails(OutputMessagePriority.None, "A brief message 2.", undefined, OutputMessageType.Sticky);
    notifications.outputMessage(details2);
    const details3 = new NotifyMessageDetails(OutputMessagePriority.None, "A brief message 3.", undefined, OutputMessageType.Sticky);
    notifications.outputMessage(details3);
    wrapper.update();

    expect(wrapper.find(ToastPresentation).length).to.eq(3);

    const details4 = new NotifyMessageDetails(OutputMessagePriority.None, "A brief message 4.", undefined, OutputMessageType.Sticky);
    notifications.outputMessage(details4);
    wrapper.update();

    expect(wrapper.find(ToastPresentation).length).to.eq(3);
    expect(wrapper.find(IconButton).length).to.eq(3);
    wrapper.unmount();
  });

  it("StatusBar should not render a Pointer message", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const details = new NotifyMessageDetails(OutputMessagePriority.Info, "A brief message.", "A detailed message.", OutputMessageType.Pointer);
    notifications.outputMessage(details);
    wrapper.update();

    expect(wrapper.find(ToastPresentation).length).to.eq(0);
    wrapper.unmount();
  });

  it("StatusBar should clear messages", () => {
    const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

    const details = new NotifyMessageDetails(OutputMessagePriority.Info, "A brief message.", "A detailed message.", OutputMessageType.Sticky);
    notifications.outputMessage(details);
    wrapper.update();

    expect(wrapper.find(ToastPresentation).length).to.eq(1);

    MessageManager.clearMessages();
    wrapper.update();
    expect(wrapper.find(ToastPresentation).length).to.eq(0);
    wrapper.unmount();
  });

  it("StatusMessageRenderer should render empty correctly", () => {
    const wrapper = mount(<StatusMessagesContainer
      messages={[]}
      activityMessageInfo={undefined}
      isActivityMessageVisible={false}
      toastTarget={null}
      closeMessage={() => { }}
      cancelActivityMessage={() => { }}
      dismissActivityMessage={() => { }}
    />);
    expect(wrapper.find("div").length).to.eq(0);
    wrapper.unmount();
  });

  it("StatusBarSpaceBetween should render correctly", () => {
    const wrapper = mount(<StatusBarSpaceBetween>Hello</StatusBarSpaceBetween>);
    expect(wrapper.find("div.uifw-statusbar-space-between").length).to.eq(1);
    wrapper.unmount();
  });

  it("StatusBarLeftSection should render correctly", () => {
    const wrapper = mount(<StatusBarLeftSection>Hello</StatusBarLeftSection>);
    expect(wrapper.find("div.uifw-statusbar-left").length).to.eq(1);
    wrapper.unmount();
  });

  it("StatusBarCenterSection should render correctly", () => {
    const wrapper = mount(<StatusBarCenterSection>Hello</StatusBarCenterSection>);
    expect(wrapper.find("div.uifw-statusbar-center").length).to.eq(1);
    wrapper.unmount();
  });

  it("StatusBarRightSection should render correctly", () => {
    const wrapper = mount(<StatusBarRightSection>Hello</StatusBarRightSection>);
    expect(wrapper.find("div.uifw-statusbar-right").length).to.eq(1);
    wrapper.unmount();
  });

  describe("<StatusMessagesContainer />", () => {
    const sandbox = sinon.createSandbox();
    const messages = [
      { id: "one", messageDetails: new NotifyMessageDetails(OutputMessagePriority.Info, "message1", "Detailed message1", OutputMessageType.Toast), severity: MessageSeverity.Information },
      { id: "two", messageDetails: new NotifyMessageDetails(OutputMessagePriority.Info, "message2", "Detailed message3", OutputMessageType.Toast), severity: MessageSeverity.Information },
      { id: "three", messageDetails: new NotifyMessageDetails(OutputMessagePriority.Info, "message3", "Detailed message3", OutputMessageType.Sticky), severity: MessageSeverity.Question },
    ];

    afterEach(() => {
      sandbox.restore();
    });

    it("will render with message container height < window.innerHeight, not scrollable", () => {
      sandbox.stub(window, "innerHeight").get(() => 1000);

      // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
      sandbox.stub(Element.prototype, "getBoundingClientRect").callsFake(function (this: HTMLElement) {
        if (this.classList.contains("uifw-statusbar-messages-container")) {
          return createDOMRect({ width: 200, height: 200 });
        }
        return createDOMRect();
      });

      const renderedComponent = render(<StatusMessagesContainer
        messages={messages}
        activityMessageInfo={undefined}
        isActivityMessageVisible={false}
        toastTarget={null}
        closeMessage={() => { }}
        cancelActivityMessage={() => { }}
        dismissActivityMessage={() => { }}
      />);
      expect(renderedComponent.container.querySelectorAll("div.uifw-statusbar-messages-container.uifw-scrollable").length).to.eq(0);
      renderedComponent.unmount();
    });

    it("will render with message container height > window.innerHeight, scrollable", () => {
      sandbox.stub(window, "innerHeight").get(() => 200);
      // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
      sandbox.stub(Element.prototype, "getBoundingClientRect").callsFake(function (this: HTMLElement) {
        if (this.classList.contains("uifw-statusbar-messages-container")) {
          return createDOMRect({ width: 200, height: 300 });
        }
        return createDOMRect();
      });

      const renderedComponent = render(<StatusMessagesContainer
        messages={messages}
        activityMessageInfo={undefined}
        isActivityMessageVisible={false}
        toastTarget={null}
        closeMessage={() => { }}
        cancelActivityMessage={() => { }}
        dismissActivityMessage={() => { }}
      />);
      expect(renderedComponent.container.querySelectorAll("div.uifw-statusbar-messages-container.uifw-scrollable").length).to.eq(1);
      renderedComponent.unmount();
    });

  });
});
