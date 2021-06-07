/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import {
  ContextRealityModel, ContextRealityModelProps, ContextRealityModels, ContextRealityModelsContainer,
} from "../ContextRealityModel";
import { SpatialClassifier, SpatialClassifierInsideDisplay, SpatialClassifierOutsideDisplay } from "../SpatialClassification";
import { PlanarClipMaskMode, PlanarClipMaskSettings } from "../PlanarClipMask";
import { FeatureAppearance } from "../FeatureSymbology";

describe("ContextRealityModel", () => {
  function makeModel(props: ContextRealityModelProps): ContextRealityModel {
    return new ContextRealityModel(props);
  }

  function expectProps(actual: ContextRealityModelProps, expected: ContextRealityModelProps): void {
    expect(actual).to.deep.equal(expected);
  }

  it("initializes from JSON", () => {
    let m = makeModel({ tilesetUrl: "a" });
    expect(m.url).to.equal("a");
    expect(m.name).to.equal("");
    expect(m.realityDataId).to.be.undefined;
    expect(m.description).to.equal("");
    expect(m.orbitGtBlob).to.be.undefined;
    expect(m.classifiers).to.be.undefined;
    expect(m.appearanceOverrides).to.be.undefined;
    expect(m.planarClipMaskSettings).to.be.undefined;

    m = makeModel({
      tilesetUrl: "b",
      name: "c",
      description: "d",
      realityDataId: "e",
      appearanceOverrides: { transparency: 0.5 },
      classifiers: [{
        modelId: "0x1", expand: 2, name: "3", flags: {
          inside: SpatialClassifierInsideDisplay.On, outside: SpatialClassifierOutsideDisplay.Off,
        },
      }],
      orbitGtBlob: {
        containerName: "container", blobFileName: "blob", sasToken: "token", accountName: "account",
      },
      planarClipMask: { mode: PlanarClipMaskMode.Priority },
    });
    expect(m.url).to.equal("b");
    expect(m.name).to.equal("c");
    expect(m.description).to.equal("d");
    expect(m.realityDataId).to.equal("e");
    expect(m.appearanceOverrides).not.to.be.undefined;
    expect(m.classifiers).not.to.be.undefined;
    expect(m.orbitGtBlob).not.to.be.undefined;
    expect(m.planarClipMaskSettings).not.to.be.undefined;
  });

  it("synchronizes JSON", () => {
    const initialProps = {
      tilesetUrl: "a",
      planarClipMask: { mode: PlanarClipMaskMode.Priority, priority: 321 },
      appearanceOverrides: { transparency: 0.5 },
      classifiers: [{
        modelId: "0x1", expand: 2, name: "3", flags: {
          inside: SpatialClassifierInsideDisplay.On, outside: SpatialClassifierOutsideDisplay.Off,
        },
      }],
    };

    let props = ContextRealityModelProps.clone(initialProps);
    let model = makeModel(props);
    model.planarClipMaskSettings = undefined;
    model.appearanceOverrides = undefined;
    model.classifiers!.clear();

    expectProps(props, { tilesetUrl: "a", classifiers: undefined });

    props = ContextRealityModelProps.clone(initialProps);
    model = makeModel(props);
    model.appearanceOverrides = FeatureAppearance.fromJSON({ weight: 5 });
    model.classifiers!.add(new SpatialClassifier("0x123", "new"));
    model.planarClipMaskSettings = PlanarClipMaskSettings.createByPriority(123);

    expectProps(props, {
      tilesetUrl: "a",
      planarClipMask: { mode: PlanarClipMaskMode.Priority, priority: 123 },
      appearanceOverrides: { weight: 5 },
      classifiers: [{
        modelId: "0x1", expand: 2, name: "3", flags: {
          inside: SpatialClassifierInsideDisplay.On, outside: SpatialClassifierOutsideDisplay.Off,
        },
      }, {
        modelId: "0x123", name: "new", expand: 0, isActive: false, flags: {
          inside: SpatialClassifierInsideDisplay.ElementColor, outside: SpatialClassifierOutsideDisplay.Dimmed,
        },
      }],
    });
  });

  it("defaults tilesetUrl to empty string", () => {
    const m = makeModel({ } as unknown as ContextRealityModelProps);
    expect(m.url).to.equal("");
  });

  it("normalizes JSON when cloning", () => {
    const props: ContextRealityModelProps = {
      tilesetUrl: "a", name: "", description: undefined, realityDataId: "", appearanceOverrides: undefined,
      classifiers: undefined, orbitGtBlob: undefined, planarClipMask: undefined,
    };
    (props as any).tilesetUrl = undefined;

    const clone = ContextRealityModelProps.clone(props);
    expectProps(clone, { tilesetUrl: "" });
  });

  it("clones deeply", () => {
    const props = {
      tilesetUrl: "b",
      name: "c",
      description: "d",
      realityDataId: "e",
      appearanceOverrides: { rgb: { r: 1, g: 2, b: 3 } },
      classifiers: [{
        modelId: "0x1", expand: 2, name: "3", flags: {
          inside: SpatialClassifierInsideDisplay.On, outside: SpatialClassifierOutsideDisplay.Off,
        },
      }],
      orbitGtBlob: {
        containerName: "container", blobFileName: "blob", sasToken: "token", accountName: "account",
      },
      planarClipMask: { mode: PlanarClipMaskMode.Priority },
    };

    const clone = ContextRealityModelProps.clone(props);
    expect(clone).to.deep.equal(props);
    expect(clone).not.to.equal(props);

    expect(clone.orbitGtBlob).not.to.equal(props.orbitGtBlob);
    expect(clone.planarClipMask).not.to.equal(props.planarClipMask);

    expect(clone.appearanceOverrides).not.to.equal(props.appearanceOverrides);
    expect(clone.appearanceOverrides!.rgb).not.to.equal(props.appearanceOverrides.rgb);

    expect(clone.classifiers).not.to.equal(props.classifiers);
    expect(clone.classifiers![0]).not.to.equal(props.classifiers[0]);
    expect(clone.classifiers![0].flags).not.to.equal(props.classifiers[0].flags);
  });

  it("dispatches events", () => {
    let mask: PlanarClipMaskSettings | undefined;
    let app: FeatureAppearance | undefined;

    const model = makeModel({ tilesetUrl: "a" });
    model.onPlanarClipMaskChanged.addListener((x, m) => { expect(m).to.equal(model); mask = x; });
    model.onAppearanceOverridesChanged.addListener((x, m) => { expect(m).to.equal(model); app = x; });

    const newMask = model.planarClipMaskSettings = PlanarClipMaskSettings.createByPriority(1234);
    expect(mask).to.equal(newMask);
    expect(model.planarClipMaskSettings).to.equal(newMask);

    model.planarClipMaskSettings = undefined;
    expect(mask).to.be.undefined;
    expect(model.planarClipMaskSettings).to.be.undefined;

    const newApp = model.appearanceOverrides = FeatureAppearance.fromJSON({ weight: 2 });
    expect(app).to.equal(newApp);
    expect(model.appearanceOverrides).to.equal(newApp);

    model.appearanceOverrides = undefined;
    expect(app).to.be.undefined;
    expect(model.appearanceOverrides).to.be.undefined;
  });
});

