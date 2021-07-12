/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import {
  CustomFormatProps, Format, FormatProps, FormatterSpec, Parser, ParserSpec, QuantityParseResult, UnitConversionSpec, UnitProps, UnitsProvider,
} from "@bentley/imodeljs-quantity";
import {
  CheckboxFormatPropEditorSpec, CustomFormatPropEditorSpec, CustomQuantityTypeDefinition,
  TextInputFormatPropEditorSpec, TextSelectFormatPropEditorSpec, UnitSystemKey,
} from "../quantity-formatting/QuantityFormatter";

interface BearingFormatProps extends CustomFormatProps {
  readonly custom: {
    readonly addDirectionLabelGap: boolean;
    readonly angleDirection: string;   // "clockwise"|"counter-clockwise"
    readonly testString: string;   // for testing control creation only
  };
}

const isBearingFormatProps = (item: FormatProps): item is BearingFormatProps => {
  return ((item as CustomFormatProps).custom !== undefined) &&
    ((item as BearingFormatProps).custom.addDirectionLabelGap !== undefined) &&
    ((item as BearingFormatProps).custom.angleDirection !== undefined);
};

const defaultBearingFormat: BearingFormatProps = {
  composite: {
    includeZero: true,
    spacer: "",
    units: [{ label: "°", name: "Units.ARC_DEG" }, { label: "'", name: "Units.ARC_MINUTE" }, { label: "\"", name: "Units.ARC_SECOND" }],
  },
  formatTraits: ["showUnitLabel"],
  precision: 0,
  type: "Decimal",
  uomSeparator: "",
  custom: { addDirectionLabelGap: true, angleDirection: "clockwise", testString: "test-string" },
};

class BearingFormatterSpec extends FormatterSpec {
  constructor(name: string, format: Format, conversions: UnitConversionSpec[], persistenceUnit: UnitProps) {
    super(name, format, conversions, persistenceUnit);
  }

  public override applyFormatting(magnitude: number): string {
    // quadrant suffixes and prefixes
    const prefix = ["N", "S", "S", "N"];
    const suffix = ["E", "E", "W", "W"];

    // magnitude is assumed to be Azimuth angle

    // adjust if measuring counter clockwise direction
    if (this.format.customProps?.angleDirection === "counter-clockwise") {
      magnitude = (Math.PI * 2) - magnitude;
    }

    const isNegative = magnitude < 0;
    const positiveRad = Math.abs(magnitude);
    const maxRad = Math.PI * 2;

    let adjustedRad = (positiveRad + maxRad) % maxRad;
    if (isNegative)
      adjustedRad = maxRad - adjustedRad;

    let radToFormat = adjustedRad;
    let quadrant = 1;
    if (adjustedRad > Math.PI / 2 && adjustedRad <= Math.PI) {
      radToFormat = Math.PI - adjustedRad;
      quadrant = 2;
    } else if (adjustedRad > Math.PI && adjustedRad <= (3 * Math.PI / 2)) {
      radToFormat = adjustedRad - Math.PI;
      quadrant = 3;
    } else if (adjustedRad > (3 * Math.PI / 2) && adjustedRad < (2 * Math.PI)) {
      radToFormat = (2 * Math.PI) - adjustedRad;
      quadrant = 4;
    }

    const gapChar = (this.format.customProps?.addDirectionLabelGap) ? " " : "";
    const formattedValue = super.applyFormatting(radToFormat);
    return `${prefix[quadrant - 1]}${gapChar}${formattedValue}${gapChar}${suffix[quadrant - 1]}`;
  }

  /** Static async method to create a FormatSpec given the format and unit of the quantity that will be passed to the Formatter. The input unit will
   * be used to generate conversion information for each unit specified in the Format. This method is async due to the fact that the units provider must make
   * async calls to lookup unit definitions.
   *  @param name     The name of a format specification.
   *  @param unitsProvider The units provider is used to look up unit definitions and provide conversion information for converting between units.
   *  @param persistenceUnit The unit of the value to be formatted.
   */
  public static override async create(name: string, format: Format, unitsProvider: UnitsProvider, persistenceUnit: UnitProps): Promise<FormatterSpec> {
    const conversions: UnitConversionSpec[] = await FormatterSpec.getUnitConversions(format, unitsProvider, persistenceUnit);
    return new BearingFormatterSpec(name, format, conversions, persistenceUnit);
  }
}

