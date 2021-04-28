/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { IModelApp } from "../../../IModelApp";
import { BufferHandle } from "../../../render/webgl/AttributeBuffers";
import { GL } from "../../../render/webgl/GL";

describe("BufferHandle", () => {
  before(async () => {
    await IModelApp.startup();
  });
  after(async () => IModelApp.shutdown());

  it("disposes", () => {
    const buf = new BufferHandle(GL.Buffer.Target.ArrayBuffer);
    expect(buf.isDisposed).to.be.false;
    buf.dispose();
    expect(buf.isDisposed).to.be.true;
  });

  it("bind", () => {
    const buf = new BufferHandle(GL.Buffer.Target.ArrayBuffer);
    expect(buf.isBound(GL.Buffer.Binding.ArrayBuffer)).to.be.false;
    expect(buf.isBound(GL.Buffer.Binding.ElementArrayBuffer)).to.be.false;

    buf.bind();
    expect(buf.isBound(GL.Buffer.Binding.ArrayBuffer)).to.be.true;
    expect(buf.isBound(GL.Buffer.Binding.ElementArrayBuffer)).to.be.false;

    buf.unbind();
    expect(buf.isBound(GL.Buffer.Binding.ArrayBuffer)).to.be.false;
  });
});
