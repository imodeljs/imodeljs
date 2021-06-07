/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { Id64, Id64String } from "@bentley/bentleyjs-core";
import { BatchType, Feature } from "./FeatureTable";
import { ColorDef } from "./ColorDef";
import { GeometryClass } from "./GeometryParams";
import { LinePixels } from "./LinePixels";
import { RgbColor, RgbColorProps } from "./RgbColor";
import { SubCategoryOverride } from "./SubCategoryOverride";

function copyIdSetToUint32Set(dst: Id64.Uint32Set, src: Iterable<string>): void {
  dst.clear();
  if (typeof src === "string") {
    dst.addId(src);
  } else {
    for (const id of src)
      dst.addId(id);
  }
}

// cspell:ignore subcat subcats

/** Properties used to initialize a [[FeatureAppearance]].
 * @public
 */
export interface FeatureAppearanceProps {
  /** The color of the Feature */
  rgb?: RgbColorProps;
  /** The line weight in pixels as an integer in [1, 31] */
  weight?: number;
  /** The transparency in the range [0.0, 1.0] where 0 indicates fully opaque and 1 indicates fully transparent. */
  transparency?: number;
  /** The pixel pattern used to draw lines. */
  linePixels?: LinePixels;
  /** If true, ignore the [[RenderMaterial]] associated with surfaces. */
  ignoresMaterial?: true | undefined;
  /** If true, the associated [[Feature]] will not be drawn when using [Viewport.readPixels]($frontend). */
  nonLocatable?: true | undefined;
  /** If true, the associated [[Feature]] will be emphasized. Emphasized features are rendered using the [[Hilite.Settings]] defined by [Viewport.emphasisSettings]($frontend). */
  emphasized?: true | undefined;
}

/** Defines overrides for selected aspects of a [[Feature]]'s symbology.
 * Any member defined in the appearance overrides that aspect of symbology for all [[Feature]]s to which the appearance is applied.
 * @see [[FeatureOverrides]] to customize the appearance of multiple features.
 * @public
 */
export class FeatureAppearance implements FeatureAppearanceProps {
  public readonly rgb?: RgbColor;
  public readonly weight?: number;
  public readonly transparency?: number;
  public readonly linePixels?: LinePixels;
  public readonly ignoresMaterial?: true | undefined;
  public readonly nonLocatable?: true | undefined;
  public readonly emphasized?: true | undefined;

  /** An appearance that overrides nothing. */
  public static readonly defaults = new FeatureAppearance({});

  public static fromJSON(props?: FeatureAppearanceProps) {
    if (undefined === props || (undefined === props.rgb && undefined === props.weight && undefined === props.transparency && undefined === props.linePixels && !props.ignoresMaterial && !props.nonLocatable && !props.emphasized))
      return this.defaults;
    else
      return new FeatureAppearance(props);
  }

  /** Create a FeatureAppearance that overrides only the RGB color.
   * @note The transparency component of the ColorDef is ignored.
   */
  public static fromRgb(color: ColorDef): FeatureAppearance {
    return this.fromJSON({ rgb: RgbColor.fromColorDef(color) });
  }

  /** Create a FeatureAppearance that overrides the RGB and transparency.
   * The appearance's transparency is derived from the transparency component of the ColorDef.
   */
  public static fromRgba(color: ColorDef): FeatureAppearance {
    return this.fromJSON({
      rgb: RgbColor.fromColorDef(color),
      transparency: color.colors.t / 255,
    });
  }
  /** Create a FeatureAppearance that overrides only the transparency */
  public static fromTransparency(transparencyValue: number): FeatureAppearance {
    return this.fromJSON({ transparency: transparencyValue });
  }

  /** Create a FeatureAppearance with overrides corresponding to those defined by the supplied SubCategoryOverride. */
  public static fromSubCategoryOverride(ovr: SubCategoryOverride): FeatureAppearance {
    const rgb = undefined !== ovr.color ? RgbColor.fromColorDef(ovr.color) : undefined;
    const transparency = ovr.transparency;
    const weight = ovr.weight;
    const ignoresMaterial = undefined !== ovr.material && Id64.isValid(ovr.material) ? true : undefined;
    return this.fromJSON({ rgb, transparency, weight, ignoresMaterial });
  }

  /** Returns true if this appearance does not override any aspects of symbology. */
  public get matchesDefaults(): boolean {
    return this.equals(FeatureAppearance.defaults);
  }

