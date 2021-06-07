/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Id64 } from "@bentley/bentleyjs-core";
import {
  ColorDef, Feature, FeatureAppearance, FeatureAppearanceProps, GeometryClass, LinePixels, RgbColor, SubCategoryOverride, ViewDefinitionProps, ViewFlags,
} from "@bentley/imodeljs-common";
import { FeatureSymbology, IModelApp, IModelConnection, SnapshotConnection, SpatialViewState, ViewState } from "@bentley/imodeljs-frontend";
import { assert, expect } from "chai";

class Overrides extends FeatureSymbology.Overrides {
  public constructor(view?: ViewState) { super(view); }

  public get neverDrawn() { return this._neverDrawn; }
  public get alwaysDrawn() { return this._alwaysDrawn; }
  public get modelOverrides() { return this._modelOverrides; }
  public get elementOverrides() { return this._elementOverrides; }
  public get subCategoryOverrides() { return this._subCategoryOverrides; }
  public get visibleSubCategories() { return this._visibleSubCategories; }

  public expectSubCategory(id: string, expectVisible: boolean): void {
    expect(this.visibleSubCategories.hasId(id)).to.equal(expectVisible);
    const feature = new Feature("0xabc", id);
    expect(this.isFeatureVisible(feature)).to.equal(expectVisible);
  }
}

