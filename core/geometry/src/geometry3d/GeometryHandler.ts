/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module ArraysAndInterfaces
 */

import { AkimaCurve3d } from "../bspline/AkimaCurve3d";
import { BezierCurve3d } from "../bspline/BezierCurve3d";
import { BezierCurve3dH } from "../bspline/BezierCurve3dH";
import { BezierCurveBase } from "../bspline/BezierCurveBase";
import { BSplineCurve3d } from "../bspline/BSplineCurve";
import { BSplineCurve3dH } from "../bspline/BSplineCurve3dH";
import { BSplineSurface3d, BSplineSurface3dH } from "../bspline/BSplineSurface";
import { InterpolationCurve3d } from "../bspline/InterpolationCurve3d";
import { Arc3d } from "../curve/Arc3d";
import { CoordinateXYZ } from "../curve/CoordinateXYZ";
import { BagOfCurves, CurveCollection } from "../curve/CurveCollection";
import { CurvePrimitive } from "../curve/CurvePrimitive";
import { GeometryQuery } from "../curve/GeometryQuery";
import { LineSegment3d } from "../curve/LineSegment3d";
import { LineString3d } from "../curve/LineString3d";
import { Loop } from "../curve/Loop";
import { ParityRegion } from "../curve/ParityRegion";
import { Path } from "../curve/Path";
import { PointString3d } from "../curve/PointString3d";
import { TransitionSpiral3d } from "../curve/spiral/TransitionSpiral3d";
import { UnionRegion } from "../curve/UnionRegion";
import { IndexedPolyface } from "../polyface/Polyface";
import { Box } from "../solid/Box";
import { Cone } from "../solid/Cone";
import { LinearSweep } from "../solid/LinearSweep";
import { RotationalSweep } from "../solid/RotationalSweep";
import { RuledSweep } from "../solid/RuledSweep";
import { Sphere } from "../solid/Sphere";
import { TorusPipe } from "../solid/TorusPipe";
import { Plane3dByOriginAndVectors } from "./Plane3dByOriginAndVectors";
import { Vector2d } from "./Point2dVector2d";
import { Point3d, Vector3d } from "./Point3dVector3d";

/**
 * * `GeometryHandler` defines the base abstract methods for double-dispatch geometry computation.
 * * User code that wants to handle one or all of the commonly known geometry types implements a handler class.
 * * User code that does not handle all types is most likely to start with `NullGeometryHandler`, which will provide no-action implementations for all types.
 * @public
 */
export abstract class GeometryHandler {
  /** handle strongly typed [[LineSegment3d]] */
  public abstract handleLineSegment3d(g: LineSegment3d): any;
  /** handle strongly typed  [[LineString3d]]  */
  public abstract handleLineString3d(g: LineString3d): any;
  /** handle strongly typed  [[Arc3d]]  */
  public abstract handleArc3d(g: Arc3d): any;
  /** handle strongly typed  [[CurveCollection]]  */
  public handleCurveCollection(_g: CurveCollection): any { }
  /** handle strongly typed  [[BSplineCurve3d]]  */
  public abstract handleBSplineCurve3d(g: BSplineCurve3d): any;
  /** handle strongly typed  [[InterpolationCurve3d]]  */
  public abstract handleInterpolationCurve3d(g: InterpolationCurve3d): any;
  /** handle strongly typed  [[AkimaCurve3d]]  */
  public abstract handleAkimaCurve3d(g: AkimaCurve3d): any;
  /** handle strongly typed  [[BSplineCurve3dH]]  */
  public abstract handleBSplineCurve3dH(g: BSplineCurve3dH): any;
  /** handle strongly typed  [[BSplineSurface3d]]  */
  public abstract handleBSplineSurface3d(g: BSplineSurface3d): any;
  /** handle strongly typed  [[CoordinateXYZ]]  */
  public abstract handleCoordinateXYZ(g: CoordinateXYZ): any;
  /** handle strongly typed  [[BSplineSurface3dH]]  */
  public abstract handleBSplineSurface3dH(g: BSplineSurface3dH): any;
  /** handle strongly typed  [[IndexedPolyface]]  */
  public abstract handleIndexedPolyface(g: IndexedPolyface): any;
  /** handle strongly typed [[TransitionSpiral3d]]
   * @alpha
   */
  public abstract handleTransitionSpiral(g: TransitionSpiral3d): any;

