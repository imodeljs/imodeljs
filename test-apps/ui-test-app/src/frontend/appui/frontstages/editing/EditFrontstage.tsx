/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelApp, IModelConnection, ViewState } from "@bentley/imodeljs-frontend";
import { NodeKey } from "@bentley/presentation-common";
import { CommonToolbarItem, ConditionalBooleanValue, IconSpecUtilities, StageUsage, ToolbarItemUtilities, WidgetState } from "@bentley/ui-abstract";
import { SelectionMode } from "@bentley/ui-components";
import {
  AccuDrawDialog, AccuDrawWidgetControl, BasicNavigationWidget, BasicToolWidget, CommandItemDef, ContentGroup, ContentLayoutDef, ContentLayoutProps, ContentProps,
  CoreTools, CustomItemDef, Frontstage, FrontstageProvider, IModelConnectedViewSelector, ModelessDialogManager, ModelsTreeNodeType,
  StagePanel, ToolbarHelper, VisibilityComponentHierarchy, VisibilityWidget, Widget, Zone, ZoneLocation, ZoneState,
} from "@bentley/ui-framework";
import { SampleAppIModelApp, SampleAppUiActionId } from "../../../../frontend/index";
import { EditTools } from "../../../tools/editing/ToolSpecifications";
import { AppUi } from "../../AppUi";
// cSpell:Ignore contentviews statusbars
import { IModelViewportControl } from "../../contentviews/IModelViewport";
import { EditStatusBarWidgetControl } from "../../statusbars/editing/EditStatusBar";
import { ActiveSettingsWidget } from "../../widgets/editing/ActiveSettingsWidget";
import { ModelCreationWidget } from "../../widgets/editing/ModelCreationWidget";
import { VisibilityTreeWidgetControl } from "../../widgets/VisibilityTreeWidget";
import { Orientation } from "@bentley/ui-core";

/* eslint-disable react/jsx-key */

import sketchIconSvg from "../../icons/draw.svg?sprite";

export class EditFrontstage extends FrontstageProvider {
  public static stageId = "EditFrontstage";

  private _additionalTools = new AdditionalTools();

  public static savedViewLayoutProps: string;
  private _leftPanel = {
    widgets: [
      <Widget
        iconSpec="icon-placeholder"
        labelKey="SampleApp:widgets.VisibilityTree"
        control={VisibilityTreeWidgetControl}
      />,
    ],
  };

  private _bottomPanel = {
    widgets: [
      <Widget id={AccuDrawWidgetControl.id} label={AccuDrawWidgetControl.label} control={AccuDrawWidgetControl} />,
    ],
  };

  constructor(public viewStates: ViewState[], public iModelConnection: IModelConnection) {
    super();
  }

  /** Get the CustomItemDef for ViewSelector  */
  private get _viewSelectorItemDef() {
    return new CustomItemDef({
      customId: "sampleApp:viewSelector",
      reactElement: (
        <IModelConnectedViewSelector
          listenForShowUpdates={false}  // Demo for showing only the same type of view in ViewSelector - See IModelViewport.tsx, onActivated
        />
      ),
    });
  }

  private get _additionalNavigationVerticalToolbarItems() {
    return [
      ToolbarHelper.createToolbarItemFromItemDef(200, this._viewSelectorItemDef)];
  }

