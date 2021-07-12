/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import {
  Arc3d, CurvePrimitive, IndexedPolyface, LineSegment3d, LineString3d, Loop, Path, Point2d, Point3d, Polyface, Range3d, SolidPrimitive, Transform,
} from "@bentley/geometry-core";
import { FeatureTable, Gradient, GraphicParams, PackedFeatureTable, RenderTexture } from "@bentley/imodeljs-common";
import { GraphicBuilder, GraphicBuilderOptions } from "../../GraphicBuilder";
import { RenderGraphic } from "../../RenderGraphic";
import { RenderSystem } from "../../RenderSystem";
import { DisplayParams } from "../DisplayParams";
import { GeometryOptions } from "../Primitives";
import { GeometryAccumulator } from "./GeometryAccumulator";
import { Geometry } from "./GeometryPrimitives";
import { MeshList } from "../mesh/MeshPrimitives";

function copy2dTo3d(pts2d: Point2d[], depth: number): Point3d[] {
  const pts3d: Point3d[] = [];
  for (const point of pts2d)
    pts3d.push(Point3d.create(point.x, point.y, depth));
  return pts3d;
}

/** @internal */
export abstract class GeometryListBuilder extends GraphicBuilder {
  public accum: GeometryAccumulator;
  public readonly graphicParams: GraphicParams = new GraphicParams();

  public abstract finishGraphic(accum: GeometryAccumulator): RenderGraphic; // Invoked by Finish() to obtain the finished RenderGraphic.

  public constructor(system: RenderSystem, options: GraphicBuilderOptions, accumulatorTransform = Transform.identity) {
    super(options);
    this.accum = new GeometryAccumulator({
      iModel: this.iModel,
      system,
      transform: accumulatorTransform,
      analysisStyleDisplacement: options.viewport.displayStyle.settings.analysisStyle?.displacement,
    });
  }

  public finish(): RenderGraphic {
    const graphic = this.finishGraphic(this.accum);
    this.accum.clear();
    return graphic;
  }

  public activateGraphicParams(graphicParams: GraphicParams): void {
    graphicParams.clone(this.graphicParams);
  }

  public addArc2d(ellipse: Arc3d, isEllipse: boolean, filled: boolean, zDepth: number): void {
    if (0.0 === zDepth) {
      this.addArc(ellipse, isEllipse, filled);
    } else {
      const ell: Arc3d = ellipse;
      ell.center.z = zDepth;
      this.addArc(ell, isEllipse, filled);
    }
  }

  public addArc(ellipse: Arc3d, isEllipse: boolean, filled: boolean): void {
    let curve;
    if (isEllipse || filled) {
      curve = Loop.create(ellipse);
    } else {
      curve = Path.create(ellipse);
    }

    if (filled && !isEllipse && !ellipse.sweep.isFullCircle) {
      const gapSegment: CurvePrimitive = LineSegment3d.create(ellipse.startPoint(), ellipse.endPoint());
      (gapSegment as any).markerBits = 0x00010000; // Set the CURVE_PRIMITIVE_BIT_GapCurve marker bit
      curve.children.push(gapSegment);
    }
    const displayParams = curve.isAnyRegionType ? this.getMeshDisplayParams() : this.getLinearDisplayParams();
    if (curve instanceof Loop)
      this.accum.addLoop(curve, displayParams, this.placement, false);
    else
      this.accum.addPath(curve, displayParams, this.placement, false);
  }

  /** take ownership of input points and add as a line string to this builder */
  public addLineString(points: Point3d[]): void {
    if (2 === points.length && points[0].isAlmostEqual(points[1]))
      this.accum.addPointString(points, this.getLinearDisplayParams(), this.placement);
    else
      this.accum.addLineString(points, this.getLinearDisplayParams(), this.placement);
  }

  public addLineString2d(points: Point2d[], zDepth: number): void {
    const pts3d = copy2dTo3d(points, zDepth);
    this.addLineString(pts3d);
  }

  /** take ownership of input points and add as a point string to this builder */
  public addPointString(points: Point3d[]): void {
    this.accum.addPointString(points, this.getLinearDisplayParams(), this.placement);
  }

  public addPointString2d(points: Point2d[], zDepth: number): void {
    const pts3d = copy2dTo3d(points, zDepth);
    this.addPointString(pts3d);
  }

  public addShape(points: Point3d[]): void {
    const loop = Loop.create(LineString3d.create(points));
    this.accum.addLoop(loop, this.getMeshDisplayParams(), this.placement, false);
  }

  public addShape2d(points: Point2d[], zDepth: number): void {
    const pts3d = copy2dTo3d(points, zDepth);
    this.addShape(pts3d);
  }

