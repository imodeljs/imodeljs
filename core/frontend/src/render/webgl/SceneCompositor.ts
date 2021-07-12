/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { assert, dispose } from "@bentley/bentleyjs-core";
import { Transform, Vector2d, Vector3d } from "@bentley/geometry-core";
import {
  Feature, PackedFeatureTable, RenderMode, SpatialClassifierInsideDisplay, SpatialClassifierOutsideDisplay, ViewFlags,
} from "@bentley/imodeljs-common";
import { DepthType, RenderType } from "@bentley/webgl-compatibility";
import { IModelConnection } from "../../IModelConnection";
import { SceneContext } from "../../ViewContext";
import { ViewRect } from "../../ViewRect";
import { Pixel } from "../Pixel";
import { GraphicList } from "../RenderGraphic";
import { RenderMemory } from "../RenderMemory";
import { BranchState } from "./BranchState";
import { BatchState } from "./BatchState";
import {
  AmbientOcclusionGeometry, BlurGeometry, BoundaryType, CachedGeometry, CompositeGeometry, CopyPickBufferGeometry, ScreenPointsGeometry,
  SingleTexturedViewportQuadGeometry, ViewportQuadGeometry, VolumeClassifierGeometry,
} from "./CachedGeometry";
import { Debug } from "./Diagnostics";
import { WebGLDisposable } from "./Disposable";
import { DrawCommands, extractFlashedVolumeClassifierCommands, extractHilitedVolumeClassifierCommands } from "./DrawCommand";
import { FloatRgba } from "./FloatRGBA";
import { DepthBuffer, FrameBuffer } from "./FrameBuffer";
import { GL } from "./GL";
import { IModelFrameLifecycle } from "./IModelFrameLifecycle";
import { Matrix4 } from "./Matrix";
import { RenderCommands } from "./RenderCommands";
import { CompositeFlags, RenderOrder, RenderPass, TextureUnit } from "./RenderFlags";
import { RenderState } from "./RenderState";
import { getDrawParams } from "./ScratchDrawParams";
import { SolarShadowMap } from "./SolarShadowMap";
import { System } from "./System";
import { Target } from "./Target";
import { TechniqueId } from "./TechniqueId";
import { TextureHandle } from "./Texture";
import { RenderBufferMultiSample } from "./RenderBuffer";

function collectTextureStatistics(texture: TextureHandle | undefined, stats: RenderMemory.Statistics): void {
  if (undefined !== texture)
    stats.addTextureAttachment(texture.bytesUsed);
}

function collectMsBufferStatistics(msBuff: RenderBufferMultiSample | undefined, stats: RenderMemory.Statistics): void {
  if (undefined !== msBuff)
    stats.addTextureAttachment(msBuff.bytesUsed);
}

// Maintains the textures used by a SceneCompositor. The textures are reallocated when the dimensions of the viewport change.
class Textures implements WebGLDisposable, RenderMemory.Consumer {
  public accumulation?: TextureHandle;
  public revealage?: TextureHandle;
  public color?: TextureHandle;
  public featureId?: TextureHandle;
  public depthAndOrder?: TextureHandle;
  public hilite?: TextureHandle;
  public occlusion?: TextureHandle;
  public occlusionBlur?: TextureHandle;
  public volClassBlend?: TextureHandle;
  public colorMsBuff?: RenderBufferMultiSample;
  public featureIdMsBuff?: RenderBufferMultiSample;
  public depthAndOrderMsBuff?: RenderBufferMultiSample;
  public hiliteMsBuff?: RenderBufferMultiSample;
  public volClassBlendMsBuff?: RenderBufferMultiSample;

  public get isDisposed(): boolean {
    return undefined === this.accumulation
      && undefined === this.revealage
      && undefined === this.color
      && undefined === this.featureId
      && undefined === this.depthAndOrder
      && undefined === this.hilite
      && undefined === this.occlusion
      && undefined === this.occlusionBlur
      && undefined === this.volClassBlend
      && undefined === this.colorMsBuff
      && undefined === this.featureIdMsBuff
      && undefined === this.depthAndOrderMsBuff
      && undefined === this.hiliteMsBuff
      && undefined === this.volClassBlendMsBuff;
  }

  public dispose() {
    this.accumulation = dispose(this.accumulation);
    this.revealage = dispose(this.revealage);
    this.color = dispose(this.color);
    this.featureId = dispose(this.featureId);
    this.depthAndOrder = dispose(this.depthAndOrder);
    this.hilite = dispose(this.hilite);
    this.occlusion = dispose(this.occlusion);
    this.occlusionBlur = dispose(this.occlusionBlur);
    this.colorMsBuff = dispose(this.colorMsBuff);
    this.featureIdMsBuff = dispose(this.featureIdMsBuff);
    this.depthAndOrderMsBuff = dispose(this.depthAndOrderMsBuff);
    this.hiliteMsBuff = dispose(this.hiliteMsBuff);
    this.volClassBlend = dispose(this.volClassBlend);
    this.volClassBlendMsBuff = dispose(this.volClassBlendMsBuff);
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    collectTextureStatistics(this.accumulation, stats);
    collectTextureStatistics(this.revealage, stats);
    collectTextureStatistics(this.color, stats);
    collectTextureStatistics(this.featureId, stats);
    collectTextureStatistics(this.depthAndOrder, stats);
    collectTextureStatistics(this.hilite, stats);
    collectTextureStatistics(this.occlusion, stats);
    collectTextureStatistics(this.occlusionBlur, stats);
    collectTextureStatistics(this.volClassBlend, stats);
    collectMsBufferStatistics(this.colorMsBuff, stats);
    collectMsBufferStatistics(this.featureIdMsBuff, stats);
    collectMsBufferStatistics(this.depthAndOrderMsBuff, stats);
    collectMsBufferStatistics(this.hiliteMsBuff, stats);
    collectMsBufferStatistics(this.volClassBlendMsBuff, stats);
  }

  public init(width: number, height: number, numSamples: number): boolean {
    assert(undefined === this.accumulation);

    let pixelDataType: GL.Texture.DataType = GL.Texture.DataType.UnsignedByte;
    switch (System.instance.capabilities.maxRenderType) {
      case RenderType.TextureFloat: {
        pixelDataType = GL.Texture.DataType.Float;
        break;
      }
      case RenderType.TextureHalfFloat: {
        if (System.instance.capabilities.isWebGL2) {
          pixelDataType = (System.instance.context as WebGL2RenderingContext).HALF_FLOAT;
          break;
        } else {
          const ext = System.instance.capabilities.queryExtensionObject<OES_texture_half_float>("OES_texture_half_float");
          if (undefined !== ext) {
            pixelDataType = ext.HALF_FLOAT_OES;
            break;
          }
        }
      }
      /* falls through */
      case RenderType.TextureUnsignedByte: {
        break;
      }
    }

    // NB: Both of these must be of the same type, because they are borrowed by pingpong and bound to the same frame buffer.
    this.accumulation = TextureHandle.createForAttachment(width, height, GL.Texture.Format.Rgba, pixelDataType);
    this.revealage = TextureHandle.createForAttachment(width, height, GL.Texture.Format.Rgba, pixelDataType);

    // Hilite texture is a simple on-off, but the smallest texture format WebGL allows us to use as output is RGBA with a byte per component.
    this.hilite = TextureHandle.createForAttachment(width, height, GL.Texture.Format.Rgba, GL.Texture.DataType.UnsignedByte);

    this.color = TextureHandle.createForAttachment(width, height, GL.Texture.Format.Rgba, GL.Texture.DataType.UnsignedByte);

    this.featureId = TextureHandle.createForAttachment(width, height, GL.Texture.Format.Rgba, GL.Texture.DataType.UnsignedByte);
    this.depthAndOrder = TextureHandle.createForAttachment(width, height, GL.Texture.Format.Rgba, GL.Texture.DataType.UnsignedByte);

    let rVal = undefined !== this.accumulation
      && undefined !== this.revealage
      && undefined !== this.color
      && undefined !== this.featureId
      && undefined !== this.depthAndOrder
      && undefined !== this.hilite;

    if (rVal && numSamples > 1) {
      rVal = this.enableMultiSampling(width, height, numSamples);
    }

    return rVal;
  }

  public enableOcclusion(width: number, height: number): boolean {
    assert(undefined === this.occlusion && undefined === this.occlusionBlur);
    this.occlusion = TextureHandle.createForAttachment(width, height, GL.Texture.Format.Rgba, GL.Texture.DataType.UnsignedByte);
    this.occlusionBlur = TextureHandle.createForAttachment(width, height, GL.Texture.Format.Rgba, GL.Texture.DataType.UnsignedByte);
    return undefined !== this.occlusion && undefined !== this.occlusionBlur;
  }

  public disableOcclusion(): void {
    assert(undefined !== this.occlusion && undefined !== this.occlusionBlur);
    this.occlusion = dispose(this.occlusion);
    this.occlusionBlur = dispose(this.occlusionBlur);
  }

  public enableVolumeClassifier(width: number, height: number, numSamples: number): boolean {
    assert(undefined === this.volClassBlend);
    this.volClassBlend = TextureHandle.createForAttachment(width, height, GL.Texture.Format.Rgba, GL.Texture.DataType.UnsignedByte);
    let rVal = undefined !== this.volClassBlend;
    if (rVal && undefined !== numSamples && numSamples > 1) {
      this.volClassBlendMsBuff = RenderBufferMultiSample.create(width, height, WebGL2RenderingContext.RGBA8, numSamples);
      rVal = undefined !== this.volClassBlendMsBuff;
    }
    return rVal;
  }

  public disableVolumeClassifier(): void {
    this.volClassBlend = dispose(this.volClassBlend);
    this.volClassBlendMsBuff = dispose(this.volClassBlendMsBuff);
  }

  public enableMultiSampling(width: number, height: number, numSamples: number): boolean {
    this.colorMsBuff = RenderBufferMultiSample.create(width, height, WebGL2RenderingContext.RGBA8, numSamples);
    this.featureIdMsBuff = RenderBufferMultiSample.create(width, height, WebGL2RenderingContext.RGBA8, numSamples);
    this.depthAndOrderMsBuff = RenderBufferMultiSample.create(width, height, WebGL2RenderingContext.RGBA8, numSamples);
    this.hiliteMsBuff = RenderBufferMultiSample.create(width, height, WebGL2RenderingContext.RGBA8, numSamples);
    return undefined !== this.colorMsBuff
      && undefined !== this.featureIdMsBuff
      && undefined !== this.depthAndOrderMsBuff
      && undefined !== this.hiliteMsBuff;
  }

  public disableMultiSampling(): boolean {
    this.colorMsBuff = dispose(this.colorMsBuff);
    this.featureIdMsBuff = dispose(this.featureIdMsBuff);
    this.depthAndOrderMsBuff = dispose(this.depthAndOrderMsBuff);
    this.hiliteMsBuff = dispose(this.hiliteMsBuff);
    return true;
  }
}

// Maintains the framebuffers used by a SceneCompositor. The color attachments are supplied by a Textures object.
class FrameBuffers implements WebGLDisposable {
  public opaqueColor?: FrameBuffer;
  public opaqueAndCompositeColor?: FrameBuffer;
  public depthAndOrder?: FrameBuffer;
  public hilite?: FrameBuffer;
  public hiliteUsingStencil?: FrameBuffer;
  public stencilSet?: FrameBuffer;
  public occlusion?: FrameBuffer;
  public occlusionBlur?: FrameBuffer;
  public altZOnly?: FrameBuffer;
  public volClassCreateBlend?: FrameBuffer;
  public volClassCreateBlendAltZ?: FrameBuffer;

  public init(textures: Textures, depth: DepthBuffer, depthMS: DepthBuffer | undefined): boolean {
    if (!this.initPotentialMSFbos(textures, depth, depthMS))
      return false;

    this.depthAndOrder = FrameBuffer.create([textures.depthAndOrder!], depth);
    this.hilite = FrameBuffer.create([textures.hilite!]);
    this.hiliteUsingStencil = FrameBuffer.create([textures.hilite!], depth);

    return undefined !== this.depthAndOrder
      && undefined !== this.hilite
      && undefined !== this.hiliteUsingStencil;
  }

  private initPotentialMSFbos(textures: Textures, depth: DepthBuffer, depthMS: DepthBuffer | undefined): boolean {
    const boundColor = System.instance.frameBufferStack.currentColorBuffer;
    assert(undefined !== boundColor && undefined !== textures.color);
    if (undefined === depthMS) {
      this.opaqueColor = FrameBuffer.create([boundColor], depth);
      this.opaqueAndCompositeColor = FrameBuffer.create([textures.color], depth);
    } else {
      assert(undefined !== textures.colorMsBuff);
      this.opaqueColor = FrameBuffer.create([boundColor], depth, [textures.colorMsBuff], [GL.MultiSampling.Filter.Linear], depthMS);
      this.opaqueAndCompositeColor = FrameBuffer.create([textures.color], depth, [textures.colorMsBuff], [GL.MultiSampling.Filter.Linear], depthMS);
    }
    return undefined !== this.opaqueColor
      && undefined !== this.opaqueAndCompositeColor;
  }

  public toggleOcclusion(textures: Textures): void {
    if (undefined !== textures.occlusion) {
      assert(undefined !== textures.occlusionBlur);
      this.occlusion = FrameBuffer.create([textures.occlusion]);
      this.occlusionBlur = FrameBuffer.create([textures.occlusionBlur]);
    } else {
      assert(undefined === textures.occlusionBlur);
      this.occlusion = dispose(this.occlusion);
      this.occlusionBlur = dispose(this.occlusionBlur);
    }
  }

  public enableVolumeClassifier(textures: Textures, depth: DepthBuffer, volClassDepth: DepthBuffer | undefined, depthMS?: DepthBuffer, volClassDepthMS?: DepthBuffer): void {
    if (undefined === this.stencilSet) {
      if (undefined !== depthMS) { // if multisampling use the multisampled depth everywhere
        this.stencilSet = FrameBuffer.create([], depth, [], [], depthMS);
        this.altZOnly = FrameBuffer.create([], volClassDepth, [], [], volClassDepthMS);
        this.volClassCreateBlend = FrameBuffer.create([textures.volClassBlend!], depth, [textures.volClassBlendMsBuff!], [GL.MultiSampling.Filter.Nearest], depthMS);
        this.volClassCreateBlendAltZ = FrameBuffer.create([textures.volClassBlend!], volClassDepth, [textures.volClassBlendMsBuff!], [GL.MultiSampling.Filter.Nearest], volClassDepthMS);
      } else if (undefined !== volClassDepth) {
        this.stencilSet = FrameBuffer.create([], depth);
        this.altZOnly = FrameBuffer.create([], volClassDepth);
        this.volClassCreateBlend = FrameBuffer.create([textures.volClassBlend!], depth);
        this.volClassCreateBlendAltZ = FrameBuffer.create([textures.volClassBlend!], volClassDepth);
      }
    }
  }