  /** handle strongly typed Path (base class method calls handleCurveCollection) */
  public handlePath(g: Path): any { return this.handleCurveCollection(g); }
  /** handle strongly typed  Loop (base class method calls handleCurveCollection) */
  public handleLoop(g: Loop): any { return this.handleCurveCollection(g); }
  /** handle strongly typed  ParityRegion (base class method calls handleCurveCollection) */
  public handleParityRegion(g: ParityRegion): any { return this.handleCurveCollection(g); }
  /** handle strongly typed  UnionRegion (base class method calls handleCurveCollection) */
  public handleUnionRegion(g: UnionRegion): any { return this.handleCurveCollection(g); }
  /** handle strongly typed  BagOfCurves (base class method calls handleCurveCollection) */
  public handleBagOfCurves(g: BagOfCurves): any { return this.handleCurveCollection(g); }
  /** handle strongly typed  BagOfCurves (base class method calls handleCurveCollection) */
  /** handle strongly typed  Sphere */
  public abstract handleSphere(g: Sphere): any;
  /** handle strongly typed  Cone */
  public abstract handleCone(g: Cone): any;
  /** handle strongly typed  Box */
  public abstract handleBox(g: Box): any;
  /** handle strongly typed  TorusPipe */
  public abstract handleTorusPipe(g: TorusPipe): any;
  /** handle strongly typed  LinearSweep */
  public abstract handleLinearSweep(g: LinearSweep): any;
  /** handle strongly typed  RotationalSweep */
  public abstract handleRotationalSweep(g: RotationalSweep): any;
  /** handle strongly typed  RuledSweep */
  public abstract handleRuledSweep(g: RuledSweep): any;
  /** handle strongly typed  PointString3d */
  public abstract handlePointString3d(g: PointString3d): any;
  /** handle strongly typed  BezierCurve3d */
  public abstract handleBezierCurve3d(g: BezierCurve3d): any;
  /** handle strongly typed  BezierCurve3dH */
  public abstract handleBezierCurve3dH(g: BezierCurve3dH): any;
}
/**
 * `NullGeometryHandler` is a base class for dispatching various geometry types to
 * application specific implementation of some service.
 *
 * To use:
 * * Derive a class from `NullGeometryHandler`
 * * Reimplement any or all of the specific `handleXXXX` methods
 * * Create a handler instance `myHandler`
 * * To send a `GeometryQuery` object `candidateGeometry` through the (fast) dispatch, invoke   `candidateGeometry.dispatchToHandler (myHandler)
 * * The appropriate method or methods will get called with a strongly typed `_g ` value.
 * @public
 */
export class NullGeometryHandler extends GeometryHandler {
  /** no-action implementation */
  public handleLineSegment3d(_g: LineSegment3d): any { return undefined; }
  /** no-action implementation */
  public handleLineString3d(_g: LineString3d): any { return undefined; }
  /** no-action implementation */
  public handleArc3d(_g: Arc3d): any { return undefined; }
  /** no-action implementation */
  public override handleCurveCollection(_g: CurveCollection): any { return undefined; }
  /** no-action implementation */
  public handleBSplineCurve3d(_g: BSplineCurve3d): any { return undefined; }
  /** no-action implementation */
  public handleInterpolationCurve3d(_g: InterpolationCurve3d): any { return undefined; }
  /** no-action implementation */
  public handleAkimaCurve3d(_g: AkimaCurve3d): any { return undefined; }
  /** no-action implementation */
  public handleBSplineCurve3dH(_g: BSplineCurve3dH): any { return undefined; }
  /** no-action implementation */
  public handleBSplineSurface3d(_g: BSplineSurface3d): any { return undefined; }

  /** no-action implementation */
  public handleCoordinateXYZ(_g: CoordinateXYZ): any { return undefined; }
  /** no-action implementation */
  public handleBSplineSurface3dH(_g: BSplineSurface3dH): any { return undefined; }
  /** no-action implementation */
  public handleIndexedPolyface(_g: IndexedPolyface): any { return undefined; }
  /** no-action implementation
   * @alpha
   */
  public handleTransitionSpiral(_g: TransitionSpiral3d): any { return undefined; }

  /** no-action implementation */
  public override handlePath(_g: Path): any { return undefined; }
  /** no-action implementation */
  public override handleLoop(_g: Loop): any { return undefined; }
  /** no-action implementation */
  public override handleParityRegion(_g: ParityRegion): any { return undefined; }
  /** no-action implementation */
  public override handleUnionRegion(_g: UnionRegion): any { return undefined; }
  /** no-action implementation */
  public override handleBagOfCurves(_g: BagOfCurves): any { return undefined; }

