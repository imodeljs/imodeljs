/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @module Views */

import { assert } from "@bentley/bentleyjs-core";
import { MapLayerAuthType, MapLayerKey, MapLayerSettings, MapSubLayerProps } from "@bentley/imodeljs-common";
import { IModelApp } from "../../IModelApp";
import { IModelConnection } from "../../IModelConnection";
import { ImageryMapLayerTreeReference, internalMapLayerImageryFormats, MapLayerImageryProvider, MapLayerSourceStatus, MapLayerTileTreeReference } from "../internal";
import { RequestBasicCredentials } from "@bentley/itwin-client";

/** @internal */
export class MapLayerFormat {
  public static formatId: string;
  public static register() { IModelApp.mapLayerFormatRegistry.register(this); }
  public static createImageryProvider(_settings: MapLayerSettings): MapLayerImageryProvider | undefined { assert(false); }
  public static createMapLayerTree(_layerSettings: MapLayerSettings, _layerIndex: number, _iModel: IModelConnection): MapLayerTileTreeReference | undefined {
    assert(false);
    return undefined;
  }
  public static async validateSource(_url: string, _credentials?: RequestBasicCredentials, _ignoreCache?: boolean): Promise<MapLayerSourceValidation> { return { status: MapLayerSourceStatus.Valid }; }
}

/** @internal */
export type MapLayerFormatType = typeof MapLayerFormat;

/** @internal */
export interface MapLayerSourceValidation {
  status: MapLayerSourceStatus;
  subLayers?: MapSubLayerProps[];
  authMethod?: MapLayerAuthType;
}

/**
 * Options to be passed to the IModelApp on startup which contain access keys for various layer formats
 * @beta
 */
export interface MapLayerOptions {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  AzureMaps?: MapLayerKey;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  MapBoxImagery?: MapLayerKey;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  BingMaps?: MapLayerKey;
  [format: string]: MapLayerKey | undefined;
}

/** @internal */
export class MapLayerFormatRegistry {
  private _configOptions: MapLayerOptions;
  constructor(opts: MapLayerOptions) {
    this._configOptions = opts;
    internalMapLayerImageryFormats.forEach((format) => this.register(format));
  }
  private _formats = new Map<string, MapLayerFormatType>();
  public register(formatClass: MapLayerFormatType) {
    if (formatClass.formatId.length === 0)
      return; // must be an abstract class, ignore it

    this._formats.set(formatClass.formatId, formatClass);
  }
  public get configOptions(): MapLayerOptions {
    return this._configOptions;
  }
  public createImageryMapLayerTree(layerSettings: MapLayerSettings, layerIndex: number, iModel: IModelConnection): ImageryMapLayerTreeReference | undefined {
    const format = this._formats.get(layerSettings.formatId);
    return format !== undefined ? (format.createMapLayerTree(layerSettings, layerIndex, iModel) as ImageryMapLayerTreeReference) : undefined;
  }
  public createImageryProvider(layerSettings: MapLayerSettings): MapLayerImageryProvider | undefined {
    const format = this._formats.get(layerSettings.formatId);
    if (this._configOptions[layerSettings.formatId] !== undefined) {
      const keyValuePair = this._configOptions[layerSettings.formatId]!;
      const key: MapLayerKey = { key: keyValuePair.key, value: keyValuePair.value };
      layerSettings = layerSettings.clone({ accessKey: key });
    }
    return (format === undefined) ? undefined : format.createImageryProvider(layerSettings);
  }
  public async validateSource(formatId: string, url: string, credentials?: RequestBasicCredentials, ignoreCache?: boolean): Promise<MapLayerSourceValidation> {
    const format = this._formats.get(formatId);
    return (format === undefined) ? { status: MapLayerSourceStatus.InvalidFormat } : format.validateSource(url, credentials, ignoreCache);
  }
}
