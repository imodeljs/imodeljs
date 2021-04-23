/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DisplayStyles
 */

import { CompressedId64Set, Constructor, Id64, Id64String } from "@bentley/bentleyjs-core";
import { Point3d, Range1d, Transform, Vector3d, XYAndZ } from "@bentley/geometry-core";
import { RgbColor } from "./RgbColor";

/**
 * A schedule (or script)  for controlling the visibility, position and symbology of a series of elements over a period of time.
 * A schedule script is exposed through [[DisplayStyleSettingsProps]].
 * @beta
 */
export namespace RenderSchedule {
  export enum Interpolation {
    Step = 1,
    Linear = 2,
  }

  /** JSON representation of a [[TimelineEntry]]. */
  export interface TimelineEntryProps {
    /** The time point in seconds in the [Unix Epoch](https://en.wikipedia.org/wiki/Unix_time). */
    time: number;
    /** Interpolation value from synchro.  2 is linear, else currently treated as step.  */
    /** How to interpolate from this entry to the next in the timeline.
     * Currently, anything other than [[Interpolation.Linear]] is treated as [[Interpolation.Step]].
     * Additional interpolation modes may become supported in the future.
     */
    interpolation?: Interpolation;
  }

  /** JSON representation of a [[VisibilityEntry]]. */
  export interface VisibilityEntryProps extends TimelineEntryProps {
    /** Visibility of the geometry from 0 (invisible) to 100 (fully visible), with intermediate values appearing increasingly less transparent.
     * Default: 100 (fully visible).
     */
    value?: number;
  }

  /** JSON representation of a [[ColorEntry]]. */
  export interface ColorEntryProps extends TimelineEntryProps {
    /** The color applied to the geometry, with each component specified as an integer in [0, 255].
     * e.g., (0, 0, 0) represents black and (255, 255, 255) represents white.
     * If `undefined`, the geometry is displayed in its actual color.
     */
    value?: { red: number, green: number, blue: number };
  }

  /** JSON representation of a [[CuttingPlane]]. */
  export interface CuttingPlaneProps {
    /** (x,y,z) of the plane position */
    position: number[];
    /** (x, y, z) of the plane direction (towards the clip) */
    direction: number[];
    /** If true, the clip plane is ignored and the geometry is displayed unclipped. */
    visible?: boolean;
    /** If true, the clip plane is ignored and the geometry is not displayed. */
    hidden?: boolean;
  }

  /** JSON representation of a [[CuttingPlaneEntry]]. */
  export interface CuttingPlaneEntryProps extends TimelineEntryProps {
    /** The clip plane, or undefined if the geometry is not clipped. */
    value?: CuttingPlaneProps;
  }

  /** JSON representation of a [Transform]($geometry-core) associated with a [[TransformEntryProps]]. */
  export interface TransformProps {
    /** 3 X 4 transformation matrix containing 3 arrays of matrix rows consisting of 4 numbers each: [qx qy qz ax]
     * where the fourth columnn in each row holds the translation.
     * `undefined` is equivalent to an identity transform.
     */
    transform?: number[][];
  }

  /** JSON representation of a [[TransformEntry]]. */
  export interface TransformEntryProps extends TimelineEntryProps {
    /** The transformation matrix, with `undefined` corresponding to an identity matrix. */
    value?: TransformProps;
  }

  /** Timeline properties (extended by element, model and reality model timelines. */
  export interface TimelineProps {
    visibilityTimeline?: VisibilityEntryProps[];
    colorTimeline?: ColorEntryProps[];
    transformTimeline?: TransformEntryProps[];
    cuttingPlaneTimeline?: CuttingPlaneEntryProps[];
  }

  /** Animation timeline entries that apply to one or more elements. */
  export interface ElementTimelineProps extends TimelineProps {
    batchId: number;
    /** The Ids of the elements to which this timeline applies.
     * @note For a [[DisplayStyleSettingsProps]] associated with a [DisplayStyleState]($frontend) obtained via [IModelConnection.Views.load]($frontend),
     * this property will be an empty `CompressedId64Set`. They are omitted to conserve bandwidth and memory - they are not needed for display on the frontend.
     */
    elementIds: Id64String[] | CompressedId64Set;
  }

