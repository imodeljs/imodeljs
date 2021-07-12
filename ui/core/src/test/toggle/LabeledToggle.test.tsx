/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { LabeledToggle } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<LabeledToggle />", () => {
  it("should render", () => {
    mount(<LabeledToggle label="toggle test" />);
  });

  it("renders correctly", () => {
    shallow(<LabeledToggle label="toggle test" />).should.matchSnapshot();
  });

  it("renders disabled correctly", () => {
    shallow(<LabeledToggle label="toggle test" disabled />).should.matchSnapshot();
  });
});
