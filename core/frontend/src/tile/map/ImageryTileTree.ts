/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, compareBooleans, compareNumbers, compareStrings, compareStringsOrUndefined, dispose } from "@bentley/bentleyjs-core";
import { Angle, Range3d, Transform } from "@bentley/geometry-core";
import { Cartographic, ImageSource, ImageSourceFormat, MapLayerSettings, RenderTexture, ViewFlagOverrides } from "@bentley/imodeljs-common";
import { imageElementFromImageSource } from "../../ImageUtil";
import { IModelApp } from "../../IModelApp";
import { IModelConnection } from "../../IModelConnection";
import { RenderMemory } from "../../render/RenderMemory";
import { RenderSystem } from "../../render/RenderSystem";
import { ScreenViewport, Viewport } from "../../Viewport";
import {
  MapCartoRectangle, MapLayerImageryProvider, MapLayerTileTreeReference, MapTile, QuadId, RealityTile, RealityTileLoader, RealityTileTree,
  RealityTileTreeParams, Tile, TileContent, TileDrawArgs, TileLoadPriority, TileParams, TileRequest, TileTree, TileTreeLoadStatus, TileTreeOwner,
  TileTreeSupplier,
} from "../internal";
import { WebMercatorTilingScheme } from "./MapTilingScheme";

/** @internal */
export interface ImageryTileContent extends TileContent {
  imageryTexture?: RenderTexture;
}

/** @internal */
export class ImageryMapTile extends RealityTile {
  private _texture?: RenderTexture;
  private _mapTileUsageCount = 0;
  constructor(params: TileParams, public imageryTree: ImageryMapTileTree, public quadId: QuadId, public rectangle: MapCartoRectangle) {
    super(params, imageryTree);
  }
  public get texture() { return this._texture; }
  public get tilingScheme() { return this.imageryTree.tilingScheme; }
  public override get isDisplayable() { return (this.depth > 1) && super.isDisplayable; }

  public override setContent(content: ImageryTileContent): void {
    this._texture = content.imageryTexture;        // No dispose - textures may be shared by terrain tiles so let garbage collector dispose them.
    if (undefined === content.imageryTexture)
      (this.parent! as ImageryMapTile).setLeaf();   // Avoid traversing bing branches after no graphics is found.

    this.setIsReady();
  }

  public selectCartoDrapeTiles(drapeTiles: ImageryMapTile[], rectangleToDrape: MapCartoRectangle, drapePixelSize: number, args: TileDrawArgs): TileTreeLoadStatus {
    if (this.isDisplayable && (this.isLeaf || (this.rectangle.yLength() / this.maximumSize) < drapePixelSize || this._anyChildNotFound)) {
      if (!this.isNotFound)
        drapeTiles.push(this);
      return TileTreeLoadStatus.Loaded;
    }

    let status = this.loadChildren();
    if (TileTreeLoadStatus.Loading === status) {
      args.markChildrenLoading();
    } else if (TileTreeLoadStatus.Loaded === status) {
      if (undefined !== this.children) {
        for (const child of this.children) {
          const mapChild = child as ImageryMapTile;
          if (mapChild.rectangle.intersectsRange(rectangleToDrape))
            status = mapChild.selectCartoDrapeTiles(drapeTiles, rectangleToDrape, drapePixelSize, args);
          if (TileTreeLoadStatus.Loaded !== status)
            break;
        }
      }
    }
    return status;
  }
  public markMapTileUsage() {
    this._mapTileUsageCount++;
  }
  public releaseMapTileUsage() {
    assert(!this._texture || this._mapTileUsageCount > 0);
    if (this._mapTileUsageCount)
      this._mapTileUsageCount--;
  }

  /** @internal */
  public override setLeaf(): void {
    // Don't potentially re-request the children later.
    this.disposeChildren();
    this._isLeaf = true;
    this._childrenLoadStatus = TileTreeLoadStatus.Loaded;
  }

