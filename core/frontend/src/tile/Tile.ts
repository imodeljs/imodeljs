/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, dispose } from "@bentley/bentleyjs-core";
import { Arc3d, ClipPlaneContainment, Matrix4d, Point2d, Point3d, Point4d, Range3d, Transform, Vector3d } from "@bentley/geometry-core";
import { BoundingSphere, ColorDef, ElementAlignedBox3d, Frustum, FrustumPlanes } from "@bentley/imodeljs-common";
import { IModelApp } from "../IModelApp";
import { IModelConnection } from "../IModelConnection";
import { GraphicBuilder } from "../render/GraphicBuilder";
import { RenderGraphic } from "../render/RenderGraphic";
import { RenderMemory } from "../render/RenderMemory";
import { RenderSystem } from "../render/RenderSystem";
import { SceneContext } from "../ViewContext";
import { Viewport } from "../Viewport";
import {
  LRUTileListNode, TileContent, TileDrawArgs, TileParams, TileRequest, TileRequestChannel, TileTree, TileTreeLoadStatus, TileUsageMarker, ViewportIdSet,
} from "./internal";

// cSpell:ignore undisplayable bitfield

const scratchRange2d = [new Point2d(), new Point2d(), new Point2d(), new Point2d()];

/** @internal */
export function addRangeGraphic(builder: GraphicBuilder, range: Range3d, is2d: boolean): void {
  if (!is2d) {
    builder.addRangeBox(range);
    return;
  }

  // 3d box is useless in 2d and will be clipped by near/far planes anyway
  const pts = scratchRange2d;
  pts[0].set(range.low.x, range.low.y);
  pts[1].set(range.high.x, range.low.y);
  pts[2].set(range.high.x, range.high.y);
  pts[3].set(range.low.x, range.high.y);
  builder.addLineString2d(pts, 0);
}

const scratchWorldFrustum = new Frustum();
const scratchRootFrustum = new Frustum();
const scratchWorldSphere = new BoundingSphere();
const scratchPoint4d = Point4d.createZero();
const scratchFrustum = new Frustum();

/** A 3d tile within a [[TileTree]].
 *
 * A tile represents the contents of some sub-volume of the tile tree's volume. It may produce graphics representing those contents, or may have no graphics.
 * A tile can have child tiles that further sub-divide its own volume, providing higher-resolution representations of its contents. A tile that has no children is
 * referred to as a "leaf" of the tile tree. A non-leaf tile's children are produced when they are needed, and discarded when no longer needed.
 * A tile's contents can be discarded at any time by [[TileAdmin]] when GPU memory needs to be reclaimed; or when the Tile itself is discarded via
 * [[Tile.dispose]].
 *
 * Several public [[Tile]] methods carry a warning that they should **not** be overridden by subclasses; typically a protected method exists that can be overridden instead.
 * For example, [[loadChildren]] should not be overridden, but it calls [[_loadChildren]], which must be overridden because it is abstract.
 * @public
 */
export abstract class Tile {
  private _state: TileState = TileState.NotReady;
  private _children: Tile[] | undefined;
  private _rangeGraphic?: RenderGraphic;
  private _rangeGraphicType: TileBoundingBoxes = TileBoundingBoxes.None;
  /** This tile's renderable content. */
  protected _graphic?: RenderGraphic;
  /** True if this tile ever had graphics loaded. Used to determine when a tile's graphics were later freed to conserve memory. */
  protected _hadGraphics = false;
  /** Uniquely identifies this tile's content in the context of its tree. */
  protected _contentId: string;
  /** The current loading state of this tile's children. Child tiles are loaded on-demand, potentially asynchronously. */
  protected _childrenLoadStatus: TileTreeLoadStatus;
  /** @internal */
  protected _request?: TileRequest;
  /** @internal */
  protected _isLeaf: boolean;
  /** A volume no larger than this tile's `range`, and optionally more tightly encompassing its contents, used for more accurate culling.
   * [[contentRange]] uses this range if defined; otherwise it uses [[range]].
   */
  protected _contentRange?: ElementAlignedBox3d;
  /** The maximum size in pixels this tile can be drawn. If the size of the tile on screen exceeds this maximum, a higher-resolution tile should be drawn in its place. */
  protected _maximumSize: number;
  /** The [[TileTree]] to which this tile belongs. */
  public readonly tree: TileTree;
  /** The volume of space occupied by this tile. Its children are guaranteed to also be contained within this volume. */
  public readonly range: ElementAlignedBox3d;
  /** The parent of this tile, or undefined if it is the [[TileTree]]'s root tile. */
  public readonly parent: Tile | undefined;
  /** The depth of this tile within its [[TileTree]]. The root tile has a depth of zero. */
  public readonly depth: number;
  /** The bounding sphere for this tile. */
  public  readonly boundingSphere: BoundingSphere;
  /** The point at the center of this tile's volume. */
  public get center(): Point3d { return this.boundingSphere.center; }
  /** The radius of a sphere fully encompassing this tile's volume - used for culling. */
  public get radius(): number { return this.boundingSphere.radius; }
  /** Tracks the usage of this tile. After a period of disuse, the tile may be [[prune]]d to free up memory. */
  public readonly usageMarker = new TileUsageMarker();

