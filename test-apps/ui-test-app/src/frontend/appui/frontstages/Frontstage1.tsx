/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { PlaybackSettings, TimelineComponent, TimelinePausePlayAction, TimelinePausePlayArgs } from "@bentley/ui-components";
import {
  ActionItemButton, CommandItemDef, ContentLayoutManager, CoreTools, Frontstage, FrontstageDef, FrontstageManager, FrontstageProps, FrontstageProvider, GroupButton,
  NavigationWidget, StagePanel, ToolButton, ToolWidget, useWidgetDirection, Widget, WidgetStateChangedEventArgs, Zone, ZoneLocation,
  ZoneState,
} from "@bentley/ui-framework";
import { Direction, Toolbar } from "@bentley/ui-ninezone";
import { AppTools } from "../../tools/ToolSpecifications";
import { SmallStatusBarWidgetControl } from "../statusbars/SmallStatusBar";
import { HorizontalPropertyGridWidgetControl, VerticalPropertyGridWidgetControl } from "../widgets/PropertyGridDemoWidget";
import { TableDemoWidgetControl } from "../widgets/TableDemoWidget";
import { NestedFrontstage1 } from "./NestedFrontstage1";
import { UiAdmin, WidgetState } from "@bentley/ui-abstract";

/* eslint-disable react/jsx-key, deprecation/deprecation */

function RightPanel() {
  const direction = useWidgetDirection();
  const [state, setState] = React.useState(() => {
    const frontstageDef = FrontstageManager.activeFrontstageDef!;
    const widgetDef = frontstageDef.findWidgetDef("VerticalPropertyGrid")!;
    return WidgetState[widgetDef.state];
  });
  React.useEffect(() => {
    const listener = (args: WidgetStateChangedEventArgs) => {
      if (args.widgetDef.id === "VerticalPropertyGrid")
        setState(WidgetState[args.widgetState]);
    };
    FrontstageManager.onWidgetStateChangedEvent.addListener(listener);
    return () => {
      FrontstageManager.onWidgetStateChangedEvent.removeListener(listener);
    };
  });
  return (
    <>
      <h2>Right panel</h2>
      <p>{state}</p>
      <p>{direction}</p>
    </>
  );
}

function SampleTimelineComponent() {
  const duration = 20 * 1000;
  const startDate = new Date(2014, 6, 6);
  const endDate = new Date(2016, 8, 12);
  const [loop, setLoop] = React.useState<boolean>(false);

  const handleOnSettingsChange = (settings: PlaybackSettings) => {
    if (settings.loop !== undefined) {
      setLoop(settings.loop);
    }
  };

  return (
    <div>
      <TimelineComponent
        startDate={startDate}
        endDate={endDate}
        initialDuration={0}
        totalDuration={duration}
        minimized={true}
        showDuration={true}
        repeat={loop}
        onSettingsChange={handleOnSettingsChange}
        alwaysMinimized={true}
        componentId={"sampleApp-sampleTimeline"} // qualify id with "<appName>-" to ensure uniqueness
      />
    </div>
  );
}

export class Frontstage1 extends FrontstageProvider {
  private _topMostPanel = {
    widgets: [
      <Widget element={<>
        <h2>TopMost panel</h2>
        <span>BottomMost panel:</span>
        &nbsp;
        <button onClick={() => {
          const frontstageDef = FrontstageManager.activeFrontstageDef;
          const widgetDef = frontstageDef?.findWidgetDef("BottomMostPanelWidget");
          widgetDef?.setWidgetState(WidgetState.Open);
        }}>show</button>
        &nbsp;
        <button onClick={() => {
          const frontstageDef = FrontstageManager.activeFrontstageDef;
          const widgetDef = frontstageDef?.findWidgetDef("BottomMostPanelWidget");
          widgetDef?.setWidgetState(WidgetState.Hidden);
        }}>hide</button>
      </>} />,
    ],
  };

  private _topPanel = {
    widgets: [
      <Widget element={<h2>Top panel</h2>} />,
    ],
  };

  private _leftPanel = {
    allowedZones: [2, 4, 7, 9],
  };

  private _rightPanel = {
    allowedZones: [2, 9],
    widgets: [
      <Widget element={<RightPanel />} />,
    ],
  };

  private _bottomPanel = {
    widgets: [
      <Widget element={<SampleTimelineComponent />} />,
    ],
  };

