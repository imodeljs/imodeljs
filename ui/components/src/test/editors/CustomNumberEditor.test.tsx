/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { mount, shallow } from "enzyme";
import React from "react";
import * as sinon from "sinon";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { IconEditorParams, InputEditorSizeParams, PrimitiveValue, PropertyEditorParamTypes, PropertyRecord, PropertyValue, SpecialKey } from "@bentley/ui-abstract";
import { OutputMessagePriority } from "@bentley/imodeljs-frontend";
import { CustomNumberEditor } from "../../ui-components/editors/CustomNumberEditor";
import { EditorContainer, PropertyUpdatedArgs } from "../../ui-components/editors/EditorContainer";
import TestUtils from "../TestUtils";
import { AsyncValueProcessingResult, DataControllerBase, PropertyEditorManager } from "../../ui-components/editors/PropertyEditorManager";

// cSpell:ignore customnumber

const numVal = 3.345689;
const displayVal = "3.35";

describe("<CustomNumberEditor />", () => {
  afterEach(cleanup);

  it("should render", () => {

    const record = TestUtils.createCustomNumberProperty("FormattedNumber", numVal, displayVal);
    const renderedComponent = render(<CustomNumberEditor propertyRecord={record} />);
    expect(renderedComponent).not.to.be.undefined;
  });

  it("renders correctly with style", () => {
    const record = TestUtils.createCustomNumberProperty("FormattedNumber", numVal, displayVal);
    shallow(<CustomNumberEditor propertyRecord={record}  style={{color: "red"}} />).should.matchSnapshot();
  });

  it("change input value", () => {

    const record = TestUtils.createCustomNumberProperty("FormattedNumber", numVal, displayVal);
    const renderedComponent = render(<CustomNumberEditor propertyRecord={record} />);
    expect(renderedComponent).not.to.be.undefined;
    const inputField = renderedComponent.getByTestId("components-customnumber-editor") as HTMLInputElement;
    expect(inputField.value).to.be.equal(displayVal);
    const newValue = "7.777";
    fireEvent.change(inputField, { target: { value: newValue } });
    expect(inputField.value).to.be.equal(newValue);
  });

  it("EditorContainer with CustomNumberPropertyEditor", async () => {
    const spyOnCommit = sinon.spy();
    const spyOnCancel = sinon.spy();
    function handleCommit(commit: PropertyUpdatedArgs): void {
      const numValue = (commit.newValue as PrimitiveValue).value as number;
      const displayValue = (commit.newValue as PrimitiveValue).displayValue;
      expect(numValue).to.be.equal(7.777);
      expect(displayValue).to.be.equal("7.78");
      spyOnCommit();
    }
    const propertyRecord = TestUtils.createCustomNumberProperty("FormattedNumber", numVal, displayVal);
    const renderedComponent = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={handleCommit} onCancel={spyOnCancel} />);
    // renderedComponent.debug();
    const inputField = renderedComponent.getByTestId("components-customnumber-editor") as HTMLInputElement;
    expect(inputField.value).to.be.equal(displayVal);
    const newValue = "7.777";
    fireEvent.change(inputField, { target: { value: newValue } });
    expect(inputField.value).to.be.equal(newValue);
    const container = renderedComponent.getByTestId("editor-container") as HTMLSpanElement;
    fireEvent.keyDown(container, { key: "Enter" });
    await TestUtils.flushAsyncOperations();
    // renderedComponent.debug();
    expect(spyOnCommit).to.be.calledOnce;
    fireEvent.change(inputField, { target: { value: "66" } });
    expect(inputField.value).to.be.equal("66");

    // resetToOriginalValue
    fireEvent.keyDown(inputField, { key: SpecialKey.Escape });
    expect(inputField.value).to.be.equal(displayVal);
    expect(spyOnCancel).not.to.be.called;

    // since value is same as original, cancel
    fireEvent.keyDown(inputField, { key: SpecialKey.Escape });
    expect(inputField.value).to.be.equal(displayVal);
    expect(spyOnCancel).to.be.calledOnce;
  });

  it("CustomNumberPropertyEditor with undefined initial display value", async () => {
    const spyOnCommit = sinon.spy();
    function handleCommit(commit: PropertyUpdatedArgs): void {
      const newNumValue = (commit.newValue as PrimitiveValue).value as number;
      const newDisplayValue = (commit.newValue as PrimitiveValue).displayValue;
      expect(newNumValue).to.be.equal(7.777);
      expect(newDisplayValue).to.be.equal("7.78");
      spyOnCommit();
    }

    function handleBadKeyinCommit(commit: PropertyUpdatedArgs): void {
      const newNumValue = (commit.newValue as PrimitiveValue).value as number;
      const newDisplayValue = (commit.newValue as PrimitiveValue).displayValue;
      expect(newNumValue).to.be.equal(numVal);
      expect(newDisplayValue).to.be.equal(displayVal);
      spyOnCommit();
    }

    const propertyRecord = TestUtils.createCustomNumberProperty("FormattedNumber", numVal);
    // add size and width params for testing
    if (propertyRecord.property.editor && propertyRecord.property.editor.params) {
      const inputEditorSizeParams: InputEditorSizeParams = {
        type: PropertyEditorParamTypes.InputEditorSize,
        size: 8,
        maxLength: 20,
      };
      propertyRecord.property.editor.params.push(inputEditorSizeParams);
    }
    const renderedComponent = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={handleCommit} onCancel={() => { }} />);
    // renderedComponent.debug();
    const inputField = renderedComponent.getByTestId("components-customnumber-editor") as HTMLInputElement;
    expect(inputField.value).to.be.equal(displayVal);
    const newValue = "7.777";
    fireEvent.change(inputField, { target: { value: newValue } });
    expect(inputField.value).to.be.equal(newValue);
    const container = renderedComponent.getByTestId("editor-container") as HTMLSpanElement;
    fireEvent.keyDown(container, { key: "Enter" });
    await TestUtils.flushAsyncOperations();
    // renderedComponent.debug();
    expect(spyOnCommit).to.be.calledOnce;

    // trigger componentDidUpdate processing
    const newPropertyRecord = TestUtils.createCustomNumberProperty("FormattedNumber", numVal, displayVal);
    renderedComponent.rerender(<EditorContainer propertyRecord={newPropertyRecord} title="abc" onCommit={handleBadKeyinCommit} onCancel={() => { }} />);

    // handle bad value processing
    const badValue = "abcd";
    fireEvent.change(inputField, { target: { value: badValue } });
    fireEvent.keyDown(container, { key: "Enter" });
    await TestUtils.flushAsyncOperations();  // make sure handleBadKeyinCommit is processed
  });

  it("EditorContainer with readonly CustomNumberPropertyEditor", async () => {
    const propertyRecord = TestUtils.createCustomNumberProperty("FormattedNumber", numVal, displayVal);
    propertyRecord.isReadonly = true;
    propertyRecord.isDisabled = true;

    const spyOnCommit = sinon.spy();

    function handleCommit(commit: PropertyUpdatedArgs): void {
      const newNumValue = (commit.newValue as PrimitiveValue).value as number;
      const newDisplayValue = (commit.newValue as PrimitiveValue).displayValue;
      expect(newNumValue).to.be.equal(numVal);
      expect(newDisplayValue).to.be.equal(displayVal);
      spyOnCommit();
    }

    const renderedComponent = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={handleCommit} onCancel={() => { }} />);
    const inputField = renderedComponent.getByTestId("components-customnumber-editor") as HTMLInputElement;
    expect(inputField.value).to.be.equal(displayVal);
    const newValue = "7.777";
    fireEvent.change(inputField, { target: { value: newValue } });
    expect(inputField.value).to.be.equal(displayVal);
    const container = renderedComponent.getByTestId("editor-container") as HTMLSpanElement;
    fireEvent.keyDown(container, { key: "Enter" });
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit).to.be.calledOnce;
    // renderedComponent.debug();
    expect(inputField.value).to.be.equal(displayVal);
  });

  it("test with no editor params", async () => {
    const propertyRecord = TestUtils.createCustomNumberProperty("FormattedNumber", numVal, displayVal);
    propertyRecord.property.editor!.params!.splice(0, 1);

    const renderedComponent = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={() => { }} onCancel={() => { }} />);
    // renderedComponent.debug();
    const inputField = renderedComponent.queryByTestId("components-customnumber-editor") as HTMLInputElement;
    expect(inputField).to.be.null;
  });

  it("should support IconEditor params", async () => {
    const iconSpec = "icon-placeholder";
    const iconParams: IconEditorParams = {
      type: PropertyEditorParamTypes.Icon,
      definition: { iconSpec },
    };

    const propertyRecord = TestUtils.createCustomNumberProperty("FormattedNumber", numVal, displayVal, [iconParams]);
    const wrapper = mount(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={() => { }} onCancel={() => { }} />);
    await TestUtils.flushAsyncOperations();

    const textEditor = wrapper.find(CustomNumberEditor);
    expect(textEditor.length).to.eq(1);
    expect(textEditor.state("iconSpec")).to.eq(iconSpec);

    wrapper.unmount();
  });

  class MineDataController extends DataControllerBase {
    public override async validateValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
      return { encounteredError: true, errorMessage: { priority: OutputMessagePriority.Error, briefMessage: "Test"} };
    }
  }

  it("should not commit if DataController fails to validate", async () => {
    PropertyEditorManager.registerDataController("myData", MineDataController);
    const propertyRecord = TestUtils.createCustomNumberProperty("FormattedNumber", numVal, displayVal);
    propertyRecord.property.dataController = "myData";

    const spyOnCommit = sinon.spy();
    const wrapper = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={spyOnCommit} onCancel={() => { }} />);
    const inputNode = wrapper.queryByTestId("components-customnumber-editor") as HTMLInputElement;
    expect(inputNode).not.to.be.null;

    fireEvent.keyDown(inputNode as HTMLElement, { key: SpecialKey.Enter });
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.calledOnce).to.be.false;

    PropertyEditorManager.deregisterDataController("myData");
  });

});
