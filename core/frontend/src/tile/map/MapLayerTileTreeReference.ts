/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { MapLayerSettings } from "@bentley/imodeljs-common";
import { HitDetail } from "../../HitDetail";
import { MapLayerImageryProvider, TileTreeReference } from "../internal";

/** @internal  */
export abstract class MapLayerTileTreeReference extends TileTreeReference {
  constructor(protected _layerSettings: MapLayerSettings, protected _layerIndex: number) {
    super();
  }
  protected get _transparency() { return this._layerSettings.transparency ? this._layerSettings.transparency : undefined; }
  protected get _imageryProvider(): MapLayerImageryProvider | undefined { return undefined; } // We don't use MapTileTreeReference TreeSupplier...
  public set layerSettings(layerSettings: MapLayerSettings) { this._layerSettings = layerSettings; }
  public get layerSettings(): MapLayerSettings { return this._layerSettings; }
  public override async getToolTip(hit: HitDetail): Promise<HTMLElement | string | undefined> {
    const tree = this.treeOwner.tileTree;
    if (undefined === tree || hit.iModel !== tree.iModel || tree.modelId !== hit.sourceId)
      return undefined;

    const strings = [];
    strings.push(`Map Layer: ${this._layerSettings.name}`);
    const div = document.createElement("div");
    div.innerHTML = strings.join("<br>");
    return div;
  }
}
