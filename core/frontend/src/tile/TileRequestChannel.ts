/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, PriorityQueue } from "@bentley/bentleyjs-core";
import { TileTreeContentIds } from "@bentley/imodeljs-common";
import { IModelApp } from "../IModelApp";
import { IpcApp } from "../IpcApp";
import { IModelConnection } from "../IModelConnection";
import { IModelTile, Tile, TileRequest } from "./internal";

class TileRequestQueue extends PriorityQueue<TileRequest> {
  public constructor() {
    super((lhs, rhs) => {
      const diff = lhs.tile.tree.loadPriority - rhs.tile.tree.loadPriority;
      return 0 !== diff ? diff : lhs.priority - rhs.priority;
    });
  }
}

/** Statistics regarding the current and cumulative state of one or more [[TileRequestChannel]]s. Useful for monitoring performance and diagnosing problems.
 * @see [[TileRequestChannel.statistics]] for a specific channel's statistics.
 * @see [[TileRequestChannels.statistics]] for statistics from all channels.
 * @see [[TileAdmin.statistics]] for additional statistics.
 * @public
 */
export class TileRequestChannelStatistics {
  /** The number of queued requests that have not yet been dispatched. */
  public numPendingRequests = 0;
  /** The number of requests that have been dispatched but not yet completed. */
  public numActiveRequests = 0;
  /** The number of requests canceled during the most recent update. */
  public numCanceled = 0;
  /** The total number of completed requests during this session. */
  public totalCompletedRequests = 0;
  /** The total number of failed requests during this session. */
  public totalFailedRequests = 0;
  /** The total number of timed-out requests during this session. */
  public totalTimedOutRequests = 0;
  /** The total number of completed requests during this session which produced an empty tile.
   * These tiles also contribute to [[totalCompletedRequests]], but not to [[totalUndisplayableTiles]].
   */
  public totalEmptyTiles = 0;
  /** The total number of completed requests during this session that produced an undisplayable tile.
   * These tiles also contribute to [[totalCompletedRequests]], but not to [[totalEmptyTiles]].
   */
  public totalUndisplayableTiles = 0;
  /** The total number of tiles whose contents were not found in cloud storage cache and therefore resulted in a backend request to generate the tile content. */
  public totalCacheMisses = 0;
  /** The total number of tiles for which content requests were dispatched. */
  public totalDispatchedRequests = 0;
  /** The total number of tiles for which content requests were dispatched and then canceled on the backend before completion. */
  public totalAbortedRequests = 0;

  /** @internal */
  public addTo(stats: TileRequestChannelStatistics): void {
    for (const propName in this) { // eslint-disable-line guard-for-in
      const key = propName as keyof TileRequestChannelStatistics;
      const val = this[key];
      if (typeof val === "number") {
        // This type guard ought to suffice but doesn't.
        assert(typeof stats[key] === "number");
        (stats[key] as number) += val;
      }
    }
  }
}

/** A channel over which requests for tile content can be made. The channel may request content over HTTP, calls to the backend via IPC or RPC, or any other method like generating the content
 * on the frontend. The channel consists of a queue of pending requests and a set of "active" requests (dispatched and awaiting a response). Incoming requests are placed onto the queue. Requests are popped of the queue in order of priority and dispatched, until the maximum number of simultaneously-active requests is reached.
 * The maximum number of active requests depends on the transport mechanism. For HTTP 1.1, browsers impose a limit of 6 simultaneous connections to a given domain, so ideally each unique domain will use its own unique channel with a limit of 6 active requests. Even for requests satisfied entirely by the frontend, imposing a limit is important for throttling the amount of work done at one time, especially because as the user navigates the view, tiles that were previously requested may no longer be of interest and we shouldn't waste resources producing their content.
 * A channel must be registered with [[TileRequestChannels]] and must have a unique name among all registered channels.
 * @see [[TileRequestChannels.getForHttp]] to obtain (and register if not already registered) an HTTP-based channel.
 * @see [[TileAdmin.channels]] for the channels configured for use with the iTwin.js display system.
 * @see [[Tile.channel]] to specify the channel to be used to request a given tile's content.
 * @public
 */
