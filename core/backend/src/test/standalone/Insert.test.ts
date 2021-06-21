/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { IModelDb, StandaloneDb } from "../../IModelDb";
import { getGeomPart } from "./GeomPart";
import { Code, GeometryPartProps } from "@bentley/imodeljs-common";
import { GeometryPart } from "../../Element";
import { IModelTestUtils } from "../IModelTestUtils";
import { Guid, Id64 } from "@bentley/bentleyjs-core";
import { RenderMaterialElement} from "../../imodeljs-backend";

describe.only("Testing insert", async () => {
  it("", async () => {

    const imodel = StandaloneDb.createEmpty(IModelTestUtils.prepareOutputFile("Category", "Category.bim"), {
      rootSubject: { name: "Category tests", description: "Category tests" },
      client: "Category",
      globalOrigin: { x: 0, y: 0 },
      projectExtents: { low: { x: -500, y: -500, z: -50 }, high: { x: 500, y: 500, z: 50 } },
      guid: Guid.createValue(),
    });

    const renderParams: RenderMaterialElement.Params = {
      description: "Field Weld",
      color: [0.9058, 0.298, 0.2352],
      diffuse: 0.5,
      finish: 0.15,
      paletteName: "MyPalette",
      reflectColor: [0.9, 0.3, 0.25],
      specularColor: [0.2, 0.2, 0.2],
    };

    const materialId = RenderMaterialElement.insert(imodel, IModelDb.dictionaryId, "FieldWeldMaterial", renderParams);
    expect(Id64.isValidId64(materialId)).to.be.true;

    // const builder = new GeometryStreamBuilder();

    const props: GeometryPartProps = {
      model: IModelDb.dictionaryId,
      code: Code.createEmpty(),
      classFullName: GeometryPart.classFullName,
    };
    props.geom = getGeomPart();

    imodel.elements.insertElement(props);

  });
});
