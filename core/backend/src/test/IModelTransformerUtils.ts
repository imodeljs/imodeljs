/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import * as path from "path";
import { DbResult, Guid, GuidString, Id64, Id64Set, Id64String } from "@bentley/bentleyjs-core";
import { Schema } from "@bentley/ecschema-metadata";
import {
  Box, Cone, LineString3d, Point2d, Point3d, Range2d, Range3d, StandardViewIndex, Transform, Vector3d, YawPitchRollAngles,
} from "@bentley/geometry-core";
import {
  AuxCoordSystem2dProps, Base64EncodedString, BisCodeSpec, CategorySelectorProps, Code, CodeScopeSpec, CodeSpec, ColorDef, ElementAspectProps,
  ElementProps, ExternalSourceProps, FontProps, FontType, GeometricElement2dProps, GeometricElement3dProps, GeometryParams, GeometryPartProps,
  GeometryStreamBuilder, GeometryStreamIterator, GeometryStreamProps, ImageSourceFormat, IModel, ModelProps, ModelSelectorProps, PhysicalElementProps,
  Placement3d, PlanProjectionSettings, RelatedElement, RepositoryLinkProps, SkyBoxImageType, SpatialViewDefinitionProps, SubCategoryAppearance,
  SubCategoryOverride, SubjectProps,
} from "@bentley/imodeljs-common";
import { AuthorizedClientRequestContext } from "@bentley/itwin-client";
import {
  AuxCoordSystem, AuxCoordSystem2d, BackendRequestContext, CategorySelector, DefinitionModel, DefinitionPartition, DisplayStyle2d, DisplayStyle3d,
  DocumentListModel, Drawing, DrawingCategory, DrawingGraphic, DrawingGraphicRepresentsElement, DrawingModel, DrawingViewDefinition, ECSqlStatement,
  Element, ElementAspect, ElementMultiAspect, ElementOwnsChildElements, ElementOwnsMultiAspects, ElementOwnsUniqueAspect, ElementRefersToElements,
  ElementUniqueAspect, ExternalSource, ExternalSourceAspect, ExternalSourceIsInRepository, FunctionalModel, FunctionalSchema, GeometricElement3d,
  GeometryPart, GroupModel, IModelDb, IModelExporter, IModelExportHandler, IModelImporter, IModelJsFs, IModelTransformer, InformationPartitionElement,
  InformationRecordModel, LinkElement, Model, ModelSelector, OrthographicViewDefinition, PhysicalElement, PhysicalModel, PhysicalObject,
  PhysicalPartition, Platform, Relationship, RelationshipProps, RenderMaterialElement, RepositoryLink, SnapshotDb, SpatialCategory,
  SpatialLocationModel, SpatialViewDefinition, SubCategory, Subject, TemplateRecipe2d, TemplateRecipe3d, Texture, ViewDefinition,
} from "../imodeljs-backend";
import { KnownTestLocations } from "./KnownTestLocations";

/** IModelTransformer utilities shared by both standalone and integration tests. */
export namespace IModelTransformerUtils {

  const uniqueAspectGuid: GuidString = Guid.createValue();
  const federationGuid3: GuidString = Guid.createValue();

  export async function prepareSourceDb(sourceDb: IModelDb): Promise<void> {
    // Import desired schemas
    const requestContext = new BackendRequestContext();
    const sourceSchemaFileName: string = path.join(KnownTestLocations.assetsDir, "TestTransformerSource.ecschema.xml");
    await sourceDb.importSchemas(requestContext, [FunctionalSchema.schemaFilePath, sourceSchemaFileName]);
    FunctionalSchema.registerSchema();
  }

