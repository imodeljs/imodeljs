/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { InputStatus, Radio } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<Radio />", () => {
  it("should render", () => {
    mount(<Radio label="radio test" />);
  });

  it("renders correctly", () => {
    shallow(<Radio label="radio test" />).should.matchSnapshot();
  });

  it("renders status correctly", () => {
    shallow(<Radio label="radio test" status={InputStatus.Success} />).should.matchSnapshot();
  });

  it("renders disabled correctly", () => {
    shallow(<Radio label="radio test" disabled />).should.matchSnapshot();
  });
});