  public get frontstage() {
    // first find an appropriate layout
    const contentLayoutProps: ContentLayoutProps | undefined = AppUi.findLayoutFromContentCount(this.viewStates.length);
    if (!contentLayoutProps) {
      throw (Error(`Could not find layout ContentLayoutProps when number of viewStates=${this.viewStates.length}`));
    }

    const contentLayoutDef: ContentLayoutDef = new ContentLayoutDef(contentLayoutProps);

    // create the content props that specifies an iModelConnection and a viewState entry in the application data.
    const contentProps: ContentProps[] = [];
    for (const viewState of this.viewStates) {
      const thisContentProps: ContentProps = {
        classId: IModelViewportControl,
        applicationData: { viewState, iModelConnection: this.iModelConnection },
      };
      contentProps.push(thisContentProps);
    }
    const myContentGroup: ContentGroup = new ContentGroup({ contents: contentProps });
    return (
      <Frontstage id="EditFrontstage"
        defaultTool={CoreTools.selectElementCommand}
        defaultLayout={contentLayoutDef} contentGroup={myContentGroup}
        isInFooterMode={true} applicationData={{ key: "value" }}
        usage={StageUsage.Edit}
        contentManipulationTools={
          <Zone
            widgets={
              [
                <Widget isFreeform={true} element={<BasicToolWidget additionalHorizontalItems={this._additionalTools.additionalHorizontalToolbarItems}
                  additionalVerticalItems={this._additionalTools.additionalVerticalToolbarItems} showCategoryAndModelsContextTools={false} />} />,
              ]}
          />
        }
        toolSettings={
          <Zone
            allowsMerging
            widgets={
              [
                <Widget
                  iconSpec="icon-placeholder"
                  isToolSettings={true}
                />,
              ]}
          />
        }
        viewNavigationTools={
          <Zone
            widgets={
              [
                <Widget isFreeform={true} element={
                  <BasicNavigationWidget additionalVerticalItems={this._additionalNavigationVerticalToolbarItems} />
                } />,
              ]}
          />
        }
        centerLeft={
          <Zone
            allowsMerging
            defaultState={ZoneState.Minimized}
            initialWidth={250}
            widgets={
              [
                <Widget defaultState={WidgetState.Closed} iconSpec="icon-active" labelKey="SampleApp:widgets.ActiveSettings" control={ActiveSettingsWidget}
                  syncEventIds={[SampleAppUiActionId.setTestProperty]}
                  stateFunc={(): WidgetState => SampleAppIModelApp.getTestProperty() !== "HIDE" ? WidgetState.Closed : WidgetState.Hidden}
                />,
                <Widget defaultState={WidgetState.Closed} iconSpec="icon-add" labelKey="SampleApp:widgets.ModelCreation" control={ModelCreationWidget}
                  syncEventIds={[SampleAppUiActionId.setTestProperty]}
                  stateFunc={(): WidgetState => SampleAppIModelApp.getTestProperty() !== "HIDE" ? WidgetState.Closed : WidgetState.Hidden}
                />,
              ]}
          />
        }
        centerRight={
          <Zone
            allowsMerging
            defaultState={ZoneState.Minimized}
            initialWidth={350}
            widgets={[
              <Widget id="VisibilityWidget" iconSpec={VisibilityWidget.iconSpec} label={VisibilityWidget.label} control={VisibilityWidget}
                applicationData={{
                  iModelConnection: this.iModelConnection, enableHierarchiesPreloading: [VisibilityComponentHierarchy.Categories], useControlledTree: true,
                  config: { modelsTreeConfig: { selectionMode: SelectionMode.Extended, selectionPredicate: (_key: NodeKey, type: ModelsTreeNodeType) => type === ModelsTreeNodeType.Element } },
                }}
                fillZone={true} />,
            ]}
          />
        }
        statusBar={
          <Zone
            widgets={
              [
                <Widget isStatusBar={true} control={EditStatusBarWidgetControl} />,
              ]}
          />
        }
        bottomRight={
          <Zone defaultState={ZoneState.Minimized} allowsMerging={true} mergeWithZone={ZoneLocation.CenterRight}
            widgets={
              [
              ]}
          />
        }
        bottomPanel={
          <StagePanel
            widgets={this._bottomPanel.widgets}
          />
        }
      />
    );
  }
}

/** Define a ToolWidget with Buttons to display in the TopLeft zone.
 */
class AdditionalTools {
  public sketchGroupItems = ToolbarHelper.constructChildToolbarItems([
    EditTools.placeLineStringTool, EditTools.placeArcTool]);

  public sketchGroupButtonItem = ToolbarItemUtilities.createGroupButton("SampleApp:buttons.sketch", 135, IconSpecUtilities.createSvgIconSpec(sketchIconSvg),
    IModelApp.i18n.translate("SampleApp:buttons.sketch"), this.sketchGroupItems);

  public additionalHorizontalToolbarItems: CommonToolbarItem[] = [...ToolbarHelper.createToolbarItemsFromItemDefs([
    CoreTools.keyinPaletteButtonItemDef, EditTools.deleteElementTool,
    EditTools.moveElementTool, EditTools.rotateElementTool, EditTools.placeBlockTool], 100),
  this.sketchGroupButtonItem];

  private get _accudrawDialogItemVertical() {
    const dialogId = "accudraw-vertical";
    return new CommandItemDef({
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.accuDrawDialogVertical",
      execute: () => {
        ModelessDialogManager.openDialog(
          <AccuDrawDialog
            opened={true}
            dialogId={dialogId}
            orientation={Orientation.Vertical}
            onClose={() => ModelessDialogManager.closeDialog(dialogId)}
          />, dialogId);
      },
    });
  }

  private get _accudrawDialogItemHorizontal() {
    const dialogId = "accudraw-horizontal";
    return new CommandItemDef({
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.accuDrawDialogHorizontal",
      execute: () => {
        ModelessDialogManager.openDialog(
          <AccuDrawDialog
            opened={true}
            dialogId={dialogId}
            orientation={Orientation.Horizontal}
            onClose={() => ModelessDialogManager.closeDialog(dialogId)}
          />, dialogId);
      },
    });
  }

  public getMiscGroupItem = (): CommonToolbarItem => {
    const children = ToolbarHelper.constructChildToolbarItems([
      this._accudrawDialogItemVertical, this._accudrawDialogItemHorizontal,
    ]);

    const groupHiddenCondition = new ConditionalBooleanValue(() => SampleAppIModelApp.getTestProperty() === "HIDE", [SampleAppUiActionId.setTestProperty]);
    const item = ToolbarItemUtilities.createGroupButton("SampleApp:buttons.misc", 130, "icon-tools", IModelApp.i18n.translate("SampleApp:buttons.misc"), children, { isHidden: groupHiddenCondition });
    return item;
  };

  // test ToolbarHelper.createToolbarItemsFromItemDefs
  public additionalVerticalToolbarItems: CommonToolbarItem[] = [this.getMiscGroupItem()];
}
