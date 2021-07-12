/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Metadata
 */

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

/** @internal Needs to be moved to quantity */
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

/** @beta Needs to be moved to quantity  */
export enum FormatTraits {
  // the leading + opts TypeScript out of inferring a union enum
  TrailZeroes = +0x1,
  KeepSingleZero = 0x2,
  ZeroEmpty = 0x4,
  KeepDecimalPoint = 0x8,
  ApplyRounding = 0x10,
  FractionDash = 0x20,
  ShowUnitLabel = 0x40,
  PrependUnitLabel = 0x80,
  Use1000Separator = 0x100,
  ExponentOnlyNegative = 0x200,
}

/** @beta Needs to be moved to quantity  */
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

/** @beta Needs to be moved to quantity  */
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

/** @beta Needs to be moved to quantity  */
export enum FormatType {
  Decimal,
  Fractional,
  Scientific,
  Station,
}

/** @beta Needs to be moved to quantity  */
export enum ScientificType { // required if type is scientific; options: normalized, zeroNormalized
  Normalized,
  ZeroNormalized,
}

/** @beta Needs to be moved to quantity  */
export enum ShowSignOption { // default is no sign
  NoSign,
  OnlyNegative,
  SignAlways,
  NegativeParentheses,
}

// parse and toString methods

/** @internal Needs to be moved to quantity  */
export function parseScientificType(scientificType: string): ScientificType | undefined {
  switch (scientificType.toLowerCase()) {
    case "normalized": return ScientificType.Normalized;
    case "zeronormalized": return ScientificType.ZeroNormalized;
    default:
      return undefined;
  }
}

/** @internal Needs to be moved to quantity  */
export function scientificTypeToString(scientificType: ScientificType): string {
  return (scientificType === ScientificType.Normalized) ? "Normalized" : "ZeroNormalized";
}

/** @internal Needs to be moved to quantity  */
export function parseShowSignOption(showSignOption: string): ShowSignOption | undefined {
  switch (showSignOption.toLowerCase()) {
    case "nosign": return ShowSignOption.NoSign;
    case "onlynegative": return ShowSignOption.OnlyNegative;
    case "signalways": return ShowSignOption.SignAlways;
    case "negativeparentheses": return ShowSignOption.NegativeParentheses;
    default:
      return undefined;
  }
}

/** @internal Needs to be moved to quantity  */
export function showSignOptionToString(showSign: ShowSignOption): string {
  switch (showSign) {
    case ShowSignOption.NegativeParentheses: return "NegativeParentheses";
    case ShowSignOption.NoSign: return "NoSign";
    case ShowSignOption.OnlyNegative: return "OnlyNegative";
    case ShowSignOption.SignAlways: return "SignAlways";
  }
}

/** @internal Needs to be moved to quantity  */
export function parseFormatTrait(formatTraitsString: string): FormatTraits | undefined {
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
    default: return undefined;
  }
}

/** @internal Needs to be moved to quantity  */
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

/** @internal Needs to be moved to quantity  */
export function parseFormatType(jsonObjType: string): FormatType | undefined {
  switch (jsonObjType.toLowerCase()) {
    case "decimal": return FormatType.Decimal;
    case "scientific": return FormatType.Scientific;
    case "station": return FormatType.Station;
    case "fractional": return FormatType.Fractional;
    default:
      return undefined;
  }
}

/** @internal Needs to be moved to quantity  */
export function formatTypeToString(type: FormatType): string {
  switch (type) {
    case FormatType.Decimal: return "Decimal";
    case FormatType.Scientific: return "Scientific";
    case FormatType.Station: return "Station";
    case FormatType.Fractional: return "Fractional";
  }
}

/** @internal Needs to be moved to quantity  */
export function parseDecimalPrecision(jsonObjPrecision: number): DecimalPrecision | undefined {
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
      return undefined;
  }
}

/** @internal Needs to be moved to quantity  */
export function parseFractionalPrecision(jsonObjPrecision: number): FractionalPrecision | undefined {
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
      return undefined;
  }
}

/** @internal Needs to be moved to quantity  */
export function parsePrecision(precision: number, type: FormatType): DecimalPrecision | FractionalPrecision | undefined {
  switch (type) { // type must be decimal, fractional, scientific, or station
    case FormatType.Decimal:
    case FormatType.Scientific:
    case FormatType.Station:
      return parseDecimalPrecision(precision);
    case FormatType.Fractional:
      return parseFractionalPrecision(precision);
    default:
      return undefined;
  }
}
