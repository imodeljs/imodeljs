/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @module Views */

import { compareStrings } from "@bentley/bentleyjs-core";
import { Point2d } from "@bentley/geometry-core";
import { BackgroundMapProps, BackgroundMapSettings, BackgroundMapType, MapLayerSettings, MapSubLayerProps } from "@bentley/imodeljs-common";
import { getJson, RequestBasicCredentials } from "@bentley/itwin-client";
import { FrontendRequestContext } from "../../FrontendRequestContext";
import { IModelApp } from "../../IModelApp";
import { IModelConnection } from "../../IModelConnection";
import { ArcGisUtilities, MapCartoRectangle, MapLayerSourceValidation } from "../internal";
import { MapLayerSettingsService } from "./MapLayerSettingsService";
import { NotifyMessageDetails, OutputMessagePriority } from "../../NotificationManager";

/** @internal */
export enum MapLayerSourceStatus {
  Valid,
  InvalidCredentials,
  InvalidFormat,
  InvalidTileTree,
  InvalidUrl,
  RequireAuth,
}

/** JSON representation of a map layer source.
 * @internal
 */
interface MapLayerSourceProps
{
  /** Identifies the map layers source. Defaults to 'WMS'. */
  formatId?: string;
  /** Name */
  name: string;
  /** URL */
  url: string;
  /** True to indicate background is transparent.  Defaults to 'true'. */
  transparentBackground?: boolean;
  /** Is a base layer.  Defaults to 'false'. */
  isBase?: boolean;
  /** Indicate if this source definition should be used as a base map. Defaults to false. */
  baseMap?: boolean;
  /** UserName */
  userName?: string;
  /** Password */
  password?: string;
}

/** A source for map layers.  These may be catalogued for convenient use by users or applications.
 * @internal
 */
export class MapLayerSource  {
  public formatId: string;
  public name: string;
  public url: string;
  public baseMap = false;
  public transparentBackground?: boolean;
  public userName?: string;
  public password?: string;

  private constructor(formatId = "WMS", name: string, url: string, baseMap = false, transparentBackground = true, userName?: string, password?: string) {
    this.formatId = formatId;
    this.name = name;
    this.url = url;
    this.baseMap = baseMap;
    this.transparentBackground = transparentBackground;
    this.userName = userName;
    this.password = password;
  }

  public static fromJSON(json: MapLayerSourceProps): MapLayerSource | undefined {
    if (json === undefined)
      return undefined;

    return new MapLayerSource(json.formatId, json.name, json.url, json.baseMap, json.transparentBackground, json.userName, json.password);
  }

  public async validateSource(ignoreCache?: boolean): Promise<MapLayerSourceValidation> {
    return IModelApp.mapLayerFormatRegistry.validateSource(this.formatId, this.url, this.getCredentials(), ignoreCache);
  }
  public static fromBackgroundMapProps(props: BackgroundMapProps) {
    const settings = BackgroundMapSettings.fromJSON(props);
    if (undefined !== settings) {
      const layerSettings = MapLayerSettings.fromMapSettings(settings);
      if (undefined !== layerSettings) {
        const source = MapLayerSource.fromJSON(layerSettings);
        source!.baseMap = true;
        return source;
      }
    }
    return undefined;
  }
  public toJSON() {
    return { url: this.url, name: this.name, formatId: this.formatId, transparentBackground: this.transparentBackground };
  }

  public toLayerSettings(subLayers?: MapSubLayerProps[]): MapLayerSettings | undefined {
    // When MapLayerSetting is created from a MapLayerSource, sub-layers and credentials need to be set separately.
    const layerSettings = MapLayerSettings.fromJSON({...this, subLayers });
    layerSettings?.setCredentials(this.userName, this.password);
    return layerSettings;
  }

  private getCredentials(): RequestBasicCredentials | undefined {
    return this.userName && this.password ? { user: this.userName, password: this.password } : undefined;
  }
}

