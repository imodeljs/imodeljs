/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, ByteStream } from "@bentley/bentleyjs-core";
import { Point3d, Transform } from "@bentley/geometry-core";
import { BatchType, CompositeTileHeader, TileFormat, ViewFlagOverrides } from "@bentley/imodeljs-common";
import { IModelApp } from "../IModelApp";
import { GraphicBranch } from "../render/GraphicBranch";
import { RenderSystem } from "../render/RenderSystem";
import { Viewport } from "../Viewport";
import {
  B3dmReader, BatchedTileIdMap, createDefaultViewFlagOverrides, GltfReader, I3dmReader, readPointCloudTileContent, RealityTile, RealityTileContent, Tile, TileContent,
  TileDrawArgs, TileLoadPriority, TileRequest, TileRequestChannel,
} from "./internal";

const defaultViewFlagOverrides = createDefaultViewFlagOverrides({});

const scratchTileCenterWorld = new Point3d();
const scratchTileCenterView = new Point3d();

/** Serves as a "handler" for a specific type of [[TileTree]]. Its primary responsibilities involve loading tile content.
 * @internal
 */
export abstract class RealityTileLoader {
  private _containsPointClouds = false;
  public readonly preloadRealityParentDepth: number;
  public readonly preloadRealityParentSkip: number;

  public constructor(private _produceGeometry?: boolean) {
    this.preloadRealityParentDepth = IModelApp.tileAdmin.contextPreloadParentDepth;
    this.preloadRealityParentSkip = IModelApp.tileAdmin.contextPreloadParentSkip;
  }

  public computeTilePriority(tile: Tile, viewports: Iterable<Viewport>): number {
    // ###TODO: Handle case where tile tree reference(s) have a transform different from tree's (background map with ground bias).
    return RealityTileLoader.computeTileClosestToEyePriority(tile, viewports, tile.tree.iModelTransform);
  }

  public abstract loadChildren(tile: RealityTile): Promise<Tile[] | undefined>;
  public abstract getRequestChannel(tile: Tile): TileRequestChannel;
  public abstract requestTileContent(tile: Tile, isCanceled: () => boolean): Promise<TileRequest.Response>;
  public abstract get maxDepth(): number;
  public abstract get priority(): TileLoadPriority;
  protected get _batchType(): BatchType { return BatchType.Primary; }
  protected get _loadEdges(): boolean { return true; }
  public getBatchIdMap(): BatchedTileIdMap | undefined { return undefined; }
  public get isContentUnbounded(): boolean { return false; }
  public get containsPointClouds(): boolean { return this._containsPointClouds; }
  public get parentsAndChildrenExclusive(): boolean { return true; }
  public forceTileLoad(_tile: Tile): boolean { return false; }

  public processSelectedTiles(selected: Tile[], _args: TileDrawArgs): Tile[] { return selected; }

  // NB: The isCanceled arg is chiefly for tests...in usual case it just returns false if the tile is no longer in 'loading' state.
  public async loadTileContent(tile: Tile, data: TileRequest.ResponseData, system: RenderSystem, isCanceled?: () => boolean): Promise<RealityTileContent> {
    assert(data instanceof Uint8Array);
    const blob = data;
    const streamBuffer = new ByteStream(blob.buffer);
    const realityTile = tile as RealityTile;
    return this._produceGeometry ? this.loadGeometryFromStream(realityTile, streamBuffer, system) : this.loadGraphicsFromStream(realityTile, streamBuffer, system, isCanceled);
  }

  private _getFormat(streamBuffer: ByteStream) {
    const position = streamBuffer.curPos;
    const format = streamBuffer.nextUint32;
    streamBuffer.curPos = position;
    return format;

  }
  public async loadGeometryFromStream(tile: RealityTile,  streamBuffer: ByteStream, system: RenderSystem): Promise<RealityTileContent> {
    const format = this._getFormat(streamBuffer);
    if (format !== TileFormat.B3dm)
      return {};

    const { is3d, yAxisUp, iModel, modelId } = tile.realityRoot;
    const reader = B3dmReader.create(streamBuffer, iModel, modelId, is3d, tile.contentRange, system, yAxisUp, tile.isLeaf, tile.center, tile.transformToRoot, undefined, this.getBatchIdMap());
    return { geometry: reader?.readGltfAndCreateGeometry(tile.tree.iModelTransform) };
  }

  private async loadGraphicsFromStream(tile: RealityTile, streamBuffer: ByteStream, system: RenderSystem, isCanceled?: () => boolean): Promise<TileContent> {
    const format = this._getFormat(streamBuffer);

    if (undefined === isCanceled)
      isCanceled = () => !tile.isLoading;

    const { is3d, yAxisUp, iModel, modelId } = tile.realityRoot;
    let reader: GltfReader | undefined;
    switch (format) {
      case TileFormat.Pnts:
        this._containsPointClouds = true;
        let graphic = readPointCloudTileContent(streamBuffer, iModel, modelId, is3d, tile.contentRange, system);
        if (graphic && tile.transformToRoot && !tile.transformToRoot.isIdentity) {
          const transformBranch = new GraphicBranch(true);
          transformBranch.add(graphic);
          graphic = system.createBranch(transformBranch, tile.transformToRoot);
        }

        return { graphic};

      case TileFormat.B3dm:
        reader = B3dmReader.create(streamBuffer, iModel, modelId, is3d, tile.contentRange, system, yAxisUp, tile.isLeaf, tile.center, tile.transformToRoot, isCanceled, this.getBatchIdMap());
        break;
      case TileFormat.I3dm:
        reader = I3dmReader.create(streamBuffer, iModel, modelId, is3d, tile.contentRange, system, yAxisUp, tile.isLeaf, isCanceled);
        break;
      case TileFormat.Cmpt:
        const header = new CompositeTileHeader(streamBuffer);
        if (!header.isValid) return {};
        const branch = new GraphicBranch(true);
        for (let i = 0; i < header.tileCount; i++) {
          const tilePosition = streamBuffer.curPos;
          streamBuffer.advance(8);    // Skip magic and version.
          const tileBytes = streamBuffer.nextUint32;
          streamBuffer.curPos = tilePosition;
          const result = await this.loadGraphicsFromStream(tile, streamBuffer, system, isCanceled);
          if (result.graphic)
            branch.add(result.graphic);
          streamBuffer.curPos = tilePosition + tileBytes;
        }
        return { graphic: branch.isEmpty ? undefined : system.createBranch(branch, Transform.createIdentity()), isLeaf: tile.isLeaf };

      default:
        assert(false, `unknown tile format ${format}`);
        break;
    }

    let content: TileContent = {};
    if (undefined !== reader) {
      try {
        content = await reader.read();
      } catch (_err) {
        // Failure to load should prevent us from trying to load children
        content.isLeaf = true;
      }
    }

    return content;
  }

  public get viewFlagOverrides(): ViewFlagOverrides { return defaultViewFlagOverrides; }

  public static computeTileClosestToEyePriority(tile: Tile, viewports: Iterable<Viewport>, location: Transform): number {
    // Prioritize tiles closer to eye.
    // NB: In NPC coords, 0 = far plane, 1 = near plane.
    const center = location.multiplyPoint3d(tile.center, scratchTileCenterWorld);
    let minDistance = 1.0;
    for (const viewport of viewports) {
      const npc = viewport.worldToNpc(center, scratchTileCenterView);
      const distance = 1.0 - npc.z;
      minDistance = Math.min(distance, minDistance);
    }

    return minDistance;
  }
}
