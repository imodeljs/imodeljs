/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Symbology
 */

import { Point3d, Range1d, Range1dProps, Vector3d, XYZProps } from "@bentley/geometry-core";
import { ColorDef, ColorDefProps } from "./ColorDef";
import { Gradient } from "./Gradient";

/** A thematic gradient mode used to generate and apply a thematic effect to a scene.
 * @see [[ThematicGradientSettings.mode]]
 * @public
 */
export enum ThematicGradientMode {
  /** Apply a smooth color gradient to the scene. */
  Smooth = 0,
  /** Apply a stepped color gradient to the scene. */
  Stepped = 1,
  /** Apply a stepped color gradient to the scene with delimiters (lines between the color steps). Can only be used with [[ThematicDisplayMode.Height]]. */
  SteppedWithDelimiter = 2,
  /** Apply isolines to the scene to achieve an effect similar to a contour map. Can only be used with [[ThematicDisplayMode.Height]]. */
  IsoLines = 3,
}

/** A color scheme used to generate the colors of a thematic gradient within an applied range.
 * @see [[ThematicGradientSettings.colorScheme]]
 * @see [[ThematicDisplay.range]]
 * @public */
export enum ThematicGradientColorScheme {
  /** A color gradient scheme that represents a blue-to-red gradation. */
  BlueRed = 0,
  /** A color gradient scheme that represents a red-to-blue gradation. */
  RedBlue = 1,
  /** A color gradient scheme that represents a monochrome (black-to-white) gradation. */
  Monochrome = 2,
  /** A color gradient scheme that suits a topographic gradation. */
  Topographic = 3,
  /** A color gradient scheme that suits a sea-mountain gradation. */
  SeaMountain = 4,
  /** A custom color gradient scheme configured by the user.
   * @see [[ThematicGradientSettings.customKeys]]
   */
  Custom = 5,
}

/** JSON representation of a [[ThematicGradientSettings]].
 * @public
 **/
export interface ThematicGradientSettingsProps {
  /** The thematic image mode used to generate and apply the thematic gradient. Defaults to [[ThematicGradientMode.Smooth]]. */
  mode?: ThematicGradientMode;
  /** The step count value used for [[ThematicGradientMode.Stepped]], [[ThematicGradientMode.SteppedWithDelimiter]], and [[ThematicGradientMode.IsoLines]]. Defaults to 10. Cannot be less than 2. */
  stepCount?: number;
  /** The margin color used at the extremes of the gradient, when outside the applied range. Defaults to a black color using [[ColorDef.fromJSON]] with no arguments. */
  marginColor?: ColorDefProps;
  /** The color scheme used to generate the colors of the gradient within the applied range. Defaults to [[ThematicGradientColorScheme.BlueRed]]. */
  colorScheme?: ThematicGradientColorScheme;
  /** The key color values that must be provided when using a custom thematic color scheme.
   * Defaults to empty, unless using a custom thematic color scheme. In that case, this defaults to two key colors going from white to black.
   * When using a custom thematic color scheme, there must be at least two entries in here. If there are not, it will revert to the default settings.
   */
  customKeys?: Gradient.KeyColorProps[];
  /** The percentage to mix in the original color with the thematic display gradient color (0-1).
   * Applies to background map terrain and point clouds only.  Defaults to 0. */
  colorMix?: number;
}

/** Thematic settings specific to creating a color gradient used by [[ThematicDisplay]].
 * @public
 */
export class ThematicGradientSettings {
  /** The thematic image mode used to generate the gradient. Defaults to [[ThematicGradientMode.Smooth]]. */
  public readonly mode: ThematicGradientMode;
  /** The step count value used for [[ThematicGradientMode.Stepped]], [[ThematicGradientMode.SteppedWithDelimiter]], and [[ThematicGradientMode.IsoLines]]. Defaults to 10. Cannot be less than 2. */
  public readonly stepCount: number;
  /** The margin color used at the extremes of the gradient, when outside the applied range. Defaults to a black color using [[ColorDef.fromJSON]] with no arguments. */
  public readonly marginColor: ColorDef;
  /** The color scheme used to generate the colors of the gradient color within the applied range. Defaults to [[ThematicGradientColorScheme.BlueRed]]. */
  public readonly colorScheme: ThematicGradientColorScheme;
  /** The key color values that must be provided when using a custom thematic color scheme.
   * Defaults to empty, unless using a custom thematic color scheme. In that case, this defaults to two key colors going from white to black.
   * When using a custom thematic color scheme, there must be at least two entries in here. If there are not, it will revert to the default settings.
   */
  public readonly customKeys: Gradient.KeyColor[];
  /** The percentage to mix in the original color with the thematic display gradient color (0-1).
   * Applies to background map terrain and point clouds only.  Defaults to 0. */
  public readonly colorMix: number;

