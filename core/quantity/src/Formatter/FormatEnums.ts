/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Quantity
 */

import { QuantityError, QuantityStatus } from "../Exception";

/** The regular expression to parse [format strings]($docs/bis/ec/kindofquantity.md#format-string)
 * provided in serialized formats as well as the full name of an [[OverrideFormat]].
 *
 * `formatName(precision)[unitName|unitLabel][unitName|unitLabel][unitName|unitLabel][unitName|unitLabel]`
 *
 * Explanation of the regex:
 * - ([\w.:]+)
 *   - Grabs the format full name
 * - (\(([^\)]+)\))?
 *   - Grabs the precision part with and without the `()`.
 *   - The parentheses are needed to validate the entire string.  (TODO: Need to check if this is true)
 * - (\[([^\|\]]+)([\|])?([^\]]+)?\])?
 *   - 4 of these make up the rest of the regex, none of them are required so each end in `?`
 *   - Grabs the unit name and label including the `[]`
 *   - Grabs the unit name, `|` and label separately
 * @internal
 */
export const formatStringRgx = /([\w.:]+)(\(([^\)]+)\))?(\[([^\|\]]+)([\|])?([^\]]+)?\])?(\[([^\|\]]+)([\|])?([^\]]+)?\])?(\[([^\|\]]+)([\|])?([^\]]+)?\])?(\[([^\|\]]+)([\|])?([^\]]+)?\])?/;

/** @internal */
export function* getItemNamesFromFormatString(formatString: string): Iterable<string> {
  const match = formatString.split(formatStringRgx);
  yield match[1]; // the Format Name
  let index = 4;
  while (index < match.length - 1) { // index 0 and 21 are empty strings
    if (match[index] !== undefined)
      yield match[index + 1]; // Unit Name
    else
      break;
    index += 4;
  }
}
/** @beta */
export enum FormatTraits {
  /** Show trailing zeroes to requested precision */
  TrailZeroes = 0x1,
  /** Indicates that the fractional part of the number is required when the fraction is zero */
  KeepSingleZero = 0x2,
  /** Zero magnitude returns blank display value */
  ZeroEmpty = 0x4,
  /** Show decimal point when value to right of decimal is empty */
  KeepDecimalPoint = 0x8,
  /** Use the rounding factor. Not yet supported  */
  ApplyRounding = 0x10,
  /** Show a dash between whole value and fractional value */
  FractionDash = 0x20,
  /** Append the quantity's unit label */
  ShowUnitLabel = 0x40,
  /** Prepend unit label. Not yet supported */
  PrependUnitLabel = 0x80,
  /** show a grouping in each group of 1000. */
  Use1000Separator = 0x100,
  /** Indicates that if an exponent value is positive to not include a `+`. By default a sign, `+` or `-`, is always shown. Not yet supported */
  ExponentOnlyNegative = 0x200,
}

/** Precision for Fractional formatted value types. Range from Whole (1/1) through 1/256.
 * @beta */
export enum FractionalPrecision {
  One = 1,
  Two = 2,
  Four = 4,
  Eight = 8,
  Sixteen = 16,
  ThirtyTwo = 32,
  SixtyFour = 64,
  OneHundredTwentyEight = 128,
  TwoHundredFiftySix = 256,
}

/** Precision for Decimal, Scientific, and Station formatted value types. Range from 1/(10^0) through 1/(10^12).
 * @beta */
export enum DecimalPrecision {
  Zero = 0,
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9,
  Ten = 10,
  Eleven = 11,
  Twelve = 12,
}

/** Supported format types
 *  @beta */
export enum FormatType {
  /** Decimal display (ie 2.125) */
  Decimal,
  /** Fractional display (ie 2-1/8) */
  Fractional,
  /** Scientific Notation (ie 1.04e3) */
  Scientific,
  /** Civil Engineering Stationing (ie 1+00). */
  Station,
}

/** required if type is scientific
 * @beta */
export enum ScientificType {
  /** Non-zero value left of decimal point (ie 1.2345e3) */
  Normalized,
  /** Zero value left of decimal point (ie 0.12345e4) */
  ZeroNormalized,
}

/** Determines how the sign of values are displayed
 * @beta */
