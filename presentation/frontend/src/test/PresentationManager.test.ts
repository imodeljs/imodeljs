/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* eslint-disable deprecation/deprecation */
import { expect } from "chai";
import * as faker from "faker";
import sinon from "sinon";
import { BeDuration, BeEvent, CompressedId64Set, Logger, using } from "@bentley/bentleyjs-core";
import { IModelRpcProps, IpcListener, RemoveFunction } from "@bentley/imodeljs-common";
import { IModelConnection, IpcApp } from "@bentley/imodeljs-frontend";
import { I18N, I18NNamespace } from "@bentley/imodeljs-i18n";
import {
  Content, ContentDescriptorRequestOptions, ContentRequestOptions, Descriptor, DisplayLabelRequestOptions, DisplayLabelsRequestOptions,
  DisplayValueGroup, DistinctValuesRequestOptions, ExtendedContentRequestOptions, ExtendedHierarchyRequestOptions, FieldDescriptor,
  FieldDescriptorType, HierarchyCompareInfoJSON, HierarchyCompareOptions, HierarchyRequestOptions, InstanceKey, Item, KeySet, LabelDefinition,
  LabelRequestOptions, Node, NodeKey, NodePathElement, Paged, PartialHierarchyModification, PresentationError, PresentationIpcEvents,
  PresentationStatus, PresentationUnitSystem, RegisteredRuleset, RpcRequestsHandler, Ruleset, RulesetVariable, UpdateInfo, VariableValueTypes,
} from "@bentley/presentation-common";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import {
  createRandomBaseNodeKey, createRandomDescriptor, createRandomECInstanceKey, createRandomECInstancesNode, createRandomECInstancesNodeJSON,
  createRandomECInstancesNodeKey, createRandomLabelDefinition, createRandomNodePathElement, createRandomRuleset, createRandomTransientId,
} from "@bentley/presentation-common/lib/test/_helpers/random";
import { IpcRequestsHandler } from "../presentation-frontend/IpcRequestsHandler";
import { Presentation } from "../presentation-frontend/Presentation";
import {
  buildPagedResponse, IModelContentChangeEventArgs, IModelHierarchyChangeEventArgs, PresentationManager,
} from "../presentation-frontend/PresentationManager";
import { RulesetManagerImpl } from "../presentation-frontend/RulesetManager";
import { RulesetVariablesManagerImpl } from "../presentation-frontend/RulesetVariablesManager";
import { TRANSIENT_ELEMENT_CLASSNAME } from "../presentation-frontend/selection/SelectionManager";
import { StateTracker } from "../presentation-frontend/StateTracker";

