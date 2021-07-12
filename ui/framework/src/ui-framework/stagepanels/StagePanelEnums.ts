/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Frontstage
 */

/** Available Stage Panel locations.
 * @alpha
 * @deprecated - Use [StagePanelLocation]($ui-abstract) in bentley/ui-abstract instead.
 */
export enum StagePanelLocation {
  Top = 101,
  TopMost,
  Left,
  Right,
  Bottom,
  BottomMost,
}

/** Enum for Stage Panel Sections
 * @alpha
 * @deprecated - Use [StagePanelSection]($ui-abstract) in bentley/ui-abstract instead.
 */
export enum StagePanelSection {
  Start,
  Middle,
  End,
}