describe("FeatureSymbology.Overrides", () => {
  let imodel: IModelConnection;
  let viewId: string;
  let viewState: SpatialViewState;

  before(async () => {
    await IModelApp.startup();
    imodel = await SnapshotConnection.openFile("test.bim"); // relative path resolved by BackendTestAssetResolver
    const viewRows: ViewDefinitionProps[] = await imodel.views.queryProps({ from: SpatialViewState.classFullName });
    assert.exists(viewRows, "Should find some views");
    viewId = viewRows[0].id!;
  });

  beforeEach(async () => {
    viewState = await imodel.views.load(viewId) as SpatialViewState;
    expect(viewState).instanceof(SpatialViewState);
  });

  after(async () => {
    if (imodel)
      await imodel.close();
    await IModelApp.shutdown();
  });

  it("constructor with ViewState parameter works as expected", () => {
    // init overrides from ViewState
    const overrides = new Overrides(viewState);

    expect(overrides.isClassVisible(GeometryClass.Construction)).to.equal(viewState.viewFlags.constructions);
    expect(overrides.isClassVisible(GeometryClass.Dimension)).to.equal(viewState.viewFlags.dimensions);
    expect(overrides.isClassVisible(GeometryClass.Pattern)).to.equal(viewState.viewFlags.patterns);
    expect(overrides.lineWeights).to.equal(viewState.viewFlags.weights);
  });

  it("isClassVisible works as expected", () => {
    let overrides = new Overrides();
    const vf = new ViewFlags();
    vf.constructions = false;
    vf.dimensions = false;
    vf.patterns = false;
    viewState.displayStyle.viewFlags = vf;

    assert.isFalse(overrides.isClassVisible(GeometryClass.Construction), "constructions 1");
    assert.isFalse(overrides.isClassVisible(GeometryClass.Dimension), "dimensions 1");
    assert.isFalse(overrides.isClassVisible(GeometryClass.Pattern), "patterns 1");

    vf.constructions = true;
    viewState.displayStyle.viewFlags = vf;
    overrides = new Overrides(viewState);

    assert.isTrue(overrides.isClassVisible(GeometryClass.Construction), "constructions 2");

    vf.dimensions = true;
    viewState.displayStyle.viewFlags = vf;
    overrides = new Overrides(viewState);

    assert.isTrue(overrides.isClassVisible(GeometryClass.Dimension), "dimensions 2");

    vf.patterns = true;
    viewState.displayStyle.viewFlags = vf;
    overrides = new Overrides(viewState);

    assert.isTrue(overrides.isClassVisible(GeometryClass.Pattern), "patterns 2");

    assert.isTrue(overrides.isClassVisible(GeometryClass.Primary), "default");
  });

  it("isFeatureVisible works as expected", () => {
    let overrides = new Overrides();
    const elementId = Id64.fromString("0x123");
    const subCategoryId = Id64.fromString("0x124");
    const geometryClass = GeometryClass.Construction;
    const feature = new Feature(elementId, subCategoryId, geometryClass);

    overrides = new Overrides();
    assert.isFalse(overrides.isFeatureVisible(feature), "if subCategoryId isn't included in visibleSubCategories set, feature isn't visible");

    overrides.setNeverDrawn(elementId);
    assert.isFalse(overrides.isFeatureVisible(feature), "if elementId is in never drawn set, feature isn't visible");

    overrides = new Overrides();
    overrides.setAlwaysDrawn(elementId);

    assert.isTrue(overrides.isFeatureVisible(feature), "if elementId is in always drawn set, feature is visible");

    overrides = new Overrides();
    overrides.isAlwaysDrawnExclusive = true;

    // doesn't sound right... but this is how it works in the native code
    assert.isFalse(overrides.isFeatureVisible(feature), "if alwaysDrawnExclusive flag is set, but element not in always drawn set, feature isn't visible");

    overrides = new Overrides();
    overrides.setVisibleSubCategory(subCategoryId);
    assert.isFalse(overrides.isFeatureVisible(feature), "if geometryClass isn't visible, feature isn't visible");

    const vf = new ViewFlags();
    vf.constructions = true;
    viewState.displayStyle.viewFlags = vf;
    overrides = new Overrides(viewState);
    overrides.setVisibleSubCategory(subCategoryId);
    assert.isTrue(overrides.isFeatureVisible(feature), "if geometryClass and subCategory are visible, feature is visible");
  });

  it("getFeatureAppearance works as expected", () => {
    let overrides = new Overrides();
    const id = Id64.fromString("0x111");
    const elementId = Id64.fromString("0x128");
    const subCategoryId = Id64.fromString("0x129");
    const geometryClass = GeometryClass.Construction;
    const feature = new Feature(elementId, subCategoryId, geometryClass);
    const props = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 100 / 255, linePixels: LinePixels.Solid, ignoresMaterial: true } as FeatureAppearanceProps;
    const modelProps = { ...props, transparency: 200 / 255 } as FeatureAppearanceProps;
    const badModelProps = { ...props, transparency: 356 / 255 } as FeatureAppearanceProps;
    const elemProps = { transparency: 200 / 255, linePixels: LinePixels.HiddenLine } as FeatureAppearanceProps;
    const subCatProps = { linePixels: LinePixels.Code3, transparency: 90 / 255 } as FeatureAppearanceProps;
    let modelApp = FeatureAppearance.fromJSON(modelProps);
    const elemApp = FeatureAppearance.fromJSON(elemProps);
    const subCatApp = FeatureAppearance.fromJSON(subCatProps);
    let appearance: FeatureAppearance | undefined;

    overrides.setNeverDrawn(elementId);

    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isUndefined(appearance, "returns undefined if feature id is in the never drawn set");

    overrides = new Overrides();
    overrides.isAlwaysDrawnExclusive = true;

    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isUndefined(appearance, "returns false if feature isn't in always drawn set, but alwaysDrawnExclusive flag is set");

    overrides = new Overrides();
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isUndefined(appearance, "returns false if feature isn't in always drawn set nor subCategoryId in visibleSubCategories set");

    overrides = new Overrides();
    overrides.setAlwaysDrawn(elementId);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isDefined(appearance, "return true if elementId is in always drawn set");

    const vf = new ViewFlags();
    vf.constructions = true;
    viewState.displayStyle.viewFlags = vf;
    overrides = new Overrides(viewState);
    overrides.setVisibleSubCategory(subCategoryId);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isDefined(appearance, "return true if either elementId is in always drawn set or subCategoryId is visible as well as geometryClass is visible");

    overrides = new Overrides();
    appearance = FeatureAppearance.fromJSON(props);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isUndefined(appearance, "if neither elementId is in alwaysDrawn set nor subCategoryId in visibleSubCategory set nor id in modelOverrides map, then app is reset");

    overrides = new Overrides();
    appearance = FeatureAppearance.fromJSON(props);
    overrides.setAlwaysDrawn(elementId);
    appearance = overrides.getFeatureAppearance(feature, id);
    const msg = "if elementId in alwaysDrawn set, but id not in ModelOverrides map, nor elementId in elementOverrides map, nor subCategoryId in subCategoryOverrides, then app will be set to default overrides";
    assert.isTrue(appearance!.equals(overrides.defaultOverrides), msg);

    overrides = new Overrides();
    appearance = FeatureAppearance.fromJSON(props);
    overrides.setAlwaysDrawn(elementId);
    overrides.overrideModel(id, modelApp);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isTrue(appearance!.equals(modelApp), "if elementId in alwaysDrawn set and overrides has Model corresponding to id, then appearance will be set to the ModelApp");

    overrides = new Overrides();
    appearance = FeatureAppearance.fromJSON(props);
    modelApp = FeatureAppearance.fromJSON(badModelProps);
    overrides.setAlwaysDrawn(elementId);
    overrides.overrideModel(id, modelApp);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isUndefined(appearance, "if appearance is set from model app and that app has an invalid transparency value, then getFeatureAppearance returns false");
    // NOTE: The above assertion appears to have assumed that getFeatureAppearance() returns undefined because it rejects the "invalid" transparency value.
    // In reality it detects that transparency is above the threshold considered "fully transparent" and therefore not visible.

    overrides = new Overrides();
    appearance = FeatureAppearance.fromJSON(props);
    overrides.overrideElement(elementId, elemApp);
    overrides.setAlwaysDrawn(elementId);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isTrue(appearance!.equals(elemApp), "if elementId in alwaysDrawn set and overrides has Element corresponding to id but not Model nor SubCategory, then the app is set to the elemApp");

    overrides = new Overrides(viewState);
    appearance = FeatureAppearance.fromJSON(props);
    overrides.setVisibleSubCategory(subCategoryId);
    overrides.overrideSubCategory(subCategoryId, subCatApp);
    appearance = overrides.getFeatureAppearance(feature, id);
    assert.isTrue(appearance!.equals(subCatApp), "if subCategoryId is in visible set and SubCategoryApp is found, absent element or model apps, the result app is equal to the app extended by the subCategoryApp");

    overrides = new Overrides(viewState);
    appearance = FeatureAppearance.fromJSON(props);
    modelApp = FeatureAppearance.fromJSON(modelProps);
    overrides.overrideModel(id, modelApp);
    overrides.setVisibleSubCategory(subCategoryId);
    overrides.overrideSubCategory(subCategoryId, subCatApp);
    appearance = overrides.getFeatureAppearance(feature, id);
    let expected = subCatApp.extendAppearance(modelApp);
    assert.isTrue(appearance!.equals(expected), "if subCat and modelApp are found then the appearance is the extension of the subCatApp with the ModelApp");
    overrides = new Overrides(viewState);
    appearance = FeatureAppearance.fromJSON(props);
    modelApp = FeatureAppearance.fromJSON(modelProps);
    overrides.overrideModel(id, modelApp);
    overrides.overrideElement(elementId, elemApp);
    overrides.setVisibleSubCategory(subCategoryId);
    overrides.overrideSubCategory(subCategoryId, subCatApp);
    appearance = overrides.getFeatureAppearance(feature, id);
    expected = elemApp.extendAppearance(modelApp);
    expected = subCatApp.extendAppearance(expected);
    assert.isTrue(appearance!.equals(expected), "if subCat, elemApp, and modelApp are found then the appearance is the extension of all three");
  });

  it("excludedElements works as expected", () => {
    viewState.displayStyle.settings.addExcludedElements(Id64.fromString("0x123"));

    const elementId = Id64.fromString("0x123");
    const elementId2 = Id64.fromString("0x128");
    const subCategoryId = Id64.fromString("0x124");
    const geometryClass = GeometryClass.Construction;
    const feature = new Feature(elementId, subCategoryId, geometryClass);
    const feature2 = new Feature(elementId2, subCategoryId, geometryClass);

    let overrides = new Overrides(viewState);
    assert.isFalse(overrides.isFeatureVisible(feature), "if subCategoryId isn't included in visibleSubCategories set, feature isn't visible");
    assert.isFalse(overrides.isFeatureVisible(feature2), "if subCategoryId isn't included in visibleSubCategories set, feature isn't visible");
    overrides = new Overrides(viewState);
    overrides.setAlwaysDrawn(elementId);
    overrides.setAlwaysDrawn(elementId2);

    assert.isFalse(overrides.isFeatureVisible(feature), "if elementId is in display style's excludedElements, feature isn't visible");
    assert.isTrue(overrides.isFeatureVisible(feature2), "if elementId is in always drawn set and not in the neverDrawn set and not in display style's excludedElements, feature is visible");

    const vf = new ViewFlags();
    vf.constructions = true;
    viewState.displayStyle.viewFlags = vf;
    overrides = new Overrides(viewState);
    overrides.setVisibleSubCategory(subCategoryId);
    assert.isFalse(overrides.isFeatureVisible(feature), "if elementId is in excludedElements and if geometryClass and subCategory are visible, feature isn't visible");
    assert.isTrue(overrides.isFeatureVisible(feature2), "if elementId is not in excludedElements and if geometryClass and subCategory are visible, feature is visible");
  });

  it("model appearance overrides work as expected", () => {
    const modelId1 = Id64.fromString("0x111");
    const modelId2 = Id64.fromString("0x112");
    const modelId3 = Id64.fromString("0x0113");
    const elementId = Id64.fromString("0x128");
    const subCategoryId = Id64.fromString("0x129");
    const geometryClass = GeometryClass.Construction;
    const feature = new Feature(elementId, subCategoryId, geometryClass);
    const modelOverride1 = FeatureAppearance.fromJSON({ rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 100 / 255, linePixels: LinePixels.Solid, ignoresMaterial: true });
    const modelOverride2 = FeatureAppearance.fromJSON({ ...modelOverride1, transparency: 200 / 255 });

    const displayStyle = viewState.displayStyle;
    displayStyle.settings.overrideModelAppearance(modelId1, modelOverride1);
    assert(displayStyle.settings.hasModelAppearanceOverride);
    assert(displayStyle.settings.getModelAppearanceOverride(modelId1)!.equals(modelOverride1));

    displayStyle.settings.dropModelAppearanceOverride(modelId1);
    assert(!displayStyle.settings.hasModelAppearanceOverride);

    displayStyle.settings.overrideModelAppearance(modelId1, modelOverride1);
    displayStyle.settings.overrideModelAppearance(modelId2, modelOverride2);
    assert(displayStyle.settings.getModelAppearanceOverride(modelId1)!.equals(modelOverride1));
    assert(displayStyle.settings.getModelAppearanceOverride(modelId2)!.equals(modelOverride2));
    expect(displayStyle.settings.getModelAppearanceOverride(modelId3)).to.be.undefined;

    const overrides = new Overrides(viewState);
    overrides.setAlwaysDrawn(elementId);
    const appearance1 = overrides.getFeatureAppearance(feature, modelId1);
    const appearance2 = overrides.getFeatureAppearance(feature, modelId2);
    const appearance3 = overrides.getFeatureAppearance(feature, modelId3);

    assert(appearance1!.equals(modelOverride1));
    assert(appearance2!.equals(modelOverride2));
    assert(!appearance3?.overridesRgb);
  });

  it("overrides subcategory visibility", () => {
    // Initial view has categories 17, 2d, 2f, 31 enabled.
    // Each has one subcategory, except 31 which has 2 (32 and 33).
    // Subcategory 33 is overridden to be invisible.
    let ovrs = new Overrides(viewState);
    for (const id of ["0x18", "0x2e", "0x30", "0x32"])
      ovrs.expectSubCategory(id, true);

    ovrs.expectSubCategory("0x33", false);

    viewState.categorySelector.categories.delete("0x17");
    ovrs = new Overrides(viewState);
    for (const id of ["0x18", "0x33"])
      ovrs.expectSubCategory(id, false);

    for (const id of ["0x2e", "0x30", "0x32"])
      ovrs.expectSubCategory(id, true);

    viewState.displayStyle.dropSubCategoryOverride("0x33");
    viewState.displayStyle.overrideSubCategory("0x2e", SubCategoryOverride.fromJSON({ invisible: true }));
    viewState.displayStyle.overrideSubCategory("ox32", SubCategoryOverride.fromJSON({ invisible: false }));
    ovrs = new Overrides(viewState);
    for (const id of ["0x18", "0x2e"])
      ovrs.expectSubCategory(id, false);

    for (const id of ["0x30", "0x32", "0x33"])
      ovrs.expectSubCategory(id, true);

    viewState.displayStyle.overrideSubCategory("0x30", SubCategoryOverride.fromJSON({ color: ColorDef.green.tbgr }));
    ovrs = new Overrides(viewState);
    ovrs.expectSubCategory("0x30", true);

    viewState.displayStyle.overrideSubCategory("0x30", SubCategoryOverride.fromJSON({ color: ColorDef.green.tbgr, invisible: true }));
    ovrs = new Overrides(viewState);
    ovrs.expectSubCategory("0x30", false);
  });
});
