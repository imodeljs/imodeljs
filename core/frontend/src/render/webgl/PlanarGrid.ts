/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module WebGL
 */

import { Plane3dByOriginAndUnitNormal, Point2d, Transform } from "@bentley/geometry-core";
import { Frustum, QPoint2dList, QPoint3dList } from "@bentley/imodeljs-common";
import { RenderMemory } from "../RenderMemory";
import { BufferHandle, BufferParameters, QBufferHandle2d, QBufferHandle3d } from "./AttributeBuffers";
import { AttributeMap } from "./AttributeMap";
import { IndexedGeometry, IndexedGeometryParams } from "./CachedGeometry";
import { GL } from "./GL";
import { RenderOrder, RenderPass } from "./RenderFlags";
import { Target } from "./Target";
import { TechniqueId } from "./TechniqueId";
import assert = require("assert");
import { RenderGraphic } from "../RenderGraphic";
import { GraphicBranch } from "../GraphicBranch";
import { PlanarGridProps, RenderSystem } from "../RenderSystem";
import { Primitive } from "./Primitive";

class PlanarGridGeometryParams extends IndexedGeometryParams {

  public readonly uvParams: QBufferHandle2d;

  public constructor(positions: QBufferHandle3d, uvParams: QBufferHandle2d, indices: BufferHandle, numIndices: number, public readonly props: PlanarGridProps) {
    super(positions, indices, numIndices);
    const attrParams = AttributeMap.findAttribute("a_uvParam", TechniqueId.PlanarGrid, false);
    assert(attrParams !== undefined);
    this.buffers.addBuffer(uvParams, [BufferParameters.create(attrParams!.location, 2, GL.DataType.UnsignedShort, false, 0, 0, false)]);
    this.uvParams = uvParams;
  }
}
export class PlanarGridGeometry extends IndexedGeometry {
  public get techniqueId(): TechniqueId { return TechniqueId.PlanarGrid; }
  public getRenderPass(_target: Target): RenderPass { return RenderPass.Translucent; }
  public collectStatistics(_stats: RenderMemory.Statistics): void { }
  public get renderOrder(): RenderOrder { return RenderOrder.UnlitSurface; }
  public readonly uvParams: QBufferHandle2d;
  public readonly props: PlanarGridProps;
  public override get asPlanarGrid(): PlanarGridGeometry | undefined { return this; }

  private constructor(params: PlanarGridGeometryParams) {
    super(params);
    this.uvParams = params.uvParams;
    this.props = params.props;
  }

  public static create(frustum: Frustum, grid: PlanarGridProps, system: RenderSystem): RenderGraphic | undefined {
    const plane = Plane3dByOriginAndUnitNormal.create(grid.origin, grid.rMatrix.rowZ())!;
    const polygon = frustum.getIntersectionWithPlane(plane);

    if (!polygon || polygon.length < 3)
      return undefined;

    const xVector = grid.rMatrix.rowX();
    const yVector = grid.rMatrix.rowY();
    const gridsPerRef = Math.max(1, grid.gridsPerRef);
    const xOrigin = xVector.dotProduct(grid.origin);
    const yOrigin = yVector.dotProduct(grid.origin);
    const params = [];
    for (const polygonPoint of polygon) {
      const x = (xVector.dotProduct(polygonPoint) - xOrigin) / grid.spacing.x;
      const y = (yVector.dotProduct(polygonPoint) - yOrigin) / grid.spacing.y;
      params.push(Point2d.create(x, y));
    }

    const qPoints = QPoint3dList.fromPoints(polygon);
    const qParams = QPoint2dList.fromPoints(params);

    qParams.params.origin.x = qParams.params.origin.x % gridsPerRef;
    qParams.params.origin.y = qParams.params.origin.y % gridsPerRef;

    let transform;
    // If the grid is far from the origin, create a branch to avoid large coordinate accuracy issues. (Reality models).
    if (qPoints.params.origin.magnitude() > 1.0E4) {
      transform = Transform.createTranslationXYZ(qPoints.params.origin.x, qPoints.params.origin.y, qPoints.params.origin.z);
      qPoints.params.origin.setZero();
    }

    const nTriangles = polygon.length - 2;
    const indices = new Uint32Array(3 * nTriangles);
    for (let i = 0, j = 0; i < nTriangles; i++) {
      indices[j++] = 0;
      indices[j++] = i + 1;
      indices[j++] = i + 2;
    }
    const pointBuffer = QBufferHandle3d.create(qPoints.params, qPoints.toTypedArray());
    const paramBuffer = QBufferHandle2d.create(qParams.params, qParams.toTypedArray());
    const indBuffer = BufferHandle.createBuffer(GL.Buffer.Target.ElementArrayBuffer, indices);
    if (!pointBuffer || !paramBuffer || !indBuffer)
      return undefined;

    const geomParams = new PlanarGridGeometryParams(pointBuffer, paramBuffer, indBuffer, indices.length, grid);
    if (!geomParams)
      return undefined;

    const geom = new PlanarGridGeometry(geomParams);
    let graphic: RenderGraphic | undefined = Primitive.create(() => geom);

    if (transform && graphic) {
      const branch = new GraphicBranch(true);
      branch.add(graphic);
      graphic = system.createBranch(branch, transform);
    }

    return graphic;
  }
}

