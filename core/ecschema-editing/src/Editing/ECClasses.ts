/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import {
  ECClass, ECObjectsError, ECObjectsStatus, Enumeration, EnumerationPropertyProps, PrimitiveArrayPropertyProps,
  PrimitivePropertyProps, PrimitiveType, SchemaItemKey, SchemaItemType, SchemaMatchType, StructArrayPropertyProps,
  StructClass, StructPropertyProps,
} from "@bentley/ecschema-metadata";
import { SchemaContextEditor } from "./Editor";
import { MutableClass } from "./Mutable/MutableClass";

/**
 * @alpha
 */
export namespace Editors {
  /**
   * @alpha
   * Acts as a base class for schema class creation. Enables property creation.
   */
  export class ECClasses {
    protected constructor(protected _schemaEditor: SchemaContextEditor) { }

    /**
     * Create a primitive property on class identified by the given SchemaItemKey.
     * @param classKey The SchemaItemKey of the class.
     * @param name The name of the new property.
     * @param type The PrimitiveType assigned to the new property.
     */
    public async createPrimitiveProperty(classKey: SchemaItemKey, name: string, type: PrimitiveType): Promise<PropertyEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(classKey.schemaKey, SchemaMatchType.Latest));
      if (schema === undefined) return { errorMessage: `Failed to create property ${name} because the schema ${classKey.schemaKey.toString(true)} could not be found` };

      const ecClass = await schema.getItem<ECClass>(classKey.name);
      if (ecClass === undefined) return { errorMessage: `Failed to create property ${name} because the class ${classKey.name} was not found in ${classKey.schemaKey.toString(true)}` };

      switch (ecClass.schemaItemType) {
        case SchemaItemType.EntityClass:
        case SchemaItemType.Mixin:
        case SchemaItemType.StructClass:
        case SchemaItemType.CustomAttributeClass:
        case SchemaItemType.RelationshipClass:
          break;
        default:
          return { errorMessage: `Schema item type not supported` };
      }

      const mutableClass = ecClass as MutableClass;
      await mutableClass.createPrimitiveProperty(name, type);

