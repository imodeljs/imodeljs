/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { assert } from "@bentley/bentleyjs-core";
import { IndexedPolyface, Polyface, Transform } from "@bentley/geometry-core";
import { OctEncodedNormal, QParams2d, QParams3d, RenderTexture } from "@bentley/imodeljs-common";
import { GltfMeshData } from "../../../tile/internal";
import { RenderMemory } from "../../RenderMemory";
import { Mesh } from "./MeshPrimitives";

export interface RealityMeshProps {
  readonly indices: Uint16Array;
  readonly pointQParams: QParams3d;
  readonly points: Uint16Array;
  readonly normals?: Uint16Array;
  readonly uvQParams: QParams2d;
  readonly uvs: Uint16Array;
  readonly featureID: number;
  readonly texture?: RenderTexture;
}

/** @internal */
export class RealityMeshPrimitive implements RenderMemory.Consumer {
  public readonly indices: Uint16Array;
  public readonly pointQParams: QParams3d;
  public readonly points: Uint16Array;
  public readonly normals?: Uint16Array;
  public readonly uvQParams: QParams2d;
  public readonly uvs: Uint16Array;
  public readonly featureID: number = 0;
  public readonly texture?: RenderTexture;
  protected constructor(props: RealityMeshProps) {
    this.pointQParams = props.pointQParams;
    this.points = props.points;
    this.uvQParams = props.uvQParams;
    this.uvs = props.uvs;
    this.normals = props.normals;
    this.indices = props.indices;
    this.featureID = props.featureID;
    this.texture = props.texture;
  }

  public static createFromGltfMesh(mesh: GltfMeshData): RealityMeshPrimitive | undefined {
    if (mesh.primitive.type !== Mesh.PrimitiveType.Mesh || mesh.primitive.edges || !mesh.pointQParams || !mesh.uvQParams || !mesh.points || !mesh.uvs || !mesh.indices || !(mesh.indices instanceof Uint16Array))
      return undefined;     // Simple meshes have only triangles without edges and are textured.

    return new RealityMeshPrimitive({ indices: mesh.indices, pointQParams: mesh.pointQParams, points: mesh.points, uvQParams: mesh.uvQParams, uvs: mesh.uvs, normals: mesh.normals, featureID: 0, texture: mesh.primitive.displayParams.textureMapping?.texture });
  }

  public collectStatistics(stats: RenderMemory.Statistics): void {
    stats.addTerrain(this.bytesUsed);
  }
  public get bytesUsed() {
    return 2 * (this.indices.length + this.points.length  + this.uvs.length + (this.normals ? this.normals.length : 0));
  }

  public createPolyface(transform: Transform | undefined, needNormals?: boolean, needParams?: boolean): Polyface | undefined {
    if (!this.pointQParams || !this.points || !this.indices) {
      assert (false, "missing mesh points");
      return undefined;
    }
    const { points, pointQParams, normals, uvs, uvQParams, indices } = this;
    const includeNormals = needNormals && undefined !== normals;
    const includeParams = needParams && undefined !== uvQParams && undefined !== uvs;

    const polyface = IndexedPolyface.create(includeNormals, includeParams);
    for (let i = 0; i < points.length; ) {
      const point = pointQParams.unquantize(points[i++], points[i++], points[i++]);
      if (transform)
        transform.multiplyPoint3d(point, point);

      polyface.addPoint(point);
    }

    if (includeNormals)
      for (let i = 0; i < normals!.length; )
        polyface.addNormal(OctEncodedNormal.decodeValue(normals![i++]));

    if (includeParams)
      for (let i = 0; i < uvs.length; )
        polyface.addParam(uvQParams.unquantize(uvs[i++], uvs[i++]));

    let j = 0;
    indices.forEach((index: number) => {
      polyface.addPointIndex(index);
      if (includeNormals)
        polyface.addNormalIndex(index);
      if (includeParams)
        polyface.addParamIndex(index);
      if (0 === (++j % 3))
        polyface.terminateFacet();
    });
    return polyface;
  }

}
