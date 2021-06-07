/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { takeUntil } from "rxjs/internal/operators/takeUntil";
import { Subject } from "rxjs/internal/Subject";
import { IDisposable } from "@bentley/bentleyjs-core";
import { TreeModelMutator } from "./internal/TreeModelMutator";
import { Subscription, toRxjsObservable } from "./Observable";
import {
  TreeCheckboxStateChangeEventArgs, TreeEvents, TreeNodeEventArgs, TreeSelectionModificationEventArgs, TreeSelectionReplacementEventArgs,
} from "./TreeEvents";
import { TreeModelNode } from "./TreeModel";
import { TreeModelSource } from "./TreeModelSource";
import { ITreeNodeLoader } from "./TreeNodeLoader";

/**
 * Params used for tree node editing.
 * @public
 */
export interface TreeEditingParams {
  /** Callback that is called when node is updated. */
  onNodeUpdated: (node: TreeModelNode, newValue: string) => void;
}

/**
 * Data structure that describes tree event handler params.
 * @public
 */
export interface TreeEventHandlerParams {
  /** Model source used to modify tree model while handling events. */
  modelSource: TreeModelSource;
  /** Node loader used to load children when node is expanded. */
  nodeLoader: ITreeNodeLoader;
  /** Specifies whether children should be disposed when parent node is collapsed or not. */
  collapsedChildrenDisposalEnabled?: boolean;
  /** Parameters used for node editing. */
  editingParams?: TreeEditingParams;
}

/**
 * Default tree event handler.
 * @public
 */
export class TreeEventHandler implements TreeEvents, IDisposable {
  private _modelMutator: TreeModelMutator;
  private _editingParams?: TreeEditingParams;

  private _disposed = new Subject();
  private _selectionReplaced = new Subject();

  constructor(params: TreeEventHandlerParams) {
    this._modelMutator = new TreeModelMutator(params.modelSource, params.nodeLoader, !!params.collapsedChildrenDisposalEnabled);
    this._editingParams = params.editingParams;
  }

  /** Disposes tree event handler. */
  public dispose() {
    this._disposed.next();
  }

  public get modelSource() { return this._modelMutator.modelSource; }

  /** Expands node and starts loading children. */
  public onNodeExpanded({ nodeId }: TreeNodeEventArgs) {
    toRxjsObservable(this._modelMutator.expandNode(nodeId)).pipe(takeUntil(this._disposed)).subscribe();
  }

  /** Collapses node */
  public onNodeCollapsed({ nodeId }: TreeNodeEventArgs) {
    this._modelMutator.collapseNode(nodeId);
  }

  /** Selects and deselects nodes until event is handled, handler is disposed or selection replaced event occurs. */
  public onSelectionModified({ modifications }: TreeSelectionModificationEventArgs): Subscription | undefined {
    return toRxjsObservable(modifications)
      .pipe(
        takeUntil(this._disposed),
        takeUntil(this._selectionReplaced),
      )
      .subscribe({
        next: ({ selectedNodeItems, deselectedNodeItems }) => {
          this._modelMutator.modifySelection(selectedNodeItems, deselectedNodeItems);
        },
      });
  }

  /** Replaces currently selected nodes until event is handled, handler is disposed or another selection replaced event occurs. */
  public onSelectionReplaced({ replacements }: TreeSelectionReplacementEventArgs): Subscription | undefined {
    this._selectionReplaced.next();

    let firstEmission = true;
    return toRxjsObservable(replacements)
      .pipe(
        takeUntil(this._disposed),
        takeUntil(this._selectionReplaced),
      )
      .subscribe({
        next: ({ selectedNodeItems }) => {
          if (firstEmission) {
            firstEmission = false;
            this._modelMutator.replaceSelection(selectedNodeItems);
          }

          this._modelMutator.modifySelection(selectedNodeItems, []);
        },
      });
  }

  /** Changes nodes checkbox states. */
  public onCheckboxStateChanged({ stateChanges }: TreeCheckboxStateChangeEventArgs): Subscription | undefined {
    return stateChanges.subscribe((changes) => this._modelMutator.setCheckboxStates(changes));
  }

  /** Activates node editing if editing parameters are supplied and node is editable. */
  public onDelayedNodeClick({ nodeId }: TreeNodeEventArgs) {
    this.activateEditor(nodeId);
  }

  /** Activates node editing if editing parameters are supplied and node is editable. */
  public onNodeEditorActivated({ nodeId }: TreeNodeEventArgs) {
    this.activateEditor(nodeId);
  }

  /** Activates node editing if editing parameters are supplied and node is editable. */
  private activateEditor(nodeId: string) {
    if (this._editingParams === undefined)
      return;

    this._modelMutator.activateEditing(nodeId, this._editingParams.onNodeUpdated);
  }
}
