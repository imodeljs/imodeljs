/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Rendering
 */

import { Id64String } from "@bentley/bentleyjs-core";
import {
  AnyCurvePrimitive, Arc3d, Loop, Path, Point2d, Point3d, Polyface, Range3d, SolidPrimitive, Transform,
} from "@bentley/geometry-core";
import { ColorDef, Frustum, GraphicParams, LinePixels, Npc } from "@bentley/imodeljs-common";
import { IModelConnection } from "../IModelConnection";
import { Viewport } from "../Viewport";
import { RenderGraphic } from "./RenderGraphic";
import { GraphicPrimitive } from "./GraphicPrimitive";

/**
 * Describes the type of a [[GraphicBuilder]], which defines the coordinate system in which the builder's geometry is defined and
 * controls the behavior of the [[RenderGraphic]] produced by the builder.
 * @note For those types for which depth-testing is disabled, the order in which the individual geometric primitives are drawn determines which geometry draws on top of other geometry.
 *  - Within a [[GraphicList]], each [[RenderGraphic]] is rendered in the order in which it appears in the list; and
 *  - Within a single [[RenderGraphic]], each geometric primitive is rendered in the ordered in which it was added to the GraphicBuilder.
 * @public
 */
export enum GraphicType {
  /**
   * Renders behind all other graphics. For example, the border of a [[SheetViewState]] is of this type.
   * Coordinates: [[CoordSystem.View]].
   * [[RenderMode]]: [[RenderMode.SmoothShade]].
   * Lighting: none.
   * Depth-testing: disabled.
   * @see [[Decorations.viewBackground]]
   */
  ViewBackground,
  /** Used for the scene itself, dynamics, and 'normal' decorations. */
  /**
   * Renders as if it were part of the scene. All of the [[ViewFlags]] applied to the view's normal geometry also applies to these types of decorations.
   * Coordinates: [[CoordSystem.World]].
   * Lighting and [[RenderMode]]: from view.
   * Depth-testing: enabled.
   * @see [[Decorations.normal]].
   */
  Scene,
  /** Renders within the scene. Coordinates: world. RenderMode: smooth. Lighting: default. Z-testing: enabled */
  /** Renders within the scene, but ignores the view's [[ViewFlags]].
   * Coordinates: [[CoordSystem.World]].
   * Lighting: default.
   * [[RenderMode]]: [[RenderMode.SmoothShade]].
   * Depth-testing: enabled.
   * @see [[Decorations.world]].
   */
  WorldDecoration,
  /**
   * Renders as an overlay on top of the scene. These decorations differ from [[GraphicType.WorldDecoration]] only in that depth-testing is disabled.
   * For example, the ACS triad and [[WindowAreaTool]] decorations are of this type.
   * Coordinates: [[CoordSystem.World]].
   * [[RenderMode]]: [[RenderMode.SmoothShade]]
   * Lighting: default.
   * Depth-testing: disabled.
   * Renders atop the scene. Coordinates: world. RenderMode: smooth. Lighting: none. Z-testing: disabled
   * @note Overlay decorations typically employ some degree of transparency to ensure that they do not fully obscure the scene.
   * @see [[Decorations.worldOverlay]]
   */
  WorldOverlay,
  /**
   * Renders as an overlay on top of the scene. These decorations differ from [[GraphicType.WorldOverlay]] only in that their geometry is defined in view coordinates rather than world.
   * Coordinates: [[CoordSystem.View]].
   * [[RenderMode]]: [[RenderMode.SmoothShade]]
   * Lighting: default.
   * Depth-testing: disabled.
   * @note For more flexibility in defining view overlay decorations, consider using a [[CanvasDecorationList]].
   * @see [[Decorations.viewOverlay]]
   */
  ViewOverlay,
}

/** Options used when constructing a `Batch` - that is, a [[RenderGraphic]] with an associated [FeatureTable]($common) describing individual [Feature]($common)s within the
 * graphic. Individual features can be resymbolized in a variety of ways including flashing and hiliting.
 * For example, to prevent graphics produced by [[readElementGraphics]] from being hilited when their corresponding element is in the [[SelectionSet]],
 * pass `{ noHilite: true }` to [[readElementGraphics]].
 * @public
 */
