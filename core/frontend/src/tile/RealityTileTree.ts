/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, BeTimePoint } from "@bentley/bentleyjs-core";
import { ConvexClipPlaneSet, GrowableXYZArray, LineString3d, PolyfaceQuery, Range3d, Transform } from "@bentley/geometry-core";
import { ColorDef, Frustum, FrustumPlanes, ViewFlagOverrides } from "@bentley/imodeljs-common";
import { IModelApp } from "../IModelApp";
import { GraphicBranch } from "../render/GraphicBranch";
import { GraphicBuilder } from "../render/GraphicBuilder";
import { SceneContext } from "../ViewContext";
import { Viewport } from "../Viewport";
import { GraphicsCollectorDrawArgs, MapTile, RealityTile, RealityTileDrawArgs, RealityTileGeometry, RealityTileLoader, RealityTileParams, Tile, TileDrawArgs, TileGraphicType, TileParams, TileTree, TileTreeParams } from "./internal";

/** @internal */
export class TraversalDetails {
  public queuedChildren = new Array<Tile>();
  public childrenLoading = false;
  public childrenSelected = false;

  public initialize() {
    this.queuedChildren.length = 0;
    this.childrenLoading = false;
    this.childrenSelected = false;
  }
}
/** @internal */
export class TraversalChildrenDetails {
  private _childDetails: TraversalDetails[] = [];

  public initialize() {
    for (const child of this._childDetails)
      child.initialize();
  }
  public getChildDetail(index: number) {
    while (this._childDetails.length <= index)
      this._childDetails.push(new TraversalDetails());

    return this._childDetails[index];
  }

  public combine(parentDetails: TraversalDetails) {
    parentDetails.queuedChildren.length = 0;
    parentDetails.childrenLoading = false;
    parentDetails.childrenSelected = false;
    for (const child of this._childDetails) {
      parentDetails.childrenLoading = parentDetails.childrenLoading || child.childrenLoading;
      parentDetails.childrenSelected = parentDetails.childrenSelected || child.childrenSelected;
      for (const queuedChild of child.queuedChildren)
        parentDetails.queuedChildren.push(queuedChild);
    }
  }
}

/** @internal */
export class TraversalSelectionContext {
  public preloaded = new Set<RealityTile>();
  public missing = new Array<RealityTile>();
  public get selectionCountExceeded() { return this._maxSelectionCount === undefined ? false : (this.missing.length + this.selected.length) > this._maxSelectionCount; }   // Avoid selecting excessive number of tiles.
  constructor(public selected: Tile[], public displayedDescendants: Tile[][], public preloadDebugBuilder?: GraphicBuilder, private _maxSelectionCount?: number) { }

  public selectOrQueue(tile: RealityTile, args: TileDrawArgs, traversalDetails: TraversalDetails) {
    tile.selectSecondaryTiles(args, this);
    tile.markUsed(args);
    if (tile.isReady) {
      args.markReady(tile);
      this.selected.push(tile);
      tile.markDisplayed();
      this.displayedDescendants.push((traversalDetails.childrenSelected) ? traversalDetails.queuedChildren.slice() : []);
      traversalDetails.queuedChildren.length = 0;
      traversalDetails.childrenLoading = false;
      traversalDetails.childrenSelected = true;
    } else if (!tile.isNotFound) {
      traversalDetails.queuedChildren.push(tile);
      if (!tile.isLoaded)
        this.missing.push(tile);
    }
  }

  public preload(tile: RealityTile, args: TileDrawArgs): void {
    if (!this.preloaded.has(tile)) {
      if (this.preloadDebugBuilder)
        tile.addBoundingGraphic(this.preloadDebugBuilder, ColorDef.red);

      tile.markUsed(args);
      tile.selectSecondaryTiles(args, this);
      this.preloaded.add(tile);
      if (!tile.isNotFound && !tile.isLoaded)
        this.missing.push(tile);
    }
  }

