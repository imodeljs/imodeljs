/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import {
  DelayedPromiseWithProps, ECClassModifier, ECObjectsError, ECObjectsStatus, EntityClass, EntityClassProps,
  Mixin, RelationshipClass, SchemaItemKey, SchemaItemType, SchemaKey, StrengthDirection,
} from "@bentley/ecschema-metadata";
import { PropertyEditResults, SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { ECClasses } from "./ECClasses";
import { MutableEntityClass } from "./Mutable/MutableEntityClass";

/**
 * @alpha
 * A class extending ECClasses allowing you to create schema items of type EntityClass.
 */
export class Entities extends ECClasses {
  public constructor(_schemaEditor: SchemaContextEditor) {
    super(_schemaEditor);
  }
  public async create(schemaKey: SchemaKey, name: string, modifier: ECClassModifier, displayLabel?: string, baseClass?: SchemaItemKey, mixins?: Mixin[]): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    const newClass = (await schema.createEntityClass(name, modifier)) as MutableEntityClass;
    if (newClass === undefined) {
      return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
    }

    // Add a deserializing method.
    if (baseClass !== undefined) {
      const baseClassItem = await schema.lookupItem(baseClass) as EntityClass;
      if (baseClassItem === undefined) return { errorMessage: `Unable to locate base class ${baseClass.fullName} in schema ${schema.fullName}.` };
      if (baseClassItem.schemaItemType !== SchemaItemType.EntityClass) return { errorMessage: `${baseClassItem.fullName} is not of type Entity Class.` };
      newClass.baseClass = new DelayedPromiseWithProps<SchemaItemKey, EntityClass>(baseClass, async () => baseClassItem);
    }

    if (mixins !== undefined) {
      mixins.forEach((m) => newClass.addMixin(m));
    }
    if (displayLabel) { newClass.setDisplayLabel(displayLabel); }

    return { itemKey: newClass.key };
  }

  /**
   * Creates an EntityClass through an EntityClassProps.
   * @param schemaKey a SchemaKey of the Schema that will house the new object.
   * @param entityProps a json object that will be used to populate the new EntityClass. Needs a name value passed in.
   */
  public async createFromProps(schemaKey: SchemaKey, entityProps: EntityClassProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    if (entityProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
    const newClass = (await schema.createEntityClass(entityProps.name)) as MutableEntityClass;
    if (newClass === undefined) {
      return { errorMessage: `Failed to create class ${entityProps.name} in schema ${schemaKey.toString(true)}.` };
    }

    await newClass.fromJSON(entityProps);

    return { itemKey: newClass.key };
  }
  public async addMixin(entityKey: SchemaItemKey, mixinKey: SchemaItemKey): Promise<void> {
    const entity = (await this._schemaEditor.schemaContext.getSchemaItem(entityKey)) as MutableEntityClass;
    const mixin = (await this._schemaEditor.schemaContext.getSchemaItem(mixinKey)) as Mixin;

    // TODO: have a helpful returns
    if (entity === undefined) return;
    if (mixin === undefined) return;
    if (entity.schemaItemType !== SchemaItemType.EntityClass) return;
    if (mixin.schemaItemType !== SchemaItemType.Mixin) return;

    entity.addMixin(mixin);
  }

  public async createNavigationProperty(entityKey: SchemaItemKey, name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<PropertyEditResults> {
    const entity = (await this._schemaEditor.schemaContext.getSchemaItem(entityKey)) as MutableEntityClass;

    if (entity === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Entity Class ${entityKey.fullName} not found in schema context.`);
    if (entity.schemaItemType !== SchemaItemType.EntityClass) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${entityKey.fullName} to be of type Entity Class.`);

    await entity.createNavigationProperty(name, relationship, direction);
    return { itemKey: entityKey, propertyName: name };
  }
}

