/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { useCallback } from "react";
import { takeUntil } from "rxjs/internal/operators/takeUntil";
import { tap } from "rxjs/internal/operators/tap";
import { Subject } from "rxjs/internal/Subject";
import { Guid, IDisposable } from "@bentley/bentleyjs-core";
import { Keys, KeySet, NodeKey } from "@bentley/presentation-common";
import { Presentation, SelectionChangeEventArgs, SelectionChangeType, SelectionHandler, SelectionHelper } from "@bentley/presentation-frontend";
import {
  AbstractTreeNodeLoaderWithProvider, MutableTreeModel, MutableTreeModelNode, toRxjsObservable, TreeEditingParams, TreeEventHandler, TreeModelChanges,
  TreeModelSource, TreeNodeItem, TreeSelectionModificationEventArgs, TreeSelectionReplacementEventArgs,
} from "@bentley/ui-components";
import { useDisposable } from "@bentley/ui-core";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider";

/**
 * Data structure that describes parameters for UnifiedSelectionTreeEventHandler
 * @public
 */
export interface UnifiedSelectionTreeEventHandlerParams {
  /** Node loader used to load children when node is expanded. */
  nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;

  /**
   * Unique name for SelectionHandler to avoid handling events raised by itself. The
   * name is created if not provided.
   */
  name?: string;

  /** Specifies whether children should be disposed when parent node is collapsed or not. */
  collapsedChildrenDisposalEnabled?: boolean;

  /** Parameters used for node editing. */
  editingParams?: TreeEditingParams;

  /** @internal used for testing */
  selectionHandler?: SelectionHandler;
}

/**
 * Tree event handler that handles unified selection.
 * Extends wrapped tree event handler's functionality by adding, removing or replacing nodes in
 * unified selection. It also reacts to unified selection changes and selects/deselects tree nodes
 * according changes.
 *
 * **Note:** conditions used to determine if node is selected and nodes that should be added to
 * unified selection can be controlled by overriding 'shouldSelectNode' and 'createKeysForSelection' methods.
 *
 * @public
 */
export class UnifiedSelectionTreeEventHandler extends TreeEventHandler implements IDisposable {
  private _selectionHandler: SelectionHandler;
  private _dataProvider: IPresentationTreeDataProvider;
  private _modelSource: TreeModelSource;
  private _unregisterModelChangedListener: () => void;

  private _cancelled = new Subject<void>();

  constructor(params: UnifiedSelectionTreeEventHandlerParams) {
    super({
      ...params,
      modelSource: params.nodeLoader.modelSource,
    });
    this._dataProvider = params.nodeLoader.dataProvider;
    this._modelSource = params.nodeLoader.modelSource;
    const name = params.name ?? `Tree_${this._dataProvider.rulesetId}_${Guid.createValue()}`;
    this._selectionHandler = params.selectionHandler
      ? params.selectionHandler // istanbul ignore next
      : new SelectionHandler({ manager: Presentation.selection, name, imodel: this._dataProvider.imodel, rulesetId: this._dataProvider.rulesetId });
    this._selectionHandler.onSelect = this.onSelect.bind(this);
    this._unregisterModelChangedListener = this._modelSource.onModelChanged.addListener((args) => this.selectNodes(args[1]));
    this.selectNodes();
  }

  public override get modelSource() { return this._modelSource; }

  public override dispose() {
    super.dispose();
    this._cancelled.next();
    this._selectionHandler.dispose();
    this._unregisterModelChangedListener();
  }

  public override onSelectionModified({ modifications }: TreeSelectionModificationEventArgs) {
    const withUnifiedSelection = toRxjsObservable(modifications).pipe(
      takeUntil(this._cancelled),
      tap({
        next: ({ selectedNodeItems, deselectedNodeItems }) => {
          if (selectedNodeItems.length !== 0)
            this._selectionHandler.addToSelection(this.createKeysForSelection(selectedNodeItems, SelectionChangeType.Add));
          if (deselectedNodeItems.length !== 0)
            this._selectionHandler.removeFromSelection(this.createKeysForSelection(deselectedNodeItems, SelectionChangeType.Remove));
        },
        complete: () => {
          this.selectNodes();
        },
      }),
    );

    return super.onSelectionModified({ modifications: withUnifiedSelection });
  }

