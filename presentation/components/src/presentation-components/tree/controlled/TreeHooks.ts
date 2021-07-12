/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import * as immer from "immer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HierarchyUpdateRecord, PageOptions, PartialHierarchyModification, RegisteredRuleset, Ruleset, RulesetVariable, UPDATE_FULL, VariableValue,
} from "@bentley/presentation-common";
import { IModelHierarchyChangeEventArgs, Presentation } from "@bentley/presentation-frontend";
import {
  isTreeModelNode, isTreeModelNodePlaceholder, MutableTreeModel, MutableTreeModelNode, PagedTreeNodeLoader, RenderedItemsRange, Subscription,
  TreeModel, TreeModelNode, TreeModelNodeInput, TreeModelSource, TreeNodeItem, TreeNodeItemData, usePagedTreeNodeLoader, VisibleTreeNodes,
} from "@bentley/ui-components";
import { useDisposable } from "@bentley/ui-core";
import { PresentationTreeDataProvider, PresentationTreeDataProviderProps } from "../DataProvider";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider";
import { createPartialTreeNodeItem, createTreeNodeId, createTreeNodeItem, CreateTreeNodeItemProps } from "../Utils";
import { getExpandedNodeItems, useExpandedNodesTracking } from "./UseExpandedNodesTracking";

/**
 * Properties for [[usePresentationTreeNodeLoader]] hook.
 * @public
 */
export interface PresentationTreeNodeLoaderProps extends PresentationTreeDataProviderProps {
  /**
   * Number of nodes in a single page. The created loader always requests at least
   * a page nodes, so it should be optimized for usability vs performance (using
   * smaller pages gives better responsiveness, but makes overall performance
   * slightly worse).
   *
   * Note: The prop is already defined in `PresentationTreeDataProviderProps` but specified here again to make it required.
   */
  pagingSize: number;

  /**
   * Should node loader initiate loading of the whole hierarchy as soon as it's created.
   * @alpha @deprecated Will be removed on 3.0.
   */
  preloadingEnabled?: boolean;

  /**
   * Auto-update the hierarchy when ruleset, ruleset variables or data in the iModel changes.
   * @alpha
   */
  enableHierarchyAutoUpdate?: boolean;

  /**
   * Used for testing
   * @internal
   */
  dataProvider?: IPresentationTreeDataProvider;
}

/**
 * Custom hooks which creates PagedTreeNodeLoader with PresentationTreeDataProvider using
 * supplied imodel and ruleset.
 *
 * @public
 */
export function usePresentationTreeNodeLoader(props: PresentationTreeNodeLoaderProps) {
  interface Info {
    treeModel: MutableTreeModel | undefined;
  }

  const [info, setInfo] = useState<Info>({ treeModel: undefined });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dataProvider = useDisposable(useCallback(() => createDataProvider(props), [info, ...Object.values(props)]));

  let treeModelSeed = props.enableHierarchyAutoUpdate ? info.treeModel : undefined;
  // Set treeModelSeed to undefined if props have changed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => treeModelSeed = undefined, Object.values(props));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const modelSource = useMemo(() => new TreeModelSource(treeModelSeed), [dataProvider]);

  const rerenderWithTreeModel = useCallback((treeModel?: MutableTreeModel) => setInfo({ treeModel }), []);
  const modelSourceUpdateProps: ModelSourceUpdateProps = {
    enable: props.enableHierarchyAutoUpdate,
    modelSource,
    rerenderWithTreeModel,
    dataProvider,
    treeNodeItemCreationProps: useMemo(() => ({ appendChildrenCountForGroupingNodes: props.appendChildrenCountForGroupingNodes }), [props.appendChildrenCountForGroupingNodes]),
  };

  const onItemsRendered = useModelSourceUpdateOnIModelHierarchyUpdate(modelSourceUpdateProps);
  useModelSourceUpdateOnRulesetModification(modelSourceUpdateProps);
  useModelSourceUpdateOnRulesetVariablesChange(modelSourceUpdateProps);

  const nodeLoader = usePagedTreeNodeLoader(dataProvider, props.pagingSize, modelSource);
  // When node loader is changed, all node loads automatically get cancelled; need to resume
  useResumeNodeLoading(modelSource, nodeLoader);
  return { nodeLoader, onItemsRendered };
}

