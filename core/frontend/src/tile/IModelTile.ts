/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, BeTimePoint, ByteStream } from "@bentley/bentleyjs-core";
import { Range3d } from "@bentley/geometry-core";
import {
  ColorDef, computeChildTileProps, computeChildTileRanges, computeTileChordTolerance, ElementAlignedBox3d, LinePixels, TileFormat, TileProps,
} from "@bentley/imodeljs-common";
import { IModelApp } from "../IModelApp";
import { GraphicBuilder } from "../render/GraphicBuilder";
import { RenderSystem } from "../render/RenderSystem";
import {
  addRangeGraphic, ImdlReader, IModelTileTree, Tile, TileBoundingBoxes, TileContent, TileDrawArgs, TileLoadStatus, TileParams, TileRequest,
  TileRequestChannel, TileTreeLoadStatus, TileVisibility,
} from "./internal";

/** Parameters used to construct an [[IModelTile]].
 * @internal
 */
export interface IModelTileParams extends TileParams {
  sizeMultiplier?: number;
}

/** @internal */
export function iModelTileParamsFromJSON(props: TileProps, parent: IModelTile | undefined): IModelTileParams {
  const { contentId, maximumSize, isLeaf, sizeMultiplier } = props;
  const range = Range3d.fromJSON(props.range);

  let contentRange;
  if (undefined !== props.contentRange)
    contentRange = Range3d.fromJSON<ElementAlignedBox3d>(props.contentRange);

  return { contentId, range, maximumSize, isLeaf, parent, contentRange, sizeMultiplier };
}

/**
 * Indicates whether a parent tile should be drawn in place of a child tile.
 * @internal
 */
export enum SelectParent {
  No,
  Yes,
}

/** @internal */
export interface IModelTileContent extends TileContent {
  /** If this tile was produced by refinement, the multiplier applied to its screen size. */
  sizeMultiplier?: number;
  /** A bitfield describing empty sub-volumes of this tile's volume. */
  emptySubRangeMask?: number;
}

/** A tile belonging to an [[IModelTileTree].
 * @internal
 */
export class IModelTile extends Tile {
  private _sizeMultiplier?: number;
  private _emptySubRangeMask?: number;
  /** True if an attempt to look up this tile's content in the cloud storage tile cache failed.
   * See CloudStorageCacheChannel.onNoContent and IModelTile.channel
   */
  public cacheMiss = false;

  public constructor(params: IModelTileParams, tree: IModelTileTree) {
    super(params, tree);
    this._sizeMultiplier = params.sizeMultiplier;

    if (!this.isLeaf && this.tree.is3d) { // ###TODO: Want to know specifically if tree is *spatial*.
      // Do not sub-divide such that chord tolerance would be below specified minimum, if minimum defined.
      const minTolerance = IModelApp.tileAdmin.minimumSpatialTolerance;
      if (minTolerance > 0 && computeTileChordTolerance(this, this.tree.is3d) <= minTolerance)
        this.setLeaf();
    }
  }

  public get iModelTree(): IModelTileTree { return this.tree as IModelTileTree; }
  public get iModelChildren(): IModelTile[] | undefined { return this.children as IModelTile[] | undefined; }
  public get emptySubRangeMask(): number { return this._emptySubRangeMask ?? 0; }

  public get sizeMultiplier(): number | undefined { return this._sizeMultiplier; }
  public get hasSizeMultiplier() { return undefined !== this.sizeMultiplier; }
  public override get maximumSize(): number {
    return super.maximumSize * (this.sizeMultiplier ?? 1.0);
  }

  public get channel(): TileRequestChannel {
    const channels = IModelApp.tileAdmin.channels;
    const cloud = !this.cacheMiss ? channels.cloudStorageCache : undefined;
    return cloud ?? channels.iModelTileRpc;
  }

  public async requestContent(): Promise<TileRequest.Response> {
    return IModelApp.tileAdmin.generateTileContent(this);
  }

