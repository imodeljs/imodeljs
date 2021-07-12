/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { DelayedPromiseWithProps, ECClass, SchemaItemKey, SchemaKey, StructClass, StructClassProps } from "@bentley/ecschema-metadata";
import { SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { ECClasses } from "./ECClasses";
import { MutableClass, MutableStructClass } from "./Mutable/MutableClass";

/**
 * @alpha A class extending ECClasses allowing you to create schema items of type StructClass.
 */
export class Structs extends ECClasses {
  public constructor(_schemaEditor: SchemaContextEditor) {
    super(_schemaEditor);
  }

  public async create(schemaKey: SchemaKey, name: string, displayLabel?: string, baseClass?: SchemaItemKey): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    const newClass = (await schema.createStructClass(name)) as MutableStructClass;
    if (newClass === undefined) {
      return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
    }

    if (baseClass !== undefined) {
      const baseClassItem = await schema.lookupItem(baseClass) as StructClass;
      newClass.baseClass = new DelayedPromiseWithProps<SchemaItemKey, ECClass>(baseClass, async () => baseClassItem);
    }

    if (displayLabel) { newClass.setDisplayLabel(displayLabel); }

    return { itemKey: newClass.key };
  }

  /**
   *  Creates a StructClass through a StructClassProps.
   * @param schemaKey a SchemaKey of the Schema that will house the new object.
   * @param structProps a json object that will be used to populate the new StructClass. Needs a name value passed in.
   */
  public async createFromProps(schemaKey: SchemaKey, structProps: StructClassProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    if (structProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
    const newClass = (await schema.createStructClass(structProps.name)) as MutableClass;
    if (newClass === undefined) {
      return { errorMessage: `Failed to create class ${structProps.name} in schema ${schemaKey.toString(true)}.` };
    }

    await newClass.fromJSON(structProps);

    return { itemKey: newClass.key };
  }
}
