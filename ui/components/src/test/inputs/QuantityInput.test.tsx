/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as sinon from "sinon";
import * as React from "react";
import { fireEvent, render } from "@testing-library/react";
import { IModelApp, MockRender, QuantityType } from "@bentley/imodeljs-frontend";
import TestUtils from "../TestUtils";
import { QuantityInput } from "../../ui-components/inputs/QuantityInput";
import { SpecialKey } from "@bentley/ui-abstract";

describe("QuantityInput", () => {
  const rnaDescriptorToRestore = Object.getOwnPropertyDescriptor(IModelApp, "requestNextAnimation")!;
  function requestNextAnimation() { }

  before(async () => {
    // Avoid requestAnimationFrame exception during test by temporarily replacing function that calls it.
    Object.defineProperty(IModelApp, "requestNextAnimation", {
      get: () => requestNextAnimation,
    });
    await TestUtils.initializeUiComponents();
    await MockRender.App.startup();
  });

  after(async () => {
    await MockRender.App.shutdown();
    TestUtils.terminateUiComponents();
    Object.defineProperty(IModelApp, "requestNextAnimation", rnaDescriptorToRestore);
  });

  it("should render input for Length", () => {
    const initialLength = 1;  // 1 meter
    const spyOnChange = sinon.spy();
    const wrapper = render(<QuantityInput initialValue={initialLength} quantityType={QuantityType.Length} onQuantityChange={spyOnChange} />);
    expect(wrapper).not.to.be.undefined;
    const input = wrapper.getByTestId("components-parsed-input");
    fireEvent.change(input, { target: { value: "2.5" } });
    expect(spyOnChange).not.to.have.been.called;
    fireEvent.keyDown(input, { key: SpecialKey.Enter });
    expect(spyOnChange).to.have.been.called;
  });

  const overrideLengthFormats = {
    metric: {
      composite: {
        includeZero: true,
        spacer: " ",
        units: [{ label: "cm", name: "Units.CM" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
    imperial: {
      composite: {
        includeZero: true,
        spacer: " ",
        units: [{ label: "in", name: "Units.IN" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
    usCustomary: {
      composite: {
        includeZero: true,
        spacer: " ",
        units: [{ label: "in", name: "Units.IN" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
    usSurvey: {
      composite: {
        includeZero: true,
        spacer: " ",
        units: [{ label: "in", name: "Units.US_SURVEY_IN" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    },
  };

  it("should process ESC key", async () => {
    const initialLength = 1;  // 1 meter
    const spyOnChange = sinon.spy();

    // set active unit system to be metric and wait to make sure quantity format cache is set
    IModelApp.quantityFormatter.useImperialFormats = false; // eslint-disable-line deprecation/deprecation
    await TestUtils.flushAsyncOperations();

    const wrapper = render(<QuantityInput initialValue={initialLength} quantityType={QuantityType.Length} onQuantityChange={spyOnChange} />);
    expect(wrapper).not.to.be.undefined;

    const input = wrapper.getByTestId("components-parsed-input") as HTMLInputElement;
    const initialValue = input.value;
    fireEvent.change(input, { target: { value: "2.5" } });
    fireEvent.keyDown(input, { key: SpecialKey.Escape });
    expect(spyOnChange).not.to.have.been.called;  // value did not change after ESC was pressed
    expect(initialValue).to.eq(input.value);
    fireEvent.change(input, { target: { value: "3.5" } });
    fireEvent.keyDown(input, { key: SpecialKey.Enter });
    expect(spyOnChange).to.have.been.called;
    expect(input.value).to.eq("3.5 m");

    // set active unit system to be imperial and wait to make sure quantity format cache is set
    IModelApp.quantityFormatter.useImperialFormats = true; // eslint-disable-line deprecation/deprecation
    await TestUtils.flushAsyncOperations();
    expect(input.value).to.eq("3'-3 3/8\"");

    // set override for length to inches and insure proper format is returned
    await IModelApp.quantityFormatter.setOverrideFormats(QuantityType.Length, overrideLengthFormats);
    await TestUtils.flushAsyncOperations();
    // eslint-disable-next-line no-console
    // console.log(`input.value = ${input.value}`);
    expect(input.value).to.eq("39.3701 in");
    await IModelApp.quantityFormatter.clearOverrideFormats(QuantityType.Length);
    await TestUtils.flushAsyncOperations();
    expect(input.value).to.eq("3'-3 3/8\"");
  });

  it("should attach 'components-parsed-input-has-error' when bad input", () => {
    const initialLength = 1;  // 1 meter
    const spyOnChange = sinon.spy();

    const wrapper = render(<QuantityInput initialValue={initialLength} quantityType={QuantityType.Length} onQuantityChange={spyOnChange} />);
    expect(wrapper).not.to.be.undefined;
    const input = wrapper.getByTestId("components-parsed-input") as HTMLInputElement;
    const initialValue = input.value;
    input.focus();
    fireEvent.change(input, { target: { value: "abc" } });
    input.blur();
    expect(input.classList.contains("components-parsed-input-has-error")).to.be.true;
    fireEvent.keyDown(input, { key: SpecialKey.Escape });
    expect(spyOnChange).not.to.have.been.called;  // value did not change after ESC was pressed
    const currentValue = input.value;
    expect(input.classList.contains("components-parsed-input-has-error")).to.be.false;
    expect(initialValue).to.eq(currentValue);
  });
});
