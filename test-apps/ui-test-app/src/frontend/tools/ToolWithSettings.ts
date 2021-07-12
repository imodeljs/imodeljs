/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// cSpell:ignore picklist

import { Logger } from "@bentley/bentleyjs-core";
import { Point3d } from "@bentley/geometry-core";
import { ColorByName, ColorDef } from "@bentley/imodeljs-common";
import {
  AngleDescription, BeButtonEvent, EventHandled, IModelApp, LengthDescription, NotifyMessageDetails, OutputMessagePriority, PrimitiveTool,
  QuantityType, SurveyLengthDescription, ToolAssistance, ToolAssistanceImage,
} from "@bentley/imodeljs-frontend";
import { FormatterSpec } from "@bentley/imodeljs-quantity";
import {
  DialogItem, DialogLayoutDataProvider, DialogProperty, DialogPropertyItem, DialogPropertySyncItem,
  EnumerationChoice, InputEditorSizeParams, PropertyChangeResult, PropertyChangeStatus,
  PropertyDescriptionHelper, PropertyEditorParamTypes, RangeEditorParams, RelativePosition, SuppressLabelEditorParams, SyncPropertiesChangeEvent,
} from "@bentley/ui-abstract";
import { CursorInformation, MenuItemProps, UiFramework } from "@bentley/ui-framework";

enum ToolOptions {
  Red = 1,
  White = 2,
  Blue = 3,
  Yellow = 4,
  Purple = 5,
  Pink = 6,
  Green = 7,
}

enum ToolOptionNames {
  Red = "Red",
  White = "White",
  Blue = "Blue",
  Yellow = "Yellow",
  Purple = "Purple",
  Pink = "Pink",
  Green = "Green",
}

class PointOnePopupSettingsProvider extends DialogLayoutDataProvider {
  // ------------- Weight ---------------
  public weightProperty = new DialogProperty<number>(PropertyDescriptionHelper.buildWeightPickerDescription("weight", IModelApp.i18n.translate("SampleApp:tools.ToolWithSettings.Prompts.Weight")), 3);

  /** Called by UI to inform data provider of changes.  */
  public override applyUiPropertyChange = (updatedValue: DialogPropertySyncItem): void => {
    if (updatedValue.propertyName === this.weightProperty.name) {
      this.weightProperty.value = updatedValue.value.value! as number;
      const msg = `Set Weight = ${this.weightProperty.value}`;
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
    }
  };

  /** Called by UI to request available properties when UI is manually created. */
  public override supplyDialogItems(): DialogItem[] | undefined {
    return [
      this.weightProperty.toDialogItem({ rowPriority: 1, columnIndex: 1 }),
    ];
  }

  /** Get Sync UI Control Properties Event */
  public override onSyncPropertiesChangeEvent = new SyncPropertiesChangeEvent();

  /** Called by UI to validate a property value */
  public override validateProperty(_item: DialogPropertyItem): PropertyChangeResult {
    return { status: PropertyChangeStatus.Success };
  }

  /** Called to sync properties synchronously if a UiDataProvider is active for the UI */
  public override syncProperties(_syncProperties: DialogPropertySyncItem[]) {
    return;
  }
}

class PointTwoPopupSettingsProvider extends DialogLayoutDataProvider {
  // ------------- text based edit field ---------------
  public sourceProperty = new DialogProperty<string>(
    PropertyDescriptionHelper.buildTextEditorDescription("source", IModelApp.i18n.translate("SampleApp:tools.ToolWithSettings.Prompts.Source")),
    "unknown", undefined);

  /** Called by UI to inform data provider of changes.  */
  public override applyUiPropertyChange = (prop: DialogPropertySyncItem): void => {
    if (prop.propertyName === this.sourceProperty.name) {
      this.sourceProperty.value = prop.value.value ? prop.value.value as string : "";
      const msg = `Set Source = ${this.sourceProperty.value}`;
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
    }
  };

