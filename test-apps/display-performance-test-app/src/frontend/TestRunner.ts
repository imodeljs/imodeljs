/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
import {
  assert, BeDuration, Dictionary, Id64, Id64Array, Id64String, ProcessDetector, SortedArray, StopWatch,
} from "@bentley/bentleyjs-core";
import { BackgroundMapType, DisplayStyleProps, FeatureAppearance, Hilite, RenderMode, ViewStateProps } from "@bentley/imodeljs-common";
import {
  DisplayStyle3dState, DisplayStyleState, EntityState, FeatureSymbology, GLTimerResult, GLTimerResultCallback, IModelApp, IModelConnection,
  PerformanceMetrics, Pixel, RenderSystem, ScreenViewport, SnapshotConnection, Target, TileAdmin, ViewRect, ViewState,
} from "@bentley/imodeljs-frontend";
import { ExternalTextureLoader, System } from "@bentley/imodeljs-frontend/lib/webgl";
import { HyperModeling } from "@bentley/hypermodeling-frontend";
import DisplayPerfRpcInterface from "../common/DisplayPerfRpcInterface";
import {
  defaultEmphasis, defaultHilite, ElementOverrideProps, HyperModelingProps, TestConfig, TestConfigProps, TestConfigStack, ViewStateSpec, ViewStateSpecProps,
} from "./TestConfig";
import { DisplayPerfTestApp } from "./DisplayPerformanceTestApp";

/** JSON representation of a set of tests. Each test in the set inherits the test set's configuration. */
export interface TestSetProps extends TestConfigProps {
  tests: TestConfigProps[];
}

/** JSON representation of TestRunner. The tests inherit the base configuration options. */
export interface TestSetsProps extends TestConfigProps {
  signIn?: boolean;
  minimize?: boolean;
  testSet: TestSetProps[];
}

/** Context for any number of TestCases to be run against an iModel. */
interface TestContext {
  readonly iModel: IModelConnection;
  readonly externalSavedViews: ViewStateSpec[];
}

/** The view against which a specific TestCase is to be run. */
interface TestViewState {
  readonly view: ViewState;
  readonly elementOverrides?: ElementOverrideProps[];
  readonly selectedElements?: Id64String | Id64Array;
}

/** The result of TestRunner.runTest. */
interface TestResult {
  selectedTileIds: string;
  tileLoadingTime: number;
}

/** A test being executed in a viewport. */
interface TestCase extends TestResult {
  readonly viewport: ScreenViewport;
  view: TestViewState;
}

/** Timings collected during TestRunner.runTest. */
class Timings {
  public readonly cpu = new Array<Map<string, number>>();
  public readonly gpu = new Map<string, number[]>();
  public readonly actualFps = new Array<Map<string, number>>();
  public gpuFramesCollected = 0;
  public readonly callback: GLTimerResultCallback;

  public constructor(numFramesToCollect: number) {
    this.callback = (result: GLTimerResult) => {
      if (this.gpuFramesCollected >= numFramesToCollect)
        return;

      const label = result.label;
      const timings = this.gpu.get(label);
      this.gpu.set(label, timings ? timings.concat(result.nanoseconds / 1e6) : [result.nanoseconds / 1e6]); // save as milliseconds
      if (result.children)
        for (const child of result.children)
          this.callback(child);

      if ("Total" === label)
        ++this.gpuFramesCollected;
    };
  }

  public set callbackEnabled(enabled: boolean) {
    IModelApp.renderSystem.debugControl!.resultsCallback = enabled ? this.callback : undefined;
  }
}

/** Applies ELementOverrideProps to elements in a viewport for a TestCase. */
class OverrideProvider {
  private readonly _elementOvrs = new Map<Id64String, FeatureAppearance>();
  private readonly _defaultOvrs?: FeatureAppearance;

  private constructor(ovrs: ElementOverrideProps[]) {
    for (const ovr of ovrs) {
      const app = FeatureAppearance.fromJSON(JSON.parse(ovr.fsa));
      if (ovr.id === "-default-")
        this._defaultOvrs = app;
      else
        this._elementOvrs.set(ovr.id, app);
    }
  }

  public static override(vp: ScreenViewport, ovrs: ElementOverrideProps[]): void {
    const provider = new OverrideProvider(ovrs);
    vp.addFeatureOverrideProvider(provider);
  }

  public addFeatureOverrides(ovrs: FeatureSymbology.Overrides): void {
    if (this._defaultOvrs)
      ovrs.setDefaultOverrides(this._defaultOvrs);

    for (const [key, value] of this._elementOvrs)
      ovrs.overrideElement(key, value);
  }
}

/** Given the JSON representation of a set of tests, executes them and records output (CSV timing info, images, logs, etc). */
export class TestRunner {
  private readonly _config: TestConfigStack;
  private readonly _minimizeOutput: boolean;
  private readonly _testSets: TestSetProps[];
  private readonly _logFileName: string;
  private readonly _testNamesImages = new Map<string, number>();
  private readonly _testNamesTimings = new Map<string, number>();

  public get curConfig(): TestConfig {
    return this._config.top;
  }

  public constructor(props: TestSetsProps) {
    this._config = new TestConfigStack(new TestConfig(props));
    this._testSets = props.testSet;
    this._minimizeOutput = true === props.minimize;
    this._logFileName = "_DispPerfTestAppViewLog.txt";
  }

  /** Run all the tests. */
  public async run(): Promise<void> {
    const msg = `View Log,  Model Base Location: ${this.curConfig.iModelLocation}\n  format: Time_started  ModelName  [ViewName]`;
    await this.logToConsole(msg);
    await this.logToFile(msg, { noAppend: true });

    // Run all the tests
    for (const set of this._testSets)
      await this.runTestSet(set);

    // Update UI to signal we're finished.
    const topdiv = document.getElementById("topdiv")!;
    topdiv.style.display = "block";
    topdiv.innerText = "Tests Completed.";
    document.getElementById("imodel-viewport")!.style.display = "hidden";

    // Write WebGL compatibility info to CSV.
    await this.finish();
  }

