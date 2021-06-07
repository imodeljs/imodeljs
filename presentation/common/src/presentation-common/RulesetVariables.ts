/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { CompressedId64Set, Id64String } from "@bentley/bentleyjs-core";

/**
 * Possible variable value types
 * @public
 */
export enum VariableValueTypes {
  /** Integer value */
  Int = "int",

  /** Array of integer values */
  IntArray = "int[]",

  /** Boolean value */
  Bool = "bool",

  /** String value */
  String = "string",

  /** Id64String value */
  Id64 = "id64",

  /** Array of Id64String values */
  Id64Array = "id64[]",
}

/**
 * Union of all supported variable value types
 * @public
 */
export type VariableValue = boolean | string | number | number[] | Id64String | Id64String[];

/**
 * JSON representation of [[VariableValue]]
 * @public
 */
export type VariableValueJSON = boolean | string | number | number[] | Id64String | Id64String[] | CompressedId64Set;

/**
 * Base data structure for representing ruleset variables.
 * @public
 */
export interface RulesetVariableBase {
  id: string;
  type: VariableValueTypes;
  value: VariableValue;
}
/**
 * Data structure for representing boolean ruleset variables.
 * @public
 */
export interface BooleanRulesetVariable extends RulesetVariableBase {
  type: VariableValueTypes.Bool;
  value: boolean;
}
/**
 * Data structure for representing string ruleset variables.
 * @public
 */
export interface StringRulesetVariable extends RulesetVariableBase {
  type: VariableValueTypes.String;
  value: string;
}
/**
 * Data structure for representing int ruleset variables.
 * @public
 */
export interface IntRulesetVariable extends RulesetVariableBase {
  type: VariableValueTypes.Int;
  value: number;
}
/**
 * Data structure for representing int array ruleset variables.
 * @public
 */
export interface IntsRulesetVariable extends RulesetVariableBase {
  type: VariableValueTypes.IntArray;
  value: number[];
}
/**
 * Data structure for representing ID ruleset variables.
 * @public
 */
export interface Id64RulesetVariable extends RulesetVariableBase {
  type: VariableValueTypes.Id64;
  value: Id64String;
}
/**
 * Data structure for representing ID array ruleset variables.
 * @public
 */
export interface Id64sRulesetVariable extends RulesetVariableBase {
  type: VariableValueTypes.Id64Array;
  value: Id64String[];
}
/**
 * Data structure for representing ruleset variables.
 * @public
 */
export type RulesetVariable = BooleanRulesetVariable | StringRulesetVariable | IntRulesetVariable | IntsRulesetVariable | Id64RulesetVariable | Id64sRulesetVariable;

/**
 * JSON representation of [[RulesetVariableBase]].
 * @public
 */
export interface RulesetVariableBaseJSON {
  id: string;
  type: VariableValueTypes;
  value: VariableValueJSON;
}
/**
 * JSON representation of [[BooleanRulesetVariable]].
 * @public
 */
export interface BooleanRulesetVariableJSON extends RulesetVariableBaseJSON {
  type: VariableValueTypes.Bool;
  value: boolean;
}
/**
 * JSON representation of [[StringRulesetVariable]].
 * @public
 */
export interface StringRulesetVariableJSON extends RulesetVariableBaseJSON {
  type: VariableValueTypes.String;
  value: string;
}
/**
 * JSON representation of [[IntRulesetVariable]].
 * @public
 */
export interface IntRulesetVariableJSON extends RulesetVariableBaseJSON {
  type: VariableValueTypes.Int;
  value: number;
}
/**
 * JSON representation of [[IntsRulesetVariable]].
 * @public
 */
export interface IntsRulesetVariableJSON extends RulesetVariableBaseJSON {
  type: VariableValueTypes.IntArray;
  value: number[];
}
/**
 * JSON representation of [[Id64RulesetVariable]].
 * @public
 */
export interface Id64RulesetVariableJSON extends RulesetVariableBaseJSON {
  type: VariableValueTypes.Id64;
  value: Id64String;
}
/**
 * JSON representation of [[Id64sRulesetVariable]].
 * @public
 */
export interface Id64sRulesetVariableJSON extends RulesetVariableBaseJSON {
  type: VariableValueTypes.Id64Array;
  value: Id64String[] | CompressedId64Set;
}
/**
 * JSON representation of [[RulesetVariable]].
 * @public
 */
export type RulesetVariableJSON = BooleanRulesetVariableJSON | StringRulesetVariableJSON | IntRulesetVariableJSON | IntsRulesetVariableJSON | Id64RulesetVariableJSON | Id64sRulesetVariableJSON;

/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace RulesetVariable {
  /**
   * Serialize given RulesetVariable to JSON.
   * Note: In case of [[Id64sRulesetVariable]], this method expects IDs are sorted. See [[OrderedId64Iterable.sortArray]].
   */
  export function toJSON(variable: RulesetVariable): RulesetVariableJSON {
    if (variable.type === VariableValueTypes.Id64Array)
      return { ...variable, value: CompressedId64Set.compressArray(variable.value) };
    return variable;
  }

  /** Deserialize [[RulesetVariable]] from JSON. */
  export function fromJSON(json: RulesetVariableJSON): RulesetVariable {
    if (json.type === VariableValueTypes.Id64Array) {
      if (typeof json.value === "string")
        return { ...json, value: CompressedId64Set.decompressArray(json.value) };
      return json as any; // for some reason TS doesn't understand that `json.value` is always an array here
    }
    return json;
  }
}
