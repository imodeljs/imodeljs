/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

/** Carries information in a GraphicBranchOptions about a GraphicBranch produced by drawing one view into the context of another.
 * @internal
 */
export interface GraphicBranchFrustum {
  is3d: boolean;
  scale: {
    x: number;
    y: number;
  };
}

import { disposeArray, IDisposable } from "@bentley/bentleyjs-core";
import { FeatureAppearanceProvider, HiddenLine, ViewFlagOverrides, ViewFlags } from "@bentley/imodeljs-common";
import { IModelConnection } from "../IModelConnection";
import { FeatureSymbology } from "./FeatureSymbology";
import { RenderClipVolume } from "./RenderClipVolume";
import { RenderGraphic } from "./RenderGraphic";
import { RenderMemory } from "./RenderMemory";
import { RenderPlanarClassifier } from "./RenderPlanarClassifier";
import { RenderTextureDrape } from "./RenderSystem";

/**
 * A node in a scene graph. The branch itself is not renderable. Instead it contains a list of RenderGraphics,
 * and a transform, symbology overrides, and clip volume which are to be applied when rendering them.
 * Branches can be nested to build an arbitrarily-complex scene graph.
 * @see [[RenderSystem.createBranch]]
 * @public
 */
export class GraphicBranch implements IDisposable /* , RenderMemory.Consumer */ {
  /** The child nodes of this branch */
  public readonly entries: RenderGraphic[] = [];
  /** If true, when the branch is disposed of, the RenderGraphics in its entries array will also be disposed */
  public readonly ownsEntries: boolean;
  /** Selectively overrides the view's [ViewFlags]($common) while drawing graphics within this branch. The default overrides nothing.
   * @see [[setViewFlagOverrides]].
   */
  public viewFlagOverrides = new ViewFlagOverrides();
  /** Optional symbology overrides to be applied to all graphics in this branch */
  public symbologyOverrides?: FeatureSymbology.Overrides;
  /** Optional animation branch Id.
   * @internal
   */
  public animationId?: string;

  /** Constructor
   * @param ownsEntries If true, when this branch is [[dispose]]d, all of the [[RenderGraphic]]s it contains will also be disposed.
   */
  public constructor(ownsEntries: boolean = false) {
    this.ownsEntries = ownsEntries;
  }

  /** Add a graphic to this branch. */
  public add(graphic: RenderGraphic): void {
    this.entries.push(graphic);
  }

  /** Compute the view flags that result from applying this branch's [[viewFlagOverrides]] to the input flags.
   * @param flags The input view flags, e.g., from the view's [[DisplayStyleState]].
   * @param out If supplied, these flags will be modified and returned as the result; otherwise, a new ViewFlags will be allocated and returned.
   * @returns The result of applying [[viewFlagOverrides]] to `flags`.
   */
  public getViewFlags(flags: ViewFlags, out?: ViewFlags): ViewFlags {
    return this.viewFlagOverrides.apply(flags.clone(out));
  }

  /** Set [[viewFlagOverrides]] to override **all** ViewFlags as specified by `flags`. */
  public setViewFlags(flags: ViewFlags): void {
    this.viewFlagOverrides.overrideAll(flags);
  }

  /** Change [[viewFlagOverrides]]. */
  public setViewFlagOverrides(ovr: ViewFlagOverrides): void {
    this.viewFlagOverrides.copyFrom(ovr);
  }

  /** Disposes of all graphics in this branch, if and only if [[ownsEntries]] is true. */
  public dispose() {
    this.clear();
  }

  /** Returns true if this branch contains no graphics. */
  public get isEmpty(): boolean {
    return 0 === this.entries.length;
  }

  /** Empties the list of [[RenderGraphic]]s contained in this branch, and if the [[ownsEntries]] flag is set, also disposes of them. */
  public clear(): void {
    if (this.ownsEntries)
      disposeArray(this.entries);
    else
      this.entries.length = 0;
  }

  /** @internal */
  public collectStatistics(stats: RenderMemory.Statistics): void {
    for (const entry of this.entries)
      entry.collectStatistics(stats);
  }
}

/** Options passed to [[RenderSystem.createGraphicBranch]].
 * @public
 */
export interface GraphicBranchOptions {
  /** Clip applied to the graphics in the branch. */
  clipVolume?: RenderClipVolume;
  /** @internal */
  classifierOrDrape?: RenderPlanarClassifier | RenderTextureDrape;
  /** Optionally replaces the view's hidden line settings when drawing the branch. */
  hline?: HiddenLine.Settings;
  /** The iModel from which the graphics originate, if different than that associated with the view. */
  iModel?: IModelConnection;
  /** @internal */
  frustum?: GraphicBranchFrustum;
  /** Supplements the view's [[FeatureSymbology.Overrides]] for graphics in the branch. */
  appearanceProvider?: FeatureAppearanceProvider;
}

/** Clip/Transform for a branch that are varied over time.
 * @internal
 */
export interface AnimationBranchState {
  readonly clip?: RenderClipVolume;
  readonly omit?: boolean;
}

/** Mapping from node/branch IDs to animation branch state
 * @internal
 */
export type AnimationBranchStates = Map<string, AnimationBranchState>;
