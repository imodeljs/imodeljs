/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { fireEvent, render } from "@testing-library/react";
import { /* ModelessDialogManager, */ UiDataProvidedDialog } from "../../ui-framework";
import { DialogButtonDef, DialogButtonType, DialogItem, DialogItemValue, DialogLayoutDataProvider, DialogPropertyItem, DialogPropertySyncItem, PropertyChangeResult, PropertyChangeStatus, PropertyDescription, StandardTypeNames } from "@bentley/ui-abstract";
import TestUtils from "../TestUtils";
import { expect } from "chai";
import sinon = require("sinon");

const spyCancel = sinon.spy();
const spyOK = sinon.spy();

class TestUiDataProvider extends DialogLayoutDataProvider {
  public currentPageIndex = 0;
  public numberOfPages = 2;
  public static userPropertyName = "username";
  private static _getUserDescription = (): PropertyDescription => {
    return {
      name: TestUiDataProvider.userPropertyName,
      displayLabel: "User",
      typename: StandardTypeNames.String,
    };
  };

  private _userValue: DialogItemValue = { value: "unknown" };
  private get user(): string {
    return this._userValue.value as string;
  }
  private set user(option: string) {
    this._userValue.value = option;
  }

  public static cityPropertyName = "city";
  private static _getCityDescription = (): PropertyDescription => {
    return {
      name: TestUiDataProvider.cityPropertyName,
      displayLabel: "City",
      typename: StandardTypeNames.String,
    };
  };

  private _cityValue: DialogItemValue = { value: "unknown" };
  private get city(): string {
    return this._cityValue.value as string;
  }
  private set city(option: string) {
    this._cityValue.value = option;
  }

  // called to apply a single property value change.
  public override applyUiPropertyChange = (updatedValue: DialogPropertySyncItem): void => {
    this.processChangesInUi([updatedValue]);
  };

  /** Called by UI to inform data provider of changes.  */
  public override processChangesInUi(properties: DialogPropertyItem[]): PropertyChangeResult {
    if (properties.length > 0) {
      for (const prop of properties) {
        if (prop.propertyName === TestUiDataProvider.userPropertyName) {
          this.user = prop.value.value ? prop.value.value as string : "";
          continue;
        } else if (prop.propertyName === TestUiDataProvider.cityPropertyName) {
          this.city = prop.value.value ? prop.value.value as string : "";
          continue;
        }
      }
    }

    this.fireDialogButtonsReloadEvent();
    return { status: PropertyChangeStatus.Success };
  }

  /** Used Called by UI to request available properties when UI is manually created. */
  public override supplyDialogItems(): DialogItem[] | undefined {
    const items: DialogItem[] = [];

    items.push({ value: this._userValue, property: TestUiDataProvider._getUserDescription(), editorPosition: { rowPriority: 1, columnIndex: 1 } });
    if (this.currentPageIndex > 0) {
      items.push({ value: this._cityValue, property: TestUiDataProvider._getCityDescription(), editorPosition: { rowPriority: 2, columnIndex: 1 } });
    }
    return items;
  }

  public handleNext = () => {
    if (this.currentPageIndex < this.numberOfPages) {
      this.currentPageIndex++;
      this.reloadDialogItems();
    }
  };

  public handlePrevious = () => {
    if (this.currentPageIndex > 0) {
      this.currentPageIndex--;
      this.reloadDialogItems();
    }
  };

  public disableUserInputReplaceDescription(): void {
    const newUserValue: DialogItemValue = { value: "xxx" };
    const syncItem: DialogPropertySyncItem = { value: newUserValue, propertyName: TestUiDataProvider.userPropertyName, isDisabled: true, property: TestUiDataProvider._getUserDescription() };
    this.fireSyncPropertiesEvent([syncItem]);
  }

  public disableUserInput(): void {
    const newUserValue: DialogItemValue = { value: "xxx" };
    const syncItem: DialogPropertySyncItem = { value: newUserValue, propertyName: TestUiDataProvider.userPropertyName, isDisabled: true };
    this.fireSyncPropertiesEvent([syncItem]);
  }