export class TileRequestChannel {
  /** The channel's name. It must be unique among all registered [[TileRequestChannels]]. */
  public readonly name: string;
  private _concurrency: number;
  /** Protected strictly for tests. @internal */
  protected readonly _active = new Set<TileRequest>();
  private _pending = new TileRequestQueue();
  private _previouslyPending = new TileRequestQueue();
  protected _statistics = new TileRequestChannelStatistics();

  /** Create a new channel.
   * @param name The unique name of the channel.
   * @param concurrency The maximum number of requests that can be dispatched and awaiting a response at any given time. Requests beyond this maximum are enqueued for deferred dispatch.
   * @see [[TileRequestChannels.getForHttp]] to create an HTTP-based channel.
   */
  public constructor(name: string, concurrency: number) {
    this.name = name;
    this._concurrency = concurrency;
  }

  /** The maximum number of active requests. This is generally only modified for debugging purposes.
   * @note When reducing `concurrency`, the number of active requests ([[numActive]]) will only decrease to the new value after a sufficient number of dispatched requests are resolved.
   */
  public get concurrency(): number {
    return this._concurrency;
  }
  public set concurrency(max: number) {
    this._concurrency = max;
  }

  /** The number of requests that have been dispatched and are awaiting a response. */
  public get numActive(): number {
    return this._active.size;
  }

  /** The number of requests that have been enqueued for later dispatch. */
  public get numPending(): number {
    return this._pending.length;
  }

  /** The total number of requests in this channel, whether dispatched or enqueued. */
  public get size(): number {
    return this.numActive + this.numPending;
  }

  /** Statistics intended primarily for debugging. */
  public get statistics(): Readonly<TileRequestChannelStatistics> {
    this._statistics.numPendingRequests = this.numPending;
    this._statistics.numActiveRequests = this.numActive;
    return this._statistics;
  }

  /** Reset all of this channel's [[statistics]] to zero. */
  public resetStatistics(): void {
    this._statistics = new TileRequestChannelStatistics();
  }

  /** Invoked by [[TileRequest]] when a request times out.
   * @internal
   */
  public recordTimeout(): void {
    ++this._statistics.totalTimedOutRequests;
  }

  /** Invoked by [[TileRequest]] when a request fails to produce a response.
   * @internal
   */
  public recordFailure(): void {
    ++this._statistics.totalFailedRequests;
  }

  /** Invoked by [[TileRequest]] after a request completes.
   * @internal
   */
  public recordCompletion(tile: Tile): void {
    ++this._statistics.totalCompletedRequests;
    if (tile.isEmpty)
      ++this._statistics.totalEmptyTiles;
    else if (!tile.isDisplayable)
      ++this._statistics.totalUndisplayableTiles;
  }

  /** Invoked by [[TileRequestChannels.swapPending]] when [[TileAdmin]] is about to start enqueuing new requests.
   * @internal
   */
  public swapPending(): void {
    const previouslyPending = this._pending;
    this._pending = this._previouslyPending;
    this._previouslyPending = previouslyPending;
  }

  /** Invoked by [[TileAdmin.processRequests]] to enqueue a request. Ordering is ignored - the queue will be re-sorted later.
   * @internal
   */
  public append(request: TileRequest): void {
    assert(request.channel === this);
    this._pending.append(request);
  }

  /** Invoked by [[TileRequestChannels.process]] to process the active and pending requests.
   * @internal
   */
  public process(): void {
    this._statistics.numCanceled = 0;

    // Recompute priority of each request.
    for (const pending of this._pending)
      pending.priority = pending.tile.computeLoadPriority(pending.viewports);

    // Sort pending requests by priority.
    this._pending.sort();

    // Cancel any previously pending requests that are no longer needed.
    for (const queued of this._previouslyPending)
      if (queued.viewports.isEmpty)
        this.cancel(queued);

    this._previouslyPending.clear();

    // Cancel any active requests that are no longer needed.
    // NB: Do NOT remove them from the active set until their http activity has completed.
    for (const active of this._active)
      if (active.viewports.isEmpty)
        this.cancel(active);

    // Batch-cancel running requests.
    this.processCancellations();

    // Dispatch requests from the queue up to our maximum.
    while (this._active.size < this._concurrency) {
      const request = this._pending.pop();
      if (!request)
        break;

      this.dispatch(request);
    }
  }