  /** Called by UI to request available properties when UI is manually created. */
  public override supplyDialogItems(): DialogItem[] | undefined {
    return [
      this.sourceProperty.toDialogItem({ rowPriority: 1, columnIndex: 1 }),
    ];
  }

  /** Get Sync UI Control Properties Event */
  public override onSyncPropertiesChangeEvent = new SyncPropertiesChangeEvent();

  /** Called by UI to validate a property value */
  public override validateProperty(_item: DialogPropertyItem): PropertyChangeResult {
    return { status: PropertyChangeStatus.Success };
  }

  /** Called to sync properties synchronously if a UiDataProvider is active for the UI */
  public override syncProperties(_syncProperties: DialogPropertySyncItem[]) {
    return;
  }
}

export class ToolWithSettings extends PrimitiveTool {
  private _pointOnePopupSettingsProvider = new PointOnePopupSettingsProvider();
  private _pointTwoPopupSettingsProvider = new PointTwoPopupSettingsProvider();
  public static override toolId = "ToolWithSettings";
  public points: Point3d[] = [];
  private _showCoordinatesOnPointerMove = false;

  private toggleCoordinateUpdate() {
    this._showCoordinatesOnPointerMove = !this._showCoordinatesOnPointerMove;
  }

  // ------------- use length toggle  ---------------
  private _useLengthProperty: DialogProperty<boolean> | undefined;
  public get useLengthProperty() {
    if (!this._useLengthProperty)
      this._useLengthProperty = new DialogProperty<boolean>(PropertyDescriptionHelper.buildLockPropertyDescription("useLength"), false);
    return this._useLengthProperty;
  }

  // ------------- Length (persisted in meters) ---------------
  private _lengthProperty: DialogProperty<number> | undefined;
  public get lengthProperty() {
    if (!this._lengthProperty)
      this._lengthProperty = new DialogProperty<number>(new LengthDescription("length"), 1.5, undefined, !this.useLengthProperty.value);
    return this._lengthProperty;
  }

  // ------------- Color Enum ---------------
  private enumAsPicklistMessage(str: string) { return IModelApp.i18n.translate(`SampleApp:tools.ToolWithSettings.Options.${str}`); }
  private getColorChoices = (): EnumerationChoice[] => {
    return this.useLengthProperty.isDisabled ? [
      { label: this.enumAsPicklistMessage(ToolOptionNames.Red), value: ToolOptions.Red },
      { label: this.enumAsPicklistMessage(ToolOptionNames.White), value: ToolOptions.White },
      { label: this.enumAsPicklistMessage(ToolOptionNames.Blue), value: ToolOptions.Blue },
      { label: this.enumAsPicklistMessage(ToolOptionNames.Yellow), value: ToolOptions.Yellow },
      { label: this.enumAsPicklistMessage(ToolOptionNames.Purple), value: ToolOptions.Purple },
      { label: this.enumAsPicklistMessage(ToolOptionNames.Pink), value: ToolOptions.Pink },
      { label: this.enumAsPicklistMessage(ToolOptionNames.Green), value: ToolOptions.Green },
    ] :
      [
        { label: this.enumAsPicklistMessage(ToolOptionNames.Red), value: ToolOptions.Red },
        { label: this.enumAsPicklistMessage(ToolOptionNames.White), value: ToolOptions.White },
        { label: this.enumAsPicklistMessage(ToolOptionNames.Blue), value: ToolOptions.Blue },
        { label: this.enumAsPicklistMessage(ToolOptionNames.Yellow), value: ToolOptions.Yellow },
      ];
  };

  private _colorOptionProperty: DialogProperty<number> | undefined;
  public get colorOptionProperty() {
    if (!this._colorOptionProperty)
      this._colorOptionProperty = new DialogProperty<number>(PropertyDescriptionHelper.buildEnumPicklistEditorDescription(
        "colorOption", IModelApp.i18n.translate("SampleApp:tools.ToolWithSettings.Prompts.Color"), this.getColorChoices()), ToolOptions.Blue as number);
    return this._colorOptionProperty;
  }

