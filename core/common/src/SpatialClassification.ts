/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DisplayStyles
 */

import { assert, Id64String } from "@bentley/bentleyjs-core";

/** Describes how a [[SpatialClassifier]] affects the display of classified geometry - that is, geometry intersecting
 * the classifier.
 * @public
 */
export enum SpatialClassifierInsideDisplay {
  /** The geometry is not displayed. */
  Off = 0,
  /** The geometry is displayed without alteration. */
  On = 1,
  /** The geometry is darkened. */
  Dimmed = 2,
  /** The geometry is tinted by the [Viewport.hilite]($frontend) color. */
  Hilite = 3,
  /** The geometry is tinted with the colors of the classifier elements. */
  ElementColor = 4,
}

/** Describes how a [[SpatialClassifier]] affects the display of unclassified geometry - that is, geometry not intersecting
 * the classifier.
 * @public
 */
export enum SpatialClassifierOutsideDisplay {
  /** The geometry is not displayed. */
  Off = 0,
  /** The geometry is displayed without alteration. */
  On = 1,
  /** The geometry is darkened. */
  Dimmed = 2,
}

/** JSON representation of a [[SpatialClassifierFlags]].
 * @public
 */
export interface SpatialClassifierFlagsProps {
  /** @see [[SpatialClassifierFlags.inside]]. */
  inside: SpatialClassifierInsideDisplay;
  /** @see [[SpatialClassifierFlags.outside]]. */
  outside: SpatialClassifierOutsideDisplay;
  /** @see [[SpatialClassifierFlags.isVolumeClassifier]]. */
  isVolumeClassifier?: boolean;
}

/** Flags affecting how a [[SpatialClassifier]] is applied.
 * @public
 */
export class SpatialClassifierFlags {
  /** How geometry intersecting the classifier should be displayed. */
  public readonly inside: SpatialClassifierInsideDisplay;
  /** How geometry not intersecting the classifier should be displayed. */
  public readonly outside: SpatialClassifierOutsideDisplay;
  /** True for volume classification; false for planar classification. */
  public readonly isVolumeClassifier: boolean;

  /** Construct new flags. */
  public constructor(inside = SpatialClassifierInsideDisplay.ElementColor, outside = SpatialClassifierOutsideDisplay.Dimmed, isVolumeClassifier = false) {
    this.inside = insideDisplay(inside);
    this.outside = outsideDisplay(outside);
    this.isVolumeClassifier = isVolumeClassifier;
  }

  /** Construct from JSON representation. */
  public static fromJSON(props: SpatialClassifierFlagsProps): SpatialClassifierFlags {
    return new SpatialClassifierFlags(props.inside, props.outside, true === props.isVolumeClassifier);
  }

  /** Convert to JSON representation. */
  public toJSON(): SpatialClassifierFlagsProps {
    const props: SpatialClassifierFlagsProps = {
      inside: this.inside,
      outside: this.outside,
    };

    if (this.isVolumeClassifier)
      props.isVolumeClassifier = true;

    return props;
  }

  /** Create flags indentical to these ones except for any properties explicitly specified by `changedProps`. */
  public clone(changedProps?: Partial<SpatialClassifierFlagsProps>): SpatialClassifierFlags {
    if (!changedProps)
      return this;

    return SpatialClassifierFlags.fromJSON({ ...this.toJSON(), ...changedProps });
  }

  /** Return true if these flags are equivalent to `other`. */
  public equals(other: SpatialClassifierFlags): boolean {
    if (other === this)
      return true;

    return other.inside === this.inside && other.outside === this.outside && other.isVolumeClassifier === this.isVolumeClassifier;
  }

  /** Return true if these flags are equivalent to `props`. */
  public equalsProps(props: SpatialClassifierFlagsProps): boolean {
    return this.inside === props.inside && this.outside === props.outside && this.isVolumeClassifier === (true === props.isVolumeClassifier);
  }
}

/** JSON representation of a [[SpatialClassifier]].
 * @public
 */
