/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { expect } from "chai";
import sinon from "sinon";
import { IModelApp, IModelConnection, NoRenderApp } from "@bentley/imodeljs-frontend";
import { Presentation, SelectionManager } from "@bentley/presentation-frontend";
import { Primitives, PrimitiveValue, PropertyRecord, PropertyValue, PropertyValueFormat } from "@bentley/ui-abstract";
import { TypeConverter, TypeConverterManager } from "@bentley/ui-components";
import { act, cleanup, render } from "@testing-library/react";
import { InstanceKeyValueRenderer } from "../../presentation-components/properties/InstanceKeyValueRenderer";
import { UnifiedSelectionContextProvider } from "../../presentation-components/unified-selection/UnifiedSelectionContext";

describe("InstanceKeyValueRenderer", () => {
  const renderer = new InstanceKeyValueRenderer();

  function createPrimitiveValue(value?: Primitives.Value, displayValue?: string): PrimitiveValue {
    return { valueFormat: PropertyValueFormat.Primitive, value, displayValue };
  }

  function createNavigationPropertyRecord(value: PropertyValue): PropertyRecord {
    return new PropertyRecord(value, { name: "", displayLabel: "", typename: "navigation" });
  }

  before(async () => {
    await NoRenderApp.startup();
    await Presentation.initialize();
  });

  after(async () => {
    Presentation.terminate();
    await IModelApp.shutdown();
  });

  describe("canRender", () => {
    it("returns true if value is primitive and undefined", () => {
      const record = createNavigationPropertyRecord(createPrimitiveValue());
      expect(renderer.canRender(record)).to.be.true;
    });

    it("returns true if value is primitive instance key", () => {
      const record = createNavigationPropertyRecord(createPrimitiveValue({ className: "", id: "" }));
      expect(renderer.canRender(record)).to.be.true;
    });

    it("returns false if value is not primitive", () => {
      const record = createNavigationPropertyRecord({ valueFormat: PropertyValueFormat.Struct, members: {} });
      expect(renderer.canRender(record)).to.be.false;
    });

    it("returns false if value is primitive but not undefined or instance key", () => {
      const record = createNavigationPropertyRecord(createPrimitiveValue("test_value"));
      expect(renderer.canRender(record)).to.be.false;
    });
  });

  describe("render", () => {
    beforeEach(() => {
      const selectionManager = new SelectionManager({ scopes: undefined as any });
      sinon.stub(Presentation, "selection").get(() => selectionManager);
    });

    afterEach(() => {
      cleanup();
      sinon.restore();
    });

    describe("returned component", () => {
      const testIModel = {} as IModelConnection;
      const instanceKey: Primitives.InstanceKey = { className: "test_class", id: "test_id" };

      it("renders display value", () => {
        const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey, "test_display_value"));
        const { getByText } = render(renderer.render(record));
        expect(getByText("test_display_value")).not.to.be.null;
      });

      it("renders empty when there is no display value", () => {
        const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
        const { getByRole } = render(
          <UnifiedSelectionContextProvider imodel={testIModel}>
            {renderer.render(record)}
          </UnifiedSelectionContextProvider>
        );
        expect(getByRole("link").textContent).to.be.empty;
      });

      it("changes current selection when clicked", () => {
        const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
        const { getByRole } = render(
          <UnifiedSelectionContextProvider imodel={testIModel} selectionLevel={10}>
            {renderer.render(record)}
          </UnifiedSelectionContextProvider>
        );

        act(() => { getByRole("link").click(); });

        expect(Presentation.selection.getSelection(testIModel, 10).has(instanceKey)).to.be.true;
      });

      it("renders non-clickable display value when UnifiedSelectionContext is not present", () => {
        const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey, "test_display_value"));
        const { getByText, queryByRole } = render(renderer.render(record));
        expect(getByText("test_display_value")).not.to.be.null;
        expect(queryByRole("link")).to.be.null;
      });

      describe("with custom type converter", () => {
        function applyCustomTypeConverter(record: PropertyRecord, value: unknown): void {
          record.property.converter = { name: "test_converter", options: { value } };
        }

        before(() => {
          class TestTypeConverter extends TypeConverter {

            public override convertToStringWithOptions(_value?: Primitives.Value, options?: Record<string, any>) {
              return options?.value;
            }

            public sortCompare() {
              return 0;
            }
          }

          TypeConverterManager.registerConverter("navigation", TestTypeConverter, "test_converter");
        });

        after(() => {
          TypeConverterManager.unregisterConverter("navigation", "test_converter");
        });

        it("uses type converter when there is no display value", () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          applyCustomTypeConverter(record, "test_value");
          const { getByText } = render(renderer.render(record));
          expect(getByText("test_value")).not.to.be.null;
        });

        it("uses default value from context if converted value is undefined", () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          applyCustomTypeConverter(record, undefined);
          const { getByText } = render(renderer.render(record, { defaultValue: "test_default_value" }));
          expect(getByText("test_default_value")).not.to.be.null;
        });

        it("renders empty if converted value is undefined and there is no default", () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          applyCustomTypeConverter(record, undefined);
          const { getByRole } = render(
            <UnifiedSelectionContextProvider imodel={testIModel}>
              {renderer.render(record)}
            </UnifiedSelectionContextProvider>
          );
          expect(getByRole("link").textContent).to.be.empty;
        });
      });
    });
  });
});
