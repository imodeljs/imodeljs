/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { LoadingSpinner } from "../../ui-core";
import { SpinnerSize } from "../../ui-core/loading/Spinner";

/* eslint-disable deprecation/deprecation */

describe("<LoadingSpinner />", () => {
  it("should render", () => {
    const wrapper = mount(
      <LoadingSpinner />,
    );
    wrapper.unmount();
  });

  it("renders correctly", () => {
    shallow(
      <LoadingSpinner />,
    ).should.matchSnapshot();
  });

  it("renders with message correctly", () => {
    shallow(<LoadingSpinner message="test" />).should.matchSnapshot();
  });

  it("renders with message and position correctly", () => {
    shallow(<LoadingSpinner message="test" messageOnTop={true} />).should.matchSnapshot();
  });

  // Tests for Deprecated SpinnerSize
  it("renders with Small size correctly", () => {
    shallow(<LoadingSpinner size={SpinnerSize.Small} />).should.matchSnapshot();
  });
  it("renders with Medium size correctly", () => {
    shallow(<LoadingSpinner size={SpinnerSize.Medium} />).should.matchSnapshot();
  });
  it("renders with Large size correctly", () => {
    shallow(<LoadingSpinner size={SpinnerSize.Large} />).should.matchSnapshot();
  });
  it("renders with XLarge size correctly", () => {
    shallow(<LoadingSpinner size={SpinnerSize.XLarge} />).should.matchSnapshot();
  });

});