  /** Exclusively for use by LRUTileList. @internal */
  public previous?: LRUTileListNode;
  /** Exclusively for use by LRUTileList. @internal */
  public next?: LRUTileListNode;
  /** Exclusively for use by LRUTileList. @internal */
  public bytesUsed = 0;
  /** Exclusively for use by LRUTileList. @internal */
  public viewportIds?: ViewportIdSet;

  /** Load this tile's children, possibly asynchronously. Pass them to `resolve`, or an error to `reject`. */
  protected abstract _loadChildren(resolve: (children: Tile[] | undefined) => void, reject: (error: Error) => void): void;

  /** Return the channel via which this tile's content should be requested.
   * @note The channel *must* be registered with `IModelApp.tileAdmin.channels`.
   * @see [[TileRequestChannels.getForHttp]] to create a channel that requests content over HTTP.
   * @see [[TileAdmin.channels]].
   * @public
   */
  public abstract get channel(): TileRequestChannel;

  /** Return a Promise that resolves to the raw data representing this tile's content. */
  public abstract requestContent(isCanceled: () => boolean): Promise<TileRequest.Response>;

  /** Return a Promise that deserializes this tile's content from raw format produced by [[requestContent]]. */
  public abstract readContent(data: TileRequest.ResponseData, system: RenderSystem, isCanceled?: () => boolean): Promise<TileContent>;

  /** Constructor */
  protected constructor(params: TileParams, tree: TileTree) {
    this.tree = tree;
    this.parent = params.parent;
    this.depth = undefined !== this.parent ? this.parent.depth + 1 : 0;
    this.range = params.range;
    this._maximumSize = params.maximumSize;
    this._contentRange = params.contentRange;
    this._contentId = params.contentId;

    const center = this.range.low.interpolate(0.5, this.range.high);
    const radius = 0.5 * this.range.low.distance(this.range.high);
    this.boundingSphere = new BoundingSphere(center, radius);

    if (params.maximumSize <= 0)
      this.setIsReady();

    this._isLeaf = true === params.isLeaf;
    this._childrenLoadStatus = (undefined !== tree.maxDepth && this.depth < tree.maxDepth) ? TileTreeLoadStatus.NotLoaded : TileTreeLoadStatus.Loaded;
  }

  /** Free memory-consuming resources owned by this tile to reduce memory pressure.
   * By default, this calls [[disposeContents]]. Problematic subclasses (MapTile, ImageryMapTile) may opt out for now by overriding this method to do nothing.
   * That option may be removed in the future.
   * @alpha
   */
  public freeMemory(): void {
    this.disposeContents();
  }

  /** Dispose of resources held by this tile. */
  public disposeContents(): void {
    this._state = TileState.NotReady;
    this._graphic = dispose(this._graphic);
    this._rangeGraphic = dispose(this._rangeGraphic);
    this._rangeGraphicType = TileBoundingBoxes.None;
    IModelApp.tileAdmin.onTileContentDisposed(this);
  }

  /** Dispose of resources held by this tile and all of its children, marking it and all of its children as "abandoned". */
  public dispose(): void {
    this.disposeContents();
    this._state = TileState.Abandoned;
    this.disposeChildren();
  }

