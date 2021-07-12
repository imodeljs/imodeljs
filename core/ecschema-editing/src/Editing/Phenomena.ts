/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { PhenomenonProps, SchemaKey } from "@bentley/ecschema-metadata";
import { SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { MutablePhenomenon } from "./Mutable/MutablePhenomenon";

/**
 * @alpha
 * A class allowing you to create schema items of type Phenomenon.
 */
export class Phenomena {
  public constructor(protected _schemaEditor: SchemaContextEditor) { }

  public async create(schemaKey: SchemaKey, name: string, definition: string, displayLabel?: string): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    const newPhenomenon = (await schema.createPhenomenon(name)) as MutablePhenomenon;
    if (newPhenomenon === undefined) {
      return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
    }
    if (displayLabel) { newPhenomenon.setDisplayLabel(displayLabel); }

    await newPhenomenon.setDefinition(definition);

    return { itemKey: newPhenomenon.key };
  }

  public async createFromProps(schemaKey: SchemaKey, phenomenonProps: PhenomenonProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    if (phenomenonProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
    const newPhenomenon = (await schema.createPhenomenon(phenomenonProps.name));
    if (newPhenomenon === undefined) {
      return { errorMessage: `Failed to create class ${phenomenonProps.name} in schema ${schemaKey.toString(true)}.` };
    }

    await newPhenomenon.fromJSON(phenomenonProps);
    return { itemKey: newPhenomenon.key };
  }
}
