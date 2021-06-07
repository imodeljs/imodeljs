/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* eslint-disable deprecation/deprecation */
import { expect } from "chai";
import * as faker from "faker";
import * as sinon from "sinon";
import { Id64String, using } from "@bentley/bentleyjs-core";
import { IModelRpcProps, RpcOperation, RpcRegistry, RpcRequest, RpcSerializedValue } from "@bentley/imodeljs-common";
import {
  ContentDescriptorRpcRequestOptions, ContentRpcRequestOptions, DisplayLabelRpcRequestOptions, DisplayLabelsRpcRequestOptions,
  DistinctValuesRpcRequestOptions, ExtendedContentRpcRequestOptions, ExtendedHierarchyRpcRequestOptions, HierarchyCompareRpcOptions,
  HierarchyRpcRequestOptions, KeySet, LabelRpcRequestOptions, Paged, PresentationRpcInterface, SelectionScopeRpcRequestOptions,
} from "../presentation-common";
import { FieldDescriptorType } from "../presentation-common/content/Fields";
import {
  createRandomDescriptorJSON, createRandomECInstanceKey, createRandomECInstancesNodeKey, createRandomECInstancesNodeKeyJSON,
} from "./_helpers/random";

describe("PresentationRpcInterface", () => {
  class TestRpcRequest extends RpcRequest {
    protected async send(): Promise<number> { throw new Error("Not implemented."); }
    protected async load(): Promise<RpcSerializedValue> { throw new Error("Not implemented."); }
    protected setHeader(_name: string, _value: string): void { throw new Error("Not implemented."); }
  }

  it("finds imodel tokens in RPC requests", () => {
    const token: IModelRpcProps = { key: "test", iModelId: "test", contextId: "test" };
    const parameters = [
      token,
      { rulesetOrId: faker.random.word() },
    ];
    RpcRegistry.instance.initializeRpcInterface(PresentationRpcInterface);
    const client = RpcRegistry.instance.getClientForInterface(PresentationRpcInterface);
    const operation = RpcOperation.lookup(PresentationRpcInterface, "getNodesCount");
    const disposableRequest = {
      request: new TestRpcRequest(client, "getNodesCount", parameters),
      dispose: () => {
        // no way to properly destroy the created request...
        (disposableRequest.request as any).dispose();
      },
    };
    using(disposableRequest, (dr) => {
      const result = operation.policy.token(dr.request);
      expect(result).to.eq(token);
    });
    RpcRegistry.instance.terminateRpcInterface(PresentationRpcInterface);
  });

  function toArguments(..._arguments: any[]) { return arguments; }

  describe("calls forwarding", () => {

    let rpcInterface: PresentationRpcInterface;
    let spy: sinon.SinonSpy<[IArguments], Promise<any>>;
    const token: IModelRpcProps = { key: "test", iModelId: "test", contextId: "test" };

    beforeEach(() => {
      rpcInterface = new PresentationRpcInterface();
      spy = sinon.stub(rpcInterface, "forward");
    });

    it("[deprecated] forwards getNodesAndCount call", async () => {
      const options: Paged<HierarchyRpcRequestOptions> = {
        rulesetOrId: faker.random.word(),
      };
      await rpcInterface.getNodesAndCount(token, options); // eslint-disable-line deprecation/deprecation
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("[deprecated] forwards getNodes call for root nodes", async () => {
      const options: Paged<HierarchyRpcRequestOptions> = {
        rulesetOrId: faker.random.word(),
      };
      await rpcInterface.getNodes(token, options); // eslint-disable-line deprecation/deprecation
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("[deprecated] forwards getNodes call for child nodes", async () => {
      const options: Paged<HierarchyRpcRequestOptions> = {
        rulesetOrId: faker.random.word(),
      };
      const parentKey = createRandomECInstancesNodeKey();
      await rpcInterface.getNodes(token, options, parentKey); // eslint-disable-line deprecation/deprecation
      expect(spy).to.be.calledOnceWith(toArguments(token, options, parentKey));
    });

    it("[deprecated] forwards getNodesCount call for root nodes", async () => {
      const options: HierarchyRpcRequestOptions = {
        rulesetOrId: faker.random.word(),
      };
      await rpcInterface.getNodesCount(token, options); // eslint-disable-line deprecation/deprecation
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("forwards getNodesCount call for root nodes", async () => {
      const options: ExtendedHierarchyRpcRequestOptions = {
        rulesetOrId: faker.random.word(),
      };
      await rpcInterface.getNodesCount(token, options);
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("[deprecated] forwards getNodesCount call for child nodes", async () => {
      const options: HierarchyRpcRequestOptions = {
        rulesetOrId: faker.random.word(),
      };
      const parentKey = createRandomECInstancesNodeKey();
      await rpcInterface.getNodesCount(token, options, parentKey); // eslint-disable-line deprecation/deprecation
      expect(spy).to.be.calledOnceWith(toArguments(token, options, parentKey));
    });

    it("forwards getNodesCount call for child nodes", async () => {
      const options: ExtendedHierarchyRpcRequestOptions = {
        rulesetOrId: faker.random.word(),
        parentKey: createRandomECInstancesNodeKey(),
      };
      await rpcInterface.getNodesCount(token, options);
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("forwards getPagedNodes call", async () => {
      const options: Paged<ExtendedHierarchyRpcRequestOptions> = {
        rulesetOrId: faker.random.word(),
        parentKey: createRandomECInstancesNodeKeyJSON(),
      };
      await rpcInterface.getPagedNodes(token, options);
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("forwards getFilteredNodePaths call", async () => {
      const options: ExtendedHierarchyRpcRequestOptions = {
        rulesetOrId: faker.random.word(),
      };
      await rpcInterface.getFilteredNodePaths(token, options, "filter");
      expect(spy).to.be.calledOnceWith(toArguments(token, options, "filter"));
    });

    it("forwards getNodePaths call", async () => {
      const options: ExtendedHierarchyRpcRequestOptions = {
        rulesetOrId: faker.random.word(),
      };
      const keys = [[createRandomECInstanceKey(), createRandomECInstanceKey()]];
      await rpcInterface.getNodePaths(token, options, keys, 1);
      expect(spy).to.be.calledOnceWith(toArguments(token, options, keys, 1));
    });

    it("[deprecated] forwards getContentDescriptor call", async () => {
      const options: ContentRpcRequestOptions = {
        rulesetOrId: faker.random.word(),
      };
      const keys = new KeySet().toJSON();
      await rpcInterface.getContentDescriptor(token, options, "test", keys, undefined); // eslint-disable-line deprecation/deprecation
      expect(spy).to.be.calledOnceWith(toArguments(token, options, "test", keys, undefined));
    });

    it("forwards getContentDescriptor call", async () => {
      const options: ContentDescriptorRpcRequestOptions = {
        rulesetOrId: faker.random.word(),
        displayType: "test",
        keys: new KeySet().toJSON(),
      };
      await rpcInterface.getContentDescriptor(token, options);
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("[deprecated] forwards getContentSetSize call", async () => {
      const options: ContentRpcRequestOptions = {
        rulesetOrId: faker.random.word(),
      };
      const descriptor = createRandomDescriptorJSON();
      const keys = new KeySet().toJSON();
      await rpcInterface.getContentSetSize(token, options, descriptor, keys); // eslint-disable-line deprecation/deprecation
      expect(spy).to.be.calledOnceWith(toArguments(token, options, descriptor, keys));
    });

    it("forwards getContentSetSize call", async () => {
      const options: ExtendedContentRpcRequestOptions = {
        rulesetOrId: faker.random.word(),
        descriptor: createRandomDescriptorJSON(),
        keys: new KeySet().toJSON(),
      };
      await rpcInterface.getContentSetSize(token, options);
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("[deprecated] forwards getContent call", async () => {
      const options: Paged<ContentRpcRequestOptions> = {
        rulesetOrId: faker.random.word(),
      };
      const descriptor = createRandomDescriptorJSON();
      const keys = new KeySet().toJSON();
      await rpcInterface.getContent(token, options, descriptor, keys); // eslint-disable-line deprecation/deprecation
      expect(spy).to.be.calledOnceWith(toArguments(token, options, descriptor, keys));
    });

    it("[deprecated] forwards getContentAndSize call", async () => {
      const options: Paged<ContentRpcRequestOptions> = {
        rulesetOrId: faker.random.word(),
      };
      const descriptor = createRandomDescriptorJSON();
      const keys = new KeySet().toJSON();
      await rpcInterface.getContentAndSize(token, options, descriptor, keys); // eslint-disable-line deprecation/deprecation
      expect(spy).to.be.calledOnceWith(toArguments(token, options, descriptor, keys));
    });

    it("forwards getPagedContent call", async () => {
      const options: Paged<ExtendedContentRpcRequestOptions> = {
        rulesetOrId: faker.random.word(),
        descriptor: createRandomDescriptorJSON(),
        keys: new KeySet().toJSON(),
      };
      await rpcInterface.getPagedContent(token, options);
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("forwards getPagedContentSet call", async () => {
      const options: Paged<ExtendedContentRpcRequestOptions> = {
        rulesetOrId: faker.random.word(),
        descriptor: createRandomDescriptorJSON(),
        keys: new KeySet().toJSON(),
      };
      await rpcInterface.getPagedContentSet(token, options);
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("forwards getDistinctValues call", async () => {
      const options: ContentRpcRequestOptions = {
        rulesetOrId: faker.random.word(),
      };
      const descriptor = createRandomDescriptorJSON();
      const fieldName = faker.random.word();
      const maximumValueCount = faker.random.number();
      const keys = new KeySet().toJSON();
      await rpcInterface.getDistinctValues(token, options, descriptor, keys, fieldName, maximumValueCount);
      expect(spy).to.be.calledOnceWith(toArguments(token, options, descriptor, keys, fieldName, maximumValueCount));
    });

    it("forwards getPagedDistinctValues call", async () => {
      const options: DistinctValuesRpcRequestOptions = {
        rulesetOrId: faker.random.word(),
        descriptor: createRandomDescriptorJSON(),
        fieldDescriptor: {
          type: FieldDescriptorType.Name,
          fieldName: "test",
        },
        keys: new KeySet().toJSON(),
      };
      await rpcInterface.getPagedDistinctValues(token, options);
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("[deprecated] forwards getDisplayLabelDefinition call", async () => {
      const key = createRandomECInstanceKey();
      const options: LabelRpcRequestOptions = {
      };
      await rpcInterface.getDisplayLabelDefinition(token, options, key); // eslint-disable-line deprecation/deprecation
      expect(spy).to.be.calledOnceWith(toArguments(token, options, key));
    });

    it("forwards getDisplayLabelDefinition call", async () => {
      const options: DisplayLabelRpcRequestOptions = {
        key: createRandomECInstanceKey(),
      };
      await rpcInterface.getDisplayLabelDefinition(token, options);
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("[deprecated] forwards getDisplayLabelDefinitions call", async () => {
      const keys = [createRandomECInstanceKey(), createRandomECInstanceKey()];
      const options: LabelRpcRequestOptions = {
      };
      await rpcInterface.getDisplayLabelDefinitions(token, options, keys); // eslint-disable-line deprecation/deprecation
      expect(spy).to.be.calledOnceWith(toArguments(token, options, keys));
    });

    it("forwards getPagedDisplayLabelDefinitions call", async () => {
      const options: DisplayLabelsRpcRequestOptions = {
        keys: [createRandomECInstanceKey(), createRandomECInstanceKey()],
      };
      await rpcInterface.getPagedDisplayLabelDefinitions(token, options);
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("forwards getSelectionScopes call", async () => {
      const options: SelectionScopeRpcRequestOptions = {
      };
      await rpcInterface.getSelectionScopes(token, options);
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("forwards computeSelection call", async () => {
      const options: SelectionScopeRpcRequestOptions = {
      };
      const ids = new Array<Id64String>();
      const scopeId = faker.random.uuid();
      await rpcInterface.computeSelection(token, options, ids, scopeId);
      expect(spy).to.be.calledOnceWith(toArguments(token, options, ids, scopeId));
    });

    it("[deprecated] forwards compareHierarchies call", async () => {
      const options: HierarchyCompareRpcOptions = {
        prev: {
          rulesetOrId: "test1",
        },
        rulesetOrId: "test2",
        expandedNodeKeys: [],
      };
      await rpcInterface.compareHierarchies(token, options); // eslint-disable-line deprecation/deprecation
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

    it("forwards compareHierarchiesPaged call", async () => {
      const options: HierarchyCompareRpcOptions = {
        prev: {
          rulesetOrId: "test1",
        },
        rulesetOrId: "test2",
        expandedNodeKeys: [],
        resultSetSize: 10,
      };
      await rpcInterface.compareHierarchiesPaged(token, options);
      expect(spy).to.be.calledOnceWith(toArguments(token, options));
    });

  });

});