  public override supplyButtonData(): DialogButtonDef[] | undefined {
    const buttons: DialogButtonDef[] = [];

    if (this.currentPageIndex > 0 && this.currentPageIndex < this.numberOfPages)
      buttons.push({ type: DialogButtonType.Previous, onClick: this.handlePrevious });

    if (this.currentPageIndex < this.numberOfPages - 1)
      buttons.push({ type: DialogButtonType.Next, onClick: this.handleNext });

    if (this.currentPageIndex === this.numberOfPages - 1) {
      buttons.push({ type: DialogButtonType.OK, onClick: spyOK, disabled: (this.user === "unknown" || this.city === "unknown") });
    }

    buttons.push({ type: DialogButtonType.Cancel, onClick: spyCancel });
    return buttons;
  }
}

describe("UiDataProvidedDialog", () => {
  before(async () => {
    await TestUtils.initializeUiFramework();
  });

  after(() => {
    TestUtils.terminateUiFramework();
  });

  describe("Modal Dialog", () => {
    it("should handle button presses", async () => {
      // const spyOnEscape = sinon.spy();
      const reactNode = <UiDataProvidedDialog
        title="My Title"
        uiDataProvider={new TestUiDataProvider()}
        isModal={true}
      />;
      const component = render(reactNode);
      let nextButton = component.getByText("dialog.next");
      fireEvent.click(nextButton);
      const previousButton = component.getByText("dialog.previous");
      fireEvent.click(previousButton);
      nextButton = component.getByText("dialog.next");
      fireEvent.click(nextButton);
      const cancelButton = component.getByText("dialog.cancel");
      fireEvent.click(cancelButton);
      const okButton = component.getByText("dialog.ok") as HTMLButtonElement;
      fireEvent.click(okButton);
      const inputs = component.container.querySelectorAll("input");
      expect(okButton.disabled).to.be.true;
      expect(inputs.length).to.be.eq(2);
      inputs[0].focus();
      fireEvent.change(inputs[0], { target: { value: "test-user" } });
      inputs[0].blur();

      inputs[1].focus();
      fireEvent.change(inputs[1], { target: { value: "test-city" } });
      inputs[1].blur();
      await TestUtils.flushAsyncOperations();
      expect(okButton.disabled).to.be.false;
      fireEvent.click(okButton);
      expect(spyOK.calledOnce).to.be.true;

      component.baseElement.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape" }));
      expect(spyCancel.calledOnce).to.be.true;
    });
  });

  describe("Modeless Dialog", () => {
    it("should handle button presses", async () => {
      const dataProvider = new TestUiDataProvider();
      spyOK.resetHistory();
      spyCancel.resetHistory();
      const reactNode = <UiDataProvidedDialog
        title="My Title"
        uiDataProvider={dataProvider}
        isModal={false}
        id="my-test-id"
      />;
      const component = render(reactNode);
      let nextButton = component.getByText("dialog.next");
      fireEvent.click(nextButton);
      const previousButton = component.getByText("dialog.previous");
      fireEvent.click(previousButton);
      nextButton = component.getByText("dialog.next");
      fireEvent.click(nextButton);
      const cancelButton = component.getByText("dialog.cancel");
      fireEvent.click(cancelButton);
      const okButton = component.getByText("dialog.ok") as HTMLButtonElement;
      fireEvent.click(okButton);
      const inputs = component.container.querySelectorAll("input");
      expect(okButton.disabled).to.be.true;
      expect(inputs.length).to.be.eq(2);
      inputs[0].focus();
      fireEvent.change(inputs[0], { target: { value: "test-user" } });
      inputs[0].blur();

      inputs[1].focus();
      fireEvent.change(inputs[1], { target: { value: "test-city" } });
      inputs[1].blur();
      await TestUtils.flushAsyncOperations();
      expect(okButton.disabled).to.be.false;
      fireEvent.click(okButton);
      expect(spyOK.calledOnce).to.be.true;

      component.baseElement.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape" }));
      expect(spyCancel.calledOnce).to.be.true;

      dataProvider.disableUserInputReplaceDescription();
      dataProvider.disableUserInput();
    });
  });

});
