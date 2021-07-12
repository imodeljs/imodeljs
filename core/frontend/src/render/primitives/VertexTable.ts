/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { assert } from "@bentley/bentleyjs-core";
import { Point2d, Point3d, Range2d, Vector3d } from "@bentley/geometry-core";
import {
  ColorDef, ColorIndex, FeatureIndex, FeatureIndexType, FillFlags, LinePixels, MeshEdge, OctEncodedNormalPair, PolylineData, PolylineTypeFlags,
  QParams2d, QParams3d, QPoint2d, QPoint3dList, RenderMaterial, RenderTexture,
} from "@bentley/imodeljs-common";
import { IModelApp } from "../../IModelApp";
import { AuxChannelTable } from "./AuxChannelTable";
import { MeshArgs, PolylineArgs } from "./mesh/MeshPrimitives";

/**
 * Holds an array of indices into a VertexTable. Each index is a 24-bit unsigned integer.
 * The order of the indices specifies the order in which vertices are drawn.
 * @internal
 */
export class VertexIndices {
  public readonly data: Uint8Array;

  /**
   * Directly construct from an array of bytes in which each index occupies 3 contiguous bytes.
   * The length of the array must be a multiple of 3. This object takes ownership of the array.
   */
  public constructor(data: Uint8Array) {
    this.data = data;
    assert(0 === this.data.length % 3);
  }

  /** Get the number of 24-bit indices. */
  public get length(): number { return this.data.length / 3; }

  /** Convert an array of 24-bit unsigned integer values into a VertexIndices object. */
  public static fromArray(indices: number[]): VertexIndices {
    const bytes = new Uint8Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++)
      this.encodeIndex(indices[i], bytes, i * 3);

    return new VertexIndices(bytes);
  }

  public static encodeIndex(index: number, bytes: Uint8Array, byteIndex: number): void {
    assert(byteIndex + 2 < bytes.length);
    bytes[byteIndex + 0] = index & 0x000000ff;
    bytes[byteIndex + 1] = (index & 0x0000ff00) >> 8;
    bytes[byteIndex + 2] = (index & 0x00ff0000) >> 16;
  }

  public decodeIndex(index: number): number {
    assert(index < this.length);
    const byteIndex = index * 3;
    return this.data[byteIndex] | (this.data[byteIndex + 1] << 8) | (this.data[byteIndex + 2] << 16);
  }

  public decodeIndices(): number[] {
    const indices = [];
    for (let i = 0; i < this.length; i++)
      indices.push(this.decodeIndex(i));

    return indices;
  }
}

/** @internal */
export interface Dimensions {
  width: number;
  height: number;
}

/** @internal */
export function computeDimensions(nEntries: number, nRgbaPerEntry: number, nExtraRgba: number): Dimensions {
  const maxSize = IModelApp.renderSystem.maxTextureSize;
  const nRgba = nEntries * nRgbaPerEntry + nExtraRgba;

  if (nRgba < maxSize)
    return { width: nRgba, height: 1 };

  // Make roughly square to reduce unused space in last row
  let width = Math.ceil(Math.sqrt(nRgba));

  // Ensure a given entry's RGBA values all fit on the same row.
  const remainder = width % nRgbaPerEntry;
  if (0 !== remainder) {
    width += nRgbaPerEntry - remainder;
  }

  // Compute height
  const height = Math.ceil(nRgba / width);

  assert(height <= maxSize);
  assert(width <= maxSize);
  assert(width * height >= nRgba);
  assert(Math.floor(height) === height);
  assert(Math.floor(width) === width);

  // Row padding should never be necessary...
  assert(0 === width % nRgbaPerEntry);

  return { width, height };
}

/** Describes a VertexTable.
 * @internal
 */
export interface VertexTableProps {
  /** The rectangular array of vertex data, of size width*height*numRgbaPerVertex bytes. */
  readonly data: Uint8Array;
  /** Quantization parameters for the vertex positions encoded into the array. */
  readonly qparams: QParams3d;
  /** The number of 4-byte 'RGBA' values in each row of the array. Must be divisible by numRgbaPerVertex. */
  readonly width: number;
  /** The number of rows in the array. */
  readonly height: number;
  /** Whether or not the vertex colors contain translucent colors. */
  readonly hasTranslucency: boolean;
  /** If no color table exists, the color to use for all vertices. */
  readonly uniformColor?: ColorDef;
  /** Describes the number of features (none, one, or multiple) contained. */
  readonly featureIndexType: FeatureIndexType;
  /** If featureIndexType is 'Uniform', the feature ID associated with all vertices. */
  readonly uniformFeatureID?: number;
  /** The number of vertices in the table. Must be less than (width*height)/numRgbaPerVertex. */
  readonly numVertices: number;
  /** The number of 4-byte 'RGBA' values associated with each vertex. */
  readonly numRgbaPerVertex: number;
  /** If vertex data include texture UV coordinates, the quantization params for those coordinates. */
  readonly uvParams?: QParams2d;
}

