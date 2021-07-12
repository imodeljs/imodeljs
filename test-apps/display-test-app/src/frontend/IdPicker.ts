/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, compareStringsOrUndefined, Id64, Id64Arg } from "@bentley/bentleyjs-core";
import { CheckBox, ComboBoxEntry, createButton, createCheckBox, createComboBox, createTextBox } from "@bentley/frontend-devtools";
import { GeometricModel3dProps } from "@bentley/imodeljs-common";
import { GeometricModel3dState, ScreenViewport, SpatialViewState, ViewManip } from "@bentley/imodeljs-frontend";
import { ToolBarDropDown } from "./ToolBar";

// cspell:ignore dehilite textbox subcat

export abstract class IdPicker extends ToolBarDropDown {
  protected readonly _vp: ScreenViewport;
  protected readonly _element: HTMLElement;
  protected readonly _parent: HTMLElement;
  protected readonly _checkboxes: HTMLInputElement[] = [];
  protected readonly _availableIds = new Set<string>();

  protected abstract get _elementType(): "Model" | "Category";
  protected get _showIn2d(): boolean { return true; }
  protected abstract get _enabledIds(): Set<string>;
  protected abstract changeDisplay(ids: Id64Arg, enabled: boolean): void;

  protected toggleAll(enabled: boolean): void {
    this.changeDisplay(this._availableIds, enabled);
    for (const cb of this._checkboxes)
      cb.checked = enabled;
  }

  protected invertAll(): void {
    for (const cb of this._checkboxes) {
      const enabled = !cb.checked;
      cb.checked = enabled;
      this.changeDisplay(cb.id, enabled);
    }
  }

  protected get _comboBoxEntries(): ComboBoxEntry[] {
    return [
      { name: "", value: "" },
      { name: "Show All", value: "All" },
      { name: "Hide All", value: "None" },
      { name: "Invert", value: "Inverse" },
      { name: "Isolate Selected", value: "Isolate" },
      { name: "Hide Selected", value: "Hide" },
      { name: "Hilite Enabled", value: "Hilite" },
      { name: "Un-hilite Enabled", value: "Dehilite" },
    ];
  }

  protected enableByIds(ids: string[]): void {
    for (const id of ids)
      this.enableById(id);
  }

  protected enableById(id: string): void {
    for (const cb of this._checkboxes) {
      if (cb.id === id) {
        if (!cb.checked) {
          cb.checked = true;
          this.changeDisplay(id, true);
        }

        break;
      }
    }
  }

  protected abstract _populate(): Promise<void>;
  public async populate(): Promise<void> {
    this._availableIds.clear();
    this._checkboxes.length = 0;
    while (this._element.hasChildNodes())
      this._element.removeChild(this._element.firstChild!);

    const visible = this._showIn2d || this._vp.view.isSpatialView();
    this._parent.style.display = visible ? "block" : "none";
    if (!visible)
      return;

    createComboBox({
      name: "Display: ",
      id: `${this._elementType}Picker_show`,
      parent: this._element,
      handler: (select) => {
        this.show(select.value);
        select.value = "";
      },
      value: "",
      entries: this._comboBoxEntries,
    });

    const textbox = createTextBox({
      label: "Id: ",
      id: `${this._elementType}Enable_byId`,
      parent: this._element,
      tooltip: "Enter comma-separated list of Ids to enable",
      inline: true,
    }).textbox;
    textbox.onkeyup = (e) => {
      if (e.code === "Enter") // enter key
        this.enableByIds(textbox.value.split(","));
    };

    await this._populate();
  }

  protected constructor(vp: ScreenViewport, parent: HTMLElement) {
    super();
    this._vp = vp;
    this._parent = parent;

    this._element = document.createElement("div");
    this._element.className = "scrollingToolMenu";
    this._element.style.display = "block";

    parent.appendChild(this._element);
  }

  public get isOpen(): boolean { return "none" !== this._element.style.display; }
  protected _open(): void { this._element.style.display = "block"; }
  protected _close(): void { this._element.style.display = "none"; }
  public override get onViewChanged(): Promise<void> { return this.populate(); }

  protected showOrHide(element: HTMLElement, show: boolean) { if (element) element.style.display = show ? "block" : "none"; }

  protected addCheckbox(name: string, id: string, isChecked: boolean): CheckBox {
    this._availableIds.add(id);

    const cb = createCheckBox({
      name,
      id,
      parent: this._element,
      isChecked,
      handler: (checkbox) => {
        this.changeDisplay(checkbox.id, checkbox.checked);
      },
    });

    this._checkboxes.push(cb.checkbox);
    return cb;
  }