  public select(tiles: RealityTile[], args: TileDrawArgs): void {
    for (const tile of tiles) {
      tile.markUsed(args);
      this.selected.push(tile);
      this.displayedDescendants.push([]);
    }
  }
}

const scratchFrustum = new Frustum();
const scratchFrustumPlanes = new FrustumPlanes();

/** @internal */
export interface RealityTileTreeParams extends TileTreeParams {
  readonly loader: RealityTileLoader;
  readonly yAxisUp?: boolean;
  readonly rootTile: RealityTileParams;
}

/** The return status for collecting a tile with [[RealityTileCollector.SelectTile]]
 * @alpha
 */
export enum RealityTileCollectionSelectionStatus { Continue, Reject, Accept }

/**  The return status for collecting a set of tiles with [[RealityTileTree.collectTiles.
 * @alpha
 */
export enum RealityTileCollectionStatus { Loading, Success }

/** @alpha */
export enum RealityTileDrapeStatus { Loading, Success, Error }

/** Base class for a collecting reality tiles from a [[RealityTileTree]].
 * @alpha
 */
export abstract class RealityTileCollector {
  public acceptedGeometry(): RealityTileGeometry[] {
    const geometry = new Array<RealityTileGeometry>();
    for (const accepted of this.accepted) {
      if (accepted.geometry)
        geometry.push(accepted.geometry);
    }

    return geometry;
  }

  /** Missing (not yet loaded) tiles.  Loading of these tiles can be requested by calling [[RealityTileCollector.requestMissingTiles]].
   * @internal
  */
  public missing = new Set<RealityTile>();
  /** The accepted tiles. If [[RealityTileTree.collectTiles]] returns [[RealityTileCollectionStatus.Success]] then this contains complete
   * collection of loaded tiles accepted by [[RealityTileCollector.selectTile]].
   * @internal
   */
  public accepted = new Array<RealityTile>();

  protected constructor(private _tolerance: number, private _range: Range3d, protected _iModelTransform: Transform) {  }

  private _childrenLoading = false;

  /** @internal */
  public markChildrenLoading() {
    this._childrenLoading = true;
  }
  /** @internal */
  public get loadingComplete() {
    return !this._childrenLoading && 0 === this.missing.size;
  }

  /** Request missing (unloaded) tiles.  Call this method if [[RealityTileTree.collectTiles]] returns [[RealityTileCollectionStatus.Loading]]. */
  public requestMissingTiles(viewport: Viewport) {
    IModelApp.tileAdmin.requestTiles(viewport, this.missing);
  }

  /** select tile based on the range and tolerance.   Subclasses can refine the selection by calling this method first and
   * then performing additional filtering on accepted tiles.
   */
  public selectTile(tile: Tile): RealityTileCollectionSelectionStatus {
    const tileRange = this._iModelTransform.multiplyRange(tile.range);
    if (!tileRange.intersectsRange(this._range))
      return RealityTileCollectionSelectionStatus.Reject;

    if (tile.maximumSize === 0.0 || !tile.isDisplayable)
      return RealityTileCollectionSelectionStatus.Continue;

    const tileTolerance = tile.radius/ tile.maximumSize;
    return tileTolerance < this._tolerance ? RealityTileCollectionSelectionStatus.Accept : RealityTileCollectionSelectionStatus.Continue;
  }
}

/** [[RealityTileCollector]] subclass that restricts selection to tiles that overlap a line string.
 * @alpha
 */
export class RealityTileByDrapeLineStringCollector extends RealityTileCollector {
  constructor(tolerance: number, range: Range3d, iModelTransform: Transform, private _points: GrowableXYZArray) {
    super(tolerance, range, iModelTransform);
  }
  public selectTile(tile: Tile): RealityTileCollectionSelectionStatus {
    let status = super.selectTile(tile);

    if (RealityTileCollectionSelectionStatus.Reject !== status && !this.rangeOverlapsLineString(tile.range))
      status = RealityTileCollectionSelectionStatus.Reject;

    return status;
  }

