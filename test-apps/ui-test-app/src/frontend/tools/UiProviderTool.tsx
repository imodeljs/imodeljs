/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tools
 */

// cSpell: ignore popout

import * as React from "react";
import { IModelApp, Tool } from "@bentley/imodeljs-frontend";
import {
  AbstractStatusBarItemUtilities, AbstractWidgetProps, BadgeType, CommonStatusBarItem, CommonToolbarItem, ConditionalBooleanValue,
  ConditionalStringValue, IconSpecUtilities, StagePanelLocation, StagePanelSection, StageUsage, StatusBarSection, ToolbarItemUtilities, ToolbarOrientation, ToolbarUsage,
  UiItemsManager, UiItemsProvider,
} from "@bentley/ui-abstract";
import { FillCentered } from "@bentley/ui-core";
import {
  ActionCreatorsObject, ActionsUnion, ChildWindowLocationProps, createAction,
  ReducerRegistryInstance, StateManager, StatusBarItemUtilities, UiFramework, withStatusFieldProps,
} from "@bentley/ui-framework";
import { ShadowField } from "../appui/statusfields/ShadowField";
import { SampleAppIModelApp, SampleAppUiActionId } from "../index";
import toolIconSvg from "@bentley/icons-generic/icons/window-add.svg?sprite";
import tool2IconSvg from "@bentley/icons-generic/icons/window-maximize.svg?sprite";
import tool3IconSvg from "@bentley/icons-generic/icons/3d-render.svg?sprite";
import { PopupTestPanel } from "./PopupTestPanel";
import { PopupTestView } from "./PopupTestView";
import { ComponentExamplesPage } from "../appui/frontstages/component-examples/ComponentExamples";
import { ComponentExamplesProvider } from "../appui/frontstages/component-examples/ComponentExamplesProvider";

// Simulate redux state being added via a extension
interface SampleExtensionState {
  extensionUiVisible?: boolean;
}

class SampleExtensionStateManager {
  public static extensionStateManagerLoaded = false;

  private static _initialState: SampleExtensionState = {
    extensionUiVisible: false,
  };

  private static _reducerName = "sampleExtensionState";

  public static SET_EXTENSION_UI_VISIBLE = SampleExtensionStateManager.createActionName("SET_EXTENSION_UI_VISIBLE");

  private static _extensionActions: ActionCreatorsObject = {
    setDialogVisible: (extensionUiVisible: boolean) =>
      createAction(SampleExtensionStateManager.SET_EXTENSION_UI_VISIBLE, extensionUiVisible),
  };

  private static createActionName(name: string) {
    // convert to lower case so it can serve as a sync event when called via UiFramework.dispatchActionToStore
    return `${SampleExtensionStateManager._reducerName}:${name}`.toLowerCase();
  }

  // reducer
  public static extensionReducer(
    state: SampleExtensionState = SampleExtensionStateManager._initialState,
    action: any,
  ): SampleExtensionState {
    type ExtensionActionsUnion = ActionsUnion<typeof SampleExtensionStateManager._extensionActions>;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const extensionActionsParam = action as ExtensionActionsUnion;

    switch (extensionActionsParam.type) {
      case SampleExtensionStateManager.SET_EXTENSION_UI_VISIBLE:
        return { ...state, extensionUiVisible: action.payload };
      default:
        return state;
    }
  }

  public static initialize() {
    ReducerRegistryInstance.registerReducer(
      SampleExtensionStateManager._reducerName,
      SampleExtensionStateManager.extensionReducer,
    );
    SampleExtensionStateManager.extensionStateManagerLoaded = true;
  }

  public static get isExtensionUiVisible(): boolean {
    if (StateManager.isInitialized()) {
      return StateManager.store.getState().sampleExtensionState.extensionUiVisible;
    } else {
      return false;
    }
  }

  public static set isExtensionUiVisible(visible: boolean) {
    UiFramework.dispatchActionToStore(SampleExtensionStateManager.SET_EXTENSION_UI_VISIBLE, visible, true);
  }
}

/** test code */
class TestUiProvider implements UiItemsProvider {
  public readonly id = "TestUiProvider";