  // ------------- Color Picker --------------
  private _colorPickerProperty: DialogProperty<number> | undefined;
  public get colorPickerProperty() {
    if (!this._colorPickerProperty)
      this._colorPickerProperty = new DialogProperty<number>(PropertyDescriptionHelper.buildColorPickerDescription("color", IModelApp.i18n.translate("SampleApp:tools.ToolWithSettings.Prompts.Color"),
        [ColorByName.blue, ColorByName.red, ColorByName.green, ColorByName.yellow, ColorByName.black, ColorByName.gray, ColorByName.purple, ColorByName.pink],
        2), ColorByName.blue);
    return this._colorPickerProperty;
  }

  // ------------- boolean based toggle button ---------------
  private _lockProperty: DialogProperty<boolean> | undefined;
  public get lockProperty() {
    if (!this._lockProperty)
      this._lockProperty = new DialogProperty<boolean>(PropertyDescriptionHelper.buildToggleDescription("lockToggle",
        IModelApp.i18n.translate("SampleApp:tools.ToolWithSettings.Prompts.Lock")), true, undefined, false);
    return this._lockProperty;
  }

  // ------------- boolean based toggle button ---------------
  private _imageCheckBoxProperty: DialogProperty<boolean> | undefined;
  public get imageCheckBoxProperty() {
    if (!this._imageCheckBoxProperty)
      this._imageCheckBoxProperty = new DialogProperty<boolean>(
        PropertyDescriptionHelper.buildImageCheckBoxDescription("imageCheckBox", "", "icon-clear-night", "icon-clear-day", [{
          type: PropertyEditorParamTypes.SuppressEditorLabel, suppressLabelPlaceholder: true,
        } as SuppressLabelEditorParams]),
        true, undefined, false);
    return this._imageCheckBoxProperty;
  }

  // ------------- text based edit field ---------------
  private _cityProperty: DialogProperty<string> | undefined;
  public get cityProperty() {
    if (!this._cityProperty)
      this._cityProperty = new DialogProperty<string>(PropertyDescriptionHelper.buildTextEditorDescription("city",
        IModelApp.i18n.translate("SampleApp:tools.ToolWithSettings.Prompts.City")), "Exton", undefined);
    return this._cityProperty;
  }

  // ------------- text based edit field ---------------
  private _stateProperty: DialogProperty<string> | undefined;
  public get stateProperty() {
    if (!this._stateProperty)
      this._stateProperty = new DialogProperty<string>(
        PropertyDescriptionHelper.buildTextEditorDescription("state", IModelApp.i18n.translate("SampleApp:tools.ToolWithSettings.Prompts.State"),
          [
            {
              type: PropertyEditorParamTypes.InputEditorSize,
              size: 4,
            } as InputEditorSizeParams,
          ]
        ),
        "PA", undefined);
    return this._stateProperty;
  }

  // ------------- text based edit field ---------------
  private _coordinateProperty: DialogProperty<string> | undefined;
  public get coordinateProperty() {
    if (!this._coordinateProperty)
      this._coordinateProperty = new DialogProperty<string>(
        PropertyDescriptionHelper.buildTextEditorDescription("coordinate", IModelApp.i18n.translate("SampleApp:tools.ToolWithSettings.Prompts.Coordinate")),
        "0.0, 0.0, 0.0", undefined);
    return this._coordinateProperty;
  }

  // ------------- text based edit field ---------------
  private _numberProperty: DialogProperty<number> | undefined;
  public get numberProperty() {
    if (!this._numberProperty)
      this._numberProperty = new DialogProperty<number>(
        PropertyDescriptionHelper.buildNumberEditorDescription("numberVal", IModelApp.i18n.translate("SampleApp:tools.ToolWithSettings.Prompts.Number"),
          {
            type: PropertyEditorParamTypes.Range,
            step: 2,
            precision: 0,
            minimum: 0,
            maximum: 1000,
          } as RangeEditorParams), 14.0);
    return this._numberProperty;
  }

