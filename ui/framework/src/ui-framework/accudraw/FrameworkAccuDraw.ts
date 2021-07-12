/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module AccuDraw
 */

import { AccuDraw, BeButtonEvent, CompassMode, IModelApp, ItemField, NotifyMessageDetails, OutputMessagePriority, QuantityType, RotationMode } from "@bentley/imodeljs-frontend";
import { AccuDrawField, AccuDrawMode, AccuDrawSetFieldValueFromUiEventArgs, AccuDrawUiAdmin, ConditionalBooleanValue } from "@bentley/ui-abstract";
import { UiFramework, UserSettingsProvider } from "../UiFramework";
import { SyncUiEventDispatcher, SyncUiEventId } from "../syncui/SyncUiEventDispatcher";
import { AccuDrawUiSettings } from "./AccuDrawUiSettings";
import { BeUiEvent } from "@bentley/bentleyjs-core";
import { UiSettings, UiSettingsStatus } from "@bentley/ui-core";

// cspell:ignore dont

const itemToFieldMap = new Map<ItemField, AccuDrawField>([
  [ItemField.X_Item, AccuDrawField.X],
  [ItemField.Y_Item, AccuDrawField.Y],
  [ItemField.Z_Item, AccuDrawField.Z],
  [ItemField.ANGLE_Item, AccuDrawField.Angle],
  [ItemField.DIST_Item, AccuDrawField.Distance],
]);

const fieldToItemMap = new Map<AccuDrawField, ItemField>([
  [AccuDrawField.X, ItemField.X_Item],
  [AccuDrawField.Y, ItemField.Y_Item],
  [AccuDrawField.Z, ItemField.Z_Item],
  [AccuDrawField.Angle, ItemField.ANGLE_Item],
  [AccuDrawField.Distance, ItemField.DIST_Item],
]);

const compassModeToKeyMap = new Map<CompassMode, string>([
  [CompassMode.Polar, "polar"],
  [CompassMode.Rectangular, "rectangular"],
]);

const rotationModeToKeyMap = new Map<RotationMode, string>([
  [RotationMode.Top, "top"],
  [RotationMode.Front, "front"],
  [RotationMode.Side, "side"],
  [RotationMode.View, "view"],
  [RotationMode.ACS, "ACS"],
  [RotationMode.Context, "context"],
]);

/** @internal */
export class AccuDrawUiSettingsChangedEvent extends BeUiEvent<{}> { }

/** @internal */
export class FrameworkAccuDraw extends AccuDraw implements UserSettingsProvider {
  private static _displayNotifications = false;
  private static _uiSettings: AccuDrawUiSettings | undefined;
  private static _settingsNamespace = "AppUiSettings";
  private static _notificationsKey = "AccuDrawNotifications";
  public readonly providerId = "FrameworkAccuDraw";

  /** Determines if AccuDraw.rotationMode === RotationMode.Top */
  public static readonly isTopRotationConditional = new ConditionalBooleanValue(() => IModelApp.accuDraw.rotationMode === RotationMode.Top, [SyncUiEventId.AccuDrawRotationChanged]);
  /** Determines if AccuDraw.rotationMode === RotationMode.Front */
  public static readonly isFrontRotationConditional = new ConditionalBooleanValue(() => IModelApp.accuDraw.rotationMode === RotationMode.Front, [SyncUiEventId.AccuDrawRotationChanged]);
  /** Determines if AccuDraw.rotationMode === RotationMode.Side */
  public static readonly isSideRotationConditional = new ConditionalBooleanValue(() => IModelApp.accuDraw.rotationMode === RotationMode.Side, [SyncUiEventId.AccuDrawRotationChanged]);
  /** Determines if AccuDraw.rotationMode === RotationMode.View */
  public static readonly isViewRotationConditional = new ConditionalBooleanValue(() => IModelApp.accuDraw.rotationMode === RotationMode.View, [SyncUiEventId.AccuDrawRotationChanged]);
  /** Determines if AccuDraw.rotationMode === RotationMode.ACS */
  public static readonly isACSRotationConditional = new ConditionalBooleanValue(() => IModelApp.accuDraw.rotationMode === RotationMode.ACS, [SyncUiEventId.AccuDrawRotationChanged]);
  /** Determines if AccuDraw.rotationMode === RotationMode.Context */
  public static readonly isContextRotationConditional = new ConditionalBooleanValue(() => IModelApp.accuDraw.rotationMode === RotationMode.Context, [SyncUiEventId.AccuDrawRotationChanged]);
  /** Determines if AccuDraw.compassMode === CompassMode.Polar */
  public static readonly isPolarModeConditional = new ConditionalBooleanValue(() => IModelApp.accuDraw.compassMode === CompassMode.Polar, [SyncUiEventId.AccuDrawCompassModeChanged]);
  /** Determines if AccuDraw.compassMode === CompassMode.Rectangular */
  public static readonly isRectangularModeConditional = new ConditionalBooleanValue(() => IModelApp.accuDraw.compassMode === CompassMode.Rectangular, [SyncUiEventId.AccuDrawCompassModeChanged]);

