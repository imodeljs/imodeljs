/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { Title } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<Title />", () => {
  it("should render", () => {
    mount(<Title />);
  });
  it("renders correctly", () => {
    shallow(<Title />).should.matchSnapshot();
  });

  it("content renders correctly", () => {
    shallow(<Title>Test content</Title>).should.matchSnapshot();
  });

  it("has correct className", () => {
    const wrapper = mount(<Title />);
    wrapper.find(".uicore-text-title").length.should.eq(1);
  });

  it("has correct text", () => {
    const wrapper = mount(<Title>Test Content</Title>);
    wrapper.find(".uicore-text-title").text().should.equal("Test Content");
    wrapper.unmount();
  });
});