  public static get margin(): number { return .001; }    // A fixed portion of the gradient for out of range values.
  public static get contentRange(): number { return 1.0 - 2.0 * ThematicGradientSettings.margin; }
  public static get contentMax(): number { return 1.0 - ThematicGradientSettings.margin; }

  public static defaults = ThematicGradientSettings.fromJSON();

  private static _defaultCustomKeys = [[0.0, 255, 255, 255], [1.0, 0, 0, 0]];

  public equals(other: ThematicGradientSettings): boolean {
    if (this.mode !== other.mode)
      return false;
    if (this.stepCount !== other.stepCount)
      return false;
    if (!this.marginColor.equals(other.marginColor))
      return false;
    if (this.colorScheme !== other.colorScheme)
      return false;
    if (this.customKeys.length !== other.customKeys.length)
      return false;
    if (this.colorMix !== other.colorMix)
      return false;

    for (let i = 0; i < this.customKeys.length; i++) {
      if (!Gradient.keyColorEquals(this.customKeys[i], other.customKeys[i]))
        return false;
    }

    return true;
  }

  private constructor(json?: ThematicGradientSettingsProps) {
    this.customKeys = [];
    if (undefined === json) {
      this.mode = ThematicGradientMode.Smooth;
      this.stepCount = 10;
      this.marginColor = ColorDef.fromJSON();
      this.colorScheme = ThematicGradientColorScheme.BlueRed;
      this.colorMix = 0.0;
    } else {
      this.mode = (json.mode !== undefined && json.mode !== null) ? json.mode : ThematicGradientMode.Smooth;
      if (this.mode < ThematicGradientMode.Smooth || this.mode > ThematicGradientMode.IsoLines)
        this.mode = ThematicGradientMode.Smooth;

      this.stepCount = (typeof json.stepCount === "number") ? json.stepCount : 10;
      if (this.stepCount < 2)
        this.stepCount = 2;

      this.marginColor = ColorDef.fromJSON(json.marginColor);

      this.colorScheme = (json.colorScheme !== undefined && json.colorScheme !== null) ? json.colorScheme : ThematicGradientColorScheme.BlueRed;
      if (this.colorScheme < ThematicGradientColorScheme.BlueRed || this.colorScheme > ThematicGradientColorScheme.Custom)
        this.colorScheme = ThematicGradientColorScheme.BlueRed;

      if (json.customKeys !== undefined && json.customKeys !== null)
        json.customKeys.forEach((key) => this.customKeys.push(new Gradient.KeyColor(key)));

      // Enforce 2 entries in custom color keys if violated
      if (this.colorScheme === ThematicGradientColorScheme.Custom && this.customKeys.length < 2) {
        this.customKeys = [];
        for (const keyValue of ThematicGradientSettings._defaultCustomKeys)
          this.customKeys.push(new Gradient.KeyColor({ value: keyValue[0], color: ColorDef.computeTbgrFromComponents(keyValue[1], keyValue[3], keyValue[2]) }));
      }

      this.colorMix = json.colorMix ?? 0.0;
    }
  }

  public static fromJSON(json?: ThematicGradientSettingsProps) {
    return new ThematicGradientSettings(json);
  }

  public toJSON(): ThematicGradientSettingsProps {
    const json: ThematicGradientSettingsProps = {
      mode: this.mode,
      stepCount: this.stepCount,
      marginColor: this.marginColor.toJSON(),
      colorScheme: this.colorScheme,
      colorMix: this.colorMix,
    };

    json.customKeys = [];
    this.customKeys.forEach((key) => json.customKeys!.push({ value: key.value, color: key.color.tbgr }));
    return json;
  }

