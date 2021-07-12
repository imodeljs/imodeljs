/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { compareStrings } from "@bentley/bentleyjs-core";
import { Range3d, Transform } from "@bentley/geometry-core";
import { IModelTileTreeProps, ServerTimeoutError, ViewFlagOverrides } from "@bentley/imodeljs-common";
import {
  IModelApp, IModelConnection, overrideRequestTileTreeProps, RenderSystem, SnapshotConnection, Tile, TileContent, TileDrawArgs,
  TileLoadPriority, TileRequest, TileRequestChannel, TileTree,
} from "@bentley/imodeljs-frontend";

class MockTile extends Tile {
  protected _loadChildren(resolve: (children: Tile[] | undefined) => void, _reject: (error: Error) => void): void {
    resolve([]);
  }

  public get channel() {
    // This is never called.
    return {} as unknown as TileRequestChannel;
  }

  public async requestContent(_canceled: () => boolean): Promise<TileRequest.Response> {
    return undefined;
  }

  public async readContent(_data: TileRequest.ResponseData, _system: RenderSystem, _canceled?: () => boolean): Promise<TileContent> {
    return {};
  }

  public constructor(tree: TileTree) {
    super({
      contentId: "tile",
      range: new Range3d(),
      maximumSize: 512,
    }, tree);
  }
}

class MockTree extends TileTree {
  private _rootTile: Tile;

  public constructor(id: string, iModel: IModelConnection) {
    super({
      id,
      iModel,
      modelId: "0x2a",
      location: Transform.createIdentity(),
      priority: TileLoadPriority.Primary,
    });

    this._rootTile = new MockTile(this);
  }

  public get rootTile() { return this._rootTile; }
  public get is3d() { return true; }
  public get maxDepth() { return 1; }
  public get viewFlagOverrides() { return new ViewFlagOverrides(); }
  public override get isContentUnbounded() { return false; }

  protected _selectTiles(_args: TileDrawArgs): Tile[] {
    return [];
  }

  public draw(_args: TileDrawArgs): void { }
  public prune(): void { }
}

describe("TileTreeSupplier", () => {
  let imodel: IModelConnection;

  before(async () => {
    await IModelApp.startup();
    imodel = await SnapshotConnection.openFile("mirukuru.ibim");
  });

  after(async () => {
    if (imodel)
      await imodel.close();

    await IModelApp.shutdown();
  });

  it("should be discarded when ecef location is modified if tiles are ecef-dependent", async () => {
    class Supplier {
      public readonly isEcefDependent?: true;

      public constructor(isEcefDependent: boolean) {
        if (isEcefDependent)
          this.isEcefDependent = true;
      }

      public compareTileTreeIds(lhs: string, rhs: string): number {
        return compareStrings(lhs, rhs);
      }

      public async createTileTree(id: string, iModel: IModelConnection): Promise<TileTree | undefined> {
        return new MockTree(id, iModel);
      }
    }

    const ecefSup = new Supplier(true);
    const nonEcefSup = new Supplier(false);
    const ecefOwner = imodel.tiles.getTileTreeOwner("ecef", ecefSup);
    const nonEcefOwner = imodel.tiles.getTileTreeOwner("nonEcef", nonEcefSup);

    const ecefTree = (await ecefOwner.loadTree())!;
    const nonEcefTree = (await nonEcefOwner.loadTree())!;
    expect(ecefTree).not.to.be.undefined;
    expect(nonEcefTree).not.to.be.undefined;

    expect(ecefTree.isDisposed).to.be.false;
    expect(nonEcefTree.isDisposed).to.be.false;

    imodel.setEcefLocation({
      origin: [0, 0, 0],
      orientation: {
        yaw: 0,
        pitch: 0,
        roll: 0,
      },
    });

    expect(ecefTree.isDisposed).to.be.true;
    expect(nonEcefTree.isDisposed).to.be.false;

    const ecefTree2 = (await ecefOwner.loadTree())!;
    const nonEcefTree2 = (await nonEcefOwner.loadTree())!;
    expect(ecefTree2).not.to.be.undefined;
    expect(nonEcefTree2).not.to.be.undefined;

    expect(ecefTree2.isDisposed).to.be.false;
    expect(nonEcefTree2.isDisposed).to.be.false;

    expect(ecefTree2).not.to.equal(ecefTree);
    expect(nonEcefTree2).to.equal(nonEcefTree);
  });
});

