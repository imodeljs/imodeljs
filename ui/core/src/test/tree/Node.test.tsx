/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { mount, shallow } from "enzyme";
import * as React from "react";
import * as sinon from "sinon";
import { CheckBoxState } from "../../ui-core/enums/CheckBoxState";
import { ExpansionToggle } from "../../ui-core/tree/ExpansionToggle";
import { TreeNode as Node } from "../../ui-core";
import { Checkbox } from "@itwin/itwinui-react";

describe("<Node />", () => {
  it("should render", () => {
    mount(<Node label="a" level={0} />);
  });

  it("renders correctly", () => {
    shallow(<Node label="a" level={0} />).should.matchSnapshot();
  });

  it("should set is-focused class", () => {
    shallow(<Node label="a" level={0} isFocused />).should.matchSnapshot();
  });

  it("should set is-selected class", () => {
    shallow(<Node label="a" level={0} isSelected />).should.matchSnapshot();
  });

  it("should set is-hover-disabled class", () => {
    shallow(<Node label="a" level={0} isHoverDisabled />).should.matchSnapshot();
  });

  it("renders label correctly", () => {
    const label = (<span id="test">{"This is some test label"}</span>);
    shallow(<Node level={0} label={label} />).should.matchSnapshot();
  });

  it("renders icon correctly", () => {
    const icon = (<img src="testIcon" alt="Test" />);
    shallow(<Node label="a" level={0} icon={icon} />).should.matchSnapshot();
  });

  it("renders loader correctly", () => {
    shallow(<Node label="a" level={0} isLoading />).should.matchSnapshot();
  });

  it("renders expander correctly", () => {
    shallow(<Node label="a" level={0} isLeaf />).should.matchSnapshot();
    shallow(<Node label="a" level={0} isExpanded />).should.matchSnapshot();
    shallow(<Node label="a" level={0} isLeaf isExpanded />).should.matchSnapshot();
  });

  it("renders children correctly", () => {
    const wrapper = shallow(<Node label="a" level={0}><div className="unique" /></Node>);
    wrapper.find(".unique").should.have.lengthOf(1);
  });

  it("renders checkbox correctly", () => {
    const wrapper = mount(<Node label="a" level={0} checkboxProps={{ state: CheckBoxState.On }} />);
    wrapper.find(`input[type="checkbox"]`).should.have.lengthOf(1);
  });

  it("renders checkbox using render override if specified", () => {
    const ovr = sinon.stub().returns(<div className="custom-checkbox" />);
    const wrapper = mount(<Node label="a" level={0} checkboxProps={{ state: CheckBoxState.On }} renderOverrides={{ renderCheckbox: ovr }} />);
    ovr.should.be.calledOnce;
    wrapper.find(`div.custom-checkbox`).should.have.lengthOf(1);
  });

  it("should call onClick callback when node is clicked", () => {
    const callback = sinon.spy();
    const wrapper = mount(<Node label="a" level={0} onClick={callback} />);
    const content = wrapper.find("div.contents");
    content.simulate("click");
    expect(callback).to.be.calledOnce;
  });

  it("should call onClickExpansionToggle callback when expansion toggle is clicked", () => {
    const callback = sinon.spy();
    const wrapper = mount(<Node label="a" level={0} onClickExpansionToggle={callback} />);
    const expander = wrapper.find(ExpansionToggle);
    expander.simulate("click");
    expect(callback).to.be.calledOnce;
  });

  it("should not call onClick callback when expansion toggle is clicked", () => {
    const callback = sinon.spy();
    const wrapper = mount(<Node label="a" level={0} onClick={callback} />);
    const expander = wrapper.find(ExpansionToggle);
    expander.simulate("click");
    expect(callback).to.not.be.called;
  });

  it("should call checkboxProps.onClick callback when checkbox state changes with On", () => {
    const callback = sinon.spy();
    const wrapper = mount(<Node label="a" level={0} checkboxProps={{ onClick: callback, state: CheckBoxState.On }} />);
    const checkbox = wrapper.find(Checkbox).find("input");
    checkbox.simulate("change");
    expect(callback).to.be.calledOnceWith(CheckBoxState.On);
  });

  it("should call checkboxProps.onClick callback when checkbox state changes with Off", () => {
    const callback = sinon.spy();
    const wrapper = mount(<Node label="a" level={0} checkboxProps={{ onClick: callback, state: CheckBoxState.Off }} />);
    const checkbox = wrapper.find(Checkbox).find("input");
    checkbox.simulate("change");
    expect(callback).to.be.calledOnceWith(CheckBoxState.Off);
  });

  it("should not call checkboxProps.onClick callback when checkbox is disabled", () => {
    const callback = sinon.spy();
    const wrapper = mount(<Node label="a" level={0} checkboxProps={{ onClick: callback, isDisabled: true }} />);
    const checkbox = wrapper.find(Checkbox).find("input");
    checkbox.simulate("change");
    expect(callback).to.not.be.called;
  });

  it("should not call checkboxProps.onClick callback when checkbox is clicked", () => {
    const callback = sinon.spy();
    const wrapper = mount(<Node label="a" level={0} checkboxProps={{ onClick: callback }} />);
    const checkboxLabel = wrapper.find(Checkbox).find("label");
    checkboxLabel.simulate("click");
    expect(callback).to.not.be.called;
    const checkboxInput = wrapper.find(Checkbox).find("input");
    checkboxInput.simulate("click");
    expect(callback).to.not.be.called;
  });

  it("should safely handle click events with undefined handlers", () => {
    const wrapper = shallow(<Node label="a" level={0} />);
    wrapper.should.exist;

    const expander = wrapper.find(ExpansionToggle);
    expander.should.have.lengthOf(1);

    wrapper.simulate("click", new MouseEvent("click"));
    expander.simulate("click", new MouseEvent("click"));
  });

  it("sets data-testid", () => {
    const wrapper = shallow(<Node label="a" level={0} data-testid="test" />);
    const elementsWithDataTestId = wrapper.find("[data-testid]");
    const dataTestIds = elementsWithDataTestId.map((w) => w.prop("data-testid"));
    dataTestIds.length.should.eq(3);
    dataTestIds.indexOf("test").should.not.eq(-1);
    dataTestIds.indexOf("test-expansion-toggle").should.not.eq(-1);
    dataTestIds.indexOf("test-contents").should.not.eq(-1);
  });

  it("should call onContextMenu callback when node is right-clicked", () => {
    const callback = sinon.spy();
    const wrapper = mount(<Node label="a" level={0} onContextMenu={callback} />);
    const content = wrapper.find("div.contents");
    content.simulate("contextmenu");
    expect(callback).to.be.calledOnce;
  });

});
