/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import {
  assert, BeTimePoint, ByteStream, compareStrings, DbOpcode, Id64, Id64Array, Id64String, partitionArray, SortedArray,
} from "@bentley/bentleyjs-core";
import { Range3d, Transform } from "@bentley/geometry-core";
import {
  BatchType, ElementGeometryChange, ElementGraphicsRequestProps, FeatureAppearance, FeatureAppearanceProvider, FeatureAppearanceSource, GeometryClass, TileFormat,
} from "@bentley/imodeljs-common";
import { RenderSystem } from "../render/RenderSystem";
import { Viewport } from "../Viewport";
import { IModelApp } from "../IModelApp";
import {
  ImdlReader, IModelTileTree, RootIModelTile, Tile, TileContent, TileDrawArgs, TileParams, TileRequest, TileRequestChannel, TileTree,
} from "./internal";

/** The root tile for the branch of an [[IModelTileTree]] containing graphics for elements that have been modified during the current
 * Not intended for direct consumption - exported for use by [[IModelTileTree]].
 * [[GraphicalEditingScope]].
 * @internal
 */
export abstract class DynamicIModelTile extends Tile {
  protected constructor(params: TileParams, tree: TileTree) {
    super(params, tree);
  }

  public static create(root: RootIModelTile, elements: Iterable<ElementGeometryChange>): DynamicIModelTile {
    return new RootTile(root, elements);
  }

  /** Updates the tiles when elements are modified during the editing scope. */
  public abstract handleGeometryChanges(changes: Iterable<ElementGeometryChange>): void;

  /** Overrides symbology of the *static* [[IModelTile]]s to hide elements that have been deleted or modified. */
  public abstract get appearanceProvider(): FeatureAppearanceProvider;

  /** Exposed strictly for tests. */
  public abstract get hiddenElements(): Id64Array;

  /** Select tiles for display, requesting content for tiles as necessary. */
  public abstract selectTiles(selected: Tile[], args: TileDrawArgs): void;

  /** Discard tiles that have not been used since the specified time point. */
  public abstract pruneChildren(olderThan: BeTimePoint): void;
}

/** The child tiles of the root tile, representing inserted or modified elements and sorted by element Id. */
class ElementTiles extends SortedArray<ElementTile> {
  public constructor() {
    super((lhs, rhs) => compareStrings(lhs.contentId, rhs.contentId));
  }

  public get array(): ElementTile[] {
    return this._array;
  }
}

/** The root tile. Each of its children represent a newly-inserted or modified element. */
class RootTile extends DynamicIModelTile implements FeatureAppearanceProvider {
  private readonly _hiddenElements: Id64.Uint32Set;
  public readonly transformToTree: Transform;
  private readonly _elements: ElementTiles;

  private get _imodelRoot() { return this.parent as RootIModelTile; }

  private get _elementChildren(): ElementTile[] {
    assert(undefined !== this.children);
    assert(this.children === this._elements.array);
    return this._elements.array;
  }

  public constructor(parent: RootIModelTile, elements: Iterable<ElementGeometryChange>) {
    const params: TileParams = {
      parent,
      isLeaf: false,
      contentId: "dynamic",
      range: Range3d.createNull(),
      maximumSize: 512,
    };

    super(params, parent.tree);

    this._hiddenElements = new Id64.Uint32Set();

    const inverseTransform = parent.tree.iModelTransform.inverse();
    assert(undefined !== inverseTransform);
    this.transformToTree = inverseTransform;

    this._elements = new ElementTiles();
    this.loadChildren(); // initially empty.
    assert(undefined !== this.children);

    this.setIsReady();
    this.handleGeometryChanges(elements);
  }

  public get hiddenElements(): Id64Array {
    return this._hiddenElements.toId64Array();
  }

  public get appearanceProvider(): FeatureAppearanceProvider {
    return this;
  }

  public getFeatureAppearance(source: FeatureAppearanceSource, elemLo: number, elemHi: number, subcatLo: number, subcatHi: number, geomClass: GeometryClass, modelLo: number, modelHi: number, type: BatchType, animationNodeId: number): FeatureAppearance | undefined {
    if (this._hiddenElements.has(elemLo, elemHi))
      return undefined;

    return source.getAppearance(elemLo, elemHi, subcatLo, subcatHi, geomClass, modelLo, modelHi, type, animationNodeId);
  }