  /** This tile's child tiles, if they exist and are loaded. The children are fully contained within this tile's volume and provide higher-resolution graphics than this tile.
   * @see [[loadChildren]]
   */
  public get children(): Tile[] | undefined { return this._children; }
  /** The [[IModelConnection]] to which this tile belongs. */
  public get iModel(): IModelConnection { return this.tree.iModel; }
  /** Uniquely identifies this tile's content. */
  public get contentId(): string { return this._contentId; }

  /** True if this tile's content is currently being loaded. */
  public get isLoading(): boolean { return TileLoadStatus.Loading === this.loadStatus; }
  /** True if a request for this tile's content has been enqueued. */
  public get isQueued(): boolean { return TileLoadStatus.Queued === this.loadStatus; }
  /** True if an attempt to load this tile's content failed. */
  public get isNotFound(): boolean { return TileLoadStatus.NotFound === this.loadStatus; }
  /** True if this tile's content has been loaded and is ready to be drawn. */
  public get isReady(): boolean { return TileLoadStatus.Ready === this.loadStatus; }

  /** @public */
  public setNotFound(): void {
    this._state = TileState.NotFound;
  }

  /** @public */
  public setIsReady(): void {
    if (this.hasGraphics)
      this._hadGraphics = true;

    this._state = TileState.Ready;
    IModelApp.tileAdmin.onTileContentLoaded(this);
  }

  /** @public */
  public setLeaf(): void {
    // Don't potentially re-request the children later.
    this.disposeChildren();
    this._isLeaf = true;
    this._childrenLoadStatus = TileTreeLoadStatus.Loaded;
  }

  /** True if this tile has no child tiles. */
  public get isLeaf(): boolean { return this._isLeaf; }
  /** @internal */
  public get isEmpty(): boolean { return this.isReady && !this.hasGraphics && this.isLeaf; }
  /** @internal */
  public get isDisplayable(): boolean { return 0 < this.maximumSize; }
  /** The maximum size in pixels this tile can be drawn. If the size of the tile on screen exceeds this maximum, a higher-resolution tile should be drawn in its place. */
  public get maximumSize(): number { return this._maximumSize; }
  /** @internal */
  public get isParentDisplayable(): boolean { return undefined !== this.parent && this.parent.isDisplayable; }
  /** @internal */
  public get isUndisplayableRootTile(): boolean { return undefined === this.parent && !this.isDisplayable; }

  /** @internal */
  public get request(): TileRequest | undefined { return this._request; }
  public set request(request: TileRequest | undefined) {
    assert(undefined === request || undefined === this.request);
    this._request = request;
  }

  /** Compute the load priority of this tile. This determines which tiles' contents are requested first.
   * @param _viewports The viewports for which the tile has been requested for display.
   * @returns The priority.
   * @see [[TileLoadPriority]] for suggested priority values.
   */
  public computeLoadPriority(_viewports: Iterable<Viewport>): number {
    return this.depth;
  }

  /** True if this tile has graphics ready to draw. */
  public get hasGraphics(): boolean { return undefined !== this._graphic; }
  /** True if this tile has a known volume tightly encompassing its graphics. */
  public get hasContentRange(): boolean { return undefined !== this._contentRange; }
  /** A volume no larger than this tile's `range`, and optionally more tightly encompassing its contents, used for more accurate culling. */
  public get contentRange(): ElementAlignedBox3d {
    if (undefined !== this._contentRange)
      return this._contentRange;
    else if (undefined === this.parent && undefined !== this.tree.contentRange)
      return this.tree.contentRange;
    else
      return this.range;
  }

  /** Tile contents are loaded asynchronously on demand. This member tracks the current loading status of this tile's contents. */
  public get loadStatus(): TileLoadStatus {
    switch (this._state) {
      case TileState.NotReady: {
        if (undefined === this.request)
          return TileLoadStatus.NotLoaded;
        else if (TileRequest.State.Loading === this.request.state)
          return TileLoadStatus.Loading;

        assert(TileRequest.State.Completed !== this.request.state && TileRequest.State.Failed !== this.request.state); // this.request should be undefined in these cases...
        return TileLoadStatus.Queued;
      }
      case TileState.Ready: {
        assert(undefined === this.request);
        return TileLoadStatus.Ready;
      }
      case TileState.NotFound: {
        assert(undefined === this.request);
        return TileLoadStatus.NotFound;
      }
      default: {
        assert(TileState.Abandoned === this._state);
        return TileLoadStatus.Abandoned;
      }
    }
  }

