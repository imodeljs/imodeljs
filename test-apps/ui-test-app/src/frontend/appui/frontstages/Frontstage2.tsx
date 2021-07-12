/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import {
  BaseItemState,
  CommandItemDef,
  ContentGroup, ContentLayoutDef, ContentViewManager, CoreTools, Frontstage, FrontstageProps, FrontstageProvider, GroupItemDef, ItemList, NavigationWidget,
  SelectionContextToolDefinitions,
  SessionStateActionId,
  SyncUiEventId,
  ToolWidget, UiFramework, Widget, Zone, ZoneState,
} from "@bentley/ui-framework";
import { AppTools } from "../../tools/ToolSpecifications";
import { TreeExampleContentControl } from "../contentviews/TreeExampleContent";
import { SmallStatusBarWidgetControl } from "../statusbars/SmallStatusBar";
import { NavigationTreeWidgetControl } from "../widgets/NavigationTreeWidget";
import {
  HorizontalPropertyGridContentControl, HorizontalPropertyGridWidgetControl, VerticalPropertyGridWidgetControl,
} from "../widgets/PropertyGridDemoWidget";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { ConditionalBooleanValue, WidgetState } from "@bentley/ui-abstract";

/* eslint-disable react/jsx-key, deprecation/deprecation */

export class Frontstage2 extends FrontstageProvider {

  public get frontstage(): React.ReactElement<FrontstageProps> {
    const contentLayoutDef: ContentLayoutDef = new ContentLayoutDef(
      { // Four Views, two stacked on the left, two stacked on the right.
        descriptionKey: "SampleApp:ContentLayoutDef.FourQuadrants",
        verticalSplit: {
          percentage: 0.50,
          minSizeLeft: 100, minSizeRight: 100,
          left: { horizontalSplit: { percentage: 0.50, top: 0, bottom: 1, minSizeTop: 100, minSizeBottom: 100 } },
          right: { horizontalSplit: { percentage: 0.50, top: 2, bottom: 3, minSizeTop: 100, minSizeBottom: 100 } },
        },
      },
    );

    const myContentGroup: ContentGroup = new ContentGroup(
      {
        contents: [
          {
            classId: "UiFramework.IModelViewportControl",
            applicationData: { label: "Content 1a", bgColor: "black", disableDefaultViewOverlay: true },
          },
          {
            classId: TreeExampleContentControl,
            applicationData: { label: "Content 2a", bgColor: "black" },
          },
          {
            classId: "TestApp.IModelViewport",
            applicationData: { label: "Content 3a", bgColor: "black", disableDefaultViewOverlay: true },
          },
          {
            classId: HorizontalPropertyGridContentControl,
            applicationData: { label: "Content 4a", bgColor: "black" },
          },
        ],
      },
    );

    return (
      <Frontstage id="Test2"
        defaultTool={CoreTools.selectElementCommand}
        defaultLayout={contentLayoutDef} contentGroup={myContentGroup}
        isInFooterMode={false} applicationData={{ key: "value", disableDefaultViewOverlay: true }}

        contentManipulationTools={
          <Zone
            widgets={[
              <Widget isFreeform={true} element={<FrontstageToolWidget />} />,
            ]}
          />
        }
        toolSettings={
          <Zone
            widgets={[
              <Widget isToolSettings={true} />,
            ]}
          />
        }
        viewNavigationTools={
          <Zone
            widgets={[
              <Widget isFreeform={true} element={<FrontstageNavigationWidget />} />,
            ]}
          />
        }
        centerRight={
          <Zone allowsMerging={true} defaultState={ZoneState.Minimized}
            widgets={[
              <Widget iconSpec="icon-placeholder" labelKey="SampleApp:widgets.NavigationTree" control={NavigationTreeWidgetControl} />,
            ]}
          />
        }
        statusBar={
          <Zone defaultState={ZoneState.Open}
            widgets={[
              <Widget isStatusBar={true} control={SmallStatusBarWidgetControl} />,
            ]}
          />
        }
        bottomRight={
          <Zone allowsMerging={true} defaultState={ZoneState.Minimized}
            widgets={[
              <Widget id="VerticalPropertyGrid" defaultState={WidgetState.Hidden} iconSpec="icon-placeholder" labelKey="SampleApp:widgets.VerticalPropertyGrid" control={VerticalPropertyGridWidgetControl} />,
              <Widget defaultState={WidgetState.Hidden} iconSpec="icon-placeholder" labelKey="SampleApp:widgets.HorizontalPropertyGrid" control={HorizontalPropertyGridWidgetControl} />,
            ]}
          />
        }
      />
    );
  }
}

