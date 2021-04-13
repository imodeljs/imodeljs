/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { SchemaContext } from "../../Context";
import { JsonParser } from "../../Deserialization/JsonParser";
import { FormatProps } from "../../Deserialization/JsonProps";
import { ECObjectsError } from "../../Exception";
import { Format } from "../../Metadata/Format";
import { MutableSchema, Schema } from "../../Metadata/Schema";
import { DecimalPrecision, FormatTraits, FormatType, QuantityError, ShowSignOption } from "@bentley/imodeljs-quantity";
import { createSchemaJsonWithItems } from "../TestUtils/DeserializationHelpers";
import { TestSchemaLocater } from "../TestUtils/FormatTestHelper";
import { createEmptyXmlDocument, getElementChildrenByTagName } from "../TestUtils/SerializationHelper";

/* eslint-disable @typescript-eslint/naming-convention */

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

function createSchemaJson(koq: any) {
  return createSchemaJsonWithItems({
    TestFormat: {
      schemaItemType: "Format",
      ...koq,
    },
  }, {
    references: [
      {
        name: "Formats",
        version: "1.0.0",
      },
    ],
  });
}

describe("Format", () => {
  let schema: Schema;
  let testFormat: Format;

  describe("type checking json", () => {
    let jsonParser: JsonParser; // This is an easy way to test the logic directly in the parser without having to go through deserialization every time.

    const rawSchema = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "TestSchema",
      version: "1.2.3",
      items: {
        TestFormat: {
          schemaItemType: "Format",
        },
      },
    };

    function createFormatJson(extraStuff: any): any {
      return {
        schemaItemType: "Format",
        type: "Decimal",
        ...extraStuff,
      };
    }

    beforeEach(() => {
      jsonParser = new JsonParser(rawSchema);
      jsonParser.findItem("TestFormat"); // Hack for testing to force the Format name cache to populated within the Parser to allow for valid error messages.
    });

    it("check valid Format ECJSON", () => {
      const correctFormat = {
        type: "Decimal",
        precision: 5,
        roundFactor: 5,
        minWidth: 5,
        showSignOption: "",
        formatTraits: "",
        decimalSeparator: "",
        thousandSeparator: "",
        uomSeparator: "",
        scientificType: "",
        stationOffsetSize: 4,
        stationSeparator: "",
        composite: {
          spacer: "",
          includeZero: true,
          units: [
            {
              name: "",
              label: "",
            },
          ],
        },
      };

      const formatProps = jsonParser.parseFormat(correctFormat);
      assert.isDefined(formatProps);
    });

    it("missing type attribute", () => {
      const missingType = { schemaItemType: "Format" };
      assert.throws(() => jsonParser.parseFormat(missingType), ECObjectsError, `The Format TestSchema.TestFormat does not have the required 'type' attribute.`);
    });

    it("invalid type attribute", () => {
      const invalidType = { schemaItemType: "Format", type: true };
      assert.throws(() => jsonParser.parseFormat(invalidType), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'type' attribute. It should be of type 'string'.`);
    });

    it("invalid precision attribute", () => {
      const invalidPrecision = { precision: "" };
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidPrecision)), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'precision' attribute. It should be of type 'number'.`);
    });

    it("invalid roundFactor attribute", () => {
      const invalidRoundFactor = { roundFactor: "" };
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidRoundFactor)), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'roundFactor' attribute. It should be of type 'number'.`);
    });

    it("invalid minWidth attribute", () => {
      const invalidMinWidth = { minWidth: "" };
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidMinWidth)), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'minWidth' attribute. It should be of type 'number'.`);
    });

    it("invalid showSignOption attribute", () => {
      const invalidShowSignOption = { showSignOption: true };
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidShowSignOption)), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'showSignOption' attribute. It should be of type 'string'.`);
    });

    it("invalid formatTraits attribute", () => {
      const invalidFormatTraits = { formatTraits: true };
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidFormatTraits)), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'formatTraits' attribute. It should be of type 'string' or 'string[]'.`);
    });

    it("invalid decimalSeparator attribute", () => {
      const invalidDecimalSeparator = { decimalSeparator: true };
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidDecimalSeparator)), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'decimalSeparator' attribute. It should be of type 'string'.`);
    });

    it("invalid thousandSeparator attribute", () => {
      const invalidThousandSeparator = { thousandSeparator: true };
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidThousandSeparator)), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'thousandSeparator' attribute. It should be of type 'string'.`);
    });

    it("invalid uomSeparator attribute", () => {
      const invalidUOMSeparator = { uomSeparator: true };
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidUOMSeparator)), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'uomSeparator' attribute. It should be of type 'string'.`);
    });

    it("invalid scientificType attribute", () => {
      const invalidScientificType = { scientificType: true };
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidScientificType)), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'scientificType' attribute. It should be of type 'string'.`);
    });

    it("invalid stationOffsetSize attribute", () => {
      const invalidStationOffsetSize = { stationOffsetSize: true };
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidStationOffsetSize)), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'stationOffsetSize' attribute. It should be of type 'number'.`);
    });

    it("invalid stationSeparator attribute", () => {
      const invalidStationSeparator = { stationSeparator: true };
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidStationSeparator)), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'stationSeparator' attribute. It should be of type 'string'.`);
    });

    it("invalid composite attribute", () => {
      const invalidComposite = { composite: true };
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidComposite)), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'composite' object.`);
    });

    const invalidCompositeSpacer = {
      composite: {
        spacer: true,
      },
    };
    it("invalid composite spacer attribute", () => {
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidCompositeSpacer)), ECObjectsError, `The Format TestSchema.TestFormat has a Composite with an invalid 'spacer' attribute. It should be of type 'string'.`);
    });

    const invalidCompositeIncludeZero = {
      composite: {
        includeZero: "",
      },
    };
    it("invalid composite include zero attribute", () => {
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidCompositeIncludeZero)), ECObjectsError, `The Format TestSchema.TestFormat has a Composite with an invalid 'includeZero' attribute. It should be of type 'boolean'.`);
    });

    const invalidCompositeUnits = {
      composite: {
        units: true,
      },
    };
    it("invalid composite units attribute", () => {
      assert.throws(() => jsonParser.parseFormat(createFormatJson(invalidCompositeUnits)), ECObjectsError, `The Format TestSchema.TestFormat has a Composite with an invalid 'units' attribute. It should be of type 'object[]'.`);
    });
  }); // type checking json

  describe("deserialize formatted ECJSON", () => {
    beforeEach(() => {
      schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
      testFormat = (schema as MutableSchema).createFormatSync("TestFormat");
    });

    const validPropsWithoutUnits: FormatProps = {
      schemaItemType: "Format",
      label: "myfi4",
      description: "Some tests description",
      roundFactor: 15.0, // Non-default value
      type: "decimal",
      showSignOption: "noSign",
      formatTraits: "keepSingleZero|trailZeroes",
      precision: 12,
      decimalSeparator: "-",
      thousandSeparator: "!",
      uomSeparator: "$",
    };
    it("sync - valid decimal format", () => {
      testFormat.fromJSONSync(validPropsWithoutUnits);
      expect(testFormat.label, "myfi4");
      expect(testFormat.description).eq("Some tests description");
      expect(testFormat.roundFactor).eq(15.0);
      expect(testFormat.type).eq(FormatType.Decimal);
      expect(testFormat.showSignOption).eq(ShowSignOption.NoSign);
      expect(testFormat.hasFormatTrait(FormatTraits.KeepSingleZero)).true;
      expect(testFormat.hasFormatTrait(FormatTraits.TrailZeroes)).true;
      expect(testFormat.hasFormatTrait(FormatTraits.ApplyRounding)).false;
      expect(testFormat.precision).eq(DecimalPrecision.Twelve);
      expect(testFormat.decimalSeparator).eq("-");
      expect(testFormat.thousandSeparator).eq("!");
      expect(testFormat.uomSeparator).eq("$");
    });
    it("async - valid decimal format", async () => {
      await testFormat.fromJSON(validPropsWithoutUnits);
      expect(testFormat.label, "myfi4");
      expect(testFormat.description).eq("Some tests description");
      expect(testFormat.roundFactor).eq(15.0);
      expect(testFormat.type).eq(FormatType.Decimal);
      expect(testFormat.showSignOption).eq(ShowSignOption.NoSign);
      expect(testFormat.hasFormatTrait(FormatTraits.KeepSingleZero)).true;
      expect(testFormat.hasFormatTrait(FormatTraits.TrailZeroes)).true;
      expect(testFormat.hasFormatTrait(FormatTraits.ApplyRounding)).false;
      expect(testFormat.precision).eq(DecimalPrecision.Twelve);
      expect(testFormat.decimalSeparator).eq("-");
      expect(testFormat.thousandSeparator).eq("!");
      expect(testFormat.uomSeparator).eq("$");
    });

    const invalidTypeAttributeValue: FormatProps = {
      schemaItemType: "Format",
      type: "BadType",
    };
    it("sync - invalid type attribute value", () => {
      assert.throws(() => testFormat.fromJSONSync(invalidTypeAttributeValue), QuantityError, `The Format TestFormat has an invalid 'type' attribute.`);
    });
    it("async - invalid type attribute value", async () => {
      await expect(testFormat.fromJSON(invalidTypeAttributeValue)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'type' attribute.`);
    });

    const invalidPrecisionDecimal: FormatProps = {
      schemaItemType: "Format",
      type: "decimal",
      precision: 13,
    };
    const invalidPrecisionScientific: FormatProps = {
      schemaItemType: "Format",
      type: "scientific",
      scientificType: "normalized",
      precision: 30,
    };
    const invalidPrecisionStation: FormatProps = {
      schemaItemType: "Format",
      type: "station",
      stationOffsetSize: 3,
      precision: -1,
    };
    it("sync - precision value is invalid with different format types", () => {
      assert.throws(() => testFormat.fromJSONSync(invalidPrecisionDecimal), QuantityError, `The Format TestFormat has an invalid 'precision' attribute.`);
      assert.throws(() => testFormat.fromJSONSync(invalidPrecisionScientific), QuantityError, `The Format TestFormat has an invalid 'precision' attribute.`);
      assert.throws(() => testFormat.fromJSONSync(invalidPrecisionStation), QuantityError, `The Format TestFormat has an invalid 'precision' attribute.`);
    });
    it("async - precision value is invalid with different format types", async () => {
      await expect(testFormat.fromJSON(invalidPrecisionDecimal)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'precision' attribute.`);
      await expect(testFormat.fromJSON(invalidPrecisionScientific)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'precision' attribute.`);
      await expect(testFormat.fromJSON(invalidPrecisionStation)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'precision' attribute.`);
    });

    const validPrecisionDecimal: FormatProps = {
      schemaItemType: "Format",
      type: "decimal",
      precision: 3,
    };
    const validPrecisionScientific: FormatProps = {
      schemaItemType: "Format",
      type: "scientific",
      scientificType: "normalized",
      precision: 0,
    };
    const validPrecisionStation: FormatProps = {
      schemaItemType: "Format",
      type: "station",
      stationOffsetSize: 3,
      precision: 12,
    };
    it("sync - precision value is valid with different format types", () => {
      testFormat.fromJSONSync(validPrecisionDecimal);
      assert.strictEqual(testFormat.precision, 3);

      testFormat = (schema as MutableSchema).createFormatSync("TestFormatA");
      testFormat.fromJSONSync(validPrecisionScientific);
      assert.strictEqual(testFormat.precision, 0);

      testFormat = (schema as MutableSchema).createFormatSync("TestFormatB");
      testFormat.fromJSONSync(validPrecisionStation);
      assert.strictEqual(testFormat.precision, 12);
    });

    it("async - precision value is valid with different format types", async () => {
      await testFormat.fromJSON(validPrecisionDecimal);
      assert.strictEqual(testFormat.precision, 3);

      testFormat = (schema as MutableSchema).createFormatSync("TestFormatA");
      await testFormat.fromJSON(validPrecisionScientific);
      assert.strictEqual(testFormat.precision, 0);

      testFormat = (schema as MutableSchema).createFormatSync("TestFormatB");
      await testFormat.fromJSON(validPrecisionStation);
      assert.strictEqual(testFormat.precision, 12);
    });

    const invalidMinWidth: Mutable<FormatProps> = {
      schemaItemType: "Format",
      type: "Decimal",
      minWidth: 5.5,
    };
    it("sync - minWidth value is invalid", () => {
      assert.throws(() => testFormat.fromJSONSync(invalidMinWidth), QuantityError, `The Format TestFormat has an invalid 'minWidth' attribute. It should be a positive integer.`);

      invalidMinWidth.minWidth = -1;
      assert.throws(() => testFormat.fromJSONSync(invalidMinWidth), QuantityError, `The Format TestFormat has an invalid 'minWidth' attribute. It should be a positive integer.`);
    });
    it("async - minWidth value is invalid", async () => {
      invalidMinWidth.minWidth = 5.5; // TODO fix this
      await expect(testFormat.fromJSON(invalidMinWidth)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'minWidth' attribute. It should be a positive integer.`);

      invalidMinWidth.minWidth = -1;
      await expect(testFormat.fromJSON(invalidMinWidth)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'minWidth' attribute. It should be a positive integer.`);
    });

    const missingScientificType: FormatProps = {
      schemaItemType: "Format",
      type: "Scientific",
    };
    it("sync - scientific type is required when type is scientific", () => {
      assert.throws(() => testFormat.fromJSONSync(missingScientificType), QuantityError, `The Format TestFormat is 'Scientific' type therefore the attribute 'scientificType' is required.`);
    });
    it("async - scientific type is required when type is scientific", async () => {
      await expect(testFormat.fromJSON(missingScientificType)).to.be.rejectedWith(QuantityError, `The Format TestFormat is 'Scientific' type therefore the attribute 'scientificType' is required.`);
    });

    const invalidScientificType: FormatProps = {
      schemaItemType: "Format",
      type: "Scientific",
      scientificType: "badType",
    };
    it("sync - scientific type is not supported", () => {
      assert.throws(() => testFormat.fromJSONSync(invalidScientificType), QuantityError, `The Format TestFormat has an invalid 'scientificType' attribute.`);
    });
    it("async - scientific type is not supported", async () => {
      await expect(testFormat.fromJSON(invalidScientificType)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'scientificType' attribute.`);
    });

    const missingStationOffsetSize: FormatProps = {
      schemaItemType: "Format",
      type: "station",
    };
    it("sync - stationOffsetSize is required when type is station", () => {
      assert.throws(() => testFormat.fromJSONSync(missingStationOffsetSize), QuantityError, `The Format TestFormat is 'Station' type therefore the attribute 'stationOffsetSize' is required.`);
    });
    it("async - stationOffsetSize is required when type is station", async () => {
      await expect(testFormat.fromJSON(missingStationOffsetSize)).to.be.rejectedWith(QuantityError, `The Format TestFormat is 'Station' type therefore the attribute 'stationOffsetSize' is required.`);
    });

    const invalidStationOffsetSize: FormatProps = {
      schemaItemType: "Format",
      type: "station",
      stationOffsetSize: -1,
    };
    it("sync - stationOffsetSize is invalid value", () => {
      assert.throws(() => testFormat.fromJSONSync(invalidStationOffsetSize), QuantityError, `The Format TestFormat has an invalid 'stationOffsetSize' attribute.`);
    });
    it("async - stationOffsetSize is invalid value", async () => {
      await expect(testFormat.fromJSON(invalidStationOffsetSize)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'stationOffsetSize' attribute.`);
    });

    const invalidShowSignOption: FormatProps = {
      schemaItemType: "Format",
      type: "decimal",
      showSignOption: "noSigned",
    };
    it("sync - scientific type is not supported", () => {
      assert.throws(() => testFormat.fromJSONSync(invalidShowSignOption), QuantityError, `The Format TestFormat has an invalid 'showSignOption' attribute.`);
    });
    it("async - scientific type is not supported", async () => {
      await expect(testFormat.fromJSON(invalidShowSignOption)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'showSignOption' attribute.`);
    });

    const invalidDecimalSeparator: FormatProps = {
      schemaItemType: "Format",
      type: "decimal",
      decimalSeparator: "badSeparator",
    };
    it("sync - decimal separator cannot be larger than 1 character", () => {
      assert.throws(() => testFormat.fromJSONSync(invalidDecimalSeparator), QuantityError, `The Format TestFormat has an invalid 'decimalSeparator' attribute. It should be an empty or one character string.`);
    });
    it("async - decimal separator cannot be larger than 1 character", async () => {
      await expect(testFormat.fromJSON(invalidDecimalSeparator)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'decimalSeparator' attribute. It should be an empty or one character string.`);
    });

    const invalidThousandSeparator: FormatProps = {
      schemaItemType: "Format",
      type: "decimal",
      thousandSeparator: "badSeparator",
    };
    it("sync - thousand separator cannot be larger than 1 character", () => {
      assert.throws(() => testFormat.fromJSONSync(invalidThousandSeparator), QuantityError, `The Format TestFormat has an invalid 'thousandSeparator' attribute. It should be an empty or one character string.`);
    });
    it("async - thousand separator cannot be larger than 1 character", async () => {
      await expect(testFormat.fromJSON(invalidThousandSeparator)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'thousandSeparator' attribute. It should be an empty or one character string.`);
    });

    const invalidUOMSeparator: FormatProps = {
      schemaItemType: "Format",
      type: "decimal",
      uomSeparator: "badSeparator",
    };
    it("sync - UOM separator cannot be larger than 1 character", () => {
      assert.throws(() => testFormat.fromJSONSync(invalidUOMSeparator), QuantityError, `The Format TestFormat has an invalid 'uomSeparator' attribute. It should be an empty or one character string.`);
    });
    it("async - UOM separator cannot be larger than 1 character", async () => {
      await expect(testFormat.fromJSON(invalidUOMSeparator)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'uomSeparator' attribute. It should be an empty or one character string.`);
    });

    const invalidStationSeparator: FormatProps = {
      schemaItemType: "Format",
      type: "decimal",
      stationSeparator: "badSeparator",
    };
    it("sync - station separator cannot be larger than 1 character", () => {
      assert.throws(() => testFormat.fromJSONSync(invalidStationSeparator), QuantityError, `The Format TestFormat has an invalid 'stationSeparator' attribute. It should be an empty or one character string.`);
    });
    it("async - station separator cannot be larger than 1 character", async () => {
      await expect(testFormat.fromJSON(invalidStationSeparator)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'stationSeparator' attribute. It should be an empty or one character string.`);
    });

    describe("format traits", () => {
      const validEmptyFormatTraitSring: FormatProps = {
        schemaItemType: "Format",
        type: "decimal",
        formatTraits: "",
      };
      it("sync - ", () => {
        testFormat.fromJSONSync(validEmptyFormatTraitSring);
        assert.isTrue(testFormat.hasFormatTrait(0x0));
      });
      it("async - ", async () => {
        await testFormat.fromJSON(validEmptyFormatTraitSring);
        assert.isTrue(testFormat.hasFormatTrait(0x0));
      });

      const validFormatTraitString: FormatProps = {
        schemaItemType: "Format",
        type: "decimal",
        formatTraits: "trailZeroes|keepSingleZero|zeroEmpty|keepDecimalPoint|applyRounding|fractionDash|showUnitLabel|prependUnitLabel|use1000Separator|exponentOnlyNegative",
      };
      it("sync - all valid options defined in a string", () => {
        testFormat.fromJSONSync(validFormatTraitString);
        expect(testFormat.hasFormatTrait(FormatTraits.TrailZeroes)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.KeepSingleZero)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ZeroEmpty)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.KeepDecimalPoint)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ApplyRounding)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.FractionDash)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ShowUnitLabel)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.PrependUnitLabel)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.Use1000Separator)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ExponentOnlyNegative)).true;
      });
      it("async - all valid options defined in a string", async () => {
        await testFormat.fromJSON(validFormatTraitString);
        expect(testFormat.hasFormatTrait(FormatTraits.TrailZeroes)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.KeepSingleZero)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ZeroEmpty)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.KeepDecimalPoint)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ApplyRounding)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.FractionDash)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ShowUnitLabel)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.PrependUnitLabel)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.Use1000Separator)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ExponentOnlyNegative)).true;
      });

      // TODO: Consolidate this and above test to reduce code...
      const validFormatTraitArray: FormatProps = {
        schemaItemType: "Format",
        type: "decimal",
        formatTraits: [
          "trailZeroes",
          "keepSingleZero",
          "zeroEmpty",
          "keepDecimalPoint",
          "applyRounding",
          "fractionDash",
          "showUnitLabel",
          "prependUnitLabel",
          "use1000Separator",
          "exponentOnlyNegative",
        ],
      };
      it("sync - all valid options defined in a array", () => {
        testFormat.fromJSONSync(validFormatTraitArray);
        expect(testFormat.hasFormatTrait(FormatTraits.TrailZeroes)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.KeepSingleZero)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ZeroEmpty)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.KeepDecimalPoint)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ApplyRounding)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.FractionDash)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ShowUnitLabel)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.PrependUnitLabel)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.Use1000Separator)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ExponentOnlyNegative)).true;
      });
      it("async - all valid options defined in a array", async () => {
        await testFormat.fromJSON(validFormatTraitArray);
        expect(testFormat.hasFormatTrait(FormatTraits.TrailZeroes)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.KeepSingleZero)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ZeroEmpty)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.KeepDecimalPoint)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ApplyRounding)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.FractionDash)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ShowUnitLabel)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.PrependUnitLabel)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.Use1000Separator)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ExponentOnlyNegative)).true;
      });

      const validFormatTraitSeparator: FormatProps = {
        schemaItemType: "Format",
        type: "decimal",
        formatTraits: "trailZeroes;keepSingleZero|zeroEmpty,applyRounding",
      };
      it("sync - valid multiple separators", () => {
        testFormat.fromJSONSync(validFormatTraitSeparator);
        expect(testFormat.hasFormatTrait(FormatTraits.TrailZeroes)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.KeepSingleZero)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ZeroEmpty)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ApplyRounding)).true;
      });
      it("async - valid multiple separators", async () => {
        await testFormat.fromJSON(validFormatTraitSeparator);
        expect(testFormat.hasFormatTrait(FormatTraits.TrailZeroes)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.KeepSingleZero)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ZeroEmpty)).true;
        expect(testFormat.hasFormatTrait(FormatTraits.ApplyRounding)).true;
      });

      const invalidSeparator: FormatProps = {
        schemaItemType: "Format",
        type: "decimal",
        formatTraits: "applyRounding\fractionDash;showUnitLabel",
      };
      it("sync - invalid format trait separator", () => {
        assert.throws(() => testFormat.fromJSONSync(invalidSeparator), QuantityError, `The Format TestFormat has an invalid 'formatTraits' attribute.`);
      });
      it("async - invalid format trait separator", async () => {
        await expect(testFormat.fromJSON(invalidSeparator)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'formatTraits' attribute.`);
      });

      const invalidFormatTraitInString: FormatProps = {
        schemaItemType: "Format",
        type: "decimal",
        formatTraits: "badTraits",
      };
      it("sync - invalid format trait within a string", () => {
        assert.throws(() => testFormat.fromJSONSync(invalidFormatTraitInString), QuantityError, `The Format TestFormat has an invalid 'formatTraits' attribute.`);
      });
      it("async - invalid format trait within a string", async () => {
        await expect(testFormat.fromJSON(invalidFormatTraitInString)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'formatTraits' attribute.`);
      });

      const invalidFormatTraitInArray: FormatProps = {
        schemaItemType: "Format",
        type: "decimal",
        formatTraits: [
          "badTraits",
        ],
      };
      it("sync - invalid format trait within a array", () => {
        assert.throws(() => testFormat.fromJSONSync(invalidFormatTraitInArray), QuantityError, `The Format TestFormat has an invalid 'formatTraits' attribute.`);
      });
      it("async - invalid format trait within a array", async () => {
        await expect(testFormat.fromJSON(invalidFormatTraitInArray)).to.be.rejectedWith(QuantityError, `The Format TestFormat has an invalid 'formatTraits' attribute.`);
      });
    }); // formatTraits

    describe("composite", () => {
      let context: SchemaContext;
      beforeEach(() => {
        context = new SchemaContext();
        context.addLocater(new TestSchemaLocater());
      });

      const invalidSpacer = {
        type: "fractional",
        composite: {
          includeZero: false,
          spacer: "spacer",
          units: [
            { name: "Formats.MILE" },
          ],
        },
      };
      it("sync - spacer must be a one character string", () => {
        assert.throws(() => Schema.fromJsonSync(createSchemaJson(invalidSpacer), context), ECObjectsError, `The Format TestSchema.TestFormat has a composite with an invalid 'spacer' attribute. It should be an empty or one character string.`);
      });
      it("async - spacer must be a one character string", async () => {
        assert.throws(() => Schema.fromJsonSync(createSchemaJson(invalidSpacer), context), ECObjectsError, `The Format TestSchema.TestFormat has a composite with an invalid 'spacer' attribute. It should be an empty or one character string.`);
      });

      const invalidCompositeWithoutUnits = {
        type: "fractional",
        composite: {},
      };
      it("sync - invalid composite without units", () => {
        assert.throws(() => Schema.fromJsonSync(createSchemaJson(invalidCompositeWithoutUnits), context), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'Composite' attribute. It should have 1-4 units.`);
      });
      it("async - invalid composite without units", async () => {
        await expect(Schema.fromJson(createSchemaJson(invalidCompositeWithoutUnits), context)).to.be.rejectedWith(ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'Composite' attribute. It should have 1-4 units.`);
      });

      const invalidCompositeEmptyUnits = {
        type: "fractional",
        composite: {
          units: [],
        },
      };
      it("sync - invalid composite without units", () => {
        assert.throws(() => Schema.fromJsonSync(createSchemaJson(invalidCompositeEmptyUnits), context), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'Composite' attribute. It should have 1-4 units.`);
      });
      it("async - invalid composite without units", async () => {
        await expect(Schema.fromJson(createSchemaJson(invalidCompositeEmptyUnits), context)).to.be.rejectedWith(ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'Composite' attribute. It should have 1-4 units.`);
      });

      const invalidCompositeTooManyUnits = {
        type: "fractional",
        composite: {
          units: [
            { name: "Formats.MILE" },
            { name: "Formats.YRD" },
            { name: "Formats.FT" },
            { name: "Formats.IN" },
            { name: "Formats.MILLIINCH" },
          ],
        },
      };
      it("sync - invalid composite with too many units", () => {
        assert.throws(() => Schema.fromJsonSync(createSchemaJson(invalidCompositeTooManyUnits), context), ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'Composite' attribute. It should have 1-4 units.`);
      });
      it("async - invalid composite with too many units", async () => {
        await expect(Schema.fromJson(createSchemaJson(invalidCompositeTooManyUnits), context)).to.be.rejectedWith(ECObjectsError, `The Format TestSchema.TestFormat has an invalid 'Composite' attribute. It should have 1-4 units.`);
      });

      const invalidCompositeDuplicateUnits = {
        type: "fractional",
        composite: {
          units: [
            { name: "Formats.MILE" },
            { name: "Formats.MILE" },
          ],
        },
      };
      it("sync - invalid composite with duplicate units", () => {
        assert.throws(() => Schema.fromJsonSync(createSchemaJson(invalidCompositeDuplicateUnits), context), ECObjectsError, `The Format TestSchema.TestFormat has duplicate units, 'Formats.MILE'.`);
      });
      it("async - invalid composite with duplicate units", async () => {
        await expect(Schema.fromJson(createSchemaJson(invalidCompositeDuplicateUnits), context)).to.be.rejectedWith(ECObjectsError, `The Format TestSchema.TestFormat has duplicate units, 'Formats.MILE'.`);
      });

      const validComposite = {
        type: "decimal",
        composite: {
          includeZero: false,
          spacer: "-",
          units: [
            {
              name: "Formats.MILE",
              label: "mile(s)",
            },
            {
              name: "Formats.YRD",
              label: "yrd(s)",
            },
            {
              name: "Formats.FT",
              label: "'",
            },
            {
              name: "Formats.IN",
              label: "\"",
            },
          ],
        },
      };
      function validateTestFormat(format: Format | undefined) {
        assert.isDefined(format);

        expect(format!.name).eq("TestFormat");
        expect(format!.fullName).eq("TestSchema.TestFormat");

        expect(format!.includeZero).false;
        expect(format!.spacer).eq("-");

        assert.isDefined(format!.units);
        expect(format!.units!.length).eq(4);
        expect(format!.units![0][0].fullName).eq("Formats.MILE");
        expect(format!.units![0][1]).eq("mile(s)");

        expect(format!.units![1][0].fullName).eq("Formats.YRD");
        expect(format!.units![1][1]).eq("yrd(s)");

        expect(format!.units![2][0].fullName).eq("Formats.FT");
        expect(format!.units![2][1]).eq("'");

        expect(format!.units![3][0].fullName).eq("Formats.IN");
        expect(format!.units![3][1]).eq("\"");
      }
      it("sync - ", () => {
        const testSchema = Schema.fromJsonSync(createSchemaJson(validComposite), context);
        assert.isDefined(testSchema);
        const format = testSchema.getItemSync<Format>("TestFormat");
        validateTestFormat(format);
      });
      it("async - ", async () => {
        const testSchema = await Schema.fromJson(createSchemaJson(validComposite), context);
        assert.isDefined(testSchema);
        const format = await testSchema.getItem<Format>("TestFormat");
        validateTestFormat(format);
      });
    }); // composite

  }); // deserialize properly formatted ECJSON

  describe("toJSON", () => {
    let context: SchemaContext;
    beforeEach(() => {
      context = new SchemaContext();
      context.addLocater(new TestSchemaLocater());
    });

    it("Basic test I", () => {
      const testFormatJson = {
        schemaItemType: "Format",
        type: "Fractional",
        precision: 4,
        composite: {
          includeZero: false,
          spacer: "-",
          units: [
            {
              name: "Formats.MILE",
              label: "mile(s)",
            },
          ],
        },
      };
      const ecSchema = Schema.fromJsonSync(createSchemaJson(testFormatJson), context);
      assert.isDefined(ecSchema);
      const format = ecSchema.getItemSync<Format>("TestFormat");
      assert.isDefined(format);
      const formatSerialization = format!.toJSON(false, true);
      expect(formatSerialization).to.deep.equal(testFormatJson);
    });

    it("JSON stringify serialization", () => {
      const testFormatJson = {
        schemaItemType: "Format",
        type: "Fractional",
        precision: 4,
        composite: {
          includeZero: false,
          spacer: "-",
          units: [
            {
              name: "Formats.MILE",
              label: "mile(s)",
            },
          ],
        },
      };
      const ecSchema = Schema.fromJsonSync(createSchemaJson(testFormatJson), context);
      assert.isDefined(ecSchema);
      const format = ecSchema.getItemSync<Format>("TestFormat");
      assert.isDefined(format);
      const json = JSON.stringify(format);
      const formatSerialization = JSON.parse(json);
      expect(formatSerialization).to.deep.equal(testFormatJson);
    });
  }); // toJson

  describe("toXml", () => {
    let context: SchemaContext;
    const newDom = createEmptyXmlDocument();

    beforeEach(() => {
      context = new SchemaContext();
      context.addLocater(new TestSchemaLocater());
    });

    it("should properly serialize", async () => {
      const testFormatJson = {
        schemaItemType: "Format",
        type: "Scientific",
        precision: 4,
        roundFactor: 0,
        minWidth: 10,
        showSignOption: "OnlyNegative",
        formatTraits: "KeepSingleZero|TrailZeroes",
        decimalSeparator: ".",
        thousandSeparator: ",",
        uomSeparator: " ",
        stationSeparator: "_",
        scientificType: "Normalized",
        composite: {
          includeZero: false,
          spacer: "-",
          units: [
            {
              name: "Formats.MILE",
              label: "mile(s)",
            },
            {
              name: "Formats.YRD",
              label: "yard(s)",
            },
          ],
        },
      };

      const ecschema = Schema.fromJsonSync(createSchemaJson(testFormatJson), context);
      assert.isDefined(ecschema);
      const format = ecschema.getItemSync<Format>("TestFormat");
      assert.isDefined(format);

      const serialized = await format!.toXml(newDom);
      expect(serialized.nodeName).to.eql("Format");
      expect(serialized.getAttribute("typeName")).to.eql("TestFormat");
      expect(serialized.getAttribute("type")).to.eql("scientific");
      expect(serialized.getAttribute("precision")).to.eql("4");
      expect(serialized.getAttribute("roundFactor")).to.eql("0");
      expect(serialized.getAttribute("minWidth")).to.eql("10");
      expect(serialized.getAttribute("showSignOption")).to.eql("OnlyNegative");
      // formatTraitsToArray ignores insertion order in favor of an arbitrary order
      expect(serialized.getAttribute("formatTraits")).to.eql("TrailZeroes|KeepSingleZero");
      expect(serialized.getAttribute("decimalSeparator")).to.eql(".");
      expect(serialized.getAttribute("thousandSeparator")).to.eql(",");
      expect(serialized.getAttribute("uomSeparator")).to.eql(" ");
      expect(serialized.getAttribute("stationSeparator")).to.eql("_");
      expect(serialized.getAttribute("scientificType")).to.eql("Normalized");

      const compositeResult = getElementChildrenByTagName(serialized, "Composite");
      assert.strictEqual(compositeResult.length, 1);
      const composite = compositeResult[0];
      expect(composite.getAttribute("spacer")).to.eql("-");
      expect(composite.getAttribute("includeZero")).to.eql("false");

      const units = getElementChildrenByTagName(composite, "Unit");
      assert.strictEqual(units.length, 2);

      const firstUnit = units[0];
      expect(firstUnit.textContent).to.eql("f:MILE");
      expect(firstUnit.getAttribute("label")).to.eql("mile(s)");

      const secondUnit = units[1];
      expect(secondUnit.textContent).to.eql("f:YRD");
      expect(secondUnit.getAttribute("label")).to.eql("yard(s)");
    });
  });
});