  public handleGeometryChanges(changes: Iterable<ElementGeometryChange>): void {
    assert(undefined !== this.children);

    for (const change of changes) {
      if (change.type !== DbOpcode.Insert)
        this._hiddenElements.addId(change.id);

      let tile = this._elements.findEquivalent((t: ElementTile) => compareStrings(t.contentId, change.id));
      if (change.type === DbOpcode.Delete) {
        if (tile) {
          tile.dispose();
          this._elements.remove(tile);
        }
      } else {
        const range = change.range.isNull ? change.range.clone() : this.transformToTree.multiplyRange(change.range);
        if (tile)
          tile.update(range);
        else
          this._elements.insert(tile = new ElementTile(this, change.id, range));
      }
    }

    // Recompute range.
    this.range.setNull();
    for (const element of this._elements)
      this.range.extendRange(element.range);

    this._imodelRoot.updateDynamicRange(this);
  }

  protected _loadChildren(resolve: (children: Tile[] | undefined) => void, _reject: (errpr: Error) => void): void {
    // This is invoked from constructor. We will add a child per element later - for now just mark the children as having been loaded.
    resolve(this._elements.array);
  }

  public get channel(): TileRequestChannel {
    throw new Error("Root dynamic tile has no content");
  }

  public async requestContent(): Promise<TileRequest.Response> {
    assert(false, "Root dynamic tile has no content");
    return undefined;
  }

  public async readContent(_data: TileRequest.ResponseData, _system: RenderSystem, _isCanceled: () => boolean): Promise<TileContent> {
    throw new Error("Root dynamic tile has no content");
  }

  public selectTiles(selected: Tile[], args: TileDrawArgs): void {
    for (const child of this._elementChildren)
      child.selectTiles(selected, args);
  }

  public pruneChildren(olderThan: BeTimePoint): void {
    // Never discard ElementTiles - do discard not-recently-used graphics.
    for (const child of this._elementChildren)
      child.pruneChildren(olderThan);
  }
}

/** Represents a single element that has been inserted or had its geometric properties modified during the current [[GraphicalEditingScope]].
 * It has no graphics of its own; it has any number of child tiles, each of which have graphics of a different level of detail.
 * Its contentId is the element's Id.
 */
class ElementTile extends Tile {
  public constructor(parent: RootTile, elementId: Id64String, range: Range3d) {
    super({
      parent,
      isLeaf: false,
      contentId: elementId,
      range,
      maximumSize: parent.maximumSize,
    }, parent.tree);

    this.loadChildren();
    this.setIsReady();
  }

  protected _loadChildren(resolve: (children: Tile[] | undefined) => void, _reject: (error: Error) => void): void {
    // Invoked from constructor. We'll add child tiles later as needed.
    resolve([]);
  }

  public get channel(): TileRequestChannel {
    throw new Error("ElementTile has no content");
  }

  public async requestContent(_isCanceled: () => boolean): Promise<TileRequest.Response> {
    assert(false, "ElementTile has no content");
    return undefined;
  }

  public async readContent(_data: TileRequest.ResponseData, _system: RenderSystem, _isCanceled: () => boolean): Promise<TileContent> {
    throw new Error("ElementTile has no content");
  }

  public pruneChildren(olderThan: BeTimePoint): void {
    const children = this.children as GraphicsTile[];
    assert(undefined !== children);

    const partitionIndex = partitionArray(children, (child) => !child.usageMarker.isExpired(olderThan));

    // Remove expired children.
    if (partitionIndex < children.length) {
      const expired = children.splice(partitionIndex);
      for (const child of expired)
        child.dispose();
    }

    // Restore ordering.
    children.sort((x, y) => y.toleranceLog10 - x.toleranceLog10);
  }

  public selectTiles(selected: Tile[], args: TileDrawArgs): void {
    assert(undefined !== this.children);
    if (this.isRegionCulled(args))
      return;

    args.markUsed(this);

    // ###TODO: Test content range culled.

    // Compute the ideal chord tolerance.
    assert(this.maximumSize > 0);
    const pixelSize = args.getPixelSizeInMetersAtClosestPoint(this);
    assert(pixelSize > 0);

    // Round down to the nearest power of ten.
    const toleranceLog10 = Math.floor(Math.log10(pixelSize));

    // Find (or create) a child tile of desired tolerance. Also find a child tile that can be substituted for the desired tile if that tile's content is not yet loaded.
    // NB: Children are sorted in descending order by log10(tolerance)
    const children = this.children as GraphicsTile[];
    let closestMatch: GraphicsTile | undefined;
    let exactMatch: GraphicsTile | undefined;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const tol = child.toleranceLog10;
      if (tol > toleranceLog10) {
        assert(undefined === exactMatch);
        if (child.hasGraphics)
          closestMatch = child;
      } else if (tol === toleranceLog10) {
        exactMatch = child;
      } else if (tol < toleranceLog10) {
        if (!exactMatch)
          children.splice(i++, 0, exactMatch = new GraphicsTile(this, toleranceLog10));

        if (child.hasGraphics && (!closestMatch || closestMatch.toleranceLog10 > toleranceLog10))
          closestMatch = child;
      }
    }

