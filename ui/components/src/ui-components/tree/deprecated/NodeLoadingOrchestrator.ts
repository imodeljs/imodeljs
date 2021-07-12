/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { Observable } from "rxjs/internal/Observable";
import { concat } from "rxjs/internal/observable/concat";
import { ConnectableObservable } from "rxjs/internal/observable/ConnectableObservable";
import { merge } from "rxjs/internal/observable/merge";
import { of } from "rxjs/internal/observable/of";
import { filter } from "rxjs/internal/operators/filter";
import { finalize } from "rxjs/internal/operators/finalize";
import { map } from "rxjs/internal/operators/map";
import { mergeAll } from "rxjs/internal/operators/mergeAll";
import { publish } from "rxjs/internal/operators/publish";
import { share } from "rxjs/internal/operators/share";
import { takeUntil } from "rxjs/internal/operators/takeUntil";
import { takeWhile } from "rxjs/internal/operators/takeWhile";
import { tap } from "rxjs/internal/operators/tap";
import { Subject } from "rxjs/internal/Subject";
import { Subscriber } from "rxjs/internal/Subscriber";
import { TreeNodeItem } from "../TreeDataProvider";
import { BeInspireTree, BeInspireTreeNode, toNode, toNodes } from "./component/BeInspireTree";

/* eslint-disable deprecation/deprecation */

/** @internal
 * @deprecated */
export interface NodeLoadingOrchestratorCallbacks {
  onLoadProgress: (loaded: number, total: number, cancel: () => void) => void;
  onLoadCanceled: () => void;
  onLoadFinished: () => void;
}

/**
 * @internal
 * @deprecated
 * Loads tree nodes for event handling. Makes sure that the order of
 * subscribers that receive loaded nodes is the same as their subscription order.
 */
export class NodeLoadingOrchestrator {
  private _model: BeInspireTree<TreeNodeItem>;
  private _nodeLoadEvents = new Subject<Array<BeInspireTreeNode<TreeNodeItem>>>();
  private _onNodesLoaded: Observable<Array<BeInspireTreeNode<TreeNodeItem>>>;
  private _pendingNodeTracker = new PendingNodeTracker();

  private _callbacks: NodeLoadingOrchestratorCallbacks;

  private _cancelLoading: (v: void) => void;
  private _onLoadingCanceled: Observable<void>;

  private _activeNodeLoads = new Set<Observable<Array<BeInspireTreeNode<TreeNodeItem>>>>();

  constructor(model: BeInspireTree<TreeNodeItem>, callbacks: NodeLoadingOrchestratorCallbacks) {
    this._model = model;
    this._callbacks = callbacks;

    const [cancelLoading, onLoadingCanceled] = makeObservableCallback();
    this._cancelLoading = cancelLoading;
    this._onLoadingCanceled = onLoadingCanceled;

    // Central node load event transmitter, handles global progress notification and cancelation.
    this._onNodesLoaded = new Observable<Array<BeInspireTreeNode<TreeNodeItem>>>(
      // We get here when the `share` operator subscribes
      (subscriber) => {
        // Relay node load events to the subscriber
        const subscription = this._nodeLoadEvents
          .pipe(
            onCancelation(() => {
              if (this._pendingNodeTracker.getNumPendingNodes() === 0) {
                // Progress is normally reported before nodes are loaded. Final tally needs to be reported here.
                this._reportProgress();
                this._callbacks.onLoadFinished();
              } else {
                this._pendingNodeTracker.reset();
                this._callbacks.onLoadCanceled();
              }
            }),
            takeUntil(this._onLoadingCanceled),
          )
          .subscribe(subscriber);

        // Begin loading nodes
        this.requestPendingNodeLoad();

        return () => {
          // We get here when the `share` operator unsubscribes
          this._pendingNodeTracker.reset();
          this._activeNodeLoads.clear();
          subscription.unsubscribe();
        };
      })
      .pipe(
        // Multicasts node load events. Subscribes to the source observable when the
        // first observer subscribes, and unsubscribes after the last observer unsubscribes.
        share(),
      );
  }

  /** Stops all ongoing node preparation operations. */
  public cancelLoading() {
    this._cancelLoading();
  }

