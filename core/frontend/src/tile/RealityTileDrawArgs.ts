/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { Map4d } from "@bentley/geometry-core";
import { FrustumPlanes } from "@bentley/imodeljs-common";
import { TileDrawArgs } from "./internal";

/** @internal */
export class RealityTileDrawArgs extends TileDrawArgs {
  private readonly _worldToViewMap: Map4d;
  public override get worldToViewMap(): Map4d { return this._worldToViewMap; }

  public constructor(args: TileDrawArgs, worldToViewMap: Map4d, frustumPlanes: FrustumPlanes, public maxSelectionCount?: number) {
    super({ ...args, viewFlagOverrides: args.viewFlagOverrides, symbologyOverrides: args.symbologyOverrides, parentsAndChildrenExclusive: false });

    this._worldToViewMap = worldToViewMap;
    this._frustumPlanes = frustumPlanes;
  }
}