  protected show(which: string): void {
    switch (which) {
      case "All":
        this.toggleAll(true);
        return;
      case "None":
        this.toggleAll(false);
        return;
      case "Inverse":
        this.invertAll();
        return;
      case "Hilite":
      case "Dehilite":
        this.hiliteEnabled("Hilite" === which);
        return;
      case "":
        return;
    }

    this.queryIds().then((ids) => {
      if (0 === ids.length)
        return;

      const isolate = "Isolate" === which;
      if (isolate)
        this.toggleAll(false);

      this.toggleIds(ids, isolate);
    }).catch((reason) => {
      alert(`Error querying iModel: ${reason}`);
    });
  }

  private async queryIds(): Promise<string[]> {
    const is2d = this._vp.view.is2d();
    const elementType = this._elementType;
    if (is2d && elementType === "Model")
      return [];

    const selectedElems = this._vp.iModel.selectionSet.elements;
    if (0 === selectedElems.size || selectedElems.size > 20) {
      if (0 < selectedElems.size)
        alert("Too many elements selected");

      return [];
    }

    const elemIds = `(${Array.from(selectedElems).join(",")})`;
    const ecsql = `SELECT DISTINCT ${elementType}.Id FROM bis.GeometricElement${is2d ? "2d" : "3d"} WHERE ECInstanceId IN ${elemIds}`;
    const rows = [];
    for await (const row of this._vp.view.iModel.query(ecsql)) {
      rows.push(row);
    }
    const column = `${elementType.toLowerCase()}.id`;
    return rows.map((value) => value[column]);
  }

  protected toggleIds(ids: Id64Arg, enabled: boolean): void {
    const boxById = new Map<string, HTMLInputElement>();
    this._checkboxes.map((box) => boxById.set(box.id, box));
    for (const id of Id64.iterable(ids)) {
      this.changeDisplay(id, enabled);
      if (boxById.get(id))
        boxById.get(id)!.checked = enabled;
    }
  }

  protected abstract hiliteEnabled(hiliteOn: boolean): void;
}

function getCategoryName(row: any): string {
  return undefined !== row.label ? row.label : row.code;
}

const selectUsedSpatialCategoryIds = "SELECT DISTINCT Category.Id as CategoryId from BisCore.GeometricElement3d WHERE Category.Id IN (SELECT ECInstanceId from BisCore.SpatialCategory)";
const selectUsedDrawingCategoryIds = "SELECT DISTINCT Category.Id as CategoryId from BisCore.GeometricElement2d WHERE Model.Id=? AND Category.Id IN (SELECT ECInstanceId from BisCore.DrawingCategory)";
const selectCategoryProps = "SELECT ECInstanceId as id, CodeValue as code, UserLabel as label FROM ";
const selectSpatialCategoryProps = `${selectCategoryProps}BisCore.SpatialCategory WHERE ECInstanceId IN (${selectUsedSpatialCategoryIds})`;
const selectDrawingCategoryProps = `${selectCategoryProps}BisCore.DrawingCategory WHERE ECInstanceId IN (${selectUsedDrawingCategoryIds})`;

export class CategoryPicker extends IdPicker {
  public constructor(vp: ScreenViewport, parent: HTMLElement) { super(vp, parent); }

  protected get _elementType(): "Category" { return "Category"; }
  protected get _enabledIds() { return this._vp.view.categorySelector.categories; }
  protected changeDisplay(ids: Id64Arg, enabled: boolean) { this._vp.changeCategoryDisplay(ids, enabled); }

  protected override get _comboBoxEntries(): ComboBoxEntry[] {
    const entries = super._comboBoxEntries;
    entries.push({ name: "All SubCategories", value: "Subcategories" });
    return entries;
  }

  protected async _populate(): Promise<void> {
    this._element.appendChild(document.createElement("hr"));

    const view = this._vp.view;
    if (!view.iModel.isOpen)
      return;

    const ecsql = view.is3d() ? selectSpatialCategoryProps : selectDrawingCategoryProps;
    const bindings = view.is2d() ? [view.baseModelId] : undefined;
    const rows: any[] = [];
    for await (const row of view.iModel.query(`${ecsql} LIMIT 1000`, bindings)) {
      rows.push(row);
    }
    rows.sort((lhs, rhs) => {
      const lhName = getCategoryName(lhs);
      const rhName = getCategoryName(rhs);
      if (lhName < rhName)
        return -1;
      else if (lhName > rhName)
        return 1;
      else
        return 0;
    });

    for (const row of rows) {
      const name = getCategoryName(row);
      this.addCheckbox(name, row.id, view.categorySelector.has(row.id));
    }

    // Remove any unused categories from category selector (otherwise areAllEnabled criterion is broken).
    let unusedCategories: Set<string> | undefined;
    for (const categoryId of view.categorySelector.categories) {
      if (!this._availableIds.has(categoryId)) {
        if (undefined === unusedCategories)
          unusedCategories = new Set<string>();

        unusedCategories.add(categoryId);
      }
    }

    if (undefined !== unusedCategories)
      this._vp.changeCategoryDisplay(unusedCategories, false);
  }