  public get overridesRgb(): boolean { return undefined !== this.rgb; }
  public get overridesTransparency(): boolean { return undefined !== this.transparency; }
  public get overridesLinePixels(): boolean { return undefined !== this.linePixels; }
  public get overridesWeight(): boolean { return undefined !== this.weight; }
  public get overridesSymbology(): boolean {
    return this.overridesRgb || this.overridesTransparency || this.overridesWeight || this.overridesLinePixels || !!this.ignoresMaterial
      || this.emphasized || this.overridesNonLocatable;
  }
  public get overridesNonLocatable(): boolean { return undefined !== this.nonLocatable; }
  public get isFullyTransparent(): boolean { return undefined !== this.transparency && this.transparency >= 1.0; }
  /** Returns true if any aspect of the appearance is overridden (i.e., if any member is not undefined). */
  public get anyOverridden(): boolean { return this.overridesSymbology || this.overridesNonLocatable; }

  public equals(other: FeatureAppearance): boolean {
    if (this === other)
      return true;

    return this.rgbIsEqual(other.rgb)
      && this.weight === other.weight
      && this.transparency === other.transparency
      && this.linePixels === other.linePixels
      && this.ignoresMaterial === other.ignoresMaterial
      && this.nonLocatable === other.nonLocatable
      && this.emphasized === other.emphasized;
  }

  public toJSON(): FeatureAppearanceProps {
    const props: FeatureAppearanceProps = { };
    if (this.rgb)
      props.rgb = this.rgb.toJSON();

    if (undefined !== this.weight)
      props.weight = this.weight;

    if (undefined !== this.transparency)
      props.transparency = this.transparency;

    if (undefined !== this.linePixels)
      props.linePixels = this.linePixels;

    if (true === this.ignoresMaterial)
      props.ignoresMaterial = true;

    if (true === this.nonLocatable)
      props.nonLocatable = true;

    if (true === this.emphasized)
      props.emphasized = true;

    return props;
  }

  /** Convert this appearance to JSON, and override any properties explicitly specified by `changedProps` in the result.
   * Example:
   * ```ts
   *  const base = FeatureAppearance.fromRgba(ColorDef.white); // transparency=0, rgb=white
   *  const clone = base.cloneProps({ transparency: undefined, weight: 5 }); // transparency=undefined, rgb=white, weight=5
   * ```
   * @see [[FeatureAppearance.clone]].
   */
  public cloneProps(changedProps: FeatureAppearanceProps): FeatureAppearanceProps {
    return {
      ...this.toJSON(),
      ...changedProps,
    };
  }

  /** Create a copy of this appearance, overriding any properties explicitly specified by `changedProps`.
   * Example:
   * ```ts
   *  const base = FeatureAppearance.fromRgba(ColorDef.white); // transparency=0, rgb=white
   *  const clone = base.clone({ transparency: undefined, weight: 5 }); // transparency=undefined, rgb=white, weight=5
   * ```
   * @see [[FeatureAppearance.cloneProps]].
   */
  public clone(changedProps: FeatureAppearanceProps): FeatureAppearance {
    return FeatureAppearance.fromJSON(this.cloneProps(changedProps));
  }

  /** Produce a FeatureAppearance from the supplied appearance in which any aspect not defined by the base appearance is overridden by this appearance. */
  public extendAppearance(base: FeatureAppearance): FeatureAppearance {
    if (!this.overridesSymbology)
      return base;

    const props = base.toJSON();
    if (undefined === props.rgb) props.rgb = this.rgb;
    if (undefined === props.transparency) props.transparency = this.transparency;
    if (undefined === props.linePixels) props.linePixels = this.linePixels;
    if (undefined === props.weight) props.weight = this.weight;
    if (undefined === props.ignoresMaterial && this.ignoresMaterial) props.ignoresMaterial = true;
    if (undefined === props.nonLocatable && this.nonLocatable) props.nonLocatable = true;
    if (undefined === props.emphasized && this.emphasized) props.emphasized = true;

    return FeatureAppearance.fromJSON(props);
  }

