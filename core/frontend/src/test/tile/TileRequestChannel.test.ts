/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { BeDuration } from "@bentley/bentleyjs-core";
import { Range3d, Transform } from "@bentley/geometry-core";
import { ServerTimeoutError, ViewFlagOverrides } from "@bentley/imodeljs-common";
import { IModelApp } from "../../IModelApp";
import { IModelConnection } from "../../IModelConnection";
import { MockRender } from "../../render/MockRender";
import {
  Tile, TileContent, TileLoadPriority, TileLoadStatus, TileRequest, TileRequestChannel, TileRequestChannelStatistics, TileTree,
} from "../../tile/internal";
import { Viewport } from "../../Viewport";
import { createBlankConnection } from "../createBlankConnection";

async function runMicroTasks(): Promise<void> {
  return BeDuration.wait(1);
}

class TestTile extends Tile {
  public priority;
  public requestChannel: LoggingChannel;
  public requestContentCalled = false;
  public readContentCalled = false;
  private _resolveRequest?: (response: TileRequest.Response) => void;
  private _rejectRequest?: (error: Error) => void;
  private _resolveRead?: (content: TileContent) => void;
  private _rejectRead?: (error: Error) => void;
  public empty?: boolean;
  public displayable?: boolean;

  public constructor(tree: TestTree, channel: LoggingChannel, priority = 0) {
    super({
      contentId: priority.toString(),
      range: new Range3d(0, 0, 0, 1, 1, 1),
      maximumSize: 42,
    }, tree);

    this.requestChannel = channel;
    this.priority = priority;
  }

  public expectStatus(expected: TileLoadStatus) {
    expect(this.loadStatus).to.equal(expected);
  }

  public get awaitingRequest() {
    return undefined !== this._resolveRequest;
  }

  public get awaitingRead() {
    return undefined !== this._resolveRead;
  }

  public get isActive() {
    return this.channel.isActive(this);
  }

  public get isDisplayable(): boolean {
    return this.displayable ?? super.isDisplayable;
  }

  public get isEmpty(): boolean {
    return this.empty ?? super.isEmpty;
  }

  protected _loadChildren(resolve: (children: Tile[] | undefined) => void): void {
    resolve(undefined);
  }

  public get channel() {
    return this.requestChannel;
  }

  public computeLoadPriority() {
    return this.priority;
  }

  public async requestContent(): Promise<TileRequest.Response> {
    this.requestContentCalled = true;
    expect(this._resolveRequest).to.be.undefined;
    expect(this._rejectRequest).to.be.undefined;
    return new Promise((resolve, reject) => {
      this._resolveRequest = resolve;
      this._rejectRequest = reject;
    });
  }

  public async readContent(): Promise<TileContent> {
    this.readContentCalled = true;
    expect(this._resolveRead).to.be.undefined;
    expect(this._rejectRead).to.be.undefined;
    return new Promise((resolve, reject) => {
      this._resolveRead = resolve;
      this._rejectRead = reject;
    });
  }

  public resolveRequest(response: TileRequest.Response | "undefined" = new Uint8Array(1)): void {
    if ("undefined" === response)
      response = undefined; // passing `undefined` to resolveRequest uses the default arg instead...

    expect(this._resolveRequest).not.to.be.undefined;
    this._resolveRequest!(response);
    this.clearPromises();
  }

  public rejectRequest(error: Error = new Error("requestContent")): void {
    expect(this._rejectRequest).not.to.be.undefined;
    this._rejectRequest!(error);
    this.clearPromises();
  }

  public resolveRead(content: TileContent = { }): void {
    expect(this._resolveRead).not.to.be.undefined;
    this._resolveRead!(content);
    this.clearPromises();
  }

  public async resolveBoth(): Promise<void> {
    this.resolveRequest();
    await runMicroTasks();
    this.resolveRead();
    await runMicroTasks();
  }

  public rejectRead(error: Error = new Error("readContent")): void {
    expect(this._rejectRead).not.to.be.undefined;
    this._rejectRead!(error);
    this.clearPromises();
  }

  private clearPromises(): void {
    this._resolveRequest = undefined;
    this._rejectRequest = undefined;
    this._resolveRead = undefined;
    this._rejectRead = undefined;
  }
}

class TestTree extends TileTree {
  private readonly _rootTile: TestTile;

