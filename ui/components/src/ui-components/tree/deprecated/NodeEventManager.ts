/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { concat } from "rxjs/internal/observable/concat";
import { CheckBoxState } from "@bentley/ui-core";
import { TreeNodeItem } from "../TreeDataProvider";
import { BeInspireTreeNode } from "./component/BeInspireTree";
import { NodeKey, NodeLoadingOrchestrator, NodeSet } from "./NodeLoadingOrchestrator";

/* eslint-disable deprecation/deprecation */

interface NodeEventManagerCallbacks {
  onSelectionModified: (selectedNodes: Array<BeInspireTreeNode<TreeNodeItem>>, deselectedNodes: Array<BeInspireTreeNode<TreeNodeItem>>) => void;
  onSelectionReplaced: (selectedNodes: Array<BeInspireTreeNode<TreeNodeItem>>) => void;
  onCheckboxStateChanged: (stateChanges: Array<{ node: BeInspireTreeNode<TreeNodeItem>, newState: CheckBoxState }>) => void;
}

/** @internal
 * @deprecated */
export class NodeEventManager {
  private _loadingOrchestrator: NodeLoadingOrchestrator;
  private _bulkCheckboxActionsEnabled: boolean;
  private _callbacks: NodeEventManagerCallbacks;

  constructor(
    loadingOrchestrator: NodeLoadingOrchestrator,
    bulkCheckboxActionsEnabled: boolean,
    callbacks: NodeEventManagerCallbacks,
  ) {
    this._loadingOrchestrator = loadingOrchestrator;
    this._bulkCheckboxActionsEnabled = bulkCheckboxActionsEnabled;
    this._callbacks = callbacks;
  }

  public modifySelection(selectedNodes: Array<BeInspireTreeNode<TreeNodeItem>>, deselectedNodes: Array<BeInspireTreeNode<TreeNodeItem>>) {
    const deselectedNodesSet = new NodeSet(deselectedNodes.map((node) => NodeKey.for(node)));
    this._loadingOrchestrator.prepareNodes(selectedNodes.concat(deselectedNodes))
      .subscribe((preparedNodes) => {
        if (preparedNodes.length === 0) {
          return;
        }

        const preparedSelectedNodes: Array<BeInspireTreeNode<TreeNodeItem>> = [];
        const preparedDeselectedNodes: Array<BeInspireTreeNode<TreeNodeItem>> = [];
        for (const node of preparedNodes) {
          if (deselectedNodesSet.has(NodeKey.for(node))) {
            preparedDeselectedNodes.push(node);
          } else {
            preparedSelectedNodes.push(node);
          }
        }

        this._callbacks.onSelectionModified(preparedSelectedNodes, preparedDeselectedNodes);
      });
  }

  public replaceSelection(selectedNodes: Array<BeInspireTreeNode<TreeNodeItem>>) {
    this._loadingOrchestrator.cancelLoading();
    let selectionReplaced = false;
    this._loadingOrchestrator.prepareNodes(selectedNodes)
      .subscribe((preparedNodes) => {
        if (selectionReplaced) {
          this._callbacks.onSelectionModified(preparedNodes, []);
        } else {
          this._callbacks.onSelectionReplaced(preparedNodes);
          selectionReplaced = true;
        }
      });
  }

  /**
   * Selects all visible nodes that are between node1 and node2. Both nodes
   * must be loaded and can be supplied in any order.
   */
  public selectNodesBetween(replace: boolean, node1: BeInspireTreeNode<TreeNodeItem>, node2: BeInspireTreeNode<TreeNodeItem>) {
    if (replace) {
      this._loadingOrchestrator.cancelLoading();
    }

    this._loadingOrchestrator.prepareNodesBetween(node1, node2)
      .subscribe((preparedNodes) => {
        if (replace) {
          this._callbacks.onSelectionReplaced(preparedNodes);
          replace = false;
        } else {
          this._callbacks.onSelectionModified(preparedNodes, []);
        }
      });
  }

  public setCheckboxState(node: BeInspireTreeNode<TreeNodeItem>, state: CheckBoxState) {
    if (!node.selected() || !this._bulkCheckboxActionsEnabled) {
      this._callbacks.onCheckboxStateChanged([{ node, newState: state }]);
      return;
    }

    concat(this._loadingOrchestrator.prepareLoadedNodes(), this._loadingOrchestrator.preparePendingNodes())
      .subscribe((loadedNodes) => {
        const affectedNodes = loadedNodes.filter((loadedNode) => {
          if (!loadedNode.selected()) {
            return false;
          }

          if (loadedNode.payload!.isCheckboxDisabled) {
            return false;
          }

          return node.payload!.checkBoxState !== state;
        });
        this._callbacks.onCheckboxStateChanged(affectedNodes.map((affectedNode) => ({ node: affectedNode, newState: state })));
      });
  }
}
