/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import * as React from "react";
import { AbstractWidgetProps } from "@bentley/ui-abstract";
import { IconProps } from "@bentley/ui-core";
import { ConfigurableUiControlConstructor } from "../configurableui/ConfigurableUiControl";

/** Properties for a [Widget]($ui-framework) component.
 * @public
 */
// export interface WidgetProps extends IconProps {
export interface WidgetProps extends Omit<AbstractWidgetProps, "getWidgetContent">, IconProps {
  /** if set, it is used to define a key that is used to look up a localized string. This value is used only if label is not explicitly set. */
  labelKey?: string;
  /** if set, it is used to define a key that is used to look up a localized string. This value is used only if tooltip is not explicitly set. */
  tooltipKey?: string;
  /** A [[WidgetControl]] providing information about the Widget. */
  control?: ConfigurableUiControlConstructor;
  /** A React component for the Widget. */
  element?: React.ReactNode;
  /** Control's class id */
  classId?: string | ConfigurableUiControlConstructor;
  /** @alpha */
  preferredPanelSize?: "fit-content";
}