  export function populateSourceDb(sourceDb: IModelDb): void {
    // Embed font
    if (Platform.platformName.startsWith("win")) {
      sourceDb.embedFont({ id: 1, type: FontType.TrueType, name: "Arial" });
      assert.exists(sourceDb.fontMap.getFont("Arial"));
      assert.exists(sourceDb.fontMap.getFont(1));
    }
    // Initialize project extents
    const projectExtents = new Range3d(-1000, -1000, -1000, 1000, 1000, 1000);
    sourceDb.updateProjectExtents(projectExtents);
    // Insert CodeSpecs
    const codeSpecId1: Id64String = sourceDb.codeSpecs.insert("SourceCodeSpec", CodeScopeSpec.Type.Model);
    const codeSpecId2: Id64String = sourceDb.codeSpecs.insert("ExtraCodeSpec", CodeScopeSpec.Type.ParentElement);
    const codeSpecId3: Id64String = sourceDb.codeSpecs.insert("InformationRecords", CodeScopeSpec.Type.Model);
    assert.isTrue(Id64.isValidId64(codeSpecId1));
    assert.isTrue(Id64.isValidId64(codeSpecId2));
    assert.isTrue(Id64.isValidId64(codeSpecId3));
    // Insert RepositoryModel structure
    const subjectId = Subject.insert(sourceDb, IModel.rootSubjectId, "Subject", "Subject Description");
    assert.isTrue(Id64.isValidId64(subjectId));
    const sourceOnlySubjectId = Subject.insert(sourceDb, IModel.rootSubjectId, "Only in Source");
    assert.isTrue(Id64.isValidId64(sourceOnlySubjectId));
    const definitionModelId = DefinitionModel.insert(sourceDb, subjectId, "Definition");
    assert.isTrue(Id64.isValidId64(definitionModelId));
    const informationModelId = InformationRecordModel.insert(sourceDb, subjectId, "Information");
    assert.isTrue(Id64.isValidId64(informationModelId));
    const groupModelId = GroupModel.insert(sourceDb, subjectId, "Group");
    assert.isTrue(Id64.isValidId64(groupModelId));
    const physicalModelId = PhysicalModel.insert(sourceDb, subjectId, "Physical");
    assert.isTrue(Id64.isValidId64(physicalModelId));
    const spatialLocationModelId = SpatialLocationModel.insert(sourceDb, subjectId, "SpatialLocation", true);
    assert.isTrue(Id64.isValidId64(spatialLocationModelId));
    const functionalModelId = FunctionalModel.insert(sourceDb, subjectId, "Functional");
    assert.isTrue(Id64.isValidId64(functionalModelId));
    const documentListModelId = DocumentListModel.insert(sourceDb, subjectId, "Document");
    assert.isTrue(Id64.isValidId64(documentListModelId));
    const drawingId = Drawing.insert(sourceDb, documentListModelId, "Drawing");
    assert.isTrue(Id64.isValidId64(drawingId));
    // Insert DefinitionElements
    const modelSelectorId = ModelSelector.insert(sourceDb, definitionModelId, "SpatialModels", [physicalModelId, spatialLocationModelId]);
    assert.isTrue(Id64.isValidId64(modelSelectorId));
    const spatialCategoryId = insertSpatialCategory(sourceDb, definitionModelId, "SpatialCategory", ColorDef.green);
    assert.isTrue(Id64.isValidId64(spatialCategoryId));
    const sourcePhysicalCategoryId = insertSpatialCategory(sourceDb, definitionModelId, "SourcePhysicalCategory", ColorDef.blue);
    assert.isTrue(Id64.isValidId64(sourcePhysicalCategoryId));
    const subCategoryId = SubCategory.insert(sourceDb, spatialCategoryId, "SubCategory", { color: ColorDef.blue.toJSON() });
    assert.isTrue(Id64.isValidId64(subCategoryId));
    const filteredSubCategoryId = SubCategory.insert(sourceDb, spatialCategoryId, "FilteredSubCategory", { color: ColorDef.green.toJSON() });
    assert.isTrue(Id64.isValidId64(filteredSubCategoryId));
    const drawingCategoryId = DrawingCategory.insert(sourceDb, definitionModelId, "DrawingCategory", new SubCategoryAppearance());
    assert.isTrue(Id64.isValidId64(drawingCategoryId));
    const spatialCategorySelectorId = CategorySelector.insert(sourceDb, definitionModelId, "SpatialCategories", [spatialCategoryId, sourcePhysicalCategoryId]);
    assert.isTrue(Id64.isValidId64(spatialCategorySelectorId));
    const drawingCategorySelectorId = CategorySelector.insert(sourceDb, definitionModelId, "DrawingCategories", [drawingCategoryId]);
    assert.isTrue(Id64.isValidId64(drawingCategorySelectorId));
    const auxCoordSystemProps: AuxCoordSystem2dProps = {
      classFullName: AuxCoordSystem2d.classFullName,
      model: definitionModelId,
      code: AuxCoordSystem2d.createCode(sourceDb, definitionModelId, "AuxCoordSystem2d"),
    };
    const auxCoordSystemId = sourceDb.elements.insertElement(auxCoordSystemProps);
    assert.isTrue(Id64.isValidId64(auxCoordSystemId));
    const textureId = insertTextureElement(sourceDb, definitionModelId, "Texture");
    assert.isTrue(Id64.isValidId64(textureId));
    const renderMaterialId = RenderMaterialElement.insert(sourceDb, definitionModelId, "RenderMaterial", new RenderMaterialElement.Params("PaletteName"));
    assert.isTrue(Id64.isValidId64(renderMaterialId));
    const geometryPartProps: GeometryPartProps = {
      classFullName: GeometryPart.classFullName,
      model: definitionModelId,
      code: GeometryPart.createCode(sourceDb, definitionModelId, "GeometryPart"),
      geom: createBox(Point3d.create(3, 3, 3)),
    };
    const geometryPartId = sourceDb.elements.insertElement(geometryPartProps);
    assert.isTrue(Id64.isValidId64(geometryPartId));
    // Insert InformationRecords
    const informationRecordProps1: any = {
      classFullName: "TestTransformerSource:SourceInformationRecord",
      model: informationModelId,
      code: { spec: codeSpecId3, scope: informationModelId, value: "InformationRecord1" },
      commonString: "Common1",
      sourceString: "One",
    };
    const informationRecordId1: Id64String = sourceDb.elements.insertElement(informationRecordProps1);
    assert.isTrue(Id64.isValidId64(informationRecordId1));
    const informationRecordProps2: any = {
      classFullName: "TestTransformerSource:SourceInformationRecord",
      model: informationModelId,
      code: { spec: codeSpecId3, scope: informationModelId, value: "InformationRecord2" },
      commonString: "Common2",
      sourceString: "Two",
    };
    const informationRecordId2: Id64String = sourceDb.elements.insertElement(informationRecordProps2);
    assert.isTrue(Id64.isValidId64(informationRecordId2));
    const informationRecordProps3: any = {
      classFullName: "TestTransformerSource:SourceInformationRecord",
      model: informationModelId,
      code: { spec: codeSpecId3, scope: informationModelId, value: "InformationRecord3" },
      commonString: "Common3",
      sourceString: "Three",
    };
    const informationRecordId3: Id64String = sourceDb.elements.insertElement(informationRecordProps3);
    assert.isTrue(Id64.isValidId64(informationRecordId3));
    // Insert PhysicalObject1
    const physicalObjectProps1: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: physicalModelId,
      category: spatialCategoryId,
      code: Code.createEmpty(),
      userLabel: "PhysicalObject1",
      geom: createBox(Point3d.create(1, 1, 1), spatialCategoryId, subCategoryId, renderMaterialId, geometryPartId),
      placement: {
        origin: Point3d.create(1, 1, 1),
        angles: YawPitchRollAngles.createDegrees(0, 0, 0),
      },
    };
    const physicalObjectId1: Id64String = sourceDb.elements.insertElement(physicalObjectProps1);
    assert.isTrue(Id64.isValidId64(physicalObjectId1));
    // Insert PhysicalObject1 children
    const childObjectProps1A: PhysicalElementProps = physicalObjectProps1;
    childObjectProps1A.userLabel = "ChildObject1A";
    childObjectProps1A.parent = new ElementOwnsChildElements(physicalObjectId1);
    childObjectProps1A.placement!.origin = Point3d.create(0, 1, 1);
    const childObjectId1A: Id64String = sourceDb.elements.insertElement(childObjectProps1A);
    assert.isTrue(Id64.isValidId64(childObjectId1A));
    const childObjectProps1B: PhysicalElementProps = childObjectProps1A;
    childObjectProps1B.userLabel = "ChildObject1B";
    childObjectProps1B.placement!.origin = Point3d.create(1, 0, 1);
    const childObjectId1B: Id64String = sourceDb.elements.insertElement(childObjectProps1B);
    assert.isTrue(Id64.isValidId64(childObjectId1B));
    // Insert PhysicalObject2
    const physicalObjectProps2: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: physicalModelId,
      category: sourcePhysicalCategoryId,
      code: Code.createEmpty(),
      userLabel: "PhysicalObject2",
      geom: createBox(Point3d.create(2, 2, 2)),
      placement: {
        origin: Point3d.create(2, 2, 2),
        angles: YawPitchRollAngles.createDegrees(0, 0, 0),
      },
    };
    const physicalObjectId2: Id64String = sourceDb.elements.insertElement(physicalObjectProps2);
    assert.isTrue(Id64.isValidId64(physicalObjectId2));
    // Insert PhysicalObject3
    const physicalObjectProps3: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: physicalModelId,
      category: sourcePhysicalCategoryId,
      code: Code.createEmpty(),
      federationGuid: federationGuid3,
      userLabel: "PhysicalObject3",
    };
    const physicalObjectId3: Id64String = sourceDb.elements.insertElement(physicalObjectProps3);
    assert.isTrue(Id64.isValidId64(physicalObjectId3));
    // Insert PhysicalObject4
    const physicalObjectProps4: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: physicalModelId,
      category: spatialCategoryId,
      code: Code.createEmpty(),
      userLabel: "PhysicalObject4",
      geom: createBoxes([subCategoryId, filteredSubCategoryId]),
      placement: {
        origin: Point3d.create(4, 4, 4),
        angles: YawPitchRollAngles.createDegrees(0, 0, 0),
      },
    };
    const physicalObjectId4: Id64String = sourceDb.elements.insertElement(physicalObjectProps4);
    assert.isTrue(Id64.isValidId64(physicalObjectId4));
    // Insert PhysicalElement1
    const sourcePhysicalElementProps: PhysicalElementProps = {
      classFullName: "TestTransformerSource:SourcePhysicalElement",
      model: physicalModelId,
      category: sourcePhysicalCategoryId,
      code: Code.createEmpty(),
      userLabel: "PhysicalElement1",
      geom: createBox(Point3d.create(2, 2, 2)),
      placement: {
        origin: Point3d.create(4, 4, 4),
        angles: YawPitchRollAngles.createDegrees(0, 0, 0),
      },
      sourceString: "S1",
      sourceDouble: 1.1,
      sourceNavigation: { id: sourcePhysicalCategoryId, relClassName: "TestTransformerSource:SourcePhysicalElementUsesSourceDefinition" },
      commonNavigation: { id: sourcePhysicalCategoryId },
      commonString: "Common",
      commonDouble: 7.3,
      sourceBinary: new Uint8Array([1, 3, 5, 7]),
      commonBinary: Base64EncodedString.fromUint8Array(new Uint8Array([2, 4, 6, 8])),
      extraString: "Extra",
    } as PhysicalElementProps;
    const sourcePhysicalElementId: Id64String = sourceDb.elements.insertElement(sourcePhysicalElementProps);
    assert.isTrue(Id64.isValidId64(sourcePhysicalElementId));
    assert.doesNotThrow(() => sourceDb.elements.getElement(sourcePhysicalElementId));
    // Insert ElementAspects
    sourceDb.elements.insertAspect({
      classFullName: "TestTransformerSource:SourceUniqueAspect",
      element: new ElementOwnsUniqueAspect(physicalObjectId1),
      commonDouble: 1.1,
      commonString: "Unique",
      commonLong: physicalObjectId1,
      commonBinary: Base64EncodedString.fromUint8Array(new Uint8Array([2, 4, 6, 8])),
      sourceDouble: 11.1,
      sourceString: "UniqueAspect",
      sourceLong: physicalObjectId1,
      sourceGuid: uniqueAspectGuid,
      extraString: "Extra",
    } as ElementAspectProps);
    const sourceUniqueAspect: ElementUniqueAspect = sourceDb.elements.getAspects(physicalObjectId1, "TestTransformerSource:SourceUniqueAspect")[0];
    assert.equal(sourceUniqueAspect.asAny.commonDouble, 1.1);
    assert.equal(sourceUniqueAspect.asAny.commonString, "Unique");
    assert.equal(sourceUniqueAspect.asAny.commonLong, physicalObjectId1);
    assert.equal(sourceUniqueAspect.asAny.sourceDouble, 11.1);
    assert.equal(sourceUniqueAspect.asAny.sourceString, "UniqueAspect");
    assert.equal(sourceUniqueAspect.asAny.sourceLong, physicalObjectId1);
    assert.equal(sourceUniqueAspect.asAny.sourceGuid, uniqueAspectGuid);
    assert.equal(sourceUniqueAspect.asAny.extraString, "Extra");
    sourceDb.elements.insertAspect({
      classFullName: "TestTransformerSource:SourceMultiAspect",
      element: new ElementOwnsMultiAspects(physicalObjectId1),
      commonDouble: 2.2,
      commonString: "Multi",
      commonLong: physicalObjectId1,
      sourceDouble: 22.2,
      sourceString: "MultiAspect",
      sourceLong: physicalObjectId1,
      sourceGuid: Guid.createValue(),
      extraString: "Extra",
    } as ElementAspectProps);
    sourceDb.elements.insertAspect({
      classFullName: "TestTransformerSource:SourceMultiAspect",
      element: new ElementOwnsMultiAspects(physicalObjectId1),
      commonDouble: 3.3,
      commonString: "Multi",
      commonLong: physicalObjectId1,
      sourceDouble: 33.3,
      sourceString: "MultiAspect",
      sourceLong: physicalObjectId1,
      sourceGuid: Guid.createValue(),
      extraString: "Extra",
    } as ElementAspectProps);
    sourceDb.elements.insertAspect({
      classFullName: "TestTransformerSource:SourceUniqueAspectToExclude",
      element: new ElementOwnsUniqueAspect(physicalObjectId1),
      description: "SourceUniqueAspect1",
    } as ElementAspectProps);
    sourceDb.elements.insertAspect({
      classFullName: "TestTransformerSource:SourceMultiAspectToExclude",
      element: new ElementOwnsMultiAspects(physicalObjectId1),
      description: "SourceMultiAspect1",
    } as ElementAspectProps);
    // Insert DrawingGraphics
    const drawingGraphicProps1: GeometricElement2dProps = {
      classFullName: DrawingGraphic.classFullName,
      model: drawingId,
      category: drawingCategoryId,
      code: Code.createEmpty(),
      userLabel: "DrawingGraphic1",
      geom: createRectangle(Point2d.create(1, 1)),
      placement: { origin: Point2d.create(2, 2), angle: 0 },
    };
    const drawingGraphicId1: Id64String = sourceDb.elements.insertElement(drawingGraphicProps1);
    assert.isTrue(Id64.isValidId64(drawingGraphicId1));
    const drawingGraphicRepresentsId1: Id64String = DrawingGraphicRepresentsElement.insert(sourceDb, drawingGraphicId1, physicalObjectId1);
    assert.isTrue(Id64.isValidId64(drawingGraphicRepresentsId1));
    const drawingGraphicProps2: GeometricElement2dProps = {
      classFullName: DrawingGraphic.classFullName,
      model: drawingId,
      category: drawingCategoryId,
      code: Code.createEmpty(),
      userLabel: "DrawingGraphic2",
      geom: createRectangle(Point2d.create(1, 1)),
      placement: { origin: Point2d.create(3, 3), angle: 0 },
    };
    const drawingGraphicId2: Id64String = sourceDb.elements.insertElement(drawingGraphicProps2);
    assert.isTrue(Id64.isValidId64(drawingGraphicId2));
    const drawingGraphicRepresentsId2: Id64String = DrawingGraphicRepresentsElement.insert(sourceDb, drawingGraphicId2, physicalObjectId1);
    assert.isTrue(Id64.isValidId64(drawingGraphicRepresentsId2));
    // Insert DisplayStyles
    const displayStyle2dId: Id64String = DisplayStyle2d.insert(sourceDb, definitionModelId, "DisplayStyle2d");
    assert.isTrue(Id64.isValidId64(displayStyle2dId));
    const displayStyle3d: DisplayStyle3d = DisplayStyle3d.create(sourceDb, definitionModelId, "DisplayStyle3d");
    const subCategoryOverride: SubCategoryOverride = SubCategoryOverride.fromJSON({ color: ColorDef.from(1, 2, 3).toJSON() });
    displayStyle3d.settings.overrideSubCategory(subCategoryId, subCategoryOverride);
    displayStyle3d.settings.addExcludedElements(physicalObjectId1);
    displayStyle3d.settings.setPlanProjectionSettings(spatialLocationModelId, new PlanProjectionSettings({ elevation: 10.0 }));
    displayStyle3d.settings.environment = {
      sky: {
        image: {
          type: SkyBoxImageType.Spherical,
          texture: textureId,
        },
      },
    };
    const displayStyle3dId: Id64String = displayStyle3d.insert();
    assert.isTrue(Id64.isValidId64(displayStyle3dId));
    // Insert ViewDefinitions
    const viewId = OrthographicViewDefinition.insert(sourceDb, definitionModelId, "Orthographic View", modelSelectorId, spatialCategorySelectorId, displayStyle3dId, projectExtents, StandardViewIndex.Iso);
    assert.isTrue(Id64.isValidId64(viewId));
    sourceDb.views.setDefaultViewId(viewId);
    const drawingViewRange = new Range2d(0, 0, 100, 100);
    const drawingViewId = DrawingViewDefinition.insert(sourceDb, definitionModelId, "Drawing View", drawingId, drawingCategorySelectorId, displayStyle2dId, drawingViewRange);
    assert.isTrue(Id64.isValidId64(drawingViewId));
    // Insert instance of SourceRelToExclude to test relationship exclusion by class
    const relationship1: Relationship = sourceDb.relationships.createInstance({
      classFullName: "TestTransformerSource:SourceRelToExclude",
      sourceId: spatialCategorySelectorId,
      targetId: drawingCategorySelectorId,
    });
    const relationshipId1: Id64String = sourceDb.relationships.insertInstance(relationship1);
    assert.isTrue(Id64.isValidId64(relationshipId1));
    // Insert instance of RelWithProps to test relationship property remapping
    const relationship2: Relationship = sourceDb.relationships.createInstance({
      classFullName: "TestTransformerSource:SourceRelWithProps",
      sourceId: spatialCategorySelectorId,
      targetId: drawingCategorySelectorId,
      sourceString: "One",
      sourceDouble: 1.1,
      sourceLong: spatialCategoryId,
      sourceGuid: Guid.createValue(),
    } as any);
    const relationshipId2: Id64String = sourceDb.relationships.insertInstance(relationship2);
    assert.isTrue(Id64.isValidId64(relationshipId2));
  }

  export function updateSourceDb(sourceDb: IModelDb): void {
    // Update Subject element
    const subjectId = sourceDb.elements.queryElementIdByCode(Subject.createCode(sourceDb, IModel.rootSubjectId, "Subject"))!;
    assert.isTrue(Id64.isValidId64(subjectId));
    const subject: Subject = sourceDb.elements.getElement<Subject>(subjectId);
    subject.description = "Subject description (Updated)";
    sourceDb.elements.updateElement(subject);
    // Update spatialCategory element
    const definitionModelId = sourceDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(sourceDb, subjectId, "Definition"))!;
    assert.isTrue(Id64.isValidId64(definitionModelId));
    const spatialCategoryId = sourceDb.elements.queryElementIdByCode(SpatialCategory.createCode(sourceDb, definitionModelId, "SpatialCategory"))!;
    assert.isTrue(Id64.isValidId64(spatialCategoryId));
    const spatialCategory: SpatialCategory = sourceDb.elements.getElement<SpatialCategory>(spatialCategoryId);
    spatialCategory.federationGuid = Guid.createValue();
    sourceDb.elements.updateElement(spatialCategory);
    // Update relationship properties
    const spatialCategorySelectorId = sourceDb.elements.queryElementIdByCode(CategorySelector.createCode(sourceDb, definitionModelId, "SpatialCategories"))!;
    assert.isTrue(Id64.isValidId64(spatialCategorySelectorId));
    const drawingCategorySelectorId = sourceDb.elements.queryElementIdByCode(CategorySelector.createCode(sourceDb, definitionModelId, "DrawingCategories"))!;
    assert.isTrue(Id64.isValidId64(drawingCategorySelectorId));
    const relWithProps: any = sourceDb.relationships.getInstanceProps(
      "TestTransformerSource:SourceRelWithProps",
      { sourceId: spatialCategorySelectorId, targetId: drawingCategorySelectorId },
    );
    assert.equal(relWithProps.sourceString, "One");
    assert.equal(relWithProps.sourceDouble, 1.1);
    relWithProps.sourceString += "-Updated";
    relWithProps.sourceDouble = 1.2;
    sourceDb.relationships.updateInstance(relWithProps);
    // Update ElementAspect properties
    const physicalObjectId1: Id64String = queryByUserLabel(sourceDb, "PhysicalObject1");
    const sourceUniqueAspects: ElementAspect[] = sourceDb.elements.getAspects(physicalObjectId1, "TestTransformerSource:SourceUniqueAspect");
    assert.equal(sourceUniqueAspects.length, 1);
    sourceUniqueAspects[0].asAny.commonString += "-Updated";
    sourceUniqueAspects[0].asAny.sourceString += "-Updated";
    sourceDb.elements.updateAspect(sourceUniqueAspects[0]);
    const sourceMultiAspects: ElementAspect[] = sourceDb.elements.getAspects(physicalObjectId1, "TestTransformerSource:SourceMultiAspect");
    assert.equal(sourceMultiAspects.length, 2);
    sourceMultiAspects[1].asAny.commonString += "-Updated";
    sourceMultiAspects[1].asAny.sourceString += "-Updated";
    sourceDb.elements.updateAspect(sourceMultiAspects[1]);
    // clear NavigationProperty of PhysicalElement1
    const physicalElementId1: Id64String = queryByUserLabel(sourceDb, "PhysicalElement1");
    let physicalElement1: PhysicalElement = sourceDb.elements.getElement(physicalElementId1);
    physicalElement1.asAny.commonNavigation = RelatedElement.none;
    physicalElement1.update();
    physicalElement1 = sourceDb.elements.getElement(physicalElementId1);
    assert.isUndefined(physicalElement1.asAny.commonNavigation);
    // delete PhysicalObject3
    const physicalObjectId3: Id64String = queryByUserLabel(sourceDb, "PhysicalObject3");
    assert.isTrue(Id64.isValidId64(physicalObjectId3));
    sourceDb.elements.deleteElement(physicalObjectId3);
    assert.equal(Id64.invalid, queryByUserLabel(sourceDb, "PhysicalObject3"));
    // Insert PhysicalObject5
    const physicalObjectProps5: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: physicalElement1.model,
      category: spatialCategoryId,
      code: Code.createEmpty(),
      userLabel: "PhysicalObject5",
      geom: createBox(Point3d.create(1, 1, 1)),
      placement: {
        origin: Point3d.create(5, 5, 5),
        angles: YawPitchRollAngles.createDegrees(0, 0, 0),
      },
    };
    const physicalObjectId5: Id64String = sourceDb.elements.insertElement(physicalObjectProps5);
    assert.isTrue(Id64.isValidId64(physicalObjectId5));
    // delete relationship
    const drawingGraphicId1: Id64String = queryByUserLabel(sourceDb, "DrawingGraphic1");
    const drawingGraphicId2: Id64String = queryByUserLabel(sourceDb, "DrawingGraphic2");
    const relationship: Relationship = sourceDb.relationships.getInstance(DrawingGraphicRepresentsElement.classFullName, { sourceId: drawingGraphicId2, targetId: physicalObjectId1 });
    relationship.delete();
    // insert relationships
    DrawingGraphicRepresentsElement.insert(sourceDb, drawingGraphicId1, physicalObjectId5);
    DrawingGraphicRepresentsElement.insert(sourceDb, drawingGraphicId2, physicalObjectId5);
    // update InformationRecord2
    const informationRecordCodeSpec: CodeSpec = sourceDb.codeSpecs.getByName("InformationRecords");
    const informationModelId = sourceDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(sourceDb, subjectId, "Information"))!;
    const informationRecodeCode2: Code = new Code({ spec: informationRecordCodeSpec.id, scope: informationModelId, value: "InformationRecord2" });
    const informationRecordId2: Id64String = sourceDb.elements.queryElementIdByCode(informationRecodeCode2)!;
    assert.isTrue(Id64.isValidId64(informationRecordId2));
    const informationRecord2: any = sourceDb.elements.getElement(informationRecordId2);
    informationRecord2.commonString = `${informationRecord2.commonString}-Updated`;
    informationRecord2.sourceString = `${informationRecord2.sourceString}-Updated`;
    informationRecord2.update();
    // delete InformationRecord3
    const informationRecodeCode3: Code = new Code({ spec: informationRecordCodeSpec.id, scope: informationModelId, value: "InformationRecord3" });
    const informationRecordId3: Id64String = sourceDb.elements.queryElementIdByCode(informationRecodeCode3)!;
    assert.isTrue(Id64.isValidId64(informationRecordId3));
    sourceDb.elements.deleteElement(informationRecordId3);
  }

  export async function prepareTargetDb(targetDb: IModelDb): Promise<void> {
    // Import desired target schemas
    const requestContext = new BackendRequestContext();
    const targetSchemaFileName: string = path.join(KnownTestLocations.assetsDir, "TestTransformerTarget.ecschema.xml");
    await targetDb.importSchemas(requestContext, [targetSchemaFileName]);
    // Insert a target-only CodeSpec to test remapping
    const targetCodeSpecId: Id64String = targetDb.codeSpecs.insert("TargetCodeSpec", CodeScopeSpec.Type.Model);
    assert.isTrue(Id64.isValidId64(targetCodeSpecId));
    // Insert some elements to avoid getting same IDs for sourceDb and targetDb
    const subjectId = Subject.insert(targetDb, IModel.rootSubjectId, "Only in Target");
    Subject.insert(targetDb, subjectId, "S1");
    Subject.insert(targetDb, subjectId, "S2");
    Subject.insert(targetDb, subjectId, "S3");
    Subject.insert(targetDb, subjectId, "S4");
    const targetPhysicalCategoryId = insertSpatialCategory(targetDb, IModel.dictionaryId, "TargetPhysicalCategory", ColorDef.red);
    assert.isTrue(Id64.isValidId64(targetPhysicalCategoryId));
  }

  export function assertTargetDbContents(sourceDb: IModelDb, targetDb: IModelDb, targetSubjectName: string = "Subject"): void {
    // CodeSpec
    assert.isTrue(targetDb.codeSpecs.hasName("TargetCodeSpec"));
    assert.isTrue(targetDb.codeSpecs.hasName("InformationRecords"));
    assert.isFalse(targetDb.codeSpecs.hasName("SourceCodeSpec"));
    assert.isFalse(targetDb.codeSpecs.hasName("ExtraCodeSpec"));
    // Font
    if (Platform.platformName.startsWith("win")) {
      assert.exists(targetDb.fontMap.getFont("Arial"));
    }
    // Subject
    const subjectId: Id64String = targetDb.elements.queryElementIdByCode(Subject.createCode(targetDb, IModel.rootSubjectId, targetSubjectName))!;
    assert.isTrue(Id64.isValidId64(subjectId));
    const subjectProps: SubjectProps = targetDb.elements.getElementProps(subjectId);
    assert.equal(subjectProps.description, `${targetSubjectName} Description`);
    const sourceOnlySubjectId = targetDb.elements.queryElementIdByCode(Subject.createCode(targetDb, IModel.rootSubjectId, "Only in Source"));
    assert.equal(undefined, sourceOnlySubjectId);
    const targetOnlySubjectId = targetDb.elements.queryElementIdByCode(Subject.createCode(targetDb, IModel.rootSubjectId, "Only in Target"))!;
    assert.isTrue(Id64.isValidId64(targetOnlySubjectId));
    // Partitions / Models
    const definitionModelId = targetDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(targetDb, subjectId, "Definition"))!;
    const informationModelId = targetDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(targetDb, subjectId, "Information"))!;
    const groupModelId = targetDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(targetDb, subjectId, "Group"))!;
    const physicalModelId = targetDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(targetDb, subjectId, "Physical"))!;
    const spatialLocationModelId = targetDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(targetDb, subjectId, "SpatialLocation"))!;
    const documentListModelId = targetDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(targetDb, subjectId, "Document"))!;
    assertTargetElement(sourceDb, targetDb, definitionModelId);
    assertTargetElement(sourceDb, targetDb, informationModelId);
    assertTargetElement(sourceDb, targetDb, groupModelId);
    assertTargetElement(sourceDb, targetDb, physicalModelId);
    assertTargetElement(sourceDb, targetDb, spatialLocationModelId);
    assertTargetElement(sourceDb, targetDb, documentListModelId);
    const physicalModel: PhysicalModel = targetDb.models.getModel<PhysicalModel>(physicalModelId);
    const spatialLocationModel: SpatialLocationModel = targetDb.models.getModel<SpatialLocationModel>(spatialLocationModelId);
    assert.isFalse(physicalModel.isPlanProjection);
    assert.isTrue(spatialLocationModel.isPlanProjection);
    // SpatialCategory
    const spatialCategoryId = targetDb.elements.queryElementIdByCode(SpatialCategory.createCode(targetDb, definitionModelId, "SpatialCategory"))!;
    assertTargetElement(sourceDb, targetDb, spatialCategoryId);
    const spatialCategoryProps = targetDb.elements.getElementProps(spatialCategoryId);
    assert.equal(definitionModelId, spatialCategoryProps.model);
    assert.equal(definitionModelId, spatialCategoryProps.code.scope);
    assert.equal(undefined, targetDb.elements.queryElementIdByCode(SpatialCategory.createCode(targetDb, definitionModelId, "SourcePhysicalCategory")), "Should have been remapped");
    const targetPhysicalCategoryId = targetDb.elements.queryElementIdByCode(SpatialCategory.createCode(targetDb, IModel.dictionaryId, "TargetPhysicalCategory"))!;
    assert.isTrue(Id64.isValidId64(targetPhysicalCategoryId));
    // SubCategory
    const subCategoryId = targetDb.elements.queryElementIdByCode(SubCategory.createCode(targetDb, spatialCategoryId, "SubCategory"))!;
    assertTargetElement(sourceDb, targetDb, subCategoryId);
    const filteredSubCategoryId = targetDb.elements.queryElementIdByCode(SubCategory.createCode(targetDb, spatialCategoryId, "FilteredSubCategory"));
    assert.isUndefined(filteredSubCategoryId);
    // DrawingCategory
    const drawingCategoryId = targetDb.elements.queryElementIdByCode(DrawingCategory.createCode(targetDb, definitionModelId, "DrawingCategory"))!;
    assertTargetElement(sourceDb, targetDb, drawingCategoryId);
    const drawingCategoryProps = targetDb.elements.getElementProps(drawingCategoryId);
    assert.equal(definitionModelId, drawingCategoryProps.model);
    assert.equal(definitionModelId, drawingCategoryProps.code.scope);
    // Spatial CategorySelector
    const spatialCategorySelectorId = targetDb.elements.queryElementIdByCode(CategorySelector.createCode(targetDb, definitionModelId, "SpatialCategories"))!;
    assertTargetElement(sourceDb, targetDb, spatialCategorySelectorId);
    const spatialCategorySelectorProps = targetDb.elements.getElementProps<CategorySelectorProps>(spatialCategorySelectorId);
    assert.isTrue(spatialCategorySelectorProps.categories.includes(spatialCategoryId));
    assert.isTrue(spatialCategorySelectorProps.categories.includes(targetPhysicalCategoryId), "SourcePhysicalCategory should have been remapped to TargetPhysicalCategory");
    // Drawing CategorySelector
    const drawingCategorySelectorId = targetDb.elements.queryElementIdByCode(CategorySelector.createCode(targetDb, definitionModelId, "DrawingCategories"))!;
    assertTargetElement(sourceDb, targetDb, drawingCategorySelectorId);
    const drawingCategorySelectorProps = targetDb.elements.getElementProps<CategorySelectorProps>(drawingCategorySelectorId);
    assert.isTrue(drawingCategorySelectorProps.categories.includes(drawingCategoryId));
    // ModelSelector
    const modelSelectorId = targetDb.elements.queryElementIdByCode(ModelSelector.createCode(targetDb, definitionModelId, "SpatialModels"))!;
    assertTargetElement(sourceDb, targetDb, modelSelectorId);
    const modelSelectorProps = targetDb.elements.getElementProps<ModelSelectorProps>(modelSelectorId);
    assert.isTrue(modelSelectorProps.models.includes(physicalModelId));
    assert.isTrue(modelSelectorProps.models.includes(spatialLocationModelId));
    // Texture
    const textureId = targetDb.elements.queryElementIdByCode(Texture.createCode(targetDb, definitionModelId, "Texture"))!;
    assert.isTrue(Id64.isValidId64(textureId));
    // RenderMaterial
    const renderMaterialId = targetDb.elements.queryElementIdByCode(RenderMaterialElement.createCode(targetDb, definitionModelId, "RenderMaterial"))!;
    assert.isTrue(Id64.isValidId64(renderMaterialId));
    // GeometryPart
    const geometryPartId = targetDb.elements.queryElementIdByCode(GeometryPart.createCode(targetDb, definitionModelId, "GeometryPart"))!;
    assert.isTrue(Id64.isValidId64(geometryPartId));
    // PhysicalElement
    const physicalObjectId1: Id64String = queryByUserLabel(targetDb, "PhysicalObject1");
    const physicalObjectId2: Id64String = queryByUserLabel(targetDb, "PhysicalObject2");
    const physicalObjectId3: Id64String = queryByUserLabel(targetDb, "PhysicalObject3");
    const physicalObjectId4: Id64String = queryByUserLabel(targetDb, "PhysicalObject4");
    const physicalElementId1: Id64String = queryByUserLabel(targetDb, "PhysicalElement1");
    const childObjectId1A: Id64String = queryByUserLabel(targetDb, "ChildObject1A");
    const childObjectId1B: Id64String = queryByUserLabel(targetDb, "ChildObject1B");
    assertTargetElement(sourceDb, targetDb, physicalObjectId1);
    assertTargetElement(sourceDb, targetDb, physicalObjectId2);
    assertTargetElement(sourceDb, targetDb, physicalObjectId3);
    assertTargetElement(sourceDb, targetDb, physicalObjectId4);
    assertTargetElement(sourceDb, targetDb, physicalElementId1);
    assertTargetElement(sourceDb, targetDb, childObjectId1A);
    assertTargetElement(sourceDb, targetDb, childObjectId1B);
    const physicalObject1: PhysicalObject = targetDb.elements.getElement<PhysicalObject>({ id: physicalObjectId1, wantGeometry: true });
    const physicalObject2: PhysicalObject = targetDb.elements.getElement<PhysicalObject>(physicalObjectId2);
    const physicalObject3: PhysicalObject = targetDb.elements.getElement<PhysicalObject>(physicalObjectId3);
    const physicalObject4: PhysicalObject = targetDb.elements.getElement<PhysicalObject>({ id: physicalObjectId4, wantGeometry: true });
    const physicalElement1: PhysicalElement = targetDb.elements.getElement<PhysicalElement>(physicalElementId1);
    const childObject1A: PhysicalObject = targetDb.elements.getElement<PhysicalObject>(childObjectId1A);
    const childObject1B: PhysicalObject = targetDb.elements.getElement<PhysicalObject>(childObjectId1B);
    assert.equal(physicalObject1.category, spatialCategoryId, "SpatialCategory should have been imported");
    assert.isDefined(physicalObject1.geom);
    let index1 = 0;
    for (const entry of new GeometryStreamIterator(physicalObject1.geom!)) {
      if (0 === index1) {
        assert.equal(entry.primitive.type, "geometryQuery");
        assert.equal(entry.geomParams.subCategoryId, subCategoryId);
        assert.equal(entry.geomParams.materialId, renderMaterialId);
      } else if (1 === index1) {
        assert.equal(entry.primitive.type, "partReference");
        assert.equal(entry.geomParams.subCategoryId, subCategoryId);
        assert.equal(entry.geomParams.materialId, renderMaterialId);
        if (entry.primitive.type === "partReference")
          assert.equal(entry.primitive.part.id, geometryPartId);
      } else {
        assert.fail(undefined, undefined, "Only expected 2 entries");
      }
      index1++;
    }
    assert.equal(physicalObject2.category, targetPhysicalCategoryId, "SourcePhysicalCategory should have been remapped to TargetPhysicalCategory");
    assert.equal(physicalObject3.federationGuid, federationGuid3, "Source FederationGuid should have been transferred to target element");
    assert.equal(physicalObject4.category, spatialCategoryId);
    let index4 = 0;
    for (const entry of new GeometryStreamIterator(physicalObject4.geom!)) {
      assert.equal(entry.primitive.type, "geometryQuery");
      if (0 === index4) {
        assert.notEqual(entry.geomParams.subCategoryId, subCategoryId, "Expect the default SubCategory");
      } else if (1 === index4) {
        assert.equal(entry.geomParams.subCategoryId, subCategoryId);
      }
      index4++;
    }
    assert.equal(index4, 2, "Expect 2 remaining boxes since 1 was filtered out");
    assert.equal(physicalElement1.category, targetPhysicalCategoryId, "SourcePhysicalCategory should have been remapped to TargetPhysicalCategory");
    assert.equal(physicalElement1.classFullName, "TestTransformerTarget:TargetPhysicalElement", "Class should have been remapped");
    assert.equal(physicalElement1.asAny.targetString, "S1", "Property should have been remapped by onTransformElement override");
    assert.equal(physicalElement1.asAny.targetDouble, 1.1, "Property should have been remapped by onTransformElement override");
    assert.equal(physicalElement1.asAny.targetNavigation.id, targetPhysicalCategoryId, "Property should have been remapped by onTransformElement override");
    assert.equal(physicalElement1.asAny.commonNavigation.id, targetPhysicalCategoryId, "Property should have been automatically remapped (same name)");
    assert.equal(physicalElement1.asAny.commonString, "Common", "Property should have been automatically remapped (same name)");
    assert.equal(physicalElement1.asAny.commonDouble, 7.3, "Property should have been automatically remapped (same name)");
    assert.equal(Base64EncodedString.fromUint8Array(physicalElement1.asAny.targetBinary), Base64EncodedString.fromUint8Array(new Uint8Array([1, 3, 5, 7])), "Property should have been remapped by onTransformElement override");
    assert.equal(Base64EncodedString.fromUint8Array(physicalElement1.asAny.commonBinary), Base64EncodedString.fromUint8Array(new Uint8Array([2, 4, 6, 8])), "Property should have been automatically remapped (same name)");
    assert.notExists(physicalElement1.asAny.extraString, "Property should have been dropped during transformation");
    assert.equal(childObject1A.parent!.id, physicalObjectId1);
    assert.equal(childObject1B.parent!.id, physicalObjectId1);
    // ElementUniqueAspects
    const targetUniqueAspects: ElementAspect[] = targetDb.elements.getAspects(physicalObjectId1, "TestTransformerTarget:TargetUniqueAspect");
    assert.equal(targetUniqueAspects.length, 1);
    assert.equal(targetUniqueAspects[0].asAny.commonDouble, 1.1);
    assert.equal(targetUniqueAspects[0].asAny.commonString, "Unique");
    assert.equal(targetUniqueAspects[0].asAny.commonLong, physicalObjectId1, "Id should have been remapped");
    assert.equal(Base64EncodedString.fromUint8Array(targetUniqueAspects[0].asAny.commonBinary), Base64EncodedString.fromUint8Array(new Uint8Array([2, 4, 6, 8])));
    assert.equal(targetUniqueAspects[0].asAny.targetDouble, 11.1);
    assert.equal(targetUniqueAspects[0].asAny.targetString, "UniqueAspect");
    assert.equal(targetUniqueAspects[0].asAny.targetLong, physicalObjectId1, "Id should have been remapped");
    assert.isTrue(Guid.isV4Guid(targetUniqueAspects[0].asAny.targetGuid));
    assert.equal(uniqueAspectGuid, targetUniqueAspects[0].asAny.targetGuid);
    // ElementMultiAspects
    const targetMultiAspects: ElementAspect[] = targetDb.elements.getAspects(physicalObjectId1, "TestTransformerTarget:TargetMultiAspect");
    assert.equal(targetMultiAspects.length, 2);
    assert.equal(targetMultiAspects[0].asAny.commonDouble, 2.2);
    assert.equal(targetMultiAspects[0].asAny.commonString, "Multi");
    assert.equal(targetMultiAspects[0].asAny.commonLong, physicalObjectId1, "Id should have been remapped");
    assert.equal(targetMultiAspects[0].asAny.targetDouble, 22.2);
    assert.equal(targetMultiAspects[0].asAny.targetString, "MultiAspect");
    assert.equal(targetMultiAspects[0].asAny.targetLong, physicalObjectId1, "Id should have been remapped");
    assert.isTrue(Guid.isV4Guid(targetMultiAspects[0].asAny.targetGuid));
    assert.equal(targetMultiAspects[1].asAny.commonDouble, 3.3);
    assert.equal(targetMultiAspects[1].asAny.commonString, "Multi");
    assert.equal(targetMultiAspects[1].asAny.commonLong, physicalObjectId1, "Id should have been remapped");
    assert.equal(targetMultiAspects[1].asAny.targetDouble, 33.3);
    assert.equal(targetMultiAspects[1].asAny.targetString, "MultiAspect");
    assert.equal(targetMultiAspects[1].asAny.targetLong, physicalObjectId1, "Id should have been remapped");
    assert.isTrue(Guid.isV4Guid(targetMultiAspects[1].asAny.targetGuid));
    // InformationRecords
    const informationRecordCodeSpec: CodeSpec = targetDb.codeSpecs.getByName("InformationRecords");
    assert.isTrue(Id64.isValidId64(informationRecordCodeSpec.id));
    const informationRecordId1 = targetDb.elements.queryElementIdByCode(new Code({ spec: informationRecordCodeSpec.id, scope: informationModelId, value: "InformationRecord1" }));
    const informationRecordId2 = targetDb.elements.queryElementIdByCode(new Code({ spec: informationRecordCodeSpec.id, scope: informationModelId, value: "InformationRecord2" }));
    const informationRecordId3 = targetDb.elements.queryElementIdByCode(new Code({ spec: informationRecordCodeSpec.id, scope: informationModelId, value: "InformationRecord3" }));
    assert.isTrue(Id64.isValidId64(informationRecordId1!));
    assert.isTrue(Id64.isValidId64(informationRecordId2!));
    assert.isTrue(Id64.isValidId64(informationRecordId3!));
    const informationRecord2: any = targetDb.elements.getElement(informationRecordId2!);
    assert.equal(informationRecord2.commonString, "Common2");
    assert.equal(informationRecord2.targetString, "Two");
    // DisplayStyle
    const displayStyle3dId = targetDb.elements.queryElementIdByCode(DisplayStyle3d.createCode(targetDb, definitionModelId, "DisplayStyle3d"))!;
    assertTargetElement(sourceDb, targetDb, displayStyle3dId);
    const displayStyle3d = targetDb.elements.getElement<DisplayStyle3d>(displayStyle3dId);
    assert.isTrue(displayStyle3d.settings.hasSubCategoryOverride);
    assert.equal(displayStyle3d.settings.subCategoryOverrides.size, 1);
    assert.exists(displayStyle3d.settings.getSubCategoryOverride(subCategoryId), "Expect subCategoryOverrides to have been remapped");
    assert.isTrue(displayStyle3d.settings.excludedElements.has(physicalObjectId1), "Expect excludedElements to be remapped"); // eslint-disable-line deprecation/deprecation
    assert.equal(displayStyle3d.settings.environment.sky?.image?.type, SkyBoxImageType.Spherical);
    assert.equal(displayStyle3d.settings.environment.sky?.image?.texture, textureId);
    assert.equal(displayStyle3d.settings.getPlanProjectionSettings(spatialLocationModelId)?.elevation, 10.0);
    // ViewDefinition
    const viewId = targetDb.elements.queryElementIdByCode(OrthographicViewDefinition.createCode(targetDb, definitionModelId, "Orthographic View"))!;
    assertTargetElement(sourceDb, targetDb, viewId);
    const viewProps = targetDb.elements.getElementProps<SpatialViewDefinitionProps>(viewId);
    assert.equal(viewProps.displayStyleId, displayStyle3dId);
    assert.equal(viewProps.categorySelectorId, spatialCategorySelectorId);
    assert.equal(viewProps.modelSelectorId, modelSelectorId);
    // AuxCoordSystem2d
    assert.equal(undefined, targetDb.elements.queryElementIdByCode(AuxCoordSystem2d.createCode(targetDb, definitionModelId, "AuxCoordSystem2d")), "Should have been excluded by class");
    // DrawingGraphic
    const drawingGraphicId1: Id64String = queryByUserLabel(targetDb, "DrawingGraphic1");
    const drawingGraphicId2: Id64String = queryByUserLabel(targetDb, "DrawingGraphic2");
    assertTargetElement(sourceDb, targetDb, drawingGraphicId1);
    assertTargetElement(sourceDb, targetDb, drawingGraphicId2);
    // DrawingGraphicRepresentsElement
    assertTargetRelationship(sourceDb, targetDb, DrawingGraphicRepresentsElement.classFullName, drawingGraphicId1, physicalObjectId1);
    assertTargetRelationship(sourceDb, targetDb, DrawingGraphicRepresentsElement.classFullName, drawingGraphicId2, physicalObjectId1);
    // TargetRelWithProps
    const relWithProps: any = targetDb.relationships.getInstanceProps(
      "TestTransformerTarget:TargetRelWithProps",
      { sourceId: spatialCategorySelectorId, targetId: drawingCategorySelectorId },
    );
    assert.equal(relWithProps.targetString, "One");
    assert.equal(relWithProps.targetDouble, 1.1);
    assert.equal(relWithProps.targetLong, spatialCategoryId);
    assert.isTrue(Guid.isV4Guid(relWithProps.targetGuid));
  }

  export function assertUpdatesInDb(iModelDb: IModelDb, assertDeletes: boolean = true): void {
    // determine which schema was imported
    const testSourceSchema = iModelDb.querySchemaVersion("TestTransformerSource") ? true : false;
    const testTargetSchema = iModelDb.querySchemaVersion("TestTransformerTarget") ? true : false;
    assert.notEqual(testSourceSchema, testTargetSchema);
    // assert Subject was updated
    const subjectId = iModelDb.elements.queryElementIdByCode(Subject.createCode(iModelDb, IModel.rootSubjectId, "Subject"))!;
    assert.isTrue(Id64.isValidId64(subjectId));
    const subject: Subject = iModelDb.elements.getElement<Subject>(subjectId);
    assert.equal(subject.description, "Subject description (Updated)");
    // assert SpatialCategory was updated
    const definitionModelId = iModelDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(iModelDb, subjectId, "Definition"))!;
    assert.isTrue(Id64.isValidId64(definitionModelId));
    const spatialCategoryId = iModelDb.elements.queryElementIdByCode(SpatialCategory.createCode(iModelDb, definitionModelId, "SpatialCategory"))!;
    assert.isTrue(Id64.isValidId64(spatialCategoryId));
    const spatialCategory: SpatialCategory = iModelDb.elements.getElement<SpatialCategory>(spatialCategoryId);
    assert.exists(spatialCategory.federationGuid);
    // assert TargetRelWithProps was updated
    const spatialCategorySelectorId = iModelDb.elements.queryElementIdByCode(CategorySelector.createCode(iModelDb, definitionModelId, "SpatialCategories"))!;
    assert.isTrue(Id64.isValidId64(spatialCategorySelectorId));
    const drawingCategorySelectorId = iModelDb.elements.queryElementIdByCode(CategorySelector.createCode(iModelDb, definitionModelId, "DrawingCategories"))!;
    assert.isTrue(Id64.isValidId64(drawingCategorySelectorId));
    const relClassFullName = testTargetSchema ? "TestTransformerTarget:TargetRelWithProps" : "TestTransformerSource:SourceRelWithProps";
    const relWithProps: any = iModelDb.relationships.getInstanceProps(
      relClassFullName,
      { sourceId: spatialCategorySelectorId, targetId: drawingCategorySelectorId },
    );
    assert.equal(testTargetSchema ? relWithProps.targetString : relWithProps.sourceString, "One-Updated");
    assert.equal(testTargetSchema ? relWithProps.targetDouble : relWithProps.sourceDouble, 1.2);
    // assert ElementAspect properties
    const physicalObjectId1: Id64String = queryByUserLabel(iModelDb, "PhysicalObject1");
    const uniqueAspectClassFullName = testTargetSchema ? "TestTransformerTarget:TargetUniqueAspect" : "TestTransformerSource:SourceUniqueAspect";
    const uniqueAspects: ElementAspect[] = iModelDb.elements.getAspects(physicalObjectId1, uniqueAspectClassFullName);
    assert.equal(uniqueAspects.length, 1);
    const uniqueAspect = uniqueAspects[0].asAny;
    assert.equal(uniqueAspect.commonDouble, 1.1);
    assert.equal(uniqueAspect.commonString, "Unique-Updated");
    assert.equal(uniqueAspect.commonLong, physicalObjectId1);
    assert.equal(testTargetSchema ? uniqueAspect.targetDouble : uniqueAspect.sourceDouble, 11.1);
    assert.equal(testTargetSchema ? uniqueAspect.targetString : uniqueAspect.sourceString, "UniqueAspect-Updated");
    assert.equal(testTargetSchema ? uniqueAspect.targetLong : uniqueAspect.sourceLong, physicalObjectId1);
    const multiAspectClassFullName = testTargetSchema ? "TestTransformerTarget:TargetMultiAspect" : "TestTransformerSource:SourceMultiAspect";
    const multiAspects: ElementAspect[] = iModelDb.elements.getAspects(physicalObjectId1, multiAspectClassFullName);
    assert.equal(multiAspects.length, 2);
    const multiAspect0 = multiAspects[0].asAny;
    const multiAspect1 = multiAspects[1].asAny;
    assert.equal(multiAspect0.commonDouble, 2.2);
    assert.equal(multiAspect0.commonString, "Multi");
    assert.equal(multiAspect0.commonLong, physicalObjectId1);
    assert.equal(testTargetSchema ? multiAspect0.targetDouble : multiAspect0.sourceDouble, 22.2);
    assert.equal(testTargetSchema ? multiAspect0.targetString : multiAspect0.sourceString, "MultiAspect");
    assert.equal(testTargetSchema ? multiAspect0.targetLong : multiAspect0.sourceLong, physicalObjectId1);
    assert.equal(multiAspect1.commonDouble, 3.3);
    assert.equal(multiAspect1.commonString, "Multi-Updated");
    assert.equal(multiAspect1.commonLong, physicalObjectId1);
    assert.equal(testTargetSchema ? multiAspect1.targetDouble : multiAspect1.sourceDouble, 33.3);
    assert.equal(testTargetSchema ? multiAspect1.targetString : multiAspect1.sourceString, "MultiAspect-Updated");
    assert.equal(testTargetSchema ? multiAspect1.targetLong : multiAspect1.sourceLong, physicalObjectId1);
    // assert NavigationProperty of PhysicalElement1 was cleared
    const physicalElementId: Id64String = queryByUserLabel(iModelDb, "PhysicalElement1");
    const physicalElement: PhysicalElement = iModelDb.elements.getElement(physicalElementId);
    assert.isUndefined(physicalElement.asAny.commonNavigation);
    // assert PhysicalObject5 was inserted
    const physicalObjectId5: Id64String = queryByUserLabel(iModelDb, "PhysicalObject5");
    assert.isTrue(Id64.isValidId64(physicalObjectId5));
    // assert relationships were inserted
    const drawingGraphicId1: Id64String = queryByUserLabel(iModelDb, "DrawingGraphic1");
    const drawingGraphicId2: Id64String = queryByUserLabel(iModelDb, "DrawingGraphic2");
    iModelDb.relationships.getInstance(DrawingGraphicRepresentsElement.classFullName, { sourceId: drawingGraphicId1, targetId: physicalObjectId5 });
    iModelDb.relationships.getInstance(DrawingGraphicRepresentsElement.classFullName, { sourceId: drawingGraphicId2, targetId: physicalObjectId5 });
    // assert InformationRecord2 was updated
    const informationRecordCodeSpec: CodeSpec = iModelDb.codeSpecs.getByName("InformationRecords");
    const informationModelId: Id64String = iModelDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(iModelDb, subjectId, "Information"))!;
    const informationRecordId2 = iModelDb.elements.queryElementIdByCode(new Code({ spec: informationRecordCodeSpec.id, scope: informationModelId, value: "InformationRecord2" }));
    assert.isTrue(Id64.isValidId64(informationRecordId2!));
    const informationRecord2: any = iModelDb.elements.getElement(informationRecordId2!);
    assert.equal(informationRecord2.commonString, "Common2-Updated");
    assert.equal(testTargetSchema ? informationRecord2.targetString : informationRecord2.sourceString, "Two-Updated");
    // assert InformationRecord3 was deleted
    assert.isDefined(iModelDb.elements.queryElementIdByCode(new Code({ spec: informationRecordCodeSpec.id, scope: informationModelId, value: "InformationRecord1" })));
    assert.isDefined(iModelDb.elements.queryElementIdByCode(new Code({ spec: informationRecordCodeSpec.id, scope: informationModelId, value: "InformationRecord2" })));
    // detect deletes if possible - cannot detect during processAll when isReverseSynchronization is true
    if (assertDeletes) {
      assert.equal(Id64.invalid, queryByUserLabel(iModelDb, "PhysicalObject3"));
      assert.throws(() => iModelDb.relationships.getInstanceProps(DrawingGraphicRepresentsElement.classFullName, { sourceId: drawingGraphicId2, targetId: physicalObjectId1 }));
      assert.isUndefined(iModelDb.elements.queryElementIdByCode(new Code({ spec: informationRecordCodeSpec.id, scope: informationModelId, value: "InformationRecord3" })));
    }
  }

  function assertTargetElement(sourceDb: IModelDb, targetDb: IModelDb, targetElementId: Id64String): void {
    assert.isTrue(Id64.isValidId64(targetElementId));
    const element: Element = targetDb.elements.getElement(targetElementId);
    assert.isTrue(element.federationGuid && Guid.isV4Guid(element.federationGuid));
    const aspects: ElementAspect[] = targetDb.elements.getAspects(targetElementId, ExternalSourceAspect.classFullName);
    const aspect: ExternalSourceAspect = aspects.filter((esa: any) => esa.kind === ExternalSourceAspect.Kind.Element)[0] as ExternalSourceAspect;
    assert.exists(aspect);
    assert.equal(aspect.kind, ExternalSourceAspect.Kind.Element);
    assert.equal(aspect.scope.id, IModel.rootSubjectId);
    assert.isUndefined(aspect.checksum);
    assert.isTrue(Id64.isValidId64(aspect.identifier));
    const sourceLastMod: string = sourceDb.elements.queryLastModifiedTime(aspect.identifier);
    assert.equal(aspect.version, sourceLastMod);
    const sourceElement: Element = sourceDb.elements.getElement(aspect.identifier);
    assert.exists(sourceElement);
  }

  function assertTargetRelationship(sourceDb: IModelDb, targetDb: IModelDb, targetRelClassFullName: string, targetRelSourceId: Id64String, targetRelTargetId: Id64String): void {
    const targetRelationship: Relationship = targetDb.relationships.getInstance(targetRelClassFullName, { sourceId: targetRelSourceId, targetId: targetRelTargetId });
    assert.exists(targetRelationship);
    const aspects: ElementAspect[] = targetDb.elements.getAspects(targetRelSourceId, ExternalSourceAspect.classFullName);
    const aspect: ExternalSourceAspect = aspects.filter((esa: any) => esa.kind === ExternalSourceAspect.Kind.Relationship)[0] as ExternalSourceAspect;
    assert.exists(aspect);
    const sourceRelationship: Relationship = sourceDb.relationships.getInstance(ElementRefersToElements.classFullName, aspect.identifier);
    assert.exists(sourceRelationship);
    assert.isDefined(aspect.jsonProperties);
    const json: any = JSON.parse(aspect.jsonProperties!);
    assert.equal(targetRelationship.id, json.targetRelInstanceId);
  }

  export function createTeamIModel(outputDir: string, teamName: string, teamOrigin: Point3d, teamColor: ColorDef): SnapshotDb {
    const teamFile: string = path.join(outputDir, `Team${teamName}.bim`);
    if (IModelJsFs.existsSync(teamFile)) {
      IModelJsFs.removeSync(teamFile);
    }
    const iModelDb: SnapshotDb = SnapshotDb.createEmpty(teamFile, { rootSubject: { name: teamName }, createClassViews: true });
    assert.exists(iModelDb);
    populateTeamIModel(iModelDb, teamName, teamOrigin, teamColor);
    iModelDb.saveChanges();
    return iModelDb;
  }

  export function populateTeamIModel(teamDb: IModelDb, teamName: string, teamOrigin: Point3d, teamColor: ColorDef): void {
    const contextSubjectId: Id64String = Subject.insert(teamDb, IModel.rootSubjectId, "Context");
    assert.isTrue(Id64.isValidId64(contextSubjectId));
    const definitionModelId = DefinitionModel.insert(teamDb, IModel.rootSubjectId, `Definition${teamName}`);
    assert.isTrue(Id64.isValidId64(definitionModelId));
    const teamSpatialCategoryId = insertSpatialCategory(teamDb, definitionModelId, `SpatialCategory${teamName}`, teamColor);
    assert.isTrue(Id64.isValidId64(teamSpatialCategoryId));
    const sharedSpatialCategoryId = insertSpatialCategory(teamDb, IModel.dictionaryId, "SpatialCategoryShared", ColorDef.white);
    assert.isTrue(Id64.isValidId64(sharedSpatialCategoryId));
    const sharedDrawingCategoryId = DrawingCategory.insert(teamDb, IModel.dictionaryId, "DrawingCategoryShared", new SubCategoryAppearance());
    assert.isTrue(Id64.isValidId64(sharedDrawingCategoryId));
    const physicalModelId = PhysicalModel.insert(teamDb, IModel.rootSubjectId, `Physical${teamName}`);
    assert.isTrue(Id64.isValidId64(physicalModelId));
    // insert PhysicalObject-team1 using team SpatialCategory
    const physicalObjectProps1: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: physicalModelId,
      category: teamSpatialCategoryId,
      code: Code.createEmpty(),
      userLabel: `PhysicalObject${teamName}1`,
      geom: createBox(Point3d.create(1, 1, 1)),
      placement: {
        origin: teamOrigin,
        angles: YawPitchRollAngles.createDegrees(0, 0, 0),
      },
    };
    const physicalObjectId1: Id64String = teamDb.elements.insertElement(physicalObjectProps1);
    assert.isTrue(Id64.isValidId64(physicalObjectId1));
    // insert PhysicalObject2 using "shared" SpatialCategory
    const physicalObjectProps2: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: physicalModelId,
      category: sharedSpatialCategoryId,
      code: Code.createEmpty(),
      userLabel: `PhysicalObject${teamName}2`,
      geom: createBox(Point3d.create(2, 2, 2)),
      placement: {
        origin: teamOrigin,
        angles: YawPitchRollAngles.createDegrees(0, 0, 0),
      },
    };
    const physicalObjectId2: Id64String = teamDb.elements.insertElement(physicalObjectProps2);
    assert.isTrue(Id64.isValidId64(physicalObjectId2));
  }

  export function createSharedIModel(outputDir: string, teamNames: string[]): SnapshotDb {
    const iModelName: string = `Shared${teamNames.join("")}`;
    const iModelFile: string = path.join(outputDir, `${iModelName}.bim`);
    if (IModelJsFs.existsSync(iModelFile)) {
      IModelJsFs.removeSync(iModelFile);
    }
    const iModelDb: SnapshotDb = SnapshotDb.createEmpty(iModelFile, { rootSubject: { name: iModelName } });
    assert.exists(iModelDb);
    teamNames.forEach((teamName: string) => {
      const subjectId: Id64String = Subject.insert(iModelDb, IModel.rootSubjectId, teamName);
      assert.isTrue(Id64.isValidId64(subjectId));
    });
    return iModelDb;
  }

  export function assertTeamIModelContents(iModelDb: IModelDb, teamName: string): void {
    const definitionPartitionId: Id64String = queryDefinitionPartitionId(iModelDb, IModel.rootSubjectId, teamName);
    const teamSpatialCategoryId = querySpatialCategoryId(iModelDb, definitionPartitionId, teamName);
    const sharedSpatialCategoryId = querySpatialCategoryId(iModelDb, IModel.dictionaryId, "Shared");
    const physicalPartitionId: Id64String = queryPhysicalPartitionId(iModelDb, IModel.rootSubjectId, teamName);
    const physicalObjectId1: Id64String = queryPhysicalElementId(iModelDb, physicalPartitionId, teamSpatialCategoryId, `${teamName}1`);
    const physicalObject1: PhysicalElement = iModelDb.elements.getElement<PhysicalElement>(physicalObjectId1);
    assert.equal(physicalObject1.code.spec, iModelDb.codeSpecs.getByName(BisCodeSpec.nullCodeSpec).id);
    assert.equal(physicalObject1.code.scope, IModel.rootSubjectId);
    assert.isTrue(physicalObject1.code.value === "");
    assert.equal(physicalObject1.category, teamSpatialCategoryId);
    const physicalObjectId2: Id64String = queryPhysicalElementId(iModelDb, physicalPartitionId, sharedSpatialCategoryId, `${teamName}2`);
    const physicalObject2: PhysicalElement = iModelDb.elements.getElement<PhysicalElement>(physicalObjectId2);
    assert.equal(physicalObject2.category, sharedSpatialCategoryId);
  }

  export function assertSharedIModelContents(iModelDb: IModelDb, teamNames: string[]): void {
    const sharedSpatialCategoryId = querySpatialCategoryId(iModelDb, IModel.dictionaryId, "Shared");
    assert.isTrue(Id64.isValidId64(sharedSpatialCategoryId));
    const aspects: ExternalSourceAspect[] = iModelDb.elements.getAspects(sharedSpatialCategoryId, ExternalSourceAspect.classFullName) as ExternalSourceAspect[];
    assert.isAtLeast(teamNames.length, aspects.length, "Should have an ExternalSourceAspect from each source");
    teamNames.forEach((teamName: string) => {
      const subjectId: Id64String = querySubjectId(iModelDb, teamName);
      const definitionPartitionId: Id64String = queryDefinitionPartitionId(iModelDb, subjectId, teamName);
      const teamSpatialCategoryId = querySpatialCategoryId(iModelDb, definitionPartitionId, teamName);
      const physicalPartitionId: Id64String = queryPhysicalPartitionId(iModelDb, subjectId, teamName);
      const physicalObjectId1: Id64String = queryPhysicalElementId(iModelDb, physicalPartitionId, teamSpatialCategoryId, `${teamName}1`);
      const physicalObject1: PhysicalElement = iModelDb.elements.getElement<PhysicalElement>(physicalObjectId1);
      assert.equal(physicalObject1.code.spec, iModelDb.codeSpecs.getByName(BisCodeSpec.nullCodeSpec).id);
      assert.equal(physicalObject1.code.scope, IModel.rootSubjectId);
      assert.isTrue(physicalObject1.code.value === "");
      assert.equal(physicalObject1.category, teamSpatialCategoryId);
      assert.equal(1, iModelDb.elements.getAspects(physicalObjectId1, ExternalSourceAspect.classFullName).length);
      assert.equal(1, iModelDb.elements.getAspects(teamSpatialCategoryId, ExternalSourceAspect.classFullName).length);
      const physicalObjectId2: Id64String = queryPhysicalElementId(iModelDb, physicalPartitionId, sharedSpatialCategoryId, `${teamName}2`);
      const physicalObject2: PhysicalElement = iModelDb.elements.getElement<PhysicalElement>(physicalObjectId2);
      assert.equal(physicalObject2.category, sharedSpatialCategoryId);
      assert.equal(1, iModelDb.elements.getAspects(physicalObjectId2, ExternalSourceAspect.classFullName).length);
    });
  }

  export function createComponentLibrary(outputDir: string): SnapshotDb {
    const iModelName: string = "ComponentLibrary";
    const iModelFile: string = path.join(outputDir, `${iModelName}.bim`);
    if (IModelJsFs.existsSync(iModelFile)) {
      IModelJsFs.removeSync(iModelFile);
    }
    const iModelDb: SnapshotDb = SnapshotDb.createEmpty(iModelFile, { rootSubject: { name: iModelName }, createClassViews: true });
    const componentCategoryId = insertSpatialCategory(iModelDb, IModel.dictionaryId, "Components", ColorDef.green);
    const drawingComponentCategoryId = DrawingCategory.insert(iModelDb, IModel.dictionaryId, "Components", new SubCategoryAppearance());
    const definitionModelId = DefinitionModel.insert(iModelDb, IModel.rootSubjectId, "Components");
    // Cylinder component
    const cylinderTemplateId = TemplateRecipe3d.insert(iModelDb, definitionModelId, "Cylinder");
    const cylinderTemplateModel = iModelDb.models.getModel<PhysicalModel>(cylinderTemplateId, PhysicalModel);
    assert.isTrue(cylinderTemplateModel.isTemplate);
    const cylinderProps: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: cylinderTemplateId,
      category: componentCategoryId,
      code: Code.createEmpty(),
      userLabel: "Cylinder",
      placement: { origin: Point3d.createZero(), angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: createCylinder(1),
    };
    iModelDb.elements.insertElement(cylinderProps);
    // Assembly component
    const assemblyTemplateId = TemplateRecipe3d.insert(iModelDb, definitionModelId, "Assembly");
    assert.exists(iModelDb.models.getModel<PhysicalModel>(assemblyTemplateId));
    const assemblyHeadProps: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: assemblyTemplateId,
      category: componentCategoryId,
      code: Code.createEmpty(),
      userLabel: "Assembly Head",
      placement: { origin: Point3d.createZero(), angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: createCylinder(1),
    };
    const assemblyHeadId: Id64String = iModelDb.elements.insertElement(assemblyHeadProps);
    const childBoxProps: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: assemblyTemplateId,
      category: componentCategoryId,
      parent: new ElementOwnsChildElements(assemblyHeadId),
      code: Code.createEmpty(),
      userLabel: "Child",
      placement: { origin: Point3d.create(2, 0, 0), angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: createBox(Point3d.create(1, 1, 1)),
    };
    iModelDb.elements.insertElement(childBoxProps);
    // 2d component
    const drawingGraphicTemplateId = TemplateRecipe2d.insert(iModelDb, definitionModelId, "DrawingGraphic");
    const drawingGraphicTemplateModel = iModelDb.models.getModel<DrawingModel>(drawingGraphicTemplateId, DrawingModel);
    assert.isTrue(drawingGraphicTemplateModel.isTemplate);
    const drawingGraphicProps: GeometricElement2dProps = {
      classFullName: DrawingGraphic.classFullName,
      model: drawingGraphicTemplateId,
      category: drawingComponentCategoryId,
      code: Code.createEmpty(),
      userLabel: "DrawingGraphic",
      placement: { origin: Point2d.createZero(), angle: 0 },
      geom: createRectangle(Point2d.create(1, 1)),
    };
    iModelDb.elements.insertElement(drawingGraphicProps);
    return iModelDb;
  }

  export function querySubjectId(iModelDb: IModelDb, subjectCodeValue: string): Id64String {
    const subjectId: Id64String = iModelDb.elements.queryElementIdByCode(Subject.createCode(iModelDb, IModel.rootSubjectId, subjectCodeValue))!;
    assert.isTrue(Id64.isValidId64(subjectId));
    return subjectId;
  }

  export function queryDefinitionPartitionId(iModelDb: IModelDb, parentSubjectId: Id64String, suffix: string): Id64String {
    const partitionCode: Code = DefinitionPartition.createCode(iModelDb, parentSubjectId, `Definition${suffix}`);
    const partitionId: Id64String = iModelDb.elements.queryElementIdByCode(partitionCode)!;
    assert.isTrue(Id64.isValidId64(partitionId));
    return partitionId;
  }

  function querySpatialCategoryId(iModelDb: IModelDb, modelId: Id64String, suffix: string): Id64String {
    const categoryCode: Code = SpatialCategory.createCode(iModelDb, modelId, `SpatialCategory${suffix}`);
    const categoryId: Id64String = iModelDb.elements.queryElementIdByCode(categoryCode)!;
    assert.isTrue(Id64.isValidId64(categoryId));
    return categoryId;
  }

  export function queryPhysicalPartitionId(iModelDb: IModelDb, parentSubjectId: Id64String, suffix: string): Id64String {
    const partitionCode: Code = PhysicalPartition.createCode(iModelDb, parentSubjectId, `Physical${suffix}`);
    const partitionId: Id64String = iModelDb.elements.queryElementIdByCode(partitionCode)!;
    assert.isTrue(Id64.isValidId64(partitionId));
    return partitionId;
  }

  function queryPhysicalElementId(iModelDb: IModelDb, modelId: Id64String, categoryId: Id64String, suffix: string): Id64String {
    const elementId: Id64String = queryByUserLabel(iModelDb, `PhysicalObject${suffix}`);
    assert.isTrue(Id64.isValidId64(elementId));
    const element: PhysicalElement = iModelDb.elements.getElement<PhysicalElement>(elementId);
    assert.equal(element.model, modelId);
    assert.equal(element.category, categoryId);
    return elementId;
  }

  export function createConsolidatedIModel(outputDir: string, consolidatedName: string): SnapshotDb {
    const consolidatedFile: string = path.join(outputDir, `${consolidatedName}.bim`);
    if (IModelJsFs.existsSync(consolidatedFile)) {
      IModelJsFs.removeSync(consolidatedFile);
    }
    const consolidatedDb: SnapshotDb = SnapshotDb.createEmpty(consolidatedFile, { rootSubject: { name: `${consolidatedName}` } });
    assert.exists(consolidatedDb);
    const definitionModelId = DefinitionModel.insert(consolidatedDb, IModel.rootSubjectId, `Definition${consolidatedName}`);
    assert.isTrue(Id64.isValidId64(definitionModelId));
    const physicalModelId = PhysicalModel.insert(consolidatedDb, IModel.rootSubjectId, `Physical${consolidatedName}`);
    assert.isTrue(Id64.isValidId64(physicalModelId));
    consolidatedDb.saveChanges();
    return consolidatedDb;
  }

  export function assertConsolidatedIModelContents(iModelDb: IModelDb, consolidatedName: string): void {
    // assert what should exist
    const definitionModelId: Id64String = IModelTransformerUtils.queryDefinitionPartitionId(iModelDb, IModel.rootSubjectId, consolidatedName);
    assert.isTrue(Id64.isValidId64(definitionModelId));
    const categoryA: Id64String = querySpatialCategoryId(iModelDb, definitionModelId, "A");
    const categoryB: Id64String = querySpatialCategoryId(iModelDb, definitionModelId, "B");
    assert.isTrue(Id64.isValidId64(categoryA));
    assert.isTrue(Id64.isValidId64(categoryB));
    const physicalModelId: Id64String = IModelTransformerUtils.queryPhysicalPartitionId(iModelDb, IModel.rootSubjectId, consolidatedName);
    assert.isTrue(Id64.isValidId64(physicalModelId));
    queryPhysicalElementId(iModelDb, physicalModelId, categoryA, "A1");
    queryPhysicalElementId(iModelDb, physicalModelId, categoryB, "B1");
    // assert what should not exist
    assert.throws(() => IModelTransformerUtils.querySubjectId(iModelDb, "A"), Error);
    assert.throws(() => IModelTransformerUtils.querySubjectId(iModelDb, "B"), Error);
  }

  function insertSpatialCategory(iModelDb: IModelDb, modelId: Id64String, categoryName: string, color: ColorDef): Id64String {
    const appearance: SubCategoryAppearance.Props = {
      color: color.toJSON(),
      transp: 0,
      invisible: false,
    };
    return SpatialCategory.insert(iModelDb, modelId, categoryName, appearance);
  }

  export function createBoxes(subCategoryIds: Id64String[]): GeometryStreamProps {
    const length = 1.0;
    const entryOrigin = Point3d.createZero();
    const geometryStreamBuilder = new GeometryStreamBuilder();
    geometryStreamBuilder.appendGeometry(Box.createDgnBox(
      entryOrigin, Vector3d.unitX(), Vector3d.unitY(), new Point3d(0, 0, length),
      length, length, length, length, true,
    )!);
    for (const subCategoryId of subCategoryIds) {
      entryOrigin.addInPlace({ x: 1, y: 1, z: 1 });
      geometryStreamBuilder.appendSubCategoryChange(subCategoryId);
      geometryStreamBuilder.appendGeometry(Box.createDgnBox(
        entryOrigin, Vector3d.unitX(), Vector3d.unitY(), new Point3d(0, 0, length),
        length, length, length, length, true,
      )!);
    }
    return geometryStreamBuilder.geometryStream;
  }

  export function createBox(size: Point3d, categoryId?: Id64String, subCategoryId?: Id64String, renderMaterialId?: Id64String, geometryPartId?: Id64String): GeometryStreamProps {
    const geometryStreamBuilder = new GeometryStreamBuilder();
    if ((undefined !== categoryId) && (undefined !== subCategoryId)) {
      geometryStreamBuilder.appendSubCategoryChange(subCategoryId);
      if (undefined !== renderMaterialId) {
        const geometryParams = new GeometryParams(categoryId, subCategoryId);
        geometryParams.materialId = renderMaterialId;
        geometryStreamBuilder.appendGeometryParamsChange(geometryParams);
      }
    }
    geometryStreamBuilder.appendGeometry(Box.createDgnBox(
      Point3d.createZero(), Vector3d.unitX(), Vector3d.unitY(), new Point3d(0, 0, size.z),
      size.x, size.y, size.x, size.y, true,
    )!);
    if (undefined !== geometryPartId) {
      geometryStreamBuilder.appendGeometryPart3d(geometryPartId);
    }
    return geometryStreamBuilder.geometryStream;
  }

  function createCylinder(radius: number): GeometryStreamProps {
    const pointA = Point3d.create(0, 0, 0);
    const pointB = Point3d.create(0, 0, 2 * radius);
    const cylinder = Cone.createBaseAndTarget(pointA, pointB, Vector3d.unitX(), Vector3d.unitY(), radius, radius, true);
    const geometryStreamBuilder = new GeometryStreamBuilder();
    geometryStreamBuilder.appendGeometry(cylinder);
    return geometryStreamBuilder.geometryStream;
  }

  function createRectangle(size: Point2d): GeometryStreamProps {
    const geometryStreamBuilder = new GeometryStreamBuilder();
    geometryStreamBuilder.appendGeometry(LineString3d.createPoints([
      new Point3d(0, 0),
      new Point3d(size.x, 0),
      new Point3d(size.x, size.y),
      new Point3d(0, size.y),
      new Point3d(0, 0),
    ]));
    return geometryStreamBuilder.geometryStream;
  }

  export function insertTextureElement(iModelDb: IModelDb, modelId: Id64String, textureName: string): Id64String {
    // This is an encoded png containing a 3x3 square with white in top left pixel, blue in middle pixel, and green in bottom right pixel. The rest of the square is red.
    const pngData = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 3, 0, 0, 0, 3, 8, 2, 0, 0, 0, 217, 74, 34, 232, 0, 0, 0, 1, 115, 82, 71, 66, 0, 174, 206, 28, 233, 0, 0, 0, 4, 103, 65, 77, 65, 0, 0, 177, 143, 11, 252, 97, 5, 0, 0, 0, 9, 112, 72, 89, 115, 0, 0, 14, 195, 0, 0, 14, 195, 1, 199, 111, 168, 100, 0, 0, 0, 24, 73, 68, 65, 84, 24, 87, 99, 248, 15, 4, 12, 12, 64, 4, 198, 64, 46, 132, 5, 162, 254, 51, 0, 0, 195, 90, 10, 246, 127, 175, 154, 145, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
    const textureData = Base64.btoa(String.fromCharCode(...pngData));
    return Texture.insertTexture(iModelDb, modelId, textureName, ImageSourceFormat.Png, textureData, `Description for ${textureName}`);
  }

  export function queryByUserLabel(iModelDb: IModelDb, userLabel: string): Id64String {
    return iModelDb.withPreparedStatement(`SELECT ECInstanceId FROM ${Element.classFullName} WHERE UserLabel=:userLabel`, (statement: ECSqlStatement): Id64String => {
      statement.bindString("userLabel", userLabel);
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getId() : Id64.invalid;
    });
  }

  export function insertRepositoryLink(iModelDb: IModelDb, codeValue: string, url: string, format: string): Id64String {
    const repositoryLinkProps: RepositoryLinkProps = {
      classFullName: RepositoryLink.classFullName,
      model: IModel.repositoryModelId,
      code: LinkElement.createCode(iModelDb, IModel.repositoryModelId, codeValue),
      url,
      format,
    };
    return iModelDb.elements.insertElement(repositoryLinkProps);
  }

  export function insertExternalSource(iModelDb: IModelDb, repositoryId: Id64String, userLabel: string): Id64String {
    const externalSourceProps: ExternalSourceProps = {
      classFullName: ExternalSource.classFullName,
      model: IModel.repositoryModelId,
      code: Code.createEmpty(),
      userLabel,
      repository: new ExternalSourceIsInRepository(repositoryId),
      connectorName: "Connector",
      connectorVersion: "0.0.1",
    };
    return iModelDb.elements.insertElement(externalSourceProps);
  }

  export function dumpIModelInfo(iModelDb: IModelDb): void {
    const outputFileName: string = `${iModelDb.pathName}.info.txt`;
    if (IModelJsFs.existsSync(outputFileName)) {
      IModelJsFs.removeSync(outputFileName);
    }
    IModelJsFs.appendFileSync(outputFileName, `${iModelDb.pathName}\n`);
    IModelJsFs.appendFileSync(outputFileName, "\n=== CodeSpecs ===\n");
    iModelDb.withPreparedStatement(`SELECT ECInstanceId,Name FROM BisCore:CodeSpec ORDER BY ECInstanceId`, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const codeSpecId: Id64String = statement.getValue(0).getId();
        const codeSpecName: string = statement.getValue(1).getString();
        IModelJsFs.appendFileSync(outputFileName, `${codeSpecId}, ${codeSpecName}\n`);
      }
    });
    IModelJsFs.appendFileSync(outputFileName, "\n=== Schemas ===\n");
    iModelDb.withPreparedStatement(`SELECT Name FROM ECDbMeta.ECSchemaDef ORDER BY ECInstanceId`, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const schemaName: string = statement.getValue(0).getString();
        IModelJsFs.appendFileSync(outputFileName, `${schemaName}\n`);
      }
    });
    IModelJsFs.appendFileSync(outputFileName, "\n=== Models ===\n");
    iModelDb.withPreparedStatement(`SELECT ECInstanceId FROM ${Model.classFullName} ORDER BY ECInstanceId`, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const modelId: Id64String = statement.getValue(0).getId();
        const model: Model = iModelDb.models.getModel(modelId);
        IModelJsFs.appendFileSync(outputFileName, `${modelId}, ${model.name}, ${model.parentModel}, ${model.classFullName}\n`);
      }
    });
    IModelJsFs.appendFileSync(outputFileName, "\n=== ViewDefinitions ===\n");
    iModelDb.withPreparedStatement(`SELECT ECInstanceId FROM ${ViewDefinition.classFullName} ORDER BY ECInstanceId`, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const viewDefinitionId: Id64String = statement.getValue(0).getId();
        const viewDefinition: ViewDefinition = iModelDb.elements.getElement<ViewDefinition>(viewDefinitionId);
        IModelJsFs.appendFileSync(outputFileName, `${viewDefinitionId}, ${viewDefinition.code.value}, ${viewDefinition.classFullName}\n`);
      }
    });
    IModelJsFs.appendFileSync(outputFileName, "\n=== Elements ===\n");
    iModelDb.withPreparedStatement(`SELECT COUNT(*) FROM ${Element.classFullName}`, (statement: ECSqlStatement): void => {
      if (DbResult.BE_SQLITE_ROW === statement.step()) {
        const count: number = statement.getValue(0).getInteger();
        IModelJsFs.appendFileSync(outputFileName, `Count of ${Element.classFullName}=${count}\n`);
      }
    });
    iModelDb.withPreparedStatement(`SELECT COUNT(*) FROM ${PhysicalObject.classFullName}`, (statement: ECSqlStatement): void => {
      if (DbResult.BE_SQLITE_ROW === statement.step()) {
        const count: number = statement.getValue(0).getInteger();
        IModelJsFs.appendFileSync(outputFileName, `Count of ${PhysicalObject.classFullName}=${count}\n`);
      }
    });
    iModelDb.withPreparedStatement(`SELECT COUNT(*) FROM ${GeometryPart.classFullName}`, (statement: ECSqlStatement): void => {
      if (DbResult.BE_SQLITE_ROW === statement.step()) {
        const count: number = statement.getValue(0).getInteger();
        IModelJsFs.appendFileSync(outputFileName, `Count of ${GeometryPart.classFullName}=${count}\n`);
      }
    });
  }
}

