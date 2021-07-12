/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Format, FormatType, InvertedUnit, ShowSignOption, Unit } from "@bentley/ecschema-metadata";

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
