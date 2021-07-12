/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Settings
 */

import "./QuantityFormat.scss";
import * as React from "react";
import { DeepCompare } from "@bentley/geometry-core";
import {
  getQuantityTypeKey, IModelApp, QuantityFormatsChangedArgs, QuantityType, QuantityTypeArg, QuantityTypeKey, UnitSystemKey,
} from "@bentley/imodeljs-frontend";
import { FormatProps, FormatterSpec } from "@bentley/imodeljs-quantity";
import { DialogButtonType } from "@bentley/ui-abstract";
import { FormatSample, QuantityFormatPanel } from "@bentley/ui-components";
import {
  Dialog, Listbox, ListboxItem, SettingsTabEntry,
  useSaveBeforeActivatingNewSettingsTab, useSaveBeforeClosingSettingsContainer,
} from "@bentley/ui-core";
import { ModalDialogManager } from "../../dialog/ModalDialogManager";
import { UiFramework } from "../../UiFramework";
import { PresentationUnitSystem } from "@bentley/presentation-common";
import { UnitSystemSelector } from "./UnitSystemSelector";
import { Presentation } from "@bentley/presentation-frontend";
import { Button } from "@itwin/itwinui-react";

function formatAreEqual(obj1: FormatProps, obj2: FormatProps) {
  const compare = new DeepCompare();
  return compare.compare(obj1, obj2);
}

/** Options to initialize the settings page that allows users to set Quantity formatting overrides.
 * @beta
 */
export interface QuantityFormatterSettingsOptions {
  initialQuantityType: QuantityTypeArg;
  availableUnitSystems: Set<UnitSystemKey>;
}

/**
 * Return a SettingsTabEntry that can be used to define the available settings that can be set for an application.
 * @param itemPriority - Used to define the order of the entry in the Settings Stage
 * @param opts - Options to initialize the settings page that allows users to set Quantity formatting overrides.
 * @beta
 */
export function getQuantityFormatsSettingsManagerEntry(itemPriority: number, opts?: Partial<QuantityFormatterSettingsOptions>): SettingsTabEntry {
  const { availableUnitSystems, initialQuantityType } = { ...opts };
  return {
    itemPriority, tabId: "uifw:Quantity",
    label: UiFramework.translate("settings.quantity-formatting.label"),
    subLabel: UiFramework.translate("settings.quantity-formatting.subLabel"),
    page: <QuantityFormatSettingsPage initialQuantityType={initialQuantityType ?? QuantityType.Length}
      availableUnitSystems={availableUnitSystems ?? new Set(["metric", "imperial", "usCustomary", "usSurvey"])} />,
    isDisabled: false,
    icon: "icon-measure",
    tooltip: UiFramework.translate("settings.quantity-formatting.tooltip"),
    pageWillHandleCloseRequest: true,
  };
}

/** UI Component shown in settings page to set the active Presentation Unit System and to set format overrides.
 * @beta
 */