  protected constructor(props: FeatureAppearanceProps) {
    this.rgb = undefined !== props.rgb ? RgbColor.fromJSON(props.rgb) : undefined;
    this.weight = props.weight;
    this.transparency = props.transparency;
    this.linePixels = props.linePixels;
    this.ignoresMaterial = props.ignoresMaterial;
    this.nonLocatable = props.nonLocatable;
    this.emphasized = props.emphasized;

    if (undefined !== this.weight)
      this.weight = Math.max(1, Math.min(this.weight, 32));

    if (undefined !== this.transparency) {
      this.transparency = Math.max(0, Math.min(this.transparency, 1));

      // Fix up rounding errors...
      const smallDelta = 0.0001;
      if (1.0 - this.transparency < smallDelta)
        this.transparency = 1.0;
      else if (this.transparency < smallDelta)
        this.transparency = 0.0;
    }
  }

  private rgbIsEqual(rgb?: RgbColor): boolean {
    return undefined === this.rgb ? undefined === rgb ? true : false : undefined === rgb ? false : this.rgb.equals(rgb);
  }
}

/** Interface adopted by an object that can supply a [[FeatureAppearance]] given a low-level description of a [[Feature]].
 * @see [[FeatureOverrides]] for the commonly-used implementation.
 * @see [[FeatureAppearanceProvider]] to supplement the appearance supplied by this interface.
 * @public
 */
export interface FeatureAppearanceSource {
  /** Supplies the desired appearance overrides for the specified [[Feature]], or `undefined` if the feature should not be drawn.
   * The feature is described by its components for efficiency reasons.
   * @param elemLo The lower 32 bits of the feature's element Id.
   * @param elemHi The upper 32 bits of the feature's element Id.
   * @param subcatLo The lower 32 bits of the feature's subcategory Id.
   * @param subcatHi The upper 32 bits of the feature's subcategory Id.
   * @param geomClass The geometry class of the feature.
   * @param modelLo The lower 32 bits of the feature's model Id.
   * @param modelHi The upper 32 bits of the feature's model Id.
   * @param type The type of batch to which the feature belongs.
   * @param animationNodeId The Id of the corresponding node in the [[RenderSchedule]], or `0` if none.
   * @returns The desired appearance overrides, or `undefined` to indicate the feature should not be displayed.
   * @see [Id64.isValidUint32Pair]($bentleyjs-core) to determine if the components of an [Id64String]($bentleyjs-core) represent a valid Id.
   */
  getAppearance(elemLo: number, elemHi: number, subcatLo: number, subcatHi: number, geomClass: GeometryClass, modelLo: number, modelHi: number, type: BatchType, animationNodeId: number): FeatureAppearance | undefined;
}

/** Specifies how to customize the appearance of individual [[Feature]]s, typically within the context of a [Viewport]($frontend).
 * Individual aspects of a feature's appearance - like visibility, color, and transparency - are overridden by supplying a [[FeatureAppearance]].
 * Those overrides can be specified on the basis of the feature's model, element, and/or subcategory. A default set of overrides can also be specified to
 * apply to the appearance of any feature not otherwise overridden.
 *
 * It is possible to override multiple aspects of a feature on different bases. For example, you might specify that all features belonging to subcategory "A" should be drawn in red,
 * and that all features belonging to model "B" should be drawn 50% transparent. In this case, a feature belonging to both subcategory "A" and model "B" will be drawn as 50% transparent red -
 * the separate overrides are combined to produce the feature's overall appearance.
 *
 * In the case of conflicts, there is an order of precedence:
 *  - Model overrides take highest precedence.
 *  - Element overrides are of higher precedence than subcategory overrides.
 *  - Subcategory overrides have lowest precedence.
 *
 * For example, you might specify that all features belonging to subcategory "A" should be drawn in red, and all those belonging to model "B" should be drawn in green.
 * Then a feature belonging to subcategory "A" and model "B" will be drawn in green, because the model overrides take precedence.
 *
 * Instances of this class are not typically instantiated by an application directly; instead, an application can implement a [FeatureOverrideProvider]($frontend)
 * that augments the overrides supplied by a viewport.
 *
 * @see [FeatureSymbology.Overrides]($frontend) to create overrides specific to a [Viewport]($frontend) or [ViewState]($frontend).
 * @see [FeatureOverrideProvider]($frontend) to customize the appearance of features within a [Viewport]($frontend).
 * @public
 */
