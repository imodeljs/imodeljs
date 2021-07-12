/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { mount } from "enzyme";
import * as React from "react";
import sinon from "sinon";
import { PropertyRecord } from "@bentley/ui-abstract";
import { Orientation } from "@bentley/ui-core";
import { fireEvent, render } from "@testing-library/react";
import { LinksRenderer } from "../../../../ui-components/properties/LinkHandler";
import { PrimitivePropertyRenderer } from "../../../../ui-components/properties/renderers/PrimitivePropertyRenderer";
import { PropertyValueRendererManager } from "../../../../ui-components/properties/ValueRendererManager";
import { FlatNonPrimitivePropertyRenderer } from "../../../../ui-components/propertygrid/internal/flat-properties/FlatNonPrimitivePropertyRenderer";
import { FlatPropertyRenderer } from "../../../../ui-components/propertygrid/internal/flat-properties/FlatPropertyRenderer";
import TestUtils from "../../../TestUtils";

describe("FlatPropertyRenderer", () => {
  let propertyRecord: PropertyRecord;

  before(async () => {
    await TestUtils.initializeUiComponents();
  });

  after(() => {
    TestUtils.terminateUiComponents();
  });

  beforeEach(() => {
    propertyRecord = TestUtils.createPrimitiveStringProperty("Label", "Model");
  });

  it("updates displayed value if propertyRecord changes", async () => {
    const originalValue = "OriginalValue";
    const recordValue = "ChangedValue";

    propertyRecord = TestUtils.createPrimitiveStringProperty("Label", originalValue);

    const propertyRenderer = mount(
      <FlatPropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);

    await TestUtils.flushAsyncOperations();
    propertyRenderer.update();

    expect(propertyRenderer.find(LinksRenderer).prop("value")).to.be.equal(originalValue);

    propertyRenderer.setProps({ propertyRecord: TestUtils.createPrimitiveStringProperty("Label", recordValue) });

    await TestUtils.flushAsyncOperations();
    propertyRenderer.update();

    expect(propertyRenderer.find(LinksRenderer).prop("value")).to.be.equal(recordValue);
  });

  it("uses provided propertyValueRendererManager", async () => {
    class RendererManager extends PropertyValueRendererManager {
      public override render({ }) {
        return ("Test");
      }
    }

    const { getByText } = render(
      <FlatPropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        propertyValueRendererManager={new RendererManager()}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);

    expect(getByText("Test")).to.be.not.null;
  });

  it("highlights matches in primitive values", async () => {
    const { container } = render(
      <FlatPropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={TestUtils.createPrimitiveStringProperty("Label", "abc")}
        highlight={{ highlightedText: "b", applyOnLabel: true, applyOnValue: true }}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);
    const highlightedNodes = container.querySelectorAll("mark");
    expect(highlightedNodes.length).to.eq(2);
  });

  it("renders as primitive value if property is an empty array", () => {
    propertyRecord = TestUtils.createArrayProperty("EmptyArray");

    const propertyRenderer = mount(
      <FlatPropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);

    expect(propertyRenderer.find(PrimitivePropertyRenderer).exists()).to.be.true;
  });

  it("highlights matches in empty array values", () => {
    const { container } = render(
      <FlatPropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={TestUtils.createArrayProperty("EmptyArray")}
        highlight={{ highlightedText: "rr", applyOnLabel: true, applyOnValue: true }}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);
    const highlightedNode = container.querySelector("mark");
    expect(highlightedNode).to.be.not.null;
    expect(highlightedNode!.textContent).to.eq("rr");
  });

  it("renders struct as a non primitive value", () => {
    propertyRecord = TestUtils.createArrayProperty("StringArray", [TestUtils.createPrimitiveStringProperty("Label", "Model")]);

    const propertyRenderer = mount(
      <FlatPropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);

    expect(propertyRenderer.find(FlatNonPrimitivePropertyRenderer).exists()).to.be.true;
  });

  it("renders array as a non primitive value", () => {
    propertyRecord = TestUtils.createStructProperty("Struct");

    const propertyRenderer = mount(
      <FlatPropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);

    expect(propertyRenderer.find(FlatNonPrimitivePropertyRenderer).exists()).to.be.true;
  });

  it("renders an editor correctly", () => {
    const propertyRenderer = mount(
      <FlatPropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isEditing={true}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);

    expect(propertyRenderer.find("input.components-text-editor").length).to.eq(1);
  });

  it("calls onEditCommit on Enter key when editing", async () => {
    const spyMethod = sinon.spy();
    const propertyRenderer = render(
      <FlatPropertyRenderer
        category={{ name: "Cat1", label: "Category 1", expand: true }}
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isEditing={true}
        onEditCommit={spyMethod}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);

    const inputNode = propertyRenderer.container.querySelector("input");
    expect(inputNode).not.to.be.null;

    fireEvent.keyDown(inputNode as HTMLElement, { key: "Enter" });
    await TestUtils.flushAsyncOperations();
    expect(spyMethod.calledOnce).to.be.true;
  });

  it("does not attempt to call onEditCommit callback when it is not present and throw", async () => {
    const propertyRenderer = render(
      <FlatPropertyRenderer
        category={{ name: "Cat1", label: "Category 1", expand: true }}
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isEditing={true}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);

    const inputNode = propertyRenderer.container.querySelector("input");
    expect(inputNode).not.to.be.null;

    fireEvent.keyDown(inputNode as HTMLElement, { key: "Enter" });
    await TestUtils.flushAsyncOperations();
  });

  it("calls onEditCancel on Escape key when editing", () => {
    const spyMethod = sinon.spy();
    const propertyRenderer = render(
      <FlatPropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isEditing={true}
        onEditCancel={spyMethod}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);

    const inputNode = propertyRenderer.container.querySelector("input");
    expect(inputNode).not.to.be.null;

    fireEvent.keyDown(inputNode as HTMLElement, { key: "Escape" });
    expect(spyMethod.calledOnce).to.be.true;
  });

  it("does not remove Editor on Enter if callback is not provided", () => {
    const propertyRenderer = mount(
      <FlatPropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isEditing={true}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);

    const inputNode = propertyRenderer.find("input");
    expect(inputNode.exists()).to.be.true;

    inputNode.simulate("keyDown", { key: "Enter" });
    expect(propertyRenderer.find("input").exists()).to.be.true;
  });

  it("does not remove Editor on Escape if callback is not provided", () => {
    const propertyRenderer = mount(
      <FlatPropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isEditing={true}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);

    const inputNode = propertyRenderer.find("input");
    expect(inputNode.exists()).to.be.true;

    inputNode.simulate("keyDown", { key: "Escape" });
    expect(propertyRenderer.find("input").exists()).to.be.true;
  });

  it("does not wrap valueElement in span if it's not a string", async () => {
    propertyRecord.property.typename = "mycustomRenderer";

    const myCustomRenderer = {
      canRender: () => true,
      // eslint-disable-next-line react/display-name
      render: () => <div>My value</div>,
    };

    PropertyValueRendererManager.defaultManager.registerRenderer("mycustomRenderer", myCustomRenderer);
    const propertyRenderer = mount(
      <FlatPropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isExpanded={false}
        onExpansionToggled={() => { }}
      />);

    await TestUtils.flushAsyncOperations();
    propertyRenderer.update();

    const originalRender = mount(<div>My value</div>).html();
    const propsRender = mount(<>{propertyRenderer.find(PrimitivePropertyRenderer).prop("valueElementRenderer")!()}</>).html();
    expect(originalRender).to.be.eq(propsRender);
  });

  describe("onHeightChanged", () => {
    const record = TestUtils.createPrimitiveStringProperty("test", "test");

    function renderFlatPropertyRenderer(isEditing: boolean, onHeightChanged?: (newHeight: number) => void) {
      return (
        <FlatPropertyRenderer
          orientation={Orientation.Horizontal}
          propertyRecord={record}
          isExpanded={false}
          isEditing={isEditing}
          onExpansionToggled={() => { }}
          onHeightChanged={onHeightChanged}
        />
      );
    }

    it("gets called when entering editing state", () => {
      const onHeightChanged = sinon.fake();
      const { rerender } = render(renderFlatPropertyRenderer(false, onHeightChanged));
      expect(onHeightChanged).to.have.not.been.called;
      rerender(renderFlatPropertyRenderer(true, onHeightChanged));
      expect(onHeightChanged).to.have.been.calledOnceWith(27);
    });

    it("does not get called when component is mounted in editing state", () => {
      const onHeightChanged = sinon.fake();
      render(renderFlatPropertyRenderer(true, onHeightChanged));
      expect(onHeightChanged).to.have.not.been.called;
    });

    it("does not attempt to call when it is not present and throw", () => {
      const { rerender } = render(renderFlatPropertyRenderer(false));
      rerender(renderFlatPropertyRenderer(true));
    });
  });
});
