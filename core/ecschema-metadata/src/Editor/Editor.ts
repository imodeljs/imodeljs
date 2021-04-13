/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { assert } from "@bentley/bentleyjs-core";
import { SchemaContext } from "../Context";
import { DelayedPromiseWithProps } from "../DelayedPromise";
import {
  ConstantProps, CustomAttributeClassProps, EntityClassProps, EnumerationPropertyProps, EnumerationProps, FormatProps, InvertedUnitProps,
  KindOfQuantityProps, MixinProps, PhenomenonProps, PrimitiveArrayPropertyProps, PrimitivePropertyProps, PropertyCategoryProps,
  RelationshipClassProps, StructArrayPropertyProps, StructClassProps, StructPropertyProps, UnitProps, UnitSystemProps,
} from "../Deserialization/JsonProps";
import { CustomAttributeContainerType, ECClassModifier, PrimitiveType, SchemaItemType, SchemaMatchType, StrengthDirection } from "../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "../Exception";
import { ECClass, MutableClass, MutableStructClass, StructClass } from "../Metadata/Class";
import { MutableConstant } from "../Metadata/Constant";
import { CustomAttribute } from "../Metadata/CustomAttribute";
import { CustomAttributeClass, MutableCAClass } from "../Metadata/CustomAttributeClass";
import { EntityClass, MutableEntityClass } from "../Metadata/EntityClass";
import { AnyEnumerator, Enumeration, MutableEnumeration } from "../Metadata/Enumeration";
import { Format, MutableFormat } from "../Metadata/Format";
import { InvertedUnit, MutableInvertedUnit } from "../Metadata/InvertedUnit";
import { MutableKindOfQuantity } from "../Metadata/KindOfQuantity";
import { Mixin, MutableMixin } from "../Metadata/Mixin";
import { OverrideFormat } from "../Metadata/OverrideFormat";
import { MutablePhenomenon, Phenomenon } from "../Metadata/Phenomenon";
import { MutablePropertyCategory } from "../Metadata/PropertyCategory";
import { MutableRelationshipClass, RelationshipClass } from "../Metadata/RelationshipClass";
import { MutableSchema, Schema } from "../Metadata/Schema";
import { MutableUnit, Unit } from "../Metadata/Unit";
import { MutableUnitSystem, UnitSystem } from "../Metadata/UnitSystem";
import { SchemaItemKey, SchemaKey } from "../SchemaKey";
import { FormatType } from "@bentley/imodeljs-quantity";
import * as Rules from "../Validation/ECRules";

// We can either add validation in Editor, or in the protected methods of Schema.
// TODO: Add an error code so we can do something programmatic with the error.
/**
 * @alpha
 */
export interface SchemaEditResults {
  schemaKey?: SchemaKey;
  errorMessage?: string;
}

/**
 * @alpha
 */
export interface SchemaItemEditResults {
  itemKey?: SchemaItemKey;
  errorMessage?: string;
}

/**
 * @alpha
 */
export interface PropertyEditResults {
  itemKey?: SchemaItemKey;
  propertyName?: string;
  errorMessage?: string;
}

// TODO: Put class SchemaContextEditor into separate file.
/**
 * A class that allows you to edit and create schemas, classes, and items from the SchemaContext level.
 * @alpha
 */
export class SchemaContextEditor {
  private _schemaContext: SchemaContext;
  public readonly entities = new Editors.Entities(this);
  public readonly mixins = new Editors.Mixins(this);
  public readonly structs = new Editors.Structs(this);
  public readonly customAttributes = new Editors.CustomAttributes(this);
  public readonly relationships = new Editors.RelationshipClasses(this);
  public readonly constants = new Editors.Constants(this);
  public readonly enumerations = new Editors.Enumerations(this);
  public readonly formats = new Editors.Formats(this);
  public readonly kindOfQuantities = new Editors.KindOfQuantities(this);
  public readonly units = new Editors.Units(this);
  public readonly phenomenons = new Editors.Phenomenons(this);
  public readonly unitSystems = new Editors.UnitSystems(this);
  public readonly propertyCategories = new Editors.PropertyCategories(this);
  public readonly invertedUnits = new Editors.InvertedUnits(this);

