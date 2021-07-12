/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
import { assert, Id64Array, Id64String } from "@bentley/bentleyjs-core";
import {
  BackgroundMapProps, ColorDef, Hilite, RenderMode, ViewFlags, ViewStateProps,
} from "@bentley/imodeljs-common";
import { RenderSystem, TileAdmin } from "@bentley/imodeljs-frontend";

/** Dimensions of the Viewport for a TestConfig. */
export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

/** Selectively overrides individual ViewFlags for a TestConfig.
 * @note renderMode can be a string "wireframe", "hiddenline", "solidfill", or "smoothshade" (case-insensitive).
 */
export type ViewFlagProps = Partial<Omit<ViewFlags, "renderMode">> & { renderMode?: string | RenderMode };

/** The types of saved views to include in a TestConfig. Case-insensitive in TestConfigProps; always lower-case in TestConfig.
 * local and internal mean exactly the same thing - include all persistent views from the iModel, including private ones.
 * external means to include external saved views from a *_ESV.json file
 * both means to include both types.
 */
export type SavedViewType = "both" | "external" | "internal" | "local";

/** The type(s) of tests specified by a TestConfig.
 * timing means to record and output timing for drawing to the screen.
 * readPixels means to record and output timing for drawing to an offscreen framebuffer for reading pixel data.
 * image means to save an image of the screen.
 * both means to do "timing" and "image".
 */
export type TestType = "timing" | "readPixels" | "image" | "both";

/** Specifies symbology overrides to apply to elements in a TestConfig. */
export interface ElementOverrideProps {
  /** The Id of the affected element, or "-default-" to apply to all elements not otherwise overridden. */
  id: Id64String | "-default-";
  /** The symbology overrides to apply. */
  fsa: string; // A stringified FeatureAppearanceProps. Why is all the JSON double-stringified???
}

/** JSON representation of a ViewState with some additional data used by external saved views in a *_ESV.json file and by TestConfigProps.viewString. */
export interface ViewStateSpecProps {
  _name: string; // eslint-disable-line @typescript-eslint/naming-convention
  _viewStatePropsString: string; // eslint-disable-line @typescript-eslint/naming-convention
  _overrideElements?: string; // eslint-disable-line @typescript-eslint/naming-convention
  _selectedElements?: string; // eslint-disable-line @typescript-eslint/naming-convention
}

/** Parsed in-memory representation of a ViewStateSpecProps. */
export interface ViewStateSpec {
  name: string;
  viewProps: ViewStateProps;
  elementOverrides?: ElementOverrideProps[];
  selectedElements?: Id64String | Id64Array;
}

/** Overrides aspects of the Hilite.Settings used for emphasis or hilite in a TestConfig. */
export interface HiliteProps {
  visibleRatio?: number;
  hiddenRatio?: number;
  silhouette?: Hilite.Silhouette;
  red?: number;
  green?: number;
  blue?: number;
}

/** Specifies how to apply hypermodeling in a TestConfig. */
export interface HyperModelingProps {
  /** The Id of the [SectionDrawingLocation]($backend) element from which the section view and 2d section graphics are obtained. */
  sectionDrawingLocationId: Id64String;
  /** If true, the spatial view associated with the section drawing location will be applied before the test is executed.
   * This essentially overrides the view defined by TestConfig's viewName, extViewName, and viewString properties. However,
   * the spatial view is applied before other properties like viewFlags, backgroundMap, etc, so those can still override aspects of
   * the view.
   * If not true, only the clip and 2d section graphics from the section drawing location are applied to the viewport.
   */
  applySpatialView?: boolean;
}

