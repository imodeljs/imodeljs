/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as React from "react";
import * as sinon from "sinon";
import { IModelApp, NoRenderApp } from "@bentley/imodeljs-frontend";
import {
  AbstractStatusBarItemUtilities, CommonStatusBarItem, ConditionalBooleanValue, StageUsage, StatusBarLabelSide, StatusBarSection, UiItemsManager,
  UiItemsProvider, WidgetState,
} from "@bentley/ui-abstract";
import { fireEvent, render } from "@testing-library/react";
import {
  ActivityCenterField, ConfigurableCreateInfo, ConfigurableUiControlType, MessageCenterField, StatusBar, StatusBarComposer, StatusBarItem,
  StatusBarItemUtilities, StatusBarWidgetControl, SyncUiEventDispatcher, WidgetDef, withMessageCenterFieldProps, withStatusFieldProps,
} from "../../ui-framework";
import TestUtils, { mount } from "../TestUtils";
import { createDOMRect } from "../Utils";

describe("StatusBarComposer", () => {
  class TestUiProvider implements UiItemsProvider {
    public readonly id = "TestUiProvider-statusbar";

    public static statusBarItemIsVisible = true;
    public static uiSyncEventId = "appuiprovider:statusbar-item-visibility-changed";

    public static triggerSyncRefresh = () => {
      TestUiProvider.statusBarItemIsVisible = false;
      SyncUiEventDispatcher.dispatchImmediateSyncUiEvent(TestUiProvider.uiSyncEventId);
    };

    public provideStatusBarItems(_stageId: string, stageUsage: string): CommonStatusBarItem[] {

      const statusBarItems: CommonStatusBarItem[] = [];
      const hiddenCondition = new ConditionalBooleanValue(() => !TestUiProvider.statusBarItemIsVisible, [TestUiProvider.uiSyncEventId]);

      if (stageUsage === StageUsage.General) {
        statusBarItems.push(
          AbstractStatusBarItemUtilities.createActionItem("ExtensionTest:StatusBarItem1", StatusBarSection.Center, 100, "icon-developer", "test status bar from extension", () => { }));
        statusBarItems.push(
          AbstractStatusBarItemUtilities.createLabelItem("ExtensionTest:StatusBarLabel1", StatusBarSection.Center, 105, "icon-hand-2-condition", "Hello", undefined, { isHidden: hiddenCondition }));
        statusBarItems.push(
          AbstractStatusBarItemUtilities.createLabelItem("ExtensionTest:StatusBarLabel2", StatusBarSection.Center, 120, "icon-hand-2", "Hello2", StatusBarLabelSide.Left));
        statusBarItems.push(
          AbstractStatusBarItemUtilities.createActionItem("ExtensionTest:StatusBarItem2", StatusBarSection.Center, 110, "icon-visibility-hide-2", "toggle items", () => { }));
      }
      return statusBarItems;
    }
  }

  class AppStatusBarWidgetControl extends StatusBarWidgetControl {
    constructor(info: ConfigurableCreateInfo, options: any) {
      super(info, options);
    }

    public getReactNode(): React.ReactNode {
      return (
        <StatusBarComposer items={[]} />
      );
    }
  }

  class AppStatusBarComponent extends React.PureComponent {
    public override render() {
      return <div className="status-bar-component" />;
    }
  }

  let widgetControl: StatusBarWidgetControl | undefined;

  describe("StatusBarComposer Enzyme-Testing", () => {

    before(async () => {
      await TestUtils.initializeUiFramework();
      await NoRenderApp.startup();

      const statusBarWidgetDef = new WidgetDef({
        classId: AppStatusBarWidgetControl,
        defaultState: WidgetState.Open,
        isFreeform: false,
        isStatusBar: true,
      });
      widgetControl = statusBarWidgetDef.getWidgetControl(ConfigurableUiControlType.StatusBarWidget) as StatusBarWidgetControl;
    });

    after(async () => {
      TestUtils.terminateUiFramework();
      await IModelApp.shutdown();
    });

    it("StatusBarComposer should be instantiated", () => {
      expect(widgetControl).to.not.be.undefined;
      if (widgetControl)
        expect(widgetControl.getType()).to.eq(ConfigurableUiControlType.StatusBarWidget);

      const wrapper = mount(<StatusBar widgetControl={widgetControl} isInFooterMode={true} />);

      const statusBarComposer = wrapper.find(StatusBarComposer);
      expect(statusBarComposer.length).to.eq(1);
      expect(wrapper.find("div.uifw-statusbar-space-between").length).to.eq(1);
    });

    it("StatusBarComposer should render items", () => {
      const items: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("item1", StatusBarSection.Left, 1, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item2", StatusBarSection.Center, 1, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item3", StatusBarSection.Right, 1, <AppStatusBarComponent />),
      ];

      expect(items.length).to.eq(3);

      const wrapper = mount(<StatusBarComposer items={items} />);

      const leftItems = wrapper.find("div.uifw-statusbar-left");
      expect(leftItems.length).to.eq(1);
      expect(leftItems.find(AppStatusBarComponent).length).to.eq(1);

      const centerItems = wrapper.find("div.uifw-statusbar-center");
      expect(centerItems.length).to.eq(1);
      expect(centerItems.find(AppStatusBarComponent).length).to.eq(1);

      const rightItems = wrapper.find("div.uifw-statusbar-right");
      expect(rightItems.length).to.eq(1);
      expect(rightItems.find(AppStatusBarComponent).length).to.eq(1);
    });

    it("StatusBarComposer should support changing props", () => {
      const items: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("item1", StatusBarSection.Left, 1, <AppStatusBarComponent />),
      ];

      expect(items.length).to.eq(1);

      const wrapper = mount(<StatusBarComposer items={items} />);

      const leftItems = wrapper.find("div.uifw-statusbar-left");
      expect(leftItems.length).to.eq(1);
      expect(leftItems.find(AppStatusBarComponent).length).to.eq(1);

      const items2: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("item2", StatusBarSection.Center, 1, <AppStatusBarComponent />),
      ];

      expect(items2.length).to.eq(1);

      wrapper.setProps({ items: items2 });
      wrapper.update();

      const centerItems = wrapper.find("div.uifw-statusbar-center");
      expect(centerItems.length).to.eq(1);
      expect(centerItems.find(AppStatusBarComponent).length).to.eq(1);
    });

    it("StatusBarComposer should sort items", () => {
      const items: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("item1", StatusBarSection.Left, 10, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item2", StatusBarSection.Left, 5, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item3", StatusBarSection.Left, 1, <AppStatusBarComponent />),
      ];

      expect(items.length).to.eq(3);

      const wrapper = mount(<StatusBarComposer items={items} />);

      const leftItems = wrapper.find("div.uifw-statusbar-left");
      expect(leftItems.length).to.eq(1);
      expect(leftItems.find(AppStatusBarComponent).length).to.eq(3);
    });

    it("StatusBarComposer should support withStatusBarField components ", () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const ActivityCenter = withStatusFieldProps(ActivityCenterField);

      const items: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("item1", StatusBarSection.Left, 10, <ActivityCenter />),
      ];

      expect(items.length).to.eq(1);
      const wrapper = mount(<StatusBarComposer items={items} />);

      const leftItems = wrapper.find("div.uifw-statusbar-left");
      expect(leftItems.length).to.eq(1);
      expect(leftItems.find(ActivityCenterField).length).to.eq(1);
    });

    it("StatusBarComposer should support withMessageCenter components ", () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const MessageCenter = withMessageCenterFieldProps(MessageCenterField);

      const items: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("item1", StatusBarSection.Left, 10, <MessageCenter />),
      ];

      expect(items.length).to.eq(1);

      const wrapper = mount(<StatusBarComposer items={items} />);

      const leftItems = wrapper.find("div.uifw-statusbar-left");
      expect(leftItems.length).to.eq(1);
      expect(leftItems.find(MessageCenterField).length).to.eq(1);
    });

    it("StatusBarComposer should support item.isVisible", () => {
      const items: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("test1", StatusBarSection.Left, 10, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("test2", StatusBarSection.Left, 5, <AppStatusBarComponent />, { isHidden: true }),
      ];

      expect(items.length).to.eq(2);

      const wrapper = mount(<StatusBarComposer items={items} />);

      let leftItems = wrapper.find("div.uifw-statusbar-left");
      expect(leftItems.find(AppStatusBarComponent).length).to.eq(1);

      // defaultItemsManager.setIsVisible("test2", true);
      // wrapper.update();
      leftItems = wrapper.find("div.uifw-statusbar-left");
      // expect(leftItems.find(AppStatusBarComponent).length).to.eq(2);
    });

    it("StatusBarComposer should support extension items", async () => {
      const items: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("test1", StatusBarSection.Left, 10, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("test2", StatusBarSection.Left, 5, <AppStatusBarComponent />, { isHidden: true }),
      ];

      const uiProvider = new TestUiProvider();
      expect(items.length).to.eq(2);

      const wrapper = mount(<StatusBarComposer items={items} />);

      let addonItem = wrapper.find("i.icon-visibility-hide-2");
      expect(addonItem.exists()).to.be.false;

      UiItemsManager.register(uiProvider);

      await TestUtils.flushAsyncOperations();
      wrapper.update();

      const leftItems = wrapper.find("div.uifw-statusbar-left");
      expect(leftItems.find(AppStatusBarComponent).length).to.eq(1);

      const addonItem1 = wrapper.find("i.icon-visibility-hide-2");
      expect(addonItem1.exists()).to.be.true;
      const addonItem2 = wrapper.find("i.icon-hand-2");
      expect(addonItem2.exists()).to.be.true;

      UiItemsManager.unregister(uiProvider.id);
      await TestUtils.flushAsyncOperations();
      wrapper.update();

      addonItem = wrapper.find("i.icon-visibility-hide-2");
      expect(addonItem.exists()).to.be.false;
    });

    it("StatusBarComposer should support addon items loaded before component", async () => {
      const items: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("test1", StatusBarSection.Left, 10, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("test2", StatusBarSection.Left, 5, <AppStatusBarComponent />, { isHidden: true }),
      ];

      const uiProvider = new TestUiProvider();

      UiItemsManager.register(uiProvider);
      const wrapper = mount(<StatusBarComposer items={items} />);

      const leftItems = wrapper.find("div.uifw-statusbar-left");
      expect(leftItems.find(AppStatusBarComponent).length).to.eq(1);

      let addonItem1 = wrapper.find("i.icon-visibility-hide-2");
      expect(addonItem1.exists()).to.be.true;
      let addonItem2 = wrapper.find("i.icon-hand-2");
      expect(addonItem2.exists()).to.be.true;
      let addonItem3 = wrapper.find("i.icon-hand-2-condition");
      expect(addonItem3.exists()).to.be.true;

      TestUiProvider.triggerSyncRefresh();

      await TestUtils.flushAsyncOperations();
      wrapper.update();

      addonItem1 = wrapper.find("i.icon-visibility-hide-2");
      expect(addonItem1.exists()).to.be.true;
      addonItem2 = wrapper.find("i.icon-hand-2");
      expect(addonItem2.exists()).to.be.true;
      addonItem3 = wrapper.find("i.icon-hand-2-condition");
      expect(addonItem3.exists()).to.be.false;

      UiItemsManager.unregister(uiProvider.id);
      await TestUtils.flushAsyncOperations();
      wrapper.update();

      addonItem1 = wrapper.find("i.icon-visibility-hide-2");
      expect(addonItem1.exists()).to.be.false;
    });

    it("StatusBarComposer should render items with custom CSS classes", () => {
      const items: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("item1", StatusBarSection.Left, 1, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item2", StatusBarSection.Center, 1, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item3", StatusBarSection.Right, 1, <AppStatusBarComponent />),
      ];

      expect(items.length).to.eq(3);

      const wrapper = mount(<StatusBarComposer items={items} mainClassName="main-test" leftClassName="left-test" centerClassName="center-test" rightClassName="right-test" />);

      const mainSB = wrapper.find("div.main-test");
      expect(mainSB.length).to.eq(1);

      const leftItems = wrapper.find("div.left-test");
      expect(leftItems.length).to.eq(1);
      expect(leftItems.find(AppStatusBarComponent).length).to.eq(1);

      const centerItems = wrapper.find("div.center-test");
      expect(centerItems.length).to.eq(1);
      expect(centerItems.find(AppStatusBarComponent).length).to.eq(1);

      const rightItems = wrapper.find("div.right-test");
      expect(rightItems.length).to.eq(1);
      expect(rightItems.find(AppStatusBarComponent).length).to.eq(1);
    });

  });

  describe("StatusBarComposer React-Testing", () => {
    before(async () => {
      await TestUtils.initializeUiFramework();
      await NoRenderApp.startup();

      const statusBarWidgetDef = new WidgetDef({
        classId: AppStatusBarWidgetControl,
        defaultState: WidgetState.Open,
        isFreeform: false,
        isStatusBar: true,
      });
      widgetControl = statusBarWidgetDef.getWidgetControl(ConfigurableUiControlType.StatusBarWidget) as StatusBarWidgetControl;
    });

    after(async () => {
      TestUtils.terminateUiFramework();
      await IModelApp.shutdown();
    });

    it("will render 4 items without overflow", () => {
      // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
      sinon.stub(Element.prototype, "getBoundingClientRect").callsFake(function (this: HTMLElement) {
        if (this.classList.contains("uifw-statusbar-docked")) {
          return createDOMRect({ width: 168 }); // 4*42
        } else if (this.classList.contains("uifw-statusbar-item-container")) {
          return createDOMRect({ width: 40 });
        } else if (this.classList.contains("uifw-statusbar-overflow")) {
          return createDOMRect({ width: 40 });
        }

        return createDOMRect();
      });

      const items: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("item1", StatusBarSection.Left, 1, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item2", StatusBarSection.Center, 1, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item3", StatusBarSection.Context, 2, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item4", StatusBarSection.Right, 1, <AppStatusBarComponent />),
      ];

      const renderedComponent = render(<StatusBarComposer items={items} mainClassName="main-test" leftClassName="left-test" centerClassName="center-test" rightClassName="right-test" />);

      expect(renderedComponent).not.to.be.undefined;
      expect(renderedComponent.container.querySelectorAll(".uifw-statusbar-item-container")).lengthOf(4);

      const newItems: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("item1", StatusBarSection.Left, 1, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item2", StatusBarSection.Center, 1, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item3", StatusBarSection.Context, 2, <AppStatusBarComponent />),
      ];

      renderedComponent.rerender(<StatusBarComposer items={newItems} mainClassName="main-test" leftClassName="left-test" centerClassName="center-test" rightClassName="right-test" />);
      expect(renderedComponent.container.querySelectorAll(".uifw-statusbar-item-container")).lengthOf(3);
    });

    it("will render 1 item with overflow - 4 in overflow panel", async () => {
      // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
      sinon.stub(Element.prototype, "getBoundingClientRect").callsFake(function (this: HTMLElement) {
        if (this.classList.contains("uifw-statusbar-docked")) {
          return createDOMRect({ width: 84 }); // 2*42
        } else if (this.classList.contains("uifw-statusbar-item-container")) {
          return createDOMRect({ width: 40 });
        } else if (this.classList.contains("uifw-statusbar-overflow")) {
          return createDOMRect({ width: 40 });
        }

        return createDOMRect();
      });

      const items: StatusBarItem[] = [
        StatusBarItemUtilities.createStatusBarItem("item1", StatusBarSection.Left, 1, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item2", StatusBarSection.Left, 2, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item3", StatusBarSection.Center, 1, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item4", StatusBarSection.Context, 2, <AppStatusBarComponent />),
        StatusBarItemUtilities.createStatusBarItem("item5", StatusBarSection.Right, 1, <AppStatusBarComponent />),
      ];

      const renderedComponent = render(<StatusBarComposer items={items} mainClassName="main-test" leftClassName="left-test" centerClassName="center-test" rightClassName="right-test" />);
      expect(renderedComponent).not.to.be.undefined;
      expect(renderedComponent.container.querySelectorAll(".uifw-statusbar-item-container")).lengthOf(1);
      const overflow = renderedComponent.container.querySelector(".uifw-statusbar-overflow") as HTMLDivElement;
      expect(overflow).not.to.be.null;
      fireEvent.click(overflow);
      await TestUtils.flushAsyncOperations();
      const containerInPortal = renderedComponent.getByTestId("uifw-statusbar-overflow-items-container");
      expect(containerInPortal.querySelectorAll(".uifw-statusbar-item-container")).lengthOf(4);
      fireEvent.click(overflow);
      await TestUtils.flushAsyncOperations();
      expect(renderedComponent.container.querySelectorAll(".uifw-statusbar-item-container")).lengthOf(1);
    });
  });

});
