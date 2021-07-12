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

/** @internal */
export class AzureMapsLayerImageryProvider extends MapLayerImageryProvider {
  constructor(settings: MapLayerSettings) { super(settings, true); }

  // construct the Url from the desired Tile
  public async constructUrl(y: number, x: number, zoom: number): Promise<string> {
    if (!this._settings.accessKey)
      return "";
    return `${this._settings.url}&${this._settings.accessKey.key}=${this._settings.accessKey.value}&api-version=2.0&zoom=${zoom}&x=${x}&y=${y}`;
  }

  public override getLogo(_vp: ScreenViewport) {
    return IModelApp.makeLogoCard({ heading: "Azure Maps", notice: IModelApp.i18n.translate("iModelJs:BackgroundMap.AzureMapsCopyright") });
  }
}
