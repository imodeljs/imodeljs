/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Guid, Id64, Id64String } from "@bentley/bentleyjs-core";
import { IModelConnection, SnapshotConnection } from "@bentley/imodeljs-frontend";
import {
  ContentFlags, ContentSpecificationTypes, DefaultContentDisplayTypes, Descriptor, DisplayValueGroup, Field, FieldDescriptor, InstanceKey, KeySet,
  NestedContentField, PresentationError, PresentationStatus, RelationshipDirection, Ruleset, RuleTypes,
} from "@bentley/presentation-common";
import { Presentation } from "@bentley/presentation-frontend";
import { initialize, terminate } from "../IntegrationTests";
import { findFieldByLabel } from "../Utils";

import sinon = require("sinon");

/* eslint-disable deprecation/deprecation */

describe("Content", () => {

  let imodel: IModelConnection;
  const openIModel = async () => {
    if (!imodel || !imodel.isOpen)
      imodel = await SnapshotConnection.openFile("assets/datasets/Properties_60InstancesWithUrl2.ibim");
    expect(imodel).is.not.null;
  };

  const closeIModel = async () => {
    if (imodel && imodel.isOpen)
      await imodel.close();
  };

  before(async () => {
    await initialize();
    await openIModel();
  });

  after(async () => {
    await imodel.close();
    await terminate();
  });

  describe("Input Keys", () => {

    it("associates content items with given input keys", async () => {
      const ruleset: Ruleset = {
        id: Guid.createValue(),
        rules: [{
          ruleType: RuleTypes.Content,
          specifications: [{
            specType: ContentSpecificationTypes.ContentRelatedInstances,
            relationshipPaths: [{
              relationship: { schemaName: "BisCore", className: "ElementOwnsChildElements" },
              direction: RelationshipDirection.Forward,
              count: "*",
            }],
          }],
        }],
      };
      const content = await Presentation.presentation.getContent({
        imodel,
        rulesetOrId: ruleset,
        descriptor: {
          contentFlags: ContentFlags.IncludeInputKeys,
        },

        keys: new KeySet([{
          className: "BisCore:Element",
          id: "0x1",
        }, {
          className: "BisCore:Element",
          id: "0x12",
        }]),
      });
      expect(content?.contentSet.length).to.eq(9);
      expect(content!.contentSet.map((item) => ({ itemId: item.primaryKeys[0].id, inputIds: item.inputKeys!.map((ik) => ik.id) }))).to.containSubset([{
        itemId: "0xe", inputIds: ["0x1"],
      }, {
        itemId: "0x10", inputIds: ["0x1"],
      }, {
        itemId: "0x12", inputIds: ["0x1"],
      }, {
        itemId: "0x13", inputIds: ["0x1", "0x12"],
      }, {
        itemId: "0x14", inputIds: ["0x1", "0x12"],
      }, {
        itemId: "0x15", inputIds: ["0x1", "0x12"],
      }, {
        itemId: "0x16", inputIds: ["0x1", "0x12"],
      }, {
        itemId: "0x1b", inputIds: ["0x1", "0x12"],
      }, {
        itemId: "0x1c", inputIds: ["0x1", "0x12"],
      }]);
    });

  });

  describe("Distinct Values", () => {

    it("[deprecated] gets distinct content values", async () => {
      const ruleset: Ruleset = {
        id: "getRelatedDistinctValues",
        rules: [{
          ruleType: RuleTypes.Content,
          specifications: [{
            specType: ContentSpecificationTypes.ContentRelatedInstances,
            relatedClasses: {
              schemaName: "BisCore",
              classNames: [
                "SubCategory",
                "LinkPartition",
                "DefinitionPartition",
                "PhysicalPartition",
              ],
            },
          }],
        }, {
          ruleType: RuleTypes.LabelOverride,
          condition: `ThisNode.IsInstanceNode ANDALSO this.IsOfClass("Model", "BisCore")`,
          label: `this.GetRelatedDisplayLabel("BisCore:ModelModelsElement", "Forward", "BisCore:Element")`,
        }],
      };
      const key1: InstanceKey = { id: Id64.fromString("0x1"), className: "BisCore:Subject" };
      const key2: InstanceKey = { id: Id64.fromString("0x17"), className: "BisCore:SpatialCategory" };
      const keys = new KeySet([key1, key2]);
      const descriptor = await Presentation.presentation.getContentDescriptor({ imodel, rulesetOrId: ruleset }, "Grid", keys, undefined);
      expect(descriptor).to.not.be.undefined;
      const field = descriptor!.getFieldByName("pc_bis_Element_Model");
      expect(field).to.not.be.undefined;
      const distinctValues = await Presentation.presentation.getDistinctValues({ imodel, rulesetOrId: ruleset }, descriptor!, keys, field!.name);
      expect(distinctValues).to.be.deep.equal([
        "Definition Model For DgnV8Bridge:D:\\Temp\\Properties_60InstancesWithUrl2.dgn, Default",
        "DgnV8Bridge",
      ]);
    });

    async function validatePagedDistinctValuesResponse(ruleset: Ruleset, keys: KeySet, descriptor: Descriptor, fieldDescriptor: FieldDescriptor, expectedResult: DisplayValueGroup[]) {
      // first request all pages and confirm the result is valid
      const allDistinctValues = await Presentation.presentation.getPagedDistinctValues({ imodel, rulesetOrId: ruleset, keys, descriptor, fieldDescriptor });
      expect(allDistinctValues).to.be.deep.equal({
        total: expectedResult.length,
        items: expectedResult,
      });

      // then request in pages and confirm it's still okay
      const pageSize = 2;
      const pagesCount = Math.ceil(expectedResult.length / pageSize);
      for (let i = 0; i < pagesCount; ++i) {
        const pagedDistinctValues = await Presentation.presentation.getPagedDistinctValues({ imodel, rulesetOrId: ruleset, keys, descriptor, fieldDescriptor, paging: { size: pageSize, start: i * pageSize } });
        expect(pagedDistinctValues).to.be.deep.equal({
          total: expectedResult.length,
          items: expectedResult.slice(i * pageSize, (i + 1) * pageSize),
        });
      }
    }

    it("gets paged distinct primitive content values", async () => {
      const ruleset: Ruleset = {
        id: Guid.createValue(),
        rules: [{
          ruleType: RuleTypes.Content,
          specifications: [{ specType: ContentSpecificationTypes.SelectedNodeInstances }],
        }],
      };
      const keys = KeySet.fromJSON({ instanceKeys: [["PCJ_TestSchema:TestClass", ["0x61", "0x70", "0x6a", "0x3c", "0x71"]]], nodeKeys: [] });
      const descriptor = (await Presentation.presentation.getContentDescriptor({ imodel, rulesetOrId: ruleset }, "", keys, undefined))!;

      let field = findFieldByLabel(descriptor.fields, "User Label")!;
      await validatePagedDistinctValuesResponse(ruleset, keys, descriptor, field.getFieldDescriptor(), [{
        displayValue: "TestClass",
        groupedRawValues: ["TestClass"],
      }]);

      field = findFieldByLabel(descriptor.fields, "True-False")!;
      await validatePagedDistinctValuesResponse(ruleset, keys, descriptor, field.getFieldDescriptor(), [{
        displayValue: "False",
        groupedRawValues: [false],
      }, {
        displayValue: "True",
        groupedRawValues: [true],
      }]);

      field = findFieldByLabel(descriptor.fields, "<0")!;
      await validatePagedDistinctValuesResponse(ruleset, keys, descriptor, field.getFieldDescriptor(), [{
        displayValue: "0.00",
        groupedRawValues: [1e-7, 0.0007575],
      }, {
        displayValue: "0.12",
        groupedRawValues: [0.123456789],
      }]);

      field = findFieldByLabel(descriptor.fields, "<100")!;
      await validatePagedDistinctValuesResponse(ruleset, keys, descriptor, field.getFieldDescriptor(), [{
        displayValue: "100.01",
        groupedRawValues: [100.01],
      }, {
        displayValue: "75.75",
        groupedRawValues: [75.75],
      }, {
        displayValue: "99.01",
        groupedRawValues: [99.01],
      }]);
    });

    it("gets paged distinct related primitive content values", async () => {
      const ruleset: Ruleset = {
        id: Guid.createValue(),
        rules: [{
          ruleType: RuleTypes.Content,
          specifications: [{
            specType: ContentSpecificationTypes.SelectedNodeInstances,
            relatedProperties: [{
              propertiesSource: [{
                relationship: { schemaName: "BisCore", className: "ModelContainsElements" },
                direction: RelationshipDirection.Backward,
              }, {
                relationship: { schemaName: "BisCore", className: "ModelModelsElement" },
                direction: RelationshipDirection.Forward,
                targetClass: { schemaName: "BisCore", className: "Element" },
              }],
              properties: [{
                name: "CodeValue",
                labelOverride: "Model Label",
              }],
            }],
          }],
        }],
      };
      const keys = KeySet.fromJSON({ instanceKeys: [["PCJ_TestSchema:TestClass", ["0x61", "0x70", "0x6a", "0x3c", "0x71"]]], nodeKeys: [] });
      const descriptor = (await Presentation.presentation.getContentDescriptor({ imodel, rulesetOrId: ruleset }, "", keys, undefined))!;
      const field = findFieldByLabel(descriptor.fields, "Model Label")!;
      await validatePagedDistinctValuesResponse(ruleset, keys, descriptor, field.getFieldDescriptor(), [{
        displayValue: "Properties_60InstancesWithUrl2",
        groupedRawValues: ["Properties_60InstancesWithUrl2"],
      }]);
    });

    it("gets paged distinct related content values", async () => {
      const ruleset: Ruleset = {
        id: Guid.createValue(),
        rules: [{
          ruleType: RuleTypes.Content,
          specifications: [{ specType: ContentSpecificationTypes.SelectedNodeInstances }],
        }],
      };
      const keys = KeySet.fromJSON({ instanceKeys: [["PCJ_TestSchema:TestClass", ["0x61", "0x70", "0x6a", "0x3c", "0x71"]]], nodeKeys: [] });
      const descriptor = (await Presentation.presentation.getContentDescriptor({ imodel, rulesetOrId: ruleset }, "", keys, undefined))!;
      const field = findFieldByLabel(descriptor.fields, "Ñámê")!;
      await validatePagedDistinctValuesResponse(ruleset, keys, descriptor, field.getFieldDescriptor(), [{
        displayValue: "Properties_60InstancesWithUrl2.dgn",
        groupedRawValues: ["Properties_60InstancesWithUrl2.dgn"],
      }]);
    });

    it("gets distinct content values using consolidated descriptor", async () => {
      const ruleset: Ruleset = {
        id: Guid.createValue(),
        rules: [{
          ruleType: RuleTypes.Content,
          specifications: [{ specType: ContentSpecificationTypes.SelectedNodeInstances }],
        }],
      };
      const consolidatedKeys = new KeySet([{
        className: "PCJ_TestSchema:TestClass",
        id: Id64.invalid,
      }, {
        className: "Generic:PhysicalObject",
        id: Id64.invalid,
      }]);
      const descriptor = (await Presentation.presentation.getContentDescriptor({ imodel, rulesetOrId: ruleset }, "", consolidatedKeys, undefined))!;
      const field = findFieldByLabel(descriptor.fields, "User Label")!;

      await validatePagedDistinctValuesResponse(ruleset, consolidatedKeys, descriptor, field.getFieldDescriptor(), [{
        displayValue: "",
        groupedRawValues: [undefined],
      }, {
        displayValue: "TestClass",
        groupedRawValues: ["TestClass"],
      }]);

      const typeOneKey = new KeySet([{
        className: "PCJ_TestSchema:TestClass",
        id: Id64.invalid,
      }]);
      await validatePagedDistinctValuesResponse(ruleset, typeOneKey, descriptor, field.getFieldDescriptor(), [{
        displayValue: "TestClass",
        groupedRawValues: ["TestClass"],
      }]);

      const typeTwoKey = new KeySet([{
        className: "Generic:PhysicalObject",
        id: Id64.invalid,
      }]);
      await validatePagedDistinctValuesResponse(ruleset, typeTwoKey, descriptor, field.getFieldDescriptor(), [{
        displayValue: "",
        groupedRawValues: [undefined],
      }]);
    });

  });

  describe("Fields Selector", () => {

    it("excludes fields from content", async () => {
      const ruleset: Ruleset = {
        id: Guid.createValue(),
        rules: [{
          ruleType: RuleTypes.Content,
          specifications: [{
            specType: ContentSpecificationTypes.ContentInstancesOfSpecificClasses,
            classes: { schemaName: "BisCore", classNames: ["Element"] },
            handleInstancesPolymorphically: true,
            instanceFilter: `this.ECInstanceId = 1`,
          }],
        }],
      };

      const content1 = await Presentation.presentation.getContent({
        imodel,
        rulesetOrId: ruleset,
        descriptor: {},
        keys: new KeySet(),
      });
      expect(content1?.contentSet.length).to.eq(1);
      const fieldsCount = content1!.descriptor.fields.length;

      const content2 = await Presentation.presentation.getContent({
        imodel,
        rulesetOrId: ruleset,
        descriptor: {
          fieldsSelector: {
            type: "exclude",
            fields: [content1!.descriptor.fields[0].getFieldDescriptor()],
          },
        },
        keys: new KeySet(),
      });
      expect(content2?.contentSet.length).to.eq(1);
      expect(content2!.descriptor.fields.length).to.eq(fieldsCount - 1);
    });

    it("exclusively includes fields in content", async () => {
      const ruleset: Ruleset = {
        id: Guid.createValue(),
        rules: [{
          ruleType: RuleTypes.Content,
          specifications: [{
            specType: ContentSpecificationTypes.ContentInstancesOfSpecificClasses,
            classes: { schemaName: "BisCore", classNames: ["Element"] },
            handleInstancesPolymorphically: true,
            instanceFilter: `this.ECInstanceId = 1`,
          }],
        }],
      };

      const content1 = await Presentation.presentation.getContent({
        imodel,
        rulesetOrId: ruleset,
        descriptor: {},
        keys: new KeySet(),
      });
      expect(content1?.contentSet.length).to.eq(1);
      expect(content1!.descriptor.fields.length).to.be.greaterThan(1);

      const content2 = await Presentation.presentation.getContent({
        imodel,
        rulesetOrId: ruleset,
        descriptor: {
          fieldsSelector: {
            type: "include",
            fields: [content1!.descriptor.fields[0].getFieldDescriptor()],
          },
        },
        keys: new KeySet(),
      });
      expect(content2?.contentSet.length).to.eq(1);
      expect(content2!.descriptor.fields.length).to.eq(1);
    });

  });

  describe("Calculated Properties", () => {

    it("creates calculated fields", async () => {
      const ruleset: Ruleset = {
        id: Guid.createValue(),
        rules: [{
          ruleType: RuleTypes.Content,
          specifications: [{
            specType: ContentSpecificationTypes.ContentInstancesOfSpecificClasses,
            classes: { schemaName: "BisCore", classNames: ["Element"] },
            handleInstancesPolymorphically: true,
            instanceFilter: `this.ECInstanceId = 1`,
          }],
        }, {
          ruleType: RuleTypes.ContentModifier,
          class: { schemaName: "BisCore", className: "Element" },
          calculatedProperties: [{
            label: "Test",
            value: `"Value"`,
          }],
        }],
      };

      const content = await Presentation.presentation.getContent({
        imodel,
        rulesetOrId: ruleset,
        descriptor: {},
        keys: new KeySet(),
      });
      const field = findFieldByLabel(content!.descriptor.fields, "Test")!;

      expect(content?.contentSet.length).to.eq(1);
      expect(content?.contentSet[0].values[field.name]).to.eq("Value");
      expect(content?.contentSet[0].displayValues[field.name]).to.eq("Value");
    });

  });

  describe("Class descriptor", () => {

    it("creates base class descriptor usable for subclasses", async () => {
      const classHierarchy = await ECClassHierarchy.create(imodel);
      const createRuleset = (schemaName: string, className: string): Ruleset => ({
        id: Guid.createValue(),
        rules: [{
          ruleType: RuleTypes.Content,
          specifications: [{
            specType: ContentSpecificationTypes.ContentInstancesOfSpecificClasses,
            classes: {
              schemaName,
              classNames: [className],
            },
            handleInstancesPolymorphically: true,
            handlePropertiesPolymorphically: true,
          }],
        }],
      });

      const descriptorGeometricElement = await Presentation.presentation.getContentDescriptor({
        imodel,
        rulesetOrId: createRuleset("BisCore", "GeometricElement"),
        displayType: DefaultContentDisplayTypes.PropertyPane,
        keys: new KeySet(),
      });
      // sanity check - ensure filtering the fields by the class we used for request doesn't filter out anything
      const fieldsGeometricElement = filterFieldsByClass(descriptorGeometricElement!.fields, await classHierarchy.getClassInfo("BisCore", "GeometricElement"));
      expect(getFieldLabels(fieldsGeometricElement)).to.deep.eq(getFieldLabels(descriptorGeometricElement!));

      // request properties of Generic.PhysicalObject and ensure it's matches our filtered result of `descriptorGeometricElement`
      const descriptorPhysicalObject = await Presentation.presentation.getContentDescriptor({
        imodel,
        rulesetOrId: createRuleset("Generic", "PhysicalObject"),
        displayType: DefaultContentDisplayTypes.PropertyPane,
        keys: new KeySet(),
      });
      const fieldsPhysicalObject = filterFieldsByClass(descriptorGeometricElement!.fields, await classHierarchy.getClassInfo("Generic", "PhysicalObject"));
      expect(getFieldLabels(fieldsPhysicalObject)).to.deep.eq(getFieldLabels(descriptorPhysicalObject!));

      // request properties of PCJ_TestSchema.TestClass and ensure it's matches our filtered result of `descriptorGeometricElement`
      const descriptorTestClass = await Presentation.presentation.getContentDescriptor({
        imodel,
        rulesetOrId: createRuleset("PCJ_TestSchema", "TestClass"),
        displayType: DefaultContentDisplayTypes.PropertyPane,
        keys: new KeySet(),
      });
      const fieldsTestClass = filterFieldsByClass(descriptorGeometricElement!.fields, await classHierarchy.getClassInfo("PCJ_TestSchema", "TestClass"));
      expect(getFieldLabels(fieldsTestClass)).to.deep.eq(getFieldLabels(descriptorTestClass!));
    });

  });

  describe("when request in the backend exceeds the backend timeout time", () => {

    let raceStub: sinon.SinonStub<[readonly unknown[]], Promise<unknown>>;

    beforeEach(async () => {
      // re-initialize to set backend response timeout to 500 ms
      await closeIModel();
      await terminate();
      await initialize(500);
      await openIModel();

      // mock `Promise.race` to always reject
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const realRace = Promise.race;
      raceStub = sinon.stub(Promise, "race").callsFake(async (values) => {
        (values as any).push(new Promise((_resolve, reject) => { reject("something"); }));
        return realRace.call(Promise, values);
      });
    });

    afterEach(async () => {
      await closeIModel();
      raceStub.restore();
    });

    it("should throw PresentationError", async () => {
      const ruleset: Ruleset = {
        id: "test",
        rules: [{
          ruleType: RuleTypes.Content,
          specifications: [{ specType: ContentSpecificationTypes.SelectedNodeInstances }],
        }],
      };
      const key1: InstanceKey = { id: Id64.fromString("0x1"), className: "BisCore:Subject" };
      const key2: InstanceKey = { id: Id64.fromString("0x17"), className: "BisCore:SpatialCategory" };
      const keys = new KeySet([key1, key2]);
      await expect(Presentation.presentation.getContentDescriptor({ imodel, rulesetOrId: ruleset }, "Grid", keys, undefined))
        .to.be.eventually.rejectedWith(PresentationError).and.have.property("errorNumber", PresentationStatus.BackendTimeout);
    });

  });

});

