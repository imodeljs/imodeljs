/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import {
  ButtonGroupEditorParams, DialogItem, DialogItemValue, DialogLayoutDataProvider, DialogPropertyItem, DialogPropertySyncItem, DialogRow,
  PrimitiveValue, PropertyDescription, PropertyEditorParamTypes, StandardEditorNames,
  StandardTypeNames, SuppressLabelEditorParams, UiLayoutDataProvider,
} from "../../ui-abstract";

const value1: DialogItemValue = { value: 3 };
const value2: DialogItemValue = { value: 10 };
const lockValue: DialogItemValue = { value: true };
const buttonGroupValue: DialogItemValue = { value: "One" };
const updatedDialogPropertyItem: DialogPropertyItem = { propertyName: "Item2", value: value1 };

const getItem1Description = (): PropertyDescription => {
  return {
    name: "Item1",
    displayLabel: "Item One",
    typename: StandardTypeNames.Number,
  };
};

const getItem2Description = (): PropertyDescription => {
  return {
    name: "Item2",
    displayLabel: "Item Two",
    typename: StandardTypeNames.Number,
  };
};

const getLockToggleDescription = (): PropertyDescription => {
  return {
    name: "LockToggle",
    displayLabel: "Lock",
    typename: StandardTypeNames.Boolean,
    editor: { name: StandardEditorNames.Toggle },
  };
};
const getButtonGroupItemDescription = (): PropertyDescription => {
  return {
    name: "ButtonGroupName",
    displayLabel: "",
    typename: StandardTypeNames.Enum,
    editor: {
      name: StandardEditorNames.EnumButtonGroup,
      params: [{
        type: PropertyEditorParamTypes.ButtonGroupData,
        buttons: [
          { iconSpec: "icon-placeholder" },
          { iconSpec: "icon-placeholder" },
          { iconSpec: "icon-placeholder" },
        ],
      } as ButtonGroupEditorParams, {
        type: PropertyEditorParamTypes.SuppressEditorLabel,
        suppressLabelPlaceholder: true,
      } as SuppressLabelEditorParams,
      ],
    },
    enum: {
      choices: [
        { label: "Choice1", value: "One" },
        { label: "Choice2", value: "Two" },
        { label: "Choice3", value: "Three" },
      ],
    },
  };
};

const lockItem: DialogItem = { value: lockValue, property: getLockToggleDescription(), editorPosition: { rowPriority: 0, columnIndex: 0 } };
const item1: DialogItem = { value: value1, property: getItem1Description(), editorPosition: { rowPriority: 0, columnIndex: 1 }, lockProperty: lockItem };
const item2: DialogItem = { value: value2, property: getItem2Description(), editorPosition: { rowPriority: 0, columnIndex: 2 }, isDisabled: true };
const buttonGroupItem: DialogItem = { value: buttonGroupValue, property: getButtonGroupItemDescription(), editorPosition: { rowPriority: 1, columnIndex: 0 } };
const dialogItems: DialogItem[] = [item1, item2, buttonGroupItem];

class TestDynamicUiDataProvider extends UiLayoutDataProvider {
  /** Applies change of a single property - this is the default method used when property editors are dynamically generated. */
  public override applyUiPropertyChange = (_updatedValue: DialogPropertySyncItem): void => {
  };

  /** Called by UI to request available properties that can be bound to user supplied UI components (See Tool1UiProvider for example). */
  public override supplyDialogItems(): DialogItem[] | undefined {
    return dialogItems;
  }
}