export interface BatchOptions {
  /** Identifies the [[Tile]] associated with the batch, chiefly for debugging purposes.
   * @beta
   */
  tileId?: string;
  /** If true, features within the batch will not be flashed on mouseover. */
  noFlash?: boolean;
  /** If true, features within the batch will not be hilited when their corresponding element is in the [[SelectionSet]]. */
  noHilite?: boolean;
  /** If true, features within the batch will not be emphasized when the corresponding [[Feature]] is emphasized using [FeatureOverrides]($common). */
  noEmphasis?: boolean;
  /** If true, the contents of the batch will only be drawn by [[Viewport.readPixels]], not [[Viewport.renderFrame]], causing them to be locatable but invisible. */
  locateOnly?: boolean;
}

/** Options used as part of [[GraphicBuilderOptions]] to describe a pickable [[RenderGraphic]].
 * @public
 */
export interface PickableGraphicOptions extends BatchOptions {
  /** Unique identifier for the graphic.
   * @see [[IModelConnection.transientIds]] to obtain a unique Id in the context of an iModel.
   */
  id: Id64String;
}

/** Options for creating a [[GraphicBuilder]] used by functions like [[DecorateContext.createGraphic]] and [[RenderSystem.createGraphic]].
 * @public
 */
export interface GraphicBuilderOptions {
  /** The viewport in which the resultant [[RenderGraphic]] is to be drawn, used for calculating the graphic's level of detail. */
  viewport: Viewport;

  /** The type of graphic to produce. */
  type: GraphicType;

  /** The local-to-world transform in which the builder's geometry is to be defined - by default, an identity transform. */
  placement?: Transform;

  /** If the graphic is to be pickable, specifies the pickable Id and other options. */
  pickable?: PickableGraphicOptions;

  /** If true, the order in which geometry is added to the builder is preserved.
   * This is useful for overlay and background graphics because they draw without using the depth buffer. For example, to draw an overlay containing a red shape with a white outline,
   * you would add the shape to the GraphicBuilder first, followed by the outline, to ensure the outline draws "in front of" the shape.
   * It defaults to true for overlays and background graphics, and false for other graphic types.
   * It is not useful for other types of graphics and imposes a performance penalty due to increased number of draw calls.
   * For overlay and background graphics that do not need to draw in any particular order, the performance penalty can be eliminated by setting this to `false`.
   */
  preserveOrder?: boolean;

  /** If true, [[ViewState.getAspectRatioSkew]] will be taken into account when computing the level of detail for the produced graphics. */
  applyAspectRatioSkew?: boolean;

  /** Controls whether normals are generated for surfaces. Normals allow 3d geometry to receive lighting; without them the geometry will be unaffected by lighting.
   * By default, normals are generated only for graphics of type [[GraphicType.Scene]]; or for any type of graphic if [[GraphicBuilder.wantEdges]] is true, because
   * normals are required to prevent z-fighting between surfaces and their edges. This default can be overridden by explicitly specifying `true` or `false`.
   * @see [[GraphicType]] for a description of whether and how different types of graphics are affected by lighting.
   */
  wantNormals?: boolean;

  /** Controls whether edges are generated for surfaces.
   * Edges are only displayed if [ViewFlags.renderMode]($common) is not [RenderMode.SmoothShade]($common) or [ViewFlags.visibleEdges]($common) is `true`.
   * Since all decoration graphics except [[GraphicType.Scene]] are drawn in smooth shaded mode with no visible edges, by default edges are only produced for scene graphics, and
   * only if [ViewFlags.edgesRequired]($common) is true for the [[viewport]].
   * That default can be overridden by explicitly specifying `true` or `false`. This can be useful for non-scene decorations contained in a [[GraphicBranch]] that applies [ViewFlagOverrides]($common)
   * that change the edge display settings; or for scene decorations that might be cached for reuse after the viewport's edge settings are changed.
   * @note Edges will tend to z-fight with their surfaces unless the graphic is [[pickable]].
   */
  generateEdges?: boolean;
}

/** @internal */
export type BuilderOptions = GraphicBuilderOptions & { placement: Transform };

