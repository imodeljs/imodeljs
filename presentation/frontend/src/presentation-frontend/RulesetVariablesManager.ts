/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { BeEvent, Id64, Id64String, OrderedId64Iterable } from "@bentley/bentleyjs-core";
import { RulesetVariable, VariableValue, VariableValueTypes } from "@bentley/presentation-common";
import { IpcRequestsHandler } from "./IpcRequestsHandler";

/**
 * Presentation ruleset variables' registry.
 * @public
 */
export interface RulesetVariablesManager {

  /**
   * An event that is raised when variable changes.
   */
  onVariableChanged: BeEvent<(variableId: string, prevValue: VariableValue, currValue: VariableValue) => void>;

  /**
   * Retrieves `string` variable value.
   * Returns empty string if variable does not exist or does not convert to string.
   */
  getString(variableId: string): Promise<string>;
  /**
   * Sets `string` variable value
   */
  setString(variableId: string, value: string): Promise<void>;

  /**
   * Retrieves `boolean` variable value.
   * Returns `false` if variable does not exist or does not convert to boolean.
   */
  getBool(variableId: string): Promise<boolean>;
  /**
   * Sets `boolean` variable value
   */
  setBool(variableId: string, value: boolean): Promise<void>;

  /**
   * Retrieves `number` variable value.
   * Returns `0` if variable does not exist or does not convert to integer.
   */
  getInt(variableId: string): Promise<number>;
  /**
   * Sets `number` variable value
   */
  setInt(variableId: string, value: number): Promise<void>;

  /**
   * Retrieves `number[]` variable value.
   * Returns empty array if variable does not exist or does not convert to integer array.
   */
  getInts(variableId: string): Promise<number[]>;
  /**
   * Sets `number[]` variable value
   */
  setInts(variableId: string, value: number[]): Promise<void>;

  /**
   * Retrieves `Id64String` variable value.
   * Returns invalid Id64String if variable does not exist or does not convert to Id64String.
   */
  getId64(variableId: string): Promise<Id64String>;
  /**
   * Sets `Id64String` variable value
   */
  setId64(variableId: string, value: Id64String): Promise<void>;

  /**
   * Retrieves `Id64String[]` variable value.
   * Returns empty array if variable does not exist or does not convert to Id64String array.
   */
  getId64s(variableId: string): Promise<Id64String[]>;
  /**
   * Sets `Id64String[]` variable value
   */
  setId64s(variableId: string, value: Id64String[]): Promise<void>;

  /** Retrieves all variables.
   * @internal
   */
  getAllVariables(): RulesetVariable[];
}

/** @internal */
export class RulesetVariablesManagerImpl implements RulesetVariablesManager {

  private _clientValues = new Map<string, RulesetVariable>();
  private _rulesetId: string;
  private _ipcHandler?: IpcRequestsHandler;
  public onVariableChanged = new BeEvent<(variableId: string, prevValue: VariableValue | undefined, currValue: VariableValue) => void>();

  public constructor(rulesetId: string, ipcHandler?: IpcRequestsHandler) {
    this._rulesetId = rulesetId;
    this._ipcHandler = ipcHandler;
  }

  public getAllVariables(): RulesetVariable[] {
    const variables: RulesetVariable[] = [];
    for (const entry of this._clientValues)
      variables.push(entry[1]);
    return variables;
  }

  private changeValueType(variable: RulesetVariable, toType: VariableValueTypes): VariableValue | undefined {
    switch (toType) {
      case VariableValueTypes.Bool:
        switch (variable.type) {
          case VariableValueTypes.Int: return (0 !== variable.value);
          case VariableValueTypes.Id64: return Id64.isValidId64(variable.value);
          default: return undefined;
        }
      case VariableValueTypes.Int:
        switch (variable.type) {
          case VariableValueTypes.Bool: return variable.value ? 1 : 0;
          case VariableValueTypes.Id64: return Id64.getUpperUint32(variable.value);
          default: return undefined;
        }
      case VariableValueTypes.IntArray:
        switch (variable.type) {
          case VariableValueTypes.Id64Array: return variable.value.map((id) => Id64.getUpperUint32(id));
          default: return undefined;
        }
      case VariableValueTypes.Id64:
        switch (variable.type) {
          case VariableValueTypes.Bool: return Id64.fromLocalAndBriefcaseIds(variable.value ? 1 : 0, 0);
          case VariableValueTypes.Int: return Id64.fromLocalAndBriefcaseIds(variable.value, 0);
          default: return undefined;
        }
      case VariableValueTypes.Id64Array:
        switch (variable.type) {
          case VariableValueTypes.IntArray: return variable.value.map((int) => Id64.fromLocalAndBriefcaseIds(int, 0));
          default: return undefined;
        }
      case VariableValueTypes.String:
        switch (variable.type) {
          case VariableValueTypes.IntArray:
          case VariableValueTypes.Id64Array:
            return undefined;
          default: variable.value.toString();
        }
    }
    return undefined;
  }

