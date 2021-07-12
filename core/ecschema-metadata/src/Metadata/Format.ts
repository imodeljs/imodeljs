/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

import { FormatProps } from "../Deserialization/JsonProps";
import { XmlSerializationUtils } from "../Deserialization/XmlSerializationUtils";
import { SchemaItemType } from "../ECObjects";
import { ECObjectsError, ECObjectsStatus } from "../Exception";
import {
  DecimalPrecision, FormatTraits, formatTraitsToArray, FormatType, formatTypeToString, FractionalPrecision, parseFormatTrait, parseFormatType,
  parsePrecision, parseScientificType, parseShowSignOption, ScientificType, scientificTypeToString, ShowSignOption, showSignOptionToString,
} from "../utils/FormatEnums";
import { InvertedUnit } from "./InvertedUnit";
import { Schema } from "./Schema";
import { SchemaItem } from "./SchemaItem";
import { Unit } from "./Unit";

/**
 * @beta
 */
export class Format extends SchemaItem {
  public override readonly schemaItemType!: SchemaItemType.Format; // eslint-disable-line
  protected _roundFactor: number;
  protected _type: FormatType; // required; options are decimal, fractional, scientific, station
  protected _precision: number; // required
  protected _showSignOption: ShowSignOption; // options: noSign, onlyNegative, signAlways, negativeParentheses
  protected _decimalSeparator: string; // optional; default is based on current locale.... TODO: Default is based on current locale
  protected _thousandSeparator: string; // optional; default is based on current locale.... TODO: Default is based on current locale
  protected _uomSeparator: string; // optional; default is " "; defined separator between magnitude and the unit
  protected _stationSeparator: string; // optional; default is "+"
  protected _formatTraits: FormatTraits;
  protected _spacer: string; // optional; default is " "
  protected _includeZero: boolean; // optional; default is true
  protected _minWidth?: number; // optional; positive int
  protected _scientificType?: ScientificType; // required if type is scientific; options: normalized, zeroNormalized
  protected _stationOffsetSize?: number; // required when type is station; positive integer > 0
  protected _units?: Array<[Unit | InvertedUnit, string | undefined]>;

  constructor(schema: Schema, name: string) {
    super(schema, name);
    this.schemaItemType = SchemaItemType.Format;

    this._roundFactor = 0.0;
    this._type = FormatType.Decimal;
    this._precision = DecimalPrecision.Six;
    this._showSignOption = ShowSignOption.OnlyNegative;
    this._decimalSeparator = ".";
    this._thousandSeparator = ",";
    this._uomSeparator = " ";
    this._stationSeparator = "+";
    this._formatTraits = 0x0;
    this._spacer = " ";
    this._includeZero = true;
  }

  public get roundFactor(): number { return this._roundFactor; }
  public get type(): FormatType { return this._type; }
  public get precision(): DecimalPrecision | FractionalPrecision { return this._precision; }
  public get minWidth(): number | undefined { return this._minWidth; }
  public get scientificType(): ScientificType | undefined { return this._scientificType; }
  public get showSignOption(): ShowSignOption { return this._showSignOption; }
  public get decimalSeparator(): string { return this._decimalSeparator; }
  public get thousandSeparator(): string { return this._thousandSeparator; }
  public get uomSeparator(): string { return this._uomSeparator; }
  public get stationSeparator(): string { return this._stationSeparator; }
  public get stationOffsetSize(): number | undefined { return this._stationOffsetSize; }
  public get formatTraits(): FormatTraits { return this._formatTraits; }
  public get spacer(): string | undefined { return this._spacer; }
  public get includeZero(): boolean | undefined { return this._includeZero; }
  public get units(): Array<[Unit | InvertedUnit, string | undefined]> | undefined { return this._units; }

