/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module RPC
 */

import { Id64String } from "@bentley/bentleyjs-core";
import { IModelRpcProps, RpcInterface } from "@bentley/imodeljs-common";
import { ContentJSON } from "./content/Content";
import { DescriptorJSON, DescriptorOverrides, SelectionInfo } from "./content/Descriptor";
import { ItemJSON } from "./content/Item";
import { DisplayValueGroupJSON } from "./content/Value";
import { DiagnosticsOptions, DiagnosticsScopeLogs } from "./Diagnostics";
import { InstanceKeyJSON } from "./EC";
import { PresentationStatus } from "./Error";
import { NodeKeyJSON } from "./hierarchy/Key";
import { NodeJSON } from "./hierarchy/Node";
import { NodePathElementJSON } from "./hierarchy/NodePathElement";
import { KeySetJSON } from "./KeySet";
import { LabelDefinitionJSON } from "./LabelDefinition";
import {
  ContentDescriptorRequestOptions, ContentRequestOptions, DisplayLabelRequestOptions, DisplayLabelsRequestOptions, DistinctValuesRequestOptions,
  ExtendedContentRequestOptions, ExtendedHierarchyRequestOptions, HierarchyCompareOptions, HierarchyRequestOptions, LabelRequestOptions, Paged,
  SelectionScopeRequestOptions,
} from "./PresentationManagerOptions";
import { RulesetVariableJSON } from "./RulesetVariables";
import { SelectionScope } from "./selection/SelectionScope";
import { HierarchyCompareInfoJSON, PartialHierarchyModificationJSON } from "./Update";
import { Omit, PagedResponse } from "./Utils";

/**
 * Base options for all presentation RPC requests.
 * @public
 */
export type PresentationRpcRequestOptions<TManagerRequestOptions> = Omit<TManagerRequestOptions, "imodel" | "diagnostics"> & {
  /** ID of the client requesting data */
  clientId?: string;
  /** @alpha */
  diagnostics?: DiagnosticsOptions;
};

/**
 * Data structure for presentation RPC responses
 * @public
 */
export type PresentationRpcResponse<TResult = undefined> = Promise<{
  /** Response status code */
  statusCode: PresentationStatus;
  /** In case of an error response, the error message */
  errorMessage?: string;
  /** In case of a success response, the result */
  result?: TResult;
  /** @alpha */
  diagnostics?: DiagnosticsScopeLogs[];
}>;

/**
 * Data structure for base hierarchy request options.
 * @public
 * @deprecated Use [[ExtendedHierarchyRpcRequestOptions]]
 */
export type HierarchyRpcRequestOptions = PresentationRpcRequestOptions<HierarchyRequestOptions<never, RulesetVariableJSON>>; // eslint-disable-line deprecation/deprecation

/**
 * Data structure for hierarchy request options.
 * @public
 */
export type ExtendedHierarchyRpcRequestOptions = PresentationRpcRequestOptions<ExtendedHierarchyRequestOptions<never, NodeKeyJSON, RulesetVariableJSON>>;

/**
 * Data structure for content request options.
 * @public
 * @deprecated Use [[ContentDescriptorRpcRequestOptions]] or [[ExtendedContentRpcRequestOptions]]
 */
export type ContentRpcRequestOptions = PresentationRpcRequestOptions<ContentRequestOptions<never, RulesetVariableJSON>>; // eslint-disable-line deprecation/deprecation

/**
 * Data structure for content descriptor RPC request options.
 * @public
 */
export type ContentDescriptorRpcRequestOptions = PresentationRpcRequestOptions<ContentDescriptorRequestOptions<never, KeySetJSON, RulesetVariableJSON>>;

/**
 * Data structure for content RPC request options.
 * @public
 */
export type ExtendedContentRpcRequestOptions = PresentationRpcRequestOptions<ExtendedContentRequestOptions<never, DescriptorJSON, KeySetJSON, RulesetVariableJSON>>;

/**
 * Data structure for distinct values' request options.
 * @public
 */
export type DistinctValuesRpcRequestOptions = PresentationRpcRequestOptions<DistinctValuesRequestOptions<never, DescriptorJSON, KeySetJSON, RulesetVariableJSON>>;

/**
 * Data structure for label request options.
 * @public
 * @deprecated Use [[DisplayLabelRpcRequestOptions]] or [[DisplayLabelsRpcRequestOptions]]
 */
export type LabelRpcRequestOptions = PresentationRpcRequestOptions<LabelRequestOptions<never>>; // eslint-disable-line deprecation/deprecation

/**
 * Data structure for label request options.
 * @public
 */
export type DisplayLabelRpcRequestOptions = PresentationRpcRequestOptions<DisplayLabelRequestOptions<never, InstanceKeyJSON>>;

/**
 * Data structure for labels request options.
 * @public
 */
export type DisplayLabelsRpcRequestOptions = PresentationRpcRequestOptions<DisplayLabelsRequestOptions<never, InstanceKeyJSON>>;

/**
 * Data structure for selection scope request options.
 * @public
 */
export type SelectionScopeRpcRequestOptions = PresentationRpcRequestOptions<SelectionScopeRequestOptions<never>>;