  private _bottomMostPanel = {
    allowedZones: [2, 4, 9],
    widgets: [
      <Widget id="BottomMostPanelWidget" element={<h2>BottomMost panel</h2>} />,
    ],
  };

  public get frontstage(): React.ReactElement<FrontstageProps> {
    return (
      <Frontstage id="Test1"
        version={1}
        defaultTool={CoreTools.selectElementCommand}
        defaultLayout="TwoHalvesVertical"
        contentGroup="TestContentGroup1"
        defaultContentId="TestContent1"
        isInFooterMode={true}
        applicationData={{ key: "value" }}
        topLeft={
          <Zone
            widgets={[
              <Widget isFreeform={true} element={<FrontstageToolWidget />} />,
            ]}
          />
        }
        topCenter={
          <Zone
            allowsMerging
            widgets={[
              <Widget isToolSettings={true} />,
            ]}
          />
        }
        topRight={
          <Zone
            widgets={[
              <Widget isFreeform={true} element={<FrontstageNavigationWidget />} />,
            ]}
          />
        }
        centerLeft={
          <Zone
            allowsMerging={true}
            defaultState={ZoneState.Minimized}
            widgets={[
              <Widget id="VerticalPropertyGrid" iconSpec="icon-placeholder" labelKey="SampleApp:widgets.VerticalPropertyGrid" control={VerticalPropertyGridWidgetControl} />,
            ]}
          />
        }
        bottomLeft={
          <Zone
            allowsMerging={true}
            defaultState={ZoneState.Minimized}
            widgets={[
              <Widget iconSpec="icon-placeholder" labelKey="SampleApp:widgets.TableDemo" control={TableDemoWidgetControl} />,
            ]}
          />
        }
        /** The HorizontalPropertyGrid in zone 9 should be merged across zones 6 & 9 and take up the height of both zones initially.
         *  The zones can be resized manually to take up the full height.
         */
        centerRight={
          <Zone defaultState={ZoneState.Open} allowsMerging={true} mergeWithZone={ZoneLocation.BottomRight}
          />
        }
        bottomCenter={
          <Zone defaultState={ZoneState.Open}
            widgets={[
              <Widget isStatusBar={true} control={SmallStatusBarWidgetControl} />,
            ]}
          />
        }
        bottomRight={
          <Zone defaultState={ZoneState.Open} allowsMerging={true}
            widgets={[
              <Widget defaultState={WidgetState.Open} iconSpec="icon-placeholder" labelKey="SampleApp:widgets.HorizontalPropertyGrid" control={HorizontalPropertyGridWidgetControl} fillZone={true} />,
              <Widget id="VerticalPropertyGrid1" defaultState={WidgetState.Hidden} iconSpec="icon-placeholder" labelKey="SampleApp:widgets.VerticalPropertyGrid" control={VerticalPropertyGridWidgetControl} />,
            ]}
          />
        }

        topMostPanel={
          <StagePanel
            widgets={this._topMostPanel.widgets}
          />
        }
        topPanel={
          <StagePanel
            resizable={false}
            widgets={this._topPanel.widgets}
          />
        }
        leftPanel={
          <StagePanel
            allowedZones={this._leftPanel.allowedZones}
          />
        }
        rightPanel={
          <StagePanel
            allowedZones={this._rightPanel.allowedZones}
            resizable={false}
            size={200}
            widgets={this._rightPanel.widgets}
          />
        }
        bottomPanel={
          <StagePanel
            widgets={this._bottomPanel.widgets}
          />
        }
        bottomMostPanel={
          <StagePanel
            allowedZones={this._bottomMostPanel.allowedZones}
            size={100}
            widgets={this._bottomMostPanel.widgets}
          />
        }
      />
    );
  }
}
/** Define a ToolWidget with Buttons to display in the TopLeft zone.
 */
class FrontstageToolWidget extends React.Component {
  private static _frontstage1Def: FrontstageDef | undefined;
  private static get frontstage1Def(): FrontstageDef {
    if (!this._frontstage1Def) {
      const frontstageProvider = new NestedFrontstage1();
      this._frontstage1Def = frontstageProvider.initializeDef();
    }
    return this._frontstage1Def;
  }

  /** Command that opens a nested Frontstage */
  private get _openNestedFrontstage1() {
    return new CommandItemDef({
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.openNestedFrontstage1",
      execute: async () => {
        await FrontstageManager.openNestedFrontstage(FrontstageToolWidget.frontstage1Def);
      },
    });
  }

