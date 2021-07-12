/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { assert } from "@bentley/bentleyjs-core";
import { Point3d, Range1d, Range2d, Vector3d } from "@bentley/geometry-core";
import { OctEncodedNormal, QParams2d, QParams3d, QPoint2d, QPoint3d, Quantization } from "@bentley/imodeljs-common";
import { RenderMemory } from "../../RenderMemory";
import { RealityMeshPrimitive, RealityMeshProps } from "./RealityMeshPrimitive";

export enum Child { Q00, Q01, Q10, Q11 }
class UpsampleIndexMap extends Map<number, number> {
  private _next = 0;
  public indices = new Array<number>();
  public addTriangle(indices: number[]) {
    for (const index of indices) {
      let mapIndex = this.get(index);
      if (undefined === mapIndex)
        this.set(index, mapIndex = this._next++);
      this.indices.push(mapIndex);
    }
  }
}
class ClipAxis {
  constructor(public vertical: boolean, public lessThan: boolean, public value: number) { }
}

const scratchQPoint3d = QPoint3d.fromScalars(0, 0, 0), scratchQPoint3d1 = QPoint3d.fromScalars(0, 0, 0);
const scratchQPoint2d = new QPoint2d(), scratchQPoint2d1 = new QPoint2d();

/**  These are currently retained on terrain leaf tiles for upsampling.
 * It may be worthwhile to pack the data into buffers...
 * @internal.
 */
export class TerrainMeshPrimitive extends RealityMeshPrimitive {
  private _currPointCount = 0;
  private _currIndexCount = 0;

  private constructor(props: RealityMeshProps, private _pointCapacity: number, private _indexCapacity: number) {
    super(props);
  }

  public get isCompleted() { return this._currIndexCount === this._indexCapacity && this._currPointCount === this._pointCapacity; }
  public get nextPointIndex() { return this._currPointCount; }

  public static create(props: TerrainMesh.Props) {
    let totalIndices = props.indexCount;
    let totalPoints = props.pointCount;
    if (props.wantSkirts) {
      totalIndices += 6 * (Math.max(0, props.northCount - 1) + Math.max(0, props.southCount - 1) + Math.max(0, props.eastCount - 1) + Math.max(0, props.westCount - 1));
      totalPoints += (props.northCount + props.southCount + props.eastCount + props.westCount);
    }
    const realityMeshProps = {
      indices: new Uint16Array(totalIndices), pointQParams: props.pointQParams, points: new Uint16Array(3 * totalPoints),
      uvQParams: QParams2d.fromZeroToOne(), uvs: new Uint16Array(2 * totalPoints), normals: props.wantNormals ? new Uint16Array(totalPoints) : undefined, featureID: 0,
    };
    return new TerrainMeshPrimitive(realityMeshProps, totalPoints, totalIndices);
  }

  public override collectStatistics(stats: RenderMemory.Statistics): void {
    stats.addTerrain(this.bytesUsed);
  }

  public addVertex(point: Point3d, uvParam: QPoint2d, normal?: number) {
    scratchQPoint3d.init(point, this.pointQParams);
    this.addQuantizedVertex(scratchQPoint3d, uvParam, normal);
  }

  public addQuantizedVertex(point: QPoint3d, uv: QPoint2d, normal?: number) {
    if (this._currPointCount >= this._pointCapacity) {
      assert(false, "terrain point capacity exceeded");
      return;
    }
    let pointIndex = 3 * this._currPointCount;
    this.points[pointIndex++] = point.x;
    this.points[pointIndex++] = point.y;
    this.points[pointIndex++] = point.z;

    let paramIndex = 2 * this._currPointCount;
    this.uvs[paramIndex++] = uv.x;
    this.uvs[paramIndex++] = uv.y;

    if (normal && this.normals)
      this.normals[this._currPointCount] = normal;

    this._currPointCount++;
  }
  public addQuad(i0: number, i1: number, i2: number, i3: number) {
    this.addTriangle(i0, i1, i2);
    this.addTriangle(i1, i3, i2);
  }

  public addTriangle(i0: number, i1: number, i2: number) {
    if (this._currIndexCount + 3 > this._indexCapacity) {
      assert(false, "terrain index capacity exceeded");
      return;
    }
    this.indices[this._currIndexCount++] = i0;
    this.indices[this._currIndexCount++] = i1;
    this.indices[this._currIndexCount++] = i2;
  }
  public addIndices(indices: number[]) {
    for (const index of indices)
      this.indices[this._currIndexCount++] = index;
  }