  private rangeOverlapsLineString(range: Range3d) {
    let inside = false;
    const clipper = ConvexClipPlaneSet.createRange3dPlanes (range, true, true, true, true, false, false);
    clipper.transformInPlace(this._iModelTransform);
    for (let i = 0; i < this._points.length - 1 && !inside; i++)
      inside = clipper.announceClippedSegmentIntervals (0, 1, this._points.getPoint3dAtUncheckedPointIndex(i), this._points.getPoint3dAtUncheckedPointIndex(i+1));

    return inside;
  }
}

/** @internal */
export class RealityTileTree extends TileTree {
  public traversalChildrenByDepth: TraversalChildrenDetails[] = [];
  public readonly loader: RealityTileLoader;
  public readonly yAxisUp: boolean;
  protected _rootTile: RealityTile;

  public constructor(params: RealityTileTreeParams) {
    super(params);
    this.loader = params.loader;
    this.yAxisUp = true === params.yAxisUp;
    this._rootTile = this.createTile(params.rootTile);
  }
  public get rootTile(): RealityTile { return this._rootTile; }
  public get is3d() { return true; }
  public get maxDepth() { return this.loader.maxDepth; }
  public get isContentUnbounded() { return this.loader.isContentUnbounded; }
  public get isTransparent() { return false; }

  protected _selectTiles(args: TileDrawArgs): Tile[] { return this.selectRealityTiles(args, []); }
  public get viewFlagOverrides(): ViewFlagOverrides { return this.loader.viewFlagOverrides; }
  public get parentsAndChildrenExclusive() { return this.loader.parentsAndChildrenExclusive; }

  public createTile(props: TileParams): RealityTile { return new RealityTile(props, this); }

  public collectRealityTiles(collector: RealityTileCollector): RealityTileCollectionStatus {
    this.rootTile.collectRealityTiles(collector);

    return collector.loadingComplete ? RealityTileCollectionStatus.Success : RealityTileCollectionStatus.Loading;
  }

  public prune(): void {
    const olderThan = BeTimePoint.now().minus(this.expirationTime);
    this.rootTile.purgeContents(olderThan);
  }

