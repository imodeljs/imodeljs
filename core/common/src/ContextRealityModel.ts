/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DisplayStyles
 */

import { assert, BeEvent } from "@bentley/bentleyjs-core";
import { SpatialClassifierProps, SpatialClassifiers } from "./SpatialClassification";
import { PlanarClipMaskMode, PlanarClipMaskProps, PlanarClipMaskSettings } from "./PlanarClipMask";
import { FeatureAppearance, FeatureAppearanceProps } from "./FeatureSymbology";

/** JSON representation of the blob properties for an OrbitGt property cloud.
 * @alpha
 */
export interface OrbitGtBlobProps {
  containerName: string;
  blobFileName: string;
  sasToken: string;
  accountName: string;
}

/** JSON representation of a [[ContextRealityModel]].
 * @public
 */
export interface ContextRealityModelProps {
  /** The URL that supplies the 3d tiles for displaying the reality model. */
  tilesetUrl: string;
  /** @see [[ContextRealityModel.orbitGtBlob]].
   * @alpha
   */
  orbitGtBlob?: OrbitGtBlobProps;
  /** @see [[ContextRealityModel.realityDataId]]. */
  realityDataId?: string;
  /** An optional, user-friendly name for the reality model suitable for display in a user interface. */
  name?: string;
  /** An optional, user-friendly description of the reality model suitable for display in a user interface. */
  description?: string;
  /** @see [[ContextRealityModel.classifiers]]. */
  classifiers?: SpatialClassifierProps[];
  /** @see [[ContextRealityModel.planarClipMask]]. */
  planarClipMask?: PlanarClipMaskProps;
  /** @see [[ContextRealityModel.appearanceOverrides]]. */
  appearanceOverrides?: FeatureAppearanceProps;
}

/** @public */
export namespace ContextRealityModelProps {
  /** Produce a deep copy of `input`. */
  export function clone(input: ContextRealityModelProps) {
    // Spread operator is shallow, and includes `undefined` properties and empty strings.
    // We want to make deep copies, omit undefined properties and empty strings, and require tilesetUrl to be defined.
    const output: ContextRealityModelProps = { tilesetUrl: input.tilesetUrl ?? "" };

    if (input.name)
      output.name = input.name;

    if (input.realityDataId)
      output.realityDataId = input.realityDataId;

    if (input.description)
      output.description = input.description;

    if (input.orbitGtBlob)
      output.orbitGtBlob = { ...input.orbitGtBlob };

    if (input.appearanceOverrides) {
      output.appearanceOverrides = { ...input.appearanceOverrides };
      if (input.appearanceOverrides.rgb)
        output.appearanceOverrides.rgb = { ...input.appearanceOverrides.rgb };
    }

    if (input.planarClipMask)
      output.planarClipMask = { ...input.planarClipMask };

    if (input.classifiers)
      output.classifiers = input.classifiers.map((x) => { return { ...x, flags: { ... x.flags } }; });

    return output;
  }
}

/** A reality model not associated with a [GeometricModel]($backend) but instead defined in a [DisplayStyle]($backend) or [DisplayStyleState]($frontend).
 * Such reality models are displayed to provide context to the view and can be freely attached and detached at display time.
 * @see [this interactive example](https://www.itwinjs.org/sample-showcase/?group=Viewer&sample=reality-data-sample)
 * @see [[DisplayStyleSettings.contextRealityModels]] to define context reality models for a display style.
 * @public
 */
export class ContextRealityModel {
  protected readonly _props: ContextRealityModelProps;
  /** A name suitable for display in a user interface. By default, an empty string. */
  public readonly name: string;
  /** The URL that supplies the 3d tiles for displaying the reality model. */
  public readonly url: string;
  /** A description of the model suitable for display in a user interface. By default, an empty string. */
  public readonly description: string;
  /** An optional identifier that, if present, can be used to elide a request to the reality data service. */
  public readonly realityDataId?: string;
  /** A set of [[SpatialClassifier]]s, of which one at any given time can be used to classify the reality model. */
  public readonly classifiers?: SpatialClassifiers;
  /** @alpha */
  public readonly orbitGtBlob?: Readonly<OrbitGtBlobProps>;
  protected _appearanceOverrides?: FeatureAppearance;
  protected _planarClipMask?: PlanarClipMaskSettings;
  /** Event dispatched just before assignment to [[planarClipMaskSettings]]. */
  public readonly onPlanarClipMaskChanged = new BeEvent<(newSettings: PlanarClipMaskSettings | undefined, model: ContextRealityModel) => void>();
  /** Event dispatched just before assignment to [[appearanceOverrides]]. */
  public readonly onAppearanceOverridesChanged = new BeEvent<(newOverrides: FeatureAppearance | undefined, model: ContextRealityModel) => void>();

