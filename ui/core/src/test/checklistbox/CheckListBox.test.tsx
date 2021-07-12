/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import * as sinon from "sinon";
import { CheckListBox, CheckListBoxItem, CheckListBoxSeparator } from "../../ui-core";

describe("<CheckListBox />", () => {
  it("should render", () => {
    const wrapper = mount(
      <CheckListBox>
        <CheckListBoxItem label="label" />
        <CheckListBoxSeparator />
      </CheckListBox>);
    wrapper.unmount();
  });

  it("renders correctly", () => {
    shallow(
      <CheckListBox>
        <CheckListBoxItem label="label" />
        <CheckListBoxSeparator />
      </CheckListBox>,
    ).should.matchSnapshot();
  });

  it("CheckListBoxItem should call onClick method", () => {
    const spyMethod = sinon.spy();

    const wrapper = mount(
      <CheckListBoxItem label="label" onClick={spyMethod} />,
    );

    const cb = wrapper.find("input");
    cb.length.should.eq(1);
    cb.simulate("click");
    spyMethod.calledOnce.should.true;

    wrapper.unmount();
  });

  it("CheckListBoxItem should call onChange method", () => {
    const spyMethod = sinon.spy();

    const wrapper = mount(
      <CheckListBoxItem label="label" checked={false} onChange={spyMethod} />,
    );

    const cb = wrapper.find("input");
    cb.length.should.eq(1);
    cb.simulate("change", { checked: true });
    spyMethod.calledOnce.should.true;

    wrapper.unmount();
  });

});
