/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// cSpell:ignore picklist

import {
  AngleDescription, BeButtonEvent,
  EventHandled, IModelApp,
  LengthDescription, NotifyMessageDetails, OutputMessagePriority,
  PrimitiveTool, QuantityType,
  SurveyLengthDescription, ToolAssistance, ToolAssistanceImage,
} from "@bentley/imodeljs-frontend";
import {
  ColorEditorParams, DialogItem, DialogItemValue, DialogPropertySyncItem,
  InputEditorSizeParams,
  PropertyDescription, PropertyEditorParamTypes, SuppressLabelEditorParams, ToolbarItemUtilities,
} from "@bentley/ui-abstract";

import { Logger } from "@bentley/bentleyjs-core";
import { Point3d } from "@bentley/geometry-core";
import { ColorByName, ColorDef } from "@bentley/imodeljs-common";
import { FormatterSpec } from "@bentley/imodeljs-quantity";
import { CursorInformation, MenuItemProps, UiFramework } from "@bentley/ui-framework";
import sampleToolSvg from "./SampleTool.svg?sprite";

enum ToolOptions {
  Red,
  White,
  Blue,
  Yellow,
  Green,
  Pink,
}

export class SampleTool extends PrimitiveTool {
  // ensure toolId is unique by adding "uiTestExtension-" prefix
  public static override toolId = "uiTestExtension-SampleTool";
  public static override iconSpec = `svg:${sampleToolSvg}`;
  public readonly points: Point3d[] = [];
  private _showCoordinatesOnPointerMove = false;
  private _stationFormatterSpec?: FormatterSpec;
  private _lengthDescription = new LengthDescription();
  private _surveyLengthDescription = new SurveyLengthDescription(SampleTool._surveyLengthName, "Survey");

  private toggleCoordinateUpdate() {
    this._showCoordinatesOnPointerMove = !this._showCoordinatesOnPointerMove;
  }

  public static getPrompt(name: string): string {
    const key = `tools.${this.toolId}.Prompts.${name}`;
    return this.i18n.translateWithNamespace(this.namespace.name, key);
  }

  public static getOptionString(name: string): string {
    const key = `tools.${this.toolId}.Options.${name}`;
    return this.i18n.translateWithNamespace(this.namespace.name, key);
  }

  // Tool Setting Properties
  // ------------- Enum based picklist ---------------
  // Example of async method used to populate enum values
  private _getChoices = async () => {
    return [
      { label: SampleTool.getOptionString("Red"), value: ToolOptions.Red },
      { label: SampleTool.getOptionString("White"), value: ToolOptions.White },
      { label: SampleTool.getOptionString("Blue"), value: ToolOptions.Blue },
      { label: SampleTool.getOptionString("Yellow"), value: ToolOptions.Yellow },
      { label: SampleTool.getOptionString("Green"), value: ToolOptions.Green },
      { label: SampleTool.getOptionString("Pink"), value: ToolOptions.Pink },
    ];
  };

  private static _optionsName = "enumAsPicklist";
  private _getEnumAsPicklistDescription = (): PropertyDescription => {
    return {
      name: SampleTool._optionsName,
      displayLabel: SampleTool.getPrompt("Options"),
      typename: "enum",
      enum: {
        choices: this._getChoices(),
      },
    };
  };

  private _optionsValue: DialogItemValue = { value: ToolOptions.Blue };

  public get option(): ToolOptions {
    return this._optionsValue.value as ToolOptions;
  }

  public set option(option: ToolOptions) {
    this._optionsValue.value = option;
  }

  // ------------- Color ---------------
  private static _colorName = "color";
  private static _getColorDescription = (): PropertyDescription => {
    return {
      name: SampleTool._colorName,
      displayLabel: SampleTool.getPrompt("Color"),
      typename: "number",
      editor: {
        name: "color-picker",
        params: [{
          type: PropertyEditorParamTypes.ColorData,
          colorValues: [
            ColorByName.blue as number,
            ColorByName.red as number,
            ColorByName.green as number,
            ColorByName.yellow as number,
            ColorByName.black as number,
            ColorByName.gray as number,
            ColorByName.purple as number,
            ColorByName.pink as number,
          ],
          numColumns: 2,
        } as ColorEditorParams,
        ],
      },
    };
  };

  private _colorValue: DialogItemValue = { value: ColorByName.blue as number };

  public get colorValue(): number {
    return this._optionsValue.value as number;
  }

  public set colorValue(colorVal: number) {
    this._optionsValue.value = colorVal;
  }

  public get colorDef(): ColorDef {
    return ColorDef.create(this._optionsValue.value as number);
  }

  public set colorDef(colorVal: ColorDef) {
    this._optionsValue.value = colorVal.tbgr;
  }

