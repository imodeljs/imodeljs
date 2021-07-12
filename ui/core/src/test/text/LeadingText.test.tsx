/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { LeadingText } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<LeadingText />", () => {
  it("should render", () => {
    mount(<LeadingText />);
  });
  it("renders correctly", () => {
    shallow(<LeadingText />).should.matchSnapshot();
  });

  it("content renders correctly", () => {
    shallow(<LeadingText>Test content</LeadingText>).should.matchSnapshot();
  });

  it("has correct className", () => {
    const wrapper = mount(<LeadingText />);
    wrapper.find(".uicore-text-leading").length.should.eq(1);
  });

  it("has correct text", () => {
    const wrapper = mount(<LeadingText>Test Content</LeadingText>);
    wrapper.find(".uicore-text-leading").text().should.equal("Test Content");
    wrapper.unmount();
  });
});
