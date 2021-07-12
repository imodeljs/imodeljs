/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import { Id64, Id64String } from "@bentley/bentleyjs-core";
import { ColorDef } from "../ColorDef";
import { RgbColor } from "../RgbColor";
import { BatchType, Feature } from "../FeatureTable";
import { GeometryClass } from "../GeometryParams";
import { LinePixels } from "../LinePixels";
import { SubCategoryAppearance } from "../SubCategoryAppearance";
import { SubCategoryOverride } from "../SubCategoryOverride";
import {
  FeatureAppearance,
  FeatureAppearanceProps,
  FeatureAppearanceProvider,
  FeatureAppearanceSource,
  FeatureOverrides,
} from "../FeatureSymbology";

describe("FeatureAppearance", () => {
  it("default constructor works as expected", () => {
    const app = FeatureAppearance.fromJSON();
    assert.isUndefined(app.rgb);
    assert.isUndefined(app.weight);
    assert.isUndefined(app.transparency);
    assert.isUndefined(app.linePixels);
    assert.isUndefined(app.ignoresMaterial);
  });

  it("AppearanceProps passed in constructor works as expected", () => {
    const props1 = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 200 / 255, linePixels: LinePixels.Code2, ignoresMaterial: true } as FeatureAppearanceProps;
    const props2 = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 200 / 255, linePixels: LinePixels.Code2 } as FeatureAppearanceProps;
    let app = FeatureAppearance.fromJSON(props1);
    assert.isTrue(app.overridesRgb);
    assert.isTrue(app.overridesWeight);
    assert.isTrue(app.overridesTransparency);
    assert.isTrue(app.overridesLinePixels);
    assert.isTrue(app.ignoresMaterial);

    app = FeatureAppearance.fromJSON(props2);
    assert.isUndefined(app.ignoresMaterial);
  });

  it("extend works as expected", () => {
    const props1 = { rgb: new RgbColor(100, 100, 100), linePixels: LinePixels.Code2, ignoresMaterial: true } as FeatureAppearanceProps;
    const props2 = { rgb: new RgbColor(250, 180, 150), weight: 1, transparency: 200 / 255, linePixels: LinePixels.Code3 } as FeatureAppearanceProps;
    const expectedProps = { rgb: new RgbColor(100, 100, 100), linePixels: LinePixels.Code2, ignoresMaterial: true, weight: 1, transparency: 200 / 255 } as FeatureAppearanceProps;
    let app1 = FeatureAppearance.fromJSON(props1);
    const app2 = FeatureAppearance.fromJSON(props2);
    app1 = app2.extendAppearance(app1);
    const expected = FeatureAppearance.fromJSON(expectedProps);
    assert.isTrue(expected.equals(app1));
  });

  it("clones with overrides", () => {
    const base = FeatureAppearance.fromRgba(ColorDef.white);
    const clone = base.clone({ transparency: undefined, weight: 5 });
    expect(clone.transparency).to.be.undefined;
    expect(clone.weight).to.equal(5);
    expect(clone.rgb).not.to.be.undefined;
    expect(clone.rgb!.r).to.equal(0xff);
    expect(clone.rgb!.g).to.equal(0xff);
    expect(clone.rgb!.b).to.equal(0xff);
  });

  it("creates for subcategory overrides", () => {
    function test(ovrProps: SubCategoryAppearance.Props, appProps: FeatureAppearanceProps): void {
      const ovr = SubCategoryOverride.fromJSON(ovrProps);
      expect(ovr.toJSON()).to.deep.equal(ovrProps);
      const app = FeatureAppearance.fromJSON(appProps);
      expect(app.toJSON()).to.deep.equal(appProps);

      expect(app.rgb?.toColorDef().toJSON()).to.equal(ovrProps.color);
      expect(app.transparency).to.equal(ovrProps.transp);
      expect(app.weight).to.equal(ovrProps.weight);
      // NB: Not testing material because unclear that it's implemented properly...
    }

    test({}, {});
    test({ color: ColorDef.from(0, 127, 255).toJSON() }, { rgb: { r: 0, g: 127, b: 255 } });
    test({ invisible: true }, {});
    test({ invisible: false }, {});
    test({ weight: 12 }, { weight: 12 });
    test({ transp: 0 }, { transparency: 0 });
    test({ transp: 0.5 }, { transparency: 0.5 });
    test({ transp: 1.0 }, { transparency: 1.0 });
  });
});