/** Starts loading children for nodes that are marked as loading, each time arguments change. */
function useResumeNodeLoading(
  modelSource: TreeModelSource,
  nodeLoader: PagedTreeNodeLoader<IPresentationTreeDataProvider>,
): void {
  useEffect(
    () => {
      let subscriptions: Subscription | undefined;
      for (const node of modelSource.getModel().iterateTreeModelNodes()) {
        if (!node.isLoading) {
          continue;
        }

        if (subscriptions === undefined) {
          subscriptions = nodeLoader.loadNode(node, 0).subscribe();
        } else {
          subscriptions.add(nodeLoader.loadNode(node, 0).subscribe());
        }
      }

      return () => subscriptions?.unsubscribe();
    },
    [modelSource, nodeLoader],
  );
}

interface ModelSourceUpdateProps {
  enable?: boolean;
  modelSource: TreeModelSource;
  rerenderWithTreeModel: (treeModel?: MutableTreeModel) => void;
  dataProvider: IPresentationTreeDataProvider;
  treeNodeItemCreationProps: CreateTreeNodeItemProps;
}

function useModelSourceUpdateOnIModelHierarchyUpdate(props: ModelSourceUpdateProps) {
  const { modelSource, dataProvider, rerenderWithTreeModel } = props;
  useExpandedNodesTracking({ modelSource, dataProvider, enableNodesTracking: !!props.enable });
  const renderedItems = useRef<RenderedItemsRange | undefined>(undefined);
  const onItemsRendered = useCallback((items: RenderedItemsRange) => {
    renderedItems.current = items;
  }, []);

  const onIModelHierarchyChanged = useCallback(
    async (args: IModelHierarchyChangeEventArgs) => {
      if (args.rulesetId === dataProvider.rulesetId && args.imodelKey === dataProvider.imodel.key) {
        if (args.updateInfo === UPDATE_FULL) {
          rerenderWithTreeModel(undefined);
        } else {
          await updateModelSourceAfterIModelChange(modelSource, rerenderWithTreeModel, args.updateInfo, dataProvider, props.treeNodeItemCreationProps, renderedItems.current);
        }
      }
    },
    [modelSource, dataProvider, rerenderWithTreeModel, props.treeNodeItemCreationProps],
  );
  useEffect(
    () => {
      return props.enable
        ? Presentation.presentation.onIModelHierarchyChanged.addListener(onIModelHierarchyChanged)
        : undefined;
    },
    [onIModelHierarchyChanged, props.enable],
  );

  return onItemsRendered;
}

function useModelSourceUpdateOnRulesetModification(props: ModelSourceUpdateProps) {
  const onRulesetModified = useCallback(async (curr: RegisteredRuleset, prev: Ruleset) => {
    if (curr.id === props.dataProvider.rulesetId) {
      const compareResult = await Presentation.presentation.compareHierarchies({
        imodel: props.dataProvider.imodel,
        prev: {
          rulesetOrId: prev,
        },
        rulesetOrId: curr.toJSON(),
        expandedNodeKeys: getExpandedNodeKeys(props.modelSource, props.dataProvider),
      });
      updateModelSource(props.modelSource, props.rerenderWithTreeModel, compareResult, props.treeNodeItemCreationProps);
    }
  }, [props.dataProvider, props.modelSource, props.rerenderWithTreeModel, props.treeNodeItemCreationProps]);
  useEffect(() => {
    return props.enable ? Presentation.presentation.rulesets().onRulesetModified.addListener(onRulesetModified) : undefined;
  }, [onRulesetModified, props.enable]);
}

