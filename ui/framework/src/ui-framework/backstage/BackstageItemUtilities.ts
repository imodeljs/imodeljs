/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Backstage
 */

import { BackstageActionItem as UIA_BackstageActionItem, BackstageStageLauncher as UIA_BackstageStageLauncher } from "@bentley/ui-abstract";
import { PropsHelper } from "../utils/PropsHelper";
import { BackstageItemProps, BackstageItemState } from "./BackstageItemProps";

/** Used to specify the item type added to the backstage menu.
 * @beta
 * @deprecated Use [BackstageItemType]($ui-abstract) in bentley/ui-abstract instead
 */
export enum BackstageItemType {
  /** Item that executes an action function */
  ActionItem = 1,
  /** Item that activate a stage. */
  StageLauncher = 2,
}

/** Describes the data needed to insert an action button into the backstage menu.
 * @beta
 * @deprecated Use [BackstageActionItem]($ui-abstract) in bentley/ui-abstract instead
 */
export interface BackstageActionItem extends UIA_BackstageActionItem {
  readonly type: BackstageItemType.ActionItem; // eslint-disable-line deprecation/deprecation
}

/** Describes the data needed to insert an action button into the backstage menu.
 * @beta
 * @deprecated Use [BackstageStageLauncher]($ui-abstract) in bentley/ui-abstract instead
 */
export interface BackstageStageLauncher extends UIA_BackstageStageLauncher {
  readonly type: BackstageItemType.StageLauncher; // eslint-disable-line deprecation/deprecation
}

/** Utilities for creating and maintaining backstage items
 * @beta
 */
export class BackstageItemUtilities {
  /** Creates a stage launcher backstage item
   * @beta
   * @deprecated Use BackstageItemUtilities.createStageLauncher in bentley/ui-abstract instead
   */
  public static createStageLauncher = (frontstageId: string, groupPriority: number, itemPriority: number, label: string, subtitle?: string, iconSpec?: string, overrides?: Partial<BackstageStageLauncher>): BackstageStageLauncher => ({ // eslint-disable-line deprecation/deprecation
    groupPriority,
    icon: iconSpec,
    id: frontstageId,
    itemPriority,
    type: BackstageItemType.StageLauncher, // eslint-disable-line deprecation/deprecation
    label,
    stageId: frontstageId,
    subtitle,
    ...overrides,
  });

  /** Creates an action backstage item
   * @beta
   * @deprecated Use BackstageItemUtilities.createActionItem in bentley/ui-abstract instead
   */
  public static createActionItem = (itemId: string, groupPriority: number, itemPriority: number, execute: () => void, label: string, subtitle?: string, iconSpec?: string, overrides?: Partial<BackstageActionItem>): BackstageActionItem => ({ // eslint-disable-line deprecation/deprecation
    execute,
    groupPriority,
    icon: iconSpec,
    id: itemId,
    itemPriority,
    type: BackstageItemType.ActionItem, // eslint-disable-line deprecation/deprecation
    label,
    subtitle,
    ...overrides,
  });

  /** Helper method to set backstage item state from props */
  public static getBackstageItemStateFromProps = (props: BackstageItemProps): BackstageItemState => { // eslint-disable-line deprecation/deprecation
    const labelSpec = PropsHelper.getStringSpec(props.label, props.labelKey);
    const subtitleSpec = PropsHelper.getStringSpec(props.description, props.descriptionKey);
    const tooltipSpec = PropsHelper.getStringSpec(props.tooltip, props.tooltipKey);

    return {
      isEnabled: undefined !== props.isEnabled ? props.isEnabled : /* istanbul ignore next */false,
      label: PropsHelper.getStringFromSpec(labelSpec),
      subtitle: PropsHelper.getStringFromSpec(subtitleSpec),
      tooltip: PropsHelper.getStringFromSpec(tooltipSpec),
      iconSpec: props.iconSpec,
      isActive: undefined !== props.isActive ? props.isActive : false,
    };
  };
}
