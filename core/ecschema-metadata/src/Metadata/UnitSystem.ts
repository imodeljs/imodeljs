/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

import { SchemaItemType } from "../ECObjects";
import { Schema } from "./Schema";
import { SchemaItem } from "./SchemaItem";

/**
 * @beta
 */
export class UnitSystem extends SchemaItem {
  public override readonly schemaItemType!: SchemaItemType.UnitSystem; // eslint-disable-line

  constructor(schema: Schema, name: string) {
    super(schema, name);
    this.schemaItemType = SchemaItemType.UnitSystem;
  }
}

/**
 * @internal
 * Used for schema editing.
 */
export abstract class MutableUnitSystem extends UnitSystem {
  public abstract override setDisplayLabel(displayLabel: string): void;
}
