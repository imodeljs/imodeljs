/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DisplayStyles
 */

// cspell:ignore greyscale ovrs

import {
  assert, BeEvent, CompressedId64Set, Id64, Id64Array, Id64String, JsonUtils, MutableCompressedId64Set, ObservableSet, OrderedId64Iterable,
} from "@bentley/bentleyjs-core";
import { XYZProps } from "@bentley/geometry-core";
import { AmbientOcclusion } from "./AmbientOcclusion";
import { AnalysisStyle, AnalysisStyleProps } from "./AnalysisStyle";
import { BackgroundMapProps, BackgroundMapSettings } from "./BackgroundMapSettings";
import { ClipStyle, ClipStyleProps } from "./ClipStyle";
import { ColorDef, ColorDefProps } from "./ColorDef";
import { DefinitionElementProps } from "./ElementProps";
import { GroundPlaneProps } from "./GroundPlane";
import { HiddenLine } from "./HiddenLine";
import { FeatureAppearance, FeatureAppearanceProps, PlanarClipMaskProps, PlanarClipMaskSettings, SubCategoryOverride } from "./imodeljs-common";
import { LightSettings, LightSettingsProps } from "./LightSettings";
import { MapImageryProps, MapImagerySettings } from "./MapImagerySettings";
import { PlanProjectionSettings, PlanProjectionSettingsProps } from "./PlanProjectionSettings";
import { RenderSchedule } from "./RenderSchedule";
import { SkyBoxProps } from "./SkyBox";
import { SolarShadowSettings, SolarShadowSettingsProps } from "./SolarShadows";
import { SubCategoryAppearance } from "./SubCategoryAppearance";
import { ThematicDisplay, ThematicDisplayMode, ThematicDisplayProps } from "./ThematicDisplay";
import { ViewFlagProps, ViewFlags } from "./ViewFlags";
import { Cartographic } from "./geometry/Cartographic";
import { IModel } from "./IModel";
import { calculateSolarDirection } from "./SolarCalculate";
import { ContextRealityModel, ContextRealityModelProps, ContextRealityModels } from "./ContextRealityModel";

/** Describes the [[SubCategoryOverride]]s applied to a [[SubCategory]] by a [[DisplayStyle]].
 * @see [[DisplayStyleSettingsProps]]
 * @public
 */
export interface DisplayStyleSubCategoryProps extends SubCategoryAppearance.Props {
  /** The Id of the [[SubCategory]] whose appearance is to be overridden. */
  subCategory?: Id64String;
}

/** A [[FeatureAppearanceProps]] applied to a specific model to override its appearance within the context of a [DisplayStyle]($backend).
 * @see [[DisplayStyleSettingsProps.modelOvr]].
 * @public
 */
export interface DisplayStyleModelAppearanceProps extends FeatureAppearanceProps {
  /** The Id of the model whose appearance is to be overridden. */
  modelId?: Id64String;
}

/** A [[PlanarClipMaskProps]] associated with a specific reality model.
 * @see [[DisplayStyleSettingsProps.planarClipOvr]].
 * @public
 */
export interface DisplayStylePlanarClipMaskProps extends PlanarClipMaskProps {
  /** The Id of the model to mask. */
  modelId?: Id64String;
}

/** JSON representation of the environment setup of a [[DisplayStyle3d]].
 * @public
 */
export interface EnvironmentProps {
  ground?: GroundPlaneProps;
  sky?: SkyBoxProps;
}

/** Describes the style in which monochrome color is applied by a [[DisplayStyleSettings]].
 * @public
 */
export enum MonochromeMode {
  /** The color of the geometry is replaced with the monochrome color. e.g., if monochrome color is white, the geometry will be white. */
  Flat = 0,
  /** The color of surfaces is computed as normal, then scaled to a shade of the monochrome color based on the surface color's intensity.
   * For example, if the monochrome color is white, this results in a greyscale effect.
   * Geometry other than surfaces is treated the same as [[MonochromeMode.Flat]].
   */
  Scaled = 1,
}

/** JSON representation of the settings associated with a [[DisplayStyleProps]].
 * These settings are not stored directly as members of the [[DisplayStyleProps]]. Instead, they are stored
 * as members of `jsonProperties.styles`.
 * @see [[DisplayStyleSettings]].
 * @public
 */
export interface DisplayStyleSettingsProps {
  viewflags?: ViewFlagProps;
  /** The color displayed in the view background. Defaults to black. */
  backgroundColor?: ColorDefProps;
  /** The color used in monochrome mode. Defaults to white.
   * The monochrome color is applied to all surfaces and linear geometry.
   * It is never applied to the **edges** of surfaces, except in Wireframe render mode.
   */
  monochromeColor?: ColorDefProps;
  /** The style in which the monochrome color is applied. Default: [[MonochromeMode.Scaled]]. */
  monochromeMode?: MonochromeMode;
  /** Settings controlling display of analytical models. */
  analysisStyle?: AnalysisStyleProps;
  /** A floating point value in [0..1] representing the animation state of this style's [[analysisStyle]]. Default: 0.0. */
  analysisFraction?: number;
  /** A schedule script embedded into the display style settings. This is how schedule scripts were stored prior to the introduction of
   * [RenderTimeline]($backend) elements. It should no longer be used - instead, set [[renderTimeline]] to the Id of the RenderTimeline element
   * that hosts the script.
   * @note For a [DisplayStyleState]($frontend) obtained via [IModelConnection.Views.load]($frontend), the element Ids will be omitted from all
   * of the script's [[ElementTimelineProps]] to conserve bandwidth and memory, because they are not needed for display on the frontend.
   * @deprecated Use DisplayStyleSettingsProps.renderTimeline.
   * @internal
   */
  scheduleScript?: RenderSchedule.ModelTimelineProps[];
  /** The Id of a [RenderTimeline]($backend) element containing a [[RenderSchedule.Script]] that can be used to animate the view. */
  renderTimeline?: Id64String;
  /** The point in time reflected by the view, in UNIX seconds.
   * This identifies a point on the timeline of the style's [[RenderSchedule.Script]], if any; it may also affect display of four-dimensional reality models.
   */
  timePoint?: number;
  /** Overrides applied to the appearances of subcategories in the view. */
  subCategoryOvr?: DisplayStyleSubCategoryProps[];

  /** Settings controlling display of map within views of geolocated models. */
  backgroundMap?: BackgroundMapProps;
  /** @see [[DisplayStyleSettings.contextRealityModels]]. */
  contextRealityModels?: ContextRealityModelProps[];
  /** Ids of elements not to be displayed in the view. Prefer the compressed format, especially when sending between frontend and backend - the number of Ids may be quite large. */
  excludedElements?: Id64Array | CompressedId64Set;
  /** Map Imagery.
   * @alpha
   */
  mapImagery?: MapImageryProps;
  /** Overrides applied to the appearance of models in the view. */
  modelOvr?: DisplayStyleModelAppearanceProps[];
  /** Style applied by the view's [ClipVector]($geometry-core). */
  clipStyle?: ClipStyleProps;
  /** Planar clip masks applied to reality models. */
  planarClipOvr?: DisplayStylePlanarClipMaskProps[];

}