  public disableVolumeClassifier(): void {
    if (undefined !== this.stencilSet) {
      this.stencilSet = dispose(this.stencilSet);
      this.altZOnly = dispose(this.altZOnly);
      this.volClassCreateBlend = dispose(this.volClassCreateBlend);
      this.volClassCreateBlendAltZ = dispose(this.volClassCreateBlendAltZ);
    }
  }

  public enableMultiSampling(textures: Textures, depth: DepthBuffer, depthMS: DepthBuffer): boolean {
    this.opaqueColor = dispose(this.opaqueColor);
    this.opaqueAndCompositeColor = dispose(this.opaqueAndCompositeColor);
    return this.initPotentialMSFbos(textures, depth, depthMS);
  }

  public disableMultiSampling(textures: Textures, depth: DepthBuffer): boolean {
    this.opaqueColor = dispose(this.opaqueColor);
    this.opaqueAndCompositeColor = dispose(this.opaqueAndCompositeColor);
    return this.initPotentialMSFbos(textures, depth, undefined);
  }

  public get isDisposed(): boolean {
    return undefined === this.opaqueColor
      && undefined === this.opaqueAndCompositeColor
      && undefined === this.depthAndOrder
      && undefined === this.hilite
      && undefined === this.hiliteUsingStencil
      && undefined === this.occlusion
      && undefined === this.occlusionBlur
      && undefined === this.stencilSet
      && undefined === this.altZOnly
      && undefined === this.volClassCreateBlend
      && undefined === this.volClassCreateBlendAltZ;
  }

  public dispose() {
    this.opaqueColor = dispose(this.opaqueColor);
    this.opaqueAndCompositeColor = dispose(this.opaqueAndCompositeColor);
    this.depthAndOrder = dispose(this.depthAndOrder);
    this.hilite = dispose(this.hilite);
    this.hiliteUsingStencil = dispose(this.hiliteUsingStencil);
    this.occlusion = dispose(this.occlusion);
    this.occlusionBlur = dispose(this.occlusionBlur);
    this.stencilSet = dispose(this.stencilSet);
    this.altZOnly = dispose(this.altZOnly);
    this.volClassCreateBlend = dispose(this.volClassCreateBlend);
    this.volClassCreateBlendAltZ = dispose(this.volClassCreateBlendAltZ);
  }
}

function collectGeometryStatistics(geom: CachedGeometry | undefined, stats: RenderMemory.Statistics): void {
  if (undefined !== geom)
    geom.collectStatistics(stats);
}

// Maintains the geometry used to execute screenspace operations for a SceneCompositor.
class Geometry implements WebGLDisposable, RenderMemory.Consumer {
  public composite?: CompositeGeometry;
  public volClassColorStencil?: ViewportQuadGeometry;
  public volClassCopyZ?: SingleTexturedViewportQuadGeometry;
  public volClassCopyZWithPoints?: ScreenPointsGeometry;
  public volClassSetBlend?: VolumeClassifierGeometry;
  public volClassBlend?: SingleTexturedViewportQuadGeometry;
  public occlusion?: AmbientOcclusionGeometry;
  public occlusionXBlur?: BlurGeometry;
  public occlusionYBlur?: BlurGeometry;

  public collectStatistics(stats: RenderMemory.Statistics): void {
    collectGeometryStatistics(this.composite, stats);
    collectGeometryStatistics(this.volClassColorStencil, stats);
    collectGeometryStatistics(this.volClassCopyZ, stats);
    collectGeometryStatistics(this.volClassCopyZWithPoints, stats);
    collectGeometryStatistics(this.volClassSetBlend, stats);
    collectGeometryStatistics(this.volClassBlend, stats);
    collectGeometryStatistics(this.occlusion, stats);
    collectGeometryStatistics(this.occlusionXBlur, stats);
    collectGeometryStatistics(this.occlusionYBlur, stats);
  }

  public init(textures: Textures): boolean {
    assert(undefined === this.composite);
    this.composite = CompositeGeometry.createGeometry(
      textures.color!.getHandle()!,
      textures.accumulation!.getHandle()!,
      textures.revealage!.getHandle()!, textures.hilite!.getHandle()!);
    return undefined !== this.composite;
  }

  public toggleOcclusion(textures: Textures): void {
    if (undefined !== textures.occlusion) {
      assert(undefined !== textures.occlusionBlur);
      this.composite!.occlusion = textures.occlusion.getHandle();
      this.occlusion = AmbientOcclusionGeometry.createGeometry(textures.depthAndOrder!.getHandle()!);
      this.occlusionXBlur = BlurGeometry.createGeometry(textures.occlusion.getHandle()!, textures.depthAndOrder!.getHandle()!, new Vector2d(1.0, 0.0));
      this.occlusionYBlur = BlurGeometry.createGeometry(textures.occlusionBlur.getHandle()!, textures.depthAndOrder!.getHandle()!, new Vector2d(0.0, 1.0));
    } else {
      assert(undefined === textures.occlusionBlur);
      this.composite!.occlusion = undefined;
      this.occlusion = dispose(this.occlusion);
      this.occlusionXBlur = dispose(this.occlusionXBlur);
      this.occlusionYBlur = dispose(this.occlusionYBlur);
    }
  }

  public enableVolumeClassifier(textures: Textures, depth: DepthBuffer, width: number, height: number): boolean {
    assert(undefined === this.volClassColorStencil && undefined === this.volClassCopyZ && undefined === this.volClassSetBlend && undefined === this.volClassBlend);
    this.volClassColorStencil = ViewportQuadGeometry.create(TechniqueId.VolClassColorUsingStencil);
    this.volClassCopyZ = SingleTexturedViewportQuadGeometry.createGeometry(depth.getHandle()!, TechniqueId.VolClassCopyZ);
    this.volClassSetBlend = VolumeClassifierGeometry.createVCGeometry(depth.getHandle()!);
    this.volClassBlend = SingleTexturedViewportQuadGeometry.createGeometry(textures.volClassBlend!.getHandle()!, TechniqueId.VolClassBlend);
    if (!System.instance.capabilities.supportsFragDepth)
      this.volClassCopyZWithPoints = ScreenPointsGeometry.createGeometry(width, height, depth.getHandle()!);
    return undefined !== this.volClassColorStencil && undefined !== this.volClassCopyZ && undefined !== this.volClassSetBlend && undefined !== this.volClassBlend
      && (System.instance.capabilities.supportsFragDepth || undefined !== this.volClassCopyZWithPoints);
  }

  public disableVolumeClassifier(): void {
    if (undefined !== this.volClassColorStencil) {
      this.volClassColorStencil = dispose(this.volClassColorStencil);
      this.volClassCopyZ = dispose(this.volClassCopyZ);
      this.volClassSetBlend = dispose(this.volClassSetBlend);
      this.volClassBlend = dispose(this.volClassBlend);
      if (!System.instance.capabilities.supportsFragDepth)
        this.volClassCopyZWithPoints = dispose(this.volClassCopyZWithPoints);
    }
  }

  public get isDisposed(): boolean {
    return undefined === this.composite
      && undefined === this.occlusion
      && undefined === this.occlusionXBlur
      && undefined === this.occlusionYBlur
      && undefined === this.volClassColorStencil
      && undefined === this.volClassCopyZ
      && undefined === this.volClassSetBlend
      && undefined === this.volClassBlend
      && undefined === this.volClassCopyZWithPoints;
  }

  public dispose() {
    this.composite = dispose(this.composite);
    this.occlusion = dispose(this.occlusion);
    this.occlusionXBlur = dispose(this.occlusionXBlur);
    this.occlusionYBlur = dispose(this.occlusionYBlur);
    this.disableVolumeClassifier();
  }
}

interface BatchInfo {
  featureTable: PackedFeatureTable;
  iModel?: IModelConnection;
  tileId?: string;
}

// Represents a view of data read from a region of the frame buffer.
class PixelBuffer implements Pixel.Buffer {
  private readonly _rect: ViewRect;
  private readonly _selector: Pixel.Selector;
  private readonly _featureId?: Uint32Array;
  private readonly _depthAndOrder?: Uint32Array;
  private readonly _batchState: BatchState;

  private get _numPixels(): number { return this._rect.width * this._rect.height; }

  private getPixelIndex(x: number, y: number): number {
    if (x < this._rect.left || y < this._rect.top)
      return this._numPixels;

    x -= this._rect.left;
    y -= this._rect.top;
    if (x >= this._rect.width || y >= this._rect.height)
      return this._numPixels;

    // NB: View coords have origin at top-left; GL at bottom-left. So our rows are upside-down.
    y = this._rect.height - 1 - y;
    return y * this._rect.width + x;
  }

  private getPixel32(data: Uint32Array, pixelIndex: number): number | undefined {
    return pixelIndex < data.length ? data[pixelIndex] : undefined;
  }

  private getFeature(pixelIndex: number): Feature | undefined {
    const featureId = this.getFeatureId(pixelIndex);
    return undefined !== featureId ? this._batchState.getFeature(featureId) : undefined;
  }

  private getFeatureId(pixelIndex: number): number | undefined {
    return undefined !== this._featureId ? this.getPixel32(this._featureId, pixelIndex) : undefined;
  }

  private getBatchInfo(pixelIndex: number): BatchInfo | undefined {
    const featureId = this.getFeatureId(pixelIndex);
    if (undefined !== featureId) {
      const batch = this._batchState.find(featureId);
      if (undefined !== batch)
        return { featureTable: batch.featureTable, iModel: batch.batchIModel, tileId: batch.tileId };
    }

    return undefined;
  }

  private readonly _scratchUint32Array = new Uint32Array(1);
  private readonly _scratchUint8Array = new Uint8Array(this._scratchUint32Array.buffer);
  private readonly _scratchVector3d = new Vector3d();
  private readonly _mult = new Vector3d(1.0, 1.0 / 255.0, 1.0 / 65025.0);
  private decodeDepthRgba(depthAndOrder: number): number {
    this._scratchUint32Array[0] = depthAndOrder;
    const bytes = this._scratchUint8Array;
    const fpt = Vector3d.create(bytes[1] / 255.0, bytes[2] / 255.0, bytes[3] / 255.0, this._scratchVector3d);
    let depth = fpt.dotProduct(this._mult);

    assert(0.0 <= depth);
    assert(1.01 >= depth); // rounding error...

    depth = Math.min(1.0, depth);
    depth = Math.max(0.0, depth);

    return depth;
  }

  private decodeRenderOrderRgba(depthAndOrder: number): RenderOrder {
    this._scratchUint32Array[0] = depthAndOrder;
    const encByte = this._scratchUint8Array[0];
    const enc = encByte / 255.0;
    const dec = Math.floor(16.0 * enc + 0.5);
    return dec;
  }

  private readonly _invalidPixelData = new Pixel.Data();
  public getPixel(x: number, y: number): Pixel.Data {
    const px = this._invalidPixelData;
    const index = this.getPixelIndex(x, y);
    if (index >= this._numPixels)
      return px;

    // Initialize to the defaults...
    let distanceFraction = px.distanceFraction;
    let geometryType = px.type;
    let planarity = px.planarity;

    const haveFeatureIds = Pixel.Selector.None !== (this._selector & Pixel.Selector.Feature);
    const feature = haveFeatureIds ? this.getFeature(index) : undefined;
    const batchInfo = haveFeatureIds ? this.getBatchInfo(index) : undefined;
    if (Pixel.Selector.None !== (this._selector & Pixel.Selector.GeometryAndDistance) && undefined !== this._depthAndOrder) {
      const depthAndOrder = this.getPixel32(this._depthAndOrder, index);
      if (undefined !== depthAndOrder) {
        distanceFraction = this.decodeDepthRgba(depthAndOrder);

        const orderWithPlanarBit = this.decodeRenderOrderRgba(depthAndOrder);
        const order = orderWithPlanarBit & ~RenderOrder.PlanarBit;
        planarity = (orderWithPlanarBit === order) ? Pixel.Planarity.NonPlanar : Pixel.Planarity.Planar;
        switch (order) {
          case RenderOrder.None:
            geometryType = Pixel.GeometryType.None;
            planarity = Pixel.Planarity.None;
            break;
          case RenderOrder.Background:
          case RenderOrder.BlankingRegion:
          case RenderOrder.LitSurface:
          case RenderOrder.UnlitSurface:
            geometryType = Pixel.GeometryType.Surface;
            break;
          case RenderOrder.Linear:
            geometryType = Pixel.GeometryType.Linear;
            break;
          case RenderOrder.Edge:
            geometryType = Pixel.GeometryType.Edge;
            break;
          case RenderOrder.Silhouette:
            geometryType = Pixel.GeometryType.Silhouette;
            break;
          default:
            // ###TODO: may run into issues with point clouds - they are not written correctly in C++.
            assert(false, "Invalid render order");
            geometryType = Pixel.GeometryType.None;
            planarity = Pixel.Planarity.None;
            break;
        }
      }
    }

    let featureTable, iModel, tileId;
    if (undefined !== batchInfo) {
      featureTable = batchInfo.featureTable;
      iModel = batchInfo.iModel;
      tileId = batchInfo.tileId;
    }

    return new Pixel.Data(feature, distanceFraction, geometryType, planarity, featureTable, iModel, tileId);
  }

  private constructor(rect: ViewRect, selector: Pixel.Selector, compositor: SceneCompositor) {
    this._rect = rect.clone();
    this._selector = selector;
    this._batchState = compositor.target.uniforms.batch.state;

    if (Pixel.Selector.None !== (selector & Pixel.Selector.GeometryAndDistance)) {
      const depthAndOrderBytes = compositor.readDepthAndOrder(rect);
      if (undefined !== depthAndOrderBytes)
        this._depthAndOrder = new Uint32Array(depthAndOrderBytes.buffer);
      else
        this._selector &= ~Pixel.Selector.GeometryAndDistance;
    }

    if (Pixel.Selector.None !== (selector & Pixel.Selector.Feature)) {
      const features = compositor.readFeatureIds(rect);
      if (undefined !== features)
        this._featureId = new Uint32Array(features.buffer);
      else
        this._selector &= ~Pixel.Selector.Feature;
    }
  }

  public get isEmpty(): boolean { return Pixel.Selector.None === this._selector; }

  public static create(rect: ViewRect, selector: Pixel.Selector, compositor: SceneCompositor): Pixel.Buffer | undefined {
    const pdb = new PixelBuffer(rect, selector, compositor);
    return pdb.isEmpty ? undefined : pdb;
  }
}

/** Orchestrates rendering of the scene on behalf of a Target.
 * This base class exists only so we don't have to export all the types of the shared Compositor members like Textures, FrameBuffers, etc.
 * @internal
 */
