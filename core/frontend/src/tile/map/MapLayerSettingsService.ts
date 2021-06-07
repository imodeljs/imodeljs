/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { MapLayerSource } from "./MapLayerSources";
import { AuthorizedFrontendRequestContext } from "../../FrontendRequestContext";
import { IModelApp } from "../../IModelApp";
import { SettingsMapResult, SettingsResult, SettingsStatus } from "@bentley/product-settings-client";
import { NotifyMessageDetails, OutputMessagePriority } from "../../NotificationManager";
import { BeEvent, GuidString } from "@bentley/bentleyjs-core";

/** @internal */
export interface MapLayerSetting {
  url: string;
  name: string;
  formatId: string;
  transparentBackground: boolean | undefined;
}

/** @internal */
export enum MapLayerSourceChangeType {
  Added = 0,
  Removed = 1,
  Replaced = 2,
}

/** @internal */
export class MapLayerSettingsService {
  // Event raised whenever a source is added, replaced or removed:
  // changeType : Type of changed occurred.
  // oldSource : Source that was removed or replaced.
  // newSource : Source that was added or replacement of oldSource.
  public static readonly onLayerSourceChanged = new BeEvent<(changeType: MapLayerSourceChangeType, oldSource?: MapLayerSource, newSource?: MapLayerSource) => void>(); // Used to notify the frontend that it needs to update its list of available layers

  /**
   * Store the source in the settings service. Returns false if the settings object would override some other settings object in a larger scope i.e. storing settings on model when
   * a project setting exists with same name or map layer url.
   * @param source source to be stored on the setting service
   * @param storeOnIModel if true store the settings object on the model, if false store it on the project
   */
  public static async storeSourceInSettingsService(source: MapLayerSource, storeOnIModel: boolean, projectId: GuidString, iModelId: GuidString): Promise<boolean> {
    const requestContext = await AuthorizedFrontendRequestContext.create();
    const sourceJSON = source.toJSON();
    const mapLayerSetting: MapLayerSetting = {
      url: sourceJSON.url,
      name: sourceJSON.name,
      formatId: sourceJSON.formatId,

      transparentBackground: sourceJSON.transparentBackground,
    };
    const result: boolean = await MapLayerSettingsService.deleteOldSettings(requestContext, sourceJSON.url, sourceJSON.name, projectId, iModelId, storeOnIModel);
    requestContext.enter();
    if (result) {
      await IModelApp.settings.saveSharedSetting(requestContext, mapLayerSetting, MapLayerSettingsService.SourceNamespace, sourceJSON.name, true,
        projectId, storeOnIModel ? iModelId : undefined);
      requestContext.enter();
      MapLayerSettingsService.onLayerSourceChanged.raiseEvent(MapLayerSourceChangeType.Added, undefined, MapLayerSource.fromJSON(mapLayerSetting));
      return true;
    } else {
      return false;
    }

  }

  public static async replaceSourceInSettingsService(oldSource: MapLayerSource, newSource: MapLayerSource, projectId: GuidString, iModelId: GuidString): Promise<boolean> {
    const requestContext = await AuthorizedFrontendRequestContext.create();

    let storeOnIModel = false;
    let result: SettingsResult = new SettingsResult(SettingsStatus.UnknownError);
    requestContext.enter();
    result = await IModelApp.settings.deleteSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, oldSource.name, true, projectId, iModelId);
    requestContext.enter();

