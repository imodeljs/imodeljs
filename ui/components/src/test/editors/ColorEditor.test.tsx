/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import React from "react";
import sinon from "sinon";
import { cleanup, fireEvent, render, waitForElement } from "@testing-library/react";
import { ColorByName } from "@bentley/imodeljs-common";
import { PrimitiveValue, PropertyRecord, PropertyValue, SpecialKey, StandardEditorNames } from "@bentley/ui-abstract";
import { OutputMessagePriority } from "@bentley/imodeljs-frontend";
import { ColorEditor } from "../../ui-components/editors/ColorEditor";
import { EditorContainer, PropertyUpdatedArgs } from "../../ui-components/editors/EditorContainer";
import TestUtils from "../TestUtils";
import { AsyncValueProcessingResult, DataControllerBase, PropertyEditorManager } from "../../ui-components/editors/PropertyEditorManager";

// cspell:ignore colorpicker

describe("<ColorEditor />", () => {
  afterEach(cleanup);

  it("should render", () => {
    const renderedComponent = render(<ColorEditor setFocus={true} />);
    expect(renderedComponent).not.to.be.undefined;
  });

  it("should trigger componentDidUpdate", async () => {
    const record1 = TestUtils.createColorProperty("Test", ColorByName.green as number);
    const record2 = TestUtils.createColorProperty("Test", ColorByName.blue as number);
    record2.isDisabled = true;

    const originalValue = (record1.value as PrimitiveValue).value as number;
    expect(originalValue).to.be.equal(ColorByName.green as number);

    const renderedComponent = render(<ColorEditor propertyRecord={record1} />);
    renderedComponent.rerender(<ColorEditor propertyRecord={record2} />);
    // renderedComponent.debug();
  });

  it("button press should open popup and allow color selection", async () => {
    const record = TestUtils.createColorProperty("Test", ColorByName.green as number);

    const originalValue = (record.value as PrimitiveValue).value as number;
    expect(originalValue).to.be.equal(ColorByName.green as number);

    const spyOnCommit = sinon.spy();
    function handleCommit(commit: PropertyUpdatedArgs): void {
      const newValue = (commit.newValue as PrimitiveValue).value as number;
      expect(newValue).to.be.equal(ColorByName.blue as number);
      spyOnCommit();
    }

    const renderedComponent = render(<ColorEditor propertyRecord={record} onCommit={handleCommit} />);
    const pickerButton = renderedComponent.getByTestId("components-colorpicker-button");
    // renderedComponent.debug();
    expect(pickerButton.tagName).to.be.equal("BUTTON");
    fireEvent.click(pickerButton);

    const popupDiv = await waitForElement(() => renderedComponent.getByTestId("components-colorpicker-popup-colors"));
    expect(popupDiv).not.to.be.undefined;
    if (popupDiv) {
      const firstColorButton = popupDiv.firstChild as HTMLElement;
      expect(firstColorButton).not.to.be.undefined;
      fireEvent.click(firstColorButton);

      // wait for async processing done in ColorEditor._onColorPick method
      await TestUtils.flushAsyncOperations();
      expect(spyOnCommit).to.be.calledOnce;
    }
  });

  it("renders editor for 'number' type and 'color-picker' editor using SliderEditor", () => {
    const propertyRecord = TestUtils.createNumericProperty("Test", 50, StandardEditorNames.ColorPicker);
    const renderedComponent = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={() => { }} onCancel={() => { }} />);
    expect(renderedComponent.getByTestId("components-colorpicker-button")).to.exist;
    cleanup();
  });

  class MineDataController extends DataControllerBase {
    public override async validateValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
      return { encounteredError: true, errorMessage: { priority: OutputMessagePriority.Error, briefMessage: "Test"} };
    }
  }

  it("should not commit if DataController fails to validate", async () => {
    PropertyEditorManager.registerDataController("myData", MineDataController);
    const propertyRecord = TestUtils.createNumericProperty("Test", 50, StandardEditorNames.ColorPicker);
    propertyRecord.property.dataController = "myData";

    const spyOnCommit = sinon.spy();
    const wrapper = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={spyOnCommit} onCancel={() => { }} />);
    const pickerButton = wrapper.getByTestId("components-colorpicker-button");
    expect(pickerButton).not.to.be.null;

    fireEvent.keyDown(pickerButton, { key: SpecialKey.Enter });
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.calledOnce).to.be.false;

    PropertyEditorManager.deregisterDataController("myData");
  });

});