  /**
   * Makes sure that all input nodes are loaded.
   * @returns Observable that first emits already loaded input node
   * synchronously (empty array if none) and then the rest as nodes get loaded.
   */
  public prepareNodes(nodes: Array<BeInspireTreeNode<TreeNodeItem>>): Observable<Array<BeInspireTreeNode<TreeNodeItem>>> {
    const [preloadedNodes, nodesToLoad] = NodeLoadingOrchestrator.sortNodesByLoadingState(nodes);

    // If no new nodes need to be loaded, then return immediately
    if (nodesToLoad.empty) {
      return of(preloadedNodes).pipe(makeHot());
    }

    this._pendingNodeTracker.addNodes(nodesToLoad);

    // Observable that emits loaded nodes immediately, then pending nodes once they are loaded
    const observable = concat(
      of(preloadedNodes)
        .pipe(
          tap(this._reportProgress),
          onCancelation(() => {
            // Handle cancelation only if it has not been handled yet
            if (this._pendingNodeTracker.getNumPendingNodes() > 0) {
              this._pendingNodeTracker.reset();
              this._callbacks.onLoadCanceled();
            }
          }),
        ),
      this._onNodesLoaded
        .pipe(
          map((loadedNodes) => loadedNodes.filter((node) => nodesToLoad.delete(NodeKey.for(node)))),
          takeWhile(() => !nodesToLoad.empty, true),
          filter(({ length }) => length > 0),
        ),
    ).pipe(
      // If cancelation occurs before we begin loading nodes, this prevents node loading from starting.
      takeUntil(this._onLoadingCanceled),
      finalize(() => {
        this._activeNodeLoads.delete(observable);
      }),
      makeHot(),
    );

    this._activeNodeLoads.add(observable);
    return observable;
  }

  /**
   * Makes sure that all nodes between and including the input nodes are loaded.
   * Input nodes can be supplied in any order and are assumed to be loaded.
   * @returns Observable that first emits already loaded nodes synchronously
   * (empty array if none) and then the rest as nodes and their children get loaded.
   */
  public prepareNodesBetween(node1: BeInspireTreeNode<TreeNodeItem>, node2: BeInspireTreeNode<TreeNodeItem>): Observable<Array<BeInspireTreeNode<TreeNodeItem>>> {
    const visibleNodesBetween = this._model.getVisibleNodesBetween(node1, node2);
    const [preloadedNodes, nodesToLoadRecursively] = NodeLoadingOrchestrator.sortNodesByLoadingState(visibleNodesBetween);

    // If no new nodes need to be loaded, then return immediately
    if (nodesToLoadRecursively.empty) {
      return of(preloadedNodes).pipe(makeHot());
    }

    this._pendingNodeTracker.addNodesRecursively(nodesToLoadRecursively);

    let nodesBetween: Array<BeInspireTreeNode<TreeNodeItem>> = [];
    const emittedNodes = new NodeSet(preloadedNodes.map((node) => NodeKey.for(node)));
    // Observable that emits loaded nodes immediately, then pending nodes once they are loaded
    const observable = concat(
      of(preloadedNodes)
        .pipe(
          tap(this._reportProgress),
          onCancelation(() => {
            // Handle cancelation only if it has not been handled yet
            if (this._pendingNodeTracker.getNumPendingNodes() > 0) {
              this._pendingNodeTracker.reset();
              this._callbacks.onLoadCanceled();
            }
          }),
        ),
      this._onNodesLoaded
        .pipe(
          tap(() => nodesBetween = this._model.getVisibleNodesBetween(node1, node2)),
          map((loadedNodes) => {
            const nodeSet = new NodeSet(nodesBetween.map((node) => NodeKey.for(node)));
            return loadedNodes.filter((node) => {
              const key = NodeKey.for(node);
              return node.payload && nodeSet.has(key) && !emittedNodes.has(key);
            });
          }),
          tap((loadedNodes) => loadedNodes.forEach((node) => emittedNodes.add(NodeKey.for(node)))),
          takeWhile(
            () => {
              // Take while there are still nodes in between that we have not emitted
              if (emittedNodes.size !== nodesBetween.length) {
                return true;
              }

              // Or while there are still nodes waiting for their child list to load
              return nodesBetween.some((node) => node.expanded() && typeof node.children === "boolean");
            },
            true,
          ),
          filter(({ length }) => length > 0),
        ),
    )
      .pipe(
        // If cancelation occurs before we begin loading nodes, this prevents node loading from starting.
        takeUntil(this._onLoadingCanceled),
        finalize(() => {
          this._activeNodeLoads.delete(observable);
        }),
        makeHot(),
      );

    this._activeNodeLoads.add(observable);
    return observable;
  }

