/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { CompressedId64Set, Id64String, OrderedId64Iterable } from "@bentley/bentleyjs-core";
import { BackgroundMapType, GlobeMode } from "../BackgroundMapSettings";
import { ColorByName } from "../ColorByName";
import {
  DisplayStyle3dSettings, DisplayStyle3dSettingsProps, DisplayStyleOverridesOptions, DisplayStylePlanarClipMaskProps, DisplayStyleSettings, MonochromeMode,
} from "../DisplayStyleSettings";
import { LinePixels } from "../LinePixels";
import { PlanProjectionSettings, PlanProjectionSettingsProps } from "../PlanProjectionSettings";
import { SpatialClassifierInsideDisplay, SpatialClassifierOutsideDisplay } from "../SpatialClassification";
import { ThematicDisplayMode } from "../ThematicDisplay";
import { RenderMode, ViewFlags } from "../ViewFlags";
import { PlanarClipMaskMode, PlanarClipMaskSettings } from "../PlanarClipMask";

/* eslint-disable deprecation/deprecation */
//  - for DisplayStyleSettings.excludedElements.

describe("DisplayStyleSettings", () => {
  describe("plan projection settings", () => {
    interface SettingsMap { [modelId: string]: PlanProjectionSettingsProps }

    it("round-trips plan projection settings", () => {
      const roundTrip = (planProjections: SettingsMap | undefined) => {
        const settings = new DisplayStyle3dSettings({ styles: { planProjections } });
        const json = settings.toJSON();
        expect(JSON.stringify(json.planProjections)).to.equal(JSON.stringify(planProjections));
      };

      roundTrip(undefined);
      roundTrip({});
      roundTrip({ "not an id": { transparency: 0.5 } });
      roundTrip({ "0x1": { overlay: true } });
      roundTrip({ "0x1": { overlay: false } });
      roundTrip({ "0x1": { enforceDisplayPriority: true } });
      roundTrip({ "0x1": { enforceDisplayPriority: false } });
      roundTrip({ "0x1": { transparency: 0.5 }, "0x2": { elevation: -5 } });
    });

    it("sets and round-trips plan projection settings", () => {
      const roundTrip = (planProjections: SettingsMap | undefined, expected: SettingsMap | undefined | "input") => {
        if ("input" === expected)
          expected = planProjections;

        const input = new DisplayStyle3dSettings({});
        if (undefined !== planProjections)
          for (const modelId of Object.keys(planProjections))
            input.setPlanProjectionSettings(modelId, PlanProjectionSettings.fromJSON(planProjections[modelId]));

        const output = new DisplayStyle3dSettings({ styles: input.toJSON() });
        const json = output.toJSON();
        expect(JSON.stringify(json.planProjections)).to.equal(JSON.stringify(expected));
      };

      roundTrip(undefined, undefined);
      roundTrip({}, undefined);
      roundTrip({ "not an id": { transparency: 0.5 } }, {});
      roundTrip({ "0x1": { overlay: true } }, "input");
      roundTrip({ "0x1": { overlay: false } }, {});
      roundTrip({ "0x1": { enforceDisplayPriority: true } }, "input");
      roundTrip({ "0x1": { enforceDisplayPriority: false } }, {});
      roundTrip({ "0x1": { transparency: 0.5 }, "0x2": { elevation: -5 } }, "input");
    });

    it("deletes plan projection settings", () => {
      const settings = new DisplayStyle3dSettings({});
      expect(settings.planProjectionSettings).to.be.undefined;

      const countSettings = () => {
        let count = 0;
        const iter = settings.planProjectionSettings;
        if (undefined !== iter)
          for (const _entry of iter) // eslint-disable-line @typescript-eslint/naming-convention
            ++count;

        return count;
      };

      const makeSettings = (props: PlanProjectionSettingsProps) => new PlanProjectionSettings(props);

      settings.setPlanProjectionSettings("0x1", makeSettings({ elevation: 1 }));
      expect(settings.planProjectionSettings).not.to.be.undefined;
      expect(countSettings()).to.equal(1);
      expect(settings.getPlanProjectionSettings("0x1")!.elevation).to.equal(1);

      settings.setPlanProjectionSettings("0x2", makeSettings({ elevation: 2 }));
      expect(countSettings()).to.equal(2);
      expect(settings.getPlanProjectionSettings("0x2")!.elevation).to.equal(2);

      settings.setPlanProjectionSettings("0x2", makeSettings({ transparency: 0.2 }));
      expect(countSettings()).to.equal(2);
      expect(settings.getPlanProjectionSettings("0x2")!.transparency).to.equal(0.2);
      expect(settings.getPlanProjectionSettings("0x2")!.elevation).to.be.undefined;

      settings.setPlanProjectionSettings("0x3", undefined);
      expect(countSettings()).to.equal(2);

      settings.setPlanProjectionSettings("0x1", undefined);
      expect(countSettings()).to.equal(1);
      expect(settings.getPlanProjectionSettings("0x1")).to.be.undefined;

      settings.setPlanProjectionSettings("0x2", undefined);
      expect(countSettings()).to.equal(0);
      expect(settings.planProjectionSettings).to.be.undefined;
    });
  });

  describe("excluded elements", () => {
    it("synchronizes JSON and in-memory representations", () => {
      const test = (expectedExcludedElements: string | undefined, func: (settings: DisplayStyleSettings) => void) => {
        const settings = new DisplayStyleSettings({});
        func(settings);

        expect(settings.toJSON().excludedElements).to.equal(expectedExcludedElements);
        expect(settings.compressedExcludedElementIds).to.equal(undefined === expectedExcludedElements ? "" : expectedExcludedElements);

        const excludedIds = Array.from(settings.excludedElementIds);
        expect(settings.excludedElements.size).to.equal(excludedIds.length);
        const set = OrderedId64Iterable.sortArray(Array.from(settings.excludedElements));
        expect(set).to.deep.equal(excludedIds);
      };

      test(undefined, (_settings) => undefined);
      test(undefined, (settings) => settings.addExcludedElements([]));

      test("+1", (settings) => settings.addExcludedElements("0x1"));
      test("+1", (settings) => settings.addExcludedElements(["0x1"]));

      test("+2", (settings) => { settings.addExcludedElements(["0x1", "0x2"]); settings.dropExcludedElement("0x1"); });
      test(undefined, (settings) => { settings.addExcludedElements(["0x1", "0x2"]); settings.dropExcludedElements(["0x2", "0x1"]); });

      test("+3", (settings) => settings.excludedElements.add("0x3"));
      test(undefined, (settings) => { settings.excludedElements.add("0x2"); settings.excludedElements.delete("0x2"); });
      test("+2", (settings) => { settings.excludedElements.add("0x1"); settings.excludedElements.add("0x2"); settings.excludedElements.delete("0x1"); });
      test("+1", (settings) => { settings.addExcludedElements(["0x1", "0x2"]); settings.excludedElements.delete("0x2"); });
      test("+2", (settings) => { settings.excludedElements.add("0x1"); settings.addExcludedElements(["0x2", "0x3"]); settings.dropExcludedElement("0x3"); settings.excludedElements.delete("0x1"); });

      test(undefined, (settings) => { settings.addExcludedElements(["0x1", "0x2"]); settings.excludedElements.clear(); });

      test(undefined, (settings) => { settings.addExcludedElements(["0x1", "0x2"]); settings.excludedElements.add("0x3"); settings.clearExcludedElements(); });
    });
  });

  describe("planarClipMasks", () => {
    function makeSettings(priority: number) {
      return PlanarClipMaskSettings.createByPriority(priority);
    }

    function makeProps(priority: number, modelId: Id64String) {
      return {
        ...makeSettings(priority).toJSON(),
        modelId,
      };
    }

    it("initializes from JSON", () => {
      function expectMasks(json: DisplayStylePlanarClipMaskProps[] | undefined, expectedPairs: Array<[Id64String, PlanarClipMaskSettings]>): void {
        const styleProps = json ? { styles: { planarClipOvr: json } } : { };
        const style = new DisplayStyleSettings(styleProps);
        expect(Array.from(style.planarClipMasks)).to.deep.equal(expectedPairs);
      }

      expectMasks(undefined, []);
      expectMasks([], []);

      expectMasks([makeProps(1, "0")], []);
      expectMasks([makeProps(1, "NotAnId")], []);

      expectMasks([{ modelId: "0x1", mode: PlanarClipMaskMode.None }], []);

      expectMasks([makeProps(123, "0x456")], [["0x456", makeSettings(123)]]);
      expectMasks([makeProps(5, "0x1"), makeProps(1, "0x5"), makeProps(3, "0x3")], [["0x1", makeSettings(5)], ["0x5", makeSettings(1)], ["0x3", makeSettings(3)]]);

      expectMasks([makeProps(1, "0x1"), makeProps(2, "0x1")], [["0x1", makeSettings(2)]]);
    });

    it("synchronizes JSON and in-memory representations", () => {
      function expectMasks(initialProps: DisplayStylePlanarClipMaskProps[] | undefined,
        func: (masks: Map<Id64String, PlanarClipMaskSettings>, style: DisplayStyleSettings) => void,
        expectedPairs: Array<[Id64String, PlanarClipMaskSettings]>,
        expectedProps: DisplayStylePlanarClipMaskProps[] | undefined) {
        const styleProps = initialProps ? { styles: { planarClipOvr: initialProps } } : { };
        const style = new DisplayStyleSettings(styleProps);

        func(style.planarClipMasks, style);

        expect(Array.from(style.planarClipMasks)).to.deep.equal(expectedPairs);
        expect(style.toJSON().planarClipOvr).to.deep.equal(expectedProps);
      }

      expectMasks(undefined, (map) => {
        map.set("0x2", makeSettings(2));
        map.set("0x1", makeSettings(1));
        map.set("0x3", makeSettings(3));
      }, [["0x2", makeSettings(2)], ["0x1", makeSettings(1)], ["0x3", makeSettings(3)]],
      [makeProps(2, "0x2"), makeProps(1, "0x1"), makeProps(3, "0x3")]);

      expectMasks([makeProps(1, "0x1")], (map) => map.set("0x1", makeSettings(2)),
        [["0x1", makeSettings(2)]], [makeProps(2, "0x1")]);

      expectMasks([makeProps(1, "0x1"), makeProps(3, "0x3"), makeProps(2, "0x2")], (map) => {
        map.delete("0x2");
        map.delete("0x4");
      }, [["0x1", makeSettings(1)], ["0x3", makeSettings(3)]],
      [makeProps(1, "0x1"), makeProps(3, "0x3")]);

      expectMasks([makeProps(1, "0x1"), makeProps(2, "0x2")], (map) => map.clear(), [], undefined);

      expectMasks([makeProps(1, "0x1"), makeProps(2, "0x2")], (map, style) => {
        style.toJSON().planarClipOvr = [makeProps(4, "0x4")];
        expect(typeof (map as any).populate).to.equal("function");
        (map as any).populate();
      }, [["0x4", makeSettings(4)]], [makeProps(4, "0x4")]);
    });

    it("dispatches events", () => {
      const events: Array<[Id64String, boolean]> = [];
      const style = new DisplayStyleSettings({});
      style.onPlanarClipMaskChanged.addListener((id, newMask) => {
        events.push([id, undefined !== newMask]);
      });

      const map = style.planarClipMasks;
      function expectEvents(expected: Array<[Id64String, boolean]>): void {
        expect(events).to.deep.equal(expected);
        events.length = 0;
      }

      const mask = makeSettings(1);
      map.set("0x1", mask);
      expectEvents([["0x1", true]]);

      map.delete("0x1");
      expectEvents([["0x1", false]]);

      map.set("0x1", mask);
      map.set("0x2", mask);
      expectEvents([["0x1", true], ["0x2", true]]);

      map.clear();
      expectEvents([["0x1", false], ["0x2", false]]);

      map.clear();
      expectEvents([]);
    });
  });
});