  // ------------- Weight ---------------
  private static _weightName = "weight";
  private static _getWeightDescription = (): PropertyDescription => {
    return {
      name: SampleTool._weightName,
      displayLabel: SampleTool.getPrompt("Weight"),
      typename: "number",
      editor: {
        name: "weight-picker",
      },
    };
  };

  private _weightValue: DialogItemValue = { value: 3 };

  public get weight(): number {
    return this._weightValue.value as number;
  }

  public set weight(weightVal: number) {
    this._weightValue.value = weightVal;
  }

  // ------------- boolean based toggle button ---------------
  private static _lockToggleName = "lockToggle";
  private static _getLockToggleDescription = (): PropertyDescription => {
    return {
      name: SampleTool._lockToggleName,
      displayLabel: SampleTool.getPrompt("Lock"),
      typename: "boolean",
      editor: { name: "toggle" },
    };
  };

  private _lockValue: DialogItemValue = { value: true };

  public get lock(): boolean {
    return this._lockValue.value as boolean;
  }

  public set lock(option: boolean) {
    this._lockValue.value = option;
  }

  // ------------- text based edit field ---------------
  private static _cityName = "city";
  private static _getCityDescription = (): PropertyDescription => {
    return {
      name: SampleTool._cityName,
      displayLabel: SampleTool.getPrompt("City"),
      typename: "string",
    };
  };

  private _cityValue: DialogItemValue = { value: "Exton" };

  public get city(): string {
    return this._cityValue.value as string;
  }

  public set city(option: string) {
    this._cityValue.value = option;
  }

  // ------------- text based edit field ---------------
  private static _stateName = "state";
  private static _getStateDescription = (): PropertyDescription => {
    return {
      name: SampleTool._stateName,
      displayLabel: SampleTool.getPrompt("State"),
      typename: "string",
      editor: {
        params: [{
          type: PropertyEditorParamTypes.InputEditorSize,
          size: 4,
          /* maxLength: 60,*/
        } as InputEditorSizeParams,
        ],
      },
    };
  };

  private _stateValue: DialogItemValue = { value: "PA" };

  public get state(): string {
    return this._stateValue.value as string;
  }

  public set state(option: string) {
    this._stateValue.value = option;
  }

  // ------------- text based edit field ---------------
  private static _coordinateName = "coordinate";
  private static _getCoordinateDescription = (): PropertyDescription => {
    return {
      name: SampleTool._coordinateName,
      displayLabel: SampleTool.getPrompt("Coordinate"),
      typename: "string",
    };
  };

  private _coordinateValue: DialogItemValue = { value: "0.0, 0.0, 0.0" };

  public get coordinate(): string {
    return this._coordinateValue.value as string;
  }

  public set coordinate(option: string) {
    this._coordinateValue.value = option;
  }

  // ------------- display station value as text  ---------------
  public get stationFormatterSpec(): FormatterSpec | undefined {
    if (this._stationFormatterSpec)
      return this._stationFormatterSpec;

    const formatterSpec = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(QuantityType.Stationing);
    if (formatterSpec) {
      this._stationFormatterSpec = formatterSpec;
      return formatterSpec;
    }

    Logger.logError("UITestApp.SampleTool", "Station formatterSpec was expected to be set before tool started.");
    return undefined;
  }

  private static _stationName = "station";
  private static _getStationDescription = (): PropertyDescription => {
    return {
      name: SampleTool._stationName,
      displayLabel: SampleTool.getPrompt("Station"),
      typename: "string",
    };
  };

  private formatStation(numberValue: number): string {
    if (this.stationFormatterSpec) {
      return IModelApp.quantityFormatter.formatQuantity(numberValue, this.stationFormatterSpec);
    }
    return numberValue.toFixed(2);
  }

  private _stationValue: DialogItemValue = { value: this.formatStation(0.0) };

  public get station(): string {
    return this._stationValue.value as string;
  }

  public set station(option: string) {
    this._stationValue.value = option;
  }

  // ------------- use length toggle  ---------------
  private static _useLengthName = "useLength";
  private static _getUseLengthDescription = (): PropertyDescription => {
    return {
      name: SampleTool._useLengthName,
      displayLabel: "",
      typename: "boolean",
      editor: {
        params: [{
          type: PropertyEditorParamTypes.SuppressEditorLabel,
          suppressLabelPlaceholder: true,
        } as SuppressLabelEditorParams,
        ],
      },
    };
  };

  private _useLengthValue: DialogItemValue = { value: true };

  public get useLength(): boolean {
    return this._useLengthValue.value as boolean;
  }

  public set useLength(option: boolean) {
    this._useLengthValue.value = option;
  }

  // ------------- Length ---------------
  private static _lengthName = "length";

