/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, compareBooleans, compareStrings, Id64String } from "@bentley/bentleyjs-core";
import { Geometry, Range3d, StringifiedClipVector, Transform } from "@bentley/geometry-core";
import {
  BatchType, compareIModelTileTreeIds, FeatureAppearance, FeatureAppearanceProvider, HiddenLine, iModelTileTreeIdToString, PrimaryTileTreeId, ViewFlagOverrides,
} from "@bentley/imodeljs-common";
import { IModelApp } from "../IModelApp";
import { IModelConnection } from "../IModelConnection";
import { GeometricModel3dState, GeometricModelState } from "../ModelState";
import { RenderClipVolume } from "../render/RenderClipVolume";
import { RenderScheduleState } from "../RenderScheduleState";
import { SpatialViewState } from "../SpatialViewState";
import { SceneContext } from "../ViewContext";
import { ModelDisplayTransformProvider, ViewState, ViewState3d } from "../ViewState";
import {
  IModelTileTree, IModelTileTreeParams, iModelTileTreeParamsFromJSON, TileDrawArgs, TileGraphicType, TileTree, TileTreeOwner, TileTreeReference,
  TileTreeSupplier,
} from "./internal";

interface PrimaryTreeId {
  readonly treeId: PrimaryTileTreeId;
  readonly modelId: Id64String;
  readonly is3d: boolean;
  readonly isPlanProjection: boolean;
  readonly forceNoInstancing: boolean;
}

class PlanProjectionTileTree extends IModelTileTree {
  public readonly baseElevation: number;

  public constructor(params: IModelTileTreeParams, treeId: PrimaryTileTreeId, baseElevation: number) {
    super(params, treeId);
    this.baseElevation = baseElevation;
  }
}

class PrimaryTreeSupplier implements TileTreeSupplier {
  public constructor() {
  }

  public compareTileTreeIds(lhs: PrimaryTreeId, rhs: PrimaryTreeId): number {
    // NB: we don't compare isPlanProjection or is3d - they should always have the same value for a given modelId.
    let cmp = compareStrings(lhs.modelId, rhs.modelId);
    if (0 === cmp) {
      cmp = compareIModelTileTreeIds(lhs.treeId, rhs.treeId);
      if (0 === cmp)
        cmp = compareBooleans(lhs.forceNoInstancing, rhs.forceNoInstancing);
    }

    return cmp;
  }

  public async createTileTree(id: PrimaryTreeId, iModel: IModelConnection): Promise<TileTree | undefined> {
    const treeId = id.treeId;
    const idStr = iModelTileTreeIdToString(id.modelId, treeId, IModelApp.tileAdmin);
    const props = await IModelApp.tileAdmin.requestTileTreeProps(iModel, idStr);

    const options = {
      edgesRequired: treeId.edgesRequired,
      allowInstancing: undefined === treeId.animationId && !treeId.enforceDisplayPriority && !treeId.sectionCut && !id.forceNoInstancing,
      is3d: id.is3d,
      batchType: BatchType.Primary,
    };

    const params = iModelTileTreeParamsFromJSON(props, iModel, id.modelId, options);
    if (!id.isPlanProjection)
      return new IModelTileTree(params, id.treeId);

    let elevation = 0;
    try {
      const ranges = await iModel.models.queryModelRanges(id.modelId);
      if (1 === ranges.length) {
        const range = Range3d.fromJSON(ranges[0]);
        const lo = range.low.z;
        const hi = range.high.z;
        if (lo <= hi)
          elevation = (lo + hi) / 2;
      }
    } catch (_err) {
      //
    }

    return new PlanProjectionTileTree(params, id.treeId, elevation);
  }

  public getOwner(id: PrimaryTreeId, iModel: IModelConnection): TileTreeOwner {
    return iModel.tiles.getTileTreeOwner(id, this);
  }

  public addModelsAnimatedByScript(modelIds: Set<Id64String>, scriptSourceId: Id64String, trees: Iterable<{ id: PrimaryTreeId, owner: TileTreeOwner }>): void {
    for (const tree of trees)
      if (tree.id.treeId.animationId === scriptSourceId)
        modelIds.add(tree.id.modelId);
  }

  public addSpatialModels(modelIds: Set<Id64String>, trees: Iterable<{ id: PrimaryTreeId, owner: TileTreeOwner }>): void {
    for (const tree of trees)
      if (tree.id.is3d)
        modelIds.add(tree.id.modelId);
  }
}

const primaryTreeSupplier = new PrimaryTreeSupplier();