describe("ContextRealityModels", () => {
  function expectProps(actual: ContextRealityModelProps[] | undefined, expected: ContextRealityModelProps[] | undefined) {
    expect(actual).to.deep.equal(expected);
  }

  it("populates from JSON", () => {
    expect(new ContextRealityModels({}).models.length).to.equal(0);

    const props = { contextRealityModels: [
      { tilesetUrl: "a" },
      { tilesetUrl: "b", name: "bb" },
      { tilesetUrl: "c", description: "ccc" },
    ]};

    const models = new ContextRealityModels(props).models;
    expect(models.length).to.equal(3);
    expectProps(models.map((x) => x.toJSON()), props.contextRealityModels);
  });

  it("adds models", () => {
    const container: ContextRealityModelsContainer = { };
    const models = new ContextRealityModels(container);
    expect(models.models.length).to.equal(0);
    expect(container.contextRealityModels).to.be.undefined;

    const m0 = models.add({ tilesetUrl: "a" });
    expect(models.models.length).to.equal(1);
    expect(container.contextRealityModels).not.to.be.undefined;
    expect(container.contextRealityModels!.length).to.equal(1);
    expect(models.models[0]).to.equal(m0);

    const m1 = models.add({ tilesetUrl: "b", name: "bb", description: "bbb" });
    expect(models.models.length).to.equal(2);
    expect(models.models[1]).to.equal(m1);

    expectProps(container.contextRealityModels, [{
      tilesetUrl: "a",
    }, {
      tilesetUrl: "b", name: "bb", description: "bbb",
    }]);
  });

  it("deletes models", () => {
    const container = { contextRealityModels: [
      { tilesetUrl: "a" }, { tilesetUrl: "b" }, { tilesetUrl: "c" },
    ]};

    const models = new ContextRealityModels(container);
    expect(models.models.length).to.equal(3);
    const model = new ContextRealityModel({ tilesetUrl: "a" });
    expect(models.delete(model)).to.be.false;
    expect(models.models.length).to.equal(3);

    const a = models.models[0];
    const b = models.models[1];
    const c = models.models[2];

    expect(models.delete(b)).to.be.true;
    expect(models.models.length).to.equal(2);
    expect(models.models.indexOf(b)).to.equal(-1);
    expectProps(container.contextRealityModels, [ {tilesetUrl: "a"}, {tilesetUrl: "c"} ]);
    expect(models.delete(b)).to.be.false;

    expect(models.delete(c)).to.be.true;
    expect(models.models.length).to.equal(1);
    expect(models.models.indexOf(c)).to.equal(-1);
    expectProps(container.contextRealityModels, [ {tilesetUrl: "a"} ]);
    expect(models.delete(c)).to.be.false;

    expect(models.delete(a)).to.be.true;
    expect(models.models.length).to.equal(0);
    expectProps(container.contextRealityModels, undefined);

    models.add({ tilesetUrl: "d" });
    expectProps(container.contextRealityModels, [{ tilesetUrl: "d" }]);
  });

  it("clears", () => {
    const container = { contextRealityModels: [{ tilesetUrl: "a" }, { tilesetUrl: "b" }] };
    const models = new ContextRealityModels(container);
    expect(models.models.length).to.equal(2);

    models.clear();
    expect(models.models.length).to.equal(0);
    expect(container.contextRealityModels).to.be.undefined;
  });

  it("replaces models", () => {
    const container = { contextRealityModels: [{ tilesetUrl: "a" }, { tilesetUrl: "b" }] };
    const models = new ContextRealityModels(container);

    const a = models.models[0];
    const a1 = models.replace(a, { tilesetUrl: "aa", name: "newA" });
    expect(models.models.indexOf(a)).to.equal(-1);
    expect(models.models.indexOf(a1)).to.equal(0);
    expect(models.models.length).to.equal(2);
    expectProps(container.contextRealityModels, [{ tilesetUrl: "aa", name: "newA" }, { tilesetUrl: "b" }]);

    expect(() => models.replace(a, { tilesetUrl: "aaa" })).to.throw(Error);

    const b = models.models[1];
    expect(models.replace(b, { tilesetUrl: "b" })).not.to.equal(b);
    expect(models.models.indexOf(b)).to.equal(-1);
    expectProps(container.contextRealityModels, [{ tilesetUrl: "aa", name: "newA" }, { tilesetUrl: "b" }]);
  });

  it("updates models", () => {
    const container = { contextRealityModels: [{tilesetUrl: "a"}, {tilesetUrl: "b"}] };
    const models = new ContextRealityModels(container);

    const a = models.models[0];
    const a1 = models.update(a, { name: "aa", description: "aaa" });
    expect(models.models.indexOf(a)).to.equal(-1);
    expect(models.models.indexOf(a1)).to.equal(0);
    expectProps(container.contextRealityModels, [{tilesetUrl: "a", name: "aa", description: "aaa"}, {tilesetUrl: "b"}]);

    expect(() => models.update(a, { name: "aaaa" })).to.throw(Error);

    const a2 = models.update(a1, { tilesetUrl: "a2", name: undefined });
    expect(a2.url).to.equal("a2");
    expect(a2.name).to.be.equal("");
    expect(a2.description).to.equal("aaa");
    expectProps(container.contextRealityModels, [{tilesetUrl: "a2", description: "aaa"}, {tilesetUrl: "b"}]);

    const a3 = models.update(a2, {tilesetUrl: undefined});
    expect(a3.url).to.equal("a2");
    expectProps(container.contextRealityModels, [{tilesetUrl: "a2", description: "aaa"}, {tilesetUrl: "b"}]);
  });

  it("instantiates correct type", () => {
    class MyRealityModel extends ContextRealityModel { }

    const container = { contextRealityModels: [{ tilesetUrl: "a" }] };
    let models = new ContextRealityModels(container);
    expect(models.models.length).to.equal(1);
    for (const model of models.models) {
      expect(model instanceof ContextRealityModel).to.be.true;
      expect(model instanceof MyRealityModel).to.be.false;
    }

    models = new ContextRealityModels(container, (props) => new MyRealityModel(props));
    models.add({ tilesetUrl: "b" });
    models.add({ tilesetUrl: "c" });
    models.update(models.models[2], { name: "cc" });
    models.add({ tilesetUrl: "d" });
    models.replace(models.models[3], { tilesetUrl: "dd" });

    expect(models.models.length).to.equal(4);
    for (const model of models.models) {
      expect(model instanceof ContextRealityModel).to.be.true;
      expect(model instanceof MyRealityModel).to.be.true;
    }
  });

  describe("onChanged events", () => {
    it("are dispatched when list changes", () => {
      type ModelEvent = [string, "add" | "delete" | "update"];
      const events: ModelEvent[] = [];

      const models = new ContextRealityModels({ contextRealityModels: [{tilesetUrl: "a"}] });
      models.onChanged.addListener((prev, cur) => {
        expect(undefined !== prev || undefined !== cur).to.be.true;
        if (prev)
          expect(models.models.indexOf(prev)).not.to.equal(-1);

        if (cur)
          expect(models.models.indexOf(cur)).to.equal(-1);

        const model = prev ?? cur!;
        events.push([model.url, prev ? (cur ? "update" : "delete") : "add"]);
      });

      models.add({tilesetUrl: "b"});
      models.update(models.models[0], {name: "aa"});
      models.replace(models.models[1], {tilesetUrl: "bb"});
      models.delete(models.models[0]);
      models.clear();

      expect(events).to.deep.equal([
        ["b", "add"],
        ["a", "update"],
        ["b", "update"],
        ["a", "delete"],
        ["bb", "delete"],
      ]);
    });
  });

  describe("model changed events", () => {
    type ModelChangeEvent = [string, "mask" | "appearance"];
    const events: ModelChangeEvent[] = [];
    let models: ContextRealityModels;

    beforeEach(() => {
      events.length = 0;
      models = new ContextRealityModels({ contextRealityModels: [{tilesetUrl: "a"}, {tilesetUrl: "b"}] });
      models.onPlanarClipMaskChanged.addListener((model) => events.push([model.url, "mask"]));
      models.onAppearanceOverridesChanged.addListener((model) => events.push([model.url, "appearance"]));
    });

    function expectEvents(expected: ModelChangeEvent[]): void {
      expect(events).to.deep.equal(expected);
      events.length = 0;
    }

    it("are dispatched when clip mask or appearance is changed", () => {
      models.models[0].planarClipMaskSettings = PlanarClipMaskSettings.createByPriority(1);
      models.models[1].appearanceOverrides = FeatureAppearance.fromJSON({ weight: 1 });
      models.models[1].planarClipMaskSettings = PlanarClipMaskSettings.createByPriority(2);
      models.models[0].appearanceOverrides = undefined;

      expectEvents([
        [ "a", "mask" ],
        [ "b", "appearance" ],
        [ "b", "mask" ],
        [ "a", "appearance" ],
      ]);
    });

    it("are not dispatched after delete or clear", () => {
      const m0 = models.models[0];
      const m1 = models.models[1];

      m0.planarClipMaskSettings = PlanarClipMaskSettings.createByPriority(1);
      models.delete(m0);
      m0.planarClipMaskSettings = PlanarClipMaskSettings.createByPriority(2);

      m1.appearanceOverrides = FeatureAppearance.fromJSON({ weight: 1 });
      models.clear();
      m1.appearanceOverrides = FeatureAppearance.fromJSON({ weight: 2 });

      expectEvents([
        [ "a", "mask" ],
        [ "b", "appearance" ],
      ]);
    });

    it("are dispatched for newly-added models", () => {
      const m0 = models.replace(models.models[0], { tilesetUrl: "aa" });
      const m1 = models.update(models.models[1], { name: "bb" });
      const m2 = models.add({ tilesetUrl: "c" });

      m0.appearanceOverrides = undefined;
      m1.appearanceOverrides = FeatureAppearance.fromJSON({ weight: 3 });
      m2.planarClipMaskSettings = undefined;
      expectEvents([
        [ "aa", "appearance" ],
        [ "b", "appearance" ],
        [ "c", "mask" ],
      ]);
    });
  });
});
