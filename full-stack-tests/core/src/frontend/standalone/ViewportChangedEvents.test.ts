/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { BeDuration, Id64, Id64Arg, Id64String } from "@bentley/bentleyjs-core";
import { ClipVector, Transform } from "@bentley/geometry-core";
import {
  AmbientOcclusion, AnalysisStyle, ClipStyle, ColorDef, FeatureAppearance, ModelClipGroup, ModelClipGroups, MonochromeMode, PlanProjectionSettings, SubCategoryOverride, ThematicDisplay, ViewFlags,
} from "@bentley/imodeljs-common";
import {
  ChangeFlag, FeatureSymbology, MockRender, PerModelCategoryVisibility, ScreenViewport, SnapshotConnection, SpatialViewState, StandardViewId, Viewport,
} from "@bentley/imodeljs-frontend";
import { ViewportChangedHandler, ViewportState } from "../ViewportChangedHandler";

describe("Viewport changed events", async () => {
  // test.bim:
  //  3d views:
  //    view:           34
  //    model selector: 35
  //    models: 1c 1f 22 23 24 (all spatial models in file)
  //    spatial categories: 17, 2d, 2f (subcats: 30, 33)), 31
  //    drawing category: 19
  let testBim: SnapshotConnection;

  // testImodel.bim: All Ids have briefcase Id=1
  //  2d views:
  //    view:  20 2e 35 3c 43 4a
  //    model: 19 27 30 37 3e 45
  //  3d views:
  //    view:               15 17 13 16 5b    61
  //    model selector:     14
  //    models:             0c 0c 0c 0c NULL  NULL
  //    category selector:  0f 0e 0f 0f 0f    0f
  //    display style:      10 10 10 10 11    12
  //  category selector 0x0e: 07 1a 1c
  //  category selector 0x0f: 01 03 05 07
  let testImodel: SnapshotConnection;
  let vp: ScreenViewport;

  const viewDiv = document.createElement("div");
  viewDiv.style.width = viewDiv.style.height = "1000px";
  document.body.appendChild(viewDiv);

  before(async () => {
    await MockRender.App.startup();
    testBim = await SnapshotConnection.openFile("test.bim"); // relative path resolved by BackendTestAssetResolver
    testImodel = await SnapshotConnection.openFile("testImodel.bim"); // relative path resolved by BackendTestAssetResolver
  });

  after(async () => {
    if (undefined !== testBim)
      await testBim.close();

    if (undefined !== testImodel)
      await testImodel.close();

    await MockRender.App.shutdown();
  });

  afterEach(() => {
    if (vp)
      vp.dispose();
  });

  // Make an Id64 for testImodel which has briefcase Id=1
  function id64(localId: number): Id64String {
    return Id64.fromLocalAndBriefcaseIds(localId, 1);
  }

  it("should be dispatched when always/never-drawn change", async () => {
    const view = await testBim.views.load("0x34") as SpatialViewState;
    view.setStandardRotation(StandardViewId.RightIso);
    vp = ScreenViewport.create(viewDiv, view);

    // Viewport-changed events are not dispatched immediately - they are accumulated between frames and dispatched from inside Viewport.renderFrame().
    ViewportChangedHandler.test(vp, (mon) => {
      // No event if the set is already empty when we clear it.
      mon.expect(ChangeFlag.None,undefined, () => vp.clearNeverDrawn());
      mon.expect(ChangeFlag.None, undefined, () => vp.clearAlwaysDrawn());

      // Assigning the set always raises an event.
      const idSet = new Set<string>();
      idSet.add("0x123");
      mon.expect(ChangeFlag.AlwaysDrawn, undefined, () => vp.setAlwaysDrawn(idSet, false));
      mon.expect(ChangeFlag.AlwaysDrawn, undefined, () => vp.setAlwaysDrawn(idSet, true));
      mon.expect(ChangeFlag.NeverDrawn, undefined, () => vp.setNeverDrawn(idSet));

      // Clearing raises event if set was assigned.
      mon.expect(ChangeFlag.NeverDrawn, undefined, () => vp.clearNeverDrawn());
      mon.expect(ChangeFlag.AlwaysDrawn, undefined, () => vp.clearAlwaysDrawn());

      // Clearing again will not re-raise because already cleared.
      mon.expect(ChangeFlag.None, undefined, () => vp.clearNeverDrawn());
      mon.expect(ChangeFlag.None, undefined, () => vp.clearAlwaysDrawn());

      // Setting repeatedly to same set raises each time, because we're not going to compare to previous set every time it changes.
      mon.expect(ChangeFlag.AlwaysDrawn, undefined, () => vp.setAlwaysDrawn(idSet, true));
      mon.expect(ChangeFlag.AlwaysDrawn, undefined, () => vp.setAlwaysDrawn(idSet, true));

      // Setting to an empty set, and also setting the 'exclusive' flags - effectively means no elements should draw.
      idSet.clear();
      mon.expect(ChangeFlag.AlwaysDrawn, undefined, () => vp.setAlwaysDrawn(idSet, true));
      // Raises even though set was already empty, because this resets the 'exclusive' flag.
      mon.expect(ChangeFlag.AlwaysDrawn, undefined, () => vp.clearAlwaysDrawn());
      // Exclusive flag no longer set and set is empty, so no event.
      mon.expect(ChangeFlag.None, undefined, () => vp.clearAlwaysDrawn());

      // Multiple changes in between frames produce a single event.
      idSet.add("0x123");
      mon.expect(ChangeFlag.AlwaysDrawn | ChangeFlag.NeverDrawn, undefined, () => {
        for (let i = 0; i < 5; i++) {
          vp.setAlwaysDrawn(idSet);
          vp.clearAlwaysDrawn();
          vp.setNeverDrawn(idSet);
          vp.clearNeverDrawn();
        }
      });

      // Always/never-drawn unaffected by undo/redo
      vp.saveViewUndo();
      vp.doUndo();
      mon.expect(ChangeFlag.None, undefined, () => undefined);
      vp.doRedo();
      mon.expect(ChangeFlag.None, undefined, () => undefined);
    });
  });

  it("should be dispatched when display style is modified using Viewport APIs", async () => {
    const view = await testBim.views.load("0x34") as SpatialViewState;
    view.setStandardRotation(StandardViewId.RightIso);
    vp = ScreenViewport.create(viewDiv, view);

    ViewportChangedHandler.test(vp, (mon) => {
      // No event if equivalent flags
      const newFlags = vp.viewFlags.clone();
      mon.expect(ChangeFlag.None, undefined, () => vp.viewFlags = newFlags);

      // ViewFlags which do not affect symbology overrides
      newFlags.solarLight = !newFlags.solarLight;
      mon.expect(ChangeFlag.DisplayStyle, ViewportState.RenderPlan, () => vp.viewFlags = newFlags);

      // ViewFlags which affect symbology overrides
      newFlags.constructions = !newFlags.constructions;
      mon.expect(ChangeFlag.DisplayStyle, ViewportState.RenderPlan, () => vp.viewFlags = newFlags);

      // Modifying the style's properties directly also produces an event.
      mon.expect(ChangeFlag.DisplayStyle, ViewportState.RenderPlan, () => {
        vp.displayStyle.backgroundColor = ColorDef.red;
        vp.displayStyle.viewFlags = new ViewFlags();
      });

      // Modify display style through Viewport API.
      vp.saveViewUndo();
      mon.expect(ChangeFlag.DisplayStyle | ChangeFlag.FeatureOverrideProvider, ViewportState.RenderPlan, () => {
        const newStyle = vp.displayStyle.clone();
        newStyle.backgroundColor = ColorDef.red;
        vp.displayStyle = newStyle;
      });

      // Change ClipStyle
      mon.expect(ChangeFlag.DisplayStyle | ChangeFlag.FeatureOverrideProvider, ViewportState.RenderPlan, () => vp.clipStyle = ClipStyle.fromJSON({ cutStyle: { appearance: { weight: 12 } } }));

      // Modify view flags through Viewport's displayStyle property.
      vp.saveViewUndo();
      mon.expect(ChangeFlag.DisplayStyle | ChangeFlag.FeatureOverrideProvider, ViewportState.RenderPlan, () => {
        const newStyle = vp.displayStyle.clone();
        newStyle.viewFlags.constructions = !newStyle.viewFlags.constructions;
        vp.displayStyle = newStyle;
      });

      vp.saveViewUndo();

      // Override subcategories directly on display style without going through Viewport API => produces event
      const ovr = SubCategoryOverride.fromJSON({ color: ColorDef.green.tbgr });
      mon.expect(ChangeFlag.DisplayStyle | ChangeFlag.FeatureOverrideProvider, ViewportState.RenderPlan, () => vp.displayStyle.overrideSubCategory("0x123", ovr));

      // Override by replacing display style on Viewport
      vp.saveViewUndo();
      mon.expect(ChangeFlag.DisplayStyle | ChangeFlag.FeatureOverrideProvider, ViewportState.RenderPlan, () => {
        const style = vp.displayStyle.clone();
        style.overrideSubCategory("0x123", ovr);
        vp.displayStyle = style;
      });

      // Apply same override via Viewport method. Does not check if override actually differs.
      vp.saveViewUndo();
      mon.expect(ChangeFlag.DisplayStyle | ChangeFlag.ViewedModels | ChangeFlag.FeatureOverrideProvider, ViewportState.RenderPlan, () => {
        // Because this is same override as already set, saveViewUndo will not save in undo buffer unless we make some other actual change to the ViewState
        vp.overrideSubCategory("0x123", ovr);
        vp.changeViewedModels(new Set<string>());
      });

      // Apply different override to same subcategory
      vp.saveViewUndo();
      mon.expect(ChangeFlag.DisplayStyle | ChangeFlag.FeatureOverrideProvider, ViewportState.RenderPlan, () => vp.overrideSubCategory("0x123", SubCategoryOverride.fromJSON({ color: ColorDef.red.tbgr })));
    });
  });

  it("should be dispatched when display style is modified directly", async () => {
    const view = await testBim.views.load("0x34") as SpatialViewState;
    vp = ScreenViewport.create(viewDiv, view);

    ViewportChangedHandler.test(vp, (mon) => {
      const expectNoChange = (func: () => void) => mon.expect(ChangeFlag.None, undefined, func);
      const expectChange = (func: () => void) => mon.expect(ChangeFlag.DisplayStyle, ViewportState.RenderPlan, func);
      const expectOverrideChange = (func: () => void) => mon.expect(ChangeFlag.DisplayStyle | ChangeFlag.FeatureOverrideProvider, ViewportState.RenderPlan, func);

      expectNoChange(() => view.displayStyle = view.displayStyle);
      expectOverrideChange(() => view.displayStyle = view.displayStyle.clone());

      const style = view.getDisplayStyle3d();
      const settings = style.settings;

      const vf = settings.viewFlags.clone();
      expectNoChange(() => settings.viewFlags = vf);
      vf.transparency = !vf.transparency;
      expectChange(() => settings.viewFlags = vf);

      expectOverrideChange(() => settings.overrideSubCategory("0x123", SubCategoryOverride.fromJSON({ color: ColorDef.blue.tbgr })));
      expectOverrideChange(() => settings.overrideModelAppearance("0xabc", FeatureAppearance.fromJSON({ weight: 10 })));
      expectOverrideChange(() => settings.dropModelAppearanceOverride("0xabc"));

      expectChange(() => settings.backgroundColor = ColorDef.red);
      expectNoChange(() => settings.backgroundColor = ColorDef.red);

      expectChange(() => settings.monochromeColor = ColorDef.green);
      expectNoChange(() => settings.monochromeColor = ColorDef.green);
      expectChange(() => settings.monochromeMode = MonochromeMode.Flat);
      expectNoChange(() => settings.monochromeMode = MonochromeMode.Flat);

      expectOverrideChange(() => settings.clipStyle = ClipStyle.fromJSON({ cutStyle: { appearance: { weight: 5 } } }));

      expectNoChange(() => settings.analysisFraction = settings.analysisFraction);
      mon.expect(ChangeFlag.DisplayStyle, ViewportState.AnalysisFraction, () => settings.analysisFraction = 0.123456);
      mon.expect(ChangeFlag.DisplayStyle, ViewportState.AnalysisFraction | ViewportState.RenderPlan, () => settings.analysisStyle = AnalysisStyle.fromJSON({ displacement: { channelName: "source" } }));

      mon.expect(ChangeFlag.DisplayStyle | ChangeFlag.FeatureOverrideProvider, ViewportState.TimePoint, () => settings.timePoint = 43);
      expectNoChange(() => settings.timePoint = 43);

      // eslint-disable-next-line deprecation/deprecation
      mon.expect(ChangeFlag.DisplayStyle | ChangeFlag.FeatureOverrideProvider, ViewportState.TimePoint, () => settings.scheduleScriptProps = [{ modelId: "0x123", elementTimelines: [] }]);
      // eslint-disable-next-line deprecation/deprecation
      mon.expect(ChangeFlag.DisplayStyle | ChangeFlag.FeatureOverrideProvider, ViewportState.TimePoint, () => settings.scheduleScriptProps = undefined);
      // If assignment to scheduleScriptProps produces no net change, no event.
      // eslint-disable-next-line deprecation/deprecation
      expectNoChange(() => settings.scheduleScriptProps = undefined);

      expectChange(() => settings.hiddenLineSettings = settings.hiddenLineSettings.override({ transThreshold: 1.0 - settings.hiddenLineSettings.transThreshold }));
      expectNoChange(() => settings.hiddenLineSettings = settings.hiddenLineSettings.override({}));

      expectNoChange(() => settings.lights = settings.lights.clone());
      expectChange(() => settings.lights = settings.lights.clone({ numCels: settings.lights.numCels + 1 }));
      expectNoChange(() => settings.lights = settings.lights.clone({ numCels: settings.lights.numCels }));

      expectNoChange(() => settings.solarShadows = settings.solarShadows.clone({ color: settings.solarShadows.color.toColorDef().toJSON() }));
      expectChange(() => settings.solarShadows = settings.solarShadows.clone({ color: 123 }));

      const thematicProps = settings.thematic.toJSON();
      expectNoChange(() => settings.thematic = ThematicDisplay.fromJSON(thematicProps));
      thematicProps.range = { low: 123, high: 456 };
      expectChange(() => settings.thematic = ThematicDisplay.fromJSON(thematicProps));

      expectChange(() => settings.ambientOcclusionSettings = AmbientOcclusion.Settings.fromJSON({ bias: 42, maxDistance: 24 }));
      expectChange(() => settings.environment = { ground: { display: true, elevation: 42 } });

      expectChange(() => settings.setPlanProjectionSettings("0xabcdef", undefined));
      expectChange(() => settings.setPlanProjectionSettings("0xfedcba", PlanProjectionSettings.fromJSON({ elevation: 42 })));
    });
  });

  it("should be dispatched when overrides are applied to the display style", async () => {
    vp = ScreenViewport.create(viewDiv, await testBim.views.load("0x34"));
    ViewportChangedHandler.test(vp, (mon) => {
      const settings = vp.view.displayStyle.settings;

      mon.expect(ChangeFlag.DisplayStyle, ViewportState.Controller, () => settings.applyOverrides({ viewflags: { backgroundMap: !settings.viewFlags.backgroundMap } }));
      mon.expect(ChangeFlag.DisplayStyle, ViewportState.RenderPlan, () => settings.applyOverrides({ backgroundColor: 0xabcdef }));
      mon.expect(ChangeFlag.DisplayStyle | ChangeFlag.FeatureOverrideProvider, ViewportState.TimePoint, () => settings.applyOverrides({ scheduleScript: [{ modelId: "0x321", elementTimelines: [] }] }));
    });
  });

  it("should be dispatched when background map is modified using Viewport APIs", async () => {
    const view = await testBim.views.load("0x34") as SpatialViewState;
    view.setStandardRotation(StandardViewId.RightIso);
    vp = ScreenViewport.create(viewDiv, view);

    ViewportChangedHandler.test(vp, (mon) => {
      const vf = vp.viewFlags.clone();
      vf.backgroundMap = !vf.backgroundMap;
      mon.expect(ChangeFlag.DisplayStyle, ViewportState.Controller, () => vp.viewFlags = vf);

      vf.backgroundMap = !vf.backgroundMap;
      mon.expect(ChangeFlag.DisplayStyle, ViewportState.Controller, () => vp.viewFlags = vf);

      mon.expect(ChangeFlag.DisplayStyle, ViewportState.Controller, () => vp.backgroundMapSettings = vp.backgroundMapSettings.clone({ groundBias: 123 }));
      mon.expect(ChangeFlag.DisplayStyle, ViewportState.Controller, () => vp.changeBackgroundMapProps({ groundBias: 456 }));
    });
  });

  it("should be dispatched when background map is modified directly", async () => {
    const view = await testBim.views.load("0x34") as SpatialViewState;
    vp = ScreenViewport.create(viewDiv, view);

    ViewportChangedHandler.test(vp, (mon) => {
      const settings = view.displayStyle.settings;
      const vf = settings.viewFlags.clone();
      vf.backgroundMap = !vf.backgroundMap;
      mon.expect(ChangeFlag.DisplayStyle, ViewportState.Controller, () => settings.viewFlags = vf);
      mon.expect(ChangeFlag.None, undefined, () => settings.viewFlags = vf);

      mon.expect(ChangeFlag.DisplayStyle, ViewportState.Controller, () => settings.backgroundMap = settings.backgroundMap.clone({ groundBias: 654 }));
      mon.expect(ChangeFlag.DisplayStyle, ViewportState.Controller, () => settings.backgroundMap = settings.backgroundMap.clone({ groundBias: 321 }));
    });
  });

  it("should invalidate scene when shadows are on", async () => {
    const view = await testBim.views.load("0x34") as SpatialViewState;
    view.setStandardRotation(StandardViewId.RightIso);
    vp = ScreenViewport.create(viewDiv, view);

    ViewportChangedHandler.test(vp, (mon) => {
      mon.expect(ChangeFlag.DisplayStyle, ViewportState.RenderPlan, () => {
        const vf = vp.viewFlags.clone();
        vf.shadows = true;
        vp.viewFlags = vf;
      });

      const idSet = new Set<string>();
      idSet.add("0x321");
      mon.expect(ChangeFlag.AlwaysDrawn, ViewportState.Scene, () => vp.setAlwaysDrawn(idSet));
      mon.expect(ChangeFlag.AlwaysDrawn, ViewportState.Scene, () => vp.clearAlwaysDrawn());
      mon.expect(ChangeFlag.None, undefined, () => vp.clearAlwaysDrawn());

      idSet.add("0x123");
      mon.expect(ChangeFlag.NeverDrawn, ViewportState.Scene, () => vp.setNeverDrawn(idSet));
      mon.expect(ChangeFlag.NeverDrawn, ViewportState.Scene, () => vp.clearNeverDrawn());
      mon.expect(ChangeFlag.None, undefined, () => vp.clearNeverDrawn());

      mon.expect(ChangeFlag.FeatureOverrideProvider, ViewportState.Scene, () => vp.setFeatureOverrideProviderChanged());

      mon.expect(ChangeFlag.ViewedCategories, ViewportState.Scene, () => vp.changeCategoryDisplay(["0xa", "0xb"], true));
    });
  });

  it("should be dispatched when displayed 2d models change", async () => {
    vp = ScreenViewport.create(viewDiv, await testImodel.views.load(id64(0x20))); // views model 0x19

    await ViewportChangedHandler.testAsync(vp, async (mon) => {
      // changeModelDisplay is no-op for 2d views
      mon.expect(ChangeFlag.None, undefined, () => expect(vp.changeModelDisplay(id64(0x19), false)).to.be.false);
      mon.expect(ChangeFlag.None, undefined, () => expect(vp.changeModelDisplay(id64(0x27), true)).to.be.false);
      const viewedModels = new Set<string>();
      viewedModels.add(id64(0x27));
      mon.expect(ChangeFlag.None, undefined, () => expect(vp.changeViewedModels(viewedModels)).to.be.false);

      // Switching to a different 2d view of the same model should not produce model-changed event
      const view20 = await testImodel.views.load(id64(0x20)); // views model 0x1e
      mon.expect(ChangeFlag.ViewState, ViewportState.Controller, () => vp.changeView(view20));

      // Switching to a different 2d view of a different model should produce model-changed event
      // Note: new view also has different categories enabled.
      const view35 = await testImodel.views.load(id64(0x35)); // views model 0x1e
      mon.expect(ChangeFlag.ViewedModels | ChangeFlag.ViewedCategories | ChangeFlag.DisplayStyle | ChangeFlag.ViewState, ViewportState.Controller, () => vp.changeView(view35));

      // Switch back to previous view.
      // Note: changeView() clears undo stack so cannot/needn't test undo/redo here.
      mon.expect(ChangeFlag.ViewedModels | ChangeFlag.ViewedCategories | ChangeFlag.DisplayStyle | ChangeFlag.ViewState, ViewportState.Controller, () => vp.changeView(view20.clone()));
    });
  });

  it("should be dispatched when model selector is modified using Viewport APIs", async () => {
    vp = ScreenViewport.create(viewDiv, await testBim.views.load("0x34"));

    await ViewportChangedHandler.testAsync(vp, async (mon) => {
      // adding a model which is already present produces no event
      mon.expect(ChangeFlag.None, undefined, () => vp.changeModelDisplay("0x1c", true));

      // removing a model not present produces no event
      mon.expect(ChangeFlag.None, undefined, () => vp.changeModelDisplay("0x9876543", false));

      // setting viewed models directly always produces event - we don't check if contents of set exactly match current set
      let selectedModels = (vp.view as SpatialViewState).modelSelector.models;
      mon.expect(ChangeFlag.ViewedModels, ViewportState.Scene, () => vp.changeViewedModels(selectedModels));
      selectedModels = new Set<string>();
      selectedModels.add("0x1c");
      mon.expect(ChangeFlag.ViewedModels, ViewportState.Scene, () => vp.changeViewedModels(selectedModels));

      mon.expect(ChangeFlag.ViewedModels, ViewportState.Scene, () => {
        vp.changeModelDisplay("0x1c", false);
        vp.changeModelDisplay("0x1f", true);
      });

      // Viewport is now viewing model 0x1f.
      // Replacing viewed models with same set [ 0x1f ] produces event
      selectedModels.clear();
      selectedModels.add("0x1f");
      mon.expect(ChangeFlag.ViewedModels, ViewportState.Scene, () => vp.changeViewedModels(selectedModels));
    });
  });

  it("should be dispatched when model selector is modified directly", async () => {
    const view = await testBim.views.load("0x34") as SpatialViewState;
    vp = ScreenViewport.create(viewDiv, view);

    ViewportChangedHandler.test(vp, (mon) => {
      const expectChange = (func: () => void) => mon.expect(ChangeFlag.ViewedModels, ViewportState.Scene, func);
      const expectNoChange = (func: () => void) => mon.expect(ChangeFlag.None, undefined, func);

      expectNoChange(() => view.modelSelector = view.modelSelector);
      expectChange(() => view.modelSelector = view.modelSelector.clone());

      const models = view.modelSelector.models;
      expectChange(() => models.add("0xabc"));
      expectNoChange(() => models.add("0xabc"));

      expectChange(() => models.delete("0xabc"));
      expectNoChange(() => models.delete("0xabc"));

      expectChange(() => models.clear());
      expectNoChange(() => models.clear());

      // We don't check if the input's contents exactly match the current contents.
      const modelIds = new Set<string>(["0x1", "0x2"]);
      expectChange(() => view.modelSelector.models = modelIds);
      expectChange(() => view.modelSelector.models = modelIds);
    });
  });

  it("should be dispatched when category selector is modified using Viewport APIs", async () => {
    vp = ScreenViewport.create(viewDiv, await testImodel.views.load(id64(0x15))); // view category selector 0x0f

    await ViewportChangedHandler.testAsync(vp, async (mon) => {
      mon.expect(ChangeFlag.ViewedCategories, undefined, () => vp.changeCategoryDisplay(id64(0x01), true));

      // We're not viewing 0x1a, so this will not produce an event.
      mon.expect(ChangeFlag.None, undefined, () => vp.changeCategoryDisplay(id64(0x1a), false));

      // Two changes which produce no net change still produce event - we do not track net changes
      vp.saveViewUndo();
      mon.expect(ChangeFlag.ViewedCategories, undefined, () => {
        vp.changeCategoryDisplay(id64(0x01), false);
        vp.changeCategoryDisplay(id64(0x01), true);
      });

      // Undo/redo with no net change produces no event
      vp.saveViewUndo();
      mon.expect(ChangeFlag.None, undefined, () => vp.doUndo());
      mon.expect(ChangeFlag.None, undefined, () => vp.doRedo());

      // Switching to a different view with same category selector produces no category-changed event
      const view13 = await testImodel.views.load(id64(0x13));
      mon.expect(ChangeFlag.ViewState | ChangeFlag.DisplayStyle, ViewportState.Controller, () => vp.changeView(view13));

      // Switching to a different view with different category selector produces event
      const view17 = await testImodel.views.load(id64(0x17));
      mon.expect(ChangeFlag.ViewState | ChangeFlag.DisplayStyle | ChangeFlag.ViewedCategories, ViewportState.Controller, () => vp.changeView(view17));

      // Changing category selector, then switching to a view with same categories enabled produces no event.
      mon.expect(ChangeFlag.ViewedCategories, undefined, () => {
        vp.changeCategoryDisplay(vp.view.categorySelector.categories, false);
        vp.changeCategoryDisplay(view13.categorySelector.categories, true);
      });

      mon.expect(ChangeFlag.ViewState | ChangeFlag.ViewedCategories | ChangeFlag.DisplayStyle, ViewportState.Controller, () => vp.changeView(view13));
    });
  });

  it("should be dispatched when category selector is modified directly", async () => {
    vp = ScreenViewport.create(viewDiv, await testImodel.views.load(id64(0x15)));

    ViewportChangedHandler.test(vp, (mon) => {
      const expectChange = (func: () => void) => mon.expect(ChangeFlag.ViewedCategories, undefined, func);
      const expectNoChange = (func: () => void) => mon.expect(ChangeFlag.None, undefined, func);

      expectChange(() => vp.view.categorySelector = vp.view.categorySelector.clone());
      expectNoChange(() => vp.view.categorySelector = vp.view.categorySelector);

      const categories = vp.view.categorySelector.categories;
      expectChange(() => categories.add("0x123"));
      expectNoChange(() => categories.add("0x123"));

      expectChange(() => categories.delete("0x123"));
      expectNoChange(() => categories.delete("0x123"));

      expectChange(() => categories.clear());
      expectNoChange(() => categories.clear());

      // We don't check if the input's contents exactly match the current contents.
      const catIds = new Set<string>(["0xa", "0xb"]);
      expectChange(() => vp.view.categorySelector.categories = catIds);
      expectChange(() => vp.view.categorySelector.categories = catIds);
    });
  });

  it("should be dispatched when per-model category visibility changes", async () => {
    vp = ScreenViewport.create(viewDiv, await testBim.views.load("0x34"));
    const vis = vp.perModelCategoryVisibility;

    ViewportChangedHandler.test(vp, (mon) => {
      expect(vis.getOverride("0x1c", "0x1234")).to.equal(PerModelCategoryVisibility.Override.None);

      // No net change => no event
      mon.expect(ChangeFlag.None, undefined, () => vis.setOverride("0x1c", "0x1234", PerModelCategoryVisibility.Override.None));
      expect(vis.getOverride("0x1c", "0x1234")).to.equal(PerModelCategoryVisibility.Override.None);

      mon.expect(ChangeFlag.ViewedCategoriesPerModel, undefined, () => vis.setOverride("0x1c", "0x1234", PerModelCategoryVisibility.Override.Show));
      expect(vis.getOverride("0x1c", "0x1234")).to.equal(PerModelCategoryVisibility.Override.Show);

      mon.expect(ChangeFlag.ViewedCategoriesPerModel, undefined, () => vis.setOverride("0x1c", "0x1234", PerModelCategoryVisibility.Override.Hide));
      expect(vis.getOverride("0x1c", "0x1234")).to.equal(PerModelCategoryVisibility.Override.Hide);

      mon.expect(ChangeFlag.None, undefined, () => vis.clearOverrides("0x9876"));

      mon.expect(ChangeFlag.ViewedCategoriesPerModel, undefined, () => vis.clearOverrides());
      expect(vis.getOverride("0x1c", "0x1234")).to.equal(PerModelCategoryVisibility.Override.None);

      mon.expect(ChangeFlag.None, undefined, () => vis.clearOverrides());

      const idSet = new Set<string>();
      idSet.add("0x1234567");
      mon.expect(ChangeFlag.None, undefined, () => vis.setOverride(new Set<string>(), new Set<string>(), PerModelCategoryVisibility.Override.Show));
      mon.expect(ChangeFlag.None, undefined, () => vis.setOverride(idSet, new Set<string>(), PerModelCategoryVisibility.Override.Show));
      mon.expect(ChangeFlag.None, undefined, () => vis.setOverride(new Set<string>(), idSet, PerModelCategoryVisibility.Override.Show));

      const idList = ["0x1234567"];
      mon.expect(ChangeFlag.None, undefined, () => vis.setOverride([], [], PerModelCategoryVisibility.Override.Show));
      mon.expect(ChangeFlag.None, undefined, () => vis.setOverride(idList, [], PerModelCategoryVisibility.Override.Show));
      mon.expect(ChangeFlag.None, undefined, () => vis.setOverride([], idList, PerModelCategoryVisibility.Override.Show));

      const modelIdList = ["0x1", "0x2", "0x3"];
      const catIdList = ["0xa", "0xb"];
      mon.expect(ChangeFlag.ViewedCategoriesPerModel, undefined, () => vis.setOverride(modelIdList, catIdList, PerModelCategoryVisibility.Override.Show));
      for (const modelId of modelIdList)
        for (const catId of catIdList)
          expect(vis.getOverride(modelId, catId)).to.equal(PerModelCategoryVisibility.Override.Show);

      // No net change
      mon.expect(ChangeFlag.None, undefined, () => vis.setOverride(modelIdList, catIdList, PerModelCategoryVisibility.Override.Show));

      modelIdList.shift(); // remove "0x1"
      catIdList.shift(); // remove "0xa"
      mon.expect(ChangeFlag.ViewedCategoriesPerModel, undefined, () => vis.setOverride(modelIdList, catIdList, PerModelCategoryVisibility.Override.Hide));
      expect(vis.getOverride("0x1", "0xa")).to.equal(PerModelCategoryVisibility.Override.Show);
      expect(vis.getOverride("0x1", "0xb")).to.equal(PerModelCategoryVisibility.Override.Show);
      expect(vis.getOverride("0x2", "0xa")).to.equal(PerModelCategoryVisibility.Override.Show);
      expect(vis.getOverride("0x2", "0xb")).to.equal(PerModelCategoryVisibility.Override.Hide);
      expect(vis.getOverride("0x3", "0xa")).to.equal(PerModelCategoryVisibility.Override.Show);
      expect(vis.getOverride("0x3", "0xb")).to.equal(PerModelCategoryVisibility.Override.Hide);

      mon.expect(ChangeFlag.ViewedCategoriesPerModel, undefined, () => vis.clearOverrides(["0x1"]));
      expect(vis.getOverride("0x1", "0xa")).to.equal(PerModelCategoryVisibility.Override.None);
      expect(vis.getOverride("0x1", "0xb")).to.equal(PerModelCategoryVisibility.Override.None);
    });
  });

  it("should be dispatched when feature override provider changes", async () => {
    vp = ScreenViewport.create(viewDiv, await testBim.views.load("0x34"));
    let overridesAdded = false;
    const provider = {
      addFeatureOverrides: (_overrides: FeatureSymbology.Overrides, _viewport: Viewport): void => {
        expect(overridesAdded).to.be.false;
        overridesAdded = true;
      },
    };

    ViewportChangedHandler.test(vp, (mon) => {
      // Changing the provider => event
      mon.expect(ChangeFlag.FeatureOverrideProvider, undefined, () => vp.addFeatureOverrideProvider(provider));
      expect(overridesAdded).to.be.true;
      overridesAdded = false;

      // Explicitly notifying provider's state has changed => event
      mon.expect(ChangeFlag.FeatureOverrideProvider, undefined, () => vp.setFeatureOverrideProviderChanged());
      expect(overridesAdded).to.be.true;
      overridesAdded = false;

      // Setting provider to same value => no event
      mon.expect(ChangeFlag.None, undefined, () => vp.addFeatureOverrideProvider(provider));
      expect(overridesAdded).to.be.false;

      // Actually changing the provider => event
      mon.expect(ChangeFlag.FeatureOverrideProvider, undefined, () => {
        const prov = vp.findFeatureOverrideProvider((_) => true);
        expect(prov).not.to.be.undefined;
        if (prov)
          vp.dropFeatureOverrideProvider(prov);
      });
      expect(overridesAdded).to.be.false;
    });
  });

  it("should be dispatched when changing ViewState", async () => {
    const view2d20 = await testImodel.views.load(id64(0x20));
    const view2d2e = await testImodel.views.load(id64(0x2e));
    const view3d15 = await testImodel.views.load(id64(0x15)); // cat sel 0f, mod sel 14
    const view3d17 = await testImodel.views.load(id64(0x17)); // cat sel 0e, mod sel 14

    vp = ScreenViewport.create(viewDiv, view2d20.clone());
    ViewportChangedHandler.test(vp, (mon) => {
      // No effective change to view
      mon.expect(ChangeFlag.ViewState, ViewportState.Controller, () => vp.changeView(view2d20.clone()));

      // 2d => 2d
      mon.expect(ChangeFlag.ViewState | ChangeFlag.ViewedCategories | ChangeFlag.ViewedModels | ChangeFlag.DisplayStyle, ViewportState.Controller, () => vp.changeView(view2d2e.clone()));

      // 2d => 3d
      mon.expect(ChangeFlag.ViewState | ChangeFlag.ViewedCategories | ChangeFlag.ViewedModels | ChangeFlag.DisplayStyle, ViewportState.Controller, () => vp.changeView(view3d15.clone()));

      // No effective change
      mon.expect(ChangeFlag.ViewState, ViewportState.Controller, () => vp.changeView(view3d15.clone()));

      // 3d => 3d - same model selector, same display style, different category selector
      mon.expect(ChangeFlag.ViewState | ChangeFlag.ViewedCategories, ViewportState.Controller, () => vp.changeView(view3d17.clone()));

      // 3d => 2d
      mon.expect(ChangeFlag.ViewState | ChangeFlag.ViewedCategories | ChangeFlag.ViewedModels | ChangeFlag.DisplayStyle, ViewportState.Controller, () => vp.changeView(view2d20.clone()));

      // Pass the exact same ViewState reference => no "ViewState changed" event.
      mon.expect(ChangeFlag.None, undefined, () => vp.changeView(vp.view));
    });

    // Test the immediately-fire onChangeView event.
    let numEvents = 0;
    const removeListener = vp.onChangeView.addListener(() => ++numEvents);

    // Same ViewState reference => no event
    vp.changeView(vp.view);
    expect(numEvents).to.equal(0);

    // Different ViewState reference => event
    vp.changeView(view2d20.clone());
    expect(numEvents).to.equal(1);

    // Different ViewState reference to an logically identical ViewState => event
    vp.changeView(view2d20);
    expect(numEvents).to.equal(2);

    removeListener();
  });

  it("should be dispatched when modifying ViewState directly", async () => {
    const view = await testBim.views.load("0x34") as SpatialViewState;
    vp = ScreenViewport.create(viewDiv, view);

    ViewportChangedHandler.test(vp, (mon) => {
      const expectChange = (state: ViewportState, func: () => void) => mon.expect(ChangeFlag.None, state, func);

      expectChange(ViewportState.RenderPlan, () => view.details.clipVector = ClipVector.createEmpty());
      expectChange(ViewportState.Scene, () => view.details.modelClipGroups = new ModelClipGroups([ ModelClipGroup.fromJSON({ models: [ "0x123" ] }) ]));
      expectChange(ViewportState.Scene, () => view.modelDisplayTransformProvider = { getModelDisplayTransform: (_id, _tf) => Transform.createIdentity() });
    });
  });

  it("should be dispatched to two views sharing the same display style", async () => {
    const v1 = await testBim.views.load("0x34") as SpatialViewState;
    const v2 = v1.clone();
    v2.displayStyle = v1.displayStyle;

    const div2 = document.createElement("div");
    div2.style.width = div2.style.height = "50px";
    document.body.appendChild(div2);

    vp = ScreenViewport.create(viewDiv, v1);
    const vp2 = ScreenViewport.create(div2, v2);

    vp.renderFrame();
    vp2.renderFrame();
    expect(vp.renderPlanValid).to.be.true;
    expect(vp2.renderPlanValid).to.be.true;

    const vf = vp.viewFlags.clone();
    vf.transparency = !vf.transparency;
    vp.viewFlags = vf;
    expect(vp.renderPlanValid).to.be.false;
    expect(vp2.renderPlanValid).to.be.false;

    vp.renderFrame();
    vp2.renderFrame();
    expect(vp.renderPlanValid).to.be.true;
    expect(vp2.renderPlanValid).to.be.true;

    vp2.dispose();
    document.body.removeChild(div2);
  });

  it("should load subcategories for all displayed categories", async () => {
    // NB: Because subcategories are cached, and previous tests probably loaded some, we must clear the cache.
    const subcats = testImodel.subcategories;
    subcats.onIModelConnectionClose();

    // View 0x17 views category 0x07 - expect subcategories already loaded by ViewState.load()
    vp = ScreenViewport.create(viewDiv, await testImodel.views.load(id64(0x17)));
    expect(vp.view.viewsCategory(id64(0x07))).to.be.true;
    expect(subcats.getSubCategories(id64(0x07))).not.to.be.undefined;

    // Other categories not yet viewed therefore subcategories not yet loaded
    expect(vp.view.viewsCategory(id64(0x01))).to.be.false;
    expect(vp.view.viewsCategory(id64(0x03))).to.be.false;
    expect(vp.view.viewsCategory(id64(0x05))).to.be.false;
    expect(vp.view.viewsCategory(id64(0x1a))).to.be.false;
    expect(vp.view.viewsCategory(id64(0x1c))).to.be.false;

    const waitForSubCats = async (catIds: Id64Arg): Promise<void> => {
      for (const catId of Id64.iterable(catIds))
        expect(subcats.getSubCategories(catId)).to.be.undefined;

      // We used to wait half a second (no loop). That was sometimes apparently not long enough for the Linux CI job.
      // Waiting for some async operation to happen in background within a limited amount of time is not great, but that is the
      // behavior we are trying to test...
      // Wait up to 4 seconds. Loop prevents tests from taking longer than necessary if response is speedy.
      for (let i = 1; i < 16; i++) {
        await BeDuration.wait(250);
        let numLoaded = 0;
        for (const catId of Id64.iterable(catIds)) {
          if (subcats.getSubCategories(catId) !== undefined)
            ++numLoaded;
        }

        if (0 !== numLoaded) {
          // If one category was loaded, they all should have been.
          expect(numLoaded).to.equal(Id64.sizeOf(catIds));
          break;
        }
      }

      for (const catId of Id64.iterable(catIds))
        expect(subcats.getSubCategories(catId)).not.to.be.undefined;
    };

    // Turning on another category for the first time causes subcategories to be asynchronously loaded if not in cache
    vp.changeCategoryDisplay(id64(0x01), true);
    await waitForSubCats(id64(0x01));

    // If we turn on 2 more categories at once, subcategories for both should be loaded asynchronously
    vp.changeCategoryDisplay([id64(0x03), id64(0x05)], true);
    await waitForSubCats([id64(0x03), id64(0x05)]);

    // If we turn on 2 more categories in succession, subcategories for both should be loaded asynchronously.
    // The loading of the first category's subcategories should not be interrupted by loading of second category's subcategories.
    vp.changeCategoryDisplay(id64(0x1a), true);
    vp.changeCategoryDisplay(id64(0x1c), true);
    await waitForSubCats([id64(0x1c), id64(0x1a)]);
  });
});
