/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RPC
 */

import { ClientRequestContext, Id64String, Logger } from "@bentley/bentleyjs-core";
import { IModelDb } from "@bentley/imodeljs-backend";
import { IModelRpcProps } from "@bentley/imodeljs-common";
import {
  ContentDescriptorRpcRequestOptions, ContentJSON, ContentRpcRequestOptions, Descriptor, DescriptorJSON, DescriptorOverrides, DiagnosticsOptions,
  DiagnosticsScopeLogs, DisplayLabelRpcRequestOptions, DisplayLabelsRpcRequestOptions, DisplayValueGroup, DisplayValueGroupJSON,
  DistinctValuesRpcRequestOptions, ExtendedContentRpcRequestOptions, ExtendedHierarchyRpcRequestOptions, HierarchyCompareInfo,
  HierarchyCompareInfoJSON, HierarchyCompareRpcOptions, HierarchyRpcRequestOptions, InstanceKey, InstanceKeyJSON, isContentDescriptorRequestOptions,
  isDisplayLabelRequestOptions, isExtendedContentRequestOptions, isExtendedHierarchyRequestOptions, ItemJSON, KeySet, KeySetJSON, LabelDefinition,
  LabelDefinitionJSON, LabelRpcRequestOptions, Node, NodeJSON, NodeKey, NodeKeyJSON, NodePathElement, NodePathElementJSON, Paged, PagedResponse,
  PageOptions, PartialHierarchyModification, PartialHierarchyModificationJSON, PresentationError, PresentationRpcInterface, PresentationRpcResponse,
  PresentationStatus, Ruleset, RulesetVariable, RulesetVariableJSON, SelectionInfo, SelectionScope, SelectionScopeRpcRequestOptions,
} from "@bentley/presentation-common";
import { PresentationBackendLoggerCategory } from "./BackendLoggerCategory";
import { Presentation } from "./Presentation";
import { PresentationManager } from "./PresentationManager";

type ContentGetter<TResult = any, TOptions = any> = (requestOptions: TOptions) => TResult;

/** @internal */
export const MAX_ALLOWED_PAGE_SIZE = 1000;

/**
 * The backend implementation of PresentationRpcInterface. All it's basically
 * responsible for is forwarding calls to [[Presentation.manager]].
 *
 * Consumers should not use this class. Instead, they should register
 * [PresentationRpcInterface]($presentation-common):
 * ``` ts
 * [[include:Backend.Initialization.RpcInterface]]
 * ```
 *
 * @internal
 */
export class PresentationRpcImpl extends PresentationRpcInterface {

  public constructor(_id?: string) {
    super();
  }

  /**
   * Get the maximum result waiting time.
   */
  public get requestTimeout(): number { return Presentation.getRequestTimeout(); }

  /** Returns an ok response with result inside */
  private successResponse<TResult>(result: TResult, diagnostics?: DiagnosticsScopeLogs[]) {
    return {
      statusCode: PresentationStatus.Success,
      result,
      diagnostics,
    };
  }

  /** Returns a bad request response with empty result and an error code */
  private errorResponse(errorCode: PresentationStatus, errorMessage?: string, diagnostics?: DiagnosticsScopeLogs[]) {
    return {
      statusCode: errorCode,
      result: undefined,
      errorMessage,
      diagnostics,
    };
  }

  /**
   * Get the [[PresentationManager]] used by this RPC impl.
   */
  public getManager(clientId?: string): PresentationManager {
    return Presentation.getManager(clientId);
  }

  private getIModel(token: IModelRpcProps): IModelDb {
    let imodel: IModelDb;
    try {
      imodel = IModelDb.findByKey(token.key);
    } catch {
      throw new PresentationError(PresentationStatus.InvalidArgument, "IModelRpcProps doesn't point to a valid iModel");
    }
    return imodel;
  }