  /** Produce the graphics that should be drawn. */
  public produceGraphics(): RenderGraphic | undefined {
    return this._graphic;
  }

  protected setGraphic(graphic: RenderGraphic | undefined): void {
    dispose(this._graphic);
    this._graphic = graphic;
    this.setIsReady();
  }

  /** Set this tile's content to the result of [[readContent]] */
  public setContent(content: TileContent): void {
    const { graphic, isLeaf, contentRange } = content;
    this.setGraphic(graphic);

    if (undefined !== isLeaf && isLeaf !== this._isLeaf) {
      if (isLeaf)
        this.setLeaf();
      else
        this._isLeaf = false;
    }

    if (undefined !== contentRange)
      this._contentRange = contentRange;

    this.setIsReady();
  }

  /** Disclose any resources owned by this tile, other than its [[RenderGraphic]].
   * @internal
   */
  protected _collectStatistics(_stats: RenderMemory.Statistics): void { }

  /** Disclose resources owned by this tile and (by default) all of its child tiles.
   * @note Do not override this method! Override `_collectStatistics` instead.
   * @internal
   */
  public collectStatistics(stats: RenderMemory.Statistics, includeChildren = true): void {
    if (undefined !== this._graphic)
      this._graphic.collectStatistics(stats);

    this._collectStatistics(stats);
    if (!includeChildren)
      return;

    const children = this.children;
    if (undefined !== children)
      for (const child of children)
        child.collectStatistics(stats);
  }

  /** If this tile's child tiles have not yet been requested, enqueue an asynchronous request to load them.
   * @note This function itself is *not* asynchronous - it immediately returns the current loading status.
   * @note Do not override this method - implement [[_loadChildren]].
   */
  protected loadChildren(): TileTreeLoadStatus {
    if (this._childrenLoadStatus !== TileTreeLoadStatus.NotLoaded)
      return this._childrenLoadStatus;

    this._childrenLoadStatus = TileTreeLoadStatus.Loading;

    this._loadChildren((children: Tile[] | undefined) => {
      this._children = children;
      this._childrenLoadStatus = TileTreeLoadStatus.Loaded;

      if (undefined === children || 0 === children.length)
        this._isLeaf = true;

      IModelApp.tileAdmin.onTileChildrenLoad.raiseEvent(this);
    }, (_error: Error) => {
      this._isLeaf = true;
      this._childrenLoadStatus = TileTreeLoadStatus.NotFound;

      IModelApp.tileAdmin.onTileChildrenLoad.raiseEvent(this);
    });

    return this._childrenLoadStatus;
  }

  /** Dispose of this tile's child tiles and mark them as "not loaded". */
  protected disposeChildren(): void {
    const children = this.children;
    if (undefined === children)
      return;

    for (const child of children)
      child.dispose();

    this._childrenLoadStatus = TileTreeLoadStatus.NotLoaded;
    this._children = undefined;
  }

  /** Returns true if this tile's bounding volume is culled by the frustum or clip volumes specified by `args`. */
  protected isRegionCulled(args: TileDrawArgs): boolean {
    return this.isCulled(this.range, args, true, this.boundingSphere);
  }

  /** Returns true if this tile's content bounding volume is culled by the frustum or clip volumes specified by `args`. */
  protected isContentCulled(args: TileDrawArgs): boolean {
    return this.isCulled(this.contentRange, args, false);
  }

  private isCulled(range: ElementAlignedBox3d, args: TileDrawArgs, testClipIntersection: boolean, sphere?: BoundingSphere) {
    const box = Frustum.fromRange(range, scratchRootFrustum);
    const worldBox = box.transformBy(args.location, scratchWorldFrustum);
    const worldSphere = sphere?.transformBy(args.location, scratchWorldSphere);

    // Test against frustum.
    if (FrustumPlanes.Containment.Outside === args.frustumPlanes.computeFrustumContainment(worldBox, worldSphere))
      return true;

    // Test against TileTree's own clip volume, if any.
    if (undefined !== args.clip && ClipPlaneContainment.StronglyOutside === args.clip.classifyPointContainment(worldBox.points))
      return true;

    // Test against view clip, if any (will be undefined if TileTree does not want view clip applied to it).
    if (undefined !== args.viewClip && ClipPlaneContainment.StronglyOutside === args.viewClip.classifyPointContainment(worldBox.points))
      return true;

    // Test against intersection clip - reject if tile doesn't intersect (used for section-cut graphics).
    if (testClipIntersection && undefined !== args.intersectionClip && ClipPlaneContainment.Ambiguous !== args.intersectionClip.classifyPointContainment(worldBox.points))
      return true;

    return false;
  }