/** JSON representation of a TestConfig. */
export interface TestConfigProps {
  /** The default output path. Not stored in the JSON file but supplied by the backend for the base config. Ignored if outputPath is defined. */
  argOutputPath?: string;
  /** The dimensions of the viewport.
   * Default: 1000x1000.
   */
  view?: ViewSize;
  /** The number of frames to draw while recording timings. Timings are averaged over these frames.
   * Default: 50
   */
  numRendersToTime?: number;
  /** The number of frames to draw without recording timings, to prime the system so that recorded timings are more consistent.
   * Default: 100
   */
  numRendersToSkip?: number;
  /** The name of the output .csv file to contain the recorded timing data.
   * Default: performanceResults.csv
   */
  outputName?: string;
  /** The directory to contain output like the .csv file containing timing data, saved images, log files, etc.
   * Default: d:\output\performanceData\
   */
  outputPath?: string;
  /** The location of the iModel file(s) used by the test.
   * Default: ""
   */
  iModelLocation?: string;
  /** The name of the iModel(s) to test. Can include wildcards.
   * Default: "*"
   */
  iModelName?: string;
  /** The name of the iModelHub project from which to obtain iModels. Currently not supported.
   * Default: "iModel Testing"
   */
  iModelHubProject?: string;
  /** The format in which to output the timing data. See DisplayPerfRpcImpl.saveCsv - only "original" is treated specially.
   * Default: "original".
   */
  csvFormat?: string;
  /** Substrings to omit from generated file names. See removeOptsFromString. */
  filenameOptsToIgnore?: string[] | string;
  /** The name of the view(s) to test. Can include wildcards.
   * Default: "*"
   */
  viewName?: string;
  /** The name of an external saved view to test. Supersedes viewName if defined. */
  extViewName?: string;
  /** The type of test(s) to run. */
  testType?: TestType;
  /** The name (Code value) of a display style to apply to the view. */
  displayStyle?: string;
  /** Overrides for selected ViewFlags to apply to the view. */
  viewFlags?: ViewFlagProps;
  /** Selectively overrides how the background map is drawn. */
  backgroundMap?: BackgroundMapProps;
  /** Selectively overrides options used to initialize the RenderSystem. */
  renderOptions?: RenderSystem.Options;
  /** Selectively overrides options used to initialize the TileAdmin. */
  tileProps?: TileAdmin.Props;
  hilite?: HiliteProps;
  emphasis?: HiliteProps;
  /** The type(s) of saved views to include. */
  savedViewType?: SavedViewType;
  /** An object (not a string) describing a non-persistent view. Supersedes viewName if defined. */
  viewString?: ViewStateSpecProps;
  /** Specifies hypermodeling settings applied to the view. */
  hyperModeling?: HyperModelingProps;
}

export const defaultHilite = new Hilite.Settings();
export const defaultEmphasis = new Hilite.Settings(ColorDef.black, 0, 0, Hilite.Silhouette.Thick);
export const isWindows = window.navigator.userAgent.toLowerCase().includes("win");

/** Configures how one or more tests are run. A Test belongs to a TestSet and can test multiple iModels and views thereof.
 * A single base config is supplied by the backend.
 * Each TestSet can override aspects of that base config.
 * Each Test within a TestSet receives the TestSet's config and can override aspects of it.
 * Most properties have the same meanings as those in TestConfigProps.
 */
export class TestConfig {
  public readonly view: ViewSize;
  public readonly numRendersToTime: number;
  public readonly numRendersToSkip: number;
  public readonly outputName: string;
  public readonly outputPath: string;
  public iModelName: string;
  public readonly iModelHubProject: string;
  public viewName: string;
  public readonly testType: TestType;
  public readonly csvFormat: string;
  public readonly renderOptions: RenderSystem.Options;
  public readonly savedViewType: SavedViewType;
  public readonly iModelLocation: string;

  public readonly extViewName?: string;
  public readonly displayStyle?: string;
  public readonly viewFlags?: ViewFlagProps;
  public readonly tileProps?: TileAdmin.Props;
  public readonly hilite?: Hilite.Settings;
  public readonly emphasis?: Hilite.Settings;

