/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module NavigationAids
 */

import * as React from "react";
import { CubeNavigationAid } from "@bentley/ui-components";
import { ConfigurableCreateInfo } from "../configurableui/ConfigurableUiControl";
import { NavigationAidControl } from "./NavigationAidControl";

/** Navigation Aid that displays an interactive rotation cube for Spatial views that synchronizes with the rotation of the iModel Viewport
 * @public
 */
export class CubeNavigationAidControl extends NavigationAidControl {
  public static navigationAidId = "CubeNavigationAid";

  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);
    this.reactNode = <CubeNavigationAid iModelConnection={options.imodel} viewport={options.viewport} />;
  }

  public override getSize(): string | undefined { return "96px"; }
}