  // if _lengthValue also sets up display value then the "number-custom" type editor would not need to format the value before initially displaying it.
  private _lengthValue: DialogItemValue = { value: 1.5 };  // value in meters

  public get length(): number {
    return this._lengthValue.value as number;
  }

  public set length(option: number) {
    this._lengthValue.value = option;
  }

  // ------------- Survey Length ---------------
  private static _surveyLengthName = "surveyLength";

  // if _surveyLengthValue also sets up display value then the "number-custom" type editor would not need to format the value before initially displaying it.
  private _surveyLengthValue: DialogItemValue = { value: 51.25 };  // value in meters

  public get surveyLength(): number {
    return this._surveyLengthValue.value as number;
  }

  public set surveyLength(option: number) {
    this._surveyLengthValue.value = option;
  }

  // ------------- Angle ---------------

  // if _angleValue also sets up display value then the "number-custom" type editor would not need to format the value before initially displaying it.
  private _angleValue: DialogItemValue = { value: 0.0 };

  public get angle(): number {
    return this._angleValue.value as number;
  }

  public set angle(option: number) {
    this._angleValue.value = option;
  }

  // -------- end of ToolSettings ----------

  public override requireWriteableTarget(): boolean { return false; }
  public override onPostInstall() { super.onPostInstall(); this.setupAndPromptForNextAction(); }
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

  /** A tool is responsible for providing tool assistance appropriate to the current tool state following significant events.
   * After onPostInstall to establish instructions for the initial tool state.
   * After onUnsuspend to reestablish instructions when no longer suspended by a ViewTool or InputCollector.
   * After onDataButtonDown (or other tool event) advances or backs up the current tool state.
   * After onUndoPreviousStep or onRedoPreviousStep modifies the current tool state.
   */
  protected provideToolAssistance(): void {
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, SampleTool.getPrompt("GetPoint"));
    const instructions = ToolAssistance.createInstructions(mainInstruction);

