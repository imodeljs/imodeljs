/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import { ColorDef, Feature, FeatureAppearance, FeatureAppearanceProps, FeatureOverrideType, LinePixels, RgbColor } from "@bentley/imodeljs-common";
import {
  EmphasizeElements, FeatureSymbology, IModelConnection, MockRender, ScreenViewport, SnapshotConnection, SpatialViewState,
  StandardViewId,
} from "@bentley/imodeljs-frontend";

describe("EmphasizeElements tests", () => {
  let imodel: IModelConnection;
  let spatialView: SpatialViewState;

  const viewDiv = document.createElement("div");
  assert(null !== viewDiv);
  viewDiv.style.width = viewDiv.style.height = "1000px";
  document.body.appendChild(viewDiv);

  before(async () => {
    await MockRender.App.startup();
    imodel = await SnapshotConnection.openFile("test.bim");
    spatialView = await imodel.views.load("0x34") as SpatialViewState;
    spatialView.setStandardRotation(StandardViewId.RightIso);
  });

  after(async () => {
    if (imodel) await imodel.close();
    await MockRender.App.shutdown();
  });

  it("Emphasize add/replace/clear", async () => {
    const vp = ScreenViewport.create(viewDiv, spatialView.clone());
    EmphasizeElements.clear(vp);
    const emph = EmphasizeElements.getOrCreate(vp);
    const ids = new Set<string>();

    ids.add("0x1"); ids.add("0x2"); ids.add("0x3");
    let status = emph.emphasizeElements(ids, vp, undefined, true);
    assert.isTrue(status);
    let currIds = emph.getEmphasizedElements(vp);
    assert.isTrue(undefined !== currIds && ids.size === currIds.size);

    ids.add("0x4");
    status = emph.emphasizeElements(ids, vp, undefined, false);
    assert.isTrue(status);
    currIds = emph.getEmphasizedElements(vp);
    assert.isTrue(undefined !== currIds && ids.size === currIds.size);

    ids.clear(); ids.add("0x5");
    status = emph.emphasizeElements(ids, vp, undefined, true);
    assert.isTrue(status);
    currIds = emph.getEmphasizedElements(vp);
    assert.isTrue(undefined !== currIds && ids.size === currIds.size);

    status = emph.clearEmphasizedElements(vp);
    assert.isTrue(status);
    currIds = emph.getEmphasizedElements(vp);
    assert.isTrue(undefined === currIds);

    EmphasizeElements.clear(vp);
  });

  it("Isolate add/replace/clear", async () => {
    const vp = ScreenViewport.create(viewDiv, spatialView.clone());
    EmphasizeElements.clear(vp);
    const emph = EmphasizeElements.getOrCreate(vp);
    const ids = new Set<string>();

    ids.add("0x1"); ids.add("0x2"); ids.add("0x3");
    let status = emph.isolateElements(ids, vp, true);
    assert.isTrue(status);
    let currIds = emph.getIsolatedElements(vp);
    assert.isTrue(undefined !== currIds && ids.size === currIds.size);

    ids.add("0x4");
    status = emph.isolateElements(ids, vp, false);
    assert.isTrue(status);
    currIds = emph.getIsolatedElements(vp);
    assert.isTrue(undefined !== currIds && ids.size === currIds.size);

    ids.clear(); ids.add("0x5");
    status = emph.isolateElements(ids, vp, true);
    assert.isTrue(status);
    currIds = emph.getIsolatedElements(vp);
    assert.isTrue(undefined !== currIds && ids.size === currIds.size);

    status = emph.clearIsolatedElements(vp);
    assert.isTrue(status);
    currIds = emph.getIsolatedElements(vp);
    assert.isTrue(undefined === currIds);

    EmphasizeElements.clear(vp);
  });

  it("Hide add/replace/clear", async () => {
    const vp = ScreenViewport.create(viewDiv, spatialView.clone());
    EmphasizeElements.clear(vp);
    const emph = EmphasizeElements.getOrCreate(vp);
    const ids = new Set<string>();

    ids.add("0x1"); ids.add("0x2"); ids.add("0x3");
    let status = emph.hideElements(ids, vp, true);
    assert.isTrue(status);
    let currIds = emph.getHiddenElements(vp);
    assert.isTrue(undefined !== currIds && ids.size === currIds.size);

    ids.add("0x4");
    status = emph.hideElements(ids, vp, false);
    assert.isTrue(status);
    currIds = emph.getHiddenElements(vp);
    assert.isTrue(undefined !== currIds && ids.size === currIds.size);

    ids.clear(); ids.add("0x5");
    status = emph.hideElements(ids, vp, true);
    assert.isTrue(status);
    currIds = emph.getHiddenElements(vp);
    assert.isTrue(undefined !== currIds && ids.size === currIds.size);

    status = emph.clearHiddenElements(vp);
    assert.isTrue(status);
    currIds = emph.getHiddenElements(vp);
    assert.isTrue(undefined === currIds);

    EmphasizeElements.clear(vp);
  });

  it("Override add/replace/clear", async () => {
    const vp = ScreenViewport.create(viewDiv, spatialView.clone());
    EmphasizeElements.clear(vp);
    const emph = EmphasizeElements.getOrCreate(vp);
    const redIds = new Set<string>();
    const blueIds = new Set<string>();
    const redKey = emph.createOverrideKey(ColorDef.red, FeatureOverrideType.ColorOnly);
    const blueKey = emph.createOverrideKey(ColorDef.blue, FeatureOverrideType.ColorOnly);
    assert.isFalse(undefined === redKey);
    assert.isFalse(undefined === blueKey);

    redIds.add("0x1"); redIds.add("0x2"); redIds.add("0x3");
    let status = emph.overrideElements(redIds, vp, ColorDef.red, FeatureOverrideType.ColorOnly, true);
    assert.isTrue(status);
    let currRedIds = emph.getOverriddenElementsByKey(redKey!);
    assert.isTrue(undefined !== currRedIds && redIds.size === currRedIds.size);

    blueIds.add("0x11"); blueIds.add("0x21");
    status = emph.overrideElements(blueIds, vp, ColorDef.blue, FeatureOverrideType.ColorOnly, true);
    assert.isTrue(status);
    let currBlueIds = emph.getOverriddenElementsByKey(blueKey!);
    assert.isTrue(undefined !== currBlueIds && blueIds.size === currBlueIds.size);

    let currMap = emph.getOverriddenElements();
    assert.isTrue(undefined !== currMap && 2 === currMap.size);

    redIds.add("0x4");
    status = emph.overrideElements(redIds, vp, ColorDef.red, FeatureOverrideType.ColorOnly, false);
    assert.isTrue(status);
    currRedIds = emph.getOverriddenElementsByKey(redKey!);
    assert.isTrue(undefined !== currRedIds && redIds.size === currRedIds.size);

    blueIds.add("0x31");
    status = emph.overrideElements(blueIds, vp, ColorDef.blue, FeatureOverrideType.ColorOnly, false);
    assert.isTrue(status);
    currBlueIds = emph.getOverriddenElementsByKey(blueKey!);
    assert.isTrue(undefined !== currBlueIds && blueIds.size === currBlueIds.size);

    currMap = emph.getOverriddenElements();
    assert.isTrue(undefined !== currMap && 2 === currMap.size);

    redIds.clear(); redIds.add("0x5");
    status = emph.overrideElements(redIds, vp, ColorDef.red, FeatureOverrideType.ColorOnly, true);
    assert.isTrue(status);
    currRedIds = emph.getOverriddenElementsByKey(redKey!);
    assert.isTrue(undefined !== currRedIds && redIds.size === currRedIds.size);

    blueIds.clear(); blueIds.add("0x41");
    status = emph.overrideElements(blueIds, vp, ColorDef.blue, FeatureOverrideType.ColorOnly, true);
    assert.isTrue(status);
    currBlueIds = emph.getOverriddenElementsByKey(blueKey!);
    assert.isTrue(undefined !== currBlueIds && blueIds.size === currBlueIds.size);

    currMap = emph.getOverriddenElements();
    assert.isTrue(undefined !== currMap && 2 === currMap.size);

    status = emph.clearOverriddenElements(vp);
    assert.isTrue(status);

    currRedIds = emph.getOverriddenElementsByKey(redKey!);
    assert.isTrue(undefined === currRedIds);

    currBlueIds = emph.getOverriddenElementsByKey(blueKey!);
    assert.isTrue(undefined === currBlueIds);

    currMap = emph.getOverriddenElements();
    assert.isTrue(undefined === currMap);

    EmphasizeElements.clear(vp);
  });

  it("Clear color overrides test", async () => {
    const vp = ScreenViewport.create(viewDiv, spatialView.clone());
    EmphasizeElements.clear(vp);
    const emph = EmphasizeElements.getOrCreate(vp);
    const redIds = new Set<string>();
    const blueIds = new Set<string>();
    const redKey = emph.createOverrideKey(ColorDef.red, FeatureOverrideType.ColorOnly);
    const blueKey = emph.createOverrideKey(ColorDef.blue, FeatureOverrideType.ColorOnly);
    assert.isFalse(undefined === redKey);
    assert.isFalse(undefined === blueKey);

    redIds.add("0x1"); redIds.add("0x2"); redIds.add("0x3");
    let status = emph.overrideElements(redIds, vp, ColorDef.red, FeatureOverrideType.ColorOnly, true);
    assert.isTrue(status);
    let currRedIds = emph.getOverriddenElementsByKey(redKey!);
    assert.isTrue(undefined !== currRedIds && redIds.size === currRedIds.size);

    blueIds.add("0x11"); blueIds.add("0x21");
    status = emph.overrideElements(blueIds, vp, ColorDef.blue, FeatureOverrideType.ColorOnly, true);
    assert.isTrue(status);
    let currBlueIds = emph.getOverriddenElementsByKey(blueKey!);
    assert.isTrue(undefined !== currBlueIds && blueIds.size === currBlueIds.size);

    let currMap = emph.getOverriddenElements();
    assert.isTrue(undefined !== currMap && 2 === currMap.size);

    status = emph.clearOverriddenElements(vp, ["0x21", "0x2"]); // Clear some elements with red and blue overrides...
    assert.isTrue(status);

    currRedIds = emph.getOverriddenElementsByKey(redKey!);
    assert.isTrue(undefined !== currRedIds && 2 === currRedIds.size);

    currBlueIds = emph.getOverriddenElementsByKey(blueKey!);
    assert.isTrue(undefined !== currBlueIds && 1 === currBlueIds.size);

    status = emph.clearOverriddenElements(vp, redIds); // Clear remaining red overrides by element ids...
    assert.isTrue(status);

    currRedIds = emph.getOverriddenElementsByKey(redKey!);
    assert.isTrue(undefined === currRedIds);

    currMap = emph.getOverriddenElements();
    assert.isTrue(undefined !== currMap && 1 === currMap.size);

    status = emph.clearOverriddenElements(vp, blueKey); // Clear blue overrides by key...
    assert.isTrue(status);

    currBlueIds = emph.getOverriddenElementsByKey(blueKey!);
    assert.isTrue(undefined === currBlueIds);

    currMap = emph.getOverriddenElements();
    assert.isTrue(undefined === currMap);

    EmphasizeElements.clear(vp);
  });

  it("Applies correct overrides", () => {
    const vp = ScreenViewport.create(viewDiv, spatialView.clone());
    EmphasizeElements.clear(vp);

    const vf = vp.viewFlags.clone();
    vf.weights = true;
    vp.viewFlags = vf;

    const expectAppearance = (color: ColorDef, type: FeatureOverrideType, expectedAppearance: FeatureAppearanceProps) => {
      const emph = EmphasizeElements.getOrCreate(vp);
      const elemId = "0x123";
      const elemIds = new Set<string>([elemId]);

      emph.clearOverriddenElements(vp);
      emph.overrideElements(elemIds, vp, color, type, true);

      const ovrs = new FeatureSymbology.Overrides(vp);
      emph.addFeatureOverrides(ovrs, vp);

      const feature = new Feature(elemId);
      const actualAppearance = ovrs.getFeatureAppearance(feature, "0");
      expect(actualAppearance).not.to.be.undefined;
      if (undefined !== actualAppearance) {
        expect(JSON.stringify(actualAppearance)).to.equal(JSON.stringify(expectedAppearance));
      }

      EmphasizeElements.clear(vp);
    };

    const rgb = RgbColor.fromColorDef(ColorDef.red);
    const black = new RgbColor(0, 0, 0);
    expectAppearance(ColorDef.red, FeatureOverrideType.ColorOnly, { rgb });
    expectAppearance(ColorDef.red, FeatureOverrideType.AlphaOnly, { rgb: black, transparency: 0 }); // EE does not permit overriding only transparency to opaque...
    expectAppearance(ColorDef.red, FeatureOverrideType.ColorAndAlpha, { rgb, transparency: 0 });

    const red = ColorDef.red.withTransparency(184);
    const transparency = 184 / 255;

    expectAppearance(red, FeatureOverrideType.ColorOnly, { rgb });
    expectAppearance(red, FeatureOverrideType.AlphaOnly, { transparency });
    expectAppearance(red, FeatureOverrideType.ColorAndAlpha, { rgb, transparency });
  });

  it("Override to/from key", async () => {
    const vp = ScreenViewport.create(viewDiv, spatialView.clone());
    EmphasizeElements.clear(vp);
    const emph = EmphasizeElements.getOrCreate(vp);

    interface ColorEntry { color: ColorDef, overrideType: FeatureOverrideType }
    const overrides: ColorEntry[] = [];
    overrides.push({ color: ColorDef.from(200, 150, 100, 50), overrideType: FeatureOverrideType.ColorOnly });
    overrides.push({ color: ColorDef.from(200, 150, 100, 50), overrideType: FeatureOverrideType.AlphaOnly });
    overrides.push({ color: ColorDef.from(200, 150, 100, 50), overrideType: FeatureOverrideType.ColorAndAlpha });

    for (const entry of overrides) {
      const key = emph.createOverrideKey(entry.color, entry.overrideType);
      assert(undefined !== key);
      const { overrideType, color } = { ...emph.getOverrideFromKey(key!) };
      assert(overrideType === entry.overrideType);
      switch (overrideType) {
        case FeatureOverrideType.ColorOnly:
          assert.isTrue(color.getRgb() === entry.color.getRgb());
          break;
        case FeatureOverrideType.AlphaOnly:
          assert.isTrue(color.getAlpha() === entry.color.getAlpha());
          break;
        case FeatureOverrideType.ColorAndAlpha:
          assert.isTrue(color.equals(entry.color));
          break;
      }
    }

    EmphasizeElements.clear(vp);
  });

  it("to/from JSON", async () => {
    function roundTrip(populate: (emph: EmphasizeElements, vp: ScreenViewport) => void): void {
      const vp1 = ScreenViewport.create(viewDiv, spatialView.clone());
      EmphasizeElements.clear(vp1);
      const before = EmphasizeElements.getOrCreate(vp1);
      populate(before, vp1);

      const inputJson = JSON.stringify(before.toJSON(vp1));

      const vp2 = ScreenViewport.create(viewDiv, spatialView.clone());
      const after = EmphasizeElements.getOrCreate(vp2);
      after.fromJSON(JSON.parse(inputJson), vp2);
      const outputJson = JSON.stringify(after.toJSON(vp2));
      expect(outputJson).to.equal(inputJson);

      function expectEqualSets(a: Set<string> | undefined, b: Set<string> | undefined): void {
        expect(a === undefined).to.equal(b === undefined);
        if (undefined !== a && undefined !== b)
          expect(a.size).to.equal(b.size);
      }

      expect(after.wantEmphasis).to.equal(before.wantEmphasis);
      expect(vp2.isAlwaysDrawnExclusive).to.equal(vp1.isAlwaysDrawnExclusive);

      const aApp = after.defaultAppearance;
      const bApp = before.defaultAppearance;
      expect(undefined === aApp).to.equal(undefined === bApp);
      if (undefined !== aApp && undefined !== bApp)
        expect(aApp.equals(bApp)).to.be.true;

      const aUnanimated = after.unanimatedAppearance;
      const bUnanimated = before.unanimatedAppearance;
      expect(undefined === aUnanimated).to.equal(undefined === bUnanimated);
      if (aUnanimated && bUnanimated)
        expect(aUnanimated.equals(bUnanimated)).to.be.true;

      expectEqualSets(after.getHiddenElements(vp2), before.getHiddenElements(vp1));
      expectEqualSets(after.getEmphasizedElements(vp2), before.getEmphasizedElements(vp1));
      expectEqualSets(after.getIsolatedElements(vp2), before.getIsolatedElements(vp1));
      expectEqualSets(after.getEmphasizedIsolatedElements(), before.getEmphasizedIsolatedElements());

      const aOvr = after.getOverriddenElements();
      const bOvr = before.getOverriddenElements();
      expect(undefined === aOvr).to.equal(undefined === bOvr);
      if (undefined !== aOvr && undefined !== bOvr) {
        expect(aOvr.size).to.equal(bOvr.size);
        for (const key of aOvr.keys()) {
          expectEqualSets(after.getOverriddenElementsByKey(key), before.getOverriddenElementsByKey(key));

          const aOvrs = after.getOverrideFromKey(key);
          const bOvrs = before.getOverrideFromKey(key);
          expect(aOvrs.overrideType).to.equal(bOvrs.overrideType);
          expect(aOvrs.color.tbgr).to.equal(bOvrs.color.tbgr);
        }
      }

      EmphasizeElements.clear(vp1);
      EmphasizeElements.clear(vp2);

      vp1.dispose();
      vp2.dispose();
    }

    roundTrip((emph, _vp) => {
      expect(emph.wantEmphasis).to.be.false;
      emph.wantEmphasis = true;
    });

    roundTrip((emph, _vp) => {
      expect(emph.defaultAppearance).to.be.undefined;
      emph.defaultAppearance = FeatureAppearance.fromJSON({
        rgb: { r: 10, g: 20, b: 30 },
        weight: 4,
        transparency: 0.75,
        linePixels: LinePixels.Invisible,
        ignoresMaterial: true,
        nonLocatable: true,
        emphasized: true,
      });
    });

    roundTrip((emph, vp) => {
      emph.isolateElements("0x123", vp, false);
      emph.emphasizeElements("0x456", vp, undefined, false);
      expect(emph.getIsolatedElements(vp)!.size).to.equal(1);
      expect(emph.getEmphasizedIsolatedElements()!.size).to.equal(1);
    });

    roundTrip((emph, vp) => {
      const ids = new Set<string>();
      ids.add("0x1"); ids.add("0x2"); ids.add("0x3"); ids.add("0x4"); ids.add("0x5");
      expect(emph.isolateElements(ids, vp, true)).to.be.true;
      let currIds = emph.getIsolatedElements(vp);
      assert.isTrue(undefined !== currIds && ids.size === currIds.size);

      ids.clear(); ids.add("0x3"); ids.add("0x4"); ids.add("0x5");
      expect(emph.emphasizeElements(ids, vp, undefined, true)).to.be.true;
      currIds = emph.getEmphasizedElements(vp);
      assert.isTrue(undefined !== currIds && ids.size === currIds.size);

      const redKey = emph.createOverrideKey(ColorDef.red, FeatureOverrideType.ColorOnly)!;
      expect(redKey).not.to.be.undefined;
      ids.clear(); ids.add("0x5");
      expect(emph.overrideElements(ids, vp, ColorDef.red, undefined, true)).to.be.true;
      currIds = emph.getOverriddenElementsByKey(redKey);
      assert.isTrue(undefined !== currIds && ids.size === currIds.size);

      ids.clear(); ids.add("0x2");
      expect(emph.hideElements(ids, vp, true)).to.be.true;
      currIds = emph.getHiddenElements(vp);
      assert.isTrue(undefined !== currIds && ids.size === currIds.size);
    });

    roundTrip((emph, vp) => {
      const redIds = new Set<string>();
      const redKey = emph.createOverrideKey(ColorDef.red, FeatureOverrideType.ColorOnly)!;
      expect(redKey).not.to.be.undefined;
      redIds.add("0x1"); redIds.add("0x2"); redIds.add("0x3");
      expect(emph.overrideElements(redIds, vp, ColorDef.red, undefined, true)).to.be.true;
      const currRedIds = emph.getOverriddenElementsByKey(redKey);
      assert.isTrue(undefined !== currRedIds && redIds.size === currRedIds.size);

      const blueIds = new Set<string>();
      const blueKey = emph.createOverrideKey(ColorDef.blue, FeatureOverrideType.ColorOnly)!;
      expect(blueKey).not.to.be.undefined;
      blueIds.add("0x4"); blueIds.add("0x5");
      expect(emph.overrideElements(blueIds, vp, ColorDef.blue, undefined, true)).to.be.true;
      const currBlueIds = emph.getOverriddenElementsByKey(blueKey);
      assert.isTrue(undefined !== currBlueIds && blueIds.size === currBlueIds.size);
    });

    roundTrip((emph, vp) => {
      const blue = FeatureAppearance.fromRgb(ColorDef.blue);
      emph.unanimatedAppearance = blue;
      expect(emph.unanimatedAppearance).not.to.be.undefined;
      expect(JSON.stringify(emph.unanimatedAppearance.toJSON())).to.equal(JSON.stringify(blue.toJSON()));

      const ovrs = new FeatureSymbology.Overrides();
      const feature = new Feature("0x123");
      let app = ovrs.getFeatureAppearance(feature, "0x456")!;
      expect(app).not.to.be.undefined;
      expect(app.matchesDefaults).to.be.true;

      emph.addFeatureOverrides(ovrs, vp);
      app = ovrs.getFeatureAppearance(feature, "0x456")!;
      expect(app).not.to.be.undefined;
      expect(app.matchesDefaults).to.be.false;
      expect(app.equals(blue)).to.be.true;
    });

    roundTrip((emph, vp) => {
      const transp = FeatureAppearance.fromTransparency(1.0);
      emph.unanimatedAppearance = transp;

      const ovrs = new FeatureSymbology.Overrides();
      const feature = new Feature("0x123");
      const app = ovrs.getFeatureAppearance(feature, "0x456");
      expect(app).not.to.be.undefined;
      expect(app!.matchesDefaults).to.be.true;

      emph.addFeatureOverrides(ovrs, vp);
      expect(ovrs.getFeatureAppearance(feature, "0x456")).to.be.undefined;
    });
  });
});
