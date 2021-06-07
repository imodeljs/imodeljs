/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { BeEvent, IDisposable, Logger, OrderedId64Iterable } from "@bentley/bentleyjs-core";
import { IModelConnection, IpcApp } from "@bentley/imodeljs-frontend";
import {
  Content, ContentDescriptorRequestOptions, ContentRequestOptions, ContentUpdateInfo, Descriptor, DescriptorOverrides, DisplayLabelRequestOptions,
  DisplayLabelsRequestOptions, DisplayValueGroup, DistinctValuesRequestOptions, ExtendedContentRequestOptions, ExtendedHierarchyRequestOptions,
  FieldDescriptorType, HierarchyCompareOptions, HierarchyRequestOptions, HierarchyUpdateInfo, InstanceKey, isContentDescriptorRequestOptions,
  isDisplayLabelRequestOptions, isDisplayLabelsRequestOptions, isExtendedContentRequestOptions, isExtendedHierarchyRequestOptions, Item, Key, KeySet,
  LabelDefinition, LabelRequestOptions, Node, NodeKey, NodeKeyJSON, NodePathElement, Paged, PagedResponse, PageOptions, PartialHierarchyModification,
  PresentationError, PresentationIpcEvents, PresentationStatus, PresentationUnitSystem, RpcRequestsHandler, Ruleset, RulesetVariable, SelectionInfo,
  UpdateInfo, UpdateInfoJSON, VariableValueTypes,
} from "@bentley/presentation-common";
import { PresentationFrontendLoggerCategory } from "./FrontendLoggerCategory";
import { IpcRequestsHandler } from "./IpcRequestsHandler";
import { LocalizationHelper } from "./LocalizationHelper";
import { RulesetManager, RulesetManagerImpl } from "./RulesetManager";
import { RulesetVariablesManager, RulesetVariablesManagerImpl } from "./RulesetVariablesManager";
import { TRANSIENT_ELEMENT_CLASSNAME } from "./selection/SelectionManager";
import { StateTracker } from "./StateTracker";

/**
 * Data structure that describes IModel hierarchy change event arguments.
 * @alpha
 */
export interface IModelHierarchyChangeEventArgs {
  /** Id of ruleset that was used to create hierarchy. */
  rulesetId: string;
  /** Hierarchy changes info. */
  updateInfo: HierarchyUpdateInfo;
  /** Key of iModel that was used to create hierarchy. It matches [[IModelConnection.key]] property. */
  imodelKey: string;
}

/**
 * Data structure that describes iModel content change event arguments.
 * @alpha
 */
export interface IModelContentChangeEventArgs {
  /** Id of ruleset that was used to create content. */
  rulesetId: string;
  /** Content changes info. */
  updateInfo: ContentUpdateInfo;
  /** Key of iModel that was used to create content. It matches [[IModelConnection.key]] property. */
  imodelKey: string;
}

/**
 * Properties used to configure [[PresentationManager]]
 * @public
 */
export interface PresentationManagerProps {
  /**
   * Sets the active locale to use when localizing presentation-related
   * strings. It can later be changed through [[PresentationManager]].
   */
  activeLocale?: string;

  /**
   * Sets the active unit system to use for formatting property values with
   * units. Default presentation units are used if this is not specified. The active unit
   * system can later be changed through [[PresentationManager]] or overriden for each request
   *
   * @alpha
   */
  activeUnitSystem?: PresentationUnitSystem;

  /**
   * ID used to identify client that requests data. Generally, clients should
   * store this ID in their local storage so the ID can be reused across
   * sessions - this allows reusing some caches.
   *
   * Defaults to a unique GUID as a client id.
   */
  clientId?: string;

  /** @internal */
  rpcRequestsHandler?: RpcRequestsHandler;

  /** @internal */
  ipcRequestsHandler?: IpcRequestsHandler;

  /** @internal */
  stateTracker?: StateTracker;
}

/**
 * Frontend Presentation manager which basically just forwards all calls to
 * the backend implementation.
 *
 * @public
 */
export class PresentationManager implements IDisposable {
  private _requestsHandler: RpcRequestsHandler;
  private _rulesets: RulesetManager;
  private _localizationHelper: LocalizationHelper;
  private _rulesetVars: Map<string, RulesetVariablesManager>;
  private _clearEventListener?: () => void;
  private _connections: Map<IModelConnection, Promise<void>>;
  private _ipcRequestsHandler?: IpcRequestsHandler;
  private _stateTracker?: StateTracker;