  /** Determine the visibility of this tile according to the specified args. */
  public computeVisibility(args: TileDrawArgs): TileVisibility {
    // NB: We test for region culling before isDisplayable - otherwise we will never unload children of undisplayed tiles when
    // they are outside frustum
    if (this.isEmpty || this.isRegionCulled(args))
      return TileVisibility.OutsideFrustum;

    // some nodes are merely for structure and don't have any geometry
    if (!this.isDisplayable)
      return TileVisibility.TooCoarse;

    if (this.isLeaf) {
      if (this.hasContentRange && this.isContentCulled(args))
        return TileVisibility.OutsideFrustum;
      else
        return TileVisibility.Visible;
    }

    const pixelSize = args.getPixelSize(this) * args.pixelSizeScaleFactor;
    const maxSize = this.maximumSize * args.tileSizeModifier;

    return pixelSize > maxSize ? TileVisibility.TooCoarse : TileVisibility.Visible;
  }

  /** @internal */
  public extendRangeForContent(range: Range3d, matrix: Matrix4d, treeTransform: Transform, frustumPlanes?: FrustumPlanes): void {
    if (this.isEmpty || this.contentRange.isNull)
      return;

    const box = Frustum.fromRange(this.contentRange, scratchFrustum);
    box.transformBy(treeTransform, box);
    if (frustumPlanes !== undefined && FrustumPlanes.Containment.Outside === frustumPlanes.computeFrustumContainment(box))
      return;

    if (this.children === undefined) {
      for (const boxPoint of box.points) {
        const pt = matrix.multiplyPoint3d(boxPoint, 1, scratchPoint4d);
        if (pt.w > .0001)
          range.extendXYZW(pt.x, pt.y, pt.z, pt.w);
        else
          range.high.z = Math.max(1.0, range.high.z);   // behind eye plane...
      }
    } else {
      for (const child of this.children)
        child.extendRangeForContent(range, matrix, treeTransform, frustumPlanes);
    }
  }

  /** Primarily for debugging purposes, compute the number of tiles below this one in the [[TileTree]]. */
  public countDescendants(): number {
    const children = this.children;
    if (undefined === children || 0 === children.length)
      return 0;

    let count = 0;
    for (const child of children)
      count += child.countDescendants();

    return count;
  }

  /** Output this tile's graphics. */
  public drawGraphics(args: TileDrawArgs): void {
    const gfx = this.produceGraphics();
    if (undefined === gfx)
      return;

    args.graphics.add(gfx);
    const rangeGfx = this.getRangeGraphic(args.context);
    if (undefined !== rangeGfx)
      args.graphics.add(rangeGfx);
  }

  /** @internal */
  protected get rangeGraphicColor(): ColorDef {
    return this.isLeaf ? ColorDef.blue : ColorDef.green;
  }

  /** @internal */
  public getRangeGraphic(context: SceneContext): RenderGraphic | undefined {
    const type = context.viewport.debugBoundingBoxes;
    if (type === this._rangeGraphicType)
      return this._rangeGraphic;

    this._rangeGraphic = dispose(this._rangeGraphic);
    this._rangeGraphicType = type;
    if (TileBoundingBoxes.None !== type) {
      const builder = context.createSceneGraphicBuilder();
      this.addRangeGraphic(builder, type);
      this._rangeGraphic = builder.finish();
    }

    return this._rangeGraphic;
  }