  private async makeRequest<TRpcOptions extends { rulesetOrId?: Ruleset | string, clientId?: string, diagnostics?: DiagnosticsOptions, rulesetVariables?: RulesetVariableJSON[] }, TResult>(token: IModelRpcProps, requestId: string, requestOptions: TRpcOptions, request: ContentGetter<Promise<TResult>>): PresentationRpcResponse<TResult> {
    Logger.logInfo(PresentationBackendLoggerCategory.Rpc, `Received '${requestId}' request. Params: ${JSON.stringify(requestOptions)}`);
    const requestContext = ClientRequestContext.current;
    let imodel: IModelDb;
    try {
      imodel = this.getIModel(token);
    } catch (e) {
      return this.errorResponse((e as PresentationError).errorNumber, (e as PresentationError).message);
    }

    const { clientId, diagnostics: diagnosticsOptions, rulesetVariables, ...options } = requestOptions; // eslint-disable-line @typescript-eslint/no-unused-vars
    const managerRequestOptions: any = {
      ...options,
      requestContext,
      imodel,
    };

    // set up ruleset variables
    if (rulesetVariables)
      managerRequestOptions.rulesetVariables = rulesetVariables.map(RulesetVariable.fromJSON);

    // set up diagnostics listener
    let diagnosticLogs: DiagnosticsScopeLogs[] | undefined;
    if (diagnosticsOptions) {
      managerRequestOptions.diagnostics = {
        ...diagnosticsOptions,
        handler: (logs: DiagnosticsScopeLogs[]) => {
          // istanbul ignore else
          if (!diagnosticLogs)
            diagnosticLogs = [];
          diagnosticLogs.push(...logs);
        },
      };
    }

    // initiate request
    const resultPromise = request(managerRequestOptions)
      .then((result) => this.successResponse(result, diagnosticLogs))
      .catch((e: PresentationError) => this.errorResponse(e.errorNumber, e.message, diagnosticLogs));

    if (this.requestTimeout === 0)
      return resultPromise;

    let timeout: NodeJS.Timeout;
    const timeoutPromise = new Promise<any>((_resolve, reject) => {
      timeout = setTimeout(() => {
        reject("Timed out");
      }, this.requestTimeout);
    });

    return Promise.race([resultPromise, timeoutPromise])
      .catch(() => this.errorResponse(PresentationStatus.BackendTimeout))
      .finally(() => clearTimeout(timeout));
  }

  // eslint-disable-next-line deprecation/deprecation
  public async getNodesAndCount(token: IModelRpcProps, requestOptions: Paged<HierarchyRpcRequestOptions>, parentKey?: NodeKeyJSON) {
    return this.makeRequest(token, "getNodesAndCount", requestOptions, async (options) => {
      options = { ...options, parentKey: nodeKeyFromJson(parentKey) };
      const [nodes, count] = await Promise.all([
        this.getManager(requestOptions.clientId).getNodes(options),
        this.getManager(requestOptions.clientId).getNodesCount(options),
      ]);
      return { count, nodes: nodes.map(Node.toJSON) };
    });
  }

  /** @deprecated */
  // eslint-disable-next-line deprecation/deprecation
  public async getNodes(token: IModelRpcProps, requestOptions: Paged<HierarchyRpcRequestOptions>, parentKey?: NodeKeyJSON): PresentationRpcResponse<NodeJSON[]> {
    return this.makeRequest(token, "getNodes", requestOptions, async (options) => {
      const nodes = await this.getManager(requestOptions.clientId).getNodes({ ...options, parentKey: nodeKeyFromJson(parentKey) });
      return nodes.map(Node.toJSON);
    });
  }

  // eslint-disable-next-line deprecation/deprecation
  public async getNodesCount(token: IModelRpcProps, requestOptions: HierarchyRpcRequestOptions | ExtendedHierarchyRpcRequestOptions, parentKey?: NodeKeyJSON): PresentationRpcResponse<number> {
    return this.makeRequest(token, "getNodesCount", requestOptions, async (options) =>
      this.getManager(requestOptions.clientId).getNodesCount({ ...options, parentKey: nodeKeyFromJson(isExtendedHierarchyRequestOptions<never, NodeKeyJSON, RulesetVariableJSON>(options) ? options.parentKey : parentKey) }),
    );
  }

  public async getPagedNodes(token: IModelRpcProps, requestOptions: Paged<ExtendedHierarchyRpcRequestOptions>): PresentationRpcResponse<PagedResponse<NodeJSON>> {
    return this.makeRequest(token, "getPagedNodes", requestOptions, async (options) => {
      options = enforceValidPageSize({
        ...options,
        parentKey: nodeKeyFromJson(options.parentKey),
      });
      const [nodes, count] = await Promise.all([
        this.getManager(requestOptions.clientId).getNodes(options),
        this.getManager(requestOptions.clientId).getNodesCount(options),
      ]);
      return { total: count, items: nodes.map(Node.toJSON) };
    });
  }

