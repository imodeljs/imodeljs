/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Views
 */
import { assert, BeEvent, Id64, Id64String, JsonUtils } from "@bentley/bentleyjs-core";
import { Angle, Range1d, Vector3d } from "@bentley/geometry-core";
import {
  BackgroundMapProps, BackgroundMapSettings, BaseLayerSettings, ColorDef, ContextRealityModelProps, DisplayStyle3dSettings, DisplayStyle3dSettingsProps,
  DisplayStyleProps, DisplayStyleSettings, EnvironmentProps, FeatureAppearance, GlobeMode, GroundPlane, LightSettings, MapLayerProps,
  MapLayerSettings, MapSubLayerProps, PlanarClipMaskMode, PlanarClipMaskSettings, RenderSchedule, RenderTexture, RenderTimelineProps, SkyBoxImageType, SkyBoxProps,
  SkyCubeProps, SolarShadowSettings, SubCategoryOverride, SubLayerId, TerrainHeightOriginMode, ThematicDisplay, ThematicDisplayMode, ThematicGradientMode, ViewFlags,
} from "@bentley/imodeljs-common";
import { ApproximateTerrainHeights } from "./ApproximateTerrainHeights";
import { BackgroundMapGeometry } from "./BackgroundMapGeometry";
import { ContextRealityModelState } from "./ContextRealityModelState";
import { ElementState } from "./EntityState";
import { IModelApp } from "./IModelApp";
import { IModelConnection } from "./IModelConnection";
import { PlanarClipMaskState } from "./PlanarClipMaskState";
import { AnimationBranchStates } from "./render/GraphicBranch";
import { RenderSystem, TextureImage } from "./render/RenderSystem";
import { RenderScheduleState } from "./RenderScheduleState";
import { getCesiumOSMBuildingsUrl, MapCartoRectangle, RealityModelTileTree, TileTreeReference } from "./tile/internal";
import { viewGlobalLocation, ViewGlobalLocationConstants } from "./ViewGlobalLocation";
import { OsmBuildingDisplayOptions, ScreenViewport, Viewport } from "./Viewport";

/** @internal */
export class TerrainDisplayOverrides {
  public wantSkirts?: boolean;
  public wantNormals?: boolean;
  public produceGeometry?: boolean;
}

/** A DisplayStyle defines the parameters for 'styling' the contents of a [[ViewState]].
 * @public
 */
export abstract class DisplayStyleState extends ElementState implements DisplayStyleProps {
  /** @internal */
  public static get className() { return "DisplayStyle"; }
  private readonly _contextRealityModels: ContextRealityModelState[] = [];
  private _scheduleState?: RenderScheduleState;
  private _ellipsoidMapGeometry: BackgroundMapGeometry | undefined;
  private _attachedRealityModelPlanarClipMasks = new Map<Id64String, PlanarClipMaskState>();
  /** Event raised just before the [[scheduleScriptReference]] property is changed. */
  public readonly onScheduleScriptReferenceChanged = new BeEvent<(newScriptReference: RenderSchedule.ScriptReference | undefined) => void>();

  /** The container for this display style's settings. */
  public abstract get settings(): DisplayStyleSettings;

  /** @internal */
  public abstract overrideTerrainDisplay(): TerrainDisplayOverrides | undefined;

  /** Construct a new DisplayStyleState from its JSON representation.
   * @param props JSON representation of the display style.
   * @param iModel IModelConnection containing the display style.
   * @param source If the constructor is being invoked from [[EntityState.clone]], the display style that is being cloned.
   */
  constructor(props: DisplayStyleProps, iModel: IModelConnection, source?: DisplayStyleState) {
    super(props, iModel);
    const styles = this.jsonProperties.styles;

    if (source)
      this._scheduleState = source._scheduleState;

    if (styles) {
      if (styles.contextRealityModels)
        for (const contextRealityModel of styles.contextRealityModels)
          this._contextRealityModels.push(new ContextRealityModelState(contextRealityModel, this.iModel, this));

      if (styles.planarClipOvr)
        for (const planarClipOvr of styles.planarClipOvr)
          if (Id64.isValid(planarClipOvr.modelId))
            this._attachedRealityModelPlanarClipMasks.set(planarClipOvr.modelId, PlanarClipMaskState.fromJSON(planarClipOvr));
    }
  }

  /** Ensures all of the data required by the display style is loaded. This method is invoked for you by [[ViewState.load]], but if
   * you obtain a display style by some other means you should `await` this method before using the display style.
   */
  public async load(): Promise<void> {
    // If we were cloned, we may already have a valid schedule state, and our display style Id may be invalid / different.
    // Preserve it if still usable.
    if (this._scheduleState) {
      if (this.settings.renderTimeline === this._scheduleState.sourceId) {
        // The script came from the same RenderTimeline element. Keep it.
        return;
      }

      if (undefined === this.settings.renderTimeline) {
        // The script cam from a display style's JSON properties. Keep it if (1) this style is not persistent or (2) this style has the same Id
        if (this.id === this._scheduleState.sourceId || !Id64.isValidId64(this.id))
          return;
      }
    }

    this._scheduleState = await this.loadScheduleState();
  }

  private async loadScheduleState(): Promise<RenderScheduleState | undefined> {
    // The script can be stored on a separate RenderTimeline element (new, preferred way); or stuffed into the display style's JSON properties (old, deprecated way).
    try {
      let script;
      let sourceId;
      if (this.settings.renderTimeline) {
        const timeline = await this.iModel.elements.loadProps(this.settings.renderTimeline, { renderTimeline: { omitScriptElementIds: true } }) as RenderTimelineProps;
        if (timeline) {
          const scriptProps = JSON.parse(timeline.script);
          script = RenderSchedule.Script.fromJSON(scriptProps);
          sourceId = this.settings.renderTimeline;
        }
      } else if (this.settings.scheduleScriptProps) { // eslint-disable-line deprecation/deprecation
        // eslint-disable-next-line deprecation/deprecation
        script = RenderSchedule.Script.fromJSON(this.settings.scheduleScriptProps);
        sourceId = this.id;
      }

      return (script && sourceId) ? new RenderScheduleState(sourceId, script) : undefined;
    } catch (_) {
      return undefined;
    }
  }

  /** @internal */
  public get displayTerrain() {
    return this.viewFlags.backgroundMap && this.settings.backgroundMap.applyTerrain;
  }

  /** @internal */
  public get globeMode(): GlobeMode { return this.settings.backgroundMap.globeMode; }

  /** @internal */
  public get backgroundMapLayers(): MapLayerSettings[] { return this.settings.mapImagery.backgroundLayers; }

  /** @internal */
  public get backgroundMapBase(): BaseLayerSettings | undefined { return this.settings.mapImagery.backgroundBase; }

  /** @internal */
  public get overlayMapLayers(): MapLayerSettings[] { return this.settings.mapImagery.overlayLayers; }

  /** The settings controlling how a background map is displayed within a view.
   * @see [[ViewFlags.backgroundMap]] for toggling display of the map on or off.
   */
  public get backgroundMapSettings(): BackgroundMapSettings { return this.settings.backgroundMap; }
  public set backgroundMapSettings(settings: BackgroundMapSettings) {
    this.settings.backgroundMap = settings;
  }