  protected override _loadChildren(resolve: (children: Tile[] | undefined) => void, _reject: (error: Error) => void): void {

    const imageryTree = this.imageryTree;
    const resolveChildren = () => {
      const columnCount = 2, rowCount = 2;
      const level = this.quadId.level + 1;
      const column = this.quadId.column * 2;
      const row = this.quadId.row * 2;
      const children = [];
      const childrenAreLeaves = (this.depth + 1) === imageryTree.maxDepth;

      // If children depth is lower than min LOD, mark them as disabled.
      // This is important: if those tiles are requested and the server refuse to serve them,
      // they will be marked as not found and their descendant will never be displayed.
      const childrenAreDisabled = (this.depth + 1) < imageryTree.minDepth;
      const tilingScheme = imageryTree.tilingScheme;
      for (let j = 0; j < rowCount; j++) {
        for (let i = 0; i < columnCount; i++) {
          const quadId = new QuadId(level, column + i, row + j);
          const rectangle = tilingScheme.tileXYToRectangle(quadId.column, quadId.row, quadId.level);
          const range = Range3d.createXYZXYZ(rectangle.low.x, rectangle.low.x, 0, rectangle.high.x, rectangle.high.y, 0);
          const maximumSize = (childrenAreDisabled ?  0 : imageryTree.imageryLoader.maximumScreenSize);
          children.push(new ImageryMapTile({ parent: this, isLeaf: childrenAreLeaves, contentId: quadId.contentId, range, maximumSize }, imageryTree, quadId, rectangle));
        }
      }
      resolve(children);
    };

    imageryTree.imageryLoader.testChildAvailability(this, resolveChildren);
  }

  protected override _collectStatistics(stats: RenderMemory.Statistics): void {
    super._collectStatistics(stats);
    if (this._texture)
      stats.addTexture(this._texture.bytesUsed);
  }

  public override freeMemory(): void {
    // ###TODO MapTiles and ImageryMapTiles share resources and don't currently interact well with TileAdmin.freeMemory(). Opt out for now.
  }

  public override disposeContents() {
    if (0 === this._mapTileUsageCount) {
      super.disposeContents();
      this.disposeTexture();
    }
  }

  private disposeTexture(): void {
    this._texture = dispose(this._texture);
  }
  public override dispose() {
    this._mapTileUsageCount = 0;
    super.dispose();
  }
}

/** @internal */
export class ImageryMapTileTree extends RealityTileTree {
  public tilingScheme = new WebMercatorTilingScheme();
  constructor(params: RealityTileTreeParams, private _imageryLoader: ImageryTileLoader) {
    super(params);
    const rootQuadId = new QuadId(0, 0, 0);
    this._rootTile = new ImageryMapTile(params.rootTile, this, rootQuadId, this.getTileRectangle(rootQuadId));
  }
  public getLogo(vp: ScreenViewport): HTMLTableRowElement | undefined { return this._imageryLoader.getLogo(vp); }
  public getTileRectangle(quadId: QuadId): MapCartoRectangle {
    return this.tilingScheme.tileXYToRectangle(quadId.column, quadId.row, quadId.level);
  }
  public get imageryLoader(): ImageryTileLoader { return this._imageryLoader; }
  public override get is3d(): boolean { assert(false); return false; }
  public override get viewFlagOverrides(): ViewFlagOverrides { assert(false); return new ViewFlagOverrides(); }
  public override get isContentUnbounded(): boolean { assert(false); return true; }
  protected override _selectTiles(_args: TileDrawArgs): Tile[] { assert(false); return []; }
  public override draw(_args: TileDrawArgs): void { assert(false); }

  private static _scratchDrapeRectangle = new MapCartoRectangle();
  private static _drapeIntersectionScale = 1.0 - 1.0E-5;