  /** Cancel all active and queued requests and clear the active set and queue.
   * @internal
   */
  public cancelAndClearAll(): void {
    for (const active of this._active)
      active.cancel();

    for (const queued of this._pending)
      queued.cancel();

    this._active.clear();
    this._pending.clear();
  }

  /** Invoked when [[Tile.requestContent]] returns `undefined`. Return true if the request can be retried, e.g., via different channel.
   * If so, the tile will remain marked as "not loaded" and, if re-selected for display, a new [[TileRequest]] will be enqueued for it.
   * Otherwise, the tile will be marked as "failed to load" and no further requests will be made for its content.
   * The default implementation always returns `false`.
   */
  public onNoContent(_request: TileRequest): boolean {
    return false;
  }

  /** Invoked when a request that was previously dispatched is canceled before a response is received.
   * Some channels accumulate such requests for later cancellation in [[processCancellations]].
   */
  public onActiveRequestCanceled(_request: TileRequest): void { }

  /** Invoked to do any additional work to cancel tiles accumulated by [[onActiveRequestCanceled]]. For example, a channel that requests tile content
   * over IPC may signal to the tile generation process that it should cease generating content for those tiles.
   */
  public processCancellations(): void { }

  /** Invoked when an iModel is closed, to clean up any state associated with that iModel. */
  public onIModelClosed(_iModel: IModelConnection): void { }

  /** Request content for the specified tile. The default implementation simply forwards to [[Tile.requestContent]]. */
  public async requestContent(tile: Tile, isCanceled: () => boolean): Promise<TileRequest.Response> {
    return tile.requestContent(isCanceled);
  }

  /** Protected only for tests - do not override.
   * @internal
   */
  protected dispatch(request: TileRequest): void {
    ++this._statistics.totalDispatchedRequests;
    this._active.add(request);
    request.dispatch(() => {
      this.dropActiveRequest(request);
    }).catch((_) => {
      //
    });
  }

  /** Protected only for tests - do not override.
   * @internal
   */
  protected cancel(request: TileRequest): void {
    request.cancel();
    ++this._statistics.numCanceled;
  }

  /** Protected only for tests - do not override.
   * @internal
   */
  protected dropActiveRequest(request: TileRequest): void {
    assert(this._active.has(request) || request.isCanceled);
    this._active.delete(request);
  }
}

/** Handles requests to the cloud storage tile cache, if one is configured. If a tile's content is not found in the cache, subsequent requests for the same tile will
 * use the IModelTileChannel instead.
 */
class CloudStorageCacheChannel extends TileRequestChannel {
  public override async requestContent(tile: Tile): Promise<TileRequest.Response> {
    assert(tile instanceof IModelTile);
    return IModelApp.tileAdmin.requestCachedTileContent(tile);
  }

  public override onNoContent(request: TileRequest): boolean {
    assert(request.tile instanceof IModelTile);
    request.tile.cacheMiss = true;
    ++this._statistics.totalCacheMisses;
    return true;
  }
}

/** For an [[IpcApp]], allows backend tile generation requests in progress to be canceled. */
class IModelTileChannel extends TileRequestChannel {
  private readonly _canceled = new Map<IModelConnection, Map<string, Set<string>>>();

  public override onActiveRequestCanceled(request: TileRequest): void {
    const tree = request.tile.tree;
    let entry = this._canceled.get(tree.iModel);
    if (!entry)
      this._canceled.set(tree.iModel, entry = new Map<string, Set<string>>());

    let ids = entry.get(tree.id);
    if (!ids)
      entry.set(tree.id, ids = new Set<string>());

    ids.add(request.tile.contentId);
  }

