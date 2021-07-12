/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { shallow } from "enzyme";
import * as React from "react";
import { ProgressBar } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("ProgressBar", () => {
  it("renders correctly with percent=50", () => {
    shallow(<ProgressBar percent={50} />).should.matchSnapshot();
  });

  it("renders correctly with barHeight=8", () => {
    shallow(<ProgressBar percent={50} barHeight={8} />).should.matchSnapshot();
  });

  it("renders correctly with indeterminate", () => {
    shallow(<ProgressBar indeterminate />).should.matchSnapshot();
  });

  it("renders correctly with labelLeft", () => {
    shallow(<ProgressBar percent={25} labelLeft="Centered Label" />).should.matchSnapshot();
  });

  it("renders correctly with labelLeft & labelRight", () => {
    shallow(<ProgressBar percent={75} labelLeft="Loading..." labelRight="75%" />).should.matchSnapshot();
  });
});
