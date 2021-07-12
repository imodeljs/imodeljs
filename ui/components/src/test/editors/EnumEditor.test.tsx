/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { mount, shallow } from "enzyme";
import * as React from "react";
import sinon from "sinon";
import { fireEvent, render } from "@testing-library/react";
import { EditorContainer, PropertyUpdatedArgs } from "../../ui-components/editors/EditorContainer";
import { EnumEditor } from "../../ui-components/editors/EnumEditor";
import TestUtils from "../TestUtils";
import { AsyncValueProcessingResult, DataControllerBase, PropertyEditorManager } from "../../ui-components/editors/PropertyEditorManager";
import { PropertyRecord, PropertyValue, SpecialKey } from "@bentley/ui-abstract";
import { OutputMessagePriority } from "@bentley/imodeljs-frontend";
import { handleError, selectChangeValueByIndex, stubScrollIntoView } from "../test-helpers/misc";

describe("<EnumEditor />", () => {
  stubScrollIntoView();

  it("should render", () => {
    mount(<EnumEditor />);
  });

  it("renders correctly", () => {
    shallow(<EnumEditor />).should.matchSnapshot();
  });

  it("renders correctly with style", () => {
    shallow(<EnumEditor style={{ color: "red" }} />).should.matchSnapshot();
  });

  it("getValue returns proper value after componentDidMount & setState", async () => {
    const record = TestUtils.createEnumProperty("Test", 0);
    const wrapper = mount(<EnumEditor propertyRecord={record} />);

    await TestUtils.flushAsyncOperations();
    const editor = wrapper.instance() as EnumEditor;
    expect(editor.state.selectValue).to.equal(0);

    wrapper.unmount();
  });

  it("HTML select onChange updates string value", async () => {
    const record = TestUtils.createEnumProperty("Test1", "0");
    const spyOnCommit = sinon.spy();
    function handleCommit(_commit: PropertyUpdatedArgs): void {
      spyOnCommit();
    }
    const wrapper = render(<EnumEditor propertyRecord={record} onCommit={handleCommit} />);
    await TestUtils.flushAsyncOperations();
    const selectNode = wrapper.getByTestId("components-select-editor");
    expect(selectNode).not.to.be.null;

    selectChangeValueByIndex(selectNode, 1, handleError);
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.calledOnce).to.be.true;
  });

  it("HTML select onChange updates numeric value", async () => {
    const record = TestUtils.createEnumProperty("Test1", 0);
    const spyOnCommit = sinon.spy();
    function handleCommit(_commit: PropertyUpdatedArgs): void {
      spyOnCommit();
    }
    const wrapper = render(<EnumEditor propertyRecord={record} onCommit={handleCommit} />);
    await TestUtils.flushAsyncOperations();
    const selectNode = wrapper.getByTestId("components-select-editor");
    expect(selectNode).not.to.be.null;

    selectChangeValueByIndex(selectNode, 1, handleError);
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.calledOnce).to.be.true;
  });

  it("onCommit should not be called for escape", async () => {
    const propertyRecord = TestUtils.createEnumProperty("Test", 0);
    const spyOnCommit = sinon.spy();
    function handleCommit(_commit: PropertyUpdatedArgs): void {
      spyOnCommit();
    }
    const wrapper = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={handleCommit} onCancel={() => { }} />);
    await TestUtils.flushAsyncOperations();
    const selectNode = wrapper.getByTestId("components-select-editor");
    expect(selectNode).not.to.be.null;

    fireEvent.keyDown(selectNode, { key: SpecialKey.Escape });
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.called).to.be.false;
  });

  it.skip("onCommit should be called for blur", async () => {
    const propertyRecord = TestUtils.createEnumProperty("Test", 0);
    const spyOnCommit = sinon.spy();
    function handleCommit(_commit: PropertyUpdatedArgs): void {
      spyOnCommit();
    }
    const wrapper = mount(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={handleCommit} onCancel={() => { }} />);
    const selectNode = wrapper.find("select");
    expect(selectNode.length).to.eq(1);

    selectNode.simulate("blur");
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.calledOnce).to.be.true;
  });

  it("componentDidUpdate updates the value", async () => {
    const record = TestUtils.createEnumProperty("Test", 0);
    const wrapper = mount(<EnumEditor propertyRecord={record} />);

    await TestUtils.flushAsyncOperations();
    const editor = wrapper.instance() as EnumEditor;
    expect(editor.state.selectValue).to.equal(0);

    const testValue = 1;
    const newRecord = TestUtils.createEnumProperty("Test", testValue);
    wrapper.setProps({ propertyRecord: newRecord });
    await TestUtils.flushAsyncOperations();
    expect(editor.state.selectValue).to.equal(testValue);

    wrapper.unmount();
  });

  class MineDataController extends DataControllerBase {
    public override async validateValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
      return { encounteredError: true, errorMessage: { priority: OutputMessagePriority.Error, briefMessage: "Test" } };
    }
  }

  it("should not commit if DataController fails to validate", async () => {
    PropertyEditorManager.registerDataController("myData", MineDataController);
    const record = TestUtils.createEnumProperty("Test", 0);
    record.property.dataController = "myData";

    const spyOnCommit = sinon.spy();
    const spyOnCancel = sinon.spy();
    const renderedComponent = render(<EditorContainer propertyRecord={record} title="abc" onCommit={spyOnCommit} onCancel={spyOnCancel} />);
    expect(renderedComponent).not.to.be.undefined;

    const selectNode = renderedComponent.getByTestId("components-select-editor");
    expect(selectNode).not.to.be.null;

    fireEvent.blur(selectNode);
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.called).to.be.false;

    fireEvent.keyDown(selectNode, { key: SpecialKey.Escape });
    await TestUtils.flushAsyncOperations();
    expect(spyOnCancel.called).to.be.true;

    PropertyEditorManager.deregisterDataController("myData");
  });

  it("keyDown should propagate up", async () => {
    const propertyRecord = TestUtils.createEnumProperty("Test", 0);
    const spyParent = sinon.spy();
    const wrapper = render(
      <div onKeyDown={spyParent} role="presentation">
        <EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={() => { }} onCancel={() => { }} />
      </div>
    );
    await TestUtils.flushAsyncOperations();
    const selectNode = wrapper.getByTestId("components-select-editor");
    expect(selectNode).not.to.be.null;

    fireEvent.keyDown(selectNode, { key: SpecialKey.PageDown });
    await TestUtils.flushAsyncOperations();
    expect(spyParent.called).to.be.true;
  });

});