/** JSON representation of settings associated with a [[DisplayStyle3dProps]].
 * @see [[DisplayStyle3dSettings]].
 * @public
 */
export interface DisplayStyle3dSettingsProps extends DisplayStyleSettingsProps {
  /** Settings controlling display of skybox and ground plane. */
  environment?: EnvironmentProps;
  /** Settings controlling thematic display. */
  thematic?: ThematicDisplayProps;
  /** Settings controlling display of visible and hidden edges. */
  hline?: HiddenLine.SettingsProps;
  /** Settings controlling display of ambient occlusion, stored in Props. */
  ao?: AmbientOcclusion.Props;
  /** Settings controlling display of solar shadows, stored in Props. */
  solarShadows?: SolarShadowSettingsProps;
  /** Settings controlling how the scene is lit. */
  lights?: LightSettingsProps;
  /** Settings controlling how plan projection models are to be rendered. The key for each entry is the Id of the model to which the settings apply. */
  planProjections?: { [modelId: string]: PlanProjectionSettingsProps };
  /** Old lighting settings - only `sunDir` was ever used; it is now part of `lights`.
   * @deprecated
   * @internal
   */
  sceneLights?: { sunDir?: XYZProps };
}

/** JSON representation of a [[DisplayStyle]] or [[DisplayStyleState]].
 * @public
 */
export interface DisplayStyleProps extends DefinitionElementProps {
  /** Display styles store their settings in a `styles` property within [[ElementProps.jsonProperties]]. */
  jsonProperties?: {
    styles?: DisplayStyleSettingsProps;
  };
}

/** JSON representation of a [[DisplayStyle3d]] or [[DisplayStyle3dState]].
 * @public
 */
export interface DisplayStyle3dProps extends DisplayStyleProps {
  /** Display styles store their settings in a `styles` property within [[ElementProps.jsonProperties]]. */
  jsonProperties?: {
    styles?: DisplayStyle3dSettingsProps;
  };
}

/** Controls which settings are serialized by [[DisplayStyleSettings.toOverrides]]. A display style includes some settings that are specific to a given iModel - for example,
 * the subcategory overrides are indexed by subcategory Ids and model appearance overrides are indexed by model ids. Other settings are specific to a given project, like the set of displayed context reality models. Such settings can be useful
 * when creating display style overrides intended for use with a specific iModel or project, but should be omitted when creating general-purpose display style overrides intended
 * for use with any iModel or project. This is the default behavior if no more specific options are provided.
 * @public
 */
export interface DisplayStyleOverridesOptions {
  /** Serialize all settings. Applying the resultant [[DisplayStyleSettingsProps]] will produce a [[DisplayStyleSettings]] identical to the original settings. */
  includeAll?: true;
  /** Serialize iModel-specific settings. These settings are only meaningful within the context of a specific iModel. Setting this to `true` implies all project-specific settings will be serialized too.
   * The following are iModel-specific settings:
   *  * Subcategory overrides.
   *  * Model Appearance overrides.
   *  * Classifiers associated with context reality models.
   *  * Analysis style.
   *  * Schedule script.
   *  * Excluded elements.
   *  * Plan projection settings.
   *  * Thematic sensor settings and height range. If iModel-specific settings are *not* serialized, sensors will be omitted and, for thematic height mode, the range will be omitted.
   *    * If the display style settings are associated with a [DisplayStyleState]($frontend), then overriding thematic settings will compute a default height range based on the iModel's project extents.
   */
  includeIModelSpecific?: true;
  /** Serialize project-specific settings. These settings are only meaningful within the context of a specific project. These settings are always included if `includeIModelSpecific` is `true`.
   * The following are project-specific settings:
   *  * Context reality models. If iModel-specific settings are *not* serialized, the classifiers will be omitted.
   *  * Time point.
   */
  includeProjectSpecific?: true;
  /** Serialize settings related to drawing aid decorations (the ACS triad and the grid). */
  includeDrawingAids?: true;
  /** Serialize the background map settings. */
  includeBackgroundMap?: true;
}

/** DisplayStyleSettings initially persisted its excluded elements as an array of Id64Strings in JSON, and exposed them as a Set<string>.
 * This becomes problematic when these arrays become very large, in terms of the amount of data and the time required to convert them to a Set.
 * The Ids are now persisted to JSON as a [[CompressedId64Set]], significantly reducing their size. However, for backwards API compatibility we must
 * continue to expose [[DisplayStyleSettings.excludedElements]] as a Set<string>. The [[ExcludedElements]] class tries to minimize the impact of that requirement by
 * maintaining the Ids primarily as a [[MutableCompressedId64Set]], only allocating the Set<string> if a caller actually requests it.
 * The only operation Set provides more efficiently than MutableCompressedId64Set is checking for the presence of an Id (the `has()` method).
 * @internal
 */
class ExcludedElements implements OrderedId64Iterable {
  private readonly _json: DisplayStyleSettingsProps;
  private readonly _ids: MutableCompressedId64Set;
  private _set?: ObservableSet<Id64String>;
  private _synchronizing = false;

  public constructor(json: DisplayStyleSettingsProps) {
    this._json = json;
    if (Array.isArray(json.excludedElements))
      this._ids = new MutableCompressedId64Set(CompressedId64Set.compressIds(OrderedId64Iterable.sortArray(json.excludedElements)));
    else
      this._ids = new MutableCompressedId64Set(json.excludedElements);
  }

  public reset(ids: CompressedId64Set | OrderedId64Iterable | undefined) {
    this.synchronize(() => {
      this._set?.clear();
      this._ids.reset((ids && "string" !== typeof ids) ? CompressedId64Set.compressIds(ids) : ids);
    });
  }

  public get ids(): CompressedId64Set {
    return this._ids.ids;
  }

  public add(ids: Iterable<Id64String>): void {
    this.synchronize(() => {
      for (const id of ids) {
        this._ids.add(id);
        this._set?.add(id);
      }
    });
  }

  public delete(ids: Iterable<Id64String>): void {
    this.synchronize(() => {
      for (const id of ids) {
        this._ids.delete(id);
        this._set?.delete(id);
      }
    });
  }

  public obtainSet(): Set<Id64String> {
    if (this._set)
      return this._set;

    this.synchronize(() => {
      this._set = new ObservableSet<string>(this._ids);
      this._set.onAdded.addListener((id) => this.onAdded(id));
      this._set.onDeleted.addListener((id) => this.onDeleted(id));
      this._set.onCleared.addListener(() => this.onCleared());
    });

    assert(undefined !== this._set);
    return this._set;
  }

  public [Symbol.iterator]() {
    return this._ids[Symbol.iterator]();
  }

  private onAdded(id: Id64String): void {
    this.synchronize(() => this._ids.add(id));
  }

  private onDeleted(id: Id64String): void {
    this.synchronize(() => this._ids.delete(id));
  }