/**
 * Represents vertex data (position, color, normal, UV params, etc) in a rectangular array.
 * Each vertex is described by one or more contiguous 4-byte ('RGBA') values.
 * This allows vertex data to be uploaded to the GPU as a texture and vertex data to be sampled
 * from that texture using a single vertex ID representing an index into the array.
 * Vertex color is identified by a 16-bit index into a color table appended to the vertex data.
 * @internal
 */
export class VertexTable implements VertexTableProps {
  /** The rectangular array of vertex data, of size width*height*numRgbaPerVertex bytes. */
  public readonly data: Uint8Array;
  /** Quantization parameters for the vertex positions encoded into the array. */
  public readonly qparams: QParams3d;
  /** The number of 4-byte 'RGBA' values in each row of the array. Must be divisible by numRgbaPerVertex. */
  public readonly width: number;
  /** The number of rows in the array. */
  public readonly height: number;
  /** Whether or not the vertex colors contain translucent colors. */
  public readonly hasTranslucency: boolean;
  /** If no color table exists, the color to use for all vertices. */
  public readonly uniformColor?: ColorDef;
  /** Describes the number of features (none, one, or multiple) contained. */
  public readonly featureIndexType: FeatureIndexType;
  /** If featureIndexType is 'Uniform', the feature ID associated with all vertices. */
  public readonly uniformFeatureID?: number;
  /** The number of vertices in the table. Must be less than (width*height)/numRgbaPerVertex. */
  public readonly numVertices: number;
  /** The number of 4-byte 'RGBA' values associated with each vertex. */
  public readonly numRgbaPerVertex: number;
  /** If vertex data include texture UV coordinates, the quantization params for those coordinates. */
  public readonly uvParams?: QParams2d;

  /** Construct a VertexTable. The VertexTable takes ownership of all input data - it must not be later modified by the caller. */
  public constructor(props: VertexTableProps) {
    this.data = props.data;
    this.qparams = props.qparams;
    this.width = props.width;
    this.height = props.height;
    this.hasTranslucency = true === props.hasTranslucency;
    this.uniformColor = props.uniformColor;
    this.featureIndexType = props.featureIndexType;
    this.uniformFeatureID = props.uniformFeatureID;
    this.numVertices = props.numVertices;
    this.numRgbaPerVertex = props.numRgbaPerVertex;
    this.uvParams = props.uvParams;
  }

  public static buildFrom(builder: VertexTableBuilder, colorIndex: ColorIndex, featureIndex: FeatureIndex): VertexTable {
    const { numVertices, numRgbaPerVertex } = builder;
    const numColors = colorIndex.isUniform ? 0 : colorIndex.numColors;
    const dimensions = computeDimensions(numVertices, numRgbaPerVertex, numColors);
    assert(0 === dimensions.width % numRgbaPerVertex || (0 < numColors && 1 === dimensions.height));

    const data = new Uint8Array(dimensions.width * dimensions.height * 4);

    builder.data = data;
    for (let i = 0; i < numVertices; i++)
      builder.appendVertex(i);

    builder.appendColorTable(colorIndex);

    builder.data = undefined;

    return new VertexTable({
      data,
      qparams: builder.qparams,
      width: dimensions.width,
      height: dimensions.height,
      hasTranslucency: colorIndex.hasAlpha,
      uniformColor: colorIndex.uniform,
      numVertices,
      numRgbaPerVertex,
      uvParams: builder.uvParams,
      featureIndexType: featureIndex.type,
      uniformFeatureID: featureIndex.type === FeatureIndexType.Uniform ? featureIndex.featureID : undefined,
    });
  }

  public static createForPolylines(args: PolylineArgs): VertexTable | undefined {
    const polylines = args.polylines;
    if (0 < polylines.length)
      return this.buildFrom(new SimpleBuilder(args), args.colors, args.features);
    else
      return undefined;
  }
}

/** Describes point string geometry to be submitted to the rendering system.
 * @internal
 */
export class PointStringParams {
  public readonly vertices: VertexTable;
  public readonly indices: VertexIndices;
  public readonly weight: number;

  public constructor(vertices: VertexTable, indices: VertexIndices, weight: number) {
    this.vertices = vertices;
    this.indices = indices;
    this.weight = weight;
  }