type FieldLabels = Array<string | { label: string, nested: FieldLabels }>;
function getFieldLabels(fields: Descriptor | Field[]): FieldLabels {
  if (fields instanceof Descriptor)
    fields = fields.fields;

  return fields.map((f) => {
    if (f.isNestedContentField())
      return { label: f.label, nested: getFieldLabels(f.nestedFields) };
    return f.label;
  }).sort((lhs, rhs) => {
    if (typeof lhs === "string" && typeof rhs === "string")
      return lhs.localeCompare(rhs);
    if (typeof lhs === "string")
      return -1;
    if (typeof rhs === "string")
      return 1;
    return lhs.label.localeCompare(rhs.label);
  });
}

interface ECClassInfo {
  id: Id64String;
  baseClassIds: Id64String[];
  derivedClassIds: Id64String[];
}

function cloneFilteredNestedContentField(field: NestedContentField, filterClassInfo: ECClassInfo) {
  const clone = field.clone();
  clone.nestedFields = filterNestedContentFieldsByClass(clone.nestedFields, filterClassInfo);
  return clone;
}
function filterNestedContentFieldsByClass(fields: Field[], classInfo: ECClassInfo) {
  const filteredFields = new Array<Field>();
  fields.forEach((f) => {
    if (f.isNestedContentField() && f.actualPrimaryClassIds.some((id) => classInfo.id === id || classInfo.derivedClassIds.includes(id))) {
      const clone = cloneFilteredNestedContentField(f, classInfo);
      if (clone.nestedFields.length > 0)
        filteredFields.push(clone);
    } else {
      filteredFields.push(f);
    }
  });
  return filteredFields;
}
function filterFieldsByClass(fields: Field[], classInfo: ECClassInfo) {
  const filteredFields = new Array<Field>();
  fields.forEach((f) => {
    if (f.isNestedContentField()) {
      // always include nested content field if its `actualPrimaryClassIds` contains either id of given class itself or one of its derived class ids
      // note: nested content fields might have more nested fields inside them and these deeply nested fields might not apply for given class - for
      // that we need to clone the field and pick only property fields and nested fields that apply.
      const appliesForGivenClass = f.actualPrimaryClassIds.some((id) => classInfo.id === id || classInfo.derivedClassIds.includes(id));
      if (appliesForGivenClass) {
        const clone = cloneFilteredNestedContentField(f, classInfo);
        if (clone.nestedFields.length > 0)
          filteredFields.push(clone);
      }
    } else if (f.isPropertiesField()) {
      // always include the field is at least one property in the field belongs to either base or derived class of given class
      const appliesForGivenClass = f.properties.some((p) => {
        const propertyClassId = p.property.classInfo.id;
        return propertyClassId === classInfo.id
          || classInfo.baseClassIds.includes(propertyClassId)
          || classInfo.derivedClassIds.includes(propertyClassId);
      });
      if (appliesForGivenClass)
        filteredFields.push(f);
    } else {
      filteredFields.push(f);
    }
  });
  return filteredFields;
}