function getSelectionContextSyncEventIds(): string[] {
  return [SyncUiEventId.SelectionSetChanged, SyncUiEventId.ActiveContentChanged, SyncUiEventId.ActiveViewportChanged, SessionStateActionId.SetNumItemsSelected];
}

function isSelectionSetEmpty(): boolean {
  const activeContentControl = ContentViewManager.getActiveContentControl();
  let selectionCount = 0;
  if (!UiFramework.frameworkStateKey)
    selectionCount = UiFramework.store.getState()[UiFramework.frameworkStateKey].frameworkState.sessionState.numItemsSelected;

  if (activeContentControl && activeContentControl.viewport
    && (activeContentControl.viewport.view.iModel.selectionSet.size > 0 || selectionCount > 0))
    return false;
  return true;
}

function selectionContextStateFunc(state: Readonly<BaseItemState>): BaseItemState {
  const isVisible = !isSelectionSetEmpty();
  return { ...state, isVisible };
}

function getIsHiddenIfSelectionNotActive(): ConditionalBooleanValue {
  return new ConditionalBooleanValue(isSelectionSetEmpty, getSelectionContextSyncEventIds());
}

/** Define a ToolWidget with Buttons to display in the TopLeft zone.
 */
class FrontstageToolWidget extends React.Component {
  // example toolbar item that hides/shows based on selection set
  public get myClearSelectionItemDef() {
    return new CommandItemDef({
      commandId: "UiFramework.ClearSelection",
      iconSpec: "icon-selection-clear",
      labelKey: "UiFramework:buttons.clearSelection",
      stateSyncIds: getSelectionContextSyncEventIds(), /* only used when in ui 1.0 mode */
      stateFunc: selectionContextStateFunc,  /* only used when in ui 1.0 mode */
      isHidden: getIsHiddenIfSelectionNotActive(),  /* only used when in ui 2.0 mode */
      execute: () => {
        const iModelConnection = UiFramework.getIModelConnection();
        if (iModelConnection) {
          iModelConnection.selectionSet.emptyAll();
        }
        const tool = IModelApp.toolAdmin.primitiveTool;
        if (tool)
          tool.onRestartTool();
        else
          IModelApp.toolAdmin.startDefaultTool();
      },
    });
  }

  private get _horizontalToolbarItems(): ItemList {
    const items = new ItemList([
      SelectionContextToolDefinitions.clearHideIsolateEmphasizeElementsItemDef,
      SelectionContextToolDefinitions.hideSectionToolGroup,
      SelectionContextToolDefinitions.isolateSelectionToolGroup,
      SelectionContextToolDefinitions.emphasizeElementsItemDef,
      AppTools.item1,
      AppTools.item2,
      new GroupItemDef({
        groupId: "SampleApp:buttons-toolGroup",
        labelKey: "SampleApp:buttons.toolGroup",
        iconSpec: "icon-symbol",
        items: [AppTools.tool1, AppTools.tool2],
        itemsInColumn: 7,
      }),
    ]);
    return items;
  }

  private get _verticalToolbarItems(): ItemList {
    const items = new ItemList([AppTools.item3, AppTools.item4, AppTools.item5, AppTools.item6, AppTools.item7, AppTools.item8]);
    return items;
  }

  public override render() {
    return (
      <ToolWidget
        appButton={AppTools.backstageToggleCommand}
        horizontalItems={this._horizontalToolbarItems}
        verticalItems={this._verticalToolbarItems}
      />
    );
  }
}

/** Define a NavigationWidget with Buttons to display in the TopRight zone.
 */
class FrontstageNavigationWidget extends React.Component {
  public override render() {
    const horizontalItems = new ItemList([
      CoreTools.fitViewCommand,
      CoreTools.windowAreaCommand,
      CoreTools.zoomViewCommand,
      CoreTools.panViewCommand,
      CoreTools.rotateViewCommand,
    ]);

    const verticalItems = new ItemList([
      CoreTools.toggleCameraViewCommand,
    ]);

    return (
      <NavigationWidget
        horizontalItems={horizontalItems}
        verticalItems={verticalItems}
      />
    );
  }
}