  public constructor(iModel: IModelConnection, channel: LoggingChannel, priority = TileLoadPriority.Primary) {
    super({
      iModel,
      id: "test",
      modelId: "0",
      location: Transform.createIdentity(),
      priority,
    });

    this._rootTile = new TestTile(this, channel);
  }

  public get rootTile(): TestTile { return this._rootTile; }
  public get is3d() { return true; }
  public get maxDepth() { return undefined; }
  public get viewFlagOverrides() { return new ViewFlagOverrides(); }
  protected _selectTiles(): Tile[] { return []; }
  public draw() { }
  public prune() { }
}

function mockViewport(iModel: IModelConnection, viewportId = 1): Viewport {
  return {
    viewportId,
    iModel,
    invalidateScene: () => { },
  } as Viewport;
}

function requestTiles(vp: Viewport, tiles: TestTile[]): void {
  IModelApp.tileAdmin.clearTilesForViewport(vp);
  IModelApp.tileAdmin.clearUsageForViewport(vp);
  IModelApp.tileAdmin.requestTiles(vp, new Set<Tile>(tiles));
}

async function processOnce(): Promise<void> {
  IModelApp.tileAdmin.process();
  return runMicroTasks();
}

class LoggingChannel extends TileRequestChannel {
  public readonly calledFunctions: string[] = [];

  public constructor(maxActive: number, name = "test") {
    super(name, maxActive);
    IModelApp.tileAdmin.channels.add(this);
  }

  protected log(functionName: string) {
    this.calledFunctions.push(functionName);
  }

  public clear() {
    this.calledFunctions.length = 0;
  }

  public expect(functionNames: string[]) {
    expect(this.calledFunctions).to.deep.equal(functionNames);
  }

  public expectRequests(active: number, pending: number) {
    expect(this.numActive).to.equal(active);
    expect(this.numPending).to.equal(pending);
  }

  public get active(): Set<TileRequest> {
    return this._active;
  }

  public isActive(tile: Tile): boolean {
    for (const active of this.active)
      if (active.tile === tile)
        return true;

    return false;
  }

  public recordCompletion(tile: Tile): void {
    this.log("recordCompletion");
    super.recordCompletion(tile);
  }

  public recordTimeout() {
    this.log("recordTimeout");
    super.recordTimeout();
  }

  public recordFailure() {
    this.log("recordFailure");
    super.recordFailure();
  }

  public swapPending() {
    this.log("swapPending");
    super.swapPending();
  }

  public append(request: TileRequest) {
    this.log("append");
    super.append(request);
  }

  public process() {
    this.log("process");
    super.process();
  }

  protected dispatch(request: TileRequest) {
    this.log("dispatch");
    super.dispatch(request);
  }

  public cancelAndClearAll() {
    this.log("cancelAndClearAll");
    super.cancelAndClearAll();
  }

  public onNoContent(request: TileRequest): boolean {
    this.log("onNoContent");
    return super.onNoContent(request);
  }

  public onActiveRequestCanceled(request: TileRequest): void {
    this.log("onActiveRequestCanceled");
    super.onActiveRequestCanceled(request);
  }

  public onIModelClosed(iModel: IModelConnection) {
    this.log("onIModelClosed");
    super.onIModelClosed(iModel);
  }

  protected dropActiveRequest(request: TileRequest) {
    this.log("dropActiveRequest");
    super.dropActiveRequest(request);
  }

  protected cancel(request: TileRequest) {
    this.log("cancel");
    super.cancel(request);
  }

  public async requestContent(tile: Tile, isCanceled: () => boolean): Promise<TileRequest.Response> {
    this.log("requestContent");
    return super.requestContent(tile, isCanceled);
  }

  public processCancellations() {
    this.log("processCancellations");
    super.processCancellations();
  }
}

