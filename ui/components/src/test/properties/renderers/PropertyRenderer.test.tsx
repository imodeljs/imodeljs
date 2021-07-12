/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { mount } from "enzyme";
import * as React from "react";
import sinon from "sinon";
import { Orientation } from "@bentley/ui-core";
import { LinksRenderer } from "../../../ui-components/properties/LinkHandler";
import { NonPrimitivePropertyRenderer } from "../../../ui-components/properties/renderers/NonPrimitivePropertyRenderer";
import { PrimitivePropertyRenderer } from "../../../ui-components/properties/renderers/PrimitivePropertyRenderer";
import { PropertyRenderer } from "../../../ui-components/properties/renderers/PropertyRenderer";
import { PropertyValueRendererManager } from "../../../ui-components/properties/ValueRendererManager";
import TestUtils from "../../TestUtils";
import { fireEvent, render } from "@testing-library/react";
import { PropertyRecord } from "@bentley/ui-abstract";

describe("PropertyRenderer", () => {
  describe("getLabelOffset", () => {
    const maxIndent = 17;
    const minIndent = 6;

    function setupStaticIndentationTests(orientation: Orientation) {
      describe("Static indentation", () => {
        it("returns 0 when indentation is undefined or 0", () => {
          expect(PropertyRenderer.getLabelOffset(undefined, orientation)).to.be.eq(0);
          expect(PropertyRenderer.getLabelOffset(0, orientation)).to.be.eq(0);
        });

        it("returns maxIndent when indentation is 1", () => {
          expect(PropertyRenderer.getLabelOffset(1, orientation)).to.be.equal(maxIndent);
        });

        it("returns maxIndent * 2 when indentation is 2", () => {
          expect(PropertyRenderer.getLabelOffset(2, orientation)).to.be.equal(maxIndent * 2);
        });
      });
    }

    describe("Vertical orientation", () => {
      const orientation = Orientation.Vertical;

      setupStaticIndentationTests(orientation);

      it("should not shrink indentation in Vertical mode", () => {
        expect(PropertyRenderer.getLabelOffset(1, orientation, 100, 0.2, 20)).to.be.equal(maxIndent);
      });
    });

    describe("Horizontal orientation", () => {
      const orientation = Orientation.Horizontal;

      setupStaticIndentationTests(orientation);

      describe("Shrinking indentation", () => {
        it("returns 0 when indentation is undefined or 0", () => {
          expect(PropertyRenderer.getLabelOffset(undefined, orientation, 100, 0.2, 20)).to.be.eq(0);
          expect(PropertyRenderer.getLabelOffset(0, orientation, 100, 0.1, 20)).to.be.eq(0);
        });

        it("returns maxIndent when indentation is 1 and current label size is bigger than shrink threshold", () => {
          expect(PropertyRenderer.getLabelOffset(1, orientation, 100, 0.4, 20)).to.be.equal(maxIndent);
        });

        it("returns minIndent when indentation is 1 and current label size is same as minimum label size", () => {
          expect(PropertyRenderer.getLabelOffset(1, orientation, 100, 0.2, 20)).to.be.equal(minIndent);
        });

        it("returns intermediate value between min and max when indentation is 1 and current label size is between threshold and minimum shrink", () => {
          expect(PropertyRenderer.getLabelOffset(1, orientation, 100, 0.3, 20)).to.be.equal(10);
        });

        it("returns maxIndent * 4 when indentation is 4 and current label size is larger than shrink threshold", () => {
          expect(PropertyRenderer.getLabelOffset(4, orientation, 100, 0.9, 20)).to.be.equal(maxIndent * 4);
        });

        it("returns minIndent * 4 when indentation is 4 and current label size is same as minimum label size", () => {
          expect(PropertyRenderer.getLabelOffset(4, orientation, 100, 0.2, 20)).to.be.equal(minIndent * 4);
        });

        it("returns (maxIndent * 3) + intermediate when indentation is 4 and current label size is between indentation 4 min shrink and threshold", () => {
          const intermediateSize = 9;
          const minimumLabelSize = 20;
          const width = 100;
          const currentLabelSizeRatio = (minimumLabelSize + (maxIndent * 3) + intermediateSize) / width;

          expect(PropertyRenderer.getLabelOffset(4, orientation, width, currentLabelSizeRatio, minimumLabelSize)).to.be.equal((maxIndent * 3) + intermediateSize);
        });

        it("returns (maxIndent) + intermediate + (minIndent * 2) when when indentation is 4 and current label size is between indentation 2 threshold and minimum shrink", () => {
          const intermediateSize = 13;
          const minimumLabelSize = 20;
          const width = 100;
          const currentLabelSizeRatio = (minimumLabelSize + maxIndent + intermediateSize) / width;

          expect(PropertyRenderer.getLabelOffset(4, orientation, width, currentLabelSizeRatio, minimumLabelSize)).to.be.equal(maxIndent + intermediateSize + (minIndent * 2));
        });
      });
    });
  });

  let propertyRecord: PropertyRecord;

  before(async () => {
    await TestUtils.initializeUiComponents();
  });

  beforeEach(() => {
    propertyRecord = TestUtils.createPrimitiveStringProperty("Label", "Model");
  });

  after(() => {
    TestUtils.terminateUiComponents();
  });

  it("updates displayed value if propertyRecord changes", async () => {
    const originalValue = "OriginalValue";
    const recordValue = "ChangedValue";

    propertyRecord = TestUtils.createPrimitiveStringProperty("Label", originalValue);

    const propertyRenderer = mount(
      <PropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
      />);

    await TestUtils.flushAsyncOperations();
    propertyRenderer.update();

    expect(propertyRenderer.find(LinksRenderer).prop("value")).to.be.equal(originalValue);

    propertyRenderer.setProps({ propertyRecord: TestUtils.createPrimitiveStringProperty("Label", recordValue) });

    await TestUtils.flushAsyncOperations();
    propertyRenderer.update();

    expect(propertyRenderer.find(LinksRenderer).prop("value")).to.be.equal(recordValue);
  });

  it("renders value differently if provided with custom propertyValueRendererManager", async () => {
    class RendererManager extends PropertyValueRendererManager {
      public override render({ }) {
        return ("Test");
      }
    }

    const propertyRenderer = mount(
      <PropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        propertyValueRendererManager={new RendererManager()}
      />);

    await TestUtils.flushAsyncOperations();
    propertyRenderer.update();

    expect(propertyRenderer.find(PrimitivePropertyRenderer).prop("valueElement")).to.be.eq("Test");
  });

  it("renders as primitive value if property is an empty array", () => {
    propertyRecord = TestUtils.createArrayProperty("EmptyArray");

    const propertyRenderer = mount(
      <PropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
      />);

    expect(propertyRenderer.find(PrimitivePropertyRenderer).exists()).to.be.true;
  });

  it("renders struct as a non primitive value", () => {
    propertyRecord = TestUtils.createArrayProperty("StringArray", [TestUtils.createPrimitiveStringProperty("Label", "Model")]);

    const propertyRenderer = mount(
      <PropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
      />);

    expect(propertyRenderer.find(NonPrimitivePropertyRenderer).exists()).to.be.true;
  });

  it("renders array as a non primitive value", () => {
    propertyRecord = TestUtils.createStructProperty("Struct");

    const propertyRenderer = mount(
      <PropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
      />);

    expect(propertyRenderer.find(NonPrimitivePropertyRenderer).exists()).to.be.true;
  });
  it("renders an editor correctly", () => {
    const propertyRenderer = mount(
      <PropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isEditing={true}
      />);

    expect(propertyRenderer.find("input.components-text-editor").length).to.eq(1);
  });

  it("calls onEditCommit on Enter key when editing", async () => {
    const spyMethod = sinon.spy();
    const propertyRenderer = render(
      <PropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isEditing={true}
        onEditCommit={spyMethod}
      />);

    const inputNode = propertyRenderer.container.querySelector("input");
    expect(inputNode).not.to.be.null;

    fireEvent.keyDown(inputNode as HTMLElement, { key: "Enter" });
    await TestUtils.flushAsyncOperations();
    expect(spyMethod.calledOnce).to.be.true;
  });

  it("calls onEditCancel on Escape key when editing", () => {
    const spyMethod = sinon.spy();
    const propertyRenderer = render(
      <PropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isEditing={true}
        onEditCancel={spyMethod}
      />);

    const inputNode = propertyRenderer.container.querySelector("input");
    expect(inputNode).not.to.be.null;

    fireEvent.keyDown(inputNode as HTMLElement, { key: "Escape" });
    expect(spyMethod.calledOnce).to.be.true;
  });

  it("does not remove Editor on Enter if callback is not provided", () => {
    const propertyRenderer = mount(
      <PropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isEditing={true}
      />);

    const inputNode = propertyRenderer.find("input");
    expect(inputNode.exists()).to.be.true;

    inputNode.simulate("keyDown", { key: "Enter" });
    expect(propertyRenderer.find("input").exists()).to.be.true;
  });

  it("does not remove Editor on Escape if callback is not provided", () => {
    const propertyRenderer = mount(
      <PropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
        isEditing={true}
      />);

    const inputNode = propertyRenderer.find("input");
    expect(inputNode.exists()).to.be.true;

    inputNode.simulate("keyDown", { key: "Escape" });
    expect(propertyRenderer.find("input").exists()).to.be.true;
  });

  it("does not wrap valueElement in span if it's not a string", async () => {
    propertyRecord.property.typename = "mycustom";

    const myCustomRenderer = {
      canRender: () => true,
      render: () => <div>My value</div>, // eslint-disable-line react/display-name
    };

    PropertyValueRendererManager.defaultManager.registerRenderer("mycustom", myCustomRenderer);
    const propertyRenderer = mount(
      <PropertyRenderer
        orientation={Orientation.Horizontal}
        propertyRecord={propertyRecord}
      />);

    await TestUtils.flushAsyncOperations();
    propertyRenderer.update();

    const originalRender = mount(<div>My value</div>).html();
    const propsRender = mount(<>{propertyRenderer.find(PrimitivePropertyRenderer).prop("valueElement")}</>).html();
    expect(originalRender).to.be.eq(propsRender);
  });
});
