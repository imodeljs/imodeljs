/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Quantity
 */

/** This interface provides basic information about a Unit that is return from a UnitProvider. This info
 * uniquely identifies a unit by its name.
 * @beta
 */
export interface UnitProps {
  /** Unique name for unit. */
  readonly name: string;
  /** Default label for unit. */
  readonly label: string;
  /** Unique name of unit phenomenon. Example phenomenon names include 'Units.LENGTH', 'Units.AREA', and 'Units.VOLUME' */
  readonly phenomenon: string;
  /** This is set to true if the Unit is known by the UnitsProvider. */
  readonly isValid: boolean;
  /** Optionally defined set of unit labels that can be used to represent the unit. This is helpful when parsing quantity value strings */
  readonly alternateLabels?: string[];
  /** Unique system name. Example "Units.USCUSTOM"," Units.METRIC", "Units.USSURVEY", "Units.IMPERIAL" */
  readonly system: string;
}

/** This interface defines the required properties of a Quantity.
 * @beta
 */
export interface QuantityProps {
  readonly magnitude: number;
  readonly unit: UnitProps;
  readonly isValid: boolean;
}

/** Interface that defines how to convert between a specific unit an another in synchronous formatting or parsing processing.
 * @beta
 */
export interface UnitConversionSpec {
  /** Unit name that was used to locate the unit by the Unit Provider */
  name: string;
  /** The default label that is used to display unit */
  label: string;
  /** Unit system name, used to when finding preferred parse unit */
  system: string;
  /** the information necessary to convert the unit to a specific display unit */
  conversion: UnitConversion;
  /** Labels that may be used to represent the unit in a string that is to be parsed. */
  parseLabels?: string[];
}

/** This interface defines the properties required to convert a quantity value from one unit to another such as from meters to feet
 * or from Celsius to Fahrenheit.
 * @beta
 */
export interface UnitConversion {
  factor: number;
  offset: number;
  error: boolean;
}

/** Interface that defines potential parse units that may be found in user's string input of a quantity value.
 * @beta
 */
export interface PotentialParseUnit {
  unitName: string;
  altLabels?: string[];
}

/**
 * This interface defines extra properties to be associated with Units from Units Schema by name
 * @alpha
 */
export interface UnitExtraData {
  readonly name: string;
  readonly altDisplayLabels: string[];
}

/** This interface is implemented by the class that is responsible for locating units by name or label and providing conversion values between units.
 * The methods to be implemented are async allowing the UnitsProvider to query the backend when necessary to look up unit definition and conversion rules.
 * @beta
 */
export interface UnitsProvider {
  findUnit(unitLabel: string, schemaName?: string, phenomenon?: string, unitSystem?: string): Promise<UnitProps>;
  getUnitsByFamily(phenomenon: string): Promise<UnitProps[]>;
  findUnitByName(unitName: string): Promise<UnitProps>;
  getConversion(fromUnit: UnitProps, toUnit: UnitProps): Promise<UnitConversion>;
}
