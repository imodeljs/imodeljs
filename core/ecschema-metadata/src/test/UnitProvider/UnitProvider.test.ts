/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as fs from "fs";
import * as path from "path";
import { expect } from "chai";
import { SchemaContext, Unit } from "../../ecschema-metadata";
import { deserializeXmlSync } from "../TestUtils/DeserializationHelpers";
import { UnitProvider } from "../../UnitProvider/UnitProvider";
import { UNIT_EXTRA_DATA } from "./UnitData";

describe("Unit Provider tests", () => {
  const context = new SchemaContext();
  let provider: UnitProvider;

  before(() => {
    const schemaFile = path.join(__dirname, "..", "..", "..", "node_modules", "@bentley", "units-schema", "Units.ecschema.xml");
    const schemaXml = fs.readFileSync(schemaFile, "utf-8");
    deserializeXmlSync(schemaXml, context);

    const siSchemaFile = path.join(__dirname, "..", "assets", "SIUnits.ecschema.xml");
    const siSchemaXml = fs.readFileSync(siSchemaFile, "utf-8");
    deserializeXmlSync(siSchemaXml, context);

    const metricSchemaFile = path.join(__dirname, "..", "assets", "MetricUnits.ecschema.xml");
    const metricSchemaXml = fs.readFileSync(metricSchemaFile, "utf-8");
    deserializeXmlSync(metricSchemaXml, context);

    const usSchemaFile = path.join(__dirname, "..", "assets", "USUnits.ecschema.xml");
    const usSchemaXml = fs.readFileSync(usSchemaFile, "utf-8");
    deserializeXmlSync(usSchemaXml, context);

    provider = new UnitProvider(context, UNIT_EXTRA_DATA);
  });

  // Tests for findUnitByName
  it("should find units by unit names in Units schema", async () => {
    const unit1 = await provider.findUnitByName("Units.KM");
    expect(unit1.fullName === "Units.KM", `Unit name should be Units.KM and not ${unit1.fullName}`).to.be.true;

    const unit2 = await provider.findUnitByName("Units.KM_PER_HR");
    expect(unit2.fullName === "Units.KM_PER_HR", `Unit name should be Units.KM_PER_HR and not ${unit2.fullName}`).to.be.true;
  });

  it("should find units by unit names in MetricUnits schema", async () => {
    const unit1 = await provider.findUnitByName("MetricUnits.KM");
    expect(unit1.fullName === "MetricUnits.KM", `Unit name should be MetricUnits.KM and not ${unit1.fullName}`).to.be.true;

    const unit2 = await provider.findUnitByName("MetricUnits.M_PER_KM");
    expect(unit2.fullName === "MetricUnits.M_PER_KM", `Unit name should be MetricUnits.M_PER_KM and not ${unit2.fullName}`).to.be.true;
  });

  it("should throw when schema is not found", async () => {
    try {
      await provider.findUnitByName("MockSchema.KM");
    } catch (err) {
      expect(err).to.be.an("error");
      expect(err.message).to.equal("Cannot find schema for unit");
    }
  });

  it("should throw when phenomenon is not found", async () => {
    try {
      await provider.findUnitByName("Units.MOCKUNIT");
    } catch (err) {
      expect(err).to.be.an("error");
      expect(err.message).to.equal("Cannot find schema item/unit");
    }
  });

  // Tests for findUnitsByPhenomenon
  it("should find units that belong to Units.LENGTH phenomenon", async () => {
    const filteredUnits: Unit[] = await provider.findUnitsByPhenomenon("Units.LENGTH");
    for (const unit of filteredUnits) {
      expect(unit.phenomenon?.fullName === "Units.LENGTH", `Phenomenon name should be Units.LENGTH and not ${unit.phenomenon?.fullName}`).to.be.true;
    }
  });

  it("should find units that belong to Units.VELOCITY phenomenon", async () => {
    const filteredUnits: Unit[] = await provider.findUnitsByPhenomenon("Units.VELOCITY");
    for (const unit of filteredUnits) {
      expect(unit.phenomenon?.fullName === "Units.VELOCITY", `Phenomenon name should be Units.LENGTH and not ${unit.phenomenon?.fullName}`).to.be.true;
    }
  });

  it("should find units that belong to SIUnits.LENGTH phenomenon across multiple schemas", async () => {
    const filteredUnits: Unit[] = await provider.findUnitsByPhenomenon("SIUnits.LENGTH");
    for (const unit of filteredUnits) {
      expect(unit.phenomenon?.fullName === "SIUnits.LENGTH", `Phenomenon name should be SIUnits.LENGTH and not ${unit.phenomenon?.fullName}`).to.be.true;
    }
    expect(filteredUnits).to.have.lengthOf(19);
  });

  it("should find units that belong to SIUnits.SLOPE phenomenon across multiple schemas", async () => {
    const filteredUnits: Unit[] = await provider.findUnitsByPhenomenon("SIUnits.SLOPE");
    for (const unit of filteredUnits) {
      expect(unit.phenomenon?.fullName === "SIUnits.SLOPE", `Phenomenon name should be SIUnits.SLOPE and not ${unit.phenomenon?.fullName}`).to.be.true;
    }
    expect(filteredUnits).to.have.lengthOf(9);
  });

  it("should throw when schema is not found", async () => {
    try {
      await provider.findUnitsByPhenomenon("MockSchema.VELOCITY");
    } catch (err) {
      expect(err).to.be.an("error");
      expect(err.message).to.equal("Cannot find schema for phenomenon");
    }
  });

  it("should throw when phenomenon is not found", async () => {
    try {
      await provider.findUnitsByPhenomenon("SIUnits.VELOCITY");
    } catch (err) {
      expect(err).to.be.an("error");
      expect(err.message).to.equal("Cannot find schema item/phenomenon");
    }
  });

  // Tests for getAlternateDisplayLabels
  it("should find alternate display labels of Units.US_SURVEY_FT", () => {
    const altDisplayLabels = provider.getAlternateDisplayLabels("Units.US_SURVEY_FT");
    const expectedLabels = ["ft", "SF", "USF", "ft (US Survey)"];
    expect(altDisplayLabels, `Alternate display labels should be ${expectedLabels}`).to.include.members(expectedLabels);
    expect(altDisplayLabels).to.have.lengthOf(4);
  });

  it("should find alternate display labels of Units.CUB_US_SURVEY_FT", () => {
    const altDisplayLabels = provider.getAlternateDisplayLabels("Units.CUB_US_SURVEY_FT");
    const expectedLabels = ["cf"];
    expect(altDisplayLabels, `Alternate display labels should be ${expectedLabels}`).to.include.members(expectedLabels);
    expect(altDisplayLabels).to.have.lengthOf(1);
  });

  it("should not find any alternate display labels of Unit", () => {
    const altDisplayLabels = provider.getAlternateDisplayLabels("Units.CELSIUS");
    const expectedLabels: string[] = [];
    expect(altDisplayLabels, `Alternate display labels should be ${expectedLabels}`).to.include.members(expectedLabels);
    expect(altDisplayLabels).to.have.lengthOf(0);
  });

  // Tests for findUnitsByDisplayLabel of findUnit
  it("should find Units.DELTA_RANKINE with display label 'Δ°R'", async () => {
    const unit = await provider.findUnit("Δ°R");
    expect(unit.fullName === "Units.DELTA_RANKINE", `Unit name should be Units.DELTA_RANKINE and not ${unit.fullName}`).to.be.true;
  });

  it("should find Units.MICROMOL_PER_CUB_DM with display label 'µmol/dm³'", async () => {
    const unit = await provider.findUnit("µmol/dm³");
    expect(unit.fullName === "Units.MICROMOL_PER_CUB_DM", `Unit name should be Units.MICROMOL_PER_CUB_DM and not ${unit.fullName}`).to.be.true;
  });

  it("should find Units.FT with display label 'ft'", async () => {
    const unit = await provider.findUnit("ft");
    expect(unit.fullName === "Units.FT", `Unit name should be Units.FT and not ${unit.fullName}`).to.be.true;
  });

  it("should find USUnits.FT with display label 'ft' with schemaName 'USUnits'",async () => {
    const unit = await provider.findUnit("ft", "USUnits");
    expect(unit.fullName === "USUnits.FT",  `Unit name should be USUnits.FT and not ${unit.fullName}`).to.be.true;
  });

  it("should find USUnits.FT with display label 'ft' and SIUnits.LENGTH phenomena", async () => {
    const unit = await provider.findUnit("ft", undefined, "SIUnits.LENGTH");
    expect(unit.fullName === "USUnits.FT", `Unit name should be USUnits.FT and not ${unit.fullName}`).to.be.true;
  });

  it("should find Units.FT with display label 'ft' and Units.LENGTH phenomena", async () => {
    const unit = await provider.findUnit("ft", undefined, "Units.LENGTH");
    expect(unit.fullName === "Units.FT",  `Unit name should be Units.FT and not ${unit.fullName}`).to.be.true;
  });

  it("should only find USUnits.FT for USUnits.USCUSTOM unitSystem", async () => {
    const unit = await provider.findUnit("ft", undefined, undefined, "USUnits.USCUSTOM");
    expect(unit.fullName === "USUnits.FT", `Unit name should be USUnits.FT and not ${unit.fullName}`).to.be.true;
  });

  it("should only find Units.FT with display label 'ft' for Units.USCUSTOM unitSystem", async () => {
    const unit = await provider.findUnit("ft", undefined, undefined, "Units.USCUSTOM");
    expect(unit.fullName === "Units.FT", `Unit name should be Units.FT and not ${unit.fullName}`).to.be.true;
  });

  // Tests for findUnitsByAltDisplayLabel of findUnit
  it("should find Units.YRD by corresponding alternate display labels", async () => {
    const unit1 = await provider.findUnit("YRD");
    expect(unit1.fullName === "Units.YRD", `Unit name should be Units.YRD and not ${unit1.fullName}`).to.be.true;

    const unit2 = await provider.findUnit("yrd");
    expect(unit2.fullName === "Units.YRD", `Unit name should be Units.YRD and not ${unit2.fullName}`).to.be.true;
  });

  it("should find Units.ARC_SECOND with alternate display label 'sec'", async () => {
    const unit = await provider.findUnit("sec");
    expect(unit.fullName === "Units.ARC_SECOND", `Unit name should be Units.ARC_SECOND and not ${unit.fullName}`).to.be.true;
  });

  it("should find Units.S with alternate display label 'sec' and phenomenon Units.TIME", async () => {
    const unit = await provider.findUnit("sec", undefined, "Units.TIME");
    expect(unit.fullName === "Units.S", `Unit name should be Units.S and not ${unit.fullName}`).to.be.true;
  });

  it("should find Units.S with alternate display label 'sec' and unitSystem Units.SI", async () => {
    const unit = await provider.findUnit("sec", undefined, undefined, "Units.SI");
    expect(unit.fullName === "Units.S", `Unit name should be Units.S and not ${unit.fullName}`).to.be.true;
  });

  it("should find Units.ARC_MINUTE with display label ''' ", async () => {
    const unit = await provider.findUnit("'");
    expect(unit.fullName === "Units.ARC_MINUTE", `Unit name should be Units.ARC_MINUTE and not ${unit.fullName}`).to.be.true;
  });

  it("should find Units.FT with alternate display label ''' and phenomenon Units.LENGTH", async () => {
    const unit = await provider.findUnit("'", undefined, "Units.LENGTH");
    expect(unit.fullName === "Units.FT", `Unit name should be Units.FT and not ${unit.fullName}`).to.be.true;
  });

  it("should find Units.FT with alternate display label ''' and unitSystem Units.USCUSTOM", async () => {
    const unit = await provider.findUnit("'", undefined, undefined, "Units.USCUSTOM");
    expect(unit.fullName === "Units.FT", `Unit name should be Units.FT and not ${unit.fullName}`).to.be.true;
  });

  // Tests for invalid cases
  it("should not find any units when unitLabel does not match any display labels or alternate display labels", async () => {
    try {
      await provider.findUnit("MockUnitLabel");
    } catch (err) {
      expect(err).to.be.an("error");
      expect(err.message).to.equal("Cannot find unit with label");
    }
  });

  it("should not find any units when schemaName does not exist within context", async () => {
    try {
      await provider.findUnit("ft", "MockSchema");
    } catch (err) {
      expect(err).to.be.an("error");
      expect(err.message).to.equal("Cannot find unit with label");
    }

    try {
      await provider.findUnit("sec", "MockSchema");
    } catch (err) {
      expect(err).to.be.an("error");
      expect(err.message).to.equal("Cannot find unit with label");
    }
  });

  it("should not find any units when phenomenon does not match any unit", async () => {
    try {
      await provider.findUnit("ft", undefined, "MockPhenomenon");
    } catch (err) {
      expect(err).to.be.an("error");
      expect(err.message).to.equal("Cannot find unit with label");
    }

    try {
      await provider.findUnit("sec", undefined, "MockPhenomenon");
    } catch (err) {
      expect(err).to.be.an("error");
      expect(err.message).to.equal("Cannot find unit with label");
    }
  });

  it("should not find any units when unitSystem does not match any unit", async () => {
    try {
      await provider.findUnit("ft", undefined, undefined, "MockUnitSystem");
    } catch (err) {
      expect(err).to.be.an("error");
      expect(err.message).to.equal("Cannot find unit with label");
    }

    try {
      await provider.findUnit("sec", undefined, undefined, "MockUnitSystem");
    } catch (err) {
      expect(err).to.be.an("error");
      expect(err.message).to.equal("Cannot find unit with label");
    }
  });
});
