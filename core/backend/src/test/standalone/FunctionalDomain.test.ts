/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { join } from "path";
import { Guid, Id64, Id64String } from "@bentley/bentleyjs-core";
import { Code, CodeScopeSpec, CodeSpec, ElementProps, FunctionalElementProps, IModel, IModelError } from "@bentley/imodeljs-common";
import { ClassRegistry } from "../../ClassRegistry";
import { ElementUniqueAspect, OnAspectIdArg, OnAspectPropsArg } from "../../ElementAspect";
import {
  BackendRequestContext, FunctionalBreakdownElement, FunctionalComponentElement, FunctionalModel, FunctionalPartition, FunctionalSchema,
  InformationPartitionElement, OnChildElementIdArg, OnChildElementPropsArg, OnElementIdArg, OnElementInModelIdArg, OnElementInModelPropsArg,
  OnElementPropsArg, OnModelIdArg, OnModelPropsArg, OnSubModelIdArg, OnSubModelPropsArg, Schemas, StandaloneDb,
} from "../../imodeljs-backend";
import { ElementOwnsChildElements, ElementOwnsUniqueAspect, SubjectOwnsPartitionElements } from "../../NavigationRelationship";
import { IModelTestUtils } from "../IModelTestUtils";

let iModelDb: StandaloneDb;

/** test schema for supplying element/model/aspect classes */
class TestSchema extends FunctionalSchema {
  public static get schemaName() { return "TestFunctional"; }
}

/** partition element for testing `Element.onSubModelXxx` methods */
class TestFuncPartition extends InformationPartitionElement {
  public static get className() { return "TestFuncPartition"; }

  public static modelId: Id64String;
  public static nInsert = 0;
  public static nInserted = 0;
  public static nDelete = 0;
  public static nDeleted = 0;