describe("UiLayoutDataProvider", () => {
  describe("items", () => {
    it("should layout rows if items have changed", () => {
      const sut = new TestDynamicUiDataProvider();
      expect(sut.items.length).to.be.eq(dialogItems.length);
      sut.rows.should.not.be.empty;
    });
  });
  describe("TestDynamicUiDataProvider static functions", () => {
    it("should want label", () => {
      const wantsLabel = TestDynamicUiDataProvider.editorWantsLabel(item1);
      expect(wantsLabel).to.be.true;
    });
    it("should not want label", () => {
      const wantsLabel = TestDynamicUiDataProvider.editorWantsLabel(buttonGroupItem);
      expect(wantsLabel).to.be.false;
    });
    it("has lock property", () => {
      const hasLockProperty = TestDynamicUiDataProvider.hasAssociatedLockProperty(item1);
      expect(hasLockProperty).to.be.true;
    });
    it("item is not disabled", () => {
      const item1Disabled = TestDynamicUiDataProvider.getItemDisabledState(item1);
      expect(item1Disabled).to.be.false;
    });
    it("has no lock property", () => {
      const hasLockProperty = TestDynamicUiDataProvider.hasAssociatedLockProperty(item2);
      expect(hasLockProperty).to.be.false;
    });
    it("should reflect value", () => {
      const record = TestDynamicUiDataProvider.getPropertyRecord(buttonGroupItem);
      record.should.not.be.undefined;
      const primitiveValue = record.value as PrimitiveValue;
      primitiveValue.should.not.be.undefined;
      expect(primitiveValue.value).to.eq("One");
    });
  });

  describe("row", () => {
    it("has only button groups", () => {
      const sut = new TestDynamicUiDataProvider();
      const row: DialogRow = sut.rows[1];
      const hasOnlyButtonGroups = TestDynamicUiDataProvider.onlyContainButtonGroupEditors(row);
      expect(hasOnlyButtonGroups).to.be.true;
    });

    it("does not have only button groups", () => {
      const sut = new TestDynamicUiDataProvider();
      const row: DialogRow = sut.rows[0];
      const hasOnlyButtonGroups = TestDynamicUiDataProvider.onlyContainButtonGroupEditors(row);

      expect(hasOnlyButtonGroups).to.be.false;
    });
  });
});

class TestDialogDynamicUiDataProvider extends DialogLayoutDataProvider {
  /** Applies change of a single property - this is the default method used when property editors are dynamically generated. */
  public override applyUiPropertyChange = (_updatedValue: DialogPropertySyncItem): void => {
  };

  /** Called by UI to request available properties that can be bound to user supplied UI components (See Tool1UiProvider for example). */
  public override supplyDialogItems(): DialogItem[] | undefined {
    return dialogItems;
  }
}

class EmptyDialogDynamicUiDataProvider extends DialogLayoutDataProvider {
  /** Applies change of a single property - this is the default method used when property editors are dynamically generated. */
  public override applyUiPropertyChange = (_updatedValue: DialogPropertySyncItem): void => {
  };

  /** Called by UI to request available properties that can be bound to user supplied UI components (See Tool1UiProvider for example). */
  public override supplyDialogItems(): DialogItem[] | undefined {
    return undefined;
  }
}

describe("DialogLayoutDataProvider", () => {
  const dialogSut = new TestDialogDynamicUiDataProvider();
  const emptySut = new EmptyDialogDynamicUiDataProvider();

  describe("items", () => {
    it("should layout rows if items have changed", () => {
      expect(dialogSut.items.length).to.be.eq(dialogItems.length);
      dialogSut.rows.should.not.be.empty;
    });

    it("should process changes", () => {
      dialogSut.processChangesInUi([updatedDialogPropertyItem]);
      expect(dialogSut.items.length).to.be.eq(dialogItems.length);
      dialogSut.rows.should.not.be.empty;
    });

    it("should handle empty items", () => {
      dialogSut.reloadDialogItems();
      dialogSut.reloadDialogItems(false);
      dialogSut.fireDialogButtonsReloadEvent();
      expect(emptySut.rows.length).to.be.eq(0);
      expect(emptySut.items.length).to.be.eq(0);
      expect(emptySut.rows.length).to.be.eq(0);
    });

  });
  describe("buttons", () => {
    it("should contain defaults", () => {
      const buttonData = dialogSut.supplyButtonData();
      expect(buttonData).not.to.be.undefined;
      expect(buttonData && buttonData.length).to.be.eq(2);
    });
  });

});
