/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import { fireEvent, render } from "@testing-library/react";
import { Input } from "../../ui-core";
import * as sinon from "sinon";

/* eslint-disable deprecation/deprecation */

describe("<Input />", () => {
  it("renders", () => {
    const input = render(<Input />);

    expect(input.container.querySelector("input[type='text']")).not.to.be.null;
  });

  it("renders with 'numeric' type", () => {
    const input = render(<Input type="numeric" />);

    expect(input.container.querySelector("input[type='numeric']")).not.to.be.null;
  });

  it("focus into input with setFocus prop", () => {
    const component = render(<Input setFocus={true} />);
    const input = component.container.querySelector("input[type='text']");

    const element = document.activeElement as HTMLElement;
    expect(element && element === input).to.be.true;
  });

  it("native key handler passed by props is called", () => {
    const spyOnKeyboardEvent = sinon.spy();
    const spyOnSecondKeyboardEvent = sinon.spy();

    const component = render(<Input setFocus={true} nativeKeyHandler={spyOnKeyboardEvent} />);
    const inputNode = component.container.querySelector("input") as HTMLElement;
    expect(inputNode).not.to.be.null;
    fireEvent.keyDown(inputNode, { key: "Enter" });
    component.rerender(<Input setFocus={true} nativeKeyHandler={spyOnSecondKeyboardEvent} />);
    fireEvent.keyDown(inputNode, { key: "Enter" });
    expect(spyOnKeyboardEvent.calledOnce).to.be.true;
    expect(spyOnSecondKeyboardEvent.calledOnce).to.be.true;
  });

  it("input element is properly set", () => {
    const inputElementRef = React.createRef<HTMLInputElement>();
    const component = render(<Input setFocus={true} ref={inputElementRef} />);
    const inputNode = component.container.querySelector("input") as HTMLInputElement;
    expect(inputNode).not.to.be.null;
    fireEvent.keyDown(inputNode, { key: "Enter" });
    expect(inputElementRef.current).not.to.be.null;
    expect(inputNode).to.be.eq(inputElementRef.current);
  });

});
