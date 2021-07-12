/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Polyface
 */

// import { Point2d } from "./Geometry2d";
/* eslint-disable @typescript-eslint/naming-convention, no-empty */
import { Transform } from "../geometry3d/Transform";
import { Matrix3d } from "../geometry3d/Matrix3d";
import { Point3d } from "../geometry3d/Point3dVector3d";
import { NumberArray } from "../geometry3d/PointHelpers";
// import { Geometry } from "./Geometry";
import { Range1d, Range3d } from "../geometry3d/Range";

/** The types of data that can be represented by an [[AuxChannelData]]. Each type of data contributes differently to the
 * animation applied by an [AnalysisStyle]($common) and responds differently when the host [[PolyfaceAuxData]] is transformed.
 * @public
 */
export enum AuxChannelDataType {
  /** General-purpose scalar values like stress, temperature, etc., used to recolor the [[Polyface]]'s vertices.
   * When the host Polyface is transformed, scalar values remain unmodified.
   */
  Scalar = 0,
  /** Distances in meters used to recolor the [[Polyface]]'s vertices.
   * When the host [[Polyface]] is transformed the [[Transform]]'s scale is applied to the distances.
   */
  Distance = 1,
  /** (X, Y, Z) displacement vectors added to the [[Polyface]]'s vertex positions resulting in deformation of the mesh.
   * When the host Polyface is transformed the displacements are rotated and scaled accordingly.
   */
  Vector = 2,
  /** (X, Y, Z) normal vectors that replace the host [[Polyface]]'s own normals.
   * When the Polyface is transformed the normals are rotated accordingly.
   */
  Normal = 3,
}

/**  Represents the [[AuxChannel]] data at a single input value.
 * @public
*/
export class AuxChannelData {
  /** The input value for this data. */
  public input: number;
  /** The vertex values for this data. A single value per vertex for scalar and distance types and 3 values (x,y,z) for normal or vector channels. */
  public values: number[];

  /** Construct a new [[AuxChannelData]] from input value and vertex values. */
  constructor(input: number, values: number[] | Float64Array) {
    this.input = input;
    if (values instanceof Float64Array) {
      this.values = [];
      for (const v of values) this.values.push(v);
    } else
      this.values = values;
  }

  /** Copy blocks of size `blockSize` from (blocked index) `thisIndex` in this AuxChannelData to (blockIndex) `otherIndex` of `other` */
  public copyValues(other: AuxChannelData, thisIndex: number, otherIndex: number, blockSize: number): void {
    for (let i = 0; i < blockSize; i++)
      this.values[thisIndex * blockSize + i] = other.values[otherIndex * blockSize + i];
  }

  /** return a deep copy */
  public clone(): AuxChannelData {
    return new AuxChannelData(this.input, this.values.slice());
  }

  /** toleranced comparison of the `input` and `value` fields.
   * * Default tolerance is 1.0e-8
   */
  public isAlmostEqual(other: AuxChannelData, tol?: number): boolean {
    const tolerance = tol ? tol : 1.0E-8;
    return Math.abs(this.input - other.input) < tolerance && NumberArray.isAlmostEqual(this.values, other.values, tolerance);
  }
}

/**  Represents a single [[PolyfaceAuxData]] channel.
 * @public
*/
export class AuxChannel {
  /** An array of [[AuxChannelData]] that represents the vertex data at one or more input values. */
  public data: AuxChannelData[];
  /** The type of data stored in this channel. */
  public dataType: AuxChannelDataType;
  /** The channel name. This is used to present the [[AuxChannel]] to the user and also to select the [[AuxChannel]] for display from AnalysisStyle */
  public name?: string;
  /** The input name. */
  public inputName?: string;

  /** Create a [[AuxChannel]] */
  public constructor(data: AuxChannelData[], dataType: AuxChannelDataType, name?: string, inputName?: string) {
    this.data = data;
    this.dataType = dataType;
    this.name = name;
    this.inputName = inputName;
  }

  /** Return a deep copy. */
  public clone(): AuxChannel {
    const clonedData = [];
    for (const data of this.data) clonedData.push(data.clone());
    return new AuxChannel(clonedData, this.dataType, this.name, this.inputName);
  }

  /** Toleranced comparison of contents. */
  public isAlmostEqual(other: AuxChannel, tol?: number): boolean {
    if (this.dataType !== other.dataType ||
      this.name !== other.name ||
      this.inputName !== other.inputName ||
      this.data.length !== other.data.length)
      return false;

    for (let i = 0; i < this.data.length; i++)
      if (!this.data[i].isAlmostEqual(other.data[i], tol))
        return false;

    return true;
  }

  /** True if [[entriesPerValue]] is `1`. */
  public get isScalar(): boolean {
    return this.dataType === AuxChannelDataType.Distance || this.dataType === AuxChannelDataType.Scalar;
  }

  /** The number of values in `data.values` per entry - 1 for scalar and distance types, 3 for normal and vector types. */
  public get entriesPerValue(): number {
    return this.isScalar ? 1 : 3;
  }

  /** The number of entries in `data.values`. */
  public get valueCount(): number {
    return 0 === this.data.length ? 0 : this.data[0].values.length / this.entriesPerValue;
  }

  /** The minimum and maximum values in `data.values`, or `undefined` if [[isScalar]] is false. */
  public get scalarRange(): Range1d | undefined {
    if (!this.isScalar)
      return undefined;

    const range = Range1d.createNull();
    for (const data of this.data)
      range.extendArray(data.values);

    return range;
  }