  private async runTestSet(set: TestSetProps): Promise<void> {
    let needRestart = this._config.push(set);

    // Perform all the tests for this iModel. If the iModel name contains an asterisk,
    // treat it as a wildcard and run tests for each iModel that matches the given wildcard.
    for (const testProps of set.tests) {
      if (this._config.push(testProps))
        needRestart = true;

      // Ensure IModelApp is initialized with options required by this test.
      if (IModelApp.initialized && needRestart)
        await IModelApp.shutdown();

      if (!IModelApp.initialized) {
        await DisplayPerfTestApp.startup({
          renderSys: this.curConfig.renderOptions,
          tileAdmin: this.curConfig.tileProps,
        });
      }

      // Run test against all iModels matching the test config.
      const iModelNames = await this.getIModelNames();
      const originalViewName = this.curConfig.viewName;
      for (const iModelName of iModelNames) {
        this.curConfig.iModelName = iModelName;
        this.curConfig.viewName = originalViewName;

        const context = await this.openIModel();
        if (context) {
          await this.runTests(context);
          await context.iModel.close();
        } else {
          await this.logError(`Failed to open iModel ${iModelName}`);
        }
      }

      this._config.pop();
    }

    this._config.pop();
  }

  private async runTests(context: TestContext): Promise<void> {
    const viewNames = await this.getViewNames(context);
    for (const viewName of viewNames) {
      this.curConfig.viewName = viewName;

      await this.logTest();

      const result = await this.runTest(context);
      if (result)
        await this.logToFile(result.selectedTileIds, { noNewLine: true });
    }
  }

  private async runTest(context: TestContext): Promise<TestResult | undefined> {
    // Reset the title bar to include the current model and view name
    const testConfig = this.curConfig;
    document.title = "Display Performance Test App:  ".concat(testConfig.iModelName ?? "", "  [", testConfig.viewName ?? "", "]");

    const test = await this.setupTest(context);
    if (!test)
      return undefined;

    const vp = test.viewport;
    if (testConfig.testType === "image" || testConfig.testType === "both") {
      this.updateTestNames(test, undefined, true);

      const canvas = vp.readImageToCanvas();
      await savePng(this.getImageName(test), canvas);

      if (testConfig.testType === "image") {
        vp.dispose();
        return test;
      }
    }

    // Throw away the first N frames until the timings become more consistent.
    for (let i = 0; i < this.curConfig.numRendersToSkip; i++) {
      vp.requestRedraw();
      vp.renderFrame();
    }

    this.updateTestNames(test);
    await (testConfig.testType === "readPixels" ? this.recordReadPixels(test) : this.recordRender(test));

    vp.dispose();
    return test;
  }

  private async recordReadPixels(test: TestCase): Promise<void> {
    const vp = test.viewport;
    const viewRect = new ViewRect(0, 0, this.curConfig.view.width, this.curConfig.view.height);
    const timings = new Timings(this.curConfig.numRendersToTime);

    const testReadPix = async (pixSelect: Pixel.Selector, pixSelectStr: string) => {
      // Collect CPU timings.
      setPerformanceMetrics(vp, new PerformanceMetrics(true, false, undefined));
      for (let i = 0; i < this.curConfig.numRendersToTime; ++i) {
        vp.readPixels(viewRect, pixSelect, () => { });
        timings.cpu[i] = (vp.target as Target).performanceMetrics!.frameTimings;
        timings.cpu[i].delete("Scene Time");
      }

      // Collect GPU timings.
      timings.gpuFramesCollected = 0;
      timings.callbackEnabled = true;
      setPerformanceMetrics(vp, new PerformanceMetrics(true, false, timings.callback));
      await this.renderAsync(vp, this.curConfig.numRendersToTime, timings);
      timings.callbackEnabled = false;

      this.updateTestNames(test, pixSelectStr, true);
      this.updateTestNames(test, pixSelectStr, false);

      const row = this.getRowData(timings, test, pixSelectStr);
      await this.saveCsv(row);
      await this.createReadPixelsImages(test, pixSelect, pixSelectStr);
    };

    // Test each combo of pixel selectors.
    await testReadPix(Pixel.Selector.Feature, "+feature");
    await testReadPix(Pixel.Selector.GeometryAndDistance, "+geom+dist");
    await testReadPix(Pixel.Selector.All, "+feature+geom+dist");
  }

  private async recordRender(test: TestCase): Promise<void> {
    const timings = new Timings(this.curConfig.numRendersToTime);
    setPerformanceMetrics(test.viewport, new PerformanceMetrics(true, false, timings.callback));
    await this.renderAsync(test.viewport, this.curConfig.numRendersToTime, timings);

    const row = this.getRowData(timings, test);
    await this.saveCsv(row);
  }

  private async renderAsync(vp: ScreenViewport, numFrames: number, timings: Timings): Promise<void> {
    IModelApp.viewManager.addViewport(vp);

    const target = vp.target as Target;
    const metrics = target.performanceMetrics;
    assert(undefined !== metrics);

    target.performanceMetrics = undefined;
    timings.callbackEnabled = false;

    const numFramesToIgnore = 120;
    let ignoreFrameCount = 0;
    let frameCount = 0;
    vp.continuousRendering = true;
    return new Promise((resolve: () => void, _reject) => {
      const timer = new StopWatch();
      const removeListener = vp.onRender.addListener(() => {
        // Ignore the first N frames - they seem to have more variable frame rate.
        if (++ignoreFrameCount <= numFramesToIgnore) {
          if (ignoreFrameCount === numFramesToIgnore) {
            // Time to start recording.
            target.performanceMetrics = metrics;
            timings.callbackEnabled = true;
            timer.start();
          }

          return;
        }

        timer.stop();
        timings.actualFps[frameCount] = metrics.frameTimings;
        timings.actualFps[frameCount].set("Total Time", timer.current.milliseconds);

        if (++frameCount === numFrames)
          target.performanceMetrics = undefined;

        if (timings.gpuFramesCollected >= numFrames || (frameCount >= numFrames && !(IModelApp.renderSystem as System).isGLTimerSupported)) {
          removeListener();
          IModelApp.viewManager.dropViewport(vp, false);
          vp.continuousRendering = false;
          timings.callbackEnabled = false;
          resolve();
        } else {
          vp.requestRedraw();
          timer.start();
        }
      });
    });
  }

