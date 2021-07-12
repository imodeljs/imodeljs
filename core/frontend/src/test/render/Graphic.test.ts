/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/unbound-method */

import { expect } from "chai";
import { IDisposable } from "@bentley/bentleyjs-core";
import { Transform } from "@bentley/geometry-core";
import { ElementAlignedBox3d, PackedFeatureTable } from "@bentley/imodeljs-common";
import { GraphicBranch, GraphicBranchOptions } from "../../render/GraphicBranch";
import { MockRender } from "../../render/MockRender";
import { RenderGraphic } from "../../render/RenderGraphic";

function addIsDisposed(disposable: IDisposable): void {
  (disposable as any).isDisposed = false;
  const dispose = disposable.dispose;
  disposable.dispose = () => {
    (disposable as any).isDisposed = true;
    dispose.call(disposable);
  };
}

class Branch extends GraphicBranch {
  public isDisposed = false;

  public constructor(ownsEntries: boolean) {
    super(ownsEntries);
  }

  public override dispose() {
    this.isDisposed = true;
    super.dispose();
  }
}

class System extends MockRender.System {
  public override createGraphicList(graphics: RenderGraphic[]) {
    const ret = super.createGraphicList(graphics);
    addIsDisposed(ret);
    return ret;
  }

  public override createGraphicBranch(branch: GraphicBranch, transform: Transform, options?: GraphicBranchOptions) {
    const ret = super.createGraphicBranch(branch, transform, options);
    addIsDisposed(ret);
    return ret;
  }

  public override createBatch(graphic: RenderGraphic, features: PackedFeatureTable, range: ElementAlignedBox3d) {
    const ret = super.createBatch(graphic, features, range);
    addIsDisposed(ret);
    return ret;
  }

  public override createGraphicOwner(graphic: RenderGraphic) {
    const ret = super.createGraphicOwner(graphic);
    addIsDisposed(ret);
    return ret;
  }

  public createRenderGraphic() {
    const ret = super.createMesh({} as any);
    addIsDisposed(ret);
    return ret;
  }
}

function isDisposed(disposable: any): boolean {
  expect(disposable.isDisposed).not.to.be.undefined;
  return disposable.isDisposed;
}

describe("RenderGraphic", () => {
  it("should not be disposed if owned", () => {
    const system = new System();
    const unowned = system.createRenderGraphic();
    const owned = system.createRenderGraphic();
    const owner = system.createGraphicOwner(owned);

    unowned.dispose();
    owner.dispose();

    expect(isDisposed(unowned)).to.be.true;
    expect(isDisposed(owner)).to.be.true;
    expect(isDisposed(owned)).to.be.false;

    owner.disposeGraphic();
    expect(isDisposed(owned)).to.be.true;
  });
});

describe("GraphicBranch", () => {
  it("should dispose of entries only if owned", () => {
    const system = new System();
    const owned = system.createRenderGraphic();
    const owningBranch = new Branch(true);
    owningBranch.add(owned);

    const unowned = system.createRenderGraphic();
    const branch = new Branch(false);
    branch.add(unowned);

    owningBranch.dispose();
    expect(isDisposed(owningBranch)).to.be.true;
    expect(isDisposed(owned)).to.be.true;
    expect(owningBranch.entries.length).to.equal(0);

    branch.dispose();
    expect(isDisposed(branch)).to.be.true;
    expect(isDisposed(unowned)).to.be.false;
    expect(branch.entries.length).to.equal(0);
  });

  it("should not dispose of graphics owned by a graphic owner", () => {
    const system = new System();
    const owned = system.createRenderGraphic();
    const owner = system.createGraphicOwner(owned);
    const unowned = system.createRenderGraphic();

    const branch = new Branch(true);
    branch.add(owner);
    branch.add(unowned);

    branch.dispose();
    expect(isDisposed(branch)).to.be.true;
    expect(branch.entries.length).to.equal(0);
    expect(isDisposed(owner)).to.be.true;
    expect(isDisposed(unowned)).to.be.true;
    expect(isDisposed(owned)).to.be.false;
  });
});