export class FeatureOverrides implements FeatureAppearanceSource {
  /** Ids of elements that should never be drawn. This takes precedence over [[alwaysDrawn]]. @internal */
  protected readonly _neverDrawn = new Id64.Uint32Set();
  /** Ids of elements that should always be drawn. [[neverDrawn]] takes precedence over this set. @internal */
  protected readonly _alwaysDrawn = new Id64.Uint32Set();
  /** If true, no elements *except* those defined in the "always drawn" set will be drawn.
   * @see [[setAlwaysDrawn]]
   */
  public isAlwaysDrawnExclusive = false;
  /** If true, the always-drawn elements are drawn even if their subcategories are not visible.
   * @see [[setAlwaysDrawn]]
   */
  public alwaysDrawnIgnoresSubCategory = true;
  /** If true, all subcategories are considered visible. This is used for drawing sheets via section callouts in the absence of an actual sheet view.
   * @internal
   */
  public ignoreSubCategory = false;

  /** Overrides applied to any feature not explicitly overridden. @internal */
  protected _defaultOverrides = FeatureAppearance.defaults;
  /** Whether construction geometry should be drawn. @internal */
  protected _constructions = false;
  /** Whether dimensions should be drawn. @internal */
  protected _dimensions = false;
  /** Whether area patterns should be drawn. @internal */
  protected _patterns = false;
  /** Whether line weights should be applied. If false, all lines are rendered 1-pixel wide. @internal */
  protected _lineWeights = true;

  /** Overrides applied to all elements belonging to each model. @internal */
  protected readonly _modelOverrides = new Id64.Uint32Map<FeatureAppearance>();
  /** Overrides applied to specific elements. @internal */
  protected readonly _elementOverrides = new Id64.Uint32Map<FeatureAppearance>();
  /** Overrides applied to geometry belonging to each subcategory. @internal */
  protected readonly _subCategoryOverrides = new Id64.Uint32Map<FeatureAppearance>();
  /** The set of displayed subcategories. Geometry belonging to subcategories not included in this set will not be drawn. @internal */
  protected readonly _visibleSubCategories = new Id64.Uint32Set();
  /** Display priorities assigned to subcategories, possibly overridden by display style. Only applicable for plan projection models. @internal */
  protected readonly _subCategoryPriorities = new Id64.Uint32Map<number>();

  /** Per-model, a set of subcategories whose visibility should be inverted for elements within that model.
   * Populated by Viewport.
   * @internal
   */
  protected readonly _modelSubCategoryOverrides = new Id64.Uint32Map<Id64.Uint32Set>();

  /** Ids of animation nodes that should never be drawn.
   * @internal
   */
  public readonly neverDrawnAnimationNodes = new Set<number>();
  /** Mapping of animation node Ids to overrides applied to the corresponding animation nodes.
   * @internal
   */
  public readonly animationNodeOverrides = new Map<number, FeatureAppearance>();

  /** Overrides applied to features for which no other overrides are defined */
  public get defaultOverrides(): FeatureAppearance { return this._defaultOverrides; }
  /** Whether or not line weights are applied. If false, all lines are drawn with a weight of 1. */
  public get lineWeights(): boolean { return this._lineWeights; }

  /** @internal */
  public get neverDrawn() { return this._neverDrawn; }
  /** @internal */
  public get alwaysDrawn() { return this._alwaysDrawn; }

  /** @internal */
  protected isNeverDrawn(elemIdLo: number, elemIdHi: number, animationNodeId: number): boolean {
    if (this._neverDrawn.has(elemIdLo, elemIdHi))
      return true;
    else
      return this.neverDrawnAnimationNodes.has(animationNodeId);
  }
  /** @internal */
  protected isAlwaysDrawn(idLo: number, idHi: number): boolean { return this._alwaysDrawn.has(idLo, idHi); }
  /** Returns true if the [SubCategory]($backend) specified by Id is in the set of visible subcategories. @internal */
  public isSubCategoryVisible(idLo: number, idHi: number): boolean { return this._visibleSubCategories.has(idLo, idHi); }
  /** @internal */
  public isSubCategoryVisibleInModel(subcatLo: number, subcatHi: number, modelLo: number, modelHi: number): boolean {
    if (this.ignoreSubCategory)
      return true;

    let vis = this.isSubCategoryVisible(subcatLo, subcatHi);
    const modelOvr = this._modelSubCategoryOverrides.get(modelLo, modelHi);
    if (undefined !== modelOvr && modelOvr.has(subcatLo, subcatHi))
      vis = !vis;

    return vis;
  }