  private async setupTest(context: TestContext): Promise<TestCase | undefined> {
    // Workaround for shifting map geometry when location needs to be asynchronously initialized.
    const imodel = context.iModel;
    await imodel.backgroundMapLocation.initialize(imodel);
    // Open the view.
    const view = await this.loadView(context);
    if (!view)
      return undefined;

    const viewport = this.openViewport(view.view);

    // Apply hypermodeling
    const hyperModeling = this.curConfig.hyperModeling;
    if (hyperModeling) {
      try {
        const decorator = await HyperModeling.start(viewport);
        const marker = decorator?.markers.findMarkerById(hyperModeling.sectionDrawingLocationId);
        if (!decorator) {
          await this.logError("Failed to start hypermodeling.");
        } else if (!marker) {
          await this.logError(`SectionDrawingLocation ${hyperModeling.sectionDrawingLocationId} not found.`);
        } else {
          if (hyperModeling.applySpatialView) {
            await decorator.toggleSection(marker, true);
          } else {
            decorator.toggleClipVolume(marker, true);
            await decorator.toggleAttachment(marker, true);
          }
        }
      } catch (err) {
        await this.logError(err.toString());
      }
    }

    // Apply emphasis and hilite settings.
    const config = this.curConfig;
    if (config.hilite)
      viewport.hilite = config.hilite;

    if (config.emphasis)
      viewport.emphasisSettings = config.emphasis;

    // Apply display style.
    if (config.displayStyle) {
      const styleProps = await imodel.elements.queryProps({ from: DisplayStyleState.classFullName, where: `CodeValue='${config.displayStyle}'` });
      if (styleProps.length >= 1) {
        const style = new DisplayStyle3dState(styleProps[0] as DisplayStyleProps, imodel);
        await style.load();
        viewport.view.setDisplayStyle(style);
      }
    }

    // Apply the view flags.
    if (config.viewFlags) {
      const vf = viewport.viewFlags as { [key: string]: any };
      const configVf = config.viewFlags as { [key: string]: any };
      for (const key of Object.keys(vf)) {
        const flag = configVf[key];
        if (undefined !== flag) {
          if (key === "renderMode" && typeof flag === "string") {
            switch (flag.toLowerCase()) {
              case "solidfill": vf.renderMode = RenderMode.SolidFill; break;
              case "hiddenline": vf.renderMode = RenderMode.HiddenLine; break;
              case "wireframe": vf.renderMode = RenderMode.Wireframe; break;
              case "smoothshade": vf.renderMode = RenderMode.SmoothShade; break;
            }
          } else {
            vf[key] = flag;
          }
        } else {
          configVf[key] = vf[key];
        }
      }
    }

    if (config.backgroundMap)
      viewport.changeBackgroundMapProps(viewport.displayStyle.settings.backgroundMap.clone(config.backgroundMap).toJSON());

    // Apply symbology overrides
    if (view.elementOverrides)
      OverrideProvider.override(viewport, view.elementOverrides);

    // Ensure all tiles required for the view are loaded.
    const result = await this.waitForTilesToLoad(viewport);

    // Set selected elements after all tiles have loaded.
    if (view.selectedElements) {
      imodel.selectionSet.add(view.selectedElements);
      viewport.markSelectionSetDirty();
      viewport.renderFrame();
    }

    return { ...result, viewport, view };
  }

  private async waitForTilesToLoad(viewport: ScreenViewport): Promise<TestResult> {
    const timer = new StopWatch(undefined, true);
    let haveNewTiles = true;
    while (haveNewTiles) {
      viewport.requestRedraw();
      viewport.invalidateScene();
      viewport.renderFrame();

      // The scene is ready when (1) all required TileTrees have been created and (2) all required tiles have finished loading.
      const context = viewport.createSceneContext();
      viewport.createScene(context);
      context.requestMissingTiles();

      haveNewTiles = !viewport.areAllTileTreesLoaded || context.hasMissingTiles || 0 < context.missingTiles.size;
      if (!haveNewTiles) {
        // ViewAttachments and 3d section drawing attachments render to separate off-screen viewports - check those too.
        for (const vp of viewport.view.secondaryViewports) {
          if (vp.numRequestedTiles > 0) {
            haveNewTiles = true;
            break;
          }

          const tiles = IModelApp.tileAdmin.getTilesForViewport(vp);
          if (tiles && tiles.external.requested > 0) {
            haveNewTiles = true;
            break;
          }
        }
      }

      // NB: The viewport is NOT added to the ViewManager's render loop, therefore we must manually pump the tile request scheduler.
      if (haveNewTiles)
        IModelApp.tileAdmin.process();

      await BeDuration.wait(100);
    }

    const extTexLoader = ExternalTextureLoader.instance;
    while (extTexLoader.numActiveRequests > 0 || extTexLoader.numPendingRequests > 0) {
      await BeDuration.wait(100);
    }

    viewport.renderFrame();
    timer.stop();

    return {
      tileLoadingTime: timer.current.milliseconds,
      selectedTileIds: formatSelectedTileIds(viewport),
    };
  }

  private openViewport(view: ViewState): ScreenViewport {
    // Ensure the exact same number of pixels regardless of device pixel ratio.
    const div = document.getElementById("imodel-viewport") as HTMLDivElement;
    const ratio = false === IModelApp.renderSystem.options.dpiAwareViewports ? 1 : (window.devicePixelRatio || 1);
    const width = `${String(this.curConfig.view.width / ratio)}px`;
    const height = `${String(this.curConfig.view.height / ratio)}px`;

    div.style.width = width;
    div.style.height = height;

    const vp = ScreenViewport.create(div, view);
    vp.rendersToScreen = true;

    vp.canvas.style.width = width;
    vp.canvas.style.height = height;

    return vp;
  }