  public override processCancellations(): void {
    for (const [imodel, entries] of this._canceled) {
      const treeContentIds: TileTreeContentIds[] = [];
      for (const [treeId, tileIds] of entries) {
        const contentIds = Array.from(tileIds);
        treeContentIds.push({ treeId, contentIds });
        this._statistics.totalAbortedRequests += contentIds.length;
      }

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      IpcApp.callIpcHost("cancelTileContentRequests", imodel.getRpcProps(), treeContentIds);
    }

    this._canceled.clear();
  }

  public override onIModelClosed(imodel: IModelConnection): void {
    this._canceled.delete(imodel);
  }
}

/** For an [[IpcApp]], allows backend element graphics requests in progress to be canceled. */
class ElementGraphicsChannel extends TileRequestChannel {
  private readonly _canceled = new Map<IModelConnection, string[]>();

  public override onActiveRequestCanceled(request: TileRequest): void {
    const imodel = request.tile.tree.iModel;
    let ids = this._canceled.get(imodel);
    if (!ids)
      this._canceled.set(imodel, ids = []);

    ids.push(request.tile.contentId);
  }

  public override processCancellations(): void {
    for (const [imodel, requestIds] of this._canceled) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      IpcApp.callIpcHost("cancelElementGraphicsRequests", imodel.key, requestIds);
      this._statistics.totalAbortedRequests += requestIds.length;
    }

    this._canceled.clear();
  }

  public override onIModelClosed(imodel: IModelConnection): void {
    this._canceled.delete(imodel);
  }
}

/** A set of named [[TileRequestChannel]]s via which content for [[Tile]]s can be requested.
 * @see [[TileAdmin.channels]] for the channels configured for use with the iTwin.js display system.
 * @see [[TileRequestChannels.getForHttp]] for the most typical way of obtaining or registering a channel.
 * @public
 */
export class TileRequestChannels {
  private _cloudStorageCache?: TileRequestChannel;
  /** @internal */
  public readonly iModelTileRpc: TileRequestChannel;
  /** The channel over which [[TileAdmin.requestElementGraphics]] executes. If you implement a [[TiledGraphicsProvider]] or [[TileTree]] that obtains its
   * content from `requestElementGraphics`, use this channel.
   */
  public readonly elementGraphicsRpc: TileRequestChannel;
  /** The maximum number of active requests for a channel that uses HTTP to request content. */
  public readonly httpConcurrency = 6;
  private _rpcConcurrency: number;
  private readonly _channels = new Map<string, TileRequestChannel>();

  /** `rpcConcurrency` is defined if [[IpcApp.isValid]]; otherwise RPC requests are made over HTTP and use the same limits.
   * @internal
   */
  public constructor(rpcConcurrency: number | undefined) {
    this._rpcConcurrency = rpcConcurrency ?? this.httpConcurrency;

    const imodelChannelName = "itwinjs-tile-rpc";
    const elementGraphicsChannelName = "itwinjs-elem-rpc";
    if (undefined !== rpcConcurrency) {
      // RPC uses IPC so it should be throttled based on the concurrency supported by the backend process.
      // IPC means "single user" so we can also cancel requests in progress on the backend.
      this.iModelTileRpc = new IModelTileChannel(imodelChannelName, rpcConcurrency);
      this.elementGraphicsRpc = new ElementGraphicsChannel(elementGraphicsChannelName, rpcConcurrency);
    } else {
      // RPC uses HTTP so it should be throttled based on HTTP limits.
      // HTTP means "multiple users" so we cannot cancel requests in progress on the backend.
      this.iModelTileRpc = new TileRequestChannel(imodelChannelName, this.rpcConcurrency);
      this.elementGraphicsRpc = new TileRequestChannel(elementGraphicsChannelName, this.rpcConcurrency);
    }

    this.add(this.iModelTileRpc);
    this.add(this.elementGraphicsRpc);
  }

  /** If a cloud storage tile cache is configured, [[IModelTile]]s first request their content via this channel.
   * @internal
   */
  public get cloudStorageCache(): TileRequestChannel | undefined {
    return this._cloudStorageCache;
  }

