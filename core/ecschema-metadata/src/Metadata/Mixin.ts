/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

import { DelayedPromiseWithProps } from "../DelayedPromise";
import { MixinProps } from "../Deserialization/JsonProps";
import { XmlSerializationUtils } from "../Deserialization/XmlSerializationUtils";
import { ECClassModifier, SchemaItemType, StrengthDirection } from "../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "../Exception";
import { LazyLoadedEntityClass } from "../Interfaces";
import { SchemaItemKey } from "../SchemaKey";
import { ECClass } from "./Class";
import { createNavigationProperty, createNavigationPropertySync, EntityClass } from "./EntityClass";
import { NavigationProperty } from "./Property";
import { RelationshipClass } from "./RelationshipClass";
import { Schema } from "./Schema";

/**
 * A Typescript class representation of a Mixin.
 * @beta
 */
export class Mixin extends ECClass {
  public override readonly schemaItemType!: SchemaItemType.Mixin; // eslint-disable-line
  protected _appliesTo?: LazyLoadedEntityClass;

  public get appliesTo(): LazyLoadedEntityClass | undefined {
    return this._appliesTo;
  }

  constructor(schema: Schema, name: string) {
    super(schema, name, ECClassModifier.Abstract);
    this.schemaItemType = SchemaItemType.Mixin;
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

  protected createNavigationPropertySync(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): NavigationProperty {
    return this.addProperty(createNavigationPropertySync(this, name, relationship, direction));
  }

  /**
   * @alpha Used for schema editing.
   */
  protected setAppliesTo(appliesTo: LazyLoadedEntityClass) {
    this._appliesTo = appliesTo;
  }
  /**
   * Save this Mixin's properties to an object for serializing to JSON.
   * @param standalone Serialization includes only this object (as opposed to the full schema).
   * @param includeSchemaVersion Include the Schema's version information in the serialized object.
   */
  public override toJSON(standalone: boolean = false, includeSchemaVersion: boolean = false): MixinProps {
    const schemaJson = super.toJSON(standalone, includeSchemaVersion) as any;
    if (undefined !== this.appliesTo) {
      schemaJson.appliesTo = this.appliesTo.fullName;
    }
    return schemaJson;
  }

  /** @internal */
  public override async toXml(schemaXml: Document): Promise<Element> {
    const itemElement = await super.toXml(schemaXml);

    // When CustomAttributes are added, there must be a check to see if the ECCustomAttributes
    // already exist for this item before creating a new one to apply IsMixin
    const customAttributes = schemaXml.createElement("ECCustomAttributes");
    const isMixinElement = schemaXml.createElement("IsMixin");
    const coreCustomSchema = this.schema.getReferenceSync("CoreCustomAttributes");
    if (undefined !== coreCustomSchema) {
      const xmlns = `CoreCustomAttributes.${coreCustomSchema.schemaKey.version.toString()}`;
      isMixinElement.setAttribute("xmlns", xmlns);
    }

    const appliesToElement = schemaXml.createElement("AppliesToEntityClass");
    const appliesTo = await this.appliesTo;
    if (undefined !== appliesTo) {
      const appliesToName = XmlSerializationUtils.createXmlTypedName(this.schema, appliesTo.schema, appliesTo.name);
      appliesToElement.textContent = appliesToName;
      isMixinElement.appendChild(appliesToElement);
    }

    customAttributes.appendChild(isMixinElement);
    itemElement.appendChild(customAttributes);

    return itemElement;
  }

  public override fromJSONSync(mixinProps: MixinProps) {
    super.fromJSONSync(mixinProps);
    const entityClassSchemaItemKey = this.schema.getSchemaItemKey(mixinProps.appliesTo);
    if (!entityClassSchemaItemKey)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the appliesTo ${mixinProps.appliesTo}.`);
    this._appliesTo = new DelayedPromiseWithProps<SchemaItemKey, EntityClass>(entityClassSchemaItemKey,
      async () => {
        const appliesTo = await this.schema.lookupItem<EntityClass>(entityClassSchemaItemKey);
        if (undefined === appliesTo)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the appliesTo ${mixinProps.appliesTo}.`);
        return appliesTo;
      });
  }

  public override async fromJSON(mixinProps: MixinProps) {
    this.fromJSONSync(mixinProps);
  }

  public async applicableTo(entityClass: EntityClass) {
    if (!this.appliesTo)
      throw new ECObjectsError(ECObjectsStatus.InvalidType, `appliesTo is undefined in the class ${this.fullName}.`);

    const appliesTo = await this.appliesTo;
    if (appliesTo === undefined)
      throw new ECObjectsError(ECObjectsStatus.InvalidType, `Unable to locate the appliesTo ${this.appliesTo.fullName}.`);

    return appliesTo.is(entityClass);
  }
}
/**
 * @internal
 * An abstract class used for schema editing.
 */
export abstract class MutableMixin extends Mixin {
  public abstract override setAppliesTo(entityClass: LazyLoadedEntityClass): void;
  public abstract override createNavigationProperty(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): Promise<NavigationProperty>;
  public abstract override createNavigationPropertySync(name: string, relationship: string | RelationshipClass, direction: string | StrengthDirection): NavigationProperty;
  public abstract override setDisplayLabel(displayLabel: string): void;
}
