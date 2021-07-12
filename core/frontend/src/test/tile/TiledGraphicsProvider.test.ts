/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { BeDuration, BeEvent } from "@bentley/bentleyjs-core";
import { Point3d, Range3d, Transform } from "@bentley/geometry-core";
import { ViewFlagOverrides } from "@bentley/imodeljs-common";
import { IModelConnection } from "../../IModelConnection";
import { SpatialViewState } from "../../SpatialViewState";
import { ScreenViewport, Viewport } from "../../Viewport";
import { IModelApp } from "../../IModelApp";
import {
  Tile, TileContent, TiledGraphicsProvider, TileLoadPriority, TileRequest, TileTree, TileTreeOwner, TileTreeReference, TileTreeSupplier,
} from "../../tile/internal";
import { createBlankConnection } from "../createBlankConnection";

class TestTile extends Tile {
  public constructor(tree: TileTree) {
    super({
      contentId: "test",
      range: new Range3d(0, 0, 0, 1, 1, 1),
      maximumSize: 5,
    }, tree);
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
    return {};
  }
}

class TestTree extends TileTree {
  private readonly _rootTile: TestTile;
  public readonly onReady = new BeEvent<() => void>();

  public constructor(iModel: IModelConnection) {
    super({
      iModel,
      id: "test",
      modelId: "0",
      location: Transform.createIdentity(),
      priority: TileLoadPriority.Primary,
    });

    this._rootTile = new TestTile(this);
  }

  public async setReady(): Promise<void> {
    this.onReady.raiseEvent();
    return BeDuration.wait(1);
  }

  public get rootTile(): TestTile { return this._rootTile; }
  public get is3d() { return true; }
  public get maxDepth() { return undefined; }
  public get viewFlagOverrides() { return new ViewFlagOverrides(); }

  protected _selectTiles(): Tile[] {
    return [this.rootTile];
  }

  public draw() { }
  public prune() { }
}

class TestSupplier implements TileTreeSupplier {
  public compareTileTreeIds(lhs: TestTree, rhs: TestTree) {
    expect(lhs).to.equal(rhs);
    return 0;
  }

  public async createTileTree(tree: TestTree): Promise<TileTree | undefined> {
    return new Promise((resolve) => {
      tree.onReady.addOnce(() => resolve(tree));
    });
  }
}

class TestRef extends TileTreeReference {
  private readonly _owner: TileTreeOwner;
  public loadingComplete = false;

  public constructor(tree: TestTree) {
    super();
    const supplier = new TestSupplier();
    this._owner = tree.iModel.tiles.getTileTreeOwner(tree, supplier);
    this._owner.load();
  }

  public get treeOwner() { return this._owner; }

  protected override get _isLoadingComplete(): boolean {
    return this.loadingComplete;
  }
}

class TestProvider implements TiledGraphicsProvider {
  public readonly refs: TestRef[] = [];
  public isLoadingComplete?: (viewport: Viewport) => boolean;

  public constructor(ref?: TestRef) {
    if (ref)
      this.refs.push(ref);
  }

  public forEachTileTreeRef(_viewport: Viewport, func: (ref: TileTreeReference) => void) {
    for (const ref of this.refs)
      func(ref);
  }

  public set loadingComplete(loadingComplete: boolean | undefined) {
    if (undefined === loadingComplete)
      this.isLoadingComplete = undefined;
    else
      this.isLoadingComplete = () => loadingComplete;
  }
}

describe("TiledGraphicsProvider", () => {
  let imodel: IModelConnection;
  let viewport: ScreenViewport;
  let viewDiv: HTMLDivElement;

  before(async () => {
    viewDiv = document.createElement("div");
    viewDiv.style.width = viewDiv.style.height = "100px";
    document.body.appendChild(viewDiv);

    await IModelApp.startup();
    imodel = createBlankConnection();
  });

  beforeEach(() => {
    const view = SpatialViewState.createBlank(imodel, new Point3d(0, 0, 0), new Point3d(1, 1, 1));
    viewport = ScreenViewport.create(viewDiv, view);
  });

  afterEach(() => {
    viewport.dispose();
  });

  after(async () => {
    await imodel.close();
    await IModelApp.shutdown();
    document.body.removeChild(viewDiv);
  });

  it("reports when tile trees are loaded", async () => {
    expect(viewport.areAllTileTreesLoaded).to.be.true;

    const provider = new TestProvider();
    viewport.addTiledGraphicsProvider(provider);
    expect(viewport.areAllTileTreesLoaded).to.be.true;

    const tree = new TestTree(imodel);
    const ref = new TestRef(tree);
    provider.refs.push(ref);
    expect(viewport.areAllTileTreesLoaded).to.be.false;

    expect(ref.treeOwner.tileTree).to.be.undefined;
    await tree.setReady();
    expect(ref.treeOwner.tileTree).not.to.be.undefined;
    expect(viewport.areAllTileTreesLoaded).to.be.false;

    ref.loadingComplete = true;
    expect(viewport.areAllTileTreesLoaded).to.be.true;

    provider.loadingComplete = false;
    expect(viewport.areAllTileTreesLoaded).to.be.false;

    provider.loadingComplete = true;
    expect(viewport.areAllTileTreesLoaded).to.be.true;

    const tree2 = new TestTree(imodel);
    const ref2 = new TestRef(tree2);
    await tree2.setReady();
    const provider2 = new TestProvider(ref2);
    viewport.addTiledGraphicsProvider(provider2);
    expect(viewport.areAllTileTreesLoaded).to.be.false;

    ref2.loadingComplete = true;
    expect(viewport.areAllTileTreesLoaded).to.be.true;
  });
});