  private parseFormatTraits(formatTraitsFromJson: string | string[]) {
    const formatTraits = Array.isArray(formatTraitsFromJson) ? formatTraitsFromJson : formatTraitsFromJson.split(/,|;|\|/);
    for (const traitStr of formatTraits) {
      const formatTrait = parseFormatTrait(traitStr);
      if (undefined === formatTrait)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'formatTraits' attribute. The string '${traitStr}' is not a valid format trait.`);
      this._formatTraits = this._formatTraits | formatTrait;
    }
  }

  public hasFormatTrait(formatTrait: FormatTraits) {
    return (this._formatTraits & formatTrait) === formatTrait;
  }

  /**
   * Adds a Unit, or InvertedUnit, with an optional label override.
   * @param unit The Unit, or InvertedUnit, to add to this Format.
   * @param label A label that overrides the label defined within the Unit when a value is formatted.
   */
  protected addUnit(unit: Unit | InvertedUnit, label?: string) {
    if (undefined === this._units)
      this._units = [];
    else { // Validate that a duplicate is not added.
      for (const existingUnit of this._units) {
        if (unit.fullName.toLowerCase() === existingUnit[0].fullName.toLowerCase())
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has duplicate units, '${unit.fullName}'.`); // TODO: Validation - this should be a validation error not a hard failure.
      }
    }

    this._units.push([unit, label]);
  }

  protected setPrecision(precision: number) { this._precision = precision; }

  private typecheck(formatProps: FormatProps) {
    const formatType = parseFormatType(formatProps.type);
    if (undefined === formatType)
      throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'type' attribute.`);
    this._type = formatType;

    if (undefined !== formatProps.precision) {
      if (!Number.isInteger(formatProps.precision)) // must be an integer
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'precision' attribute. It should be an integer.`);
      const precision = parsePrecision(formatProps.precision, this._type);
      if (undefined === precision)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'precision' attribute.`);
      this._precision = precision;
    }

    if (undefined !== formatProps.minWidth) {
      if (!Number.isInteger(formatProps.minWidth) || formatProps.minWidth < 0) // must be a positive int
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'minWidth' attribute. It should be a positive integer.`);
      this._minWidth = formatProps.minWidth;
    }

    if (FormatType.Scientific === this.type) {
      if (undefined === formatProps.scientificType) // if format type is scientific and scientific type is undefined, throw
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} is 'Scientific' type therefore the attribute 'scientificType' is required.`);
      const scientificType = parseScientificType(formatProps.scientificType);
      if (undefined === scientificType)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'scientificType' attribute.`);
      this._scientificType = scientificType;
    }

    if (FormatType.Station === this.type) {
      if (undefined === formatProps.stationOffsetSize)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} is 'Station' type therefore the attribute 'stationOffsetSize' is required.`);
      if (!Number.isInteger(formatProps.stationOffsetSize) || formatProps.stationOffsetSize < 0) // must be a positive int > 0
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'stationOffsetSize' attribute. It should be a positive integer.`);
      this._stationOffsetSize = formatProps.stationOffsetSize;
    }

    if (undefined !== formatProps.showSignOption) {
      const signOption = parseShowSignOption(formatProps.showSignOption);
      if (undefined === signOption)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'showSignOption' attribute.`);
      this._showSignOption = signOption;
    }

    if (undefined !== formatProps.formatTraits && formatProps.formatTraits.length !== 0)
      this.parseFormatTraits(formatProps.formatTraits);

    if (undefined !== formatProps.roundFactor)
      this._roundFactor = formatProps.roundFactor;

    if (undefined !== formatProps.decimalSeparator) {
      if (formatProps.decimalSeparator.length > 1)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'decimalSeparator' attribute. It should be an empty or one character string.`);
      this._decimalSeparator = formatProps.decimalSeparator;
    }

    if (undefined !== formatProps.thousandSeparator) {
      if (formatProps.thousandSeparator.length > 1)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'thousandSeparator' attribute. It should be an empty or one character string.`);
      this._thousandSeparator = formatProps.thousandSeparator;
    }

    if (undefined !== formatProps.uomSeparator) {
      if (formatProps.uomSeparator.length > 1)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'uomSeparator' attribute. It should be an empty or one character string.`);
      this._uomSeparator = formatProps.uomSeparator;
    }

    if (undefined !== formatProps.stationSeparator) {
      if (formatProps.stationSeparator.length > 1)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'stationSeparator' attribute. It should be an empty or one character string.`);
      this._stationSeparator = formatProps.stationSeparator;
    }

    if (undefined !== formatProps.composite) { // TODO: This is duplicated below when the units need to be processed...
      if (undefined !== formatProps.composite.includeZero)
        this._includeZero = formatProps.composite.includeZero;

      if (undefined !== formatProps.composite.spacer) {
        if (formatProps.composite.spacer.length > 1)
          throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has a composite with an invalid 'spacer' attribute. It should be an empty or one character string.`);
        this._spacer = formatProps.composite.spacer;
      }

      // Composite requires 1-4 units
      if (formatProps.composite.units.length <= 0 || formatProps.composite.units.length > 4)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, `The Format ${this.fullName} has an invalid 'Composite' attribute. It should have 1-4 units.`);
    }
  }

  public override fromJSONSync(formatProps: FormatProps) {
    super.fromJSONSync(formatProps);
    this.typecheck(formatProps);
    if (undefined === formatProps.composite)
      return;

    // Units are separated from the rest of the deserialization because of the need to have separate sync and async implementation
    for (const unit of formatProps.composite.units) {
      const newUnit = this.schema.lookupItemSync<Unit | InvertedUnit>(unit.name);
      if (undefined === newUnit)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, ``);
      this.addUnit(newUnit, unit.label);
    }
  }

  public override async fromJSON(formatProps: FormatProps) {
    await super.fromJSON(formatProps);
    this.typecheck(formatProps);
    if (undefined === formatProps.composite)
      return;

    // Units are separated from the rest of the deserialization because of the need to have separate sync and async implementation
    for (const unit of formatProps.composite.units) {
      const newUnit = await this.schema.lookupItem<Unit | InvertedUnit>(unit.name);
      if (undefined === newUnit)
        throw new ECObjectsError(ECObjectsStatus.InvalidECJson, ``);
      this.addUnit(newUnit, unit.label);
    }
  }

  /**
   * Save this Format's properties to an object for serializing to JSON.
   * @param standalone Serialization includes only this object (as opposed to the full schema).
   * @param includeSchemaVersion Include the Schema's version information in the serialized object.
   */
  public override toJSON(standalone: boolean = false, includeSchemaVersion: boolean = false): FormatProps {
    const schemaJson = super.toJSON(standalone, includeSchemaVersion) as any;
    schemaJson.type = formatTypeToString(this.type);
    schemaJson.precision = this.precision;

    // this._spacer = " ";
    // this._includeZero = true;

    // Serialize the minimal amount of information needed so anything that is the same as the default, do not serialize.
    if (0.0 !== this.roundFactor) schemaJson.roundFactor = this.roundFactor;
    if (ShowSignOption.OnlyNegative !== this.showSignOption) schemaJson.showSignOption = showSignOptionToString(this.showSignOption);
    if (0x0 !== this.formatTraits) schemaJson.formatTraits = formatTraitsToArray(this.formatTraits);
    if ("." !== this.decimalSeparator) schemaJson.decimalSeparator = this.decimalSeparator;
    if ("," !== this.thousandSeparator) schemaJson.thousandSeparator = this.thousandSeparator;
    if (" " !== this.uomSeparator) schemaJson.uomSeparator = this.uomSeparator;

    if (undefined !== this.minWidth) schemaJson.minWidth = this.minWidth;

    if (FormatType.Scientific === this.type && undefined !== this.scientificType)
      schemaJson.scientificType = scientificTypeToString(this.scientificType);

    if (FormatType.Station === this.type) {
      if (undefined !== this.stationOffsetSize)
        schemaJson.stationOffsetSize = this.stationOffsetSize;
      if (" " !== this.stationSeparator)
        schemaJson.stationSeparator = this.stationSeparator;
    }

    if (undefined === this.units)
      return schemaJson;

    schemaJson.composite = {};

    if (" " !== this.spacer) schemaJson.composite.spacer = this.spacer;
    if (true !== this.includeZero) schemaJson.composite.includeZero = this.includeZero;

    schemaJson.composite.units = [];
    for (const unit of this.units) {
      schemaJson.composite.units.push({
        name: unit[0].fullName,
        label: unit[1],
      });
    }

    return schemaJson;
  }

  /** @internal */
  public override async toXml(schemaXml: Document): Promise<Element> {
    const itemElement = await super.toXml(schemaXml);
    itemElement.setAttribute("type", formatTypeToString(this.type).toLowerCase());
    itemElement.setAttribute("precision", this.precision.toString());
    itemElement.setAttribute("roundFactor", this.roundFactor.toString());
    itemElement.setAttribute("showSignOption", showSignOptionToString(this.showSignOption));
    itemElement.setAttribute("decimalSeparator", this.decimalSeparator);
    itemElement.setAttribute("thousandSeparator", this.thousandSeparator);
    itemElement.setAttribute("uomSeparator", this.uomSeparator);
    itemElement.setAttribute("stationSeparator", this.stationSeparator);

    if (undefined !== this.minWidth)
      itemElement.setAttribute("minWidth", this.minWidth.toString());
    if (undefined !== this.scientificType)
      itemElement.setAttribute("scientificType", scientificTypeToString(this.scientificType));
    if (undefined !== this.stationOffsetSize)
      itemElement.setAttribute("stationOffsetSize", this.stationOffsetSize.toString());

    const formatTraits = formatTraitsToArray(this.formatTraits);
    if (formatTraits.length > 0)
      itemElement.setAttribute("formatTraits", formatTraits.join("|"));

    if (undefined !== this.units) {
      const compositeElement = schemaXml.createElement("Composite");
      if (undefined !== this.spacer)
        compositeElement.setAttribute("spacer", this.spacer);
      if (undefined !== this.includeZero)
        compositeElement.setAttribute("includeZero", this.includeZero.toString());

      this.units.forEach(([unit, label]) => {
        const unitElement = schemaXml.createElement("Unit");
        if (undefined !== label)
          unitElement.setAttribute("label", label);
        const unitName = XmlSerializationUtils.createXmlTypedName(this.schema, unit.schema, unit.name);
        unitElement.textContent = unitName;
        compositeElement.appendChild(unitElement);
      });

      itemElement.appendChild(compositeElement);
    }

    return itemElement;
  }

  /**
   * @alpha Used in schema editing.
   */
  protected setFormatType(formatType: FormatType) {
    this._type = formatType;
  }

  /**
   * @alpha Used in schema editing.
   */
  protected setRoundFactor(roundFactor: number) {
    this._roundFactor = roundFactor;
  }

  /**
   * @alpha Used in schema editing.
   */
  protected setShowSignOption(signOption: ShowSignOption) {
    this._showSignOption = signOption;
  }

  /**
   * @alpha Used in schema editing.
   */
  protected setDecimalSeparator(separator: string) {
    this._decimalSeparator = separator;
  }

  /**
   * @alpha Used in schema editing.
   */
  protected setThousandSeparator(separator: string) {
    this._thousandSeparator = separator;
  }

  /**
   * @alpha Used in schema editing.
   */
  protected setUomSeparator(separator: string) {
    this._uomSeparator = separator;
  }

  /**
   * @alpha Used in schema editing.
   */
  protected setStationSeparator(separator: string) {
    this._stationSeparator = separator;
  }
}

/**
 * @internal
 * An abstract class used for schema editing.
 */
export abstract class MutableFormat extends Format {
  public abstract override addUnit(unit: Unit | InvertedUnit, label?: string): void;
  public abstract override setPrecision(precision: number): void;
  public abstract override setFormatType(formatType: FormatType): void;
  public abstract override setRoundFactor(roundFactor: number): void;
  public abstract override setShowSignOption(signOption: ShowSignOption): void;
  public abstract override setDecimalSeparator(separator: string): void;
  public abstract override setThousandSeparator(separator: string): void;
  public abstract override setUomSeparator(separator: string): void;
  public abstract override setStationSeparator(separator: string): void;
  public abstract override setDisplayLabel(displayLabel: string): void;
}