  private onCleared(): void {
    this.synchronize(() => this._ids.clear());
  }

  /** The JSON must be kept up-to-date at all times. */
  private synchronize(func: () => void): void {
    if (this._synchronizing)
      return;

    this._synchronizing = true;
    try {
      func();
    } finally {
      this._synchronizing = false;

      const ids = this._ids.ids;
      if (0 === ids.length)
        delete this._json.excludedElements;
      else
        this._json.excludedElements = ids;
    }
  }
}

type OverridesArrayKey = "subCategoryOvr" | "modelOvr" | "planarClipOvr";

/** An implementation of Map that is based on a JSON array, used for a display styles subcategory overrides, model appearance overrides,
 * and planar clip masks. Ensures:
 *  - JSON representation kept in sync with changes to map; and
 *  - Events dispatched when map contents change.
 */
class OverridesMap<OverrideProps, Override> extends Map<Id64String, Override> {
  // This is required for mock framework used by ui libraries, which otherwise try to clone this as a standard Map.
  public override get [Symbol.toStringTag]() { return "OverridesMap"; }

  public constructor(
    private readonly _json: DisplayStyleSettingsProps,
    private readonly _arrayKey: OverridesArrayKey,
    private readonly _event: BeEvent<(id: Id64String, ovr: Override | undefined) => void>,
    private readonly _idFromProps: (props: OverrideProps) => Id64String | undefined,
    private readonly _overrideToProps: (ovr: Override, id: Id64String) => OverrideProps,
    private readonly _overrideFromProps: (props: OverrideProps) => Override | undefined) {
    super();
    this.populate();
  }

  public override set(id: Id64String, override: Override): this {
    this._event.raiseEvent(id, override);
    super.set(id, override);

    const index = this.findOrAllocateIndex(id);
    const array = this._array;
    assert(undefined !== array);
    array[index] = this._overrideToProps(override, id);

    return this;
  }

  public override delete(id: Id64String): boolean {
    this._event.raiseEvent(id, undefined);
    if (!super.delete(id))
      return false;

    const index = this.findExistingIndex(id);
    if (undefined !== index) {
      assert(undefined !== this._array);
      this._array.splice(index, 1);
    }

    return true;
  }

  public override clear(): void {
    for (const id of this.keys())
      this.delete(id);

    this._json[this._arrayKey] = undefined;
  }

  public populate(): void {
    super.clear();

    const ovrs = this._array;
    if (!ovrs)
      return;

    for (const props of ovrs) {
      const id = this._idFromProps(props);
      if (undefined !== id && Id64.isValidId64(id)) {
        const ovr = this._overrideFromProps(props);
        if (ovr)
          super.set(id, ovr);
      }
    }
  }

  private get _array(): OverrideProps[] | undefined {
    return JsonUtils.asArray(this._json[this._arrayKey]);
  }

  private findOrAllocateIndex(id: Id64String): number {
    const index = this.findExistingIndex(id);
    if (undefined !== index)
      return index;

    let ovrs = this._array;
    if (!ovrs)
      ovrs = this._json[this._arrayKey] = [];

    return ovrs.length;
  }

  private findExistingIndex(id: Id64String): number | undefined {
    const ovrs = this._array;
    if (!ovrs)
      return undefined;

    for (let i = 0; i < ovrs.length; i++)
      if (this._idFromProps(ovrs[i]) === id)
        return i;

    return undefined;
  }
}

/** Options supplied when constructing a [[DisplayStyleSettings]].
 * @public
 */
export interface DisplayStyleSettingsOptions {
  /** A function that instantiates a [[ContextRealityModel]] to be stored in [[DisplayStyleSettings.contextRealityModels]]. */
  createContextRealityModel?: (props: ContextRealityModelProps) => ContextRealityModel;
}

/** Provides access to the settings defined by a [[DisplayStyle]] or [[DisplayStyleState]], and ensures that
 * the style's JSON properties are kept in sync.
 * @public
 */
export class DisplayStyleSettings {
  protected readonly _json: DisplayStyleSettingsProps;
  private readonly _viewFlags: ViewFlags;
  private _background: ColorDef;
  private _monochrome: ColorDef;
  private _monochromeMode: MonochromeMode;
  private readonly _subCategoryOverrides: OverridesMap<DisplayStyleSubCategoryProps, SubCategoryOverride>;
  private readonly _modelAppearanceOverrides: OverridesMap<DisplayStyleModelAppearanceProps, FeatureAppearance>;
  private readonly _planarClipMasks: OverridesMap<DisplayStylePlanarClipMaskProps, PlanarClipMaskSettings>;
  private readonly _excludedElements: ExcludedElements;
  private _backgroundMap: BackgroundMapSettings;
  private _mapImagery: MapImagerySettings;
  private _analysisStyle?: AnalysisStyle;
  private _clipStyle: ClipStyle;
  private readonly _contextRealityModels: ContextRealityModels;

  public is3d(): this is DisplayStyle3dSettings {
    return false;
  }

  /** Planar clip masks to be applied to persistent reality models (@see [SpatialModelState.isRealityModel]($frontend).
   * The key for each entry is the Id of the model to which the mask settings apply.
   */
  public get planarClipMasks(): Map<Id64String, PlanarClipMaskSettings> {
    return this._planarClipMasks;
  }

  /** Reality models to be displayed in the view. */
  public get contextRealityModels(): ContextRealityModels {
    return this._contextRealityModels;
  }

  /** Event raised by [[applyOverrides]] just before the overrides are applied. */
  public readonly onApplyOverrides = new BeEvent<(overrides: Readonly<DisplayStyleSettingsProps>) => void>();
  /** Event raised by [[applyOverrides]] after the overrides are applied. */
  public readonly onOverridesApplied = new BeEvent<(overrides: Readonly<DisplayStyleSettingsProps>) => void>();
  /** Event raised just prior to assignment to the [[viewFlags]] property. */
  public readonly onViewFlagsChanged = new BeEvent<(newFlags: Readonly<ViewFlags>) => void>();
  /** Event raised just prior to assignment to the [[backgroundColor]] property. */
  public readonly onBackgroundColorChanged = new BeEvent<(newColor: ColorDef) => void>();
  /** Event raised just prior to assignment to the [[monochromeColor]] property. */
  public readonly onMonochromeColorChanged = new BeEvent<(newColor: ColorDef) => void>();
  /** Event raised just prior to assignment to the [[monochromeMode]] property. */
  public readonly onMonochromeModeChanged = new BeEvent<(newMode: MonochromeMode) => void>();
  /** Event raised just prior to assignment to the [[backgroundMap]] property. */
  public readonly onBackgroundMapChanged = new BeEvent<(newMap: BackgroundMapSettings) => void>();
  /** Event raised just prior to assignment to the [[mapImagery]] property.
   * @alpha
   */
  public readonly onMapImageryChanged = new BeEvent<(newImagery: Readonly<MapImagerySettings>) => void>();
  /** Event raised just prior to assignment to the `scheduleScriptProps` property.
   * @deprecated Use onRenderTimelineChanged
   * @internal
   */
  public readonly onScheduleScriptPropsChanged = new BeEvent<(newProps: Readonly<RenderSchedule.ModelTimelineProps[]> | undefined) => void>();

