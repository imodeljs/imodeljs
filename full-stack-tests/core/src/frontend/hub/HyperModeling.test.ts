/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Point3d } from "@bentley/geometry-core";
import { SectionType } from "@bentley/imodeljs-common";
import {
  CheckpointConnection, IModelApp, IModelConnection, ParseAndRunResult, SnapshotConnection,
} from "@bentley/imodeljs-frontend";
import {
  HyperModeling, HyperModelingDecorator, SectionDrawingLocationState, SectionMarker, SectionMarkerConfig, SectionMarkerHandler,
} from "@bentley/hypermodeling-frontend";
import { TestUsers } from "@bentley/oidc-signin-tool/lib/TestUsers";
import { TestUtility } from "./TestUtility";
import { testOnScreenViewport } from "../TestViewport";
import { ProcessDetector } from "@bentley/bentleyjs-core";

describe("HyperModeling (#integration)", () => {
  let imodel: IModelConnection; // An iModel containing no section drawing locations
  let hypermodel: IModelConnection; // An iModel containing 3 section drawing locations

  before(async () => {
    await IModelApp.startup({
      authorizationClient: await TestUtility.initializeTestProject(TestUtility.testContextName, TestUsers.regular),
      imodelClient: TestUtility.imodelCloudEnv.imodelClient,
      applicationVersion: "1.2.1.1",
    });

    await HyperModeling.initialize();
    imodel = await SnapshotConnection.openFile(TestUtility.testSnapshotIModels.mirukuru);

    const testContextId = await TestUtility.queryContextIdByName(TestUtility.testContextName);
    const testIModelId = await TestUtility.queryIModelIdbyName(testContextId, TestUtility.testIModelNames.sectionDrawingLocations);

    hypermodel = await CheckpointConnection.openRemote(testContextId, testIModelId);
  });

  after(async () => {
    if (imodel)
      await imodel.close();

    if (hypermodel)
      await hypermodel.close();

    await IModelApp.shutdown();
  });

  it("determines if hypermodeling is supported for a given iModel", async () => {
    expect(await HyperModeling.isSupportedForIModel(imodel)).to.be.false;
    expect(await HyperModeling.isSupportedForIModel(hypermodel)).to.be.true;
  });

  it("queries all section locations", async () => {
    let states = await SectionDrawingLocationState.queryAll(imodel);
    expect(states.length).to.equal(0);

    states = await SectionDrawingLocationState.queryAll(hypermodel);
    expect(states.length).to.equal(3);

    const expectedStates = [
      {
        id: "0xa7",
        type: SectionType.Plan,
        label: "Plan",
        origin: Point3d.create(0.3050, 1.4094, 4.1873),
        sectionViewId: "0x99",
        spatialViewId: "0x78",
        viewAttachmentId: "0x9c",
      },
      {
        id: "0xa8",
        type: SectionType.Elevation,
        label: "Elevation",
        origin: Point3d.create(1.5917, 2.4411, -0.2803),
        sectionViewId: "0xa3",
        spatialViewId: "0x7c",
        viewAttachmentId: "0xa6",
      },
      {
        id: "0xa9",
        type: SectionType.Section,
        label: "Section",
        origin: Point3d.create(3.2358, 1.4094, 8.3745),
        sectionViewId: "0x8f",
        spatialViewId: "0x80",
        viewAttachmentId: undefined,
      },
    ];

    for (const expected of expectedStates) {
      const actual = states.find((state) =>
        state.id === expected.id && state.sectionType === expected.type && state.userLabel === expected.label &&
        state.placement.origin.isAlmostEqual(expected.origin, 0.001) && state.drawingViewId === expected.sectionViewId &&
        state.spatialViewId === expected.spatialViewId && state.viewAttachment?.id === expected.viewAttachmentId)!;

      expect(actual).not.to.be.undefined;
      expect(await actual.tryLoadDrawingView()).not.to.be.undefined;
      expect(await actual.tryLoadSpatialView()).not.to.be.undefined;
      expect(undefined === await actual.tryLoadSheetView()).to.equal(undefined === expected.viewAttachmentId);
    }
  });

  it("does not register decorator if no section drawing locations are present", async () => {
    await testOnScreenViewport("0x24", imodel, 100, 100, async (vp) => {
      const decorator = await HyperModeling.startOrStop(vp, true);
      expect(decorator).to.be.undefined;
      expect(HyperModelingDecorator.getForViewport(vp)).to.be.undefined;
    });
  });

  it("toggles decorator", async () => {
    await testOnScreenViewport("0x80", hypermodel, 100, 100, async (vp) => {
      let decorator = await HyperModeling.startOrStop(vp, true);
      expect(HyperModelingDecorator.getForViewport(vp)).not.to.be.undefined;
      expect(HyperModelingDecorator.getForViewport(vp)).to.equal(decorator);
      decorator = await HyperModeling.startOrStop(vp, false);
      expect(HyperModelingDecorator.getForViewport(vp)).to.be.undefined;
      expect(HyperModelingDecorator.getForViewport(vp)).to.equal(decorator);
      decorator = await HyperModeling.startOrStop(vp);
      expect(HyperModelingDecorator.getForViewport(vp)).not.to.be.undefined;
      expect(HyperModelingDecorator.getForViewport(vp)).to.equal(decorator);
      decorator = await HyperModeling.startOrStop(vp);
      expect(HyperModelingDecorator.getForViewport(vp)).to.be.undefined;
      expect(HyperModelingDecorator.getForViewport(vp)).to.equal(decorator);
    });
  });

  it("toggles 2d graphics", async () => {
    await testOnScreenViewport("0x80", hypermodel, 100, 100, async (vp) => {
      const dec = (await HyperModeling.startOrStop(vp, true))!;
      const markers = Array.from(dec.markers.markers);
      expect(markers.length).to.equal(3);

      const countTileTrees = () => {
        let count = 0;
        vp.forEachTileTreeRef((_) => ++count);
        return count;
      };

      expect(countTileTrees()).to.equal(1);

      let marker = markers.find((x) => undefined !== x.state.viewAttachment)!;
      await dec.toggleSection(marker, true);
      expect(countTileTrees()).to.equal(3);
      await dec.toggleSection(marker, false);
      expect(countTileTrees()).to.equal(1);

      marker = markers.find((x) => undefined === x.state.viewAttachment)!;
      await dec.toggleSection(marker, true);
      expect(countTileTrees()).to.equal(2);

      await dec.toggleSection(marker, true);
      expect(countTileTrees()).to.equal(2);

      await dec.toggleSection(marker, false);
      expect(countTileTrees()).to.equal(1);

      await dec.toggleSection(marker, false);
      expect(countTileTrees()).to.equal(1);
    });
  });

  function expectMarkerConfig(actual: SectionMarkerConfig, expected: SectionMarkerConfig): void {
    expect(true === actual.ignoreModelSelector).to.equal(true === expected.ignoreModelSelector);
    expect(true === actual.ignoreCategorySelector).to.equal(true === expected.ignoreCategorySelector);
    if (undefined === expected.hiddenSectionTypes)
      expect(undefined === actual.hiddenSectionTypes || 0 === actual.hiddenSectionTypes.length).to.be.true;
    else
      expect(actual.hiddenSectionTypes).to.deep.equal(expected.hiddenSectionTypes);
  }

  it("uses global marker display config for new decorators", async () => {
    let dec1: HyperModelingDecorator | undefined;
    let dec2: HyperModelingDecorator | undefined;
    let dec3: HyperModelingDecorator | undefined;
    let dec4: HyperModelingDecorator | undefined;
    await testOnScreenViewport("0x80", hypermodel, 100, 100, async (vp) => {
      dec1 = await HyperModeling.startOrStop(vp, true);
    });
    await testOnScreenViewport("0x80", hypermodel, 100, 100, async (vp) => {
      HyperModeling.updateConfiguration({ markers: { ignoreModelSelector: true } });
      dec2 = await HyperModeling.startOrStop(vp, true);
    });
    await testOnScreenViewport("0x80", hypermodel, 100, 100, async (vp) => {
      HyperModeling.updateConfiguration({ markers: { hiddenSectionTypes: [SectionType.Plan] } });
      dec3 = await HyperModeling.startOrStop(vp, true);
    });
    await testOnScreenViewport("0x80", hypermodel, 100, 100, async (vp) => {
      HyperModeling.replaceConfiguration({ markers: { ignoreCategorySelector: true } });
      dec4 = await HyperModeling.startOrStop(vp, true);
    });

    expect(dec1).not.to.be.undefined;
    expectMarkerConfig(dec1!.config, {});

    expect(dec2).not.to.be.undefined;
    expectMarkerConfig(dec2!.config, { ignoreModelSelector: true });

    expect(dec3).not.to.be.undefined;
    expectMarkerConfig(dec3!.config, { ignoreModelSelector: true, hiddenSectionTypes: [SectionType.Plan] });

    expect(dec4).not.to.be.undefined;
    expectMarkerConfig(dec4!.config, { ignoreCategorySelector: true });

    // Reset for subsequent tests.
    HyperModeling.replaceConfiguration();
  });

  it("adjusts marker display via key-in", async function () {
    if (ProcessDetector.isElectronAppFrontend) {
      // The electron version fails to find/parse the hypermodeling package's JSON file containing its keyins.
      // The browser version has no such problem.
      // It works fine in a real electron app.
      this.skip();
    }

    await testOnScreenViewport("0x80", hypermodel, 100, 100, async (vp) => {
      const dec = (await HyperModeling.startOrStop(vp, true))!;
      expect(dec).not.to.be.undefined;

      const test = (keyin: string, config: SectionMarkerConfig) => {
        expect(IModelApp.tools.parseAndRun(keyin)).to.equal(ParseAndRunResult.Success);
        expectMarkerConfig(dec.config, config);
      };

      test("hypermodeling marker config model=0", { ignoreModelSelector: true });
      test("hypermodeling marker config cat=0", { ignoreModelSelector: true, ignoreCategorySelector: true });
      test("hypermodeling marker config m=1 c=1", { ignoreModelSelector: false, ignoreCategorySelector: false });
      test("hypermodeling marker config", {});
      test("hypermodeling marker config hidden=pe", { hiddenSectionTypes: [SectionType.Plan, SectionType.Elevation] });
      test("hypermodeling marker config h=abc123s#@!zyx", { hiddenSectionTypes: [SectionType.Section] });
      test("hypermodeling marker config", {});
    });
  });

  it("updates marker visibility", async () => {
    await testOnScreenViewport("0x80", hypermodel, 100, 100, async (vp) => {
      const dec = (await HyperModeling.startOrStop(vp, true))!;
      expect(dec.markers.markers.size).to.equal(3);

      // Synchronization happens in a requestAnimationFrame by default. Lose the asynchronicity for more straightforward testing.
      // Note we must also invoke Viewport.renderFrame() to dispatch the model/category selector changed events.
      dec.syncImmediately = true;

      // Activating/deactivating markers is a no-op
      class Handler extends SectionMarkerHandler {
        public override async activateMarker(_marker: SectionMarker, _decorator: HyperModelingDecorator) { return true; }
        public override async deactivateMarker(_marker: SectionMarker, _decorator: HyperModelingDecorator) { }
      }

      HyperModeling.updateConfiguration({ markerHandler: new Handler() });

      // Add some fake SectionMarkers belonging to different models/categories
      let firstMarker: SectionMarker | undefined;
      for (const marker of dec.markers.markers) {
        firstMarker = marker;
        break;
      }

      expect(firstMarker).not.to.be.undefined;
      const cloneMarker = (type: SectionType, categoryId?: string, model?: string) => {
        const state = firstMarker!.state;
        const props = {
          sectionType: type,
          drawingToSpatialTransform: JSON.stringify(state.drawingToSpatialTransform.toJSON()),
          spatialViewId: state.spatialViewId,
          sectionLocationId: hypermodel.transientIds.next,
          sectionLocationModelId: model ?? state.model,
          sectionViewId: state.drawingViewId,
          categoryId: categoryId ?? state.category,
          userLabel: state.userLabel,
        };

        return new SectionMarker(new SectionDrawingLocationState(props, hypermodel));
      };

      dec.markers.markers.add(cloneMarker(SectionType.Plan, "mycat"));
      dec.markers.markers.add(cloneMarker(SectionType.Elevation, undefined, "mymod"));
      dec.markers.markers.add(cloneMarker(SectionType.Section, "mycat", "mymod"));

      const modelId = firstMarker!.state.model;
      const catId = firstMarker!.state.category;

      const test = (expectedNumVisible: number, visibilityPredicate: (mkr: SectionMarker) => boolean) => {
        let numVisible = 0;
        for (const marker of dec.markers.markers)
          if (marker.visible)
            ++numVisible;

        expect(numVisible).to.equal(expectedNumVisible);
        for (const marker of dec.markers.markers)
          expect(marker.visible).to.equal(visibilityPredicate(marker));
      };

      dec.requestSync();
      test(3, (m) => m.state.model !== "mymod" && m.state.category !== "mycat");

      vp.changeModelDisplay("mymod", true);
      vp.renderFrame();
      test(4, (m) => m.state.category !== "mycat");

      vp.changeCategoryDisplay("mycat", true);
      vp.renderFrame();
      test(6, (_) => true);

      vp.changeModelDisplay(modelId, false);
      vp.renderFrame();
      test(2, (m) => m.state.model === "mymod");

      vp.changeCategoryDisplay(catId, false);
      vp.renderFrame();
      test(1, (m) => m.state.model === "mymod" && m.state.category === "mycat");

      dec.replaceConfiguration({ ignoreModelSelector: true });
      test(2, (m) => m.state.category === "mycat");

      dec.replaceConfiguration({ ignoreCategorySelector: true });
      test(2, (m) => m.state.model === "mymod");

      dec.updateConfiguration({ ignoreModelSelector: true });
      test(6, (_) => true);

      dec.updateConfiguration({ hiddenSectionTypes: [SectionType.Plan] });
      test(4, (m) => m.state.sectionType !== SectionType.Plan);

      await dec.setActiveMarker(firstMarker);
      test(1, (m) => m === firstMarker);

      dec.replaceConfiguration({ hiddenSectionTypes: [firstMarker!.state.sectionType] });
      vp.changeModelDisplay(["mymod", modelId], false);
      vp.changeCategoryDisplay(["mycat", catId], false);
      vp.renderFrame();
      test(1, (m) => m === firstMarker);

      await dec.setActiveMarker(undefined);
      test(0, (_) => false);

      // Reset for subsequent tests.
      HyperModeling.replaceConfiguration();
    });
  });

  it("customizes marker visibility", async () => {
    await testOnScreenViewport("0x80", hypermodel, 100, 100, async (vp) => {
      const dec = (await HyperModeling.startOrStop(vp, true))!;
      expect(dec.markers.markers.size).to.equal(3);
      let firstMarker: SectionMarker | undefined;
      for (const entry of dec.markers.markers) {
        if (firstMarker)
          dec.markers.markers.delete(entry);
        else
          firstMarker = entry;
      }

      expect(dec.markers.markers.size).to.equal(1);
      expect(firstMarker).not.to.be.undefined;
      const marker = firstMarker!;

      class Handler extends SectionMarkerHandler {
        public static visible = true;

        public override async activateMarker(_marker: SectionMarker, _decorator: HyperModelingDecorator) { return true; }
        public override async deactivateMarker(_marker: SectionMarker, _decorator: HyperModelingDecorator) { }
        public override isMarkerVisible(_marker: SectionMarker, _dec: HyperModelingDecorator, _config: SectionMarkerConfig): boolean {
          return super.isMarkerVisible(_marker, _dec, _config) && Handler.visible;
        }
      }

      dec.syncImmediately = true;
      HyperModeling.updateConfiguration({ markerHandler: new Handler() });

      const expectVisible = (visible: boolean) => expect(marker.visible).to.equal(visible);
      expectVisible(true);

      const model = marker.state.model;
      vp.changeModelDisplay(model, false);
      dec.requestSync();
      expectVisible(false);

      const cat = marker.state.category;
      vp.changeCategoryDisplay(cat, false);
      dec.requestSync();
      expectVisible(false);

      vp.changeModelDisplay(model, true);
      dec.requestSync();
      expectVisible(false);

      vp.changeModelDisplay(model, false);
      dec.updateConfiguration({ ignoreModelSelector: true, ignoreCategorySelector: true });
      dec.requestSync();
      expectVisible(true);

      dec.updateConfiguration({ hiddenSectionTypes: [marker.state.sectionType] });
      dec.requestSync();
      expectVisible(false);

      dec.updateConfiguration({ hiddenSectionTypes: [] });
      dec.requestSync();
      expectVisible(true);

      Handler.visible = false;
      expectVisible(true);
      dec.requestSync();
      expectVisible(false);

      await dec.setActiveMarker(marker);
      expectVisible(true);

      await dec.setActiveMarker(undefined);
      expectVisible(false);

      dec.updateConfiguration({ ignoreModelSelector: false, ignoreCategorySelector: false });
      vp.changeModelDisplay(model, true);
      vp.changeCategoryDisplay(cat, true);
      dec.requestSync();
      expectVisible(false);

      Handler.visible = true;
      expectVisible(false);
      dec.requestSync();
      expectVisible(true);

      // Reset for subsequent tests.
      HyperModeling.replaceConfiguration();
    });
  });

  it("Activates and deactivates markers", async () => {
    class Handler extends SectionMarkerHandler {
      public allowActivate = true;
      private _activateCalled = false;
      private _deactivateCalled = false;

      public override async activateMarker(_marker: SectionMarker, _dec: HyperModelingDecorator): Promise<boolean> {
        expect(this._activateCalled).to.be.false;
        this._activateCalled = true;
        return this.allowActivate;
      }

      public override async deactivateMarker(_marker: SectionMarker, _dec: HyperModelingDecorator): Promise<void> {
        expect(this._deactivateCalled).to.be.false;
        this._deactivateCalled = true;
      }

      public check(activated: boolean, deactivated: boolean): void {
        expect(this._activateCalled).to.equal(activated);
        expect(this._deactivateCalled).to.equal(deactivated);
        this._activateCalled = this._deactivateCalled = false;
      }
    }

    const handler = new Handler();
    await HyperModeling.initialize({ markerHandler: handler });
    await testOnScreenViewport("0x80", hypermodel, 100, 100, async (vp) => {
      const dec = (await HyperModeling.startOrStop(vp, true))!;
      expect(dec.markers.markers.size > 2).to.be.true;
      const markers: SectionMarker[] = [];
      for (const marker of dec.markers.markers) {
        markers.push(marker);
        if (markers.length === 2)
          break;
      }

      expect(markers.length).to.equal(2);
      const m0 = markers[0];
      const m1 = markers[1];

      expect(dec.activeMarker).to.be.undefined;
      expect(await dec.setActiveMarker(m0)).to.be.true;
      expect(dec.activeMarker).to.equal(m0);
      handler.check(true, false);
      expect(await dec.setActiveMarker(m0)).to.be.true;
      expect(dec.activeMarker).to.equal(m0);
      handler.check(false, false);
      expect(await dec.setActiveMarker(m1)).to.be.true;
      expect(dec.activeMarker).to.equal(m1);
      handler.check(true, true);
      expect(await dec.setActiveMarker(undefined)).to.be.true;
      expect(dec.activeMarker).to.be.undefined;
      handler.check(false, true);

      handler.allowActivate = false;
      expect(await dec.setActiveMarker(m0)).to.be.false;
      expect(dec.activeMarker).to.be.undefined;
      handler.check(true, false);

      handler.allowActivate = true;
      expect(await dec.setActiveMarker(m0)).to.be.true;
      expect(dec.activeMarker).to.equal(m0);
      handler.check(true, false);

      handler.allowActivate = false;
      expect(await dec.setActiveMarker(m1)).to.be.false;
      expect(dec.activeMarker).to.be.undefined;
      handler.check(true, true);
    });

    // Reset for subsequent tests
    HyperModeling.replaceConfiguration();
  });
});
