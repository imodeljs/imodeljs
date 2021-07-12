/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { mount, shallow } from "enzyme";
import sinon from "sinon";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";
import { IconEditorParams, InputEditorSizeParams, PropertyConverterInfo, PropertyEditorInfo, PropertyEditorParamTypes,
  PropertyRecord, PropertyValue, SpecialKey,
} from "@bentley/ui-abstract";
import { MockRender, OutputMessagePriority } from "@bentley/imodeljs-frontend";
import { TextEditor } from "../../ui-components/editors/TextEditor";
import TestUtils from "../TestUtils";
import { EditorContainer, PropertyUpdatedArgs } from "../../ui-components/editors/EditorContainer";
import { AsyncValueProcessingResult, DataControllerBase, PropertyEditorManager } from "../../ui-components/editors/PropertyEditorManager";

describe("<TextEditor />", () => {
  it("should render", () => {
    mount(<TextEditor />);
  });

  it("renders correctly", () => {
    shallow(<TextEditor />).should.matchSnapshot();
  });

  it("renders correctly with style", () => {
    shallow(<TextEditor style={{ color: "red" }} />).should.matchSnapshot();
  });

  it("getValue returns proper value after componentDidMount & setState", async () => {
    const record = TestUtils.createPrimitiveStringProperty("Test", "MyValue");
    const wrapper = mount(<TextEditor propertyRecord={record} />);

    await TestUtils.flushAsyncOperations();
    const editor = wrapper.instance() as TextEditor;
    expect(editor.state.inputValue).to.equal("MyValue");

    wrapper.unmount();
  });

  it("should support record.property.converter?.name", async () => {
    const record = TestUtils.createPrimitiveStringProperty("Test", "MyValue");
    const convertInfo: PropertyConverterInfo = { name: "" };
    record.property.converter = convertInfo;

    const wrapper = mount(<TextEditor propertyRecord={record} />);

    await TestUtils.flushAsyncOperations();
    const editor = wrapper.instance() as TextEditor;
    expect(editor.state.inputValue).to.equal("MyValue");

    wrapper.unmount();
  });

  it("HTML input onChange updates value", () => {
    const record = TestUtils.createPrimitiveStringProperty("Test1", "MyValue");
    const wrapper = mount(<TextEditor propertyRecord={record} />);
    const editor = wrapper.instance() as TextEditor;
    const inputNode = wrapper.find("input");

    expect(inputNode.length).to.eq(1);
    if (inputNode) {
      const testValue = "My new value";
      inputNode.simulate("change", { target: { value: testValue } });
      wrapper.update();
      expect(editor.state.inputValue).to.equal(testValue);
    }
  });

  it("componentDidUpdate updates the value", async () => {
    const record = TestUtils.createPrimitiveStringProperty("Test", "MyValue");
    const wrapper = mount(<TextEditor propertyRecord={record} />);

    await TestUtils.flushAsyncOperations();
    const editor = wrapper.instance() as TextEditor;
    expect(editor.state.inputValue).to.equal("MyValue");

    const testValue = "MyNewValue";
    const newRecord = TestUtils.createPrimitiveStringProperty("Test", testValue);
    wrapper.setProps({ propertyRecord: newRecord });
    await TestUtils.flushAsyncOperations();
    expect(editor.state.inputValue).to.equal(testValue);

    wrapper.unmount();
  });

  it("should support InputEditorSize params", async () => {
    const size = 4;
    const maxLength = 60;
    const editorInfo: PropertyEditorInfo = {
      params: [
        {
          type: PropertyEditorParamTypes.InputEditorSize,
          size,
          maxLength,
        } as InputEditorSizeParams,
      ],
    };

    const record = TestUtils.createPrimitiveStringProperty("Test", "MyValue", "Test", editorInfo);
    const wrapper = mount(<TextEditor propertyRecord={record} />);
    await TestUtils.flushAsyncOperations();

    const textEditor = wrapper.find(TextEditor);
    expect(textEditor.length).to.eq(1);
    expect(textEditor.state("size")).to.eq(size);
    expect(textEditor.state("maxLength")).to.eq(maxLength);

    wrapper.unmount();
  });

  it("should support IconEditor params", async () => {
    const iconSpec = "icon-placeholder";
    const editorInfo: PropertyEditorInfo = {
      params: [
        {
          type: PropertyEditorParamTypes.Icon,
          definition: { iconSpec },
        } as IconEditorParams,
      ],
    };

    const record = TestUtils.createPrimitiveStringProperty("Test", "MyValue", "Test", editorInfo);
    const wrapper = mount(<TextEditor propertyRecord={record} />);
    await TestUtils.flushAsyncOperations();

    const textEditor = wrapper.find(TextEditor);
    expect(textEditor.length).to.eq(1);
    expect(textEditor.state("iconSpec")).to.eq(iconSpec);

    wrapper.unmount();
  });

  it("should call onCommit for Enter", async () => {
    const propertyRecord = TestUtils.createPrimitiveStringProperty("Test", "MyValue");
    const convertInfo: PropertyConverterInfo = { name: "" };
    propertyRecord.property.converter = convertInfo;

    const spyOnCommit = sinon.spy();
    function handleCommit(_commit: PropertyUpdatedArgs): void {
      spyOnCommit();
    }
    const wrapper = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={handleCommit} onCancel={() => { }} />);
    const inputNode = wrapper.container.querySelector("input");
    expect(inputNode).not.to.be.null;

    fireEvent.keyDown(inputNode as HTMLElement, { key: SpecialKey.Enter });
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.calledOnce).to.be.true;
  });

  describe("Needs IModelApp", () => {
    before(async () => {
      await TestUtils.initializeUiComponents();
      await MockRender.App.startup();
    });

    after(async () => {
      await MockRender.App.shutdown();
      TestUtils.terminateUiComponents();
    });

    class MineDataController extends DataControllerBase {
      public override async validateValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
        return { encounteredError: true, errorMessage: { priority: OutputMessagePriority.Error, briefMessage: "Test"} };
      }
    }

    it("should not commit if DataController fails to validate", async () => {
      PropertyEditorManager.registerDataController("myData", MineDataController);
      const propertyRecord = TestUtils.createPrimitiveStringProperty("Test", "MyValue");
      const convertInfo: PropertyConverterInfo = { name: "" };
      propertyRecord.property.converter = convertInfo;
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

    class MineDataController2 extends DataControllerBase {
      public override async commitValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
        return { encounteredError: true, errorMessage: { priority: OutputMessagePriority.Error, briefMessage: "Test"} };
      }
    }

    it("should not commit if DataController fails to commit", async () => {
      PropertyEditorManager.registerDataController("myData", MineDataController2);
      const propertyRecord = TestUtils.createPrimitiveStringProperty("Test", "MyValue");
      const convertInfo: PropertyConverterInfo = { name: "" };
      propertyRecord.property.converter = convertInfo;
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

});
