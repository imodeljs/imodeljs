/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { Id64 } from "@bentley/bentleyjs-core";
import { FeatureAppearance, FeatureAppearanceProps, FeatureOverrides } from "@bentley/imodeljs-common";
import { Viewport } from "../Viewport";
import { ViewState } from "../ViewState";

// cspell:ignore subcat subcats

/** Contains types that enable an application to customize how [Feature]($common)s are drawn within a [[Viewport]].
 * @public
 */
export namespace FeatureSymbology {
  /** @deprecated use [FeatureAppearanceProps]($common) */
  export interface AppearanceProps extends FeatureAppearanceProps { } // eslint-disable-line @typescript-eslint/no-empty-interface

  /** @deprecated use [FeatureAppearance]($common) */
  export class Appearance extends FeatureAppearance { } // eslint-disable-line @typescript-eslint/no-empty-interface

  /** Allows a [[Viewport]] to customize the appearance of individual [Feature]($common)s within it.
   *
   * The Viewport computes its base Overrides based on the following:
   *  - The set of categories enabled for display in its [[CategorySelectorState]]. Every [[SubCategory]] belonging to an enabled [[Category]] is added to the set of visible subcategories - all other subcategories are assumed to be invisible.
   *  - For the set of visible subcategories, any [[SubCategoryOverride]]s defined by the view's [[DisplayStyleState]] are applied. This may render some subcategories invisible, and change the symbology of others.
   *  - The visibility of each [GeometryClass]($common) is set based on the view's [ViewFlags]($common).
   *  - The line weight is overridden to 1 pixel for all Features if line weight has been disabled by the view's [ViewFlags]($common).
   *  - The sets of elements which are always drawn and never drawn are initialized from the [[Viewport]]'s sets.
   * An application can further customize the symbology of any Features by registering a [[FeatureOverrideProvider]] with a [[Viewport]]. That provider's addFeatureOverrides function will be invoked
   * whenever the Overrides need to be regenerated.
   *
   * To override the symbology of *most* Features within a view, specify a `defaultOverrides` to be applied to any Feature not explicitly overridden.
   * If default overrides are defined and some Features should draw normally without being affected by the default overrides, override that Feature with
   * an Appearance which defines no overrides.
   *
   * It is possible to override multiple aspects of a Feature. For example, you might specify that all elements belonging to subcategory "A" should be drawn in red, and
   * that the element with Id "0x123" should be drawn with 0.25 transparency. In this case, when drawing a Feature with subcategory "A" and element Id "0x123", the two overrides will
   * be merged, causing the Feature's geometry to draw 25% transparent red. On the other hand, if subcategory "A" is specified to draw in red and element "0x123" to draw in green,
   * the color specified by the element override will take precedence over that specified for the subcategory, resulting in a green Feature.
   *
   * @see [[Viewport.alwaysDrawn]]
   * @see [[Viewport.neverDrawn]]
   */
  export class Overrides extends FeatureOverrides {
    /** Construct a new Overrides. The result is an empty set of overrides if no view or viewport is supplied.
     * @param view If supplied, the overrides will be initialized based on the current state of the view or viewport.
     */
    public constructor(view?: ViewState | Viewport) {
      super();
      if (undefined !== view) {
        if (view instanceof Viewport)
          this.initFromViewport(view);
        else
          this.initFromView(view);
      }
    }

    /** Initialize these Overrides based on a specific view.
     * @internal
     */
    public initFromView(view: ViewState): void {
      this._initFromView(view);
      this._initSubCategoryOverrides(view);
    }

    /** Initialize these Overrides based on a specific viewport.
     * @internal
     */
    public initFromViewport(viewport: Viewport): void {
      const view = viewport.view;
      this._initFromView(view);

      if (undefined !== viewport.neverDrawn)
        this.setNeverDrawnSet(viewport.neverDrawn);

      if (undefined !== viewport.alwaysDrawn)
        this.setAlwaysDrawnSet(viewport.alwaysDrawn, viewport.isAlwaysDrawnExclusive);

      viewport.addFeatureOverrides(this);
      viewport.addModelSubCategoryVisibilityOverrides(this, this._modelSubCategoryOverrides);

      // This will include any per-model subcategory visibility overrides added above.
      this._initSubCategoryOverrides(view);
    }

    private _initFromView(view: ViewState): void {
      const { viewFlags } = view;
      const { constructions, dimensions, patterns } = viewFlags;

      this.neverDrawnAnimationNodes.clear();
      this.animationNodeOverrides.clear();

      for (const excluded of view.displayStyle.settings.excludedElementIds)
        this.setNeverDrawn(excluded);

      this._constructions = constructions;
      this._dimensions = dimensions;
      this._patterns = patterns;
      this._lineWeights = viewFlags.weights;

      for (const categoryId of view.categorySelector.categories) {
        const subCategoryIds = view.iModel.subcategories.getSubCategories(categoryId);
        if (undefined === subCategoryIds)
          continue;

        for (const subCategoryId of subCategoryIds) {
          if (view.isSubCategoryVisible(subCategoryId)) {
            const idLo = Id64.getLowerUint32(subCategoryId);
            const idHi = Id64.getUpperUint32(subCategoryId);
            this._visibleSubCategories.add(idLo, idHi);

            const app = view.iModel.subcategories.getSubCategoryAppearance(subCategoryId);
            if (undefined !== app)
              this._subCategoryPriorities.set(idLo, idHi, app.priority);
          }
        }
      }
      const style = view.displayStyle;
      style.settings.modelAppearanceOverrides.forEach((override, modelId) => this.overrideModel(modelId, override, false));
      style.forEachRealityModel((realityModel) => {
        if (realityModel.appearanceOverrides && realityModel.modelId)
          this.overrideModel(realityModel.modelId, realityModel.appearanceOverrides);
      });

      const script = style.scheduleState;
      if (script)
        script.getSymbologyOverrides(this, style.settings.timePoint ?? 0);

      if (!view.is3d())
        return;

      const planProjectionSettings = view.getDisplayStyle3d().settings.planProjectionSettings;
      if (undefined === planProjectionSettings)
        return;

      for (const [modelId, projSettings] of planProjectionSettings) {
        if (undefined !== projSettings.transparency)
          this.overrideModel(modelId, FeatureAppearance.fromJSON({ transparency: projSettings.transparency }));
      }
    }

    private _initSubCategoryOverrides(view: ViewState): void {
      const addOverride = (idLo: number, idHi: number) => {
        const subCategoryId = Id64.fromUint32Pair(idLo, idHi);
        const ovr = view.getSubCategoryOverride(subCategoryId);
        if (undefined !== ovr) {
          const app = FeatureAppearance.fromSubCategoryOverride(ovr);
          if (app.overridesSymbology)
            this._subCategoryOverrides.set(idLo, idHi, app);

          if (undefined !== ovr.priority)
            this._subCategoryPriorities.set(idLo, idHi, ovr.priority);
        }
      };

      // Add overrides for all subcategories visible in the view
      this._visibleSubCategories.forEach((idLo: number, idHi: number) => {
        addOverride(idLo, idHi);
      });

      // Add overrides for all subcategories overridden to be visible in specific models
      this._modelSubCategoryOverrides.forEach((_modelIdLo: number, _modelIdHi: number, subcats: Id64.Uint32Set) => {
        subcats.forEach((idLo: number, idHi: number) => {
          if (!this.isSubCategoryVisible(idLo, idHi)) {
            // Overridden to be visible in one or more models - will need the appearance overrides
            addOverride(idLo, idHi);
          }
        });
      });
    }
  }
}