/** A collection of [[MapLayerSource]] objects.
 * @internal
 */

export class MapLayerSources {
  private static _instance?: MapLayerSources;
  private constructor(private _sources: MapLayerSource[]) { }

  public static getInstance() {return MapLayerSources._instance;}

  public findByName(name: string, baseMap: boolean = false): MapLayerSource | undefined {
    const nameTest = name.toLowerCase();
    for (const source of this._sources)
      if (source.baseMap === baseMap && source.name.toLowerCase().indexOf(nameTest) !== -1)
        return source;

    return undefined;
  }
  public get layers(): MapLayerSource[] {
    const layers = new Array<MapLayerSource>();
    this._sources.forEach((source) => { if (!source.baseMap) layers.push(source); });
    return layers;
  }
  public get allSource() { return this._sources; }
  public get bases(): MapLayerSource[] {
    const layers = new Array<MapLayerSource>();
    this._sources.forEach((source) => { if (source.baseMap) layers.push(source); });
    return layers;
  }

  /**
   *  This function fetch the USG map layer sources. Those are free and publicly available but not worldwide.
   *  Needs to validate the location of the user before fetching it.
   */
  private static async getUSGSSources(): Promise<MapLayerSource[]> {
    const mapLayerSources: MapLayerSource[] = [];
    (await ArcGisUtilities.getServiceDirectorySources("https://basemap.nationalmap.gov/arcgis/rest/services")).forEach((source) => mapLayerSources.push(source));
    (await ArcGisUtilities.getServiceDirectorySources("https://index.nationalmap.gov/arcgis/rest/services")).forEach((source) => mapLayerSources.push(source));
    (await ArcGisUtilities.getServiceDirectorySources("https://hydro.nationalmap.gov/arcgis/rest/services")).forEach((source) => mapLayerSources.push(source));
    (await ArcGisUtilities.getServiceDirectorySources("https://carto.nationalmap.gov/arcgis/rest/services")).forEach((source) => mapLayerSources.push(source));
    (await ArcGisUtilities.getServiceDirectorySources("https://elevation.nationalmap.gov/arcgis/rest/services")).forEach((source) => mapLayerSources.push(source));
    return mapLayerSources;
  }

  private static getBingMapLayerSource(): MapLayerSource[] {
    const mapLayerSources: MapLayerSource[] = [];
    mapLayerSources.push(MapLayerSource.fromBackgroundMapProps({ providerName: "BingProvider", providerData: { mapType: BackgroundMapType.Street } })!);
    mapLayerSources.push(MapLayerSource.fromBackgroundMapProps({ providerName: "BingProvider", providerData: { mapType: BackgroundMapType.Aerial } })!);
    mapLayerSources.push(MapLayerSource.fromBackgroundMapProps({ providerName: "BingProvider", providerData: { mapType: BackgroundMapType.Hybrid } })!);
    return mapLayerSources;
  }

  private static getMapBoxLayerSource(): MapLayerSource[] {
    const mapLayerSources: MapLayerSource[] = [];
    mapLayerSources.push(MapLayerSource.fromBackgroundMapProps({ providerName: "MapBoxProvider", providerData: { mapType: BackgroundMapType.Street } })!);
    mapLayerSources.push(MapLayerSource.fromBackgroundMapProps({ providerName: "MapBoxProvider", providerData: { mapType: BackgroundMapType.Aerial } })!);
    mapLayerSources.push(MapLayerSource.fromBackgroundMapProps({ providerName: "MapBoxProvider", providerData: { mapType: BackgroundMapType.Hybrid } })!);
    return mapLayerSources;
  }

  /**
 *  This function fetch the Disco map layer sources. Those sources are for Europe but not very reliable.
 *  Needs to validate the location of the user before fetching it.
 */
  private static async getDiscoSources(): Promise<MapLayerSource[]> {
    const mapLayerSources: MapLayerSource[] = [];
    (await ArcGisUtilities.getServiceDirectorySources("https://land.discomap.eea.europa.eu/arcgis/rest/services")).forEach((source) => mapLayerSources.push(source));
    return mapLayerSources;
  }

