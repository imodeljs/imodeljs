/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Utils
 */

/** The inverse of TypeScript's Readonly<T> type, producing a type that has all the properties of `T` with any `readonly` modifiers removed.
 * @public
 */
export type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};
