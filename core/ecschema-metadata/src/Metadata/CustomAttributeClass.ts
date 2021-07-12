/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

import { CustomAttributeClassProps } from "../Deserialization/JsonProps";
import {
  containerTypeToString, CustomAttributeContainerType, ECClassModifier, parseCustomAttributeContainerType, SchemaItemType,
} from "../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "../Exception";
import { ECClass } from "./Class";
import { Schema } from "./Schema";

/**
 * A Typescript class representation of an ECCustomAttributeClass.
 * @beta
 */
export class CustomAttributeClass extends ECClass {
  public override readonly schemaItemType!: SchemaItemType.CustomAttributeClass; // eslint-disable-line
  protected _containerType?: CustomAttributeContainerType;

  public get containerType(): CustomAttributeContainerType {
    if (undefined === this._containerType)
      throw new ECObjectsError(ECObjectsStatus.InvalidContainerType, `The CustomAttributeClass ${this.name} does not have a CustomAttributeContainerType.`);
    return this._containerType;
  }

  constructor(schema: Schema, name: string, modifier?: ECClassModifier) {
    super(schema, name, modifier);
    this.schemaItemType = SchemaItemType.CustomAttributeClass;
  }

  /**
   * Save this CustomAttributeClasses properties to an object for serializing to JSON.
   * @param standalone Serialization includes only this object (as opposed to the full schema).
   * @param includeSchemaVersion Include the Schema's version information in the serialized object.
   */
  public override toJSON(standalone: boolean = false, includeSchemaVersion: boolean = false): CustomAttributeClassProps {
    const schemaJson = super.toJSON(standalone, includeSchemaVersion) as any;
    schemaJson.appliesTo = containerTypeToString(this.containerType);
    return schemaJson as CustomAttributeClassProps;
  }

  /** @internal */
  public override async toXml(schemaXml: Document): Promise<Element> {
    const itemElement = await super.toXml(schemaXml);
    itemElement.setAttribute("appliesTo", containerTypeToString(this.containerType));
    return itemElement;
  }

  public override fromJSONSync(customAttributeProps: CustomAttributeClassProps) {
    super.fromJSONSync(customAttributeProps);
    const containerType = parseCustomAttributeContainerType(customAttributeProps.appliesTo);
    if (undefined === containerType)
      throw new ECObjectsError(ECObjectsStatus.InvalidContainerType, `${containerType} is not a valid CustomAttributeContainerType.`);
    this._containerType = containerType;
  }

  public override async fromJSON(customAttributeProps: CustomAttributeClassProps) {
    this.fromJSONSync(customAttributeProps);
  }

  /**
   * @alpha Used in schema editing.
   */
  protected setContainerType(containerType: CustomAttributeContainerType) {
    this._containerType = containerType;
  }
}
/**
 * @internal
 * An abstract class used for Schema editing.
 */
export abstract class MutableCAClass extends CustomAttributeClass {
  public abstract override setContainerType(containerType: CustomAttributeContainerType): void;
  public abstract override setDisplayLabel(displayLabel: string): void;
}
