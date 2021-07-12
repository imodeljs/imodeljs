/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import {
  ECObjectsError, ECObjectsStatus, Format, InvertedUnit, KindOfQuantityProps, OverrideFormat,
  SchemaItemKey, SchemaItemType, SchemaKey, Unit,
} from "@bentley/ecschema-metadata";
import { SchemaContextEditor, SchemaItemEditResults } from "./Editor";
import { MutableKindOfQuantity } from "./Mutable/MutableKindOfQuantity";

/**
 * @alpha
 * A class allowing you to create schema items of type KindOfQuantity.
 */
export class KindOfQuantities {
  public constructor(protected _schemaEditor: SchemaContextEditor) { }
  public async createFromProps(schemaKey: SchemaKey, koqProps: KindOfQuantityProps): Promise<SchemaItemEditResults> {
    const schema = await this._schemaEditor.getSchema(schemaKey);
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