export abstract class SceneCompositor implements WebGLDisposable, RenderMemory.Consumer {
  public readonly target: Target;
  public readonly solarShadowMap: SolarShadowMap;

  public abstract get currentRenderTargetIndex(): number;
  public abstract set currentRenderTargetIndex(_index: number);
  public abstract get isDisposed(): boolean;
  public abstract dispose(): void;
  public abstract preDraw(): void;
  public abstract draw(_commands: RenderCommands): void;
  public abstract drawForReadPixels(_commands: RenderCommands, sceneOverlays: GraphicList, overlayDecorations: GraphicList | undefined): void;
  public abstract readPixels(rect: ViewRect, selector: Pixel.Selector): Pixel.Buffer | undefined;
  public abstract readDepthAndOrder(rect: ViewRect): Uint8Array | undefined;
  public abstract readFeatureIds(rect: ViewRect): Uint8Array | undefined;
  public abstract updateSolarShadows(context: SceneContext | undefined): void;

  /** Obtain a framebuffer with a single spare RGBA texture that can be used for screen-space effect shaders. */
  public abstract get screenSpaceEffectFbo(): FrameBuffer;

  public abstract get featureIds(): TextureHandle;
  public abstract get depthAndOrder(): TextureHandle;
  public abstract get antialiasSamples(): number;

  protected constructor(target: Target) {
    this.target = target;
    this.solarShadowMap = new SolarShadowMap(target);
  }

  public static create(target: Target): SceneCompositor {
    return System.instance.capabilities.supportsDrawBuffers ? new MRTCompositor(target) : new MPCompositor(target);
  }

  public abstract collectStatistics(stats: RenderMemory.Statistics): void;
}

// The actual base class. Specializations are provided based on whether or not multiple render targets are supported.
abstract class Compositor extends SceneCompositor {
  protected _width: number = -1;
  protected _height: number = -1;
  protected _includeOcclusion: boolean = false;
  protected _textures = new Textures();
  protected _depth?: DepthBuffer;
  protected _depthMS?: DepthBuffer; // multisample depth buffer
  protected _frameBuffers: FrameBuffers;
  protected _geom: Geometry;
  protected _readPickDataFromPingPong: boolean = true;
  protected _opaqueRenderState = new RenderState();
  protected _layerRenderState = new RenderState();
  protected _translucentRenderState = new RenderState();
  protected _hiliteRenderState = new RenderState();
  protected _noDepthMaskRenderState = new RenderState();
  protected _backgroundMapRenderState = new RenderState();
  protected _debugStencil: number = 0; // 0 to draw stencil volumes normally, 1 to draw as opaque, 2 to draw blended
  protected _vcBranchState?: BranchState;
  protected _vcSetStencilRenderState?: RenderState;
  protected _vcCopyZRenderState?: RenderState;
  protected _vcColorRenderState?: RenderState;
  protected _vcBlendRenderState?: RenderState;
  protected _vcPickDataRenderState?: RenderState;
  protected _vcDebugRenderState?: RenderState;
  protected _vcAltDepthStencil?: DepthBuffer;
  protected _vcAltDepthStencilMS?: DepthBuffer;
  protected _haveVolumeClassifier: boolean = false;
  protected _antialiasSamples: number = 1;
  protected readonly _viewProjectionMatrix = new Matrix4();

  public abstract override get currentRenderTargetIndex(): number;
  public abstract override set currentRenderTargetIndex(_index: number);

  protected abstract clearOpaque(_needComposite: boolean): void;
  protected abstract renderLayers(_commands: RenderCommands, _needComposite: boolean, pass: RenderPass): void;
  protected abstract renderOpaque(_commands: RenderCommands, _compositeFlags: CompositeFlags, _renderForReadPixels: boolean): void;
  protected abstract renderForVolumeClassification(_commands: RenderCommands, _compositeFlags: CompositeFlags, _renderForReadPixels: boolean): void;
  protected abstract renderIndexedClassifierForReadPixels(_commands: DrawCommands, state: RenderState, renderForIntersectingVolumes: boolean, _needComposite: boolean): void;
  protected abstract clearTranslucent(): void;
  protected abstract renderTranslucent(_commands: RenderCommands): void;
  protected abstract getBackgroundFbo(_needComposite: boolean): FrameBuffer;
  protected abstract pingPong(): void;

  public get antialiasSamples(): number { return this._antialiasSamples; }

  protected get useMsBuffers(): boolean { return this._antialiasSamples > 1 && !this.target.isReadPixelsInProgress; }

  protected enableVolumeClassifierFbos(textures: Textures, depth: DepthBuffer, volClassDepth: DepthBuffer | undefined, depthMS?: DepthBuffer, volClassDepthMS?: DepthBuffer): void {
    this._frameBuffers.enableVolumeClassifier(textures, depth, volClassDepth, depthMS, volClassDepthMS);
  }
  protected disableVolumeClassifierFbos(): void { this._frameBuffers.disableVolumeClassifier(); }

  /** This function generates a texture that contains ambient occlusion information to be applied later. */
  protected renderAmbientOcclusion() {
    const system = System.instance;

    // Render unblurred ambient occlusion based on depth buffer
    let fbo = this._frameBuffers.occlusion!;
    this.target.beginPerfMetricRecord("Compute AO");
    system.frameBufferStack.execute(fbo, true, false, () => {
      System.instance.applyRenderState(RenderState.defaults);
      const params = getDrawParams(this.target, this._geom.occlusion!);
      this.target.techniques.draw(params);
    });
    this.target.endPerfMetricRecord();

    // Render the X-blurred ambient occlusion based on unblurred ambient occlusion
    fbo = this._frameBuffers.occlusionBlur!;
    this.target.beginPerfMetricRecord("Blur AO X");
    system.frameBufferStack.execute(fbo, true, false, () => {
      System.instance.applyRenderState(RenderState.defaults);
      const params = getDrawParams(this.target, this._geom.occlusionXBlur!);
      this.target.techniques.draw(params);
    });
    this.target.endPerfMetricRecord();

    // Render the Y-blurred ambient occlusion based on X-blurred ambient occlusion (render into original occlusion framebuffer)
    fbo = this._frameBuffers.occlusion!;
    this.target.beginPerfMetricRecord("Blur AO Y");
    system.frameBufferStack.execute(fbo, true, false, () => {
      System.instance.applyRenderState(RenderState.defaults);
      const params = getDrawParams(this.target, this._geom.occlusionYBlur!);
      this.target.techniques.draw(params);
    });
    this.target.endPerfMetricRecord();
  }

  protected constructor(target: Target, fbos: FrameBuffers, geometry: Geometry) {
    super(target);

    this._frameBuffers = fbos;
    this._geom = geometry;

    this._opaqueRenderState.flags.depthTest = true;

    this._translucentRenderState.flags.depthMask = false;
    this._translucentRenderState.flags.blend = this._translucentRenderState.flags.depthTest = true;
    this._translucentRenderState.blend.setBlendFuncSeparate(GL.BlendFactor.One, GL.BlendFactor.Zero, GL.BlendFactor.One, GL.BlendFactor.OneMinusSrcAlpha);

    this._hiliteRenderState.flags.depthMask = false;
    this._hiliteRenderState.flags.blend = true;
    this._hiliteRenderState.blend.functionDestRgb = GL.BlendFactor.One;
    this._hiliteRenderState.blend.functionDestAlpha = GL.BlendFactor.One;

    this._noDepthMaskRenderState.flags.depthMask = false;

    // Background map supports transparency, even when depth is off, which is mostly useless but should blend with background color / skybox.
    this._backgroundMapRenderState.flags.depthMask = false;
    this._backgroundMapRenderState.flags.blend = true;
    this._backgroundMapRenderState.blend.setBlendFunc(GL.BlendFactor.One, GL.BlendFactor.OneMinusSrcAlpha);

    // Can't write depth without enabling depth test - so make depth test always pass
    this._layerRenderState.flags.depthTest = true;
    this._layerRenderState.depthFunc = GL.DepthFunc.Always;
    this._layerRenderState.blend.setBlendFunc(GL.BlendFactor.One, GL.BlendFactor.OneMinusSrcAlpha);
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    if (undefined !== this._depth)
      stats.addTextureAttachment(this._depth.bytesUsed);
    if (undefined !== this._depthMS)
      stats.addTextureAttachment(this._depthMS.bytesUsed);
    this._textures.collectStatistics(stats);
    this._geom.collectStatistics(stats);
  }

  public preDraw(): boolean {
    const rect = this.target.viewRect;
    const width = rect.width;
    const height = rect.height;
    const includeOcclusion = this.target.wantAmbientOcclusion;
    const wantVolumeClassifier = (undefined !== this.target.activeVolumeClassifierProps);
    let wantAntialiasSamples = this.target.antialiasSamples <= 1 || !System.instance.capabilities.supportsDrawBuffers ? 1 : this.target.antialiasSamples;
    if (wantAntialiasSamples > System.instance.capabilities.maxAntialiasSamples)
      wantAntialiasSamples = System.instance.capabilities.maxAntialiasSamples;
    const changeAntialiasSamples = (this._antialiasSamples > 1 && wantAntialiasSamples > 1 && this._antialiasSamples !== wantAntialiasSamples);

    // If not yet initialized, or dimensions changed, or antialiasing changed the number of samples, initialize.
    if (undefined === this._textures.accumulation || width !== this._width || height !== this._height || changeAntialiasSamples) {
      this._width = width;
      this._height = height;
      this._antialiasSamples = wantAntialiasSamples;

      // init() first calls dispose(), which releases all of our fbos, textures, etc, and resets the _includeOcclusion flag.
      if (!this.init()) {
        assert(false, "Failed to initialize scene compositor");
        return false;
      }
    } else if (this._antialiasSamples !== wantAntialiasSamples) {
      // Turn on or off multisampling.  Rather than just re-initializing, we can save the
      // non multisampled textures & FBOs and just try to add or delete the multisampled ones.
      this._antialiasSamples = wantAntialiasSamples;
      if (wantVolumeClassifier && this._haveVolumeClassifier) {
        // Multisampling and volume classification buffers are somewhat co-dependent so if volume classification is on
        // and is staying on, just disable volume classifiers and let them get re-enabled later.
        this.disableVolumeClassifierFbos();
        this._geom.disableVolumeClassifier();
        this._textures.disableVolumeClassifier();
        if (undefined !== this._vcAltDepthStencil) {
          this._vcAltDepthStencil.dispose();
          this._vcAltDepthStencil = undefined;
        }
        this._haveVolumeClassifier = false;
      }
      if (this._antialiasSamples > 1) {
        if (!this.enableMultiSampling()) {
          assert(false, "Failed to initialize multisampling buffers");
          return false;
        }
      } else {
        if (!this.disableMultiSampling()) {
          assert(false, "Failed to initialize multisampling buffers");
          return false;
        }
      }
    }

    // Allocate or free ambient occlusion-related resources if necessary
    if (includeOcclusion !== this._includeOcclusion) {
      this._includeOcclusion = includeOcclusion;
      if (includeOcclusion) {
        if (!this._textures.enableOcclusion(width, height)) {
          assert(false, "Failed to initialize occlusion textures");
          return false;
        }
      } else {
        this._textures.disableOcclusion();
      }

      this._frameBuffers.toggleOcclusion(this._textures);
      this._geom.toggleOcclusion(this._textures);
    }

    // Allocate or free volume classifier-related resources if necessary.  Make sure that we have depth/stencil.
    if (wantVolumeClassifier !== this._haveVolumeClassifier) {
      if (wantVolumeClassifier && DepthType.TextureUnsignedInt24Stencil8 === System.instance.capabilities.maxDepthType) {
        this._vcAltDepthStencil = System.instance.createDepthBuffer(width, height) as TextureHandle;
        if (undefined !== this._depthMS)
          this._vcAltDepthStencilMS = System.instance.createDepthBuffer(width, height, this._antialiasSamples) as TextureHandle;
        if (undefined === this._vcAltDepthStencil || (undefined !== this._depthMS && undefined === this._vcAltDepthStencilMS)) {
          assert(false, "Failed to initialize volume classifier depth buffer");
          return false;
        }
        if (!this._textures.enableVolumeClassifier(width, height, this._antialiasSamples)) {
          assert(false, "Failed to initialize volume classifier textures");
          return false;
        }
        if (!this._geom.enableVolumeClassifier(this._textures, this._depth!, width, height)) {
          assert(false, "Failed to initialize volume classifier geometry");
          return false;
        }
        this.enableVolumeClassifierFbos(this._textures, this._depth!, this._vcAltDepthStencil, this._depthMS, this._vcAltDepthStencilMS);
        this._haveVolumeClassifier = true;
      } else {
        this.disableVolumeClassifierFbos();
        this._geom.disableVolumeClassifier();
        this._textures.disableVolumeClassifier();
        if (undefined !== this._vcAltDepthStencil) {
          this._vcAltDepthStencil.dispose();
          this._vcAltDepthStencil = undefined;
        }
        this._haveVolumeClassifier = false;
      }
    }

    return true;
  }

