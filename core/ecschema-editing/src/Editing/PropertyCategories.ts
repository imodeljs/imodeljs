/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { ECObjectsError, ECObjectsStatus, PropertyCategoryProps, SchemaItemKey, SchemaItemType, SchemaKey } from "@bentley/ecschema-metadata";
import { SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { MutablePropertyCategory } from "./Mutable/MutablePropertyCategory";

/**
 * @alpha
 * A class allowing you to create schema items of type Property Category.
 */
export class PropertyCategories {
  public constructor(protected _schemaEditor: SchemaContextEditor) { }
  public async create(schemaKey: SchemaKey, name: string, priority: number, displayLabel?: string): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    const newPropCategory = (await schema.createPropertyCategory(name)) as MutablePropertyCategory;
    newPropCategory.setPriority(priority);
    if (displayLabel) { newPropCategory.setDisplayLabel(displayLabel); }
    return { itemKey: newPropCategory.key };
  }

  public async createFromProps(schemaKey: SchemaKey, propertyCategoryProps: PropertyCategoryProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    if (propertyCategoryProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
    const newPropCategory = (await schema.createPropertyCategory(propertyCategoryProps.name)) as MutablePropertyCategory;
    if (newPropCategory === undefined) {
      return { errorMessage: `Failed to create class ${propertyCategoryProps.name} in schema ${schemaKey.toString(true)}.` };
    }

    await newPropCategory.fromJSON(propertyCategoryProps);
    return { itemKey: newPropCategory.key };
  }

  public async setPriority(propCategoryKey: SchemaItemKey, priority: number): Promise<void> {
    const propertyCategory = (await this._schemaEditor.schemaContext.getSchemaItem(propCategoryKey)) as MutablePropertyCategory;

    if (propertyCategory === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Property Category ${propCategoryKey.fullName} not found in schema context.`);
    if (propertyCategory.schemaItemType !== SchemaItemType.PropertyCategory) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${propCategoryKey.fullName} to be of type Property Category.`);

    propertyCategory.setPriority(priority);
  }
}
