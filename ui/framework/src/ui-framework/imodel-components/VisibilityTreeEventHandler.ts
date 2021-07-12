/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IModelComponents
 */

import { EMPTY } from "rxjs/internal/observable/empty";
import { from } from "rxjs/internal/observable/from";
import { map } from "rxjs/internal/operators/map";
import { mergeMap } from "rxjs/internal/operators/mergeMap";
import { BeEvent, IDisposable } from "@bentley/bentleyjs-core";
import { NodeKey } from "@bentley/presentation-common";
import { UnifiedSelectionTreeEventHandler, UnifiedSelectionTreeEventHandlerParams } from "@bentley/presentation-components";
import {
  CheckBoxInfo, CheckboxStateChange, toRxjsObservable, TreeCheckboxStateChangeEventArgs, TreeModelNode, TreeNodeItem,
  TreeSelectionModificationEventArgs, TreeSelectionReplacementEventArgs,
} from "@bentley/ui-components";
import { CheckBoxState, isPromiseLike } from "@bentley/ui-core";

/**
 * Data structure that describes instance visibility status.
 * @alpha
 */
export interface VisibilityStatus {
  state: "visible" | "partial" | "hidden";
  isDisabled?: boolean;
  tooltip?: string;
}

/**
 * Type definition of visibility change event listener.
 * @alpha
 */
export type VisibilityChangeListener = (nodeIds?: string[], visibilityStatus?: Map<string, VisibilityStatus>) => void;

/**
 * Visibility handler used to change or get visibility of instances represented by the tree node.
 * @alpha
 */
export interface IVisibilityHandler extends IDisposable {
  getVisibilityStatus(node: TreeNodeItem, nodeKey: NodeKey): VisibilityStatus | Promise<VisibilityStatus>;
  changeVisibility(node: TreeNodeItem, nodeKey: NodeKey, shouldDisplay: boolean): Promise<void>;
  onVisibilityChange: BeEvent<VisibilityChangeListener>;
}

/**
 * Type definition of predicate used to decide if node can be selected.
 * @alpha
 */
export type VisibilityTreeSelectionPredicate = (key: NodeKey, node: TreeNodeItem) => boolean;

/**
 * Parameters for [[VisibilityTreeEventHandler]]
 * @alpha
 */
export interface VisibilityTreeEventHandlerParams extends UnifiedSelectionTreeEventHandlerParams {
  visibilityHandler: IVisibilityHandler | undefined;
  selectionPredicate?: VisibilityTreeSelectionPredicate;
}

/**
 * Base event handler for visibility tree.
 * @alpha
 */
export class VisibilityTreeEventHandler extends UnifiedSelectionTreeEventHandler {
  private _visibilityHandler: IVisibilityHandler | undefined;
  private _selectionPredicate?: VisibilityTreeSelectionPredicate;
  private _listeners = new Array<() => void>();

  constructor(params: VisibilityTreeEventHandlerParams) {
    super(params);
    this._visibilityHandler = params.visibilityHandler;
    this._selectionPredicate = params.selectionPredicate;

    if (this._visibilityHandler) {
      this._listeners.push(this._visibilityHandler.onVisibilityChange.addListener(async (nodeIds, visibilityStatus) => this.updateCheckboxes(nodeIds, visibilityStatus)));
    }

    this._listeners.push(this.modelSource.onModelChanged.addListener(async ([_, changes]) => this.updateCheckboxes([...changes.addedNodeIds, ...changes.modifiedNodeIds])));
    this.updateCheckboxes(); // eslint-disable-line @typescript-eslint/no-floating-promises
  }

  public override dispose() {
    super.dispose();
    this._listeners.forEach((disposeFunc) => disposeFunc());
  }

  private filterSelectionItems(items: TreeNodeItem[]) {
    // istanbul ignore if
    if (!this._selectionPredicate)
      return items;

    return items.filter((item) => this._selectionPredicate!(this.getNodeKey(item), item));
  }

  public override onSelectionModified({ modifications }: TreeSelectionModificationEventArgs) {
    const filteredModification = toRxjsObservable(modifications).pipe(
      map(({ selectedNodeItems, deselectedNodeItems }) => {
        return {
          selectedNodeItems: this.filterSelectionItems(selectedNodeItems),
          deselectedNodeItems: this.filterSelectionItems(deselectedNodeItems),
        };
      }),
    );
    return super.onSelectionModified({ modifications: filteredModification });
  }