  private async loadViewFromSpec(spec: ViewStateSpec, context: TestContext): Promise<TestViewState | undefined> {
    const className = spec.viewProps.viewDefinitionProps.classFullName;
    const ctor = await context.iModel.findClassFor<typeof EntityState>(className, undefined) as typeof ViewState | undefined;
    const view = ctor?.createFromProps(spec.viewProps, context.iModel);
    if (!view) {
      await this.logError("Failed to create view from spec");
      return undefined;
    }

    await view.load();
    return {
      view,
      elementOverrides: spec.elementOverrides,
      selectedElements: spec.selectedElements,
    };
  }

  private async loadView(context: TestContext): Promise<TestViewState | undefined> {
    // If viewStateSpec is defined, use it. If we fail to instantiate it, fail.
    const config = this.curConfig;
    if (config.viewStateSpec)
      return this.loadViewFromSpec(config.viewStateSpec, context);

    // If extViewName defined, find the matching external view. If none found, fail.
    if (config.extViewName) {
      const spec = context.externalSavedViews.find((x) => x.name === config.extViewName);
      if (spec)
        return this.loadViewFromSpec(spec, context);

      await this.logError(`Failed to find external saved view ${config.extViewName}`);
      return undefined;
    }

    // If viewName is defined, find a persistent view with that name.
    const ids = await context.iModel.elements.queryIds({ from: ViewState.classFullName, where: `CodeValue='${config.viewName}'` });
    for (const id of ids)
      return { view: await context.iModel.views.load(id) };

    // Try to find an external view matching viewName.
    const extSpec = context.externalSavedViews.find((x) => x.name === config.viewName);
    if (extSpec)
      return this.loadViewFromSpec(extSpec, context);

    await this.logError(`Failed to find persistent view ${config.viewName}`);
    return undefined;
  }

  private updateTestNames(test: TestCase, prefix?: string, isImage = false): void {
    const testNames = isImage ? this._testNamesImages : this._testNamesTimings;
    const testName = this.getTestName(test, prefix, false, true);
    const testNameDupes = testNames.get(testName) ?? 0;
    testNames.set(testName, testNameDupes + 1);
  }

  private async logTest(): Promise<void> {
    const testConfig = this.curConfig;
    const today = new Date();
    const month = (`0${(today.getMonth() + 1)}`).slice(-2);
    const day = (`0${today.getDate()}`).slice(-2);
    const year = today.getFullYear();
    const hours = (`0${today.getHours()}`).slice(-2);
    const minutes = (`0${today.getMinutes()}`).slice(-2);
    const seconds = (`0${today.getSeconds()}`).slice(-2);
    const outStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}  ${testConfig.iModelName}  [${testConfig.viewName}]`;

    await this.logToConsole(outStr);
    return this.logToFile(outStr);
  }

  private async openIModel(): Promise<TestContext | undefined> {
    const filepath = path.join(this.curConfig.iModelLocation, this.curConfig.iModelName);
    let iModel;
    try {
      iModel = await SnapshotConnection.openFile(path.join(filepath));
    } catch (err) {
      await this.logError(`openSnapshot failed: ${err.toString()}`);
      return undefined;
    }

    const esv = await DisplayPerfRpcInterface.getClient().readExternalSavedViews(filepath);
    let externalSavedViews: ViewStateSpec[] = [];
    if (esv) {
      const json = JSON.parse(esv) as ViewStateSpecProps[];
      externalSavedViews = json.map((x) => {
        return {
          name: x._name,
          viewProps: JSON.parse(x._viewStatePropsString) as ViewStateProps,
          elementOverrides: x._overrideElements ? JSON.parse(x._overrideElements) as ElementOverrideProps[] : undefined,
          selectedElements: x._selectedElements ? JSON.parse(x._selectedElements) as Id64String | Id64Array : undefined,
        };
      });
    }

    return { iModel, externalSavedViews };
  }

  private async getIModelNames(): Promise<string[]> {
    const config = this.curConfig;
    if (!config.iModelName.includes("*"))
      return [config.iModelName];

    const json = await DisplayPerfRpcInterface.getClient().getMatchingFiles(config.iModelLocation, config.iModelName);
    const files = JSON.parse(json);
    const iModels = [];
    for (const file of files) {
      if (file.endsWith(".bim") || file.endsWith(".ibim")) {
        const split = file.split("\\"); // ###TODO Use the path API to support non-Windows platforms.
        const iModel = split[split.length - 1];
        if (iModel)
          iModels.push(iModel);
      }
    }

    return iModels;
  }

  private async getViewNames(context: TestContext): Promise<string[]> {
    if (!this.curConfig.viewName.includes("*"))
      return [this.curConfig.viewName];

    let viewNames: string[] = [];
    if (this.curConfig.savedViewType !== "external") {
      const specs = await context.iModel.views.getViewList({ wantPrivate: true });
      viewNames = specs.map((spec) => spec.name);
    }

    if (this.curConfig.savedViewType !== "internal" && this.curConfig.savedViewType !== "local")
      viewNames = viewNames.concat(context.externalSavedViews.map((x) => x.name));

    return viewNames.filter((view) => matchRule(view, this.curConfig.viewName ?? "*")).sort();
  }

  private async finish(): Promise<void> {
    let renderData = "\"End of Tests-----------\r\n";
    const renderComp = IModelApp.queryRenderCompatibility();
    if (renderComp.userAgent) {
      renderData += `Browser: ${getBrowserName(renderComp.userAgent)}\r\n`;
      renderData += `User Agent: ${renderComp.userAgent}\r\n`;
    }
    if (renderComp.unmaskedRenderer)
      renderData += `Unmasked Renderer: ${renderComp.unmaskedRenderer}\r\n`;

    if (renderComp.unmaskedVendor)
      renderData += `Unmasked Vendor: ${renderComp.unmaskedVendor}\r\n`;

    if (renderComp.missingRequiredFeatures)
      renderData += `Missing Required Features: ${renderComp.missingRequiredFeatures}\r\n`;

    if (renderComp.missingOptionalFeatures)
      renderData += `Missing Optional Features: ${renderComp.missingOptionalFeatures}"\r\n`;