/** Find all extant tile trees associated with the specified model Ids and dispose of them.
 * This is used by BriefcaseConnection when a GraphicalEditingScope is exited or after a change to the models' geometry guids
 * is committed, undone, redone, or merged.
 * @internal
 */
export function disposeTileTreesForGeometricModels(modelIds: Set<Id64String>, iModel: IModelConnection): void {
  const trees = iModel.tiles.getTreeOwnersForSupplier(primaryTreeSupplier);
  for (const kvp of trees) {
    const id = kvp.id as PrimaryTreeId;
    assert(undefined !== id.modelId);
    if (modelIds.has(id.modelId))
      kvp.owner.dispose();
  }
}

class PrimaryTreeReference extends TileTreeReference {
  public readonly view: ViewState;
  public readonly model: GeometricModelState;
  protected readonly _viewFlagOverrides: ViewFlagOverrides;
  protected _id: PrimaryTreeId;
  private _owner: TileTreeOwner;
  private readonly _sectionClip?: StringifiedClipVector;
  private readonly _sectionCutAppearanceProvider?: FeatureAppearanceProvider;
  private _forceNoInstancing: boolean;

  public constructor(view: ViewState, model: GeometricModelState, planProjection: boolean, transformNodeId?: number, sectionClip?: StringifiedClipVector) {
    super();
    this.view = view;
    this.model = model;

    this._sectionClip = sectionClip;
    this._viewFlagOverrides = ViewFlagOverrides.fromJSON(model.jsonProperties.viewFlagOverrides);
    if (sectionClip) {
      // Clipping will be applied on backend; don't clip out cut geometry.
      this._viewFlagOverrides.setShowClipVolume(false);
      this._sectionCutAppearanceProvider = FeatureAppearanceProvider.supplement((app: FeatureAppearance) => {
        const cutApp = this.view.displayStyle.settings.clipStyle.cutStyle.appearance;
        return cutApp ? app.extendAppearance(cutApp) : app;
      });
    }

    this._forceNoInstancing = false;
    if (!IModelApp.renderSystem.supportsNonuniformScaledInstancing) {
      this.checkForceNoInstancing(view.modelDisplayTransformProvider);
      view.onModelDisplayTransformProviderChanged.addListener((provider: ModelDisplayTransformProvider | undefined) => this.checkForceNoInstancing(provider));
    }

    this._id = {
      modelId: model.id,
      is3d: model.is3d,
      treeId: this.createTreeId(view, model.id, transformNodeId),
      isPlanProjection: planProjection,
      forceNoInstancing: this._forceNoInstancing,
    };

    this._owner = primaryTreeSupplier.getOwner(this._id, model.iModel);
  }

  private checkForceNoInstancing(provider: ModelDisplayTransformProvider | undefined) {
    this._forceNoInstancing = false;
    // If this model has a display transform with a non-uniform scale then instancing needs to be forced off when using WebGL1.
    if (undefined !== provider) {
      const tf = provider.getModelDisplayTransform(this.model.id, Transform.createIdentity());
      const sx = tf.matrix.getColumn(0).magnitudeSquared();
      const sy = tf.matrix.getColumn(1).magnitudeSquared();
      const sz = tf.matrix.getColumn(2).magnitudeSquared();
      if (Math.abs(sx - sy) > Geometry.smallMetricDistance || Math.abs(sx - sz) > Geometry.smallMetricDistance)
        this._forceNoInstancing = true;
    }
  }

  protected override getViewFlagOverrides(_tree: TileTree) {
    return this._viewFlagOverrides;
  }

  protected override getAppearanceProvider(_tree: TileTree): FeatureAppearanceProvider | undefined {
    if (this._sectionCutAppearanceProvider && this.view.displayStyle.settings.clipStyle.cutStyle.appearance)
      return this._sectionCutAppearanceProvider;

    return undefined;
  }

  protected override getHiddenLineSettings(_tree: TileTree): HiddenLine.Settings | undefined {
    return this._sectionClip ? this.view.displayStyle.settings.clipStyle.cutStyle.hiddenLine : undefined;
  }

  public override get castsShadows() {
    return true;
  }

  protected get isPlanProjection(): boolean {
    return false;
  }

  protected override getClipVolume(_tree: TileTree): RenderClipVolume | undefined {
    // ###TODO: reduce frequency with which getModelClip() is called
    return this.view.is3d() && !this._sectionClip ? this.view.getModelClip(this.model.id) : undefined;
  }

  public override createDrawArgs(context: SceneContext): TileDrawArgs | undefined {
    const args = super.createDrawArgs(context);
    if (args)
      args.intersectionClip = this._sectionClip;

    return args;
  }