  /** A string representation of a ViewState, produced from TestConfigProps.viewString. */
  public readonly viewStateSpec?: ViewStateSpec;
  public readonly filenameOptsToIgnore?: string[] | string;
  public readonly backgroundMap?: BackgroundMapProps;
  public readonly hyperModeling?: HyperModelingProps;

  /** Construct a new TestConfig with properties initialized by following priority:
   *  As defined by `props`; or
   *  as defined by `prevConfig` if not defined by props; or
   *  to default values if not defined by prevConfig or prevConfig is not supplied.
   */
  public constructor(props: TestConfigProps, prevConfig?: TestConfig) {
    this.view = props.view ?? prevConfig?.view ?? { width: 1000, height: 1000 };
    this.numRendersToTime = props.numRendersToTime ?? prevConfig?.numRendersToTime ?? 100;
    this.numRendersToSkip = props.numRendersToSkip ?? prevConfig?.numRendersToSkip ?? 50;
    this.outputName = props.outputName ?? prevConfig?.outputName ?? "performanceResults.csv";
    this.outputPath = prevConfig?.outputPath ?? (isWindows ? "D:\\output\\performanceData\\" : "/Users/");
    this.iModelLocation = prevConfig?.iModelLocation ?? "";
    this.iModelName = props.iModelName ?? prevConfig?.iModelName ?? "*";
    this.iModelHubProject = props.iModelHubProject ?? prevConfig?.iModelHubProject ?? "iModel Testing";
    this.csvFormat = props.csvFormat ?? prevConfig?.csvFormat ?? "original";
    this.viewName = props.viewName ?? prevConfig?.viewName ?? "*";
    this.extViewName = props.extViewName;
    this.testType = props.testType ?? prevConfig?.testType ?? "timing";
    this.savedViewType = (props.savedViewType?.toLowerCase() as SavedViewType) ?? prevConfig?.savedViewType ?? "both";
    this.renderOptions = prevConfig?.renderOptions ? { ...prevConfig.renderOptions } : { useWebGL2: true, dpiAwareLOD: true };
    this.filenameOptsToIgnore = props.filenameOptsToIgnore ?? prevConfig?.filenameOptsToIgnore;
    this.displayStyle = props.displayStyle ?? prevConfig?.displayStyle;
    this.hyperModeling = props.hyperModeling ?? prevConfig?.hyperModeling;

    if (prevConfig) {
      if (prevConfig.viewStateSpec) {
        // Don't preserve selected elements or appearance overrides.
        this.viewStateSpec = { name: prevConfig.viewStateSpec.name, viewProps: prevConfig.viewStateSpec.viewProps };
      }

      this.hilite = prevConfig.hilite;
      this.emphasis = prevConfig.emphasis;

      if (prevConfig.backgroundMap)
        this.backgroundMap = { ...prevConfig.backgroundMap };

      if (prevConfig.tileProps)
        this.tileProps = { ...prevConfig.tileProps };

      if (prevConfig.viewFlags)
        this.viewFlags = { ...prevConfig.viewFlags };

    } else if (props.argOutputPath) {
      this.outputPath = props.argOutputPath;
    }

    if (props.iModelLocation)
      this.iModelLocation = combineFilePaths(props.iModelLocation, this.iModelLocation);

    if (props.outputPath)
      this.outputPath = combineFilePaths(props.outputPath, this.outputPath);

    if (props.viewString) {
      this.viewStateSpec = {
        name: props.viewString._name,
        viewProps: JSON.parse(props.viewString._viewStatePropsString),
      };

      if (props.viewString._overrideElements)
        this.viewStateSpec.elementOverrides = JSON.parse(props.viewString._overrideElements);

      if (props.viewString._selectedElements)
        this.viewStateSpec.selectedElements = JSON.parse(props.viewString._selectedElements);
    }

    if (props.renderOptions) {
      const options = merge(this.renderOptions, props.renderOptions);
      assert(options !== undefined);
      this.renderOptions = options;
    }

    this.tileProps = merge(this.tileProps, props.tileProps);
    this.backgroundMap = merge(this.backgroundMap, props.backgroundMap);
    this.viewFlags = merge(this.viewFlags, props.viewFlags);

    if (props.hilite)
      this.hilite = hiliteSettings(this.hilite ?? defaultHilite, props.hilite);

    if (props.emphasis)
      this.emphasis = hiliteSettings(this.emphasis ?? defaultEmphasis, props.emphasis);
  }

