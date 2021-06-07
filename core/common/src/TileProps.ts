/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tile
 */

import { GuidString } from "@bentley/bentleyjs-core";
import { Range3dProps, TransformProps } from "@bentley/geometry-core";

/** Wire format describing an [IModelTile]($frontend)
 * @internal
 */
export interface TileProps {
  /** The unique identifier of the tile's content */
  contentId: string;
  /** The volume of space represented by this tile. */
  range: Range3dProps;
  /** Optional volume within the tile's range which more tightly encloses the tile geometry */
  contentRange?: Range3dProps;
  /** The maximum size in pixels at which the tile should be drawn on the screen. Excludes the optional sizeMultiplier which is applied separately. 0.0 indicates this tile is not displayable. */
  maximumSize: number;
  /** Optional scaling factor applied to this tile's maximum size. Defaults to 1.0 if undefined. */
  sizeMultiplier?: number;
  /** Optional boolean indicating this tile has no children. Defaults to false if undefined. */
  isLeaf?: boolean;
}

/** Wire format describing a [TileTree]($frontend)
 * @internal
 */
export interface TileTreeProps {
  /** The unique identifier of this TileTree within the iModel */
  id: string;
  /** Metadata describing the tree's root Tile. */
  rootTile: TileProps;
  /** Transform tile coordinates to iModel world coordinates. */
  location: TransformProps;
  /** If defined, limits the number of child tiles which can be skipped in selecting tiles of appropriate LOD */
  maxTilesToSkip?: number;
  /** Optional volume within which content of all tiles' contents are guaranteed to be contained - never larger than `rootTile.range` and sometimes much smaller. */
  contentRange?: Range3dProps;
}

/** Wire format describing an [IModelTileTree]($frontend).
 * @internal
 */
export interface IModelTileTreeProps extends TileTreeProps {
  /** Optional namespace applied to tile content Ids for tiles belonging to this tree. */
  contentIdQualifier?: string;
  /** The geometry guid used as a baseline for tile content. May not match the model's current geometry guid during a [GraphicalEditingScope]($frontend). */
  geometryGuid?: GuidString;
  /** If defined, specifies the number of levels of the tile tree that can be skipped when selecting tiles. */
  maxInitialTilesToSkip?: number;
  /** Optionally specifies the maximum tile format version supported. */
  formatVersion?: number;
}

/** Metadata describing the version/format of the tiles supplied by the backend.
 * @see [[TileAdmin.queryVersionInfo]].
 * @public
 */
export interface TileVersionInfo {
  /** The exact version of the "iMdl" tile format used by the backend when generating tile content.
   * Newer versions of the tile format remain backwards-compatible, but may fix bugs from previous versions and add new features.
   * A frontend can request tiles of an earlier version than this, but should not of newer versions.
   * @note The version is represented as a 32-bit integer combining the 16-bit major and minor version numbers.
   * @see [[CurrentImdlVersion]] to obtain the current version used by the frontend or backend.
   */
  formatVersion: number;
}
