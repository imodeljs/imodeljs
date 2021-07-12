/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* eslint-disable deprecation/deprecation */
import { expect } from "chai";
import * as faker from "faker";
import * as sinon from "sinon";
import { ClientRequestContext, CompressedId64Set, Id64String } from "@bentley/bentleyjs-core";
import { IModelDb } from "@bentley/imodeljs-backend";
import { IModelNotFoundResponse, IModelRpcProps } from "@bentley/imodeljs-common";
import {
  ContentDescriptorRequestOptions, ContentDescriptorRpcRequestOptions, ContentRequestOptions, ContentRpcRequestOptions, Descriptor, DescriptorJSON,
  DescriptorOverrides, DiagnosticsScopeLogs, DisplayLabelRequestOptions, DisplayLabelRpcRequestOptions, DisplayLabelsRequestOptions,
  DisplayLabelsRpcRequestOptions, DistinctValuesRequestOptions, ElementProperties, ElementPropertiesRequestOptions,
  ElementPropertiesRpcRequestOptions, ExtendedContentRequestOptions, ExtendedContentRpcRequestOptions, ExtendedHierarchyRequestOptions,
  ExtendedHierarchyRpcRequestOptions, FieldDescriptor, FieldDescriptorType, HierarchyCompareInfo, HierarchyCompareOptions, HierarchyCompareRpcOptions,
  HierarchyRequestOptions, HierarchyRpcRequestOptions, InstanceKey, Item, KeySet, KeySetJSON, Node, NodeKey, NodePathElement, Paged, PageOptions,
  PresentationError, PresentationRpcRequestOptions, PresentationStatus, RulesetVariable, RulesetVariableJSON, SelectionScopeRequestOptions,
  VariableValueTypes,
} from "@bentley/presentation-common";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import { ResolvablePromise } from "@bentley/presentation-common/lib/test/_helpers/Promises";
import {
  createRandomContent, createRandomDescriptor, createRandomECInstanceKey, createRandomECInstancesNode, createRandomECInstancesNodeKey,
  createRandomECInstancesNodeKeyJSON, createRandomId, createRandomLabelDefinitionJSON, createRandomNodePathElement, createRandomSelectionScope,
} from "@bentley/presentation-common/lib/test/_helpers/random";
import { Presentation } from "../presentation-backend/Presentation";
import { PresentationManager } from "../presentation-backend/PresentationManager";
import { MAX_ALLOWED_PAGE_SIZE, PresentationRpcImpl } from "../presentation-backend/PresentationRpcImpl";
import { RulesetManager } from "../presentation-backend/RulesetManager";
import { RulesetVariablesManager } from "../presentation-backend/RulesetVariablesManager";
import { WithClientRequestContext } from "../presentation-backend/Utils";

