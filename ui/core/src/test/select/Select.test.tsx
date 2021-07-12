/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { mount, shallow } from "enzyme";
import * as React from "react";
import { cleanup, render } from "@testing-library/react";
import { Select } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<Select />", () => {
  it("should render", () => {
    mount(<Select options={[]} />);
  });

  it("renders correctly", () => {
    shallow(<Select options={[]} />).should.matchSnapshot();
  });

  it("renders status correctly", () => {
    shallow(<Select options={[]} />).should.matchSnapshot();
  });

  it("renders defaultValue correctly", () => {
    shallow(<Select options={[]} defaultValue="test" />).should.matchSnapshot();
  });

  it("renders value correctly", () => {
    shallow(<Select options={[]} value="test" />).should.matchSnapshot();
  });

  it("renders placeholder correctly", () => {
    shallow(<Select options={[]} placeholder="test" />).should.matchSnapshot();
  });

  it("renders array options correctly", () => {
    shallow(<Select options={["Option 1", "Option 2", "Option 3"]} />).should.matchSnapshot();
  });

  it("renders SelectOption[] array options correctly", () => {
    shallow(<Select options={[{ label: "Option 1", value: "option1" }, { label: "Option 2", value: "option2" }, { label: "Option 3", value: "option3" }]} />).should.matchSnapshot();
  });

  it("renders array options with disabled correctly", () => {
    shallow(<Select options={[{ label: "Option 1", disabled: true }, "Option 2", "Option 3"]} />).should.matchSnapshot();
  });

  it("renders object options correctly", () => {
    shallow(<Select options={{ option1: "Option 1", option2: "Option 2", option3: "Option3" }} />).should.matchSnapshot();
  });

  it("renders object options with disabled correctly", () => {
    shallow(<Select options={{ option1: { label: "Option 1", disabled: true }, option2: "Option 2", option3: "Option3" }} />).should.matchSnapshot();
  });

  it("renders placeholder correctly when options are provided", () => {
    shallow(<Select options={{ option1: "Option 1", option2: "Option 2", option3: "Option3" }} placeholder="place-holder-text" />).should.matchSnapshot();
  });

  it("renders default value correctly when options are provided ", () => {
    shallow(<Select options={{ option1: "Option 1", option2: "Option 2", option3: "Option3" }} defaultValue="option2" />).should.matchSnapshot();
  });

  it("renders initial value correctly", () => {
    shallow(<Select options={{ option1: "Option 1", option2: "Option 2", option3: "Option3" }} value="option2" />).should.matchSnapshot();
  });
});

describe("<Select - React Testing Library />", () => {
  afterEach(cleanup);

  it("focus into select with setFocus prop", () => {
    const component = render(<Select options={[]} setFocus={true} />);
    const input = component.container.querySelector("select");

    const element = document.activeElement as HTMLElement;
    expect(element && element === input).to.be.true;
  });

  it("selects placeholder option correctly (uncontrolled)", () => {
    const component = render(<Select options={{ option1: "Option 1", option2: "Option 2", option3: "Option 3" }} placeholder="place-holder-text" />);
    const option = component.container.querySelector("option.placeholder") as HTMLOptionElement;
    expect(option).not.to.be.null;
    expect(option.hasAttribute("selected")).to.be.true;
  });

  it("selects defaultValue correctly (uncontrolled)", () => {
    const component = render(<Select options={{ option1: "Option 1", option2: "Option 2", option3: "Option 3" }} defaultValue="option2" />);
    const option = component.getByText("Option 2");
    expect(option).not.to.be.null;
    expect(option.hasAttribute("selected")).to.be.true;
  });

  it("selects defaultValue correctly even when placeholder text is provided (uncontrolled)", () => {
    const component = render(<Select options={{ option1: "Option 1", option2: "Option 2", option3: "Option 3" }} defaultValue="option3" placeholder="place-holder-text" />);
    const option = component.getByText("Option 3");
    expect(option).not.to.be.null;
    expect(option.hasAttribute("selected")).to.be.true;
  });

  it("renders initial value correctly (controlled)", () => {
    const component = render(<Select options={{ option1: "Option 1", option2: "Option 2", option3: "Option 3" }} value="option2" onChange={() => { }} />);
    const select = component.container.querySelector("select") as HTMLSelectElement;
    expect(select).not.to.be.null;
    expect(select.value).to.be.eq("option2");
    component.rerender(<Select options={{ option1: "Option 1", option2: "Option 2", option3: "Option 3" }} value="option3" onChange={() => { }} />);
    const select2 = component.container.querySelector("select") as HTMLSelectElement;
    expect(select2).not.to.be.null;
    expect(select2.value).to.be.eq("option3");
  });

  it("renders initial value correctly (controlled)", () => {
    const options = [
      { label: "Option 0", value: 0 },
      { label: "Option 1", value: 1 },
      { label: "Option 2", value: 2 },
      { label: "Option 3", value: 3 },
    ];
    const component = render(<Select options={options} value={2} onChange={() => { }} />);
    const select = component.container.querySelector("select") as HTMLSelectElement;
    expect(select).not.to.be.null;
    expect(select.value).to.be.eq("2");
    component.rerender(<Select options={options} value={0} onChange={() => { }} />);
    const select2 = component.container.querySelector("select") as HTMLSelectElement;
    expect(select2).not.to.be.null;
    expect(select2.value).to.be.eq("0");
  });

  it("renders value correctly overrides placeholder value when not null (controlled)", () => {
    // select value = "option2"
    const component = render(<Select options={{ option1: "Option 1", option2: "Option 2", option3: "Option 3" }} value="option2" placeholder="select value" onChange={() => { }} />);
    const select = component.container.querySelector("select") as HTMLSelectElement;
    expect(select).not.to.be.null;
    expect(select.value).to.be.eq("option2");
    // select value = "option3"
    component.rerender(<Select options={{ option1: "Option 1", option2: "Option 2", option3: "Option 3" }} value="option3" placeholder="select value" onChange={() => { }} />);
    expect(select.value).to.be.eq("option3");
    // revert to showing placeholder
    component.rerender(<Select options={{ option1: "Option 1", option2: "Option 2", option3: "Option 3" }} value={undefined} placeholder="select value" onChange={() => { }} />);
    expect(select.value).to.be.eq("placeholder");
  });

});