  /** Modify a subset of the background map display settings.
   * @param name props JSON representation of the properties to change. Any properties not present will retain their current values in `this.backgroundMapSettings`.
   * @note If the style is associated with a Viewport, [[Viewport.changeBackgroundMapProps]] should be used instead to ensure the view updates immediately.
   * @see [[ViewFlags.backgroundMap]] for toggling display of the map.
   *
   * Example that changes only the elevation, leaving the provider and type unchanged:
   * ``` ts
   *  style.changeBackgroundMapProps({ groundBias: 16.2 });
   * ```
   */
  public changeBackgroundMapProps(props: BackgroundMapProps): void {
    const newSettings = this.backgroundMapSettings.clone(props);
    this.backgroundMapSettings = newSettings;
    if (props.providerName !== undefined || props.providerData?.mapType !== undefined) {
      const mapBase = MapLayerSettings.fromMapSettings(newSettings);
      this.settings.mapImagery.backgroundBase = mapBase;
    }
  }

  /** @beta
   * call function for each reality model attached to this display style.
   * @see [[ContextRealityModelProps]].
   */
  public forEachRealityModel(func: (model: ContextRealityModelState) => void): void {
    for (const model of this._contextRealityModels)
      func(model);
  }

  /** @internal */
  public forEachRealityTileTreeRef(func: (ref: TileTreeReference) => void): void {
    this.forEachRealityModel((model) => func(model.treeRef));
  }

  /** @internal */
  public forEachTileTreeRef(func: (ref: TileTreeReference) => void): void {
    this.forEachRealityTileTreeRef(func);
  }

  /** Performs logical comparison against another display style. Two display styles are logically equivalent if they have the same name, Id, and settings.
   * @param other The display style to which to compare.
   * @returns true if the specified display style is logically equivalent to this display style - i.e., both styles have the same values for all of their settings.
   */
  public equalState(other: DisplayStyleState): boolean {
    if (this.name !== other.name || this.id !== other.id)
      return false;
    else
      return JSON.stringify(this.settings) === JSON.stringify(other.settings);
  }

  /** The name of this DisplayStyle */
  public get name(): string { return this.code.value; }

  /** Change the Id of the [RenderTimeline]($backend) element that hosts the [RenderSchedule.Script]($common) to be applied by this display style for
   * animating the contents of the view.
   */
  public async changeRenderTimeline(timelineId: Id64String | undefined): Promise<void> {
    if (timelineId === this.settings.renderTimeline)
      return;

    const script = await this.loadScheduleState();
    this.onScheduleScriptReferenceChanged.raiseEvent(script);
    this._scheduleState = script;
  }

  /** The [RenderSchedule.Script]($common) that animates the contents of the view, if any.
   * @see [[changeRenderTimeline]] to change the script.
   */
  public get scheduleScript(): RenderSchedule.Script | undefined {
    return this._scheduleState?.script;
  }

  /** The [RenderSchedule.Script]($common) that animates the contents of the view, if any, along with the Id of the element that hosts the script.
   * @note The host element may be a [RenderTimeline]($backend) or a [DisplayStyle]($backend).
   * @see [[changeRenderTimeline]] to change the script.
   */
  public get scheduleScriptReference(): RenderSchedule.ScriptReference | undefined {
    return this._scheduleState;
  }

  /** @internal */
  public get scheduleState(): RenderScheduleState | undefined {
    return this._scheduleState;
  }

  /** This is only used by [RealityTransitionTool]($frontend-devtools). It basically can only work if the script contains nothing that requires special tiles to be generated -
   * no symbology changes, transforms, or clipping - because the backend tile generator requires a *persistent* element to host the script for those features to work.
   * @internal
   */
  public setScheduleState(state: RenderScheduleState | undefined): void {
    this.onScheduleScriptReferenceChanged.raiseEvent(state);
    this._scheduleState = state;

    // eslint-disable-next-line deprecation/deprecation
    this.settings.scheduleScriptProps = state?.script.toJSON();
  }

  /** @internal */
  public getAnimationBranches(scheduleTime: number): AnimationBranchStates | undefined {
    return this.scheduleState?.getAnimationBranches(scheduleTime);
  }

  /**
   * Attach a context reality model
   * @see [[ContextRealityModelProps]].
   * @beta
   * */
  public attachRealityModel(props: ContextRealityModelProps): void {
    // ###TODO check if url+name already present...or do we allow same to be attached multiple times?
    if (undefined === this.jsonProperties.styles)
      this.jsonProperties.styles = {};

    if (undefined === this.jsonProperties.styles.contextRealityModels)
      this.jsonProperties.styles.contextRealityModels = [];

    this.jsonProperties.styles.contextRealityModels.push(props);
    this._contextRealityModels.push(new ContextRealityModelState(props, this.iModel, this));
  }

  /**
   * Detach a context reality model from its name and url.
   * @see [[ContextRealityModelProps]].
   * @beta
   */
  public detachRealityModelByNameAndUrl(name: string, url: string): void {
    const index = this._contextRealityModels.findIndex((x) => x.matchesNameAndUrl(name, url));
    if (- 1 !== index)
      this.detachRealityModelByIndex(index);
  }

  /** @beta
   * Return the index for the OpenStreetMap world building layer or -1 if it is not enabled for this display stye.
   */
  public getOSMBuildingDisplayIndex(): number {
    const tilesetUrl = getCesiumOSMBuildingsUrl();
    return this._contextRealityModels.findIndex((x) => x.url === tilesetUrl);
  }

  /** Set the display of the OpenStreetMap worldwide building layer in this display style by attaching or detaching the reality model displaying the buildings.
   * The OSM buildings are displayed from a reality model aggregated and served from Cesium ion.<(https://cesium.com/content/cesium-osm-buildings/>
   * The options [[OsmBuildingDisplayOptions]] control the display and appearance overrides.
   * @beta
   */
  public setOSMBuildingDisplay(options: OsmBuildingDisplayOptions): boolean {
    if (!this.iModel.isGeoLocated || this.globeMode !== GlobeMode.Ellipsoid)  // The OSM tile tree is ellipsoidal.
      return false;

    let currentIndex = this.getOSMBuildingDisplayIndex();
    if (options.onOff === false && currentIndex >= 0) {
      this.detachRealityModelByIndex(currentIndex);
      return true;
    }

    if (options.onOff === true && currentIndex < 0) {
      const tilesetUrl = getCesiumOSMBuildingsUrl();
      const name = IModelApp.i18n.translate("iModelJs:RealityModelNames.OSMBuildings");
      currentIndex = this._contextRealityModels.length;
      this.attachRealityModel({ tilesetUrl, name, planarClipMask: { mode: PlanarClipMaskMode.None }});
    }

    if (options.appearanceOverrides)
      this.overrideRealityModelAppearance(currentIndex, options.appearanceOverrides);

    return true;
  }

  /** Find index of a reality model.
   * @param accept Method that returns true to indicate that the model index should be returned.
   * @returns the index for the reality model that was accepted. -1 if none are accepted.
   * @beta
   */
  public findRealityModelIndex(accept: (model: ContextRealityModelState) => boolean): number {
    return this._contextRealityModels.findIndex((model) => accept(model));
  }