  public static create(args: PolylineArgs): PointStringParams | undefined {
    if (!args.flags.isDisjoint)
      return undefined;

    const vertices = VertexTable.createForPolylines(args);
    if (undefined === vertices)
      return undefined;

    const polylines = args.polylines;
    let vertIndices = polylines[0].vertIndices;
    if (1 < polylines.length) {
      // We used to assert this wouldn't happen - apparently it does...
      vertIndices = [];
      for (const polyline of polylines)
        for (const vertIndex of polyline.vertIndices)
          vertIndices.push(vertIndex);
    }

    const vertexIndices = VertexIndices.fromArray(vertIndices);
    assert(vertexIndices.length === vertIndices.length);

    return new PointStringParams(vertices, vertexIndices, args.width);
  }
}

/** Parameter associated with each vertex index of a tesselated polyline. */
const enum PolylineParam { // eslint-disable-line no-restricted-syntax
  kNone = 0,
  kSquare = 1 * 3,
  kMiter = 2 * 3,
  kMiterInsideOnly = 3 * 3,
  kJointBase = 4 * 3,
  kNegatePerp = 8 * 3,
  kNegateAlong = 16 * 3,
  kNoneAdjustWeight = 32 * 3,
}

/**
 * Represents a tesselated polyline.
 * Given a polyline as a line string, each segment of the line string is triangulated into a quad.
 * Based on the angle between two segments, additional joint triangles may be inserted in between to enable smoothly-rounded corners.
 * @internal
 */
export interface TesselatedPolyline {
  /** 24-bit index of each vertex. */
  readonly indices: VertexIndices;
  /** 24-bit index of the previous vertex in the polyline. */
  readonly prevIndices: VertexIndices;
  /** 24-bit index of the next vertex in the polyline, plus 8-bit parameter describing the semantics of this vertex. */
  readonly nextIndicesAndParams: Uint8Array;
}

class PolylineVertex {
  public isSegmentStart: boolean = false;
  public isPolylineStartOrEnd: boolean = false;
  public vertexIndex: number = 0;
  public prevIndex: number = 0;
  public nextIndex: number = 0;

  public constructor() { }

  public init(isSegmentStart: boolean, isPolylineStartOrEnd: boolean, vertexIndex: number, prevIndex: number, nextIndex: number) {
    this.isSegmentStart = isSegmentStart;
    this.isPolylineStartOrEnd = isPolylineStartOrEnd;
    this.vertexIndex = vertexIndex;
    this.prevIndex = prevIndex;
    this.nextIndex = nextIndex;
  }

  public computeParam(negatePerp: boolean, adjacentToJoint: boolean = false, joint: boolean = false, noDisplacement: boolean = false): number {
    if (joint)
      return PolylineParam.kJointBase;

    let param: PolylineParam;
    if (noDisplacement)
      param = PolylineParam.kNoneAdjustWeight; // prevent getting tossed before width adjustment
    else if (adjacentToJoint)
      param = PolylineParam.kMiterInsideOnly;
    else
      param = this.isPolylineStartOrEnd ? PolylineParam.kSquare : PolylineParam.kMiter;

    let adjust = 0;
    if (negatePerp)
      adjust = PolylineParam.kNegatePerp;
    if (!this.isSegmentStart)
      adjust += PolylineParam.kNegateAlong;

    return param + adjust;
  }
}

class PolylineTesselator {
  private _polylines: PolylineData[];
  private _points: QPoint3dList;
  private _doJoints: boolean;
  private _numIndices = 0;
  private _vertIndex: number[] = [];
  private _prevIndex: number[] = [];
  private _nextIndex: number[] = [];
  private _nextParam: number[] = [];
  private _position: Point3d[] = [];

  public constructor(polylines: PolylineData[], points: QPoint3dList, doJointTriangles: boolean) {
    this._polylines = polylines;
    this._points = points;
    this._doJoints = doJointTriangles;
  }

  public static fromPolyline(args: PolylineArgs): PolylineTesselator {
    return new PolylineTesselator(args.polylines, args.points, wantJointTriangles(args.width, args.flags.is2d));
  }

  public static fromMesh(args: MeshArgs): PolylineTesselator | undefined {
    if (undefined !== args.edges.polylines.lines && undefined !== args.points)
      return new PolylineTesselator(args.edges.polylines.lines, args.points, wantJointTriangles(args.edges.width, args.is2d));

    return undefined;
  }

