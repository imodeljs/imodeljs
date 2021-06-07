/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IModelComponents
 */

import * as React from "react";
import { BeEvent } from "@bentley/bentleyjs-core";
import { IModelConnection, PerModelCategoryVisibility, ViewManager, Viewport } from "@bentley/imodeljs-frontend";
import { NodeKey } from "@bentley/presentation-common";
import { TreeNodeItem, useAsyncValue } from "@bentley/ui-components";
import { IVisibilityHandler, VisibilityChangeListener, VisibilityStatus } from "../VisibilityTreeEventHandler";

const EMPTY_CATEGORIES_ARRAY: Category[] = [];

/**
 * Loads categories from viewport or uses provided list of categories.
 * @internal
 */
export function useCategories(viewManager: ViewManager, imodel: IModelConnection, view?: Viewport) {
  const currentView = view || viewManager.getFirstOpenView();
  const categoriesPromise = React.useMemo(async () => loadCategoriesFromViewport(imodel, currentView), [imodel, currentView]);
  return useAsyncValue(categoriesPromise) ?? EMPTY_CATEGORIES_ARRAY;
}

/** @internal */
export async function loadCategoriesFromViewport(iModel?: IModelConnection, vp?: Viewport) {
  if (!vp)
    return EMPTY_CATEGORIES_ARRAY;

  // Query categories and add them to state
  const selectUsedSpatialCategoryIds = "SELECT DISTINCT Category.Id as id from BisCore.GeometricElement3d WHERE Category.Id IN (SELECT ECInstanceId from BisCore.SpatialCategory)";
  const selectUsedDrawingCategoryIds = "SELECT DISTINCT Category.Id as id from BisCore.GeometricElement2d WHERE Model.Id=? AND Category.Id IN (SELECT ECInstanceId from BisCore.DrawingCategory)";
  const ecsql = vp.view.is3d() ? selectUsedSpatialCategoryIds : selectUsedDrawingCategoryIds;
  const ecsql2 = `SELECT ECInstanceId as id, UserLabel as label, CodeValue as code FROM ${vp.view.is3d() ? "BisCore.SpatialCategory" : "BisCore.DrawingCategory"} WHERE ECInstanceId IN (${ecsql})`;

  const categories: Category[] = [];

  // istanbul ignore else
  if (iModel) {
    const rowIterator = iModel.query(ecsql2);
    // istanbul ignore next
    for await (const row of rowIterator) {
      const subCategoryIds = iModel.subcategories.getSubCategories(row.id);
      categories.push({ key: row.id, children: (subCategoryIds) ? [...subCategoryIds] : undefined });
    }
  }

  return categories;
}

/**
 * Data structure that describes category.
 * @internal
 */
export interface Category {
  key: string;
  children?: string[];
}

/** @internal */
export interface CategoryVisibilityHandlerParams {
  viewManager: ViewManager;
  imodel: IModelConnection;
  categories: Category[];
  activeView?: Viewport;
  allViewports?: boolean;
}

/** @internal */
export class CategoryVisibilityHandler implements IVisibilityHandler {
  private _viewManager: ViewManager;
  private _imodel: IModelConnection;
  private _pendingVisibilityChange: any | undefined;
  private _activeView?: Viewport;
  private _useAllViewports: boolean;
  private _categories: Category[];

  constructor(params: CategoryVisibilityHandlerParams) {
    this._viewManager = params.viewManager;
    this._imodel = params.imodel;
    this._activeView = params.activeView;
    // istanbul ignore next
    this._useAllViewports = params.allViewports ?? false;
    this._categories = params.categories;
    if (this._activeView) {
      this._activeView.onDisplayStyleChanged.addListener(this.onDisplayStyleChanged);
      this._activeView.onViewedCategoriesChanged.addListener(this.onViewedCategoriesChanged);
    }
  }

  public dispose() {
    if (this._activeView) {
      this._activeView.onDisplayStyleChanged.removeListener(this.onDisplayStyleChanged);
      this._activeView.onViewedCategoriesChanged.removeListener(this.onViewedCategoriesChanged);
    }
    clearTimeout(this._pendingVisibilityChange);
  }

  public onVisibilityChange = new BeEvent<VisibilityChangeListener>();

  public getVisibilityStatus(node: TreeNodeItem, nodeKey: NodeKey): VisibilityStatus {
    const instanceId = CategoryVisibilityHandler.getInstanceIdFromTreeNodeKey(nodeKey);
    return { state: node.parentId ? this.getSubCategoryVisibility(instanceId) : this.getCategoryVisibility(instanceId) };
  }