  /**
   * Detach a context reality model from its index.
   * @see [[ContextRealityModelProps]].
   * @param index The reality model index or -1 to detach all models.
   * @beta
   * */
  public detachRealityModelByIndex(index: number): void {
    const styles = this.jsonProperties.styles;
    const props = undefined !== styles ? styles.contextRealityModels : undefined;
    if (!Array.isArray(props) || index >= this._contextRealityModels.length || index >= props.length)
      return;

    if (index < 0) {
      props.splice(0, props.length);
      this._contextRealityModels.splice(0, this._contextRealityModels.length);
    } else {
      assert(this._contextRealityModels[index].url === props[index].tilesetUrl);
      props.splice(index, 1);
      this._contextRealityModels.splice(index, 1);
    }
  }

  /**
   * Return if a context reality model is attached.
   * @see [[ContextRealityModelProps]].
   * @beta
   * */
  public hasAttachedRealityModel(name: string, url: string): boolean {
    return -1 !== this._contextRealityModels.findIndex((x) => x.matchesNameAndUrl(name, url));
  }

  /** The overrides applied by this style.
   * @beta
   */
  public get modelAppearanceOverrides(): Map<Id64String, FeatureAppearance> {
    return this.settings.modelAppearanceOverrides;
  }

  /** Customize the way a [[Model]]  is drawn by this display style.
   * @param modelId The ID of the [[model]] whose appearance is to be overridden.
   * @param ovr The overrides to apply to the [[Model]].
   * @see [[dropModelAppearanceOverride]]
   * @beta
   */
  public overrideModelAppearance(modelId: Id64String, ovr: FeatureAppearance) {
    this.settings.overrideModelAppearance(modelId, ovr);
  }

  /** Remove any appearance overrides applied to a [[Model]] by this style.
   * @param modelId The ID of the [[Model]].
   * @param ovr The overrides to apply to the [[Model]].
   * @see [[overrideModelAppearance]]
   * @beta
   */
  public dropModelAppearanceOverride(modelId: Id64String) {
    this.settings.dropModelAppearanceOverride(modelId);
  }

  /** Returns true if model appearance overrides are defined by this style.
   * @beta
   */

  public get hasModelAppearanceOverride() {
    return this.settings.hasModelAppearanceOverride;
  }

  /** Obtain the override applied to a [[Model]] by this style.
   * @param id The ID of the [[Model]].
   * @returns The corresponding FeatureAppearance, or undefined if the Model's appearance is not overridden.
   * @see [[overrideModelAppearance]]
   * @beta
   */
  public getModelAppearanceOverride(id: Id64String): FeatureAppearance | undefined {
    return this.settings.getModelAppearanceOverride(id);
  }

  private applyToRealityModel(index: number, func: (index: number, jsonContextRealityModels: any[]) => boolean): boolean {
    if (undefined === this.jsonProperties.styles)
      this.jsonProperties.styles = {};

    const styles = this.jsonProperties.styles;
    const jsonContextRealityModels = styles.contextRealityModels;
    if (!Array.isArray(jsonContextRealityModels) || jsonContextRealityModels.length !== this._contextRealityModels.length)
      return false;     // No context reality models.

    let changed = false;
    if (index < 0) {
      for (let i = 0; i < jsonContextRealityModels.length; i++)
        changed = func(i, jsonContextRealityModels) || changed;
    } else {
      changed = func(index, jsonContextRealityModels);
    }
    return changed;
  }

  /** Change the appearance overrides for a context reality model displayed by this style.
   * @param overrides The overrides, only transparency, color, nonLocatable and emphasized are applicable.
   * @param index The reality model index or -1 to apply to all models.
   * @returns true if overrides are successfully applied.
   * @note If this style is associated with a [[ViewState]] attached to a [[Viewport]], use [[Viewport.overrideRealityModelAppearance]] to ensure
   * the changes are promptly visible on the screen.
   * @beta
   */

  public overrideRealityModelAppearance(index: number, overrides: FeatureAppearance): boolean {
    return this.applyToRealityModel(index, (changeIndex: number, jsonContextRealityModels: any[]) => {
      jsonContextRealityModels[changeIndex].appearanceOverrides = overrides.toJSON();
      this._contextRealityModels[changeIndex].appearanceOverrides = overrides;
      return true;
    });
  }

  /** Drop the appearance overrides for a context reality model displayed by this style.
 * @param index The reality model index or -1 to drop overrides from all reality models.
 * @returns true if overrides are successfully dropped.
 * @note If this style is associated with a [[ViewState]] attached to a [[Viewport]], use [[Viewport.dropRealityModelAppearanceOverride]] to ensure
 * the changes are promptly visible on the screen.
 * @beta
 */
  public dropRealityModelAppearanceOverride(index: number): boolean {
    return this.applyToRealityModel(index, (changeIndex: number, jsonContextRealityModels: any[]) => {
      jsonContextRealityModels[changeIndex].appearanceOverrides = this._contextRealityModels[changeIndex].appearanceOverrides = undefined;
      return true;
    });
  }
  /** Obtain the override applied to a context reality model displayed by this style.
   * @param index The reality model index
   * @returns The corresponding FeatureAppearance, or undefined if the Model's appearance is not overridden.
   * @see [[overrideRealityModelAppearance]]
   * @beta
   */
  public getRealityModelAppearanceOverride(index: number): FeatureAppearance | undefined {
    return index >= 0 && index < this._contextRealityModels.length ? this._contextRealityModels[index]?.appearanceOverrides : undefined;
  }

  /** Return the "contextual" reality model index for a transient model ID or -1 if none found
   * @beta
   */
  public getRealityModelIndexFromTransientId(id: Id64String): number {
    for (let i = 0; i < this._contextRealityModels.length; i++) {
      const treeRef = this._contextRealityModels[i].treeRef;
      if (treeRef instanceof RealityModelTileTree.Reference && treeRef.modelId === id)
        return i;
    }
    return -1;
  }

  /** Override the planar clip mask for a reality model.
   * @param modelIdOrIndex The ID of the [[model]] if the attached to the view or the index if it is a context model displayed by this style.
   * @param planarClipMask The planar clip mask to apply to the [[Model]].
   * @see [[dropRealityModelPlanarClipMask]
   * @beta
   */
  public overrideRealityModelPlanarClipMask(modelIdOrIndex: Id64String | number, mask: PlanarClipMaskSettings): boolean {
    const maskState = PlanarClipMaskState.create(mask);
    if (typeof modelIdOrIndex === "string") {
      const model = this.iModel.models.getLoaded(modelIdOrIndex)?.asSpatialModel;
      if (model?.isRealityModel) {
        this.settings.overrideModelPlanarClipMask(modelIdOrIndex, mask);
        return true;
      } else
        return false;
    } else {
      return this.applyToRealityModel(modelIdOrIndex, (changeIndex: number, jsonContextRealityModels: any[]) => {
        jsonContextRealityModels[changeIndex].planarClipMask = mask;
        this._contextRealityModels[changeIndex].planarClipMask = maskState;
        this.settings.raiseRealityModelPlanarClipMaskChangedEvent(changeIndex, mask);
        return true;
      });
    }
  }

