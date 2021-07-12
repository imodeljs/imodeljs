/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, compareStringsOrUndefined } from "@bentley/bentleyjs-core";
import { ComboBox, ComboBoxEntry, createCheckBox, createComboBox, createNestedMenu, createNumericInput, NestedMenu } from "@bentley/frontend-devtools";
import {
  CartographicRange, ContextRealityModelProps, ModelProps, SpatialClassifier, SpatialClassifierFlagsProps, SpatialClassifierInsideDisplay,
  SpatialClassifierOutsideDisplay, SpatialClassifiers,
} from "@bentley/imodeljs-common";
import {
  ContextRealityModelState, DisplayStyle3dState, IModelApp, queryRealityData, SpatialModelState, SpatialViewState, Viewport,
} from "@bentley/imodeljs-frontend";
import { ToolBarDropDown } from "./ToolBar";

function clearElement(element: HTMLElement): void {
  while (element.hasChildNodes())
    element.removeChild(element.firstChild!);
}

const NO_MODEL_ID = "-1";

export class ClassificationsPanel extends ToolBarDropDown {
  private readonly _vp: Viewport;
  private readonly _element: HTMLElement;
  private readonly _realityModelListDiv: HTMLDivElement;
  private readonly _modelListDiv: HTMLDivElement;
  private readonly _propertiesDiv: HTMLDivElement;
  private readonly _realityModelPickerMenu: NestedMenu;
  private _selectedSpatialClassifiers: SpatialClassifiers | undefined;
  private _selectedSpatialClassifiersIndex: number = 0;
  private _modelComboBox?: ComboBox;
  private _models: { [modelId: string]: ModelProps } = {};

  private get _selectedClassifier(): SpatialClassifier | undefined {
    if (undefined === this._selectedSpatialClassifiers)
      return undefined;
    const classifiers = this._selectedSpatialClassifiers;
    if (undefined !== classifiers.active)
      return classifiers.active;
    return undefined;
  }

  private setAsActiveClassifier(modelProps: ModelProps | undefined): void {
    if (undefined === this._selectedSpatialClassifiers)
      return;

    let classifier: SpatialClassifier | undefined;
    if (undefined !== modelProps) {
      // Find existing classifier, or create if one doesn't exist for modelId.
      const modelId = modelProps.id!;
      classifier = this._selectedSpatialClassifiers.find((x) => x.modelId === modelId);
      if (!classifier)
        classifier = this._selectedSpatialClassifiers.add(new SpatialClassifier(modelId, modelProps.name!));
    }

    this._selectedSpatialClassifiers.setActive(classifier);
    this.populateClassifierProperties();
  }

  constructor(vp: Viewport, parent: HTMLElement) {
    super();
    this._vp = vp;

    this._element = IModelApp.makeHTMLElement("div", { parent, className: "toolMenu" });
    this._realityModelListDiv = IModelApp.makeHTMLElement("div", { parent: this._element });
    this._modelListDiv = IModelApp.makeHTMLElement("div", { parent: this._element });
    this._propertiesDiv = IModelApp.makeHTMLElement("div", { parent: this._element });
    this._realityModelPickerMenu = createNestedMenu({
      label: "Reality Model Picker",
    });

    this._element.style.display = "block";
    this._element.style.cssFloat = "left";
    this._element.style.width = "max-content";
    this._element.style.minWidth = "350px";

    this._element.appendChild(this._realityModelPickerMenu.div);
  }

  private async populateRealityModelsPicker(): Promise<void> {
    this._realityModelPickerMenu.div.style.display = "none";
    clearElement(this._realityModelPickerMenu.body);

    const view = this._vp.view;
    const ecef = this._vp.iModel.ecefLocation;
    if (!view.isSpatialView() || undefined === ecef) {
      return;
    }

    const range = new CartographicRange(this._vp.iModel.projectExtents, ecef.getTransform());
    let available;
    try {
      available = await queryRealityData({ contextId: "fb1696c8-c074-4c76-a539-a5546e048cc6", range });
    } catch (_error) {
      available = new Array<ContextRealityModelProps>();
    }
    for (const entry of available) {
      const name = undefined !== entry.name ? entry.name : entry.tilesetUrl;
      createCheckBox({
        name,
        id: entry.tilesetUrl,
        parent: this._realityModelPickerMenu.body,
        isChecked: view.displayStyle.hasAttachedRealityModel(name, entry.tilesetUrl),
        handler: (checkbox) => this.toggle(entry, checkbox.checked),
      });
    }
    IModelApp.makeHTMLElement("hr", { parent: this._realityModelPickerMenu.body });
    if (available.length > 0)
      this._realityModelPickerMenu.div.style.display = "block";
  }

