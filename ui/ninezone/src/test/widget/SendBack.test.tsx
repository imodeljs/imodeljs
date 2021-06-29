/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import * as sinon from "sinon";
import { fireEvent, render } from "@testing-library/react";
import { createFloatingWidgetState, FloatingWidgetContext, NineZoneDispatch, NineZoneDispatchContext, SendBack } from "../../ui-ninezone";

describe("SendBack", () => {
  it("should render", () => {
    const { container } = render(
      <FloatingWidgetContext.Provider value={createFloatingWidgetState("w1")}>
        <SendBack />
      </FloatingWidgetContext.Provider>,
    );
    container.firstChild!.should.matchSnapshot();
  });

  it("should dispatch TOOL_SETTINGS_DOCK", () => {
    const dispatch = sinon.stub<NineZoneDispatch>();
    const { container } = render(
      <NineZoneDispatchContext.Provider value={dispatch}>
        <FloatingWidgetContext.Provider value={createFloatingWidgetState("w1")}>
          <SendBack />
        </FloatingWidgetContext.Provider>,
      </NineZoneDispatchContext.Provider>,
    );
    const button = container.getElementsByClassName("nz-widget-sendBack")[0];
    fireEvent.click(button);

    dispatch.calledWithExactly({
      type: "FLOATING_WIDGET_SEND_BACK",
      id: "w1",
    }).should.true;
  });
});