  /** @internal */
  protected getModelOverrides(idLo: number, idHi: number): FeatureAppearance | undefined { return this._modelOverrides.get(idLo, idHi); }
  /** @internal */
  protected getElementOverrides(idLo: number, idHi: number, animationNodeId: number): FeatureAppearance | undefined {
    const app = this._elementOverrides.get(idLo, idHi);
    if (app !== undefined)
      return app;

    return this.animationNodeOverrides.get(animationNodeId);
  }
  /** @internal */
  protected getSubCategoryOverrides(idLo: number, idHi: number): FeatureAppearance | undefined { return this._subCategoryOverrides.get(idLo, idHi); }

  /** Add a [SubCategory]($backend) to the set of visible subcategories. */
  public setVisibleSubCategory(id: Id64String): void { this._visibleSubCategories.addId(id); }
  /** Specify the Id of an element that should never be drawn. */
  public setNeverDrawn(id: Id64String): void { this._neverDrawn.addId(id); }
  /** Specify the Id of an element that should always be drawn. */
  public setAlwaysDrawn(id: Id64String): void { this._alwaysDrawn.addId(id); }
  /** Specify the Id of a animation node that should never be drawn. */
  public setAnimationNodeNeverDrawn(id: number): void { this.neverDrawnAnimationNodes.add(id); }
  /** Specify the Ids of elements that should never be drawn. */
  public setNeverDrawnSet(ids: Iterable<Id64String>) { copyIdSetToUint32Set(this._neverDrawn, ids); }
  /** Specify the Ids of elements that should always be drawn. */
  public setAlwaysDrawnSet(ids: Iterable<Id64String>, exclusive: boolean, ignoreSubCategory = true) {
    copyIdSetToUint32Set(this._alwaysDrawn, ids);
    this.isAlwaysDrawnExclusive = exclusive;
    this.alwaysDrawnIgnoresSubCategory = ignoreSubCategory;
  }

  /** Returns the feature's appearance overrides, or undefined if the feature is not visible. */
  public getFeatureAppearance(feature: Feature, modelId: Id64String, type: BatchType = BatchType.Primary, animationNodeId = 0): FeatureAppearance | undefined {
    return this.getAppearance(
      Id64.getLowerUint32(feature.elementId), Id64.getUpperUint32(feature.elementId),
      Id64.getLowerUint32(feature.subCategoryId), Id64.getUpperUint32(feature.subCategoryId),
      feature.geometryClass,
      Id64.getLowerUint32(modelId), Id64.getUpperUint32(modelId),
      type, animationNodeId);
  }

  private static readonly _weight1Appearance = FeatureAppearance.fromJSON({ weight: 1 });

  /** Returns a feature's appearance overrides, or undefined if the feature is not visible.
   * Takes Id64s as pairs of unsigned 32-bit integers for efficiency, because that is how they are stored by the PackedFeatureTable associated with each batch of graphics.
   * @see [[getFeatureAppearance]] for an equivalent function that accepts [Id64String]($bentleyjs-core)s instead of integer pairs.
   */
  public getAppearance(elemLo: number, elemHi: number, subcatLo: number, subcatHi: number, geomClass: GeometryClass, modelLo: number, modelHi: number, type: BatchType, animationNodeId: number): FeatureAppearance | undefined {
    if (BatchType.VolumeClassifier === type || BatchType.PlanarClassifier === type)
      return this.getClassifierAppearance(elemLo, elemHi, subcatLo, subcatHi, modelLo, modelHi, animationNodeId);

    let app = !this._lineWeights ? FeatureOverrides._weight1Appearance : FeatureAppearance.defaults;
    const modelApp = this.getModelOverrides(modelLo, modelHi);
    if (undefined !== modelApp)
      app = modelApp.extendAppearance(app);

    // Is the element visible?
    let elemApp, alwaysDrawn = false;

    if (Id64.isValidUint32Pair(elemLo, elemHi)) {
      if (this.isNeverDrawn(elemLo, elemHi, animationNodeId))
        return undefined;

      alwaysDrawn = this.isAlwaysDrawn(elemLo, elemHi);
      if (!alwaysDrawn && this.isAlwaysDrawnExclusive)
        return undefined;

      // Element overrides take precedence
      elemApp = this.getElementOverrides(elemLo, elemHi, animationNodeId);
      if (undefined !== elemApp)
        app = undefined !== modelApp ? elemApp.extendAppearance(app) : elemApp;
    }

    let subCatApp;
    if (!this.ignoreSubCategory && Id64.isValidUint32Pair(subcatLo, subcatHi)) {
      if ((!alwaysDrawn || !this.alwaysDrawnIgnoresSubCategory) && !this.isSubCategoryVisibleInModel(subcatLo, subcatHi, modelLo, modelHi))
        return undefined;

      subCatApp = this.getSubCategoryOverrides(subcatLo, subcatHi);
      if (undefined !== subCatApp)
        app = subCatApp.extendAppearance(app);
    }

    // Only apply default if *no* appearance was explicitly registered (doesn't matter if registered appearance does not actually override anything)
    if (undefined === elemApp && undefined === modelApp && undefined === subCatApp)
      app = this._defaultOverrides.extendAppearance(app);

    let visible = alwaysDrawn || this.isClassVisible(geomClass);
    if (visible && app.isFullyTransparent)
      visible = false; // don't bother rendering something with full transparency...

    return visible ? app : undefined;
  }

