/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { ConstantProps, DelayedPromiseWithProps, Phenomenon, SchemaItemKey, SchemaItemType, SchemaKey } from "@bentley/ecschema-metadata";
import { SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { MutableConstant } from "./Mutable/MutableConstant";

/**
 * @alpha
 * A class allowing you to create schema items of type Constant.
 */
export class Constants {
  public constructor(protected _schemaEditor: SchemaContextEditor) { }

  public async create(schemaKey: SchemaKey, name: string, phenomenon: SchemaItemKey, definition: string, displayLabel?: string, numerator?: number, denominator?: number): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined)
      return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    const newConstant = (await schema.createConstant(name)) as MutableConstant;
    if (newConstant === undefined) {
      return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
    }

    const newPhenomenon = (await this._schemaEditor.schemaContext.getSchemaItem(phenomenon)) as Phenomenon;
    if (newPhenomenon === undefined || newPhenomenon.schemaItemType !== SchemaItemType.Phenomenon) {
      return { errorMessage: `Unable to locate phenomenon ${phenomenon.name}` };
    }
    newConstant.setPhenomenon(new DelayedPromiseWithProps<SchemaItemKey, Phenomenon>(newPhenomenon.key, async () => newPhenomenon));
    newConstant.setDefinition(definition);

    if (numerator) { newConstant.setNumerator(numerator); }
    if (denominator) { newConstant.setDenominator(denominator); }
    if (displayLabel) { newConstant.setDisplayLabel(displayLabel); }
    return { itemKey: newConstant.key };
  }

  /**
   * Creates a Constant through a ConstantProps.
   * @param schemaKey a SchemaKey of the Schema that will house the new object.
   * @param relationshipProps a json object that will be used to populate the new RelationshipClass. Needs a name value passed in.
   */
  public async createFromProps(schemaKey: SchemaKey, constantProps: ConstantProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    if (constantProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
    const newConstant = (await schema.createConstant(constantProps.name)) as MutableConstant;
    if (newConstant === undefined) {
      return { errorMessage: `Failed to create class ${constantProps.name} in schema ${schemaKey.toString(true)}.` };
    }

    await newConstant.fromJSON(constantProps);
    return { itemKey: newConstant.key };
  }
}
