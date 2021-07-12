/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Quantity
 */

import { BentleyError } from "@bentley/bentleyjs-core";

/**
 * Status codes used during Quantity parsing and formatting processing.
 * @beta
 */
export enum QuantityStatus {
  QUANTITY_ERROR_BASE = 0x88DF,
  Success = 0,
  InvalidJson = QUANTITY_ERROR_BASE + 1,
  InvalidCompositeFormat = QUANTITY_ERROR_BASE + 2,
  UnableToGenerateParseTokens = QUANTITY_ERROR_BASE + 3,
  NoValueOrUnitFoundInString = QUANTITY_ERROR_BASE + 4,
  UnitLabelSuppliedButNotMatched = QUANTITY_ERROR_BASE + 5,
  UnknownUnit = QUANTITY_ERROR_BASE + 6,
  UnableToConvertParseTokensToQuantity = QUANTITY_ERROR_BASE + 7,
}

/** The error type thrown by this module. See [[QuantityStatus]] for `errorNumber` values.
 * @beta
 */
export class QuantityError extends BentleyError {
  public constructor(public override readonly errorNumber: number, message?: string) {
    super(errorNumber, message);
  }
}
