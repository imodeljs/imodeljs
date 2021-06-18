/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { join } from "path";

export class KnownTestLocations {

  /** The directory where test assets are stored. Keep in mind that the test is playing the role of the app. */
  public static get assetsDir(): string {
    return join(__dirname, "assets");
  }

  /** The directory where tests can write. */
  public static get outputDir(): string {
    return join(__dirname, "output");
  }
}