/**
 * Data structure for comparing presentation data after ruleset or ruleset variable changes.
 * @public
 */
export type HierarchyCompareRpcOptions = PresentationRpcRequestOptions<HierarchyCompareOptions<never, NodeKeyJSON, RulesetVariableJSON>>;

/**
 * Interface used for communication between Presentation backend and frontend.
 * @public
 */
export class PresentationRpcInterface extends RpcInterface {
  /** The immutable name of the interface. */
  public static readonly interfaceName = "PresentationRpcInterface"; // eslint-disable-line @typescript-eslint/naming-convention

  /** The semantic version of the interface. */
  public static interfaceVersion = "2.10.0";

  /*===========================================================================================
    NOTE: Any add/remove/change to the methods below requires an update of the interface version.
    NOTE: Please consult the README in core/common/src/rpc for the semantic versioning rules.
  ===========================================================================================*/

  /** @deprecated Use an overload with [[ExtendedHierarchyRpcRequestOptions]] */
  // eslint-disable-next-line deprecation/deprecation
  public async getNodesCount(_token: IModelRpcProps, _options: HierarchyRpcRequestOptions, _parentKey: NodeKeyJSON | undefined): PresentationRpcResponse<number>;
  public async getNodesCount(_token: IModelRpcProps, _options: ExtendedHierarchyRpcRequestOptions): PresentationRpcResponse<number>;
  // eslint-disable-next-line deprecation/deprecation
  public async getNodesCount(_token: IModelRpcProps, _options: HierarchyRpcRequestOptions | ExtendedHierarchyRpcRequestOptions, _parentKey?: NodeKeyJSON): PresentationRpcResponse<number> { return this.forward(arguments); }

  /** @deprecated Use [[getPagedNodes]] */
  // eslint-disable-next-line deprecation/deprecation
  public async getNodesAndCount(_token: IModelRpcProps, _options: Paged<HierarchyRpcRequestOptions>, _parentKey?: NodeKeyJSON): PresentationRpcResponse<{ nodes: NodeJSON[], count: number }> { return this.forward(arguments); }
  /** @deprecated Use [[getPagedNodes]] */
  // eslint-disable-next-line deprecation/deprecation
  public async getNodes(_token: IModelRpcProps, _options: Paged<HierarchyRpcRequestOptions>, _parentKey?: NodeKeyJSON): PresentationRpcResponse<NodeJSON[]> { return this.forward(arguments); }
  public async getPagedNodes(_token: IModelRpcProps, _options: Paged<ExtendedHierarchyRpcRequestOptions>): PresentationRpcResponse<PagedResponse<NodeJSON>> { return this.forward(arguments); }

  // TODO: add paged version of this (#387280)
  public async getNodePaths(_token: IModelRpcProps, _options: Omit<ExtendedHierarchyRpcRequestOptions, "parentKey">, _paths: InstanceKeyJSON[][], _markedIndex: number): PresentationRpcResponse<NodePathElementJSON[]> { return this.forward(arguments); }
  // TODO: add paged version of this (#387280)
  public async getFilteredNodePaths(_token: IModelRpcProps, _options: Omit<ExtendedHierarchyRpcRequestOptions, "parentKey">, _filterText: string): PresentationRpcResponse<NodePathElementJSON[]> { return this.forward(arguments); }

  /** @alpha @deprecated Will be removed in 3.0 */
  // istanbul ignore next
  // eslint-disable-next-line deprecation/deprecation
  public async loadHierarchy(_token: IModelRpcProps, _options: HierarchyRpcRequestOptions): PresentationRpcResponse<void> { return this.forward(arguments); }

  /** @deprecated Use an overload with [[ContentDescriptorRpcRequestOptions]] */
  // eslint-disable-next-line deprecation/deprecation
  public async getContentDescriptor(_token: IModelRpcProps, _options: ContentRpcRequestOptions, _displayType: string, _keys: KeySetJSON, _selection: SelectionInfo | undefined): PresentationRpcResponse<DescriptorJSON | undefined>;
  public async getContentDescriptor(_token: IModelRpcProps, _options: ContentDescriptorRpcRequestOptions): PresentationRpcResponse<DescriptorJSON | undefined>;
  // eslint-disable-next-line deprecation/deprecation
  public async getContentDescriptor(_token: IModelRpcProps, _options: ContentRpcRequestOptions | ContentDescriptorRpcRequestOptions, _displayType?: string, _keys?: KeySetJSON, _selection?: SelectionInfo): PresentationRpcResponse<DescriptorJSON | undefined> { return this.forward(arguments); }

  /** @deprecated Use an overload with [[ExtendedContentRpcRequestOptions]] */
  // eslint-disable-next-line deprecation/deprecation
  public async getContentSetSize(_token: IModelRpcProps, _options: ContentRpcRequestOptions, _descriptorOrOverrides: DescriptorJSON | DescriptorOverrides, _keys: KeySetJSON): PresentationRpcResponse<number>;
  public async getContentSetSize(_token: IModelRpcProps, _options: ExtendedContentRpcRequestOptions): PresentationRpcResponse<number>;
  // eslint-disable-next-line deprecation/deprecation
  public async getContentSetSize(_token: IModelRpcProps, _options: ContentRpcRequestOptions | ExtendedContentRpcRequestOptions, _descriptorOrOverrides?: DescriptorJSON | DescriptorOverrides, _keys?: KeySetJSON): PresentationRpcResponse<number> { return this.forward(arguments); }