  public tesselate(): TesselatedPolyline {
    for (const p of this._points.list)
      this._position.push(p.unquantize(this._points.params));

    this._tesselate();

    const vertIndex = VertexIndices.fromArray(this._vertIndex);
    const prevIndex = VertexIndices.fromArray(this._prevIndex);

    const nextIndexAndParam = new Uint8Array(this._numIndices * 4);
    for (let i = 0; i < this._numIndices; i++) {
      const index = this._nextIndex[i];
      const j = i * 4;
      VertexIndices.encodeIndex(index, nextIndexAndParam, j);
      nextIndexAndParam[j + 3] = this._nextParam[i] & 0x000000ff;
    }

    return {
      indices: vertIndex,
      prevIndices: prevIndex,
      nextIndicesAndParams: nextIndexAndParam,
    };
  }

  private _tesselate() {
    const v0 = new PolylineVertex(), v1 = new PolylineVertex();
    const maxJointDot = -0.7;

    for (const line of this._polylines) {
      if (line.numIndices < 2)
        continue;

      const last = line.numIndices - 1;
      const isClosed: boolean = line.vertIndices[0] === line.vertIndices[last];

      for (let i = 0; i < last; ++i) {
        const idx0 = line.vertIndices[i];
        const idx1 = line.vertIndices[i + 1];
        const isStart: boolean = (0 === i);
        const isEnd: boolean = (last - 1 === i);
        const prevIdx0 = isStart ? (isClosed ? line.vertIndices[last - 1] : idx0) : line.vertIndices[i - 1];
        const nextIdx1 = isEnd ? (isClosed ? line.vertIndices[1] : idx1) : line.vertIndices[i + 2];

        v0.init(true, isStart && !isClosed, idx0, prevIdx0, idx1);
        v1.init(false, isEnd && !isClosed, idx1, nextIdx1, idx0);

        const jointAt0: boolean = this._doJoints && (isClosed || !isStart) && this._dotProduct(v0) > maxJointDot;
        const jointAt1: boolean = this._doJoints && (isClosed || !isEnd) && this._dotProduct(v1) > maxJointDot;

        if (jointAt0 || jointAt1) {
          this._addVertex(v0, v0.computeParam(true, jointAt0, false, false));
          this._addVertex(v1, v1.computeParam(false, jointAt1, false, false));
          this._addVertex(v0, v0.computeParam(false, jointAt0, false, true));
          this._addVertex(v0, v0.computeParam(false, jointAt0, false, true));
          this._addVertex(v1, v1.computeParam(false, jointAt1, false, false));
          this._addVertex(v1, v1.computeParam(false, jointAt1, false, true));
          this._addVertex(v0, v0.computeParam(false, jointAt0, false, true));
          this._addVertex(v1, v1.computeParam(false, jointAt1, false, true));
          this._addVertex(v0, v0.computeParam(false, jointAt0, false, false));
          this._addVertex(v0, v0.computeParam(false, jointAt0, false, false));
          this._addVertex(v1, v1.computeParam(false, jointAt1, false, true));
          this._addVertex(v1, v1.computeParam(true, jointAt1, false, false));

          if (jointAt0)
            this.addJointTriangles(v0, v0.computeParam(false, true, false, true), v0);

          if (jointAt1)
            this.addJointTriangles(v1, v1.computeParam(false, true, false, true), v1);
        } else {
          this._addVertex(v0, v0.computeParam(true));
          this._addVertex(v1, v1.computeParam(false));
          this._addVertex(v0, v0.computeParam(false));
          this._addVertex(v0, v0.computeParam(false));
          this._addVertex(v1, v1.computeParam(false));
          this._addVertex(v1, v1.computeParam(true));
        }
      }
    }
  }

  private addJointTriangles(v0: PolylineVertex, p0: number, v1: PolylineVertex): void {
    const param = v1.computeParam(false, false, true);
    for (let i = 0; i < 3; i++) {
      this._addVertex(v0, p0);
      this._addVertex(v1, param + i + 1);
      this._addVertex(v1, param + i);
    }
  }

  private _dotProduct(v: PolylineVertex): number {
    const pos: Point3d = this._position[v.vertexIndex];
    const prevDir: Vector3d = Vector3d.createStartEnd(this._position[v.prevIndex], pos);
    const nextDir: Vector3d = Vector3d.createStartEnd(this._position[v.nextIndex], pos);
    return prevDir.dotProduct(nextDir);
  }

  private _addVertex(vertex: PolylineVertex, param: number): void {
    this._vertIndex[this._numIndices] = vertex.vertexIndex;
    this._prevIndex[this._numIndices] = vertex.prevIndex;
    this._nextIndex[this._numIndices] = vertex.nextIndex;
    this._nextParam[this._numIndices] = param;
    this._numIndices++;
  }
}

