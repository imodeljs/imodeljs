/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module HyperModeling
 */

import { assert, compareBooleans, compareStrings, Id64 } from "@bentley/bentleyjs-core";
import { ClipShape, ClipVector, Point3d, Range3d, Transform } from "@bentley/geometry-core";
import { ColorDef, Placement2d, ViewAttachmentProps, ViewDefinition2dProps, ViewFlagOverrides } from "@bentley/imodeljs-common";
import {
  CategorySelectorState, DisclosedTileTreeSet, DisplayStyle2dState, DrawingViewState,
  FeatureSymbology, GeometricModel2dState, GraphicBranch, HitDetail, IModelApp, IModelConnection, RenderClipVolume, RenderSystem, SheetModelState, Tile, TileContent, TiledGraphicsProvider, TileDrawArgs,
  TileLoadPriority, TileRequest, TileRequestChannel, TileTree, TileTreeOwner, TileTreeReference, TileTreeSupplier, Viewport, ViewState2d,
} from "@bentley/imodeljs-frontend";
import { SectionDrawingLocationState } from "./SectionDrawingLocationState";
import { HyperModeling } from "./HyperModeling";

interface ProxyTreeId {
  state: SectionDrawingLocationState;
  isSheet: boolean;
  attachment?: ViewAttachmentProps;
}

interface ProxyTreeParams {
  tree: TileTree;
  ref: TileTreeReference;
  view: ViewState2d;
  state: SectionDrawingLocationState;
  attachment?: ViewAttachmentProps;
}

class ProxyTreeSupplier implements TileTreeSupplier {
  public compareTileTreeIds(lhs: ProxyTreeId, rhs: ProxyTreeId): number {
    let cmp = compareBooleans(lhs.isSheet, rhs.isSheet);
    if (0 === cmp)
      cmp = compareStrings(lhs.state.id, rhs.state.id);

    return cmp;
  }

  public async createTileTree(id: ProxyTreeId, iModel: IModelConnection): Promise<TileTree | undefined> {
    let view;
    if (id.isSheet) {
      assert(undefined !== id.attachment);
      view = await this.createSheetViewState(id.state, id.attachment);
    } else {
      view = await id.state.tryLoadDrawingView();
    }

    if (undefined === view)
      return undefined;

    try {
      await iModel.models.load(view.baseModelId);
      const model = iModel.models.getLoaded(view.baseModelId);
      if (undefined === model || !(model instanceof GeometricModel2dState))
        return undefined;

      const treeRef = model.createTileTreeReference(view);
      const tree = await treeRef.treeOwner.loadTree();
      if (undefined === tree)
        return undefined;

      const ctor = id.isSheet ? SheetProxyTree : DrawingProxyTree;
      return new ctor({ tree, ref: treeRef, view, state: id.state, attachment: id.attachment });
    } catch (_) {
      return undefined;
    }
  }

  private async createSheetViewState(state: SectionDrawingLocationState, attachment: ViewAttachmentProps): Promise<DrawingViewState | undefined> {
    assert(undefined !== state.viewAttachment);
    try {
      // A persistent view of the sheet doesn't necessarily exist, and we don't want a SheetViewState anyway.
      // All we want is to draw all the elements in the sheet (sans view attachments) clipped by the drawing boundary.
      // However, ModelState.createTileTreeReference() requires a ViewState.
      await state.iModel.models.load(attachment.model);
      const sheet = state.iModel.models.getLoaded(attachment.model);
      if (undefined === sheet || !(sheet instanceof SheetModelState))
        return undefined;

      const sheetExtents = await sheet.queryModelRange();
      const viewProps: ViewDefinition2dProps = {
        baseModelId: attachment.model,
        origin: { x: 0, y: 0 },
        delta: { x: sheetExtents.high.x, y: sheetExtents.high.y },
        angle: 0,
        categorySelectorId: Id64.invalid,
        displayStyleId: Id64.invalid,
        model: Id64.invalid,
        code: {
          spec: Id64.invalid,
          scope: Id64.invalid,
        },
        classFullName: DrawingViewState.classFullName,
      };

      const displayStyle = new DisplayStyle2dState({} as any, state.iModel);
      const categorySelector = new CategorySelectorState({} as any, state.iModel);

      return new DrawingViewState(viewProps, state.iModel, categorySelector, displayStyle, sheetExtents);
    } catch {
      return undefined;
    }
  }
}

const proxyTreeSupplier = new ProxyTreeSupplier();

/** A proxy for a 2d tile tree to be drawn in the context of a spatial view. */
class ProxyTreeReference extends TileTreeReference {
  private readonly _owner: TileTreeOwner;

  public constructor(id: ProxyTreeId) {
    super();
    this._owner = id.state.iModel.tiles.getTileTreeOwner(id, proxyTreeSupplier);
  }