  private populateRealityModelList(): void {
    // assemble list of Spatial Classifiers for context reality models (should usually be at most one)
    const realityModels: Array<{ spatialClassifiers: SpatialClassifiers, modelName: string }> = [];
    (this._vp.view.displayStyle as DisplayStyle3dState).forEachRealityModel((contextModel: ContextRealityModelState) => {
      const classifiers = contextModel.classifiers;
      if (undefined !== classifiers)
        realityModels.push({ spatialClassifiers: classifiers, modelName: contextModel.name });
    });

    // include any attached reality models (may be any number; must be loaded already)
    for (const loaded of this._vp.iModel.models)
      if (loaded instanceof SpatialModelState && undefined !== loaded.classifiers)
        realityModels.push({ spatialClassifiers: loaded.classifiers, modelName: `${loaded.name} (attached)` });

    // create list of entries for Classifier in the spatial Classifiers
    const entries = realityModels.map((spatialClassifier, i) => {
      return ({ name: spatialClassifier.modelName, value: i } as ComboBoxEntry);
    });

    clearElement(this._realityModelListDiv);
    const activeIndex = this._selectedSpatialClassifiersIndex;
    createComboBox({
      parent: this._realityModelListDiv,
      id: "ClassifierSelectionBox",
      name: "Reality Models: ",
      value: activeIndex,
      handler: (select) => {
        const valueIndex = Number.parseInt(select.value, 10);
        this._selectedSpatialClassifiersIndex = valueIndex;
        const spatialClassifier = valueIndex >= 0 ? realityModels[valueIndex].spatialClassifiers : undefined;
        this.setSelectedClassification(spatialClassifier);
      },
      entries,
    });

    if (undefined !== realityModels[activeIndex])
      this.setSelectedClassification(realityModels[activeIndex].spatialClassifiers);
    else
      this.setSelectedClassification(undefined);
  }

  private async populateModelList(): Promise<void> {
    const view = this._vp.view as SpatialViewState;
    assert(undefined !== view && view.isSpatialView());

    const query = { from: SpatialModelState.classFullName, wantPrivate: false };
    const props = await view.iModel.models.queryProps(query);
    props.sort((lhs, rhs) => compareStringsOrUndefined(lhs.name, rhs.name));

    const entries: ComboBoxEntry[] = [{ name: "None", value: NO_MODEL_ID }];
    this._models = {};
    props.forEach((prop) => {
      if (undefined !== prop.id && undefined !== prop.name) {
        entries.push({ name: prop.name, value: prop.id });
        this._models[prop.id] = prop;
      }
    });

    clearElement(this._modelListDiv);

    this._modelComboBox = createComboBox({
      entries,
      parent: this._modelListDiv,
      id: "classifiers_modelBox",
      name: "Active Classifier: ",
      value: undefined !== this._selectedClassifier ? this._selectedClassifier.modelId : undefined,
      handler: (select) => {
        this.setAsActiveClassifier(this._models[select.value]);
        this.populateRealityModelList();
        this._vp.invalidateScene();
      },
    });
  }

  public async populate(): Promise<void> {
    this._selectedSpatialClassifiers = undefined;
    if (this._vp.view.is2d()) return;

    this._realityModelPickerMenu.div.style.display = "none";
    this.populateRealityModelList();
    await this.populateRealityModelsPicker();
    await this.populateModelList();
  }

