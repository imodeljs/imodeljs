/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./QuantityFormatStage.scss";
import * as React from "react";
import { ModalFrontstageInfo, ModalDialogManager, UiFramework } from "@bentley/ui-framework";
import { IModelApp, QuantityFormatsChangedArgs, QuantityType } from "@bentley/imodeljs-frontend";
import { Button, ButtonType, Listbox, ListboxItem, Dialog } from "@bentley/ui-core";
import { Format, FormatProps, FormatterSpec, UnitsProvider } from "@bentley/imodeljs-quantity";
import { FormatPanel, FormatSample } from "@bentley/ui-components";
import { DeepCompare } from "@bentley/geometry-core";
import { DialogButtonType } from "@bentley/ui-abstract";

/** Modal frontstage displaying the active QuantityFormatStage.
 * @alpha
 */
export class QuantityFormatModalFrontstage implements ModalFrontstageInfo {
  public title: string = UiFramework.i18n.translate("SampleApp:QuantityFormatModalFrontstage.QuantityFormatStage");
  public get content(): React.ReactNode { return (<QuantityFormatStage initialQuantityType={QuantityType.Length} />); }
}

function enumKeys<O extends object, K extends keyof O = keyof O>(obj: O): K[] {
  return Object.keys(obj).filter((k) => Number.isNaN(+k)) as K[];
}

function formatAreEqual(obj1: FormatProps, obj2: FormatProps) {
  const compare = new DeepCompare();
  return compare.compare(obj1, obj2);
};