  /** Create a copy of this ThematicGradientSettings, optionally modifying some of its properties.
   * @param changedProps JSON representation of the properties to change.
   * @returns A ThematicGradientSettings with all of its properties set to match those of `this`, except those explicitly defined in `changedProps`.
   */
  public clone(changedProps?: ThematicGradientSettingsProps): ThematicGradientSettings {
    if (undefined === changedProps)
      return ThematicGradientSettings.fromJSON(this.toJSON());

    const props: ThematicGradientSettingsProps = {
      mode: undefined !== changedProps.mode ? changedProps.mode : this.mode,
      stepCount: undefined !== changedProps.stepCount ? changedProps.stepCount : this.stepCount,
      marginColor: undefined !== changedProps.marginColor ? changedProps.marginColor : this.marginColor.tbgr,
      colorScheme: undefined !== changedProps.colorScheme ? changedProps.colorScheme : this.colorScheme,
      customKeys: undefined !== changedProps.customKeys ? changedProps.customKeys : this.customKeys.map((key) => ({ value: key.value, color: key.color.tbgr })),
      colorMix: undefined !== changedProps.colorMix ? changedProps.colorMix : this.colorMix,
    };

    return ThematicGradientSettings.fromJSON(props);
  }
}

/** JSON representation of a [[ThematicDisplaySensor]].
 * @public
 */
export interface ThematicDisplaySensorProps {
  /** The world position of the sensor in X, Y, and Z. Defaults to {0,0,0}. */
  position?: XYZProps;
  /** The value of the sensor used when accessing the thematic gradient texture; expected range is 0 to 1. Defaults to 0. */
  value?: number;
}

/** A sensor in world space, used for [[ThematicDisplayMode.InverseDistanceWeightedSensors]].
 * @public
 */
export class ThematicDisplaySensor {
  /** The world position of the sensor in X, Y, and Z. Defaults to {0,0,0}. */
  public position: Readonly<Point3d>;
  /** The value of the sensor used when accessing the thematic gradient texture; expected range is 0 to 1. Defaults to 0. */
  public readonly value: number;

  private constructor(json?: ThematicDisplaySensorProps) {
    if (undefined === json) {
      this.position = Point3d.fromJSON();
      this.value = 0;
    } else {
      this.position = Point3d.fromJSON(json.position);
      this.value = (typeof json.value !== "number") ? 0 : json.value;
      if (this.value < 0)
        this.value = 0;
      else if (this.value > 1)
        this.value = 1;
    }
  }

  public equals(other: ThematicDisplaySensor): boolean {
    return (this.value === other.value) && this.position.isAlmostEqual(other.position);
  }

  public static fromJSON(json?: ThematicDisplaySensorProps) {
    return new ThematicDisplaySensor(json);
  }

  public toJSON(): ThematicDisplaySensorProps {
    return {
      position: this.position.toJSON(),
      value: this.value,
    };
  }
}

/** JSON representation of a [[ThematicDisplaySensorSettings]] for [[ThematicDisplayMode.InverseDistanceWeightedSensors]].
 * @public
 */
export interface ThematicDisplaySensorSettingsProps {
  /** This is the list of sensors. Defaults to an empty array. */
  sensors?: ThematicDisplaySensorProps[];
  /** This is the distance cutoff in meters. For a position on screen to be affected by a sensor, it must be at least this close to the sensor.
   * If this is zero or negative, then no distance cutoff is applied (all sensors affect all positions regardless of nearness).
   * Defaults to zero.
   * @note Using a suitable distance cutoff imparts a significant performance benefit. The larger this value becomes, performance will degrade.
   */
  distanceCutoff?: number;
}

/** Settings for sensor-based thematic display for [[ThematicDisplayMode.InverseDistanceWeightedSensors]].
 * @public
 */
export class ThematicDisplaySensorSettings {
  /** This is the list of sensors. Defaults to an empty array. */
  public readonly sensors: ThematicDisplaySensor[];
  /** This is the distance cutoff in meters. For a position on screen to be affected by a sensor, it must be at least this close to the sensor.
   * If this is zero or negative, then no distance cutoff is applied (all sensors affect all positions regardless of nearness).
   * Defaults to zero.
   * @note Using a suitable distance cutoff imparts a significant performance benefit. The larger this value becomes, performance will degrade.
   */
  public readonly distanceCutoff: number;

  private constructor(json?: ThematicDisplaySensorSettingsProps) {
    this.sensors = [];
    if (undefined !== json) {
      if (json.sensors !== undefined && json.sensors !== null) {
        json.sensors.forEach((sensorJSON) => this.sensors.push(ThematicDisplaySensor.fromJSON(sensorJSON)));
      }
      this.distanceCutoff = (typeof json.distanceCutoff === "number") ? json.distanceCutoff : 0;
    } else {
      this.distanceCutoff = 0;
    }
  }

