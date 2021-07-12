/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Tools
 */

import { BeDuration } from "@bentley/bentleyjs-core";
import { IModelApp, Tool } from "@bentley/imodeljs-frontend";

/** Changes the [IModelApp.animationInterval]($frontend). Specify the interval in integer milliseconds; or pass any string not parseable as an integer to disable the animation interval callback.
 * @beta
 */
export class AnimationIntervalTool extends Tool {
  public static override toolId = "AnimationInterval";
  public static override get minArgs() { return 1; }
  public static override get maxArgs() { return 1; }

  public override run(interval?: BeDuration): boolean {
    IModelApp.animationInterval = interval;
    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    const millis = Number.parseInt(args[0], 10);
    const interval = !Number.isNaN(millis) ? BeDuration.fromMilliseconds(millis) : undefined;
    return this.run(interval);
  }
}