  public draw(args: TileDrawArgs): void {
    const displayedTileDescendants = new Array<RealityTile[]>();
    const debugControl = args.context.target.debugControl;
    const selectBuilder = (debugControl && debugControl.displayRealityTileRanges) ? args.context.createSceneGraphicBuilder() : undefined;
    const preloadDebugBuilder = (debugControl && debugControl.displayRealityTilePreload) ? args.context.createSceneGraphicBuilder() : undefined;
    const graphicTypeBranches = new Map<TileGraphicType, GraphicBranch>();

    const selectedTiles = this.selectRealityTiles(args, displayedTileDescendants, preloadDebugBuilder);
    if (!this.loader.parentsAndChildrenExclusive)
      selectedTiles.sort((a, b) => a.depth - b.depth);                    // If parent and child are not exclusive then display parents (low resolution) first.

    const classifier = args.context.planarClassifiers.get(this.modelId);
    if (classifier && !(args instanceof GraphicsCollectorDrawArgs))
      classifier.collectGraphics(args.context, { modelId: this.modelId, tiles: selectedTiles, location: args.location, isPointCloud: this.isPointCloud });

    assert(selectedTiles.length === displayedTileDescendants.length);
    for (let i = 0; i < selectedTiles.length; i++) {
      const selectedTile = selectedTiles[i];
      const graphics = args.getTileGraphics(selectedTile);
      const tileGraphicType = selectedTile.graphicType;
      let targetBranch;
      if (undefined !== tileGraphicType && tileGraphicType !== args.context.graphicType) {
        if (!(targetBranch = graphicTypeBranches.get(tileGraphicType))) {
          graphicTypeBranches.set(tileGraphicType, targetBranch = new GraphicBranch(false));
          targetBranch.setViewFlagOverrides(args.graphics.viewFlagOverrides);
          targetBranch.symbologyOverrides = args.graphics.symbologyOverrides;
        }
      }

      if (!targetBranch)
        targetBranch = args.graphics;

      if (undefined !== graphics) {
        const displayedDescendants = displayedTileDescendants[i];
        if (0 === displayedDescendants.length || !this.loader.parentsAndChildrenExclusive || selectedTile.allChildrenIncluded(displayedDescendants)) {
          targetBranch.add(graphics);
          if (selectBuilder) selectedTile.addBoundingGraphic(selectBuilder, ColorDef.green);
        } else {
          if (selectBuilder)
            selectedTile.addBoundingGraphic(selectBuilder, ColorDef.red);

          for (const displayedDescendant of displayedDescendants) {
            const clipVector = displayedDescendant.getContentClip();
            if (selectBuilder)
              displayedDescendant.addBoundingGraphic(selectBuilder, ColorDef.blue);

            if (undefined === clipVector) {
              targetBranch.add(graphics);
            } else {
              clipVector.transformInPlace(args.location);
              if (!this.isTransparent)
                for (const primitive of clipVector.clips)
                  for (const clipPlanes of primitive.fetchClipPlanesRef()!.convexSets)
                    for (const plane of clipPlanes.planes)
                      plane.offsetDistance(-displayedDescendant.radius * .05);     // Overlap with existing (high resolution) tile slightly to avoid cracks.

              const branch = new GraphicBranch(false);
              branch.add(graphics);
              const clipVolume = args.context.target.renderSystem.createClipVolume(clipVector);
              targetBranch.add(args.context.createGraphicBranch(branch, Transform.createIdentity(), { clipVolume }));
            }
          }
        }
        if (preloadDebugBuilder)
          targetBranch.add(preloadDebugBuilder.finish());

        if (selectBuilder)
          targetBranch.add(selectBuilder.finish());

        const rangeGraphic = selectedTile.getRangeGraphic(args.context);
        if (undefined !== rangeGraphic)
          targetBranch.add(rangeGraphic);
      }
    }

    args.drawGraphics();
    for (const graphicTypeBranch of graphicTypeBranches) {
      args.drawGraphicsWithType(graphicTypeBranch[0], graphicTypeBranch[1]);
    }
  }

  public getTraversalChildren(depth: number) {
    while (this.traversalChildrenByDepth.length <= depth)
      this.traversalChildrenByDepth.push(new TraversalChildrenDetails());

    return this.traversalChildrenByDepth[depth];
  }

  public getBaseRealityDepth(_sceneContext: SceneContext) { return -1; }

  public selectRealityTiles(args: TileDrawArgs, displayedDescendants: RealityTile[][], preloadDebugBuilder?: GraphicBuilder): RealityTile[] {
    this._lastSelected = BeTimePoint.now();
    const selected: RealityTile[] = [];
    const context = new TraversalSelectionContext(selected, displayedDescendants, preloadDebugBuilder, args.maxRealityTreeSelectionCount);
    const rootTile = this.rootTile;
    const debugControl = args.context.target.debugControl;
    const freezeTiles = debugControl && debugControl.freezeRealityTiles;

    rootTile.selectRealityTiles(context, args, new TraversalDetails());

    const baseDepth = this.getBaseRealityDepth(args.context);

    if (!args.context.target.renderSystem.isMobile && 0 === context.missing.length) { // We skip preloading on mobile devices.
      if (baseDepth > 0)        // Maps may force loading of low level globe tiles.
        rootTile.preloadRealityTilesAtDepth(baseDepth, context, args);

      if (!freezeTiles)
        this.preloadTilesForScene(args, context, undefined);
    }

    if (!freezeTiles)
      for (const tile of context.missing) {
        const loadableTile = tile.loadableTile;

        loadableTile.markUsed(args);
        args.insertMissing(tile.loadableTile);
      }

    if (debugControl && debugControl.logRealityTiles) {
      this.logTiles("Selected: ", selected.values());
      const preloaded = [];
      for (const tile of context.preloaded)
        preloaded.push(tile);

      this.logTiles("Preloaded: ", preloaded.values());
      this.logTiles("Missing: ", context.missing.values());

      const imageryTiles: RealityTile[] = [];
      for (const selectedTile of selected) {
        if (selectedTile instanceof MapTile) {
          const selectedImageryTiles = (selectedTile).imageryTiles;
          if (selectedImageryTiles)
            selectedImageryTiles.forEach((tile) => imageryTiles.push(tile));
        }
      }
      if (imageryTiles.length)
        this.logTiles("Imagery:", imageryTiles.values());
    }

    IModelApp.tileAdmin.addTilesForViewport(args.context.viewport, selected, args.readyTiles);
    return selected;
  }