  /** Animation timeline for a single model.  */
  export interface ModelTimelineProps extends TimelineProps {
    modelId: Id64String;
    realityModelUrl?: string;     // defined only for "context" reality models (attached through display style)
    elementTimelines: ElementTimelineProps[];
  }

  export type ScriptProps = ModelTimelineProps[];

  export class TimelineEntry {
    public readonly time: number;
    public readonly interpolation: Interpolation;

    public constructor(props: TimelineEntryProps) {
      this.time = props.time;
      this.interpolation = props.interpolation === Interpolation.Linear ? props.interpolation : Interpolation.Step;
    }

    public toJSON(): TimelineEntryProps {
      const props: TimelineEntryProps = {
        time: this.time,
      };

      if (this.interpolation === Interpolation.Linear)
        props.interpolation = this.interpolation;

      return props;
    }
  }

  export class VisibilityEntry extends TimelineEntry {
    public readonly value: number;

    public constructor(props: VisibilityEntryProps) {
      super(props);
      if (typeof props.value !== "number")
        this.value = 100;
      else
        this.value = Math.max(0, Math.min(100, props.value));
    }

    public toJSON(): VisibilityEntryProps {
      const props = super.toJSON() as VisibilityEntryProps;
      if (100 !== this.value)
        props.value = this.value;

      return props;
    }
  }

  export class ColorEntry extends TimelineEntry {
    public readonly value?: RgbColor;

    public constructor(props: ColorEntryProps) {
      super(props);
      if (props.value)
        this.value = new RgbColor(props.value.red, props.value.green, props.value.blue);
    }

    public toJSON(): ColorEntryProps {
      const props = super.toJSON() as ColorEntryProps;
      if (this.value) {
        props.value = {
          red: this.value.r,
          green: this.value.g,
          blue: this.value.b,
        };
      }

      return props;
    }
  }

  export class TransformEntry extends TimelineEntry {
    public readonly value: Readonly<Transform>;

    public constructor(props: TransformEntryProps) {
      super(props);
      this.value = props.value ? Transform.fromJSON(props.value.transform) : Transform.createIdentity();
    }

    public toJSON(): TransformEntryProps {
      const props = super.toJSON() as TransformEntryProps;
      if (!this.value.isIdentity)
        props.value = { transform: this.value.toRows() };

      return props;
    }
  }

  export class CuttingPlane {
    public readonly position: XYAndZ;
    public readonly direction: XYAndZ;
    public readonly visible: boolean;
    public readonly hidden: boolean;

    public constructor(props: CuttingPlaneProps) {
      this.position = Point3d.fromJSON(props.position);
      this.direction = Point3d.fromJSON(props.direction);
      this.hidden = true === props.hidden;
      this.visible = true === props.visible;
    }

    public toJSON(): CuttingPlaneProps {
      const props: CuttingPlaneProps = {
        position: [ this.position.x, this.position.y, this.position.z ],
        direction: [ this.direction.x, this.direction.y, this.direction.z ],
      };

      if (this.visible)
        props.visible = true;

      if (this.hidden)
        props.hidden = true;

      return props;
    }
  }

  const planePosition = new Point3d();
  const planeDirection = new Vector3d();

  export class CuttingPlaneEntry extends TimelineEntry {
    public readonly value?: CuttingPlane;

    public constructor(props: CuttingPlaneEntryProps) {
      super(props);
      if (props.value)
        this.value = new CuttingPlane(props.value);
    }

    public toJSON(): CuttingPlaneEntryProps {
      const props = super.toJSON() as CuttingPlaneEntryProps;
      if (this.value)
        props.value = this.value.toJSON();

      return props;
    }
  }

  export class Interval {
    public lowerIndex!: number;
    public upperIndex!: number;
    public fraction!: number;

    public constructor(lower = 0, upper = 0, fraction = 0) {
      this.init(lower, upper, fraction);
    }

    public init(lower = 0, upper = 0, fraction = 0): void {
      this.lower = lower;
      this.upper = upper;
      this.fraction = fraction;
    }
  }

