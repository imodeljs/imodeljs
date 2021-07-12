/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module WebGL
 */

import { assert, dispose, IDisposable } from "@bentley/bentleyjs-core";
import { Range2d, Range3d, Transform, Vector2d } from "@bentley/geometry-core";
import { ColorDef, PackedFeatureTable, Quantization, RenderTexture } from "@bentley/imodeljs-common";
import { AttributeMap, BufferHandle, BufferParameters, IndexedGeometry, IndexedGeometryParams, Matrix4, QBufferHandle2d, QBufferHandle3d } from "../../webgl";
import { GraphicBranch } from "../GraphicBranch";
import { RealityMeshPrimitive } from "../primitives/mesh/RealityMeshPrimitive";
import { TerrainMeshPrimitive } from "../primitives/mesh/TerrainMeshPrimitive";
import { RenderGraphic } from "../RenderGraphic";
import { RenderMemory } from "../RenderMemory";
import { RenderSystem, TerrainTexture } from "../RenderSystem";
import { GL } from "./GL";
import { Primitive } from "./Primitive";
import { RenderOrder, RenderPass } from "./RenderFlags";
import { System } from "./System";
import { Target } from "./Target";
import { TechniqueId } from "./TechniqueId";

const scratchOverlapRange = Range2d.createNull();

/** @internal */
export class RealityTextureParams {

  constructor(public matrices: Matrix4[], public textures: RenderTexture[]) { }
  public static create(terrainTextures: TerrainTexture[]) {
    const maxTexturesPerMesh = System.instance.maxRealityImageryLayers;
    assert(terrainTextures.length <= maxTexturesPerMesh);

    const renderTextures = [];
    const matrices = new Array<Matrix4>();
    for (const terrainTexture of terrainTextures) {
      const matrix = new Matrix4();      // Published as Mat4.
      renderTextures.push(terrainTexture.texture);
      assert(terrainTexture.texture !== undefined, "Texture not defined in TerrainTextureParams constructor");
      matrix.data[0] = terrainTexture.translate.x;
      matrix.data[1] = terrainTexture.translate.y;
      matrix.data[2] = terrainTexture.scale.x;
      matrix.data[3] = terrainTexture.scale.y;

      if (terrainTexture.clipRectangle) {
        matrix.data[4] = terrainTexture.clipRectangle.low.x;
        matrix.data[5] = terrainTexture.clipRectangle.low.y;
        matrix.data[6] = terrainTexture.clipRectangle.high.x;
        matrix.data[7] = terrainTexture.clipRectangle.high.y;
      } else {
        matrix.data[4] = matrix.data[5] = 0;
        matrix.data[6] = matrix.data[7] = 1;
      }
      matrix.data[8] = (1.0 - terrainTexture.transparency);
      matrix.data[9] = terrainTexture.featureId;
      matrices.push(matrix);
    }

    for (let i = terrainTextures.length; i < maxTexturesPerMesh; i++) {
      const matrix = new Matrix4();
      matrix.data[0] = matrix.data[1] = 0.0;
      matrix.data[2] = matrix.data[3] = 1.0;
      matrix.data[4] = matrix.data[5] = 1;
      matrix.data[6] = matrix.data[7] = -1;
      matrices.push(matrix);
    }
    return new RealityTextureParams(matrices, renderTextures);
  }
}

/** @internal */

export class RealityMeshGeometryParams extends IndexedGeometryParams {
  public readonly uvParams: QBufferHandle2d;
  public readonly featureID?: number;
  public readonly normals?: BufferHandle;

  protected constructor(positions: QBufferHandle3d, normals: BufferHandle | undefined, uvParams: QBufferHandle2d, indices: BufferHandle, numIndices: number, featureID?: number) {
    super(positions, indices, numIndices);
    let attrParams = AttributeMap.findAttribute("a_uvParam", TechniqueId.RealityMesh, false);
    assert(attrParams !== undefined);
    this.buffers.addBuffer(uvParams, [BufferParameters.create(attrParams.location, 2, GL.DataType.UnsignedShort, false, 0, 0, false)]);
    this.uvParams = uvParams;

    if (undefined !== normals) {
      attrParams = AttributeMap.findAttribute("a_norm", TechniqueId.RealityMesh, false);
      assert(attrParams !== undefined);
      if (normals.bytesUsed > 0)
        this.buffers.addBuffer(normals, [BufferParameters.create(attrParams.location, 2, GL.DataType.UnsignedByte, false, 0, 0, false)]);
      this.normals = normals;
    }

    this.featureID = featureID;
  }

