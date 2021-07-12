/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { DelayedPromiseWithProps, ECClassModifier, EntityClass, Schema, SchemaContext } from "@bentley/ecschema-metadata";
import { MutableSchema } from "../../Editing/Mutable/MutableSchema";
import { SchemaValidater } from "../../Validation/SchemaValidater";
import { TestRuleSet } from "../TestUtils/DiagnosticHelpers";

describe("SchemaValidater tests", () => {
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
  });

  it("validateSchema, rule violation reported correctly", async () => {
    const baseClass = new EntityClass(schema, "TestBase", ECClassModifier.Sealed);
    const entityClass = new EntityClass(schema, "TestClass");
    entityClass.baseClass = new DelayedPromiseWithProps(baseClass.key, async () => baseClass);
    (schema as MutableSchema).addItem(entityClass);

    const result = await SchemaValidater.validateSchema(schema);

    expect((result).length).to.equal(1);
    expect(result[0].code).to.equal("ECObjects-100");
  });

  it("validateSchema, ruleset specified, rules called correctly", async () => {
    const ruleSet = new TestRuleSet();
    const baseClass = new EntityClass(schema, "TestBase", ECClassModifier.Sealed);
    const entityClass = new EntityClass(schema, "TestClass");
    entityClass.baseClass = new DelayedPromiseWithProps(baseClass.key, async () => baseClass);
    (schema as MutableSchema).addItem(entityClass);

    const result = await SchemaValidater.validateSchema(schema, ruleSet);

    expect((result).length).to.equal(7);
    expect(result[3].code).to.equal("ECObjects-100");
  });
});