  /** Event raised just prior to assignment to the [[renderTimeline]] property. */
  public readonly onRenderTimelineChanged = new BeEvent<(newRenderTimeline: Id64String | undefined) => void>();
  /** Event raised just prior to assignment to the [[timePoint]] property. */
  public readonly onTimePointChanged = new BeEvent<(newTimePoint: number | undefined) => void>();
  /** Event raised just prior to assignment to the [[analysisStyle]] property. */
  public readonly onAnalysisStyleChanged = new BeEvent<(newStyle: Readonly<AnalysisStyle> | undefined) => void>();
  /** Event raised just prior to assignment to the [[analysisFraction]] property. */
  public readonly onAnalysisFractionChanged = new BeEvent<(newFraction: number) => void>();
  /** Event raised when the contents of [[excludedElementIds]] changes. */
  public readonly onExcludedElementsChanged = new BeEvent<() => void>();
  /** Event raised just prior to assignment to the [[clipStyle]] property. */
  public readonly onClipStyleChanged = new BeEvent<(newStyle: ClipStyle) => void>();
  /** Event raised when the [[SubCategoryOverride]]s change. */
  public readonly onSubCategoryOverridesChanged = new BeEvent<(subCategoryId: Id64String, newOverrides: SubCategoryOverride | undefined) => void>();
  /** Event raised just before changing the appearance override for a model. */
  public readonly onModelAppearanceOverrideChanged = new BeEvent<(modelId: Id64String, newAppearance: FeatureAppearance | undefined) => void>();
  /** Event raised just prior to assignment to the [[thematic]] property. */
  public readonly onThematicChanged = new BeEvent<(newThematic: ThematicDisplay) => void>();
  /** Event raised just prior to assignment to the [[hiddenLineSettings]] property. */
  public readonly onHiddenLineSettingsChanged = new BeEvent<(newSettings: HiddenLine.Settings) => void>();
  /** Event raised just prior to assignment to the [[ambientOcclusionSettings]] property. */
  public readonly onAmbientOcclusionSettingsChanged = new BeEvent<(newSettings: AmbientOcclusion.Settings) => void>();
  /** Event raised just prior to assignment to the [[solarShadows]] property. */
  public readonly onSolarShadowsChanged = new BeEvent<(newSettings: SolarShadowSettings) => void>();
  /** Event raised just prior to assignment to the [[environment]] property. */
  public readonly onEnvironmentChanged = new BeEvent<(newProps: Readonly<EnvironmentProps>) => void>();
  /** Event raised just prior to assignment to the [[lights]] property. */
  public readonly onLightsChanged = new BeEvent<(newLights: LightSettings) => void>();
  /** Event raised just before changing the plan projection settings for a model. */
  public readonly onPlanProjectionSettingsChanged = new BeEvent<(modelId: Id64String, newSettings: PlanProjectionSettings | undefined) => void>();
  /** Event raised just before adding or removing an entry from [[planarClipMasks]]. */
  public readonly onPlanarClipMaskChanged = new BeEvent<(modelId: Id64String, newSettings: PlanarClipMaskSettings | undefined) => void>();

  /** Construct a new DisplayStyleSettings from an [[ElementProps.jsonProperties]].
   * @param jsonProperties An object with an optional `styles` property containing a display style's settings.
   * @param options Options for customizing the display style settings.
   * @note When the `DisplayStyleSetting`'s properties are modified by public setters, the `jsonProperties`'s `styles` object will be updated to reflect the change.
   * @note If `jsonProperties` contains no `styles` member, one will be added as an empty object.
   * @note Generally there is no reason to create an object of this type directly; a [[DisplayStyle]] or [[DisplayStyleState]] constructs one as part of its own construction.
   */
  public constructor(jsonProperties: { styles?: DisplayStyleSettingsProps }, options?: DisplayStyleSettingsOptions) {
    if (undefined === jsonProperties.styles)
      jsonProperties.styles = {};

    this._json = jsonProperties.styles;
    this._viewFlags = ViewFlags.fromJSON(this._json.viewflags);
    this._background = ColorDef.fromJSON(this._json.backgroundColor);

    this._monochrome = undefined !== this._json.monochromeColor ? ColorDef.fromJSON(this._json.monochromeColor) : ColorDef.white;
    this._monochromeMode = MonochromeMode.Flat === this._json.monochromeMode ? MonochromeMode.Flat : MonochromeMode.Scaled;

    this._backgroundMap = BackgroundMapSettings.fromJSON(this._json.backgroundMap);
    this._mapImagery = MapImagerySettings.fromJSON(this._json.mapImagery, this._json.backgroundMap);

    this._excludedElements = new ExcludedElements(this._json);

    if (this._json.analysisStyle)
      this._analysisStyle = AnalysisStyle.fromJSON(this._json.analysisStyle);

    this._clipStyle = ClipStyle.fromJSON(this._json.clipStyle);

    this._subCategoryOverrides = new OverridesMap<DisplayStyleSubCategoryProps, SubCategoryOverride>(this._json, "subCategoryOvr", this.onSubCategoryOverridesChanged,
      (props) => props.subCategory,
      (ovr, subCategory) => { return { ...ovr.toJSON(), subCategory }; },
      (props) => {
        const ovr = SubCategoryOverride.fromJSON(props);
        return ovr.anyOverridden ? ovr : undefined;
      });

    this._modelAppearanceOverrides = new OverridesMap<DisplayStyleModelAppearanceProps, FeatureAppearance>(this._json, "modelOvr", this.onModelAppearanceOverrideChanged,
      (props) => props.modelId,
      (ovr, modelId) => { return { ...ovr.toJSON(), modelId }; },
      (props) => {
        const app = FeatureAppearance.fromJSON(props);
        return app.anyOverridden ? app : undefined;
      });

    this._planarClipMasks = new OverridesMap<DisplayStylePlanarClipMaskProps, PlanarClipMaskSettings>(this._json, "planarClipOvr", this.onPlanarClipMaskChanged,
      (props) => props.modelId,
      (ovr, modelId) => { return { ...ovr.toJSON(), modelId }; },
      (props) => {
        const settings = PlanarClipMaskSettings.fromJSON(props);
        return settings.isValid ? settings : undefined;
      });

    this._contextRealityModels = new ContextRealityModels(this._json, options?.createContextRealityModel);
  }

  /** Flags controlling various aspects of the display style. To change the style's view flags, do something like:
   * ```ts
   *  const flags = settings.viewFlags.clone();
   *  flags.renderMode = RenderMode.SmoothShade; // or any other alterations.
   *  settings.viewFlags = flags;
   * @note Don't modify this object directly - clone it and modify the clone, then pass the clone to the setter.
   */
  public get viewFlags(): ViewFlags { return this._viewFlags; }
  public set viewFlags(flags: ViewFlags) {
    if (this.viewFlags.equals(flags))
      return;

    this.onViewFlagsChanged.raiseEvent(flags);
    flags.clone(this._viewFlags);
    this._json.viewflags = flags.toJSON();
  }