describe("FeatureOverrides", () => {
  class Overrides extends FeatureOverrides {
    public constructor() { super(); }
    public override get neverDrawn() { return this._neverDrawn; }
    public override get alwaysDrawn() { return this._alwaysDrawn; }
    public get modelOverrides() { return this._modelOverrides; }
    public get elementOverrides() { return this._elementOverrides; }
    public get subCategoryOverrides() { return this._subCategoryOverrides; }
    public get visibleSubCategories() { return this._visibleSubCategories; }
    public get modelSubCategoryOverrides() { return this._modelSubCategoryOverrides; }
  }

  it("default constructor works as expected", () => {
    const overrides = new Overrides();
    assert.isFalse(overrides.isClassVisible(GeometryClass.Construction), "constructions");
    assert.isFalse(overrides.isClassVisible(GeometryClass.Dimension), "dimensions");
    assert.isFalse(overrides.isClassVisible(GeometryClass.Pattern), "patterns");
    assert.isTrue(overrides.lineWeights, "line weights");
    assert.isFalse(overrides.isAlwaysDrawnExclusive, "drawn exclusive");
    assert.exists(overrides.neverDrawn, "never");
    assert.exists(overrides.alwaysDrawn, "always");
    assert.exists(overrides.modelOverrides, "model overrides");
    assert.exists(overrides.elementOverrides, "element overrides");
    assert.exists(overrides.visibleSubCategories, "visible sub-categories");
    assert.exists(overrides.subCategoryOverrides, "sub-category overrides");
  });

  it("isSubCategoryVisible works as expected", () => {
    const overrides = new Overrides();
    const subCategoryId = Id64.fromString("0x124");
    assert.isFalse(overrides.isSubCategoryIdVisible(subCategoryId));

    overrides.setVisibleSubCategory(subCategoryId);
    assert.isTrue(overrides.isSubCategoryIdVisible(subCategoryId));
  });

  it("overrideModel works as expected", () => {
    const overrides = new Overrides();
    const id = Id64.fromString("0x111");
    const props1 = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 100 / 255, linePixels: LinePixels.Solid, ignoresMaterial: true } as FeatureAppearanceProps;
    const props2 = { ...props1, transparency: 200 / 255 } as FeatureAppearanceProps;
    const modelApp1 = FeatureAppearance.fromJSON(props1);
    const modelApp2 = FeatureAppearance.fromJSON(props2);
    overrides.overrideModel(id, modelApp1);
    assert.exists(overrides.getModelOverridesById(id));

    overrides.overrideModel(id, modelApp2);
    assert.isTrue(overrides.getModelOverridesById(id)!.equals(modelApp2), "overrideModel will override prexisting model associated with given id if replaceExisting is not set to false explicitly");

    overrides.overrideModel(id, modelApp1, false);
    assert.isTrue(overrides.getModelOverridesById(id)!.equals(modelApp2), "overrides will not replace model if replace existing is set to false");

    overrides.overrideModel(id, modelApp1);
    assert.isTrue(overrides.getModelOverridesById(id)!.equals(modelApp1), "overrides will replace model if replace existing isn't set to false (test 2)");
  });

  it("overrideSubCategory works as expected", () => {
    const overrides = new Overrides();
    const id = Id64.fromString("0x111");
    const props1 = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 100 / 255, linePixels: LinePixels.Solid, ignoresMaterial: true } as FeatureAppearanceProps;
    const props2 = { ...props1, transparency: 200 / 255 } as FeatureAppearanceProps;
    const subCatApp1 = FeatureAppearance.fromJSON(props1);
    const subCatApp2 = FeatureAppearance.fromJSON(props2);

    // Even though the subcategory is invisible, it's possible a model will override it to be visible.
    // So overrideSubCategory() will record the appearance override anyway.
    expect(overrides.getSubCategoryOverridesById(id)).to.be.undefined;
    overrides.overrideSubCategory(id, subCatApp1);
    expect(overrides.getSubCategoryOverridesById(id)).not.to.be.undefined;

    overrides.setVisibleSubCategory(id);
    overrides.overrideSubCategory(id, subCatApp2);
    assert.exists(overrides.getSubCategoryOverridesById(id), "if subCategoryId is in subCategoryVisible set, then subCategoryApp set");

    overrides.overrideSubCategory(id, subCatApp1, false);
    assert.isTrue(overrides.getSubCategoryOverridesById(id)!.equals(subCatApp2), "overrides will not replace subCatApp if replace existing is set to false");

    overrides.overrideSubCategory(id, subCatApp1);
    assert.isTrue(overrides.getSubCategoryOverridesById(id)!.equals(subCatApp1), "overrides will replace subCatApp if replace existing isn't set to false");
  });

  it("overrideElement works as expected", () => {
    let overrides = new Overrides();
    const id = Id64.fromString("0x111");
    const props1 = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 100 / 255, linePixels: LinePixels.Solid, ignoresMaterial: true } as FeatureAppearanceProps;
    const props2 = { ...props1, transparency: 200 / 255 } as FeatureAppearanceProps;
    const elemApp1 = FeatureAppearance.fromJSON(props1);
    const elemApp2 = FeatureAppearance.fromJSON(props2);

    overrides.setNeverDrawn(id);
    overrides.overrideElement(id, elemApp1);
    assert.isUndefined(overrides.getElementOverridesById(id), "if elementId is in never drawn set, then nothing is set");

    overrides = new Overrides();
    overrides.overrideElement(id, elemApp1);
    assert.exists(overrides.getElementOverridesById(id), "if elementId is not in never drawn set, then elemApp is set");

    overrides.overrideElement(id, elemApp2, false);
    assert.isTrue(overrides.getElementOverridesById(id)!.equals(elemApp1), "overrides will not replace elemApp if replace existing is set to false");

    overrides.overrideElement(id, elemApp2);
    assert.isTrue(overrides.getElementOverridesById(id)!.equals(elemApp2), "overrides will replace elemApp if replace existing isn't set to false");
  });

  it("setDefaultOverrides works as expected", () => {
    const overrides = new Overrides();
    assert.isTrue(overrides.defaultOverrides.equals(FeatureAppearance.fromJSON()), "initial default overrides are equivalent to default appearance instance");

    const props = { rgb: new RgbColor(100, 100, 100), weight: 1, transparency: 100 / 255, linePixels: LinePixels.Solid, ignoresMaterial: true } as FeatureAppearanceProps;
    const app = FeatureAppearance.fromJSON(props);
    overrides.setDefaultOverrides(app);
    assert.isTrue(overrides.defaultOverrides.equals(app), "default overrides can be overriden");
  });

  it("should not apply default overrides if appearance explicitly specified", () => {
    // 1: Register an Appearance which overrides color.
    // 2: Register an Appearance which overrides nothing.
    // 3: Do not register an Appearance.
    const cat1 = "0x1", cat2 = "0x2", cat3 = "0x3";
    const mod1 = "0x4", mod2 = "0x5", mod3 = "0x6";
    const el1 = "0x7", el2 = "0x8", el3 = "0x9";

    const ovrs = new Overrides();
    ovrs.setVisibleSubCategory(cat1);
    ovrs.setVisibleSubCategory(cat2);
    ovrs.setVisibleSubCategory(cat3);

    const app = FeatureAppearance.fromRgb(ColorDef.green);
    const noApp = FeatureAppearance.fromJSON();
    const defApp = FeatureAppearance.fromRgb(ColorDef.red);
    ovrs.setDefaultOverrides(defApp);

    ovrs.overrideElement(el1, app);
    ovrs.overrideModel(mod1, app);
    ovrs.overrideSubCategory(cat1, app);
    ovrs.overrideElement(el2, noApp);
    ovrs.overrideModel(mod2, noApp);
    ovrs.overrideSubCategory(cat2, noApp);

    const expectAppearance = (elem: Id64String, model: Id64String, subcat: Id64String, expectedAppearance: FeatureAppearance) => {
      const feature = new Feature(elem, subcat, GeometryClass.Primary);
      const appearance = ovrs.getFeatureAppearance(feature, model);
      expect(JSON.stringify(appearance)).to.equal(JSON.stringify(expectedAppearance));
    };

    expectAppearance(el1, mod3, cat3, app);
    expectAppearance(el2, mod3, cat3, noApp);
    expectAppearance(el3, mod3, cat3, defApp);

    expectAppearance(el3, mod1, cat3, app);
    expectAppearance(el3, mod2, cat3, noApp);

    expectAppearance(el3, mod3, cat1, app);
    expectAppearance(el3, mod3, cat2, noApp);
  });

  it("overrides subcategory visibility per model", () => {
    // Subcategories 1 and 2 are visible
    const ovrs = new Overrides();
    ovrs.setVisibleSubCategory("0x1");
    ovrs.setVisibleSubCategory("0x2");

    expect(ovrs.isSubCategoryVisible(1, 0)).to.be.true;
    expect(ovrs.isSubCategoryVisible(2, 0)).to.be.true;
    expect(ovrs.isSubCategoryVisible(3, 0)).to.be.false;
    expect(ovrs.isSubCategoryVisible(4, 0)).to.be.false;

    // In model a, subcat 3 is visible and subcat 1 is invisible
    ovrs.modelSubCategoryOverrides.set(0xa, 0, new Id64.Uint32Set(["0x3", "0x1"]));
    expect(ovrs.isSubCategoryVisibleInModel(1, 0, 0xa, 0)).to.be.false;
    expect(ovrs.isSubCategoryVisibleInModel(2, 0, 0xa, 0)).to.be.true;
    expect(ovrs.isSubCategoryVisibleInModel(3, 0, 0xa, 0)).to.be.true;
    expect(ovrs.isSubCategoryVisibleInModel(4, 0, 0xa, 0)).to.be.false;

    // In model b, subcats 1 and 2 are invisible
    ovrs.modelSubCategoryOverrides.set(0xb, 0, new Id64.Uint32Set(["0x1", "0x2"]));
    for (let i = 1; i < 5; i++)
      expect(ovrs.isSubCategoryVisibleInModel(i, 0, 0xb, 0)).to.be.false;

    // In model c, subcats 3 and 4 are visible
    ovrs.modelSubCategoryOverrides.set(0xc, 0, new Id64.Uint32Set(["0x3", "0x4"]));
    for (let i = 1; i < 5; i++)
      expect(ovrs.isSubCategoryVisibleInModel(i, 0, 0xc, 0)).to.be.true;

    expect(ovrs.isSubCategoryVisible(1, 0)).to.be.true;
    expect(ovrs.isSubCategoryVisible(2, 0)).to.be.true;
    expect(ovrs.isSubCategoryVisible(3, 0)).to.be.false;
    expect(ovrs.isSubCategoryVisible(4, 0)).to.be.false;
  });

  it("hides animation nodes", () => {
    const feature = new Feature("0x123");
    const modelId = "0x456";
    const ovrs = new Overrides();

    ovrs.neverDrawnAnimationNodes.add(1);
    ovrs.neverDrawnAnimationNodes.add(0);
    expect(ovrs.getFeatureAppearance(feature, modelId, undefined, 1)).to.be.undefined;
    expect(ovrs.getFeatureAppearance(feature, modelId, undefined, 2)).not.to.be.undefined;
    expect(ovrs.getFeatureAppearance(feature, modelId, undefined, 0)).to.be.undefined;
  });

  it("overrides animation nodes", () => {
    const ovrs = new Overrides();

    const expectAppearance = (nodeId: number, expected: FeatureAppearance) => {
      const actual = ovrs.getFeatureAppearance(new Feature("0x123"), "0x456", undefined, nodeId)!;
      expect(actual).not.to.be.undefined;
      expect(JSON.stringify(actual)).to.equal(JSON.stringify(expected));
    };

    const green = FeatureAppearance.fromRgb(ColorDef.green);
    const blue = FeatureAppearance.fromRgb(ColorDef.blue);
    ovrs.animationNodeOverrides.set(0, green);
    ovrs.animationNodeOverrides.set(1, blue);
    expectAppearance(1, blue);
    expectAppearance(2, FeatureAppearance.defaults);
    expectAppearance(0, green);
  });
});

