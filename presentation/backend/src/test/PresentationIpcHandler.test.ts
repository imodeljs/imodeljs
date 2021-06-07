/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as sinon from "sinon";
import * as moq from "typemoq";
import { IModelDb, IModelJsNative } from "@bentley/imodeljs-backend";
import {
  NodeKeyJSON, RulesetVariableJSON, SetRulesetVariableParams, StringRulesetVariable, UpdateHierarchyStateParams, VariableValueTypes,
} from "@bentley/presentation-common";
import { createRandomBaseNodeKey } from "@bentley/presentation-common/lib/test/_helpers/random";
import { NativePlatformDefinition } from "../presentation-backend/NativePlatform";
import { Presentation } from "../presentation-backend/Presentation";
import { PresentationIpcHandler } from "../presentation-backend/PresentationIpcHandler";
import { PresentationManager } from "../presentation-backend/PresentationManager";
import { RulesetVariablesManager } from "../presentation-backend/RulesetVariablesManager";

describe("PresentationIpcHandler", () => {
  const presentationManagerMock = moq.Mock.ofType<PresentationManager>();

  beforeEach(() => {
    presentationManagerMock.reset();
    sinon.stub(Presentation, "getManager").returns(presentationManagerMock.object);
  });

  describe("setRulesetVariable", () => {
    const testRulesetId = "test-ruleset-id";
    const variablesManagerMock = moq.Mock.ofType<RulesetVariablesManager>();

    beforeEach(() => {
      presentationManagerMock.setup((x) => x.vars(testRulesetId)).returns(() => variablesManagerMock.object);
    });

    it("sets ruleset variable", async () => {
      const testVariable: StringRulesetVariable = { id: "var-id", type: VariableValueTypes.String, value: "test-val" };
      variablesManagerMock.setup((x) => x.setValue(testVariable.id, testVariable.type, testVariable.value)).verifiable(moq.Times.once());

      const ipcHandler = new PresentationIpcHandler();
      const params: SetRulesetVariableParams<RulesetVariableJSON> = {
        clientId: "test-client-id",
        rulesetId: testRulesetId,
        variable: testVariable,
      };
      await ipcHandler.setRulesetVariable(params);
      variablesManagerMock.verifyAll();
    });
  });

  describe("updateHierarchyState", () => {
    const testRulesetId = "test-ruleset-id";
    const nativeAddonMock = moq.Mock.ofType<NativePlatformDefinition>();

    beforeEach(() => {
      nativeAddonMock.reset();
      presentationManagerMock.setup((x) => x.getNativePlatform()).returns(() => nativeAddonMock.object);
    });

    it("does not call native platform's updateHierarchyState if imodelDb is not found", async () => {
      nativeAddonMock.setup((x) => x.updateHierarchyState(moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny())).verifiable(moq.Times.never());

      const ipcHandler = new PresentationIpcHandler();
      const params: UpdateHierarchyStateParams<NodeKeyJSON> = {
        clientId: "client-id",
        rulesetId: testRulesetId,
        imodelKey: "imodel-key",
        changeType: "nodesExpanded",
        nodeKeys: [],
      };
      await ipcHandler.updateHierarchyState(params);
      nativeAddonMock.verifyAll();
    });

    it("calls native platform's updateHierarchyState", async () => {
      const imodelDbMock = moq.Mock.ofType<IModelDb>();
      const nativeDgnDbMock = moq.Mock.ofType<IModelJsNative.DgnDb>();
      imodelDbMock.setup((x) => x.nativeDb).returns(() => nativeDgnDbMock.object);
      sinon.stub(IModelDb, "tryFindByKey").returns(imodelDbMock.object);

      const nodeKey: NodeKeyJSON = createRandomBaseNodeKey();
      nativeAddonMock.setup((x) => x.updateHierarchyState(nativeDgnDbMock.object, testRulesetId, "nodesExpanded", JSON.stringify([nodeKey]))).verifiable(moq.Times.once());

      const ipcHandler = new PresentationIpcHandler();
      const params: UpdateHierarchyStateParams<NodeKeyJSON> = {
        clientId: "client-id",
        rulesetId: testRulesetId,
        imodelKey: "imodel-key",
        changeType: "nodesExpanded",
        nodeKeys: [nodeKey],
      };
      await ipcHandler.updateHierarchyState(params);
      nativeAddonMock.verifyAll();
    });
  });
});