/** Provides methods for constructing a [[RenderGraphic]] from geometric primitives.
 * GraphicBuilder is primarily used for creating [[Decorations]] to be displayed inside a [[Viewport]].
 *
 * The typical process for constructing a [[RenderGraphic]] proceeds as follows:
 *  1. Use [[DecorateContext.createGraphic]] or [[RenderSystem.createGraphic]] to obtain a builder.
 *  2. Set up the symbology using [[GraphicBuilder.activateGraphicParams]] or [[GraphicBuilder.setSymbology]].
 *  3. Add one or more geometric primitives using methods like [[GraphicBuilder.addShape]] and [[GraphicBuilder.addLineString]], possibly setting new symbology in between.
 *  4. Use [[GraphicBuilder.finish]] to produce the finished [[RenderGraphic]].
 *
 * @note Most of the methods which add geometry to the builder take ownership of their inputs rather than cloning them.
 * So, for example, if you pass an array of points to addLineString(), you should not subsequently modify that array.
 *
 * @public
 */
export abstract class GraphicBuilder {
  /** @internal */
  protected readonly _options: BuilderOptions;

  /** @internal */
  protected constructor(options: GraphicBuilderOptions) {
    this._options = { ...options, placement: options.placement ?? Transform.createIdentity() };
    if (undefined === this._options.preserveOrder)
      this._options.preserveOrder = this.isOverlay || this.isViewBackground;
  }

  /** The local coordinate system transform applied to this builder's geometry.
   * @see [[GraphicBuilderOptions.placement]].
   */
  public get placement(): Transform {
    return this._options.placement;
  }
  public set placement(transform: Transform) {
    this._options.placement.setFrom(transform);
  }

  /** The viewport in which the resultant [[RenderGraphic]] will be drawn.
   * @see [[GraphicBuilderOptions.viewport]].
   */
  public get viewport(): Viewport {
    return this._options.viewport;
  }

  /** The type of graphic to be produced by this builder.
   * @see [[GraphicBuilderOptions.type]].
   */
  public get type(): GraphicType {
    return this._options.type;
  }

  /** The Id to be associated with the graphic for picking.
   * @see [[GraphicBuilderOptions.pickable]] for more options.
   */
  public get pickId(): Id64String | undefined {
    return this._options.pickable?.id;
  }
  public set pickId(id: Id64String | undefined) {
    if (id === this.pickId)
      return;

    if (undefined === id) {
      this._options.pickable = undefined;
      return;
    }

    if (!this._options.pickable)
      this._options.pickable = { id };
    else
      this._options.pickable.id = id;
  }

  /** If true, [[ViewState.getAspectRatioSkew]] will be taken into account when computing the level of detail for the produced graphics.
   * @see [[GraphicBuilderOptions.applyAspectRatioSkew]].
   */
  public get applyAspectRatioSkew(): boolean {
    return true === this._options.applyAspectRatioSkew;
  }
  public set applyAspectRatioSkew(apply: boolean) {
    this._options.applyAspectRatioSkew = apply;
  }

  /** If true, the order in which geometry is added to the builder is preserved.
   * @see [[GraphicBuilderOptions.preserveOrder]] for more details.
   */
  public get preserveOrder(): boolean {
    return true === this._options.preserveOrder;
  }
  public set preserveOrder(preserve: boolean) {
    this._options.preserveOrder = preserve;
  }

  /** Controls whether normals are generated for surfaces.
   * @note Normals are required for proper edge display, so they are always produced if [[wantEdges]] is `true`.
   * @see [[GraphicBuilderOptions.wantNormals]] for more details.
   */
  public get wantNormals(): boolean {
    return this._options.wantNormals ?? (this.wantEdges || this.type === GraphicType.Scene);
  }
  public set wantNormals(want: boolean) {
    this._options.wantNormals = want;
  }

  /** Controls whether edges are generated for surfaces.
   * @see [[GraphicBuilderOptions.generateEdges]] for more details.
   */
  public get wantEdges(): boolean {
    return this._options.generateEdges ?? (this.type === GraphicType.Scene && this.viewport.viewFlags.edgesRequired());
  }
  public set wantEdges(want: boolean) {
    this._options.generateEdges = want;
  }

  /** Whether the builder's geometry is defined in [[CoordSystem.View]] coordinates.
   * @see [[isWorldCoordinates]].
   */
  public get isViewCoordinates(): boolean {
    return this.type === GraphicType.ViewBackground || this.type === GraphicType.ViewOverlay;
  }

  /** Whether the builder's geometry is defined in [[CoordSystem.World]] coordinates.
   * @see [[isViewCoordinates]].
   */
  public get isWorldCoordinates(): boolean {
    return !this.isViewCoordinates;
  }