  /**
   * An event raised when hierarchies created using specific ruleset change
   * @alpha
   */
  public onIModelHierarchyChanged = new BeEvent<(args: IModelHierarchyChangeEventArgs) => void>();

  /**
   * An event raised when content created using specific ruleset changes
   * @alpha
   */
  public onIModelContentChanged = new BeEvent<(args: IModelContentChangeEventArgs) => void>();

  /** Get / set active locale used for localizing presentation data */
  public activeLocale: string | undefined;

  /** Get / set active unit system used to format property values with units */
  public activeUnitSystem: PresentationUnitSystem | undefined;

  private constructor(props?: PresentationManagerProps) {
    if (props) {
      this.activeLocale = props.activeLocale;
      this.activeUnitSystem = props.activeUnitSystem;
    }

    this._requestsHandler = props?.rpcRequestsHandler ?? new RpcRequestsHandler(props ? { clientId: props.clientId } : undefined);
    this._rulesetVars = new Map<string, RulesetVariablesManager>();
    this._rulesets = RulesetManagerImpl.create();
    this._localizationHelper = new LocalizationHelper();
    this._connections = new Map<IModelConnection, Promise<void>>();

    if (IpcApp.isValid) {
      // Ipc only works in ipc apps, so the `onUpdate` callback will only be called there.
      this._clearEventListener = IpcApp.addListener(PresentationIpcEvents.Update, this.onUpdate);
      this._ipcRequestsHandler = props?.ipcRequestsHandler ?? new IpcRequestsHandler(this._requestsHandler.clientId);
      this._stateTracker = props?.stateTracker ?? new StateTracker(this._ipcRequestsHandler);
    }
  }

  public dispose() {
    this._requestsHandler.dispose();
    if (this._clearEventListener) {
      this._clearEventListener();
      this._clearEventListener = undefined;
    }
  }

  private async onConnection(imodel: IModelConnection) {
    if (!this._connections.has(imodel))
      this._connections.set(imodel, this.initializeIModel(imodel));
    await this._connections.get(imodel);
  }

  private async initializeIModel(imodel: IModelConnection) {
    imodel.onClose.addOnce(() => {
      this._connections.delete(imodel);
    });
    await this.onNewiModelConnection(imodel);
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private onUpdate = (_evt: Event, report: UpdateInfoJSON) => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.handleUpdateAsync(UpdateInfo.fromJSON(report));
  };

  /** @note This is only called in native apps after changes in iModels */
  private async handleUpdateAsync(report: UpdateInfo) {
    for (const imodelKey in report) {
      // istanbul ignore if
      if (!report.hasOwnProperty(imodelKey))
        continue;

      const imodelReport = report[imodelKey];
      for (const rulesetId in imodelReport) {
        // istanbul ignore if
        if (!imodelReport.hasOwnProperty(rulesetId))
          continue;

        const updateInfo = imodelReport[rulesetId];
        if (updateInfo.content)
          this.onIModelContentChanged.raiseEvent({ rulesetId, updateInfo: updateInfo.content, imodelKey });
        if (updateInfo.hierarchy)
          this.onIModelHierarchyChanged.raiseEvent({ rulesetId, updateInfo: updateInfo.hierarchy, imodelKey });
      }
    }
  }

  /**
   * Compare two hierarchies.
   * @public
   */
  public async compareHierarchies(props: HierarchyCompareOptions<IModelConnection, NodeKey>): Promise<PartialHierarchyModification[]> {
    if (!props.prev.rulesetOrId && !props.prev.rulesetVariables)
      return [];

    const options = await this.addRulesetAndVariablesToOptions(props);
    let modifications: PartialHierarchyModification[] = [];

    try {
      while (true) {
        const result = (await this.rpcRequestsHandler.compareHierarchiesPaged({ ...this.toRpcTokenOptions(options), prev: { ...options.prev, rulesetVariables: options.prev.rulesetVariables?.map(RulesetVariable.toJSON) } }));
        modifications.push(...result.changes.map(PartialHierarchyModification.fromJSON));
        if (!result.continuationToken)
          break;

        if (result.changes.length === 0) {
          Logger.logError(PresentationFrontendLoggerCategory.Package, "Hierarchy compare returned no changes but has continuation token.");
          return [];
        }

        options.continuationToken = result.continuationToken;
      }
    } catch (e) {
      if (e instanceof PresentationError && e.errorNumber === PresentationStatus.Canceled) {
        modifications = [];
      } else {
        // rethrow
        throw e;
      }
    }
    return modifications;
  }