export enum ShowSignOption {
  /** Never show a sign even if the value is negative. */
  NoSign,
  /** Only show a sign when the value is negative. */
  OnlyNegative,
  /** Always show a sign whether the value is positive or negative. */
  SignAlways,
  /** Only show a sign when the value is negative but use parentheses instead of a negative sign. For example, -10 is formatted as `(10)`. */
  NegativeParentheses,
}

// parse and toString methods

/**  @beta   */

export function parseScientificType(scientificType: string, formatName: string): ScientificType {
  switch (scientificType.toLowerCase()) {
    case "normalized": return ScientificType.Normalized;
    case "zeronormalized": return ScientificType.ZeroNormalized;
    default:
      throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${formatName} has an invalid 'scientificType' attribute.`);
  }
}

/**  @beta   */
export function scientificTypeToString(scientificType: ScientificType): string {
  return (scientificType === ScientificType.Normalized) ? "Normalized" : "ZeroNormalized";
}

/** @beta    */
export function parseShowSignOption(showSignOption: string, formatName: string): ShowSignOption {
  switch (showSignOption.toLowerCase()) {
    case "nosign": return ShowSignOption.NoSign;
    case "onlynegative": return ShowSignOption.OnlyNegative;
    case "signalways": return ShowSignOption.SignAlways;
    case "negativeparentheses": return ShowSignOption.NegativeParentheses;
    default:
      throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${formatName} has an invalid 'showSignOption' attribute.`);
  }
}

/**  @beta  */
export function showSignOptionToString(showSign: ShowSignOption): string {
  switch (showSign) {
    case ShowSignOption.NegativeParentheses: return "NegativeParentheses";
    case ShowSignOption.NoSign: return "NoSign";
    case ShowSignOption.OnlyNegative: return "OnlyNegative";
    case ShowSignOption.SignAlways: return "SignAlways";
  }
}

/**  @beta  */
export function parseFormatTrait(formatTraitsString: string, formatName: string): FormatTraits {
  switch (formatTraitsString.toLowerCase()) {
    case "trailzeroes": return FormatTraits.TrailZeroes;
    case "keepsinglezero": return FormatTraits.KeepSingleZero;
    case "zeroempty": return FormatTraits.ZeroEmpty;
    case "keepdecimalpoint": return FormatTraits.KeepDecimalPoint;
    case "applyrounding": return FormatTraits.ApplyRounding;
    case "fractiondash": return FormatTraits.FractionDash;
    case "showunitlabel": return FormatTraits.ShowUnitLabel;
    case "prependunitlabel": return FormatTraits.PrependUnitLabel;
    case "use1000separator": return FormatTraits.Use1000Separator;
    case "exponentonlynegative": return FormatTraits.ExponentOnlyNegative;
    default:
      throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${formatName} has an invalid 'formatTraits' attribute.`);
  }
}

/** @beta */
export function getTraitString(trait: FormatTraits) {
  switch (trait) {
    case FormatTraits.TrailZeroes:
      return "trailZeroes";
    case FormatTraits.KeepSingleZero:
      return "keepSingleZero";
    case FormatTraits.ZeroEmpty:
      return "zeroEmpty";
    case FormatTraits.KeepDecimalPoint:
      return "keepDecimalPoint";
    case FormatTraits.ApplyRounding:
      return "applyRounding";
    case FormatTraits.FractionDash:
      return "fractionDash";
    case FormatTraits.ShowUnitLabel:
      return "showUnitLabel";
    case FormatTraits.PrependUnitLabel:
      return "prependUnitLabel";
    case FormatTraits.Use1000Separator:
      return "use1000Separator";
    case FormatTraits.ExponentOnlyNegative:
    default:
      return "exponentOnlyNegative";
  }
}

/**  @beta  */
export function formatTraitsToArray(currentFormatTrait: FormatTraits): string[] {
  const formatTraitsArr = Array<string>();
  if ((currentFormatTrait & FormatTraits.TrailZeroes) === FormatTraits.TrailZeroes)
    formatTraitsArr.push("TrailZeroes");
  if ((currentFormatTrait & FormatTraits.KeepSingleZero) === FormatTraits.KeepSingleZero)
    formatTraitsArr.push("KeepSingleZero");
  if ((currentFormatTrait & FormatTraits.ZeroEmpty) === FormatTraits.ZeroEmpty)
    formatTraitsArr.push("ZeroEmpty");
  if ((currentFormatTrait & FormatTraits.KeepDecimalPoint) === FormatTraits.KeepDecimalPoint)
    formatTraitsArr.push("KeepDecimalPoint");
  if ((currentFormatTrait & FormatTraits.ApplyRounding) === FormatTraits.ApplyRounding)
    formatTraitsArr.push("ApplyRounding");
  if ((currentFormatTrait & FormatTraits.FractionDash) === FormatTraits.FractionDash)
    formatTraitsArr.push("FractionDash");
  if ((currentFormatTrait & FormatTraits.ShowUnitLabel) === FormatTraits.ShowUnitLabel)
    formatTraitsArr.push("ShowUnitLabel");
  if ((currentFormatTrait & FormatTraits.PrependUnitLabel) === FormatTraits.PrependUnitLabel)
    formatTraitsArr.push("PrependUnitLabel");
  if ((currentFormatTrait & FormatTraits.Use1000Separator) === FormatTraits.Use1000Separator)
    formatTraitsArr.push("Use1000Separator");
  if ((currentFormatTrait & FormatTraits.ExponentOnlyNegative) === FormatTraits.ExponentOnlyNegative)
    formatTraitsArr.push("ExponentOnlyNegative");
  return formatTraitsArr;
}

/**  @beta    */
export function parseFormatType(jsonObjType: string, formatName: string): FormatType {
  switch (jsonObjType.toLowerCase()) {
    case "decimal": return FormatType.Decimal;
    case "scientific": return FormatType.Scientific;
    case "station": return FormatType.Station;
    case "fractional": return FormatType.Fractional;
    default:
      throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${formatName} has an invalid 'type' attribute.`);
  }
}