  /** AccuDraw Grab Input Focus event. */
  public static readonly onAccuDrawUiSettingsChangedEvent = new AccuDrawUiSettingsChangedEvent();

  /** Determines if notifications should be displayed for AccuDraw changes */
  public static get displayNotifications(): boolean { return FrameworkAccuDraw._displayNotifications; }
  public static set displayNotifications(v: boolean) {
    FrameworkAccuDraw._displayNotifications = v;
    void UiFramework.getUiSettingsStorage().saveSetting(this._settingsNamespace, this._notificationsKey, v);
  }

  public async loadUserSettings(storage: UiSettings): Promise<void> {
    const result = await storage.getSetting(FrameworkAccuDraw._settingsNamespace, FrameworkAccuDraw._notificationsKey);
    if (result.status === UiSettingsStatus.Success)
      FrameworkAccuDraw._displayNotifications = result.setting;
  }

  /** AccuDraw User Interface settings */
  public static get uiSettings(): AccuDrawUiSettings | undefined { return FrameworkAccuDraw._uiSettings; }
  public static set uiSettings(v: AccuDrawUiSettings | undefined) {
    FrameworkAccuDraw._uiSettings = v;
    FrameworkAccuDraw.onAccuDrawUiSettingsChangedEvent.emit({});
  }

  constructor() {
    super();
    AccuDrawUiAdmin.onAccuDrawSetFieldValueFromUiEvent.addListener(this.handleSetFieldValueFromUiEvent);
    UiFramework.registerUserSettingsProvider(this);
  }

  private handleSetFieldValueFromUiEvent = async (args: AccuDrawSetFieldValueFromUiEventArgs) => {
    const item = FrameworkAccuDraw.translateToItemField(args.field);
    return IModelApp.accuDraw.processFieldInput(item, args.stringValue, false);
  };

  /** @internal */
  public static translateFromItemField(item: ItemField): AccuDrawField {
    let field = itemToFieldMap.get(item);
    // istanbul ignore if
    if (field === undefined)
      field = AccuDrawField.X;
    return field;
  }

  /** @internal */
  public static translateToItemField(field: AccuDrawField): ItemField {
    let item = fieldToItemMap.get(field);
    // istanbul ignore if
    if (item === undefined)
      item = ItemField.X_Item;
    return item;
  }

  /** @internal */
  public override onCompassModeChange(): void {
    const accuDrawMode = this.compassMode === CompassMode.Rectangular ? AccuDrawMode.Rectangular : AccuDrawMode.Polar;
    IModelApp.uiAdmin.accuDrawUi.setMode(accuDrawMode);
    SyncUiEventDispatcher.dispatchSyncUiEvent(SyncUiEventId.AccuDrawCompassModeChanged);

    this.outputCompassModeMessage();
  }

  /** @internal */
  public override onRotationModeChange(): void {
    SyncUiEventDispatcher.dispatchSyncUiEvent(SyncUiEventId.AccuDrawRotationChanged);

    this.outputRotationMessage();
  }