  public async getNodePaths(token: IModelRpcProps, requestOptions: Omit<ExtendedHierarchyRpcRequestOptions, "parentKey">, paths: InstanceKeyJSON[][], markedIndex: number): PresentationRpcResponse<NodePathElementJSON[]> {
    return this.makeRequest(token, "getNodePaths", { ...requestOptions, paths, markedIndex }, async (options) => {
      const result = await this.getManager(requestOptions.clientId).getNodePaths(options);
      return result.map(NodePathElement.toJSON);
    });
  }

  public async getFilteredNodePaths(token: IModelRpcProps, requestOptions: Omit<ExtendedHierarchyRpcRequestOptions, "parentKey">, filterText: string): PresentationRpcResponse<NodePathElementJSON[]> {
    return this.makeRequest(token, "getFilteredNodePaths", { ...requestOptions, filterText }, async (options) => {
      const result = await this.getManager(requestOptions.clientId).getFilteredNodePaths(options);
      return result.map(NodePathElement.toJSON);
    });
  }

  /** @deprecated This is a noop now. Keeping just to avoid breaking the RPC interface. */
  // eslint-disable-next-line deprecation/deprecation
  public async loadHierarchy(_token: IModelRpcProps, _requestOptions: HierarchyRpcRequestOptions): PresentationRpcResponse<void> {
    return { statusCode: PresentationStatus.Success };
  }

  // eslint-disable-next-line deprecation/deprecation
  public async getContentDescriptor(token: IModelRpcProps, requestOptions: ContentRpcRequestOptions | ContentDescriptorRpcRequestOptions, displayType?: string, keys?: KeySetJSON, selection?: SelectionInfo): PresentationRpcResponse<DescriptorJSON | undefined> {
    return this.makeRequest(token, "getContentDescriptor", requestOptions, async (options) => {
      if (isContentDescriptorRequestOptions<never, KeySetJSON, RulesetVariableJSON>(options)) {
        options = { ...options, keys: KeySet.fromJSON(options.keys) };
      } else {
        options = {
          ...options,
          displayType: displayType!,
          keys: KeySet.fromJSON(keys!),
          selection,
        };
      }
      const descriptor = await this.getManager(requestOptions.clientId).getContentDescriptor(options);
      if (descriptor)
        return descriptor.toJSON();
      return undefined;
    });
  }

  // eslint-disable-next-line deprecation/deprecation
  public async getContentSetSize(token: IModelRpcProps, requestOptions: ContentRpcRequestOptions | ExtendedContentRpcRequestOptions, descriptorOrOverrides?: DescriptorJSON | DescriptorOverrides, keys?: KeySetJSON): PresentationRpcResponse<number> {
    return this.makeRequest(token, "getContentSetSize", requestOptions, async (options) => {
      if (isExtendedContentRequestOptions<never, DescriptorJSON, KeySetJSON, RulesetVariableJSON>(options)) {
        options = {
          ...options,
          descriptor: descriptorFromJson(options.descriptor),
          keys: KeySet.fromJSON(options.keys),
        };
      } else {
        options = {
          ...options,
          descriptor: descriptorFromJson(descriptorOrOverrides!),
          keys: KeySet.fromJSON(keys!),
        };
      }
      return this.getManager(requestOptions.clientId).getContentSetSize(options);
    });
  }

  // eslint-disable-next-line deprecation/deprecation
  public async getContentAndSize(token: IModelRpcProps, requestOptions: ContentRpcRequestOptions, descriptorOrOverrides: DescriptorJSON | DescriptorOverrides, keys: KeySetJSON): PresentationRpcResponse<{ size: number, content: ContentJSON | undefined }> {
    return this.makeRequest(token, "getContentAndSize", requestOptions, async (options) => {
      options = {
        ...options,
        descriptor: descriptorFromJson(descriptorOrOverrides),
        keys: KeySet.fromJSON(keys),
      };
      const [size, content] = await Promise.all([
        this.getManager(requestOptions.clientId).getContentSetSize(options),
        this.getManager(requestOptions.clientId).getContent(options),
      ]);
      if (content)
        return { size, content: content.toJSON() };
      return { size: 0, content: undefined };
    });
  }