/** Test IModelTransformer that applies a 3d transform to all GeometricElement3d instances. */
export class IModelTransformer3d extends IModelTransformer {
  /** The Transform to apply to all GeometricElement3d instances. */
  private readonly _transform3d: Transform;
  /** Construct a new IModelTransformer3d */
  public constructor(sourceDb: IModelDb, targetDb: IModelDb, transform3d: Transform) {
    super(sourceDb, targetDb);
    this._transform3d = transform3d;
  }
  /** Override transformElement to apply a 3d transform to all GeometricElement3d instances. */
  protected onTransformElement(sourceElement: Element): ElementProps {
    const targetElementProps: ElementProps = super.onTransformElement(sourceElement);
    if (sourceElement instanceof GeometricElement3d) { // can check the sourceElement since this IModelTransformer does not remap classes
      const placement = Placement3d.fromJSON((targetElementProps as GeometricElement3dProps).placement);
      if (placement.isValid) {
        placement.multiplyTransform(this._transform3d);
        (targetElementProps as GeometricElement3dProps).placement = placement;
      }
    }
    return targetElementProps;
  }
}

/** Test IModelTransformer that consolidates all PhysicalModels into one. */
export class PhysicalModelConsolidator extends IModelTransformer {
  /** Remap all source PhysicalModels to this one. */
  private readonly _targetModelId: Id64String;
  /** Construct a new PhysicalModelConsolidator */
  public constructor(sourceDb: IModelDb, targetDb: IModelDb, targetModelId: Id64String) {
    super(sourceDb, targetDb);
    this._targetModelId = targetModelId;
    this.importer.doNotUpdateElementIds.add(targetModelId);
  }
  /** Override shouldExportElement to remap PhysicalPartition instances. */
  protected shouldExportElement(sourceElement: Element): boolean {
    if (sourceElement instanceof PhysicalPartition) {
      this.context.remapElement(sourceElement.id, this._targetModelId);
      // NOTE: must allow export to continue so the PhysicalModel sub-modeling the PhysicalPartition is processed
    }
    return super.shouldExportElement(sourceElement);
  }
}