  /** Drop the planar clip mask for a reality model.
   * @param modelIdOrIndex The ID of the [[model]] if the attached to the view or the index if it is a context model displayed by this style.
   * @returns true if overrides are successfully dropped.
   * @beta
   */
  public dropRealityModelPlanarClipMask(modelIdOrIndex: Id64String | number): boolean {
    if (typeof modelIdOrIndex === "string") {
      const model = this.iModel.models.getLoaded(modelIdOrIndex)?.asSpatialModel;
      if (model && model.isRealityModel) {
        this._attachedRealityModelPlanarClipMasks.delete(modelIdOrIndex);
        this.settings.dropModelPlanarClipMaskOverride(modelIdOrIndex);
        return true;
      } else
        return false;
    } else {
      return this.applyToRealityModel(modelIdOrIndex, (changeIndex: number, jsonContextRealityModels: any[]) => {
        jsonContextRealityModels[changeIndex].planarClipMask = undefined;
        this._contextRealityModels[changeIndex].planarClipMask = undefined;
        this.settings.raiseRealityModelPlanarClipMaskChangedEvent(changeIndex, undefined);
        return true;
      });
    }
  }

  /** Obtain the planar clip  applied to a context reality model
   * @param modelIdOrIndex The ID of the [[model]] if the attached to the view or the index if it is a context model displayed by this style.
   * @returns The corresponding PlanarClipMask, or undefined if the Model's appearance is not overridden.
   * @see [[overrideRealityModelPlanarClipMask]]
   * @beta
   */
  public getRealityModelPlanarClipMask(modelIdOrIndex: Id64String | number): PlanarClipMaskState | undefined {
    if (typeof modelIdOrIndex === "string") {
      const model = this.iModel.models.getLoaded(modelIdOrIndex)?.asSpatialModel;
      return (model && model.isRealityModel) ? this._attachedRealityModelPlanarClipMasks.get(modelIdOrIndex) : undefined;
    } else {
      return modelIdOrIndex >= 0 && modelIdOrIndex < this._contextRealityModels.length ? this._contextRealityModels[modelIdOrIndex]?.planarClipMask : undefined;
    }
  }

  /** @internal */
  public getMapLayers(isOverlay: boolean) { return isOverlay ? this.overlayMapLayers : this.backgroundMapLayers; }

  /** @internal */
  public attachMapLayerSettings(settings: MapLayerSettings, isOverlay: boolean, insertIndex = -1): void {
    const layerSettings = settings.clone({});
    if (undefined === layerSettings)
      return;

    const layers = this.getMapLayers(isOverlay);

    if (insertIndex < 0 || insertIndex > (layers.length - 1)) {
      this.getMapLayers(isOverlay).push(layerSettings);
    } else {
      layers.splice(insertIndex, 0, layerSettings);
    }

    this._synchBackgroundMapImagery();
  }

  /** @internal */
  public attachMapLayer(props: MapLayerProps, isOverlay: boolean, insertIndex = -1): void {
    const layerSettings = MapLayerSettings.fromJSON(props);
    if (undefined === layerSettings)
      return;

    this.attachMapLayerSettings(layerSettings, isOverlay, insertIndex);
  }

  /** @internal */
  public hasAttachedMapLayer(name: string, url: string, isOverlay: boolean): boolean {
    return -1 !== this.findMapLayerIndexByNameAndUrl(name, url, isOverlay);
  }

  /** @internal */
  public detachMapLayerByNameAndUrl(name: string, url: string, isOverlay: boolean): void {
    const index = this.findMapLayerIndexByNameAndUrl(name, url, isOverlay);
    if (- 1 !== index)
      this.detachMapLayerByIndex(index, isOverlay);
  }

  /** Detach map layer at index (-1 to remove all layers)
   * @internal
   */
  public detachMapLayerByIndex(index: number, isOverlay: boolean): void {
    const layers = this.getMapLayers(isOverlay);
    if (index < 0)
      layers.length = 0;
    else
      layers.splice(index, 1);

    this._synchBackgroundMapImagery();
  }

  /** @internal */
  public findMapLayerIndexByNameAndUrl(name: string, url: string, isOverlay: boolean) {
    return this.getMapLayers(isOverlay).findIndex((x) => x.matchesNameAndUrl(name, url));
  }

  /** @internal */
  public mapLayerAtIndex(index: number, isOverlay: boolean): MapLayerSettings | undefined {
    const layers = this.getMapLayers(isOverlay);
    return (index < 0 || index >= layers.length) ? undefined : layers[index];
  }

  /** @internal */
  public changeBaseMapProps(props: MapLayerProps | ColorDef) {
    if (props instanceof ColorDef) {
      const transparency = this.settings.mapImagery.backgroundBase instanceof ColorDef ? this.settings.mapImagery.backgroundBase.getTransparency() : 0;
      this.settings.mapImagery.backgroundBase = props.withTransparency(transparency);
    } else {
      if (this.settings.mapImagery.backgroundBase instanceof MapLayerSettings)
        this.settings.mapImagery.backgroundBase = this.settings.mapImagery.backgroundBase?.clone(props);
      else {
        const backgroundLayerSettings = MapLayerSettings.fromJSON(props);
        if (backgroundLayerSettings)
          this.settings.mapImagery.backgroundBase = backgroundLayerSettings;
      }
    }
    this._synchBackgroundMapImagery();
  }

  /** Return map base transparency as a number between 0 and 1.
   * @internal
   */
  public get baseMapTransparency(): number {
    return this.settings.mapImagery.baseTransparency;
  }

  /** @internal  */
  public changeBaseMapTransparency(transparency: number) {
    if (this.settings.mapImagery.backgroundBase instanceof ColorDef) {
      this.settings.mapImagery.backgroundBase = this.settings.mapImagery.backgroundBase.withTransparency(transparency * 255);
      this._synchBackgroundMapImagery();
    } else {
      this.changeBaseMapProps({ transparency });
    }
  }

  /** @internal */
  public changeMapLayerProps(props: MapLayerProps, index: number, isOverlay: boolean) {
    const layers = this.getMapLayers(isOverlay);
    if (index < 0 || index >= layers.length)
      return;
    layers[index] = layers[index].clone(props);
    this._synchBackgroundMapImagery();
  }

  public changeMapLayerCredentials(index: number, isOverlay: boolean, userName?: string, password?: string,) {
    const layers = this.getMapLayers(isOverlay);
    if (index < 0 || index >= layers.length)
      return;
    layers[index].setCredentials(userName, password);
    this._synchBackgroundMapImagery();
  }

  public changeMapSubLayerProps(props: MapSubLayerProps, subLayerId: SubLayerId, layerIndex: number, isOverlay: boolean) {
    const mapLayerSettings = this.mapLayerAtIndex(layerIndex, isOverlay);
    if (undefined === mapLayerSettings)
      return;

    const subLayers = new Array<MapSubLayerProps>();
    for (const subLayer of mapLayerSettings.subLayers) {
      subLayers.push((subLayerId === -1 || subLayer.id === subLayerId) ? subLayer.clone(props).toJSON() : subLayer.toJSON());
    }

    this.changeMapLayerProps({ subLayers }, layerIndex, isOverlay);
  }

  /** @internal */
  public async getMapLayerRange(layerIndex: number, isOverlay: boolean): Promise<MapCartoRectangle | undefined> {
    const mapLayerSettings = this.mapLayerAtIndex(layerIndex, isOverlay);
    if (undefined === mapLayerSettings)
      return undefined;

    const imageryProvider = IModelApp.mapLayerFormatRegistry.createImageryProvider(mapLayerSettings);
    if (undefined === imageryProvider)
      return undefined;

    try {
      await imageryProvider.initialize();
      return imageryProvider.cartoRange;

    } catch (_error) {
      return undefined;
    }
    return undefined;
  }