  /** The background color.
   * @note Do not modify the color in place. Clone it and pass the clone to the setter.
   */
  public get backgroundColor(): ColorDef { return this._background; }
  public set backgroundColor(color: ColorDef) {
    if (this.backgroundColor.equals(color))
      return;

    this.onBackgroundColorChanged.raiseEvent(color);
    this._background = color;
    this._json.backgroundColor = color.toJSON();
  }

  /** The color used to draw geometry in monochrome mode.
   * @note Do not modify the color in place. Clone it and pass the clone to the setter.
   * @see [[ViewFlags.monochrome]] for enabling monochrome mode.
   */
  public get monochromeColor(): ColorDef { return this._monochrome; }
  public set monochromeColor(color: ColorDef) {
    if (this.monochromeColor.equals(color))
      return;

    this.onMonochromeColorChanged.raiseEvent(color);
    this._monochrome = color;
    this._json.monochromeColor = color.toJSON();
  }

  /** The style in which [[monochromeColor]] is applied. */
  public get monochromeMode(): MonochromeMode { return this._monochromeMode; }
  public set monochromeMode(mode: MonochromeMode) {
    if (this.monochromeMode === mode)
      return;

    this.onMonochromeModeChanged.raiseEvent(mode);
    this._monochromeMode = mode;
    this._json.monochromeMode = mode;
  }

  /** Settings controlling display of the background map within the view. */
  public get backgroundMap(): BackgroundMapSettings { return this._backgroundMap; }

  public set backgroundMap(map: BackgroundMapSettings) {
    if (!this.backgroundMap.equals(map)) {
      this.onBackgroundMapChanged.raiseEvent(map);
      this._backgroundMap = map; // it's an immutable type.
      this._json.backgroundMap = map.toJSON();
    }
  }

  /** Get the map imagery for this display style.  Map imagery includes the background map base as well as background layers and overlay layers.
   * In earlier versions only a background map image was supported as specified by the providerName and mapType members of [[BackgroundMapSettings]] object.
   * In order to provide backward compatibility the original [[BackgroundMapSettings]] are synchronized with the [[MapImagerySettings]] base layer as long as
   * the settings are compatible.  The map imagery typically only should be modified only through  [DisplayStyleState]($frontend) methods.
   * Map imagery should only be modified from backend, changes to map imagery from front end should be handled only through [DisplayStyleState]($frontend) methods.
   * @alpha
   */
  public get mapImagery(): MapImagerySettings { return this._mapImagery; }

  public set mapImagery(mapImagery: MapImagerySettings) {
    this.onMapImageryChanged.raiseEvent(mapImagery);
    this._mapImagery = mapImagery;
    this._json.mapImagery = this._mapImagery.toJSON();
  }

  /** @internal
   * Handles keeping the map imagery layers in synch after changes have been made (used internally only by front end)
   */
  public synchMapImagery() {
    this.onMapImageryChanged.raiseEvent(this._mapImagery);
    this._json.mapImagery = this._mapImagery.toJSON();
  }

  /** The Id of a [RenderTimeline]($backend) element containing a [[RenderSchedule.Script]] used to animate the view. */
  public get renderTimeline(): Id64String | undefined {
    return this._json.renderTimeline;
  }
  public set renderTimeline(id: Id64String | undefined) {
    this.onRenderTimelineChanged.raiseEvent(id);
    this._json.renderTimeline = id;
  }

  /** @internal @deprecated */
  public get scheduleScriptProps(): RenderSchedule.ModelTimelineProps[] | undefined {
    // eslint-disable-next-line deprecation/deprecation
    return this._json.scheduleScript;
  }
  public set scheduleScriptProps(props: RenderSchedule.ModelTimelineProps[] | undefined) {
    // eslint-disable-next-line deprecation/deprecation
    this.onScheduleScriptPropsChanged.raiseEvent(props);
    // eslint-disable-next-line deprecation/deprecation
    this._json.scheduleScript = props;
  }

  /** The point in time reflected by the view, in UNIX seconds.
   * This identifies a point on the timeline of the style's [[RenderSchedule.Script]], if any; it may also affect display of four-dimensional reality models.
   */
  public get timePoint(): number | undefined {
    return this._json.timePoint;
  }
  public set timePoint(timePoint: number | undefined) {
    if (timePoint !== this.timePoint) {
      this.onTimePointChanged.raiseEvent(timePoint);
      this._json.timePoint = timePoint;
    }
  }

  /** Settings controlling the display of analytical models.
   * @see [[analysisFraction]] to control playback of the animation.
   */
  public get analysisStyle(): AnalysisStyle | undefined { return this._analysisStyle; }
  public set analysisStyle(style: AnalysisStyle | undefined) {
    if (style === this.analysisStyle)
      return;

    this.onAnalysisStyleChanged.raiseEvent(style);
    this._analysisStyle = style;
    if (style)
      this._json.analysisStyle = style.toJSON();
    else
      delete this._json.analysisStyle;
  }

  /** A value in [0..1] indicating the current point in animation of the [[analysisStyle]], where 0 corresponds to the beginning of
   * the animation and 1 to the end.
   */
  public get analysisFraction(): number {
    const fraction = this._json.analysisFraction ?? 0;
    return Math.max(0, Math.min(1, fraction));
  }
  public set analysisFraction(fraction: number) {
    if (this.analysisFraction === fraction)
      return;

    this.onAnalysisFractionChanged.raiseEvent(fraction);
    this._json.analysisFraction = Math.max(0, Math.min(1, fraction));
  }

  /** Customize the way geometry belonging to a [[SubCategory]] is drawn by this display style.
   * @param id The Id of the SubCategory whose appearance is to be overridden.
   * @param ovr The overrides to apply to the [[SubCategoryAppearance]].
   * @see [[dropSubCategoryOverride]]
   */
  public overrideSubCategory(id: Id64String, ovr: SubCategoryOverride): void {
    this.subCategoryOverrides.set(id, ovr);
  }

  /** Remove any [[SubCategoryOverride]] applied to a [[SubCategoryAppearance]] by this style.
   * @param id The Id of the [[SubCategory]].
   * @see [[overrideSubCategory]]
   */
  public dropSubCategoryOverride(id: Id64String): void {
    this.subCategoryOverrides.delete(id);
  }

  /** The overrides applied by this style. */
  public get subCategoryOverrides(): Map<Id64String, SubCategoryOverride> {
    return this._subCategoryOverrides;
  }

  /** Obtain the override applied to a [[SubCategoryAppearance]] by this style.
   * @param id The Id of the [[SubCategory]].
   * @returns The corresponding SubCategoryOverride, or undefined if the SubCategory's appearance is not overridden.
   * @see [[overrideSubCategory]]
   */
  public getSubCategoryOverride(id: Id64String): SubCategoryOverride | undefined {
    return this.subCategoryOverrides.get(id);
  }