  private static _scratchZRange = Range1d.createNull();
  private static _scratchTriangleRange = Range2d.createNull();
  private static _scratchUVRange = Range2d.createNull();
  private static _scratchUVQParams = QParams2d.fromZeroToOne();
  public upsample(uvSampleRange: Range2d): { heightRange: Range1d, mesh: TerrainMeshPrimitive } {
    const indexMap = new UpsampleIndexMap();
    const uvLow = QPoint2d.create(uvSampleRange.low, TerrainMeshPrimitive._scratchUVQParams);
    const uvHigh = QPoint2d.create(uvSampleRange.high, TerrainMeshPrimitive._scratchUVQParams);
    const uvRange = Range2d.createXYXY(uvLow.x, uvLow.y, uvHigh.x, uvHigh.y, TerrainMeshPrimitive._scratchUVRange);
    const clipAxes = new Array<ClipAxis>();
    const addedPoints = new Array<QPoint3d>(), addedParams = new Array<QPoint2d>(), addedNormals = new Array<number>();
    if (uvLow.x > 0)
      clipAxes.push(new ClipAxis(true, false, uvLow.x));
    if (uvHigh.x < Quantization.rangeScale16)
      clipAxes.push(new ClipAxis(true, true, uvHigh.x));
    if (uvLow.y > 0)
      clipAxes.push(new ClipAxis(false, false, uvLow.y));
    if (uvHigh.y < Quantization.rangeScale16)
      clipAxes.push(new ClipAxis(false, true, uvHigh.y));

    for (let i = 0; i < this.indices.length;) {
      const triangleIndices = [this.indices[i++], this.indices[i++], this.indices[i++]];

      const triangleRange = Range2d.createNull(TerrainMeshPrimitive._scratchTriangleRange);
      for (const index of triangleIndices) {
        const paramIndex = 2 * index;
        triangleRange.extendXY(this.uvs[paramIndex], this.uvs[paramIndex + 1]);
      }

      if (uvRange.intersectsRange(triangleRange)) {
        if (uvRange.containsRange(triangleRange)) {
          indexMap.addTriangle(triangleIndices);
        } else {
          this.addClipped(triangleIndices, indexMap, clipAxes, 0, addedPoints, addedParams, addedNormals);
        }
      }
    }

    const parentPoints = this.points;
    const parentParams = this.uvs;
    const parentNormals = this.normals;
    const parentPointCount = this.points.length / 3;

    const zRange = Range1d.createNull(TerrainMeshPrimitive._scratchZRange);

    const mesh = TerrainMeshPrimitive.create({ pointQParams: this.pointQParams, pointCount: indexMap.size, indexCount: indexMap.indices.length, wantSkirts: false, northCount: 0, southCount: 0, eastCount: 0, westCount: 0, wantNormals: this.normals !== undefined });
    for (const mapEntry of indexMap.entries()) {
      const parentIndex = mapEntry[0];

      let normal: number | undefined;
      if (parentIndex < parentPointCount) {
        const pointIndex = 3 * parentIndex;
        scratchQPoint3d.setFromScalars(parentPoints[pointIndex], parentPoints[pointIndex + 1], parentPoints[pointIndex + 2]);
        const paramIndex = 2 * parentIndex;
        scratchQPoint2d.setFromScalars(parentParams[paramIndex], parentParams[paramIndex + 1]);
        if (parentNormals)
          normal = parentNormals[parentIndex];
      } else {
        const addedIndex = parentIndex - parentPointCount;
        addedPoints[addedIndex].clone(scratchQPoint3d);
        addedParams[addedIndex].clone(scratchQPoint2d);
        if (addedNormals.length)
          normal = addedNormals[addedIndex];
      }
      mesh.addQuantizedVertex(scratchQPoint3d, scratchQPoint2d, normal);
      zRange.extendX(scratchQPoint3d.z);
    }
    mesh.addIndices(indexMap.indices);

    assert(mesh.isCompleted);
    const qParams = this.pointQParams;
    const heightRange = Range1d.createXX(Quantization.unquantize(zRange.low, qParams.origin.z, qParams.scale.z), Quantization.unquantize(zRange.high, qParams.origin.z, qParams.scale.z));
    return { heightRange, mesh };
  }
  private addClipped(triangleIndices: number[], indexMap: UpsampleIndexMap, clipAxes: ClipAxis[], clipIndex: number, addedPoints: QPoint3d[], addedParams: QPoint2d[], addedNormals: number[]) {
    if (clipIndex === clipAxes.length) {
      indexMap.addTriangle(triangleIndices);
      return;
    }

    const inside = new Array<boolean>(3);
    const values = new Array<number>(3);
    const clipOutput = new Array<number>();
    const clipAxis = clipAxes[clipIndex++];
    const parentPoints = this.points;
    const parentParams = this.uvs;
    const parentNormals = this.normals;
    const clipValue = clipAxis.value;
    const parentPointCount = parentPoints.length / 3;
    const getPoint = (index: number, result: QPoint3d): QPoint3d => {
      if (index < parentPointCount) {
        const pointIndex = index * 3;
        result.setFromScalars(parentPoints[pointIndex], parentPoints[pointIndex + 1], parentPoints[pointIndex + 2]);
      } else {
        addedPoints[index - parentPointCount].clone(result);
      }
      return result;
    };
    const getParam = (index: number, result: QPoint2d): QPoint2d => {
      if (index < parentPointCount) {
        const pointIndex = index * 2;
        result.setFromScalars(parentParams[pointIndex], parentParams[pointIndex + 1]);
      } else {
        addedParams[index - parentPointCount].clone(result);
      }
      return result;
    };
    const getNormal = (index: number): number | undefined => {
      if (!parentNormals)
        return undefined;

      return (index < parentPointCount) ? parentNormals[index] : addedNormals[index - parentPointCount];
    };

    for (let i = 0; i < 3; i++) {
      const index = triangleIndices[i];
      const thisParam = getParam(index, scratchQPoint2d);
      const thisValue = clipAxis.vertical ? thisParam.x : thisParam.y;
      values[i] = thisValue;
      inside[i] = clipAxis.lessThan ? (thisValue < clipValue) : (thisValue > clipValue);
    }

    for (let i = 0; i < 3; i++) {
      const index = triangleIndices[i];
      const next = (i + 1) % 3;
      if (inside[i])
        clipOutput.push(index);
      if (inside[i] !== inside[next]) {
        const nextIndex = triangleIndices[next];
        const fraction = (clipValue - values[i]) / (values[next] - values[i]);

        clipOutput.push(parentPointCount + addedPoints.length);
        addedPoints.push(interpolateQPoint3d(getPoint(index, scratchQPoint3d), getPoint(nextIndex, scratchQPoint3d1), fraction));
        addedParams.push(interpolateQPoint2d(getParam(index, scratchQPoint2d), getParam(nextIndex, scratchQPoint2d1), fraction));
        if (parentNormals)
          addedNormals.push(interpolateOctEncodedNormal(getNormal(index)!, getNormal(nextIndex)!, fraction));

      }
    }
    if (clipOutput.length > 2) {
      this.addClipped(clipOutput.slice(0, 3), indexMap, clipAxes, clipIndex, addedPoints, addedParams, addedNormals);
      if (clipOutput.length > 3)
        this.addClipped([clipOutput[0], clipOutput[2], clipOutput[3]], indexMap, clipAxes, clipIndex, addedPoints, addedParams, addedNormals);
    }
  }
}