  protected static onSubModelInsert(_arg: OnSubModelPropsArg): void {
    super.onSubModelInsert(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal(_arg.subModelProps.classFullName, TestFuncModel.classFullName);
    this.nInsert++;
  }
  protected static onSubModelInserted(_arg: OnSubModelIdArg): void {
    super.onSubModelInserted(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.modelId = _arg.subModelId;
    this.nInserted++;
  }
  protected static onSubModelDelete(_arg: OnSubModelIdArg): void {
    super.onSubModelDelete(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.modelId = _arg.subModelId;
    this.nDelete++;
  }
  protected static onSubModelDeleted(_arg: OnSubModelIdArg): void {
    super.onSubModelDeleted(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal(this.modelId, _arg.subModelId);
    this.nDeleted++;
  }
}

/** for testing `Model.onXxx` methods */
class TestFuncModel extends FunctionalModel {
  public static get className() { return "TestFuncModel"; }
  public static insertModelId: Id64String;
  public static updateModelId: Id64String;
  public static deleteModelId: Id64String;
  public static insertedId: Id64String;
  public static updatedId: Id64String;
  public static deletedId: Id64String;
  public static dontDelete = "";
  public static nModelInsert = 0;
  public static nModelUpdate = 0;
  public static nModelUpdated = 0;
  public static nModelDelete = 0;
  public static nModelDeleted = 0;
  public static nElemInsert = 0;
  public static nElemUpdate = 0;
  public static nElemDelete = 0;
  protected static onInsert(_arg: OnModelPropsArg): void {
    super.onInsert(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal(_arg.props.classFullName, this.classFullName);
    this.nModelInsert++;
  }
  protected static onInserted(_arg: OnModelIdArg): void {
    super.onInserted(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.insertModelId = _arg.id;
  }
  protected static onUpdate(_arg: OnModelPropsArg): void {
    super.onUpdate(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.nModelUpdate++;
  }
  protected static onUpdated(_arg: OnModelIdArg): void {
    super.onUpdated(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.updateModelId = _arg.id;
    this.nModelUpdated++;
  }
  protected static onDelete(_arg: OnModelIdArg): void {
    super.onDelete(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.nModelDelete++;
  }
  protected static onDeleted(_arg: OnModelIdArg): void {
    super.onDeleted(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.deleteModelId = _arg.id;
    this.nModelDeleted++;
  }
  protected static onInsertElement(_arg: OnElementInModelPropsArg): void {
    super.onInsertElement(_arg);
    assert.equal(_arg.iModel, iModelDb);
    if (_arg.elementProps.code.value === "badval")
      throw new IModelError(100, "bad element");
  }
  protected static onInsertedElement(_arg: OnElementInModelIdArg): void {
    super.onInsertedElement(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.insertedId = _arg.elementId;
  }
  protected static onUpdateElement(_arg: OnElementInModelPropsArg): void {
    super.onUpdateElement(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.nElemUpdate++;
  }
  protected static onUpdatedElement(_arg: OnElementInModelIdArg): void {
    super.onUpdatedElement(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.updatedId = _arg.elementId;
  }
  protected static onDeleteElement(_arg: OnElementInModelIdArg): void {
    super.onDeleteElement(_arg);
    assert.equal(_arg.iModel, iModelDb);
    if (_arg.elementId === this.dontDelete)
      throw new Error("dont delete my element");

    this.nElemDelete++;
  }
  protected static onDeletedElement(_arg: OnElementInModelIdArg): void {
    super.onDeletedElement(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.deletedId = _arg.elementId;
  }
}

/** for testing `Element.onXxx` methods */
class Breakdown extends FunctionalBreakdownElement {
  public static get className() { return "Breakdown"; }
  public static elemId: Id64String;
  public static parentId: Id64String;
  public static childId: Id64String;
  public static childAdd?: Id64String;
  public static childDrop?: Id64String;
  public static dropParent?: Id64String;
  public static addParent?: Id64String;
  public static childAdded?: Id64String;
  public static childDropped?: Id64String;
  public static droppedParent?: Id64String;
  public static addedParent?: Id64String;
  public static props?: Readonly<ElementProps>;
  public static dontDeleteChild = "";
  public static nUpdate = 0;
  public static nUpdated = 0;
  public static nDelete = 0;
  public static nDeleted = 0;

  protected static onInsert(_arg: OnElementPropsArg): void {
    super.onInsert(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal(_arg.props.classFullName, this.classFullName);
    this.props = _arg.props;
  }
  protected static onInserted(_arg: OnElementIdArg): void {
    super.onInserted(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.elemId = _arg.id;
  }
  protected static onUpdate(_arg: OnElementPropsArg): void {
    super.onUpdate(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal(_arg.props.classFullName, this.classFullName);
    this.nUpdate++;
  }
  protected static onUpdated(_arg: OnElementIdArg): void {
    super.onUpdated(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.nUpdated++;
  }
  protected static onDelete(_arg: OnElementIdArg): void {
    super.onDelete(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.nDelete++;
  }
  protected static onDeleted(_arg: OnElementIdArg): void {
    super.onDeleted(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.elemId = _arg.id;
    this.nDeleted++;
  }
  protected static onChildDelete(_arg: OnChildElementIdArg): void {
    super.onChildDelete(_arg);
    assert.equal(_arg.iModel, iModelDb);
    if (_arg.childId === this.dontDeleteChild)
      throw new Error("dont delete my child");
    this.childId = this.childId;
    this.parentId = _arg.parentId;
  }
  protected static onChildDeleted(_arg: OnChildElementIdArg): void {
    super.onChildDeleted(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal(this.childId, _arg.childId);
    assert.equal(_arg.parentId, this.parentId);
  }
  protected static onChildInsert(_arg: OnChildElementPropsArg): void {
    super.onChildInsert(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.parentId = _arg.parentId;
  }
  protected static onChildInserted(_arg: OnChildElementIdArg): void {
    super.onChildInserted(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal(_arg.parentId, this.parentId);
    this.childId = _arg.childId;
  }
  protected static onChildUpdate(_arg: OnChildElementPropsArg): void {
    super.onChildUpdate(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.parentId = _arg.parentId;
  }
  protected static onChildUpdated(_arg: OnChildElementIdArg): void {
    super.onChildUpdated(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal(_arg.parentId, this.parentId);
    this.childId = _arg.childId;
  }
  protected static onChildAdd(_arg: OnChildElementPropsArg): void {
    super.onChildAdd(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.childAdd = _arg.childProps.id;
    this.addParent = _arg.parentId;
  }
  protected static onChildAdded(_arg: OnChildElementIdArg): void {
    super.onChildAdded(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.childAdded = _arg.childId;
    this.addedParent = _arg.parentId;
  }
  protected static onChildDrop(_arg: OnChildElementIdArg): void {
    super.onChildDrop(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.childDrop = _arg.childId;
    this.dropParent = _arg.parentId;
  }
  protected static onChildDropped(_arg: OnChildElementIdArg): void {
    super.onChildDropped(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.childDropped = _arg.childId;
    this.droppedParent = _arg.parentId;
  }
}

/** for testing `ElementAspect.onXxx` methods */
class TestFuncAspect extends ElementUniqueAspect {
  public static get className() { return "TestFuncAspect"; }
  public static expectedVal = "";
  public static elemId: Id64String;
  public static aspectId: Id64String;
  public static nInsert = 0;
  public static nInserted = 0;
  public static nUpdate = 0;
  public static nUpdated = 0;
  public static nDelete = 0;
  public static nDeleted = 0;

  protected static onInsert(_arg: OnAspectPropsArg): void {
    super.onInsert(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal((_arg.props as any).strProp, this.expectedVal);
    this.elemId = _arg.props.element.id;
    this.nInsert++;
  }
  protected static onInserted(_arg: OnAspectPropsArg): void {
    super.onInserted(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal((_arg.props as any).strProp, this.expectedVal);
    assert.equal(this.elemId, _arg.props.element.id);
    this.nInserted++;
  }
  protected static onUpdate(_arg: OnAspectPropsArg): void {
    super.onUpdate(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal((_arg.props as any).strProp, this.expectedVal);
    this.elemId = _arg.props.element.id;
    this.nUpdate++;
  }
  protected static onUpdated(_arg: OnAspectPropsArg): void {
    super.onUpdated(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal((_arg.props as any).strProp, this.expectedVal);
    assert.equal(this.elemId, _arg.props.element.id);
    this.nUpdated++;
  }
  protected static onDelete(_arg: OnAspectIdArg): void {
    super.onDelete(_arg);
    assert.equal(_arg.iModel, iModelDb);
    this.aspectId = _arg.aspectId;
    this.nDelete++;
  }
  protected static onDeleted(_arg: OnAspectIdArg): void {
    super.onDeleted(_arg);
    assert.equal(_arg.iModel, iModelDb);
    assert.equal(_arg.aspectId, this.aspectId);
    this.nDeleted++;
  }
}

class Component extends FunctionalComponentElement {
  public static get className() { return "Component"; }

}

describe("Functional Domain", () => {
  const requestContext = new BackendRequestContext();

  it("should populate FunctionalModel and test Element, Model, and ElementAspect callbacks", async () => {
    iModelDb = StandaloneDb.createEmpty(IModelTestUtils.prepareOutputFile("FunctionalDomain", "FunctionalTest.bim"), {
      rootSubject: { name: "FunctionalTest", description: "Test of the Functional domain schema." },
      client: "Functional",
      globalOrigin: { x: 0, y: 0 },
      projectExtents: { low: { x: -500, y: -500, z: -50 }, high: { x: 500, y: 500, z: 50 } },
      guid: Guid.createValue(),
    });

    iModelDb.nativeDb.resetBriefcaseId(100);

    // Import the Functional schema
    FunctionalSchema.registerSchema();
    Schemas.registerSchema(TestSchema);

    // eslint-disable-next-line @typescript-eslint/naming-convention
    ClassRegistry.registerModule({ TestFuncPartition, TestFuncModel, Breakdown, Component, TestFuncAspect }, TestSchema);

    await FunctionalSchema.importSchema(requestContext, iModelDb); // eslint-disable-line deprecation/deprecation

    let commits = 0;
    let committed = 0;
    const elements = iModelDb.elements;
    const dropCommit = iModelDb.txns.onCommit.addListener(() => commits++);
    const dropCommitted = iModelDb.txns.onCommitted.addListener(() => committed++);
    iModelDb.saveChanges("Import Functional schema");

    assert.equal(commits, 1);
    assert.equal(committed, 1);
    dropCommit();
    dropCommitted();

    IModelTestUtils.flushTxns(iModelDb); // importSchema below will fail if this is not called to flush local changes

    await iModelDb.importSchemas(requestContext, [join(__dirname, "../assets/TestFunctional.ecschema.xml")]);

    iModelDb.saveChanges("Import TestFunctional schema");
    assert.equal(commits, 1);
    assert.equal(committed, 1);

    const codeSpec = CodeSpec.create(iModelDb, "Test Functional Elements", CodeScopeSpec.Type.Model);
    iModelDb.codeSpecs.insert(codeSpec);
    assert.isTrue(Id64.isValidId64(codeSpec.id));

    const partitionCode = FunctionalPartition.createCode(iModelDb, IModel.rootSubjectId, "Test Functional Model");
    const partitionProps = {
      classFullName: TestFuncPartition.classFullName, model: IModel.repositoryModelId,
      parent: new SubjectOwnsPartitionElements(IModel.rootSubjectId), code: partitionCode,
    };

    let partitionId = iModelDb.elements.insertElement(partitionProps);
    const modelId = iModelDb.models.insertModel({ classFullName: TestFuncModel.classFullName, modeledElement: { id: partitionId } });

    assert.isTrue(Id64.isValidId64(modelId));
    assert.equal(TestFuncModel.insertModelId, modelId, "from Model.onInsert");
    assert.equal(TestFuncModel.nModelInsert, 1, "Model.onInsert should be called once");
    assert.equal(TestFuncModel.nModelUpdate, 0, "model insert should not call onUpdate");
    assert.equal(TestFuncModel.nModelUpdated, 0, "model insert should not call onUpdated");
    assert.equal(TestFuncPartition.nInsert, 1, "model insert should call Element.onSubModelInsert");
    assert.equal(TestFuncPartition.nInserted, 1, "model insert should call Element.onSubModelInserted");
    assert.equal(TestFuncPartition.modelId, modelId, "Element.onSubModelInserted should have correct subModelId");

    partitionProps.code.value = "Test Func 2";
    partitionId = iModelDb.elements.insertElement(partitionProps);
    const modelId2 = iModelDb.models.insertModel({ classFullName: TestFuncModel.classFullName, modeledElement: { id: partitionId } });
    assert.isTrue(Id64.isValidId64(modelId2));
    assert.equal(TestFuncModel.insertModelId, modelId2, "second insert should set new id");
    assert.equal(TestFuncModel.nModelInsert, 2, "Model.onInsert should now be called twice");
    assert.equal(TestFuncPartition.nInsert, 2, "model insert should call Element.onSubModelInsert again");
    assert.equal(TestFuncPartition.nInserted, 2, "model insert should call Element.onSubModelInserted again");
    assert.equal(TestFuncPartition.modelId, modelId2, "Element.onSubModelInserted should have correct subModelId again");

    const model2 = iModelDb.models.getModel(modelId2);
    model2.update();
    assert.equal(TestFuncModel.updateModelId, modelId2, "from Model.onUpdate");
    assert.equal(TestFuncModel.nModelUpdate, 1, "Model.onUpdate should be called once");
    assert.equal(TestFuncModel.nModelUpdated, 1, "Model.onUpdated should be called once");

    TestFuncPartition.modelId = ""; // so we can check that delete gets it right
    model2.delete();
    assert.equal(TestFuncModel.deleteModelId, modelId2);
    assert.equal(TestFuncModel.nModelDelete, 1, "Model.onDelete should be called once");
    assert.equal(TestFuncModel.nModelDeleted, 1, "Model.onDeleted should be called once");
    assert.equal(TestFuncPartition.nDelete, 1, "model delete should call Element.onSubModelDelete");
    assert.equal(TestFuncPartition.nDeleted, 1, "model delete should call Element.onSubModelDeleted");
    assert.equal(TestFuncPartition.modelId, modelId2, "Element.onSubModelDeleted should have correct subModelId");

    const breakdownProps = { classFullName: Breakdown.classFullName, model: modelId, code: { spec: codeSpec.id, scope: modelId, value: "Breakdown1" } };
    const breakdownId = elements.insertElement(breakdownProps);
    assert.isTrue(Id64.isValidId64(breakdownId));
    assert.equal(TestFuncModel.insertedId, breakdownId, "from Model.onElementInserted");
    assert.equal(Breakdown.elemId, breakdownId, "from Element.onInserted");
    assert.equal(Breakdown.props, breakdownProps, "from Element.onInsert");

    const breakdown2Props = { classFullName: Breakdown.classFullName, model: modelId, code: { spec: codeSpec.id, scope: modelId, value: "badval" } };
    // TestFuncModel.onInsertElement throws for this code.value
    expect(() => elements.insertElement(breakdown2Props)).to.throw("bad element");

    breakdown2Props.code.value = "Breakdown2";
    Breakdown.props = undefined;
    const bd2 = elements.insertElement(breakdown2Props);

    const aspect = { classFullName: TestFuncAspect.classFullName, element: new ElementOwnsUniqueAspect(bd2), strProp: "prop 1" };

    TestFuncAspect.expectedVal = aspect.strProp;
    elements.insertAspect(aspect);
    assert.equal(TestFuncAspect.elemId, bd2);
    assert.equal(TestFuncAspect.nInsert, 1);
    assert.equal(TestFuncAspect.nInserted, 1);

    aspect.strProp = "prop 2";
    TestFuncAspect.expectedVal = aspect.strProp;
    elements.updateAspect(aspect);
    assert.equal(TestFuncAspect.elemId, bd2);
    assert.equal(TestFuncAspect.nInsert, 1);
    assert.equal(TestFuncAspect.nInserted, 1);
    const aspects = elements.getAspects(bd2, TestFuncAspect.classFullName);
    assert.equal(aspects.length, 1);
    elements.deleteAspect(aspects[0].id);
    assert.equal(TestFuncAspect.aspectId, aspects[0].id);
    assert.equal(TestFuncAspect.nDelete, 1);
    assert.equal(TestFuncAspect.nDeleted, 1);

    const bd2el = elements.getElement(bd2);
    Breakdown.nUpdated = 0;
    bd2el.update();
    assert.equal(Breakdown.nUpdate, 1, "Element.onUpdate should be called once");
    assert.equal(Breakdown.nUpdated, 1, "Element.onUpdated should be called once");

    bd2el.delete();
    assert.equal(Breakdown.elemId, bd2, "from onDelete");
    assert.equal(Breakdown.nDelete, 1, "Element.onDelete should be called once");
    assert.equal(Breakdown.nDeleted, 1, "Element.onDeleted should be called once");

    const breakdown3Props: FunctionalElementProps = {
      classFullName: Breakdown.classFullName,
      model: modelId,
      code: new Code({ spec: codeSpec.id, scope: modelId, value: "bd3" }),
    };
    const bd3 = elements.insertElement(breakdown3Props);

    const componentProps: FunctionalElementProps = {
      classFullName: Component.classFullName,
      model: modelId,
      parent: { id: breakdownId, relClassName: ElementOwnsChildElements.classFullName },
      code: new Code({ spec: codeSpec.id, scope: modelId, value: "Component1" }),
    };
    const componentId = elements.insertElement(componentProps);
    assert.isTrue(Id64.isValidId64(componentId));
    assert.equal(Breakdown.childId, componentId, "Element.onChildInserted should set childId");

    // test model and element callbacks for updateElement
    Breakdown.childId = "";
    Breakdown.elemId = "";
    TestFuncModel.nElemUpdate = 0;
    const compponent1 = elements.getElement(componentId);
    compponent1.update();
    assert.equal(TestFuncModel.nElemUpdate, 1, "Model.onUpdateElement should be called");
    assert.equal(TestFuncModel.updatedId, componentId, "from Model.onUpdatedElement");
    assert.equal(Breakdown.parentId, breakdownId, "from Element.onChildUpdate");
    assert.equal(Breakdown.childId, componentId, "from Element.onChildUpdated");

    componentProps.code.value = "comp2";
    const comp2 = elements.insertElement(componentProps);
    assert.equal(Breakdown.childId, comp2, "from Element.onChildInserted");
    const el2 = elements.getElement(comp2);

    TestFuncModel.nElemDelete = 0;
    TestFuncModel.deletedId = "";
    TestFuncModel.dontDelete = comp2; // block deletion through model
    expect(() => el2.delete()).to.throw("dont delete my element");
    TestFuncModel.dontDelete = ""; // allow deletion through model
    Breakdown.dontDeleteChild = comp2; // but block through parent
    expect(() => el2.delete()).to.throw("dont delete my child"); // nope
    assert.equal(TestFuncModel.nElemDelete, 1, "Model.onElementDelete gets called even though element is not really deleted");
    assert.equal(TestFuncModel.deletedId, "", "make sure Model.onElementDeleted did not get called");
    Breakdown.dontDeleteChild = ""; // now fully allow delete
    el2.delete();
    assert.equal(TestFuncModel.nElemDelete, 2, "Model.onElementDelete should be called again");
    assert.equal(TestFuncModel.deletedId, comp2, "from Model.onElementDeleted");
    assert.equal(Breakdown.childId, comp2, "from Element.onChildDeleted");

    // next we make sure that changing the parent of an element calls the "onChildAdd/Drop/Added/Dropped" callbacks.
    // To do this we switch a component's parent from "breakDownId" to "bc3"
    componentProps.parent!.id = bd3;
    const comp3 = elements.insertElement(componentProps);
    const compEl3 = elements.getElementProps(comp3);
    compEl3.parent!.id = breakdownId;
    elements.updateElement(compEl3);
    assert.equal(Breakdown.addParent, breakdownId, "get parent from Element.onChildAdd");
    assert.equal(Breakdown.dropParent, bd3, "get parent from Element.onChildDrop");
    assert.equal(Breakdown.childAdd, comp3, "get child from Element.onChildAdd");
    assert.equal(Breakdown.childDrop, comp3, "get child from Element.onChildDrop");
    assert.equal(Breakdown.addedParent, breakdownId, "get parent from Element.onChildAdded");
    assert.equal(Breakdown.droppedParent, bd3, "get parent from Element.onChildDropped");
    assert.equal(Breakdown.childAdded, comp3, "get child from Element.onChildAdded");
    assert.equal(Breakdown.childDropped, comp3, "get child from Element.onChildDropped");

    iModelDb.saveChanges("Insert Functional elements");

    // unregister test schema to make sure it will throw exceptions if it is not present (since it has the "SchemaHasBehavior" custom attribute)
    Schemas.unregisterSchema(TestSchema.schemaName);
    const errMsg = "Schema [TestFunctional] not registered, but is marked with SchemaHasBehavior";
    expect(() => elements.deleteElement(breakdownId)).to.throw(errMsg);
    assert.isDefined(elements.getElement(breakdownId), "should not have been deleted");
    expect(() => elements.updateElement(breakdownProps)).to.throw(errMsg);
    breakdownProps.code.value = "Breakdown 2";
    expect(() => elements.insertElement(breakdownProps)).to.throw(errMsg);

    iModelDb.close();
  });
});
