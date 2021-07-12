/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DialogButtonStyle, DialogButtonType } from "@bentley/ui-abstract";
import { expect } from "chai";
import { mount, shallow } from "enzyme";
import * as React from "react";
import { MessageBox, MessageSeverity } from "../../ui-core";
import { MessageContainer } from "../../ui-core/messagebox/MessageBox";
import TestUtils from "../TestUtils";

describe("MessageBox", () => {

  before(async () => {
    await TestUtils.initializeUiCore();
  });

  const buttonCluster = [
    { type: DialogButtonType.Close, buttonStyle: DialogButtonStyle.Primary, onClick: () => { } },
  ];

  describe("renders", () => {
    it("should render", () => {
      const wrapper = mount(<MessageBox opened={true} severity={MessageSeverity.Information} buttonCluster={buttonCluster} />);
      const icon = wrapper.find("div.core-message-box-information");
      expect(icon.length).to.eq(1);
      wrapper.unmount();
    });

    it("renders correctly", () => {
      shallow(<MessageBox opened={true} severity={MessageSeverity.Information} buttonCluster={buttonCluster} />).should.matchSnapshot();
    });
  });

  describe("renders different severities", () => {
    it("MessageSeverity.Question", () => {
      const wrapper = mount(<MessageBox opened={true} severity={MessageSeverity.Question} buttonCluster={buttonCluster} />);
      const icon = wrapper.find("div.core-message-box-question");
      expect(icon.length).to.eq(1);
    });
    it("MessageSeverity.Warning", () => {
      const wrapper = mount(<MessageBox opened={true} severity={MessageSeverity.Warning} buttonCluster={buttonCluster} />);
      const icon = wrapper.find("div.core-message-box-warning");
      expect(icon.length).to.eq(1);
    });
    it("MessageSeverity.Error", () => {
      const wrapper = mount(<MessageBox opened={true} severity={MessageSeverity.Error} buttonCluster={buttonCluster} />);
      const icon = wrapper.find("div.core-message-box-error");
      expect(icon.length).to.eq(1);
    });
    it("MessageSeverity.Fatal", () => {
      const wrapper = mount(<MessageBox opened={true} severity={MessageSeverity.Fatal} buttonCluster={buttonCluster} />);
      const icon = wrapper.find("div.core-message-box-fatal");
      expect(icon.length).to.eq(1);
    });
    it("MessageSeverity.None", () => {
      const wrapper = mount(<MessageBox opened={true} severity={MessageSeverity.None} buttonCluster={buttonCluster} />);
      const icon = wrapper.find("div.core-message-box-success");
      expect(icon.length).to.eq(1);
    });
  });

  describe("MessageContainer.getIconClassName with hollow param", () => {
    it("hollow icons", () => {
      expect(MessageContainer.getIconClassName(MessageSeverity.None, true).length).to.not.eq(0);
      expect(MessageContainer.getIconClassName(MessageSeverity.Information, true).length).to.not.eq(0);
      expect(MessageContainer.getIconClassName(MessageSeverity.Question, true).length).to.not.eq(0);
      expect(MessageContainer.getIconClassName(MessageSeverity.Warning, true).length).to.not.eq(0);
      expect(MessageContainer.getIconClassName(MessageSeverity.Error, true).length).to.not.eq(0);
      expect(MessageContainer.getIconClassName(MessageSeverity.Fatal, true).length).to.not.eq(0);
    });
  });

});
