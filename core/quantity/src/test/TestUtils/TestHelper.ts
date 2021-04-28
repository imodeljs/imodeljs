/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { UnitConversion, UnitProps, UnitsProvider } from "../../Interfaces";
import { BadUnit, BasicUnit } from "../../Unit";

interface ConversionDef {
  numerator: number;
  denominator: number;
  offset: number;
}

interface UnitDefinition {
  readonly name: string;
  readonly phenomenon: string;
  readonly displayLabel: string;
  readonly altDisplayLabels: string[];
  readonly conversion: ConversionDef;
  readonly system: string;
}

// cSpell:ignore MILLIINCH, MICROINCH, MILLIFOOT
const unitData: UnitDefinition[] = [
  // Angles ( base unit radian )
  { name: "Units.RAD", phenomenon: "Units.ANGLE", system: "Units.SI", conversion: { numerator: 1.0, denominator: 1.0, offset: 0.0 }, displayLabel: "rad", altDisplayLabels: ["radian"] },
  // 1 rad = 180.0/PI °
  { name: "Units.ARC_DEG", phenomenon: "Units.ANGLE", system: "Units.METRIC", conversion: { numerator: 180.0, denominator: 3.1415926535897932384626433832795, offset: 0.0 }, displayLabel: "°", altDisplayLabels: ["deg", "^"] },
  { name: "Units.ARC_MINUTE", phenomenon: "Units.ANGLE", system: "Units.METRIC", conversion: { numerator: 10800.0, denominator: 3.14159265358979323846264338327950, offset: 0.0 }, displayLabel: "'", altDisplayLabels: ["min"] },
  { name: "Units.ARC_SECOND", phenomenon: "Units.ANGLE", system: "Units.METRIC", conversion: { numerator: 648000.0, denominator: 3.1415926535897932384626433832795, offset: 0.0 }, displayLabel: '"', altDisplayLabels: ["sec"] },
  { name: "Units.GRAD", phenomenon: "Units.ANGLE", system: "Units.METRIC", conversion: { numerator: 200, denominator: 3.1415926535897932384626433832795, offset: 0.0 }, displayLabel: "grad", altDisplayLabels: ["gd"] },
  // Time ( base unit second )
  { name: "Units.S", phenomenon: "Units.TIME", system: "Units.SI", conversion: { numerator: 1.0, denominator: 1.0, offset: 0.0 }, displayLabel: "s", altDisplayLabels: ["sec"] },
  { name: "Units.MIN", phenomenon: "Units.TIME", system: "Units.INTERNATIONAL", conversion: { numerator: 1.0, denominator: 60.0, offset: 0.0 }, displayLabel: "min", altDisplayLabels: [] },
  { name: "Units.HR", phenomenon: "Units.TIME", system: "Units.INTERNATIONAL", conversion: { numerator: 1.0, denominator: 3600.0, offset: 0.0 }, displayLabel: "h", altDisplayLabels: ["hr"] },
  { name: "Units.DAY", phenomenon: "Units.TIME", system: "Units.INTERNATIONAL", conversion: { numerator: 1.0, denominator: 86400.0, offset: 0.0 }, displayLabel: "days", altDisplayLabels: ["day"] },
  { name: "Units.WEEK", phenomenon: "Units.TIME", system: "Units.INTERNATIONAL", conversion: { numerator: 1.0, denominator: 604800.0, offset: 0.0 }, displayLabel: "weeks", altDisplayLabels: ["week"] },
  // 1 sec = 1/31536000.0 yr
  { name: "Units.YR", phenomenon: "Units.TIME", system: "Units.INTERNATIONAL", conversion: { numerator: 1.0, denominator: 31536000.0, offset: 0.0 }, displayLabel: "years", altDisplayLabels: ["year"] },
  // conversion => specified unit to base unit of m
  { name: "Units.M", phenomenon: "Units.LENGTH", system: "Units.SI", conversion: { numerator: 1.0, denominator: 1.0, offset: 0.0 }, displayLabel: "m", altDisplayLabels: ["meter"] },
  { name: "Units.MM", phenomenon: "Units.LENGTH", system: "Units.INTERNATIONAL", conversion: { numerator: 1000.0, denominator: 1.0, offset: 0.0 }, displayLabel: "mm", altDisplayLabels: ["MM"] },
  { name: "Units.CM", phenomenon: "Units.LENGTH", system: "Units.INTERNATIONAL", conversion: { numerator: 100.0, denominator: 1.0, offset: 0.0 }, displayLabel: "cm", altDisplayLabels: ["CM"] },
  { name: "Units.DM", phenomenon: "Units.LENGTH", system: "Units.INTERNATIONAL", conversion: { numerator: 10.0, denominator: 1.0, offset: 0.0 }, displayLabel: "dm", altDisplayLabels: ["DM"] },
  { name: "Units.KM", phenomenon: "Units.LENGTH", system: "Units.INTERNATIONAL", conversion: { numerator: 1.0, denominator: 1000.0, offset: 0.0 }, displayLabel: "km", altDisplayLabels: ["KM"] },
  { name: "Units.UM", phenomenon: "Units.LENGTH", system: "Units.INTERNATIONAL", conversion: { numerator: 1000000.0, denominator: 1.0, offset: 0.0 }, displayLabel: "µm", altDisplayLabels: [] },
  { name: "Units.MILLIINCH", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1000.0, denominator: 0.0254, offset: 0.0 }, displayLabel: "mil", altDisplayLabels: [] },
  { name: "Units.MICROINCH", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1000000.0, denominator: 0.0254, offset: 0.0 }, displayLabel: "µin", altDisplayLabels: [] },
  { name: "Units.MILLIFOOT", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1000.0, denominator: 0.3048, offset: 0.0 }, displayLabel: "mft", altDisplayLabels: [] },
  { name: "Units.IN", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 0.0254, offset: 0.0 }, displayLabel: "in", altDisplayLabels: ["IN", "\""] },
  { name: "Units.FT", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 0.3048, offset: 0.0 }, displayLabel: "ft", altDisplayLabels: ["F", "FT", "'"] },
  { name: "Units.CHAIN", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 66.0 * 0.3048, offset: 0.0 }, displayLabel: "chain", altDisplayLabels: ["CHAIN"] },
  { name: "Units.YRD", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 0.9144, offset: 0.0 }, displayLabel: "yd", altDisplayLabels: ["YRD", "yrd"] },
  { name: "Units.MILE", phenomenon: "Units.LENGTH", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 1609.344, offset: 0.0 }, displayLabel: "mi", altDisplayLabels: ["mile", "Miles", "Mile"] },

  { name: "Units.BOGUS.IN", phenomenon: "Units.LENGTH", system: "Units.BOBUS", conversion: { numerator: 1.0, denominator: 0.0254, offset: 0.025 }, displayLabel: "bi", altDisplayLabels: [] },

  { name: "Units.US_SURVEY_FT", phenomenon: "Units.LENGTH", system: "Units.USSURVEY", conversion: { numerator: 3937.0, denominator: 1200.0, offset: 0.0 }, displayLabel: "ft (US Survey)", altDisplayLabels: ["ft", "SF", "USF", "ft (US Survey)"] },
  { name: "Units.US_SURVEY_YRD", phenomenon: "Units.LENGTH", system: "Units.USSURVEY", conversion: { numerator: 3937.0, denominator: 3.0 * 1200.0, offset: 0.0 }, displayLabel: "yrd (US Survey)", altDisplayLabels: ["USY", "yards (US Survey)"] },
  { name: "Units.US_SURVEY_IN", phenomenon: "Units.LENGTH", system: "Units.USSURVEY", conversion: { numerator: 3937.0, denominator: 100.0, offset: 0.0 }, displayLabel: "in (US Survey)", altDisplayLabels: ["USI", "inches (US Survey)"] },
  { name: "Units.US_SURVEY_MILE", phenomenon: "Units.LENGTH", system: "Units.USSURVEY", conversion: { numerator: 3937.0, denominator: 5280.0 * 1200.0, offset: 0.0 }, displayLabel: "mi (US Survey)", altDisplayLabels: ["miles (US Survey)", "mile (US Survey)", "USM"] },
  { name: "Units.US_SURVEY_CHAIN", phenomenon: "Units.LENGTH", system: "Units.USSURVEY", conversion: { numerator: 1.0, denominator: 20.11684, offset: 0.0 }, displayLabel: "chain (US Survey)", altDisplayLabels: ["chains (US Survey)"] },
  // conversion => specified unit to base unit of m²
  { name: "Units.SQ_FT", phenomenon: "Units.AREA", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: .09290304, offset: 0.0 }, displayLabel: "ft²", altDisplayLabels: ["sf"] },
  { name: "Units.SQ_US_SURVEY_FT", phenomenon: "Units.AREA", system: "Units.USCUSTOM", conversion: { numerator: 15499969.0, denominator: 1440000, offset: 0.0 }, displayLabel: "ft² (US Survey)", altDisplayLabels: ["sussf"] },
  { name: "Units.SQ_M", phenomenon: "Units.AREA", system: "Units.SI", conversion: { numerator: 1.0, denominator: 1.0, offset: 0.0 }, displayLabel: "m²", altDisplayLabels: ["sm"] },
  // conversion => specified unit to base unit m³
  { name: "Units.CUB_FT", phenomenon: "Units.VOLUME", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 0.028316847, offset: 0.0 }, displayLabel: "ft³", altDisplayLabels: ["cf"] },
  { name: "Units.CUB_US_SURVEY_FT", phenomenon: "Units.VOLUME", system: "Units.USSURVEY", conversion: { numerator: 1, denominator: 0.0283170164937591, offset: 0.0 }, displayLabel: "ft³", altDisplayLabels: ["cf"] },
  { name: "Units.CUB_YRD", phenomenon: "Units.VOLUME", system: "Units.USCUSTOM", conversion: { numerator: 1.0, denominator: 0.76455486, offset: 0.0 }, displayLabel: "yd³", altDisplayLabels: ["cy"] },
  { name: "Units.CUB_M", phenomenon: "Units.VOLUME", system: "Units.SI", conversion: { numerator: 1.0, denominator: 1.0, offset: 0.0 }, displayLabel: "m³", altDisplayLabels: ["cm"] },
];

