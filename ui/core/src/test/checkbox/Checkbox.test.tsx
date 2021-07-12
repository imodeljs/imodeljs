/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { mount } from "enzyme";
import * as React from "react";
import * as sinon from "sinon";
import { fireEvent, render } from "@testing-library/react";
import { Checkbox } from "../../ui-core/checkbox/Checkbox";
import { InputStatus } from "../../ui-core/inputs/InputStatus";

/* eslint-disable deprecation/deprecation */

describe("Checkbox", () => {
  it("renders", () => {
    const checkbox = render(<Checkbox />);

    expect(checkbox.container.querySelector("input[type='checkbox']")).not.to.be.null;
  });

  it("renders with inputRef", () => {
    const inputRef = React.createRef<HTMLInputElement>();
    const checkbox = render(<Checkbox inputRef={inputRef} />);

    expect(checkbox.container.querySelector("input[type='checkbox']")).not.to.be.null;
    expect(inputRef.current).not.to.be.undefined;
  });

  it("renders with id", () => {
    const checkbox = render(<Checkbox id="test" />);

    expect(checkbox.container.querySelector("#test")).not.to.be.null;
  });

  it("renders with label", () => {
    const checkbox = render(<Checkbox label="Test checkbox" />);

    expect(checkbox.getByText("Test checkbox")).not.to.be.null;
  });

  it("renders input status when it's provided", () => {
    const checkbox = render(<Checkbox label="Test checkbox" status={InputStatus.Error} />);

    expect(checkbox.container.querySelector(`.${InputStatus.Error}`)).to.not.be.null;
  });

  it("renders properly as disabled", () => {
    const checkbox = render(<Checkbox label="Test checkbox" disabled={true} />);

    expect((checkbox.container.childNodes[0] as HTMLElement).querySelector("[disabled]"), "Checkbox tag did not get set to 'disabled'").to.not.be.null;

    checkbox.rerender(<Checkbox label="Test checkbox" disabled={false} />);
    expect((checkbox.container.childNodes[0] as HTMLElement).querySelector("[disabled]"), "Checkbox tag did get set to 'disabled'").to.be.null;
  });

  it("renders properly as indeterminate", () => {
    const component = render(<Checkbox label="Test checkbox" indeterminate={false} />);
    let checkbox = component.container.querySelector("input[type='checkbox']");
    expect(checkbox).not.to.be.null;
    expect((checkbox as HTMLInputElement).indeterminate).to.be.false;

    component.rerender(<Checkbox label="Test checkbox" indeterminate={true} />);
    checkbox = component.container.querySelector("input[type='checkbox']");
    expect(checkbox).not.to.be.null;
    expect((checkbox as HTMLInputElement).indeterminate).to.be.true;
  });

  it("allows stopping click propagation", () => {
    const outsideClickSpy = sinon.spy();
    const keyboardSpy = sinon.spy();
    const checkboxClickSpy = sinon.fake((e: React.MouseEvent) => e.stopPropagation());
    const changeSpy = sinon.spy();
    const result = render(
      <div role="presentation" onClick={outsideClickSpy} onKeyUp={keyboardSpy}>
        <Checkbox label="Test checkbox" onClick={checkboxClickSpy} onChange={changeSpy} />
      </div>,
    );
    const divElement = result.container.childNodes[0] as HTMLDivElement;
    fireEvent.click(divElement.childNodes[0] as HTMLElement);
    expect(checkboxClickSpy).to.be.calledOnce;
    expect(changeSpy).to.be.calledOnce;
    expect(outsideClickSpy).to.not.be.called;
  });

  it("focus into checkbox with setFocus prop", () => {
    const checkbox = render(<Checkbox label="Test checkbox" setFocus={true} />);
    const input = checkbox.container.querySelector("input[type='checkbox']");

    const element = document.activeElement as HTMLElement;
    expect(element && element === input).to.be.true;
  });

  it("Checkbox should call onBlur handler", () => {
    const spyMethod = sinon.spy();

    const wrapper = mount(
      // add dummy onChange method that is require when specifying a checked value
      <Checkbox checked={false} onChange={() => { }} onBlur={spyMethod} />,
    );

    const input = wrapper.find("input");
    input.length.should.eq(1);

    input.simulate("blur");
    spyMethod.calledOnce.should.false;

    const label = wrapper.find("label");
    label.length.should.eq(1);

    label.simulate("blur");
    spyMethod.calledOnce.should.true;

    wrapper.unmount();
  });

});