  public draw(commands: RenderCommands) {
    if (!this.preDraw()) {
      assert(false);
      return;
    }

    const compositeFlags = commands.compositeFlags;
    const needComposite = CompositeFlags.None !== compositeFlags;

    // Clear output targets
    this.target.frameStatsCollector.beginTime("opaqueTime");
    this.target.beginPerfMetricRecord("Clear Opaque");
    this.clearOpaque(needComposite);
    this.target.endPerfMetricRecord();
    this.target.frameStatsCollector.endTime("opaqueTime");

    this.target.frameStatsCollector.beginTime("backgroundTime"); // includes skybox

    // Render the background
    this.target.beginPerfMetricRecord("Render Background");
    this.renderBackground(commands, needComposite);
    this.target.endPerfMetricRecord();

    // Render the sky box
    this.target.beginPerfMetricRecord("Render Skybox");
    this.renderSkyBox(commands, needComposite);
    this.target.endPerfMetricRecord();

    // Render the background map graphics
    this.target.beginPerfMetricRecord("Render Background Map");
    this.renderBackgroundMap(commands, needComposite);
    this.target.endPerfMetricRecord();

    this.target.frameStatsCollector.endTime("backgroundTime");

    // Enable clipping
    this.target.beginPerfMetricRecord("Enable Clipping");
    this.target.pushViewClip();
    this.target.endPerfMetricRecord();

    // Render volume classification first so that we only classify the reality data
    this.target.frameStatsCollector.beginTime("classifiersTime");
    this.target.beginPerfMetricRecord("Render VolumeClassification");
    this.renderVolumeClassification(commands, compositeFlags, false);
    this.target.endPerfMetricRecord();
    this.target.frameStatsCollector.endTime("classifiersTime");

    this.target.frameStatsCollector.beginTime("opaqueTime");

    // Render layers
    this.target.beginPerfMetricRecord("Render Opaque Layers");
    this.renderLayers(commands, needComposite, RenderPass.OpaqueLayers);
    this.target.endPerfMetricRecord();

    // Render opaque geometry
    this.target.frameStatsCollector.beginTime("onRenderOpaqueTime");
    IModelFrameLifecycle.onRenderOpaque.raiseEvent({
      commands,
      needComposite,
      compositeFlags,
      fbo: this.getBackgroundFbo(needComposite),
      frameBufferStack: System.instance.frameBufferStack,
    });
    this.target.frameStatsCollector.endTime("onRenderOpaqueTime");

    // Render opaque geometry
    this.target.beginPerfMetricRecord("Render Opaque");
    this.renderOpaque(commands, compositeFlags, false);
    this.target.endPerfMetricRecord();

    this.target.frameStatsCollector.endTime("opaqueTime");

    this.target.frameStatsCollector.beginTime("translucentTime");

    // Render translucent layers
    this.target.beginPerfMetricRecord("Render Translucent Layers");
    this.renderLayers(commands, needComposite, RenderPass.TranslucentLayers);
    this.target.endPerfMetricRecord();

    if (needComposite) {
      this._geom.composite!.update(compositeFlags);
      this.target.beginPerfMetricRecord("Render Translucent");
      this.clearTranslucent();
      this.renderTranslucent(commands);
      this.target.endPerfMetricRecord();

      this.target.frameStatsCollector.endTime("translucentTime");

      this.target.beginPerfMetricRecord("Render Hilite");
      this.renderHilite(commands);
      this.target.endPerfMetricRecord();

      this.target.beginPerfMetricRecord("Composite");
      this.composite();
      this.target.endPerfMetricRecord();
    } else
      this.target.frameStatsCollector.endTime("translucentTime");

    // Render overlay Layers
    this.target.frameStatsCollector.beginTime("overlaysTime");
    this.target.beginPerfMetricRecord("Render Overlay Layers");
    this.renderLayers(commands, false, RenderPass.OverlayLayers);
    this.target.endPerfMetricRecord();
    this.target.frameStatsCollector.endTime("overlaysTime");

    this.target.popViewClip();
  }

  public get fullHeight(): number { return this.target.viewRect.height; }

  public drawForReadPixels(commands: RenderCommands, sceneOverlays: GraphicList, overlayDecorations: GraphicList | undefined): void {
    this.target.beginPerfMetricRecord("Render Background", true);
    if (!this.preDraw()) {
      this.target.endPerfMetricRecord(true); // End Render Background record if returning
      assert(false);
      return;
    }

    this.clearOpaque(false);
    this.target.endPerfMetricRecord(true);

    // On entry the RenderCommands has been initialized for all scene graphics and pickable decorations with the exception of world overlays.
    // It's possible we have no pickable scene graphics or decorations, but do have pickable world overlays.
    const haveRenderCommands = !commands.isEmpty;
    if (haveRenderCommands) {
      this.target.beginPerfMetricRecord("Enable Clipping", true);
      this.target.pushViewClip();
      this.target.endPerfMetricRecord(true);

      this.target.beginPerfMetricRecord("Render VolumeClassification", true);
      this.renderVolumeClassification(commands, CompositeFlags.None, true);
      this.target.endPerfMetricRecord(true);

      // RenderPass.BackgroundMap is used only when depth is turned off for the map.
      // Ensure it draws before any opaque geometry (including layers), without depth.
      this.target.beginPerfMetricRecord("Render background map", true);
      this.target.drawingBackgroundForReadPixels = true;
      this.renderLayers(commands, false, RenderPass.BackgroundMap);
      this.target.drawingBackgroundForReadPixels = false;
      this.target.endPerfMetricRecord(true);

      this.target.beginPerfMetricRecord("Render Opaque Layers", true);
      this.renderLayers(commands, false, RenderPass.OpaqueLayers);
      this.target.endPerfMetricRecord(true);

      this.target.beginPerfMetricRecord("Render Opaque", true);
      this.renderOpaque(commands, CompositeFlags.None, true);
      this.target.endPerfMetricRecord(true);

      this.target.beginPerfMetricRecord("Render Translucent Layers", true);
      this.renderLayers(commands, false, RenderPass.TranslucentLayers);
      this.target.endPerfMetricRecord(true);

      this.target.beginPerfMetricRecord("Render Overlay Layers", true);
      this.renderLayers(commands, false, RenderPass.OverlayLayers);
      this.target.endPerfMetricRecord(true);

      this.target.popViewClip();
    }

    if (0 === sceneOverlays.length && (undefined === overlayDecorations || 0 === overlayDecorations.length))
      return;

    // Now populate the opaque passes with any pickable world overlays
    this.target.beginPerfMetricRecord("Overlay Draws", true);
    commands.initForPickOverlays(sceneOverlays, overlayDecorations);
    if (commands.isEmpty) {
      this.target.endPerfMetricRecord(true); // End Overlay Draws record if returning
      return;
    }

    // Clear the depth buffer so that overlay decorations win the depth test.
    // (If *only* overlays exist, then clearOpaque() above already took care of this).
    if (haveRenderCommands) {
      const system = System.instance;
      system.frameBufferStack.execute(this._frameBuffers.opaqueColor!, true, this.useMsBuffers, () => {
        system.applyRenderState(RenderState.defaults);
        system.context.clearDepth(1.0);
        system.context.clear(GL.BufferBit.Depth);
      });
    }

    // Render overlays as opaque into the pick buffers. Make sure we use the decoration state (to ignore symbology overrides, esp. the non-locatable flag).
    this.target.decorationsState.viewFlags.transparency = false;
    this.renderOpaque(commands, CompositeFlags.None, true);
    this.target.endPerfMetricRecord();
    this.target.decorationsState.viewFlags.transparency = true;
  }

  public readPixels(rect: ViewRect, selector: Pixel.Selector): Pixel.Buffer | undefined {
    return PixelBuffer.create(rect, selector, this);
  }

  public readDepthAndOrder(rect: ViewRect): Uint8Array | undefined { return this.readFrameBuffer(rect, this._frameBuffers.depthAndOrder); }

  public readFeatureIds(rect: ViewRect): Uint8Array | undefined {
    const tex = this._textures.featureId;
    if (undefined === tex)
      return undefined;

    const fbo = FrameBuffer.create([tex]);
    const result = this.readFrameBuffer(rect, fbo);

    dispose(fbo);

    return result;
  }

  public updateSolarShadows(context: SceneContext | undefined): void {
    this.solarShadowMap.update(context);
  }

  public get screenSpaceEffectFbo(): FrameBuffer {
    assert(undefined !== this._frameBuffers.hilite);
    return this._frameBuffers.hilite;
  }

