/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { Dictionary, IModelStatus } from "@bentley/bentleyjs-core";
import { Cartographic, ImageSource, MapLayerSettings, ServerError } from "@bentley/imodeljs-common";
import { getJson, request, RequestOptions, Response } from "@bentley/itwin-client";
import { IModelApp } from "../../../IModelApp";
import {NotifyMessageDetails, OutputMessagePriority} from "../../../NotificationManager";
import { ScreenViewport } from "../../../Viewport";
import {
  ArcGisErrorCode, ArcGisTokenClientType, ArcGisTokenManager, ArcGisUtilities, ImageryMapTile, ImageryMapTileTree, MapCartoRectangle,
  MapLayerImageryProvider, MapLayerImageryProviderStatus, QuadId,
} from "../../internal";

// eslint-disable-next-line prefer-const
let doToolTips = true;
const scratchQuadId = new QuadId(0, 0, 0);

/** @internal */
export class ArcGISMapLayerImageryProvider extends MapLayerImageryProvider {
  private _maxDepthFromLod = 0;
  private _minDepthFromLod = 0;
  private _copyrightText = "Copyright";
  private _querySupported = false;
  private _tileMapSupported = false;
  private _availabilityMap = new Dictionary<QuadId, boolean>((lhs: QuadId, rhs: QuadId) => lhs.compare(rhs));
  public serviceJson: any;
  constructor(settings: MapLayerSettings) {
    super(settings, false);
  }

  protected override get _filterByCartoRange() { return false; }      // Can't trust footprint ranges (USGS Hydro)

  public override get minimumZoomLevel() { return Math.max(super.minimumZoomLevel, this._minDepthFromLod); }
  public override get maximumZoomLevel() { return this._maxDepthFromLod > 0 ? this._maxDepthFromLod : super.maximumZoomLevel; }

  public uintToString(uintArray: any) {
    return Buffer.from(uintArray).toJSON();

  }

  private async fetchTile(row: number, column: number, zoomLevel: number): Promise<Response | undefined> {
    const tileRequestOptions: RequestOptions = { method: "GET", responseType: "arraybuffer" };
    tileRequestOptions.auth = this.getRequestAuthorization();
    const tileUrl: string = await this.constructUrl(row, column, zoomLevel);
    if (tileUrl.length === 0)
      return undefined;

    return request(this._requestContext, tileUrl, tileRequestOptions);
  }

  public override async loadTile(row: number, column: number, zoomLevel: number): Promise<ImageSource | undefined> {

    if ((this.status === MapLayerImageryProviderStatus.RequireAuth)) {
      return undefined;
    }

    try {
      let tileResponse = await this.fetchTile(row, column, zoomLevel);
      if (tileResponse === undefined)
        return undefined;

      // Check the content type from the response, it might contain an authentication error that need to be reported.
      // Skip if the layer state was already invalid
      if (ArcGisUtilities.hasTokenError(tileResponse)) {

        // Token might have expired, make a second attempt by forcing new token.
        if (this._settings.userName && this._settings.userName.length > 0) {
          ArcGisTokenManager.invalidateToken(this._settings.url, this._settings.userName);
          tileResponse = await this.fetchTile(row, column, zoomLevel);
          if (tileResponse === undefined)
            return undefined;
        }

        // OK at this point, if response still contain a token error, we assume end-user will
        // have to provide credentials again.  Change the layer status so we
        // don't make additional invalid requests..
        if (tileResponse && ArcGisUtilities.hasTokenError(tileResponse)) {
          // Check again layer status, it might have change during await.
          if (this.status === MapLayerImageryProviderStatus.Valid) {
            this.status = MapLayerImageryProviderStatus.RequireAuth;
            this.onStatusChanged.raiseEvent(this);

            // Only report error to end-user if we were previously able to fetch tiles
            // and then encountered an error, otherwise I assume an error was already reported
            // through the source validation process.
            if (this._hasSuccessfullyFetchedTile) {
              const msg = IModelApp.i18n.translate("iModelJs:MapLayers.Messages.LoadTileTokenError", { layerName: this._settings.name });
              IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Warning, msg));
            }

          }

          return undefined;
        }
      }

