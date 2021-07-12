/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tiles
 */

import { assert, Id64String } from "@bentley/bentleyjs-core";
import { Angle, Ellipsoid, EllipsoidPatch, Point2d, Point3d, Range1d, Range3d, Transform } from "@bentley/geometry-core";
import { QParams3d, QPoint2d } from "@bentley/imodeljs-common";
import { IModelConnection } from "../../IModelConnection";
import { TerrainMeshPrimitive } from "../../render/primitives/mesh/TerrainMeshPrimitive";
import { MapCartoRectangle, MapTile, QuadId, TerrainMeshProvider } from "../internal";
import { MapTilingScheme, WebMercatorTilingScheme } from "./MapTilingScheme";

const scratchPoint2d = Point2d.createZero();
const scratchPoint = Point3d.createZero();
const scratchQPoint2d = new QPoint2d();
const scratchEllipsoid = Ellipsoid.create(Transform.createIdentity());
const scratchZeroRange = Range1d.createXX(0, 0);
let scratch8Points: Array<Point3d>;
let scratch8Params: Array<Point2d>;

/** Terrain provider that produces geometry that represents a smooth ellipsoid without any height perturbations.
 * The area within the project extents are represented as planar tiles and other tiles are facetted approximations
 * of the WGS84 ellipsoid.
 * @see [[TerrainMeshProvider]]
 * @internal
 */
export class EllipsoidTerrainProvider extends TerrainMeshProvider {
  private _tilingScheme = new WebMercatorTilingScheme();
  constructor(iModel: IModelConnection, modelId: Id64String, private _wantSkirts: boolean) {
    super(iModel, modelId);
  }

  public override get requiresLoadedContent() { return false; }
  public override constructUrl(_row: number, _column: number, _zoomLevel: number): string { assert(false); return ""; }
  public isTileAvailable(_quadId: QuadId): boolean { return true; }
  public get maxDepth(): number { return 22; }
  public getChildHeightRange(_quadId: QuadId, _rectangle: MapCartoRectangle, _parent: MapTile): Range1d | undefined { return scratchZeroRange; }
  public get tilingScheme(): MapTilingScheme { return this._tilingScheme; }