  /** Returns true if IModelApp must be restarted when transitioning from this config to the specified config. */
  public requiresRestart(newConfig: TestConfig): boolean {
    if (!areObjectsEqual(this.renderOptions, newConfig.renderOptions))
      return true;

    if (!this.tileProps || !newConfig.tileProps)
      return undefined !== this.tileProps || undefined !== newConfig.tileProps;

    return !areObjectsEqual(this.tileProps, newConfig.tileProps);
  }
}

/** Maintains a stack of TestConfigs such that entries pushed on the stack inherit properties from the entry currently on the top of the stack. */
export class TestConfigStack {
  private readonly _stack: TestConfig[] = [];

  public constructor(base: TestConfig) {
    this._stack.push(base);
  }

  public get top(): TestConfig {
    assert(this._stack.length > 0);
    return this._stack[this._stack.length - 1];
  }

  // Push to the top of the stack and return true if the new config requires restarting IModelApp.
  public push(props: TestConfigProps): boolean {
    const config = new TestConfig(props, this.top);
    const requiresRestart = this.top.requiresRestart(config);
    this._stack.push(config);
    return requiresRestart;
  }

  public pop(): void {
    assert(this._stack.length > 1); // never pop the base of the stack.
    this._stack.pop();
  }
}

/** Override properties of settings with those defined by props. */
function hiliteSettings(settings: Hilite.Settings, props: HiliteProps): Hilite.Settings {
  const colors = settings.color.colors;
  const color = ColorDef.from(props?.red ?? colors.r, props?.green ?? colors.g, props?.blue ?? colors.b, 0);
  return new Hilite.Settings(color, props.visibleRatio ?? settings.visibleRatio, props.hiddenRatio ?? settings.hiddenRatio, props.silhouette ?? settings.silhouette);
}

/** Merge two objects of type T such that any property defined by second overrides the value supplied for that property by first.
 * The inputs are not modified - a new object is returned if two objects are supplied.
 */
function merge<T extends object>(first: T | undefined, second: T | undefined): T | undefined {
  if (!first)
    return second;
  else if (!second)
    return first;
  else
    return { ...first, ...second };
}

/** Combine two file paths. e.g., combineFilePaths("images/img.png", "/usr/tmp") returns "/usr/tmp/images/img.png".
 * If isWindows & additionalPath begins with a drive letter, initialPath is ignored.
 * If !isWindows & additionalPath begins with "/", initialPath is ignored.
 */
function combineFilePaths(additionalPath: string, initialPath: string): string {
  if (initialPath.length === 0 || (isWindows && additionalPath[1] === ":") || (!isWindows && additionalPath[0] === "/"))
    return additionalPath;

  return path.join(initialPath, additionalPath);
}

/** Compare two values for equality, recursing into arrays and object fields. */
function areEqual(a: any, b: any): boolean {
  if (typeof a !== typeof b)
    return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length)
      return false;

    for (let i = 0; i < a.length; i++)
      if (!areEqual(a[i], b[i]))
        return false;

    return true;
  }

  if (typeof a === "object")
    return areObjectsEqual(a, b as object);

  return a === b;
}

/** Compare the fields of each object for equality. */
function areObjectsEqual(a: object, b: object): boolean {
  if (Object.keys(a).length !== Object.keys(b).length)
    return false;

  const ob = b as { [key: string]: any };
  for (const [key, value] of Object.entries(a))
    if (!areEqual(value, ob[key]))
      return false;

  return true;
}