  /** Function that is called when a new IModelConnection is used to retrieve data.
   *  @internal
   */
  public async onNewiModelConnection(_: IModelConnection) { }

  /**
   * Create a new PresentationManager instance
   * @param props Optional properties used to configure the manager
   */
  public static create(props?: PresentationManagerProps) {
    return new PresentationManager(props);
  }

  /** @internal */
  public get rpcRequestsHandler() { return this._requestsHandler; }

  /** @internal */
  public get ipcRequestsHandler() { return this._ipcRequestsHandler; }

  /** @internal */
  public get stateTracker() { return this._stateTracker; }

  /**
   * Get rulesets manager
   */
  public rulesets() { return this._rulesets; }

  /**
   * Get ruleset variables manager for specific ruleset
   * @param rulesetId Id of the ruleset to get the vars manager for
   */
  public vars(rulesetId: string) {
    if (!this._rulesetVars.has(rulesetId)) {
      const varsManager = new RulesetVariablesManagerImpl(rulesetId, this._ipcRequestsHandler);
      this._rulesetVars.set(rulesetId, varsManager);
    }
    return this._rulesetVars.get(rulesetId)!;
  }

  private toRpcTokenOptions<TOptions extends { imodel: IModelConnection, locale?: string, unitSystem?: PresentationUnitSystem, rulesetVariables?: RulesetVariable[] }>(requestOptions: TOptions) {
    // 1. put default `locale` and `unitSystem`
    // 2. put all `requestOptions` members (if `locale` or `unitSystem` are set, they'll override the defaults put at #1)
    // 3. put `imodel` of type `IModelRpcProps` which overwrites the `imodel` from `requestOptions` put at #2
    const defaultOptions: Pick<TOptions, "locale" | "unitSystem"> = {};
    if (this.activeLocale)
      defaultOptions.locale = this.activeLocale;
    if (this.activeUnitSystem)
      defaultOptions.unitSystem = this.activeUnitSystem;

    const { imodel, rulesetVariables, ...rpcRequestOptions } = requestOptions;
    return {
      ...defaultOptions,
      ...rpcRequestOptions,
      ...(rulesetVariables ? { rulesetVariables: rulesetVariables.map(RulesetVariable.toJSON) } : {}),
      imodel: imodel.getRpcProps(),
    };
  }

  private async addRulesetAndVariablesToOptions<TOptions extends { rulesetOrId: Ruleset | string, rulesetVariables?: RulesetVariable[] }>(options: TOptions) {
    const { rulesetOrId, rulesetVariables } = options;
    let foundRulesetOrId: Ruleset | string;
    if (typeof rulesetOrId === "object") {
      foundRulesetOrId = rulesetOrId;
    } else {
      const foundRuleset = await this._rulesets.get(rulesetOrId);
      foundRulesetOrId = foundRuleset ? foundRuleset.toJSON() : rulesetOrId;
    }
    const rulesetId = (typeof foundRulesetOrId === "object") ? foundRulesetOrId.id : foundRulesetOrId;

    // All Id64Array variable values must be sorted for serialization to JSON to work. RulesetVariablesManager
    // sorts them before storing, so that part is taken care of, but we need to ensure that variables coming from
    // request options are also sorted.
    const variables = (rulesetVariables ?? []).map((variable) => {
      if (variable.type === VariableValueTypes.Id64Array)
        return { ...variable, value: OrderedId64Iterable.sortArray(variable.value) };
      return variable;
    });
    if (!this._ipcRequestsHandler) {
      // only need to add variables from variables manager if there's no IPC
      // handler - if there is one, the variables are already known by the backend
      variables.push(...this.vars(rulesetId).getAllVariables());
    }

    return { ...options, rulesetOrId: foundRulesetOrId, rulesetVariables: variables };
  }