  /** True if the builder produces a graphic of [[GraphicType.Scene]]. */
  public get isSceneGraphic(): boolean {
    return this.type === GraphicType.Scene;
  }

  /** True if the builder produces a graphic of [[GraphicType.ViewBackground]]. */
  public get isViewBackground(): boolean {
    return this.type === GraphicType.ViewBackground;
  }

  /** True if the builder produces a graphic of [[GraphicType.WorldOverlay]] or [[GraphicType.ViewOerlay]]. */
  public get isOverlay(): boolean {
    return this.type === GraphicType.ViewOverlay || this.type === GraphicType.WorldOverlay;
  }

  /** The iModel of the [[Viewport]] in which the [[RenderGraphic]] is to be drawn. */
  public get iModel(): IModelConnection {
    return this.viewport.iModel;
  }

  /**
   * Processes the accumulated symbology and geometry to produce a renderable graphic.
   * This function can only be called once; after the [[RenderGraphic]] has been extracted the [[GraphicBuilder]] should no longer be used.
   */
  public abstract finish(): RenderGraphic;

  /** Sets the current active symbology for this builder. Any new geometry subsequently added to the builder will be drawn using the specified symbology.
   * @param graphicParams The symbology to apply to subsequent geometry.
   * @see [[GraphicBuilder.setSymbology]] for a convenient way to set common symbology options.
   */
  public abstract activateGraphicParams(graphicParams: GraphicParams): void;

  /**
   * Appends a 3d line string to the builder.
   * @param points Array of vertices in the line string.
   */
  public abstract addLineString(points: Point3d[]): void;

  /**
   * Appends a 2d line string to the builder.
   * @param points Array of vertices in the line string.
   * @param zDepth Z value in local coordinates to use for each point.
   */
  public abstract addLineString2d(points: Point2d[], zDepth: number): void;

  /**
   * Appends a 3d point string to the builder. The points are drawn disconnected, with a diameter in pixels defined by the builder's active [[GraphicParams.rasterWidth]].
   * @param points Array of vertices in the point string.
   */
  public abstract addPointString(points: Point3d[]): void;

  /**
   * Appends a 2d point string to the builder. The points are drawn disconnected, with a diameter in pixels defined by the builder's active [[GraphicParams.rasterWidth]].
   * @param points Array of vertices in the point string.
   * @param zDepth Z value in local coordinates to use for each point.
   */
  public abstract addPointString2d(points: Point2d[], zDepth: number): void;

  /**
   * Appends a closed 3d planar region to the builder.
   * @param points Array of vertices of the shape.
   */
  public abstract addShape(points: Point3d[]): void;

  /**
   * Appends a closed 2d region to the builder.
   * @param points Array of vertices of the shape.
   * @param zDepth Z value in local coordinates to use for each point.
   */
  public abstract addShape2d(points: Point2d[], zDepth: number): void;

  /**
   * Appends a 3d open arc or closed ellipse to the builder.
   * @param arc Description of the arc or ellipse.
   * @param isEllipse If true, and if the arc defines a full sweep, then draw as a closed ellipse instead of an arc.
   * @param filled If true, and isEllipse is also true, then draw ellipse filled.
   */
  public abstract addArc(arc: Arc3d, isEllipse: boolean, filled: boolean): void;

  /**
   * Appends a 2d open arc or closed ellipse to the builder.
   * @param arc Description of the arc or ellipse.
   * @param isEllipse If true, and if the arc defines a full sweep, then draw as a closed ellipse instead of an arc.
   * @param filled If true, and isEllipse is also true, then draw ellipse filled.
   * @param zDepth Z value in local coordinates to use for each point in the arc or ellipse.
   */
  public abstract addArc2d(ellipse: Arc3d, isEllipse: boolean, filled: boolean, zDepth: number): void;

  /** Append a 3d open path to the builder. */
  public abstract addPath(path: Path): void;

  /** Append a 3d planar region to the builder. */
  public abstract addLoop(loop: Loop): void;

  /** Append a [CurvePrimitive]($geometry-core) to the builder. */
  public addCurvePrimitive(curve: AnyCurvePrimitive): void {
    switch (curve.curvePrimitiveType) {
      case "lineString":
        this.addLineString(curve.points);
        break;
      case "lineSegment":
        this.addLineString([ curve.startPoint(), curve.endPoint() ]);
        break;
      case "arc":
        this.addArc(curve, false, false);
        break;
      default:
        const path = new Path();
        if (path.tryAddChild(curve))
          this.addPath(path);

        break;
    }
  }