  public preloadTilesForScene(args: TileDrawArgs, context: TraversalSelectionContext, frustumTransform?: Transform) {
    const preloadFrustum = args.viewingSpace.getPreloadFrustum(frustumTransform, scratchFrustum);
    const preloadFrustumPlanes = new FrustumPlanes(preloadFrustum);
    const worldToNpc = preloadFrustum.toMap4d();
    const preloadWorldToViewMap = args.viewingSpace.calcNpcToView().multiplyMapMap(worldToNpc!);
    const preloadArgs = new RealityTileDrawArgs(args, preloadWorldToViewMap, preloadFrustumPlanes);

    scratchFrustumPlanes.init(preloadFrustum);
    if (context.preloadDebugBuilder) {
      context.preloadDebugBuilder.setSymbology(ColorDef.blue, ColorDef.blue, 2, 0);
      context.preloadDebugBuilder.addFrustum(preloadFrustum);
    }

    this.rootTile.preloadTilesInFrustum(preloadArgs, context, 2);
  }

  protected logTiles(label: string, tiles: IterableIterator<Tile>) {
    let depthString = "";
    let min = 10000, max = -10000;
    let count = 0;
    const depthMap = new Map<number, number>();
    for (const tile of tiles) {
      count++;
      const depth = tile.depth;
      min = Math.min(min, tile.depth);
      max = Math.max(max, tile.depth);
      const found = depthMap.get(depth);
      depthMap.set(depth, found === undefined ? 1 : found + 1);
    }

    depthMap.forEach((key, value) => depthString += `${key}-${value}, `);
    console.log(label + ": " + count + " Min: " + min + " Max: " + max + " Depths: " + depthString);    // eslint-disable-line
  }

  /** Drape a line string on a reality  tile tree.
   * @alpha
   */
  public drapeLinestring(outStrings: LineString3d[], inPoints: GrowableXYZArray, tolerance: number, viewport: Viewport, maxDistance = 1.0E5): RealityTileDrapeStatus {
    const range = Range3d.createNull();
    range.extendArray(inPoints);
    range.extendZOnly(-maxDistance);  // Expand - but not so much that we get opposite side of globe.
    range.extendZOnly(maxDistance);
    const tileSelector = new RealityTileByDrapeLineStringCollector(tolerance, range, this.iModelTransform, inPoints);
    const collectionStatus = this.collectRealityTiles(tileSelector);

    if (collectionStatus === RealityTileCollectionStatus.Loading)
      tileSelector.requestMissingTiles(viewport);

    for (const geometry of tileSelector.acceptedGeometry()) {
      if (geometry.polyfaces)
        geometry.polyfaces.forEach((polyface) => {
          const sweepStrings = PolyfaceQuery.sweepLinestringToFacetsXYReturnChains(inPoints, polyface);
          sweepStrings.forEach((sweepString) => outStrings.push(sweepString));
        });
    }

    return collectionStatus === RealityTileCollectionStatus.Loading ? RealityTileDrapeStatus.Loading : RealityTileDrapeStatus.Success;
  }
}

