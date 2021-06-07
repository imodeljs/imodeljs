/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Item
 */

import { CommonToolbarItem } from "../toolbars/ToolbarItem";

/** Definition for a Toolbar.
 * @public
 */
export interface AbstractToolbarProps {
  /** Id of Toolbar */
  toolbarId?: string;
  /** Items shown in the Toolbar */
  items: CommonToolbarItem[];
}