  /** no-action implementation */
  public handleSphere(_g: Sphere): any { return undefined; }
  /** no-action implementation */
  public handleCone(_g: Cone): any { return undefined; }
  /** no-action implementation */
  public handleBox(_g: Box): any { return undefined; }
  /** no-action implementation */
  public handleTorusPipe(_g: TorusPipe): any { return undefined; }
  /** no-action implementation */
  public handleLinearSweep(_g: LinearSweep): any { return undefined; }
  /** no-action implementation */
  public handleRotationalSweep(_g: RotationalSweep): any { return undefined; }
  /** no-action implementation */
  public handleRuledSweep(_g: RuledSweep): any { return undefined; }
  /** no-action implementation */
  public handlePointString3d(_g: PointString3d): any { return undefined; }
  /** no-action implementation */
  public handleBezierCurve3d(_g: BezierCurve3d): any { return undefined; }
  /** no-action implementation */
  public handleBezierCurve3dH(_g: BezierCurve3dH): any { return undefined; }
}
/**
 * Implement GeometryHandler methods, with all curve collection methods recursing to children.
 * @public
 */
export class RecurseToCurvesGeometryHandler extends GeometryHandler {
  /** no-action implementation */
  public handleLineSegment3d(_g: LineSegment3d): any { return undefined; }
  /** no-action implementation */
  public handleLineString3d(_g: LineString3d): any { return undefined; }
  /** no-action implementation */
  public handleArc3d(_g: Arc3d): any { return undefined; }
  /** no-action implementation */
  public handleBSplineCurve3d(_g: BSplineCurve3d): any { return undefined; }
  /** no-action implementation */
  public handleInterpolationCurve3d(_g: InterpolationCurve3d): any { return undefined; }
  /** no-action implementation */
  public handleAkimaCurve3d(_g: AkimaCurve3d): any { return undefined; }
  /** no-action implementation */
  public handleBSplineCurve3dH(_g: BSplineCurve3dH): any { return undefined; }
  /** no-action implementation */
  public handleBSplineSurface3d(_g: BSplineSurface3d): any { return undefined; }

  /** no-action implementation */
  public handleCoordinateXYZ(_g: CoordinateXYZ): any { return undefined; }
  /** no-action implementation */
  public handleBSplineSurface3dH(_g: BSplineSurface3dH): any { return undefined; }
  /** no-action implementation */
  public handleIndexedPolyface(_g: IndexedPolyface): any { return undefined; }
  /** no-action implementation
   * @alpha
   */
  public handleTransitionSpiral(_g: TransitionSpiral3d): any { return undefined; }
  /** Invoke `child.dispatchToGeometryHandler(this)` for each child in the array returned by the query `g.children` */
  public handleChildren(g: GeometryQuery): any {
    const children = g.children;
    if (children)
      for (const child of children) {
        child.dispatchToGeometryHandler(this);
      }
  }
  /** Recurse to children */
  public override handleCurveCollection(g: CurveCollection): any { return this.handleChildren(g); }

  /** Recurse to children */
  public override handlePath(g: Path): any { return this.handleChildren(g); }
  /** Recurse to children */
  public override handleLoop(g: Loop): any { return this.handleChildren(g); }
  /** Recurse to children */
  public override handleParityRegion(g: ParityRegion): any { return this.handleChildren(g); }
  /** Recurse to children */
  public override handleUnionRegion(g: UnionRegion): any { return this.handleChildren(g); }
  /** Recurse to children */
  public override handleBagOfCurves(g: BagOfCurves): any { return this.handleChildren(g); }

  /** no-action implementation */
  public handleSphere(_g: Sphere): any { return undefined; }
  /** no-action implementation */
  public handleCone(_g: Cone): any { return undefined; }
  /** no-action implementation */
  public handleBox(_g: Box): any { return undefined; }
  /** no-action implementation */
  public handleTorusPipe(_g: TorusPipe): any { return undefined; }
  /** no-action implementation */
  public handleLinearSweep(_g: LinearSweep): any { return undefined; }
  /** no-action implementation */
  public handleRotationalSweep(_g: RotationalSweep): any { return undefined; }
  /** no-action implementation */
  public handleRuledSweep(_g: RuledSweep): any { return undefined; }
  /** no-action implementation */
  public handlePointString3d(_g: PointString3d): any { return undefined; }
  /** no-action implementation */
  public handleBezierCurve3d(_g: BezierCurve3d): any { return undefined; }
  /** no-action implementation */
  public handleBezierCurve3dH(_g: BezierCurve3dH): any { return undefined; }
}

