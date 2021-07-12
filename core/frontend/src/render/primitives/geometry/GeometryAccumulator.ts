/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { assert } from "@bentley/bentleyjs-core";
import { IndexedPolyface, Loop, Path, Point3d, Range3d, SolidPrimitive, Transform } from "@bentley/geometry-core";
import { AnalysisStyleDisplacement } from "@bentley/imodeljs-common";
import { IModelConnection } from "../../../IModelConnection";
import { GraphicBranch } from "../../GraphicBranch";
import { RenderGraphic } from "../../RenderGraphic";
import { RenderSystem } from "../../RenderSystem";
import { DisplayParams } from "../DisplayParams";
import { MeshBuilderMap } from "../mesh/MeshBuilderMap";
import { MeshGraphicArgs, MeshList } from "../mesh/MeshPrimitives";
import { GeometryOptions } from "../Primitives";
import { GeometryList } from "./GeometryList";
import { Geometry, PrimitiveGeometryType } from "./GeometryPrimitives";
import { IModelApp } from "../../../IModelApp";

/** @internal */
export class GeometryAccumulator {
  private _transform: Transform;
  private _surfacesOnly: boolean;
  private readonly _analysisDisplacement?: AnalysisStyleDisplacement;

  public readonly tileRange: Range3d;
  public readonly geometries: GeometryList = new GeometryList();
  public readonly iModel: IModelConnection;
  public readonly system: RenderSystem;

  public get surfacesOnly(): boolean { return this._surfacesOnly; }
  public get transform(): Transform { return this._transform; }
  public get isEmpty(): boolean { return this.geometries.isEmpty; }
  public get haveTransform(): boolean { return !this._transform.isIdentity; }

  public constructor(options: {
    iModel: IModelConnection;
    system?: RenderSystem;
    surfacesOnly?: boolean;
    transform?: Transform;
    tileRange?: Range3d;
    analysisStyleDisplacement?: AnalysisStyleDisplacement;
  }) {
    this.iModel = options.iModel;
    this.system = options.system ?? IModelApp.renderSystem;
    this.tileRange = options.tileRange ?? Range3d.createNull();
    this._surfacesOnly = true === options.surfacesOnly;
    this._transform = options.transform ?? Transform.createIdentity();
    this._analysisDisplacement = options.analysisStyleDisplacement;
  }

  private getPrimitiveRange(geom: PrimitiveGeometryType): Range3d | undefined {
    const range = new Range3d();
    geom.range(undefined, range);
    return range.isNull ? undefined : range;
  }

  private calculateTransform(transform: Transform, range: Range3d): void {
    if (this.haveTransform) this._transform.multiplyTransformTransform(transform, transform);
    transform.multiplyRange(range, range);
  }

  public addLoop(loop: Loop, displayParams: DisplayParams, transform: Transform, disjoint: boolean): boolean {
    const range = this.getPrimitiveRange(loop);
    if (!range)
      return false;

    this.calculateTransform(transform, range);
    return this.addGeometry(Geometry.createFromLoop(loop, transform, range, displayParams, disjoint));
  }

  public addLineString(pts: Point3d[], displayParams: DisplayParams, transform: Transform): boolean {
    // Do this.getPrimitiveRange() manually, so there is no need to create a PointString3d object just to find the range
    const range = Range3d.createNull();
    range.extendArray(pts, undefined);
    if (range.isNull)
      return false;

    this.calculateTransform(transform, range);
    return this.addGeometry(Geometry.createFromLineString(pts, transform, range, displayParams));
  }

  public addPointString(pts: Point3d[], displayParams: DisplayParams, transform: Transform): boolean {
    // Do this.getPrimitiveRange() manually, so there is no need to create a PointString3d object just to find the range
    const range = Range3d.createNull();
    range.extendArray(pts, undefined);
    if (range.isNull)
      return false;

    this.calculateTransform(transform, range);
    return this.addGeometry(Geometry.createFromPointString(pts, transform, range, displayParams));
  }

  public addPath(path: Path, displayParams: DisplayParams, transform: Transform, disjoint: boolean): boolean {
    const range = this.getPrimitiveRange(path);
    if (!range)
      return false;

    this.calculateTransform(transform, range);
    return this.addGeometry(Geometry.createFromPath(path, transform, range, displayParams, disjoint));
  }

