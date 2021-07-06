/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// cSpell:ignore Modeless WMTS

import * as React from "react";
import { Button, Dialog, DialogButtonType, Icon, Input, InputStatus, LabeledInput, ProgressBar, Radio, Select } from "@bentley/ui-core";
import { ModalDialogManager } from "@bentley/ui-framework";
import { MapLayersUiItemsProvider } from "../MapLayersUiItemsProvider";
import { MapTypesOptions } from "../Interfaces";
import {
  EsriOAuth2, IModelApp, MapLayerImageryProviderStatus, MapLayerSettingsService, MapLayerSource,
  MapLayerSourceStatus, MapLayerSourceValidation, NotifyMessageDetails, OutputMessagePriority, ScreenViewport,
} from "@bentley/imodeljs-frontend";
import { MapLayerAuthType, MapLayerProps } from "@bentley/imodeljs-common";
import "./MapUrlDialog.scss";
import { SpecialKey } from "@bentley/ui-abstract";
import useEsriOAuth2Popup from "../hooks/useEsriOAuth2Popup";

export const MAP_TYPES = {
  wms: "WMS",
  arcGis: "ArcGIS",
  wmts: "WMTS",
  tileUrl: "TileURL",
};

interface MapUrlDialogProps {
  activeViewport?: ScreenViewport;
  isOverlay: boolean;
  onOkResult: () => void;
  onCancelResult?: () => void;
  mapTypesOptions?: MapTypesOptions;

  // An optional layer definition can be provide to enable the edit mode
  layerRequiringCredentials?: MapLayerProps;