function QuantityFormatStage({ initialQuantityType }: { initialQuantityType: QuantityType }) {
  const [activeQuantityType, setActiveQuantityType] = React.useState(initialQuantityType);
  const [activeFormatterSpec, setActiveFormatterSpec] = React.useState<FormatterSpec | undefined>(IModelApp.quantityFormatter.findFormatterSpecByQuantityType(initialQuantityType));
  const [saveEnabled, setSaveEnabled] = React.useState(false);
  const [clearEnabled, setClearEnabled] = React.useState(IModelApp.quantityFormatter.hasActiveOverride(initialQuantityType, true));
  const newQuantityTypeRef = React.useRef<QuantityType>();

  /* Not yet needed as no way to change system from modal stage
  React.useEffect(() => {
    const handleUnitSystemChanged = ((): void => {
      setActiveFormatterSpec(IModelApp.quantityFormatter.findFormatterSpecByQuantityType(activeQuantityType));
      setSaveEnabled(false);
      setClearEnabled(IModelApp.quantityFormatter.hasActiveOverride(activeQuantityType, true));
    });

    IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener(handleUnitSystemChanged);
    return () => {
      IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.removeListener(handleUnitSystemChanged);
    };
  }, [activeQuantityType]);
  */

  React.useEffect(() => {
    const handleFormatChanged = ((args: QuantityFormatsChangedArgs): void => {
      if (!newQuantityTypeRef.current) {
        const quantityKey = IModelApp.quantityFormatter.getQuantityTypeKey(activeQuantityType);
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

  const processListboxValueChange = React.useCallback((newQuantityType: QuantityType) => {
    const volumeFormatterSpec = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(newQuantityType);
    setActiveFormatterSpec(volumeFormatterSpec);
    setActiveQuantityType(newQuantityType);
    setSaveEnabled(false);
    setClearEnabled(IModelApp.quantityFormatter.hasActiveOverride(newQuantityType, true));
  }, []);

  const onListboxValueChange = React.useCallback((enumValue: string) => {
    const newQuantityType = Number.parseInt(enumValue, 10) as QuantityType;
    if (activeFormatterSpec) {
      const formatProps = activeFormatterSpec.format.toJSON();
      const formatPropsInUse = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(activeQuantityType)?.format.toJSON();
      if (formatPropsInUse && !formatAreEqual(formatProps, formatPropsInUse)) {
        newQuantityTypeRef.current = newQuantityType;
        ModalDialogManager.openDialog(<SaveFormatModalDialog formatProps={formatProps} quantityType={activeQuantityType} newQuantityType={newQuantityType} onDialogClose={processListboxValueChange} />, "saveQuantityFormat");
      } else {
        processListboxValueChange(newQuantityType);
      }
    }
  }, [activeFormatterSpec, activeQuantityType, processListboxValueChange]);

  const handleOnFormatChanged = React.useCallback((format: FormatProps) => {
    async function fetchFormatSpec(formatProps: FormatProps) {
      if (activeFormatterSpec) {
        const pu = activeFormatterSpec.persistenceUnit;
        const actualFormat = new Format("custom");
        const unitsProvider = IModelApp.quantityFormatter as UnitsProvider;
        await actualFormat.fromJSON(unitsProvider, formatProps);
        const newSpec = await FormatterSpec.create(actualFormat.name, actualFormat, unitsProvider, pu);
        const formatPropsInUse = IModelApp.quantityFormatter.findFormatterSpecByQuantityType(activeQuantityType)?.format.toJSON();
        if (formatPropsInUse)
          setSaveEnabled(!formatAreEqual(formatProps, formatPropsInUse));
        setActiveFormatterSpec(newSpec);
      }
    }
    fetchFormatSpec(format); // eslint-disable-line @typescript-eslint/no-floating-promises
  }, [activeFormatterSpec, activeQuantityType]);

  const handleOnFormatSave = React.useCallback(async () => {
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

  return (
    <div className="quantity-types-stage">
      <div className="quantity-types-container">
        <div className="left-panel">
          <Listbox id="quantity-types-list" className="quantity-types"
            onListboxValueChange={onListboxValueChange} selectedValue={activeQuantityType.toString()} >
            {
              enumKeys(QuantityType).map((enumValue) =>
                <ListboxItem key={enumValue} className="quantity-type-list-entry" value={QuantityType[enumValue].toString()}>
                  <span className="map-source-list-entry-name" title={enumValue.toString()}>{enumValue}</span>
                </ListboxItem>)
            }
          </Listbox>
        </div>
        <div className="right-panel">
          {activeFormatterSpec &&
            <>
              <div className="quantity-types-right-top">
                <div className="quantity-types-right-top-sample">
                  <FormatSample formatSpec={activeFormatterSpec} initialMagnitude={1234.56} hideLabels />
                </div>
              </div>
              <div className="quantity-types-formats">
                <FormatPanel onFormatChange={handleOnFormatChanged}
                  initialFormat={activeFormatterSpec.format.toJSON()} showSample={false}
                  unitsProvider={IModelApp.quantityFormatter as UnitsProvider} persistenceUnit={activeFormatterSpec.persistenceUnit} />
              </div>
              <div className="components-button-panel">
                <Button buttonType={ButtonType.Blue} onClick={handleOnFormatSave} disabled={!saveEnabled}>Set</Button>
                <Button buttonType={ButtonType.Hollow} onClick={handleOnFormatReset} disabled={!clearEnabled}>Clear</Button>
              </div>
            </>
          }
        </div>
      </div>
    </div>
  );
}

function SaveFormatModalDialog({ formatProps, quantityType, newQuantityType, onDialogClose }: { formatProps: FormatProps, quantityType: QuantityType, newQuantityType: QuantityType, onDialogClose: (newQuantityType: QuantityType) => void }) {
  const [isOpen, setIsOpen] = React.useState(true);

  const handleClose = React.useCallback(() => {
    setIsOpen(false);
    ModalDialogManager.closeDialog("saveQuantityFormat");
    onDialogClose(newQuantityType);
  }, [newQuantityType, onDialogClose]);

  const handleOK = React.useCallback(() => {
    IModelApp.quantityFormatter.setOverrideFormat(quantityType, formatProps);
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
    >
      <div className="modal-dialog2">
        Do you want to save changes to format before changing to another type?
      </div>
    </Dialog >
  );
}
