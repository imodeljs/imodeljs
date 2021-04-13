/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

import { XmlSerializationUtils } from "../Deserialization/XmlSerializationUtils";
import { SchemaItemType } from "../ECObjects";
import { DecimalPrecision, FormatTraits, FormatType, FractionalPrecision, ScientificType, ShowSignOption } from "@bentley/imodeljs-quantity";
import { Format } from "./Format";
import { InvertedUnit } from "./InvertedUnit";
import { Schema } from "./Schema";
import { Unit } from "./Unit";

/**
 * Overrides of a Format, from a Schema, and is SchemaItem that is used specifically on KindOfQuantity.
 * @beta
 */
export class OverrideFormat {
  private _precision?: DecimalPrecision | FractionalPrecision;
  private _units?: Array<[Unit | InvertedUnit, string | undefined]>;

  /** The Format that this OverrideFormat is extending */
  public readonly parent: Format;

  /** The name of this OverrideFormat.
   *
   * This should be set to the [FormatString]($docs/bis/ec/kindofquantity/#format-string) which represents the format override.
   */
  public readonly name: string;

  constructor(parent: Format, precision?: DecimalPrecision | FractionalPrecision, unitAndLabels?: Array<[Unit | InvertedUnit, string | undefined]>) {
    this.parent = parent;
    this.name = OverrideFormat.createOverrideFormatFullName(parent, precision, unitAndLabels);
    this._precision = precision;
    this._units = unitAndLabels;
  }

  // Properties that can be overriden
  public get precision(): DecimalPrecision | FractionalPrecision { return (undefined === this._precision) ? this.parent.precision : this._precision; }
  public get units() { return (undefined === this._units) ? this.parent.units : this._units; }

  // Properties that cannot be overriden
  public get fullName(): string { return this.name; }
  public get roundFactor(): number { return this.parent.roundFactor; }
  public get type(): FormatType { return this.parent.type; }
  public get minWidth(): number | undefined { return this.parent.minWidth; }
  public get scientificType(): ScientificType | undefined { return this.parent.scientificType; }
  public get showSignOption(): ShowSignOption { return this.parent.showSignOption; }
  public get decimalSeparator(): string { return this.parent.decimalSeparator; }
  public get thousandSeparator(): string { return this.parent.thousandSeparator; }
  public get uomSeparator(): string { return this.parent.uomSeparator; }
  public get stationSeparator(): string { return this.parent.stationSeparator; }
  public get stationOffsetSize(): number | undefined { return this.parent.stationOffsetSize; }
  public get formatTraits(): FormatTraits { return this.parent.formatTraits; }
  public get spacer(): string | undefined { return this.parent.spacer; }
  public get includeZero(): boolean | undefined { return this.parent.includeZero; }

  public hasFormatTrait(formatTrait: FormatTraits) {
    return (this.parent.formatTraits & formatTrait) === formatTrait;
  }

  /** Returns the format string of this override in the Xml full name format.
   * @alpha
   */
  public fullNameXml(koqSchema: Schema): string {
    let fullName = XmlSerializationUtils.createXmlTypedName(koqSchema, this.parent.schema, this.parent.name);

    if (undefined !== this.precision)
      fullName += `(${this.precision.toString()})`;

    if (undefined === this._units)
      return fullName;
    for (const [unit, unitLabel] of this._units) {
      fullName += "[";
      fullName += XmlSerializationUtils.createXmlTypedName(koqSchema, unit.schema, unit.name);
      fullName += `|${unitLabel}]`;
    }
    return fullName;
  }

  /**
   * Creates a valid OverrideFormat fullName from the parent Format and overridden units.
   * @param parent The parent Format.
   * @param unitAndLabels The overridden unit and labels collection.
   */
  public static createOverrideFormatFullName(parent: Format, precision?: DecimalPrecision | FractionalPrecision, unitAndLabels?: Array<[Unit | InvertedUnit, string | undefined]>): string {
    let fullName = parent.fullName;

    if (precision)
      fullName += `(${precision.toString()})`;

    if (undefined === unitAndLabels)
      return fullName;
    for (const [unit, unitLabel] of unitAndLabels)
      if (undefined === unitLabel)
        fullName += `[${unit.fullName}]`;
      else
        fullName += `[${unit.fullName}|${unitLabel}]`;
    return fullName;
  }

  /**
   * @internal
   */
  public static isOverrideFormat(object: any): object is OverrideFormat {
    const overrideFormat = object as OverrideFormat;

    return overrideFormat !== undefined && overrideFormat.name !== undefined && overrideFormat.parent !== undefined &&
             overrideFormat.parent.schemaItemType === SchemaItemType.Format;
  }
}