  public addPolyface(pf: IndexedPolyface, displayParams: DisplayParams, transform: Transform): boolean {
    // Adjust the mesh range based on displacements applied to vertices by analysis style, if applicable.
    let range;
    if (this._analysisDisplacement) {
      const channel = pf.data.auxData?.channels.find((x) => x.name === this._analysisDisplacement!.channelName);
      const displacementRange = channel?.computeDisplacementRange(this._analysisDisplacement.scale);
      if (displacementRange && !displacementRange.isNull) {
        range = Range3d.createNull();
        const pt = new Point3d();
        for (let i = 0; i < pf.data.point.length; i++) {
          pf.data.point.getPoint3dAtUncheckedPointIndex(i, pt);
          range.extendXYZ(pt.x + displacementRange.low.x, pt.y + displacementRange.low.y, pt.z + displacementRange.low.z);
          range.extendXYZ(pt.x + displacementRange.high.x, pt.y + displacementRange.high.y, pt.z + displacementRange.high.z);
        }
      }
    }

    if (!range && !(range = this.getPrimitiveRange(pf)))
      return false;

    this.calculateTransform(transform, range);
    return this.addGeometry(Geometry.createFromPolyface(pf, transform, range, displayParams));
  }

  public addSolidPrimitive(primitive: SolidPrimitive, displayParams: DisplayParams, transform: Transform): boolean {
    const range = this.getPrimitiveRange(primitive);
    if (!range)
      return false;

    this.calculateTransform(transform, range);
    return this.addGeometry(Geometry.createFromSolidPrimitive(primitive, transform, range, displayParams));
  }

  public addGeometry(geom: Geometry): boolean { this.geometries.push(geom); return true; }

  public clear(): void { this.geometries.clear(); }

  public reset(transform: Transform = Transform.createIdentity(), surfacesOnly: boolean = false) {
    this.clear();
    this._transform = transform;
    this._surfacesOnly = surfacesOnly;
  }

  /**
   * Generates a MeshBuilderMap
   * native: GeometryAccumulator::ToMeshBuilderMap(GeometryOptionsCR options, double tolerance, FeatureTableP featureTable, ViewContextR context) const
   * note  : removed featureTable, ViewContext
   * @param tolerance should derive from Viewport.getPixelSizeAtPoint
   */
  public toMeshBuilderMap(options: GeometryOptions, tolerance: number, pickableId?: string): MeshBuilderMap {
    const { geometries } = this; // declare internal dependencies

    const range = geometries.computeRange();
    const is2d = !range.isNull && range.isAlmostZeroZ;

    return MeshBuilderMap.createFromGeometries(geometries, tolerance, range, is2d, options, pickableId);
  }

  public toMeshes(options: GeometryOptions, tolerance: number, pickableId?: string): MeshList {
    if (this.geometries.isEmpty)
      return new MeshList();

    const builderMap = this.toMeshBuilderMap(options, tolerance, pickableId);
    return builderMap.toMeshes();
  }

  /**
   * Populate a list of Graphic objects from the accumulated Geometry objects.
   * removed ViewContext
   */
  public saveToGraphicList(graphics: RenderGraphic[], options: GeometryOptions, tolerance: number, pickableId?: string): MeshList | undefined {
    const meshes = this.toMeshes(options, tolerance, pickableId);
    if (0 === meshes.length)
      return undefined;

    const args = new MeshGraphicArgs();

    // All of the meshes are quantized to the same range.
    // If that range is small relative to the distance from the origin, quantization errors can produce display artifacts.
    // Remove the translation from the quantization parameters and apply it in the transform instead.
    const branch = new GraphicBranch(true);
    const qorigin = new Point3d();

    for (const mesh of meshes) {
      const verts = mesh.points;
      if (branch.isEmpty) {
        qorigin.setFrom(verts.params.origin);
      } else {
        assert(verts.params.origin.isAlmostEqual(qorigin));
      }

      verts.params.origin.setZero();

      const graphic = mesh.getGraphics(args, this.system);
      if (undefined !== graphic)
        branch.add(graphic);
    }

    if (!branch.isEmpty) {
      const transform = Transform.createTranslationXYZ(qorigin.x, qorigin.y, qorigin.z);
      graphics.push(this.system.createBranch(branch, transform));
    }

    return meshes;
  }
}