  private readFrameBuffer(rect: ViewRect, fbo?: FrameBuffer): Uint8Array | undefined {
    if (undefined === fbo || !Debug.isValidFrameBuffer)
      return undefined;

    // NB: ViewRect origin at top-left; GL origin at bottom-left
    const bottom = this.fullHeight - rect.bottom;
    const gl = System.instance.context;
    const bytes = new Uint8Array(rect.width * rect.height * 4);
    let result: Uint8Array | undefined = bytes;
    System.instance.frameBufferStack.execute(fbo, true, false, () => {
      try {
        gl.readPixels(rect.left, bottom, rect.width, rect.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      } catch (e) {
        result = undefined;
      }
    });

    return result;
  }

  public get isDisposed(): boolean {
    return undefined === this._depth
      && undefined === this._vcAltDepthStencil
      && !this._includeOcclusion
      && this._textures.isDisposed
      && this._frameBuffers.isDisposed
      && this._geom.isDisposed
      && !this._haveVolumeClassifier
      && this.solarShadowMap.isDisposed;
  }

  public dispose() {
    this.reset();
    dispose(this.solarShadowMap);
  }

  // Resets anything that depends on the dimensions of the render target.
  // Does *not* dispose the solar shadow map.
  private reset() {
    this._depth = dispose(this._depth);
    this._depthMS = dispose(this._depthMS);
    this._vcAltDepthStencil = dispose(this._vcAltDepthStencil);
    this._includeOcclusion = false;
    dispose(this._textures);
    dispose(this._frameBuffers);
    dispose(this._geom);
    this._haveVolumeClassifier = false;
  }

  private init(): boolean {
    this.reset();
    this._depth = System.instance.createDepthBuffer(this._width, this._height, 1);
    if (this._antialiasSamples > 1)
      this._depthMS = System.instance.createDepthBuffer(this._width, this._height, this._antialiasSamples);
    else
      this._depthMS = undefined;
    if (this._depth !== undefined) {
      return this._textures.init(this._width, this._height, this._antialiasSamples)
        && this._frameBuffers.init(this._textures, this._depth, this._depthMS)
        && this._geom.init(this._textures);
    }
    return false;
  }

  protected enableMultiSampling(): boolean {
    // Assume that non-multisampled stuff is already allocated.  Just need to add multisampled textures, buffers, & geometry.
    assert(undefined === this._depthMS && undefined !== this._depth);
    this._depthMS = System.instance.createDepthBuffer(this._width, this._height, this._antialiasSamples);
    if (undefined === this._depthMS)
      return false;
    return this._textures.enableMultiSampling(this._width, this._height, this._antialiasSamples);
  }

  protected disableMultiSampling(): boolean {
    // Want to disable multisampling without deleting & reallocating other stuff.
    this._depthMS = dispose(this._depthMS);
    assert(undefined !== this._depth);
    return this._textures.disableMultiSampling();
  }

  private renderBackgroundMap(commands: RenderCommands, needComposite: boolean) {
    const cmds = commands.getCommands(RenderPass.BackgroundMap);
    if (0 === cmds.length) {
      return;
    }

    const fbStack = System.instance.frameBufferStack;
    const fbo = this.getBackgroundFbo(needComposite);
    fbStack.execute(fbo, true, this.useMsBuffers, () => {
      System.instance.applyRenderState(this.getRenderState(RenderPass.BackgroundMap));
      this.target.techniques.execute(this.target, cmds, RenderPass.BackgroundMap);
    });
  }

  private renderSkyBox(commands: RenderCommands, needComposite: boolean) {
    const cmds = commands.getCommands(RenderPass.SkyBox);
    if (0 === cmds.length) {
      return;
    }

    const fbStack = System.instance.frameBufferStack;
    const fbo = this.getBackgroundFbo(needComposite);
    fbStack.execute(fbo, true, this.useMsBuffers, () => {
      System.instance.applyRenderState(this.getRenderState(RenderPass.SkyBox));
      this.target.techniques.execute(this.target, cmds, RenderPass.SkyBox);
    });
  }

  private renderBackground(commands: RenderCommands, needComposite: boolean) {
    const cmds = commands.getCommands(RenderPass.Background);
    if (0 === cmds.length)
      return;

    const fbStack = System.instance.frameBufferStack;
    const fbo = this.getBackgroundFbo(needComposite);
    fbStack.execute(fbo, true, this.useMsBuffers, () => {
      System.instance.applyRenderState(this.getRenderState(RenderPass.Background));
      this.target.techniques.execute(this.target, cmds, RenderPass.Background);
    });
  }

  private createVolumeClassifierStates() {
    // If we have already created a branch state for use in rendering the volume classifiers we must at least swap out its symbology overrides for the current one.
    if (undefined !== this._vcBranchState) {
      this._vcBranchState.symbologyOverrides = this.target.uniforms.branch.top.symbologyOverrides;
      return;
    }

    // Create a BranchState and several RenderStates to use when drawing the classifier volumes.
    // The BranchState needs to be created every time in case the symbology overrides changes.
    // It is based off of the current state, but turns off unnecessary and unwanted options, lighting being the most important.
    const top = this.target.uniforms.branch.top;
    const vf = ViewFlags.createFrom(top.viewFlags);
    vf.renderMode = RenderMode.SmoothShade;
    vf.lighting = false;
    vf.solarLight = false;
    vf.sourceLights = false;
    vf.cameraLights = false;
    vf.forceSurfaceDiscard = false;
    vf.hiddenEdges = false;
    vf.materials = false;
    vf.noGeometryMap = true;
    vf.textures = false;
    vf.transparency = false;
    vf.visibleEdges = false;
    this._vcBranchState = new BranchState({
      symbologyOverrides: top.symbologyOverrides,
      viewFlags: vf,
      transform: Transform.createIdentity(),
      clipVolume: top.clipVolume,
      planarClassifier: top.planarClassifier,
      iModel: top.iModel,
      is3d: top.is3d,
      edgeSettings: top.edgeSettings,
    });

    this._vcSetStencilRenderState = new RenderState();
    this._vcCopyZRenderState = new RenderState();
    this._vcColorRenderState = new RenderState();
    this._vcBlendRenderState = new RenderState();
    this._vcPickDataRenderState = new RenderState();

    this._vcCopyZRenderState.flags.depthTest = true;
    this._vcCopyZRenderState.flags.depthMask = true;
    this._vcCopyZRenderState.depthFunc = GL.DepthFunc.Always;
    this._vcCopyZRenderState.flags.colorWrite = true;
    this._vcCopyZRenderState.flags.stencilTest = true;
    this._vcCopyZRenderState.stencil.frontFunction.function = GL.StencilFunction.Always;
    this._vcCopyZRenderState.stencil.frontOperation.fail = GL.StencilOperation.Zero;
    this._vcCopyZRenderState.stencil.frontOperation.zFail = GL.StencilOperation.Zero;
    this._vcCopyZRenderState.stencil.frontOperation.zPass = GL.StencilOperation.Zero;
    this._vcCopyZRenderState.stencil.backFunction.function = GL.StencilFunction.Always;
    this._vcCopyZRenderState.stencil.backOperation.fail = GL.StencilOperation.Zero;
    this._vcCopyZRenderState.stencil.backOperation.zFail = GL.StencilOperation.Zero;
    this._vcCopyZRenderState.stencil.backOperation.zPass = GL.StencilOperation.Zero;

    this._vcSetStencilRenderState.flags.depthTest = true;
    this._vcSetStencilRenderState.flags.depthMask = false;
    this._vcSetStencilRenderState.flags.colorWrite = false;
    this._vcSetStencilRenderState.flags.stencilTest = true;
    this._vcSetStencilRenderState.depthFunc = GL.DepthFunc.LessOrEqual;
    this._vcSetStencilRenderState.stencil.frontFunction.function = GL.StencilFunction.Always;
    this._vcSetStencilRenderState.stencil.frontOperation.zFail = GL.StencilOperation.IncrWrap;
    this._vcSetStencilRenderState.stencil.backFunction.function = GL.StencilFunction.Always;
    this._vcSetStencilRenderState.stencil.backOperation.zFail = GL.StencilOperation.DecrWrap;

    this._vcPickDataRenderState.flags.depthTest = false;
    this._vcPickDataRenderState.flags.depthMask = false;
    this._vcPickDataRenderState.flags.colorWrite = true;
    this._vcPickDataRenderState.flags.stencilTest = true;
    this._vcPickDataRenderState.flags.cull = true;
    this._vcPickDataRenderState.cullFace = GL.CullFace.Front;
    this._vcPickDataRenderState.stencil.backFunction.function = GL.StencilFunction.NotEqual;
    this._vcPickDataRenderState.stencil.backOperation.zPass = GL.StencilOperation.Zero; // this will clear the stencil
    // Let all of the operations remain at Keep so that the stencil will remain in tact for the subsequent blend draw to the color buffer.

    this._vcColorRenderState.flags.depthTest = false;
    this._vcColorRenderState.flags.depthMask = false;
    this._vcColorRenderState.flags.colorWrite = true;
    this._vcColorRenderState.flags.stencilTest = true;
    this._vcColorRenderState.cullFace = GL.CullFace.Front;
    this._vcColorRenderState.stencil.frontFunction.function = GL.StencilFunction.NotEqual;
    this._vcColorRenderState.stencil.frontOperation.fail = GL.StencilOperation.Zero;
    this._vcColorRenderState.stencil.frontOperation.zFail = GL.StencilOperation.Zero;
    this._vcColorRenderState.stencil.frontOperation.zPass = GL.StencilOperation.Zero; // this will clear the stencil
    this._vcColorRenderState.stencil.backFunction.function = GL.StencilFunction.NotEqual;
    this._vcColorRenderState.stencil.backOperation.fail = GL.StencilOperation.Zero;
    this._vcColorRenderState.stencil.backOperation.zFail = GL.StencilOperation.Zero;
    this._vcColorRenderState.stencil.backOperation.zPass = GL.StencilOperation.Zero; // this will clear the stencil
    this._vcColorRenderState.flags.blend = true; // blend func and color will be set before using

    this._vcBlendRenderState.flags.depthTest = false;
    this._vcBlendRenderState.flags.depthMask = false;
    this._vcBlendRenderState.flags.colorWrite = true;
    this._vcBlendRenderState.flags.stencilTest = false;
    this._vcBlendRenderState.flags.blend = true;
    this._vcBlendRenderState.blend.setBlendFuncSeparate(GL.BlendFactor.SrcAlpha, GL.BlendFactor.Zero, GL.BlendFactor.OneMinusSrcAlpha, GL.BlendFactor.One);

    if (this._debugStencil > 0) {
      this._vcDebugRenderState = new RenderState();
      this._vcDebugRenderState.flags.depthTest = true;
      this._vcDebugRenderState.flags.blend = true;
      this._vcDebugRenderState.blend.setBlendFunc(GL.BlendFactor.OneMinusConstColor, GL.BlendFactor.ConstColor);
      this._vcDebugRenderState.blend.color = [0.67, 0.67, 0.67, 1.0];
    }
  }

  private setAllStencilOps(state: RenderState, op: GL.StencilOperation): void {
    state.stencil.frontOperation.fail = op;
    state.stencil.frontOperation.zFail = op;
    state.stencil.frontOperation.zPass = op;
    state.stencil.backOperation.fail = op;
    state.stencil.backOperation.zFail = op;
    state.stencil.backOperation.zPass = op;
  }

  private renderIndexedVolumeClassifier(cmdsByIndex: DrawCommands, needComposite: boolean) {
    // Set the stencil for the given classifier stencil volume.
    System.instance.frameBufferStack.execute(this._frameBuffers.stencilSet!, false, this.useMsBuffers, () => {
      this.target.pushState(this._vcBranchState!);
      System.instance.applyRenderState(this._vcSetStencilRenderState!);
      this.target.techniques.executeForIndexedClassifier(this.target, cmdsByIndex, RenderPass.Classification);
      this.target.popBranch();
    });
    // Process the stencil for the pick data.
    this.renderIndexedClassifierForReadPixels(cmdsByIndex, this._vcPickDataRenderState!, true, needComposite);
  }

  private renderVolumeClassification(commands: RenderCommands, compositeFlags: CompositeFlags, renderForReadPixels: boolean) {
    // Sometimes we need to render the classifier stencil volumes one at a time, if so draw them from the cmdsByIndex list
    const cmds = commands.getCommands(RenderPass.Classification);
    const cmdsByIndex = commands.getCommands(RenderPass.ClassificationByIndex);
    let numCmdsPerClassifier = 0;
    for (const cmd of cmdsByIndex) { // Figure out how many commands there are per index/primitive
      numCmdsPerClassifier++;
      if ("drawPrimitive" === cmd.opcode) {
        numCmdsPerClassifier += numCmdsPerClassifier - 1;
        break;
      }
    }
    const cmdsForVC = commands.getCommands(RenderPass.VolumeClassifiedRealityData);
    if (!this.target.activeVolumeClassifierProps || (renderForReadPixels && 0 === cmds.length) || 0 === cmdsForVC.length)
      return;

    let outsideFlags = this.target.activeVolumeClassifierProps.flags.outside;
    let insideFlags = this.target.activeVolumeClassifierProps.flags.inside;

    if (this.target.wantThematicDisplay) {
      if (outsideFlags !== SpatialClassifierOutsideDisplay.Off)
        outsideFlags = SpatialClassifierOutsideDisplay.On;
      if (insideFlags !== SpatialClassifierInsideDisplay.Off)
        insideFlags = SpatialClassifierInsideDisplay.On;
    }

    // Render the geometry which we are going to classify.
    this.renderForVolumeClassification(commands, compositeFlags, renderForReadPixels);

    this.createVolumeClassifierStates();

    const fbStack = System.instance.frameBufferStack;
    const needComposite = CompositeFlags.None !== compositeFlags;
    const fboColorAndZ = this.getBackgroundFbo(needComposite);

    if (this._debugStencil > 0) {
      fbStack.execute(fboColorAndZ, true, this.useMsBuffers, () => {
        if (1 === this._debugStencil) {
          System.instance.applyRenderState(this.getRenderState(RenderPass.OpaqueGeneral));
          this.target.techniques.execute(this.target, cmds, RenderPass.OpaqueGeneral);
        } else {
          this.target.pushState(this._vcBranchState!);
          System.instance.applyRenderState(this._vcDebugRenderState!);
          this.target.techniques.execute(this.target, cmds, RenderPass.Classification);
          this.target.popBranch();
        }
      });
      return;
    }

    if (undefined === this._frameBuffers.altZOnly || undefined === this._frameBuffers.stencilSet)
      return;

    if (renderForReadPixels && this.target.vcSupportIntersectingVolumes) {
      // Clear the stencil.
      fbStack.execute(this._frameBuffers.stencilSet, false, this.useMsBuffers, () => {
        System.instance.context.clearStencil(0);
        System.instance.context.clear(GL.BufferBit.Stencil);
      });

      if (this._antialiasSamples > 1 && undefined !== this._depthMS && this.useMsBuffers)
        this._frameBuffers.stencilSet.blitMsBuffersToTextures(true, -1); // make sure that the Z buffer that we are about to read has been blitted

      for (let i = 0; i < cmdsByIndex.length; i += numCmdsPerClassifier)
        this.renderIndexedVolumeClassifier(cmdsByIndex.slice(i, i + numCmdsPerClassifier), needComposite);

      return;
    }

    const needOutsideDraw = SpatialClassifierOutsideDisplay.On !== outsideFlags;
    const needInsideDraw = SpatialClassifierInsideDisplay.On !== insideFlags;
    const doColorByElement = SpatialClassifierInsideDisplay.ElementColor === insideFlags || renderForReadPixels;
    const doColorByElementForIntersectingVolumes = this.target.vcSupportIntersectingVolumes;
    const needAltZ = (doColorByElement && !doColorByElementForIntersectingVolumes) || needOutsideDraw;
    let zOnlyFbo = this._frameBuffers.stencilSet;
    let volClassBlendFbo = this._frameBuffers.volClassCreateBlend;
    let volClassBlendReadZTexture = this._vcAltDepthStencil!.getHandle()!;
    let volClassBlendReadZTextureFbo = this._frameBuffers.altZOnly;
    if (!needAltZ) {
      // Initialize the blend texture and the stencil.
      assert(undefined !== volClassBlendFbo);
      fbStack.execute(volClassBlendFbo, true, this.useMsBuffers, () => {
        System.instance.context.clearColor(0.0, 0.0, 0.0, 0.0);
        System.instance.context.clearStencil(0);
        System.instance.context.clear(GL.BufferBit.Color | GL.BufferBit.Stencil);
      });
    } else {
      // If we are doing color-by-element for the inside do not care about intersecting volumes or we need to color the outside
      // then we need to copy the Z buffer and set up a different zbuffer/stencil to render in.
      zOnlyFbo = this._frameBuffers.altZOnly;
      volClassBlendFbo = this._frameBuffers.volClassCreateBlendAltZ;
      assert(undefined !== volClassBlendFbo);
      volClassBlendReadZTexture = this._depth!.getHandle()!;
      volClassBlendReadZTextureFbo = this._frameBuffers.stencilSet;
      if (this._antialiasSamples > 1 && undefined !== this._depthMS && this.useMsBuffers)
        volClassBlendReadZTextureFbo.blitMsBuffersToTextures(true, -1); // make sure that the Z buffer that we are about to read has been blitted
      // Copy the current Z into the Alt-Z.  At the same time go ahead and clear the stencil and the blend texture.
      fbStack.execute(volClassBlendFbo, true, this.useMsBuffers, () => {
        this.target.pushState(this.target.decorationsState);
        System.instance.applyRenderState(this._vcCopyZRenderState!);
        if (System.instance.capabilities.supportsFragDepth)
          this.target.techniques.draw(getDrawParams(this.target, this._geom.volClassCopyZ!));  // This method uses the EXT_frag_depth extension
        else
          this.target.techniques.draw(getDrawParams(this.target, this._geom.volClassCopyZWithPoints!)); // This method draws GL_POINTS (1 per pixel) to set Z in vertex shader
        System.instance.bindTexture2d(TextureUnit.Zero, undefined);
        this.target.popBranch();
      });
    }

    if (renderForReadPixels) {
      // Set the stencil for all of the classifier volumes.
      System.instance.frameBufferStack.execute(this._frameBuffers.altZOnly, false, this.useMsBuffers, () => {
        this.target.pushState(this._vcBranchState!);
        System.instance.applyRenderState(this._vcSetStencilRenderState!);
        this.target.techniques.execute(this.target, cmds, RenderPass.Classification);
        // After we create the stencil we need to clear the Z for the next step (so also must turn on z writing temporarily).
        this._vcSetStencilRenderState!.flags.depthMask = true;
        System.instance.applyRenderState(this._vcSetStencilRenderState!);
        System.instance.context.clearDepth(1.0);
        System.instance.context.clear(GL.BufferBit.Depth);
        this._vcSetStencilRenderState!.flags.depthMask = false;
        this.target.popBranch();
        System.instance.bindTexture2d(TextureUnit.Two, undefined);
        System.instance.bindTexture2d(TextureUnit.Five, undefined);
      });
      this.target.pushState(this._vcBranchState!);
      this._vcColorRenderState!.flags.depthTest = true;
      this._vcColorRenderState!.flags.depthMask = true;
      this._vcColorRenderState!.flags.cull = true;
      this._vcColorRenderState!.flags.blend = false;
      this.setAllStencilOps(this._vcColorRenderState!, GL.StencilOperation.Keep); // don't clear the stencil so that all classifiers behind reality mesh will still draw
      this.target.activeVolumeClassifierTexture = this._geom.volClassCopyZ!.texture;
      if (this._antialiasSamples > 1 && undefined !== this._depthMS && this.useMsBuffers)
        this._frameBuffers.stencilSet.blitMsBuffersToTextures(true, -1); // make sure that the Z buffer that we are about to read has been blitted
      this.renderIndexedClassifierForReadPixels(cmds, this._vcColorRenderState!, false, needComposite);
      this.target.activeVolumeClassifierTexture = undefined;
      this._vcColorRenderState!.flags.depthTest = false;
      this._vcColorRenderState!.flags.depthMask = false;
      this._vcColorRenderState!.flags.cull = false;
      this._vcColorRenderState!.flags.blend = true;
      this.setAllStencilOps(this._vcColorRenderState!, GL.StencilOperation.Zero);
      System.instance.context.clearStencil(0); // must clear stencil afterwards since we had to draw with stencil set to KEEP
      System.instance.context.clear(GL.BufferBit.Stencil);
      this.target.popBranch();
      System.instance.bindTexture2d(TextureUnit.PlanarClassification, undefined);
      return;
    }

    if ((needOutsideDraw && cmds.length > 0) || (needInsideDraw && !(doColorByElement && doColorByElementForIntersectingVolumes))) {
      // Set the stencil using all of the volume classifiers.  This will be used to do the outside and/or the inside if they need to be done.
      // If we are not modifying the outside and the inside is using color-by-element for intersecting volumes, then the stencil will get set later.
      fbStack.execute(zOnlyFbo, false, this.useMsBuffers, () => {
        this.target.pushState(this._vcBranchState!);
        System.instance.applyRenderState(this._vcSetStencilRenderState!);
        this.target.techniques.execute(this.target, cmds, RenderPass.Classification);
        this.target.popBranch();
        System.instance.bindTexture2d(TextureUnit.Two, undefined);
        System.instance.bindTexture2d(TextureUnit.Five, undefined);
      });
    }
    if (needOutsideDraw) {
      if (this._antialiasSamples > 1 && undefined !== this._depthMS && this.useMsBuffers)
        volClassBlendReadZTextureFbo.blitMsBuffersToTextures(true, -1); // make sure that the Z buffer that we are about to read has been blitted
      fbStack.execute(volClassBlendFbo, false, this.useMsBuffers, () => {
        this._geom.volClassSetBlend!.boundaryType = BoundaryType.Outside;
        this._geom.volClassSetBlend!.texture = volClassBlendReadZTexture;
        this.target.pushState(this.target.decorationsState);
        this._vcColorRenderState!.flags.blend = false;
        this._vcColorRenderState!.stencil.frontFunction.function = GL.StencilFunction.Equal; // temp swap the functions so we get what is not set in the stencil
        this._vcColorRenderState!.stencil.backFunction.function = GL.StencilFunction.Equal;
        if (needInsideDraw)
          this.setAllStencilOps(this._vcColorRenderState!, GL.StencilOperation.Keep); // don't clear the stencil since we'll use it again
        System.instance.applyRenderState(this._vcColorRenderState!);
        const params = getDrawParams(this.target, this._geom.volClassSetBlend!);
        this.target.techniques.draw(params);
        this._vcColorRenderState!.flags.blend = true;
        this._vcColorRenderState!.stencil.frontFunction.function = GL.StencilFunction.NotEqual;
        this._vcColorRenderState!.stencil.backFunction.function = GL.StencilFunction.NotEqual;
        if (needInsideDraw)
          this.setAllStencilOps(this._vcColorRenderState!, GL.StencilOperation.Zero);
        this.target.popBranch();
        System.instance.bindTexture2d(TextureUnit.Zero, undefined); // unbind the depth buffer that we used as a texture as we'll need it as an output later
      });
    }
    if (needInsideDraw) {
      if (!doColorByElement) {
        // In this case our stencil is already set and it is all getting colored the same, so we can just draw with a viewport quad to color it.
        if (this._antialiasSamples > 1 && undefined !== this._depthMS && this.useMsBuffers)
          volClassBlendReadZTextureFbo.blitMsBuffersToTextures(true, -1); // make sure that the Z buffer that we are about to read has been blitted
        fbStack.execute(volClassBlendFbo, false, this.useMsBuffers, () => {
          this._geom.volClassSetBlend!.boundaryType = BoundaryType.Inside;
          this._geom.volClassSetBlend!.texture = volClassBlendReadZTexture;
          this.target.pushState(this.target.decorationsState);
          this._vcColorRenderState!.flags.blend = false;
          System.instance.applyRenderState(this._vcColorRenderState!);
          const params = getDrawParams(this.target, this._geom.volClassSetBlend!);
          this.target.techniques.draw(params);
          this._vcColorRenderState!.flags.blend = true;
          this.target.popBranch();
          System.instance.bindTexture2d(TextureUnit.Zero, undefined);
        });
      } else if (doColorByElementForIntersectingVolumes) {
        // If we have intersecting classifier volumes, then we must stencil them individually to get their colors in the blend texture.
        for (let i = 0; i < cmdsByIndex.length; i += numCmdsPerClassifier) {
          const nxtCmds = cmdsByIndex.slice(i, i + numCmdsPerClassifier);
          // Set the stencil for this one classifier.
          fbStack.execute(zOnlyFbo, false, this.useMsBuffers, () => {
            this.target.pushState(this._vcBranchState!);
            System.instance.applyRenderState(this._vcSetStencilRenderState!);
            this.target.techniques.execute(this.target, nxtCmds, RenderPass.Classification);
            this.target.popBranch();
          });
          // Process the stencil. Just render the volume normally (us opaque pass), but use blending to modify the source alpha that gets written to the blend texture.
          fbStack.execute(volClassBlendFbo, true, this.useMsBuffers, () => {
            this.target.pushState(this._vcBranchState!);
            this._vcColorRenderState!.blend.color = [1.0, 1.0, 1.0, 0.35];
            this._vcColorRenderState!.blend.setBlendFuncSeparate(GL.BlendFactor.One, GL.BlendFactor.ConstAlpha, GL.BlendFactor.Zero, GL.BlendFactor.Zero);
            this._vcColorRenderState!.flags.cull = true;
            System.instance.applyRenderState(this._vcColorRenderState!);
            this.target.activeVolumeClassifierTexture = undefined; // make sure this texture is undefined so we do not use the planar classification shader
            this.target.techniques.execute(this.target, nxtCmds, RenderPass.OpaqueGeneral);
            this._vcColorRenderState!.flags.cull = false;
            this.target.popBranch();
          });
        }
      } else {
        if (this._antialiasSamples > 1 && undefined !== this._depthMS && this.useMsBuffers)
          this._frameBuffers.stencilSet.blitMsBuffersToTextures(true, -1); // make sure that the Z buffer that we are about to read has been blitted
        fbStack.execute(volClassBlendFbo, false, this.useMsBuffers, () => {
          // For coloring the inside by element color we will draw the inside using the the classifiers themselves.
          // To do this we need to first clear our Alt-Z.  The shader will then test and write Z and will discard
          // anything that is in front of the reality model by reading the Z texture from the standard Z buffer (which has the reality mesh Z's in it).
          // What we end up with is the closest volume behind the terrain which works if the classifier volumes do not intersect.
          // Since we need the blend texture to have alpha in it, we will use blending just to modify the alpha that gets written.
          this.target.pushState(this._vcBranchState!);
          this._vcColorRenderState!.blend.color = [1.0, 1.0, 1.0, 0.35];
          this._vcColorRenderState!.blend.setBlendFuncSeparate(GL.BlendFactor.One, GL.BlendFactor.ConstAlpha, GL.BlendFactor.Zero, GL.BlendFactor.Zero);
          this._vcColorRenderState!.flags.depthTest = true;
          this._vcColorRenderState!.flags.depthMask = true;
          this._vcColorRenderState!.flags.cull = true;
          this.setAllStencilOps(this._vcColorRenderState!, GL.StencilOperation.Keep); // don't clear the stencil so that all classifiers behind reality mesh will still draw
          System.instance.applyRenderState(this._vcColorRenderState!);
          System.instance.context.clearDepth(1.0);
          System.instance.context.clear(GL.BufferBit.Depth);
          this.target.activeVolumeClassifierTexture = this._geom.volClassCopyZ!.texture;
          this.target.techniques.execute(this.target, cmds, RenderPass.OpaqueGeneral);
          this.target.activeVolumeClassifierTexture = undefined;
          this._vcColorRenderState!.flags.depthTest = false;
          this._vcColorRenderState!.flags.depthMask = false;
          this._vcColorRenderState!.flags.cull = false;
          this.setAllStencilOps(this._vcColorRenderState!, GL.StencilOperation.Zero);
          System.instance.context.clearStencil(0); // must clear stencil afterwards since we had to draw with stencil set to KEEP
          System.instance.context.clear(GL.BufferBit.Stencil);
          this.target.popBranch();
          System.instance.bindTexture2d(TextureUnit.PlanarClassification, undefined);
        });
      }
    }

    // Handle the selected classifier volumes.  Note though that if color-by-element is being used, then the selected volumes are already hilited
    // and this stage can be skipped.  In order for this to work the list of commands needs to get reduced to only the ones which draw hilited volumes.
    // We cannot use the hillite shader to draw them since it doesn't handle logZ properly (it doesn't need to since it is only used elsewhere when Z write is turned off)
    // and we don't really want another whole set of hilite shaders just for this.
    const cmdsSelected = extractHilitedVolumeClassifierCommands(this.target.hilites, commands.getCommands(RenderPass.HiliteClassification));
    commands.replaceCommands(RenderPass.HiliteClassification, cmdsSelected); // replace the hilite command list for use in hilite pass as well.
    // if (cmdsSelected.length > 0 && insideFlags !== this.target.activeVolumeClassifierProps!.flags.selected) {
    if (!doColorByElement && cmdsSelected.length > 0 && insideFlags !== SpatialClassifierInsideDisplay.Hilite) { // assume selected ones are always hilited
      // Set the stencil using just the hilited volume classifiers.
      fbStack.execute(this._frameBuffers.stencilSet, false, this.useMsBuffers, () => {
        this.target.pushState(this._vcBranchState!);
        System.instance.applyRenderState(this._vcSetStencilRenderState!);
        if (needAltZ) {
          // If we are using the alternate Z then the stencil that goes with the original Z has not been cleared yet, so clear it here.
          System.instance.context.clearStencil(0);
          System.instance.context.clear(GL.BufferBit.Stencil);
        }
        this.target.techniques.execute(this.target, cmdsSelected, RenderPass.Classification);
        this.target.popBranch();
      });
      if (this._antialiasSamples > 1 && undefined !== this._depthMS && this.useMsBuffers)
        this._frameBuffers.altZOnly.blitMsBuffersToTextures(true, -1); // make sure that the Z buffer that we are about to read has been blitted
      fbStack.execute(this._frameBuffers.volClassCreateBlend!, false, this.useMsBuffers, () => {
        this._geom.volClassSetBlend!.boundaryType = BoundaryType.Selected;
        this._geom.volClassSetBlend!.texture = this._vcAltDepthStencil!.getHandle()!; // need to attach the alt depth instead of the real one since it is bound to the frame buffer
        this.target.pushState(this.target.decorationsState);
        this._vcColorRenderState!.flags.blend = false;
        System.instance.applyRenderState(this._vcColorRenderState!);
        const params = getDrawParams(this.target, this._geom.volClassSetBlend!);
        this.target.techniques.draw(params);
        this._vcColorRenderState!.flags.blend = true;
        this.target.popBranch();
        System.instance.bindTexture2d(TextureUnit.Zero, undefined);
      });
    }

    // Now modify the color of the reality mesh by using the blend texture to blend with it.
    if (this._antialiasSamples > 1 && undefined !== this._depthMS && this.useMsBuffers) {
      volClassBlendFbo.blitMsBuffersToTextures(false); // make sure the volClassBlend texture that we are about to read has been blitted
    }
    fbStack.execute(fboColorAndZ, false, this.useMsBuffers, () => {
      this.target.pushState(this.target.decorationsState);
      this._vcBlendRenderState!.blend.setBlendFuncSeparate(GL.BlendFactor.SrcAlpha, GL.BlendFactor.Zero, GL.BlendFactor.OneMinusSrcAlpha, GL.BlendFactor.One);
      System.instance.applyRenderState(this._vcBlendRenderState!);
      const params = getDrawParams(this.target, this._geom.volClassBlend!);
      this.target.techniques.draw(params);
      this.target.popBranch();
      System.instance.bindTexture2d(TextureUnit.Zero, undefined);
    });

    // Process the flashed classifier if there is one.
    // Like the selected volumes, we do not need to do this step if we used by-element-color since the flashing is included in the element color.
    const flashedClassifierCmds = extractFlashedVolumeClassifierCommands(this.target.flashedId, cmdsByIndex, numCmdsPerClassifier);
    if (undefined !== flashedClassifierCmds && !doColorByElement) {
      // Set the stencil for this one classifier.
      fbStack.execute(this._frameBuffers.stencilSet, false, this.useMsBuffers, () => {
        this.target.pushState(this._vcBranchState!);
        System.instance.applyRenderState(this._vcSetStencilRenderState!);
        this.target.techniques.executeForIndexedClassifier(this.target, flashedClassifierCmds, RenderPass.OpaqueGeneral);
        this.target.popBranch();
      });

      // Process the stencil to flash the contents.
      fbStack.execute(fboColorAndZ, true, this.useMsBuffers, () => {
        this.target.pushState(this.target.decorationsState);
        this._vcColorRenderState!.blend.color = [1.0, 1.0, 1.0, this.target.flashIntensity * 0.2];
        this._vcColorRenderState!.blend.setBlendFuncSeparate(GL.BlendFactor.ConstAlpha, GL.BlendFactor.Zero, GL.BlendFactor.One, GL.BlendFactor.One);
        System.instance.applyRenderState(this._vcColorRenderState!);
        const params = getDrawParams(this.target, this._geom.volClassColorStencil!);
        this.target.techniques.draw(params);
        this.target.popBranch();
      });
    }
  }

  private renderHilite(commands: RenderCommands) {
    const system = System.instance;
    system.frameBufferStack.execute(this._frameBuffers.hilite!, true, false, () => {
      // Clear the hilite buffer.
      system.context.clearColor(0, 0, 0, 0);
      system.context.clear(GL.BufferBit.Color);
      // Draw the normal hilite geometry.
      this.drawPass(commands, RenderPass.Hilite);
    });

    // Process planar classifiers
    const planarClassifierCmds = commands.getCommands(RenderPass.HilitePlanarClassification);
    if (0 !== planarClassifierCmds.length) {
      system.frameBufferStack.execute(this._frameBuffers.hiliteUsingStencil!, true, false, () => {
        system.applyRenderState(this._opaqueRenderState);
        this.target.techniques.execute(this.target, planarClassifierCmds, RenderPass.HilitePlanarClassification);
      });
    }

    // Process the volume classifiers.
    const vcHiliteCmds = commands.getCommands(RenderPass.HiliteClassification);
    if (0 !== vcHiliteCmds.length && undefined !== this._vcBranchState) {
      // Set the stencil for the given classifier stencil volume.
      system.frameBufferStack.execute(this._frameBuffers.stencilSet!, false, false, () => {
        this.target.pushState(this._vcBranchState!);
        system.applyRenderState(this._vcSetStencilRenderState!);
        this.target.techniques.execute(this.target, vcHiliteCmds, RenderPass.Hilite);
        this.target.popBranch();
      });
      // Process the stencil for the hilite data.
      system.frameBufferStack.execute(this._frameBuffers.hiliteUsingStencil!, true, false, () => {
        system.applyRenderState(this._vcPickDataRenderState!);
        this.target.techniques.execute(this.target, vcHiliteCmds, RenderPass.Hilite);
      });
    }
  }

  private composite() {
    System.instance.applyRenderState(RenderState.defaults);
    const params = getDrawParams(this.target, this._geom.composite!);
    this.target.techniques.draw(params);
  }

  protected getRenderState(pass: RenderPass): RenderState {
    switch (pass) {
      case RenderPass.OpaqueLayers:
      case RenderPass.TranslucentLayers:
      case RenderPass.OverlayLayers:
        // NB: During pick, we don't want blending - it will mess up our pick buffer data and we don't care about the color data.
        // During normal draw, we don't use the pick buffers for anything, and we want color blending.
        // (We get away with this because surfaces always draw before their edges, and we're not depth-testing, so edges always draw atop surfaces without pick buffer testing).
        this._layerRenderState.flags.blend = !this.target.isReadPixelsInProgress;

        // Transparent non-overlay Layers are drawn between opaque and translucent passes. Test depth, don't write it, so that they blend with opaque.
        this._layerRenderState.flags.depthMask = RenderPass.TranslucentLayers !== pass;
        this._layerRenderState.depthFunc = (RenderPass.TranslucentLayers === pass) ? GL.DepthFunc.Default : GL.DepthFunc.Always;
        return this._layerRenderState;
      case RenderPass.OpaqueLinear:
      case RenderPass.OpaquePlanar:
      case RenderPass.OpaqueGeneral:
      case RenderPass.HilitePlanarClassification:
        return this._opaqueRenderState;
      case RenderPass.Translucent:
        return this._translucentRenderState;
      case RenderPass.Hilite:
        return this._hiliteRenderState;
      case RenderPass.BackgroundMap:
        return this._backgroundMapRenderState;
      default:
        return this._noDepthMaskRenderState;
    }
  }

  protected drawPass(commands: RenderCommands, pass: RenderPass, pingPong: boolean = false, cmdPass: RenderPass = RenderPass.None) {
    const cmds = commands.getCommands(RenderPass.None !== cmdPass ? cmdPass : pass);
    if (0 === cmds.length) {
      return;
    } else if (pingPong) {
      this.pingPong();
    }

    System.instance.applyRenderState(this.getRenderState(pass));
    this.target.techniques.execute(this.target, cmds, pass);
  }
}

class MRTFrameBuffers extends FrameBuffers {
  public opaqueAll?: FrameBuffer;
  public opaqueAndCompositeAll?: FrameBuffer;
  public pingPong?: FrameBuffer;
  public translucent?: FrameBuffer;
  public clearTranslucent?: FrameBuffer;
  public idsAndZ?: FrameBuffer;
  public idsAndAltZ?: FrameBuffer;
  public idsAndZComposite?: FrameBuffer;
  public idsAndAltZComposite?: FrameBuffer;

