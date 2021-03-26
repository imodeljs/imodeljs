/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tile
 */

import { Id64String } from "@bentley/bentleyjs-core";
import { TransformProps } from "@bentley/geometry-core";
import { PlacementProps } from "../ElementProps";
import { GeometryStreamProps } from "../geometry/GeometryStream";
import { ContentFlags, TreeFlags } from "../tile/TileMetadata";

/** Wire format describing properties common to [[PersistentGraphicsRequestProps]] and [[DynamicGraphicsRequestProps]].
 * @see [[ElementGraphicsRequestProps]].
 * @beta
 */
export interface GraphicsRequestProps {
  /** Uniquely identifies this request among all [[ElementGraphicsRequestProps]] for a given [[IModel]]. */
  readonly id: string;
  /** Log10 of the chord tolerance with which to stroke the element's geometry. e.g., for a chord tolerance of 0.01 (10^-2) meters, supply -2. */
  readonly toleranceLog10: number;
  /** The major version of the "iMdl" format to use when producing the iMdl representation of the element's geometry.
   * If omitted, the most recent version known to the backend will be used.
   * @alpha
   */
  readonly formatVersion?: number;
  /** Optional flags. [[TreeFlags.UseProjectExtents]] has no effect. [[TreeFlags.EnforceDisplayPriority]] is not yet implemented. @alpha */
  readonly treeFlags?: TreeFlags;
  /** Optional flags. [[ContentFlags.ImprovedElision]] has no effect. @alpha */
  readonly contentFlags?: ContentFlags;
  /** Transform from element graphics to world coordinates. Defaults to identity. */
  readonly location?: TransformProps;
  /** If true, surface edges will be omitted from the graphics. */
  readonly omitEdges?: boolean;
  /** If true, the element's graphics will be clipped against the iModel's project extents. */
  readonly clipToProjectExtents?: boolean;
}

/** Wire format describing a request to produce graphics in "iMdl" format for a single element.
 * @see [[ElementGraphicsRequestProps]] for more details.
 * @beta
 */
export interface PersistentGraphicsRequestProps extends GraphicsRequestProps {
  /** The element whose geometry is to be used to generate the graphics. */
  readonly elementId: Id64String;
}

/** Wire format describing a request to produce graphics in "iMdl" format for a single geometry stream.
 * @see [[ElementGraphicsRequestProps]] for more details.
 * @beta
 */
export interface DynamicGraphicsRequestProps extends GraphicsRequestProps {
  /** The geometry from which to generate the graphics. */
  readonly geometry: GeometryStreamProps;
  /** The location and orientation of the geometry. The bounding box will be computed from the supplied [[geometry]].
   * Supply a 2d placement for 2d geometry or 3d placement for 3d geometry.
   */
  readonly placement: Omit<PlacementProps, "bbox">;
  /** The category to which the geometry belongs. This is required to identify a persistent [SpatialCategory]($backend) for 3d geometry or
   * [DrawingCategory]($backend) for 2d geometry.
   */
  readonly categoryId: Id64String;
  /** If specified, tools will recognize the generated graphics as being associated with this element. */
  readonly elementId?: Id64String;
  /** If specified, tools will recognize the generated graphics as being associated with this model.
   * It should identify a 3d model for 3d geometry or a 2d model for 2d geometry.
   * It needn't identify a persistent model - it can be a transient Id.
   */
  readonly modelId?: Id64String;
}

/** Wire format describing a request to produce graphics in "iMdl" format for a single element or geometry stream.
 * @note Every request must have an `id` that is unique amongst all extant requests for a given [[IModel]].
 * @see [TileAdmin.requestElementGraphics]($frontend) and [IModelDb.generateElementGraphics]($backend) to fulfill such a request.
 * @see [readElementGraphics]($frontend) to convert the result of a request to a [RenderGraphic]($frontend) for display.
 * @beta
 */
export type ElementGraphicsRequestProps = PersistentGraphicsRequestProps | DynamicGraphicsRequestProps;
