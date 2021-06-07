/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import memoize from "micro-memoize";
import { IDisposable, Logger } from "@bentley/bentleyjs-core";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import {
  DiagnosticsOptionsWithHandler, ExtendedHierarchyRequestOptions, Node, NodeKey, NodePathElement, Paged, Ruleset,
} from "@bentley/presentation-common";
import { Presentation } from "@bentley/presentation-frontend";
import { DelayLoadedTreeNodeItem, PageOptions, TreeNodeItem } from "@bentley/ui-components";
import { createDiagnosticsOptions, DiagnosticsProps } from "../common/Diagnostics";
import { RulesetRegistrationHelper } from "../common/RulesetRegistrationHelper";
import { PresentationComponentsLoggerCategory } from "../ComponentsLoggerCategory";
import { IPresentationTreeDataProvider } from "./IPresentationTreeDataProvider";
import { CreateTreeNodeItemProps, createTreeNodeItems, pageOptionsUiToPresentation, PRESENTATION_TREE_NODE_KEY } from "./Utils";

/**
 * Properties for creating a `PresentationTreeDataProvider` instance.
 * @public
 */
export interface PresentationTreeDataProviderProps extends DiagnosticsProps {
  /** IModel to pull data from. */
  imodel: IModelConnection;

  /** Id of the ruleset to use when requesting content or a ruleset itself. */
  ruleset: string | Ruleset;

  /**
   * Paging size for obtaining nodes.
   *
   * Presentation data providers, when used with paging, have ability to save one backend request for size / count. That
   * can only be achieved when `pagingSize` property is set on the data provider and it's value matches size which is used when
   * requesting nodes. To help developers notice this problem, data provider emits a warning similar to this:
   * ```
   * PresentationTreeDataProvider.pagingSize doesn't match pageOptions in PresentationTreeDataProvider.getNodes call. Make sure you set PresentationTreeDataProvider.pagingSize to avoid excessive backend requests.
   * ```
   * To fix the issue, developers should make sure the page size used for requesting data is also set for the data provider:
   * ```TS
   * const pagingSize = 10;
   * const provider = new TreeDataProvider({imodel, ruleset, pagingSize});
   * // only one backend request is made for the two following requests:
   * provider.getNodesCount();
   * provider.getNodes({ start: 0, size: pagingSize });
   * ```
   */
  pagingSize?: number;

  /** Should grouping nodes have a suffix with grouped nodes count. Defaults to `false`. */
  appendChildrenCountForGroupingNodes?: boolean;

  /**
   * By default the provider uses [PresentationManager]($presentation-frontend) accessed through `Presentation.presentation` to request
   * node counts, nodes and filter them. The overrides allow swapping some or all of the data source entry points thus
   * making the provider request data from custom sources.
   * @beta
   */
  dataSourceOverrides?: Partial<PresentationTreeDataProviderDataSourceEntryPoints>;
}

/**
 * Definitions of methods used by [[PresentationTreeDataProvider]] to get nodes' data.
 * @beta
 */
export interface PresentationTreeDataProviderDataSourceEntryPoints {
  getNodesCount: (requestOptions: ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>) => Promise<number>;
  getNodesAndCount: (requestOptions: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>>) => Promise<{ nodes: Node[], count: number }>;
  getFilteredNodePaths: (requestOptions: ExtendedHierarchyRequestOptions<IModelConnection, never>, filterText: string) => Promise<NodePathElement[]>;
}

/**
 * Presentation Rules-driven tree data provider.
 * @public
 */
export class PresentationTreeDataProvider implements IPresentationTreeDataProvider, IDisposable {
  private _imodel: IModelConnection;
  private _rulesetRegistration: RulesetRegistrationHelper;
  private _pagingSize?: number;
  private _appendChildrenCountForGroupingNodes?: boolean;
  private _disposeVariablesChangeListener: () => void;
  private _dataSource: PresentationTreeDataProviderDataSourceEntryPoints;
  private _diagnosticsOptions?: DiagnosticsOptionsWithHandler;

  /** Constructor. */
  public constructor(props: PresentationTreeDataProviderProps) {
    this._rulesetRegistration = new RulesetRegistrationHelper(props.ruleset);
    this._imodel = props.imodel;
    this._pagingSize = props.pagingSize;
    this._appendChildrenCountForGroupingNodes = props.appendChildrenCountForGroupingNodes;
    this._dataSource = {
      getNodesCount: async (requestOptions: ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>) => Presentation.presentation.getNodesCount(requestOptions),
      getNodesAndCount: async (requestOptions: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey>>) => Presentation.presentation.getNodesAndCount(requestOptions),
      getFilteredNodePaths: async (requestOptions: ExtendedHierarchyRequestOptions<IModelConnection, never>, filterText: string) => Presentation.presentation.getFilteredNodePaths(requestOptions, filterText),
      ...props.dataSourceOverrides,
    };
    this._disposeVariablesChangeListener = Presentation.presentation.vars(this._rulesetRegistration.rulesetId).onVariableChanged.addListener(() => {
      this._getNodesAndCount.cache.values.length = 0;
      this._getNodesAndCount.cache.keys.length = 0;
    });
    this._diagnosticsOptions = createDiagnosticsOptions(props);
  }