/** Test IModelTransformer that uses a SpatialViewDefinition to filter the iModel contents. */
export class FilterByViewTransformer extends IModelTransformer {
  private readonly _exportViewDefinitionId: Id64String;
  private readonly _exportModelSelectorId: Id64String;
  private readonly _exportCategorySelectorId: Id64String;
  private readonly _exportDisplayStyleId: Id64String;
  private readonly _exportModelIds: Id64Set;
  public constructor(sourceDb: IModelDb, targetDb: IModelDb, exportViewDefinitionId: Id64String) {
    super(sourceDb, targetDb);
    this._exportViewDefinitionId = exportViewDefinitionId;
    const exportViewDefinition = sourceDb.elements.getElement<SpatialViewDefinition>(exportViewDefinitionId, SpatialViewDefinition);
    this._exportCategorySelectorId = exportViewDefinition.categorySelectorId;
    this._exportModelSelectorId = exportViewDefinition.modelSelectorId;
    this._exportDisplayStyleId = exportViewDefinition.displayStyleId;
    const exportCategorySelector = sourceDb.elements.getElement<CategorySelector>(exportViewDefinition.categorySelectorId, CategorySelector);
    this.excludeCategoriesExcept(Id64.toIdSet(exportCategorySelector.categories));
    const exportModelSelector = sourceDb.elements.getElement<ModelSelector>(exportViewDefinition.modelSelectorId, ModelSelector);
    this._exportModelIds = Id64.toIdSet(exportModelSelector.models);
  }
  /** Excludes categories not referenced by the export view's CategorySelector */
  private excludeCategoriesExcept(exportCategoryIds: Id64Set): void {
    const sql = `SELECT ECInstanceId FROM ${SpatialCategory.classFullName}`;
    this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const categoryId = statement.getValue(0).getId();
        if (!exportCategoryIds.has(categoryId)) {
          this.exporter.excludeElementsInCategory(categoryId);
        }
      }
    });
  }
  /** Override of IModelTransformer.shouldExportElement that excludes other ViewDefinition-related elements that are not associated with the *export* ViewDefinition. */
  protected shouldExportElement(sourceElement: Element): boolean {
    if (sourceElement instanceof PhysicalPartition) {
      return this._exportModelIds.has(sourceElement.id);
    } else if (sourceElement instanceof SpatialViewDefinition) {
      return sourceElement.id === this._exportViewDefinitionId;
    } else if (sourceElement instanceof CategorySelector) {
      return sourceElement.id === this._exportCategorySelectorId;
    } else if (sourceElement instanceof ModelSelector) {
      return sourceElement.id === this._exportModelSelectorId;
    } else if (sourceElement instanceof DisplayStyle3d) {
      return sourceElement.id === this._exportDisplayStyleId;
    }
    return super.shouldExportElement(sourceElement);
  }
}