class ECClassHierarchy {
  private constructor(private _imodel: IModelConnection, private _baseClasses: Map<Id64String, Id64String[]>, private _derivedClasses: Map<Id64String, Id64String[]>) {
  }
  public static async create(imodel: IModelConnection) {
    const baseClassHierarchy = new Map();
    const derivedClassHierarchy = new Map();

    const query = "SELECT SourceECInstanceId AS ClassId, TargetECInstanceId AS BaseClassId FROM meta.ClassHasBaseClasses";
    for await (const row of imodel.query(query)) {
      const { classId, baseClassId } = row;

      const baseClasses = baseClassHierarchy.get(classId);
      if (baseClasses)
        baseClasses.push(baseClassId);
      else
        baseClassHierarchy.set(classId, [baseClassId]);

      const derivedClasses = derivedClassHierarchy.get(baseClassId);
      if (derivedClasses)
        derivedClasses.push(classId);
      else
        derivedClassHierarchy.set(baseClassId, [classId]);
    }

    return new ECClassHierarchy(imodel, baseClassHierarchy, derivedClassHierarchy);
  }
  private getAllBaseClassIds(classId: Id64String) {
    const baseClassIds = this._baseClasses.get(classId) ?? [];
    return baseClassIds.reduce<Id64String[]>((arr, id) => {
      arr.push(id, ...this.getAllBaseClassIds(id));
      return arr;
    }, []);
  }
  private getAllDerivedClassIds(baseClassId: Id64String) {
    const derivedClassIds = this._derivedClasses.get(baseClassId) ?? [];
    return derivedClassIds.reduce<Id64String[]>((arr, id) => {
      arr.push(id, ...this.getAllDerivedClassIds(id));
      return arr;
    }, []);
  }
  public async getClassInfo(schemaName: string, className: string) {
    const classQuery = `SELECT c.ECInstanceId FROM meta.ECClassDef c JOIN meta.ECSchemaDef s ON s.ECInstanceId = c.Schema.Id WHERE c.Name = ? AND s.Name = ?`;
    const result = await this._imodel.queryRows(classQuery, [className, schemaName]);
    const { id } = result.rows[0];
    return {
      id,
      baseClassIds: this.getAllBaseClassIds(id),
      derivedClassIds: this.getAllDerivedClassIds(id),
    };
  }
}