export interface SpatialClassifierProps {
  /** @see [[SpatialClassifier.modelId]]. */
  modelId: Id64String;
  /** @see [[SpatialClassifier.expand]]. */
  expand: number;
  /** @see [[SpatialClassifier.flags]]. */
  flags: SpatialClassifierFlagsProps;
  /** @see [[SpatialClassifier.name]]. */
  name: string;
  /** Records whether this is the active classifier.
   * @see [[SpatialClassifier.active]].
   */
  isActive?: boolean;
}

/** Describes how to use the geometry of one [GeometricModel]($backend) to classify the contents of other models - most typically, reality models.
 * Applying a classifier divides the geometry of the classified model into two groups:
 *  - Classified (intersecting the classifier); and
 *  - Unclassified (not intersecting the classifier).
 * For example, a model containing the building footprints for a city block could be used to classify a reality mesh captured from photographs of the
 * real-world block. Then, buildings within the reality mesh can be selected individually, and present the properties of the classifier geometry (e.g.,
 * the address of the building). The appearance of the geometry can also be customized based using [[SpatialClassifierInsideDisplay]] and [[SpatialClassifierOutsideDisplay]].
 * Two types of classification are supported:
 *  - Planar classification, in which the geometry of the classifier model is projected onto a plane to classify geometry within a region extruded perpendicular
 * the plane (e.g., the building footprints example); and
 *  - Volume classification, in which closed volumes within the classifier classify geometry that intersects those same volumes (e.g., imagine using boxes instead
 * of footprints to classify buildings, or floors of buildings).
 * @see this (interactive example)[https://www.itwinjs.org/sample-showcase/?group=Viewer+Features&sample=classifier-sample].
 * @see [[SpatialClassifiers]] to define a set of classifiers.
 * @see [[ContextRealityModel.classifiers]] to classify a context reality model.
 * @see [SpatialModelState.classifiers]($frontend) to classify a persistent reality model.
 * @public
 */
export class SpatialClassifier {
  /** The Id of the [GeometricModel]($backend) whose geometry is used to produce the classifier. */
  public readonly modelId: Id64String;
  /** A distance in meters by which to expand the classifier geometry. For example, if line strings are used to represent streets,
   * you might expand them to the average width of a street.
   */
  public readonly expand: number;
  /** Flags controlling how to apply the classifier. */
  public readonly flags: SpatialClassifierFlags;
  /** A user-friendly name, useful for identifying individual classifiers within a [[SpatialClassifiers]]. */
  public readonly name: string;

  /** Construct a new classifier. */
  public constructor(modelId: Id64String, name: string, flags = new SpatialClassifierFlags(), expand = 0) {
    this.modelId = modelId;
    this.expand = expand;
    this.flags = flags;
    this.name = name;
  }

  /** Construct from JSON representation. */
  public static fromJSON(props: SpatialClassifierProps): SpatialClassifier {
    return new SpatialClassifier(props.modelId, props.name, SpatialClassifierFlags.fromJSON(props.flags), props.expand);
  }

  /** Convert to JSON representation.
   * @note This method always sets the [[SpatialClassifierProps.isActive]] property to `false`.
   */
  public toJSON(): SpatialClassifierProps {
    return {
      modelId: this.modelId,
      expand: this.expand,
      flags: this.flags.toJSON(),
      name: this.name,
      isActive: false,
    };
  }

  /** Create a classifier identical to this one except for any properties explicitly specified by `changedProps`. */
  public clone(changedProps?: Partial<SpatialClassifierProps>): SpatialClassifier {
    if (!changedProps)
      return this;

    return SpatialClassifier.fromJSON({ ...this.toJSON(), ...changedProps });
  }

  /** Return true if this classifier is equivalent to `other`. */
  public equals(other: SpatialClassifier): boolean {
    if (other === this)
      return true;

    return this.modelId === other.modelId && this.expand === other.expand && this.name === other.name && this.flags.equals(other.flags);
  }

  /** Return true if this classifier is equivalent to `props`. */
  public equalsProps(props: SpatialClassifierProps): boolean {
    return this.modelId === props.modelId && this.expand === props.expand && this.name === props.name && this.flags.equalsProps(props.flags);
  }
}

