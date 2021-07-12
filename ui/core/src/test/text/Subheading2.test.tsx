/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { Subheading2 } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<Subheading2 />", () => {
  it("should render", () => {
    mount(<Subheading2 />);
  });
  it("renders correctly", () => {
    shallow(<Subheading2 />).should.matchSnapshot();
  });

  it("content renders correctly", () => {
    shallow(<Subheading2>Test content</Subheading2>).should.matchSnapshot();
  });

  it("has correct className", () => {
    const wrapper = mount(<Subheading2 />);
    wrapper.find(".uicore-text-subheading-2").length.should.eq(1);
  });

  it("has correct text", () => {
    const wrapper = mount(<Subheading2>Test Content</Subheading2>);
    wrapper.find(".uicore-text-subheading-2").text().should.equal("Test Content");
    wrapper.unmount();
  });
});
