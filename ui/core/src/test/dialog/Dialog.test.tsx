/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import * as sinon from "sinon";
import { cleanup, render } from "@testing-library/react";
import { Dialog } from "../../ui-core";
import { DialogAlignment } from "../../ui-core/dialog/Dialog";
import { GlobalDialog } from "../../ui-core/dialog/GlobalDialog";
import { UiCore } from "../../ui-core/UiCore";
import TestUtils from "../TestUtils";
import { DialogButtonType } from "@bentley/ui-abstract";

describe("Dialog", () => {

  afterEach(cleanup);

  const createBubbledEvent = (type: string, props = {}) => {
    return TestUtils.createBubbledEvent(type, props);
  };

  before(async () => {
    await TestUtils.initializeUiCore();
  });

  describe("<GlobalDialog />", () => {
    it("should render with identifier", () => {
      render(<GlobalDialog opened={true} identifier="test" />);
    });
    it("should render", () => {
      render(<GlobalDialog opened={true} />);
    });
    it("should render multiple in same global container", () => {
      render(<GlobalDialog opened={true} />);
      render(<GlobalDialog opened={true} />);
    });
  });

  describe("renders", () => {
    it("should render", () => {
      render(<Dialog opened={true} />);
    });
    it("should render with titleStyle", () => {
      const component = render(<Dialog opened={true} title="Test" titleStyle={{ fontWeight: "bold" }} />);
      const container = component.getByTestId("core-dialog-title");
      expect(container.style.fontWeight).to.equal("bold");
    });
    it("should render with trapFocus", () => {
      const component = render(<Dialog opened={true} trapFocus={true} modal={true} />);
      expect(component.getByTestId("focus-trap-div")).to.exist; /* Not a sufficient test - should test 'active' prop, but RTL doesn't support it */
    });
  });

  describe("buttons", () => {
    it("should render with OK & Cancel buttons", () => {
      const component = render(<Dialog opened={true}
        buttonCluster={[
          { type: DialogButtonType.OK, onClick: () => { } },
          { type: DialogButtonType.Cancel, onClick: () => { } },
        ]} />);
      expect(component.getByText(UiCore.translate("dialog.ok"))).to.exist;
      expect(component.getByText(UiCore.translate("dialog.cancel"))).to.exist;
    });

    it("should render with Close button", () => {
      const component = render(<Dialog opened={true}
        buttonCluster={[
          { type: DialogButtonType.Close, onClick: () => { } },
        ]} />);
      expect(component.getByText(UiCore.translate("dialog.close"))).to.exist;
    });

    it("should render with Yes, No & Retry buttons", () => {
      const component = render(<Dialog opened={true}
        buttonCluster={[
          { type: DialogButtonType.Yes, onClick: () => { } },
          { type: DialogButtonType.No, onClick: () => { } },
          { type: DialogButtonType.Retry, onClick: () => { } },
          { type: DialogButtonType.Next, onClick: () => { } },
          { type: DialogButtonType.Previous, onClick: () => { } },
        ]} />);
      expect(component.getByText(UiCore.translate("dialog.yes"))).to.exist;
      expect(component.getByText(UiCore.translate("dialog.no"))).to.exist;
      expect(component.getByText(UiCore.translate("dialog.retry"))).to.exist;
      expect(component.getByText(UiCore.translate("dialog.next"))).to.exist;
      expect(component.getByText(UiCore.translate("dialog.previous"))).to.exist;
    });

    it("should render with custom button", () => {
      const component = render(<Dialog opened={true}
        buttonCluster={[
          { type: DialogButtonType.Close, onClick: () => { }, label: "XYZ" },
        ]} />);
      expect(component.getByText("XYZ")).to.exist;
    });
  });

  describe("movable and resizable", () => {
    it("should render with movable", () => {
      render(<Dialog opened={true} movable={true} />);
    });
    it("should move from pointer events", () => {
      const component = render(<Dialog opened={true} movable={true} height={400} width={400} />);
      const head = component.getByTestId("core-dialog-head");
      head.dispatchEvent(createBubbledEvent("pointerdown", { clientX: 200, clientY: 5 }));
      head.dispatchEvent(createBubbledEvent("pointermove", { clientX: 300, clientY: 50 }));
      head.dispatchEvent(createBubbledEvent("pointerup", { clientX: 300, clientY: 50 }));
      const container = component.getByTestId("core-dialog-container");
      expect(container.style.left).to.equal("100px");
      expect(container.style.top).to.equal("45px");
    });
    it("should not move from pointer events when movable is false", () => {
      const component = render(<Dialog opened={true} movable={false} height={400} width={400} />);
      const head = component.getByTestId("core-dialog-head");
      head.dispatchEvent(createBubbledEvent("pointerdown", { clientX: 200, clientY: 5 }));
      head.dispatchEvent(createBubbledEvent("pointermove", { clientX: 250, clientY: 25 }));
      head.dispatchEvent(createBubbledEvent("pointermove", { clientX: 300, clientY: 50 }));
      head.dispatchEvent(createBubbledEvent("pointerup", { clientX: 300, clientY: 50 }));
      const container = component.getByTestId("core-dialog-container");
      expect(container.style.left).to.equal("");
      expect(container.style.top).to.equal("");
    });
    it("should render with resizable", () => {
      render(<Dialog opened={true} resizable={true} />);
    });
    it("should render with string min/max sizes", () => {
      render(<Dialog opened={true} minHeight={"25%"} minWidth={"25%"} maxWidth={"75%"} maxHeight={"75%"} />);
    });
    it("should not resize from pointer events on bottom right when resizable={false}", () => {
      const component = render(<Dialog opened={true} resizable={false} height={400} width={400} minHeight={200} minWidth={200} />);
      const bottomRightDragHandle = component.getByTestId("core-dialog-drag-bottom-right");
      bottomRightDragHandle.dispatchEvent(createBubbledEvent("pointerdown", { clientX: 400, clientY: 400 }));
      window.dispatchEvent(createBubbledEvent("pointermove", { clientX: 200, clientY: 200 }));
      window.dispatchEvent(createBubbledEvent("pointerup", { clientX: 200, clientY: 200 }));
      const container = component.getByTestId("core-dialog-container");
      expect(container.style.height).to.equal("400px");
      expect(container.style.width).to.equal("400px");
    });
    it("should resize from pointer events on bottom right", () => {
      const component = render(<Dialog opened={true} resizable={true} height={400} width={400} minHeight={200} minWidth={200} />);
      const bottomRightDragHandle = component.getByTestId("core-dialog-drag-bottom-right");
      bottomRightDragHandle.dispatchEvent(createBubbledEvent("pointerdown", { clientX: 400, clientY: 400 }));
      window.dispatchEvent(createBubbledEvent("pointermove", { clientX: 200, clientY: 200 }));
      window.dispatchEvent(createBubbledEvent("pointerup", { clientX: 200, clientY: 200 }));
      const container = component.getByTestId("core-dialog-container");
      expect(container.style.height).to.equal("200px");
      expect(container.style.width).to.equal("200px");
    });
    it("should resize relative to top right corner from pointer events on bottom right when both resizable and movable", () => {
      const component = render(<Dialog opened={true} resizable={true} movable={true} height={400} width={400} minHeight={200} minWidth={200} />);
      const bottomRightDragHandle = component.getByTestId("core-dialog-drag-bottom-right");
      bottomRightDragHandle.dispatchEvent(createBubbledEvent("pointerdown", { clientX: 400, clientY: 400 }));
      window.dispatchEvent(createBubbledEvent("pointermove", { clientX: 200, clientY: 200 }));
      window.dispatchEvent(createBubbledEvent("pointerup", { clientX: 200, clientY: 200 }));
      const container = component.getByTestId("core-dialog-container");
      expect(container.style.height).to.equal("200px");
      expect(container.style.width).to.equal("200px");
    });
    it("should resize to minWidth and minHeight", () => {
      const component = render(<Dialog opened={true} resizable={true} height={400} width={400} minHeight={200} minWidth={200} />);
      const bottomRightDragHandle = component.getByTestId("core-dialog-drag-bottom-right");
      bottomRightDragHandle.dispatchEvent(createBubbledEvent("pointerdown", { clientX: 400, clientY: 400 }));
      window.dispatchEvent(createBubbledEvent("pointermove", { clientX: 100, clientY: 100 }));
      window.dispatchEvent(createBubbledEvent("pointerup", { clientX: 100, clientY: 100 }));
      const container = component.getByTestId("core-dialog-container");
      expect(container.style.height).to.equal("200px");
      expect(container.style.width).to.equal("200px");
    });
    it("should resize to maxWidth and maxHeight when defined", () => {
      const component = render(<Dialog opened={true} resizable={true} height={300} width={300} maxWidth={350} maxHeight={350} />);
      const bottomRightDragHandle = component.getByTestId("core-dialog-drag-bottom-right");
      bottomRightDragHandle.dispatchEvent(createBubbledEvent("pointerdown", { clientX: 300, clientY: 300 }));
      window.dispatchEvent(createBubbledEvent("pointermove", { clientX: 400, clientY: 400 }));
      window.dispatchEvent(createBubbledEvent("pointerup", { clientX: 400, clientY: 400 }));
      const container = component.getByTestId("core-dialog-container");
      expect(container.style.height).to.equal("350px");
      expect(container.style.width).to.equal("350px");
    });
    it("should resize from pointer events on bottom", () => {
      const component = render(<Dialog opened={true} resizable={true} height={400} width={400} minHeight={100} minWidth={100} />);
      const bottomRightDragHandle = component.getByTestId("core-dialog-drag-bottom");
      bottomRightDragHandle.dispatchEvent(createBubbledEvent("pointerdown", { clientX: 400, clientY: 400 }));
      window.dispatchEvent(createBubbledEvent("pointermove", { clientX: 405, clientY: 200 }));
      window.dispatchEvent(createBubbledEvent("pointerup", { clientX: 405, clientY: 200 }));
    });
    it("should resize from pointer events on right", () => {
      const component = render(<Dialog opened={true} resizable={true} height={400} width={400} minHeight={100} minWidth={100} />);
      const bottomRightDragHandle = component.getByTestId("core-dialog-drag-right");
      bottomRightDragHandle.dispatchEvent(createBubbledEvent("pointerdown", { clientX: 400, clientY: 400 }));
      window.dispatchEvent(createBubbledEvent("pointermove", { clientX: 200, clientY: 405 }));
      window.dispatchEvent(createBubbledEvent("pointerup", { clientX: 200, clientY: 405 }));
    });
  });

  describe("keyboard support", () => {
    it("should close on Esc key", () => {
      const spyOnEscape = sinon.spy();
      const component = render(<Dialog opened={true} onEscape={spyOnEscape} />);

      component.baseElement.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape" }));
      expect(spyOnEscape).to.be.calledOnce;
    });
    it("should not respond to other keyboard input", () => {
      const spyOnEscape = sinon.spy();
      const component = render(<Dialog opened={true} onEscape={spyOnEscape} />);

      component.baseElement.dispatchEvent(new KeyboardEvent("keyup"));
      expect(spyOnEscape).to.not.be.called;
    });
  });

  describe("modeless support", () => {
    it("should call handler for pointerDown", () => {
      const spyOnPointerDown = sinon.spy();
      const component = render(<Dialog opened={true} modal={false} onModelessPointerDown={spyOnPointerDown} modelessId="Test1" />);
      const head = component.getByTestId("core-dialog-head");
      head.dispatchEvent(createBubbledEvent("pointerdown", { clientX: 200, clientY: 5 }));
      expect(spyOnPointerDown).to.be.calledOnce;
    });
    it("should not call handler for pointerDown if no modelessId", () => {
      const spyOnPointerDown = sinon.spy();
      const component = render(<Dialog opened={true} modal={false} onModelessPointerDown={spyOnPointerDown} />);
      const head = component.getByTestId("core-dialog-head");
      head.dispatchEvent(createBubbledEvent("pointerdown", { clientX: 200, clientY: 5 }));
      expect(spyOnPointerDown).to.not.be.called;
    });
  });

  describe("alignment", () => {
    it("should render center by default", () => {
      const component = render(<Dialog opened={true} />);
      expect(component.container.querySelector(".core-dialog-center")).not.to.be.null;
    });
    it("should render top left", () => {
      const component = render(<Dialog opened={true} alignment={DialogAlignment.TopLeft} />);
      expect(component.container.querySelector(".core-dialog-top-left")).not.to.be.null;
    });
    it("should render top", () => {
      const component = render(<Dialog opened={true} alignment={DialogAlignment.Top} />);
      expect(component.container.querySelector(".core-dialog-top")).not.to.be.null;
    });
    it("should render top right", () => {
      const component = render(<Dialog opened={true} alignment={DialogAlignment.TopRight} />);
      expect(component.container.querySelector(".core-dialog-top-right")).not.to.be.null;
    });
    it("should render left", () => {
      const component = render(<Dialog opened={true} alignment={DialogAlignment.Left} />);
      expect(component.container.querySelector(".core-dialog-left")).not.to.be.null;
    });
    it("should render center", () => {
      const component = render(<Dialog opened={true} alignment={DialogAlignment.Center} />);
      expect(component.container.querySelector(".core-dialog-center")).not.to.be.null;
    });
    it("should render right", () => {
      const component = render(<Dialog opened={true} alignment={DialogAlignment.Right} />);
      expect(component.container.querySelector(".core-dialog-right")).not.to.be.null;
    });
    it("should render bottom left", () => {
      const component = render(<Dialog opened={true} alignment={DialogAlignment.BottomLeft} />);
      expect(component.container.querySelector(".core-dialog-bottom-left")).not.to.be.null;
    });
    it("should render bottom", () => {
      const component = render(<Dialog opened={true} alignment={DialogAlignment.Bottom} />);
      expect(component.container.querySelector(".core-dialog-bottom")).not.to.be.null;
    });
    it("should render bottom right", () => {
      const component = render(<Dialog opened={true} alignment={DialogAlignment.BottomRight} />);
      expect(component.container.querySelector(".core-dialog-bottom-right")).not.to.be.null;
    });
  });

  describe("header", () => {
    it("should render without header", () => {
      const component = render(<Dialog opened={true} hideHeader={true} />);
      expect(component.container.querySelector(".core-dialog-head")).to.be.null;
    });
    it("should render with header", () => {
      const component = render(<Dialog opened={true} header={<div className="header-test" />} />);
      expect(component.container.querySelector(".header-test")).not.to.be.null;
      expect(component.container.querySelector(".core-dialog-head")).to.be.null;
    });
  });

});