/** An object that can store the JSON representation of a list of [[SpatialClassifier]]s.
 * @see [[SpatialClassifiers]].
 * @public
 */
export interface SpatialClassifiersContainer {
  /** The list of classifiers. */
  classifiers?: SpatialClassifierProps[];
}

/** A set of [[SpatialClassifier]]s for a given reality model. At most one of the classifiers can be actively classifying the model at any given time.
 * The set of classifiers can be presented to the user, listed by name, so that the active classifier can be changed.
 * The set of classifiers is populated from its JSON representation and that representation is kept in sync as the set of classifiers is modified.
 * @see this (interactive example)[https://www.itwinjs.org/sample-showcase/?group=Viewer+Features&sample=classifier-sample].
 * @see [[SpatialClassifier]] for details on how spatial classification works.
 * @see [[ContextRealityModel.classifiers]] to define classifiers for a context reality model.
 * @see [SpatialModelState.classifiers]($frontend) to define classifiers for a persistent reality model.
 * @public
 */
export class SpatialClassifiers implements Iterable<SpatialClassifier> {
  private readonly _json: SpatialClassifiersContainer;
  private readonly _classifiers: SpatialClassifier[] = [];
  private _active?: SpatialClassifier;

  /** Construct a new set of classifiers from the JSON representation. The set will be initialized from `container.classifiers` and that JSON representation
   * will be kept in sync with changes made to the set. The caller should not directly modify `container.classifiers` or its contents as that will cause the set to become out
   * of sync with the JSON representation.
   * The [[active]] classifier will be determined by the first [[SpatialClassifierProps]] whose `isActive` property is set to `true`, if any.
   */
  public constructor(container: SpatialClassifiersContainer) {
    this._json = container;

    const json = this._array;
    if (!json)
      return;

    for (const props of json) {
      const classifier = SpatialClassifier.fromJSON(props);
      this._classifiers.push(classifier);
      if (props.isActive) {
        if (!this._active)
          this._active = classifier;
        else
          props.isActive = false;
      }
    }
  }

  /** The classifier currently classifying the target reality model. The classifier passed to the setter must be one obtained from this set, or one equivalent to
   * one contained in this set; in the latter case, the equivalent classifier contained in this set becomes active.
   */
  /** The classifier currently classifying the target reality model, if any.
   * @see [[setActive]] to change the active classifier.
   */
  public get active(): SpatialClassifier | undefined {
    return this._active;
  }

  /** Change the [[active]] classifier. The input must be a classifier belonging to this set, or equivalent to one in the set.
   * If no equivalent classifier exists in the set, the active classifier remains unchanged.
   * @param The classifier to set as active, or `undefined` to clear the active classifier.
   * @returns the active classifier.
   */
  public setActive(active: SpatialClassifier | undefined): SpatialClassifier | undefined {
    const array = this._array;
    if (!array)
      return this.active;

    if (active) {
      active = this.findEquivalent(active);
      if (!active)
        return this.active;
    }

    if (active === this.active)
      return this.active;

    let propsIndex = -1;
    if (active) {
      propsIndex = array.findIndex((x) => active!.equalsProps(x));
      if (-1 === propsIndex)
        return this.active;
    }

    this._active = active;
    for (let i = 0; i < array.length; i++)
      array[i].isActive = (i === propsIndex);

    return this.active;
  }

  /** Obtain an iterator over the classifiers contained in this set. */
  public [Symbol.iterator](): Iterator<SpatialClassifier> {
    return this._classifiers[Symbol.iterator]();
  }

  /** The number of classifiers in this set. */
  public get size(): number {
    return this._array?.length ?? 0;
  }

  /** Returns the first classifier that satisfies `criterion`, or `undefined` if no classifier satisfies it. */
  public find(criterion: (classifier: SpatialClassifier) => boolean): SpatialClassifier | undefined {
    return this._classifiers.find(criterion);
  }

  /** Find the first classifier that is equivalent to the supplied classifier, or `undefined` if no equivalent classifier exists in this set. */
  public findEquivalent(classifier: SpatialClassifier): SpatialClassifier | undefined {
    return this.find((x) => x.equals(classifier));
  }