/** Specialization of IModelTransformer for testing */
export class TestIModelTransformer extends IModelTransformer {
  public constructor(source: IModelDb | IModelExporter, target: IModelDb | IModelImporter) {
    super(source, target);
    this.initExclusions();
    this.initCodeSpecRemapping();
    this.initCategoryRemapping();
    this.initClassRemapping();
    this.initSubCategoryFilters();
  }

  /** Initialize some sample exclusion rules for testing */
  private initExclusions(): void {
    this.exporter.excludeCodeSpec("ExtraCodeSpec");
    this.exporter.excludeElementClass(AuxCoordSystem.classFullName); // want to exclude AuxCoordSystem2d/3d
    this.exporter.excludeElement(this.sourceDb.elements.queryElementIdByCode(Subject.createCode(this.sourceDb, IModel.rootSubjectId, "Only in Source"))!);
    this.exporter.excludeRelationshipClass("TestTransformerSource:SourceRelToExclude");
    this.exporter.excludeElementAspectClass("TestTransformerSource:SourceUniqueAspectToExclude");
    this.exporter.excludeElementAspectClass("TestTransformerSource:SourceMultiAspectToExclude");
  }

  /** Initialize some CodeSpec remapping rules for testing */
  private initCodeSpecRemapping(): void {
    this.context.remapCodeSpec("SourceCodeSpec", "TargetCodeSpec");
  }