  /**
   * Retrieves nodes
   * @deprecated Use an overload with [[ExtendedHierarchyRequestOptions]]
   */
  // eslint-disable-next-line deprecation/deprecation
  public async getNodes(requestOptions: Paged<HierarchyRequestOptions<IModelConnection, RulesetVariable>>, parentKey: NodeKey | undefined): Promise<Node[]>; // eslint-disable-line @typescript-eslint/unified-signatures
  /** Retrieves nodes */
  public async getNodes(requestOptions: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey, RulesetVariable>>): Promise<Node[]>;
  // eslint-disable-next-line deprecation/deprecation
  public async getNodes(requestOptions: Paged<HierarchyRequestOptions<IModelConnection, RulesetVariable> | ExtendedHierarchyRequestOptions<IModelConnection, NodeKey, RulesetVariable>>, parentKey?: NodeKey): Promise<Node[]> {
    await this.onConnection(requestOptions.imodel);
    const options = await this.addRulesetAndVariablesToOptions(requestOptions);
    const rpcOptions = this.toRpcTokenOptions({ ...options, parentKey: optionalNodeKeyToJson(isExtendedHierarchyRequestOptions(options) ? options.parentKey : parentKey) });
    const result = await buildPagedResponse(options.paging, async (partialPageOptions) => this._requestsHandler.getPagedNodes({ ...rpcOptions, paging: partialPageOptions }));
    return this._localizationHelper.getLocalizedNodes(result.items.map(Node.fromJSON));
  }

  /**
   * Retrieves nodes count.
   * @deprecated Use an overload with [[ExtendedHierarchyRequestOptions]]
   */
  // eslint-disable-next-line deprecation/deprecation
  public async getNodesCount(requestOptions: HierarchyRequestOptions<IModelConnection, RulesetVariable>, parentKey: NodeKey | undefined): Promise<number>; // eslint-disable-line @typescript-eslint/unified-signatures
  /** Retrieves nodes count. */
  public async getNodesCount(requestOptions: ExtendedHierarchyRequestOptions<IModelConnection, NodeKey, RulesetVariable>): Promise<number>;
  // eslint-disable-next-line deprecation/deprecation
  public async getNodesCount(requestOptions: HierarchyRequestOptions<IModelConnection, RulesetVariable> | ExtendedHierarchyRequestOptions<IModelConnection, NodeKey, RulesetVariable>, parentKey?: NodeKey): Promise<number> {
    await this.onConnection(requestOptions.imodel);
    const options = await this.addRulesetAndVariablesToOptions(requestOptions);
    const rpcOptions = this.toRpcTokenOptions({ ...options, parentKey: optionalNodeKeyToJson(isExtendedHierarchyRequestOptions(options) ? options.parentKey : parentKey) });
    return this._requestsHandler.getNodesCount(rpcOptions);
  }

  /**
   * Retrieves total nodes count and a single page of nodes.
   * @deprecated Use an overload with [[ExtendedHierarchyRequestOptions]]
   */
  // eslint-disable-next-line deprecation/deprecation
  public async getNodesAndCount(requestOptions: Paged<HierarchyRequestOptions<IModelConnection, RulesetVariable>>, parentKey: NodeKey | undefined): Promise<{ count: number, nodes: Node[] }>; // eslint-disable-line @typescript-eslint/unified-signatures
  /** Retrieves total nodes count and a single page of nodes. */
  public async getNodesAndCount(requestOptions: Paged<ExtendedHierarchyRequestOptions<IModelConnection, NodeKey, RulesetVariable>>): Promise<{ count: number, nodes: Node[] }>;
  // eslint-disable-next-line deprecation/deprecation
  public async getNodesAndCount(requestOptions: Paged<HierarchyRequestOptions<IModelConnection, RulesetVariable> | ExtendedHierarchyRequestOptions<IModelConnection, NodeKey, RulesetVariable>>, parentKey?: NodeKey): Promise<{ count: number, nodes: Node[] }> {
    await this.onConnection(requestOptions.imodel);
    const options = await this.addRulesetAndVariablesToOptions(requestOptions);
    const rpcOptions = this.toRpcTokenOptions({ ...options, parentKey: optionalNodeKeyToJson(isExtendedHierarchyRequestOptions(options) ? options.parentKey : parentKey) });
    const result = await buildPagedResponse(options.paging, async (partialPageOptions) => this._requestsHandler.getPagedNodes({ ...rpcOptions, paging: partialPageOptions }));
    return {
      count: result.total,
      nodes: this._localizationHelper.getLocalizedNodes(result.items.map(Node.fromJSON)),
    };
  }

