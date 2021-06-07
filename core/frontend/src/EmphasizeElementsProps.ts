/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { AppearanceOverrideProps as CommonAppearanceOverrideProps, EmphasizeElementsProps as CommonEmphasizeElementsProps, FeatureOverrideType as CommonFeatureOverrideType } from "@bentley/imodeljs-common";

/** Options for overriding element appearance.
 * @deprecated use [FeatureOverrideType]($common)
 * @public
 */
export { CommonFeatureOverrideType as FeatureOverrideType };

/** JSON representation of an appearance override in an [[EmphasizeElementsProps]].
 * @deprecated use [AppearanceOverrideProps]($common)
 * @public
 */
export type AppearanceOverrideProps = CommonAppearanceOverrideProps;

/** JSON representation of an [[EmphasizeElements]].
 * @deprecated use [EmphasizeElementsProps]($common)
 * @public
 */
export type EmphasizeElementsProps = CommonEmphasizeElementsProps;
