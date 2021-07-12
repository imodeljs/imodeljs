/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { MapLayerSettings } from "@bentley/imodeljs-common";
import { IModelApp } from "../../../IModelApp";
import { ScreenViewport } from "../../../Viewport";
import { MapLayerImageryProvider } from "../../internal";

/** Base class imagery map layer formats.  Subclasses should override formatId and [[MapLayerFormat.createImageryProvider]].
 * @internal
 */
export class MapBoxLayerImageryProvider extends MapLayerImageryProvider {
  private _zoomMin: number;
  private _zoomMax: number;
  private _baseUrl: string;

  constructor(settings: MapLayerSettings) {
    super(settings, true);
    this._baseUrl = settings.url;
    this._zoomMin = 1; this._zoomMax = 20;
  }

  public get tileWidth(): number { return 256; }
  public get tileHeight(): number { return 256; }
  public override get minimumZoomLevel(): number { return this._zoomMin; }
  public override get maximumZoomLevel(): number { return this._zoomMax; }

  // construct the Url from the desired Tile
  public async constructUrl(row: number, column: number, zoomLevel: number): Promise<string> {
    if (!this._settings.accessKey) {
      return "";
    }

    // from the template url, construct the tile url.
    let url: string = this._baseUrl.concat(zoomLevel.toString());
    url = url.concat("/").concat(column.toString()).concat("/").concat(row.toString());
    url = url.concat(`.jpg80?${this._settings.accessKey.key}=${this._settings.accessKey.value}`);

    return url;
  }

  public override getLogo(_vp: ScreenViewport): HTMLTableRowElement | undefined {
    return IModelApp.makeLogoCard({ heading: "Mapbox", notice: IModelApp.i18n.translate("iModelJs:BackgroundMap.MapBoxCopyright") });
  }

  // no initialization needed for MapBoxImageryProvider.
  public override async initialize(): Promise<void> { }
}