    IModelApp.notifications.setToolAssistance(instructions);
  }

  private showInfoFromCursorMenu(label: string) {
    const msg = `Context Menu selection - ${label}`;
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    // Used to test Cursor Menu
    if (ev.isAltKey) {
      const menuItems: MenuItemProps[] = [];
      menuItems.push({ id: "entry1", item: { label: "Label1", icon: "icon-placeholder", execute: () => { this.showInfoFromCursorMenu("hello from entry1"); } } });
      menuItems.push({ id: "entry2", item: { label: "Label2", execute: () => { this.showInfoFromCursorMenu("hello from entry2"); } } });
      menuItems.push({ id: "entry3", item: { label: "Label3", icon: "icon-placeholder", execute: () => { this.showInfoFromCursorMenu("hello from entry3"); } } });

      UiFramework.openCursorMenu({ items: menuItems, position: { x: CursorInformation.cursorX, y: CursorInformation.cursorY } });
      return EventHandled.No;
    }

    if (this.points.length < 2)
      this.points.push(ev.point.clone());
    else
      this.points[1] = ev.point.clone();
    this.toggleCoordinateUpdate();
    this.setupAndPromptForNextAction();

    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    /* Common reset behavior for primitive tools is calling onReinitialize to restart or exitTool to terminate. */
    this.onReinitialize();
    return EventHandled.No;
  }

  private syncCoordinateValue(coordinate: string, station: string, distance: number): void {
    const coordinateValue: DialogItemValue = { value: coordinate };
    // clone coordinateValue if storing value within tool - in this case we are not
    const syncItem: DialogPropertySyncItem = { value: coordinateValue, propertyName: SampleTool._coordinateName, isDisabled: true };
    const stationValue: DialogItemValue = { value: station };
    const stationSyncItem: DialogPropertySyncItem = { value: stationValue, propertyName: SampleTool._stationName, isDisabled: true };

    const surveyLengthValue: DialogItemValue = { value: distance, displayValue: this._surveyLengthDescription.format(distance) };
    const surveySyncItem: DialogPropertySyncItem = { value: surveyLengthValue, propertyName: SampleTool._surveyLengthName, isDisabled: true };
    this.syncToolSettingsProperties([syncItem, stationSyncItem, surveySyncItem]);
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    if (!this._showCoordinatesOnPointerMove)
      return;

    const point = ev.point.clone();
    const formattedString: string = `${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)}`;
    let distance = 0;
    if (this.points.length > 0)
      distance = point.distance(this.points[0]);

    this.syncCoordinateValue(formattedString, this.formatStation(distance), distance);
  }

  public onRestartTool(): void {
    const tool = new SampleTool();
    if (!tool.run())
      this.exitTool();
  }

  /** Used to supply DefaultToolSettingProvider with a list of properties to use to generate ToolSettings.  If undefined then no ToolSettings will be displayed */
  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    const readonly = true;
    const toolSettings = new Array<DialogItem>();
    toolSettings.push({ value: this._optionsValue, property: this._getEnumAsPicklistDescription(), editorPosition: { rowPriority: 0, columnIndex: 2 } });
    toolSettings.push({ value: this._colorValue, property: SampleTool._getColorDescription(), editorPosition: { rowPriority: 2, columnIndex: 2 } });
    toolSettings.push({ value: this._weightValue, property: SampleTool._getWeightDescription(), editorPosition: { rowPriority: 3, columnIndex: 2 } });
    toolSettings.push({ value: this._lockValue, property: SampleTool._getLockToggleDescription(), editorPosition: { rowPriority: 5, columnIndex: 2 } });
    toolSettings.push({ value: this._cityValue, property: SampleTool._getCityDescription(), editorPosition: { rowPriority: 10, columnIndex: 2 } });
    toolSettings.push({ value: this._stateValue, property: SampleTool._getStateDescription(), editorPosition: { rowPriority: 10, columnIndex: 4 } });
    toolSettings.push({ value: this._coordinateValue, property: SampleTool._getCoordinateDescription(), editorPosition: { rowPriority: 15, columnIndex: 2 }, isDisabled: readonly });
    toolSettings.push({ value: this._stationValue, property: SampleTool._getStationDescription(), editorPosition: { rowPriority: 16, columnIndex: 2 }, isDisabled: readonly });
    const lengthLock = { value: this._useLengthValue, property: SampleTool._getUseLengthDescription(), editorPosition: { rowPriority: 20, columnIndex: 0 } };
    toolSettings.push({ value: this._lengthValue, property: this._lengthDescription, editorPosition: { rowPriority: 20, columnIndex: 2 }, isDisabled: false, lockProperty: lengthLock });
    toolSettings.push({ value: this._surveyLengthValue, property: this._surveyLengthDescription, editorPosition: { rowPriority: 21, columnIndex: 2 }, isDisabled: readonly });
    toolSettings.push({ value: this._angleValue, property: new AngleDescription(), editorPosition: { rowPriority: 25, columnIndex: 2 } });
    return toolSettings;
  }

  private showColorInfoFromUi(updatedValue: DialogPropertySyncItem) {
    const msg = `Property '${updatedValue.propertyName}' updated to value ${this.colorDef.toRgbString()}`;
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
  }

  private showInfoFromUi(updatedValue: DialogPropertySyncItem) {
    const msg = `Property '${updatedValue.propertyName}' updated to value ${updatedValue.value.value}`;
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
  }

  private syncLengthState(): void {
    const lengthValue: DialogItemValue = { value: this.length, displayValue: this._lengthDescription.format(this.length) };
    const syncItem: DialogPropertySyncItem = { value: lengthValue, propertyName: SampleTool._lengthName, isDisabled: !this.useLength };
    this.syncToolSettingsProperties([syncItem]);
  }

  /** Used to send changes from UI back to Tool */
  public override applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): boolean {
    if (updatedValue.propertyName === SampleTool._optionsName) {
      if (this._optionsValue.value !== updatedValue.value.value) {
        this.option = updatedValue.value.value as ToolOptions;
        this.showInfoFromUi(updatedValue);
      }
    } else if (updatedValue.propertyName === SampleTool._lockToggleName) {
      this.lock = updatedValue.value.value as boolean;
      this.showInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === SampleTool._cityName) {
      this.city = updatedValue.value.value as string;
      this.showInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === SampleTool._stateName) {
      this.state = updatedValue.value.value as string;
      this.showInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === SampleTool._useLengthName) {
      this.useLength = updatedValue.value.value as boolean;
      this.showInfoFromUi(updatedValue);
      this.syncLengthState();
    } else if (updatedValue.propertyName === SampleTool._lengthName) {
      this.length = updatedValue.value.value as number;
      this.showInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === SampleTool._surveyLengthName) {
      this.surveyLength = updatedValue.value.value as number;
      this.showInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === SampleTool._colorName) {
      this.colorValue = updatedValue.value.value as number;
      this.showColorInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === SampleTool._weightName) {
      this.weight = updatedValue.value.value as number;
      this.showInfoFromUi(updatedValue);
    }

    // return true is change is valid
    return true;
  }

  public static getActionButtonDef(itemPriority: number, groupPriority?: number) {
    const overrides = undefined !== groupPriority ? { groupPriority } : {};
    return ToolbarItemUtilities.createActionButton(SampleTool.toolId, itemPriority, SampleTool.iconSpec, SampleTool.flyover,
      () => { IModelApp.tools.run(SampleTool.toolId); },
      overrides);
  }
}