  public addPath(path: Path): void {
    this.accum.addPath(path, this.getLinearDisplayParams(), this.placement, false);
  }

  public addLoop(loop: Loop): void {
    this.accum.addLoop(loop, this.getMeshDisplayParams(), this.placement, false);
  }

  public addPolyface(meshData: Polyface): void {
    this.accum.addPolyface(meshData as IndexedPolyface, this.getMeshDisplayParams(), this.placement);
  }

  public addSolidPrimitive(primitive: SolidPrimitive): void {
    this.accum.addSolidPrimitive(primitive, this.getMeshDisplayParams(), this.placement);
  }

  public abstract reset(): void;

  public getGraphicParams(): GraphicParams { return this.graphicParams; }

  public getDisplayParams(type: DisplayParams.Type): DisplayParams { return DisplayParams.createForType(type, this.graphicParams); }
  public getMeshDisplayParams(): DisplayParams { return DisplayParams.createForMesh(this.graphicParams, !this.wantNormals, (grad) => this.resolveGradient(grad)); }
  public getLinearDisplayParams(): DisplayParams { return DisplayParams.createForLinear(this.graphicParams); }
  public get textDisplayParams(): DisplayParams { return DisplayParams.createForText(this.graphicParams); }

  public get system(): RenderSystem { return this.accum.system; }

  public add(geom: Geometry): void { this.accum.addGeometry(geom); }

  public reInitialize(localToWorld: Transform, accumTf: Transform = Transform.createIdentity()) {
    this.accum.reset(accumTf);
    this.activateGraphicParams(this.graphicParams);
    this.placement = localToWorld;
    this.reset();
  }

  private resolveGradient(gradient: Gradient.Symb): RenderTexture | undefined {
    return this.system.getGradientTexture(gradient, this.iModel);
  }
}

// Set to true to add a range box to every graphic produced by PrimitiveBuilder.
let addDebugRangeBox = false;

/** @internal */
export class PrimitiveBuilder extends GeometryListBuilder {
  public primitives: RenderGraphic[] = [];

  public finishGraphic(accum: GeometryAccumulator): RenderGraphic {
    let meshes: MeshList | undefined;
    let range: Range3d | undefined;
    let featureTable: FeatureTable | undefined;
    if (!accum.isEmpty) {
      // Overlay decorations don't test Z. Tools like to layer multiple primitives on top of one another; they rely on the primitives rendering
      // in that same order to produce correct results (e.g., a thin line rendered atop a thick line of another color).
      // No point generating edges for graphics that are always rendered in smooth shade mode.
      const options = GeometryOptions.createForGraphicBuilder(this);
      const tolerance = this.computeTolerance(accum);
      meshes = accum.saveToGraphicList(this.primitives, options, tolerance, this.pickId);
      if (undefined !== meshes) {
        featureTable = meshes.features;
        range = meshes.range;
      }
    }

    let graphic = (this.primitives.length !== 1) ? this.accum.system.createGraphicList(this.primitives) : this.primitives.pop() as RenderGraphic;
    if (undefined !== featureTable) {
      const batchRange = range ?? new Range3d();
      const batchOptions = this._options.pickable;
      graphic = this.accum.system.createBatch(graphic, PackedFeatureTable.pack(featureTable), batchRange, batchOptions);
    }

    if (addDebugRangeBox && range) {
      addDebugRangeBox = false;
      const builder = this.accum.system.createGraphic({ ...this._options });
      builder.addRangeBox(range);
      graphic = this.accum.system.createGraphicList([graphic, builder.finish()]);
      addDebugRangeBox = true;
    }

    return graphic;
  }

  public computeTolerance(accum: GeometryAccumulator): number {
    let pixelSize = 1.0;
    if (!this.isViewCoordinates) {
      // Compute the horizontal distance in meters between two adjacent pixels at the center of the geometry.
      const range = accum.geometries.computeRange();
      const pt = range.low.interpolate(0.5, range.high);
      pixelSize = this.viewport.getPixelSizeAtPoint(pt);
      pixelSize = this.viewport.target.adjustPixelSizeForLOD(pixelSize);

      if (this.applyAspectRatioSkew) {
        // Aspect ratio skew > 1.0 stretches the view in Y. In that case use the smaller vertical pixel distance for our stroke tolerance.
        const skew = this.viewport.view.getAspectRatioSkew();
        if (skew > 1)
          pixelSize /= skew;
      }
    }

    const toleranceMult = 0.25;
    return pixelSize * toleranceMult;
  }

  public reset(): void { this.primitives = []; }
}