export function QuantityFormatSettingsPage({ initialQuantityType, availableUnitSystems }: QuantityFormatterSettingsOptions) {
  const [activeUnitSystemKey, setActiveUnitSystemKey] = React.useState(IModelApp.quantityFormatter.activeUnitSystem);
  const [activeQuantityType, setActiveQuantityType] = React.useState(getQuantityTypeKey(initialQuantityType));
  const [activeFormatterSpec, setActiveFormatterSpec] =
    React.useState<FormatterSpec | undefined>(IModelApp.quantityFormatter.findFormatterSpecByQuantityType(getQuantityTypeKey(activeQuantityType)));
  const [saveEnabled, setSaveEnabled] = React.useState(false);
  const [clearEnabled, setClearEnabled] = React.useState(IModelApp.quantityFormatter.hasActiveOverride(initialQuantityType, true));
  const newQuantityTypeRef = React.useRef<QuantityTypeKey>();
  const formatSectionLabel = React.useRef(UiFramework.translate("settings.quantity-formatting.formatSectionLabel"));
  const setButtonLabel = React.useRef(UiFramework.translate("settings.quantity-formatting.setButtonLabel"));
  const clearButtonLabel = React.useRef(UiFramework.translate("settings.quantity-formatting.clearButtonLabel"));

  React.useEffect(() => {
    const handleUnitSystemChanged = ((): void => {
      // istanbul ignore else
      if (activeUnitSystemKey !== IModelApp.quantityFormatter.activeUnitSystem) {
        setActiveUnitSystemKey(IModelApp.quantityFormatter.activeUnitSystem);
        setActiveFormatterSpec(IModelApp.quantityFormatter.findFormatterSpecByQuantityType(activeQuantityType));
        setSaveEnabled(false);
        setClearEnabled(IModelApp.quantityFormatter.hasActiveOverride(activeQuantityType, true));
      }
    });

    IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener(handleUnitSystemChanged);
    return () => {
      IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.removeListener(handleUnitSystemChanged);
    };
  }, [activeQuantityType, activeUnitSystemKey]);

  React.useEffect(() => {
    const handleFormatChanged = ((args: QuantityFormatsChangedArgs): void => {
      if (!newQuantityTypeRef.current) {
        const quantityKey = IModelApp.quantityFormatter.getQuantityTypeKey(activeQuantityType);
        // istanbul ignore else
        if (args.quantityType === quantityKey) {
          setActiveFormatterSpec(IModelApp.quantityFormatter.findFormatterSpecByQuantityType(activeQuantityType));
          setSaveEnabled(false);
          setClearEnabled(IModelApp.quantityFormatter.hasActiveOverride(activeQuantityType, true));
        }
      }
      newQuantityTypeRef.current = undefined;
    });
    IModelApp.quantityFormatter.onQuantityFormatsChanged.addListener(handleFormatChanged);
    return () => {
      IModelApp.quantityFormatter.onQuantityFormatsChanged.removeListener(handleFormatChanged);
    };
  }, [activeQuantityType]);

  const saveChanges = React.useCallback((afterSaveFunction: (args: any) => void, args?: any) => {
    // istanbul ignore else
    if (activeFormatterSpec) {
      const formatProps = activeFormatterSpec.format.toJSON();
      const formatPropsInUse = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(activeQuantityType)!.format.toJSON();
      if (formatPropsInUse && !formatAreEqual(formatProps, formatPropsInUse)) {
        ModalDialogManager.openDialog(<SaveFormatModalDialog formatProps={formatProps} quantityType={activeQuantityType} onDialogCloseArgs={args} onDialogClose={afterSaveFunction} />, "saveQuantityFormat");
        return;
      }
    }
    afterSaveFunction(args);
  }, [activeFormatterSpec, activeQuantityType]);

  useSaveBeforeActivatingNewSettingsTab(UiFramework.settingsManager, saveChanges);
  useSaveBeforeClosingSettingsContainer(UiFramework.settingsManager, saveChanges);

  const processListboxValueChange = React.useCallback((newQuantityType: QuantityTypeKey) => {
    const volumeFormatterSpec = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(newQuantityType);
    setActiveFormatterSpec(volumeFormatterSpec);
    setActiveQuantityType(newQuantityType);
    setSaveEnabled(false);
    setClearEnabled(IModelApp.quantityFormatter.hasActiveOverride(newQuantityType, true));
  }, []);

  const onListboxValueChange = React.useCallback((newQuantityType: string) => {
    // istanbul ignore else
    if (activeFormatterSpec) {
      const formatProps = activeFormatterSpec.format.toJSON();
      const formatPropsInUse = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(activeQuantityType)!.format.toJSON();
      if (formatPropsInUse && !formatAreEqual(formatProps, formatPropsInUse)) {
        newQuantityTypeRef.current = newQuantityType;
        ModalDialogManager.openDialog(<SaveFormatModalDialog formatProps={formatProps} quantityType={activeQuantityType} onDialogCloseArgs={newQuantityType} onDialogClose={processListboxValueChange} />, "saveQuantityFormat");
        return;
      }
    }
    processListboxValueChange(newQuantityType);
  }, [activeFormatterSpec, activeQuantityType, processListboxValueChange]);

  const handleOnFormatChanged = React.useCallback(async (formatProps: FormatProps) => {
    // istanbul ignore else
    if (activeFormatterSpec) {
      const newSpec = await IModelApp.quantityFormatter.generateFormatterSpecByType(activeQuantityType, formatProps);
      const formatPropsInUse = IModelApp.quantityFormatter.getFormatPropsByQuantityType(activeQuantityType);
      // istanbul ignore else
      if (formatPropsInUse)
        setSaveEnabled(!formatAreEqual(formatProps, formatPropsInUse));
      setActiveFormatterSpec(newSpec);
    }
  }, [activeFormatterSpec, activeQuantityType]);

  const handleOnFormatSave = React.useCallback(async () => {
    // istanbul ignore else
    if (activeFormatterSpec) {
      const format = activeFormatterSpec.format.toJSON();
      await IModelApp.quantityFormatter.setOverrideFormat(activeQuantityType, format);
      setClearEnabled(true);
    }
  }, [activeFormatterSpec, activeQuantityType]);

  const handleOnFormatReset = React.useCallback(async () => {
    await IModelApp.quantityFormatter.clearOverrideFormats(activeQuantityType);
    setClearEnabled(false);
  }, [activeQuantityType]);

  const processNewUnitSystem = React.useCallback(async (unitSystem: UnitSystemKey) => {
    switch (unitSystem) {
      case "imperial":
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.BritishImperial;
        await IModelApp.quantityFormatter.setActiveUnitSystem(unitSystem);
        break;
      case "metric":
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.Metric;
        await IModelApp.quantityFormatter.setActiveUnitSystem(unitSystem);
        break;
      case "usSurvey":
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.UsSurvey;
        await IModelApp.quantityFormatter.setActiveUnitSystem(unitSystem);
        break;
      case "usCustomary":
        Presentation.presentation.activeUnitSystem = PresentationUnitSystem.UsCustomary;
        await IModelApp.quantityFormatter.setActiveUnitSystem(unitSystem);
        break;
    }
  }, []);

  const handleUnitSystemSelected = React.useCallback(async (unitSystem: UnitSystemKey) => {
    if (unitSystem === activeUnitSystemKey)
      return;
    saveChanges(processNewUnitSystem, unitSystem);
  }, [activeUnitSystemKey, processNewUnitSystem, saveChanges]);

  return (
    <div className="quantity-formatting-container">
      <UnitSystemSelector selectedUnitSystemKey={activeUnitSystemKey} availableUnitSystems={availableUnitSystems} onUnitSystemSelected={handleUnitSystemSelected} />
      <span className="uifw-quantity-format-section-label">{formatSectionLabel.current}</span>
      <div className="uifw-quantity-types-container">
        <div className="left-panel">
          <Listbox id="uifw-quantity-types-list" className="uifw-quantity-types"
            onListboxValueChange={onListboxValueChange} selectedValue={activeQuantityType} >
            {
              [...IModelApp.quantityFormatter.quantityTypesRegistry.keys()].map((key) => {
                const entry = IModelApp.quantityFormatter.quantityTypesRegistry.get(key)!;
                const description = entry.description;
                const label = entry.label;
                return (
                  <ListboxItem key={entry.key} className="quantity-type-list-entry" value={entry.key}>
                    <span className="map-source-list-entry-name" title={description}>{label}</span>
                  </ListboxItem>
                );
              })
            }
          </Listbox>
        </div>
        <div className="right-panel">
          {activeFormatterSpec &&
            <>
              <div className="uifw-quantity-types-right-top">
                <div className="uifw-quantity-types-right-top-sample">
                  <FormatSample formatSpec={activeFormatterSpec} initialMagnitude={1234.56} hideLabels />
                </div>
              </div>
              <div className="uifw-quantity-types-formats">
                <QuantityFormatPanel onFormatChange={handleOnFormatChanged} quantityType={activeQuantityType} />
              </div>
              <div className="components-button-panel">
                <Button styleType="cta" onClick={handleOnFormatSave} disabled={!saveEnabled}>{setButtonLabel.current}</Button>
                <Button styleType="default" onClick={handleOnFormatReset} disabled={!clearEnabled}>{clearButtonLabel.current}</Button>
              </div>
            </>
          }
        </div>
      </div>
    </div>
  );
}

