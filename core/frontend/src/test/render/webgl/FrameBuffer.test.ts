/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { Capabilities } from "@bentley/webgl-compatibility";
import { IModelApp } from "../../../IModelApp";
import { Debug } from "../../../render/webgl/Diagnostics";
import { FrameBuffer } from "../../../render/webgl/FrameBuffer";
import { GL } from "../../../render/webgl/GL";
import { RenderBuffer } from "../../../render/webgl/RenderBuffer";
import { System } from "../../../render/webgl/System";
import { TextureHandle } from "../../../render/webgl/Texture";

describe("FrameBuffer tests", () => {
  // eslint-disable-next-line no-return-await
  before(async () => {
    await IModelApp.startup();
  });
  // eslint-disable-next-line no-return-await
  after(async () => await IModelApp.shutdown());

  it("should produce and bind a valid framebuffer with single color attachment", () => {
    if (!IModelApp.hasRenderSystem)
      return;

    const texture: TextureHandle | undefined = TextureHandle.createForAttachment(1, 1, GL.Texture.Format.Rgb, GL.Texture.DataType.UnsignedByte);
    assert(undefined !== texture);
    if (undefined === texture) {
      return;
    }

    const fb = FrameBuffer.create([texture]);
    assert(undefined !== fb);
    if (undefined === fb) {
      return;
    }

    expect(fb.bind()).to.be.true;
    expect(Debug.isValidFrameBuffer).to.be.true;
    fb.unbind();
  });

  it("should produce and bind a valid framebuffer with two color attachments (if available)", () => {
    if (!IModelApp.hasRenderSystem)
      return;

    const caps: Capabilities = System.instance.capabilities;
    if (caps.maxColorAttachments < 2) {
      return;
    }

    const texture0: TextureHandle | undefined = TextureHandle.createForAttachment(1, 1, GL.Texture.Format.Rgb, GL.Texture.DataType.UnsignedByte);
    assert(undefined !== texture0);
    if (undefined === texture0) {
      return;
    }

    const texture1: TextureHandle | undefined = TextureHandle.createForAttachment(1, 1, GL.Texture.Format.Rgb, GL.Texture.DataType.UnsignedByte);
    assert(undefined !== texture1);
    if (undefined === texture1) {
      return;
    }

    const fb = FrameBuffer.create([texture0, texture1]);
    assert(undefined !== fb);
    if (undefined === fb) {
      return;
    }

    expect(fb.bind()).to.be.true;
    expect(Debug.isValidFrameBuffer).to.be.true;
    fb.unbind();
  });

  it("should produce and bind a valid framebuffer with two color attachments (if available) and one depth renderbuffer", () => {
    if (!IModelApp.hasRenderSystem)
      return;

    const caps: Capabilities = System.instance.capabilities;
    if (caps.maxColorAttachments < 2) {
      return;
    }

    const texture0: TextureHandle | undefined = TextureHandle.createForAttachment(1, 1, GL.Texture.Format.Rgb, GL.Texture.DataType.UnsignedByte);
    assert(undefined !== texture0);
    if (undefined === texture0) {
      return;
    }

    const texture1: TextureHandle | undefined = TextureHandle.createForAttachment(1, 1, GL.Texture.Format.Rgb, GL.Texture.DataType.UnsignedByte);
    assert(undefined !== texture1);
    if (undefined === texture1) {
      return;
    }

    const depthRB: RenderBuffer | undefined = RenderBuffer.create(1, 1, GL.RenderBuffer.Format.DepthComponent16);
    assert(undefined !== depthRB);
    if (undefined === depthRB) {
      return;
    }

    const fb = FrameBuffer.create([texture0, texture1], depthRB);
    assert(undefined !== fb);
    if (undefined === fb) {
      return;
    }

    expect(fb.bind()).to.be.true;
    expect(Debug.isValidFrameBuffer).to.be.true;
    fb.unbind();
  });
});
