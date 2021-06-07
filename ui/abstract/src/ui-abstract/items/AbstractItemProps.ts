/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Item
 */

import { BadgeType } from "./BadgeType";
import { ConditionalBooleanValue } from "./ConditionalBooleanValue";
import { ConditionalStringValue } from "./ConditionalStringValue";

/** Prototype for string getter function.
 * @public
 */
export type StringGetter = () => string;

/** Definition that specifies properties shared between many ConfigurableUi components.
 * @public
 */
export interface CommonItemProps {
  /** can be used by application to store miscellaneous data. */
  applicationData?: any;
  /** Badge to be overlaid on the item. */
  badgeType?: BadgeType;
  /** if set, it is used to explicitly set the description shown by components that support a description. */
  description?: string | ConditionalStringValue;
  /** Name of icon WebFont entry or if specifying an SVG symbol added by plug on use "svg:" prefix to imported symbol Id. */
  icon?: string | ConditionalStringValue;
  /** optional data to be used by item implementor. */
  readonly internalData?: Map<string, any>;

  /** if true component will be hidden - defaults to false */
  isHidden?: boolean | ConditionalBooleanValue;
  /** if true component will be disabled - defaults to false */
  isDisabled?: boolean | ConditionalBooleanValue;
  /** if set, component will be considered "active" an will display an "active stripe" - defaults to false */
  isActive?: boolean;
  /** if set, component will be considered selected but will NOT display an "active stripe" - defaults to false. Typically used by buttons that toggle between two states. */
  isPressed?: boolean;
  /** if set, it is used to explicitly set the label shown by a component. */
  label?: string | ConditionalStringValue;
  /** used to explicitly set the tooltip shown by a component. */
  tooltip?: string | ConditionalStringValue;
}

/** Definition for a command handler.
 * @public
 */
export interface CommandHandler {
  /** Function to execute */
  execute?: (args?: any) => any;
  /** Parameters passed to the function */
  parameters?: any;
  /** Function to get the parameters passed to the function */
  getCommandArgs?: () => any[];
}

/** Definition for an item that executes and action.
 * @public
 */
export interface AbstractActionItemProps extends CommonItemProps, CommandHandler {
}
