/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import imperialIconSvg from "@bentley/icons-generic/icons/app-2.svg?sprite";
import automationIconSvg from "@bentley/icons-generic/icons/automation.svg?sprite";
import {
  ActivityMessageDetails,
  ActivityMessageEndReason,
  IModelApp, MessageBoxIconType, MessageBoxType, MessageBoxValue, NotifyMessageDetails, OutputMessageAlert, OutputMessagePriority, OutputMessageType,
  QuantityType, SelectionTool, SnapMode,
} from "@bentley/imodeljs-frontend";
import { PresentationUnitSystem } from "@bentley/presentation-common";
import { Presentation } from "@bentley/presentation-frontend";
import {
  BackstageItem, BackstageItemUtilities, CommonStatusBarItem, ConditionalBooleanValue, ConditionalStringValue, DialogButtonType, StatusBarSection,
  UiItemsManager, UiItemsProvider, WidgetState,
} from "@bentley/ui-abstract";
import { Dialog, MessageSeverity, ReactMessage, SvgPath, SvgSprite, UnderlinedButton } from "@bentley/ui-core";
import {
  Backstage, BaseItemState, CommandItemDef, ContentViewManager, FrontstageManager, MessageManager, ModalDialogManager, ReactNotifyMessageDetails,
  StatusBarItemUtilities, SyncUiEventDispatcher, SyncUiEventId, ToolItemDef, withStatusFieldProps,
} from "@bentley/ui-framework";
import { FooterSeparator } from "@bentley/ui-ninezone";
import { SampleAppIModelApp } from "../";
import { AppUi } from "../appui/AppUi";
import { TestMessageBox } from "../appui/dialogs/TestMessageBox";
import { SampleStatusField } from "../appui/statusfields/SampleStatusField";
import { AnalysisAnimationTool } from "../tools/AnalysisAnimation";
import { Tool1 } from "../tools/Tool1";
import { Tool2 } from "../tools/Tool2";
import { ToolWithSettings } from "./ToolWithSettings";
import { Radio } from "@itwin/itwinui-react";
import { BeDuration } from "@bentley/bentleyjs-core";