  /**
   * Makes sure that all currently pending nodes get loaded.
   * @returns Observable that emits nodes once they are loaded.
   */
  public preparePendingNodes(): Observable<Array<BeInspireTreeNode<TreeNodeItem>>> {
    const emittedNodes = new NodeSet();
    const activeNodeLoads = Array.from(this._activeNodeLoads);
    return merge(activeNodeLoads)
      .pipe(
        mergeAll(),
        map((loadedNodes) => loadedNodes.filter((node) => !emittedNodes.has(NodeKey.for(node)))),
        tap((loadedNodes) => loadedNodes.forEach((node) => emittedNodes.add(NodeKey.for(node)))),
        filter(({ length }) => length > 0),
      );
  }

  /** Returns observable that emits loaded visible nodes and then completes synchronously. */
  public prepareLoadedNodes(): Observable<Array<BeInspireTreeNode<TreeNodeItem>>> {
    const loadedNodes = NodeLoadingOrchestrator.sortNodesByLoadingState(this._model.visible())[0];
    return of(loadedNodes);
  }

  /** Notifies the consumer about load progress and makes a request to load some pending nodes. */
  private requestPendingNodeLoad() {
    this._reportProgress();

    /** Takes first n values from the input iterable */
    function* take<T>(iterable: Iterable<T>, n: number): IterableIterator<T> {
      const iterator = iterable[Symbol.iterator]();
      for (let i = 0; i < n; ++i) {
        const { done, value } = iterator.next();
        if (value !== undefined || !done) {
          yield value;
        }

        if (done) {
          return;
        }
      }
    }

    const promises = Array.from(take(this._pendingNodeTracker, this._model.props.pageSize!))
      .map(async (node) => this.requestNodeLoad(node));
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    Promise.all(promises).then((loadedNodes) => {
      const collectedLoadedNodes: Array<BeInspireTreeNode<TreeNodeItem>> = [];
      for (const loadedNode of loadedNodes) {
        this._pendingNodeTracker.onNodeLoaded(loadedNode).forEach((node) => collectedLoadedNodes.push(node));
      }

      this._nodeLoadEvents.next(collectedLoadedNodes);
      if (!this._pendingNodeTracker.empty) {
        this.requestPendingNodeLoad();
      }
    });
  }

  private _reportProgress = () => {
    this._callbacks.onLoadProgress(
      this._pendingNodeTracker.getTotalAddedNodes() - this._pendingNodeTracker.getNumPendingNodes(),
      this._pendingNodeTracker.getTotalAddedNodes(),
      () => this.cancelLoading(),
    );
  };

  private async requestNodeLoad(nodeKey: NodeKey): Promise<BeInspireTreeNode<TreeNodeItem>> {
    const parent = nodeKey.parentId ? this._model.node(nodeKey.parentId) : undefined;
    await this._model.requestNodeLoad(parent, nodeKey.childIndex);
    return nodeKey.toNode(this._model);
  }

  /**
   * Sorts input nodes into loaded and pending node groups.
   * @returns A [loadedNodes, pendingNodes] tuple.
   */
  private static sortNodesByLoadingState(nodesToSort: Iterable<BeInspireTreeNode<TreeNodeItem>>): [Array<BeInspireTreeNode<TreeNodeItem>>, NodeSet] {
    const loadedNodes: Array<BeInspireTreeNode<TreeNodeItem>> = [];
    const pendingNodes = new NodeSet();
    for (const node of nodesToSort) {
      if (node.payload) {
        loadedNodes.push(node);
      } else {
        pendingNodes.add(NodeKey.for(node));
      }
    }

    return [loadedNodes, pendingNodes];
  }
}

/**
 * @internal
 * @deprecated
 * Keeps track of which nodes are queued for loading.
 */
export class PendingNodeTracker implements Iterable<NodeKey> {
  /** Nodes that do not yet have payload */
  private _pendingNodes = new NodeSet();
  /** Nodes that do not yet have payload and need their children to be queued for loading too */
  private _pendingNodesRecursive = new NodeSet();

  /** Amount of total unique nodes that were queued for loading */
  private _totalAddedNodes = 0;

  /** Queues input nodes for loading. When node's payload gets loaded, the node is removed from this collection. */
  public addNodes(nodes: Iterable<NodeKey>) {
    const sizeBefore = this._pendingNodes.size;
    for (const node of nodes) {
      if (!this._pendingNodesRecursive.has(node)) {
        this._pendingNodes.add(node);
      }
    }

    this._totalAddedNodes += this._pendingNodes.size - sizeBefore;
  }

