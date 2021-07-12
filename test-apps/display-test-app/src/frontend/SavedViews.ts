/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Id64Arg } from "@bentley/bentleyjs-core";
import { createButton, createTextBox, deserializeViewState, serializeViewState } from "@bentley/frontend-devtools";
import { IModelConnection, Viewport, ViewState } from "@bentley/imodeljs-frontend";
import { DtaRpcInterface } from "../common/DtaRpcInterface";
import { Provider } from "./FeatureOverrides";
import { NamedViewStatePropsString, NamedVSPSList } from "./NamedViews";
import { ToolBarDropDown } from "./ToolBar";

export interface ApplySavedView {
  applySavedView(view: ViewState): Promise<void>;
}

export class SavedViewPicker extends ToolBarDropDown {
  private readonly _vp: Viewport;
  private readonly _element: HTMLElement;
  private _imodel: IModelConnection;
  private readonly _views = NamedVSPSList.create();
  private _selectedView?: NamedViewStatePropsString;
  private readonly _viewer: ApplySavedView;
  private _onSelectedViewChanged?: () => void;
  private _newViewName = "";

  public set selectedView(view: NamedViewStatePropsString | undefined) {
    this._selectedView = view;
    if (undefined !== this._onSelectedViewChanged)
      this._onSelectedViewChanged();
  }

  public constructor(vp: Viewport, parent: HTMLElement, viewer: ApplySavedView) {
    super();

    this._vp = vp;
    this._imodel = vp.iModel;
    this._viewer = viewer;

    this._element = document.createElement("div");
    this._element.className = "toolMenu";
    this._element.style.display = "block";
    this._element.style.width = "300px";
    this._element.style.overflowX = "none";

    parent.appendChild(this._element);
  }

  public get isOpen() { return "none" !== this._element.style.display; }
  protected _open() { this._element.style.display = "block"; }
  protected _close() { this._element.style.display = "none"; }

  public override get onViewChanged(): Promise<void> | undefined {
    if (this._imodel !== this._vp.iModel) {
      this._imodel = this._vp.iModel;
      return this.populate();
    } else {
      return undefined;
    }
    // Make sure that any feature overrides are cleared.
    // Note: this is only really necessary if FeatureOverridesPanel has not been opened yet and we have recalled a view that has saved feature overrides
    // Provider.remove(this._vp);
  }

  public async populate(): Promise<void> {
    if (!this._imodel.isOpen)
      return;

    const filename = this._imodel.key;
    const esvString = await DtaRpcInterface.getClient().readExternalSavedViews(filename);
    this._views.loadFromString(esvString);
    this.populateFromViewList();
  }

  private populateFromViewList(): void {
    this.selectedView = undefined;
    this._onSelectedViewChanged = undefined;

    while (this._element.hasChildNodes())
      this._element.removeChild(this._element.firstChild!);

    const textBox = createTextBox({
      id: "txt_viewName",
      parent: this._element,
      tooltip: "Name of new saved view to create",
      keypresshandler: async (_tb, ev): Promise<void> => {
        ev.stopPropagation();
        if ("Enter" === ev.key)
          await this.saveView();
      },
    });

    this._element.appendChild(document.createElement("hr"));

    const viewsDiv = document.createElement("div");
    viewsDiv.style.overflowY = "auto";
    viewsDiv.style.overflowX = "none";
    viewsDiv.style.width = "100%";
    this._element.appendChild(viewsDiv);

    const viewsList = document.createElement("select");
    // If only 1 entry in list, input becomes a combo box and can't select the view...
    viewsList.size = 1 === this._views.length ? 2 : Math.min(15, this._views.length);
    viewsList.style.width = "100%";
    viewsList.style.display = 0 < this._views.length ? "" : "none";
    viewsDiv.appendChild(viewsList);
    viewsDiv.onchange = () => this.selectedView = viewsList.value ? this.findView(viewsList.value) : undefined;
    viewsList.addEventListener("keyup", async (ev) => {
      if (ev.key === "Delete")
        await this.deleteView();
    });

    for (const view of this._views) {
      const option = document.createElement("option");
      option.value = option.innerHTML = view.name;
      option.addEventListener("dblclick", async () => this.recallView());
      viewsList.appendChild(option);
    }

    const buttonDiv = document.createElement("div");
    buttonDiv.style.textAlign = "center";

    const newButton = createButton({
      parent: buttonDiv,
      id: "btn_createSavedView",
      value: "Create",
      handler: () => this.saveView(), // eslint-disable-line @typescript-eslint/promise-function-async
      tooltip: "Create new saved view",
      inline: true,
    }).button;

    const recallButton = createButton({
      parent: buttonDiv,
      id: "btn_recallSavedView",
      value: "Recall",
      handler: () => this.recallView(), // eslint-disable-line @typescript-eslint/promise-function-async
      tooltip: "Recall selected view",
      inline: true,
    }).button;

    const deleteButton = createButton({
      parent: buttonDiv,
      id: "btn_deleteSavedView",
      value: "Delete",
      handler: () => this.deleteView(), // eslint-disable-line @typescript-eslint/promise-function-async
      tooltip: "Delete selected view",
      inline: true,
    }).button;

    this._element.appendChild(buttonDiv);

    this._onSelectedViewChanged = () => {
      const disabled = undefined === this._selectedView;
      recallButton.disabled = deleteButton.disabled = disabled;
    };

    textBox.div.style.marginLeft = textBox.div.style.marginRight = "3px";
    textBox.textbox.size = 36;
    textBox.textbox.onkeyup = () => {
      this._newViewName = textBox.textbox.value;
      const viewExists = undefined !== this.findView(this._newViewName);
      newButton.disabled = viewExists || 0 === this._newViewName.length;
      textBox.textbox.style.color = viewExists ? "red" : "";
    };

    newButton.disabled = recallButton.disabled = deleteButton.disabled = true;
  }