  protected override show(which: string): void {
    if ("Subcategories" === which)
      this._vp.changeCategoryDisplay(this._enabledIds, true, true);
    else
      super.show(which);
  }

  protected hiliteEnabled(hiliteOn: boolean): void {
    const catIds = this._enabledIds;
    const cache = this._vp.iModel.subcategories;
    const set = this._vp.iModel.hilited.subcategories;
    for (const catId of catIds) {
      const subcatIds = cache.getSubCategories(catId);
      if (undefined !== subcatIds) {
        for (const subcatId of subcatIds) {
          if (hiliteOn)
            set.addId(subcatId);
          else
            set.deleteId(subcatId);
        }
      }
    }
  }
}

export class ModelPicker extends IdPicker {
  private _availableIdList: string[] = [];
  private _stepIndex = -1;
  private _fitOnStep = true;
  private _planProjectionIds: string[] = [];

  public constructor(vp: ScreenViewport, parent: HTMLElement) { super(vp, parent); }

  protected get _elementType(): "Model" { return "Model"; }
  protected get _enabledIds() { return (this._vp.view as SpatialViewState).modelSelector.models; }
  protected override get _showIn2d() { return false; }
  protected changeDisplay(ids: Id64Arg, enabled: boolean) {
    if (enabled)
      this._vp.addViewedModels(ids); // eslint-disable-line @typescript-eslint/no-floating-promises
    else
      this._vp.changeModelDisplay(ids, enabled);
  }

  protected hiliteEnabled(hiliteOn: boolean): void {
    const modelIds = this._enabledIds;
    const hilites = this._vp.iModel.hilited;
    for (const modelId of modelIds) {
      if (hiliteOn)
        hilites.models.addId(modelId);
      else
        hilites.models.deleteId(modelId);
    }
  }

  protected async _populate(): Promise<void> {
    const buttons = document.createElement("div");
    buttons.style.textAlign = "center";
    createButton({
      parent: buttons,
      value: "⏪",
      inline: true,
      handler: () => this.stepToIndex(0),
      tooltip: "Isolate first",
    });
    createButton({
      parent: buttons,
      value: "◀️",
      inline: true,
      handler: () => this.stepToIndex(this._stepIndex - 1),
      tooltip: "Isolate previous",
    });
    createButton({
      parent: buttons,
      value: "➕",
      inline: true,
      handler: () => {
        const enabledIds = this._enabledIds;
        for (let i = 0; i < this._availableIdList.length; i++) {
          if (enabledIds.has(this._availableIdList[i])) {
            this.stepToIndex(i);
            break;
          }
        }
      },
      tooltip: "Set first enabled as step index",
    });
    const fit = createButton({
      parent: buttons,
      value: "⛶",
      inline: true,
      handler: () => {
        this._fitOnStep = !this._fitOnStep;
        fit.style.borderStyle = this._fitOnStep ? "inset" : "outset";
      },
      tooltip: "Fit after isolate",
    }).button;
    fit.style.borderStyle = "inset";
    createButton({
      parent: buttons,
      value: "▶️",
      inline: true,
      handler: () => this.stepToIndex(this._stepIndex + 1),
      tooltip: "Isolate next",
    });
    createButton({
      parent: buttons,
      value: "⏩",
      inline: true,
      handler: () => this.stepToIndex(this._availableIdList.length - 1),
      tooltip: "Isolate last",
    });
    this._element.appendChild(buttons);

    const view = this._vp.view as SpatialViewState;
    assert(undefined !== view && view.isSpatialView());

    const query = { from: GeometricModel3dState.classFullName, wantPrivate: true };
    const props = await view.iModel.models.queryProps(query);
    props.forEach((prop) => { if (prop.isPrivate) prop.name = `~${prop.name}`; });
    props.sort((lhs, rhs) => compareStringsOrUndefined(lhs.name, rhs.name));

    const selector = view.modelSelector;
    for (const prop of props) {
      if (undefined !== prop.id && undefined !== prop.name) {
        this.addCheckbox(prop.name, prop.id, selector.has(prop.id));
        if ((prop as GeometricModel3dProps).isPlanProjection)
          this._planProjectionIds.push(prop.id);
      }
    }

    this._availableIdList = Array.from(this._availableIds);
  }

  private stepToIndex(index: number): void {
    if (index < 0 || index >= this._availableIdList.length)
      return;

    this._stepIndex = index;
    this.toggleAll(false);
    this.enableById(this._availableIdList[index]);

    if (this._fitOnStep)
      ViewManip.fitView(this._vp, true);
  }

  protected override get _comboBoxEntries() {
    const entries = super._comboBoxEntries;
    entries.push({ name: "Plan Projections", value: "PlanProjections" });
    return entries;
  }

  protected override show(which: string) {
    if ("PlanProjections" === which) {
      this.toggleAll(false);
      this.toggleIds(this._planProjectionIds, true);
    } else {
      super.show(which);
    }
  }
}