  /** Initialize some category remapping rules for testing */
  private initCategoryRemapping(): void {
    const subjectId = this.sourceDb.elements.queryElementIdByCode(Subject.createCode(this.sourceDb, IModel.rootSubjectId, "Subject"))!;
    const definitionModelId = this.sourceDb.elements.queryElementIdByCode(InformationPartitionElement.createCode(this.sourceDb, subjectId, "Definition"))!;
    const sourceCategoryId = this.sourceDb.elements.queryElementIdByCode(SpatialCategory.createCode(this.sourceDb, definitionModelId, "SourcePhysicalCategory"))!;
    const targetCategoryId = this.targetDb.elements.queryElementIdByCode(SpatialCategory.createCode(this.targetDb, IModel.dictionaryId, "TargetPhysicalCategory"))!;
    assert.isTrue(Id64.isValidId64(subjectId) && Id64.isValidId64(definitionModelId) && Id64.isValidId64(sourceCategoryId) && Id64.isValidId64(targetCategoryId));
    this.context.remapElement(sourceCategoryId, targetCategoryId);
    this.exporter.excludeElement(sourceCategoryId); // Don't process a specifically remapped element
  }

  /** Initialize some class remapping rules for testing */
  private initClassRemapping(): void {
    this.context.remapElementClass("TestTransformerSource:SourcePhysicalElement", "TestTransformerTarget:TargetPhysicalElement");
    this.context.remapElementClass("TestTransformerSource:SourcePhysicalElementUsesCommonDefinition", "TestTransformerTarget:TargetPhysicalElementUsesCommonDefinition");
    this.context.remapElementClass("TestTransformerSource:SourceInformationRecord", "TestTransformerTarget:TargetInformationRecord");
  }

