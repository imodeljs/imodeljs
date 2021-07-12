/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as React from "react";
import {
  IconEditorParams, PropertyDescription, PropertyEditorParams, PropertyEditorParamTypes, PropertyRecord, PropertyValue, PropertyValueFormat,
} from "@bentley/ui-abstract";
import { AsyncValueProcessingResult, BasicPropertyEditor, DataControllerBase, PropertyEditorBase, PropertyEditorManager } from "../../ui-components/editors/PropertyEditorManager";
import { TextEditor } from "../../ui-components/editors/TextEditor";

// cspell:ignore badeditor newvalue

describe("PropertyEditorManager", () => {
  it("createEditor should create a BasicPropertyEditor for unknown type", () => {
    const propertyEditor = PropertyEditorManager.createEditor("test");
    expect(propertyEditor).to.not.be.null;
    if (propertyEditor) {
      expect(propertyEditor).to.be.instanceof(BasicPropertyEditor);
      expect(React.isValidElement(propertyEditor.reactNode)).to.be.true;
    }
  });

  it("createEditor should create a BasicPropertyEditor for 'text' type", () => {
    const propertyEditor = PropertyEditorManager.createEditor("text");
    expect(propertyEditor).to.be.instanceof(BasicPropertyEditor);
  });

  it("createEditor should create a BasicPropertyEditor for 'string' type", () => {
    const propertyEditor = PropertyEditorManager.createEditor("string");
    expect(propertyEditor).to.be.instanceof(BasicPropertyEditor);
  });

  class MinePropertyEditor extends PropertyEditorBase {
    public override get containerHandlesBlur(): boolean {
      return true;
    }
    public override get containerHandlesEscape(): boolean {
      return true;
    }
    public override get containerHandlesEnter(): boolean {
      return true;
    }
    public get reactNode(): React.ReactNode {
      return <TextEditor />;
    }
  }

  it("createEditor should create a MinePropertyEditor for a registered 'mine' type", () => {
    PropertyEditorManager.registerEditor("mine", MinePropertyEditor);
    const propertyEditor = PropertyEditorManager.createEditor("mine");
    expect(propertyEditor).to.be.instanceof(MinePropertyEditor);
  });

  it("registerEditor should throw an exception if type already registered", () => {
    PropertyEditorManager.registerEditor("mine2", MinePropertyEditor);
    expect(() => PropertyEditorManager.registerEditor("mine2", MinePropertyEditor)).to.throw(Error);
  });

  it("createEditor should create a MinePropertyEditor for a registered 'mine' type and 'myEditor' editor", () => {
    PropertyEditorManager.registerEditor("mine3", MinePropertyEditor, "myEditor");
    expect(PropertyEditorManager.hasCustomEditor("mine3", "myEditor")).to.be.true;
    const propertyEditor = PropertyEditorManager.createEditor("mine3", "myEditor");
    expect(propertyEditor).to.be.instanceof(MinePropertyEditor);
  });

  class MineDataController extends DataControllerBase { }

  it("createEditor should create a MinePropertyEditor with a dataController of MineDataController", () => {
    PropertyEditorManager.registerEditor("mine4", MinePropertyEditor, "myEditor");
    PropertyEditorManager.registerDataController("myData", MineDataController);
    const propertyEditor = PropertyEditorManager.createEditor("mine4", "myEditor", "myData");
    expect(propertyEditor).to.not.be.null;
    if (propertyEditor) {
      expect(propertyEditor).to.be.instanceof(MinePropertyEditor);
      expect(propertyEditor.customDataController).to.be.instanceof(MineDataController);
    }
    PropertyEditorManager.deregisterDataController("myData");
  });

  it("createEditor should throw an Error when unregistered dataController passed", () => {
    expect(() => PropertyEditorManager.createEditor("mine4", "myEditor", "invalid")).to.throw(Error);
  });

  it("createEditor should create a MinePropertyEditor even when passed a bad editor name", () => {
    PropertyEditorManager.registerEditor("mine5", MinePropertyEditor);
    const propertyEditor = PropertyEditorManager.createEditor("mine5", "badeditor");
    expect(propertyEditor).to.not.be.null;
    if (propertyEditor) {
      expect(propertyEditor).to.be.instanceof(MinePropertyEditor);
    }
  });

  it("registerDataController should throw an exception if already registered", () => {
    PropertyEditorManager.registerDataController("myData2", MineDataController);
    expect(() => PropertyEditorManager.registerDataController("myData2", MineDataController)).to.throw(Error);
  });

  const createPropertyValue = (value?: string): PropertyValue => {
    const v: PropertyValue = {
      valueFormat: PropertyValueFormat.Primitive,
      displayValue: value ? value : "",
      value,
    };
    return v;
  };

  const createPropertyDescription = (): PropertyDescription => {
    const pd: PropertyDescription = {
      typename: "text",
      name: "key",
      displayLabel: "label",
    };
    return pd;
  };

  const createPropertyRecord = (value?: string): PropertyRecord => {
    const v = createPropertyValue(value);
    const pd = createPropertyDescription();
    return new PropertyRecord(v, pd);
  };

  it("calling validateValue & commitResult on PropertyEditor without dataController should encounter no error", async () => {
    PropertyEditorManager.registerEditor("mine7", MinePropertyEditor);
    const propertyEditor = PropertyEditorManager.createEditor("mine7");
    expect(propertyEditor).to.not.be.null;
    if (propertyEditor) {
      const validateResult = await propertyEditor.validateValue(createPropertyValue("newvalue"), createPropertyRecord("value"));
      expect(validateResult.encounteredError).to.be.false;
      const commitResult = await propertyEditor.commitValue(createPropertyValue("newvalue"), createPropertyRecord("value"));
      expect(commitResult.encounteredError).to.be.false;
    }
  });

  it("calling validateValue & commitResult on PropertyEditor with a dataController should encounter no error", async () => {
    PropertyEditorManager.registerEditor("mine8", MinePropertyEditor);
    PropertyEditorManager.registerDataController("myData3", MineDataController);
    const propertyEditor = PropertyEditorManager.createEditor("mine8", undefined, "myData3");
    expect(propertyEditor).to.not.be.null;
    if (propertyEditor) {
      const validateResult = await propertyEditor.validateValue(createPropertyValue("newvalue"), createPropertyRecord("value"));
      expect(validateResult.encounteredError).to.be.false;
      const commitResult = await propertyEditor.commitValue(createPropertyValue("newvalue"), createPropertyRecord("value"));
      expect(commitResult.encounteredError).to.be.false;
    }
  });

  class ErrorDataController extends DataControllerBase {
    public override async commitValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
      return { encounteredError: true };
    }

    public override async validateValue(_newValue: PropertyValue, _record: PropertyRecord): Promise<AsyncValueProcessingResult> {
      return { encounteredError: true };
    }
  }

  it("calling validateValue & commitResult on PropertyEditor with a dataController returning errors should report errors", async () => {
    PropertyEditorManager.registerEditor("mine9", MinePropertyEditor);
    PropertyEditorManager.registerDataController("myData4", ErrorDataController);
    const propertyEditor = PropertyEditorManager.createEditor("mine9", undefined, "myData4");
    expect(propertyEditor).to.not.be.null;
    if (propertyEditor) {
      const validateResult = await propertyEditor.validateValue(createPropertyValue("newvalue"), createPropertyRecord("value"));
      expect(validateResult.encounteredError).to.be.true;
      const commitResult = await propertyEditor.commitValue(createPropertyValue("newvalue"), createPropertyRecord("value"));
      expect(commitResult.encounteredError).to.be.true;
    }
  });

  class PropertyEditorWithEditorParams extends PropertyEditorBase {
    public override get containerHandlesBlur(): boolean {
      return true;
    }
    public override get containerHandlesEscape(): boolean {
      return true;
    }
    public override get containerHandlesEnter(): boolean {
      return true;
    }
    public get reactNode(): React.ReactNode {
      return <TextEditor />;
    }

    public override applyEditorParams(property: PropertyDescription, record: PropertyRecord): void {
      super.applyEditorParams(property, record);
      if (property.editor && property.editor.params) {
        property.editor.params.forEach((params: PropertyEditorParams) => {
          if (params.type === PropertyEditorParamTypes.Icon) {
            if ((params as IconEditorParams).definition.iconSpec === "cool")
              (record as any).iconParamsWorked = true;
          }
        });
      }
    }
  }

  it("applyEditorParams", () => {
    const iconEditorParams = {
      type: PropertyEditorParamTypes.Icon,
      definition: { iconSpec: "cool" },
    } as IconEditorParams;

    PropertyEditorManager.registerEditor("withEditorParams", PropertyEditorWithEditorParams);
    const propertyEditor = PropertyEditorManager.createEditor("withEditorParams");
    expect(propertyEditor).to.be.instanceof(PropertyEditorWithEditorParams);
    if (propertyEditor) {
      const propertyDescription = createPropertyDescription();
      propertyDescription.editor = {
        name: "",
        params: [iconEditorParams],
      };
      const propertyRecord = createPropertyRecord("value");
      propertyEditor.applyEditorParams(propertyDescription, propertyRecord);
      const iconParamsWorked = ((propertyRecord as any).iconParamsWorked as boolean);
      expect(iconParamsWorked).to.be.true;
    }
  });

});