  public async readContent(data: TileRequest.ResponseData, system: RenderSystem, isCanceled?: () => boolean): Promise<IModelTileContent> {
    if (undefined === isCanceled)
      isCanceled = () => !this.isLoading;

    assert(data instanceof Uint8Array);
    const streamBuffer = new ByteStream(data.buffer);

    const position = streamBuffer.curPos;
    const format = streamBuffer.nextUint32;
    streamBuffer.curPos = position;

    let content: IModelTileContent = { isLeaf: true };
    assert(TileFormat.IModel === format);
    if (format !== TileFormat.IModel)
      return content;

    const tree = this.iModelTree;
    const mult = this.hasSizeMultiplier ? this.sizeMultiplier : undefined;
    const reader = ImdlReader.create(streamBuffer, tree.iModel, tree.modelId, tree.is3d, system, tree.batchType, tree.hasEdges, isCanceled, mult, { tileId: this.contentId });
    if (undefined !== reader) {
      try {
        content = await reader.read();
      } catch (_) {
        //
      }
    }

    return content;
  }

  public override setContent(content: IModelTileContent): void {
    super.setContent(content);

    this._emptySubRangeMask = content.emptySubRangeMask;

    // NB: If this tile has no graphics, it may or may not have children - but we don't want to load the children until
    // this tile is too coarse for view based on its size in pixels.
    // That is different than an "undisplayable" tile (maximumSize=0) whose children should be loaded immediately.
    if (undefined !== content.graphic && 0 === this.maximumSize)
      this._maximumSize = 512;

    const sizeMult = content.sizeMultiplier;
    if (undefined !== sizeMult && (undefined === this._sizeMultiplier || sizeMult > this._sizeMultiplier)) {
      this._sizeMultiplier = sizeMult;
      this._contentId = this.iModelTree.contentIdProvider.idFromParentAndMultiplier(this.contentId, sizeMult);
      if (undefined !== this.children && this.children.length > 1)
        this.disposeChildren();
    }
  }

  protected _loadChildren(resolve: (children: Tile[]) => void, reject: (error: Error) => void): void {
    try {
      const tree = this.iModelTree;
      const kids = computeChildTileProps(this, tree.contentIdProvider, tree);
      IModelApp.tileAdmin.onTilesElided(kids.numEmpty);

      const children: IModelTile[] = [];
      for (const props of kids.children) {
        const child = new IModelTile(iModelTileParamsFromJSON(props, this), tree);
        children.push(child);
      }

      resolve(children);
    } catch (err) {
      reject(err);
    }
  }

  protected override get rangeGraphicColor(): ColorDef {
    return this.hasSizeMultiplier ? ColorDef.red : super.rangeGraphicColor;
  }

  protected override addRangeGraphic(builder: GraphicBuilder, type: TileBoundingBoxes): void {
    if (TileBoundingBoxes.ChildVolumes !== type) {
      super.addRangeGraphic(builder, type);
      return;
    }

    const ranges = computeChildTileRanges(this, this.tree);
    for (const range of ranges) {
      const color = range.isEmpty ? ColorDef.blue : ColorDef.green;
      const pixels = !range.isEmpty ? LinePixels.HiddenLine : LinePixels.Solid;
      const width = !range.isEmpty ? 2 : 1;
      builder.setSymbology(color, color, width, pixels);
      addRangeGraphic(builder, range.range, this.tree.is2d);
    }
  }

  public pruneChildren(olderThan: BeTimePoint): void {
    // A tile's usage marker indicates its the most recent time its *children* were used.
    if (this.usageMarker.isExpired(olderThan)) {
      this.disposeChildren();
      return;
    }

    // this node has been used recently. Keep it, but potentially unload its grandchildren.
    const children = this.iModelChildren;
    if (undefined !== children)
      for (const child of children)
        child.pruneChildren(olderThan);
  }