function useModelSourceUpdateOnRulesetVariablesChange(props: ModelSourceUpdateProps) {
  const onRulesetVariableChanged = useCallback(async (variableId: string, prevValue: VariableValue | undefined) => {
    // note: we should probably debounce these events while accumulating changed variables in case multiple vars are changed
    const prevVariables: RulesetVariable[] = [];
    Presentation.presentation.vars(props.dataProvider.rulesetId).getAllVariables().forEach((variable) => {
      if (variableId !== variable.id)
        prevVariables.push(variable);
      else if (prevValue !== undefined)
        prevVariables.push({ ...variable, value: prevValue } as RulesetVariable);
    });
    const compareResult = await Presentation.presentation.compareHierarchies({
      imodel: props.dataProvider.imodel,
      prev: {
        rulesetVariables: prevVariables,
      },
      rulesetOrId: props.dataProvider.rulesetId,
      expandedNodeKeys: getExpandedNodeKeys(props.modelSource, props.dataProvider),
    });
    updateModelSource(props.modelSource, props.rerenderWithTreeModel, compareResult, props.treeNodeItemCreationProps);
  }, [props.dataProvider, props.modelSource, props.rerenderWithTreeModel, props.treeNodeItemCreationProps]);
  useEffect(() => {
    return props.enable ? Presentation.presentation.vars(props.dataProvider.rulesetId).onVariableChanged.addListener(onRulesetVariableChanged) : undefined;
  }, [props.dataProvider.rulesetId, onRulesetVariableChanged, props.enable]);
}

function updateModelSource(
  modelSource: TreeModelSource,
  rerenderWithTreeModel: (treeModel?: MutableTreeModel) => void,
  hierarchyModifications: PartialHierarchyModification[],
  treeNodeItemCreationProps: CreateTreeNodeItemProps,
) {
  const newModel = updateTreeModel(modelSource.getModel(), hierarchyModifications, treeNodeItemCreationProps);
  if (newModel !== modelSource.getModel() || newModel === undefined) {
    rerenderWithTreeModel(newModel);
  }
}

/** @internal */
export function updateTreeModel(
  treeModel: TreeModel,
  hierarchyModifications: PartialHierarchyModification[],
  treeNodeItemCreationProps: CreateTreeNodeItemProps,
): MutableTreeModel | undefined {
  let encounteredAnError = false;
  const updatedTreeModel = immer.produce(treeModel as MutableTreeModel, (model) => {
    for (const modification of hierarchyModifications) {
      switch (modification.type) {
        case "Insert":
          const nodeInput = convertToTreeModelNodeInput(createTreeNodeItem(modification.node));
          const parentId = modification.parent === undefined ? undefined : createTreeNodeId(modification.parent);
          model.insertChild(parentId, nodeInput, modification.position);
          break;

        case "Update":
          const existingNode = model.getNode(createTreeNodeId(modification.target));
          if (existingNode === undefined) {
            break;
          }

          const updatedItem = {
            ...existingNode.item,
            ...createPartialTreeNodeItem(modification.changes, existingNode.parentId, treeNodeItemCreationProps),
          };

          delete existingNode.editingInfo;
          existingNode.item = updatedItem;
          existingNode.label = updatedItem.label;
          existingNode.description = updatedItem.description ?? "";

          if ("hasChildren" in modification.changes) {
            model.setNumChildren(existingNode.id, modification.changes.hasChildren ? undefined : 0);
            if (!modification.changes.hasChildren) {
              existingNode.isExpanded = false;
              existingNode.isLoading = false;
            }
          }

          if ("key" in modification.changes && existingNode.id !== updatedItem.id) {
            if (!model.changeNodeId(existingNode.id, updatedItem.id)) {
              encounteredAnError = true;
              return;
            }

            existingNode.isSelected = false;
          }

          break;

        case "Delete":
          // eslint-disable-next-line deprecation/deprecation
          const nodeToRemove = model.getNode(createTreeNodeId(modification.target));
          if (nodeToRemove === undefined) {
            break;
          }

          model.removeChild(nodeToRemove.parentId, nodeToRemove.id);
          break;
      }
    }
  });

  if (encounteredAnError) {
    return undefined;
  }

  return updatedTreeModel;
}