  /** Classifiers behave totally differently...in particular they are never invisible unless fully-transparent.
   * @internal
   */
  protected getClassifierAppearance(elemLo: number, elemHi: number, subcatLo: number, subcatHi: number, modelLo: number, modelHi: number, animationNodeId: number): FeatureAppearance | undefined {
    let app = FeatureAppearance.defaults;
    const modelApp = this.getModelOverrides(modelLo, modelHi);
    if (undefined !== modelApp)
      app = modelApp.extendAppearance(app);

    const elemApp = this.getElementOverrides(elemLo, elemHi, animationNodeId);
    if (undefined !== elemApp)
      app = undefined !== modelApp ? elemApp.extendAppearance(app) : elemApp;

    if (!this.ignoreSubCategory && Id64.isValidUint32Pair(subcatLo, subcatHi)) {
      const subCat = this.getSubCategoryOverrides(subcatLo, subcatHi);
      if (undefined !== subCat)
        app = subCat.extendAppearance(app);
    }

    if (undefined === elemApp && undefined === modelApp)
      app = this._defaultOverrides.extendAppearance(app);

    // NB: A fully-transparent classifier means the classifier is a clip mask - classified pixels will be discarded.
    return app;
  }

  /** Return whether geometry of the specified class should be drawn.
   * @see [[ViewFlags.constructions]], [[ViewFlags.dimensions]], and [[ViewFlags.patterns]].
   */
  public isClassVisible(geomClass: GeometryClass): boolean {
    switch (geomClass) {
      case GeometryClass.Construction: return this._constructions;
      case GeometryClass.Dimension: return this._dimensions;
      case GeometryClass.Pattern: return this._patterns;
      default: return true;
    }
  }

  /** Specify overrides for all elements within the specified model.
   * @param id The Id of the model.
   * @param app The symbology overrides.
   * @param replaceExisting Specifies whether to replace a pre-existing override for the same model.
   * @note These overrides take priority over all other overrides.
   * @note If [[defaultOverrides]] are defined, they will not apply to any element within this model, even if the supplied appearance overrides nothing.
   */
  public overrideModel(id: Id64String, app: FeatureAppearance, replaceExisting: boolean = true): void {
    const idLo = Id64.getLowerUint32(id);
    const idHi = Id64.getUpperUint32(id);
    if (replaceExisting || undefined === this.getModelOverrides(idLo, idHi))
      this._modelOverrides.set(idLo, idHi, app);
  }

  /** Specify overrides for all geometry belonging to the specified [SubCategory]($backend).
   * @param id The Id of the subcategory.
   * @param app The symbology overrides.
   * @param replaceExisting Specifies whether to replace a pre-existing override for the same subcategory.
   * @note These overrides have lower priority than element and model overrides.
   * @note If [[defaultOverrides]] are defined, they will not apply to any geometry within this subcategory, even if the supplied appearance overrides nothing.
   */
  public overrideSubCategory(id: Id64String, app: FeatureAppearance, replaceExisting: boolean = true): void {
    // NB: We used to do nothing if this.isSubCategoryVisible() => false but now models can turn invisible subcategories visible in their own context.
    const idLo = Id64.getLowerUint32(id);
    const idHi = Id64.getUpperUint32(id);

    // NB: Appearance may specify no overridden symbology - this means "don't apply the default overrides to this subcategory"
    if (replaceExisting || undefined === this.getSubCategoryOverrides(idLo, idHi))
      this._subCategoryOverrides.set(idLo, idHi, app);
  }