    await DisplayPerfRpcInterface.getClient().finishCsv(renderData, this.curConfig.outputPath, this.curConfig.outputName, this.curConfig.csvFormat);
    await this.logToConsole("Tests complete. Press Ctrl-C to exit.");

    return DisplayPerfRpcInterface.getClient().finishTest();
  }

  private async saveCsv(row: Map<string, number | string>): Promise<void> {
    const outputPath = this.curConfig.outputPath;
    const outputName = this.curConfig.outputName;
    const msg = JSON.stringify([...row]);
    return DisplayPerfRpcInterface.getClient().saveCsv(outputPath, outputName, msg, this.curConfig.csvFormat);
  }

  private async logToFile(message: string, opts?: { noAppend?: boolean, noNewLine?: boolean }): Promise<void> {
    if (!opts?.noNewLine)
      message = `${message}\n`;

    const append = !opts?.noAppend;
    return DisplayPerfRpcInterface.getClient().writeExternalFile(this.curConfig.outputPath, this._logFileName, append, message);
  }

  private async logToConsole(message: string): Promise<void> {
    return DisplayPerfRpcInterface.getClient().consoleLog(message);
  }

  private async logError(message: string): Promise<void> {
    const msg = `ERROR: ${message}`;
    await this.logToConsole(msg);
    return this.logToFile(msg);
  }

  private getTestName(test: TestCase, prefix?: string, isImage = false, ignoreDupes = false): string {
    let testName = prefix ?? "";
    const configs = this.curConfig;

    testName += configs.iModelName.replace(/\.[^/.]+$/, "");
    testName += `_${configs.viewName}`;
    testName += configs.displayStyle ? `_${configs.displayStyle.trim()}` : "";

    const renderMode = getRenderMode(test.viewport);
    if (renderMode)
      testName += `_${renderMode}`;

    const vf = getViewFlagsString(test);
    if (vf)
      testName += `_${vf}`;

    const renderOpts = getRenderOpts(configs.renderOptions);
    if (renderOpts)
      testName += `_${renderOpts}`;

    const tileProps = configs.tileProps ? getTileProps(configs.tileProps) : undefined;
    if (tileProps)
      testName += `_${tileProps}`;

    const map = getBackgroundMapProps(test.viewport);
    if (map)
      testName += `_${map}`;

    const hyper = getHyperModelingProps(configs.hyperModeling);
    if (hyper)
      testName += `_${hyper}`;

    const other = getOtherProps(test.viewport);
    if (other)
      testName += `_${other}`;

    testName = removeOptsFromString(testName, configs.filenameOptsToIgnore);
    if (!ignoreDupes) {
      let testNum = isImage ? this._testNamesImages.get(testName) : this._testNamesTimings.get(testName);
      if (testNum === undefined)
        testNum = 0;

      testName += (testNum > 1) ? (`---${testNum}`) : "";
    }

    return testName;
  }

  private getImageName(test: TestCase, prefix?: string): string {
    const filename = `${this.getTestName(test, prefix, true)}.png`;
    if (ProcessDetector.isMobileAppFrontend)
      return filename; // on mobile we use device's Documents path as determined by mobile backend

    return path.join(this.curConfig.outputPath, filename);
  }

  private getRowData(timings: Timings, test: TestCase, pixSelectStr?: string): Map<string, number | string> {
    const fixed = 4;
    const configs = this.curConfig;
    const rowData = new Map<string, number | string>();

    rowData.set("iModel", configs.iModelName);
    rowData.set("View", configs.viewName);

    const w = test.viewport.cssPixelsToDevicePixels(configs.view.width);
    const h = test.viewport.cssPixelsToDevicePixels(configs.view.height);
    rowData.set("Screen Size", `${w}X${h}`);

    rowData.set("Skip & Time Renders", `${configs.numRendersToSkip} & ${configs.numRendersToTime}`);
    rowData.set("Display Style", test.viewport.displayStyle.name);
    rowData.set("Render Mode", getRenderMode(test.viewport));
    rowData.set("View Flags", getViewFlagsString(test) !== "" ? ` ${getViewFlagsString(test)}` : "");
    rowData.set("Render Options", getRenderOpts(configs.renderOptions) !== "" ? ` ${getRenderOpts(configs.renderOptions)}` : "");

    const tileProps = configs.tileProps ? getTileProps(configs.tileProps) : "";
    rowData.set("Tile Props", "" !== tileProps ? ` ${tileProps}` : "");
    rowData.set("Bkg Map Props", getBackgroundMapProps(test.viewport) !== "" ? ` ${getBackgroundMapProps(test.viewport)}` : "");
    rowData.set("HyperModeling", getHyperModelingProps(configs.hyperModeling) ?? "");

    const other = getOtherProps(test.viewport);
    if ("" !== other)
      rowData.set("Other Props", ` ${other}`);

    if (pixSelectStr)
      rowData.set("ReadPixels Selector", ` ${pixSelectStr}`);

    rowData.set("Test Name", this.getTestName(test));
    rowData.set("Browser", getBrowserName(IModelApp.queryRenderCompatibility().userAgent));
    if (!this._minimizeOutput)
      rowData.set("Tile Loading Time", test.tileLoadingTime);

    const setGpuData = (name: string) => {
      if (name === "CPU Total Time")
        name = "Total";

      const gpuDataArray = timings.gpu.get(name);
      if (gpuDataArray) {
        let gpuSum = 0;
        for (const gpuData of gpuDataArray)
          gpuSum += gpuData;

        rowData.set(`GPU-${name}`, gpuDataArray.length ? (gpuSum / gpuDataArray.length).toFixed(fixed) : gpuSum.toFixed(fixed));
      }
    };

    // Calculate average timings
    if (pixSelectStr) { // timing read pixels
      for (const colName of timings.cpu[0].keys()) {
        let sum = 0;
        timings.cpu.forEach((timing) => {
          const data = timing.get(colName);
          sum += data ? data : 0;
        });

        if (!this._minimizeOutput || colName === "CPU Total Time") {
          rowData.set(colName, (sum / timings.cpu.length).toFixed(fixed));
          setGpuData(colName);
        }
      }
    } else { // timing render frame
      for (const colName of timings.actualFps[0].keys()) {
        let sum = 0;
        timings.actualFps.forEach((timing) => {
          const data = timing.get(colName);
          sum += data ? data : 0;
        });

        if (!this._minimizeOutput || colName === "CPU Total Time") {
          rowData.set(colName, sum / timings.actualFps.length);
          setGpuData(colName);
        }
      }
    }

    let totalTime: number;
    if (rowData.get("Finish GPU Queue")) { // If we can't collect GPU data, get non-interactive total time with 'Finish GPU Queue' time
      totalTime = Number(rowData.get("CPU Total Time")) + Number(rowData.get("Finish GPU Queue"));
      rowData.set("Non-Interactive Total Time", totalTime);
      rowData.set("Non-Interactive FPS", totalTime > 0.0 ? (1000.0 / totalTime).toFixed(fixed) : "0");
    }

    // Get these values from the timings.actualFps -- timings.actualFps === timings.cpu, unless in readPixels mode
    let totalRenderTime = 0;
    totalTime = 0;
    for (const time of timings.actualFps) {
      let timing = time.get("CPU Total Time");
      totalRenderTime += timing ? timing : 0;
      timing = time.get("Total Time");
      totalTime += timing ? timing : 0;
    }

    rowData.delete("Total Time");
    totalRenderTime /= timings.actualFps.length;
    totalTime /= timings.actualFps.length;
    const totalGpuTime = Number(rowData.get("GPU-Total"));
    if (totalGpuTime) {
      const gpuBound = totalGpuTime > totalRenderTime;
      const effectiveFps = 1000.0 / (gpuBound ? totalGpuTime : totalRenderTime);
      rowData.delete("GPU-Total");
      rowData.set("GPU Total Time", totalGpuTime.toFixed(fixed)); // Change the name of this column & change column order
      rowData.set("Bound By", gpuBound ? (effectiveFps < 60.0 ? "gpu" : "gpu ?") : "cpu *");
      rowData.set("Effective Total Time", gpuBound ? totalGpuTime.toFixed(fixed) : totalRenderTime.toFixed(fixed)); // This is the total gpu time if gpu bound or the total cpu time if cpu bound; times gather with running continuously
      rowData.set("Effective FPS", effectiveFps.toFixed(fixed));
    }

    rowData.set("Actual Total Time", totalTime.toFixed(fixed));
    rowData.set("Actual FPS", totalTime > 0.0 ? (1000.0 / totalTime).toFixed(fixed) : "0");

    return rowData;
  }

  private async createReadPixelsImages(test: TestCase, pix: Pixel.Selector, pixStr: string): Promise<void> {
    const vp = test.viewport;
    const canvas = vp.readImageToCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx)
      return;

    const cssRect = new ViewRect(0, 0, this.curConfig.view.width, this.curConfig.view.height);
    const imgWidth = vp.cssPixelsToDevicePixels(cssRect.width);
    const imgHeight = vp.cssPixelsToDevicePixels(cssRect.height);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const elemIdImgData = (pix & Pixel.Selector.Feature) ? ctx.createImageData(imgWidth, imgHeight) : undefined;
    const depthImgData = (pix & Pixel.Selector.GeometryAndDistance) ? ctx.createImageData(imgWidth, imgHeight) : undefined;
    const typeImgData = (pix & Pixel.Selector.GeometryAndDistance) ? ctx.createImageData(imgWidth, imgHeight) : undefined;

    vp.readPixels(cssRect, pix, (pixels) => {
      if (!pixels)
        return;

      for (let y = 0; y < imgHeight; ++y) {
        for (let x = 0; x < imgWidth; ++x) {
          const index = (x * 4) + (y * 4 * imgWidth);
          const pixel = pixels.getPixel(x, y);

          // RGB for element ID
          if (elemIdImgData !== undefined) {
            const elemId = Id64.getLowerUint32(pixel.elementId ? pixel.elementId : "");
            elemIdImgData.data[index + 0] = elemId % 256;
            elemIdImgData.data[index + 1] = (Math.floor(elemId / 256)) % 256;
            elemIdImgData.data[index + 2] = (Math.floor(elemId / (256 ^ 2))) % 256;
            elemIdImgData.data[index + 3] = 255; // Set alpha to 100% opaque
          }

          // RGB for Depth
          if (depthImgData !== undefined) {
            const distColor = pixels.getPixel(x, y).distanceFraction * 255;
            depthImgData.data[index + 0] = depthImgData.data[index + 1] = depthImgData.data[index + 2] = distColor;
            depthImgData.data[index + 3] = 255; // Set alpha to 100% opaque
          }

          // RGB for type
          if (typeImgData !== undefined) {
            const type = pixels.getPixel(x, y).type;
            switch (type) {
              case Pixel.GeometryType.None: // White
                typeImgData.data[index + 0] = 255;
                typeImgData.data[index + 1] = 255;
                typeImgData.data[index + 2] = 255;
                break;
              case Pixel.GeometryType.Surface: // Red
                typeImgData.data[index + 0] = 255;
                typeImgData.data[index + 1] = 0;
                typeImgData.data[index + 2] = 0;
                break;
              case Pixel.GeometryType.Linear: // Green
                typeImgData.data[index + 0] = 0;
                typeImgData.data[index + 1] = 255;
                typeImgData.data[index + 2] = 0;
                break;
              case Pixel.GeometryType.Edge: // Blue
                typeImgData.data[index + 0] = 0;
                typeImgData.data[index + 1] = 0;
                typeImgData.data[index + 2] = 255;
                break;
              case Pixel.GeometryType.Silhouette: // Purple
                typeImgData.data[index + 0] = 255;
                typeImgData.data[index + 1] = 0;
                typeImgData.data[index + 2] = 255;
                break;
              case Pixel.GeometryType.Unknown: // Black
              default:
                typeImgData.data[index + 0] = 0;
                typeImgData.data[index + 1] = 0;
                typeImgData.data[index + 2] = 0;
                break;
            }

            typeImgData.data[index + 3] = 255; // Set alpha to 100% opaque
          }
        }
      }
    });

    if (elemIdImgData !== undefined) {
      ctx.putImageData(elemIdImgData, 0, 0);
      await savePng(this.getImageName(test, `elemId_${pixStr}_`), canvas);
    }

    if (depthImgData !== undefined) {
      ctx.putImageData(depthImgData, 0, 0);
      await savePng(this.getImageName(test, `depth_${pixStr}_`), canvas);
    }

    if (typeImgData !== undefined) {
      ctx.putImageData(typeImgData, 0, 0);
      await savePng(this.getImageName(test, `type_${pixStr}_`), canvas);
    }
  }
}

