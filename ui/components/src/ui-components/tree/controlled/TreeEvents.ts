/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { CheckBoxState } from "@bentley/ui-core";
import { TreeNodeItem } from "../TreeDataProvider";
import { Observable, Subscription } from "./Observable";

/**
 * Tree events that can occur while interacting with tree.
 *
 * **Note:** Selection and checkbox state change events payload is an Observable.
 * Observable is a stream of data over time (e.g. in case of selection replaced event
 * it is a stream of selected node items arrays). To access data inside stream `subscribe()` method
 * should be called. This method accepts any subset of 'next', 'error' and 'complete' callbacks.
 * Once subscribe is called observable will start emitting data and calls 'next' callback each time new
 * data is emitted. If some selected nodes are not loaded yet they will be loaded and observable will
 * emit loaded node items. When all selected node items are emitted observable completes and calls
 * 'complete' callback if supplied.
 *
 * @public
 */
export interface TreeEvents {
  /** Called when tree node is expanded. */
  onNodeExpanded?(event: TreeNodeEventArgs): void;
  /** Called when tree node is collapsed. */
  onNodeCollapsed?(event: TreeNodeEventArgs): void;

  /** Called when selected tree node is clicked. */
  onDelayedNodeClick?(event: TreeNodeEventArgs): void;
  /** Called when selected tree node editor is activated. */
  onNodeEditorActivated?(event: TreeNodeEventArgs): void;

  /**
   * Called when tree selection is modified.
   * If Subscription is returned it can be used to stop event handling by calling `unsubscribe()`.
   */
  onSelectionModified?(event: TreeSelectionModificationEventArgs): Subscription | undefined;
  /**
   * Called when tree selection is replaced.
   * If Subscription is returned it can be used to stop event handling by calling `unsubscribe()`.
   */
  onSelectionReplaced?(event: TreeSelectionReplacementEventArgs): Subscription | undefined;

  /**
   * Called when checkbox states for nodes are changed.
   * If Subscription is returned it can be used to stop event handling by calling `unsubscribe()`.
   */
  onCheckboxStateChanged?(event: TreeCheckboxStateChangeEventArgs): Subscription | undefined;
}

/**
 * Data structure that describes tree node event payload.
 * @public
 */
export interface TreeNodeEventArgs {
  /** Id of node that is affected by event. */
  nodeId: string;
}

/**
 * Data structure that describes tree selection modification event payload.
 * @public
 */
export interface TreeSelectionModificationEventArgs {
  /**
   * An observable that emits tree selection changes.
   * It starts emitting values when '.subscribe()' is called.
   */
  modifications: Observable<TreeSelectionChange>;
}

/**
 * Data structure that describes tree selection change.
 * @public
 */
export interface TreeSelectionChange {
  /** Tree node items that where selected. */
  selectedNodeItems: TreeNodeItem[];
  /** Tree node items that where deselected. */
  deselectedNodeItems: TreeNodeItem[];
}

/**
 * Data structure that describes tree selection replacement event payload.
 * @public
 */
export interface TreeSelectionReplacementEventArgs {
  /**
   * An observable that emits tree selection replacements containing selected tree node items.
   * It starts emitting values when '.subscribe()' is called.
   */
  replacements: Observable<{ selectedNodeItems: TreeNodeItem[] }>;
}

/**
 * Data structure that describes tree checkbox state change event payload.
 * @public
 */
export interface TreeCheckboxStateChangeEventArgs {
  /**
   * An observable that emits checkbox state changes.
   * It starts emitting values when '.subscribe()' is called.
   */
  stateChanges: Observable<CheckboxStateChange[]>;
}

/**
 * Data structure that describes checkbox state change.
 * @public
 */
export interface CheckboxStateChange {
  /** Tree node item that was affected by checkbox state change. */
  nodeItem: TreeNodeItem;
  /** New state of the checkbox. */
  newState: CheckBoxState;
}
