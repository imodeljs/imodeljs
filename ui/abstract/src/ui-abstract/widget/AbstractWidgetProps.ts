/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Widget
 */

import { ConditionalStringValue } from "../../ui-abstract";
import { BadgeType } from "../items/BadgeType";
import { ProvidedItem } from "../items/ProvidedItem";
import { WidgetState } from "./WidgetState";

/** Properties for a Widget.
 * @public
 */
export interface AbstractWidgetProps extends ProvidedItem {
  /** Gets the widget content */
  readonly getWidgetContent: () => any;
  /** Name of icon WebFont entry or if specifying an SVG symbol added by plug on use "svg:" prefix to imported symbol Id. */
  readonly icon?: string | ConditionalStringValue;
  /** Optional Id used to uniquely identify the widget.
   * @note It is recommended to provide unique widget id to correctly save/restore App layout.
   */
  readonly id?: string;
  /** Default Widget state. Controls how the Widget is initially displayed. Defaults to WidgetState.Unloaded. */
  readonly defaultState?: WidgetState;
  /** if set, component will be considered selected but will NOT display an "active stripe" - defaults to false. Typically used by buttons that toggle between two states. */
  readonly label?: string | ConditionalStringValue;
  /** used to explicitly set the tooltip shown by a component. */
  readonly tooltip?: string | ConditionalStringValue;
  /** Indicates whether the Widget is free-form or rectangular. Defaults to false for rectangular. The default is false. */
  readonly isFreeform?: boolean;
  /** Application data attached to the Widget. */
  readonly applicationData?: any;
  /** optional data to used by item implementor. */
  readonly internalData?: Map<string, any>;
  /** Indicates whether this Widget is for the Tool Settings. */
  readonly isToolSettings?: boolean;
  /** Indicates whether this Widget is for the Status Bar. */
  readonly isStatusBar?: boolean;
  /** Indicates whether this Widget should fill the available space in the Zone. */
  readonly fillZone?: boolean;
  /** Indicates if widget can be popped out to a child window.
   * @beta */
  readonly canPopout?: boolean;
  /** Indicates if widget can be in floating state. */
  readonly isFloatingStateSupported?: boolean;
  /** Indicates if floating widget is resizable. */
  readonly isFloatingStateWindowResizable?: boolean;
  /** Widget priority */
  readonly priority?: number;
  /** Defines the SyncUi event Ids that will trigger the stateFunc to run to determine the state of the widget. */
  readonly syncEventIds?: string[];
  /** Function executed to determine the state of the widget. */
  readonly stateFunc?: (state: Readonly<WidgetState>) => WidgetState;
  /** Badge to be overlaid on the widget tab. */
  readonly badgeType?: BadgeType;
  /** Handler for widget state changed event */
  readonly onWidgetStateChanged?: () => void;
  /** Save transient DOM state (i.e. scroll offset). */
  readonly saveTransientState?: () => void;
  /** Restore transient DOM state.
   * @note Return true if the state is restored or the Widget will remount.
   */
  readonly restoreTransientState?: () => boolean;
}
