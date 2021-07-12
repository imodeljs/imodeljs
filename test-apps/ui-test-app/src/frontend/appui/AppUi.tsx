/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "@bentley/icons-generic-webfont/dist/bentley-icons-generic-webfont.css";
/** Include application registered Controls in Webpack
 */
import "./contentviews/CubeContent";
import "./contentviews/TableExampleContent";
import "./contentviews/TreeExampleContent";
import "./contentviews/ScheduleAnimationViewport";
import "./widgets/BreadcrumbDemoWidget";
import "./widgets/TreeDemoWidget";
import "./widgets/TableDemoWidget";
import "./widgets/FeedbackWidget";
import "./widgets/NavigationTreeWidget";
import "./widgets/PropertyGridDemoWidget";
import "./widgets/VisibilityTreeWidget";
import "./tooluiproviders/Tool1UiProvider";
import "./tooluiproviders/Tool2UiProvider";
import "./statusbars/AppStatusBar";
import "./navigationaids/CubeExampleNavigationAid";
import * as React from "react";
import { BadgeType, FunctionKey, StagePanelLocation, StagePanelSection, StageUsage, WidgetState } from "@bentley/ui-abstract";
import { FillCentered } from "@bentley/ui-core";
import {
  AccuDrawCommandItems,
  AccuDrawKeyboardShortcuts,
  AccuDrawUiSettings,
  CommandItemDef,
  ConfigurableUiManager,
  ContentGroupProps,
  ContentLayoutProps,
  FrameworkAccuDraw,
  FrontstageManager,
  KeyboardShortcutManager,
  KeyboardShortcutProps,
  TaskPropsList,
  UiFramework,
  WidgetDef,
  WidgetProvider,
  WorkflowProps,
  WorkflowPropsList,
  ZoneLocation,
} from "@bentley/ui-framework";
import { IModelViewportControl } from "./contentviews/IModelViewport";
import { Frontstage1 } from "./frontstages/Frontstage1";
import { Frontstage2 } from "./frontstages/Frontstage2";
import { Frontstage3 } from "./frontstages/Frontstage3";
import { Frontstage4 } from "./frontstages/Frontstage4";
import { FrontstageUi2 } from "./frontstages/FrontstageUi2";
import { IModelIndexFrontstage } from "./frontstages/IModelIndexFrontstage";
import { IModelOpenFrontstage } from "./frontstages/IModelOpenFrontstage";
import { ScheduleAnimationFrontstage } from "./frontstages/ScheduleAnimationFrontstage";
import { SignInFrontstage } from "./frontstages/SignInFrontstage";
import { AccuDrawPopupTools } from "../tools/AccuDrawPopupTools";
import { AppTools } from "../tools/ToolSpecifications";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { ColorByName, ColorDef } from "@bentley/imodeljs-common";

// cSpell:ignore uitestapp

/** Example Ui Configuration for an iModelJS App
 */
export class AppUi {

  public static initialize() {
    AppUi.defineFrontstages();
    AppUi.defineContentGroups();
    AppUi.defineContentLayouts();
    AppUi.defineTasksAndWorkflows();
    AppUi.defineKeyboardShortcuts();

    // use to test WidgetProvider API - Note: this is different from UiItemsProvider
    AppUi.defineDynamicWidgets();

    // AppUi.setAccuDrawUiSettings();
  }

  /** Define Frontstages
   */
  private static defineFrontstages() {

    ConfigurableUiManager.addFrontstageProvider(new Frontstage1());
    ConfigurableUiManager.addFrontstageProvider(new Frontstage2());
    ConfigurableUiManager.addFrontstageProvider(new Frontstage3());
    ConfigurableUiManager.addFrontstageProvider(new Frontstage4());
    ConfigurableUiManager.addFrontstageProvider(new FrontstageUi2());
    ConfigurableUiManager.addFrontstageProvider(new IModelIndexFrontstage());
    ConfigurableUiManager.addFrontstageProvider(new IModelOpenFrontstage());
    ConfigurableUiManager.addFrontstageProvider(new SignInFrontstage());
    ConfigurableUiManager.addFrontstageProvider(new ScheduleAnimationFrontstage());
  }

