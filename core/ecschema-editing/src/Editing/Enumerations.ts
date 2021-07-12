/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { AnyEnumerator, ECObjectsError, ECObjectsStatus, EnumerationProps, PrimitiveType, SchemaItemKey, SchemaKey } from "@bentley/ecschema-metadata";
import { SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { MutableEnumeration } from "./Mutable/MutableEnumeration";

/**
 * @alpha
 * A class allowing you to create schema items of type Enumeration.
 */
export class Enumerations {
  public constructor(protected _schemaEditor: SchemaContextEditor) { }

  public async create(schemaKey: SchemaKey, name: string, type: PrimitiveType.Integer | PrimitiveType.String, displayLabel?: string, isStrict?: boolean, enumerators?: AnyEnumerator[]): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    const newEnum = (await schema.createEnumeration(name, type)) as MutableEnumeration;
    if (newEnum === undefined) {
      return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
    }

    if (undefined !== isStrict) {
      newEnum.setIsStrict(isStrict);
    }
    if (undefined !== enumerators) {
      for (const enumerator of enumerators) {
        await this.addEnumerator(newEnum.key, enumerator);
      }
    }
    if (displayLabel) { newEnum.setDisplayLabel(displayLabel); }

    return { itemKey: newEnum.key };
  }

  /**
   * Creates an Enumeration through an EnumeratorProps.
   * @param schemaKey a SchemaKey of the Schema that will house the new object.
   * @param relationshipProps a json object that will be used to populate the new RelationshipClass. Needs a name value passed in.
   */
  public async createFromProps(schemaKey: SchemaKey, enumProps: EnumerationProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    if (enumProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
    const newEnum = (await schema.createEnumeration(enumProps.name)) as MutableEnumeration;
    if (newEnum === undefined) {
      return { errorMessage: `Failed to create class ${enumProps.name} in schema ${schemaKey.toString(true)}.` };
    }

    await newEnum.fromJSON(enumProps);
    return { itemKey: newEnum.key };
  }

  public async addEnumerator(enumerationKey: SchemaItemKey, enumerator: AnyEnumerator): Promise<void> {
    const enumeration = (await this._schemaEditor.schemaContext.getSchemaItem(enumerationKey)) as MutableEnumeration;

    if (enumeration.isInt && typeof (enumerator.value) === "string") {
      throw new ECObjectsError(ECObjectsStatus.InvalidPrimitiveType, `The Enumeration ${enumeration.name} has type integer, while ${enumerator.name} has type string.`);
    }

    if (!enumeration.isInt && typeof (enumerator.value) === "number") {
      throw new ECObjectsError(ECObjectsStatus.InvalidPrimitiveType, `The Enumeration ${enumeration.name} has type string, while ${enumerator.name} has type integer.`);
    }

    enumeration.addEnumerator(enumerator);
  }
}