  /** Construct a new context reality model.
   * @param props JSON representation of the reality model, which will be kept in sync with changes made via the ContextRealityModel's methods.
   */
  public constructor(props: ContextRealityModelProps) {
    this._props = props;
    this.name = props.name ?? "";
    this.url = props.tilesetUrl ?? "";
    this.orbitGtBlob = props.orbitGtBlob;
    this.realityDataId = props.realityDataId;
    this.description = props.description ?? "";
    this._appearanceOverrides = props.appearanceOverrides ? FeatureAppearance.fromJSON(props.appearanceOverrides) : undefined;
    if (props.planarClipMask && props.planarClipMask.mode !== PlanarClipMaskMode.None)
      this._planarClipMask = PlanarClipMaskSettings.fromJSON(props.planarClipMask);

    if (props.classifiers)
      this.classifiers = new SpatialClassifiers(props);
  }

  /** Optionally describes how the geometry of the reality model can be masked by other models. */
  public get planarClipMaskSettings(): PlanarClipMaskSettings | undefined {
    return this._planarClipMask;
  }
  public set planarClipMaskSettings(settings: PlanarClipMaskSettings | undefined) {
    this.onPlanarClipMaskChanged.raiseEvent(settings, this);
    if (!settings)
      delete this._props.planarClipMask;
    else
      this._props.planarClipMask = settings.toJSON();

    this._planarClipMask = settings;
  }

  /** Overrides applied to the appearance of the reality model. Only the rgb, transparency, nonLocatable, and emphasized properties are applicable - the rest are ignored. */
  public get appearanceOverrides(): FeatureAppearance | undefined {
    return this._appearanceOverrides;
  }
  public set appearanceOverrides(overrides: FeatureAppearance | undefined) {
    this.onAppearanceOverridesChanged.raiseEvent(overrides, this);
    if (!overrides)
      delete this._props.appearanceOverrides;
    else
      this._props.appearanceOverrides = overrides.toJSON();

    this._appearanceOverrides = overrides;
  }

  /** Convert this model to its JSON representation. */
  public toJSON(): ContextRealityModelProps {
    return ContextRealityModelProps.clone(this._props);
  }

  /** Returns true if [[name]] and [[url]] match the specified name and url. */
  public matchesNameAndUrl(name: string, url: string): boolean {
    return this.name === name && this.url === url;
  }
}

/** An object that can store the JSON representation of a list of [[ContextRealityModel]]s.
 * @see [[ContextRealityModels]].
 * @see [[DisplayStyleSettingsProps.contextRealityModels]].
 * @public
 */
export interface ContextRealityModelsContainer {
  /** The list of reality models. */
  contextRealityModels?: ContextRealityModelProps[];
}

/** A list of [[ContextRealityModel]]s attached to a [[DisplayStyleSettings]]. The list may be presented to the user with the name and description of each model.
 * The list is automatically synchronized with the underlying JSON representation provided by the input [[ContextRealityModelsContainer]].
 * @see [this interactive example](https://www.itwinjs.org/sample-showcase/?group=Viewer&sample=reality-data-sample)
 * @see [[DisplayStyleSettings.contextRealityModels]].
 * @public
 */
export class ContextRealityModels {
  private readonly _container: ContextRealityModelsContainer;
  private readonly _createModel: (props: ContextRealityModelProps) => ContextRealityModel;
  private readonly _models: ContextRealityModel[] = [];
  /** Event dispatched just before [[ContextRealityModel.planarClipMaskSettings]] is modified for one of the reality models. */
  public readonly onPlanarClipMaskChanged = new BeEvent<(model: ContextRealityModel, newSettings: PlanarClipMaskSettings | undefined) => void>();
  /** Event dispatched just before [[ContextRealityModel.appearanceOverrides]] is modified for one of the reality models. */
  public readonly onAppearanceOverridesChanged = new BeEvent<(model: ContextRealityModel, newOverrides: FeatureAppearance | undefined) => void>();
  /** Event dispatched when a model is [[add]]ed, [[delete]]d, [[replace]]d, or [[update]]d. */
  public readonly onChanged = new BeEvent<(previousModel: ContextRealityModel | undefined, newModel: ContextRealityModel | undefined) => void>();

  /** Construct a new list of reality models from its JSON representation. THe list will be initialized from `container.classifiers` and that JSON representation
   * will be kept in sync with changes made to the list. The caller should not directly modify `container.classifiers` or its contents as that will cause the list
   * to become out of sync with the JSON representation.
   * @param container The object that holds the JSON representation of the list.
   * @param createContextRealityModel Optional function used to instantiate ContextRealityModels added to the list.
   */
  public constructor(container: ContextRealityModelsContainer, createContextRealityModel?: (props: ContextRealityModelProps) => ContextRealityModel) {
    this._container = container;
    this._createModel = createContextRealityModel ?? ((props) => new ContextRealityModel(props));

    const models = container.contextRealityModels;
    if (models)
      for (const model of models)
        this._models.push(this.createModel(model));
  }