    if (!exactMatch) {
      assert(children.length === 0 || children[children.length - 1].toleranceLog10 > toleranceLog10);
      children.push(exactMatch = new GraphicsTile(this, toleranceLog10));
    }

    if (!exactMatch.isReady) {
      args.insertMissing(exactMatch);
      if (closestMatch) {
        selected.push(closestMatch);
        args.markUsed(closestMatch);
      }
    } else if (exactMatch.hasGraphics) {
      selected.push(exactMatch);
      args.markUsed(exactMatch);
    }
  }

  public update(range: Range3d): void {
    range.clone(this.range);

    // Discard out-dated graphics.
    assert(undefined !== this.children);
    for (const child of this.children)
      child.dispose();

    this.children.length = 0;
  }
}

function* makeIdSequence() {
  let current = 0;
  while (true) {
    if (current >= Number.MAX_SAFE_INTEGER)
      current = 0;

    yield ++current;
  }
}

const requestIdSequence = makeIdSequence();

/** Supplies graphics of a specific LOD for a single element. */
class GraphicsTile extends Tile {
  public readonly toleranceLog10: number;
  public readonly tolerance: number;

  public constructor(parent: ElementTile, toleranceLog10: number) {
    assert(Math.round(toleranceLog10) === toleranceLog10);
    super({
      parent,
      isLeaf: true,
      contentId: `${parent.contentId}_${toleranceLog10}`,
      range: parent.range,
      maximumSize: parent.maximumSize,
    }, parent.tree);

    this.toleranceLog10 = toleranceLog10;
    this.tolerance = 10 ** toleranceLog10;
  }

  public override computeLoadPriority(_viewports: Iterable<Viewport>): number {
    // We want the element's graphics to be updated as soon as possible
    return 0;
  }

  protected _loadChildren(resolve: (children: Tile[] | undefined) => void, _reject: (error: Error) => void): void {
    resolve(undefined);
  }

  public get channel(): TileRequestChannel {
    return IModelApp.tileAdmin.channels.elementGraphicsRpc;
  }

  public async requestContent(_isCanceled: () => boolean): Promise<TileRequest.Response> {
    // ###TODO tree flags (enforce display priority)
    // ###TODO classifiers, animation

    assert(undefined !== this.parent);

    const requestId = requestIdSequence.next();
    assert(!requestId.done);

    assert(this.tree instanceof IModelTileTree);
    const idProvider = this.tree.contentIdProvider;

    const props: ElementGraphicsRequestProps = {
      id: requestId.value.toString(16),
      elementId: this.parent.contentId,
      toleranceLog10: this.toleranceLog10,
      formatVersion: idProvider.majorFormatVersion,
      location: this.tree.iModelTransform.toJSON(),
      contentFlags: idProvider.contentFlags,
      omitEdges: !this.tree.hasEdges,
      clipToProjectExtents: true,
      sectionCut: this.tree.stringifiedSectionClip,
    };

    return IModelApp.tileAdmin.requestElementGraphics(this.tree.iModel, props);
  }

  public async readContent(data: TileRequest.ResponseData, system: RenderSystem, isCanceled: () => boolean): Promise<TileContent> {
    if (undefined === isCanceled)
      isCanceled = () => !this.isLoading;

    assert(data instanceof Uint8Array);
    const stream = new ByteStream(data.buffer);

    const position = stream.curPos;
    const format = stream.nextUint32;
    stream.curPos = position;

    // ###TODO: IModelGraphics format wraps IModel format.
    assert(TileFormat.IModel === format);

    const tree = this.tree;
    assert(tree instanceof IModelTileTree);
    const reader = ImdlReader.create(stream, tree.iModel, tree.modelId, tree.is3d, system, tree.batchType, tree.hasEdges, isCanceled, undefined, { tileId: this.contentId });

    let content: TileContent = { isLeaf: true };
    if (reader) {
      try {
        content = await reader.read();
      } catch (_) {
        //
      }
    }

    return content;
  }
}
