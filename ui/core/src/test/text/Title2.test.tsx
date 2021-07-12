/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { Title2 } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<Title2 />", () => {
  it("should render", () => {
    mount(<Title2 />);
  });
  it("renders correctly", () => {
    shallow(<Title2 />).should.matchSnapshot();
  });

  it("content renders correctly", () => {
    shallow(<Title2>Test content</Title2>).should.matchSnapshot();
  });

  it("has correct className", () => {
    const wrapper = mount(<Title2 />);
    wrapper.find(".uicore-text-title-2").length.should.eq(1);
  });

  it("has correct text", () => {
    const wrapper = mount(<Title2>Test Content</Title2>);
    wrapper.find(".uicore-text-title-2").text().should.equal("Test Content");
    wrapper.unmount();
  });
});
