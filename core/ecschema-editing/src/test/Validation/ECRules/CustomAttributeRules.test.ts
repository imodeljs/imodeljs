/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { CustomAttributeClass, DiagnosticCategory, DiagnosticType, ECClassModifier, EntityClass,
  Schema, SchemaContext,
} from "@bentley/ecschema-metadata";
import { MutableClass } from "../../../Editing/Mutable/MutableClass";
import { MutableSchema } from "../../../Editing/Mutable/MutableSchema";
import * as Rules from "../../../Validation/ECRules";
import { toArray } from "../../TestUtils/DiagnosticHelpers";

/* eslint-disable deprecation/deprecation */

describe("CustomAttribute Rules Tests", () => {
  let testSchema: Schema;
  let context: SchemaContext;
  let caSchema: Schema;

  function addCA(schema: Schema, modifier: ECClassModifier) {
    const testCA = new CustomAttributeClass(schema, "TestCA", modifier);
    (schema as MutableSchema).addItem(testCA);
  }

  beforeEach(async () => {
    context = new SchemaContext();
    testSchema = new Schema(context, "TestSchema", "ts", 1, 0, 0);
    caSchema = new Schema(context, "TestCASchema", "ts", 1, 0, 0);
  });

  describe("CustomAttributeNotOfConcreteClass tests", () => {
    it("CustomAttribute is abstract, rule violated", async () => {
      await (testSchema as MutableSchema).addReference(caSchema);
      addCA(caSchema, ECClassModifier.Abstract);
      const testEntity = new EntityClass(testSchema, "TestEntity");
      (testEntity as unknown as MutableClass).addCustomAttribute({ className: "TestCASchema.TestCA" });

      const result = Rules.validateCustomAttributeInstance(testEntity, testEntity.customAttributes!.get("TestCASchema.TestCA")!);

      let resultHasEntries = false;
      for await (const diagnostic of result) {
        resultHasEntries = true;
        expect(diagnostic.ecDefinition).to.equal(testEntity);
        expect(diagnostic.messageArgs).to.eql([testEntity.fullName, "TestCASchema.TestCA"]);
        expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
        expect(diagnostic.code).to.equal(Rules.DiagnosticCodes.CustomAttributeNotOfConcreteClass);
        expect(diagnostic.diagnosticType).to.equal(DiagnosticType.CustomAttributeContainer);
      }
      expect(resultHasEntries, "expected rule to return an AsyncIterable with entries.").to.be.true;
    });

    it("CustomAttribute is concrete, rule passes", async () => {
      await (testSchema as MutableSchema).addReference(caSchema);
      addCA(caSchema, ECClassModifier.None);
      const testEntity = new EntityClass(testSchema, "TestEntity");
      (testEntity as unknown as MutableClass).addCustomAttribute({ className: "TestCASchema.TestCA" });

      const result = Rules.validateCustomAttributeInstance(testEntity, testEntity.customAttributes!.get("TestCASchema.TestCA")!);
      for await (const _diagnostic of result) {
        expect(false, "Rule should have passed").to.be.true;
      }
    });
  });

  describe("CustomAttributeSchemaMustBeReferenced tests", () => {
    it("CustomAttribute schema not referenced, rule violated", async () => {
      addCA(caSchema, ECClassModifier.None);
      const testEntity = new EntityClass(testSchema, "TestEntity");
      (testEntity as unknown as MutableClass).addCustomAttribute({ className: "TestCASchema.TestCA" });

      const result = Rules.validateCustomAttributeInstance(testEntity, testEntity.customAttributes!.get("TestCASchema.TestCA")!);
      const results = await toArray(result);

      expect(results.length).to.equal(2, "Expected 2 diagnostics");
      const diagnostic = results[0];
      expect(diagnostic.ecDefinition).to.equal(testEntity);
      expect(diagnostic.messageArgs).to.eql([testEntity.fullName, "TestCASchema.TestCA"]);
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
      expect(diagnostic.code).to.equal(Rules.DiagnosticCodes.CustomAttributeSchemaMustBeReferenced);
      expect(diagnostic.diagnosticType).to.equal(DiagnosticType.CustomAttributeContainer);
    });

    it("CustomAttribute schema is referenced, rule passes", async () => {
      await (testSchema as MutableSchema).addReference(caSchema);
      addCA(caSchema, ECClassModifier.None);
      const testEntity = new EntityClass(testSchema, "TestEntity");
      (testEntity as unknown as MutableClass).addCustomAttribute({ className: "TestCASchema.TestCA" });

      const result = Rules.validateCustomAttributeInstance(testEntity, testEntity.customAttributes!.get("TestCASchema.TestCA")!);
      for await (const _diagnostic of result) {
        expect(false, "Rule should have passed").to.be.true;
      }
    });

    it("CustomAttribute defined in same schema, rule passes", async () => {
      await (testSchema as MutableSchema).addReference(caSchema);
      addCA(testSchema, ECClassModifier.None);
      const testEntity = new EntityClass(testSchema, "TestEntity");
      (testEntity as unknown as MutableClass).addCustomAttribute({ className: "TestSchema.TestCA" });

      const result = Rules.validateCustomAttributeInstance(testEntity, testEntity.customAttributes!.get("TestSchema.TestCA")!);
      for await (const _diagnostic of result) {
        expect(false, "Rule should have passed").to.be.true;
      }
    });
  });
});