describe("PresentationManager", () => {

  const rulesetsManagerMock = moq.Mock.ofType<RulesetManagerImpl>();
  const rpcRequestsHandlerMock = moq.Mock.ofType<RpcRequestsHandler>();
  let manager: PresentationManager;
  const i18nMock = moq.Mock.ofType<I18N>();
  const testData = {
    imodelToken: moq.Mock.ofType<IModelRpcProps>().object,
    imodelMock: moq.Mock.ofType<IModelConnection>(),
    pageOptions: { start: 0, size: 0 },
    rulesetId: "",
  };
  let rulesetManagerCreateStub: sinon.SinonSpy<[], RulesetManagerImpl>;

  beforeEach(() => {
    mockI18N();
    testData.imodelMock.reset();
    testData.imodelMock.setup((x) => x.getRpcProps()).returns(() => testData.imodelToken);
    testData.imodelMock.setup((x) => x.onClose).returns(() => new BeEvent());
    testData.pageOptions = { start: faker.random.number(), size: faker.random.number() };
    testData.rulesetId = faker.random.uuid();
    rulesetsManagerMock.reset();
    rulesetManagerCreateStub = sinon.stub(RulesetManagerImpl, "create").returns(rulesetsManagerMock.object);
    rpcRequestsHandlerMock.reset();
    manager = PresentationManager.create({
      rpcRequestsHandler: rpcRequestsHandlerMock.object,
    });
  });

  afterEach(() => {
    manager.dispose();
    Presentation.terminate();
  });

  const mockI18N = () => {
    i18nMock.reset();
    Presentation.setI18nManager(i18nMock.object);
    const resolvedPromise = new Promise<void>((resolve) => resolve());
    i18nMock.setup((x) => x.registerNamespace(moq.It.isAny())).returns((name: string) => new I18NNamespace(name, resolvedPromise));
    i18nMock.setup((x) => x.translate(moq.It.isAny(), moq.It.isAny())).returns((stringId) => stringId);
  };

  const toIModelTokenOptions = <TOptions extends { imodel: IModelConnection, locale?: string, unitSystem?: PresentationUnitSystem }>(requestOptions: TOptions) => {
    return {
      ...requestOptions,
      imodel: requestOptions.imodel.getRpcProps(),
    };
  };

  const prepareOptions = <TOptions extends { imodel: IModelConnection, rulesetOrId: Ruleset | string, locale?: string, unitSystem?: PresentationUnitSystem, rulesetVariables?: RulesetVariable[] }>(options: TOptions) => {
    return toIModelTokenOptions({
      ...options,
      rulesetVariables: options.rulesetVariables?.map(RulesetVariable.toJSON) ?? [],
    });
  };

  describe("constructor", () => {

    it("sets active locale if supplied with props", async () => {
      const props = { activeLocale: faker.locale };
      const mgr = PresentationManager.create(props);
      expect(mgr.activeLocale).to.eq(props.activeLocale);
    });

    it("sets active unit system if supplied with props", async () => {
      const props = { activeUnitSystem: PresentationUnitSystem.UsSurvey };
      const mgr = PresentationManager.create(props);
      expect(mgr.activeUnitSystem).to.eq(props.activeUnitSystem);
    });

    it("sets custom RpcRequestsHandler if supplied with props", async () => {
      const handler = moq.Mock.ofType<RpcRequestsHandler>();
      const props = { rpcRequestsHandler: handler.object };
      const mgr = PresentationManager.create(props);
      expect(mgr.rpcRequestsHandler).to.eq(handler.object);
    });

    it("sets RpcRequestsHandler clientId if supplied with props", async () => {
      const props = { clientId: faker.random.uuid() };
      const mgr = PresentationManager.create(props);
      expect(mgr.rpcRequestsHandler.clientId).to.eq(props.clientId);
    });

    it("sets custom IpcRequestsHandler if supplied with props", async () => {
      sinon.stub(IpcApp, "isValid").get(() => true);
      sinon.stub(IpcApp, "addListener");
      const handler = moq.Mock.ofType<IpcRequestsHandler>();
      const props = { ipcRequestsHandler: handler.object };
      const mgr = PresentationManager.create(props);
      expect(mgr.ipcRequestsHandler).to.eq(handler.object);
    });

    it("creates RpcRequestsHandler and IpcRequestsHandler with same client id", async () => {
      sinon.stub(IpcApp, "isValid").get(() => true);
      sinon.stub(IpcApp, "addListener");
      const mgr = PresentationManager.create();
      expect(mgr.rpcRequestsHandler.clientId).to.eq(mgr.ipcRequestsHandler?.clientId);
    });

    it("sets custom StateTracker if supplied with props", async () => {
      sinon.stub(IpcApp, "isValid").get(() => true);
      sinon.stub(IpcApp, "addListener");
      const tracker = moq.Mock.ofType<StateTracker>();
      const mgr = PresentationManager.create({ stateTracker: tracker.object });
      expect(mgr.stateTracker).to.eq(tracker.object);
    });

    it("starts listening to update events", async () => {
      sinon.stub(IpcApp, "isValid").get(() => true);
      const addListenerSpy = sinon.stub(IpcApp, "addListener").returns(() => { });
      using(PresentationManager.create(), (_) => { });
      expect(addListenerSpy).to.be.calledOnceWith(PresentationIpcEvents.Update, sinon.match((arg) => typeof arg === "function"));
    });

  });

  describe("dispose", () => {

    it("disposes RPC requests handler", () => {
      manager.dispose();
      rpcRequestsHandlerMock.verify((x) => x.dispose(), moq.Times.once());
    });

  });

  describe("onConnection", () => {

    it("caches IModelConnection and calls `onNewiModelConnection` for the first time", async () => {
      const spy = sinon.stub(manager, "onNewiModelConnection");
      const onCloseEvent = new BeEvent();
      const imodelMock = moq.Mock.ofType<IModelConnection>();
      imodelMock.setup((x) => x.onClose).returns(() => onCloseEvent);
      rpcRequestsHandlerMock.setup(async (x) => x.getNodesCount(moq.It.isAny())).returns(async () => 0);

      // expect the spy to be called on first imodel use
      await manager.getNodesCount({ // eslint-disable-line deprecation/deprecation
        imodel: imodelMock.object,
        rulesetOrId: testData.rulesetId,
      });
      expect(spy).to.be.calledOnceWith(imodelMock.object);
      spy.resetHistory();

      // expect the spy to not be called second time
      await manager.getNodesCount({ // eslint-disable-line deprecation/deprecation
        imodel: imodelMock.object,
        rulesetOrId: testData.rulesetId,
      });
      expect(spy).to.not.be.called;
      spy.resetHistory();

      // simulate imodel close
      onCloseEvent.raiseEvent();

      // expect the spy to be called again
      await manager.getNodesCount({ // eslint-disable-line deprecation/deprecation
        imodel: imodelMock.object,
        rulesetOrId: testData.rulesetId,
      });
      expect(spy).to.be.calledOnceWith(imodelMock.object);
    });

  });

  describe("activeLocale", () => {

    it("requests with manager's locale if not set in request options", async () => {
      const locale = faker.random.locale();
      manager.activeLocale = locale;
      await manager.getNodesCount({  // eslint-disable-line deprecation/deprecation
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      });
      rpcRequestsHandlerMock.verify(async (x) => x.getNodesCount({
        imodel: testData.imodelToken,
        rulesetOrId: testData.rulesetId,
        locale,
        rulesetVariables: [],
        parentKey: undefined,
      }), moq.Times.once());
    });

    it("requests with request's locale if set", async () => {
      const locale = faker.random.locale();
      manager.activeLocale = faker.random.locale();
      expect(manager.activeLocale).to.not.eq(locale);
      await manager.getNodesCount({  // eslint-disable-line deprecation/deprecation
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        locale,
      });
      rpcRequestsHandlerMock.verify(async (x) => x.getNodesCount({
        imodel: testData.imodelToken,
        rulesetOrId: testData.rulesetId,
        locale,
        rulesetVariables: [],
        parentKey: undefined,
      }), moq.Times.once());
    });

  });

  describe("activeUnitSystem", () => {

    it("requests with manager's unit system if not set in request options", async () => {
      const keys = new KeySet();
      const unitSystem = PresentationUnitSystem.UsSurvey;
      manager.activeUnitSystem = unitSystem;
      await manager.getContentDescriptor({
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        displayType: "",
        keys,
      });
      rpcRequestsHandlerMock.verify(async (x) => x.getContentDescriptor({
        imodel: testData.imodelToken,
        rulesetOrId: testData.rulesetId,
        unitSystem,
        rulesetVariables: [],
        displayType: "",
        keys: keys.toJSON(),
      }), moq.Times.once());
    });

    it("requests with request's locale if set", async () => {
      const keys = new KeySet();
      const unitSystem = PresentationUnitSystem.UsSurvey;
      manager.activeUnitSystem = PresentationUnitSystem.Metric;
      await manager.getContentDescriptor({
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        unitSystem,
        displayType: "",
        keys,
      });
      rpcRequestsHandlerMock.verify(async (x) => x.getContentDescriptor({
        imodel: testData.imodelToken,
        rulesetOrId: testData.rulesetId,
        unitSystem,
        rulesetVariables: [],
        displayType: "",
        keys: keys.toJSON(),
      }), moq.Times.once());
    });

  });

  describe("ruleset variables", () => {
    const variableId = faker.random.word();
    const variableValue = faker.random.word();

    beforeEach(async () => {
      await manager.vars(testData.rulesetId).setString(variableId, variableValue);
    });

    it("injects ruleset variables into request options", async () => {
      await manager.getNodesCount({
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      });
      rpcRequestsHandlerMock.verify(async (x) => x.getNodesCount({
        imodel: testData.imodelToken,
        rulesetOrId: testData.rulesetId,
        rulesetVariables: [{ id: variableId, value: variableValue, type: VariableValueTypes.String }],
        parentKey: undefined,
      }), moq.Times.once());
    });

    it("orders Id64[] ruleset variables before injecting into request options", async () => {
      await manager.getNodesCount({
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        rulesetVariables: [{
          type: VariableValueTypes.Id64Array,
          id: "order-id64[]",
          value: ["0x2", "0x1"],
        }],
      });
      rpcRequestsHandlerMock.verify(async (x) => x.getNodesCount({
        imodel: testData.imodelToken,
        rulesetOrId: testData.rulesetId,
        rulesetVariables: [
          { id: "order-id64[]", value: CompressedId64Set.compressArray(["0x1", "0x2"]), type: VariableValueTypes.Id64Array },
          { id: variableId, value: variableValue, type: VariableValueTypes.String },
        ],
        parentKey: undefined,
      }), moq.Times.once());
    });

    it("does not inject ruleset variables into request options in IpcApp", async () => {
      sinon.stub(IpcApp, "isValid").get(() => true);
      sinon.stub(IpcApp, "addListener");
      manager.dispose();
      manager = PresentationManager.create({
        rpcRequestsHandler: rpcRequestsHandlerMock.object,
      });
      await manager.getNodesCount({  // eslint-disable-line deprecation/deprecation
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      });
      rpcRequestsHandlerMock.verify(async (x) => x.getNodesCount({
        imodel: testData.imodelToken,
        rulesetOrId: testData.rulesetId,
        rulesetVariables: [],
        parentKey: undefined,
      }), moq.Times.once());
    });

  });

  describe("rulesets", () => {

    it("returns rulesets manager provided through props", () => {
      const rulesets = manager.rulesets();
      expect(rulesets).to.eq(rulesetsManagerMock.object);
    });

    it("returns an instance of `RulesetManagerImpl` if not provided through props", () => {
      rulesetManagerCreateStub.restore();
      manager = PresentationManager.create();
      const rulesets = manager.rulesets();
      expect(rulesets).to.be.instanceOf(RulesetManagerImpl);
    });

  });

  describe("vars", () => {

    it("returns ruleset variables manager", () => {
      const vars = manager.vars(testData.rulesetId);
      expect(vars).to.be.instanceOf(RulesetVariablesManagerImpl);

      const vars2 = manager.vars(testData.rulesetId);
      expect(vars2).to.equal(vars);
    });

  });

  describe("getNodesAndCount", () => {

    it("[deprecated] requests child nodes from proxy", async () => {
      const parentNodeKey = createRandomECInstancesNodeKey();
      const nodes = [createRandomECInstancesNode(), createRandomECInstancesNode()];
      const count = 2;
      const options: Paged<HierarchyRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedNodes(prepareOptions({ ...options, parentKey: NodeKey.toJSON(parentNodeKey) })))
        .returns(async () => ({ total: count, items: nodes.map(Node.toJSON) }))
        .verifiable();
      const actualResult = await manager.getNodesAndCount(options, parentNodeKey); // eslint-disable-line deprecation/deprecation
      expect(actualResult).to.deep.eq({ count, nodes });
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests root nodes from proxy", async () => {
      const nodes = [createRandomECInstancesNode(), createRandomECInstancesNode()];
      const count = 2;
      const options: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
        parentKey: undefined,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedNodes(prepareOptions(options)))
        .returns(async () => ({ total: count, items: nodes.map(Node.toJSON) }))
        .verifiable();
      const actualResult = await manager.getNodesAndCount(options);
      expect(actualResult).to.deep.eq({ count, nodes });
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests child nodes from proxy", async () => {
      const parentNodeKey = createRandomECInstancesNodeKey();
      const nodes = [createRandomECInstancesNode(), createRandomECInstancesNode()];
      const count = 2;
      const options: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
        parentKey: parentNodeKey,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedNodes(prepareOptions({ ...options, parentKey: NodeKey.toJSON(parentNodeKey) })))
        .returns(async () => ({ total: count, items: nodes.map(Node.toJSON) }))
        .verifiable();
      const actualResult = await manager.getNodesAndCount(options);
      expect(actualResult).to.deep.eq({ count, nodes });
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests child nodes through multiple requests when getting partial responses", async () => {
      const parentNodeKey = createRandomECInstancesNodeKey();
      const node1 = createRandomECInstancesNode();
      const node2 = createRandomECInstancesNode();
      const count = 2;
      const options: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        parentKey: parentNodeKey,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedNodes(prepareOptions({ ...options, parentKey: NodeKey.toJSON(parentNodeKey), paging: { start: 0, size: 0 } })))
        .returns(async () => ({ total: count, items: [Node.toJSON(node1)] }))
        .verifiable();
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedNodes(prepareOptions({ ...options, parentKey: NodeKey.toJSON(parentNodeKey), paging: { start: 1, size: 0 } })))
        .returns(async () => ({ total: count, items: [Node.toJSON(node2)] }))
        .verifiable();
      const actualResult = await manager.getNodesAndCount(options);
      expect(actualResult).to.deep.eq({ count, nodes: [node1, node2] });
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getNodes", () => {

    it("[deprecated] requests child nodes from proxy", async () => {
      const parentNodeKey = createRandomECInstancesNodeKey();
      const result = [createRandomECInstancesNode(), createRandomECInstancesNode()];
      const options: Paged<HierarchyRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedNodes(prepareOptions({ ...options, parentKey: NodeKey.toJSON(parentNodeKey) })))
        .returns(async () => ({ total: 666, items: result.map(Node.toJSON) }))
        .verifiable();
      const actualResult = await manager.getNodes(options, parentNodeKey); // eslint-disable-line deprecation/deprecation
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests root nodes from proxy", async () => {
      const result = [createRandomECInstancesNode(), createRandomECInstancesNode()];
      const options: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
        parentKey: undefined,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedNodes(prepareOptions(options)))
        .returns(async () => ({ total: 666, items: result.map(Node.toJSON) }))
        .verifiable();
      const actualResult = await manager.getNodes(options); // eslint-disable-line deprecation/deprecation
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests child nodes from proxy", async () => {
      const parentNodeKey = createRandomECInstancesNodeKey();
      const result = [createRandomECInstancesNode(), createRandomECInstancesNode()];
      const options: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
        parentKey: parentNodeKey,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedNodes(prepareOptions({ ...options, parentKey: NodeKey.toJSON(parentNodeKey) })))
        .returns(async () => ({ total: 666, items: result.map(Node.toJSON) }))
        .verifiable();
      const actualResult = await manager.getNodes(options);
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests child nodes through multiple requests when getting partial responses", async () => {
      const parentNodeKey = createRandomECInstancesNodeKey();
      const node1 = createRandomECInstancesNode();
      const node2 = createRandomECInstancesNode();
      const count = 2;
      const options: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        parentKey: parentNodeKey,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedNodes(prepareOptions({ ...options, parentKey: NodeKey.toJSON(parentNodeKey), paging: { start: 0, size: 0 } })))
        .returns(async () => ({ total: count, items: [Node.toJSON(node1)] }))
        .verifiable();
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedNodes(prepareOptions({ ...options, parentKey: NodeKey.toJSON(parentNodeKey), paging: { start: 1, size: 0 } })))
        .returns(async () => ({ total: count, items: [Node.toJSON(node2)] }))
        .verifiable();
      const actualResult = await manager.getNodes(options);
      expect(actualResult).to.deep.eq([node1, node2]);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getNodesCount", () => {

    it("requests root nodes count from proxy", async () => {
      const result = faker.random.number();
      const options: ExtendedHierarchyRequestOptions<IModelConnection, NodeKey> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        parentKey: undefined,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getNodesCount(prepareOptions(options)))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getNodesCount(options);
      expect(actualResult).to.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests child nodes count from proxy", async () => {
      const parentNodeKey = createRandomECInstancesNodeKey();
      const result = faker.random.number();
      const options: ExtendedHierarchyRequestOptions<IModelConnection, NodeKey> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        parentKey: parentNodeKey,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getNodesCount(prepareOptions({ ...options, parentKey: NodeKey.toJSON(parentNodeKey) })))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getNodesCount(options);
      expect(actualResult).to.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("[deprecated] requests child nodes count from proxy", async () => {
      const parentNodeKey = createRandomECInstancesNodeKey();
      const result = faker.random.number();
      const options: HierarchyRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getNodesCount(prepareOptions({ ...options, parentKey: NodeKey.toJSON(parentNodeKey) })))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getNodesCount(options, parentNodeKey); // eslint-disable-line deprecation/deprecation
      expect(actualResult).to.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getFilteredNodePaths", () => {

    it("calls getFilteredNodePaths through proxy", async () => {
      const value = [createRandomNodePathElement(0), createRandomNodePathElement(0)];
      const options: HierarchyRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock.setup(async (x) => x.getFilteredNodePaths(prepareOptions(options), "filter"))
        .returns(async () => value.map(NodePathElement.toJSON))
        .verifiable();
      const result = await manager.getFilteredNodePaths(options, "filter");
      expect(result).to.be.deep.equal(value);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getNodePaths", () => {

    it("calls getNodePaths through proxy", async () => {
      const value = [createRandomNodePathElement(0), createRandomNodePathElement(0)];
      const keyArray = [[createRandomECInstanceKey(), createRandomECInstanceKey()]];
      const options: HierarchyRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock.setup(async (x) => x.getNodePaths(prepareOptions(options), keyArray.map((k) => k.map(InstanceKey.toJSON)), 1))
        .returns(async () => value.map(NodePathElement.toJSON))
        .verifiable();
      const result = await manager.getNodePaths(options, keyArray, 1);
      expect(result).to.be.deep.equal(value);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getContentDescriptor", () => {

    it("[deprecated] requests descriptor from proxy", async () => {
      const keyset = new KeySet();
      const result = createRandomDescriptor();
      const options: ContentRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContentDescriptor(prepareOptions({ ...options, displayType: "test", keys: keyset.toJSON(), selection: undefined })))
        .returns(async () => result.toJSON())
        .verifiable();
      const actualResult = await manager.getContentDescriptor(options, "test", keyset, undefined); // eslint-disable-line deprecation/deprecation
      expect(actualResult).to.be.instanceOf(Descriptor);
      expect(actualResult!.toJSON()).to.deep.eq(result.toJSON());
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests descriptor from proxy", async () => {
      const keyset = new KeySet();
      const result = createRandomDescriptor();
      const options: ContentDescriptorRequestOptions<IModelConnection, KeySet> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        displayType: "test",
        keys: keyset,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContentDescriptor(prepareOptions({ ...options, keys: keyset.toJSON() })))
        .returns(async () => result.toJSON())
        .verifiable();
      const actualResult = await manager.getContentDescriptor(options);
      expect(actualResult).to.be.instanceOf(Descriptor);
      expect(actualResult!.toJSON()).to.deep.eq(result.toJSON());
      rpcRequestsHandlerMock.verifyAll();
    });

    it("skips transient element keys", async () => {
      const persistentKey = createRandomECInstanceKey();
      const transientKey = { className: TRANSIENT_ELEMENT_CLASSNAME, id: createRandomTransientId() };
      const keyset = new KeySet([persistentKey, transientKey]);
      const options: ContentDescriptorRequestOptions<IModelConnection, KeySet> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        displayType: "test",
        keys: keyset,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContentDescriptor(prepareOptions({ ...options, keys: new KeySet([persistentKey]).toJSON() })))
        .returns(async () => createRandomDescriptor().toJSON())
        .verifiable();
      await manager.getContentDescriptor(options);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("handles undefined descriptor", async () => {
      const keyset = new KeySet();
      const options: ContentDescriptorRequestOptions<IModelConnection, KeySet> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        displayType: "test",
        keys: keyset,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContentDescriptor(prepareOptions({ ...options, keys: keyset.toJSON() })))
        .returns(async () => undefined)
        .verifiable();
      const actualResult = await manager.getContentDescriptor(options);
      rpcRequestsHandlerMock.verifyAll();
      expect(actualResult).to.be.undefined;
    });

  });

  describe("getContentSetSize", () => {

    it("[deprecated] requests content set size from proxy", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const result = faker.random.number();
      const options: ContentRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContentSetSize(prepareOptions({ ...options, descriptor: descriptor.createDescriptorOverrides(), keys: keyset.toJSON() })))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getContentSetSize(options, descriptor, keyset); // eslint-disable-line deprecation/deprecation
      expect(actualResult).to.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests content set size from proxy", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const result = faker.random.number();
      const options: ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        descriptor,
        keys: keyset,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContentSetSize(prepareOptions({ ...options, descriptor: descriptor.createDescriptorOverrides(), keys: keyset.toJSON() })))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getContentSetSize(options);
      expect(actualResult).to.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests content set size from proxy when descriptor overrides are passed instead of descriptor", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const overrides = descriptor.createDescriptorOverrides();
      const result = faker.random.number();
      const options: ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        descriptor: overrides,
        keys: keyset,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getContentSetSize(prepareOptions({ ...options, descriptor: overrides, keys: keyset.toJSON() })))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getContentSetSize(options);
      expect(actualResult).to.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getContent", () => {

    it("[deprecated] requests content from proxy", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const result = {
        total: 999,
        items: [new Item([], "", "", undefined, {}, {}, [])],
      };
      const options: Paged<ContentRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedContentSet(prepareOptions({ ...options, descriptor: descriptor.createDescriptorOverrides(), keys: keyset.toJSON() })))
        .returns(async () => ({ ...result, items: result.items.map((i) => i.toJSON()) }))
        .verifiable();
      const actualResult = await manager.getContent(options, descriptor, keyset); // eslint-disable-line deprecation/deprecation
      expect(actualResult).to.be.instanceOf(Content);
      expect(actualResult!.descriptor).to.eq(descriptor);
      expect(actualResult!.contentSet).to.deep.eq(result.items);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests content from proxy", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const result = {
        total: 999,
        items: [new Item([], "", "", undefined, {}, {}, [])],
      };
      const options: Paged<ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
        descriptor,
        keys: keyset,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedContentSet(prepareOptions({ ...options, descriptor: descriptor.createDescriptorOverrides(), keys: keyset.toJSON() })))
        .returns(async () => ({ ...result, items: result.items.map((i) => i.toJSON()) }))
        .verifiable();
      const actualResult = await manager.getContent(options);
      expect(actualResult).to.be.instanceOf(Content);
      expect(actualResult!.descriptor).to.eq(descriptor);
      expect(actualResult!.contentSet).to.deep.eq(result.items);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests content from proxy when descriptor overrides are passed instead of descriptor", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const overrides = descriptor.createDescriptorOverrides();
      const items = [new Item([], "", "", undefined, {}, {}, [])];
      const options: Paged<ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
        descriptor: overrides,
        keys: keyset,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedContent(prepareOptions({ ...options, descriptor: overrides, keys: keyset.toJSON() })))
        .returns(async () => ({ descriptor: descriptor.toJSON(), contentSet: { total: 999, items: items.map((i) => i.toJSON()) } }))
        .verifiable();
      const actualResult = await manager.getContent(options);
      expect(actualResult).to.be.instanceOf(Content);
      expect(actualResult!.descriptor).to.deep.eq(descriptor);
      expect(actualResult!.contentSet).to.deep.eq(items);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("handles case when response has no content", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const options: Paged<ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
        descriptor: descriptor.createDescriptorOverrides(),
        keys: keyset,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedContent(prepareOptions({ ...options, descriptor: descriptor.createDescriptorOverrides(), keys: keyset.toJSON() })))
        .returns(async () => undefined)
        .verifiable();
      const actualResult = await manager.getContent(options);
      expect(actualResult).to.be.undefined;
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getContentAndContentSize", () => {

    it("[deprecated] requests content and contentSize from proxy", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const result = {
        total: 999,
        items: [new Item([], "", "", undefined, {}, {}, [])],
      };
      const options: Paged<ContentRequestOptions<IModelConnection>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedContentSet(prepareOptions({ ...options, descriptor: descriptor.createDescriptorOverrides(), keys: keyset.toJSON() })))
        .returns(async () => ({ ...result, items: result.items.map((i) => i.toJSON()) }))
        .verifiable();
      const actualResult = await manager.getContentAndSize(options, descriptor, keyset); // eslint-disable-line deprecation/deprecation
      expect(actualResult).to.deep.eq({
        size: result.total,
        content: {
          descriptor,
          contentSet: result.items,
        },
      });
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests content and contentSize from proxy", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const result = {
        total: 999,
        items: [new Item([], "", "", undefined, {}, {}, [])],
      };
      const options: Paged<ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
        descriptor,
        keys: keyset,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedContentSet(prepareOptions({ ...options, descriptor: descriptor.createDescriptorOverrides(), keys: keyset.toJSON() })))
        .returns(async () => ({ ...result, items: result.items.map((i) => i.toJSON()) }))
        .verifiable();
      const actualResult = await manager.getContentAndSize(options);
      expect(actualResult).to.deep.eq({
        size: result.total,
        content: {
          descriptor,
          contentSet: result.items,
        },
      });
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests content and content set size from proxy when descriptor overrides are passed instead of descriptor", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const result = {
        total: 999,
        items: [new Item([], "", "", undefined, {}, {}, [])],
      };
      const options: Paged<ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
        descriptor: descriptor.createDescriptorOverrides(),
        keys: keyset,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedContent(prepareOptions({ ...options, descriptor: descriptor.createDescriptorOverrides(), keys: keyset.toJSON() })))
        .returns(async () => ({ descriptor: descriptor.toJSON(), contentSet: { ...result, items: result.items.map((i) => i.toJSON()) } }))
        .verifiable();
      const actualResult = await manager.getContentAndSize(options);
      expect(actualResult).to.deep.eq({
        size: result.total,
        content: {
          descriptor,
          contentSet: result.items,
        },
      });
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests full content only for the first partial request when using descriptor overrides and multiple partial requests are needed", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const item1 = new Item([], "", "", undefined, {}, {}, []);
      const item2 = new Item([], "", "", undefined, {}, {}, []);
      const options: Paged<ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: { start: 0, size: 2 },
        descriptor: descriptor.createDescriptorOverrides(),
        keys: keyset,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedContent(prepareOptions({ ...options, descriptor: descriptor.createDescriptorOverrides(), keys: keyset.toJSON(), paging: { start: 0, size: 2 } })))
        .returns(async () => ({ descriptor: descriptor.toJSON(), contentSet: { total: 5, items: [item1.toJSON()] } }))
        .verifiable();
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedContentSet(prepareOptions({ ...options, descriptor: descriptor.createDescriptorOverrides(), keys: keyset.toJSON(), paging: { start: 1, size: 1 } })))
        .returns(async () => ({ total: 5, items: [item2.toJSON()] }))
        .verifiable();
      const actualResult = await manager.getContentAndSize(options);
      expect(actualResult).to.deep.eq({
        size: 5,
        content: {
          descriptor,
          contentSet: [item1, item2],
        },
      });
      rpcRequestsHandlerMock.verifyAll();
    });

    it("handles case when response has no content", async () => {
      const keyset = new KeySet();
      const descriptor = createRandomDescriptor();
      const options: Paged<ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        paging: testData.pageOptions,
        descriptor: descriptor.createDescriptorOverrides(),
        keys: keyset,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedContent(prepareOptions({ ...options, descriptor: descriptor.createDescriptorOverrides(), keys: keyset.toJSON() })))
        .returns(async () => undefined)
        .verifiable();
      const actualResult = await manager.getContentAndSize(options);
      expect(actualResult).to.be.undefined;
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("[deprecated] getDistinctValues", () => {

    it("requests distinct values", async () => {
      const keys = new KeySet();
      const descriptor = createRandomDescriptor();
      const fieldName = faker.random.word();
      const maximumValueCount = faker.random.number();
      const fieldDescriptor: FieldDescriptor = {
        type: FieldDescriptorType.Name,
        fieldName,
      };
      const rpcHandlerResult = {
        total: 1,
        items: [{
          displayValue: "aaa",
          groupedRawValues: [faker.random.word(), faker.random.word()],
        }, {
          displayValue: null,
          groupedRawValues: [faker.random.word()],
        }],
      };
      const managerOptions: ContentRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      const rpcHandlerOptions = {
        ...prepareOptions(managerOptions),
        descriptor: descriptor.createDescriptorOverrides(),
        keys: keys.toJSON(),
        fieldDescriptor,
        paging: { start: 0, size: maximumValueCount },
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedDistinctValues(rpcHandlerOptions))
        .returns(async () => rpcHandlerResult)
        .verifiable();
      const actualResult = await manager.getDistinctValues(managerOptions, descriptor, keys, fieldName, maximumValueCount);
      rpcRequestsHandlerMock.verifyAll();
      expect(actualResult).to.deep.eq(["aaa", ""]);
    });

    it("passes 0 for maximumValueCount by default", async () => {
      const keys = new KeySet();
      const descriptor = createRandomDescriptor();
      const fieldName = faker.random.word();
      const fieldDescriptor: FieldDescriptor = {
        type: FieldDescriptorType.Name,
        fieldName,
      };
      const rpcHandlerResult = {
        total: 0,
        items: [],
      };
      const managerOptions: ContentRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
      };
      const rpcHandlerOptions = {
        ...prepareOptions(managerOptions),
        descriptor: descriptor.createDescriptorOverrides(),
        keys: keys.toJSON(),
        fieldDescriptor,
        paging: { start: 0, size: 0 },
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedDistinctValues(rpcHandlerOptions))
        .returns(async () => rpcHandlerResult)
        .verifiable();
      await manager.getDistinctValues(managerOptions, descriptor, keys, fieldName);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getPagedDistinctValues", () => {

    it("requests distinct values", async () => {
      const keys = new KeySet();
      const descriptor = createRandomDescriptor();
      const fieldDescriptor: FieldDescriptor = {
        type: FieldDescriptorType.Name,
        fieldName: faker.random.word(),
      };
      const result = {
        total: 1,
        items: [{
          displayValue: faker.random.word(),
          groupedRawValues: [faker.random.word(), faker.random.word()],
        }],
      };
      const managerOptions: DistinctValuesRequestOptions<IModelConnection, Descriptor, KeySet> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        descriptor,
        keys,
        fieldDescriptor,
      };
      const rpcHandlerOptions = {
        ...prepareOptions(managerOptions),
        descriptor: descriptor.createDescriptorOverrides(),
        keys: keys.toJSON(),
        paging: { start: 0, size: 0 },
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedDistinctValues(rpcHandlerOptions))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getPagedDistinctValues(managerOptions);
      rpcRequestsHandlerMock.verifyAll();
      expect(actualResult).to.deep.eq(result);
    });

    it("requests distinct values through multiple requests when getting partial responses", async () => {
      const keys = new KeySet();
      const descriptor = createRandomDescriptor();
      const fieldDescriptor: FieldDescriptor = {
        type: FieldDescriptorType.Name,
        fieldName: faker.random.word(),
      };
      const item1 = {
        displayValue: faker.random.word(),
        groupedRawValues: [faker.random.word(), faker.random.word()],
      };
      const item2 = {
        displayValue: faker.random.word(),
        groupedRawValues: [faker.random.word(), faker.random.word()],
      };
      const managerOptions: DistinctValuesRequestOptions<IModelConnection, Descriptor, KeySet> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testData.rulesetId,
        descriptor,
        keys,
        fieldDescriptor,
        paging: undefined,
      };
      const rpcHandlerOptions = {
        ...prepareOptions(managerOptions),
        descriptor: descriptor.createDescriptorOverrides(),
        keys: keys.toJSON(),
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedDistinctValues({ ...rpcHandlerOptions, paging: { start: 0, size: 0 } }))
        .returns(async () => ({ total: 2, items: [DisplayValueGroup.toJSON(item1)] }))
        .verifiable();
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedDistinctValues({ ...rpcHandlerOptions, paging: { start: 1, size: 0 } }))
        .returns(async () => ({ total: 2, items: [DisplayValueGroup.toJSON(item2)] }))
        .verifiable();
      const actualResult = await manager.getPagedDistinctValues(managerOptions);
      rpcRequestsHandlerMock.verifyAll();
      expect(actualResult).to.deep.eq({ total: 2, items: [item1, item2] });
    });

  });

  describe("getDisplayLabelDefinition", () => {

    it("[deprecated] requests display label definition", async () => {
      const key = createRandomECInstanceKey();
      const result = createRandomLabelDefinition();
      const options: LabelRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getDisplayLabelDefinition(toIModelTokenOptions({ ...options, key: InstanceKey.toJSON(key) })))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getDisplayLabelDefinition(options, key); // eslint-disable-line deprecation/deprecation
      rpcRequestsHandlerMock.verifyAll();
      expect(actualResult).to.deep.eq(result);
    });

    it("requests display label definition", async () => {
      const result = createRandomLabelDefinition();
      const options: DisplayLabelRequestOptions<IModelConnection, InstanceKey> = {
        imodel: testData.imodelMock.object,
        key: createRandomECInstanceKey(),
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getDisplayLabelDefinition(toIModelTokenOptions({ ...options, key: InstanceKey.toJSON(options.key) })))
        .returns(async () => result)
        .verifiable();
      const actualResult = await manager.getDisplayLabelDefinition(options);
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("getDisplayLabelDefinitions", () => {

    it("[deprecated] requests display labels definitions", async () => {
      const keys = [createRandomECInstanceKey(), createRandomECInstanceKey()];
      const result = [createRandomLabelDefinition(), createRandomLabelDefinition()];
      const options: LabelRequestOptions<IModelConnection> = {
        imodel: testData.imodelMock.object,
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedDisplayLabelDefinitions(toIModelTokenOptions({ ...options, keys: keys.map(InstanceKey.toJSON) })))
        .returns(async () => ({ total: 2, items: result }))
        .verifiable();
      const actualResult = await manager.getDisplayLabelDefinitions(options, keys); // eslint-disable-line deprecation/deprecation
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests display labels definitions", async () => {
      const result = [createRandomLabelDefinition(), createRandomLabelDefinition()];
      const options: DisplayLabelsRequestOptions<IModelConnection, InstanceKey> = {
        imodel: testData.imodelMock.object,
        keys: [createRandomECInstanceKey(), createRandomECInstanceKey()],
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedDisplayLabelDefinitions(toIModelTokenOptions({ ...options, keys: options.keys.map(InstanceKey.toJSON) })))
        .returns(async () => ({ total: 2, items: result.map(LabelDefinition.toJSON) }))
        .verifiable();
      const actualResult = await manager.getDisplayLabelDefinitions(options);
      expect(actualResult).to.deep.eq(result);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("requests display labels definitions through multiple requests when getting partial responses", async () => {
      const key1 = createRandomECInstanceKey();
      const key2 = createRandomECInstanceKey();
      const def1 = createRandomLabelDefinition();
      const def2 = createRandomLabelDefinition();
      const options: DisplayLabelsRequestOptions<IModelConnection, InstanceKey> = {
        imodel: testData.imodelMock.object,
        keys: [key1, key2],
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedDisplayLabelDefinitions(toIModelTokenOptions({ ...options, keys: [key1, key2].map(InstanceKey.toJSON) })))
        .returns(async () => ({ total: 2, items: [LabelDefinition.toJSON(def1)] }))
        .verifiable();
      rpcRequestsHandlerMock
        .setup(async (x) => x.getPagedDisplayLabelDefinitions(toIModelTokenOptions({ ...options, keys: [InstanceKey.toJSON(key2)] })))
        .returns(async () => ({ total: 2, items: [LabelDefinition.toJSON(def2)] }))
        .verifiable();
      const actualResult = await manager.getDisplayLabelDefinitions(options);
      expect(actualResult).to.deep.eq([def1, def2]);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("compareHierarchies", () => {

    it("returns empty result when neither ruleset nor variables changed", async () => {
      const options: HierarchyCompareOptions<IModelConnection, NodeKey> = {
        imodel: testData.imodelMock.object,
        prev: {},
        rulesetOrId: "test",
      };
      const actualResult = await manager.compareHierarchies(options);
      rpcRequestsHandlerMock.verify(async (x) => x.compareHierarchiesPaged(moq.It.isAny()), moq.Times.never());
      expect(actualResult).to.deep.eq([]);
    });

    it("returns empty result when comparison is canceled", async () => {
      const options: HierarchyCompareOptions<IModelConnection, NodeKey> = {
        imodel: testData.imodelMock.object,
        prev: {
          rulesetOrId: "test1",
        },
        rulesetOrId: "test2",
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.compareHierarchiesPaged(prepareOptions({ ...options, prev: { ...options.prev, rulesetVariables: options.prev.rulesetVariables?.map(RulesetVariable.toJSON) } })))
        .throws(new PresentationError(PresentationStatus.Canceled))
        .verifiable();
      const actualResult = await manager.compareHierarchies(options);
      rpcRequestsHandlerMock.verify(async (x) => x.compareHierarchiesPaged(moq.It.isAny()), moq.Times.once());
      expect(actualResult).to.deep.eq([]);
    });

    it("throws when request handler throws non-cancellation exception", async () => {
      const options: HierarchyCompareOptions<IModelConnection, NodeKey> = {
        imodel: testData.imodelMock.object,
        prev: {
          rulesetVariables: [],
        },
        rulesetOrId: "test",
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.compareHierarchiesPaged(prepareOptions({ ...options, prev: { ...options.prev, rulesetVariables: options.prev.rulesetVariables?.map(RulesetVariable.toJSON) } })))
        .throws(new PresentationError(PresentationStatus.Error))
        .verifiable();
      await expect(manager.compareHierarchies(options)).to.eventually.be.rejectedWith(PresentationError);
      rpcRequestsHandlerMock.verify(async (x) => x.compareHierarchiesPaged(moq.It.isAny()), moq.Times.once());
    });

    it("requests hierarchy comparison and returns result", async () => {
      const options: HierarchyCompareOptions<IModelConnection, NodeKey> = {
        imodel: testData.imodelMock.object,
        prev: {
          rulesetOrId: "test1",
          rulesetVariables: [],
        },
        rulesetOrId: "test",
        rulesetVariables: [],
        expandedNodeKeys: [createRandomBaseNodeKey()],
      };
      const compareInfo: HierarchyCompareInfoJSON = {
        changes: [
          {
            type: "Insert",
            position: 0,
            node: createRandomECInstancesNodeJSON(),
          },
        ],
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.compareHierarchiesPaged(prepareOptions({ ...options, expandedNodeKeys: options.expandedNodeKeys!.map(NodeKey.toJSON), prev: { ...options.prev, rulesetVariables: options.prev.rulesetVariables?.map(RulesetVariable.toJSON) } })))
        .returns(async () => compareInfo)
        .verifiable();
      const changes = await manager.compareHierarchies(options);
      rpcRequestsHandlerMock.verify(async (x) => x.compareHierarchiesPaged(moq.It.isAny()), moq.Times.once());
      expect(changes).to.be.deep.eq(compareInfo.changes.map(PartialHierarchyModification.fromJSON));
    });

    it("makes multiple requests until collects all results", async () => {
      const options: HierarchyCompareOptions<IModelConnection, NodeKey> = {
        imodel: testData.imodelMock.object,
        prev: {
          rulesetOrId: "test1",
          rulesetVariables: [],
        },
        rulesetOrId: "test",
        rulesetVariables: [],
        expandedNodeKeys: [createRandomBaseNodeKey()],
      };
      const compareInfo1: HierarchyCompareInfoJSON = {
        changes: [
          {
            type: "Insert",
            position: 0,
            node: createRandomECInstancesNodeJSON(),
          },
        ],
        continuationToken: {
          prevHierarchyNode: "prevNode",
          currHierarchyNode: "currNode",
        },
      };
      const compareInfo2: HierarchyCompareInfoJSON = {
        changes: [
          {
            type: "Insert",
            position: 1,
            node: createRandomECInstancesNodeJSON(),
          },
        ],
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.compareHierarchiesPaged(prepareOptions({ ...options, expandedNodeKeys: options.expandedNodeKeys!.map(NodeKey.toJSON), prev: { ...options.prev, rulesetVariables: options.prev.rulesetVariables?.map(RulesetVariable.toJSON) } })))
        .returns(async () => compareInfo1);
      rpcRequestsHandlerMock
        .setup(async (x) => x.compareHierarchiesPaged(prepareOptions({ ...options, expandedNodeKeys: options.expandedNodeKeys!.map(NodeKey.toJSON), prev: { ...options.prev, rulesetVariables: options.prev.rulesetVariables?.map(RulesetVariable.toJSON) }, continuationToken: compareInfo1.continuationToken })))
        .returns(async () => compareInfo2);
      const changes = await manager.compareHierarchies(options);
      rpcRequestsHandlerMock.verify(async (x) => x.compareHierarchiesPaged(moq.It.isAny()), moq.Times.exactly(2));
      expect(changes.length).to.be.eq(2);
      expect(changes).to.be.deep.eq([...compareInfo1.changes.map(PartialHierarchyModification.fromJSON), ...compareInfo2.changes.map(PartialHierarchyModification.fromJSON)]);
    });

    it("avoid infinitely requesting if continuation token returned with no changes", async () => {
      const options: HierarchyCompareOptions<IModelConnection, NodeKey> = {
        imodel: testData.imodelMock.object,
        prev: {
          rulesetOrId: "test1",
          rulesetVariables: [],
        },
        rulesetOrId: "test",
        rulesetVariables: [],
        expandedNodeKeys: [createRandomBaseNodeKey()],
      };
      const compareInfo1: HierarchyCompareInfoJSON = {
        changes: [
          {
            type: "Insert",
            position: 0,
            node: createRandomECInstancesNodeJSON(),
          },
        ],
        continuationToken: {
          prevHierarchyNode: "prevNode",
          currHierarchyNode: "currNode",
        },
      };
      const compareInfo2: HierarchyCompareInfoJSON = {
        changes: [],
        continuationToken: {
          prevHierarchyNode: "prevNode1",
          currHierarchyNode: "currNode1",
        },
      };
      rpcRequestsHandlerMock
        .setup(async (x) => x.compareHierarchiesPaged(prepareOptions({ ...options, expandedNodeKeys: options.expandedNodeKeys!.map(NodeKey.toJSON), prev: { ...options.prev, rulesetVariables: options.prev.rulesetVariables?.map(RulesetVariable.toJSON) } })))
        .returns(async () => compareInfo1);
      rpcRequestsHandlerMock
        .setup(async (x) => x.compareHierarchiesPaged(prepareOptions({ ...options, expandedNodeKeys: options.expandedNodeKeys!.map(NodeKey.toJSON), prev: { ...options.prev, rulesetVariables: options.prev.rulesetVariables?.map(RulesetVariable.toJSON) }, continuationToken: compareInfo1.continuationToken })))
        .returns(async () => compareInfo2);
      const changes = await manager.compareHierarchies(options);
      rpcRequestsHandlerMock.verify(async (x) => x.compareHierarchiesPaged(moq.It.isAny()), moq.Times.exactly(2));
      expect(changes.length).to.be.eq(0);
    });

  });

  describe("options handling", () => {

    let testRuleset: Ruleset;
    let testRulesetVariable: RulesetVariable;

    beforeEach(async () => {
      testRuleset = await createRandomRuleset();
      rulesetsManagerMock.setup(async (x) => x.get(testRuleset.id)).returns(async () => new RegisteredRuleset(testRuleset, "", () => { }));
      testRulesetVariable = { id: faker.random.word(), type: VariableValueTypes.String, value: faker.random.word() };
      await manager.vars(testRuleset.id).setString(testRulesetVariable.id, testRulesetVariable.value);
    });

    it("adds ruleset to the options", async () => {
      const options: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>> = {
        imodel: testData.imodelMock.object,
        paging: testData.pageOptions,
        rulesetOrId: testRuleset.id,
        parentKey: undefined,
      };
      const expectedOptions = { ...options, rulesetOrId: testRuleset, rulesetVariables: [testRulesetVariable] };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getNodesCount(prepareOptions(expectedOptions)))
        .returns(async () => 0)
        .verifiable();
      await manager.getNodesCount(options);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("leaves ruleset in the options if already provided", async () => {
      const options: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>> = {
        imodel: testData.imodelMock.object,
        rulesetOrId: testRuleset,
        paging: testData.pageOptions,
        parentKey: undefined,
      };

      const expectedOptions = { ...options, rulesetOrId: testRuleset, rulesetVariables: [testRulesetVariable] };

      rpcRequestsHandlerMock
        .setup(async (x) => x.getNodesCount(prepareOptions(expectedOptions)))
        .returns(async () => 0)
        .verifiable();
      await manager.getNodesCount(options);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("adds empty values if ruleset and rulesetId is not provided", async () => {
      const options: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>> = {
        imodel: testData.imodelMock.object,
        paging: testData.pageOptions,
        rulesetOrId: "",
        parentKey: undefined,
      };
      const expectedOptions = { ...options, rulesetVariables: [] };
      rpcRequestsHandlerMock
        .setup(async (x) => x.getNodesCount(toIModelTokenOptions(expectedOptions)))
        .returns(async () => 0)
        .verifiable();
      await manager.getNodesCount(options);
      rpcRequestsHandlerMock.verifyAll();
    });

    it("appends ruleset variables from ruleset variables manager", async () => {
      const rulesetVariable: RulesetVariable = { id: faker.random.word(), type: VariableValueTypes.String, value: faker.random.word() };
      const options: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey, RulesetVariable>> = {
        imodel: testData.imodelMock.object,
        paging: testData.pageOptions,
        rulesetOrId: testRuleset,
        rulesetVariables: [rulesetVariable],
        parentKey: undefined,
      };

      const expectedOptions = { ...options, rulesetOrId: testRuleset, rulesetVariables: [rulesetVariable, testRulesetVariable] };

      rpcRequestsHandlerMock
        .setup(async (x) => x.getNodesCount(prepareOptions(expectedOptions)))
        .returns(async () => 0)
        .verifiable();
      await manager.getNodesCount(options);
      rpcRequestsHandlerMock.verifyAll();
    });

  });

  describe("listening to updates", () => {

    let ipcAppAddListenerStub: sinon.SinonStub<[string, IpcListener], RemoveFunction>;
    let hierarchyUpdatesSpy: sinon.SinonSpy<[IModelHierarchyChangeEventArgs], void>;
    let contentUpdatesSpy: sinon.SinonSpy<[IModelContentChangeEventArgs], void>;

    beforeEach(() => {
      sinon.stub(IpcApp, "isValid").get(() => true);
      ipcAppAddListenerStub = sinon.stub(IpcApp, "addListener");

      manager = PresentationManager.create();

      expect(ipcAppAddListenerStub).to.be.calledOnce;

      hierarchyUpdatesSpy = sinon.spy() as any;
      manager.onIModelHierarchyChanged.addListener(hierarchyUpdatesSpy);

      contentUpdatesSpy = sinon.spy() as any;
      manager.onIModelContentChanged.addListener(contentUpdatesSpy);
    });

    it("triggers appropriate hierarchy and content events on update event", async () => {
      const imodelKey = "test-imodel-key";
      const ruleset1: Ruleset = { id: "1", rules: [] };
      const ruleset2: Ruleset = { id: "2", rules: [] };
      const ruleset3: Ruleset = { id: "3", rules: [] };
      const ruleset4: Ruleset = { id: "4", rules: [] };
      rulesetsManagerMock.setup(async (x) => x.get(ruleset1.id)).returns(async () => new RegisteredRuleset(ruleset1, "", () => { }));
      rulesetsManagerMock.setup(async (x) => x.get(ruleset2.id)).returns(async () => new RegisteredRuleset(ruleset2, "", () => { }));
      rulesetsManagerMock.setup(async (x) => x.get(ruleset3.id)).returns(async () => new RegisteredRuleset(ruleset3, "", () => { }));
      rulesetsManagerMock.setup(async (x) => x.get(ruleset4.id)).returns(async () => undefined);

      const report: UpdateInfo = {
        [imodelKey]: {
          [ruleset1.id]: {
            hierarchy: "FULL",
            content: "FULL",
          },
          [ruleset2.id]: {
            hierarchy: [],
          },
          [ruleset3.id]: {
            content: "FULL",
          },
          [ruleset4.id]: {},
        },
      };
      ipcAppAddListenerStub.firstCall.args[1](new Event(PresentationIpcEvents.Update), report);

      // workaround for a floating promise...
      await BeDuration.wait(1);

      expect(hierarchyUpdatesSpy).to.be.calledTwice;
      expect(hierarchyUpdatesSpy.firstCall).to.be.calledWith({
        rulesetId: ruleset1.id,
        updateInfo: "FULL",
        imodelKey,
      });
      expect(hierarchyUpdatesSpy.secondCall).to.be.calledWith({
        rulesetId: ruleset2.id,
        updateInfo: [],
        imodelKey,
      });

      expect(contentUpdatesSpy).to.be.calledTwice;
      expect(contentUpdatesSpy.firstCall).to.be.calledWith({
        rulesetId: ruleset1.id,
        updateInfo: "FULL",
        imodelKey,
      });
      expect(contentUpdatesSpy.secondCall).to.be.calledWith({
        rulesetId: ruleset3.id,
        updateInfo: "FULL",
        imodelKey,
      });
    });

  });

  describe("buildPagedResponse", () => {

    it("calls getter once with 0,0 partial page options when given `undefined` page options", async () => {
      const getter = sinon.stub().resolves({ total: 0, items: [] });
      await buildPagedResponse(undefined, getter);
      expect(getter).to.be.calledOnceWith({ start: 0, size: 0 });
    });

    it("calls getter once with 0,0 partial page options when given empty page options", async () => {
      const getter = sinon.stub().resolves({ total: 0, items: [] });
      await buildPagedResponse({}, getter);
      expect(getter).to.be.calledOnceWith({ start: 0, size: 0 });
    });

    it("calls getter once with partial page options equal to given page options", async () => {
      const getter = sinon.stub().resolves({ total: 0, items: [] });
      await buildPagedResponse({ start: 1, size: 2 }, getter);
      expect(getter).to.be.calledOnceWith({ start: 1, size: 2 });
    });

    it("calls getter multiple times until the whole requested page is received when requesting a page of specified size", async () => {
      const getter = sinon.stub();
      getter.onFirstCall().resolves({ total: 5, items: [2] });
      getter.onSecondCall().resolves({ total: 5, items: [3] });
      getter.onThirdCall().resolves({ total: 5, items: [4] });
      const result = await buildPagedResponse({ start: 1, size: 3 }, getter);
      expect(getter).to.be.calledThrice;
      expect(getter.firstCall).to.be.calledWith({ start: 1, size: 3 });
      expect(getter.secondCall).to.be.calledWith({ start: 2, size: 2 });
      expect(getter.thirdCall).to.be.calledWith({ start: 3, size: 1 });
      expect(result).to.deep.eq({ total: 5, items: [2, 3, 4] });
    });

    it("calls getter multiple times until the whole requested page is received when requesting a page of unspecified size", async () => {
      const getter = sinon.stub();
      getter.onFirstCall().resolves({ total: 5, items: [2, 3] });
      getter.onSecondCall().resolves({ total: 5, items: [4, 5] });
      const result = await buildPagedResponse({ start: 1 }, getter);
      expect(getter).to.be.calledTwice;
      expect(getter.firstCall).to.be.calledWith({ start: 1, size: 0 });
      expect(getter.secondCall).to.be.calledWith({ start: 3, size: 0 });
      expect(result).to.deep.eq({ total: 5, items: [2, 3, 4, 5] });
    });

    it("logs a warning when page start index is larger than total number of items", async () => {
      const loggerSpy = sinon.spy(Logger, "logWarning");
      const getter = sinon.stub();
      getter.resolves({ total: 5, items: [] });
      const result = await buildPagedResponse({ start: 9 }, getter);
      expect(getter).to.be.calledOnce;
      expect(getter).to.be.calledWith({ start: 9, size: 0 });
      expect(result).to.deep.eq({ total: 0, items: [] });
      expect(loggerSpy).to.be.calledOnce;
    });

    it("logs an error when partial request returns no items", async () => {
      const loggerSpy = sinon.spy(Logger, "logError");
      const getter = sinon.stub();
      getter.resolves({ total: 5, items: [] });
      const result = await buildPagedResponse({ start: 1 }, getter);
      expect(getter).to.be.calledOnce;
      expect(getter).to.be.calledWith({ start: 1, size: 0 });
      expect(result).to.deep.eq({ total: 0, items: [] });
      expect(loggerSpy).to.be.calledOnce;
    });

  });

});