function interpolate(value0: number, value1: number, fraction: number) { return value0 + (value1 - value0) * fraction; }
function interpolateInt(value0: number, value1: number, fraction: number) { return Math.floor(.5 + interpolate(value0, value1, fraction)); }

function interpolateQPoint3d(qPoint: QPoint3d, qNext: QPoint3d, fraction: number): QPoint3d {
  return QPoint3d.fromScalars(interpolateInt(qPoint.x, qNext.x, fraction), interpolateInt(qPoint.y, qNext.y, fraction), interpolateInt(qPoint.z, qNext.z, fraction));
}

function interpolateQPoint2d(qPoint: QPoint2d, qNext: QPoint2d, fraction: number): QPoint2d {
  return QPoint2d.fromScalars(interpolateInt(qPoint.x, qNext.x, fraction), interpolateInt(qPoint.y, qNext.y, fraction));
}

function interpolateOctEncodedNormal(normal0: number, normal1: number, fraction: number): number {
  const n0 = OctEncodedNormal.decodeValue(normal0);
  const n1 = OctEncodedNormal.decodeValue(normal1);
  if (undefined !== n0 && undefined !== n1) {
    const n = Vector3d.create(interpolate(n0.x, n1.x, fraction), interpolate(n0.y, n1.y, fraction), interpolate(n0.z, n1.z, fraction));
    n.normalizeInPlace();
    return OctEncodedNormal.encode(n);
  } else {
    return OctEncodedNormal.encode(Vector3d.create(0, 0, 1));
  }
}

export namespace TerrainMesh {
  export interface Props {
    readonly wantNormals: boolean;
    readonly pointQParams: QParams3d;
    readonly pointCount: number;
    readonly indexCount: number;
    readonly wantSkirts: boolean;
    readonly eastCount: number;
    readonly westCount: number;
    readonly northCount: number;
    readonly southCount: number;
  }
}