  public static command1 = () => {
    const activeFrontstageDef = FrontstageManager.activeFrontstageDef;
    if (activeFrontstageDef) {
      const widgetDef = activeFrontstageDef.findWidgetDef("VerticalPropertyGrid");
      if (widgetDef) {
        widgetDef.setWidgetState(WidgetState.Open);
      }
    }
  };

  public static command2 = () => {
    const activeFrontstageDef = FrontstageManager.activeFrontstageDef;
    if (activeFrontstageDef) {
      const widgetDef = activeFrontstageDef.findWidgetDef("VerticalPropertyGrid");
      if (widgetDef) {
        widgetDef.setWidgetState(WidgetState.Hidden);
      }
    }
  };

  /** Define Content Groups referenced by Frontstages.
   */
  private static defineContentGroups() {
    const singleIModelViewport: ContentGroupProps = {
      id: "singleIModelViewport",
      contents: [
        {
          classId: IModelViewportControl,
          id: "singleIModelView",
        },
      ],
    };

    const drawingAndSheetViewports: ContentGroupProps = {
      id: "DrawingAndSheetViewports",
      contents: [
        {
          classId: IModelViewportControl,
        },
        {
          classId: IModelViewportControl,
        },
      ],
    };

    const threeIModelViewportsWithItemsTable: ContentGroupProps = {
      id: "ThreeIModelViewportsWithItemsTable",
      contents: [
        {
          classId: IModelViewportControl,
        },
        {
          classId: IModelViewportControl,
        },
        {
          classId: "TablePane",
        },
        {
          classId: IModelViewportControl,
        },
      ],
    };

    const testContentGroup1: ContentGroupProps = {
      id: "TestContentGroup1",
      contents: [
        {
          classId: IModelViewportControl,
          applicationData: { label: "Content 1a", bgColor: "black" },
        },
        {
          classId: IModelViewportControl,
          applicationData: { label: "Content 2a", bgColor: "black" },
        },
        {
          classId: "TableExampleContent",
          applicationData: { label: "Content 3a", bgColor: "black" },
        },
        {
          classId: "TestContent",
          applicationData: { label: "Content 4a", bgColor: "black" },
        },
      ],
    };

    const testContentGroup2: ContentGroupProps = {
      id: "TestContentGroup2",
      contents: [
        {
          classId: IModelViewportControl,
          applicationData: { label: "Content 1b", bgColor: "black" },
        },
        {
          classId: IModelViewportControl,
          applicationData: { label: "Content 2b", bgColor: "black" },
        },
        {
          classId: "TableExampleContent",
          applicationData: { label: "Content 3b", bgColor: "black" },
        },
        {
          classId: IModelViewportControl,
          applicationData: { label: "Content 4b", bgColor: "black" },
        },
      ],
    };

    const testContentGroup3: ContentGroupProps = {
      id: "TestContentGroup3",
      contents: [
        {
          classId: IModelViewportControl,
          applicationData: { label: "Content 1a", bgColor: "black" },
        },
        {
          classId: "CubeContent",
          applicationData: { label: "Content 2a", bgColor: "black" },
        },
        {
          classId: "TableExampleContent",
          applicationData: { label: "Content 3a", bgColor: "black" },
        },
        {
          classId: IModelViewportControl,
          applicationData: { label: "Content 4a", bgColor: "black" },
        },
      ],
    };

    const testContentGroup4: ContentGroupProps = {
      id: "TestContentGroup4",
      contents: [
        {
          classId: IModelViewportControl,
          applicationData: { label: "Content 1a", bgColor: "black" },
        },
        {
          classId: IModelViewportControl,
          applicationData: { label: "Content 2a", bgColor: "black" },
        },
        {
          classId: "TableExampleContent",
          applicationData: { label: "Content 3a", bgColor: "black" },
        },
        {
          classId: "TreeExampleContent",
          applicationData: { label: "Content 4a", bgColor: "black" },
        },
      ],
    };

    const contentGroups: ContentGroupProps[] = [];
    contentGroups.push(singleIModelViewport, drawingAndSheetViewports, threeIModelViewportsWithItemsTable, testContentGroup1, testContentGroup2, testContentGroup3, testContentGroup4);
    ConfigurableUiManager.loadContentGroups(contentGroups);
  }