  /** Compute the range of this channel's displacement values, if [[dataType]] is [[AuxChannelDataType.Vector]].
   * @param scale Scale by which to multiply each displacement.
   * @param result Preallocated object in which to store result.
   * @returns The range encompassing all this channel's displacements scaled by `scale`; or a null range if this channel does not contain displacements.
   */
  public computeDisplacementRange(scale = 1, result?: Range3d): Range3d {
    result = Range3d.createNull(result);

    if (AuxChannelDataType.Vector === this.dataType) {
      for (const data of this.data) {
        const v = data.values;
        for (let i = 0; i < v.length; i += 3)
          result.extendXYZ(v[i] * scale, v[i + 1] * scale, v[i + 2] * scale);
      }
    }

    return result;
  }
}

/**  The `PolyfaceAuxData` structure contains one or more analytical data channels for each vertex of a [[Polyface]], allowing the polyface to be styled
 * using an [AnalysisStyle]($common).
 * Typically a polyface will contain only vertex data required for its basic display: the vertex position, normal
 * and possibly texture parameter. `PolyfaceAuxData` provides supplemental data that is generally computed
 * in an analysis program or other external data source. This can be scalar data used to either override the vertex colors through, or
 * XYZ data used to deform the mesh by adjusting the vertex positions and/or normals.
 * @see [[PolyfaceData.auxData]] to associate auxiliary data with a polyface.
 * @public
 */
export class PolyfaceAuxData {
  /** Array with one or more channels of auxiliary data for the associated polyface. */
  public channels: AuxChannel[];
  /** The indices (shared by all data in all channels) mapping the data to the mesh facets. */
  public indices: number[];

  public constructor(channels: AuxChannel[], indices: number[]) {
    this.channels = channels;
    this.indices = indices;
  }

  /** Return a deep copy. */
  public clone(): PolyfaceAuxData {
    const clonedChannels = this.channels.map((x) => x.clone());
    return new PolyfaceAuxData(clonedChannels, this.indices.slice());
  }

  /** Returns true if `this` is equivalent to `other` within `tolerance`.
   * The indices are compared for exact equality. The data in the channels are compared using `tolerance`, which defaults to 1.0e-8.
   */
  public isAlmostEqual(other: PolyfaceAuxData, tolerance?: number): boolean {
    if (!NumberArray.isExactEqual(this.indices, other.indices) || this.channels.length !== other.channels.length)
      return false;

    for (let i = 0; i < this.channels.length; i++)
      if (!this.channels[i].isAlmostEqual(other.channels[i], tolerance))
        return false;

    return true;
  }

  /** Returns true if both `left` and `right` are undefined, or both are defined and equivalent within `tolerance` (default: 1.0e-8). */
  public static isAlmostEqual(left: PolyfaceAuxData | undefined, right: PolyfaceAuxData | undefined, tol?: number): boolean {
    if (left === right) // This catches double undefined !!!
      return true;
    if (left && right)
      return left.isAlmostEqual(right, tol);
    return false;
  }

  /** Create a PolyfaceAuxData for use by a [[PolyfaceVisitor]].  */
  public createForVisitor(): PolyfaceAuxData {
    const visitorChannels: AuxChannel[] = [];

    for (const parentChannel of this.channels) {
      const visitorChannelData: AuxChannelData[] = [];
      for (const parentChannelData of parentChannel.data)
        visitorChannelData.push(new AuxChannelData(parentChannelData.input, []));

      visitorChannels.push(new AuxChannel(visitorChannelData, parentChannel.dataType, parentChannel.name, parentChannel.inputName));
    }

    return new PolyfaceAuxData(visitorChannels, []);
  }

  /** Apply `transform` to the data in each channel.
   * @see [[AuxChannelDataType]] for details regarding how each data type is affected by the transform.
   * @note This method may fail if a channel of [[AuxChannelDataType.Normal]] exists and `transform.matrix` is non-invertible.
   * @returns true if the channels were all successfully transformed.
   */
  public tryTransformInPlace(transform: Transform): boolean {
    let inverseRot: Matrix3d | undefined;
    const rot = transform.matrix;
    const det = rot.determinant();
    const scale = Math.pow(Math.abs(det), 1 / 3) * (det >= 0 ? 1 : -1);

    for (const channel of this.channels) {
      for (const data of channel.data) {
        switch (channel.dataType) {
          case AuxChannelDataType.Scalar:
            continue;
          case AuxChannelDataType.Distance: {
            for (let i = 0; i < data.values.length; i++)
              data.values[i] *= scale;

            break;
          }
          case AuxChannelDataType.Normal: {
            inverseRot = inverseRot ?? rot.inverse();
            if (!inverseRot)
                return false;

            transformPoints(data.values, (point) => inverseRot!.multiplyTransposeVectorInPlace(point));
            break;
          }
          case AuxChannelDataType.Vector: {
            transformPoints(data.values, (point) => rot.multiplyVectorInPlace(point));
            break;
          }
        }
      }
    }

    return true;
  }
}

function transformPoints(coords: number[], transform: (point: Point3d) => void): void {
  const point = new Point3d();
  for (let i = 0; i < coords.length; i += 3) {
    point.set(coords[i], coords[i + 1], coords[i + 2]);
    transform(point);
    coords[i] = point.x;
    coords[i + 1] = point.y;
    coords[i + 2] = point.z;
  }
}
