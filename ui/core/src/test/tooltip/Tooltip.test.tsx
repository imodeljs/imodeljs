/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { fireEvent, render } from "@testing-library/react";
import { RelativePosition } from "@bentley/ui-abstract";
import { placementToPosition, Tooltip } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<Tooltip />", () => {
  it("should not render", () => {
    const target = document.createElement("div");
    const { queryByTestId } = render(<Tooltip
      target={target}
    />);
    (queryByTestId("core-popup") === null).should.true;
  });

  it("should open on mouseenter", () => {
    const target = document.createElement("div");
    const { getByTestId } = render(<Tooltip
      target={target}
    />);
    fireEvent(target, new MouseEvent("mouseenter"));
    getByTestId("core-popup").should.exist;
  });

  it("should close on mouseleave", () => {
    const target = document.createElement("div");
    const { queryByTestId } = render(<Tooltip
      target={target}
    />);
    fireEvent(target, new MouseEvent("mouseenter"));
    fireEvent(target, new MouseEvent("mouseleave"));
    (queryByTestId("core-popup") === null).should.true;
  });

  it("renders visible correctly", () => {
    const target = document.createElement("div");
    const { getByTestId } = render(<Tooltip
      visible
      target={target}
    />);
    getByTestId("core-popup").should.exist;
  });
});

describe("placementToPosition", () => {
  it("undefined", () => {
    placementToPosition(undefined).should.eq(RelativePosition.Top);
  });

  it("bottom", () => {
    placementToPosition("bottom").should.eq(RelativePosition.Bottom);
  });

  it("left", () => {
    placementToPosition("left").should.eq(RelativePosition.Left);
  });

  it("right", () => {
    placementToPosition("right").should.eq(RelativePosition.Right);
  });

  it("top", () => {
    placementToPosition("top").should.eq(RelativePosition.Top);
  });
});