  public equals(other: ThematicDisplaySensorSettings): boolean {
    if (this.distanceCutoff !== other.distanceCutoff)
      return false;

    const thisSensors = this.sensors;
    const otherSensors = other.sensors;

    if (thisSensors.length !== otherSensors.length)
      return false;

    for (let i = 0; i < thisSensors.length; i++) {
      if (!thisSensors[i].equals(otherSensors[i]))
        return false;
    }

    return true;
  }

  public static fromJSON(json?: ThematicDisplaySensorSettingsProps) {
    return new ThematicDisplaySensorSettings(json);
  }

  public toJSON(): ThematicDisplaySensorSettingsProps {
    const json: ThematicDisplaySensorSettingsProps = {};

    json.sensors = [];
    this.sensors.forEach((sensor) => json.sensors!.push(sensor.toJSON()));

    json.distanceCutoff = this.distanceCutoff;

    return json;
  }
}

/** The thematic display mode. This determines how to apply the thematic color gradient to the geometry.
 * @public
 */
export enum ThematicDisplayMode {
  /** The color gradient will be mapped to surface geometry and point clouds based on world height in meters. */
  Height = 0,
  /** The color gradient will be mapped to surface geometry and point clouds using inverse distance weighting based on world positions and corresponding values from a list of sensors.
   * @note Performance will decrease as more sensors are added.
   */
  InverseDistanceWeightedSensors = 1,
  /** The color gradient will be mapped to surface geometry based on the slope of the surface. The slope value is calculated based on the angle between the surface and the axis specified in the associated [[ThematicDisplay]] object.
   * @note This display mode does not affect point clouds.
   */
  Slope = 2,
  /** The color gradient will be mapped to surface geometry based on the direction of a sun shining on the surface.
   * @note This display mode does not affect point clouds.
   */
  HillShade = 3,
}

/** JSON representation of the thematic display setup of a [[DisplayStyle3d]].
 * @public
 */
export interface ThematicDisplayProps {
  /** The thematic display mode. This determines how to apply the thematic color gradient to the geometry. Defaults to [[ThematicDisplayMode.Height]]. */
  displayMode?: ThematicDisplayMode;
  /** The settings used to create a color gradient applied to the geometry. Defaults to an instantiation using [[ThematicGradientSettings.fromJSON]] with no arguments. */
  gradientSettings?: ThematicGradientSettingsProps;
  /** The range to use when applying the thematic gradient for height and slope mode.
   * For [[ThematicDisplayMode.Height]], this is world space in meters and represents the range in which to apply the gradient along the specified axis.
   * For [[ThematicDisplayMode.Slope]], this is a range in degrees with a minimum low value of 0 degrees and a maximum high value of 90 degrees.
   * Defaults to a null range.
   */
  range?: Range1dProps;
  /** For [[ThematicDisplayMode.Height]], this is the axis along which to apply the thematic gradient in the scene. For [[ThematicDisplayMode.Slope]], calculating the slope of a surface is done in relation to the axis. Defaults to {0,0,0}. */
  axis?: XYZProps;
  /** For [[ThematicDisplayMode.HillShade]], this is the direction of the sun in world space. Defaults to {0,0,0}. */
  sunDirection?: XYZProps;
  /** For [[ThematicDisplayMode.InverseDistanceWeightedSensors]], these are the settings that control the sensors. Defaults to an instantiation using [[ThematicDisplaySensorSettings.fromJSON]] with no arguments.
   * @public
   */
  sensorSettings?: ThematicDisplaySensorSettingsProps;
}

/** The thematic display setup of a [[DisplayStyle3d]].
 * Thematic display allows a user to colorize a scene using a color gradient in a way that provides a visual cue about certain attributes of the rendered geometry. This scene colorization will be done based on certain geometric attributes like height, surface slope, position of surfaces relative to a sun position, or geometric position relative to a list of sensors.
 * The documentation for [[ThematicDisplayMode]] describes how each mode colorizes the scene.
 * @public
 */