  /** change viewport to include range of map layer.
   * @internal
   */
  public async viewMapLayerRange(layerIndex: number, isOverlay: boolean, vp: ScreenViewport): Promise<boolean> {
    const range = await this.getMapLayerRange(layerIndex, isOverlay);
    if (!range)
      return false;

    if (range.xLength() > 1.5 * Angle.piRadians)
      viewGlobalLocation(vp, true, ViewGlobalLocationConstants.satelliteHeightAboveEarthInMeters, undefined, undefined);
    else
      viewGlobalLocation(vp, true, undefined, undefined, range.globalLocation);

    return true;
  }

  /* @internal */
  private _synchBackgroundMapImagery() {
    this.settings.synchMapImagery();
  }

  /**
   * Move map layer to top.
   * @param index index of layer to move.
   * @param isOverlay true if layer is overlay.
   * @internal
   *
   */
  public moveMapLayerToTop(index: number, isOverlay: boolean) {
    const layers = this.getMapLayers(isOverlay);
    if (index >= 0 && index < layers.length - 1) {
      const layer = layers.splice(index, 1);
      layers.push(layer[0]);
      this._synchBackgroundMapImagery();
    }
  }

  /**
   * Move map layer to bottom.
   * @param index index of layer to move.
   * @param isOverlay true if layer is overlay.
   * @internal
   */
  public moveMapLayerToBottom(index: number, isOverlay: boolean) {
    const layers = this.getMapLayers(isOverlay);
    if (index > 0 && index < layers.length) {
      const layer = layers.splice(index, 1);
      layers.unshift(layer[0]);
      this._synchBackgroundMapImagery();
    }
  }

  /**
   * Reorder map layers
   * @param fromIndex index of map layer to move
   * @param toIndex insert index. If equal to length of map array the map layer is moved to end of array.
   * @internal
   */
  public moveMapLayerToIndex(fromIndex: number, toIndex: number, isOverlay: boolean) {
    const layers = this.getMapLayers(isOverlay);
    if (fromIndex === toIndex)
      return;

    if (fromIndex < 0 || fromIndex >= layers.length || toIndex > layers.length)
      return;

    const layer = layers.splice(fromIndex, 1);
    layers.splice(toIndex, 0, layer[0]); // note: if toIndex === settings.mapImagery.backgroundLayers.length item is appended
    this._synchBackgroundMapImagery();
  }

  /** Flags controlling various aspects of the display style.
   * @note Don't modify this object directly - clone it and modify the clone, then pass the clone to the setter.
   * @see [DisplayStyleSettings.viewFlags]($common)
   */
  public get viewFlags(): ViewFlags { return this.settings.viewFlags; }
  public set viewFlags(flags: ViewFlags) { this.settings.viewFlags = flags; }

  /** The background color for this DisplayStyle */
  public get backgroundColor(): ColorDef { return this.settings.backgroundColor; }
  public set backgroundColor(val: ColorDef) { this.settings.backgroundColor = val; }

  /** The color used to draw geometry in monochrome mode.
   * @see [ViewFlags.monochrome]($common) for enabling monochrome mode.
   */
  public get monochromeColor(): ColorDef { return this.settings.monochromeColor; }
  public set monochromeColor(val: ColorDef) { this.settings.monochromeColor = val; }

  private _backgroundMapGeometry?: {
    bimElevationBias: number;
    geometry: BackgroundMapGeometry;
    globeMode: GlobeMode;
  };

  /** @internal */
  public anyMapLayersVisible(overlay: boolean): boolean {
    const layers = this.getMapLayers(overlay);

    for (const mapLayer of layers)
      if (mapLayer.visible)
        return true;

    return false;
  }

  /** @internal */
  public getIsBackgroundMapVisible(): boolean {
    return undefined !== this.iModel.ecefLocation && (this.viewFlags.backgroundMap || this.anyMapLayersVisible(false));
  }
  public get backgroundMapElevationBias(): number {
    if (this.backgroundMapSettings.applyTerrain) {
      const terrainSettings = this.backgroundMapSettings.terrainSettings;
      switch (terrainSettings.heightOriginMode) {
        case TerrainHeightOriginMode.Ground:
          return terrainSettings.heightOrigin + terrainSettings.exaggeration * this.iModel.backgroundMapLocation.projectCenterAltitude;

        case TerrainHeightOriginMode.Geodetic:
          return terrainSettings.heightOrigin;

        case TerrainHeightOriginMode.Geoid:
          return terrainSettings.heightOrigin + this.iModel.backgroundMapLocation.geodeticToSeaLevel;
      }
    } else {
      return this.backgroundMapSettings.groundBias;
    }

  }

  /** @internal */
  public getBackgroundMapGeometry(): BackgroundMapGeometry | undefined {
    if (undefined === this.iModel.ecefLocation)
      return undefined;

    const bimElevationBias = this.backgroundMapElevationBias;

    const globeMode = this.globeMode;
    if (undefined === this._backgroundMapGeometry || this._backgroundMapGeometry.globeMode !== globeMode || this._backgroundMapGeometry.bimElevationBias !== bimElevationBias) {
      const geometry = new BackgroundMapGeometry(bimElevationBias, globeMode, this.iModel);
      this._backgroundMapGeometry = { bimElevationBias, geometry, globeMode };
    }
    return this._backgroundMapGeometry.geometry;
  }

  /** @internal */
  public getGlobalGeometryAndHeightRange(): { geometry: BackgroundMapGeometry, heightRange: Range1d } | undefined {
    let geometry = this.getIsBackgroundMapVisible() ? this.getBackgroundMapGeometry() : undefined;
    const terrainRange = ApproximateTerrainHeights.instance.globalHeightRange;
    let heightRange = this.displayTerrain ? terrainRange : Range1d.createXX(-1, 1);
    if (this.globeMode === GlobeMode.Ellipsoid && this._contextRealityModels.find((model) => model.isGlobal)) {
      if (!geometry) {
        if (!this._ellipsoidMapGeometry)
          this._ellipsoidMapGeometry = new BackgroundMapGeometry(0, GlobeMode.Ellipsoid, this.iModel);

        geometry = this._ellipsoidMapGeometry;
      }

      heightRange = terrainRange;
    }

    return geometry ? { geometry, heightRange } : undefined;
  }

  /** Returns true if this is a 3d display style. */
  public is3d(): this is DisplayStyle3dState { return this instanceof DisplayStyle3dState; }

  /** Customize the way geometry belonging to a [[SubCategory]] is drawn by this display style.
   * @param id The ID of the SubCategory whose appearance is to be overridden.
   * @param ovr The overrides to apply to the [[SubCategoryAppearance]].
   * @see [[dropSubCategoryOverride]]
   */
  public overrideSubCategory(id: Id64String, ovr: SubCategoryOverride) { this.settings.overrideSubCategory(id, ovr); }

  /** Remove any [[SubCategoryOverride]] applied to a [[SubCategoryAppearance]] by this style.
   * @param id The ID of the [[SubCategory]].
   * @see [[overrideSubCategory]]
   */
  public dropSubCategoryOverride(id: Id64String) { this.settings.dropSubCategoryOverride(id); }

  /** Returns true if an [[SubCategoryOverride]]s are defined by this style. */
  public get hasSubCategoryOverride() { return this.settings.hasSubCategoryOverride; }

