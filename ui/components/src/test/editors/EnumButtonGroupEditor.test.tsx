/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import React from "react";
import sinon from "sinon";
import { cleanup, fireEvent, render, waitForElement } from "@testing-library/react";
import { PrimitiveValue, PropertyRecord, PropertyValue, SpecialKey } from "@bentley/ui-abstract";
import { EditorContainer, PropertyUpdatedArgs } from "../../ui-components/editors/EditorContainer";
import { EnumButtonGroupEditor } from "../../ui-components/editors/EnumButtonGroupEditor";
import TestUtils from "../TestUtils";
import { AsyncValueProcessingResult, DataControllerBase, PropertyEditorManager } from "../../ui-components/editors/PropertyEditorManager";
import { OutputMessagePriority } from "@bentley/imodeljs-frontend";

// cSpell:ignore enumbuttongroup

describe("<EnumButtonGroupEditor />", () => {
  afterEach(cleanup);

  it("should render", () => {
    const renderedComponent = render(<EnumButtonGroupEditor setFocus={true} />);
    expect(renderedComponent).not.to.be.undefined;
  });

  it("editor with buttons renders correctly", async () => {
    const record1 = TestUtils.createEnumProperty("Test", 1);
    const record2 = TestUtils.createEnumProperty("Test", 2);
    TestUtils.addEnumButtonGroupEditorSpecification(record1);
    TestUtils.addEnumButtonGroupEditorSpecification(record2);
    const renderedComponent = render(<EnumButtonGroupEditor propertyRecord={record1} />);
    renderedComponent.rerender(<EnumButtonGroupEditor propertyRecord={record2} />);
    expect(renderedComponent).not.to.be.undefined;
  });

  it("button press updates value and display", async () => {
    const record = TestUtils.createEnumProperty("Test", 0);
    TestUtils.addEnumButtonGroupEditorSpecification(record);

    const originalValue = (record.value as PrimitiveValue).value as number;
    expect(originalValue).to.be.equal(0);

    const spyOnCommit = sinon.spy();
    function handleCommit(commit: PropertyUpdatedArgs): void {
      const newValue = (commit.newValue as PrimitiveValue).value as number;
      expect(newValue).to.be.equal(2);
      spyOnCommit();
    }

    const renderedComponent = render(<EnumButtonGroupEditor propertyRecord={record} onCommit={handleCommit} />);
    expect(await waitForElement(() => renderedComponent.getByTestId("Green"))).not.to.be.null;

    const greenButton = renderedComponent.getByTestId("Green");
    expect(greenButton.tagName).to.be.equal("BUTTON");
    expect(greenButton.classList.contains("nz-is-active")).to.be.false;

    fireEvent.click(greenButton);
    await TestUtils.flushAsyncOperations();
    expect(greenButton.classList.contains("nz-is-active")).to.be.true;
    expect(spyOnCommit.calledOnce).to.be.true;
  });

  it("button press updates string value and display", async () => {
    const record = TestUtils.createEnumStringProperty("Test", "red");
    TestUtils.addEnumButtonGroupEditorSpecification(record);

    const originalValue = (record.value as PrimitiveValue).value as string;
    expect(originalValue).to.be.equal("red");

    const spyOnCommit = sinon.spy();
    function handleCommit(commit: PropertyUpdatedArgs): void {
      const newValue = (commit.newValue as PrimitiveValue).value as string;
      expect(newValue).to.be.equal("green");
      spyOnCommit();
    }

    const renderedComponent = render(<EnumButtonGroupEditor propertyRecord={record} onCommit={handleCommit} />);
    expect(await waitForElement(() => renderedComponent.getByTestId("Green"))).not.to.be.null;
    const greenButton = renderedComponent.getByTestId("Green");
    expect(greenButton.tagName).to.be.equal("BUTTON");
    expect(greenButton.classList.contains("nz-is-active")).to.be.false;

    fireEvent.click(greenButton);
    await TestUtils.flushAsyncOperations();
    expect(greenButton.classList.contains("nz-is-active")).to.be.true;
    expect(spyOnCommit.calledOnce).to.be.true;
  });

  it("test support for enable/disable button states", async () => {
    const record = TestUtils.createEnumProperty("Test", 0);
    TestUtils.addEnumButtonGroupEditorSpecification(record);

    const renderedComponent = render(<EnumButtonGroupEditor propertyRecord={record} />);
    expect(await waitForElement(() => renderedComponent.getByTestId("Blue"))).not.to.be.null;
    const blueButton = renderedComponent.getByTestId("Blue");
    expect(blueButton.tagName).to.be.equal("BUTTON");
    expect(blueButton.classList.contains("nz-is-disabled")).to.be.equal(!TestUtils.blueEnumValueIsEnabled);
    TestUtils.toggleBlueEnumValueEnabled();
    renderedComponent.rerender(<EnumButtonGroupEditor propertyRecord={record} />);
    await waitForElement(() => renderedComponent.getByTestId("Blue"));
    expect(blueButton.classList.contains("nz-is-disabled")).to.be.equal(!TestUtils.blueEnumValueIsEnabled);
  });

  it("renders editor for 'enum' type and 'enum-buttongroup' editor", async () => {
    const propertyRecord = TestUtils.createEnumProperty("Test", 1);
    TestUtils.addEnumButtonGroupEditorSpecification(propertyRecord);
    const renderedComponent = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={() => { }} onCancel={() => { }} />);
    expect(await waitForElement(() => renderedComponent.getByTestId("Blue"))).not.to.be.null;
    expect(renderedComponent.container.querySelector(".components-enumbuttongroup-editor")).to.not.be.null;
  });

  class MineDataController extends DataControllerBase {
    public override async validateValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
      return { encounteredError: true, errorMessage: { priority: OutputMessagePriority.Error, briefMessage: "Test"} };
    }
  }

  it("should not commit if DataController fails to validate", async () => {
    PropertyEditorManager.registerDataController("myData", MineDataController);
    const record = TestUtils.createEnumStringProperty("Test", "red");
    TestUtils.addEnumButtonGroupEditorSpecification(record);
    record.property.dataController = "myData";

    const spyOnCommit = sinon.spy();
    const renderedComponent = render(<EditorContainer propertyRecord={record} title="abc" onCommit={spyOnCommit} onCancel={() => { }} />);
    expect(renderedComponent).not.to.be.undefined;

    expect(await waitForElement(() => renderedComponent.getByTestId("Green"))).not.to.be.null;
    const greenButton = renderedComponent.getByTestId("Green");

    fireEvent.keyDown(greenButton, { key: SpecialKey.Enter });
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.calledOnce).to.be.false;

    PropertyEditorManager.deregisterDataController("myData");
  });

});