/** Strictly for tests. @internal */
export function tesselatePolyline(polylines: PolylineData[], points: QPoint3dList, doJointTriangles: boolean): TesselatedPolyline {
  const tesselator = new PolylineTesselator(polylines, points, doJointTriangles);
  return tesselator.tesselate();
}

/** @internal */
export enum SurfaceType {
  Unlit,
  Lit,
  Textured,
  TexturedLit,
  VolumeClassifier,
}

/** @internal */
export function isValidSurfaceType(value: number): boolean {
  switch (value) {
    case SurfaceType.Unlit:
    case SurfaceType.Lit:
    case SurfaceType.Textured:
    case SurfaceType.TexturedLit:
    case SurfaceType.VolumeClassifier:
      return true;
    default:
      return false;
  }
}

/** @internal */
export interface SurfaceRenderMaterial {
  readonly isAtlas: false;
  readonly material: RenderMaterial;
}

/** @internal */
export interface SurfaceMaterialAtlas {
  readonly isAtlas: true;
  // Overrides surface alpha to be translucent. Implies `overridesAlpha`.
  readonly hasTranslucency: boolean;
  // Overrides surface alpha to be opaque or translucent.
  readonly overridesAlpha: boolean;
  // offset past the END of the vertex data; equivalently, number of 32-bit colors in color table preceding material atlas.
  readonly vertexTableOffset: number;
  readonly numMaterials: number;
}

/** @internal */
export type SurfaceMaterial = SurfaceRenderMaterial | SurfaceMaterialAtlas;

/** @internal */
export function createSurfaceMaterial(source: RenderMaterial | undefined): SurfaceMaterial | undefined {
  if (undefined === source)
    return undefined;
  else
    return { isAtlas: false, material: source };
}

/** @internal */
export interface SurfaceParams {
  readonly type: SurfaceType;
  readonly indices: VertexIndices;
  readonly fillFlags: FillFlags;
  readonly hasBakedLighting: boolean;
  readonly hasFixedNormals: boolean;
  readonly textureMapping?: {
    texture: RenderTexture;
    alwaysDisplayed: boolean;
  };
  readonly material?: SurfaceMaterial;
}

/**
 * Describes a set of line segments representing edges of a mesh.
 * Each segment is expanded into a quad defined by two triangles.
 * The positions are adjusted in the shader to account for the edge width.
 * @internal
 */
export interface SegmentEdgeParams {
  /** The 24-bit indices of the tesselated line segment */
  readonly indices: VertexIndices;
  /**
   * For each 24-bit index, 4 bytes:
   * the 24-bit index of the vertex at the other end of the segment, followed by
   * an 8-bit 'quad index' in [0..3] indicating which point in the expanded quad the vertex represents.
   */
  readonly endPointAndQuadIndices: Uint8Array;
}

function convertPolylinesAndEdges(polylines?: PolylineData[], edges?: MeshEdge[]): SegmentEdgeParams | undefined {
  let numIndices = undefined !== edges ? edges.length : 0;
  if (undefined !== polylines)
    for (const pd of polylines)
      numIndices += (pd.vertIndices.length - 1);

  if (0 === numIndices)
    return undefined;

  numIndices *= 6;
  const indexBytes = new Uint8Array(numIndices * 3);
  const endPointAndQuadIndexBytes = new Uint8Array(numIndices * 4);

  let ndx: number = 0;
  let ndx2: number = 0;

  const addPoint = (p0: number, p1: number, quadIndex: number) => {
    VertexIndices.encodeIndex(p0, indexBytes, ndx);
    ndx += 3;
    VertexIndices.encodeIndex(p1, endPointAndQuadIndexBytes, ndx2);
    endPointAndQuadIndexBytes[ndx2 + 3] = quadIndex;
    ndx2 += 4;
  };

  if (undefined !== polylines) {
    for (const pd of polylines) {
      const num = pd.vertIndices.length - 1;
      for (let i = 0; i < num; ++i) {
        let p0 = pd.vertIndices[i];
        let p1 = pd.vertIndices[i + 1];
        if (p1 < p0) { // swap so that lower index is first.
          p0 = p1;
          p1 = pd.vertIndices[i];
        }
        addPoint(p0, p1, 0);
        addPoint(p1, p0, 2);
        addPoint(p0, p1, 1);
        addPoint(p0, p1, 1);
        addPoint(p1, p0, 2);
        addPoint(p1, p0, 3);
      }
    }
  }

  if (undefined !== edges) {
    for (const meshEdge of edges) {
      const p0 = meshEdge.indices[0];
      const p1 = meshEdge.indices[1];
      addPoint(p0, p1, 0);
      addPoint(p1, p0, 2);
      addPoint(p0, p1, 1);
      addPoint(p0, p1, 1);
      addPoint(p1, p0, 2);
      addPoint(p1, p0, 3);
    }
  }

  return {
    indices: new VertexIndices(indexBytes),
    endPointAndQuadIndices: endPointAndQuadIndexBytes,
  };
}