// cSpell:ignore appui appuiprovider
// eslint-disable-next-line @typescript-eslint/naming-convention
export function UnitsFormatDialog() {
  const [unitFormat, setUnitFormat] = React.useState(IModelApp.quantityFormatter.activeUnitSystem);
  const dialogTitle = React.useRef("Select Unit Format");

  React.useEffect(() => {
    const handleUnitSystemChanged = ((): void => {
      setUnitFormat(IModelApp.quantityFormatter.activeUnitSystem);
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Set Unit System to '${IModelApp.quantityFormatter.activeUnitSystem}'`));
    });

    IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener(handleUnitSystemChanged);
    return () => {
      IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.removeListener(handleUnitSystemChanged);
    };
  }, [unitFormat]);

  const handleClose = React.useCallback(() => {
    ModalDialogManager.closeDialog();
  }, []);

  const onRadioChange = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const unitSystem = event.target.value;

    switch (unitSystem) {
      case "imperial":
        setUnitFormat(unitSystem);
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.BritishImperial;
        await IModelApp.quantityFormatter.setActiveUnitSystem(unitSystem);
        break;
      case "metric":
        setUnitFormat(unitSystem);
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.Metric;
        await IModelApp.quantityFormatter.setActiveUnitSystem(unitSystem);
        break;
      case "usSurvey":
        setUnitFormat(unitSystem);
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.UsSurvey;
        await IModelApp.quantityFormatter.setActiveUnitSystem(unitSystem);
        break;
      case "usCustomary":
        setUnitFormat(unitSystem);
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.UsCustomary;
        await IModelApp.quantityFormatter.setActiveUnitSystem(unitSystem);
        break;
      default:
        break;
    }
  }, [setUnitFormat]);

  const buttonCluster = React.useMemo(() => [
    { type: DialogButtonType.Close, onClick: handleClose },
  ], [handleClose]);

  return (
    <div>
      <Dialog
        title={dialogTitle.current}
        opened={true}
        resizable={false}
        movable={true}
        modal={true}
        buttonCluster={buttonCluster}
        onClose={handleClose}
        onEscape={handleClose}
        minWidth={200}
        width={"auto"}
        trapFocus={false}
      >
        <div>
          <Radio label="Imperial" name="unitFormat" value="imperial" onChange={onRadioChange} checked={unitFormat === "imperial"} />
          <Radio label="Metric" name="unitFormat" value="metric" onChange={onRadioChange} checked={unitFormat === "metric"} />
          <Radio label="US Survey" name="unitFormat" value="usSurvey" onChange={onRadioChange} checked={unitFormat === "usSurvey"} />
          <Radio label="USCustomary" name="unitFormat" value="usCustomary" onChange={onRadioChange} checked={unitFormat === "usCustomary"} />
        </div>
      </Dialog>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const SampleStatus = withStatusFieldProps(SampleStatusField);

// Sample UI items provider that dynamically adds ui items
class AppItemsProvider implements UiItemsProvider {
  public readonly id = "AnotherStatusBarItemProvider";
  public static readonly sampleStatusFieldId = "appuiprovider:statusField1";
  public static readonly sampleStatusSeparatorId = "appuiprovider:statusSeparator1";
  public static readonly sampleBackstageItem = "appuiprovider:backstage1";
  public static readonly syncEventId = "appuiprovider:dynamic-item-visibility-changed";
  private static _sampleStatusVisible = false;  // initial set to false
  private static _sampleBackstageItemVisible = false;  // initial set to false

  public static toggleStatusBarItem() {
    AppItemsProvider._sampleStatusVisible = !AppItemsProvider._sampleStatusVisible;
    SyncUiEventDispatcher.dispatchImmediateSyncUiEvent(AppItemsProvider.syncEventId);
  }

  public static toggleBackstageItem() {
    AppItemsProvider._sampleBackstageItemVisible = !AppItemsProvider._sampleBackstageItemVisible;
    SyncUiEventDispatcher.dispatchImmediateSyncUiEvent(AppItemsProvider.syncEventId);
  }

  public provideStatusBarItems(_stageId: string, _stageUsage: string): CommonStatusBarItem[] {
    const statusBarItems: CommonStatusBarItem[] = [];
    const isHiddenCondition = new ConditionalBooleanValue(() => !AppItemsProvider._sampleBackstageItemVisible, [AppItemsProvider.syncEventId]);
    statusBarItems.push(StatusBarItemUtilities.createStatusBarItem(AppItemsProvider.sampleStatusSeparatorId, StatusBarSection.Left, 11, <FooterSeparator />, { isHidden: isHiddenCondition }));
    statusBarItems.push(StatusBarItemUtilities.createStatusBarItem(AppItemsProvider.sampleStatusFieldId, StatusBarSection.Left, 12, <SampleStatus />, { isHidden: isHiddenCondition }));
    return statusBarItems;
  }

  public provideBackstageItems(): BackstageItem[] {
    const backstageItemHidden = new ConditionalBooleanValue(() => !AppItemsProvider._sampleStatusVisible, [AppItemsProvider.syncEventId]);

    return [
      BackstageItemUtilities.createActionItem(AppItemsProvider.sampleBackstageItem, 500, 50, () => { }, "Dynamic Action", undefined, undefined, { isHidden: backstageItemHidden }),
    ];
  }
}

UiItemsManager.register(new AppItemsProvider());

export class AppTools {
  public static get tool1() {
    return new ToolItemDef({
      toolId: Tool1.toolId,
      iconSpec: Tool1.iconSpec,
      label: () => Tool1.flyover,
      description: () => Tool1.description,
      execute: () => {
        IModelApp.tools.run(Tool1.toolId);
        AppItemsProvider.toggleStatusBarItem();
        AppItemsProvider.toggleBackstageItem();
      },
    });
  }

  public static get tool2() {
    return new ToolItemDef({
      toolId: Tool2.toolId,
      iconSpec: Tool2.iconSpec,
      labelKey: "SampleApp:tools.Tool2.flyover",
      tooltipKey: "SampleApp:tools.Tool2.description",
      execute: () => {
        IModelApp.tools.run(Tool2.toolId);
      },
    });
  }

  public static get toolWithSettings() {
    return new ToolItemDef({
      toolId: ToolWithSettings.toolId,
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:tools.ToolWithSettings.flyover",
      tooltipKey: "SampleApp:tools.ToolWithSettings.description",
      execute: async () => {
        // ==== The following is no longer required since the default specs will be loaded when the QuantityFormatters onInitialized method is processed
        // as the ImodelApp starts. =====
        // make sure formatting and parsing data are cached before the tool starts.
        // await IModelApp.quantityFormatter.loadFormatAndParsingMaps(IModelApp.quantityFormatter.useImperialFormats);
        IModelApp.tools.run(ToolWithSettings.toolId);
      },
    });
  }

  public static get analysisAnimationCommand() {
    return new ToolItemDef({
      toolId: AnalysisAnimationTool.toolId,
      iconSpec: "icon-camera-animation",
      label: () => AnalysisAnimationTool.flyover,
      description: () => AnalysisAnimationTool.description,
      execute: () => { IModelApp.tools.run(AnalysisAnimationTool.toolId); },
      isVisible: false, // default to not show and then allow stateFunc to redefine.
      stateSyncIds: [SyncUiEventId.ActiveContentChanged],
      stateFunc: (currentState: Readonly<BaseItemState>): BaseItemState => {
        const returnState: BaseItemState = { ...currentState };
        const activeContentControl = ContentViewManager.getActiveContentControl();

        if (activeContentControl && activeContentControl.viewport && (undefined !== activeContentControl.viewport.view.analysisStyle))
          returnState.isVisible = true;
        else
          returnState.isVisible = false;
        return returnState;
      },
    });
  }

  // Tool that toggles the backstage
  public static get backstageToggleCommand() {
    // eslint-disable-next-line deprecation/deprecation
    return Backstage.backstageToggleCommand;
  }

  public static get item1() {
    return new CommandItemDef({
      commandId: "item1",
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.item1",
      applicationData: { key: "value" },
      execute: () => { AppUi.command1(); },
    });
  }

  public static get item2() {
    return new CommandItemDef({
      commandId: "item2",
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.item2",
      applicationData: { key: "value" },
      execute: () => { AppUi.command2(); },
    });
  }

  public static get item3() {
    return new CommandItemDef({
      commandId: "item3",
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.item3",
      applicationData: { key: "value" },
      execute: () => { IModelApp.tools.run(SelectionTool.toolId); },
    });
  }

  public static get item4() {
    return new CommandItemDef({
      commandId: "item4",
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.item4",
      applicationData: { key: "value" },
      execute: () => { IModelApp.tools.run(SelectionTool.toolId); },
    });
  }

  public static get item5() {
    return new CommandItemDef({
      commandId: "item5",
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.item5",
      applicationData: { key: "value" },
      execute: () => { IModelApp.tools.run(SelectionTool.toolId); },
    });
  }

  public static get item6() {
    return new CommandItemDef({
      commandId: "item6",
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.item6",
      applicationData: { key: "value" },
      execute: () => { IModelApp.tools.run(SelectionTool.toolId); },
    });
  }

  public static get item7() {
    return new CommandItemDef({
      commandId: "item7",
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.item7",
      applicationData: { key: "value" },
      execute: () => { IModelApp.tools.run(SelectionTool.toolId); },
    });
  }

  public static get item8() {
    return new CommandItemDef({
      commandId: "item8",
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.item8",
      applicationData: { key: "value" },
      execute: () => { IModelApp.tools.run(SelectionTool.toolId); },
    });
  }

  public static get setLengthFormatMetricCommand() {
    // data from app-1.svg
    const pathIconSpec = <SvgPath viewBoxWidth={16} viewBoxHeight={16}
      paths={["M13,1a2.0023,2.0023,0,0,1,2,2V13a2.0023,2.0023,0,0,1-2,2H3a2.0023,2.0023,0,0,1-2-2V3A2.0023,2.0023,0,0,1,3,1H13m0-1H3A3,3,0,0,0,0,3V13a3,3,0,0,0,3,3H13a3,3,0,0,0,3-3V3a3,3,0,0,0-3-3Z",
        "m8.695 12.223h-.87v-5.597q0-.698.043-1.321-.113.113-.252.236t-1.278 1.047l-.473-.612 2.078-1.606h.752"]} />;
    return new CommandItemDef({
      commandId: "setLengthFormatMetric",
      iconSpec: pathIconSpec,
      labelKey: "SampleApp:buttons.setLengthFormatMetric",
      execute: () => {
        IModelApp.quantityFormatter.useImperialFormats = false; // eslint-disable-line deprecation/deprecation
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.Metric;
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "Set Length Format to Metric"));
      },
    });
  }

  public static get setLengthFormatImperialCommand() {
    const spriteIconSpec = <SvgSprite src={imperialIconSvg} />;  // equivalent to `svg:${imperialIconSvg}`
    return new CommandItemDef({
      commandId: "setLengthFormatImperial",
      iconSpec: spriteIconSpec,
      labelKey: "SampleApp:buttons.setLengthFormatImperial",
      execute: () => {
        IModelApp.quantityFormatter.useImperialFormats = true; // eslint-disable-line deprecation/deprecation
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.BritishImperial;
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "Set Length Format to Imperial"));
      },
    });
  }

  public static get toggleLengthFormatOverrideCommand() {
    const overrideLengthFormats = {
      metric: {
        composite: {
          includeZero: true,
          spacer: " ",
          units: [{ label: "cm", name: "Units.CM" }],
        },
        formatTraits: ["keepSingleZero", "showUnitLabel"],
        precision: 4,
        type: "Decimal",
      },
      imperial: {
        composite: {
          includeZero: true,
          spacer: " ",
          units: [{ label: "in", name: "Units.IN" }],
        },
        formatTraits: ["keepSingleZero", "showUnitLabel"],
        precision: 4,
        type: "Decimal",
      },
      usCustomary: {
        composite: {
          includeZero: true,
          spacer: " ",
          units: [{ label: "in", name: "Units.IN" }],
        },
        formatTraits: ["keepSingleZero", "showUnitLabel"],
        precision: 4,
        type: "Decimal",
      },
      usSurvey: {
        composite: {
          includeZero: true,
          spacer: " ",
          units: [{ label: "in", name: "Units.US_SURVEY_IN" }],
        },
        formatTraits: ["keepSingleZero", "showUnitLabel"],
        precision: 4,
        type: "Decimal",
      },
    };

    return new CommandItemDef({
      commandId: "toggleLengthFormatOverride",
      iconSpec: `svg:${automationIconSvg}`,
      labelKey: "SampleApp:buttons.toggleLengthFormatOverride",
      execute: async () => {
        if (IModelApp.quantityFormatter.hasActiveOverride(QuantityType.Length)) {
          await IModelApp.quantityFormatter.clearOverrideFormats(QuantityType.Length);
          IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "Length Overrides cleared"));
        } else {
          await IModelApp.quantityFormatter.setOverrideFormats(QuantityType.Length, overrideLengthFormats);
          IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "Length Overrides set"));
        }
      },
    });
  }

  public static get toggleHideShowItemsCommand() {
    const commandId = "testHideShowItems";
    const toolSyncUiEventId = `test-app-sync-${commandId}`.toLowerCase();
    return new CommandItemDef({
      commandId,
      // Even though the following will work because calling SampleAppIModelApp.getTestProperty will update redux and trigger event - exercise the tool's call to dispatchUiSyncEvent instead.
      // iconSpec: new ConditionalStringValue(() => SampleAppIModelApp.getTestProperty() !== "HIDE" ? "icon-visibility-hide-2" : "icon-visibility", [SampleAppUiActionId.setTestProperty]),
      // label: new ConditionalStringValue(() => SampleAppIModelApp.getTestProperty() !== "HIDE" ? "Hide items" : "Show items", [SampleAppUiActionId.setTestProperty]),
      iconSpec: new ConditionalStringValue(() => SampleAppIModelApp.getTestProperty() !== "HIDE" ? "icon-visibility-hide-2" : "icon-visibility", [toolSyncUiEventId]),
      label: new ConditionalStringValue(() => SampleAppIModelApp.getTestProperty() !== "HIDE" ? "Hide items" : "Show items", [toolSyncUiEventId]),

      execute: () => {
        SampleAppIModelApp.setTestProperty(SampleAppIModelApp.getTestProperty() === "HIDE" ? "" : "HIDE");
        // demonstrate how tool could dispatch its own event.
        IModelApp.toolAdmin.dispatchUiSyncEvent(toolSyncUiEventId);
      },
    });
  }

  private static get _detailedMessage(): HTMLElement {
    const fragment = document.createRange().createContextualFragment("This is a detailed message with a line<br>break and <b>bold</b>, <i>italic</i> and <span class='red-text'>red</span> text.");
    const span = document.createElement("span");
    span.appendChild(fragment);
    return span;
  }

  private static get _reactMessage(): ReactMessage {
    const reactNode = (
      <span>
        For more details, <UnderlinedButton onClick={this._handleLink}>click here</UnderlinedButton>.
      </span>
    );
    return ({ reactNode });
  }

  private static _handleLink = () => {
    window.alert("The link was clicked");
  };

  public static get infoMessageCommand() {
    return new CommandItemDef({
      commandId: "infoMessage",
      iconSpec: "icon-info",
      labelKey: "SampleApp:buttons.informationMessageBox",
      execute: () => MessageManager.outputMessage(new ReactNotifyMessageDetails(OutputMessagePriority.Info, "This is an info message", this._reactMessage)),
    });
  }

  public static get warningMessageCommand() {
    return new CommandItemDef({
      commandId: "warningMessage",
      iconSpec: "icon-status-warning",
      labelKey: "SampleApp:buttons.warningMessageBox",
      execute: () => MessageManager.outputMessage(new ReactNotifyMessageDetails(OutputMessagePriority.Warning, "This is a warning message", this._reactMessage, OutputMessageType.Sticky)),
    });
  }

  public static get noIconMessageCommand() {
    return new CommandItemDef({
      commandId: "noIconMessage",
      iconSpec: "icon-status-success-hollow",
      labelKey: "SampleApp:buttons.noIconMessageBox",
      execute: () => IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.None, "This message has no icon", this._detailedMessage)),
    });
  }

  private static get _longMessage(): HTMLElement {
    const div = document.createElement("div");
    const ol = document.createElement("ol");
    let li = document.createElement("li");
    li.appendChild(AppTools._detailedMessage);
    ol.appendChild(li);
    li = document.createElement("li");
    li.appendChild(AppTools._detailedMessage);
    ol.appendChild(li);
    div.appendChild(ol);
    const fragment = document.createRange().createContextualFragment("For more details, <a href='https://www.google.com/' target='_blank'>Google it!</a>");
    div.appendChild(fragment);
    return div;
  }

  public static get errorMessageCommand() {
    return new CommandItemDef({
      commandId: "errorMessage",
      iconSpec: "icon-status-rejected",
      labelKey: "SampleApp:buttons.errorMessageBox",
      execute: () => IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error,
        "This is an error message", this._longMessage,
        OutputMessageType.Alert, OutputMessageAlert.Balloon)),
    });
  }

  public static get snapInfoMessageCommand() {
    return new CommandItemDef({
      commandId: "infoMessage",
      iconSpec: "icon-info",
      labelKey: "SampleApp:buttons.informationMessageBox",
      execute: () => {
        let displayString = "Current Snap Mode(s):";

        if (SampleAppIModelApp.store.getState().frameworkState) {
          const snapModes = IModelApp.accuSnap.getActiveSnapModes();
          for (const mode of snapModes) {
            if (mode === SnapMode.Bisector) displayString += " Bisector";
            if (mode === SnapMode.Center) displayString += " Center";
            if (mode === SnapMode.Intersection) displayString += " Intersection";
            if (mode === SnapMode.MidPoint) displayString += " MidPoint";
            if (mode === SnapMode.Nearest) displayString += " Nearest";
            if (mode === SnapMode.NearestKeypoint) displayString += " NearestKeypoint";
            if (mode === SnapMode.Origin) displayString += " Origin";
          }
        }

        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, displayString));
      },
    });
  }

  private static get _detailMsg() {
    const doc = new DOMParser().parseFromString("<span>This is a description of the alert with lots and lots of words that explains what the user did & what they can do to remedy the situation. <br />For more info, <a href='http://www.google.com' target='_blank'>Google it!</a><span>", "text/html");
    return doc.documentElement;
  }
  public static get warningMessageStickyCommand() {
    return new CommandItemDef({
      commandId: "warningMessage",
      iconSpec: "icon-status-warning",
      labelKey: "SampleApp:buttons.warningMessageBox",
      execute: () => IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Warning, AppTools._warningStr, AppTools._detailMsg, OutputMessageType.Sticky)),
    });
  }

  public static get errorMessageAlertCommand() {
    return new CommandItemDef({
      commandId: "errorMessage",
      iconSpec: "icon-status-error",
      labelKey: "SampleApp:buttons.errorMessageBox",
      execute: () => IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, AppTools._errorStr, AppTools._detailMsg, OutputMessageType.Alert)),
    });
  }

  private static _messageBox = (severity: MessageSeverity, title: string): React.ReactNode => {
    return (
      <TestMessageBox
        opened={true}
        severity={severity}
        title={title}
      />
    );
  };

  public static get errorMessageBoxCommand() {
    return new CommandItemDef({
      commandId: "errorMessage",
      iconSpec: "icon-status-error",
      labelKey: "SampleApp:buttons.errorMessageBox",
      execute: () => ModalDialogManager.openDialog(AppTools._messageBox(MessageSeverity.Error, IModelApp.i18n.translate("SampleApp:buttons.errorMessageBox"))),
    });
  }

  public static get successMessageBoxCommand() {
    return new CommandItemDef({
      commandId: "successMessage",
      iconSpec: "icon-status-success",
      labelKey: "SampleApp:buttons.successMessageBox",
      execute: () => ModalDialogManager.openDialog(AppTools._messageBox(MessageSeverity.None, IModelApp.i18n.translate("SampleApp:buttons.successMessageBox"))),
    });
  }

  public static get informationMessageBoxCommand() {
    return new CommandItemDef({
      commandId: "informationMessage",
      iconSpec: "icon-info",
      labelKey: "SampleApp:buttons.informationMessageBox",
      execute: () => ModalDialogManager.openDialog(AppTools._messageBox(MessageSeverity.Information, IModelApp.i18n.translate("SampleApp:buttons.informationMessageBox"))),
    });
  }

  public static get questionMessageBoxCommand() {
    return new CommandItemDef({
      commandId: "questionMessage",
      iconSpec: "icon-help",
      labelKey: "SampleApp:buttons.questionMessageBox",
      execute: () => ModalDialogManager.openDialog(AppTools._messageBox(MessageSeverity.Question, IModelApp.i18n.translate("SampleApp:buttons.questionMessageBox"))),
    });
  }

  public static get warningMessageBoxCommand() {
    return new CommandItemDef({
      commandId: "warningMessage",
      iconSpec: "icon-status-warning",
      labelKey: "SampleApp:buttons.warningMessageBox",
      execute: () => ModalDialogManager.openDialog(AppTools._messageBox(MessageSeverity.Warning, IModelApp.i18n.translate("SampleApp:buttons.warningMessageBox"))),
    });
  }

  public static get openUnitsFormatDialogCommand() {
    return new CommandItemDef({
      commandId: " ",
      iconSpec: " icon-dashboard-2",
      label: "Open Units Formatting Dialog",
      execute: () => ModalDialogManager.openDialog(<UnitsFormatDialog />, "unitsFormatDialog"),
    });
  }

  public static get openMessageBoxCommand() {
    const textNode = document.createTextNode("This is a box opened using IModelApp.notifications.openMessageBox and using promise/then to process result.");
    const message = document.createElement("div");
    message.appendChild(textNode);
    message.appendChild(this._longMessage);

    return new CommandItemDef({
      commandId: "openMessageBox",
      iconSpec: "icon-info",
      labelKey: "SampleApp:buttons.openMessageBox",
      execute: () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        IModelApp.notifications.openMessageBox(MessageBoxType.Ok,
          message,
          MessageBoxIconType.Information)
          .then((value: MessageBoxValue) => { window.alert(`Closing message box ... value is ${value}`); });
      },
    });
  }

  public static get openMessageBoxCommand2() {
    const textNode = document.createTextNode("This is a box opened using IModelApp.notifications.openMessageBox and using async/await to process result.");
    const message = document.createElement("div");
    message.appendChild(textNode);
    message.appendChild(this._longMessage);

    return new CommandItemDef({
      commandId: "openMessageBox2",
      iconSpec: "icon-status-warning",
      labelKey: "SampleApp:buttons.openMessageBox",
      execute: async () => {
        const value: MessageBoxValue = await IModelApp.notifications.openMessageBox(MessageBoxType.YesNo,
          message,
          MessageBoxIconType.Warning);
        window.alert(`Closing message box ... value is ${value}`);
      },
    });
  }

  private static _infoStr = "This is an info message with more text than will fit.";
  private static _warningStr = "This is a warning message with more text than will fit.";
  private static _errorStr = "This is an error message with more text than will fit.";
  private static _fatalStr = "This is a fatal message with more text than will fit.";

  public static get addMessageCommand() {
    return new CommandItemDef({
      commandId: "addMessage",
      iconSpec: "icon-status-warning",
      labelKey: "SampleApp:buttons.openSeveralMessages",
      execute: async () => {
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, AppTools._infoStr));
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Warning, AppTools._warningStr));
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, AppTools._errorStr));
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Fatal, AppTools._fatalStr));
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, AppTools._infoStr, undefined, OutputMessageType.Sticky));
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Warning, AppTools._warningStr, undefined, OutputMessageType.Sticky));
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, AppTools._errorStr, undefined, OutputMessageType.Sticky));
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Fatal, AppTools._fatalStr, undefined, OutputMessageType.Sticky));
      },
    });
  }

  public static get verticalPropertyGridOpenCommand() {
    return new CommandItemDef({
      commandId: "verticalPropertyGridOpen",
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.openPropertyGrid",
      tooltip: "Open Vertical PropertyGrid (Tooltip)",
      execute: async () => {
        const activeFrontstageDef = FrontstageManager.activeFrontstageDef;
        if (activeFrontstageDef) {
          const widgetDef = activeFrontstageDef.findWidgetDef("VerticalPropertyGrid");
          if (widgetDef) {
            widgetDef.setWidgetState(WidgetState.Open);
          }
        }
      },
    });
  }

  public static get verticalPropertyGridOffCommand() {
    return new CommandItemDef({
      commandId: "verticalPropertyGridOff",
      iconSpec: "icon-placeholder",
      labelKey: "SampleApp:buttons.closePropertyGrid",
      tooltip: "Close PropertyGrid (Tooltip)",
      execute: async () => {
        const activeFrontstageDef = FrontstageManager.activeFrontstageDef;
        if (activeFrontstageDef) {
          const widgetDef = activeFrontstageDef.findWidgetDef("VerticalPropertyGrid");
          if (widgetDef) {
            widgetDef.setWidgetState(WidgetState.Hidden);
          }
        }
      },
    });
  }

  /** Tool that will start a sample activity and display ActivityMessage.
   */
  private static _activityTool = async () => {
    let isCancelled = false;
    let progress = 0;

    const details = new ActivityMessageDetails(true, true, true, true);
    details.onActivityCancelled = () => {
      isCancelled = true;
    };
    IModelApp.notifications.setupActivityMessage(details);

    while (!isCancelled && progress <= 100) {
      IModelApp.notifications.outputActivityMessage("This is a sample activity message", progress);
      await BeDuration.wait(100);
      progress++;
    }

    const endReason = isCancelled ? ActivityMessageEndReason.Cancelled : ActivityMessageEndReason.Completed;
    IModelApp.notifications.endActivityMessage(endReason);
  };

  public static get activityMessageItem() {
    return new CommandItemDef({
      iconSpec: "icon-placeholder", labelKey: "SampleApp:buttons.activityMessage", execute: async () => { await this._activityTool(); },
    });
  }

}