  /** */
  private initSubCategoryFilters(): void {
    assert.isFalse(this.context.hasSubCategoryFilter);
    const sql = `SELECT ECInstanceId FROM ${SubCategory.classFullName} WHERE CodeValue=:codeValue`;
    this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      statement.bindString("codeValue", "FilteredSubCategory");
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const subCategoryId = statement.getValue(0).getId();
        assert.isFalse(this.context.isSubCategoryFiltered(subCategoryId));
        this.context.filterSubCategory(subCategoryId);
        this.exporter.excludeElement(subCategoryId);
        assert.isTrue(this.context.isSubCategoryFiltered(subCategoryId));
      }
    });
    assert.isTrue(this.context.hasSubCategoryFilter);
  }

  /** Override shouldExportElement to exclude all elements from the Functional schema. */
  public shouldExportElement(sourceElement: Element): boolean {
    return sourceElement.classFullName.startsWith(FunctionalSchema.schemaName) ? false : super.shouldExportElement(sourceElement);
  }

  /** Override transformElement to make sure that all target Elements have a FederationGuid */
  protected onTransformElement(sourceElement: Element): ElementProps {
    const targetElementProps: any = super.onTransformElement(sourceElement);
    if (!targetElementProps.federationGuid) {
      targetElementProps.federationGuid = Guid.createValue();
    }
    if ("TestTransformerSource:SourcePhysicalElement" === sourceElement.classFullName) {
      targetElementProps.targetString = sourceElement.asAny.sourceString;
      targetElementProps.targetDouble = sourceElement.asAny.sourceDouble;
      targetElementProps.targetBinary = sourceElement.asAny.sourceBinary;
      targetElementProps.targetNavigation = {
        id: this.context.findTargetElementId(sourceElement.asAny.sourceNavigation.id),
        relClassName: "TestTransformerTarget:TargetPhysicalElementUsesTargetDefinition",
      };
    } else if ("TestTransformerSource:SourceInformationRecord" === sourceElement.classFullName) {
      targetElementProps.targetString = sourceElement.asAny.sourceString;
    }
    return targetElementProps;
  }

  /** Override transformElementAspect to remap Source*Aspect --> Target*Aspect */
  protected onTransformElementAspect(sourceElementAspect: ElementAspect, targetElementId: Id64String): ElementAspectProps {
    const targetElementAspectProps: any = super.onTransformElementAspect(sourceElementAspect, targetElementId);
    if ("TestTransformerSource:SourceUniqueAspect" === sourceElementAspect.classFullName) {
      targetElementAspectProps.classFullName = "TestTransformerTarget:TargetUniqueAspect";
      targetElementAspectProps.targetDouble = targetElementAspectProps.sourceDouble;
      targetElementAspectProps.sourceDouble = undefined;
      targetElementAspectProps.targetString = targetElementAspectProps.sourceString;
      targetElementAspectProps.sourceString = undefined;
      targetElementAspectProps.targetLong = targetElementAspectProps.sourceLong; // Id64 value was already remapped by super.transformElementAspect()
      targetElementAspectProps.sourceLong = undefined;
      targetElementAspectProps.targetGuid = targetElementAspectProps.sourceGuid;
      targetElementAspectProps.sourceGuid = undefined;
    } else if ("TestTransformerSource:SourceMultiAspect" === sourceElementAspect.classFullName) {
      targetElementAspectProps.classFullName = "TestTransformerTarget:TargetMultiAspect";
      targetElementAspectProps.targetDouble = targetElementAspectProps.sourceDouble;
      targetElementAspectProps.sourceDouble = undefined;
      targetElementAspectProps.targetString = targetElementAspectProps.sourceString;
      targetElementAspectProps.sourceString = undefined;
      targetElementAspectProps.targetLong = targetElementAspectProps.sourceLong; // Id64 value was already remapped by super.transformElementAspect()
      targetElementAspectProps.sourceLong = undefined;
      targetElementAspectProps.targetGuid = targetElementAspectProps.sourceGuid;
      targetElementAspectProps.sourceGuid = undefined;
    }
    return targetElementAspectProps;
  }

  /** Override transformRelationship to remap SourceRelWithProps --> TargetRelWithProps */
  protected onTransformRelationship(sourceRelationship: Relationship): RelationshipProps {
    const targetRelationshipProps: any = super.onTransformRelationship(sourceRelationship);
    if ("TestTransformerSource:SourceRelWithProps" === sourceRelationship.classFullName) {
      targetRelationshipProps.classFullName = "TestTransformerTarget:TargetRelWithProps";
      targetRelationshipProps.targetString = targetRelationshipProps.sourceString;
      targetRelationshipProps.sourceString = undefined;
      targetRelationshipProps.targetDouble = targetRelationshipProps.sourceDouble;
      targetRelationshipProps.sourceDouble = undefined;
      targetRelationshipProps.targetLong = targetRelationshipProps.sourceLong; // Id64 value was already remapped by super.transformRelationship()
      targetRelationshipProps.sourceLong = undefined;
      targetRelationshipProps.targetGuid = targetRelationshipProps.sourceGuid;
      targetRelationshipProps.sourceGuid = undefined;
    }
    return targetRelationshipProps;
  }
}

