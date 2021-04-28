/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { IModelApp } from "../../../IModelApp";
import { BuffersContainer, VAOContainer, VBOContainer } from "../../../render/webgl/AttributeBuffers";

describe("BuffersContainer", () => {
  afterEach(async () => {
    if (IModelApp.initialized)
      await IModelApp.shutdown();
  });

  it("should use VAO if enabled", async () => {
    await IModelApp.startup();
    const buffers = BuffersContainer.create();
    expect(buffers instanceof VAOContainer).to.be.true;
  });

  it("should use VBO is VAOs disabled", async () => {
    await IModelApp.startup({
      renderSys: {
        useWebGL2: false,
        disabledExtensions: ["OES_vertex_array_object"],
      },
    });

    const buffers = BuffersContainer.create();
    expect(buffers instanceof VBOContainer).to.be.true;
  });
});
