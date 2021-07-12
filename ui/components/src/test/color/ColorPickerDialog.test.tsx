/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import sinon from "sinon";
import { expect } from "chai";
import { cleanup, fireEvent, render } from "@testing-library/react";
import TestUtils from "../TestUtils";
import { ColorByName, ColorDef } from "@bentley/imodeljs-common";
import { ColorPickerDialog } from "../../ui-components";

describe("ColorPickerDialog", () => {

  before(async () => {
    await TestUtils.initializeUiComponents();
  });

  after(() => {
    TestUtils.terminateUiComponents();
  });

  afterEach(cleanup);

  describe("renders", () => {
    it("should render", () => {
      const wrapper = render(<ColorPickerDialog dialogTitle="-texting-title-" color={ColorDef.blue} onOkResult={(_selectedColor: ColorDef) => { }} onCancelResult={() => { }} />);
      expect(wrapper.findByText("-texting-title-")).not.to.be.null;
    });

    it("should render with presets", () => {
      const defaultColors =
        [
          ColorDef.create(ColorByName.red),
          ColorDef.create(ColorByName.orange),
          ColorDef.create(ColorByName.yellow),
          ColorDef.create(ColorByName.green),
          ColorDef.create(ColorByName.blue),
          ColorDef.create(ColorByName.olive),
        ];
      const wrapper = render(<ColorPickerDialog dialogTitle="-texting-title-" color={ColorDef.blue} colorPresets={defaultColors} onOkResult={(_selectedColor: ColorDef) => { }} onCancelResult={() => { }} />);
      expect(wrapper.container.querySelectorAll("button.components-color-swatch.components-colorpicker-panel-swatch").length).to.eq(6);
    });

    it("should trigger onCancelResult", () => {
      const spyOnCancel = sinon.spy();

      const wrapper = render(<ColorPickerDialog dialogTitle="-texting-title-" color={ColorDef.blue} onOkResult={(_selectedColor: ColorDef) => { }} onCancelResult={spyOnCancel} />);
      const cancelButton = wrapper.container.querySelector("button.core-dialog-button.dialog-button-cancel") as HTMLElement;
      expect(cancelButton).not.to.be.null;
      fireEvent.click(cancelButton);
      expect(spyOnCancel).to.be.calledOnce;
    });

    it("should trigger onOkResult with initial color", () => {
      const spyOnOK = sinon.spy();

      function handleOK(color: ColorDef): void {
        expect(color.tbgr).to.be.equal(ColorByName.blue as number);
        spyOnOK();
      }

      const wrapper = render(<ColorPickerDialog dialogTitle="-texting-title-" color={ColorDef.blue} onOkResult={handleOK} onCancelResult={() => { }} />);
      const okButton = wrapper.container.querySelector("button.core-dialog-button.dialog-button-ok.iui-cta") as HTMLElement;
      expect(okButton).not.to.be.null;
      fireEvent.click(okButton);
      expect(spyOnOK).to.be.calledOnce;
    });

    it("should trigger onOkResult with preset color (black)", () => {
      const spyOnOK = sinon.spy();

      const defaultColors =
        [
          ColorDef.create(ColorByName.black),
          ColorDef.create(ColorByName.red),
          ColorDef.create(ColorByName.orange),
          ColorDef.create(ColorByName.yellow),
          ColorDef.create(ColorByName.green),
          ColorDef.create(ColorByName.blue),
          ColorDef.create(ColorByName.olive),
        ];

      function handleOK(color: ColorDef): void {
        expect(color.tbgr).to.be.equal(ColorByName.black as number);
        spyOnOK();
      }

      const wrapper = render(<ColorPickerDialog dialogTitle="-texting-title-" color={ColorDef.blue} colorPresets={defaultColors} onOkResult={handleOK} onCancelResult={() => { }} />);
      const panel = wrapper.getByTestId("components-colorpicker-panel");
      const colorButton = panel.querySelector("button.components-color-swatch.components-colorpicker-panel-swatch") as HTMLElement;
      fireEvent.click(colorButton);

      const okButton = wrapper.container.querySelector("button.core-dialog-button.dialog-button-ok.iui-cta") as HTMLElement;
      fireEvent.click(okButton);
      expect(spyOnOK).to.be.calledOnce;
    });

  });
});