  private static createFromBuffers(posBuf: QBufferHandle3d, uvParamBuf: QBufferHandle2d, indices: Uint16Array, normBuf: BufferHandle | undefined, featureID: number) {
    const indBuf = BufferHandle.createBuffer(GL.Buffer.Target.ElementArrayBuffer, indices);

    if (undefined === indBuf)
      return undefined;

    return new RealityMeshGeometryParams(posBuf, normBuf, uvParamBuf, indBuf, indices.length, featureID);

  }

  public static createFromRealityMesh(mesh: RealityMeshPrimitive) {
    const posBuf = QBufferHandle3d.create(mesh.pointQParams, mesh.points);
    const uvParamBuf = QBufferHandle2d.create(mesh.uvQParams, mesh.uvs);
    const normalBuf = mesh.normals ? BufferHandle.createArrayBuffer(mesh.normals) : undefined;
    return (undefined === posBuf || undefined === uvParamBuf) ? undefined : this.createFromBuffers(posBuf, uvParamBuf, mesh.indices, normalBuf, mesh.featureID);
  }

  public override get isDisposed(): boolean {
    return super.isDisposed && this.uvParams.isDisposed;
  }
  public get bytesUsed(): number { return this.positions.bytesUsed + (undefined === this.normals ? 0 : this.normals.bytesUsed) + this.uvParams.bytesUsed + this.indices.bytesUsed; }

  public override dispose() {
    super.dispose();
    dispose(this.uvParams);
  }
}

/** @internal */
export class RealityMeshGeometry extends IndexedGeometry implements IDisposable, RenderMemory.Consumer {
  public override get asRealityMesh(): RealityMeshGeometry | undefined { return this; }
  public override get isDisposed(): boolean { return this._realityMeshParams.isDisposed; }
  public get uvQParams() { return this._realityMeshParams.uvParams.params; }
  public override get hasFeatures(): boolean { return this._realityMeshParams.featureID !== undefined; }
  public override get supportsThematicDisplay() { return true; }
  public get overrideColorMix() { return .5; }     // TThis could be a setting from either the mesh or the override if required.

  private constructor(private _realityMeshParams: RealityMeshGeometryParams, public textureParams: RealityTextureParams | undefined, private readonly _transform: Transform | undefined, public readonly baseColor: ColorDef | undefined, private _baseIsTransparent: boolean, private _isTerrain: boolean) {
    super(_realityMeshParams);
  }

  public override dispose() {
    super.dispose();
    dispose(this._realityMeshParams);
  }

  public static createFromTerrainMesh(terrainMesh: TerrainMeshPrimitive, transform: Transform | undefined) {
    const params = RealityMeshGeometryParams.createFromRealityMesh(terrainMesh);
    return params ? new RealityMeshGeometry(params, undefined, transform, undefined, false, true) : undefined;
  }

  public static createFromRealityMesh(realityMesh: RealityMeshPrimitive): RealityMeshGeometry | undefined {
    const params = RealityMeshGeometryParams.createFromRealityMesh(realityMesh);
    if (!params)
      return undefined;
    const texture = realityMesh.texture ? new TerrainTexture(realityMesh.texture, realityMesh.featureID, Vector2d.create(1.0, -1.0), Vector2d.create(0.0, 1.0), Range2d.createXYXY(0, 0, 1, 1), 0, 0) : undefined;

    return new RealityMeshGeometry(params, texture ? RealityTextureParams.create([texture]) : undefined, undefined, undefined, false, false);
  }

  public getRange(): Range3d {
    return Range3d.createXYZXYZ(this.qOrigin[0], this.qOrigin[1], this.qOrigin[2], this.qOrigin[0] + Quantization.rangeScale16 * this.qScale[0], this.qOrigin[1] + Quantization.rangeScale16 * this.qScale[1], this.qOrigin[2] + Quantization.rangeScale16 * this.qScale[2]);
  }

