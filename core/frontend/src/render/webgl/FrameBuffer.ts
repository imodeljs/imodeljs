/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { assert } from "@bentley/bentleyjs-core";
import { WebGLDisposable } from "./Disposable";
import { GL } from "./GL";
import { RenderBuffer, RenderBufferMultiSample } from "./RenderBuffer";
import { System } from "./System";
import { TextureHandle } from "./Texture";

/** @internal */
export type DepthBuffer = RenderBuffer | RenderBufferMultiSample | TextureHandle;
/* eslint-disable no-restricted-syntax */

/** @internal */
export const enum FrameBufferBindState {
  Unbound,
  Bound,
  BoundWithAttachments,
  BoundMultisampled,
  BoundWithAttachmentsMultisampled,
  Suspended,
}

/** @internal */
export class FrameBuffer implements WebGLDisposable {
  private _fbo?: WebGLFramebuffer;
  private _fboMs?: WebGLFramebuffer;
  private _bindState: FrameBufferBindState = FrameBufferBindState.Unbound;
  private readonly _colorTextures: TextureHandle[] = [];
  private readonly _colorMsBuffers: RenderBufferMultiSample[] = [];
  private readonly _colorAttachments: GLenum[] = [];
  private readonly _colorMsFilters: GL.MultiSampling.Filter[] = [];
  public readonly depthBuffer?: DepthBuffer;
  public readonly depthBufferMs?: DepthBuffer;

  public get isDisposed(): boolean { return this._fbo === undefined; }

  public get isBound(): boolean { return FrameBufferBindState.Bound <= this._bindState && FrameBufferBindState.BoundWithAttachmentsMultisampled >= this._bindState; }

  public get isBoundMultisampled(): boolean { return FrameBufferBindState.BoundMultisampled === this._bindState || FrameBufferBindState.BoundWithAttachmentsMultisampled === this._bindState; }

  public get isSuspended(): boolean { return FrameBufferBindState.Suspended === this._bindState; }

  public get isMultisampled(): boolean { return this._colorMsBuffers.length > 0 || undefined !== this.depthBufferMs; }

  public getColor(ndx: number): TextureHandle {
    assert(ndx < this._colorTextures.length);
    if (ndx < this._colorMsBuffers.length && this._colorMsBuffers[ndx].isDirty) {
      this.blitMsBuffersToTextures(false, ndx);
    }
    return this._colorTextures[ndx];
  }

  private constructor(fbo: WebGLFramebuffer, colorTextures: TextureHandle[], depthBuffer?: DepthBuffer,
    colorMsBuffers?: RenderBufferMultiSample[], msFilters?: GL.MultiSampling.Filter[], depthBufferMs?: DepthBuffer) {
    this._fbo = fbo;
    const gl = System.instance.context;

    this.bind(false);

    let i: number = 0;
    for (const colTex of colorTextures) {
      const attachmentEnum: GLenum = gl.COLOR_ATTACHMENT0 + i;
      this._colorAttachments.push(attachmentEnum);
      this._colorTextures.push(colTex);
      const texHandle = colTex.getHandle();
      if (undefined !== texHandle)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentEnum, gl.TEXTURE_2D, texHandle, 0);
      i++;
    }

