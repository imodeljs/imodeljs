/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import { Format } from "../Formatter/Format";
import { FormatterSpec } from "../Formatter/FormatterSpec";
import { Formatter } from "../Formatter/Formatter";
import { UnitProps } from "../Interfaces";
import { Parser } from "../Parser";
import { ParserSpec } from "../ParserSpec";
import { Quantity } from "../Quantity";
import { BadUnit } from "../Unit";
import { TestUnitsProvider } from "./TestUtils/TestHelper";

const logTestOutput = false;

describe("Parsing tests:", () => {
  it("Bad unit", async () => {
    const testUnit: UnitProps = new BadUnit();
    assert.isTrue(testUnit.name.length === 0);
    assert.isTrue(testUnit.label.length === 0);
    assert.isTrue(testUnit.phenomenon.length === 0);
    assert.isTrue(testUnit.isValid === false);
  });

  it("Quantity constructor", async () => {
    const noUnitQty = new Quantity();
    assert.isTrue(noUnitQty.magnitude === 0);
    assert.isTrue(noUnitQty.isValid === false);
  });

  it("Quantity convert Meters to inches", async () => {
    const unitsProvider = new TestUnitsProvider();
    const inchUnit = await unitsProvider.findUnit("in", "Units.LENGTH");
    const meterUnit = await unitsProvider.findUnit("m", "Units.LENGTH");
    const meterQty = new Quantity(meterUnit, 1.0);
    const conversion = await unitsProvider.getConversion(meterUnit, inchUnit);
    const inchesQty = meterQty.convertTo(inchUnit, conversion);

    assert.isFalse(conversion.error);
    assert.isTrue(meterQty.magnitude === 1.0);
    assert.isTrue(inchesQty!.magnitude === meterQty.magnitude * conversion.factor);
  });

  it("Convert units", async () => {
    const expectedConversionResults = [
      { label: "FT", unitContext: "", cvtTo: [{ label: "\"", factor: 12.0 }] },
      { label: "yd", unitContext: "", cvtTo: [{ label: "\'", factor: 3.0 }, { label: "\"", factor: 36.0 }] },
      { label: "mi", unitContext: "", cvtTo: [{ label: "yrd", factor: 1760.0 }, { label: "\'", factor: 5280.0 }, { label: "\"", factor: 63360.0 }] },
      { label: "°", unitContext: "Units.ANGLE", cvtTo: [{ label: "deg", factor: 1.0 }, { label: "min", factor: 60.0 }, { label: "sec", factor: 3600.0 }] },
      { label: "'", unitContext: "Units.ANGLE", cvtTo: [{ label: "min", factor: 1.0 }, { label: "sec", factor: 60.0 }] },
      { label: "\"", unitContext: "Units.ANGLE", cvtTo: [{ label: "sec", factor: 1.0 }] },
    ];

    const unitsProvider = new TestUnitsProvider();

    for (const tstVal of expectedConversionResults) {
      const unitContext = tstVal.unitContext.length > 0 ? tstVal.unitContext : undefined;
      const fromUnit = await unitsProvider.findUnit(tstVal.label, unitContext);
      for (const toVal of tstVal.cvtTo) {
        const toUnit = await unitsProvider.findUnit(toVal.label, fromUnit.phenomenon);
        const conversionData = await unitsProvider.getConversion(fromUnit, toUnit);
        assert.isFalse(conversionData.error);
        assert.isTrue(Math.fround(conversionData.factor) === toVal.factor);
      }
    }
  });

  it("Generate Parse Tokens", async () => {

    const format = new Format("test");
    const testStrings = ["", "0/1", "1/0", "1/2", "-1/2", "+1/2", "2 /", "1.616252eggs", "1.616252E-35eggs", "-1.616252E-35eggs", "756345.345", "12,345.345", "3.6252e3 Miles", "-1 1/2 FT", "+1 1/2 FT", "-135°11'30.5\"", "-2FT 6IN", "135°11'30.5\"", "2FT 6IN", "1 1/2 FT"];

    const expectedTokens = [
      [],
      [{ value: 0 }],
      [{ value: 1 }],
      [{ value: 0.5 }],
      [{ value: -0.5 }],
      [{ value: 0.5 }],
      [{ value: 2 }],
      [{ value: 1.616252 }, { value: "eggs" }],
      [{ value: 1.616252e-35 }, { value: "eggs" }],
      [{ value: -1.616252e-35 }, { value: "eggs" }],
      [{ value: 756345.345 }],
      [{ value: 12345.345 }],
      [{ value: 3625.2 }, { value: "Miles" }],
      [{ value: -1.5 }, { value: "FT" }],
      [{ value: 1.5 }, { value: "FT" }],
      [{ value: -135 }, { value: "°" }, { value: 11 }, { value: "'" }, { value: 30.5 }, { value: "\"" }],
      [{ value: -2 }, { value: "FT" }, { value: 6 }, { value: "IN" }],
      [{ value: 135 }, { value: "°" }, { value: 11 }, { value: "'" }, { value: 30.5 }, { value: "\"" }],
      [{ value: 2 }, { value: "FT" }, { value: 6 }, { value: "IN" }],
      [{ value: 1.5 }, { value: "FT" }],
    ];

    let i = 0;
    for (const strVal of testStrings) {
      const tokens = Parser.parseQuantitySpecification(strVal, format);
      assert.isTrue(tokens.length === expectedTokens[i].length);

      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let j = 0; j < tokens.length; j++) {
        assert.isTrue(tokens[j].value === expectedTokens[i][j].value);
      }

      i = i + 1;
    }
  });

  it("Look up units", async () => {
    const expectedLookupResults = [
      { label: "FT", name: "Units.FT", unitContext: "" },
      { label: "'", name: "Units.FT", unitContext: "Units.LENGTH" },
      { label: "ft", name: "Units.FT", unitContext: "" },
      { label: "\"", name: "Units.IN", unitContext: "Units.LENGTH" },
      { label: "in", name: "Units.IN", unitContext: "" },
      { label: "IN", name: "Units.IN", unitContext: "" },
      { label: "°", name: "Units.ARC_DEG", unitContext: "Units.ANGLE" },
      { label: "'", name: "Units.ARC_MINUTE", unitContext: "Units.ANGLE" },
      { label: "\"", name: "Units.ARC_SECOND", unitContext: "Units.ANGLE" },
    ];

    const unitProvider = new TestUnitsProvider();

    for (const lookupEntry of expectedLookupResults) {
      const unit = await unitProvider.findUnit(lookupEntry.label, (lookupEntry.unitContext.length > 0) ? lookupEntry.unitContext : undefined);
      assert.isTrue(unit.name === lookupEntry.name);
    }
  });

  it("Convert units", async () => {
    const expectedConversionResults = [
      { label: "FT", unitContext: "", cvtTo: [{ label: "\"", factor: 12.0 }] },
      { label: "yd", unitContext: "", cvtTo: [{ label: "\'", factor: 3.0 }, { label: "\"", factor: 36.0 }] },
      { label: "mi", unitContext: "", cvtTo: [{ label: "yrd", factor: 1760.0 }, { label: "\'", factor: 5280.0 }, { label: "\"", factor: 63360.0 }] },
      { label: "°", unitContext: "Units.ANGLE", cvtTo: [{ label: "deg", factor: 1.0 }, { label: "min", factor: 60.0 }, { label: "sec", factor: 3600.0 }] },
      { label: "'", unitContext: "Units.ANGLE", cvtTo: [{ label: "min", factor: 1.0 }, { label: "sec", factor: 60.0 }] },
      { label: "\"", unitContext: "Units.ANGLE", cvtTo: [{ label: "sec", factor: 1.0 }] },
    ];

    const unitsProvider = new TestUnitsProvider();

    for (const tstVal of expectedConversionResults) {
      const unitContext = tstVal.unitContext.length > 0 ? tstVal.unitContext : undefined;
      const fromUnit = await unitsProvider.findUnit(tstVal.label, unitContext);
      for (const toVal of tstVal.cvtTo) {
        const toUnit = await unitsProvider.findUnit(toVal.label, fromUnit.phenomenon);
        const conversionData = await unitsProvider.getConversion(fromUnit, toUnit);
        assert.isFalse(conversionData.error);
        assert.isTrue(Math.fround(conversionData.factor) === toVal.factor);
      }
    }
  });

  it("Parse into FT Quantities", async () => {
    const formatData = {
      composite: {
        includeZero: true,
        spacer: "",
        units: [
          {
            label: "'",
            name: "Units.FT",
          },
        ],
      },
      formatTraits: ["keepSingleZero", "applyRounding", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
      uomSeparator: "",
    };

    const testData = [
      { value: "12,345.345", quantity: { magnitude: 12345.345, unitName: "Units.FT" } },
      { value: "3.6252e3 Miles", quantity: { magnitude: 19141056, unitName: "Units.FT" } },
      { value: "3.6252e-3 Miles", quantity: { magnitude: 19.141056, unitName: "Units.FT" } },
      { value: "3.6252e+3 Miles", quantity: { magnitude: 19141056, unitName: "Units.FT" } },
      { value: "-1 1/2FT", quantity: { magnitude: -1.5, unitName: "Units.FT" } },
      { value: "-2FT 6IN", quantity: { magnitude: -2.5, unitName: "Units.FT" } },
      { value: "1 1/2 FT", quantity: { magnitude: 1.5, unitName: "Units.FT" } },
      { value: "2FT 6IN", quantity: { magnitude: 2.5, unitName: "Units.FT" } },
      { value: `2'-6"`, quantity: { magnitude: 2.5, unitName: "Units.FT" } },
      { value: "-3IN", quantity: { magnitude: -0.25, unitName: "Units.FT" } },
    ];

    const unitsProvider = new TestUnitsProvider();
    const format = new Format("test");
    await format.fromJSON(unitsProvider, formatData).catch(() => { });
    assert.isTrue(format.hasUnits);

    for (const testEntry of testData) {
      const quantityProps = await Parser.parseIntoQuantity(testEntry.value, format, unitsProvider);
      // console.log (`quantityProps=${JSON.stringify(quantityProps)}`);
      expect(Math.fround(quantityProps.magnitude)).to.eql(Math.fround(testEntry.quantity.magnitude));
      expect(quantityProps.unit.name).to.eql(testEntry.quantity.unitName);
    }
  });

  it("Parse into Length Quantities", async () => {
    const formatData = {
      formatTraits: ["keepSingleZero", "applyRounding", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
      uomSeparator: "",
    };

    const testData = [
      { value: "12,345.345 FT", quantity: { magnitude: 12345.345, unitName: "Units.FT" } },
      { value: "3.6252e3 Miles", quantity: { magnitude: 3625.2, unitName: "Units.MILE" } },
      { value: "3.6252e-3 Miles", quantity: { magnitude: 0.0036252, unitName: "Units.MILE" } },
      { value: "3.6252e+3 Miles", quantity: { magnitude: 3625.2, unitName: "Units.MILE" } },
      { value: "-1 1/2FT", quantity: { magnitude: -1.5, unitName: "Units.FT" } },
      { value: "-2FT 6IN", quantity: { magnitude: -2.5, unitName: "Units.FT" } },
      { value: "1 1/2 FT", quantity: { magnitude: 1.5, unitName: "Units.FT" } },
      { value: "2FT 6IN", quantity: { magnitude: 2.5, unitName: "Units.FT" } },
      /*    { value: `2'-6"`, quantity: { magnitude: 2.5, unitName: "Units.FT" } }, ambiguous case since ' can be Unit.FT or Units.ARC_MINUTE would require a Format unit to be defined. */
      { value: "-3IN", quantity: { magnitude: -3.0, unitName: "Units.IN" } },
    ];

    const unitsProvider = new TestUnitsProvider();
    const format = new Format("test");
    await format.fromJSON(unitsProvider, formatData).catch(() => { });

    for (const testEntry of testData) {
      const quantityProps = await Parser.parseIntoQuantity(testEntry.value, format, unitsProvider);
      // console.log (`quantityProps=${JSON.stringify(quantityProps)}`);
      expect(Math.fround(quantityProps.magnitude)).to.eql(Math.fround(testEntry.quantity.magnitude));
      expect(quantityProps.unit.name).to.eql(testEntry.quantity.unitName);
    }
  });

  it("Parse into Length FT Quantities w/uom separator", async () => {
    const formatData = {
      composite: {
        includeZero: true,
        spacer: "",
        units: [
          {
            label: "'",
            name: "Units.FT",
          },
        ],
      },
      formatTraits: ["keepSingleZero", "applyRounding", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
      uomSeparator: "*",
    };

    const testData = [
      { value: "12,345.345", quantity: { magnitude: 12345.345, unitName: "Units.FT" } },
      { value: "3.6252e3*Miles", quantity: { magnitude: 19141056, unitName: "Units.FT" } },
      { value: "-1 1/2*FT", quantity: { magnitude: -1.5, unitName: "Units.FT" } },
      { value: "-2*FT 6*IN", quantity: { magnitude: -2.5, unitName: "Units.FT" } },
      { value: "1 1/2*FT", quantity: { magnitude: 1.5, unitName: "Units.FT" } },
      { value: "2*FT 6*IN", quantity: { magnitude: 2.5, unitName: "Units.FT" } },
      { value: "-3*IN", quantity: { magnitude: -0.25, unitName: "Units.FT" } },
    ];

    const unitsProvider = new TestUnitsProvider();
    const format = new Format("test");
    await format.fromJSON(unitsProvider, formatData).catch(() => { });
    assert.isTrue(format.hasUnits);

    for (const testEntry of testData) {
      const quantityProps = await Parser.parseIntoQuantity(testEntry.value, format, unitsProvider);
      assert.isTrue(Math.fround(quantityProps.magnitude) === Math.fround(testEntry.quantity.magnitude));
      assert.isTrue(quantityProps.unit.name === testEntry.quantity.unitName);
    }
  });

  it("Parse into Station Quantities", async () => {
    const unitsProvider = new TestUnitsProvider();

    const formatData = {
      composite: {
        includeZero: true,
        spacer: " ",
        units: [
          {
            label: "ft",
            name: "Units.FT",
          },
        ],
      },
      formatTraits: ["trailZeroes", "keepSingleZero", "keepDecimalPoint"],
      minWidth: 2,
      precision: 2,
      stationOffsetSize: 2,
      type: "Station",
    };

    const testData = [
      { value: "7563+45.345", quantity: { magnitude: 756345.345, unitName: "Units.FT" } },
      { value: "-7563+45.345", quantity: { magnitude: -756345.345, unitName: "Units.FT" } },
    ];

    const format = new Format("test");
    await format.fromJSON(unitsProvider, formatData).catch(() => { });
    assert.isTrue(format.hasUnits);

    for (const testEntry of testData) {
      const quantityProps = await Parser.parseIntoQuantity(testEntry.value, format, unitsProvider);
      assert.isTrue(Math.fround(quantityProps.magnitude) === Math.fround(testEntry.quantity.magnitude));
      assert.isTrue(quantityProps.unit.name === testEntry.quantity.unitName);
    }
  });

  it("Parse into Angle Quantities", async () => {
    const formatData = {
      composite: {
        includeZero: true,
        spacer: "",
        units: [
          {
            label: "°",
            name: "Units.ARC_DEG",
          },
          {
            label: "'",
            name: "Units.ARC_MINUTE",
          },
          {
            label: "\"",
            name: "Units.ARC_SECOND",
          },
        ],
      },
      formatTraits: ["keepSingleZero", "keepDecimalPoint", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
      uomSeparator: "",
    };

    const testData = [
      { value: "-135°11'30.5\"", defaultUnit: "Units.ARC_DEG", quantity: { magnitude: -135.19180555555556, unitName: "Units.ARC_DEG" } },
      { value: "135°11'30.5\"", defaultUnit: "Units.ARC_DEG", quantity: { magnitude: 135.19180555555556, unitName: "Units.ARC_DEG" } },
    ];

    const unitsProvider = new TestUnitsProvider();
    const format = new Format("test");
    await format.fromJSON(unitsProvider, formatData).catch(() => { });
    assert.isTrue(format.hasUnits);

    for (const testEntry of testData) {
      const quantityProps = await Parser.parseIntoQuantity(testEntry.value, format, unitsProvider);
      assert.isTrue(Math.fround(quantityProps.magnitude) === Math.fround(testEntry.quantity.magnitude));
      assert.isTrue(quantityProps.unit.name === testEntry.quantity.unitName);
    }
  });

  it("Parse into Length Quantities with Fraction dash", async () => {
    const formatData = {
      formatTraits: ["keepSingleZero", "showUnitLabel", "fractionDash"],
      precision: 8,
      type: "Fractional",
      uomSeparator: " ",
    };

    const testData = [
      { value: "-1-1/2FT", quantity: { magnitude: -1.5, unitName: "Units.FT" } },
      { value: "1-1/2 FT", quantity: { magnitude: 1.5, unitName: "Units.FT" } },
      { value: "FT", quantity: { magnitude: 0.0, unitName: "Units.FT" } },
    ];

    const unitsProvider = new TestUnitsProvider();
    const format = new Format("test");
    await format.fromJSON(unitsProvider, formatData).catch(() => { });
    assert.isTrue(!format.hasUnits);

    for (const testEntry of testData) {
      const quantityProps = await Parser.parseIntoQuantity(testEntry.value, format, unitsProvider);
      assert.isTrue(Math.fround(quantityProps.magnitude) === Math.fround(testEntry.quantity.magnitude));
      assert.isTrue(quantityProps.unit.name === testEntry.quantity.unitName);
    }
  });

  it("Parse into Survey Length Quantities into meters", async () => {
    const formatData = {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "usft", name: "Units.US_SURVEY_FT" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    };

    const testData = [
      { value: "1000 usft", magnitude: 304.8006096012192 },  // label should match the label in the Format so it will use SURVEY_FT
      { value: "1000 ft (US Survey)", magnitude: 304.8006096012192 },  // label should match a valid SURVEY_FT label or alternate label
      { value: "1000 USF", magnitude: 304.8006096012192 }, // label should match a valid SURVEY_FT label or alternate label
      { value: "1000 ft", magnitude: 304.8006096012192 },  // label should match a valid SURVEY_FT label or alternate label
      { value: "1000 USF", magnitude: 304.8006096012192 }, // label should match a valid SURVEY_FT label or alternate label
      { value: "1000", magnitude: 304.8006096012192 },  // no label should default to SURVEY_FT from Format
      { value: "1000 f", magnitude: 304.8 },  // "f" is only valid for Units.FT so convert based on feet
      { value: "1000'", magnitude: 304.8 },  // "'" is only valid for Units.FT so convert based on feet
    ];

    const unitsProvider = new TestUnitsProvider();
    const format = new Format("test");
    await format.fromJSON(unitsProvider, formatData).catch(() => { });
    assert.isTrue(format.hasUnits);

    const persistenceUnit = await unitsProvider.findUnitByName("Units.M");
    const unitConversions = await Parser.createUnitConversionSpecsForUnit(unitsProvider, persistenceUnit);

    for (const testEntry of testData) {
      const result = Parser.parseToQuantityValue(testEntry.value, format, unitConversions);
      expect(Parser.isParsedQuantity(result)).to.be.true;
      if (Parser.isParsedQuantity(result)) {
        expect(Math.fround(result.value * 1000000)).to.be.eql(Math.fround(testEntry.magnitude * 1000000));
      }
    }
  });

  it("Parse into Survey Length Quantities", async () => {
    const formatData = {
      composite: {
        includeZero: true,
        spacer: "",
        units: [{ label: "usft", name: "Units.US_SURVEY_FT" }],
      },
      formatTraits: ["keepSingleZero", "showUnitLabel"],
      precision: 4,
      type: "Decimal",
    };

    const testData = [
      { value: "1000 usft", quantity: { magnitude: 1000, unitName: "Units.US_SURVEY_FT" } },  // label should match the label in the Format so it will use SURVEY_FT
      { value: "1000 ft (US Survey)", quantity: { magnitude: 1000, unitName: "Units.US_SURVEY_FT" } },  // label should match a valid SURVEY_FT label or alternate label
      { value: "1000 USF", quantity: { magnitude: 1000, unitName: "Units.US_SURVEY_FT" } }, // label should match a valid SURVEY_FT label or alternate label
      { value: "1000 ft", quantity: { magnitude: 1000, unitName: "Units.US_SURVEY_FT" } },  // label should match a valid SURVEY_FT label or alternate label
      { value: "1000 USF", quantity: { magnitude: 1000, unitName: "Units.US_SURVEY_FT" } }, // label should match a valid SURVEY_FT label or alternate label
      { value: "1000", quantity: { magnitude: 1000, unitName: "Units.US_SURVEY_FT" } },  // no label should default to SURVEY_FT from Format
      { value: "1000 f", quantity: { magnitude: 999.998, unitName: "Units.US_SURVEY_FT" } },  // "f" is only valid for Units.FT so convert based on feet
      { value: "1000'", quantity: { magnitude: 999.998, unitName: "Units.US_SURVEY_FT" } },  // "'" is only valid for Units.FT so convert based on feet
    ];

    const unitsProvider = new TestUnitsProvider();
    const format = new Format("test");
    await format.fromJSON(unitsProvider, formatData).catch(() => { });
    assert.isTrue(format.hasUnits);

    for (const testEntry of testData) {
      const quantityProps = await Parser.parseIntoQuantity(testEntry.value, format, unitsProvider);
      // console.log (`quantityProps=${JSON.stringify(quantityProps)}`);
      expect(Math.fround(quantityProps.magnitude * 1000000)).to.be.eql(Math.fround(testEntry.quantity.magnitude * 1000000));
      expect(quantityProps.unit.name).to.be.eql(testEntry.quantity.unitName);
    }
  });
});

describe("Synchronous Parsing tests:", async () => {
  const unitsProvider = new TestUnitsProvider();
  const outUnit = await unitsProvider.findUnitByName("Units.M");
  // specs to convert parsed unit in an output unit of meter
  const meterConversionSpecs = await Parser.createUnitConversionSpecs(unitsProvider, "Units.M", [
    { unitName: "Units.M" },
    { unitName: "Units.MM" },
    { unitName: "Units.CM" },
    { unitName: "Units.IN" },
    { unitName: "Units.FT", altLabels: ["foot", "feet"] },
    { unitName: "Units.YRD", altLabels: ["yd", "yds"] },
  ]);

  const formatData = {
    composite: {
      includeZero: true,
      spacer: "-",
      units: [{ label: "'", name: "Units.FT" }, { label: "\"", name: "Units.IN" }],
    },
    formatTraits: ["keepSingleZero", "showUnitLabel"],
    precision: 8,
    type: "Fractional",
    uomSeparator: "",
  };

  const format = new Format("test");
  await format.fromJSON(unitsProvider, formatData).catch(() => { });

  const parserSpec = await ParserSpec.create(format, unitsProvider, outUnit);
  const formatSpec = await FormatterSpec.create("test", format, unitsProvider, outUnit);

  const angleFormatData = {
    composite: {
      includeZero: true,
      spacer: "",
      units: [
        {
          label: "°",
          name: "Units.ARC_DEG",
        },
        {
          label: "'",
          name: "Units.ARC_MINUTE",
        },
        {
          label: "\"",
          name: "Units.ARC_SECOND",
        },
      ],
    },
    formatTraits: ["keepSingleZero", "showUnitLabel"],
    precision: 2,
    type: "Decimal",
    uomSeparator: "",
  };

  const angleFormat = new Format("testAngle");
  await angleFormat.fromJSON(unitsProvider, angleFormatData).catch(() => { });
  const outAngleUnit = await unitsProvider.findUnitByName("Units.ARC_DEG");
  const angleParserSpec = await ParserSpec.create(angleFormat, unitsProvider, outAngleUnit);
  const angleFormatSpec = await FormatterSpec.create("test", angleFormat, unitsProvider, outAngleUnit);

  it("Parse into length values using custom parse labels", () => {
    const testData = [
      // if no quantity is provided then the format unit is used to determine unit
      { value: "12,345.345", magnitude: 3762.861156 },
      { value: "1", magnitude: 0.3048 },
      { value: "1 '", magnitude: 0.3048 },
      { value: "1 FT", magnitude: 0.3048 },
      { value: "1 F", magnitude: 0.3048 },
      { value: "-2FT 6IN", magnitude: -0.762 },
      { value: "1 1/2FT", magnitude: 0.45720000000000005 },
      { value: "2' 6\"", magnitude: 0.762 },
      { value: "1 yd", magnitude: 0.9144 },
      { value: "1yd", magnitude: 0.9144 },
      { value: "1 yds", magnitude: 0.9144 },
      { value: "1yrd", magnitude: 0.9144 },
      { value: "1 m", magnitude: 1 },
      { value: "1m", magnitude: 1 },
      { value: "1 MM", magnitude: 0.001 },
      { value: "1MM", magnitude: 0.001 },
      { value: "1000MM", magnitude: 1 },
      { value: "1CM", magnitude: 0.01 },
      { value: "1 CM", magnitude: 0.01 },
      { value: "100cm", magnitude: 1 },
      { value: "-100cm", magnitude: -1 },
    ];

    if (logTestOutput) {
      for (const spec of meterConversionSpecs) {
        // eslint-disable-next-line no-console
        console.log(`unit ${spec.name} factor= ${spec.conversion.factor} labels=${spec.parseLabels}`);
      }
    }

    for (const testEntry of testData) {
      const parseResult = Parser.parseToQuantityValue(testEntry.value, format, meterConversionSpecs);
      if (logTestOutput) {
        if (Parser.isParsedQuantity(parseResult))
          console.log(`input=${testEntry.value} output=${parseResult.value}`); // eslint-disable-line no-console
        else if (Parser.isParseError(parseResult))
          console.log(`input=${testEntry.value} error=${parseResult.error}`); // eslint-disable-line no-console
      }
      assert.isTrue(Parser.isParsedQuantity(parseResult));
      if (Parser.isParsedQuantity(parseResult))
        assert.isTrue(Math.abs(parseResult.value - testEntry.magnitude) < 0.0001);
    }
  });

  it("Parse into length values using default parse labels", () => {
    const testData = [
      // if no quantity is provided then the format unit is used to determine unit
      { value: "12,345.345", magnitude: 3762.861156 },
      { value: "1", magnitude: 0.3048 },
      { value: "1 '", magnitude: 0.3048 },
      { value: "1 FT", magnitude: 0.3048 },
      { value: "1 F", magnitude: 0.3048 },
      { value: "-2 FT 6 IN", magnitude: -0.762 },
      { value: "1 1/2FT", magnitude: 0.45720000000000005 },
      { value: "2FT 6IN", magnitude: 0.762 },
      { value: "1 yd", magnitude: 0.9144 },
      { value: "1yd", magnitude: 0.9144 },
      { value: "1 yrd", magnitude: 0.9144 },
      { value: "1 m", magnitude: 1 },
      { value: "1m", magnitude: 1 },
      { value: "1 MM", magnitude: 0.001 },
      { value: "1MM", magnitude: 0.001 },
      { value: "1000MM", magnitude: 1 },
      { value: "1CM", magnitude: 0.01 },
      { value: "1 CM", magnitude: 0.01 },
      { value: "100cm", magnitude: 1 },
      { value: "-100cm", magnitude: -1 },
      { value: "27'", magnitude: 8.2296 },
    ];

    if (logTestOutput) {
      for (const spec of parserSpec.unitConversions) {
        // eslint-disable-next-line no-console
        console.log(`unit ${spec.name} factor= ${spec.conversion.factor} labels=${spec.parseLabels}`);
      }
    }

    for (const testEntry of testData) {
      const parseResult = Parser.parseQuantityString(testEntry.value, parserSpec);
      assert.isTrue(Parser.isParsedQuantity(parseResult));
      if (Parser.isParsedQuantity(parseResult)) {
        if (logTestOutput) {
          // eslint-disable-next-line no-console
          console.log(`input=${testEntry.value} output=${parseResult.value}`);
        }
        assert.isTrue(Math.abs(parseResult.value - testEntry.magnitude) < 0.0001);
        const formattedValue = Formatter.formatQuantity(parseResult.value, formatSpec);

        if (logTestOutput) {
          // eslint-disable-next-line no-console
          console.log(`    formatted value=${formattedValue}`);
        }
      }
    }
  });

  it("Parse into angle values using default parse labels", () => {
    const testData = [
      // if no quantity is provided then the format unit is used to determine unit
      { value: "15^30'", magnitude: 15.5 },
      { value: "15.5", magnitude: 15.5 },
    ];

    if (logTestOutput) {
      for (const spec of angleParserSpec.unitConversions) {
        // eslint-disable-next-line no-console
        console.log(`unit ${spec.name} factor= ${spec.conversion.factor} labels=${spec.parseLabels}`);
      }
    }

    for (const testEntry of testData) {
      const parseResult = Parser.parseQuantityString(testEntry.value, angleParserSpec);
      assert.isTrue(Parser.isParsedQuantity(parseResult));
      if (Parser.isParsedQuantity(parseResult)) {
        if (logTestOutput) {
          // eslint-disable-next-line no-console
          console.log(`input=${testEntry.value} output=${parseResult.value}`);
        }
        assert.isTrue(Math.abs(parseResult.value - testEntry.magnitude) < 0.0001);
        const formattedValue = Formatter.formatQuantity(parseResult.value, angleFormatSpec);

        if (logTestOutput) {
          // eslint-disable-next-line no-console
          console.log(`    formatted value=${formattedValue}`);
        }
      }
    }
  });

});