describe("TileRequestChannel", () => {
  let imodel: IModelConnection;

  beforeEach(async () => {
    await MockRender.App.startup();
    imodel = createBlankConnection();
  });

  afterEach(async () => {
    await imodel.close();
    if (IModelApp.initialized)
      await MockRender.App.shutdown();
  });

  it("completes one request", async () => {
    const channel = new LoggingChannel(1);
    const tree = new TestTree(imodel, channel);
    const vp = mockViewport(imodel);

    tree.rootTile.expectStatus(TileLoadStatus.NotLoaded);
    channel.expectRequests(0, 0);
    requestTiles(vp, [tree.rootTile]);
    tree.rootTile.expectStatus(TileLoadStatus.NotLoaded);
    channel.expectRequests(0, 0);
    channel.expect([]);

    IModelApp.tileAdmin.process();
    tree.rootTile.expectStatus(TileLoadStatus.Queued);
    channel.expect(["swapPending", "append", "process", "processCancellations", "dispatch", "requestContent"]);
    channel.expectRequests(1, 0);

    channel.clear();
    tree.rootTile.resolveRequest();
    await processOnce();
    channel.expect(["swapPending", "process", "processCancellations", "dropActiveRequest"]);
    channel.expectRequests(0, 0);
    tree.rootTile.expectStatus(TileLoadStatus.Loading);

    channel.clear();
    tree.rootTile.resolveRead();
    await processOnce();
    channel.expect(["swapPending", "process", "processCancellations", "recordCompletion"]);
    channel.expectRequests(0, 0);
    tree.rootTile.expectStatus(TileLoadStatus.Ready);
  });

  it("observes limits on max active requests", async () => {
    const channel = new LoggingChannel(2);
    const tree = new TestTree(imodel, channel);
    const tiles = [0, 1, 2, 3, 4].map((x) => new TestTile(tree, channel, x));
    const vp = mockViewport(imodel);

    requestTiles(vp, tiles);
    IModelApp.tileAdmin.process();
    tiles.forEach((x) => x.expectStatus(TileLoadStatus.Queued));
    channel.expectRequests(2, 3);

    tiles[0].resolveRequest();
    await processOnce();
    tiles.forEach((x) => x.expectStatus(x === tiles[0] ? TileLoadStatus.Loading : TileLoadStatus.Queued));
    channel.expectRequests(1, 3);

    tiles[0].resolveRead();
    await processOnce();
    tiles.forEach((x) => x.expectStatus(x === tiles[0] ? TileLoadStatus.Ready : TileLoadStatus.Queued));
    channel.expectRequests(2, 2);

    tiles[1].rejectRequest();
    await processOnce();
    tiles[1].expectStatus(TileLoadStatus.NotFound);
    tiles.slice(2).forEach((x) => x.expectStatus(TileLoadStatus.Queued));
    channel.expectRequests(1, 2);

    tiles.push(new TestTile(tree, channel, 5));
    requestTiles(vp, tiles);
    await processOnce();
    channel.expectRequests(2, 2);

    tiles[2].resolveRequest();
    tiles[3].resolveRequest();
    await processOnce();
    channel.expectRequests(0, 2);
    tiles.slice(2, 4).forEach((x) => x.expectStatus(TileLoadStatus.Loading));
    tiles.slice(4).forEach((x) => x.expectStatus(TileLoadStatus.Queued));

    tiles[2].resolveRead();
    tiles[3].resolveRead();
    await processOnce();
    channel.expectRequests(2, 0);
    tiles.slice(2, 4).forEach((x) => x.expectStatus(TileLoadStatus.Ready));
    tiles.slice(4).forEach((x) => x.expectStatus(TileLoadStatus.Queued));

    tiles[4].rejectRequest();
    tiles[5].rejectRequest();
    await processOnce();
    channel.expectRequests(0, 0);
    tiles.slice(4).forEach((x) => x.expectStatus(TileLoadStatus.NotFound));
  });

  it("dispatches requests in order by priority", async () => {
    const channel = new LoggingChannel(1);
    const tr0 = new TestTree(imodel, channel, TileLoadPriority.Dynamic);
    const tr1 = new TestTree(imodel, channel, TileLoadPriority.Terrain);

    const t00 = new TestTile(tr0, channel, 0);
    const t04 = new TestTile(tr0, channel, 4);
    const t10 = new TestTile(tr1, channel, 0);
    const t14 = new TestTile(tr1, channel, 4);

    const vp = mockViewport(imodel);
    requestTiles(vp, [t10, t04, t00, t14 ]);

    async function waitFor(tile: TestTile) {
      await processOnce();
      expect(channel.numActive).to.equal(1);
      expect(tile.isActive).to.be.true;
      tile.expectStatus(TileLoadStatus.Queued);
      tile.resolveRequest();
      await processOnce();
      tile.expectStatus(TileLoadStatus.Loading);
      tile.resolveRead();
      await processOnce();
      tile.expectStatus(TileLoadStatus.Ready);
    }

    await processOnce();
    channel.expectRequests(1, 3);
    await waitFor(t00);
    channel.expectRequests(1, 2);
    await waitFor(t04);
    channel.expectRequests(1, 1);
    await waitFor(t10);

    // t14 is now the actively-loading tile. Enqueue some additional ones. The priorities only apply to the queue, not the active set.
    channel.expectRequests(1, 0);
    expect(t14.isActive).to.be.true;

    const t15 = new TestTile(tr1, channel, 5);
    const t03 = new TestTile(tr0, channel, 3);
    const t12 = new TestTile(tr1, channel, 2);
    requestTiles(vp, [t14, t15, t03, t12]);

    await processOnce();
    channel.expectRequests(1, 3);
    await waitFor(t14);
    channel.expectRequests(1, 2);
    await waitFor(t03);
    channel.expectRequests(1, 1);
    await waitFor(t12);
    channel.expectRequests(1, 0);
    await waitFor(t15);
    channel.expectRequests(0, 0);
  });

  it("cancels requests", async () => {
    const channel = new LoggingChannel(1);
    const tree = new TestTree(imodel, channel);
    const tiles = [0, 1, 2, 3].map((x) => new TestTile(tree, channel, x));

    const vp = mockViewport(imodel);
    requestTiles(vp, tiles);
    IModelApp.tileAdmin.process();
    channel.expectRequests(1, 3);
    expect(tiles[0].awaitingRequest).to.be.true;

    // Cancel all of the requests
    requestTiles(vp, []);
    IModelApp.tileAdmin.process();

    // Canceled active requests are not removed until the promise resolves or rejects.
    channel.expectRequests(1, 0);
    expect(tiles[0].awaitingRequest).to.be.true;
    expect(tiles[0].isActive).to.be.true;

    tiles[0].rejectRequest();
    await processOnce();
    expect(tiles[0].awaitingRead).to.be.false;
    tiles[0].expectStatus(TileLoadStatus.NotFound);
    tiles[0] = new TestTile(tree, channel, 0); // reset to an unloaded tile
    channel.expectRequests(0, 0);
    tiles.forEach((x) => x.expectStatus(TileLoadStatus.NotLoaded));

    requestTiles(vp, tiles);
    await processOnce();
    expect(tiles[0].isActive).to.be.true;

    requestTiles(vp, tiles.slice(1, 3));
    tiles[0].rejectRequest();
    await processOnce();
    channel.expectRequests(0, 2);
    tiles[0].expectStatus(TileLoadStatus.NotFound);
    await processOnce();
    channel.expectRequests(1, 1);
    expect(tiles[1].isActive).to.be.true;

    // Cancel all requests.
    requestTiles(vp, []);
    IModelApp.tileAdmin.process();
    channel.expectRequests(1, 0);
    expect(tiles[1].isActive).to.be.true;
    expect(tiles[1].awaitingRequest).to.be.true;

    tiles[1].resolveRequest();
    await processOnce();
    channel.expectRequests(0, 0);
    expect(tiles[1].awaitingRequest).to.be.false;
    // If we've already received a response, we process it even if request was canceled.
    expect(tiles[1].awaitingRead).to.be.true;

    tiles[1].resolveRead();
    await processOnce();
    tiles[1].expectStatus(TileLoadStatus.Ready);
    tiles.slice(2).forEach((x) => x.expectStatus(TileLoadStatus.NotLoaded));
  });

  it("changes max active requests", async () => {
    const channel = new LoggingChannel(3);
    const tree = new TestTree(imodel, channel);
    const tiles = [0, 1, 2, 3, 4].map((x) => new TestTile(tree, channel, x));

    const vp = mockViewport(imodel);
    requestTiles(vp, tiles);
    IModelApp.tileAdmin.process();
    channel.expectRequests(3, 2);

    channel.concurrency = 1;
    await processOnce();
    channel.expectRequests(3, 2);

    tiles[0].rejectRequest();
    await processOnce();
    channel.expectRequests(2, 2);

    tiles[1].resolveRequest();
    await processOnce();
    tiles[1].resolveRead();
    await processOnce();
    channel.expectRequests(1, 2);

    tiles[2].rejectRequest();
    await processOnce();
    channel.expectRequests(0, 2);
    IModelApp.tileAdmin.process();
    channel.expectRequests(1, 1);

    tiles[3].rejectRequest();
    await processOnce();
    channel.expectRequests(0, 1);
    IModelApp.tileAdmin.process();
    channel.expectRequests(1, 0);

    const tile = new TestTile(tree, channel, 5);
    requestTiles(vp, [tiles[4], tile]);
    IModelApp.tileAdmin.process();
    channel.expectRequests(1, 1);

    tiles[4].resolveRequest();
    await processOnce();
    tiles[4].resolveRead();
    await processOnce();
    channel.expectRequests(1, 0);

    tile.rejectRequest();
    await processOnce();
    channel.expectRequests(0 ,0);
  });

  // A canceled active request is not removed from the active set until its promise is settled.
  // It is included in `statistics.numCanceled` for every call to `process` during which it is active and canceled.
  // However, onActiveRequestCanceled is only called once - when the request is initially canceled.
  it("calls onActiveRequestCanceled only once per cancellation", async () => {
    class Channel extends LoggingChannel {
      public numActiveCanceled = 0;
      public numProcessed = 0;

      public onActiveRequestCanceled() {
        ++this.numActiveCanceled;
      }

      public processCancellations() {
        this.numProcessed += this.statistics.numCanceled;
      }
    }

    const channel = new Channel(2);
    const tree = new TestTree(imodel, channel);
    const tile = tree.rootTile;
    const tiles = [tile];
    const vp = mockViewport(imodel);

    requestTiles(vp, tiles);
    IModelApp.tileAdmin.process();
    expect(tile.isActive).to.be.true;
    expect(channel.numActiveCanceled).to.equal(0);
    expect(channel.numProcessed).to.equal(0);
    expect(channel.statistics.numCanceled).to.equal(0);

    for (let i = 1; i < 4; i++) {
      requestTiles(vp, []);
      IModelApp.tileAdmin.process();
      expect(tile.isActive).to.be.true;
      expect(channel.numActiveCanceled).to.equal(1);
      expect(channel.statistics.numCanceled).to.equal(1);
      expect(channel.numProcessed).to.equal(i);
    }

    await tile.resolveBoth();
    IModelApp.tileAdmin.process();
    expect(tile.isActive).to.be.false;
    expect(channel.numActiveCanceled).to.equal(1);
    expect(channel.statistics.numCanceled).to.equal(0);
    tile.expectStatus(TileLoadStatus.Ready);
  });

  it("can retry on server timeout", async () => {
    const channel = new LoggingChannel(10);
    const tree = new TestTree(imodel, channel);
    const t1 = new TestTile(tree, channel, 1);
    const t2 = new TestTile(tree, channel, 2);

    const vp = mockViewport(imodel);
    requestTiles(vp, [t1, t2]);
    IModelApp.tileAdmin.process();
    channel.expectRequests(2, 0);

    t1.rejectRequest(new Error("Not a server timeout"));
    t2.rejectRequest(new ServerTimeoutError("Server timeout"));
    await processOnce();
    channel.expectRequests(0, 0);
    t1.expectStatus(TileLoadStatus.NotFound);
    t2.expectStatus(TileLoadStatus.NotLoaded);

    requestTiles(vp, [t1, t2]);
    IModelApp.tileAdmin.process();
    channel.expectRequests(1, 0);
    expect(t1.isActive).to.be.false;
    expect(t2.isActive).to.be.true;

    await t2.resolveBoth();
    channel.expectRequests(0, 0);
    expect(t2.isActive).to.be.false;
    t2.expectStatus(TileLoadStatus.Ready);
  });

  it("records statistics", async () => {
    const channel = new LoggingChannel(4);

    function expectStats(expected: Partial<TileRequestChannelStatistics>) {
      const stats = channel.statistics;
      for (const propName in expected) { // eslint-disable-line guard-for-in
        const key = propName as keyof TileRequestChannelStatistics;
        expect(stats[key]).to.equal(expected[key]);
      }
    }

    const vp = mockViewport(imodel);
    const tree = new TestTree(imodel, channel);
    const tiles = [0, 1, 2, 3, 4, 5, 6].map((x) => {
      const tile = new TestTile(tree, channel, x);
      tile.empty = false;
      tile.displayable = true;
      return tile;
    });

    requestTiles(vp, tiles);
    IModelApp.tileAdmin.process();
    expectStats({ numActiveRequests: 4, numPendingRequests: 3, totalDispatchedRequests: 4 });

    requestTiles(vp, []);
    IModelApp.tileAdmin.process();
    expectStats({ numActiveRequests: 4, numPendingRequests: 0, numCanceled: 7 });

    tiles[0].rejectRequest(new ServerTimeoutError("oh no!"));
    await runMicroTasks();
    expectStats({ numActiveRequests: 3, numPendingRequests: 0, totalCompletedRequests: 0, totalFailedRequests: 0,totalTimedOutRequests: 1 });

    await tiles[1].resolveBoth();
    expectStats({ numActiveRequests: 2, numPendingRequests: 0, totalCompletedRequests: 1 });

    tiles[2].rejectRequest();
    await runMicroTasks();
    expectStats({ numActiveRequests: 1, numPendingRequests: 0, totalFailedRequests: 1 });

    tiles[3].resolveRequest();
    await runMicroTasks();
    tiles[3].rejectRead();
    await runMicroTasks();
    expectStats({ numActiveRequests: 0, numPendingRequests: 0, totalFailedRequests: 2 });

    expectStats({ totalUndisplayableTiles: 0, totalEmptyTiles: 0 });
    tiles[4].empty = true;
    tiles[5].displayable = false;
    tiles[6].empty = true;
    tiles[6].displayable = false;
    requestTiles(vp, tiles.slice(4));
    IModelApp.tileAdmin.process();
    expectStats({ numActiveRequests: 3, numPendingRequests: 0 });

    await Promise.all(tiles.slice(4).map(async (x) => x.resolveBoth()));
    expectStats({ numActiveRequests: 0, numPendingRequests: 0, totalEmptyTiles: 2, totalUndisplayableTiles: 1 });

    IModelApp.tileAdmin.process();
    expectStats({
      numPendingRequests: 0,
      numActiveRequests: 0,
      numCanceled: 0,
      totalCompletedRequests: 4,
      totalFailedRequests: 2,
      totalTimedOutRequests: 1,
      totalEmptyTiles: 2,
      totalUndisplayableTiles: 1,
      totalCacheMisses: 0,
      totalDispatchedRequests: 7,
      totalAbortedRequests: 0,
    });
  });

  it("can retry using a different channel", async () => {
    const channel2 = new LoggingChannel(10, "channel 2");
    class Channel1 extends LoggingChannel {
      public constructor() {
        super(10, "channel 1");
      }

      public onNoContent(req: TileRequest): boolean {
        expect(req.channel).to.equal(this);
        (req.tile as TestTile).requestChannel = channel2;
        return true;
      }
    }

    const channel1 = new Channel1();
    const tree = new TestTree(imodel, channel1);
    const tiles = [0 ,1 , 2, 3].map((x) => new TestTile(tree, channel1, x));

    const vp = mockViewport(imodel);
    requestTiles(vp, tiles);
    IModelApp.tileAdmin.process();
    channel1.expectRequests(4, 0);
    channel2.expectRequests(0, 0);
    tiles.forEach((x) => expect(x.channel).to.equal(channel1));

    tiles[0].rejectRequest();
    tiles[1].resolveRequest();
    tiles[2].resolveRequest("undefined");
    tiles[3].resolveRequest("undefined");
    await processOnce();
    tiles.slice(0, 2).forEach((x) => expect(x.channel).to.equal(channel1));
    tiles.slice(2).forEach((x) => expect(x.channel).to.equal(channel2));
    channel1.expectRequests(0, 0);
    channel2.expectRequests(0, 0);

    requestTiles(vp, tiles.slice(1));
    IModelApp.tileAdmin.process();
    channel1.expectRequests(0, 0);
    channel2.expectRequests(2, 0);
    expect(tiles[1].awaitingRead).to.be.true;
    expect(tiles[2].awaitingRequest).to.be.true;
    expect(tiles[3].awaitingRequest).to.be.true;

    tiles[2].resolveRequest();
    tiles[3].resolveRequest();
    await processOnce();
    tiles.slice(1).forEach((x) => expect(x.awaitingRead).to.be.true);

    tiles[1].resolveRead();
    tiles[2].resolveRead();
    tiles[3].rejectRead();
    await processOnce();
    channel1.expectRequests(0, 0);
    channel2.expectRequests(0, 0);
    expect(tiles.map((x) => x.loadStatus)).to.deep.equal([TileLoadStatus.NotFound, TileLoadStatus.Ready, TileLoadStatus.Ready, TileLoadStatus.NotFound]);
  });
});
