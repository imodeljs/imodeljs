/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Views
 */

import { assert, Id64String } from "@bentley/bentleyjs-core";
import { PlanarClipMaskMode, PlanarClipMaskPriority, PlanarClipMaskProps, PlanarClipMaskSettings } from "@bentley/imodeljs-common";
import { FeatureSymbology } from "./render/FeatureSymbology";
import { createMaskTreeReference, DisclosedTileTreeSet, TileTreeReference } from "./tile/internal";
import { ViewState3d } from "./ViewState";

/** The State of Planar Clip Mask applied to a reality model or background map.
 * Handles loading models and their associated tiles for models that are used by masks but may not be otherwise loaded or displayed.
 * @beta
 */
export class PlanarClipMaskState {
  public readonly settings: PlanarClipMaskSettings;
  private _tileTreeRefs?: TileTreeReference[];
  private _allLoaded = false;

  private constructor(settings: PlanarClipMaskSettings) {
    this.settings = settings;
  }

  public static create(settings: PlanarClipMaskSettings): PlanarClipMaskState {
    return new PlanarClipMaskState(settings);
  }

  public static fromJSON(props: PlanarClipMaskProps): PlanarClipMaskState {
    return this.create(PlanarClipMaskSettings.fromJSON(props));
  }

  public discloseTileTrees(trees: DisclosedTileTreeSet): void {
    if (this._tileTreeRefs)
      this._tileTreeRefs.forEach((treeRef) => treeRef.discloseTileTrees(trees));
  }

  public getTileTrees(view: ViewState3d, classifiedModelId: Id64String): TileTreeReference[] | undefined {
    if (this.settings.mode === PlanarClipMaskMode.Priority) {
      const viewTrees = new Array<TileTreeReference>();
      const thisPriority = this.settings.priority === undefined ? PlanarClipMaskPriority.RealityModel : this.settings.priority;
      view.forEachTileTreeRef((ref) => {
        const tree = ref.treeOwner.load();
        if (tree && tree.modelId !== classifiedModelId && ref.planarclipMaskPriority > thisPriority)
          viewTrees.push(ref);
      });

      return viewTrees;
    }

    if (!this._tileTreeRefs) {
      this._tileTreeRefs = new Array<TileTreeReference>();
      if (this.settings.modelIds) {
        for (const modelId of this.settings.modelIds) {
          const model = view.iModel.models.getLoaded(modelId);
          assert(model !== undefined);   // Models should be loaded by RealityModelTileTree
          if (model?.asGeometricModel)
            this._tileTreeRefs.push(createMaskTreeReference(model.asGeometricModel));
        }
      }
    }

    if (!this._allLoaded)
      this._allLoaded = this._tileTreeRefs.every((treeRef) => treeRef.treeOwner.load() !== undefined);

    return this._allLoaded ? this._tileTreeRefs : undefined;
  }

  public getPlanarClipMaskSymbologyOverrides(): FeatureSymbology.Overrides | undefined {
    if (!this.settings.subCategoryOrElementIds)
      return undefined;

    switch (this.settings.mode) {
      case PlanarClipMaskMode.IncludeElements: {
        const overrides = new FeatureSymbology.Overrides();
        overrides.setAlwaysDrawnSet(this.settings.subCategoryOrElementIds, true);
        return overrides;
      }
      case PlanarClipMaskMode.ExcludeElements: {
        const overrides = new FeatureSymbology.Overrides();

        overrides.ignoreSubCategory = true;
        overrides.setNeverDrawnSet(this.settings.subCategoryOrElementIds);

        return overrides;
      }
      case PlanarClipMaskMode.IncludeSubCategories: {
        const overrides = new FeatureSymbology.Overrides();
        for (const subCategoryId of this.settings.subCategoryOrElementIds)
          overrides.setVisibleSubCategory(subCategoryId);

        return overrides;
      }
    }

    return undefined;
  }
}
