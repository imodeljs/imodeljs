/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import * as path from "path";
import * as semver from "semver";
import { Guid, Id64, Id64String } from "@bentley/bentleyjs-core";
import {
  BackendRequestContext, BisCoreSchema, ClassRegistry, GenericSchema, GeometricElement3d, IModelDb, IModelHost, IModelJsFs, KnownLocations,
  PhysicalPartition, Schema, Schemas, SnapshotDb, SpatialCategory, SubjectOwnsPartitionElements,
} from "@bentley/imodeljs-backend";
import {
  CategoryProps, Code, ColorDef, GeometricElement3dProps, IModel, InformationPartitionElementProps, ModelProps, PropertyMetaData, RelatedElement,
  TypeDefinitionElementProps,
} from "@bentley/imodeljs-common";
import { AnalyticalElement, AnalyticalModel, AnalyticalPartition, AnalyticalSchema } from "../analytical-backend";

class TestAnalyticalSchema extends Schema {
  public static override get schemaName(): string { return "TestAnalytical"; }
  public static get schemaFilePath(): string { return path.join(__dirname, "assets", "TestAnalytical.ecschema.xml"); }
  public static registerSchema() {
    if (this !== Schemas.getRegisteredSchema(this.schemaName)) {
      Schemas.unregisterSchema(this.schemaName);
      Schemas.registerSchema(this);
      ClassRegistry.register(TestAnalyticalPartition, this);
      ClassRegistry.register(TestAnalyticalElement, this);
      ClassRegistry.register(TestAnalyticalModel, this);
    }
  }
}

class TestAnalyticalPartition extends AnalyticalPartition {
  public static override get className(): string { return "Partition"; }
}

class TestAnalyticalElement extends AnalyticalElement {
  public static override get className(): string { return "Element"; }
  public constructor(props: GeometricElement3dProps, iModel: IModelDb) { super(props, iModel); }
}

class TestAnalyticalModel extends AnalyticalModel {
  public static override get className(): string { return "Model"; }
}

