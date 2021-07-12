/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Guid, Id64, Id64String } from "@bentley/bentleyjs-core";
import { Matrix3d, Range3d, StandardViewIndex, Transform, YawPitchRollAngles } from "@bentley/geometry-core";
import { Camera, Code, ColorDef, ElementProps, IModel, IModelError, SpatialViewDefinitionProps, SubCategoryAppearance } from "@bentley/imodeljs-common";
import { assert } from "chai";
import { CategorySelector, DictionaryModel, DisplayStyle3d, IModelDb, ModelSelector, SpatialCategory, SpatialViewDefinition, StandaloneDb } from "../../imodeljs-backend";
import { IModelTestUtils } from "../IModelTestUtils";

function createNewModelAndCategory(rwIModel: IModelDb, parent?: Id64String) {
  const modelId = IModelTestUtils.createAndInsertPhysicalPartition(rwIModel, IModelTestUtils.getUniqueModelCode(rwIModel, "newPhysicalModel"), parent);
  const dictionary: DictionaryModel = rwIModel.models.getModel<DictionaryModel>(IModel.dictionaryId);
  const newCategoryCode = IModelTestUtils.getUniqueSpatialCategoryCode(dictionary, "ThisTestSpatialCategory");
  const category = SpatialCategory.create(rwIModel, IModel.dictionaryId, newCategoryCode.value);

  const spatialCategoryId = rwIModel.elements.insertElement(category);
  category.setDefaultAppearance(new SubCategoryAppearance({ color: 0xff0000 }));
  return { modelId, spatialCategoryId };
}

describe("ViewDefinition", () => {
  let iModel: StandaloneDb;
  before(() => {
    iModel = StandaloneDb.createEmpty(IModelTestUtils.prepareOutputFile("ViewDefinition", "ViewDefinition.bim"), {
      rootSubject: { name: "ViewDefinition tests", description: "ViewDefinition tests" },
      client: "ViewDefinition",
      globalOrigin: { x: 0, y: 0 },
      projectExtents: { low: { x: -500, y: -500, z: -50 }, high: { x: 500, y: 500, z: 50 } },
      guid: Guid.createValue(),
    });
  });

  after(() => {
    iModel.abandonChanges();
    iModel.close();
  });

  it("create SpatialViewDefinition and throw errors on bad input", () => {
    const { modelId, spatialCategoryId } = createNewModelAndCategory(iModel);
    const displayStyleId = DisplayStyle3d.insert(iModel, IModel.dictionaryId, "default", { backgroundColor: ColorDef.fromString("rgb(255,0,0)") });
    const modelSelectorId = ModelSelector.insert(iModel, IModel.dictionaryId, "default", [modelId]);
    const categorySelectorId = CategorySelector.insert(iModel, IModel.dictionaryId, "default", [spatialCategoryId]);
    iModel.saveChanges("Basic setup");

    const standardView = StandardViewIndex.Iso;
    const rotation = Matrix3d.createStandardWorldToView(standardView);
    const angles = YawPitchRollAngles.createFromMatrix3d(rotation);
    const rotationTransform = Transform.createOriginAndMatrix(undefined, rotation);
    const range = new Range3d(1, 1, 1, 8, 8, 8);
    const rotatedRange = rotationTransform.multiplyRange(range);
    const basicProps = {
      code: Code.createEmpty(),
      model: IModel.dictionaryId,
      classFullName: "BisCore:SpatialViewDefinition",
      cameraOn: false,
      origin: rotation.multiplyTransposeXYZ(rotatedRange.low.x, rotatedRange.low.y, rotatedRange.low.z),
      extents: rotatedRange.diagonal(),
      angles,
      camera: new Camera(),
    };

    // attempt to create a ViewDefinition element with invalid properties
    assert.throws(() => iModel.elements.createElement({ ...basicProps, modelSelectorId, categorySelectorId } as ElementProps), IModelError, "displayStyleId is invalid");
    assert.throws(() => iModel.elements.createElement({ ...basicProps, categorySelectorId, displayStyleId } as ElementProps), IModelError, "modelSelectorId is invalid");
    assert.throws(() => iModel.elements.createElement({ ...basicProps, modelSelectorId, displayStyleId } as ElementProps), IModelError, "categorySelectorId is invalid");

    // attempt to insert a ViewDefinition with invalid properties
    assert.throws(() => iModel.elements.insertElement({ ...basicProps, modelSelectorId, categorySelectorId, displayStyleId: modelId } as ElementProps), IModelError, "invalid displayStyle");
    assert.throws(() => iModel.elements.insertElement({ ...basicProps, modelSelectorId: modelId, displayStyleId, categorySelectorId } as ElementProps), IModelError, "invalid modelSelector");
    assert.throws(() => iModel.elements.insertElement({ ...basicProps, modelSelectorId, categorySelectorId: modelId, displayStyleId } as ElementProps), IModelError, "invalid categorySelector");

    // Better way to create and insert
    const props: SpatialViewDefinitionProps = { ...basicProps, modelSelectorId, categorySelectorId, displayStyleId };
    const viewDefinition = iModel.elements.createElement<SpatialViewDefinition>(props);
    let viewDefinitionId = iModel.elements.insertElement(viewDefinition);
    assert.isNotEmpty(viewDefinitionId);
    assert.isTrue(Id64.isValid(viewDefinitionId));

    // Best way to create and insert
    viewDefinitionId = SpatialViewDefinition.insertWithCamera(iModel, IModel.dictionaryId, "default", modelSelectorId, categorySelectorId, displayStyleId, iModel.projectExtents);
    iModel.views.setDefaultViewId(viewDefinitionId);
  });

});