  public override init(textures: Textures, depth: DepthBuffer, depthMs: DepthBuffer | undefined): boolean {
    if (!super.init(textures, depth, depthMs))
      return false;

    assert(undefined === this.opaqueAll);

    if (!this.initPotentialMSMRTFbos(textures, depth, depthMs))
      return false;

    assert(undefined !== textures.accumulation && undefined !== textures.revealage);
    const colors = [textures.accumulation, textures.revealage];
    this.translucent = FrameBuffer.create(colors, depth);
    this.clearTranslucent = FrameBuffer.create(colors);

    // We borrow the SceneCompositor's accum and revealage textures for the surface pass.
    // First we render edges, writing to our textures.
    // Then we copy our textures to borrowed textures.
    // Finally we render surfaces, writing to our textures and reading from borrowed textures.
    assert(undefined !== textures.accumulation && undefined !== textures.revealage);
    const pingPong = [textures.accumulation, textures.revealage];
    this.pingPong = FrameBuffer.create(pingPong);

    return undefined !== this.translucent
      && undefined !== this.clearTranslucent
      && undefined !== this.pingPong;
  }

  private initPotentialMSMRTFbos(textures: Textures, depth: DepthBuffer, depthMs: DepthBuffer | undefined): boolean {
    const boundColor = System.instance.frameBufferStack.currentColorBuffer;
    assert(undefined !== boundColor && undefined !== textures.color && undefined !== textures.featureId && undefined !== textures.depthAndOrder);
    const colorAndPick = [boundColor, textures.featureId, textures.depthAndOrder];

    if (undefined === depthMs) {
      this.opaqueAll = FrameBuffer.create(colorAndPick, depth);
      colorAndPick[0] = textures.color;
      this.opaqueAndCompositeAll = FrameBuffer.create(colorAndPick, depth);
    } else {
      assert(undefined !== textures.colorMsBuff && undefined !== textures.featureIdMsBuff && undefined !== textures.depthAndOrderMsBuff);
      const colorAndPickMsBuffs = [textures.colorMsBuff, textures.featureIdMsBuff, textures.depthAndOrderMsBuff];
      const colorAndPickFilters = [GL.MultiSampling.Filter.Linear, GL.MultiSampling.Filter.Nearest, GL.MultiSampling.Filter.Nearest];
      this.opaqueAll = FrameBuffer.create(colorAndPick, depth, colorAndPickMsBuffs, colorAndPickFilters, depthMs);
      colorAndPick[0] = textures.color;
      this.opaqueAndCompositeAll = FrameBuffer.create(colorAndPick, depth, colorAndPickMsBuffs, colorAndPickFilters, depthMs);
    }

    return undefined !== this.opaqueAll
      && undefined !== this.opaqueAndCompositeAll;
  }