  /** Define Content Layouts referenced by Frontstages.
   */
  private static defineContentLayouts() {
    const contentLayouts: ContentLayoutProps[] = AppUi.getContentLayouts();
    ConfigurableUiManager.loadContentLayouts(contentLayouts);
  }

  private static getContentLayouts(): ContentLayoutProps[] {
    const fourQuadrants: ContentLayoutProps = {
      id: "FourQuadrants",
      horizontalSplit: {
        percentage: 0.50,
        minSizeTop: 100, minSizeBottom: 100,
        top: { verticalSplit: { percentage: 0.50, left: 0, right: 1, minSizeLeft: 100, minSizeRight: 100 } },
        bottom: { verticalSplit: { percentage: 0.50, left: 2, right: 3, minSizeLeft: 100, minSizeRight: 100 } },
      },
    };

    const twoHalvesVertical: ContentLayoutProps = {
      id: "TwoHalvesVertical",
      verticalSplit: { percentage: 0.50, left: 0, right: 1, minSizeLeft: 100, minSizeRight: 100 },
    };

    const twoHalvesHorizontal: ContentLayoutProps = {
      id: "TwoHalvesHorizontal",
      horizontalSplit: { percentage: 0.50, top: 0, bottom: 1, minSizeTop: 100, minSizeBottom: 100 },
    };

    const singleContent: ContentLayoutProps = {
      id: "SingleContent",
    };

    const threeRightStacked: ContentLayoutProps = { // Three Views, one on the left, two stacked on the right.
      id: "ThreeRightStacked",
      verticalSplit: {
        id: "ThreeRightStacked.MainVertical",
        percentage: 0.50,
        minSizeLeft: 100, minSizeRight: 100,
        left: 0,
        right: { horizontalSplit: { percentage: 0.50, top: 1, bottom: 2, minSizeTop: 100, minSizeBottom: 100 } },
      },
    };

    const contentLayouts: ContentLayoutProps[] = [];
    // in order to pick out by number of views for convenience.
    contentLayouts.push(singleContent, twoHalvesVertical, threeRightStacked, fourQuadrants, singleContent, twoHalvesHorizontal);
    return contentLayouts;
  }

  public static findLayoutFromContentCount(contentCount: number): ContentLayoutProps | undefined {
    const contentLayouts: ContentLayoutProps[] = AppUi.getContentLayouts();
    if (contentCount <= 4)
      return contentLayouts[contentCount - 1];
    return undefined;
  }

  /** Define Tasks list and Workflows list.
   */
  private static defineTasksAndWorkflows() {
    const taskPropsList: TaskPropsList = {
      tasks: [
        {
          id: "Task1",
          primaryStageId: "Test1",
          iconSpec: "icon-placeholder",
          labelKey: "SampleApp:backstage.task1",
        },
        {
          id: "Task2",
          primaryStageId: "ViewsFrontstage",
          iconSpec: "icon-placeholder",
          labelKey: "SampleApp:backstage.task2",
        },
      ],
    };

    ConfigurableUiManager.loadTasks(taskPropsList);

    // Test Workflows
    const workflowProps: WorkflowProps = {
      id: "ExampleWorkflow",
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:Test.my-label",
      defaultTaskId: "task1",
      tasks: ["Task1", "Task2"],
    };

    ConfigurableUiManager.loadWorkflow(workflowProps);

    // Test Workflows
    const workflowPropsList: WorkflowPropsList = {
      defaultWorkflowId: "ExampleWorkflow",
      workflows: [
        {
          id: "ExampleWorkflow",
          iconSpec: "icon-placeholder",
          labelKey: "SampleApp:Test.my-label",
          defaultTaskId: "task1",
          tasks: ["Task1", "Task2"],
        },
      ],
    };

    ConfigurableUiManager.loadWorkflows(workflowPropsList);
  }