  /**
   * Retrieves paths from root nodes to children nodes according to specified keys. Intersecting paths will be merged.
   * @param requestOptions options for the request
   * @param paths Paths from root node to some child node.
   * @param markedIndex Index of the path in `paths` that will be marked.
   * @return A promise object that returns either an array of paths on success or an error string on error.
   */
  // eslint-disable-next-line deprecation/deprecation
  public async getNodePaths(requestOptions: ExtendedHierarchyRequestOptions<IModelConnection, never, RulesetVariable>, paths: InstanceKey[][], markedIndex: number): Promise<NodePathElement[]> {
    await this.onConnection(requestOptions.imodel);

    const pathsJson = paths.map((p) => p.map(InstanceKey.toJSON));
    const options = await this.addRulesetAndVariablesToOptions(requestOptions);
    const result = await this._requestsHandler.getNodePaths(this.toRpcTokenOptions(options), pathsJson, markedIndex);
    return result.map(NodePathElement.fromJSON);
  }

  /**
   * Retrieves paths from root nodes to nodes containing filter text in their label.
   * @param requestOptions options for the request
   * @param filterText Text to filter nodes against.
   * @return A promise object that returns either an array of paths on success or an error string on error.
   */
  // eslint-disable-next-line deprecation/deprecation
  public async getFilteredNodePaths(requestOptions: ExtendedHierarchyRequestOptions<IModelConnection, never, RulesetVariable>, filterText: string): Promise<NodePathElement[]> {
    await this.onConnection(requestOptions.imodel);

    const options = await this.addRulesetAndVariablesToOptions(requestOptions);
    const result = await this._requestsHandler.getFilteredNodePaths(this.toRpcTokenOptions(options), filterText);
    return result.map(NodePathElement.fromJSON);
  }

  /**
   * A no-op that used to request the whole hierarchy to be loaded on the backend.
   * @alpha @deprecated Will be removed in 3.0.
   */
  // istanbul ignore next
  // eslint-disable-next-line deprecation/deprecation
  public async loadHierarchy(_requestOptions: HierarchyRequestOptions<IModelConnection>): Promise<void> {
    // This is noop just to avoid breaking the API.
  }

  /**
   * Retrieves the content descriptor which describes the content and can be used to customize it.
   * @deprecated Use an overload with [[ContentDescriptorRequestOptions]]
   */
  // eslint-disable-next-line deprecation/deprecation
  public async getContentDescriptor(requestOptions: ContentRequestOptions<IModelConnection, RulesetVariable>, displayType: string, keys: KeySet, selection: SelectionInfo | undefined): Promise<Descriptor | undefined>;
  public async getContentDescriptor(requestOptions: ContentDescriptorRequestOptions<IModelConnection, KeySet, RulesetVariable>): Promise<Descriptor | undefined>;
  // eslint-disable-next-line deprecation/deprecation
  public async getContentDescriptor(requestOptions: ContentRequestOptions<IModelConnection, RulesetVariable> | ContentDescriptorRequestOptions<IModelConnection, KeySet, RulesetVariable>, displayType?: string, keys?: KeySet, selection?: SelectionInfo): Promise<Descriptor | undefined> {
    if (!isContentDescriptorRequestOptions(requestOptions))
      return this.getContentDescriptor({ ...requestOptions, displayType: displayType!, keys: keys!, selection });

    await this.onConnection(requestOptions.imodel);
    const options = await this.addRulesetAndVariablesToOptions(requestOptions);
    const rpcOptions = this.toRpcTokenOptions({
      ...options,
      keys: stripTransientElementKeys(options.keys).toJSON(),
    });
    const result = await this._requestsHandler.getContentDescriptor(rpcOptions);
    return Descriptor.fromJSON(result);
  }