  public override onSelectionReplaced({ replacements }: TreeSelectionReplacementEventArgs) {
    let firstEmission = true;
    const withUnifiedSelection = toRxjsObservable(replacements).pipe(
      takeUntil(this._cancelled),
      tap({
        next: ({ selectedNodeItems }) => {
          if (selectedNodeItems.length === 0)
            return;
          if (firstEmission) {
            firstEmission = false;
            this._selectionHandler.replaceSelection(this.createKeysForSelection(selectedNodeItems, SelectionChangeType.Replace));
            return;
          }
          this._selectionHandler.addToSelection(this.createKeysForSelection(selectedNodeItems, SelectionChangeType.Add));
        },
        complete: () => {
          this.selectNodes();
        },
      }),
    );

    return super.onSelectionReplaced({ replacements: withUnifiedSelection });
  }

  public selectNodes(modelChange?: TreeModelChanges) {
    const selection = this._selectionHandler.getSelection();

    // when handling model change event only need to update newly added nodes
    if (modelChange)
      this.updateAffectedNodes(selection, modelChange);
    else
      this.updateAllNodes(selection);
  }

  protected getNodeKey(node: TreeNodeItem) {
    return this._dataProvider.getNodeKey(node);
  }

  /**
   * Determines if node should be selected.
   * Default implementation returns true if node key is in selection
   * or node is ECInstance node and instance key is in selection.
   */
  protected shouldSelectNode(node: TreeNodeItem, selection: Readonly<KeySet>) {
    const nodeKey = this.getNodeKey(node);
    if (nodeKey === undefined)
      return false;

    // consider node selected if it's key is in selection
    if (selection.has(nodeKey))
      return true;

    // ... or if it's an ECInstances node and any of instance keys is in selection
    if (NodeKey.isInstancesNodeKey(nodeKey) && nodeKey.instanceKeys.some((instanceKey) => selection.has(instanceKey)))
      return true;

    return false;
  }

  /**
   * Returns node keys that should be added, removed or used to replace unified selection.
   * Default implementation returns keys of supplied nodes.
   */
  protected createKeysForSelection(nodes: TreeNodeItem[], _selectionType: SelectionChangeType) {
    return this.getKeys(nodes);
  }

  protected getKeys(nodes: TreeNodeItem[]): Keys {
    const nodeKeys: NodeKey[] = nodes.map((node) => this._dataProvider.getNodeKey(node));
    return SelectionHelper.getKeysForSelection(nodeKeys);
  }

  private onSelect(evt: SelectionChangeEventArgs) {
    if (evt.source === this._selectionHandler.name)
      return;

    if (evt.changeType === SelectionChangeType.Clear || evt.changeType === SelectionChangeType.Replace)
      this._cancelled.next();

    this.selectNodes();
  }

  private updateAllNodes(selection: Readonly<KeySet>) {
    this._modelSource.modifyModel((model: MutableTreeModel) => {
      for (const node of model.iterateTreeModelNodes()) {
        this.updateNodeSelectionState(node, selection);
      }
    });
  }

  private updateAffectedNodes(selection: Readonly<KeySet>, modelChange: TreeModelChanges) {
    const affectedNodeIds = [...modelChange.addedNodeIds, ...modelChange.modifiedNodeIds];
    if (affectedNodeIds.length === 0)
      return;

    this._modelSource.modifyModel((model: MutableTreeModel) => {
      for (const nodeId of affectedNodeIds) {
        const node = model.getNode(nodeId);
        // istanbul ignore if
        if (!node)
          continue;

        this.updateNodeSelectionState(node, selection);
      }
    });
  }

  private updateNodeSelectionState(node: MutableTreeModelNode, selection: Readonly<KeySet>) {
    const shouldBeSelected = this.shouldSelectNode(node.item, selection);
    if (!node.isSelected && shouldBeSelected) {
      node.isSelected = true;
    } else if (node.isSelected && !shouldBeSelected) {
      node.isSelected = false;
    }
  }
}

/**
 * A custom hook which creates and disposes [[UnifiedSelectionTreeEventHandler]]
 * @public
 */
export function useUnifiedSelectionTreeEventHandler(props: UnifiedSelectionTreeEventHandlerParams) {
  return useDisposable(useCallback(
    () => new UnifiedSelectionTreeEventHandler(props),
    Object.values(props), /* eslint-disable-line react-hooks/exhaustive-deps */ /* want to re-create the handler whenever any prop changes */
  ));
}
