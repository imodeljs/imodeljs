/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module ToolSettings
 */

import * as React from "react";
import { IModelApp } from "@bentley/imodeljs-frontend";
// cSpell:Ignore configurableui Fronstage
import { DialogItem, DialogPropertySyncItem, UiLayoutDataProvider } from "@bentley/ui-abstract";
import { ConfigurableCreateInfo } from "../../configurableui/ConfigurableUiControl";
import { ConfigurableUiManager } from "../../configurableui/ConfigurableUiManager";
import { ComponentGenerator } from "../../uiprovider/ComponentGenerator";
import { DefaultDialogGridContainer } from "../../uiprovider/DefaultDialogGridContainer";
import { SyncToolSettingsPropertiesEventArgs, ToolSettingsManager } from "./ToolSettingsManager";
import { ToolUiProvider } from "./ToolUiProvider";
import { FrontstageManager } from "../../frontstage/FrontstageManager";

/** @internal */

/** ToolSettingsUiDataProvider keeps tool data in sync with UI display */
class ToolSettingsUiDataProvider extends UiLayoutDataProvider {
  public override supplyDialogItems(): DialogItem[] | undefined {
    return ToolSettingsManager.toolSettingsProperties;
  }

  // send property changes from UI back to tool
  public override applyUiPropertyChange = (syncItem: DialogPropertySyncItem) => {
    // istanbul ignore next
    IModelApp.toolAdmin.activeTool && IModelApp.toolAdmin.activeTool.applyToolSettingPropertyChange(syncItem);
  };
}

/** ToolUiProvider class that informs ConfigurableUi that Tool Settings are provided for the specified tool.
 * @internal
 */
export class DefaultToolSettingsProvider extends ToolUiProvider {
  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);
    this._dataProvider = new ToolSettingsUiDataProvider();
  }

  public get uiDataProvider() { return this._dataProvider as ToolSettingsUiDataProvider; }

  public updateToolSettingsNodes(): void {
    // istanbul ignore else
    if (this.uiDataProvider.layoutDialogRows()) {
      const componentGenerator = new ComponentGenerator(this.uiDataProvider);

      this.toolSettingsNode = (
        <DefaultDialogGridContainer componentGenerator={componentGenerator} isToolSettings={true} />
      );
      this.horizontalToolSettingNodes = componentGenerator.getToolSettingsEntries();
    } else {
      this.toolSettingsNode = null;
      this.horizontalToolSettingNodes = [];
    }
    // We emit the FrontstageManager.onToolSettingsReloadEvent event here because the Fronstage Manager is a static
    // class that UI components can easily register listeners.
    FrontstageManager.onToolSettingsReloadEvent.emit();
  }

  public override reloadPropertiesFromTool(): void {
    // trigger the items to be reloaded from the active tool
    this.uiDataProvider.reloadDialogItems(false);
    this.updateToolSettingsNodes();
  }

  // called when tool is activated to repopulate tool settings.
  public override onInitialize(): void {
    this.reloadPropertiesFromTool();
  }

  // called to process ToolSettingsManager.onSyncToolSettingsProperties event
  public override syncToolSettingsProperties(args: SyncToolSettingsPropertiesEventArgs): void {
    this.uiDataProvider.fireSyncPropertiesEvent(args.syncProperties);
  }
}

ConfigurableUiManager.registerControl("DefaultToolSettings", DefaultToolSettingsProvider);
