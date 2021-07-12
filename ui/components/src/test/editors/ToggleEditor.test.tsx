/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { mount, shallow } from "enzyme";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";
import sinon from "sinon";
import { PrimitiveValue, PropertyRecord, PropertyValue, SpecialKey } from "@bentley/ui-abstract";
import { OutputMessagePriority } from "@bentley/imodeljs-frontend";
import { EditorContainer, PropertyUpdatedArgs } from "../../ui-components/editors/EditorContainer";
import { ToggleEditor } from "../../ui-components/editors/ToggleEditor";
import TestUtils from "../TestUtils";
import { AsyncValueProcessingResult, DataControllerBase, PropertyEditorManager } from "../../ui-components/editors/PropertyEditorManager";

describe("<ToggleEditor />", () => {
  it("should render", () => {
    mount(<ToggleEditor />);
  });

  it("renders correctly", () => {
    shallow(<ToggleEditor />).should.matchSnapshot();
  });

  it("getValue returns proper value after componentDidMount & setState", async () => {
    const record = TestUtils.createBooleanProperty("Test", false, "toggle");
    const wrapper = mount(<ToggleEditor propertyRecord={record} />);

    await TestUtils.flushAsyncOperations();
    const editor = wrapper.instance() as ToggleEditor;
    expect(editor.state.toggleValue).to.equal(false);

    wrapper.unmount();
  });

  it("isDisabled is set by the property record", async () => {
    const record = TestUtils.createBooleanProperty("Test", false, "toggle");
    record.isDisabled = true;
    const wrapper = mount(<ToggleEditor propertyRecord={record} />);

    await TestUtils.flushAsyncOperations();
    const editor = wrapper.instance() as ToggleEditor;
    expect(editor.state.isDisabled).to.equal(true);

    wrapper.unmount();
  });

  it("HTML input onChange updates boolean value", async () => {
    const record = TestUtils.createBooleanProperty("Test1", false, "toggle");
    const spyOnCommit = sinon.spy();
    function handleCommit(_commit: PropertyUpdatedArgs): void {
      spyOnCommit();
    }
    const wrapper = mount(<ToggleEditor propertyRecord={record} onCommit={handleCommit} />);
    const editor = wrapper.instance() as ToggleEditor;
    const inputNode = wrapper.find("input");

    expect(inputNode.length).to.eq(1);
    if (inputNode) {
      const testValue = true;
      inputNode.simulate("change", { target: { value: testValue } });
      wrapper.update();
      expect(editor.state.toggleValue).to.equal(testValue);
      await TestUtils.flushAsyncOperations();
      expect(spyOnCommit.calledOnce).to.be.true;
    }
  });

  it("onCommit should be called for Space", async () => {
    let booleanValue = false;
    const propertyRecord = TestUtils.createBooleanProperty("Test2", booleanValue, "toggle");
    const spyOnCommit = sinon.spy();
    function handleCommit(commit: PropertyUpdatedArgs): void {
      booleanValue = (commit.newValue as PrimitiveValue).value as boolean;
      spyOnCommit();
    }
    const wrapper = mount(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={handleCommit} onCancel={() => { }} />);
    const inputNode = wrapper.find("input");
    expect(inputNode.length).to.eq(1);

    const testValue = true;
    inputNode.simulate("change", { target: { value: testValue } });

    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.calledOnce).to.be.true;
    expect(booleanValue).to.be.true;
  });

  it("componentDidUpdate updates the value", async () => {
    const record = TestUtils.createBooleanProperty("Test", false, "toggle");
    const wrapper = mount(<ToggleEditor propertyRecord={record} />);

    await TestUtils.flushAsyncOperations();
    const editor = wrapper.instance() as ToggleEditor;
    expect(editor.state.toggleValue).to.equal(false);

    const newRecord = TestUtils.createBooleanProperty("Test", true);
    wrapper.setProps({ propertyRecord: newRecord });
    await TestUtils.flushAsyncOperations();
    expect(editor.state.toggleValue).to.equal(true);

    wrapper.unmount();
  });

  class MineDataController extends DataControllerBase {
    public override async validateValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
      return { encounteredError: true, errorMessage: { priority: OutputMessagePriority.Error, briefMessage: "Test"} };
    }
  }

  it("should not commit if DataController fails to validate", async () => {
    PropertyEditorManager.registerDataController("myData", MineDataController);
    const propertyRecord = TestUtils.createBooleanProperty("Test2", false, "toggle");
    propertyRecord.property.dataController = "myData";

    const spyOnCommit = sinon.spy();
    const wrapper = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={spyOnCommit} onCancel={() => { }} />);
    const inputNode = wrapper.container.querySelector("input");
    expect(inputNode).not.to.be.null;

    fireEvent.keyDown(inputNode as HTMLElement, { key: SpecialKey.Enter });
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.calledOnce).to.be.false;

    PropertyEditorManager.deregisterDataController("myData");
  });

});