  public selectCartoDrapeTiles(drapeTiles: ImageryMapTile[], tileToDrape: MapTile, args: TileDrawArgs): TileTreeLoadStatus {
    const drapeRectangle = tileToDrape.rectangle.clone(ImageryMapTileTree._scratchDrapeRectangle);
    const drapePixelSize = 1.05 * tileToDrape.rectangle.yLength() / tileToDrape.maximumSize;
    drapeRectangle.scaleAboutCenterInPlace(ImageryMapTileTree._drapeIntersectionScale);    // Contract slightly to avoid draping adjacent or slivers.
    return (this.rootTile as ImageryMapTile).selectCartoDrapeTiles(drapeTiles, drapeRectangle, drapePixelSize, args);
  }
  public cartoRectangleFromQuadId(quadId: QuadId): MapCartoRectangle { return this.tilingScheme.tileXYToRectangle(quadId.column, quadId.row, quadId.level); }
}

class ImageryTileLoader extends RealityTileLoader {
  constructor(private _imageryProvider: MapLayerImageryProvider, private _iModel: IModelConnection) {
    super();
  }
  public override computeTilePriority(tile: Tile, _viewports: Iterable<Viewport>): number {
    return 25 * (this._imageryProvider.usesCachedTiles ? 2 : 1) - tile.depth;     // Always cached first then descending by depth (high resolution/front first)
  }  // Prioritized fast, cached tiles first.

  public get maxDepth(): number { return this._imageryProvider.maximumZoomLevel; }
  public get minDepth(): number { return this._imageryProvider.minimumZoomLevel; }
  public get priority(): TileLoadPriority { return TileLoadPriority.Map; }
  public getLogo(vp: ScreenViewport): HTMLTableRowElement | undefined { return this._imageryProvider.getLogo(vp); }
  public get maximumScreenSize(): number { return this._imageryProvider.maximumScreenSize; }
  public get imageryProvider(): MapLayerImageryProvider { return this._imageryProvider; }
  public async getToolTip(strings: string[], quadId: QuadId, carto: Cartographic, tree: ImageryMapTileTree): Promise<void> { await this._imageryProvider.getToolTip(strings, quadId, carto, tree); }
  public testChildAvailability(tile: ImageryMapTile, resolveChildren: () => void) { return this._imageryProvider.testChildAvailability(tile, resolveChildren); }

  /** Load this tile's children, possibly asynchronously. Pass them to `resolve`, or an error to `reject`. */
  public async loadChildren(_tile: RealityTile): Promise<Tile[] | undefined> { assert(false); return undefined; }
  public async requestTileContent(tile: Tile, _isCanceled: () => boolean): Promise<TileRequest.Response> {
    const quadId = QuadId.createFromContentId(tile.contentId);
    return this._imageryProvider.loadTile(quadId.row, quadId.column, quadId.level);
  }

  public getRequestChannel(_tile: Tile) {
    // ###TODO use hostname from url - but so many layers to go through to get that...
    return IModelApp.tileAdmin.channels.getForHttp("itwinjs-imagery");
  }

  public override async loadTileContent(tile: Tile, data: TileRequest.ResponseData, system: RenderSystem, isCanceled?: () => boolean): Promise<ImageryTileContent> {
    if (undefined === isCanceled)
      isCanceled = () => !tile.isLoading;

    assert(data instanceof ImageSource);
    assert(tile instanceof ImageryMapTile);
    const content: ImageryTileContent = {};
    const texture = await this.loadTextureImage(data, this._iModel, system, isCanceled);
    if (undefined === texture)
      return content;

    content.imageryTexture = texture;
    return content;
  }

  private async loadTextureImage(imageSource: ImageSource, iModel: IModelConnection, system: RenderSystem, isCanceled: () => boolean): Promise<RenderTexture | undefined> {
    try {
      const textureParams = new RenderTexture.Params(undefined, RenderTexture.Type.FilteredTileSection);

      return await imageElementFromImageSource(imageSource)
        .then((image) => isCanceled() ? undefined : system.createTextureFromImage(image, ImageSourceFormat.Png === imageSource.format, iModel, textureParams))
        .catch((_) => undefined);
    } catch (e) {
      return undefined;
    }
  }
}
interface ImageryMapLayerTreeId {
  settings: MapLayerSettings;
}