  /**
   * Creates a new SchemaContextEditor instance.
   * @param schemaContext The SchemaContext the Editor will use to edit in.
   */
  constructor(schemaContext: SchemaContext) {
    // TODO: Make copy
    this._schemaContext = schemaContext;
  }

  /** Allows you to get schema classes and items through regular SchemaContext methods. */
  public get schemaContext(): SchemaContext { return this._schemaContext; }

  public async finish(): Promise<SchemaContext> {
    return this._schemaContext;
  }

  /**
   * Creates a Schema with the given properties and adds it to the current schema context.
   * @param name The name given to the new schema.
   * @param alias The alias of the new schema.
   * @param readVersion The read version number of the schema.
   * @param writeVersion The write version number of the schema.
   * @param minorVersion The minor version number of the schema.
   * @returns Resolves to a SchemaEditResults object.
   */
  public async createSchema(name: string, alias: string, readVersion: number, writeVersion: number, minorVersion: number): Promise<SchemaEditResults> {
    const newSchema = new Schema(this._schemaContext, name, alias, readVersion, writeVersion, minorVersion);
    await this._schemaContext.addSchema(newSchema);
    return { schemaKey: newSchema.schemaKey };
  }

  /**
   * Adds a referenced schema to the schema identified by the given SchemaKey.
   * @param schemaKey The SchemaKey identifying the schema.
   * @param refSchema The referenced schema to add.
   */
  public async addSchemaReference(schemaKey: SchemaKey, refSchema: Schema): Promise<SchemaEditResults> {
    const schema = (await this.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
    await schema.addReference(refSchema);
    const diagnostics = Rules.validateSchemaReferences(schema);

    const result: SchemaEditResults = { errorMessage: "" };
    for await (const diagnostic of diagnostics) {
      result.errorMessage += `${diagnostic.code}: ${diagnostic.messageText}\r\n`;
    }

    if (result.errorMessage) {
      this.removeReference(schema, refSchema);
      return result;
    }

    if (!await this.schemaContext.getCachedSchema(refSchema.schemaKey)) {
      await this.schemaContext.addSchema(refSchema);
    }

    return {};
  }

  /**
   * Adds a CustomAttribute instance to the schema identified by the given SchemaKey
   * @param schemaKey The SchemaKey identifying the schema.
   * @param customAttribute The CustomAttribute instance to add.
   */
  public async addCustomAttribute(schemaKey: SchemaKey, customAttribute: CustomAttribute): Promise<SchemaEditResults> {
    const schema = (await this.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
    schema.addCustomAttribute(customAttribute);

    const diagnostics = Rules.validateCustomAttributeInstance(schema, customAttribute);

    const result: SchemaEditResults = { errorMessage: "" };
    for await (const diagnostic of diagnostics) {
      result.errorMessage += `${diagnostic.code}: ${diagnostic.messageText}\r\n`;
    }

    if (result.errorMessage) {
      this.removeCustomAttribute(schema, customAttribute);
      return result;
    }

    return {};
  }

  private removeReference(schema: Schema, refSchema: Schema) {
    const index: number = schema.references.indexOf(refSchema);
    if (index !== -1) {
      schema.references.splice(index, 1);
    }
  }

  private removeCustomAttribute(schema: Schema, customAttribute: CustomAttribute) {
    assert(schema.customAttributes !== undefined);
    const map = schema.customAttributes as Map<string, CustomAttribute>;
    map.delete(customAttribute.className);
  }
}

// TODO: Move Editors into a separate file.
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

  /**
   * @alpha
   * A class extending ECClasses allowing you to create schema items of type EntityClass.
   */
  export class Entities extends ECClasses {
    public constructor(_schemaEditor: SchemaContextEditor) {
      super(_schemaEditor);
    }
    public async create(schemaKey: SchemaKey, name: string, modifier: ECClassModifier, displayLabel?: string, baseClass?: SchemaItemKey, mixins?: Mixin[]): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
  /**
   * @alpha
   * A class extending ECClasses allowing you to create schema items of type Mixin.
   */
  export class Mixins extends ECClasses {
    public constructor(_schemaEditor: SchemaContextEditor) {
      super(_schemaEditor);
    }

    public async create(schemaKey: SchemaKey, name: string, appliesTo: SchemaItemKey, displayLabel?: string, baseClass?: SchemaItemKey): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
      if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

      const newClass = (await schema.createMixinClass(name)) as MutableMixin;
      if (newClass === undefined) {
        return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
      }

      if (baseClass !== undefined) {
        const baseClassItem = await schema.lookupItem(baseClass) as Mixin;
        if (baseClassItem === undefined) return { errorMessage: `Unable to locate base class ${baseClass.fullName} in schema ${schema.fullName}.` };
        if (baseClassItem.schemaItemType !== SchemaItemType.Mixin) return { errorMessage: `${baseClassItem.fullName} is not of type Mixin.` };
        newClass.baseClass = new DelayedPromiseWithProps<SchemaItemKey, Mixin>(baseClass, async () => baseClassItem);
      }

      const newAppliesTo = (await this._schemaEditor.schemaContext.getSchemaItem(appliesTo)) as EntityClass;
      if (newAppliesTo === undefined || newAppliesTo.schemaItemType !== SchemaItemType.EntityClass) { return { errorMessage: `Failed to locate the appliedTo entity class ${appliesTo.name}.` }; }
      newClass.setAppliesTo(new DelayedPromiseWithProps<SchemaItemKey, EntityClass>(newAppliesTo.key, async () => newAppliesTo));

      if (displayLabel) { newClass.setDisplayLabel(displayLabel); }

      return { itemKey: newClass.key };
    }

    /**
     * Creates a MixinClass through a MixinProps.
     * @param schemaKey a SchemaKey of the Schema that will house the new object.
     * @param mixinProps a json object that will be used to populate the new MixinClass. Needs a name value passed in.
     */
    public async createFromProps(schemaKey: SchemaKey, mixinProps: MixinProps): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
      if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

      if (mixinProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
      const newClass = (await schema.createMixinClass(mixinProps.name)) as MutableMixin;
      if (newClass === undefined) {
        return { errorMessage: `Failed to create class ${mixinProps.name} in schema ${schemaKey.toString(true)}.` };
      }

      await newClass.fromJSON(mixinProps);

      return { itemKey: newClass.key };
    }

    public async addMixin(entityKey: SchemaItemKey, mixinKey: SchemaItemKey): Promise<void> {
      const entity = (await this._schemaEditor.schemaContext.getSchemaItem(entityKey)) as MutableEntityClass;
      const mixin = (await this._schemaEditor.schemaContext.getSchemaItem(mixinKey)) as Mixin;

      if (entity === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Entity Class ${entityKey.fullName} not found in schema context.`);
      if (mixin === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Mixin Class ${mixinKey.fullName} not found in schema context.`);
      if (entity.schemaItemType !== SchemaItemType.EntityClass) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${entityKey.fullName} to be of type Entity Class.`);
      if (mixin.schemaItemType !== SchemaItemType.Mixin) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${mixinKey.fullName} to be of type Mixin.`);

      entity.addMixin(mixin);
    }

    public async createNavigationProperty(mixinKey: SchemaItemKey, name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<PropertyEditResults> {
      const mixin = (await this._schemaEditor.schemaContext.getSchemaItem(mixinKey)) as MutableMixin;

      if (mixin === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Mixin Class ${mixinKey.fullName} not found in schema context.`);
      if (mixin.schemaItemType !== SchemaItemType.Mixin) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${mixinKey.fullName} to be of type Mixin.`);

      await mixin.createNavigationProperty(name, relationship, direction);
      return { itemKey: mixinKey, propertyName: name };
    }
  }
  /**
   * @alpha A class extending ECClasses allowing you to create schema items of type StructClass.
   */
  export class Structs extends ECClasses {
    public constructor(_schemaEditor: SchemaContextEditor) {
      super(_schemaEditor);
    }

    public async create(schemaKey: SchemaKey, name: string, displayLabel?: string, baseClass?: SchemaItemKey): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
  /**
   * @alpha
   * A class extending ECClasses allowing you to create schema items of type CustomAttributeClass.
   */
  export class CustomAttributes extends ECClasses {
    public constructor(_schemaEditor: SchemaContextEditor) {
      super(_schemaEditor);
    }

    public async create(schemaKey: SchemaKey, name: string, containerType: CustomAttributeContainerType, displayLabel?: string, baseClass?: SchemaItemKey): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
    //   const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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

  /**
   * @alpha
   * A class allowing you to create schema items of type Constant.
   */
  export class Constants {
    public constructor(protected _schemaEditor: SchemaContextEditor) { }

    public async create(schemaKey: SchemaKey, name: string, phenomenon: SchemaItemKey, definition: string, displayLabel?: string, numerator?: number, denominator?: number): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Exact)) as MutableSchema;
      if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

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
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
  /**
   * @alpha
   * A class allowing you to create schema items of type Enumeration.
   */
  export class Enumerations {
    public constructor(protected _schemaEditor: SchemaContextEditor) { }

    public async create(schemaKey: SchemaKey, name: string, type: PrimitiveType.Integer | PrimitiveType.String, displayLabel?: string, isStrict?: boolean, enumerators?: AnyEnumerator[]): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Exact)) as MutableSchema;
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
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
  /**
   * @alpha
   * A class allowing you to create schema items of type Format.
   */
  export class Formats {
    public constructor(protected _schemaEditor: SchemaContextEditor) { }
    public async create(schemaKey: SchemaKey, name: string, formatType: FormatType, displayLabel?: string, units?: SchemaItemKey[]): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
      const newFormat = (await schema.createFormat(name)) as MutableFormat;
      if (newFormat === undefined) {
        return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
      }

      if (units !== undefined) {
        for (const unit of units) {
          const unitItem = await this._schemaEditor.schemaContext.getSchemaItem<Unit | InvertedUnit>(unit);
          if (unitItem === undefined) {
            return { errorMessage: `Failed to locate unit ${unit.name} in Schema Context.` };
          }
          newFormat.addUnit(unitItem);
        }
      }
      if (displayLabel) { newFormat.setDisplayLabel(displayLabel); }
      // TODO: Handle the setting of format traits, separators, etc....
      newFormat.setFormatType(formatType);
      return { itemKey: newFormat.key };
    }

    /**
     * Creates a format through a FormatProps.
     * @param schemaKey a SchemaKey of the Schema that will house the new object.
     * @param relationshipProps a json object that will be used to populate the new RelationshipClass. Needs a name value passed in.
     */
    public async createFromProps(schemaKey: SchemaKey, formatProps: FormatProps): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
      if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

      if (formatProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
      const newFormat = (await schema.createFormat(formatProps.name)) as MutableFormat;
      if (newFormat === undefined) {
        return { errorMessage: `Failed to create class ${formatProps.name} in schema ${schemaKey.toString(true)}.` };
      }

      await newFormat.fromJSON(formatProps);
      return { itemKey: newFormat.key };
    }
  }
  /**
   * @alpha
   * A class allowing you to create schema items of type KindOfQuantity.
   */
  export class KindOfQuantities {
    public constructor(protected _schemaEditor: SchemaContextEditor) { }
    public async createFromProps(schemaKey: SchemaKey, koqProps: KindOfQuantityProps): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
      if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