  /** Obtain the overrides applied to a [[SubCategoryAppearance]] by this style.
   * @param id The ID of the [[SubCategory]].
   * @returns The corresponding SubCategoryOverride, or undefined if the SubCategory's appearance is not overridden.
   * @see [[overrideSubCategory]]
   */
  public getSubCategoryOverride(id: Id64String): SubCategoryOverride | undefined { return this.settings.getSubCategoryOverride(id); }

  /** @internal */
  public get wantShadows(): boolean {
    return this.is3d() && this.viewFlags.shadows && false !== IModelApp.renderSystem.options.displaySolarShadows;
  }

  /** @internal */
  protected registerSettingsEventListeners(): void {
    // eslint-disable-next-line deprecation/deprecation
    this.settings.onScheduleScriptPropsChanged.addListener((scriptProps) => {
      let newState: RenderScheduleState | undefined;
      if (scriptProps) {
        const script = RenderSchedule.Script.fromJSON(scriptProps);
        if (script)
          newState = new RenderScheduleState(this.id, script);
      }

      if (newState !== this._scheduleState) {
        this.onScheduleScriptReferenceChanged.raiseEvent(newState);
        this._scheduleState = newState;
      }
    });

    this.settings.onRenderTimelineChanged.addListener((newTimeline) => {
      if (newTimeline !== this._scheduleState?.sourceId) {
        // Loading the new script is asynchronous...people should really be using DisplayStyleState.changeRenderTimeline().
        this.onScheduleScriptReferenceChanged.raiseEvent(undefined);
        this._scheduleState = undefined;
      }
    });

    this.settings.onRealityModelPlanarClipMaskChanged.addListener((id: Id64String | number, newSettings: PlanarClipMaskSettings | undefined) => {
      if (typeof id === "string") {
        if (newSettings)
          this._attachedRealityModelPlanarClipMasks.set(id, PlanarClipMaskState.create(newSettings));
        else
          this._attachedRealityModelPlanarClipMasks.delete(id);
      }
    });

    // ###TODO contextRealityModels are a bit of a mess.
    this.settings.onApplyOverrides.addListener((overrides) => {
      if (overrides.contextRealityModels) {
        this._contextRealityModels.length = 0;
        for (const contextRealityModel of overrides.contextRealityModels)
          this._contextRealityModels.push(new ContextRealityModelState(contextRealityModel, this.iModel, this));
      }
    });
  }
}

/** A display style that can be applied to 2d views.
 * @public
 */
export class DisplayStyle2dState extends DisplayStyleState {
  /** @internal */
  public static get className() { return "DisplayStyle2d"; }
  private readonly _settings: DisplayStyleSettings;

  public get settings(): DisplayStyleSettings { return this._settings; }

  /** @internal */
  public overrideTerrainDisplay(): TerrainDisplayOverrides | undefined { return undefined; }

  constructor(props: DisplayStyleProps, iModel: IModelConnection) {
    super(props, iModel);
    this._settings = new DisplayStyleSettings(this.jsonProperties);
    this.registerSettingsEventListeners();
  }
}

/** ###TODO: Generalize this into something like a PromiseOrValue<T> type which can contain
 * either a Promise<T> or a resolved T.
 * This is used to avoid flickering when loading skybox - don't want to load asynchronously unless we have to.
 * @internal
 */
export type SkyBoxParams = Promise<SkyBox.CreateParams | undefined> | SkyBox.CreateParams | undefined;

/** The SkyBox is part of an [[Environment]] drawn in the background of spatial views to provide context.
 * Several types of skybox are supported:
 *  - A cube with a texture image mapped to each face;
 *  - A sphere with a single texture image mapped to its surface;
 *  - A sphere with a [[Gradient]] mapped to its surface.
 * @public
 */
export abstract class SkyBox implements SkyBoxProps {
  /** Whether or not the skybox should be displayed. */
  public display: boolean = false;

  protected constructor(sky?: SkyBoxProps) {
    this.display = undefined !== sky && JsonUtils.asBool(sky.display, false);
  }

  public toJSON(): SkyBoxProps {
    return { display: this.display };
  }

  /** Instantiate a [[SkyBox]] from its JSON representation. */
  public static createFromJSON(json?: SkyBoxProps): SkyBox {
    let imageType = SkyBoxImageType.None;
    if (undefined !== json && undefined !== json.image && undefined !== json.image.type)
      imageType = json.image.type;

    let skybox: SkyBox | undefined;
    switch (imageType) {
      case SkyBoxImageType.Spherical:
        skybox = SkySphere.fromJSON(json!);
        break;
      case SkyBoxImageType.Cube:
        skybox = SkyCube.fromJSON(json!);
        break;
      case SkyBoxImageType.Cylindrical: // ###TODO...
        break;
    }

    return undefined !== skybox ? skybox : new SkyGradient(json);
  }

  /** @internal */
  public abstract loadParams(_system: RenderSystem, _iModel: IModelConnection): SkyBoxParams;
}

/** The SkyBox is part of an [[Environment]] drawn in the background of spatial views to provide context.
 * Several types of skybox are supported:
 *  - A cube with a texture image mapped to each face;
 *  - A sphere with a single texture image mapped to its surface;
 *  - A sphere with a [[Gradient]] mapped to its surface.
 * @public
 */
export namespace SkyBox { // eslint-disable-line no-redeclare
  /** Parameters defining a spherical [[SkyBox]].
   * @public
   */
  export class SphereParams {
    public constructor(public readonly texture: RenderTexture, public readonly rotation: number) { }
  }

  /** Parameters used by the [[RenderSystem]] to instantiate a [[SkyBox]].
   * @public
   */
  export class CreateParams {
    public readonly gradient?: SkyGradient;
    public readonly sphere?: SphereParams;
    public readonly cube?: RenderTexture;
    public readonly zOffset: number;

    private constructor(zOffset: number, gradient?: SkyGradient, sphere?: SphereParams, cube?: RenderTexture) {
      this.gradient = gradient;
      this.sphere = sphere;
      this.cube = cube;
      this.zOffset = zOffset;
    }

    public static createForGradient(gradient: SkyGradient, zOffset: number) { return new CreateParams(zOffset, gradient); }
    public static createForSphere(sphere: SphereParams, zOffset: number) { return new CreateParams(zOffset, undefined, sphere); }
    public static createForCube(cube: RenderTexture) { return new CreateParams(0.0, undefined, undefined, cube); }
  }
}

/** A [[SkyBox]] drawn as a sphere with a gradient mapped to its interior surface.
 * @see [[SkyBox.createFromJSON]]
 * @see [SkyBoxProps]($common) for descriptions of the color and exponent properties.
 * @public
 */
export class SkyGradient extends SkyBox {
  /** If true, a 2-color gradient is used (nadir and zenith colors only); if false a 4-color gradient is used. Defaults to false. */
  public readonly twoColor: boolean = false;
  /** @see [SkyBoxProp]($frontend). */
  public readonly skyColor: ColorDef;
  /** @see [SkyBoxProp]($frontend). */
  public readonly groundColor: ColorDef;
  /** @see [SkyBoxProp]($frontend). */
  public readonly zenithColor: ColorDef;
  /** @see [SkyBoxProp]($frontend). */
  public readonly nadirColor: ColorDef;
  /** @see [SkyBoxProp]($frontend). */
  public readonly skyExponent: number = 4.0;
  /** @see [SkyBoxProp]($frontend). */
  public readonly groundExponent: number = 4.0;