class BearingParserSpec extends ParserSpec {
  constructor(outUnit: UnitProps, format: Format, conversions: UnitConversionSpec[]) {
    super(outUnit, format, conversions);
  }

  public override parseToQuantityValue(inString: string): QuantityParseResult {
    let prefix: string | undefined;
    let suffix: string | undefined;
    let adjustedString = inString.toLocaleUpperCase().trimLeft().trimRight();
    if (adjustedString.startsWith("S") || adjustedString.startsWith("N")) {
      prefix = adjustedString.slice(0, 1);
      adjustedString = adjustedString.substr(1);
    }
    if (adjustedString.endsWith("E") || adjustedString.endsWith("W")) {
      suffix = adjustedString.slice(adjustedString.length - 1);
      adjustedString = adjustedString.substr(0, adjustedString.length - 1);
      adjustedString = adjustedString.trimLeft().trimRight();
    }

    const isCCW = this.format.customProps?.angleDirection === "counter-clockwise";

    // const parsedRadians = Parser.parseToQuantityValue(inString, this.format, this.unitConversions);
    const parsedRadians = Parser.parseToQuantityValue(adjustedString, this.format, this.unitConversions);
    if (Parser.isParsedQuantity(parsedRadians)) {
      if (prefix === "N" && suffix === "E") {
        if (isCCW)
          parsedRadians.value = (2 * Math.PI) - parsedRadians.value;
      } else if (prefix === "N" && suffix === "W") {
        if (!isCCW)
          parsedRadians.value = (2 * Math.PI) - parsedRadians.value;
      } else if (prefix === "S" && suffix === "W") {
        if (isCCW)
          parsedRadians.value = Math.PI - parsedRadians.value;
        else
          parsedRadians.value = parsedRadians.value + Math.PI;
      } else if (prefix === "S" && suffix === "E") {
        if (isCCW)
          parsedRadians.value = Math.PI + parsedRadians.value;
        else
          parsedRadians.value = Math.PI - parsedRadians.value;
      }
    }

    return parsedRadians;
  }

  /** Static async method to create a ParserSpec given the format and unit of the quantity that will be passed to the Parser. The input unit will
   * be used to generate conversion information for each unit specified in the Format. This method is async due to the fact that the units provider must make
   * async calls to lookup unit definitions.
   *  @param format     The format specification.
   *  @param unitsProvider The units provider is used to look up unit definitions and provide conversion information for converting between units.
   *  @param outUnit The unit the value to be formatted. This unit is often referred to as persistence unit.
   */
  public static override async create(format: Format, unitsProvider: UnitsProvider, outUnit: UnitProps): Promise<ParserSpec> {
    const conversions = await Parser.createUnitConversionSpecsForUnit(unitsProvider, outUnit);
    return new BearingParserSpec(outUnit, format, conversions);
  }
}

export class BearingQuantityType implements CustomQuantityTypeDefinition {
  private _key = "Bearing";  // key and type should be the same unless a QuantityType enum is specified in _type
  private _type = "Bearing";
  private _persistenceUnitName = "Units.RAD";
  private _labelKey = "SampleApp:BearingQuantityType.label";
  private _descriptionKey = "SampleApp:BearingQuantityType.description";
  private _label: string | undefined;
  private _description: string | undefined;
  private _formatProps = defaultBearingFormat;

  constructor(private _persistenceUnit: UnitProps) { }

  public get key(): string { return this._key; }
  public get type(): string { return this._type; }

  public isCompatibleFormatProps(formatProps: FormatProps) {
    return isBearingFormatProps(formatProps);
  }

  public get formatProps(): FormatProps { return this._formatProps; }
  public set formatProps(value: FormatProps) {
    if (isBearingFormatProps(value)) {
      this._formatProps = value;
    }
    throw new Error(`formatProps passed to BearingQuantity setter is not a BearingFormatProps`);
  }

  public get persistenceUnit(): UnitProps {
    if (this._persistenceUnit)
      return this._persistenceUnit;
    throw new Error(`_persistenceUnit is not set, did you call BearingQuantityType.registerQuantityType?`);
  }

