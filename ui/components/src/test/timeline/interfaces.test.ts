/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { BaseTimelineDataProvider } from "../../ui-components/timeline/BaseTimelineDataProvider";
import { PlaybackSettings } from "../../ui-components/timeline/interfaces";

class TestTimelineDataProvider extends BaseTimelineDataProvider {
  public pointerCallbackCalled = false;
  public settingsCallbackCalled = false;

  public onAnimationFractionChanged = (animationFraction: number) => {
    this.pointerCallbackCalled = true;
    this.animationFraction = animationFraction;
  };

  public onPlaybackSettingChanged = (settings: PlaybackSettings) => {
    this.settingsCallbackCalled = true;
    this.updateSettings(settings);
  };
}

describe("Timeline", () => {

  describe("Duration only timeline", () => {
    const duration = 20;
    const loop = true;
    const testanimationFraction = 0.3;

    class Test1TimelineDataProvider extends TestTimelineDataProvider {
      public async loadTimelineData(): Promise<boolean> {
        this.updateSettings({
          duration,
          loop,
        });

        return true;
      }
    }

    it("test duration only data from provider", async () => {
      const timelineProvider = new Test1TimelineDataProvider();
      await timelineProvider.loadTimelineData();

      const settings = timelineProvider.getSettings();
      expect(settings.duration).to.be.equal(duration);
      expect(settings.loop).to.be.equal(loop);
      expect(timelineProvider.pointerCallbackCalled).to.be.false;
      timelineProvider.onAnimationFractionChanged(testanimationFraction);
      expect(timelineProvider.pointerCallbackCalled).to.be.true;
    });
  });

  describe("Start, End, and Duration only timeline", () => {
    const duration = 20;
    const loop = true;
    const startDate = new Date(2014, 6, 6);
    const endDate = new Date(2016, 8, 12);
    const testanimationFraction = 0.3;

    class Test2TimelineDataProvider extends TestTimelineDataProvider {
      public async loadTimelineData(): Promise<boolean> {
        this.updateSettings({
          duration,
          loop,
        });

        this.start = startDate;
        this.end = endDate;

        return true;
      }
    }

    it("test duration, start, and end dates", async () => {
      const timelineProvider = new Test2TimelineDataProvider();
      await timelineProvider.loadTimelineData();
      const settings = timelineProvider.getSettings();
      expect(settings.duration).to.be.equal(duration);
      expect(settings.loop).to.be.equal(loop);
      expect(timelineProvider.start).to.be.equal(startDate);
      expect(timelineProvider.end).to.be.equal(endDate);

      // simulate UI updating pointer to current playback time
      timelineProvider.onAnimationFractionChanged(testanimationFraction);
      expect(timelineProvider.pointerCallbackCalled).to.be.true;
      expect(timelineProvider.animationFraction).to.be.equal(testanimationFraction);
    });
  });
});