  /** Returns true if an [[SubCategoryOverride]]s are defined by this style. */
  public get hasSubCategoryOverride(): boolean {
    return this.subCategoryOverrides.size > 0;
  }

  /** Customize the way a [Model]($backend)   is drawn by this display style.
   * @param modelId The Id of the [Model]($backend)  whose appearance is to be overridden.
   * @param ovr The overrides to apply to the [Model]($backend) .
   * @see [[dropModelAppearanceOverride]]
   */
  public overrideModelAppearance(modelId: Id64String, ovr: FeatureAppearance): void {
    this.modelAppearanceOverrides.set(modelId, ovr);
  }

  /** Remove any appearance overrides applied to a [Model]($backend)  by this style.
   * @param modelId The Id of the [Model]($backend) .
   * @param ovr The overrides to apply to the [Model]($backend) .
   * @see [[overrideModelAppearance]]
   */
  public dropModelAppearanceOverride(id: Id64String): void {
    this.modelAppearanceOverrides.delete(id);
  }

  /** The overrides applied by this style. */
  public get modelAppearanceOverrides(): Map<Id64String, FeatureAppearance> {
    return this._modelAppearanceOverrides;
  }

  /** Obtain the override applied to a [Model]($backend)  by this style.
   * @param id The Id of the [Model]($backend).
   * @returns The corresponding FeatureAppearance, or undefined if the Model's appearance is not overridden.
   * @see [[overrideModelAppearance]]
   */
  public getModelAppearanceOverride(id: Id64String): FeatureAppearance | undefined {
    return this.modelAppearanceOverrides.get(id);
  }

  /** Returns true if model appearance overrides are defined by this style. */
  public get hasModelAppearanceOverride(): boolean {
    return this.modelAppearanceOverrides.size > 0;
  }

  /** The set of elements that will not be drawn by this display style.
   * @returns The set of excluded elements.
   * @note The set and the Ids it contains may be very large. It is allocated the first time this property is requested.
   * @deprecated Use [[excludedElementIds]] for better performance and reduced memory overhead, unless efficient lookup of Ids within the set is required.
   */
  public get excludedElements(): Set<Id64String> {
    return this._excludedElements.obtainSet();
  }

  /** The set of elements that will not be drawn by this display style.
   * @returns An iterable over the elements' Ids.
   */
  public get excludedElementIds(): OrderedId64Iterable {
    return this._excludedElements;
  }

  /** @internal */
  public get compressedExcludedElementIds(): CompressedId64Set {
    return this._excludedElements.ids;
  }

  /** Add one or more elements to the set of elements not to be displayed.
   * @param id The Ids of the element(s) to be excluded.
   */
  public addExcludedElements(id: Id64String | Iterable<Id64String>) {
    this._excludedElements.add("string" === typeof id ? [id] : id);
    this.onExcludedElementsChanged.raiseEvent();
  }

  /** Remove an element from the set of elements not to be displayed. */
  public dropExcludedElement(id: Id64String): void {
    this._excludedElements.delete([id]);
    this.onExcludedElementsChanged.raiseEvent();
  }

  /** Remove one or more elements from the set of elements not to be displayed.
   * @param id The Ids of the element(s) to be removed from the set of excluded elements.
   */
  public dropExcludedElements(id: Id64String | Iterable<Id64String>) {
    this._excludedElements.delete("string" === typeof id ? [id] : id);
    this.onExcludedElementsChanged.raiseEvent();
  }

  /** Remove all elements from the set of elements not to be displayed. */
  public clearExcludedElements(): void {
    this._excludedElements.reset(undefined);
    this.onExcludedElementsChanged.raiseEvent();
  }

  /** The style applied to the view's [ClipVector]($geometry-core). */
  public get clipStyle(): ClipStyle {
    return this._clipStyle;
  }
  public set clipStyle(style: ClipStyle) {
    this.onClipStyleChanged.raiseEvent(style);
    this._clipStyle = style;
    if (style.matchesDefaults)
      delete this._json.clipStyle;
    else
      this._json.clipStyle = style.toJSON();
  }

  /** @internal */
  public toJSON(): DisplayStyleSettingsProps {
    return this._json;
  }

  /** Serialize a subset of these settings to JSON, such that they can be applied to another DisplayStyleSettings to selectively override those settings.
   * @param options Specifies which settings should be serialized. By default, settings that are specific to an iModel (e.g., subcategory overrides) or project (e.g., context reality models)
   * are omitted, as are drawing aids (e.g., ACS triad and grid).
   * @returns a JSON representation of the selected settings suitable for passing to [[applyOverrides]].
   * @see [[applyOverrides]] to apply the overrides to another DisplayStyleSettings..
   */
  public toOverrides(options?: DisplayStyleOverridesOptions): DisplayStyleSettingsProps {
    if (options?.includeAll) {
      return {
        ...this.toJSON(),
        viewflags: this.viewFlags.toFullyDefinedJSON(),
      };
    }

    const viewflags: Partial<ViewFlagProps> = this.viewFlags.toFullyDefinedJSON();
    const props: DisplayStyleSettingsProps = {
      viewflags,
      backgroundColor: this.backgroundColor.toJSON(),
      monochromeColor: this.monochromeColor.toJSON(),
      monochromeMode: this.monochromeMode,
    };

    if (options?.includeBackgroundMap)
      props.backgroundMap = this.backgroundMap.toJSON();
    else
      delete viewflags.backgroundMap;

    if (!options?.includeDrawingAids) {
      delete viewflags.acs;
      delete viewflags.grid;
    }

    if (options?.includeProjectSpecific || options?.includeIModelSpecific) {
      props.timePoint = this.timePoint;
      if (this._json.contextRealityModels) {
        props.contextRealityModels = this._json.contextRealityModels;
        if (!options?.includeIModelSpecific)
          for (const model of this._json.contextRealityModels)
            delete model.classifiers;
      }
    }

    if (options?.includeIModelSpecific) {
      if (this.analysisStyle) {
        props.analysisStyle = this.analysisStyle.toJSON();
        props.analysisFraction = this.analysisFraction;
      }

      // eslint-disable-next-line deprecation/deprecation
      if (this.scheduleScriptProps) {
        // eslint-disable-next-line deprecation/deprecation
        props.scheduleScript = [...this.scheduleScriptProps];
      }

      if (this.renderTimeline)
        props.renderTimeline = this.renderTimeline;

      props.subCategoryOvr = this._json.subCategoryOvr ? [...this._json.subCategoryOvr] : [];
      props.modelOvr = this._json.modelOvr ? [...this._json.modelOvr] : [];
      props.excludedElements = this._excludedElements.ids;
    }

    return props;
  }