describe("requestTileTreeProps", () => {
  let imodel: IModelConnection;
  let imodel2: IModelConnection | undefined;
  const maxActiveTileTreePropsRequests = 2;

  before(async () => {
    const tileAdmin = { maxActiveTileTreePropsRequests };
    await IModelApp.startup({ tileAdmin });
    imodel = await SnapshotConnection.openFile("mirukuru.ibim");
  });

  after(async () => {
    overrideRequestTileTreeProps(undefined);

    if (imodel)
      await imodel.close();

    if (imodel2)
      await imodel2.close();

    await IModelApp.shutdown();
  });

  it("should process requests in FIFO order", async () => {
    const makePromise = async (id: number) => {
      try {
        await IModelApp.tileAdmin.requestTileTreeProps(imodel, id.toString());
      } catch (err) {
        throw err;
      }
    };

    const processed: number[] = [];
    overrideRequestTileTreeProps(async (_imodel, treeId) => {
      processed.push(Number.parseInt(treeId, 10));
      return new Promise((resolve, _reject) => {
        setTimeout(resolve, 15);
      });
    });

    const promises = [];
    const numRequests = 10;
    for (let id = 0; id < numRequests; id++)
      promises.push(makePromise(id));

    await Promise.all(promises);
    expect(processed.length).to.equal(numRequests);
    for (let i = 0; i < numRequests; i++)
      expect(processed[i]).to.equal(i);

    overrideRequestTileTreeProps(undefined);
  });

  it("should fulfill requests after failed request", async () => {
    const fulfilled: string[] = [];
    const getProps = async (id: string) => {
      try {
        await IModelApp.tileAdmin.requestTileTreeProps(imodel, id);
        fulfilled.push(id);
      } catch (_) {
        //
      }
    };

    const promises = [getProps("0x1c"), getProps("invalid"), getProps("0x1c"), getProps("notanid"), getProps("0x1c")];
    await Promise.all(promises);
    expect(fulfilled.length).to.equal(3);
    expect(fulfilled.every((x) => x === "0x1c")).to.be.true;
  });

  it.skip("should throttle requests", async () => {
    const numRequests = 10;
    const getProps = async (index: number) => {
      await IModelApp.tileAdmin.requestTileTreeProps(imodel, "0x1c");
      const stats = IModelApp.tileAdmin.statistics;

      const numRemaining = numRequests - index;
      const expectedNumActive = Math.min(maxActiveTileTreePropsRequests, numRemaining);
      expect(stats.numActiveTileTreePropsRequests).to.equal(expectedNumActive);

      const expectedNumPending = numRemaining - expectedNumActive;

      // ###TODO The following occasionally fails with 'expected 1 to equal 0'.
      expect(stats.numPendingTileTreePropsRequests).to.equal(expectedNumPending);
    };

    const promises = [];
    for (let i = 1; i <= numRequests; i++)
      promises.push(getProps(i));

    await Promise.all(promises);
  });

  it.skip("should reject when iModel closed", async () => {
    overrideRequestTileTreeProps(async (iModel, _treeId) => {
      return new Promise((resolve, _reject) => {
        iModel.onClose.addOnce((_) => {
          setTimeout(resolve, 15);
        });
      });
    });

    const numRequests = 5;
    const promises = [];
    for (let i = 0; i < numRequests; i++)
      promises.push(IModelApp.tileAdmin.requestTileTreeProps(imodel, i.toString()).then((_props) => i).catch((err) => err));

    await imodel.close();

    const results = await Promise.all(promises);
    expect(results.length).to.equal(numRequests);

    for (let i = 0; i < numRequests; i++) {
      const result = results[i];
      if (i < maxActiveTileTreePropsRequests) {
        // ###TODO the following occassionally fails with "expected 'object' to equal 'number'"
        expect(typeof result).to.equal("number");
        expect(result).to.equal(i);
      } else {
        expect(result).instanceof(ServerTimeoutError);
      }
    }

    overrideRequestTileTreeProps(undefined);

    // We closed the iModel. Reopen it for use by subsequent tests.
    imodel = await SnapshotConnection.openFile("mirukuru.ibim");
  });

  // ###TODO This occassionally times out, possibly due to sporadic failures in previous tests
  it.skip("should fulfill requests for other iModels after a different iModel is closed", async () => {
    imodel2 = await SnapshotConnection.openFile("test.bim");

    overrideRequestTileTreeProps(async (iModel, treeId) => {
      if (iModel === imodel2)
        return { id: treeId } as IModelTileTreeProps;

      return new Promise((resolve, _reject) => {
        iModel.onClose.addOnce((_) => setTimeout(resolve, 15));
      });
    });

    const promises = [];
    for (let i = 0; i < 3; i++)
      promises.push(IModelApp.tileAdmin.requestTileTreeProps(imodel, i.toString()).then((_props) => i).catch((err) => err));

    promises.push(IModelApp.tileAdmin.requestTileTreeProps(imodel, "imodel2").then((_props) => "imodel2").catch((err) => err));

    await imodel.close();

    const results = await Promise.all(promises);
    expect(results.length).to.equal(4);

    // The first 2 requests should have resolved, because they were immediately dispatched.
    expect(typeof results[0]).to.equal("number");
    expect(typeof results[1]).to.equal("number");

    // The third request should have been abandoned because the iModel was closed.
    expect(results[2]).instanceof(ServerTimeoutError);

    // After the first iModel was closed, requests associated with the second iModel should resolve.
    expect(results[3]).to.equal("imodel2");

    overrideRequestTileTreeProps(undefined);

    // We closed the iModel. Reopen it for use by subsequent tests.
    imodel = await SnapshotConnection.openFile("mirukuru.ibim");

    await imodel2.close();
    imodel2 = undefined;
  });
});