  /**
   * Queues input nodes for loading. When node's payload gets loaded, the node
   * is removed and its children are queued recursively.
   */
  public addNodesRecursively(nodes: Iterable<NodeKey>) {
    const sizeBefore = this._pendingNodes.size + this._pendingNodesRecursive.size;
    for (const node of nodes) {
      this._pendingNodes.delete(node);
      this._pendingNodesRecursive.add(node);
    }

    this._totalAddedNodes += this._pendingNodes.size + this._pendingNodesRecursive.size - sizeBefore;
  }

  /**
   * Notifies the tracker that a node got its payload loaded. Queues node's
   * children for loading if the parent is set to load recursively.
   * @returns A list of nodes that have been awaited and got loaded.
   */
  public onNodeLoaded(loadedNode: BeInspireTreeNode<TreeNodeItem>): Array<BeInspireTreeNode<TreeNodeItem>> {
    if (!loadedNode.payload) {
      // Node is not loaded
      return [];
    }

    const nodeKey = NodeKey.for(loadedNode);

    const inPendingNodesRecursive = this._pendingNodesRecursive.delete(nodeKey);
    if (inPendingNodesRecursive) {
      const loadedNodes = [loadedNode];
      this.addChildNodesRecursively(loadedNode).forEach((node) => loadedNodes.push(node));
      return loadedNodes;
    }

    const inPendingNodes = this._pendingNodes.delete(nodeKey);
    if (inPendingNodes) {
      return [loadedNode];
    }

    return [];
  }

  /** Resets the traker's state. */
  public reset() {
    this._pendingNodes.clear();
    this._pendingNodesRecursive.clear();
    this._totalAddedNodes = 0;
  }

  /** Returns the total amount of nodes that were queued for loading. */
  public getTotalAddedNodes(): number {
    return this._totalAddedNodes;
  }

  /**
   * Returns the number of nodes that are currently being awaited, including
   * loaded nodes with pending child lists.
   */
  public getNumPendingNodes(): number {
    return this._pendingNodes.size + this._pendingNodesRecursive.size;
  }

  /** Returns `true` if the tracker has some pending nodes; otherwise `false`. */
  public get empty(): boolean {
    return this._pendingNodes.empty && this._pendingNodesRecursive.empty;
  }

  /**
   * Iterates over nodes that are pending payload load. Does not include loaded
   * nodes with pending child lists.
   */
  public [Symbol.iterator](): IterableIterator<NodeKey> {
    /** Concatenates input iterables */
    // eslint-disable-next-line @typescript-eslint/no-shadow
    function* concat<T>(...iterables: Array<Iterable<T>>) {
      for (const iterable of iterables) {
        for (const value of iterable) {
          yield value;
        }
      }
    }

    return concat(this._pendingNodesRecursive, this._pendingNodes);
  }

  /**
   * Recursively adds children to pending nodes collection.
   * @returns Array of nodes that have their payload loaded and (including `parent`).
   */
  private addChildNodesRecursively(parent: BeInspireTreeNode<TreeNodeItem>) {
    const loadedNodes: Array<BeInspireTreeNode<TreeNodeItem>> = [];
    const parentStack: Array<BeInspireTreeNode<TreeNodeItem>> = [parent];
    while (parentStack.length > 0) {
      const currentParent = parentStack.pop() as BeInspireTreeNode<TreeNodeItem>;
      if (!currentParent.payload) {
        continue;
      }

      if (!currentParent.expanded()) {
        continue;
      }

      const childrenToLoad: NodeKey[] = [];
      for (const child of toNodes<TreeNodeItem>(currentParent.getChildren())) {
        parentStack.push(child);
        if (child.payload) {
          loadedNodes.push(child);
        } else {
          childrenToLoad.push(NodeKey.for(child));
        }
      }

      this.addNodesRecursively(childrenToLoad);
    }

    return loadedNodes;
  }
}

/**
 * @internal
 * @deprecated
 * Node identifier used by [[NodeSet]]
 */
export class NodeKey {
  public parentId: string | undefined;
  public childIndex: number;

  constructor(parentId: string | undefined, childIndex: number) {
    this.parentId = parentId;
    this.childIndex = childIndex;
  }

  /** Retrieves a node from the input tree that is represented by this key. */
  public toNode(tree: BeInspireTree<TreeNodeItem>): BeInspireTreeNode<TreeNodeItem> {
    if (this.parentId) {
      return toNode(tree.node(this.parentId)!.getChildren()[this.childIndex]);
    }

    return tree.nodes()[this.childIndex];
  }

