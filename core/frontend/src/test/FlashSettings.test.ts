/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { BeDuration } from "@bentley/bentleyjs-core";
import { FlashMode, FlashSettings, FlashSettingsOptions } from "../FlashSettings";

type FlashProps = Pick<FlashSettings, "duration" | "maxIntensity" | "litMode">;

function expectFlash(actual: FlashSettings, expected: FlashProps): void {
  expect(actual.duration.milliseconds).to.equal(expected.duration.milliseconds);
  expect(actual.maxIntensity).to.equal(expected.maxIntensity);
  expect(actual.litMode).to.equal(expected.litMode);
}

describe("FlashSettings", () => {
  it("constructs from options", () => {
    expectFlash(new FlashSettings(), { duration: BeDuration.fromSeconds(0.25), litMode: FlashMode.Brighten, maxIntensity: 1 });
    const props = { duration: BeDuration.fromSeconds(2), litMode: FlashMode.Hilite, maxIntensity: 0.2 };
    expectFlash(new FlashSettings(props), props);
  });

  it("normalizes inputs", () => {
    expectFlash(new FlashSettings({ duration: BeDuration.fromSeconds(-100), litMode: -5 as FlashMode, maxIntensity: -1 }),
      { duration: BeDuration.fromSeconds(0), litMode: FlashMode.Brighten, maxIntensity: 0 }
    );
    expectFlash(new FlashSettings({ duration: BeDuration.fromSeconds(0), litMode: FlashMode.Brighten, maxIntensity: 0 }),
      { duration: BeDuration.fromSeconds(0), litMode: FlashMode.Brighten, maxIntensity: 0 }
    );
    expectFlash(new FlashSettings({ duration: BeDuration.fromSeconds(11), litMode: 42 as FlashMode, maxIntensity: 1.1 }),
      { duration: BeDuration.fromSeconds(10), litMode: FlashMode.Brighten, maxIntensity: 1 }
    );
  });

  it("clones", () => {
    function clone(input: FlashSettings, options: FlashSettingsOptions, expected: FlashProps): FlashSettings {
      const output = input.clone(options);
      expectFlash(output, expected);
      return output;
    }

    const defaults = new FlashSettings();
    expect(defaults.clone()).to.equal(defaults);

    let settings = clone(defaults, { }, defaults);
    expect(settings).not.to.equal(defaults);

    settings = clone(settings,
      { duration: BeDuration.fromSeconds(1), litMode: FlashMode.Hilite },
      { duration: BeDuration.fromSeconds(1), litMode: FlashMode.Hilite, maxIntensity: 1 });

    clone(settings,
      { duration: BeDuration.fromSeconds(2), maxIntensity: 0.2 },
      { duration: BeDuration.fromSeconds(2), maxIntensity: 0.2, litMode: FlashMode.Hilite });
  });
});
