/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as faker from "faker";
import sinon from "sinon";
import { Id64 } from "@bentley/bentleyjs-core";
import { IpcApp } from "@bentley/imodeljs-frontend";
import { RulesetVariable, VariableValueTypes } from "@bentley/presentation-common";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import { createRandomId } from "@bentley/presentation-common/lib/test/_helpers/random";
import { IpcRequestsHandler } from "../presentation-frontend/IpcRequestsHandler";
import { RulesetVariablesManagerImpl } from "../presentation-frontend/RulesetVariablesManager";

describe("RulesetVariablesManager", () => {

  let vars: RulesetVariablesManagerImpl;
  let variableId: string;

  beforeEach(() => {
    variableId = faker.random.word();
    vars = new RulesetVariablesManagerImpl("test-ruleset-id");
  });

  describe("one-backend-one-frontend mode", () => {

    it("calls ipc handler to set variable value on backend", async () => {
      sinon.stub(IpcApp, "isValid").get(() => true);
      const ipcHandlerMock = moq.Mock.ofType<IpcRequestsHandler>();
      const rulesetId = "test-ruleset-id";
      vars = new RulesetVariablesManagerImpl(rulesetId, ipcHandlerMock.object);

      const testVariable: RulesetVariable = {
        id: "test-var-id",
        type: VariableValueTypes.String,
        value: "test-value",
      };
      ipcHandlerMock.setup(async (x) => x.setRulesetVariable(moq.It.isObjectWith({ rulesetId, variable: testVariable }))).verifiable(moq.Times.once());

      await vars.setString(testVariable.id, testVariable.value);
      ipcHandlerMock.verifyAll();
    });

  });

  describe("getAllVariables", () => {

    it("return empty array if there's no variables", async () => {
      expect(vars.getAllVariables()).to.deep.eq([]);
    });

    it("returns variables", async () => {
      const variables = [{ id: variableId, type: VariableValueTypes.String, value: faker.random.word() }];
      await vars.setString(variables[0].id, variables[0].value);
      const allVariables = vars.getAllVariables();
      expect(allVariables).to.deep.eq(variables);
    });
  });

  describe("string", () => {

    it("returns empty string if there's no value", async () => {
      expect(await vars.getString(variableId)).to.eq("");
    });

    it("sets and returns value", async () => {
      const value = faker.random.word();
      await vars.setString(variableId, value);
      expect(await vars.getString(variableId)).to.eq(value);
    });

    it("raises onVariableChanged event when variable changes", async () => {
      const spy = sinon.spy();
      vars.onVariableChanged.addListener(spy);
      const value = faker.random.word();
      await vars.setString(variableId, value);
      expect(spy).to.be.calledWith(variableId);
    });

  });

  describe("bool", () => {

    it("returns `false` if there's no value", async () => {
      expect(await vars.getBool(variableId)).to.be.false;
    });

    it("sets and returns value", async () => {
      const value = faker.random.boolean();
      await vars.setBool(variableId, value);
      expect(await vars.getBool(variableId)).to.eq(value);
    });

    it("raises onVariableChanged event when variable changes", async () => {
      const spy = sinon.spy();
      vars.onVariableChanged.addListener(spy);
      const value = faker.random.boolean();
      await vars.setBool(variableId, value);
      expect(spy).to.be.calledWith(variableId);
    });

    it("handles type conversion", async () => {
      await vars.setBool(variableId, false);
      expect(await vars.getString(variableId)).to.deep.eq("");
      expect(await vars.getInt(variableId)).to.deep.eq(0);
      expect(await vars.getInts(variableId)).to.deep.eq([]);
      expect(await vars.getId64(variableId)).to.deep.eq(Id64.invalid);
      expect(await vars.getId64s(variableId)).to.deep.eq([]);

      await vars.setBool(variableId, true);
      expect(await vars.getString(variableId)).to.deep.eq("");
      expect(await vars.getInt(variableId)).to.deep.eq(1);
      expect(await vars.getInts(variableId)).to.deep.eq([]);
      expect(await vars.getId64(variableId)).to.deep.eq(Id64.fromLocalAndBriefcaseIds(1, 0));
      expect(await vars.getId64s(variableId)).to.deep.eq([]);
    });

  });

  describe("int", () => {

    it("returns `0` if there's no value", async () => {
      expect(await vars.getInt(variableId)).to.eq(0);
    });

    it("sets and returns value", async () => {
      const value = faker.random.number();
      await vars.setInt(variableId, value);
      expect(await vars.getInt(variableId)).to.eq(value);
    });

    it("raises onVariableChanged event when variable changes", async () => {
      const spy = sinon.spy();
      vars.onVariableChanged.addListener(spy);
      const value = faker.random.number();
      await vars.setInt(variableId, value);
      expect(spy).to.be.calledWith(variableId);
    });

    it("handles type conversion", async () => {
      const value = faker.random.number();
      await vars.setInt(variableId, value);
      expect(await vars.getBool(variableId)).to.deep.eq(true);
      expect(await vars.getString(variableId)).to.deep.eq("");
      expect(await vars.getInts(variableId)).to.deep.eq([]);
      expect(await vars.getId64(variableId)).to.deep.eq(Id64.fromLocalAndBriefcaseIds(value, 0));
      expect(await vars.getId64s(variableId)).to.deep.eq([]);
    });

  });

  describe("int[]", () => {

    it("returns empty list if there's no value", async () => {
      expect(await vars.getInts(variableId)).to.deep.eq([]);
    });

    it("sets and returns value", async () => {
      const value = [faker.random.number(), faker.random.number()];
      await vars.setInts(variableId, value);
      expect(await vars.getInts(variableId)).to.eq(value);
    });

    it("raises onVariableChanged event when variable changes", async () => {
      const spy = sinon.spy();
      vars.onVariableChanged.addListener(spy);
      const value = [faker.random.number(), faker.random.number()];
      await vars.setInts(variableId, value);
      expect(spy).to.be.calledWith(variableId);
    });

    it("handles type conversion", async () => {
      const value = [faker.random.number(), faker.random.number()];
      await vars.setInts(variableId, value);
      expect(await vars.getBool(variableId)).to.deep.eq(false);
      expect(await vars.getString(variableId)).to.deep.eq("");
      expect(await vars.getInt(variableId)).to.deep.eq(0);
      expect(await vars.getId64(variableId)).to.deep.eq(Id64.invalid);
      expect(await vars.getId64s(variableId)).to.deep.eq(value.map((v) => Id64.fromLocalAndBriefcaseIds(v, 0)));
    });

  });

  describe("Id64", () => {

    it("returns invalid Id64 if there's no value", async () => {
      expect(await vars.getId64(variableId)).to.deep.eq(Id64.invalid);
    });

    it("sets and returns value", async () => {
      const value = createRandomId();
      await vars.setId64(variableId, value);
      expect(await vars.getId64(variableId)).to.eq(value);
    });

    it("raises onVariableChanged event when variable changes", async () => {
      const spy = sinon.spy();
      vars.onVariableChanged.addListener(spy);
      const value = createRandomId();
      await vars.setId64(variableId, value);
      expect(spy).to.be.calledWith(variableId);
    });

    it("handles type conversion", async () => {
      const value = createRandomId();
      await vars.setId64(variableId, value);
      expect(await vars.getBool(variableId)).to.deep.eq(Id64.isValid(value));
      expect(await vars.getString(variableId)).to.deep.eq("");
      expect(await vars.getInt(variableId)).to.deep.eq(Id64.getUpperUint32(value));
      expect(await vars.getInts(variableId)).to.deep.eq([]);
      expect(await vars.getId64s(variableId)).to.deep.eq([]);
    });

  });

  describe("Id64[]", () => {

    it("returns empty list if there's no value", async () => {
      expect(await vars.getId64s(variableId)).to.deep.eq([]);
    });

    it("sets and returns value", async () => {
      const value = [createRandomId(), createRandomId()];
      await vars.setId64s(variableId, value);
      expect(await vars.getId64s(variableId)).to.eq(value);
    });

    it("raises onVariableChanged event when variable changes", async () => {
      const spy = sinon.spy();
      vars.onVariableChanged.addListener(spy);
      const value = [createRandomId(), createRandomId()];
      await vars.setId64s(variableId, value);
      expect(spy).to.be.calledWith(variableId);
    });

    it("handles type conversion", async () => {
      const value = [createRandomId(), createRandomId()];
      await vars.setId64s(variableId, value);
      expect(await vars.getBool(variableId)).to.deep.eq(false);
      expect(await vars.getString(variableId)).to.deep.eq("");
      expect(await vars.getInt(variableId)).to.deep.eq(0);
      expect(await vars.getInts(variableId)).to.deep.eq(value.map((v) => Id64.getUpperUint32(v)));
      expect(await vars.getId64(variableId)).to.deep.eq(Id64.invalid);
    });

  });

});
