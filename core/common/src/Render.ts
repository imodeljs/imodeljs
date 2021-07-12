/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { assert } from "@bentley/bentleyjs-core";
import { OctEncodedNormalPair } from "./OctEncodedNormal";

// cSpell:ignore vals

/** @internal */
export enum PolylineTypeFlags {
  Normal = 0,      // Just an ordinary polyline
  Edge = 1 << 0, // A polyline used to define the edges of a planar region.
  Outline = 1 << 1, // Like Edge, but the edges are only displayed in wireframe mode when surface fill is undisplayed.
}

/** Flags describing a polyline. A polyline may represent a continuous line string, or a set of discrete points.
 * @internal
 */
export class PolylineFlags {
  public isDisjoint: boolean;
  public isPlanar: boolean;
  public is2d: boolean;
  public type: PolylineTypeFlags;

  public constructor(is2d = false, isPlanar = false, isDisjoint = false, type = PolylineTypeFlags.Normal) {
    this.isDisjoint = isDisjoint;
    this.isPlanar = isPlanar;
    this.is2d = is2d;
    this.type = type;
  }

  public clone(): PolylineFlags { return new PolylineFlags(this.is2d, this.isPlanar, this.isDisjoint, this.type); }

  /** Create a PolylineFlags from a serialized numeric representation. */
  public static unpack(value: number): PolylineFlags {
    const isDisjoint = 0 !== (value & 1);
    const isPlanar = 0 !== (value & 2);
    const is2d = 0 !== (value & 4);
    const type: PolylineTypeFlags = (value >> 3);
    assert(type === PolylineTypeFlags.Normal || type === PolylineTypeFlags.Edge || type === PolylineTypeFlags.Outline);

    return new PolylineFlags(is2d, isPlanar, isDisjoint, type);
  }

  public initDefaults() {
    this.isDisjoint = this.isPlanar = this.is2d = false;
    this.type = PolylineTypeFlags.Normal;
  }

  public get isOutlineEdge(): boolean { return PolylineTypeFlags.Outline === this.type; }
  public get isNormalEdge(): boolean { return PolylineTypeFlags.Edge === this.type; }
  public get isAnyEdge(): boolean { return PolylineTypeFlags.Normal !== this.type; }
  public setIsNormalEdge(): void { this.type = PolylineTypeFlags.Edge; }
  public setIsOutlineEdge(): void { this.type = PolylineTypeFlags.Outline; }

  /** Convert these flags to a numeric representation for serialization. */
  public pack(): number {
    let val: number = 0;
    if (this.isDisjoint)
      val += 1;
    if (this.isPlanar)
      val += 1 << 1;
    if (this.is2d)
      val += 1 << 2;
    val += (this.type as number) << 3;
    return val;
  }

  public equals(other: PolylineFlags) {
    return this.type === other.type && this.is2d === other.is2d && this.isPlanar === other.isPlanar && this.isDisjoint === other.isDisjoint;
  }
}

/** @internal */
export class PolylineData {
  public vertIndices: number[];
  public numIndices: number;
  public constructor(vertIndices: number[] = [], numIndices = 0) {
    this.vertIndices = vertIndices;
    this.numIndices = numIndices;
  }
  public get isValid(): boolean { return 0 < this.numIndices; }
  public reset(): void { this.numIndices = 0; this.vertIndices = []; }
  public init(polyline: MeshPolyline) {
    this.numIndices = polyline.indices.length;
    this.vertIndices = 0 < this.numIndices ? polyline.indices : [];
    return this.isValid;
  }
}

/** @internal */
export class MeshPolyline {
  public readonly indices: number[];
  public constructor(indices: number[] = []) {
    this.indices = indices.slice();
  }
  public addIndex(index: number) {
    const { indices } = this;
    if (indices.length === 0 || indices[indices.length - 1] !== index)
      indices.push(index);
  }
  public clear() { this.indices.length = 0; }
}

/** @internal */
export class MeshPolylineList extends Array<MeshPolyline> { constructor(...args: MeshPolyline[]) { super(...args); } }

/** @internal */
export class MeshEdge {
  public indices = [0, 0];

  public constructor(index0?: number, index1?: number) {
    if (undefined === index0 || undefined === index1)
      return;
    if (index0 < index1) {
      this.indices[0] = index0;
      this.indices[1] = index1;
    } else {
      this.indices[0] = index1;
      this.indices[1] = index0;
    }
  }

  public compareTo(other: MeshEdge): number {
    let diff = this.indices[0] - other.indices[0];
    if (0 === diff)
      diff = this.indices[1] - other.indices[1];

    return diff;
  }
}

/** @internal */
export class MeshEdges {
  public visible: MeshEdge[] = [];
  public silhouette: MeshEdge[] = [];
  public polylines: MeshPolylineList = new MeshPolylineList();
  public silhouetteNormals: OctEncodedNormalPair[] = [];
  public constructor() { }
}

/** @internal */
export class EdgeArgs {
  public edges?: MeshEdge[];

  public init(meshEdges?: MeshEdges): boolean {
    this.clear();
    if (undefined !== meshEdges && 0 < meshEdges.visible.length)
      this.edges = meshEdges.visible;

    return this.isValid;
  }

  public clear(): void { this.edges = undefined; }
  public get isValid(): boolean { return 0 < this.numEdges; }
  public get numEdges() { return undefined !== this.edges ? this.edges.length : 0; }
}

/** @internal */
export class SilhouetteEdgeArgs extends EdgeArgs {
  public normals?: OctEncodedNormalPair[];

  public override init(meshEdges?: MeshEdges) {
    this.clear();
    if (undefined !== meshEdges && 0 < meshEdges.silhouette.length) {
      this.edges = meshEdges.silhouette;
      this.normals = meshEdges.silhouetteNormals;
    }

    return this.isValid;
  }

  public override clear() { this.normals = undefined; super.clear(); }
}

/** @internal */
export class PolylineEdgeArgs {
  public lines?: PolylineData[];

  public constructor(lines?: PolylineData[]) { this.init(lines); }

  public init(lines?: PolylineData[]): boolean {
    this.lines = undefined !== lines && 0 < lines.length ? lines : undefined;
    return this.isValid;
  }

  public get numLines() { return undefined !== this.lines ? this.lines.length : 0; }
  public get isValid() { return this.numLines > 0; }
  public clear() { this.lines = undefined; }
}
