/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/* eslint-disable deprecation/deprecation */

import { expect } from "chai";
import faker from "faker";
import sinon from "sinon";
import { DbResult, Id64String } from "@bentley/bentleyjs-core";
import {
  BisCoreSchema, CodeSpecs, DefinitionModel, DefinitionPartition, ECSqlStatement, IModelDb, KnownLocations, Model, Subject,
} from "@bentley/imodeljs-backend";
import { BisCodeSpec, Code, CodeScopeSpec, CodeSpec, DefinitionElementProps } from "@bentley/imodeljs-common";
import { Ruleset } from "@bentley/presentation-common";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import { PresentationRules } from "../presentation-backend/domain/PresentationRulesDomain";
import * as RulesetElements from "../presentation-backend/domain/RulesetElements";
import { DuplicateRulesetHandlingStrategy, RulesetEmbedder } from "../presentation-backend/RulesetEmbedder";
import { normalizeVersion } from "../presentation-backend/Utils";

describe("RulesetEmbedder", () => {
  let embedder: RulesetEmbedder;

  let imodelMock: moq.IMock<IModelDb>;
  let codeSpecsMock: moq.IMock<CodeSpecs>;
  let elementsMock: moq.IMock<IModelDb.Elements>;
  let modelsMock: moq.IMock<IModelDb.Models>;
  let rootSubjectMock: moq.IMock<Subject>;
  let presentationRulesSubjectMock: moq.IMock<Subject>;
  let definitionPartitionMock: moq.IMock<DefinitionPartition>;
  let rulesetModelMock: moq.IMock<Model>;

  let rootSubjectId: string;
  let presentationRulesSubjectId: string;
  let definitionPartitionId: string;
  let modelId: string;

  let rulesetCodeSpec: CodeSpec;
  let subjectCodeSpec: CodeSpec;
  let informationPartitionCodeSpec: CodeSpec;

  beforeEach(async () => {
    sinon.stub(KnownLocations, "nativeAssetsDir").get(() => "");
    BisCoreSchema.registerSchema();
    initializeMocks();
    embedder = new RulesetEmbedder({ imodel: imodelMock.object });
  });

  afterEach(async () => {
    sinon.restore();
  });

  function initializeMocks() {
    // ids
    rootSubjectId = faker.random.uuid();
    presentationRulesSubjectId = faker.random.uuid();
    definitionPartitionId = faker.random.uuid();
    modelId = faker.random.uuid();

    // create mocks
    imodelMock = moq.Mock.ofType<IModelDb>();
    codeSpecsMock = moq.Mock.ofType<CodeSpecs>();
    elementsMock = moq.Mock.ofType<IModelDb.Elements>();
    modelsMock = moq.Mock.ofType<IModelDb.Models>();
    rootSubjectMock = moq.Mock.ofType<Subject>();
    presentationRulesSubjectMock = moq.Mock.ofType<Subject>();
    definitionPartitionMock = moq.Mock.ofType<DefinitionPartition>();
    rulesetModelMock = moq.Mock.ofType<Model>();

    // create code specs
    rulesetCodeSpec = CodeSpec.create(imodelMock.object, PresentationRules.CodeSpec.Ruleset, CodeScopeSpec.Type.Model);

    subjectCodeSpec = CodeSpec.create(imodelMock.object, BisCodeSpec.subject, CodeScopeSpec.Type.ParentElement);
    subjectCodeSpec.id = faker.random.uuid();

    informationPartitionCodeSpec = CodeSpec.create(imodelMock.object, BisCodeSpec.informationPartitionElement, CodeScopeSpec.Type.ParentElement);
    informationPartitionCodeSpec.id = faker.random.uuid();

    // set up mocks
    imodelMock.setup((x) => x.codeSpecs).returns(() => codeSpecsMock.object);
    imodelMock.setup((x) => x.elements).returns(() => elementsMock.object);
    imodelMock.setup((x) => x.models).returns(() => modelsMock.object);

    codeSpecsMock.setup((x) => x.getByName(PresentationRules.CodeSpec.Ruleset)).returns(() => rulesetCodeSpec);
    codeSpecsMock.setup((x) => x.getByName(BisCodeSpec.subject)).returns(() => subjectCodeSpec);
    codeSpecsMock.setup((x) => x.getByName(BisCodeSpec.informationPartitionElement)).returns(() => informationPartitionCodeSpec);

    elementsMock.setup((x) => x.getRootSubject()).returns(() => rootSubjectMock.object);

    rootSubjectMock.setup((x) => x.id).returns(() => rootSubjectId);
    rootSubjectMock.setup((x) => x.model).returns(() => modelId);

    presentationRulesSubjectMock.setup((x) => x.id).returns(() => presentationRulesSubjectId);
    presentationRulesSubjectMock.setup((x) => x.model).returns(() => modelId);

    definitionPartitionMock.setup((x) => x.id).returns(() => definitionPartitionId);
    definitionPartitionMock.setup((x) => x.model).returns(() => modelId);

    rulesetModelMock.setup((x) => x.id).returns(() => modelId);
  }

  function setupMocksForHandlingPrerequisites() {
    imodelMock.setup((x) => x.containsClass(RulesetElements.Ruleset.classFullName)).returns(() => false);
    imodelMock.setup(async (x) => x.importSchemas(moq.It.isAny(), moq.It.isAny())).returns(async () => undefined);
    codeSpecsMock.setup((x) => x.insert(rulesetCodeSpec)).returns(() => faker.random.uuid());
  }

  function setupMocksForGettingRulesetModel() {
    imodelMock.setup((x) => x.containsClass(RulesetElements.Ruleset.classFullName)).returns(() => true);
    modelsMock.setup((x) => x.getSubModel(definitionPartitionId)).returns(() => rulesetModelMock.object);
    elementsMock.setup((x) => x.tryGetElement(new Code({ spec: subjectCodeSpec.id, scope: rootSubjectMock.object.id, value: "PresentationRules" }))).returns(() => presentationRulesSubjectMock.object);
    elementsMock.setup((x) => x.tryGetElement(DefinitionPartition.createCode(imodelMock.object, presentationRulesSubjectMock.object.id, "PresentationRules"))).returns(() => definitionPartitionMock.object);
  }

  function setupMocksForCreatingRulesetModel() {
    imodelMock.setup((x) => x.containsClass(RulesetElements.Ruleset.classFullName)).returns(() => true);
    elementsMock.setup((x) => x.tryGetElement(new Code({ spec: subjectCodeSpec.id, scope: rootSubjectMock.object.id, value: "PresentationRules" }))).returns(() => undefined);
    elementsMock.setup((x) => x.getElement(presentationRulesSubjectId)).returns(() => presentationRulesSubjectMock.object);
    elementsMock.setup((x) => x.getElement(definitionPartitionId)).returns(() => definitionPartitionMock.object);

    const createSubjectProps = {
      classFullName: Subject.classFullName,
      model: modelId,
      code: new Code({
        spec: subjectCodeSpec.id,
        scope: rootSubjectId,
        value: "PresentationRules",
      }),
      parent: {
        id: rootSubjectId,
        relClassName: "BisCore:SubjectOwnsSubjects",
      },
    };
    elementsMock.setup((x) => x.insertElement(createSubjectProps)).returns(() => presentationRulesSubjectId);

    const createPartitionProps = {
      parent: {
        id: presentationRulesSubjectId,
        relClassName: "BisCore:SubjectOwnsPartitionElements",
      },
      model: modelId,
      code: DefinitionPartition.createCode(imodelMock.object, presentationRulesSubjectId, "PresentationRules"),
      classFullName: DefinitionPartition.classFullName,
    };
    elementsMock.setup((x) => x.insertElement(createPartitionProps)).returns(() => definitionPartitionId);

    const createModelProps = {
      modeledElement: definitionPartitionMock.object,
      name: "PresentationRules",
      classFullName: DefinitionModel.classFullName,
      isPrivate: true,
    };
    modelsMock.setup((x) => x.createModel(createModelProps)).returns(() => rulesetModelMock.object);
  }

  function setupMocksForQueryingExistingRulesets(rulesetId: string, rulesets: Array<{ ruleset: Ruleset, elementId: Id64String }>) {
    async function* asyncIterator(): AsyncIterableIterator<any> {
      for (const entry of rulesets) {
        yield {
          id: entry.elementId,
          jsonProperties: JSON.stringify({ jsonProperties: entry.ruleset }),
          normalizedVersion: normalizeVersion(entry.ruleset.version),
        };
      }
    }
    imodelMock.setup((x) => x.query(moq.It.isAnyString(), { rulesetId })).returns(() => asyncIterator());
  }

  function createRulesetElementProps(ruleset: Ruleset): DefinitionElementProps {
    return {
      model: modelId,
      code: RulesetElements.Ruleset.createRulesetCode(imodelMock.object, modelId, ruleset),
      classFullName: RulesetElements.Ruleset.classFullName,
      jsonProperties: { jsonProperties: ruleset },
    };
  }

  describe("insertRuleset", () => {

    it("sets up prerequisites when inserting element", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x123";

      setupMocksForHandlingPrerequisites();
      setupMocksForCreatingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", []);
      elementsMock.setup((x) => x.insertElement(createRulesetElementProps(ruleset))).returns(() => rulesetElementId);

      await embedder.insertRuleset(ruleset);

      imodelMock.verify(async (x) => x.importSchemas(moq.It.isAny(), moq.It.isAny()), moq.Times.once());
      codeSpecsMock.verify((x) => x.insert(rulesetCodeSpec), moq.Times.once());
      modelsMock.verify((x) => x.insertModel(moq.It.isAny()), moq.Times.once());
      imodelMock.verify((x) => x.saveChanges(), moq.Times.exactly(2));
    });

    it("inserts a single ruleset", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x123";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", []);
      elementsMock.setup((x) => x.insertElement(createRulesetElementProps(ruleset))).returns(() => rulesetElementId);

      const insertId = await embedder.insertRuleset(ruleset);
      expect(insertId).to.eq(rulesetElementId);
    });

    it("skips inserting ruleset with same id", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x123";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [{
        ruleset,
        elementId: rulesetElementId,
      }]);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "same-id" });
      expect(insertId).to.eq(rulesetElementId);
      elementsMock.verify((x) => x.insertElement(createRulesetElementProps(ruleset)), moq.Times.never());
    });

    it("doesn't skip inserting ruleset with different id", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "123";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", []);
      elementsMock.setup((x) => x.insertElement(createRulesetElementProps(ruleset))).returns(() => rulesetElementId);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "same-id" });
      expect(insertId).to.eq(rulesetElementId);
    });

    it("[deprecated] skips inserting ruleset with same id and version", async () => {
      const ruleset: Ruleset = { id: "test", version: "1.2.3", rules: [] };
      const rulesetElementId = "0x123";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [{
        ruleset,
        elementId: rulesetElementId,
      }]);

      const insertId = await embedder.insertRuleset(ruleset, DuplicateRulesetHandlingStrategy.Skip);
      expect(insertId).to.eq(rulesetElementId);
      elementsMock.verify((x) => x.insertElement(createRulesetElementProps(ruleset)), moq.Times.never());
    });

    it("skips inserting ruleset with same id and version", async () => {
      const ruleset: Ruleset = { id: "test", version: "1.2.3", rules: [] };
      const rulesetElementId = "0x123";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [{
        ruleset,
        elementId: rulesetElementId,
      }]);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "same-id-and-version-eq" });
      expect(insertId).to.eq(rulesetElementId);
      elementsMock.verify((x) => x.insertElement(createRulesetElementProps(ruleset)), moq.Times.never());
    });

    it("doesn't skip inserting ruleset with same id and different version", async () => {
      const ruleset: Ruleset = { id: "test", version: "1.2.3", rules: [] };
      const rulesetElementId = "0x123";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [{
        ruleset: { ...ruleset, version: "4.5.6" },
        elementId: "0x456",
      }]);
      elementsMock.setup((x) => x.insertElement(createRulesetElementProps(ruleset))).returns(() => rulesetElementId);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "same-id-and-version-eq" });
      expect(insertId).to.eq(rulesetElementId);
    });

    it("skips inserting ruleset with same id and lower version", async () => {
      const ruleset: Ruleset = { id: "test", version: "1.2.3", rules: [] };

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [{
        ruleset: { id: "test", version: "1.2.3", rules: [] },
        elementId: "0x123",
      }, {
        ruleset: { id: "test", version: "4.5.6", rules: [] },
        elementId: "0x456",
      }, {
        ruleset: { id: "test", version: "7.8.9", rules: [] },
        elementId: "0x789",
      }]);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "same-id-and-version-gte" });
      expect(insertId).to.eq("0x789");
      elementsMock.verify((x) => x.insertElement(createRulesetElementProps(ruleset)), moq.Times.never());
    });

    it("doesn't skip inserting ruleset with same id and higher version", async () => {
      const ruleset: Ruleset = { id: "test", version: "4.5.6", rules: [] };

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [{
        ruleset: { id: "test", version: "1.2.3", rules: [] },
        elementId: "0x123",
      }]);
      elementsMock.setup((x) => x.insertElement(createRulesetElementProps(ruleset))).returns(() => "0x456");

      const insertId = await embedder.insertRuleset(ruleset, { skip: "same-id-and-version-gte" });
      expect(insertId).to.eq("0x456");
    });

    it("[deprecated] updates a duplicate ruleset with same id and version", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x123";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [{
        ruleset,
        elementId: rulesetElementId,
      }]);

      const rulesetElementMock = moq.Mock.ofType<RulesetElements.Ruleset>();
      rulesetElementMock.setup((x) => x.id).returns(() => rulesetElementId);
      elementsMock.setup((x) => x.tryGetElement(rulesetElementId)).returns(() => rulesetElementMock.object);

      const insertId = await embedder.insertRuleset(ruleset, DuplicateRulesetHandlingStrategy.Replace);
      expect(insertId).to.eq(rulesetElementId);
      rulesetElementMock.verify((x) => x.update(), moq.Times.once());
    });

    it("updates a duplicate ruleset with same id and version", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x123";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [{
        ruleset,
        elementId: rulesetElementId,
      }]);

      const rulesetElementMock = moq.Mock.ofType<RulesetElements.Ruleset>();
      rulesetElementMock.setup((x) => x.id).returns(() => rulesetElementId);
      elementsMock.setup((x) => x.tryGetElement(rulesetElementId)).returns(() => rulesetElementMock.object);

      const insertId = await embedder.insertRuleset(ruleset, { skip: "never", replaceVersions: "exact" });
      expect(insertId).to.eq(rulesetElementId);
      rulesetElementMock.verify((x) => x.update(), moq.Times.once());
    });

    it("removes rulesets with same id", async () => {
      const ruleset: Ruleset = { id: "test", rules: [] };
      const rulesetElementId = "0x123";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [{
        ruleset: { ...ruleset, version: "4.5.6" },
        elementId: "0x456",
      }, {
        ruleset: { ...ruleset, version: "7.8.9" },
        elementId: "0x789",
      }]);

      elementsMock.setup((x) => x.insertElement(createRulesetElementProps(ruleset))).returns(() => rulesetElementId);

      const insertId = await embedder.insertRuleset(ruleset, { replaceVersions: "all" });
      expect(insertId).to.eq(rulesetElementId);
      elementsMock.verify((x) => x.deleteElement(["0x456", "0x789"]), moq.Times.once());
    });

    it("removes older rulesets with same id", async () => {
      const ruleset: Ruleset = { id: "test", version: "4.5.6", rules: [] };
      const rulesetElementId = "0x456";

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingExistingRulesets("test", [{
        ruleset: { ...ruleset, version: "1.2.3" },
        elementId: "0x123",
      }, {
        ruleset: { ...ruleset, version: "7.8.9" },
        elementId: "0x789",
      }]);

      elementsMock.setup((x) => x.insertElement(createRulesetElementProps(ruleset))).returns(() => rulesetElementId);

      const insertId = await embedder.insertRuleset(ruleset, { replaceVersions: "all-lower" });
      expect(insertId).to.eq(rulesetElementId);
      elementsMock.verify((x) => x.deleteElement(["0x123"]), moq.Times.once());
    });

  });

  describe("getRulesets", () => {

    function setupMocksForQueryingAllRulesets(rulesets: Array<{ ruleset: Ruleset, elementId: Id64String }>) {
      imodelMock.setup((x) => x.withPreparedStatement(moq.It.isAny(), moq.It.isAny())).callback((_ecsql, callbackFun) => {
        const statementMock = moq.Mock.ofType<ECSqlStatement>();
        rulesets.forEach((entry) => {
          statementMock.setup((x) => x.step()).returns(() => DbResult.BE_SQLITE_ROW);
          statementMock.setup((x) => x.getRow()).returns(() => ({ id: entry.elementId }));

          const rulesetElementMock = moq.Mock.ofType<RulesetElements.Ruleset>();
          rulesetElementMock.setup((x) => x.jsonProperties).returns(() => ({ jsonProperties: entry.ruleset }));
          elementsMock.setup((x) => x.getElement({ id: entry.elementId })).returns(() => rulesetElementMock.object);
        });
        statementMock.setup((x) => x.step()).returns(() => DbResult.BE_SQLITE_DONE);
        callbackFun(statementMock.object);
      }).returns(() => ({}));
    }

    it("checks for prerequisites before getting rulesets", async () => {
      imodelMock.setup((x) => x.containsClass(RulesetElements.Ruleset.classFullName)).returns(() => false);
      const rulesets = await embedder.getRulesets();
      expect(rulesets.length).to.eq(0);
    });

    it("returns embedded rulesets", async () => {
      const ruleset1: Ruleset = { id: "test1", rules: [] };
      const ruleset2: Ruleset = { id: "test2", rules: [] };

      setupMocksForGettingRulesetModel();
      setupMocksForQueryingAllRulesets([{
        ruleset: ruleset1,
        elementId: "0x123",
      }, {
        ruleset: ruleset2,
        elementId: "0x456",
      }]);
      const rulesets = await embedder.getRulesets();
      expect(rulesets).to.deep.eq([ruleset1, ruleset2]);
    });

  });

});