  public provideToolbarButtonItems(_stageId: string, stageUsage: string, toolbarUsage: ToolbarUsage, toolbarOrientation: ToolbarOrientation): CommonToolbarItem[] {

    if (stageUsage === StageUsage.General && toolbarUsage === ToolbarUsage.ContentManipulation && toolbarOrientation === ToolbarOrientation.Horizontal) {
      const simpleActionSpec = ToolbarItemUtilities.createActionButton("simple-test-action-tool", 200, "icon-developer", "simple-test-action-tool",
        (): void => {
          // eslint-disable-next-line no-console
          console.log("Got Here!");
        });

      const isHiddenCondition = new ConditionalBooleanValue((): boolean => SampleAppIModelApp.getTestProperty() === "HIDE", [SampleAppUiActionId.setTestProperty]);
      const childActionSpec = ToolbarItemUtilities.createActionButton("child-test-action-tool", 210, "icon-developer", "child-test-action-tool",
        (): void => {
          // eslint-disable-next-line no-console
          console.log("Got Here!");
        }, { isHidden: isHiddenCondition });

      const nestedActionSpec = ToolbarItemUtilities.createActionButton("nested-test-action-tool", 220, "icon-developer", "test action tool (nested)",
        (): void => {
          // eslint-disable-next-line no-console
          console.log("Got Here!");
        });
      const groupSpec = ToolbarItemUtilities.createGroupButton("test-tool-group", 230, "icon-developer", "test group", [childActionSpec, simpleActionSpec], { badgeType: BadgeType.TechnicalPreview, parentToolGroupId: "tool-formatting-setting" });

      return [simpleActionSpec, nestedActionSpec, groupSpec];
    }
    return [];
  }

  public provideStatusBarItems(_stageId: string, stageUsage: string): CommonStatusBarItem[] {
    const statusBarItems: CommonStatusBarItem[] = [];
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const ShadowToggle = withStatusFieldProps(ShadowField);

    if (stageUsage === StageUsage.General) {
      statusBarItems.push(
        AbstractStatusBarItemUtilities.createActionItem("ExtensionTest:StatusBarItem1", StatusBarSection.Center, 100, "icon-developer", "test status bar from extension",
          () => {
            // eslint-disable-next-line no-console
            console.log("Got Here!");
          }));

      const isHidden = new ConditionalBooleanValue(() => !SampleExtensionStateManager.isExtensionUiVisible, [SampleExtensionStateManager.SET_EXTENSION_UI_VISIBLE]);
      const statusBarItem = AbstractStatusBarItemUtilities.createLabelItem("ExtensionTest:StatusBarLabel1", StatusBarSection.Center, 100, "icon-hand-2", "Hello", undefined, { isHidden });
      statusBarItems.push(statusBarItem);

      const labelCondition = new ConditionalStringValue(() => SampleExtensionStateManager.isExtensionUiVisible ? "Click to Hide" : "Click to Show", [SampleExtensionStateManager.SET_EXTENSION_UI_VISIBLE]);
      const iconCondition = new ConditionalStringValue(() => SampleExtensionStateManager.isExtensionUiVisible ? "icon-visibility-hide-2" : "icon-visibility", [SampleExtensionStateManager.SET_EXTENSION_UI_VISIBLE]);

      statusBarItems.push(
        AbstractStatusBarItemUtilities.createActionItem("ExtensionTest:StatusBarItem2", StatusBarSection.Center, 110, iconCondition, labelCondition,
          () => {
            SampleExtensionStateManager.isExtensionUiVisible = !SampleExtensionStateManager.isExtensionUiVisible;
          }));

      // add entry that supplies react component
      statusBarItems.push(StatusBarItemUtilities.createStatusBarItem("ShadowToggle", StatusBarSection.Right, 5, <ShadowToggle />));
    }
    return statusBarItems;
  }

  public provideWidgets(stageId: string, _stageUsage: string, location: StagePanelLocation, section?: StagePanelSection | undefined): ReadonlyArray<AbstractWidgetProps> {
    const widgets: AbstractWidgetProps[] = [];
    const allowedStages = ["ViewsFrontstage", "Ui2"];
    // Section parameter is ignored. The widget will be added once to the top section of a right panel.
    if (allowedStages.includes(stageId) && location === StagePanelLocation.Right) {
      widgets.push({
        id: "addonWidget",
        getWidgetContent: () => <FillCentered>Addon Widget in panel</FillCentered>, // eslint-disable-line react/display-name
      });
    }
    if (allowedStages.includes(stageId) && location === StagePanelLocation.Right && section === StagePanelSection.Middle) {
      widgets.push({
        id: "addonWidgetMiddle",
        getWidgetContent: () => <FillCentered>Addon Widget in middle section</FillCentered>, // eslint-disable-line react/display-name
      });
    }
    return widgets;
  }
}

/** An Immediate Tool that toggles the test ui provider defined above. */
export class UiProviderTool extends Tool {
  public static testExtensionLoaded = "";

