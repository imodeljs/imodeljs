/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { Logger } from "@bentley/bentleyjs-core";
import { I18N, I18NNamespace } from "@bentley/imodeljs-i18n";
import { ECClass, EntityClass, PrimitiveProperty, PrimitiveType, Schema, SchemaContext } from "@bentley/ecschema-metadata";
import { MutableClass } from "../../Editing/Mutable/MutableClass";
import { AnyDiagnostic, createPropertyDiagnosticClass, DiagnosticCategory } from "../../Validation/Diagnostic";
import { LoggingDiagnosticReporter } from "../../Validation/LoggingDiagnosticReporter";
import { FormatDiagnosticReporter } from "../../ecschema-editing";
import sinon = require("sinon");

/* eslint-disable-next-line deprecation/deprecation */
class TestDiagnosticReporter extends FormatDiagnosticReporter {
  constructor(suppressions?: Map<string, string[]>) {
    super(suppressions);
  }
  public reportDiagnostic(_diagnostic: AnyDiagnostic, _messageText: string) {
  }
}

describe("DiagnosticReporters tests", () => {
  (global as any).XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest; // eslint-disable-line @typescript-eslint/no-var-requires

  let testSchema: Schema;
  let testSchemaItem: EntityClass;
  let testProperty: PrimitiveProperty;
  let testDiagnostics: AnyDiagnostic[];

  async function createTestDiagnostic(category: DiagnosticCategory, messageArgs: any[] = ["Param1", "Param2"]): Promise<AnyDiagnostic> {
    testSchema = new Schema(new SchemaContext(), "TestSchema", "ts", 1, 0, 0);
    testSchemaItem = new EntityClass(testSchema, "TestEntity");
    testProperty = await (testSchemaItem as ECClass as MutableClass).createPrimitiveProperty("TestProperty", PrimitiveType.String);
    const diagnosticClass = createPropertyDiagnosticClass("TestRuleSet-100", "Test Message {0} {1}");
    const diagnostic = new diagnosticClass(testProperty, messageArgs, category);
    // These were added to a test collection because the generator, createAsyncIterableDiagnostic,
    // can only be consumed once, hence the need for the collection, which allows the tests access
    // to the created diagnostics.
    testDiagnostics.push(diagnostic);
    return diagnostic;
  }

  beforeEach(() => {
    testDiagnostics = [];
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("FormatDiagnosticReporter tests", () => {
    it("suppressions specified, suppressions set correctly", async () => {
      const suppressions = new Map<string, string[]>();
      suppressions.set("schema1", ["code1"]);
      suppressions.set("schema1", ["code2"]);
      const reporter = new TestDiagnosticReporter(suppressions);

      expect(reporter.suppressions).equals(suppressions);
    });

    it("no suppressions, should call reportDiagnostic correctly", async () => {
      const reporter = new TestDiagnosticReporter();
      const reportDiagnostic = sinon.stub(reporter, "reportDiagnostic");
      const diag = await createTestDiagnostic(DiagnosticCategory.Error);

      reporter.report(diag);

      expect(reportDiagnostic.calledOnceWith(diag, "Test Message Param1 Param2")).to.be.true;
    });

    it("rules code not in suppressions, should call reportDiagnostic correctly", async () => {
      const diag = await createTestDiagnostic(DiagnosticCategory.Error);
      const suppressions = new Map<string, string[]>();
      suppressions.set(testSchema.fullName, ["randomCode"]);
      const reporter = new TestDiagnosticReporter(suppressions);
      const reportDiagnostic = sinon.stub(reporter, "reportDiagnostic");

      reporter.report(diag);

      expect(reportDiagnostic.calledOnceWith(diag, "Test Message Param1 Param2")).to.be.true;
    });

    it("diagnostic suppressed, should not call reportDiagnostic", async () => {
      const diag = await createTestDiagnostic(DiagnosticCategory.Error);
      const suppressions = new Map<string, string[]>();
      suppressions.set(testSchema.fullName, [diag.code]);
      const reporter = new TestDiagnosticReporter(suppressions);
      const reportDiagnostic = sinon.stub(reporter, "reportDiagnostic");

      reporter.report(diag);

      expect(reportDiagnostic.notCalled).to.be.true;
    });

  });

  describe("LoggingDiagnosticReporter tests", () => {
    it("should log expected error", async () => {
      const logMessage = sinon.stub(Logger, "logError");
      const reporter = new LoggingDiagnosticReporter();
      const diag = await createTestDiagnostic(DiagnosticCategory.Error);

      reporter.report(diag);

      expect(logMessage.calledOnceWith("ecschema-metadata", "Test Message Param1 Param2")).to.be.true;
      const metaDataFunc = logMessage.firstCall.args[2];
      assert.isDefined(metaDataFunc);
      const metaData = metaDataFunc!();
      assert.isDefined(metaData);
      expect(metaData.code).to.equal("TestRuleSet-100");
      expect(metaData.category).to.equal(DiagnosticCategory.Error);
      expect(metaData.ecDefinition).to.equal(testProperty);
      expect(metaData.messageText).to.be.undefined;
      expect(metaData.messageArgs).to.be.undefined;
    });

    it("should log expected error with translated message", async () => {
      const i18n = new I18N();
      const i18nMock = sinon.mock(i18n);
      const registerNamespace = i18nMock.expects("registerNamespace");
      registerNamespace.resolves(new I18NNamespace("ECSchemaMetaData", Promise.resolve()));
      const translate = i18nMock.expects("translate");
      translate.returns("Translated text {0} {1}");
      const logMessage = sinon.stub(Logger, "logError");
      const reporter = new LoggingDiagnosticReporter(undefined, i18n);
      const diag = await createTestDiagnostic(DiagnosticCategory.Error);

      reporter.report(diag);

      expect(logMessage.calledOnceWith("ecschema-metadata", "Translated text Param1 Param2")).to.be.true;
    });

    it("no message args, should log expected error with translated message", async () => {
      const i18n = new I18N();
      const i18nMock = sinon.mock(i18n);
      const registerNamespace = i18nMock.expects("registerNamespace");
      registerNamespace.resolves(new I18NNamespace("ECSchemaMetaData", Promise.resolve()));
      const translate = i18nMock.expects("translate");
      translate.returns("Translated text");
      const logMessage = sinon.stub(Logger, "logError");
      const reporter = new LoggingDiagnosticReporter(undefined, i18n);
      const diag = await createTestDiagnostic(DiagnosticCategory.Error, []);

      reporter.report(diag);

      expect(logMessage.calledOnceWith("ecschema-metadata", "Translated text")).to.be.true;
    });

    it("should log expected warning", async () => {
      const logMessage = sinon.stub(Logger, "logWarning");
      const reporter = new LoggingDiagnosticReporter();
      const diag = await createTestDiagnostic(DiagnosticCategory.Warning);

      reporter.report(diag);

      expect(logMessage.calledOnceWith("ecschema-metadata", "Test Message Param1 Param2")).to.be.true;
      const metaDataFunc = logMessage.firstCall.args[2];
      assert.isDefined(metaDataFunc);
      const metaData = metaDataFunc!();
      assert.isDefined(metaData);
      expect(metaData.code).to.equal("TestRuleSet-100");
      expect(metaData.category).to.equal(DiagnosticCategory.Warning);
      expect(metaData.ecDefinition).to.equal(testProperty);
      expect(metaData.messageText).to.be.undefined;
      expect(metaData.messageArgs).to.be.undefined;
    });

    it("should log expected message", async () => {
      const logMessage = sinon.stub(Logger, "logInfo");
      const reporter = new LoggingDiagnosticReporter();
      const diag = await createTestDiagnostic(DiagnosticCategory.Message);

      reporter.report(diag);

      expect(logMessage.calledOnceWith("ecschema-metadata", "Test Message Param1 Param2")).to.be.true;
      const metaDataFunc = logMessage.firstCall.args[2];
      assert.isDefined(metaDataFunc);
      const metaData = metaDataFunc!();
      assert.isDefined(metaData);
      expect(metaData.code).to.equal("TestRuleSet-100");
      expect(metaData.category).to.equal(DiagnosticCategory.Message);
      expect(metaData.ecDefinition).to.equal(testProperty);
      expect(metaData.messageText).to.be.undefined;
      expect(metaData.messageArgs).to.be.undefined;
    });

    it("should log expected suggestion", async () => {
      const logMessage = sinon.stub(Logger, "logInfo");
      const reporter = new LoggingDiagnosticReporter();
      const diag = await createTestDiagnostic(DiagnosticCategory.Suggestion);

      reporter.report(diag);

      expect(logMessage.calledOnceWith("ecschema-metadata", "Test Message Param1 Param2")).to.be.true;
      const metaDataFunc = logMessage.firstCall.args[2];
      assert.isDefined(metaDataFunc);
      const metaData = metaDataFunc!();
      assert.isDefined(metaData);
      expect(metaData.code).to.equal("TestRuleSet-100");
      expect(metaData.category).to.equal(DiagnosticCategory.Suggestion);
      expect(metaData.ecDefinition).to.equal(testProperty);
      expect(metaData.messageText).to.be.undefined;
      expect(metaData.messageArgs).to.be.undefined;
    });
  });
});