  /** @internal */
  public override onFieldLockChange(index: ItemField): void {
    const field = FrameworkAccuDraw.translateFromItemField(index);
    IModelApp.uiAdmin.accuDrawUi.setFieldLock(field, this.getFieldLock(index));
  }

  /** @internal */
  public override onFieldValueChange(index: ItemField): void {
    const field = FrameworkAccuDraw.translateFromItemField(index);
    const value = this.getValueByIndex(index);
    const formattedValue = FrameworkAccuDraw.getFieldDisplayValue(index);
    IModelApp.uiAdmin.accuDrawUi.setFieldValueToUi(field, value, formattedValue);
  }

  private fieldValuesChanged(): void {
    this.onFieldValueChange(ItemField.X_Item);
    this.onFieldValueChange(ItemField.Y_Item);
    this.onFieldValueChange(ItemField.Z_Item);
    this.onFieldValueChange(ItemField.ANGLE_Item);
    this.onFieldValueChange(ItemField.DIST_Item);
  }

  /** @internal */
  public override setFocusItem(index: ItemField): void {
    const field = FrameworkAccuDraw.translateFromItemField(index);
    IModelApp.uiAdmin.accuDrawUi.setFieldFocus(field);
  }

  /** Implemented by sub-classes to update ui fields to show current deltas or coordinates when inactive.
   * Should also choose active x or y input field in rectangular mode based on cursor position when
   * axis isn't locked to support "smart lock".
   * @internal
   */
  public override onMotion(_ev: BeButtonEvent): void {
    if (!this.isEnabled || this.isDeactivated || UiFramework.isContextMenuOpen)
      return;

    this.fieldValuesChanged();

    if (!this.dontMoveFocus)
      this.setFocusItem(this.newFocus);
  }

  /** Determine if the AccuDraw UI has focus
   * @internal
   */
  public override get hasInputFocus(): boolean {
    let hasFocus = false;
    const el = document.querySelector("div.uifw-accudraw-field-container");
    if (el)
      hasFocus = el.contains(document.activeElement);
    return hasFocus;
  }

  /** Implement this method to set focus to the AccuDraw UI.
   * @internal
   */
  public override grabInputFocus(): void {
    IModelApp.uiAdmin.accuDrawUi.grabInputFocus();
  }

  public static getFieldDisplayValue(index: ItemField): string {
    const value = IModelApp.accuDraw.getValueByIndex(index);
    let formattedValue = value.toString();

    const formatterSpec = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(ItemField.ANGLE_Item === index ? QuantityType.Angle : QuantityType.Length);
    // istanbul ignore else
    if (formatterSpec)
      formattedValue = IModelApp.quantityFormatter.formatQuantity(value, formatterSpec);

    return formattedValue;
  }

  private outputInfoMessage(message: string): void {
    // istanbul ignore else
    if (FrameworkAccuDraw.displayNotifications)
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, message));
  }

  private outputCompassModeMessage(): void {
    if (FrameworkAccuDraw.displayNotifications) {
      let modeKey = compassModeToKeyMap.get(IModelApp.accuDraw.compassMode);
      // istanbul ignore if
      if (modeKey === undefined)
        modeKey = "polar";
      const modeString = UiFramework.translate(`accuDraw.compassMode.${modeKey}`);
      const modeMessage = UiFramework.i18n.translateWithNamespace(UiFramework.i18nNamespace, "accuDraw.compassModeSet", { modeString });
      this.outputInfoMessage(modeMessage);
    }
  }

  private outputRotationMessage(): void {
    if (FrameworkAccuDraw.displayNotifications) {
      let rotationKey = rotationModeToKeyMap.get(IModelApp.accuDraw.rotationMode);
      // istanbul ignore if
      if (rotationKey === undefined)
        rotationKey = "top";
      const rotationString = UiFramework.translate(`accuDraw.rotation.${rotationKey}`);
      const rotationMessage = UiFramework.i18n.translateWithNamespace(UiFramework.i18nNamespace, "accuDraw.rotationSet", { rotationString });
      this.outputInfoMessage(rotationMessage);
    }
  }
}