/** @beta    */
export function formatTypeToString(type: FormatType): string {
  switch (type) {
    case FormatType.Decimal: return "Decimal";
    case FormatType.Scientific: return "Scientific";
    case FormatType.Station: return "Station";
    case FormatType.Fractional: return "Fractional";
  }
}

/**  @beta    */
export function parseDecimalPrecision(jsonObjPrecision: number, formatName: string): DecimalPrecision {
  switch (jsonObjPrecision) {
    case 0: return DecimalPrecision.Zero;
    case 1: return DecimalPrecision.One;
    case 2: return DecimalPrecision.Two;
    case 3: return DecimalPrecision.Three;
    case 4: return DecimalPrecision.Four;
    case 5: return DecimalPrecision.Five;
    case 6: return DecimalPrecision.Six;
    case 7: return DecimalPrecision.Seven;
    case 8: return DecimalPrecision.Eight;
    case 9: return DecimalPrecision.Nine;
    case 10: return DecimalPrecision.Ten;
    case 11: return DecimalPrecision.Eleven;
    case 12: return DecimalPrecision.Twelve;
    default:
      throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${formatName} has an invalid 'precision' attribute.`);
  }
}

/**  @beta validates the input value, that is typically extracted for persisted JSON data, is a valid FractionalPrecision */
export function parseFractionalPrecision(jsonObjPrecision: number, formatName: string): FractionalPrecision {
  switch (jsonObjPrecision) {
    case 1: return FractionalPrecision.One;
    case 2: return FractionalPrecision.Two;
    case 4: return FractionalPrecision.Four;
    case 8: return FractionalPrecision.Eight;
    case 16: return FractionalPrecision.Sixteen;
    case 32: return FractionalPrecision.ThirtyTwo;
    case 64: return FractionalPrecision.SixtyFour;
    case 128: return FractionalPrecision.OneHundredTwentyEight;
    case 256: return FractionalPrecision.TwoHundredFiftySix;
    default:
      throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${formatName} has an invalid 'precision' attribute.`);
  }
}

/** @beta  validates the input value, that is typically extracted for persisted JSON data, is a valid DecimalPrecision or FractionalPrecision. */
export function parsePrecision(precision: number, type: FormatType, formatName: string): DecimalPrecision | FractionalPrecision {
  switch (type) { // type must be decimal, fractional, scientific, or station
    case FormatType.Decimal:
    case FormatType.Scientific:
    case FormatType.Station:
      return parseDecimalPrecision(precision, formatName);
    case FormatType.Fractional:
      return parseFractionalPrecision(precision, formatName);
    default:
      throw new QuantityError(QuantityStatus.InvalidJson, `The Format ${formatName} has an invalid 'precision' attribute.`);
  }
}