  public get treeOwner(): TileTreeOwner {
    const newId = this.createTreeId(this.view, this._id.modelId, this._id.treeId.animationTransformNodeId);
    if (0 !== compareIModelTileTreeIds(newId, this._id.treeId) || this._forceNoInstancing !== this._id.forceNoInstancing) {
      this._id = {
        modelId: this._id.modelId,
        is3d: this._id.is3d,
        treeId: newId,
        isPlanProjection: this._id.isPlanProjection,
        forceNoInstancing: this._forceNoInstancing,
      };

      this._owner = primaryTreeSupplier.getOwner(this._id, this.model.iModel);
    }

    return this._owner;
  }

  protected createTreeId(view: ViewState, modelId: Id64String, animationTransformNodeId: number | undefined): PrimaryTileTreeId {
    if (this._sectionClip) {
      // We do this each time in case the ClipStyle's overrides are modified.
      // ###TODO: can we avoid that? Event listeners maybe?
      this.view.displayStyle.settings.clipStyle.cutStyle.viewflags.clone(this._viewFlagOverrides);

      // Do not clip out the cut geometry intersecting the clip planes.
      this._viewFlagOverrides.setShowClipVolume(false);

      // The cut geometry is planar - it should win a z-fight.
      // Also we need to preserve this flag if this is a plan projection tile tree reference.
      this._viewFlagOverrides.setForceSurfaceDiscard(true);
    }

    const script = view.displayStyle.scheduleState;
    const animationId = undefined !== script ? script.getModelAnimationId(modelId) : undefined;
    const edgesRequired = true === IModelApp.tileAdmin.alwaysRequestEdges || this._viewFlagOverrides.edgesRequired(view.viewFlags);
    const sectionCut = this._sectionClip?.clipString;
    return { type: BatchType.Primary, edgesRequired, animationId, animationTransformNodeId, sectionCut };
  }

  protected computeBaseTransform(tree: TileTree): Transform {
    return super.computeTransform(tree);
  }

  protected override computeTransform(tree: TileTree): Transform {
    const tf = this.computeBaseTransform(tree);
    return this.view.getModelDisplayTransform(this.model.id, tf);
  }
}

/** @internal */
export class AnimatedTreeReference extends PrimaryTreeReference {
  protected override computeBaseTransform(tree: TileTree): Transform {
    const tf = super.computeBaseTransform(tree);
    const style = this.view.displayStyle;
    const script = style.scheduleScript;
    if (undefined === script || undefined === this._id.treeId.animationTransformNodeId)
      return tf;

    const timePoint = style.settings.timePoint ?? script.duration.low;
    const animTf = script.getTransform(this._id.modelId, this._id.treeId.animationTransformNodeId, timePoint);
    if (animTf)
      animTf.multiplyTransformTransform(tf, tf);

    return tf;
  }
}

class PlanProjectionTreeReference extends PrimaryTreeReference {
  private get _view3d() { return this.view as ViewState3d; }
  private readonly _baseTransform = Transform.createIdentity();

  public constructor(view: ViewState3d, model: GeometricModelState, sectionCut?: StringifiedClipVector) {
    super(view, model, true, undefined, sectionCut);
    this._viewFlagOverrides.setForceSurfaceDiscard(true);
  }

  public override get castsShadows() {
    return false;
  }

  protected override get isPlanProjection(): boolean {
    return true;
  }

  public override createDrawArgs(context: SceneContext): TileDrawArgs | undefined {
    const args = super.createDrawArgs(context);
    if (undefined !== args && this._id.treeId.enforceDisplayPriority) {
      args.drawGraphics = () => { // eslint-disable-line @typescript-eslint/unbound-method
        const graphics = args.produceGraphics();
        if (undefined !== graphics) {
          const settings = this.getSettings();
          const asOverlay = undefined !== settings && settings.overlay;
          const transparency = settings?.transparency || 0;

          let elevation = settings?.elevation;
          if (undefined === elevation) {
            const tree = this.treeOwner.tileTree;
            if (tree) {
              assert(tree instanceof PlanProjectionTileTree);
              elevation = tree.baseElevation;
            } else {
              elevation = 0;
            }
          }

          context.outputGraphic(context.target.renderSystem.createGraphicLayerContainer(graphics, asOverlay, transparency, elevation));
        }
      };
    }

    return args;
  }

  protected override computeBaseTransform(tree: TileTree): Transform {
    assert(tree instanceof PlanProjectionTileTree);
    const transform = tree.iModelTransform.clone(this._baseTransform);

    const elevation = this.getSettings()?.elevation;
    if (undefined !== elevation)
      transform.origin.z = elevation;

    return transform;
  }