  // ------------- display station value as text  ---------------
  private _stationFormatterSpec?: FormatterSpec;
  public get stationFormatterSpec(): FormatterSpec | undefined {
    if (this._stationFormatterSpec)
      return this._stationFormatterSpec;

    const formatterSpec = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(QuantityType.Stationing);
    if (formatterSpec) {
      this._stationFormatterSpec = formatterSpec;
      return formatterSpec;
    }

    Logger.logError("UITestApp.ToolWithSettings", "Station formatterSpec was expected to be set before tool started.");
    return undefined;
  }

  private formatStation(numberValue: number): string {
    if (this.stationFormatterSpec) {
      return IModelApp.quantityFormatter.formatQuantity(numberValue, this.stationFormatterSpec);
    }
    return numberValue.toFixed(2);
  }

  private _stationProperty: DialogProperty<string> | undefined;
  public get stationProperty() {
    if (!this._stationProperty)
      this._stationProperty = new DialogProperty<string>(
        PropertyDescriptionHelper.buildTextEditorDescription("station", IModelApp.i18n.translate("SampleApp:tools.ToolWithSettings.Prompts.Station")),
        this.formatStation(0.0), undefined);
    return this._stationProperty;
  }

  // ------------- Survey Length ---------------
  private _surveyLengthProperty: DialogProperty<number> | undefined;
  public get surveyLengthProperty() {
    if (!this._surveyLengthProperty)
      this._surveyLengthProperty = new DialogProperty<number>(new SurveyLengthDescription("surveyLength", "Survey"), 51.25);
    return this._surveyLengthProperty;
  }

  // ------------- Angle ---------------
  private _angleProperty: DialogProperty<number> | undefined;
  public get angleProperty() {
    if (!this._angleProperty)
      this._angleProperty = new DialogProperty<number>(new AngleDescription("angle", "Angle"), 0.0);
    return this._angleProperty;
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
    const offset = IModelApp.uiAdmin.createXAndY(8, 0);

    if (1 === this.points.length)
      IModelApp.uiAdmin.openToolSettingsPopup(this._pointOnePopupSettingsProvider, IModelApp.uiAdmin.cursorPosition, offset, this._handleToolSettingsPopupCancel, RelativePosition.Right);
    else if (2 === this.points.length) {
      IModelApp.uiAdmin.openToolSettingsPopup(this._pointTwoPopupSettingsProvider, IModelApp.uiAdmin.cursorPosition, offset, this._handleToolSettingsPopupCancel, RelativePosition.Right);
    }

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
    const mainInstruction = ToolAssistance.createInstruction(ToolAssistanceImage.CursorClick, IModelApp.i18n.translate("SampleApp:tools.ToolWithSettings.Prompts.GetPoint"));
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

    this.points.push(ev.point.clone());
    if (2 === this.points.length) {
      const msg = `Point One -> Weight=${this._pointOnePopupSettingsProvider.weightProperty.value}`;
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
    } else if (3 === this.points.length) {
      const msg = `Point Two -> Source=${this._pointTwoPopupSettingsProvider.sourceProperty.value}`;
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
    }

    this.toggleCoordinateUpdate();
    IModelApp.uiAdmin.closeToolSettingsPopup();
    if (3 === this.points.length)
      this.points = [];
    this.setupAndPromptForNextAction();

    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    IModelApp.uiAdmin.closeToolSettingsPopup();

    /* Common reset behavior for primitive tools is calling onReinitialize to restart or exitTool to terminate. */
    this.onReinitialize();
    return EventHandled.No;
  }

  private syncCoordinateValue(coordinate: string, station: string, distance: number): void {
    this.coordinateProperty.value = coordinate;
    this.coordinateProperty.isDisabled = true;

    this.stationProperty.value = station;
    this.stationProperty.isDisabled = false;

    this.surveyLengthProperty.value = distance;
    this.surveyLengthProperty.displayValue = (this.surveyLengthProperty.description as SurveyLengthDescription).format(distance);
    this.syncToolSettingsProperties([this.coordinateProperty.syncItem, this.stationProperty.syncItem, this.surveyLengthProperty.syncItem]);
  }