describe("DisplayStyleSettings overrides", () => {
  const baseProps: DisplayStyle3dSettingsProps = {
    viewflags: {
      backgroundMap: true,
      acs: true,
      noConstruct: true,
      clipVol: true,
      renderMode: RenderMode.HiddenLine,
    },
    backgroundColor: ColorByName.aquamarine,
    monochromeColor: ColorByName.cyan,
    monochromeMode: MonochromeMode.Scaled,
    environment: {
      sky: {
        display: true,
        twoColor: true,
        skyExponent: 22,
      },
      ground: {
        display: false,
      },
    },
    hline: {
      transThreshold: 0x7f,
      visible: {
        ovrColor: true,
        color: ColorByName.yellow,
        width: 12,
        pattern: LinePixels.Solid,
      },
      hidden: {
        ovrColor: false,
        color: ColorByName.white,
        pattern: LinePixels.HiddenLine,
        width: 8,
      },
    },
    ao: {
      bias: 0.5,
      zLengthCap: 0.25,
      intensity: 1.5,
      blurDelta: 1,
      blurSigma: 2,
      blurTexelStepSize: 3,
      maxDistance: 4,
      texelStepSize: 5,
    },
    solarShadows: {
      color: ColorByName.green,
      bias: 0.2,
    },
    lights: {
      portrait: {
        intensity: 1,
      },
      specularIntensity: 2,
      numCels: 3,
    },
    thematic: {
      displayMode: ThematicDisplayMode.Height,
      axis: [-1, 0, 1],
      range: undefined,
      sensorSettings: undefined,
      sunDirection: [1, 0, -1],
      gradientSettings: {
        mode: 0,
        colorScheme: 0,
        customKeys: [],
        stepCount: 2,
        marginColor: ColorByName.magenta,
        colorMix: 0,
      },
    },
  };

  const mapProps: DisplayStyle3dSettingsProps = {
    backgroundMap: {
      groundBias: 42,
      providerData: {
        mapType: BackgroundMapType.Aerial,
      },
      transparency: 0.5,
      useDepthBuffer: true,
      globeMode: GlobeMode.Plane,
      terrainSettings: {
        exaggeration: 2.5,
        heightOrigin: -42,
        nonLocatable: true, // eslint-disable-line deprecation/deprecation
        heightOriginMode: 0,
      },
    },
  };

  const projectProps: DisplayStyle3dSettingsProps = {
    timePoint: 12345,
    contextRealityModels: [{
      tilesetUrl: "google.com",
      name: "google",
      description: "a popular search engine",
    }],
  };

  const iModelProps: DisplayStyle3dSettingsProps = {
    analysisStyle: {
      inputName: "channel1",
      inputRange: undefined,
      displacementChannelName: "channel2",
      displacementScale: undefined,
      normalChannelName: undefined,
      scalarChannelName: undefined,
      scalarThematicSettings: undefined,
      scalarRange: [1, 5],
    },
    analysisFraction: 0.2,
    scheduleScript: [{
      modelId: "0x321",
      realityModelUrl: "altavista.com",
      elementTimelines: [{
        batchId: 64,
        elementIds: ["0xabc", "0xdef"],
      }],
    }],
    subCategoryOvr: [{
      subCategory: "0x789",
      color: ColorByName.fuchsia,
      invisible: true,
      style: "0xaaa",
      weight: 10,
      transp: 0.5,
    }],
    modelOvr: [{
      modelId: "0x789",
      weight: 10,
      linePixels: 4262526480,
      rgb: { r: 0, g: 255, b: 0 },
      transparency: 0.5,
      nonLocatable: true,
      emphasized: true,
    }],
    excludedElements: CompressedId64Set.compressIds(["0x4", "0x8", "0x10"]),
    contextRealityModels: [{
      tilesetUrl: "google.com",
      name: "google",
      description: "a popular search engine",
      classifiers: [{
        modelId: "0x123",
        expand: 0.5,
        flags: {
          inside: SpatialClassifierInsideDisplay.Off,
          outside: SpatialClassifierOutsideDisplay.Dimmed,
          isVolumeClassifier: true,
        },
        name: "classifier",
        isActive: true,
      }],
    }],
    thematic: {
      displayMode: ThematicDisplayMode.Height,
      gradientSettings: {
        mode: 0,
        stepCount: 2,
        marginColor: ColorByName.magenta,
        colorScheme: 0,
        customKeys: [],
        colorMix: 0,
      },
      axis: [-1, 0, 1],
      sunDirection: [1, 0, -1],
      range: [1, 100],
      sensorSettings: {
        distanceCutoff: 12,
        sensors: [
          { position: [10, 20, 30], value: 0.5 },
        ],
      },
    },
    planProjections: {
      "0x6": { elevation: 4, transparency: 0.5, overlay: true, enforceDisplayPriority: true },
    },
  };

  it("creates selective overrides", () => {
    const settings = new DisplayStyle3dSettings({ styles: { ...baseProps, ...mapProps, ...projectProps, ...iModelProps } });

    const roundTrip = (options: DisplayStyleOverridesOptions, expected: DisplayStyle3dSettingsProps) => {
      const output = settings.toOverrides(options);
      expect(output).to.deep.equal(expected);
    };

    const viewflags = ViewFlags.fromJSON(baseProps.viewflags).toFullyDefinedJSON();

    const vfNoMapNoDec: Partial<typeof viewflags> = { ...viewflags };
    delete vfNoMapNoDec.acs;
    delete vfNoMapNoDec.grid;
    delete vfNoMapNoDec.backgroundMap;

    const vfNoDec = { ...vfNoMapNoDec, backgroundMap: true };
    const vfNoMap = { ...vfNoMapNoDec, acs: true, grid: false };

    roundTrip({ includeAll: true }, { ...settings.toJSON(), viewflags });
    roundTrip({}, { ...baseProps, viewflags: vfNoMapNoDec });
    roundTrip({ includeBackgroundMap: true }, { ...baseProps, ...mapProps, viewflags: vfNoDec });
    roundTrip({ includeDrawingAids: true }, { ...baseProps, viewflags: vfNoMap });
    roundTrip({ includeBackgroundMap: true, includeDrawingAids: true }, { ...baseProps, ...mapProps, viewflags });

    roundTrip({ includeProjectSpecific: true }, { ...baseProps, ...projectProps, viewflags: vfNoMapNoDec });
    roundTrip({ includeIModelSpecific: true }, { ...baseProps, ...projectProps, ...iModelProps, viewflags: vfNoMapNoDec });
    roundTrip({ includeIModelSpecific: true, includeDrawingAids: true, includeBackgroundMap: true }, { ...baseProps, ...mapProps, ...projectProps, ...iModelProps, viewflags });
  });

  it("overrides selected settings", () => {
    const test = (overrides: DisplayStyle3dSettingsProps) => {
      const settings = new DisplayStyle3dSettings({ styles: { ...baseProps, ...mapProps, ...projectProps, ...iModelProps } });
      const originalSettings = { ...settings.toJSON() };
      settings.applyOverrides(overrides);
      const output = settings.toJSON();

      for (const key of Object.keys(overrides) as Array<keyof DisplayStyle3dSettingsProps>)
        expect(output[key]).to.deep.equal(overrides[key]);

      for (const key of Object.keys(output) as Array<keyof DisplayStyle3dSettingsProps>)
        if (undefined === overrides[key])
          expect(output[key]).to.deep.equal(originalSettings[key]);
    };

    const viewflags = baseProps.viewflags;
    test({ viewflags: { ...viewflags, renderMode: RenderMode.SolidFill } });
    test({ viewflags, backgroundColor: ColorByName.honeydew });
    test({ viewflags, monochromeColor: ColorByName.hotPink });
    test({ viewflags, monochromeMode: MonochromeMode.Flat });
    test({
      viewflags,
      analysisStyle: {
        inputName: undefined,
        inputRange: [2, 4],
        displacementChannelName: "displacement",
        displacementScale: 2.5,
        normalChannelName: "normal",
        scalarChannelName: undefined,
        scalarThematicSettings: undefined,
        scalarRange: undefined,
      },
      analysisFraction: 0.8,
    });

    test({
      viewflags,
      timePoint: 87654321,
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
      viewflags,
      subCategoryOvr: [{
        subCategory: "0x987",
        color: ColorByName.brown,
        invisible: false,
        style: "0xbbb",
        weight: 20,
        transp: 0.7,
      }],
    });

    test({
      viewflags,
      modelOvr: [{
        modelId: "0x789",
        weight: 10,
        linePixels: 4262526480,
        rgb: { r: 0, g: 255, b: 0 },
        transparency: 0.5,
        nonLocatable: true,
        emphasized: true,
      }],
    });

    test({
      viewflags,
      backgroundMap: {
        groundBias: 84,
        providerData: { mapType: BackgroundMapType.Street },
        applyTerrain: true,
        terrainSettings: { exaggeration: 0.5, heightOriginMode: 1 },
      },
    });

    test({
      viewflags,
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
      }],
    });

    test({ viewflags, excludedElements: CompressedId64Set.compressIds(["0xbaadf00d", "0xdeadbeef"]) });

    test({
      viewflags,
      environment: {
        sky: { display: false },
        ground: { display: true, elevation: 17, aboveColor: ColorByName.snow },
      },
    });

    test({
      viewflags,
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
          colorMix: 0.5,
        },
      },
    });

    test({
      viewflags,
      hline: {
        transThreshold: 0x4f,
        visible: {
          ovrColor: true,
          color: ColorByName.green,
          width: 2,
          pattern: LinePixels.Solid,
        },
        hidden: {
          ovrColor: false,
          color: ColorByName.white,
          width: 1,
          pattern: LinePixels.Solid,
        },
      },
    });

    test({
      viewflags,
      ao: {
        bias: 1.5,
        zLengthCap: 1.25,
        intensity: 0.5,
        blurDelta: 1.5,
        blurSigma: 2.5,
        blurTexelStepSize: 3.5,
        maxDistance: 4.5,
        texelStepSize: 5.5,
      },
    });

    test({ viewflags, solarShadows: { bias: 0.4, color: ColorByName.blue } });

    test({
      viewflags,
      lights: {
        numCels: 2,
        solar: { intensity: 4, alwaysEnabled: true },
        ambient: { intensity: 2, color: { r: 12, g: 24, b: 48 } },
      },
    });

    test({
      viewflags,
      planProjections: {
        "0x8": { elevation: 2, transparency: 0.25, overlay: true, enforceDisplayPriority: true },
      },
    });
  });
});