  /** Creates a [[NodeKey]] which represents the input node. */
  public static for(node: BeInspireTreeNode<TreeNodeItem>): NodeKey {
    return new NodeKey(NodeKey.getParentId(node), NodeKey.getChildIndex(node));
  }

  /** Identifies the input node's parent. */
  private static getParentId(node: BeInspireTreeNode<TreeNodeItem>): string | undefined {
    const parentNode = toNode<TreeNodeItem>(node.getParent());
    return parentNode ? parentNode.id! : undefined;
  }

  /** Returns input node index in its parent's child list */
  private static getChildIndex(node: BeInspireTreeNode<TreeNodeItem>): number {
    if (!node.payload) {
      return node.placeholderIndex!;
    }

    return node.context().indexOf(node);
  }
}

/**
 * @internal
 * A set that stores unique nodes of a tree. Nodes are identified by their position in the hierarchy.
 */
export class NodeSet implements Iterable<NodeKey> {
  private _parentToChildToValue = new Map<string | undefined, Set<number>>();

  /** Constructs the set and inserts input nodes */
  constructor(nodes: NodeKey[] = []) {
    nodes.forEach((node) => this.add(node));
  }

  /** Calculates the number of nodes in the set. */
  public get size(): number {
    let size = 0;
    for (const childToValue of this._parentToChildToValue.values()) {
      size += childToValue.size;
    }

    return size;
  }

  /** Checks whether the set is empty */
  public get empty(): boolean {
    return this._parentToChildToValue.size === 0;
  }

  /**
   * Adds a node to the set.
   * @returns `this`.
   */
  public add(node: NodeKey): NodeSet {
    const childToValue = this._parentToChildToValue.get(node.parentId) || new Set<number>();
    childToValue.add(node.childIndex);
    this._parentToChildToValue.set(node.parentId, childToValue);
    return this;
  }

  /**
   * Removes node from the set.
   * @returns `true` if an element in the map existed and has been removed, or `false` if the element does not exist.
   */
  public delete(node: NodeKey): boolean {
    const childToValue = this._parentToChildToValue.get(node.parentId);
    if (!childToValue) {
      return false;
    }

    const deleted = childToValue.delete(node.childIndex);
    if (childToValue.size === 0) {
      this._parentToChildToValue.delete(node.parentId);
    }

    return deleted;
  }

  /** Removes all nodes from the set. */
  public clear() {
    this._parentToChildToValue.clear();
  }

  /** Checks whether the input node is present in the set. */
  public has(node: NodeKey): boolean {
    const childToValue = this._parentToChildToValue.get(node.parentId);
    if (!childToValue) {
      return false;
    }

    return childToValue.has(node.childIndex);
  }

  /**
   * Iterates over each value in the set. Unlike regular `Set`, this class does not preserve element insertion order.
   */
  public [Symbol.iterator](): IterableIterator<NodeKey> {
    const parentToChildToValue = this._parentToChildToValue;
    return (function* () {
      for (const [parentId, children] of parentToChildToValue) {
        for (const childIndex of children) {
          yield new NodeKey(parentId, childIndex);
        }
      }
    })();
  }
}

/**
 * @internal
 * Creates a hot `Observable` that receives values from function invocations.
 * @returns A tuple of `[nextFunc, observable]`.
 */
export function makeObservableCallback<T = void>(): [(value: T) => void, Observable<T>] {
  const subject = new Subject<T>();
  return [subject.next.bind(subject), subject.asObservable()];
}

/**
 * @internal
 * Invokes `onCanceled` callback if error occurs or if the observable is unsubscribed from before having been completed.
 * @returns An `Observable` that emits each value from the input `Observable` and then completes.
 */
export function onCancelation<T>(onCanceled: () => void): (observable: Observable<T>) => Observable<T> {
  return (observable: Observable<T>) => {
    return new Observable((subscriber: Subscriber<T>) => {
      let completed = false;

      const subscription = observable
        .pipe(
          tap({
            complete: () => completed = true,
          }),
        )
        .subscribe(subscriber);

      return () => {
        subscription.unsubscribe();
        if (!completed) {
          onCanceled();
        }
      };
    });
  };
}

function makeHot<T>(): (observable: Observable<T>) => Observable<T> {
  return (observable: Observable<T>) => {
    const connectableObservable = observable.pipe(publish()) as ConnectableObservable<T>;
    return new Observable((subscriber) => {
      const subscription = connectableObservable.subscribe(subscriber);
      connectableObservable.connect();
      return subscription;
    });
  };
}