  /**
   * Retrieves content set size based on the supplied content descriptor override.
   * @deprecated Use an overload with [[ExtendedContentRequestOptions]]
   */
  // eslint-disable-next-line deprecation/deprecation
  public async getContentSetSize(requestOptions: ContentRequestOptions<IModelConnection, RulesetVariable>, descriptorOrOverrides: Descriptor | DescriptorOverrides, keys: KeySet): Promise<number>;
  public async getContentSetSize(requestOptions: ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet, RulesetVariable>): Promise<number>;
  // eslint-disable-next-line deprecation/deprecation
  public async getContentSetSize(requestOptions: ContentRequestOptions<IModelConnection, RulesetVariable> | ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet, RulesetVariable>, descriptorOrOverrides?: Descriptor | DescriptorOverrides, keys?: KeySet): Promise<number> {
    if (!isExtendedContentRequestOptions(requestOptions))
      return this.getContentSetSize({ ...requestOptions, descriptor: descriptorOrOverrides!, keys: keys! });

    await this.onConnection(requestOptions.imodel);
    const options = await this.addRulesetAndVariablesToOptions(requestOptions);
    const rpcOptions = this.toRpcTokenOptions({
      ...options,
      descriptor: getDescriptorOverrides(requestOptions.descriptor),
      keys: stripTransientElementKeys(requestOptions.keys).toJSON(),
    });
    return this._requestsHandler.getContentSetSize(rpcOptions);
  }

  /**
   * Retrieves the content based on the supplied content descriptor override.
   * @deprecated Use an overload with [[ExtendedContentRequestOptions]]
   */
  // eslint-disable-next-line deprecation/deprecation
  public async getContent(requestOptions: Paged<ContentRequestOptions<IModelConnection, RulesetVariable>>, descriptorOrOverrides: Descriptor | DescriptorOverrides, keys: KeySet): Promise<Content | undefined>;
  public async getContent(requestOptions: Paged<ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet, RulesetVariable>>): Promise<Content | undefined>;
  // eslint-disable-next-line deprecation/deprecation
  public async getContent(requestOptions: Paged<ContentRequestOptions<IModelConnection, RulesetVariable> | ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet, RulesetVariable>>, argsDescriptor?: Descriptor | DescriptorOverrides, argsKeys?: KeySet): Promise<Content | undefined> {
    if (!isExtendedContentRequestOptions(requestOptions))
      return this.getContent({ ...requestOptions, descriptor: argsDescriptor!, keys: argsKeys! });
    return (await this.getContentAndSize(requestOptions))?.content;
  }

  /**
   * Retrieves the content and content set size based on the supplied content descriptor override.
   * @deprecated Use an overload with [[ExtendedContentRequestOptions]]
   */
  // eslint-disable-next-line deprecation/deprecation
  public async getContentAndSize(requestOptions: Paged<ContentRequestOptions<IModelConnection, RulesetVariable>>, descriptorOrOverrides: Descriptor | DescriptorOverrides, keys: KeySet): Promise<{ content: Content, size: number } | undefined>;
  public async getContentAndSize(requestOptions: Paged<ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet, RulesetVariable>>): Promise<{ content: Content, size: number } | undefined>;
  // eslint-disable-next-line deprecation/deprecation
  public async getContentAndSize(requestOptions: Paged<ContentRequestOptions<IModelConnection, RulesetVariable> | ExtendedContentRequestOptions<IModelConnection, Descriptor, KeySet, RulesetVariable>>, argsDescriptor?: Descriptor | DescriptorOverrides, argsKeys?: KeySet): Promise<{ content: Content, size: number } | undefined> {
    if (!isExtendedContentRequestOptions(requestOptions))
      return this.getContentAndSize({ ...requestOptions, descriptor: argsDescriptor!, keys: argsKeys! });

    await this.onConnection(requestOptions.imodel);
    const options = await this.addRulesetAndVariablesToOptions(requestOptions);
    const rpcOptions = this.toRpcTokenOptions({
      ...options,
      descriptor: getDescriptorOverrides(requestOptions.descriptor),
      keys: stripTransientElementKeys(requestOptions.keys).toJSON(),
    });
    let descriptor = (requestOptions.descriptor instanceof Descriptor) ? requestOptions.descriptor : undefined;
    const result = await buildPagedResponse(options.paging, async (partialPageOptions, requestIndex) => {
      if (0 === requestIndex && !descriptor) {
        const content = await this._requestsHandler.getPagedContent({ ...rpcOptions, paging: partialPageOptions });
        if (content) {
          descriptor = Descriptor.fromJSON(content.descriptor);
          return content.contentSet;
        }
        return { total: 0, items: [] };
      }
      return this._requestsHandler.getPagedContentSet({ ...rpcOptions, paging: partialPageOptions });
    });
    if (!descriptor)
      return undefined;
    const items = result.items.map((itemJson) => Item.fromJSON(itemJson)).filter<Item>((item): item is Item => (item !== undefined));
    return {
      size: result.total,
      content: this._localizationHelper.getLocalizedContent(new Content(descriptor, items)),
    };
  }

