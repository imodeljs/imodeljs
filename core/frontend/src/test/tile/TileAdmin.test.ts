/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { Point3d, Range3d, Transform, Vector3d } from "@bentley/geometry-core";
import { ViewFlagOverrides } from "@bentley/imodeljs-common";
import { IModelApp } from "../../IModelApp";
import { IModelConnection } from "../../IModelConnection";
import { MockRender } from "../../render/MockRender";
import { RenderGraphic } from "../../render/RenderGraphic";
import { RenderMemory } from "../../render/RenderMemory";
import { SpatialViewState } from "../../SpatialViewState";
import {
  GpuMemoryLimit, GpuMemoryLimits, Tile, TileAdmin, TileContent, TiledGraphicsProvider, TileDrawArgs, TileLoadPriority, TileRequest, TileTree,
  TileTreeOwner, TileTreeReference, TileTreeSupplier,
} from "../../tile/internal";
import { ScreenViewport, Viewport } from "../../Viewport";
import { createBlankConnection } from "../createBlankConnection";

describe("TileAdmin", () => {
  describe("memory limit configuration", () => {
    function expectLimits(admin: TileAdmin, limit: GpuMemoryLimit, maxBytes: number | undefined): void {
      expect(admin.gpuMemoryLimit).to.equal(limit);
      expect(admin.maxTotalTileContentBytes).to.equal(maxBytes);
    }

    function expectAdmin(isMobile: boolean, limits: GpuMemoryLimit | GpuMemoryLimits | undefined, expectedLimit: GpuMemoryLimit, expectedMaxBytes: number | undefined): TileAdmin {
      const admin = new TileAdmin(isMobile, undefined, undefined !== limits ? { gpuMemoryLimits: limits } : undefined);
      expectLimits(admin, expectedLimit, expectedMaxBytes);
      return admin;
    }

    const mobileLimits = TileAdmin.mobileGpuMemoryLimits;
    const desktopLimits = TileAdmin.nonMobileGpuMemoryLimits;
    const keys: Array<"relaxed" | "default" | "aggressive"> = [ "relaxed", "default", "aggressive" ];

    it("defaults to 'default' on mobile", () => {
      expectAdmin(true, undefined, "default", mobileLimits.default);
    });

    it("defaults to 'none' on desktop", () => {
      expectAdmin(false, undefined, "none", undefined);
    });

    it("can be specified at initialization", () => {
      for (const isMobile of [ true, false ]) {
        const limits = isMobile ? mobileLimits : desktopLimits;
        for (const key of keys)
          expectAdmin(isMobile, key, key, limits[key]);

        expectAdmin(isMobile, "none", "none", undefined);

        for (const numBytes of [ 0, 1024, 1024 * 1024, 1024 * 1024 * 1024 * 4 ])
          expectAdmin(isMobile, numBytes, numBytes, numBytes);
      }
    });

    it("can be changed after initialization", () => {
      for (const isMobile of [ true, false ]) {
        const limits = isMobile ? mobileLimits : desktopLimits;
        const admin = expectAdmin(isMobile, "default", "default", limits.default);

        for (const key of keys) {
          admin.gpuMemoryLimit = key;
          expectLimits(admin, key, limits[key]);
        }

        admin.gpuMemoryLimit = "none";
        expectLimits(admin, "none", undefined);

        for (const numBytes of [ 0, 1024, 1024 * 1024, 1024 * 1024 * 1024 * 4 ]) {
          admin.gpuMemoryLimit = numBytes;
          expectLimits(admin, numBytes, numBytes);
        }
      }
    });

    it("cannot be less than zero bytes", () => {
      expectAdmin(false, -100, 0, 0);
    });

    it("defaults to 'none' for invalid input", () => {
      expectAdmin(false, "invalid" as unknown as GpuMemoryLimit, "none", undefined);
    });

    it("uses different number of bytes on mobile vs desktop", () => {
      const limits = { mobile: 1234, nonMobile: 5678 };
      expectAdmin(false, limits, 5678, 5678);
      expectAdmin(true, limits, 1234, 1234);
    });
  });

  describe("enforces memory limits", () => {
    class TestGraphic extends RenderGraphic {
      public constructor(private _size: number) {
        super();
      }

      public dispose() {
        this._size = 0;
      }

      public collectStatistics(stats: RenderMemory.Statistics) {
        if (this._size > 0)
          stats.addTexture(this._size);
      }
    }

    class TestTile extends Tile {
      private readonly _contentSize: number;
      public retainMemory = false;
      public visible = true;

      public constructor(tileTree: TileTree, contentSize: number, retainMemory = false) {
        super({
          contentId: contentSize.toString(),
          range: new Range3d(0, 0, 0, 1, 1, 1),
          maximumSize: 42,
        }, tileTree);

        this._contentSize = contentSize;
        this.retainMemory = retainMemory;

        if (contentSize === 0)
          this.setIsReady();
      }

      protected _loadChildren(resolve: (children: Tile[] | undefined) => void): void {
        resolve(undefined);
      }

      public get channel() {
        return IModelApp.tileAdmin.channels.getForHttp("test-tile");
      }

      public async requestContent(): Promise<TileRequest.Response> {
        return Promise.resolve("content");
      }

      public async readContent(): Promise<TileContent> {
        return { graphic: new TestGraphic(this._contentSize), isLeaf: true };
      }

      public freeMemory(): void {
        if (!this.retainMemory)
          super.freeMemory();
      }

      public computeBytesUsed(): number {
        const stats = new RenderMemory.Statistics();
        this.collectStatistics(stats);
        return stats.totalBytes;
      }
    }

    class TestTree extends TileTree {
      private static _nextId = 0;
      public readonly treeId: number;
      public readonly contentSize: number;
      private readonly _rootTile: TestTile;

      public constructor(contentSize: number, iModel: IModelConnection, retainMemory = false) {
        super({
          iModel,
          id: (++TestTree._nextId).toString(),
          modelId: "0",
          location: Transform.createIdentity(),
          priority: TileLoadPriority.Primary,
        });

        this.treeId = TestTree._nextId;
        this.contentSize = contentSize;
        this._rootTile = new TestTile(this, contentSize, retainMemory);
      }

      public get rootTile(): TestTile { return this._rootTile; }
      public get is3d() { return true; }
      public get maxDepth() { return undefined; }
      public get viewFlagOverrides() { return new ViewFlagOverrides(); }

      protected _selectTiles(args: TileDrawArgs): Tile[] {
        const tiles = [];
        const tile = this.rootTile;
        if (tile.visible) {
          if (tile.isReady)
            tiles.push(tile);
          else
            args.insertMissing(tile);
        }

        return tiles;
      }

      public draw(args: TileDrawArgs) {
        const tiles = this.selectTiles(args);
        for (const tile of tiles)
          tile.drawGraphics(args);

        args.drawGraphics();
      }

      public prune() { }
    }

    class Supplier implements TileTreeSupplier {
      public compareTileTreeIds(lhs: TestTree, rhs: TestTree): number {
        return lhs.treeId - rhs.treeId;
      }

      public async createTileTree(tree: TestTree): Promise<TileTree | undefined> {
        return Promise.resolve(tree);
      }
    }

    const supplier = new Supplier();

    class TestRef extends TileTreeReference {
      private readonly _owner: TileTreeOwner;

      public constructor(tree: TestTree) {
        super();
        this._owner = tree.iModel.tiles.getTileTreeOwner(tree, supplier);
      }

      public get treeOwner() { return this._owner; }
    }

    class Provider implements TiledGraphicsProvider {
      public readonly refs: TileTreeReference[] = [];

      public forEachTileTreeRef(_vp: Viewport, func: (ref: TileTreeReference) => void): void {
        for (const ref of this.refs)
          func(ref);
      }

      public async loadAllTrees(): Promise<void> {
        let allLoaded = true;
        for (const ref of this.refs) {
          if (undefined === ref.treeOwner.load()) {
            allLoaded = false;
            break;
          }
        }

        if (allLoaded)
          return;

        await new Promise<void>((resolve: any) => setTimeout(resolve, 10));
        return this.loadAllTrees();
      }
    }

    function isLinked(tile: Tile): boolean {
      return undefined !== tile.previous || undefined !== tile.next;
    }

    let imodel1: IModelConnection;
    let imodel2: IModelConnection;

    beforeEach(async () => {
      await MockRender.App.startup();
      IModelApp.stopEventLoop();
      imodel1 = createBlankConnection("imodel1");
      imodel2 = createBlankConnection("imodel2");
    });

    afterEach(async () => {
      await imodel1.close();
      await imodel2.close();
      if (IModelApp.initialized)
        await MockRender.App.shutdown();
    });

    const viewDiv = document.createElement("div");
    viewDiv.style.width = viewDiv.style.height = "100px";
    document.body.appendChild(viewDiv);

    function createViewport(imodel: IModelConnection): Viewport {
      const view = SpatialViewState.createBlank(imodel, new Point3d(), new Vector3d(1, 1, 1));
      return ScreenViewport.create(viewDiv, view);
    }

    async function render(...viewports: Viewport[]): Promise<void> {
      const loadTrees = new Array<Promise<void>>();
      for (const viewport of viewports)
        viewport.forEachTiledGraphicsProvider((p) => loadTrees.push((p as Provider).loadAllTrees()));

      await Promise.all(loadTrees);

      const loadTiles = async (): Promise<void> => {
        for (const viewport of viewports) {
          viewport.invalidateScene();
          viewport.renderFrame();
        }

        IModelApp.tileAdmin.process();

        for (const viewport of viewports) {
          if (viewport.numRequestedTiles > 0) {
            await new Promise<void>((resolve: any) => setTimeout(resolve, 10));
            return loadTiles();
          }
        }
      };

      return loadTiles();
    }

    function expectSelectedTiles(viewport: Viewport, tiles: Tile[]): void {
      const selected = IModelApp.tileAdmin.getTilesForViewport(viewport)?.selected;
      if (selected) {
        for (const tile of tiles)
          expect(selected.has(tile)).to.be.true;
      } else {
        expect(tiles.length).to.equal(0);
      }
    }

    function addTilesToViewport(viewport: Viewport, ...contentSizes: number[]): TestTile[] {
      const tiles = [];
      const provider = new Provider();
      viewport.addTiledGraphicsProvider(provider);

      for (const contentSize of contentSizes) {
        const tree = new TestTree(contentSize, viewport.iModel);
        tiles.push(tree.rootTile);
        provider.refs.push(new TestRef(tree));
      }

      return tiles;
    }

    it("updates LRU list as tile contents are loaded and unloaded", async () => {
      const trees = [];
      const provider = new Provider();
      for (let i = 0; i < 5; i++) {
        trees[i] = new TestTree(i, imodel1);
        provider.refs.push(new TestRef(trees[i]));
      }

      const tiles = trees.map((x) => x.rootTile);
      for (const tile of tiles) {
        expect(tile.isReady).to.equal((tile.tree as TestTree).contentSize === 0);
        expect(tile.hasGraphics).to.be.false;
        expect(isLinked(tile)).to.be.false;
      }

      const viewport = createViewport(imodel1);
      viewport.addTiledGraphicsProvider(provider);
      await render(viewport);

      expectSelectedTiles(viewport, tiles);
      const admin = IModelApp.tileAdmin;
      expect(admin.totalTileContentBytes).to.equal(1 + 2 + 3 + 4);

      for (let i = 0; i < 5; i++) {
        const tile = tiles[i];
        const expectGraphics = 0 !== i;
        expect(tile.isReady).to.be.true;
        expect(tile.hasGraphics).to.equal(expectGraphics);
        expect(isLinked(tile)).to.equal(expectGraphics);
      }

      tiles[1].visible = tiles[4].visible = false;
      await render(viewport);

      expectSelectedTiles(viewport, [ tiles[0], tiles[2], tiles[3] ]);
      expect(admin.totalTileContentBytes).to.equal(1 + 2 + 3 + 4);
      admin.freeMemory();
      expect(admin.totalTileContentBytes).to.equal(1 + 2 + 3 + 4);

      admin.gpuMemoryLimit = 0;
      admin.freeMemory();
      expect(admin.totalTileContentBytes).to.equal(2 + 3);

      tiles[2].freeMemory();
      expect(isLinked(tiles[2])).to.be.false;
      expect(admin.totalTileContentBytes).to.equal(3);

      trees[3].dispose();
      expect(isLinked(tiles[3])).to.be.false;
      expect(admin.totalTileContentBytes).to.equal(0);
    });

    it("disposes of non-selected tiles' contents to satisfy memory limit", async () => {
      const admin = IModelApp.tileAdmin;
      admin.gpuMemoryLimit = 0;

      const viewport = createViewport(imodel1);
      const tiles = addTilesToViewport(viewport, 1, 10, 100, 1000, 10000);

      await render(viewport);

      expectSelectedTiles(viewport, tiles);
      expect(admin.totalTileContentBytes).to.equal(11111);
      admin.freeMemory();
      expect(admin.totalTileContentBytes).to.equal(11111);

      tiles[0].visible = tiles[4].visible = false;
      await render(viewport);
      expectSelectedTiles(viewport, [ tiles[1], tiles[2], tiles[3] ]);
      expect(admin.totalTileContentBytes).to.equal(1110);

      tiles[2].visible = tiles[3].visible = false;
      await render(viewport);
      expectSelectedTiles(viewport, [ tiles[1] ]);
      expect(admin.totalTileContentBytes).to.equal(10);

      tiles[1].visible = false;
      await render(viewport);
      expectSelectedTiles(viewport, []);
      expect(admin.totalTileContentBytes).to.equal(0);

      expect(tiles.some((x) => x.computeBytesUsed() > 0)).to.be.false;
    });

    it("frees only enough memory to satisfy memory limit", async () => {
      const admin = IModelApp.tileAdmin;
      admin.gpuMemoryLimit = 200;

      const viewport = createViewport(imodel1);
      const tiles = addTilesToViewport(viewport, 99, 99, 99);
      await render(viewport);

      expectSelectedTiles(viewport, tiles);
      expect(admin.totalTileContentBytes).to.equal(99 * 3);

      for (const tile of tiles)
        tile.visible = false;

      await render(viewport);
      expectSelectedTiles(viewport, []);
      expect(admin.totalTileContentBytes).to.equal(99 * 2);

      admin.gpuMemoryLimit = 100;
      await render(viewport);
      expect(admin.totalTileContentBytes).to.equal(99);

      admin.gpuMemoryLimit = 98;
      await render(viewport);
      expect(admin.totalTileContentBytes).to.equal(0);
    });

    it("does not free selected tiles to satisfy memory limit", async () => {
      const admin = IModelApp.tileAdmin;
      admin.gpuMemoryLimit = 0;

      const viewport = createViewport(imodel1);
      const tiles = addTilesToViewport(viewport, 1, 2, 3);

      await render(viewport);
      expectSelectedTiles(viewport, tiles);
      expect(admin.totalTileContentBytes).to.equal(1 + 2 + 3);
      admin.freeMemory();
      expect(admin.totalTileContentBytes).to.equal(1 + 2 + 3);
      expect(tiles.some((x) => x.computeBytesUsed() <= 0)).to.be.false;
    });

    it("retains tiles that decline to dispose their content", async () => {
      const admin = IModelApp.tileAdmin;
      admin.gpuMemoryLimit = 0;
      const viewport = createViewport(imodel1);
      const tiles = addTilesToViewport(viewport, 1, 10, 100);
      for (const tile of tiles)
        tile.retainMemory = true;

      await render(viewport);
      expectSelectedTiles(viewport, tiles);
      expect(admin.totalTileContentBytes).to.equal(111);

      for (const tile of tiles)
        tile.visible = false;

      await render(viewport);
      expectSelectedTiles(viewport, []);
      expect(admin.totalTileContentBytes).to.equal(111);
      expect(tiles.some((x) => !isLinked(x))).to.be.false;

      tiles[0].retainMemory = tiles[2].retainMemory = false;
      await render(viewport);
      expect(admin.totalTileContentBytes).to.equal(10);
      expect(isLinked(tiles[0])).to.be.false;
      expect(tiles[0].computeBytesUsed()).to.equal(0);
      expect(isLinked(tiles[2])).to.be.false;
      expect(tiles[2].computeBytesUsed()).to.equal(0);
      expect(isLinked(tiles[1])).to.be.true;
      expect(tiles[1].computeBytesUsed()).to.equal(10);

      tiles[1].retainMemory = false;
      await render(viewport);
      expect(admin.totalTileContentBytes).to.equal(0);
    });

    it("manages memory across multiple viewports", async () => {
      const admin = IModelApp.tileAdmin;
      admin.gpuMemoryLimit = 0;
      const trees = [ new TestTree(1, imodel1), new TestTree(10, imodel1), new TestTree(100, imodel1) ];
      const tiles = trees.map((x) => x.rootTile);

      const vp1 = createViewport(imodel1);
      const p1 = new Provider();
      p1.refs.push(new TestRef(trees[0]));
      p1.refs.push(new TestRef(trees[1]));
      vp1.addTiledGraphicsProvider(p1);

      const vp2 = createViewport(imodel2);
      const p2 = new Provider();
      p2.refs.push(new TestRef(trees[1]));
      p2.refs.push(new TestRef(trees[2]));
      vp2.addTiledGraphicsProvider(p2);

      await render(vp1);
      await render(vp2);

      expectSelectedTiles(vp1, [ tiles[0], tiles[1] ]);
      expectSelectedTiles(vp2, [ tiles[1], tiles[2] ]);
      expect(admin.totalTileContentBytes).to.equal(111);

      for (const tile of tiles)
        tile.visible = false;

      await render(vp1);
      expectSelectedTiles(vp1, []);
      expectSelectedTiles(vp2, [ tiles[1], tiles[2] ]);
      expect(admin.totalTileContentBytes).to.equal(110);
      expect(isLinked(tiles[0])).to.be.false;
      expect(isLinked(tiles[1])).to.be.true;
      expect(isLinked(tiles[2])).to.be.true;

      await render(vp2);
      expectSelectedTiles(vp2, []);
      expect(admin.totalTileContentBytes).to.equal(0);
      expect(isLinked(tiles[1])).to.be.false;
      expect(isLinked(tiles[2])).to.be.false;
    });

    it("removes tiles when viewport is disposed of", async () => {
      const admin = IModelApp.tileAdmin;
      admin.gpuMemoryLimit = 0;
      const vp1 = createViewport(imodel1);
      const vp2 = createViewport(imodel2);
      const tile1 = addTilesToViewport(vp1, 1)[0];
      const tile2 = addTilesToViewport(vp2, 10)[0];
      await render(vp1);
      await render(vp2);

      expect(isLinked(tile1)).to.be.true;
      expect(isLinked(tile2)).to.be.true;
      expect(admin.totalTileContentBytes).to.equal(11);

      // Disposing the viewport marks all previously-selected tiles as no longer selected by it - but they remain in the LRU list.
      vp1.dispose();
      expect(isLinked(tile1)).to.be.true;
      expect(isLinked(tile2)).to.be.true;
      expect(admin.totalTileContentBytes).to.equal(11);
      admin.process();
      expect(isLinked(tile1)).to.be.false;
      expect(isLinked(tile2)).to.be.true;
      expect(admin.totalTileContentBytes).to.equal(10);

      vp2.dispose();
      expect(isLinked(tile2)).to.be.true;
      expect(admin.totalTileContentBytes).to.equal(10);
      admin.process();
      expect(isLinked(tile2)).to.be.false;
      expect(admin.totalTileContentBytes).to.equal(0);
    });

    it("removes all tiles when iModel is closed", async () => {
      const vp1 = createViewport(imodel1);
      const vp2 = createViewport(imodel2);
      const tile1 = addTilesToViewport(vp1, 1)[0];
      const tile2 = addTilesToViewport(vp2, 10)[0];
      await render(vp1);
      await render(vp2);

      expect(isLinked(tile1)).to.be.true;
      expect(isLinked(tile2)).to.be.true;
      expect(IModelApp.tileAdmin.totalTileContentBytes).to.equal(11);

      await imodel1.close();
      expect(isLinked(tile1)).to.be.false;
      expect(isLinked(tile2)).to.be.true;
      expect(IModelApp.tileAdmin.totalTileContentBytes).to.equal(10);

      await imodel2.close();
      expect(isLinked(tile2)).to.be.false;
      expect(IModelApp.tileAdmin.totalTileContentBytes).to.equal(0);
    });

    it("removes all tiles when IModelApp is shut down", async () => {
      const viewport = createViewport(imodel1);
      const tile = addTilesToViewport(viewport, 100)[0];
      await render(viewport);
      expect(IModelApp.tileAdmin.totalTileContentBytes).to.equal(100);
      expect(isLinked(tile)).to.be.true;

      await MockRender.App.shutdown();
      expect(IModelApp.tileAdmin.totalTileContentBytes).to.equal(0);
      expect(isLinked(tile)).to.be.false;
    });
  });
});