  /** Command that opens switches the content layout */
  private get _switchLayout() {
    return new CommandItemDef({
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.switchLayout",
      execute: async () => {
        const activeFrontstageDef = FrontstageManager.activeFrontstageDef;
        if (activeFrontstageDef) {
          const contentLayout = ContentLayoutManager.findLayout("TwoHalvesHorizontal");
          if (contentLayout && activeFrontstageDef.contentGroup) {
            await ContentLayoutManager.setActiveLayout(contentLayout, activeFrontstageDef.contentGroup);
          }
        }
      },
    });
  }

  /** Command to send pause/play toggle to the SampleTimelineComponent */
  private get _pausePlayTimeline() {
    return new CommandItemDef({
      iconSpec: "icon-snow",
      labelKey: "SampleApp:buttons.toggleTimelinePlay",
      execute: async () => {
        const eventArgs: TimelinePausePlayArgs = { uiComponentId: "sampleApp-sampleTimeline", timelineAction: TimelinePausePlayAction.Toggle };
        UiAdmin.sendUiEvent(eventArgs);
      },
    });
  }
  private _horizontalToolbar = (
    <Toolbar
      expandsTo={Direction.Bottom}
      items={
        <>
          <ActionItemButton actionItem={CoreTools.selectElementCommand} />
          <ActionItemButton actionItem={AppTools.item1} />
          <ActionItemButton actionItem={AppTools.item2} />
          <ActionItemButton actionItem={this._openNestedFrontstage1} />
          <ActionItemButton actionItem={this._switchLayout} />
          <ActionItemButton actionItem={this._pausePlayTimeline} />
        </>
      }
    />
  );

  private _verticalToolbar = (
    <Toolbar
      expandsTo={Direction.Right}
      items={
        <>
          <ActionItemButton actionItem={CoreTools.rotateViewCommand} />
          <ToolButton toolId={AppTools.tool1.id} iconSpec={AppTools.tool1.iconSpec} labelKey={AppTools.tool1.label} execute={AppTools.tool1.execute} />
          <ToolButton toolId={AppTools.tool2.id} iconSpec={AppTools.tool2.iconSpec} labelKey={AppTools.tool2.label} execute={AppTools.tool2.execute} />
          <GroupButton
            labelKey="SampleApp:buttons.anotherGroup"
            iconSpec="icon-placeholder"
            items={
              [
                AppTools.tool1, AppTools.tool2, AppTools.item3, AppTools.item4, AppTools.item5,
                AppTools.item6, AppTools.item7, AppTools.item8,
              ]
            }
          />
        </>
      }
    />
  );

  public override render() {
    return (
      <ToolWidget
        appButton={AppTools.backstageToggleCommand}
        horizontalToolbar={this._horizontalToolbar}
        verticalToolbar={this._verticalToolbar}
      />
    );
  }
}

/** Define a NavigationWidget with Buttons to display in the TopRight zone.
 */
class FrontstageNavigationWidget extends React.Component {

  private _horizontalToolbar = (
    <Toolbar
      expandsTo={Direction.Bottom}
      items={
        <>
          <ToolButton toolId={AppTools.item5.id} iconSpec={AppTools.item5.iconSpec} labelKey={AppTools.item5.label} execute={AppTools.item5.execute} />
          <ToolButton toolId={AppTools.item6.id} iconSpec={AppTools.item6.iconSpec} labelKey={AppTools.item6.label} execute={AppTools.item6.execute} />
        </>
      }
    />
  );

  private _verticalToolbar = (
    <Toolbar
      expandsTo={Direction.Right}
      items={
        <>
          <ToolButton toolId={AppTools.item7.id} iconSpec={AppTools.item7.iconSpec} labelKey={AppTools.item7.label} execute={AppTools.item7.execute} />
          <ToolButton toolId={AppTools.item8.id} iconSpec={AppTools.item8.iconSpec} labelKey={AppTools.item8.label} execute={AppTools.item8.execute} />
        </>
      }
    />
  );

  public override render() {
    return (
      <NavigationWidget
        navigationAidId="StandardRotationNavigationAid"
        horizontalToolbar={this._horizontalToolbar}
        verticalToolbar={this._verticalToolbar}
      />
    );
  }
}