  public override draw(args: TileDrawArgs): void {
    const settings = this.getSettings();
    if (undefined === settings || settings.enforceDisplayPriority || !settings.overlay)
      super.draw(args);
    else
      args.context.withGraphicType(TileGraphicType.Overlay, () => args.tree.draw(args));
  }

  private getSettings() {
    return this._view3d.getDisplayStyle3d().settings.getPlanProjectionSettings(this.model.id);
  }

  protected override createTreeId(view: ViewState, modelId: Id64String): PrimaryTileTreeId {
    const id = super.createTreeId(view, modelId, undefined);
    const settings = this.getSettings();
    if (undefined !== settings && settings.enforceDisplayPriority)
      id.enforceDisplayPriority = true;

    return id;
  }
}

function isPlanProjection(view: ViewState, model: GeometricModelState): boolean {
  const model3d = view.is3d() ? model.asGeometricModel3d : undefined;
  return undefined !== model3d && model3d.isPlanProjection;
}

function createTreeRef(view: ViewState, model: GeometricModelState, sectionCut: StringifiedClipVector | undefined): TileTreeReference {
  if (false !== IModelApp.renderSystem.options.planProjections && isPlanProjection(view, model))
    return new PlanProjectionTreeReference(view as ViewState3d, model, sectionCut);

  return new PrimaryTreeReference(view, model, false, undefined, sectionCut);
}

/** @internal */
export function createPrimaryTileTreeReference(view: ViewState, model: GeometricModelState): TileTreeReference {
  return createTreeRef(view, model, undefined);
}

class MaskTreeReference extends TileTreeReference {
  protected _id: PrimaryTreeId;
  private _owner: TileTreeOwner;
  public readonly model: GeometricModelState;
  public override get castsShadows() { return false; }
  public constructor(model: GeometricModelState) {
    super();
    this.model = model;
    this._id = { modelId: model.id, is3d: model.is3d, treeId: this.createTreeId(), isPlanProjection: false, forceNoInstancing: false };
    this._owner = primaryTreeSupplier.getOwner(this._id, model.iModel);
  }

  public get treeOwner(): TileTreeOwner {
    const newId = this.createTreeId();
    if (0 !== compareIModelTileTreeIds(newId, this._id.treeId)) {
      this._id = { modelId: this._id.modelId, is3d: this._id.is3d, treeId: newId, isPlanProjection: false, forceNoInstancing: false };
      this._owner = primaryTreeSupplier.getOwner(this._id, this.model.iModel);
    }

    return this._owner;
  }
  protected createTreeId(): PrimaryTileTreeId {
    return { type: BatchType.Primary, edgesRequired: false };
  }
}

/** @internal */
export function createMaskTreeReference(model: GeometricModelState): TileTreeReference {
  return new MaskTreeReference(model);
}

/** Provides [[TileTreeReference]]s for the loaded models present in a [[SpatialViewState]]'s [[ModelSelectorState]].
 * @internal
 */
export interface SpatialTileTreeReferences extends Iterable<TileTreeReference> {
  /** Supplies an iterator over all of the [[TileTreeReference]]s. */
  readonly [Symbol.iterator]: () => Iterator<TileTreeReference>;
  /** Requests that the set of [[TileTreeReference]]s be updated to match the current state of the view, e.g., after the model selector's contents have changed. */
  readonly update: () => void;
}

/** Provides [[TileTreeReference]]s for the loaded models present in a [[SpatialViewState]]'s [[ModelSelectorState]].
 * @internal
 */
export namespace SpatialTileTreeReferences {
  /** Create a SpatialTileTreeReferences object reflecting the contents of the specified view. */
  export function create(view: SpatialViewState): SpatialTileTreeReferences {
    return new SpatialRefs(view);
  }
}

/** Represents the [[TileTreeReference]]s associated with one model in a [[SpatialTileTreeReferences]]. */
class SpatialModelRefs implements Iterable<TileTreeReference> {
  /** The TileTreeReference representing the model's primary content. */
  private readonly _modelRef: TileTreeReference;
  /** TileTreeReferences representing nodes transformed by the view's schedule script. */
  private readonly _animatedRefs: TileTreeReference[] = [];
  /** TileTreeReference providing cut geometry intersecting the view's clip volume. */
  private _sectionCutRef?: TileTreeReference;
  /** Whether `this._modelRef` is a [[PrimaryTreeReference]] (as opposed to, e.g., a reality model tree reference). */
  private readonly _isPrimaryRef: boolean;