  export class TimelineEntryList<T extends TimelineEntry, P extends TimelineEntryProps> {
    private readonly _entries: ReadonlyArray<T>;
    public readonly duration: Range1d;

    public constructor(props: P[], ctor: Constructor<T>) {
      this.duration = Range1d.createNull();
      this._entries = props.map((x) => {
        const entry = new ctor(x);
        this.duration.extendX(entry.time);
        return entry;
      });
    }

    public get length(): number {
      return this._entries.length;
    }

    public [Symbol.iterator](): Iterator<T> {
      return this._entries[Symbol.iterator]();
    }

    public get(index: number): T | undefined {
      return this._entries[index];
    }

    public toJSON(): P[] {
      return this._entries.map((x) => x.toJSON() as P);
    }

    public findInterval(time: number, interval?: Interval): Interval | undefined {
      if (this.length === 0)
        return undefined;

      interval = interval ?? new Interval();
      if (time < this._entries[0].time) {
        interval.init(0, 0, 0);
        return interval;
      }

      const last = this.length - 1;
      if (time >= this._entries[last].time) {
        interval.init(last, last, 0);
        return interval;
      }

      for (let i = 0; i < last; i++) {
        const time0 = this._entries[i].time;
        const time1 = this._entries[i + 1].time;
        if (time0 <= time && time1 >= time) {
          let fraction;
          if (Interpolation.Linear === this._entries[i].interpolation)
            fraction = (time - time0) / (time1 - time0);
          else
            fraction = 0;

          interval.init(i, i + 1, fraction);
          return interval;
        }
      }

      return undefined;
    }
  }

  export class Timeline {
    public readonly visibility?: TimelineEntryList<VisibilityEntry, VisibilityEntryProps>;
    public readonly color?: TimelineEntryList<ColorEntry, ColorEntryProps>;
    public readonly transform?: TimelineEntryList<TransformEntry, TransformEntryProps>;
    public readonly cuttingPlane?: TimelineEntryList<CuttingPlaneEntry, CuttingPlaneEntryProps>;
    public readonly duration: Range1d;

    public constructor(props: TimelineProps) {
      this.duration = Range1d.createNull();

      if (props.visibilityTimeline) {
        this.visibility = new TimelineEntryList<VisibilityEntry, VisibilityEntryProps>(props.visibilityTimeline, VisibilityEntry);
        this.duration.extendRange(this.visibility.duration);
      }

      if (props.colorTimeline) {
        this.color = new TimelineEntryList<ColorEntry, ColorEntryProps>(props.colorTimeline, ColorEntry);
        this.duration.extendRange(this.color.duration);
      }

      if (props.transformTimeline) {
        this.transform = new TimelineEntryList<TransformEntry, TransformEntryProps>(props.transformTimeline, TransformEntry);
        this.duration.extendRange(this.transform.duration);
      }

      if (props.cuttingPlaneTimeline) {
        this.cuttingPlane = new TimelineEntryList<CuttingPlaneEntry, CuttingPlaneEntryProps>(props.cuttingPlaneTimeline, CuttingPlaneEntry);
        this.duration.extendRange(this.cuttingPlane.duration);
      }
    }

    public toJSON(): TimelineProps {
      return {
        visibilityTimeline: this.visibility?.toJSON(),
        colorTimeline: this.color?.toJSON(),
        transformTimeline: this.transform?.toJSON(),
        cuttingPlaneTimeline: this.cuttingPlane?.toJSON(),
      };
    }
  }

  export class ElementTimeline extends Timeline {
    public readonly batchId: number;
    private readonly _elementIds: Id64String[] | CompressedId64Set;

    private constructor(props: ElementTimelineProps) {
      super(props);
      this.batchId = props.batchId;
      this._elementIds = props.elementIds;
    }

    public static fromJSON(props?: ElementTimelineProps): ElementTimeline {
      return new ElementTimeline(props ?? { elementIds: [], batchId: 0 });
    }

    public toJSON(): ElementTimelineProps {
      return {
        ...super.toJSON(),
        batchId: this.batchId,
        elementIds: this._elementIds,
      };
    }

    public get elementIds(): Iterable<Id64String> {
      if (typeof this._elementIds === "string")
        return CompressedId64Set.iterable(this._elementIds);
      else
        return this._elementIds;
    }

