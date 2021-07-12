/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */
import { compareStrings, compareStringsOrUndefined, Id64, Id64String } from "@bentley/bentleyjs-core";
import { BatchType, ClassifierTileTreeId, compareIModelTileTreeIds, iModelTileTreeIdToString, SpatialClassifier, SpatialClassifiers } from "@bentley/imodeljs-common";
import { DisplayStyleState } from "../DisplayStyleState";
import { IModelApp } from "../IModelApp";
import { IModelConnection } from "../IModelConnection";
import { GeometricModelState } from "../ModelState";
import { SceneContext } from "../ViewContext";
import { ViewState } from "../ViewState";
import {
  DisclosedTileTreeSet, IModelTileTree, iModelTileTreeParamsFromJSON, TileTree, TileTreeLoadStatus, TileTreeOwner, TileTreeReference, TileTreeSupplier,
} from "./internal";

interface ClassifierTreeId extends ClassifierTileTreeId {
  modelId: Id64String;
}

function compareIds(lhs: ClassifierTreeId, rhs: ClassifierTreeId): number {
  let cmp = compareStrings(lhs.modelId, rhs.modelId);
  if (0 === cmp)
    cmp = compareStringsOrUndefined(lhs.animationId, rhs.animationId);

  return 0 === cmp ? compareIModelTileTreeIds(lhs, rhs) : cmp;
}

class ClassifierTreeSupplier implements TileTreeSupplier {
  private readonly _nonexistentTreeOwner = {
    tileTree: undefined,
    loadStatus: TileTreeLoadStatus.NotFound,
    load: () => undefined,
    dispose: () => undefined,
    loadTree: async () => undefined,
    iModel: undefined as unknown as IModelConnection,
  };

  public compareTileTreeIds(lhs: ClassifierTreeId, rhs: ClassifierTreeId): number {
    return compareIds(lhs, rhs);
  }

  public async createTileTree(id: ClassifierTreeId, iModel: IModelConnection): Promise<TileTree | undefined> {
    await iModel.models.load(id.modelId);
    const model = iModel.models.getLoaded(id.modelId);
    if (undefined === model || !(model instanceof GeometricModelState))
      return undefined;

    const idStr = iModelTileTreeIdToString(id.modelId, id, IModelApp.tileAdmin);
    const props = await IModelApp.tileAdmin.requestTileTreeProps(iModel, idStr);

    const options = {
      edgesRequired: false,
      allowInstancing: false,
      is3d: true,
      batchType: id.type,
    };

    const params = iModelTileTreeParamsFromJSON(props, iModel, id.modelId, options);
    return new IModelTileTree(params, id);
  }

  public getOwner(id: ClassifierTreeId, iModel: IModelConnection): TileTreeOwner {
    return Id64.isValid(id.modelId) ? iModel.tiles.getTileTreeOwner(id, this) : this._nonexistentTreeOwner;
  }

  public addModelsAnimatedByScript(modelIds: Set<Id64String>, scriptSourceId: Id64String, trees: Iterable<{ id: ClassifierTreeId, owner: TileTreeOwner }>): void {
    for (const tree of trees)
      if (tree.id.animationId === scriptSourceId)
        modelIds.add(tree.id.modelId);
  }

  public addSpatialModels(modelIds: Set<Id64String>, trees: Iterable<{ id: ClassifierTreeId, owner: TileTreeOwner }>): void {
    for (const tree of trees)
      modelIds.add(tree.id.modelId);
  }
}

const classifierTreeSupplier = new ClassifierTreeSupplier();

/** @internal */
export abstract class SpatialClassifierTileTreeReference extends TileTreeReference {
  public abstract get classifiers(): SpatialClassifiers;
  public abstract get isPlanar(): boolean;
  public abstract get activeClassifier(): SpatialClassifier | undefined;
}

/** @internal */
class ClassifierTreeReference extends SpatialClassifierTileTreeReference {
  private _id: ClassifierTreeId;
  private readonly _classifiers: SpatialClassifiers;
  private readonly _source: ViewState | DisplayStyleState;
  private readonly _iModel: IModelConnection;
  private readonly _classifiedTree: TileTreeReference;
  private _owner: TileTreeOwner;

  public constructor(classifiers: SpatialClassifiers, classifiedTree: TileTreeReference, iModel: IModelConnection, source: ViewState | DisplayStyleState) {
    super();
    this._id = this.createId(classifiers, source);
    this._source = source;
    this._iModel = iModel;
    this._classifiers = classifiers;
    this._classifiedTree = classifiedTree;
    this._owner = classifierTreeSupplier.getOwner(this._id, iModel);
  }

  public get classifiers(): SpatialClassifiers { return this._classifiers; }
  public get activeClassifier(): SpatialClassifier | undefined { return this.classifiers.active; }

  public override get castsShadows() {
    return false;
  }

  public get treeOwner(): TileTreeOwner {
    const newId = this.createId(this._classifiers, this._source);
    if (0 !== compareIds(this._id, newId)) {
      this._id = newId;
      this._owner = classifierTreeSupplier.getOwner(this._id, this._iModel);
    }

    return this._owner;
  }

  public override discloseTileTrees(trees: DisclosedTileTreeSet): void {
    // NB: We do NOT call super because we don't use our tree if no classifier is active.
    trees.disclose(this._classifiedTree);

    const classifier = this.activeClassifier;
    const classifierTree = undefined !== classifier ? this.treeOwner.tileTree : undefined;
    if (undefined !== classifierTree)
      trees.add(classifierTree);
  }
  public get isPlanar() { return BatchType.PlanarClassifier === this._id.type; }

  // Add volume classifiers to scene (planar classifiers are added seperately.)
  public override addToScene(context: SceneContext): void {
    if (this.isPlanar)
      return;

    const classifiedTree = this._classifiedTree.treeOwner.load();
    if (undefined === classifiedTree)
      return;

    const classifier = this._classifiers.active;
    if (undefined === classifier)
      return;

    const classifierTree = this.treeOwner.load();
    if (undefined === classifierTree)
      return;

    context.setVolumeClassifier(classifier, classifiedTree.modelId);
    super.addToScene(context);
  }

  private createId(classifiers: SpatialClassifiers, source: ViewState | DisplayStyleState): ClassifierTreeId {
    const active = classifiers.active;
    if (undefined === active)
      return { modelId: Id64.invalid, type: BatchType.PlanarClassifier, expansion: 0, animationId: undefined };

    const type = active.flags.isVolumeClassifier ? BatchType.VolumeClassifier : BatchType.PlanarClassifier;
    const script = source.scheduleState;
    const animationId = (undefined !== script) ? script.getModelAnimationId(active.modelId) : undefined;
    return {
      modelId: active.modelId,
      type,
      expansion: active.expand,
      animationId,
    };
  }
}

/** @internal */
export function createClassifierTileTreeReference(classifiers: SpatialClassifiers, classifiedTree: TileTreeReference, iModel: IModelConnection, source: ViewState | DisplayStyleState): SpatialClassifierTileTreeReference {
  return new ClassifierTreeReference(classifiers, classifiedTree, iModel, source);
}
