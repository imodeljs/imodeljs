/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */
import { IModelStatus } from "@bentley/bentleyjs-core";
import { Point2d } from "@bentley/geometry-core";
import { Cartographic, MapLayerSettings, ServerError } from "@bentley/imodeljs-common";

import {
  ImageryMapTileTree, MapCartoRectangle, MapLayerImageryProvider, MapLayerImageryProviderStatus, QuadId, WmsCapabilities,
  WmsCapability, WmsUtilities,
} from "../../internal";

// eslint-disable-next-line prefer-const
let doToolTips = true;

const scratchPoint2d = Point2d.createZero();

/** @internal */
export class WmsMapLayerImageryProvider extends MapLayerImageryProvider {
  private _capabilities?: WmsCapabilities;
  private _allLayersRange?: MapCartoRectangle;
  private _subLayerRanges = new Map<string, MapCartoRectangle>();
  private _baseUrl: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private _isVersion1_1 = false;
  constructor(settings: MapLayerSettings) {
    super(settings, false);
    this._baseUrl = WmsUtilities.getBaseUrl(this._settings.url);
  }

  public override async initialize(): Promise<void> {
    try {
      this._capabilities = await WmsCapabilities.create(this._baseUrl);
      if (undefined !== this._capabilities) {
        this._allLayersRange = this._capabilities.cartoRange;
        this._isVersion1_1 = this._capabilities.version !== undefined && 0 === this._capabilities.version.indexOf("1.1");
        if (this._capabilities.layer && Array.isArray(this._capabilities.layer.subLayers)) {
          const mapCartoRanges = ((subLayer: WmsCapability.SubLayer) => {
            if (Array.isArray(subLayer.children))
              subLayer.children.forEach((child) => mapCartoRanges(child));
            else if (subLayer.cartoRange)
              this._subLayerRanges.set(subLayer.name, subLayer.cartoRange);
          });
          this._capabilities.layer.subLayers.forEach((subLayer) => mapCartoRanges(subLayer));
          this._settings.subLayers.forEach((subLayer) => {
            if (subLayer.isNamed && this._settings.isSubLayerVisible(subLayer)) {
              const subLayerRange = this._subLayerRanges.get(subLayer.name);
              if (subLayerRange)
                if (this.cartoRange)
                  this.cartoRange.extendRange(subLayerRange);
                else
                  this.cartoRange = subLayerRange.clone();
            }
          });
        }

        if (!this.cartoRange)
          this.cartoRange = this._allLayersRange;
      }
    } catch (error) {
      // Don't throw error if unauthorized status:
      // We want the tile tree to be created, so that end-user can get feedback on which layer is missing credentials.
      // When credentials will be provided, a new provider will be created, and initialization should be fine.
      if (error?.status === 401) {
        this.setStatus(MapLayerImageryProviderStatus.RequireAuth);
      } else {
        throw new ServerError(IModelStatus.ValidationFailed, "");
      }
    }
  }

  private getVisibleLayerString() {
    const layerNames = this.getVisibleLayers();
    return layerNames.join("%2C");
  }
  private getVisibleLayers(): string[] {
    const layerNames = new Array<string>();
    this._settings.subLayers.forEach((subLayer) => { if (this._settings.isSubLayerVisible(subLayer) && subLayer.isNamed) layerNames.push(subLayer.name); });
    return layerNames;
  }

  private getQueryableLayers(): string[] {
    const layerNames = new Array<string>();
    const getQueryableSubLayers = ((subLayer: WmsCapability.SubLayer) => {
      if (!subLayer)
        return;

      if (subLayer.queryable)
        layerNames.push(subLayer.name);

      subLayer.children?.forEach((childSubLayer) => { getQueryableSubLayers(childSubLayer); });
    });
    this._capabilities?.layer?.subLayers?.forEach((subLayer) => { getQueryableSubLayers(subLayer); });
    return layerNames;
  }

  private getVisibleQueryableLayersString(): string {
    const layers = new Array<string>();
    const queryables = this.getQueryableLayers();
    const visibles = this.getVisibleLayers();
    queryables.forEach((layer: string) => { if (visibles.includes(layer)) layers.push(layer); });
    return layers.join("%2C");
  }

  // construct the Url from the desired Tile
  public async constructUrl(row: number, column: number, zoomLevel: number): Promise<string> {
    const bboxString = this.getEPSG3857ExtentString(row, column, zoomLevel);
    const layerString = this.getVisibleLayerString();
    return `${this._baseUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=${this.transparentBackgroundString}&LAYERS=${layerString}&WIDTH=${this.tileSize}&HEIGHT=${this.tileSize}&CRS=EPSG%3A3857&STYLES=&BBOX=${bboxString}`;
  }

  public override async getToolTip(strings: string[], quadId: QuadId, carto: Cartographic, tree: ImageryMapTileTree): Promise<void> {
    await super.getToolTip(strings, quadId, carto, tree);
    const infoFormats = this._capabilities?.featureInfoFormats;
    if (!doToolTips || undefined === infoFormats)
      return;
    let formatString = infoFormats.find((format) => format === "text/html");
    if (!formatString) formatString = infoFormats[0];

    const bboxString = this.getEPSG3857ExtentString(quadId.row, quadId.column, quadId.level);
    const layerString = this.getVisibleQueryableLayersString();
    if (layerString.length === 0)
      return;
    const rectangle = tree.getTileRectangle(quadId);
    const fraction = rectangle.worldToLocal(Point2d.create(carto.longitude, carto.latitude, scratchPoint2d))!;
    const x = Math.floor(.5 + fraction.x * this.tileSize);
    const y = Math.floor(.5 + (1.0 - fraction.y) * this.tileSize);
    const coordinateString = (false && this._isVersion1_1) ? `&x=${x}&y=${y}` : `&i=${x}&j=${y}`;
    const getFeatureUrl = `${this._baseUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${layerString}&WIDTH=${this.tileSize}&HEIGHT=${this.tileSize}&CRS=EPSG%3A3857&BBOX=${bboxString}&QUERY_LAYERS=${layerString}${coordinateString}&info_format=${formatString}`;
    return this.toolTipFromUrl(strings, getFeatureUrl);
  }
}