/** Supplies a TileTree that can load and draw tiles based on our imagery provider.
 * The TileTree is uniquely identified by its imagery type.
 */
class ImageryMapLayerTreeSupplier implements TileTreeSupplier {
  /** Return a numeric value indicating how two tree IDs are ordered relative to one another.
   * This allows the ID to serve as a lookup key to find the corresponding TileTree.
   */
  public compareTileTreeIds(lhs: ImageryMapLayerTreeId, rhs: ImageryMapLayerTreeId): number {
    let cmp = compareStrings(lhs.settings.url, rhs.settings.url);
    if (0 === cmp) {
      cmp = compareStringsOrUndefined(lhs.settings.userName, rhs.settings.userName);
      if (0 === cmp) {
        cmp = compareStringsOrUndefined(lhs.settings.password, rhs.settings.password);
        if (0 === cmp) {
          cmp = compareBooleans(lhs.settings.transparentBackground, rhs.settings.transparentBackground);
          if (0 === cmp) {
            cmp = compareNumbers(lhs.settings.subLayers.length, rhs.settings.subLayers.length);
            if (0 === cmp) {
              for (let i = 0; i < lhs.settings.subLayers.length && 0 === cmp; i++)
                cmp = compareBooleans(lhs.settings.subLayers[i].visible, rhs.settings.subLayers[i].visible);
            }
          }
        }
      }
    }

    return cmp;
  }

  /** The first time a tree of a particular imagery type is requested, this function creates it. */
  public async createTileTree(id: ImageryMapLayerTreeId, iModel: IModelConnection): Promise<TileTree | undefined> {
    const imageryProvider = IModelApp.mapLayerFormatRegistry.createImageryProvider(id.settings);
    if (undefined === imageryProvider)
      return undefined;

    await imageryProvider.initialize();
    const modelId = iModel.transientIds.next;
    const rootTileId = new QuadId(0, 0, 0).contentId;
    const rootRange = Range3d.createXYZXYZ(-Angle.piRadians, -Angle.piOver2Radians, 0, Angle.piRadians, Angle.piOver2Radians, 0);
    const rootTileProps = { contentId: rootTileId, range: rootRange, maximumSize: 0 };
    const loader = new ImageryTileLoader(imageryProvider, iModel);
    const treeProps = { rootTile: rootTileProps, id: modelId, modelId, iModel, location: Transform.createIdentity(), priority: TileLoadPriority.Map, loader };
    return new ImageryMapTileTree(treeProps, loader);
  }
}

const imageryTreeSupplier = new ImageryMapLayerTreeSupplier();

/** A reference to one of our tile trees. The specific TileTree drawn may change when the desired imagery type or target iModel changes.
 * @internal
 */
export class ImageryMapLayerTreeReference extends MapLayerTileTreeReference {
  public iModel: IModelConnection;

  public constructor(layerSettings: MapLayerSettings, layerIndex: number, iModel: IModelConnection) {
    super(layerSettings, layerIndex);
    this.iModel = iModel;
  }

  public override get castsShadows() { return false; }
  public get layerName() { return this._layerSettings.name; }

  /** Return the owner of the TileTree to draw. */
  public get treeOwner(): TileTreeOwner {
    return this.iModel.tiles.getTileTreeOwner({ settings: this._layerSettings }, imageryTreeSupplier);
  }
  public get imageryProvider(): MapLayerImageryProvider | undefined {
    const tree = this.treeOwner.load();
    if (!tree || !(tree instanceof ImageryMapTileTree))
      return undefined;

    return tree.imageryLoader.imageryProvider;
  }
}
