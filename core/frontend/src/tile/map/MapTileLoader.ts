/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, ClientRequestContext, Id64String } from "@bentley/bentleyjs-core";
import { Range1d } from "@bentley/geometry-core";
import { Feature, FeatureTable } from "@bentley/imodeljs-common";
import { request } from "@bentley/itwin-client";
import { IModelConnection } from "../../IModelConnection";
import { IModelApp } from "../../IModelApp";
import { RenderSystem } from "../../render/RenderSystem";
import { MapCartoRectangle, MapTile, RealityTile, RealityTileLoader, TerrainMeshProvider, TerrainTileContent, TileRequest } from "../internal";
import { Tile, TileLoadPriority } from "../Tile";
import { QuadId } from "./QuadId";

/** Specialization of map tile loader that includes terrain geometry with map imagery draped on it.
 * @internal
 */
export class MapTileLoader extends RealityTileLoader {
  public get priority(): TileLoadPriority { return TileLoadPriority.Terrain; }
  public get clipLowResolutionTiles(): boolean { return true; }
  protected _applyLights = false;
  public readonly featureTable: FeatureTable;
  // public get heightRange(): Range1d | undefined { return this._heightRange; }
  protected readonly _heightRange: Range1d | undefined;
  public override get isContentUnbounded(): boolean { return true; }
  public isTileAvailable(quadId: QuadId) { return this.terrainProvider.isTileAvailable(quadId); }
  private _requestContext = new ClientRequestContext("");

  public constructor(protected _iModel: IModelConnection, protected _modelId: Id64String, protected _groundBias: number, private _terrainProvider: TerrainMeshProvider) {
    super();
    this.featureTable = new FeatureTable(0xffff, this._modelId);
    this.featureTable.insert(new Feature(this._modelId));
  }
  public getFeatureIndex(layerModelId: Id64String): number {
    return this.featureTable.insert(new Feature(layerModelId))!;
  }

  public get maxDepth(): number { return this._terrainProvider.maxDepth; }
  public get minDepth(): number { return 0;}
  public get terrainProvider(): TerrainMeshProvider { return this._terrainProvider; }

  public getRequestChannel(_tile: Tile) {
    // ###TODO use hostname from url - but so many layers to go through to get that...
    return IModelApp.tileAdmin.channels.getForHttp("itwinjs-imagery");
  }

  public async requestTileContent(tile: Tile, _isCanceled: () => boolean): Promise<TileRequest.Response> {
    if (!this.terrainProvider.requiresLoadedContent)
      return new Uint8Array();

    const quadId = QuadId.createFromContentId(tile.contentId);
    const tileUrl = this._terrainProvider.constructUrl(quadId.row, quadId.column, quadId.level);
    const tileRequestOptions = this._terrainProvider.requestOptions;

    try {
      const response = await request(this._requestContext, tileUrl, tileRequestOptions);
      if (response.status === 200)
        return new Uint8Array(response.body);

      return undefined;

    } catch (error) {
      return undefined;
    }
  }

  public override forceTileLoad(tile: Tile): boolean {
    return this._terrainProvider.forceTileLoad(tile);
  }
  public override async loadTileContent(tile: MapTile, data: TileRequest.ResponseData, system: RenderSystem, isCanceled?: () => boolean): Promise<TerrainTileContent> {
    if (undefined === isCanceled)
      isCanceled = () => !tile.isLoading;

    const quadId = QuadId.createFromContentId(tile.contentId);
    const mesh = await this._terrainProvider.getMesh(tile, data as Uint8Array);
    if (undefined === mesh)
      return {};
    if (isCanceled())
      return {};

    const projection = tile.getProjection(tile.heightRange);
    const terrainGeometry = system.createRealityMeshFromTerrain(mesh, projection.transformFromLocal);

    let unavailableChild = false;
    if (quadId.level < this.maxDepth) {
      const childIds = quadId.getChildIds();
      for (const childId of childIds) {
        if (!this._terrainProvider.isTileAvailable(childId)) {
          unavailableChild = true;
          break;
        }
      }
    }

    return {
      contentRange: projection.transformFromLocal.multiplyRange(projection.localRange),
      terrain: {
        mesh: unavailableChild ? mesh : undefined, // If a child is unavilable retain mesh for upsampling.,
        geometry: terrainGeometry,
      },
    };
  }

  public getChildHeightRange(quadId: QuadId, rectangle: MapCartoRectangle, parent: MapTile): Range1d | undefined {
    return this._terrainProvider.getChildHeightRange(quadId, rectangle, parent);
  }

  public async loadChildren(_tile: RealityTile): Promise<Tile[] | undefined> {
    assert(false); // children are generated synchronously in MapTile....
    return undefined;
  }
}
