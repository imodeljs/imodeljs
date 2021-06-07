/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { ECObjectsError, ECObjectsStatus } from "../Exception";
import { CustomAttribute } from "../Metadata/CustomAttribute";
import { CustomAttributeClass } from "../Metadata/CustomAttributeClass";
import { ECName } from "../ECName";
import { AbstractParser, CAProviderTuple } from "./AbstractParser";
import {
  ConstantProps, CustomAttributeClassProps, EntityClassProps, EnumerationProps, FormatProps, InvertedUnitProps, KindOfQuantityProps, MixinProps,
  NavigationPropertyProps, PhenomenonProps, PrimitiveArrayPropertyProps, PrimitiveOrEnumPropertyBaseProps, PrimitivePropertyProps,
  PropertyCategoryProps, PropertyProps, RelationshipClassProps, SchemaProps, SchemaReferenceProps, StructArrayPropertyProps, StructClassProps,
  StructPropertyProps, UnitProps, UnitSystemProps,
} from "./JsonProps";

interface UnknownObject { readonly [name: string]: unknown }
function isObject(x: unknown): x is UnknownObject {
  return typeof (x) === "object";
}

/** @internal */
export class JsonParser extends AbstractParser<UnknownObject> {
  private _rawSchema: UnknownObject;
  private _schemaName?: string;
  private _currentItemFullName?: string;