      return { itemKey: classKey, propertyName: name };
    }

    public async createPrimitivePropertyFromProps(classKey: SchemaItemKey, name: string, type: PrimitiveType, primitiveProps: PrimitivePropertyProps): Promise<PropertyEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(classKey.schemaKey, SchemaMatchType.Latest));
      if (schema === undefined) return { errorMessage: `Failed to create property ${name} because the schema ${classKey.schemaKey.toString(true)} could not be found` };

      const ecClass = await schema.getItem<ECClass>(classKey.name);
      if (ecClass === undefined) return { errorMessage: `Failed to create property ${name} because the class ${classKey.name} was not found in ${classKey.schemaKey.toString(true)}` };

      switch (ecClass.schemaItemType) {
        case SchemaItemType.EntityClass:
        case SchemaItemType.Mixin:
        case SchemaItemType.StructClass:
        case SchemaItemType.CustomAttributeClass:
        case SchemaItemType.RelationshipClass:
          break;
        default:
          return { errorMessage: `Schema item type not supported` };
      }

      const mutableClass = ecClass as MutableClass;
      const newProperty = await mutableClass.createPrimitiveProperty(name, type);
      await newProperty.fromJSON(primitiveProps);
      return { itemKey: classKey, propertyName: name };
    }

    public async createEnumerationProperty(classKey: SchemaItemKey, name: string, type: Enumeration): Promise<PropertyEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(classKey.schemaKey, SchemaMatchType.Latest));
      if (schema === undefined) return { errorMessage: `Failed to create property ${name} because the schema ${classKey.schemaKey.toString(true)} could not be found` };

      const ecClass = await schema.getItem<ECClass>(classKey.name);
      if (ecClass === undefined) return { errorMessage: `Failed to create property ${name} because the class ${classKey.name} was not found in ${classKey.schemaKey.toString(true)}` };

      switch (ecClass.schemaItemType) {
        case SchemaItemType.EntityClass:
        case SchemaItemType.Mixin:
        case SchemaItemType.StructClass:
        case SchemaItemType.CustomAttributeClass:
        case SchemaItemType.RelationshipClass:
          break;
        default:
          return { errorMessage: `Schema item type not supported` };
      }

      const enumSchemaItemKey = ecClass.schema.getSchemaItemKey(type.fullName);
      if (enumSchemaItemKey === undefined) throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the enumeration ${type.fullName}.`);

      const mutableClass = ecClass as MutableClass;
      await mutableClass.createPrimitiveProperty(name, type);

      return { itemKey: classKey, propertyName: name };
    }
    public async createEnumerationPropertyFromProps(classKey: SchemaItemKey, name: string, type: Enumeration, enumProps: EnumerationPropertyProps): Promise<PropertyEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(classKey.schemaKey, SchemaMatchType.Latest));
      if (schema === undefined) return { errorMessage: `Failed to create property ${name} because the schema ${classKey.schemaKey.toString(true)} could not be found` };

      const ecClass = await schema.getItem<ECClass>(classKey.name);
      if (ecClass === undefined) return { errorMessage: `Failed to create property ${name} because the class ${classKey.name} was not found in ${classKey.schemaKey.toString(true)}` };

      switch (ecClass.schemaItemType) {
        case SchemaItemType.EntityClass:
        case SchemaItemType.Mixin:
        case SchemaItemType.StructClass:
        case SchemaItemType.CustomAttributeClass:
        case SchemaItemType.RelationshipClass:
          break;
        default:
          return { errorMessage: `Schema item type not supported` };
      }

      const mutableClass = ecClass as MutableClass;
      const newProperty = await mutableClass.createPrimitiveProperty(name, type);
      await newProperty.fromJSON(enumProps);
      return { itemKey: classKey, propertyName: name };
    }
    public async createPrimitiveArrayProperty(classKey: SchemaItemKey, name: string, type: PrimitiveType): Promise<PropertyEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(classKey.schemaKey, SchemaMatchType.Latest));
      if (schema === undefined) return { errorMessage: `Failed to create property ${name} because the schema ${classKey.schemaKey.toString(true)} could not be found` };
      const ecClass = await schema.getItem<ECClass>(classKey.name);
      if (ecClass === undefined) return { errorMessage: `Failed to create property ${name} because the class ${classKey.name} was not found in ${classKey.schemaKey.toString(true)}` };

      switch (ecClass.schemaItemType) {
        case SchemaItemType.EntityClass:
        case SchemaItemType.Mixin:
        case SchemaItemType.StructClass:
        case SchemaItemType.CustomAttributeClass:
        case SchemaItemType.RelationshipClass:
          break;
        default:
          return { errorMessage: `Schema item type not supported` };
      }

      const mutableClass = ecClass as MutableClass;
      await mutableClass.createPrimitiveArrayProperty(name, type);
      return { itemKey: classKey, propertyName: name };
    }

    public async createPrimitiveArrayPropertyFromProps(classKey: SchemaItemKey, name: string, type: PrimitiveType, primitiveProps: PrimitiveArrayPropertyProps): Promise<PropertyEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(classKey.schemaKey, SchemaMatchType.Latest));
      if (schema === undefined) return { errorMessage: `Failed to create property ${name} because the schema ${classKey.schemaKey.toString(true)} could not be found` };
      const ecClass = await schema.getItem<ECClass>(classKey.name);
      if (ecClass === undefined) return { errorMessage: `Failed to create property ${name} because the class ${classKey.name} was not found in ${classKey.schemaKey.toString(true)}` };

      switch (ecClass.schemaItemType) {
        case SchemaItemType.EntityClass:
        case SchemaItemType.Mixin:
        case SchemaItemType.StructClass:
        case SchemaItemType.CustomAttributeClass:
        case SchemaItemType.RelationshipClass:
          break;
        default:
          return { errorMessage: `Schema item type not supported` };
      }

      const mutableClass = ecClass as MutableClass;
      const newProperty = await mutableClass.createPrimitiveArrayProperty(name, type);
      await newProperty.fromJSON(primitiveProps);
      return { itemKey: classKey, propertyName: name };
    }

    public async createStructProperty(classKey: SchemaItemKey, name: string, type: StructClass): Promise<PropertyEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(classKey.schemaKey, SchemaMatchType.Latest));
      if (schema === undefined) return { errorMessage: `Failed to create property ${name} because the schema ${classKey.schemaKey.toString(true)} could not be found` };
      const ecClass = await schema.getItem<ECClass>(classKey.name);
      if (ecClass === undefined) return { errorMessage: `Failed to create property ${name} because the class ${classKey.name} was not found in ${classKey.schemaKey.toString(true)}` };

      switch (ecClass.schemaItemType) {
        case SchemaItemType.EntityClass:
        case SchemaItemType.Mixin:
        case SchemaItemType.StructClass:
        case SchemaItemType.CustomAttributeClass:
        case SchemaItemType.RelationshipClass:
          break;
        default:
          return { errorMessage: `Schema item type not supported` };
      }

      const mutableClass = ecClass as MutableClass;
      await mutableClass.createStructProperty(name, type);
      return { itemKey: classKey, propertyName: name };
    }

    public async createStructPropertyFromProps(classKey: SchemaItemKey, name: string, type: StructClass, structProps: StructPropertyProps): Promise<PropertyEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(classKey.schemaKey, SchemaMatchType.Latest));
      if (schema === undefined) return { errorMessage: `Failed to create property ${name} because the schema ${classKey.schemaKey.toString(true)} could not be found` };
      const ecClass = await schema.getItem<ECClass>(classKey.name);
      if (ecClass === undefined) return { errorMessage: `Failed to create property ${name} because the class ${classKey.name} was not found in ${classKey.schemaKey.toString(true)}` };

      switch (ecClass.schemaItemType) {
        case SchemaItemType.EntityClass:
        case SchemaItemType.Mixin:
        case SchemaItemType.StructClass:
        case SchemaItemType.CustomAttributeClass:
        case SchemaItemType.RelationshipClass:
          break;
        default:
          return { errorMessage: `Schema item type not supported` };
      }

      const mutableClass = ecClass as MutableClass;
      const newProperty = await mutableClass.createStructProperty(name, type);
      await newProperty.fromJSON(structProps);
      return { itemKey: classKey, propertyName: name };
    }

    public async createStructArrayProperty(classKey: SchemaItemKey, name: string, type: StructClass): Promise<PropertyEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(classKey.schemaKey, SchemaMatchType.Latest));
      if (schema === undefined) return { errorMessage: `Failed to create property ${name} because the schema ${classKey.schemaKey.toString(true)} could not be found` };
      const ecClass = await schema.getItem<ECClass>(classKey.name);
      if (ecClass === undefined) return { errorMessage: `Failed to create property ${name} because the class ${classKey.name} was not found in ${classKey.schemaKey.toString(true)}` };

      switch (ecClass.schemaItemType) {
        case SchemaItemType.EntityClass:
        case SchemaItemType.Mixin:
        case SchemaItemType.StructClass:
        case SchemaItemType.CustomAttributeClass:
        case SchemaItemType.RelationshipClass:
          break;
        default:
          return { errorMessage: `Schema item type not supported` };
      }

      const mutableClass = ecClass as MutableClass;
      await mutableClass.createStructArrayProperty(name, type);
      return { itemKey: classKey, propertyName: name };
    }

    public async createStructArrayPropertyFromProps(classKey: SchemaItemKey, name: string, type: StructClass, structProps: StructArrayPropertyProps): Promise<PropertyEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(classKey.schemaKey, SchemaMatchType.Latest));
      if (schema === undefined) return { errorMessage: `Failed to create property ${name} because the schema ${classKey.schemaKey.toString(true)} could not be found` };
      const ecClass = await schema.getItem<ECClass>(classKey.name);
      if (ecClass === undefined) return { errorMessage: `Failed to create property ${name} because the class ${classKey.name} was not found in ${classKey.schemaKey.toString(true)}` };

      switch (ecClass.schemaItemType) {
        case SchemaItemType.EntityClass:
        case SchemaItemType.Mixin:
        case SchemaItemType.StructClass:
        case SchemaItemType.CustomAttributeClass:
        case SchemaItemType.RelationshipClass:
          break;
        default:
          return { errorMessage: `Schema item type not supported` };
      }

      const mutableClass = ecClass as MutableClass;
      const newProperty = await mutableClass.createStructArrayProperty(name, type);
      await newProperty.fromJSON(structProps);
      return { itemKey: classKey, propertyName: name };
    }
  }
}
