/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import * as path from "path";
import { DbResult, Logger, LogLevel } from "@bentley/bentleyjs-core";
import {
  BackendLoggerCategory, BackendRequestContext, Category, ECSqlStatement, Element, GeometricElement2d, GeometricElement3d, IModelDb, IModelHost, IModelJsFs,
  PhysicalModel, PhysicalPartition, SnapshotDb, SpatialCategory, SpatialElement,
} from "@bentley/imodeljs-backend";
import { progressLoggerCategory, Transformer } from "../Transformer";
import { Code, PhysicalElementProps } from "@bentley/imodeljs-common";

describe("imodel-transformer", () => {
  const sourceDbFileName = "../../core/backend/src/test/assets/CompatibilityTestSeed.bim";
  let sourceDb: IModelDb;

  before(async () => {
    await IModelHost.startup();

    if (false) { // set to true to enable logging
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(progressLoggerCategory, LogLevel.Info);
      Logger.setLevel(BackendLoggerCategory.IModelExporter, LogLevel.Trace);
      Logger.setLevel(BackendLoggerCategory.IModelImporter, LogLevel.Trace);
      Logger.setLevel(BackendLoggerCategory.IModelTransformer, LogLevel.Trace);
    }

    assert.isTrue(IModelJsFs.existsSync(sourceDbFileName));
    sourceDb = SnapshotDb.openFile(sourceDbFileName);
  });

  after(async () => {
    sourceDb.close();
    await IModelHost.shutdown();
  });

  function initOutputFile(fileBaseName: string) {
    const outputDirName = path.join(__dirname, "output");
    if (!IModelJsFs.existsSync(outputDirName)) {
      IModelJsFs.mkdirSync(outputDirName);
    }
    const outputFileName = path.join(outputDirName, fileBaseName);
    if (IModelJsFs.existsSync(outputFileName)) {
      IModelJsFs.removeSync(outputFileName);
    }
    return outputFileName;
  }

  function count(iModelDb: IModelDb, classFullName: string): number {
    return iModelDb.withPreparedStatement(`SELECT COUNT(*) FROM ${classFullName}`, (statement: ECSqlStatement): number => {
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getInteger() : 0;
    });
  }

  it("should should simplify Element geometry in the target iModel", async () => {
    const targetDbFileName = initOutputFile("CompatibilityTestSeed-Simplified.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFileName, {
      rootSubject: { name: `${sourceDb.rootSubject.name}-Simplified` },
      ecefLocation: sourceDb.ecefLocation,
    });

    await Transformer.transformAll(new BackendRequestContext(), sourceDb, targetDb, { simplifyElementGeometry: true });
    const numSourceElements = count(sourceDb, Element.classFullName);
    assert.isAtLeast(numSourceElements, 50);
    assert.equal(count(targetDb, Element.classFullName), numSourceElements);
    targetDb.close();
  });

  it("should should combine PhysicalModels in the target iModel", async () => {
    const targetDbFileName = initOutputFile("CompatibilityTestSeed-Combined.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFileName, {
      rootSubject: { name: `${sourceDb.rootSubject.name}-Combined` },
      ecefLocation: sourceDb.ecefLocation,
    });

    await Transformer.transformAll(new BackendRequestContext(), sourceDb, targetDb, { combinePhysicalModels: true });
    const numSourceSpatialElements = count(sourceDb, SpatialElement.classFullName);
    assert.isAtLeast(numSourceSpatialElements, 6);
    assert.equal(count(targetDb, SpatialElement.classFullName), numSourceSpatialElements);
    assert.equal(count(targetDb, PhysicalPartition.classFullName), 1);
    assert.isAtLeast(count(sourceDb, PhysicalPartition.classFullName), 2);
    targetDb.close();
  });

  it("should exclude categories", async () => {
    const targetDbFileName = initOutputFile("CompatibilityTestSeed-CategoryExcluded.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFileName, {
      rootSubject: { name: `${sourceDb.rootSubject.name}-CategoryExcluded` },
      ecefLocation: sourceDb.ecefLocation,
    });

    const testCategory = "TestSpatialCategory";

    await Transformer.transformAll(new BackendRequestContext(), sourceDb, targetDb, { excludeCategories: [testCategory] });

    async function getElementCountInTestCategory(db: IModelDb) {
      // do two queries because querying abstract GeometricElement won't contain the category
      const sum = (arr: number[]) => arr.reduce((prev, x) => prev + x, 0);
      return sum(await Promise.all([GeometricElement2d.classFullName, GeometricElement3d.classFullName].map(async (className) => {
        const queryResult = await db.query(
          `SELECT COUNT(*) FROM ${className} e JOIN bis.Category c ON e.category.id=c.ECInstanceId WHERE c.CodeValue=:category`,
          { category: testCategory }
        ).next();
        const value = Object.values(queryResult.value)[0]; // gets the value of the first column in the returned row
        if (typeof value !== "number") {
          throw Error(`unexpected result from COUNT query, queryResult was: '${JSON.stringify(queryResult)}'`);
        }
        return value;
      })));
    }

    async function hasTheCategory(db: IModelDb) {
      return db.queryEntityIds({
        from: Category.classFullName,
        where: "CodeValue=:category",
        bindings: { category: testCategory },
      }).size > 0;
    }

    assert.isTrue(await hasTheCategory(sourceDb));

    const elemsInCategoryInSrc = await getElementCountInTestCategory(sourceDb);
    assert.isAtLeast(elemsInCategoryInSrc, 6);

    assert.isFalse(await hasTheCategory(targetDb));

    const elemsInCategoryInTarget = await getElementCountInTestCategory(targetDb);
    assert.equal(elemsInCategoryInTarget, 0);

    targetDb.close();
  });

  it("should clone element struct array entries including when their class layout changes", async () => {
    const makeSchema = (version: "01.00" | "01.01") =>
      `<?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="Test" alias="test" version="${version}" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.1">
          <ECSchemaReference name="BisCore" version="01.00" alias="bis"/>
          <ECStructClass typeName="TestStruct">
            <ECProperty propertyName="SomeNumber" typeName="string" />
            ${version === "01.01" ? `<ECProperty propertyName="NewProperty" typeName="string" />` : ""}
          </ECStructClass >
          <ECEntityClass typeName="TestElement">
            <BaseClass>bis:PhysicalElement</BaseClass>
            <ECProperty propertyName="MyProp" typeName="string"/>
            ${version === "01.01" ? `<ECProperty propertyName="MyProp2" typeName="string" />` : ""}
            <ECStructArrayProperty propertyName="MyArray" typeName="TestStruct" minOccurs="0" maxOccurs="unbounded" />
          </ECEntityClass>
      </ECSchema>`;

    const testSchemaPath = initOutputFile("TestSchema-StructArrayClone.ecschema.01.00.xml");
    IModelJsFs.writeFileSync(testSchemaPath, makeSchema("01.00"));

    const newSchemaSourceDbPath = initOutputFile("sourceDb-StructArrayClone.bim");
    IModelJsFs.copySync(sourceDbFileName, newSchemaSourceDbPath);
    const newSchemaSourceDb = SnapshotDb.createFrom(sourceDb, newSchemaSourceDbPath);

    const requestContext = new BackendRequestContext();

    await newSchemaSourceDb.importSchemas(requestContext, [testSchemaPath]);

    const [firstModelId] = newSchemaSourceDb.queryEntityIds({ from: PhysicalModel.classFullName, limit: 1 });
    assert.isString(firstModelId);
    const [firstSpatialCategId] = newSchemaSourceDb.queryEntityIds({ from: SpatialCategory.classFullName, limit: 1 });
    assert.isString(firstSpatialCategId);

    const elementProps = {
      myProp: "10",
      myArray: [{ someNumber: "1" }, { someNumber: "2" }],
    };

    const transformedElemProps = elementProps;

    const _newElemId = newSchemaSourceDb.elements.insertElement({
      classFullName: "Test:TestElement",
      model: firstModelId,
      code: Code.createEmpty(),
      category: firstSpatialCategId,
      ...elementProps,
    } as PhysicalElementProps);

    const targetDbFileName = initOutputFile("EditSchemas.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFileName, {
      rootSubject: { name: `${newSchemaSourceDb.rootSubject.name}-EditSchemas` },
      ecefLocation: newSchemaSourceDb.ecefLocation,
    });

    const testSchemaPathUpgrade = initOutputFile("TestSchema-StructArrayClone.01.01.ecschema.xml");
    IModelJsFs.writeFileSync(testSchemaPathUpgrade, makeSchema("01.01"));
    await targetDb.importSchemas(requestContext, [testSchemaPathUpgrade]);

    await Transformer.transformAll(requestContext, newSchemaSourceDb, targetDb);

    async function getStructInstances(db: IModelDb): Promise<typeof elementProps | {}> {
      let result: any = [{}];
      db.withPreparedStatement("SELECT MyProp, MyArray FROM test.TestElement LIMIT 1", (stmtResult) => (result = stmtResult));
      return [...result][0];
    }

    assert.deepEqual(await getStructInstances(newSchemaSourceDb), elementProps);
    assert.deepEqual(await getStructInstances(targetDb), transformedElemProps);

    newSchemaSourceDb.close();
    targetDb.close();
  });

  it("should clone element structs values", async () => {
    const testSchemaPath = initOutputFile("TestSchema-Struct.ecschema.xml");
    IModelJsFs.writeFileSync(testSchemaPath, `<?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="Test" alias="test" version="01.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.1">
          <ECSchemaReference name="BisCore" version="01.00" alias="bis"/>
          <ECStructClass typeName="TestStruct">
            <ECProperty propertyName="MyStructProp" typeName="string"/>
          </ECStructClass >
          <ECEntityClass typeName="TestElement">
            <BaseClass>bis:PhysicalElement</BaseClass>
            <ECProperty propertyName="MyProp" typeName="string"/>
            <ECStructProperty propertyName="MyStruct" typeName="TestStruct" readOnly="false"/>
          </ECEntityClass>
      </ECSchema>`
    );

    const newSchemaSourceDbPath = initOutputFile("sourceDb-Struct.bim");
    IModelJsFs.copySync(sourceDbFileName, newSchemaSourceDbPath);
    const newSchemaSourceDb = SnapshotDb.createFrom(sourceDb, newSchemaSourceDbPath);

    const requestContext = new BackendRequestContext();

    await newSchemaSourceDb.importSchemas(requestContext, [testSchemaPath]);

    const [firstModelId] = newSchemaSourceDb.queryEntityIds({ from: PhysicalModel.classFullName, limit: 1 });
    assert.isString(firstModelId);
    const [firstSpatialCategId] = newSchemaSourceDb.queryEntityIds({ from: SpatialCategory.classFullName, limit: 1 });
    assert.isString(firstSpatialCategId);

    const elementProps = {
      myStruct: { myStructProp: "5" },
      myProp: "10",
    };

    const _newElemId = newSchemaSourceDb.elements.insertElement({
      classFullName: "Test:TestElement",
      model: firstModelId,
      code: Code.createEmpty(),
      category: firstSpatialCategId,
      ...elementProps,
    } as PhysicalElementProps);

    const targetDbFileName = initOutputFile("targetDb-Struct.bim");
    const targetDb = SnapshotDb.createEmpty(targetDbFileName, {
      rootSubject: { name: `${newSchemaSourceDb.rootSubject.name}-targetDb-Struct` },
      ecefLocation: newSchemaSourceDb.ecefLocation,
    });

    await Transformer.transformAll(requestContext, newSchemaSourceDb, targetDb);

    async function getStructValue(db: IModelDb): Promise<typeof elementProps | {}> {
      let result: any = [{}];
      db.withPreparedStatement("SELECT MyProp, MyStruct FROM test.TestElement LIMIT 1", (stmtResult) => (result = stmtResult));
      return [...result][0];
    }

    assert.deepEqual(await getStructValue(newSchemaSourceDb), elementProps);
    assert.deepEqual(await getStructValue(targetDb), elementProps);

    newSchemaSourceDb.close();
    targetDb.close();
  });
});