describe("PresentationRpcImpl", () => {

  afterEach(() => {
    Presentation.terminate();
  });

  it("uses default PresentationManager implementation if not overridden", () => {
    Presentation.initialize();
    const impl = new PresentationRpcImpl();
    expect(impl.getManager()).is.instanceof(PresentationManager);
  });

  it("uses default requestWaitTime from the Presentation implementation if it is not overriden", () => {
    Presentation.initialize();
    const impl = new PresentationRpcImpl();
    expect(impl.requestTimeout).to.equal(90000);
  });

  it("uses custom requestTimeout from the Presentation implementation if it is passed through Presentation.initialize", () => {
    const randomRequestTimeout = faker.random.number({ min: 0, max: 90000 });
    Presentation.initialize({ requestTimeout: randomRequestTimeout });
    const impl = new PresentationRpcImpl();
    expect(impl.requestTimeout).to.not.throw;
    expect(impl.requestTimeout).to.equal(randomRequestTimeout);
  });

  describe("calls forwarding", () => {

    let testData: any;
    let defaultRpcParams: { clientId: string };
    let impl: PresentationRpcImpl;
    let stub_IModelDb_findByKey: sinon.SinonStub<[string], IModelDb>; // eslint-disable-line @typescript-eslint/naming-convention
    const presentationManagerMock = moq.Mock.ofType<PresentationManager>();
    const rulesetsMock = moq.Mock.ofType<RulesetManager>();
    const variablesMock = moq.Mock.ofType<RulesetVariablesManager>();

    beforeEach(() => {
      rulesetsMock.reset();
      variablesMock.reset();
      presentationManagerMock.reset();
      presentationManagerMock.setup((x) => x.vars(moq.It.isAnyString())).returns(() => variablesMock.object);
      presentationManagerMock.setup((x) => x.rulesets()).returns(() => rulesetsMock.object);
      Presentation.initialize({
        requestTimeout: 10,
        clientManagerFactory: () => presentationManagerMock.object,
      });
      testData = {
        imodelToken: moq.Mock.ofType<IModelRpcProps>().object,
        imodelMock: moq.Mock.ofType<IModelDb>(),
        rulesetOrId: faker.random.word(),
        pageOptions: { start: 123, size: 45 } as PageOptions,
        displayType: "sample display type",
      };
      defaultRpcParams = { clientId: faker.random.uuid() };
      stub_IModelDb_findByKey = sinon.stub(IModelDb, "findByKey").returns(testData.imodelMock.object);
      impl = new PresentationRpcImpl();
      const requestContext = new ClientRequestContext();
      requestContext.enter();
    });

    it("returns invalid argument status code when using invalid imodel token", async () => {
      stub_IModelDb_findByKey.resetBehavior();
      stub_IModelDb_findByKey.throws(IModelNotFoundResponse);
      const options: Paged<HierarchyRpcRequestOptions> = {
        ...defaultRpcParams,
        rulesetOrId: testData.rulesetOrId,
      };

      const response = await impl.getNodes(testData.imodelToken, options);
      expect(response.statusCode).to.equal(PresentationStatus.InvalidArgument);
    });

    describe("makeRequest", () => {

      // note: all RPC methods go through `makeRequest` that takes care of timeouts and throws - test that here
      // using `getNodesCount` request

      it("should return `PresentationStatus.BackendTimeout` without any result if manager request takes more than requestTimeout", async () => {
        const rpcOptions: HierarchyRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: WithClientRequestContext<WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          parentKey: undefined,
        };
        const result = new ResolvablePromise<number>();
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getNodesCount(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.be.undefined;
        expect(actualResult.statusCode).to.equal(PresentationStatus.BackendTimeout);
        await result.resolve(999);
      });

      it("should return result if `PresentationStatus.BackendTimeout` is set to 0", async () => {
        Presentation.terminate();
        Presentation.initialize({
          requestTimeout: 0,
          clientManagerFactory: () => presentationManagerMock.object,
        });
        const rpcOptions: HierarchyRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          parentKey: undefined,
        };
        const result = new ResolvablePromise<number>();
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResultPromise = impl.getNodesCount(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();

        await result.resolve(999);

        const actualResult = await actualResultPromise;
        expect(actualResult.result).to.eq(999);
      });

      it("should forward ruleset variables to manager", async () => {
        const rpcOptions: ExtendedHierarchyRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          rulesetVariables: [{ id: "test", type: VariableValueTypes.Int, value: 123 }],
        };
        const managerOptions: WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          parentKey: undefined,
          rulesetVariables: rpcOptions.rulesetVariables as RulesetVariable[],
        };
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => 999)
          .verifiable();
        await impl.getNodesCount(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
      });

      it("should forward diagnostics options to manager and return diagnostics with results", async () => {
        const rpcOptions: HierarchyRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          diagnostics: {
            perf: true,
          },
        };

        const managerOptions: WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          parentKey: undefined,
          diagnostics: {
            perf: true,
          } as any,
        };
        const diagnosticsResult: DiagnosticsScopeLogs[] = [{ scope: "test" }];
        presentationManagerMock.setup(async (x) => x.getNodesCount(moq.It.is((actualManagerOptions) => sinon.match(managerOptions).test(actualManagerOptions))))
          .callback((options) => { options.diagnostics.handler(diagnosticsResult); })
          .returns(async () => 999)
          .verifiable();
        const actualResult = await impl.getNodesCount(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult).to.deep.eq({
          statusCode: PresentationStatus.Success,
          result: 999,
          diagnostics: diagnosticsResult,
        });
      });

      it("should return error result if manager throws", async () => {
        const rpcOptions: HierarchyRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          parentKey: undefined,
        };
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => {
            throw new PresentationError(PresentationStatus.Error, "test error");
          })
          .verifiable();
        const actualResult = await impl.getNodesCount(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.statusCode).to.eq(PresentationStatus.Error);
        expect(actualResult.errorMessage).to.eq("test error");
      });

      it("should return error result if manager throws and `PresentationStatus.BackendTimeout` is set to 0", async () => {
        Presentation.terminate();
        Presentation.initialize({
          requestTimeout: 0,
          clientManagerFactory: () => presentationManagerMock.object,
        });
        const rpcOptions: HierarchyRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          parentKey: undefined,
        };
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => {
            throw new PresentationError(PresentationStatus.Error, "test error");
          })
          .verifiable();
        const actualResult = await impl.getNodesCount(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.statusCode).to.eq(PresentationStatus.Error);
        expect(actualResult.errorMessage).to.eq("test error");
      });

    });

    describe("[deprecated] getNodesAndCount", () => {

      it("calls manager for root nodes", async () => {
        const getRootNodesResult: Node[] = [createRandomECInstancesNode(), createRandomECInstancesNode(), createRandomECInstancesNode()];
        const getRootNodesCountResult = 999;
        const rpcOptions: Paged<HierarchyRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
        };
        const managerOptions: Paged<WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          parentKey: undefined,
        };

        presentationManagerMock.setup(async (x) => x.getNodes(managerOptions))
          .returns(async () => getRootNodesResult)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => getRootNodesCountResult)
          .verifiable();
        const actualResult = await impl.getNodesAndCount(testData.imodelToken, rpcOptions);

        presentationManagerMock.verifyAll();
        expect(actualResult.result!.nodes).to.deep.eq(getRootNodesResult.map(Node.toJSON));
        expect(actualResult.result!.count).to.eq(getRootNodesCountResult);
      });

      it("calls manager for child nodes", async () => {
        const getChildNodesResult: Node[] = [createRandomECInstancesNode(), createRandomECInstancesNode(), createRandomECInstancesNode()];
        const getChildNodesCountResult = 999;
        const parentNodeKey = createRandomECInstancesNodeKey();
        const rpcOptions: Paged<HierarchyRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
        };
        const managerOptions: Paged<WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          parentKey: parentNodeKey,
        };

        presentationManagerMock.setup(async (x) => x.getNodes(managerOptions))
          .returns(async () => getChildNodesResult)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => getChildNodesCountResult)
          .verifiable();
        const actualResult = await impl.getNodesAndCount(testData.imodelToken, rpcOptions, NodeKey.toJSON(parentNodeKey));

        presentationManagerMock.verifyAll();
        expect(actualResult.result!.nodes).to.deep.eq(getChildNodesResult.map(Node.toJSON));
        expect(actualResult.result!.count).to.eq(getChildNodesCountResult);
      });

    });

    describe("[deprecated] getNodes", () => {

      it("calls manager for root nodes", async () => {
        const result: Node[] = [createRandomECInstancesNode(), createRandomECInstancesNode(), createRandomECInstancesNode()];
        const rpcOptions: Paged<HierarchyRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
        };
        const managerOptions: Paged<WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          parentKey: undefined,
        };
        presentationManagerMock.setup(async (x) => x.getNodes(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getNodes(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(result.map(Node.toJSON));
      });

      it("calls manager for child nodes", async () => {
        const result: Node[] = [createRandomECInstancesNode(), createRandomECInstancesNode(), createRandomECInstancesNode()];
        const parentNodeKey = createRandomECInstancesNodeKey();
        const rpcOptions: Paged<HierarchyRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
        };
        const managerOptions: Paged<WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          parentKey: parentNodeKey,
        };
        presentationManagerMock.setup(async (x) => x.getNodes(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getNodes(testData.imodelToken, rpcOptions, NodeKey.toJSON(parentNodeKey));
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(result.map(Node.toJSON));
      });

    });

    describe("getNodesCount", () => {

      it("[deprecated] calls manager for root nodes count", async () => {
        const result = 999;
        const rpcOptions: HierarchyRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          parentKey: undefined,
        };
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getNodesCount(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.eq(result);
      });

      it("[deprecated] calls manager for child nodes count", async () => {
        const result = 999;
        const parentNodeKey = createRandomECInstancesNodeKey();
        const rpcOptions: HierarchyRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          parentKey: parentNodeKey,
        };
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getNodesCount(testData.imodelToken, rpcOptions, NodeKey.toJSON(parentNodeKey));
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.eq(result);
      });

      it("calls manager for root nodes count", async () => {
        const result = 999;
        const rpcOptions: ExtendedHierarchyRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          parentKey: undefined,
        };
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getNodesCount(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.eq(result);
      });

      it("calls manager for child nodes count", async () => {
        const result = 999;
        const parentNodeKey = createRandomECInstancesNodeKey();
        const rpcOptions: ExtendedHierarchyRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          parentKey: NodeKey.toJSON(parentNodeKey),
        };
        const managerOptions: WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          parentKey: parentNodeKey,
        };
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getNodesCount(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.eq(result);
      });
    });

    describe("getPagedNodes", () => {

      it("calls manager for root nodes", async () => {
        const getRootNodesResult: Node[] = [createRandomECInstancesNode(), createRandomECInstancesNode(), createRandomECInstancesNode()];
        const getRootNodesCountResult = 999;
        const rpcOptions: Paged<ExtendedHierarchyRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
        };
        const managerOptions: Paged<WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          parentKey: undefined,
        };

        presentationManagerMock.setup(async (x) => x.getNodes(managerOptions))
          .returns(async () => getRootNodesResult)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => getRootNodesCountResult)
          .verifiable();
        const actualResult = await impl.getPagedNodes(testData.imodelToken, rpcOptions);

        presentationManagerMock.verifyAll();
        expect(actualResult.result!.items).to.deep.eq(getRootNodesResult.map(Node.toJSON));
        expect(actualResult.result!.total).to.eq(getRootNodesCountResult);
      });

      it("calls manager for child nodes", async () => {
        const getChildNodesResult: Node[] = [createRandomECInstancesNode(), createRandomECInstancesNode(), createRandomECInstancesNode()];
        const getChildNodesCountResult = 999;
        const parentNodeKey = createRandomECInstancesNodeKey();
        const rpcOptions: Paged<ExtendedHierarchyRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          parentKey: NodeKey.toJSON(parentNodeKey),
        };
        const managerOptions: Paged<WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          parentKey: parentNodeKey,
        };

        presentationManagerMock.setup(async (x) => x.getNodes(managerOptions))
          .returns(async () => getChildNodesResult)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => getChildNodesCountResult)
          .verifiable();
        const actualResult = await impl.getPagedNodes(testData.imodelToken, rpcOptions);

        presentationManagerMock.verifyAll();
        expect(actualResult.result!.items).to.deep.eq(getChildNodesResult.map(Node.toJSON));
        expect(actualResult.result!.total).to.eq(getChildNodesCountResult);
      });

      it("enforces maximum page size when requesting with larger size than allowed", async () => {
        const getRootNodesResult: Node[] = [];
        const getRootNodesCountResult = 9999;
        const rpcOptions: Paged<ExtendedHierarchyRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: { start: 0, size: 9999 },
        };
        const managerOptions: Paged<WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: { start: 0, size: MAX_ALLOWED_PAGE_SIZE },
          parentKey: undefined,
        };
        presentationManagerMock.setup(async (x) => x.getNodes(managerOptions))
          .returns(async () => getRootNodesResult)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => getRootNodesCountResult)
          .verifiable();
        await impl.getPagedNodes(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
      });

      it("enforces maximum page size when requesting with undefined size", async () => {
        const getRootNodesResult: Node[] = [];
        const getRootNodesCountResult = 9999;
        const rpcOptions: Paged<ExtendedHierarchyRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: { start: 0 },
        };
        const managerOptions: Paged<WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: { start: 0, size: MAX_ALLOWED_PAGE_SIZE },
          parentKey: undefined,
        };
        presentationManagerMock.setup(async (x) => x.getNodes(managerOptions))
          .returns(async () => getRootNodesResult)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => getRootNodesCountResult)
          .verifiable();
        await impl.getPagedNodes(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
      });

      it("enforces maximum page size when requesting with undefined page options", async () => {
        const getRootNodesResult: Node[] = [];
        const getRootNodesCountResult = 9999;
        const rpcOptions: Paged<ExtendedHierarchyRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: Paged<WithClientRequestContext<ExtendedHierarchyRequestOptions<IModelDb, NodeKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: { size: MAX_ALLOWED_PAGE_SIZE },
          parentKey: undefined,
        };
        presentationManagerMock.setup(async (x) => x.getNodes(managerOptions))
          .returns(async () => getRootNodesResult)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getNodesCount(managerOptions))
          .returns(async () => getRootNodesCountResult)
          .verifiable();
        await impl.getPagedNodes(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
      });

    });

    describe("getFilteredNodePaths", () => {

      it("calls manager", async () => {
        const result = [createRandomNodePathElement(0), createRandomNodePathElement(0)];
        const rpcOptions: PresentationRpcRequestOptions<HierarchyRequestOptions<never, RulesetVariableJSON>> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: WithClientRequestContext<HierarchyRequestOptions<IModelDb>> & { filterText: string } = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          filterText: "filter",
        };
        presentationManagerMock.setup(async (x) => x.getFilteredNodePaths(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getFilteredNodePaths(testData.imodelToken, rpcOptions, "filter");
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.equal(result.map(NodePathElement.toJSON));
      });

    });

    describe("getNodePaths", () => {

      it("calls manager", async () => {
        const result = [createRandomNodePathElement(0), createRandomNodePathElement(0)];
        const keyArray: InstanceKey[][] = [[createRandomECInstanceKey(), createRandomECInstanceKey()]];
        const rpcOptions: PresentationRpcRequestOptions<HierarchyRequestOptions<never, RulesetVariableJSON>> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: WithClientRequestContext<HierarchyRequestOptions<IModelDb>> & { paths: InstanceKey[][], markedIndex: number } = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paths: keyArray,
          markedIndex: 1,
        };
        presentationManagerMock.setup(async (x) => x.getNodePaths(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getNodePaths(testData.imodelToken, rpcOptions, keyArray.map((a) => a.map(InstanceKey.toJSON)), 1);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.equal(result.map(NodePathElement.toJSON));
      });

    });

    describe("loadHierarchy", () => {

      it("returns success status", async () => {
        const rpcOptions: PresentationRpcRequestOptions<HierarchyRequestOptions<never, RulesetVariableJSON>> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        // eslint-disable-next-line deprecation/deprecation
        const actualResult = await impl.loadHierarchy(testData.imodelToken, rpcOptions);
        expect(actualResult.statusCode).to.equal(PresentationStatus.Success);
      });

    });

    describe("getContentDescriptor", () => {

      it("[deprecated] calls manager", async () => {
        const keys = new KeySet();
        const descriptor = createRandomDescriptor();
        const rpcOptions: ContentRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: WithClientRequestContext<ContentDescriptorRequestOptions<IModelDb, KeySet>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          displayType: testData.displayType,
          keys,
          selection: undefined,
        };
        presentationManagerMock.setup(async (x) => x.getContentDescriptor(managerOptions))
          .returns(async () => descriptor)
          .verifiable();
        const actualResult = await impl.getContentDescriptor(testData.imodelToken, rpcOptions, testData.displayType, keys.toJSON(), undefined);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(descriptor.toJSON());
      });

      it("calls manager", async () => {
        const keys = new KeySet();
        const descriptor = createRandomDescriptor();
        const rpcOptions: ContentDescriptorRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          displayType: testData.displayType,
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<ContentDescriptorRequestOptions<IModelDb, KeySet>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          displayType: testData.displayType,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContentDescriptor(managerOptions))
          .returns(async () => descriptor)
          .verifiable();
        const actualResult = await impl.getContentDescriptor(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(descriptor.toJSON());
      });

      it("handles undefined descriptor response", async () => {
        const keys = new KeySet();
        const rpcOptions: ContentDescriptorRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          displayType: testData.displayType,
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<ContentDescriptorRequestOptions<IModelDb, KeySet>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          displayType: testData.displayType,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContentDescriptor(managerOptions))
          .returns(async () => undefined)
          .verifiable();
        const actualResult = await impl.getContentDescriptor(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.be.undefined;
      });

    });

    describe("[deprecated] getContentAndContentSize", () => {

      it("calls manager", async () => {
        const contentSize = 789;
        const keys = new KeySet();
        const content = createRandomContent();
        const rpcOptions: Paged<ContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          keys,
          descriptor: content.descriptor,
        };
        presentationManagerMock.setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => contentSize)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => content)
          .verifiable();
        const actualResult = await impl.getContentAndSize(testData.imodelToken, rpcOptions, content.descriptor.toJSON(), keys.toJSON());
        presentationManagerMock.verifyAll();
        expect(actualResult.result!.content).to.deep.eq(content.toJSON());
        expect(actualResult.result!.size).to.deep.eq(contentSize);
      });

      it("handles case when manager returns no content", async () => {
        const keys = new KeySet();
        const descriptorOverrides: DescriptorOverrides = {
          displayType: "",
          contentFlags: 0,
          hiddenFieldNames: [],
        };
        const rpcOptions: Paged<ContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          keys,
          descriptor: descriptorOverrides,
        };
        presentationManagerMock.setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => 0)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => undefined)
          .verifiable();
        const actualResult = await impl.getContentAndSize(testData.imodelToken, rpcOptions,
          descriptorOverrides, keys.toJSON());
        presentationManagerMock.verifyAll();
        expect(actualResult.result!.content).to.be.undefined;
        expect(actualResult.result!.size).to.eq(0);
      });

    });

    describe("getContentSetSize", () => {

      it("[deprecated] calls manager", async () => {
        const keys = new KeySet();
        const result = 789;
        const descriptor = createRandomDescriptor();
        const rpcOptions: ContentRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: WithClientRequestContext<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          descriptor,
          keys,
        };
        presentationManagerMock
          .setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getContentSetSize(testData.imodelToken, rpcOptions, descriptor.toJSON(), keys.toJSON());
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(result);
      });

      it("calls manager", async () => {
        const keys = new KeySet();
        const result = 789;
        const descriptor = createRandomDescriptor();
        const rpcOptions: ExtendedContentRpcRequestOptions = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          descriptor: descriptor.toJSON(),
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          descriptor,
          keys,
        };
        presentationManagerMock
          .setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getContentSetSize(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(result);
      });

    });

    describe("[deprecated] getContent", () => {

      it("calls manager", async () => {
        const keys = new KeySet();
        const content = createRandomContent();
        const rpcOptions: Paged<ContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor: content.descriptor,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => content)
          .verifiable();
        const actualResult = await impl.getContent(testData.imodelToken, rpcOptions, content.descriptor.toJSON(), keys.toJSON());
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(content.toJSON());
      });

      it("handles case when manager returns no content", async () => {
        const keys = new KeySet();
        const descriptorOverrides: DescriptorOverrides = {
          displayType: "",
          contentFlags: 0,
          hiddenFieldNames: [],
        };
        const rpcOptions: Paged<ContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor: descriptorOverrides,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => undefined)
          .verifiable();
        const actualResult = await impl.getContent(testData.imodelToken, rpcOptions, descriptorOverrides, keys.toJSON());
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.be.undefined;
      });

    });

    describe("getPagedContent", () => {

      it("calls manager", async () => {
        const keys = new KeySet();
        const contentItem = new Item([], "", "", undefined, {}, {}, [], undefined);
        const content = createRandomContent();
        content.contentSet.push(contentItem);
        const rpcOptions: Paged<ExtendedContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor: content.descriptor.toJSON(),
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor: content.descriptor,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => content)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => 999)
          .verifiable();
        const actualResult = await impl.getPagedContent(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq({
          descriptor: content.descriptor.toJSON(),
          contentSet: {
            total: 999,
            items: content.contentSet.map((i) => i.toJSON()),
          },
        });
      });

      it("handles case when manager returns no content", async () => {
        const keys = new KeySet();
        const descriptorOverrides: DescriptorOverrides = {
          displayType: "",
          contentFlags: 0,
          hiddenFieldNames: [],
        };
        const rpcOptions: Paged<ExtendedContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor: descriptorOverrides,
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor: descriptorOverrides,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => undefined)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => 0)
          .verifiable();
        const actualResult = await impl.getPagedContent(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.be.undefined;
      });

      it("enforces maximum page size when requesting with larger size than allowed", async () => {
        const keys = new KeySet();
        const contentItem = new Item([], "", "", undefined, {}, {}, [], undefined);
        const content = createRandomContent();
        content.contentSet.push(contentItem);
        const rpcOptions: Paged<ExtendedContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: { start: 0, size: MAX_ALLOWED_PAGE_SIZE + 1 },
          descriptor: content.descriptor.toJSON(),
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: { start: 0, size: MAX_ALLOWED_PAGE_SIZE },
          descriptor: content.descriptor,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => content)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => 9999)
          .verifiable();
        const actualResult = await impl.getPagedContent(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq({
          descriptor: content.descriptor.toJSON(),
          contentSet: {
            total: 9999,
            items: content.contentSet.map((i) => i.toJSON()),
          },
        });
      });

      it("enforces maximum page size when requesting with undefined size", async () => {
        const keys = new KeySet();
        const contentItem = new Item([], "", "", undefined, {}, {}, [], undefined);
        const content = createRandomContent();
        content.contentSet.push(contentItem);
        const rpcOptions: Paged<ExtendedContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: { start: 5 },
          descriptor: content.descriptor.toJSON(),
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: { start: 5, size: MAX_ALLOWED_PAGE_SIZE },
          descriptor: content.descriptor,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => content)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => 9999)
          .verifiable();
        const actualResult = await impl.getPagedContent(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq({
          descriptor: content.descriptor.toJSON(),
          contentSet: {
            total: 9999,
            items: content.contentSet.map((i) => i.toJSON()),
          },
        });
      });

      it("enforces maximum page size when requesting with undefined page options", async () => {
        const keys = new KeySet();
        const contentItem = new Item([], "", "", undefined, {}, {}, [], undefined);
        const content = createRandomContent();
        content.contentSet.push(contentItem);
        const rpcOptions: Paged<ExtendedContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: undefined,
          descriptor: content.descriptor.toJSON(),
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: { size: MAX_ALLOWED_PAGE_SIZE },
          descriptor: content.descriptor,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => content)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => 9999)
          .verifiable();
        const actualResult = await impl.getPagedContent(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq({
          descriptor: content.descriptor.toJSON(),
          contentSet: {
            total: 9999,
            items: content.contentSet.map((i) => i.toJSON()),
          },
        });
      });

    });

    describe("getPagedContentSet", () => {

      it("calls manager", async () => {
        const keys = new KeySet();
        const contentItem = new Item([], "", "", undefined, {}, {}, [], undefined);
        const content = createRandomContent();
        content.contentSet.push(contentItem);
        const rpcOptions: Paged<ExtendedContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor: content.descriptor.toJSON(),
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor: content.descriptor,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => content)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => 999)
          .verifiable();
        const actualResult = await impl.getPagedContentSet(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq({
          total: 999,
          items: content.contentSet.map((i) => i.toJSON()),
        });
      });

      it("handles case when manager returns no content", async () => {
        const keys = new KeySet();
        const descriptorOverrides: DescriptorOverrides = {
          displayType: "",
          contentFlags: 0,
          hiddenFieldNames: [],
        };
        const rpcOptions: Paged<ExtendedContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor: descriptorOverrides,
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: testData.pageOptions,
          descriptor: descriptorOverrides,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => undefined)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => 0)
          .verifiable();
        const actualResult = await impl.getPagedContentSet(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq({ total: 0, items: [] });
      });

      it("enforces maximum page size when requesting with larger size than allowed", async () => {
        const keys = new KeySet();
        const contentItem = new Item([], "", "", undefined, {}, {}, [], undefined);
        const content = createRandomContent();
        content.contentSet.push(contentItem);
        const rpcOptions: Paged<ExtendedContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: { start: 0, size: MAX_ALLOWED_PAGE_SIZE + 1 },
          descriptor: content.descriptor.toJSON(),
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: { start: 0, size: MAX_ALLOWED_PAGE_SIZE },
          descriptor: content.descriptor,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => content)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => 9999)
          .verifiable();
        const actualResult = await impl.getPagedContentSet(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq({
          total: 9999,
          items: content.contentSet.map((i) => i.toJSON()),
        });
      });

      it("enforces maximum page size when requesting with undefined size", async () => {
        const keys = new KeySet();
        const contentItem = new Item([], "", "", undefined, {}, {}, [], undefined);
        const content = createRandomContent();
        content.contentSet.push(contentItem);
        const rpcOptions: Paged<ExtendedContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: { start: 5 },
          descriptor: content.descriptor.toJSON(),
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: { start: 5, size: MAX_ALLOWED_PAGE_SIZE },
          descriptor: content.descriptor,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => content)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => 9999)
          .verifiable();
        const actualResult = await impl.getPagedContentSet(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq({
          total: 9999,
          items: content.contentSet.map((i) => i.toJSON()),
        });
      });

      it("enforces maximum page size when requesting with undefined page options", async () => {
        const keys = new KeySet();
        const contentItem = new Item([], "", "", undefined, {}, {}, [], undefined);
        const content = createRandomContent();
        content.contentSet.push(contentItem);
        const rpcOptions: Paged<ExtendedContentRpcRequestOptions> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
          paging: undefined,
          descriptor: content.descriptor.toJSON(),
          keys: keys.toJSON(),
        };
        const managerOptions: WithClientRequestContext<Paged<ExtendedContentRequestOptions<IModelDb, Descriptor, KeySet>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
          paging: { size: MAX_ALLOWED_PAGE_SIZE },
          descriptor: content.descriptor,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getContent(managerOptions))
          .returns(async () => content)
          .verifiable();
        presentationManagerMock.setup(async (x) => x.getContentSetSize(managerOptions))
          .returns(async () => 9999)
          .verifiable();
        const actualResult = await impl.getPagedContentSet(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq({
          total: 9999,
          items: content.contentSet.map((i) => i.toJSON()),
        });
      });

    });

    describe("getDistinctValues", () => {

      it("calls manager", async () => {
        const distinctValues = [faker.random.word(), faker.random.word()];
        const keys = new KeySet();
        const descriptor = createRandomDescriptor();
        const fieldName = faker.random.word();
        const maximumValueCount = faker.random.number();
        const rpcOptions: PresentationRpcRequestOptions<ContentRequestOptions<never, RulesetVariableJSON>> = {
          ...defaultRpcParams,
          rulesetOrId: testData.rulesetOrId,
        };
        const managerOptions: ContentRequestOptions<IModelDb> = {
          imodel: testData.imodelMock.object,
          rulesetOrId: testData.rulesetOrId,
        };
        presentationManagerMock.setup(async (x) => x.getDistinctValues(ClientRequestContext.current, managerOptions, descriptor, keys, fieldName, maximumValueCount))
          .returns(async () => distinctValues)
          .verifiable();
        const actualResult = await impl.getDistinctValues(testData.imodelToken, rpcOptions, descriptor.toJSON(),
          keys.toJSON(), fieldName, maximumValueCount);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(distinctValues);
      });

    });

    describe("getPagedDistinctValues", () => {

      it("calls manager", async () => {
        const distinctValues = {
          total: 1,
          items: [{
            displayValue: "test",
            groupedRawValues: ["test"],
          }],
        };
        const keys = new KeySet();
        const descriptor = createRandomDescriptor();
        const fieldDescriptor: FieldDescriptor = {
          type: FieldDescriptorType.Name,
          fieldName: "test",
        };
        const managerOptions: WithClientRequestContext<DistinctValuesRequestOptions<IModelDb, Descriptor, KeySet>> = {
          requestContext: ClientRequestContext.current,
          rulesetOrId: testData.rulesetOrId,
          imodel: testData.imodelMock.object,
          descriptor,
          fieldDescriptor,
          keys,
          paging: testData.pageOptions,
        };
        const rpcOptions: PresentationRpcRequestOptions<DistinctValuesRequestOptions<never, DescriptorJSON, KeySetJSON, RulesetVariableJSON>> = {
          ...defaultRpcParams,
          rulesetOrId: managerOptions.rulesetOrId,
          descriptor: descriptor.toJSON(),
          keys: keys.toJSON(),
          fieldDescriptor: managerOptions.fieldDescriptor,
          paging: testData.pageOptions,
        };
        presentationManagerMock.setup(async (x) => x.getPagedDistinctValues(managerOptions))
          .returns(async () => distinctValues)
          .verifiable();
        const actualResult = await impl.getPagedDistinctValues(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(distinctValues);
      });

      it("enforces maximum page size when requesting with larger size than allowed", async () => {
        const distinctValues = {
          total: 1,
          items: [{
            displayValue: "test",
            groupedRawValues: ["test"],
          }],
        };
        const keys = new KeySet();
        const descriptor = createRandomDescriptor();
        const fieldDescriptor: FieldDescriptor = {
          type: FieldDescriptorType.Name,
          fieldName: "test",
        };
        const managerOptions: WithClientRequestContext<DistinctValuesRequestOptions<IModelDb, Descriptor, KeySet>> = {
          requestContext: ClientRequestContext.current,
          rulesetOrId: testData.rulesetOrId,
          imodel: testData.imodelMock.object,
          descriptor,
          fieldDescriptor,
          keys,
          paging: { start: 0, size: MAX_ALLOWED_PAGE_SIZE },
        };
        const rpcOptions: PresentationRpcRequestOptions<DistinctValuesRequestOptions<never, DescriptorJSON, KeySetJSON, RulesetVariableJSON>> = {
          ...defaultRpcParams,
          rulesetOrId: managerOptions.rulesetOrId,
          descriptor: descriptor.toJSON(),
          keys: keys.toJSON(),
          fieldDescriptor: managerOptions.fieldDescriptor,
          paging: { start: 0, size: MAX_ALLOWED_PAGE_SIZE + 1 },
        };
        presentationManagerMock.setup(async (x) => x.getPagedDistinctValues(managerOptions))
          .returns(async () => distinctValues)
          .verifiable();
        const actualResult = await impl.getPagedDistinctValues(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(distinctValues);
      });

      it("enforces maximum page size when requesting with undefined size", async () => {
        const distinctValues = {
          total: 1,
          items: [{
            displayValue: "test",
            groupedRawValues: ["test"],
          }],
        };
        const keys = new KeySet();
        const descriptor = createRandomDescriptor();
        const fieldDescriptor: FieldDescriptor = {
          type: FieldDescriptorType.Name,
          fieldName: "test",
        };
        const managerOptions: WithClientRequestContext<DistinctValuesRequestOptions<IModelDb, Descriptor, KeySet>> = {
          requestContext: ClientRequestContext.current,
          rulesetOrId: testData.rulesetOrId,
          imodel: testData.imodelMock.object,
          descriptor,
          fieldDescriptor,
          keys,
          paging: { start: 5, size: MAX_ALLOWED_PAGE_SIZE },
        };
        const rpcOptions: PresentationRpcRequestOptions<DistinctValuesRequestOptions<never, DescriptorJSON, KeySetJSON, RulesetVariableJSON>> = {
          ...defaultRpcParams,
          rulesetOrId: managerOptions.rulesetOrId,
          descriptor: descriptor.toJSON(),
          keys: keys.toJSON(),
          fieldDescriptor: managerOptions.fieldDescriptor,
          paging: { start: 5 },
        };
        presentationManagerMock.setup(async (x) => x.getPagedDistinctValues(managerOptions))
          .returns(async () => distinctValues)
          .verifiable();
        const actualResult = await impl.getPagedDistinctValues(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(distinctValues);
      });

      it("enforces maximum page size when requesting with undefined page options", async () => {
        const distinctValues = {
          total: 1,
          items: [{
            displayValue: "test",
            groupedRawValues: ["test"],
          }],
        };
        const keys = new KeySet();
        const descriptor = createRandomDescriptor();
        const fieldDescriptor: FieldDescriptor = {
          type: FieldDescriptorType.Name,
          fieldName: "test",
        };
        const managerOptions: WithClientRequestContext<DistinctValuesRequestOptions<IModelDb, Descriptor, KeySet>> = {
          requestContext: ClientRequestContext.current,
          rulesetOrId: testData.rulesetOrId,
          imodel: testData.imodelMock.object,
          descriptor,
          fieldDescriptor,
          keys,
          paging: { size: MAX_ALLOWED_PAGE_SIZE },
        };
        const rpcOptions: PresentationRpcRequestOptions<DistinctValuesRequestOptions<never, DescriptorJSON, KeySetJSON, RulesetVariableJSON>> = {
          ...defaultRpcParams,
          rulesetOrId: managerOptions.rulesetOrId,
          descriptor: descriptor.toJSON(),
          keys: keys.toJSON(),
          fieldDescriptor: managerOptions.fieldDescriptor,
          paging: undefined,
        };
        presentationManagerMock.setup(async (x) => x.getPagedDistinctValues(managerOptions))
          .returns(async () => distinctValues)
          .verifiable();
        const actualResult = await impl.getPagedDistinctValues(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(distinctValues);
      });

    });

    describe("getElementProperties", () => {

      it("calls manager", async () => {
        const testElementProperties: ElementProperties = {
          class: "Test Class",
          id: "0x123",
          label: "test label",
          items: {
            ["Test Category"]: {
              type: "category",
              items: {
                ["Test Field"]: {
                  type: "primitive",
                  value: "test display value",
                },
              },
            },
          },
        };
        const managerOptions: WithClientRequestContext<ElementPropertiesRequestOptions<IModelDb>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          elementId: "0x123",
        };
        const managerResponse = testElementProperties;
        const rpcOptions: PresentationRpcRequestOptions<ElementPropertiesRpcRequestOptions> = {
          ...defaultRpcParams,
          elementId: "0x123",
        };
        const expectedRpcResponse = testElementProperties;
        presentationManagerMock
          .setup(async (x) => x.getElementProperties(managerOptions))
          .returns(async () => managerResponse)
          .verifiable();
        const actualResult = await impl.getElementProperties(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(expectedRpcResponse);
      });

    });

    describe("getDisplayLabelDefinition", () => {

      it("[deprecated] calls manager", async () => {
        const result = createRandomLabelDefinitionJSON();
        const key = createRandomECInstanceKey();
        presentationManagerMock.setup(async (x) => x.getDisplayLabelDefinition({ requestContext: ClientRequestContext.current, imodel: testData.imodelMock.object, key }))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getDisplayLabelDefinition(testData.imodelToken, { ...defaultRpcParams }, InstanceKey.toJSON(key));
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(result);
      });

      it("calls manager", async () => {
        const result = createRandomLabelDefinitionJSON();
        const key = createRandomECInstanceKey();
        const rpcOptions: Paged<DisplayLabelRpcRequestOptions> = {
          ...defaultRpcParams,
          paging: testData.pageOptions,
          key: InstanceKey.toJSON(key),
        };
        const managerOptions: WithClientRequestContext<Paged<DisplayLabelRequestOptions<IModelDb, InstanceKey>>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          paging: testData.pageOptions,
          key,
        };
        presentationManagerMock.setup(async (x) => x.getDisplayLabelDefinition(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getDisplayLabelDefinition(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(result);
      });

    });

    describe("[deprecated] getDisplayLabelDefinitions", () => {

      it("calls manager", async () => {
        const result = [createRandomLabelDefinitionJSON(), createRandomLabelDefinitionJSON()];
        const keys = [createRandomECInstanceKey(), createRandomECInstanceKey()];
        presentationManagerMock.setup(async (x) => x.getDisplayLabelDefinitions({ requestContext: ClientRequestContext.current, imodel: testData.imodelMock.object, keys }))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getDisplayLabelDefinitions(testData.imodelToken, { ...defaultRpcParams }, keys.map(InstanceKey.toJSON));
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(result);
      });

    });

    describe("getPagedDisplayLabelDefinitions", () => {

      it("calls manager", async () => {
        const result = [createRandomLabelDefinitionJSON(), createRandomLabelDefinitionJSON()];
        const keys = [createRandomECInstanceKey(), createRandomECInstanceKey()];
        const rpcOptions: DisplayLabelsRpcRequestOptions = {
          ...defaultRpcParams,
          keys: keys.map(InstanceKey.toJSON),
        };
        const managerOptions: WithClientRequestContext<DisplayLabelsRequestOptions<IModelDb, InstanceKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          keys,
        };
        presentationManagerMock.setup(async (x) => x.getDisplayLabelDefinitions(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getPagedDisplayLabelDefinitions(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq({ total: 2, items: result });
      });

      it("enforces maximum page size when requesting more labels than allowed", async () => {
        const result = (new Array(MAX_ALLOWED_PAGE_SIZE)).fill(createRandomLabelDefinitionJSON());
        const keys = (new Array(MAX_ALLOWED_PAGE_SIZE + 1)).fill(createRandomECInstanceKey());
        const rpcOptions: DisplayLabelsRpcRequestOptions = {
          ...defaultRpcParams,
          keys: keys.map(InstanceKey.toJSON),
        };
        const managerOptions: WithClientRequestContext<DisplayLabelsRequestOptions<IModelDb, InstanceKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          keys: keys.slice(0, MAX_ALLOWED_PAGE_SIZE),
        };
        presentationManagerMock.setup(async (x) => x.getDisplayLabelDefinitions(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getPagedDisplayLabelDefinitions(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq({ total: MAX_ALLOWED_PAGE_SIZE, items: result });
      });

    });

    describe("getSelectionScopes", () => {

      it("calls manager", async () => {
        const rpcOptions: PresentationRpcRequestOptions<SelectionScopeRequestOptions<never>> = {
          ...defaultRpcParams,
        };
        const managerOptions: WithClientRequestContext<SelectionScopeRequestOptions<IModelDb>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
        };
        const result = [createRandomSelectionScope()];
        presentationManagerMock.setup(async (x) => x.getSelectionScopes(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.getSelectionScopes(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(result);
      });

    });

    describe("computeSelection", () => {

      it("calls manager", async () => {
        const scope = createRandomSelectionScope();
        const ids = [createRandomId()];
        const rpcOptions: PresentationRpcRequestOptions<SelectionScopeRequestOptions<never>> = {
          ...defaultRpcParams,
        };
        const managerOptions: WithClientRequestContext<SelectionScopeRequestOptions<IModelDb> & { ids: Id64String[], scopeId: string }> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          ids,
          scopeId: scope.id,
        };
        const result = new KeySet();
        presentationManagerMock.setup(async (x) => x.computeSelection(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.computeSelection(testData.imodelToken, rpcOptions, ids, scope.id);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(result.toJSON());
      });

    });

    describe("[deprecated] compareHierarchies", () => {

      it("calls manager for comparison based on ruleset changes", async () => {
        const result: HierarchyCompareInfo = {
          changes: [{
            type: "Delete",
            target: createRandomECInstancesNode().key,
            parent: createRandomECInstancesNode().key,
            position: 123,
          }],
        };
        const rpcOptions: HierarchyCompareRpcOptions = {
          ...defaultRpcParams,
          prev: {
            rulesetOrId: "1",
          },
          rulesetOrId: "2",
        };
        const managerOptions: WithClientRequestContext<HierarchyCompareOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          prev: {
            rulesetOrId: rpcOptions.prev.rulesetOrId,
          },
          rulesetOrId: rpcOptions.rulesetOrId,
        };
        presentationManagerMock.setup(async (x) => x.compareHierarchies(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.compareHierarchies(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(HierarchyCompareInfo.toJSON(result).changes);
      });

      it("calls manager for comparison based on ruleset variables' changes", async () => {
        const result: HierarchyCompareInfo = {
          changes: [{
            type: "Delete",
            target: createRandomECInstancesNode().key,
            parent: createRandomECInstancesNode().key,
            position: 123,
          }],
        };
        const rpcOptions: HierarchyCompareRpcOptions = {
          ...defaultRpcParams,
          prev: {
            rulesetVariables: [{ id: "test", type: VariableValueTypes.Int, value: 123 }],
          },
          rulesetOrId: "2",
          expandedNodeKeys: [createRandomECInstancesNodeKeyJSON()],
        };
        const managerOptions: WithClientRequestContext<HierarchyCompareOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          prev: {
            ...rpcOptions.prev,
            rulesetVariables: rpcOptions.prev.rulesetVariables?.map(RulesetVariable.fromJSON),
          },
          rulesetOrId: rpcOptions.rulesetOrId,
          expandedNodeKeys: rpcOptions.expandedNodeKeys!.map(NodeKey.fromJSON),
        };
        presentationManagerMock.setup(async (x) => x.compareHierarchies(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.compareHierarchies(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(HierarchyCompareInfo.toJSON(result).changes);
      });

    });

    describe("compareHierarchiesPaged", () => {

      it("calls manager for comparison based on ruleset changes", async () => {
        const result: HierarchyCompareInfo = {
          changes: [{
            type: "Delete",
            target: createRandomECInstancesNode().key,
            parent: createRandomECInstancesNode().key,
            position: 123,
          }],
        };
        const rpcOptions: HierarchyCompareRpcOptions = {
          ...defaultRpcParams,
          prev: {
            rulesetOrId: "1",
          },
          rulesetOrId: "2",
          resultSetSize: 10,
        };
        const managerOptions: WithClientRequestContext<HierarchyCompareOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          prev: {
            rulesetOrId: rpcOptions.prev.rulesetOrId,
          },
          rulesetOrId: rpcOptions.rulesetOrId,
          resultSetSize: 10,
        };
        presentationManagerMock.setup(async (x) => x.compareHierarchies(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.compareHierarchiesPaged(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(HierarchyCompareInfo.toJSON(result));
      });

      it("calls manager for comparison based on ruleset variables' changes", async () => {
        const result: HierarchyCompareInfo = {
          changes: [{
            type: "Delete",
            target: createRandomECInstancesNode().key,
            parent: createRandomECInstancesNode().key,
            position: 123,
          }],
        };
        const rpcOptions: HierarchyCompareRpcOptions = {
          ...defaultRpcParams,
          prev: {
            rulesetVariables: [{ id: "test", type: VariableValueTypes.Id64Array, value: CompressedId64Set.compressArray(["0x123", "0x456"]) }],
          },
          rulesetOrId: "2",
          expandedNodeKeys: [createRandomECInstancesNodeKeyJSON()],
          resultSetSize: 10,
        };
        const managerOptions: WithClientRequestContext<HierarchyCompareOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          prev: {
            ...rpcOptions.prev,
            rulesetVariables: rpcOptions.prev.rulesetVariables?.map(RulesetVariable.fromJSON),
          },
          rulesetOrId: rpcOptions.rulesetOrId,
          expandedNodeKeys: rpcOptions.expandedNodeKeys!.map(NodeKey.fromJSON),
          resultSetSize: 10,
        };
        presentationManagerMock.setup(async (x) => x.compareHierarchies(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.compareHierarchiesPaged(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(HierarchyCompareInfo.toJSON(result));
      });

      it("enforces maximum result set size", async () => {
        const result: HierarchyCompareInfo = {
          changes: [{
            type: "Delete",
            target: createRandomECInstancesNode().key,
            parent: createRandomECInstancesNode().key,
            position: 123,
          }],
        };
        const rpcOptions: HierarchyCompareRpcOptions = {
          ...defaultRpcParams,
          prev: {
            rulesetVariables: [{ id: "test", type: VariableValueTypes.Int, value: 123 }],
          },
          rulesetOrId: "2",
          expandedNodeKeys: [createRandomECInstancesNodeKeyJSON()],
        };
        const managerOptions: WithClientRequestContext<HierarchyCompareOptions<IModelDb, NodeKey>> = {
          requestContext: ClientRequestContext.current,
          imodel: testData.imodelMock.object,
          prev: {
            ...rpcOptions.prev,
            rulesetVariables: rpcOptions.prev.rulesetVariables?.map(RulesetVariable.fromJSON),
          },
          rulesetOrId: rpcOptions.rulesetOrId,
          expandedNodeKeys: rpcOptions.expandedNodeKeys!.map(NodeKey.fromJSON),
          resultSetSize: MAX_ALLOWED_PAGE_SIZE,
        };
        presentationManagerMock.setup(async (x) => x.compareHierarchies(managerOptions))
          .returns(async () => result)
          .verifiable();
        const actualResult = await impl.compareHierarchiesPaged(testData.imodelToken, rpcOptions);
        presentationManagerMock.verifyAll();
        expect(actualResult.result).to.deep.eq(HierarchyCompareInfo.toJSON(result));
      });

    });

  });

});