  public async changeVisibility(node: TreeNodeItem, nodeKey: NodeKey, shouldDisplay: boolean): Promise<void> {
    // handle subcategory visibility change
    if (node.parentId) {
      const childId = CategoryVisibilityHandler.getInstanceIdFromTreeNodeKey(nodeKey);
      // istanbul ignore next
      const parentId = this.getParent(childId)?.key;

      // make sure parent category is enabled
      if (shouldDisplay && parentId)
        CategoryVisibilityHandler.enableCategory(this._viewManager, this._imodel, [parentId], true, this._useAllViewports, false);

      CategoryVisibilityHandler.enableSubCategory(this._viewManager, childId, shouldDisplay, this._useAllViewports);
      return;
    }

    const instanceId = CategoryVisibilityHandler.getInstanceIdFromTreeNodeKey(nodeKey);
    CategoryVisibilityHandler.enableCategory(this._viewManager, this._imodel, [instanceId], shouldDisplay, true);
  }

  public getSubCategoryVisibility(id: string) {
    const parentItem = this.getParent(id);
    if (!parentItem || !this._activeView)
      return "hidden";

    const isVisible = this._activeView.view.viewsCategory(parentItem.key) && this._activeView.isSubCategoryVisible(id);
    return isVisible ? "visible" : "hidden";
  }

  public getCategoryVisibility(id: string) {
    if (!this._activeView)
      return "hidden";
    return this._activeView.view.viewsCategory(id) ? "visible" : "hidden";
  }

  public getParent(key: string): Category | undefined {
    for (const category of this._categories) {
      // istanbul ignore else
      if (category.children) {
        if (category.children.indexOf(key) !== -1)
          return category;
      }
    }

    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private onDisplayStyleChanged = () => {
    this.onVisibilityChangeInternal();
  };

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private onViewedCategoriesChanged = () => {
    this.onVisibilityChangeInternal();
  };

  private onVisibilityChangeInternal() {
    if (this._pendingVisibilityChange)
      return;

    this._pendingVisibilityChange = setTimeout(() => {
      this.onVisibilityChange.raiseEvent();
      this._pendingVisibilityChange = undefined;
    }, 0);
  }

  public static getInstanceIdFromTreeNodeKey(nodeKey: NodeKey) {
    return (NodeKey.isInstancesNodeKey(nodeKey) && nodeKey.instanceKeys.length > 0) ? nodeKey.instanceKeys[0].id : /* istanbul ignore next */ "";
  }

  /** Changes category display in the viewport */
  public static enableCategory(viewManager: ViewManager, imodel: IModelConnection, ids: string[], enabled: boolean, forAllViewports: boolean, enableAllSubCategories = true) {
    if (!viewManager.selectedView)
      return;

    const updateViewport = (vp: Viewport) => {
      // Only act on viewports that are both 3D or both 2D. Important if we have multiple viewports opened and we
      // are using 'allViewports' property
      if (viewManager.selectedView && viewManager.selectedView.view.is3d() === vp.view.is3d()) {
        vp.changeCategoryDisplay(ids, enabled, enableAllSubCategories);

        // remove category overrides per model
        const modelsContainingOverrides: string[] = [];
        for (const ovr of vp.perModelCategoryVisibility) {
          // istanbul ignore else
          if (ids.findIndex((id) => id === ovr.categoryId) !== -1)
            modelsContainingOverrides.push(ovr.modelId);
        }
        vp.perModelCategoryVisibility.setOverride(modelsContainingOverrides, ids, PerModelCategoryVisibility.Override.None);

        // changeCategoryDisplay only enables subcategories, it does not disabled them. So we must do that ourselves.
        if (false === enabled) {
          ids.forEach((id) => {
            const subCategoryIds = imodel.subcategories.getSubCategories(id);
            // istanbul ignore else
            if (subCategoryIds) {
              subCategoryIds.forEach((subCategoryId) => CategoryVisibilityHandler.enableSubCategory(viewManager, subCategoryId, false, forAllViewports));
            }
          });
        }
      }
    };

    // This property let us act on all viewports or just on the selected one, configurable by the app
    if (forAllViewports) {
      for (const viewport of viewManager) {
        updateViewport(viewport);
      }
    } else {
      updateViewport(viewManager.selectedView);
    }
  }

  /** Changes subcategory display in the viewport */
  public static enableSubCategory(viewManager: ViewManager, key: string, enabled: boolean, forAllViewports?: boolean) {
    if (!viewManager.selectedView)
      return;

    const updateViewport = (vp: Viewport) => {
      // Only act on viewports that are both 3D or both 2D. Important if we have multiple viewports opened and we
      // are using 'allViewports' property
      if (viewManager.selectedView && viewManager.selectedView.view.is3d() === vp.view.is3d()) {
        vp.changeSubCategoryDisplay(key, enabled);
      }
    };

    // This property let us act on all viewports or just on the selected one, configurable by the app
    if (forAllViewports) {
      for (const viewport of viewManager) {
        updateViewport(viewport);
      }
    } else {
      updateViewport(viewManager.selectedView);
    }
  }
}