  private async recallView(): Promise<void> {
    if (undefined === this._selectedView)
      return;

    const vsp = JSON.parse(this._selectedView.viewStatePropsString);
    const viewState = await deserializeViewState(vsp, this._vp.iModel);
    viewState.code.value = this._selectedView.name;
    await this._viewer.applySavedView(viewState);

    const overrideElementsString = this._selectedView.overrideElements;
    if (undefined !== overrideElementsString) {
      const overrideElements = JSON.parse(overrideElementsString) as any[];
      const provider = Provider.getOrCreate(this._vp);
      if (undefined !== provider && undefined !== overrideElements) {
        provider.overrideElementsByArray(overrideElements);
      }
    }

    const selectedElementsString = this._selectedView.selectedElements;
    if (undefined !== selectedElementsString) {
      const selectedElements = JSON.parse(selectedElementsString) as Id64Arg;
      this._imodel.selectionSet.emptyAll();
      this._imodel.selectionSet.add(selectedElements);
      this._vp.renderFrame();
    }
  }

  private async deleteView(): Promise<void> {
    // eslint-disable-next-line no-restricted-globals
    if (undefined === this._selectedView)
      return;

    this._views.removeName(this._selectedView.name);
    this.populateFromViewList();
    await this.saveNamedViews();
  }

  private async saveView(): Promise<void> {
    const newName = this._newViewName;
    if (0 === newName.length || undefined !== this.findView(newName))
      return;

    const props = serializeViewState(this._vp.view);
    const json = JSON.stringify(props);

    let selectedElementsString;
    if (this._imodel.selectionSet.size > 0) {
      const seList: string[] = [];
      this._imodel.selectionSet.elements.forEach((id) => { seList.push(id); });
      selectedElementsString = JSON.stringify(seList);
    }
    let overrideElementsString;
    const provider = Provider.getOrCreate(this._vp);
    if (undefined !== provider) {
      const overrideElements = provider.toJSON();
      overrideElementsString = JSON.stringify(overrideElements);
    }
    const nvsp = new NamedViewStatePropsString(newName, json, selectedElementsString, overrideElementsString);
    this._views.insert(nvsp);
    this.populateFromViewList();

    await this.saveNamedViews();
  }

  private async saveNamedViews(): Promise<void> {
    const filename = this._vp.view.iModel.key;
    if (undefined === filename)
      return;

    const namedViews = this._views.getPrintString();
    await DtaRpcInterface.getClient().writeExternalSavedViews(filename, namedViews);
  }

  private findView(name: string): NamedViewStatePropsString | undefined {
    const index = this._views.findName(name);
    return -1 !== index ? this._views.get(index)! : undefined;
  }
}
