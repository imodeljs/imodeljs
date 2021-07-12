/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import {
  ECObjectsError, ECObjectsStatus, RelationshipClass, RelationshipClassProps, SchemaItemKey, SchemaItemType,
  SchemaKey, StrengthDirection,
} from "@bentley/ecschema-metadata";
import { PropertyEditResults, SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { ECClasses } from "./ECClasses";
import { MutableRelationshipClass } from "./Mutable/MutableRelationshipClass";

/**
 * @alpha
 * A class extending ECClasses allowing you to create schema items of type RelationshipClass.
 * Can only create RelationshipClass objects using RelationshipClassProps for now.
 */
export class RelationshipClasses extends ECClasses {
  public constructor(_schemaEditor: SchemaContextEditor) {
    super(_schemaEditor);
  }

  // // TODO: Add relationshipConstraint, multiplicity arguments.
  // // Note: This method is not done yet, there's a lot of arguments.
  // public async create(schemaKey: SchemaKey, name: string, modifier: ECClassModifier, strength: StrengthType, direction: StrengthDirection, sourceMultiplicity: RelationshipMultiplicity, targetMultiplicity: RelationshipMultiplicity, baseClass?: SchemaItemKey) {
  //   const schema = await this._schemaEditor.getSchema(schemaKey);
  //   if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

  //   const newClass = (await schema.createRelationshipClass(name, modifier)) as MutableRelationshipClass;
  //   if (newClass === undefined) {
  //     return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
  //   }

  //   if (baseClass !== undefined) {
  //     const baseClassItem = await schema.lookupItem(baseClass) as RelationshipClass;
  //     newClass.baseClass = new DelayedPromiseWithProps<SchemaItemKey, ECClass>(baseClass, async () => baseClassItem);
  //   }
  //   newClass.setStrength(strength);
  //   newClass.setStrengthDirection(direction);

  //   return { itemKey: newClass.key };
  // }

  /**
   * Creates a RelationshipClass through a RelationshipClassProps.
   * @param schemaKey a SchemaKey of the Schema that will house the new object.
   * @param relationshipProps a json object that will be used to populate the new RelationshipClass. Needs a name value passed in.
   */
  public async createFromProps(schemaKey: SchemaKey, relationshipProps: RelationshipClassProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
    if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

    if (relationshipProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
    const newClass = (await schema.createRelationshipClass(relationshipProps.name)) as MutableRelationshipClass;
    if (newClass === undefined) {
      return { errorMessage: `Failed to create class ${relationshipProps.name} in schema ${schemaKey.toString(true)}.` };
    }

    await newClass.fromJSON(relationshipProps);
    await newClass.source.fromJSON(relationshipProps.source);
    await newClass.target.fromJSON(relationshipProps.target);

    return { itemKey: newClass.key };
  }

  public async createNavigationProperty(relationshipKey: SchemaItemKey, name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<PropertyEditResults> {
    const relationshipClass = (await this._schemaEditor.schemaContext.getSchemaItem(relationshipKey)) as MutableRelationshipClass;

    if (relationshipClass === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Relationship Class ${relationshipKey.fullName} not found in schema context.`);
    if (relationshipClass.schemaItemType !== SchemaItemType.RelationshipClass) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${relationshipKey.fullName} to be of type Relationship Class.`);

    await relationshipClass.createNavigationProperty(name, relationship, direction);
    return { itemKey: relationshipKey, propertyName: name };
  }
}