    if (depthBuffer !== undefined) {
      this.depthBuffer = depthBuffer;
      const dbHandle = depthBuffer.getHandle();
      if (undefined !== dbHandle) {
        if (depthBuffer instanceof RenderBuffer) {
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, dbHandle);
        } else if (depthBuffer instanceof RenderBufferMultiSample) {
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, dbHandle);
        } else {
          // Looks like we only get a 24 bit depth buffer anyway, so use a 24-8 with a stencil.
          // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, dbHandle, 0);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, dbHandle, 0);
        }
      }
    }

    this.unbind();

    if (undefined !== colorMsBuffers && colorMsBuffers.length === colorTextures.length && undefined !== msFilters && msFilters.length === colorMsBuffers.length) {
      // Create a matching FBO with multisampling render buffers.
      const fbo2 = System.instance.context.createFramebuffer();
      if (null !== fbo2) {
        this._fboMs = fbo2;
        this.bind(false, true);
        i = 0;
        for (const colMsBuff of colorMsBuffers) {
          const attachmentEnum: GLenum = gl.COLOR_ATTACHMENT0 + i;
          this._colorMsBuffers.push(colMsBuff);
          this._colorMsFilters.push(msFilters[i]);
          const msBuffHandle = colMsBuff.getHandle();
          if (undefined !== msBuffHandle)
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachmentEnum, gl.RENDERBUFFER, msBuffHandle);
          i++;
        }

        if (depthBufferMs !== undefined) {
          this.depthBufferMs = depthBufferMs;
          const dbHandleMs = depthBufferMs.getHandle();
          if (undefined !== dbHandleMs) {
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, dbHandleMs);
          }
        }
        this.unbind();
      }
    }
  }

  public static create(colorTextures: TextureHandle[], depthBuffer?: DepthBuffer, colorMsBuffers?: RenderBufferMultiSample[], msFilters?: GL.MultiSampling.Filter[], depthBufferMs?: DepthBuffer): FrameBuffer | undefined {
    const fbo: WebGLFramebuffer | null = System.instance.context.createFramebuffer();
    if (null === fbo) {
      return undefined;
    }
    return new FrameBuffer(fbo, colorTextures, depthBuffer, colorMsBuffers, msFilters, depthBufferMs);
  }

  public dispose(): void {
    // NB: The FrameBuffer does not *own* the textures and depth buffer.
    if (!this.isDisposed) {
      System.instance.context.deleteFramebuffer(this._fbo!);
      this._fbo = undefined;
      if (undefined !== this._fboMs) {
        System.instance.context.deleteFramebuffer(this._fboMs);
        this._fboMs = undefined;
      }
    }
  }

  public bind(bindAttachments: boolean = false, bindMS: boolean = false): boolean {
    assert(undefined !== this._fbo);
    assert(!this.isBound);

    if (undefined === this._fbo)
      return false;

    const gl = System.instance.context;

    if (bindMS && undefined !== this._fboMs) {
      gl.bindFramebuffer(GL.FrameBuffer.TARGET, this._fboMs);
      this._bindState = FrameBufferBindState.BoundMultisampled;
    } else {
      gl.bindFramebuffer(GL.FrameBuffer.TARGET, this._fbo);
      this._bindState = FrameBufferBindState.Bound;
    }

    if (bindAttachments) {
      System.instance.setDrawBuffers(this._colorAttachments);
      this._bindState++;
    }
    return true;
  }

  public unbind() {
    assert(this.isBound);
    System.instance.context.bindFramebuffer(GL.FrameBuffer.TARGET, null);
    this._bindState = FrameBufferBindState.Unbound;
  }

  public suspend() { assert(this.isBound); this._bindState = FrameBufferBindState.Suspended; }

  public markTargetsDirty(): void {
    for (const msBuff of this._colorMsBuffers) {
      msBuff.markBufferDirty(true);
    }
    if (undefined !== this.depthBufferMs)
      (this.depthBufferMs as RenderBufferMultiSample).markBufferDirty(true);
  }

  /** blitDepth is true to blit the depth/stencil buffer. ndx is index of single attachment to blit.
   * All color attachments are blitted if ndx is undefined, none are blitted if ndx is -1.
   */
  public blitMsBuffersToTextures(blitDepth: boolean, ndx?: number) {
    if (!this._fboMs)
      return;
    System.instance.frameBufferStack.suspend();
    const gl2 = System.instance.context as WebGL2RenderingContext;
    const attachments = [];
    const max = (undefined === ndx ? this._colorMsBuffers.length : ndx + 1);
    for (let i = 0; i < max; ++i) {
      if (undefined !== ndx && i < ndx) {
        attachments.push(gl2.NONE); // skip this one, but first add a NONE for it in the attachment list
        continue;
      }
      if (this._colorMsBuffers[i].isDirty) {
        gl2.bindFramebuffer(gl2.READ_FRAMEBUFFER, this._fboMs);
        gl2.readBuffer(this._colorAttachments[i]);
        gl2.bindFramebuffer(gl2.DRAW_FRAMEBUFFER, this._fbo!);
        attachments.push(this._colorAttachments[i]);
        gl2.drawBuffers(attachments);
        attachments.pop();
        attachments.push(gl2.NONE);
        gl2.blitFramebuffer(0, 0, this._colorTextures[i].width, this._colorTextures[i].height,
          0, 0, this._colorTextures[i].width, this._colorTextures[i].height,
          GL.BufferBit.Color, this._colorMsFilters[i]);
        this._colorMsBuffers[i].markBufferDirty(false);
        if (undefined !== ndx && i === ndx)
          break;
      }
    }
    if (blitDepth && undefined !== this.depthBuffer && undefined !== this.depthBufferMs && (this.depthBufferMs as RenderBufferMultiSample).isDirty) {
      const mask = GL.BufferBit.Depth; // (this.depthBuffer instanceof RenderBuffer ? GL.BufferBit.Depth : GL.BufferBit.Depth | GL.BufferBit.Stencil);
      gl2.bindFramebuffer(gl2.READ_FRAMEBUFFER, this._fboMs);
      gl2.bindFramebuffer(gl2.DRAW_FRAMEBUFFER, this._fbo!);
      gl2.blitFramebuffer(0, 0, this.depthBuffer.width, this.depthBuffer.height,
        0, 0, this.depthBuffer.width, this.depthBuffer.height,
        mask, GL.MultiSampling.Filter.Nearest);
      (this.depthBufferMs as RenderBufferMultiSample).markBufferDirty(false);
    }
    gl2.bindFramebuffer(gl2.READ_FRAMEBUFFER, null);
    gl2.bindFramebuffer(gl2.DRAW_FRAMEBUFFER, null);
    System.instance.frameBufferStack.resume();
  }

  /** invDepth is true to invalidate depth buffer. invStencil is true to invalidate stencil buffer. ndx is index of single color attachment to invalidate.
   * All color attachments are invalidated if ndx is undefined, none are invalidated if ndx is -1.
   * Set withMultiSampling to true to invalidate the MS buffers.
   */
  public invalidate(invDepth: boolean, invStencil: boolean, withMultiSampling: boolean, indices?: number[]): void {
    const gl = System.instance.context;
    const attachments = invDepth ? (invStencil ? [gl.DEPTH_STENCIL_ATTACHMENT] : [System.instance.context.DEPTH_ATTACHMENT]) : (invDepth ? [gl.STENCIL_ATTACHMENT] : []);
    if (undefined !== indices) {
      if (indices.length > 0) {
        for (const i of indices)
          attachments.push(gl.COLOR_ATTACHMENT0 + i);
      }
    } else {
      attachments.concat(this._colorAttachments);
    }
    System.instance.frameBufferStack.execute(this, true, withMultiSampling, () => {
      System.instance.invalidateFrameBuffer(attachments);
    });
  }

  // Chiefly for debugging currently - assumes RGBA, unsigned byte, want all pixels.
  public get debugPixels(): Uint8Array | undefined {
    if (!this.isBound || 0 === this._colorTextures.length || !(this._colorTextures[0] instanceof TextureHandle))
      return undefined;

    const tex = this._colorTextures[0];
    if (GL.Texture.Format.Rgba !== tex.format || GL.Texture.DataType.UnsignedByte !== tex.dataType)
      return undefined;

    const buffer = new Uint8Array(tex.width * tex.height * 4);
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = 0xba;
      buffer[i + 1] = 0xad;
      buffer[i + 2] = 0xf0;
      buffer[i + 3] = 0x0d;
    }

    System.instance.context.readPixels(0, 0, tex.width, tex.height, tex.format, tex.dataType, buffer);
    return buffer;
  }
}