describe("FeatureAppearanceProvider", () => {
  class Source implements FeatureAppearanceSource {
    public constructor(public readonly appearance: FeatureAppearance | undefined) { }

    public getAppearance(_elemLo: number, _elemHi: number, _subcatLo: number, _subcatHi: number, _geomClass: GeometryClass, _modelLo: number, _modelHi: number, _type: BatchType, _animationNodeId: number) {
      return this.appearance;
    }
  }

  class Provider implements FeatureAppearanceProvider {
    public constructor(public readonly modifyAppearance: (app: FeatureAppearance) => FeatureAppearance) { }

    public getFeatureAppearance(source: FeatureAppearanceSource, elemLo: number, elemHi: number, subcatLo: number, subcatHi: number, geomClass: GeometryClass, modelLo: number, modelHi: number, type: BatchType, animationNodeId: number) {
      const app = source.getAppearance(elemLo, elemHi, subcatLo, subcatHi, geomClass, modelLo, modelHi, type, animationNodeId);
      return app ? this.modifyAppearance(app) : undefined;
    }
  }

  function getAppearance(source: FeatureAppearanceSource, provider: FeatureAppearanceProvider): FeatureAppearance | undefined {
    return provider.getFeatureAppearance(source, 0, 0, 0, 0, GeometryClass.Primary, 0, 0, BatchType.Primary, 0);
  }

  it("Chains providers in expected order", () => {
    const materialProvider = new Provider((appearance) => {
      return FeatureAppearance.fromJSON({
        ...appearance.toJSON(),
        ignoresMaterial: true,
        transparency: 0.25,
      });
    });

    const emphasisProvider = new Provider((appearance) => {
      return FeatureAppearance.fromJSON({
        ...appearance.toJSON(),
        emphasized: true,
        transparency: 0.75,
      });
    });

    const source = new Source(FeatureAppearance.fromJSON({ weight: 5 }));

    let chained = FeatureAppearanceProvider.chain(materialProvider, emphasisProvider);
    let app = getAppearance(source, chained)!;
    expect(app.weight).to.equal(5);
    expect(app.transparency).to.equal(0.75);
    expect(app.emphasized).to.be.true;
    expect(app.ignoresMaterial).to.be.true;

    chained = FeatureAppearanceProvider.chain(emphasisProvider, materialProvider);
    app = getAppearance(source, chained)!;
    expect(app.weight).to.equal(5);
    expect(app.transparency).to.equal(0.25);
    expect(app.emphasized).to.be.true;
    expect(app.ignoresMaterial).to.be.true;
  });

  it("creates supplemental provider", () => {
    const provider = FeatureAppearanceProvider.supplement((app: FeatureAppearance) => {
      return FeatureAppearance.fromJSON({
        ...app.toJSON(),
        transparency: 0.5,
      });
    });

    let appearance = getAppearance(new Source(FeatureAppearance.fromJSON({ weight: 5 })), provider);
    expect(appearance!.weight).to.equal(5);
    expect(appearance!.transparency).to.equal(0.5);

    appearance = getAppearance(new Source(undefined), provider);
    expect(appearance).to.be.undefined;
  });

  it("does not introduce infinite recursion", () => {
    const provider = new Provider((app) => app);
    const chained = FeatureAppearanceProvider.chain(provider, provider);
    expect(chained).to.equal(provider);
  });
});
