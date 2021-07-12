/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { Gap } from "../../ui-core";

describe("<Gap />", () => {
  it("should render", () => {
    const wrapper = mount(<Gap />);
    wrapper.unmount();
  });

  it("renders correctly", () => {
    shallow(<Gap />).should.matchSnapshot();
  });

  it("renders correctly with size", () => {
    shallow(<Gap size="20px" />).should.matchSnapshot();
  });
});
