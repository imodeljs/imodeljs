/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import * as React from "react";
import { Tile, TileProps } from "./Tile";

/** Minimal [[Tile]] component
 * @beta
 * @deprecated
 */
export function MinimalTile(props: TileProps) { // eslint-disable-line deprecation/deprecation
  return <Tile {...props} minimal={true} />;  // eslint-disable-line deprecation/deprecation
}
