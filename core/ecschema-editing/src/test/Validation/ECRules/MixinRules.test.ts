/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { DelayedPromiseWithProps, EntityClass, Mixin, Schema, SchemaContext } from "@bentley/ecschema-metadata";
import { MutableEntityClass } from "../../../Editing/Mutable/MutableEntityClass";
import { DiagnosticCategory, DiagnosticType } from "../../../Validation/Diagnostic";
import * as Rules from "../../../Validation/ECRules";

/* eslint-disable deprecation/deprecation */

describe("Mixin Rule Tests", () => {
  let schema: Schema;

  beforeEach(async () => {
    schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
  });

  class TestMixin extends Mixin {
    constructor(testSchema: Schema, name: string, appliesTo: EntityClass) {
      super(testSchema, name);
      this._appliesTo = new DelayedPromiseWithProps(appliesTo.key, async () => appliesTo);
    }
  }

  it("MixinAppliedToClassMustDeriveFromConstraint, entity derives from constraint, rule passes.", async () => {
    const constraintClass = new EntityClass(schema, "TestConstraint");
    const mixin = new TestMixin(schema, "TestMixin", constraintClass);
    const entityClass = new EntityClass(schema, "TestClass");
    (entityClass as MutableEntityClass).addMixin(mixin);
    entityClass.baseClass = new DelayedPromiseWithProps(constraintClass.key, async () => constraintClass);

    const result = Rules.mixinAppliedToClassMustDeriveFromConstraint(entityClass);
    for await (const _diagnostic of result) {
      expect(false, "Rule should have passed").to.be.true;
    }
  });

  it("MixinAppliedToClassMustDeriveFromConstraint, entity class is the constraint, rule passes.", async () => {
    const entityClass = new EntityClass(schema, "TestClass");
    const mixin = new TestMixin(schema, "TestMixin", entityClass);
    (entityClass as MutableEntityClass).addMixin(mixin);

    const result = Rules.mixinAppliedToClassMustDeriveFromConstraint(entityClass);
    for await (const _diagnostic of result) {
      expect(false, "Rule should have passed").to.be.true;
    }
  });

  it("MixinAppliedToClassMustDeriveFromConstraint, entity has no base class and class is not the constraint, rule violated.", async () => {
    const constraintClass = new EntityClass(schema, "TestConstraint");
    const mixin = new TestMixin(schema, "TestMixin", constraintClass);
    const entityClass = new EntityClass(schema, "TestClass");
    (entityClass as MutableEntityClass).addMixin(mixin);

    const result = Rules.mixinAppliedToClassMustDeriveFromConstraint(entityClass);

    let resultHasEntries = false;
    for await (const diagnostic of result) {
      resultHasEntries = true;
      expect(diagnostic.ecDefinition).to.equal(entityClass);
      expect(diagnostic.messageArgs).to.eql([mixin.fullName, entityClass.fullName, mixin.appliesTo!.fullName]);
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
      expect(diagnostic.code).to.equal(Rules.DiagnosticCodes.MixinAppliedToClassMustDeriveFromConstraint);
      expect(diagnostic.diagnosticType).to.equal(DiagnosticType.SchemaItem);
    }
    expect(resultHasEntries, "expected rule to return an AsyncIterable with entries.").to.be.true;
  });

  it("MixinAppliedToClassMustDeriveFromConstraint, entity base incompatible with constraint, rule violated.", async () => {
    const constraintClass = new EntityClass(schema, "TestConstraint");
    const baseClass = new EntityClass(schema, "TestBase");
    const mixin = new TestMixin(schema, "TestMixin", constraintClass);
    const entityClass = new EntityClass(schema, "TestClass");
    (entityClass as MutableEntityClass).addMixin(mixin);
    entityClass.baseClass = new DelayedPromiseWithProps(baseClass.key, async () => baseClass);

    const result = Rules.mixinAppliedToClassMustDeriveFromConstraint(entityClass);

    let resultHasEntries = false;
    for await (const diagnostic of result) {
      resultHasEntries = true;
      expect(diagnostic.ecDefinition).to.equal(entityClass);
      expect(diagnostic.messageArgs).to.eql([mixin.fullName, entityClass.fullName, mixin.appliesTo!.fullName]);
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
      expect(diagnostic.code).to.equal(Rules.DiagnosticCodes.MixinAppliedToClassMustDeriveFromConstraint);
      expect(diagnostic.diagnosticType).to.equal(DiagnosticType.SchemaItem);
    }
    expect(resultHasEntries, "expected rule to return an AsyncIterable with entries.").to.be.true;
  });
});