  /** @internal */
  protected addRangeGraphic(builder: GraphicBuilder, type: TileBoundingBoxes): void {
    if (TileBoundingBoxes.Both === type) {
      builder.setSymbology(ColorDef.blue, ColorDef.blue, 1);
      addRangeGraphic(builder, this.range, this.tree.is2d);

      if (this.hasContentRange) {
        builder.setSymbology(ColorDef.red, ColorDef.red, 1);
        addRangeGraphic(builder, this.contentRange, this.tree.is2d);
      }
    } else if (TileBoundingBoxes.Sphere === type) {
      builder.setSymbology(ColorDef.green, ColorDef.green, 1);

      const x = new Vector3d(this.radius, 0, 0);
      const y = new Vector3d(0, this.radius, 0);
      const z = new Vector3d(0, 0, this.radius);

      builder.addArc(Arc3d.create(this.center, x, y), false, false);
      builder.addArc(Arc3d.create(this.center, x, z), false, false);
      builder.addArc(Arc3d.create(this.center, y, z), false, false);
    } else {
      const color = this.rangeGraphicColor;
      builder.setSymbology(color, color, 1);
      const range = TileBoundingBoxes.Content === type ? this.contentRange : this.range;
      addRangeGraphic(builder, range, this.tree.is2d);
    }
  }

  /** Optional corners used to compute the screen size of the tile. These are used, e.g., by reality tiles with oriented bounding boxes to
   * produce more accurate size calculation.
   */
  public getSizeProjectionCorners(): Point3d[] | undefined { return undefined; }
}

/** Describes the current status of a [[Tile]]'s content. Tile content is loaded via an asynchronous [[TileRequest]].
 * @see [[Tile.loadStatus]].
 * @public
 */
export enum TileLoadStatus {
  /** No attempt to load the tile's content has been made, or the tile has since been unloaded. It currently has no graphics. */
  NotLoaded = 0,
  /** A request has been dispatched to load the tile's contents, and a response is pending. */
  Queued = 1,
  /** A response has been received and the tile's graphics and other data are being loaded on the frontend. */
  Loading = 2,
  /** The tile has been loaded, and if the tile is displayable it has graphics. */
  Ready = 3,
  /** A request to load the tile's contents failed. */
  NotFound = 4,
  /** The tile has been disposed. */
  Abandoned = 5,
}

/**
 * Describes the visibility of a tile based on its size and a view frustum.
 * @public
 */
export enum TileVisibility {
  /** The tile is entirely outside of the viewing frustum. */
  OutsideFrustum,
  /** The tile's graphics are of too low a resolution for the viewing frustum. */
  TooCoarse,
  /** The tile's graphics are of appropriate resolution for the viewing frustum. */
  Visible,
}

/**
 * Loosely describes the "importance" of a [[Tile]]. Requests for tiles of greater "importance" are prioritized for loading.
 * @note A lower priority value indicates higher importance.
 * @public
 */
export enum TileLoadPriority {
  /** Contents of geometric models that are being interactively edited. */
  Dynamic = 5,
  /** Background map tiles. */
  Map = 15,
  /** Typically, tiles generated from the contents of geometric models. */
  Primary = 20,
  /** 3d terrain tiles onto which background map imagery is draped. */
  Terrain = 10,
  /** Typically, reality models. */
  Context = 40,
  /** Supplementary tiles used to classify the contents of geometric or reality models. */
  Classifier = 50,
}

/**
 * Options for displaying tile bounding boxes for debugging purposes.
 *
 * Bounding boxes are color-coded based on refinement strategy:
 *  - Blue: A leaf tile (has no child tiles).
 *  - Green: An ordinary tile (sub-divides into 4 or 8 child tiles).
 *  - Red: A tile which refines to a single higher-resolution child occupying the same volume.
 * @see [[Viewport.debugBoundingBoxes]]
 * @public
 */
export enum TileBoundingBoxes {
  /** Display no bounding boxes */
  None = 0,
  /** Display boxes representing the tile's full volume. */
  Volume,
  /** Display boxes representing the range of the tile's contents, which may be tighter than (but never larger than) the tile's full volume. */
  Content,
  /** Display both volume and content boxes. */
  Both,
  /** Display boxes for direct children, where blue boxes indicate empty volumes. */
  ChildVolumes,
  /** Display bounding sphere. */
  Sphere,
}

// TileLoadStatus is computed from the combination of Tile._state and, if Tile.request is defined, Tile.request.state.
const enum TileState {// eslint-disable-line no-restricted-syntax
  NotReady = TileLoadStatus.NotLoaded, // Tile requires loading, but no request has yet completed.
  Ready = TileLoadStatus.Ready, // request completed successfully, or no loading was required.
  NotFound = TileLoadStatus.NotFound, // request failed.
  Abandoned = TileLoadStatus.Abandoned, // tile was abandoned.
}