      if (koqProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
      const newKoQ = (await schema.createKindOfQuantity(koqProps.name)) as MutableKindOfQuantity;
      if (newKoQ === undefined) {
        return { errorMessage: `Failed to create class ${koqProps.name} in schema ${schemaKey.toString(true)}.` };
      }

      await newKoQ.fromJSON(koqProps);
      return { itemKey: newKoQ.key };
    }

    /**
     *
     * @param koqKey A schemaItemKey of the editing KindOfQuantity.
     * @param format A schemaItemKey of a Format.
     * @param isDefault .is set to false when not explicitly passed.
     */
    public async addPresentationFormat(koqKey: SchemaItemKey, format: SchemaItemKey, isDefault: boolean = false): Promise<void> {
      const kindOfQuantity = (await this._schemaEditor.schemaContext.getSchemaItem(koqKey)) as MutableKindOfQuantity;

      if (kindOfQuantity === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Entity Class ${koqKey.fullName} not found in schema context.`);
      if (kindOfQuantity.schemaItemType !== SchemaItemType.KindOfQuantity) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${koqKey.fullName} to be of type Kind Of Quantity.`);

      const presentationFormat = await (this._schemaEditor.schemaContext.getSchemaItem(format)) as Format;
      if (undefined === presentationFormat)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate format '${format.fullName}' for the presentation unit on KindOfQuantity ${koqKey.fullName}.`);
      if (presentationFormat.schemaItemType !== SchemaItemType.Format) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${presentationFormat.fullName} to be of type Format.`);