  public constructor(model: GeometricModel3dState, view: SpatialViewState) {
    this._modelRef = model.createTileTreeReference(view);
    this._isPrimaryRef = this._modelRef instanceof PrimaryTreeReference;
  }

  public *[Symbol.iterator](): Iterator<TileTreeReference> {
    yield this._modelRef;
    for (const animated of this._animatedRefs)
      yield animated;

    if (this._sectionCutRef)
      yield this._sectionCutRef;
  }

  public updateAnimated(script: RenderScheduleState | undefined): void {
    const ref = this._primaryRef;
    if (!ref)
      return;

    this._animatedRefs.length = 0;
    const nodeIds = script?.getTransformNodeIds(ref.model.id);
    if (nodeIds)
      for (const nodeId of nodeIds)
        this._animatedRefs.push(new AnimatedTreeReference(ref.view, ref.model, false, nodeId));
  }

  public updateSectionCut(clip: StringifiedClipVector | undefined): void {
    const ref = this._primaryRef;
    if (!ref) {
      assert(undefined === this._sectionCutRef);
      return;
    }

    // If the clip isn't supposed to apply to this model, don't produce cut geometry.
    const vfJson = clip ? ref.model.jsonProperties.viewFlagOverrides : undefined;
    const vfOvrs = vfJson ? ViewFlagOverrides.fromJSON(vfJson) : undefined;
    if (vfOvrs && !vfOvrs.clipVolumeOverride)
      clip = undefined;

    this._sectionCutRef = clip ? createTreeRef(ref.view, ref.model, clip) : undefined;
  }

  private get _primaryRef(): PrimaryTreeReference | undefined {
    if (!this._isPrimaryRef)
      return undefined;

    assert(this._modelRef instanceof PrimaryTreeReference);
    return this._modelRef;
  }
}

/** Provides [[TileTreeReference]]s for the loaded models present in a [[SpatialViewState]]'s [[ModelSelectorState]]. */
class SpatialRefs implements SpatialTileTreeReferences {
  private _allLoaded = false;
  private readonly _view: SpatialViewState;
  private _refs = new Map<Id64String, SpatialModelRefs>();
  private _swapRefs = new Map<Id64String, SpatialModelRefs>();
  private _scheduleScript?: RenderScheduleState;
  private _sectionCut?: StringifiedClipVector;

  public constructor(view: SpatialViewState) {
    this._view = view;
    this._scheduleScript = view.displayStyle.scheduleState;
    this._sectionCut = this.getSectionCutFromView();
  }

  public update(): void {
    this._allLoaded = false;
  }

  public *[Symbol.iterator](): Iterator<TileTreeReference> {
    this.load();
    for (const modelRef of this._refs.values())
      for (const ref of modelRef)
        yield ref;
  }

  private load(): void {
    if (!this._allLoaded) {
      this._allLoaded = true;
      this.updateModels();
    }

    const script = this._view.displayStyle.scheduleState;
    if (script !== this._scheduleScript) {
      this._scheduleScript = script;
      for (const ref of this._refs.values())
        ref.updateAnimated(script);
    }

    const sectionCut = this.getSectionCutFromView();
    if (sectionCut?.clipString !== this._sectionCut?.clipString) {
      this._sectionCut = sectionCut;
      for (const ref of this._refs.values())
        ref.updateSectionCut(sectionCut);
    }
  }

  private getSectionCutFromView(): StringifiedClipVector | undefined {
    const wantCut = this._view.viewFlags.clipVolume && this._view.displayStyle.settings.clipStyle.produceCutGeometry;
    const clip = wantCut ? this._view.getViewClip() : undefined;
    return StringifiedClipVector.fromClipVector(clip);
  }

  /** Ensure this._refs contains a SpatialModelRefs for all loaded models in the model selector. */
  private updateModels(): void {
    const prev = this._refs;
    const cur = this._swapRefs;
    this._refs = cur;
    this._swapRefs = prev;
    cur.clear();

    for (const modelId of this._view.modelSelector.models) {
      let modelRefs = prev.get(modelId);
      if (!modelRefs) {
        const model = this._view.iModel.models.getLoaded(modelId)?.asGeometricModel3d;
        if (model) {
          modelRefs = new SpatialModelRefs(model, this._view);
          modelRefs.updateAnimated(this._scheduleScript);
          modelRefs.updateSectionCut(this._sectionCut);
        }
      }

      if (modelRefs)
        cur.set(modelId, modelRefs);
    }
  }
}
