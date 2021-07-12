/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import {
  CustomAttributeClass, CustomAttributeClassProps, CustomAttributeContainerType, DelayedPromiseWithProps, ECClass,
  SchemaItemKey, SchemaKey,
} from "@bentley/ecschema-metadata";
import { SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { ECClasses } from "./ECClasses";
import { MutableCAClass } from "./Mutable/MutableCAClass";

/**
 * @alpha
 * A class extending ECClasses allowing you to create schema items of type CustomAttributeClass.
 */
export class CustomAttributes extends ECClasses {
  public constructor(_schemaEditor: SchemaContextEditor) {
    super(_schemaEditor);
  }

  public async create(schemaKey: SchemaKey, name: string, containerType: CustomAttributeContainerType, displayLabel?: string, baseClass?: SchemaItemKey): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    const newClass = (await schema.createCustomAttributeClass(name)) as MutableCAClass;
    if (newClass === undefined) {
      return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
    }

    if (baseClass !== undefined) {
      const baseClassItem = await schema.lookupItem(baseClass) as CustomAttributeClass;
      newClass.baseClass = new DelayedPromiseWithProps<SchemaItemKey, ECClass>(baseClass, async () => baseClassItem);
    }
    if (displayLabel) { newClass.setDisplayLabel(displayLabel); }

    newClass.setContainerType(containerType);

    return { itemKey: newClass.key };
  }

  /**
   * Creates a CustomAttributeClass through a CustomAttributeClassProps.
   * @param schemaKey a SchemaKey of the Schema that will house the new object.
   * @param caProps a json object that will be used to populate the new CustomAttributeClass. Needs a name value passed in.
   */
  public async createFromProps(schemaKey: SchemaKey, caProps: CustomAttributeClassProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    if (caProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
    const newClass = (await schema.createCustomAttributeClass(caProps.name)) as MutableCAClass;
    if (newClass === undefined) {
      return { errorMessage: `Failed to create class ${caProps.name} in schema ${schemaKey.toString(true)}.` };
    }
    await newClass.fromJSON(caProps);

    return { itemKey: newClass.key };
  }
}