  /**
   * Retrieves distinct values of specific field from the content based on the supplied content descriptor override.
   * @param requestOptions        options for the request
   * @param descriptorOrOverrides Content descriptor which specifies how the content should be returned.
   * @param keys                  Keys of ECInstances to get the content for.
   * @param fieldName             Name of the field from which to take values.
   * @param maximumValueCount     Maximum numbers of values that can be returned. Unlimited if 0.
   * @return A promise object that returns either distinct values on success or an error string on error.
   * @deprecated Use [[getPagedDistinctValues]]
   */
  // eslint-disable-next-line deprecation/deprecation
  public async getDistinctValues(requestOptions: ContentRequestOptions<IModelConnection, RulesetVariable>, descriptorOrOverrides: Descriptor | DescriptorOverrides, keys: KeySet, fieldName: string, maximumValueCount: number = 0): Promise<string[]> {
    const values = await this.getPagedDistinctValues({
      ...requestOptions,
      descriptor: descriptorOrOverrides,
      keys,
      fieldDescriptor: {
        type: FieldDescriptorType.Name,
        fieldName,
      },
      paging: {
        start: 0,
        size: maximumValueCount,
      },
    });
    return values.items.map((v) => v.displayValue ? v.displayValue.toString() : "");
  }

  /**
   * Retrieves distinct values of specific field from the content based on the supplied content descriptor override.
   * @param requestOptions Options for the request
   * @public
   */
  public async getPagedDistinctValues(requestOptions: DistinctValuesRequestOptions<IModelConnection, Descriptor, KeySet, RulesetVariable>): Promise<PagedResponse<DisplayValueGroup>> {
    await this.onConnection(requestOptions.imodel);
    const options = await this.addRulesetAndVariablesToOptions(requestOptions);
    const rpcOptions = {
      ...this.toRpcTokenOptions(options),
      descriptor: getDescriptorOverrides(options.descriptor),
      keys: stripTransientElementKeys(options.keys).toJSON(),
    };
    const result = await buildPagedResponse(requestOptions.paging, async (partialPageOptions) => this._requestsHandler.getPagedDistinctValues({ ...rpcOptions, paging: partialPageOptions }));
    return {
      ...result,
      items: result.items.map(DisplayValueGroup.fromJSON),
    };
  }

