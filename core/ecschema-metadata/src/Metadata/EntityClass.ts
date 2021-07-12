/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

import { DelayedPromiseWithProps } from "../DelayedPromise";
import { EntityClassProps } from "../Deserialization/JsonProps";
import { XmlSerializationUtils } from "../Deserialization/XmlSerializationUtils";
import { ECClassModifier, parseStrengthDirection, SchemaItemType, StrengthDirection } from "../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "../Exception";
import { LazyLoadedMixin } from "../Interfaces";
import { SchemaItemKey } from "../SchemaKey";
import { ECClass } from "./Class";
import { Mixin } from "./Mixin";
import { AnyProperty, NavigationProperty, Property } from "./Property";
import { RelationshipClass } from "./RelationshipClass";
import { Schema } from "./Schema";

/**
 * A Typescript class representation of an ECEntityClass.
 * @beta
 */
export class EntityClass extends ECClass {
  public override readonly schemaItemType!: SchemaItemType.EntityClass; // eslint-disable-line
  protected _mixins?: LazyLoadedMixin[];

  constructor(schema: Schema, name: string, modifier?: ECClassModifier) {
    super(schema, name, modifier);
    this.schemaItemType = SchemaItemType.EntityClass;
  }

  public get mixins(): LazyLoadedMixin[] {
    if (!this._mixins)
      return [];
    return this._mixins;
  }

  public *getMixinsSync(): Iterable<Mixin> {
    if (!this._mixins)
      return function* (): Iterable<Mixin> { }(); // empty iterable

    for (const mixin of this._mixins) {
      const mObj = this.schema.lookupItemSync<Mixin>(mixin);
      if (mObj) {
        yield mObj;
      }
    }
  }

  /**
   *
   * @param mixin
   */
  protected addMixin(mixin: Mixin) {
    if (!this._mixins)
      this._mixins = [];

    this._mixins.push(new DelayedPromiseWithProps(mixin.key, async () => mixin));
    return;
  }

  /**
   * Searches the base class, if one exists, first then any mixins that exist for the property with the name provided.
   * @param name The name of the property to find.
   */
  public override async getInheritedProperty(name: string): Promise<AnyProperty | undefined> {
    let inheritedProperty = await super.getInheritedProperty(name);

    if (!inheritedProperty && this._mixins) {
      const mixinProps = await Promise.all(this._mixins.map(async (mixin) => (await mixin).getProperty(name)));
      mixinProps.some((prop) => {
        inheritedProperty = prop as AnyProperty;
        return inheritedProperty !== undefined;
      });
    }

    return inheritedProperty as AnyProperty | undefined;
  }

  /**
   * Searches the base class, if one exists, first then any mixins that exist for the property with the name provided.
   * @param name The name of the property to find.
   */
  public override getInheritedPropertySync(name: string): Property | undefined {
    const inheritedProperty = super.getInheritedPropertySync(name);
    if (inheritedProperty)
      return inheritedProperty;

    if (!this._mixins) {
      return undefined;
    }

    for (const mixin of this._mixins) {
      const mObj = this.schema.lookupItemSync<ECClass>(mixin);
      if (mObj) {
        const result = mObj.getPropertySync(name, true);
        if (result) {
          return result;
        }
      }
    }

    return undefined;
  }

  protected override async buildPropertyCache(result: Property[], existingValues?: Map<string, number>, resetBaseCaches: boolean = false): Promise<void> {
    if (!existingValues) {
      existingValues = new Map<string, number>();
    }

    if (this.baseClass) {
      ECClass.mergeProperties(result, existingValues, await (await this.baseClass).getProperties(resetBaseCaches), false);
    }

    for (const mixin of this.mixins) {
      ECClass.mergeProperties(result, existingValues, await (await mixin).getProperties(resetBaseCaches), false);
    }

    if (!this.properties)
      return;

    ECClass.mergeProperties(result, existingValues, [...this.properties], true);
  }

  protected override buildPropertyCacheSync(result: Property[], existingValues?: Map<string, number>, resetBaseCaches: boolean = false): void {
    if (!existingValues) {
      existingValues = new Map<string, number>();
    }

    const baseClass = this.getBaseClassSync();
    if (baseClass) {
      ECClass.mergeProperties(result, existingValues, baseClass.getPropertiesSync(resetBaseCaches), false);
    }

    for (const mixin of this.getMixinsSync()) {
      ECClass.mergeProperties(result, existingValues, mixin.getPropertiesSync(resetBaseCaches), false);
    }

    if (!this.properties)
      return;

    ECClass.mergeProperties(result, existingValues, [...this.properties], true);
  }