  // eslint-disable-next-line deprecation/deprecation
  public async getContent(token: IModelRpcProps, requestOptions: Paged<ContentRpcRequestOptions>, descriptorOrOverrides: DescriptorJSON | DescriptorOverrides, keys: KeySetJSON): PresentationRpcResponse<ContentJSON | undefined> {
    return this.makeRequest(token, "getContent", requestOptions, async (options) => {
      const content = await this.getManager(requestOptions.clientId).getContent({ ...options, descriptor: descriptorFromJson(descriptorOrOverrides), keys: KeySet.fromJSON(keys) });
      if (content)
        return content.toJSON();
      return undefined;
    });
  }

  public async getPagedContent(token: IModelRpcProps, requestOptions: Paged<ExtendedContentRpcRequestOptions>): PresentationRpcResponse<{ descriptor: DescriptorJSON, contentSet: PagedResponse<ItemJSON> } | undefined> {
    return this.makeRequest(token, "getPagedContent", requestOptions, async (options) => {
      options = enforceValidPageSize({
        ...options,
        descriptor: descriptorFromJson(options.descriptor),
        keys: KeySet.fromJSON(options.keys),
      });

      const [size, content] = await Promise.all([
        this.getManager(requestOptions.clientId).getContentSetSize(options),
        this.getManager(requestOptions.clientId).getContent(options),
      ]);

      if (!content)
        return undefined;

      return {
        descriptor: content.descriptor.toJSON(),
        contentSet: {
          total: size,
          items: content.contentSet.map((i) => i.toJSON()),
        },
      };
    });
  }

  public async getPagedContentSet(token: IModelRpcProps, requestOptions: Paged<ExtendedContentRpcRequestOptions>): PresentationRpcResponse<PagedResponse<ItemJSON>> {
    const content = await this.getPagedContent(token, requestOptions);
    return this.successResponse(content.result ? content.result.contentSet : { total: 0, items: [] });
  }

  // eslint-disable-next-line deprecation/deprecation
  public async getDistinctValues(token: IModelRpcProps, requestOptions: ContentRpcRequestOptions, descriptor: DescriptorJSON | DescriptorOverrides, keys: KeySetJSON, fieldName: string, maximumValueCount: number): PresentationRpcResponse<string[]> {
    return this.makeRequest(token, "getDistinctValues", requestOptions, async (options) => {
      const { requestContext, ...optionsNoRequestContext } = options;
      // eslint-disable-next-line deprecation/deprecation
      return this.getManager(requestOptions.clientId).getDistinctValues(requestContext, optionsNoRequestContext, descriptorFromJson(descriptor), KeySet.fromJSON(keys), fieldName, maximumValueCount);
    });
  }

  public async getPagedDistinctValues(token: IModelRpcProps, requestOptions: DistinctValuesRpcRequestOptions): PresentationRpcResponse<PagedResponse<DisplayValueGroupJSON>> {
    return this.makeRequest(token, "getPagedDistinctValues", requestOptions, async (options) => {
      options = enforceValidPageSize({
        ...options,
        descriptor: descriptorFromJson(options.descriptor),
        keys: KeySet.fromJSON(options.keys),
      });
      const response = await this.getManager(requestOptions.clientId).getPagedDistinctValues(options);
      return {
        ...response,
        items: response.items.map(DisplayValueGroup.toJSON),
      };
    });
  }

  // eslint-disable-next-line deprecation/deprecation
  public async getDisplayLabelDefinition(token: IModelRpcProps, requestOptions: LabelRpcRequestOptions | DisplayLabelRpcRequestOptions, key?: InstanceKeyJSON): PresentationRpcResponse<LabelDefinitionJSON> {
    return this.makeRequest(token, "getDisplayLabelDefinition", requestOptions, async (options) => {
      const label = await this.getManager(requestOptions.clientId).getDisplayLabelDefinition({ ...options, key: isDisplayLabelRequestOptions(options) ? options.key : key! });
      return LabelDefinition.toJSON(label);
    });
  }

  // eslint-disable-next-line deprecation/deprecation
  public async getDisplayLabelDefinitions(token: IModelRpcProps, requestOptions: LabelRpcRequestOptions, keys: InstanceKeyJSON[]): PresentationRpcResponse<LabelDefinitionJSON[]> {
    return this.makeRequest(token, "getDisplayLabelDefinitions", requestOptions, async (options) => {
      const labels = await this.getManager(requestOptions.clientId).getDisplayLabelDefinitions({ ...options, keys: keys.map(InstanceKey.fromJSON) });
      return labels.map(LabelDefinition.toJSON);
    });
  }

