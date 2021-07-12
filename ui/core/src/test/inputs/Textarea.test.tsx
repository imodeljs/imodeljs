/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";
import { Textarea } from "../../ui-core";
import { render } from "@testing-library/react";
import { expect } from "chai";

/* eslint-disable deprecation/deprecation */

describe("<Textarea />", () => {
  it("should render", () => {
    mount(<Textarea />);
  });

  it("renders correctly", () => {
    shallow(<Textarea />).should.matchSnapshot();
  });

  it("renders rows correctly", () => {
    shallow(<Textarea rows={30} />).should.matchSnapshot();
  });

  it("focus into textarea with setFocus prop", () => {
    const component = render(<Textarea setFocus={true} />);
    const textarea = component.container.querySelector("textarea");

    const element = document.activeElement as HTMLElement;
    expect(element && element === textarea).to.be.true;
  });

  it("input element is properly set", () => {
    const textElementRef = React.createRef<HTMLTextAreaElement>();
    const component = render(<Textarea setFocus={true} ref={textElementRef} />);
    const textNode = component.container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textNode).not.to.be.null;
    expect(textElementRef.current).not.to.be.null;
    expect(textNode).to.be.eq(textElementRef.current);
  });

});
