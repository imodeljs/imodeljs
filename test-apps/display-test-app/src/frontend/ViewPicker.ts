/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { BeEvent, compareBooleans, compareStrings, Id64, Id64String, SortedArray } from "@bentley/bentleyjs-core";
import { ColorDef } from "@bentley/imodeljs-common";
import { IModelConnection, SpatialViewState, ViewState } from "@bentley/imodeljs-frontend";

interface ViewSpec extends IModelConnection.ViewSpec {
  isPrivate: boolean;
}

export class ViewList extends SortedArray<ViewSpec> {
  private _defaultViewId = Id64.invalid;
  private readonly _views = new Map<Id64String, ViewState>();

  private constructor() {
    super((lhs, rhs) => {
      // Every entry has a unique Id, but we want to sort in the UI based on other criteria first.
      let cmp = compareBooleans(lhs.isPrivate, rhs.isPrivate);
      if (0 === cmp) {
        cmp = compareStrings(lhs.name, rhs.name);
        if (0 === cmp)
          cmp = compareStrings(lhs.id, rhs.id);
      }

      return cmp;
    });
  }

  public get defaultViewId(): Id64String { return this._defaultViewId; }

  public async getView(id: Id64String, iModel: IModelConnection): Promise<ViewState> {
    let view = this._views.get(id);
    if (undefined === view) {
      try {
        view = await iModel.views.load(id);
      } catch (_) {
        // The view probably refers to a nonexistent display style or model/category selector. Replace with a default spatial view.
        // Or, we've opened a blank connection and `id` is intentionally invalid.
        // The viewport's title bar will display "UNNAMED" instead of the bad view's name.
        view = this.manufactureSpatialView(iModel);
      }

      this._views.set(id, view);
    }

    // NB: We clone so that if user switches back to this view, it is shown in its initial (persistent) state.
    return view.clone();
  }

  public async getDefaultView(iModel: IModelConnection): Promise<ViewState> {
    return this.getView(this.defaultViewId, iModel);
  }

  public static async create(iModel: IModelConnection, viewName?: string): Promise<ViewList> {
    const viewList = new ViewList();
    await viewList.populate(iModel, viewName);
    return viewList;
  }

  public override clear(): void {
    super.clear();
    this._defaultViewId = Id64.invalid;
    this._views.clear();
  }

  public async populate(iModel: IModelConnection, viewName?: string): Promise<void> {
    this.clear();

    // Query all non-private views. They sort first in list.
    let specs = await iModel.views.getViewList({ wantPrivate: false });
    for (const spec of specs)
      this.insert({ ...spec, isPrivate: false });

    // Query private views. They sort to end of list.
    const nSpecs = specs.length;
    specs = await iModel.views.getViewList({ wantPrivate: true });
    if (specs.length > nSpecs) {
      for (const spec of specs) {
        const entry = { ...spec, isPrivate: false };
        if (!this.findEqual(entry)) {
          entry.isPrivate = true;
          this.insert(entry);
        }
      }
    }

    if (undefined !== viewName) {
      for (const spec of this) {
        if (spec.name === viewName) {
          this._defaultViewId = spec.id;
          break;
        }
      }
    }

    if (Id64.isInvalid(this._defaultViewId) && 0 < this._array.length) {
      this._defaultViewId = this._array[0].id;
      const defaultViewId = await iModel.views.queryDefaultViewId();
      for (const spec of this) {
        if (spec.id === defaultViewId) {
          this._defaultViewId = defaultViewId;
          break;
        }
      }
    }

    if (Id64.isInvalid(this._defaultViewId))
      this.insert({ id: Id64.invalid, name: "Spatial View", class: SpatialViewState.classFullName, isPrivate: false });

    // Ensure default view is selected and loaded.
    await this.getView(this._defaultViewId, iModel);
  }

  // create a new spatial view initialized to show the project extents from top view. Model and
  // category selectors are empty, so this is really only useful for testing backgroundMaps and
  // reality models.
  private manufactureSpatialView(iModel: IModelConnection): SpatialViewState {
    const ext = iModel.projectExtents;

    // start with a new "blank" spatial view to show the extents of the project, from top view
    const blankView = SpatialViewState.createBlank(iModel, ext.low, ext.high.minus(ext.low));

    // turn on the background map
    const style = blankView.displayStyle;
    const viewFlags = style.viewFlags;
    viewFlags.backgroundMap = true;
    style.viewFlags = viewFlags; // call to accessor to get the json properties to reflect the changes to ViewFlags

    style.backgroundColor = ColorDef.white;

    // turn on the skybox in the environment
    const env = style.environment;
    env.sky.display = true;
    style.environment = env; // call to accessor to get the json properties to reflect the changes

    return blankView;
  }
}

export class ViewPicker {
  private readonly _select: HTMLSelectElement;
  public readonly onSelectedViewChanged = new BeEvent<(viewId: Id64String) => void>();

  public get element(): HTMLElement { return this._select; }

  public constructor(parent: HTMLElement, views: ViewList) {
    this._select = document.createElement("select");
    this._select.className = "viewList";
    this._select.onchange = () => this.onSelectedViewChanged.raiseEvent(this._select.value);

    parent.appendChild(this._select);

    this.populate(views);
  }

  public populate(views: ViewList): void {
    while (this._select.hasChildNodes())
      this._select.removeChild(this._select.firstChild!);

    let index = 0;
    for (const spec of views) {
      const option = document.createElement("option");
      option.innerText = spec.name;
      option.value = spec.id;
      this._select.appendChild(option);
      if (spec.id === views.defaultViewId)
        this._select.selectedIndex = index;
      index++;
    }
  }
}