  public get isOpen(): boolean { return "none" !== this._element.style.display; }
  protected _open(): void {
    this.populateRealityModelList();
    this._element.style.display = "block";
  }
  protected _close(): void { this._element.style.display = "none"; }
  public override get onViewChanged(): Promise<void> { return this.populate(); }

  private updateModelComboBox(modelId: string): void {
    if (undefined !== this._modelComboBox)
      this._modelComboBox.select.value = modelId;
  }

  private toggle(entry: ContextRealityModelProps, enabled: boolean): void {
    const view = this._vp.view as SpatialViewState;
    const style = view.getDisplayStyle3d();
    if (enabled)
      style.attachRealityModel(entry);
    else
      style.detachRealityModelByNameAndUrl(entry.name!, entry.tilesetUrl);

    this.populateRealityModelList();
    this._vp.invalidateScene();
  }

  private setSelectedClassification(spatialClassifiers: SpatialClassifiers | undefined) {
    this._selectedSpatialClassifiers = spatialClassifiers;
    if (undefined === spatialClassifiers) {
      this.updateModelComboBox(NO_MODEL_ID);
      this.populateClassifierProperties();
      return;
    }

    const classifier = spatialClassifiers.active;

    if (undefined === classifier) {
      this.updateModelComboBox(NO_MODEL_ID);
      this.populateClassifierProperties();
      return;
    }

    this.updateModelComboBox(classifier.modelId);

    this.populateClassifierProperties();
  }

  private populateClassifierProperties(): void {
    const classifier = this._selectedClassifier;
    const parent = this._propertiesDiv;
    clearElement(parent);

    if (undefined === classifier)
      return;

    const outsideEntries: ComboBoxEntry[] = [
      { name: "Off", value: SpatialClassifierOutsideDisplay.Off },
      { name: "On", value: SpatialClassifierOutsideDisplay.On },
      { name: "Dimmed", value: SpatialClassifierOutsideDisplay.Dimmed },
    ];

    const insideEntries: ComboBoxEntry[] = [
      { name: "Off", value: SpatialClassifierInsideDisplay.Off },
      { name: "On", value: SpatialClassifierInsideDisplay.On },
      { name: "Dimmed", value: SpatialClassifierInsideDisplay.Dimmed },
      { name: "Hilite", value: SpatialClassifierInsideDisplay.Hilite },
      { name: "Element Color", value: SpatialClassifierInsideDisplay.ElementColor },
    ];

    const updateFlags = (newFlags: Partial<SpatialClassifierFlagsProps>) => {
      const c = this._selectedClassifier!;
      this._selectedSpatialClassifiers!.replace(c, c.clone({ flags: c.flags.clone(newFlags) }));
    };

    createComboBox({
      name: "Inside: ",
      id: "InsideComboBox",
      parent,
      entries: insideEntries,
      handler: (select) => {
        const newValue = Number.parseInt(select.value, 10) as SpatialClassifierInsideDisplay;
        updateFlags({ inside: newValue });
        this._vp.invalidateScene();
      },
      value: classifier.flags.inside,
    });

    createComboBox({
      name: "Outside: ",
      id: "OutsideComboBox",
      parent,
      entries: outsideEntries,
      handler: (select) => {
        const newValue = Number.parseInt(select.value, 10) as SpatialClassifierOutsideDisplay;
        updateFlags({ outside: newValue });
        this._vp.invalidateScene();
      },
      value: classifier.flags.outside,
    });

    const label = IModelApp.makeHTMLElement("label", { parent });
    label.textContent = "Expansion: ";

    createNumericInput({
      parent,
      display: "inline",
      value: classifier.expand,
      handler: (value) => {
        const c = this._selectedClassifier!;
        this._selectedSpatialClassifiers!.replace(c, c.clone({ expand: value }));
        this._vp.invalidateScene();
      },
    });

    createCheckBox({
      name: "Volume: ",
      id: "cbxVolumeClassifier",
      parent,
      isChecked: classifier.flags.isVolumeClassifier,
      handler: (cb) => {
        updateFlags({ isVolumeClassifier: cb.checked });
        this._vp.invalidateScene();
      },
    });
  }
}