    public get containsFeatureOverrides(): boolean {
      return undefined != this.visibility || undefined != this.color;
    }

    public get containsClipping(): boolean {
      if (this.cuttingPlane)
        return true;

      return this.batchId !== 0 && (undefined !== this.color || undefined !== this.visibility);
    }

    public get containsTransform(): boolean {
      return undefined !== this.transform;
    }
  }

  export class ModelTimeline extends Timeline {
    public readonly modelId: Id64String;
    public readonly realityModelUrl?: string;
    public readonly elementTimelines: ReadonlyArray<ElementTimeline>;
    public readonly transformNodeIds: ReadonlyArray<number>;
    public readonly containsFeatureOverrides: boolean;
    public readonly containsModelClipping: boolean;
    public readonly containsElementClipping: boolean;
    public readonly containsTransform: boolean;

    private constructor(props: ModelTimelineProps) {
      super(props);

      this.modelId = props.modelId;
      this.realityModelUrl = props.realityModelUrl;
      this.containsModelClipping = undefined !== this.cuttingPlane;

      let containsFeatureOverrides = undefined !== this.visibility || undefined !== this.color;
      let containsElementClipping = false;
      let containsTransform = false;

      const transformNodeIds: number[] = [];
      const elementTimelines: ElementTimeline[] = [];

      for (const elProps of props.elementTimelines) {
        const el = ElementTimeline.fromJSON(elProps);
        elementTimelines.push(el);

        this.duration.extendRange(el.duration);

        if (el.containsTransform) {
          containsTransform = true;
          if (el.batchId)
            transformNodeIds.push(el.batchId);
        }

        containsFeatureOverrides ||= el.containsFeatureOverrides;
        containsElementClipping ||= el.containsClipping;
      }

      this.elementTimelines = elementTimelines;
      this.transformNodeIds = transformNodeIds;

      this.containsFeatureOverrides = containsFeatureOverrides;
      this.containsElementClipping = containsElementClipping;
      this.containsTransform = containsTransform;
    }

    public static fromJSON(props?: ModelTimelineProps): ModelTimeline {
      return new ModelTimeline(props ?? { elementTimelines: [], modelId: Id64.invalid });
    }

    public toJSON(): ModelTimelineProps {
      return {
        ...super.toJSON(),
        modelId: this.modelId,
        realityModelUrl: this.realityModelUrl,
        elementTimelines: this.elementTimelines.map((x) => x.toJSON()),
      };
    }

    public findByBatchId(batchId: number): ElementTimeline | undefined {
      return this.elementTimelines.find((x) => x.batchId === batchId);
    }
  }

  export class Script {
    public readonly modelTimelines: ReadonlyArray<ModelTimeline>;
    public readonly containsModelClipping: boolean;
    public readonly containsElementClipping: boolean;
    public readonly containsTransform: boolean;
    public readonly duration: Range1d;

    protected constructor(props: ScriptProps) {
      this.duration = Range1d.createNull();

      let modelTimelines: ModelTimeline[] = [];
      let containsModelClipping = false;
      let containsElementClipping = false;
      let containsTransform = false;

      for (const modelProps of props) {
        const model = ModelTimeline.fromJSON(modelProps);
        modelTimelines.push(model);

        this.duration.extendRange(model.duration);

        containsModelClipping ||= model.containsModelClipping;
        containsElementClipping ||= model.containsElementClipping;
        containsTransform ||= model.containsTransform;
      }

      this.modelTimelines = modelTimelines;
      this.containsModelClipping = containsModelClipping;
      this.containsElementClipping = containsElementClipping;
      this.containsTransform = containsTransform;
    }

    public static fromJSON(props: ScriptProps): Script {
      return new Script(props);
    }

    public toJSON(): ScriptProps {
      return this.modelTimelines.map((x) => x.toJSON());
    }

    public find(modelId: Id64String): ModelTimeline | undefined {
      return this.modelTimelines.find((x) => x.modelId === modelId);
    }

    public getTransformNodeIds(modelId: Id64String): ReadonlyArray<number> | undefined {
      return this.find(modelId)?.transformNodeIds;
    }
  }
}