  public static async create(iModel?: IModelConnection, queryForPublicSources = false, addMapBoxSources = false): Promise<MapLayerSources> {
    if (!queryForPublicSources && MapLayerSources._instance)
      return MapLayerSources._instance;

    if (!iModel)
      iModel = IModelApp.viewManager.selectedView ? IModelApp.viewManager.selectedView.iModel : undefined;

    let sourceRange = MapCartoRectangle.create();
    if (iModel) {
      const projectCenter = iModel.projectExtents.localXYZToWorld(.5, .5, .5)!;
      const cartoCenter = iModel.spatialToCartographicFromEcef(projectCenter);
      const globeRange = MapCartoRectangle.create();
      const nearDelta = Point2d.create(globeRange.xLength() / 100, globeRange.yLength() / 100);
      sourceRange = MapCartoRectangle.create(cartoCenter.longitude - nearDelta.x, cartoCenter.latitude - nearDelta.y, cartoCenter.longitude + nearDelta.x, cartoCenter.latitude + nearDelta.y);
    }

    const sources = new Array<MapLayerSource>();
    const urlSet = new Set<string>();
    const addSource = ((source: MapLayerSource) => {
      if (!urlSet.has(source.url)) {
        sources.push(source);
        urlSet.add(source.url);
      }
    });

    this.getBingMapLayerSource().forEach((source) => {
      addSource(source);
    });

    if (addMapBoxSources) {
      this.getMapBoxLayerSource().forEach((source) => {
        addSource(source);
      });
    }

    if (queryForPublicSources) {
      const requestContext = new FrontendRequestContext();
      const sourcesJson = await getJson(requestContext, "assets/MapLayerSources.json");

      for (const sourceJson of sourcesJson) {
        const source = MapLayerSource.fromJSON(sourceJson);
        if (source)
          addSource(source);
      }

      (await ArcGisUtilities.getSourcesFromQuery(sourceRange)).forEach((queriedSource) => addSource(queriedSource));
    }

    if (iModel && iModel.contextId && iModel.iModelId) {
      try {
        (await MapLayerSettingsService.getSourcesFromSettingsService(iModel.contextId, iModel.iModelId)).forEach((source) => addSource(source));
      } catch (err) {
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, IModelApp.i18n.translate("mapLayers:CustomAttach.ErrorLoadingLayers"), err.toString()));
      }
    }

    sources.sort((a: MapLayerSource, b: MapLayerSource) => compareStrings(a.name.toLowerCase(), b.name.toLowerCase()));

    const mapLayerSources = new MapLayerSources(sources);
    MapLayerSources._instance = mapLayerSources;

    return mapLayerSources;
  }
  public static async addSourceToMapLayerSources(mapLayerSource?: MapLayerSource): Promise<MapLayerSources | undefined> {
    if (!MapLayerSources._instance || !mapLayerSource) {
      return undefined;
    }
    MapLayerSources._instance._sources = MapLayerSources._instance._sources.filter((source) => {
      return !(source.name === mapLayerSource.name || source.url === mapLayerSource.url);
    });

    MapLayerSources._instance._sources.push(mapLayerSource);
    MapLayerSources._instance._sources.sort((a: MapLayerSource, b: MapLayerSource) => compareStrings(a.name.toLowerCase(), b.name.toLowerCase()));
    return MapLayerSources._instance;
  }

  public static removeLayerByName(name: string): boolean {
    if (!MapLayerSources._instance) {
      return false;
    }

    // For now we only rely on the name
    const lengthBeforeRemove = MapLayerSources._instance._sources.length;
    MapLayerSources._instance._sources = MapLayerSources._instance._sources.filter((source) => {
      return (source.name !== name);
    });
    return (lengthBeforeRemove !== MapLayerSources._instance._sources.length);
  }
}