  /** Append a mesh to the builder.
   * @param meshData Describes the mesh
   * @param filled If the mesh describes a planar region, indicates whether its interior area should be drawn with fill in [[RenderMode.Wireframe]].
   */
  public abstract addPolyface(meshData: Polyface, filled: boolean): void;

  /** Append a solid primitive to the builder. */
  public abstract addSolidPrimitive(solidPrimitive: SolidPrimitive): void;

  /** Append any primitive to the builder.
   * @param primitive The graphic primitive to append.
   */
  public addPrimitive(primitive: GraphicPrimitive): void {
    switch (primitive.type) {
      case "linestring":
        this.addLineString(primitive.points);
        break;
      case "linestring2d":
        this.addLineString2d(primitive.points, primitive.zDepth);
        break;
      case "pointstring":
        this.addPointString(primitive.points);
        break;
      case "pointstring2d":
        this.addPointString2d(primitive.points, primitive.zDepth);
        break;
      case "shape":
        this.addShape(primitive.points);
        break;
      case "shape2d":
        this.addShape2d(primitive.points, primitive.zDepth);
        break;
      case "arc":
        this.addArc(primitive.arc, true === primitive.isEllipse, true === primitive.filled);
        break;
      case "arc2d":
        this.addArc2d(primitive.arc, true === primitive.isEllipse, true === primitive.filled, primitive.zDepth);
        break;
      case "path":
        this.addPath(primitive.path);
        break;
      case "loop":
        this.addLoop(primitive.loop);
        break;
      case "polyface":
        this.addPolyface(primitive.polyface, true === primitive.filled);
        break;
      case "solidPrimitive":
        this.addSolidPrimitive(primitive.solidPrimitive);
        break;
    }
  }

  /** Add Range3d edges. Useful for debugging. */
  public addRangeBox(range: Range3d) {
    this.addFrustum(Frustum.fromRange(range));
  }

  /** Add Frustum edges. Useful for debugging. */
  public addFrustum(frustum: Frustum) {
    this.addRangeBoxFromCorners(frustum.points);
  }

  /** Add range edges from corner points */
  public addRangeBoxFromCorners(p: Point3d[]) {
    this.addLineString([
      p[Npc.LeftBottomFront],
      p[Npc.LeftTopFront],
      p[Npc.RightTopFront],
      p[Npc.RightBottomFront],
      p[Npc.RightBottomRear],
      p[Npc.RightTopRear],
      p[Npc.LeftTopRear],
      p[Npc.LeftBottomRear],
      p[Npc.LeftBottomFront].clone(),
      p[Npc.RightBottomFront].clone(),
    ]);

    this.addLineString([p[Npc.LeftTopFront].clone(), p[Npc.LeftTopRear].clone()]);
    this.addLineString([p[Npc.RightTopFront].clone(), p[Npc.RightTopRear].clone()]);
    this.addLineString([p[Npc.LeftBottomRear].clone(), p[Npc.RightBottomRear].clone()]);
  }

  /** Sets the current active symbology for this builder. Any new geometry subsequently added will be drawn using the specified symbology.
   * @param lineColor The color in which to draw lines.
   * @param fillColor The color in which to draw filled regions.
   * @param lineWidth The width in pixels to draw lines. The renderer will clamp this value to an integer in the range [1, 32].
   * @param linePixels The pixel pattern in which to draw lines.
   * @see [[GraphicBuilder.activateGraphicParams]] for additional symbology options.
   */
  public setSymbology(lineColor: ColorDef, fillColor: ColorDef, lineWidth: number, linePixels = LinePixels.Solid) {
    this.activateGraphicParams(GraphicParams.fromSymbology(lineColor, fillColor, lineWidth, linePixels));
  }

  /** Set the current active symbology for this builder to be a blanking fill before adding a planar region.
   * A planar region drawn with blanking fill renders behind other geometry in the same graphic.
   * Blanking fill is not affected by the fill [[ViewFlags]] being disabled.
   * An example would be to add a line to a graphic containing a shape with blanking fill so that the line is always shown in front of the fill.
   * @param fillColor The color in which to draw filled regions.
   */
  public setBlankingFill(fillColor: ColorDef) { this.activateGraphicParams(GraphicParams.fromBlankingFill(fillColor)); }
}
