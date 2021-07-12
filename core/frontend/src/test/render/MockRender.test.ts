/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { IModelApp } from "../../IModelApp";
import { MockRender } from "../../render/MockRender";
import { RenderGraphic } from "../../render/RenderGraphic";
import { RenderTarget } from "../../render/RenderTarget";
import { ViewRect } from "../../ViewRect";

class MyTarget extends MockRender.OffScreenTarget { }
class MyList extends MockRender.List { }
class MySystem extends MockRender.System {
  public override createOffscreenTarget(rect: ViewRect): RenderTarget { return new MyTarget(this, rect); }
  public override createGraphicList(list: RenderGraphic[]) { return new MyList(list); }
}

describe("MockRender", () => {
  before(async () => {
    MockRender.App.systemFactory = () => new MySystem();
    await MockRender.App.startup();
  });

  after(async () => MockRender.App.shutdown());

  it("Should override mock render system", () => {
    expect(IModelApp.hasRenderSystem).to.be.true;
    expect(IModelApp.renderSystem).instanceof(MySystem);
    expect(IModelApp.renderSystem.createOffscreenTarget(new ViewRect(0, 0, 10, 20))).instanceof(MyTarget);
    expect(IModelApp.renderSystem.createGraphicList([])).instanceof(MyList);
  });
});