/**
 * A set of line segments representing edges of curved portions of a mesh.
 * Each vertex is augmented with a pair of oct-encoded normals used in the shader
 * to determine whether or not the edge should be displayed.
 * @internal
 */
export interface SilhouetteParams extends SegmentEdgeParams {
  /** Per index, 2 16-bit oct-encoded normals */
  readonly normalPairs: Uint8Array;
}

function convertSilhouettes(edges: MeshEdge[], normalPairs: OctEncodedNormalPair[]): SilhouetteParams | undefined {
  const base = convertPolylinesAndEdges(undefined, edges);
  if (undefined === base)
    return undefined;

  const normalPairBytes = new Uint8Array(normalPairs.length * 6 * 4);
  const normalPair16 = new Uint16Array(normalPairBytes.buffer);

  let ndx = 0;
  for (const pair of normalPairs) {
    for (let i = 0; i < 6; i++) {
      normalPair16[ndx++] = pair.first.value;
      normalPair16[ndx++] = pair.second.value;
    }
  }

  return {
    indices: base.indices,
    endPointAndQuadIndices: base.endPointAndQuadIndices,
    normalPairs: normalPairBytes,
  };
}

/** Describes the edges of a mesh. */
export interface EdgeParams {
  /** The edge width in pixels. */
  readonly weight: number;
  /** The line pattern in which edges are drawn. */
  readonly linePixels: LinePixels;
  /** Simple single-segment edges, always displayed when edge display is enabled. */
  readonly segments?: SegmentEdgeParams;
  /** Single-segment edges of curved surfaces, displayed based on edge normal relative to eye. */
  readonly silhouettes?: SilhouetteParams;
  /** Polyline edges, always displayed when edge display is enabled. */
  readonly polylines?: TesselatedPolyline;
}

function wantJointTriangles(weight: number, is2d: boolean): boolean {
  // Joints are incredibly expensive. In 3d, only generate them if the line is sufficiently wide for them to be noticeable.
  const jointWidthThreshold = 3;
  return is2d || weight >= jointWidthThreshold;
}

function convertEdges(meshArgs: MeshArgs): EdgeParams | undefined {
  const args = meshArgs.edges;
  if (undefined === args)
    return undefined;

  let polylines: TesselatedPolyline | undefined;
  let segments: SegmentEdgeParams | undefined;
  if (wantJointTriangles(args.width, meshArgs.is2d)) {
    segments = convertPolylinesAndEdges(args.polylines.lines, args.edges.edges);
  } else {
    segments = convertPolylinesAndEdges(undefined, args.edges.edges);
    const tesselator = PolylineTesselator.fromMesh(meshArgs);
    if (undefined !== tesselator)
      polylines = tesselator.tesselate();
  }

  // ###TODO: why the heck are the edges and normals of SilhouetteEdgeArgs potentially undefined???
  const silhouettes = undefined !== args.silhouettes.edges && undefined !== args.silhouettes.normals ? convertSilhouettes(args.silhouettes.edges, args.silhouettes.normals) : undefined;
  if (undefined === segments && undefined === silhouettes && undefined === polylines)
    return undefined;

  return {
    weight: args.width,
    linePixels: args.linePixels,
    segments,
    silhouettes,
    polylines,
  };
}

/**
 * Describes mesh geometry to be submitted to the rendering system.
 * A mesh consists of a surface and its edges, which may include any combination of silhouettes, polylines, and single segments.
 * The surface and edges all refer to the same vertex table.
 */
export class MeshParams {
  public readonly vertices: VertexTable;
  public readonly surface: SurfaceParams;
  public readonly edges?: EdgeParams;
  public readonly isPlanar: boolean;
  public readonly auxChannels?: AuxChannelTable;

  /** Directly construct a MeshParams. The MeshParams takes ownership of all input data. */
  public constructor(vertices: VertexTable, surface: SurfaceParams, edges?: EdgeParams, isPlanar?: boolean, auxChannels?: AuxChannelTable) {
    this.vertices = vertices;
    this.surface = surface;
    this.edges = edges;
    this.isPlanar = !!isPlanar;
    this.auxChannels = auxChannels;
  }