describe("AnalyticalSchema", () => {
  const outputDir = path.join(__dirname, "output");
  const assetsDir = path.join(__dirname, "assets");

  before(async () => {
    await IModelHost.startup();
    AnalyticalSchema.registerSchema();
    TestAnalyticalSchema.registerSchema();
    if (!IModelJsFs.existsSync(outputDir)) {
      IModelJsFs.mkdirSync(outputDir);
    }
  });

  it("should import Analytical schema", async () => {
    const iModelFileName: string = path.join(outputDir, "ImportAnalytical.bim");
    if (IModelJsFs.existsSync(iModelFileName)) {
      IModelJsFs.removeSync(iModelFileName);
    }
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "ImportAnalytical" }, createClassViews: true });
    // import schemas
    const analyticalSchemaFileName: string = path.join(KnownLocations.nativeAssetsDir, "ECSchemas", "Domain", "Analytical.ecschema.xml");
    const testSchemaFileName: string = path.join(assetsDir, "TestAnalytical.ecschema.xml");
    assert.isTrue(IModelJsFs.existsSync(BisCoreSchema.schemaFilePath));
    assert.isTrue(IModelJsFs.existsSync(analyticalSchemaFileName));
    assert.isTrue(IModelJsFs.existsSync(testSchemaFileName));
    await iModelDb.importSchemas(new BackendRequestContext(), [analyticalSchemaFileName, testSchemaFileName]);
    assert.isFalse(iModelDb.nativeDb.hasPendingTxns(), "Expect importSchemas to not have txns for snapshots");
    assert.isFalse(iModelDb.nativeDb.hasUnsavedChanges(), "Expect no unsaved changes after importSchemas");
    iModelDb.saveChanges();
    // test querySchemaVersion
    const bisCoreSchemaVersion: string = iModelDb.querySchemaVersion(BisCoreSchema.schemaName)!;
    assert.isTrue(semver.satisfies(bisCoreSchemaVersion, ">= 1.0.8"));
    assert.isTrue(semver.satisfies(bisCoreSchemaVersion, "< 2"));
    assert.isTrue(semver.satisfies(bisCoreSchemaVersion, "^1.0.0"));
    assert.isTrue(semver.satisfies(iModelDb.querySchemaVersion(GenericSchema.schemaName)!, ">= 1.0.2"));
    assert.isTrue(semver.eq(iModelDb.querySchemaVersion("TestAnalytical")!, "1.0.0"));
    assert.isDefined(iModelDb.querySchemaVersion("Analytical"), "Expect Analytical to be imported");
    assert.isDefined(iModelDb.querySchemaVersion("analytical"), "Expect case-insensitive comparison");
    assert.isUndefined(iModelDb.querySchemaVersion("NotImported"), "Expect undefined to be returned for schemas that have not been imported");
    // insert category
    const categoryId = SpatialCategory.insert(iModelDb, IModel.dictionaryId, "Category", { color: ColorDef.blue.tbgr });
    assert.isTrue(Id64.isValidId64(categoryId));
    // insert TypeDefinition
    const typeDefinitionProps: TypeDefinitionElementProps = {
      classFullName: "TestAnalytical:Type",
      model: IModel.dictionaryId,
      code: Code.createEmpty(),
      userLabel: "TypeDefinition",
    };
    const typeDefinitionId: Id64String = iModelDb.elements.insertElement(typeDefinitionProps);
    assert.isTrue(Id64.isValidId64(typeDefinitionId));
    // insert partition
    const partitionProps: InformationPartitionElementProps = {
      classFullName: "TestAnalytical:Partition",
      model: IModel.repositoryModelId,
      parent: new SubjectOwnsPartitionElements(IModel.rootSubjectId),
      code: PhysicalPartition.createCode(iModelDb, IModel.rootSubjectId, "Partition"),
    };
    const partitionId: Id64String = iModelDb.elements.insertElement(partitionProps);
    assert.isTrue(Id64.isValidId64(partitionId));
    // insert model
    const modelProps: ModelProps = {
      classFullName: "TestAnalytical:Model",
      modeledElement: { id: partitionId },
    };
    const modelId: Id64String = iModelDb.models.insertModel(modelProps);
    assert.isTrue(Id64.isValidId64(modelId));
    // insert element
    const elementProps: GeometricElement3dProps = {
      classFullName: "TestAnalytical:Element",
      model: modelId,
      category: categoryId,
      code: Code.createEmpty(),
      userLabel: "A1",
      typeDefinition: { id: typeDefinitionId, relClassName: "Analytical:AnalyticalElementIsOfType" },
    };
    const elementId: Id64String = iModelDb.elements.insertElement(elementProps);
    // test forEachProperty and PropertyMetaData.isNavigation
    const element: GeometricElement3d = iModelDb.elements.getElement(elementId);
    element.forEachProperty((propertyName: string, meta: PropertyMetaData) => {
      switch (propertyName) {
        case "model": assert.isTrue(meta.isNavigation); break;
        case "category": assert.isTrue(meta.isNavigation); break;
        case "typeDefinition": assert.isTrue(meta.isNavigation); break;
        case "codeValue": assert.isFalse(meta.isNavigation); break;
        case "userLabel": assert.isFalse(meta.isNavigation); break;
      }
    });
    // test typeDefinition update scenarios
    assert.isTrue(Id64.isValidId64(elementId));
    assert.isTrue(Id64.isValidId64(iModelDb.elements.getElement<GeometricElement3d>(elementId).typeDefinition!.id), "Expect valid typeDefinition.id");
    elementProps.typeDefinition = undefined;
    iModelDb.elements.updateElement(elementProps);
    assert.isUndefined(iModelDb.elements.getElement<GeometricElement3d>(elementId).typeDefinition, "Expect typeDefinition to be undefined");
    elementProps.typeDefinition = RelatedElement.none;
    iModelDb.elements.updateElement(elementProps);
    assert.isUndefined(iModelDb.elements.getElement<GeometricElement3d>(elementId).typeDefinition, "Expect typeDefinition to be undefined");
    // close
    iModelDb.saveChanges();
    iModelDb.close();
  });

  it("should create elements exercising the Analytical domain", async () => {
    const iModelFileName: string = path.join(outputDir, "ImportAnalytical.bim");
    if (IModelJsFs.existsSync(iModelFileName)) {
      IModelJsFs.removeSync(iModelFileName);
    }
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, {
      rootSubject: { name: "AnalyticalTest", description: "Test of the Analytical domain schema." },
      client: "Analytical",
      globalOrigin: { x: 0, y: 0 },
      projectExtents: { low: { x: -500, y: -500, z: -50 }, high: { x: 500, y: 500, z: 50 } },
      guid: Guid.createValue(),
      createClassViews: true,
    });

    // Import the Analytical schema
    await iModelDb.importSchemas(new BackendRequestContext(), [AnalyticalSchema.schemaFilePath, TestAnalyticalSchema.schemaFilePath]);
    iModelDb.saveChanges("Import TestAnalytical schema");

    // Insert a SpatialCategory
    const spatialCategoryProps: CategoryProps = {
      classFullName: SpatialCategory.classFullName,
      model: IModel.dictionaryId,
      code: SpatialCategory.createCode(iModelDb, IModel.dictionaryId, "Test Spatial Category"),
      isPrivate: false,
    };
    const spatialCategoryId: Id64String = iModelDb.elements.insertElement(spatialCategoryProps);
    assert.isTrue(Id64.isValidId64(spatialCategoryId));

    // Create and populate a TestAnalyticalModel
    const analyticalPartitionProps: InformationPartitionElementProps = {
      classFullName: TestAnalyticalPartition.classFullName,
      model: IModel.repositoryModelId,
      parent: new SubjectOwnsPartitionElements(IModel.rootSubjectId),
      code: TestAnalyticalPartition.createCode(iModelDb, IModel.rootSubjectId, "Test Analytical Model"),
    };
    const analyticalPartitionId: Id64String = iModelDb.elements.insertElement(analyticalPartitionProps);
    assert.isTrue(Id64.isValidId64(analyticalPartitionId));
    const analyticalModel = iModelDb.models.createModel<TestAnalyticalModel>({
      classFullName: TestAnalyticalModel.classFullName,
      modeledElement: { id: analyticalPartitionId },
    });
    const analyticalModelId: Id64String = iModelDb.models.insertModel(analyticalModel);
    assert.isTrue(Id64.isValidId64(analyticalModelId));

    // Create a Test Analytical element
    const testAnalyticalProps: GeometricElement3dProps = {
      classFullName: TestAnalyticalElement.classFullName,
      model: analyticalModelId,
      category: spatialCategoryId,
      code: Code.createEmpty(),
    };
    const analyticalElementId: Id64String = iModelDb.elements.insertElement(testAnalyticalProps);
    assert.isTrue(Id64.isValidId64(analyticalElementId));

    iModelDb.saveChanges("Insert Test Analytical elements");
    iModelDb.close();
  });
});