export class ThematicDisplay {
  /** The thematic display mode. This determines how to apply the thematic color gradient to the geometry. Defaults to [[ThematicDisplayMode.Height]]. */
  public readonly displayMode: ThematicDisplayMode;
  /** The settings used to create a color gradient applied to the geometry. Defaults to an instantiation using [[ThematicGradientSettings.fromJSON]] with no arguments. */
  public readonly gradientSettings: ThematicGradientSettings;
  /** The range to use when applying the thematic gradient for height and slope mode.
   * For [[ThematicDisplayMode.Height]], this is world space in meters and represents the range in which to apply the gradient along the specified axis.
   * For [[ThematicDisplayMode.Slope]], this is a range in radians with a minimum low value of 0 degrees and a maximum high value of 90 degrees.
   * Defaults to a null range.
   */
  public readonly range: Range1d;
  /** For [[ThematicDisplayMode.Height]], this is the axis along which to apply the thematic gradient in the scene. For [[ThematicDisplayMode.Slope]], the slope of a surface is calculated in relation to this axis. Defaults to {0,0,0}. */
  public readonly axis: Vector3d;
  /** For [[ThematicDisplayMode.HillShade]], this is the direction of the sun in world space. Defaults to {0,0,0}. */
  public readonly sunDirection: Vector3d;
  /** For [[ThematicDisplayMode.InverseDistanceWeightedSensors]], these are the settings that control the sensors. Defaults to an instantiation using [[ThematicDisplaySensorSettings.fromJSON]] with no arguments.
   * @public
   */
  public readonly sensorSettings: ThematicDisplaySensorSettings;

  public equals(other: ThematicDisplay): boolean {
    if (this.displayMode !== other.displayMode)
      return false;
    if (!this.gradientSettings.equals(other.gradientSettings))
      return false;
    if (!this.range.isAlmostEqual(other.range))
      return false;
    if (!this.axis.isAlmostEqual(other.axis))
      return false;
    if (!this.sunDirection.isAlmostEqual(other.sunDirection))
      return false;
    if (!this.sensorSettings.equals(other.sensorSettings))
      return false;

    return true;
  }

  private constructor(json?: ThematicDisplayProps) {
    if (undefined === json) {
      this.displayMode = ThematicDisplayMode.Height;
      this.gradientSettings = ThematicGradientSettings.fromJSON();
      this.axis = Vector3d.fromJSON();
      this.range = Range1d.fromJSON();
      this.sunDirection = Vector3d.fromJSON();
      this.sensorSettings = ThematicDisplaySensorSettings.fromJSON();
    } else {
      this.displayMode = (json.displayMode !== undefined && json.displayMode !== null) ? json.displayMode : ThematicDisplayMode.Height;
      if (this.displayMode < ThematicDisplayMode.Height || this.displayMode > ThematicDisplayMode.HillShade)
        this.displayMode = ThematicDisplayMode.Height;
      this.gradientSettings = ThematicGradientSettings.fromJSON(json.gradientSettings);
      this.axis = Vector3d.fromJSON(json.axis);
      this.range = Range1d.fromJSON(json.range);
      this.sunDirection = Vector3d.fromJSON(json.sunDirection);
      this.sensorSettings = ThematicDisplaySensorSettings.fromJSON(json.sensorSettings);
    }
    if (ThematicDisplayMode.Height !== this.displayMode) {
      // Disallow isoline and stepped-with-delimiter gradient modes in any mode other than height.
      if (ThematicGradientMode.IsoLines === this.gradientSettings.mode || ThematicGradientMode.SteppedWithDelimiter === this.gradientSettings.mode) {
        const gradientSettingsJSON = this.gradientSettings.toJSON();
        gradientSettingsJSON.mode = ThematicGradientMode.Smooth;
        this.gradientSettings = ThematicGradientSettings.fromJSON(gradientSettingsJSON);
      }
      if (ThematicDisplayMode.Slope === this.displayMode) {
        if (this.range.low < 0.0)
          this.range.low = 0.0;
        if (this.range.high > 90.0)
          this.range.high = 90.0;
      }
    }
  }

  public static fromJSON(json?: ThematicDisplayProps) {
    return new ThematicDisplay(json);
  }

  public toJSON(): ThematicDisplayProps {
    const json: ThematicDisplayProps = {
      displayMode: this.displayMode,
      gradientSettings: this.gradientSettings.toJSON(),
      axis: this.axis.toJSON(),
      sunDirection: this.sunDirection.toJSON(),
      range: this.range.toJSON(),
    };

    if (this.sensorSettings.sensors.length > 0)
      json.sensorSettings = this.sensorSettings.toJSON();

    return json;
  }
}
