/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Item
 */

/** Standard stage uses. Allows extension to target ui item to include on a stage without
 *  knowing the stage name defined in the host application.
 * @public
 */
export enum StageUsage {
  Private = "Private",
  General = "General",
  Redline = "Redline",
  ViewOnly = "ViewOnly",
  Edit = "Edit",
  Settings = "Settings",
}