function convertToTreeModelNodeInput(item: TreeNodeItemData): TreeModelNodeInput {
  return {
    description: item.description,
    isExpanded: !!item.autoExpand,
    id: item.id,
    item,
    label: item.label,
    isLoading: false,
    numChildren: item.hasChildren ? undefined : 0,
    isSelected: false,
  };
}

function getExpandedNodeKeys(modelSource: TreeModelSource, dataProvider: IPresentationTreeDataProvider) {
  return getExpandedNodeItems(modelSource).map((item) => dataProvider.getNodeKey(item));
}

function createDataProvider(props: PresentationTreeNodeLoaderProps): IPresentationTreeDataProvider {
  let dataProvider: IPresentationTreeDataProvider;
  if (props.dataProvider) {
    dataProvider = props.dataProvider;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { dataProvider: testDataProvider, ...providerProps } = props;
    dataProvider = new PresentationTreeDataProvider(providerProps);
  }
  return dataProvider;
}

async function updateModelSourceAfterIModelChange(
  modelSource: TreeModelSource,
  rerenderWithTreeModel: (treeModel?: MutableTreeModel) => void,
  hierarchyUpdateRecords: HierarchyUpdateRecord[],
  dataProvider: IPresentationTreeDataProvider,
  treeNodeItemCreationProps: CreateTreeNodeItemProps,
  renderedItems?: RenderedItemsRange,
) {
  const modelWithUpdateRecords = applyHierarchyChanges(modelSource.getModel() as MutableTreeModel, hierarchyUpdateRecords, [], treeNodeItemCreationProps);
  if (modelWithUpdateRecords === modelSource.getModel())
    return;

  if (!renderedItems)
    return rerenderWithTreeModel(modelWithUpdateRecords);

  const reloadedHierarchyParts = await reloadVisibleHierarchyParts(new TreeModelSource(modelWithUpdateRecords).getVisibleNodes(), renderedItems, dataProvider);
  const newModel = applyHierarchyChanges(modelSource.getModel() as MutableTreeModel, hierarchyUpdateRecords, reloadedHierarchyParts, treeNodeItemCreationProps);
  rerenderWithTreeModel(newModel);
}

/** @internal */
export interface ReloadedHierarchyPart {
  parentId: string | undefined;
  nodeItems: TreeNodeItem[];
  offset: number;
}

/** @internal */
export function applyHierarchyChanges(
  treeModel: MutableTreeModel,
  hierarchyUpdateRecords: HierarchyUpdateRecord[],
  reloadedHierarchyParts: ReloadedHierarchyPart[],
  treeNodeItemCreationProps: CreateTreeNodeItemProps
) {
  const updatedTreeModel = immer.produce(treeModel, (model: MutableTreeModel) => {
    const updateParentIds = hierarchyUpdateRecords
      .map((record) => record.parent ? createTreeNodeId(record.parent) : undefined);
    for (const record of hierarchyUpdateRecords) {
      const parentNodeId = record.parent ? createTreeNodeId(record.parent) : undefined;
      const parentNode = parentNodeId ? model.getNode(parentNodeId) : model.getRootNode();
      if (!parentNode) {
        continue;
      }

      model.clearChildren(parentNodeId);
      model.setNumChildren(parentNodeId, record.nodesCount);
      if (isTreeModelNode(parentNode) && !parentNode.isExpanded)
        continue;

      for (const expandedNode of record.expandedNodes ?? []) {
        const treeItem = createTreeNodeItem(expandedNode.node, parentNodeId, treeNodeItemCreationProps);
        const existingNode = treeModel.getNode(treeItem.id);
        model.setChildren(parentNodeId, [createModelNodeInput(existingNode, treeItem)], expandedNode.position);
        if (existingNode) {
          rebuildSubTree(treeModel, model, existingNode, updateParentIds);
        }
      }
    }

    for (const reloadedHierarchyPart of reloadedHierarchyParts) {
      let offset = reloadedHierarchyPart.offset;
      for (const item of reloadedHierarchyPart.nodeItems) {
        const newItem = createModelNodeInput(undefined, item);
        const existingItem = model.getNode(newItem.id);
        if (!existingItem) {
          model.setChildren(reloadedHierarchyPart.parentId, [newItem], offset);
        }
        offset++;
      }
    }
  });
  return updatedTreeModel;
}