    // Make a second attempt at project level
    if (result.status === SettingsStatus.SettingNotFound) {
      result = await IModelApp.settings.deleteSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, oldSource.name, true, projectId, undefined);
      requestContext.enter();
      if (result.status === SettingsStatus.Success) {
        storeOnIModel = true;
      }
    }

    if (result.status === SettingsStatus.Success) {
      const mapLayerSetting: MapLayerSetting = {
        url: newSource.url,
        name: newSource.name,
        formatId: newSource.formatId,
        transparentBackground: newSource.transparentBackground,
      };

      await IModelApp.settings.saveSharedSetting(requestContext, mapLayerSetting, MapLayerSettingsService.SourceNamespace,
        newSource.name, true, projectId, storeOnIModel ? iModelId : undefined);
      requestContext.enter();
      MapLayerSettingsService.onLayerSourceChanged.raiseEvent(MapLayerSourceChangeType.Replaced, oldSource, newSource);
      return true;
    } else {
      return false;
    }
  }

  public static async deleteSharedSettings(source: MapLayerSource, projectId: GuidString, iModelId: GuidString): Promise<boolean> {
    let result: SettingsResult = new SettingsResult(SettingsStatus.UnknownError);
    const requestContext = await AuthorizedFrontendRequestContext.create();
    requestContext.enter();
    result = await IModelApp.settings.deleteSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, source.name, true, projectId, iModelId);
    requestContext.enter();

    // Make a second attempt at project level
    if (result.status === SettingsStatus.SettingNotFound) {
      result = await IModelApp.settings.deleteSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, source.name, true, projectId, undefined);
      requestContext.enter();
    }

    if (result.status === SettingsStatus.Success) {
      MapLayerSettingsService.onLayerSourceChanged.raiseEvent(MapLayerSourceChangeType.Removed, source, undefined);

    }
    return result.status === SettingsStatus.Success;
  }

  // This method prevents users from overwriting project settings with model settings. If setting to be added is in same scope as the setting that it collides with
  // then it can be overwritten. This method knows scope of setting to be added is model if storeOnIModel is true
  // returns false if we should not save the setting the user added because we output an error to the user here saying it cannot be done
  private static async deleteOldSettings(requestContext: AuthorizedFrontendRequestContext, url: string, name: string, projectId: GuidString, iModelId: GuidString, storeOnIModel: boolean): Promise<boolean> {
    requestContext.enter();
    const settingFromName = await IModelApp.settings.getSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, name, true, projectId, undefined);
    requestContext.enter();
    if (settingFromName.setting && storeOnIModel) {
      const errorMessage = IModelApp.i18n.translate("mapLayers:CustomAttach.LayerExistsAsProjectSetting", { layer: settingFromName.setting.name });
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, errorMessage));
      return false;
    } else if (settingFromName.setting) {
      const infoMessage = IModelApp.i18n.translate("mapLayers:CustomAttach.LayerExistsOverwriting", { layer: settingFromName.setting.name });
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, infoMessage));
      await IModelApp.settings.deleteSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, settingFromName.setting.name, true, projectId, undefined);
      requestContext.enter();
    }

    const settingFromUrl = await MapLayerSettingsService.getSettingFromUrl(requestContext, url, projectId, undefined); // check if setting with url already exists, if it does, delete it
    requestContext.enter();
    if (settingFromUrl && storeOnIModel) {
      const errorMessage = IModelApp.i18n.translate("mapLayers:CustomAttach.LayerWithUrlExistsAsProjectSetting", { url: settingFromUrl.url, name: settingFromUrl.name });
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, errorMessage));
      return false;
    } else if (settingFromUrl) {
      const infoMessage = IModelApp.i18n.translate("mapLayers:CustomAttach.LayerWithUrlExistsOverwriting", { url: settingFromUrl.url, oldName: settingFromUrl.name, newName: name });
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, infoMessage));
      await IModelApp.settings.deleteSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, settingFromUrl.name, true, projectId, undefined);
      requestContext.enter();
    }

    if (iModelId) { // delete any settings on model so user can update them if theres collisions
      const settingOnIModelFromName = await IModelApp.settings.getSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, name, true, projectId, iModelId);
      requestContext.enter();
      const settingFromUrlOnIModel = await MapLayerSettingsService.getSettingFromUrl(requestContext, url, projectId, iModelId);
      requestContext.enter();
      if (settingOnIModelFromName.setting) {
        const infoMessage = IModelApp.i18n.translate("mapLayers:CustomAttach.LayerExistsOverwriting", { layer: settingOnIModelFromName.setting.name });
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, infoMessage));
        await IModelApp.settings.deleteSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, settingOnIModelFromName.setting.name, true, projectId, iModelId);
        requestContext.enter();
      }
      if (settingFromUrlOnIModel) {
        const infoMessage = IModelApp.i18n.translate("mapLayers:CustomAttach.LayerWithUrlExistsOverwriting", { url: settingFromUrlOnIModel.url, oldName: settingFromUrlOnIModel.name, newName: name });
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, infoMessage));
        await IModelApp.settings.deleteSharedSetting(requestContext, MapLayerSettingsService.SourceNamespace, settingFromUrlOnIModel.name, true, projectId, iModelId);
        requestContext.enter();
      }
    }
    return true;
  }
  public static async getSettingFromUrl(requestContext: AuthorizedFrontendRequestContext, url: string, projectId: string, iModelId?: string): Promise<MapLayerSetting | undefined> {
    requestContext.enter();
    const settingResponse = await IModelApp.settings.getSharedSettingsByNamespace(requestContext, MapLayerSettingsService.SourceNamespace, true, projectId, iModelId);
    requestContext.enter();
    let savedMapLayer;
    settingResponse.settingsMap?.forEach((savedLayer: any) => {
      if (savedLayer.url === url) {
        savedMapLayer = savedLayer;
      }
    });
    return savedMapLayer;
  }
  /**
   * Grabs any MapLayerSources in the user's settings, the shared settings on the iModel, and the shared settings on the project.
   * @param projectId id of the project
   * @param iModelId id of the iModel
   * @throws error if any of the calls to grab settings fail.
   */
  public static async getSourcesFromSettingsService(projectId: GuidString, iModelId: GuidString): Promise<MapLayerSource[]> {
    const requestContext = await AuthorizedFrontendRequestContext.create();
    const userResultByProjectPromise = IModelApp.settings.getUserSettingsByNamespace(
      requestContext,
      MapLayerSettingsService.SourceNamespace,
      true,
      projectId,
      undefined,
    );
    const userResultByImodelPromise = IModelApp.settings.getUserSettingsByNamespace(
      requestContext,
      MapLayerSettingsService.SourceNamespace,
      true,
      projectId,
      iModelId,
    );
    const sharedResultByImodelPromise = IModelApp.settings.getSharedSettingsByNamespace(requestContext,
      MapLayerSettingsService.SourceNamespace,
      true,
      projectId,
      iModelId);
    const sharedResultByProjectPromise = IModelApp.settings.getSharedSettingsByNamespace(requestContext,
      MapLayerSettingsService.SourceNamespace,
      true,
      projectId,
      undefined);
    const settingsMapArray: SettingsMapResult[] = await Promise.all([userResultByProjectPromise, userResultByImodelPromise, sharedResultByImodelPromise, sharedResultByProjectPromise]);
    requestContext.enter();
    const userResultByProject = settingsMapArray[0];
    const userResultByImodel = settingsMapArray[1];
    const sharedResultByImodel = settingsMapArray[2];
    const sharedResultByProject = settingsMapArray[3];
    if (userResultByProject.status !== SettingsStatus.Success || !userResultByProject.settingsMap) {
      throw new Error(IModelApp.i18n.translate("mapLayers:CustomAttach.ErrorRetrieveUserProject", { errorMessage: userResultByProject.errorMessage }));
    }
    if (userResultByImodel.status !== SettingsStatus.Success || !userResultByImodel.settingsMap) {
      throw new Error(IModelApp.i18n.translate("mapLayers:CustomAttach.ErrorRetrieveUserModel", { errorMessage: userResultByImodel.errorMessage }));
    }

    if (sharedResultByImodel.status !== SettingsStatus.Success || !sharedResultByImodel.settingsMap) {
      throw new Error(IModelApp.i18n.translate("mapLayers:CustomAttach.ErrorRetrieveSharedModel", { errorMessage: sharedResultByImodel.errorMessage }));
    }
    if (sharedResultByProject.status !== SettingsStatus.Success || !sharedResultByProject.settingsMap) {
      throw new Error(IModelApp.i18n.translate("mapLayers:CustomAttach.ErrorRetrieveSharedProject", { errorMessage: sharedResultByProject.errorMessage }));
    }

    const savedMapLayerSources: MapLayerSource[] = [];
    for (const settingsMapResult of settingsMapArray) {
      settingsMapResult.settingsMap!.forEach((savedLayer: any) => {
        const mapLayerSource = MapLayerSource.fromJSON(savedLayer as MapLayerSetting);
        if (mapLayerSource)
          savedMapLayerSources.push(mapLayerSource);
      });
    }
    return savedMapLayerSources;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  public static get SourceNamespace() {
    return "MapLayerSource-SettingsService";
  }
}
