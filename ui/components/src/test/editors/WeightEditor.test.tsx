/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import React from "react";
import sinon from "sinon";
import { PrimitiveValue, PropertyRecord, PropertyValue, SpecialKey } from "@bentley/ui-abstract";
import { cleanup, fireEvent, render, waitForElement } from "@testing-library/react";
import { EditorContainer, PropertyUpdatedArgs } from "../../ui-components/editors/EditorContainer";
import { WeightEditor } from "../../ui-components/editors/WeightEditor";
import TestUtils from "../TestUtils";
import { AsyncValueProcessingResult, DataControllerBase, PropertyEditorManager } from "../../ui-components/editors/PropertyEditorManager";
import { OutputMessagePriority } from "@bentley/imodeljs-frontend";

describe("<WeightEditor />", () => {
  afterEach(cleanup);

  it("should render", () => {
    const renderedComponent = render(<WeightEditor setFocus={true} />);
    expect(renderedComponent).not.to.be.undefined;
  });

  it("button press should open popup and allow weight selection", async () => {
    const weight1 = 1;
    const weight2 = 3;
    const firstWeightValue = 1;
    const record1 = TestUtils.createWeightProperty("Test", weight1);
    const record2 = TestUtils.createWeightProperty("Test", weight2);

    const originalValue = (record1.value as PrimitiveValue).value as number;
    expect(originalValue).to.be.equal(weight1);

    const renderedComponent = render(<WeightEditor propertyRecord={record1} />);

    const spyOnCommit = sinon.spy();
    function handleCommit(commit: PropertyUpdatedArgs): void {
      const newValue = (commit.newValue as PrimitiveValue).value as number;
      expect(newValue).to.be.equal(firstWeightValue);
      spyOnCommit();
    }

    renderedComponent.rerender(<WeightEditor propertyRecord={record2} onCommit={handleCommit} />);
    const pickerButton = renderedComponent.getByTestId("components-weightpicker-button");
    expect(pickerButton.tagName).to.be.equal("BUTTON");
    fireEvent.click(pickerButton);

    // ====== Example of how to see contents of portal <Popup> component ==========
    // const portalDiv = await waitForElement(() => renderedComponent.getByTestId("core-popup"));
    // expect(portalDiv).not.to.be.undefined;
    // eslint-disable-next-line no-console
    // console.log(portalDiv.outerHTML);
    // =================================

    const popupDiv = await waitForElement(() => renderedComponent.getByTestId("components-weightpicker-popup-lines"));
    // renderedComponent.debug();  // show content of portal
    expect(popupDiv).not.to.be.undefined;
    if (popupDiv) {
      const firstWeightButton = popupDiv.firstChild as HTMLElement;
      expect(firstWeightButton).not.to.be.undefined;
      fireEvent.click(firstWeightButton);

      // wait for async processing done in WeightEditor._onLineWeightPick method
      await TestUtils.flushAsyncOperations();
      expect(spyOnCommit).to.be.calledOnce;
    }
  });

  it("should render as disabled", () => {
    const weight1 = 1;
    const propertyRecord = TestUtils.createWeightProperty("Test", weight1);
    propertyRecord.isDisabled = true;
    const renderedComponent = render(<WeightEditor setFocus={true} propertyRecord={propertyRecord} />);
    expect(renderedComponent).not.to.be.undefined;
    expect(renderedComponent.container.querySelector("[disabled]")).to.not.be.null;
  });

  it("renders editor for 'number' type and 'weight-picker' editor using WeightEditor", () => {
    const weight1 = 1;
    const propertyRecord = TestUtils.createWeightProperty("Test", weight1);
    const renderedComponent = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={() => { }} onCancel={() => { }} />);
    expect(renderedComponent.getByTestId("components-weightpicker-button")).to.exist;
  });

  class MineDataController extends DataControllerBase {
    public override async validateValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
      return { encounteredError: true, errorMessage: { priority: OutputMessagePriority.Error, briefMessage: "Test"} };
    }
  }

  it("should not commit if DataController fails to validate", async () => {
    PropertyEditorManager.registerDataController("myData", MineDataController);
    const weight1 = 1;
    const propertyRecord = TestUtils.createWeightProperty("Test", weight1);
    propertyRecord.property.dataController = "myData";

    const spyOnCommit = sinon.spy();
    const renderedComponent = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={spyOnCommit} onCancel={() => { }} />);
    expect(renderedComponent).not.to.be.undefined;
    const button = renderedComponent.getByTestId("components-weightpicker-button");
    expect(button).to.exist;

    fireEvent.keyDown(button, { key: SpecialKey.Enter });
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.called).to.be.false;

    PropertyEditorManager.deregisterDataController("myData");
  });

});
