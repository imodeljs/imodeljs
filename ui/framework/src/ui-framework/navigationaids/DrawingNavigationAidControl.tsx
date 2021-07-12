/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module NavigationAids
 */

import * as React from "react";
import { DrawingNavigationAid } from "@bentley/ui-components";
import { ConfigurableCreateInfo } from "../configurableui/ConfigurableUiControl";
import { NavigationAidControl } from "./NavigationAidControl";

/** Navigation Aid that displays an interactive mini-map for Drawing views that synchronizes with the iModel Viewport.
 * @beta
 */
export class DrawingNavigationAidControl extends NavigationAidControl {
  public static navigationAidId = "DrawingNavigationAid";

  constructor(info: ConfigurableCreateInfo, options: any) {
    super(info, options);
    this.reactNode = <DrawingNavigationAid iModelConnection={options.imodel} viewport={options.viewport} />;
  }

  public override getSize(): string | undefined { return "96px"; }
}