      if (!this._hasSuccessfullyFetchedTile) {
        this._hasSuccessfullyFetchedTile = true;
      }
      return this.getImageFromTileResponse(tileResponse, zoomLevel);
    } catch (error) {
      return undefined;
    }
  }
  protected override _testChildAvailability(tile: ImageryMapTile, resolveChildren: () => void) {
    if (!this._tileMapSupported || tile.quadId.level < Math.max(4, this.minimumZoomLevel)) {
      resolveChildren();
      return;
    }

    const quadId = tile.quadId;
    let availability;
    if (undefined !== (availability = this._availabilityMap.get(tile.quadId))) {
      if (availability)
        resolveChildren();

      return;
    }

    const row = quadId.row * 2;
    const column = quadId.column * 2;
    const level = quadId.level + 1;
    const queryDim = Math.min(1 << level, 32), queryDimHalf = queryDim / 2;
    const queryRow = Math.max(0, row - queryDimHalf);
    const queryColumn = Math.max(0, column - queryDimHalf);

    getJson(this._requestContext, `${this._settings.url}/tilemap/${level}/${queryRow}/${queryColumn}/${queryDim}/${queryDim}?f=json`).then((json) => {
      availability = true;
      if (Array.isArray(json.data)) {
        let index = 0;
        const data = json.data;
        for (let iCol = 0; iCol < queryDim; iCol++) {
          for (let iRow = 0; iRow < queryDim; iRow++) {
            scratchQuadId.level = quadId.level;
            scratchQuadId.column = (queryColumn + iCol) / 2;
            scratchQuadId.row = (queryRow + iRow) / 2;
            if (0 === quadId.compare(scratchQuadId))
              availability = data[index];
            this._availabilityMap.set(scratchQuadId, data[index++]);
          }
        }
      }
      if (availability)
        resolveChildren();

    }).catch((_error) => {
      resolveChildren();
    });
  }

  private isEpsg3857Compatible(tileInfo: any) {
    if (tileInfo.spatialReference?.latestWkid !== 3857 || !Array.isArray(tileInfo.lods))
      return false;

    const zeroLod = tileInfo.lods[0];
    return zeroLod.level === 0 && Math.abs(zeroLod.resolution - 156543.03392800014) < .001;
  }

  public override async initialize(): Promise<void> {
    const json = await ArcGisUtilities.getServiceJson(this._settings.url, this.getRequestAuthorization());
    if (json === undefined)
      throw new ServerError(IModelStatus.ValidationFailed, "");

    if (json !== undefined) {
      this.serviceJson = json;
      if (json.capabilities) {
        this._querySupported = json.capabilities.indexOf("Query") >= 0;
        this._tileMapSupported = json.capabilities.indexOf("Tilemap") >= 0;
      }
      if (json.copyrightText) this._copyrightText = json.copyrightText;
      if (false !== (this._usesCachedTiles = json.tileInfo !== undefined && this.isEpsg3857Compatible(json.tileInfo))) {
        if (json.maxScale !== undefined && json.maxScale !== 0 && Array.isArray(json.tileInfo.lods)) {
          for (; this._maxDepthFromLod < json.tileInfo.lods.length && json.tileInfo.lods[this._maxDepthFromLod].scale > json.maxScale; this._maxDepthFromLod++)
            ;
        }
      }
      const footprintJson = await ArcGisUtilities.getFootprintJson(this._settings.url, this.getRequestAuthorization());
      if (undefined !== footprintJson && undefined !== footprintJson.featureCollection && Array.isArray(footprintJson.featureCollection.layers)) {
        for (const layer of footprintJson.featureCollection.layers) {
          if (layer.layerDefinition && layer.layerDefinition.extent) {
            this.cartoRange = MapCartoRectangle.createFromDegrees(layer.layerDefinition.extent.xmin, layer.layerDefinition.extent.ymin, layer.layerDefinition.extent.xmax, layer.layerDefinition.extent.ymax);
            break;
          }
        }
      }

      // Read minLOD if available
      if (json.minLOD !== undefined) {
        const minLod = parseInt(json.minLOD, 10);
        if (!Number.isNaN(minLod)) {
          this._minDepthFromLod = minLod;
        }
      }
    }
  }

  public override getLogo(_vp: ScreenViewport) {
    return IModelApp.makeLogoCard({ heading: "ArcGIS", notice: this._copyrightText });
  }

  public override async getToolTip(strings: string[], quadId: QuadId, carto: Cartographic, tree: ImageryMapTileTree): Promise<void> {
    await super.getToolTip(strings, quadId, carto, tree);
    if (!doToolTips)
      return;

    if (!this._querySupported)
      return;

    const stringSet = new Set<string>();
    const bboxString = this.getEPSG3857ExtentString(quadId.row, quadId.column, quadId.level);
    const x = this.getEPSG3857X(carto.longitudeDegrees);
    const y = this.getEPSG3857Y(carto.latitudeDegrees);
    const tmpUrl = `${this._settings.url}/identify?f=json&tolerance=1&returnGeometry=false&sr=3857&imageDisplay=${this.tileSize},${this.tileSize},96&layers=${this.getLayerString("visible")}&geometry=${x},${y}&geometryType=esriGeometryPoint&mapExtent=${bboxString}`;
    const url = await this.appendSecurityToken(tmpUrl);

    let json = await getJson(this._requestContext, url);
    if (json?.error?.code === ArcGisErrorCode.TokenRequired || json?.error?.code === ArcGisErrorCode.InvalidToken) {
      // Token might have expired, make a second attempt by forcing new token.
      if (this._settings.userName && this._settings.userName.length > 0) {
        ArcGisTokenManager.invalidateToken(this._settings.url, this._settings.userName);
        json = await getJson(this._requestContext, url);
      }

      // OK at this point, if response still contain a token error, we assume end-user will
      // have to provide credentials again.  Change the layer status so we
      // don't make additional invalid requests..
      if (json?.error?.code === ArcGisErrorCode.TokenRequired || json?.error?.code === ArcGisErrorCode.InvalidToken) {
        // Check again layer status, it might have change during await.
        if (this.status === MapLayerImageryProviderStatus.Valid) {
          this.status = MapLayerImageryProviderStatus.RequireAuth;
          const msg = IModelApp.i18n.translate("iModelJs:MapLayers.Messages.FetchTooltipTokenError", { layerName: this._settings.name });
          IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Warning, msg));
        }

        return;
      }
    }

    if (json && Array.isArray(json.results)) {
      for (const result of json.results) {
        if (result.attributes !== undefined && result.attributes[result.displayFieldName] !== undefined) {
          const thisString = `${result.displayFieldName}: ${result.attributes[result.displayFieldName]}`;
          if (!stringSet.has(thisString)) {
            strings.push(thisString);
            stringSet.add(thisString);
          }
        }
      }
    }
  }
  protected getLayerString(prefix = "show"): string {
    const layers = new Array<string>();
    this._settings.subLayers.forEach((subLayer) => { if (this._settings.isSubLayerVisible(subLayer)) layers.push(subLayer.idString); });
    return `${prefix}: ${layers.join(",")} `;
  }
  // construct the Url from the desired Tile
  public async constructUrl(row: number, column: number, zoomLevel: number): Promise<string> {
    let tmpUrl;
    if (this._usesCachedTiles) {
      tmpUrl = `${this._settings.url}/tile/${zoomLevel}/${row}/${column} `;
    } else {
      const bboxString = `${this.getEPSG3857ExtentString(row, column, zoomLevel)}&bboxSR=3857`;
      tmpUrl = `${this._settings.url}/export?bbox=${bboxString}&size=${this.tileSize},${this.tileSize}&layers=${this.getLayerString()}&format=png&transparent=${this.transparentBackgroundString}&f=image&sr=3857&imagesr=3857`;
    }
    return this.appendSecurityToken(tmpUrl);
  }

  // construct the Url from the desired Tile
  private async appendSecurityToken(url: string): Promise<string> {
    // Append security token if required
    let tokenParam = "";
    if (this._settings.userName && this._settings.password) {
      try {
        const token = await ArcGisTokenManager.getToken(this._settings.url, this._settings.userName, this._settings.password,
          {
            client: ArcGisTokenClientType.referer,
          });
        if (token?.token)
          tokenParam = `&token=${token.token}`;
      } catch {
      }
    }
    return `${url}${tokenParam}`;
  }
}