  /**
   *
   * @param name
   * @param relationship
   * @param direction
   */
  protected async createNavigationProperty(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<NavigationProperty> {
    return this.addProperty(await createNavigationProperty(this, name, relationship, direction));
  }

  /**
   *
   * @param name
   * @param relationship
   * @param direction
   */
  protected createNavigationPropertySync(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): NavigationProperty {
    return this.addProperty(createNavigationPropertySync(this, name, relationship, direction));
  }

  /**
   * Save this EntityClass' properties to an object for serializing to JSON.
   * @param standalone Serialization includes only this object (as opposed to the full schema).
   * @param includeSchemaVersion Include the Schema's version information in the serialized object.
   */
  public override toJSON(standalone: boolean = false, includeSchemaVersion: boolean = false): EntityClassProps {
    const schemaJson = super.toJSON(standalone, includeSchemaVersion) as any;
    if (this.mixins.length > 0)
      schemaJson.mixins = this.mixins.map((mixin) => mixin.fullName);
    return schemaJson;
  }

  /** @internal */
  public override async toXml(schemaXml: Document): Promise<Element> {
    const itemElement = await super.toXml(schemaXml);

    for (const mixin of this.getMixinsSync()) {
      const mixinElement = schemaXml.createElement("BaseClass");
      const mixinName = XmlSerializationUtils.createXmlTypedName(this.schema, mixin.schema, mixin.name);
      mixinElement.textContent = mixinName;
      itemElement.appendChild(mixinElement);
    }
    return itemElement;
  }

  public override async fromJSON(entityClassProps: EntityClassProps) {
    this.fromJSONSync(entityClassProps);
  }

  public override fromJSONSync(entityClassProps: EntityClassProps) {
    super.fromJSONSync(entityClassProps);

    if (undefined !== entityClassProps.mixins) {
      if (!this._mixins)
        this._mixins = [];
      for (const name of entityClassProps.mixins) {
        const mixinSchemaItemKey = this.schema.getSchemaItemKey(name);
        if (!mixinSchemaItemKey)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECEntityClass ${this.name} has a mixin ("${name}") that cannot be found.`);
        this._mixins.push(new DelayedPromiseWithProps<SchemaItemKey, Mixin>(mixinSchemaItemKey,
          async () => {
            const mixin = await this.schema.lookupItem<Mixin>(mixinSchemaItemKey);
            if (undefined === mixin)
              throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The ECEntityClass ${this.name} has a mixin ("${name}") that cannot be found.`);
            return mixin;
          }));
      }
    }
  }
}

/**
 * Hackish approach that works like a "friend class" so we can access protected members without making them public.
 * @internal
 */
export abstract class MutableEntityClass extends EntityClass {
  public abstract override addMixin(mixin: Mixin): any;
  public abstract override createNavigationProperty(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<NavigationProperty>;
  public abstract override createNavigationPropertySync(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): NavigationProperty;
  public abstract override setDisplayLabel(displayLabel: string): void;
}

/** @internal */
export async function createNavigationProperty(ecClass: ECClass, name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<NavigationProperty> {
  if (await ecClass.getProperty(name))
    throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${ecClass.name}.`);

  let resolvedRelationship: RelationshipClass | undefined;
  if (typeof (relationship) === "string") {
    resolvedRelationship = await ecClass.schema.lookupItem<RelationshipClass>(relationship);
  } else
    resolvedRelationship = relationship;

  if (!resolvedRelationship)
    throw new ECObjectsError(ECObjectsStatus.InvalidType, `The provided RelationshipClass, ${relationship}, is not a valid RelationshipClassInterface.`);

  if (typeof (direction) === "string") {
    const tmpDirection = parseStrengthDirection(direction);
    if (undefined === tmpDirection)
      throw new ECObjectsError(ECObjectsStatus.InvalidStrengthDirection, `The provided StrengthDirection, ${direction}, is not a valid StrengthDirection.`);
    direction = tmpDirection;
  }

  const lazyRelationship = new DelayedPromiseWithProps(resolvedRelationship.key, async () => resolvedRelationship!);
  return new NavigationProperty(ecClass, name, lazyRelationship, direction);
}

/** @internal */
export function createNavigationPropertySync(ecClass: ECClass, name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): NavigationProperty {
  if (ecClass.getPropertySync(name))
    throw new ECObjectsError(ECObjectsStatus.DuplicateProperty, `An ECProperty with the name ${name} already exists in the class ${ecClass.name}.`);

  let resolvedRelationship: RelationshipClass | undefined;
  if (typeof (relationship) === "string") {
    resolvedRelationship = ecClass.schema.lookupItemSync<RelationshipClass>(relationship);
  } else
    resolvedRelationship = relationship;

  if (!resolvedRelationship)
    throw new ECObjectsError(ECObjectsStatus.InvalidType, `The provided RelationshipClass, ${relationship}, is not a valid RelationshipClassInterface.`);

  if (typeof (direction) === "string") {
    const tmpDirection = parseStrengthDirection(direction);
    if (undefined === tmpDirection)
      throw new ECObjectsError(ECObjectsStatus.InvalidStrengthDirection, `The provided StrengthDirection, ${direction}, is not a valid StrengthDirection.`);
    direction = tmpDirection;
  }

  const lazyRelationship = new DelayedPromiseWithProps(resolvedRelationship.key, async () => resolvedRelationship!);
  return new NavigationProperty(ecClass, name, lazyRelationship, direction);
}
