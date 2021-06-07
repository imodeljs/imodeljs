/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { BeDuration, Mutable } from "@bentley/bentleyjs-core";

/** As part of [[FlashSettings]], describes how geometry is flashed.
 * @public
 */
export enum FlashMode {
  /** The color of the geometry is mixed with the hilite color. */
  Hilite,
  /** The color of the geometry is brightened. Applicable only to lit geometry - i.e., meshes displayed in a view with [RenderMode.SmoothShade]($common)
   * and lighting enabled.
   */
  Brighten,
}

/** Options used to construct or clone a [[FlashSettings]]. All properties are mutable and optional; those left undefined receive their default
 * values.
 * @public
 */
export type FlashSettingsOptions = Mutable<Partial<FlashSettings>>;

/** Settings that control how geometry is "flashed" when hovered over in a [[Viewport]].
 * When the user hovers the mouse cursor over an element (or other piece of geometry, like a reality mesh), a [[Tool]] visually indicates
 * that it can interact with that geometry by "flashing" it. Flashed geometry changes color in one of the following two ways:
 *  - By mixing the viewport's hilite color as specified by [[Viewport.hilite]] with the geometry's own color; or
 *  - By brightening the geometry's own color (for lit geometry only - i.e., meshes displayed in a view with lighting enabled).
 * The flash effect starts out at an intensity of zero and increases linearly over the period of time specified by [[duration]] until
 * [[maxIntensity]] is reached.
 * @see [[Viewport.flashSettings]] to customize the flash behavior for a viewport.
 * @see [[Viewport.hilite]] to customize the hilite color used by [[FlashMode.Hilite]].
 * @public
 */
export class FlashSettings {
  /** The duration in seconds over which the flash effect increases from zero to [[maxIntensity]], in [0..10].
   * Default value: 0.25 seconds.
   * Values outside of [0..10] are clamped to that range.
   */
  public readonly duration: BeDuration;
  /** The maximum intensity of the flash effect, after [[duration]] seconds have elapsed, in [0..1].
   * For [[FlashMode.Brighten]] this indicates how much brighter the the geometry will be.
   * For [[FlashMode.Hilite]] this indicates the ratio of the hilite color to the geometry's own color - i.e., a max intensity of 1.0 causes
   * the geometry to display entirely in the hilite color at its maximum.
   * Default value: 1.0.
   * Values outside of [0..1] are clamped to that range.
   */
  public readonly maxIntensity: number;
  /** Specifies how lit geometry (that is, meshes displayed in a view with lighting enabled) is flashed.
   * Default value: [[FlashMode.Brighten]].
   */
  public readonly litMode: FlashMode;

  /** Construct new flash settings.
   * @param options If supplied, overrides specified default values.
   * Example: to change [[duration]] to 1 second and use default [[maxIntensity]] and [[litMode]]:
   * ```ts
   *  const settings = new FlashSettings({ duration: BeDuration.fromSeconds(1) });
   * ```
   */
  public constructor(options?: FlashSettingsOptions) {
    this.litMode = options?.litMode === FlashMode.Hilite ? FlashMode.Hilite : FlashMode.Brighten;

    const maxIntensity = options?.maxIntensity ?? 1;
    this.maxIntensity = Math.min(1, Math.max(0, maxIntensity));

    let duration = options?.duration;
    if (duration) {
      const ms = Math.max(0, Math.min(10 * 1000, duration.milliseconds));
      if (ms !== duration.milliseconds)
        duration = BeDuration.fromMilliseconds(ms);
    } else {
      duration = BeDuration.fromSeconds(0.25);
    }

    this.duration = duration;
  }

  /** Create a copy of these settings identical except for properties explicitly specified by `options`.
   * @param options Overrides selected properties of these settings. Any property not supplied will retain its current value. Any property
   * explicitly set to `undefined` will receive its default value.
   * @returns A copy of these settings identical except as specified by `options`.
   */
  public clone(options?: FlashSettingsOptions): FlashSettings {
    if (!options)
      return this;

    return new FlashSettings({ ...this, ...options });
  }
}
