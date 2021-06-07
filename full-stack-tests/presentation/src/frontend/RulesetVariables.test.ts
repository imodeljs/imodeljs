/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as faker from "faker";
import { Guid, Id64 } from "@bentley/bentleyjs-core";
import { IModelConnection, SnapshotConnection } from "@bentley/imodeljs-frontend";
import { ChildNodeSpecificationTypes, ContentSpecificationTypes, KeySet, Ruleset, RuleTypes } from "@bentley/presentation-common";
import { createRandomId } from "@bentley/presentation-common/lib/test/_helpers/random";
import { Presentation, PresentationManager, RulesetVariablesManager } from "@bentley/presentation-frontend";
import { initialize, resetBackend, terminate } from "../IntegrationTests";

const RULESET: Ruleset = {
  id: "ruleset vars test",
  rules: [{
    ruleType: RuleTypes.RootNodes,
    specifications: [{
      specType: ChildNodeSpecificationTypes.CustomNode,
      type: "root",
      label: "root",
    }],
  }, {
    ruleType: RuleTypes.LabelOverride,
    condition: "ThisNode.Type = \"root\"",
    label: "GetVariableStringValue(\"variable_id\")",
  }],
};

describe("Ruleset Variables", async () => {

  let variables: RulesetVariablesManager;

  beforeEach(async () => {
    await initialize();
    variables = Presentation.presentation.vars(RULESET.id);
  });

  afterEach(async () => {
    await terminate();
  });

  it("adds and modifies string variable", async () => {
    const value = faker.random.word();
    const variableId = faker.random.word();
    await variables.setString(variableId, value);
    const actualValue = await variables.getString(variableId);
    expect(actualValue).to.equal(value);
  });

  it("adds and modifies boolean variable", async () => {
    let value = faker.random.boolean();
    const variableId = faker.random.word();
    await variables.setBool(variableId, value);
    let actualValue = await variables.getBool(variableId);
    expect(actualValue).to.equal(value);

    value = !value;
    await variables.setBool(variableId, value);
    actualValue = await variables.getBool(variableId);
    expect(actualValue).to.equal(value);
  });

  it("adds and modifies integer variable", async () => {
    let value = faker.random.number();
    const variableId = faker.random.word();
    await variables.setInt(variableId, value);
    let actualValue = await variables.getInt(variableId);
    expect(actualValue).to.equal(value);

    value = faker.random.number();
    await variables.setInt(variableId, value);
    actualValue = await variables.getInt(variableId);
    expect(actualValue).to.equal(value);
  });

  it("adds and modifies int[] variable", async () => {
    let valueArray = [faker.random.number(), faker.random.number(), faker.random.number()];
    const variableId = faker.random.word();
    await variables.setInts(variableId, valueArray);
    let actualValueArray = await variables.getInts(variableId);
    expect(actualValueArray).to.deep.equal(valueArray);

    valueArray = [faker.random.number(), faker.random.number(), faker.random.number(), faker.random.number()];
    await variables.setInts(variableId, valueArray);
    actualValueArray = await variables.getInts(variableId);
    expect(actualValueArray).to.deep.equal(valueArray);
  });

  it("adds and modifies Id64 variable", async () => {
    let value = createRandomId();
    const variableId = faker.random.word();
    await variables.setId64(variableId, value);
    let actualValue = await variables.getId64(variableId);
    expect(actualValue).to.deep.equal(value);

    value = createRandomId();
    await variables.setId64(variableId, value);
    actualValue = await variables.getId64(variableId);
    expect(actualValue).to.deep.equal(value);
  });

  it("adds and modifies Id64[] variable", async () => {
    let valueArray = [
      createRandomId(),
      createRandomId(),
      createRandomId(),
    ];
    const variableId = faker.random.word();
    await variables.setId64s(variableId, valueArray);
    let actualValueArray = await variables.getId64s(variableId);
    expect(actualValueArray).to.deep.equal(valueArray);

    valueArray = [
      createRandomId(),
      createRandomId(),
      createRandomId(),
      createRandomId(),
    ];
    await variables.setId64s(variableId, valueArray);
    actualValueArray = await variables.getId64s(variableId);
    expect(actualValueArray).to.deep.equal(valueArray);
  });

  it("accessing int[] variable with different types", async () => {
    const valueArray = [faker.random.number(), faker.random.number(), faker.random.number(), faker.random.number()];
    const variableId = faker.random.word();
    await variables.setInts(variableId, valueArray);

    const boolValue = await variables.getBool(variableId);
    expect(boolValue).to.be.false;

    const id64ArrayValue = await variables.getId64s(variableId);
    expect(id64ArrayValue.length).to.equal(valueArray.length);
    for (const value of valueArray) {
      const id = Id64.fromLocalAndBriefcaseIds(value, 0);
      expect(id64ArrayValue.find((x) => x === (id))).to.not.be.equal(undefined);
    }

    const id64Value = await variables.getId64(variableId);
    expect(Id64.isValid(id64Value)).to.be.false;

    const intValue = await variables.getInt(variableId);
    expect(intValue).to.equal(0);

    const stringValue = await variables.getString(variableId);
    expect(stringValue).to.equal("");
  });

  it("accessing int variable with different types", async () => {
    const value = faker.random.number();
    const variableId = faker.random.word();
    await variables.setInt(variableId, value);

    const boolValue = await variables.getBool(variableId);
    expect(boolValue).to.eq(value !== 0);

    const id64ArrayValue = await variables.getId64s(variableId);
    expect(id64ArrayValue.length).to.equal(0);

    const id64Value = await variables.getId64(variableId);
    expect(id64Value).to.deep.eq(Id64.fromLocalAndBriefcaseIds(value, 0));

    const intArrayValue = await variables.getInts(variableId);
    expect(intArrayValue.length).to.equal(0);

    const stringValue = await variables.getString(variableId);
    expect(stringValue).to.equal("");
  });

  it("accessing bool variable with different types", async () => {
    const value = faker.random.boolean();
    const variableId = faker.random.word();
    await variables.setBool(variableId, value);

    const id64ArrayValue = await variables.getId64s(variableId);
    expect(id64ArrayValue.length).to.equal(0);

    const id64Value = await variables.getId64(variableId);
    expect(id64Value).to.deep.eq(Id64.fromLocalAndBriefcaseIds(value ? 1 : 0, 0));

    const intArrayValue = await variables.getInts(variableId);
    expect(intArrayValue.length).to.equal(0);

    const intValue = await variables.getInt(variableId);
    expect(intValue).to.equal(value ? 1 : 0);

    const stringValue = await variables.getString(variableId);
    expect(stringValue).to.equal("");
  });

  it("accessing string variable with different types", async () => {
    const value = faker.random.word();
    const variableId = faker.random.word();
    await variables.setString(variableId, value);

    const id64ArrayValue = await variables.getId64s(variableId);
    expect(id64ArrayValue.length).to.equal(0);

    const id64Value = await variables.getId64(variableId);
    expect(Id64.isValid(id64Value)).to.be.false;

    const intArrayValue = await variables.getInts(variableId);
    expect(intArrayValue.length).to.equal(0);

    const intValue = await variables.getInt(variableId);
    expect(intValue).to.equal(0);

    const boolValue = await variables.getBool(variableId);
    expect(boolValue).to.equal(false);
  });

  it("accessing Id64 variable with different types", async () => {
    const value = createRandomId();
    const variableId = faker.random.word();
    await variables.setId64(variableId, value);

    const id64ArrayValue = await variables.getId64s(variableId);
    expect(id64ArrayValue.length).to.equal(0);

    const intArrayValue = await variables.getInts(variableId);
    expect(intArrayValue.length).to.equal(0);

    const stringValue = await variables.getString(variableId);
    expect(stringValue).to.equal("");

    const boolValue = await variables.getBool(variableId);
    expect(boolValue).to.eq(Id64.isValid(value));
  });

  it("accessing Id64[] variable with different types", async () => {
    const valueArray = [
      createRandomId(),
      createRandomId(),
      createRandomId(),
      createRandomId(),
    ];
    const variableId = faker.random.word();
    await variables.setId64s(variableId, valueArray);

    const boolValue = await variables.getBool(variableId);
    expect(boolValue).to.be.false;

    const intArrayValue = await variables.getInts(variableId);
    expect(intArrayValue.length).to.equal(valueArray.length);

    const id64Value = await variables.getId64(variableId);
    expect(Id64.isValid(id64Value)).to.be.false;

    const intValue = await variables.getInt(variableId);
    expect(intValue).to.equal(0);

    const stringValue = await variables.getString(variableId);
    expect(stringValue).to.equal("");
  });

  describe("Multiple frontends for one backend", async () => {

    let imodel: IModelConnection;
    let frontends: PresentationManager[];

    beforeEach(async () => {
      const testIModelName = "assets/datasets/Properties_60InstancesWithUrl2.ibim";
      imodel = await SnapshotConnection.openFile(testIModelName);
      frontends = [0, 1].map(() => PresentationManager.create());
    });

    afterEach(async () => {
      await imodel.close();
      frontends.forEach((f) => f.dispose());
    });

    it("handles multiple simultaneous requests from different frontends with ruleset variables", async () => {
      for (let i = 0; i < 100; ++i) {
        frontends.forEach(async (f, fi) => f.vars(RULESET.id).setString("variable_id", `${i}_${fi}`));
        const nodes = await Promise.all(frontends.map(async (f) => f.getNodes({ imodel, rulesetOrId: RULESET })));
        frontends.forEach((_f, fi) => {
          expect(nodes[fi][0].label.displayValue).to.eq(`${i}_${fi}`);
        });
      }
    });

  });

  describe("Multiple backends for one frontend", async () => {

    let imodel: IModelConnection;
    let frontend: PresentationManager;

    beforeEach(async () => {
      const testIModelName: string = "assets/datasets/Properties_60InstancesWithUrl2.ibim";
      imodel = await SnapshotConnection.openFile(testIModelName);
      expect(imodel).is.not.null;
      frontend = PresentationManager.create();
    });

    afterEach(async () => {
      await imodel.close();
      frontend.dispose();
    });

    it("can use the same frontend-registered ruleset variables after backend is reset", async () => {
      const vars = frontend.vars("AnyRulesetId");
      const var1: [string, string] = [faker.random.uuid(), faker.random.words()];
      const var2: [string, number] = [faker.random.uuid(), faker.random.number()];

      await vars.setString(var1[0], var1[1]);
      expect(await vars.getString(var1[0])).to.eq(var1[1]);

      resetBackend();

      expect(await vars.getString(var1[0])).to.eq(var1[1]);
      await vars.setInt(var2[0], var2[1]);
      expect(await vars.getInt(var2[0])).to.eq(var2[1]);

      resetBackend();

      expect(await vars.getString(var1[0])).to.eq(var1[1]);
      expect(await vars.getInt(var2[0])).to.eq(var2[1]);
    });

  });

  describe("Using variables in rules", () => {

    let imodel: IModelConnection;

    beforeEach(async () => {
      imodel = await SnapshotConnection.openFile("assets/datasets/Properties_60InstancesWithUrl2.ibim");
    });

    afterEach(async () => {
      await imodel.close();
    });

    it("can specify lots of ids with Id64[] overload", async () => {
      const ruleset: Ruleset = {
        id: Guid.createValue(),
        rules: [{
          ruleType: RuleTypes.Content,
          specifications: [{
            specType: ContentSpecificationTypes.ContentInstancesOfSpecificClasses,
            classes: { schemaName: "PCJ_TestSchema", classNames: ["TestClass"] },
            instanceFilter: `GetVariableIntValues("ids").AnyMatch(id => id = this.ECInstanceId)`,
          }],
        }],
      };

      let content = await Presentation.presentation.getContent({ imodel, rulesetOrId: ruleset, keys: new KeySet(), descriptor: {} });
      expect(content!.contentSet.length).to.eq(0);

      // https://www.sqlite.org/limits.html#max_variable_number
      const maxNumberOfSupportedBindParams = 32766;
      const largestECInstanceIdInTestDataset = 117;
      const ids = [...Array(maxNumberOfSupportedBindParams).keys()].map((key) => Id64.fromUint32Pair(key + largestECInstanceIdInTestDataset + 1, 0));
      ids.push("0x61");

      await Presentation.presentation.vars(ruleset.id).setId64s("ids", ids);
      content = await Presentation.presentation.getContent({ imodel, rulesetOrId: ruleset, keys: new KeySet(), descriptor: {} });
      expect(content!.contentSet.length).to.eq(1);
      expect(content!.contentSet[0].primaryKeys[0]).to.deep.eq({ className: "PCJ_TestSchema:TestClass", id: "0x61" });
    });

  });

});
