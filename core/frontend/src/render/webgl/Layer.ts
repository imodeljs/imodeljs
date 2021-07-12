/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { Id64 } from "@bentley/bentleyjs-core";
import { RenderMemory } from "../RenderMemory";
import { Graphic } from "./Graphic";
import { RenderCommands } from "./RenderCommands";
import { RenderPass } from "./RenderFlags";
import { Target } from "./Target";

abstract class GraphicWrapper extends Graphic {
  public readonly graphic: Graphic;

  protected constructor(graphic: Graphic) {
    super();
    this.graphic = graphic;
  }

  public dispose(): void {
    this.graphic.dispose();
  }

  public get isDisposed(): boolean {
    return this.graphic.isDisposed;
  }

  public override get isPickable(): boolean {
    return this.graphic.isPickable;
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    this.graphic.collectStatistics(stats);
  }
}

/** Within a single tile, contains graphics belonging to a single layer.
 * The same layer may appear in multiple tiles, both within the same tile tree and in other tile trees.
 * Within a single tile tree, all Layers are contained within the same LayerContainer.
 * @internal
 */
export class Layer extends GraphicWrapper {
  public readonly layerId: string;
  private readonly _idLo: number;
  private readonly _idHi: number;

  public constructor(graphic: Graphic, layerId: string) {
    super(graphic);
    this.layerId = layerId;

    const pair = Id64.getUint32Pair(layerId);
    this._idLo = pair.lower;
    this._idHi = pair.upper;
  }

  public getPriority(target: Target): number {
    return target.currentFeatureSymbologyOverrides.getSubCategoryPriority(this._idLo, this._idHi);
  }

  public addCommands(commands: RenderCommands): void {
    commands.addLayerCommands(this);
  }

  public override addHiliteCommands(commands: RenderCommands, pass: RenderPass): void {
    commands.addHiliteLayerCommands(this.graphic, pass);
  }
}

/** Contains a GraphicBranch that can contain Layers, for a single model / tile-tree.
 * All geometry within the container has the same Z.
 * @internal
 */
export class LayerContainer extends GraphicWrapper {
  public readonly renderPass: RenderPass;
  public readonly elevation: number;

  public constructor(graphic: Graphic, drawAsOverlay: boolean, transparency: number, elevation: number) {
    super(graphic);
    this.elevation = elevation;

    if (drawAsOverlay)
      this.renderPass = RenderPass.OverlayLayers;
    else if (transparency > 0)
      this.renderPass = RenderPass.TranslucentLayers;
    else
      this.renderPass = RenderPass.OpaqueLayers; // ###TODO: What about layers containing naturally-transparent geometry?
  }

  public addCommands(commands: RenderCommands): void {
    commands.processLayers(this);
  }

  public override addHiliteCommands(commands: RenderCommands, pass: RenderPass): void {
    commands.addHiliteLayerCommands(this.graphic, pass);
  }
}
