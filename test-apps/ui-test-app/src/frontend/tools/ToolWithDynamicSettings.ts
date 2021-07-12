/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// cSpell:ignore picklist

import { Point3d } from "@bentley/geometry-core";
import {
  BeButtonEvent, EventHandled, IModelApp, PrimitiveTool,
  ToolAssistance, ToolAssistanceImage,
} from "@bentley/imodeljs-frontend";
import {
  DialogItem, DialogItemValue, DialogPropertySyncItem,
  EnumerationChoice,
  PropertyDescription,
} from "@bentley/ui-abstract";
import { ToolItemDef } from "@bentley/ui-framework";

interface MajorCities {
  state: number;
  cities: string[];
}

enum StateOptions {
  None = 0,
  Alabama = 1,
  California = 2,
  Pennsylvania = 3,
  NewYork = 4,
}

const cities: MajorCities[] = [
  { state: 0, cities: [] },
  { state: 1, cities: ["Birmingham", "Montgomery", "Huntsville", "Mobile"] },
  { state: 2, cities: ["Los Angeles", "San Diego", "San Jose", "San Francisco"] },
  { state: 3, cities: ["Philadelphia", "Pittsburgh", "Allentown", "Erie"] },
  { state: 4, cities: ["New York", "Buffalo", "Rochester", "Yonkers"] },
];

export class ToolWithDynamicSettings extends PrimitiveTool {
  public static override toolId = "ToolWithDynamicSettings";
  public points: Point3d[] = [];

  // ------------- State List ---------------
  private static _statePropertyName = "state";
  private static enumAsPicklistMessage(str: string) { return IModelApp.i18n.translate(`SampleApp:tools.ToolWithDynamicSettings.State.${str}`); }
  private static getStateDescription(): PropertyDescription {
    return {
      name: this._statePropertyName,
      displayLabel: IModelApp.i18n.translate("SampleApp:tools.ToolWithDynamicSettings.Prompts.State"),
      typename: "enum",
      enum: {
        choices: [
          { label: this.enumAsPicklistMessage("None"), value: StateOptions.None },
          { label: this.enumAsPicklistMessage("Alabama"), value: StateOptions.Alabama },
          { label: this.enumAsPicklistMessage("California"), value: StateOptions.California },
          { label: this.enumAsPicklistMessage("Pennsylvania"), value: StateOptions.Pennsylvania },
          { label: this.enumAsPicklistMessage("NewYork"), value: StateOptions.NewYork },
        ],
      },
    };
  }

  private _stateValue: DialogItemValue = { value: StateOptions.None };
  public get state(): StateOptions {
    return this._stateValue.value as StateOptions;
  }

  public set state(option: StateOptions) {
    this._stateValue.value = option;
  }

  // ------------- City List ---------------
  private static _cityPropertyName = "city";
  private static getCityDescription(stateId: number): PropertyDescription {
    const availableCitiesChoices: EnumerationChoice[] = cities[stateId].cities.map((cityName) => { return { label: cityName, value: cityName }; });

    return {
      name: this._cityPropertyName,
      displayLabel: IModelApp.i18n.translate("SampleApp:tools.ToolWithDynamicSettings.Prompts.City"),
      typename: "enum",
      enum: {
        choices: availableCitiesChoices,
      },
    };
  }

  private _cityValue: DialogItemValue = { value: "" };
  public get city(): string {
    return this._cityValue.value as string;
  }

  public set city(option: string) {
    this._cityValue.value = option;
  }

  // -------- end of ToolSettings ----------

  public override requireWriteableTarget(): boolean { return false; }
  public override onPostInstall() {
    super.onPostInstall();
    this.setupAndPromptForNextAction();
    this.points = [];
  }
  public override onUnsuspend(): void { this.provideToolAssistance(); }

  /** Establish current tool state and initialize drawing aides following onPostInstall, onDataButtonDown, onUndoPreviousStep, or other events that advance or back up the current tool state.
   * Enable snapping or auto-locate for AccuSnap.
   * Setup AccuDraw using AccuDrawHintBuilder.
   * Set view cursor when default cursor isn't applicable.
   * Provide tool assistance.
   */
  protected setupAndPromptForNextAction(): void {
    this.provideToolAssistance();
  }

  private _handleToolSettingsPopupCancel = () => {
    IModelApp.uiAdmin.closeToolSettingsPopup();
  };

  /** A tool is responsible for providing tool assistance appropriate to the current tool state following significant events.
   * After onPostInstall to establish instructions for the initial tool state.
   * After onUnsuspend to reestablish instructions when no longer suspended by a ViewTool or InputCollector.
   * After onDataButtonDown (or other tool event) advances or backs up the current tool state.
   * After onUndoPreviousStep or onRedoPreviousStep modifies the current tool state.
   */
  protected provideToolAssistance(): void {
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, IModelApp.i18n.translate("SampleApp:tools.ToolWithDynamicSettings.Prompts.GetPoint"));
    const instructions = ToolAssistance.createInstructions(mainInstruction);

    IModelApp.notifications.setToolAssistance(instructions);
  }

  public override async onDataButtonDown(_ev: BeButtonEvent): Promise<EventHandled> {
    this.setupAndPromptForNextAction();
    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    /* Common reset behavior for primitive tools is calling onReinitialize to restart or exitTool to terminate. */
    this.onReinitialize();
    return EventHandled.No;
  }

  public onRestartTool(): void {
    const tool = new ToolWithDynamicSettings();
    if (!tool.run())
      this.exitTool();
  }

  /** Used to supply DefaultToolSettingProvider with a list of properties to use to generate ToolSettings.  If undefined then no ToolSettings will be displayed */
  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    const toolSettings = new Array<DialogItem>();
    toolSettings.push({ value: this._stateValue, property: ToolWithDynamicSettings.getStateDescription(), editorPosition: { rowPriority: 1, columnIndex: 1 } });
    if (this.state > 0 && this.state < cities.length) {
      this.city = cities[this.state].cities[0];
      toolSettings.push({ value: this._cityValue, property: ToolWithDynamicSettings.getCityDescription(this.state), editorPosition: { rowPriority: 2, columnIndex: 1 } });
    }
    return toolSettings;
  }

  /** Called from UI to update properties in tool */
  public override applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): boolean {
    if (updatedValue.propertyName === ToolWithDynamicSettings._statePropertyName) {
      const newStateValue = updatedValue.value.value as number;
      if (this.state !== newStateValue) {
        this.state = newStateValue;
        // update the UI to show/remove city option any time state value changes.
        this.reloadToolSettingsProperties();
      }
    }

    // return true is change is valid
    return true;
  }

  public static get toolItemDef() {
    return new ToolItemDef({
      toolId: ToolWithDynamicSettings.toolId,
      iconSpec: "icon-smiley-happy-2",
      labelKey: "SampleApp:tools.ToolWithDynamicSettings.flyover",
      tooltipKey: "SampleApp:tools.ToolWithDynamicSettings.description",
      execute: async () => {
        IModelApp.tools.run(ToolWithDynamicSettings.toolId);
      },
    });
  }

}
