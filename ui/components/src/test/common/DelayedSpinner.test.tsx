/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as React from "react";
import { expect } from "chai";
import sinon from "sinon";
import { render } from "@testing-library/react";
import { DelayedSpinner } from "../../ui-components/common/DelayedSpinner";

describe("<DelayedSpinner />", () => {

  it("renders spinner without delay", () => {
    const { container } = render(<DelayedSpinner delay={0} />);
    const spinnerNode = container.querySelector(".iui-large");
    expect(spinnerNode).to.not.be.null;
  });

  it("renders spinner with delay", () => {
    const clock = sinon.useFakeTimers({ now: Date.now() });
    const delay = 100;
    const { container } = render(<DelayedSpinner delay={delay} />);
    expect(container.children.length).to.be.eq(0);
    expect(container.querySelector(".iui-large")).to.be.null;

    clock.tick(delay);

    expect(container.children.length).to.be.eq(1);
    expect(container.querySelector(".iui-large")).to.not.be.null;
    clock.restore();
  });

  it("renders spinner with specified size", () => {
    const { container } = render(<DelayedSpinner delay={0} size="small" />);
    const spinnerNode = container.querySelector(".iui-small");
    expect(spinnerNode).to.not.be.null;
  });

});
