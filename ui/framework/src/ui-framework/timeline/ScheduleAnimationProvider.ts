/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Timeline
 */

import { ScreenViewport, ViewState } from "@bentley/imodeljs-frontend";
import { BaseTimelineDataProvider, PlaybackSettings } from "@bentley/ui-components";

/** ScheduleAnimation Timeline Data Provider - handles View that define 'scheduleScript' data.
 * @public
 */
// No access to scheduleScript to even mock in test
// istanbul ignore next
export class ScheduleAnimationTimelineDataProvider extends BaseTimelineDataProvider {
  private _viewState: ViewState;

  constructor(viewState: ViewState, viewport?: ScreenViewport) {
    super(viewport);
    this._viewState = viewState;

    if (viewState && viewState.scheduleScript) {
      this.supportsTimelineAnimation = true;
    }
  }

  public async loadTimelineData(): Promise<boolean> {
    const script = this._viewState.scheduleScript;
    if (this.supportsTimelineAnimation && script) {
      // for now just initial settings
      this.updateSettings({
        duration: 20 * 1000,      // this is playback duration
        loop: true,
      });

      const timeRange = script.duration;
      this.start = new Date(timeRange.low * 1000);
      this.end = new Date(timeRange.high * 1000);

      if (this._viewport) {
        if (this._viewport.timePoint)
          this.animationFraction = (this._viewport.timePoint - timeRange.low) / timeRange.length();
        else
          this.animationFraction = 0;
      }

      return true;
    }

    return false;
  }

  public onAnimationFractionChanged = (animationFraction: number) => {
    this.animationFraction = animationFraction;
    if (this._viewport) {
      const script = this._viewport.displayStyle.scheduleScript;
      if (script)
        this._viewport.timePoint = script.duration.fractionToPoint(animationFraction);
    }
  };

  public onPlaybackSettingChanged = (settings: PlaybackSettings) => {
    this.updateSettings(settings);
  };
}
