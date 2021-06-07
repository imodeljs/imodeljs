/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { Id64String } from "@bentley/bentleyjs-core";
import { VariableValue, VariableValueTypes } from "@bentley/presentation-common";
import { NativePlatformDefinition } from "./NativePlatform";

/**
 * Presentation ruleset variables registry.
 * @public
 */
export interface RulesetVariablesManager {
  /** Gets a value of the specified type and ID */
  getValue(variableId: string, type: VariableValueTypes): VariableValue;
  /** Sets a value of the specified type */
  setValue(variableId: string, type: VariableValueTypes, value: VariableValue): void;

  /**
   * Retrieves `string` variable value.
   * Returns empty string if variable does not exist or does not convert to string.
   */
  getString(variableId: string): string;
  /**
   * Sets `string` variable value
   */
  setString(variableId: string, value: string): void;

  /**
   * Retrieves `boolean` variable value.
   * Returns `false` if variable does not exist or does not convert to boolean.
   */
  getBool(variableId: string): boolean;
  /**
   * Sets `boolean` variable value
   */
  setBool(variableId: string, value: boolean): void;

  /**
   * Retrieves `number` variable value.
   * Returns `0` if variable does not exist or does not convert to integer.
   */
  getInt(variableId: string): number;
  /**
   * Sets `number` variable value
   */
  setInt(variableId: string, value: number): void;

  /**
   * Retrieves `number[]` variable value.
   * Returns empty array if variable does not exist or does not convert to integer array.
   */
  getInts(variableId: string): number[];
  /**
   * Sets `number[]` variable value
   */
  setInts(variableId: string, value: number[]): void;

  /**
   * Retrieves `Id64String` variable value.
   * Returns invalid Id64String if variable does not exist or does not convert to Id64String.
   */
  getId64(variableId: string): Id64String;
  /**
   * Sets `Id64String` variable value
   */
  setId64(variableId: string, value: Id64String): void;

  /**
   * Retrieves `Id64String[]` variable value.
   * Returns empty array if variable does not exist or does not convert to Id64String array.
   */
  getId64s(variableId: string): Id64String[];
  /**
   * Sets `Id64String[]` variable value
   */
  setId64s(variableId: string, value: Id64String[]): void;
}

/**
 * Presentation ruleset variables registry implementation.
 * @internal
 */
export class RulesetVariablesManagerImpl implements RulesetVariablesManager {
  private _getNativePlatform: () => NativePlatformDefinition;
  private _rulesetId: string;

  constructor(getNativeAddon: () => NativePlatformDefinition, rulesetId: string) {
    this._getNativePlatform = getNativeAddon;
    this._rulesetId = rulesetId;
  }

  public setValueInternal(variableId: string, type: VariableValueTypes, value: VariableValue): void {
    this._getNativePlatform().setRulesetVariableValue(this._rulesetId, variableId, type, value);
  }

  public getValueInternal(variableId: string, type: VariableValueTypes): VariableValue {
    return this._getNativePlatform().getRulesetVariableValue(this._rulesetId, variableId, type).result;
  }

  public setValue(variableId: string, type: VariableValueTypes, value: VariableValue): void {
    switch (type) {
      case VariableValueTypes.Bool: return this.setBool(variableId, value as boolean);
      case VariableValueTypes.Id64: return this.setId64(variableId, value as Id64String);
      case VariableValueTypes.Id64Array: return this.setId64s(variableId, value as Id64String[]);
      case VariableValueTypes.Int: return this.setInt(variableId, value as number);
      case VariableValueTypes.IntArray: return this.setInts(variableId, value as number[]);
      case VariableValueTypes.String: return this.setString(variableId, value as string);
    }
  }
  public getValue(variableId: string, type: VariableValueTypes): VariableValue {
    switch (type) {
      case VariableValueTypes.Bool: return this.getBool(variableId);
      case VariableValueTypes.Id64: return this.getId64(variableId);
      case VariableValueTypes.Id64Array: return this.getId64s(variableId);
      case VariableValueTypes.Int: return this.getInt(variableId);
      case VariableValueTypes.IntArray: return this.getInts(variableId);
      case VariableValueTypes.String: return this.getString(variableId);
    }
  }

  /**
   * Retrieves `string` variable value.
   * Returns empty string if variable does not exist or does not convert to string.
   */
  public getString(variableId: string): string {
    return (this.getValueInternal(variableId, VariableValueTypes.String)) as string;
  }

  /**
   * Sets `string` variable value
   */
  public setString(variableId: string, value: string): void {
    this.setValueInternal(variableId, VariableValueTypes.String, value);
  }

  /**
   * Retrieves `boolean` variable value.
   * Returns `false` if variable does not exist or does not convert to boolean.
   */
  public getBool(variableId: string): boolean {
    return (this.getValueInternal(variableId, VariableValueTypes.Bool)) as boolean;
  }

  /**
   * Sets `boolean` variable value
   */
  public setBool(variableId: string, value: boolean): void {
    this.setValueInternal(variableId, VariableValueTypes.Bool, value);
  }

  /**
   * Retrieves `number` variable value.
   * Returns `0` if variable does not exist or does not convert to integer.
   */
  public getInt(variableId: string): number {
    return (this.getValueInternal(variableId, VariableValueTypes.Int)) as number;
  }

  /**
   * Sets `number` variable value
   */
  public setInt(variableId: string, value: number): void {
    this.setValueInternal(variableId, VariableValueTypes.Int, value);
  }

  /**
   * Retrieves `number[]` variable value.
   * Returns empty array if variable does not exist or does not convert to integer array.
   */
  public getInts(variableId: string): number[] {
    return (this.getValueInternal(variableId, VariableValueTypes.IntArray)) as number[];
  }

  /**
   * Sets `number[]` variable value
   */
  public setInts(variableId: string, value: number[]): void {
    this.setValueInternal(variableId, VariableValueTypes.IntArray, value);
  }

  /**
   * Retrieves `Id64String` variable value.
   * Returns invalid Id64String if variable does not exist or does not convert to Id64String.
   */
  public getId64(variableId: string): Id64String {
    return (this.getValueInternal(variableId, VariableValueTypes.Id64)) as Id64String;
  }

  /**
   * Sets `Id64String` variable value
   */
  public setId64(variableId: string, value: Id64String): void {
    this.setValueInternal(variableId, VariableValueTypes.Id64, value);
  }

  /**
   * Retrieves `Id64String[]` variable value.
   * Returns empty array if variable does not exist or does not convert to Id64String array.
   */
  public getId64s(variableId: string): Id64String[] {
    return (this.getValueInternal(variableId, VariableValueTypes.Id64Array)) as Id64String[];
  }

  /**
   * Sets `Id64String[]` variable value
   */
  public setId64s(variableId: string, value: Id64String[]): void {
    this.setValueInternal(variableId, VariableValueTypes.Id64Array, value);
  }
}