      kindOfQuantity.addPresentationFormat(presentationFormat, isDefault);
    }

    public async addPresentationOverrideFormat(koqKey: SchemaItemKey, overrideFormat: OverrideFormat, isDefault: boolean = false): Promise<void> {
      const kindOfQuantity = (await this._schemaEditor.schemaContext.getSchemaItem(koqKey)) as MutableKindOfQuantity;

      if (kindOfQuantity === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Entity Class ${koqKey.fullName} not found in schema context.`);
      if (kindOfQuantity.schemaItemType !== SchemaItemType.KindOfQuantity) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${koqKey.fullName} to be of type Kind Of Quantity.`);

      kindOfQuantity.addPresentationFormat(overrideFormat, isDefault);
    }

    /**
     * @param koqKey A schemaItemKey of the editing KindOfQuantity.
     * @param parent A SchemaItemKey of the parent Format.
     * @param unitLabelOverrides The list of Unit (or InvertedUnit) and label overrides. The length of list should be equal to the number of units in the parent Format.
     */
    public async createFormatOverride(koqKey: SchemaItemKey, parent: SchemaItemKey, precision?: number, unitLabelOverrides?: Array<[Unit | InvertedUnit, string | undefined]>): Promise<OverrideFormat> {
      const kindOfQuantity = (await this._schemaEditor.schemaContext.getSchemaItem(koqKey)) as MutableKindOfQuantity;

      if (kindOfQuantity === undefined) throw new ECObjectsError(ECObjectsStatus.ClassNotFound, `Entity Class ${koqKey.fullName} not found in schema context.`);
      if (kindOfQuantity.schemaItemType !== SchemaItemType.KindOfQuantity) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${koqKey.fullName} to be of type Kind Of Quantity.`);

      const parentFormat = await (this._schemaEditor.schemaContext.getSchemaItem(parent)) as Format;
      if (undefined === parentFormat)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate format '${parent.fullName}' for the presentation unit on KindOfQuantity ${koqKey.fullName}.`);
      if (parentFormat.schemaItemType !== SchemaItemType.Format) throw new ECObjectsError(ECObjectsStatus.InvalidSchemaItemType, `Expected ${parentFormat.fullName} to be of type Format.`);

