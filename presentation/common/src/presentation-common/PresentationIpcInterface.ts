/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { RulesetVariableJSON } from "./RulesetVariables";

/** @internal */
export const PRESENTATION_IPC_CHANNEL_NAME = "presentationIpcInterface-1.0";

/** @internal */
export interface CommonIpcParams {
  clientId: string;
}

/** @internal */
export interface SetRulesetVariableParams<TVariable> extends CommonIpcParams {
  rulesetId: string;
  variable: TVariable;
}

/** @internal */
export interface PresentationIpcInterface {
  /** Sets ruleset variable value. */
  setRulesetVariable(params: SetRulesetVariableParams<RulesetVariableJSON>): Promise<void>;
}