function rebuildSubTree(oldModel: MutableTreeModel, newModel: MutableTreeModel, parentNode: TreeModelNode, excludedNodeIds: Array<string | undefined>) {
  const oldChildren = oldModel.getChildren(parentNode.id);
  if (!oldChildren || !parentNode.isExpanded || excludedNodeIds.includes(parentNode.id))
    return;

  newModel.setNumChildren(parentNode.id, oldChildren.getLength());
  for (const [childId, index] of oldChildren.iterateValues()) {
    const childNode = oldModel.getNode(childId);
    // istanbul ignore else
    if (childNode) {
      newModel.setChildren(parentNode.id, [{ ...childNode }], index);
      rebuildSubTree(oldModel, newModel, childNode, excludedNodeIds);
    }
  }
}

function createModelNodeInput(oldNode: MutableTreeModelNode | undefined, newNode: TreeNodeItem): TreeModelNodeInput {
  const newInput = convertToTreeModelNodeInput(newNode);
  if (!oldNode) {
    return newInput;
  }

  return {
    ...newInput,
    isExpanded: oldNode.isExpanded,
    isSelected: oldNode.isSelected,
    isLoading: oldNode.isLoading,
  };
}

/** @internal */
export async function reloadVisibleHierarchyParts(
  visibleNodes: VisibleTreeNodes,
  renderedItems: RenderedItemsRange,
  dataProvider: IPresentationTreeDataProvider,
) {
  const itemsRange = getItemsRange(renderedItems, visibleNodes);
  const partsToReload = new Map<string | undefined, { parentItem: TreeNodeItem | undefined, startIndex: number, endIndex: number }>();
  for (let i = itemsRange.startIndex; i <= itemsRange.endIndex; i++) {
    const node = visibleNodes.getAtIndex(i);
    if (!node || !isTreeModelNodePlaceholder(node))
      continue;

    const parentNode = node.parentId ? visibleNodes.getModel().getNode(node.parentId) : visibleNodes.getModel().getRootNode();
    // istanbul ignore if
    if (!parentNode || isTreeModelNodePlaceholder(parentNode))
      continue;

    const partToReload = partsToReload.get(parentNode.id);
    if (!partToReload) {
      partsToReload.set(parentNode.id, { parentItem: isTreeModelNode(parentNode) ? parentNode.item : undefined, startIndex: node.childIndex, endIndex: node.childIndex });
      continue;
    }
    partToReload.endIndex = node.childIndex;
  }

  const reloadedHierarchyParts = new Array<ReloadedHierarchyPart>();
  for (const [parentId, hierarchyPart] of partsToReload) {
    const pageOptions: PageOptions = {
      start: hierarchyPart.startIndex,
      size: hierarchyPart.endIndex - hierarchyPart.startIndex + 1,
    };
    const reloadedPart: ReloadedHierarchyPart = {
      parentId,
      offset: hierarchyPart.startIndex,
      nodeItems: await dataProvider.getNodes(hierarchyPart.parentItem, pageOptions),
    };
    reloadedHierarchyParts.push(reloadedPart);
  }

  return reloadedHierarchyParts;
}

function getItemsRange(renderedNodes: RenderedItemsRange, visibleNodes: VisibleTreeNodes) {
  if (renderedNodes.visibleStopIndex < visibleNodes.getNumNodes())
    return { startIndex: renderedNodes.visibleStartIndex, endIndex: renderedNodes.visibleStopIndex };

  const visibleNodesCount = renderedNodes.visibleStopIndex - renderedNodes.visibleStartIndex;
  const endPosition = visibleNodes.getNumNodes() - 1;
  const startPosition = endPosition - visibleNodesCount;
  return {
    startIndex: startPosition < 0 ? 0 : startPosition,
    endIndex: endPosition < 0 ? 0 : endPosition,
  };
}