  /** Construct a SkyGradient from its JSON representation. */
  public constructor(sky?: SkyBoxProps) {
    super(sky);

    sky = sky ? sky : {};
    this.twoColor = JsonUtils.asBool(sky.twoColor, false);
    this.groundExponent = JsonUtils.asDouble(sky.groundExponent, 4.0);
    this.skyExponent = JsonUtils.asDouble(sky.skyExponent, 4.0);
    this.groundColor = (undefined !== sky.groundColor) ? ColorDef.fromJSON(sky.groundColor) : ColorDef.from(120, 143, 125);
    this.zenithColor = (undefined !== sky.zenithColor) ? ColorDef.fromJSON(sky.zenithColor) : ColorDef.from(54, 117, 255);
    this.nadirColor = (undefined !== sky.nadirColor) ? ColorDef.fromJSON(sky.nadirColor) : ColorDef.from(40, 15, 0);
    this.skyColor = (undefined !== sky.skyColor) ? ColorDef.fromJSON(sky.skyColor) : ColorDef.from(143, 205, 255);
  }

  public toJSON(): SkyBoxProps {
    const val = super.toJSON();

    val.twoColor = this.twoColor ? true : undefined;
    val.groundExponent = this.groundExponent !== 4.0 ? this.groundExponent : undefined;
    val.skyExponent = this.skyExponent !== 4.0 ? this.skyExponent : undefined;

    val.groundColor = this.groundColor.toJSON();
    val.zenithColor = this.zenithColor.toJSON();
    val.nadirColor = this.nadirColor.toJSON();
    val.skyColor = this.skyColor.toJSON();

    return val;
  }

  /** @internal */
  public loadParams(_system: RenderSystem, iModel: IModelConnection): SkyBoxParams {
    return SkyBox.CreateParams.createForGradient(this, iModel.globalOrigin.z);
  }
}

/** A [[SkyBox]] drawn as a sphere with an image mapped to its interior surface.
 * @see [[SkyBox.createFromJSON]]
 * @public
 */
export class SkySphere extends SkyBox {
  /** The Id of a persistent texture element stored in the iModel which supplies the skybox image. */
  public textureId: Id64String;

  private constructor(textureId: Id64String, display?: boolean) {
    super({ display });
    this.textureId = textureId;
  }

  /** Create a [[SkySphere]] from its JSON representation.
   * @param json: The JSON representation
   * @returns A SkySphere, or undefined if the JSON lacks a valid texture Id.
   */
  public static fromJSON(json: SkyBoxProps): SkySphere | undefined {
    const textureId = Id64.fromJSON(undefined !== json.image ? json.image.texture : undefined);
    return undefined !== textureId && Id64.isValid(textureId) ? new SkySphere(textureId, json.display) : undefined;
  }

  public toJSON(): SkyBoxProps {
    const val = super.toJSON();
    val.image = {
      type: SkyBoxImageType.Spherical,
      texture: this.textureId,
    };
    return val;
  }

  /** @internal */
  public loadParams(system: RenderSystem, iModel: IModelConnection): SkyBoxParams {
    const rotation = 0.0; // ###TODO: from where do we obtain rotation?
    const createParams = (tex?: RenderTexture) => undefined !== tex ? SkyBox.CreateParams.createForSphere(new SkyBox.SphereParams(tex, rotation), iModel.globalOrigin.z) : undefined;
    const texture = system.findTexture(this.textureId, iModel);
    if (undefined !== texture)
      return createParams(texture);
    else
      return system.loadTexture(this.textureId, iModel).then((tex) => createParams(tex));
  }
}

/** A [[SkyBox]] drawn as a cube with an image mapped to each of its interior faces.
 * Each member specifies the Id of a persistent texture element stored in the iModel
 * from which the image mapped to the corresponding face is obtained.
 * @see [[SkyBox.createFromJSON]].
 * @public
 */
export class SkyCube extends SkyBox implements SkyCubeProps {
  /** Id of a persistent texture element stored in the iModel to use for the front side of the skybox cube. */
  public readonly front: Id64String;
  /** Id of a persistent texture element stored in the iModel to use for the back side of the skybox cube. */
  public readonly back: Id64String;
  /** Id of a persistent texture element stored in the iModel to use for the top of the skybox cube. */
  public readonly top: Id64String;
  /** Id of a persistent texture element stored in the iModel to use for the bottom of the skybox cube. */
  public readonly bottom: Id64String;
  /** Id of a persistent texture element stored in the iModel to use for the front right of the skybox cube. */
  public readonly right: Id64String;
  /** Id of a persistent texture element stored in the iModel to use for the left side of the skybox cube. */
  public readonly left: Id64String;

  private constructor(front: Id64String, back: Id64String, top: Id64String, bottom: Id64String, right: Id64String, left: Id64String, display?: boolean) {
    super({ display });
    this.front = front;
    this.back = back;
    this.top = top;
    this.bottom = bottom;
    this.right = right;
    this.left = left;
  }

  /** Use [[SkyCube.create]].
   * @internal
   */
  public static fromJSON(skyboxJson: SkyBoxProps): SkyCube | undefined {
    const image = skyboxJson.image;
    const json = (undefined !== image && image.type === SkyBoxImageType.Cube ? image.textures : undefined) as SkyCubeProps;
    if (undefined === json)
      return undefined;

    return this.create(Id64.fromJSON(json.front), Id64.fromJSON(json.back), Id64.fromJSON(json.top), Id64.fromJSON(json.bottom), Id64.fromJSON(json.right), Id64.fromJSON(json.left), skyboxJson.display);
  }

  public toJSON(): SkyBoxProps {
    const val = super.toJSON();
    val.image = {
      type: SkyBoxImageType.Cube,
      textures: {
        front: this.front,
        back: this.back,
        top: this.top,
        bottom: this.bottom,
        right: this.right,
        left: this.left,
      },
    };
    return val;
  }

  /** Create and return a SkyCube. (Calls the SkyCube constructor after validating the Ids passed in for the images.)
   * @param front The Id of the image to use for the front side of the sky cube.
   * @param back The Id of the image to use for the back side of the sky cube.
   * @param top The Id of the image to use for the top side of the sky cube.
   * @param bottom The Id of the image to use for the bottom side of the sky cube.
   * @param right The Id of the image to use for the right side of the sky cube.
   * @param left The Id of the image to use for the left side of the sky cube.
   * @returns A SkyCube, or undefined if any of the supplied texture Ids are invalid.
   * @note All Ids must refer to a persistent texture element stored in the iModel.
   */
  public static create(front: Id64String, back: Id64String, top: Id64String, bottom: Id64String, right: Id64String, left: Id64String, display?: boolean): SkyCube | undefined {
    if (!Id64.isValid(front) || !Id64.isValid(back) || !Id64.isValid(top) || !Id64.isValid(bottom) || !Id64.isValid(right) || !Id64.isValid(left))
      return undefined;
    else
      return new SkyCube(front, back, top, bottom, right, left, display);
  }

