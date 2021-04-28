/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module QuantityFormatting
 */

import { BadUnit, BasicUnit, UnitConversion, UnitExtraData, UnitProps, UnitsProvider } from "@bentley/imodeljs-quantity";

// cSpell:ignore ussurvey USCUSTOM

/** Units provider that provides a limited number of UnitDefinitions that are needed to support basic tools.
 * @internal
 */
export class BasicUnitsProvider implements UnitsProvider {
  constructor(private _unitExtraData: UnitExtraData[] = []) {}

  /** Find a unit given the unitLabel. */
  public async findUnit(unitLabel: string, schemaName?: string, phenomenon?: string, unitSystem?: string): Promise<UnitProps> {
    const labelToFind = unitLabel.toLowerCase();
    const unitFamilyToFind = phenomenon ? phenomenon.toLowerCase():undefined;
    const unitSystemToFind = unitSystem ? unitSystem.toLowerCase():undefined;

    for (const entry of UNIT_DATA) {
      if (schemaName && schemaName !== "Units")
        continue;

      if (phenomenon && entry.phenomenon.toLowerCase() !== unitFamilyToFind)
        continue;

      if (unitSystemToFind && entry.system.toLowerCase() !== unitSystemToFind)
        continue;

      if (entry.displayLabel.toLowerCase() === labelToFind || entry.name.toLowerCase() === labelToFind) {
        const unitProps = new BasicUnit(entry.name, entry.displayLabel, entry.phenomenon, this.getAlternateDisplayLabels(entry.name), entry.system);
        return unitProps;
      }

      const altDisplayLabels = this.getAlternateDisplayLabels(entry.name);
      if (altDisplayLabels.findIndex((ref) => ref.toLowerCase() === labelToFind) !== -1) {
        const unitProps = new BasicUnit(entry.name, entry.displayLabel, entry.phenomenon, altDisplayLabels, entry.system);
        return unitProps;
      }
    }

    return new BadUnit();
  }

  /** Find all units given phenomenon */
  public async getUnitsByFamily(phenomenon: string): Promise<UnitProps[]> {
    const units: UnitProps[] = [];
    for (const entry of UNIT_DATA) {
      if (entry.phenomenon !== phenomenon)
        continue;

      const altDisplayLabels = this.getAlternateDisplayLabels(entry.name);
      units.push(new BasicUnit(entry.name, entry.displayLabel, entry.phenomenon, altDisplayLabels, entry.system));
    }
    return units;
  }

  /** Find a unit given the unit's unique name. */
  public async findUnitByName(unitName: string): Promise<UnitProps> {
    const unitDataEntry = this.findUnitDefinition(unitName);
    if (unitDataEntry) {
      const altDisplayLabels = this.getAlternateDisplayLabels(unitDataEntry.name);
      return new BasicUnit(unitDataEntry.name, unitDataEntry.displayLabel, unitDataEntry.phenomenon, altDisplayLabels, unitDataEntry.system);
    }
    return new BadUnit();
  }

  /** Return the information needed to convert a value between two different units.  The units should be from the same phenomenon. */
  public async getConversion(fromUnit: UnitProps, toUnit: UnitProps): Promise<UnitConversion> {
    const fromUnitData = this.findUnitDefinition(fromUnit.name);
    const toUnitData = this.findUnitDefinition(toUnit.name);

    if (fromUnitData && toUnitData) {
      const deltaOffset = toUnitData.conversion.offset - fromUnitData.conversion.offset;
      const deltaNumerator = toUnitData.conversion.numerator * fromUnitData.conversion.denominator;
      const deltaDenominator = toUnitData.conversion.denominator * fromUnitData.conversion.numerator;

      const conversionData = new ConversionData();
      conversionData.factor = deltaNumerator / deltaDenominator;
      conversionData.offset = deltaOffset;
      return conversionData;
    }

    const conversion = new ConversionData();
    conversion.error = true;
    return conversion;
  }

  /** Helper to find UnitDefiniton for name in UNIT_DATA */
  protected findUnitDefinition(name: string): UnitDefinition | undefined {
    for (const entry of UNIT_DATA) {
      if (entry.name === name)
        return entry;
    }

    return undefined;
  }

  /** Find alternate display labels associated with unitName, if any */
  private getAlternateDisplayLabels(unitName: string): Array<string> {
    let alternateLabels: Array<string> = [];
    for (const entry of this._unitExtraData) {
      if (entry.name.toLowerCase() === unitName.toLowerCase()) {
        alternateLabels = entry.altDisplayLabels;
        break;
      }
    }
    return alternateLabels;
  }
}