  /** Specify overrides for all geometry originating from the specified element.
   * @param id The Id of the element.
   * @param app The symbology overrides.
   * @param replaceExisting Specifies whether to replace a pre-existing override for the same element.
   * @note These overrides take precedence over subcategory overrides, but not over model overrides.
   * @note If [[defaultOverrides]] are defined, they will not apply to this element, even if the supplied appearance overrides nothing.
   */
  public overrideElement(id: Id64String, app: FeatureAppearance, replaceExisting: boolean = true): void {
    const idLo = Id64.getLowerUint32(id);
    const idHi = Id64.getUpperUint32(id);
    if (this.isNeverDrawn(idLo, idHi, 0))
      return;

    // NB: Appearance may specify no overridden symbology - this means "don't apply the default overrides to this element"
    if (replaceExisting || undefined === this.getElementOverrides(idLo, idHi, 0))
      this._elementOverrides.set(idLo, idHi, app);
  }

  /** Specify overrides for all geometry originating from the specified animation node.
   * @param id The Id of the animation node.
   * @param app The symbology overrides.
   * @note These overrides do not take precedence over element overrides.
   */
  public overrideAnimationNode(id: number, app: FeatureAppearance): void { this.animationNodeOverrides.set(id, app); }

  /** Defines a default appearance to be applied to any [[Feature]] *not* explicitly overridden.
   * @param appearance The symbology overrides.
   * @param replaceExisting Specifies whether to replace the current default overrides if they are already defined.
   */
  public setDefaultOverrides(appearance: FeatureAppearance, replaceExisting: boolean = true): void {
    if (replaceExisting || !appearance.overridesSymbology)
      this._defaultOverrides = appearance;
  }

  /** Get the display priority of a subcategory. This is only relevant when using [[PlanProjectionSettings]].
   * @internal
   */
  public getSubCategoryPriority(idLo: number, idHi: number): number {
    return this._subCategoryPriorities.get(idLo, idHi) ?? 0;
  }

  /** Construct a new Overrides that overrides nothing.
   * @see [FeatureSymbology.Overrides]($frontend) to construct overrides based on a [ViewState]($frontend) or [Viewport]($frontend).
   */
  public constructor() {
    //
  }

  /** Returns true if geometry belonging to the specified subcategory will be drawn. */
  public isSubCategoryIdVisible(id: Id64String): boolean { return this.isSubCategoryVisible(Id64.getLowerUint32(id), Id64.getUpperUint32(id)); }
  /** Returns the overrides applied to geometry belonging to the specified model, if any such are defined. */
  public getModelOverridesById(id: Id64String): FeatureAppearance | undefined { return this.getModelOverrides(Id64.getLowerUint32(id), Id64.getUpperUint32(id)); }
  /** Returns the overrides applied to geometry belonging to the specified element, if any such are defined. */
  public getElementOverridesById(id: Id64String): FeatureAppearance | undefined { return this.getElementOverrides(Id64.getLowerUint32(id), Id64.getUpperUint32(id), 0); }
  /** Returns the overrides applied to geometry belonging to the specified subcategory, if any such are defined. */
  public getSubCategoryOverridesById(id: Id64String): FeatureAppearance | undefined { return this.getSubCategoryOverrides(Id64.getLowerUint32(id), Id64.getUpperUint32(id)); }

  /** Returns true if the specified Feature will be drawn. */
  public isFeatureVisible(feature: Feature): boolean {
    const { elementId, subCategoryId, geometryClass } = feature;
    const isValidElemId = !Id64.isInvalid(elementId);
    const elemIdParts = isValidElemId ? Id64.getUint32Pair(elementId) : undefined;

    if (undefined !== elemIdParts && this.isNeverDrawn(elemIdParts.lower, elemIdParts.upper, 0))
      return false;

    const alwaysDrawn = undefined !== elemIdParts && this.isAlwaysDrawn(elemIdParts.lower, elemIdParts.upper);
    if (alwaysDrawn || this.isAlwaysDrawnExclusive)
      return alwaysDrawn;

    // NB: This ignores per-model subcategory visibility overrides, because caller did not specify a model.
    if (!this.isSubCategoryIdVisible(subCategoryId))
      return false;

    return this.isClassVisible(geometryClass);
  }
}

