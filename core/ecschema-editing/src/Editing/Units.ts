/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { DelayedPromiseWithProps, Phenomenon, SchemaItemKey, SchemaItemType, SchemaKey, UnitProps, UnitSystem } from "@bentley/ecschema-metadata";
import { SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { MutableUnit } from "./Mutable/MutableUnit";

/**
 * @alpha
 * A class allowing you to create schema items of type Unit.
 */
export class Units {
  // TODO: Add more setters for all attributes.
  public constructor(protected _schemaEditor: SchemaContextEditor) { }

  public async create(schemaKey: SchemaKey, name: string, definition: string, phenomenon: SchemaItemKey, unitSystem: SchemaItemKey, displayLabel?: string): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    const newUnit = (await schema.createUnit(name)) as MutableUnit;
    if (newUnit === undefined) {
      return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
    }

    const phenomenonItem = await schema.lookupItem(phenomenon) as Phenomenon;
    if (phenomenonItem === undefined) return { errorMessage: `Unable to locate phenomenon ${phenomenon.fullName} in schema ${schema.fullName}.` };
    if (phenomenonItem.schemaItemType !== SchemaItemType.Phenomenon) return { errorMessage: `${phenomenon.fullName} is not of type Phenomenon.` };
    await newUnit.setPhenomenon(new DelayedPromiseWithProps<SchemaItemKey, Phenomenon>(phenomenon, async () => phenomenonItem));

    const unitSystemItem = await schema.lookupItem(unitSystem) as UnitSystem;
    if (unitSystemItem === undefined) return { errorMessage: `Unable to locate unit system ${unitSystem.fullName} in schema ${schema.fullName}.` };
    if (unitSystemItem.schemaItemType !== SchemaItemType.UnitSystem) return { errorMessage: `${unitSystem.fullName} is not of type UnitSystem.` };
    await newUnit.setUnitSystem(new DelayedPromiseWithProps<SchemaItemKey, UnitSystem>(unitSystem, async () => unitSystemItem));

    await newUnit.setDefinition(definition);

    if (displayLabel) { newUnit.setDisplayLabel(displayLabel); }

    return { itemKey: newUnit.key };
  }

  public async createFromProps(schemaKey: SchemaKey, unitProps: UnitProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    if (unitProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
    const newUnit = (await schema.createUnit(unitProps.name));
    if (newUnit === undefined) {
      return { errorMessage: `Failed to create class ${unitProps.name} in schema ${schemaKey.toString(true)}.` };
    }

    await newUnit.fromJSON(unitProps);
    return { itemKey: newUnit.key };
  }
}
