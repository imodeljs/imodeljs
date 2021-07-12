/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Schema, SchemaContext } from "@bentley/ecschema-metadata";
import { MutableSchema } from "../../../Editing/Mutable/MutableSchema";
import * as Rules from "../../../Validation/ECRules";
import { DiagnosticCategory, DiagnosticType } from "../../../Validation/Diagnostic";

describe("Schema rules tests", () => {
  let context: SchemaContext;

  beforeEach(async () => {
  });

  describe("validateSchemaReferences tests", () => {
    it("Valid schema reference, rule should pass.", async () => {
      const schemaAJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "SchemaA",
        version: "1.0.0",
        alias: "a",
      };

      const schemaBJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "SchemaB",
        version: "1.0.0",
        alias: "b",
      };

      context = new SchemaContext();
      const schemaA = await Schema.fromJson(schemaAJson, context);
      const schemaB = await Schema.fromJson(schemaBJson, context);
      await (schemaA as MutableSchema).addReference(schemaB);
      const result = Rules.validateSchemaReferences(schemaA);

      for await (const _diagnostic of result)
        expect(false, "Rule should have passed").true;
    });

    describe("EC-001, SupplementalSchemasCannotBeReferenced Tests", () => {
      it("Reference schema is a Supplemental schema, rule violated.", async () => {
        const schemaAJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaA",
          version: "1.0.0",
          alias: "a",
        };

        const schemaBJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaB",
          version: "1.0.0",
          alias: "b",
          customAttributes: [
            { className: "CoreCustomAttributes.SupplementalSchema" },
          ],
        };

        const coreCustomAttributesJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "CoreCustomAttributes",
          version: "1.0.0",
          alias: "ca",
          items: {
            SupplementalSchema: {  // eslint-disable-line @typescript-eslint/naming-convention
              schemaItemType: "CustomAttributeClass",
              label: "Supplemental Schema",
              description: "Mock Supplemental Schema CustomAttributeClass",
              modifier: "Sealed",
              appliesTo: "Schema",
            },
          },
        };

        context = new SchemaContext();
        const coreCA = await Schema.fromJson(coreCustomAttributesJson, context);
        const schemaA = await Schema.fromJson(schemaAJson, context);
        const schemaB = await Schema.fromJson(schemaBJson, context);
        await (schemaB as MutableSchema).addReference(coreCA);
        await (schemaA as MutableSchema).addReference(schemaB);

        const result = Rules.validateSchemaReferences(schemaA);

        let resultHasEntries = false;
        for await (const diagnostic of result) {
          resultHasEntries = true;
          expect(diagnostic.ecDefinition).to.equal(schemaA);
          expect(diagnostic.messageArgs).to.eql([schemaA.name, "SchemaB"]);
          expect(diagnostic.messageText).to.eql("Referenced schema 'SchemaB' of schema 'SchemaA' is a supplemental schema. Supplemental schemas are not allowed to be referenced.");
          expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
          expect(diagnostic.code).to.equal(Rules.Diagnostics.SupplementalSchemasCannotBeReferenced.code);
          expect(diagnostic.diagnosticType).to.equal(DiagnosticType.Schema);
        }
        expect(resultHasEntries, "expected rule to return an AsyncIterable with entries.").to.be.true;
      });
    });

    describe("EC-002, SchemaRefAliasMustBeUnique Tests", () => {
      it("Multiple reference schemas with the same alias, rule violated.", async () => {
        const schemaAJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaA",
          version: "1.0.0",
          alias: "a",
        };

        const schemaBJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaB",
          version: "1.0.0",
          alias: "b",
        };

        const schemaCJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaC",
          version: "1.0.0",
          alias: "b",
        };

        context = new SchemaContext();
        const schemaA = await Schema.fromJson(schemaAJson, context);
        const schemaB = await Schema.fromJson(schemaBJson, context);
        const schemaC = await Schema.fromJson(schemaCJson, context);
        await (schemaA as MutableSchema).addReference(schemaB);
        await (schemaA as MutableSchema).addReference(schemaC);

        const result = Rules.validateSchemaReferences(schemaA);

        let resultHasEntries = false;
        for await (const diagnostic of result) {
          resultHasEntries = true;
          expect(diagnostic.ecDefinition).to.equal(schemaA);
          expect(diagnostic.messageArgs).to.eql([schemaA.name, "b", "SchemaB", "SchemaC"]);
          expect(diagnostic.messageText).to.eql("Schema 'SchemaA' has multiple schema references (SchemaB, SchemaC) with the same alias 'b', which is not allowed.");
          expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
          expect(diagnostic.code).to.equal(Rules.Diagnostics.SchemaRefAliasMustBeUnique.code);
          expect(diagnostic.diagnosticType).to.equal(DiagnosticType.Schema);
        }
        expect(resultHasEntries, "expected rule to return an AsyncIterable with entries.").to.be.true;
      });
    });

    describe("EC-002, SchemaRefAliasMustBeUnique Tests", () => {
      it("Simple cyclic schema reference, rule violated.", async () => {
        const schemaAJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaA",
          version: "1.0.0",
          alias: "a",
        };

        const schemaBJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaB",
          version: "1.0.0",
          alias: "b",
          references: [
            {
              name: "SchemaA",
              version: "1.0.0",
            },
          ],
        };

        context = new SchemaContext();
        const schemaA = await Schema.fromJson(schemaAJson, context);
        const schemaB = await Schema.fromJson(schemaBJson, context);
        await (schemaA as MutableSchema).addReference(schemaB);

        const result = Rules.validateSchemaReferences(schemaA);

        let resultHasEntries = false;
        for await (const diagnostic of result) {
          resultHasEntries = true;
          expect(diagnostic.ecDefinition).to.equal(schemaA);
          expect(diagnostic.messageArgs).to.eql([schemaA.name, "SchemaB --> SchemaA, SchemaA --> SchemaB"]);
          expect(diagnostic.messageText).to.eql("Schema 'SchemaA' has reference cycles: SchemaB --> SchemaA, SchemaA --> SchemaB");
          expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
          expect(diagnostic.code).to.equal(Rules.Diagnostics.ReferenceCyclesNotAllowed.code);
          expect(diagnostic.diagnosticType).to.equal(DiagnosticType.Schema);
        }
        expect(resultHasEntries, "expected rule to return an AsyncIterable with entries.").to.be.true;
      });

      it("Multiple schema reference cycles, rule violated.", async () => {
        const schemaAJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaA",
          version: "1.0.0",
          alias: "a",
        };
        const schemaBJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaB",
          version: "1.0.0",
          alias: "b",
        };
        const schemaCJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaC",
          version: "1.0.0",
          alias: "c",
        };
        const schemaDJson = {
          $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
          name: "SchemaD",
          version: "1.0.0",
          alias: "d",
        };

        context = new SchemaContext();
        const schemaA = await Schema.fromJson(schemaAJson, context);
        const schemaB = await Schema.fromJson(schemaBJson, context);
        const schemaC = await Schema.fromJson(schemaCJson, context);
        const schemaD = await Schema.fromJson(schemaDJson, context);
        await (schemaA as MutableSchema).addReference(schemaB);
        await (schemaA as MutableSchema).addReference(schemaC);
        await (schemaA as MutableSchema).addReference(schemaD);
        await (schemaC as MutableSchema).addReference(schemaA);
        await (schemaD as MutableSchema).addReference(schemaA);

        const result = Rules.validateSchemaReferences(schemaA);

        let resultHasEntries = false;
        for await (const diagnostic of result) {
          resultHasEntries = true;
          expect(diagnostic.ecDefinition).to.equal(schemaA);
          expect(diagnostic.messageArgs).to.eql([schemaA.name, "SchemaC --> SchemaA, SchemaA --> SchemaC, SchemaD --> SchemaA, SchemaA --> SchemaD"]);
          expect(diagnostic.messageText).to.eql("Schema 'SchemaA' has reference cycles: SchemaC --> SchemaA, SchemaA --> SchemaC, SchemaD --> SchemaA, SchemaA --> SchemaD");
          expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
          expect(diagnostic.code).to.equal(Rules.Diagnostics.ReferenceCyclesNotAllowed.code);
          expect(diagnostic.diagnosticType).to.equal(DiagnosticType.Schema);
        }
        expect(resultHasEntries, "expected rule to return an AsyncIterable with entries.").to.be.true;
      });
    });
  });
});