  /** Lazily called by [[TileAdmin]] once it can determine whether a cloud storage cache is configured.
   * @internal
   */
  public enableCloudStorageCache(): void {
    assert(undefined === this._cloudStorageCache);
    if (!this._cloudStorageCache)
      this.add(this._cloudStorageCache = new CloudStorageCacheChannel("itwinjs-cloud-cache", this.httpConcurrency));
  }

  /** The number of registered channels. */
  public get size(): number {
    return this._channels.size;
  }

  /** Look up a registered channel by its name. */
  public get(name: string): TileRequestChannel | undefined {
    return this._channels.get(name);
  }

  /** Return whether the specified channel has been registered. Primarily for debugging. */
  public has(channel: TileRequestChannel): boolean {
    const existing = this.get(channel.name);
    return existing !== undefined && existing === channel;
  }

  /** Add a new channel.
   * @throws Error if a channel by the same name has already been registered.
   */
  public add(channel: TileRequestChannel): void {
    if (this.get(channel.name))
      throw new Error(`Tile request channel ${channel.name} is already registered.`);

    this._channels.set(channel.name, channel);
  }

  /** Extract the host name from a URL for use as the name of the corresponding [[TileRequestChannel]].
   * @throws TypeError if `url` is a string and does not represent a valid URL.
   * @see [[getForHttp]] to obtain or register a channel for the host name.
   */
  public static getNameFromUrl(url: URL | string): string {
    if (typeof url === "string")
      url = new URL(url);

    return url.hostname;
  }

  /** Obtain a channel that requests content over HTTP using HTTP 1.1 limits on simultaneous connections.
   * If a channel with the specified name does not already exist, it will be created and registered.
   * @see [[getNameFromUrl]] to obtain a channel name corresponding to a hostname.
   */
  public getForHttp(name: string): TileRequestChannel {
    let channel = this.get(name);
    if (!channel)
      this.add(channel = new TileRequestChannel(name, this.httpConcurrency));

    return channel;
  }

  /** Iterator over all of the channels. */
  public [Symbol.iterator](): Iterator<TileRequestChannel> {
    return this._channels.values()[Symbol.iterator]();
  }

  /** The maximum number of active requests for a channel that uses an RpcInterface to satisfy its requests.
   * For web-based applications, this is the same as [[httpConcurrency]], but for [[IpcApp]]s it is determined by the number of workers threads allocated by the backend.
   */
  public get rpcConcurrency(): number {
    return this._rpcConcurrency;
  }

  /** Chiefly for debugging.
   * @internal
   */
  public setRpcConcurrency(concurrency: number): void {
    this._rpcConcurrency = concurrency;
    this.iModelTileRpc.concurrency = concurrency;
    this.elementGraphicsRpc.concurrency = concurrency;
  }

  /** Statistics intended primarily for debugging. */
  public get statistics(): TileRequestChannelStatistics {
    const stats = new TileRequestChannelStatistics();
    for (const channel of this)
      channel.statistics.addTo(stats);

    return stats;
  }

  /** Reset all [[statistics]] to zero. */
  public resetStatistics(): void {
    for (const channel of this)
      channel.resetStatistics();
  }

  /** Invoked by [[TileAdmin.processQueue]] when it is about to start enqueuing new requests.
   * @internal
   */
  public swapPending(): void {
    for (const channel of this)
      channel.swapPending();
  }

  /** Invoked by [[TileAdmin.processQueue]] when it is about to start enqueuing new requests.
   * @internal
   */
  public process(): void {
    for (const channel of this)
      channel.process();
  }

  /** Invoked by [[TileAdmin.onIModelClosed]].
   * @internal
   */
  public onIModelClosed(iModel: IModelConnection): void {
    for (const channel of this)
      channel.onIModelClosed(iModel);
  }

  /** Invoked by [[TileAdmin.onShutDown]].
   * @internal
   */
  public onShutDown(): void {
    for (const channel of this)
      channel.cancelAndClearAll();

    this._channels.clear();
  }
}