  /**
   * Retrieves display label definition of specific item
   * @deprecated Use an overload with [[DisplayLabelRequestOptions]]
   */
  // eslint-disable-next-line deprecation/deprecation
  public async getDisplayLabelDefinition(requestOptions: LabelRequestOptions<IModelConnection>, key: InstanceKey): Promise<LabelDefinition>;
  public async getDisplayLabelDefinition(requestOptions: DisplayLabelRequestOptions<IModelConnection, InstanceKey>): Promise<LabelDefinition>;
  // eslint-disable-next-line deprecation/deprecation
  public async getDisplayLabelDefinition(requestOptions: LabelRequestOptions<IModelConnection> | DisplayLabelRequestOptions<IModelConnection, InstanceKey>, key?: InstanceKey): Promise<LabelDefinition> {
    await this.onConnection(requestOptions.imodel);
    const rpcOptions = this.toRpcTokenOptions({ ...requestOptions, key: InstanceKey.toJSON(isDisplayLabelRequestOptions(requestOptions) ? requestOptions.key : key!) });
    const result = await this._requestsHandler.getDisplayLabelDefinition(rpcOptions);
    return this._localizationHelper.getLocalizedLabelDefinition(LabelDefinition.fromJSON(result));
  }
  /**
   * Retrieves display label definition of specific items
   * @deprecated Use an overload with [[DisplayLabelsRequestOptions]]
   */
  // eslint-disable-next-line deprecation/deprecation
  public async getDisplayLabelDefinitions(requestOptions: LabelRequestOptions<IModelConnection>, keys: InstanceKey[]): Promise<LabelDefinition[]>;
  public async getDisplayLabelDefinitions(requestOptions: DisplayLabelsRequestOptions<IModelConnection, InstanceKey>): Promise<LabelDefinition[]>;
  // eslint-disable-next-line deprecation/deprecation
  public async getDisplayLabelDefinitions(requestOptions: LabelRequestOptions<IModelConnection> | DisplayLabelsRequestOptions<IModelConnection, InstanceKey>, keys?: InstanceKey[]): Promise<LabelDefinition[]> {
    await this.onConnection(requestOptions.imodel);
    const rpcOptions = this.toRpcTokenOptions({ ...requestOptions, keys: (isDisplayLabelsRequestOptions(requestOptions) ? requestOptions.keys : keys!).map(InstanceKey.toJSON) });
    const result = await buildPagedResponse(undefined, async (partialPageOptions) => {
      const partialKeys = (!partialPageOptions.start) ? rpcOptions.keys : rpcOptions.keys.slice(partialPageOptions.start);
      return this._requestsHandler.getPagedDisplayLabelDefinitions({ ...rpcOptions, keys: partialKeys });
    });
    return this._localizationHelper.getLocalizedLabelDefinitions(result.items.map(LabelDefinition.fromJSON));
  }

}

const getDescriptorOverrides = (descriptorOrOverrides: Descriptor | DescriptorOverrides): DescriptorOverrides => {
  if (descriptorOrOverrides instanceof Descriptor)
    return descriptorOrOverrides.createDescriptorOverrides();
  return descriptorOrOverrides;
};

const optionalNodeKeyToJson = (key: NodeKey | undefined): NodeKeyJSON | undefined => key ? NodeKey.toJSON(key) : undefined;

/** @internal */
export const buildPagedResponse = async <TItem>(requestedPage: PageOptions | undefined, getter: (page: Required<PageOptions>, requestIndex: number) => Promise<PagedResponse<TItem>>): Promise<PagedResponse<TItem>> => {
  const requestedPageStart = requestedPage?.start ?? 0;
  const requestedPageSize = requestedPage?.size ?? 0;
  let pageStart = requestedPageStart;
  let pageSize = requestedPageSize;
  let totalCount;
  let requestIndex = 0;
  const items = new Array<TItem>();
  while (true) {
    const partialResult = await getter({ start: pageStart, size: pageSize }, requestIndex++);
    if (partialResult.total !== 0 && partialResult.items.length === 0) {
      if (requestedPageStart >= partialResult.total)
        Logger.logWarning(PresentationFrontendLoggerCategory.Package, `Requested page with start index ${requestedPageStart} is out of bounds. Total number of items: ${partialResult.total}`);
      else
        Logger.logError(PresentationFrontendLoggerCategory.Package, "Paged request returned non zero total count but no items");
      return { total: 0, items: [] };
    }
    totalCount = partialResult.total;
    items.push(...partialResult.items);
    if (requestedPageSize !== 0 && items.length >= requestedPageSize || items.length >= (partialResult.total - requestedPageStart))
      break;
    if (requestedPageSize !== 0)
      pageSize -= partialResult.items.length;
    pageStart += partialResult.items.length;
  }
  return { total: totalCount, items };
};

const stripTransientElementKeys = (keys: KeySet) => {
  if (!keys.some((key) => Key.isInstanceKey(key) && key.className === TRANSIENT_ELEMENT_CLASSNAME))
    return keys;

  const copy = new KeySet();
  copy.add(keys, (key) => {
    // the callback is not going to be called with EntityProps as KeySet converts them
    // to InstanceKeys, but we want to keep the EntityProps case for correctness
    // istanbul ignore next
    const isTransient = Key.isInstanceKey(key) && key.className === TRANSIENT_ELEMENT_CLASSNAME
      || Key.isEntityProps(key) && key.classFullName === TRANSIENT_ELEMENT_CLASSNAME;
    return !isTransient;
  });
  return copy;
};