  public async getPagedDisplayLabelDefinitions(token: IModelRpcProps, requestOptions: DisplayLabelsRpcRequestOptions): PresentationRpcResponse<PagedResponse<LabelDefinitionJSON>> {
    const pageOpts = enforceValidPageSize({ paging: { start: 0, size: requestOptions.keys.length } });
    if (pageOpts.paging.size < requestOptions.keys.length)
      requestOptions.keys.splice(pageOpts.paging.size);
    return this.makeRequest(token, "getPagedDisplayLabelDefinitions", requestOptions, async (options) => {
      const labels = await this.getManager(requestOptions.clientId).getDisplayLabelDefinitions({ ...options, keys: options.keys.map(InstanceKey.fromJSON) });
      return {
        total: options.keys.length,
        items: labels.map(LabelDefinition.toJSON),
      };
    });
  }

  public async getSelectionScopes(token: IModelRpcProps, requestOptions: SelectionScopeRpcRequestOptions): PresentationRpcResponse<SelectionScope[]> {
    return this.makeRequest(token, "getSelectionScopes", requestOptions, async (options) =>
      this.getManager(requestOptions.clientId).getSelectionScopes(options),
    );
  }

  public async computeSelection(token: IModelRpcProps, requestOptions: SelectionScopeRpcRequestOptions, ids: Id64String[], scopeId: string): PresentationRpcResponse<KeySetJSON> {
    return this.makeRequest(token, "computeSelection", { ...requestOptions, ids, scopeId }, async (options) => {
      const keys = await this.getManager(requestOptions.clientId).computeSelection(options);
      return keys.toJSON();
    });
  }

  public async compareHierarchies(token: IModelRpcProps, requestOptions: HierarchyCompareRpcOptions): PresentationRpcResponse<PartialHierarchyModificationJSON[]> {
    return this.makeRequest(token, "compareHierarchies", requestOptions, async (options) => {
      options = {
        ...options,
        ...(options.expandedNodeKeys ? { expandedNodeKeys: options.expandedNodeKeys.map(NodeKey.fromJSON) } : undefined),
      };
      const result = await this.getManager(requestOptions.clientId).compareHierarchies(options);
      return result.changes.map(PartialHierarchyModification.toJSON);
    });
  }

  public async compareHierarchiesPaged(token: IModelRpcProps, requestOptions: HierarchyCompareRpcOptions): PresentationRpcResponse<HierarchyCompareInfoJSON> {
    return this.makeRequest(token, "compareHierarchies", requestOptions, async (options) => {
      options = {
        ...options,
        ...(options.expandedNodeKeys ? { expandedNodeKeys: options.expandedNodeKeys.map(NodeKey.fromJSON) } : undefined),
        resultSetSize: getValidPageSize(requestOptions.resultSetSize),
      };
      const result = await this.getManager(requestOptions.clientId).compareHierarchies(options);
      return HierarchyCompareInfo.toJSON(result);
    });
  }
}

const enforceValidPageSize = <TOptions extends Paged<object>>(requestOptions: TOptions): TOptions & { paging: PageOptions } => {
  const validPageSize = getValidPageSize(requestOptions.paging?.size);
  if (!requestOptions.paging || requestOptions.paging.size !== validPageSize)
    return { ...requestOptions, paging: { ...requestOptions.paging, size: validPageSize } };
  return requestOptions as (TOptions & { paging: PageOptions });
};

const getValidPageSize = (size: number | undefined) => {
  const requestedSize = size ?? 0;
  return (requestedSize === 0 || requestedSize > MAX_ALLOWED_PAGE_SIZE) ? MAX_ALLOWED_PAGE_SIZE : requestedSize;
};

const nodeKeyFromJson = (json: NodeKeyJSON | undefined): NodeKey | undefined => {
  if (!json)
    return undefined;
  return NodeKey.fromJSON(json);
};

const descriptorFromJson = (json: DescriptorJSON | DescriptorOverrides): Descriptor | DescriptorOverrides => {
  if ((json as DescriptorJSON).connectionId)
    return Descriptor.fromJSON(json as DescriptorJSON)!;
  return json as DescriptorOverrides;
};
