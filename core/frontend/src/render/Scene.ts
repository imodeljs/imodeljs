/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { Id64String } from "@bentley/bentleyjs-core";
import { SpatialClassifier } from "@bentley/imodeljs-common";
import { RenderGraphic } from "./RenderGraphic";
import { RenderPlanarClassifier } from "./RenderPlanarClassifier";
import { RenderTextureDrape } from "./RenderSystem";

/** Describes the spatial classification applied to a [[Scene]].
 * @internal
 */
export interface SceneVolumeClassifier {
  classifier: SpatialClassifier;
  modelId: Id64String;
}

/** Holds a collection of objects comprising the scene to be drawn by a [[Viewport]]'s.
 * @see [[SceneContext]] for the context in which the scene is created.
 * @public
 */
export class Scene {
  /** Graphics to be drawn as a "normal" part of the scene - that is, with depth. */
  public readonly foreground: RenderGraphic[] = [];
  /** Graphics to be drawn in the background behind all other graphics. */
  public readonly background: RenderGraphic[] = [];
  /** Graphics to be overlaid atop all other graphics. */
  public readonly overlay: RenderGraphic[] = [];
  /** @internal */
  public readonly planarClassifiers = new Map<Id64String, RenderPlanarClassifier>(); // Classifier model id to planar classifier.
  /** @internal */
  public readonly textureDrapes = new Map<Id64String, RenderTextureDrape>();
  /** @internal */
  public volumeClassifier?: SceneVolumeClassifier;
}