  /** Return true if the specified classifier or one equivalent to it exists in this set. */
  public has(classifier: SpatialClassifier): boolean {
    return undefined !== this.findEquivalent(classifier);
  }

  /** Add a classifier to this set. If an equivalent classifier already exists, the supplied classifier is not added.
   * @param classifier The classifier to add.
   * @returns The equivalent pre-existing classifier, if one existed; or the supplied classifier, if it was added to the set.
   */
  public add(classifier: SpatialClassifier): SpatialClassifier {
    const existing = this.findEquivalent(classifier);
    if (existing)
      return existing;

    let array = this._array;
    if (!array)
      array = this._json.classifiers = [];

    this._classifiers.push(classifier);
    array.push(classifier.toJSON());
    return classifier;
  }

  /** Replace an existing classifier with a different one.
   * @param toReplace The classifier to be replaced.
   * @param replacement The classifier to replace `toReplace`.
   * @returns true if a classifier equivalent to `toReplace` existed in the set and was replaced by `replacement`.
   * @note If `toReplace` was the [[active]] classifier, `replacement` will become active.
   */
  public replace(toReplace: SpatialClassifier, replacement: SpatialClassifier): boolean {
    const list = this._array;
    if (!list)
      return false;

    const classifierIndex = this._classifiers.findIndex((x) => x.equals(toReplace));
    if (-1 === classifierIndex)
      return false;

    const propsIndex = list.findIndex((x) => toReplace.equalsProps(x));
    assert(propsIndex === classifierIndex);
    if (-1 === propsIndex)
      return false;

    toReplace = this._classifiers[classifierIndex];
    const wasActive = this.active === toReplace;

    this._classifiers[classifierIndex] = replacement;
    const props = list[propsIndex] = replacement.toJSON();

    if (wasActive) {
      props.isActive = true;
      this._active = replacement;
    }

    return true;
  }

  /** Remove the first classifier equivalent to `classifier` from this set.
   * @param classifier The classifier to remove.
   * @returns The classifier that was actually removed, or `undefined` if none was removed.
   */
  public delete(classifier: SpatialClassifier): SpatialClassifier | undefined {
    const list = this._array;
    if (!list)
      return undefined;

    const classifierIndex = this._classifiers.findIndex((x) => x.equals(classifier));
    if (-1 === classifierIndex)
      return undefined;

    classifier = this._classifiers[classifierIndex];
    const propsIndex = list.findIndex((x) => classifier.equalsProps(x));
    assert(propsIndex === classifierIndex);
    if (-1 === propsIndex)
      return undefined;

    list.splice(propsIndex, 1);
    this._classifiers.splice(classifierIndex, 1);
    if (list.length === 0)
      this._json.classifiers = undefined;

    if (classifier === this.active)
      this._active = undefined;

    return classifier;
  }

  /** Remove all classifiers from this set. */
  public clear(): void {
    this._classifiers.length = 0;
    this._json.classifiers = undefined;
    this._active = undefined;
  }

  private get _array(): SpatialClassifierProps[] | undefined {
    return Array.isArray(this._json.classifiers) ? this._json.classifiers : undefined;
  }
}

function insideDisplay(display: number): SpatialClassifierInsideDisplay {
  switch (display) {
    case SpatialClassifierInsideDisplay.Off:
    case SpatialClassifierInsideDisplay.On:
    case SpatialClassifierInsideDisplay.Dimmed:
    case SpatialClassifierInsideDisplay.Hilite:
    case SpatialClassifierInsideDisplay.ElementColor:
      return display;
    default:
      return SpatialClassifierInsideDisplay.ElementColor;
  }
}

function outsideDisplay(display: number): SpatialClassifierOutsideDisplay {
  switch (display) {
    case SpatialClassifierOutsideDisplay.Off:
    case SpatialClassifierOutsideDisplay.On:
    case SpatialClassifierOutsideDisplay.Dimmed:
      return display;
    default:
      return SpatialClassifierOutsideDisplay.Dimmed;
  }
}