  public static createGraphic(system: RenderSystem, realityMesh: RealityMeshGeometry, featureTable: PackedFeatureTable, tileId: string | undefined, baseColor: ColorDef | undefined, baseTransparent: boolean, textures?: TerrainTexture[]): RenderGraphic | undefined {
    const meshes = [];
    if (textures === undefined)
      textures = [];

    const texturesPerMesh = System.instance.maxRealityImageryLayers;
    const layers = new Array<TerrainTexture[]>();
    let layerCount = 0;
    for (const texture of textures) {
      const layer = layers[texture.layerIndex];
      if (layer) {
        layer.push(texture);
      } else {
        layerCount++;
        layers[texture.layerIndex] = [texture];
      }
    }
    if (layerCount < 2) {
      // If only there is not more than one layer then we can group all of the textures into a single draw call.
      meshes.push(new RealityMeshGeometry(realityMesh._realityMeshParams, RealityTextureParams.create(textures), realityMesh._transform, baseColor, baseTransparent, realityMesh._isTerrain));
    } else {
      const primaryLayer = layers.shift()!;
      for (const primaryTexture of primaryLayer) {
        const targetRectangle = primaryTexture.targetRectangle;
        const overlapMinimum = 1.0E-5 * (targetRectangle.high.x - targetRectangle.low.x) * (targetRectangle.high.y - targetRectangle.low.y);
        const layerTextures = [primaryTexture];
        for (const secondaryLayer of layers) {
          if (!secondaryLayer)
            continue;
          for (const secondaryTexture of secondaryLayer) {
            const secondaryRectangle = secondaryTexture.targetRectangle;
            const overlap = targetRectangle.intersect(secondaryRectangle, scratchOverlapRange);
            if (!overlap.isNull && (overlap.high.x - overlap.low.x) * (overlap.high.y - overlap.low.y) > overlapMinimum) {
              const textureRange = Range2d.createXYXY(overlap.low.x, overlap.low.y, overlap.high.x, overlap.high.y);
              secondaryRectangle.worldToLocal(textureRange.low, textureRange.low);
              secondaryRectangle.worldToLocal(textureRange.high, textureRange.high);

              if (secondaryTexture.clipRectangle)
                textureRange.intersect(secondaryTexture.clipRectangle, textureRange);

              if (!textureRange.isNull)
                layerTextures.push(new TerrainTexture(secondaryTexture.texture, secondaryTexture.featureId, secondaryTexture.scale, secondaryTexture.translate, secondaryTexture.targetRectangle, secondaryTexture.layerIndex, secondaryTexture.transparency, textureRange));
            }
            layerTextures.length = Math.min(layerTextures.length, texturesPerMesh);
            meshes.push(new RealityMeshGeometry(realityMesh._realityMeshParams, RealityTextureParams.create(layerTextures), realityMesh._transform, baseColor, baseTransparent, realityMesh._isTerrain));
          }
        }
      }
    }

    if (meshes.length === 0)
      return undefined;

    const branch = new GraphicBranch(true);
    for (const mesh of meshes) {
      const primitive = Primitive.create(() => mesh);
      branch.add(system.createBatch(primitive!, featureTable, mesh.getRange(), { tileId }));
    }

    return system.createBranch(branch, realityMesh._transform ? realityMesh._transform : Transform.createIdentity());
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    this._isTerrain ? stats.addTerrain(this._realityMeshParams.bytesUsed) : stats.addRealityMesh(this._realityMeshParams.bytesUsed);
  }

  public get techniqueId(): TechniqueId { return TechniqueId.RealityMesh; }

  public getRenderPass(target: Target): RenderPass {
    if (target.isDrawingShadowMap)
      return RenderPass.None;

    if (this._baseIsTransparent || (target.wantThematicDisplay && target.uniforms.thematic.wantIsoLines))
      return RenderPass.Translucent;

    return RenderPass.OpaqueGeneral;
  }
  public get renderOrder(): RenderOrder { return RenderOrder.UnlitSurface; }

  public override draw(): void {
    this._params.buffers.bind();
    System.instance.context.drawElements(GL.PrimitiveType.Triangles, this._params.numIndices, GL.DataType.UnsignedShort, 0);
    this._params.buffers.unbind();
  }
}