  /** Destructor. Must be called to clean up.  */
  public dispose() {
    this._rulesetRegistration.dispose();
    this._disposeVariablesChangeListener && this._disposeVariablesChangeListener();
  }

  /** Id of the ruleset used by this data provider */
  public get rulesetId(): string { return this._rulesetRegistration.rulesetId; }

  /** [[IModelConnection]] used by this data provider */
  public get imodel(): IModelConnection { return this._imodel; }

  /**
   * Paging options for obtaining nodes.
   * @see `PresentationTreeDataProviderProps.pagingSize`
   */
  public get pagingSize(): number | undefined { return this._pagingSize; }
  public set pagingSize(value: number | undefined) { this._pagingSize = value; }

  /** Called to get extended options for node requests */
  private createRequestOptions<TNodeKey = NodeKey>(parentKey: TNodeKey | undefined): ExtendedHierarchyRequestOptions<IModelConnection, TNodeKey> {
    return {
      imodel: this._imodel,
      rulesetOrId: this._rulesetRegistration.rulesetId,
      ...(parentKey ? { parentKey } : undefined),
      ...(this._diagnosticsOptions ? { diagnostics: this._diagnosticsOptions } : undefined),
    };
  }

  /**
   * Returns a [[NodeKey]] from given [[TreeNodeItem]].
   * **Warning:** the `node` must be created by this data provider.
   */
  public getNodeKey(node: TreeNodeItem): NodeKey {
    return (node as any)[PRESENTATION_TREE_NODE_KEY];
  }

  /**
   * Returns nodes
   * @param parentNode The parent node to return children for.
   * @param pageOptions Information about the requested page of data.
   */
  public async getNodes(parentNode?: TreeNodeItem, pageOptions?: PageOptions): Promise<DelayLoadedTreeNodeItem[]> {
    if (undefined !== pageOptions && pageOptions.size !== this.pagingSize) {
      const msg = `PresentationTreeDataProvider.pagingSize doesn't match pageOptions in PresentationTreeDataProvider.getNodes call.
        Make sure you set PresentationTreeDataProvider.pagingSize to avoid excessive backend requests.`;
      Logger.logWarning(PresentationComponentsLoggerCategory.Hierarchy, msg);
    }
    return (await this._getNodesAndCount(parentNode, pageOptions)).nodes;
  }

  /**
   * Returns the total number of nodes
   * @param parentNode The parent node to return children count for.
   */
  public async getNodesCount(parentNode?: TreeNodeItem): Promise<number> {
    if (this.pagingSize !== undefined)
      return (await this._getNodesAndCount(parentNode, { start: 0, size: this.pagingSize })).count;

    const parentKey = parentNode ? this.getNodeKey(parentNode) : undefined;
    return this._dataSource.getNodesCount(this.createRequestOptions(parentKey));
  }

  private _getNodesAndCount = memoize(async (parentNode?: TreeNodeItem, pageOptions?: PageOptions): Promise<{ nodes: TreeNodeItem[], count: number }> => {
    const parentKey = parentNode ? this.getNodeKey(parentNode) : undefined;
    const requestOptions = { ...this.createRequestOptions(parentKey), paging: pageOptionsUiToPresentation(pageOptions) };
    const nodesCreateProps: CreateTreeNodeItemProps = {
      appendChildrenCountForGroupingNodes: this._appendChildrenCountForGroupingNodes,
    };
    const result = await this._dataSource.getNodesAndCount(requestOptions);
    return { nodes: createTreeNodeItems(result.nodes, parentNode?.id, nodesCreateProps), count: result.count };
  }, { isMatchingKey: MemoizationHelpers.areNodesRequestsEqual as any });

  /**
   * Returns filtered node paths.
   * @param filter Filter.
   */
  public getFilteredNodePaths = async (filter: string): Promise<NodePathElement[]> => {
    return this._dataSource.getFilteredNodePaths(this.createRequestOptions<never>(undefined), filter);
  };

  /**
   * A no-op that used to request the whole hierarchy to be loaded on the backend.
   * @alpha @deprecated Will be removed on 3.0
   */
  // istanbul ignore next
  public async loadHierarchy() { }
}

class MemoizationHelpers {
  public static areNodesRequestsEqual(lhsArgs: [TreeNodeItem?, PageOptions?], rhsArgs: [TreeNodeItem?, PageOptions?]): boolean {
    if (lhsArgs[0]?.id !== rhsArgs[0]?.id)
      return false;
    if ((lhsArgs[1]?.start ?? 0) !== (rhsArgs[1]?.start ?? 0))
      return false;
    if ((lhsArgs[1]?.size ?? 0) !== (rhsArgs[1]?.size ?? 0))
      return false;
    return true;
  }
}
