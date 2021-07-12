/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { mount, shallow } from "enzyme";
import { cleanup, fireEvent, render, waitForElement } from "@testing-library/react";
import sinon from "sinon";
import * as React from "react";
import { BasePropertyEditorParams, PropertyEditorParamTypes, PropertyRecord, PropertyValue,
  SliderEditorParams, SpecialKey, StandardEditorNames } from "@bentley/ui-abstract";
import { SliderEditor } from "../../ui-components/editors/SliderEditor";
import TestUtils from "../TestUtils";
import { EditorContainer } from "../../ui-components/editors/EditorContainer";
import { AsyncValueProcessingResult, DataControllerBase, PropertyEditorManager } from "../../ui-components/editors/PropertyEditorManager";
import { OutputMessagePriority } from "@bentley/imodeljs-frontend";

describe("<SliderEditor />", () => {
  before(async () => {
    await TestUtils.initializeUiComponents();
  });

  it("should render", () => {
    mount(<SliderEditor />);
  });

  it("renders correctly", () => {
    shallow(<SliderEditor />).should.matchSnapshot();
  });

  it("getValue returns proper value after componentDidMount & setState", async () => {
    const record = TestUtils.createNumericProperty("Test", 50, StandardEditorNames.Slider);
    const wrapper = mount(<SliderEditor propertyRecord={record} />);

    await TestUtils.flushAsyncOperations();
    const editor = wrapper.instance() as SliderEditor;
    expect(editor.state.value).to.equal(50);

    wrapper.unmount();
  });

  it("componentDidUpdate updates the value", async () => {
    const record = TestUtils.createNumericProperty("Test", 50, StandardEditorNames.Slider);
    const wrapper = mount(<SliderEditor propertyRecord={record} />);

    await TestUtils.flushAsyncOperations();
    const editor = wrapper.instance() as SliderEditor;
    expect(editor.state.value).to.equal(50);

    const testValue = 60;
    const newRecord = TestUtils.createNumericProperty("Test", testValue, StandardEditorNames.Slider);
    wrapper.setProps({ propertyRecord: newRecord });
    await TestUtils.flushAsyncOperations();
    expect(editor.state.value).to.equal(testValue);

    wrapper.unmount();
  });

  it("should support Slider Editor Params", async () => {
    const editorParams: BasePropertyEditorParams[] = [];
    const formatTooltip = (_value: number): string => "";
    const formatTick = (_tick: number): string => "";
    const getTickCount = (): number => 0;
    const getTickValues = (): number[] => [0];
    const sliderParams: SliderEditorParams = {
      type: PropertyEditorParamTypes.Slider,
      size: 100,
      minimum: 1,
      maximum: 100,
      step: 5,
      mode: 3,
      reversed: true,
      showTooltip: true,
      tooltipBelow: true,
      showMinMax: true,
      minIconSpec: "icon-placeholder",
      maxIconSpec: "icon-placeholder",
      showTicks: true,
      showTickLabels: true,
      formatTooltip,
      formatTick,
      getTickCount,
      getTickValues,
    };
    editorParams.push(sliderParams);

    const record = TestUtils.createNumericProperty("Test", 50, StandardEditorNames.Slider, editorParams);
    const wrapper = mount(<SliderEditor propertyRecord={record} />);
    await TestUtils.flushAsyncOperations();
    wrapper.update();

    const sliderEditor = wrapper.find(SliderEditor);
    expect(sliderEditor.length).to.eq(1);
    expect(sliderEditor.state("size")).to.eq(100);
    expect(sliderEditor.state("min")).to.eq(1);
    expect(sliderEditor.state("max")).to.eq(100);
    expect(sliderEditor.state("step")).to.eq(5);
    expect(sliderEditor.state("mode")).to.eq(3);
    expect(sliderEditor.state("reversed")).to.be.true;
    expect(sliderEditor.state("showTooltip")).to.be.true;
    expect(sliderEditor.state("tooltipBelow")).to.be.true;
    expect(sliderEditor.state("showMinMax")).to.be.true;
    expect(sliderEditor.state("showTicks")).to.be.true;
    expect(sliderEditor.state("showTickLabels")).to.be.true;
    expect(sliderEditor.state("formatTooltip")).to.eq(formatTooltip);
    expect(sliderEditor.state("formatTick")).to.eq(formatTick);
    expect(sliderEditor.state("getTickCount")).to.eq(getTickCount);
    expect(sliderEditor.state("getTickValues")).to.eq(getTickValues);

    expect(wrapper.find(".icon").length).to.eq(1);

    wrapper.unmount();
  });

  it("calls onCommit on OK button click", async () => {
    const spyOnCommit = sinon.spy();
    const record = TestUtils.createNumericProperty("Test", 50, StandardEditorNames.Slider);
    const wrapper = mount(<SliderEditor propertyRecord={record} onCommit={spyOnCommit} />);

    const button = wrapper.find(".components-popup-button");
    expect(button.length).to.eq(1);
    button.first().simulate("click");
    await TestUtils.flushAsyncOperations();
    wrapper.update();

    const okButton = wrapper.find("button.components-popup-ok-button");
    expect(okButton.length).to.eq(1);
    okButton.first().simulate("click");
    await TestUtils.flushAsyncOperations();
    wrapper.update();

    expect(spyOnCommit.calledOnce).to.be.true;

    wrapper.unmount();
  });

  it("calls onCancel on Cancel button click", async () => {
    const spyOnCancel = sinon.spy();
    const record = TestUtils.createNumericProperty("Test", 50, StandardEditorNames.Slider);
    const wrapper = mount(<SliderEditor propertyRecord={record} onCancel={spyOnCancel} />);

    const button = wrapper.find(".components-popup-button");
    expect(button.length).to.eq(1);
    button.first().simulate("click");
    await TestUtils.flushAsyncOperations();
    wrapper.update();

    const cancelButton = wrapper.find("button.components-popup-cancel-button");
    expect(cancelButton.length).to.eq(1);
    cancelButton.first().simulate("click");
    await TestUtils.flushAsyncOperations();
    wrapper.update();

    expect(spyOnCancel.calledOnce).to.be.true;

    wrapper.unmount();
  });

  it("calls onCommit on Enter key", async () => {
    const spyOnCommit = sinon.spy();
    const record = TestUtils.createNumericProperty("Test", 50, StandardEditorNames.Slider);
    const wrapper = mount(<SliderEditor propertyRecord={record} onCommit={spyOnCommit} />);

    const button = wrapper.find(".components-popup-button");
    expect(button.length).to.eq(1);
    button.first().simulate("click");
    await TestUtils.flushAsyncOperations();
    wrapper.update();

    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, view: window, key: "Enter" }));
    await TestUtils.flushAsyncOperations();

    expect(spyOnCommit.calledOnce).to.be.true;

    wrapper.unmount();
  });

  it("calls onCancel on Escape key", async () => {
    const spyOnCancel = sinon.spy();
    const record = TestUtils.createNumericProperty("Test", 50, StandardEditorNames.Slider);
    const wrapper = mount(<SliderEditor propertyRecord={record} onCancel={spyOnCancel} />);

    const button = wrapper.find(".components-popup-button");
    expect(button.length).to.eq(1);
    button.first().simulate("click");
    await TestUtils.flushAsyncOperations();
    wrapper.update();

    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, view: window, key: "Escape" }));
    await TestUtils.flushAsyncOperations();

    expect(spyOnCancel.calledOnce).to.be.true;

    wrapper.unmount();
  });

  it("renders editor for 'number' type and 'slider' editor using SliderEditor", () => {
    const propertyRecord = TestUtils.createNumericProperty("Test", 50, StandardEditorNames.Slider);
    const renderedComponent = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={() => { }} onCancel={() => { }} />);
    expect(renderedComponent.container.querySelector(".components-slider-editor")).to.not.be.empty;
    cleanup();
  });

  it("calls onCommit for Change", async () => {
    const propertyRecord = TestUtils.createNumericProperty("Test", 50, StandardEditorNames.Slider);
    const spyOnCommit = sinon.spy();
    function handleCommit(): void {
      spyOnCommit();
    }
    const component = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={handleCommit} onCancel={() => { }} />);

    const button = component.getByTestId("components-popup-button");
    expect(button).to.exist;
    fireEvent.click(button);
    await TestUtils.flushAsyncOperations();

    const handle = component.getByTestId("core-slider-handle");
    expect(handle).to.exist;
    fireEvent.mouseDown(handle);
    fireEvent.mouseUp(handle);
    await TestUtils.flushAsyncOperations();

    const ok = component.getByTestId("components-popup-ok-button");
    expect(ok).to.exist;
    fireEvent.click(ok);
    await TestUtils.flushAsyncOperations();

    expect(spyOnCommit.calledOnce).to.be.true;
    cleanup();
  });

  class MineDataController extends DataControllerBase {
    public override async validateValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
      return { encounteredError: true, errorMessage: { priority: OutputMessagePriority.Error, briefMessage: "Test"} };
    }
  }

  it("should not commit if DataController fails to validate", async () => {
    PropertyEditorManager.registerDataController("myData", MineDataController);
    const propertyRecord = TestUtils.createNumericProperty("Test", 50, StandardEditorNames.Slider);
    propertyRecord.property.dataController = "myData";

    const spyOnCommit = sinon.spy();
    const renderedComponent = render(<EditorContainer propertyRecord={propertyRecord} title="abc" onCommit={spyOnCommit} onCancel={() => { }} />);
    expect(renderedComponent).not.to.be.undefined;
    const popupButton = await waitForElement(() => renderedComponent.getByTestId("components-popup-button"));
    expect(popupButton).not.to.be.null;

    fireEvent.keyDown(popupButton, { key: SpecialKey.Enter });
    await TestUtils.flushAsyncOperations();
    expect(spyOnCommit.called).to.be.false;

    PropertyEditorManager.deregisterDataController("myData");
  });

});
