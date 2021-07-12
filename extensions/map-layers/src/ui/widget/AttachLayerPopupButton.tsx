/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { IModelApp, MapLayerSettingsService, MapLayerSource, MapLayerSourceStatus, NotifyMessageDetails, OutputMessagePriority } from "@bentley/imodeljs-frontend";
import { RelativePosition } from "@bentley/ui-abstract";
import * as UiCore from "@bentley/ui-core";
import { ModalDialogManager } from "@bentley/ui-framework";
import { useSourceMapContext } from "./MapLayerManager";
import { MapUrlDialog } from "./MapUrlDialog";
import { MapLayersUiItemsProvider } from "../MapLayersUiItemsProvider";
import { ConfirmMessageDialog } from "./ConfirmMessageDialog";
import { Button, Input } from "@itwin/itwinui-react";

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
  const [editLayerDefButtonTitle] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.EditLayerDefButtonTitle"));
  const [removeLayerDefDialogTitle] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.RemoveLayerDefDialogTitle"));
  const [loading, setLoading] = React.useState(false);
  const [layerNameUnderCursor, setLayerNameUnderCursor] = React.useState<string | undefined>();

  // 'isMounted' is used to prevent any async operation once the hook has been
  // unloaded.  Otherwise we get a 'Can't perform a React state update on an unmounted component.' warning in the console.
  const isMounted = React.useRef(false);
  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;

      // We close any open dialogs that we might have opened
      // This was added because the modal dialog remained remained displayed after the session expired.
      ModalDialogManager.closeDialog();
    };
  }, []);

  const handleFilterTextChanged = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSourceFilterString(event.target.value);
  }, []);

  const { loadingSources, sources, activeViewport, backgroundLayers, overlayLayers, mapTypesOptions } = useSourceMapContext();
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

  const handleModalUrlDialogCancel = React.useCallback(() => {
    // close popup and refresh UI
    setLoading(false);
    ModalDialogManager.closeDialog();
  }, []);

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
            if (isMounted.current) {
              setLoading(true);
            }

            const { status, subLayers } = await mapLayerSettings.validateSource();
            if (status === MapLayerSourceStatus.Valid || status === MapLayerSourceStatus.RequireAuth) {

              if (status === MapLayerSourceStatus.Valid) {
                const layerSettings = mapLayerSettings.toLayerSettings(subLayers);

                if (layerSettings) {
                  activeViewport.displayStyle.attachMapLayerSettings(layerSettings, isOverlay);

                  activeViewport.invalidateRenderPlan();

                  const msg = IModelApp.i18n.translate("mapLayers:Messages.MapLayerAttached", { sourceName: layerSettings.name, sourceUrl: layerSettings.url });
                  IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
                }

                if (isMounted.current) {
                  setLoading(false);
                }
                if (onLayerAttached) {
                  onLayerAttached();
                }

              } else if (status === MapLayerSourceStatus.RequireAuth && isMounted.current) {
                ModalDialogManager.openDialog(
                  <MapUrlDialog
                    activeViewport={activeViewport}
                    isOverlay={isOverlay}
                    layerRequiringCredentials={mapLayerSettings.toJSON()}
                    onOkResult={handleModalUrlDialogOk}
                    onCancelResult={handleModalUrlDialogCancel}
                    mapTypesOptions={mapTypesOptions} />
                );
              }

            } else {
              const msg = IModelApp.i18n.translate("mapLayers:Messages.MapLayerValidationFailed", { sourceUrl: mapLayerSettings.url });
              IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, msg));
              if (isMounted.current) {
                setLoading(false);
              }
            }
          } catch (err) {
            if (isMounted.current) {
              setLoading(false);
            }
            const msg = IModelApp.i18n.translate("mapLayers:Messages.MapLayerAttachError", { error: err, sourceUrl: mapLayerSettings.url });
            IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, msg));
          }
        }

      }
      return;
    }

    if (layerNameToAdd) {
      attemptToAddLayer(layerNameToAdd); // eslint-disable-line @typescript-eslint/no-floating-promises

      if (isMounted.current) {
        setLayerNameToAdd(undefined);
      }
    }
  }, [setLayerNameToAdd, layerNameToAdd, activeViewport, sources, backgroundLayers, isOverlay, overlayLayers, onLayerAttached, handleModalUrlDialogOk, mapTypesOptions, handleModalUrlDialogCancel]);

  const options = React.useMemo(() => sources?.filter((source) => !styleContainsLayer(source.name)), [sources, styleContainsLayer]);
  const filteredOptions = React.useMemo(() => {
    if (undefined === sourceFilterString || 0 === sourceFilterString.length) {
      return options;
    } else {
      return options?.filter((option) => option.name.toLowerCase().includes(sourceFilterString?.toLowerCase()));
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

  const handleYesConfirmation = React.useCallback(async (source: MapLayerSource) => {

    const layerName = source.name;
    if (!!contextId && !!iModelId) {
      if (await MapLayerSettingsService.deleteSharedSettings(source, contextId, iModelId)) {
        const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.RemoveLayerDefSuccess", { layerName });
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
      } else {
        const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.RemoveLayerDefError", { layerName });
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, msg));
      }
    }

    ModalDialogManager.closeDialog();
  }, [contextId, iModelId]);

  /*
   Handle Remove layer button clicked
   */
  const onItemRemoveButtonClicked = React.useCallback((source, event) => {
    event.stopPropagation();  // We don't want the owning ListBox to react on mouse click.

    const layerName = source.name;

    const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.RemoveLayerDefDialogMessage", { layerName });
    ModalDialogManager.openDialog(
      <ConfirmMessageDialog
        className="map-sources-delete-confirmation"
        title={removeLayerDefDialogTitle}
        message={msg}
        maxWidth={400}
        onClose={() => handleNoConfirmation(layerName)}
        onEscape={() => handleNoConfirmation(layerName)}
        onYesResult={async () => handleYesConfirmation(source)}
        onNoResult={() => handleNoConfirmation(layerName)}
      />
    );
  }, [handleNoConfirmation, handleYesConfirmation, removeLayerDefDialogTitle]);

  /*
 Handle Edit layer button clicked
 */
  const onItemEditButtonClicked = React.useCallback((event) => {
    event.stopPropagation();  // We don't want the owning ListBox to react on mouse click.

    const targetLayerName = event?.currentTarget?.parentNode?.dataset?.value;
    const matchingSource = sources.find((layerSource) => layerSource.name === targetLayerName);

    // we expect a single layer source matching this name
    if (matchingSource === undefined) {
      return;
    }
    ModalDialogManager.openDialog(<MapUrlDialog
      activeViewport={activeViewport}
      isOverlay={isOverlay}
      mapLayerSourceToEdit={matchingSource}
      onOkResult={handleModalUrlDialogOk}
      mapTypesOptions={mapTypesOptions} />);
  }, [activeViewport, handleModalUrlDialogOk, isOverlay, mapTypesOptions, sources]);

  return (
    <div className="map-manager-header">
      {(loading || loadingSources) && <UiCore.LoadingSpinner message={loadingMapSources} />}
      <div className="map-manager-source-listbox-header">
        <Input type="text" className="map-manager-source-list-filter"
          placeholder={placeholderLabel}
          value={sourceFilterString}
          onChange={handleFilterTextChanged} />
        <Button className="map-manager-add-source-button" title={addCustomLayerToolTip} onClick={handleAddNewMapSource}>
          {addCustomLayerLabel}</Button>
      </div>
      <div className="map-manager-sources">
        <UiCore.Listbox
          id="map-sources"
          selectedValue={layerNameToAdd}
          className="map-manager-source-list"
          onKeyPress={handleKeypressOnSourceList}
          onListboxValueChange={onListboxValueChange} >
          {
            filteredOptions?.map((source) =>
              <UiCore.ListboxItem
                key={source.name}
                className="map-source-list-entry"
                value={source.name}
                onMouseEnter={() => setLayerNameUnderCursor(source.name)}
                onMouseLeave={() => setLayerNameUnderCursor(undefined)}>
                <span className="map-source-list-entry-name" title={source.name}>{source.name}</span>

                { // Display the delete icon only when the mouse over a specific item
                  // otherwise list feels cluttered.
                  (!!contextId && !!iModelId && layerNameUnderCursor && layerNameUnderCursor === source.name) &&
                  <>
                    <Button
                      className="map-source-list-entry-button"
                      title={editLayerDefButtonTitle}
                      onClick={onItemEditButtonClicked}>
                      <UiCore.Icon iconSpec="icon-edit" />
                    </Button>
                    <Button
                      className="map-source-list-entry-button"
                      title={removeLayerDefButtonTitle}
                      onClick={(event: React.MouseEvent) => { onItemRemoveButtonClicked(source, event); }}>
                      <UiCore.Icon iconSpec="icon-delete" />
                    </Button>
                  </>}

              </UiCore.ListboxItem>
            )
          }
        </UiCore.Listbox>
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
  const [addCustomLayerButtonLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.AddCustomLayerButtonLabel"));
  const [popupOpen, setPopupOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // 'isMounted' is used to prevent any async operation once the hook has been
  // unloaded.  Otherwise we get a 'Can't perform a React state update on an unmounted component.' warning in the console.
  const isMounted = React.useRef(false);
  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const togglePopup = React.useCallback(() => {
    setPopupOpen(!popupOpen);
  }, [popupOpen]);

  const handleClosePopup = React.useCallback(() => {
    setPopupOpen(false);
  }, []);

  const isInsideCoreDialog = React.useCallback((element: HTMLElement) => {
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
    if (!isMounted.current) {
      return;
    }
    setPopupOpen(false);
    refreshFromStyle();
  }, [refreshFromStyle]);

  function renderButton(): React.ReactNode {
    let button: React.ReactNode;

    if (props.buttonType === undefined || props.buttonType === AttachLayerButtonType.Icon) {
      button = (
        <button ref={buttonRef} className="map-manager-attach-layer-button" title={popupOpen ? hideAttachLayerLabel : showAttachLayerLabel}
          onClick={togglePopup}>
          <UiCore.WebFontIcon iconName="icon-add" />
        </button>
      );
    } else {
      const determineStyleType = () => {
        switch (props.buttonType) {
          case AttachLayerButtonType.Blue:
            return "high-visibility";
          case AttachLayerButtonType.Primary:
          default:
            return "cta";
        }
      };
      const styleType = determineStyleType();
      button = (
        <Button ref={buttonRef} styleType={styleType} title={popupOpen ? hideAttachLayerLabel : showAttachLayerLabel}
          onClick={togglePopup}>{addCustomLayerButtonLabel}</Button>
      );
    }

    return button;
  }

  return (
    <>
      {renderButton()}
      <UiCore.Popup
        isOpen={popupOpen}
        position={RelativePosition.BottomRight}
        onClose={handleClosePopup}
        onOutsideClick={handleOutsideClick}
        target={buttonRef.current}
        closeOnEnter={false}
      >
        <div ref={panelRef} className="map-sources-popup-panel" >
          <AttachLayerPanel isOverlay={props.isOverlay} onLayerAttached={handleLayerAttached} />
        </div>
      </UiCore.Popup >
    </>
  );
}
