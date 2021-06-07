/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { Id64Array } from "@bentley/bentleyjs-core";
import { ColorDefProps } from "./ColorDef";
import { FeatureAppearanceProps } from "./FeatureSymbology";

/** Options for overriding element appearance.
 * @see [EmphasizeElements]($frontend)
 * @see [[AppearanceOverrideProps]]
 * @public
 */
export enum FeatureOverrideType {
  /** Override color only. */
  ColorOnly,
  /** Override alpha only. */
  AlphaOnly,
  /** Override both color and alpha. */
  ColorAndAlpha,
}

/** JSON representation of an appearance override in an [[EmphasizeElementsProps]].
 * @see [EmphasizeElements]($frontend).
 * @public
 */
export interface AppearanceOverrideProps {
  /** Whether to override color, transparency, or both. */
  overrideType?: FeatureOverrideType;
  /** The 0xTTBBGGRR format color/transparency value. */
  color?: ColorDefProps;
  /** The element IDs to display with the specified override. */
  ids?: Id64Array;
}

/** JSON representation of an [EmphasizeElements]($frontend).
 * @public
 */
export interface EmphasizeElementsProps {
  /** @see [EmphasizeElements.getNeverDrawnElements]($frontend) */
  neverDrawn?: Id64Array;
  /** @see [EmphasizeElements.getAlwaysDrawnElements]($frontend) */
  alwaysDrawn?: Id64Array;
  /** @see [EmphasizeElements.getIsolatedElements]($frontend) */
  isAlwaysDrawnExclusive?: boolean;
  /** @see [EmphasizeElements.getEmphasizedIsolatedElements]($frontend) */
  alwaysDrawnExclusiveEmphasized?: Id64Array;
  /** @see [EmphasizeElements.defaultAppearance]($frontend) */
  defaultAppearance?: FeatureAppearanceProps;
  /** @see [EmphasizeElements.getOverriddenElementsByKey]($frontend) */
  appearanceOverride?: AppearanceOverrideProps[];
  /** @see [EmphasizeElements.wantEmphasis]($frontend) */
  wantEmphasis?: boolean;
  /** @see [EmphasizeElements.unanimatedAppearance]($frontend) */
  unanimatedAppearance?: FeatureAppearanceProps;
}
