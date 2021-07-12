/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

import { assert, BentleyError } from "@bentley/bentleyjs-core";

/** @beta */
export enum ECObjectsStatus {
  ECOBJECTS_ERROR_BASE = 0x88EC,
  Success = 0,
  DuplicateItem = ECOBJECTS_ERROR_BASE + 1,
  DuplicateProperty = ECOBJECTS_ERROR_BASE + 2,
  DuplicateSchema = ECOBJECTS_ERROR_BASE + 3,
  ImmutableSchema = ECOBJECTS_ERROR_BASE + 4,
  InvalidContainerType = ECOBJECTS_ERROR_BASE + 5,
  InvalidECJson = ECOBJECTS_ERROR_BASE + 6,
  InvalidECName = ECOBJECTS_ERROR_BASE + 7,
  InvalidECVersion = ECOBJECTS_ERROR_BASE + 8,
  InvalidEnumValue = ECOBJECTS_ERROR_BASE + 9,
  InvalidModifier = ECOBJECTS_ERROR_BASE + 10,
  InvalidMultiplicity = ECOBJECTS_ERROR_BASE + 11,
  InvalidPrimitiveType = ECOBJECTS_ERROR_BASE + 12,
  InvalidSchemaItemType = ECOBJECTS_ERROR_BASE + 13,
  InvalidStrength = ECOBJECTS_ERROR_BASE + 14,
  InvalidStrengthDirection = ECOBJECTS_ERROR_BASE + 15,
  InvalidRelationshipEnd = ECOBJECTS_ERROR_BASE + 16,
  InvalidType = ECOBJECTS_ERROR_BASE + 17,
  MissingSchemaUrl = ECOBJECTS_ERROR_BASE + 18,
  UnableToLocateSchema = ECOBJECTS_ERROR_BASE + 19,
  InvalidSchemaXML = ECOBJECTS_ERROR_BASE + 20,
  InvalidSchemaString = ECOBJECTS_ERROR_BASE + 21,
  ClassNotFound = ECOBJECTS_ERROR_BASE + 22,
  SchemaContextUndefined = ECOBJECTS_ERROR_BASE + 23,
  DifferentSchemaContexts = ECOBJECTS_ERROR_BASE + 24,
  InvalidSchemaComparisonArgument = ECOBJECTS_ERROR_BASE + 25,
  InvalidSchemaAlias = ECOBJECTS_ERROR_BASE + 26,
  InvalidSchemaKey = ECOBJECTS_ERROR_BASE + 27,
}

/** @internal */
export class ECObjectsError extends BentleyError {
  public constructor(public override readonly errorNumber: number, message?: string) {
    super(errorNumber, message);
    assert(errorNumber !== ECObjectsStatus.Success, message);
  }

  public toDebugString(): string {
    switch (this.errorNumber) {
      case ECObjectsStatus.DuplicateItem: return this._appendMessage("ECObjectsStatus.DuplicateItem");
      case ECObjectsStatus.DuplicateProperty: return this._appendMessage("ECObjectsStatus.DuplicateProperty");
      case ECObjectsStatus.DuplicateSchema: return this._appendMessage("ECObjectsStatus.DuplicateSchema");
      case ECObjectsStatus.ImmutableSchema: return this._appendMessage("ECObjectsStatus.ImmutableSchema");
      case ECObjectsStatus.InvalidContainerType: return this._appendMessage("ECObjectsStatus.InvalidContainerType");
      case ECObjectsStatus.InvalidECJson: return this._appendMessage("ECObjectsStatus.InvalidECJson");
      case ECObjectsStatus.InvalidECName: return this._appendMessage("ECObjectsStatus.InvalidECName");
      case ECObjectsStatus.InvalidECVersion: return this._appendMessage("ECObjectsStatus.InvalidECVersion");
      case ECObjectsStatus.InvalidEnumValue: return this._appendMessage("ECObjectsStatus.InvalidEnumValue");
      case ECObjectsStatus.InvalidModifier: return this._appendMessage("ECObjectsStatus.InvalidModifier");
      case ECObjectsStatus.InvalidMultiplicity: return this._appendMessage("ECObjectsStatus.InvalidMultiplicity");
      case ECObjectsStatus.InvalidPrimitiveType: return this._appendMessage("ECObjectsStatus.InvalidPrimitiveType");
      case ECObjectsStatus.InvalidSchemaItemType: return this._appendMessage("ECObjectsStatus.InvalidSchemaItemType");
      case ECObjectsStatus.InvalidStrength: return this._appendMessage("ECObjectsStatus.InvalidStrength");
      case ECObjectsStatus.InvalidStrengthDirection: return this._appendMessage("ECObjectsStatus.InvalidStrengthDirection");
      case ECObjectsStatus.InvalidRelationshipEnd: return this._appendMessage("ECObjectsStatus.InvalidRelationshipEnd");
      case ECObjectsStatus.InvalidType: return this._appendMessage("ECObjectsStatus.InvalidType");
      case ECObjectsStatus.MissingSchemaUrl: return this._appendMessage("ECObjectsStatus.MissingSchemaUrl");
      case ECObjectsStatus.UnableToLocateSchema: return this._appendMessage("ECObjectsStatus.UnableToLocateSchema");
      case ECObjectsStatus.ClassNotFound: return this._appendMessage("ECObjectsStatus.ClassNotFound");
      case ECObjectsStatus.SchemaContextUndefined: return this._appendMessage("ECObjectsStatus.SchemaContextUndefined");
      case ECObjectsStatus.DifferentSchemaContexts: return this._appendMessage("ECObjectsStatus.DifferentSchemaContexts");
      default:
        assert(false);
        /* istanbul ignore next */
        return this._appendMessage(`Error ${this.errorNumber.toString()}`);
    }
  }

  private _appendMessage(e: string): string {
    return this.message ? `${e}: ${this.message}` : e;
  }
}