  /** Define Keyboard Shortcuts list.
   */
  private static defineKeyboardShortcuts() {
    const keyboardShortcutList: KeyboardShortcutProps[] = [
      {
        key: "f",
        item: AppTools.setLengthFormatImperialCommand,
      },
      {
        key: "m",
        labelKey: "SampleApp:buttons.accuDrawSubMenu",
        shortcuts: [
          {
            key: "b",
            item: AccuDrawPopupTools.addMenuButton,
          },
          {
            key: "h",
            item: AccuDrawPopupTools.hideMenuButton,
          },
          {
            key: "c",
            item: AccuDrawPopupTools.showCalculator,
          },
          {
            key: "m",
            item: AccuDrawPopupTools.showContextMenu,
          },
          {
            key: "t",
            item: AccuDrawPopupTools.showToolbar,
          },
          {
            key: "l",
            item: AccuDrawPopupTools.showHTMLElement,
          },
          {
            key: "n",
            item: AppUi._bumpToolSettingToggle,
          },
          {
            key: "f",
            item: AccuDrawCommandItems.focusToolSetting,
          },
        ],
      },
      {
        key: FunctionKey.F7,
        item: AppUi._showShortcutsMenuCommand,
      },
    ];

    ConfigurableUiManager.loadKeyboardShortcuts(keyboardShortcutList);

    ConfigurableUiManager.loadKeyboardShortcuts(AccuDrawKeyboardShortcuts.getDefaultShortcuts());
  }

  private static get _bumpToolSettingToggle() {
    return new CommandItemDef({
      commandId: "bumpToolSettingToggle",
      labelKey: "SampleApp:buttons.bumpToolSettingToggle",
      execute: async () => IModelApp.toolAdmin.bumpToolSetting(2),  // Works with ToolWithSettings
    });
  }

  private static get _showShortcutsMenuCommand() {
    return new CommandItemDef({
      commandId: "showShortcutsMenu",
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.showShortcutsMenu",
      execute: () => {
        KeyboardShortcutManager.displayShortcutsMenu();
      },
    });
  }

  private static defineDynamicWidgets() {
    const widgetDef1 = new WidgetDef({
      iconSpec: "icon-placeholder",
      label: "Dynamic Widget 1",
      element: <FillCentered>Dynamic Widget for ViewsFrontstage</FillCentered>,
      fillZone: true,
      priority: -1,
      badgeType: BadgeType.TechnicalPreview,
    });
    UiFramework.widgetManager.addWidgetDef(widgetDef1, "ViewsFrontstage", undefined, ZoneLocation.BottomRight);

    const widgetDef2 = new WidgetDef({
      iconSpec: "icon-placeholder",
      label: "Dynamic Widget 2",
      element: <FillCentered>Dynamic Widget for StageUsage.General</FillCentered>,
      fillZone: true,
      priority: -1,
    });
    UiFramework.widgetManager.addWidgetDef(widgetDef2, undefined, StageUsage.General, ZoneLocation.BottomRight);

    const widgetDef3 = new WidgetDef({
      id: "uitestapp-test-wd3",
      iconSpec: "icon-placeholder",
      label: "Dynamic Widget 3",
      element: <FillCentered>Dynamic Widget in panel</FillCentered>,
      fillZone: true,
      priority: -1,
    });
    const provider: WidgetProvider = {
      id: "test",
      getWidgetDefs: (stageId: string, _stageUsage: string, location: ZoneLocation | StagePanelLocation, _section?: StagePanelSection | undefined): ReadonlyArray<WidgetDef> | undefined => {
        if (stageId === "ViewsFrontstage" && location === StagePanelLocation.Right) {
          return [widgetDef3];
        }
        return undefined;
      },
    };
    UiFramework.widgetManager.addWidgetProvider(provider);
  }

  private static setAccuDrawUiSettings() {
    const iconTest = "icon-placeholder";

    const appSettings: AccuDrawUiSettings = {
      xBackgroundColor: "var(--buic-background-control)",
      xForegroundColor: "var(--buic-foreground-body)",
      xLabel: "-X-",
      xIcon: iconTest,
    };

    const userSettings: AccuDrawUiSettings = {
      yBackgroundColor: ColorDef.create(ColorByName.darkBrown),
      yLabel: "-Y-",
    };

    FrameworkAccuDraw.uiSettings = { ...appSettings, ...userSettings };
  }
}