  /** Construct from a MeshArgs. */
  public static create(args: MeshArgs): MeshParams {
    const builder = MeshBuilder.create(args);
    const vertices = VertexTable.buildFrom(builder, args.colors, args.features);

    const surfaceIndices = VertexIndices.fromArray(args.vertIndices!);

    const surface: SurfaceParams = {
      type: builder.type,
      indices: surfaceIndices,
      fillFlags: args.fillFlags,
      hasBakedLighting: args.hasBakedLighting,
      hasFixedNormals: args.hasFixedNormals,
      textureMapping: undefined !== args.texture ? { texture: args.texture, alwaysDisplayed: false } : undefined,
      material: createSurfaceMaterial(args.material),
    };

    const channels = undefined !== args.auxChannels ? AuxChannelTable.fromChannels(args.auxChannels, vertices.numVertices) : undefined;
    const edges = convertEdges(args);
    return new MeshParams(vertices, surface, edges, args.isPlanar, channels);
  }
}

/**
 * Describes a set of tesselated polylines.
 * Each segment of each polyline is triangulated into a quad. Additional triangles may be inserted
 * between segments to enable rounded corners.
 */
export class PolylineParams {
  public readonly vertices: VertexTable;
  public readonly polyline: TesselatedPolyline;
  public readonly isPlanar: boolean;
  public readonly type: PolylineTypeFlags;
  public readonly weight: number;
  public readonly linePixels: LinePixels;

  /** Directly construct a PolylineParams. The PolylineParams takes ownership of all input data. */
  public constructor(vertices: VertexTable, polyline: TesselatedPolyline, weight: number, linePixels: LinePixels, isPlanar: boolean, type: PolylineTypeFlags = PolylineTypeFlags.Normal) {
    this.vertices = vertices;
    this.polyline = polyline;
    this.isPlanar = isPlanar;
    this.weight = weight;
    this.linePixels = linePixels;
    this.type = type;
  }

  /** Construct from an PolylineArgs. */
  public static create(args: PolylineArgs): PolylineParams | undefined {
    assert(!args.flags.isDisjoint);
    const vertices = VertexTable.createForPolylines(args);
    if (undefined === vertices)
      return undefined;

    const tesselator = PolylineTesselator.fromPolyline(args);
    if (undefined === tesselator)
      return undefined;

    return new PolylineParams(vertices, tesselator.tesselate(), args.width, args.linePixels, args.flags.isPlanar, args.flags.type);
  }
}

/** Builds a VertexTable from some data type supplying the vertex data. */
export abstract class VertexTableBuilder {
  public data?: Uint8Array;
  private _curIndex: number = 0;

  public abstract get numVertices(): number;
  public abstract get numRgbaPerVertex(): number;
  public abstract get qparams(): QParams3d;
  public get uvParams(): QParams2d | undefined { return undefined; }
  public abstract appendVertex(vertIndex: number): void;

  public appendColorTable(colorIndex: ColorIndex) {
    if (undefined !== colorIndex.nonUniform) {
      for (const color of colorIndex.nonUniform.colors) {
        this.appendColor(color);
      }
    }
  }

  protected advance(nBytes: number) {
    this._curIndex += nBytes;
    assert(this._curIndex <= this.data!.length);
  }

  protected append8(val: number) {
    assert(0 <= val);
    assert(val <= 0xff);
    assert(val === Math.floor(val));

    this.data![this._curIndex] = val;
    this.advance(1);
  }
  protected append16(val: number) {
    this.append8(val & 0x00ff);
    this.append8(val >>> 8);
  }
  protected append32(val: number) {
    this.append16(val & 0x0000ffff);
    this.append16(val >>> 16);
  }

  private appendColor(tbgr: number) {
    const colors = ColorDef.getColors(tbgr);

    // invert transparency => alpha
    colors.t = 255 - colors.t;

    // premultiply alpha...
    switch (colors.t) {
      case 0:
        colors.r = colors.g = colors.b = 0;
        break;
      case 255:
        break;
      default: {
        const f = colors.t / 255.0;
        colors.r = Math.floor(colors.r * f + 0.5);
        colors.g = Math.floor(colors.g * f + 0.5);
        colors.b = Math.floor(colors.b * f + 0.5);
        break;
      }
    }

    // Store 32-bit value in little-endian order (red first)
    this.append8(colors.r);
    this.append8(colors.g);
    this.append8(colors.b);
    this.append8(colors.t);
  }
}

type SimpleVertexData = PolylineArgs | MeshArgs;

/**
 * Supplies vertex data from a PolylineArgs or MeshArgs. Each vertex consists of 12 bytes:
 *  pos.x           00
 *  pos.y           02
 *  pos.z           04
 *  colorIndex      06
 *  featureIndex    08
 */
class SimpleBuilder<T extends SimpleVertexData> extends VertexTableBuilder {
  public args: T;

  public constructor(args: T) {
    super();
    this.args = args;
    assert(undefined !== this.args.points);
  }

