/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert, expect } from "chai";
import * as path from "path";
import * as sinon from "sinon";
import { DbResult, Id64, Id64String, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { Point3d, Range3d, StandardViewIndex, Transform, YawPitchRollAngles } from "@bentley/geometry-core";
import {
  AxisAlignedBox3d, Code, CodeSpec, CodeScopeSpec, ColorDef, CreateIModelProps, DefinitionElementProps, ExternalSourceAspectProps, IModel, IModelError, PhysicalElementProps, Placement3d,
} from "@bentley/imodeljs-common";
import {
  BackendLoggerCategory, BackendRequestContext, CategorySelector, DisplayStyle3d, DocumentListModel, Drawing, DrawingCategory, DrawingGraphic, DrawingModel, ECSqlStatement, Element, ElementMultiAspect,
  ElementOwnsExternalSourceAspects, ElementRefersToElements, ElementUniqueAspect, ExternalSourceAspect, GenericPhysicalMaterial, IModelCloneContext, IModelDb, IModelExporter,
  IModelExportHandler, IModelJsFs, IModelSchemaLoader, IModelTransformer, InformationRecordModel, InformationRecordPartition, LinkElement, Model, ModelSelector,
  OrthographicViewDefinition, PhysicalModel, PhysicalObject, PhysicalPartition, PhysicalType, Relationship, RepositoryLink, SnapshotDb,
  SpatialCategory, Subject,
} from "../../imodeljs-backend";
import { IModelTestUtils } from "../IModelTestUtils";
import {
  ClassCounter, FilterByViewTransformer, IModelToTextFileExporter, IModelTransformer3d, IModelTransformerUtils, PhysicalModelConsolidator,
  RecordingIModelImporter, TestIModelTransformer,
} from "../IModelTransformerUtils";
import { KnownTestLocations } from "../KnownTestLocations";

describe("IModelTransformer", () => {
  const outputDir: string = path.join(KnownTestLocations.outputDir, "IModelTransformer");

  before(async () => {
    if (!IModelJsFs.existsSync(KnownTestLocations.outputDir)) {
      IModelJsFs.mkdirSync(KnownTestLocations.outputDir);
    }
    if (!IModelJsFs.existsSync(outputDir)) {
      IModelJsFs.mkdirSync(outputDir);
    }
    // initialize logging
    if (false) {
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(BackendLoggerCategory.IModelExporter, LogLevel.Trace);
      Logger.setLevel(BackendLoggerCategory.IModelImporter, LogLevel.Trace);
      Logger.setLevel(BackendLoggerCategory.IModelTransformer, LogLevel.Trace);
    }
  });

  it("should transform changes from source to target", async () => {
    // Source IModelDb
    const sourceDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "TestIModelTransformer-Source.bim");
    const sourceDb = SnapshotDb.createEmpty(sourceDbFile, { rootSubject: { name: "TestIModelTransformer-Source" } });
    await IModelTransformerUtils.prepareSourceDb(sourceDb);
    IModelTransformerUtils.populateSourceDb(sourceDb);
    sourceDb.saveChanges();
    // Target IModelDb
    const targetDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "TestIModelTransformer-Target.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFile, { rootSubject: { name: "TestIModelTransformer-Target" } });
    await IModelTransformerUtils.prepareTargetDb(targetDb);
    targetDb.saveChanges();

    const numSourceUniqueAspects: number = count(sourceDb, ElementUniqueAspect.classFullName);
    const numSourceMultiAspects: number = count(sourceDb, ElementMultiAspect.classFullName);
    const numSourceRelationships: number = count(sourceDb, ElementRefersToElements.classFullName);
    assert.isAtLeast(numSourceUniqueAspects, 1);
    assert.isAtLeast(numSourceMultiAspects, 1);
    assert.isAtLeast(numSourceRelationships, 1);

    if (true) { // initial import
      Logger.logInfo(BackendLoggerCategory.IModelTransformer, "==============");
      Logger.logInfo(BackendLoggerCategory.IModelTransformer, "Initial Import");
      Logger.logInfo(BackendLoggerCategory.IModelTransformer, "==============");
      const targetImporter = new RecordingIModelImporter(targetDb);
      const transformer = new TestIModelTransformer(sourceDb, targetImporter);
      assert.isTrue(transformer.context.isBetweenIModels);
      await transformer.processAll();
      assert.isAtLeast(targetImporter.numModelsInserted, 1);
      assert.equal(targetImporter.numModelsUpdated, 0);
      assert.isAtLeast(targetImporter.numElementsInserted, 1);
      assert.isAtLeast(targetImporter.numElementsUpdated, 1);
      assert.equal(targetImporter.numElementsDeleted, 0);
      assert.isAtLeast(targetImporter.numElementAspectsInserted, 1);
      assert.equal(targetImporter.numElementAspectsUpdated, 0);
      assert.isAtLeast(targetImporter.numRelationshipsInserted, 1);
      assert.equal(targetImporter.numRelationshipsUpdated, 0);
      assert.isAtLeast(count(targetDb, ElementRefersToElements.classFullName), 1);
      assert.isAtLeast(count(targetDb, InformationRecordPartition.classFullName), 1);
      assert.isAtLeast(count(targetDb, InformationRecordModel.classFullName), 1);
      assert.isAtLeast(count(targetDb, "TestTransformerTarget:PhysicalPartitionIsTrackedByRecords"), 1);
      assert.isAtLeast(count(targetDb, "TestTransformerTarget:AuditRecord"), 1);
      assert.equal(3, count(targetDb, "TestTransformerTarget:TargetInformationRecord"));
      targetDb.saveChanges();
      IModelTransformerUtils.assertTargetDbContents(sourceDb, targetDb);
      transformer.context.dump(`${targetDbFile}.context.txt`);
      transformer.dispose();
    }

    const numTargetElements: number = count(targetDb, Element.classFullName);
    const numTargetUniqueAspects: number = count(targetDb, ElementUniqueAspect.classFullName);
    const numTargetMultiAspects: number = count(targetDb, ElementMultiAspect.classFullName);
    const numTargetExternalSourceAspects: number = count(targetDb, ExternalSourceAspect.classFullName);
    const numTargetRelationships: number = count(targetDb, ElementRefersToElements.classFullName);
    assert.isAtLeast(numTargetUniqueAspects, 1);
    assert.isAtLeast(numTargetMultiAspects, 1);
    assert.isAtLeast(numTargetRelationships, 1);

    if (true) { // tests of IModelExporter
      // test #1 - export structure
      const exportFileName: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "TestIModelTransformer-Source-Export.txt");
      assert.isFalse(IModelJsFs.existsSync(exportFileName));
      const exporter = new IModelToTextFileExporter(sourceDb, exportFileName);
      await exporter.export();
      assert.isTrue(IModelJsFs.existsSync(exportFileName));

      // test #2 - count occurrences of classFullNames
      const classCountsFileName: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "TestIModelTransformer-Source-Counts.txt");
      assert.isFalse(IModelJsFs.existsSync(classCountsFileName));
      const classCounter = new ClassCounter(sourceDb, classCountsFileName);
      await classCounter.count();
      assert.isTrue(IModelJsFs.existsSync(classCountsFileName));
    }

    if (true) { // second import with no changes to source, should be a no-op
      Logger.logInfo(BackendLoggerCategory.IModelTransformer, "");
      Logger.logInfo(BackendLoggerCategory.IModelTransformer, "=================");
      Logger.logInfo(BackendLoggerCategory.IModelTransformer, "Reimport (no-op)");
      Logger.logInfo(BackendLoggerCategory.IModelTransformer, "=================");
      const targetImporter = new RecordingIModelImporter(targetDb);
      const transformer = new TestIModelTransformer(sourceDb, targetImporter);
      await transformer.processAll();
      assert.equal(targetImporter.numModelsInserted, 0);
      assert.equal(targetImporter.numModelsUpdated, 0);
      assert.equal(targetImporter.numElementsInserted, 0);
      assert.equal(targetImporter.numElementsUpdated, 0);
      assert.equal(targetImporter.numElementsDeleted, 0);
      assert.equal(targetImporter.numElementAspectsInserted, 0);
      assert.equal(targetImporter.numElementAspectsUpdated, 0);
      assert.equal(targetImporter.numRelationshipsInserted, 0);
      assert.equal(targetImporter.numRelationshipsUpdated, 0);
      assert.equal(targetImporter.numRelationshipsDeleted, 0);
      assert.equal(numTargetElements, count(targetDb, Element.classFullName), "Second import should not add elements");
      assert.equal(numTargetExternalSourceAspects, count(targetDb, ExternalSourceAspect.classFullName), "Second import should not add aspects");
      assert.equal(numTargetRelationships, count(targetDb, ElementRefersToElements.classFullName), "Second import should not add relationships");
      assert.equal(3, count(targetDb, "TestTransformerTarget:TargetInformationRecord"));
      transformer.dispose();
    }

    if (true) { // update source db, then import again
      IModelTransformerUtils.updateSourceDb(sourceDb);
      sourceDb.saveChanges();
      Logger.logInfo(BackendLoggerCategory.IModelTransformer, "");
      Logger.logInfo(BackendLoggerCategory.IModelTransformer, "===============================");
      Logger.logInfo(BackendLoggerCategory.IModelTransformer, "Reimport after sourceDb update");
      Logger.logInfo(BackendLoggerCategory.IModelTransformer, "===============================");
      const targetImporter = new RecordingIModelImporter(targetDb);
      const transformer = new TestIModelTransformer(sourceDb, targetImporter);
      await transformer.processAll();
      assert.equal(targetImporter.numModelsInserted, 0);
      assert.equal(targetImporter.numModelsUpdated, 0);
      assert.equal(targetImporter.numElementsInserted, 1);
      assert.equal(targetImporter.numElementsUpdated, 5);
      assert.equal(targetImporter.numElementsDeleted, 2);
      assert.equal(targetImporter.numElementAspectsInserted, 0);
      assert.equal(targetImporter.numElementAspectsUpdated, 2);
      assert.equal(targetImporter.numRelationshipsInserted, 2);
      assert.equal(targetImporter.numRelationshipsUpdated, 1);
      assert.equal(targetImporter.numRelationshipsDeleted, 1);
      targetDb.saveChanges();
      IModelTransformerUtils.assertUpdatesInDb(targetDb);
      assert.equal(numTargetRelationships + targetImporter.numRelationshipsInserted - targetImporter.numRelationshipsDeleted, count(targetDb, ElementRefersToElements.classFullName));
      assert.equal(2, count(targetDb, "TestTransformerTarget:TargetInformationRecord"));
      transformer.dispose();
    }

    IModelTransformerUtils.dumpIModelInfo(sourceDb);
    IModelTransformerUtils.dumpIModelInfo(targetDb);
    sourceDb.close();
    targetDb.close();
  });

  it("should synchronize changes from master to branch and back", async () => {
    // Simulate branching workflow by initializing branchDb to be a copy of the populated masterDb
    const masterDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "Master.bim");
    const masterDb = SnapshotDb.createEmpty(masterDbFile, { rootSubject: { name: "Branching Workflow" }, createClassViews: true });
    await IModelTransformerUtils.prepareSourceDb(masterDb);
    IModelTransformerUtils.populateSourceDb(masterDb);
    masterDb.saveChanges();
    const branchDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "Branch.bim");
    const branchDb = SnapshotDb.createFrom(masterDb, branchDbFile, { createClassViews: true });

    const numMasterElements = count(masterDb, Element.classFullName);
    const numMasterRelationships = count(masterDb, ElementRefersToElements.classFullName);
    assert.isAtLeast(numMasterElements, 12);
    assert.isAtLeast(numMasterRelationships, 1);
    assert.equal(numMasterElements, count(branchDb, Element.classFullName));
    assert.equal(numMasterRelationships, count(branchDb, ElementRefersToElements.classFullName));
    assert.equal(0, count(branchDb, ExternalSourceAspect.classFullName));

    // Ensure that master to branch synchronization did not add any new Elements or Relationships, but did add ExternalSourceAspects
    const masterToBranchTransformer = new IModelTransformer(masterDb, branchDb, { wasSourceIModelCopiedToTarget: true }); // Note use of `wasSourceIModelCopiedToTarget` flag
    await masterToBranchTransformer.processAll();
    masterToBranchTransformer.dispose();
    branchDb.saveChanges();
    assert.equal(numMasterElements, count(branchDb, Element.classFullName));
    assert.equal(numMasterRelationships, count(branchDb, ElementRefersToElements.classFullName));
    assert.isAtLeast(count(branchDb, ExternalSourceAspect.classFullName), numMasterElements + numMasterRelationships - 1); // provenance not recorded for the root Subject

    // Confirm that provenance (captured in ExternalSourceAspects) was set correctly
    const sql = `SELECT aspect.Identifier,aspect.Element.Id FROM ${ExternalSourceAspect.classFullName} aspect WHERE aspect.Kind=:kind`;
    branchDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      statement.bindString("kind", ExternalSourceAspect.Kind.Element);
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const masterElementId = statement.getValue(0).getString(); // ExternalSourceAspect.Identifier is of type string
        const branchElementId = statement.getValue(1).getId();
        assert.equal(masterElementId, branchElementId);
      }
    });

    // Make changes to simulate working on the branch
    IModelTransformerUtils.updateSourceDb(branchDb);
    IModelTransformerUtils.assertUpdatesInDb(branchDb);
    branchDb.saveChanges();

    const numBranchElements = count(branchDb, Element.classFullName);
    const numBranchRelationships = count(branchDb, ElementRefersToElements.classFullName);
    assert.notEqual(numBranchElements, numMasterElements);
    assert.notEqual(numBranchRelationships, numMasterRelationships);

    // Synchronize changes from branch back to master
    const branchToMasterTransformer = new IModelTransformer(branchDb, masterDb, { isReverseSynchronization: true, noProvenance: true });
    await branchToMasterTransformer.processAll();
    branchToMasterTransformer.dispose();
    masterDb.saveChanges();
    IModelTransformerUtils.assertUpdatesInDb(masterDb, false);
    assert.equal(numBranchElements, count(masterDb, Element.classFullName) - 2); // processAll cannot detect deletes when isReverseSynchronization=true
    assert.equal(numBranchRelationships, count(masterDb, ElementRefersToElements.classFullName) - 1); // processAll cannot detect deletes when isReverseSynchronization=true
    assert.equal(0, count(masterDb, ExternalSourceAspect.classFullName));

    masterDb.close();
    branchDb.close();
  });

  function count(iModelDb: IModelDb, classFullName: string): number {
    return iModelDb.withPreparedStatement(`SELECT COUNT(*) FROM ${classFullName}`, (statement: ECSqlStatement): number => {
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getInteger() : 0;
    });
  }

  it("should import everything below a Subject", async () => {
    // Source IModelDb
    const sourceDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "SourceImportSubject.bim");
    const sourceDb = SnapshotDb.createEmpty(sourceDbFile, { rootSubject: { name: "SourceImportSubject" } });
    await IModelTransformerUtils.prepareSourceDb(sourceDb);
    IModelTransformerUtils.populateSourceDb(sourceDb);
    const sourceSubjectId = sourceDb.elements.queryElementIdByCode(Subject.createCode(sourceDb, IModel.rootSubjectId, "Subject"))!;
    assert.isTrue(Id64.isValidId64(sourceSubjectId));
    sourceDb.saveChanges();
    // Target IModelDb
    const targetDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "TargetImportSubject.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFile, { rootSubject: { name: "TargetImportSubject" } });
    await IModelTransformerUtils.prepareTargetDb(targetDb);
    const targetSubjectId = Subject.insert(targetDb, IModel.rootSubjectId, "Target Subject", "Target Subject Description");
    assert.isTrue(Id64.isValidId64(targetSubjectId));
    targetDb.saveChanges();
    // Import from beneath source Subject into target Subject
    const transformer = new TestIModelTransformer(sourceDb, targetDb);
    await transformer.processFonts();
    await transformer.processSubject(sourceSubjectId, targetSubjectId);
    await transformer.processRelationships(ElementRefersToElements.classFullName);
    transformer.dispose();
    targetDb.saveChanges();
    IModelTransformerUtils.assertTargetDbContents(sourceDb, targetDb, "Target Subject");
    const targetSubject: Subject = targetDb.elements.getElement<Subject>(targetSubjectId);
    assert.equal(targetSubject.description, "Target Subject Description");
    // Close
    sourceDb.close();
    targetDb.close();
  });

  it.skip("should clone Model within same iModel", async () => {
    // Set up the IModelDb with a populated source Subject and an "empty" target Subject
    const iModelFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "CloneModel.bim");
    const iModelDb = SnapshotDb.createEmpty(iModelFile, { rootSubject: { name: "CloneModel" } });
    await IModelTransformerUtils.prepareSourceDb(iModelDb);
    IModelTransformerUtils.populateSourceDb(iModelDb);
    const sourceSubjectId = iModelDb.elements.queryElementIdByCode(Subject.createCode(iModelDb, IModel.rootSubjectId, "Subject"))!;
    assert.isTrue(Id64.isValidId64(sourceSubjectId));
    const targetSubjectId = Subject.insert(iModelDb, IModel.rootSubjectId, "Target Subject");
    assert.isTrue(Id64.isValidId64(targetSubjectId));
    iModelDb.saveChanges();
    // Import from beneath source Subject into target Subject
    const transformer = new IModelTransformer(iModelDb, iModelDb);
    await transformer.processSubject(sourceSubjectId, targetSubjectId);
    transformer.dispose();
    iModelDb.saveChanges();
    iModelDb.close();
  });

  /** @note For debugging/testing purposes, you can use `it.only` and hard-code `sourceFileName` to test cloning of a particular iModel. */
  it("should clone test file", async () => {
    // open source iModel
    const sourceFileName = IModelTestUtils.resolveAssetFile("CompatibilityTestSeed.bim");
    const sourceDb = SnapshotDb.openFile(sourceFileName);
    const numSourceElements: number = count(sourceDb, Element.classFullName);
    assert.exists(sourceDb);
    assert.isAtLeast(numSourceElements, 12);
    // create target iModel
    const targetDbFile: string = path.join(KnownTestLocations.outputDir, "IModelTransformer", "Clone-Target.bim");
    if (IModelJsFs.existsSync(targetDbFile)) {
      IModelJsFs.removeSync(targetDbFile);
    }
    const targetDbProps: CreateIModelProps = {
      rootSubject: { name: `Cloned target of ${sourceDb.elements.getRootSubject().code.value}` },
      ecefLocation: sourceDb.ecefLocation,
    };
    const targetDb = SnapshotDb.createEmpty(targetDbFile, targetDbProps);
    assert.exists(targetDb);
    // import
    const transformer = new IModelTransformer(sourceDb, targetDb);
    await transformer.processSchemas(new BackendRequestContext());
    await transformer.processAll();
    transformer.dispose();
    const numTargetElements: number = count(targetDb, Element.classFullName);
    assert.isAtLeast(numTargetElements, numSourceElements);
    assert.deepEqual(sourceDb.ecefLocation, targetDb.ecefLocation);
    // clean up
    sourceDb.close();
    targetDb.close();
  });

  it("should include source provenance", async () => {
    // create source iModel
    const sourceDbFile = IModelTestUtils.prepareOutputFile("IModelTransformer", "SourceProvenance.bim");
    const sourceDb = SnapshotDb.createEmpty(sourceDbFile, { rootSubject: { name: "Source Provenance Test" } });
    const sourceRepositoryId = IModelTransformerUtils.insertRepositoryLink(sourceDb, "master.dgn", "https://test.bentley.com/folder/master.dgn", "DGN");
    const sourceExternalSourceId = IModelTransformerUtils.insertExternalSource(sourceDb, sourceRepositoryId, "Default Model");
    const sourceCategoryId = SpatialCategory.insert(sourceDb, IModel.dictionaryId, "SpatialCategory", { color: ColorDef.green.toJSON() });
    const sourceModelId = PhysicalModel.insert(sourceDb, IModel.rootSubjectId, "Physical");
    for (const x of [1, 2, 3]) {
      const physicalObjectProps: PhysicalElementProps = {
        classFullName: PhysicalObject.classFullName,
        model: sourceModelId,
        category: sourceCategoryId,
        code: Code.createEmpty(),
        userLabel: `PhysicalObject(${x})`,
        geom: IModelTransformerUtils.createBox(Point3d.create(1, 1, 1)),
        placement: Placement3d.fromJSON({ origin: { x }, angles: {} }),
      };
      const physicalObjectId = sourceDb.elements.insertElement(physicalObjectProps);
      const aspectProps: ExternalSourceAspectProps = { // simulate provenance from a Connector
        classFullName: ExternalSourceAspect.classFullName,
        element: { id: physicalObjectId, relClassName: ElementOwnsExternalSourceAspects.classFullName },
        scope: { id: sourceExternalSourceId },
        source: { id: sourceExternalSourceId },
        identifier: `ID${x}`,
        kind: ExternalSourceAspect.Kind.Element,
      };
      sourceDb.elements.insertAspect(aspectProps);
    }
    sourceDb.saveChanges();

    // create target iModel
    const targetDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "SourceProvenance-Target.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFile, { rootSubject: { name: "Source Provenance Test (Target)" } });

    // clone
    const transformer = new IModelTransformer(sourceDb, targetDb, { includeSourceProvenance: true });
    await transformer.processAll();
    targetDb.saveChanges();

    // verify target contents
    assert.equal(1, count(sourceDb, RepositoryLink.classFullName));
    const targetRepositoryId = targetDb.elements.queryElementIdByCode(LinkElement.createCode(targetDb, IModel.repositoryModelId, "master.dgn"))!;
    assert.isTrue(Id64.isValidId64(targetRepositoryId));
    const targetExternalSourceId = IModelTransformerUtils.queryByUserLabel(targetDb, "Default Model");
    assert.isTrue(Id64.isValidId64(targetExternalSourceId));
    const targetCategoryId = targetDb.elements.queryElementIdByCode(SpatialCategory.createCode(targetDb, IModel.dictionaryId, "SpatialCategory"))!;
    assert.isTrue(Id64.isValidId64(targetCategoryId));
    const targetPhysicalObjectIds = [
      IModelTransformerUtils.queryByUserLabel(targetDb, "PhysicalObject(1)"),
      IModelTransformerUtils.queryByUserLabel(targetDb, "PhysicalObject(2)"),
      IModelTransformerUtils.queryByUserLabel(targetDb, "PhysicalObject(3)"),
    ];
    for (const targetPhysicalObjectId of targetPhysicalObjectIds) {
      assert.isTrue(Id64.isValidId64(targetPhysicalObjectId));
      const physicalObject = targetDb.elements.getElement<PhysicalObject>(targetPhysicalObjectId, PhysicalObject);
      assert.equal(physicalObject.category, targetCategoryId);
      const aspects = targetDb.elements.getAspects(targetPhysicalObjectId, ExternalSourceAspect.classFullName);
      assert.equal(2, aspects.length, "Expect original source provenance + provenance generated by IModelTransformer");
      for (const aspect of aspects) {
        const externalSourceAspect = aspect as ExternalSourceAspect;
        if (externalSourceAspect.scope.id === transformer.targetScopeElementId) {
          // provenance added by IModelTransformer
          assert.equal(externalSourceAspect.kind, ExternalSourceAspect.Kind.Element);
        } else {
          // provenance carried over from the source iModel
          assert.equal(externalSourceAspect.scope.id, targetExternalSourceId);
          assert.equal(externalSourceAspect.source!.id, targetExternalSourceId);
          assert.isTrue(externalSourceAspect.identifier.startsWith("ID"));
          assert.isTrue(physicalObject.userLabel!.includes(externalSourceAspect.identifier[2]));
          assert.equal(externalSourceAspect.kind, ExternalSourceAspect.Kind.Element);
        }
      }
    }

    // clean up
    transformer.dispose();
    sourceDb.close();
    targetDb.close();
  });

  it("should transform 3d elements in target iModel", async () => {
    // create source iModel
    const sourceDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "Transform3d-Source.bim");
    const sourceDb = SnapshotDb.createEmpty(sourceDbFile, { rootSubject: { name: "Transform3d-Source" } });
    const categoryId: Id64String = SpatialCategory.insert(sourceDb, IModel.dictionaryId, "SpatialCategory", { color: ColorDef.green.toJSON() });
    const sourceModelId: Id64String = PhysicalModel.insert(sourceDb, IModel.rootSubjectId, "Physical");
    const xArray: number[] = [1, 3, 5, 7, 9];
    const yArray: number[] = [0, 2, 4, 6, 8];
    for (const x of xArray) {
      for (const y of yArray) {
        const physicalObjectProps1: PhysicalElementProps = {
          classFullName: PhysicalObject.classFullName,
          model: sourceModelId,
          category: categoryId,
          code: Code.createEmpty(),
          userLabel: `PhysicalObject(${x},${y})`,
          geom: IModelTransformerUtils.createBox(Point3d.create(1, 1, 1)),
          placement: Placement3d.fromJSON({ origin: { x, y }, angles: {} }),
        };
        sourceDb.elements.insertElement(physicalObjectProps1);
      }
    }
    const sourceModel: PhysicalModel = sourceDb.models.getModel<PhysicalModel>(sourceModelId);
    const sourceModelExtents: AxisAlignedBox3d = sourceModel.queryExtents();
    assert.deepEqual(sourceModelExtents, new Range3d(1, 0, 0, 10, 9, 1));
    // create target iModel
    const targetDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "Transform3d-Target.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFile, { rootSubject: { name: "Transform3d-Target" } });
    // transform
    const transform3d: Transform = Transform.createTranslation(new Point3d(100, 200));
    const transformer = new IModelTransformer3d(sourceDb, targetDb, transform3d);
    await transformer.processAll();
    const targetModelId: Id64String = transformer.context.findTargetElementId(sourceModelId);
    const targetModel: PhysicalModel = targetDb.models.getModel<PhysicalModel>(targetModelId);
    const targetModelExtents: AxisAlignedBox3d = targetModel.queryExtents();
    assert.deepEqual(targetModelExtents, new Range3d(101, 200, 0, 110, 209, 1));
    assert.deepEqual(targetModelExtents, transform3d.multiplyRange(sourceModelExtents));
    // clean up
    transformer.dispose();
    sourceDb.close();
    targetDb.close();
  });

  it("should combine models", async () => {
    const sourceDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "source-separate-models.bim");
    const sourceDb = SnapshotDb.createEmpty(sourceDbFile, { rootSubject: { name: "Separate Models" } });
    const sourceCategoryId = SpatialCategory.insert(sourceDb, IModel.dictionaryId, "Category", {});
    const sourceModelId1 = PhysicalModel.insert(sourceDb, IModel.rootSubjectId, "M1");
    const sourceModelId2 = PhysicalModel.insert(sourceDb, IModel.rootSubjectId, "M2");
    const elementProps11: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: sourceModelId1,
      code: Code.createEmpty(),
      userLabel: "PhysicalObject-M1-E1",
      category: sourceCategoryId,
      geom: IModelTransformerUtils.createBox(new Point3d(1, 1, 1)),
      placement: Placement3d.fromJSON({ origin: { x: 1, y: 1 }, angles: {} }),
    };
    const sourceElementId11 = sourceDb.elements.insertElement(elementProps11);
    const elementProps21: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: sourceModelId2,
      code: Code.createEmpty(),
      userLabel: "PhysicalObject-M2-E1",
      category: sourceCategoryId,
      geom: IModelTransformerUtils.createBox(new Point3d(2, 2, 2)),
      placement: Placement3d.fromJSON({ origin: { x: 2, y: 2 }, angles: {} }),
    };
    const sourceElementId21 = sourceDb.elements.insertElement(elementProps21);
    sourceDb.saveChanges();
    assert.equal(count(sourceDb, PhysicalPartition.classFullName), 2);
    assert.equal(count(sourceDb, PhysicalModel.classFullName), 2);
    assert.equal(count(sourceDb, PhysicalObject.classFullName), 2);

    const targetDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "target-combined-model.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFile, { rootSubject: { name: "Combined Model" } });
    const targetModelId = PhysicalModel.insert(targetDb, IModel.rootSubjectId, "PhysicalModel-Combined");

    const transformer = new PhysicalModelConsolidator(sourceDb, targetDb, targetModelId);
    await transformer.processAll();
    targetDb.saveChanges();

    const targetElement11 = targetDb.elements.getElement(transformer.context.findTargetElementId(sourceElementId11));
    assert.equal(targetElement11.userLabel, "PhysicalObject-M1-E1");
    assert.equal(targetElement11.model, targetModelId);
    const targetElement21 = targetDb.elements.getElement(transformer.context.findTargetElementId(sourceElementId21));
    assert.equal(targetElement21.userLabel, "PhysicalObject-M2-E1");
    assert.equal(targetElement21.model, targetModelId);
    const targetPartition = targetDb.elements.getElement(targetModelId);
    assert.equal(targetPartition.code.value, "PhysicalModel-Combined", "Original CodeValue should be retained");
    assert.equal(count(targetDb, PhysicalPartition.classFullName), 1);
    assert.equal(count(targetDb, PhysicalModel.classFullName), 1);
    assert.equal(count(targetDb, PhysicalObject.classFullName), 2);

    transformer.dispose();
    sourceDb.close();
    targetDb.close();
  });

  it("should consolidate PhysicalModels", async () => {
    const sourceDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "MultiplePhysicalModels.bim");
    const sourceDb = SnapshotDb.createEmpty(sourceDbFile, { rootSubject: { name: "Multiple PhysicalModels" } });
    const categoryId: Id64String = SpatialCategory.insert(sourceDb, IModel.dictionaryId, "SpatialCategory", { color: ColorDef.green.toJSON() });
    for (let i = 0; i < 5; i++) {
      const sourceModelId: Id64String = PhysicalModel.insert(sourceDb, IModel.rootSubjectId, `PhysicalModel${i}`);
      const xArray: number[] = [20 * i + 1, 20 * i + 3, 20 * i + 5, 20 * i + 7, 20 * i + 9];
      const yArray: number[] = [0, 2, 4, 6, 8];
      for (const x of xArray) {
        for (const y of yArray) {
          const physicalObjectProps1: PhysicalElementProps = {
            classFullName: PhysicalObject.classFullName,
            model: sourceModelId,
            category: categoryId,
            code: Code.createEmpty(),
            userLabel: `M${i}-PhysicalObject(${x},${y})`,
            geom: IModelTransformerUtils.createBox(Point3d.create(1, 1, 1)),
            placement: Placement3d.fromJSON({ origin: { x, y }, angles: {} }),
          };
          sourceDb.elements.insertElement(physicalObjectProps1);
        }
      }
    }
    sourceDb.saveChanges();
    assert.equal(5, count(sourceDb, PhysicalModel.classFullName));
    assert.equal(125, count(sourceDb, PhysicalObject.classFullName));

    const targetDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "OnePhysicalModel.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFile, { rootSubject: { name: "One PhysicalModel" }, createClassViews: true });
    const targetModelId: Id64String = PhysicalModel.insert(targetDb, IModel.rootSubjectId, "PhysicalModel");
    assert.isTrue(Id64.isValidId64(targetModelId));
    targetDb.saveChanges();
    const consolidator = new PhysicalModelConsolidator(sourceDb, targetDb, targetModelId);
    await consolidator.processAll();
    consolidator.dispose();
    assert.equal(1, count(targetDb, PhysicalModel.classFullName));
    const targetPartition = targetDb.elements.getElement<PhysicalPartition>(targetModelId);
    assert.equal(targetPartition.code.value, "PhysicalModel", "Target PhysicalModel name should not be overwritten during consolidation");
    assert.equal(125, count(targetDb, PhysicalObject.classFullName));
    const aspects = targetDb.elements.getAspects(targetPartition.id, ExternalSourceAspect.classFullName);
    assert.isAtLeast(aspects.length, 5, "Provenance should be recorded for each source PhysicalModel");

    const sql = `SELECT ECInstanceId FROM ${PhysicalObject.classFullName}`;
    targetDb.withPreparedStatement(sql, (statement: ECSqlStatement) => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const targetElementId = statement.getValue(0).getId();
        const targetElement = targetDb.elements.getElement<PhysicalObject>({ id: targetElementId, wantGeometry: true });
        assert.exists(targetElement.geom);
        assert.isFalse(targetElement.calculateRange3d().isNull);
      }
    });

    sourceDb.close();
    targetDb.close();
  });

  it("should sync Team iModels into Shared", async () => {
    const iModelShared: SnapshotDb = IModelTransformerUtils.createSharedIModel(outputDir, ["A", "B"]);

    if (true) {
      const iModelA: SnapshotDb = IModelTransformerUtils.createTeamIModel(outputDir, "A", Point3d.create(0, 0, 0), ColorDef.green);
      IModelTransformerUtils.assertTeamIModelContents(iModelA, "A");
      const iModelExporterA = new IModelExporter(iModelA);
      iModelExporterA.excludeElement(iModelA.elements.queryElementIdByCode(Subject.createCode(iModelA, IModel.rootSubjectId, "Context"))!);
      const subjectId: Id64String = IModelTransformerUtils.querySubjectId(iModelShared, "A");
      const transformerA2S = new IModelTransformer(iModelExporterA, iModelShared, { targetScopeElementId: subjectId });
      transformerA2S.context.remapElement(IModel.rootSubjectId, subjectId);
      await transformerA2S.processAll();
      transformerA2S.dispose();
      IModelTransformerUtils.dumpIModelInfo(iModelA);
      iModelA.close();
      iModelShared.saveChanges("Imported A");
      IModelTransformerUtils.assertSharedIModelContents(iModelShared, ["A"]);
    }

    if (true) {
      const iModelB: SnapshotDb = IModelTransformerUtils.createTeamIModel(outputDir, "B", Point3d.create(0, 10, 0), ColorDef.blue);
      IModelTransformerUtils.assertTeamIModelContents(iModelB, "B");
      const iModelExporterB = new IModelExporter(iModelB);
      iModelExporterB.excludeElement(iModelB.elements.queryElementIdByCode(Subject.createCode(iModelB, IModel.rootSubjectId, "Context"))!);
      const subjectId: Id64String = IModelTransformerUtils.querySubjectId(iModelShared, "B");
      const transformerB2S = new IModelTransformer(iModelExporterB, iModelShared, { targetScopeElementId: subjectId });
      transformerB2S.context.remapElement(IModel.rootSubjectId, subjectId);
      await transformerB2S.processAll();
      transformerB2S.dispose();
      IModelTransformerUtils.dumpIModelInfo(iModelB);
      iModelB.close();
      iModelShared.saveChanges("Imported B");
      IModelTransformerUtils.assertSharedIModelContents(iModelShared, ["A", "B"]);
    }

    if (true) {
      const iModelConsolidated: SnapshotDb = IModelTransformerUtils.createConsolidatedIModel(outputDir, "Consolidated");
      const transformerS2C = new IModelTransformer(iModelShared, iModelConsolidated);
      const subjectA: Id64String = IModelTransformerUtils.querySubjectId(iModelShared, "A");
      const subjectB: Id64String = IModelTransformerUtils.querySubjectId(iModelShared, "B");
      const definitionA: Id64String = IModelTransformerUtils.queryDefinitionPartitionId(iModelShared, subjectA, "A");
      const definitionB: Id64String = IModelTransformerUtils.queryDefinitionPartitionId(iModelShared, subjectB, "B");
      const definitionC: Id64String = IModelTransformerUtils.queryDefinitionPartitionId(iModelConsolidated, IModel.rootSubjectId, "Consolidated");
      transformerS2C.context.remapElement(definitionA, definitionC);
      transformerS2C.context.remapElement(definitionB, definitionC);
      const physicalA: Id64String = IModelTransformerUtils.queryPhysicalPartitionId(iModelShared, subjectA, "A");
      const physicalB: Id64String = IModelTransformerUtils.queryPhysicalPartitionId(iModelShared, subjectB, "B");
      const physicalC: Id64String = IModelTransformerUtils.queryPhysicalPartitionId(iModelConsolidated, IModel.rootSubjectId, "Consolidated");
      transformerS2C.context.remapElement(physicalA, physicalC);
      transformerS2C.context.remapElement(physicalB, physicalC);
      await transformerS2C.processModel(definitionA);
      await transformerS2C.processModel(definitionB);
      await transformerS2C.processModel(physicalA);
      await transformerS2C.processModel(physicalB);
      await transformerS2C.processDeferredElements();
      await transformerS2C.processRelationships(ElementRefersToElements.classFullName);
      transformerS2C.dispose();
      IModelTransformerUtils.assertConsolidatedIModelContents(iModelConsolidated, "Consolidated");
      IModelTransformerUtils.dumpIModelInfo(iModelConsolidated);
      iModelConsolidated.close();
    }

    IModelTransformerUtils.dumpIModelInfo(iModelShared);
    iModelShared.close();
  });

  it("should detect conflicting provenance scopes", async () => {
    const sourceDb1 = IModelTransformerUtils.createTeamIModel(outputDir, "S1", Point3d.create(0, 0, 0), ColorDef.green);
    const sourceDb2 = IModelTransformerUtils.createTeamIModel(outputDir, "S2", Point3d.create(0, 10, 0), ColorDef.blue);
    assert.notEqual(sourceDb1.iModelId, sourceDb2.iModelId); // iModelId must be different to detect provenance scope conflicts

    const targetDbFile = IModelTestUtils.prepareOutputFile("IModelTransformer", "ConflictingScopes.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFile, { rootSubject: { name: "Conflicting Scopes Test" } });

    const transformer1 = new IModelTransformer(sourceDb1, targetDb); // did not set targetScopeElementId
    const transformer2 = new IModelTransformer(sourceDb2, targetDb); // did not set targetScopeElementId

    await transformer1.processAll(); // first one succeeds using IModel.rootSubjectId as the default targetScopeElementId

    try {
      await transformer2.processAll(); // expect IModelError to be thrown because of the targetScopeElementId conflict with second transformation
      assert.fail("Expected provenance scope conflict");
    } catch (e) {
      assert.isTrue(e instanceof IModelError);
    } finally {
      transformer1.dispose();
      transformer2.dispose();
      sourceDb1.close();
      sourceDb2.close();
      targetDb.close();
    }
  });

  it("IModelCloneContext remap tests", async () => {
    const iModelDb: SnapshotDb = IModelTransformerUtils.createTeamIModel(outputDir, "Test", Point3d.create(0, 0, 0), ColorDef.green);
    const cloneContext = new IModelCloneContext(iModelDb);
    const sourceId: Id64String = Id64.fromLocalAndBriefcaseIds(1, 1);
    const targetId: Id64String = Id64.fromLocalAndBriefcaseIds(1, 2);
    cloneContext.remapElement(sourceId, targetId);
    assert.equal(targetId, cloneContext.findTargetElementId(sourceId));
    assert.equal(Id64.invalid, cloneContext.findTargetElementId(targetId));
    assert.equal(Id64.invalid, cloneContext.findTargetCodeSpecId(targetId));
    assert.throws(() => cloneContext.remapCodeSpec("SourceNotFound", "TargetNotFound"));
    cloneContext.dispose();
    iModelDb.close();
  });

  it("should clone across schema versions", async () => {
    // NOTE: schema differences between 01.00.00 and 01.00.01 were crafted to reproduce a cloning bug. The goal of this test is to prevent regressions.
    const cloneTestSchema100: string = path.join(KnownTestLocations.assetsDir, "CloneTest.01.00.00.ecschema.xml");
    const cloneTestSchema101: string = path.join(KnownTestLocations.assetsDir, "CloneTest.01.00.01.ecschema.xml");

    const seedDb = SnapshotDb.openFile(IModelTestUtils.resolveAssetFile("CompatibilityTestSeed.bim"));
    const sourceDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "CloneWithSchemaChanges-Source.bim");
    const sourceDb = SnapshotDb.createFrom(seedDb, sourceDbFile);
    await sourceDb.importSchemas(new BackendRequestContext(), [cloneTestSchema100]);
    const sourceElementProps = {
      classFullName: "CloneTest:PhysicalType",
      model: IModel.dictionaryId,
      code: PhysicalType.createCode(sourceDb, IModel.dictionaryId, "Type1"),
      string1: "a",
      string2: "b",
    };
    const sourceElementId = sourceDb.elements.insertElement(sourceElementProps);
    const sourceElement = sourceDb.elements.getElement(sourceElementId);
    assert.equal(sourceElement.asAny.string1, "a");
    assert.equal(sourceElement.asAny.string2, "b");
    sourceDb.saveChanges();

    const targetDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "CloneWithSchemaChanges-Target.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFile, { rootSubject: { name: "CloneWithSchemaChanges-Target" } });
    await targetDb.importSchemas(new BackendRequestContext(), [cloneTestSchema101]);

    const transformer = new IModelTransformer(sourceDb, targetDb);
    await transformer.processElement(sourceElementId);
    targetDb.saveChanges();

    const targetElementId = transformer.context.findTargetElementId(sourceElementId);
    const targetElement = targetDb.elements.getElement(targetElementId);
    assert.equal(targetElement.asAny.string1, "a");
    assert.equal(targetElement.asAny.string2, "b");

    seedDb.close();
    sourceDb.close();
    targetDb.close();
  });

  it("Should not visit elements or relationships", async () => {
    // class that asserts if it encounters an element or relationship
    class TestExporter extends IModelExportHandler {
      public iModelExporter: IModelExporter;
      public modelCount: number = 0;
      public constructor(iModelDb: IModelDb) {
        super();
        this.iModelExporter = new IModelExporter(iModelDb);
        this.iModelExporter.registerHandler(this);
      }
      protected override onExportModel(_model: Model, _isUpdate: boolean | undefined): void {
        ++this.modelCount;
      }
      protected override onExportElement(_element: Element, _isUpdate: boolean | undefined): void {
        assert.fail("Should not visit element when visitElements=false");
      }
      protected override onExportRelationship(_relationship: Relationship, _isUpdate: boolean | undefined): void {
        assert.fail("Should not visit relationship when visitRelationship=false");
      }
    }
    const sourceFileName = IModelTestUtils.resolveAssetFile("CompatibilityTestSeed.bim");
    const sourceDb: SnapshotDb = SnapshotDb.openFile(sourceFileName);
    const exporter = new TestExporter(sourceDb);
    exporter.iModelExporter.visitElements = false;
    exporter.iModelExporter.visitRelationships = false;
    // call various methods to make sure the onExport* callbacks don't assert
    await exporter.iModelExporter.exportAll();
    await exporter.iModelExporter.exportElement(IModel.rootSubjectId);
    await exporter.iModelExporter.exportChildElements(IModel.rootSubjectId);
    await exporter.iModelExporter.exportRepositoryLinks(); // eslint-disable-line deprecation/deprecation
    await exporter.iModelExporter.exportModelContents(IModel.repositoryModelId);
    await exporter.iModelExporter.exportRelationships(ElementRefersToElements.classFullName);
    // make sure the exporter actually visited something
    assert.isAtLeast(exporter.modelCount, 4);
    sourceDb.close();
  });

  it("Should filter by ViewDefinition", async () => {
    const sourceDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "FilterByView-Source.bim");
    const sourceDb = SnapshotDb.createEmpty(sourceDbFile, { rootSubject: { name: "FilterByView-Source" } });
    const categoryNames: string[] = ["C1", "C2", "C3", "C4", "C5"];
    categoryNames.forEach((categoryName) => {
      const categoryId = SpatialCategory.insert(sourceDb, IModel.dictionaryId, categoryName, {});
      CategorySelector.insert(sourceDb, IModel.dictionaryId, categoryName, [categoryId]);
    });
    const modelNames: string[] = ["MA", "MB", "MC", "MD"];
    modelNames.forEach((modelName) => {
      const modelId = PhysicalModel.insert(sourceDb, IModel.rootSubjectId, modelName);
      ModelSelector.insert(sourceDb, IModel.dictionaryId, modelName, [modelId]);

    });
    const projectExtents = new Range3d();
    const displayStyleId = DisplayStyle3d.insert(sourceDb, IModel.dictionaryId, "DisplayStyle");
    for (let x = 0; x < categoryNames.length; x++) { // eslint-disable-line @typescript-eslint/prefer-for-of
      const categoryId = sourceDb.elements.queryElementIdByCode(SpatialCategory.createCode(sourceDb, IModel.dictionaryId, categoryNames[x]))!;
      const categorySelectorId = sourceDb.elements.queryElementIdByCode(CategorySelector.createCode(sourceDb, IModel.dictionaryId, categoryNames[x]))!;
      for (let y = 0; y < modelNames.length; y++) { // eslint-disable-line @typescript-eslint/prefer-for-of
        const modelId = sourceDb.elements.queryElementIdByCode(PhysicalPartition.createCode(sourceDb, IModel.rootSubjectId, modelNames[y]))!;
        const modelSelectorId = sourceDb.elements.queryElementIdByCode(ModelSelector.createCode(sourceDb, IModel.dictionaryId, modelNames[y]))!;
        const physicalObjectProps: PhysicalElementProps = {
          classFullName: PhysicalObject.classFullName,
          model: modelId,
          category: categoryId,
          code: Code.createEmpty(),
          userLabel: `${PhysicalObject.className}-${categoryNames[x]}-${modelNames[y]}`,
          geom: IModelTransformerUtils.createBox(Point3d.create(1, 1, 1), categoryId),
          placement: {
            origin: Point3d.create(x * 2, y * 2, 0),
            angles: YawPitchRollAngles.createDegrees(0, 0, 0),
          },
        };
        const physicalObjectId = sourceDb.elements.insertElement(physicalObjectProps);
        const physicalObject = sourceDb.elements.getElement<PhysicalObject>(physicalObjectId, PhysicalObject);
        const viewExtents = physicalObject.placement.calculateRange();
        OrthographicViewDefinition.insert(
          sourceDb,
          IModel.dictionaryId,
          `View-${categoryNames[x]}-${modelNames[y]}`,
          modelSelectorId,
          categorySelectorId,
          displayStyleId,
          viewExtents,
          StandardViewIndex.Iso
        );
        projectExtents.extendRange(viewExtents);
      }
    }
    sourceDb.updateProjectExtents(projectExtents);
    const exportCategorySelectorId = CategorySelector.insert(sourceDb, IModel.dictionaryId, "Export", [
      sourceDb.elements.queryElementIdByCode(SpatialCategory.createCode(sourceDb, IModel.dictionaryId, categoryNames[0]))!,
      sourceDb.elements.queryElementIdByCode(SpatialCategory.createCode(sourceDb, IModel.dictionaryId, categoryNames[2]))!,
      sourceDb.elements.queryElementIdByCode(SpatialCategory.createCode(sourceDb, IModel.dictionaryId, categoryNames[4]))!,
    ]);
    const exportModelSelectorId = ModelSelector.insert(sourceDb, IModel.dictionaryId, "Export", [
      sourceDb.elements.queryElementIdByCode(PhysicalPartition.createCode(sourceDb, IModel.rootSubjectId, modelNames[1]))!,
      sourceDb.elements.queryElementIdByCode(PhysicalPartition.createCode(sourceDb, IModel.rootSubjectId, modelNames[3]))!,
    ]);
    const exportViewId = OrthographicViewDefinition.insert(
      sourceDb,
      IModel.dictionaryId,
      "Export",
      exportModelSelectorId,
      exportCategorySelectorId,
      displayStyleId,
      projectExtents,
      StandardViewIndex.Iso
    );
    sourceDb.saveChanges();

    const targetDbFile: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "FilterByView-Target.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFile, { rootSubject: { name: "FilterByView-Target" } });
    targetDb.updateProjectExtents(sourceDb.projectExtents);

    const transformer = new FilterByViewTransformer(sourceDb, targetDb, exportViewId);
    await transformer.processSchemas(new BackendRequestContext());
    await transformer.processAll();
    transformer.dispose();

    targetDb.saveChanges();
    targetDb.close();
    sourceDb.close();
  });

  // WIP: Included as skipped until test file management strategy can be refined.
  it.skip("Merge test", async () => {
    const mergedIModelFileName: string = IModelTestUtils.prepareOutputFile("IModelTransformer", "MergeTest.bim");
    const mergedDb = SnapshotDb.createEmpty(mergedIModelFileName, { rootSubject: { name: "Merge Test" } });
    const campusSubjectId: Id64String = Subject.insert(mergedDb, IModel.rootSubjectId, "Campus");
    assert.isTrue(Id64.isValidId64(campusSubjectId));
    const garageSubjectId: Id64String = Subject.insert(mergedDb, IModel.rootSubjectId, "Garage");
    assert.isTrue(Id64.isValidId64(garageSubjectId));
    const buildingSubjectId: Id64String = Subject.insert(mergedDb, IModel.rootSubjectId, "Building");
    assert.isTrue(Id64.isValidId64(buildingSubjectId));
    mergedDb.saveChanges("Create Subject hierarchy");
    IModelTestUtils.flushTxns(mergedDb); // subsequent calls to importSchemas will fail if this is not called to flush local changes

    // Import campus
    if (true) {
      const campusIModelFileName = "D:/data/bim/MergeTest/Campus.bim";
      const campusDb = SnapshotDb.openFile(campusIModelFileName);
      IModelTransformerUtils.dumpIModelInfo(campusDb);
      const transformer = new IModelTransformer(campusDb, mergedDb, { targetScopeElementId: campusSubjectId });
      await transformer.processSchemas(new BackendRequestContext());
      transformer.context.remapElement(IModel.rootSubjectId, campusSubjectId);
      await transformer.processAll();
      transformer.dispose();
      mergedDb.saveChanges("Imported Campus");
      IModelTestUtils.flushTxns(mergedDb); // subsequent calls to importSchemas will fail if this is not called to flush local changes
      campusDb.close();
    }

    // Import garage
    if (true) {
      const garageIModelFileName = "D:/data/bim/MergeTest/Garage.bim";
      const garageDb = SnapshotDb.openFile(garageIModelFileName);
      IModelTransformerUtils.dumpIModelInfo(garageDb);
      const transformer = new IModelTransformer(garageDb, mergedDb, { targetScopeElementId: garageSubjectId });
      transformer.context.remapElement(IModel.rootSubjectId, garageSubjectId);
      await transformer.processAll();
      transformer.dispose();
      mergedDb.saveChanges("Imported Garage");
      IModelTestUtils.flushTxns(mergedDb); // subsequent calls to importSchemas will fail if this is not called to flush local changes
      garageDb.close();
    }

    // Import building
    if (true) {
      const buildingIModelFileName = "D:/data/bim/MergeTest/Building.bim";
      const buildingDb = SnapshotDb.openFile(buildingIModelFileName);
      IModelTransformerUtils.dumpIModelInfo(buildingDb);
      const transformer = new IModelTransformer(buildingDb, mergedDb, { targetScopeElementId: buildingSubjectId });
      await transformer.processSchemas(new BackendRequestContext());
      transformer.context.remapElement(IModel.rootSubjectId, buildingSubjectId);
      await transformer.processAll();
      transformer.dispose();
      mergedDb.saveChanges("Imported Building");
      IModelTestUtils.flushTxns(mergedDb); // subsequent calls to importSchemas will fail if this is not called to flush local changes
      buildingDb.close();
    }

    IModelTransformerUtils.dumpIModelInfo(mergedDb);
    mergedDb.close();
  });

  it("processSchemas should handle out-of-order exported schemas", async () => {
    const testSchema1Path = IModelTestUtils.prepareOutputFile("IModelTransformer", "TestSchema1.ecschema.xml");
    IModelJsFs.writeFileSync(testSchema1Path, `<?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="TestSchema1" alias="ts1" version="01.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.1">
          <ECSchemaReference name="BisCore" version="01.00" alias="bis"/>
          <ECEntityClass typeName="TestElement1">
            <BaseClass>bis:PhysicalElement</BaseClass>
            <ECProperty propertyName="MyProp1" typeName="string"/>
          </ECEntityClass>
      </ECSchema>`
    );

    const testSchema2Path = IModelTestUtils.prepareOutputFile("IModelTransformer", "TestSchema2.ecschema.xml");
    IModelJsFs.writeFileSync(testSchema2Path, `<?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="TestSchema2" alias="ts2" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
          <ECSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
          <ECSchemaReference name="TestSchema1" version="01.00.00" alias="ts1"/>
          <ECEntityClass typeName="TestElement2">
            <BaseClass>ts1:TestElement1</BaseClass>
            <ECProperty propertyName="MyProp2" typeName="string"/>
          </ECEntityClass>
      </ECSchema>`
    );

    const sourceDbPath = IModelTestUtils.prepareOutputFile("IModelTransformer", "OrderTestSource.bim");
    const sourceDb = SnapshotDb.createEmpty(sourceDbPath, { rootSubject: { name: "Order Test" } });

    const requestContext = new BackendRequestContext();
    await sourceDb.importSchemas(requestContext, [testSchema1Path, testSchema2Path]);
    sourceDb.saveChanges();

    class OrderedExporter extends IModelExporter {
      public override async exportSchemas() {
        const schemaLoader = new IModelSchemaLoader(this.sourceDb);
        const schema1 = schemaLoader.getSchema("TestSchema1");
        const schema2 = schemaLoader.getSchema("TestSchema2");
        // by importing schema2 (which references schema1) first, we
        // prove that the import order in processSchemas does not matter
        await this.handler.callProtected.onExportSchema(schema2);
        await this.handler.callProtected.onExportSchema(schema1);
      }
    }

    const targetDbPath = IModelTestUtils.prepareOutputFile("IModelTransformer", "OrderTestTarget.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbPath, { rootSubject: { name: "Order Test" } });
    const transformer = new IModelTransformer(new OrderedExporter(sourceDb), targetDb);

    let error: any;
    try {
      await transformer.processSchemas(new BackendRequestContext());
    } catch (_error) {
      error = _error;
    }
    assert.isUndefined(error);

    targetDb.saveChanges();
    const targetImportedSchemasLoader = new IModelSchemaLoader(targetDb);
    const schema1InTarget = targetImportedSchemasLoader.getSchema("TestSchema1");
    assert.isDefined(schema1InTarget);
    const schema2InTarget = targetImportedSchemasLoader.getSchema("TestSchema2");
    assert.isDefined(schema2InTarget);

    sourceDb.close();
    targetDb.close();
  });
  
  it("processSchemas should wait for the schema import to finish to delete the export directory", async () => {
    const reqCtx = new BackendRequestContext();
    const cloneTestSchema100 = path.join(KnownTestLocations.assetsDir, "CloneTest.01.00.00.ecschema.xml");
    const sourceDbPath = IModelTestUtils.prepareOutputFile("IModelTransformer", "FinallyFirstTest.bim");
    const sourceDb = SnapshotDb.createEmpty(sourceDbPath, { rootSubject: { name: "FinallyFirstTest" } });
    await sourceDb.importSchemas(reqCtx, [cloneTestSchema100]);
    sourceDb.saveChanges();

    const targetDbPath = IModelTestUtils.prepareOutputFile("IModelTransformer", "FinallyFirstTestOut.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbPath, { rootSubject: { name: "FinallyFirstTest" } });
    const transformer = new IModelTransformer(sourceDb, targetDb);

    const importSchemasResolved = sinon.spy();
    let importSchemasPromise: Promise<void>;

    sinon.replace(targetDb, "importSchemas", sinon.fake(async () => {
      importSchemasPromise = new Promise((resolve) => setImmediate(() => {
        importSchemasResolved();
        resolve(undefined);
      }));
      return importSchemasPromise;
    }));

    const removeSyncSpy = sinon.spy(IModelJsFs, "removeSync");

    await transformer.processSchemas(reqCtx);
    assert(removeSyncSpy.calledAfter(importSchemasResolved));

    sinon.restore();
    
    sourceDb.close();
    targetDb.close();
  });
  
  it("handles definition element scoped by non-definitional element", async () => {
    const sourceDbPath = IModelTestUtils.prepareOutputFile("IModelTransformer", "BadPredecessorsExampleSource.bim");
    const sourceDb = SnapshotDb.createEmpty(sourceDbPath, { rootSubject: { name: "BadPredecessorExampleSource" } });
    const requestContext = new BackendRequestContext();

    // create a document partition in our iModel's root
    const documentListModelId = DocumentListModel.insert(sourceDb, IModelDb.rootSubjectId, "DocumentList");

    // add a drawing to the document partition's model
    const drawingId = sourceDb.elements.insertElement({
      classFullName: Drawing.classFullName,
      model: documentListModelId,
      code: Drawing.createCode(sourceDb, documentListModelId, "Drawing"),
    });
    expect(Id64.isValidId64(drawingId)).to.be.true;

    // submodel our drawing with a DrawingModel
    const model = sourceDb.models.createModel({
      classFullName: DrawingModel.classFullName,
      modeledElement: { id: drawingId },
    });
    sourceDb.models.insertModel(model);

    const myCodeSpecId = sourceDb.codeSpecs.insert(CodeSpec.create(sourceDb, "MyCodeSpec", CodeScopeSpec.Type.RelatedElement));

    // insert a definition element which is scoped by a non-definition element (the drawing)
    const _physicalMaterialId = sourceDb.elements.insertElement({
      classFullName: GenericPhysicalMaterial.classFullName,
      model: IModel.dictionaryId,
      code: new Code({spec: myCodeSpecId, scope: drawingId, value: "physical material"}),
    } as DefinitionElementProps);

    sourceDb.saveChanges();

    const targetDbPath = IModelTestUtils.prepareOutputFile("IModelTransformer", "BadPredecessorExampleTarget.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbPath, { rootSubject: { name: sourceDb.rootSubject.name } });
    const transformer = new IModelTransformer(sourceDb, targetDb);

    await expect(transformer.processSchemas(requestContext)).to.eventually.be.fulfilled;
    await expect(transformer.processAll()).to.eventually.be.fulfilled;

    // check if target imodel has the elements that source imodel had
    expect(targetDb.codeSpecs.hasName("MyCodeSpec")).to.be.true;
    const drawingIdTarget = targetDb.elements.queryElementIdByCode(Drawing.createCode(targetDb, documentListModelId, "Drawing"));
    expect(drawingIdTarget).to.not.be.undefined;
    expect(Id64.isValidId64((drawingIdTarget as string))).to.be.true;
    const physicalMaterialIdTarget = targetDb.elements.queryElementIdByCode(new Code({spec: myCodeSpecId, scope: drawingId, value: "physical material"}));
    expect(physicalMaterialIdTarget).to.not.be.undefined;
    expect(Id64.isValidId64((physicalMaterialIdTarget as string))).to.be.true;

    sourceDb.close();
    targetDb.close();
  });

  it("handles backwards related-instance code in model", async () => {
    const sourceDbPath = IModelTestUtils.prepareOutputFile("IModelTransformer", "BadPredecessorsExampleSource.bim");
    const sourceDb = SnapshotDb.createEmpty(sourceDbPath, { rootSubject: { name: "BadPredecessorExampleSource" } });
    const requestContext = new BackendRequestContext();

    // create a document partition in our iModel's root
    const documentListModelId = DocumentListModel.insert(sourceDb, IModelDb.rootSubjectId, "DocumentList");

    // add a drawing to the document partition's model
    const drawing1Id = sourceDb.elements.insertElement({
      classFullName: Drawing.classFullName,
      model: documentListModelId,
      code: Drawing.createCode(sourceDb, documentListModelId, "Drawing1"),
    });

    const drawing2Id = sourceDb.elements.insertElement({
      classFullName: Drawing.classFullName,
      model: documentListModelId,
      code: Drawing.createCode(sourceDb, documentListModelId, "Drawing2"),
    });

    const drawingModel1 = sourceDb.models.createModel({
      classFullName: DrawingModel.classFullName,
      modeledElement: { id: drawing1Id },
    });
    const drawingModel1Id = sourceDb.models.insertModel(drawingModel1);

    const drawingModel2 = sourceDb.models.createModel({
      classFullName: DrawingModel.classFullName,
      modeledElement: { id: drawing2Id },
    });
    const drawingModel2Id = sourceDb.models.insertModel(drawingModel2);

    const modelCodeSpec = sourceDb.codeSpecs.insert(CodeSpec.create(sourceDb, "ModelCodeSpec", CodeScopeSpec.Type.Model));
    const relatedCodeSpecId = sourceDb.codeSpecs.insert(CodeSpec.create(sourceDb, "RelatedCodeSpec", CodeScopeSpec.Type.RelatedElement));

    const categoryId = DrawingCategory.insert(sourceDb, IModel.dictionaryId, "DrawingCategory", { color: ColorDef.green.toJSON() });

    // we make drawingGraphic2 in drawingModel2 first
    const drawingGraphic2Id = new DrawingGraphic({
      classFullName: DrawingGraphic.classFullName,
      model: drawingModel2Id,
      code: new Code({spec: modelCodeSpec, scope: drawingModel2Id, value: "drawing graphic 2"}),
      category: categoryId,
    }, sourceDb).insert();

    const _drawingGraphic1Id = new DrawingGraphic({
      classFullName: DrawingGraphic.classFullName,
      model: drawingModel1Id,
      code: new Code({spec: relatedCodeSpecId, scope: drawingGraphic2Id, value: "drawing graphic 1"}),
      category: categoryId,
    }, sourceDb).insert();

    sourceDb.saveChanges();

    const targetDbPath = IModelTestUtils.prepareOutputFile("IModelTransformer", "BadPredecessorExampleTarget.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbPath, { rootSubject: { name: sourceDb.rootSubject.name } });
    const transformer = new IModelTransformer(sourceDb, targetDb);

    await expect(transformer.processSchemas(requestContext)).to.eventually.be.fulfilled;
    await expect(transformer.processAll()).to.eventually.be.fulfilled;

    // check if target imodel has the elements that source imodel had
    expect(targetDb.codeSpecs.hasName("ModelCodeSpec")).to.be.true;
    expect(targetDb.codeSpecs.hasName("RelatedCodeSpec")).to.be.true;
    const drawingIdTarget1 = targetDb.elements.queryElementIdByCode(Drawing.createCode(targetDb, documentListModelId, "Drawing1"));
    expect(drawingIdTarget1).to.not.be.undefined;
    expect(Id64.isValidId64((drawingIdTarget1 as string))).to.be.true;

    const drawingIdTarget2 = targetDb.elements.queryElementIdByCode(Drawing.createCode(targetDb, documentListModelId, "Drawing2"));
    expect(drawingIdTarget2).to.not.be.undefined;
    expect(Id64.isValidId64((drawingIdTarget2 as string))).to.be.true;

    const drawingGraphicIdTarget2Props = targetDb.elements.getElementProps(drawingGraphic2Id);
    expect(targetDb.elements.queryElementIdByCode(new Code(drawingGraphicIdTarget2Props.code))).to.not.be.undefined;
    expect(Id64.isValidId64((targetDb.elements.queryElementIdByCode(new Code(drawingGraphicIdTarget2Props.code)) as string))).to.be.true;

    const drawingGraphicIdTarget1Props = targetDb.elements.getElementProps(_drawingGraphic1Id);
    expect(targetDb.elements.queryElementIdByCode(new Code(drawingGraphicIdTarget1Props.code))).to.not.be.undefined;
    expect(Id64.isValidId64((targetDb.elements.queryElementIdByCode(new Code(drawingGraphicIdTarget1Props.code)) as string))).to.be.true;
    
    sourceDb.close();
    targetDb.close();
  });
  
});
