/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Item
 */

import { BadgeType, CommandHandler, ConditionalBooleanValue, ConditionalStringValue, StringGetter } from "@bentley/ui-abstract";
import { IconProps } from "@bentley/ui-core";
import { BaseItemState } from "./ItemDefBase";

/** Definition that specifies properties shared between many ConfigurableUi components.
 * @public
 */
export interface ItemProps extends IconProps {
  /** if set, component will be visible - defaults to true
   * @deprecated use isHidden
   */
  isVisible?: boolean;
  /** if set, component will be enabled - defaults to true
   * @deprecated use isDisabled
   */
  isEnabled?: boolean;
  /** if true component will be hidden - defaults to false */
  isHidden?: boolean | ConditionalBooleanValue;
  /** if true component will be disabled - defaults to false */
  isDisabled?: boolean | ConditionalBooleanValue;
  /** if set, component will be considered "active" an will display an "active stripe" - defaults to false */
  isActive?: boolean;
  /** if set, component will be considered selected but will NOT display an "active stripe" - defaults to false. Typically used by buttons that toggle between two states. */
  isPressed?: boolean;
  /** can be used by application to store miscellaneous data. */
  applicationData?: any;
  /** Badge to be overlaid on the item. */
  badgeType?: BadgeType;
  /** abstract icon definition, used when create itemDef from abstract item (ie. MenuItem) */
  icon?: string | ConditionalStringValue;

  /** if set, it is used to explicitly set the label shown by a component. */
  label?: string | StringGetter | ConditionalStringValue;
  /** if set, it is used to define a key that is used to look up a localized string. This value is used only if label is not explicitly set. */
  labelKey?: string;

  /** if set, it is used to explicitly set the description shown by a component. */
  description?: string | StringGetter | ConditionalStringValue;
  /** if set, it is used to define a key that is used to look up a localized string. This value is used only if description is not explicitly set. */
  descriptionKey?: string;
  /** used to explicitly set the tooltip shown by a component. */
  tooltip?: string | StringGetter | ConditionalStringValue;
  /** if set, it is used to define a key that is used to look up a localized string. This value is used only if label is not explicitly set. */
  tooltipKey?: string;

  /** Function called to get the new items state
   * @deprecated - use ConditionalStringValue or ConditionalBooleanValue instead
   */
  stateFunc?: (state: Readonly<BaseItemState>) => BaseItemState;
  /** Synchronize Ids to listen for
   * @deprecated - use ConditionalStringValue or ConditionalBooleanValue instead
   */
  stateSyncIds?: string[];
}

/** Properties for a Tool item with a tool id.
 * @public
 */
export interface ToolItemProps extends ItemProps, CommandHandler {
  toolId: string;
}

/** Properties for a Command item.
 * @public
 */
export interface CommandItemProps extends ItemProps, CommandHandler {
  commandId?: string;
}