  /** Selectively override some of these settings. Any field that is explicitly defined by the input will be overridden in these settings; any fields left undefined in the input
   * will retain their current values in these settings. The input's [[ViewFlags]] are applied individually - only those flags that are explicitly defined will be overridden.
   * For example, the following overrides will set the render mode to "smooth", change the background color to white, turn shadows off, and leave all other settings intact:
   * ```ts
   *  {
   *    viewflags: {
   *      renderMode: RenderMode.SmoothShade,
   *      shadows: false,
   *    },
   *    backgroundColor: ColorByName.white,
   *  }
   * ```
   * @see [[toOverrides]] to produce overrides from an existing DisplayStyleSettings.
   */
  public applyOverrides(overrides: DisplayStyleSettingsProps): void {
    this._applyOverrides(overrides);
    this.onOverridesApplied.raiseEvent(overrides);
  }

  /** @internal */
  protected _applyOverrides(overrides: DisplayStyleSettingsProps): void {
    this.onApplyOverrides.raiseEvent(overrides);

    if (overrides.viewflags) {
      this.viewFlags = ViewFlags.fromJSON({
        ...this.viewFlags.toJSON(),
        ...overrides.viewflags,
      });
    }

    if (undefined !== overrides.backgroundColor)
      this.backgroundColor = ColorDef.fromJSON(overrides.backgroundColor);

    if (undefined !== overrides.monochromeColor)
      this.monochromeColor = ColorDef.fromJSON(overrides.monochromeColor);

    if (undefined !== overrides.monochromeMode)
      this.monochromeMode = overrides.monochromeMode;

    if (overrides.backgroundMap)
      this.backgroundMap = BackgroundMapSettings.fromJSON(overrides.backgroundMap);

    if (undefined !== overrides.timePoint)
      this.timePoint = overrides.timePoint;

    if (overrides.contextRealityModels) {
      this.contextRealityModels.clear();
      for (const props of overrides.contextRealityModels)
        this.contextRealityModels.add(props);
    }

    if (overrides.analysisStyle)
      this.analysisStyle = AnalysisStyle.fromJSON(overrides.analysisStyle);

    if (undefined !== overrides.analysisFraction)
      this.analysisFraction = overrides.analysisFraction;

    // eslint-disable-next-line deprecation/deprecation
    if (overrides.scheduleScript) {
      // eslint-disable-next-line deprecation/deprecation
      this.scheduleScriptProps = [...overrides.scheduleScript];
    }

    if (overrides.renderTimeline)
      this.renderTimeline = overrides.renderTimeline;

    if (overrides.subCategoryOvr) {
      this._json.subCategoryOvr = [...overrides.subCategoryOvr];
      this._subCategoryOverrides.populate();
    }

    if (overrides.modelOvr) {
      this._json.modelOvr = [...overrides.modelOvr];
      this._modelAppearanceOverrides.populate();
    }

    if (overrides.excludedElements)
      this._excludedElements.reset("string" === typeof overrides.excludedElements ? overrides.excludedElements : [...overrides.excludedElements]);

    this.onOverridesApplied.raiseEvent(overrides);
  }
}

/** Provides access to the settings defined by a [[DisplayStyle3d]] or [[DisplayStyle3dState]], and ensures that
 * the style's JSON properties are kept in sync.
 * @public
 */
export class DisplayStyle3dSettings extends DisplayStyleSettings {
  private _thematic: ThematicDisplay;
  private _hline: HiddenLine.Settings;
  private _ao: AmbientOcclusion.Settings;
  private _solarShadows: SolarShadowSettings;
  private _lights: LightSettings;
  private _planProjections?: Map<string, PlanProjectionSettings>;

  private get _json3d(): DisplayStyle3dSettingsProps { return this._json as DisplayStyle3dSettingsProps; }

  public override is3d(): this is DisplayStyle3dSettings {
    return true;
  }

  public constructor(jsonProperties: { styles?: DisplayStyle3dSettingsProps }, options?: DisplayStyleSettingsOptions) {
    super(jsonProperties, options);
    this._thematic = ThematicDisplay.fromJSON(this._json3d.thematic);
    this._hline = HiddenLine.Settings.fromJSON(this._json3d.hline);
    this._ao = AmbientOcclusion.Settings.fromJSON(this._json3d.ao);
    this._solarShadows = SolarShadowSettings.fromJSON(this._json3d.solarShadows);

    // Very long ago we used to stick MicroStation's light settings into json.sceneLights. Later we started adding the sunDir.
    // We don't want any of MicroStation's settings. We do want to preserve the sunDir if present.
    if (this._json3d.lights) {
      this._lights = LightSettings.fromJSON(this._json3d.lights);
    } else {
      const sunDir = this._json3d.sceneLights?.sunDir; // eslint-disable-line deprecation/deprecation
      this._lights = LightSettings.fromJSON(sunDir ? { solar: { direction: sunDir } } : undefined);
    }

    this.populatePlanProjectionsFromJSON();
  }

  private populatePlanProjectionsFromJSON(): void {
    this._planProjections = undefined;
    const projections = this._json3d.planProjections;
    if (undefined !== projections) {
      for (const key of Object.keys(projections)) {
        const id = Id64.fromJSON(key);
        if (!Id64.isValidId64(id)) {
          delete projections[key];
          continue;
        }

        const settings = PlanProjectionSettings.fromJSON(projections[key]);
        if (undefined === settings) {
          delete projections[key];
          continue;
        }

        if (undefined === this._planProjections)
          this._planProjections = new Map<string, PlanProjectionSettings>();

        this._planProjections.set(id, settings);
      }
    }
  }

  /** @internal */
  public override toJSON(): DisplayStyle3dSettingsProps {
    return this._json3d;
  }

  /** @internal */
  public override toOverrides(options?: DisplayStyleOverridesOptions): DisplayStyle3dSettingsProps {
    const props = super.toOverrides(options) as DisplayStyle3dSettingsProps;
    if (options?.includeAll)
      return props;

    assert(undefined !== props.viewflags);

    props.environment = { ...this.environment };
    props.hline = this.hiddenLineSettings.toJSON();
    props.ao = this.ambientOcclusionSettings.toJSON();
    props.solarShadows = this.solarShadows.toJSON();
    props.lights = this.lights.toJSON();

    if (options?.includeIModelSpecific) {
      props.thematic = this.thematic.toJSON();
      if (this._json3d.planProjections)
        props.planProjections = { ...this._json3d.planProjections };
    } else if (ThematicDisplayMode.InverseDistanceWeightedSensors !== this.thematic.displayMode) {
      props.thematic = {
        ...this.thematic.toJSON(),
        sensorSettings: undefined,
      };

      if (ThematicDisplayMode.Height === props.thematic.displayMode) {
        // DisplayStyle3dState will compute range based on project extents.
        props.thematic.range = undefined;
      }
    }

    return props;
  }