  mapLayerSourceToEdit?: MapLayerSource;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function MapUrlDialog(props: MapUrlDialogProps) {
  const { isOverlay, onOkResult, mapTypesOptions } = props;

  const getMapUrlFromProps = React.useCallback(() => {
    if (props.mapLayerSourceToEdit) {
      return props.mapLayerSourceToEdit.url;
    } else if (props.layerRequiringCredentials?.url) {
      return props.layerRequiringCredentials.url;
    }
    return "";
  }, [props.layerRequiringCredentials, props.mapLayerSourceToEdit]);

  const getMapNameFromProps = React.useCallback(() => {
    if (props.mapLayerSourceToEdit) {
      return props.mapLayerSourceToEdit.name;
    } else if (props.layerRequiringCredentials?.name) {
      return props.layerRequiringCredentials.name;
    }
    return "";
  }, [props.layerRequiringCredentials, props.mapLayerSourceToEdit]);

  const getFormatFromProps = React.useCallback(() => {
    if (props.mapLayerSourceToEdit) {
      return props.mapLayerSourceToEdit.formatId;
    } else if (props.layerRequiringCredentials?.formatId) {
      return props.layerRequiringCredentials.formatId;
    }
    return undefined;
  }, [props.layerRequiringCredentials, props.mapLayerSourceToEdit]);

  const [dialogTitle] = React.useState(MapLayersUiItemsProvider.i18n.translate(props.layerRequiringCredentials || props.mapLayerSourceToEdit ? "mapLayers:CustomAttach.EditCustomLayer" : "mapLayers:CustomAttach.AttachCustomLayer"));
  const [typeLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.Type"));
  const [nameLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.Name"));
  const [nameInputPlaceHolder] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.NameInputPlaceHolder"));
  const [urlLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.URL"));
  const [urlInputPlaceHolder] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.UrlInputPlaceHolder"));
  const [projectSettingsLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.StoreOnProjectSettings"));
  const [modelSettingsLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.StoreOnModelSettings"));
  const [missingCredentialsLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.MissingCredentials"));
  const [invalidCredentialsLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.InvalidCredentials"));
  const [externalLoginFailedMsg] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.ExternalLoginFailed"));
  const [externalLoginSucceededMsg] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.ExternalLoginSucceeded"));
  const [externalLoginWaitingMsg] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.ExternalLoginWaiting"));
  const [externalLoginTryAgainLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.ExternalLoginTryAgain"));
  const [serverRequireCredentials, setServerRequireCredentials] = React.useState(false);
  const [invalidCredentialsProvided, setInvalidCredentialsProvided] = React.useState(false);
  const [layerAttachPending, setLayerAttachPending] = React.useState(false);
  const [layerAuthPending, setLayerAuthPending] = React.useState(false);
  const [mapUrl, setMapUrl] = React.useState(getMapUrlFromProps());
  const [mapName, setMapName] = React.useState(getMapNameFromProps());
  const [userName, setUserName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [noSaveSettingsWarning] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.NoSaveSettingsWarning"));
  const [passwordLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:AuthenticationInputs.Password"));
  const [passwordRequiredLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:AuthenticationInputs.PasswordRequired"));
  const [userNameLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:AuthenticationInputs.Username"));
  const [userNameRequiredLabel] = React.useState(MapLayersUiItemsProvider.i18n.translate("mapLayers:AuthenticationInputs.UsernameRequired"));
  const [settingsStorage, setSettingsStorageRadio] = React.useState("Project");
  const [layerAuthMethod, setLayerAuthMethod] = React.useState(MapLayerAuthType.None);
  const [esriOAuth2Succeeded, setEsriOAuth2Succeeded] = React.useState<undefined|boolean>(undefined);

  const [mapType, setMapType] = React.useState(getFormatFromProps() ?? MAP_TYPES.arcGis);

  // 'isMounted' is used to prevent any async operation once the hook has been
  // unloaded.  Otherwise we get a 'Can't perform a React state update on an unmounted component.' warning in the console.
  const isMounted = React.useRef(false);
  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const [mapTypes] = React.useState((): string[] => {
    const types = [MAP_TYPES.arcGis, MAP_TYPES.wms, MAP_TYPES.wmts];
    if (mapTypesOptions?.supportTileUrl)
      types.push(MAP_TYPES.tileUrl);
    return types;
  });

  const [isSettingsStorageAvailable] = React.useState(props?.activeViewport?.iModel?.contextId && props?.activeViewport?.iModel?.iModelId);

  // Even though the settings storage is available,
  // we don't always want to enable it in the UI.
  const [settingsStorageDisabled] = React.useState( !isSettingsStorageAvailable|| props.mapLayerSourceToEdit !== undefined || props.layerRequiringCredentials !== undefined );

  React.useEffect(() => {
    setServerRequireCredentials(layerAuthMethod === MapLayerAuthType.Basic || layerAuthMethod === MapLayerAuthType.EsriToken);
  }, [layerAuthMethod]);

  const [layerRequiringCredentialsIdx] = React.useState((): number | undefined => {
    if (props.layerRequiringCredentials === undefined || !props.layerRequiringCredentials.name || !props.layerRequiringCredentials.url) {
      return undefined;
    }

    const indexInDisplayStyle = props.activeViewport?.displayStyle.findMapLayerIndexByNameAndUrl(props.layerRequiringCredentials.name, props.layerRequiringCredentials.url, isOverlay);
    if (indexInDisplayStyle === undefined || indexInDisplayStyle < 0) {
      return undefined;
    } else {
      return indexInDisplayStyle;
    }
  });

  // Update warning message based on the dialog state and server response
  const handleMapTypeSelection = React.useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setMapType(e.target.value);
    e.preventDefault();

    // Reset few states
    if (invalidCredentialsProvided)
      setInvalidCredentialsProvided(false);

    if (esriOAuth2Succeeded === false) {
      setEsriOAuth2Succeeded(undefined);
    }
    if (layerAuthMethod !== MapLayerAuthType.None) {
      setLayerAuthMethod(MapLayerAuthType.None);
    }

  }, [esriOAuth2Succeeded, invalidCredentialsProvided, layerAuthMethod]);

  const handleCancel = React.useCallback(() => {
    if (props.onCancelResult) {
      props.onCancelResult();
      return;
    }
    ModalDialogManager.closeDialog();
  }, [props]);

  const onUsernameChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setUserName(event.target.value);
    if (invalidCredentialsProvided)
      setInvalidCredentialsProvided(false);
  }, [setUserName, invalidCredentialsProvided, setInvalidCredentialsProvided]);

  const onPasswordChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
    if (invalidCredentialsProvided)
      setInvalidCredentialsProvided(false);
  }, [setPassword, invalidCredentialsProvided, setInvalidCredentialsProvided]);

  const handleArcGisLogin = React.useCallback(() => {
    setLayerAuthPending(true);
    setShowEsriOauth2Popup(true);
    if (esriOAuth2Succeeded === false) {
      setEsriOAuth2Succeeded(undefined);
    }

  }, [esriOAuth2Succeeded]);

  // return true if authorization is needed
  const checkAuthStatus = React.useCallback((sourceValidation: MapLayerSourceValidation) => {
    const sourceRequireAuth = (sourceValidation.status === MapLayerSourceStatus.RequireAuth);
    const invalidCredentials = (sourceValidation.status === MapLayerSourceStatus.InvalidCredentials);
    if (sourceRequireAuth) {
      if (sourceValidation.authMethod !== undefined) {
        setLayerAuthMethod(sourceValidation.authMethod);
        if (sourceValidation.authMethod === MapLayerAuthType.EsriOAuth2) {
          handleArcGisLogin();
        }
      }
    }
    if (invalidCredentials) {
      setInvalidCredentialsProvided(true);
    } else if (invalidCredentialsProvided) {
      setInvalidCredentialsProvided(false);  // flag reset
    }

    return sourceRequireAuth || invalidCredentials;
  }, [handleArcGisLogin, invalidCredentialsProvided]);

  const updateAttachedLayer = React.useCallback(async (source: MapLayerSource, validation: MapLayerSourceValidation) => {
    const vp = props?.activeViewport;
    if (vp === undefined || source === undefined || layerRequiringCredentialsIdx === undefined)   {
      const error = IModelApp.i18n.translate("mapLayers:Messages.MapLayerAttachMissingViewOrSource");
      const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.MapLayerAttachError", { error, sourceUrl: source.url });
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, msg));
      return true;
    }

    // Layer is already attached,
    vp.displayStyle.changeMapLayerProps({
      subLayers: validation.subLayers,
    }, layerRequiringCredentialsIdx, isOverlay);
    vp.displayStyle.changeMapLayerCredentials(layerRequiringCredentialsIdx, isOverlay, source.userName, source.password);

    // Reset the provider's status
    const provider = vp.getMapLayerImageryProvider(layerRequiringCredentialsIdx, isOverlay);
    if (provider && provider.status !== MapLayerImageryProviderStatus.Valid) {
      provider.status = MapLayerImageryProviderStatus.Valid;
    }

    vp.invalidateRenderPlan();

    // This handler will close the layer source handler, and therefore the MapUrl dialog.
    // don't call it if the dialog needs to remains open.
    onOkResult();

    return true;
  }, [isOverlay, layerRequiringCredentialsIdx, onOkResult, props.activeViewport]);

  // Returns true if no further input is needed from end-user.
  const doAttach = React.useCallback(async (source: MapLayerSource, validation: MapLayerSourceValidation) => {
    const vp = props?.activeViewport;
    if (vp === undefined || source === undefined) {
      const error = IModelApp.i18n.translate("mapLayers:Messages.MapLayerAttachMissingViewOrSource");
      const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.MapLayerAttachError", { error, sourceUrl: source.url });
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, msg));
      return true;
    }

    // Update service settings if storage is available and we are not prompting user for credentials
    if (!settingsStorageDisabled && !props.layerRequiringCredentials) {
      if (!(await MapLayerSettingsService.storeSourceInSettingsService(source, ("Model" === settingsStorage), vp.iModel.contextId!, vp.iModel.iModelId!)))
        return true;
    }
    const layerSettings = source.toLayerSettings(validation.subLayers);
    if (layerSettings) {
      vp.displayStyle.attachMapLayerSettings(layerSettings, isOverlay, undefined);

      const msg = IModelApp.i18n.translate("mapLayers:Messages.MapLayerAttached", { sourceName: source.name, sourceUrl: source.url });
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg));
    } else {
      const msgError = MapLayersUiItemsProvider.i18n.translate("mapLayers:Messages.MapLayerLayerSettingsConversionError");
      const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.MapLayerAttachError", { error: msgError, sourceUrl: source.url });
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, msg));
    }

    vp.invalidateRenderPlan();

    // This handler will close the layer source handler, and therefore the MapUrl dialog.
    // don't call it if the dialog needs to remains open.
    onOkResult();

    return true;
  }, [isOverlay, onOkResult, props.activeViewport, props.layerRequiringCredentials, settingsStorage, settingsStorageDisabled]);

  // Validate the layer source and attempt to attach (or update) the layer.
  // Returns true if no further input is needed from end-user.
  const attemptAttachSource = React.useCallback(async (source: MapLayerSource): Promise<boolean> => {
    try {
      const validation = await source.validateSource(true);

      if (validation.status === MapLayerSourceStatus.Valid) {
        return (layerRequiringCredentialsIdx === undefined ? doAttach(source, validation) : updateAttachedLayer(source, validation) );
      } else if (checkAuthStatus(validation)) {
        return false;
      } else {
        const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.ValidationError");
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, `${msg} ${source.url}`));
        return true;
      }
      return false;
    } catch (error) {
      const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.MapLayerAttachError", { error, sourceUrl: source.url });
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, msg));
      return true;
    }

  }, [checkAuthStatus, doAttach, layerRequiringCredentialsIdx, updateAttachedLayer]);

  const onNameChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setMapName(event.target.value);
  }, [setMapName]);

  const onRadioChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSettingsStorageRadio(event.target.value);
  }, [setSettingsStorageRadio]);

  const onUrlChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setMapUrl(event.target.value);
  }, [setMapUrl]);

  const createSource = React.useCallback(() => {
    let source: MapLayerSource | undefined;
    if (mapUrl && mapName) {
      source = MapLayerSource.fromJSON({
        url: mapUrl,
        name: mapName,
        formatId: mapType,
        userName,
        password});
    }
    return source;
  }, [mapName, mapType, mapUrl, password, userName]);

  const handleOk = React.useCallback(() => {
    const source = createSource();
    if (source === undefined || props.mapLayerSourceToEdit) {

      ModalDialogManager.closeDialog();

      if (source === undefined) {
        // Close the dialog and inform end user something went wrong.
        const msgError = MapLayersUiItemsProvider.i18n.translate("mapLayers:Messages.MapLayerLayerSourceCreationFailed");
        const msg = MapLayersUiItemsProvider.i18n.translate("mapLayers:CustomAttach.MapLayerAttachError", { error: msgError, sourceUrl: mapUrl });
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, msg));
        return;
      }

      // Simply change the source definition in the setting service
      if (props.mapLayerSourceToEdit !== undefined) {
        const vp = props.activeViewport;
        void (async () => {
          if (isSettingsStorageAvailable && vp) {
            if (!(await MapLayerSettingsService.replaceSourceInSettingsService(props.mapLayerSourceToEdit!, source, vp.iModel.contextId!, vp.iModel.iModelId!))) {
              const errorMessage = IModelApp.i18n.translate("mapLayers:Messages.MapLayerEditError", { layerName: props.mapLayerSourceToEdit?.name });
              IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, errorMessage));
              return;
            }

          }
        })();
        return;
      }
    }

    setLayerAttachPending(true);

    // Attach source asynchronously.
    void (async () => {
      try {
        const closeDialog = await attemptAttachSource(source);
        if (isMounted.current) {
          setLayerAttachPending(false);
        }

        // In theory the modal dialog should always get closed by the parent
        // AttachLayerPanel's 'onOkResult' handler.  We close it here just in case.
        if (closeDialog) {
          ModalDialogManager.closeDialog();
        }
      } catch (_error) {
        ModalDialogManager.closeDialog();
      }
    })();

  }, [createSource, props.mapLayerSourceToEdit, props.activeViewport, mapUrl, isSettingsStorageAvailable, attemptAttachSource]);

  // We don't show username/password field by default anymore.
  // We need to validate the source in order to get the authentification type,
  // some of them might requirer explicit username/password fields.
  React.useEffect(() => {

    // Attach source asynchronously.
    void (async () => {
      if (props.layerRequiringCredentials?.url !== undefined && props.layerRequiringCredentials?.name !== undefined) {
        try {

          const source = MapLayerSource.fromJSON({url: props.layerRequiringCredentials.url, name: props.layerRequiringCredentials.name,formatId: props.layerRequiringCredentials.formatId});
          if (source !== undefined) {
            setLayerAttachPending(true);
            const validation = await source.validateSource(true);
            if (isMounted.current) {
              setLayerAttachPending(false);
            }
            checkAuthStatus(validation);
          }
        } catch (_error) {}
      }
    })();

  }, [checkAuthStatus, props.layerRequiringCredentials]);

  const dialogContainer = React.useRef<HTMLDivElement>(null);

  const readyToSave = React.useCallback(() => {
    const credentialsSet = !!userName && !!password;
    return (!!mapUrl && !!mapName)
      && !layerAttachPending
      && (!serverRequireCredentials || credentialsSet)
      && !invalidCredentialsProvided
      && (layerAuthMethod !== MapLayerAuthType.EsriOAuth2  ||  esriOAuth2Succeeded);
  }, [userName, password, mapUrl, mapName, serverRequireCredentials, layerAttachPending, invalidCredentialsProvided, layerAuthMethod, esriOAuth2Succeeded]);

  const buttonCluster = React.useMemo(() => [
    { type: DialogButtonType.OK, onClick: handleOk, disabled: !readyToSave() },
    { type: DialogButtonType.Cancel, onClick: handleCancel },
  ], [readyToSave, handleCancel, handleOk]);

  const handleOnKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === SpecialKey.Enter) {
      if (readyToSave())
        handleOk();
    }
  }, [handleOk, readyToSave]);

  // EsriOAuth2Callback events handler
  React.useEffect(() => {
    const handleEsriOAuth2Callback = (success: boolean, serviceUrl: string) => {
      if (success) {
        setEsriOAuth2Succeeded(true);
        setShowEsriOauth2Popup(false);
        console.log(`MapUrlDialog handled EsriOAuth2Callback event. SUCCESS serviceUrl=${serviceUrl}`);
        setLayerAttachPending(false);
        // try adding the layer the same way if user clicked the ok button
        handleOk();
      } else {
        console.log(`handleEsriOAuth2Callback handled EsriOAuth2Callback event. ERROR`);
      }

    };
    EsriOAuth2.onEsriOAuth2Callback.addListener(handleEsriOAuth2Callback);

    return () => {
      EsriOAuth2.onEsriOAuth2Callback.removeListener(handleEsriOAuth2Callback);
    };
  }, [handleOk]);

  const [showEsriOauth2Popup, setShowEsriOauth2Popup] = React.useState(false);

  const handleEsriOAuth2PopupClose = React.useCallback(() => {
    console.log("MapUrlDialog: PopupDialog was closed");
    setShowEsriOauth2Popup(false);
    setLayerAuthPending(false);
    if (esriOAuth2Succeeded === undefined)
      setEsriOAuth2Succeeded(false);  // indicates there was a failed attempt

  }, [esriOAuth2Succeeded]);

  function renderWarningMessage(): React.ReactNode {
    let node: React.ReactNode;
    let warningMessage: string|undefined;

    // Get the proper warning message
    if (showEsriOauth2Popup) {
      warningMessage = externalLoginWaitingMsg;
    } else if (esriOAuth2Succeeded === false) {
      warningMessage = externalLoginFailedMsg;
    } else if (esriOAuth2Succeeded === true) {
      warningMessage = externalLoginSucceededMsg;
    }else if (invalidCredentialsProvided) {
      warningMessage = invalidCredentialsLabel;
    } else if (serverRequireCredentials && (!userName || !password))  {
      warningMessage = missingCredentialsLabel;
    }

    // Sometimes we want to add an extra node, such as a button
    let extraNode: React.ReactNode;
    if (esriOAuth2Succeeded === false) {
      extraNode = <div>
        <Button onClick={handleArcGisLogin}>{externalLoginTryAgainLabel}</Button>
      </div>;
    }

    if (warningMessage !== undefined) {
      return(
        <div className="map-layer-source-warnMessage">
          <Icon className="map-layer-source-warnMessage-icon" iconSpec="icon-status-warning" />
          <span className="map-layer-source-warnMessage-label">{warningMessage}</span >
          {extraNode}
        </div>);
    } else {
      return (<span className="map-layer-source-placeholder">&nbsp;</span>);
    }
    return node;
  }

  // Use a hook to display the popup.
  // The display of the popup is controlled by the 'showEsriOauth2Popup' state variable.
  useEsriOAuth2Popup(showEsriOauth2Popup, mapUrl, handleEsriOAuth2PopupClose);

  return (
    <div ref={dialogContainer}>
      <Dialog
        className="map-layer-url-dialog"
        title={dialogTitle}
        opened={true}
        resizable={true}
        movable={true}
        modal={true}
        buttonCluster={buttonCluster}
        onClose={handleCancel}
        onEscape={handleCancel}
        minHeight={120}
        maxWidth={600}
        trapFocus={false}
      >
        <div>
          <div className="map-layer-source-url">
            <span className="map-layer-source-label">{typeLabel}</span>
            <Select
              className="map-manager-base-select"
              options={mapTypes}
              value={mapType}
              disabled={props.layerRequiringCredentials !== undefined || props.mapLayerSourceToEdit !== undefined || layerAttachPending || layerAuthPending} onChange={handleMapTypeSelection} />
            <span className="map-layer-source-label">{nameLabel}</span>
            <Input placeholder={nameInputPlaceHolder} onChange={onNameChange} value={mapName} disabled={props.layerRequiringCredentials !== undefined || layerAttachPending || layerAuthPending} />
            <span className="map-layer-source-label">{urlLabel}</span>
            <Input placeholder={urlInputPlaceHolder} onKeyPress={handleOnKeyDown} onChange={onUrlChange} disabled={props.mapLayerSourceToEdit !== undefined || layerAttachPending || layerAuthPending} value={mapUrl} />
            {serverRequireCredentials
             && (layerAuthMethod === MapLayerAuthType.Basic ||  layerAuthMethod === MapLayerAuthType.EsriToken)
             && props.mapLayerSourceToEdit === undefined &&
              <>
                <span className="map-layer-source-label">{userNameLabel}</span>
                <LabeledInput placeholder={serverRequireCredentials ? userNameRequiredLabel : userNameLabel}
                  status={!userName && serverRequireCredentials ? InputStatus.Warning : undefined}
                  disabled={layerAttachPending || layerAuthPending}
                  onChange={onUsernameChange} />

                <span className="map-layer-source-label">{passwordLabel}</span>
                <LabeledInput type="password" placeholder={serverRequireCredentials ? passwordRequiredLabel : passwordLabel}
                  status={!password && serverRequireCredentials ? InputStatus.Warning : undefined}
                  disabled={layerAttachPending || layerAuthPending}
                  onChange={onPasswordChange}
                  onKeyPress={handleOnKeyDown} />
              </>
            }

            {/* Store settings options, not shown when editing a layer */}
            {isSettingsStorageAvailable && <div title={settingsStorageDisabled ? noSaveSettingsWarning : ""}>
              <Radio disabled={settingsStorageDisabled}
                name="settingsStorage" value="Project"
                label={projectSettingsLabel} checked={settingsStorage === "Project"}
                onChange={onRadioChange} />
              <Radio disabled={settingsStorageDisabled}
                name="settingsStorage" value="Model"
                label={modelSettingsLabel} checked={settingsStorage === "Model"}
                onChange={onRadioChange} />
            </div>}
          </div>
        </div>

        {/* Warning message */}
        {renderWarningMessage()}

        {/* Progress bar */}
        {(layerAttachPending || layerAuthPending) &&
          <div className="map-layer-source-progressBar">
            <ProgressBar indeterminate />
          </div>
        }
      </Dialog>
    </div >
  );
}