  /** @deprecated Use [[getPagedContent]] or [[getPagedContentSet]] */
  // eslint-disable-next-line deprecation/deprecation
  public async getContent(_token: IModelRpcProps, _options: ContentRpcRequestOptions, _descriptorOrOverrides: DescriptorJSON | DescriptorOverrides, _keys: KeySetJSON): PresentationRpcResponse<ContentJSON | undefined> { return this.forward(arguments); }
  /** @deprecated Use [[getPagedContent]] or [[getPagedContentSet]] */
  // eslint-disable-next-line deprecation/deprecation
  public async getContentAndSize(_token: IModelRpcProps, _options: ContentRpcRequestOptions, _descriptorOrOverrides: DescriptorJSON | DescriptorOverrides, _keys: KeySetJSON): PresentationRpcResponse<{ content?: ContentJSON, size: number }> { return this.forward(arguments); }
  public async getPagedContent(_token: IModelRpcProps, _options: Paged<ExtendedContentRpcRequestOptions>): PresentationRpcResponse<{ descriptor: DescriptorJSON, contentSet: PagedResponse<ItemJSON> } | undefined> { return this.forward(arguments); }
  public async getPagedContentSet(_token: IModelRpcProps, _options: Paged<ExtendedContentRpcRequestOptions>): PresentationRpcResponse<PagedResponse<ItemJSON>> { return this.forward(arguments); }

  /** @deprecated Use [[getPagedDistinctValues]] */
  // eslint-disable-next-line deprecation/deprecation
  public async getDistinctValues(_token: IModelRpcProps, _options: ContentRpcRequestOptions, _descriptor: DescriptorJSON | DescriptorOverrides, _keys: KeySetJSON, _fieldName: string, _maximumValueCount: number): PresentationRpcResponse<string[]> { return this.forward(arguments); }
  public async getPagedDistinctValues(_token: IModelRpcProps, _options: DistinctValuesRpcRequestOptions): PresentationRpcResponse<PagedResponse<DisplayValueGroupJSON>> { return this.forward(arguments); }

  /** @deprecated Use an overload with [[DisplayLabelRpcRequestOptions]] */
  // eslint-disable-next-line deprecation/deprecation
  public async getDisplayLabelDefinition(_token: IModelRpcProps, _options: LabelRpcRequestOptions, _key: InstanceKeyJSON): PresentationRpcResponse<LabelDefinitionJSON>;
  public async getDisplayLabelDefinition(_token: IModelRpcProps, _options: DisplayLabelRpcRequestOptions): PresentationRpcResponse<LabelDefinitionJSON>;
  // eslint-disable-next-line deprecation/deprecation
  public async getDisplayLabelDefinition(_token: IModelRpcProps, _options: LabelRpcRequestOptions | DisplayLabelRpcRequestOptions, _key?: InstanceKeyJSON): PresentationRpcResponse<LabelDefinitionJSON> { return this.forward(arguments); }

  /** @deprecated Use [[getPagedDisplayLabelDefinitions]] */
  // eslint-disable-next-line deprecation/deprecation
  public async getDisplayLabelDefinitions(_token: IModelRpcProps, _options: LabelRpcRequestOptions, _keys: InstanceKeyJSON[]): PresentationRpcResponse<LabelDefinitionJSON[]> { return this.forward(arguments); }
  public async getPagedDisplayLabelDefinitions(_token: IModelRpcProps, _options: DisplayLabelsRpcRequestOptions): PresentationRpcResponse<PagedResponse<LabelDefinitionJSON>> { return this.forward(arguments); }

  public async getSelectionScopes(_token: IModelRpcProps, _options: SelectionScopeRpcRequestOptions): PresentationRpcResponse<SelectionScope[]> { return this.forward(arguments); }
  // TODO: need to enforce paging on this
  public async computeSelection(_token: IModelRpcProps, _options: SelectionScopeRpcRequestOptions, _ids: Id64String[], _scopeId: string): PresentationRpcResponse<KeySetJSON> { return this.forward(arguments); }

  /** @alpha @deprecated Use [[compareHierarchiesPaged]] */
  public async compareHierarchies(_token: IModelRpcProps, _options: HierarchyCompareRpcOptions): PresentationRpcResponse<PartialHierarchyModificationJSON[]> { return this.forward(arguments); }
  public async compareHierarchiesPaged(_token: IModelRpcProps, _options: HierarchyCompareRpcOptions): PresentationRpcResponse<HierarchyCompareInfoJSON> { return this.forward(arguments); }
}

/** @alpha */
export enum PresentationIpcEvents {
  /**
   * ID of an event that's emitted when backend detects changes in presented data.
   */
  Update = "presentation.onUpdate",
}
