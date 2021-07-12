/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { mount, shallow } from "enzyme";
import * as React from "react";
import * as sinon from "sinon";
import { render } from "@testing-library/react";
import { Toggle, ToggleButtonType } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<Toggle />", () => {
  it("should render", () => {
    const wrapper = mount(
      <Toggle />,
    );

    let label = wrapper.find("label.core-toggle");
    label.length.should.eq(1);
    label = wrapper.find("label.core-toggle.core-toggle-rounded");
    label.length.should.eq(1);

    wrapper.unmount();
  });

  it("renders correctly", () => {
    shallow(
      <Toggle />,
    ).should.matchSnapshot();
  });

  it("renders large correctly", () => {
    shallow(<Toggle large={true} />).should.matchSnapshot();
  });

  it("Toggle should call onChange handler", () => {
    const fakeTimers = sinon.useFakeTimers();
    const spyMethod = sinon.spy();
    let checked = false;
    const handleChange = (_checked: boolean) => {
      checked = _checked;
      spyMethod();
    };

    const wrapper = mount(
      <Toggle isOn={false} onChange={handleChange} />,
    );

    const input = wrapper.find("input.core-toggle-input");
    input.length.should.eq(1);

    input.simulate("change", { checked: true });
    wrapper.update();

    let toggling = wrapper.find(".core-toggling");
    toggling.length.should.not.eq(0);

    spyMethod.calledOnce.should.true;
    expect(checked).to.be.true;

    fakeTimers.tick(1000);
    fakeTimers.restore();
    wrapper.update();
    toggling = wrapper.find(".core-toggling");
    toggling.length.should.eq(0);

    wrapper.unmount();
  });

  it("Toggle should call onBlur handler", () => {
    const spyMethod = sinon.spy();

    const wrapper = mount(
      <Toggle isOn={false} onBlur={spyMethod} />,
    );

    const input = wrapper.find("input.core-toggle-input");
    input.length.should.eq(1);

    input.simulate("blur");
    spyMethod.calledOnce.should.false;

    const label = wrapper.find("label.core-toggle");
    label.length.should.eq(1);

    label.simulate("blur");
    spyMethod.calledOnce.should.true;

    wrapper.unmount();
  });

  it("Toggle should update on props.isOn change", () => {
    const spyMethod = sinon.spy();
    const handleChange = (_checked: boolean) => {
      spyMethod();
    };

    const component = render(<Toggle isOn={false} onChange={handleChange} />);
    let input = component.container.querySelector("input[type='checkbox']");
    expect((input as HTMLInputElement).checked).to.be.false;

    component.rerender(<Toggle isOn={true} onChange={handleChange} />);
    input = component.container.querySelector("input[type='checkbox']");
    expect((input as HTMLInputElement).checked).to.be.true;

    component.rerender(<Toggle isOn={false} onChange={handleChange} />);
    input = component.container.querySelector("input[type='checkbox']");
    expect((input as HTMLInputElement).checked).to.be.false;
  });

  it("Toggle should update on props.disabled change", () => {
    const spyMethod = sinon.spy();
    const handleChange = (_checked: boolean) => {
      spyMethod();
    };

    const wrapper = mount(
      // eslint-disable-next-line deprecation/deprecation
      <Toggle isOn={false} onChange={handleChange} disabled={false} buttonType={ToggleButtonType.Primary} showCheckmark={true} rounded={false} />,
    );

    wrapper.setProps({ disabled: true });
    wrapper.update();

    const input = wrapper.find("input.core-toggle-input");
    input.length.should.eq(1);
    input.getDOMNode().hasAttribute("disabled").should.true;
    const label = wrapper.find("label.core-toggle.uicore-disabled");
    label.length.should.eq(1);

    wrapper.unmount();
  });

  it("focus into input with setFocus prop", () => {
    const component = render(<Toggle setFocus={true} />);
    const input = component.container.querySelector("input[type='checkbox']");

    const element = document.activeElement as HTMLElement;
    expect(element && element === input).to.be.true;
  });

});