/** Interface adopted by an object that can supply the [[FeatureAppearance]] supplied by a [[FeatureAppearanceSource]].
 * This is useful for selectively overriding or agumenting a [Viewport]($frontend)'s symbology overrides.
 * A typical implementation will invoke [[FeatureAppearanceSource.getAppeaprance]] and customize the returned appearance.
 * @see [[FeatureAppearanceProvider.chain]] to chain two providers together.
 * @public
 */
export interface FeatureAppearanceProvider {
  /** Supply the desired appearance overrides for the specified [[Feature]], or `undefined` if the feature should not be drawn.
   * The feature is described by its components for efficiency reasons.
   * @param source The base symbology overrides, e.g., typically defined by a [Viewport]($frontend).
   * @param elemLo The lower 32 bits of the feature's element Id.
   * @param elemHi The upper 32 bits of the feature's element Id.
   * @param subcatLo The lower 32 bits of the feature's subcategory Id.
   * @param subcatHi The upper 32 bits of the feature's subcategory Id.
   * @param geomClass The geometry class of the feature.
   * @param modelLo The lower 32 bits of the feature's model Id.
   * @param modelHi The upper 32 bits of the feature's model Id.
   * @param type The type of batch to which the feature belongs.
   * @param animationNodeId The Id of the corresponding node in the [[RenderSchedule]], or `0` if none.
   * @returns The desired appearance overrides, or `undefined` to indicate the feature should not be displayed.
   * @see [[FeatureAppearanceSource.getAppearance]] to forward the request to the source.
   * @see [Id64.isValidUint32Pair]($bentleyjs-core) to determine if the components of an [Id64String]($bentleyjs-core) represent a valid Id.
   */
  getFeatureAppearance(source: FeatureAppearanceSource, elemLo: number, elemHi: number, subcatLo: number, subcatHi: number, geomClass: GeometryClass, modelLo: number, modelHi: number, type: BatchType, animationNodeId: number): FeatureAppearance | undefined;
}

/** @public */
export namespace FeatureAppearanceProvider {
  /** Produce a FeatureAppearanceSource for which `getAppearance()` returns the appearance specified in `source`, potentially modified by `provider`. */
  function wrap(source: FeatureAppearanceSource, provider: FeatureAppearanceProvider): FeatureAppearanceSource {
    return {
      getAppearance: (elemLo: number, elemHi: number, subcatLo: number, subcatHi: number, geomClass: GeometryClass, modelLo: number, modelHi: number, type: BatchType, animationNodeId: number) => {
        return provider.getFeatureAppearance(source, elemLo, elemHi, subcatLo, subcatHi, geomClass, modelLo, modelHi, type, animationNodeId);
      },
    };
  }

  /** Create a provider that obtains each feature's appearance from the source, and if the feature is visible, modifies the appearance.
   * @param supplementAppearance A function accepting the feature's base appearance and returning a supplemental appearance.
   * @public
   */
  export function supplement(supplementAppearance: (appearance: FeatureAppearance) => FeatureAppearance): FeatureAppearanceProvider {
    return {
      getFeatureAppearance: (source: FeatureAppearanceSource, elemLo: number, elemHi: number, subcatLo: number, subcatHi: number, geomClass: GeometryClass, modelLo: number, modelHi: number, type: BatchType, animationNodeId: number) => {
        const app = source.getAppearance(elemLo, elemHi, subcatLo, subcatHi, geomClass, modelLo, modelHi, type, animationNodeId);
        return app ? supplementAppearance(app) : app;
      },
    };
  }

  /** Chain two FeatureAppearanceProviders together such that `first`'s `getFeatureAppearance` function is applied before `second`'s.
   * If `second` invokes `source.getAppearance()`, the returned appearance will include any modifications applied by `first`.
   * @public
   */
  export function chain(first: FeatureAppearanceProvider, second: FeatureAppearanceProvider): FeatureAppearanceProvider {
    if (first === second)
      return first;

    return {
      getFeatureAppearance: (source: FeatureAppearanceSource, elemLo: number, elemHi: number, subcatLo: number, subcatHi: number, geomClass: GeometryClass, modelLo: number, modelHi: number, type: BatchType, animationNodeId: number) => {
        return second.getFeatureAppearance(wrap(source, first), elemLo, elemHi, subcatLo, subcatHi, geomClass, modelLo, modelHi, type, animationNodeId);
      },
    };
  }
}