  /** @internal */
  public loadParams(system: RenderSystem, iModel: IModelConnection): SkyBoxParams {
    // ###TODO: We never cache the actual texture *images* used here to create a single cubemap texture...
    const textureIds = new Set<string>([this.front, this.back, this.top, this.bottom, this.right, this.left]);
    const promises = new Array<Promise<TextureImage | undefined>>();
    for (const textureId of textureIds)
      promises.push(system.loadTextureImage(textureId, iModel));

    return Promise.all(promises).then((images) => {
      // ###TODO there's gotta be a simpler way to map the unique images back to their texture Ids...
      const idToImage = new Map<string, HTMLImageElement>();
      let index = 0;
      for (const textureId of textureIds) {
        const image = images[index++];
        if (undefined === image || undefined === image.image)
          return undefined;
        else
          idToImage.set(textureId, image.image);
      }

      const params = new RenderTexture.Params(undefined, RenderTexture.Type.SkyBox);
      const textureImages = [
        idToImage.get(this.front)!, idToImage.get(this.back)!, idToImage.get(this.top)!,
        idToImage.get(this.bottom)!, idToImage.get(this.right)!, idToImage.get(this.left)!,
      ];

      const texture = system.createTextureFromCubeImages(textureImages[0], textureImages[1], textureImages[2], textureImages[3], textureImages[4], textureImages[5], iModel, params);
      return undefined !== texture ? SkyBox.CreateParams.createForCube(texture) : undefined;
    }).catch((_err) => {
      return undefined;
    });
  }
}

/** Describes the [[SkyBox]] and [[GroundPlane]] associated with a [[DisplayStyle3dState]].
 * @public
 */
export class Environment {
  public readonly sky: SkyBox;
  public readonly ground: GroundPlane;

  /** Construct from JSON representation. */
  public constructor(json?: EnvironmentProps) {
    this.sky = SkyBox.createFromJSON(undefined !== json ? json.sky : undefined);
    this.ground = new GroundPlane(undefined !== json ? json.ground : undefined);
  }

  public toJSON(): EnvironmentProps {
    return {
      sky: this.sky.toJSON(),
      ground: this.ground.toJSON(),
    };
  }
}

function isSameSkyBox(a: SkyBoxProps | undefined, b: SkyBoxProps | undefined): boolean {
  if (undefined === a || undefined === b)
    return undefined === a && undefined === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A [[DisplayStyleState]] that can be applied to spatial views.
 * @public
 */
export class DisplayStyle3dState extends DisplayStyleState {
  /** @internal */
  public static get className() { return "DisplayStyle3d"; }
  private _skyBoxParams?: SkyBox.CreateParams;
  private _skyBoxParamsLoaded?: boolean;
  private _environment?: Environment;
  private _settings: DisplayStyle3dSettings;

  public get settings(): DisplayStyle3dSettings { return this._settings; }

  public constructor(props: DisplayStyleProps, iModel: IModelConnection, source?: DisplayStyle3dState) {
    super(props, iModel, source);
    if (source && source.iModel === this.iModel) {
      this._skyBoxParams = source._skyBoxParams;
      this._skyBoxParamsLoaded = source._skyBoxParamsLoaded;
    }

    this._settings = new DisplayStyle3dSettings(this.jsonProperties);
    this.registerSettingsEventListeners();
  }

  /** The [[SkyBox]] and [[GroundPlane]] settings for this style. */
  public get environment(): Environment {
    if (undefined === this._environment)
      this._environment = new Environment(this.settings.environment);

    return this._environment;
  }
  public set environment(env: Environment) {
    this.changeEnvironment(env);
    this.settings.environment = env.toJSON();
  }
  private changeEnvironment(env: Environment): void {
    const prevEnv = this.settings.environment;
    this._environment = undefined;

    // Regenerate the skybox if the sky settings have changed
    if (undefined !== this._skyBoxParamsLoaded && !isSameSkyBox(env.sky, prevEnv.sky)) {
      // NB: We only reset _skyBoxParamsLoaded - keep the previous skybox (if any) to continue drawing until the new one (if any) is ready
      this._skyBoxParamsLoaded = undefined;
    }
  }

  public get lights(): LightSettings { return this.settings.lights; }
  public set lights(lights: LightSettings) { this.settings.lights = lights; }

  private onLoadSkyBoxParams(params?: SkyBox.CreateParams, vp?: Viewport): void {
    this._skyBoxParams = params;
    this._skyBoxParamsLoaded = true;
    if (undefined !== vp)
      vp.invalidateDecorations();
  }

  /** Attempts to create textures for the sky of the environment, and load it into the sky. Returns true on success, and false otherwise.
   * @internal
   */
  public loadSkyBoxParams(system: RenderSystem, vp?: Viewport): SkyBox.CreateParams | undefined {
    if (undefined === this._skyBoxParamsLoaded) {
      const params = this.environment.sky.loadParams(system, this.iModel);
      if (undefined === params || params instanceof SkyBox.CreateParams) {
        this.onLoadSkyBoxParams(params, vp);
      } else {
        this._skyBoxParamsLoaded = false; // indicates we're currently loading them.
        params.then((result?: SkyBox.CreateParams) => this.onLoadSkyBoxParams(result, vp)).catch((_err) => this.onLoadSkyBoxParams(undefined));
      }
    }

    return this._skyBoxParams;
  }
  /** The direction of the solar light. */
  public get sunDirection(): Readonly<Vector3d> {
    return this.settings.lights.solar.direction;
  }

  /** Set the solar light direction based on time value
   * @param time The time in unix time milliseconds.
   * @see [DisplayStyle3dSettings.sunTime]($common) to obtain the current sun time.
   * @see [DisplayStyle3dSettings.setSunTime]($common).
   */
  public setSunTime(time: number) {
    this.settings.setSunTime(time, this.iModel);
  }

  /** Settings controlling shadow display. */
  public get solarShadows(): SolarShadowSettings {
    return this.settings.solarShadows;
  }
  public set solarShadows(settings: SolarShadowSettings) {
    this.settings.solarShadows = settings;
  }

  /** @internal */
  protected registerSettingsEventListeners(): void {
    super.registerSettingsEventListeners();

    this.settings.onEnvironmentChanged.addListener((env) => {
      this.changeEnvironment(new Environment(env));
    });

    this.settings.onOverridesApplied.addListener((overrides: DisplayStyle3dSettingsProps) => {
      if (overrides.thematic && this.settings.thematic.displayMode === ThematicDisplayMode.Height && undefined === overrides.thematic.range) {
        // Use the project extents as reasonable default height range.
        // NB: assumes using Z axis...
        const extents = this.iModel.projectExtents;
        const props = { ...overrides.thematic };
        props.range = { low: extents.zLow, high: extents.zHigh };
        this.settings.thematic = ThematicDisplay.fromJSON(props);
      }
    });
  }

  /** @internal */
  public overrideTerrainDisplay(): TerrainDisplayOverrides | undefined {
    if (undefined !== this.settings.thematic) {
      const ovr = new TerrainDisplayOverrides();
      if (this.viewFlags.thematicDisplay && ThematicGradientMode.IsoLines === this.settings.thematic.gradientSettings.mode)
        ovr.wantSkirts = false;
      if (this.viewFlags.thematicDisplay && (ThematicDisplayMode.Slope === this.settings.thematic.displayMode || ThematicDisplayMode.HillShade === this.settings.thematic.displayMode))
        ovr.wantNormals = true;
      return ovr;
    }
    return undefined;
  }
}