/** Class that implements the minimum UnitConversion interface to provide information needed to convert unit values.
 * @alpha
 */
class ConversionData implements UnitConversion {
  public factor: number = 1.0;
  public offset: number = 0.0;
  public error: boolean = false;
}

/** interface use to define unit conversions to a base used for a phenomenon */
interface ConversionDef {
  numerator: number;
  denominator: number;
  offset: number;
}

// Temporary interface use to define structure of the unit definitions in this example.
interface UnitDefinition {
  readonly name: string;
  readonly phenomenon: string;
  readonly displayLabel: string;
  readonly conversion: ConversionDef;
  readonly system: string;
}

// ========================================================================================================================================
// Minimum set of UNITs to be removed when official UnitsProvider is available
// ========================================================================================================================================
// cSpell:ignore MILLIINCH, MICROINCH, MILLIFOOT
// Set of supported units - this information will come from Schema-based units once the EC package is ready to provide this information.
const UNIT_DATA: UnitDefinition[] = [
  // Angles ( base unit radian )
  { name: "Units.RAD", phenomenon: "Units.ANGLE", system: "Units.SI", conversion: { numerator: 1.0, denominator: 1.0, offset: 0.0 }, displayLabel: "rad" },
  // 1 rad = 180.0/PI °
  { name: "Units.ARC_DEG", phenomenon: "Units.ANGLE", system: "Units.METRIC", conversion: { numerator: 180.0, denominator: 3.1415926535897932384626433832795, offset: 0.0 }, displayLabel: "°" },
  { name: "Units.ARC_MINUTE", phenomenon: "Units.ANGLE", system: "Units.METRIC", conversion: { numerator: 10800.0, denominator: 3.14159265358979323846264338327950, offset: 0.0 }, displayLabel: "'" },
  { name: "Units.ARC_SECOND", phenomenon: "Units.ANGLE", system: "Units.METRIC", conversion: { numerator: 648000.0, denominator: 3.1415926535897932384626433832795, offset: 0.0 }, displayLabel: '"' },
  { name: "Units.GRAD", phenomenon: "Units.ANGLE", system: "Units.METRIC", conversion: { numerator: 200, denominator: 3.1415926535897932384626433832795, offset: 0.0 }, displayLabel: "grad" },
  // Time ( base unit second )
  { name: "Units.S", phenomenon: "Units.TIME", system: "Units.SI", conversion: { numerator: 1.0, denominator: 1.0, offset: 0.0 }, displayLabel: "s" },
  { name: "Units.MIN", phenomenon: "Units.TIME", system: "Units.INTERNATIONAL", conversion: { numerator: 1.0, denominator: 60.0, offset: 0.0 }, displayLabel: "min" },
  { name: "Units.HR", phenomenon: "Units.TIME", system: "Units.INTERNATIONAL", conversion: { numerator: 1.0, denominator: 3600.0, offset: 0.0 }, displayLabel: "h"},
  { name: "Units.DAY", phenomenon: "Units.TIME", system: "Units.INTERNATIONAL", conversion: { numerator: 1.0, denominator: 86400.0, offset: 0.0 }, displayLabel: "days" },
  { name: "Units.WEEK", phenomenon: "Units.TIME", system: "Units.INTERNATIONAL", conversion: { numerator: 1.0, denominator: 604800.0, offset: 0.0 }, displayLabel: "weeks" },
  // 1 sec = 1/31536000.0 yr
  { name: "Units.YR", phenomenon: "Units.TIME", system: "Units.INTERNATIONAL", conversion: { numerator: 1.0, denominator: 31536000.0, offset: 0.0 }, displayLabel: "years" },
  // conversion => specified unit to base unit of m
  { name: "Units.M", phenomenon: "Units.LENGTH", system: "Units.SI", conversion: { numerator: 1.0, denominator: 1.0, offset: 0.0 }, displayLabel: "m" },
  { name: "Units.MM", phenomenon: "Units.LENGTH", system: "Units.METRIC", conversion: { numerator: 1000.0, denominator: 1.0, offset: 0.0 }, displayLabel: "mm" },
  { name: "Units.CM", phenomenon: "Units.LENGTH", system: "Units.METRIC", conversion: { numerator: 100.0, denominator: 1.0, offset: 0.0 }, displayLabel: "cm" },
  { name: "Units.DM", phenomenon: "Units.LENGTH", system: "Units.METRIC", conversion: { numerator: 10.0, denominator: 1.0, offset: 0.0 }, displayLabel: "dm" },
  { name: "Units.KM", phenomenon: "Units.LENGTH", system: "Units.METRIC", conversion: { numerator: 1.0, denominator: 1000.0, offset: 0.0 }, displayLabel: "km" },
  { name: "Units.UM", phenomenon: "Units.LENGTH", system: "Units.METRIC", conversion: { numerator: 1000000.0, denominator: 1.0, offset: 0.0 }, displayLabel: "µm" },
  { name: "Units.MILLIINCH", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1000.0, denominator: 0.0254, offset: 0.0 }, displayLabel: "mil" },
  { name: "Units.MICROINCH", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1000000.0, denominator: 0.0254, offset: 0.0 }, displayLabel: "µin" },
  { name: "Units.MILLIFOOT", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1000.0, denominator: 0.3048, offset: 0.0 }, displayLabel: "mft" },
  { name: "Units.IN", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 0.0254, offset: 0.0 }, displayLabel: "in" },
  { name: "Units.FT", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 0.3048, offset: 0.0 }, displayLabel: "ft" },
  { name: "Units.CHAIN", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 66.0 * 0.3048, offset: 0.0 }, displayLabel: "chain" },
  { name: "Units.YRD", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 0.9144, offset: 0.0 }, displayLabel: "yd" },
  { name: "Units.MILE", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 1609.344, offset: 0.0 }, displayLabel: "mi" },
  { name: "Units.US_SURVEY_FT", phenomenon: "Units.LENGTH", system: "Units.USSURVEY", conversion: { numerator: 3937.0, denominator: 1200.0, offset: 0.0 }, displayLabel: "ft (US Survey)" },
  { name: "Units.US_SURVEY_YRD", phenomenon: "Units.LENGTH", system: "Units.USSURVEY", conversion: { numerator: 3937.0, denominator: 3.0 * 1200.0, offset: 0.0 }, displayLabel: "yrd (US Survey)" },
  { name: "Units.US_SURVEY_IN", phenomenon: "Units.LENGTH", system: "Units.USSURVEY", conversion: { numerator: 3937.0, denominator: 100.0, offset: 0.0 }, displayLabel: "in (US Survey)" },
  { name: "Units.US_SURVEY_MILE", phenomenon: "Units.LENGTH", system: "Units.USSURVEY", conversion: { numerator: 3937.0, denominator: 5280.0 * 1200.0, offset: 0.0 }, displayLabel: "mi (US Survey)" },
  { name: "Units.US_SURVEY_CHAIN", phenomenon: "Units.LENGTH", system: "Units.USSURVEY", conversion: { numerator: 1.0, denominator: 20.11684, offset: 0.0 }, displayLabel: "chain (US Survey)" },
  // conversion => specified unit to base unit of m²
  { name: "Units.SQ_FT", phenomenon: "Units.AREA", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: .09290304, offset: 0.0 }, displayLabel: "ft²" },
  { name: "Units.SQ_US_SURVEY_FT", phenomenon: "Units.AREA", system: "Units.USCUSTOM", conversion: { numerator: 15499969.0, denominator: 1440000, offset: 0.0 }, displayLabel: "ft² (US Survey)" },
  { name: "Units.SQ_M", phenomenon: "Units.AREA", system: "Units.SI", conversion: { numerator: 1.0, denominator: 1.0, offset: 0.0 }, displayLabel: "m²" },
  // conversion => specified unit to base unit m³
  { name: "Units.CUB_FT", phenomenon: "Units.VOLUME", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 0.028316847, offset: 0.0 }, displayLabel: "ft³" },
  { name: "Units.CUB_US_SURVEY_FT", phenomenon: "Units.VOLUME", system: "Units.USSURVEY", conversion: { numerator: 1, denominator: 0.0283170164937591, offset: 0.0 }, displayLabel: "ft³" },
  { name: "Units.CUB_YRD", phenomenon: "Units.VOLUME", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 0.76455486, offset: 0.0 }, displayLabel: "yd³" },
  { name: "Units.CUB_M", phenomenon: "Units.VOLUME", system: "Units.SI", conversion: { numerator: 1.0, denominator: 1.0, offset: 0.0 }, displayLabel: "m³" },
];
