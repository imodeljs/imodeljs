/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelApp, MapLayerSettingsService, MapLayerSourceStatus, NotifyMessageDetails, OutputMessagePriority } from "@bentley/imodeljs-frontend";
import { RelativePosition } from "@bentley/ui-abstract";
import { Button, ButtonType, Icon, Input, Listbox, ListboxItem, LoadingSpinner, Popup, SpinnerSize, WebFontIcon } from "@bentley/ui-core";
import { ModalDialogManager } from "@bentley/ui-framework";
import { useSourceMapContext } from "./MapLayerManager";
import { MapUrlDialog } from "./MapUrlDialog";
import { MapLayersUiItemsProvider } from "../MapLayersUiItemsProvider";
import { ConfirmMessageDialog } from "./ConfirmMessageDialog";

// cSpell:ignore droppable Sublayer

interface AttachLayerPanelProps {
  isOverlay: boolean;
  onLayerAttached: () => void;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function AttachLayerPanel({ isOverlay, onLayerAttached }: AttachLayerPanelProps) {
  const [layerNameToAdd, setLayerNameToAdd] = React.useState<string | undefined>();
  const [sourceFilterString, setSourceFilterString] = React.useState<string | undefined>();
  const [placeholderLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.SearchPlaceholder"));
  const [addCustomLayerLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.Custom"));
  const [addCustomLayerToolTip] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.AttachCustomLayer"));
  const [loadingMapSources] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.LoadingMapSources"));
  const [removeLayerDefButtonTitle] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.RemoveLayerDefButtonTitle"));
  const [removeLayerDefDialogTitle] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.RemoveLayerDefDialogTitle"));
  const [loading, setLoading] = React.useState(false);
  const [layerNameUnderCursor, setLayerNameUnderCursor] = React.useState<string | undefined>();

  // Make sure we close any active dialog when unloading
  React.useEffect(() => {
    return () => {
      ModalDialogManager.closeDialog();
    };
  }, []);

  const handleFilterTextChanged = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSourceFilterString(event.target.value);
  }, []);

  const { sources, activeViewport, backgroundLayers, overlayLayers, mapTypesOptions } = useSourceMapContext();
  const contextId = activeViewport?.iModel?.contextId;
  const iModelId = activeViewport?.iModel?.iModelId;

  const styleContainsLayer = React.useCallback((name: string) => {
    if (backgroundLayers) {
      if (-1 !== backgroundLayers.findIndex((layer) => layer.name === name))
        return true;
    }
    if (overlayLayers) {
      if (-1 !== overlayLayers.findIndex((layer) => layer.name === name))
        return true;
    }
    return false;
  }, [backgroundLayers, overlayLayers]);

  const handleModalUrlDialogOk = React.useCallback(() => {
    // close popup and refresh UI
    onLayerAttached();
  }, [onLayerAttached]);

  React.useEffect(() => {
    async function attemptToAddLayer(layerName: string) {
      if (layerName && activeViewport) {
        // if the layer is not in the style add it now.
        if (undefined === backgroundLayers?.find((layer) => layerName === layer.name) && undefined === overlayLayers?.find((layer) => layerName === layer.name)) {
          const mapLayerSettings = sources?.find((source) => source.name === layerName);
          if (mapLayerSettings === undefined) {
            return;
          }

          try {
            setLoading(true);
            const { status, subLayers } = await mapLayerSettings.validateSource();
            if (status === MapLayerSourceStatus.Valid || status === MapLayerSourceStatus.RequireAuth) {

              if (status === MapLayerSourceStatus.Valid) {

                const layerSettings = mapLayerSettings.toLayerSettings();

                if (layerSettings) {
                  const updatedLayerSettings = layerSettings.clone({ subLayers });
                  activeViewport.displayStyle.attachMapLayerSettings(updatedLayerSettings, isOverlay);

                  activeViewport.invalidateRenderPlan();

                  const msg = IModelApp.i18n.translate("mapLayers:Messages.MapLayerAttached", { sourceName: layerSettings.name, sourceUrl: layerSettings.url });
                  IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
                }

              } else if (status === MapLayerSourceStatus.RequireAuth) {
                ModalDialogManager.openDialog(
                  <MapUrlDialog
                    activeViewport={activeViewport}
                    isOverlay={isOverlay}
                    layerToEdit={mapLayerSettings.toJSON()}
                    onOkResult={handleModalUrlDialogOk}
                    mapTypesOptions={mapTypesOptions}
                    askForCredentialsOnly={true} />
                );
              }

              setLoading(false);
              if (onLayerAttached) {
                onLayerAttached();
              }

            } else {
              const msg = IModelApp.i18n.translate("mapLayers:Messages.MapLayerValidationFailed", { sourceUrl: mapLayerSettings.url });
              IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, msg));
              setLoading(false);
            }
          } catch (err) {
            setLoading(false);
            const msg = IModelApp.i18n.translate("mapLayers:Messages.MapLayerAttachError", { error: err, sourceUrl: mapLayerSettings.url });
            IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, msg));
          }
        }

      }
      return;
    }

    if (layerNameToAdd) {
      attemptToAddLayer(layerNameToAdd); // eslint-disable-line @typescript-eslint/no-floating-promises
      setLayerNameToAdd(undefined);
    }
  }, [setLayerNameToAdd, layerNameToAdd, activeViewport, sources, backgroundLayers, isOverlay, overlayLayers, onLayerAttached, handleModalUrlDialogOk, mapTypesOptions]);

  const options = React.useMemo(() => sources?.filter((source) => !styleContainsLayer(source.name)).map((value) => value.name), [sources, styleContainsLayer]);
  const filteredOptions = React.useMemo(() => {
    if (undefined === sourceFilterString || 0 === sourceFilterString.length) {
      return options;
    } else {
      return options?.filter((option) => option.toLowerCase().includes(sourceFilterString?.toLowerCase()));
    }
  }, [options, sourceFilterString]);

  const handleAddNewMapSource = React.useCallback(() => {
    ModalDialogManager.openDialog(<MapUrlDialog activeViewport={activeViewport} isOverlay={isOverlay} onOkResult={handleModalUrlDialogOk} mapTypesOptions={mapTypesOptions} />);
    return;
  }, [activeViewport, handleModalUrlDialogOk, isOverlay, mapTypesOptions]);

  const handleAttach = React.useCallback((mapName: string) => {
    setLayerNameToAdd(mapName);
  }, []);

  const handleKeypressOnSourceList = React.useCallback((event: React.KeyboardEvent<HTMLUListElement>) => {
    const key = event.key;
    if (key === "Enter") {
      event.preventDefault();
      const mapName = event.currentTarget?.dataset?.value;
      if (mapName && mapName.length) {
        handleAttach(mapName);
      }
    }
  }, [handleAttach]);

  const onListboxValueChange = React.useCallback((mapName: string) => {
    setLayerNameToAdd(mapName);
  }, []);

  const handleNoConfirmation = React.useCallback((_layerName: string) => {
    ModalDialogManager.closeDialog();
  }, []);

  const handleYesConfirmation = React.useCallback(async (layerName: string)  => {

    if (!!contextId && !!iModelId) {
      if (await MapLayerSettingsService.deleteSharedSettingsByName(layerName, contextId, iModelId)) {
        const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.RemoveLayerDefSuccess", { layerName });
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
      } else {
        const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.RemoveLayerDefError", { layerName });
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, msg));
      }
    }

    ModalDialogManager.closeDialog();
  }, [contextId, iModelId]);

  const onItemRemoveButtonClicked = React.useCallback((event) => {
    event.stopPropagation();  // We don't want the owning ListBox to react on mouse click.

    const layerName = event?.currentTarget?.parentNode?.dataset?.value;

    const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.RemoveLayerDefDialogMessage", { layerName });
    ModalDialogManager.openDialog(
      <ConfirmMessageDialog
        className="map-sources-delete-confirmation"
        title = {removeLayerDefDialogTitle}
        message = {msg}
        maxWidth={400}
        onClose={() => handleNoConfirmation(layerName)}
        onEscape={() => handleNoConfirmation(layerName)}
        onYesResult={async () => handleYesConfirmation(layerName)}
        onNoResult={() => handleNoConfirmation(layerName)}
      />
    );
  }, [handleNoConfirmation, handleYesConfirmation, removeLayerDefDialogTitle]);

  return (
    <div className="map-manager-header">
      {loading && <LoadingSpinner size={SpinnerSize.Medium} message={loadingMapSources} />}
      <div className="map-manager-source-listbox-header">
        <Input type="text" className="map-manager-source-list-filter"
          placeholder={placeholderLabel}
          value={sourceFilterString}
          onChange={handleFilterTextChanged} />
        <Button className="map-manager-add-source-button" buttonType={ButtonType.Hollow} title={addCustomLayerToolTip} onClick={handleAddNewMapSource}>
          {addCustomLayerLabel}</Button>
      </div>
      <div className="map-manager-sources">
        <Listbox id="map-sources" className="map-manager-source-list" onKeyPress={handleKeypressOnSourceList} onListboxValueChange={onListboxValueChange} >
          {
            filteredOptions?.map((mapName) =>
              <ListboxItem
                key={mapName}
                className="map-source-list-entry"
                value={mapName}
                onMouseEnter={() => setLayerNameUnderCursor(mapName)}
                onMouseLeave={() => setLayerNameUnderCursor(undefined)}>
                <span className="map-source-list-entry-name" title={mapName}>{mapName}</span>

                { // Display the delete icon only when the mouse over a specific item
                  // otherwise list feels cluttered.
                  (layerNameUnderCursor &&  layerNameUnderCursor === mapName) &&
                  <Button
                    className="map-source-delete-button"
                    title={removeLayerDefButtonTitle}
                    onClick={onItemRemoveButtonClicked}>
                    <Icon iconSpec="icon-delete" />
                  </Button> }
              </ListboxItem>
            )
          }
        </Listbox>
      </div>
    </div>

  );
}