/** IStrokeHandler is an interface with methods to receive data about curves being stroked.
 * CurvePrimitives emitStrokes () methods emit calls to a handler object with these methods.
 * The various CurvePrimitive types are free to announce either single points (announcePoint), linear fragments,
 * or fractional intervals of the parent curve.
 * * handler.startCurvePrimitive (cp) -- announce the curve primitive whose strokes will follow.
 * * announcePointTangent (xyz, fraction, tangent) -- announce a single point on the curve.
 * * announceIntervalForUniformStepStrokes (cp, numStrokes, fraction0, fraction1) -- announce a fraction
 * interval in which the curve can be evaluated (e.g. the handler can call cp->fractionToPointAndDerivative ())
 * * announceSegmentInterval (cp, point0, point1, numStrokes, fraction0, fraction1) -- announce
 *    that the fractional interval fraction0, fraction1 is a straight line which should be broken into
 *    numStrokes strokes.
 *   * A LineSegment would make a single call to this.
 *   * A LineString would make one call to this for each of its segments, with fractions indicating position
 * within the linestring.
 * * endCurvePrimitive (cp) -- announce the end of the curve primitive.
 * @public
 */
export interface IStrokeHandler {
  /** announce a parent curve primitive
   * * startParentCurvePrimitive() ...endParentCurvePrimitive() are wrapped around startCurvePrimitive and endCurvePrimitive when the interior primitive is a proxy.
   */
  startParentCurvePrimitive(cp: CurvePrimitive): void;
  /** Announce the curve primitive that will be described in subsequent calls. */
  startCurvePrimitive(cp: CurvePrimitive): void;
  /**
   * announce a single point with its fraction and tangent.
   * * (IMPORTANT) the same Point3d and Vector3d will be reset and passed on multiple calls.
   * * (THEREFORE) if the implementation is saving coordinates, it must copy the xyz data out into its own data structure rather than save the references.
   */
  announcePointTangent(xyz: Point3d, fraction: number, tangent: Vector3d): void;

  /** Announce that curve primitive cp should be evaluated in the specified fraction interval. */
  announceIntervalForUniformStepStrokes(
    cp: CurvePrimitive,
    numStrokes: number,
    fraction0: number,
    fraction1: number): void;
  /** Announce numPoints interpolated between point0 and point1, with associated fractions */
  announceSegmentInterval(
    cp: CurvePrimitive,
    point0: Point3d,
    point1: Point3d,
    numStrokes: number,
    fraction0: number,
    fraction1: number): void;
  /** Announce that all data about `cp` has been announced. */
  endCurvePrimitive(cp: CurvePrimitive): void;
  /** Announce that all data about the parent primitive has been announced. */
  endParentCurvePrimitive(cp: CurvePrimitive): void;
  /**
   * Announce a bezier curve fragment.
   * * this is usually a section of BsplineCurve
   * * If this function is missing, the same interval will be passed to announceIntervalForUniformSteps.
   * @param bezier bezier fragment
   * @param numStrokes suggested number of strokes (uniform in bezier interval 0..1)
   * @param parent parent curve
   * @param spanIndex spanIndex within parent
   * @param fraction0 start fraction on parent curve
   * @param fraction1 end fraction on parent curve
   */
  announceBezierCurve?(
    bezier: BezierCurveBase,
    numStrokes: number,
    parent: CurvePrimitive,
    spandex: number,
    fraction0: number,
    fraction1: number): void;
}

/**
 * Interface with methods for mapping (u,v) fractional coordinates to surface xyz and derivatives.
 * @public
 */
export interface UVSurface {
  /**
   * Convert fractional u and v coordinates to surface point
   * @param uFraction fractional coordinate in u direction
   * @param vFraction fractional coordinate in the v direction
   * @param result optional pre-allocated point
   */
  uvFractionToPoint(uFraction: number, vFraction: number, result?: Point3d): Point3d;
  /**
   * Convert fractional u and v coordinates to surface point and in-surface tangent directions.
   * * Remark: the vectors are expected to be non-zero tangents which can be crossed to get a normal.
   * * Hence the are NOT precisely either (a) partial derivatives or (b) frenet vectors
   * @param uFraction fractional coordinate in u direction
   * @param vFraction fractional coordinate in the v direction
   * @param result optional pre-allocated carrier for point and vectors
   */
  uvFractionToPointAndTangents(uFraction: number, vFraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
}
/**
 * Interface for queries of distance-along in u and v directions
 * @public
 */
export interface UVSurfaceIsoParametricDistance {
  /**
   * * Return a vector whose x and y parts are "size" of the surface in the u and v directions.
   * * Sizes are use for applying scaling to mesh parameters
   * * These sizes are (reasonable approximations of) the max curve length along u and v isoparameter lines.
   *   * e.g. for a sphere, these are:
   *      * u direction = distance around the equator
   *      * v direction = distance from south pole to north pole.
   */
  maxIsoParametricDistance(): Vector2d;
}
