/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { Patch, produce } from "immer";
import { BeUiEvent } from "@bentley/bentleyjs-core";
import { MutableTreeModel, TreeModel, VisibleTreeNodes } from "./TreeModel";

/**
 * Data structure that describes changes which happened to the tree model
 * @public
 */
export interface TreeModelChanges {
  addedNodeIds: string[];
  modifiedNodeIds: string[];
  removedNodeIds: string[];
}

/**
 * Controls tree model and visible tree nodes.
 * It is used to modify model and inform when tree model changes.
 * @public
 */
export class TreeModelSource {
  private _visibleNodes?: VisibleTreeNodes;

  /** Event that is emitted every time tree model is changed. */
  public onModelChanged = new BeUiEvent<[TreeModel, TreeModelChanges]>();

  constructor(private _model: MutableTreeModel = new MutableTreeModel()) {
    this.onModelChanged.addListener(() => this._visibleNodes = undefined);
  }

  /**
   * Modifies tree model using provided callback.
   * If changes to tree model is detected then onModelChanged event is emitted.
   */
  public modifyModel(callback: (model: MutableTreeModel) => void): void {
    let changes: TreeModelChanges = { addedNodeIds: [], modifiedNodeIds: [], removedNodeIds: [] };
    const newModel = produce(this._model, (draft: MutableTreeModel) => callback(draft), (patches: Patch[]) => { changes = this.collectModelChanges(patches); });

    if (newModel !== this._model) {
      this._model = newModel;
      this.onModelChanged.emit([this._model, changes]);
    }
  }

  /** Returns tree model. */
  public getModel(): TreeModel { return this._model; }

  /** Computes and returns flat list of visible tree nodes. */
  public getVisibleNodes(): VisibleTreeNodes {
    if (!this._visibleNodes) {
      this._visibleNodes = this._model.computeVisibleNodes();
    }
    return this._visibleNodes;
  }

  private collectModelChanges(modelPatches: Patch[]): TreeModelChanges {
    const addedNodeIds: string[] = [];
    const modifiedNodeIds = new Set<string>();
    const removedNodeIds: string[] = [];
    for (const patch of modelPatches) {
      if (patch.path.length >= 3 && patch.path[0] === "_tree" && patch.path[1] === "_idToNode") {
        const nodeId = patch.path[2] as string;

        if (patch.path.length > 3) {
          // Modification occured somewhere inside a node
          modifiedNodeIds.add(nodeId);
          continue;
        }

        // Modification occured directly on _idToNode object
        switch (patch.op) {
          case "add":
            addedNodeIds.push(nodeId);
            break;

          case "remove":
            removedNodeIds.push(nodeId);
            break;

          case "replace":
            modifiedNodeIds.add(nodeId);
            break;
        }
      }
    }

    return { addedNodeIds, modifiedNodeIds: [...modifiedNodeIds], removedNodeIds };
  }
}