function removeOptsFromString(input: string, ignore: string[] | string | undefined): string {
  if (!ignore)
    return input;

  let output = input;
  if (!(ignore instanceof Array))
    ignore = ignore.split(" ");

  ignore.forEach((del: string) => {
    if (del === "+max")
      output = output.replace(/\+max\d+/, "");
    else
      output = output.replace(del, "");
  });

  output = output.replace(/__+/, "_");
  if (output[output.length - 1] === "_")
    output = output.slice(0, output.length - 1);

  return output;
}

function getRenderMode(vp: ScreenViewport): string {
  switch (vp.viewFlags.renderMode) {
    case RenderMode.Wireframe: return "Wireframe";
    case RenderMode.HiddenLine: return "HiddenLine";
    case RenderMode.SolidFill: return "SolidFill";
    case RenderMode.SmoothShade: return "SmoothShade";
    default: return "";
  }
}

function getRenderOpts(curRenderOpts: RenderSystem.Options): string {
  let optString = "";
  for (const [key, value] of Object.entries(curRenderOpts)) {
    switch (key) {
      case "disabledExtensions":
        if (value) {
          for (const ext of value) {
            switch (ext) {
              case "WEBGL_draw_buffers":
                optString += "-drawBuf";
                break;
              case "OES_element_index_uint":
                optString += "-unsignedInt";
                break;
              case "OES_texture_float":
                optString += "-texFloat";
                break;
              case "OES_texture_half_float":
                optString += "-texHalfFloat";
                break;
              case "WEBGL_depth_texture":
                optString += "-depthTex";
                break;
              case "EXT_color_buffer_float":
                optString += "-floats";
                break;
              case "EXT_shader_texture_lod":
                optString += "-texLod";
                break;
              case "ANGLE_instanced_arrays":
                optString += "-instArrays";
                break;
              case "EXT_frag_depth":
                optString += "-fragDepth";
                break;
              default:
                optString += `-${ext}`;
                break;
            }
          }
        }
        break;
      case "preserveShaderSourceCode":
        if (value) optString += "+shadeSrc";
        break;
      case "displaySolarShadows":
        if (!value) optString += "-solShd";
        break;
      case "logarithmicZBuffer":
        if (value) optString += "+logZBuf";
        break;
      case "useWebGL2":
        if (value) optString += "+webGL2";
        break;
      case "antialiasSamples":
        if (value > 1) optString += `+aa${value as number}`;
        break;
      default:
        if (value) optString += `+${key}`;
    }
  }
  return optString;
}