export class ConversionData implements UnitConversion {
  public factor: number = 1.0;
  public offset: number = 0.0;
  public error: boolean = false;
}

export class TestUnitsProvider implements UnitsProvider {
  /** Find a unit given the unitLabel. */
  public async findUnit(unitLabel: string, phenomenon?: string, unitSystem?: string): Promise<UnitProps> {
    const labelToFind = unitLabel.toLowerCase();
    const phenomenonToFind = phenomenon ? phenomenon.toLowerCase() : undefined;
    const unitSystemToFind = unitSystem ? unitSystem.toLowerCase() : undefined;

    for (const entry of unitData) {
      if (phenomenon) {
        if (entry.phenomenon.toLowerCase() !== phenomenonToFind)
          continue;
      }
      if (unitSystemToFind) {
        if (entry.system.toLowerCase() !== unitSystemToFind)
          continue;
      }

      if (entry.displayLabel.toLowerCase() === labelToFind || entry.name.toLowerCase() === labelToFind) {
        const unitProps = new BasicUnit(entry.name, entry.displayLabel, entry.phenomenon, entry.altDisplayLabels, entry.system);
        return unitProps;
      }

      if (entry.altDisplayLabels && entry.altDisplayLabels.length > 0) {
        if (entry.altDisplayLabels.findIndex((ref) => ref.toLowerCase() === labelToFind) !== -1) {
          const unitProps = new BasicUnit(entry.name, entry.displayLabel, entry.phenomenon, entry.altDisplayLabels, entry.system);
          return unitProps;
        }
      }
    }

    return new BadUnit();
  }

  /** find all units given phenomenon */
  public async getUnitsByFamily(phenomenon: string): Promise<UnitProps[]> {
    const units: UnitProps[] = [];
    for (const entry of unitData) {
      if (entry.phenomenon !== phenomenon)
        continue;
      units.push(new BasicUnit(entry.name, entry.displayLabel, entry.phenomenon, entry.altDisplayLabels, entry.system));
    }
    return units;
  }

  protected findUnitDefinition(name: string): UnitDefinition | undefined {
    for (const entry of unitData) {
      if (entry.name === name)
        return entry;
    }

    return undefined;
  }

  /** Find a unit given the unit's unique name. */
  public async findUnitByName(unitName: string): Promise<UnitProps> {
    const unitDataEntry = this.findUnitDefinition(unitName);
    if (unitDataEntry) {
      return new BasicUnit(unitDataEntry.name, unitDataEntry.displayLabel, unitDataEntry.phenomenon, unitDataEntry.altDisplayLabels, unitDataEntry.system);
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
}
