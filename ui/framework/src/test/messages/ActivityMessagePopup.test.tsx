/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as sinon from "sinon";
import * as React from "react";
import { ActivityMessageDetails, ActivityMessageEndReason } from "@bentley/imodeljs-frontend";
import { MessageHyperlink, MessageProgress } from "@bentley/ui-ninezone";
import { IconButton } from "@itwin/itwinui-react";
import { ToastPresentation } from "@itwin/itwinui-react/cjs/core/Toast/Toast";
import { ActivityMessage, ActivityMessagePopup, AppNotificationManager, MessageManager } from "../../ui-framework";
import { mount, TestUtils } from "../TestUtils";

describe("ActivityMessagePopup", () => {

  let notifications: AppNotificationManager;

  before(async () => {
    await TestUtils.initializeUiFramework();

    notifications = new AppNotificationManager();
  });

  after(() => {
    TestUtils.terminateUiFramework();
  });

  it("Popup should render an Activity message", () => {
    const wrapper = mount(<ActivityMessagePopup cancelActivityMessage={() => { }} dismissActivityMessage={() => { }} />);

    const details = new ActivityMessageDetails(true, true, false);
    notifications.setupActivityMessage(details);
    notifications.outputActivityMessage("Message text", 50);
    wrapper.update();

    expect(wrapper.find(ActivityMessage).length).to.eq(1);
    expect(wrapper.find(ToastPresentation).length).to.eq(1);
    expect(wrapper.find(MessageProgress).length).to.eq(1);

    notifications.endActivityMessage(ActivityMessageEndReason.Completed);
    wrapper.update();
    expect(wrapper.find(ActivityMessage).length).to.eq(0);
    expect(wrapper.find(ToastPresentation).length).to.eq(0);

    wrapper.unmount();
  });

  it("Activity message should be canceled", () => {
    const spy = sinon.spy();
    const wrapper = mount(<ActivityMessagePopup cancelActivityMessage={spy} dismissActivityMessage={() => { }} />);

    const details = new ActivityMessageDetails(true, true, true);
    notifications.setupActivityMessage(details);
    notifications.outputActivityMessage("Message text", 50);
    wrapper.update();

    expect(wrapper.find(ActivityMessage).length).to.eq(1);
    expect(wrapper.find(ToastPresentation).length).to.eq(1);

    wrapper.find(MessageHyperlink).simulate("click");
    wrapper.update();

    expect(wrapper.find(ActivityMessage).length).to.eq(0);
    expect(wrapper.find(ToastPresentation).length).to.eq(0);
    spy.calledOnce.should.true;

    wrapper.unmount();
  });

  it("Activity message should be dismissed & restored", () => {
    const spy = sinon.spy();
    const wrapper = mount(<ActivityMessagePopup cancelActivityMessage={() => { }} dismissActivityMessage={spy} />);

    const details = new ActivityMessageDetails(true, true, true);
    notifications.setupActivityMessage(details);
    notifications.outputActivityMessage("Message text", 50);
    wrapper.update();
    expect(wrapper.find(ActivityMessage).length).to.eq(1);
    expect(wrapper.find(ToastPresentation).length).to.eq(1);

    wrapper.find(IconButton).simulate("click");
    wrapper.update();
    expect(wrapper.find(ActivityMessage).length).to.eq(0);
    expect(wrapper.find(ToastPresentation).length).to.eq(0);
    spy.calledOnce.should.true;

    notifications.outputActivityMessage("Message text", 60);
    wrapper.update();
    expect(wrapper.find(ActivityMessage).length).to.eq(0);

    MessageManager.setupActivityMessageValues("Test message text", 75, true);   // restore
    wrapper.update();
    expect(wrapper.find(ActivityMessage).length).to.eq(1);
    expect(wrapper.find(ToastPresentation).length).to.eq(1);

    wrapper.unmount();
  });

});
