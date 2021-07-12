/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { Subheading } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<Subheading />", () => {
  it("should render", () => {
    mount(<Subheading />);
  });
  it("renders correctly", () => {
    shallow(<Subheading />).should.matchSnapshot();
  });

  it("content renders correctly", () => {
    shallow(<Subheading>Test content</Subheading>).should.matchSnapshot();
  });

  it("has correct className", () => {
    const wrapper = mount(<Subheading />);
    wrapper.find(".uicore-text-subheading").length.should.eq(1);
  });

  it("has correct text", () => {
    const wrapper = mount(<Subheading>Test Content</Subheading>);
    wrapper.find(".uicore-text-subheading").text().should.equal("Test Content");
    wrapper.unmount();
  });
});