  private getPlanarMesh(tile: MapTile): TerrainMeshPrimitive {
    const projection = tile.getProjection();
    let mesh: TerrainMeshPrimitive;
    const skirtProps = { wantSkirts: false, northCount: 0, southCount: 0, eastCount: 0, westCount: 0 };  // Skirts are explicitly created, no need to preallocate

    if (!this._wantSkirts) {
      mesh = TerrainMeshPrimitive.create({ ...skirtProps, pointQParams: QParams3d.fromRange(projection.localRange), pointCount: 4, indexCount: 6, wantNormals: false });
      for (let v = 0; v < 2; v++)
        for (let u = 0; u < 2; u++) {
          scratchQPoint2d.init(Point2d.create(u, 1 - v, scratchPoint2d), mesh.uvQParams);
          mesh.addVertex(projection.getPoint(u, v, 0, scratchPoint), scratchQPoint2d);
        }
      mesh.addQuad(0, 1, 2, 3);
    } else {
      if (!scratch8Points || !scratch8Params) {
        scratch8Points = new Array<Point3d>();
        scratch8Params = new Array<Point2d>();
        for (let i = 0; i < 8; i++) {
          scratch8Points.push(Point3d.createZero());
          scratch8Params.push(Point2d.createZero());
        }
      }

      const skirtHeight = tile.range.xLength() / 20.0;
      for (let v = 0, i = 0; v < 2; v++)
        for (let u = 0; u < 2; u++)
          for (let h = 0; h < 2; h++) {
            scratch8Params[i].set(u, 1 - v);
            projection.getPoint(u, v, h * skirtHeight, scratch8Points[i]);
            i++;
          }
      mesh = TerrainMeshPrimitive.create({ ...skirtProps, pointQParams: QParams3d.fromRange(Range3d.createArray(scratch8Points)), pointCount: 8, indexCount: 30, wantNormals: false });
      for (let i = 0; i < 8; i++) {
        scratchQPoint2d.init(scratch8Params[i], mesh.uvQParams);
        mesh.addVertex(scratch8Points[i], scratchQPoint2d);
      }

      mesh.addQuad(0, 2, 4, 6);
      const reorder = [0, 2, 6, 4, 0];
      for (let i = 0; i < 4; i++) {
        const iThis = reorder[i], iNext = reorder[i + 1];
        mesh.addQuad(iThis, iNext, iThis + 1, iNext + 1);
      }
    }
    assert(mesh.isCompleted);
    return mesh;
  }
  private getGlobeMesh(tile: MapTile): TerrainMeshPrimitive | undefined {
    const globeMeshDimension = 10;
    const projection = tile.getProjection();
    const ellipsoidPatch = projection.ellipsoidPatch;

    if (undefined === ellipsoidPatch) {
      assert(false);
      return undefined;
    }

    const bordersSouthPole = tile.quadId.bordersSouthPole(this._tilingScheme);
    const bordersNorthPole = tile.quadId.bordersNorthPole(this._tilingScheme);

    const range = projection.localRange.clone();
    const delta = 1.0 / (globeMeshDimension - 3);
    const skirtFraction = delta / 2.0;
    const dimensionM1 = globeMeshDimension - 1, dimensionM2 = globeMeshDimension - 2;
    ellipsoidPatch.ellipsoid.transformRef.clone(scratchEllipsoid.transformRef);
    const skirtPatch = EllipsoidPatch.createCapture(scratchEllipsoid, ellipsoidPatch.longitudeSweep, ellipsoidPatch.latitudeSweep);
    const scaleFactor = Math.max(.99, 1 - Math.sin(ellipsoidPatch.longitudeSweep.sweepRadians * delta));
    skirtPatch.ellipsoid.transformRef.matrix.scaleColumnsInPlace(scaleFactor, scaleFactor, scaleFactor);
    const pointCount = globeMeshDimension * globeMeshDimension;
    const rowMin = (bordersNorthPole || this._wantSkirts) ? 0 : 1;
    const rowMax = (bordersSouthPole || this._wantSkirts) ? dimensionM1 : dimensionM2;
    const colMin = this._wantSkirts ? 0 : 1;
    const colMax = this._wantSkirts ? dimensionM1 : dimensionM2;
    const indexCount = 6 * (rowMax - rowMin) * (colMax - colMin);

    const mesh = TerrainMeshPrimitive.create({ pointQParams: QParams3d.fromRange(range), pointCount, indexCount, wantSkirts: false, northCount: globeMeshDimension, southCount: globeMeshDimension, eastCount: globeMeshDimension, westCount: globeMeshDimension, wantNormals: false });

    for (let iRow = 0, index = 0; iRow < globeMeshDimension; iRow++) {
      for (let iColumn = 0; iColumn < globeMeshDimension; iColumn++, index++) {
        let u = (iColumn ? (Math.min(dimensionM2, iColumn) - 1) : 0) * delta;
        let v = (iRow ? (Math.min(dimensionM2, iRow) - 1) : 0) * delta;
        scratchPoint2d.set(u, 1 - v);

        if (iRow === 0 || iRow === dimensionM1 || iColumn === 0 || iColumn === dimensionM1) {
          if (bordersSouthPole && iRow === dimensionM1)
            skirtPatch.ellipsoid.radiansToPoint(0, -Angle.piOver2Radians, scratchPoint);
          else if (bordersNorthPole && iRow === 0)
            skirtPatch.ellipsoid.radiansToPoint(0, Angle.piOver2Radians, scratchPoint);
          else {
            u += (iColumn === 0) ? -skirtFraction : (iColumn === dimensionM1 ? skirtFraction : 0);
            v += (iRow === 0) ? -skirtFraction : (iRow === dimensionM1 ? skirtFraction : 0);
            skirtPatch.uvFractionToPoint(u, v, scratchPoint);
          }
        } else {
          projection.getPoint(u, v, 0, scratchPoint);
        }
        scratchQPoint2d.init(scratchPoint2d, mesh.uvQParams);
        mesh.addVertex(scratchPoint, scratchQPoint2d);
      }
    }

    for (let iRow = rowMin; iRow < rowMax; iRow++) {
      for (let iColumn = colMin; iColumn < colMax; iColumn++) {
        const base = iRow * globeMeshDimension + iColumn;
        const top = base + globeMeshDimension;
        mesh.addTriangle(base, base + 1, top);
        mesh.addTriangle(top, base + 1, top + 1);
      }
    }
    assert(mesh.isCompleted);
    return mesh;
  }
  public override async getMesh(tile: MapTile, _data: Uint8Array): Promise<TerrainMeshPrimitive | undefined> {
    return tile.isPlanar ? this.getPlanarMesh(tile) : this.getGlobeMesh(tile);
  }
}