  public override async onKeyTransition(wentDown: boolean, keyEvent: KeyboardEvent): Promise<EventHandled> {
    if (wentDown && keyEvent.key === "1") {
      this.useLengthProperty.isDisabled = !this.useLengthProperty.isDisabled;
      // test updating color option and available colors by providing a new enum list
      this.colorOptionProperty.value = this.useLengthProperty.isDisabled ? ToolOptions.Pink : ToolOptions.Red;
      this.colorOptionProperty.description = PropertyDescriptionHelper.buildEnumPicklistEditorDescription("colorOption",
        IModelApp.i18n.translate("SampleApp:tools.ToolWithSettings.Prompts.Color"), this.getColorChoices());
      const syncColorItem: DialogPropertySyncItem = { propertyName: this.colorOptionProperty.name, value: this.colorOptionProperty.dialogItemValue, property: this.colorOptionProperty.description };
      this.syncToolSettingsProperties([this.useLengthProperty.syncItem, syncColorItem]);
      const msg = `UseLength checkbox is now '${this.useLengthProperty.isDisabled ? "disabled" : "enabled"}'`;
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
      return EventHandled.Yes;
    } else if (wentDown && keyEvent.key === "2") {
      this.imageCheckBoxProperty.isDisabled = !this.imageCheckBoxProperty.isDisabled;
      this.syncToolSettingsProperties([this.imageCheckBoxProperty.syncItem]);
      const msg = `ImageCheckbox is now '${this.imageCheckBoxProperty.isDisabled ? "disabled" : "enabled"}'`;
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
      return EventHandled.Yes;
    } else if (wentDown && keyEvent.key === "3") {
      this.lockProperty.isDisabled = !this.lockProperty.isDisabled;
      this.syncToolSettingsProperties([this.lockProperty.syncItem]);
      const msg = `Lock Toggle is now '${this.lockProperty.isDisabled ? "disabled" : "enabled"}'`;
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
      return EventHandled.Yes;
    }
    return super.onKeyTransition(wentDown, keyEvent);
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
    const tool = new ToolWithSettings();
    if (!tool.run())
      this.exitTool();
  }

  /** Used to supply DefaultToolSettingProvider with a list of properties to use to generate ToolSettings.  If undefined then no ToolSettings will be displayed */
  public override supplyToolSettingsProperties(): DialogItem[] | undefined {
    const toolSettings = new Array<DialogItem>();
    toolSettings.push(this.colorOptionProperty.toDialogItem({ rowPriority: 1, columnIndex: 1 }));
    toolSettings.push(this.colorPickerProperty.toDialogItem({ rowPriority: 2, columnIndex: 2 }));
    toolSettings.push(this.lockProperty.toDialogItem({ rowPriority: 5, columnIndex: 2 }));
    toolSettings.push(this.cityProperty.toDialogItem({ rowPriority: 10, columnIndex: 2 }));
    toolSettings.push(this.stateProperty.toDialogItem({ rowPriority: 10, columnIndex: 4 }));
    toolSettings.push(this.coordinateProperty.toDialogItem({ rowPriority: 15, columnIndex: 2 }));
    toolSettings.push(this.numberProperty.toDialogItem({ rowPriority: 16, columnIndex: 2 }));
    toolSettings.push(this.stationProperty.toDialogItem({ rowPriority: 17, columnIndex: 2 }));
    const lengthLock = this.useLengthProperty.toDialogItem({ rowPriority: 18, columnIndex: 0 });
    toolSettings.push(this.lengthProperty.toDialogItem({ rowPriority: 20, columnIndex: 2 }, lengthLock));
    toolSettings.push(this.surveyLengthProperty.toDialogItem({ rowPriority: 21, columnIndex: 2 }));
    toolSettings.push(this.angleProperty.toDialogItem({ rowPriority: 25, columnIndex: 2 }));
    toolSettings.push(this.imageCheckBoxProperty.toDialogItem({ rowPriority: 30, columnIndex: 2 }));
    return toolSettings;
  }

