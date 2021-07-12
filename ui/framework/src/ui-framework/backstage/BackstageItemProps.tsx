/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Backstage
 */

import { StringGetter } from "@bentley/ui-abstract";
import { IconProps, IconSpec } from "@bentley/ui-core";
import { BackstageItemUtilities } from "./BackstageItemUtilities";

/** Base properties for a [[Backstage]] item.
 * @public
 * @deprecated - use [BackstageItem]($ui-abstract) in bentley/ui-abstract instead
 */
export interface BackstageItemProps extends IconProps {
  /** if set, component will be enabled - defaults to true */
  isEnabled?: boolean;
  /** if set, component will be shown with as the active item - defaults to false */
  isActive?: boolean;
  /** optional function to set state of backstage item */
  stateFunc?: (state: Readonly<BackstageItemState>) => BackstageItemState; // eslint-disable-line deprecation/deprecation
  /** optional SyncUi event ids that will trigger the state function to run. */
  stateSyncIds?: string[];
  /** if set, it is used to explicitly set the label shown by a component. */
  label?: string | StringGetter;
  /** if set, it is used to define a key that is used to look up a localized string. This value is used only if label is not explicitly set. */
  labelKey?: string;
  /** if set, it is used to explicitly set the description shown by a component. */
  description?: string | StringGetter;
  /** if set, it is used to define a key that is used to look up a localized string. This value is used only if description is not explicitly set. */
  descriptionKey?: string;
  /** used to explicitly set the tooltip shown by a component. */
  tooltip?: string | StringGetter;
  /** if set, it is used to define a key that is used to look up a localized string. This value is used only if label is not explicitly set. */
  tooltipKey?: string;
}

/** Properties that define the state of a Backstage items.
 * @public
 * @deprecated - use [BackstageItem]($ui-abstract) in bentley/ui-abstract instead
 */
export interface BackstageItemState {
  isEnabled: boolean;
  label: string;
  subtitle: string;
  tooltip: string;
  iconSpec: IconSpec;
  isActive?: boolean;
}

/** Helper method to set backstage item state from props.
 * @public
 * @deprecated - use [BackstageItem]($ui-abstract) in bentley/ui-abstract instead
 */
// istanbul ignore next
export const getBackstageItemStateFromProps = (props: BackstageItemProps): BackstageItemState => { // eslint-disable-line deprecation/deprecation
  return BackstageItemUtilities.getBackstageItemStateFromProps(props);
};
