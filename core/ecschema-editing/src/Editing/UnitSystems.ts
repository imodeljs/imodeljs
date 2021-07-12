/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { SchemaKey, UnitSystemProps } from "@bentley/ecschema-metadata";
import { SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { MutableUnitSystem } from "./Mutable/MutableUnitSystem";

/**
 * @alpha
 * A class allowing you to create schema items of type UnitSystems.
 */
export class UnitSystems {
  public constructor(protected _schemaEditor: SchemaContextEditor) { }
  public async create(schemaKey: SchemaKey, name: string, displayLabel?: string): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    const newUnitSystem = (await schema.createUnitSystem(name)) as MutableUnitSystem;
    if (displayLabel) { newUnitSystem.setDisplayLabel(displayLabel); }
    return { itemKey: newUnitSystem.key };
  }

  public async createFromProps(schemaKey: SchemaKey, unitSystemProps: UnitSystemProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    if (unitSystemProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
    const newUnitSystem = (await schema.createUnitSystem(unitSystemProps.name)) as MutableUnitSystem;
    if (newUnitSystem === undefined) {
      return { errorMessage: `Failed to create class ${unitSystemProps.name} in schema ${schemaKey.toString(true)}.` };
    }
    await newUnitSystem.fromJSON(unitSystemProps);
    return { itemKey: newUnitSystem.key };
  }
}
