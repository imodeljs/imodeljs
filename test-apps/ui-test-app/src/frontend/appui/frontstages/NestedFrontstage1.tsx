/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { WidgetState } from "@bentley/ui-abstract";
import {
  ActionItemButton, CommandItemDef, CoreTools, Frontstage, FrontstageDef, FrontstageManager, FrontstageProps, FrontstageProvider, GroupButton, NavigationWidget,
  NestedFrontstage, ToolButton, ToolWidget, Widget, Zone, ZoneLocation, ZoneState,
} from "@bentley/ui-framework";
import { Direction, Toolbar } from "@bentley/ui-ninezone";
import { AppTools } from "../../tools/ToolSpecifications";
import { SmallStatusBarWidgetControl } from "../statusbars/SmallStatusBar";
import { HorizontalPropertyGridWidgetControl, VerticalPropertyGridWidgetControl } from "../widgets/PropertyGridDemoWidget";
import { NestedFrontstage2 } from "./NestedFrontstage2";

/* eslint-disable react/jsx-key */

export class NestedFrontstage1 extends FrontstageProvider {

  public get frontstage(): React.ReactElement<FrontstageProps> {
    return (
      <Frontstage id="NestedFrontstage1"
        defaultTool={CoreTools.rotateViewCommand}
        defaultLayout="TwoHalvesHorizontal"
        contentGroup="TestContentGroup2"
        isInFooterMode={false}
        applicationData={{ key: "value" }}
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
        /** The HorizontalPropertyGrid in zone 9 should be merged across zones 6 & 9 and take up the height of both zones initially.
         *  The zones can be resized manually to take up the full height.
         */
        centerRight={
          <Zone defaultState={ZoneState.Open} allowsMerging={true} mergeWithZone={ZoneLocation.BottomRight}
          />
        }
        statusBar={
          <Zone defaultState={ZoneState.Open}
            widgets={[
              <Widget isStatusBar={true} iconSpec="icon-placeholder" labelKey="SampleApp:widgets.StatusBar" control={SmallStatusBarWidgetControl} />,
            ]}
          />
        }
        bottomRight={
          <Zone defaultState={ZoneState.Open} allowsMerging={true}
            widgets={[
              <Widget defaultState={WidgetState.Closed} iconSpec="icon-placeholder" labelKey="SampleApp:widgets.HorizontalPropertyGrid" control={HorizontalPropertyGridWidgetControl} fillZone={true} />,
              <Widget id="VerticalPropertyGrid" defaultState={WidgetState.Hidden} iconSpec="icon-placeholder" labelKey="SampleApp:widgets.VerticalPropertyGrid" control={VerticalPropertyGridWidgetControl} />,
            ]}
          />
        }
      />
    );
  }
}

/** Define a ToolWidget with Buttons to display in the TopLeft zone.
 */
class FrontstageToolWidget extends React.Component {
  private static _frontstage2Def: FrontstageDef | undefined;
  private static get frontstage2Def(): FrontstageDef {
    if (!this._frontstage2Def) {
      const frontstageProvider = new NestedFrontstage2();
      this._frontstage2Def = frontstageProvider.initializeDef();
    }
    return this._frontstage2Def;
  }

  /** Command that opens a nested Frontstage */
  private get _openNestedFrontstage2() {
    return new CommandItemDef({
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.openNestedFrontstage2",
      execute: async () => {
        await FrontstageManager.openNestedFrontstage(FrontstageToolWidget.frontstage2Def);
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
          <ActionItemButton actionItem={this._openNestedFrontstage2} />
        </>
      }
    />);

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
            items={[AppTools.tool1, AppTools.tool2, AppTools.item3, AppTools.item4, AppTools.item5, AppTools.item6, AppTools.item7, AppTools.item8]}
          />
        </>
      }
    />
  );

  public override render() {
    return (
      <ToolWidget // eslint-disable-line deprecation/deprecation
        appButton={NestedFrontstage.backToPreviousFrontstageCommand}
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
      expandsTo={Direction.Left}
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
      // eslint-disable-next-line deprecation/deprecation
      <NavigationWidget
        navigationAidId="StandardRotationNavigationAid"
        horizontalToolbar={this._horizontalToolbar}
        verticalToolbar={this._verticalToolbar}
      />
    );
  }
}
