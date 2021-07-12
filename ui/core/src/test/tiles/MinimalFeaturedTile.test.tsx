/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { MinimalFeaturedTile } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<MinimalFeaturedTile />", () => {
  const icon = <i className="icon icon-placeholder" />;

  it("should render", () => {
    mount(<MinimalFeaturedTile title="Test" icon={icon} />);
  });

  it("renders correctly", () => {
    shallow(<MinimalFeaturedTile title="Test" icon={icon} />).should.matchSnapshot();
  });

  it("has correct className", () => {
    const wrapper = mount(<MinimalFeaturedTile title="Test" icon={icon} />);
    wrapper.find(".uicore-featured").length.should.eq(1);
    wrapper.find(".uicore-minimal").length.should.eq(1);
  });
});