  public selectTiles(selected: Tile[], args: TileDrawArgs, numSkipped: number): SelectParent {
    let vis = this.computeVisibility(args);
    if (TileVisibility.OutsideFrustum === vis)
      return SelectParent.No;

    const maxDepth = this.iModelTree.debugMaxDepth;
    if (undefined !== maxDepth && this.depth >= maxDepth)
      vis = TileVisibility.Visible;

    if (TileVisibility.Visible === vis) {
      // This tile is of appropriate resolution to draw. If need loading or refinement, enqueue.
      if (!this.isReady)
        args.insertMissing(this);

      if (this.hasGraphics) {
        // It can be drawn - select it
        args.markReady(this);
        selected.push(this);
      } else if (!this.isReady) {
        // It can't be drawn. Try to draw children in its place; otherwise draw the parent.
        // Do not load/request the children for this purpose.
        const initialSize = selected.length;
        const kids = this.iModelChildren;
        if (undefined === kids)
          return SelectParent.Yes;

        // Find any descendant to draw, until we exceed max initial tiles to skip.
        if (this.depth < this.iModelTree.maxInitialTilesToSkip) {
          for (const kid of kids) {
            if (SelectParent.Yes === kid.selectTiles(selected, args, numSkipped)) {
              selected.length = initialSize;
              return SelectParent.Yes;
            }

            return SelectParent.No;
          }
        }

        // If all visible direct children can be drawn, draw them.
        for (const kid of kids) {
          if (TileVisibility.OutsideFrustum !== kid.computeVisibility(args)) {
            if (!kid.hasGraphics) {
              selected.length = initialSize;
              return SelectParent.Yes;
            } else {
              selected.push(kid);
            }
          }
        }

        args.markUsed(this);
      }

      // We're drawing either this tile, or its direct children.
      return SelectParent.No;
    }

    // This tile is too coarse to draw. Try to draw something more appropriate.
    // If it is not ready to draw, we may want to skip loading in favor of loading its descendants.
    // If we previously loaded and later unloaded content for this tile to free memory, don't force it to reload its content - proceed to children.
    let canSkipThisTile = (this._hadGraphics && !this.hasGraphics) || this.depth < this.iModelTree.maxInitialTilesToSkip;
    if (canSkipThisTile) {
      numSkipped = 1;
    } else {
      canSkipThisTile = this.isReady || this.isParentDisplayable || this.depth < this.iModelTree.maxInitialTilesToSkip;
      if (canSkipThisTile && this.isDisplayable) { // skipping an undisplayable tile doesn't count toward the maximum
        // Some tiles do not sub-divide - they only facet the same geometry to a higher resolution. We can skip directly to the correct resolution.
        const isNotReady = !this.isReady && !this.hasGraphics && !this.hasSizeMultiplier;
        if (isNotReady) {
          if (numSkipped >= this.iModelTree.maxTilesToSkip)
            canSkipThisTile = false;
          else
            numSkipped += 1;
        }
      }
    }

    const childrenLoadStatus = this.loadChildren(); // NB: asynchronous
    const children = canSkipThisTile ? this.iModelChildren : undefined;
    if (canSkipThisTile && TileTreeLoadStatus.Loading === childrenLoadStatus) {
      args.markChildrenLoading();
      args.markUsed(this);
    }

    if (undefined !== children) {
      // If we are the root tile and we are not displayable, then we want to draw *any* currently available children in our place, or else we would draw nothing.
      // Otherwise, if we want to draw children in our place, we should wait for *all* of them to load, or else we would show missing chunks where not-yet-loaded children belong.
      const isUndisplayableRootTile = this.isUndisplayableRootTile;
      args.markUsed(this);
      let drawChildren = true;
      const initialSize = selected.length;
      for (const child of children) {
        // NB: We must continue iterating children so that they can be requested if missing.
        if (SelectParent.Yes === child.selectTiles(selected, args, numSkipped)) {
          if (child.loadStatus === TileLoadStatus.NotFound) {
            // At least one child we want to draw failed to load. e.g., we reached max depth of map tile tree. Draw parent instead.
            drawChildren = canSkipThisTile = false;
          } else {
            // At least one child we want to draw is not yet loaded. Wait for it to load before drawing it and its siblings, unless we have nothing to draw in their place.
            drawChildren = isUndisplayableRootTile;
          }
        }
      }

      if (drawChildren)
        return SelectParent.No;

      // Some types of tiles (like maps) allow the ready children to be drawn on top of the parent while other children are not yet loaded.
      if (args.parentsAndChildrenExclusive)
        selected.length = initialSize;
    }

    if (this.isReady) {
      if (this.hasGraphics) {
        selected.push(this);
        if (!canSkipThisTile) {
          // This tile is too coarse, but we require loading it before we can start loading higher-res children.
          args.markReady(this);
        }
      }

      return SelectParent.No;
    }

    // This tile is not ready to be drawn. Request it *only* if we cannot skip it.
    if (!canSkipThisTile)
      args.insertMissing(this);

    return this.isParentDisplayable ? SelectParent.Yes : SelectParent.No;
  }
}
