/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */
import { IModelStatus } from "@bentley/bentleyjs-core";
import { MapLayerSettings, ServerError } from "@bentley/imodeljs-common";
import {
  MapLayerImageryProvider,
  MapLayerImageryProviderStatus,
  WmsUtilities, WmtsCapabilities, WmtsCapability,
} from "../../internal";

/** @internal */
export class WmtsMapLayerImageryProvider extends MapLayerImageryProvider {
  private _baseUrl: string;
  private _capabilities?: WmtsCapabilities;
  private _preferredLayerTileMatrixSet = new Map<string, WmtsCapability.TileMatrixSet>();
  private _preferredLayerStyle = new Map<string, WmtsCapability.Style>();

  public override get mutualExclusiveSubLayer(): boolean { return true; }

  constructor(settings: MapLayerSettings) {
    super(settings, true);
    this._baseUrl = WmsUtilities.getBaseUrl(this._settings.url);
  }

  public override async initialize(): Promise<void> {
    try {
      this._capabilities = await WmtsCapabilities.create(this._baseUrl);
      this.initPreferredTileMatrixSet();
      this.initPreferredStyle();
      this.initCartoRange();

      if (this._preferredLayerTileMatrixSet.size === 0 || this._preferredLayerStyle.size === 0)
        throw new ServerError(IModelStatus.ValidationFailed, "");

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

  // Each layer can be served in multiple tile matrix set (i.e. TileTree).
  // We have to pick one for each layer: for now we look for a Google Maps compatible tile tree.
  private initPreferredTileMatrixSet() {
    const googleMapsTms = this._capabilities?.contents?.getGoogleMapsCompatibleTileMatrixSet();

    const wellGoogleKnownTms = googleMapsTms?.find((tms) => { return tms.wellKnownScaleSet?.toLowerCase().includes(WmtsCapability.Constants.GOOGLEMAPS_COMPATIBLE_WELLKNOWNNAME); });

    this._capabilities?.contents?.layers.forEach((layer) => {

      if (wellGoogleKnownTms && layer.tileMatrixSetLinks.some((tmsl) => { return (tmsl.tileMatrixSet === wellGoogleKnownTms.identifier); })) {
        // Favor tile matrix set that was explicitly marked as GoogleMaps compatible
        this._preferredLayerTileMatrixSet.set(layer.identifier, wellGoogleKnownTms);
      } else {
        // Search all compatible tile set matrix if previous attempt didn't work.
        // If more than one candidate is found, pick the tile set with the most LODs.
        const tileMatrixSets = googleMapsTms?.filter((tms) => {
          return layer.tileMatrixSetLinks.some((tmsl) => { return (tmsl.tileMatrixSet === tms.identifier); });
        });

        let preferredTms: WmtsCapability.TileMatrixSet | undefined;
        if (tileMatrixSets && tileMatrixSets.length === 1)
          preferredTms = tileMatrixSets[0];
        else if (tileMatrixSets && tileMatrixSets?.length > 1)
          preferredTms = tileMatrixSets.reduce((prev, current) => (prev.tileMatrix.length > current.tileMatrix.length) ? prev : current);

        if (preferredTms)
          this._preferredLayerTileMatrixSet.set(layer.identifier, preferredTms);
      }
    });
  }

  // Each layer can be published different style.  We look for a style flagged as 'Default'.
  private initPreferredStyle() {
    this._capabilities?.contents?.layers.forEach((layer) => {
      let preferredStyle: WmtsCapability.Style | undefined;
      if (layer.styles.length === 1)
        preferredStyle = layer.styles[0];
      else if (layer.styles.length > 1) {
        // If more than style is available, takes the default one, otherwise the first one.
        const defaultStyle = layer.styles.find((style) => style.isDefault);
        if (defaultStyle)
          preferredStyle = defaultStyle;
        else
          preferredStyle = layer.styles[0];
      }

      if (preferredStyle)
        this._preferredLayerStyle.set(layer.identifier, preferredStyle);
    });
  }

  private initCartoRange() {
    this._capabilities?.contents?.layers.forEach((layer) => {

      if (layer.wsg84BoundingBox) {
        if (this.cartoRange)
          this.cartoRange.extendRange(layer.wsg84BoundingBox);
        else
          this.cartoRange = layer.wsg84BoundingBox.clone();
      }
    });
  }

  public async constructUrl(row: number, column: number, zoomLevel: number): Promise<string> {
    // WMTS support a single layer per tile request, so we pick the first visible layer.
    const layerString = this._settings.subLayers.find((subLayer) => subLayer.visible)?.name;
    let tileMatrix, tileMatrixSet, style;
    if (layerString) {
      tileMatrixSet = this._preferredLayerTileMatrixSet.get(layerString);

      style = this._preferredLayerStyle.get(layerString);

      // Matrix identifier might be something other than standard 0..n zoom level,
      // so lookup the matrix identifier just in case.
      if (tileMatrixSet && tileMatrixSet.tileMatrix.length > zoomLevel)
        tileMatrix = tileMatrixSet.tileMatrix[zoomLevel].identifier;
    }

    if (layerString !== undefined && tileMatrix !== undefined && tileMatrixSet !== undefined && style !== undefined)
      return `${this._baseUrl}?Service=WMTS&Version=1.0.0&Request=GetTile&Format=image%2Fpng&layer=${layerString}&style=${style.identifier}&TileMatrixSet=${tileMatrixSet.identifier}&TileMatrix=${tileMatrix}&TileCol=${column}&TileRow=${row} `;
    else
      return "";

  }
}