/** Specialization of IModelImporter that counts the number of times each callback is called. */
export class CountingIModelImporter extends IModelImporter {
  public numModelsInserted: number = 0;
  public numModelsUpdated: number = 0;
  public numElementsInserted: number = 0;
  public numElementsUpdated: number = 0;
  public numElementsDeleted: number = 0;
  public numElementAspectsInserted: number = 0;
  public numElementAspectsUpdated: number = 0;
  public numRelationshipsInserted: number = 0;
  public numRelationshipsUpdated: number = 0;
  public numRelationshipsDeleted: number = 0;
  public constructor(targetDb: IModelDb) {
    super(targetDb);
  }
  protected onInsertModel(modelProps: ModelProps): Id64String {
    this.numModelsInserted++;
    return super.onInsertModel(modelProps);
  }
  protected onUpdateModel(modelProps: ModelProps): void {
    this.numModelsUpdated++;
    super.onUpdateModel(modelProps);
  }
  protected onInsertElement(elementProps: ElementProps): Id64String {
    this.numElementsInserted++;
    return super.onInsertElement(elementProps);
  }
  protected onUpdateElement(elementProps: ElementProps): void {
    this.numElementsUpdated++;
    super.onUpdateElement(elementProps);
  }
  protected onDeleteElement(elementId: Id64String): void {
    this.numElementsDeleted++;
    super.onDeleteElement(elementId);
  }
  protected onInsertElementAspect(aspectProps: ElementAspectProps): void {
    this.numElementAspectsInserted++;
    super.onInsertElementAspect(aspectProps);
  }
  protected onUpdateElementAspect(aspectProps: ElementAspectProps): void {
    this.numElementAspectsUpdated++;
    super.onUpdateElementAspect(aspectProps);
  }
  protected onInsertRelationship(relationshipProps: RelationshipProps): Id64String {
    this.numRelationshipsInserted++;
    return super.onInsertRelationship(relationshipProps);
  }
  protected onUpdateRelationship(relationshipProps: RelationshipProps): void {
    this.numRelationshipsUpdated++;
    super.onUpdateRelationship(relationshipProps);
  }
  protected onDeleteRelationship(relationshipProps: RelationshipProps): void {
    this.numRelationshipsDeleted++;
    super.onDeleteRelationship(relationshipProps);
  }
}

/** Specialization of IModelImporter that creates an InformationRecordElement for each PhysicalElement that it imports. */
export class RecordingIModelImporter extends CountingIModelImporter {
  public constructor(targetDb: IModelDb) {
    super(targetDb);
  }
  protected onInsertModel(modelProps: ModelProps): Id64String {
    const modelId: Id64String = super.onInsertModel(modelProps);
    const model: Model = this.targetDb.models.getModel(modelId);
    if (model instanceof PhysicalModel) {
      const modeledElement: Element = this.targetDb.elements.getElement(model.modeledElement.id);
      if (modeledElement instanceof PhysicalPartition) {
        const parentSubjectId: Id64String = modeledElement.parent!.id; // InformationPartitionElements are always parented to Subjects
        const recordPartitionId: Id64String = InformationRecordModel.insert(this.targetDb, parentSubjectId, `Records for ${model.name}`);
        this.targetDb.relationships.insertInstance({
          classFullName: "TestTransformerTarget:PhysicalPartitionIsTrackedByRecords",
          sourceId: modeledElement.id,
          targetId: recordPartitionId,
        });
      }
    }
    return modelId;
  }
  protected onInsertElement(elementProps: ElementProps): Id64String {
    const elementId: Id64String = super.onInsertElement(elementProps);
    const element: Element = this.targetDb.elements.getElement(elementId);
    if (element instanceof PhysicalElement) {
      const recordPartitionId: Id64String = this.getRecordPartitionId(element.model);
      if (Id64.isValidId64(recordPartitionId)) {
        this.insertAuditRecord("Insert", recordPartitionId, element);
      }
    }
    return elementId;
  }
  protected onUpdateElement(elementProps: ElementProps): void {
    super.onUpdateElement(elementProps);
    const element: Element = this.targetDb.elements.getElement(elementProps.id!);
    if (element instanceof PhysicalElement) {
      const recordPartitionId: Id64String = this.getRecordPartitionId(element.model);
      if (Id64.isValidId64(recordPartitionId)) {
        this.insertAuditRecord("Update", recordPartitionId, element);
      }
    }
  }
  protected onDeleteElement(elementId: Id64String): void {
    const element: Element = this.targetDb.elements.getElement(elementId);
    if (element instanceof PhysicalElement) {
      const recordPartitionId: Id64String = this.getRecordPartitionId(element.model);
      if (Id64.isValidId64(recordPartitionId)) {
        this.insertAuditRecord("Delete", recordPartitionId, element);
      }
    }
    super.onDeleteElement(elementId); // delete element after AuditRecord is inserted
  }
  private getRecordPartitionId(physicalPartitionId: Id64String): Id64String {
    const sql = "SELECT TargetECInstanceId FROM TestTransformerTarget:PhysicalPartitionIsTrackedByRecords WHERE SourceECInstanceId=:physicalPartitionId";
    return this.targetDb.withPreparedStatement(sql, (statement: ECSqlStatement): Id64String => {
      statement.bindId("physicalPartitionId", physicalPartitionId);
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getId() : Id64.invalid;
    });
  }
  private insertAuditRecord(operation: string, recordPartitionId: Id64String, physicalElement: PhysicalElement): Id64String {
    const auditRecord: any = {
      classFullName: "TestTransformerTarget:AuditRecord",
      model: recordPartitionId,
      code: Code.createEmpty(),
      userLabel: `${operation} of ${physicalElement.getDisplayLabel()} at ${new Date()}`,
      operation,
      physicalElement: { id: physicalElement.id },
    };
    return this.targetDb.elements.insertElement(auditRecord);
  }
}

/** Specialization of IModelExport that exports to an output text file. */
export class IModelToTextFileExporter extends IModelExportHandler {
  public outputFileName: string;
  public exporter: IModelExporter;
  private _shouldIndent: boolean = true;
  private _firstFont: boolean = true;
  private _firstRelationship: boolean = true;
  public constructor(sourceDb: IModelDb, outputFileName: string) {
    super();
    this.outputFileName = outputFileName;
    this.exporter = new IModelExporter(sourceDb);
    this.exporter.registerHandler(this);
    this.exporter.wantGeometry = false;
  }
  public async export(): Promise<void> {
    this._shouldIndent = true;
    await this.exporter.exportSchemas();
    this.writeSeparator();
    await this.exporter.exportAll();
  }
  public async exportChanges(requestContext: AuthorizedClientRequestContext, startChangeSetId?: string): Promise<void> {
    this._shouldIndent = false;
    return this.exporter.exportChanges(requestContext, startChangeSetId);
  }
  private writeLine(line: string, indentLevel: number = 0): void {
    if (this._shouldIndent) {
      for (let i = 0; i < indentLevel; i++) {
        IModelJsFs.appendFileSync(this.outputFileName, "  ");
      }
    }
    IModelJsFs.appendFileSync(this.outputFileName, line);
    IModelJsFs.appendFileSync(this.outputFileName, "\n");
  }
  private writeSeparator(): void {
    this.writeLine("--------------------------------");
  }
  private formatOperationName(isUpdate: boolean | undefined): string {
    if (undefined === isUpdate) return "";
    return isUpdate ? ", UPDATE" : ", INSERT";
  }
  private getIndentLevelForElement(element: Element): number {
    if (!this._shouldIndent) {
      return 0;
    }
    if ((undefined !== element.parent) && (Id64.isValidId64(element.parent.id))) {
      const parentElement: Element = this.exporter.sourceDb.elements.getElement(element.parent.id);
      return 1 + this.getIndentLevelForElement(parentElement);
    }
    return 1;
  }
  private getIndentLevelForElementAspect(aspect: ElementAspect): number {
    if (!this._shouldIndent) {
      return 0;
    }
    const element: Element = this.exporter.sourceDb.elements.getElement(aspect.element.id);
    return 1 + this.getIndentLevelForElement(element);
  }
  protected async onExportSchema(schema: Schema): Promise<void> {
    this.writeLine(`[Schema] ${schema.name}`);
    return super.onExportSchema(schema);
  }
  protected onExportCodeSpec(codeSpec: CodeSpec, isUpdate: boolean | undefined): void {
    this.writeLine(`[CodeSpec] ${codeSpec.id}, ${codeSpec.name}${this.formatOperationName(isUpdate)}`);
    super.onExportCodeSpec(codeSpec, isUpdate);
  }
  protected onExportFont(font: FontProps, isUpdate: boolean | undefined): void {
    if (this._firstFont) {
      this.writeSeparator();
      this._firstFont = false;
    }
    this.writeLine(`[Font] ${font.id}, ${font.name}`);
    super.onExportFont(font, isUpdate);
  }
  protected onExportModel(model: Model, isUpdate: boolean | undefined): void {
    this.writeSeparator();
    this.writeLine(`[Model] ${model.classFullName}, ${model.id}, ${model.name}${this.formatOperationName(isUpdate)}`);
    super.onExportModel(model, isUpdate);
  }
  protected onExportElement(element: Element, isUpdate: boolean | undefined): void {
    const indentLevel: number = this.getIndentLevelForElement(element);
    this.writeLine(`[Element] ${element.classFullName}, ${element.id}, ${element.getDisplayLabel()}${this.formatOperationName(isUpdate)}`, indentLevel);
    super.onExportElement(element, isUpdate);
  }
  protected onDeleteElement(elementId: Id64String): void {
    this.writeLine(`[Element] ${elementId}, DELETE`);
    super.onDeleteElement(elementId);
  }
  protected onExportElementUniqueAspect(aspect: ElementUniqueAspect, isUpdate: boolean | undefined): void {
    const indentLevel: number = this.getIndentLevelForElementAspect(aspect);
    this.writeLine(`[Aspect] ${aspect.classFullName}, ${aspect.id}${this.formatOperationName(isUpdate)}`, indentLevel);
    super.onExportElementUniqueAspect(aspect, isUpdate);
  }
  protected onExportElementMultiAspects(aspects: ElementMultiAspect[]): void {
    const indentLevel: number = this.getIndentLevelForElementAspect(aspects[0]);
    for (const aspect of aspects) {
      this.writeLine(`[Aspect] ${aspect.classFullName}, ${aspect.id}`, indentLevel);
    }
    super.onExportElementMultiAspects(aspects);
  }
  protected onExportRelationship(relationship: Relationship, isUpdate: boolean | undefined): void {
    if (this._firstRelationship) {
      this.writeSeparator();
      this._firstRelationship = false;
    }
    this.writeLine(`[Relationship] ${relationship.classFullName}, ${relationship.id}${this.formatOperationName(isUpdate)}`);
    super.onExportRelationship(relationship, isUpdate);
  }
  protected onDeleteRelationship(relInstanceId: Id64String): void {
    this.writeLine(`[Relationship] ${relInstanceId}, DELETE`);
    super.onDeleteRelationship(relInstanceId);
  }
}

/** Specialization of IModelExport that counts occurrences of classes. */
export class ClassCounter extends IModelExportHandler {
  public outputFileName: string;
  public exporter: IModelExporter;
  private _modelClassCounts: Map<string, number> = new Map<string, number>();
  private _elementClassCounts: Map<string, number> = new Map<string, number>();
  private _aspectClassCounts: Map<string, number> = new Map<string, number>();
  private _relationshipClassCounts: Map<string, number> = new Map<string, number>();
  public constructor(sourceDb: IModelDb, outputFileName: string) {
    super();
    this.outputFileName = outputFileName;
    this.exporter = new IModelExporter(sourceDb);
    this.exporter.registerHandler(this);
    this.exporter.wantGeometry = false;
  }
  public async count(): Promise<void> {
    await this.exporter.exportAll();
    this.outputAllClassCounts();
  }
  private incrementClassCount(map: Map<string, number>, classFullName: string): void {
    const count: number | undefined = map.get(classFullName);
    if (undefined === count) {
      map.set(classFullName, 1);
    } else {
      map.set(classFullName, 1 + count);
    }
  }
  private sortClassCounts(map: Map<string, number>): any[] {
    return Array.from(map).sort((a: [string, number], b: [string, number]): number => {
      if (a[1] === b[1]) {
        return a[0] > b[0] ? 1 : -1;
      } else {
        return a[1] > b[1] ? -1 : 1;
      }
    });
  }
  private outputAllClassCounts(): void {
    this.outputClassCounts("Model", this.sortClassCounts(this._modelClassCounts));
    this.outputClassCounts("Element", this.sortClassCounts(this._elementClassCounts));
    this.outputClassCounts("ElementAspect", this.sortClassCounts(this._aspectClassCounts));
    this.outputClassCounts("Relationship", this.sortClassCounts(this._relationshipClassCounts));
  }
  private outputClassCounts(title: string, classCounts: Array<[string, number]>): void {
    IModelJsFs.appendFileSync(this.outputFileName, `=== ${title} Class Counts ===\n`);
    classCounts.forEach((value: [string, number]) => {
      IModelJsFs.appendFileSync(this.outputFileName, `${value[1]}, ${value[0]}\n`);
    });
    IModelJsFs.appendFileSync(this.outputFileName, `\n`);
  }
  protected onExportModel(model: Model, isUpdate: boolean | undefined): void {
    this.incrementClassCount(this._modelClassCounts, model.classFullName);
    super.onExportModel(model, isUpdate);
  }
  protected onExportElement(element: Element, isUpdate: boolean | undefined): void {
    this.incrementClassCount(this._elementClassCounts, element.classFullName);
    super.onExportElement(element, isUpdate);
  }
  protected onExportElementUniqueAspect(aspect: ElementUniqueAspect, isUpdate: boolean | undefined): void {
    this.incrementClassCount(this._aspectClassCounts, aspect.classFullName);
    super.onExportElementUniqueAspect(aspect, isUpdate);
  }
  protected onExportElementMultiAspects(aspects: ElementMultiAspect[]): void {
    for (const aspect of aspects) {
      this.incrementClassCount(this._aspectClassCounts, aspect.classFullName);
    }
    super.onExportElementMultiAspects(aspects);
  }
  protected onExportRelationship(relationship: Relationship, isUpdate: boolean | undefined): void {
    this.incrementClassCount(this._relationshipClassCounts, relationship.classFullName);
    super.onExportRelationship(relationship, isUpdate);
  }
}
