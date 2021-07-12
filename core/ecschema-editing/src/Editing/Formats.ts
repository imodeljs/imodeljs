/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { FormatProps, FormatType, InvertedUnit, SchemaItemKey, SchemaKey, Unit } from "@bentley/ecschema-metadata";
import { SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { MutableFormat } from "./Mutable/MutableFormat";

/**
 * @alpha
 * A class allowing you to create schema items of type Format.
 */
export class Formats {
  public constructor(protected _schemaEditor: SchemaContextEditor) { }
  public async create(schemaKey: SchemaKey, name: string, formatType: FormatType, displayLabel?: string, units?: SchemaItemKey[]): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    const newFormat = (await schema.createFormat(name)) as MutableFormat;
    if (newFormat === undefined) {
      return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
    }

    if (units !== undefined) {
      for (const unit of units) {
        const unitItem = await this._schemaEditor.schemaContext.getSchemaItem<Unit | InvertedUnit>(unit);
        if (unitItem === undefined) {
          return { errorMessage: `Failed to locate unit ${unit.name} in Schema Context.` };
        }
        newFormat.addUnit(unitItem);
      }
    }
    if (displayLabel) { newFormat.setDisplayLabel(displayLabel); }
    // TODO: Handle the setting of format traits, separators, etc....
    newFormat.setFormatType(formatType);
    return { itemKey: newFormat.key };
  }

  /**
   * Creates a format through a FormatProps.
   * @param schemaKey a SchemaKey of the Schema that will house the new object.
   * @param relationshipProps a json object that will be used to populate the new RelationshipClass. Needs a name value passed in.
   */
  public async createFromProps(schemaKey: SchemaKey, formatProps: FormatProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    if (formatProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
    const newFormat = (await schema.createFormat(formatProps.name)) as MutableFormat;
    if (newFormat === undefined) {
      return { errorMessage: `Failed to create class ${formatProps.name} in schema ${schemaKey.toString(true)}.` };
    }

    await newFormat.fromJSON(formatProps);
    return { itemKey: newFormat.key };
  }
}
