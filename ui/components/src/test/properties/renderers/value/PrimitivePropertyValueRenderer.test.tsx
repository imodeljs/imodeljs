/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import * as sinon from "sinon";
import { Primitives, PropertyConverterInfo } from "@bentley/ui-abstract";
import { render, waitForElement } from "@testing-library/react";
import { PrimitivePropertyValueRenderer } from "../../../../ui-components";
import { TypeConverter } from "../../../../ui-components/converters/TypeConverter";
import { TypeConverterManager } from "../../../../ui-components/converters/TypeConverterManager";
import { PropertyValueRendererContext } from "../../../../ui-components/properties/ValueRendererManager";
import TestUtils from "../../../TestUtils";

class AsyncValuesTypeConverter extends TypeConverter {
  public sortCompare(_lhs: Primitives.Value, _rhs: Primitives.Value, _ignoreCase?: boolean) {
    return 0;
  }
  public override async convertToString(value?: Primitives.Value) {
    return value ? value.toString() : "";
  }
}

describe("PrimitivePropertyValueRenderer", () => {

  afterEach(() => {
    sinon.restore();
  });

  describe("render", () => {

    it("renders primitive property", () => {
      const renderer = new PrimitivePropertyValueRenderer();
      const stringProperty = TestUtils.createPrimitiveStringProperty("Label", "Test property");

      const element = renderer.render(stringProperty);
      const renderedElement = render(<>{element}</>);
      renderedElement.getByText("Test property");
    });

    it("supports PropertyConverterInfo", () => {
      const renderer = new PrimitivePropertyValueRenderer();
      const stringProperty = TestUtils.createPrimitiveStringProperty("Label", "Test property");
      const convertInfo: PropertyConverterInfo = { name: "" };
      stringProperty.property.converter = convertInfo;

      const element = renderer.render(stringProperty);
      const renderedElement = render(<>{element}</>);
      renderedElement.getByText("Test property");
    });

    it("renders primitive property wrapped in an anchored tag when property record has it", () => {
      const renderer = new PrimitivePropertyValueRenderer();
      const stringProperty = TestUtils.createPrimitiveStringProperty("Label", "Test property");
      stringProperty.links = {
        onClick: sinon.spy(),
      };

      const element = renderer.render(stringProperty);
      const renderedElement = render(<>{element}</>);

      renderedElement.getByText("Test property");

      expect(renderedElement.container.getElementsByClassName("core-underlined-button")).to.not.be.empty;
    });

    it("renders primitive property applying default links behavior - matches all links using regex if PropertyRecord does not have LinkElementsInfo", () => {
      const renderer = new PrimitivePropertyValueRenderer();
      const stringProperty = TestUtils.createPrimitiveStringProperty("Label", "Test property www.test.com");

      const element = renderer.render(stringProperty);
      const renderedElement = render(<>{element}</>);

      expect(renderedElement.container.getElementsByClassName("core-underlined-button")[0].textContent).to.be.eq("www.test.com");
    });

    it("renders primitive property applying custom LinkElementsInfo specified in PropertyRecord's LinkElementsInfo", () => {
      const renderer = new PrimitivePropertyValueRenderer();
      const stringProperty = TestUtils.createPrimitiveStringProperty("Label", "Test property");
      stringProperty.links = {
        onClick: sinon.spy(),
        matcher: () => [{ start: 0, end: 4 }],
      };

      const element = renderer.render(stringProperty);
      const renderedElement = render(<>{element}</>);

      expect(renderedElement.container.getElementsByClassName("core-underlined-button")[0].textContent).to.be.eq("Test");
    });

    it("renders async value with default value in context", async () => {
      sinon.replace(TypeConverterManager, "getConverter", () => new AsyncValuesTypeConverter());
      const renderer = new PrimitivePropertyValueRenderer();

      const value = "some value";
      const propertyRecord = TestUtils.createPropertyRecord(value, { key: "test", label: "test" }, "async");

      const context: PropertyValueRendererContext = {
        defaultValue: "in progress",
      };

      const renderedElement = render(<>{renderer.render(propertyRecord, context)}</>);
      renderedElement.getByText("in progress");
      await waitForElement(() => renderedElement.getByText(value));
    });

    it("renders async value without default value in context", async () => {
      sinon.replace(TypeConverterManager, "getConverter", () => new AsyncValuesTypeConverter());
      const renderer = new PrimitivePropertyValueRenderer();

      const value = "some value";
      const propertyRecord = TestUtils.createPropertyRecord(value, { key: "test", label: "test" }, "async");

      const renderedElement = render(<>{renderer.render(propertyRecord)}</>);
      await waitForElement(() => renderedElement.getByText(value));
    });

    it("throws when trying to render array property", () => {
      const renderer = new PrimitivePropertyValueRenderer();
      const arrayProperty = TestUtils.createArrayProperty("LabelArray");
      expect(() => renderer.render(arrayProperty)).to.throw;
    });

  });

  describe("canRender", () => {

    it("returns true for a primitive property", () => {
      const renderer = new PrimitivePropertyValueRenderer();
      const stringProperty = TestUtils.createPrimitiveStringProperty("Label", "Test property");
      expect(renderer.canRender(stringProperty)).to.be.true;
    });

    it("returns false for array and struct property", () => {
      const renderer = new PrimitivePropertyValueRenderer();
      const arrayProperty = TestUtils.createArrayProperty("LabelArray");
      const structProperty = TestUtils.createStructProperty("NameStruct");
      expect(renderer.canRender(arrayProperty)).to.be.false;
      expect(renderer.canRender(structProperty)).to.be.false;
    });

  });

});