  public get label(): string {
    if (!this._label) {
      this._label = this._type;
    }
    return this._label ? this._label : "unknown";
  }

  public get description(): string {
    if (!this._description) {
      this._description = this.label;
    }
    return this._description ? this._description : "unknown";
  }

  public generateFormatterSpec = async (formatProps: FormatProps, unitsProvider: UnitsProvider) => {
    if (isBearingFormatProps(formatProps)) {
      const format = new Format("Bearing");
      await format.fromJSON(unitsProvider, formatProps);
      return BearingFormatterSpec.create(format.name, format, unitsProvider, this.persistenceUnit);
    }
    throw new Error(`formatProps passed to BearingQuantity type is not a BearingFormatProps`);
  };

  public generateParserSpec = async (formatProps: FormatProps, unitsProvider: UnitsProvider) => {
    if (isBearingFormatProps(formatProps)) {
      const format = new Format("Bearing");
      await format.fromJSON(unitsProvider, formatProps);
      return BearingParserSpec.create(format, unitsProvider, this.persistenceUnit);
    }
    throw new Error(`formatProps passed to BearingQuantity type is not a BearingFormatProps`);
  };

  // Bearing is not unit system specific so no need to check that here
  public getDefaultFormatPropsBySystem = (_requestedSystem: UnitSystemKey) => {
    return this.formatProps;
  };

  public get secondaryPropEditorSpecs(): CustomFormatPropEditorSpec[] {
    return [
      {
        editorType: "select",
        selectOptions: [
          { value: "clockwise", label: "clockwise" },
          { value: "counter-clockwise", label: "counter-clockwise" },
        ],
        label: "Angle Direction",
        getString: BearingQuantityType.bearingAngleDirectionGetter,
        setString: BearingQuantityType.bearingAngleDirectionSetter,
      } as TextSelectFormatPropEditorSpec,
      {
        editorType: "text",
        label: "Test Text",
        getString: BearingQuantityType.bearingTextGetter,
        setString: BearingQuantityType.bearingTextSetter,
      } as TextInputFormatPropEditorSpec,
    ];
  }

  public get primaryPropEditorSpecs(): CustomFormatPropEditorSpec[] {
    return [
      {
        editorType: "checkbox",
        label: "bearingGap",
        getBool: BearingQuantityType.bearingGapPropGetter,
        setBool: BearingQuantityType.bearingGapPropSetter,
      } as CheckboxFormatPropEditorSpec,
    ];
  }

  private static bearingGapPropGetter(props: FormatProps) {
    if (isBearingFormatProps(props)) {
      return props.custom.addDirectionLabelGap;
    }
    throw new Error(`formatProps passed to bearingGapPropGetter type is not a BearingFormatProps`);
  }

  private static bearingGapPropSetter(props: FormatProps, isChecked: boolean) {
    if (isBearingFormatProps(props)) {
      const customProps = { ...props.custom, addDirectionLabelGap: isChecked };
      const newProps = { ...props, custom: customProps };
      return newProps;
    }
    throw new Error(`formatProps passed to bearingGapPropSetter type is not a BearingFormatProps`);
  }

  private static bearingAngleDirectionGetter(props: FormatProps) {
    if (isBearingFormatProps(props)) {
      return props.custom.angleDirection;
    }
    throw new Error(`formatProps passed to bearingAngleDirectionGetter type is not a BearingFormatProps`);
  }

  private static bearingAngleDirectionSetter(props: FormatProps, value: string) {
    if (isBearingFormatProps(props)) {
      const customProps = { ...props.custom, angleDirection: value };
      const newProps = { ...props, custom: customProps };
      return newProps;
    }
    throw new Error(`formatProps passed to bearingAngleDirectionSetter type is not a BearingFormatProps`);
  }

  private static bearingTextGetter(props: FormatProps) {
    if (isBearingFormatProps(props)) {
      return props.custom.testString;
    }
    throw new Error(`formatProps passed to bearingTextGetter type is not a BearingFormatProps`);
  }

  private static bearingTextSetter(props: FormatProps, value: string) {
    if (isBearingFormatProps(props)) {
      const customProps = { ...props.custom, testString: value };
      const newProps = { ...props, custom: customProps };
      return newProps;
    }
    throw new Error(`formatProps passed to bearingTextSetter type is not a BearingFormatProps`);
  }
}