  private showColorOptionSelectionInfo(updatedValue: DialogPropertySyncItem) {
    const colorStrings = ["none", "Red", "White", "Blue", "Yellow", "Purple", "Pink", "Green"];
    const msg = `Property '${updatedValue.propertyName}' updated to value ${colorStrings[updatedValue.value.value as number]}`;
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
  }

  private showColorInfoFromUi(updatedValue: DialogPropertySyncItem) {
    const colorDef = ColorDef.create(this.colorPickerProperty.value);
    const msg = `Property '${updatedValue.propertyName}' updated to value ${colorDef.toRgbString()}`;
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
  }

  private showInfoFromUi(updatedValue: DialogPropertySyncItem) {
    const msg = `Property '${updatedValue.propertyName}' updated to value ${updatedValue.value.value}`;
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
  }

  private syncLengthState(): void {
    this.lengthProperty.displayValue = (this.lengthProperty.description as LengthDescription).format(this.lengthProperty.value);
    this.lengthProperty.isDisabled = !this.useLengthProperty.value;
    this.syncToolSettingsProperties([this.lengthProperty.syncItem]);
  }

  /** Used to send changes from UI back to Tool */
  public override applyToolSettingPropertyChange(updatedValue: DialogPropertySyncItem): boolean {
    if (updatedValue.propertyName === this.lockProperty.name) {
      this.lockProperty.value = updatedValue.value.value as boolean;
      this.showInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === this.colorOptionProperty.name) {
      this.colorOptionProperty.value = updatedValue.value.value as number;
      this.showColorOptionSelectionInfo(updatedValue);
    } else if (updatedValue.propertyName === this.imageCheckBoxProperty.name) {
      this.imageCheckBoxProperty.value = updatedValue.value.value as boolean;
      this.showInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === this.cityProperty.name) {
      this.cityProperty.value = updatedValue.value.value as string;
      this.showInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === this.stateProperty.name) {
      this.stateProperty.value = updatedValue.value.value as string;
      this.showInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === this.useLengthProperty.name) {
      this.useLengthProperty.value = updatedValue.value.value as boolean;
      this.showInfoFromUi(updatedValue);
      this.syncLengthState();
    } else if (updatedValue.propertyName === this.lengthProperty.name) {
      this.lengthProperty.value = updatedValue.value.value as number;
      this.showInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === this.numberProperty.name) {
      this.numberProperty.value = updatedValue.value.value as number;
      this.showInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === this.surveyLengthProperty.name) {
      this.surveyLengthProperty.value = updatedValue.value.value as number;
      this.showInfoFromUi(updatedValue);
    } else if (updatedValue.propertyName === this.colorPickerProperty.name) {
      this.colorPickerProperty.value = updatedValue.value.value as number;
      this.showColorInfoFromUi(updatedValue);
    }

    // return true is change is valid
    return true;
  }

  /** Used to bump the value of a tool setting. If no `settingIndex` param is specified, the first setting is bumped.
   * @beta
   */
  public override async bumpToolSetting(settingIndex?: number): Promise<boolean> {
    if (settingIndex === 0 || settingIndex === undefined) {
      const newValue = await PropertyDescriptionHelper.bumpEnumProperty(this.colorOptionProperty.description, this.colorOptionProperty.value);

      if (newValue !== this.colorOptionProperty.value) {
        this.colorOptionProperty.value = newValue as number;
        this.syncToolSettingsProperties([this.colorOptionProperty.syncItem]);
        return true;
      }
    } else if (settingIndex === 2) {
      this.lockProperty.value = !this.lockProperty.value;
      this.syncToolSettingsProperties([this.lockProperty.syncItem]);
      return true;
    }

    return false;
  }
}