  constructor(rawSchema: Readonly<unknown>) {
    super();

    if (!isObject(rawSchema))
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Invalid JSON object.`);

    this._rawSchema = rawSchema;
    this._schemaName = rawSchema.name as string | undefined;
  }

  /**
   * Type checks Schema and returns SchemaProps interface
   * @param this._rawSchema
   * @returns SchemaProps
   */
  public parseSchema(): SchemaProps {
    if (undefined === this._rawSchema.name)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `An ECSchema is missing the required 'name' attribute.`);
    if (typeof (this._rawSchema.name) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `An ECSchema has an invalid 'name' attribute. It should be of type 'string'.`);

    if (undefined === this._rawSchema.$schema)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECSchema ${this._schemaName} is missing the required '$schema' attribute.`);
    if (typeof (this._rawSchema.$schema) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECSchema ${this._schemaName} has an invalid '$schema' attribute. It should be of type 'string'.`);

    if (undefined === this._rawSchema.version)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECSchema ${this._schemaName} is missing the required 'version' attribute.`);
    if (typeof (this._rawSchema.version) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECSchema ${this._schemaName} has an invalid 'version' attribute. It should be of type 'string'.`);

    if (undefined !== this._rawSchema.alias) {
      if (typeof (this._rawSchema.alias) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECSchema ${this._schemaName} has an invalid 'alias' attribute. It should be of type 'string'.`);
    }

    if (undefined !== this._rawSchema.label) {
      if (typeof (this._rawSchema.label) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECSchema ${this._schemaName} has an invalid 'label' attribute. It should be of type 'string'.`);
    }

    if (undefined !== this._rawSchema.description) {
      if (typeof (this._rawSchema.description) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECSchema ${this._schemaName} has an invalid 'description' attribute. It should be of type 'string'.`);
    }

    return (this._rawSchema as unknown) as SchemaProps;
  }

  public *getReferences(): Iterable<SchemaReferenceProps> {
    if (undefined !== this._rawSchema.references) {
      if (!Array.isArray(this._rawSchema.references))
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The schema ${this._rawSchema.name} has an invalid 'references' attribute. It should be of type 'object[]'.`);

      for (const ref of this._rawSchema.references) {
        yield this.checkSchemaReference(ref);
      }
    }
  }

  private checkSchemaReference(jsonObj: Readonly<unknown>): SchemaReferenceProps {
    if (!isObject(jsonObj))
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The schema ${this._schemaName} has an invalid 'references' attribute. It should be of type 'object[]'.`);
    if (undefined === jsonObj.name)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The schema ${this._schemaName} has an invalid 'references' attribute. One of the references is missing the required 'name' attribute.`);
    if (typeof (jsonObj.name) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The schema ${this._schemaName} has an invalid 'references' attribute. One of the references has an invalid 'name' attribute. It should be of type 'string'.`);
    if (undefined === jsonObj.version)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The schema ${this._schemaName} has an invalid 'references' attribute. One of the references is missing the required 'version' attribute.`);
    if (typeof (jsonObj.version) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The schema ${this._schemaName} has an invalid 'references' attribute. One of the references has an invalid 'version' attribute. It should be of type 'string'.`);
    return (jsonObj as unknown) as SchemaReferenceProps;
  }

  public *getItems(): Iterable<[string, string, UnknownObject]> {
    const items = this._rawSchema.items;
    if (undefined !== items) {
      if (!isObject(items) || Array.isArray(items))
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The schema ${this._schemaName} has an invalid 'items' attribute. It should be of type 'object'.`);

      // eslint-disable-next-line guard-for-in
      for (const itemName in items) {
        const item = items[itemName];
        if (!isObject(item))
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `A SchemaItem in ${this._schemaName} is an invalid JSON object.`);

        if (!ECName.validate(itemName))
          throw new ECObjectsError(ECObjectsStatus.InvalidECName, `A SchemaItem in ${this._schemaName} has an invalid 'name' attribute. '${itemName}' is not a valid ECName.`);

        if (undefined === item.schemaItemType)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The SchemaItem ${this._schemaName}.${itemName} is missing the required 'schemaItemType' attribute.`);
        if (typeof (item.schemaItemType) !== "string")
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The SchemaItem ${this._schemaName}.${itemName} has an invalid 'schemaItemType' attribute. It should be of type 'string'.`);

        this._currentItemFullName = `${this._schemaName}.${itemName}`;
        yield [itemName, item.schemaItemType, item];
      }
    }
  }

  public findItem(itemName: string): [string, string, UnknownObject] | undefined {
    const items = this._rawSchema.items;
    if (undefined !== items) {
      if (!isObject(items) || Array.isArray(items))
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The schema ${this._schemaName} has an invalid 'items' attribute. It should be of type 'object'.`);

      const item = items[itemName];
      if (undefined !== item) {
        if (!isObject(item))
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `A SchemaItem in ${this._schemaName} is an invalid JSON object.`);

        if (!ECName.validate(itemName))
          throw new ECObjectsError(ECObjectsStatus.InvalidECName, `A SchemaItem in ${this._schemaName} has an invalid 'name' attribute. '${itemName}' is not a valid ECName.`);

        if (undefined === item.schemaItemType)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The SchemaItem ${this._schemaName}.${itemName} is missing the required 'schemaItemType' attribute.`);
        if (typeof (item.schemaItemType) !== "string")
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The SchemaItem ${this._schemaName}.${itemName} has an invalid 'schemaItemType' attribute. It should be of type 'string'.`);

        this._currentItemFullName = `${this._schemaName}.${itemName}`;
        return [itemName, item.schemaItemType, item];
      }
    }

    return undefined;
  }

  /**
   * Type checks all Schema Item attributes.
   * @param jsonObj The JSON object to check if it represents a Schema Item.
   */
  private checkSchemaItemProps(jsonObj: UnknownObject): void {
    if (undefined !== jsonObj.description) {
      if (typeof (jsonObj.description) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The SchemaItem ${this._currentItemFullName} has an invalid 'description' attribute. It should be of type 'string'.`);
    }

    if (undefined !== jsonObj.label) {
      if (typeof (jsonObj.label) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The SchemaItem ${this._currentItemFullName} has an invalid 'label' attribute. It should be of type 'string'.`);
    }
  }

  public *getProperties(jsonObj: UnknownObject): Iterable<[string, string, UnknownObject]> {
    const properties = jsonObj.properties;
    if (undefined !== properties) {
      if (!Array.isArray(properties))
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECClass ${this._currentItemFullName} has an invalid 'properties' attribute. It should be of type 'object[]'.`);

      for (const property of properties as unknown[]) {
        if (!isObject(property))
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `An ECProperty in ${this._currentItemFullName} is an invalid JSON object.`);

        if (undefined === property.name)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `An ECProperty in ${this._currentItemFullName} is missing the required 'name' attribute.`);
        if (typeof (property.name) !== "string")
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `An ECProperty in ${this._currentItemFullName} has an invalid 'name' attribute. It should be of type 'string'.`);

        if (undefined === property.type)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${property.name} does not have the required 'type' attribute.`);
        if (typeof (property.type) !== "string")
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${property.name} has an invalid 'type' attribute. It should be of type 'string'.`);
        if (!this.isValidPropertyType(property.type))
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${property.name} has an invalid 'type' attribute. '${property.type}' is not a valid type.`);

        yield [property.name, property.type, property];
      }
    }
  }

  /**
   * Type checks Class and returns ClassProps interface
   * @param jsonObj The JSON object to check if it represents a Class.
   */
  private checkClassProps(jsonObj: UnknownObject): void {
    this.checkSchemaItemProps(jsonObj);

    if (undefined !== jsonObj.modifier) {
      if (typeof (jsonObj.modifier) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECClass ${this._currentItemFullName} has an invalid 'modifier' attribute. It should be of type 'string'.`);
    }

    if (undefined !== jsonObj.baseClass) {
      if (typeof (jsonObj.baseClass) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECClass ${this._currentItemFullName} has an invalid 'baseClass' attribute. It should be of type 'string'.`);
    }
    if (undefined !== jsonObj.customAttributes) {
      if (!Array.isArray(jsonObj.customAttributes)) {
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECClass ${this._currentItemFullName} has an invalid 'customAttributes' attribute. It should be of type 'array'.`);
      }
    }
  }

  /**
   * Type checks entity class and returns EntityClassProps interface
   * @param jsonObj
   * @returns EntityClassProps
   */
  public parseEntityClass(jsonObj: UnknownObject): EntityClassProps {
    this.checkClassProps(jsonObj);

    if (undefined !== jsonObj.mixins) {
      if (!Array.isArray(jsonObj.mixins))
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECEntityClass ${this._currentItemFullName} has an invalid 'mixins' attribute. It should be of type 'string[]'.`);
      for (const mixinName of jsonObj.mixins) {
        if (typeof (mixinName) !== "string")
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECEntityClass ${this._currentItemFullName} has an invalid 'mixins' attribute. It should be of type 'string[]'.`);
      }
    }
    return jsonObj as EntityClassProps;
  }

  /**
   * Type checks mixin and returns MixinProps interface
   * @param jsonObj
   * @returns MixinProps
   */
  public parseMixin(jsonObj: UnknownObject): MixinProps {
    this.checkClassProps(jsonObj);
    if (undefined === jsonObj.appliesTo)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Mixin ${this._currentItemFullName} is missing the required 'appliesTo' attribute.`);
    if (typeof (jsonObj.appliesTo) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Mixin ${this._currentItemFullName} has an invalid 'appliesTo' attribute. It should be of type 'string'.`);
    return (jsonObj as unknown) as MixinProps;
  }

  /**
   * Type checks custom attribute class and returns CustomAttributeClassProps interface
   * @param jsonObj
   * @returns CustomAttributeClassProps
   */
  public parseCustomAttributeClass(jsonObj: UnknownObject): CustomAttributeClassProps {
    this.checkClassProps(jsonObj);
    if (undefined === jsonObj.appliesTo)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The CustomAttributeClass ${this._currentItemFullName} is missing the required 'appliesTo' attribute.`);
    if (typeof (jsonObj.appliesTo) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The CustomAttributeClass ${this._currentItemFullName} has an invalid 'appliesTo' attribute. It should be of type 'string'.`);
    return (jsonObj as unknown) as CustomAttributeClassProps;
  }

  public parseStructClass(jsonObj: UnknownObject): StructClassProps {
    this.checkClassProps(jsonObj);
    return jsonObj as StructClassProps;
  }

  public parseUnitSystem(jsonObj: UnknownObject): UnitSystemProps {
    this.checkSchemaItemProps(jsonObj);
    return jsonObj as UnitSystemProps;
  }

  /**
   * Type checks Relationship Class and returns RelationshipClassProps interface
   * @param jsonObj
   * @returns RelationshipClassProps
   */
  public parseRelationshipClass(jsonObj: UnknownObject): RelationshipClassProps {
    this.checkClassProps(jsonObj);
    if (undefined === jsonObj.strength)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipClass ${this._currentItemFullName} is missing the required 'strength' attribute.`);
    if (typeof (jsonObj.strength) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipClass ${this._currentItemFullName} has an invalid 'strength' attribute. It should be of type 'string'.`);

    if (undefined === jsonObj.strengthDirection)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipClass ${this._currentItemFullName} is missing the required 'strengthDirection' attribute.`);
    if (typeof (jsonObj.strengthDirection) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipClass ${this._currentItemFullName} has an invalid 'strengthDirection' attribute. It should be of type 'string'.`);

    if (undefined === jsonObj.source)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipClass ${this._currentItemFullName} is missing the required source constraint.`);
    if (!isObject(jsonObj.source))
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipClass ${this._currentItemFullName} has an invalid source constraint. It should be of type 'object'.`);
    this.checkRelationshipConstraintProps(jsonObj.source, true);

    if (undefined === jsonObj.target)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipClass ${this._currentItemFullName} is missing the required target constraint.`);
    if (!isObject(jsonObj.target))
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The RelationshipClass ${this._currentItemFullName} has an invalid target constraint. It should be of type 'object'.`);
    this.checkRelationshipConstraintProps(jsonObj.target, false);

    return (jsonObj as unknown) as RelationshipClassProps;
  }

  /**
   * Type checks Relationship Constraint and returns RelationshipConstraintProps interface.
   * @param jsonObj
   * @param isSource For sake of error message, is this relationship constraint a source or target
   * @returns RelationshipConstraintProps
   */
  private checkRelationshipConstraintProps(jsonObj: UnknownObject, isSource: boolean): void {
    const constraintName = `${(isSource) ? "Source" : "Target"} Constraint of ${this._currentItemFullName}`; // most specific name to call RelationshipConstraint

    if (undefined === jsonObj.multiplicity)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${constraintName} is missing the required 'multiplicity' attribute.`);
    if (typeof (jsonObj.multiplicity) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${constraintName} has an invalid 'multiplicity' attribute. It should be of type 'string'.`);

    if (undefined === jsonObj.roleLabel)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${constraintName} is missing the required 'roleLabel' attribute.`);
    if (typeof (jsonObj.roleLabel) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${constraintName} has an invalid 'roleLabel' attribute. It should be of type 'string'.`);

    if (undefined === jsonObj.polymorphic)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${constraintName} is missing the required 'polymorphic' attribute.`);
    if (typeof (jsonObj.polymorphic) !== "boolean")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${constraintName} has an invalid 'polymorphic' attribute. It should be of type 'boolean'.`);

    if (undefined !== jsonObj.abstractConstraint && typeof (jsonObj.abstractConstraint) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${constraintName} has an invalid 'abstractConstraint' attribute. It should be of type 'string'.`);

    if (undefined === jsonObj.constraintClasses)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${constraintName} is missing the required 'constraintClasses' attribute.`);
    if (!Array.isArray(jsonObj.constraintClasses))
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${constraintName} has an invalid 'constraintClasses' attribute. It should be of type 'string[]'.`);

    for (const constraintClassName of jsonObj.constraintClasses) {
      if (typeof (constraintClassName) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${constraintName} has an invalid 'constraintClasses' attribute. It should be of type 'string[]'.`);
    }

    if (undefined !== jsonObj.customAttributes && !Array.isArray(jsonObj.customAttributes))
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${constraintName} has an invalid 'customAttributes' attribute. It should be of type 'array'.`);
  }

  /**
   * Type checks Enumeration and returns EnumerationProps interface
   * @param jsonObj
   * @returns EnumerationProps
   */
  public parseEnumeration(jsonObj: UnknownObject): EnumerationProps {
    this.checkSchemaItemProps(jsonObj);
    if (undefined === jsonObj.type)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} is missing the required 'type' attribute.`);
    if (typeof (jsonObj.type) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} has an invalid 'type' attribute. It should be of type 'string'.`);

    const isValidEnumerationType = (type: string): boolean => {
      type = type.toLowerCase();
      return (type === "int") ||
        (type === "integer") ||
        (type === "string");
    };
    if (!isValidEnumerationType(jsonObj.type))
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} has an invalid 'type' attribute. It should be either "int" or "string".`);

    if (undefined !== jsonObj.isStrict) { // TODO: make required
      if (typeof (jsonObj.isStrict) !== "boolean")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} has an invalid 'isStrict' attribute. It should be of type 'boolean'.`);
    }

    if (undefined === jsonObj.enumerators)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} is missing the required 'enumerators' attribute.`);
    if (!Array.isArray(jsonObj.enumerators))
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} has an invalid 'enumerators' attribute. It should be of type 'object[]'.`);

    for (const enumerator of jsonObj.enumerators) {
      if (!isObject(enumerator))
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} has an invalid 'enumerators' attribute. It should be of type 'object[]'.`);

      if (undefined === enumerator.value)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} has an enumerator that is missing the required attribute 'value'.`);

      // TODO: Should this really be handled here?
      const expectedType = jsonObj.type;
      const receivedType = (typeof (enumerator.value) === "number") ? "int" : typeof (enumerator.value);
      if (!expectedType.includes(receivedType)) // is receivedType a substring of expectedType? - easiest way to check "int" === "int" | "integer" && "string" === "string"
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} has an incompatible type. It must be "${expectedType}", not "${receivedType}".`);

      if (undefined === enumerator.name)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} has an enumerator that is missing the required attribute 'name'.`);
      if (typeof (enumerator.name) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} has an enumerator with an invalid 'name' attribute. It should be of type 'string'.`);

      if (undefined !== enumerator.label) {
        if (typeof (enumerator.label) !== "string")
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} has an enumerator with an invalid 'label' attribute. It should be of type 'string'.`);
      }

      if (undefined !== enumerator.description) {
        if (typeof (enumerator.description) !== "string")
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Enumeration ${this._currentItemFullName} has an enumerator with an invalid 'description' attribute. It should be of type 'string'.`);
      }
    }

    return (jsonObj as unknown) as EnumerationProps;
  }

  /**
   * Type checks KindOfQuantity and returns KindOfQuantityProps interface
   * @param jsonObj
   * @returns KindOfQuantityProps
   */
  public parseKindOfQuantity(jsonObj: UnknownObject): KindOfQuantityProps {
    this.checkSchemaItemProps(jsonObj);
    if (undefined === jsonObj.relativeError)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The KindOfQuantity ${this._currentItemFullName} is missing the required 'relativeError' attribute.`);
    if (typeof (jsonObj.relativeError) !== "number")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The KindOfQuantity ${this._currentItemFullName} has an invalid 'relativeError' attribute. It should be of type 'number'.`);

    if (undefined !== jsonObj.presentationUnits) {
      if (!Array.isArray(jsonObj.presentationUnits) && typeof (jsonObj.presentationUnits) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The KindOfQuantity ${this._currentItemFullName} has an invalid 'presentationUnits' attribute. It should be of type 'string' or 'string[]'.`);
    }

    if (undefined === jsonObj.persistenceUnit)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The KindOfQuantity ${this._currentItemFullName} is missing the required 'persistenceUnit' attribute.`);
    if (typeof (jsonObj.persistenceUnit) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The KindOfQuantity ${this._currentItemFullName} has an invalid 'persistenceUnit' attribute. It should be of type 'string'.`);

    return (jsonObj as unknown) as KindOfQuantityProps;
  }

  /**
   * Type checks Property Category and returns PropertyCategoryProps interface
   * @param jsonObj
   * @returns PropertyCategoryProps
   */
  public parsePropertyCategory(jsonObj: UnknownObject): PropertyCategoryProps {
    this.checkSchemaItemProps(jsonObj);
    if (undefined !== jsonObj.priority) { // TODO: make required
      if (typeof (jsonObj.priority) !== "number")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The PropertyCategory ${this._currentItemFullName} has an invalid 'priority' attribute. It should be of type 'number'.`);
    }

    return (jsonObj as unknown) as PropertyCategoryProps;
  }

  /**
   * Type checks unit and returns UnitProps interface
   * @param jsonObj
   * @returns UnitProps
   */
  public parseUnit(jsonObj: UnknownObject): UnitProps {
    this.checkSchemaItemProps(jsonObj);
    if (undefined === jsonObj.phenomenon)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Unit ${this._currentItemFullName} does not have the required 'phenomenon' attribute.`);
    if (typeof (jsonObj.phenomenon) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Unit ${this._currentItemFullName} has an invalid 'phenomenon' attribute. It should be of type 'string'.`);

    if (undefined === jsonObj.unitSystem)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Unit ${this._currentItemFullName} does not have the required 'unitSystem' attribute.`);
    if (typeof (jsonObj.unitSystem) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Unit ${this._currentItemFullName} has an invalid 'unitSystem' attribute. It should be of type 'string'.`);

    if (undefined === jsonObj.definition)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Unit ${this._currentItemFullName} does not have the required 'definition' attribute.`);
    if (typeof (jsonObj.definition) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Unit ${this._currentItemFullName} has an invalid 'definition' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.numerator) {
      if (typeof (jsonObj.numerator) !== "number")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Unit ${this._currentItemFullName} has an invalid 'numerator' attribute. It should be of type 'number'.`);
    }

    if (undefined !== jsonObj.denominator) {
      if (typeof (jsonObj.denominator) !== "number")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Unit ${this._currentItemFullName} has an invalid 'denominator' attribute. It should be of type 'number'.`);
    }

    if (undefined !== jsonObj.offset) {
      if (typeof (jsonObj.offset) !== "number")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Unit ${this._currentItemFullName} has an invalid 'offset' attribute. It should be of type 'number'.`);
    }
    return (jsonObj as unknown) as UnitProps;
  }

  /**
   * Type checks inverted unit and returns InvertedUnitProps interface
   * @param jsonObj
   * @returns InvertedUnitProps
   */
  public parseInvertedUnit(jsonObj: UnknownObject): InvertedUnitProps {
    this.checkSchemaItemProps(jsonObj);
    if (undefined === jsonObj.invertsUnit)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The InvertedUnit ${this._currentItemFullName} does not have the required 'invertsUnit' attribute.`);
    if (typeof (jsonObj.invertsUnit) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The InvertedUnit ${this._currentItemFullName} has an invalid 'invertsUnit' attribute. It should be of type 'string'.`);

    if (undefined === jsonObj.unitSystem)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The InvertedUnit ${this._currentItemFullName} does not have the required 'unitSystem' attribute.`);
    if (typeof (jsonObj.unitSystem) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The InvertedUnit ${this._currentItemFullName} has an invalid 'unitSystem' attribute. It should be of type 'string'.`);

    return (jsonObj as unknown) as InvertedUnitProps;
  }

  /**
   * Type checks constant and returns ConstantProps interface
   * @param jsonObj
   * @returns ConstantProps
   */
  public parseConstant(jsonObj: UnknownObject): ConstantProps {
    this.checkSchemaItemProps(jsonObj);
    if (undefined === jsonObj.phenomenon)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Constant ${this._currentItemFullName} does not have the required 'phenomenon' attribute.`);
    if (typeof (jsonObj.phenomenon) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Constant ${this._currentItemFullName} has an invalid 'phenomenon' attribute. It should be of type 'string'.`);

    if (undefined === jsonObj.definition)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Constant ${this._currentItemFullName} does not have the required 'definition' attribute.`);
    if (typeof (jsonObj.definition) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Constant ${this._currentItemFullName} has an invalid 'definition' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.numerator) {
      if (typeof (jsonObj.numerator) !== "number")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Constant ${this._currentItemFullName} has an invalid 'numerator' attribute. It should be of type 'number'.`);
    }

    if (undefined !== jsonObj.denominator) {
      if (typeof (jsonObj.denominator) !== "number")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Constant ${this._currentItemFullName} has an invalid 'denominator' attribute. It should be of type 'number'.`);
    }

    return (jsonObj as unknown) as ConstantProps;
  }

  /**
   * Type checks phenomenon and returns PhenomenonProps interface
   * @param jsonObj
   * @returns PhenomenonProps
   */
  public parsePhenomenon(jsonObj: UnknownObject): PhenomenonProps {
    this.checkSchemaItemProps(jsonObj);
    if (undefined === jsonObj.definition)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Phenomenon ${this._currentItemFullName} does not have the required 'definition' attribute.`);
    if (typeof (jsonObj.definition) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Phenomenon ${this._currentItemFullName} has an invalid 'definition' attribute. It should be of type 'string'.`);
    return (jsonObj as unknown) as PhenomenonProps;
  }

  /**
   * Type checks format and returns FormatProps interface
   * @param jsonObj
   * @returns FormatProps
   */
  public parseFormat(jsonObj: UnknownObject): FormatProps {
    this.checkSchemaItemProps(jsonObj);
    if (undefined === jsonObj.type)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} does not have the required 'type' attribute.`);
    if (typeof (jsonObj.type) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'type' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.precision && typeof (jsonObj.precision) !== "number")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'precision' attribute. It should be of type 'number'.`);

    if (undefined !== jsonObj.roundFactor && typeof (jsonObj.roundFactor) !== "number")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'roundFactor' attribute. It should be of type 'number'.`);

    if (undefined !== jsonObj.minWidth && typeof (jsonObj.minWidth) !== "number")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'minWidth' attribute. It should be of type 'number'.`);

    if (undefined !== jsonObj.showSignOption && typeof (jsonObj.showSignOption) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'showSignOption' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.formatTraits) {
      if (!Array.isArray(jsonObj.formatTraits) && typeof (jsonObj.formatTraits) !== "string") // must be either an array of strings or a string
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'formatTraits' attribute. It should be of type 'string' or 'string[]'.`);
    }

    if (undefined !== jsonObj.decimalSeparator && typeof (jsonObj.decimalSeparator) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'decimalSeparator' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.thousandSeparator && typeof (jsonObj.thousandSeparator) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'thousandSeparator' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.uomSeparator && typeof (jsonObj.uomSeparator) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'uomSeparator' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.scientificType && typeof (jsonObj.scientificType) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'scientificType' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.stationOffsetSize && typeof (jsonObj.stationOffsetSize) !== "number")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'stationOffsetSize' attribute. It should be of type 'number'.`);

    if (undefined !== jsonObj.stationSeparator && typeof (jsonObj.stationSeparator) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'stationSeparator' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.composite) { // optional
      if (!isObject(jsonObj.composite))
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'composite' object.`);
      if (undefined !== jsonObj.composite.includeZero && typeof (jsonObj.composite.includeZero) !== "boolean")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has a Composite with an invalid 'includeZero' attribute. It should be of type 'boolean'.`);

      if (undefined !== jsonObj.composite.spacer && typeof (jsonObj.composite.spacer) !== "string")
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has a Composite with an invalid 'spacer' attribute. It should be of type 'string'.`);

      // if composite is defined
      if (undefined === jsonObj.composite.units)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has an invalid 'Composite' attribute. It should have 1-4 units.`);
      if (!Array.isArray(jsonObj.composite.units))
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has a Composite with an invalid 'units' attribute. It should be of type 'object[]'.`);

      for (let i = 0; i < jsonObj.composite.units.length; i++) {
        if (!isObject(jsonObj.composite.units[i]))
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has a Composite with an invalid 'units' attribute. It should be of type 'object[]'.`);

        if (undefined === jsonObj.composite.units[i].name) // required
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has a Composite with an invalid 'units' attribute. The object at position ${i} is missing the required 'name' attribute.`);
        if (typeof (jsonObj.composite.units[i].name) !== "string")
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has a Composite with an invalid 'units' attribute. The object at position ${i} has an invalid 'name' attribute. It should be of type 'string'.`);

        if (undefined !== jsonObj.composite.units[i].label && typeof (jsonObj.composite.units[i].label) !== "string")
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this._currentItemFullName} has a Composite with an invalid 'units' attribute. The object at position ${i} has an invalid 'label' attribute. It should be of type 'string'.`);
      }
    }
    return (jsonObj as unknown) as FormatProps;
  }

  private isValidPropertyType(type: string): boolean {
    type = type.toLowerCase();
    return (type === "primitiveproperty") ||
      (type === "structproperty") ||
      (type === "primitivearrayproperty") ||
      (type === "structarrayproperty") ||
      (type === "navigationproperty");
  }

  /**
   * Type checks property and returns PropertyProps interface
   * @param jsonObj
   * @returns PropertyProps
   */
  private checkPropertyProps(jsonObj: UnknownObject): PropertyProps {
    const propName = jsonObj.name;

    if (undefined !== jsonObj.label && typeof (jsonObj.label) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'label' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.description && typeof (jsonObj.description) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'description' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.priority && typeof (jsonObj.priority) !== "number")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'priority' attribute. It should be of type 'number'.`);

    if (undefined !== jsonObj.isReadOnly && typeof (jsonObj.isReadOnly) !== "boolean")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'isReadOnly' attribute. It should be of type 'boolean'.`);

    if (undefined !== jsonObj.category && typeof (jsonObj.category) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'category' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.kindOfQuantity && typeof (jsonObj.kindOfQuantity) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'kindOfQuantity' attribute. It should be of type 'string'.`);

    if (undefined !== jsonObj.inherited && typeof (jsonObj.inherited) !== "boolean")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'inherited' attribute. It should be of type 'boolean'.`);

    if (undefined !== jsonObj.customAttributes && !Array.isArray(jsonObj.customAttributes))
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'customAttributes' attribute. It should be of type 'array'.`);
    return (jsonObj as unknown) as PropertyProps;
  }

  private checkPropertyTypename(jsonObj: UnknownObject): void {
    const propName = jsonObj.name;
    if (undefined === jsonObj.typeName)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} is missing the required 'typeName' attribute.`);
    if (typeof (jsonObj.typeName) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'typeName' attribute. It should be of type 'string'.`);
  }

  private checkPropertyMinAndMaxOccurs(jsonObj: UnknownObject): void {
    const propName = jsonObj.name;
    if (undefined !== jsonObj.minOccurs && typeof (jsonObj.minOccurs) !== "number")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'minOccurs' attribute. It should be of type 'number'.`);
    if (undefined !== jsonObj.maxOccurs && typeof (jsonObj.maxOccurs) !== "number")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'maxOccurs' attribute. It should be of type 'number'.`);
  }

  /**
   * Type checks PrimitiveOrEnumProperty and returns PrimitiveOrEnumPropertyBaseProps interface
   * @param jsonObj
   * @returns PrimitiveOrEnumPropertyBaseProps
   */
  private checkPrimitiveOrEnumPropertyBaseProps(jsonObj: UnknownObject): PrimitiveOrEnumPropertyBaseProps {
    this.checkPropertyProps(jsonObj);
    this.checkPropertyTypename(jsonObj);
    const propName = jsonObj.name;

    if (undefined !== jsonObj.minLength && typeof (jsonObj.minLength) !== "number")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'minLength' attribute. It should be of type 'number'.`);

    if (undefined !== jsonObj.maxLength && typeof (jsonObj.maxLength) !== "number")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'maxLength' attribute. It should be of type 'number'.`);

    if (undefined !== jsonObj.minValue && typeof (jsonObj.minValue) !== "number")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'minValue' attribute. It should be of type 'number'.`);

    if (undefined !== jsonObj.maxValue && typeof (jsonObj.maxValue) !== "number")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'maxValue' attribute. It should be of type 'number'.`);

    if (undefined !== jsonObj.extendedTypeName && typeof (jsonObj.extendedTypeName) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECProperty ${this._currentItemFullName}.${propName} has an invalid 'extendedTypeName' attribute. It should be of type 'string'.`);
    return (jsonObj as unknown) as PrimitiveOrEnumPropertyBaseProps;
  }

  /**
   * Type checks PrimitiveProperty and returns PrimitivePropertyProps interface
   * @param jsonObj
   * @returns PrimitivePropertyProps
   */
  public parsePrimitiveProperty(jsonObj: UnknownObject): PrimitivePropertyProps {
    this.checkPrimitiveOrEnumPropertyBaseProps(jsonObj);
    return (jsonObj as unknown) as PrimitivePropertyProps;
  }

  /**
   * Type checks StructProperty and returns StructPropertyProps interface
   * @param jsonObj
   * @returns StructPropertyProps
   */
  public parseStructProperty(jsonObj: UnknownObject): StructPropertyProps {
    this.checkPropertyProps(jsonObj);
    this.checkPropertyTypename(jsonObj);
    return (jsonObj as unknown) as StructPropertyProps;
  }

  /**
   * Type checks PrimitiveArrayProperty and returns PrimitiveArrayPropertyProps interface
   * @param jsonObj
   * @returns PrimitiveArrayPropertyProps
   */
  public parsePrimitiveArrayProperty(jsonObj: UnknownObject): PrimitiveArrayPropertyProps {
    this.checkPrimitiveOrEnumPropertyBaseProps(jsonObj);
    this.checkPropertyMinAndMaxOccurs(jsonObj);
    return (jsonObj as unknown) as PrimitiveArrayPropertyProps;
  }

  /**
   * Type checks StructArrayProperty and returns StructArrayPropertyProps interface
   * @param jsonObj
   * @returns StructArrayPropertyProps
   */
  public parseStructArrayProperty(jsonObj: UnknownObject): StructArrayPropertyProps {
    this.checkPropertyProps(jsonObj);
    this.checkPropertyTypename(jsonObj);
    this.checkPropertyMinAndMaxOccurs(jsonObj);
    return (jsonObj as unknown) as StructArrayPropertyProps;
  }

  /**
   * Type checks NavigationProperty and returns NavigationPropertyProps interface
   * @param jsonObj
   * @returns NavigationPropertyProps
   */
  public parseNavigationProperty(jsonObj: UnknownObject): NavigationPropertyProps {
    this.checkPropertyProps(jsonObj);
    const fullname = `${this._currentItemFullName}.${jsonObj.name}`;

    if (undefined === jsonObj.relationshipName)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Navigation Property ${fullname} is missing the required 'relationshipName' property.`);
    if (typeof (jsonObj.relationshipName) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Navigation Property ${fullname} has an invalid 'relationshipName' property. It should be of type 'string'.`);

    if (undefined === jsonObj.direction)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Navigation Property ${fullname} is missing the required 'direction' property.`);
    if (typeof (jsonObj.direction) !== "string")
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Navigation Property ${fullname} has an invalid 'direction' property. It should be of type 'string'.`);

    return (jsonObj as unknown) as NavigationPropertyProps;
  }

  public getSchemaCustomAttributeProviders(): Iterable<CAProviderTuple> {
    return this.getCustomAttributeProviders(this._rawSchema, "Schema", this._schemaName);
  }

  public getClassCustomAttributeProviders(jsonObj: UnknownObject): Iterable<CAProviderTuple> {
    return this.getCustomAttributeProviders(jsonObj, "ECClass", this._currentItemFullName);
  }

  public getPropertyCustomAttributeProviders(jsonObj: UnknownObject): Iterable<CAProviderTuple> {
    return this.getCustomAttributeProviders(jsonObj, "ECProperty", `${this._currentItemFullName}.${jsonObj.name}`);
  }

  public getRelationshipConstraintCustomAttributeProviders(jsonObj: UnknownObject): [Iterable<CAProviderTuple> /* source */, Iterable<CAProviderTuple> /* target */] {
    const sourceCustomAttributes = this.getCustomAttributeProviders(jsonObj.source as UnknownObject, "Source Constraint of", this._currentItemFullName);
    const targetCustomAttributes = this.getCustomAttributeProviders(jsonObj.target as UnknownObject, "Target Constraint of", this._currentItemFullName);
    return [sourceCustomAttributes, targetCustomAttributes];
  }

  private *getCustomAttributeProviders(jsonObj: UnknownObject, type: string, name?: string): Iterable<CAProviderTuple> {
    if (undefined !== jsonObj.customAttributes) {
      if (!Array.isArray(jsonObj.customAttributes))
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${type} ${name} has an invalid 'customAttributes' attribute. It should be of type 'object[]'.`);

      for (const instance of jsonObj.customAttributes) {
        if (!isObject(instance) || Array.isArray(instance))
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ${type} ${name} has an invalid 'customAttributes' attribute. It should be of type 'object[]'.`);
        if (undefined === instance.className)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `A CustomAttribute in ${name}.customAttributes is missing the required 'className' attribute.`);
        if (typeof (instance.className) !== "string")
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `A CustomAttribute in ${name}.customAttributes has an invalid 'className' attribute. It should be of type 'string'.`);

        const provider = (_caClass: CustomAttributeClass) => {
          return instance as CustomAttribute;
        };

        const caTuple: CAProviderTuple = [instance.className, provider];
        yield caTuple;
      }
    }
  }
}
