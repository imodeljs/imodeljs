/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { InputStatus, LabeledSelect } from "../../ui-core";

/* eslint-disable deprecation/deprecation */

describe("<LabeledSelect />", () => {
  it("should render", () => {
    mount(<LabeledSelect label="select test" options={[]} />);
  });

  it("renders correctly", () => {
    shallow(<LabeledSelect label="select test" options={[]} />).should.matchSnapshot();
  });

  it("renders disabled correctly", () => {
    shallow(<LabeledSelect label="select test" disabled options={[]} />).should.matchSnapshot();
  });

  it("renders status correctly", () => {
    shallow(<LabeledSelect label="select test" status={InputStatus.Success} options={[]} />).should.matchSnapshot();
  });

  it("renders message correctly", () => {
    shallow(<LabeledSelect label="select test" message={"Test message"} options={[]} />).should.matchSnapshot();
  });

  it("renders array options correctly", () => {
    shallow(<LabeledSelect label="select test" options={["Option 1", "Option 2", "Option 3"]} />).should.matchSnapshot();
  });

  it("renders object options correctly", () => {
    shallow(<LabeledSelect label="select test" options={{ option1: "Option 1", option2: "Option 2", option3: "Option3" }} />).should.matchSnapshot();
  });
});
