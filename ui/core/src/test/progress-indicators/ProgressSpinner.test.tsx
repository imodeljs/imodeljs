/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { ProgressSpinner, SpinnerSize } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<ProgressSpinner />", () => {
  it("should render", () => {
    const wrapper = mount(
      <ProgressSpinner />,
    );
    wrapper.unmount();
  });

  it("renders correctly", () => {
    shallow(
      <ProgressSpinner />,
    ).should.matchSnapshot();
  });

  it("should render with value", () => {
    shallow(<ProgressSpinner value={50} />).should.matchSnapshot();
  });

  it("should render with displayed value", () => {
    shallow(<ProgressSpinner value={63}>63</ProgressSpinner>).should.matchSnapshot();
  });

  it("should render indeterminate", () => {
    shallow(<ProgressSpinner indeterminate />).should.matchSnapshot();
  });

  it("should render with success", () => {
    shallow(<ProgressSpinner success />).should.matchSnapshot();
  });

  it("should render with error", () => {
    shallow(<ProgressSpinner error />).should.matchSnapshot();
  });

  it("should render small", () => {
    shallow(<ProgressSpinner size={SpinnerSize.Small} />).should.matchSnapshot();
  });

  it("should render medium", () => {
    shallow(<ProgressSpinner size={SpinnerSize.Medium} />).should.matchSnapshot();
  });

  it("should render large", () => {
    shallow(<ProgressSpinner size={SpinnerSize.Large} />).should.matchSnapshot();
  });

  it("should render x-large", () => {
    shallow(<ProgressSpinner size={SpinnerSize.XLarge} />).should.matchSnapshot();
  });

  it("should render with style", () => {
    shallow(<ProgressSpinner style={{ width: "100px", height: "100px" }} />).should.matchSnapshot();
  });

});