  private async getValue(id: string, type: VariableValueTypes): Promise<VariableValue | undefined> {
    const variable = this._clientValues.get(id);
    if (!variable)
      return undefined;
    if (variable.type !== type)
      return this.changeValueType(variable, type);
    return variable.value;
  }

  private async setValue(id: string, type: VariableValueTypes, value: VariableValue): Promise<void> {
    const oldValue = this._clientValues.get(id);
    const variable = { id, type, value } as RulesetVariable;
    this._clientValues.set(id, variable);
    if (this._ipcHandler) {
      await this._ipcHandler.setRulesetVariable({ rulesetId: this._rulesetId, variable });
    }

    this.onVariableChanged.raiseEvent(id, oldValue?.value, value);
  }

  /**
   * Retrieves `string` variable value.
   * Returns empty string if variable does not exist or does not convert to string.
   */
  public async getString(variableId: string): Promise<string> {
    return (await this.getValue(variableId, VariableValueTypes.String) as string) || "";
  }

  /**
   * Sets `string` variable value
   */
  public async setString(variableId: string, value: string): Promise<void> {
    await this.setValue(variableId, VariableValueTypes.String, value);
  }

  /**
   * Retrieves `boolean` variable value.
   * Returns `false` if variable does not exist or does not convert to boolean.
   */
  public async getBool(variableId: string): Promise<boolean> {
    return (await this.getValue(variableId, VariableValueTypes.Bool) as boolean) || false;
  }

  /**
   * Sets `boolean` variable value
   */
  public async setBool(variableId: string, value: boolean): Promise<void> {
    await this.setValue(variableId, VariableValueTypes.Bool, value);
  }

  /**
   * Retrieves `number` variable value.
   * Returns `0` if variable does not exist or does not convert to integer.
   */
  public async getInt(variableId: string): Promise<number> {
    return (await this.getValue(variableId, VariableValueTypes.Int) as number) || 0;
  }

  /**
   * Sets `number` variable value
   */
  public async setInt(variableId: string, value: number): Promise<void> {
    await this.setValue(variableId, VariableValueTypes.Int, value);
  }

  /**
   * Retrieves `number[]` variable value.
   * Returns empty array if variable does not exist or does not convert to integer array.
   */
  public async getInts(variableId: string): Promise<number[]> {
    return (await this.getValue(variableId, VariableValueTypes.IntArray) as number[]) || [];
  }

  /**
   * Sets `number[]` variable value
   */
  public async setInts(variableId: string, value: number[]): Promise<void> {
    await this.setValue(variableId, VariableValueTypes.IntArray, value);
  }

  /**
   * Retrieves `Id64String` variable value.
   * Returns invalid Id64String if variable does not exist or does not convert to Id64String.
   */
  public async getId64(variableId: string): Promise<Id64String> {
    return (await this.getValue(variableId, VariableValueTypes.Id64) as Id64String) || Id64.invalid;
  }

  /**
   * Sets `Id64String` variable value
   */
  public async setId64(variableId: string, value: Id64String): Promise<void> {
    await this.setValue(variableId, VariableValueTypes.Id64, value);
  }

  /**
   * Retrieves `Id64String[]` variable value.
   * Returns empty array if variable does not exist or does not convert to Id64String array.
   */
  public async getId64s(variableId: string): Promise<Id64String[]> {
    return (await this.getValue(variableId, VariableValueTypes.Id64Array) as Id64String[]) || [];
  }

  /**
   * Sets `Id64String[]` variable value
   */
  public async setId64s(variableId: string, value: Id64String[]): Promise<void> {
    await this.setValue(variableId, VariableValueTypes.Id64Array, OrderedId64Iterable.sortArray(value));
  }
}