  public override get castsShadows() {
    return false;
  }

  public override getClipVolume(tree: TileTree) {
    return true !== HyperModeling.graphicsConfig.ignoreClip ? super.getClipVolume(tree) : undefined;
  }

  public get treeOwner() { return this._owner; }

  private get _proxiedRef(): TileTreeReference | undefined {
    const proxiedTree = this.treeOwner.tileTree as ProxyTree;
    return undefined !== proxiedTree ? proxiedTree.ref : undefined;
  }

  public override discloseTileTrees(trees: DisclosedTileTreeSet): void {
    super.discloseTileTrees(trees);
    const ref = this._proxiedRef;
    if (undefined !== ref)
      ref.discloseTileTrees(trees);
  }

  public override async getToolTip(hit: HitDetail) {
    const ref = this._proxiedRef;
    return undefined !== ref ? ref.getToolTip(hit) : super.getToolTip(hit);
  }
}

/** A proxy for a 2d tile tree to be drawn in the context of a spatial view. */
abstract class ProxyTree extends TileTree {
  private readonly _rootTile: ProxyTile;
  private readonly _viewFlagOverrides: ViewFlagOverrides;
  public readonly tree: TileTree;
  public readonly ref: TileTreeReference;
  public readonly symbologyOverrides: FeatureSymbology.Overrides;

  protected constructor(params: ProxyTreeParams, location: Transform, clipVolume: RenderClipVolume | undefined) {
    const { tree, ref, view } = { ...params };
    super({
      id: params.state.id,
      modelId: tree.modelId,
      iModel: tree.iModel,
      location,
      priority: TileLoadPriority.Primary,
      clipVolume,
    });

    this.tree = tree;
    this.ref = ref;
    this.symbologyOverrides = new FeatureSymbology.Overrides(view);

    const range = tree.iModelTransform.multiplyRange(tree.rootTile.range);
    const inverse = location.inverse();
    if (undefined !== inverse)
      inverse.multiplyRange(range, range);

    this._viewFlagOverrides = new ViewFlagOverrides(view.viewFlags);
    this._viewFlagOverrides.setApplyLighting(false);

    // View clip (section clip) should not apply to 2d graphics.
    this._viewFlagOverrides.setShowClipVolume(false);

    this._rootTile = new ProxyTile(this, range);
  }

  public get rootTile(): ProxyTile { return this._rootTile; }
  public get viewFlagOverrides() { return this._viewFlagOverrides; }
  public get is3d() { return false; }
  public override get isContentUnbounded() { return false; }
  public get maxDepth() { return 1; }

  protected abstract get isDisplayed(): boolean;

  public draw(args: TileDrawArgs): void {
    if (!this.isDisplayed)
      return;

    const tiles = this.selectTiles(args);
    for (const tile of tiles)
      tile.drawGraphics(args);

    args.drawGraphics();
  }

  protected _selectTiles(_args: TileDrawArgs): Tile[] {
    return this.isDisplayed ? [this.rootTile] : [];
  }

  public prune(): void {
    // Our single tile is only a proxy. Our proxied tree(s) will be pruned separately
  }
}

class DrawingProxyTree extends ProxyTree {
  public constructor(params: ProxyTreeParams) {
    const { state, attachment } = { ...params };
    const location = state.drawingToSpatialTransform.clone();

    let clipVolume;
    if (attachment) {
      assert(undefined !== state.viewAttachment);
      const clipJSON = attachment.jsonProperties?.clip;
      const clip = clipJSON ? ClipVector.fromJSON(clipJSON) : ClipVector.createEmpty();
      if (!clipJSON) {
        const placement = Placement2d.fromJSON(attachment.placement);
        const range = placement.calculateRange();
        clip.appendShape([
          Point3d.create(range.low.x, range.low.y),
          Point3d.create(range.high.x, range.low.y),
          Point3d.create(range.high.x, range.high.y),
          Point3d.create(range.low.x, range.high.y),
        ]);
      }

      if (clip.isValid) {
        const sheetToWorld = state.viewAttachment.transformToSpatial.clone();
        clip.transformInPlace(sheetToWorld);
        clipVolume = IModelApp.renderSystem.createClipVolume(clip);
      }
    }

    super(params, location, clipVolume);
  }

  protected get isDisplayed() { return true !== HyperModeling.graphicsConfig.hideSectionGraphics; }
}

class SheetProxyTree extends ProxyTree {
  public constructor(params: ProxyTreeParams) {
    const { state, attachment } = { ...params };
    assert(undefined !== state.viewAttachment);
    assert(undefined !== attachment);
    const location = state.viewAttachment.transformToSpatial.clone();

    let clipVolume;
    if (state.viewAttachment.clip)
      clipVolume = IModelApp.renderSystem.createClipVolume(state.viewAttachment.clip);

    super(params, location, clipVolume);

    // Our view is manufactured. It draws everything regardless of subcategory.
    this.symbologyOverrides.ignoreSubCategory = true;
  }

