/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Utilities
 */

/* istanbul ignore next */
/** Get CSS variable
 * @public
 */
export function getCssVariable(variableName: string, htmlElement?: HTMLElement): string {
  const element = htmlElement ?? document.documentElement;
  const cssStyles = getComputedStyle(element, null);
  const cssVal = String(cssStyles.getPropertyValue(variableName)).trim();
  return cssVal;
}

/* istanbul ignore next */
/** Get CSS variable as number
 * @public
 */
export function getCssVariableAsNumber(variableName: string, htmlElement?: HTMLElement): number {
  let cssValNum: number = NaN;
  const cssValStr = getCssVariable(variableName, htmlElement);
  if (cssValStr)
    cssValNum = parseFloat(cssValStr);
  return cssValNum;
}