function getTileProps(curTileProps: TileAdmin.Props): string {
  let tilePropsStr = "";
  for (const [key, value] of Object.entries(curTileProps)) {
    switch (key) {
      case "elideEmptyChildContentRequests":
        if (value) tilePropsStr += "+elide";
        break;
      case "enableInstancing":
        if (value) tilePropsStr += "+inst";
        break;
      case "maxActiveRequests":
        if (value !== 10) tilePropsStr += `+max${value}`;
        break;
      case "retryInterval":
        if (value) tilePropsStr += `+retry${value}`;
        break;
      case "disableMagnification":
        if (value) tilePropsStr += "-mag";
        break;
      default:
        if (value) tilePropsStr += `+${key}`;
    }
  }
  return tilePropsStr;
}

function getBackgroundMapProps(vp: ScreenViewport): string {
  let bmPropsStr = "";
  const bmProps = vp.displayStyle.settings.backgroundMap;
  switch (bmProps.providerName) {
    case "BingProvider":
      break;
    case "MapBoxProvider":
      bmPropsStr += "MapBox";
      break;
    default:
      bmPropsStr += bmProps.providerName;
      break;
  }

  switch (bmProps.mapType) {
    case BackgroundMapType.Hybrid:
      break;
    case BackgroundMapType.Aerial:
      bmPropsStr += "+aer";
      break;
    case BackgroundMapType.Street:
      bmPropsStr += "+st";
      break;
    default:
      bmPropsStr += `+type${bmProps.mapType}`;
      break;
  }

  if (bmProps.groundBias !== 0)
    bmPropsStr += `+bias${bmProps.groundBias}`;

  if (bmProps.applyTerrain)
    bmPropsStr += "+terr";

  if (bmProps.useDepthBuffer)
    bmPropsStr += "+depth";

  if (typeof (bmProps.transparency) === "number")
    bmPropsStr += `+trans${bmProps.transparency}`;

  return bmPropsStr;
}

function hiliteSettingsStr(settings: Hilite.Settings): string {
  let hsStr = (settings.color.colors.r * 256 * 256 + settings.color.colors.g * 256 + settings.color.colors.b).toString(36).padStart(5, "0");
  hsStr += (settings.silhouette * 256 * 256 + Math.round(settings.visibleRatio * 255) * 256 + Math.round(settings.hiddenRatio * 255)).toString(36).padStart(4, "0");
  return hsStr.toUpperCase();
}

