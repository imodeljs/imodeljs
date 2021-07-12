/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import {
  FeatureSymbology, IModelConnection, SceneContext, SnapshotConnection, SpatialModelState, TiledGraphicsProvider, TileTreeReference, Viewport,
} from "@bentley/imodeljs-frontend";
import { DisplayTestApp } from "./App";

/** A reference to a TileTree originating from a different IModelConnection than the one the user opened. */
class ExternalTreeRef extends TileTreeReference {
  private readonly _ref: TileTreeReference;
  private readonly _ovrs: FeatureSymbology.Overrides;

  public constructor(ref: TileTreeReference, ovrs: FeatureSymbology.Overrides) {
    super();
    this._ref = ref;
    this._ovrs = ovrs;
  }

  public override get castsShadows() {
    return this._ref.castsShadows;
  }

  public get treeOwner() { return this._ref.treeOwner; }

  public override addToScene(context: SceneContext): void {
    const tree = this.treeOwner.load();
    if (undefined === tree)
      return;

    // ###TODO transform
    const args = this.createDrawArgs(context);
    if (undefined === args)
      return;

    tree.draw(args);

    args.graphics.symbologyOverrides = this._ovrs;
    const branch = context.createBranch(args.graphics, args.location);
    context.outputGraphic(branch);
  }
}

class Provider implements TiledGraphicsProvider {
  private readonly _refs: TileTreeReference[] = [];
  public readonly iModel: IModelConnection;

  private constructor(vp: Viewport, iModel: IModelConnection, ovrs: FeatureSymbology.Overrides) {
    this.iModel = iModel;
    for (const model of iModel.models) {
      const spatial = model.asSpatialModel;
      if (undefined !== spatial) {
        const ref = spatial.createTileTreeReference(vp.view);
        this._refs.push(new ExternalTreeRef(ref, ovrs));
      }
    }
  }

  public static async create(vp: Viewport, iModel: IModelConnection): Promise<Provider> {
    const query = { from: SpatialModelState.classFullName, wantPrivate: false };
    const props = await iModel.models.queryProps(query);

    const modelIds = [];
    for (const prop of props)
      if (undefined !== prop.id)
        modelIds.push(prop.id);

    await iModel.models.load(modelIds);

    // Enable all categories (and subcategories thereof)
    const ecsql = "SELECT DISTINCT Category.Id as CategoryId from BisCore.GeometricElement3d WHERE Category.Id IN (SELECT ECInstanceId from BisCore.SpatialCategory)";
    const catIds: string[] = [];
    for await (const catId of iModel.query(ecsql))
      catIds.push(catId.categoryId);

    const subcatsRequest = iModel.subcategories.load(catIds);
    if (undefined !== subcatsRequest)
      await subcatsRequest.promise;

    // Ignore the symbology overrides defined on the viewport - instead, set up our own to draw our iModel's categories.
    const ovrs = new FeatureSymbology.Overrides();
    for (const catId of catIds) {
      const subcats = iModel.subcategories.getSubCategories(catId);
      if (undefined !== subcats)
        for (const subcat of subcats)
          ovrs.setVisibleSubCategory(subcat);
    }

    return new Provider(vp, iModel, ovrs);
  }

  public forEachTileTreeRef(_vp: Viewport, func: (ref: TileTreeReference) => void): void {
    for (const ref of this._refs)
      func(ref);
  }
}

const providersByViewport = new Map<Viewport, Provider>();

/** A simple proof-of-concept for drawing tiles from a different IModelConnection into a Viewport. */
export async function toggleExternalTiledGraphicsProvider(vp: Viewport): Promise<void> {
  const existing = providersByViewport.get(vp);
  if (undefined !== existing) {
    vp.dropTiledGraphicsProvider(existing);
    providersByViewport.delete(vp);
    await existing.iModel.close();
    return;
  }

  const filename = await DisplayTestApp.surface.selectFileName();
  if (undefined === filename)
    return;

  let iModel;
  try {
    iModel = await SnapshotConnection.openFile(filename);
    const provider = await Provider.create(vp, iModel);
    providersByViewport.set(vp, provider);
    vp.addTiledGraphicsProvider(provider);
  } catch (err) {
    alert(err.toString());
    return;
  }
}
