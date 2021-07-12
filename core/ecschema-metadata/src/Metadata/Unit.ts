/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

import { DelayedPromiseWithProps } from "../DelayedPromise";
import { UnitProps } from "../Deserialization/JsonProps";
import { XmlSerializationUtils } from "../Deserialization/XmlSerializationUtils";
import { SchemaItemType } from "../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "../Exception";
import { LazyLoadedPhenomenon, LazyLoadedUnitSystem } from "../Interfaces";
import { SchemaItemKey } from "../SchemaKey";
import { Phenomenon } from "./Phenomenon";
import { Schema } from "./Schema";
import { SchemaItem } from "./SchemaItem";
import { UnitSystem } from "./UnitSystem";

/**
 * An abstract class that adds the ability to define Units and everything that goes with them, within an ECSchema as a
 * first-class concept is to allow the iModel to not be dependent on any hard-coded Units
 * @beta
 */
export class Unit extends SchemaItem {
  public override readonly schemaItemType!: SchemaItemType.Unit; // eslint-disable-line
  protected _phenomenon?: LazyLoadedPhenomenon;
  protected _unitSystem?: LazyLoadedUnitSystem;
  protected _definition: string;
  protected _numerator: number;
  protected _denominator: number;
  protected _offset: number;

  constructor(schema: Schema, name: string) {
    super(schema, name);
    this.schemaItemType = SchemaItemType.Unit;
    this._definition = "";
    this._numerator = 1.0;
    this._denominator = 1.0;
    this._offset = 0.0;
  }

  public get phenomenon(): LazyLoadedPhenomenon | undefined { return this._phenomenon; }
  public get unitSystem(): LazyLoadedUnitSystem | undefined { return this._unitSystem; }
  public get definition(): string { return this._definition; }
  public get numerator(): number { return this._numerator; }
  public get offset(): number { return this._offset; }
  public get denominator(): number { return this._denominator; }

  /**
   * Returns true if a conversion can be calculated between the input units
   * @alpha
   */
  public static async areCompatible(unitA: Unit, unitB: Unit): Promise<boolean> {
    const unitAPhenomenon = await unitA.phenomenon;
    const unitBPhenomenon = await unitB.phenomenon;

    if (!unitAPhenomenon || !unitBPhenomenon || !unitAPhenomenon.key.matches(unitBPhenomenon.key))
      return false;
    return true;
  }

  /**
   * Save this Unit's properties to an object for serializing to JSON.
   * @param standalone Serialization includes only this object (as opposed to the full schema).
   * @param includeSchemaVersion Include the Schema's version information in the serialized object.
   */
  public override toJSON(standalone: boolean = false, includeSchemaVersion: boolean = false): UnitProps {
    const schemaJson = super.toJSON(standalone, includeSchemaVersion) as any;
    schemaJson.phenomenon = this.phenomenon!.fullName;
    schemaJson.unitSystem = this.unitSystem!.fullName;
    schemaJson.definition = this.definition;
    if (undefined !== this.numerator)
      schemaJson.numerator = this.numerator;
    if (undefined !== this.denominator)
      schemaJson.denominator = this.denominator;
    if (undefined !== this.offset)
      schemaJson.offset = this.offset;
    return schemaJson;
  }

  /** @internal */
  public override async toXml(schemaXml: Document): Promise<Element> {
    const itemElement = await super.toXml(schemaXml);

    const phenomenon = await this.phenomenon;
    if (undefined !== phenomenon) {
      const phenomenonName = XmlSerializationUtils.createXmlTypedName(this.schema, phenomenon.schema, phenomenon.name);
      itemElement.setAttribute("phenomenon", phenomenonName);
    }

    const unitSystem = await this.unitSystem;
    if (undefined !== unitSystem) {
      const unitSystemName = XmlSerializationUtils.createXmlTypedName(this.schema, unitSystem.schema, unitSystem.name);
      itemElement.setAttribute("unitSystem", unitSystemName);
    }

    itemElement.setAttribute("definition", this.definition);
    itemElement.setAttribute("numerator", this.numerator.toString());
    itemElement.setAttribute("denominator", this.denominator.toString());
    itemElement.setAttribute("offset", this.offset.toString());

    return itemElement;
  }

  public override fromJSONSync(unitProps: UnitProps) {
    super.fromJSONSync(unitProps);

    const phenomenonSchemaItemKey = this.schema.getSchemaItemKey(unitProps.phenomenon);
    if (!phenomenonSchemaItemKey)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the phenomenon ${unitProps.phenomenon}.`);
    this._phenomenon = new DelayedPromiseWithProps<SchemaItemKey, Phenomenon>(phenomenonSchemaItemKey,
      async () => {
        const phenom = await this.schema.lookupItem<Phenomenon>(phenomenonSchemaItemKey);
        if (undefined === phenom)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the phenomenon ${unitProps.phenomenon}.`);
        return phenom;
      });

    const unitSystemSchemaItemKey = this.schema.getSchemaItemKey(unitProps.unitSystem);
    if (!unitSystemSchemaItemKey)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the unitSystem ${unitProps.unitSystem}.`);
    this._unitSystem = new DelayedPromiseWithProps<SchemaItemKey, UnitSystem>(unitSystemSchemaItemKey,
      async () => {
        const unitSystem = await this.schema.lookupItem<UnitSystem>(unitSystemSchemaItemKey);
        if (undefined === unitSystem)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `Unable to locate the unitSystem ${unitProps.unitSystem}.`);
        return unitSystem;
      });

    if (this._definition !== "" && unitProps.definition.toLowerCase() !== this._definition.toLowerCase())
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Unit ${this.name} has an invalid 'definition' attribute.`);
    else if (this._definition === "")
      this._definition = unitProps.definition;

    if (undefined !== unitProps.numerator) {
      if (unitProps.numerator !== this._numerator)
        this._numerator = unitProps.numerator;
    }

    if (undefined !== unitProps.denominator) {
      if (unitProps.denominator !== this._denominator)
        this._denominator = unitProps.denominator;
    }

    if (undefined !== unitProps.offset) {
      if (unitProps.offset !== this._offset)
        this._offset = unitProps.offset;
    }
  }

  public override async fromJSON(unitProps: UnitProps) {
    this.fromJSONSync(unitProps);
  }

  /**
   * @alpha
   * Used for schema editing.
   */
  protected async setPhenomenon(phenomenon: LazyLoadedPhenomenon) {
    this._phenomenon = phenomenon;
  }

  /**
   * @alpha
   * Used for schema editing.
   */
  protected async setUnitSystem(unitSystem: LazyLoadedUnitSystem) {
    this._unitSystem = unitSystem;
  }

  /**
   * @alpha
   * Used for schema editing.
   */
  protected async setDefinition(definition: string) {
    this._definition = definition;
  }
}
/**
 * @internal
 * An abstract class used for schema editing.
 */
export abstract class MutableUnit extends Unit {
  public abstract override setPhenomenon(phenomenon: LazyLoadedPhenomenon): Promise<void>;
  public abstract override setUnitSystem(unitSystem: LazyLoadedUnitSystem): Promise<void>;
  public abstract override setDefinition(definition: string): Promise<void>;
  public abstract override setDisplayLabel(displayLabel: string): void;
}
