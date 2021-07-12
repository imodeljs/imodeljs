/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { LeadingText2 } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<LeadingText2 />", () => {
  it("should render", () => {
    mount(<LeadingText2 />);
  });
  it("renders correctly", () => {
    shallow(<LeadingText2 />).should.matchSnapshot();
  });

  it("content renders correctly", () => {
    shallow(<LeadingText2>Test content</LeadingText2>).should.matchSnapshot();
  });

  it("has correct className", () => {
    const wrapper = mount(<LeadingText2 />);
    wrapper.find(".uicore-text-leading-2").length.should.eq(1);
  });

  it("has correct text", () => {
    const wrapper = mount(<LeadingText2>Test Content</LeadingText2>);
    wrapper.find(".uicore-text-leading-2").text().should.equal("Test Content");
    wrapper.unmount();
  });
});