  /** Selectively override some of these settings. Any field that is explicitly defined by the input will be overridden in these settings; any fields left undefined in the input
   * will retain their current values in these settings. The input's [[ViewFlags]] are applied individually - only those flags that are explicitly defined will be overridden.
   * For example, the following overrides will set the render mode to "smooth", change the background color to white, turn shadows off, and leave all other settings intact:
   * ```ts
   *  {
   *    viewflags: {
   *      renderMode: RenderMode.SmoothShade,
   *      shadows: false,
   *    },
   *    backgroundColor: ColorByName.white,
   *  }
   * ```
   * @see [[toOverrides]] to produce overrides from an existing DisplayStyleSettings.
   * @internal override
   */
  public override applyOverrides(overrides: DisplayStyle3dSettingsProps): void {
    super._applyOverrides(overrides);

    if (overrides.environment)
      this.environment = { ...overrides.environment };

    if (overrides.hline)
      this.hiddenLineSettings = HiddenLine.Settings.fromJSON(overrides.hline);

    if (overrides.ao)
      this.ambientOcclusionSettings = AmbientOcclusion.Settings.fromJSON(overrides.ao);

    if (overrides.solarShadows)
      this.solarShadows = SolarShadowSettings.fromJSON(overrides.solarShadows);

    if (overrides.lights)
      this.lights = LightSettings.fromJSON(overrides.lights);

    if (overrides.planProjections) {
      this._json3d.planProjections = { ...overrides.planProjections };
      this.populatePlanProjectionsFromJSON();
    }

    if (overrides.thematic)
      this.thematic = ThematicDisplay.fromJSON(overrides.thematic);

    this.onOverridesApplied.raiseEvent(overrides);
  }

  /** The settings that control thematic display. */
  public get thematic(): ThematicDisplay { return this._thematic; }
  public set thematic(thematic: ThematicDisplay) {
    if (thematic.equals(this.thematic))
      return;

    this.onThematicChanged.raiseEvent(thematic);
    this._thematic = thematic;
    this._json3d.thematic = thematic.toJSON();
  }

  /** The settings that control how visible and hidden edges are displayed.  */
  public get hiddenLineSettings(): HiddenLine.Settings { return this._hline; }
  public set hiddenLineSettings(hline: HiddenLine.Settings) {
    if (hline.equals(this.hiddenLineSettings))
      return;

    this.onHiddenLineSettingsChanged.raiseEvent(hline);
    this._hline = hline;
    this._json3d.hline = hline.toJSON();
  }

  /** The settings that control how ambient occlusion is displayed. */
  public get ambientOcclusionSettings(): AmbientOcclusion.Settings { return this._ao; }
  public set ambientOcclusionSettings(ao: AmbientOcclusion.Settings) {
    this.onAmbientOcclusionSettingsChanged.raiseEvent(ao);
    this._ao = ao;
    this._json3d.ao = ao.toJSON();
  }

  /** The settings that control how solar shadows are displayed. */
  public get solarShadows(): SolarShadowSettings {
    return this._solarShadows;
  }
  public set solarShadows(solarShadows: SolarShadowSettings) {
    if (solarShadows.equals(this.solarShadows))
      return;

    this.onSolarShadowsChanged.raiseEvent(solarShadows);
    this._solarShadows = solarShadows;
    const json = solarShadows.toJSON();
    if (!json)
      delete this._json3d.solarShadows;
    else
      this._json3d.solarShadows = json;
  }

  /** @internal */
  public get environment(): EnvironmentProps {
    const env = this._json3d.environment;
    return undefined !== env ? env : {};
  }
  public set environment(environment: EnvironmentProps) {
    this.onEnvironmentChanged.raiseEvent(environment);
    this._json3d.environment = environment;
  }

  public get lights(): LightSettings {
    return this._lights;
  }
  public set lights(lights: LightSettings) {
    if (this.lights.equals(lights))
      return;

    this.onLightsChanged.raiseEvent(lights);
    this._lights = lights;
    this._json3d.lights = lights.toJSON();
  }

  /** Adjust the solar light direction based on a date and time at a geographic location.
   * This replaces `this.lights` with a copy that records the time point and the computed direction.
   * @param timePoint The time in UNIX milliseconds.
   * @param location The geographic location; or an iModel, in which case the iModel's [[EcefLocation]] is used.
   * @see [[sunTime]] to get the current sun time.
   * @see [[clearSunTime]] to clear the time point.
   * @note If `location` is an iModel lacking an EcefLocation, a location in Exton, Pennsylvania will be used to compute the light direction instead.
   */
  public setSunTime(timePoint: number, location: IModel | Cartographic): void {
    let cartoCenter;
    if (location instanceof IModel) {
      if (location.ecefLocation)
        cartoCenter = Cartographic.fromEcef(location.ecefLocation.origin);

      if (!cartoCenter)
        cartoCenter = Cartographic.fromDegrees(-75.17035, 39.954927, 0.0);
    } else {
      cartoCenter = location;
    }

    const direction = calculateSolarDirection(new Date(timePoint), cartoCenter);
    this.lights = this.lights.clone({ solar: { direction, timePoint } });
  }

  /** Clear the solar time point stored in `this.lights.solarLight`.
   * @note This does not affect the solar light direction.
   * @see [[sunTime]] to get the current sun time.
   * @see [[setSunTime]] to set the time point and the solar light direction derived from it.
   */
  public clearSunTime(): void {
    if (this.lights.solar.timePoint === undefined)
      return;

    const solar = this.lights.solar.toJSON() ?? {};
    solar.timePoint = undefined;
    this.lights = this.lights.clone({ solar });
  }

  /** The time point from which the solar light direction was derived, in UNIX milliseconds.
   * @see [[setSunTime]] to change the time point and solar direction.
   * @see [[clearSunTime]] to reset the time point to `undefined`.
   */
  public get sunTime(): number | undefined {
    return this.lights.solar.timePoint;
  }

  /** Get the plan projection settings associated with the specified model, if defined. */
  public getPlanProjectionSettings(modelId: Id64String): PlanProjectionSettings | undefined {
    return undefined !== this._planProjections ? this._planProjections.get(modelId) : undefined;
  }

  /** Set or clear the plan projection settings associated with the specified model. */
  public setPlanProjectionSettings(modelId: Id64String, settings: PlanProjectionSettings | undefined): void {
    this.onPlanProjectionSettingsChanged.raiseEvent(modelId, settings);

    if (undefined === settings) {
      if (undefined !== this._planProjections) {
        assert(undefined !== this._json3d.planProjections);

        this._planProjections.delete(modelId);
        delete this._json3d.planProjections[modelId];

        if (0 === this._planProjections.size) {
          this._planProjections = undefined;
          delete this._json3d.planProjections;
        }
      }

      return;
    }

    if (undefined === this._planProjections) {
      this._planProjections = new Map<string, PlanProjectionSettings>();
      this._json3d.planProjections = {};
    }

    this._planProjections.set(modelId, settings);
    this._json3d.planProjections![modelId] = settings.toJSON();
  }

  /** An iterator over all of the defined plan projection settings. The iterator includes the Id of the model associated with each settings object. */
  public get planProjectionSettings(): Iterable<[Id64String, PlanProjectionSettings]> | undefined {
    return undefined !== this._planProjections ? this._planProjections.entries() : undefined;
  }
}