  protected get isDisplayed() { return true !== HyperModeling.graphicsConfig.hideSheetAnnotations; }
}

/** The single Tile belonging to a ProxyTree, serving as a proxy for all of the proxied tree's tiles. */
class ProxyTile extends Tile {
  public constructor(tree: ProxyTree, range: Range3d) {
    super({ contentId: "", range, maximumSize: 512, isLeaf: true }, tree);
    this.setIsReady();
  }

  public get hasChildren() { return false; }
  public override get hasGraphics() { return true; }

  public get channel(): TileRequestChannel { throw new Error("Proxy tile has no content"); }
  public async requestContent(_isCanceled: () => boolean): Promise<TileRequest.Response> { return undefined; }
  public async readContent(_data: TileRequest.ResponseData, _system: RenderSystem, _isCanceled?: () => boolean): Promise<TileContent> { return {}; }
  protected _loadChildren(_resolve: (children: Tile[]) => void, _reject: (error: Error) => void): void { }

  public override drawGraphics(args: TileDrawArgs) {
    const proxyTree = this.tree as ProxyTree;
    const sectionTree = proxyTree.tree;

    const location = proxyTree.iModelTransform.multiplyTransformTransform(sectionTree.iModelTransform);
    const clipVolume = true === proxyTree.viewFlagOverrides.clipVolumeOverride ? proxyTree.clipVolume : undefined;
    args = new TileDrawArgs({ context: args.context, location, tree: sectionTree, now: args.now, viewFlagOverrides: proxyTree.viewFlagOverrides, clipVolume, parentsAndChildrenExclusive: args.parentsAndChildrenExclusive, symbologyOverrides: proxyTree.symbologyOverrides });
    sectionTree.draw(args);

    const rangeGfx = this.getRangeGraphic(args.context);
    if (undefined !== rangeGfx)
      args.graphics.add(rangeGfx);

    if (true !== HyperModeling.graphicsConfig.debugClipVolumes || undefined === proxyTree.clipVolume)
      return;

    const builder = args.context.createSceneGraphicBuilder();
    builder.setSymbology(ColorDef.red, ColorDef.red, 2);
    for (const prim of proxyTree.clipVolume.clipVector.clips) {
      if (!(prim instanceof ClipShape))
        continue;

      const tf = prim.transformFromClip;
      const pts = prim.polygon.map((pt) => tf ? tf.multiplyPoint3d(pt) : pt.clone());
      builder.addLineString(pts);
    }

    const branch = new GraphicBranch();
    branch.entries.push(builder.finish());
    branch.setViewFlagOverrides(new ViewFlagOverrides());
    branch.viewFlagOverrides.setShowClipVolume(false);
    args.context.outputGraphic(args.context.createGraphicBranch(branch, Transform.createIdentity()));
  }
}

/** Draws the 2d section graphics into the 3d view. */
class SectionGraphicsProvider implements TiledGraphicsProvider {
  private readonly _drawingRef: TileTreeReference;
  private readonly _sheetRef?: TileTreeReference;

  public constructor(state: SectionDrawingLocationState, attachment: ViewAttachmentProps | undefined) {
    this._drawingRef = new ProxyTreeReference({ state, attachment, isSheet: false });
    if (attachment)
      this._sheetRef = new ProxyTreeReference({ state, attachment, isSheet: true });
  }

  public forEachTileTreeRef(_viewport: Viewport, func: (ref: TileTreeReference) => void): void {
    func(this._drawingRef);
    if (undefined !== this._sheetRef)
      func(this._sheetRef);
  }
}

/** Creates a TiledGraphicsProvider that can be associated with a [Viewport]($frontend) to display 2d section graphics and annotations in the context of a [SpatialViewState]($frontend).
 * Typically used indirectly via [[HyperModelingDecorator]].
 * @param state The section drawing location specifying which section drawing to display.
 * @returns A provider suitable for passing to [Viewport.addTiledGraphicsProvider]($frontend).
 * @see [[HyperModelingDecorator.toggleAttachment]] to activate section graphics for a given [[SectionMarker]].
 * @public
 */
export async function createSectionGraphicsProvider(state: SectionDrawingLocationState): Promise<TiledGraphicsProvider> {
  let attachment;
  if (undefined !== state.viewAttachment) {
    const attachments = await state.iModel.elements.getProps(state.viewAttachment.id) as ViewAttachmentProps[];
    if (1 === attachments.length)
      attachment = attachments[0];
  }

  return new SectionGraphicsProvider(state, attachment);
}
