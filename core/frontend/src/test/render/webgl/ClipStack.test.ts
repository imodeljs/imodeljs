/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { ClipVector, Point3d, Transform } from "@bentley/geometry-core";
import { IModelApp } from "../../../IModelApp";
import { RenderSystem } from "../../../render/RenderSystem";
import { ClipStack } from "../../../render/webgl/ClipStack";
import { ClipVolume } from "../../../render/webgl/ClipVolume";

for (let i = 0; i < 2; i++) {
  let renderSys: RenderSystem.Options | undefined;
  const useFloat = i > 0;
  if (!useFloat) {
    renderSys = {
      useWebGL2: false,
      disabledExtensions: [ "OES_texture_float" ],
    };
  }

  function createClipVector(offset = 0): ClipVector {
    const clip = ClipVector.createEmpty();
    clip.appendShape([ Point3d.create(offset + 1, 1, 0), Point3d.create(offset + 2, 1, 0), Point3d.create(offset + 2, 2, 0), Point3d.create(offset + 1, 2, 0)]);
    return clip;
  }

  describe(`ClipStack (${useFloat ? "floating point texture" : "encoded floats"})`, async () => {
    before(async () => {
      await IModelApp.startup({ renderSys });
    });

    after(async () => {
      await IModelApp.shutdown();
    });

    interface Invoked {
      updateTexture: boolean;
      recomputeTexture: boolean;
      uploadTexture: boolean;
      allocateGpuBuffer: boolean;
    }

    class Stack extends ClipStack {
      public transform = Transform.createIdentity();
      public wantViewClip = true;

      public invoked: Invoked = {
        updateTexture: false,
        recomputeTexture: false,
        uploadTexture: false,
        allocateGpuBuffer: false,
      };

      public constructor() {
        super(() => this.transform, () => this.wantViewClip);

        // Constructor invokes this method - must override afterward.
        this.allocateGpuBuffer = () => {
          this.invoked.allocateGpuBuffer = true;
          return super.allocateGpuBuffer();
        };
      }

      public get cpuBuffer() { return this._cpuBuffer; }
      public get gpuBuffer() { return this._gpuBuffer; }
      public get numTotalRows() { return this._numTotalRows; }
      public get numRowsInUse() { return this._numRowsInUse; }
      public get stack() { return this._stack; }
      public get isStackDirty() { return this._isStackDirty; }

      public pushClip(offset = 0): void {
        const clip = createClipVector(offset);
        const vol = ClipVolume.create(clip);
        expect(vol).not.to.be.undefined;
        this.push(vol!);
      }

      // This is primarily for forcing it to update the texture.
      public getTexture() {
        return this.texture;
      }

      public reset() {
        this.invoked.uploadTexture = this.invoked.allocateGpuBuffer = this.invoked.updateTexture = this.invoked.recomputeTexture = false;
      }

      public expectInvoked(expected: Partial<Invoked>) {
        if (undefined !== expected.uploadTexture)
          expect(this.invoked.uploadTexture).to.equal(expected.uploadTexture);

        if (undefined !== expected.updateTexture)
          expect(this.invoked.updateTexture).to.equal(expected.updateTexture);

        if (undefined !== expected.allocateGpuBuffer)
          expect(this.invoked.allocateGpuBuffer).to.equal(expected.allocateGpuBuffer);

        if (undefined !== expected.recomputeTexture)
          expect(this.invoked.recomputeTexture).to.equal(expected.recomputeTexture);

        this.reset();
      }

      protected updateTexture() {
        this.invoked.updateTexture = true;
        super.updateTexture();
      }

      protected recomputeTexture() {
        this.invoked.recomputeTexture = true;
        super.recomputeTexture();
      }

      protected uploadTexture() {
        this.invoked.uploadTexture = true;
        super.uploadTexture();
      }
    }

    it("sets the view clip", () => {
      const stack = new Stack();
      expect(stack.hasClip).to.be.false;
      expect(stack.isStackDirty).to.be.false;

      let prevClip = stack.stack[0];
      stack.setViewClip(ClipVector.createEmpty(), { });
      expect(stack.hasClip).to.be.false;
      expect(stack.stack[0]).to.equal(prevClip);
      expect(stack.isStackDirty).to.be.false;

      const clipVec = createClipVector();
      stack.setViewClip(clipVec, { });
      expect(stack.hasClip).to.be.true;
      expect(stack.stack[0]).not.to.equal(prevClip);
      expect(stack.stack[0]).instanceof(ClipVolume);
      expect(stack.isStackDirty).to.be.true;
      stack.getTexture();

      prevClip = stack.stack[0];
      stack.setViewClip(clipVec, { });
      expect(stack.hasClip).to.be.true;
      expect(stack.stack[0]).to.equal(prevClip);
      expect(stack.isStackDirty).to.be.false;

      stack.setViewClip(createClipVector(1), { });
      expect(stack.hasClip).to.be.true;
      expect(stack.stack[0]).not.to.equal(prevClip);
      expect(stack.isStackDirty).to.be.true;
      stack.getTexture();

      stack.setViewClip(undefined, { });
      expect(stack.hasClip).to.be.false;
      expect(stack.stack[0] instanceof ClipVolume).to.be.false;
      expect(stack.isStackDirty).to.be.true;
      stack.getTexture();

      stack.setViewClip(undefined, { });
      expect(stack.isStackDirty).to.be.false;
    });

    it("updates state as clips are pushed and popped", () => {
      const stack = new Stack();
      expect(stack.stack.length).to.equal(1);
      expect(stack.hasClip).to.be.false;
      expect(stack.numTotalRows).to.equal(0);
      expect(stack.numRowsInUse).to.equal(0);
      expect(stack.cpuBuffer.length).to.equal(0);
      expect(stack.gpuBuffer.length).to.equal(0);
      expect(stack.cpuBuffer.buffer).to.equal(stack.gpuBuffer.buffer);
      expect(stack.cpuBuffer === stack.gpuBuffer).to.equal(!useFloat);
      expect(stack.startIndex).to.equal(0);
      expect(stack.endIndex).to.equal(0);

      stack.setViewClip(createClipVector(), { });
      expect(stack.stack.length).to.equal(1);
      expect(stack.hasClip).to.be.true;
      expect(stack.numTotalRows).to.equal(5);
      expect(stack.numRowsInUse).to.equal(5);
      expect(stack.startIndex).to.equal(0);
      expect(stack.endIndex).to.equal(5);

      stack.wantViewClip = false;
      expect(stack.hasClip).to.be.false;
      expect(stack.numTotalRows).to.equal(5);
      expect(stack.numRowsInUse).to.equal(5);
      expect(stack.startIndex).to.equal(5);
      expect(stack.endIndex).to.equal(5);

      stack.pushClip();
      expect(stack.stack.length).to.equal(2);
      expect(stack.hasClip).to.be.true;
      expect(stack.numTotalRows).to.equal(10);
      expect(stack.numRowsInUse).to.equal(10);
      expect(stack.startIndex).to.equal(5);
      expect(stack.endIndex).to.equal(10);

      stack.wantViewClip = true;
      expect(stack.hasClip).to.be.true;
      expect(stack.startIndex).to.equal(0);
      expect(stack.endIndex).to.equal(10);

      stack.pop();
      expect(stack.stack.length).to.equal(1);
      expect(stack.hasClip).to.be.true;
      expect(stack.numTotalRows).to.equal(10);
      expect(stack.numRowsInUse).to.equal(5);
      expect(stack.cpuBuffer.byteLength).to.equal(0);
      expect(stack.startIndex).to.equal(0);
      expect(stack.endIndex).to.equal(5);

      stack.wantViewClip = false;
      expect(stack.hasClip).to.be.false;

      stack.wantViewClip = true;
      stack.setViewClip(undefined, { });
      expect(stack.stack.length).to.equal(1);
      expect(stack.hasClip).to.be.false;
      expect(stack.numTotalRows).to.equal(10);
      expect(stack.numRowsInUse).to.equal(0);
      expect(stack.cpuBuffer.byteLength).to.equal(0);
      expect(stack.startIndex).to.equal(0);
      expect(stack.endIndex).to.equal(0);

      stack.setViewClip(createClipVector(), { });
      stack.pushClip();
      const texture = stack.texture!;
      expect(texture).not.to.be.undefined;
      expect(texture.width).to.equal(useFloat ? 1 : 4);
      expect(texture.height).to.equal(stack.textureHeight);
      expect(texture.bytesUsed).to.equal(stack.cpuBuffer.byteLength);
      expect(stack.numTotalRows).to.equal(10);
      expect(stack.cpuBuffer.byteLength).to.equal(160); // 4 floats per plane * 4 bytes per float * 10 planes
      expect(stack.gpuBuffer.buffer).to.equal(stack.cpuBuffer.buffer);
      expect(stack.gpuBuffer === stack.cpuBuffer).to.equal(!useFloat);
      expect(stack.textureHeight).to.equal(10);
    });

    it("is marked dirty when a new clip is pushed until texture is updated", () => {
      const stack = new Stack();
      expect(stack.isStackDirty).to.be.false;

      stack.pushClip();
      expect(stack.isStackDirty).to.be.true;
      expect(stack.texture).not.to.be.undefined;
      expect(stack.isStackDirty).to.be.false;

      stack.pushClip();
      expect(stack.isStackDirty).to.be.true;
      expect(stack.texture).not.to.be.undefined;
      expect(stack.isStackDirty).to.be.false;

      stack.pop();
      stack.pop();
      expect(stack.isStackDirty).to.be.false;

      stack.pushClip();
      expect(stack.isStackDirty).to.be.true;
    });

    it("only recomputes data when dirty", () => {
      const stack = new Stack();
      expect(stack.isStackDirty).to.be.false;

      const tex1 = stack.texture;
      expect(tex1).to.be.undefined;
      stack.expectInvoked({ allocateGpuBuffer: false, uploadTexture: false, updateTexture: true, recomputeTexture: false });

      stack.pushClip();
      const tex2 = stack.texture;
      expect(tex2).not.to.be.undefined;
      stack.expectInvoked({ allocateGpuBuffer: true, uploadTexture: true, updateTexture: true, recomputeTexture: true });

      const tex3 = stack.texture;
      expect(tex3).to.equal(tex2);
      stack.expectInvoked({ allocateGpuBuffer: false, uploadTexture: false, updateTexture: true, recomputeTexture: false });
    });

    it("recreates texture only when size increases", () => {
      const stack = new Stack();
      stack.expectInvoked({ allocateGpuBuffer: false, uploadTexture: false, updateTexture: false, recomputeTexture: false });

      stack.pushClip();
      stack.expectInvoked({ uploadTexture: false, updateTexture: false, allocateGpuBuffer: false, recomputeTexture: false });

      const tex1 = stack.texture!;
      expect(tex1).not.to.be.undefined;
      stack.expectInvoked({ uploadTexture: true, updateTexture: true, allocateGpuBuffer: true, recomputeTexture: true });

      stack.pop();
      stack.pushClip();
      const tex2 = stack.texture!;
      expect(tex2).to.equal(tex1);
      stack.expectInvoked({ uploadTexture: false, updateTexture: true, allocateGpuBuffer: false, recomputeTexture: true });

      stack.pushClip();
      const tex3 = stack.texture!;
      expect(tex3).not.to.equal(tex1);
      stack.expectInvoked({ uploadTexture: true, updateTexture: true, allocateGpuBuffer: true, recomputeTexture: true });

      stack.pop();
      stack.pop();
      stack.pushClip(1);
      stack.pushClip(2);
      const tex4 = stack.texture!;
      expect(tex4).to.equal(tex3);
      stack.expectInvoked({ uploadTexture: true, updateTexture: true, allocateGpuBuffer: false, recomputeTexture: true });
    });

    it("uploads texture data only after it has changed", () => {
      const stack = new Stack();

      stack.pushClip(1);
      const tex1 = stack.texture;
      stack.expectInvoked({ allocateGpuBuffer: true, uploadTexture: true, updateTexture: true, recomputeTexture: true });

      stack.pop();
      stack.pushClip(1);
      const tex2 = stack.texture;
      expect(tex2).to.equal(tex1);
      stack.expectInvoked({ allocateGpuBuffer: false, uploadTexture: false, updateTexture: true, recomputeTexture: true });

      stack.pop();
      stack.pushClip(2);
      const tex3 = stack.texture;
      expect(tex3).to.equal(tex2);
      stack.expectInvoked({ allocateGpuBuffer: false, uploadTexture: true, updateTexture: true, recomputeTexture: true });
    });

    it("updates texture when transform changes", () => {
      const stack = new Stack();

      stack.pushClip();
      const tex1 = stack.texture;
      stack.expectInvoked({ allocateGpuBuffer: true, uploadTexture: true, updateTexture: true, recomputeTexture: true });

      stack.pop();
      stack.transform.origin.x += 1;
      stack.pushClip();
      const tex2 = stack.texture;
      expect(tex2).to.equal(tex1);
      stack.expectInvoked({ allocateGpuBuffer: false, uploadTexture: true, updateTexture: true, recomputeTexture: true });

      stack.pop();
      stack.pushClip();
      const tex3 = stack.texture;
      expect(tex3).to.equal(tex2);
      stack.expectInvoked({ allocateGpuBuffer: false, uploadTexture: false, updateTexture: true, recomputeTexture: true });
    });
  });
}