  /** The read-only list of reality models. */
  public get models(): ReadonlyArray<ContextRealityModel> {
    return this._models;
  }

  /** Append a new reality model to the list.
   * @param The JSON representation of the reality model.
   * @returns the newly-added reality model.
   */
  public add(props: ContextRealityModelProps): ContextRealityModel {
    if (!this._container.contextRealityModels)
      this._container.contextRealityModels = [];

    props = ContextRealityModelProps.clone(props);
    const model = this.createModel(props);

    this.onChanged.raiseEvent(undefined, model);

    this._models.push(model);
    this._container.contextRealityModels.push(props);

    return model;
  }

  /** Remove the specified reality model from the list.
   * @param model The reality model to remove.
   * @returns true if the model was removed, or false if the model was not present in the list.
   */
  public delete(model: ContextRealityModel): boolean {
    const index = this._models.indexOf(model);
    if (-1 === index)
      return false;

    assert(undefined !== this._container.contextRealityModels);
    assert(index < this._container.contextRealityModels.length);

    this.dropEventListeners(model);
    this.onChanged.raiseEvent(model, undefined);

    this._models.splice(index, 1);
    if (this.models.length === 0)
      this._container.contextRealityModels = undefined;
    else
      this._container.contextRealityModels.splice(index, 1);

    return true;
  }

  /** Remove all reality models from the list. */
  public clear(): void {
    for (const model of this.models) {
      this.dropEventListeners(model);
      this.onChanged.raiseEvent(model, undefined);
    }

    this._container.contextRealityModels = undefined;
    this._models.length = 0;
  }

  /** Replace a reality model in the list.
   * @param toReplace The reality model to be replaced.
   * @param replaceWith The JSON representation of the replacement reality model.
   * @returns the newly-created reality model that replaced `toReplace`.
   * @throws Error if `toReplace` is not present in the list
   * @note The replacement occupies the same index in the list as `toReplace` did.
   */
  public replace(toReplace: ContextRealityModel, replaceWith: ContextRealityModelProps): ContextRealityModel {
    const index = this._models.indexOf(toReplace);
    if (-1 === index)
      throw new Error("ContextRealityModel not present in list.");

    assert(undefined !== this._container.contextRealityModels);
    assert(index < this._container.contextRealityModels.length);

    replaceWith = ContextRealityModelProps.clone(replaceWith);
    const model = this.createModel(replaceWith);

    this.onChanged.raiseEvent(toReplace, model);
    this.dropEventListeners(toReplace);

    this._models[index] = model;
    this._container.contextRealityModels[index] = replaceWith;

    return model;
  }

  /** Change selected properties of a reality model.
   * @param toUpdate The reality model whose properties are to be modified.
   * @param updateProps The properties to change.
   * @returns The updated reality model, identical to `toUpdate` except for properties explicitly supplied by `updateProps`.
   * @throws Error if `toUpdate` is not present in the list.
   */
  public update(toUpdate: ContextRealityModel, updateProps: Partial<ContextRealityModelProps>): ContextRealityModel {
    const props = {
      ...toUpdate.toJSON(),
      ...updateProps,
    };

    // Partial<> makes it possible to pass `undefined` for tilesetUrl...preserve previous URL in that case.
    if (undefined === props.tilesetUrl)
      props.tilesetUrl = toUpdate.url;

    return this.replace(toUpdate, props);
  }

  private createModel(props: ContextRealityModelProps): ContextRealityModel {
    const model = this._createModel(props);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    model.onPlanarClipMaskChanged.addListener(this.handlePlanarClipMaskChanged, this);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    model.onAppearanceOverridesChanged.addListener(this.handleAppearanceOverridesChanged, this);
    return model;
  }

  private dropEventListeners(model: ContextRealityModel): void {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    model.onPlanarClipMaskChanged.removeListener(this.handlePlanarClipMaskChanged, this);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    model.onAppearanceOverridesChanged.removeListener(this.handleAppearanceOverridesChanged, this);
  }

  private handlePlanarClipMaskChanged(mask: PlanarClipMaskSettings | undefined, model: ContextRealityModel): void {
    this.onPlanarClipMaskChanged.raiseEvent(model, mask);
  }

  private handleAppearanceOverridesChanged(app: FeatureAppearance | undefined, model: ContextRealityModel): void {
    this.onAppearanceOverridesChanged.raiseEvent(model, app);
  }
}