function getHyperModelingProps(props: HyperModelingProps | undefined): string | undefined {
  if (!props)
    return undefined;

  const hm = `+hm${props.sectionDrawingLocationId}`;
  return props.applySpatialView ? `${hm}+a` : hm;
}

function getOtherProps(vp: ScreenViewport): string {
  let propsStr = "";
  if (!Hilite.equalSettings(vp.hilite, defaultHilite))
    propsStr += `+h${hiliteSettingsStr(vp.hilite)}`;

  if (!Hilite.equalSettings(vp.emphasisSettings, defaultEmphasis))
    propsStr += `+e${hiliteSettingsStr(vp.emphasisSettings)}`;

  return propsStr;
}

function getViewFlagsString(test: TestCase): string {
  let vfString = "";
  for (const [key, value] of Object.entries(test.viewport.viewFlags)) {
    switch (key) {
      case "renderMode":
        break;
      case "dimensions":
        if (!value) vfString += "-dim";
        break;
      case "patterns":
        if (!value) vfString += "-pat";
        break;
      case "weights":
        if (!value) vfString += "-wt";
        break;
      case "styles":
        if (!value) vfString += "-sty";
        break;
      case "transparency":
        if (!value) vfString += "-trn";
        break;
      case "fill":
        if (!value) vfString += "-fll";
        break;
      case "textures":
        if (!value) vfString += "-txt";
        break;
      case "materials":
        if (!value) vfString += "-mat";
        break;
      case "visibleEdges":
        if (value) vfString += "+vsE";
        break;
      case "hiddenEdges":
        if (value) vfString += "+hdE";
        break;
      case "sourceLights":
        if (value) vfString += "+scL";
        break;
      case "cameraLights":
        if (value) vfString += "+cmL";
        break;
      case "solarLight":
        if (value) vfString += "+slL";
        break;
      case "shadows":
        if (value) vfString += "+shd";
        break;
      case "clipVolume":
        if (!value) vfString += "-clp";
        break;
      case "constructions":
        if (value) vfString += "+con";
        break;
      case "monochrome":
        if (value) vfString += "+mno";
        break;
      case "noGeometryMap":
        if (value) vfString += "+noG";
        break;
      case "backgroundMap":
        if (value) vfString += "+bkg";
        break;
      case "hLineMaterialColors":
        if (value) vfString += "+hln";
        break;
      case "edgeMask":
        if (value === 1) vfString += "+genM";
        if (value === 2) vfString += "+useM";
        break;
      case "ambientOcclusion":
        if (value) vfString += "+ao";
        break;
      case "forceSurfaceDiscard":
        if (value) vfString += "+fsd";
        break;
      default:
        if (value) vfString += `+${key}`;
    }
  }

  if (undefined !== test.view.elementOverrides)
    vfString += "+ovrEl";

  if (undefined !== test.view.selectedElements)
    vfString += "+selEl";

  return vfString;
}

function getBrowserName(userAgent: string): string {
  const lowUserAgent = userAgent.toLowerCase();
  if (lowUserAgent.includes("electron"))
    return "Electron";
  if (lowUserAgent.includes("firefox"))
    return "FireFox";
  if (lowUserAgent.includes("edge"))
    return "Edge";
  if (lowUserAgent.includes("chrome") && !userAgent.includes("chromium"))
    return "Chrome";
  if (lowUserAgent.includes("safari") && !userAgent.includes("chrome") && !userAgent.includes("chromium"))
    return "Safari";
  return "Unknown";
}

/** See https://stackoverflow.com/questions/26246601/wildcard-string-comparison-in-javascript
 * Compare strToTest with a given rule containing a wildcard, and will return true if strToTest matches the given wildcard
 * Make sure it is case-insensitive
 */
function matchRule(strToTest: string, rule: string) {
  strToTest = strToTest.toLowerCase();
  rule = rule.toLowerCase();
  const escapeRegex = (str: string) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
  return new RegExp(`^${rule.split("*").map(escapeRegex).join(".*")}$`).test(strToTest);
}

/* A formatted string containing the Ids of all the tiles that were selected for display by the last call to waitForTilesToLoad(), of the format:
 *  Selected Tiles:
 *    TreeId1: tileId1,tileId2,...
 *    TreeId2: tileId1,tileId2,...
 *    ...
 * Sorted by tree Id and then by tile Id so that the output is consistent from run to run unless the set of selected tiles changed between runs.
 */
function formatSelectedTileIds(vp: ScreenViewport): string {
  let formattedSelectedTileIds = "Selected tiles:\n";

  const dict = new Dictionary<string, SortedArray<string>>((lhs, rhs) => lhs.localeCompare(rhs));
  for (const viewport of [vp, ...vp.view.secondaryViewports]) {
    const selected = IModelApp.tileAdmin.getTilesForViewport(viewport)?.selected;
    if (!selected)
      continue;

    for (const tile of selected) {
      const treeId = tile.tree.id;
      let tileIds = dict.get(treeId);
      if (!tileIds)
        dict.set(treeId, tileIds = new SortedArray<string>((lhs, rhs) => lhs.localeCompare(rhs)));

      tileIds.insert(tile.contentId);
    }
  }

  for (const kvp of dict) {
    const contentIds = kvp.value.extractArray().join(",");
    const line = `  ${kvp.key}: ${contentIds}`;
    formattedSelectedTileIds = `${formattedSelectedTileIds}${line}\n`;
  }

  return formattedSelectedTileIds;
}

async function savePng(fileName: string, canvas: HTMLCanvasElement): Promise<void> {
  const img = canvas.toDataURL("image/png");
  const data = img.replace(/^data:image\/\w+;base64,/, ""); // strip off the data: url prefix to get just the base64-encoded bytes
  return DisplayPerfRpcInterface.getClient().savePng(fileName, data);
}

function setPerformanceMetrics(vp: ScreenViewport, metrics: PerformanceMetrics | undefined): void {
  (vp.target as Target).performanceMetrics = metrics;
}
