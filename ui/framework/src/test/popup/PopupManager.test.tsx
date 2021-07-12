/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import * as sinon from "sinon";
import { Logger } from "@bentley/bentleyjs-core";
import { IModelApp, IModelAppOptions, LengthDescription, MockRender } from "@bentley/imodeljs-frontend";
import {
  AbstractToolbarProps, BadgeType, DialogItem, DialogItemValue, DialogLayoutDataProvider, DialogPropertyItem,
  DialogPropertySyncItem,
  PropertyChangeResult, PropertyChangeStatus, PropertyDescription, RelativePosition, StandardTypeNames,
} from "@bentley/ui-abstract";
import { Button, Point } from "@bentley/ui-core";
import { AccuDrawPopupManager } from "../../ui-framework/accudraw/AccuDrawPopupManager";
import { PopupManager, PopupRenderer } from "../../ui-framework/popup/PopupManager";
import { MenuItemProps } from "../../ui-framework/shared/MenuItem";
import TestUtils, { storageMock } from "../TestUtils";
import { FrameworkUiAdmin, KeyinEntry } from "../../ui-framework/uiadmin/FrameworkUiAdmin";
import { fireEvent, render } from "@testing-library/react";
const myLocalStorage = storageMock();
function requestNextAnimation() { }

describe("PopupManager", () => {
  const propertyDescriptorToRestore = Object.getOwnPropertyDescriptor(window, "localStorage")!;
  const rnaDescriptorToRestore = Object.getOwnPropertyDescriptor(IModelApp, "requestNextAnimation")!;

  before(async () => {
    Object.defineProperty(window, "localStorage", {
      get: () => myLocalStorage,
    });

    // Avoid requestAnimationFrame exception during test by temporarily replacing function that calls it. Tried replacing window.requestAnimationFrame first
    // but that did not work.
    Object.defineProperty(IModelApp, "requestNextAnimation", {
      get: () => requestNextAnimation,
    });

    await TestUtils.initializeUiFramework();
    // use mock renderer so standards tools are registered.
    const opts: IModelAppOptions = { uiAdmin: new FrameworkUiAdmin() };
    await MockRender.App.startup(opts);
  });

  after(async () => {
    await MockRender.App.shutdown();
    // restore the overriden property getter
    Object.defineProperty(window, "localStorage", propertyDescriptorToRestore);
    Object.defineProperty(IModelApp, "requestNextAnimation", rnaDescriptorToRestore);

    TestUtils.terminateUiFramework();
  });

  beforeEach(() => {
    PopupManager.clearPopups();
  });

  describe("Manager API", () => {
    it("showMenuButton should add menuButton", () => {
      const menuItemProps: MenuItemProps[] = [
        {
          id: "test", item: { label: "test label", icon: "icon-placeholder", execute: () => { } },
        },
      ];
      const doc = new DOMParser().parseFromString("<div>xyz</div>", "text/html");

      AccuDrawPopupManager.showMenuButton("test1", doc.documentElement, new Point(150, 250), menuItemProps);

      expect(PopupManager.popupCount).to.eq(1);
      let popup = PopupManager.popups[0];
      expect(popup.id).to.eq("test1");
      expect(popup.pt.x).to.eq(150);
      expect(popup.pt.y).to.eq(250);

      AccuDrawPopupManager.showMenuButton("test1", doc.documentElement, new Point(100, 200), menuItemProps);

      expect(PopupManager.popupCount).to.eq(1);
      popup = PopupManager.popups[0];
      expect(popup.id).to.eq("test1");
      expect(popup.pt.x).to.eq(100);
      expect(popup.pt.y).to.eq(200);
    });

    it("hideMenuButton should hide menuButton", () => {
      const menuItemProps: MenuItemProps[] = [
        {
          id: "test", item: { label: "test label", icon: "icon-placeholder", execute: () => { } },
        },
      ];
      const doc = new DOMParser().parseFromString("<div>xyz</div>", "text/html");

      AccuDrawPopupManager.showMenuButton("test1", doc.documentElement, new Point(150, 250), menuItemProps);

      expect(PopupManager.popupCount).to.eq(1);
      const popup = PopupManager.popups[0];
      expect(popup.id).to.eq("test1");

      AccuDrawPopupManager.hideMenuButton("test1");

      expect(PopupManager.popupCount).to.eq(0);
    });

    it("hideMenuButton should log error when invalid id passed", () => {
      const spyMethod = sinon.spy(Logger, "logError");

      AccuDrawPopupManager.hideMenuButton("invalid-id");

      spyMethod.calledOnce.should.true;
      (Logger.logError as any).restore();
    });

    it("showCalculator should show Calculator", () => {
      const doc = new DOMParser().parseFromString("<div>xyz</div>", "text/html");
      const spyOk = sinon.spy();
      const spyCancel = sinon.spy();

      AccuDrawPopupManager.showCalculator(doc.documentElement, new Point(150, 250), 100, "icon-placeholder", spyOk, spyCancel);

      expect(PopupManager.popupCount).to.eq(1);
      let popup = PopupManager.popups[0];
      expect(popup.pt.x).to.eq(150);
      expect(popup.pt.y).to.eq(250);

      AccuDrawPopupManager.showCalculator(doc.documentElement, new Point(100, 200), 100, "icon-placeholder", spyOk, spyCancel);

      expect(PopupManager.popupCount).to.eq(1);
      popup = PopupManager.popups[0];
      expect(popup.pt.x).to.eq(100);
      expect(popup.pt.y).to.eq(200);
    });

    it("hideCalculator should hide Calculator", () => {
      const doc = new DOMParser().parseFromString("<div>xyz</div>", "text/html");
      const spyOk = sinon.spy();
      const spyCancel = sinon.spy();

      AccuDrawPopupManager.showCalculator(doc.documentElement, new Point(150, 250), 100, "icon-placeholder", spyOk, spyCancel);

      expect(PopupManager.popupCount).to.eq(1);

      AccuDrawPopupManager.hideCalculator();

      expect(PopupManager.popupCount).to.eq(0);
    });

    it("showInputEditor should show editor", () => {
      const doc = new DOMParser().parseFromString("<div>xyz</div>", "text/html");
      const spyCommit = sinon.spy();
      const spyCancel = sinon.spy();

      AccuDrawPopupManager.showAngleEditor(doc.documentElement, new Point(150, 250), 123, spyCommit, spyCancel);

      expect(PopupManager.popupCount).to.eq(1);
      let popup = PopupManager.popups[0];
      expect(popup.pt.x).to.eq(150);
      expect(popup.pt.y).to.eq(250);

      AccuDrawPopupManager.showLengthEditor(doc.documentElement, new Point(100, 200), 123, spyCommit, spyCancel);

      expect(PopupManager.popupCount).to.eq(1);
      popup = PopupManager.popups[0];
      expect(popup.pt.x).to.eq(100);
      expect(popup.pt.y).to.eq(200);

      AccuDrawPopupManager.showHeightEditor(doc.documentElement, new Point(200, 300), 256, spyCommit, spyCancel);

      expect(PopupManager.popupCount).to.eq(1);
      popup = PopupManager.popups[0];
      expect(popup.pt.x).to.eq(200);
      expect(popup.pt.y).to.eq(300);

      const propertyDescription: PropertyDescription = { name: "test", displayLabel: "Test", typename: StandardTypeNames.Number };

      PopupManager.showInputEditor(doc.documentElement, new Point(300, 400), 256, propertyDescription, spyCommit, spyCancel);

      expect(PopupManager.popupCount).to.eq(1);
      popup = PopupManager.popups[0];
      expect(popup.pt.x).to.eq(300);
      expect(popup.pt.y).to.eq(400);
    });

    it("hideInputEditor should hide editor", () => {
      const doc = new DOMParser().parseFromString("<div>xyz</div>", "text/html");
      const spyCommit = sinon.spy();
      const spyCancel = sinon.spy();

      PopupManager.showInputEditor(doc.documentElement, new Point(150, 250), 123, new LengthDescription(), spyCommit, spyCancel);

      expect(PopupManager.popupCount).to.eq(1);

      PopupManager.hideInputEditor();

      expect(PopupManager.popupCount).to.eq(0);
    });

    it("should be able to set offset", () => {
      expect(PopupManager.defaultOffset.x).to.eq(8);
      expect(PopupManager.defaultOffset.y).to.eq(8);

      PopupManager.defaultOffset = { x: 10, y: 10 };

      expect(PopupManager.defaultOffset.x).to.eq(10);
      expect(PopupManager.defaultOffset.y).to.eq(10);
    });

  });

  describe("PopupRenderer", () => {
    it("PopupRenderer should render", () => {
      const wrapper = render(<PopupRenderer />);
      wrapper.unmount();
    });

    it("PopupRenderer should render menuButton with menu item", () => {
      const wrapper = render(<PopupRenderer />);
      const menuItemProps: MenuItemProps[] = [
        { id: "test", item: { label: "test label", icon: "icon-placeholder", execute: () => { } } },
      ];
      AccuDrawPopupManager.showMenuButton("test1", wrapper.container, new Point(150, 250), menuItemProps);
      const menuButtonNode = wrapper.container.querySelector("button");
      expect(menuButtonNode).to.not.be.null;
    });

    it("PopupRenderer should render Calculator", () => {
      const wrapper = render(<PopupRenderer />);

      const spyOk = sinon.spy();
      const spyCancel = sinon.spy();

      AccuDrawPopupManager.showCalculator(wrapper.container, new Point(150, 250), 100, "icon-placeholder", spyOk, spyCancel);
      const calculatorDiv = wrapper.container.querySelector("div.uifw-calculator");
      expect(calculatorDiv).to.not.be.null;
    });

    it("PopupRenderer should render InputEditor", async () => {
      const wrapper = render(<PopupRenderer />);

      const spyCommit = sinon.spy();
      const spyCancel = sinon.spy();
      const description: PropertyDescription = {
        name: "test",
        displayLabel: "Test",
        typename: StandardTypeNames.Text,
      };

      PopupManager.showInputEditor(wrapper.container, new Point(150, 250), 123, description, spyCommit, spyCancel);

      let inputNode = wrapper.container.querySelector("input");
      expect(inputNode).not.to.be.null;

      fireEvent.keyDown(inputNode as HTMLElement, { key: "Enter" });
      await TestUtils.flushAsyncOperations();
      expect(spyCommit.calledOnce).to.be.true;

      PopupManager.showInputEditor(wrapper.container, new Point(150, 250), 123, description, spyCommit, spyCancel);
      inputNode = wrapper.container.querySelector("input");
      expect(inputNode).not.to.be.null;

      fireEvent.keyDown(inputNode as HTMLElement, { key: "Escape" });
      await TestUtils.flushAsyncOperations();
      expect(spyCancel.called).to.be.true;
    });

    it("PopupRenderer should render Toolbar", async () => {
      const wrapper = render(<PopupRenderer />);

      const toolbarProps: AbstractToolbarProps = {
        items: [
          { id: "Mode-1", itemPriority: 10, label: "Mode 1", icon: "icon-placeholder", badgeType: BadgeType.New, execute: () => { } },
          { id: "Mode-2", itemPriority: 20, label: "Mode 2", icon: "icon-placeholder", execute: () => { } },
        ],
      };

      const spyItemExecuted = sinon.spy();
      const spyCancel = sinon.spy();

      PopupManager.showToolbar(toolbarProps, wrapper.container, new Point(150, 250), new Point(8, 8), spyItemExecuted, spyCancel, RelativePosition.TopRight);

      const buttonNodes = wrapper.container.querySelectorAll("button");
      expect(buttonNodes.length).to.eq(2);

      fireEvent.keyDown(buttonNodes[0] as HTMLElement, { key: "Escape" });
      await TestUtils.flushAsyncOperations();
      expect(spyCancel.calledOnce).to.be.true;
    });

    it("PopupRenderer should render HTMLElement", async () => {
      const wrapper = render(<PopupRenderer />);
      const html = "<div class='test-element'>Hello World!</div>";
      const display = new DOMParser().parseFromString(html, "text/html");
      const spyCancel = sinon.spy();
      PopupManager.showHTMLElement(display.documentElement, wrapper.container, new Point(150, 250), new Point(8, 8), spyCancel, RelativePosition.TopRight);
      wrapper.getByText("Hello World!");
    });

    it("PopupRenderer should render Card", async () => {
      const wrapper = render(<PopupRenderer />);

      const html = '<div style="width: 120px; height: 50px; display: flex; justify-content: center; align-items: center; background-color: aqua;">Hello World!</div>';
      const content = new DOMParser().parseFromString(html, "text/html");

      const toolbarProps: AbstractToolbarProps = {
        items: [
          { id: "Mode-1", itemPriority: 10, label: "Mode 1", icon: "icon-placeholder", badgeType: BadgeType.New, execute: () => { } },
          { id: "Mode-2", itemPriority: 20, label: "Mode 2", icon: "icon-placeholder", execute: () => { } },
        ],
      };

      const spyItemExecuted = sinon.spy();
      const spyCancel = sinon.spy();

      PopupManager.showCard(content.documentElement, "Title", toolbarProps, wrapper.container, new Point(150, 250), new Point(8, 8), spyItemExecuted, spyCancel, RelativePosition.TopRight);
      expect(wrapper.container.querySelectorAll("div.uifw-card-content").length).to.eq(1);
      expect(wrapper.container.querySelectorAll("span.uicore-text-leading").length).to.eq(1);
      expect(wrapper.container.querySelectorAll("div.components-toolbar-overflow-sizer").length).to.eq(1);

      const buttonNodes = wrapper.container.querySelectorAll("button");
      expect(buttonNodes).not.to.be.null;

      fireEvent.keyDown(buttonNodes[0] as HTMLElement, { key: "Escape" });
      await TestUtils.flushAsyncOperations();
      expect(spyCancel.called).to.be.true;
      PopupManager.hideCard();

      const record = TestUtils.createPrimitiveStringProperty("record", "Title");
      PopupManager.showCard(content.documentElement, record, toolbarProps, wrapper.container, new Point(150, 250), new Point(8, 8), spyItemExecuted, spyCancel, RelativePosition.TopRight);
      expect(wrapper.container.querySelectorAll("div.uifw-card-content").length).to.eq(1);
      expect(wrapper.container.querySelectorAll("span.uicore-text-leading").length).to.eq(1);
      PopupManager.hideCard();

      PopupManager.showCard(content.documentElement, undefined, undefined, wrapper.container, new Point(150, 250), new Point(8, 8), spyItemExecuted, spyCancel, RelativePosition.TopRight);
      expect(wrapper.container.querySelectorAll("div.uifw-card-content").length).to.eq(1);
      expect(wrapper.container.querySelectorAll("span.uicore-text-leading").length).to.eq(0);
      PopupManager.hideCard();

      const reactContent = { reactNode: <Button>Label</Button> };
      PopupManager.showCard(reactContent, undefined, undefined, wrapper.container, new Point(150, 250), new Point(8, 8), spyItemExecuted, spyCancel, RelativePosition.TopRight);
      expect(wrapper.container.querySelectorAll("div.uifw-card-content").length).to.eq(1);
      expect(wrapper.container.querySelectorAll("span.uicore-text-leading").length).to.eq(0);
      PopupManager.hideCard();
    });

    it("PopupRenderer should render Tool Settings", async () => {
      const wrapper = render(<PopupRenderer />);
      const spyChange = sinon.spy();

      class TestUiDataProvider extends DialogLayoutDataProvider {
        private static _sourcePropertyName = "source";
        private static _getSourceDescription = (): PropertyDescription => {
          return {
            name: TestUiDataProvider._sourcePropertyName,
            displayLabel: "Source",
            typename: StandardTypeNames.String,
          };
        };

        private _sourceValue: DialogItemValue = { value: "unknown" };

        public get source(): string {
          return this._sourceValue.value as string;
        }

        public set source(option: string) {
          this._sourceValue.value = option;
        }

        public override applyUiPropertyChange = (updatedValue: DialogPropertySyncItem): void => {
          if (updatedValue.propertyName === TestUiDataProvider._sourcePropertyName) {
            this.source = updatedValue.value.value ? updatedValue.value.value as string : "";
            spyChange(this.source);
          }
        };

        /** Called by UI to inform data provider of changes.  */
        public override processChangesInUi(properties: DialogPropertyItem[]): PropertyChangeResult {
          if (properties.length > 0) {
            for (const prop of properties) {
              this.applyUiPropertyChange(prop);
            }
          }
          return { status: PropertyChangeStatus.Success };
        }

        /** Used Called by UI to request available properties when UI is manually created. */
        public override supplyDialogItems(): DialogItem[] | undefined {
          return [
            { value: this._sourceValue, property: TestUiDataProvider._getSourceDescription(), editorPosition: { rowPriority: 1, columnIndex: 1 } },
          ];
        }
      }

      const uiDataProvider = new TestUiDataProvider();

      const spyCancel = sinon.spy();

      PopupManager.openToolSettings(uiDataProvider, wrapper.container, new Point(150, 250), new Point(8, 8), spyCancel, RelativePosition.TopRight);
      expect(wrapper.container.querySelectorAll("div.uifw-default-container").length).to.eq(1);

      let inputNode = wrapper.container.querySelector("input");
      expect(inputNode).not.to.be.null;

      fireEvent.keyDown(inputNode as HTMLElement, { key: "Enter" });
      await TestUtils.flushAsyncOperations();
      expect(spyChange.calledOnce).to.be.true;

      PopupManager.openToolSettings(uiDataProvider, wrapper.container, new Point(150, 250), new Point(8, 8), spyCancel, RelativePosition.TopRight);
      expect(wrapper.container.querySelectorAll("div.uifw-default-container").length).to.eq(1);

      inputNode = wrapper.container.querySelector("input");
      expect(inputNode).not.to.be.null;
      fireEvent.click(inputNode as HTMLElement);
      fireEvent.keyDown(inputNode as HTMLElement, { key: "Escape" });
      await TestUtils.flushAsyncOperations();
      expect(spyCancel.calledOnce).to.be.true;
    });

    it("PopupRenderer should render Keyin Palette", async () => {
      const wrapper = render(<PopupRenderer />);
      const keyins: KeyinEntry[] = [{ value: "keyin one" }, { value: "keyin two" }];
      const spyOk = sinon.spy();
      const spyCancel = sinon.spy();

      PopupManager.showKeyinPalette(keyins, wrapper.container, spyOk, spyCancel);

      expect(wrapper.container.querySelectorAll("div.uifw-command-palette-panel").length).to.eq(1);
      const inputNode = wrapper.container.querySelector("input");
      expect(inputNode).not.to.null;
      fireEvent.keyDown(inputNode as HTMLElement, { key: "Escape" });
      await TestUtils.flushAsyncOperations();
      expect(spyCancel.calledOnce).to.be.true;
    });
  });

});