  public static override toolId = "TestUiProvider";
  public override run(_args: any[]): boolean {
    // load state before ui provide so state is available when rendering on load occurs.
    if (!SampleExtensionStateManager.extensionStateManagerLoaded)
      SampleExtensionStateManager.initialize();

    if (UiProviderTool.testExtensionLoaded.length > 0) {
      UiItemsManager.unregister(UiProviderTool.testExtensionLoaded);
      UiProviderTool.testExtensionLoaded = "";
    } else {
      const testUiProvider = new TestUiProvider();
      UiItemsManager.register(testUiProvider);
      UiProviderTool.testExtensionLoaded = testUiProvider.id;
    }

    return true;
  }
}

export class OpenComponentExamplesPopoutTool extends Tool {
  public static override toolId = "openComponentExamplesChildWindow";
  public static override iconSpec = IconSpecUtilities.createSvgIconSpec(toolIconSvg);

  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 0; }

  public override run(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this._run();
    return true;
  }

  private async _run(): Promise<void> {
    const location: ChildWindowLocationProps = {
      width: 800,
      height: 600,
      left: 0,
      top: 0,
    };
    const connection = UiFramework.getIModelConnection();
    if (connection)
      UiFramework.childWindowManager.openChildWindow("ComponentExamples", "Component Examples", <ComponentExamplesPage categories={ComponentExamplesProvider.categories} hideThemeOption />, location, UiFramework.useDefaultPopoutUrl);
  }

  public static override get flyover(): string {
    return "open examples popout";
  }

  // if supporting localized key-ins return a localized string
  public static override get keyin(): string {
    return "open examples popout";
  }

  public static override get englishKeyin(): string {
    return "open examples popout";
  }

  public static getActionButtonDef(itemPriority: number, groupPriority?: number) {
    const overrides = {
      groupPriority,
    };
    return ToolbarItemUtilities.createActionButton(OpenComponentExamplesPopoutTool.toolId, itemPriority, OpenComponentExamplesPopoutTool.iconSpec, OpenComponentExamplesPopoutTool.flyover,
      () => { IModelApp.tools.run(OpenComponentExamplesPopoutTool.toolId); }, overrides);
  }
}
export class OpenCustomPopoutTool extends Tool {
  public static override toolId = "OpenCustomPopout";
  public static override iconSpec = IconSpecUtilities.createSvgIconSpec(tool2IconSvg);

  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 0; }

  public override run(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this._run();
    return true;
  }

  private async _run(): Promise<void> {
    const location: ChildWindowLocationProps = {
      width: 800,
      height: 600,
      left: 0,
      top: 0,
    };
    UiFramework.childWindowManager.openChildWindow("CustomPopout", "Custom Popout", <PopupTestPanel />, location /* , UiFramework.useDefaultPopoutUrl*/);
  }

  public static override get flyover(): string {
    return "open custom popout";
  }

  // if supporting localized key-ins return a localized string
  public static override get keyin(): string {
    return "open custom popout";
  }

  public static override get englishKeyin(): string {
    return "open custom popout";
  }

  public static getActionButtonDef(itemPriority: number, groupPriority?: number) {
    const overrides = {
      groupPriority,
    };
    return ToolbarItemUtilities.createActionButton(OpenCustomPopoutTool.toolId, itemPriority, OpenCustomPopoutTool.iconSpec, OpenCustomPopoutTool.flyover,
      () => { IModelApp.tools.run(OpenCustomPopoutTool.toolId); }, overrides);
  }
}

export class OpenViewPopoutTool extends Tool {
  public static override toolId = "OpenViewPopout";
  public static override iconSpec = IconSpecUtilities.createSvgIconSpec(tool3IconSvg);

  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 0; }

  public override run(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this._run();
    return true;
  }

  private async _run(): Promise<void> {
    const location: ChildWindowLocationProps = {
      width: 800,
      height: 600,
      left: 0,
      top: 0,
    };
    UiFramework.childWindowManager.openChildWindow("ViewPopout", "View Popout", <PopupTestView />, location);
  }

  public static override get flyover(): string {
    return "open view popout";
  }

  // if supporting localized key-ins return a localized string
  public static override get keyin(): string {
    return "open view popout";
  }

  public static override get englishKeyin(): string {
    return "open view popout";
  }

  public static getActionButtonDef(itemPriority: number, groupPriority?: number) {
    const overrides = {
      groupPriority,
    };
    return ToolbarItemUtilities.createActionButton(OpenViewPopoutTool.toolId, itemPriority, OpenViewPopoutTool.iconSpec, OpenViewPopoutTool.flyover,
      () => { IModelApp.tools.run(OpenViewPopoutTool.toolId); }, overrides);
  }
}

