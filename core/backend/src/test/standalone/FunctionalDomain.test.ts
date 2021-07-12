/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { join } from "path";
import { restore as sinonRestore, spy as sinonSpy } from "sinon";
import { Guid, Id64 } from "@bentley/bentleyjs-core";
import { CodeScopeSpec, CodeSpec, ElementProps, IModel } from "@bentley/imodeljs-common";
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
const insertedLabel = "inserted label";
const updatedLabel = "updated label";

/** test schema for supplying element/model/aspect classes */
class TestSchema extends FunctionalSchema {
  public static override get schemaName() { return "TestFunctional"; }
}

/** partition element for testing `Element.onSubModelXxx` methods */
class TestFuncPartition extends InformationPartitionElement {
  public static override get className() { return "TestFuncPartition"; }

  public static override onSubModelInsert(arg: OnSubModelPropsArg): void {
    super.onSubModelInsert(arg);
    assert.equal(arg.iModel, iModelDb);
    assert.equal(arg.subModelProps.classFullName, TestFuncModel.classFullName);
  }
  public static override onSubModelInserted(arg: OnSubModelIdArg): void {
    super.onSubModelInserted(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onSubModelDelete(arg: OnSubModelIdArg): void {
    super.onSubModelDelete(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onSubModelDeleted(arg: OnSubModelIdArg): void {
    super.onSubModelDeleted(arg);
    assert.equal(arg.iModel, iModelDb);
  }
}

/** for testing `Model.onXxx` methods */
class TestFuncModel extends FunctionalModel {
  public static override get className() { return "TestFuncModel"; }
  public static dontDelete = "";

  public static override onInsert(arg: OnModelPropsArg): void {
    super.onInsert(arg);
    assert.equal(arg.iModel, iModelDb);
    assert.equal(arg.props.classFullName, this.classFullName);
  }
  public static override onInserted(arg: OnModelIdArg): void {
    super.onInserted(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onUpdate(arg: OnModelPropsArg): void {
    super.onUpdate(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onUpdated(arg: OnModelIdArg): void {
    super.onUpdated(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onDelete(arg: OnModelIdArg): void {
    super.onDelete(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onDeleted(arg: OnModelIdArg): void {
    super.onDeleted(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onInsertElement(arg: OnElementInModelPropsArg): void {
    super.onInsertElement(arg);
    assert.equal(arg.iModel, iModelDb);
    if (arg.elementProps.code.value === "badval")
      throw new Error("bad element");
  }
  public static override onInsertedElement(arg: OnElementInModelIdArg): void {
    super.onInsertedElement(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onUpdateElement(arg: OnElementInModelPropsArg): void {
    super.onUpdateElement(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onUpdatedElement(arg: OnElementInModelIdArg): void {
    super.onUpdatedElement(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onDeleteElement(arg: OnElementInModelIdArg): void {
    super.onDeleteElement(arg);
    assert.equal(arg.iModel, iModelDb);
    if (arg.elementId === this.dontDelete)
      throw new Error("dont delete my element");
  }
  public static override onDeletedElement(arg: OnElementInModelIdArg): void {
    super.onDeletedElement(arg);
    assert.equal(arg.iModel, iModelDb);
  }
}

/** for testing `Element.onXxx` methods */
class Breakdown extends FunctionalBreakdownElement {
  public static override get className() { return "Breakdown"; }
  public static dontDeleteChild = "";

  public static override onInsert(arg: OnElementPropsArg): void {
    arg.props.userLabel = insertedLabel;
    super.onInsert(arg);
    assert.equal(arg.iModel, iModelDb);
    assert.equal(arg.props.classFullName, this.classFullName);
  }
  public static override onInserted(arg: OnElementIdArg): void {
    super.onInserted(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onUpdate(arg: OnElementPropsArg): void {
    arg.props.userLabel = updatedLabel;
    super.onUpdate(arg);
    assert.equal(arg.iModel, iModelDb);
    assert.equal(arg.props.classFullName, this.classFullName);
  }
  public static override onUpdated(arg: OnElementIdArg): void {
    super.onUpdated(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onDelete(arg: OnElementIdArg): void {
    super.onDelete(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onDeleted(arg: OnElementIdArg): void {
    super.onDeleted(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onChildDelete(arg: OnChildElementIdArg): void {
    super.onChildDelete(arg);
    assert.equal(arg.iModel, iModelDb);
    if (arg.childId === this.dontDeleteChild)
      throw new Error("dont delete my child");
  }
  public static override onChildDeleted(arg: OnChildElementIdArg): void {
    super.onChildDeleted(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onChildInsert(arg: OnChildElementPropsArg): void {
    super.onChildInsert(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onChildInserted(arg: OnChildElementIdArg): void {
    super.onChildInserted(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onChildUpdate(arg: OnChildElementPropsArg): void {
    super.onChildUpdate(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onChildUpdated(arg: OnChildElementIdArg): void {
    super.onChildUpdated(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onChildAdd(arg: OnChildElementPropsArg): void {
    super.onChildAdd(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onChildAdded(arg: OnChildElementIdArg): void {
    super.onChildAdded(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onChildDrop(arg: OnChildElementIdArg): void {
    super.onChildDrop(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onChildDropped(arg: OnChildElementIdArg): void {
    super.onChildDropped(arg);
    assert.equal(arg.iModel, iModelDb);
  }
}

/** for testing `ElementAspect.onXxx` methods */
class TestFuncAspect extends ElementUniqueAspect {
  public static override get className() { return "TestFuncAspect"; }
  public static expectedVal = "";

  public static override onInsert(arg: OnAspectPropsArg): void {
    super.onInsert(arg);
    assert.equal(arg.iModel, iModelDb);
    assert.equal((arg.props as any).strProp, this.expectedVal);
  }
  public static override onInserted(arg: OnAspectPropsArg): void {
    super.onInserted(arg);
    assert.equal(arg.iModel, iModelDb);
    assert.equal((arg.props as any).strProp, this.expectedVal);
  }
  public static override onUpdate(arg: OnAspectPropsArg): void {
    super.onUpdate(arg);
    assert.equal(arg.iModel, iModelDb);
    assert.equal((arg.props as any).strProp, this.expectedVal);
  }
  public static override onUpdated(arg: OnAspectPropsArg): void {
    super.onUpdated(arg);
    assert.equal(arg.iModel, iModelDb);
    assert.equal((arg.props as any).strProp, this.expectedVal);
  }
  public static override onDelete(arg: OnAspectIdArg): void {
    super.onDelete(arg);
    assert.equal(arg.iModel, iModelDb);
  }
  public static override onDeleted(arg: OnAspectIdArg): void {
    super.onDeleted(arg);
    assert.equal(arg.iModel, iModelDb);
  }
}

class Component extends FunctionalComponentElement {
  public static override get className() { return "Component"; }
}

describe("Functional Domain", () => {
  const requestContext = new BackendRequestContext();

  afterEach(() => {
    sinonRestore();
  });

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

    const spy = {
      model: {
        onInsert: sinonSpy(TestFuncModel, "onInsert"),
        onInserted: sinonSpy(TestFuncModel, "onInserted"),
        onUpdate: sinonSpy(TestFuncModel, "onUpdate"),
        onUpdated: sinonSpy(TestFuncModel, "onUpdated"),
        onDelete: sinonSpy(TestFuncModel, "onDelete"),
        onDeleted: sinonSpy(TestFuncModel, "onDeleted"),
        onInsertElement: sinonSpy(TestFuncModel, "onInsertElement"),
        onInsertedElement: sinonSpy(TestFuncModel, "onInsertedElement"),
        onUpdateElement: sinonSpy(TestFuncModel, "onUpdateElement"),
        onUpdatedElement: sinonSpy(TestFuncModel, "onUpdatedElement"),
        onDeleteElement: sinonSpy(TestFuncModel, "onDeleteElement"),
        onDeletedElement: sinonSpy(TestFuncModel, "onDeletedElement"),
      },
      partition: {
        onSubModelInsert: sinonSpy(TestFuncPartition, "onSubModelInsert"),
        onSubModelInserted: sinonSpy(TestFuncPartition, "onSubModelInserted"),
        onSubModelDelete: sinonSpy(TestFuncPartition, "onSubModelDelete"),
        onSubModelDeleted: sinonSpy(TestFuncPartition, "onSubModelDeleted"),
      },
      breakdown: {
        onInsert: sinonSpy(Breakdown, "onInsert"),
        onInserted: sinonSpy(Breakdown, "onInserted"),
        onUpdate: sinonSpy(Breakdown, "onUpdate"),
        onUpdated: sinonSpy(Breakdown, "onUpdated"),
        onDelete: sinonSpy(Breakdown, "onDelete"),
        onDeleted: sinonSpy(Breakdown, "onDeleted"),
        onChildDelete: sinonSpy(Breakdown, "onChildDelete"),
        onChildDeleted: sinonSpy(Breakdown, "onChildDeleted"),
        onChildInsert: sinonSpy(Breakdown, "onChildInsert"),
        onChildInserted: sinonSpy(Breakdown, "onChildInserted"),
        onChildUpdate: sinonSpy(Breakdown, "onChildUpdate"),
        onChildUpdated: sinonSpy(Breakdown, "onChildUpdated"),
        onChildAdd: sinonSpy(Breakdown, "onChildAdd"),
        onChildAdded: sinonSpy(Breakdown, "onChildAdded"),
        onChildDrop: sinonSpy(Breakdown, "onChildDrop"),
        onChildDropped: sinonSpy(Breakdown, "onChildDropped"),
      },
      aspect: {
        onInsert: sinonSpy(TestFuncAspect, "onInsert"),
        onInserted: sinonSpy(TestFuncAspect, "onInserted"),
        onUpdate: sinonSpy(TestFuncAspect, "onUpdate"),
        onUpdated: sinonSpy(TestFuncAspect, "onUpdated"),
        onDelete: sinonSpy(TestFuncAspect, "onDelete"),
        onDeleted: sinonSpy(TestFuncAspect, "onDeleted"),
      },
    };

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
    assert.isTrue(spy.model.onInsert.calledOnce);
    assert.isTrue(spy.model.onInserted.calledOnce);
    assert.equal(spy.model.onInserted.getCall(0).args[0].id, modelId);
    assert.isFalse(spy.model.onUpdate.called, "model insert should not call onUpdate");
    assert.isFalse(spy.model.onUpdated.called, "model insert should not call onUpdated");

    assert.isTrue(spy.partition.onSubModelInsert.calledOnce);
    assert.isTrue(spy.partition.onSubModelInserted.calledOnce);
    assert.equal(spy.partition.onSubModelInserted.getCall(0).args[0].subModelId, modelId, "Element.onSubModelInserted should have correct subModelId");

    partitionProps.code.value = "Test Func 2";
    partitionId = iModelDb.elements.insertElement(partitionProps);
    const modelId2 = iModelDb.models.insertModel({ classFullName: TestFuncModel.classFullName, modeledElement: { id: partitionId } });
    assert.isTrue(Id64.isValidId64(modelId2));
    assert.equal(spy.model.onInserted.getCall(1).args[0].id, modelId2, "second insert should set new id");
    assert.equal(spy.model.onInsert.callCount, 2);
    assert.equal(spy.model.onInserted.callCount, 2);
    assert.equal(spy.partition.onSubModelInserted.getCall(1).args[0].subModelId, modelId2, "Element.onSubModelInserted should have correct subModelId");

    const model2 = iModelDb.models.getModel(modelId2);
    model2.update();
    assert.equal(spy.model.onUpdated.getCall(0).args[0].id, modelId2);
    assert.equal(spy.model.onUpdate.callCount, 1);
    assert.equal(spy.model.onUpdated.callCount, 1);

    model2.delete();
    assert.isTrue(spy.model.onDelete.calledOnce);
    assert.isTrue(spy.model.onDeleted.calledOnce);
    assert.equal(spy.model.onDeleted.getCall(0).args[0].id, modelId2);
    assert.isTrue(spy.partition.onSubModelDelete.calledOnce);
    assert.isTrue(spy.partition.onSubModelDeleted.calledOnce);
    assert.equal(spy.partition.onSubModelDeleted.getCall(0).args[0].subModelId, modelId2);

    const breakdownProps = { classFullName: Breakdown.classFullName, model: modelId, code: { spec: codeSpec.id, scope: modelId, value: "Breakdown1" } };
    const breakdownId = elements.insertElement(breakdownProps);
    assert.isTrue(Id64.isValidId64(breakdownId));
    assert.isTrue(spy.model.onInsertElement.calledOnce);
    assert.isTrue(spy.model.onInsertedElement.calledOnce);
    assert.equal(spy.model.onInsertedElement.getCall(0).args[0].elementId, breakdownId);

    assert.isTrue(spy.breakdown.onInsert.calledOnce);
    assert.isTrue(spy.breakdown.onInserted.calledOnce);
    assert.equal(spy.breakdown.onInserted.getCall(0).args[0].id, breakdownId);
    assert.equal(spy.breakdown.onInsert.getCall(0).args[0].props, breakdownProps);

    const breakdown2Props: ElementProps = { classFullName: Breakdown.classFullName, model: modelId, code: { spec: codeSpec.id, scope: modelId, value: "badval" } };
    // TestFuncModel.onInsertElement throws for this code.value
    expect(() => elements.insertElement(breakdown2Props)).to.throw("bad element");

    breakdown2Props.code.value = "Breakdown2";
    breakdown2Props.userLabel = "start label"; // gets overwritten in `onInsert`
    const bd2 = elements.insertElement(breakdown2Props);

    const aspect = { classFullName: TestFuncAspect.classFullName, element: new ElementOwnsUniqueAspect(bd2), strProp: "prop 1" };

    TestFuncAspect.expectedVal = aspect.strProp;
    elements.insertAspect(aspect);
    assert.isTrue(spy.aspect.onInsert.calledOnce);
    assert.isTrue(spy.aspect.onInserted.calledOnce);
    assert.isFalse(spy.aspect.onUpdate.called);
    assert.isFalse(spy.aspect.onUpdated.called);
    assert.equal(spy.aspect.onInserted.getCall(0).args[0].props.element.id, bd2, "elemId from ElementAspect.onInserted");

    aspect.strProp = "prop 2";
    TestFuncAspect.expectedVal = aspect.strProp;
    elements.updateAspect(aspect);
    assert.equal(spy.aspect.onInsert.callCount, 1, "ElementAspect.onInsert should not be called on update");
    assert.equal(spy.aspect.onInserted.callCount, 1, "ElementAspect.onInserted should should not be called on update");
    assert.equal(spy.aspect.onUpdate.callCount, 1);
    assert.equal(spy.aspect.onUpdated.callCount, 1);
    assert.equal(spy.aspect.onUpdated.getCall(0).args[0].props.element.id, bd2, "from ElementAspect.onUpdated");
    const aspects = elements.getAspects(bd2, TestFuncAspect.classFullName);
    assert.equal(aspects.length, 1);
    elements.deleteAspect(aspects[0].id);
    assert.equal(spy.aspect.onDelete.callCount, 1);
    assert.equal(spy.aspect.onDeleted.callCount, 1);
    assert.equal(spy.aspect.onDelete.getCall(0).args[0].aspectId, aspects[0].id);
    assert.equal(spy.aspect.onDeleted.getCall(0).args[0].aspectId, aspects[0].id);

    let bd2el = elements.getElement(bd2);
    assert.equal(bd2el.userLabel, insertedLabel, "label was modified by onInsert");

    spy.breakdown.onUpdate.resetHistory();
    spy.breakdown.onUpdated.resetHistory();
    bd2el.userLabel = "nothing";
    bd2el.update();
    bd2el = elements.getElement(bd2);
    assert.equal(bd2el.userLabel, updatedLabel, "label was modified in onUpdate");
    assert.equal(spy.breakdown.onUpdate.callCount, 1);
    assert.equal(spy.breakdown.onUpdated.callCount, 1);
    assert.equal(spy.breakdown.onUpdate.getCall(0).args[0].props.id, bd2);
    assert.equal(spy.breakdown.onUpdated.getCall(0).args[0].id, bd2);

    bd2el.delete();
    assert.equal(spy.breakdown.onDelete.callCount, 1);
    assert.equal(spy.breakdown.onDeleted.callCount, 1);
    assert.equal(spy.breakdown.onDelete.getCall(0).args[0].id, bd2);
    assert.equal(spy.breakdown.onDeleted.getCall(0).args[0].id, bd2);

    const breakdown3Props = {
      classFullName: Breakdown.classFullName,
      model: modelId,
      code: { spec: codeSpec.id, scope: modelId, value: "bd3" },
    };
    const bd3 = elements.insertElement(breakdown3Props);

    const componentProps = {
      classFullName: Component.classFullName,
      model: modelId,
      parent: { id: breakdownId, relClassName: ElementOwnsChildElements.classFullName },
      code: { spec: codeSpec.id, scope: modelId, value: "Component1" },
    };
    const componentId = elements.insertElement(componentProps);
    assert.isTrue(Id64.isValidId64(componentId));
    assert.equal(spy.breakdown.onChildInserted.callCount, 1);
    assert.equal(spy.breakdown.onChildInserted.getCall(0).args[0].childId, componentId);

    // test model and element callbacks for updateElement
    spy.model.onUpdateElement.resetHistory();
    spy.model.onUpdatedElement.resetHistory();
    const compponent1 = elements.getElement(componentId);
    compponent1.update();
    assert.equal(spy.model.onUpdateElement.callCount, 1);
    assert.equal(spy.model.onUpdatedElement.callCount, 1);
    assert.equal(spy.model.onUpdatedElement.getCall(0).args[0].elementId, componentId);
    assert.equal(spy.breakdown.onChildUpdate.callCount, 1);
    assert.equal(spy.breakdown.onChildUpdated.callCount, 1);
    assert.equal(spy.breakdown.onChildUpdate.getCall(0).args[0].parentId, breakdownId);
    assert.equal(spy.breakdown.onChildUpdated.getCall(0).args[0].childId, componentId);

    componentProps.code.value = "comp2";
    const comp2 = elements.insertElement(componentProps);
    assert.equal(spy.breakdown.onChildInserted.callCount, 2);
    assert.equal(spy.breakdown.onChildInserted.getCall(1).args[0].childId, comp2);
    const el2 = elements.getElement(comp2);

    spy.model.onDeleteElement.resetHistory();
    spy.model.onDeletedElement.resetHistory();
    TestFuncModel.dontDelete = comp2; // block deletion through model
    expect(() => el2.delete()).to.throw("dont delete my element");
    TestFuncModel.dontDelete = ""; // allow deletion through model
    Breakdown.dontDeleteChild = comp2; // but block through parent
    expect(() => el2.delete()).to.throw("dont delete my child"); // nope
    assert.equal(spy.model.onDeleteElement.callCount, 2, "Model.onElementDelete gets called even though element is not really deleted");
    assert.equal(spy.model.onDeletedElement.callCount, 0, "make sure Model.onElementDeleted did not get called");
    Breakdown.dontDeleteChild = ""; // now fully allow delete
    el2.delete();
    assert.equal(spy.model.onDeleteElement.callCount, 3, "Model.onElementDelete should be called again");
    assert.equal(spy.model.onDeletedElement.callCount, 1);
    assert.equal(spy.model.onDeletedElement.getCall(0).args[0].elementId, comp2);
    assert.equal(spy.breakdown.onChildDeleted.callCount, 1);
    assert.equal(spy.breakdown.onChildDeleted.getCall(0).args[0].childId, comp2);

    // next we make sure that changing the parent of an element calls the "onChildAdd/Drop/Added/Dropped" callbacks.
    // To do this we switch a component's parent from "breakDownId" to "bc3"
    componentProps.parent.id = bd3;
    const comp3 = elements.insertElement(componentProps);
    const compEl3 = elements.getElementProps(comp3);
    compEl3.parent!.id = breakdownId;
    elements.updateElement(compEl3);

    assert.equal(spy.breakdown.onChildAdd.callCount, 1);
    assert.equal(spy.breakdown.onChildAdd.getCall(0).args[0].parentId, breakdownId);
    assert.equal(spy.breakdown.onChildAdd.getCall(0).args[0].childProps.id, comp3);
    assert.equal(spy.breakdown.onChildDrop.callCount, 1);
    assert.equal(spy.breakdown.onChildDrop.getCall(0).args[0].parentId, bd3);
    assert.equal(spy.breakdown.onChildDrop.getCall(0).args[0].childId, comp3);
    assert.equal(spy.breakdown.onChildAdded.callCount, 1);
    assert.equal(spy.breakdown.onChildAdded.getCall(0).args[0].parentId, breakdownId);
    assert.equal(spy.breakdown.onChildAdded.getCall(0).args[0].childId, comp3);
    assert.equal(spy.breakdown.onChildDropped.callCount, 1);
    assert.equal(spy.breakdown.onChildDropped.getCall(0).args[0].parentId, bd3);
    assert.equal(spy.breakdown.onChildDropped.getCall(0).args[0].childId, comp3);

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