interface Binding {
  fbo: FrameBuffer;
  withAttachments: boolean;
  withMultSampling: boolean;
}

/** @internal */
export class FrameBufferStack {
  // FrameBuffers within this array are not owned, as this is only a storage device holding references
  private readonly _stack: Binding[] = [];

  private get _top() { return !this.isEmpty ? this._stack[this._stack.length - 1] : undefined; }

  public push(fbo: FrameBuffer, withAttachments: boolean, withMultSampling: boolean): void {
    if (undefined !== this._top) {
      this._top.fbo.suspend();
    }

    assert(!fbo.isBound);
    fbo.bind(withAttachments, withMultSampling);
    assert(fbo.isBound);

    this._stack.push({ fbo, withAttachments, withMultSampling });
  }

  public pop(): void {
    assert(!this.isEmpty);
    if (undefined === this._top) {
      return;
    }

    const fbo = this._top.fbo;
    this._stack.pop();

    assert(fbo.isBound);
    fbo.unbind();
    assert(!fbo.isBound);

    if (this.isEmpty) {
      System.instance.context.bindFramebuffer(GL.FrameBuffer.TARGET, null);
    } else {
      const top = this._top;
      assert(top.fbo.isSuspended);
      top.fbo.bind(top.withAttachments, top.withMultSampling);
      assert(top.fbo.isBound);
    }
  }

  public get currentColorBuffer(): TextureHandle | undefined {
    assert(!this.isEmpty);
    return undefined !== this._top ? this._top.fbo.getColor(0) : undefined;
  }

  public get currentFbMultisampled(): boolean {
    return undefined !== this._top ? this._top.fbo.isBoundMultisampled : false;
  }

  public get isEmpty(): boolean { return 0 === this._stack.length; }

  public execute(fbo: FrameBuffer, withAttachments: boolean, withMultSampling: boolean, func: () => void) {
    this.push(fbo, withAttachments, withMultSampling);
    func();
    this.pop();
  }

  public markTargetsDirty(): void {
    const top = this._top;
    if (undefined !== top)
      top.fbo.markTargetsDirty();
  }

  public suspend(): void {
    if (undefined !== this._top) {
      this._top.fbo.suspend();
    }
  }

  public resume(): void {
    if (undefined === this._top) {
      return;
    }

    if (this.isEmpty) {
      System.instance.context.bindFramebuffer(GL.FrameBuffer.TARGET, null);
    } else {
      const top = this._top;
      top.fbo.bind(top.withAttachments, top.withMultSampling);
      assert(top.fbo.isBound);
    }
  }
}