  public override onSelectionReplaced({ replacements }: TreeSelectionReplacementEventArgs) {
    const filteredReplacements = toRxjsObservable(replacements).pipe(
      map(({ selectedNodeItems }) => {
        return {
          selectedNodeItems: this.filterSelectionItems(selectedNodeItems),
        };
      }),
    );
    return super.onSelectionReplaced({ replacements: filteredReplacements });
  }

  public override onCheckboxStateChanged(event: TreeCheckboxStateChangeEventArgs) {
    // istanbul ignore if
    if (!this._visibilityHandler)
      return undefined;

    from(event.stateChanges)
      .pipe(
        mergeMap((changes) => this.changeVisibility(changes)),
      )
      .subscribe();
    return undefined;
  }

  private changeVisibility(changes: CheckboxStateChange[]) {
    return from(changes)
      .pipe(
        mergeMap(({ nodeItem, newState }) => {
          // istanbul ignore if
          if (!this._visibilityHandler)
            return EMPTY;
          return from(this._visibilityHandler.changeVisibility(nodeItem, this.getNodeKey(nodeItem), newState === CheckBoxState.On));
        }),
      );
  }

  private async updateCheckboxes(affectedNodes?: string[], visibilityStatus?: Map<string, VisibilityStatus>) {
    const changes = await (affectedNodes ? this.collectAffectedNodesCheckboxInfos(affectedNodes, visibilityStatus) : this.collectAllNodesCheckboxInfos(visibilityStatus));
    this.updateModel(changes);
  }

  private updateModel(changes: Map<string, CheckBoxInfo>) {
    this.modelSource.modifyModel((model) => {
      for (const [nodeId, checkboxInfo] of changes) {
        const node = model.getNode(nodeId);
        // istanbul ignore if
        if (!node)
          continue;

        node.checkbox.isDisabled = checkboxInfo.isDisabled;
        node.checkbox.isVisible = checkboxInfo.isVisible;
        node.checkbox.state = checkboxInfo.state;
        node.checkbox.tooltip = checkboxInfo.tooltip;
      }
    });
  }

  private async collectAffectedNodesCheckboxInfos(affectedNodes: string[], visibilityStatus?: Map<string, VisibilityStatus>) {
    const nodeStates = new Map<string, CheckBoxInfo>();
    if (affectedNodes.length === 0)
      return nodeStates;

    for (const nodeId of affectedNodes) {
      const node = this.modelSource.getModel().getNode(nodeId);
      // istanbul ignore if
      if (!node)
        continue;

      nodeStates.set(nodeId, await this.getNodeCheckBoxInfo(node, visibilityStatus));
    }
    return nodeStates;
  }

  private async collectAllNodesCheckboxInfos(visibilityStatus?: Map<string, VisibilityStatus>) {
    const nodeStates = new Map<string, CheckBoxInfo>();
    for (const node of this.modelSource.getModel().iterateTreeModelNodes()) {
      nodeStates.set(node.id, await this.getNodeCheckBoxInfo(node, visibilityStatus));
    }
    return nodeStates;
  }

  private async getNodeCheckBoxInfo(node: TreeModelNode, visibilityStatus?: Map<string, VisibilityStatus>): Promise<CheckBoxInfo> {
    if (!this._visibilityHandler)
      return { ...node.checkbox, isVisible: false };

    const result = visibilityStatus?.get(node.id) ?? this._visibilityHandler.getVisibilityStatus(node.item, this.getNodeKey(node.item));

    if (isPromiseLike(result))
      return this.createCheckboxInfo(await result);
    return this.createCheckboxInfo(result);
  }

  private createCheckboxInfo(status: VisibilityStatus): CheckBoxInfo {
    return {
      state: visibilityStateToCheckboxState(status),
      isDisabled: status.isDisabled || false,
      isVisible: true,
      tooltip: status.tooltip,
    };
  }
}

const visibilityStateToCheckboxState = (status: VisibilityStatus) => {
  switch (status.state) {
    case "visible":
      return CheckBoxState.On;
    // istanbul ignore next
    case "partial":
      return CheckBoxState.Partial;
    case "hidden":
    default:
      return CheckBoxState.Off;
  }
};
