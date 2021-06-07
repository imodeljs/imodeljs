/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { CompressedId64Set } from "@bentley/bentleyjs-core";
import { Vector3d } from "@bentley/geometry-core";
import {
  BackgroundMapType, ColorByName, DisplayStyle3dProps, DisplayStyle3dSettingsProps, PlanarClipMaskMode, PlanarClipMaskSettings,
  SpatialClassifierInsideDisplay, SpatialClassifierOutsideDisplay, ThematicDisplayMode,
} from "@bentley/imodeljs-common";
import { ContextRealityModelState, DisplayStyle3dState, IModelConnection, MockRender, SnapshotConnection } from "@bentley/imodeljs-frontend";

describe("DisplayStyle", () => {
  let imodel: IModelConnection;
  const styleProps: DisplayStyle3dProps = {
    classFullName: "bis.DisplayStyle3d",
    model: "0",
    code: {
      spec: "0x1",
      scope: "0x1",
      value: "",
    },
  };

  before(async () => {
    await MockRender.App.startup();
    imodel = await SnapshotConnection.openFile("test.bim");
  });

  after(async () => {
    if (imodel)
      await imodel.close();

    await MockRender.App.shutdown();
  });

  it("should clone correctly", () => {
    const style1 = new DisplayStyle3dState(styleProps, imodel);
    const style2 = style1.clone(imodel);
    expect(JSON.stringify(style1)).to.equal(JSON.stringify(style2));

    // ###TODO More substantial tests (change style properties)
  });

  it("should preserve sun direction", () => {
    const style1 = new DisplayStyle3dState(styleProps, imodel);
    expect(style1.sunDirection).not.to.be.undefined;

    style1.setSunTime(Date.now());
    expect(style1.sunDirection).not.to.be.undefined;

    const style2 = style1.clone(imodel);
    expect(style2.sunDirection).not.to.be.undefined;
    expect(style2.sunDirection.isAlmostEqual(style1.sunDirection)).to.be.true;
  });

  it("should read sun direction from json", () => {
    const props = { ...styleProps };
    const sunDir = new Vector3d(1, 0, 0.5);
    props.jsonProperties = { styles: { sceneLights: { sunDir } } };

    const style = new DisplayStyle3dState(props, imodel);
    expect(style.sunDirection).not.to.be.undefined;
    expect(style.sunDirection.x).to.equal(sunDir.x);
    expect(style.sunDirection.y).to.equal(sunDir.y);
    expect(style.sunDirection.z).to.equal(sunDir.z);
  });

  it("should use iModel extents for thematic height range if unspecified", () => {
    const style = new DisplayStyle3dState(styleProps, imodel);
    style.settings.applyOverrides({ thematic: { displayMode: ThematicDisplayMode.Height, range: [1, 100] } });
    expect(style.settings.thematic.range.low).to.equal(1);
    expect(style.settings.thematic.range.high).to.equal(100);

    style.settings.applyOverrides({ thematic: { displayMode: ThematicDisplayMode.Height } });
    expect(style.settings.thematic.range.low).to.equal(imodel.projectExtents.zLow);
    expect(style.settings.thematic.range.high).to.equal(imodel.projectExtents.zHigh);

    style.settings.applyOverrides({ thematic: { displayMode: ThematicDisplayMode.Slope } });
    expect(style.settings.thematic.range.isNull).to.be.true;
  });

  it("should override selected settings", async () => {
    const style = new DisplayStyle3dState(styleProps, imodel);
    const test = (overrides: DisplayStyle3dSettingsProps, changed?: DisplayStyle3dSettingsProps) => {
      const originalSettings = { ...style.settings.toJSON() };
      style.settings.applyOverrides(overrides);
      const output = style.settings.toJSON();

      const expected = { ...overrides, changed };
      for (const key of Object.keys(expected) as Array<keyof DisplayStyle3dSettingsProps>)
        expect(output[key]).to.deep.equal(expected[key]);

      for (const key of Object.keys(output) as Array<keyof DisplayStyle3dSettingsProps>)
        if (undefined === expected[key])
          expect(output[key]).to.deep.equal(originalSettings[key]);

      if (undefined !== expected.contextRealityModels)
        compareRealityModels(style, expected);

      // eslint-disable-next-line deprecation/deprecation
      if (undefined !== expected.scheduleScript)
        compareScheduleScripts(style, expected);
    };

    function compareRealityModels(style3d: DisplayStyle3dState, expected: DisplayStyle3dSettingsProps): void {
      const models: ContextRealityModelState[] = [];
      style3d.forEachRealityModel((model) => models.push(model));
      if (undefined !== expected.contextRealityModels) {
        expect(models.length).to.equal(expected.contextRealityModels.length);
        for (let i = 0; i < models.length; i++) {
          const a = models[i];
          const e = expected.contextRealityModels[i];
          expect(a.name).to.equal(e.name);
          expect(a.url).to.equal(e.tilesetUrl);
          expect(a.orbitGtBlob).to.equal(e.orbitGtBlob);
          expect(a.realityDataId).to.equal(e.realityDataId);
          expect(a.description).to.equal(e.description);
          expect(a.treeRef).not.to.be.undefined;

          expect(undefined === a.classifiers).to.equal(undefined === e.classifiers);
          if (undefined !== a.classifiers && undefined !== e.classifiers)
            expect(a.classifiers.size).to.equal(e.classifiers.length);

          expect(undefined === a.planarClipMaskSettings).to.equal(undefined === e.planarClipMask);
          if (undefined !== a.planarClipMaskSettings && undefined !== e.planarClipMask)
            expect(a.planarClipMaskSettings.equals(PlanarClipMaskSettings.fromJSON(e.planarClipMask)));

          const foundIndex = style3d.settings.contextRealityModels.models.findIndex((x) => x.url === a.url);
          expect(foundIndex).to.equal(i);
        }
        // Detach all.
        style3d.settings.contextRealityModels.clear();
        style3d.forEachRealityModel((_model) => expect(false));
      } else {
        expect(models.length).to.equal(0);
      }
    }

    function compareScheduleScripts(style3d: DisplayStyle3dState, expected: DisplayStyle3dSettingsProps): void {
      if (undefined !== style3d.scheduleScript) {
        // eslint-disable-next-line deprecation/deprecation
        expect(JSON.stringify(style3d.scheduleScript.toJSON())).to.equal(JSON.stringify(expected.scheduleScript));
      } else {
        // eslint-disable-next-line deprecation/deprecation
        expect(expected.scheduleScript).to.be.undefined;
      }
    }

    // Note that each test adds some new settings to our display style. This allows us to test that settings not specified in overrides retain their previous values.
    test({
      backgroundMap: {
        groundBias: 84,
        providerData: { mapType: BackgroundMapType.Street },
        applyTerrain: true,
        terrainSettings: { exaggeration: 0.5, heightOriginMode: 1 },
        planarClipMask: { mode: PlanarClipMaskMode.IncludeSubCategories, modelIds: CompressedId64Set.compressArray(["0x123", "0x456"]), transparency: .5, subCategoryOrElementIds: CompressedId64Set.compressArray(["0x123", "0x456"]), priority: 0 },
      },
    });

    test({ planProjections: { "0x8": { elevation: 2, transparency: 0.25, overlay: true, enforceDisplayPriority: true } } });
    test({ environment: { sky: { display: false, twoColor: true }, ground: { display: true } } });

    test({
      contextRealityModels: [{
        tilesetUrl: "bing.com",
        name: "bing",
        description: "an unpopular search engine",
        classifiers: [{
          modelId: "0x321",
          expand: 1.5,
          flags: {
            inside: SpatialClassifierInsideDisplay.Dimmed,
            outside: SpatialClassifierOutsideDisplay.On,
            isVolumeClassifier: false,
          },
          name: "bing",
          isActive: true,
        }],
      },
      {
        tilesetUrl: "google.com",
        name: "google",
        description: "a popular search engine",

        classifiers: [{
          modelId: "0x321",
          expand: 1.5,
          flags: {
            inside: SpatialClassifierInsideDisplay.Dimmed,
            outside: SpatialClassifierOutsideDisplay.On,
            isVolumeClassifier: false,
          },
          name: "google",
          isActive: true,
        }],
      },
      ],
    });

    test({
      scheduleScript: [{
        modelId: "0xadf",
        realityModelUrl: "askjeeves.com",
        elementTimelines: [{
          batchId: 54,
          elementIds: ["0x1", "0x2", "0x3", "0x4"],
        }],
      }],
    });

    test({
      thematic: {
        displayMode: ThematicDisplayMode.Slope,
        axis: [0, 0.5, 1],
        range: [12, 24],
        sunDirection: [0, 1, 0],
        gradientSettings: {
          mode: 1,
          colorScheme: 1,
          customKeys: [],
          stepCount: 3,
          marginColor: ColorByName.pink,
          colorMix: 0.333,
        },
      },
    });

    test({
      backgroundMap: {
        groundBias: 42,
        providerData: { mapType: BackgroundMapType.Aerial },
        terrainSettings: { exaggeration: 0.2, heightOriginMode: 0 },
      },
    });

    test({ planProjections: { "0x9": { elevation: 3, transparency: 0.75, overlay: true, enforceDisplayPriority: true } } });
    test({ environment: { sky: { display: true, twoColor: true }, ground: { display: false } } });

    test({
      contextRealityModels: [{
        tilesetUrl: "google.com",
        name: "google",
        description: "a popular search engine",
        planarClipMask: { mode: PlanarClipMaskMode.IncludeSubCategories, modelIds: CompressedId64Set.compressArray(["0x123", "0x456"]), transparency: .5, subCategoryOrElementIds: CompressedId64Set.compressArray(["0x123", "0x456"]), priority: 1024 },
        classifiers: [{
          modelId: "0x123",
          expand: 0.5,
          flags: {
            inside: SpatialClassifierInsideDisplay.Off,
            outside: SpatialClassifierOutsideDisplay.Dimmed,
            isVolumeClassifier: true,
          },
          name: "google",
          isActive: false,
        }],
      }],
    });

    test({
      scheduleScript: [{
        modelId: "0xfda",
        realityModelUrl: "altavista.com",
        elementTimelines: [{
          batchId: 45,
          elementIds: ["0xa", "0xb"],
        }],
      }],
    });

    // Also, while we have one constructed, test creation with reality model and script.
    const newStyle = new DisplayStyle3dState(style.toJSON(), imodel);
    await newStyle.load();
    expect(newStyle.equals(style)).to.be.true;
    compareRealityModels(newStyle, style.settings.toJSON());
    compareScheduleScripts(newStyle, style.settings.toJSON());
  });
});
