/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import { expect } from "chai";
import * as sinon from "sinon";
import * as React from "react";
import { SplitButton } from "../../ui-core";
import { RelativePosition, SpecialKey } from "@bentley/ui-abstract";
import { ButtonType } from "../../ui-core/button/Button";

/* eslint-disable deprecation/deprecation */

describe("<SplitButton />", () => {
  it("should render", () => {
    const wrapper = mount(<SplitButton label="test" />);
    wrapper.unmount();
  });

  it("renders correctly", () => {
    shallow(<SplitButton label="test" />).should.matchSnapshot();
  });

  it("renders with icon correctly", () => {
    shallow(<SplitButton label="test" icon="icon-placeholder" />).should.matchSnapshot();
  });

  it("renders with drawBorder correctly", () => {
    shallow(<SplitButton label="test" drawBorder />).should.matchSnapshot();
  });

  it("renders with popupPosition correctly", () => {
    shallow(<SplitButton label="test" popupPosition={RelativePosition.BottomLeft} />).should.matchSnapshot();
  });

  it("renders with buttonType=Blue correctly", () => {
    shallow(<SplitButton label="test" buttonType={ButtonType.Blue} />).should.matchSnapshot();        // eslint-disable-line deprecation/deprecation
  });
  it("renders with buttonType=Disabled correctly", () => {
    shallow(<SplitButton label="test" buttonType={ButtonType.Disabled} />).should.matchSnapshot();    // eslint-disable-line deprecation/deprecation
  });
  it("renders with buttonType=Hollow correctly", () => {
    shallow(<SplitButton label="test" buttonType={ButtonType.Hollow} />).should.matchSnapshot();      // eslint-disable-line deprecation/deprecation
  });
  it("renders with buttonType=Primary correctly", () => {
    shallow(<SplitButton label="test" buttonType={ButtonType.Primary} />).should.matchSnapshot();     // eslint-disable-line deprecation/deprecation
  });

  it("handles keydown/up correctly", () => {
    const wrapper = mount<SplitButton>(<SplitButton label="test" />);
    wrapper.find(".core-split-button").at(0).simulate("keyup", { key: SpecialKey.ArrowDown });
    expect(wrapper.state().expanded).to.be.true;

    wrapper.find(".core-split-button").at(0).simulate("keyup", { keyCode: 0 });
    wrapper.unmount();
  });

  it("calls onExecute on Enter keyup", () => {
    const spyMethod = sinon.spy();
    const wrapper = mount(<SplitButton label="test" onExecute={spyMethod} />);
    wrapper.find(".core-split-button").at(0).simulate("keyup", { key: SpecialKey.Enter });
    spyMethod.calledOnce.should.true;
    wrapper.unmount();
  });

  it("handles click on arrow correctly", () => {
    const wrapper = mount<SplitButton>(<SplitButton label="test" />);
    wrapper.find(".core-split-button-arrow").at(0).simulate("click");
    expect(wrapper.state().expanded).to.be.true;
    wrapper.find(".core-split-button-arrow").at(0).simulate("click");
    expect(wrapper.state().expanded).to.be.false;
    wrapper.unmount();
  });

  it("handles menu close correctly", () => {
    const wrapper = mount<SplitButton>(<SplitButton label="test" />);
    wrapper.find(".core-split-button-arrow").at(0).simulate("click");
    expect(wrapper.state().expanded).to.be.true;
    wrapper.find(".core-context-menu").at(0).simulate("click", { target: document.getElementsByClassName(".core-split-button-arrow")[0] });
    expect(wrapper.state().expanded).to.be.false;
    wrapper.unmount();
  });

  it("handles initialExpanded prop correctly", () => {
    const wrapper = mount<SplitButton>(<SplitButton label="test" initialExpanded={true} />);
    expect(wrapper.state().expanded).to.be.true;
    wrapper.unmount();
  });

});