/** @internal */
export enum AttachLayerButtonType {
  Primary,
  Blue,
  Icon
}
export interface AttachLayerPopupButtonProps {
  isOverlay: boolean;
  buttonType?: AttachLayerButtonType;
}

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function AttachLayerPopupButton(props: AttachLayerPopupButtonProps) {
  const [showAttachLayerLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:AttachLayerPopup.Attach"));
  const [hideAttachLayerLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:AttachLayerPopup.Close"));
  const [popupOpen, setPopupOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef =React.useRef<HTMLDivElement>(null);

  const togglePopup = React.useCallback(() => {
    setPopupOpen(!popupOpen);
  }, [popupOpen]);

  const handleClosePopup = React.useCallback(() => {
    setPopupOpen(false);
  }, []);

  const isInsideCoreDialog =  React.useCallback((element: HTMLElement) => {
    if (element.nodeName === "DIV") {
      if (element.classList && element.classList.contains("core-dialog"))
        return true;
      if (element.parentElement && isInsideCoreDialog(element.parentElement))
        return true;
    } else {
      // istanbul ignore else
      if (element.parentElement && isInsideCoreDialog(element.parentElement))
        return true;
    }
    return false;
  }, []);

  const handleOutsideClick = React.useCallback((event: MouseEvent) => {
    if (isInsideCoreDialog(event.target as HTMLElement)) {
      return;
    }

    // If clicking on button that open panel -  don't trigger outside click processing
    // -- Not too sure why this is needed, keeping it anyway.
    if (buttonRef?.current && buttonRef?.current.contains(event.target as Node)) {
      return;
    }

    // If clicking the panel, this is not an outside clicked
    if (panelRef.current && panelRef?.current.contains(event.target as Node)) {
      return;
    }

    // If we reach this point, we got an outside clicked, no close the popup
    setPopupOpen(false);

  }, [isInsideCoreDialog]);

  const { refreshFromStyle } = useSourceMapContext();

  const handleLayerAttached = React.useCallback(() => {
    setPopupOpen(false);
    refreshFromStyle();
  }, [refreshFromStyle]);

  function renderButton(): React.ReactNode {
    let button: React.ReactNode;

    if (props.buttonType === undefined || props.buttonType === AttachLayerButtonType.Icon) {
      button = (
        <button ref={buttonRef} className="map-manager-attach-layer-button" title={popupOpen ? hideAttachLayerLabel : showAttachLayerLabel}
          onClick={togglePopup}>
          <WebFontIcon iconName="icon-add" />
        </button>
      );
    } else {
      let typeClassName: string;
      switch (props.buttonType) {
        case AttachLayerButtonType.Blue:
          typeClassName = "uicore-buttons-blue";
          break;
        case AttachLayerButtonType.Primary:
        default:
          typeClassName = "uicore-buttons-primary";
          break;
      }
      button = (
        <button ref={buttonRef} className={typeClassName} title={popupOpen ? hideAttachLayerLabel : showAttachLayerLabel}
          onClick={togglePopup}>Add Layer</button>
      );
    }

    return button;
  }

  return (
    <>
      {renderButton()}
      <Popup
        className="map-sources-popup"
        isOpen={popupOpen}
        position={RelativePosition.BottomRight}
        onClose={handleClosePopup}
        onOutsideClick={handleOutsideClick}
        target={buttonRef.current}
      >
        <div ref={panelRef} className="map-sources-popup-panel" >
          <AttachLayerPanel isOverlay={props.isOverlay} onLayerAttached={handleLayerAttached}/>
        </div>
      </Popup >
    </>
  );
}
