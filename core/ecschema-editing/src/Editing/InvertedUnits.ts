/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import {
  DelayedPromiseWithProps, ECObjectsError, ECObjectsStatus, InvertedUnitProps, SchemaItemKey,
  SchemaItemType, SchemaKey, Unit, UnitSystem,
} from "@bentley/ecschema-metadata";
import { SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { MutableInvertedUnit } from "./Mutable/MutableInvertedUnit";

/**
 * @alpha
 * A class allowing you to create schema items of type Inverted Unit.
 */
export class InvertedUnits {
  public constructor(protected _schemaEditor: SchemaContextEditor) { }
  public async create(schemaKey: SchemaKey, name: string, invertsUnitKey: SchemaItemKey, unitSystemKey: SchemaItemKey, displayLabel?: string): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    const newUnit = (await schema.createInvertedUnit(name)) as MutableInvertedUnit;
    if (newUnit === undefined) {
      return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
    }

    const invertsUnit = await schema.lookupItem(invertsUnitKey) as Unit;
    if (invertsUnit === undefined) return { errorMessage: `Unable to locate unit ${invertsUnitKey.fullName} in schema ${schema.fullName}.` };
    if (invertsUnit.schemaItemType !== SchemaItemType.Unit) return { errorMessage: `${invertsUnit.fullName} is not of type Unit.` };

    newUnit.setInvertsUnit(new DelayedPromiseWithProps<SchemaItemKey, Unit>(invertsUnitKey, async () => invertsUnit));

    const unitSystem = await schema.lookupItem(unitSystemKey) as UnitSystem;
    if (unitSystem === undefined) return { errorMessage: `Unable to locate unit system ${unitSystemKey.fullName} in schema ${schema.fullName}.` };
    if (unitSystem.schemaItemType !== SchemaItemType.UnitSystem) return { errorMessage: `${unitSystemKey.fullName} is not of type Unit System.` };

    newUnit.setUnitSystem(new DelayedPromiseWithProps<SchemaItemKey, UnitSystem>(unitSystemKey, async () => unitSystem));

    if (displayLabel) { newUnit.setDisplayLabel(displayLabel); }

    return { itemKey: newUnit.key };
  }

  public async createFromProps(schemaKey: SchemaKey, invertedUnitProps: InvertedUnitProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    if (invertedUnitProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
    const newUnit = (await schema.createInvertedUnit(invertedUnitProps.name)) as MutableInvertedUnit;
    if (newUnit === undefined) {
      return { errorMessage: `Failed to create class ${invertedUnitProps.name} in schema ${schemaKey.toString(true)}.` };
    }

    await newUnit.fromJSON(invertedUnitProps);
    return { itemKey: newUnit.key };
  }

  public async setInvertsUnit(invertedUnitKey: SchemaItemKey, invertsUnitKey: SchemaItemKey): Promise<void> {
    const invertedUnit = await this._schemaEditor.schemaContext.getSchemaItem(invertedUnitKey) as MutableInvertedUnit;

    if (invertedUnit === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Inverted Unit ${invertedUnitKey.fullName} not found in schema context.`);
    if (invertedUnit.schemaItemType !== SchemaItemType.InvertedUnit) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${invertedUnitKey.fullName} to be of type Inverted Unit.`);

    const invertsUnit = await this._schemaEditor.schemaContext.getSchemaItem(invertsUnitKey) as Unit;
    if (invertsUnit === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Unit ${invertsUnitKey.fullName} not found in schema context.`);
    if (invertsUnit.schemaItemType !== SchemaItemType.Unit) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${invertsUnitKey.fullName} to be of type Unit.`);

    invertedUnit.setInvertsUnit(new DelayedPromiseWithProps<SchemaItemKey, Unit>(invertsUnitKey, async () => invertsUnit));
  }

  public async setUnitSystem(invertedUnitKey: SchemaItemKey, unitSystemKey: SchemaItemKey): Promise<void> {
    const invertedUnit = await this._schemaEditor.schemaContext.getSchemaItem(invertedUnitKey) as MutableInvertedUnit;

    if (invertedUnit === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Inverted Unit ${invertedUnitKey.fullName} not found in schema context.`);
    if (invertedUnit.schemaItemType !== SchemaItemType.InvertedUnit) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${invertedUnitKey.fullName} to be of type Inverted Unit.`);

    const unitSystem = await this._schemaEditor.schemaContext.getSchemaItem(unitSystemKey) as UnitSystem;
    if (unitSystem === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Unit ${unitSystemKey.fullName} not found in schema context.`);
    if (unitSystem.schemaItemType !== SchemaItemType.UnitSystem) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${unitSystemKey.fullName} to be of type Unit System.`);

    invertedUnit.setUnitSystem(new DelayedPromiseWithProps<SchemaItemKey, UnitSystem>(unitSystemKey, async () => unitSystem));
  }
}