  public get numVertices() { return this.args.points!.length; }
  public get numRgbaPerVertex() { return 3; }
  public get qparams() { return this.args.points!.params; }

  public appendVertex(vertIndex: number): void {
    this.appendPosition(vertIndex);
    this.appendColorIndex(vertIndex);
    this.appendFeatureIndex(vertIndex);
  }

  protected appendPosition(vertIndex: number) {
    const points = this.args.points!;
    this.append16(points.list[vertIndex].x);
    this.append16(points.list[vertIndex].y);
    this.append16(points.list[vertIndex].z);
  }

  protected appendColorIndex(vertIndex: number) {
    if (undefined !== this.args.colors.nonUniform) {
      this.append16(this.args.colors.nonUniform.indices[vertIndex]);
    } else {
      this.advance(2);
    }
  }

  protected appendFeatureIndex(vertIndex: number) {
    if (undefined !== this.args.features.featureIDs) {
      this.append32(this.args.features.featureIDs[vertIndex]);
    } else {
      this.advance(4);
    }
  }
}

/** Supplies vertex data from a MeshArgs. */
class MeshBuilder extends SimpleBuilder<MeshArgs> {
  public readonly type: SurfaceType;

  protected constructor(args: MeshArgs, type: SurfaceType) {
    super(args);
    this.type = type;
  }

  public static create(args: MeshArgs): MeshBuilder {
    if (args.isVolumeClassifier)
      return new MeshBuilder(args, SurfaceType.VolumeClassifier);

    const isLit = undefined !== args.normals && 0 < args.normals.length;
    const isTextured = undefined !== args.texture;

    let uvParams: QParams2d | undefined;

    if (isTextured) {
      const uvRange = Range2d.createNull();
      const fpts = args.textureUv;
      const pt2d = new Point2d();
      if (undefined !== fpts && fpts.length > 0)
        for (let i = 0; i < args.points!.length; i++)
          uvRange.extendPoint(Point2d.create(fpts[i].x, fpts[i].y, pt2d));

      uvParams = QParams2d.fromRange(uvRange);
    }

    if (isLit)
      return isTextured ? new TexturedLitMeshBuilder(args, uvParams!) : new LitMeshBuilder(args);
    else
      return isTextured ? new TexturedMeshBuilder(args, uvParams!) : new MeshBuilder(args, SurfaceType.Unlit);
  }
}

/** Supplies vertex data from a MeshArgs where each vertex consists of 16 bytes.
 * In addition to the SimpleBuilder data, the final 4 bytes hold the quantized UV params
 * The color index is left uninitialized as it is unused.
 */
class TexturedMeshBuilder extends MeshBuilder {
  private _qparams: QParams2d;
  private _qpoint = new QPoint2d();

  public constructor(args: MeshArgs, qparams: QParams2d, type: SurfaceType = SurfaceType.Textured) {
    super(args, type);
    this._qparams = qparams;
    assert(undefined !== args.textureUv);
  }

  public override get numRgbaPerVertex() { return 4; }
  public override get uvParams() { return this._qparams; }

  public override appendVertex(vertIndex: number) {
    this.appendPosition(vertIndex);
    this.appendNormal(vertIndex);
    this.appendFeatureIndex(vertIndex);
    this.appendUVParams(vertIndex);
  }

  protected appendNormal(_vertIndex: number): void { this.advance(2); } // no normal for unlit meshes

  protected appendUVParams(vertIndex: number) {
    this._qpoint.init(this.args.textureUv![vertIndex], this._qparams);
    this.append16(this._qpoint.x);
    this.append16(this._qpoint.y);
  }
}

/** As with TexturedMeshBuilder, but the color index is replaced with the oct-encoded normal value. */
class TexturedLitMeshBuilder extends TexturedMeshBuilder {
  public constructor(args: MeshArgs, qparams: QParams2d) {
    super(args, qparams, SurfaceType.TexturedLit);
    assert(undefined !== args.normals);
  }

  protected override appendNormal(vertIndex: number) { this.append16(this.args.normals![vertIndex].value); }
}

/** 16 bytes. The last 2 bytes are unused; the 2 immediately preceding it hold the oct-encoded normal value. */
class LitMeshBuilder extends MeshBuilder {
  public constructor(args: MeshArgs) {
    super(args, SurfaceType.Lit);
    assert(undefined !== args.normals);
  }

  public override get numRgbaPerVertex() { return 4; }

  public override appendVertex(vertIndex: number) {
    super.appendVertex(vertIndex);
    this.append16(this.args.normals![vertIndex].value);
    this.advance(2); // 2 unused bytes
  }
}
