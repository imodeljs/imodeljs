/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { dispose } from "@bentley/bentleyjs-core";
import { Point3d } from "@bentley/geometry-core";
import { FeatureIndexType, PolylineTypeFlags, QParams3d, RenderMode } from "@bentley/imodeljs-common";
import { PolylineParams } from "../primitives/VertexTable";
import { RenderMemory } from "../RenderMemory";
import { LUTGeometry, PolylineBuffers } from "./CachedGeometry";
import { ColorInfo } from "./ColorInfo";
import { ShaderProgramParams } from "./DrawCommand";
import { LineCode } from "./LineCode";
import { GL } from "./GL";
import { BuffersContainer } from "./AttributeBuffers";
import { RenderOrder, RenderPass } from "./RenderFlags";
import { System } from "./System";
import { Target } from "./Target";
import { TechniqueId } from "./TechniqueId";
import { VertexLUT } from "./VertexLUT";

/** @internal */
export class PolylineGeometry extends LUTGeometry {
  public vertexParams: QParams3d;
  private readonly _hasFeatures: boolean;
  public lineWeight: number;
  public lineCode: number;
  public type: PolylineTypeFlags;
  private _isPlanar: boolean;
  public lut: VertexLUT;
  public numIndices: number;
  private _buffers: PolylineBuffers;

  public get lutBuffers() { return this._buffers.buffers; }

  private constructor(lut: VertexLUT, buffers: PolylineBuffers, params: PolylineParams, viOrigin: Point3d | undefined) {
    super(viOrigin);
    this.vertexParams = params.vertices.qparams;
    this._hasFeatures = FeatureIndexType.Empty !== params.vertices.featureIndexType;
    this.lineWeight = params.weight;
    this.lineCode = LineCode.valueFromLinePixels(params.linePixels);
    this.type = params.type;
    this._isPlanar = params.isPlanar;
    this.lut = lut;
    this.numIndices = params.polyline.indices.length;
    this._buffers = buffers;
  }

  public get isDisposed(): boolean { return this._buffers.isDisposed && this.lut.isDisposed; }

  public dispose() {
    dispose(this.lut);
    dispose(this._buffers);
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    this._buffers.collectStatistics(stats, RenderMemory.BufferType.Polylines);
    stats.addVertexTable(this.lut.bytesUsed);
  }

  public get isAnyEdge(): boolean { return PolylineTypeFlags.Normal !== this.type; }
  public get isNormalEdge(): boolean { return PolylineTypeFlags.Edge === this.type; }
  public get isOutlineEdge(): boolean { return PolylineTypeFlags.Outline === this.type; }

  public get renderOrder(): RenderOrder {
    if (this.isAnyEdge)
      return this.isPlanar ? RenderOrder.PlanarEdge : RenderOrder.Edge;
    else
      return this.isPlanar ? RenderOrder.PlanarLinear : RenderOrder.Linear;
  }

  protected _wantWoWReversal(_target: Target): boolean { return true; }

  public override get polylineBuffers(): PolylineBuffers | undefined { return this._buffers; }

  private _computeEdgePass(target: Target, colorInfo: ColorInfo): RenderPass {
    const vf = target.currentViewFlags;
    if (RenderMode.SmoothShade === vf.renderMode && !vf.visibleEdges)
      return RenderPass.None;

    // Only want to return Translucent for edges if rendering in Wireframe mode ###TODO: what about overrides?
    const isTranslucent: boolean = RenderMode.Wireframe === vf.renderMode && vf.transparency && colorInfo.hasTranslucency;
    return isTranslucent ? RenderPass.Translucent : RenderPass.OpaqueLinear;
  }

  public getRenderPass(target: Target): RenderPass {
    const vf = target.currentViewFlags;
    if (this.isEdge) {
      let pass = this._computeEdgePass(target, this.lut.colorInfo);
      // Only display the outline in wireframe if Fill is off...
      if (RenderPass.None !== pass && this.isOutlineEdge && RenderMode.Wireframe === vf.renderMode && vf.fill)
        pass = RenderPass.None;
      return pass;
    }
    const isTranslucent: boolean = vf.transparency && this.lut.colorInfo.hasTranslucency;
    return isTranslucent ? RenderPass.Translucent : RenderPass.OpaqueLinear;
  }

  public get techniqueId(): TechniqueId { return TechniqueId.Polyline; }
  public get isPlanar(): boolean { return this._isPlanar; }
  public override get isEdge(): boolean { return this.isAnyEdge; }
  public override get qOrigin(): Float32Array { return this.lut.qOrigin; }
  public override get qScale(): Float32Array { return this.lut.qScale; }
  public get numRgbaPerVertex(): number { return this.lut.numRgbaPerVertex; }
  public override get hasFeatures() { return this._hasFeatures; }

  protected override _getLineWeight(params: ShaderProgramParams): number {
    return this.isEdge ? params.target.computeEdgeWeight(params.renderPass, this.lineWeight) : this.lineWeight;
  }
  protected override _getLineCode(params: ShaderProgramParams): number {
    return this.isEdge ? params.target.computeEdgeLineCode(params.renderPass, this.lineCode) : this.lineCode;
  }
  public override getColor(target: Target): ColorInfo {
    return this.isEdge ? target.computeEdgeColor(this.lut.colorInfo) : this.lut.colorInfo;
  }

  protected _draw(numInstances: number, instanceBuffersContainer?: BuffersContainer): void {
    const gl = System.instance;
    const bufs = instanceBuffersContainer !== undefined ? instanceBuffersContainer : this._buffers.buffers;

    bufs.bind();
    gl.drawArrays(GL.PrimitiveType.Triangles, 0, this.numIndices, numInstances);
    bufs.unbind();
  }

  public static create(params: PolylineParams, viewIndependentOrigin: Point3d | undefined): PolylineGeometry | undefined {
    const lut = VertexLUT.createFromVertexTable(params.vertices);
    if (undefined === lut)
      return undefined;

    const buffers = PolylineBuffers.create(params.polyline);
    if (undefined === buffers)
      return undefined;

    return new PolylineGeometry(lut, buffers, params, viewIndependentOrigin);
  }
}