function SaveFormatModalDialog({ formatProps, quantityType, onDialogCloseArgs, onDialogClose }: { formatProps: FormatProps, quantityType: QuantityTypeKey, onDialogCloseArgs?: any, onDialogClose: (args?: any) => void }) {
  const [isOpen, setIsOpen] = React.useState(true);

  const handleClose = React.useCallback(() => {
    setIsOpen(false);
    ModalDialogManager.closeDialog();
    onDialogClose && onDialogClose(onDialogCloseArgs);
  }, [onDialogClose, onDialogCloseArgs]);

  const handleOK = React.useCallback(() => {
    void IModelApp.quantityFormatter.setOverrideFormat(quantityType, formatProps); // eslint-disable-line @typescript-eslint/no-floating-promises
    handleClose();
  }, [formatProps, handleClose, quantityType]);

  const handleCancel = React.useCallback(() => {
    handleClose();
  }, [handleClose]);

  return (
    <Dialog
      title={"Save Format Changes"}
      opened={isOpen}
      resizable={false}
      movable={false}
      modal={true}
      buttonCluster={[
        { type: DialogButtonType.Yes, onClick: handleOK },
        { type: DialogButtonType.No, onClick: handleCancel },
      ]}
      onEscape={handleCancel}
      onClose={handleCancel}
      onOutsideClick={handleCancel}
      minHeight={150}
      maxHeight={400}
      maxWidth={400}
      minWidth={200}
    >
      <div className="modal-dialog2">
        Do you want to save changes to format before changing to another type?
      </div>
    </Dialog >
  );
}