      return new OverrideFormat(parentFormat, precision, unitLabelOverrides);
    }
  }

  /**
   * @alpha
   * A class allowing you to create schema items of type Unit.
   */
  export class Units {
    // TODO: Add more setters for all attributes.
    public constructor(protected _schemaEditor: SchemaContextEditor) { }

    public async create(schemaKey: SchemaKey, name: string, definition: string, phenomenon: SchemaItemKey, unitSystem: SchemaItemKey, displayLabel?: string): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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

  /**
   * @alpha
   * A class allowing you to create schema items of type Phenomenon.
   */
  export class Phenomenons {
    public constructor(protected _schemaEditor: SchemaContextEditor) { }

    public async create(schemaKey: SchemaKey, name: string, definition: string, displayLabel?: string): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
      if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

      const newPhenomenon = (await schema.createPhenomenon(name)) as MutablePhenomenon;
      if (newPhenomenon === undefined) {
        return { errorMessage: `Failed to create class ${name} in schema ${schemaKey.toString(true)}.` };
      }
      if (displayLabel) { newPhenomenon.setDisplayLabel(displayLabel); }

      await newPhenomenon.setDefinition(definition);

      return { itemKey: newPhenomenon.key };
    }

    public async createFromProps(schemaKey: SchemaKey, phenomenonProps: PhenomenonProps): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
      if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

      if (phenomenonProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
      const newPhenomenon = (await schema.createPhenomenon(phenomenonProps.name));
      if (newPhenomenon === undefined) {
        return { errorMessage: `Failed to create class ${phenomenonProps.name} in schema ${schemaKey.toString(true)}.` };
      }

      await newPhenomenon.fromJSON(phenomenonProps);
      return { itemKey: newPhenomenon.key };
    }
  }

  /**
   * @alpha
   * A class allowing you to create schema items of type UnitSystems.
   */
  export class UnitSystems {
    public constructor(protected _schemaEditor: SchemaContextEditor) { }
    public async create(schemaKey: SchemaKey, name: string, displayLabel?: string): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
      if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

      const newUnitSystem = (await schema.createUnitSystem(name)) as MutableUnitSystem;
      if (displayLabel) { newUnitSystem.setDisplayLabel(displayLabel); }
      return { itemKey: newUnitSystem.key };
    }

    public async createFromProps(schemaKey: SchemaKey, unitSystemProps: UnitSystemProps): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
      if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

      if (unitSystemProps.name === undefined) return { errorMessage: `No name was supplied within props.` };
      const newUnitSystem = (await schema.createUnitSystem(unitSystemProps.name)) as MutableUnitSystem;
      if (newUnitSystem === undefined) {
        return { errorMessage: `Failed to create class ${unitSystemProps.name} in schema ${schemaKey.toString(true)}.` };
      }
      await newUnitSystem.fromJSON(unitSystemProps);
      return { itemKey: newUnitSystem.key };
    }
  }
  /**
   * @alpha
   * A class allowing you to create schema items of type Property Category.
   */
  export class PropertyCategories {
    public constructor(protected _schemaEditor: SchemaContextEditor) { }
    public async create(schemaKey: SchemaKey, name: string, priority: number, displayLabel?: string): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
      if (schema === undefined) return { errorMessage: `Schema Key ${schemaKey.toString(true)} not found in context` };

      const newPropCategory = (await schema.createPropertyCategory(name)) as MutablePropertyCategory;
      newPropCategory.setPriority(priority);
      if (displayLabel) { newPropCategory.setDisplayLabel(displayLabel); }
      return { itemKey: newPropCategory.key };
    }

    public async createFromProps(schemaKey: SchemaKey, propertyCategoryProps: PropertyCategoryProps): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
  /**
   * @alpha
   * A class allowing you to create schema items of type Property Category.
   */
  export class InvertedUnits {
    public constructor(protected _schemaEditor: SchemaContextEditor) { }
    public async create(schemaKey: SchemaKey, name: string, invertsUnitKey: SchemaItemKey, unitSystemKey: SchemaItemKey, displayLabel?: string): Promise<SchemaItemEditResults> {
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
      const schema = (await this._schemaEditor.schemaContext.getCachedSchema(schemaKey, SchemaMatchType.Latest)) as MutableSchema;
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
}
