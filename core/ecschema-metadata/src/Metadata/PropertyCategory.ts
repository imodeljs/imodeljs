/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

import { PropertyCategoryProps } from "../Deserialization/JsonProps";
import { SchemaItemType } from "../ECObjects";
import { Schema } from "./Schema";
import { SchemaItem } from "./SchemaItem";

/**
 * @beta
 */
export class PropertyCategory extends SchemaItem {
  public override readonly schemaItemType!: SchemaItemType.PropertyCategory; // eslint-disable-line
  protected _priority: number;

  public get priority() { return this._priority; }

  constructor(schema: Schema, name: string) {
    super(schema, name);
    this.schemaItemType = SchemaItemType.PropertyCategory;
    this._priority = 0;
  }

  /**
   * Save this PropertyCategory's properties to an object for serializing to JSON.
   * @param standalone Serialization includes only this object (as opposed to the full schema).
   * @param includeSchemaVersion Include the Schema's version information in the serialized object.
   */
  public override toJSON(standalone: boolean = false, includeSchemaVersion: boolean = false): PropertyCategoryProps {
    const schemaJson = super.toJSON(standalone, includeSchemaVersion) as any;
    schemaJson.priority = this.priority;
    return schemaJson;
  }

  /** @internal */
  public override async toXml(schemaXml: Document): Promise<Element> {
    const itemElement = await super.toXml(schemaXml);
    itemElement.setAttribute("priority", this.priority.toString());
    return itemElement;
  }

  public override fromJSONSync(propertyCategoryProps: PropertyCategoryProps) {
    super.fromJSONSync(propertyCategoryProps);
    this._priority = propertyCategoryProps.priority;
  }

  public override async fromJSON(propertyCategoryProps: PropertyCategoryProps) {
    this.fromJSONSync(propertyCategoryProps);
  }
  /**
   * @alpha
   * Used for schema editing.
   */
  protected setPriority(priority: number) {
    this._priority = priority;
  }
}

/**
 * @internal
 * An abstract class used for schema editing.
 */
export abstract class MutablePropertyCategory extends PropertyCategory {
  public abstract override setPriority(priority: number): void;
  public abstract override setDisplayLabel(displayLabel: string): void;
}
