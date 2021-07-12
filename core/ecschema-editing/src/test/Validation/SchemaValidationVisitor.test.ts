/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { AnyProperty, Constant, CustomAttributeClass, ECClass, EntityClass, Enumeration, Format,
  InvertedUnit, KindOfQuantity, Mixin, Phenomenon, PrimitiveType, PropertyCategory, RelationshipClass,
  RelationshipConstraint, RelationshipEnd, Schema, SchemaContext, StructClass, Unit, UnitSystem,
} from "@bentley/ecschema-metadata";
import { MutableClass } from "../../Editing/Mutable/MutableClass";
import { MutableProperty } from "@bentley/ecschema-metadata/src/Metadata/Property";
import { DiagnosticCategory } from "../../Validation/Diagnostic";
import { SchemaValidationVisitor } from "../../Validation/SchemaValidationVisitor";
import { ApplySuppressionSet, EmptyRuleSet, IgnoreSuppressionSet, TestDiagnostics, TestReporter, TestRuleSet, TestRuleSetB } from "../TestUtils/DiagnosticHelpers";

import sinon = require("sinon");

describe("SchemaValidationVisitor tests", () => {
  let visitor: SchemaValidationVisitor;
  let schema: Schema;

  beforeEach(async () => {
    visitor = new SchemaValidationVisitor();
    schema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("registerRuleSet, rule sets registered properly", async () => {
    const testRuleSet = new TestRuleSet();
    visitor.registerRuleSet(testRuleSet);

    const testRuleSetB = new TestRuleSetB();
    visitor.registerRuleSet(testRuleSetB);

    expect(visitor.ruleSets[testRuleSet.name]).to.be.not.undefined;
    expect(visitor.ruleSets[testRuleSetB.name]).to.be.not.undefined;
  });

  it("registerRuleSet, rule set already registered, throws", async () => {
    const testRuleSet = new TestRuleSet();
    visitor.registerRuleSet(testRuleSet);

    expect(() => visitor.registerRuleSet(testRuleSet)).to.throw(Error, `A RuleSet with the name '${testRuleSet.name}' has already been registered.`);
  });

  it("registerSuppressionSet, AppliedSuppressionSet registered properly", async () => {
    const suppressionSet = new ApplySuppressionSet();
    visitor.registerRuleSuppressionSet(suppressionSet);
    expect(visitor.suppressionSet).to.be.not.undefined;
  });

  it("registerSuppressionSet, AppliedSuppressionSet registered properly", async () => {
    const suppressionSet = new IgnoreSuppressionSet();
    visitor.registerRuleSuppressionSet(suppressionSet);
    expect(visitor.suppressionSet).to.be.not.undefined;
  });

  it("registerReporter, reporter registered properly", async () => {
    expect(visitor.diagnosticReporters.length).to.equal(0);
    const reporter = new TestReporter();

    visitor.registerReporter(reporter);

    expect(visitor.diagnosticReporters.length).to.equal(1);
    expect(visitor.diagnosticReporters[0]).to.equal(reporter);
  });

  describe("visitSchema tests", () => {
    it("calls rules properly", async () => {
      const ruleSetA = new TestRuleSet();
      const ruleSetB = new TestRuleSetB();
      visitor.registerRuleSet(ruleSetA);
      visitor.registerRuleSet(ruleSetB);
      const testSchema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);

      await visitor.visitFullSchema(testSchema);

      ruleSetA.schemaRules.forEach((spy) => expect(spy.calledOnceWithExactly(schema)).to.be.true);
      ruleSetB.schemaRules.forEach((spy) => expect(spy.calledOnceWithExactly(schema)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const testSchema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);

      await visitor.visitFullSchema(testSchema);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const testSchema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);

      await visitor.visitFullSchema(testSchema);

      const diagnostic = new TestDiagnostics.FailingSchemaDiagnostic(schema, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const testSchema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);

      await visitor.visitFullSchema(testSchema);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Schema suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const testSchema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);

      await visitor.visitFullSchema(testSchema);

      const diagnostic = new TestDiagnostics.FailingSchemaDiagnostic(schema, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Schema suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const testSchema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);

      await visitor.visitFullSchema(testSchema);

      const diagnostic = new TestDiagnostics.FailingSchemaDiagnostic(schema, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitSchemaItem tests", () => {
    it("calls rules properly", async () => {
      const ruleSetA = new TestRuleSet();
      const ruleSetB = new TestRuleSetB();
      visitor.registerRuleSet(ruleSetA);
      visitor.registerRuleSet(ruleSetB);
      const schemaItem = new EntityClass(schema, "TestClass");

      await visitor.visitSchemaItem(schemaItem);

      ruleSetA.schemaItemRules.forEach((spy) => expect(spy.calledOnceWithExactly(schemaItem)).to.be.true);
      ruleSetB.schemaItemRules.forEach((spy) => expect(spy.calledOnceWithExactly(schemaItem)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new EntityClass(schema, "TestClass");

      await visitor.visitSchemaItem(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const schemaItem = new EntityClass(schema, "TestClass");

      await visitor.visitSchemaItem(schemaItem);

      const diagnostic = new TestDiagnostics.FailingSchemaItemDiagnostic(schemaItem, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const schemaItem = new EntityClass(schema, "TestClass");

      await visitor.visitSchemaItem(schemaItem);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("schemaItem suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const schemaItem = new EntityClass(schema, "TestClass");

      await visitor.visitSchemaItem(schemaItem);

      const diagnostic = new TestDiagnostics.FailingSchemaItemDiagnostic(schemaItem, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("schemaItem suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const schemaItem = new EntityClass(schema, "TestClass");

      await visitor.visitSchemaItem(schemaItem);

      const diagnostic = new TestDiagnostics.FailingSchemaItemDiagnostic(schemaItem, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitClass tests", () => {
    it("calls class rules properly", async () => {
      const ruleSetA = new TestRuleSet();
      const ruleSetB = new TestRuleSetB();
      visitor.registerRuleSet(ruleSetA);
      visitor.registerRuleSet(ruleSetB);
      const entityClass = new EntityClass(schema, "TestClass");

      await visitor.visitClass(entityClass);

      ruleSetA.classRules.forEach((spy) => expect(spy.calledOnceWithExactly(entityClass)).to.be.true);
      ruleSetB.classRules.forEach((spy) => expect(spy.calledOnceWithExactly(entityClass)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new EntityClass(schema, "TestClass");

      await visitor.visitClass(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const entityClass = new EntityClass(schema, "TestClass");

      await visitor.visitClass(entityClass);

      const diagnostic = new TestDiagnostics.FailingClassDiagnostic(entityClass, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const entityClass = new EntityClass(schema, "TestClass");

      await visitor.visitClass(entityClass);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Class suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const entityClass = new EntityClass(schema, "TestClass");

      await visitor.visitClass(entityClass);

      const diagnostic = new TestDiagnostics.FailingClassDiagnostic(entityClass, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Class suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const entityClass = new EntityClass(schema, "TestClass");

      await visitor.visitClass(entityClass);

      const diagnostic = new TestDiagnostics.FailingClassDiagnostic(entityClass, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitProperty tests", () => {
    it("calls property rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const entityClass = new EntityClass(schema, "TestClass");
      const property = await (entityClass as ECClass as MutableClass).createPrimitiveProperty("TestPropertyA", PrimitiveType.String);

      await visitor.visitProperty(property as AnyProperty);

      ruleSet.propertyRules.forEach((spy) => expect(spy.calledOnceWithExactly(property)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new EntityClass(schema, "TestClass");
      const property = await (schemaItem as ECClass as MutableClass).createPrimitiveProperty("TestPropertyA", PrimitiveType.String);

      await visitor.visitProperty(property);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const entityClass = new EntityClass(schema, "TestClass");
      await (entityClass as ECClass as MutableClass).createPrimitiveProperty("TestPropertyA", PrimitiveType.String);

      const properties = [...entityClass.properties!];
      await visitor.visitProperty(properties[0] as AnyProperty);

      const diagnostic = new TestDiagnostics.FailingPropertyDiagnostic(properties[0] as AnyProperty, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const entityClass = new EntityClass(schema, "TestClass");
      await (entityClass as ECClass as MutableClass).createPrimitiveProperty("TestPropertyA", PrimitiveType.String);

      const properties = [...entityClass.properties!];
      await visitor.visitProperty(properties[0] as AnyProperty);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Property suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const entityClass = new EntityClass(schema, "TestClass");
      await (entityClass as ECClass as MutableClass).createPrimitiveProperty("TestPropertyA", PrimitiveType.String);

      const properties = [...entityClass.properties!];
      await visitor.visitProperty(properties[0] as AnyProperty);

      const diagnostic = new TestDiagnostics.FailingPropertyDiagnostic(properties[0] as AnyProperty, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Property suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const entityClass = new EntityClass(schema, "TestClass");
      await (entityClass as ECClass as MutableClass).createPrimitiveProperty("TestPropertyA", PrimitiveType.String);

      const properties = [...entityClass.properties!];
      await visitor.visitProperty(properties[0] as AnyProperty);

      const diagnostic = new TestDiagnostics.FailingPropertyDiagnostic(properties[0] as AnyProperty, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitEntityClass tests", () => {
    it("calls rules properly", async () => {
      const ruleSetA = new TestRuleSet();
      const ruleSetB = new TestRuleSetB();
      visitor.registerRuleSet(ruleSetA);
      visitor.registerRuleSet(ruleSetB);
      const entity = new EntityClass(schema, "TestClass");

      await visitor.visitEntityClass(entity);

      ruleSetA.entityClassRules.forEach((spy) => expect(spy.calledOnceWithExactly(entity)).to.be.true);
      ruleSetB.entityClassRules.forEach((spy) => expect(spy.calledOnceWithExactly(entity)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new EntityClass(schema, "TestClass");

      await visitor.visitEntityClass(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const entity = new EntityClass(schema, "TestClass");

      await visitor.visitEntityClass(entity);

      const diagnostic = new TestDiagnostics.FailingEntityClassDiagnostic(entity, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const entity = new EntityClass(schema, "TestClass");

      await visitor.visitEntityClass(entity);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Entity suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const entity = new EntityClass(schema, "TestClass");

      await visitor.visitEntityClass(entity);

      const diagnostic = new TestDiagnostics.FailingEntityClassDiagnostic(entity, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Entity suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const entity = new EntityClass(schema, "TestClass");

      await visitor.visitEntityClass(entity);

      const diagnostic = new TestDiagnostics.FailingEntityClassDiagnostic(entity, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitStructClass tests", () => {
    it("calls rules properly", async () => {
      const ruleSetA = new TestRuleSet();
      const ruleSetB = new TestRuleSetB();
      visitor.registerRuleSet(ruleSetA);
      visitor.registerRuleSet(ruleSetB);
      const struct = new StructClass(schema, "TestClass");

      await visitor.visitStructClass(struct);

      ruleSetA.structClassRules.forEach((spy) => expect(spy.calledOnceWithExactly(struct)).to.be.true);
      ruleSetB.structClassRules.forEach((spy) => expect(spy.calledOnceWithExactly(struct)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new StructClass(schema, "TestClass");

      await visitor.visitStructClass(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const struct = new StructClass(schema, "TestClass");

      await visitor.visitStructClass(struct);

      const diagnostic = new TestDiagnostics.FailingStructClassDiagnostic(struct, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const struct = new StructClass(schema, "TestClass");

      await visitor.visitStructClass(struct);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Struct suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const struct = new StructClass(schema, "TestClass");

      await visitor.visitStructClass(struct);

      const diagnostic = new TestDiagnostics.FailingStructClassDiagnostic(struct, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Struct suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const struct = new StructClass(schema, "TestClass");

      await visitor.visitStructClass(struct);

      const diagnostic = new TestDiagnostics.FailingStructClassDiagnostic(struct, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitMixin tests", () => {
    it("calls rules properly", async () => {
      const ruleSetA = new TestRuleSet();
      const ruleSetB = new TestRuleSetB();
      visitor.registerRuleSet(ruleSetA);
      visitor.registerRuleSet(ruleSetB);
      const mixin = new Mixin(schema, "TestClass");

      await visitor.visitMixin(mixin);

      ruleSetA.mixinRules.forEach((spy) => expect(spy.calledOnceWithExactly(mixin)).to.be.true);
      ruleSetB.mixinRules.forEach((spy) => expect(spy.calledOnceWithExactly(mixin)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new Mixin(schema, "TestClass");

      await visitor.visitMixin(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const mixin = new Mixin(schema, "TestClass");

      await visitor.visitMixin(mixin);

      const diagnostic = new TestDiagnostics.FailingMixinDiagnostic(mixin, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const mixin = new Mixin(schema, "TestClass");

      await visitor.visitMixin(mixin);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Mixin suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const mixin = new Mixin(schema, "TestClass");

      await visitor.visitMixin(mixin);

      const diagnostic = new TestDiagnostics.FailingMixinDiagnostic(mixin, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Mixin suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const mixin = new Mixin(schema, "TestClass");

      await visitor.visitMixin(mixin);

      const diagnostic = new TestDiagnostics.FailingMixinDiagnostic(mixin, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitRelationshipClass tests", () => {
    it("calls relationship rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const relationshipClass = new RelationshipClass(schema, "TestClass");

      await visitor.visitRelationshipClass(relationshipClass);

      ruleSet.relationshipRules.forEach((spy) => expect(spy.calledOnceWithExactly(relationshipClass)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new RelationshipClass(schema, "TestClass");

      await visitor.visitRelationshipClass(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const relationship = new RelationshipClass(schema, "TestClass");

      await visitor.visitRelationshipClass(relationship);

      const diagnostic = new TestDiagnostics.FailingRelationshipDiagnostic(relationship, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const relationship = new RelationshipClass(schema, "TestClass");

      await visitor.visitRelationshipClass(relationship);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Relationship class suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const relationship = new RelationshipClass(schema, "TestClass");

      await visitor.visitRelationshipClass(relationship);

      const diagnostic = new TestDiagnostics.FailingRelationshipDiagnostic(relationship, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Relationship class suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const relationship = new RelationshipClass(schema, "TestClass");

      await visitor.visitRelationshipClass(relationship);

      const diagnostic = new TestDiagnostics.FailingRelationshipDiagnostic(relationship, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitRelationshipConstraint tests", () => {
    it("calls relationship constraint rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const relationshipClass = new RelationshipClass(schema, "TestClass");
      const constraint = new RelationshipConstraint(relationshipClass, RelationshipEnd.Source);

      await visitor.visitRelationshipConstraint(constraint);

      ruleSet.relationshipConstraintRules.forEach((spy) => expect(spy.calledOnceWithExactly(constraint)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const relationshipClass = new RelationshipClass(schema, "TestClass");
      const constraint = new RelationshipConstraint(relationshipClass, RelationshipEnd.Source);

      await visitor.visitRelationshipConstraint(constraint);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const relationship = new RelationshipClass(schema, "TestClass");
      const constraint = new RelationshipConstraint(relationship, RelationshipEnd.Source);

      await visitor.visitRelationshipConstraint(constraint);

      const diagnostic = new TestDiagnostics.FailingRelationshipConstraintDiagnostic(constraint, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const relationship = new RelationshipClass(schema, "TestClass");
      const constraint = new RelationshipConstraint(relationship, RelationshipEnd.Source);

      await visitor.visitRelationshipConstraint(constraint);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Relationship Constraint suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const relationship = new RelationshipClass(schema, "TestClass");
      const constraint = new RelationshipConstraint(relationship, RelationshipEnd.Source);

      await visitor.visitRelationshipConstraint(constraint);

      const diagnostic = new TestDiagnostics.FailingRelationshipConstraintDiagnostic(constraint, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Relationship Constraint suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const relationship = new RelationshipClass(schema, "TestClass");
      const constraint = new RelationshipConstraint(relationship, RelationshipEnd.Source);

      await visitor.visitRelationshipConstraint(constraint);

      const diagnostic = new TestDiagnostics.FailingRelationshipConstraintDiagnostic(constraint, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitCustomAttributeClass tests", () => {
    it("calls CustomAttributeClass rules properly", async () => {
      const ruleSetA = new TestRuleSet();
      const ruleSetB = new TestRuleSetB();
      visitor.registerRuleSet(ruleSetA);
      visitor.registerRuleSet(ruleSetB);
      const schemaItem = new CustomAttributeClass(schema, "TestClass");

      await visitor.visitCustomAttributeClass(schemaItem);

      ruleSetA.customAttributeClassRules.forEach((spy) => expect(spy.calledOnceWithExactly(schemaItem)).to.be.true);
      ruleSetB.customAttributeClassRules.forEach((spy) => expect(spy.calledOnceWithExactly(schemaItem)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new CustomAttributeClass(schema, "TestClass");

      await visitor.visitCustomAttributeClass(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const schemaItem = new CustomAttributeClass(schema, "TestClass");

      await visitor.visitCustomAttributeClass(schemaItem);

      const diagnostic = new TestDiagnostics.FailingCustomAttributeClassDiagnostic(schemaItem, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const schemaItem = new CustomAttributeClass(schema, "TestClass");

      await visitor.visitCustomAttributeClass(schemaItem);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Custom Attribute Class suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const schemaItem = new CustomAttributeClass(schema, "TestClass");

      await visitor.visitCustomAttributeClass(schemaItem);

      const diagnostic = new TestDiagnostics.FailingCustomAttributeClassDiagnostic(schemaItem, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Custom Attribute Class suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const schemaItem = new CustomAttributeClass(schema, "TestClass");

      await visitor.visitCustomAttributeClass(schemaItem);

      const diagnostic = new TestDiagnostics.FailingCustomAttributeClassDiagnostic(schemaItem, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitCustomAttributeContainerTests tests", () => {
    it("EntityClass, calls CustomAttributeContainer and CustomAttribute rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const entityClass = new EntityClass(schema, "TestClass");
      (entityClass as unknown as MutableClass).addCustomAttribute({ className: "TestSchema.TestCA" });

      await visitor.visitCustomAttributeContainer(entityClass);

      ruleSet.customAttributeContainerRules.forEach((spy) => expect(spy.calledOnceWithExactly(entityClass)).to.be.true);
      ruleSet.customAttributeInstanceRules.forEach((spy) => expect(spy.calledOnceWithExactly(entityClass, entityClass.customAttributes!.get("TestSchema.TestCA")!)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const entityClass = new EntityClass(schema, "TestClass");
      (entityClass as unknown as MutableClass).addCustomAttribute({ className: "TestSchema.TestCA" });

      await visitor.visitCustomAttributeContainer(entityClass);
    });

    it("Property, calls CustomAttributeContainer rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const entityClass = new EntityClass(schema, "TestClass");
      const property = await (entityClass as ECClass as MutableClass).createPrimitiveProperty("TestPropertyA", PrimitiveType.String);
      (property as unknown as MutableProperty).addCustomAttribute({ className: "TestSchema.TestCA" });

      const properties = [...entityClass.properties!];
      await visitor.visitCustomAttributeContainer(properties[0] as AnyProperty);

      ruleSet.customAttributeContainerRules.forEach((spy) => expect(spy.calledOnceWithExactly(properties[0])).to.be.true);
      ruleSet.customAttributeInstanceRules.forEach((spy) => expect(spy.calledOnceWithExactly(properties[0], property.customAttributes!.get("TestSchema.TestCA")!)).to.be.true);
    });

    it("Property, exclude TestSchema, does not call CustomAttributeContainer rules", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const entityClass = new EntityClass(schema, "TestClass");
      const property = await (entityClass as ECClass as MutableClass).createPrimitiveProperty("TestPropertyA", PrimitiveType.String);
      (property as unknown as MutableProperty).addCustomAttribute({ className: "TestSchema.TestCA" });

      const properties = [...entityClass.properties!];
      await visitor.visitCustomAttributeContainer(properties[0] as AnyProperty);

      ruleSet.customAttributeContainerRules.forEach((spy) => expect(spy.notCalled).to.be.true);
      ruleSet.customAttributeInstanceRules.forEach((spy) => expect(spy.notCalled).to.be.true);
    });

    it("RelationshipClass, calls CustomAttributeContainer rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const relationshipClass = new RelationshipClass(schema, "TestClass");
      (relationshipClass as unknown as MutableClass).addCustomAttribute({ className: "TestSchema.TestCA" });

      await visitor.visitCustomAttributeContainer(relationshipClass);

      ruleSet.customAttributeContainerRules.forEach((spy) => expect(spy.calledOnceWithExactly(relationshipClass)).to.be.true);
      ruleSet.customAttributeInstanceRules.forEach((spy) => expect(spy.calledOnceWithExactly(relationshipClass, relationshipClass.customAttributes!.get("TestSchema.TestCA")!)).to.be.true);
    });

    it("RelationshipClass, exclude TestSchema, does not call CustomAttributeContainer rules", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const relationshipClass = new RelationshipClass(schema, "TestClass");
      (relationshipClass as unknown as MutableClass).addCustomAttribute({ className: "TestSchema.TestCA" });

      await visitor.visitCustomAttributeContainer(relationshipClass);

      ruleSet.customAttributeContainerRules.forEach((spy) => expect(spy.notCalled).to.be.true);
      ruleSet.customAttributeInstanceRules.forEach((spy) => expect(spy.notCalled).to.be.true);
    });

    it("RelationshipConstraint, calls CustomAttributeContainer rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const relationshipClass = new RelationshipClass(schema, "TestClass");
      const constraint = new RelationshipConstraint(relationshipClass, RelationshipEnd.Source);
      (constraint as unknown as MutableClass).addCustomAttribute({ className: "TestSchema.TestCA" });

      await visitor.visitCustomAttributeContainer(constraint);

      ruleSet.customAttributeContainerRules.forEach((spy) => expect(spy.calledOnceWithExactly(constraint)).to.be.true);
      ruleSet.customAttributeInstanceRules.forEach((spy) => expect(spy.calledOnceWithExactly(constraint, constraint.customAttributes!.get("TestSchema.TestCA")!)).to.be.true);
    });

    it("RelationshipConstraint, exclude TestSchema, does not call CustomAttributeContainer rules", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const relationshipClass = new RelationshipClass(schema, "TestClass");
      const constraint = new RelationshipConstraint(relationshipClass, RelationshipEnd.Source);
      (constraint as unknown as MutableClass).addCustomAttribute({ className: "TestSchema.TestCA" });

      await visitor.visitCustomAttributeContainer(constraint);

      ruleSet.customAttributeContainerRules.forEach((spy) => expect(spy.notCalled).to.be.true);
      ruleSet.customAttributeInstanceRules.forEach((spy) => expect(spy.notCalled).to.be.true);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const entityClass = new EntityClass(schema, "TestClass");
      (entityClass as unknown as MutableClass).addCustomAttribute({ className: "TestSchema.TestCA" });

      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);

      await visitor.visitCustomAttributeContainer(entityClass);

      const diagnostic = new TestDiagnostics.FailingCustomAttributeContainerDiagnostic(entityClass, ["Param1", "Param2"]);
      expect(reportSpy.calledTwice).to.be.true;
      expect(reportSpy.calledWithExactly(diagnostic)).to.be.true;
    });

    it("Custom Attribute Container suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);

      const relationshipClass = new RelationshipClass(schema, "TestClass");
      const constraint = new RelationshipConstraint(relationshipClass, RelationshipEnd.Source);
      (constraint as unknown as MutableClass).addCustomAttribute({ className: "TestSchema.TestCA" });

      await visitor.visitCustomAttributeContainer(constraint);

      const diagnostic = new TestDiagnostics.FailingCustomAttributeContainerDiagnostic(constraint, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledTwice).to.be.true;
      expect(reportSpy.alwaysCalledWithExactly(diagnostic)).to.be.true;
    });

    it("Custom Attribute Container suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const relationshipClass = new RelationshipClass(schema, "TestClass");
      const constraint = new RelationshipConstraint(relationshipClass, RelationshipEnd.Source);
      (constraint as unknown as MutableClass).addCustomAttribute({ className: "TestSchema.TestCA" });

      await visitor.visitCustomAttributeContainer(constraint);

      const diagnostic = new TestDiagnostics.FailingCustomAttributeContainerDiagnostic(constraint, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.false;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitEnumeration tests", () => {
    it("calls rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const enumeration = new Enumeration(schema, "TestClass");

      await visitor.visitEnumeration(enumeration);

      ruleSet.enumerationRules.forEach((spy) => expect(spy.calledOnceWithExactly(enumeration)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new Enumeration(schema, "TestClass");

      await visitor.visitEnumeration(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const enumeration = new Enumeration(schema, "TestClass");

      await visitor.visitEnumeration(enumeration);

      const diagnostic = new TestDiagnostics.FailingEnumerationDiagnostic(enumeration, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const enumeration = new Enumeration(schema, "TestClass");

      await visitor.visitEnumeration(enumeration);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Enumeration suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const enumeration = new Enumeration(schema, "TestClass");

      await visitor.visitEnumeration(enumeration);

      const diagnostic = new TestDiagnostics.FailingEnumerationDiagnostic(enumeration, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Enumeration suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const enumeration = new Enumeration(schema, "TestClass");

      await visitor.visitEnumeration(enumeration);

      const diagnostic = new TestDiagnostics.FailingEnumerationDiagnostic(enumeration, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitKindOfQuantity tests", () => {
    it("calls rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const koq = new KindOfQuantity(schema, "TestClass");

      await visitor.visitKindOfQuantity(koq);

      ruleSet.kindOfQuantityRules.forEach((spy) => expect(spy.calledOnceWithExactly(koq)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new KindOfQuantity(schema, "TestClass");

      await visitor.visitKindOfQuantity(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const koq = new KindOfQuantity(schema, "TestClass");

      await visitor.visitKindOfQuantity(koq);

      const diagnostic = new TestDiagnostics.FailingKindOfQuantityDiagnostic(koq, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude Schema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const koq = new KindOfQuantity(schema, "TestClass");

      await visitor.visitKindOfQuantity(koq);
      expect(reportSpy.notCalled).to.be.true;
    });

    it("Kind of Quantity suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSet(ruleSet);
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const koq = new KindOfQuantity(schema, "TestClass");

      await visitor.visitKindOfQuantity(koq);

      const diagnostic = new TestDiagnostics.FailingKindOfQuantityDiagnostic(koq, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Kind of Quantity suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSet(ruleSet);
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const koq = new KindOfQuantity(schema, "TestClass");

      await visitor.visitKindOfQuantity(koq);

      const diagnostic = new TestDiagnostics.FailingKindOfQuantityDiagnostic(koq, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitPropertyCategory tests", () => {
    it("calls rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const category = new PropertyCategory(schema, "TestClass");

      await visitor.visitPropertyCategory(category);

      ruleSet.propertyCategoryRules.forEach((spy) => expect(spy.calledOnceWithExactly(category)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new PropertyCategory(schema, "TestClass");

      await visitor.visitPropertyCategory(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const category = new PropertyCategory(schema, "TestClass");

      await visitor.visitPropertyCategory(category);

      const diagnostic = new TestDiagnostics.FailingPropertyCategoryDiagnostic(category, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude Schema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const category = new PropertyCategory(schema, "TestClass");

      await visitor.visitPropertyCategory(category);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Property Category suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const category = new PropertyCategory(schema, "TestClass");

      await visitor.visitPropertyCategory(category);

      const diagnostic = new TestDiagnostics.FailingPropertyCategoryDiagnostic(category, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Property Category suppression applied and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const category = new PropertyCategory(schema, "TestClass");

      await visitor.visitPropertyCategory(category);

      const diagnostic = new TestDiagnostics.FailingPropertyCategoryDiagnostic(category, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitFormat tests", () => {
    it("calls rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const format = new Format(schema, "TestClass");

      await visitor.visitFormat(format);

      ruleSet.formatRules.forEach((spy) => expect(spy.calledOnceWithExactly(format)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new Format(schema, "TestClass");

      await visitor.visitFormat(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const format = new Format(schema, "TestClass");

      await visitor.visitFormat(format);

      const diagnostic = new TestDiagnostics.FailingFormatDiagnostic(format, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const format = new Format(schema, "TestClass");

      await visitor.visitFormat(format);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Format suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const format = new Format(schema, "TestClass");

      await visitor.visitFormat(format);

      const diagnostic = new TestDiagnostics.FailingFormatDiagnostic(format, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Format suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const format = new Format(schema, "TestClass");

      await visitor.visitFormat(format);

      const diagnostic = new TestDiagnostics.FailingFormatDiagnostic(format, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitUnit tests", () => {
    it("calls rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const unit = new Unit(schema, "TestClass");

      await visitor.visitUnit(unit);

      ruleSet.unitRules.forEach((spy) => expect(spy.calledOnceWithExactly(unit)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new Unit(schema, "TestClass");

      await visitor.visitUnit(schemaItem);
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const unit = new Unit(schema, "TestClass");

      await visitor.visitUnit(unit);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const unit = new Unit(schema, "TestClass");

      await visitor.visitUnit(unit);

      const diagnostic = new TestDiagnostics.FailingUnitDiagnostic(unit, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Unit suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const unit = new Unit(schema, "TestClass");

      await visitor.visitUnit(unit);

      const diagnostic = new TestDiagnostics.FailingUnitDiagnostic(unit, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Unit suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const unit = new Unit(schema, "TestClass");

      await visitor.visitUnit(unit);

      const diagnostic = new TestDiagnostics.FailingUnitDiagnostic(unit, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitInvertedUnit tests", () => {
    it("calls rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const invertedUnit = new InvertedUnit(schema, "TestClass");

      await visitor.visitInvertedUnit(invertedUnit);

      ruleSet.invertedUnitRules.forEach((spy) => expect(spy.calledOnceWithExactly(invertedUnit)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new InvertedUnit(schema, "TestClass");

      await visitor.visitInvertedUnit(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const invertedUnit = new InvertedUnit(schema, "TestClass");

      await visitor.visitInvertedUnit(invertedUnit);

      const diagnostic = new TestDiagnostics.FailingInvertedUnitFormatDiagnostic(invertedUnit, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const invertedUnit = new InvertedUnit(schema, "TestClass");

      await visitor.visitInvertedUnit(invertedUnit);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Inverted Unit suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const invertedUnit = new InvertedUnit(schema, "TestClass");

      await visitor.visitInvertedUnit(invertedUnit);

      const diagnostic = new TestDiagnostics.FailingInvertedUnitFormatDiagnostic(invertedUnit, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Inverted Unit suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const invertedUnit = new InvertedUnit(schema, "TestClass");

      await visitor.visitInvertedUnit(invertedUnit);

      const diagnostic = new TestDiagnostics.FailingInvertedUnitFormatDiagnostic(invertedUnit, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitUnitSystem tests", () => {
    it("calls rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const unitSystem = new UnitSystem(schema, "TestClass");

      await visitor.visitUnitSystem(unitSystem);

      ruleSet.unitSystemRules.forEach((spy) => expect(spy.calledOnceWithExactly(unitSystem)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new UnitSystem(schema, "TestClass");

      await visitor.visitUnitSystem(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const unitSystem = new UnitSystem(schema, "TestClass");

      await visitor.visitUnitSystem(unitSystem);

      const diagnostic = new TestDiagnostics.FailingUnitSystemDiagnostic(unitSystem, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const unitSystem = new UnitSystem(schema, "TestClass");

      await visitor.visitUnitSystem(unitSystem);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Unit System suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const unitSystem = new UnitSystem(schema, "TestClass");

      await visitor.visitUnitSystem(unitSystem);

      const diagnostic = new TestDiagnostics.FailingUnitSystemDiagnostic(unitSystem, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Unit System suppression applied and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const unitSystem = new UnitSystem(schema, "TestClass");

      await visitor.visitUnitSystem(unitSystem);

      const diagnostic = new TestDiagnostics.FailingUnitSystemDiagnostic(unitSystem, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitPhenomenon tests", () => {
    it("calls rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const phenomenon = new Phenomenon(schema, "TestClass");

      await visitor.visitPhenomenon(phenomenon);

      ruleSet.phenomenonRules.forEach((spy) => expect(spy.calledOnceWithExactly(phenomenon)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new Phenomenon(schema, "TestClass");

      await visitor.visitPhenomenon(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const phenomenon = new Phenomenon(schema, "TestClass");

      await visitor.visitPhenomenon(phenomenon);

      const diagnostic = new TestDiagnostics.FailingPhenomenonDiagnostic(phenomenon, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const phenomenon = new Phenomenon(schema, "TestClass");

      await visitor.visitPhenomenon(phenomenon);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Phenomenon suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const phenomenon = new Phenomenon(schema, "TestClass");

      await visitor.visitPhenomenon(phenomenon);

      const diagnostic = new TestDiagnostics.FailingPhenomenonDiagnostic(phenomenon, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Phenomenon suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const phenomenon = new Phenomenon(schema, "TestClass");

      await visitor.visitPhenomenon(phenomenon);

      const diagnostic = new TestDiagnostics.FailingPhenomenonDiagnostic(phenomenon, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });

  describe("visitConstant tests", () => {
    it("calls rules properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const constant = new Constant(schema, "TestClass");

      await visitor.visitConstant(constant);

      ruleSet.constantRules.forEach((spy) => expect(spy.calledOnceWithExactly(constant)).to.be.true);
    });

    it("No rules, visit does not fail", async () => {
      visitor.registerRuleSet(new EmptyRuleSet());
      const schemaItem = new Constant(schema, "TestClass");

      await visitor.visitConstant(schemaItem);
    });

    it("failing rules, reporter called properly", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const constant = new Constant(schema, "TestClass");

      await visitor.visitConstant(constant);

      const diagnostic = new TestDiagnostics.FailingConstantDiagnostic(constant, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("failing rules, exclude TestSchema, reporter not called", async () => {
      const ruleSet = new TestRuleSet(true);
      visitor.registerRuleSet(ruleSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const constant = new Constant(schema, "TestClass");

      await visitor.visitConstant(constant);

      expect(reportSpy.notCalled).to.be.true;
    });

    it("Constant suppression applied and diagnostic category set to warning", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new ApplySuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const constant = new Constant(schema, "TestClass");

      await visitor.visitConstant(constant);

      const diagnostic = new TestDiagnostics.FailingConstantDiagnostic(constant, ["Param1", "Param2"]);
      diagnostic.category = DiagnosticCategory.Warning;
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
    });

    it("Constant suppression ignored and diagnostic category left as error", async () => {
      const ruleSet = new TestRuleSet();
      visitor.registerRuleSet(ruleSet);
      const suppressionSet = new IgnoreSuppressionSet();
      visitor.registerRuleSuppressionSet(suppressionSet);
      const reporter = new TestReporter();
      const reportSpy = sinon.spy(reporter, "report");
      visitor.registerReporter(reporter);
      const constant = new Constant(schema, "TestClass");

      await visitor.visitConstant(constant);

      const diagnostic = new TestDiagnostics.FailingConstantDiagnostic(constant, ["Param1", "Param2"]);
      expect(reportSpy.calledOnceWithExactly(diagnostic)).to.be.true;
      expect(diagnostic.category).to.equal(DiagnosticCategory.Error);
    });
  });
});