  public override enableVolumeClassifier(textures: Textures, depth: DepthBuffer, volClassDepth: DepthBuffer | undefined, depthMS?: DepthBuffer, volClassDepthMS?: DepthBuffer): void {
    const boundColor = System.instance.frameBufferStack.currentColorBuffer;
    if (undefined === boundColor)
      return;
    super.enableVolumeClassifier(textures, depth, volClassDepth, depthMS, volClassDepthMS);
    if (undefined !== this.opaqueAll && undefined !== this.opaqueAndCompositeAll) {
      if (undefined !== volClassDepth) {
        let ids = [this.opaqueAll.getColor(0), this.opaqueAll.getColor(1)];
        this.idsAndZ = FrameBuffer.create(ids, depth);
        this.idsAndAltZ = FrameBuffer.create(ids, volClassDepth);
        ids = [this.opaqueAndCompositeAll.getColor(0), this.opaqueAndCompositeAll.getColor(1)];
        this.idsAndZComposite = FrameBuffer.create(ids, depth);
        this.idsAndAltZComposite = FrameBuffer.create(ids, volClassDepth);
      }
    }
  }

  public override disableVolumeClassifier(): void {
    super.disableVolumeClassifier();
    if (undefined !== this.idsAndZ) {
      this.idsAndZ = dispose(this.idsAndZ);
      this.idsAndAltZ = dispose(this.idsAndAltZ);
      this.idsAndZComposite = dispose(this.idsAndZComposite);
      this.idsAndAltZComposite = dispose(this.idsAndAltZComposite);
    }
  }

  public override enableMultiSampling(textures: Textures, depth: DepthBuffer, depthMS: DepthBuffer): boolean {
    super.enableMultiSampling(textures, depth, depthMS);
    this.opaqueAll = dispose(this.opaqueAll);
    this.opaqueAndCompositeAll = dispose(this.opaqueAndCompositeAll);
    return this.initPotentialMSMRTFbos(textures, depth, depthMS);
  }

  public override disableMultiSampling(textures: Textures, depth: DepthBuffer): boolean {
    this.opaqueAll = dispose(this.opaqueAll);
    this.opaqueAndCompositeAll = dispose(this.opaqueAndCompositeAll);
    if (!this.initPotentialMSMRTFbos(textures, depth, undefined))
      return false;
    return super.disableMultiSampling(textures, depth);
  }

  public override get isDisposed(): boolean {
    return super.isDisposed
      && undefined === this.opaqueAll
      && undefined === this.opaqueAndCompositeAll
      && undefined === this.pingPong
      && undefined === this.translucent
      && undefined === this.clearTranslucent
      && undefined === this.idsAndZ
      && undefined === this.idsAndAltZ
      && undefined === this.idsAndZComposite
      && undefined === this.idsAndAltZComposite;
  }

  public override dispose(): void {
    super.dispose();
    this.opaqueAll = dispose(this.opaqueAll);
    this.opaqueAndCompositeAll = dispose(this.opaqueAndCompositeAll);
    this.pingPong = dispose(this.pingPong);
    this.translucent = dispose(this.translucent);
    this.clearTranslucent = dispose(this.clearTranslucent);
    this.idsAndZ = dispose(this.idsAndZ);
    this.idsAndAltZ = dispose(this.idsAndAltZ);
    this.idsAndZComposite = dispose(this.idsAndZComposite);
    this.idsAndAltZComposite = dispose(this.idsAndAltZComposite);
  }
}

class MRTGeometry extends Geometry {
  public copyPickBuffers?: CopyPickBufferGeometry;
  public clearTranslucent?: ViewportQuadGeometry;
  public clearPickAndColor?: ViewportQuadGeometry;

  public override collectStatistics(stats: RenderMemory.Statistics): void {
    super.collectStatistics(stats);
    collectGeometryStatistics(this.copyPickBuffers, stats);
    collectGeometryStatistics(this.clearTranslucent, stats);
    collectGeometryStatistics(this.clearPickAndColor, stats);
  }

  public override init(textures: Textures): boolean {
    if (!super.init(textures))
      return false;

    assert(undefined === this.copyPickBuffers);

    this.copyPickBuffers = CopyPickBufferGeometry.createGeometry(textures.featureId!.getHandle()!, textures.depthAndOrder!.getHandle()!);
    this.clearTranslucent = ViewportQuadGeometry.create(TechniqueId.OITClearTranslucent);
    this.clearPickAndColor = ViewportQuadGeometry.create(TechniqueId.ClearPickAndColor);

    return undefined !== this.copyPickBuffers && undefined !== this.clearTranslucent && undefined !== this.clearPickAndColor;
  }

  public override get isDisposed(): boolean {
    return super.isDisposed
      && undefined === this.copyPickBuffers
      && undefined === this.clearTranslucent
      && undefined === this.clearPickAndColor;
  }

  public override dispose() {
    super.dispose();
    this.copyPickBuffers = dispose(this.copyPickBuffers);
    this.clearTranslucent = dispose(this.clearTranslucent);
    this.clearPickAndColor = dispose(this.clearPickAndColor);
  }
}

// SceneCompositor used when multiple render targets are supported (WEBGL_draw_buffers exists and supports at least 4 color attachments).
class MRTCompositor extends Compositor {
  public constructor(target: Target) {
    super(target, new MRTFrameBuffers(), new MRTGeometry());
  }

  public get currentRenderTargetIndex(): number {
    assert(false, "MRT is supported");
    return 0;
  }
  public set currentRenderTargetIndex(_index: number) {
    assert(false, "MRT is supported");
  }

  public get featureIds(): TextureHandle { return this.getSamplerTexture(this._readPickDataFromPingPong ? 0 : 1); }
  public get depthAndOrder(): TextureHandle { return this.getSamplerTexture(this._readPickDataFromPingPong ? 1 : 2); }

  private get _fbos(): MRTFrameBuffers { return this._frameBuffers as MRTFrameBuffers; }
  private get _geometry(): MRTGeometry { return this._geom as MRTGeometry; }

  protected override enableVolumeClassifierFbos(textures: Textures, depth: DepthBuffer, volClassDepth: DepthBuffer | undefined, depthMS?: DepthBuffer, volClassDepthMS?: DepthBuffer): void {
    this._fbos.enableVolumeClassifier(textures, depth, volClassDepth, depthMS, volClassDepthMS);
  }
  protected override disableVolumeClassifierFbos(): void { this._fbos.disableVolumeClassifier(); }

  protected override enableMultiSampling(): boolean {
    if (!super.enableMultiSampling())
      return false;
    assert(undefined !== this._depth && undefined !== this._depthMS);
    return this._fbos.enableMultiSampling(this._textures, this._depth, this._depthMS);
  }

  protected override disableMultiSampling(): boolean {
    assert(undefined !== this._depth);
    if (!this._fbos.disableMultiSampling(this._textures, this._depth))
      return false;
    return super.disableMultiSampling();
  }

  protected clearOpaque(needComposite: boolean): void {
    const fbo = needComposite ? this._fbos.opaqueAndCompositeAll! : this._fbos.opaqueAll!;
    const system = System.instance;
    system.frameBufferStack.execute(fbo, true, this.useMsBuffers, () => {
      // Clear pick data buffers to 0's and color buffer to background color
      // (0,0,0,0) in elementID0 and ElementID1 buffers indicates invalid element id
      // (0,0,0,0) in DepthAndOrder buffer indicates render order 0 and encoded depth of 0 (= far plane)
      system.applyRenderState(this._noDepthMaskRenderState);
      const params = getDrawParams(this.target, this._geometry.clearPickAndColor!);
      this.target.techniques.draw(params);

      // Clear depth buffer
      system.applyRenderState(RenderState.defaults); // depthMask == true.
      system.context.clearDepth(1.0);
      system.context.clear(GL.BufferBit.Depth);
    });
  }

  protected renderOpaque(commands: RenderCommands, compositeFlags: CompositeFlags, renderForReadPixels: boolean) {
    // Output the first 2 passes to color and pick data buffers. (All 3 in the case of rendering for readPixels()).
    this._readPickDataFromPingPong = true;

    const needComposite = CompositeFlags.None !== compositeFlags;
    const needAO = CompositeFlags.None !== (compositeFlags & CompositeFlags.AmbientOcclusion);

    const fbStack = System.instance.frameBufferStack;
    fbStack.execute(needComposite ? this._fbos.opaqueAndCompositeAll! : this._fbos.opaqueAll!, true, this.useMsBuffers, () => {
      this.drawPass(commands, RenderPass.OpaqueLinear);
      this.drawPass(commands, RenderPass.OpaquePlanar, true);
      if (needAO || renderForReadPixels) {
        this.drawPass(commands, RenderPass.OpaqueGeneral, true);

        if (this.useMsBuffers) {
          const fbo = (needComposite ? this._fbos.opaqueAndCompositeAll! : this._fbos.opaqueAll!);
          fbo.blitMsBuffersToTextures(true);
        }

        if (needAO)
          this.renderAmbientOcclusion();
      }
    });

    this._readPickDataFromPingPong = false;

    // The general pass (and following) will not bother to write to pick buffers and so can read from the actual pick buffers.
    if (!renderForReadPixels && !needAO) {
      fbStack.execute(needComposite ? this._fbos.opaqueAndCompositeColor! : this._fbos.opaqueColor!, true, this.useMsBuffers, () => {
        this.drawPass(commands, RenderPass.OpaqueGeneral, false);
        this.drawPass(commands, RenderPass.HiddenEdge, false);
      });
      if (this.useMsBuffers) {
        const fbo = (needComposite ? this._fbos.opaqueAndCompositeColor! : this._fbos.opaqueColor!);
        fbo.blitMsBuffersToTextures(needComposite);
      }
    }
  }

  protected renderLayers(commands: RenderCommands, needComposite: boolean, pass: RenderPass): void {
    this._readPickDataFromPingPong = true;
    System.instance.frameBufferStack.execute(needComposite ? this._fbos.opaqueAndCompositeAll! : this._fbos.opaqueAll!, true, RenderPass.OpaqueLayers === pass && this.useMsBuffers, () => {
      this.drawPass(commands, pass, true);
    });

    this._readPickDataFromPingPong = false;
  }

  protected renderForVolumeClassification(commands: RenderCommands, compositeFlags: CompositeFlags, renderForReadPixels: boolean) {
    const needComposite = CompositeFlags.None !== compositeFlags;
    const needAO = CompositeFlags.None !== (compositeFlags & CompositeFlags.AmbientOcclusion);
    const fbStack = System.instance.frameBufferStack;

    if (renderForReadPixels || needAO) {
      this._readPickDataFromPingPong = true;
      fbStack.execute(needComposite ? this._fbos.opaqueAndCompositeAll! : this._fbos.opaqueAll!, true, this.useMsBuffers, () => {
        this.drawPass(commands, RenderPass.OpaqueGeneral, true, RenderPass.VolumeClassifiedRealityData);
      });
    } else {
      this._readPickDataFromPingPong = false;
      fbStack.execute(needComposite ? this._fbos.opaqueAndCompositeColor! : this._fbos.opaqueColor!, true, this.useMsBuffers, () => {
        this.drawPass(commands, RenderPass.OpaqueGeneral, false, RenderPass.VolumeClassifiedRealityData);
      });
    }
  }

  protected renderIndexedClassifierForReadPixels(cmds: DrawCommands, state: RenderState, renderForIntersectingVolumes: boolean, needComposite: boolean) {
    this._readPickDataFromPingPong = true;
    const fbo = (renderForIntersectingVolumes ? (needComposite ? this._fbos.idsAndZComposite! : this._fbos.idsAndZ!)
      : (needComposite ? this._fbos.idsAndAltZComposite! : this._fbos.idsAndAltZ!));
    System.instance.frameBufferStack.execute(fbo, true, false, () => {
      System.instance.applyRenderState(state);
      this.target.techniques.execute(this.target, cmds, RenderPass.OpaqueGeneral);
    });
    this._readPickDataFromPingPong = false;
  }

