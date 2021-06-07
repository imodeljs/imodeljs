/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Utilities
 */

import { Primitives } from "../properties/PrimitiveTypes";

/** Signature for number onCommit function.
 * @public
 */
export type OnNumberCommitFunc = (value: number) => void;

/** Signature for value onCommit function.
 * @public
 */
export type OnValueCommitFunc = (value: Primitives.Value) => void;

/** Signature for onCancel function.
 * @public
 */
export type OnCancelFunc = () => void;

/** Signature for onItemExecuted function.
 * @public
 */
export type OnItemExecutedFunc = (item: any) => void;