  protected clearTranslucent() {
    System.instance.applyRenderState(this._noDepthMaskRenderState);
    System.instance.frameBufferStack.execute(this._fbos.clearTranslucent!, true, false, () => {
      const params = getDrawParams(this.target, this._geometry.clearTranslucent!);
      this.target.techniques.draw(params);
    });
  }

  protected renderTranslucent(commands: RenderCommands) {
    System.instance.frameBufferStack.execute(this._fbos.translucent!, true, false, () => {
      this.drawPass(commands, RenderPass.Translucent);
    });
  }

  protected pingPong() {
    if (this._fbos.opaqueAll!.isMultisampled && this.useMsBuffers) {
      // If we are multisampling we can just blit the FeatureId and DepthAndOrder buffers to their textures.
      this._fbos.opaqueAll!.blitMsBuffersToTextures(false, 1);
      this._fbos.opaqueAll!.blitMsBuffersToTextures(false, 2);
    } else {
      System.instance.applyRenderState(this._noDepthMaskRenderState);
      System.instance.frameBufferStack.execute(this._fbos.pingPong!, true, this.useMsBuffers, () => {
        const params = getDrawParams(this.target, this._geometry.copyPickBuffers!);
        this.target.techniques.draw(params);
      });
    }
  }

  protected getBackgroundFbo(needComposite: boolean): FrameBuffer { return needComposite ? this._fbos.opaqueAndCompositeColor! : this._fbos.opaqueColor!; }

  private get _samplerFbo(): FrameBuffer { return this._readPickDataFromPingPong ? this._fbos.pingPong! : this._fbos.opaqueAll!; }
  private getSamplerTexture(index: number) { return this._samplerFbo.getColor(index); }
}

class MPFrameBuffers extends FrameBuffers {
  public accumulation?: FrameBuffer;
  public revealage?: FrameBuffer;
  public featureId?: FrameBuffer;
  public featureIdWithDepth?: FrameBuffer;
  public featureIdWithDepthAltZ?: FrameBuffer;

  public override init(textures: Textures, depth: DepthBuffer): boolean {
    if (!super.init(textures, depth, undefined))
      return false;

    assert(undefined === this.accumulation);

    this.accumulation = FrameBuffer.create([textures.accumulation!], depth);
    this.revealage = FrameBuffer.create([textures.revealage!], depth);
    this.featureId = FrameBuffer.create([textures.featureId!], depth);

    return undefined !== this.accumulation && undefined !== this.revealage && undefined !== this.featureId;
  }

  public override enableVolumeClassifier(textures: Textures, depth: DepthBuffer, volClassDepth: DepthBuffer | undefined, depthMS?: DepthBuffer, volClassDepthMS?: DepthBuffer): void {
    super.enableVolumeClassifier(textures, depth, volClassDepth, depthMS, volClassDepthMS);
    if (undefined !== this.featureId) {
      this.featureIdWithDepth = FrameBuffer.create([this.featureId.getColor(0)], depth);
      this.featureIdWithDepthAltZ = FrameBuffer.create([this.featureId.getColor(0)], volClassDepth);
    }
  }

  public override disableVolumeClassifier(): void {
    super.disableVolumeClassifier();
    if (undefined !== this.featureIdWithDepth) {
      this.featureIdWithDepth = dispose(this.featureIdWithDepth);
      this.featureIdWithDepthAltZ = dispose(this.featureIdWithDepthAltZ);
    }
  }

  public override get isDisposed(): boolean {
    return super.isDisposed
      && undefined === this.accumulation
      && undefined === this.revealage
      && undefined === this.featureId
      && undefined === this.featureIdWithDepth
      && undefined === this.featureIdWithDepthAltZ;
  }

  public override dispose(): void {
    super.dispose();

    this.accumulation = dispose(this.accumulation);
    this.revealage = dispose(this.revealage);
    this.featureId = dispose(this.featureId);
    this.disableVolumeClassifier();
  }
}

class MPGeometry extends Geometry {
  public copyColor?: SingleTexturedViewportQuadGeometry;

  public override collectStatistics(stats: RenderMemory.Statistics): void {
    super.collectStatistics(stats);
    collectGeometryStatistics(this.copyColor, stats);
  }

  public override init(textures: Textures): boolean {
    if (!super.init(textures))
      return false;

    assert(undefined === this.copyColor);
    this.copyColor = SingleTexturedViewportQuadGeometry.createGeometry(textures.featureId!.getHandle()!, TechniqueId.CopyColor);
    return undefined !== this.copyColor;
  }

  public override get isDisposed(): boolean { return super.isDisposed && undefined === this.copyColor; }

  public override dispose(): void {
    super.dispose();
    this.copyColor = dispose(this.copyColor);
  }
}

// Compositor used when multiple render targets are not supported (WEBGL_draw_buffers not available or fewer than 4 color attachments supported).
// This falls back to multi-pass rendering in place of MRT rendering, which has obvious performance implications.
// The chief use case is iOS.
class MPCompositor extends Compositor {
  private _currentRenderTargetIndex: number = 0;
  private _drawMultiPassDepth: boolean = true;
  private readonly _opaqueRenderStateNoZWt = new RenderState();
  private readonly _scratchBgColor = new FloatRgba();

  public constructor(target: Target) {
    super(target, new MPFrameBuffers(), new MPGeometry());

    this._opaqueRenderStateNoZWt.flags.depthTest = true;
    this._opaqueRenderStateNoZWt.flags.depthMask = false;
  }

  protected override getRenderState(pass: RenderPass): RenderState {
    switch (pass) {
      case RenderPass.OpaqueLinear:
      case RenderPass.OpaquePlanar:
      case RenderPass.OpaqueGeneral:
        return this._drawMultiPassDepth ? this._opaqueRenderState : this._opaqueRenderStateNoZWt;
    }

    return super.getRenderState(pass);
  }

  private get _fbos(): MPFrameBuffers { return this._frameBuffers as MPFrameBuffers; }
  private get _geometry(): MPGeometry { return this._geom as MPGeometry; }

  public get currentRenderTargetIndex(): number { return this._currentRenderTargetIndex; }
  public set currentRenderTargetIndex(index: number) { this._currentRenderTargetIndex = index; }
  public get featureIds(): TextureHandle { return this._readPickDataFromPingPong ? this._textures.accumulation! : this._textures.featureId!; }
  public get depthAndOrder(): TextureHandle { return this._readPickDataFromPingPong ? this._textures.revealage! : this._textures.depthAndOrder!; }

  protected getBackgroundFbo(needComposite: boolean): FrameBuffer { return needComposite ? this._fbos.opaqueAndCompositeColor! : this._fbos.opaqueColor!; }

  protected override enableVolumeClassifierFbos(textures: Textures, depth: DepthBuffer, volClassDepth: DepthBuffer | undefined, depthMS?: DepthBuffer, volClassDepthMS?: DepthBuffer): void {
    this._fbos.enableVolumeClassifier(textures, depth, volClassDepth, depthMS, volClassDepthMS);
  }
  protected override disableVolumeClassifierFbos(): void { this._fbos.disableVolumeClassifier(); }

  protected clearOpaque(needComposite: boolean): void {
    const bg = this._scratchBgColor;
    this.target.uniforms.style.cloneBackgroundRgba(bg);
    this.clearFbo(needComposite ? this._fbos.opaqueAndCompositeColor! : this._fbos.opaqueColor!, bg.red, bg.green, bg.blue, bg.alpha, true);
    this.clearFbo(this._fbos.depthAndOrder!, 0, 0, 0, 0, false);
    this.clearFbo(this._fbos.featureId!, 0, 0, 0, 0, false);
  }

  protected renderOpaque(commands: RenderCommands, compositeFlags: CompositeFlags, renderForReadPixels: boolean): void {
    // Output the first 2 passes to color and pick data buffers. (All 3 in the case of rendering for readPixels()).
    this._readPickDataFromPingPong = true;
    const needComposite = CompositeFlags.None !== compositeFlags;
    const needAO = CompositeFlags.None !== (compositeFlags & CompositeFlags.AmbientOcclusion);
    const colorFbo = needComposite ? this._fbos.opaqueAndCompositeColor! : this._fbos.opaqueColor!;
    this.drawOpaquePass(colorFbo, commands, RenderPass.OpaqueLinear, false);
    this.drawOpaquePass(colorFbo, commands, RenderPass.OpaquePlanar, true);
    if (renderForReadPixels || needAO) {
      this.drawOpaquePass(colorFbo, commands, RenderPass.OpaqueGeneral, true);
      if (needAO)
        this.renderAmbientOcclusion();
    }

    this._readPickDataFromPingPong = false;

    // The general pass (and following) will not bother to write to pick buffers and so can read from the actual pick buffers.
    if (!renderForReadPixels && !needAO) {
      System.instance.frameBufferStack.execute(colorFbo, true, false, () => {
        this._drawMultiPassDepth = true;  // for OpaqueGeneral
        this.drawPass(commands, RenderPass.OpaqueGeneral, false);
        this.drawPass(commands, RenderPass.HiddenEdge, false);
      });
    }
  }

  protected renderLayers(commands: RenderCommands, needComposite: boolean, pass: RenderPass): void {
    this._readPickDataFromPingPong = true;
    const colorFbo = needComposite ? this._fbos.opaqueAndCompositeColor! : this._fbos.opaqueColor!;
    this.drawOpaquePass(colorFbo, commands, pass, true);
    this._readPickDataFromPingPong = false;
  }

  protected renderForVolumeClassification(commands: RenderCommands, compositeFlags: CompositeFlags, renderForReadPixels: boolean): void {
    const needComposite = CompositeFlags.None !== compositeFlags;
    const needAO = CompositeFlags.None !== (compositeFlags & CompositeFlags.AmbientOcclusion);
    const colorFbo = needComposite ? this._fbos.opaqueAndCompositeColor! : this._fbos.opaqueColor!;
    if (renderForReadPixels || needAO) {
      this._readPickDataFromPingPong = true;
      this.drawOpaquePass(colorFbo, commands, RenderPass.OpaqueGeneral, true, RenderPass.VolumeClassifiedRealityData);
      if (needAO)
        this.renderAmbientOcclusion();
    } else {
      this._readPickDataFromPingPong = false;
      System.instance.frameBufferStack.execute(colorFbo, true, false, () => {
        this._drawMultiPassDepth = true;  // for OpaqueGeneral
        this.drawPass(commands, RenderPass.OpaqueGeneral, false, RenderPass.VolumeClassifiedRealityData);
      });
    }
  }

  protected renderIndexedClassifierForReadPixels(cmds: DrawCommands, state: RenderState, renderForIntersectingVolumes: boolean, _needComposite: boolean) {
    // Note that we only need to render to the Id textures here, no color, since the color buffer is not used in readPixels.
    this._readPickDataFromPingPong = true;
    this._currentRenderTargetIndex = 1;
    const fbo = (renderForIntersectingVolumes ? this._fbos.featureIdWithDepth! : this._fbos.featureIdWithDepthAltZ!);
    System.instance.frameBufferStack.execute(fbo, true, false, () => {
      System.instance.applyRenderState(state);
      this.target.techniques.execute(this.target, cmds, RenderPass.OpaqueGeneral);
    });
    this._currentRenderTargetIndex = 0;
    this._readPickDataFromPingPong = false;
  }

  // ###TODO: For readPixels(), could skip rendering color...also could skip rendering depth and/or element ID depending upon selector...
  private drawOpaquePass(colorFbo: FrameBuffer, commands: RenderCommands, pass: RenderPass, pingPong: boolean, cmdPass: RenderPass = RenderPass.None): void {
    const commandPass = RenderPass.None === cmdPass ? pass : cmdPass;
    const stack = System.instance.frameBufferStack;
    this._drawMultiPassDepth = true;
    if (!this.target.isReadPixelsInProgress) {
      stack.execute(colorFbo, true, false, () => this.drawPass(commands, pass, pingPong, commandPass));
      this._drawMultiPassDepth = false;
    }
    this._currentRenderTargetIndex++;
    if (!this.target.isReadPixelsInProgress || Pixel.Selector.None !== (this.target.readPixelsSelector & Pixel.Selector.Feature)) {
      stack.execute(this._fbos.featureId!, true, false, () => this.drawPass(commands, pass, pingPong && this._drawMultiPassDepth, commandPass));
      this._drawMultiPassDepth = false;
    }
    this._currentRenderTargetIndex++;
    if (!this.target.isReadPixelsInProgress || Pixel.Selector.None !== (this.target.readPixelsSelector & Pixel.Selector.GeometryAndDistance)) {
      stack.execute(this._fbos.depthAndOrder!, true, false, () => this.drawPass(commands, pass, pingPong && this._drawMultiPassDepth, commandPass));
    }
    this._currentRenderTargetIndex = 0;
  }

  protected clearTranslucent() {
    this.clearFbo(this._fbos.accumulation!, 0, 0, 0, 1, false);
    this.clearFbo(this._fbos.revealage!, 1, 0, 0, 1, false);
  }

  protected renderTranslucent(commands: RenderCommands) {
    System.instance.frameBufferStack.execute(this._fbos.accumulation!, true, false, () => {
      this.drawPass(commands, RenderPass.Translucent);
    });

    this._currentRenderTargetIndex = 1;
    System.instance.frameBufferStack.execute(this._fbos.revealage!, true, false, () => {
      this.drawPass(commands, RenderPass.Translucent);
    });

    this._currentRenderTargetIndex = 0;
  }

  protected pingPong() {
    System.instance.applyRenderState(this._noDepthMaskRenderState);

    this.copyFbo(this._textures.featureId!, this._fbos.accumulation!);
    this.copyFbo(this._textures.depthAndOrder!, this._fbos.revealage!);
  }

  private copyFbo(src: TextureHandle, dst: FrameBuffer): void {
    const geom = this._geometry.copyColor!;
    geom.texture = src.getHandle()!;
    System.instance.frameBufferStack.execute(dst, true, false, () => {
      const params = getDrawParams(this.target, geom);
      this.target.techniques.draw(params);
    });
  }

  private clearFbo(fbo: FrameBuffer, red: number, green: number, blue: number, alpha: number, andDepth: boolean): void {
    const system = System.instance;
    const gl = system.context;
    system.frameBufferStack.execute(fbo, true, false, () => {
      system.applyRenderState(andDepth ? RenderState.defaults : this._noDepthMaskRenderState);
      gl.clearColor(red, green, blue, alpha);
      let bit = GL.BufferBit.Color;
      if (andDepth) {
        gl.clearDepth(1.0);
        bit |= GL.BufferBit.Depth;
      }

      gl.clear(bit);
    });
  }
}
